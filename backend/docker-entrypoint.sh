#!/bin/sh
set -e
if [ ! -f "${FOOD_PLANNER_DB_PATH:-/data/food_planner.db}" ]; then
  echo "Initializing database at ${FOOD_PLANNER_DB_PATH:-/data/food_planner.db}"
  python -c "from database import init_db, seed_products, seed_default_user; init_db(); seed_products(); seed_default_user()"
fi
exec "$@"
