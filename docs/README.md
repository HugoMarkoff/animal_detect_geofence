# Docs

This folder documents the minimal live structure for the published review site.

Recommended reading order:

1. [minimal-live-phase.md](minimal-live-phase.md)
2. [suggestion-generation-flow.md](suggestion-generation-flow.md)
3. [examples/README.md](examples/README.md)

## What each document covers

- `minimal-live-phase.md`: the published file contract, which files the live site should read, and the default inclusion rules for `Likely Valid`, `Needs Review`, `New`, and `Unlisted`
- `suggestion-generation-flow.md`: how upstream taxonomy + geofence data becomes country suggestions and visible review buckets
- `examples/`: small JSON examples for the main file types used in the minimal live phase

The goal is to keep the live repo focused on fetchable outputs and review decisions, not on rebuilding the full evidence pipeline in the browser.