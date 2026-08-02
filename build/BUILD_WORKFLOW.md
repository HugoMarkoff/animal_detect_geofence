# Global Fauna Radar Build Workflow

This document describes the current build flow for the project, the runtime footprint logic, and the remaining offline-review work.

## 1. Source Inputs

The project is built from two source files in the repository root:

- `taxonomy_release.txt`: the taxonomic source list.
- `geofence.json`: the expected country allow-list keyed by taxonomic match level.

There is now also an item-level admin review overlay used during rebuilds:

- `animal_detect_geofence/data/review-overrides/geofence-binary-overrides.json`: binary `allow`, `block`, and `allow_regional` decisions captured from the review desk.

The app currently keeps birds, mammals, reptiles, and amphibians from the taxonomy file.

## 2. Build The Global Species Dataset

The dataset build step is handled by `build_global_animals_dataset.py`.

What it does:

1. Reads `taxonomy_release.txt` row by row.
2. Normalizes taxonomy fields.
3. Matches each species against `geofence.json` at the strongest possible level.
4. Applies any item-level binary overrides from `animal_detect_geofence/data/review-overrides/geofence-binary-overrides.json`.
5. Extracts the expected ISO3 country list.
6. Emits `allowRegionalCountries` for reviewed regional approvals.
7. Writes `web-plugin/data/animals-global.json`.

Run it from the repository root:

```bash
python3 build_global_animals_dataset.py
```

## 3. Start The Web App

The web app is a static site under `web-plugin/`.

Run it locally:

```bash
cd web-plugin
python3 -m http.server 8080
```

Then open:

- `http://127.0.0.1:8080/`

## 4. Country Metadata And Land Geometry

At runtime the app resolves country metadata and land shapes separately:

- Country names, ISO2, ISO3, and area come from Rest Countries.
- Country land geometry now prefers the richer `geo-countries` GeoJSON dataset.

Why that matters:

- The earlier Denmark geometry was too coarse and missed islands like Bornholm.
- The current country outline is much better for country fills and polygon clipping.

## 5. Runtime Validation Per Species / Country

For each selected species in the selected country, the app resolves:

1. GBIF taxon match.
2. iNaturalist taxon match.
3. iNaturalist country place id.
4. GBIF country evidence count.
5. iNaturalist country evidence count.

That produces the validation status shown in the list and detail panel.

For off-list species, raw counts are not enough anymore.

The current runtime logic now distinguishes between:

- Raw evidence: any GBIF or iNaturalist count in the country.
- Qualified recent wild evidence: evidence from the last `10` years that looks like a real wild observation.

Current qualifiers:

- GBIF only counts recent `HUMAN_OBSERVATION`, `MACHINE_OBSERVATION`, or `OBSERVATION` records with `occurrenceStatus=PRESENT`.
- iNaturalist only counts recent research-grade observations with `captive=false`.

Current rejects for `New`:

- old preserved-specimen records
- material-sample / eDNA-style records
- stale observations outside the recent-evidence window
- captive / managed-style observations

If an off-list species has raw evidence but no qualified recent wild evidence, it now stays `Unlisted` and the detail note explains why.

## 6. Runtime Footprint Sampling

For footprint classification, the app fetches mapped coordinates:

- GBIF point samples for the selected country.
- iNaturalist point samples when needed.

These points are used to estimate whether the species is national, regional, or should stay in review.

## 7. Footprint Cleaning Rules

The current footprint cleaning flow is:

1. Cluster the sampled points using a `40 km` link radius.
2. Keep only meaningful clusters.
3. Treat tiny remote groups as outliers.
4. Build the buffered outer polygon from the cleaned core points.

Current intent:

- A lone distant point should not stretch a regional polygon.
- A real second hotspot with enough records should survive cleaning.
- Widely separated meaningful hotspots can promote a species to national.

Example:

- Denmark moose now splits into `219` core points plus `1` outlier in the sampled GBIF set, so the polygon stays regional instead of expanding around the stray point.

## 8. National vs Regional Logic

Current user-facing footprint outcomes in the app:

- `National`: used when the cleaned observations are spread widely enough or when there are multiple meaningful dense areas.
- `Regional`: used when the cleaned footprint stays small relative to the country and has enough cleaned points.
- `No mapped points`: used when no coordinates were returned.

Thin point sets can still be flagged for manual review internally, but the UI no longer exposes a separate localized footprint category.

The current regional threshold is based on a small coverage share of the country after cleaning.

## 9. Keep The Polygon On Land

The regional polygon is not drawn raw anymore.

Instead:

1. The app builds the buffered footprint polygon.
2. It intersects that polygon with the selected country land geometry using `polygon-clipping`.
3. The clipped result is drawn on the map.

This keeps the green footprint from bleeding outside the country land outline.

## 10. What Is Global Right Now

The following logic is already global in the current app code:

- country boundary selection
- live validation rules
- point clustering and outlier removal
- national / regional / review footprint classification
- country fill and regional polygon clipping

That means the behavior applies to all species and all countries when they are viewed in the UI.

## 11. Offline Precompute Status

The precompute work is now split into two layers:

- A validated Denmark pack.
- A per-country file structure for the broader global rollout.

Current paths:

- `web-plugin/data/precomputed-countries/DNK.json`: the validated Denmark pack.
- `web-plugin/data/precomputed-country-footprints.json`: legacy Denmark compatibility copy.
- `web-plugin/data/precomputed-countries/index.json`: index of generated country packs.

Current reality:

- Denmark is the only country that currently has the full evidence-validated offline build.
- The app loader now understands per-country precomputed files.
- A global country-pack directory has been scaffolded, but only Denmark currently has the richer validated payload.

## 12. Planned Review Workflow

The review flow is partially scaffolded in the app state, but not finished yet.

Planned behavior:

1. Open a review panel for the selected species/country.
2. Mark a species as `exclude`, `regional`, `national`, or `needs review`.
3. Draw a custom regional polygon when the automatic one is wrong.
4. Export and import the review overrides as JSON.

## 13. Country Validation Build

The validated country builder is handled by `build_denmark_precomputed_validation.py`.

Despite the legacy filename, it now supports any country and keeps Denmark as the default.

What it does:

1. Start from `web-plugin/data/animals-global.json`.
2. Keep the selected country's SpeciesNet subset by default: items where `expectedCountries` contains the requested ISO3.
3. Merge any extra candidate species from an optional `--candidate-file`.
4. Resolve GBIF and iNaturalist taxa for each selected species.
5. Fetch raw country evidence counts from GBIF and iNaturalist.
6. Compute a first-pass status from the raw counts.
7. Fetch mapped GBIF and iNaturalist points when the species looks relevant enough to profile.
8. For off-list species, separate raw evidence from qualified recent wild evidence.
9. Reject stale museum/specimen/material/captive-style evidence from the `New` path.
10. Classify the footprint from the sampled points using the same cleaning rules as the app.
11. Apply managed/domestic review heuristics.
12. Write the validated payload to `web-plugin/data/precomputed-countries/<ISO3>.json`.
13. Mirror Denmark to `web-plugin/data/precomputed-country-footprints.json` for legacy compatibility only when `--country DNK`.
14. Write audit outputs.

- Denmark keeps the legacy root files:
	- `denmark_species_validation.csv`
	- `denmark_new_candidates.csv`
	- `denmark_precomputed_validation_summary.txt`
- Other countries write to `country-validation/<ISO3>/`.

Default selection behavior:

- The builder defaults to the selected country's SN subset (`expected-country`) instead of sweeping the full global species file.
- Extra country-specific candidate rows can be fed in through `--candidate-file`.

Run it from the repository root with the project virtual environment:

```bash
/home/hugo/Desktop/Danish_Species_Map/.venv/bin/python build_denmark_precomputed_validation.py --candidate-file denmark_new_candidates.csv
```

Run another country explicitly:

```bash
/home/hugo/Desktop/Danish_Species_Map/.venv/bin/python build_denmark_precomputed_validation.py --country ALB
```

Recent-wild evidence matters here too, so museum specimens, material samples, and stale non-wild signals no longer get promoted into `New` just because they have raw counts.

Useful Denmark outputs right now:

- `denmark_species_validation.csv`: full Denmark audit.
- `denmark_new_candidates.csv`: current off-list Denmark candidates that survived the stricter gate.
- `denmark_precomputed_validation_summary.txt`: quick human summary.

Example:

- `nyctereutes procyonoides` (raccoon dog) is currently in the Denmark candidate output as an off-list `New` candidate with strong recent evidence.
- That means it is not in the Denmark SpeciesNet expected list, but it is in the Denmark review/new-candidate pipeline.

## 14. Europe-First Batch Rollout

The sequential batch runner is handled by `build_country_validation_batch.py`.

What it does:

1. Read the expected ISO3 country set from `web-plugin/data/animals-global.json`.
2. Pull the selected Rest Countries region, defaulting to Europe.
3. Keep only countries that are actually present in the SpeciesNet geofence dataset.
4. Run `build_denmark_precomputed_validation.py --country <ISO3>` one country at a time.
5. Optionally rebuild the all-country pack index when the batch completes.

Useful commands:

```bash
/home/hugo/Desktop/Danish_Species_Map/.venv/bin/python build_country_validation_batch.py --region europe --limit-countries 1
```

```bash
/home/hugo/Desktop/Danish_Species_Map/.venv/bin/python build_country_validation_batch.py --countries ALB,AND --workers 4
```

## 15. Remaining-Country Setup

The remaining-country scaffold is handled by `build_all_country_precomputed.py`.

What it does right now:

1. Read `web-plugin/data/animals-global.json`.
2. Group items by each expected ISO3 country.
3. Reuse any existing `validated` payload already present under `web-plugin/data/precomputed-countries/`.
4. Write one JSON file per country under `web-plugin/data/precomputed-countries/`.
5. For countries without validated output yet, create a baseline pack from SpeciesNet expectations only.
6. Write `web-plugin/data/precomputed-countries/index.json` with metadata for all generated country packs.

Important limitation:

- The remaining-country packs are still structural scaffolding until a country has been run through the validated builder.
- In other words: validated rollout now happens country by country, and the scaffold builder preserves those validated packs instead of overwriting them.

## 16. Practical Build Checklist

When rebuilding the project from scratch:

1. Update `taxonomy_release.txt` or `geofence.json` if the source data changed.
2. Run `python3 build_global_animals_dataset.py`.
3. Start the static server in `web-plugin/`.
4. Open the app.
5. Verify a few country/species examples in the browser.
6. If footprint rules changed, verify at least one national and one regional example.
7. If evidence-quality rules changed, verify one real recent candidate and one rejected specimen/sample case in the Denmark CSV output.
