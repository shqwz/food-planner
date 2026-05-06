"""
Ингредиенты, которые не нужно считать «покупными» для корзины, резервов под план и кладовой.
"""

from __future__ import annotations

import re


def _normalize_name_low(name: str) -> str:
    return (name or "").strip().lower().replace("ё", "е")


def is_non_purchasable_tap_water(name: str) -> bool:
    """
    Вода из крана / кипячёная для варки или запаривания круп — не докупаем.
    Не трогаем минеральную и газированную (их обычно покупают).
    """
    low = _normalize_name_low(name)
    if not low:
        return False
    if any(m in low for m in ("минерал", "газирован", "газиров")):
        return False

    if low in ("вода", "water", "tap water", "питьевая вода", "вода питьевая", "кипяток"):
        return True

    # Любая строка на «вода …» уже без признаков бутильной воды сверху.
    if re.match(r"^вода\b", low):
        return True

    if re.search(r"водопровод|из.?под крана|кранова", low):
        return True

    if re.search(r"кипячен", low) and "вода" in low:
        return True

    return False
