#!/usr/bin/env python3
"""Build a global supported-class dataset from taxonomy_release and geofence rules.

Output schema is tailored for web-plugin/data/animals-global.json.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_TAXONOMY_PATH = ROOT / "taxonomy_release.txt"
DEFAULT_GEOFENCE_PATH = ROOT / "geofence.json"
DEFAULT_GEOFENCE_BINARY_OVERRIDES_PATH = ROOT / "animal_detect_geofence" / "data" / "review-overrides" / "geofence-binary-overrides.json"
DEFAULT_OUTPUT_PATH = ROOT / "web-plugin" / "data" / "animals-global.json"

SOURCE_PRESETS = {
    "current": {
        "taxonomy": DEFAULT_TAXONOMY_PATH,
        "taxonomy_fallback": None,
        "geofence": DEFAULT_GEOFENCE_PATH,
        "order_aliases": {},
    },
    "new": {
        "taxonomy": ROOT / "taxonomy_release_new.txt",
        "taxonomy_fallback": DEFAULT_TAXONOMY_PATH,
        "geofence": ROOT / "geofence_new.json",
        "order_aliases": {
            "cetartiodactyla": "artiodactyla",
            "chordata": "carnivora",
        },
    },
}

VALID_CLASSES = {"aves", "mammalia", "reptilia", "amphibia"}
CLASS_LABELS = {
    "aves": "Bird",
    "mammalia": "Mammal",
    "reptilia": "Reptile",
    "amphibia": "Amphibian",
}
USA_PARENT_ISO3 = "USA"
USA_STATE_CODES = {
    "AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS",
    "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV",
    "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
}


def normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def normalize_order(value: str | None, order_aliases: dict[str, str]) -> str:
    normalized = normalize(value)
    return order_aliases.get(normalized, normalized)


def match_candidates(row: dict[str, str], order_aliases: dict[str, str]) -> list[tuple[str, int]]:
    cls = normalize(row.get("class"))
    order = normalize_order(row.get("order"), order_aliases)
    family = normalize(row.get("family"))
    genus = normalize(row.get("genus"))
    species = normalize(row.get("species"))
    return [
        (f"{cls};{order};{family};{genus};{species}", 5),
        (f"{cls};{order};{family};{genus};", 4),
        (f"{cls};{order};{family};;", 3),
        (f"{cls};{order};;;", 2),
        (f"{cls};;;;", 1),
    ]


def pick_geofence_match(
    row: dict[str, str],
    geofence: dict[str, dict],
    order_aliases: dict[str, str],
) -> tuple[str, int]:
    for key, level in match_candidates(row, order_aliases):
        if key in geofence:
            return key, level
    return "", 0


def collect_country_codes(geofence: dict[str, dict]) -> set[str]:
    country_codes: set[str] = set()
    for rule in geofence.values():
        if not isinstance(rule, dict):
            continue
        for mode in ("allow", "block"):
            mapping = rule.get(mode) or {}
            if isinstance(mapping, dict):
                for iso3 in mapping:
                    normalized_iso3 = str(iso3 or "").strip().upper()
                    if normalized_iso3:
                        country_codes.add(normalized_iso3)
    return country_codes


def normalize_country_codes(values: object) -> list[str]:
    if not isinstance(values, list):
        return []

    normalized = {
        str(iso3 or "").strip().upper()
        for iso3 in values
        if len(str(iso3 or "").strip()) == 3 and str(iso3 or "").strip().isalpha()
    }
    return sorted(normalized)


def normalize_usa_state_codes(values: object) -> list[str]:
    if not isinstance(values, list):
        return []

    normalized = {
        str(state_code or "").strip().upper()
        for state_code in values
        if str(state_code or "").strip().upper() in USA_STATE_CODES
    }
    return sorted(normalized)


def usa_state_code_from_scope(scope: object) -> str:
    normalized_scope = str(scope or "").strip().upper()
    prefix = f"{USA_PARENT_ISO3}-"
    if not normalized_scope.startswith(prefix):
        return ""

    state_code = normalized_scope[len(prefix):]
    return state_code if state_code in USA_STATE_CODES else ""


def split_override_scope_map(raw_mapping: object) -> tuple[set[str], set[str]]:
    countries: set[str] = set()
    usa_states: set[str] = set()
    if not isinstance(raw_mapping, dict):
        return countries, usa_states

    for scope, enabled in raw_mapping.items():
        if not bool(enabled):
            continue

        normalized_scope = str(scope or "").strip().upper()
        if not normalized_scope:
            continue

        state_code = usa_state_code_from_scope(normalized_scope)
        if state_code:
            usa_states.add(state_code)
            continue

        if len(normalized_scope) == 3 and normalized_scope.isalpha():
            countries.add(normalized_scope)

    return countries, usa_states


def normalize_expected_subdivisions(raw_mapping: object) -> dict[str, list[str]]:
    if not isinstance(raw_mapping, dict):
        return {}

    raw_usa_states = raw_mapping.get(USA_PARENT_ISO3)
    if not isinstance(raw_usa_states, list):
        return {}

    normalized_states = normalize_usa_state_codes(raw_usa_states)
    if raw_usa_states and not normalized_states:
        return {}

    return {USA_PARENT_ISO3: normalized_states}


def resolve_expected_subdivisions(matched_key: str, geofence: dict[str, dict]) -> dict[str, list[str]]:
    if not matched_key:
        return {}

    rule = geofence.get(matched_key, {})
    allow_mapping = rule.get("allow") or {}
    if not isinstance(allow_mapping, dict):
        return {}

    return normalize_expected_subdivisions({USA_PARENT_ISO3: allow_mapping.get(USA_PARENT_ISO3)})


def serialize_expected_subdivisions(usa_in_scope: bool, usa_states_known: bool, usa_states: set[str]) -> dict[str, list[str]]:
    if not usa_in_scope or not usa_states_known:
        return {}

    normalized_states = {state_code for state_code in usa_states if state_code in USA_STATE_CODES}
    if not normalized_states:
        return {}

    if normalized_states == USA_STATE_CODES:
        return {USA_PARENT_ISO3: []}

    return {USA_PARENT_ISO3: sorted(normalized_states)}


def split_block_scope(rule: dict[str, object]) -> tuple[set[str], dict[str, set[str]]]:
    """Separate country-wide blocks from subdivision-scoped ones.

    Geofence semantics: an empty subdivision list means the whole country is
    blocked, while a non-empty list blocks only those subdivisions. Treating the
    latter as a country-wide block silently deletes the country.
    """
    countrywide: set[str] = set()
    subdivisions: dict[str, set[str]] = {}

    for iso3, states in (rule.get("block") or {}).items():
        normalized_iso3 = str(iso3 or "").strip().upper()
        if not normalized_iso3:
            continue
        if isinstance(states, list) and states:
            subdivisions[normalized_iso3] = set(normalize_usa_state_codes(states))
        else:
            countrywide.add(normalized_iso3)

    return countrywide, subdivisions


def effective_usa_states(rule: dict[str, object]) -> set[str] | None:
    """States where a species is actually expected, after applying blocks.

    Returns None when the USA is not covered by the rule at all.
    """
    allow_mapping = rule.get("allow") or {}
    block_countrywide, block_subdivisions = split_block_scope(rule)

    if USA_PARENT_ISO3 in allow_mapping:
        raw_allow = allow_mapping.get(USA_PARENT_ISO3)
        allowed = set(normalize_usa_state_codes(raw_allow)) if raw_allow else set(USA_STATE_CODES)
    elif USA_PARENT_ISO3 in block_subdivisions and not allow_mapping:
        # Blocked only in some states => expected everywhere else.
        allowed = set(USA_STATE_CODES)
    else:
        return None

    if USA_PARENT_ISO3 in block_countrywide:
        return set()

    return allowed - block_subdivisions.get(USA_PARENT_ISO3, set())


def resolve_expected_countries(
    matched_key: str,
    geofence: dict[str, dict],
    all_country_codes: set[str],
) -> list[str]:
    if not matched_key:
        return []

    rule = geofence.get(matched_key, {})
    allow = {
        str(iso3 or "").strip().upper()
        for iso3 in (rule.get("allow") or {}).keys()
        if str(iso3 or "").strip()
    }
    block_countrywide, _ = split_block_scope(rule)

    if allow:
        return sorted(allow - block_countrywide)
    if rule.get("block"):
        return sorted(all_country_codes - block_countrywide)
    return []


def apply_usa_subdivision_scope(
    expected_countries: list[str],
    rule: dict[str, object],
) -> tuple[list[str], list[str], dict[str, list[str]]]:
    """Record which states a species occupies without revoking the country.

    A subdivision list says WHERE a species occurs, not whether the country
    claim is valid. Judging membership by state count instead deleted the
    country for anything short of a wide range, which is what geofenced
    white-tailed deer down to "animal" on country-only requests. Membership is
    a reviewed decision and lives in the country packs.

    Returns (expected_countries, regional_countries, expected_subdivisions).
    """
    expected = set(normalize_country_codes(expected_countries))
    regional: set[str] = set()

    states = effective_usa_states(rule)
    if states is None:
        return sorted(expected), sorted(regional), {}

    if not states:
        expected.discard(USA_PARENT_ISO3)
        return sorted(expected), sorted(regional), {}

    expected.add(USA_PARENT_ISO3)
    subdivisions = {
        USA_PARENT_ISO3: [] if states == set(USA_STATE_CODES) else sorted(states)
    }
    return sorted(expected), sorted(regional), subdivisions


def normalize_override_country_map(raw_mapping: object) -> set[str]:
    if not isinstance(raw_mapping, dict):
        return set()

    countries: set[str] = set()
    for iso3, enabled in raw_mapping.items():
        normalized_iso3 = str(iso3 or "").strip().upper()
        if normalized_iso3 and bool(enabled):
            countries.add(normalized_iso3)
    return countries


def apply_item_country_overrides(
    expected_countries: list[str],
    allow_regional_countries: list[str],
    expected_subdivisions: dict[str, list[str]],
    item_override: dict[str, object] | None,
) -> tuple[list[str], list[str], dict[str, list[str]]]:
    expected = set(normalize_country_codes(expected_countries))
    regional = set(normalize_country_codes(allow_regional_countries))
    normalized_subdivisions = normalize_expected_subdivisions(expected_subdivisions)

    usa_states_known = False
    usa_states: set[str] = set()
    raw_usa_states = normalized_subdivisions.get(USA_PARENT_ISO3)
    if isinstance(raw_usa_states, list):
        usa_states_known = True
        if raw_usa_states:
            usa_states.update(raw_usa_states)
        else:
            usa_states.update(USA_STATE_CODES)

    if not isinstance(item_override, dict):
        usa_in_scope = USA_PARENT_ISO3 in expected or USA_PARENT_ISO3 in regional
        return sorted(expected), sorted(regional), serialize_expected_subdivisions(usa_in_scope, usa_states_known, usa_states)

    allow, allow_states = split_override_scope_map(item_override.get("allow"))
    block, block_states = split_override_scope_map(item_override.get("block"))
    allow_regional, allow_regional_states = split_override_scope_map(item_override.get("allow_regional"))

    expected.update(allow)
    expected.update(allow_regional)
    expected.difference_update(block)
    regional.update(allow_regional)
    regional.difference_update(block)

    if USA_PARENT_ISO3 in allow or USA_PARENT_ISO3 in allow_regional:
        expected.add(USA_PARENT_ISO3)
        if not usa_states_known:
            usa_states_known = True
            usa_states.update(USA_STATE_CODES)

    if USA_PARENT_ISO3 in block:
        expected.discard(USA_PARENT_ISO3)
        regional.discard(USA_PARENT_ISO3)
        usa_states_known = False
        usa_states.clear()

    if allow_states or allow_regional_states or block_states:
        expected.add(USA_PARENT_ISO3)
        if not usa_states_known:
            usa_states_known = True
        usa_states.update(allow_states)
        usa_states.update(allow_regional_states)
        usa_states.difference_update(block_states)

    if usa_states_known and not usa_states:
        expected.discard(USA_PARENT_ISO3)
        regional.discard(USA_PARENT_ISO3)
        usa_states_known = False

    usa_in_scope = USA_PARENT_ISO3 in expected or USA_PARENT_ISO3 in regional
    next_subdivisions = serialize_expected_subdivisions(usa_in_scope, usa_states_known, usa_states)
    return sorted(expected), sorted(regional), next_subdivisions


def build_item(
    row: dict[str, str],
    geofence: dict[str, dict],
    all_country_codes: set[str],
    order_aliases: dict[str, str],
    item_overrides: dict[str, dict[str, object]],
) -> dict:
    matched_key, match_level = pick_geofence_match(row, geofence, order_aliases)
    expected_countries = resolve_expected_countries(matched_key, geofence, all_country_codes)
    expected_countries, regional_countries, expected_subdivisions = apply_usa_subdivision_scope(
        expected_countries,
        geofence.get(matched_key) or {},
    )
    expected_countries, allow_regional_countries, expected_subdivisions = apply_item_country_overrides(
        expected_countries,
        regional_countries,
        expected_subdivisions,
        item_overrides.get(row["id"]),
    )

    genus = normalize(row.get("genus"))
    species = normalize(row.get("species"))
    binomial = f"{genus} {species}".strip()
    normalized_class = normalize(row.get("class"))

    item = {
        "id": row["id"],
        "class": normalized_class,
        "classLabel": CLASS_LABELS.get(normalized_class, normalized_class.title()),
        "order": normalize_order(row.get("order"), order_aliases),
        "family": normalize(row.get("family")),
        "genus": genus,
        "species": species,
        "binomial": binomial,
        "commonName": (row.get("common") or "").strip(),
        "matchedKey": matched_key,
        "matchLevel": match_level,
        "expectedCountries": expected_countries,
        "allowRegionalCountries": allow_regional_countries,
    }

    if expected_subdivisions:
        item["expectedSubdivisions"] = expected_subdivisions

    return item


def parse_order_aliases(raw_values: list[str]) -> dict[str, str]:
    aliases: dict[str, str] = {}
    for raw_value in raw_values:
        if "=" not in raw_value:
            raise SystemExit(f"Invalid --order-alias '{raw_value}'. Expected OLD=NEW.")
        source_value, target_value = raw_value.split("=", 1)
        source_key = normalize(source_value)
        target_key = normalize(target_value)
        if not source_key or not target_key:
            raise SystemExit(f"Invalid --order-alias '{raw_value}'. Expected OLD=NEW.")
        aliases[source_key] = target_key
    return aliases


def resolve_path(raw_path: str, default_path: Path | None) -> Path | None:
    if raw_path:
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            candidate = ROOT / candidate
        return candidate
    return default_path


def display_path(path: Path | None) -> str:
    if path is None:
        return ""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def is_usable_file(path: Path | None) -> bool:
    return bool(path and path.exists() and path.is_file() and path.stat().st_size > 0)


def choose_taxonomy_path(primary_path: Path, fallback_path: Path | None) -> tuple[Path, bool]:
    if is_usable_file(primary_path):
        return primary_path, False
    if is_usable_file(fallback_path):
        return fallback_path, True
    if primary_path.exists() and primary_path.stat().st_size == 0:
        raise SystemExit(
            f"Taxonomy input is empty: {display_path(primary_path)}. "
            "Provide a populated file or a usable --taxonomy-fallback-path."
        )
    raise SystemExit(f"Taxonomy input not found or unusable: {display_path(primary_path)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the global supported-class dataset.")
    parser.add_argument(
        "--source",
        choices=sorted(SOURCE_PRESETS),
        default="current",
        help="Select the default input pair. 'new' uses geofence_new.json and falls back to taxonomy_release.txt when taxonomy_release_new.txt is empty.",
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
        help="Optional item-level binary geofence override file used to apply allow/block/allow_regional admin decisions.",
    )
    parser.add_argument(
        "--output-path",
        default=str(DEFAULT_OUTPUT_PATH),
        help="Output JSON path. Defaults to web-plugin/data/animals-global.json.",
    )
    parser.add_argument(
        "--order-alias",
        action="append",
        default=[],
        help="Repeatable OLD=NEW taxonomy order alias applied before geofence matching and in the emitted dataset.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    preset = SOURCE_PRESETS[args.source]

    requested_taxonomy_path = resolve_path(args.taxonomy_path, preset["taxonomy"])
    taxonomy_fallback_path = resolve_path(args.taxonomy_fallback_path, preset["taxonomy_fallback"])
    geofence_path = resolve_path(args.geofence_path, preset["geofence"])
    geofence_binary_overrides_path = resolve_path(args.geofence_binary_overrides_path, DEFAULT_GEOFENCE_BINARY_OVERRIDES_PATH)
    output_path = resolve_path(args.output_path, DEFAULT_OUTPUT_PATH)
    order_aliases = dict(preset["order_aliases"])
    order_aliases.update(parse_order_aliases(args.order_alias))

    if geofence_path is None or not is_usable_file(geofence_path):
        raise SystemExit(f"Geofence input not found or unusable: {display_path(geofence_path)}")

    taxonomy_path, used_taxonomy_fallback = choose_taxonomy_path(requested_taxonomy_path, taxonomy_fallback_path)

    if used_taxonomy_fallback:
        print(
            f"Taxonomy input {display_path(requested_taxonomy_path)} is unavailable or empty; "
            f"using fallback {display_path(taxonomy_path)}."
        )

    with geofence_path.open("r", encoding="utf-8") as f:
        geofence = json.load(f)

    item_overrides: dict[str, dict[str, object]] = {}
    geofence_binary_overrides_used = False
    if is_usable_file(geofence_binary_overrides_path):
        with geofence_binary_overrides_path.open("r", encoding="utf-8") as f:
            override_payload = json.load(f)
        raw_items = override_payload.get("items") if isinstance(override_payload, dict) else None
        if isinstance(raw_items, dict):
            item_overrides = {
                str(item_id or "").strip(): value
                for item_id, value in raw_items.items()
                if str(item_id or "").strip() and isinstance(value, dict)
            }
            geofence_binary_overrides_used = bool(item_overrides)

    all_country_codes = collect_country_codes(geofence)

    items: list[dict] = []
    by_class: Counter[str] = Counter()

    with taxonomy_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(
            f,
            fieldnames=["id", "class", "order", "family", "genus", "species", "common"],
            delimiter=";",
        )
        for row in reader:
            cls = normalize(row.get("class"))
            genus = normalize(row.get("genus"))
            species = normalize(row.get("species"))

            # Keep species-level supported classes to avoid family/genus placeholders.
            if cls not in VALID_CLASSES:
                continue
            if not genus or not species:
                continue
            if species == "species":
                continue

            item = build_item(
                row,
                geofence,
                all_country_codes,
                order_aliases,
                item_overrides,
            )
            if not item["matchedKey"]:
                continue

            items.append(item)
            by_class[item["class"]] += 1

    items.sort(key=lambda x: ((x.get("commonName") or "~").lower(), x["binomial"]))

    all_countries: set[str] = set()
    for item in items:
        all_countries.update(item["expectedCountries"])

    dataset_label = f"{display_path(taxonomy_path)} + {display_path(geofence_path)}"
    if used_taxonomy_fallback and requested_taxonomy_path != taxonomy_path:
        dataset_label = (
            f"{display_path(requested_taxonomy_path)} -> {display_path(taxonomy_path)}"
            f" + {display_path(geofence_path)}"
        )

    payload = {
        "generatedFor": "Global",
        "dataset": dataset_label,
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "sourceMode": args.source,
        "sourceFiles": {
            "taxonomy": display_path(taxonomy_path),
            "geofence": display_path(geofence_path),
            "geofenceBinaryOverrides": display_path(geofence_binary_overrides_path) if geofence_binary_overrides_used else "",
        },
        "taxonomyFallbackUsed": used_taxonomy_fallback,
        "geofenceBinaryOverridesUsed": geofence_binary_overrides_used,
        "orderAliases": dict(sorted(order_aliases.items())),
        "summary": {
            "total": len(items),
            "byClass": dict(sorted(by_class.items())),
            "countries": len(all_countries),
        },
        "items": items,
    }

    assert output_path is not None
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=True, indent=2)

    print(f"Wrote {len(items)} items to {output_path}")


if __name__ == "__main__":
    main()
