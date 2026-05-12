"""Профиль пользователя: онбординг, настройки, статистика."""
from __future__ import annotations

import sqlite3

from flask import Blueprint, request, jsonify

from database import get_db, ensure_schema_migrations
from services import resolve_user_id, NotFoundError
from food_categories import classify_product, CATEGORIES
from budget_policy import TIER_PRESET_RUB, DEFAULT_WEEKLY_RUB, UNLIMITED_DB_RUB

profile_bp = Blueprint("profile", __name__)

# Шесть тем для «Питание за неделю» (только продуктовые группы; без отдельной строки «закупки»).
#
# Деньги: (1) shopping_list is_purchased=1 — classify_product(display_name);
# (2) shopping_spend_lines — позиции при «Завершить закупку», те же правила по названию;
# (3) хвост shopping_spend_log без строк позиций → other (в теме «Орехи, бакалея…»).
PROFILE_SPEND_THEMES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("meat_fish", "Мясо и рыба", ("meat_fish",)),
    ("dairy_cheese", "Молочка и сыр", ("dairy",)),
    ("vegetables", "Овощи", ("vegetables",)),
    ("fruits", "Фрукты и ягоды", ("fruits",)),
    ("grains", "Крупы и хлеб", ("grains",)),
    # Внутри food_categories сюда же попадают орехи, чай, специи (ключ fats_sauces) и всё «прочее» + хвост старых сумм без позиций
    ("pantry", "Орехи, бакалея, соусы и прочее", ("fats_sauces", "other")),
)


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


def _user_row_looks_onboarded(d: dict) -> bool:
    """Есть минимальные данные профиля — считаем онбординг пройденным (миграции / старые БД)."""
    if (d.get("name") or "").strip():
        return True
    try:
        if float(d.get("weight") or 0) > 0:
            return True
    except (TypeError, ValueError):
        pass
    try:
        if float(d.get("height") or 0) > 0:
            return True
    except (TypeError, ValueError):
        pass
    try:
        if int(d.get("age") or 0) > 0:
            return True
    except (TypeError, ValueError):
        pass
    return False


def _budget_from_payload(data: dict) -> tuple[float | None, str | None, float | None]:
    """Возвращает (budget_weekly, budget_tier, budget_custom)."""
    tier = (data.get("budget") or data.get("budget_tier") or "").strip().lower()
    custom_amt = data.get("budget_custom")
    bw = data.get("budget_weekly")

    if tier == "economy":
        return TIER_PRESET_RUB["economy"], "economy", None
    if tier == "medium":
        return TIER_PRESET_RUB["medium"], "medium", None
    if tier == "unlimited":
        return UNLIMITED_DB_RUB, "unlimited", None
    if tier == "custom":
        try:
            v = float(custom_amt) if custom_amt is not None else float(bw or 0)
        except (TypeError, ValueError):
            v = DEFAULT_WEEKLY_RUB
        return max(0.0, v), "custom", v
    if bw is not None:
        try:
            return float(bw), tier or None, float(custom_amt) if custom_amt is not None else None
        except (TypeError, ValueError):
            pass
    return DEFAULT_WEEKLY_RUB, "medium", None


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
    d0 = dict(row)
    done = int(d0.get("onboarding_completed") or 0) == 1
    if not done and _user_row_looks_onboarded(d0):
        try:
            conn.execute(
                "UPDATE users SET onboarding_completed = 1 WHERE id = ?",
                (internal_id,),
            )
            conn.commit()
            done = True
        except sqlite3.OperationalError:
            # Старая БД без колонки — не блокируем GET; миграция добавит её при старте приложения.
            conn.rollback()
            done = True

    training = _collect_training(conn, internal_id)
    excluded = _collect_prefs(conn, internal_id)
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
    ensure_schema_migrations(conn)
    conn.commit()

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

    # 2b. Позиции завершённых закупок (после «Завершить») — разбивка по тем же правилам, что и список
    rows_lines = conn.execute(
        """
        SELECT product_name AS product_name, amount_rub AS cost
        FROM shopping_spend_lines
        WHERE user_id = ?
          AND COALESCE(amount_rub, 0) > 0
          AND date(COALESCE(created_at, '1970-01-01')) >= date('now', '-7 days')
        """,
        (internal_id,),
    ).fetchall()

    # 2c. Старые суммы «за поездку» без позиций (до shopping_spend_lines)
    row_log = conn.execute(
        """
        SELECT COALESCE(SUM(amount), 0) AS trip_total
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

    lines_total = 0.0
    for row in rows_lines:
        name = row["product_name"] or ""
        cost = float(row["cost"] or 0)
        lines_total += cost
        cat = classify_product(name)
        category_totals[cat] = category_totals.get(cat, 0.0) + cost
        total_spend += cost

    trip_log_total = float(row_log["trip_total"] or 0) if row_log else 0.0
    orphan = max(0.0, trip_log_total - lines_total)
    if orphan > 0:
        category_totals["other"] = category_totals.get("other", 0.0) + orphan
        total_spend += orphan

    # Темы «Питание за неделю»: фиксированный порядок, только ненулевые суммы
    spend_by_category: list[dict] = []
    for theme_key, theme_label, internal_keys in PROFILE_SPEND_THEMES:
        amt = sum(category_totals.get(k, 0.0) for k in internal_keys)
        if amt > 0:
            spend_by_category.append(
                {"key": theme_key, "label": theme_label, "amount": round(amt)}
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