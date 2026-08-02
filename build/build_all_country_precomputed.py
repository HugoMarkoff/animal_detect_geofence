#!/usr/bin/env python3
"""Build per-country precomputed packs for the web app.

This keeps Denmark's validated artifact when available and fills every other
country with a fast SpeciesNet baseline pack so the app can load instantly on
country switch.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
INPUT_PATH = ROOT / "web-plugin" / "data" / "animals-global.json"
OUTPUT_DIR = ROOT / "web-plugin" / "data" / "precomputed-countries"
INDEX_PATH = OUTPUT_DIR / "index.json"
LEGACY_DENMARK_PATH = ROOT / "web-plugin" / "data" / "precomputed-country-footprints.json"

COUNTRY_CATALOG_URL = "https://restcountries.com/v3.1/all?fields=cca3,name"
HTTP_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "GlobalFaunaRadar/1.0 (country precompute baseline)",
}
STATUS_TO_BUCKET = {
    "likely_true_both": "Likely Valid",
    "likely_true_one_source": "Likely Valid",
    "new_record": "New",
    "likely_false": "Needs Review",
    "unlisted": "Unlisted",
}
COUNTRY_PACK_ONLY_PROFILE = {
    "code": "country_pack_only",
    "label": "Whole pack coverage",
    "short": "Pack-wide",
}


def load_items() -> list[dict]:
    payload = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    return payload.get("items") or []


def load_country_names() -> dict[str, str]:
    request = Request(COUNTRY_CATALOG_URL, headers=HTTP_HEADERS)
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except Exception:  # noqa: BLE001
        return {}

    names: dict[str, str] = {}
    for row in payload or []:
        iso3 = str((row or {}).get("cca3") or "").strip()
        name = str((((row or {}).get("name") or {}).get("common")) or "").strip()
        if iso3:
            names[iso3] = name or iso3
    return names


def load_validated_payloads() -> dict[str, dict]:
    payloads: dict[str, dict] = {}
    candidate_paths = sorted(OUTPUT_DIR.glob("*.json")) + [LEGACY_DENMARK_PATH]
    for path in candidate_paths:
        if path.name == INDEX_PATH.name:
            continue
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue

        iso3 = str(payload.get("generatedFor") or "").strip()
        if not iso3 or iso3 in payloads:
            continue

        precompute_mode = str(payload.get("precomputeMode") or "").strip().lower()
        if precompute_mode != "validated":
            continue

        payload["precomputeMode"] = "validated"
        payloads[iso3] = payload
    return payloads


def build_pack_entry(item: dict, iso3: str, *, note: str = "") -> dict:
    profile = dict(COUNTRY_PACK_ONLY_PROFILE)
    profile["note"] = note or "Expected from the global dataset without a country-specific validation run yet."
    return {
        "itemId": item["id"],
        "countryIso3": iso3,
        "status": "likely_true_one_source",
        "bucket": "Likely Valid",
        "expected": True,
        "gbifPresent": True,
        "inatPresent": None,
        "gbifCount": None,
        "inatCount": None,
        "observationProfile": profile,
    }


def build_pack_summary(entries: list[dict]) -> dict:
    status_counts: Counter[str] = Counter()
    bucket_counts: Counter[str] = Counter()

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        status = str(entry.get("status") or "").strip()
        bucket = str(entry.get("bucket") or STATUS_TO_BUCKET.get(status) or "").strip()
        if status:
            status_counts[status] += 1
        if bucket:
            bucket_counts[bucket] += 1

    return {
        "total": len(entries),
        "statusCounts": dict(status_counts),
        "bucketCounts": dict(bucket_counts),
    }


def merge_expected_items_into_validated_payload(
    payload: dict,
    iso3: str,
    country_name: str,
    items: list[dict],
    generated_at_utc: str,
) -> dict:
    existing_entries = list(payload.get("entries") or [])
    existing_ids = {
        str((entry or {}).get("itemId") or "").strip()
        for entry in existing_entries
        if isinstance(entry, dict) and str((entry or {}).get("itemId") or "").strip()
    }

    missing_items = [
        item
        for item in sorted(items, key=lambda row: ((row.get("commonName") or "~").lower(), row.get("binomial") or "", row["id"]))
        if item["id"] not in existing_ids
    ]
    if not missing_items:
        return payload

    merged_entries = list(existing_entries)
    for item in missing_items:
        merged_entries.append(
            build_pack_entry(
                item,
                iso3,
                note="Expected from animals-global.json after the supported dataset scope expanded; this row has not been country-validated yet.",
            )
        )

    next_payload = dict(payload)
    next_payload["countryName"] = payload.get("countryName") or country_name
    next_payload["generatedAtUtc"] = generated_at_utc
    next_payload["sourceDataset"] = payload.get("sourceDataset") or "web-plugin/data/animals-global.json"
    next_payload["entries"] = merged_entries
    next_payload["summary"] = build_pack_summary(merged_entries)
    return next_payload


def build_baseline_payload(iso3: str, country_name: str, items: list[dict], generated_at_utc: str) -> dict:
    entries = [build_pack_entry(item, iso3) for item in sorted(items, key=lambda row: row["id"])]

    return {
        "generatedFor": iso3,
        "countryName": country_name,
        "generatedAtUtc": generated_at_utc,
        "sourceDataset": "web-plugin/data/animals-global.json",
        "precomputeMode": "baseline",
        "selectionMode": "expected-country",
        "candidateFile": None,
        "summary": build_pack_summary(entries),
        "entries": entries,
    }


def write_country_payload(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


def build_index_payload(country_rows: list[dict], generated_at_utc: str) -> dict:
    return {
        "generatedAtUtc": generated_at_utc,
        "sourceDataset": "web-plugin/data/animals-global.json",
        "countries": sorted(country_rows, key=lambda row: (row["countryName"], row["iso3"])),
    }


def main() -> None:
    items = load_items()
    country_names = load_country_names()
    validated_payloads = load_validated_payloads()
    generated_at_utc = datetime.now(timezone.utc).isoformat()

    items_by_country: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        for iso3 in item.get("expectedCountries") or []:
            items_by_country[str(iso3).strip()].append(item)

    all_iso3 = sorted(set(items_by_country) | set(validated_payloads))
    index_rows: list[dict] = []

    for index, iso3 in enumerate(all_iso3, start=1):
        payload = validated_payloads.get(iso3)
        if payload is None:
            payload = build_baseline_payload(
                iso3,
                country_names.get(iso3, iso3),
                items_by_country.get(iso3, []),
                generated_at_utc,
            )
        else:
            payload = merge_expected_items_into_validated_payload(
                dict(payload),
                iso3,
                country_names.get(iso3, iso3),
                items_by_country.get(iso3, []),
                generated_at_utc,
            )
            payload["precomputeMode"] = payload.get("precomputeMode") or "validated"

        output_path = OUTPUT_DIR / f"{iso3}.json"
        write_country_payload(output_path, payload)

        summary = payload.get("summary") or {}
        index_rows.append(
            {
                "iso3": iso3,
                "countryName": payload.get("countryName") or country_names.get(iso3, iso3),
                "path": f"./{iso3}.json",
                "precomputeMode": payload.get("precomputeMode") or "baseline",
                "total": summary.get("total") or len(payload.get("entries") or []),
                "bucketCounts": summary.get("bucketCounts") or {},
                "statusCounts": summary.get("statusCounts") or {},
            }
        )

        if index % 25 == 0 or index == len(all_iso3):
            print(f"Wrote {index}/{len(all_iso3)} country packs")

    index_payload = build_index_payload(index_rows, generated_at_utc)
    write_country_payload(INDEX_PATH, index_payload)

    mode_counts = Counter(row["precomputeMode"] for row in index_rows)
    print(f"Wrote index to {INDEX_PATH}")
    print(f"Validated packs: {mode_counts.get('validated', 0)}")
    print(f"Baseline packs: {mode_counts.get('baseline', 0)}")


if __name__ == "__main__":
    main()