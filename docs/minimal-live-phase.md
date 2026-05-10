# Minimal Live Phase

This document defines the simplest published structure for the live review site.

## Goal

After the matching work is complete, the live site should stay small and predictable.

The browser should only need to answer:

1. Is this species allowed in the selected country?
2. If it is allowed, is it countrywide or only valid inside a reviewed polygon?

That leads to a two-layer model:

- a simple country-level geofence snapshot
- a more detailed country pack with evidence buckets and optional polygons

## Published files the live site should use

### Global catalog

- `data/animals-global.json`

Use this for:

- lookup by species
- search and labels
- the current item-level country allow-list in `expectedCountries`
- the list of country codes that should be treated as regional in `allowRegionalCountries`

### Simple binary geofence snapshot

- `data/geofence-simple.json`

Use this for:

- a small, item-level country allow/block snapshot
- downstream consumers that do not need the full taxonomy object

This is the simplest fetchable representation of the live country geofence.

### Country pack index

- `data/precomputed-countries/index.json`

Use this for:

- knowing which country packs exist
- quick country totals
- lazy-loading only the selected country pack

### Detailed country pack

- `data/precomputed-countries/<ISO3>.json`

Use this for:

- `Likely Valid`, `Needs Review`, `New`, and `Unlisted`
- evidence counts
- footprint classification
- regional polygons in `observationProfile.footprintPolygonLatLngs`
- manual override metadata

## Minimal inclusion rules

For the minimal live phase, keep the publish rules simple:

- `Likely Valid`: include in the live geofence when it comes from the original geofence
- `Needs Review`: also include for now when it comes from the original geofence
- `New`: do not add until explicitly approved
- `Unlisted`: do not include

Important policy detail:

- `Needs Review` is not a removal by itself
- it means the species still needs a human decision
- the live removal should only happen after an explicit block/remove decision

## Point-in-polygon contract

The live site should evaluate a species like this:

1. Look up the species in `animals-global.json` or `geofence-simple.json`.
2. If the selected ISO3 is not in `expectedCountries`, treat the species as excluded.
3. If the ISO3 is in `expectedCountries` but not in `allowRegionalCountries`, treat the species as countrywide.
4. If the ISO3 is in `allowRegionalCountries`, load `data/precomputed-countries/<ISO3>.json`.
5. Find the matching entry.
6. If `observationProfile.code == regional`, run point-in-polygon against `footprintPolygonLatLngs`.
7. If `observationProfile.code == countrywide`, allow anywhere inside the country.
8. If `observationProfile.code == needs_review` or `no_points`, keep the species country-allowed in this phase unless a reviewer explicitly removed it.

## Review decision layer

The live repo uses two override levels:

### Binary country decisions

- `data/review-overrides/geofence-binary-overrides.json`

Use this for:

- `allow`
- `block`
- `allow_regional`

### Detailed country decisions

- `data/review-overrides/countries/<ISO3>/<ITEM_ID>.json`

Use this for:

- adding or patching a country-pack entry
- attaching a reviewed regional polygon
- explicitly removing a country-pack entry

## Live repo responsibilities versus upstream build responsibilities

### Belongs in this live repo

- published JSON outputs
- override files
- static app files
- docs and examples for the live contract

### Belongs outside the live browser path

- taxonomy matching against the upstream geofence source
- GBIF and iNaturalist evidence collection
- footprint clustering and scoring
- country validation batch runs

Those steps should keep happening in the upstream workspace and then publish results into this repository.

## JSON examples

Examples live under [examples/README.md](examples/README.md).

The main files are:

- [examples/geofence-simple.example.json](examples/geofence-simple.example.json)
- [examples/country-pack.example.json](examples/country-pack.example.json)
- [examples/review-queue.example.json](examples/review-queue.example.json)
- [examples/binary-overrides.example.json](examples/binary-overrides.example.json)
- [examples/country-override.example.json](examples/country-override.example.json)