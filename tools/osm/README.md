# OSM → World Pipeline

Turns real Sofia street data (OpenStreetMap) into the simulator's district file
`content/world/district-v1.json`. Design doc: [docs/simulation/17_WORLD_GENERATION_AND_MAP_SYSTEM.md](../../docs/simulation/17_WORLD_GENERATION_AND_MAP_SYSTEM.md).

Zero npm dependencies — plain Node ≥ 18 (built-in `fetch`). No install step.

## Run

```bash
cd tools/osm
node fetch.mjs          # download raw OSM extract → cache/studentski-grad.json (skips if cached)
node build.mjs          # cache → content/world/district-v1.json + validation summary
```

`fetch.mjs --force` re-downloads (use when the bbox changed or you want fresher
OSM data). `build.mjs` is deterministic: same cache file → byte-identical
output. It exits non-zero if any validation check fails (unresolved node refs,
non-finite coords, missing roundabout/signals, output over the 2 MB budget).

## Change district

1. Edit `district.config.mjs`: set `name`, `label`, `bbox` (keep ~1 km² —
   bigger boxes blow the output budget and the lesson scope).
2. `node fetch.mjs --force` (new cache file is keyed by `name`)
3. `node build.mjs`
4. Check the printed summary: you want ≥ 1 roundabout, several signalized
   intersections, and a largest connected component ≥ 95% of nodes. The build
   fails hard if there is no roundabout or no signalized intersection —
   pick a better bbox rather than relaxing the checks.

Tip for choosing a bbox: query Overpass for `way["junction"="roundabout"]` and
`node["highway"="traffic_signals"]` in the wider area first, then place the
~1 km² window where both are dense (that is how the current window was chosen).

## Files

| File | Role |
|---|---|
| `district.config.mjs` | district name/bbox, drivable-class filter, shared by both scripts |
| `fetch.mjs` | Overpass query (highways, signals, crossings, buildings) → `cache/` |
| `build.mjs` | projection, graph split, defaults, validation, serialization |
| `cache/` | raw Overpass extracts — **gitignored**, re-fetchable, treat as disposable |

## Etiquette & legal

- Overpass is a shared free service: the scripts send one request, identify
  themselves via User-Agent, and fall back to a mirror. Don't loop fetches.
- Output embeds OSM attribution (`meta.attribution`) — **ODbL requires** the
  product to show “© OpenStreetMap contributors” wherever the world is
  rendered. Never strip that block. Details in doc 17.
