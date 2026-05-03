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


def rebuild_shopping_list(conn, internal_user_id: int, days: int = 2) -> dict:
    """
    Перезаписывает shopping_list для пользователя из meal_plan за N дней с сегодняшнего.
    Возвращает сводку {inserted_lines, skipped_days, totals_estimated}
    """
    dates = plan_window_dates(conn, internal_user_id, days)
    if not dates:
        return {"inserted_lines": 0, "totals_estimated": 0.0}

    conn.execute("DELETE FROM shopping_list WHERE user_id = ?", (internal_user_id,))

    daily: dict[str, dict[int, float]] = {d: defaultdict(float) for d in dates}
    unit_by_pid: dict[int, str] = {}

    for d in dates:
        row = conn.execute(
            "SELECT meals_json FROM meal_plan WHERE user_id = ? AND plan_date = ?",
            (internal_user_id, d),
        ).fetchone()
        if not row:
            continue
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

    reserved_sums: dict[int, float] = {}
    for r in conn.execute(
        """SELECT product_id, SUM(amount_reserved) as t FROM reservations
           WHERE user_id = ? AND plan_date BETWEEN ? AND ? GROUP BY product_id""",
        (internal_user_id, dates[0], dates[-1]),
    ):
        reserved_sums[r["product_id"]] = float(r["t"] or 0)

    all_pids = set(need_global.keys()) | set(pantry_sums.keys()) | set(reserved_sums.keys())
    free: dict[int, float] = {}
    for pid in all_pids:
        free[pid] = max(0.0, pantry_sums.get(pid, 0.0) - reserved_sums.get(pid, 0.0))

    buy_global: dict[int, float] = {}
    for pid, need in need_global.items():
        buy_global[pid] = max(0.0, float(need) - free.get(pid, 0.0))

    left = dict(buy_global)
    sorted_dates = sorted(dates)
    inserted = 0
    total_est = 0.0

    for d in sorted_dates:
        for pid in sorted(daily[d].keys()):
            need_d = daily[d][pid]
            if left.get(pid, 0.0) <= 1e-9:
                continue
            take = min(need_d, left[pid])
            if take <= 1e-9:
                continue
            left[pid] -= take

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
