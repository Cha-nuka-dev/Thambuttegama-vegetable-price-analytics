"""Offline checks requiring only Python's standard library."""

import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from extract_thambuttegama_prices import crop_match  # noqa: E402


class PortfolioTests(unittest.TestCase):
    def test_gourd_names_are_distinct(self):
        self.assertEqual(crop_match("කරවිල")[0], "bitter-gourd")
        self.assertEqual(crop_match("තුඹ කරවිල")[0], "spiny-gourd")

    def test_demo_data_is_synthetic_and_complete(self):
        data = json.loads((ROOT / "dashboard" / "lib" / "demo-candidates.json").read_text(encoding="utf-8"))
        self.assertTrue(data)
        self.assertEqual({item["quality"] for item in data}, {"synthetic-demo"})
        self.assertTrue(all(not item["source_url"] for item in data))
        self.assertEqual(len({r["crop"] for r in data}), 10)
        self.assertEqual(sorted({r["date"][:4] for r in data}), [str(y) for y in range(2020, 2027)])
        self.assertLessEqual(max(item["date"] for item in data), "2026-10-24")

    def test_private_files_do_not_exist_in_release(self):
        forbidden = {"ocr-candidates.json", "workbook_input.json", "facebook_photo_index.csv"}
        for file in ROOT.rglob("*"):
            if not file.is_file():
                continue
            self.assertNotIn(file.name, forbidden)
            self.assertNotIn(file.suffix.lower(), {".jpg", ".jpeg", ".zip", ".xlsx"})


if __name__ == "__main__":
    unittest.main()
