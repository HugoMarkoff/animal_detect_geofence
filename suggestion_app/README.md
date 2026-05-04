# Country Review Desk

This repository packages the reviewer-facing ticket app as a standalone project.

- The GitHub Pages version now lives at the repository root (`index.html` + `assets/`).
- `suggestion_app/` remains as the earlier Flask wrapper and reference implementation.
- `data/animals-global.json` provides the animal catalog.
- `data/precomputed-countries/` provides the current country pack membership and regional polygons.

## Run

From the workspace root:

```bash
python suggestion_app/app.py
```

Open `http://127.0.0.1:5070/` by default.

## Optional GitHub repo default

The app defaults to `HugoMarkoff/animal_detect_geofence` for GitHub issue drafts.

If you want to override that target, set:

```bash
export GITHUB_ISSUE_REPO=owner/repo
```

Without that value, the app still builds the issue title and body and can copy the markdown preview.

## Workflow

1. Select a country and inspect the current pack on the left.
2. Click species cards to highlight existing regional polygons on the map.
3. Choose `addition`, `correction`, or `removal`.
4. For regional additions or corrections, draw one or more polygons on the map.
5. Add the mandatory explanation.
6. Build the ticket, then copy it or open a GitHub issue draft.

## Install

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The frontend uses CDN-hosted Leaflet, Leaflet.Draw, polygon-clipping, and Turf, so no Node setup is required.