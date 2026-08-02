#!/usr/bin/env python3
"""Aggregate per-country new-candidate outputs into one sortable CSV."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parent
COUNTRY_VALIDATION_DIR = ROOT / "country-validation"
DEFAULT_OUTPUT_PATH = ROOT / "country-validation" / "all_new_candidates.csv"
LEGACY_DENMARK_NEW_CANDIDATES = ROOT / "denmark_new_candidates.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Aggregate per-country new candidate CSV files.")
    parser.add_argument("--input-dir", type=Path, default=COUNTRY_VALIDATION_DIR, help="Directory containing country-validation/<ISO3>/new_candidates.csv outputs.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="Combined CSV output path.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows: list[dict[str, str]] = []

    if LEGACY_DENMARK_NEW_CANDIDATES.exists():
        with LEGACY_DENMARK_NEW_CANDIDATES.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                rows.append({"countryIso3": "DNK", **row})

    for path in sorted(args.input_dir.glob("*/new_candidates.csv")):
        country_iso3 = path.parent.name.strip().upper()
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                rows.append({"countryIso3": country_iso3, **row})

    rows.sort(
        key=lambda row: (
            row.get("countryIso3", ""),
            row.get("bucket", ""),
            row.get("commonName", ""),
            row.get("binomial", ""),
        )
    )

    fieldnames = ["countryIso3"]
    if rows:
        for key in rows[0].keys():
            if key != "countryIso3":
                fieldnames.append(key)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} new-candidate rows to {args.output}")


if __name__ == "__main__":
    main()