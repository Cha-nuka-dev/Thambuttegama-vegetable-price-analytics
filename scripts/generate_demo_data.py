"""Build a deterministic, fictional price demonstration (NOT market history)."""

import csv
from datetime import date
import json
import math
from pathlib import Path
import random

PROJECT = Path(__file__).resolve().parents[1]
BASE = {
    "tomato": 255,
    "brinjal": 185,
    "green-chilli": 465,
    "okra": 145,
    "bitter-gourd": 225,
    "spiny-gourd": 470,
    "capsicum": 335,
    "beans": 315,
    "local-big-onion": 195,
    "cauliflower": 240,
}


def main():
    rng = random.Random(20261024)
    rows = []
    for year in range(2020, 2027):
        for month in range(1, 13):
            if (year, month) > (2026, 10):
                continue
            for day in (2, 6, 10, 14, 18, 22):
                sampled_date = date(year, month, day).isoformat()
                for crop_index, (crop, base) in enumerate(BASE.items()):
                    # Invented seasonality, trend, and scatter, fixed by seed.
                    phase = crop_index * 0.49
                    seasonality = 1 + .30 * math.sin((month - 1) * math.pi / 6 + phase)
                    trend = 1 + (year - 2020) * .045
                    random_factor = rng.uniform(.81, 1.19)
                    midpoint = base * seasonality * trend * random_factor
                    low = max(5, round(midpoint * .91 / 5) * 5)
                    high = max(low, round(midpoint * 1.09 / 5) * 5)
                    rows.append({
                        "date": sampled_date,
                        "crop": crop,
                        "low": low,
                        "high": high,
                        "source_url": "",
                        "quality": "synthetic-demo",
                    })
    destination = PROJECT / "dashboard" / "lib" / "demo-candidates.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    example_path = PROJECT / "data" / "sample_data.csv"
    example_path.parent.mkdir(parents=True, exist_ok=True)
    with example_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["date", "crop", "min", "max", "price_type", "variety", "source_url"])
        for item in rows[:40]:
            writer.writerow([item["date"], item["crop"], item["low"], item["high"], "wholesale", "Synthetic demo", ""])
    print(f"Generated {len(rows)} SYNTHETIC records and a 40-row example CSV.")


if __name__ == "__main__":
    main()
