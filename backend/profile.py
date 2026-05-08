"""Профиль пользователя: онбординг, настройки, статистика."""
from __future__ import annotations

from flask import Blueprint, request, jsonify

from database import get_db
from services import resolve_user_id, NotFoundError
from food_categories import classify_product, CATEGORIES

profile_bp = Blueprint("profile", __name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_row_by_telegram(conn, telegram_id: int):
    return conn.execute(
        "SELECT * FROM users WHERE telegram_id = ?", (telegram_id,)
    ).fetchone()


def _row_to_profile_dict(row, exists: bool, training_days: list, excluded: list) -> dict:
    if not row:
        return {"exists": exists}
    d = dict(row)
    return {
        "exists":            exists,
        "name":              d.get("name"),
        "age":               d.get("age"),
        "weight":            d.get("weight"),
        "height":            d.get("height"),
        "goal":              d.get("goal") or "recomposition",
        "goal_custom":       d.get("goal_custom"),
        "budget_tier":       d.get("budget_tier"),
        "budget_weekly":     d.get("budget_weekly"),
        "budget_custom":     d.get("budget_custom"),
        "wake_time":         d.get("wake_time") or "08:00",
        "sleep_time":        d.get("sleep_time") or "23:00",
        "training_days":     training_days,
        "excluded_foods":    excluded,
        "kitchen_type":      d.get("kitchen_type"),
        "shopping_list_mode": d.get("shopping_list_mode"),
    }


def _collect_prefs(conn, internal_id: int) -> list[str]:
    rows = conn.execute(
        """SELECT product_name FROM food_preferences
           WHERE user_id = ? AND preference_type = 'exclude'
           ORDER BY id""",
        (internal_id,),
    ).fetchall()
    return [r["product_name"] for r in rows]


def _collect_training(conn, internal_id: int) -> list[int]:
    rows = conn.execute(
        "SELECT day_of_week FROM training_days WHERE user_id = ? ORDER BY day_of_week",
        (internal_id,),
    ).fetchall()
    return [int(r["day_of_week"]) for r in rows]


def _budget_from_payload(data: dict) -> tuple[float | None, str | None, float | None]:
    """Возвращает (budget_weekly, budget_tier, budget_custom)."""
    tier = (data.get("budget") or data.get("budget_tier") or "").strip().lower()
    custom_amt = data.get("budget_custom")
    bw = data.get("budget_weekly")

    if tier == "economy":
        return 1500.0, "economy", None
    if tier == "medium":
        return 2500.0, "medium", None
    if tier == "unlimited":
        return 50000.0, "unlimited", None
    if tier == "custom":
        try:
            v = float(custom_amt) if custom_amt is not None else float(bw or 0)
        except (TypeError, ValueError):
            v = 2000.0
        return max(0.0, v), "custom", v
    if bw is not None:
        try:
            return float(bw), tier or None, float(custom_amt) if custom_amt is not None else None
        except (TypeError, ValueError):
            pass
    return 2500.0, "medium", None


# ── GET /api/profile ──────────────────────────────────────────────────────────

@profile_bp.route("/api/profile", methods=["GET"])
def get_profile():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400
    try:
        tid = int(user_id)
    except (TypeError, ValueError):
        return jsonify({"error": "user_id должен быть числом"}), 400

    conn = get_db()
    row = _user_row_by_telegram(conn, tid)
    if not row:
        conn.close()
        return jsonify({"exists": False})

    internal_id = row["id"]
    training = _collect_training(conn, internal_id)
    excluded = _collect_prefs(conn, internal_id)
    done = int(row["onboarding_completed"] or 0) == 1
    conn.close()

    if not done:
        return jsonify(_row_to_profile_dict(row, False, training, excluded))
    return jsonify(_row_to_profile_dict(row, True, training, excluded))


# ── PUT /api/profile ──────────────────────────────────────────────────────────

@profile_bp.route("/api/profile", methods=["PUT"])
def put_profile():
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400
    try:
        tid = int(user_id)
    except (TypeError, ValueError):
        return jsonify({"error": "user_id должен быть числом"}), 400

    name = (data.get("name") or "").strip() or None
    try:
        age = int(data["age"]) if data.get("age") is not None else None
    except (TypeError, ValueError):
        age = None
    try:
        weight = float(data["weight"]) if data.get("weight") is not None else None
    except (TypeError, ValueError):
        weight = None
    try:
        height = float(data["height"]) if data.get("height") is not None else None
    except (TypeError, ValueError):
        height = None

    goal = (data.get("goal") or "recomposition").strip()
    if goal not in ("recomposition", "mass_gain", "cutting", "custom"):
        goal = "recomposition"

    # Своя цель: передаём goal_custom как есть, независимо от пресета.
    # Если goal == "custom" — goal_custom обязателен и идёт в AI напрямую.
    # Если goal != "custom" — goal_custom сохраняем как пометку, но в AI идёт пресет.
    goal_custom = (data.get("goal_custom") or "").strip() or None

    bw, budget_tier, budget_custom = _budget_from_payload(data)

    wake  = (data.get("wake_time")  or "08:00").strip() or "08:00"
    sleep = (data.get("sleep_time") or "23:00").strip() or "23:00"

    kitchen = (data.get("kitchen_type") or "").strip() or None
    if kitchen and kitchen not in ("home", "mixed", "out"):
        kitchen = "home"

    raw_td = data.get("training_days") or []
    if not isinstance(raw_td, list):
        raw_td = []
    training_days = []
    for x in raw_td:
        try:
            v = int(x)
            if 0 <= v <= 6:
                training_days.append(v)
        except (TypeError, ValueError):
            continue

    excluded = data.get("excluded_foods") or []
    if not isinstance(excluded, list):
        excluded = []
    excluded = [str(x).strip() for x in excluded if str(x).strip()]

    conn = get_db()
    row = _user_row_by_telegram(conn, tid)

    if row:
        internal_id = row["id"]
        conn.execute(
            """
            UPDATE users SET
                name          = COALESCE(?, name),
                age           = COALESCE(?, age),
                weight        = COALESCE(?, weight),
                height        = COALESCE(?, height),
                goal          = ?,
                goal_custom   = ?,
                budget_weekly = ?,
                budget_tier   = ?,
                budget_custom = ?,
                kitchen_type  = COALESCE(?, kitchen_type),
                wake_time     = ?,
                sleep_time    = ?,
                onboarding_completed = 1
            WHERE id = ?
            """,
            (
                name, age, weight, height,
                goal, goal_custom,
                bw, budget_tier, budget_custom,
                kitchen,
                wake, sleep,
                internal_id,
            ),
        )
    else:
        cur = conn.execute(
            """
            INSERT INTO users (
                telegram_id, name, age, weight, height,
                goal, goal_custom,
                budget_weekly, budget_tier, budget_custom,
                kitchen_type, wake_time, sleep_time,
                onboarding_completed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                tid,
                name or "Пользователь",
                age or 25,
                weight or 75,
                height or 175,
                goal, goal_custom,
                bw, budget_tier, budget_custom,
                kitchen,
                wake, sleep,
            ),
        )
        internal_id = cur.lastrowid

    conn.execute("DELETE FROM training_days WHERE user_id = ?", (internal_id,))
    for dow in training_days:
        conn.execute(
            "INSERT INTO training_days (user_id, day_of_week) VALUES (?, ?)",
            (internal_id, dow),
        )

    conn.execute(
        "DELETE FROM food_preferences WHERE user_id = ? AND preference_type = 'exclude'",
        (internal_id,),
    )
    for pname in excluded:
        conn.execute(
            """INSERT INTO food_preferences (user_id, product_name, preference_type)
               VALUES (?, ?, 'exclude')""",
            (internal_id, pname),
        )

    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


# ── GET /api/profile/stats ────────────────────────────────────────────────────

@profile_bp.route("/api/profile/stats", methods=["GET"])
def get_profile_stats():
    """
    Статистика профиля за последние 7 дней:
    - средние КБЖУ (из consumed_meals)
    - расходы по категориям: строки shopping_list с is_purchased=1 (устар.);
      завершённые поездки учитываются из shopping_spend_log (По списку покупок).

    Категории определяются статическим словарём (food_categories.py), без AI.
    """
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400
    try:
        tid = int(user_id)
    except (TypeError, ValueError):
        return jsonify({"error": "user_id должен быть числом"}), 400

    conn = get_db()
    row = _user_row_by_telegram(conn, tid)
    if not row:
        conn.close()
        return jsonify({"error": "Пользователь не найден"}), 404

    stats = _calc_stats(conn, row["id"])
    conn.close()
    return jsonify(stats)


def _calc_stats(conn, internal_id: int) -> dict:
    """Вычисляет статистику без AI — только SQL + словарь категорий."""

    # 1. Средние КБЖУ за последние 7 дней из дневника
    rows_kcal = conn.execute(
        """
        SELECT
            plan_date,
            SUM(total_kcal)    AS day_kcal,
            SUM(total_protein) AS day_protein,
            SUM(total_fat)     AS day_fat,
            SUM(total_carbs)   AS day_carbs
        FROM consumed_meals
        WHERE user_id = ?
          AND plan_date >= date('now', '-7 days')
        GROUP BY plan_date
        ORDER BY plan_date DESC
        """,
        (internal_id,),
    ).fetchall()

    days_count = len(rows_kcal)
    if days_count > 0:
        avg_kcal    = round(sum(r["day_kcal"]    or 0 for r in rows_kcal) / days_count)
        avg_protein = round(sum(r["day_protein"] or 0 for r in rows_kcal) / days_count)
        avg_fat     = round(sum(r["day_fat"]     or 0 for r in rows_kcal) / days_count)
        avg_carbs   = round(sum(r["day_carbs"]   or 0 for r in rows_kcal) / days_count)
    else:
        avg_kcal = avg_protein = avg_fat = avg_carbs = 0

    # 2a. Строки списка, явно отмеченные купленными (legacy; сейчас чаще пусто)
    rows_spend = conn.execute(
        """
        SELECT display_name AS product_name, estimated_cost AS cost
        FROM shopping_list
        WHERE user_id = ?
          AND is_purchased = 1
          AND estimated_cost > 0
          AND created_at >= date('now', '-7 days')
        """,
        (internal_id,),
    ).fetchall()

    # 2b. Завершённые закупки: POST /api/shopping/complete пишет сюда и удаляет shopping_list
    row_log = conn.execute(
        """
        SELECT SUM(amount) AS trip_total
        FROM shopping_spend_log
        WHERE user_id = ?
          AND COALESCE(amount, 0) > 0
          AND date(COALESCE(created_at, '1970-01-01')) >= date('now', '-7 days')
        """,
        (internal_id,),
    ).fetchone()

    category_totals: dict[str, float] = {k: 0.0 for k in CATEGORIES}
    total_spend = 0.0

    for row in rows_spend:
        name = row["product_name"] or ""
        cost = float(row["cost"] or 0)
        cat  = classify_product(name)
        category_totals[cat] = category_totals.get(cat, 0.0) + cost
        total_spend += cost

    trip_total = float(row_log["trip_total"] or 0) if row_log else 0.0
    if trip_total > 0:
        category_totals["grocery_trips"] += trip_total
        total_spend += trip_total

    # Только непустые категории, отсортированные по убыванию суммы
    spend_by_category = sorted(
        [
            {"key": k, "label": CATEGORIES[k], "amount": round(category_totals[k])}
            for k in CATEGORIES
            if category_totals[k] > 0
        ],
        key=lambda x: x["amount"],
        reverse=True,
    )

    return {
        "avg_kcal":           avg_kcal,
        "avg_protein":        avg_protein,
        "avg_fat":            avg_fat,
        "avg_carbs":          avg_carbs,
        "days_tracked":       days_count,
        "spend_total":        round(total_spend),
        "spend_by_category":  spend_by_category,
    }