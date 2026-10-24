"""Generate the Site's compact static OCR preview from the reviewed workbook input.

Every price remains provisional and is deliberately separate from the database
of checked/manual observations in the dashboard.
"""

import json
import argparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--input",type=Path,required=True,help="Private workbook_input.json produced by the selection step")
parser.add_argument("--output",type=Path,required=True,help="Private output path; never commit full source-derived data without permission")
args = parser.parse_args()
source,destination = args.input,args.output
rows = json.loads(source.read_text(encoding="utf-8"))["selected"]
preview = [
    {"date": r["date"], "crop": r["crop"], "low": r["low"], "high": r["high"],
     "source_url": r["source_url"], "quality": r["quality"]}
    for r in rows
]
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(preview, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
print(f"Dashboard preview contains {len(preview)} provisional prices: {destination}")
