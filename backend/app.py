from flask import Flask, request, jsonify, send_from_directory, make_response
from database import get_db, init_db, seed_products, seed_default_user, ensure_schema_migrations
from plan import plan_bp
from diary import diary_bp
from shopping import shopping_bp
from profile import profile_bp
from telegram_webapp import telegram_webapp_bp
from services import resolve_user_id, find_or_create_product, NotFoundError
from product_names import product_match_key
import os
import argparse

from config import FLASK_DEBUG, TELEGRAM_BOT_TOKEN, resolved_db_path

app = Flask(__name__, static_folder="../frontend/dist", static_url_path="")

import os as _os
_ALLOWED_ORIGIN = _os.environ.get("CORS_ORIGIN", "*")  # задайте CORS_ORIGIN в prod

@app.after_request
def add_cors(response):
    origin = _ALLOWED_ORIGIN
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    if origin != "*":
        response.headers["Vary"] = "Origin"
    return response

@app.before_request
def handle_options():
    if request.method == 'OPTIONS' and request.path.startswith('/api'):
        return '', 200

# Регистрируем blueprints
app.register_blueprint(plan_bp)
app.register_blueprint(diary_bp)
app.register_blueprint(shopping_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(telegram_webapp_bp)

ensure_schema_migrations()

# ============================================================
# ИНИЦИАЛИЗАЦИЯ
# ============================================================
def _maybe_seed_demo_user():
    if os.environ.get("SEED_DEMO_USER", "").strip().lower() in ("1", "true", "yes"):
        seed_default_user()


@app.route("/api/init", methods=["POST"])
def initialize():
    """Инициализирует БД и заполняет справочник продуктов"""
    init_db()
    seed_products()
    _maybe_seed_demo_user()
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
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    rows = conn.execute('''
        SELECT p.id, pr.name, p.amount, pr.unit, p.price_per_unit
        FROM pantry p
        JOIN products_ref pr ON p.product_id = pr.id
        WHERE p.user_id = ?
        ORDER BY pr.name ASC
    ''', (internal_user_id,)).fetchall()
    conn.close()

    products = []
    for r in rows:
        products.append({
            "id": r["id"],
            "name": r["name"],
            "amount": r["amount"],
            "unit": r["unit"],
            "price_per_unit": r["price_per_unit"],
        })

    return jsonify(products)


@app.route("/api/pantry", methods=["DELETE"])
def clear_pantry():
    """Удалить все позиции кладовой пользователя и связанные резервы под план."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    cur = conn.execute("DELETE FROM pantry WHERE user_id = ?", (internal_user_id,))
    deleted = cur.rowcount
    conn.execute("DELETE FROM reservations WHERE user_id = ?", (internal_user_id,))
    conn.commit()
    conn.close()
    return jsonify({"status": "ok", "deleted_pantry_rows": deleted})


@app.route("/api/pantry", methods=["POST"])
def add_to_pantry():
    """Добавить продукт на склад"""
    data = request.get_json()
    user_id = data.get("user_id")
    product_name = data.get("name", "").strip().lower()
    amount = data.get("amount", 0)
    price = data.get("price_per_unit", 0)

    if not user_id or not product_name or amount <= 0:
        return jsonify({"error": "user_id, name, amount обязательны"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    unit = (data.get("unit") or "г").strip() or "г"
    product_id = find_or_create_product(conn, data.get("name", ""), unit=unit)

    existing = conn.execute(
        """
        SELECT id, amount, price_per_unit
        FROM pantry
        WHERE user_id = ? AND product_id = ?
        LIMIT 1
        """,
        (internal_user_id, product_id),
    ).fetchone()

    if existing:
        old_amt = float(existing["amount"] or 0)
        add_amt = float(amount)
        new_amt = old_amt + add_amt
        old_p = float(existing["price_per_unit"] or 0)
        new_p = float(price or 0)
        if new_amt > 0 and new_p > 0 and old_p > 0:
            merged_p = (old_p * old_amt + new_p * add_amt) / new_amt
        else:
            merged_p = new_p if new_p > 0 else old_p
        conn.execute(
            """
            UPDATE pantry
            SET amount = ?, price_per_unit = ?
            WHERE id = ? AND user_id = ?
            """,
            (new_amt, merged_p, existing["id"], internal_user_id),
        )
        pantry_id = existing["id"]
    else:
        conn.execute(
            """
            INSERT INTO pantry (user_id, product_id, amount, price_per_unit)
            VALUES (?, ?, ?, ?)
            """,
            (internal_user_id, product_id, amount, price),
        )
        pantry_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    conn.commit()
    conn.close()

    return jsonify({"status": "ok", "id": pantry_id, "product_id": product_id, "merged": bool(existing)})


@app.route("/api/pantry/<int:pantry_id>", methods=["PUT"])
def update_pantry(pantry_id):
    """Обновить количество/цену/срок продукта на складе"""
    data = request.get_json()
    user_id = data.get("user_id")

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    conn.execute(
        """
        UPDATE pantry
        SET amount = COALESCE(?, amount),
            price_per_unit = COALESCE(?, price_per_unit)
        WHERE id = ? AND user_id = ?
        """,
        (
            data.get("amount"),
            data.get("price_per_unit"),
            pantry_id,
            internal_user_id,
        ),
    )
    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@app.route("/api/pantry/<int:pantry_id>", methods=["DELETE"])
def delete_from_pantry(pantry_id):
    """Удалить продукт со склада"""
    user_id = request.args.get("user_id")
    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    conn.execute("DELETE FROM pantry WHERE id = ? AND user_id = ?", (pantry_id, internal_user_id))
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
    rows = conn.execute(
        """
        SELECT id, name, unit, calories_per_100, protein_per_100, fat_per_100, carbs_per_100
        FROM products_ref
        WHERE LOWER(name) LIKE ?
        LIMIT 30
        """,
        (f"%{query}%",),
    ).fetchall()
    conn.close()

    seen_keys: set[str] = set()
    out = []
    for r in rows:
        key = product_match_key(r["name"])
        if key in seen_keys:
            continue
        seen_keys.add(key)
        out.append(dict(r))
        if len(out) >= 10:
            break
    return jsonify(out)


# ============================================================
# СТАТИКА (FRONTEND)
# ============================================================
@app.route("/")
def serve_index():
    """Отдаёт index.html (собранный React). Без кэша — иначе Telegram WebView держит старый бандл."""
    resp = make_response(send_from_directory(app.static_folder, "index.html"))
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    return resp


@app.route("/<path:path>")
def serve_static(path):
    """Отдаёт остальные статические файлы (JS, CSS)"""
    if os.path.exists(os.path.join(app.static_folder, path)):
        resp = make_response(send_from_directory(app.static_folder, path))
    else:
        resp = make_response(send_from_directory(app.static_folder, "index.html"))
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        return resp
    if path.startswith("assets/"):
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp


# ============================================================
# ЗАПУСК
# ============================================================
# Запуск планировщика уведомлений (только если есть токен)
if TELEGRAM_BOT_TOKEN and os.environ.get("RUN_SCHEDULER_IN_WEB", "0") == "1":
    from bot import start_scheduler
    start_scheduler()


if __name__ == "__main__":
    _default_port = int(
        os.environ.get("PORT") or os.environ.get("FLASK_RUN_PORT") or "5000"
    )
    _parser = argparse.ArgumentParser(add_help=True)
    _parser.add_argument(
        "--port",
        type=int,
        default=_default_port,
        help="Порт HTTP-сервера (по умолчанию из PORT / FLASK_RUN_PORT или 5000)",
    )
    _args, _unknown = _parser.parse_known_args()

    # Инициализация при первом запуске
    if not os.path.exists(resolved_db_path()):
        init_db()
        seed_products()
        _maybe_seed_demo_user()
    app.run(debug=FLASK_DEBUG, host="0.0.0.0", port=_args.port)