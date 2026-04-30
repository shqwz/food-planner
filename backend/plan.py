from flask import Blueprint, request, jsonify
from database import get_db
from deepseek import generate_weekly_plan, analyze_meal_description, adjust_remaining_meals
from datetime import datetime, timedelta
import json
from services import resolve_user_id, find_product_id, NotFoundError

plan_bp = Blueprint("plan", __name__)


# ============================================================
# ГЕНЕРАЦИЯ НЕДЕЛЬНОГО ПЛАНА
# ============================================================
@plan_bp.route("/api/plan/generate", methods=["POST"])
def generate_plan():
    """
    Генерирует план питания на 7 дней от завтрашнего дня.
    Принимает: { user_id, (опционально) preferences }
    """
    data = request.get_json()
    user_id = data.get("user_id")

    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()

    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404
    user = conn.execute("SELECT * FROM users WHERE id = ?", (internal_user_id,)).fetchone()

    # Получаем тренировочные дни
    training_rows = conn.execute(
        "SELECT day_of_week FROM training_days WHERE user_id = ?", (internal_user_id,)
    ).fetchall()
    training_days = [r["day_of_week"] for r in training_rows]

    # Получаем предпочтения
    pref_rows = conn.execute(
        "SELECT product_name, preference_type FROM food_preferences WHERE user_id = ?",
        (internal_user_id,)
    ).fetchall()
    preferences = ", ".join([f"{'Исключить' if r['preference_type'] == 'exclude' else 'Предпочитать'}: {r['product_name']}" for r in pref_rows]) or "нет особых предпочтений"

    # Получаем продукты из кладовой
    products = conn.execute('''
        SELECT pr.name, pr.unit, pr.calories_per_100, pr.protein_per_100, pr.fat_per_100, pr.carbs_per_100,
               p.amount, p.price_per_unit, p.expiry_date
        FROM pantry p
        JOIN products_ref pr ON p.product_id = pr.id
        WHERE p.user_id = ?
    ''', (internal_user_id,)).fetchall()

    product_list = [dict(p) for p in products]
    conn.close()

    # Собираем данные для нейросети
    user_data = {
        "training_days": training_days,
        "wake_time": user["wake_time"] or "08:00",
        "sleep_time": user["sleep_time"] or "23:00",
        "budget_weekly": user["budget_weekly"] or 2000,
        "goal": user["goal"] or "recomposition",
        "preferences": preferences,
        "age": user["age"] or 25,
        "weight": user["weight"] or 75,
        "height": user["height"] or 175
    }

    try:
        # Генерируем план через DeepSeek
        week_plan = generate_weekly_plan(user_data, product_list)
    except Exception as e:
        return jsonify({"error": f"Ошибка генерации плана: {str(e)}"}), 500

    # Сохраняем план в БД
    conn = get_db()
    tomorrow = (datetime.now() + timedelta(days=1)).date()

    for i, (date_str, day_data) in enumerate(week_plan.get("week_plan", {}).items()):
        plan_date = date_str

        conn.execute('''
            INSERT OR REPLACE INTO meal_plan 
            (user_id, plan_date, day_type, meals_json, daily_kcal, daily_protein, daily_fat, daily_carbs, daily_cost, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (
            user["id"],
            plan_date,
            day_data.get("day_type", "rest"),
            json.dumps(day_data.get("meals", []), ensure_ascii=False),
            day_data.get("daily_totals", {}).get("kcal", 0),
            day_data.get("daily_totals", {}).get("protein", 0),
            day_data.get("daily_totals", {}).get("fat", 0),
            day_data.get("daily_totals", {}).get("carbs", 0),
            day_data.get("daily_totals", {}).get("cost", 0)
        ))

        # Резервируем продукты
        for meal in day_data.get("meals", []):
            for ing in meal.get("ingredients", []):
                # Ищем продукт в справочнике
                product_id = find_product_id(conn, ing["name"])
                if product_id:
                    conn.execute('''
                        INSERT INTO reservations (user_id, product_id, plan_date, meal_type, amount_reserved)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (internal_user_id, product_id, plan_date, meal["type"], ing["amount"]))

    conn.commit()
    conn.close()

    return jsonify({
        "status": "ok",
        "message": "План на неделю сгенерирован и сохранён",
        "week_plan": week_plan["week_plan"]
    })


# ============================================================
# ПОЛУЧЕНИЕ ПЛАНА НА ДЕНЬ
# ============================================================
@plan_bp.route("/api/plan", methods=["GET"])
def get_plan():
    """Получить план на конкретную дату (по умолчанию — сегодня)"""
    user_id = request.args.get("user_id")
    date = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))

    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    plan = conn.execute('''
        SELECT * FROM meal_plan WHERE user_id = ? AND plan_date = ?
    ''', (internal_user_id, date)).fetchone()
    conn.close()

    if not plan:
        return jsonify({"exists": False, "message": "План на эту дату не найден"})

    return jsonify({
        "exists": True,
        "plan_date": plan["plan_date"],
        "day_type": plan["day_type"],
        "meals": json.loads(plan["meals_json"]),
        "daily_totals": {
            "kcal": plan["daily_kcal"],
            "protein": plan["daily_protein"],
            "fat": plan["daily_fat"],
            "carbs": plan["daily_carbs"],
            "cost": plan["daily_cost"]
        }
    })


# ============================================================
# АНАЛИЗ ОПИСАНИЯ ЕДЫ
# ============================================================
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