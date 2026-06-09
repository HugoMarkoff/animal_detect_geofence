#!/usr/bin/env python3
"""Apply git-tracked country override files to published country packs.

Override files live under data/review-overrides/countries/<ISO3>/<ITEM_ID>.json.
Each file declares either an upsert patch or a removal for a single species entry.
The script restores any previously derived manual changes back to their base pack
state before reapplying the current override set, so deleting an override file
also reverts the published output.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PACK_DIR = DATA_DIR / "precomputed-countries"
INDEX_PATH = PACK_DIR / "index.json"
OVERRIDES_DIR = DATA_DIR / "review-overrides" / "countries"
ANIMALS_PATH = DATA_DIR / "animals-global.json"
GEOFENCE_TRACKING_PATH = DATA_DIR / "review-overrides" / "geofence-binary-overrides.json"
SIMPLE_GEOFENCE_PATH = DATA_DIR / "geofence-simple.json"

STATUS_TO_BUCKET = {
    "likely_true_both": "Likely Valid",
    "likely_true_one_source": "Likely Valid",
    "new_record": "New",
    "likely_false": "Needs Review",
    "unlisted": "Unlisted",
}
ALLOWED_ACTIONS = {"upsert", "remove"}
DISALLOWED_PATCH_KEYS = {"itemId", "countryIso3", "manualOverride"}
USA_PARENT_ISO3 = "USA"
USA_STATE_CODES = {
    "AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS",
    "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV",
    "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
}


def clean_text(value: object) -> str:
    return str(value or "").strip()


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json_file(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def serialize_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=True, indent=2)


def write_json_if_changed(path: Path, payload: Any) -> bool:
    serialized = serialize_json(payload)
    previous = path.read_text(encoding="utf-8") if path.exists() else None
    if previous == serialized:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialized, encoding="utf-8")
    return True


def status_to_bucket(status: object) -> str:
    return STATUS_TO_BUCKET.get(clean_text(status), "Needs Review")


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
    if not isinstance(raw_mapping, dict):
        return set(), set()

    countries: set[str] = set()
    usa_states: set[str] = set()
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


def serialize_expected_subdivisions(expected_countries: set[str], usa_states_known: bool, usa_states: set[str]) -> dict[str, list[str]]:
    if USA_PARENT_ISO3 not in expected_countries or not usa_states_known:
        return {}

    normalized_states = {state_code for state_code in usa_states if state_code in USA_STATE_CODES}
    if not normalized_states:
        return {}

    if normalized_states == USA_STATE_CODES:
        return {USA_PARENT_ISO3: []}

    return {USA_PARENT_ISO3: sorted(normalized_states)}


def item_expected_in_country(item: dict[str, Any] | None, country_iso3: str) -> bool:
    if not isinstance(item, dict):
        return False

    return country_iso3 in normalize_country_codes(item.get("expectedCountries"))


def item_has_explicit_subnational_membership(item: dict[str, Any] | None, scope_iso3: str) -> bool:
    if not isinstance(item, dict):
        return False

    state_code = usa_state_code_from_scope(scope_iso3)
    if not state_code:
        return False

    expected_subdivisions = normalize_expected_subdivisions(item.get("expectedSubdivisions"))
    return USA_PARENT_ISO3 in expected_subdivisions


def item_expected_in_scope(item: dict[str, Any] | None, scope_iso3: str) -> bool:
    if not isinstance(item, dict):
        return False

    normalized_scope = clean_text(scope_iso3).upper()
    state_code = usa_state_code_from_scope(normalized_scope)
    if not state_code:
        return item_expected_in_country(item, normalized_scope)

    expected_countries = set(normalize_country_codes(item.get("expectedCountries")))
    if USA_PARENT_ISO3 not in expected_countries:
        return False

    expected_subdivisions = normalize_expected_subdivisions(item.get("expectedSubdivisions"))
    raw_usa_states = expected_subdivisions.get(USA_PARENT_ISO3)
    if not isinstance(raw_usa_states, list):
        return False
    if not raw_usa_states:
        return True
    return state_code in raw_usa_states


def apply_item_country_overrides(
    expected_countries: list[str],
    allow_regional_countries: list[str],
    expected_subdivisions: dict[str, list[str]],
    item_override: dict[str, object] | None,
) -> tuple[list[str], list[str], dict[str, list[str]]]:
    expected = set(normalize_country_codes(expected_countries))
    regional = set(normalize_country_codes(allow_regional_countries)) & expected
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
        return sorted(expected), sorted(regional & expected), serialize_expected_subdivisions(expected, usa_states_known, usa_states)

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
        allow_states.clear()
        allow_regional_states.clear()
        block_states.clear()

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

    next_subdivisions = serialize_expected_subdivisions(expected, usa_states_known, usa_states)
    return sorted(expected), sorted(regional & expected), next_subdivisions


def empty_managed_evidence() -> dict[str, Any]:
    return {
        "domesticNamed": False,
        "materialSampleCount": 0,
        "atlasCount": 0,
        "managedCount": 0,
        "captiveInatCount": 0,
        "needsReview": False,
        "note": "",
    }


def empty_evidence_quality() -> dict[str, Any]:
    return {
        "rawTotal": 0,
        "qualifiedTotal": 0,
        "specimenOrSampleCount": 0,
        "staleGbifCount": 0,
        "staleInatCount": 0,
        "captiveInatCount": 0,
        "rejected": False,
        "note": "",
    }


def default_new_entry(item_id: str, country_iso3: str) -> dict[str, Any]:
    return {
        "itemId": item_id,
        "countryIso3": country_iso3,
        "status": "likely_false",
        "expected": False,
        "gbifPresent": None,
        "inatPresent": None,
        "gbifCount": None,
        "inatCount": None,
        "rawGbifPresent": None,
        "rawInatPresent": None,
        "rawGbifCount": None,
        "rawInatCount": None,
        "gbifUsageKey": None,
        "inatTaxonId": None,
        "inatPlaceId": None,
        "managedEvidence": empty_managed_evidence(),
        "evidenceQuality": empty_evidence_quality(),
        "observationProfile": {},
    }


def deep_merge_dict(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge_dict(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def load_animals_by_id() -> dict[str, dict[str, Any]]:
    payload = load_json_file(ANIMALS_PATH)
    items = payload.get("items") or []
    return {clean_text(item.get("id")): item for item in items if clean_text(item.get("id"))}


def load_geofence_tracking_items() -> dict[str, dict[str, object]]:
    if not GEOFENCE_TRACKING_PATH.exists():
        return {}

    payload = load_json_file(GEOFENCE_TRACKING_PATH)
    raw_items = payload.get("items") or {}
    if not isinstance(raw_items, dict):
        return {}

    items: dict[str, dict[str, object]] = {}
    for raw_item_id, raw_item in raw_items.items():
        item_id = clean_text(raw_item_id)
        if item_id and isinstance(raw_item, dict):
            items[item_id] = raw_item
    return items


def load_regional_country_override_items() -> dict[str, list[str]]:
    regional_by_item: dict[str, set[str]] = defaultdict(set)
    if not OVERRIDES_DIR.exists():
        return {}

    for path in sorted(OVERRIDES_DIR.glob("*/*.json")):
        override = load_override_file(path)
        if override["action"] != "upsert":
            continue

        patch = override.get("patch")
        if not isinstance(patch, dict):
            continue

        observation_profile = patch.get("observationProfile")
        if not isinstance(observation_profile, dict):
            continue

        if clean_text(observation_profile.get("code")).lower() != "regional":
            continue

        item_id = clean_text(override.get("itemId"))
        country_iso3 = clean_text(override.get("countryIso3")).upper()
        if item_id and country_iso3:
            regional_by_item[item_id].add(country_iso3)

    return {
        item_id: sorted(countries)
        for item_id, countries in regional_by_item.items()
        if countries
    }


def collect_override_files() -> dict[str, list[Path]]:
    by_country: dict[str, list[Path]] = defaultdict(list)
    if not OVERRIDES_DIR.exists():
        return by_country

    for country_dir in sorted(OVERRIDES_DIR.iterdir()):
        if not country_dir.is_dir():
            continue
        iso3 = country_dir.name.strip().upper()
        if not iso3:
            continue
        for path in sorted(country_dir.glob("*.json")):
            by_country[iso3].append(path)
    return by_country


def pack_has_derived_overrides(pack: dict[str, Any]) -> bool:
    if pack.get("manualOverrideRemovedEntries"):
        return True
    if isinstance(pack.get("manualOverrideSummary"), dict) and pack["manualOverrideSummary"].get("count"):
        return True
    for entry in pack.get("entries") or []:
        if isinstance((entry or {}).get("manualOverride"), dict):
            return True
    return False


def collect_derived_override_countries() -> set[str]:
    countries: set[str] = set()
    for path in sorted(PACK_DIR.glob("*.json")):
        if path.name == INDEX_PATH.name:
            continue
        try:
            pack = load_json_file(path)
        except Exception as exc:  # noqa: BLE001
            raise SystemExit(f"Failed to parse pack {path}: {exc}") from exc
        iso3 = clean_text(pack.get("generatedFor") or path.stem).upper()
        if iso3 and pack_has_derived_overrides(pack):
            countries.add(iso3)
    return countries


def sanitize_patch(patch: Any, *, source_path: Path) -> dict[str, Any]:
    if not isinstance(patch, dict):
        raise SystemExit(f"Override {source_path} must use an object-valued 'patch'.")
    for key in DISALLOWED_PATCH_KEYS:
        if key in patch:
            raise SystemExit(f"Override {source_path} cannot patch '{key}'.")
    return deepcopy(patch)


def load_override_file(path: Path) -> dict[str, Any]:
    try:
        payload = load_json_file(path)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Failed to parse override {path}: {exc}") from exc

    if not isinstance(payload, dict):
        raise SystemExit(f"Override {path} must contain a JSON object.")

    path_iso3 = path.parent.name.strip().upper()
    path_item_id = path.stem.strip()
    payload_iso3 = clean_text(payload.get("countryIso3")).upper()
    payload_item_id = clean_text(payload.get("itemId"))
    country_iso3 = payload_iso3 or path_iso3
    item_id = payload_item_id or path_item_id

    if country_iso3 != path_iso3:
        raise SystemExit(f"Override {path} has countryIso3='{country_iso3}', expected '{path_iso3}'.")
    if item_id != path_item_id:
        raise SystemExit(f"Override {path} has itemId='{item_id}', expected '{path_item_id}'.")

    action = clean_text(payload.get("action")).lower() or "upsert"
    if action not in ALLOWED_ACTIONS:
        raise SystemExit(f"Override {path} uses unsupported action '{action}'.")

    patch = sanitize_patch(payload.get("patch") or {}, source_path=path) if action == "upsert" else {}

    return {
        "countryIso3": country_iso3,
        "itemId": item_id,
        "action": action,
        "patch": patch,
        "updatedBy": clean_text(payload.get("updatedBy")),
        "updatedAtUtc": clean_text(payload.get("updatedAtUtc")),
        "reason": clean_text(payload.get("reason")),
        "sourceFile": path.relative_to(ROOT).as_posix(),
    }


def restore_pack_base(pack: dict[str, Any]) -> dict[str, Any]:
    restored_entries: dict[str, dict[str, Any]] = {}

    for raw_entry in pack.get("entries") or []:
        if not isinstance(raw_entry, dict):
            continue
        entry = deepcopy(raw_entry)
        override_meta = entry.pop("manualOverride", None)
        if isinstance(override_meta, dict):
            if override_meta.get("addedByOverride"):
                continue
            base_entry = override_meta.get("baseEntry")
            if isinstance(base_entry, dict) and clean_text(base_entry.get("itemId")):
                restored_entries[clean_text(base_entry.get("itemId"))] = deepcopy(base_entry)
                continue

        item_id = clean_text(entry.get("itemId"))
        if item_id:
            restored_entries[item_id] = entry

    for raw_tombstone in pack.get("manualOverrideRemovedEntries") or []:
        if not isinstance(raw_tombstone, dict):
            continue
        base_entry = raw_tombstone.get("baseEntry")
        if isinstance(base_entry, dict) and clean_text(base_entry.get("itemId")):
            restored_entries[clean_text(base_entry.get("itemId"))] = deepcopy(base_entry)

    restored_pack = deepcopy(pack)
    restored_pack["entries"] = sorted(restored_entries.values(), key=lambda entry: clean_text(entry.get("itemId")))
    restored_pack.pop("manualOverrideSummary", None)
    restored_pack.pop("manualOverrideRemovedEntries", None)
    return restored_pack


def recompute_pack_summary(pack: dict[str, Any]) -> None:
    statuses = [clean_text(entry.get("status")) for entry in pack.get("entries") or [] if clean_text(entry.get("status"))]
    status_counts = Counter(statuses)
    bucket_counts = Counter(status_to_bucket(status) for status in statuses)
    pack["summary"] = {
        "total": len(pack.get("entries") or []),
        "statusCounts": dict(status_counts),
        "bucketCounts": dict(bucket_counts),
    }


def apply_country_overrides(
    pack: dict[str, Any],
    override_paths: list[Path],
    animals_by_id: dict[str, dict[str, Any]],
    previous_override_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    iso3 = clean_text(pack.get("generatedFor")).upper()
    unit_type = clean_text(pack.get("unitType")).lower()
    uses_subnational_expected_membership = unit_type not in {"", "country"}
    usa_pack_item_ids: set[str] | None = None
    if uses_subnational_expected_membership:
        usa_pack_path = PACK_DIR / f"{USA_PARENT_ISO3}.json"
        if usa_pack_path.exists():
            usa_pack = load_json_file(usa_pack_path)
            usa_pack_item_ids = {
                clean_text(raw_entry.get("itemId"))
                for raw_entry in usa_pack.get("entries") or []
                if isinstance(raw_entry, dict) and clean_text(raw_entry.get("itemId"))
            }

    entries_by_id: dict[str, dict[str, Any]] = {}
    for raw_entry in pack.get("entries") or []:
        if not isinstance(raw_entry, dict):
            continue

        item_id = clean_text(raw_entry.get("itemId"))
        if not item_id:
            continue

        if uses_subnational_expected_membership and usa_pack_item_ids is not None and item_id not in usa_pack_item_ids:
            continue

        # Drop stale expected entries that are no longer in the current global dataset
        # for this country. Explicit override upserts can still add items back afterward.
        if raw_entry.get("expected"):
            global_item = animals_by_id.get(item_id)
            if uses_subnational_expected_membership:
                if not item_expected_in_country(global_item, USA_PARENT_ISO3):
                    continue
                if item_has_explicit_subnational_membership(global_item, iso3) and not item_expected_in_scope(global_item, iso3):
                    continue
            elif not item_expected_in_country(global_item, iso3):
                continue

        entries_by_id[item_id] = deepcopy(raw_entry)
    removed_entries: list[dict[str, Any]] = []
    active_items: list[str] = []

    for path in override_paths:
        override = load_override_file(path)
        item_id = override["itemId"]
        action = override["action"]

        if uses_subnational_expected_membership and usa_pack_item_ids is not None and item_id not in usa_pack_item_ids:
            continue

        active_items.append(item_id)
        existing_entry = entries_by_id.get(item_id)

        if action == "remove":
            if existing_entry is not None:
                removed_entries.append(
                    {
                        "itemId": item_id,
                        "sourceFile": override["sourceFile"],
                        "updatedAtUtc": override["updatedAtUtc"] or applied_at,
                        "updatedBy": override["updatedBy"],
                        "reason": override["reason"],
                        "baseEntry": deepcopy(existing_entry),
                    }
                )
                entries_by_id.pop(item_id, None)
            continue

        if existing_entry is None:
            if item_id not in animals_by_id:
                raise SystemExit(
                    f"Override {path} adds '{item_id}', but that item is missing from {ANIMALS_PATH.relative_to(ROOT).as_posix()}."
                )
            if "status" not in override["patch"]:
                raise SystemExit(f"Override {path} adds '{item_id}' and must include patch.status.")
            working_entry = default_new_entry(item_id, iso3)
            added_by_override = True
            base_entry = None
        else:
            working_entry = deepcopy(existing_entry)
            added_by_override = False
            base_entry = deepcopy(existing_entry)

        merged_entry = deep_merge_dict(working_entry, override["patch"])
        merged_entry["itemId"] = item_id
        merged_entry["countryIso3"] = iso3
        merged_entry["manualOverride"] = {
            "sourceFile": override["sourceFile"],
            "action": action,
            "updatedAtUtc": override["updatedAtUtc"] or now_utc_iso(),
            "updatedBy": override["updatedBy"],
            "reason": override["reason"],
            "addedByOverride": added_by_override,
            "baseEntry": base_entry,
        }
        status = clean_text(merged_entry.get("status"))
        if status:
            merged_entry["bucket"] = status_to_bucket(status)
        else:
            merged_entry.pop("bucket", None)
        entries_by_id[item_id] = merged_entry

    pack["entries"] = sorted(entries_by_id.values(), key=lambda entry: clean_text(entry.get("itemId")))
    if removed_entries:
        pack["manualOverrideRemovedEntries"] = removed_entries
    else:
        pack.pop("manualOverrideRemovedEntries", None)

    if override_paths:
        previous_items = previous_override_summary.get("items") if isinstance(previous_override_summary, dict) else None
        previous_count = previous_override_summary.get("count") if isinstance(previous_override_summary, dict) else None
        applied_at = now_utc_iso()
        if previous_count == len(override_paths) and previous_items == active_items:
            previous_applied_at = clean_text(previous_override_summary.get("appliedAtUtc"))
            if previous_applied_at:
                applied_at = previous_applied_at
        pack["manualOverrideSummary"] = {
            "count": len(override_paths),
            "appliedAtUtc": applied_at,
            "items": active_items,
        }
    else:
        pack.pop("manualOverrideSummary", None)

    recompute_pack_summary(pack)
    return pack


def build_index_row(pack: dict[str, Any], existing_row: dict[str, Any] | None = None) -> dict[str, Any]:
    iso3 = clean_text(pack.get("generatedFor")).upper()
    summary = pack.get("summary") or {}
    row = dict(existing_row or {})
    row.update(
        {
            "iso3": iso3,
            "countryName": clean_text(pack.get("countryName")) or clean_text(row.get("countryName")) or iso3,
            "path": clean_text(row.get("path")) or f"./{iso3}.json",
            "precomputeMode": clean_text(pack.get("precomputeMode")) or clean_text(row.get("precomputeMode")) or "baseline",
            "total": summary.get("total") or len(pack.get("entries") or []),
            "bucketCounts": summary.get("bucketCounts") or {},
            "statusCounts": summary.get("statusCounts") or {},
        }
    )

    override_count = int(((pack.get("manualOverrideSummary") or {}).get("count")) or 0)
    if override_count > 0:
        row["manualOverrideCount"] = override_count
        row["hasManualOverrides"] = True
    else:
        row.pop("manualOverrideCount", None)
        row.pop("hasManualOverrides", None)
    return row


def update_index(changed_countries: set[str]) -> bool:
    if not changed_countries:
        return False

    try:
        index_payload = load_json_file(INDEX_PATH)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Failed to parse {INDEX_PATH.relative_to(ROOT).as_posix()}: {exc}") from exc

    countries = index_payload.get("countries") or []
    changed = False
    seen_iso3: set[str] = set()
    next_countries: list[dict[str, Any]] = []

    for raw_row in countries:
        if not isinstance(raw_row, dict):
            continue

        row = dict(raw_row)
        iso3 = clean_text(row.get("iso3")).upper()
        if not iso3:
            next_countries.append(row)
            continue

        seen_iso3.add(iso3)
        if iso3 not in changed_countries:
            next_countries.append(row)
            continue

        pack_path = PACK_DIR / f"{iso3}.json"
        if not pack_path.exists():
            next_countries.append(row)
            continue

        pack = load_json_file(pack_path)
        next_row = build_index_row(pack, row)
        if row != next_row:
            changed = True
        next_countries.append(next_row)

    for iso3 in sorted(changed_countries - seen_iso3):
        pack_path = PACK_DIR / f"{iso3}.json"
        if not pack_path.exists():
            continue

        pack = load_json_file(pack_path)
        next_countries.append(build_index_row(pack))
        changed = True

    if not changed:
        return False

    index_payload["generatedAtUtc"] = now_utc_iso()
    index_payload["countries"] = next_countries
    return write_json_if_changed(INDEX_PATH, index_payload)


def build_simple_geofence_item(item: dict[str, Any]) -> dict[str, Any]:
    next_item = {
        "itemId": clean_text(item.get("id")),
        "commonName": clean_text(item.get("commonName")),
        "binomial": clean_text(item.get("binomial")),
        "classLabel": clean_text(item.get("classLabel")),
        "matchedKey": clean_text(item.get("matchedKey")),
        "matchLevel": item.get("matchLevel") or 0,
        "expectedCountries": normalize_country_codes(item.get("expectedCountries")),
        "allowRegionalCountries": normalize_country_codes(item.get("allowRegionalCountries")),
    }

    expected_subdivisions = normalize_expected_subdivisions(item.get("expectedSubdivisions"))
    if expected_subdivisions:
        next_item["expectedSubdivisions"] = expected_subdivisions

    return next_item


def refresh_global_artifacts() -> list[str]:
    try:
        animals_payload = load_json_file(ANIMALS_PATH)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Failed to parse {ANIMALS_PATH.relative_to(ROOT).as_posix()}: {exc}") from exc

    items = animals_payload.get("items") or []
    geofence_tracking_items = load_geofence_tracking_items()
    regional_country_overrides = load_regional_country_override_items()
    next_items: list[Any] = []
    simple_items: list[dict[str, Any]] = []

    for raw_item in items:
        if not isinstance(raw_item, dict):
            next_items.append(raw_item)
            continue

        item = deepcopy(raw_item)
        item_id = clean_text(item.get("id"))
        current_regional = set(normalize_country_codes(item.get("allowRegionalCountries")))
        current_regional.update(regional_country_overrides.get(item_id, []))
        next_expected, next_regional, next_subdivisions = apply_item_country_overrides(
            normalize_country_codes(item.get("expectedCountries")),
            sorted(current_regional),
            normalize_expected_subdivisions(item.get("expectedSubdivisions")),
            geofence_tracking_items.get(item_id),
        )
        item["expectedCountries"] = next_expected
        item["allowRegionalCountries"] = next_regional
        if next_subdivisions:
            item["expectedSubdivisions"] = next_subdivisions
        else:
            item.pop("expectedSubdivisions", None)
        next_items.append(item)

        if item_id:
            simple_items.append(build_simple_geofence_item(item))

    animals_payload["items"] = next_items
    simple_payload = {
        "generatedFor": clean_text(animals_payload.get("generatedFor")) or "Global",
        "dataset": clean_text(animals_payload.get("dataset")),
        "sourceMode": clean_text(animals_payload.get("sourceMode")),
        "sourceFiles": deepcopy(animals_payload.get("sourceFiles") or {}),
        "summary": {
            "total": len(simple_items),
            "countries": int(((animals_payload.get("summary") or {}).get("countries")) or 0),
        },
        "items": simple_items,
    }

    changed_paths: list[str] = []
    if write_json_if_changed(ANIMALS_PATH, animals_payload):
        changed_paths.append(ANIMALS_PATH.relative_to(ROOT).as_posix())
    if write_json_if_changed(SIMPLE_GEOFENCE_PATH, simple_payload):
        changed_paths.append(SIMPLE_GEOFENCE_PATH.relative_to(ROOT).as_posix())
    return changed_paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply git-tracked country override files to published country packs.")
    parser.add_argument(
        "--country",
        action="append",
        dest="countries",
        default=None,
        help="Optional ISO3 code to limit processing. Repeat to process multiple countries.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    global_artifact_paths = refresh_global_artifacts()
    animals_by_id = load_animals_by_id()
    override_files = collect_override_files()
    pack_countries = {
        path.stem.upper()
        for path in PACK_DIR.glob("*.json")
        if path.name != INDEX_PATH.name
    }

    if args.countries:
        countries_to_process = {clean_text(country).upper() for country in args.countries if clean_text(country)}
    else:
        countries_to_process = pack_countries

    changed_countries: set[str] = set()
    for iso3 in sorted(countries_to_process):
        pack_path = PACK_DIR / f"{iso3}.json"
        if not pack_path.exists():
            raise SystemExit(f"Country pack {pack_path.relative_to(ROOT).as_posix()} does not exist.")

        try:
            current_pack = load_json_file(pack_path)
        except Exception as exc:  # noqa: BLE001
            raise SystemExit(f"Failed to parse {pack_path.relative_to(ROOT).as_posix()}: {exc}") from exc

        restored_pack = restore_pack_base(current_pack)
        next_pack = apply_country_overrides(
            restored_pack,
            override_files.get(iso3, []),
            animals_by_id,
            previous_override_summary=current_pack.get("manualOverrideSummary") if isinstance(current_pack.get("manualOverrideSummary"), dict) else None,
        )
        if write_json_if_changed(pack_path, next_pack):
            changed_countries.add(iso3)
            print(f"Updated {pack_path.relative_to(ROOT).as_posix()} ({len(override_files.get(iso3, []))} overrides)")
        else:
            print(f"No changes for {pack_path.relative_to(ROOT).as_posix()}")

    if update_index(changed_countries):
        print(f"Updated {INDEX_PATH.relative_to(ROOT).as_posix()}")
    elif changed_countries:
        print(f"No index changes needed in {INDEX_PATH.relative_to(ROOT).as_posix()}")

    if global_artifact_paths:
        for relative_path in global_artifact_paths:
            print(f"Updated {relative_path}")
    elif not changed_countries:
        print("No override-derived artifacts changed.")


if __name__ == "__main__":
    main()