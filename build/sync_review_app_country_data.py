#!/usr/bin/env python3
"""Sync rebuilt country data into the review app while preserving extra packs.

The web-plugin bundle contains the 249 top-level country packs. The review app also
keeps extra entries such as USA state packs, so this script overwrites matching
country files, preserves extra target-only packs, and merges the index rows.
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_SOURCE_DATA_ROOT = ROOT / "web-plugin" / "data"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync rebuilt country pack data into a review app checkout.")
    parser.add_argument(
        "--source-data-root",
        default=str(DEFAULT_SOURCE_DATA_ROOT),
        help="Directory containing animals-global.json, geofence-simple.json, and precomputed-countries/.",
    )
    parser.add_argument(
        "--target-review-root",
        required=True,
        help="Review app root containing data/ and tools/ directories.",
    )
    parser.add_argument(
        "--countries",
        default="",
        help="Optional comma-separated ISO3 country list to sync instead of the full top-level country set.",
    )
    parser.add_argument(
        "--country-list-csv",
        default="",
        help="Optional CSV file whose countryIso3 or iso3 column defines which top-level country packs to sync.",
    )
    return parser.parse_args()


def load_json(path: Path) -> dict | list:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


def sync_file(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target_path)


def sort_index_rows(rows: list[dict]) -> list[dict]:
    return sorted(
        rows,
        key=lambda row: (
            str((row or {}).get("countryName") or "").strip().lower(),
            str((row or {}).get("iso3") or "").strip().upper(),
        ),
    )


def parse_country_selection(args: argparse.Namespace) -> set[str]:
    selected: set[str] = set()

    if args.countries:
        for value in str(args.countries).split(","):
            iso3 = value.strip().upper()
            if iso3:
                selected.add(iso3)

    if args.country_list_csv:
        csv_path = Path(args.country_list_csv).expanduser().resolve()
        with csv_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                iso3 = str(row.get("countryIso3") or row.get("iso3") or "").strip().upper()
                if iso3:
                    selected.add(iso3)

    return selected


def main() -> None:
    args = parse_args()
    source_data_root = Path(args.source_data_root).expanduser().resolve()
    target_review_root = Path(args.target_review_root).expanduser().resolve()
    target_data_root = target_review_root / "data"
    selected_iso3 = parse_country_selection(args)

    source_country_dir = source_data_root / "precomputed-countries"
    target_country_dir = target_data_root / "precomputed-countries"
    source_index_path = source_country_dir / "index.json"
    target_index_path = target_country_dir / "index.json"

    if not source_country_dir.exists():
        raise SystemExit(f"Source country directory not found: {source_country_dir}")
    if not source_index_path.exists():
        raise SystemExit(f"Source index not found: {source_index_path}")
    if not target_review_root.exists():
        raise SystemExit(f"Target review root not found: {target_review_root}")

    copied_files: list[str] = []
    for filename in ("animals-global.json", "geofence-simple.json"):
        source_path = source_data_root / filename
        if source_path.exists():
            sync_file(source_path, target_data_root / filename)
            copied_files.append(filename)

    source_rows = load_json(source_index_path).get("countries") or []
    target_rows = []
    if target_index_path.exists():
        target_rows = load_json(target_index_path).get("countries") or []

    source_rows_by_iso3 = {
        str((row or {}).get("iso3") or "").strip().upper(): row
        for row in source_rows
        if str((row or {}).get("iso3") or "").strip()
    }

    if selected_iso3:
        missing_iso3 = sorted(iso3 for iso3 in selected_iso3 if iso3 not in source_rows_by_iso3)
        if missing_iso3:
            raise SystemExit(f"Selected ISO3 values not found in source index: {', '.join(missing_iso3)}")

    source_iso3 = set(source_rows_by_iso3)

    for path in sorted(source_country_dir.glob("*.json")):
        if path.name == "index.json":
            continue
        iso3 = path.stem.upper()
        if selected_iso3 and iso3 not in selected_iso3:
            continue
        sync_file(path, target_country_dir / path.name)

    preserved_target_rows = []
    for row in target_rows:
        iso3 = str((row or {}).get("iso3") or "").strip().upper()
        if selected_iso3:
            if iso3 and iso3 not in selected_iso3:
                preserved_target_rows.append(row)
            continue
        if iso3 and iso3 not in source_iso3:
            preserved_target_rows.append(row)

    source_rows_to_merge = list(source_rows)
    if selected_iso3:
        source_rows_to_merge = [source_rows_by_iso3[iso3] for iso3 in sorted(selected_iso3)]

    merged_rows = sort_index_rows(source_rows_to_merge + preserved_target_rows)
    target_index_payload = {
        "generatedAtUtc": load_json(source_index_path).get("generatedAtUtc", ""),
        "sourceDataset": load_json(source_index_path).get("sourceDataset", ""),
        "countries": merged_rows,
    }
    write_json(target_index_path, target_index_payload)

    if selected_iso3:
        print(f"Synced selected top-level countries: {len(source_rows_to_merge)}")
    else:
        print(f"Source top-level countries: {len(source_rows)}")
    print(f"Preserved target-only entries: {len(preserved_target_rows)}")
    print(f"Merged target index rows: {len(merged_rows)}")
    print(f"Synced data files: {', '.join(copied_files) if copied_files else 'none'}")
    print(f"Target review root updated: {target_review_root}")


if __name__ == "__main__":
    main()