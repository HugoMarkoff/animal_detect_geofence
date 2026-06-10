# Country Override Files

This directory is the git-native admin edit layer for published country packs.

## Layout

- `countries/<ISO3>/<ITEM_ID>.json`: one override file per species per country.
- `geofence-baseline.json`: tracked baseline snapshot of the approved global geofence membership used as the immutable rebuild starting point.
- `geofence-binary-overrides.json`: item-level binary `allow`, `block`, and `allow_regional` decisions captured from reviewed admin changes. It intentionally stores no per-scope metadata.
- `change-log.json`: append-only audit log for review-desk changes.

Keeping overrides split per item keeps merge conflicts low when multiple editors are working in the same country.

The baseline + binary geofence files are intentionally non-spatial:

- `geofence-baseline.json` stores the current approved global baseline for `expectedCountries`, `allowRegionalCountries`, and `expectedSubdivisions`.
- `geofence-binary-overrides.json` stores only country-level decisions.
- `countries/<ISO3>/<ITEM_ID>.json` stores the national or regional country-pack override, including polygons when needed.

This keeps the global geofence baseline/binary layer compact while the country pack remains the detailed polygon-bearing layer.

Reviewer, timestamp, reason, and touched-file audit details belong in `change-log.json`, not in `geofence-binary-overrides.json`. Writers should treat any `metadata` field inside the binary tracking file as legacy residue and remove it.

## Actions

Each override file supports one of two actions:

- `upsert`: patch an existing pack entry or add a new one.
- `remove`: remove a species from the published country pack.

There are no additional country override action types today. Binary geofence decisions are represented by the `allow`, `block`, and `allow_regional` maps in `geofence-binary-overrides.json` rather than a separate action enum.

`remove` is reversible. If the override file is deleted later, the published pack is restored to its base entry on the next rebuild.

## Upsert example

Path:

- `countries/DNK/00804e75-09ef-44e5-8984-85e365377d47.json`

Content:

```json
{
  "action": "upsert",
  "updatedBy": "octocat",
  "updatedAtUtc": "2026-05-07T12:34:56+00:00",
  "reason": "Manual review confirmed a regional footprint.",
  "patch": {
    "status": "likely_true_one_source",
    "expected": true,
    "observationProfile": {
      "code": "regional",
      "label": "Regional footprint",
      "short": "Regional",
      "note": "Manual override after review.",
      "footprintPolygonLatLngs": [
        [56.823, 9.512],
        [56.911, 9.744],
        [56.761, 10.041],
        [56.823, 9.512]
      ]
    }
  }
}
```

## Remove example

Path:

- `countries/DNK/293f0f59-5f2c-4d3c-a4a5-2b4e41825d2e.json`

Content:

```json
{
  "action": "remove",
  "updatedBy": "octocat",
  "updatedAtUtc": "2026-05-07T12:40:00+00:00",
  "reason": "Exclude this species from the Denmark pack."
}
```

## Rebuild flow

Run the local applier after changing override files:

```bash
python tools/apply_country_overrides.py
```

The GitHub Actions workflow in [.github/workflows/apply-country-overrides.yml](../../.github/workflows/apply-country-overrides.yml) runs the same command and commits updated files in `data/precomputed-countries/`, `data/animals-global.json`, and `data/geofence-simple.json`.

Dan-derived decisions from `Corrections_DAN.json` are runtime-only overlays used during rebuild/apply. They should not be persisted into `geofence-binary-overrides.json`, `change-log.json`, or `countries/<ISO3>/<ITEM_ID>.json`.

## Published simple geofence snapshot

The publish repo also keeps `data/geofence-simple.json` as the human-readable item-level snapshot of the current binary geofence state.

- It is generated from `data/animals-global.json`, which is rebuilt from `geofence-baseline.json` plus `geofence-binary-overrides.json` and country override files.
- It lists `expectedCountries` and `allowRegionalCountries` per item.
- It is not the upstream taxonomy-keyed source file; it is the publish-side derived view kept in sync for review and audit work.

## Binary geofence tracking

`geofence-binary-overrides.json` is keyed by `itemId` because review-desk approvals are species-specific.

It is a delta layer, not the source-of-truth baseline. Rebuilds automatically drop rows that no longer change anything relative to `geofence-baseline.json`.

Per item, it stores:

- `allow.<ISO3> = true`: this species should be allowed in that country.
- `block.<ISO3> = true`: this species should be removed from that country.
- `allow_regional.<ISO3> = true`: this species is allowed in that country, but the approved coverage is regional instead of national.

No other keys are required for decision tracking. In particular, the file should not carry reviewer names, timestamps, reasons, override paths, or similar audit metadata.

The root dataset builder reads this file during `build_global_animals_dataset.py`, adjusts `expectedCountries`, and emits `allowRegionalCountries` in the generated `animals-global.json`.

For USA state coverage, partial `expectedSubdivisions.USA` membership no longer implies national `USA` membership in `expectedCountries`. Only all-state or explicit national USA approvals should keep `USA` in the country list.

## Change log

`change-log.json` records each admin-reviewed action with the country, species, matched geofence key, requested coverage, touched files, reviewer login, and reason text.