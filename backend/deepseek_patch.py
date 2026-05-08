"""
Изменения в deepseek.py:
1. build_training_context — добавлено вычисление окна последнего приёма пищи по sleep_time
2. generate_weekly_plan — goal_line: "custom" передаёт только goal_custom в AI, без подмешивания пресета
3. КБЖУ для "custom" цели теперь остаётся "recomposition"-логикой как дефолт (можно изменить)

Это ПАТЧ — показывает только изменённые функции. Заменить соответствующие блоки в оригинальном deepseek.py.
"""


def build_training_context(user_data: dict) -> str:
    """
    Строит контекст тренировок и режима сна для промпта.
    Вычисляет допустимое время последнего приёма пищи из sleep_time.
    """
    training_days = user_data.get("training_days", [])
    day_names = [
        "понедельник", "вторник", "среда",
        "четверг", "пятница", "суббота", "воскресенье",
    ]
    training_str = (
        "тренировочных дней нет"
        if not training_days
        else ", ".join(day_names[d] for d in training_days if 0 <= d <= 6)
    )

    wake_time  = user_data.get("wake_time",  "08:00")
    sleep_time = user_data.get("sleep_time", "23:00")

    # Вычисляем время последнего приёма пищи = sleep_time - 2 часа
    try:
        sh, sm = map(int, sleep_time.split(":"))
        total_minutes = sh * 60 + sm - 120          # минус 2 часа
        if total_minutes < 0:
            total_minutes += 24 * 60
        last_meal_h = total_minutes // 60
        last_meal_m = total_minutes % 60
        last_meal_time = f"{last_meal_h:02d}:{last_meal_m:02d}"
    except (ValueError, AttributeError):
        last_meal_time = "21:00"

    # Вычисляем время завтрака = wake_time + 30 минут
    try:
        wh, wm = map(int, wake_time.split(":"))
        breakfast_total = wh * 60 + wm + 30
        breakfast_h = (breakfast_total // 60) % 24
        breakfast_m = breakfast_total % 60
        breakfast_time = f"{breakfast_h:02d}:{breakfast_m:02d}"
    except (ValueError, AttributeError):
        breakfast_time = "08:30"

    return f"""
Тренировочные дни: {training_str}.
Время подъёма: {wake_time}. Завтрак планировать в {breakfast_time} (через 30 мин после подъёма).
Время отхода ко сну: {sleep_time}. Последний приём пищи не позднее {last_meal_time} (за 2 часа до сна).
Ужин — лёгкий: преимущественно белок и овощи, минимум углеводов и жиров, не более 400 ккал.
Не планировать приёмы пищи позже {last_meal_time}.
"""


# ── Заменить блок goal_line в generate_weekly_plan ────────────────────────────
#
# БЫЛО:
#   goal_line = (
#       f"Своя цель (текст пользователя): {user_data.get('goal_custom', '')}"
#       if goal == "custom"
#       else f"{goal} (рекомпозиция — набор мышц с одновременным снижением жира)"
#   )
#
# СТАЛО:

def _build_goal_line(goal: str, goal_custom: str | None) -> str:
    """
    Формирует строку цели для промпта.

    - Пресеты: передают стандартное описание стратегии.
    - custom: передаёт ТОЛЬКО текст пользователя — AI строит план
      исключительно под него, без подмешивания пресетной стратегии.
    """
    PRESET_DESCRIPTIONS = {
        "recomposition": (
            "Рекомпозиция тела — одновременный набор мышц и снижение жира. "
            "Калории близки к поддерживающим, акцент на белок, чередование "
            "тренировочных и восстановительных дней."
        ),
        "mass_gain": (
            "Набор мышечной массы — умеренный профицит калорий (~300–500 ккал выше нормы). "
            "Высокое потребление белка и углеводов, особенно в тренировочные дни."
        ),
        "cutting": (
            "Сушка — дефицит калорий (~300–500 ккал ниже нормы) при сохранении мышечной массы. "
            "Высокий белок, минимум простых углеводов, акцент на сытные нежирные продукты."
        ),
    }

    if goal == "custom":
        if goal_custom and goal_custom.strip():
            return f"Цель пользователя (свободная формулировка): {goal_custom.strip()}"
        # Fallback если custom выбран, но текст не заполнен
        return PRESET_DESCRIPTIONS["recomposition"]

    return PRESET_DESCRIPTIONS.get(goal, PRESET_DESCRIPTIONS["recomposition"])


# ── Использование в generate_weekly_plan ─────────────────────────────────────
# Заменить строки 292-295 в оригинальном deepseek.py на:
#
#   goal_line = _build_goal_line(goal, user_data.get("goal_custom"))
#
# И в промпте строку:
#   f"Цель: {goal_line}\n"
# остаётся без изменений.