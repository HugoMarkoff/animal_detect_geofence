# Suggestion Generation Flow

This document explains how the upstream pipeline produces country suggestions and how those suggestions should change the live geofence after review.

## Source inputs

The current pipeline starts from:

- `taxonomy_release_new.txt`
- `geofence_new.json`
- `data/review-overrides/geofence-binary-overrides.json`
- optional country candidate files such as `country-validation/<ISO3>/new_candidates.csv`

The important split is:

- `geofence_new.json` is the upstream source geofence
- `geofence-binary-overrides.json` is the live binary decision layer
- country-specific override files carry polygon detail and per-country corrections

## Stage 1. Build the global catalog

Upstream script:

- `build_global_animals_dataset.py`

What it does:

1. Reads taxonomy rows.
2. Normalizes class, order, family, genus, and species.
3. Matches each item against the strongest available geofence key.
4. Builds `expectedCountries`.
5. Applies item-level `allow`, `block`, and `allow_regional` overrides.
6. Writes `animals-global.json`.

## Stage 2. Build a country validation pack

Upstream scripts:

- `build_country_validation_batch.py`
- `build_denmark_precomputed_validation.py`

Current default mode is `country-indexed`, which means:

- start with items whose `expectedCountries` already includes the selected ISO3
- optionally merge earlier candidate rows back in for re-checking

## Stage 3. Resolve evidence

For each species-country pair, the validator resolves:

- GBIF taxon usage key
- iNaturalist taxon id
- iNaturalist place id
- GBIF country evidence
- iNaturalist country evidence

For unexpected species, the validator uses a stricter rule before treating the species as a possible addition:

- only recent wild evidence from the last 10 years counts
- stale records do not count
- specimen/material records do not count
- captive iNaturalist records do not count

## Stage 4. Assign internal status

Current internal statuses:

- `likely_true_both`
- `likely_true_one_source`
- `likely_false`
- `new_record`
- `unlisted`

### Expected species threshold

An expected species has enough evidence when:

- total qualified evidence is greater than 1, and
- both sources have at least 1 record, or one source has at least 2 records

Result:

- both sources present -> `likely_true_both`
- one source present -> `likely_true_one_source`
- otherwise -> `likely_false`

### Unexpected species threshold

An unexpected species becomes `new_record` only when the qualified evidence is strong enough:

- total qualified evidence >= 8, or
- GBIF >= 5 and iNaturalist >= 1, or
- iNaturalist >= 5 and GBIF >= 1, or
- GBIF >= 3 and iNaturalist >= 3

If it does not pass, it stays `unlisted`.

### Managed and domestic downgrade

Managed, captive, domestic, and atlas-style patterns can still push a species back into review.

That downgrade currently lands in `likely_false`.

## Stage 5. Classify the footprint

The validator samples mapped points and then:

- clusters them with a 40 km link radius
- drops likely outliers
- builds a cleaned buffered footprint polygon

Visible footprint outcomes:

- `countrywide`
- `regional`
- `needs_review`
- `no_points`

### Countrywide rules

The footprint becomes countrywide when any of these are true:

- there are at least 2 significant dense clusters and at least 10 cleaned points
- the cleaned points are widely scattered across the country
- the cleaned footprint covers more than 5% of the country area

### Regional rules

The footprint stays regional when:

- there are at least 10 cleaned points, and
- the cleaned footprint covers at most 5% of the country area

### Needs-review footprint

The footprint stays in `needs_review` when fewer than 10 cleaned points remain after outlier cleanup.

That is the main case where a human-drawn polygon can later turn a fuzzy result into a reviewed regional rule.

## Stage 6. Map status to visible buckets

Visible buckets in the review UI:

- `Likely Valid`
- `Needs Review`
- `New`
- `Unlisted`

Current mapping:

- `likely_true_both` -> `Likely Valid`
- `likely_true_one_source` -> `Likely Valid`
- `likely_false` -> `Needs Review`
- `new_record` -> `New`
- `unlisted` -> `Unlisted`

Extra display rule:

- if a species is unexpected but already has a clearly `regional` or `countrywide` footprint, it should still be shown as `New`

## Stage 7. Minimal live publish behavior

After suggestion generation, the minimal publish behavior should be:

- `Likely Valid`: keep included
- `Needs Review`: keep included for now
- `New`: keep excluded until approved
- `Unlisted`: keep excluded

This is the important separation:

- suggestion buckets explain confidence and action priority
- reviewer decisions change the live geofence

## Stage 8. What review decisions should do

### Accept a new country addition

- add `allow.<ISO3> = true` for national coverage, or
- add `allow_regional.<ISO3> = true` for regional coverage
- if regional, add a country override file with the polygon patch

### Reject a new country addition

- no live inclusion change is required
- the species stays excluded
- optional: record an explicit `block` if you want a stronger reviewer memory

### Remove an existing country species

- add `block.<ISO3> = true`
- optionally add a country-level `remove` override file if the pack should drop the entry explicitly

### Convert an existing species to regional coverage

- keep the species allowed in the binary layer
- add `allow_regional.<ISO3> = true`
- add a country-level `upsert` override file with `observationProfile.code = regional` and `footprintPolygonLatLngs`

## Stage 9. Publish path

After a review decision:

1. Update override files.
2. Run `python tools/apply_country_overrides.py`.
3. Commit refreshed JSON outputs.
4. Push to `main` so GitHub Pages rebuilds from the repo root.

The browser should keep consuming published outputs only. The evidence pipeline remains upstream.