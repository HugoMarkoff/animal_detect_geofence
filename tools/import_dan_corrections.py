#!/usr/bin/env python3
"""Import Dan's reviewed USA/CAN decisions into the publish override model.

This script materializes Corrections_DAN.json into the existing publish-side
review files instead of introducing a new runtime review layer. It updates:

- data/review-overrides/geofence-binary-overrides.json
- data/review-overrides/countries/<ISO3>/<ITEM_ID>.json
- data/review-overrides/change-log.json

The publish pack applier is then run twice so the second pass can prune or keep
country-pack entries against the freshly refreshed global expected-country set.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
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
    apply_item_country_overrides,
    clean_text,
    item_expected_in_scope,
    load_json_file,
    now_utc_iso,
    restore_pack_base,
    serialize_json,
    write_json_if_changed,
)


WORKSPACE_ROOT = ROOT.parent
DAN_DECISIONS_PATH = WORKSPACE_ROOT / "Corrections_DAN.json"
CHANGE_LOG_PATH = ROOT / "data" / "review-overrides" / "change-log.json"
APPLY_OVERRIDES_PATH = ROOT / "tools" / "apply_country_overrides.py"
LIKELY_VALID_STATUSES = {"likely_true_one_source", "likely_true_both"}


def load_json_or_default(path: Path, default: Any) -> Any:
    if not path.exists():
        return deepcopy(default)
    return load_json_file(path)


def normalize_taxon_text(value: object) -> str:
    return " ".join(str(value or "").strip().lower().replace("_", " ").split())


def normalize_taxon_key(value: object) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    parts = [segment.strip() for segment in raw.split(";") if segment.strip()]
    return ";".join(parts)


def safe_fragment(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "__", value).strip("_") or "import"


def species_label(animal: dict[str, Any] | None, fallback: str = "") -> str:
    if not isinstance(animal, dict):
        return fallback
    common_name = clean_text(animal.get("commonName"))
    binomial = clean_text(animal.get("binomial"))
    if common_name and binomial:
        return f"{common_name} ({binomial})"
    return common_name or binomial or fallback


def default_observation_profile(scope_iso3: str) -> dict[str, Any]:
    scope = clean_text(scope_iso3).upper()
    if scope.startswith(f"{USA_PARENT_ISO3}-"):
        return {
            "code": "country_pack_only",
            "label": "State pack only",
            "short": "Pack-only",
            "note": "Imported from Dan's reviewed scope decisions.",
            "significant": False,
            "footprintPolygonLatLngs": [],
        }
    return {
        "code": "countrywide",
        "label": "National footprint",
        "short": "National",
        "note": "Imported from Dan's reviewed scope decisions.",
        "significant": False,
        "footprintPolygonLatLngs": [],
    }


def approved_status(base_entry: dict[str, Any] | None) -> str:
    current_status = clean_text((base_entry or {}).get("status"))
    if current_status in LIKELY_VALID_STATUSES:
        return current_status
    return "likely_true_one_source"


def build_allow_patch(scope_iso3: str, base_entry: dict[str, Any] | None) -> dict[str, Any]:
    observation_profile = (base_entry or {}).get("observationProfile")
    if not isinstance(observation_profile, dict) or not clean_text(observation_profile.get("code")):
        observation_profile = default_observation_profile(scope_iso3)
    else:
        observation_profile = deepcopy(observation_profile)

    return {
        "status": approved_status(base_entry),
        "expected": bool((base_entry or {}).get("expected")) if base_entry is not None else True,
        "observationProfile": observation_profile,
    }


def scope_coverage(scope_iso3: str, decision: str) -> str:
    if decision == "block":
        return "removed"
    if clean_text(scope_iso3).upper().startswith(f"{USA_PARENT_ISO3}-"):
        return "statewide"
    return "national"


def decision_phrase(record: dict[str, Any]) -> str:
    proposal_action = clean_text(record.get("proposalAction"))
    outcome = clean_text(record.get("outcome"))
    if proposal_action == "custom":
        return "custom scope rules"
    if proposal_action and outcome:
        return f"{outcome} {proposal_action}"
    return outcome or proposal_action or "review import"


def summarize_sources(records: list[dict[str, Any]]) -> str:
    if not records:
        return "Imported from Corrections_DAN.json."

    if len(records) == 1:
        record = records[0]
        description = clean_text(record.get("description"))
        notes = clean_text(record.get("notes"))
        if description:
            return f"Imported Dan custom review: {description}"
        if notes:
            return f"Imported Dan review: {decision_phrase(record)}. {notes}"
        return f"Imported Dan review: {decision_phrase(record)}."

    phrases = sorted({decision_phrase(record) for record in records if decision_phrase(record)})
    if phrases:
        preview = ", ".join(phrases[:4])
        if len(phrases) > 4:
            preview = f"{preview}, and {len(phrases) - 4} more"
        return f"Imported {len(records)} Dan review decisions ({preview})."
    return f"Imported {len(records)} Dan review decisions."


def build_override_reason(
    item_label: str,
    scope_iso3: str,
    scope_name: str,
    source_records: list[dict[str, Any]],
) -> str:
    summary = summarize_sources(source_records)
    return f"{summary} Effective scope for {item_label} in {scope_name} ({scope_iso3})."


def build_log_reason(item_label: str, source_records: list[dict[str, Any]]) -> str:
    summary = summarize_sources(source_records)
    return f"{summary} Effective imported scope for {item_label}."


def resolve_rule_scope(rule: dict[str, Any]) -> str:
    country = clean_text(rule.get("country")).upper()
    state = clean_text(rule.get("state")).upper()
    if not country:
        return ""
    if state:
        if country != USA_PARENT_ISO3:
            return ""
        return f"{country}-{state}"
    return country


def load_animals_index() -> tuple[dict[str, dict[str, Any]], dict[str, set[str]], dict[str, set[str]], dict[str, set[str]]]:
    payload = load_json_file(ANIMALS_PATH)
    items = payload.get("items") or []
    animals_by_id: dict[str, dict[str, Any]] = {}
    by_taxon_prefix: dict[str, set[str]] = defaultdict(set)
    by_binomial: dict[str, set[str]] = defaultdict(set)
    by_genus: dict[str, set[str]] = defaultdict(set)

    for raw_item in items:
        if not isinstance(raw_item, dict):
            continue
        item_id = clean_text(raw_item.get("id"))
        if not item_id:
            continue

        animals_by_id[item_id] = raw_item

        matched_key = normalize_taxon_key(raw_item.get("matchedKey"))
        if matched_key:
            parts = matched_key.split(";")
            for index in range(1, len(parts) + 1):
                by_taxon_prefix[";".join(parts[:index])].add(item_id)

        binomial = normalize_taxon_text(raw_item.get("binomial"))
        if binomial:
            by_binomial[binomial].add(item_id)
            genus = binomial.split(" ", 1)[0]
            if genus:
                by_genus[genus].add(item_id)

    return animals_by_id, by_taxon_prefix, by_binomial, by_genus


def resolve_rule_items(
    rule: dict[str, Any],
    by_taxon_prefix: dict[str, set[str]],
    by_binomial: dict[str, set[str]],
    by_genus: dict[str, set[str]],
) -> list[str]:
    taxon_level = clean_text(rule.get("taxonLevel")).lower()
    taxon_key = normalize_taxon_key(rule.get("taxonKey"))
    binomial = normalize_taxon_text(rule.get("binomial"))
    matches: set[str] = set()

    if taxon_key:
        matches.update(by_taxon_prefix.get(taxon_key, set()))

    if not matches and binomial:
        matches.update(by_binomial.get(binomial, set()))

    if not matches and taxon_level == "genus" and binomial:
        genus = binomial.split(" ", 1)[0]
        if genus:
            matches.update(by_genus.get(genus, set()))

    return sorted(matches)


def append_unique_error(errors: list[str], message: str) -> None:
    if message not in errors:
        errors.append(message)


def parse_decision_key(key: str) -> tuple[str, str, str, str]:
    parts = key.split(":")
    if len(parts) < 3:
        return clean_text(key), "", "", ""
    prefix = clean_text(parts[0]).lower()
    scope = clean_text(parts[1]).upper()
    action = clean_text(parts[2]).lower()
    item_id = clean_text(parts[3]) if len(parts) > 3 else ""
    return prefix, scope, action, item_id


def sort_decisions(raw_decisions: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    rows: list[tuple[int, str, dict[str, Any], str]] = []
    for index, (key, value) in enumerate(raw_decisions.items()):
        updated_at = clean_text((value or {}).get("updatedAt")) or f"zzzz-{index:06d}"
        rows.append((index, key, value if isinstance(value, dict) else {}, updated_at))
    rows.sort(key=lambda row: (row[3], row[0]))
    return [(key, value) for _, key, value, _ in rows]


def scope_snapshot(item_tracking: dict[str, Any] | None, scope_iso3: str) -> dict[str, Any] | None:
    if not isinstance(item_tracking, dict):
        return None
    allow = item_tracking.get("allow") if isinstance(item_tracking.get("allow"), dict) else {}
    block = item_tracking.get("block") if isinstance(item_tracking.get("block"), dict) else {}
    allow_regional = item_tracking.get("allow_regional") if isinstance(item_tracking.get("allow_regional"), dict) else {}
    metadata = item_tracking.get("metadata") if isinstance(item_tracking.get("metadata"), dict) else {}
    return {
        "allow": bool(allow.get(scope_iso3)),
        "block": bool(block.get(scope_iso3)),
        "allow_regional": bool(allow_regional.get(scope_iso3)),
        "metadata": deepcopy(metadata.get(scope_iso3)),
    }


def ensure_tracking_entry(
    tracking_items: dict[str, Any],
    animals_by_id: dict[str, dict[str, Any]],
    item_id: str,
) -> dict[str, Any]:
    item_tracking = tracking_items.get(item_id)
    if isinstance(item_tracking, dict):
        item_tracking.setdefault("allow", {})
        item_tracking.setdefault("block", {})
        item_tracking.setdefault("allow_regional", {})
        item_tracking.setdefault("metadata", {})
        return item_tracking

    animal = animals_by_id[item_id]
    next_tracking = {
        "itemId": item_id,
        "matchedKey": clean_text(animal.get("matchedKey")),
        "speciesLabel": species_label(animal, fallback=item_id),
        "commonName": clean_text(animal.get("commonName")),
        "binomial": clean_text(animal.get("binomial")),
        "classLabel": clean_text(animal.get("classLabel")),
        "sourceDataset": clean_text(animal.get("datasetSource")) or clean_text(animal.get("sourceDataset")) or "Corrections_DAN.json",
        "allow": {},
        "block": {},
        "allow_regional": {},
        "metadata": {},
    }
    tracking_items[item_id] = next_tracking
    return next_tracking


def project_item(item: dict[str, Any], item_tracking: dict[str, Any] | None) -> dict[str, Any]:
    next_expected, next_regional, next_subdivisions = apply_item_country_overrides(
        item.get("expectedCountries") or [],
        item.get("allowRegionalCountries") or [],
        item.get("expectedSubdivisions") or {},
        item_tracking,
    )
    projected = {
        "expectedCountries": next_expected,
        "allowRegionalCountries": next_regional,
    }
    if next_subdivisions:
        projected["expectedSubdivisions"] = next_subdivisions
    return projected


def derive_candidate_scopes(scopes: set[str]) -> list[str]:
    candidates = set(scopes)
    if any(scope.startswith(f"{USA_PARENT_ISO3}-") for scope in scopes):
        candidates.add(USA_PARENT_ISO3)
    return sorted(candidates)


def is_us_can_scope(scope_iso3: str) -> bool:
    scope = clean_text(scope_iso3).upper()
    return scope == "CAN" or scope == USA_PARENT_ISO3 or scope.startswith(f"{USA_PARENT_ISO3}-")


def desired_override_payload(
    item_id: str,
    scope_iso3: str,
    scope_name: str,
    final_expected: bool,
    base_entry: dict[str, Any] | None,
    source_records: list[dict[str, Any]],
    updated_at: str,
    reviewer: str,
    item_label: str,
) -> dict[str, Any] | None:
    if final_expected:
        needs_upsert = (
            base_entry is None
            or not bool(base_entry.get("expected"))
            or clean_text(base_entry.get("status")) not in LIKELY_VALID_STATUSES
        )
        if not needs_upsert:
            return None
        return {
            "countryIso3": scope_iso3,
            "itemId": item_id,
            "action": "upsert",
            "updatedBy": reviewer,
            "updatedAtUtc": updated_at,
            "reason": build_override_reason(item_label, scope_iso3, scope_name, source_records),
            "patch": build_allow_patch(scope_iso3, base_entry),
        }

    if base_entry is not None and not bool(base_entry.get("expected")):
        return {
            "countryIso3": scope_iso3,
            "itemId": item_id,
            "action": "remove",
            "updatedBy": reviewer,
            "updatedAtUtc": updated_at,
            "reason": build_override_reason(item_label, scope_iso3, scope_name, source_records),
        }
    return None


def write_json_text_if_changed(path: Path, payload: Any) -> bool:
    serialized = serialize_json(payload)
    previous = path.read_text(encoding="utf-8") if path.exists() else None
    if previous == serialized:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialized, encoding="utf-8")
    return True


def load_pack_info(pack_paths: dict[str, Path]) -> tuple[dict[str, dict[str, dict[str, Any]]], dict[str, str]]:
    base_entries_by_scope: dict[str, dict[str, dict[str, Any]]] = {}
    scope_names: dict[str, str] = {}

    for scope_iso3, path in pack_paths.items():
        pack = load_json_file(path)
        scope_names[scope_iso3] = clean_text(pack.get("countryName")) or scope_iso3
        base_pack = restore_pack_base(pack)
        entry_map: dict[str, dict[str, Any]] = {}
        for raw_entry in base_pack.get("entries") or []:
            if isinstance(raw_entry, dict) and clean_text(raw_entry.get("itemId")):
                entry_map[clean_text(raw_entry.get("itemId"))] = raw_entry
        base_entries_by_scope[scope_iso3] = entry_map

    return base_entries_by_scope, scope_names


def build_log_entry(
    item_id: str,
    animal: dict[str, Any] | None,
    source_records: list[dict[str, Any]],
    changed_scopes: set[str],
    changed_files: set[str],
) -> dict[str, Any]:
    applied_scopes = sorted(changed_scopes)
    primary_scope = applied_scopes[0] if len(applied_scopes) == 1 else "MULTI"
    scope_names = [record.get("scopeName") for record in source_records if clean_text(record.get("scopeName"))]
    country_name = scope_names[0] if len(set(scope_names)) == 1 and scope_names else "Multiple scopes"
    updated_at = max((clean_text(record.get("updatedAtUtc")) for record in source_records), default="") or now_utc_iso()
    safe_id = f"dan-import__{item_id}"

    return {
        "id": safe_id,
        "updatedAtUtc": updated_at,
        "updatedBy": "Dan",
        "countryIso3": primary_scope,
        "countryName": country_name,
        "suggestionType": "dan_import",
        "requestedCoverage": "mixed" if len(applied_scopes) != 1 else ("removed" if all(record.get("decision") == "block" for record in source_records) else "national"),
        "itemId": item_id,
        "matchedKey": clean_text((animal or {}).get("matchedKey")),
        "speciesLabel": species_label(animal, fallback=item_id),
        "sourceDataset": "Corrections_DAN.json",
        "files": sorted(changed_files),
        "reason": build_log_reason(species_label(animal, fallback=item_id), source_records),
        "appliedScopes": applied_scopes,
        "decisionKeys": sorted({clean_text(record.get("sourceKey")) for record in source_records if clean_text(record.get("sourceKey"))}),
        "decisionOutcomes": sorted({clean_text(record.get("outcome")) for record in source_records if clean_text(record.get("outcome"))}),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Dan's USA/CAN review decisions into the publish override files.")
    parser.add_argument("--dry-run", action="store_true", help="Summarize the import without writing files.")
    parser.add_argument("--reviewer", default="Dan", help="Name recorded in override files. Defaults to Dan.")
    args = parser.parse_args()

    decisions_payload = load_json_file(DAN_DECISIONS_PATH)
    raw_decisions = decisions_payload.get("decisions")
    if not isinstance(raw_decisions, dict):
        raise SystemExit(f"{DAN_DECISIONS_PATH} does not contain a decisions object.")

    animals_by_id, by_taxon_prefix, by_binomial, by_genus = load_animals_index()
    pack_paths = {
        path.stem.upper(): path
        for path in PACK_DIR.glob("*.json")
        if path.name != "index.json"
    }
    relevant_scopes = {scope_iso3 for scope_iso3 in pack_paths if is_us_can_scope(scope_iso3)}
    base_entries_by_scope, scope_names = load_pack_info(pack_paths)

    tracking_payload = load_json_or_default(
        GEOFENCE_TRACKING_PATH,
        {"schemaVersion": 1, "updatedAtUtc": None, "items": {}},
    )
    if not isinstance(tracking_payload, dict):
        raise SystemExit(f"{GEOFENCE_TRACKING_PATH} must contain a JSON object.")
    tracking_items = tracking_payload.get("items")
    if not isinstance(tracking_items, dict):
        tracking_items = {}
        tracking_payload["items"] = tracking_items

    existing_override_paths = {
        (path.parent.name.strip().upper(), path.stem.strip()): path
        for path in OVERRIDES_DIR.glob("*/*.json")
    }

    final_actions: dict[tuple[str, str], dict[str, Any]] = {}
    errors: list[str] = []
    skipped_systematic_rejects = 0

    for source_key, decision in sort_decisions(raw_decisions):
        prefix, scope_iso3, proposal_action, item_id = parse_decision_key(source_key)
        outcome = clean_text(decision.get("outcome")).lower()
        updated_at = clean_text(decision.get("updatedAt")) or now_utc_iso()
        notes = clean_text(decision.get("notes"))
        common_name = clean_text(decision.get("commonName"))

        if outcome == "reject" and prefix == "systematic":
            skipped_systematic_rejects += 1
            continue

        if outcome == "custom":
            custom = decision.get("custom") if isinstance(decision.get("custom"), dict) else {}
            description = clean_text(custom.get("description"))
            for decision_name, bucket_name in (("block", "blockRules"), ("allow", "allowRules")):
                rules = custom.get(bucket_name)
                if not isinstance(rules, list):
                    continue
                for raw_rule in rules:
                    if not isinstance(raw_rule, dict):
                        continue
                    matched_scope = resolve_rule_scope(raw_rule)
                    if matched_scope and matched_scope not in relevant_scopes:
                        continue
                    if not matched_scope:
                        append_unique_error(
                            errors,
                            f"Unsupported custom scope in {source_key}: {json.dumps(raw_rule, ensure_ascii=True)}",
                        )
                        continue
                    matched_items = resolve_rule_items(raw_rule, by_taxon_prefix, by_binomial, by_genus)
                    if not matched_items and clean_text(raw_rule.get("taxonLevel")).lower() == "species" and item_id in animals_by_id:
                        matched_items = [item_id]
                    if not matched_items:
                        append_unique_error(
                            errors,
                            f"No current published item matched Dan rule in {source_key}: "
                            f"taxonLevel={clean_text(raw_rule.get('taxonLevel'))} "
                            f"taxonKey={clean_text(raw_rule.get('taxonKey'))} "
                            f"binomial={clean_text(raw_rule.get('binomial'))}"
                        )
                        continue

                    for matched_item_id in matched_items:
                        final_actions[(matched_item_id, matched_scope)] = {
                            "itemId": matched_item_id,
                            "scope": matched_scope,
                            "decision": decision_name,
                            "sourceKey": source_key,
                            "proposalAction": "custom",
                            "outcome": outcome,
                            "updatedAtUtc": updated_at,
                            "notes": notes,
                            "description": description,
                            "commonName": common_name,
                        }
            continue

        if prefix not in {"canada", "usa", "usa_state"}:
            continue
        if scope_iso3 not in relevant_scopes:
            continue
        if not item_id:
            append_unique_error(errors, f"Decision key {source_key} does not include an item id.")
            continue
        if proposal_action not in {"add", "remove"}:
            append_unique_error(errors, f"Decision key {source_key} uses unsupported action '{proposal_action}'.")
            continue
        if outcome not in {"accept", "reject"}:
            append_unique_error(errors, f"Decision key {source_key} uses unsupported outcome '{outcome}'.")
            continue

        final_decision = "allow" if (proposal_action == "add") == (outcome == "accept") else "block"
        final_actions[(item_id, scope_iso3)] = {
            "itemId": item_id,
            "scope": scope_iso3,
            "decision": final_decision,
            "sourceKey": source_key,
            "proposalAction": proposal_action,
            "outcome": outcome,
            "updatedAtUtc": updated_at,
            "notes": notes,
            "description": "",
            "commonName": common_name,
        }

    missing_items = sorted({record["itemId"] for record in final_actions.values() if record["itemId"] not in animals_by_id})
    if missing_items:
        for missing_item in missing_items[:20]:
            append_unique_error(
                errors,
                f"Item {missing_item} from Dan decisions is missing from {ANIMALS_PATH.relative_to(ROOT).as_posix()}.",
            )

    if errors:
        preview = "\n".join(f"- {message}" for message in errors[:40])
        if len(errors) > 40:
            preview = f"{preview}\n- ... and {len(errors) - 40} more"
        raise SystemExit(f"Cannot import Dan decisions until these issues are resolved:\n{preview}")

    actions_by_item: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    source_records_by_item: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for (item_id, scope_iso3), record in sorted(final_actions.items()):
        actions_by_item[item_id][scope_iso3] = record
    for item_id, scoped_records in actions_by_item.items():
        for record in scoped_records.values():
            source_records_by_item[item_id].append(record)

    changed_scopes_by_item: dict[str, set[str]] = defaultdict(set)
    changed_files_by_item: dict[str, set[str]] = defaultdict(set)
    tracking_scope_changes = 0

    for item_id, scoped_records in actions_by_item.items():
        item_tracking_before = deepcopy(tracking_items.get(item_id)) if isinstance(tracking_items.get(item_id), dict) else None
        item_tracking = ensure_tracking_entry(tracking_items, animals_by_id, item_id)
        animal = animals_by_id[item_id]

        for scope_iso3, record in sorted(scoped_records.items()):
            previous_scope = scope_snapshot(item_tracking_before, scope_iso3)
            allow = item_tracking.get("allow") if isinstance(item_tracking.get("allow"), dict) else {}
            block = item_tracking.get("block") if isinstance(item_tracking.get("block"), dict) else {}
            allow_regional = item_tracking.get("allow_regional") if isinstance(item_tracking.get("allow_regional"), dict) else {}
            metadata = item_tracking.get("metadata") if isinstance(item_tracking.get("metadata"), dict) else {}

            allow.pop(scope_iso3, None)
            block.pop(scope_iso3, None)
            allow_regional.pop(scope_iso3, None)

            if record["decision"] == "allow":
                allow[scope_iso3] = True
            else:
                block[scope_iso3] = True

            scope_name = scope_names.get(scope_iso3, scope_iso3)
            record["scopeName"] = scope_name
            metadata_entry = {
                "decision": record["decision"],
                "coverage": scope_coverage(scope_iso3, record["decision"]),
                "sourceDataset": "Corrections_DAN.json",
                "decisionKey": record["sourceKey"],
                "decisionOutcome": record["outcome"],
                "proposalAction": record["proposalAction"],
                "updatedBy": args.reviewer,
                "updatedAtUtc": record["updatedAtUtc"],
                "reason": build_override_reason(
                    species_label(animal, fallback=item_id),
                    scope_iso3,
                    scope_name,
                    [record],
                ),
            }
            metadata[scope_iso3] = metadata_entry

            item_tracking["allow"] = allow
            item_tracking["block"] = block
            item_tracking["allow_regional"] = allow_regional
            item_tracking["metadata"] = metadata

            current_scope = scope_snapshot(item_tracking, scope_iso3)
            if previous_scope != current_scope:
                changed_scopes_by_item[item_id].add(scope_iso3)
                changed_files_by_item[item_id].add(GEOFENCE_TRACKING_PATH.relative_to(ROOT).as_posix())
                tracking_scope_changes += 1

        if not item_tracking.get("allow") and not item_tracking.get("block") and not item_tracking.get("allow_regional") and not item_tracking.get("metadata"):
            tracking_items.pop(item_id, None)

    override_writes = 0
    override_deletes = 0

    for item_id, scoped_records in actions_by_item.items():
        animal = animals_by_id[item_id]
        projected_item = project_item(animal, tracking_items.get(item_id))
        candidate_scopes = derive_candidate_scopes(set(scoped_records))
        updated_at = max((clean_text(record.get("updatedAtUtc")) for record in source_records_by_item[item_id]), default="") or now_utc_iso()
        item_label = species_label(animal, fallback=item_id)

        for scope_iso3 in candidate_scopes:
            if scope_iso3 not in relevant_scopes:
                continue

            final_expected = item_expected_in_scope(projected_item, scope_iso3)
            base_entry = base_entries_by_scope.get(scope_iso3, {}).get(item_id)
            scope_name = scope_names.get(scope_iso3, scope_iso3)
            desired_payload = desired_override_payload(
                item_id,
                scope_iso3,
                scope_name,
                final_expected,
                base_entry,
                source_records_by_item[item_id],
                updated_at,
                args.reviewer,
                item_label,
            )

            override_path = OVERRIDES_DIR / scope_iso3 / f"{item_id}.json"
            relative_override_path = override_path.relative_to(ROOT).as_posix()

            if desired_payload is None:
                if override_path.exists():
                    changed_scopes_by_item[item_id].add(scope_iso3)
                    changed_files_by_item[item_id].add(relative_override_path)
                    if not args.dry_run:
                        override_path.unlink()
                    override_deletes += 1
                continue

            changed_scopes_by_item[item_id].add(scope_iso3)
            changed_files_by_item[item_id].add(relative_override_path)
            serialized_override = serialize_json(desired_payload)
            if args.dry_run:
                previous_override = override_path.read_text(encoding="utf-8") if override_path.exists() else None
                if previous_override != serialized_override:
                    override_writes += 1
                continue

            if write_json_text_if_changed(override_path, desired_payload):
                override_writes += 1

    changed_items = {
        item_id
        for item_id in actions_by_item
        if changed_scopes_by_item.get(item_id) or changed_files_by_item.get(item_id)
    }

    log_entries_upserted = 0
    if changed_items and not args.dry_run:
        change_log_payload = load_json_or_default(
            CHANGE_LOG_PATH,
            {"schemaVersion": 1, "updatedAtUtc": None, "entries": []},
        )
        entries = change_log_payload.get("entries") if isinstance(change_log_payload.get("entries"), list) else []
        entries_by_id = {
            clean_text(entry.get("id")): index
            for index, entry in enumerate(entries)
            if isinstance(entry, dict) and clean_text(entry.get("id"))
        }

        for item_id in sorted(changed_items):
            entry = build_log_entry(
                item_id,
                animals_by_id.get(item_id),
                source_records_by_item[item_id],
                changed_scopes_by_item[item_id],
                changed_files_by_item[item_id],
            )
            existing_index = entries_by_id.get(clean_text(entry.get("id")))
            if existing_index is None:
                entries.append(entry)
            else:
                entries[existing_index] = entry
            log_entries_upserted += 1

        change_log_payload["entries"] = entries
        change_log_payload["updatedAtUtc"] = now_utc_iso()
        write_json_if_changed(CHANGE_LOG_PATH, change_log_payload)

    tracking_changed = bool(changed_items)
    if tracking_changed and not args.dry_run:
        tracking_payload["updatedAtUtc"] = now_utc_iso()
        write_json_if_changed(GEOFENCE_TRACKING_PATH, tracking_payload)

    touched_scopes = sorted({scope for item_id in changed_items for scope in changed_scopes_by_item[item_id] if scope in pack_paths})

    print(f"Dan decisions loaded: {len(raw_decisions)}")
    print(f"Systematic rejects skipped: {skipped_systematic_rejects}")
    print(f"Effective item/scope actions: {len(final_actions)}")
    print(f"Touched items: {len(changed_items)}")
    print(f"Tracking scope updates: {tracking_scope_changes}")
    print(f"Override writes planned: {override_writes}")
    print(f"Override deletes planned: {override_deletes}")
    print(f"Touched pack scopes: {len(touched_scopes)}")

    if args.dry_run:
        preview = ", ".join(touched_scopes[:12])
        if len(touched_scopes) > 12:
            preview = f"{preview}, ..."
        if preview:
            print(f"Touched scopes preview: {preview}")
        print("Dry run complete; no files were written.")
        return 0

    if changed_items:
        for pass_index in (1, 2):
            completed = subprocess.run(
                [sys.executable, str(APPLY_OVERRIDES_PATH)],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
            if completed.returncode != 0:
                raise SystemExit(
                    f"apply_country_overrides.py pass {pass_index} failed.\n"
                    f"stdout:\n{completed.stdout.strip()}\n\n"
                    f"stderr:\n{completed.stderr.strip()}"
                )
            print(f"apply_country_overrides.py pass {pass_index} completed.")

    print(f"Change-log entries updated: {log_entries_upserted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())