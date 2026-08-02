# Minimal Live Phase Structure

This document defines the simplest data layout for the live review site once the country matching work is complete.

The goal is to keep the published setup small and predictable:

- one static app shell
- one global catalog
- one simple binary geofence snapshot
- one detailed country pack per ISO3
- one audit/review output per country

## Goal

For the minimal live phase, the site should answer two different questions with two different layers:

1. Is this species allowed in this country at all?
2. If it is allowed, is it allowed countrywide or only inside a reviewed regional polygon?

That leads to this split:

- `animal_detect_geofence/data/geofence-simple.json` answers the country-level binary question.
- `animal_detect_geofence/data/precomputed-countries/<ISO3>.json` answers the finer-grained question and holds the polygon when a species is regional.

## Minimal Repo Layout

### Live app shell

- `animal_detect_geofence/index.html`
- `animal_detect_geofence/assets/app.js`
- `animal_detect_geofence/assets/styles.css`

These files are the static GitHub Pages front end. They should stay thin and data-driven.

### Global build outputs consumed by the live site

- `animal_detect_geofence/data/animals-global.json`
- `animal_detect_geofence/data/geofence-simple.json`
- `animal_detect_geofence/data/precomputed-countries/index.json`
- `animal_detect_geofence/data/precomputed-countries/<ISO3>.json`

### Review and override layer

- `animal_detect_geofence/data/review-overrides/geofence-binary-overrides.json`
- `animal_detect_geofence/data/review-overrides/countries/<ISO3>/<ITEM_ID>.json`
- `animal_detect_geofence/data/review-overrides/change-log.json`

### Build-time or audit-only artifacts

- `taxonomy_release_new.txt`
- `geofence_new.json`
- `country-validation/<ISO3>/species_validation.csv`
- `country-validation/<ISO3>/new_candidates.csv`
- `country-validation/<ISO3>/precomputed_validation_summary.txt`

These are important for rebuilds and audits, but the simple live site does not need to read them directly.

## Responsibilities Per File

### `animals-global.json`

This is the main app catalog.

It contains:

- taxonomy fields
- common name
- the matched geofence key and match level
- the current binary country allow-list in `expectedCountries`
- the countries that are allowed but should be treated as regional in `allowRegionalCountries`

Use this file when the app needs global lookup, search, or a fast per-species country allow-list.

### `geofence-simple.json`

This is the publish-side, human-readable binary geofence snapshot.

It is derived from:

- `animals-global.json`
- `animal_detect_geofence/data/review-overrides/geofence-binary-overrides.json`

Use this file when the app or another downstream consumer only needs the current country-level truth and does not need the full taxonomy object.

### `precomputed-countries/<ISO3>.json`

This is the country pack.

It contains:

- the validated status and bucket for each species in that country
- evidence counts from GBIF and iNaturalist
- footprint classification
- `footprintPolygonLatLngs` when a regional shape exists
- manual override metadata when a reviewer changed the default result

Use this file when the app needs fine-grained geofence logic such as:

- national versus regional coverage
- point-in-polygon checks for reviewed regional species
- review labels like `Likely Valid`, `Needs Review`, and `New`

### `precomputed-countries/index.json`

This is the pack registry.

It tells the app which country packs exist and gives summary counts per country.

Use it for:

- country availability
- quick country totals
- lazy-loading only the selected country pack

### `species_validation.csv`

This is the current audit/export surface for new, likely, and review items.

It is the best offline artifact for QA and spreadsheets, but it is not the best live API format. If the site later needs the queue directly in JSON, it should mirror this CSV rather than replace the country pack.

## Minimal Publish Rules

For the minimal live phase, keep the publish rules simple and stable:

- `Likely Valid` stays included if the species was already in the original geofence.
- `Needs Review` also stays included if the species was already in the original geofence.
- `New` stays excluded until a reviewer accepts it.
- `Unlisted` stays excluded.
- A reviewed regional species is still allowed in the country, but only inside its approved polygon.

The important policy detail is this:

- `Needs Review` does not remove a species from the live geofence by itself.
- It only means the evidence or footprint still needs a human decision.
- The live removal should happen only after a reviewer explicitly blocks or removes it.

## JSON Shape Examples

### 1. Global app catalog item

File: `animal_detect_geofence/data/animals-global.json`

```json
{
  "generatedFor": "Global",
  "dataset": "taxonomy_release_new.txt + geofence_new.json",
  "items": [
    {
      "id": "429257d4-3ef2-47fb-b849-66ee6c107346",
      "class": "mammalia",
      "classLabel": "Mammal",
      "order": "artiodactyla",
      "family": "cervidae",
      "genus": "alces",
      "species": "alces",
      "binomial": "alces alces",
      "commonName": "moose",
      "matchedKey": "mammalia;artiodactyla;cervidae;alces;alces",
      "matchLevel": 5,
      "expectedCountries": ["DNK", "NOR", "SWE"],
      "allowRegionalCountries": ["DNK"]
    }
  ]
}
```

Notes:

- `expectedCountries` is the current binary allow-list.
- `allowRegionalCountries` means the country is allowed, but the detailed pack should be consulted for a polygon-limited rule.

### 2. Simple binary geofence item

File: `animal_detect_geofence/data/geofence-simple.json`

```json
{
  "generatedFor": "Global",
  "items": [
    {
      "itemId": "429257d4-3ef2-47fb-b849-66ee6c107346",
      "commonName": "moose",
      "binomial": "alces alces",
      "classLabel": "Mammal",
      "matchedKey": "mammalia;artiodactyla;cervidae;alces;alces",
      "matchLevel": 5,
      "expectedCountries": ["DNK", "NOR", "SWE"],
      "allowRegionalCountries": ["DNK"]
    }
  ]
}
```

Notes:

- This is the simple country-level snapshot.
- It is not the canonical taxonomy-keyed source file.
- It is the published, item-level view that the live site can fetch directly.

### 3. Country pack top-level shape

File: `animal_detect_geofence/data/precomputed-countries/DNK.json`

```json
{
  "generatedFor": "DNK",
  "countryName": "Denmark",
  "generatedAtUtc": "2026-05-10T06:54:08.602130+00:00",
  "sourceDataset": "web-plugin/data/animals-global.json",
  "precomputeMode": "validated",
  "selectionMode": "country-indexed",
  "summary": {
    "total": 427,
    "bucketCounts": {
      "Likely Valid": 117,
      "Needs Review": 40,
      "New": 49,
      "Unlisted": 221
    }
  },
  "entries": []
}
```

### 4. Country pack entry with a regional polygon

The regional geometry lives inside `entry.observationProfile.footprintPolygonLatLngs`.

```json
{
  "itemId": "429257d4-3ef2-47fb-b849-66ee6c107346",
  "countryIso3": "DNK",
  "status": "likely_true_one_source",
  "bucket": "Likely Valid",
  "expected": true,
  "gbifCount": 911,
  "inatCount": 77,
  "observationProfile": {
    "code": "regional",
    "label": "Regional footprint",
    "short": "Regional",
    "note": "Manual admin override applied from the review desk.",
    "significant": true,
    "footprintPolygonLatLngs": [
      [56.93655, 10.244393],
      [56.954333, 10.21904],
      [56.938526, 10.209081],
      [56.937044, 10.259785]
    ]
  },
  "manualOverride": {
    "sourceFile": "data/review-overrides/countries/DNK/429257d4-3ef2-47fb-b849-66ee6c107346.json",
    "action": "upsert",
    "updatedBy": "HugoMarkoff",
    "addedByOverride": false
  }
}
```

Notes:

- The country pack is where the app should look for the actual polygon.
- Denmark moose is already a real example of this pattern.

### 5. Optional JSON mirror for the review queue

Today the queue lives in `country-validation/<ISO3>/species_validation.csv`.

If the live site later needs a direct JSON queue, use a mirror like this instead of overloading the country pack schema:

```json
{
  "countryIso3": "DNK",
  "generatedAtUtc": "2026-05-10T06:54:08.602130+00:00",
  "policy": {
    "publishExpectedBuckets": ["Likely Valid", "Needs Review"],
    "publishUnexpectedBuckets": []
  },
  "rows": [
    {
      "itemId": "429257d4-3ef2-47fb-b849-66ee6c107346",
      "commonName": "moose",
      "binomial": "alces alces",
      "expected": true,
      "status": "likely_true_one_source",
      "bucket": "Likely Valid",
      "footprintCode": "regional",
      "publishAction": "keep_in_geofence",
      "note": "Regional footprint is approved and should be checked with point-in-polygon."
    },
    {
      "itemId": "example-new-id",
      "commonName": "example species",
      "binomial": "example species",
      "expected": false,
      "status": "new_record",
      "bucket": "New",
      "footprintCode": "countrywide",
      "publishAction": "pending_add",
      "note": "Keep excluded until explicitly approved."
    }
  ]
}
```

## Point-In-Polygon Contract

For the minimal live phase, point-in-polygon should work like this:

1. Find the species in `animals-global.json` or `geofence-simple.json`.
2. If the selected ISO3 is not in `expectedCountries`, treat the species as excluded from that country.
3. If the ISO3 is in `expectedCountries` but not in `allowRegionalCountries`, treat the species as countrywide.
4. If the ISO3 is in `allowRegionalCountries`, load `data/precomputed-countries/<ISO3>.json`.
5. Find the matching entry and read `observationProfile`.
6. If `observationProfile.code == regional` and `footprintPolygonLatLngs` is present, run point-in-polygon against that ring.
7. If the profile is `countrywide`, allow any point inside the country polygon.
8. If the profile is `needs_review` or `no_points`, keep the species country-allowed in this phase unless a reviewer has explicitly removed it.

This keeps the minimal site behavior aligned with the stated policy:

- original geofence entries stay in until reviewed out
- new candidates stay out until reviewed in
- regional limitation only happens when a reviewed polygon exists

## Override Files That Change Live Behavior

### Binary country-level decisions

File: `animal_detect_geofence/data/review-overrides/geofence-binary-overrides.json`

Use it for:

- adding a species to a country
- blocking a species from a country
- marking a species as allowed but regional in a country

### Detailed country-level geometry or removal

File pattern: `animal_detect_geofence/data/review-overrides/countries/<ISO3>/<ITEM_ID>.json`

Use it for:

- a regional polygon override
- patching a country-pack entry
- removing an entry from the published country pack

## Recommended End State After Matching Completes

Once the current country matching run is done, the simplest stable setup is:

- keep `taxonomy_release_new.txt` and `geofence_new.json` as the upstream source layer
- keep `animals-global.json` as the app catalog
- keep `geofence-simple.json` as the fast, fetchable country-level truth
- keep each `precomputed-countries/<ISO3>.json` as the detailed country truth
- treat `review-overrides/` as the only live edit layer between major source refreshes
- keep `species_validation.csv` as the offline review export, with an optional JSON mirror later if the site needs it