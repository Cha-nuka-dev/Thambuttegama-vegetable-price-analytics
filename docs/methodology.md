# Extraction and seasonal-estimation methodology

## Research objective

Explore how selected vegetable wholesale quotations at Thambuttegama Economic Centre vary by month and year, then use observed seasonal patterns to form **exploratory** future-month scenarios. The public portfolio dashboard instead ships with clearly labeled synthetic example rows.

## OCR pipeline for private research

1. Read the locally downloaded JPEGs and the accompanying metadata in an authorized archive.
2. Obtain the post date from the price-list caption when available; otherwise fall back to the metadata timestamp. Date inference can be wrong.
3. Locate columns/regions of the centre's portrait-format price table. 2020 layouts use separate approximate boundaries.
4. Run local Tesseract (`sin`) OCR and match Sinhala crop labels with normalized aliases and fuzzy matching.
5. Interpret legible low/high wholesale prices and screen for obvious formatting mistakes using crop-specific plausible bounds.
6. Preserve raw candidate results and retain one preferred table-position candidate per crop/day for provisional comparisons.

The selection process is **heuristic**: crop labels, regions, date and numbers all need checking before they can be treated as authoritative. The words **strong OCR** describe an automatic recognition-score rule, not human validation.

### Ordinary bitter gourd versus thumba karawila

The labels **කරවිල** and **තුඹ කරවිල** represent separate vegetables. OCR occasionally drops the `තුඹ` prefix. Our heuristic provisionally assigns labels from the centre's second table region to thumba karawila, while ordinary bitter gourd comes from the first region. This table-position assumption is not reliable across arbitrary layouts and must not replace image verification.

## Chart calculations

- `midpoint = (minimum_quoted_price + maximum_quoted_price) / 2`.
- For the chosen crop and month, midpoint values with the same trading date are averaged so that each date contributes once.
- The monthly chart uses the arithmetic average of those sampled daily means. Missing dates stay missing; values are not a market-wide census.
- Year-over-year changes require at least five sampled dates in **both** compared calendar months; this is a display threshold, not a statistical quality certification.

## Exploratory forecast formula

For a chosen crop and target calendar month:

1. Keep historical dates strictly earlier than the target month with a valid positive wholesale price interval.
2. For each preceding year, compute the monthly mean from its sampled daily means. Use only years with **3+** sampled days.
3. Require **8+** dates total from eligible years; otherwise report insufficient history.
4. For eligible year `y`, define `weight_y = 0.82^(latest_year - y) * sqrt(min(sampled_days_y, 20))`.
5. Compute `estimate = sum(weight_y * mean_y) / sum(weight_y)`.
6. Use weighted between-year variation and months ahead to create an illustrative low–high **scenario** around that value. The baseline width is at least 25%, or 40% with just one year, and expands with a longer horizon, capped at 80%.

The band is **not** a probabilistic confidence interval. The algorithm has not been validated with walk-forward testing, does not predict supply/harvest dates, and cannot account for inflation or shocks explicitly. It is not labeled as AI/ML prediction accuracy.

## Portfolio dataset

`scripts/generate_demo_data.py` creates deterministic **invented** values with simulated sinusoidal seasonality, mild trend and seeded pseudo-random variation. They are meant to prove that the visualization and estimator run. Inference from this demo has **zero real-world forecasting validity**.

The small reference examples in `dashboard/lib/price-data.ts` are cited individually, are not a complete historical dataset, and should not be interpreted as representative observations of a given month.
