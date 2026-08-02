#!/usr/bin/env python3
"""Build validated USA state packs using the shared country-validation heuristics.

This reuses the main validated pipeline for:
- provider taxon resolution
- GBIF/iNaturalist evidence checks
- country-indexed discovery of unexpected-but-observed species
- footprint/status/bucket logic

The only state-specific pieces are:
- expected membership, derived from animals-global.json `expectedSubdivisions["USA"]`
    with geofence_new.json `allow["USA"]` kept as a fallback for older datasets
- GBIF scoping, using `country=US` plus `stateProvince=<full state name>`
- iNaturalist scoping, using the state-level place id
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import build_denmark_precomputed_validation as validator


ROOT = Path(__file__).resolve().parent
INPUT_PATH = ROOT / "web-plugin" / "data" / "animals-global.json"
GEOFENCE_NEW_PATH = ROOT / "geofence_new.json"
COUNTRY_ARTIFACTS_DIR = ROOT / "country-validation"
REVIEW_APP_DATA_ROOT = ROOT / "animal_detect_geofence" / "data"

PARENT_COUNTRY_ISO3 = "USA"
PARENT_COUNTRY_ISO2 = "US"
PARENT_COUNTRY_NAME = "United States"

# State metadata: (name, area_km2, inat_place_id)
STATE_METADATA: dict[str, tuple[str, float, int]] = {
    "AK": ("Alaska", 1723340.0, 4163),
    "AL": ("Alabama", 135767.0, 4160),
    "AR": ("Arkansas", 137732.0, 4161),
    "AZ": ("Arizona", 295234.0, 4162),
    "CA": ("California", 423970.0, 4164),
    "CO": ("Colorado", 269601.0, 4165),
    "CT": ("Connecticut", 14357.0, 4166),
    "DC": ("District of Columbia", 177.0, 4167),
    "DE": ("Delaware", 6452.0, 4168),
    "FL": ("Florida", 170312.0, 4169),
    "GA": ("Georgia", 152938.0, 4170),
    "HI": ("Hawaii", 28311.0, 4171),
    "IA": ("Iowa", 145746.0, 4172),
    "ID": ("Idaho", 216443.0, 4173),
    "IL": ("Illinois", 149995.0, 4174),
    "IN": ("Indiana", 94326.0, 4175),
    "KS": ("Kansas", 213100.0, 4176),
    "KY": ("Kentucky", 104656.0, 4177),
    "LA": ("Louisiana", 135659.0, 4178),
    "MA": ("Massachusetts", 27306.0, 4179),
    "MD": ("Maryland", 32131.0, 4180),
    "ME": ("Maine", 91633.0, 4181),
    "MI": ("Michigan", 250487.0, 4182),
    "MN": ("Minnesota", 225163.0, 4183),
    "MO": ("Missouri", 180540.0, 4184),
    "MS": ("Mississippi", 125438.0, 4185),
    "MT": ("Montana", 380838.0, 4186),
    "NC": ("North Carolina", 139391.0, 4187),
    "ND": ("North Dakota", 180868.0, 4188),
    "NE": ("Nebraska", 200520.0, 4189),
    "NH": ("New Hampshire", 24214.0, 4190),
    "NJ": ("New Jersey", 22591.0, 4191),
    "NM": ("New Mexico", 314917.0, 4192),
    "NV": ("Nevada", 286380.0, 4193),
    "NY": ("New York", 141297.0, 4194),
    "OH": ("Ohio", 116098.0, 4195),
    "OK": ("Oklahoma", 181037.0, 4196),
    "OR": ("Oregon", 255026.0, 4197),
    "PA": ("Pennsylvania", 119280.0, 4198),
    "RI": ("Rhode Island", 4001.0, 4199),
    "SC": ("South Carolina", 82931.0, 4200),
    "SD": ("South Dakota", 199905.0, 4201),
    "TN": ("Tennessee", 109152.0, 4202),
    "TX": ("Texas", 695662.0, 4203),
    "UT": ("Utah", 219887.0, 4204),
    "VA": ("Virginia", 110862.0, 4205),
    "VT": ("Vermont", 24923.0, 4206),
    "WA": ("Washington", 184827.0, 4207),
    "WI": ("Wisconsin", 169639.0, 4208),
    "WV": ("West Virginia", 62629.0, 4209),
    "WY": ("Wyoming", 253335.0, 4210),
}

STATE_SPECIES_MAPPING_CACHE: dict[str, set[str]] | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build validated USA state packs.")
    parser.add_argument(
        "--state",
        action="append",
        default=[],
        help="State code to process. Repeatable and comma-separated values are both supported. Defaults to all 51 states.",
    )
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N selected species per state.")
    parser.add_argument("--workers", type=int, default=24, help="Concurrent worker count per state.")
    parser.add_argument(
        "--selection",
        choices=["expected-state", "global", "candidate-only", "country-indexed"],
        default="country-indexed",
        help="State species selection mode. Defaults to country-indexed to include expected species plus observed extras.",
    )
    parser.add_argument(
        "--candidate-file",
        type=Path,
        default=None,
        help="Optional text or CSV file of extra itemIds/binomials to include for every processed state.",
    )
    parser.add_argument(
        "--exclude-file",
        type=Path,
        default=None,
        help="Optional text or CSV file of itemIds/binomials to exclude for every processed state.",
    )
    parser.add_argument(
        "--review-app-data-root",
        type=Path,
        default=REVIEW_APP_DATA_ROOT,
        help="Target review-app data directory containing precomputed-countries/index.json.",
    )
    parser.add_argument(
        "--skip-index-update",
        action="store_true",
        help="Skip rewriting the review-app USA state rows in precomputed-countries/index.json.",
    )
    return parser.parse_args()


def normalize_state_codes(raw_values: list[str]) -> list[str]:
    if not raw_values:
        return sorted(STATE_METADATA)

    ordered: list[str] = []
    seen: set[str] = set()
    for raw_value in raw_values:
        for part in str(raw_value or "").split(","):
            state_code = part.strip().upper()
            if not state_code:
                continue
            if state_code not in STATE_METADATA:
                raise SystemExit(f"Unknown USA state code '{state_code}'.")
            if state_code not in seen:
                seen.add(state_code)
                ordered.append(state_code)
    return ordered


def state_iso3(state_code: str) -> str:
    return f"USA-{state_code.strip().upper()}"


def state_display_name(state_code: str) -> str:
    state_name, _, _ = STATE_METADATA[state_code]
    return f"{PARENT_COUNTRY_NAME} – {state_name}"


def default_state_output_paths(state_code: str, review_app_data_root: Path) -> dict[str, Path]:
    scope_iso3 = state_iso3(state_code)
    artifact_dir = COUNTRY_ARTIFACTS_DIR / scope_iso3
    pack_dir = review_app_data_root / "precomputed-countries"
    return {
        "output": pack_dir / f"{scope_iso3}.json",
        "audit_csv": artifact_dir / "species_validation.csv",
        "new_csv": artifact_dir / "new_candidates.csv",
        "summary": artifact_dir / "precomputed_validation_summary.txt",
    }


def load_global_items() -> list[dict]:
    payload = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    return payload.get("items") or []


def load_state_species_mapping() -> dict[str, set[str]]:
    global STATE_SPECIES_MAPPING_CACHE
    if STATE_SPECIES_MAPPING_CACHE is not None:
        return STATE_SPECIES_MAPPING_CACHE

    geofence = json.loads(GEOFENCE_NEW_PATH.read_text(encoding="utf-8"))
    mapping: dict[str, set[str]] = {}
    for tax_key, tax_value in geofence.items():
        if not isinstance(tax_value, dict):
            continue
        allow_mapping = tax_value.get("allow") or {}
        if not isinstance(allow_mapping, dict):
            continue

        raw_states = allow_mapping.get(PARENT_COUNTRY_ISO3)
        if not isinstance(raw_states, list):
            continue

        parts = [part.strip().lower() for part in str(tax_key or "").split(";")]
        if len(parts) < 5:
            continue
        genus = parts[-2]
        species = parts[-1]
        if not genus or not species or species == "species":
            continue

        binomial = f"{genus} {species}".strip()
        if raw_states:
            state_codes = {
                str(state_code or "").strip().upper()
                for state_code in raw_states
                if str(state_code or "").strip().upper() in STATE_METADATA
            }
        else:
            state_codes = set(STATE_METADATA)
        if not state_codes:
            continue

        mapping.setdefault(binomial, set()).update(state_codes)

    STATE_SPECIES_MAPPING_CACHE = mapping
    return mapping


def expected_usa_states_for_item(item: dict) -> set[str]:
    raw_subdivisions = item.get("expectedSubdivisions") or {}
    raw_usa_states = raw_subdivisions.get(PARENT_COUNTRY_ISO3) if isinstance(raw_subdivisions, dict) else None
    expected_countries = {
        str(value or "").strip().upper()
        for value in (item.get("expectedCountries") or [])
        if str(value or "").strip()
    }

    if isinstance(raw_usa_states, list):
        if raw_usa_states:
            return {
                str(state_code or "").strip().upper()
                for state_code in raw_usa_states
                if str(state_code or "").strip().upper() in STATE_METADATA
            }
        if PARENT_COUNTRY_ISO3 in expected_countries:
            return set(STATE_METADATA)
        return set()

    binomial = validator.normalize(item.get("binomial"))
    return set(load_state_species_mapping().get(binomial, set()))


def enrich_items_for_state(items: list[dict], state_code: str) -> list[dict]:
    scope_iso3 = state_iso3(state_code)
    enriched_items: list[dict] = []

    for item in items:
        next_item = dict(item)
        expected_countries = {
            str(value or "").strip().upper()
            for value in (item.get("expectedCountries") or [])
            if str(value or "").strip()
        }
        if state_code in expected_usa_states_for_item(item):
            expected_countries.add(scope_iso3)
        next_item["expectedCountries"] = sorted(expected_countries)
        enriched_items.append(next_item)

    return enriched_items


def configure_validator_for_state(state_code: str) -> None:
    state_name, area_km2, inat_place_id = STATE_METADATA[state_code]
    validator.COUNTRY = {
        "iso3": state_iso3(state_code),
        "iso2": PARENT_COUNTRY_ISO2,
        "name": state_display_name(state_code),
        "area_km2": area_km2,
        "inat_place_id": inat_place_id,
        "region": "Americas",
        "subregion": "North America",
        "parent_iso3": PARENT_COUNTRY_ISO3,
        "scope_label": PARENT_COUNTRY_NAME,
        "unit_type": "state",
        "state_code": state_code,
        "gbif_state_name": state_name,
        "skip_expected_point_fetch": True,
    }
    validator.EXPECTED_COUNTRY_BASELINE_ENTRIES = {}
    validator.EXPECTED_COUNTRY_BASELINE_AUDIT = {}


def selected_state_items(
    state_code: str,
    selection: str,
    limit: int | None,
    candidate_file: Path | None,
    exclude_file: Path | None,
) -> tuple[list[dict], list[dict]]:
    scope_iso3 = state_iso3(state_code)
    all_items = enrich_items_for_state(load_global_items(), state_code)
    candidate_ids, candidate_binomials = validator.load_candidate_filters(candidate_file)
    excluded_ids, excluded_binomials = validator.load_candidate_filters(exclude_file)

    filtered_all_items: list[dict] = []
    for item in all_items:
        item_id = validator.normalize(item.get("id"))
        binomial = validator.normalize(item.get("binomial"))
        if item_id in excluded_ids or binomial in excluded_binomials:
            continue
        filtered_all_items.append(item)

    if selection == "country-indexed":
        validator.build_country_evidence_preindex(filtered_all_items)
        observed_binomials = validator.country_observed_binomials()
        selected_items: list[dict] = []
        for item in filtered_all_items:
            item_class = validator.normalize(item.get("class"))
            item_id = validator.normalize(item.get("id"))
            binomial = validator.normalize(item.get("binomial"))
            expected_in_state = scope_iso3 in (item.get("expectedCountries") or [])
            include = (
                expected_in_state
                or item_id in candidate_ids
                or binomial in candidate_binomials
            )
            if item_class in validator.PREINDEX_SUPPORTED_CLASSES and binomial in observed_binomials:
                include = True
            if include:
                selected_items.append(item)
    else:
        selected_items = []
        for item in filtered_all_items:
            item_id = validator.normalize(item.get("id"))
            binomial = validator.normalize(item.get("binomial"))
            expected_in_state = scope_iso3 in (item.get("expectedCountries") or [])

            if selection == "candidate-only":
                include = item_id in candidate_ids or binomial in candidate_binomials
            else:
                include = selection == "global" or expected_in_state
                if not include:
                    include = item_id in candidate_ids or binomial in candidate_binomials
            if include:
                selected_items.append(item)

        validator.build_country_evidence_preindex(selected_items)

    if limit is not None:
        selected_items = selected_items[:limit]
    return selected_items, filtered_all_items


def build_state_payload(selection: str, candidate_file: Path | None, entries: list[dict], state_code: str) -> dict:
    return {
        "generatedFor": state_iso3(state_code),
        "countryName": state_display_name(state_code),
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "sourceDataset": "web-plugin/data/animals-global.json + geofence_new.json",
        "precomputeMode": "validated",
        "selectionMode": selection,
        "candidateFile": str(candidate_file) if candidate_file else None,
        "parentIso3": PARENT_COUNTRY_ISO3,
        "stateCode": state_code,
        "unitType": "state",
        "scopeLabel": PARENT_COUNTRY_NAME,
        "summary": {
            "total": len(entries),
            "statusCounts": dict(Counter(entry["status"] for entry in entries)),
            "bucketCounts": dict(Counter((entry.get("bucket") or validator.status_bucket(entry["status"])) for entry in entries)),
        },
        "entries": entries,
    }


def write_state_outputs(
    state_code: str,
    review_app_data_root: Path,
    selection: str,
    candidate_file: Path | None,
    entries: list[dict],
    audit_rows: list[dict],
) -> Path:
    output_paths = default_state_output_paths(state_code, review_app_data_root)
    payload = build_state_payload(selection, candidate_file, entries, state_code)

    serialized_payload = json.dumps(payload, ensure_ascii=True, indent=2)
    output_paths["output"].parent.mkdir(parents=True, exist_ok=True)
    output_paths["output"].write_text(serialized_payload, encoding="utf-8")
    validator.write_csv(output_paths["audit_csv"], audit_rows)
    validator.write_csv(output_paths["new_csv"], [row for row in audit_rows if row["bucket"] == "New"])
    validator.write_summary(output_paths["summary"], payload, audit_rows)

    print(f"Wrote {len(entries)} entries to {output_paths['output']}")
    print(f"Wrote audit CSV to {output_paths['audit_csv']}")
    print(f"Wrote new candidates CSV to {output_paths['new_csv']}")
    print(f"Wrote summary to {output_paths['summary']}")
    return output_paths["output"]


def update_review_app_state_index(review_app_data_root: Path, processed_states: list[str]) -> None:
    index_path = review_app_data_root / "precomputed-countries" / "index.json"
    if not index_path.exists():
        raise SystemExit(f"Review-app index not found: {index_path}")

    payload = json.loads(index_path.read_text(encoding="utf-8"))
    rows = payload.get("countries") or []
    replacement_rows: dict[str, dict] = {}

    for state_code in processed_states:
        scope_iso3 = state_iso3(state_code)
        pack_path = review_app_data_root / "precomputed-countries" / f"{scope_iso3}.json"
        pack_payload = json.loads(pack_path.read_text(encoding="utf-8"))
        summary = pack_payload.get("summary") or {}
        replacement_rows[scope_iso3] = {
            "iso3": scope_iso3,
            "countryName": pack_payload.get("countryName") or state_display_name(state_code),
            "path": f"./{scope_iso3}.json",
            "precomputeMode": pack_payload.get("precomputeMode") or "validated",
            "parentIso3": PARENT_COUNTRY_ISO3,
            "stateCode": state_code,
            "unitType": "state",
            "scopeLabel": PARENT_COUNTRY_NAME,
            "total": summary.get("total") or len(pack_payload.get("entries") or []),
            "bucketCounts": summary.get("bucketCounts") or {},
            "statusCounts": summary.get("statusCounts") or {},
        }

    next_rows: list[dict] = []
    seen: set[str] = set()
    for row in rows:
        iso3 = str((row or {}).get("iso3") or "").strip().upper()
        if iso3 in replacement_rows:
            next_rows.append(replacement_rows[iso3])
            seen.add(iso3)
        else:
            next_rows.append(row)

    for iso3, row in replacement_rows.items():
        if iso3 not in seen:
            next_rows.append(row)

    payload["generatedAtUtc"] = datetime.now(timezone.utc).isoformat()
    payload["countries"] = next_rows
    index_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"Updated USA state rows in {index_path}")


def process_state(
    state_code: str,
    *,
    selection: str,
    limit: int | None,
    candidate_file: Path | None,
    exclude_file: Path | None,
    workers: int,
    review_app_data_root: Path,
) -> None:
    configure_validator_for_state(state_code)
    state_name, _, inat_place_id = STATE_METADATA[state_code]
    items, all_items = selected_state_items(state_code, selection, limit, candidate_file, exclude_file)

    print(
        f"Selected scope {validator.COUNTRY['name']} ({validator.COUNTRY['iso3']})"
        f" with GBIF country={validator.COUNTRY['iso2']} stateProvince={state_name}"
        f" and iNat place={inat_place_id}"
    )
    print(f"Selected {len(items)} species using selection='{selection}' from {len(all_items)} state-scoped candidates")
    if candidate_file:
        print(f"Candidate file: {candidate_file}")
    if exclude_file:
        print(f"Exclude file: {exclude_file}")

    entries: list[dict] = []
    audit_rows: list[dict] = []
    done = 0
    total = len(items)

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {executor.submit(validator.process_item, item): item for item in items}
        for future in as_completed(futures):
            entry, audit_row = future.result()
            entries.append(entry)
            audit_rows.append(audit_row)
            done += 1
            if done % 25 == 0 or done == total:
                print(f"Processed {done}/{total}")

    entries.sort(key=lambda entry: entry["itemId"])
    audit_rows.sort(key=lambda row: (row["bucket"], row["commonName"] or row["binomial"], row["binomial"]))
    write_state_outputs(state_code, review_app_data_root, selection, candidate_file, entries, audit_rows)


def main() -> None:
    args = parse_args()
    review_app_data_root = args.review_app_data_root.resolve()
    if not review_app_data_root.exists():
        raise SystemExit(f"Review-app data root not found: {review_app_data_root}")

    processed_states = normalize_state_codes(args.state)
    for state_code in processed_states:
        print(f"\nProcessing {state_code} ({STATE_METADATA[state_code][0]})...")
        process_state(
            state_code,
            selection=args.selection,
            limit=args.limit,
            candidate_file=args.candidate_file,
            exclude_file=args.exclude_file,
            workers=args.workers,
            review_app_data_root=review_app_data_root,
        )

    if not args.skip_index_update:
        update_review_app_state_index(review_app_data_root, processed_states)


if __name__ == "__main__":
    main()
