import requests
import time
from threading import Thread
from datetime import datetime
from database import get_db
from config import TELEGRAM_BOT_TOKEN

TOKEN = TELEGRAM_BOT_TOKEN
BASE_URL = f"https://api.telegram.org/bot{TOKEN}"


def send_message(chat_id: int, text: str):
    """Отправляет сообщение пользователю"""
    if not TOKEN:
        return
    try:
        requests.post(
            f"{BASE_URL}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=10
        )
    except Exception as e:
        print(f"Ошибка отправки сообщения: {e}")


def check_meal_times():
    """Проверяет, нужно ли отправить напоминание о приёме пищи"""
    now = datetime.now()
    current_time = now.strftime("%H:%M")
    today = now.strftime("%Y-%m-%d")

    conn = get_db()

    # Получаем всех пользователей
    users = conn.execute("SELECT * FROM users").fetchall()

    for user in users:
        user_id = user["telegram_id"]

        # Проверяем план на сегодня
        plan = conn.execute('''
            SELECT meals_json FROM meal_plan
            WHERE user_id = ? AND plan_date = ?
        ''', (user["id"], today)).fetchone()

        if not plan:
            continue

        import json
        meals = json.loads(plan["meals_json"])

        for meal in meals:
            meal_time = meal.get("time", "")
            if meal_time == current_time:
                # Проверяем, не отмечен ли уже этот приём
                already = conn.execute('''
                    SELECT id FROM consumed_meals
                    WHERE user_id = ? AND plan_date = ? AND meal_type = ?
                ''', (user["id"], today, meal["type"])).fetchone()

                if not already:
                    msg = f"🔔 Время {meal['type']}: {meal['dish_name']} ({meal.get('total_kcal', '?')} ккал)\n"
                    msg += f"📝 {meal.get('recipe_hint', '')}"
                    send_message(user_id, msg)

    conn.close()


def send_daily_summary():
    """Отправляет вечернюю сводку"""
    today = datetime.now().strftime("%Y-%m-%d")
    conn = get_db()
    users = conn.execute("SELECT * FROM users").fetchall()

    for user in users:
        user_id = user["telegram_id"]

        # Считаем итоги за день
        totals = conn.execute('''
            SELECT SUM(total_kcal) as kcal, SUM(total_protein) as protein,
                   SUM(total_fat) as fat, SUM(total_carbs) as carbs
            FROM consumed_meals
            WHERE user_id = ? AND plan_date = ?
        ''', (user["id"], today)).fetchone()

        # Проверяем, все ли приёмы отмечены
        plan = conn.execute('''
            SELECT meals_json FROM meal_plan
            WHERE user_id = ? AND plan_date = ?
        ''', (user["id"], today)).fetchone()

        if not plan:
            continue

        import json
        planned_meals = json.loads(plan["meals_json"])
        eaten_meals = conn.execute('''
            SELECT meal_type FROM consumed_meals
            WHERE user_id = ? AND plan_date = ?
        ''', (user["id"], today)).fetchall()
        eaten_types = [m["meal_type"] for m in eaten_meals]

        missed = [m["type"] for m in planned_meals if m["type"] not in eaten_types]

        msg = f"📊 Итоги дня ({today}):\n"
        msg += f"🔥 Калории: {totals['kcal'] or 0:.0f} ккал\n"
        msg += f"💪 Белки: {totals['protein'] or 0:.0f}г\n"
        msg += f"🧈 Жиры: {totals['fat'] or 0:.0f}г\n"
        msg += f"🍞 Углеводы: {totals['carbs'] or 0:.0f}г\n"

        if missed:
            msg += f"\n⚠️ Не отмечены: {', '.join(missed)}"

        send_message(user_id, msg)

    conn.close()


def start_scheduler():
    """Запускает фоновый планировщик уведомлений"""
    def loop():
        while True:
            now = datetime.now()
            # Напоминания о приёмах пищи (проверка раз в минуту)
            check_meal_times()
            # Вечерняя сводка в 21:00
            if now.strftime("%H:%M") == "21:00":
                send_daily_summary()
            time.sleep(60)  # проверка раз в минуту

    thread = Thread(target=loop, daemon=True)
    thread.start()
    print("✅ Планировщик уведомлений запущен")


if __name__ == "__main__":
    print("Telegram бот готов (установи TELEGRAM_BOT_TOKEN)")