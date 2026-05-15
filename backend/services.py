from typing import Optional

from product_names import find_product_id_by_match_key, normalize_product_display, product_match_key


class NotFoundError(Exception):
    pass


def resolve_user_id(conn, external_user_id) -> int:
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (external_user_id,)).fetchone()
    if not user:
        raise NotFoundError("Пользователь не найден")
    return user["id"]


def find_or_create_product(conn, raw_name: str, unit: str | None = None) -> int:
    display = normalize_product_display(raw_name)
    if not display:
        raise ValueError("empty product name")

    existing_id = find_product_id_by_match_key(conn, display)
    if existing_id is not None:
        return existing_id

    u = (unit or "г").strip() or "г"
    cursor = conn.execute(
        "INSERT INTO products_ref (name, unit, is_custom) VALUES (?, ?, 1)",
        (display, u),
    )
    return cursor.lastrowid


def find_product_id(conn, raw_name: str) -> Optional[int]:
    """
    Ищет продукт по имени:
    1. Нормализованный ключ (яблоко ≈ яблоки)
    2. Точное совпадение
    3. Частичное LIKE
    4. По первому слову
    """
    name = normalize_product_display(raw_name).lower()
    if not name:
        return None

    by_key = find_product_id_by_match_key(conn, name)
    if by_key is not None:
        return by_key

    row = conn.execute(
        "SELECT id FROM products_ref WHERE LOWER(name) = ?", (name,)
    ).fetchone()
    if row:
        return row["id"]

    row = conn.execute(
        """SELECT id FROM products_ref
           WHERE LOWER(name) LIKE ? OR ? LIKE '%' || LOWER(name) || '%'
           LIMIT 1""",
        (f"%{name}%", name),
    ).fetchone()
    if row:
        return row["id"]

    first_word = name.split()[0] if name.split() else ""
    if len(first_word) >= 3:
        row = conn.execute(
            "SELECT id FROM products_ref WHERE LOWER(name) LIKE ? LIMIT 1",
            (f"{first_word}%",),
        ).fetchone()
        if row:
            return row["id"]

    return None
