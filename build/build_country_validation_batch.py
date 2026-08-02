#!/usr/bin/env python3
"""Run validated country builds in batches.

Defaults to Europe-first rollout, but can also process the full expected-country
queue alphabetically while reusing the generic country validator.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
INPUT_PATH = ROOT / "web-plugin" / "data" / "animals-global.json"
VALIDATOR_SCRIPT = ROOT / "build_denmark_precomputed_validation.py"
INDEX_BUILDER_SCRIPT = ROOT / "build_all_country_precomputed.py"
INDEX_PATH = ROOT / "web-plugin" / "data" / "precomputed-countries" / "index.json"
COUNTRY_ARTIFACTS_DIR = ROOT / "country-validation"
DENMARK_CANDIDATE_PATH = ROOT / "denmark_new_candidates.csv"
DENMARK_SPECIES_VALIDATION_PATH = ROOT / "denmark_species_validation.csv"
HTTP_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "GlobalFaunaRadar/1.0 (country batch validator)",
}


def sort_key(value: str | None) -> str:
    return str(value or "").strip().lower()


def load_expected_country_codes() -> set[str]:
    payload = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    expected: set[str] = set()
    for item in payload.get("items") or []:
        for iso3 in item.get("expectedCountries") or []:
            normalized_iso3 = str(iso3 or "").strip().upper()
            if normalized_iso3:
                expected.add(normalized_iso3)
    return expected


def load_region_countries(region: str) -> list[dict[str, str]]:
    normalized_region = region.strip().lower()
    request = Request(
        f"https://restcountries.com/v3.1/region/{normalized_region}?fields=cca3,name",
        headers=HTTP_HEADERS,
    )
    with urlopen(request, timeout=30) as response:
        payload = json.load(response)

    countries: list[dict[str, str]] = []
    for row in payload or []:
        iso3 = str((row or {}).get("cca3") or "").strip().upper()
        name = str((((row or {}).get("name") or {}).get("common")) or iso3).strip() or iso3
        if iso3:
            countries.append({"iso3": iso3, "countryName": name})

    return sorted(countries, key=lambda row: (sort_key(row["countryName"]), row["iso3"]))


def load_all_countries() -> list[dict[str, str]]:
    request = Request(
        "https://restcountries.com/v3.1/all?fields=cca3,name",
        headers=HTTP_HEADERS,
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except Exception:  # noqa: BLE001
        if INDEX_PATH.exists():
            cached_index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
            countries = [
                {
                    "iso3": str((row or {}).get("iso3") or "").strip().upper(),
                    "countryName": str((row or {}).get("countryName") or (row or {}).get("iso3") or "").strip(),
                }
                for row in cached_index.get("countries") or []
                if str((row or {}).get("iso3") or "").strip()
            ]
            return sorted(countries, key=lambda row: (sort_key(row["countryName"]), row["iso3"]))
        raise

    countries: list[dict[str, str]] = []
    for row in payload or []:
        iso3 = str((row or {}).get("cca3") or "").strip().upper()
        name = str((((row or {}).get("name") or {}).get("common")) or iso3).strip() or iso3
        if iso3:
            countries.append({"iso3": iso3, "countryName": name})

    return sorted(countries, key=lambda row: (sort_key(row["countryName"]), row["iso3"]))


def load_started_country_codes() -> set[str]:
    started: set[str] = set()

    if INDEX_PATH.exists():
        payload = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        for row in payload.get("countries") or []:
            iso3 = str((row or {}).get("iso3") or "").strip().upper()
            precompute_mode = str((row or {}).get("precomputeMode") or "").strip().lower()
            if iso3 and precompute_mode == "validated":
                started.add(iso3)

    if DENMARK_SPECIES_VALIDATION_PATH.exists():
        started.add("DNK")

    if COUNTRY_ARTIFACTS_DIR.exists():
        for child in COUNTRY_ARTIFACTS_DIR.iterdir():
            if not child.is_dir():
                continue
            if (child / "species_validation.csv").exists():
                started.add(child.name.strip().upper())

    return started


def default_candidate_file(country_iso3: str) -> Path:
    normalized_iso3 = str(country_iso3 or "").strip().upper()
    if normalized_iso3 == "DNK":
        return DENMARK_CANDIDATE_PATH
    return COUNTRY_ARTIFACTS_DIR / normalized_iso3 / "new_candidates.csv"


def selected_countries(
    region: str,
    requested_iso3: list[str],
    excluded_iso3: set[str],
    start_at: str | None,
    limit_countries: int | None,
    skip_validated: bool,
) -> list[dict[str, str]]:
    expected = load_expected_country_codes()
    source_rows = load_all_countries() if region.strip().lower() == "all" else load_region_countries(region)
    region_rows = [row for row in source_rows if row["iso3"] in expected]
    by_iso3 = {row["iso3"]: row for row in region_rows}
    started = load_started_country_codes() if skip_validated else set()

    if requested_iso3:
        rows = [by_iso3[iso3] for iso3 in requested_iso3 if iso3 in by_iso3]
    else:
        rows = region_rows

    if excluded_iso3:
        rows = [row for row in rows if row["iso3"] not in excluded_iso3]

    if start_at:
        normalized_start = start_at.strip().upper()
        while rows and rows[0]["iso3"] != normalized_start:
            rows = rows[1:]

    if started:
        rows = [row for row in rows if row["iso3"] not in started]

    if limit_countries is not None:
        rows = rows[: max(0, limit_countries)]

    return rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run validated country builds in batches.")
    parser.add_argument("--region", default="europe", help="Rest Countries region to process first, or 'all' for the full alphabetical queue. Defaults to europe.")
    parser.add_argument(
        "--countries",
        default="",
        help="Optional comma-separated ISO3 list to process instead of the full region queue.",
    )
    parser.add_argument(
        "--exclude-countries",
        default="",
        help="Optional comma-separated ISO3 list to remove from the selected queue.",
    )
    parser.add_argument("--start-at", default="", help="Optional ISO3 code to start from inside the selected queue.")
    parser.add_argument("--limit-countries", type=int, default=None, help="Only process the first N countries in the selected queue.")
    parser.add_argument("--limit-species", type=int, default=None, help="Pass through a per-country species limit for testing.")
    parser.add_argument("--workers", type=int, default=6, help="Pass through worker count to the country validator.")
    parser.add_argument(
        "--max-parallel",
        type=int,
        default=1,
        help="How many country validator processes to keep running at once. Defaults to 1.",
    )
    parser.add_argument(
        "--log-dir",
        type=Path,
        default=COUNTRY_ARTIFACTS_DIR / "batch-logs",
        help="Directory for per-country batch logs when --max-parallel is greater than 1.",
    )
    parser.add_argument(
        "--selection",
        choices=["expected-country", "expected-dnk", "global", "candidate-only", "country-indexed"],
        default="expected-country",
        help="Species selection mode passed through to the validator.",
    )
    parser.add_argument(
        "--include-validated",
        action="store_true",
        help="Include countries that already have validated packs instead of skipping them.",
    )
    parser.add_argument(
        "--reuse-candidate-files",
        action="store_true",
        help="Pass each country's existing new_candidates.csv to the validator when that file already exists.",
    )
    parser.add_argument("--skip-index-rebuild", action="store_true", help="Skip the final build_all_country_precomputed.py refresh.")
    parser.add_argument("--dry-run", action="store_true", help="Print the selected queue without running validators.")
    return parser.parse_args()


def run_command(command: list[str]) -> None:
    subprocess.run(command, check=True)


def build_validator_command(row: dict[str, str], args: argparse.Namespace) -> tuple[list[str], Path]:
    command = [
        sys.executable,
        "-u",
        str(VALIDATOR_SCRIPT),
        "--country",
        row["iso3"],
        "--workers",
        str(args.workers),
        "--selection",
        args.selection,
    ]
    if args.limit_species is not None:
        command.extend(["--limit", str(args.limit_species)])

    candidate_file = default_candidate_file(row["iso3"])
    if args.reuse_candidate_files and candidate_file.exists() and candidate_file.stat().st_size > 0:
        command.extend(["--candidate-file", str(candidate_file)])

    return command, candidate_file


def run_parallel(queue: list[dict[str, str]], args: argparse.Namespace) -> None:
    total = len(queue)
    pending = list(enumerate(queue, start=1))
    running: dict[int, dict[str, object]] = {}
    failures: list[dict[str, object]] = []
    log_dir = args.log_dir
    if args.max_parallel > 1:
        log_dir.mkdir(parents=True, exist_ok=True)

    while pending or running:
        while pending and len(running) < args.max_parallel:
            index, row = pending.pop(0)
            command, candidate_file = build_validator_command(row, args)
            log_path = log_dir / f"{index:03d}_{row['iso3']}.log"
            log_handle = log_path.open("w", encoding="utf-8")
            if args.reuse_candidate_files and candidate_file.exists() and candidate_file.stat().st_size > 0:
                print(f"Using candidate file {candidate_file}")
            print(f"[start {index}/{total}] {row['countryName']} ({row['iso3']}) -> {log_path}")
            process = subprocess.Popen(command, stdout=log_handle, stderr=subprocess.STDOUT)
            running[process.pid] = {
                "process": process,
                "index": index,
                "row": row,
                "log_handle": log_handle,
                "log_path": log_path,
                "candidate_file": candidate_file,
            }

        finished_pid = None
        for pid, job in list(running.items()):
            process = job["process"]
            return_code = process.poll()
            if return_code is None:
                continue

            finished_pid = pid
            job["log_handle"].close()
            index = int(job["index"])
            row = job["row"]
            log_path = job["log_path"]
            if return_code == 0:
                print(f"[done  {index}/{total}] {row['countryName']} ({row['iso3']})")
            else:
                print(f"[fail  {index}/{total}] {row['countryName']} ({row['iso3']}) -> {log_path}")
                failures.append(
                    {
                        "index": index,
                        "row": row,
                        "return_code": return_code,
                        "log_path": log_path,
                    }
                )
            del running[pid]
            break

        if finished_pid is None and running:
            time.sleep(1.0)

    if failures:
        details = ", ".join(
            f"{failure['row']['iso3']} (exit {failure['return_code']}, log={failure['log_path']})"
            for failure in failures
        )
        raise SystemExit(f"{len(failures)} country builds failed: {details}")


def main() -> None:
    args = parse_args()
    requested_iso3 = [value.strip().upper() for value in args.countries.split(",") if value.strip()]
    excluded_iso3 = {value.strip().upper() for value in args.exclude_countries.split(",") if value.strip()}
    queue = selected_countries(
        args.region,
        requested_iso3,
        excluded_iso3,
        args.start_at or None,
        args.limit_countries,
        not args.include_validated,
    )

    if not queue:
        raise SystemExit("No countries matched the requested batch selection.")

    print(f"Selected {len(queue)} countries for region='{args.region}'.")
    for index, row in enumerate(queue, start=1):
        print(f"{index:02d}. {row['countryName']} ({row['iso3']})")

    if args.dry_run:
        return

    if args.max_parallel > 1:
        run_parallel(queue, args)
    else:
        for index, row in enumerate(queue, start=1):
            command, candidate_file = build_validator_command(row, args)
            print(f"\n[{index}/{len(queue)}] Building {row['countryName']} ({row['iso3']})")
            if args.reuse_candidate_files and candidate_file.exists() and candidate_file.stat().st_size > 0:
                print(f"Using candidate file {candidate_file}")
            run_command(command)

    if not args.skip_index_rebuild:
        print("\nRefreshing all-country pack index")
        run_command([sys.executable, "-u", str(INDEX_BUILDER_SCRIPT)])


if __name__ == "__main__":
    main()