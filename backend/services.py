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
    name = (raw_name or "").strip().lower()
    if not name:
        return None
    row = conn.execute(
        "SELECT id FROM products_ref WHERE LOWER(name) = ?",
        (name,),
    ).fetchone()
    return row["id"] if row else None
