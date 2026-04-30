# API Contract Map for Mini App

Цель: зафиксировать связи между UI-действиями и backend-контрактами для этапа реализации/усиления API.

## Plan Screen

- `Сгенерировать/Перегенерировать план`
  - Method: `POST`
  - Endpoint: `/api/plan/generate`
  - Payload:
    - `user_id: number (telegram id)`
  - Success:
    - `status: "ok"`
    - `week_plan: object`
  - Error mapping:
    - `400`: `user_id обязателен`
    - `404`: пользователь не найден
    - `500`: ошибка AI/внутренняя ошибка

- `Загрузка плана на день`
  - Method: `GET`
  - Endpoint: `/api/plan?user_id={id}`
  - Success:
    - `exists: boolean`
    - `meals: array`
    - `daily_totals: object`

## Diary Screen

- `Загрузка дневника`
  - Method: `GET`
  - Endpoint: `/api/diary?user_id={id}`
  - Success:
    - `date: string`
    - `meals: array`
    - `totals: { kcal, protein, fat, carbs, cost }`

- `Добавить прием пищи` (будущий UI flow)
  - Method: `POST`
  - Endpoint: `/api/diary`
  - Payload:
    - `user_id`, `date`, `meal_type`, `dish_name`, `ingredients`, `was_planned`, `notes`
  - Success:
    - `status: "ok"`
    - `id: number`

## Pantry Screen

- `Загрузка кладовой`
  - Method: `GET`
  - Endpoint: `/api/pantry?user_id={id}`
  - Success:
    - `array<{ id, name, amount, unit, calories_per_100, protein_per_100, fat_per_100, carbs_per_100, price_per_unit, expiry_date }>`

- `Добавить продукт` (будущий UI flow)
  - Method: `POST`
  - Endpoint: `/api/pantry`
  - Payload:
    - `user_id`, `name`, `amount`, `price_per_unit`, `expiry_date`

## Shopping Screen

- `Загрузка корзины`
  - Method: `GET`
  - Endpoint: `/api/shopping?user_id={id}&days={n}`
  - Success:
    - `items: array<{ name, amount_needed, unit, estimated_cost }>`
    - `total_estimated_cost: number`

- `Отметить покупки` (будущий UI flow)
  - Method: `POST`
  - Endpoint: `/api/shopping/purchase`
  - Payload:
    - `user_id`
    - `items: array<{ name, amount }>`

## Priority Backend Follow-ups

1. Добавить endpoint для быстрого `check-in` из Plan (1 тап).
2. Добавить endpoint summary для home-hero (`today status`, `next meal`, `streak`).
3. Ввести единый формат ошибок API для фронтенд-тостов и баннеров.
4. Добавить аудит-логи на ключевые действия для анализа retention.
