import os


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.environ.get("FOOD_PLANNER_DB_PATH", os.path.join(BASE_DIR, "food_planner.db"))
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
FLASK_DEBUG = _as_bool(os.environ.get("FLASK_DEBUG"), default=True)
