from flask import Blueprint, request, jsonify
from database import get_db
from datetime import datetime, timedelta
import json

shopping_bp = Blueprint("shopping", __name__)


@shopping_bp.route("/api/shopping", methods=["GET"])
def get_shopping_list():
    """Получить корзину покупок на ближайшие дни"""
    user_id = request.args.get("user_id")
    days = int(request.args.get("days", 2))  # на сколько дней вперёд

    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "Пользователь не найден"}), 404

    today = datetime.now().strftime("%Y-%m-%d")
    end_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")

    # Собираем все ингредиенты из плана на указанные дни
    plans = conn.execute('''
        SELECT plan_date, meals_json FROM meal_plan
        WHERE user_id = ? AND plan_date BETWEEN ? AND ?
    ''', (user["id"], today, end_date)).fetchall()

    needed = {}  # {product_name: {"amount": ..., "unit": ..., "price_per_unit": ...}}

    for plan in plans:
        meals = json.loads(plan["meals_json"])
        for meal in meals:
            for ing in meal.get("ingredients", []):
                name = ing["name"].lower()
                if name not in needed:
                    needed[name] = {"amount": 0, "unit": ing.get("unit", "г"), "price_per_unit": 0}
                needed[name]["amount"] += ing["amount"]

    # Вычитаем то, что уже есть в кладовой (доступное = total - зарезервированное)
    for name in needed:
        product = conn.execute(
            "SELECT id FROM products_ref WHERE LOWER(name) = ?", (name,)
        ).fetchone()

        if product:
            # Доступно в кладовой
            pantry_row = conn.execute(
                "SELECT SUM(amount) as total FROM pantry WHERE user_id = ? AND product_id = ?",
                (user["id"], product["id"])
            ).fetchone()

            # Зарезервировано под план
            reserved_row = conn.execute(
                "SELECT SUM(amount_reserved) as total FROM reservations WHERE user_id = ? AND product_id = ?",
                (user["id"], product["id"])
            ).fetchone()

            available = (pantry_row["total"] or 0) - (reserved_row["total"] or 0)

            # Цена из кладовой
            price_row = conn.execute(
                "SELECT price_per_unit FROM pantry WHERE user_id = ? AND product_id = ? LIMIT 1",
                (user["id"], product["id"])
            ).fetchone()
            if price_row:
                needed[name]["price_per_unit"] = price_row["price_per_unit"] or 0

            needed[name]["amount"] = max(0, needed[name]["amount"] - max(0, available))

    # Формируем список
    shopping_list = []
    total_cost = 0
    for name, info in needed.items():
        if info["amount"] > 0:
            cost = (info["amount"] / 1000) * info["price_per_unit"]  # примерный расчёт
            shopping_list.append({
                "name": name,
                "amount_needed": round(info["amount"], 1),
                "unit": info["unit"],
                "estimated_cost": round(cost, 2)
            })
            total_cost += cost

    conn.close()
    return jsonify({
        "for_days": days,
        "from_date": today,
        "to_date": end_date,
        "items": shopping_list,
        "total_estimated_cost": round(total_cost, 2)
    })


@shopping_bp.route("/api/shopping/purchase", methods=["POST"])
def mark_purchased():
    """Отметить продукты как купленные (добавляются в кладовую)"""
    data = request.get_json()
    user_id = data.get("user_id")
    items = data.get("items", [])  # [{"name": "...", "amount": ...}, ...]

    if not user_id or not items:
        return jsonify({"error": "user_id и items обязательны"}), 400

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (user_id,)).fetchone()
    if not user:
        return jsonify({"error": "Пользователь не найден"}), 404

    for item in items:
        product = conn.execute(
            "SELECT id FROM products_ref WHERE LOWER(name) = ?",
            (item["name"].lower(),)
        ).fetchone()

        if product:
            # Добавляем в кладовую
            conn.execute('''
                INSERT INTO pantry (user_id, product_id, amount)
                VALUES (?, ?, ?)
            ''', (user["id"], product["id"], item["amount"]))

    conn.commit()
    conn.close()
    return jsonify({"status": "ok", "message": f"Добавлено {len(items)} продуктов в кладовую"})