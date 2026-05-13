from typing import Optional

from ingredient_exclude import is_non_purchasable_tap_water


class NotFoundError(Exception):
    pass


def resolve_user_id(conn, external_user_id) -> int:
    user = conn.execute("SELECT id FROM users WHERE telegram_id = ?", (external_user_id,)).fetchone()
    if not user:
        raise NotFoundError("Пользователь не найден")
    return user["id"]


def _norm_ingredient_unit(u: str) -> str:
    x = (u or "г").strip().lower()
    if x in ("г", "g", "гр", "gram", "grams"):
        return "г"
    if x in ("мл", "ml", "milliliter"):
        return "мл"
    if x in ("шт", "штука", "штуки", "pcs", "pc", "штук"):
        return "шт"
    return "г"


def find_product_ref_row(conn, raw_name: str):
    """Первая строка справочника по имени; при дубликатах (raw/ready) предпочитаем raw."""
    n = (raw_name or "").strip().lower()
    if not n:
        return None
    return conn.execute(
        """SELECT * FROM products_ref WHERE py_lower(name) = ?
           ORDER BY CASE lower(coalesce(category, ''))
             WHEN 'raw' THEN 0 WHEN 'ready' THEN 1 ELSE 2 END, id
           LIMIT 1""",
        (n,),
    ).fetchone()


def _nutrition_scale(ref_unit: str, ing_unit: str, amount: float, kcal_ref: float) -> float | None:
    """Множитель к полям *_per_100 в строке справочника. None — единицы не согласованы."""
    if amount <= 0:
        return None
    ru = _norm_ingredient_unit(ref_unit)
    iu = _norm_ingredient_unit(ing_unit)
    kcal_ref = float(kcal_ref or 0)
    if ru == iu and ru in ("г", "мл"):
        return amount / 100.0
    if ru == iu == "шт":
        # В каталоге для «шт» часто указаны ккал за 1 шт (яйцо ~78), реже — за 100 г сырого веса.
        if kcal_ref <= 130:
            return float(amount)
        return amount / 100.0
    if ru in ("г", "мл") and iu in ("г", "мл"):
        return amount / 100.0
    return None


def macros_from_ref_row(row, amount: float, ing_unit: str) -> dict | None:
    """КБЖУ по строке products_ref и порции; cost не считаем."""
    fac = _nutrition_scale(row["unit"] or "г", ing_unit, amount, row["calories_per_100"])
    if fac is None:
        return None
    return {
        "kcal": round(float(row["calories_per_100"] or 0) * fac, 1),
        "protein": round(float(row["protein_per_100"] or 0) * fac, 2),
        "fat": round(float(row["fat_per_100"] or 0) * fac, 2),
        "carbs": round(float(row["carbs_per_100"] or 0) * fac, 2),
    }


def enrich_ingredients_from_products_ref(conn, ingredients: list) -> None:
    """Подставляет КБЖУ из офлайн-справочника, если в строке ингредиента макросы нулевые."""
    if not ingredients:
        return
    for ing in ingredients:
        if not isinstance(ing, dict):
            continue
        raw = (ing.get("name") or "").strip()
        if is_non_purchasable_tap_water(raw):
            continue
        k0 = float(ing.get("kcal") or 0)
        p0 = float(ing.get("protein") or 0)
        f0 = float(ing.get("fat") or 0)
        c0 = float(ing.get("carbs") or 0)
        if k0 > 0 or p0 > 0 or f0 > 0 or c0 > 0:
            continue
        row = find_product_ref_row(conn, raw)
        if not row:
            continue
        try:
            amt = float(ing.get("amount") or 0)
        except (TypeError, ValueError):
            amt = 0.0
        u = str(ing.get("unit") or "г")
        m = macros_from_ref_row(row, amt, u)
        if not m:
            continue
        ing["kcal"] = m["kcal"]
        ing["protein"] = m["protein"]
        ing["fat"] = m["fat"]
        ing["carbs"] = m["carbs"]


def enrich_meal_analysis_with_products_ref(conn, meal_analysis: dict) -> None:
    """После ответа нейросети: перезаписывает КБЖУ из справочника где возможно; пересчитывает totals."""
    if not meal_analysis or not isinstance(meal_analysis, dict):
        return
    ings = meal_analysis.get("ingredients")
    if not isinstance(ings, list):
        return
    enrich_ingredients_from_products_ref(conn, ings)
    kcal = protein = fat = carbs = 0.0
    for ing in ings:
        if not isinstance(ing, dict):
            continue
        if is_non_purchasable_tap_water((ing.get("name") or "").strip()):
            continue
        kcal += float(ing.get("kcal") or 0)
        protein += float(ing.get("protein") or 0)
        fat += float(ing.get("fat") or 0)
        carbs += float(ing.get("carbs") or 0)
    meal_analysis["totals"] = {
        "kcal": round(kcal),
        "protein": round(protein, 1),
        "fat": round(fat, 1),
        "carbs": round(carbs, 1),
    }


def find_or_create_product(conn, raw_name: str) -> int:
    name = (raw_name or "").strip()
    product = find_product_ref_row(conn, name)
    if product:
        return product["id"]

    cursor = conn.execute(
        "INSERT INTO products_ref (name, unit, is_custom) VALUES (?, 'г', 1)",
        (name,),
    )
    return cursor.lastrowid


def find_product_id(conn, raw_name: str) -> Optional[int]:
    if not (raw_name or "").strip():
        return None
    row = find_product_ref_row(conn, raw_name)
    return row["id"] if row else None
