from typing import Optional


class NotFoundError(Exception):
    pass


def resolve_user_id(conn, external_user_id) -> int:
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (external_user_id,)).fetchone()
    if not user:
        raise NotFoundError("Пользователь не найден")
    return user["id"]


def find_or_create_product(conn, raw_name: str) -> int:
    name = (raw_name or "").strip()
    product = conn.execute(
        "SELECT id FROM products_ref WHERE LOWER(name) = ?",
        (name.lower(),),
    ).fetchone()
    if product:
        return product["id"]

    cursor = conn.execute(
        "INSERT INTO products_ref (name, unit, is_custom) VALUES (?, 'г', 1)",
        (name,),
    )
    return cursor.lastrowid


def find_product_id(conn, raw_name: str) -> Optional[int]:
    """
    Ищет продукт по имени с несколькими уровнями fallback:
    1. Точное совпадение (case-insensitive)
    2. LIKE %name% — частичное вхождение
    3. Первое слово названия (например «Гречневая» → «гречка»)
    """
    name = (raw_name or "").strip().lower()
    if not name:
        return None

    # 1. Точное совпадение
    row = conn.execute(
        "SELECT id FROM products_ref WHERE LOWER(name) = ?", (name,)
    ).fetchone()
    if row:
        return row["id"]

    # 2. Частичное — ищем name в базе ИЛИ базу в name
    row = conn.execute(
        """SELECT id FROM products_ref
           WHERE LOWER(name) LIKE ? OR ? LIKE '%' || LOWER(name) || '%'
           LIMIT 1""",
        (f"%{name}%", name),
    ).fetchone()
    if row:
        return row["id"]

    # 3. По первому слову (min 3 символа)
    first_word = name.split()[0] if name.split() else ""
    if len(first_word) >= 3:
        row = conn.execute(
            "SELECT id FROM products_ref WHERE LOWER(name) LIKE ? LIMIT 1",
            (f"{first_word}%",),
        ).fetchone()
        if row:
            return row["id"]

    return None