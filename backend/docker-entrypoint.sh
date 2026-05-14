#!/bin/sh
set -e
if [ ! -f "${FOOD_PLANNER_DB_PATH:-/data/food_planner.db}" ]; then
  echo "Initializing database at ${FOOD_PLANNER_DB_PATH:-/data/food_planner.db}"
  python -c "from database import init_db; init_db()"
fi
if [ "${SEED_DEMO_USER:-}" = "1" ] || [ "${SEED_DEMO_USER:-}" = "true" ] || [ "${SEED_DEMO_USER:-}" = "yes" ]; then
  python -c "from database import seed_default_user; seed_default_user()" || true
fi
exec "$@"
