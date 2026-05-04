from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote

from flask import Flask, jsonify, request, send_from_directory

ROOT_DIR = Path(__file__).resolve().parent.parent
APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
DATA_DIR = ROOT_DIR / "data"
PRECOMPUTED_DIR = DATA_DIR / "precomputed-countries"
DEFAULT_GITHUB_REPO = "HugoMarkoff/animal_detect_geofence"

STATUS_TO_BUCKET = {
    "likely_true_one_source": "Likely Valid",
    "likely_false": "Needs Review",
    "new_record": "New",
}

FOOTPRINT_DEFAULTS = {
    "countrywide": {
        "label": "National footprint",
        "short": "National",
        "note": "This species is currently treated as national coverage in the selected country.",
    },
    "regional": {
        "label": "Regional footprint",
        "short": "Regional",
        "note": "This species is currently restricted to one or more mapped regional areas.",
    },
    "no_points": {
        "label": "No mapped points",
        "short": "No points",
        "note": "No mapped coordinates are stored for this species in the current pack.",
    },
    "needs_review": {
        "label": "Needs review",
        "short": "Review",
        "note": "This species is still flagged for manual review in the current pack.",
    },
    "country_pack_only": {
        "label": "Country pack only",
        "short": "Country-level",
        "note": "This country currently only has country-level membership in the precomputed pack, without national or regional footprint geometry.",
    },
    "unscored": {
        "label": "No footprint yet",
        "short": "Unscored",
        "note": "This entry has no stored national or regional footprint in the current pack.",
    },
}

SUGGESTION_TYPES = {"addition", "correction", "removal"}
FOOTPRINT_SCOPE_TYPES = {"national", "regional"}
MAX_GITHUB_URL_LENGTH = 7000

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def status_to_bucket(status: str | None) -> str:
    return STATUS_TO_BUCKET.get(status or "", "Needs Review")


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def sort_key(value: str | None) -> str:
    return clean_text(value).casefold()


def round_coordinate(value: float) -> float:
    return round(value, 6)


def sanitize_polygon(raw_polygon: Any) -> list[list[float]]:
    if not isinstance(raw_polygon, list):
        return []

    polygon: list[list[float]] = []
    for point in raw_polygon:
        if not isinstance(point, list) or len(point) < 2:
            continue
        try:
            latitude = float(point[0])
            longitude = float(point[1])
        except (TypeError, ValueError):
            continue
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            continue
        polygon.append([round_coordinate(latitude), round_coordinate(longitude)])

    return polygon if len(polygon) >= 3 else []


def sanitize_polygons(raw_polygons: Any) -> list[list[list[float]]]:
    if not isinstance(raw_polygons, list):
        return []
    polygons = [sanitize_polygon(polygon) for polygon in raw_polygons]
    return [polygon for polygon in polygons if len(polygon) >= 3]


def latlng_polygon_to_geojson_ring(polygon: list[list[float]]) -> list[list[float]]:
    ring = [[point[1], point[0]] for point in polygon]
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def species_label(animal: dict[str, Any] | None, fallback: str = "Unknown species") -> str:
    if not animal:
        return fallback

    common_name = clean_text(animal.get("commonName"))
    binomial = clean_text(animal.get("binomial"))
    if common_name and binomial:
        return f"{common_name} ({binomial})"
    return common_name or binomial or fallback


@lru_cache(maxsize=1)
def load_animal_indexes() -> dict[str, Any]:
    dataset = load_json(DATA_DIR / "animals-global.json")
    by_id: dict[str, dict[str, Any]] = {}
    catalog: list[dict[str, Any]] = []

    for item in dataset.get("items", []):
        item_id = clean_text(item.get("id"))
        if not item_id:
            continue

        by_id[item_id] = item
        catalog.append(
            {
                "itemId": item_id,
                "commonName": item.get("commonName"),
                "binomial": item.get("binomial"),
                "classLabel": item.get("classLabel"),
                "label": species_label(item),
            }
        )

    catalog.sort(key=lambda entry: (sort_key(entry.get("commonName")), sort_key(entry.get("binomial"))))

    return {
        "by_id": by_id,
        "catalog": catalog,
    }


@lru_cache(maxsize=1)
def load_country_catalog() -> list[dict[str, Any]]:
    payload = load_json(PRECOMPUTED_DIR / "index.json")
    countries = payload.get("countries", [])
    return sorted(countries, key=lambda entry: sort_key(entry.get("countryName")))


@lru_cache(maxsize=1)
def load_country_catalog_index() -> dict[str, dict[str, Any]]:
    return {clean_text(entry.get("iso3")).upper(): entry for entry in load_country_catalog()}


@lru_cache(maxsize=None)
def load_country_pack(iso3: str) -> dict[str, Any]:
    normalized_iso3 = clean_text(iso3).upper()
    path = PRECOMPUTED_DIR / f"{normalized_iso3}.json"
    if not path.exists():
        raise FileNotFoundError(f"No precomputed pack found for {normalized_iso3}.")
    return load_json(path)


def resolve_observation_profile(entry: dict[str, Any], pack_mode: str | None) -> dict[str, Any]:
    raw_profile = entry.get("observationProfile") or {}
    code = clean_text(raw_profile.get("code"))

    if not code:
        code = "country_pack_only" if pack_mode == "baseline" else "unscored"

    defaults = FOOTPRINT_DEFAULTS.get(code, FOOTPRINT_DEFAULTS["unscored"])
    polygon = sanitize_polygon(raw_profile.get("footprintPolygonLatLngs") or [])

    return {
        "code": code,
        "label": clean_text(raw_profile.get("label")) or defaults["label"],
        "short": clean_text(raw_profile.get("short")) or defaults["short"],
        "note": clean_text(raw_profile.get("note")) or defaults["note"],
        "footprintPolygonLatLngs": polygon,
        "significant": bool(raw_profile.get("significant")),
    }


@lru_cache(maxsize=None)
def load_country_species(iso3: str) -> dict[str, Any]:
    normalized_iso3 = clean_text(iso3).upper()
    pack = load_country_pack(normalized_iso3)
    catalog_entry = load_country_catalog_index().get(normalized_iso3, {})
    animal_by_id = load_animal_indexes()["by_id"]
    species_entries: list[dict[str, Any]] = []
    group_counts: dict[str, int] = {}

    for raw_entry in pack.get("entries", []):
        item_id = clean_text(raw_entry.get("itemId"))
        if not item_id:
            continue

        animal = animal_by_id.get(item_id, {})
        observation_profile = resolve_observation_profile(raw_entry, pack.get("precomputeMode"))
        footprint_code = observation_profile["code"]
        group_counts[footprint_code] = group_counts.get(footprint_code, 0) + 1

        species_entries.append(
            {
                "itemId": item_id,
                "label": species_label(animal),
                "commonName": animal.get("commonName"),
                "binomial": animal.get("binomial"),
                "classLabel": animal.get("classLabel"),
                "status": raw_entry.get("status"),
                "bucket": status_to_bucket(raw_entry.get("status")),
                "expected": raw_entry.get("expected"),
                "footprintCode": footprint_code,
                "footprintLabel": observation_profile["label"],
                "footprintShort": observation_profile["short"],
                "footprintNote": observation_profile["note"],
                "polygonLatLngs": observation_profile["footprintPolygonLatLngs"],
                "hasPolygon": len(observation_profile["footprintPolygonLatLngs"]) >= 3,
            }
        )

    species_entries.sort(key=lambda entry: (sort_key(entry.get("commonName")), sort_key(entry.get("binomial"))))

    return {
        "iso3": normalized_iso3,
        "countryName": pack.get("countryName") or catalog_entry.get("countryName") or normalized_iso3,
        "precomputeMode": pack.get("precomputeMode") or catalog_entry.get("precomputeMode") or "unknown",
        "summary": pack.get("summary") or {
            "total": len(species_entries),
            "statusCounts": {},
            "bucketCounts": {},
        },
        "groups": group_counts,
        "species": species_entries,
    }


@lru_cache(maxsize=None)
def load_country_species_index(iso3: str) -> dict[str, dict[str, Any]]:
    country_species = load_country_species(iso3)
    return {entry["itemId"]: entry for entry in country_species["species"]}


@lru_cache(maxsize=None)
def load_country_regional_overlay(iso3: str) -> dict[str, Any]:
    country_species = load_country_species(iso3)
    grouped: dict[str, dict[str, Any]] = {}

    for entry in country_species["species"]:
        if entry.get("footprintCode") != "regional":
            continue
        polygon = entry.get("polygonLatLngs") or []
        if len(polygon) < 3:
            continue

        polygon_key = json.dumps(polygon, separators=(",", ":"), ensure_ascii=True)
        feature = grouped.setdefault(
            polygon_key,
            {
                "polygon": polygon,
                "species": [],
            },
        )
        feature["species"].append(
            {
                "itemId": entry.get("itemId"),
                "label": entry.get("label"),
                "commonName": entry.get("commonName"),
                "binomial": entry.get("binomial"),
                "classLabel": entry.get("classLabel"),
                "bucket": entry.get("bucket"),
            }
        )

    features: list[dict[str, Any]] = []
    for entry in grouped.values():
        species = sorted(
            entry["species"],
            key=lambda item: (sort_key(item.get("commonName")), sort_key(item.get("binomial"))),
        )
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "countryIso3": country_species["iso3"],
                    "countryName": country_species["countryName"],
                    "species": species,
                    "speciesCount": len(species),
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [latlng_polygon_to_geojson_ring(entry["polygon"])],
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def require_country_species(country_iso3: str) -> dict[str, Any]:
    try:
        return load_country_species(country_iso3)
    except FileNotFoundError as exc:
        raise ValueError(str(exc)) from exc


def build_proposed_species(payload: dict[str, Any], animals_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    item_id = clean_text(payload.get("proposedSpeciesItemId"))
    animal = animals_by_id.get(item_id) if item_id else None
    custom_label = clean_text(payload.get("proposedSpeciesLabel"))

    if animal:
        return {
            "itemId": item_id,
            "label": species_label(animal),
            "commonName": animal.get("commonName"),
            "binomial": animal.get("binomial"),
            "classLabel": animal.get("classLabel"),
            "isKnown": True,
        }

    if custom_label:
        return {
            "itemId": None,
            "label": custom_label,
            "commonName": None,
            "binomial": None,
            "classLabel": None,
            "isKnown": False,
        }

    return {
        "itemId": None,
        "label": "",
        "commonName": None,
        "binomial": None,
        "classLabel": None,
        "isKnown": False,
    }


def normalize_ticket_payload(payload: dict[str, Any]) -> dict[str, Any]:
    country_iso3 = clean_text(payload.get("countryIso3")).upper()
    if not country_iso3:
        raise ValueError("Country is required.")

    country_species = require_country_species(country_iso3)
    country_species_index = load_country_species_index(country_iso3)
    animals_by_id = load_animal_indexes()["by_id"]

    suggestion_type = clean_text(payload.get("suggestionType")).lower()
    if suggestion_type not in SUGGESTION_TYPES:
        raise ValueError("Suggestion type must be addition, correction, or removal.")

    explanation = clean_text(payload.get("explanation"))
    if not explanation:
        raise ValueError("Explanation is required.")

    github_repo = clean_text(payload.get("githubRepo")) or clean_text(os.environ.get("GITHUB_ISSUE_REPO"))
    current_species_id = clean_text(payload.get("currentSpeciesItemId"))
    current_species = country_species_index.get(current_species_id)

    if suggestion_type in {"correction", "removal"} and not current_species:
        raise ValueError("Select a current species from the chosen country.")

    scope = None
    polygons: list[list[list[float]]] = []
    proposed_species = {
        "itemId": None,
        "label": "",
        "commonName": None,
        "binomial": None,
        "classLabel": None,
        "isKnown": False,
    }

    if suggestion_type != "removal":
        scope = clean_text(payload.get("scope")).lower()
        if scope not in FOOTPRINT_SCOPE_TYPES:
            raise ValueError("Choose national or regional coverage for additions and corrections.")

        proposed_species = build_proposed_species(payload, animals_by_id)
        if not proposed_species["label"]:
            raise ValueError("Choose or type the species for the proposed update.")

        polygons = sanitize_polygons(payload.get("polygons"))
        if scope == "regional" and not polygons:
            raise ValueError("Draw at least one regional polygon before building the ticket.")

    scope_label = "Regional" if scope == "regional" else "National" if scope == "national" else None

    return {
        "countryIso3": country_species["iso3"],
        "countryName": country_species["countryName"],
        "countryPrecomputeMode": country_species["precomputeMode"],
        "countrySummary": country_species["summary"],
        "countryGroups": country_species["groups"],
        "githubRepo": github_repo,
        "suggestionType": suggestion_type,
        "suggestionTypeLabel": suggestion_type.title(),
        "scope": scope,
        "scopeLabel": scope_label,
        "explanation": explanation,
        "currentSpecies": current_species,
        "proposedSpecies": proposed_species,
        "polygons": polygons,
    }


def build_issue_title(ticket: dict[str, Any]) -> str:
    prefix = f"[{ticket['countryIso3']}]"

    if ticket["suggestionType"] == "removal":
        return f"{prefix} Remove {ticket['currentSpecies']['label']} from the country pack"

    if ticket["suggestionType"] == "addition":
        return f"{prefix} Add {ticket['proposedSpecies']['label']} as {ticket['scopeLabel'].lower()}"

    current_label = ticket["currentSpecies"]["label"]
    proposed_label = ticket["proposedSpecies"]["label"]
    if current_label == proposed_label:
        return f"{prefix} Adjust {current_label} to {ticket['scopeLabel'].lower()}"
    return f"{prefix} Correct {current_label} to {proposed_label}"


def build_issue_body(ticket: dict[str, Any]) -> str:
    lines = [
        "## Requested update",
        f"- Country: {ticket['countryName']} ({ticket['countryIso3']})",
        f"- Pack mode: {ticket['countryPrecomputeMode']}",
        f"- Suggestion type: {ticket['suggestionTypeLabel']}",
    ]

    if ticket["currentSpecies"]:
        lines.append(f"- Current species: {ticket['currentSpecies']['label']}")
        lines.append(f"- Current footprint: {ticket['currentSpecies']['footprintLabel']}")
        lines.append(f"- Current status bucket: {ticket['currentSpecies']['bucket']}")

    if ticket["proposedSpecies"]["label"]:
        lines.append(f"- Proposed species: {ticket['proposedSpecies']['label']}")

    if ticket["scopeLabel"]:
        lines.append(f"- Requested coverage: {ticket['scopeLabel']}")

    summary = ticket["countrySummary"] or {}
    lines.append(f"- Country pack total: {summary.get('total', 0)}")
    lines.append(f"- Regional species currently mapped: {ticket['countryGroups'].get('regional', 0)}")

    lines.extend(
        [
            "",
            "## Explanation",
            ticket["explanation"],
        ]
    )

    if ticket["polygons"]:
        lines.extend(
            [
                "",
                "## Proposed regional polygons",
                "Coordinates are in `[latitude, longitude]` order.",
                "```json",
                json.dumps(ticket["polygons"], indent=2),
                "```",
            ]
        )

    if ticket["currentSpecies"] and ticket["currentSpecies"].get("polygonLatLngs"):
        lines.extend(
            [
                "",
                "## Current stored polygon",
                "```json",
                json.dumps(ticket["currentSpecies"].get("polygonLatLngs"), indent=2),
                "```",
            ]
        )

    lines.extend(
        [
            "",
            "## Notes",
            "- Generated from the local species review suggestion app.",
            "- This draft is based on the current precomputed country pack in the workspace.",
        ]
    )

    return "\n".join(lines).strip()


def build_github_issue_url(repository: str, title: str, body: str) -> str | None:
    if not repository:
        return None
    base_url = f"https://github.com/{repository}/issues/new"
    url = f"{base_url}?title={quote(title)}&body={quote(body)}"
    return url if len(url) <= MAX_GITHUB_URL_LENGTH else None


def build_ticket_preview(payload: dict[str, Any]) -> dict[str, Any]:
    ticket = normalize_ticket_payload(payload)
    title = build_issue_title(ticket)
    body = build_issue_body(ticket)
    github_issue_url = build_github_issue_url(ticket["githubRepo"], title, body)
    warnings: list[str] = []

    if ticket["githubRepo"] and not github_issue_url:
        warnings.append("The GitHub draft URL would be too long. Use Copy Markdown instead.")
    if not ticket["githubRepo"]:
        warnings.append("Set a GitHub repo to enable Open GitHub Draft.")

    return {
        "title": title,
        "body": body,
        "githubRepo": ticket["githubRepo"],
        "githubIssueUrl": github_issue_url,
        "warnings": warnings,
        "ticket": ticket,
    }


@app.get("/")
def index() -> Any:
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/api/settings")
def api_settings() -> Any:
    return jsonify(
        {
            "defaultGithubRepo": clean_text(os.environ.get("GITHUB_ISSUE_REPO")) or DEFAULT_GITHUB_REPO,
        }
    )


@app.get("/api/countries")
def api_countries() -> Any:
    return jsonify({"countries": load_country_catalog()})


@app.get("/api/animals")
def api_animals() -> Any:
    return jsonify({"animals": load_animal_indexes()["catalog"]})


@app.get("/api/countries/<iso3>/species")
def api_country_species(iso3: str) -> Any:
    try:
        return jsonify(load_country_species(iso3))
    except FileNotFoundError:
        return jsonify({"error": f"No precomputed pack found for {clean_text(iso3).upper()}."}), 404


@app.get("/api/countries/<iso3>/regional-overlays")
def api_country_regional_overlays(iso3: str) -> Any:
    try:
        return jsonify(load_country_regional_overlay(iso3))
    except FileNotFoundError:
        return jsonify({"error": f"No precomputed pack found for {clean_text(iso3).upper()}."}), 404


@app.post("/api/tickets/preview")
def api_ticket_preview() -> Any:
    payload = request.get_json(silent=True) or {}
    try:
        return jsonify(build_ticket_preview(payload))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5070"))
    app.run(debug=True, port=port)