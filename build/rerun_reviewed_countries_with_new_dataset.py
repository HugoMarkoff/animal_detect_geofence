#!/usr/bin/env python3
"""Rerun reviewed countries against the current dataset."""

from __future__ import annotations

import argparse
import csv
import subprocess
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent
AUDIT_DELTA_CSV = ROOT / "country-validation" / "new_geofence_audit_deltas.csv"
COUNTRY_VALIDATION_DIR = ROOT / "country-validation"
DENMARK_NEW_CANDIDATES = ROOT / "denmark_new_candidates.csv"
VALIDATOR_SCRIPT = ROOT / "build_denmark_precomputed_validation.py"
INDEX_BUILDER_SCRIPT = ROOT / "build_all_country_precomputed.py"
PENDING_WORKLIST_CSV = ROOT / "country-validation" / "new_geofence_pending_worklist.csv"
PENDING_COMPLETION_CSV = ROOT / "country-validation" / "new_geofence_pending_completion.csv"
PENDING_COMPLETION_REPORT = ROOT / "country-validation" / "new_geofence_pending_completion_report.md"
PENDING_SUBSET_DIR = ROOT / "country-validation" / "pending-subset"
PENDING_SUBSET_CANDIDATES_DIR = ROOT / "country-validation" / "pending-subset-candidates"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Rerun already-reviewed countries against the current animals-global dataset, "
            "optionally restricted to countries with expected-membership changes."
        )
    )
    parser.add_argument(
        "--audit-delta-csv",
        type=Path,
        default=AUDIT_DELTA_CSV,
        help="Audit delta CSV from audit_country_validation_against_current_dataset.py.",
    )
    parser.add_argument(
        "--country-validation-dir",
        type=Path,
        default=COUNTRY_VALIDATION_DIR,
        help="Directory containing reviewed country artifacts.",
    )
    parser.add_argument(
        "--countries",
        default="",
        help="Optional comma-separated ISO3 list to rerun explicitly.",
    )
    parser.add_argument(
        "--all-reviewed",
        action="store_true",
        help="Rerun all reviewed countries instead of only countries with delta rows.",
    )
    parser.add_argument(
        "--include-pending-new",
        action="store_true",
        help="Also include reviewed countries that still have new_candidates.csv rows even when they have no audit delta rows.",
    )
    parser.add_argument("--start-at", default="", help="Optional ISO3 to start from within the selected queue.")
    parser.add_argument("--limit-countries", type=int, default=None, help="Only rerun the first N countries in the queue.")
    parser.add_argument("--workers", type=int, default=6, help="Worker count passed through to the validator.")
    parser.add_argument(
        "--selection",
        choices=["expected-country", "expected-dnk", "global", "candidate-only"],
        default="expected-country",
        help="Selection mode passed through to the validator. Defaults to expected-country.",
    )
    parser.add_argument(
        "--skip-index-rebuild",
        action="store_true",
        help="Skip the final all-country precomputed index rebuild.",
    )
    parser.add_argument(
        "--worklist-csv",
        type=Path,
        default=PENDING_WORKLIST_CSV,
        help="CSV snapshot of the targeted pending rows before rerun starts.",
    )
    parser.add_argument(
        "--completion-csv",
        type=Path,
        default=PENDING_COMPLETION_CSV,
        help="CSV report of targeted pending rows with their post-rerun status/bucket.",
    )
    parser.add_argument(
        "--completion-report",
        type=Path,
        default=PENDING_COMPLETION_REPORT,
        help="Markdown summary of the targeted pending rows with post-rerun buckets.",
    )
    parser.add_argument(
        "--subset-artifact-dir",
        type=Path,
        default=PENDING_SUBSET_DIR,
        help="Output directory used when --selection candidate-only writes subset-only validation artifacts.",
    )
    parser.add_argument(
        "--subset-candidate-dir",
        type=Path,
        default=PENDING_SUBSET_CANDIDATES_DIR,
        help="Directory of generated per-country candidate CSVs when --selection candidate-only is used.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print the queue without running validators.")
    return parser.parse_args()


def sort_key(value: str | None) -> str:
    return str(value or "").strip().lower()


def reviewed_country_rows(country_validation_dir: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if DENMARK_NEW_CANDIDATES.exists() or (ROOT / "denmark_species_validation.csv").exists():
        rows.append({"iso3": "DNK", "countryName": read_country_name("DNK", country_validation_dir)})

    if country_validation_dir.exists():
        for child in sorted(country_validation_dir.iterdir(), key=lambda path: path.name):
            if not child.is_dir():
                continue
            if not (child / "species_validation.csv").exists():
                continue
            iso3 = child.name.strip().upper()
            rows.append({"iso3": iso3, "countryName": read_country_name(iso3, country_validation_dir)})

    return rows


def summary_path_for(country_iso3: str, country_validation_dir: Path) -> Path:
    normalized_iso3 = str(country_iso3 or "").strip().upper()
    if normalized_iso3 == "DNK":
        return ROOT / "denmark_precomputed_validation_summary.txt"
    return country_validation_dir / normalized_iso3 / "precomputed_validation_summary.txt"


def read_country_name(country_iso3: str, country_validation_dir: Path) -> str:
    summary_path = summary_path_for(country_iso3, country_validation_dir)
    if summary_path.exists():
        with summary_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("Country: "):
                    return line.split("Country: ", 1)[1].rsplit(" (", 1)[0].strip()
    return str(country_iso3 or "").strip().upper()


def changed_country_codes(audit_delta_csv: Path) -> set[str]:
    changed: set[str] = set()
    if not audit_delta_csv.exists():
        raise SystemExit(f"Audit delta CSV not found: {audit_delta_csv}")

    with audit_delta_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            iso3 = str(row.get("countryIso3") or "").strip().upper()
            if iso3:
                changed.add(iso3)
    return changed


def default_candidate_file(country_iso3: str, country_validation_dir: Path) -> Path | None:
    normalized_iso3 = str(country_iso3 or "").strip().upper()
    if normalized_iso3 == "DNK":
        candidate_path = DENMARK_NEW_CANDIDATES
        return candidate_path if csv_has_data_rows(candidate_path) else None

    candidate_path = country_validation_dir / normalized_iso3 / "new_candidates.csv"
    return candidate_path if csv_has_data_rows(candidate_path) else None


def csv_has_data_rows(path: Path | None) -> bool:
    if path is None or not path.exists() or path.stat().st_size <= 0:
        return False

    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        next(reader, None)
        return next(reader, None) is not None


def default_species_validation_file(country_iso3: str, country_validation_dir: Path, artifact_dir: Path | None = None) -> Path | None:
    normalized_iso3 = str(country_iso3 or "").strip().upper()
    if artifact_dir is not None:
        path = artifact_dir / normalized_iso3 / "species_validation.csv"
    elif normalized_iso3 == "DNK":
        path = ROOT / "denmark_species_validation.csv"
    else:
        path = country_validation_dir / normalized_iso3 / "species_validation.csv"
    return path if path.exists() else None


def pending_subset_paths(country_iso3: str, subset_artifact_dir: Path) -> dict[str, Path]:
    normalized_iso3 = str(country_iso3 or "").strip().upper()
    country_dir = subset_artifact_dir / normalized_iso3
    return {
        "output": country_dir / "precomputed_validation.json",
        "legacy_output": country_dir / "legacy_precomputed_country_footprints.json",
        "audit_csv": country_dir / "species_validation.csv",
        "new_csv": country_dir / "new_candidates.csv",
        "summary": country_dir / "precomputed_validation_summary.txt",
    }


def pending_key(country_iso3: str, row: dict[str, str]) -> tuple[str, str]:
    item_id = str(row.get("itemId") or "").strip().lower()
    if item_id:
        return (country_iso3, item_id)
    return (country_iso3, str(row.get("binomial") or "").strip().lower())


def merge_pending_row(
    merged_rows: dict[tuple[str, str], dict[str, object]],
    *,
    country_iso3: str,
    country_name: str,
    row: dict[str, str],
    source_kind: str,
    changed_old_status: str = "",
    changed_old_bucket: str = "",
) -> None:
    key = pending_key(country_iso3, row)
    existing = merged_rows.get(key)
    if existing is None:
        existing = {
            "countryIso3": country_iso3,
            "countryName": country_name,
            "itemId": str(row.get("itemId") or "").strip(),
            "commonName": str(row.get("commonName") or "").strip(),
            "binomial": str(row.get("binomial") or "").strip(),
            "fromNewUnchecked": False,
            "fromChangedAdded": False,
            "sourceKinds": [],
            "changedOldStatus": "",
            "changedOldBucket": "",
            "finalStatus": "",
            "finalBucket": "",
            "finalExpected": "",
            "finalNote": "",
            "completed": False,
        }
        merged_rows[key] = existing

    if source_kind == "new_unchecked":
        existing["fromNewUnchecked"] = True
    elif source_kind == "changed_added":
        existing["fromChangedAdded"] = True
        if changed_old_status:
            existing["changedOldStatus"] = changed_old_status
        if changed_old_bucket:
            existing["changedOldBucket"] = changed_old_bucket

    source_kinds = existing["sourceKinds"]
    if isinstance(source_kinds, list) and source_kind not in source_kinds:
        source_kinds.append(source_kind)


def build_pending_worklist(rows: list[dict[str, str]], args: argparse.Namespace) -> list[dict[str, object]]:
    selected_by_iso3 = {row["iso3"]: row for row in rows}
    merged_rows: dict[tuple[str, str], dict[str, object]] = {}

    for country_iso3, country_row in selected_by_iso3.items():
        candidate_file = default_candidate_file(country_iso3, args.country_validation_dir)
        if candidate_file is None:
            continue
        with candidate_file.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                merge_pending_row(
                    merged_rows,
                    country_iso3=country_iso3,
                    country_name=country_row["countryName"],
                    row=row,
                    source_kind="new_unchecked",
                )

    with args.audit_delta_csv.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            country_iso3 = str(row.get("countryIso3") or "").strip().upper()
            if country_iso3 not in selected_by_iso3:
                continue
            if str(row.get("deltaType") or "").strip().lower() != "added":
                continue
            merge_pending_row(
                merged_rows,
                country_iso3=country_iso3,
                country_name=selected_by_iso3[country_iso3]["countryName"],
                row=row,
                source_kind="changed_added",
                changed_old_status=str(row.get("oldStatus") or "").strip(),
                changed_old_bucket=str(row.get("oldBucket") or "").strip(),
            )

    pending_rows = list(merged_rows.values())
    pending_rows.sort(key=lambda row: (sort_key(str(row["countryName"])), sort_key(str(row["commonName"] or row["binomial"])), str(row["itemId"])))
    return pending_rows


def write_pending_candidate_files(rows: list[dict[str, object]], candidate_dir: Path) -> dict[str, Path]:
    grouped_rows: dict[str, list[dict[str, object]]] = {}
    for row in rows:
        grouped_rows.setdefault(str(row["countryIso3"]), []).append(row)

    paths: dict[str, Path] = {}
    for country_iso3, country_rows in grouped_rows.items():
        path = candidate_dir / f"{country_iso3}.csv"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["itemId", "commonName", "binomial"])
            writer.writeheader()
            for row in sorted(country_rows, key=lambda value: (sort_key(str(value["commonName"] or value["binomial"])), str(value["itemId"]))):
                writer.writerow(
                    {
                        "itemId": row.get("itemId") or "",
                        "commonName": row.get("commonName") or "",
                        "binomial": row.get("binomial") or "",
                    }
                )
        paths[country_iso3] = path

    return paths


def write_pending_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "countryIso3",
        "countryName",
        "itemId",
        "commonName",
        "binomial",
        "fromNewUnchecked",
        "fromChangedAdded",
        "sourceKinds",
        "changedOldStatus",
        "changedOldBucket",
        "finalStatus",
        "finalBucket",
        "finalExpected",
        "finalNote",
        "completed",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            serialized = dict(row)
            source_kinds = serialized.get("sourceKinds") or []
            if isinstance(source_kinds, list):
                serialized["sourceKinds"] = ",".join(source_kinds)
            writer.writerow(serialized)


def finalize_pending_rows(rows: list[dict[str, object]], country_validation_dir: Path, artifact_dir: Path | None = None) -> list[dict[str, object]]:
    validation_rows_by_country: dict[str, dict[tuple[str, str], dict[str, str]]] = {}

    for row in rows:
        country_iso3 = str(row["countryIso3"])
        if country_iso3 in validation_rows_by_country:
            continue
        path = default_species_validation_file(country_iso3, country_validation_dir, artifact_dir)
        lookup: dict[tuple[str, str], dict[str, str]] = {}
        if path is not None:
            with path.open("r", encoding="utf-8", newline="") as handle:
                reader = csv.DictReader(handle)
                for validation_row in reader:
                    lookup[pending_key(country_iso3, validation_row)] = validation_row
        validation_rows_by_country[country_iso3] = lookup

    finalized_rows: list[dict[str, object]] = []
    for row in rows:
        country_iso3 = str(row["countryIso3"])
        lookup = validation_rows_by_country.get(country_iso3, {})
        match = lookup.get(pending_key(country_iso3, {"itemId": str(row.get("itemId") or ""), "binomial": str(row.get("binomial") or "")}))
        finalized = dict(row)
        if match is not None:
            finalized["finalStatus"] = str(match.get("status") or "")
            finalized["finalBucket"] = str(match.get("bucket") or "")
            finalized["finalExpected"] = str(match.get("expected") or "")
            finalized["finalNote"] = str(match.get("note") or "")
            finalized["completed"] = True
        finalized_rows.append(finalized)

    return finalized_rows


def write_completion_report(path: Path, rows: list[dict[str, object]], countries_selected: int) -> None:
    raw_new_unchecked = sum(1 for row in rows if row.get("fromNewUnchecked"))
    raw_changed_added = sum(1 for row in rows if row.get("fromChangedAdded"))
    completed_count = sum(1 for row in rows if row.get("completed"))
    final_bucket_counts = Counter(str(row.get("finalBucket") or "Missing") for row in rows)
    expected_true_count = sum(1 for row in rows if str(row.get("finalExpected") or "") == "True")
    combined_expected_bucket_count = sum(
        1 for row in rows if str(row.get("finalBucket") or "") in {"Likely Valid", "Needs Review"}
    )
    expected_not_combined = sum(
        1
        for row in rows
        if str(row.get("finalExpected") or "") == "True"
        and str(row.get("finalBucket") or "") not in {"Likely Valid", "Needs Review"}
    )
    combined_not_expected = sum(
        1
        for row in rows
        if str(row.get("finalBucket") or "") in {"Likely Valid", "Needs Review"}
        and str(row.get("finalExpected") or "") != "True"
    )
    new_already_expected = sum(
        1
        for row in rows
        if str(row.get("finalBucket") or "") == "New"
        and str(row.get("finalExpected") or "") == "True"
    )
    source_bucket_counts: dict[str, Counter[str]] = {
        "new_unchecked": Counter(),
        "changed_added": Counter(),
    }
    per_country_counts: dict[str, Counter[str]] = {}
    for row in rows:
        iso3 = str(row.get("countryIso3") or "")
        bucket_name = str(row.get("finalBucket") or "Missing")
        counter = per_country_counts.setdefault(iso3, Counter())
        counter["targeted"] += 1
        if row.get("fromNewUnchecked"):
            counter["new_unchecked"] += 1
            source_bucket_counts["new_unchecked"][bucket_name] += 1
        if row.get("fromChangedAdded"):
            counter["changed_added"] += 1
            source_bucket_counts["changed_added"][bucket_name] += 1
        counter[bucket_name] += 1
        if row.get("completed"):
            counter["completed"] += 1

    lines = [
        "# Pending New + Changed Completion Report",
        "",
        f"- Countries rerun in this pass: {countries_selected}",
        f"- Targeted unique country/species pairs: {len(rows)}",
        f"- Raw `new unchecked` rows covered: {raw_new_unchecked}",
        f"- Raw `changed` additions covered: {raw_changed_added}",
        f"- Completed rows found in refreshed outputs: {completed_count}",
        f"- Missing rows after rerun: {len(rows) - completed_count}",
        "",
        "## Final Buckets",
        "",
        f"- Likely Valid: {final_bucket_counts.get('Likely Valid', 0)}",
        f"- New: {final_bucket_counts.get('New', 0)}",
        f"- Needs Review: {final_bucket_counts.get('Needs Review', 0)}",
        f"- Unlisted: {final_bucket_counts.get('Unlisted', 0)}",
        f"- Missing: {final_bucket_counts.get('Missing', 0)}",
        "",
        "## Consistency Checks",
        "",
        f"- Rows expected by the new geofence (`finalExpected=True`): {expected_true_count}",
        f"- Rows bucketed as `Likely Valid + Needs Review`: {combined_expected_bucket_count}",
        f"- Expected rows not in `Likely Valid + Needs Review`: {expected_not_combined}",
        f"- `Likely Valid + Needs Review` rows not expected by the new geofence: {combined_not_expected}",
        f"- `New` rows already expected by the new geofence: {new_already_expected}",
        "",
        "## Source Breakdown",
        "",
        f"- `new unchecked` -> Likely Valid: {source_bucket_counts['new_unchecked'].get('Likely Valid', 0)}, New: {source_bucket_counts['new_unchecked'].get('New', 0)}, Needs Review: {source_bucket_counts['new_unchecked'].get('Needs Review', 0)}, Unlisted: {source_bucket_counts['new_unchecked'].get('Unlisted', 0)}, Missing: {source_bucket_counts['new_unchecked'].get('Missing', 0)}",
        f"- `changed` additions -> Likely Valid: {source_bucket_counts['changed_added'].get('Likely Valid', 0)}, New: {source_bucket_counts['changed_added'].get('New', 0)}, Needs Review: {source_bucket_counts['changed_added'].get('Needs Review', 0)}, Unlisted: {source_bucket_counts['changed_added'].get('Unlisted', 0)}, Missing: {source_bucket_counts['changed_added'].get('Missing', 0)}",
        "",
        "## Per Country",
        "",
        "| Country | ISO3 | Targeted | New Unchecked | Changed Added | Likely Valid | New | Needs Review | Unlisted | Missing | Completed |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]

    seen_iso3: set[str] = set()
    for row in sorted(rows, key=lambda entry: (sort_key(str(entry["countryName"])), str(entry["countryIso3"]))):
        iso3 = str(row["countryIso3"])
        if iso3 in seen_iso3:
            continue
        seen_iso3.add(iso3)
        counts = per_country_counts[iso3]
        lines.append(
            f"| {row['countryName']} | {iso3} | {counts.get('targeted', 0)} | {counts.get('new_unchecked', 0)} | {counts.get('changed_added', 0)} | {counts.get('Likely Valid', 0)} | {counts.get('New', 0)} | {counts.get('Needs Review', 0)} | {counts.get('Unlisted', 0)} | {counts.get('Missing', 0)} | {counts.get('completed', 0)} |"
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def selected_rows(args: argparse.Namespace) -> list[dict[str, str]]:
    reviewed_rows = reviewed_country_rows(args.country_validation_dir)
    by_iso3 = {row["iso3"]: row for row in reviewed_rows}

    requested_iso3 = [value.strip().upper() for value in args.countries.split(",") if value.strip()]
    if requested_iso3:
        rows = [by_iso3[iso3] for iso3 in requested_iso3 if iso3 in by_iso3]
    else:
        rows = reviewed_rows
        if not args.all_reviewed:
            included_iso3 = changed_country_codes(args.audit_delta_csv)
            if args.include_pending_new:
                included_iso3.update(
                    row["iso3"]
                    for row in reviewed_rows
                    if default_candidate_file(row["iso3"], args.country_validation_dir) is not None
                )
            rows = [row for row in rows if row["iso3"] in included_iso3]

    rows = sorted(rows, key=lambda row: (sort_key(row["countryName"]), row["iso3"]))

    if args.start_at:
        start_iso3 = args.start_at.strip().upper()
        while rows and rows[0]["iso3"] != start_iso3:
            rows = rows[1:]

    if args.limit_countries is not None:
        rows = rows[: max(0, args.limit_countries)]

    return rows


def run_command(command: list[str]) -> None:
    subprocess.run(command, check=True)


def main() -> None:
    args = parse_args()
    rows = selected_rows(args)

    if not rows:
        raise SystemExit("No reviewed countries matched the requested rerun selection.")

    pending_rows = build_pending_worklist(rows, args)
    write_pending_csv(args.worklist_csv, pending_rows)
    raw_new_unchecked = sum(1 for row in pending_rows if row.get("fromNewUnchecked"))
    raw_changed_added = sum(1 for row in pending_rows if row.get("fromChangedAdded"))
    pending_counts_by_country = Counter(str(row["countryIso3"]) for row in pending_rows)

    print(f"Selected {len(rows)} reviewed countries for rerun.")
    for index, row in enumerate(rows, start=1):
        if args.selection == "candidate-only":
            candidate_label = f"pending:{pending_counts_by_country.get(row['iso3'], 0)}"
        else:
            candidate_file = default_candidate_file(row["iso3"], args.country_validation_dir)
            candidate_label = str(candidate_file) if candidate_file is not None else "none"
        print(f"{index:02d}. {row['iso3']} candidate-file={candidate_label}")

    print(
        f"Snapshot {len(pending_rows)} unique pending rows "
        f"({raw_new_unchecked} new unchecked, {raw_changed_added} changed additions) to {args.worklist_csv}"
    )

    if args.dry_run:
        return

    pending_candidate_files: dict[str, Path] = {}
    if args.selection == "candidate-only":
        pending_candidate_files = write_pending_candidate_files(pending_rows, args.subset_candidate_dir)
        print(f"Wrote {len(pending_candidate_files)} generated pending candidate files to {args.subset_candidate_dir}")

    for index, row in enumerate(rows, start=1):
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
        if args.selection == "candidate-only":
            candidate_file = pending_candidate_files.get(row["iso3"])
            subset_paths = pending_subset_paths(row["iso3"], args.subset_artifact_dir)
            command.extend(["--output", str(subset_paths["output"])])
            command.extend(["--legacy-output", str(subset_paths["legacy_output"])])
            command.extend(["--audit-csv", str(subset_paths["audit_csv"])])
            command.extend(["--new-csv", str(subset_paths["new_csv"])])
            command.extend(["--summary", str(subset_paths["summary"])])
        else:
            candidate_file = default_candidate_file(row["iso3"], args.country_validation_dir)
        if candidate_file is not None:
            command.extend(["--candidate-file", str(candidate_file)])

        print(f"\n[{index}/{len(rows)}] Rerunning {row['iso3']}")
        if candidate_file is not None:
            print(f"Using candidate file {candidate_file}")
        run_command(command)

    if args.selection == "candidate-only":
        print("\nSkipping all-country precomputed index rebuild because candidate-only mode writes subset artifacts only")
    elif not args.skip_index_rebuild:
        print("\nRefreshing all-country precomputed index")
        run_command([sys.executable, "-u", str(INDEX_BUILDER_SCRIPT)])

    artifact_dir = args.subset_artifact_dir if args.selection == "candidate-only" else None
    finalized_rows = finalize_pending_rows(pending_rows, args.country_validation_dir, artifact_dir)
    write_pending_csv(args.completion_csv, finalized_rows)
    write_completion_report(args.completion_report, finalized_rows, len(rows))
    completed_count = sum(1 for row in finalized_rows if row.get("completed"))
    print(f"Wrote pending completion CSV to {args.completion_csv}")
    print(f"Wrote pending completion report to {args.completion_report}")
    print(f"Completed {completed_count}/{len(finalized_rows)} targeted pending rows")


if __name__ == "__main__":
    main()