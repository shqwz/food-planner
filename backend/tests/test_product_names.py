import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from product_names import product_match_key


class ProductMatchKeyTests(unittest.TestCase):
    def test_apple_forms(self):
        self.assertEqual(product_match_key("яблоко"), product_match_key("яблоки"))

    def test_tomato_forms(self):
        self.assertEqual(product_match_key("помидор"), product_match_key("помидоры"))

    def test_egg_forms(self):
        self.assertEqual(product_match_key("яйцо"), product_match_key("яйца"))

    def test_cucumber_forms(self):
        self.assertEqual(product_match_key("огурец"), product_match_key("огурцы"))

    def test_distinct_products(self):
        self.assertNotEqual(product_match_key("гречка"), product_match_key("рис"))


class PantryMergeApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        os.environ["FOOD_PLANNER_DB_PATH"] = self.tmp.name
        os.environ["OPENROUTER_API_KEY"] = "test-key"

        from app import app
        from database import init_db

        self.app = app
        self.client = app.test_client()
        init_db()
        self.conn = __import__("database", fromlist=["get_db"]).get_db()
        self.conn.execute(
            "INSERT OR IGNORE INTO users (telegram_id, name) VALUES (?, ?)",
            (888777, "MergeTest"),
        )
        self.conn.commit()
        self.conn.close()

    def tearDown(self):
        os.unlink(self.tmp.name)

    def test_pantry_add_merges_same_product_different_word_form(self):
        r1 = self.client.post(
            "/api/pantry",
            json={
                "user_id": 888777,
                "name": "яблоко",
                "amount": 3,
                "unit": "шт",
                "price_per_unit": 40,
            },
        )
        self.assertEqual(r1.status_code, 200)
        r2 = self.client.post(
            "/api/pantry",
            json={
                "user_id": 888777,
                "name": "яблоки",
                "amount": 2,
                "unit": "шт",
                "price_per_unit": 50,
            },
        )
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(r2.get_json().get("merged"))

        listing = self.client.get("/api/pantry?user_id=888777").get_json()
        apple_rows = [p for p in listing if "ябл" in p["name"].lower()]
        self.assertEqual(len(apple_rows), 1)
        self.assertEqual(apple_rows[0]["amount"], 5)


if __name__ == "__main__":
    unittest.main()
