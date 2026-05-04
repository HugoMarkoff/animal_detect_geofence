# animal_detect_geofence

Standalone repository for the country-pack review and ticket workflow.

## What is here

- `index.html`: GitHub Pages entry for the review and ticket workflow.
- `assets/`: static JavaScript and CSS used by the GitHub Pages app.
- `data/animals-global.json`: global animal catalog used for lookup and ticket forms.
- `data/precomputed-countries/`: precomputed country packs and regional footprint polygons.
- `HANDOVER_GUIDE.md`: project context, transfer notes, and next-step guidance.
- `suggestion_app/`: earlier Flask prototype kept as a reference while the Pages version becomes primary.

## Quick start

```bash
python -m http.server 8081
```

Open `http://127.0.0.1:8081/`.

By default, GitHub issue drafts target `HugoMarkoff/animal_detect_geofence`.

## GitHub Pages

This repository now has a root `index.html`, so it can be published directly at:

`https://hugomarkoff.github.io/animal_detect_geofence/`

Use the repository root as the Pages source.