# animal_detect_geofence

Static GitHub Pages repository for the live country geofence review desk and the minimal published data contract.

The intended live setup is deliberately simple:

- the browser fetches already-built JSON
- country-level allow/block decisions stay in a small global snapshot
- regional detail lives in per-country packs
- heavy matching and evidence scoring stay outside the browser

## Minimal live contract

The live site should only need four core published outputs:

- `data/animals-global.json`: global species catalog used for lookup and search
- `data/geofence-simple.json`: current item-level country allow-list snapshot
- `data/precomputed-countries/index.json`: pack registry and summary counts
- `data/precomputed-countries/<ISO3>.json`: detailed country pack with status, bucket, and regional polygon data

The minimal publish policy is:

- `Likely Valid` stays included when the species was part of the original geofence
- `Needs Review` also stays included until someone explicitly removes it
- `New` stays excluded until explicitly approved
- `Unlisted` stays excluded
- regional species are country-allowed, but should use the polygon in the country pack for point-in-polygon checks

## Repository layout

- `index.html`: GitHub Pages entry point
- `assets/`: static JavaScript and CSS for the review desk
- `data/`: published JSON used by the live site
- `data/review-overrides/`: tracked manual decisions and audit history
- `docs/`: minimal-phase docs and JSON format examples
- `tools/apply_country_overrides.py`: reapplies override files into published outputs
- `HANDOVER_GUIDE.md`: project context and handover notes
- `suggestion_app/`: earlier Flask prototype kept for reference

See [data/README.md](data/README.md) for the published data folder and [docs/README.md](docs/README.md) for the documentation index.

## Docs

- [docs/minimal-live-phase.md](docs/minimal-live-phase.md): minimal published structure, file responsibilities, and live rules
- [docs/suggestion-generation-flow.md](docs/suggestion-generation-flow.md): how source data becomes `Likely Valid`, `Needs Review`, `New`, and `Unlisted`
- [docs/examples/README.md](docs/examples/README.md): example JSON shapes for the main published files
- [data/review-overrides/README.md](data/review-overrides/README.md): override layer used for accepted/rejected review decisions

## Quick start

```bash
python -m http.server 8081
```

Open `http://127.0.0.1:8081/`.

By default, GitHub issue drafts target `HugoMarkoff/animal_detect_geofence`.

## Common update flows

### Apply review decisions only

Use this when the source dataset is unchanged and only admin-reviewed decisions changed.

```bash
python tools/apply_country_overrides.py
```

This refreshes:

- `data/precomputed-countries/*.json`
- `data/precomputed-countries/index.json`
- `data/animals-global.json`
- `data/geofence-simple.json`

### Publish refreshed source data

Use this when the upstream matching/build pipeline produced new source outputs.

Typical flow:

1. Rebuild `animals-global.json` in the upstream workspace.
2. Sync refreshed published data into this repository.
3. Re-run `python tools/apply_country_overrides.py`.
4. Commit and push the resulting JSON outputs.

The browser should never have to recompute evidence scoring or country matching on the fly.

## Country overrides

Manual corrections are applied through the git-native override layer under [data/review-overrides/README.md](data/review-overrides/README.md).

Admin Apply writes linked artifacts in one review decision:

- a country override file under `data/review-overrides/countries/<ISO3>/<ITEM_ID>.json`
- the binary global decision in `data/review-overrides/geofence-binary-overrides.json`
- the audit entry in `data/review-overrides/change-log.json`

The workflow in [.github/workflows/apply-country-overrides.yml](.github/workflows/apply-country-overrides.yml) runs the same rebuild path whenever override files change, commits regenerated published outputs, and requests a Pages rebuild from `main`.

## GitHub Pages

This repository is published directly from the repository root on `main`:

`https://hugomarkoff.github.io/animal_detect_geofence/`

Use the repository root on `main` as the Pages source.