import os
import tempfile
import unittest
import sys
from pathlib import Path


class DiaryMealTotalsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        os.environ["FOOD_PLANNER_DB_PATH"] = self.tmp.name
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

        from app import app
        from database import get_db, init_db

        self.client = app.test_client()
        init_db()

        conn = get_db()
        conn.execute(
            "INSERT OR IGNORE INTO users (telegram_id, name, goal, budget_weekly) VALUES (?, ?, ?, ?)",
            (123456789, "Test", "recomposition", 3000),
        )
        conn.commit()
        conn.close()

    def tearDown(self):
        os.unlink(self.tmp.name)

    def test_diary_plan_meal_without_per_ingredient_kcal_uses_meal_totals(self):
        r = self.client.post(
            "/api/diary",
            json={
                "user_id": 123456789,
                "date": "2026-06-01",
                "meal_type": "breakfast",
                "dish_name": "Тест омлет",
                "ingredients": [
                    {"name": "яйцо", "amount": 2, "unit": "шт"},
                ],
                "meal_totals": {
                    "kcal": 420,
                    "protein": 30,
                    "fat": 20,
                    "carbs": 10,
                    "cost": 0,
                },
                "was_planned": False,
                "entry_source": "other",
            },
        )
        self.assertEqual(r.status_code, 200, r.get_data(as_text=True))
        body = r.get_json()
        self.assertEqual(body["totals"]["kcal"], 420)

        log = self.client.get("/api/diary?user_id=123456789&date=2026-06-01").get_json()
        self.assertEqual(len(log["meals"]), 1)
        self.assertEqual(log["meals"][0]["entry_source"], "other")

    def test_diary_offline_products_ref_fills_macros_without_meal_totals(self):
        r = self.client.post(
            "/api/diary",
            json={
                "user_id": 123456789,
                "date": "2026-06-02",
                "meal_type": "lunch",
                "dish_name": "Гречка",
                "ingredients": [
                    {"name": "Гречка сухая", "amount": 100, "unit": "г"},
                ],
                "was_planned": False,
                "entry_source": "other",
            },
        )
        self.assertEqual(r.status_code, 200, r.get_data(as_text=True))
        body = r.get_json()
        self.assertGreater(body["totals"]["kcal"], 200)
        log = self.client.get("/api/diary?user_id=123456789&date=2026-06-02").get_json()
        ing = log["meals"][0]["ingredients"][0]
        self.assertGreater(float(ing.get("kcal") or 0), 200)


if __name__ == "__main__":
    unittest.main()
