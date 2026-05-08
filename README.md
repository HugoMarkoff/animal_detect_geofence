# animal_detect_geofence

Standalone repository for the country-pack review and ticket workflow.

## What is here

- `index.html`: GitHub Pages entry for the review and ticket workflow.
- `assets/`: static JavaScript and CSS used by the GitHub Pages app.
- `data/animals-global.json`: global animal catalog used for lookup and ticket forms.
- `data/geofence-simple.json`: generated item-level expected-country snapshot derived from `animals-global.json` plus the binary override file.
- `data/precomputed-countries/`: precomputed country packs and regional footprint polygons.
- `data/review-overrides/`: git-tracked per-country override files applied on top of published packs.
- `data/review-overrides/geofence-binary-overrides.json`: global binary species-country decisions with `allow_regional` for reviewed regional approvals.
- `data/review-overrides/change-log.json`: append-only audit trail for admin-reviewed changes.
- `tools/apply_country_overrides.py`: reapplies override files into published country packs and refreshes the country index.
- `HANDOVER_GUIDE.md`: project context, transfer notes, and next-step guidance.
- `suggestion_app/`: earlier Flask prototype kept as a reference while the Pages version becomes primary.

## Quick start

```bash
python -m http.server 8081
```

Open `http://127.0.0.1:8081/`.

By default, GitHub issue drafts target `HugoMarkoff/animal_detect_geofence`.

## Country Overrides

Manual country corrections now have a git-native override layer under [data/review-overrides/README.md](data/review-overrides/README.md).

Admin Apply now writes three linked artifacts in one GitHub commit:

- the country override file under `data/review-overrides/countries/<ISO3>/<ITEM_ID>.json`
- the binary global decision in `data/review-overrides/geofence-binary-overrides.json`
- the audit entry in `data/review-overrides/change-log.json`

To apply overrides locally:

```bash
python tools/apply_country_overrides.py
```

The workflow in [.github/workflows/apply-country-overrides.yml](.github/workflows/apply-country-overrides.yml) runs the same command whenever override files change and commits regenerated files in `data/precomputed-countries/`, `data/animals-global.json`, and `data/geofence-simple.json`.

## GitHub Pages

This repository now has a root `index.html`, so it can be published directly at:

`https://hugomarkoff.github.io/animal_detect_geofence/`

Use the repository root as the Pages source.