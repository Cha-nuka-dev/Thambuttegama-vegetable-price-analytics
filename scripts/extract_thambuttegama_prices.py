"""Extract reviewable wholesale price candidates from Thambuttegama Facebook archives.

Input: gallery-dl ZIP with JPG images and .jpg.json metadata.
Output: OCR candidates, Facebook photo index, summary JSON. All OCR rows require
manual validation before being described as verified market prices.
"""

import argparse
import collections
import csv
from difflib import SequenceMatcher
import io
import json
import os
from pathlib import Path
import re
import statistics
import subprocess
import unicodedata
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

from PIL import Image


ALIASES = {
    "tomato": ["තක්කාලි"],
    # The centre's lists usually call brinjal simply "බටු".
    "brinjal": ["වම්බටු", "වට්බටු", "බටු"],
    "green-chilli": ["අමුමිරිස්", "අමු මිරිස්", "අමුම්රිස්"],
    "okra": ["බණ්ඩක්කා"],
    "bitter-gourd": ["කරවිල"],
    "spiny-gourd": ["තුඹ කරවිල", "තුඹකරවිල", "තඹ කරවිල"],
    "capsicum": ["මාළුමිරිස්", "මාළු මිරිස්", "මාලුම්රිස්", "මාලුමිරිස්"],
    "beans": ["බෝංචි", "බෝංච්"],
    "local-big-onion": ["දේශීයලොකුළූණු", "දේශීය ලොකු ළූණු", "බී ළූණු දේශීය", "බීළූණුදේශීය", "බී ලූණු දේශීය", "ලොකුළූණු"],
    "cauliflower": ["මල්ගෝවා", "මල් ගෝවා"],
}

NAME_ZONES = [(0.002, 0.160), (0.334, 0.466), (0.658, 0.821)]
PRICE_ZONES = [(0.164, 0.253), (0.468, 0.558), (0.827, 0.917)]
# Older 2020 tables had only a wholesale-price column for each origin. Their
# cells are wider and the middle/right sections are shifted relative to 2021+.
NAME_ZONES_2020 = [(0.002, 0.174), (0.306, 0.500), (0.692, 0.901)]
PRICE_ZONES_2020 = [(0.174, 0.305), (0.500, 0.618), (0.901, 0.998)]


def normalize(value):
    value = unicodedata.normalize("NFKC", value or "")
    return re.sub(r"[^\u0D80-\u0DFFa-zA-Z0-9]", "", value).lower()


NORM_ALIASES = {crop: [normalize(alias) for alias in aliases] for crop, aliases in ALIASES.items()}


def date_from_caption(caption, fallback):
    match = re.search(r"\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b", caption)
    if match:
        day, month, year = map(int, match.groups())
        try:
            from datetime import date
            return date(year, month, day).isoformat(), "caption"
        except ValueError:
            pass
    return fallback[:10], "post timestamp"


def crop_match(label):
    norm = normalize(label)
    if not norm:
        return None, 0.0
    # The market publishes ordinary bitter gourd and thumba karawila as
    # separate rows. Resolve the more specific label before fuzzy matching
    # the shorter substring "කරවිල".
    if any(name in norm for name in ("තුඹකරවිල", "තඹකරවිල", "නුඹකරවිල")):
        return "spiny-gourd", 1.0
    scored = []
    for crop, aliases in NORM_ALIASES.items():
        score = 0.0
        for alias in aliases:
            if alias == norm:
                score = max(score, 1.0)
            elif alias in norm and len(alias) >= 5:
                # A variety annotation after the crop name is fine.
                score = max(score, 0.95)
            elif len(alias) >= 6 and norm in alias and len(norm) >= 5:
                score = max(score, 0.80 * len(norm) / len(alias))
            else:
                score = max(score, SequenceMatcher(None, norm, alias).ratio())
                # Price lists often append variety/origin names and MI2 after
                # the vegetable name. Compare Sinhala-only prefixes as well.
                sin_only = re.sub(r"[a-z0-9]", "", norm)
                if len(alias) >= 6:
                    for size in (len(alias)-2,len(alias),len(alias)+2):
                        if size >= 5:
                            for start in range(max(1,len(sin_only)-size+1)):
                                piece = sin_only[start:start+size]
                                if len(piece) >= 5:
                                    score = max(score, 0.95 * SequenceMatcher(None,piece,alias).ratio())
        scored.append((score, crop))
    scored.sort(reverse=True)
    if scored[0][0] < 0.77 or (len(scored)>1 and scored[0][0] - scored[1][0] < 0.06):
        return None, scored[0][0]
    if scored[0][1] == "tomato" and ("වට්ට" in norm or "වට්ටක්කා" in norm):
        return None, scored[0][0]
    if scored[0][1] == "brinjal" and ("එළබටු" in norm or "තිබ්බටු" in norm):
        return None, scored[0][0]
    return scored[0][1], scored[0][0]


def ocr_words(jpg_bytes, tessdata_dir):
    command = ["tesseract", "stdin", "stdout", "-l", "sin", "--tessdata-dir", tessdata_dir, "--psm", "11", "tsv"]
    env = dict(os.environ, OMP_THREAD_LIMIT="1")
    proc = subprocess.run(command, input=jpg_bytes, capture_output=True, env=env, timeout=90)
    if proc.returncode:
        raise RuntimeError(proc.stderr.decode("utf-8", "replace")[-300:])
    table = csv.DictReader(io.StringIO(proc.stdout.decode("utf-8", "replace")), delimiter="\t", quoting=csv.QUOTE_NONE)
    result = []
    for word in table:
        if word.get("level") != "5" or not (word.get("text") or "").strip():
            continue
        try:
            w = {key: int(word[key]) for key in ("left", "top", "width", "height")}
            w["conf"] = float(word["conf"])
            w["text"] = word["text"].strip()
            w["cy"] = w["top"] + w["height"] / 2
            result.append(w)
        except (KeyError, TypeError, ValueError):
            continue
    return result


def table_bounds(jpg_bytes):
    with Image.open(io.BytesIO(jpg_bytes)) as im:
        img = im.convert("L")
        black = img.point(lambda pixel: 255 if pixel < 115 else 0)
        bounds = black.getbbox()
        if bounds is None:
            raise ValueError("Blank image")
        x0, _y0, x1, _y1 = bounds
        # Reject non-table or landscape pictures from a user export.
        if x1 - x0 < 0.65 * im.width or im.height < im.width * 1.1:
            raise ValueError("Image does not resemble the portrait price table")
        return x0, x1, im.width, im.height


def group_label_lines(words, x0, x1, height, zone_index, name_zones=NAME_ZONES):
    left_rel, right_rel = name_zones[zone_index]
    width = x1 - x0
    left, right = x0 + width * left_rel, x0 + width * right_rel
    cell_words = [w for w in words if left - 6 <= w["left"] + w["width"] / 2 <= right + 1
                  and 4 <= w["height"] < height * .025]
    if not cell_words:
        return []
    font_h = statistics.median(w["height"] for w in cell_words)
    y_threshold = min(10, max(5, font_h * 0.50))
    clusters = []
    for w in sorted(cell_words, key=lambda item: (item["cy"], item["left"])):
        match = next((line for line in reversed(clusters[-6:]) if abs(line["cy"] - w["cy"]) <= y_threshold), None)
        if match is None:
            clusters.append({"cy": w["cy"], "words": [w]})
        else:
            match["words"].append(w)
            match["cy"] = statistics.median(item["cy"] for item in match["words"])
    for line in clusters:
        line["words"].sort(key=lambda w: w["left"])
        line["label"] = " ".join(w["text"] for w in line["words"])
        line["conf"] = statistics.median(w["conf"] for w in line["words"])
    return clusters


def parse_price(words, x0, x1, cy, zone_index, height, price_zones=PRICE_ZONES):
    width = x1 - x0
    l, r = price_zones[zone_index]
    left, right = x0 + width * l, x0 + width * r
    close = [w for w in words if left - 2 <= (w["left"] + w["width"] / 2) <= right + 2
             and abs(w["cy"] - cy) <= max(7, height * .007)]
    close.sort(key=lambda w: w["left"])
    nums = []
    confidences = []
    for w in close:
        value = w["text"].replace("O", "0").replace("o", "0").strip(".,:|[]() \n")
        if re.fullmatch(r"\d{1,4}", value):
            nums.append(int(value))
            confidences.append(w["conf"])
        elif re.fullmatch(r"\d{1,4}\s*[-–]\s*\d{1,4}", value):
            a, b = [int(x) for x in re.findall(r"\d+", value)]
            nums.extend((a,b))
            confidences.extend((w["conf"],w["conf"]))
    if len(nums) not in (1,2):
        return None
    lo, hi = (nums[0], nums[-1])
    if not (1 <= lo <= hi <= 5000):
        return None
    return lo,hi,round(min(confidences),1)," ".join(w["text"] for w in close)


def extract_one(metadata, jpg_bytes, tessdata_dir):
    day, date_source = date_from_caption(metadata.get("caption", ""), metadata.get("date", ""))
    name_zones = NAME_ZONES_2020 if day.startswith("2020-") else NAME_ZONES
    price_zones = PRICE_ZONES_2020 if day.startswith("2020-") else PRICE_ZONES
    photo_id = metadata.get("id", "")
    source_url = "https://www.facebook.com/photo/?fbid=" + photo_id
    origin = {"date": day, "caption": metadata.get("caption", ""), "photo_id": photo_id,
              "image_name": photo_id + ".jpg", "source_url": source_url, "date_source": date_source}
    try:
        x0, x1, _width, height = table_bounds(jpg_bytes)
        words = ocr_words(jpg_bytes, tessdata_dir)
        records = []
        for zone_idx in range(3):
            for line in group_label_lines(words, x0, x1, height, zone_idx, name_zones):
                crop, label_score = crop_match(line["label"])
                if not crop:
                    continue
                # Across the archived price-list template, the second table
                # region contains thumba karawila. Sinhala OCR often drops
                # its prefix and transcribes just "කරවිල". Use the region
                # with the crop label, keeping all readings provisional.
                if zone_idx == 1 and crop == "bitter-gourd":
                    crop = "spiny-gourd"
                # The right-hand column contains fruit, fish and other goods;
                # these look like vegetable names under fuzzy OCR.
                if zone_idx == 2 and crop != "local-big-onion":
                    continue
                price = parse_price(words, x0, x1, line["cy"], zone_idx, height, price_zones)
                if not price:
                    continue
                low, high, number_conf, raw_value = price
                status = "review" if label_score < 0.88 or number_conf < 70 or line["conf"] < 35 else "candidate"
                records.append({**origin,"crop":crop,"min_price":low,"max_price":high,
                                "table_column":zone_idx+1,"recognized_label":line["label"],
                                "recognized_price":raw_value,"label_match":round(label_score,3),
                                "label_ocr_conf":round(line["conf"],1),"number_ocr_conf":number_conf,
                                "status":status})
        # Both sample templates start the Nuwara Eliya section with beans.
        # Recover this row when Sinhala OCR shortens the label to a syllable.
        if not any(r["crop"] == "beans" and r["table_column"] == 1 for r in records):
            headers = [w for w in words if normalize(w["text"]) in ("තොග", "තොගමිල")
                       and 0.15 < (w["left"]-x0)/(x1-x0) < 0.25 and w["cy"] < height*.27]
            if headers:
                header = min(headers,key=lambda w:w["cy"])
                near = [w for w in words if .166 < (w["left"]-x0)/(x1-x0) < .253
                        and header["cy"]+10 < w["cy"] < header["cy"]+45 and re.fullmatch(r"\d{2,4}",w["text"])]
                if near:
                    first = min(near,key=lambda w:w["cy"])
                    price = parse_price(words,x0,x1,first["cy"],0,height,price_zones)
                    if price:
                        low, high, number_conf, raw_value = price
                        records.append({**origin,"crop":"beans","min_price":low,"max_price":high,
                                        "table_column":1,"recognized_label":"First Nuwara Eliya row (beans)",
                                        "recognized_price":raw_value,"label_match":0.70,"label_ocr_conf":0,
                                        "number_ocr_conf":number_conf,"status":"review"})
        # In the Rajarata section, the next row immediately after "කරවිල"
        # is "බටු" (brinjal). The short Sinhala label is often omitted by OCR.
        if not any(r["crop"] == "brinjal" and r["table_column"] == 1 for r in records):
            price_left=x0+(x1-x0)*price_zones[0][0]
            price_right=x0+(x1-x0)*price_zones[0][1]
            number_words=[w for w in words if price_left <= w["left"]+w["width"]*.5 <= price_right
                          and re.fullmatch(r"\d{1,4}",w["text"])]
            for line in group_label_lines(words,x0,x1,height,0,name_zones):
                crop, score = crop_match(line["label"])
                if crop!="bitter-gourd" or score < .90 or "තුඹ" in line["label"]:
                    continue
                lower=[w for w in number_words if line["cy"]+max(10,height*.007) < w["cy"]
                       < line["cy"]+max(33,height*.033)]
                if not lower:
                    continue
                next_y=min(lower,key=lambda w:w["cy"])["cy"]
                price=parse_price(words,x0,x1,next_y,0,height,price_zones)
                if price:
                    low,high,num_conf,raw_value=price
                    records.append({**origin,"crop":"brinjal","min_price":low,"max_price":high,
                                    "table_column":1,"recognized_label":"Row after කරවිල (බටු)",
                                    "recognized_price":raw_value,"label_match":.70,"label_ocr_conf":0,
                                    "number_ocr_conf":num_conf,"status":"review"})
                    break
        # Multiple matches for a crop can be different origin/variety prices.
        keyset = set()
        unique = []
        for row in records:
            key = (row["crop"], row["table_column"], row["min_price"], row["max_price"])
            if key not in keyset:
                keyset.add(key)
                unique.append(row)
        return origin, unique, None
    except Exception as exc:
        return origin, [], str(exc)


def run(archive, output, tessdata_dir, limit, workers, start_date, end_date, include_uncaptioned):
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zip_file:
        meta_names = [name for name in zip_file.namelist() if name.endswith(".jpg.json")]
        metadata = [json.loads(zip_file.read(name)) for name in meta_names]
        index = []
        price_lists = []
        for index_num,m in enumerate(metadata):
            day, date_source = date_from_caption(m.get("caption", ""), m.get("date", ""))
            index.append({"date":day,"date_source":date_source,"photo_id":m.get("id", ""),
                          "caption":m.get("caption", ""),"source_url":"https://www.facebook.com/photo/?fbid=" + m.get("id", ""),
                          "is_price_list":"price list" in m.get("caption", "").lower()})
            if (include_uncaptioned or "price list" in m.get("caption", "").lower()) and start_date <= day <= end_date:
                photo_name = meta_names[index_num].removesuffix(".json")
                if photo_name in zip_file.namelist():
                    price_lists.append((m, photo_name))
        index.sort(key=lambda x:(x["date"],x["photo_id"]))
        with (output / "facebook_photo_index.csv").open("w",newline="",encoding="utf-8-sig") as file:
            writer=csv.DictWriter(file,fieldnames=index[0].keys());writer.writeheader();writer.writerows(index)
        selected = price_lists[:limit] if limit else price_lists
        work = [(m,zip_file.read(name)) for m,name in selected]

    extracted, errors = [], []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        tasks = {pool.submit(extract_one,m,image,tessdata_dir): m for m,image in work}
        for count, fut in enumerate(as_completed(tasks),1):
            origin, rows, error = fut.result()
            extracted.extend(rows)
            if error:
                errors.append({**origin,"error":error})
            if count % 40 == 0:
                print("Processed",count,"/",len(tasks),"images; candidates",len(extracted),flush=True)
    extracted.sort(key=lambda x:(x["date"],x["crop"],x["table_column"],x["photo_id"]))
    fields = ["date","crop","min_price","max_price","table_column","recognized_label","recognized_price",
              "status","label_match","label_ocr_conf","number_ocr_conf","photo_id","source_url","image_name","date_source","caption"]
    with (output / "ocr_price_candidates.csv").open("w",newline="",encoding="utf-8-sig") as file:
        writer=csv.DictWriter(file,fieldnames=fields);writer.writeheader();writer.writerows(extracted)
    summary = {"total_photos":len(index),"price_list_captions":len(price_lists),"processed_images":len(work),
               "ocr_candidates":len(extracted),"candidate_statuses":dict(collections.Counter(x["status"] for x in extracted)),
               "by_crop":dict(collections.Counter(x["crop"] for x in extracted)),
               "by_month":dict(sorted(collections.Counter(x["date"][:7] for x in extracted).items())),
               "errors":errors[:100]}
    (output / "extraction_summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({key:value for key,value in summary.items() if key!="errors"},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--tessdata",default="/tmp/thambuttegama-ocr-samples")
    parser.add_argument("--limit",type=int,default=0)
    parser.add_argument("--workers",type=int,default=4)
    parser.add_argument("--start-date",default="2025-01-01")
    parser.add_argument("--end-date",default="9999-12-31")
    parser.add_argument("--include-uncaptioned",action="store_true",help="OCR all dated photos in range, including older image-only price posts")
    args=parser.parse_args()
    run(args.archive,args.output,args.tessdata,args.limit,args.workers,args.start_date,args.end_date,args.include_uncaptioned)
