#!/usr/bin/env python3
"""Compare reviewed country-validation outputs against the current dataset."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_DATASET_PATH = ROOT / "web-plugin" / "data" / "animals-global.json"
DEFAULT_COUNTRY_VALIDATION_DIR = ROOT / "country-validation"
DEFAULT_DENMARK_AUDIT_PATH = ROOT / "denmark_species_validation.csv"
DEFAULT_DENMARK_SUMMARY_PATH = ROOT / "denmark_precomputed_validation_summary.txt"
DEFAULT_DELTA_CSV_PATH = DEFAULT_COUNTRY_VALIDATION_DIR / "new_geofence_audit_deltas.csv"
DEFAULT_REPORT_PATH = DEFAULT_COUNTRY_VALIDATION_DIR / "new_geofence_audit_report.md"
COUNTRY_LINE_RE = re.compile(r"^Country:\s*(.*?)\s+\(([A-Z]{3})\)\s*$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare reviewed country-validation CSVs created from the old taxonomy/geofence "
            "against the current animals-global.json dataset."
        )
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Path to the current animals-global.json dataset.",
    )
    parser.add_argument(
        "--country-validation-dir",
        type=Path,
        default=DEFAULT_COUNTRY_VALIDATION_DIR,
        help="Directory containing per-country validation outputs.",
    )
    parser.add_argument(
        "--denmark-audit",
        type=Path,
        default=DEFAULT_DENMARK_AUDIT_PATH,
        help="Legacy Denmark audit CSV to include when present.",
    )
    parser.add_argument(
        "--delta-csv",
        type=Path,
        default=DEFAULT_DELTA_CSV_PATH,
        help="Output CSV containing every old-vs-current expected delta.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT_PATH,
        help="Output Markdown summary report.",
    )
    return parser.parse_args()


def parse_bool(value: object) -> bool:
    text = str(value or "").strip().lower()
    return text == "true"


def load_current_dataset(dataset_path: Path) -> tuple[dict, dict[str, dict]]:
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    items_by_id: dict[str, dict] = {}
    for item in payload.get("items") or []:
        item_id = str(item.get("id") or "").strip()
        if not item_id:
            continue
        items_by_id[item_id] = {
            "itemId": item_id,
            "commonName": str(item.get("commonName") or "").strip(),
            "binomial": str(item.get("binomial") or "").strip(),
            "class": str(item.get("class") or "").strip(),
            "order": str(item.get("order") or "").strip(),
            "family": str(item.get("family") or "").strip(),
            "matchLevel": item.get("matchLevel"),
            "expectedCountries": {
                str(iso3 or "").strip().upper()
                for iso3 in (item.get("expectedCountries") or [])
                if str(iso3 or "").strip()
            },
        }
    return payload, items_by_id


def parse_country_name(summary_path: Path, iso3: str, fallback_name: str) -> str:
    if not summary_path.exists():
        return fallback_name
    for line in summary_path.read_text(encoding="utf-8").splitlines():
        match = COUNTRY_LINE_RE.match(line.strip())
        if match and match.group(2) == iso3:
            return match.group(1)
    return fallback_name


def iter_review_sources(country_validation_dir: Path, denmark_audit_path: Path) -> list[dict[str, object]]:
    sources: list[dict[str, object]] = []

    if denmark_audit_path.exists():
        sources.append(
            {
                "iso3": "DNK",
                "countryName": parse_country_name(DEFAULT_DENMARK_SUMMARY_PATH, "DNK", "Denmark"),
                "auditCsv": denmark_audit_path,
            }
        )

    if country_validation_dir.exists():
        for child in sorted(country_validation_dir.iterdir(), key=lambda path: path.name):
            if not child.is_dir():
                continue
            audit_csv = child / "species_validation.csv"
            if not audit_csv.exists():
                continue
            iso3 = child.name.strip().upper()
            sources.append(
                {
                    "iso3": iso3,
                    "countryName": parse_country_name(
                        child / "precomputed_validation_summary.txt",
                        iso3,
                        iso3,
                    ),
                    "auditCsv": audit_csv,
                }
            )

    return sources


def format_counter(counter: Counter[str]) -> list[str]:
    if not counter:
        return ["- none"]
    return [f"- {label}: {count}" for label, count in counter.most_common()]


def format_species_lines(
    counter: Counter[tuple[str, str]],
    countries_by_species: dict[tuple[str, str], set[str]],
    *,
    limit: int = 15,
) -> list[str]:
    if not counter:
        return ["- none"]

    lines: list[str] = []
    for (common_name, binomial), count in counter.most_common(limit):
        countries = sorted(countries_by_species[(common_name, binomial)])
        sample = ", ".join(countries[:8])
        if len(countries) > 8:
            sample += ", ..."
        lines.append(f"- {common_name} ({binomial}): {count} countries [{sample}]")
    return lines


def limited_counter(
    counter: Counter[tuple[str, str]],
    *,
    max_count: int,
) -> Counter[tuple[str, str]]:
    filtered = Counter()
    for species_key, count in counter.items():
        if count <= max_count:
            filtered[species_key] = count
    return filtered


def format_country_table(rows: list[dict[str, object]], limit: int = 25) -> list[str]:
    if not rows:
        return ["No reviewed countries produced any expected-membership changes."]

    table = [
        "| Country | Added | Removed | Removed Likely Valid | Added From Unlisted |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for row in rows[:limit]:
        table.append(
            "| {countryName} ({iso3}) | {added} | {removed} | {removedLikelyValid} | {addedUnlisted} |".format(
                **row,
            )
        )
    return table


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def main() -> None:
    args = parse_args()
    dataset_payload, current_items = load_current_dataset(args.dataset)
    review_sources = iter_review_sources(args.country_validation_dir, args.denmark_audit)

    if not review_sources:
        raise SystemExit("No reviewed country audit CSVs were found.")

    delta_rows: list[dict[str, object]] = []
    added_buckets: Counter[str] = Counter()
    removed_buckets: Counter[str] = Counter()
    added_statuses: Counter[str] = Counter()
    removed_statuses: Counter[str] = Counter()
    added_species: Counter[tuple[str, str]] = Counter()
    removed_species: Counter[tuple[str, str]] = Counter()
    added_species_countries: dict[tuple[str, str], set[str]] = defaultdict(set)
    removed_species_countries: dict[tuple[str, str], set[str]] = defaultdict(set)
    removed_likely_valid_species: Counter[tuple[str, str]] = Counter()
    removed_likely_valid_countries: dict[tuple[str, str], set[str]] = defaultdict(set)
    added_unlisted_species: Counter[tuple[str, str]] = Counter()
    added_unlisted_countries: dict[tuple[str, str], set[str]] = defaultdict(set)
    added_new_species: Counter[tuple[str, str]] = Counter()
    added_new_countries: dict[tuple[str, str], set[str]] = defaultdict(set)
    country_stats: dict[str, dict[str, object]] = {}
    missing_item_counts: Counter[str] = Counter()

    total_rows_compared = 0

    for source in review_sources:
        iso3 = str(source["iso3"])
        country_name = str(source["countryName"])
        audit_csv = Path(source["auditCsv"])
        stats = {
            "iso3": iso3,
            "countryName": country_name,
            "rowsCompared": 0,
            "added": 0,
            "removed": 0,
            "removedLikelyValid": 0,
            "addedUnlisted": 0,
        }

        with audit_csv.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                item_id = str(row.get("itemId") or "").strip()
                if not item_id:
                    continue

                current_item = current_items.get(item_id)
                if current_item is None:
                    missing_item_counts[iso3] += 1
                    continue

                total_rows_compared += 1
                stats["rowsCompared"] += 1

                old_expected = parse_bool(row.get("expected"))
                new_expected = iso3 in current_item["expectedCountries"]
                if old_expected == new_expected:
                    continue

                delta_type = "added" if new_expected else "removed"
                old_bucket = str(row.get("bucket") or "Unknown").strip() or "Unknown"
                old_status = str(row.get("status") or "Unknown").strip() or "Unknown"
                species_key = (current_item["commonName"], current_item["binomial"])

                delta_row = {
                    "countryIso3": iso3,
                    "countryName": country_name,
                    "itemId": item_id,
                    "commonName": current_item["commonName"],
                    "binomial": current_item["binomial"],
                    "class": current_item["class"],
                    "order": current_item["order"],
                    "family": current_item["family"],
                    "matchLevel": current_item["matchLevel"],
                    "oldExpected": old_expected,
                    "newExpected": new_expected,
                    "deltaType": delta_type,
                    "oldStatus": old_status,
                    "oldBucket": old_bucket,
                    "gbifCount": str(row.get("gbifCount") or "").strip(),
                    "inatCount": str(row.get("inatCount") or "").strip(),
                    "footprintLabel": str(row.get("footprintLabel") or "").strip(),
                    "managedReview": str(row.get("managedReview") or "").strip(),
                    "note": str(row.get("note") or "").strip(),
                }
                delta_rows.append(delta_row)

                if delta_type == "added":
                    stats["added"] += 1
                    added_buckets[old_bucket] += 1
                    added_statuses[old_status] += 1
                    added_species[species_key] += 1
                    added_species_countries[species_key].add(iso3)
                    if old_bucket == "Unlisted":
                        stats["addedUnlisted"] += 1
                        added_unlisted_species[species_key] += 1
                        added_unlisted_countries[species_key].add(iso3)
                    if old_bucket == "New":
                        added_new_species[species_key] += 1
                        added_new_countries[species_key].add(iso3)
                else:
                    stats["removed"] += 1
                    removed_buckets[old_bucket] += 1
                    removed_statuses[old_status] += 1
                    removed_species[species_key] += 1
                    removed_species_countries[species_key].add(iso3)
                    if old_bucket == "Likely Valid":
                        stats["removedLikelyValid"] += 1
                        removed_likely_valid_species[species_key] += 1
                        removed_likely_valid_countries[species_key].add(iso3)

        country_stats[iso3] = stats

    delta_rows.sort(key=lambda row: (row["countryIso3"], row["deltaType"], row["commonName"], row["binomial"]))

    ensure_parent(args.delta_csv)
    with args.delta_csv.open("w", encoding="utf-8", newline="") as handle:
        fieldnames = [
            "countryIso3",
            "countryName",
            "itemId",
            "commonName",
            "binomial",
            "class",
            "order",
            "family",
            "matchLevel",
            "oldExpected",
            "newExpected",
            "deltaType",
            "oldStatus",
            "oldBucket",
            "gbifCount",
            "inatCount",
            "footprintLabel",
            "managedReview",
            "note",
        ]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(delta_rows)

    country_table_rows = sorted(
        (
            {
                "iso3": stats["iso3"],
                "countryName": stats["countryName"],
                "added": stats["added"],
                "removed": stats["removed"],
                "removedLikelyValid": stats["removedLikelyValid"],
                "addedUnlisted": stats["addedUnlisted"],
            }
            for stats in country_stats.values()
            if stats["added"] or stats["removed"]
        ),
        key=lambda row: (
            -(row["added"] + row["removed"]),
            -row["removedLikelyValid"],
            row["iso3"],
        ),
    )

    report_lines = [
        "# New Geofence Audit Report",
        "",
        f"Generated at: {datetime.now(timezone.utc).isoformat()}",
        f"Dataset: {dataset_payload.get('dataset') or args.dataset}",
        f"Source mode: {dataset_payload.get('sourceMode') or 'unknown'}",
        f"Taxonomy fallback used: {bool(dataset_payload.get('taxonomyFallbackUsed'))}",
        "",
        "## Coverage",
        "",
        f"- Reviewed country CSVs compared: {len(review_sources)}",
        f"- Rows compared against the current dataset: {total_rows_compared}",
        f"- Current dataset items: {len(current_items)}",
        f"- Expected additions (old False -> new True): {sum(row['added'] for row in country_table_rows)}",
        f"- Expected removals (old True -> new False): {sum(row['removed'] for row in country_table_rows)}",
        f"- Countries with at least one expected-membership change: {len(country_table_rows)}",
        f"- Missing item ids in current dataset: {sum(missing_item_counts.values())}",
        "",
        "## Country Impact",
        "",
        *format_country_table(country_table_rows),
        "",
        "## Added Rows By Old Bucket",
        "",
        *format_counter(added_buckets),
        "",
        "## Removed Rows By Old Bucket",
        "",
        *format_counter(removed_buckets),
        "",
        "## Added Rows By Old Status",
        "",
        *format_counter(added_statuses),
        "",
        "## Removed Rows By Old Status",
        "",
        *format_counter(removed_statuses),
        "",
        "## Top Added Species Across Reviewed Countries",
        "",
        *format_species_lines(added_species, added_species_countries),
        "",
        "## Top Removed Species Across Reviewed Countries",
        "",
        *format_species_lines(removed_species, removed_species_countries),
        "",
        "## Added Species That Were Previously Unlisted",
        "",
        *format_species_lines(added_unlisted_species, added_unlisted_countries),
        "",
        "## Added Species That Were Previously New",
        "",
        *format_species_lines(added_new_species, added_new_countries),
        "",
        "## Low-Frequency Added Species (1-2 Countries)",
        "",
        *format_species_lines(
            limited_counter(added_species, max_count=2),
            added_species_countries,
            limit=50,
        ),
        "",
        "## Removed Species That Were Previously Likely Valid",
        "",
        *format_species_lines(removed_likely_valid_species, removed_likely_valid_countries),
    ]

    if missing_item_counts:
        report_lines.extend(
            [
                "",
                "## Missing Item Ids By Country",
                "",
                *format_counter(missing_item_counts),
            ]
        )

    ensure_parent(args.report)
    args.report.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    print(f"Compared {len(review_sources)} reviewed country CSVs against {args.dataset}.")
    print(f"Wrote delta CSV: {args.delta_csv}")
    print(f"Wrote report: {args.report}")
    print(f"Expected additions: {sum(row['added'] for row in country_table_rows)}")
    print(f"Expected removals: {sum(row['removed'] for row in country_table_rows)}")


if __name__ == "__main__":
    main()