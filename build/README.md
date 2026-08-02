# Geofence build pipeline

The scripts that produce everything under `../data/`. They lived in a separate,
unversioned directory until 2026-08-02, which is how two copies of the same
country-membership rule drifted apart and stayed wrong for weeks — see below.

## The chain

```
SpeciesNet bundle              review app
taxonomy_release.txt           data/review-overrides/
geofence_release.json                  |
        |                              |
        +---> build_global_animals_dataset.py ---> data/animals-global.json
        |                                                   |
        +---> build_all_country_precomputed.py              |
        +---> build_usa_state_precomputed.py  ---> data/precomputed-countries/*.json
                                                            |
                            ../tools/apply_country_overrides.py  (run by CI)
```

`build_*` regenerate from scratch. `../tools/apply_country_overrides.py` is the
one CI runs on every push touching `data/review-overrides/**`, and it rewrites
`animals-global.json` from `data/review-overrides/geofence-baseline.json`.

**Editing `data/animals-global.json` by hand does not stick** — the workflow
regenerates it. Change the baseline, the overrides, or these scripts.

## Inputs are not vendored

`taxonomy_release.txt` and `geofence_release.json` ship with the SpeciesNet
bundle and are installed by `VertexAI_API_endpoint/scripts/download_speciesnet.py`.
Keeping copies in a repo is what let them fork from the bundle: the servers ran
4.0.2a metadata against 4.0.3a geofence data for weeks, which is why the same
species appeared as `artiodactyla` in one place and `cetartiodactyla` in another.

## The rule that bit us

A subdivision list says **where** a species occurs. It must never revoke the
country. Both of these got that wrong, in different ways, and each deleted a
country that a reviewer had approved:

- `build_global_animals_dataset.py` computed `allow - block` on country keys, so
  `block: {"USA": ["HI"]}` — excluding Hawaii — deleted the entire USA.
- `apply_country_overrides.py` dropped a country whenever its state list was
  anything short of all 51.

Country membership is a reviewed decision and lives in the country packs
(`likely_true_both` / `likely_true_one_source`). `new_record` is a suggestion
awaiting review and must not widen the geofence. When these two disagreed,
white-tailed deer — validated in the USA pack — came back as `animal` for every
US customer.

Keep the two in step. That is the whole reason this directory is here.
