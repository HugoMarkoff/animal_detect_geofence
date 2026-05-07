# Country Override Files

This directory is the git-native admin edit layer for published country packs.

## Layout

- `countries/<ISO3>/<ITEM_ID>.json`: one override file per species per country.

Keeping overrides split per item keeps merge conflicts low when multiple editors are working in the same country.

## Actions

Each override file supports one of two actions:

- `upsert`: patch an existing pack entry or add a new one.
- `remove`: remove a species from the published country pack.

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

The GitHub Actions workflow in [.github/workflows/apply-country-overrides.yml](../../.github/workflows/apply-country-overrides.yml) runs the same command and commits updated files in `data/precomputed-countries/`.