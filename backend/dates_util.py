"""Календарные даты в часовом поясе Europe/Moscow (UTC+3)."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")


def today_msk() -> date:
    return datetime.now(MSK).date()


def today_msk_iso() -> str:
    return today_msk().strftime("%Y-%m-%d")


def parse_iso_date(s: str | None) -> date | None:
    if not s or not isinstance(s, str):
        return None
    try:
        return datetime.strptime(s.strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def iso(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def add_days(d: date, n: int) -> date:
    return d + timedelta(days=n)
