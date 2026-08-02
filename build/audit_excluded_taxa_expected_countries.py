#!/usr/bin/env python3
"""Audit labeled species excluded from animals-global because their class is out of scope.

The report rebuilds expected countries from taxonomy + geofence + binary overrides,
then compares that set against the current country packs without using GBIF or iNat.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from build_global_animals_dataset import (
    DEFAULT_GEOFENCE_BINARY_OVERRIDES_PATH,
    ROOT,
    SOURCE_PRESETS,
    VALID_CLASSES,
    apply_item_country_overrides,
    choose_taxonomy_path,
    collect_country_codes,
    display_path,
    is_usable_file,
    normalize,
    parse_order_aliases,
    pick_geofence_match,
    resolve_expected_countries,
    resolve_path,
)


DEFAULT_PRECOMPUTED_INDEX_PATH = ROOT / "animal_detect_geofence" / "data" / "precomputed-countries" / "index.json"
DEFAULT_PRECOMPUTED_COUNTRY_DIR = ROOT / "animal_detect_geofence" / "data" / "precomputed-countries"
DEFAULT_OUTPUT_PATH = ROOT / "country-validation" / "excluded_taxa_expected_countries.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Report labeled species-level taxonomy rows excluded from animals-global because "
            "their class is outside the current supported-class scope."
        )
    )
    parser.add_argument(
        "--source",
        choices=sorted(SOURCE_PRESETS),
        default="new",
        help="Select the default taxonomy/geofence pair. Defaults to the current new-source dataset.",
    )
    parser.add_argument("--taxonomy-path", default="", help="Optional taxonomy input override.")
    parser.add_argument(
        "--taxonomy-fallback-path",
        default="",
        help="Optional fallback taxonomy input used when the primary taxonomy file is missing or empty.",
    )
    parser.add_argument("--geofence-path", default="", help="Optional geofence input override.")
    parser.add_argument(
        "--geofence-binary-overrides-path",
        default=str(DEFAULT_GEOFENCE_BINARY_OVERRIDES_PATH),
        help="Optional binary override file applied on top of the geofence match.",
    )
    parser.add_argument(
        "--precomputed-index-path",
        default=str(DEFAULT_PRECOMPUTED_INDEX_PATH),
        help="Current country-pack index used to determine which countries already list an item.",
    )
    parser.add_argument(
        "--precomputed-country-dir",
        default=str(DEFAULT_PRECOMPUTED_COUNTRY_DIR),
        help="Directory containing current country pack JSON files.",
    )
    parser.add_argument(
        "--output-path",
        default=str(DEFAULT_OUTPUT_PATH),
        help="JSON output path. A CSV companion is written beside it.",
    )
    parser.add_argument(
        "--order-alias",
        action="append",
        default=[],
        help="Repeatable OLD=NEW taxonomy order alias applied before geofence matching.",
    )
    return parser.parse_args()


def load_item_overrides(path: Path | None) -> tuple[dict[str, dict[str, object]], bool]:
    if not is_usable_file(path):
        return {}, False

    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    raw_items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(raw_items, dict):
        return {}, False

    item_overrides = {
        str(item_id or "").strip(): value
        for item_id, value in raw_items.items()
        if str(item_id or "").strip() and isinstance(value, dict)
    }
    return item_overrides, bool(item_overrides)


def load_current_pack_listing(
    index_path: Path | None,
    country_dir: Path | None,
) -> tuple[dict[str, set[str]], dict[str, str], bool]:
    listed_by_item: dict[str, set[str]] = defaultdict(set)
    mode_by_iso3: dict[str, str] = {}
    used_listing = False

    if is_usable_file(index_path):
        with index_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        rows = payload.get("countries") if isinstance(payload, dict) else None
        if isinstance(rows, list):
            for row in rows:
                iso3 = str((row or {}).get("iso3") or "").strip().upper()
                if iso3:
                    mode_by_iso3[iso3] = str((row or {}).get("precomputeMode") or "").strip().lower()
            used_listing = True

    if country_dir and country_dir.exists() and country_dir.is_dir():
        for path in sorted(country_dir.glob("*.json")):
            if path.name == "index.json":
                continue
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue

            iso3 = str(payload.get("generatedFor") or path.stem).strip().upper()
            if not iso3:
                continue

            entries = payload.get("entries") if isinstance(payload, dict) else None
            if not isinstance(entries, list):
                continue

            for entry in entries:
                item_id = str((entry or {}).get("itemId") or "").strip()
                if item_id:
                    listed_by_item[item_id].add(iso3)
            used_listing = True

    return listed_by_item, mode_by_iso3, used_listing


def csv_join(values: list[str]) -> str:
    return "|".join(values)


def species_label(row: dict[str, object]) -> str:
    common_name = str(row.get("commonName") or "").strip()
    if common_name:
        return common_name
    return str(row.get("binomial") or "").strip()


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    fieldnames = [
        "id",
        "class",
        "order",
        "family",
        "genus",
        "species",
        "commonName",
        "binomial",
        "matchedKey",
        "matchLevel",
        "allowRegionalCountryCount",
        "allowRegionalCountries",
        "expectedCountryCount",
        "expectedCountries",
        "currentlyListedCountryCount",
        "currentlyListedCountries",
        "currentlyListedValidatedCountryCount",
        "currentlyListedValidatedCountries",
        "missingFromCurrentCountryCount",
        "missingFromCurrentCountries",
        "extraInCurrentCountryCount",
        "extraInCurrentCountries",
    ]

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "id": row["id"],
                    "class": row["class"],
                    "order": row["order"],
                    "family": row["family"],
                    "genus": row["genus"],
                    "species": row["species"],
                    "commonName": row["commonName"],
                    "binomial": row["binomial"],
                    "matchedKey": row["matchedKey"],
                    "matchLevel": row["matchLevel"],
                    "allowRegionalCountryCount": len(row["allowRegionalCountries"]),
                    "allowRegionalCountries": csv_join(row["allowRegionalCountries"]),
                    "expectedCountryCount": len(row["expectedCountries"]),
                    "expectedCountries": csv_join(row["expectedCountries"]),
                    "currentlyListedCountryCount": len(row["currentlyListedCountries"]),
                    "currentlyListedCountries": csv_join(row["currentlyListedCountries"]),
                    "currentlyListedValidatedCountryCount": len(row["currentlyListedValidatedCountries"]),
                    "currentlyListedValidatedCountries": csv_join(row["currentlyListedValidatedCountries"]),
                    "missingFromCurrentCountryCount": len(row["missingFromCurrentCountries"]),
                    "missingFromCurrentCountries": csv_join(row["missingFromCurrentCountries"]),
                    "extraInCurrentCountryCount": len(row["extraInCurrentCountries"]),
                    "extraInCurrentCountries": csv_join(row["extraInCurrentCountries"]),
                }
            )


def main() -> None:
    args = parse_args()
    preset = SOURCE_PRESETS[args.source]

    requested_taxonomy_path = resolve_path(args.taxonomy_path, preset["taxonomy"])
    taxonomy_fallback_path = resolve_path(args.taxonomy_fallback_path, preset["taxonomy_fallback"])
    geofence_path = resolve_path(args.geofence_path, preset["geofence"])
    geofence_binary_overrides_path = resolve_path(args.geofence_binary_overrides_path, DEFAULT_GEOFENCE_BINARY_OVERRIDES_PATH)
    precomputed_index_path = resolve_path(args.precomputed_index_path, DEFAULT_PRECOMPUTED_INDEX_PATH)
    precomputed_country_dir = resolve_path(args.precomputed_country_dir, DEFAULT_PRECOMPUTED_COUNTRY_DIR)
    output_path = resolve_path(args.output_path, DEFAULT_OUTPUT_PATH)

    if geofence_path is None or not is_usable_file(geofence_path):
        raise SystemExit(f"Geofence input not found or unusable: {display_path(geofence_path)}")
    if output_path is None:
        raise SystemExit("Output path could not be resolved.")

    taxonomy_path, used_taxonomy_fallback = choose_taxonomy_path(requested_taxonomy_path, taxonomy_fallback_path)
    order_aliases = dict(preset["order_aliases"])
    order_aliases.update(parse_order_aliases(args.order_alias))

    with geofence_path.open("r", encoding="utf-8") as handle:
        geofence = json.load(handle)

    item_overrides, overrides_used = load_item_overrides(geofence_binary_overrides_path)
    listed_by_item, mode_by_iso3, current_listing_used = load_current_pack_listing(
        precomputed_index_path,
        precomputed_country_dir,
    )
    all_country_codes = collect_country_codes(geofence)

    items: list[dict[str, object]] = []
    class_counts: Counter[str] = Counter()
    unmatched_out_of_scope_count = 0
    country_expected_species: dict[str, list[dict[str, str]]] = defaultdict(list)
    country_listed_species: dict[str, list[dict[str, str]]] = defaultdict(list)

    with taxonomy_path.open("r", encoding="utf-8") as handle:
        reader = csv.DictReader(
            handle,
            fieldnames=["id", "class", "order", "family", "genus", "species", "common"],
            delimiter=";",
        )
        for row in reader:
            item_id = str(row.get("id") or "").strip()
            cls = normalize(row.get("class"))
            genus = normalize(row.get("genus"))
            species = normalize(row.get("species"))
            common_name = str(row.get("common") or "").strip()

            if cls in VALID_CLASSES:
                continue
            if not genus or not species or species == "species":
                continue
            if not common_name:
                continue

            matched_key, match_level = pick_geofence_match(row, geofence, order_aliases)
            if not matched_key:
                unmatched_out_of_scope_count += 1
                continue

            expected_countries = resolve_expected_countries(matched_key, geofence, all_country_codes)
            expected_countries, allow_regional_countries = apply_item_country_overrides(
                expected_countries,
                item_overrides.get(item_id),
            )

            listed_countries = sorted(listed_by_item.get(item_id, set()))
            listed_validated_countries = sorted(
                iso3 for iso3 in listed_countries if mode_by_iso3.get(iso3) == "validated"
            )
            missing_from_current = sorted(set(expected_countries) - set(listed_countries))
            extra_in_current = sorted(set(listed_countries) - set(expected_countries))
            binomial = f"{genus} {species}".strip()

            item = {
                "id": item_id,
                "class": cls,
                "order": normalize(row.get("order")),
                "family": normalize(row.get("family")),
                "genus": genus,
                "species": species,
                "commonName": common_name,
                "binomial": binomial,
                "matchedKey": matched_key,
                "matchLevel": match_level,
                "allowRegionalCountries": allow_regional_countries,
                "expectedCountries": expected_countries,
                "currentlyListedCountries": listed_countries,
                "currentlyListedValidatedCountries": listed_validated_countries,
                "missingFromCurrentCountries": missing_from_current,
                "extraInCurrentCountries": extra_in_current,
            }
            items.append(item)
            class_counts[cls] += 1

            for iso3 in expected_countries:
                country_expected_species[iso3].append(
                    {"id": item_id, "label": common_name, "binomial": binomial}
                )
            for iso3 in listed_countries:
                country_listed_species[iso3].append(
                    {"id": item_id, "label": common_name, "binomial": binomial}
                )

    items.sort(key=lambda row: (str(row["class"]), str(row["commonName"]).lower(), str(row["binomial"])))

    country_summary: list[dict[str, object]] = []
    for iso3 in sorted(set(country_expected_species) | set(country_listed_species)):
        expected_rows = sorted(
            country_expected_species.get(iso3, []),
            key=lambda row: (row["label"].lower(), row["binomial"]),
        )
        listed_rows = sorted(
            country_listed_species.get(iso3, []),
            key=lambda row: (row["label"].lower(), row["binomial"]),
        )
        expected_ids = {row["id"] for row in expected_rows}
        listed_ids = {row["id"] for row in listed_rows}

        country_summary.append(
            {
                "iso3": iso3,
                "expectedExcludedSpeciesCount": len(expected_rows),
                "currentlyListedExcludedSpeciesCount": len(listed_rows),
                "missingExcludedSpeciesCount": len(expected_ids - listed_ids),
                "extraExcludedSpeciesCount": len(listed_ids - expected_ids),
                "expectedSpecies": [row["label"] for row in expected_rows],
                "currentlyListedSpecies": [row["label"] for row in listed_rows],
            }
        )

    country_summary.sort(
        key=lambda row: (
            -int(row["expectedExcludedSpeciesCount"]),
            str(row["iso3"]),
        )
    )

    csv_output_path = output_path.with_suffix(".csv")
    payload = {
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "sourceMode": args.source,
        "taxonomyFallbackUsed": used_taxonomy_fallback,
        "currentPackListingUsed": current_listing_used,
        "sourceFiles": {
            "taxonomy": display_path(taxonomy_path),
            "geofence": display_path(geofence_path),
            "geofenceBinaryOverrides": display_path(geofence_binary_overrides_path) if overrides_used else "",
            "precomputedIndex": display_path(precomputed_index_path) if current_listing_used else "",
            "precomputedCountryDir": display_path(precomputed_country_dir) if current_listing_used else "",
        },
        "summary": {
            "excludedSpeciesTotal": len(items),
            "excludedByClass": dict(sorted(class_counts.items())),
            "countriesWithExcludedSpecies": len(country_summary),
            "outOfScopeSpeciesWithoutGeofenceMatch": unmatched_out_of_scope_count,
        },
        "items": items,
        "countrySummary": country_summary,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    write_csv(csv_output_path, items)

    print(f"Excluded labeled species with geofence matches: {len(items)}")
    print(f"By class: {dict(sorted(class_counts.items()))}")
    print(f"Countries with at least one expected excluded species: {len(country_summary)}")
    print(f"Wrote JSON report to {display_path(output_path)}")
    print(f"Wrote CSV report to {display_path(csv_output_path)}")


if __name__ == "__main__":
    main()