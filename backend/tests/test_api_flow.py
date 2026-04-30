import os
import tempfile
import unittest
import sys
from pathlib import Path


class ApiFlowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        os.environ["FOOD_PLANNER_DB_PATH"] = self.tmp.name
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

        # Import after env setup so config uses temp DB.
        from app import app
        from database import get_db, init_db, seed_products

        self.app = app
        self.client = app.test_client()
        init_db()
        seed_products()

        conn = get_db()
        conn.execute(
            "INSERT INTO users (telegram_id, name, goal, budget_weekly) VALUES (?, ?, ?, ?)",
            (123456789, "Test", "recomposition", 3000),
        )
        user_id = conn.execute("SELECT id FROM users WHERE telegram_id = 123456789").fetchone()["id"]
        product_id = conn.execute("SELECT id FROM products_ref WHERE name = 'гречка сухая'").fetchone()["id"]
        conn.execute(
            "INSERT INTO pantry (user_id, product_id, amount, price_per_unit) VALUES (?, ?, ?, ?)",
            (user_id, product_id, 150, 120),
        )
        conn.execute(
            """
            INSERT INTO meal_plan
            (user_id, plan_date, meals_json, daily_kcal, daily_protein, daily_fat, daily_carbs, daily_cost)
            VALUES (?, date('now'), ?, 0, 0, 0, 0, 0)
            """,
            (user_id, '[{"type":"lunch","ingredients":[{"name":"гречка сухая","amount":300,"unit":"г"}]}]'),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        os.unlink(self.tmp.name)

    def test_shopping_list_uses_available_stock(self):
        response = self.client.get("/api/shopping?user_id=123456789&days=0")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["name"], "гречка сухая")
        self.assertEqual(data["items"][0]["amount_needed"], 150.0)


if __name__ == "__main__":
    unittest.main()
