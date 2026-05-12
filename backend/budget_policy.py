"""Единые числа и правила недельного бюджета для профиля, плана и корзины."""

from __future__ import annotations

# Пресеты tier → руб/нед (храним в users.budget_weekly при сохранении профиля)
TIER_PRESET_RUB: dict[str, float] = {
    "economy": 3000.0,
    "medium": 6000.0,
}

# Если tier не распознан и сумма в БД 0 — безопасный дефолт между пресетами
DEFAULT_WEEKLY_RUB = 4500.0

# Безлимит: в БД budget_weekly = 0, ориентир только по ценам/упаковкам
UNLIMITED_DB_RUB = 0.0


def effective_weekly_limit_rub(budget_weekly, budget_tier: str | None) -> float | None:
    """
    None — режим без жёсткого потолка (tier unlimited).
    Иначе положительное число руб/нед для промпта, алгоритмов и корзины.
    """
    tier = (budget_tier or "").strip().lower()
    if tier == "unlimited":
        return None
    try:
        bw = float(budget_weekly or 0)
    except (TypeError, ValueError):
        bw = 0.0
    if bw > 0:
        return bw
    if tier in TIER_PRESET_RUB:
        return TIER_PRESET_RUB[tier]
    if tier == "custom":
        return max(500.0, bw) if bw > 0 else DEFAULT_WEEKLY_RUB
    return DEFAULT_WEEKLY_RUB


def working_budget_target_rub(weekly_limit: float) -> float:
    """
    Целевая сумма для ИИ чуть ниже потолка — запас на округления и минимальные фасовки.
    Для низких лимитов оставляем больший относительный запас (модель чаще перелезает).
    """
    limit = float(weekly_limit or 0)
    if limit <= 0:
        return 0.0
    if limit <= 3500:
        ratio = 0.93
    elif limit <= 8000:
        ratio = 0.91
    else:
        ratio = 0.89
    return round(limit * ratio, 2)


def tier_hint_ru(budget_tier: str | None) -> str:
    t = (budget_tier or "").strip().lower()
    return {
        "economy": "пресет «до 3 000 ₽/нед»",
        "medium": "пресет «до 6 000 ₽/нед»",
        "unlimited": "без жёсткого недельного лимита",
        "custom": "своя фиксированная сумма в неделю",
    }.get(t, t or "не указан")
