from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
COUNTRY_VALIDATION_DIR = WORKSPACE_ROOT / "country-validation"
OUTPUT_DIR = REPO_ROOT / "data" / "systematic-review"
RANKINGS_PATH = COUNTRY_VALIDATION_DIR / "top200_needs_review_all_248.csv"
PROPOSALS_PATH = COUNTRY_VALIDATION_DIR / "systematic_review_proposals.json"
LOG_PATH = COUNTRY_VALIDATION_DIR / "systematic_review_log.json"
ANIMALS_PATH = REPO_ROOT / "data" / "animals-global.json"


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


def species_label(animal: dict[str, Any] | None, fallback: str) -> str:
    if not animal:
        return fallback

    common_name = clean_text(animal.get("commonName"))
    binomial = clean_text(animal.get("binomial"))
    if common_name and binomial:
        return f"{common_name} ({binomial})"
    return common_name or binomial or fallback


def normalize_country_codes(raw_codes: Any) -> list[str]:
    if not isinstance(raw_codes, list):
        return []
    seen: set[str] = set()
    normalized: list[str] = []
    for value in raw_codes:
        iso3 = clean_text(value).upper()
        if len(iso3) != 3 or iso3 in seen:
            continue
        seen.add(iso3)
        normalized.append(iso3)
    return normalized


def load_rankings() -> list[dict[str, Any]]:
    rankings: list[dict[str, Any]] = []
    with RANKINGS_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            item_id = clean_text(row.get("itemId"))
            if not item_id:
                continue
            try:
                rank = int(clean_text(row.get("rank")) or "0")
            except ValueError:
                rank = 0
            try:
                country_count = int(clean_text(row.get("countryCount")) or "0")
            except ValueError:
                country_count = 0
            rankings.append(
                {
                    "rank": rank,
                    "itemId": item_id,
                    "commonName": clean_text(row.get("commonName")),
                    "binomial": clean_text(row.get("binomial")),
                    "countryCount": country_count,
                }
            )
    return rankings


def load_animals_by_id() -> dict[str, dict[str, Any]]:
    payload = load_json(ANIMALS_PATH)
    by_id: dict[str, dict[str, Any]] = {}
    for item in payload.get("items", []):
        item_id = clean_text(item.get("id"))
        if item_id:
            by_id[item_id] = item
    return by_id


def build_catalog(item_ids: list[str], animals_by_id: dict[str, dict[str, Any]], rankings_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    for item_id in item_ids:
        animal = animals_by_id.get(item_id) or {}
        ranking = rankings_by_id.get(item_id) or {}
        fallback = clean_text(ranking.get("commonName")) or clean_text(ranking.get("binomial")) or item_id
        items.append(
            {
                "itemId": item_id,
                "label": species_label(animal or None, fallback),
                "commonName": clean_text(animal.get("commonName")) or clean_text(ranking.get("commonName")),
                "binomial": clean_text(animal.get("binomial")) or clean_text(ranking.get("binomial")),
                "classLabel": clean_text(animal.get("classLabel")),
                "matchedKey": clean_text(animal.get("matchedKey")),
                "expectedCountries": normalize_country_codes(animal.get("expectedCountries")),
            }
        )

    return {
        "schemaVersion": 1,
        "updatedAtUtc": now_utc_iso(),
        "items": items,
    }


def build_flagged_country_index(item_ids: set[str]) -> dict[str, Any]:
    flagged_by_item: dict[str, set[str]] = {item_id: set() for item_id in item_ids}

    for child in sorted(COUNTRY_VALIDATION_DIR.iterdir()):
        if not child.is_dir():
            continue

        iso3 = clean_text(child.name).upper()
        if len(iso3) != 3:
            continue

        validation_path = child / "species_validation.csv"
        if not validation_path.exists():
            continue

        with validation_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                item_id = clean_text(row.get("itemId"))
                if item_id not in flagged_by_item:
                    continue
                expected = clean_text(row.get("expected")).lower() == "true"
                bucket = clean_text(row.get("bucket"))
                if expected and bucket == "Needs Review":
                    flagged_by_item[item_id].add(iso3)

    return {
        "schemaVersion": 1,
        "updatedAtUtc": now_utc_iso(),
        "items": {
            item_id: sorted(countries)
            for item_id, countries in sorted(flagged_by_item.items())
            if countries
        },
    }


def main() -> None:
    rankings = load_rankings()
    proposals = load_json(PROPOSALS_PATH)
    log_payload = load_json(LOG_PATH)
    animals_by_id = load_animals_by_id()
    rankings_by_id = {entry["itemId"]: entry for entry in rankings}
    item_ids = [entry["itemId"] for entry in rankings]

    write_json(
        OUTPUT_DIR / "rankings.json",
        {
            "schemaVersion": 1,
            "updatedAtUtc": now_utc_iso(),
            "issues": rankings,
        },
    )
    write_json(OUTPUT_DIR / "proposals.json", proposals)
    write_json(OUTPUT_DIR / "log.json", log_payload)
    write_json(OUTPUT_DIR / "catalog.json", build_catalog(item_ids, animals_by_id, rankings_by_id))
    write_json(OUTPUT_DIR / "flagged-review-countries.json", build_flagged_country_index(set(item_ids)))


if __name__ == "__main__":
    main()