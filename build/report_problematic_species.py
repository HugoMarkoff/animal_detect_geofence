#!/usr/bin/env python3
"""Rank problematic species across the current live precomputed packs."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PRECOMPUTED_DIR = ROOT / "animal_detect_geofence" / "data" / "precomputed-countries"
INDEX_PATH = PRECOMPUTED_DIR / "index.json"
TAXONOMY_PATH = ROOT / "animal_detect_geofence" / "data" / "animals-global.json"
DEFAULT_CSV_OUTPUT = ROOT / "country-validation" / "problematic_species_top_200.csv"
DEFAULT_MD_OUTPUT = ROOT / "country-validation" / "problematic_species_top_200.md"
DEFAULT_BUCKETS = ("New", "Needs Review")


@dataclass
class SpeciesAggregate:
    item_id: str
    common_name: str
    binomial: str
    taxon_class: str
    order: str
    family: str
    occurrences: dict[str, tuple[str, str, str]] = field(default_factory=dict)

    def add_occurrence(self, pack_id: str, pack_name: str, bucket: str, unit_type: str) -> None:
        self.occurrences[pack_id] = (bucket, pack_name, unit_type)

    @property
    def problematic_occurrences(self) -> int:
        return len(self.occurrences)

    @property
    def new_occurrences(self) -> int:
        return sum(1 for bucket, _, _ in self.occurrences.values() if bucket == "New")

    @property
    def needs_review_occurrences(self) -> int:
        return sum(1 for bucket, _, _ in self.occurrences.values() if bucket == "Needs Review")

    @property
    def country_pack_occurrences(self) -> int:
        return sum(1 for _, _, unit_type in self.occurrences.values() if unit_type != "state")

    @property
    def state_pack_occurrences(self) -> int:
        return sum(1 for _, _, unit_type in self.occurrences.values() if unit_type == "state")

    @property
    def affected_packs(self) -> list[str]:
        return sorted(self.occurrences)

    @property
    def affected_locations(self) -> list[str]:
        return [self.occurrences[pack_id][1] for pack_id in self.affected_packs]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rank problematic species from the live precomputed country/state packs.")
    parser.add_argument("--index", type=Path, default=INDEX_PATH, help="Path to precomputed-countries/index.json")
    parser.add_argument("--taxonomy", type=Path, default=TAXONOMY_PATH, help="Path to animals-global.json")
    parser.add_argument("--limit", type=int, default=200, help="How many ranked species to write")
    parser.add_argument(
        "--buckets",
        nargs="+",
        default=list(DEFAULT_BUCKETS),
        help="Buckets to treat as problematic (default: New Needs Review)",
    )
    parser.add_argument("--output-csv", type=Path, default=DEFAULT_CSV_OUTPUT, help="CSV output path")
    parser.add_argument("--output-md", type=Path, default=DEFAULT_MD_OUTPUT, help="Markdown output path")
    return parser.parse_args()


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_taxonomy_index(path: Path) -> dict[str, dict[str, str]]:
    data = load_json(path)
    taxonomy_index: dict[str, dict[str, str]] = {}
    for item in data.get("items", []):
        item_id = str(item.get("id") or "").strip()
        if not item_id:
            continue
        taxonomy_index[item_id] = {
            "commonName": str(item.get("commonName") or "").strip(),
            "binomial": str(item.get("binomial") or "").strip(),
            "class": str(item.get("class") or "").strip(),
            "order": str(item.get("order") or "").strip(),
            "family": str(item.get("family") or "").strip(),
        }
    return taxonomy_index


def rank_species(aggregates: dict[str, SpeciesAggregate]) -> list[SpeciesAggregate]:
    return sorted(
        aggregates.values(),
        key=lambda aggregate: (
            -aggregate.problematic_occurrences,
            -aggregate.new_occurrences,
            -aggregate.needs_review_occurrences,
            aggregate.common_name.lower() or aggregate.binomial.lower() or aggregate.item_id,
            aggregate.binomial.lower(),
            aggregate.item_id,
        ),
    )


def write_csv(path: Path, ranked_species: list[SpeciesAggregate], limit: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "rank",
                "itemId",
                "commonName",
                "binomial",
                "class",
                "order",
                "family",
                "problematicOccurrences",
                "newOccurrences",
                "needsReviewOccurrences",
                "countryPackOccurrences",
                "statePackOccurrences",
                "affectedPacks",
                "affectedLocations",
            ],
        )
        writer.writeheader()
        for rank, aggregate in enumerate(ranked_species[:limit], start=1):
            writer.writerow(
                {
                    "rank": rank,
                    "itemId": aggregate.item_id,
                    "commonName": aggregate.common_name,
                    "binomial": aggregate.binomial,
                    "class": aggregate.taxon_class,
                    "order": aggregate.order,
                    "family": aggregate.family,
                    "problematicOccurrences": aggregate.problematic_occurrences,
                    "newOccurrences": aggregate.new_occurrences,
                    "needsReviewOccurrences": aggregate.needs_review_occurrences,
                    "countryPackOccurrences": aggregate.country_pack_occurrences,
                    "statePackOccurrences": aggregate.state_pack_occurrences,
                    "affectedPacks": ";".join(aggregate.affected_packs),
                    "affectedLocations": ";".join(aggregate.affected_locations),
                }
            )


def write_markdown(
    path: Path,
    ranked_species: list[SpeciesAggregate],
    limit: int,
    bucket_totals: Counter[str],
    pack_count: int,
    selected_buckets: tuple[str, ...],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"# Top {min(limit, len(ranked_species))} Problematic Species",
        "",
        "Generated from the current live precomputed packs in `animal_detect_geofence/data/precomputed-countries`.",
        "",
        f"- Buckets counted as problematic: {', '.join(selected_buckets)}",
        f"- Packs scanned: {pack_count}",
        f"- Unique problematic species: {len(ranked_species)}",
        f"- Total problematic occurrences: {sum(bucket_totals.values())}",
        f"- New occurrences: {bucket_totals.get('New', 0)}",
        f"- Needs Review occurrences: {bucket_totals.get('Needs Review', 0)}",
        "",
        "| Rank | Common name | Binomial | Occurrences | New | Needs Review | Country packs | State packs | Sample packs |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for rank, aggregate in enumerate(ranked_species[:limit], start=1):
        sample_packs = ", ".join(aggregate.affected_packs[:6])
        lines.append(
            "| "
            f"{rank} | {aggregate.common_name or '-'} | {aggregate.binomial or '-'} | {aggregate.problematic_occurrences} | "
            f"{aggregate.new_occurrences} | {aggregate.needs_review_occurrences} | {aggregate.country_pack_occurrences} | "
            f"{aggregate.state_pack_occurrences} | {sample_packs} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    selected_buckets = tuple(dict.fromkeys(str(bucket).strip() for bucket in args.buckets if str(bucket).strip()))
    if not selected_buckets:
        raise SystemExit("No problematic buckets were provided.")

    index_data = load_json(args.index)
    taxonomy_index = load_taxonomy_index(args.taxonomy)

    problematic_species: dict[str, SpeciesAggregate] = {}
    bucket_totals: Counter[str] = Counter()
    missing_taxonomy_ids: set[str] = set()
    pack_count = 0

    for pack_summary in index_data.get("countries", []):
        relative_path = str(pack_summary.get("path") or "").strip()
        if not relative_path:
            continue
        pack_path = args.index.parent / relative_path.removeprefix("./")
        pack_data = load_json(pack_path)
        pack_id = str(pack_data.get("generatedFor") or pack_summary.get("iso3") or "").strip()
        pack_name = str(pack_data.get("countryName") or pack_summary.get("countryName") or pack_id).strip()
        unit_type = str(pack_data.get("unitType") or pack_summary.get("unitType") or "country").strip() or "country"
        pack_count += 1

        for entry in pack_data.get("entries", []):
            bucket = str(entry.get("bucket") or "").strip()
            if bucket not in selected_buckets:
                continue
            item_id = str(entry.get("itemId") or "").strip()
            if not item_id:
                continue
            taxonomy = taxonomy_index.get(item_id)
            if taxonomy is None:
                missing_taxonomy_ids.add(item_id)
                taxonomy = {
                    "commonName": "",
                    "binomial": "",
                    "class": "",
                    "order": "",
                    "family": "",
                }
            aggregate = problematic_species.setdefault(
                item_id,
                SpeciesAggregate(
                    item_id=item_id,
                    common_name=taxonomy["commonName"],
                    binomial=taxonomy["binomial"],
                    taxon_class=taxonomy["class"],
                    order=taxonomy["order"],
                    family=taxonomy["family"],
                ),
            )
            aggregate.add_occurrence(pack_id=pack_id, pack_name=pack_name, bucket=bucket, unit_type=unit_type)
            bucket_totals[bucket] += 1

    ranked_species = rank_species(problematic_species)
    write_csv(args.output_csv, ranked_species, args.limit)
    write_markdown(args.output_md, ranked_species, args.limit, bucket_totals, pack_count, selected_buckets)

    print(
        f"Wrote top {min(args.limit, len(ranked_species))} problematic species to {args.output_csv} and {args.output_md} "
        f"from {pack_count} packs ({sum(bucket_totals.values())} problematic occurrences across {len(ranked_species)} species)."
    )
    if missing_taxonomy_ids:
        print(f"Warning: missing taxonomy details for {len(missing_taxonomy_ids)} itemIds.")


if __name__ == "__main__":
    main()