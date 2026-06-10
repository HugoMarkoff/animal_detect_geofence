#!/usr/bin/env python3
"""Rebuild the manual review layer and remove legacy Dan-on-disk residue.

The published review desk should keep shared geofence tracking, the audit log,
and the per-scope override directory focused on manual/non-Dan changes. Dan's
CAN/USA decisions remain available at build time through Corrections_DAN.json.
"""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

from apply_country_overrides import (
    ANIMALS_PATH,
    GEOFENCE_TRACKING_PATH,
    OVERRIDES_DIR,
    PACK_DIR,
    ROOT,
    USA_PARENT_ISO3,
    USA_STATE_CODES,
    clean_text,
    load_json_file,
    now_utc_iso,
    write_json_if_changed,
)


CHANGE_LOG_PATH = ROOT / "data" / "review-overrides" / "change-log.json"


def sorted_scope_map(scopes: set[str]) -> dict[str, bool]:
    return {scope: True for scope in sorted(scopes)}


def build_tracking_entry(animals_by_id: dict[str, dict[str, Any]], item_id: str, source_dataset: str) -> dict[str, Any]:
    animal = animals_by_id[item_id]
    common_name = clean_text(animal.get("commonName"))
    binomial = clean_text(animal.get("binomial"))
    species_label = f"{common_name} ({binomial})" if common_name and binomial else common_name or binomial or item_id
    return {
        "itemId": item_id,
        "matchedKey": clean_text(animal.get("matchedKey")),
        "speciesLabel": species_label,
        "commonName": common_name,
        "binomial": binomial,
        "classLabel": clean_text(animal.get("classLabel")),
        "sourceDataset": source_dataset,
        "allow": {},
        "block": {},
        "allow_regional": {},
        "metadata": {},
    }


def is_dan_metadata(meta: object) -> bool:
    if not isinstance(meta, dict):
        return False
    return clean_text(meta.get("updatedBy")) == "Dan" or clean_text(meta.get("sourceDataset")) == "Corrections_DAN.json"


def strip_dan_scopes(raw_item: dict[str, Any]) -> dict[str, Any] | None:
    item = deepcopy(raw_item)
    allow = item.get("allow") if isinstance(item.get("allow"), dict) else {}
    block = item.get("block") if isinstance(item.get("block"), dict) else {}
    allow_regional = item.get("allow_regional") if isinstance(item.get("allow_regional"), dict) else {}
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}

    dan_scopes = {scope for scope, meta in metadata.items() if is_dan_metadata(meta)}
    for scope in dan_scopes:
        allow.pop(scope, None)
        block.pop(scope, None)
        allow_regional.pop(scope, None)
        metadata.pop(scope, None)

    item["allow"] = {scope: True for scope, enabled in allow.items() if bool(enabled)}
    item["block"] = {scope: True for scope, enabled in block.items() if bool(enabled)}
    item["allow_regional"] = {scope: True for scope, enabled in allow_regional.items() if bool(enabled)}
    item["metadata"] = {scope: meta for scope, meta in metadata.items() if isinstance(meta, dict)}

    if not item["allow"] and not item["block"] and not item["allow_regional"] and not item["metadata"]:
        return None
    return item


def set_scope_metadata(
    item: dict[str, Any],
    scope_iso3: str,
    *,
    decision: str,
    coverage: str,
    source_dataset: str,
    updated_by: str,
    updated_at: str,
    reason: str,
) -> None:
    allow = item.setdefault("allow", {})
    block = item.setdefault("block", {})
    allow_regional = item.setdefault("allow_regional", {})
    metadata = item.setdefault("metadata", {})

    if decision == "block":
        block[scope_iso3] = True
        allow.pop(scope_iso3, None)
        allow_regional.pop(scope_iso3, None)
    else:
        allow[scope_iso3] = True
        block.pop(scope_iso3, None)
        if coverage == "regional":
            allow_regional[scope_iso3] = True
        else:
            allow_regional.pop(scope_iso3, None)

    metadata[scope_iso3] = {
        "decision": decision,
        "coverage": coverage,
        "sourceDataset": source_dataset,
        "updatedBy": updated_by,
        "updatedAtUtc": updated_at,
        "reason": reason,
    }


def apply_manual_spec(
    tracking_items: dict[str, dict[str, Any]],
    animals_by_id: dict[str, dict[str, Any]],
    item_id: str,
    spec: dict[str, Any],
) -> None:
    item = build_tracking_entry(animals_by_id, item_id, clean_text(spec["sourceDataset"]))
    updated_by = clean_text(spec["updatedBy"])
    updated_at = clean_text(spec["updatedAtUtc"])
    reason = clean_text(spec["reason"])

    for scope_iso3 in sorted(spec.get("allow_countries", set())):
        set_scope_metadata(
            item,
            scope_iso3,
            decision="allow",
            coverage="national",
            source_dataset=item["sourceDataset"],
            updated_by=updated_by,
            updated_at=updated_at,
            reason=reason,
        )

    for country_iso3 in sorted(spec.get("allow_regional_countries", set())):
        set_scope_metadata(
            item,
            country_iso3,
            decision="allow",
            coverage="regional",
            source_dataset=item["sourceDataset"],
            updated_by=updated_by,
            updated_at=updated_at,
            reason=reason,
        )

    for state_code in sorted(spec.get("allow_states", set())):
        set_scope_metadata(
            item,
            f"{USA_PARENT_ISO3}-{state_code}",
            decision="allow",
            coverage="statewide",
            source_dataset=item["sourceDataset"],
            updated_by=updated_by,
            updated_at=updated_at,
            reason=reason,
        )

    for scope_iso3 in sorted(spec.get("block_countries", set())):
        set_scope_metadata(
            item,
            scope_iso3,
            decision="block",
            coverage="removed",
            source_dataset=item["sourceDataset"],
            updated_by=updated_by,
            updated_at=updated_at,
            reason=reason,
        )

    for state_code in sorted(spec.get("block_states", set())):
        set_scope_metadata(
            item,
            f"{USA_PARENT_ISO3}-{state_code}",
            decision="block",
            coverage="removed",
            source_dataset=item["sourceDataset"],
            updated_by=updated_by,
            updated_at=updated_at,
            reason=reason,
        )

    tracking_items[item_id] = item


def is_dan_log_entry(entry: object) -> bool:
    if not isinstance(entry, dict):
        return False
    return (
        clean_text(entry.get("updatedBy")) == "Dan"
        or clean_text(entry.get("sourceDataset")) == "Corrections_DAN.json"
        or clean_text(entry.get("suggestionType")) == "dan_import"
    )


def is_dan_override_payload(payload: object) -> bool:
    if not isinstance(payload, dict):
        return False
    updated_by = clean_text(payload.get("updatedBy"))
    source_dataset = clean_text(payload.get("sourceDataset"))
    reason = clean_text(payload.get("reason")).lower()
    return (
        updated_by == "Dan"
        or source_dataset == "Corrections_DAN.json"
        or reason.startswith("imported dan review:")
    )


def remove_dan_override_files() -> int:
    removed = 0
    for path in sorted(OVERRIDES_DIR.glob("*/*.json")):
        payload = load_json_file(path)
        if not is_dan_override_payload(payload):
            continue
        path.unlink()
        removed += 1
    return removed


def ensure_log_entry(entries: list[dict[str, Any]], entry: dict[str, Any]) -> None:
    entry_id = clean_text(entry.get("id"))
    for index, existing in enumerate(entries):
        if clean_text(existing.get("id")) == entry_id:
            entries[index] = entry
            return
    entries.append(entry)


def main() -> int:
    animals_payload = load_json_file(ANIMALS_PATH)
    animals_by_id = {
        clean_text(item.get("id")): item
        for item in animals_payload.get("items") or []
        if isinstance(item, dict) and clean_text(item.get("id"))
    }

    tracking_payload = load_json_file(GEOFENCE_TRACKING_PATH)
    raw_tracking_items = tracking_payload.get("items") if isinstance(tracking_payload.get("items"), dict) else {}
    cleaned_tracking_items: dict[str, dict[str, Any]] = {}
    for item_id, raw_item in raw_tracking_items.items():
        if not isinstance(raw_item, dict):
            continue
        next_item = strip_dan_scopes(raw_item)
        if next_item is not None:
            cleaned_tracking_items[clean_text(item_id)] = next_item

    country_scopes = {
        path.stem.upper()
        for path in PACK_DIR.glob("*.json")
        if path.name != "index.json" and "-" not in path.stem
    }
    usa_states = set(USA_STATE_CODES)

    manual_specs: dict[str, dict[str, Any]] = {
        "429257d4-3ef2-47fb-b849-66ee6c107346": {
            "sourceDataset": "data/review-overrides/countries/DNK/429257d4-3ef2-47fb-b849-66ee6c107346.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": "2026-06-09T07:09:33.520049Z",
            "reason": "Backfilled the existing Denmark regional moose approval into the shared binary change file so the fresh change baseline includes the current reviewed regional exception.",
            "allow_countries": {"DNK"},
            "allow_regional_countries": {"DNK"},
        },
        "601cf098-9876-4912-84bb-0926834305e9": {
            "sourceDataset": "systematic_review_proposals.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": "2026-06-09T07:09:35.520049Z",
            "reason": "Backfilled the current grizzly correction into the shared binary change file. Effective override keeps grizzly only in Canada and the United States and removes it from all USA state packs.",
            "allow_countries": {"CAN", "USA"},
            "block_countries": set(sorted(country_scopes - {"CAN", "USA"})),
            "block_states": usa_states,
        },
        "ea7e5297-8c71-4c93-a55b-27b1fe8f49de": {
            "sourceDataset": "taxonomy_release_new.txt -> taxonomy_release.txt + geofence_new.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": "2026-06-09T07:09:37.520049Z",
            "reason": "Corrected gila monster from the broad reptile fallback to its native USA/MEX scope, with USA limited to AZ, CA, NM, NV, and UT in state packs.",
            "allow_countries": {"MEX"},
            "allow_states": {"AZ", "CA", "NM", "NV", "UT"},
            "block_countries": set(sorted(country_scopes - {"MEX", "USA"})),
            "block_states": usa_states - {"AZ", "CA", "NM", "NV", "UT"},
        },
        "446887df-3477-4f4a-a434-852f96ba48d9": {
            "sourceDataset": "taxonomy_release_new.txt -> taxonomy_release.txt + geofence_new.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": "2026-06-09T07:09:39.520049Z",
            "reason": "Corrected western pond turtle from the broad emydid fallback to USA/MEX, with USA limited to CA, OR, and WA in state packs.",
            "allow_countries": {"MEX"},
            "allow_states": {"CA", "OR", "WA"},
            "block_countries": set(sorted(country_scopes - {"MEX", "USA"})),
            "block_states": usa_states - {"CA", "OR", "WA"},
        },
        "b57debc1-dff2-48d3-a400-f2b5021e71b0": {
            "sourceDataset": "taxonomy_release_new.txt + geofence_new.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": "2026-06-09T07:51:12.845Z",
            "reason": "Please accept northern raccoon (procyon lotor) into the permanent Denmark country pack and keep its current national footprint coverage. Applied from the admin panel.",
            "allow_countries": {"DNK"},
        },
        "746d3e98-64af-4897-9cd3-c09b169a8c69": {
            "sourceDataset": "taxonomy_release_new.txt + geofence_new.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": "2026-06-09T09:01:16.812Z",
            "reason": "Please accept raccoon dog (nyctereutes procyonoides) into the permanent Sweden country pack and keep its current national footprint coverage. Applied from the admin panel.",
            "allow_countries": {"SWE"},
        },
        "18c5f185-04c8-43fc-9325-d38f7daa2700": {
            "sourceDataset": "taxonomy_release_new.txt + geofence_new.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": "2026-06-09T09:57:26.480Z",
            "reason": "Please update european bison (bison bonasus) to regional coverage in Denmark. The selected regional areas show the requested corrected footprint. Applied from the admin panel.",
            "allow_countries": {"DNK"},
            "allow_regional_countries": {"DNK"},
        },
        "5530da0c-f031-4392-b86e-bd1af72de752": {
            "sourceDataset": "taxonomy_release_new.txt + geofence_new.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": now_utc_iso(),
            "reason": "Corrected pacific gophersnake from the broad colubrid fallback to Canada, Mexico, and the Pacific USA states CA, OR, and WA.",
            "allow_countries": {"CAN", "MEX"},
            "allow_states": {"CA", "OR", "WA"},
            "block_countries": set(sorted(country_scopes - {"CAN", "MEX", "USA"})),
            "block_states": usa_states - {"CA", "OR", "WA"},
        },
        "a5121a63-c9d0-4849-8db7-e7d8bbf4e581": {
            "sourceDataset": "taxonomy_release_new.txt + geofence_new.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": now_utc_iso(),
            "reason": "Corrected military sand-dragon from the broad agamid fallback to Australia only.",
            "allow_countries": {"AUS"},
            "block_countries": set(sorted(country_scopes - {"AUS"})),
        },
    }

    for item_id, spec in manual_specs.items():
        apply_manual_spec(cleaned_tracking_items, animals_by_id, item_id, spec)

    ordered_tracking_items = {
        item_id: cleaned_tracking_items[item_id]
        for item_id in sorted(cleaned_tracking_items)
    }
    tracking_payload["items"] = ordered_tracking_items
    tracking_payload["updatedAtUtc"] = now_utc_iso()

    change_log_payload = load_json_file(CHANGE_LOG_PATH)
    entries = [entry for entry in change_log_payload.get("entries") or [] if isinstance(entry, dict) and not is_dan_log_entry(entry)]

    ensure_log_entry(
        entries,
        {
            "id": "manual-cleanup__5530da0c-f031-4392-b86e-bd1af72de752",
            "updatedAtUtc": manual_specs["5530da0c-f031-4392-b86e-bd1af72de752"]["updatedAtUtc"],
            "updatedBy": "HugoMarkoff",
            "countryIso3": "MULTI",
            "countryName": "Multiple scopes",
            "suggestionType": "manual_correction",
            "requestedCoverage": "countrywide",
            "itemId": "5530da0c-f031-4392-b86e-bd1af72de752",
            "matchedKey": clean_text(animals_by_id["5530da0c-f031-4392-b86e-bd1af72de752"].get("matchedKey")),
            "speciesLabel": cleaned_tracking_items["5530da0c-f031-4392-b86e-bd1af72de752"]["speciesLabel"],
            "sourceDataset": "taxonomy_release_new.txt + geofence_new.json",
            "files": ["data/review-overrides/geofence-binary-overrides.json"],
            "reason": manual_specs["5530da0c-f031-4392-b86e-bd1af72de752"]["reason"],
            "appliedScopes": ["CAN", "MEX", "USA-CA", "USA-OR", "USA-WA"],
        },
    )
    ensure_log_entry(
        entries,
        {
            "id": "manual-cleanup__a5121a63-c9d0-4849-8db7-e7d8bbf4e581",
            "updatedAtUtc": manual_specs["a5121a63-c9d0-4849-8db7-e7d8bbf4e581"]["updatedAtUtc"],
            "updatedBy": "HugoMarkoff",
            "countryIso3": "AUS",
            "countryName": "Australia",
            "suggestionType": "manual_correction",
            "requestedCoverage": "countrywide",
            "itemId": "a5121a63-c9d0-4849-8db7-e7d8bbf4e581",
            "matchedKey": clean_text(animals_by_id["a5121a63-c9d0-4849-8db7-e7d8bbf4e581"].get("matchedKey")),
            "speciesLabel": cleaned_tracking_items["a5121a63-c9d0-4849-8db7-e7d8bbf4e581"]["speciesLabel"],
            "sourceDataset": "taxonomy_release_new.txt + geofence_new.json",
            "files": ["data/review-overrides/geofence-binary-overrides.json"],
            "reason": manual_specs["a5121a63-c9d0-4849-8db7-e7d8bbf4e581"]["reason"],
            "appliedScopes": ["AUS"],
        },
    )

    change_log_payload["entries"] = entries
    change_log_payload["updatedAtUtc"] = now_utc_iso()

    write_json_if_changed(GEOFENCE_TRACKING_PATH, tracking_payload)
    write_json_if_changed(CHANGE_LOG_PATH, change_log_payload)
    removed_override_files = remove_dan_override_files()
    print(f"Removed legacy Dan override files: {removed_override_files}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())