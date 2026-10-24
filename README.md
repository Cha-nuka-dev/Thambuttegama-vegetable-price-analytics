# Thambuttegama Vegetable Price Analytics

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![CI](https://github.com/Cha-nuka-dev/Thambuttegama-vegetable-price-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/Cha-nuka-dev/Thambuttegama-vegetable-price-analytics/actions/workflows/ci.yml)

**[View the live research dashboard](https://thambuttegama-crop-prices-chanuka.elatedbay34.chatgpt.site)** · [Source code](dashboard/) · [Methodology](docs/methodology.md)

> The live research dashboard is separate from this public synthetic-data demo and may require authorized access.


An OCR-assisted vegetable price research project for Thambuttegama Dedicated Economic Centre, Sri Lanka. It combines a Sinhala price-list extraction pipeline, interactive multi-year charts, and an exploratory monthly price estimator.

> [!IMPORTANT]
> **This public GitHub edition is a portfolio demonstration.** Its default 2020–2026 charts and estimated prices use **fictional, computer-generated example records**, not the archived Facebook price lists. **Do not use demo estimates for planting or trading decisions.** The actual research archive is not included.

### Features

- A dashboard with separately selectable years (2020–2026), monthly trend comparison, annual summaries and CSV export.
- All 10 tracked crops: tomato, brinjal, green chilli, okra, bitter gourd, thumba karawila, capsicum, beans, local big onion and cauliflower.
- A transparent, non-ML seasonal estimator using matched historical calendar months, weighted sampled-day means, and a non-statistical scenario band.
- A browser-only local data-entry mode and CSV import; no server-side user-data collection.
- A Python + Tesseract OCR pipeline for permitted, locally owned image archives, with explicit provisional/low-confidence outputs.

### Live research dashboard

The original private research Site, which is separate from this standalone GitHub demo, is hosted at:

https://thambuttegama-crop-prices-chanuka.elatedbay34.chatgpt.site

The original Site contains the owner's unverified OCR archive and may require an authorized account. This repository deliberately does **not** redistribute that archive, authentication code, private databases, or photo downloads.

## Screenshots

Screenshots of the **synthetic demo** will be added here. Run the dashboard locally, capture the main multi-year chart and seasonal estimator, and place the images in `docs/screenshots/` as `dashboard.png` and `forecast.png`.

<!-- After uploading screenshots, uncomment these lines:
![Multi-year price comparison](docs/screenshots/dashboard.png)
![Seasonal price estimator](docs/screenshots/forecast.png)
-->

## Quick start: interactive dashboard

Requires Node.js **20.9+** and npm.

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:3000. For a production build:

```bash
npm run typecheck
npm run build
npm start
```

Initially, the **Synthetic demo** tab displays invented values; its forecast numbers are also invented-data calculations. The **Source examples + local entries** tab starts with a few attributed reference examples and reads/writes `localStorage` in the current browser. Use **Add price data** for manually entered observations and **Export CSV** to preserve a backup. The demo never uploads files or data to a backend.

To recreate the same reproducible invented demo:

```bash
python scripts/generate_demo_data.py
```

`dashboard/lib/demo-candidates.json` and `data/sample_data.csv` contain **synthetic** example records. Never substitute a private archive into these tracked demo files and then commit it.

## Local OCR workflow (optional)

Only process photos you have permission to download and analyze. The parser expects ZIP archives with JPEG files and companion `.jpg.json` metadata (e.g., a locally archived gallery-dl export). You need Python 3.10+, Pillow, and Tesseract OCR with Sinhala `sin.traineddata` installed.

```bash
python -m pip install -r requirements.txt
python scripts/extract_thambuttegama_prices.py \
  --archive "PATH_TO_YOUR_ARCHIVE.zip" \
  --output ".local/ocr-output" \
  --tessdata "PATH_TO_TESSDATA" \
  --start-date 2020-01-01 --end-date 2026-10-24 \
  --include-uncaptioned

python scripts/prepare_thambuttegama_dataset.py \
  --input-dir ".local/ocr-output" \
  --output ".local/workbook_input.json"

python scripts/private_ocr_to_csv.py \
  --input ".local/workbook_input.json" \
  --output ".local/private_ocr.csv"
```

The last step exports one CSV (up to 10,000 records can be imported per file) that can be uploaded from the dashboard's **Bulk CSV import** form, while in **Source examples + local entries** mode. Records remain in the browser's local storage; export backups as needed. This is manual updating, **not** live Facebook synchronization.

**Important:** `.local/` is ignored by Git. It is designed to keep private OCR outputs off GitHub. Before public commits, inspect the staged files anyway; `.gitignore` does not undo previously tracked files or protect against `git add -f`.

## Repository layout

```text
dashboard/                 Next.js / React + Tailwind + Recharts UI
dashboard/lib/             Crop definitions, seasonal estimator, fictional demo data
scripts/                   Image OCR, review selection, synthetic demo generator, CSV converter
data/sample_data.csv       Fictional example observations (not real market history)
docs/methodology.md        Method and data-quality limitations
docs/GITHUB_CHECKLIST.md   Safe public repository checklist
tests/                     Simple reproducibility and data-integrity checks
```

## Data ethics and limitations

- **Research source:** [Thambuttegama Economic Centre Facebook page](https://www.facebook.com/thambuttegamaeconomiccenter). Links do not imply endorsement or permission to redistribute its images.
- **Real archived OCR results (not included):** Historically image-derived wholesale price candidates, with variable coverage and unresolved extraction errors. OCR confidence never proves a price was checked.
- **Seasonality estimator:** A weighted average of historical, same-calendar-month sampled days, not a trained or validated machine-learning model. Its low/high band is illustrative, **not** a calibrated prediction interval.
- **Price meaning:** Economic-centre wholesale quotations are not necessarily what growers receive at the farm gate. Supply, weather, transport, quality, and variety may affect actual sales.
- **Update cadence:** New Facebook lists must be downloaded and processed separately, with appropriate permission. No automated Facebook polling is provided in the public demo.

See [the methodology](docs/methodology.md) for formulas and known gaps.

## Author and acknowledgments

Project initiated by **Chanuka Jayasooriya**. Source attribution: Thambuttegama Dedicated Economic Centre for its public price-list posts. Source code and sample-data preparation were assisted by ChatGPT. Third-party UI dependencies and vendored CSS retain their own licenses.

## License

The original project code is released under the [MIT License](LICENSE), copyright (c) 2026 Chanuka Jayasooriya. Third-party dependencies retain their own licenses. The license does not grant rights to third-party Facebook images or their underlying content.
