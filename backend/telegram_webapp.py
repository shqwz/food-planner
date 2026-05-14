"""Проверка Telegram Mini App initData (HMAC) и выдача user id для фронта."""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from flask import Blueprint, jsonify, request

from config import TELEGRAM_BOT_TOKEN

telegram_webapp_bp = Blueprint("telegram_webapp", __name__)

_MAX_AUTH_AGE_SEC = 86400


def _validate_init_data(init_data: str, bot_token: str) -> dict[str, str]:
    if not init_data or not isinstance(init_data, str):
        raise ValueError("init_data пуст")
    if not bot_token:
        raise ValueError("нет токена бота")

    pairs = parse_qsl(init_data.strip(), keep_blank_values=True, strict_parsing=False)
    params = dict(pairs)
    recv_hash = params.pop("hash", None)
    params.pop("signature", None)
    if not recv_hash:
        raise ValueError("нет hash в init_data")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    computed = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(computed, recv_hash):
        raise ValueError("неверная подпись init_data")

    auth_raw = params.get("auth_date")
    if auth_raw:
        try:
            auth_ts = int(auth_raw)
            if auth_ts > 0 and time.time() - auth_ts > _MAX_AUTH_AGE_SEC:
                raise ValueError("init_data устарел")
        except ValueError as e:
            if "устарел" in str(e) or "expired" in str(e).lower():
                raise
    return params


@telegram_webapp_bp.route("/api/auth/telegram", methods=["POST"])
def auth_telegram_webapp():
    """
    Принимает сырой initData из Telegram.WebApp.initData, проверяет HMAC (TELEGRAM_BOT_TOKEN).
    Возвращает telegram_id и имя для API user_id.
    """
    if not TELEGRAM_BOT_TOKEN:
        return jsonify({"error": "TELEGRAM_BOT_TOKEN не задан на сервере"}), 503

    data = request.get_json(force=True, silent=True) or {}
    init_data = (data.get("init_data") or data.get("initData") or "").strip()
    if not init_data:
        return jsonify({"error": "init_data обязателен"}), 400

    try:
        params = _validate_init_data(init_data, TELEGRAM_BOT_TOKEN)
    except ValueError as e:
        return jsonify({"error": str(e)}), 401

    raw_user = params.get("user")
    if not raw_user:
        return jsonify({"error": "в init_data нет поля user"}), 401
    try:
        user = json.loads(raw_user)
    except json.JSONDecodeError:
        return jsonify({"error": "поле user не JSON"}), 401

    try:
        tid = int(user.get("id"))
    except (TypeError, ValueError):
        return jsonify({"error": "в user нет id"}), 401
    if tid <= 0:
        return jsonify({"error": "некорректный user id"}), 401

    fn = (user.get("first_name") or "").strip()
    un = (user.get("username") or "").strip()
    name = fn or (f"@{un}" if un else "Пользователь")

    return jsonify(
        {
            "telegram_id": tid,
            "first_name": fn or None,
            "username": un or None,
            "name": name,
        }
    )
