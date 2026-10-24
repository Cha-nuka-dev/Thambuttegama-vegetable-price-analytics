"""Export provisional private OCR-selected records into one browser-import CSV."""

import argparse
import csv
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="Private workbook_input.json")
    parser.add_argument("--output", type=Path, required=True, help="Ignored private CSV filename (.local/private_ocr.csv)")
    args = parser.parse_args()
    rows = json.loads(args.input.read_text(encoding="utf-8"))["selected"]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["date", "crop", "min", "max", "price_type", "variety", "source_url"])
        for item in rows:
            writer.writerow([item["date"], item["crop"], item["low"], item["high"], "wholesale", "Unverified OCR", item.get("source_url", "")])
    print(f"Exported {len(rows)} PROVISIONAL entries to {args.output}; verify source images before use.")


if __name__ == "__main__":
    main()
