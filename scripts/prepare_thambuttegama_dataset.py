"""Build the dated OCR review dataset and month-to-month comparison inputs.

All OCR prices remain provisional. This script never converts OCR confidence
into a claim that a Facebook image has been independently verified.
"""

import collections
import argparse
import csv
from datetime import datetime
import json
from pathlib import Path


INPUT_DIR = Path("/tmp/thambuttegama-ocr-all")
OUT = Path("/tmp/thambuttegama-workbook/workbook_input.json")
PREFERRED = {
    "tomato":2,
    "brinjal":1,
    "green-chilli":1,
    "okra":1,
    "bitter-gourd":1,
    "spiny-gourd":2,
    "capsicum":1,
    "beans":1,
    "local-big-onion":3,
    "cauliflower":1,
}
# Deliberately broad safety bounds. These only screen obvious OCR glitches,
# not genuine market variation. The excluded observations remain in the audit.
PLAUSIBLE_BOUNDS = {
    "tomato": (15,900),
    "brinjal": (20,1100),
    "green-chilli": (40,2000),
    "okra": (20,500),
    "bitter-gourd": (20,1100),
    "spiny-gourd": (20,2000),
    "capsicum": (50,2000),
    "beans": (40,1100),
    "local-big-onion": (50,600),
    "cauliflower": (60,800),
}
CROPS = [
    ("tomato","Tomato","තක්කාලි"),
    ("brinjal","Brinjal","වම්බටු"),
    ("green-chilli","Green chilli","අමු මිරිස්"),
    ("okra","Okra","බණ්ඩක්කා"),
    ("bitter-gourd","Bitter gourd","කරවිල"),
    ("spiny-gourd","Thumba karawila (spiny gourd)","තුඹ කරවිල"),
    ("capsicum","Capsicum","මාළු මිරිස්"),
    ("beans","Beans","බෝංචි"),
    ("local-big-onion","Local big onion","දේශීය ලොකු ළූණු"),
    ("cauliflower","Cauliflower","මල් ගෝවා"),
]


def distinguish_gourd(row):
    """Keep ordinary karawila and thumba karawila as separate crop IDs.

    OCR sometimes drops 'තුඹ' from the name; the Thambuttegama archived
    table's second region carries the thumba karawila row. This location
    heuristic is provisional and must be verified against the photo.
    """
    if row["crop"] != "bitter-gourd":
        return row
    label = row.get("recognized_label", "")
    if int(row.get("table_column", 0)) == 2 or any(x in label for x in ("තුඹ", "තඹ", "නුඹ")):
        row["crop"] = "spiny-gourd"
    return row


def load_csv(path):
    with path.open(encoding="utf-8-sig",newline="") as f:
        return list(csv.DictReader(f))


def admissible(row):
    label = row["recognized_label"]
    minimum, maximum = PLAUSIBLE_BOUNDS[row["crop"]]
    if not (minimum <= row["low"] <= row["high"] <= maximum):
        return False
    if row["crop"] == "tomato" and ("වට්ට" in label or "වට්ටක්කා" in label):
        return False
    if row["crop"] == "bitter-gourd" and any(prefix in label for prefix in ("තුඹ", "තඹ", "නුඹ")):
        return False  # separate crop: thumba karawila
    if row["crop"] == "local-big-onion" and "දේශීය" not in label and "ලොකු" not in label:
        return False
    return True


def quality(row):
    match = float(row["label_match"])
    name = float(row["label_ocr_conf"])
    numeric = float(row["number_ocr_conf"])
    if match >= .94 and name >= 55 and numeric >= 80 and "First Nuwara" not in row["recognized_label"]:
        return "strong OCR"
    return "review OCR"


def preference(row):
    return (
        int(row["table_column"]) == PREFERRED[row["crop"]],
        quality(row) == "strong OCR",
        float(row["label_match"]),
        float(row["number_ocr_conf"]),
        float(row["label_ocr_conf"]),
    )


def main(input_dir=INPUT_DIR, output_file=OUT):
    source = load_csv(input_dir / "ocr_price_candidates.csv")
    photos = load_csv(input_dir / "facebook_photo_index.csv")
    # Keep raw OCR rows as an audit trail, including imperfect recognitions.
    ocr = []
    by_day_crop = collections.defaultdict(list)
    for row in source:
        row["low"] = int(row.pop("min_price"))
        row["high"] = int(row.pop("max_price"))
        row["table_column"] = int(row["table_column"])
        row["label_match"] = float(row["label_match"])
        row["label_ocr_conf"] = float(row["label_ocr_conf"])
        row["number_ocr_conf"] = float(row["number_ocr_conf"])
        distinguish_gourd(row)
        row["quality"] = quality(row)
        row["exclude_from_comparison"] = not admissible(row)
        ocr.append(row)
        if admissible(row):
            by_day_crop[(row["date"],row["crop"])].append(row)
    selected=[]
    for (date,crop),rows in sorted(by_day_crop.items()):
        # Keep one wholesale observation per crop/day. Prefer a consistent
        # region/table column to avoid mixing different varieties.
        chosen = max(rows,key=preference)
        if chosen["table_column"] != PREFERRED[crop]:
            continue  # absence is more honest than mixing different origins
        selected.append({key:chosen[key] for key in
                         ("date","crop","low","high","table_column","recognized_label","quality",
                          "label_match","label_ocr_conf","number_ocr_conf","photo_id","source_url")})

    day_counts=collections.Counter((p["date"][:7] for p in photos if p["is_price_list"]=="True"))
    coverage=[]
    for month in sorted(set(day_counts) | {s["date"][:7] for s in selected}):
        coverage.append({"month":month,"source_images":day_counts[month],
                         "selected_records":sum(s["date"].startswith(month) for s in selected),
                         "distinct_crops":len({s["crop"] for s in selected if s["date"].startswith(month)})})

    dataset={"crops":CROPS,"ocr":ocr,"selected":selected,"photos":photos,
             "coverage":coverage,"note":"All OCR results are provisional until human image review.",
             "stats":{"photos":len(photos),"ocr_rows":len(ocr),"selected_rows":len(selected),
                      "selected_quality":dict(collections.Counter(s["quality"] for s in selected)),
                      "by_crop":dict(collections.Counter(s["crop"] for s in selected)),
                      "first_date":min((s["date"] for s in selected),default=""),
                      "last_date":max((s["date"] for s in selected),default="")}}
    output_file.parent.mkdir(parents=True,exist_ok=True)
    output_file.write_text(json.dumps(dataset,ensure_ascii=False),encoding="utf-8")
    print(json.dumps(dataset["stats"],ensure_ascii=False,indent=2))


if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--input-dir",type=Path,default=INPUT_DIR)
    parser.add_argument("--output",type=Path,default=OUT)
    args=parser.parse_args()
    main(args.input_dir,args.output)
