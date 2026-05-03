-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    name TEXT,
    age INTEGER,
    weight REAL,
    height REAL,
    goal TEXT DEFAULT 'recomposition',  -- recomposition, mass_gain, cutting, custom
    goal_custom TEXT,
    budget_weekly REAL DEFAULT 0,
    budget_tier TEXT,
    budget_custom REAL,
    kitchen_type TEXT,
    onboarding_completed INTEGER DEFAULT 0,
    wake_time TEXT DEFAULT '08:00',
    sleep_time TEXT DEFAULT '23:00',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Дни тренировок пользователя
CREATE TABLE IF NOT EXISTS training_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,  -- 0=понедельник, 6=воскресенье
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Предпочтения/исключения по продуктам
CREATE TABLE IF NOT EXISTS food_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    preference_type TEXT NOT NULL,  -- 'exclude', 'prefer', 'allergy'
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Справочник продуктов (общий)
CREATE TABLE IF NOT EXISTS products_ref (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT DEFAULT 'г',
    calories_per_100 REAL DEFAULT 0,
    protein_per_100 REAL DEFAULT 0,
    fat_per_100 REAL DEFAULT 0,
    carbs_per_100 REAL DEFAULT 0,
    is_custom BOOLEAN DEFAULT 0  -- 1 если пользователь добавил свой продукт
);

-- Склад пользователя (Кладовая)
CREATE TABLE IF NOT EXISTS pantry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    amount REAL NOT NULL,           -- текущее количество
    price_per_unit REAL DEFAULT 0,  -- цена за единицу (кг/л/шт)
    expiry_date TEXT,               -- срок годности (YYYY-MM-DD)
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products_ref(id)
);

-- Резервирование продуктов под план
CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    plan_date TEXT NOT NULL,        -- YYYY-MM-DD
    meal_type TEXT NOT NULL,        -- breakfast, lunch, dinner, snack
    amount_reserved REAL NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products_ref(id)
);

-- Недельный план питания (храним JSON от нейросети)
CREATE TABLE IF NOT EXISTS meal_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_date TEXT NOT NULL,        -- YYYY-MM-DD
    day_type TEXT,                  -- training, rest
    meals_json TEXT NOT NULL,       -- полный JSON приёмов пищи на день
    daily_kcal REAL,
    daily_protein REAL,
    daily_fat REAL,
    daily_carbs REAL,
    daily_cost REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, plan_date)
);

-- Фактически съеденное (Дневник)
CREATE TABLE IF NOT EXISTS consumed_meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    consumed_at TIMESTAMP NOT NULL,   -- реальное время приёма пищи
    plan_date TEXT NOT NULL,          -- к какому дню относится
    meal_type TEXT NOT NULL,          -- breakfast, lunch, dinner, snack
    dish_name TEXT,
    ingredients_json TEXT NOT NULL,   -- JSON: [{name, amount, unit, kcal, protein, fat, carbs}]
    total_kcal REAL,
    total_protein REAL,
    total_fat REAL,
    total_carbs REAL,
    total_cost REAL,
    was_planned BOOLEAN DEFAULT 0,    -- 1 если по плану / чуть больше плана (те же продукты), 0 если вне плана
    original_plan_id INTEGER,         -- ссылка на meal_plan.id, если был по плану
    entry_source TEXT DEFAULT 'other', -- plan | plan_over | other
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Корзина покупок
CREATE TABLE IF NOT EXISTS shopping_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    amount_needed REAL NOT NULL,
    estimated_cost REAL DEFAULT 0,
    for_date TEXT NOT NULL,           -- на какой день нужно
    is_purchased BOOLEAN DEFAULT 0,
    skipped_in_trip INTEGER DEFAULT 0, -- 1 = «не купил» в режиме закупки
    display_name TEXT,
    display_unit TEXT,
    is_manual INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products_ref(id)
);

-- Факт траты после «Завершить и разобрать»
CREATE TABLE IF NOT EXISTS shopping_spend_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Замеры тела (для графика прогресса)
CREATE TABLE IF NOT EXISTS body_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    measure_date TEXT NOT NULL,
    weight REAL,
    waist REAL,
    chest REAL,
    arms REAL,
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);