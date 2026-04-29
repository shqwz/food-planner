from flask import Blueprint, request, jsonify
from database import get_db
from datetime import datetime
import json

diary_bp = Blueprint("diary", __name__)


@diary_bp.route("/api/diary", methods=["GET"])
def get_diary():
    """Получить дневник за конкретную дату"""
    user_id = request.args.get("user_id")
    date = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))

    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "Пользователь не найден"}), 404

    meals = conn.execute('''
        SELECT * FROM consumed_meals
        WHERE user_id = ? AND plan_date = ?
        ORDER BY consumed_at ASC
    ''', (user["id"], date)).fetchall()

    # Суммируем за день
    totals = {"kcal": 0, "protein": 0, "fat": 0, "carbs": 0, "cost": 0}
    meal_list = []
    for m in meals:
        meal_list.append({
            "id": m["id"],
            "consumed_at": m["consumed_at"],
            "meal_type": m["meal_type"],
            "dish_name": m["dish_name"],
            "ingredients": json.loads(m["ingredients_json"]),
            "totals": {
                "kcal": m["total_kcal"],
                "protein": m["total_protein"],
                "fat": m["total_fat"],
                "carbs": m["total_carbs"],
                "cost": m["total_cost"]
            },
            "was_planned": bool(m["was_planned"]),
            "notes": m["notes"]
        })
        totals["kcal"] += m["total_kcal"] or 0
        totals["protein"] += m["total_protein"] or 0
        totals["fat"] += m["total_fat"] or 0
        totals["carbs"] += m["total_carbs"] or 0
        totals["cost"] += m["total_cost"] or 0

    conn.close()
    return jsonify({"date": date, "meals": meal_list, "totals": totals})


@diary_bp.route("/api/diary", methods=["POST"])
def add_meal():
    """Записать приём пищи (по плану или свой)"""
    data = request.get_json()
    user_id = data.get("user_id")
    plan_date = data.get("date", datetime.now().strftime("%Y-%m-%d"))
    meal_type = data.get("meal_type", "snack")
    dish_name = data.get("dish_name", "Без названия")
    ingredients = data.get("ingredients", [])
    was_planned = data.get("was_planned", False)
    notes = data.get("notes", "")

    if not user_id or not ingredients:
        return jsonify({"error": "user_id и ingredients обязательны"}), 400

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "Пользователь не найден"}), 404

    # Считаем итоги
    total_kcal = sum(i.get("kcal", 0) for i in ingredients)
    total_protein = sum(i.get("protein", 0) for i in ingredients)
    total_fat = sum(i.get("fat", 0) for i in ingredients)
    total_carbs = sum(i.get("carbs", 0) for i in ingredients)
    total_cost = sum(i.get("cost", 0) for i in ingredients)

    # Если приём по плану — списываем продукты из кладовой и снимаем резерв
    if was_planned:
        for ing in ingredients:
            # Находим продукт в справочнике
            product = conn.execute(
                "SELECT id FROM products_ref WHERE LOWER(name) = ?",
                (ing["name"].lower(),)
            ).fetchone()

            if product:
                # Списываем из кладовой
                conn.execute('''
                    UPDATE pantry
                    SET amount = amount - ?
                    WHERE user_id = ? AND product_id = ? AND amount >= ?
                ''', (ing["amount"], user["id"], product["id"], ing["amount"]))

                # Снимаем резерв
                conn.execute('''
                    DELETE FROM reservations
                    WHERE user_id = ? AND product_id = ? AND plan_date = ? AND meal_type = ?
                ''', (user["id"], product["id"], plan_date, meal_type))

    # Записываем в дневник
    conn.execute('''
        INSERT INTO consumed_meals
        (user_id, consumed_at, plan_date, meal_type, dish_name, ingredients_json,
         total_kcal, total_protein, total_fat, total_carbs, total_cost, was_planned, notes)
        VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        user["id"], plan_date, meal_type, dish_name,
        json.dumps(ingredients, ensure_ascii=False),
        total_kcal, total_protein, total_fat, total_carbs, total_cost,
        int(was_planned), notes
    ))

    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    return jsonify({
        "status": "ok",
        "id": new_id,
        "totals": {
            "kcal": total_kcal,
            "protein": total_protein,
            "fat": total_fat,
            "carbs": total_carbs,
            "cost": total_cost
        }
    })


@diary_bp.route("/api/diary/<int:meal_id>", methods=["DELETE"])
def delete_meal(meal_id):
    """Удалить запись из дневника"""
    user_id = request.args.get("user_id")
    conn = get_db()
    conn.execute("DELETE FROM consumed_meals WHERE id = ? AND user_id = ?", (meal_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@diary_bp.route("/api/diary/history", methods=["GET"])
def get_history():
    """Получить историю питания за диапазон дат"""
    user_id = request.args.get("user_id")
    from_date = request.args.get("from", datetime.now().strftime("%Y-%m-01"))
    to_date = request.args.get("to", datetime.now().strftime("%Y-%m-%d"))

    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "Пользователь не найден"}), 404

    rows = conn.execute('''
        SELECT plan_date,
               SUM(total_kcal) as kcal,
               SUM(total_protein) as protein,
               SUM(total_fat) as fat,
               SUM(total_carbs) as carbs,
               SUM(total_cost) as cost,
               COUNT(*) as meals_count
        FROM consumed_meals
        WHERE user_id = ? AND plan_date BETWEEN ? AND ?
        GROUP BY plan_date
        ORDER BY plan_date DESC
    ''', (user["id"], from_date, to_date)).fetchall()

    conn.close()
    return jsonify([dict(r) for r in rows])


@diary_bp.route("/api/measurements", methods=["GET"])
def get_measurements():
    """Получить замеры тела"""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "Пользователь не найден"}), 404

    rows = conn.execute('''
        SELECT * FROM body_measurements
        WHERE user_id = ? ORDER BY measure_date DESC
    ''', (user["id"],)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@diary_bp.route("/api/measurements", methods=["POST"])
def add_measurement():
    """Добавить замер тела"""
    data = request.get_json()
    user_id = data.get("user_id")
    date = data.get("date", datetime.now().strftime("%Y-%m-%d"))

    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "Пользователь не найден"}), 404

    conn.execute('''
        INSERT OR REPLACE INTO body_measurements (user_id, measure_date, weight, waist, chest, arms, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        user["id"], date,
        data.get("weight"), data.get("waist"),
        data.get("chest"), data.get("arms"),
        data.get("notes", "")
    ))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})