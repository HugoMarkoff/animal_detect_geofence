from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
PRECOMPUTED_COUNTRIES_DIR = DATA_DIR / "precomputed-countries"
OUTPUT_DIR = DATA_DIR / "review-exports"
ANIMALS_PATH = DATA_DIR / "animals-global.json"

STATUS_TO_BUCKET = {
    "likely_true_both": "Likely Valid",
    "likely_true_one_source": "Likely Valid",
    "likely_false": "Needs Review",
    "needs_review": "Needs Review",
    "new_record": "New",
    "unlisted": "Unlisted",
}


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")


def load_animals_by_id() -> dict[str, dict[str, Any]]:
    payload = load_json(ANIMALS_PATH)
    by_id: dict[str, dict[str, Any]] = {}
    for item in payload.get("items", []):
        item_id = clean_text(item.get("id") or item.get("itemId"))
        if item_id:
            by_id[item_id] = item
    return by_id


def species_sort_key(species: dict[str, Any]) -> tuple[str, str, str]:
    return (
        clean_text(species.get("commonName") or species.get("label")).lower(),
        clean_text(species.get("binomial")).lower(),
        clean_text(species.get("itemId")).lower(),
    )


def species_summary(item_id: str, animals_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    animal = animals_by_id.get(item_id) or {}
    common_name = clean_text(animal.get("commonName"))
    binomial = clean_text(animal.get("binomial"))
    label = common_name
    if common_name and binomial:
        label = f"{common_name} ({binomial})"
    elif not label:
        label = binomial or item_id

    return {
        "itemId": item_id,
        "label": label,
        "commonName": common_name,
        "binomial": binomial,
        "classLabel": clean_text(animal.get("classLabel")),
    }


def resolve_bucket(entry: dict[str, Any]) -> str:
    explicit_bucket = clean_text(entry.get("bucket"))
    if explicit_bucket:
        return explicit_bucket
    return STATUS_TO_BUCKET.get(clean_text(entry.get("status")), "Needs Review")


def build_pack_action_export(pack_path: Path, animals_by_id: dict[str, dict[str, Any]], generated_at: str) -> dict[str, Any]:
    payload = load_json(pack_path)
    add_suggestions: list[dict[str, Any]] = []
    remove_suggestions: list[dict[str, Any]] = []

    for raw_entry in payload.get("entries", []):
        item_id = clean_text(raw_entry.get("itemId"))
        if not item_id:
            continue

        bucket = resolve_bucket(raw_entry)
        if bucket not in {"New", "Needs Review"}:
            continue

        observation_profile = raw_entry.get("observationProfile") if isinstance(raw_entry.get("observationProfile"), dict) else {}
        item = {
            **species_summary(item_id, animals_by_id),
            "status": clean_text(raw_entry.get("status")),
            "bucket": bucket,
            "expected": bool(raw_entry.get("expected")),
            "footprintCode": clean_text(observation_profile.get("code")),
            "footprintLabel": clean_text(observation_profile.get("label")),
        }
        if bucket == "New":
            add_suggestions.append(item)
        else:
            remove_suggestions.append(item)

    add_suggestions.sort(key=species_sort_key)
    remove_suggestions.sort(key=species_sort_key)

    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    bucket_counts = summary.get("bucketCounts") if isinstance(summary.get("bucketCounts"), dict) else {}

    return {
        "schemaVersion": 1,
        "generatedAtUtc": generated_at,
        "generatedFor": clean_text(payload.get("generatedFor")) or pack_path.stem,
        "countryName": clean_text(payload.get("countryName")),
        "sourceFiles": [f"data/precomputed-countries/{pack_path.name}"],
        "summary": {
            "total": int(summary.get("total") or 0),
            "packBucketCounts": bucket_counts,
            "suggestedAddCount": len(add_suggestions),
            "suggestedRemoveCount": len(remove_suggestions),
        },
        "addSuggestions": add_suggestions,
        "removeSuggestions": remove_suggestions,
    }


def build_usa_state_exports(animals_by_id: dict[str, dict[str, Any]], generated_at: str) -> dict[str, Any]:
    state_payloads: list[dict[str, Any]] = []
    for pack_path in sorted(PRECOMPUTED_COUNTRIES_DIR.glob("USA-*.json")):
        state_payloads.append(build_pack_action_export(pack_path, animals_by_id, generated_at))

    return {
        "schemaVersion": 1,
        "generatedAtUtc": generated_at,
        "sourceFiles": ["data/precomputed-countries/USA-*.json"],
        "stateCount": len(state_payloads),
        "states": state_payloads,
    }


def main() -> None:
    generated_at = now_utc_iso()
    animals_by_id = load_animals_by_id()
    write_json(
        OUTPUT_DIR / "CAN-review-actions.json",
        build_pack_action_export(PRECOMPUTED_COUNTRIES_DIR / "CAN.json", animals_by_id, generated_at),
    )
    write_json(
        OUTPUT_DIR / "USA-review-actions.json",
        build_pack_action_export(PRECOMPUTED_COUNTRIES_DIR / "USA.json", animals_by_id, generated_at),
    )
    write_json(
        OUTPUT_DIR / "USA-state-review-actions.json",
        build_usa_state_exports(animals_by_id, generated_at),
    )


if __name__ == "__main__":
    main()