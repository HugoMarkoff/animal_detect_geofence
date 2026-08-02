#!/usr/bin/env python3
"""Merge candidate-only pending subset artifacts back into full country outputs."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PENDING_SUBSET_DIR = ROOT / "country-validation" / "pending-subset"
WEB_PACK_DIR = ROOT / "web-plugin" / "data" / "precomputed-countries"
LEGACY_DENMARK_PATH = ROOT / "web-plugin" / "data" / "precomputed-country-footprints.json"
DENMARK_AUDIT_CSV = ROOT / "denmark_species_validation.csv"
DENMARK_NEW_CANDIDATES_CSV = ROOT / "denmark_new_candidates.csv"

STATUS_TO_BUCKET = {
    "likely_true_both": "Likely Valid",
    "likely_true_one_source": "Likely Valid",
    "new_record": "New",
    "likely_false": "Needs Review",
    "unlisted": "Unlisted",
}


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_datetime(value: str) -> datetime | None:
    text = clean_text(value)
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def clean_text(value: object) -> str:
    return str(value or "").strip()


def sort_key(value: object) -> str:
    return clean_text(value).casefold()


def item_id_for(row: dict[str, object]) -> str:
    return clean_text(row.get("itemId"))


def load_json(path: Path) -> dict | list:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


def load_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    if not path.exists():
        return [], []

    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        return list(reader.fieldnames or []), rows


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})


def merge_rows(full_rows: list[dict[str, str]], subset_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    subset_by_id = {item_id_for(row): row for row in subset_rows if item_id_for(row)}
    if not subset_by_id:
        return full_rows

    merged_rows: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for row in full_rows:
        item_id = item_id_for(row)
        if item_id and item_id in subset_by_id:
            merged_rows.append(subset_by_id[item_id])
            seen_ids.add(item_id)
        else:
            merged_rows.append(row)

    missing_subset_rows = [
        row for item_id, row in subset_by_id.items() if item_id and item_id not in seen_ids
    ]
    missing_subset_rows.sort(
        key=lambda row: (sort_key(row.get("commonName") or row.get("binomial")), item_id_for(row))
    )
    merged_rows.extend(missing_subset_rows)
    return merged_rows


def merge_candidate_rows(
    full_rows: list[dict[str, str]],
    subset_all_rows: list[dict[str, str]],
    subset_candidate_rows: list[dict[str, str]],
) -> list[dict[str, str]]:
    subset_ids = {item_id_for(row) for row in subset_all_rows if item_id_for(row)}
    next_rows = [row for row in full_rows if item_id_for(row) not in subset_ids]
    next_rows.extend(subset_candidate_rows)
    next_rows.sort(
        key=lambda row: (sort_key(row.get("commonName") or row.get("binomial")), item_id_for(row))
    )
    return next_rows


def recompute_pack_summary(entries: list[dict[str, object]]) -> dict[str, object]:
    status_counts: Counter[str] = Counter()
    bucket_counts: Counter[str] = Counter()

    for entry in entries:
        status = clean_text(entry.get("status"))
        bucket = clean_text(entry.get("bucket")) or STATUS_TO_BUCKET.get(status, "")
        if status:
            status_counts[status] += 1
        if bucket:
            bucket_counts[bucket] += 1

    return {
        "total": len(entries),
        "statusCounts": dict(status_counts),
        "bucketCounts": dict(bucket_counts),
    }


def merge_pack_entries(
    full_pack: dict[str, object],
    subset_pack: dict[str, object],
) -> dict[str, object]:
    subset_entries = [entry for entry in (subset_pack.get("entries") or []) if item_id_for(entry)]
    subset_by_id = {item_id_for(entry): entry for entry in subset_entries}
    if not subset_by_id:
        return full_pack

    full_entries = [entry for entry in (full_pack.get("entries") or []) if item_id_for(entry)]
    next_entries: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for entry in full_entries:
        item_id = item_id_for(entry)
        if item_id in subset_by_id:
            next_entries.append(subset_by_id[item_id])
            seen_ids.add(item_id)
        else:
            next_entries.append(entry)

    for item_id, entry in sorted(subset_by_id.items(), key=lambda item: item[0]):
        if item_id not in seen_ids:
            next_entries.append(entry)

    next_entries.sort(key=lambda entry: item_id_for(entry))

    merged = dict(full_pack)
    merged["entries"] = next_entries
    merged["generatedAtUtc"] = now_utc_iso()
    merged["summary"] = recompute_pack_summary(next_entries)
    return merged


def full_country_validation_dir(country_key: str) -> Path:
    return ROOT / "country-validation" / country_key


def full_species_validation_path(country_key: str) -> Path:
    if country_key == "DNK":
        return DENMARK_AUDIT_CSV
    return full_country_validation_dir(country_key) / "species_validation.csv"


def full_new_candidates_path(country_key: str) -> Path:
    if country_key == "DNK":
        return DENMARK_NEW_CANDIDATES_CSV
    return full_country_validation_dir(country_key) / "new_candidates.csv"


def subset_paths(country_key: str) -> dict[str, Path]:
    base = PENDING_SUBSET_DIR / country_key
    return {
        "pack": base / "precomputed_validation.json",
        "audit": base / "species_validation.csv",
        "new": base / "new_candidates.csv",
    }


def merge_country(country_key: str) -> dict[str, object]:
    paths = subset_paths(country_key)
    subset_pack = load_json(paths["pack"])
    subset_fieldnames, subset_audit_rows = load_csv(paths["audit"])
    subset_new_fieldnames, subset_new_rows = load_csv(paths["new"])

    full_pack_path = WEB_PACK_DIR / f"{country_key}.json"
    full_pack = load_json(full_pack_path) if full_pack_path.exists() else {"entries": []}
    merged_pack = merge_pack_entries(full_pack, subset_pack)
    write_json(full_pack_path, merged_pack)
    if country_key == "DNK":
        write_json(LEGACY_DENMARK_PATH, merged_pack)

    full_audit_path = full_species_validation_path(country_key)
    full_audit_fieldnames, full_audit_rows = load_csv(full_audit_path)
    audit_fieldnames = full_audit_fieldnames or subset_fieldnames
    merged_audit_rows = merge_rows(full_audit_rows, subset_audit_rows)
    write_csv(full_audit_path, audit_fieldnames, merged_audit_rows)

    full_new_path = full_new_candidates_path(country_key)
    full_new_fieldnames, full_new_rows = load_csv(full_new_path)
    new_fieldnames = full_new_fieldnames or subset_new_fieldnames or audit_fieldnames
    merged_new_rows = merge_candidate_rows(full_new_rows, subset_audit_rows, subset_new_rows)
    write_csv(full_new_path, new_fieldnames, merged_new_rows)

    return {
        "country": country_key,
        "subsetRows": len(subset_audit_rows),
        "subsetNewRows": len(subset_new_rows),
        "packTotal": int((merged_pack.get("summary") or {}).get("total") or len(merged_pack.get("entries") or [])),
    }


def iter_subset_countries() -> list[str]:
    countries: list[str] = []
    if not PENDING_SUBSET_DIR.exists():
        return countries

    for child in sorted(PENDING_SUBSET_DIR.iterdir(), key=lambda path: path.name):
        if not child.is_dir():
            continue
        if (child / "precomputed_validation.json").exists() and (child / "species_validation.csv").exists():
            countries.append(child.name)
    return countries


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Merge pending subset artifacts back into full country outputs.")
    parser.add_argument(
        "--countries",
        default="",
        help="Optional comma-separated country keys to merge explicitly.",
    )
    parser.add_argument(
        "--worklist-csv",
        type=Path,
        default=None,
        help="Optional worklist CSV whose countryIso3 values define the merge scope.",
    )
    parser.add_argument(
        "--min-generated-at",
        default="",
        help="Optional inclusive ISO timestamp; only subset packs generated at or after this time are merged.",
    )
    return parser.parse_args()


def countries_from_worklist(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        seen: list[str] = []
        seen_set: set[str] = set()
        for row in reader:
            country_key = clean_text(row.get("countryIso3")).upper()
            if not country_key or country_key in seen_set:
                continue
            seen_set.add(country_key)
            seen.append(country_key)
    return seen


def subset_pack_is_fresh(country_key: str, min_generated_at: datetime | None) -> bool:
    if min_generated_at is None:
        return True

    subset_pack_path = subset_paths(country_key)["pack"]
    if not subset_pack_path.exists():
        return False

    generated_at = parse_iso_datetime(clean_text((load_json(subset_pack_path) or {}).get("generatedAtUtc")))
    if generated_at is None:
        return False
    return generated_at >= min_generated_at


def main() -> None:
    args = parse_args()
    min_generated_at = parse_iso_datetime(args.min_generated_at)

    if args.worklist_csv is not None:
        countries = countries_from_worklist(args.worklist_csv)
    elif args.countries:
        countries = [clean_text(value).upper() for value in args.countries.split(",") if clean_text(value)]
    else:
        countries = iter_subset_countries()

    countries = [country_key for country_key in countries if subset_pack_is_fresh(country_key, min_generated_at)]

    if not countries:
        raise SystemExit(f"No pending subset artifacts found in {PENDING_SUBSET_DIR}")

    merged: list[dict[str, object]] = []
    for country_key in countries:
        result = merge_country(country_key)
        merged.append(result)
        print(
            f"Merged {country_key}: {result['subsetRows']} subset rows, "
            f"{result['subsetNewRows']} new-candidate rows"
        )

    print(f"Merged pending subset artifacts into {len(merged)} full country outputs")


if __name__ == "__main__":
    main()