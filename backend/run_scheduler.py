import time
from bot import start_scheduler
from config import TELEGRAM_BOT_TOKEN


if __name__ == "__main__":
    if not TELEGRAM_BOT_TOKEN:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан")
    start_scheduler()
    while True:
        time.sleep(3600)
