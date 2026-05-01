import sqlite3
import os
from config import DB_PATH


def get_db():
    """Возвращает соединение с БД"""
    conn = sqlite3.connect(DB_PATH)
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
    finally:
        if close:
            conn.commit()
            conn.close()

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
    """Создаёт демо-пользователя для web-клиента в dev-режиме."""
    conn = get_db()
    conn.execute(
        """
        INSERT OR IGNORE INTO users (telegram_id, name, goal, budget_weekly, age, weight, height)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (123456789, "Алексей", "recomposition", 2500, 30, 75, 178),
    )
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    seed_products()
    seed_default_user()