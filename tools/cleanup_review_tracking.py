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

    manual_specs: dict[str, dict[str, Any]] = {
        "429257d4-3ef2-47fb-b849-66ee6c107346": {
            "sourceDataset": "data/review-overrides/countries/DNK/429257d4-3ef2-47fb-b849-66ee6c107346.json",
            "updatedBy": "HugoMarkoff",
            "updatedAtUtc": "2026-06-09T07:09:33.520049Z",
            "reason": "Backfilled the existing Denmark regional moose approval into the shared binary change file so the fresh change baseline includes the current reviewed regional exception.",
            "allow_countries": {"DNK"},
            "allow_regional_countries": {"DNK"},
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

    change_log_payload["entries"] = entries
    change_log_payload["updatedAtUtc"] = now_utc_iso()

    write_json_if_changed(GEOFENCE_TRACKING_PATH, tracking_payload)
    write_json_if_changed(CHANGE_LOG_PATH, change_log_payload)
    removed_override_files = remove_dan_override_files()
    print(f"Removed legacy Dan override files: {removed_override_files}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())