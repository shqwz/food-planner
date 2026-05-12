from flask import Blueprint, request, jsonify
from database import get_db

from services import resolve_user_id, find_or_create_product, NotFoundError
from shopping_service import (
    rebuild_shopping_list,
    implied_unit_price_from_line,
    default_price_per_reference_unit,
    estimate_line_cost,
    shopping_empty_hint_code,
    pantry_inbound_amount_after_purchase,
)
from budget_policy import effective_weekly_limit_rub


shopping_bp = Blueprint("shopping", __name__)


def _shopping_row_public(r, ref_name_fallback: str) -> dict:
    name = (r["display_name"] or ref_name_fallback or "").strip()
    unit = r["display_unit"] or "г"
    packs = int(r["packs"] or 0) if r["packs"] is not None else 0
    pack_weight = float(r["pack_weight"] or 0) if r["pack_weight"] is not None else 0.0
    pack_unit = (r["pack_unit"] or unit).strip() if r["pack_unit"] is not None else unit
    return {
        "id": r["id"],
        "product_id": r["product_id"],
        "name": name or ref_name_fallback,
        "amount_needed": float(r["amount_needed"] or 0),
        "unit": unit,
        "estimated_cost": float(r["estimated_cost"] or 0),
        "for_date": r["for_date"],
        "skipped_in_trip": bool(r["skipped_in_trip"]),
        "is_manual": bool(r["is_manual"]),
        "packs": packs,
        "pack_weight": pack_weight,
        "pack_unit": pack_unit,
    }


def build_cart_summary(rows, budget_weekly: float | None):
    estimated_total = round(sum(float(r["estimated_cost"] or 0) for r in rows), 2)
    trip_active_total = round(
        sum(float(r["estimated_cost"] or 0) for r in rows if not r["skipped_in_trip"]),
        2,
    )
    budget = float(budget_weekly or 0) if budget_weekly is not None else 0.0
    remainder = round(budget - estimated_total, 2) if budget else None
    return {
        "estimated_total": estimated_total,
        "trip_estimate_if_all_green": trip_active_total,
        "budget_weekly": budget_weekly,
        "remainder": remainder,
    }


@shopping_bp.route("/api/shopping", methods=["GET"])
def get_shopping_cart():
    """Текущая корзина из БД с группировкой по датам."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    rows = conn.execute(
        """SELECT sl.*, pr.name as ref_name
           FROM shopping_list sl
           JOIN products_ref pr ON pr.id = sl.product_id
           WHERE sl.user_id = ?
           ORDER BY sl.for_date ASC, sl.id ASC""",
        (internal_user_id,),
    ).fetchall()

    urow = conn.execute(
        "SELECT budget_weekly, budget_tier FROM users WHERE id = ?", (internal_user_id,)
    ).fetchone()
    bw = effective_weekly_limit_rub(
        urow["budget_weekly"] if urow else None,
        urow["budget_tier"] if urow else None,
    ) if urow else None

    grouped = {}
    flat = []
    for r in rows:
        rd = dict(r)
        pub = _shopping_row_public(rd, rd.get("ref_name") or "")
        flat.append(pub)
        grouped.setdefault(pub["for_date"], []).append(pub)

    dates = sorted(grouped.keys())
    summary = build_cart_summary([dict(row) for row in rows], bw)
    empty = len(flat) == 0

    days_param = request.args.get("days")
    try:
        hint_days = int(days_param) if days_param is not None and str(days_param).strip() != "" else 2
    except (TypeError, ValueError):
        hint_days = 2
    hint_days = max(1, min(hint_days, 7))
    empty_hint = shopping_empty_hint_code(conn, internal_user_id, hint_days, empty) if empty else None

    conn.close()

    return jsonify({
        "grouped_by_date": grouped,
        "items": flat,
        "dates": dates,
        "summary": summary,
        "empty": empty,
        "empty_hint": empty_hint,
    })


@shopping_bp.route("/api/shopping/trip-begin", methods=["POST"])
def shopping_trip_begin():
    """
    Перед режимом магазина: все строки в «ещё не отмечено купил» (skipped_in_trip=1).
    Пользователь проходит список и нажимает «Купил» (сбрасывает флаг); «Вернуть» — снова в ожидание.
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    cur = conn.execute(
        "UPDATE shopping_list SET skipped_in_trip = 1 WHERE user_id = ?",
        (internal_user_id,),
    )
    conn.commit()
    updated = cur.rowcount
    conn.close()
    return jsonify({"status": "ok", "updated": updated})


@shopping_bp.route("/api/shopping/build", methods=["POST"])
def build_shopping():
    """Собрать / пересобрать корзину из плана на N дней (дефолт 2)."""
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    days = int(data.get("days", 2))
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    stats = rebuild_shopping_list(conn, internal_user_id, days=days)
    conn.commit()
    conn.close()
    stats["status"] = "ok"
    return jsonify(stats)


@shopping_bp.route("/api/shopping/items/<int:item_id>", methods=["PATCH"])
def patch_shopping_item(item_id):
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    row = conn.execute(
        "SELECT * FROM shopping_list WHERE id = ? AND user_id = ?",
        (item_id, internal_user_id),
    ).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Позиция не найдена"}), 404

    name = data.get("name")
    amount = data.get("amount_needed")
    unit = data.get("unit")
    cost = data.get("estimated_cost")
    skipped = data.get("skipped_in_trip")

    if skipped is not None:
        conn.execute(
            "UPDATE shopping_list SET skipped_in_trip = ? WHERE id = ?",
            (1 if skipped else 0, item_id),
        )
    if name is not None and str(name).strip():
        conn.execute(
            "UPDATE shopping_list SET display_name = ? WHERE id = ?",
            (str(name).strip(), item_id),
        )
    if amount is not None:
        conn.execute(
            "UPDATE shopping_list SET amount_needed = ? WHERE id = ?",
            (float(amount), item_id),
        )
    if unit is not None and str(unit).strip():
        conn.execute(
            "UPDATE shopping_list SET display_unit = ? WHERE id = ?",
            (str(unit).strip(), item_id),
        )
    if cost is not None:
        conn.execute(
            "UPDATE shopping_list SET estimated_cost = ? WHERE id = ?",
            (float(cost), item_id),
        )

    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})


@shopping_bp.route("/api/shopping/items/<int:item_id>", methods=["DELETE"])
def delete_shopping_item(item_id):
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    cur = conn.execute(
        "DELETE FROM shopping_list WHERE id = ? AND user_id = ?",
        (item_id, internal_user_id),
    )
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if not deleted:
        return jsonify({"error": "Позиция не найдена"}), 404
    return jsonify({"status": "ok"})


@shopping_bp.route("/api/shopping/items", methods=["POST"])
def add_manual_shopping_item():
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    raw_name = (data.get("name") or "").strip()
    amount = float(data.get("amount") or 0)
    unit = (data.get("unit") or "г").strip()
    for_date = (data.get("for_date") or "").strip()
    est = data.get("estimated_cost")

    if not user_id or not raw_name or amount <= 0 or not for_date:
        return jsonify({"error": "user_id, name, amount и for_date обязательны"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    pid = find_or_create_product(conn, raw_name)
    pref = conn.execute("SELECT unit FROM products_ref WHERE id = ?", (pid,)).fetchone()

    display_unit = unit or (pref["unit"] if pref else "г")

    if est is None:
        ppu = default_price_per_reference_unit(display_unit)
        est_cost = estimate_line_cost(amount, display_unit, ppu)
    else:
        est_cost = float(est)

    cur = conn.execute(
        """INSERT INTO shopping_list (
            user_id, product_id, amount_needed, estimated_cost, for_date,
            is_purchased, skipped_in_trip, display_name, display_unit, is_manual
        ) VALUES (?,?,?,?,?,0,1,?,?,1)""",
        (
            internal_user_id,
            pid,
            amount,
            round(est_cost, 2),
            for_date,
            raw_name,
            display_unit,
        ),
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"status": "ok", "id": new_id})


@shopping_bp.route("/api/shopping/complete", methods=["POST"])
def complete_shopping_trip():
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    confirm_replan = bool(data.get("confirm_replan", False))
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    rows = conn.execute(
        "SELECT * FROM shopping_list WHERE user_id = ?", (internal_user_id,)
    ).fetchall()
    greens = [dict(r) for r in rows if not r["skipped_in_trip"]]
    reds = [dict(r) for r in rows if r["skipped_in_trip"]]

    for r in reds:
        if not (r.get("display_name") or "").strip():
            pref = conn.execute(
                "SELECT name FROM products_ref WHERE id = ?", (r["product_id"],)
            ).fetchone()
            if pref and pref["name"]:
                r["display_name"] = pref["name"]

    pantry_acc = {}  # product_id -> (amount_sum, weighted_price_accum, weight)
    spent = 0.0
    for r in greens:
        spent += float(r["estimated_cost"] or 0)
        nm = (r.get("display_name") or "").strip()
        if not nm:
            pr = conn.execute("SELECT name FROM products_ref WHERE id = ?", (r["product_id"],)).fetchone()
            nm = (pr["name"] if pr else "") or "Позиция"
        cost_line = float(r["estimated_cost"] or 0)
        if cost_line > 0:
            conn.execute(
                """INSERT INTO shopping_spend_lines (user_id, product_name, amount_rub)
                   VALUES (?,?,?)""",
                (internal_user_id, nm, cost_line),
            )
        pid = r["product_id"]
        amt = pantry_inbound_amount_after_purchase(r)
        unit = r["display_unit"] or "г"
        unit_price = implied_unit_price_from_line(amt, unit, float(r["estimated_cost"] or 0))

        prev = pantry_acc.setdefault(pid, {"amt": 0.0, "ppu_acc": 0.0})
        prev["amt"] += amt
        prev["ppu_acc"] += unit_price * amt

    for pid, pack in pantry_acc.items():
        total_amt = pack["amt"]
        blended = pack["ppu_acc"] / (total_amt + 1e-9)
        conn.execute(
            """INSERT INTO pantry (user_id, product_id, amount, price_per_unit)
               VALUES (?,?,?,?)""",
            (internal_user_id, pid, total_amt, round(blended, 4)),
        )

    conn.execute(
        "INSERT INTO shopping_spend_log (user_id, amount, note) VALUES (?,?,?)",
        (internal_user_id, round(spent, 2), "Завершение закупки"),
    )

    conn.execute("DELETE FROM shopping_list WHERE user_id = ?", (internal_user_id,))
    conn.commit()
    conn.close()

    skipped_names = []
    for r in reds:
        nm = (r.get("display_name") or "").strip()
        if nm and nm not in skipped_names:
            skipped_names.append(nm)

    resp = {
        "status": "ok",
        "spent_recorded": round(spent, 2),
        "lines_to_pantry": len(greens),
        "skipped_count": len(reds),
        "skipped_names": skipped_names,
        "replan_stub": False,
        "message": "",
    }

    if reds:
        resp["message"] = (
            "Есть позиции без отметки «Купил» (не попадут в кладовую). Автоматический пересчёт плана будет в следующей версии — "
            "пока отрегулируй меню или кладовую вручную."
        )
        if confirm_replan:
            resp["replan_stub"] = True

    return jsonify(resp)


@shopping_bp.route("/api/shopping/dialog-replan", methods=["POST"])
def dialog_replan_stub():
    """Заготовка под пересчёт плана после нехватки продуктов."""
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400
    conn = get_db()
    try:
        resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404
    conn.close()
    return jsonify(
        {
            "status": "ok",
            "replan_requested": True,
            "implemented": False,
            "hint": "Подключите generate_weekly_plan / adjust_remaining_meals после уточнения продуктов.",
        },
    )


@shopping_bp.route("/api/shopping/legacy-sum", methods=["GET"])
def legacy_inline_estimate():
    """
    Совместимость: расчёт «на лету» без БД — для отладки. Без сохранения.
    Использовать основной контракт: POST /build + GET /shopping.
    """
    user_id = request.args.get("user_id")
    days = int(request.args.get("days", 2))
    if not user_id:
        return jsonify({"error": "user_id обязателен"}), 400

    conn = get_db()
    try:
        internal_user_id = resolve_user_id(conn, user_id)
    except NotFoundError as e:
        conn.close()
        return jsonify({"error": str(e)}), 404

    snap = rebuild_shopping_list(conn, internal_user_id, days=days)
    rows = conn.execute(
        """SELECT sl.*, pr.name as ref_name
           FROM shopping_list sl JOIN products_ref pr ON pr.id = sl.product_id
           WHERE sl.user_id = ? ORDER BY sl.for_date ASC""",
        (internal_user_id,),
    ).fetchall()

    grouped = {}
    shopping_list_out = []
    for r in rows:
        rd = dict(r)
        pub = _shopping_row_public(rd, rd.get("ref_name") or "")
        shopping_list_out.append(pub)
        grouped.setdefault(pub["for_date"], []).append(pub)

    conn.rollback()
    conn.close()

    snap["items"] = shopping_list_out
    snap["grouped_by_date"] = grouped
    snap["note"] = "preview_only_rolled_back"
    return jsonify(snap)