import math
import requests
import json
import time
import re
from config import openrouter_api_key
from database import get_db
from dates_util import today_msk_iso
from services import find_or_create_product, find_product_id
from ingredient_exclude import is_non_purchasable_tap_water
from shopping_service import default_price_per_reference_unit, estimate_line_cost, pantry_price_hint

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Бесплатные модели на OpenRouter (выбираем Gemini 2.0 Flash)
MODEL = "google/gemini-2.0-flash-001"  # бесплатная, 200 запросов/день


def call_ai(prompt: str, system_prompt: str = None, temperature: float = 0.7) -> dict:
    """Отправляет запрос к OpenRouter и возвращает ответ как dict.

    Делает несколько попыток при временных ошибках.
    """
    api_key = openrouter_api_key()
    if not api_key:
        raise Exception(
            "OPENROUTER_API_KEY не найден: в PythonAnywhere задай ключ в WSGI до импорта app "
            "(import os → os.environ[\"OPENROUTER_API_KEY\"] = \"...\" → from app import …) "
            "или положи .env с OPENROUTER_API_KEY в корень репозитория на сервере и сделай Reload."
        )

    if not system_prompt:
        system_prompt = (
            "Ты — профессиональный нутрициолог и спортивный диетолог. "
            "Всегда отвечай строго в формате JSON. "
            "Не добавляй markdown-разметку, не оборачивай в ```json. "
            "Отвечай ТОЛЬКО чистым JSON-объектом, начиная с { и заканчивая }."
        )

    headers = {
        "Authorization": f"Bearer {api_key}",
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


def build_budget_context(budget_weekly: float, products_with_prices: list, packaging_cache: list = None) -> str:
    """Строит контекст бюджета для промпта. packaging_cache — список упаковок из product_packaging."""
    budget_weekly_limit = float(budget_weekly or 0)
    target_budget = round(budget_weekly_limit * 0.9, 2)  # рабочий бюджет с запасом 10%

    # Форматируем известные упаковки как якоря цен для нейросети
    pack_lines = []
    if packaging_cache:
        for p in packaging_cache:
            name = p.get("product_name", "")
            sz = p.get("default_pack_size", 0)
            unit = p.get("unit", "г")
            price = p.get("avg_price_per_pack_rub", 0)
            if name and sz and price:
                pack_lines.append(f"- {name}: {sz}{unit} = {price}₽")

    pack_block = ""
    if pack_lines:
        pack_block = (
            "\n\nИЗВЕСТНЫЕ ЦЕНЫ УПАКОВОК (розничные якоря / кэш):\n"
            + "\n".join(pack_lines)
            + "\n\nВАЖНО ПРИ РАСЧЁТЕ СТОИМОСТИ (estimated_cost в приёмах, daily_totals.cost за день):\n"
            + """13. Для estimated_cost блюда НЕ умножай граммы/мл на «цену за грамм». Бери цену ЦЕЛОЙ УПАКОВКИ из данных
    и считай долю: цена_упаковки × (количество_в_порции / размер_упаковки_в_той_же_единице).
    Сумма estimated_cost по ВСЕМ приёмам за неделю для одного продукта (по одному названию) не должна превышать:
    цена_упаковки × число_упаковок_необходимых_на_неделю (число упаковок = ceil(суммарная_норма_за_неделю / размер_упаковки)).

    Пример (гречка):
    - За неделю нужно 370 г, упаковка 800 г = 89 ₽ → в магазине покупается 1 пачка на 89 ₽ (не «42 ₽ по пропорции съеденного»).
    - В каждом приёме порция 60 г можно отразить как долю: 89 × 60/800 ≈ 6,7 ₽ (это проверка порции).
    - Но сумма таких долей за неделю даст ~42 ₽, а корзина возьмёт 1×89 ₽. Чтобы план не занижал бюджет относительно корзины,
      заложи в дневной бюджет амортизацию ПОЛНОЙ закупки: например 89 ₽ / 7 дней ≈ 12,7 ₽ «вклада гречки» в daily_totals.cost
      на каждый день недели, если гречка используется равномерно по дням; если продукт только в части дней — делить 89 ₽
      на число дней, где он реально фигурирует в плане (или на 7, если логика «пачка куплена на неделю» — выбери одно и держи согласованность).

    Итог: daily_totals.cost за день должно складываться из оценок «как в магазине»: целые упаковки и их цена,
    распределённая по дням использования, а не из заниженной суммы чисто пропорциональных долей без учёта минимума закупки.

- НЕ придумывай отдельную «маркетную» цену за грамм/мл (например 0,1 ₽/г для кефира) и не умножай порцию на неё —
  это даёт заниженную стоимость относительно реальной покупки бутылками/пачками.
- Считай через УПАКОВКИ из списков выше (розничные якоря / кэш), если они есть для продукта.

  Пример для кефира:
  План: 200 мл кефира на завтрак (для жидкостей г и мл в доле считай согласованно с единицей упаковки).
  Упаковка: 900 мл = 89 ₽.
  Стоимость порции как доля упаковки: 89 × (200 / 900) ≈ 19,8 ₽.

- За неделю сверяй суммарную потребность с числом целых упаковок и их полной ценой (как в корзине).

- Если порция очень маленькая (например 10 мл масла), оценивай долю от упаковки: цена_упаковки × (порция / размер_упаковки).

- Для продуктов БЕЗ известной упаковки ориентируйся на средние цены в РФ с логикой «пачка/бутылка», а не вес из магазина на развес произвольно."""
        )

    return f"""
Бюджет на неделю (жёсткий лимит): {budget_weekly_limit} руб.
Целевой рабочий бюджет (с запасом на упаковки/округления): {target_budget} руб.
Цены с кладовой (руб за кг/л/шт как в БД, если указаны): {json.dumps(products_with_prices, ensure_ascii=False)}
{pack_block}

ВАЖНО: общая стоимость ВСЕХ запланированных продуктов на неделю должна стремиться к целевому бюджету
и НИКОГДА не превышать жёсткий лимит.
Учитывай, что часть продуктов УЖЕ есть на складе.
Поля estimated_cost в приёмах пищи должны быть согласованы с известными упаковками там, где они даны.
"""


def build_products_context(products: list) -> str:
    """Строит контекст доступных продуктов для промпта"""
    if not products:
        return "Кладовая пуста. Составляй план из любых доступных продуктов — пользователь сходит в магазин."

    lines = []
    for p in products:
        item = (
            f"{p['name']} (доступно {p['amount']}{p['unit']}, "
            f"калорийность {p['calories_per_100']} ккал/100г, "
            f"белки {p['protein_per_100']}г, жиры {p['fat_per_100']}г, углеводы {p['carbs_per_100']}г"
        )
        if p.get("price_per_unit", 0) > 0:
            u = (p.get("unit") or "г").lower()
            if u == "шт":
                price_u = "руб/шт"
            elif u == "мл":
                price_u = "руб/л"
            else:
                price_u = "руб/кг"
            item += f", цена {p['price_per_unit']} {price_u}"
        item += ")"
        lines.append(item)

    context = "ПРОДУКТЫ В КЛАДОВОЙ (уже дома, не нужно покупать):\n" + "\n".join(lines)
    context += "\n\nВАЖНО: кладовая — лишь то, что УЖЕ ЕСТЬ дома. Это не ограничение выбора блюд. Составляй разнообразный план, используя ЛЮБЫЕ подходящие продукты, которые можно купить в магазине. Продукты из кладовой учитывай при расчёте стоимости (они уже оплачены), но НЕ строй весь план только из них — разнообразие рациона важнее утилизации запасов."

    return context


def generate_weekly_plan(user_data: dict, products: list) -> dict:
    """Генерирует план питания на 7 дней с учётом тренировок, сна, бюджета и остатков."""
    weight = user_data.get("weight", 75)
    height = user_data.get("height", 175)
    age    = user_data.get("age", 25)
    sex    = user_data.get("sex", "male")
    activity = user_data.get("activity_level", "moderate")
    goal   = user_data.get("goal", "recomposition")

    # Формула Миффлина – Сан Жеора
    if sex == "female":
        bmr = 10 * weight + 6.25 * height - 5 * age - 161
    else:
        bmr = 10 * weight + 6.25 * height - 5 * age + 5

    ACTIVITY_COEF = {
        "sedentary":   1.2,
        "light":       1.375,
        "moderate":    1.55,
        "active":      1.725,
        "very_active": 1.9,
    }
    coef = ACTIVITY_COEF.get(activity, 1.55)
    tdee = bmr * coef  # полный суточный расход при базовом уровне активности

    # Тренировочный день — дополнительный расход ~200 ккал сверх TDEE
    TRAIN_BONUS = 200

    if goal == "recomposition" or goal == "custom":
        rest_kcal     = round(tdee)
        training_kcal = round(tdee + TRAIN_BONUS)
        protein = weight * 2.0
    elif goal == "mass_gain":
        rest_kcal     = round(tdee + 200)
        training_kcal = round(tdee + 400)
        protein = weight * 2.2
    else:  # cutting
        rest_kcal     = round(tdee - 400)
        training_kcal = round(tdee - 200)
        protein = weight * 2.2

    fat = weight * 0.9
    training_carbs = max(0, (training_kcal - protein * 4 - fat * 9) / 4)
    rest_carbs     = max(0, (rest_kcal     - protein * 4 - fat * 9) / 4)

    training_context = build_training_context(user_data)
    products_with_prices = [
        {"name": p["name"], "price": p.get("price_per_unit", 0)}
        for p in products if p.get("price_per_unit", 0) > 0
    ]
    # Берём кэш упаковок из БД и передаём в промпт — нейросеть сразу знает реальные цены
    # и не будет придумывать стоимость → избегаем второго запроса на перегенерацию
    packaging_cache = user_data.get("packaging_cache", [])
    budget_context = build_budget_context(
        user_data.get("budget_weekly", 2000),
        products_with_prices,
        packaging_cache=packaging_cache,
    )
    products_context = build_products_context(products)
    preferences = user_data.get("preferences", "нет особых предпочтений")
    algorithm_context = user_data.get("algorithm_context", {})
    targets_json = json.dumps(algorithm_context.get("daily_targets", []), ensure_ascii=False)
    extra_rules = json.dumps(algorithm_context, ensure_ascii=False)

    goal_line = (
        f"Своя цель (текст пользователя): {user_data.get('goal_custom', '')}"
        if goal == "custom"
        else f"{goal} (рекомпозиция — набор мышц с одновременным снижением жира)"
    )

    prompt = f"""
Составь план питания на 7 дней (начиная с завтрашнего дня).

ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ:
Пол: {"женский" if sex == "female" else "мужской"}
Возраст: {user_data.get('age', 25)} лет
Вес: {weight} кг
Рост: {height} см
Уровень активности: {activity} (коэффициент {coef})
Цель: {goal_line}
Предпочтения / исключения: {preferences}

{training_context}

ЦЕЛЕВЫЕ ПОКАЗАТЕЛИ:
- Дни тренировок: {training_kcal:.0f} ккал, белки {protein:.0f}г, жиры {fat:.0f}г, углеводы {training_carbs:.0f}г
- Дни отдыха: {rest_kcal:.0f} ккал, белки {protein:.0f}г, жиры {fat:.0f}г, углеводы {rest_carbs:.0f}г

АЛГОРИТМИЧЕСКИЕ ТАРГЕТЫ ПО ДНЯМ (приоритет над общими):
{targets_json}

СЛУЖЕБНЫЙ КОНТЕКСТ ОПТИМИЗАЦИИ:
{extra_rules}

{budget_context}

{products_context}

ТРЕБОВАНИЯ:
1. Каждый день — 3-4 приёма пищи.
2. Дни тренировок — больше углеводов в обеде и завтраке.
3. Дни отдыха — меньше углеводов, больше белка и овощей.
4. Ужин всегда лёгкий, акцент на белок, минимум углеводов.
5. Учитывай время подъёма и отхода ко сну.
6. Блюда простые, без сложной готовки.
7. Продукты с истекающим сроком из кладовой — постарайся использовать в первые дни, чтобы не пропали.
14.5. Кладовая — не ограничение. Можешь свободно добавлять в план любые продукты из магазина. Упор на разнообразие, а не на «доесть запасы».
8. Не превышай бюджет.
9. Строго придерживайся переданных daily_targets по дням.
10. До вывода JSON выполни внутреннюю самопроверку: сумма daily_totals.cost за 7 дней должна быть <= целевого рабочего бюджета; если больше — упрости блюда и замени ингредиенты на более дешёвые.
11. Предпочитай недорогие базовые продукты и повторное использование одних и тех же ингредиентов в разные дни.
12. В daily_totals.cost давай реалистичную оценку (не занижай искусственно).
13. Стоимость — через цену целой упаковки и доли/амортизацию на дни использования (см. блок бюджета выше): не считать порцию как граммы×цена_за_г; суммы за неделю согласовывать с ceil(объём/фасовка)×цена упаковки и с daily_totals по дням.
14. Поле ingredients — только покупные СЫРЫЕ/до готовки позиции, как в корзине: «гречка сухая», «рис сухой», «куриная грудка», «кефир 1%», «морковь», «яблоко».
    НЕ пиши «варёная гречка», «отварная/тушёная курица», «готовый гарнир» и т.п.; не подставляй готовое блюдо одной строкой вместо продуктов.
    Количество — до приготовления: например сухая гречка 50 г (не масса уже сваренной порции крупы).
    Не включай «воду» / кипяток / водопроводную воду как ингредиент для покупки (её берут из крана или готовят крупы без отдельной строки воды в корзине). Минеральную и газированную воду можно указывать, если она действительно в рационе.

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


def _canonical_product_key(raw: str) -> str:
    return (raw or "").strip().lower()


def _normalize_ingredient_unit(u: str) -> str:
    x = (u or "г").strip().lower()
    if x in ("г", "g", "гр", "gram", "grams"):
        return "г"
    if x in ("мл", "ml", "milliliter"):
        return "мл"
    if x in ("шт", "штука", "штуки", "pcs", "pc", "штук"):
        return "шт"
    return "г"


def _liquid_milk_retail(name: str) -> bool:
    """Кефир/молоко/ряженка в рознице — обычно бутылки в мл, не мелкие «граммы»."""
    n = (name or "").lower()
    if "сухое молок" in n or "молоко сух" in n or "сух молок" in n:
        return False
    return any(
        x in n
        for x in (
            "кефир",
            "молоко",
            "ряженк",
            "простокваш",
            "айран",
            "тан ",
            "йогурт пить",
            "ряженка",
        )
    )


def _normalize_retail_pack(name: str, pack_u: str, pack_s: float) -> tuple[str, float]:
    """Реалистичная фасовка для РФ: кефир/молоко не как «200 г» в пачке, а бутылка ~0,93–1 л."""
    u = _normalize_ingredient_unit(pack_u)
    try:
        s = float(pack_s)
    except (TypeError, ValueError):
        s = 0.0
    if s <= 0:
        return u, s
    if _liquid_milk_retail(name):
        if u == "г" and s < 450:
            return ("мл", 930.0)
        if u == "мл" and s < 450:
            return ("мл", 930.0)
    return u, s


def _deficit_in_pack_units(deficit: float, recipe_u: str, pack_u: str, name: str) -> float:
    """Сколько нужно в «единицах упаковки» для деления на размер упаковки."""
    ru = _normalize_ingredient_unit(recipe_u)
    pu = _normalize_ingredient_unit(pack_u)
    d = max(0.0, float(deficit))
    if ru == pu:
        return d
    if _liquid_milk_retail(name) and ru == "г" and pu == "мл":
        return d
    if _liquid_milk_retail(name) and ru == "мл" and pu == "г":
        return d
    return d


def _fuzzy_packaging_row(conn, product_name: str):
    """
    Нечёткий поиск упаковки в product_packaging.
    Два прохода:
      1. Слова из запроса ищем в названиях таблицы:  таблица LIKE '%творог%'
         «творог обезжиренный» → найдёт строку «творог»
      2. Названия из таблицы ищем в запросе: запрос LIKE '%творожный%'
         «творожный сыр» → найдёт если в запросе есть «творожный»
    Возвращает первую найденную строку или None.
    """
    import re
    name_lower = (product_name or "").lower()
    words = re.split(r"[\s,\(\)/]+", name_lower)
    words = [w for w in words if len(w) >= 3]

    # Проход 1: слова из запроса → ищем в таблице
    # «куриная грудка» → LIKE '%куриная%', LIKE '%грудка%'
    for word in words:
        row = conn.execute(
            "SELECT unit, default_pack_size, avg_price_per_pack_rub "
            "FROM product_packaging WHERE LOWER(product_name) LIKE ?",
            (f"%{word}%",),
        ).fetchone()
        if row:
            return row

    # Проход 2: берём все строки таблицы и проверяем содержится ли
    # любое слово из названия таблицы в нашем запросе
    # «творожный сыр» в таблице → проверяем есть ли «творожный» в «творог обезжиренный»
    all_rows = conn.execute(
        "SELECT product_name, unit, default_pack_size, avg_price_per_pack_rub "
        "FROM product_packaging WHERE default_pack_size > 0"
    ).fetchall()
    for row in all_rows:
        tbl_words = re.split(r"[\s,\(\)/]+", (row["product_name"] or "").lower())
        tbl_words = [w for w in tbl_words if len(w) >= 3]
        for tw in tbl_words:
            if tw in name_lower:
                return row

    return None


def _packaging_row_to_dict(row) -> dict | None:
    """Конвертирует строку БД в dict упаковки; возвращает None если pack_size <= 0."""
    rd = dict(row)
    u = _normalize_ingredient_unit(rd.get("unit") or "г")
    try:
        sz = float(rd.get("default_pack_size") or 0)
    except (TypeError, ValueError):
        sz = 0.0
    try:
        avg_rub = float(rd.get("avg_price_per_pack_rub") or 0)
    except (TypeError, ValueError):
        avg_rub = 0.0
    if sz <= 0:
        return None
    return {"unit": u, "default_pack_size": sz, "avg_price_per_pack_rub": avg_rub}


def get_packaging(conn, product_name: str) -> dict:
    """
    Типичная упаковка и средняя цена за неё в РФ: из кэша product_packaging или один запрос к LLM.
    Порядок поиска:
      1. Точное совпадение по canonical key
      2. Нечёткий поиск по словам (LIKE) — находит «овсянка сухая» по «овсяные хлопья»
      3. LLM-запрос с записью в кэш
    Возвращает { unit, default_pack_size, avg_price_per_pack_rub }.
    При ошибке — безопасные значения (г, 500, цена 0 → дальше эвристика в корзине).
    """
    safe = {"unit": "г", "default_pack_size": 500.0, "avg_price_per_pack_rub": 0.0}
    key = _canonical_product_key(product_name)
    if not key:
        return safe
    try:
        # --- 1. Точное совпадение ---
        row = conn.execute(
            """SELECT unit, default_pack_size, avg_price_per_pack_rub
               FROM product_packaging WHERE product_name = ?""",
            (key,),
        ).fetchone()

        # --- 2. Нечёткий поиск если точного нет ---
        if not row:
            row = _fuzzy_packaging_row(conn, product_name)

        if row:
            packed = _packaging_row_to_dict(row)
            if packed:
                u2, sz2 = _normalize_retail_pack(product_name, packed["unit"], packed["default_pack_size"])
                return {"unit": u2, "default_pack_size": sz2, "avg_price_per_pack_rub": packed["avg_price_per_pack_rub"]}
            # Строка есть, но pack_size <= 0 — идём в LLM

        escaped = (product_name or "").replace("'", "''")
        prompt = f"""Ты ориентируешься на типичные розничные сети России (Перекрёсток, Пятёрочка, Магнит, Лента и т.п.).

Для продукта «{escaped}» укажи:
1) стандартную упаковку, в какой граммовке / объёме / количестве штук его обычно продают;
2) среднюю ориентировочную цену в рублях за одну такую упаковку (типичная по РФ на 2025–2026 год, одно число).

Важно: для кефира, молока, ряженки и других жидких молочных напитков указывай объём бутылки/пакета в «мл» (например 930 или 1000), не выдумывай нереалистичные «200 г» как типовую бутылку.

Верни строго JSON одним объектом:
{{ "unit": "г", "default_pack_size": 800, "avg_price_per_pack_rub": 95 }}
где unit — только «г», «мл» или «шт»; default_pack_size — число (размер одной упаковки в этой единице); avg_price_per_pack_rub — число рублей за одну упаковку."""

        raw = call_ai(prompt, temperature=0.1)
        if not isinstance(raw, dict):
            return safe
        u = _normalize_ingredient_unit(str(raw.get("unit") or "г"))
        try:
            sz = float(raw.get("default_pack_size") or 0)
        except (TypeError, ValueError):
            sz = 0.0
        try:
            avg_rub = float(raw.get("avg_price_per_pack_rub") or raw.get("avg_price") or 0)
        except (TypeError, ValueError):
            avg_rub = 0.0
        if u not in ("г", "мл", "шт"):
            u = "г"
        if sz <= 0:
            return safe
        if avg_rub < 0:
            avg_rub = 0.0

        u, sz = _normalize_retail_pack(product_name, u, sz)

        conn.execute(
            """INSERT OR REPLACE INTO product_packaging (product_name, unit, default_pack_size, avg_price_per_pack_rub)
               VALUES (?, ?, ?, ?)""",
            (key, u, sz, avg_rub if avg_rub > 0 else None),
        )
        return {"unit": u, "default_pack_size": sz, "avg_price_per_pack_rub": max(0.0, avg_rub)}
    except Exception:
        return safe


def build_shopping_list(week_plan: dict, user_id: int) -> dict:
    """
    Корзина по плану: сумма ингредиентов, минус кладовая, упаковки через get_packaging, запись в shopping_list.

    week_plan: { "YYYY-MM-DD": { "meals": [ { "ingredients": [ {name, amount, unit} ] } ] } }
    user_id: внутренний id пользователя (users.id).
    """
    out_list: list[dict] = []
    total_estimated = 0.0

    if not isinstance(week_plan, dict) or not week_plan:
        conn = get_db()
        try:
            conn.execute("DELETE FROM shopping_list WHERE user_id = ?", (int(user_id),))
            conn.commit()
        finally:
            conn.close()
        return {"shopping_list": [], "total_estimated_cost": 0.0}

    totals: dict[tuple[str, str], float] = {}
    display_for_key: dict[str, str] = {}

    for _date, day in week_plan.items():
        if not isinstance(day, dict):
            continue
        meals = day.get("meals") or []
        if not isinstance(meals, list):
            continue
        for meal in meals:
            if not isinstance(meal, dict):
                continue
            for ing in meal.get("ingredients") or []:
                if not isinstance(ing, dict):
                    continue
                raw_name = str(ing.get("name") or "").strip()
                if not raw_name:
                    continue
                key = _canonical_product_key(raw_name)
                if key not in display_for_key:
                    display_for_key[key] = raw_name
                unit = _normalize_ingredient_unit(str(ing.get("unit") or "г"))
                try:
                    amt = float(ing.get("amount") or 0)
                except (TypeError, ValueError):
                    amt = 0.0
                if amt <= 0:
                    continue
                k = (key, unit)
                totals[k] = totals.get(k, 0.0) + amt

    conn = get_db()
    try:
        for (name_key, unit), need in totals.items():
            display_name = display_for_key.get(name_key) or name_key
            product_id = find_product_id(conn, display_name) or find_or_create_product(conn, display_name)

            row = conn.execute(
                "SELECT COALESCE(SUM(amount), 0) as s FROM pantry WHERE user_id = ? AND product_id = ?",
                (int(user_id), product_id),
            ).fetchone()
            try:
                pantry_amt = float(row["s"] if row else 0)
            except (TypeError, ValueError):
                pantry_amt = 0.0

            deficit = need - pantry_amt
            if deficit <= 1e-6:
                continue

            pack = get_packaging(conn, display_name)
            pu = _normalize_ingredient_unit(pack["unit"])
            ps = float(pack["default_pack_size"] or 0)
            pu, ps = _normalize_retail_pack(display_name, pu, ps)
            if ps <= 0:
                pu, ps = "г", 500.0
            if (
                _normalize_ingredient_unit(unit) == "г"
                and pu == "мл"
                and _liquid_milk_retail(display_name)
            ):
                packs = max(1, math.ceil(float(deficit) / ps))
            else:
                need_for_div = _deficit_in_pack_units(deficit, unit, pu, display_name)
                packs = max(1, math.ceil(need_for_div / ps))

            avg_rub_pack = float(pack.get("avg_price_per_pack_rub") or 0)
            if avg_rub_pack > 0:
                est_per_pack = round(avg_rub_pack, 2)
                est_total = round(avg_rub_pack * packs, 2)
            else:
                price_ref = pantry_price_hint(conn, int(user_id), product_id)
                if not price_ref or price_ref <= 0:
                    price_ref = default_price_per_reference_unit(pu)
                est_per_pack = estimate_line_cost(ps, pu, price_ref)
                est_total = round(est_per_pack * packs, 2)
            total_estimated += est_total

            out_list.append(
                {
                    "name": display_name,
                    "deficit": round(deficit, 3),
                    "unit": unit,
                    "pack_unit": pu,          # единица упаковки (г/мл/шт)
                    "pack_size": ps,
                    "packs": packs,
                    "estimated_price_per_pack": round(est_per_pack, 2),
                    "estimated_total": est_total,
                    "avg_price_per_pack_rub": round(avg_rub_pack, 2) if avg_rub_pack > 0 else None,
                }
            )

        conn.execute("DELETE FROM shopping_list WHERE user_id = ?", (int(user_id),))
        for_date = today_msk_iso()
        for it in out_list:
            name = str(it.get("name") or "").strip()
            if not name:
                continue
            pid = find_product_id(conn, name) or find_or_create_product(conn, name)
            u = str(it.get("unit") or "г").strip() or "г"
            item_pu = str(it.get("pack_unit") or "г").strip() or "г"  # берём из item, не из внешнего scope
            deficit = float(it.get("deficit") or 0)
            ps = float(it.get("pack_size") or 0)
            packs = int(it.get("packs") or 0)
            est_total = float(it.get("estimated_total") or 0)
            conn.execute(
                """
                INSERT INTO shopping_list (
                    user_id, product_id, amount_needed, estimated_cost, for_date,
                    is_purchased, skipped_in_trip, display_name, display_unit, pack_unit, pack_weight, packs, is_manual
                ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, 0)
                """,
                (int(user_id), pid, deficit, est_total, for_date, name, u, item_pu, ps, packs),
            )

        conn.commit()
    finally:
        conn.close()

    return {"shopping_list": out_list, "total_estimated_cost": round(total_estimated, 2)}


def analyze_meal_description(description: str) -> dict:
    """Анализирует текстовое описание приёма пищи."""
    prompt = f"""
Пользователь описал приём пищи. Проанализируй и переведи в ингредиенты с примерными граммовками и КБЖУ.

В списке ingredients указывай только покупные продукты «как в магазине», до приготовления
(«гречка сухая», «куриная грудка», а не «варёная гречка» / «отварная курица»); массы и объёмы — сырые ингредиенты до готовки.
Воду из крана / кипяток в ingredients не указывай (минеральную или газированную — можно, если речь о покупной).

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
В каждом приёме поле ingredients — только сырые/магазинные названия до готовки (гречка сухая, куриная грудка, рис сухой и т.д.), не отварное/варёное состояние.
Крановую воду и кипяток в список не включай.

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