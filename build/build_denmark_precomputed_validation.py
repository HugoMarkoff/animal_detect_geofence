#!/usr/bin/env python3
"""Build validated precomputed country data for the web app.

This script started as the Denmark validator and now supports any country while
keeping Denmark as the default. It reads the generated global animals dataset,
cross-checks each species against GBIF and iNaturalist for the selected
country, computes the same status/footprint heuristics used by the web app,
and writes a validated precomputed country payload plus audit artifacts.
"""

from __future__ import annotations

import argparse
import copy
import csv
import fcntl
import json
import math
import os
import tempfile
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
INPUT_PATH = ROOT / "web-plugin" / "data" / "animals-global.json"
OUTPUT_PATH = ROOT / "web-plugin" / "data" / "precomputed-countries" / "DNK.json"
LEGACY_OUTPUT_PATH = ROOT / "web-plugin" / "data" / "precomputed-country-footprints.json"
AUDIT_CSV_PATH = ROOT / "denmark_species_validation.csv"
NEW_CSV_PATH = ROOT / "denmark_new_candidates.csv"
SUMMARY_PATH = ROOT / "denmark_precomputed_validation_summary.txt"
COUNTRY_ARTIFACTS_DIR = ROOT / "country-validation"
COUNTRY_EXCLUSION_DIR = COUNTRY_ARTIFACTS_DIR / "manual-exclusions"

DEFAULT_COUNTRY = {
    "iso3": "DNK",
    "iso2": "DK",
    "name": "Denmark",
    "area_km2": 43094.0,
    "inat_place_id": 8051,
}
COUNTRY = dict(DEFAULT_COUNTRY)
REST_COUNTRIES_FIELDS = "cca2,cca3,name,area,region,subregion"

HTTP_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "GlobalFaunaRadar/1.0 (local country precompute)",
}
HTTP_TIMEOUT = 20
HTTP_RETRIES = 6
INAT_MIN_INTERVAL_SECONDS = 0.25
INAT_RATE_STATE_PATH = Path(tempfile.gettempdir()) / "global_fauna_radar_inat_rate_limit.txt"

PROFILE_GBIF_POINT_LIMIT = 90
PROFILE_INAT_POINT_LIMIT = 18
FOOTPRINT_CLUSTER_LINK_KM = 40
FOOTPRINT_SIGNIFICANT_CLUSTER_SHARE = 0.1
FOOTPRINT_SIGNIFICANT_CLUSTER_MIN_POINTS = 5
FOOTPRINT_NATIONAL_SPREAD_POINT_COUNT = 5
FOOTPRINT_NATIONAL_SPREAD_RATIO = 0.55
FOOTPRINT_REGIONAL_MAX_COVERAGE_RATIO = 0.05
FOOTPRINT_REGIONAL_MIN_POINTS = 10
RECENT_WILD_EVIDENCE_YEARS = 10
CURRENT_YEAR = datetime.now(timezone.utc).year
RECENT_WILD_START_YEAR = CURRENT_YEAR - RECENT_WILD_EVIDENCE_YEARS + 1
RECENT_WILD_START_DATE = f"{RECENT_WILD_START_YEAR}-01-01"
RECENT_GBIF_YEAR_RANGE = f"{RECENT_WILD_START_YEAR},{CURRENT_YEAR}"
GBIF_RECENT_WILD_BASIS = ("HUMAN_OBSERVATION", "MACHINE_OBSERVATION", "OBSERVATION")
GBIF_SPECIMEN_OR_SAMPLE_BASIS = {
    "PRESERVED_SPECIMEN",
    "MATERIAL_SAMPLE",
    "MATERIAL_CITATION",
    "LIVING_SPECIMEN",
    "FOSSIL_SPECIMEN",
}

STATUS_BUCKETS = {
    "likely_true_both": "Likely Valid",
    "likely_true_one_source": "Likely Valid",
    "new_record": "New",
    "likely_false": "Needs Review",
    "unlisted": "Unlisted",
}
NEW_BUCKET_FOOTPRINT_CODES = {"countrywide", "regional"}

PROGRESS_LOCK = threading.Lock()
INAT_RATE_LOCK = threading.Lock()
INAT_LAST_REQUEST_AT = 0.0
HTTP_CACHE_LOCK = threading.Lock()
HTTP_JSON_CACHE: dict[str, object] = {}
EXPECTED_COUNTRY_BASELINE_ENTRIES: dict[str, dict] = {}
EXPECTED_COUNTRY_BASELINE_AUDIT: dict[str, dict[str, str]] = {}
PREINDEX_MIN_SUPPORTED_ITEMS = 40
PREINDEX_SUPPORTED_CLASSES = {"aves", "mammalia"}
GBIF_CLASS_KEYS = {"aves": 212, "mammalia": 359}
INAT_ICONIC_TAXA = {"aves": "Aves", "mammalia": "Mammalia"}
COUNTRY_GBIF_PREINDEX_READY = False
COUNTRY_INAT_PREINDEX_READY = False
COUNTRY_GBIF_RAW_COUNTS: dict[int, int] = {}
COUNTRY_GBIF_RECENT_WILD_COUNTS: dict[int, int] = {}
COUNTRY_INAT_COUNTS: dict[int, int] = {}
COUNTRY_INAT_RECENT_WILD_COUNTS: dict[int, int] = {}
COUNTRY_GBIF_RAW_BINOMIALS: set[str] = set()
COUNTRY_INAT_RAW_BINOMIALS: set[str] = set()
COUNTRY_MIGRATORY_BIRD_BINOMIALS: dict[str, set[str]] = {
    "DNK": {
        "prunella collaris",
        "anas rubripes",
        "falco sparverius",
        "ciconia nigra",
        "nycticorax nycticorax",
        "hieraaetus pennatus",
        "bubulcus ibis",
        "spatula cyanoptera",
        "aquila heliaca",
        "upupa epops",
        "burhinus oedicnemus",
        "merops apiaster",
        "hydrobates pelagicus",
        "anser albifrons",
        "tringa melanoleuca",
        "catharus guttatus",
        "limnodromus scolopaceus",
        "buteo rufinus",
        "tarsiger cyanurus",
        "pernis ptilorhynchus",
        "turdus torquatus",
        "aythya collaris",
        "actitis macularius",
        "aquila nipalensis",
        "ciconia ciconia",
        "zonotrichia albicollis",
    },
    "CAN": {
        "anser brachyrhynchus",
        "ardea cinerea",
        "corvus ossifragus",
        "egretta caerulea",
        "eudocimus albus",
        "grus grus",
        "himantopus mexicanus",
        "larus fuscus",
        "myiarchus cinerascens",
        "nyctanassa violacea",
        "passerina caerulea",
        "platalea ajaja",
        "tarsiger cyanurus",
        "tringa melanoleuca",
        "turdus iliacus",
        "turdus pilaris",
        "tyrannus forficatus",
        "tyrannus melancholicus",
        "tyrannus savana",
        "tyrannus vociferans",
        "zenaida asiatica",
    }
}


def default_output_paths(country_iso3: str) -> dict[str, Path | None]:
    normalized_iso3 = (country_iso3 or DEFAULT_COUNTRY["iso3"]).strip().upper()
    output_path = ROOT / "web-plugin" / "data" / "precomputed-countries" / f"{normalized_iso3}.json"
    if normalized_iso3 == DEFAULT_COUNTRY["iso3"]:
        return {
            "output": OUTPUT_PATH,
            "legacy_output": LEGACY_OUTPUT_PATH,
            "audit_csv": AUDIT_CSV_PATH,
            "new_csv": NEW_CSV_PATH,
            "summary": SUMMARY_PATH,
        }

    artifact_dir = COUNTRY_ARTIFACTS_DIR / normalized_iso3
    return {
        "output": output_path,
        "legacy_output": None,
        "audit_csv": artifact_dir / "species_validation.csv",
        "new_csv": artifact_dir / "new_candidates.csv",
        "summary": artifact_dir / "precomputed_validation_summary.txt",
    }


def normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def numeric_count(value: object) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)) and math.isfinite(value):
        return int(value)
    return 0


def parse_optional_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return int(value)

    text = str(value or "").strip()
    if not text:
        return None
    if text.isdigit() or (text.startswith("-") and text[1:].isdigit()):
        return int(text)

    try:
        parsed = float(text)
    except ValueError:
        return None
    return int(parsed) if math.isfinite(parsed) else None


def parse_optional_bool(value: object) -> bool | None:
    text = normalize(str(value or ""))
    if text == "true":
        return True
    if text == "false":
        return False
    return None


def total_evidence_count(validation: dict) -> int:
    return numeric_count(validation.get("gbifCount")) + numeric_count(validation.get("inatCount"))


def format_count(value: int | float | None) -> str:
    if value is None:
        return "Unknown"
    return str(int(value))


def normalize_species_name(value: object) -> str | None:
    text = normalize(str(value or ""))
    if not text or " " not in text:
        return None
    return " ".join(text.split()[:2])


def scope_record_label() -> str:
    return "state" if normalize(COUNTRY.get("unit_type")) == "state" else "country"


def gbif_scope_params(extra_params: dict[str, object] | None = None) -> dict[str, object]:
    params: dict[str, object] = {
        "country": COUNTRY["iso2"],
    }
    state_name = str(COUNTRY.get("gbif_state_name") or "").strip()
    if state_name:
        params["stateProvince"] = state_name
    if extra_params:
        params.update(extra_params)
    return params


def build_item_tags(item: dict, bucket: str, expected: bool) -> list[str]:
    if bucket != "New":
        return []

    tags: list[str] = []
    binomial = normalize(item.get("binomial"))
    if normalize(item.get("class")) == "aves" and binomial in COUNTRY_MIGRATORY_BIRD_BINOMIALS.get(COUNTRY["iso3"], set()):
        tags.append("migratory bird")

    return tags


def extract_year(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and math.isfinite(value):
        year = int(value)
        return year if 1000 <= year <= 9999 else None

    text = str(value or "").strip()
    if len(text) >= 4 and text[:4].isdigit():
        year = int(text[:4])
        return year if 1000 <= year <= 9999 else None
    return None


def is_recent_wild_evidence(year_value: object, date_value: object = None) -> bool:
    year = extract_year(year_value)
    if year is None:
        year = extract_year(date_value)
    return year is not None and year >= RECENT_WILD_START_YEAR


def wait_for_inat_slot() -> None:
    global INAT_LAST_REQUEST_AT
    with INAT_RATE_LOCK:
        now = time.monotonic()
        wait_seconds = INAT_MIN_INTERVAL_SECONDS - (now - INAT_LAST_REQUEST_AT)
        if wait_seconds > 0:
            time.sleep(wait_seconds)

        INAT_RATE_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with INAT_RATE_STATE_PATH.open("a+", encoding="utf-8") as state_handle:
            fcntl.flock(state_handle.fileno(), fcntl.LOCK_EX)
            state_handle.seek(0)
            raw_value = state_handle.read().strip()
            try:
                last_request_at = float(raw_value) if raw_value else 0.0
            except ValueError:
                last_request_at = 0.0

            now_wall = time.time()
            wait_seconds = INAT_MIN_INTERVAL_SECONDS - (now_wall - last_request_at)
            if wait_seconds > 0:
                time.sleep(wait_seconds)
                now_wall = time.time()

            state_handle.seek(0)
            state_handle.truncate()
            state_handle.write(f"{now_wall:.6f}\n")
            state_handle.flush()
            os.fsync(state_handle.fileno())
            fcntl.flock(state_handle.fileno(), fcntl.LOCK_UN)

        INAT_LAST_REQUEST_AT = time.monotonic()


def url_json(base_url: str, params: dict[str, object], *, rate_limited: bool = False) -> object:
    query = urlencode(sorted((key, value) for key, value in params.items() if value is not None))
    url = f"{base_url}?{query}"

    with HTTP_CACHE_LOCK:
        cached = HTTP_JSON_CACHE.get(url)
    if cached is not None:
        return copy.deepcopy(cached)

    last_error: Exception | None = None

    for attempt in range(HTTP_RETRIES):
        if rate_limited:
            wait_for_inat_slot()
        request = Request(url, headers=HTTP_HEADERS)
        try:
            with urlopen(request, timeout=HTTP_TIMEOUT) as response:
                payload = json.load(response)
            with HTTP_CACHE_LOCK:
                HTTP_JSON_CACHE[url] = copy.deepcopy(payload)
            return payload
        except HTTPError as error:
            last_error = error
            if error.code in {429, 500, 502, 503, 504} and attempt + 1 < HTTP_RETRIES:
                if error.code == 429:
                    time.sleep(min(30.0, 3.0 * (2 ** attempt)))
                else:
                    time.sleep(min(20.0, 1.5 * (2 ** attempt)))
                continue
            raise
        except URLError as error:
            last_error = error
            if attempt + 1 < HTTP_RETRIES:
                time.sleep(min(20.0, 1.5 * (2 ** attempt)))
                continue
            raise
        except Exception as error:  # noqa: BLE001
            last_error = error
            if attempt + 1 < HTTP_RETRIES:
                time.sleep(min(20.0, 1.5 * (2 ** attempt)))
                continue
            raise

    assert last_error is not None
    raise last_error


def resolve_inat_country_place_id(country_iso3: str, country_name: str) -> int | None:
    try:
        payload = url_json(
            "https://api.inaturalist.org/v1/places/autocomplete",
            {"q": country_name, "per_page": 10},
            rate_limited=True,
        )
    except Exception:  # noqa: BLE001
        return None

    results = payload.get("results") or [] if isinstance(payload, dict) else []
    preferred = next(
        (candidate for candidate in results if isinstance(candidate, dict) and candidate.get("admin_level") == 0),
        None,
    )
    if preferred is None:
        preferred = next(
            (
                candidate
                for candidate in results
                if isinstance(candidate, dict) and "country" in normalize(candidate.get("place_type_name"))
            ),
            None,
        )
    if preferred is None and results:
        preferred = results[0]

    place_id = preferred.get("id") if isinstance(preferred, dict) else None
    if isinstance(place_id, int):
        return place_id
    if isinstance(place_id, str) and place_id.isdigit():
        return int(place_id)
    return None


def resolve_country_metadata(country_iso3: str) -> dict[str, object]:
    normalized_iso3 = (country_iso3 or DEFAULT_COUNTRY["iso3"]).strip().upper()
    try:
        payload = url_json(
            f"https://restcountries.com/v3.1/alpha/{normalized_iso3}",
            {"fields": REST_COUNTRIES_FIELDS},
        )
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Could not load metadata for country '{normalized_iso3}': {exc}") from exc

    row = payload[0] if isinstance(payload, list) and payload else payload
    if not isinstance(row, dict):
        raise SystemExit(f"Could not parse metadata for country '{normalized_iso3}'.")

    iso2 = str(row.get("cca2") or "").strip().upper()
    iso3 = str(row.get("cca3") or normalized_iso3).strip().upper()
    name = str((((row.get("name") or {}).get("common")) or iso3)).strip() or iso3
    area = row.get("area")
    area_km2 = float(area) if isinstance(area, (int, float)) and math.isfinite(area) else 0.0

    if not iso2 or not area_km2:
        raise SystemExit(f"Country metadata for '{iso3}' is missing ISO2 or area information.")

    return {
        "iso3": iso3,
        "iso2": iso2,
        "name": name,
        "area_km2": area_km2,
        "inat_place_id": resolve_inat_country_place_id(iso3, name),
        "region": str(row.get("region") or "").strip(),
        "subregion": str(row.get("subregion") or "").strip(),
    }


def country_preindex_classes(items: list[dict]) -> list[str]:
    supported_classes = sorted({normalize(item.get("class")) for item in items if normalize(item.get("class")) in PREINDEX_SUPPORTED_CLASSES})
    supported_item_count = sum(1 for item in items if normalize(item.get("class")) in PREINDEX_SUPPORTED_CLASSES)
    if supported_item_count < PREINDEX_MIN_SUPPORTED_ITEMS:
        return []
    return supported_classes


def fetch_gbif_species_facet_counts(class_key: int, extra_params: dict[str, object] | None = None) -> dict[int, int]:
    counts: dict[int, int] = {}
    facet_limit = 1000
    facet_offset = 0

    while True:
        params = gbif_scope_params(
            {
            "classKey": class_key,
            "limit": 0,
            "facet": "speciesKey",
            "facetLimit": facet_limit,
            "facetOffset": facet_offset,
            }
        )
        if extra_params:
            params.update(extra_params)

        payload = url_json("https://api.gbif.org/v1/occurrence/search", params)
        facets = payload.get("facets") or [] if isinstance(payload, dict) else []
        facet = facets[0] if facets else {}
        page_counts = facet.get("counts") or [] if isinstance(facet, dict) else []
        if not page_counts:
            break

        for row in page_counts:
            if not isinstance(row, dict):
                continue
            usage_key = parse_optional_int(row.get("name"))
            count = parse_optional_int(row.get("count"))
            if usage_key is None or count is None:
                continue
            counts[usage_key] = counts.get(usage_key, 0) + count

        if len(page_counts) < facet_limit:
            break
        facet_offset += len(page_counts)

    return counts


def fetch_gbif_species_binomial(usage_key: int) -> str | None:
    try:
        payload = url_json(f"https://api.gbif.org/v1/species/{usage_key}", {})
    except Exception:  # noqa: BLE001
        return None

    if not isinstance(payload, dict):
        return None

    for candidate in (payload.get("species"), payload.get("canonicalName"), payload.get("scientificName")):
        species_name = normalize_species_name(candidate)
        if species_name:
            return species_name
    return None


def fetch_gbif_species_binomials(usage_keys: set[int]) -> set[str]:
    if not usage_keys:
        return set()

    binomials: set[str] = set()
    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = {executor.submit(fetch_gbif_species_binomial, usage_key): usage_key for usage_key in usage_keys}
        for future in as_completed(futures):
            species_name = future.result()
            if species_name:
                binomials.add(species_name)

    return binomials


def fetch_inat_species_counts(
    iconic_taxon: str,
    *,
    recent_wild_only: bool,
    observed_binomials: set[str] | None = None,
) -> dict[int, int]:
    counts: dict[int, int] = {}
    page = 1
    per_page = 200

    while True:
        params: dict[str, object] = {
            "place_id": COUNTRY["inat_place_id"],
            "iconic_taxa": iconic_taxon,
            "quality_grade": "research",
            "verifiable": "true",
            "per_page": per_page,
            "page": page,
        }
        if recent_wild_only:
            params["d1"] = RECENT_WILD_START_DATE
            params["captive"] = "false"

        payload = url_json(
            "https://api.inaturalist.org/v1/observations/species_counts",
            params,
            rate_limited=True,
        )
        results = payload.get("results") or [] if isinstance(payload, dict) else []
        if not results:
            break

        for row in results:
            if not isinstance(row, dict):
                continue
            taxon = row.get("taxon") or {}
            if not isinstance(taxon, dict) or normalize(taxon.get("rank")) != "species":
                continue
            if observed_binomials is not None:
                species_name = normalize_species_name(taxon.get("name"))
                if species_name:
                    observed_binomials.add(species_name)
            taxon_id = parse_optional_int(taxon.get("id"))
            count = parse_optional_int(row.get("count"))
            if taxon_id is None or count is None:
                continue
            counts[taxon_id] = count

        if len(results) < per_page:
            break
        page += 1

    return counts


def build_country_evidence_preindex(items: list[dict]) -> None:
    global COUNTRY_GBIF_PREINDEX_READY
    global COUNTRY_INAT_PREINDEX_READY
    global COUNTRY_GBIF_RAW_COUNTS
    global COUNTRY_GBIF_RECENT_WILD_COUNTS
    global COUNTRY_INAT_COUNTS
    global COUNTRY_INAT_RECENT_WILD_COUNTS
    global COUNTRY_GBIF_RAW_BINOMIALS
    global COUNTRY_INAT_RAW_BINOMIALS

    COUNTRY_GBIF_PREINDEX_READY = False
    COUNTRY_INAT_PREINDEX_READY = False
    COUNTRY_GBIF_RAW_COUNTS = {}
    COUNTRY_GBIF_RECENT_WILD_COUNTS = {}
    COUNTRY_INAT_COUNTS = {}
    COUNTRY_INAT_RECENT_WILD_COUNTS = {}
    COUNTRY_GBIF_RAW_BINOMIALS = set()
    COUNTRY_INAT_RAW_BINOMIALS = set()

    classes = country_preindex_classes(items)
    if not classes:
        return

    print(f"Preloading country evidence for classes: {', '.join(classes)}")

    try:
        gbif_raw_counts: Counter[int] = Counter()
        gbif_recent_counts: Counter[int] = Counter()
        for class_name in classes:
            class_key = GBIF_CLASS_KEYS[class_name]
            gbif_raw_counts.update(fetch_gbif_species_facet_counts(class_key))
            for basis in GBIF_RECENT_WILD_BASIS:
                gbif_recent_counts.update(
                    fetch_gbif_species_facet_counts(
                        class_key,
                        {
                            "basisOfRecord": basis,
                            "year": RECENT_GBIF_YEAR_RANGE,
                            "occurrenceStatus": "PRESENT",
                        },
                    )
                )
        COUNTRY_GBIF_RAW_COUNTS = dict(gbif_raw_counts)
        COUNTRY_GBIF_RECENT_WILD_COUNTS = dict(gbif_recent_counts)
        COUNTRY_GBIF_RAW_BINOMIALS = fetch_gbif_species_binomials(set(COUNTRY_GBIF_RAW_COUNTS))
        COUNTRY_GBIF_PREINDEX_READY = True
        print(
            "Loaded GBIF country counts for "
            f"{len(COUNTRY_GBIF_RAW_COUNTS)} raw taxa and {len(COUNTRY_GBIF_RECENT_WILD_COUNTS)} recent wild taxa"
        )
    except Exception as exc:  # noqa: BLE001
        COUNTRY_GBIF_RAW_COUNTS = {}
        COUNTRY_GBIF_RECENT_WILD_COUNTS = {}
        COUNTRY_GBIF_RAW_BINOMIALS = set()
        print(f"GBIF country preindex unavailable, falling back to per-species lookups: {exc}")

    if not COUNTRY["inat_place_id"]:
        return

    try:
        inat_counts: Counter[int] = Counter()
        inat_recent_counts: Counter[int] = Counter()
        inat_raw_binomials: set[str] = set()
        for class_name in classes:
            iconic_taxon = INAT_ICONIC_TAXA[class_name]
            inat_counts.update(
                fetch_inat_species_counts(
                    iconic_taxon,
                    recent_wild_only=False,
                    observed_binomials=inat_raw_binomials,
                )
            )
            inat_recent_counts.update(fetch_inat_species_counts(iconic_taxon, recent_wild_only=True))
        COUNTRY_INAT_COUNTS = dict(inat_counts)
        COUNTRY_INAT_RECENT_WILD_COUNTS = dict(inat_recent_counts)
        COUNTRY_INAT_RAW_BINOMIALS = inat_raw_binomials
        COUNTRY_INAT_PREINDEX_READY = True
        print(
            "Loaded iNaturalist country counts for "
            f"{len(COUNTRY_INAT_COUNTS)} raw taxa and {len(COUNTRY_INAT_RECENT_WILD_COUNTS)} recent wild taxa"
        )
    except Exception as exc:  # noqa: BLE001
        COUNTRY_INAT_COUNTS = {}
        COUNTRY_INAT_RECENT_WILD_COUNTS = {}
        COUNTRY_INAT_RAW_BINOMIALS = set()
        print(f"iNaturalist country preindex unavailable, falling back to per-species lookups: {exc}")


def country_observed_binomials() -> set[str]:
    return set(COUNTRY_GBIF_RAW_BINOMIALS) | set(COUNTRY_INAT_RAW_BINOMIALS)


def resolve_gbif_usage_key(binomial: str) -> int | None:
    try:
        payload = url_json(
            "https://api.gbif.org/v1/species/match",
            {"name": binomial, "strict": "true"},
        )
    except Exception:  # noqa: BLE001
        return None

    if not isinstance(payload, dict):
        return None

    rank = normalize(payload.get("rank"))
    match_type = normalize(payload.get("matchType"))
    match_status = normalize(payload.get("status"))
    canonical_name = normalize(payload.get("canonicalName"))
    scientific_name = normalize(payload.get("scientificName"))
    species_name = normalize(payload.get("species"))
    expected_name = normalize(binomial)
    exact_name = (
        canonical_name == expected_name
        or species_name == expected_name
        or scientific_name == expected_name
        or scientific_name.startswith(f"{expected_name} ")
    )

    if rank != "species" or match_type in {"higherrank", "none"} or not exact_name:
        return None

    # Reject synonym matches that GBIF resolves to a different accepted species.
    if match_status == "synonym" and species_name and species_name != expected_name:
        return None

    usage_key = payload.get("speciesKey") or payload.get("usageKey")
    return int(usage_key) if isinstance(usage_key, int) else None


def resolve_inat_taxon_id(binomial: str) -> int | None:
    try:
        payload = url_json(
            "https://api.inaturalist.org/v1/taxa/autocomplete",
            {"q": binomial, "rank": "species", "per_page": 8},
            rate_limited=True,
        )
    except Exception:  # noqa: BLE001
        return None

    if not isinstance(payload, dict):
        return None

    results = payload.get("results") or []
    pick = None
    for candidate in results:
        if normalize(candidate.get("name")) == normalize(binomial) or normalize(candidate.get("matched_term")) == normalize(binomial):
            pick = candidate
            break

    taxon_id = pick.get("id") if isinstance(pick, dict) else None
    return int(taxon_id) if isinstance(taxon_id, int) else None


def get_gbif_country_count(
    usage_key: int | None,
    extra_params: dict[str, object] | None = None,
    *,
    item_class: str | None = None,
) -> int | None:
    if not usage_key:
        return None

    if COUNTRY_GBIF_PREINDEX_READY and normalize(item_class) in PREINDEX_SUPPORTED_CLASSES and not extra_params:
        return COUNTRY_GBIF_RAW_COUNTS.get(usage_key, 0)

    params = gbif_scope_params(
        {
        "taxonKey": usage_key,
        "limit": 0,
        }
    )
    if extra_params:
        params.update(extra_params)

    try:
        payload = url_json("https://api.gbif.org/v1/occurrence/search", params)
    except Exception:  # noqa: BLE001
        return None

    return int(payload.get("count") or 0) if isinstance(payload, dict) else 0


def get_gbif_country_evidence(usage_key: int | None, *, item_class: str | None = None) -> dict[str, int | bool | None]:
    count = get_gbif_country_count(usage_key, item_class=item_class)
    if count is None:
        return {"present": None, "count": None}

    return {"present": count > 0, "count": count}


def get_gbif_recent_wild_evidence(usage_key: int | None, *, item_class: str | None = None) -> dict[str, int | bool | None]:
    if not usage_key:
        return {"present": None, "count": None}

    if COUNTRY_GBIF_PREINDEX_READY and normalize(item_class) in PREINDEX_SUPPORTED_CLASSES:
        count = COUNTRY_GBIF_RECENT_WILD_COUNTS.get(usage_key, 0)
        return {"present": count > 0, "count": count}

    total = 0
    saw_response = False
    for basis in GBIF_RECENT_WILD_BASIS:
        count = get_gbif_country_count(
            usage_key,
            {
                "basisOfRecord": basis,
                "year": RECENT_GBIF_YEAR_RANGE,
                "occurrenceStatus": "PRESENT",
            },
            item_class=item_class,
        )
        if count is None:
            continue
        saw_response = True
        total += count

    if not saw_response:
        return {"present": None, "count": None}

    return {"present": total > 0, "count": total}


def get_inat_country_count(
    taxon_id: int | None,
    *,
    recent_wild_only: bool = False,
    item_class: str | None = None,
) -> int | None:
    if not taxon_id:
        return None

    if COUNTRY_INAT_PREINDEX_READY and normalize(item_class) in PREINDEX_SUPPORTED_CLASSES:
        index = COUNTRY_INAT_RECENT_WILD_COUNTS if recent_wild_only else COUNTRY_INAT_COUNTS
        return index.get(taxon_id, 0)

    params: dict[str, object] = {
        "taxon_id": taxon_id,
        "place_id": COUNTRY["inat_place_id"],
        "quality_grade": "research",
        "verifiable": "true",
        "per_page": 1,
    }
    if recent_wild_only:
        params["d1"] = RECENT_WILD_START_DATE
        params["captive"] = "false"

    try:
        payload = url_json(
            "https://api.inaturalist.org/v1/observations",
            params,
            rate_limited=True,
        )
    except Exception:  # noqa: BLE001
        return None

    return int(payload.get("total_results") or 0) if isinstance(payload, dict) else 0


def get_inat_country_evidence(taxon_id: int | None, *, item_class: str | None = None) -> dict[str, int | bool | None]:
    count = get_inat_country_count(taxon_id, recent_wild_only=False, item_class=item_class)
    if count is None:
        return {"present": None, "count": None}

    return {"present": count > 0, "count": count}


def get_inat_recent_wild_evidence(taxon_id: int | None, *, item_class: str | None = None) -> dict[str, int | bool | None]:
    count = get_inat_country_count(taxon_id, recent_wild_only=True, item_class=item_class)
    if count is None:
        return {"present": None, "count": None}

    return {"present": count > 0, "count": count}


def fetch_gbif_points(usage_key: int | None, limit: int = PROFILE_GBIF_POINT_LIMIT) -> list[dict]:
    if not usage_key:
        return []

    try:
        payload = url_json(
            "https://api.gbif.org/v1/occurrence/search",
            gbif_scope_params(
                {
                "taxonKey": usage_key,
                "hasCoordinate": "true",
                "limit": limit,
                }
            ),
        )
    except Exception:  # noqa: BLE001
        return []

    results = payload.get("results") or [] if isinstance(payload, dict) else []
    points = []
    for record in results:
        lat = record.get("decimalLatitude")
        lng = record.get("decimalLongitude")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            continue
        points.append(
            {
                "lat": float(lat),
                "lng": float(lng),
                "basisOfRecord": record.get("basisOfRecord") or None,
                "year": record.get("year"),
                "eventDate": record.get("eventDate") or None,
                "occurrenceStatus": record.get("occurrenceStatus") or None,
                "datasetName": record.get("datasetName") or None,
                "establishmentMeans": record.get("establishmentMeans") or None,
                "degreeOfEstablishment": record.get("degreeOfEstablishment") or None,
                "institutionCode": record.get("institutionCode") or None,
            }
        )
    return points


def fetch_inat_points(taxon_id: int | None, limit: int = PROFILE_INAT_POINT_LIMIT) -> list[dict]:
    if not taxon_id:
        return []

    try:
        payload = url_json(
            "https://api.inaturalist.org/v1/observations",
            {
                "taxon_id": taxon_id,
                "place_id": COUNTRY["inat_place_id"],
                "quality_grade": "research",
                "verifiable": "true",
                "per_page": limit,
            },
            rate_limited=True,
        )
    except Exception:  # noqa: BLE001
        return []

    results = payload.get("results") or [] if isinstance(payload, dict) else []
    points = []
    for record in results:
        coordinates = (((record or {}).get("geojson") or {}).get("coordinates")) or []
        if isinstance(coordinates, list) and len(coordinates) >= 2:
            lng = coordinates[0]
            lat = coordinates[1]
        elif isinstance(record.get("location"), str):
            parts = [part.strip() for part in record["location"].split(",")]
            if len(parts) != 2:
                continue
            try:
                lat = float(parts[0])
                lng = float(parts[1])
            except ValueError:
                continue
        else:
            continue

        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            continue
        points.append(
            {
                "lat": float(lat),
                "lng": float(lng),
                "captive": bool(record.get("captive")),
                "observedOn": record.get("observed_on") or record.get("time_observed_at") or None,
                "qualityGrade": record.get("quality_grade") or None,
            }
        )
    return points


def count_recent_wild_gbif_points(points: list[dict]) -> int:
    return sum(
        1
        for point in points
        if point.get("basisOfRecord") in GBIF_RECENT_WILD_BASIS
        and is_recent_wild_evidence(point.get("year"), point.get("eventDate"))
    )


def count_recent_wild_inat_points(points: list[dict]) -> int:
    return sum(
        1
        for point in points
        if point.get("captive") is not True and is_recent_wild_evidence(point.get("observedOn"))
    )


def filter_recent_wild_gbif_points(points: list[dict]) -> list[dict]:
    return [
        point
        for point in points
        if point.get("basisOfRecord") in GBIF_RECENT_WILD_BASIS
        and is_recent_wild_evidence(point.get("year"), point.get("eventDate"))
    ]


def filter_recent_wild_inat_points(points: list[dict]) -> list[dict]:
    return [
        point
        for point in points
        if point.get("captive") is not True and is_recent_wild_evidence(point.get("observedOn"))
    ]


def haversine_km(left: dict, right: dict) -> float:
    lat_delta = math.radians(right["lat"] - left["lat"])
    lng_delta = math.radians(right["lng"] - left["lng"])
    lat1 = math.radians(left["lat"])
    lat2 = math.radians(right["lat"])
    a = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(lng_delta / 2) ** 2
    )
    return 2 * 6371 * math.asin(math.sqrt(a))


def approximate_country_diameter_km(area_km2: float) -> float:
    if not area_km2 or area_km2 <= 0:
        return 0.0
    return 2 * math.sqrt(area_km2 / math.pi)


def average_point(points: list[dict]) -> dict[str, float]:
    return {
        "lat": sum(point["lat"] for point in points) / len(points),
        "lng": sum(point["lng"] for point in points) / len(points),
    }


def unique_grid_cell_count(points: list[dict], cell_size_km: float) -> int:
    if not points:
        return 0

    origin = average_point(points)
    lat_km = 111.32
    lng_km = 111.32 * math.cos(math.radians(origin["lat"]))
    cells: set[str] = set()

    for point in points:
        x = (point["lng"] - origin["lng"]) * lng_km
        y = (point["lat"] - origin["lat"]) * lat_km
        cells.add(f"{math.floor(x / cell_size_km)}:{math.floor(y / cell_size_km)}")

    return len(cells)


def max_observation_distance_km(points: list[dict]) -> float:
    max_km = 0.0
    for left_index in range(len(points)):
        for right_index in range(left_index + 1, len(points)):
            max_km = max(max_km, haversine_km(points[left_index], points[right_index]))
    return max_km


def projected_point_metrics(points: list[dict]) -> dict[str, object]:
    if not points:
        return {
            "projected": [],
            "widthKm": 0.0,
            "heightKm": 0.0,
            "avgLat": 0.0,
            "kmPerLat": 111.32,
            "kmPerLng": 111.32,
        }

    avg_lat = sum(point["lat"] for point in points) / len(points)
    km_per_lat = 111.32
    km_per_lng = 111.32 * math.cos(math.radians(avg_lat))
    projected = [(point["lng"] * km_per_lng, point["lat"] * km_per_lat) for point in points]
    xs = [point[0] for point in projected]
    ys = [point[1] for point in projected]
    return {
        "projected": projected,
        "widthKm": max(xs) - min(xs),
        "heightKm": max(ys) - min(ys),
        "avgLat": avg_lat,
        "kmPerLat": km_per_lat,
        "kmPerLng": km_per_lng,
    }


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    sorted_points = sorted(set(points))
    if len(sorted_points) <= 1:
        return sorted_points

    def cross(origin: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
        return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])

    lower: list[tuple[float, float]] = []
    for point in sorted_points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)

    upper: list[tuple[float, float]] = []
    for point in reversed(sorted_points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)

    return lower[:-1] + upper[:-1]


def polygon_area_km2(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0
    total = 0.0
    for index, current in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        total += current[0] * next_point[1] - next_point[0] * current[1]
    return abs(total) / 2


def polygon_perimeter_km(points: list[tuple[float, float]]) -> float:
    if len(points) < 2:
        return 0.0
    perimeter = 0.0
    for index, current in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        perimeter += math.hypot(next_point[0] - current[0], next_point[1] - current[1])
    return perimeter


def unproject_footprint_point(point: tuple[float, float], projection: dict[str, object]) -> dict[str, float]:
    km_per_lng = projection["kmPerLng"] if abs(projection["kmPerLng"]) > 0.0001 else 0.0001
    return {
        "lat": point[1] / projection["kmPerLat"],
        "lng": point[0] / km_per_lng,
    }


def expand_projected_hull(hull: list[tuple[float, float]], buffer_km: float) -> list[tuple[float, float]]:
    if not hull:
        return []

    centroid_x = sum(point[0] for point in hull) / len(hull)
    centroid_y = sum(point[1] for point in hull) / len(hull)
    expanded = []
    for point_x, point_y in hull:
        delta_x = point_x - centroid_x
        delta_y = point_y - centroid_y
        distance = math.hypot(delta_x, delta_y)
        if distance == 0:
            expanded.append((point_x + buffer_km, point_y + buffer_km))
            continue
        scale = (distance + buffer_km) / distance
        expanded.append((centroid_x + delta_x * scale, centroid_y + delta_y * scale))
    return expanded


def padded_projected_bounds(projected_points: list[tuple[float, float]], buffer_km: float) -> list[tuple[float, float]]:
    if not projected_points:
        return []

    xs = [point[0] for point in projected_points]
    ys = [point[1] for point in projected_points]
    min_x = min(xs) - buffer_km
    max_x = max(xs) + buffer_km
    min_y = min(ys) - buffer_km
    max_y = max(ys) + buffer_km
    return [
        (min_x, min_y),
        (max_x, min_y),
        (max_x, max_y),
        (min_x, max_y),
    ]


def build_buffered_footprint_polygon(
    points: list[dict],
    projection: dict[str, object],
    hull: list[tuple[float, float]],
    buffer_km: float,
) -> list[list[float]]:
    if not points:
        return []
    polygon = expand_projected_hull(hull, buffer_km) if len(hull) >= 3 else padded_projected_bounds(projection["projected"], buffer_km)
    result = []
    for point in polygon:
        lat_lng = unproject_footprint_point(point, projection)
        result.append([lat_lng["lat"], lat_lng["lng"]])
    return result


def significant_cluster_threshold(total_points: int) -> int:
    return max(FOOTPRINT_SIGNIFICANT_CLUSTER_MIN_POINTS, math.ceil(total_points * FOOTPRINT_SIGNIFICANT_CLUSTER_SHARE))


def cluster_observation_point_indices(points: list[dict], max_link_distance_km: float = FOOTPRINT_CLUSTER_LINK_KM) -> list[list[int]]:
    if not points:
        return []

    visited = [False] * len(points)
    clusters: list[list[int]] = []

    for index in range(len(points)):
        if visited[index]:
            continue

        visited[index] = True
        stack = [index]
        cluster: list[int] = []

        while stack:
            current_index = stack.pop()
            current_point = points[current_index]
            cluster.append(current_index)

            for next_index in range(len(points)):
                if visited[next_index]:
                    continue
                if haversine_km(current_point, points[next_index]) <= max_link_distance_km:
                    visited[next_index] = True
                    stack.append(next_index)

        clusters.append(cluster)

    return sorted(clusters, key=len, reverse=True)


def partition_observation_clusters(points: list[dict]) -> dict[str, object]:
    clusters = cluster_observation_point_indices(points)
    if not clusters:
        return {
            "clusters": [],
            "significantClusters": [],
            "corePoints": [],
            "outlierPoints": [],
            "threshold": 0,
        }

    threshold = significant_cluster_threshold(len(points))
    significant_clusters_indices = [cluster for cluster in clusters if len(cluster) >= threshold]
    if not significant_clusters_indices:
        significant_clusters_indices = [clusters[0]]

    core_index_set = {index for cluster in significant_clusters_indices for index in cluster}
    significant_clusters = [[points[index] for index in cluster] for cluster in significant_clusters_indices]
    core_points = [points[index] for index in sorted(core_index_set)]
    outlier_points = [point for index, point in enumerate(points) if index not in core_index_set]
    return {
        "clusters": [[points[index] for index in cluster] for cluster in clusters],
        "significantClusters": significant_clusters,
        "corePoints": core_points,
        "outlierPoints": outlier_points,
        "threshold": threshold,
    }


def max_cluster_centroid_distance_km(clusters: list[list[dict]]) -> float:
    if len(clusters) <= 1:
        return 0.0

    centroids = [average_point(cluster) for cluster in clusters if cluster]
    max_km = 0.0
    for left_index in range(len(centroids)):
        for right_index in range(left_index + 1, len(centroids)):
            max_km = max(max_km, haversine_km(centroids[left_index], centroids[right_index]))
    return max_km


def classify_observation_footprint(points: list[dict], country_area_km2: float, country_name: str) -> dict[str, object]:
    if not points:
        return {
            "code": "no_points",
            "label": "No mapped points",
            "short": "No points",
            "note": "No mapped coordinates were returned in the sampled observations.",
            "significant": False,
            "totalPoints": 0,
            "maxDistanceKm": 0,
            "unique25kmCells": 0,
            "unique50kmCells": 0,
            "countryDiameterKm": approximate_country_diameter_km(country_area_km2),
            "spreadRatio": 0,
            "footprintPolygonLatLngs": [],
        }

    total_points = len(points)
    partition = partition_observation_clusters(points)
    significant_clusters = partition["significantClusters"]
    cleaned_points = partition["corePoints"] or points
    outlier_points = partition["outlierPoints"]
    core_point_count = len(cleaned_points)
    max_distance_km = max_observation_distance_km(cleaned_points)
    unique_25km_cells = unique_grid_cell_count(cleaned_points, 25)
    unique_50km_cells = unique_grid_cell_count(cleaned_points, 50)
    country_diameter_km = approximate_country_diameter_km(country_area_km2)
    spread_ratio = max_distance_km / country_diameter_km if country_diameter_km > 0 else 0
    projection = projected_point_metrics(cleaned_points)
    projected = projection["projected"]
    width_km = projection["widthKm"]
    height_km = projection["heightKm"]
    hull = convex_hull(projected)
    hull_area_km2 = polygon_area_km2(hull)
    hull_perimeter_km = polygon_perimeter_km(hull)
    buffer_km = max(8, max(width_km, height_km, max_distance_km) * 0.18)
    fallback_strip_area_km2 = max(width_km, 8) * max(height_km, 8)
    buffered_area_km2 = max(
        hull_area_km2 + hull_perimeter_km * buffer_km + math.pi * buffer_km * buffer_km,
        fallback_strip_area_km2,
    )
    coverage_ratio = buffered_area_km2 / country_area_km2 if country_area_km2 > 0 else 0
    footprint_polygon_latlngs = build_buffered_footprint_polygon(cleaned_points, projection, hull, buffer_km)
    multiple_dense_areas = len(significant_clusters) >= 2
    centroid_spread_km = max_cluster_centroid_distance_km(significant_clusters)
    outlier_prefix = (
        f"Dropped {len(outlier_points)} likely outlier {('point' if len(outlier_points) == 1 else 'points')} before scoring. "
        if outlier_points
        else ""
    )
    wide_scatter_national = (
        core_point_count >= FOOTPRINT_NATIONAL_SPREAD_POINT_COUNT
        and unique_50km_cells >= FOOTPRINT_NATIONAL_SPREAD_POINT_COUNT
        and spread_ratio >= FOOTPRINT_NATIONAL_SPREAD_RATIO
    )

    common = {
        "significant": True,
        "totalPoints": total_points,
        "corePointCount": core_point_count,
        "outlierPointCount": len(outlier_points),
        "clusterCount": len(significant_clusters),
        "clusterSpreadKm": centroid_spread_km,
        "maxDistanceKm": max_distance_km,
        "unique25kmCells": unique_25km_cells,
        "unique50kmCells": unique_50km_cells,
        "countryDiameterKm": country_diameter_km,
        "spreadRatio": spread_ratio,
        "coverageAreaKm2": buffered_area_km2,
        "coverageRatio": coverage_ratio,
        "footprintPolygonLatLngs": footprint_polygon_latlngs,
    }

    if multiple_dense_areas and core_point_count >= FOOTPRINT_REGIONAL_MIN_POINTS:
        return {
            **common,
            "code": "countrywide",
            "label": "National footprint",
            "short": "National",
            "note": f"{outlier_prefix}{len(significant_clusters)} dense observation areas were found in {country_name}, so this is treated as national rather than a single regional pocket.",
        }

    if wide_scatter_national:
        return {
            **common,
            "code": "countrywide",
            "label": "National footprint",
            "short": "National",
            "note": f"{outlier_prefix}{core_point_count} cleaned observations are spread widely across {country_name}, so this is treated as national coverage.",
        }

    if core_point_count >= FOOTPRINT_REGIONAL_MIN_POINTS:
        if coverage_ratio <= FOOTPRINT_REGIONAL_MAX_COVERAGE_RATIO:
            return {
                **common,
                "code": "regional",
                "label": "Regional footprint",
                "short": "Regional",
                "note": f"{outlier_prefix}The cleaned outer footprint covers {(coverage_ratio * 100):.1f}% of {country_name}, so it stays regional.",
            }

        return {
            **common,
            "code": "countrywide",
            "label": "National footprint",
            "short": "National",
            "note": f"{outlier_prefix}The cleaned footprint still covers more than 5% of {country_name}, so it is treated as national.",
        }

    return {
        "code": "needs_review",
        "label": "Pending review",
        "short": "",
        "note": f"{outlier_prefix}Only {core_point_count} cleaned observations remain. Keep this in review until someone confirms it or draws a regional area.",
        "significant": False,
        "totalPoints": total_points,
        "corePointCount": core_point_count,
        "outlierPointCount": len(outlier_points),
        "clusterCount": len(significant_clusters),
        "clusterSpreadKm": centroid_spread_km,
        "maxDistanceKm": max_distance_km,
        "unique25kmCells": unique_25km_cells,
        "unique50kmCells": unique_50km_cells,
        "countryDiameterKm": country_diameter_km,
        "spreadRatio": spread_ratio,
        "coverageAreaKm2": buffered_area_km2,
        "coverageRatio": coverage_ratio,
        "footprintPolygonLatLngs": footprint_polygon_latlngs if core_point_count >= 3 else [],
    }


def summarize_managed_evidence(item: dict, gbif_points: list[dict], inat_points: list[dict]) -> dict[str, object]:
    domestic_named = "domestic" in normalize(item.get("commonName"))
    material_sample_count = sum(1 for point in gbif_points if point.get("basisOfRecord") == "MATERIAL_SAMPLE")
    atlas_count = sum(1 for point in gbif_points if "atlas" in normalize(point.get("datasetName")))
    managed_count = sum(
        1
        for point in gbif_points
        if "managed" in normalize(point.get("establishmentMeans"))
        or "managed" in normalize(point.get("degreeOfEstablishment"))
    )
    captive_inat_count = sum(1 for point in inat_points if point.get("captive") is True)
    suspicious_domestic = domestic_named and (
        material_sample_count >= max(5, len(gbif_points) * 0.25)
        or atlas_count >= max(10, len(gbif_points) * 0.35)
        or managed_count > 0
        or captive_inat_count > 0
    )
    return {
        "domesticNamed": domestic_named,
        "materialSampleCount": material_sample_count,
        "atlasCount": atlas_count,
        "managedCount": managed_count,
        "captiveInatCount": captive_inat_count,
        "needsReview": suspicious_domestic,
        "note": (
            f"{item.get('commonName') or item.get('binomial')} is a domestic taxon and the sampled records are dominated by atlas/material or captive-style evidence, so it stays in review."
            if suspicious_domestic
            else ""
        ),
    }


def summarize_recent_evidence_quality(
    expected: bool,
    raw_gbif_evidence: dict[str, int | bool | None],
    raw_inat_evidence: dict[str, int | bool | None],
    qualified_gbif_evidence: dict[str, int | bool | None],
    qualified_inat_evidence: dict[str, int | bool | None],
    gbif_points: list[dict],
    inat_points: list[dict],
) -> dict[str, object]:
    raw_total = numeric_count(raw_gbif_evidence.get("count")) + numeric_count(raw_inat_evidence.get("count"))
    qualified_total = numeric_count(qualified_gbif_evidence.get("count")) + numeric_count(
        qualified_inat_evidence.get("count")
    )

    specimen_or_sample_count = sum(
        1 for point in gbif_points if point.get("basisOfRecord") in GBIF_SPECIMEN_OR_SAMPLE_BASIS
    )
    stale_gbif_count = sum(
        1 for point in gbif_points if not is_recent_wild_evidence(point.get("year"), point.get("eventDate"))
    )
    stale_inat_count = sum(1 for point in inat_points if not is_recent_wild_evidence(point.get("observedOn")))
    captive_inat_count = sum(1 for point in inat_points if point.get("captive") is True)

    rejected = not expected and raw_total > 0 and qualified_total == 0
    reasons: list[str] = []
    if specimen_or_sample_count:
        reasons.append("specimen/sample records")
    if stale_gbif_count:
        reasons.append("older GBIF records")
    if stale_inat_count:
        reasons.append("older iNaturalist observations")
    if captive_inat_count:
        reasons.append("captive iNaturalist observations")

    reason_text = ", ".join(reasons[:3]) if reasons else "non-wild or stale records"
    note = (
        f"No recent wild observations from the last {RECENT_WILD_EVIDENCE_YEARS} years were found; the available evidence is only {reason_text}."
        if rejected
        else ""
    )

    return {
        "rawTotal": raw_total,
        "qualifiedTotal": qualified_total,
        "specimenOrSampleCount": specimen_or_sample_count,
        "staleGbifCount": stale_gbif_count,
        "staleInatCount": stale_inat_count,
        "captiveInatCount": captive_inat_count,
        "rejected": rejected,
        "note": note,
    }


def has_unexpected_significant_evidence(gbif_count: int | None, inat_count: int | None) -> bool:
    gbif = numeric_count(gbif_count)
    inat = numeric_count(inat_count)
    total = gbif + inat
    if total >= 8:
        return True
    if gbif >= 5 and inat >= 1:
        return True
    if inat >= 5 and gbif >= 1:
        return True
    if gbif >= 3 and inat >= 3:
        return True
    return False


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


def compute_status(expected: bool, gbif_present: bool | None, inat_present: bool | None, gbif_count: int | None, inat_count: int | None) -> str:
    if expected:
        if not has_sufficient_expected_evidence(gbif_count, inat_count):
            return "likely_false"
        if gbif_present is True and inat_present is True:
            return "likely_true_both"
        if gbif_present is True or inat_present is True:
            return "likely_true_one_source"
        return "likely_false"

    if (gbif_present is True or inat_present is True) and has_unexpected_significant_evidence(gbif_count, inat_count):
        return "new_record"

    return "unlisted"


def build_coverage_note(item: dict, validation: dict) -> str:
    notes: list[str] = []
    status = validation["status"]
    expected = validation["expected"]
    bucket = display_bucket(status, expected, validation.get("observationProfile"))
    record_label = scope_record_label()

    if bucket == "New":
        notes.append(f"Needs review as a possible new {record_label} record.")
    elif expected and not validation["gbifPresent"] and not validation["inatPresent"]:
        notes.append("Needs review. Missing evidence.")
    elif not expected and status == "unlisted" and total_evidence_count(validation) > 0:
        notes.append("Needs review. Evidence is too weak.")
    elif not expected:
        notes.append("Needs review.")

    if expected and total_evidence_count(validation) == 1:
        notes.append("Missing evidence.")

    evidence_quality_note = ((validation.get("evidenceQuality") or {}).get("note")) or ""
    if evidence_quality_note:
        notes.append(evidence_quality_note)

    managed_note = ((validation.get("managedEvidence") or {}).get("note")) or ""
    if managed_note:
        notes.append(managed_note)

    profile = validation.get("observationProfile") or {}
    if profile.get("note"):
        notes.append(profile["note"])
        coverage_ratio = profile.get("coverageRatio")
        if isinstance(coverage_ratio, (int, float)) and math.isfinite(coverage_ratio):
            notes.append(f"Estimated footprint coverage: {(coverage_ratio * 100):.1f}% of {COUNTRY['name']}.")
    else:
        notes.append("Checking whether the mapped observations should be treated as national, regional, or no-point evidence.")

    return " ".join(notes)


def status_bucket(status: str) -> str:
    return STATUS_BUCKETS.get(status, status)


def display_bucket(status: str, expected: bool, observation_profile: dict | None) -> str:
    code = str(((observation_profile or {}).get("code")) or "").strip().lower()
    if not expected and code in NEW_BUCKET_FOOTPRINT_CODES:
        return "New"
    return status_bucket(status)


def process_item(item: dict) -> tuple[dict, dict]:
    expected = COUNTRY["iso3"] in (item.get("expectedCountries") or [])
    item_class = normalize(item.get("class"))
    baseline_entry = EXPECTED_COUNTRY_BASELINE_ENTRIES.get(item["id"]) if expected else None
    baseline_row = EXPECTED_COUNTRY_BASELINE_AUDIT.get(item["id"]) if expected else None
    if baseline_entry is not None and baseline_row is not None:
        return dict(baseline_entry), dict(baseline_row)

    domestic_named = "domestic" in normalize(item.get("commonName"))

    gbif_usage_key = resolve_gbif_usage_key(item["binomial"])
    inat_taxon_id = resolve_inat_taxon_id(item["binomial"])
    if baseline_row is not None and gbif_usage_key is None:
        gbif_usage_key = parse_optional_int(baseline_row.get("gbifUsageKey"))
    if baseline_row is not None and inat_taxon_id is None:
        inat_taxon_id = parse_optional_int(baseline_row.get("inatTaxonId"))

    raw_gbif_evidence = get_gbif_country_evidence(gbif_usage_key, item_class=item_class)
    raw_inat_evidence = get_inat_country_evidence(inat_taxon_id, item_class=item_class)
    if baseline_row is not None:
        raw_gbif_evidence = apply_baseline_evidence_fallback(
            raw_gbif_evidence,
            baseline_row,
            count_key="gbifCount",
            present_key="gbifPresent",
        )
        raw_inat_evidence = apply_baseline_evidence_fallback(
            raw_inat_evidence,
            baseline_row,
            count_key="inatCount",
            present_key="inatPresent",
        )

    gbif_evidence = raw_gbif_evidence
    inat_evidence = raw_inat_evidence
    qualified_gbif_evidence = raw_gbif_evidence
    qualified_inat_evidence = raw_inat_evidence
    gbif_points: list[dict] = []
    inat_points: list[dict] = []

    if not expected and (raw_gbif_evidence["present"] is True or raw_inat_evidence["present"] is True):
        qualified_gbif_evidence = get_gbif_recent_wild_evidence(gbif_usage_key, item_class=item_class)
        qualified_inat_evidence = get_inat_recent_wild_evidence(inat_taxon_id, item_class=item_class)

        if qualified_gbif_evidence["count"] is None and gbif_points:
            recent_gbif_sample_count = count_recent_wild_gbif_points(gbif_points)
            qualified_gbif_evidence = {"present": recent_gbif_sample_count > 0, "count": recent_gbif_sample_count}

        if qualified_inat_evidence["count"] is None and inat_points:
            recent_inat_sample_count = count_recent_wild_inat_points(inat_points)
            qualified_inat_evidence = {"present": recent_inat_sample_count > 0, "count": recent_inat_sample_count}

        gbif_evidence = qualified_gbif_evidence
        inat_evidence = qualified_inat_evidence

    status = compute_status(
        expected,
        gbif_evidence["present"],
        inat_evidence["present"],
        gbif_evidence["count"],
        inat_evidence["count"],
    )

    skip_expected_point_fetch = expected and bool(COUNTRY.get("skip_expected_point_fetch")) and not domestic_named

    should_fetch_gbif_points = (
        status in {"likely_true_both", "likely_true_one_source", "new_record"}
        or domestic_named
        or (not expected and raw_gbif_evidence["present"] is True and qualified_gbif_evidence["count"] is None)
    ) and not skip_expected_point_fetch
    gbif_points = fetch_gbif_points(gbif_usage_key) if should_fetch_gbif_points else []

    should_fetch_inat_points = (
        status == "new_record"
        or (numeric_count(gbif_evidence["count"]) == 0 and inat_evidence["present"] is True)
        or domestic_named
        or (not expected and raw_inat_evidence["present"] is True and qualified_inat_evidence["count"] is None)
    ) and not skip_expected_point_fetch
    inat_points = fetch_inat_points(inat_taxon_id) if should_fetch_inat_points else []

    if gbif_points:
        raw_gbif_evidence["present"] = True
        if raw_gbif_evidence["count"] is None:
            raw_gbif_evidence["count"] = len(gbif_points)

    if inat_points:
        raw_inat_evidence["present"] = True
        if raw_inat_evidence["count"] is None:
            raw_inat_evidence["count"] = len(inat_points)

    if not expected and (raw_gbif_evidence["present"] is True or raw_inat_evidence["present"] is True):
        if qualified_gbif_evidence["count"] is None and gbif_points:
            recent_gbif_sample_count = count_recent_wild_gbif_points(gbif_points)
            qualified_gbif_evidence = {"present": recent_gbif_sample_count > 0, "count": recent_gbif_sample_count}

        if qualified_inat_evidence["count"] is None and inat_points:
            recent_inat_sample_count = count_recent_wild_inat_points(inat_points)
            qualified_inat_evidence = {"present": recent_inat_sample_count > 0, "count": recent_inat_sample_count}

        gbif_evidence = qualified_gbif_evidence
        inat_evidence = qualified_inat_evidence

    profile_gbif_points = gbif_points if expected else filter_recent_wild_gbif_points(gbif_points)
    profile_inat_points = inat_points if expected else filter_recent_wild_inat_points(inat_points)

    profile_points = profile_gbif_points or profile_inat_points
    observation_profile = classify_observation_footprint(profile_points, COUNTRY["area_km2"], COUNTRY["name"])
    if skip_expected_point_fetch and not profile_points:
        observation_profile = {
            "code": "country_pack_only",
            "label": "State pack only",
            "short": "Pack-only",
            "note": "This expected species keeps validated state-pack membership, but this accelerated state build does not store mapped footprint geometry for expected species.",
            "significant": False,
            "footprintPolygonLatLngs": [],
        }
    managed_evidence = summarize_managed_evidence(item, gbif_points, inat_points)
    evidence_quality = summarize_recent_evidence_quality(
        expected,
        raw_gbif_evidence,
        raw_inat_evidence,
        qualified_gbif_evidence,
        qualified_inat_evidence,
        gbif_points,
        inat_points,
    )

    status = compute_status(
        expected,
        gbif_evidence["present"],
        inat_evidence["present"],
        gbif_evidence["count"],
        inat_evidence["count"],
    )
    if managed_evidence["needsReview"]:
        status = "likely_false"

    validation = {
        "status": status,
        "expected": expected,
        "gbifPresent": gbif_evidence["present"],
        "inatPresent": inat_evidence["present"],
        "gbifCount": gbif_evidence["count"],
        "inatCount": inat_evidence["count"],
        "rawGbifPresent": raw_gbif_evidence["present"],
        "rawInatPresent": raw_inat_evidence["present"],
        "rawGbifCount": raw_gbif_evidence["count"],
        "rawInatCount": raw_inat_evidence["count"],
        "observationProfile": observation_profile,
        "managedEvidence": managed_evidence,
        "evidenceQuality": evidence_quality,
    }

    bucket = display_bucket(status, expected, observation_profile)
    tags = build_item_tags(item, bucket, expected)

    entry = {
        "itemId": item["id"],
        "countryIso3": COUNTRY["iso3"],
        "status": status,
        "bucket": bucket,
        "expected": expected,
        "gbifPresent": gbif_evidence["present"],
        "inatPresent": inat_evidence["present"],
        "gbifCount": gbif_evidence["count"],
        "inatCount": inat_evidence["count"],
        "rawGbifPresent": raw_gbif_evidence["present"],
        "rawInatPresent": raw_inat_evidence["present"],
        "rawGbifCount": raw_gbif_evidence["count"],
        "rawInatCount": raw_inat_evidence["count"],
        "gbifUsageKey": gbif_usage_key,
        "inatTaxonId": inat_taxon_id,
        "inatPlaceId": COUNTRY["inat_place_id"],
        "managedEvidence": managed_evidence,
        "evidenceQuality": evidence_quality,
        "observationProfile": observation_profile,
        "tags": tags,
    }

    audit_row = {
        "itemId": item["id"],
        "commonName": item.get("commonName") or "",
        "binomial": item["binomial"],
        "class": item.get("class") or "",
        "order": item.get("order") or "",
        "family": item.get("family") or "",
        "matchLevel": item.get("matchLevel"),
        "matchedKey": item.get("matchedKey") or "",
        "expected": expected,
        "status": status,
        "bucket": bucket,
        "gbifCount": gbif_evidence["count"],
        "inatCount": inat_evidence["count"],
        "gbifPresent": gbif_evidence["present"],
        "inatPresent": inat_evidence["present"],
        "gbifUsageKey": gbif_usage_key,
        "inatTaxonId": inat_taxon_id,
        "footprintCode": observation_profile.get("code") or "",
        "footprintLabel": observation_profile.get("label") or "",
        "coverageRatio": observation_profile.get("coverageRatio"),
        "managedReview": managed_evidence["needsReview"],
        "tags": "; ".join(tags),
        "note": build_coverage_note(item, validation),
    }

    return entry, audit_row


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "itemId",
        "commonName",
        "binomial",
        "class",
        "order",
        "family",
        "matchLevel",
        "matchedKey",
        "expected",
        "status",
        "bucket",
        "gbifCount",
        "inatCount",
        "gbifPresent",
        "inatPresent",
        "gbifUsageKey",
        "inatTaxonId",
        "footprintCode",
        "footprintLabel",
        "coverageRatio",
        "managedReview",
        "tags",
        "note",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def write_summary(path: Path, payload: dict, audit_rows: list[dict]) -> None:
    status_counts = Counter(row["status"] for row in audit_rows)
    bucket_counts = Counter(row["bucket"] for row in audit_rows)
    footprint_counts = Counter(row["footprintCode"] or "unknown" for row in audit_rows)
    new_candidates = [row for row in audit_rows if row["bucket"] == "New"]
    top_new = sorted(
        new_candidates,
        key=lambda row: (numeric_count(row["gbifCount"]) + numeric_count(row["inatCount"]), row["binomial"]),
        reverse=True,
    )[:25]

    lines = [
        f"{COUNTRY['name']} Precomputed Validation",
        f"Generated at: {payload['generatedAtUtc']}",
        f"Country: {COUNTRY['name']} ({COUNTRY['iso3']})",
        f"Total species checked: {len(audit_rows)}",
        "",
        "Bucket totals:",
    ]
    for bucket_name in ["Likely Valid", "New", "Needs Review", "Unlisted"]:
        lines.append(f"- {bucket_name}: {bucket_counts.get(bucket_name, 0)}")

    lines.append("")
    lines.append("Status totals:")
    for status in ["likely_true_both", "likely_true_one_source", "new_record", "likely_false", "unlisted"]:
        lines.append(f"- {status}: {status_counts.get(status, 0)}")

    lines.append("")
    lines.append("Footprint totals:")
    for code in ["countrywide", "regional", "needs_review", "no_points", "unknown"]:
        lines.append(f"- {code}: {footprint_counts.get(code, 0)}")

    lines.append("")
    lines.append("Top new candidates:")
    if top_new:
        for row in top_new:
            tag_text = f", tags={row['tags']}" if row.get("tags") else ""
            lines.append(
                f"- {row['commonName'] or row['binomial']} ({row['binomial']}): GBIF={format_count(row['gbifCount'])}, iNat={format_count(row['inatCount'])}, footprint={row['footprintCode'] or 'unknown'}{tag_text}"
            )
    else:
        lines.append("- None")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def load_items(limit: int | None) -> list[dict]:
    return load_items_with_selection(limit, "expected-country", None, None)


def load_expected_country_baseline_entries(selection: str, country_iso3: str) -> dict[str, dict]:
    if selection != "global":
        return {}

    baseline_path = default_output_paths(country_iso3).get("output")
    if not isinstance(baseline_path, Path) or not baseline_path.exists():
        return {}

    try:
        payload = json.loads(baseline_path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}

    entries = payload.get("entries") or []
    return {entry["itemId"]: entry for entry in entries if entry.get("itemId")}


def load_expected_country_baseline_audit(selection: str, country_iso3: str, current_audit_path: Path | None) -> dict[str, dict[str, str]]:
    if selection != "global":
        return {}

    baseline_path = default_output_paths(country_iso3).get("audit_csv")
    if not isinstance(baseline_path, Path) or not baseline_path.exists():
        return {}

    with baseline_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return {row["itemId"]: row for row in reader if row.get("itemId")}


def apply_baseline_evidence_fallback(
    evidence: dict[str, int | bool | None],
    baseline_row: dict[str, str] | None,
    *,
    count_key: str,
    present_key: str,
) -> dict[str, int | bool | None]:
    if baseline_row is None or evidence.get("count") is not None:
        return evidence

    baseline_count = parse_optional_int(baseline_row.get(count_key))
    baseline_present = parse_optional_bool(baseline_row.get(present_key))
    if baseline_count is None and baseline_present is None:
        return evidence

    return {
        "present": baseline_present,
        "count": baseline_count,
    }


def load_candidate_filters(path: Path | None) -> tuple[set[str], set[str]]:
    if path is None or not path.exists():
        return set(), set()

    item_ids: set[str] = set()
    binomials: set[str] = set()

    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                item_id = normalize(row.get("itemId"))
                binomial = normalize(row.get("binomial"))
                if item_id:
                    item_ids.add(item_id)
                if binomial:
                    binomials.add(binomial)
    else:
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            value = normalize(raw_line)
            if not value or value.startswith("#"):
                continue
            if " " in value:
                binomials.add(value)
            else:
                item_ids.add(value)

    return item_ids, binomials


def default_exclusion_file(country_iso3: str) -> Path:
    return COUNTRY_EXCLUSION_DIR / f"{country_iso3.upper()}.txt"


def load_items_with_selection(limit: int | None, selection: str, candidate_file: Path | None, exclude_file: Path | None) -> list[dict]:
    payload = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    all_items = payload.get("items") or []
    candidate_ids, candidate_binomials = load_candidate_filters(candidate_file)
    excluded_ids, excluded_binomials = load_candidate_filters(exclude_file)
    normalized_selection = "expected-country" if selection == "expected-dnk" else selection

    items: list[dict] = []
    for item in all_items:
        item_id = normalize(item.get("id"))
        binomial = normalize(item.get("binomial"))
        if item_id in excluded_ids or binomial in excluded_binomials:
            continue

        expected_in_country = COUNTRY["iso3"] in (item.get("expectedCountries") or [])
        if normalized_selection == "candidate-only":
            include = item_id in candidate_ids or binomial in candidate_binomials
        else:
            include = normalized_selection == "global" or expected_in_country
        if not include and normalized_selection != "candidate-only":
            include = item_id in candidate_ids or binomial in candidate_binomials
        if include:
            items.append(item)

    if limit is not None:
        return items[:limit]
    return items


def load_country_indexed_items(limit: int | None, candidate_file: Path | None, exclude_file: Path | None) -> list[dict]:
    all_items = load_items_with_selection(None, "global", None, exclude_file)
    if not (COUNTRY_GBIF_PREINDEX_READY or COUNTRY_INAT_PREINDEX_READY):
        build_country_evidence_preindex(all_items)

    observed_binomials = country_observed_binomials()
    candidate_ids, candidate_binomials = load_candidate_filters(candidate_file)
    items: list[dict] = []

    for item in all_items:
        item_class = normalize(item.get("class"))
        item_id = normalize(item.get("id"))
        binomial = normalize(item.get("binomial"))
        expected_in_country = COUNTRY["iso3"] in (item.get("expectedCountries") or [])
        include = (
            expected_in_country
            or item_id in candidate_ids
            or binomial in candidate_binomials
        )
        if item_class in PREINDEX_SUPPORTED_CLASSES and binomial in observed_binomials:
            include = True
        if include:
            items.append(item)

    if limit is not None:
        return items[:limit]
    return items


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build validated precomputed country data.")
    parser.add_argument("--country", default=DEFAULT_COUNTRY["iso3"], help="ISO3 code to validate. Defaults to DNK.")
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N species for testing.")
    parser.add_argument("--workers", type=int, default=6, help="Concurrent worker count.")
    parser.add_argument(
        "--selection",
        choices=["expected-country", "expected-dnk", "global", "candidate-only", "country-indexed"],
        default="expected-country",
        help="Species selection mode. 'expected-country' keeps only SpeciesNet species expected in the selected country unless --candidate-file adds more; 'candidate-only' validates only the itemIds/binomials provided in --candidate-file; 'country-indexed' uses country-wide provider indexes to validate expected species plus species already observed in the country.",
    )
    parser.add_argument(
        "--candidate-file",
        type=Path,
        default=None,
        help="Optional text or CSV file of extra itemIds/binomials to include on top of the selected country's expected set.",
    )
    parser.add_argument(
        "--exclude-file",
        type=Path,
        default=None,
        help="Optional text or CSV file of itemIds/binomials to exclude from the selected country's output. Defaults to country-validation/manual-exclusions/<ISO3>.txt when present.",
    )
    parser.add_argument("--output", type=Path, default=None, help="Precomputed JSON output path. Defaults to web-plugin/data/precomputed-countries/<ISO3>.json.")
    parser.add_argument(
        "--legacy-output",
        type=Path,
        default=None,
        help="Optional compatibility copy path. Defaults to the legacy Denmark single-file path only when --country DNK.",
    )
    parser.add_argument("--audit-csv", type=Path, default=None, help="Audit CSV output path.")
    parser.add_argument("--new-csv", type=Path, default=None, help="New-candidate CSV output path.")
    parser.add_argument("--summary", type=Path, default=None, help="Summary text output path.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    global COUNTRY, EXPECTED_COUNTRY_BASELINE_ENTRIES, EXPECTED_COUNTRY_BASELINE_AUDIT
    COUNTRY = resolve_country_metadata(args.country)

    default_paths = default_output_paths(COUNTRY["iso3"])
    selection = "expected-country" if args.selection == "expected-dnk" else args.selection
    output_path = args.output or default_paths["output"]
    if args.legacy_output is not None:
        legacy_output = args.legacy_output
    elif args.output is None:
        legacy_output = default_paths["legacy_output"]
    else:
        legacy_output = None
    audit_csv_path = args.audit_csv or default_paths["audit_csv"]
    new_csv_path = args.new_csv or default_paths["new_csv"]
    summary_path = args.summary or default_paths["summary"]
    auto_exclude_file = default_exclusion_file(COUNTRY["iso3"])
    exclude_file = args.exclude_file if args.exclude_file is not None else (auto_exclude_file if auto_exclude_file.exists() else None)

    EXPECTED_COUNTRY_BASELINE_ENTRIES = load_expected_country_baseline_entries(selection, COUNTRY["iso3"])
    EXPECTED_COUNTRY_BASELINE_AUDIT = load_expected_country_baseline_audit(selection, COUNTRY["iso3"], audit_csv_path)
    if selection == "country-indexed":
        all_items = load_items_with_selection(None, "global", None, exclude_file)
        build_country_evidence_preindex(all_items)
        items = load_country_indexed_items(args.limit, args.candidate_file, exclude_file)
    else:
        items = load_items_with_selection(args.limit, selection, args.candidate_file, exclude_file)
        build_country_evidence_preindex(items)
    total = len(items)
    entries: list[dict] = []
    audit_rows: list[dict] = []
    done = 0

    print(
        f"Selected country {COUNTRY['name']} ({COUNTRY['iso3']})"
        f" with GBIF country={COUNTRY['iso2']} and iNat place={COUNTRY['inat_place_id'] or 'unresolved'}"
    )
    print(f"Selected {total} species using selection='{selection}'")
    if args.candidate_file:
        print(f"Candidate file: {args.candidate_file}")
    if exclude_file:
        print(f"Exclude file: {exclude_file}")

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {executor.submit(process_item, item): item for item in items}
        for future in as_completed(futures):
            entry, audit_row = future.result()
            entries.append(entry)
            audit_rows.append(audit_row)

            with PROGRESS_LOCK:
                done += 1
                if done % 25 == 0 or done == total:
                    print(f"Processed {done}/{total}")

    audit_rows.sort(key=lambda row: (row["bucket"], row["commonName"] or row["binomial"], row["binomial"]))
    entries.sort(key=lambda entry: entry["itemId"])

    payload = {
        "generatedFor": COUNTRY["iso3"],
        "countryName": COUNTRY["name"],
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "sourceDataset": "web-plugin/data/animals-global.json",
        "precomputeMode": "validated",
        "selectionMode": selection,
        "candidateFile": str(args.candidate_file) if args.candidate_file else None,
        "summary": {
            "total": len(entries),
            "statusCounts": dict(Counter(entry["status"] for entry in entries)),
            "bucketCounts": dict(Counter((entry.get("bucket") or status_bucket(entry["status"])) for entry in entries)),
        },
        "entries": entries,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    serialized_payload = json.dumps(payload, ensure_ascii=True, indent=2)
    output_path.write_text(serialized_payload, encoding="utf-8")
    if legacy_output:
        legacy_output.parent.mkdir(parents=True, exist_ok=True)
        legacy_output.write_text(serialized_payload, encoding="utf-8")
    write_csv(audit_csv_path, audit_rows)
    write_csv(new_csv_path, [row for row in audit_rows if row["bucket"] == "New"])
    write_summary(summary_path, payload, audit_rows)

    print(f"Wrote {len(entries)} entries to {output_path}")
    if legacy_output:
        print(f"Wrote legacy compatibility copy to {legacy_output}")
    print(f"Wrote audit CSV to {audit_csv_path}")
    print(f"Wrote new candidates CSV to {new_csv_path}")
    print(f"Wrote summary to {summary_path}")


if __name__ == "__main__":
    main()