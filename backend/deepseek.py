import requests
import json
import os
import time
import re

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "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")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Бесплатные модели на OpenRouter (выбираем Gemini 2.0 Flash)
MODEL = "google/gemini-2.0-flash-001"  # бесплатная, 200 запросов/день


def call_ai(prompt: str, system_prompt: str = None, temperature: float = 0.7) -> dict:
    """
    Отправляет запрос к OpenRouter и возвращает ответ как dict.
    С повторными попытками при ошибках.
    """
    if not system_prompt:
        system_prompt = (
            "Ты — профессиональный нутрициолог и спортивный диетолог. "
            "Всегда отвечай строго в формате JSON. "
            "Не добавляй markdown-разметку, не оборачивай в ```json. "
            "Отвечай ТОЛЬКО чистым JSON-объектом, начиная с { и заканчивая }."
        )

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "Food Planner"
    }

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": temperature,
        "max_tokens": 8192,
        "response_format": {"type": "json_object"}
    }

    max_retries = 5
    last_error = None

    for attempt in range(max_retries):
        try:
            response = requests.post(
                OPENROUTER_URL,
                headers=headers,
                json=payload,
                timeout=90
            )

            # 429 — Too Many Requests
            if response.status_code == 429:
                wait = (attempt + 1) * 10
                print(f"⏳ Лимит запросов (429), ждём {wait} сек (попытка {attempt + 1}/{max_retries})...")
                time.sleep(wait)
                continue

            # 503 — сервис перегружен
            if response.status_code == 503:
                wait = (attempt + 1) * 5
                print(f"⏳ Сервис перегружен (503), ждём {wait} сек...")
                time.sleep(wait)
                continue

            # 402 — лимит исчерпан
            if response.status_code == 402:
                print("❌ Дневной лимит OpenRouter исчерпан. Попробуй завтра.")
                raise Exception("Дневной лимит OpenRouter исчерпан")

            response.raise_for_status()
            result = response.json()

            # Проверяем наличие ответа
            if "choices" not in result or not result["choices"]:
                raise Exception(f"Пустой ответ от OpenRouter: {result}")

            content = result["choices"][0]["message"]["content"]

            # Пробуем распарсить JSON
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                # Ищем JSON внутри текста
                match = re.search(r'\{.*\}', content, re.DOTALL)
                if match:
                    return json.loads(match.group())
                raise Exception(f"OpenRouter вернул не JSON. Ответ: {content[:300]}")

        except requests.exceptions.ConnectionError as e:
            last_error = e
            if attempt < max_retries - 1:
                wait = (attempt + 1) * 5
                print(f"⏳ Ошибка соединения, ждём {wait} сек...")
                time.sleep(wait)
                continue
            raise Exception(f"Ошибка соединения с OpenRouter: {str(e)}")

        except requests.exceptions.Timeout:
            last_error = "timeout"
            if attempt < max_retries - 1:
                print(f"⏳ Таймаут, пробуем снова...")
                time.sleep(5)
                continue
            raise Exception("Таймаут запроса к OpenRouter после всех попыток")

        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                wait = (attempt + 1) * 5
                print(f"⏳ Ошибка: {str(e)[:100]}, ждём {wait} сек...")
                time.sleep(wait)
                continue
            raise

    raise Exception(f"Ошибка OpenRouter после {max_retries} попыток: {str(last_error)}")


def build_training_context(user_data: dict) -> str:
    """Строит контекст тренировок и сна для промпта"""
    training_days = user_data.get("training_days", [])
    day_names = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]

    training_str = "тренировочных дней нет" if not training_days else \
        ", ".join([day_names[d] for d in training_days])

    return f"""
Тренировочные дни: {training_str}.
Время подъёма: {user_data.get('wake_time', '08:00')}.
Время отхода ко сну: {user_data.get('sleep_time', '23:00')}.
Завтрак планировать через 30-60 минут после подъёма.
Ужин планировать за 2-3 часа до сна.
"""


def build_budget_context(budget_weekly: float, products_with_prices: list) -> str:
    """Строит контекст бюджета для промпта"""
    return f"""
Бюджет на неделю: {budget_weekly} руб.
Цены продуктов (за кг/л/шт): {json.dumps(products_with_prices, ensure_ascii=False)}

ВАЖНО: общая стоимость ВСЕХ запланированных продуктов на неделю НЕ должна превышать бюджет.
Учитывай, что часть продуктов УЖЕ есть на складе.
"""


def build_products_context(products: list) -> str:
    """Строит контекст доступных продуктов для промпта"""
    if not products:
        return "Продуктов на складе нет. Предложи план из доступных недорогих продуктов."

    regular = []
    expiring = []

    for p in products:
        item = (
            f"{p['name']} (доступно {p['amount']}{p['unit']}, "
            f"калорийность {p['calories_per_100']} ккал/100г, "
            f"белки {p['protein_per_100']}г, жиры {p['fat_per_100']}г, углеводы {p['carbs_per_100']}г"
        )
        if p.get("price_per_unit", 0) > 0:
            item += f", цена {p['price_per_unit']} руб/ед"
        item += ")"

        if p.get("expiry_date"):
            expiring.append(item)
        else:
            regular.append(item)

    context = "ДОСТУПНЫЕ ПРОДУКТЫ:\n" + "\n".join(regular)
    if expiring:
        context += "\n\nПРОДУКТЫ С ИСТЕКАЮЩИМ СРОКОМ (использовать в первую очередь):\n" + "\n".join(expiring)

    return context


def generate_weekly_plan(user_data: dict, products: list) -> dict:
    """Генерирует план питания на 7 дней с учётом тренировок, сна, бюджета и остатков."""
    weight = user_data.get("weight", 75)
    goal = user_data.get("goal", "recomposition")

    if goal == "recomposition":
        training_kcal = weight * 33
        rest_kcal = weight * 28
        protein = weight * 2.0
    elif goal == "mass_gain":
        training_kcal = weight * 38
        rest_kcal = weight * 33
        protein = weight * 2.2
    else:
        training_kcal = weight * 28
        rest_kcal = weight * 23
        protein = weight * 2.2

    fat = weight * 0.9
    training_carbs = max(0, (training_kcal - protein * 4 - fat * 9) / 4)
    rest_carbs = max(0, (rest_kcal - protein * 4 - fat * 9) / 4)

    training_context = build_training_context(user_data)
    products_with_prices = [
        {"name": p["name"], "price": p.get("price_per_unit", 0)}
        for p in products if p.get("price_per_unit", 0) > 0
    ]
    budget_context = build_budget_context(user_data.get("budget_weekly", 2000), products_with_prices)
    products_context = build_products_context(products)
    preferences = user_data.get("preferences", "нет особых предпочтений")

    prompt = f"""
Составь план питания на 7 дней (начиная с завтрашнего дня).

ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ:
Возраст: {user_data.get('age', 25)} лет
Вес: {weight} кг
Рост: {user_data.get('height', 175)} см
Цель: {goal} (рекомпозиция — набор мышц с одновременным снижением жира)
Предпочтения / исключения: {preferences}

{training_context}

ЦЕЛЕВЫЕ ПОКАЗАТЕЛИ:
- Дни тренировок: {training_kcal:.0f} ккал, белки {protein:.0f}г, жиры {fat:.0f}г, углеводы {training_carbs:.0f}г
- Дни отдыха: {rest_kcal:.0f} ккал, белки {protein:.0f}г, жиры {fat:.0f}г, углеводы {rest_carbs:.0f}г

{budget_context}

{products_context}

ТРЕБОВАНИЯ:
1. Каждый день — 3-4 приёма пищи.
2. Дни тренировок — больше углеводов в обеде и завтраке.
3. Дни отдыха — меньше углеводов, больше белка и овощей.
4. Ужин всегда лёгкий, акцент на белок, минимум углеводов.
5. Учитывай время подъёма и отхода ко сну.
6. Блюда простые, без сложной готовки.
7. Продукты с истекающим сроком — в первую очередь.
8. Не превышай бюджет.

Верни строго JSON:
{{
  "week_plan": {{
    "YYYY-MM-DD": {{
      "day_type": "training или rest",
      "meals": [
        {{
          "type": "breakfast",
          "time": "08:30",
          "dish_name": "Омлет с гречкой",
          "ingredients": [
            {{"name": "яйцо", "amount": 2, "unit": "шт"}},
            {{"name": "гречка сухая", "amount": 60, "unit": "г"}}
          ],
          "recipe_hint": "Краткое описание — 1 предложение",
          "total_kcal": 350,
          "total_protein": 25,
          "total_fat": 15,
          "total_carbs": 30,
          "estimated_cost": 35.00
        }}
      ],
      "daily_totals": {{
        "kcal": 2500,
        "protein": 180,
        "fat": 70,
        "carbs": 250,
        "cost": 210.00
      }}
    }}
  }}
}}
"""
    return call_ai(prompt, temperature=0.7)


def analyze_meal_description(description: str) -> dict:
    """Анализирует текстовое описание приёма пищи."""
    prompt = f"""
Пользователь описал приём пищи. Проанализируй и переведи в ингредиенты с примерными граммовками и КБЖУ.

Описание: "{description}"

Верни строго JSON:
{{
  "meal_analysis": {{
    "dish_name": "название",
    "ingredients": [
      {{"name": "продукт", "amount": 100, "unit": "г", "kcal": 250, "protein": 10, "fat": 15, "carbs": 20}}
    ],
    "totals": {{
      "kcal": 500,
      "protein": 20,
      "fat": 25,
      "carbs": 50
    }}
  }}
}}
"""
    return call_ai(prompt, temperature=0.3)


def adjust_remaining_meals(consumed_today: dict, remaining_targets: dict, available_products: list) -> dict:
    """Корректирует оставшиеся приёмы пищи."""
    prompt = f"""
Пользователь уже съел часть дневного рациона. Скорректируй оставшиеся приёмы.

УЖЕ СЪЕДЕНО:
{json.dumps(consumed_today, ensure_ascii=False, indent=2)}

ОСТАВШИЕСЯ ЦЕЛИ:
Калории: {remaining_targets.get('kcal', 0)} ккал
Белки: {remaining_targets.get('protein', 0)}г
Жиры: {remaining_targets.get('fat', 0)}г
Углеводы: {remaining_targets.get('carbs', 0)}г

ДОСТУПНЫЕ ПРОДУКТЫ:
{json.dumps(available_products, ensure_ascii=False, indent=2)}

Предложи изменённые оставшиеся приёмы для компенсации отклонений.

Верни строго JSON:
{{
  "adjusted_meals": [
    {{
      "type": "dinner",
      "time": "19:00",
      "dish_name": "...",
      "ingredients": [...],
      "recipe_hint": "...",
      "total_kcal": ...,
      "total_protein": ...,
      "total_fat": ...,
      "total_carbs": ...
    }}
  ]
}}
"""
    return call_ai(prompt, temperature=0.5)


if __name__ == "__main__":
    print("✅ deepseek.py готов (OpenRouter — Gemini 2.0 Flash)")