import os


def _load_repo_dotenv_best_effort() -> None:
    """Loads KEY=value pairs from repo-root .env if present.

    Does not override variables already set (e.g. in WSGI). No python-dotenv required.
    """
    base_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base_parent, ".env")
    if not os.path.isfile(path):
        return
    try:
        with open(path, encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        return


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


BASE_DIR = os.path.dirname(__file__)
_load_repo_dotenv_best_effort()
DB_PATH = os.environ.get("FOOD_PLANNER_DB_PATH", os.path.join(BASE_DIR, "food_planner.db"))
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")


def openrouter_api_key() -> str:
    """Reads key at runtime (WSGI-safe; survives late env updates within the worker)."""
    return (os.environ.get("OPENROUTER_API_KEY") or "").strip()
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
FLASK_DEBUG = _as_bool(os.environ.get("FLASK_DEBUG"), default=True)
