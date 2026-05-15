import sqlite3
import os
from config import resolved_db_path


def get_db():
    """Возвращает соединение с БД (путь через config.resolved_db_path)."""
    path = resolved_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row  # чтобы обращаться к полям по имени
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    """Создаёт все таблицы из schema.sql"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Читаем schema.sql
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = f.read()
    
    # Выполняем все запросы
    cursor.executescript(schema)
    conn.commit()
    ensure_schema_migrations(conn)
    seed_product_packaging_defaults(conn)
    conn.commit()
    conn.close()
    print("✅ База данных инициализирована")


def ensure_schema_migrations(conn=None):
    """Для уже существующих БД: добавляет столбцы, которых не было в старых schema."""
    close = False
    if conn is None:
        conn = get_db()
        close = True
    try:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(consumed_meals)").fetchall()}
        if cols and "entry_source" not in cols:
            conn.execute("ALTER TABLE consumed_meals ADD COLUMN entry_source TEXT DEFAULT 'other'")

        sl_cols = {row[1] for row in conn.execute("PRAGMA table_info(shopping_list)").fetchall()}
        if sl_cols:
            if "skipped_in_trip" not in sl_cols:
                conn.execute("ALTER TABLE shopping_list ADD COLUMN skipped_in_trip INTEGER DEFAULT 0")
            if "display_name" not in sl_cols:
                conn.execute("ALTER TABLE shopping_list ADD COLUMN display_name TEXT")
            if "display_unit" not in sl_cols:
                conn.execute("ALTER TABLE shopping_list ADD COLUMN display_unit TEXT")
            if "pack_weight" not in sl_cols:
                conn.execute("ALTER TABLE shopping_list ADD COLUMN pack_weight REAL DEFAULT 0")
            if "packs" not in sl_cols:
                conn.execute("ALTER TABLE shopping_list ADD COLUMN packs INTEGER DEFAULT 0")
            if "is_manual" not in sl_cols:
                conn.execute("ALTER TABLE shopping_list ADD COLUMN is_manual INTEGER DEFAULT 0")
            if "pack_unit" not in sl_cols:
                conn.execute("ALTER TABLE shopping_list ADD COLUMN pack_unit TEXT")

        conn.execute(
            """CREATE TABLE IF NOT EXISTS product_packaging (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT UNIQUE NOT NULL,
            unit TEXT NOT NULL,
            default_pack_size REAL,
            avg_price_per_pack_rub REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )"""
        )

        pp_cols = {row[1] for row in conn.execute("PRAGMA table_info(product_packaging)").fetchall()}
        if pp_cols and "avg_price_per_pack_rub" not in pp_cols:
            conn.execute("ALTER TABLE product_packaging ADD COLUMN avg_price_per_pack_rub REAL")

        conn.execute(
            """CREATE TABLE IF NOT EXISTS shopping_spend_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS shopping_spend_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            amount_rub REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )"""
        )

        u_cols = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if u_cols:
            if "goal_custom" not in u_cols:
                conn.execute("ALTER TABLE users ADD COLUMN goal_custom TEXT")
            if "budget_tier" not in u_cols:
                conn.execute("ALTER TABLE users ADD COLUMN budget_tier TEXT")
            if "budget_custom" not in u_cols:
                conn.execute("ALTER TABLE users ADD COLUMN budget_custom REAL")
            if "kitchen_type" not in u_cols:
                conn.execute("ALTER TABLE users ADD COLUMN kitchen_type TEXT")
            if "onboarding_completed" not in u_cols:
                conn.execute(
                    "ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0"
                )
                conn.execute(
                    "UPDATE users SET onboarding_completed = 1 WHERE onboarding_completed IS NULL"
                )
            if "shopping_list_mode" not in u_cols:
                conn.execute("ALTER TABLE users ADD COLUMN shopping_list_mode TEXT")
            if "sex" not in u_cols:
                conn.execute("ALTER TABLE users ADD COLUMN sex TEXT DEFAULT 'male'")
                conn.execute("UPDATE users SET sex = 'male' WHERE sex IS NULL")
            if "activity_level" not in u_cols:
                conn.execute("ALTER TABLE users ADD COLUMN activity_level TEXT DEFAULT 'moderate'")
                conn.execute("UPDATE users SET activity_level = 'moderate' WHERE activity_level IS NULL")
        seed_product_packaging_defaults(conn)
        # Обновить цены для старых записей где avg_price_per_pack_rub IS NULL
        _backfill_packaging_prices(conn)
    finally:
        if close:
            conn.commit()
            conn.close()


def _backfill_packaging_prices(conn):
    """Проставляет avg_price_per_pack_rub для старых записей где цена NULL.
    Использует те же данные что и seed — обновляет только строки с NULL ценой."""
    price_map = {
        "гречка": 89.0, "рис": 79.0, "овсянка": 69.0, "овсяные хлопья": 69.0,
        "перловка": 59.0, "пшено": 59.0, "макароны": 59.0, "вермишель": 55.0,
        "кефир": 89.0, "молоко": 89.0, "ряженка": 79.0, "йогурт": 49.0,
        "творог": 99.0, "сметана": 89.0, "сыр": 179.0,
        "масло сливочное": 119.0, "молоко сухое": 199.0,
        "куриная грудка": 169.0, "курица": 199.0, "говядина": 349.0,
        "свинина": 279.0, "фарш": 249.0, "рыба": 219.0, "лосось": 299.0,
        "треска": 199.0, "тунец консервированный": 119.0,
        "яйцо": 89.0, "яйца": 89.0,
        "картофель": 59.0, "морковь": 49.0, "лук": 39.0, "капуста": 49.0,
        "огурец": 89.0, "помидор": 99.0, "яблоко": 99.0, "банан": 109.0,
        "ягоды замороженные": 149.0, "шпинат": 79.0, "брокколи": 99.0,
        "перец болгарский": 119.0, "свёкла": 59.0,
        "чечевица": 89.0, "нут": 99.0, "горох": 59.0, "фасоль": 79.0,
        "хлеб": 49.0, "хлебцы": 69.0,
        "масло растительное": 99.0, "масло оливковое": 349.0,
        "миндаль": 179.0, "грецкий орех": 149.0, "кешью": 199.0,
        "изюм": 89.0, "чернослив": 89.0,
        "соль": 25.0, "сахар": 59.0, "мёд": 149.0,
        "чай": 89.0, "кофе": 179.0,
        # старые имена из seed v1
        "гречка сухая": 89.0, "рис сухой": 79.0, "кефир 1%": 89.0,
        "грудка куриная": 169.0, "творожный сыр": 99.0,
        "хлебцы ржаные": 69.0,
    }
    for name, price in price_map.items():
        conn.execute(
            "UPDATE product_packaging SET avg_price_per_pack_rub = ? "
            "WHERE LOWER(product_name) = ? AND avg_price_per_pack_rub IS NULL",
            (price, name.lower()),
        )


def seed_product_packaging_defaults(conn):
    """Стартовые типичные фасовки (РФ); INSERT OR IGNORE — не перезаписывает уже заполненный кэш."""
    # (product_name, unit, default_pack_size, avg_price_per_pack_rub)
    # Названия подобраны так, чтобы нечёткий поиск по словам находил
    # типичные варианты из планов нейросети
    rows = [
        # Крупы
        ("гречка", "г", 900.0, 89.0),
        ("рис", "г", 900.0, 79.0),
        ("овсянка", "г", 500.0, 69.0),
        ("овсяные хлопья", "г", 500.0, 69.0),
        ("перловка", "г", 900.0, 59.0),
        ("пшено", "г", 900.0, 59.0),
        ("макароны", "г", 400.0, 59.0),
        ("вермишель", "г", 400.0, 55.0),
        # Молочные
        ("кефир", "мл", 930.0, 89.0),
        ("молоко", "мл", 930.0, 89.0),
        ("ряженка", "мл", 500.0, 79.0),
        ("йогурт", "г", 125.0, 49.0),
        ("творог", "г", 200.0, 99.0),
        ("сметана", "г", 400.0, 89.0),
        ("сыр", "г", 200.0, 179.0),
        ("масло сливочное", "г", 180.0, 119.0),
        ("молоко сухое", "г", 400.0, 199.0),
        # Мясо и рыба
        ("куриная грудка", "г", 500.0, 169.0),
        ("курица", "г", 1000.0, 199.0),
        ("говядина", "г", 500.0, 349.0),
        ("свинина", "г", 500.0, 279.0),
        ("фарш", "г", 500.0, 249.0),
        ("рыба", "г", 500.0, 219.0),
        ("лосось", "г", 300.0, 299.0),
        ("треска", "г", 400.0, 199.0),
        ("тунец консервированный", "г", 185.0, 119.0),
        # Яйца
        ("яйцо", "шт", 10.0, 89.0),
        ("яйца", "шт", 10.0, 89.0),
        # Овощи и фрукты
        ("картофель", "г", 1000.0, 59.0),
        ("морковь", "г", 1000.0, 49.0),
        ("лук", "г", 1000.0, 39.0),
        ("капуста", "г", 1000.0, 49.0),
        ("огурец", "г", 500.0, 89.0),
        ("помидор", "г", 500.0, 99.0),
        ("яблоко", "г", 1000.0, 99.0),
        ("банан", "г", 1000.0, 109.0),
        ("ягоды замороженные", "г", 400.0, 149.0),
        ("шпинат", "г", 200.0, 79.0),
        ("брокколи", "г", 400.0, 99.0),
        ("перец болгарский", "г", 500.0, 119.0),
        ("свёкла", "г", 1000.0, 59.0),
        # Бобовые
        ("чечевица", "г", 450.0, 89.0),
        ("нут", "г", 450.0, 99.0),
        ("горох", "г", 900.0, 59.0),
        ("фасоль", "г", 450.0, 79.0),
        # Хлеб и выпечка
        ("хлеб", "г", 400.0, 49.0),
        ("хлебцы", "г", 100.0, 69.0),
        # Масла и соусы
        ("масло растительное", "мл", 900.0, 99.0),
        ("масло оливковое", "мл", 500.0, 349.0),
        # Орехи и сухофрукты
        ("миндаль", "г", 150.0, 179.0),
        ("грецкий орех", "г", 150.0, 149.0),
        ("кешью", "г", 150.0, 199.0),
        ("изюм", "г", 200.0, 89.0),
        ("чернослив", "г", 200.0, 89.0),
        # Специи и прочее
        ("соль", "г", 1000.0, 25.0),
        ("сахар", "г", 1000.0, 59.0),
        ("мёд", "г", 250.0, 149.0),
        ("чай", "г", 100.0, 89.0),
        ("кофе", "г", 100.0, 179.0),
    ]
    for product_name, unit, default_pack_size, avg_price in rows:
        conn.execute(
            """INSERT OR IGNORE INTO product_packaging (product_name, unit, default_pack_size, avg_price_per_pack_rub)
               VALUES (?, ?, ?, ?)""",
            (product_name, unit, default_pack_size, avg_price),
        )


def seed_products():
    """Заполняет справочник продуктов базовыми значениями (твой список)"""
    products = [
        ("яйцо", "шт", 70, 6, 5, 0.5),
        ("гречка сухая", "г", 340, 13, 3, 70),
        ("рис сухой", "г", 350, 7, 1, 78),
        ("овсянка сухая", "г", 350, 12, 6, 60),
        ("фарш куриный", "г", 140, 18, 8, 0.5),
        ("грудка куриная", "г", 110, 23, 1.5, 0),
        ("кефир 1%", "мл", 40, 3, 1, 4),
        ("творожный сыр", "г", 120, 10, 7, 3),
        ("хлебцы ржаные", "шт", 30, 1, 0.3, 5),
        ("огурец", "г", 15, 0.7, 0.1, 3),
        ("помидор", "г", 20, 1, 0.2, 4),
        ("кабачок", "г", 24, 0.6, 0.3, 4.6),
        ("капуста белокочанная", "г", 27, 1.8, 0.1, 5),
        ("масло растительное", "мл", 900, 0, 100, 0),
        ("соль", "г", 0, 0, 0, 0),
        ("перец чёрный", "г", 0, 0, 0, 0),
    ]
    
    conn = get_db()
    cursor = conn.cursor()
    
    for name, unit, kcal, prot, fat, carb in products:
        cursor.execute('''
            INSERT OR IGNORE INTO products_ref (name, unit, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, is_custom)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        ''', (name, unit, kcal, prot, fat, carb))
    
    conn.commit()
    conn.close()
    print("✅ Базовые продукты добавлены в справочник")


def seed_default_user():
    """
    Демо-пользователь для локальной разработки (telegram_id=123456789).
    Вызывать только при SEED_DEMO_USER=1 (см. docker-compose) — не для продакшена.
    """
    conn = get_db()
    conn.execute(
        """
        INSERT OR IGNORE INTO users (
            telegram_id, name, goal, budget_weekly, age, weight, height, sex, activity_level,
            onboarding_completed, budget_tier, kitchen_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'medium', 'home')
        """,
        (123456789, "Алексей", "recomposition", 2500, 30, 75, 178, "male", "moderate"),
    )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    seed_products()