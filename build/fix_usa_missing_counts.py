#!/usr/bin/env python3
"""Re-query GBIF and iNat for USA expected species that have empty counts.

Reads country-validation/USA/species_validation.csv, finds rows where
expected=True but gbifCount is empty, re-fetches the counts, recomputes
status, and writes the corrected CSV back.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "country-validation" / "USA" / "species_validation.csv"

GBIF_ISO2 = "US"
INAT_PLACE_ID = 1  # USA on iNat

HTTP_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "GlobalFaunaRadar/1.0 (usa-count-repair)",
}
HTTP_TIMEOUT = 15
HTTP_RETRIES = 4
INAT_MIN_INTERVAL_SECONDS = 0.3

_inat_lock = threading.Lock()
_inat_last_call = 0.0

CURRENT_YEAR = datetime.now(timezone.utc).year
RECENT_WILD_START_YEAR = CURRENT_YEAR - 10 + 1
RECENT_GBIF_YEAR_RANGE = f"{RECENT_WILD_START_YEAR},{CURRENT_YEAR}"
RECENT_WILD_START_DATE = f"{RECENT_WILD_START_YEAR}-01-01"


def wait_for_inat_slot():
    global _inat_last_call
    with _inat_lock:
        elapsed = time.monotonic() - _inat_last_call
        if elapsed < INAT_MIN_INTERVAL_SECONDS:
            time.sleep(INAT_MIN_INTERVAL_SECONDS - elapsed)
        _inat_last_call = time.monotonic()


def url_json(base_url: str, params: dict, *, rate_limited: bool = False) -> object:
    query = urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{base_url}?{query}"
    last_error = None

    for attempt in range(HTTP_RETRIES):
        if rate_limited:
            wait_for_inat_slot()
        req = Request(url, headers=HTTP_HEADERS)
        try:
            with urlopen(req, timeout=HTTP_TIMEOUT) as response:
                return json.load(response)
        except HTTPError as e:
            last_error = e
            if e.code in {429, 500, 502, 503, 504} and attempt + 1 < HTTP_RETRIES:
                wait = 5.0 * (attempt + 1) if e.code == 429 else 1.5 * (attempt + 1)
                print(f"    HTTP {e.code}, waiting {wait:.1f}s …", flush=True)
                time.sleep(wait)
            else:
                raise
        except (URLError, Exception) as e:
            last_error = e
            if attempt + 1 < HTTP_RETRIES:
                time.sleep(1.5 * (attempt + 1))
            else:
                raise

    raise last_error


def get_gbif_count(usage_key: int | None) -> int | None:
    if not usage_key:
        return None
    try:
        payload = url_json(
            "https://api.gbif.org/v1/occurrence/search",
            {"country": GBIF_ISO2, "taxonKey": usage_key, "limit": 0},
        )
    except Exception:
        return None
    return int(payload.get("count") or 0) if isinstance(payload, dict) else None


def get_inat_count(taxon_id: int | None) -> int | None:
    if not taxon_id:
        return None
    try:
        payload = url_json(
            "https://api.inaturalist.org/v1/observations",
            {
                "taxon_id": taxon_id,
                "place_id": INAT_PLACE_ID,
                "quality_grade": "research",
                "verifiable": "true",
                "per_page": 1,
            },
            rate_limited=True,
        )
    except Exception:
        return None
    return int(payload.get("total_results") or 0) if isinstance(payload, dict) else None


def numeric_count(count: int | None) -> int:
    return count if isinstance(count, int) and count >= 0 else 0


def has_sufficient_expected_evidence(gbif_count: int | None, inat_count: int | None) -> bool:
    gbif = numeric_count(gbif_count)
    inat = numeric_count(inat_count)
    total = gbif + inat
    if total <= 1:
        return False
    if gbif >= 1 and inat >= 1:
        return True
    if gbif >= 2 or inat >= 2:
        return True
    return False


def compute_status(expected: bool, gbif_present: bool | None, inat_present: bool | None,
                   gbif_count: int | None, inat_count: int | None) -> str:
    if expected:
        if not has_sufficient_expected_evidence(gbif_count, inat_count):
            return "likely_false"
        if gbif_present is True and inat_present is True:
            return "likely_true_both"
        if gbif_present is True or inat_present is True:
            return "likely_true_one_source"
        return "likely_false"
    # unexpected species
    gbif = numeric_count(gbif_count)
    inat = numeric_count(inat_count)
    total = gbif + inat
    if (gbif_present is True or inat_present is True) and total >= 8:
        return "new_record"
    return "unlisted"


STATUS_BUCKETS = {
    "likely_true_both": "Likely Valid",
    "likely_true_one_source": "Likely Valid",
    "new_record": "New",
    "likely_false": "Needs Review",
    "unlisted": "Unlisted",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Repair missing USA species counts")
    parser.add_argument(
        "--with-inat",
        action="store_true",
        help="Also query iNaturalist counts (slower). By default only GBIF is queried.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    rows = list(csv.DictReader(CSV_PATH.open(newline="")))
    fieldnames = list(rows[0].keys()) if rows else []

    # Find rows to fix: expected=True and empty gbifCount
    to_fix = [
        (i, r) for i, r in enumerate(rows)
        if r.get("expected", "").lower() == "true" and not r.get("gbifCount", "").strip()
    ]

    mode = "GBIF + iNat" if args.with_inat else "GBIF-only"
    print(f"Found {len(to_fix)} expected USA species with empty counts. Re-querying ({mode}) …")

    fixed = 0
    failed_gbif = 0
    failed_both = 0

    for n, (idx, row) in enumerate(to_fix, 1):
        binomial = row.get("binomial", "?")
        gbif_key_raw = row.get("gbifUsageKey", "").strip()
        inat_id_raw = row.get("inatTaxonId", "").strip()

        gbif_key = int(gbif_key_raw) if gbif_key_raw.isdigit() else None
        inat_id = int(inat_id_raw) if inat_id_raw.isdigit() else None

        if n % 50 == 1:
            print(f"  [{n}/{len(to_fix)}] {binomial} …", flush=True)

        gbif_count = get_gbif_count(gbif_key)
        inat_count = get_inat_count(inat_id) if args.with_inat else None

        if gbif_count is None and inat_count is None:
            failed_both += 1
        elif gbif_count is None:
            failed_gbif += 1

        gbif_present = (gbif_count is not None and gbif_count > 0) if gbif_count is not None else None
        inat_present = (inat_count is not None and inat_count > 0) if inat_count is not None else None

        status = compute_status(True, gbif_present, inat_present, gbif_count, inat_count)
        bucket = STATUS_BUCKETS.get(status, "Needs Review")

        # Update row in place
        rows[idx]["gbifCount"] = str(gbif_count) if gbif_count is not None else ""
        rows[idx]["inatCount"] = str(inat_count) if inat_count is not None else ""
        rows[idx]["gbifPresent"] = str(gbif_present) if gbif_present is not None else ""
        rows[idx]["inatPresent"] = str(inat_present) if inat_present is not None else ""
        rows[idx]["status"] = status
        rows[idx]["bucket"] = bucket

        fixed += 1

        # Small pause to avoid aggressive API bursts.
        time.sleep(0.05)

    print(f"\nDone. Fixed {fixed} rows. GBIF failed: {failed_gbif}. Both failed: {failed_both}.")

    # Write back
    with CSV_PATH.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote updated CSV to {CSV_PATH}")

    # Summary
    updated_rows = list(csv.DictReader(CSV_PATH.open(newline="")))
    expected_rows = [r for r in updated_rows if r.get("expected", "").lower() == "true"]
    from collections import Counter
    bucket_counts = Counter(r.get("bucket", "") for r in expected_rows)
    print("\nUpdated expected-species bucket counts:")
    for b, c in sorted(bucket_counts.items(), key=lambda x: -x[1]):
        print(f"  {b}: {c}")


if __name__ == "__main__":
    main()
