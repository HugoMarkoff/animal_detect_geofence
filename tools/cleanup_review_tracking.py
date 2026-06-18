#!/usr/bin/env python3
"""Normalize shared review tracking and remove legacy Dan residue.

Shared geofence tracking should only keep decisions that affect the binary
country membership layer:

- removals
- national approvals for scopes that are newly accepted
- regional approvals

Country-local nationalizations of already-expected species stay only in the
per-country override files and the audit log.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from apply_country_overrides import (
    ANIMALS_PATH,
    GEOFENCE_TRACKING_PATH,
    OVERRIDES_DIR,
    PACK_DIR,
    ROOT,
    USA_PARENT_ISO3,
    clean_text,
    load_json_file,
    now_utc_iso,
    write_json_if_changed,
)


CHANGE_LOG_PATH = ROOT / "data" / "review-overrides" / "change-log.json"


def sorted_scope_map(scopes: set[str]) -> dict[str, bool]:
    return {scope: True for scope in sorted(scopes)}


def clean_scope_map(raw_mapping: object) -> dict[str, bool]:
    if not isinstance(raw_mapping, dict):
        return {}
    return {clean_text(scope).upper(): True for scope, enabled in raw_mapping.items() if clean_text(scope) and bool(enabled)}


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
    }


def sync_tracking_entry_identity(
    item: dict[str, Any],
    animals_by_id: dict[str, dict[str, Any]],
    item_id: str,
    source_dataset: str,
) -> dict[str, Any]:
    animal = animals_by_id.get(item_id)
    item["itemId"] = item_id
    if animal is not None:
        common_name = clean_text(animal.get("commonName"))
        binomial = clean_text(animal.get("binomial"))
        species_label = f"{common_name} ({binomial})" if common_name and binomial else common_name or binomial or item_id
        item["matchedKey"] = clean_text(animal.get("matchedKey"))
        item["speciesLabel"] = species_label
        item["commonName"] = common_name
        item["binomial"] = binomial
        item["classLabel"] = clean_text(animal.get("classLabel"))
    else:
        item.setdefault("matchedKey", "")
        item.setdefault("speciesLabel", item_id)
        item.setdefault("commonName", "")
        item.setdefault("binomial", "")
        item.setdefault("classLabel", "")

    if source_dataset and not clean_text(item.get("sourceDataset")):
        item["sourceDataset"] = source_dataset
    else:
        item["sourceDataset"] = clean_text(item.get("sourceDataset"))

    item["allow"] = clean_scope_map(item.get("allow"))
    item["block"] = clean_scope_map(item.get("block"))
    item["allow_regional"] = clean_scope_map(item.get("allow_regional"))
    return item


def is_dan_metadata(meta: object) -> bool:
    if not isinstance(meta, dict):
        return False
    return clean_text(meta.get("updatedBy")) == "Dan" or clean_text(meta.get("sourceDataset")) == "Corrections_DAN.json"


def clear_scope_decision(item: dict[str, Any], scope_iso3: str) -> None:
    for key in ("allow", "block", "allow_regional"):
        mapping = item.get(key)
        if not isinstance(mapping, dict):
            mapping = {}
            item[key] = mapping
        mapping.pop(scope_iso3, None)


def prune_tracking_item(raw_item: dict[str, Any]) -> dict[str, Any] | None:
    item = {
        "itemId": clean_text(raw_item.get("itemId")),
        "matchedKey": clean_text(raw_item.get("matchedKey")),
        "speciesLabel": clean_text(raw_item.get("speciesLabel")),
        "commonName": clean_text(raw_item.get("commonName")),
        "binomial": clean_text(raw_item.get("binomial")),
        "classLabel": clean_text(raw_item.get("classLabel")),
        "sourceDataset": clean_text(raw_item.get("sourceDataset")),
        "allow": clean_scope_map(raw_item.get("allow")),
        "block": clean_scope_map(raw_item.get("block")),
        "allow_regional": clean_scope_map(raw_item.get("allow_regional")),
    }
    if not item["allow"] and not item["block"] and not item["allow_regional"]:
        return None
    return item


def strip_dan_scopes(raw_item: dict[str, Any]) -> dict[str, Any] | None:
    item = prune_tracking_item(raw_item)
    if item is None:
        return None

    if clean_text(item.get("sourceDataset")) == "Corrections_DAN.json":
        return None

    metadata = raw_item.get("metadata") if isinstance(raw_item.get("metadata"), dict) else {}
    dan_scopes = {clean_text(scope).upper() for scope, meta in metadata.items() if is_dan_metadata(meta)}
    for scope_iso3 in dan_scopes:
        clear_scope_decision(item, scope_iso3)
    return prune_tracking_item(item)


def set_scope_decision(item: dict[str, Any], scope_iso3: str, *, decision: str, coverage: str) -> None:
    clear_scope_decision(item, scope_iso3)
    if decision == "block":
        item.setdefault("block", {})[scope_iso3] = True
        return

    item.setdefault("allow", {})[scope_iso3] = True
    if coverage == "regional":
        item.setdefault("allow_regional", {})[scope_iso3] = True


def ensure_tracking_entry(
    tracking_items: dict[str, dict[str, Any]],
    animals_by_id: dict[str, dict[str, Any]],
    item_id: str,
    source_dataset: str,
) -> dict[str, Any]:
    item = tracking_items.get(item_id)
    if item is None:
        item = build_tracking_entry(animals_by_id, item_id, source_dataset)
        tracking_items[item_id] = item
        return item
    return sync_tracking_entry_identity(item, animals_by_id, item_id, source_dataset)


def apply_manual_spec(
    tracking_items: dict[str, dict[str, Any]],
    animals_by_id: dict[str, dict[str, Any]],
    item_id: str,
    spec: dict[str, Any],
) -> None:
    item = ensure_tracking_entry(tracking_items, animals_by_id, item_id, clean_text(spec.get("sourceDataset")))

    for scope_iso3 in sorted(spec.get("allow_countries", set())):
        set_scope_decision(item, scope_iso3, decision="allow", coverage="national")

    for country_iso3 in sorted(spec.get("allow_regional_countries", set())):
        set_scope_decision(item, country_iso3, decision="allow", coverage="regional")

    for state_code in sorted(spec.get("allow_states", set())):
        set_scope_decision(item, f"{USA_PARENT_ISO3}-{state_code}", decision="allow", coverage="national")

    for scope_iso3 in sorted(spec.get("block_countries", set())):
        set_scope_decision(item, scope_iso3, decision="block", coverage="removed")

    for state_code in sorted(spec.get("block_states", set())):
        set_scope_decision(item, f"{USA_PARENT_ISO3}-{state_code}", decision="block", coverage="removed")

    next_item = prune_tracking_item(item)
    if next_item is None:
        tracking_items.pop(item_id, None)
    else:
        tracking_items[item_id] = next_item


def latest_manual_log_entries(change_log_payload: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    latest: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in change_log_payload.get("entries") or []:
        if not isinstance(entry, dict) or is_dan_log_entry(entry):
            continue
        key = (clean_text(entry.get("countryIso3")).upper(), clean_text(entry.get("itemId")))
        if key[0] and key[1]:
            latest[key] = entry
    return latest


def classify_local_override_for_shared_tracking(
    payload: dict[str, Any],
    change_log_entry: dict[str, Any] | None,
) -> tuple[str, str] | None:
    action = clean_text(payload.get("action") or "upsert").lower()
    if action == "remove":
        return "block", "removed"

    patch = payload.get("patch") if isinstance(payload.get("patch"), dict) else {}
    expected = patch.get("expected")
    observation_profile = patch.get("observationProfile") if isinstance(patch.get("observationProfile"), dict) else {}
    coverage_code = clean_text(observation_profile.get("code")).lower()
    requested_coverage = clean_text((change_log_entry or {}).get("requestedCoverage")).lower()
    suggestion_type = clean_text((change_log_entry or {}).get("suggestionType")).lower()
    shared_geofence = (change_log_entry or {}).get("sharedGeofence") if isinstance(change_log_entry, dict) else None

    if shared_geofence is False:
        return None

    if requested_coverage == "regional" or coverage_code == "regional":
        return "allow", "regional"

    if shared_geofence is True:
        return "allow", "national"

    if suggestion_type in {"addition", "accept_new"}:
        return "allow", "national"

    if expected is False:
        return "allow", "national"

    return None


def sync_local_override_scopes(
    tracking_items: dict[str, dict[str, Any]],
    animals_by_id: dict[str, dict[str, Any]],
    latest_log_by_scope: dict[tuple[str, str], dict[str, Any]],
) -> dict[str, int]:
    stats = {"shared": 0, "local_only": 0}

    for path in sorted(OVERRIDES_DIR.glob("*/*.json")):
        payload = load_json_file(path)
        if not isinstance(payload, dict) or is_dan_override_payload(payload):
            continue

        item_id = clean_text(payload.get("itemId") or path.stem)
        country_iso3 = clean_text(payload.get("countryIso3") or path.parent.name).upper()
        if not item_id or not country_iso3 or item_id not in animals_by_id:
            continue

        item = tracking_items.get(item_id)
        if item is not None:
            clear_scope_decision(item, country_iso3)
            next_item = prune_tracking_item(item)
            if next_item is None:
                tracking_items.pop(item_id, None)
            else:
                tracking_items[item_id] = next_item

        decision = classify_local_override_for_shared_tracking(
            payload,
            latest_log_by_scope.get((country_iso3, item_id)),
        )
        if decision is None:
            stats["local_only"] += 1
            continue

        shared_item = ensure_tracking_entry(
            tracking_items,
            animals_by_id,
            item_id,
            path.relative_to(ROOT).as_posix(),
        )
        set_scope_decision(shared_item, country_iso3, decision=decision[0], coverage=decision[1])
        tracking_items[item_id] = prune_tracking_item(shared_item) or shared_item
        stats["shared"] += 1

    return stats


def load_supported_country_scopes() -> set[str]:
    scopes: set[str] = set()
    for path in sorted(PACK_DIR.glob("*.json")):
        scope = path.stem
        if scope == "index" or scope.startswith(f"{USA_PARENT_ISO3}-"):
            continue
        scopes.add(scope)
    return scopes


def enforce_explicit_country_blocks(
    tracking_items: dict[str, dict[str, Any]],
    block_specs: dict[str, set[str]],
) -> None:
    supported_country_scopes = load_supported_country_scopes()
    for item_id, allow_countries in block_specs.items():
        item = tracking_items.get(item_id)
        if item is None:
            continue
        block = item.get("block") if isinstance(item.get("block"), dict) else {}
        next_block_scopes = (set(block) | (supported_country_scopes - allow_countries)) - allow_countries
        item["block"] = sorted_scope_map(next_block_scopes)


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
    for raw_item_id, raw_item in raw_tracking_items.items():
        if not isinstance(raw_item, dict):
            continue
        item_id = clean_text(raw_item.get("itemId") or raw_item_id)
        next_item = strip_dan_scopes(raw_item)
        if next_item is not None:
            cleaned_tracking_items[item_id] = sync_tracking_entry_identity(
                next_item,
                animals_by_id,
                item_id,
                clean_text(next_item.get("sourceDataset")),
            )

    change_log_payload = load_json_file(CHANGE_LOG_PATH)
    latest_log_by_scope = latest_manual_log_entries(change_log_payload)
    sync_stats = sync_local_override_scopes(cleaned_tracking_items, animals_by_id, latest_log_by_scope)
    enforce_explicit_country_blocks(
        cleaned_tracking_items,
        {
            "a5121a63-c9d0-4849-8db7-e7d8bbf4e581": {"AUS"},
        },
    )

    manual_specs: dict[str, dict[str, Any]] = {}

    for item_id, spec in manual_specs.items():
        apply_manual_spec(cleaned_tracking_items, animals_by_id, item_id, spec)

    ordered_tracking_items = {
        item_id: cleaned_tracking_items[item_id]
        for item_id in sorted(cleaned_tracking_items)
    }
    tracking_payload["items"] = ordered_tracking_items
    tracking_payload["updatedAtUtc"] = now_utc_iso()

    original_entries = [entry for entry in change_log_payload.get("entries") or [] if isinstance(entry, dict)]
    entries = [entry for entry in original_entries if not is_dan_log_entry(entry)]

    change_log_payload["entries"] = entries
    if entries != original_entries:
        change_log_payload["updatedAtUtc"] = now_utc_iso()

    write_json_if_changed(GEOFENCE_TRACKING_PATH, tracking_payload)
    write_json_if_changed(CHANGE_LOG_PATH, change_log_payload)
    removed_override_files = remove_dan_override_files()
    print(
        "Normalized shared review tracking: "
        f"{sync_stats['shared']} shared override scopes, "
        f"{sync_stats['local_only']} local-only override scopes, "
        f"removed {removed_override_files} legacy Dan override files."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())