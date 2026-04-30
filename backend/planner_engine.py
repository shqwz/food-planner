from datetime import datetime, timedelta


def _parse_time_hhmm(value: str, fallback_minutes: int) -> int:
    try:
        hh, mm = value.split(":")
        return int(hh) * 60 + int(mm)
    except Exception:
        return fallback_minutes


def _goal_multipliers(goal: str):
    goal = (goal or "recomposition").lower()
    if goal == "mass_gain":
        return {"kcal": 36, "protein": 2.2, "fat": 0.9}
    if goal == "cutting":
        return {"kcal": 25, "protein": 2.2, "fat": 0.8}
    if goal == "maintain":
        return {"kcal": 30, "protein": 1.9, "fat": 0.9}
    return {"kcal": 29, "protein": 2.0, "fat": 0.9}


def build_planning_context(user: dict, training_days: list, pantry_items: list, planner_payload: dict | None):
    planner_payload = planner_payload or {}
    user_weight = float(user.get("weight") or 75)
    wake_time = user.get("wake_time") or "08:00"
    sleep_time = user.get("sleep_time") or "23:00"
    budget_weekly = float(user.get("budget_weekly") or 0)
    goal = user.get("goal") or "recomposition"
    m = _goal_multipliers(goal)

    wake_minutes = _parse_time_hhmm(wake_time, 8 * 60)
    sleep_minutes = _parse_time_hhmm(sleep_time, 23 * 60)
    day_span = (sleep_minutes - wake_minutes) % (24 * 60)
    auto_meals_count = 4 if day_span >= 14 * 60 else 3

    sleep_quality = planner_payload.get("sleep_quality", "normal")
    sleep_delta = -0.04 if sleep_quality == "poor" else 0

    overeating_event = planner_payload.get("overeating_event")
    overeating_date = overeating_event.get("date") if overeating_event else None
    overeating_scale = overeating_event.get("scale", "medium") if overeating_event else None
    overeating_kcal = {"low": 200, "medium": 350, "high": 550}.get(overeating_scale, 350)

    tomorrow = datetime.now().date() + timedelta(days=1)
    daily_targets = []
    explanations = []

    for i in range(7):
        day_date = tomorrow + timedelta(days=i)
        weekday = day_date.weekday()
        is_training = weekday in training_days
        base_kcal = user_weight * m["kcal"]
        if is_training:
            base_kcal *= 1.12
        base_kcal *= (1 + sleep_delta)

        if overeating_date:
            if day_date.strftime("%Y-%m-%d") == overeating_date:
                base_kcal += overeating_kcal
            elif day_date.strftime("%Y-%m-%d") == (datetime.strptime(overeating_date, "%Y-%m-%d").date() - timedelta(days=1)).strftime("%Y-%m-%d"):
                base_kcal *= 0.9
            elif day_date.strftime("%Y-%m-%d") == (datetime.strptime(overeating_date, "%Y-%m-%d").date() + timedelta(days=1)).strftime("%Y-%m-%d"):
                base_kcal *= 0.92

        protein = round(user_weight * m["protein"], 1)
        fat = round(user_weight * m["fat"], 1)
        carbs = round(max(0, (base_kcal - protein * 4 - fat * 9) / 4), 1)

        daily_targets.append({
            "date": day_date.strftime("%Y-%m-%d"),
            "is_training": is_training,
            "kcal": round(base_kcal),
            "protein": protein,
            "fat": fat,
            "carbs": carbs,
            "meals_count": planner_payload.get("meals_count") or auto_meals_count,
            "pre_post_workout_focus": bool(is_training),
        })

        why = []
        if is_training:
            why.append("Тренировочный день: калораж повышен и добавлен pre/post workout фокус")
        if sleep_quality == "poor":
            why.append("Плохой сон: мягкая коррекция целей на день")
        if overeating_date and day_date.strftime("%Y-%m-%d") == overeating_date:
            why.append("Учтено событие переедания")
        explanations.append({"date": day_date.strftime("%Y-%m-%d"), "why": "; ".join(why) if why else "Стандартный баланс под цель"})

    pantry_cost_covered = 0
    for p in pantry_items:
        amount = float(p.get("amount") or 0)
        price = float(p.get("price_per_unit") or 0)
        pantry_cost_covered += max(0, amount / 1000 * price)

    algorithm_context = {
        "daily_targets": daily_targets,
        "explanations": explanations,
        "budget_weekly_limit": budget_weekly,
        "estimated_pantry_coverage_cost": round(pantry_cost_covered, 2),
        "automation_mode": "minimal-choice",
    }

    return algorithm_context
