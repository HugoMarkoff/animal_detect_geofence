# Published data

This folder contains the JSON files that the GitHub Pages app should fetch directly.

## Core published files

- `animals-global.json`: global lookup catalog with taxonomy fields, `expectedCountries`, and `allowRegionalCountries`
- `geofence-simple.json`: compact item-level country allow-list snapshot derived from the current global catalog and binary override file
- `precomputed-countries/index.json`: country pack registry and summary counts
- `precomputed-countries/<ISO3>.json`: detailed country pack with bucket, status, evidence counts, footprint classification, and optional regional polygons

## Override layer

- `review-overrides/geofence-binary-overrides.json`: global `allow`, `block`, and `allow_regional` decisions
- `review-overrides/countries/<ISO3>/<ITEM_ID>.json`: per-country patch or remove files, including regional polygons when needed
- `review-overrides/change-log.json`: audit history of admin-reviewed changes

## What should remain outside the browser

This folder should not become a replacement for the upstream evidence pipeline.

Keep these upstream:

- taxonomy-to-geofence matching
- GBIF and iNaturalist evidence collection
- footprint scoring and candidate generation
- country validation batch runs

Those steps should publish their outputs here, not move into the client.