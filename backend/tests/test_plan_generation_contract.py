import os
import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch


class PlanGenerationContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        os.environ["FOOD_PLANNER_DB_PATH"] = self.tmp.name
        os.environ["OPENROUTER_API_KEY"] = "test-key"
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

        from app import app
        from database import get_db, init_db, seed_products

        self.client = app.test_client()
        init_db()
        seed_products()

        conn = get_db()
        conn.execute(
            "INSERT INTO users (telegram_id, name, goal, budget_weekly, wake_time, sleep_time, weight, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (123456789, "Test", "recomposition", 2500, "07:00", "23:00", 75, 178),
        )
        user_id = conn.execute("SELECT id FROM users WHERE telegram_id = 123456789").fetchone()["id"]
        conn.execute("INSERT INTO training_days (user_id, day_of_week) VALUES (?, ?)", (user_id, 2))
        conn.commit()
        conn.close()

    def tearDown(self):
        os.unlink(self.tmp.name)

    @patch("plan.generate_weekly_plan")
    def test_generate_returns_strategy_and_explanations(self, mock_generate):
        mock_generate.return_value = {
            "week_plan": {
                "placeholder-day-1": {
                    "day_type": "training",
                    "meals": [
                        {
                            "type": "breakfast",
                            "time": "08:00",
                            "dish_name": "Test meal",
                            "ingredients": [{"name": "яйцо", "amount": 2, "unit": "шт"}],
                            "total_kcal": 300,
                            "total_protein": 20,
                            "total_fat": 15,
                            "total_carbs": 10,
                        }
                    ],
                    "daily_totals": {"kcal": 1800, "protein": 140, "fat": 60, "carbs": 180, "cost": 250},
                }
            }
        }

        response = self.client.post(
            "/api/plan/generate",
            json={
                "user_id": 123456789,
                "planner": {"sleep_quality": "poor", "overeating_event": {"date": "2026-05-03", "scale": "low"}},
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["status"], "ok")
        self.assertIn("strategy", body)
        self.assertIn("explanations", body)
        self.assertGreater(len(body["explanations"]), 0)


if __name__ == "__main__":
    unittest.main()
