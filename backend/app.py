from flask import Flask, request, jsonify, send_from_directory
from database import get_db, init_db, seed_products
from plan import plan_bp
from diary import diary_bp
from shopping import shopping_bp
import os

app = Flask(__name__, static_folder="../frontend/dist", static_url_path="")

# Вместо CORS(app) напиши:
@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response

@app.before_request
def handle_options():
    if request.method == 'OPTIONS' and request.path.startswith('/api'):
        return '', 200

# Регистрируем blueprints
app.register_blueprint(plan_bp)
app.register_blueprint(diary_bp)
app.register_blueprint(shopping_bp)

# ============================================================
# ИНИЦИАЛИЗАЦИЯ
# ============================================================
@app.route("/api/init", methods=["POST"])
def initialize():
    """Инициализирует БД и заполняет справочник продуктов"""
    init_db()
    seed_products()
    return jsonify({"status": "ok", "message": "База данных инициализирована"})


# ============================================================
# КЛАДОВАЯ (PANTRY)
# ============================================================
@app.route("/api/pantry", methods=["GET"])
def get_pantry():
    """Получить все продукты на складе пользователя"""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    rows = conn.execute('''
        SELECT p.id, pr.name, p.amount, pr.unit, pr.calories_per_100,
               pr.protein_per_100, pr.fat_per_100, pr.carbs_per_100,
               p.price_per_unit, p.expiry_date
        FROM pantry p
        JOIN products_ref pr ON p.product_id = pr.id
        WHERE p.user_id = ?
        ORDER BY p.expiry_date IS NULL, p.expiry_date ASC
    ''', (user_id,)).fetchall()
    conn.close()

    products = []
    for r in rows:
        products.append({
            "id": r["id"],
            "name": r["name"],
            "amount": r["amount"],
            "unit": r["unit"],
            "calories_per_100": r["calories_per_100"],
            "protein_per_100": r["protein_per_100"],
            "fat_per_100": r["fat_per_100"],
            "carbs_per_100": r["carbs_per_100"],
            "price_per_unit": r["price_per_unit"],
            "expiry_date": r["expiry_date"]
        })

    return jsonify(products)


@app.route("/api/pantry", methods=["POST"])
def add_to_pantry():
    """Добавить продукт на склад"""
    data = request.get_json()
    user_id = data.get("user_id")
    product_name = data.get("name", "").strip().lower()
    amount = data.get("amount", 0)
    price = data.get("price_per_unit", 0)
    expiry = data.get("expiry_date", None)

    if not user_id or not product_name or amount <= 0:
        return jsonify({"error": "user_id, name, amount обязательны"}), 400

    conn = get_db()

    # Ищем продукт в справочнике (или создаём новый)
    product = conn.execute(
        "SELECT id FROM products_ref WHERE LOWER(name) = ?", (product_name,)
    ).fetchone()

    if not product:
        # Создаём новый продукт с дефолтными значениями
        cursor = conn.execute(
            "INSERT INTO products_ref (name, unit, is_custom) VALUES (?, 'г', 1)",
            (data.get("name", "").strip(),)
        )
        product_id = cursor.lastrowid
    else:
        product_id = product["id"]

    # Добавляем на склад
    conn.execute('''
        INSERT INTO pantry (user_id, product_id, amount, price_per_unit, expiry_date)
        VALUES (?, ?, ?, ?, ?)
    ''', (user_id, product_id, amount, price, expiry))

    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    return jsonify({"status": "ok", "id": new_id, "product_id": product_id})


@app.route("/api/pantry/<int:pantry_id>", methods=["PUT"])
def update_pantry(pantry_id):
    """Обновить количество/цену/срок продукта на складе"""
    data = request.get_json()
    user_id = data.get("user_id")

    conn = get_db()
    conn.execute('''
        UPDATE pantry
        SET amount = COALESCE(?, amount),
            price_per_unit = COALESCE(?, price_per_unit),
            expiry_date = COALESCE(?, expiry_date)
        WHERE id = ? AND user_id = ?
    ''', (
        data.get("amount"),
        data.get("price_per_unit"),
        data.get("expiry_date"),
        pantry_id,
        user_id
    ))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@app.route("/api/pantry/<int:pantry_id>", methods=["DELETE"])
def delete_from_pantry(pantry_id):
    """Удалить продукт со склада"""
    user_id = request.args.get("user_id")
    conn = get_db()
    conn.execute("DELETE FROM pantry WHERE id = ? AND user_id = ?", (pantry_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


# ============================================================
# СПРАВОЧНИК ПРОДУКТОВ
# ============================================================
@app.route("/api/products/search", methods=["GET"])
def search_products():
    """Поиск продукта в справочнике по названию"""
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify([])

    conn = get_db()
    rows = conn.execute('''
        SELECT id, name, unit, calories_per_100, protein_per_100, fat_per_100, carbs_per_100
        FROM products_ref
        WHERE LOWER(name) LIKE ?
        LIMIT 10
    ''', (f"%{query}%",)).fetchall()
    conn.close()

    return jsonify([dict(r) for r in rows])


# ============================================================
# СТАТИКА (FRONTEND)
# ============================================================
@app.route("/")
def serve_index():
    """Отдаёт index.html (собранный React)"""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def serve_static(path):
    """Отдаёт остальные статические файлы (JS, CSS)"""
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


# ============================================================
# ЗАПУСК
# ============================================================
# Запуск планировщика уведомлений (только если есть токен)
if os.environ.get("TELEGRAM_BOT_TOKEN"):
    from bot import start_scheduler
    start_scheduler()


if __name__ == "__main__":
    # Инициализация при первом запуске
    if not os.path.exists(os.path.join(os.path.dirname(__file__), "food_planner.db")):
        init_db()
        seed_products()
    app.run(debug=True, port=5000)