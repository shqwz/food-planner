"""Сопоставление названий продуктов: яблоко ≈ яблоки (без тяжёлой морфологии)."""
from __future__ import annotations

import re

_CONSONANTS = frozenset("бвгджзйклмнпрстфхцчшщ")


def normalize_product_display(raw: str) -> str:
    return " ".join((raw or "").strip().split())


def product_match_key(raw: str) -> str:
    """Ключ для поиска одного и того же продукта в разных словоформах."""
    s = normalize_product_display(raw).lower()
    if not s:
        return ""
    return " ".join(_stem_food_word(w) for w in s.split())


def _stem_food_word(word: str) -> str:
    w = word.lower().strip()
    if len(w) < 3:
        return w

    # огурцы, апельсины (редко -цы)
    if len(w) > 4 and w.endswith("цы"):
        return w[:-2] + "ец"

    # помидоры, бананы
    if len(w) > 4 and w.endswith("ы"):
        return w[:-1]

    # яблоки, апельсины (…ины уже сняты через «ы»)
    if len(w) > 5 and w.endswith("ки"):
        return w[:-2] + "ко"

    # яблоки и др. на -и после согласной → -о
    if len(w) > 4 and w.endswith("и") and not w.endswith("ови"):
        stem = w[:-1]
        if stem and stem[-1] in _CONSONANTS:
            return stem + "о"
        return stem

    # яйца → яйцо (после ц/к/ч)
    if len(w) >= 4 and w.endswith("а"):
        stem = w[:-1]
        if stem and stem[-1] in "цкч":
            return stem + "о"
        return w

    return w


def find_product_id_by_match_key(conn, raw_name: str) -> int | None:
    key = product_match_key(raw_name)
    if not key:
        return None
    rows = conn.execute("SELECT id, name FROM products_ref").fetchall()
    for row in rows:
        if product_match_key(row["name"]) == key:
            return int(row["id"])
    return None
