from flask import Blueprint, request, jsonify
from database import get_db
from deepseek import generate_weekly_plan, analyze_meal_description
from datetime import datetime, timedelta
import json
from services import resolve_user_id, find_product_id, NotFoundError
from planner_engine import build_planning_context
from shopping_service import rebuild_shopping_list
from dates_util import today_msk, today_msk_iso, parse_iso_date, iso, add_days

plan_bp = Blueprint("plan", __name__)


def _user_dict(row):
    return dict(row) if row else {}


def _enrich_preferences(base_prefs: str, user: dict) -> str:
    parts = [base_prefs] if base_prefs else []
    kt = user.get("kitchen_type")
    if kt:
        kt_map = {
            "home": "простая домашняя кухня",
            "mixed": "иногда рестораны",
            "out": "часто ем вне дома",
        }
        parts.append(f"Тип кухни: {kt_map.get(kt, kt)}")
    if user.get("budget_tier"):
        parts.append(f"Сегмент бюджета: {user['budget_tier']}")
    return ", ".join(p for p in parts if p)


def _ordered_days_from_response(week_plan: dict) -> list:
    wp = week_plan.get("week_plan") or {}
    return [v for _, v in wp.items()]


def _clear_reservations_for_dates(conn, internal_user_id: int, dates_iso: list[str]):
    if not dates_iso:
        return
    ph = ",".join("?" * len(dates_iso))
    conn.execute(
        f"DELETE FROM reservations WHERE user_id = ? AND plan_date IN ({ph})",
        [internal_user_id, *dates_iso],
    )


def _persist_one_day(
    conn,
    *,
    internal_user_id: int,
    user_internal_row_id: int,
    plan_date_iso: str,
    day_data: dict,
    explanations_by_date: dict,
    targets_by_date: dict,
):
    target_day = targets_by_date.get(plan_date_iso, {})
    deterministic_day_type = "training" if target_day.get("is_training") else "rest"
    meals = day_data.get("meals") or []
    for meal in meals:
        meal["decision_why"] = explanations_by_date.get(plan_date_iso, "")

    conn.execute(
        """
        INSERT OR REPLACE INTO meal_plan
        (user_id, plan_date, day_type, meals_json, daily_kcal, daily_protein, daily_fat, daily_carbs, daily_cost, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """,
        (
            user_internal_row_id,
            plan_date_iso,
            deterministic_day_type,
            json.dumps(meals, ensure_ascii=False),
            day_data.get("daily_totals", {}).get("kcal", 0),
            day_data.get("daily_totals", {}).get("protein", 0),
            day_data.get("daily_totals", {}).get("fat", 0),
            day_data.get("daily_totals", {}).get("carbs", 0),
            day_data.get("daily_totals", {}).get("cost", 0),
        ),
    )
    for meal in meals:
        for ing in meal.get("ingredients", []):
            product_id = find_product_id(conn, ing["name"])
            if product_id:
                conn.execute(
                    """
                    INSERT INTO reservations (user_id, product_id, plan_date, meal_type, amount_reserved)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (internal_user_id, product_id, plan_date_iso, meal["type"], ing["amount"]),
                )


def _build_dates_to_write(period: str, start_from_raw: str | None) -> tuple[list[str], list[int]]:
    """
    Возвращает (список ISO дат для записи, индексы среза из ответа LLM: 0..6).
    week / from_today: 7 дней подряд от anchor.
    day: один день, в БД пишется только ответ с индекса 0 модели.
    """
    tomorrow = add_days(today_msk(), 1)
    anchor = parse_iso_date(start_from_raw) or tomorrow
    period = (period or "week").strip().lower()
    if period not in ("day", "from_today", "week"):
        period = "week"

    if period == "day":
        return [iso(anchor)], [0]

    # from_today и week: 7 дней подряд от anchor (документированное поведение API)
    dates = [iso(add_days(anchor, i)) for i in range(7)]
    return dates, list(range(7))


# ============================================================
# ГЕНЕРАЦИЯ ПЛАНА
# ============================================================
@plan_bp.route("/api/plan/generate", methods=["POST"])
def generate_plan():
    """
    POST JSON: user_id, planner?, period?: day|from_today|week, start_from?: YYYY-MM-DD
    По умолчанию period=week, anchor завтра (МСК) или start_from.
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    planner_payload = data.get("planner", {})
    period = (data.get("period") or "week").strip().lower()
    start_from_raw = data.get("start_from")

    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404
    user = conn.execute("SELECT * FROM users WHERE id = ?", (internal_user_id,)).fetchone()
    ud = _user_dict(user)

    training_rows = conn.execute(
        "SELECT day_of_week FROM training_days WHERE user_id = ?", (internal_user_id,)
    ).fetchall()
    training_days = [r["day_of_week"] for r in training_rows]

    pref_rows = conn.execute(
        "SELECT product_name, preference_type FROM food_preferences WHERE user_id = ?",
        (internal_user_id,),
    ).fetchall()
    preferences = ", ".join(
        [
            f"{'Исключить' if r['preference_type'] == 'exclude' else 'Предпочитать'}: {r['product_name']}"
            for r in pref_rows
        ]
    ) or "нет особых предпочтений"
    preferences = _enrich_preferences(preferences, ud)

    products = conn.execute(
        """
        SELECT pr.name, pr.unit, pr.calories_per_100, pr.protein_per_100, pr.fat_per_100, pr.carbs_per_100,
               p.amount, p.price_per_unit, p.expiry_date
        FROM pantry p
        JOIN products_ref pr ON p.product_id = pr.id
        WHERE p.user_id = ?
        """,
        (internal_user_id,),
    ).fetchall()
    product_list = [dict(p) for p in products]
    conn.close()

    algorithm_context = build_planning_context(
        user=ud,
        training_days=training_days,
        pantry_items=product_list,
        planner_payload=planner_payload,
    )

    user_data = {
        "training_days": training_days,
        "wake_time": ud.get("wake_time") or "08:00",
        "sleep_time": ud.get("sleep_time") or "23:00",
        "budget_weekly": ud.get("budget_weekly") or 2000,
        "goal": ud.get("goal") or "recomposition",
        "goal_custom": ud.get("goal_custom"),
        "preferences": preferences,
        "age": ud.get("age") or 25,
        "weight": ud.get("weight") or 75,
        "height": ud.get("height") or 175,
        "algorithm_context": algorithm_context,
    }

    try:
        week_plan = generate_weekly_plan(user_data, product_list)
    except Exception as e:
        return jsonify({"error": f"Ошибка генерации плана: {str(e)}"}), 500

    ordered_days = _ordered_days_from_response(week_plan)
    if not ordered_days:
        return jsonify({"error": "Пустой ответ модели"}), 500

    dates_iso, indices = _build_dates_to_write(period, start_from_raw)
    conn = get_db()
    _clear_reservations_for_dates(conn, internal_user_id, dates_iso)

    explanations_by_date = {x["date"]: x["why"] for x in algorithm_context.get("explanations", [])}
    targets_by_date = {x["date"]: x for x in algorithm_context.get("daily_targets", [])}

    for pos, plan_date_iso in enumerate(dates_iso):
        idx = indices[pos] if pos < len(indices) else pos
        if idx >= len(ordered_days):
            break
        day_data = ordered_days[idx]
        _persist_one_day(
            conn,
            internal_user_id=internal_user_id,
            user_internal_row_id=ud["id"],
            plan_date_iso=plan_date_iso,
            day_data=day_data,
            explanations_by_date=explanations_by_date,
            targets_by_date=targets_by_date,
        )

    rebuild_shopping_list(conn, internal_user_id, days=2)
    conn.commit()
    conn.close()

    return jsonify(
        {
            "status": "ok",
            "message": "План сгенерирован и сохранён",
            "week_plan": week_plan.get("week_plan"),
            "period": period,
            "saved_dates": dates_iso,
            "explanations": algorithm_context.get("explanations", []),
            "strategy": {
                "budget_weekly_limit": algorithm_context.get("budget_weekly_limit"),
                "estimated_pantry_coverage_cost": algorithm_context.get("estimated_pantry_coverage_cost"),
                "automation_mode": algorithm_context.get("automation_mode"),
            },
        }
    )


@plan_bp.route("/api/plan/window", methods=["GET"])
def get_plan_window():
    """
    Список дней с планом в диапазоне [from, to] включительно (календарь МСК).
    Альтернатива: только user_id + days (по умолчанию 14) — от сегодня (МСК) вперёд.
    """
    user_id = request.args.get("user_id")
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    days_param = request.args.get("days")

    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    if date_from and date_to:
        d0 = parse_iso_date(date_from)
        d1 = parse_iso_date(date_to)
        if not d0 or not d1 or d1 < d0:
            return jsonify({"error": "Некорректный диапазон дат"}), 400
    else:
        try:
            n = int(days_param) if days_param else 14
        except (TypeError, ValueError):
            n = 14
        n = max(1, min(n, 60))
        d0 = today_msk()
        d1 = add_days(d0, n - 1)

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    days_out = []
    cur = d0
    while cur <= d1:
        ds = iso(cur)
        plan = conn.execute(
            "SELECT * FROM meal_plan WHERE user_id = ? AND plan_date = ?",
            (internal_user_id, ds),
        ).fetchone()
        if plan:
            days_out.append(
                {
                    "plan_date": plan["plan_date"],
                    "exists": True,
                    "day_type": plan["day_type"],
                    "meals": json.loads(plan["meals_json"]),
                    "daily_totals": {
                        "kcal": plan["daily_kcal"],
                        "protein": plan["daily_protein"],
                        "fat": plan["daily_fat"],
                        "carbs": plan["daily_carbs"],
                        "cost": plan["daily_cost"],
                    },
                }
            )
        else:
            days_out.append({"plan_date": ds, "exists": False})
        cur = add_days(cur, 1)

    conn.close()
    return jsonify({"days": days_out})


@plan_bp.route("/api/plan", methods=["GET"])
def get_plan():
    """Получить план на конкретную дату (по умолчанию — сегодня по Москве)."""
    user_id = request.args.get("user_id")
    date = request.args.get("date", today_msk_iso())

    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    plan = conn.execute(
        "SELECT * FROM meal_plan WHERE user_id = ? AND plan_date = ?",
        (internal_user_id, date),
    ).fetchone()
    conn.close()

    if not plan:
        return jsonify({"exists": False, "message": "План на эту дату не найден"})

    return jsonify(
        {
            "exists": True,
            "plan_date": plan["plan_date"],
            "day_type": plan["day_type"],
            "meals": json.loads(plan["meals_json"]),
            "daily_totals": {
                "kcal": plan["daily_kcal"],
                "protein": plan["daily_protein"],
                "fat": plan["daily_fat"],
                "carbs": plan["daily_carbs"],
                "cost": plan["daily_cost"],
            },
        }
    )


@plan_bp.route("/api/plan/analyze", methods=["POST"])
def analyze_meal():
    """Анализирует текстовое описание еды и возвращает структуру"""
    data = request.get_json()
    description = data.get("description", "")

    if not description:
        return jsonify({"error": "description обязателен"}), 400

    try:
        result = analyze_meal_description(description)
        return jsonify(result.get("meal_analysis", result))
    except Exception as e:
        return jsonify({"error": f"Ошибка анализа: {str(e)}"}), 500
