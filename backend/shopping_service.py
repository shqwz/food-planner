"""
Формирование корзины из плана: помесячно-подневно, суммирование ингредиентов,
учёт свободного остатка кладовой (минус резерв под план), сохранение в shopping_list.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta

from dates_util import today_msk, today_msk_iso
from services import find_or_create_product


def plan_window_dates(conn, internal_user_id: int, days: int) -> list[str]:
    """N календарных дней, начиная с ближайшей даты плана (или с сегодня, если плана нет)."""
    days = max(1, int(days))
    today = today_msk_iso()
    row = conn.execute(
        "SELECT MIN(plan_date) as m FROM meal_plan WHERE user_id = ? AND plan_date >= ?",
        (internal_user_id, today),
    ).fetchone()
    if not row or not row["m"]:
        row = conn.execute(
            "SELECT MIN(plan_date) as m FROM meal_plan WHERE user_id = ?",
            (internal_user_id,),
        ).fetchone()
    if row and row["m"]:
        base = datetime.strptime(row["m"], "%Y-%m-%d").date()
    else:
        base = today_msk()
    return [(base + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]


def default_price_per_reference_unit(unit: str) -> float:
    u = (unit or "г").lower()
    if u in ("шт", "штука", "штуки"):
        return 42.0
    return 420.0  # ₽ за кг для граммов/мл → пересчёт через /1000


def pantry_price_hint(conn, user_id: int, product_id: int) -> float | None:
    row = conn.execute(
        """SELECT price_per_unit FROM pantry
           WHERE user_id = ? AND product_id = ?
           ORDER BY added_at DESC LIMIT 1""",
        (user_id, product_id),
    ).fetchone()
    if row and row["price_per_unit"]:
        try:
            v = float(row["price_per_unit"])
            return v if v > 0 else None
        except (TypeError, ValueError):
            return None
    return None


def implied_unit_price_from_line(amount: float, unit: str, cost: float) -> float:
    """Обратное к estimate_line_cost: ₽ за кг или ₽ за шт."""
    u = (unit or "г").lower()
    amt = float(amount or 0)
    c = float(cost or 0)
    if amt <= 0:
        return 0.0
    if u in ("шт", "штука", "штуки"):
        return c / amt
    return c / (amt / 1000.0 + 1e-9)


def estimate_line_cost(amount: float, unit: str, price_per_reference_unit: float) -> float:
    u = (unit or "г").lower()
    amt = float(amount or 0)
    if amt <= 0:
        return 0.0
    if u in ("шт", "штука", "штуки"):
        return round(amt * price_per_reference_unit, 2)
    return round((amt / 1000.0) * price_per_reference_unit, 2)


def snapshot_pantry_price_for_line(conn, user_id: int, product_id: int, unit_display: str) -> float:
    hint = pantry_price_hint(conn, user_id, product_id)
    if hint:
        return hint
    ref = conn.execute("SELECT unit FROM products_ref WHERE id = ?", (product_id,)).fetchone()
    u = unit_display or (ref["unit"] if ref else "г")
    return default_price_per_reference_unit(u)


def buy_by_date_after_pantry_chronological(
    dates: list[str],
    daily: dict[str, dict[int, float]],
    free: dict[int, float],
) -> tuple[dict[str, dict[int, float]], int]:
    """
    Сколько докупить по каждой дате, если кладовую «съедаем» в хронологическом порядке.

    Раньше дефицит считался по сумме need за всё окно минус free и размазывался по дням с начала,
    из‑за чего на ранние даты попадали покупки, хотя для короткого префикса дней запаса хватало.
    """
    rem: dict[int, float] = defaultdict(float)
    for pid, v in free.items():
        rem[pid] = float(v or 0)

    buy_by_date: dict[str, dict[int, float]] = {d: {} for d in dates}
    n_lines = 0
    for d in sorted(dates):
        day_map = daily.get(d) or {}
        for pid in sorted(day_map.keys()):
            need = float(day_map[pid] or 0)
            if need <= 1e-9:
                continue
            avail = max(0.0, rem[pid])
            from_pantry = min(need, avail)
            rem[pid] = avail - from_pantry
            buy = need - from_pantry
            if buy > 1e-9:
                buy_by_date[d][pid] = buy
                n_lines += 1
    return buy_by_date, n_lines


def aggregate_shopping_window(conn, internal_user_id: int, days: int) -> dict | None:
    """
    Потребность по плану за окно дней и остаток к закупке с учётом кладовой (без записи в shopping_list).
    Возвращает None, если окно дат пустое.
    """
    dates = plan_window_dates(conn, internal_user_id, days)
    if not dates:
        return None

    daily: dict[str, dict[int, float]] = {d: defaultdict(float) for d in dates}
    unit_by_pid: dict[int, str] = {}
    had_plan_in_window = False

    for d in dates:
        row = conn.execute(
            "SELECT meals_json FROM meal_plan WHERE user_id = ? AND plan_date = ?",
            (internal_user_id, d),
        ).fetchone()
        if not row:
            continue
        had_plan_in_window = True
        try:
            meals = json.loads(row["meals_json"])
        except (json.JSONDecodeError, TypeError):
            continue
        for meal in meals:
            for ing in meal.get("ingredients", []):
                raw = (ing.get("name") or "").strip()
                if not raw:
                    continue
                pid = find_or_create_product(conn, raw)
                amt = float(ing.get("amount") or 0)
                if amt <= 0:
                    continue
                daily[d][pid] += amt
                unit_by_pid[pid] = (ing.get("unit") or "г").strip() or "г"

    need_global: dict[int, float] = defaultdict(float)
    for d in dates:
        for pid, amt in daily[d].items():
            need_global[pid] += amt

    pantry_sums: dict[int, float] = {}
    for r in conn.execute(
        "SELECT product_id, SUM(amount) as t FROM pantry WHERE user_id = ? GROUP BY product_id",
        (internal_user_id,),
    ):
        pantry_sums[r["product_id"]] = float(r["t"] or 0)

    # Потребность daily уже полностью отражает состав meal_plan. Таблица reservations
    # дублирует те же количества под день и используется приёмами дневника (списание/снятие);
    # если ещё и вычитать SUM(reservations) за всё окно из кладовой, получается двойной
    # учёт и при расширении окна (новый plan_date в BETWEEN) «съедается» запас для ранних дней.
    all_pids = set(need_global.keys()) | set(pantry_sums.keys())
    free: dict[int, float] = {}
    for pid in all_pids:
        free[pid] = max(0.0, pantry_sums.get(pid, 0.0))

    buy_by_date, would_buy_lines = buy_by_date_after_pantry_chronological(dates, daily, free)

    return {
        "dates": dates,
        "had_plan_in_window": had_plan_in_window,
        "daily": daily,
        "need_global": dict(need_global),
        "unit_by_pid": unit_by_pid,
        "buy_by_date": buy_by_date,
        "would_buy_lines": would_buy_lines,
    }


def shopping_empty_hint_code(conn, internal_user_id: int, days: int, db_list_empty: bool) -> str | None:
    """Почему корзина пуста: для UI. None если в БД уже есть строки."""
    if not db_list_empty:
        return None
    agg = aggregate_shopping_window(conn, internal_user_id, days)
    if agg is None:
        return "no_plan"
    if not agg["had_plan_in_window"]:
        return "no_plan"
    if not agg["need_global"]:
        return "no_ingredients"
    if agg["would_buy_lines"] == 0:
        return "all_in_pantry"
    return "not_built"


def rebuild_shopping_list(conn, internal_user_id: int, days: int = 2) -> dict:
    """
    Перезаписывает shopping_list для пользователя из meal_plan за N дней с сегодняшнего.
    Возвращает сводку {inserted_lines, skipped_days, totals_estimated}
    """
    agg = aggregate_shopping_window(conn, internal_user_id, days)
    if not agg:
        return {"inserted_lines": 0, "totals_estimated": 0.0}

    dates = agg["dates"]
    daily = agg["daily"]
    unit_by_pid = agg["unit_by_pid"]
    buy_by_date = agg["buy_by_date"]

    conn.execute("DELETE FROM shopping_list WHERE user_id = ?", (internal_user_id,))

    sorted_dates = sorted(dates)
    inserted = 0
    total_est = 0.0

    for d in sorted_dates:
        day_buys = buy_by_date.get(d) or {}
        for pid in sorted(day_buys.keys()):
            take = float(day_buys[pid] or 0)
            if take <= 1e-9:
                continue

            pref = conn.execute(
                "SELECT name, unit FROM products_ref WHERE id = ?",
                (pid,),
            ).fetchone()
            display_name = pref["name"] if pref else str(pid)
            ref_unit = pref["unit"] if pref else "г"
            display_unit = unit_by_pid.get(pid) or ref_unit or "г"

            ppu = snapshot_pantry_price_for_line(conn, internal_user_id, pid, display_unit)
            est = estimate_line_cost(take, display_unit, ppu)
            total_est += est

            conn.execute(
                """INSERT INTO shopping_list (
                    user_id, product_id, amount_needed, estimated_cost, for_date,
                    is_purchased, skipped_in_trip, display_name, display_unit, is_manual
                ) VALUES (?,?,?,?,?,0,0,?,?,0)""",
                (
                    internal_user_id,
                    pid,
                    take,
                    est,
                    d,
                    display_name,
                    display_unit,
                ),
            )
            inserted += 1

    return {
        "inserted_lines": inserted,
        "from_date": dates[0],
        "to_date": dates[-1],
        "days": len(dates),
        "totals_estimated": round(total_est, 2),
    }
