# Suggestion Generation Flow

This document explains how the project produces the current review suggestions, how the visible buckets are assigned, and how an accepted or rejected suggestion should change the live geofence.

## Goal

There are two separate concerns in the pipeline:

1. generating candidate decisions from source data and occurrence evidence
2. deciding which of those candidates should immediately change the live published geofence

For the minimal live phase, those concerns should stay separate.

## Source Inputs

The current suggestion pipeline starts from these inputs:

- `taxonomy_release_new.txt`
- `geofence_new.json`
- `animal_detect_geofence/data/review-overrides/geofence-binary-overrides.json`
- optional country candidate files such as `country-validation/<ISO3>/new_candidates.csv`

The important separation is:

- `geofence_new.json` is the upstream source geofence
- `geofence-binary-overrides.json` is the live decision overlay
- country pack overrides add regional polygons and per-country corrections

## Step 1. Build The Global Species Catalog

Script:

- `build_global_animals_dataset.py`

What it does:

1. Reads the taxonomy rows.
2. Normalizes class, order, family, genus, and species.
3. Matches each species against `geofence_new.json` from the strongest level to the weakest:
   - exact species match
   - genus match
   - family match
   - order match
   - class match
4. Builds `expectedCountries` from the matched geofence rule.
5. Applies binary admin overrides:
   - `allow`
   - `block`
   - `allow_regional`
6. Writes `animals-global.json`.

This file becomes the starting point for all later country suggestions.

## Step 2. Select The Country Build Set

Scripts:

- `build_country_validation_batch.py`
- `build_denmark_precomputed_validation.py`

The country builder usually runs in `country-indexed` mode now.

That means:

- start with items whose `expectedCountries` already contains the target ISO3
- optionally merge earlier `new_candidates.csv` rows back in so prior discoveries are rechecked

This keeps the country runs focused while still preserving candidate follow-up.

## Step 3. Resolve Evidence Per Species And Country

For each item in the country run, the validator resolves:

- GBIF usage key
- iNaturalist taxon id
- iNaturalist place id for the selected country
- GBIF country evidence count
- iNaturalist country evidence count

For unexpected species, the validator also applies a stricter filter:

- only recent wild evidence from the last 10 years counts toward a possible new country record
- stale records do not count
- preserved specimens and material samples do not count
- captive iNaturalist observations do not count

This is why some off-list species still end up as `Unlisted` even when raw counts exist.

## Step 4. Convert Evidence Into An Internal Status

The current internal statuses are:

- `likely_true_both`
- `likely_true_one_source`
- `likely_false`
- `new_record`
- `unlisted`

### Expected species rules

If the species is already expected in the country, it has enough evidence when:

- total qualified evidence is greater than 1, and
- both sources have at least 1 record, or one source has at least 2 records

If that passes:

- both sources present -> `likely_true_both`
- only one source present -> `likely_true_one_source`

If it fails, it becomes:

- `likely_false`

### Unexpected species rules

If the species is not expected in the country, it becomes `new_record` only when the qualified evidence is strong enough. The current thresholds are:

- total qualified evidence >= 8, or
- GBIF >= 5 and iNaturalist >= 1, or
- iNaturalist >= 5 and GBIF >= 1, or
- GBIF >= 3 and iNaturalist >= 3

If those thresholds are not met, it stays:

- `unlisted`

### Managed and domestic downgrade

Even when raw evidence exists, some species can still be pushed back into review if the point samples look managed, captive, atlas-driven, or domestic.

That downgrade currently lands in:

- `likely_false`

## Step 5. Build A Footprint From Mapped Points

For species that matter enough to map, the validator fetches occurrence points and classifies a footprint.

Current sampling limits:

- up to 90 GBIF points
- up to 18 iNaturalist points

Current footprint logic:

- points are clustered with a 40 km link radius
- likely outlier points are dropped
- the remaining points are buffered into an outer footprint polygon

The current visible footprint outcomes are:

- `countrywide`
- `regional`
- `needs_review`
- `no_points`

### When a footprint becomes national

The current code treats the footprint as countrywide when any of these is true:

- there are at least 2 significant dense clusters and at least 10 cleaned points
- the cleaned points are widely scattered across the country
- the cleaned footprint covers more than 5% of the country area

The wide-scatter rule currently requires:

- at least 5 cleaned points
- at least 5 unique 50 km cells
- spread ratio >= 0.55 of the country's approximate diameter

### When a footprint becomes regional

The current code keeps the footprint regional when:

- there are at least 10 cleaned points, and
- the cleaned footprint covers at most 5% of the country area

### When a footprint stays in review

The current code keeps the footprint in `needs_review` when:

- there are fewer than 10 cleaned points after outlier cleanup

That is exactly the situation where a human-drawn polygon can later upgrade the record into a clear regional rule.

## Step 6. Map Internal Status To The Visible Buckets

The review UI shows four buckets:

- `Likely Valid`
- `Needs Review`
- `New`
- `Unlisted`

The current mapping is:

| Internal status | Visible bucket | Meaning |
| --- | --- | --- |
| `likely_true_both` | `Likely Valid` | expected species confirmed by both data sources |
| `likely_true_one_source` | `Likely Valid` | expected species supported by one data source |
| `likely_false` | `Needs Review` | expected species still in the source geofence, but not strongly supported yet |
| `new_record` | `New` | unexpected species with enough qualified evidence to be a possible addition |
| `unlisted` | `Unlisted` | unexpected species without convincing qualified evidence |

One extra rule matters for the UI:

- if a species is unexpected but its footprint is already clearly `regional` or `countrywide`, the display bucket should still be treated as `New`

## Step 7. Minimal Live Publish Policy

After the matching run, the simplest policy is:

- keep `Likely Valid` published if the species was already in the original geofence
- keep `Needs Review` published if the species was already in the original geofence
- keep `New` unpublished until someone approves it
- keep `Unlisted` unpublished

This means the visible review buckets do not all have the same publish effect.

### Immediate publish effect by bucket

| Bucket | Default live effect |
| --- | --- |
| `Likely Valid` | keep included |
| `Needs Review` | keep included for now |
| `New` | do not add yet |
| `Unlisted` | do not include |

This matches the intended minimal-phase rule:

- likely and review entries remain from the original geofence
- new entries only enter after a human approval

## Step 8. What Reviewer Decisions Should Change

### Accept a new country addition

Use when:

- bucket is `New`
- reviewer agrees the species should now be part of the country's live geofence

File changes:

- set `allow.<ISO3> = true` in `geofence-binary-overrides.json` for national coverage, or
- set `allow_regional.<ISO3> = true` for regional coverage
- if regional, also write `countries/<ISO3>/<ITEM_ID>.json` with the approved polygon patch
- append an entry to `change-log.json`

### Reject a new country addition

Use when:

- bucket is `New`
- reviewer does not want the species added

Minimal-phase live effect:

- do nothing to the live binary geofence
- the species simply stays excluded

Optional audit choice:

- record a `block` decision as explicit reviewer memory if you want the rejection to survive future source rebuilds more visibly

### Confirm an existing country species should stay

Use when:

- bucket is `Likely Valid` or `Needs Review`
- reviewer wants no geofence change

Minimal-phase live effect:

- no binary change required
- species remains included as part of the original geofence

### Remove an existing country species

Use when:

- bucket is `Likely Valid` or `Needs Review`
- reviewer decides the original geofence entry should be removed

File changes:

- set `block.<ISO3> = true` in `geofence-binary-overrides.json`
- optionally add a per-country `remove` override file when the published country pack needs explicit deletion behavior
- append an entry to `change-log.json`

### Convert an existing species to regional coverage

Use when:

- the species should stay in the country
- but it should no longer be treated as national

File changes:

- keep the species allowed in the binary layer
- set `allow_regional.<ISO3> = true`
- write a per-country `upsert` override with `observationProfile.code = regional` and `footprintPolygonLatLngs`

Denmark moose is already a real example of this pattern.

## Step 9. Rebuild Path After A Decision

After a reviewer decision, the update path should stay simple:

1. Update override files.
2. Run `python tools/apply_country_overrides.py`.
3. If the upstream source geofence changed, rebuild `animals-global.json` with `python build_global_animals_dataset.py --source new`.
4. Rebuild affected country packs when needed.
5. Publish the updated `animals-global.json`, `geofence-simple.json`, and `precomputed-countries/<ISO3>.json` files.

The important published outputs are still the same:

- `animal_detect_geofence/data/animals-global.json`
- `animal_detect_geofence/data/geofence-simple.json`
- `animal_detect_geofence/data/precomputed-countries/index.json`
- `animal_detect_geofence/data/precomputed-countries/<ISO3>.json`

## Recommended End State Once Matching Is Done

Once the remaining countries are matched, the cleanest operating model is:

- treat the source files as slow-moving upstream inputs
- treat the override layer as the fast live-edit layer
- keep the live site focused on fetching current geofenced truth, not rebuilding it in the browser
- keep `species_validation.csv` as the audit trail and spreadsheet-friendly export
- add a small JSON mirror of the review queue only if the site later needs direct queue consumption

That gives a stable split:

- source geofence decides the baseline
- evidence pipeline generates suggestions
- review decisions decide what changes the live geofence
- country packs carry the polygon detail when a species is regional