# WORLD GENERATION AND MAP SYSTEM

> Status: v1.0 — 2026-07-07. Implements the city-pipeline decision from [06_TECH_STACK_EVALUATION.md](../architecture/06_TECH_STACK_EVALUATION.md) (real OSM road topology → procedural meshes in-engine → hand-polish lesson intersections). Pipeline code: `tools/osm/`. Output: `content/world/district-v1.json`.

## 1. Pipeline overview

```
OpenStreetMap (Overpass API)
        │  tools/osm/fetch.mjs — one query: drivable highways, traffic_signals,
        │  crossings, building footprints; cached to tools/osm/cache/ (gitignored)
        ▼
raw Overpass JSON (cache)
        │  tools/osm/build.mjs — deterministic transform + self-validation
        ▼
content/world/district-v1.json   (~176 KB, versioned in repo)
        │  simulator world-loader (Track B) — procedural road/building meshes,
        │  signal + crossing placement, spawn selection
        ▼
in-engine district  →  hand-polish pass on the ~8 lesson intersections
```

Principles:

- **Topology from reality, geometry from code.** OSM gives us the real street
  network of Sofia (what students will actually drive after passing); the
  engine generates road surfaces, curbs and buildings procedurally from the
  graph. No auto-tool produces game-quality intersections from OSM — so the
  handful that lessons use get manual attention (§6).
- **Deterministic builds.** `build.mjs` output is a pure function of the cache
  file: no timestamps, stable sort orders, fixed float precision. Same cache →
  byte-identical JSON. World bugs stay reproducible; content diffs stay
  reviewable.
- **The JSON is the contract.** The simulator never touches OSM concepts
  (ways/relations/tags). If we swap the data source later, the sim does not
  change.

## 2. District choice: Студентски град (north), ~1.04 km²

Bounding box `42.6550, 23.3473 → 42.6640, 23.3600`, center `42.6595, 23.35365`.

Candidates were Студентски град and Младост 1 (both flat, grid-like, familiar
to Sofia students). Scoped both against Overpass (2026-07):

| Criterion (beginner-lesson needs) | Студентски град | Младост 1 |
|---|---|---|
| Roundabout | **Yes** — ул. „Акад. Борис Стефанов" / ул. „8-ми декември" | **None mapped** — eliminates it |
| Signalized intersections | 4 physical junction groups (16 signal nodes) in final window | many, but no roundabout |
| Pedestrian crossings | 54 in window (24 signalized) | dense |
| Road class mix | primary (бул. „Г. М. Димитров") + secondary (бул. „Св. Климент Охридски") + tertiary collectors + residential student grid | comparable |
| Complexity ceiling | no motorway/trunk, no trams, no complex interchanges | similar |

The exact window was then **optimized programmatically**: candidate ~1 km²
boxes were scored by contained `traffic_signals` nodes under the constraint
that the roundabout stays inside; the winner holds the roundabout **and** the
signal clusters on Климент Охридски and Г. М. Димитров. A first, more southern
guess had only 4 signal nodes — worth remembering: *always scope signal
positions before fixing a bbox*.

Learner-relevant inventory of the built district (2026-07-07 OSM data):

| Metric | Value |
|---|---|
| Road length | 20.66 km |
| Graph nodes / edges | 297 / 323 |
| Intersections (degree ≥ 3) | 112, of which 19 nodes signalized (≈4 physical junctions — dual carriageways split into several graph nodes) |
| Pedestrian crossings | 54 (24 with signals, 16 marked, 7 unmarked, 7 unknown) |
| Roundabouts | 1 (r ≈ 20 m) |
| Buildings | 248 footprints |
| Spawn points | 6 (quiet residential edges, ≥150 m apart) |
| Connectivity | 6 components; largest holds 96% of nodes |
| Output size | 176 KB (budget 2 MB) |

## 3. Data format: `district-v1.json`

Top level: `{ format: "district-v1", meta, roads: { nodes, edges }, intersections, crossings, roundabouts, buildings, spawnPoints }`. One record per line — diffable in review.

**Coordinates.** Local meters on an equirectangular tangent plane around
`meta.center`: `x` east, `y` north (`meta.projection` records the exact
constants). Engine mapping: `(x, y) → three.js (x, −z)`, y-up. Distortion over
±600 m at this latitude is < 0.1% — irrelevant at game scale. Roads rounded to
1 cm, buildings to 10 cm.

**`roads.nodes`** — `{ id: "n<osmNodeId>", x, y }`. Graph vertices: every
junction and every way endpoint.

**`roads.edges`** — OSM ways split at junction nodes:

```json
{ "id": "e<wayId>.<seg>", "from": "n…", "to": "n…", "class": "residential",
  "name": "Крум Кюлявков", "oneway": false, "roundabout": false,
  "lanes": 2, "lanesSource": "tag|default",
  "maxspeed": 50, "maxspeedSource": "tag|default",
  "length": 91.8, "geometry": [[x,y], …] }
```

- `class`: OSM highway value (`primary … service`); driveways/parking aisles excluded at build time.
- `lanes` = total marked lanes. `*Source: "default"` marks values we guessed — the hand-polish pass targets these first.
- **Bulgarian defaults** (ЗДвП чл. 21): urban `maxspeed` 50, `living_street` 20, `service` 30 (documented guess). Lanes default: 2 two-way / 1 oneway (4 / 2 for primary-class).

**`intersections`** — `{ id, x, y, degree, signalized }` for every node with
degree ≥ 3. `signalized` = the node itself is a `traffic_signals` node **or**
one exists within 25 m (OSM usually tags signals on approach nodes, not the
junction itself).

**`crossings`** — `{ id, x, y, kind: "signals"|"marked"|"unmarked"|"unknown", signalized, edgeId }`.
`edgeId` = the drivable edge the crossing sits on (null when it's on an
excluded way).

> **Additive tags the generators write and this section does not derive from
> OSM.** All optional; absent ⇒ the behaviour described above, so every map
> written before a tag is byte-identical. Owned by the TypeScript contract in
> `sim/world/types.ts`, which carries the measurement behind each one.
>
> - on an **edge**: `zone`, `noOvertake`, `noUTurn`, `motorway`,
>   `parkingBand` (draw the 4 m curbside band), `parkingSide`
>   (`left|right|both` — which kerb the procedural row FILLS; the band is
>   drawn on both either way), `parkingMix` (what KIND of vehicle stands
>   there — `freight|compact|veteran`).
> - on a **crossing**: `island` (`{widthM, approachM, departM}` — a kerbed
>   central refuge / median nose, built into the sidewalk mesh so it is also a
>   collider), `tableRampM` (raised-table ramp band, paint only), `staggerM`,
>   `skewDeg`. None of them moves the crossing POINT, which is the only thing
>   `runtime/zones.CrossingZoneTracker` derives the graded zone from.
>
> `approachM` is a schema field, not a thing a student can see: a 9 m nose at
> 64 m from the spawn does not appear in a cockpit frame at all. Photograph a
> kit from the seat before crediting a map for it (doc 87 B50/B53/B54).

**`roundabouts`** — clustered `junction=roundabout` edges:
`{ id: "rb-1", x, y, radius, edgeIds }`. The sim treats members as
oneway-circular with priority-inside (BG rule: знак Б1 on entries — verified
per-roundabout in hand-polish).

**`buildings`** — `{ id, height, heightSource: "height"|"levels"|"default", footprint: [[x,y],…] }`.
Footprint = simplified outer ring (Douglas–Peucker ε = 0.4 m), unclosed (last
point ≠ first; renderer closes it). Height = `height` tag, else
`building:levels × 3 m`, else default 2 floors → 6 m.

**`spawnPoints`** — `{ id, x, y, heading, edgeId, name }`. Deterministically
picked: residential/unclassified edges ≥ 60 m, in the largest component,
mid-edge, ≥ 150 m apart, longest first. `heading` in degrees, 0 = north,
clockwise.

**`meta`** — district id/label, center, requested bbox, local bounds,
projection constants, BG defaults used, source provenance (OSM data timestamp,
cache SHA-256, generator), **attribution block (§5)**, and the build stats
table (so the sim/UI can show data-coverage info without re-deriving it).

## 4. Validation (self-check inside build.mjs, hard-fails the build)

- every `edge.from/to`, `crossing.edgeId`, `spawn.edgeId` resolves
- no NaN/∞ anywhere; lanes ≥ 1; maxspeed ≥ 5; lengths > 0; no duplicate ids
- footprints ≥ 3 points; output parses as JSON; size ≤ 2 MB
- connected-component stats printed (union-find); **≥ 1 roundabout and ≥ 1
  signalized intersection required** — a bbox that can't teach the lessons is
  a build error, not a warning

## 5. ODbL — legal obligations (REQUIRED)

`district-v1.json` is a **Derivative Database** of OpenStreetMap data under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Non-negotiable consequences for the product:

1. **Visible credit** — every surface that renders this world (sim canvas,
   marketing screenshots/videos of it) must show **„© OpenStreetMap
   contributors"** with a link to
   [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright).
   Plan: permanent small credit in the sim HUD corner + entry in the About
   screen.
2. **Share-alike for the data** — if we ever redistribute this file (or a
   derived database of it) publicly, it stays under ODbL. The *rendered world*
   (meshes, screenshots, the game itself) is a Produced Work — our own license,
   as long as the credit in (1) is shown.
3. **No attribution stripping** — `meta.attribution` travels with the file;
   build regenerates it every time; nobody deletes it downstream.

Our proprietary layers (lessons, scoring, AI tutor, hand-polish deltas) are
kept **outside** this file, so ODbL share-alike never touches them.

## 6. Hand-polish plan: the ~8 lesson intersections

What OSM cannot give us and manual work must (stored as an overlay/delta file
in wave 2 — never edited into the generated JSON, or a re-fetch destroys it):

| # | Intersection | Lesson use | Needed polish |
|---|---|---|---|
| 1 | Roundabout „Борис Стефанов" / „8-ми декември" (`rb-1`) | roundabout entry/exit, priority-inside | entry yield lines + Б1/Д11 signs, deflection islands, lane geometry |
| 2 | бул. „Г. М. Димитров" × „Никола Габровски" (signals) | signalized left turn across dual carriageway | merge 4 graph nodes into one logical junction; signal phases; stop lines; turn pockets |
| 3 | „Климент Охридски" × „Г. М. Димитров" × „Драган Цанков" (signals) | multi-lane signalized arterial junction | same as #2 + lane-assignment arrows (Г17-style markings) |
| 4 | „Климент Охридски" × „Проф. Марко Семов" (signals) | signalized junction + signalized pedestrian crossing | signal phasing incl. pedestrian phase; crossing zebra decals |
| 5 | „Климент Охридски" × „Трайко Станоев" / „Брадистилов" (signals) | T-junction on arterial, right-turn yield to pedestrians | as #4 |
| 6 | Uncontrolled residential X-junction in the student grid (e.g. „Крум Кюлявков" × „Васил Калчев") | predimstvo-na-dyasno (priority-to-the-right) | verify no signs exist in reality; curb radii; sightline blockers |
| 7 | Uncontrolled T-junction, narrow street | yielding, positioning | curb radii; parked-car props |
| 8 | Mid-block signalized pedestrian crossing on „Климент Охридски" | pedestrian priority, ЗДвП чл. 119–120 | crossing island geometry, signal timing |

Per-junction checklist: correct logical merge of dual-carriageway nodes → stop
line positions → sign placement (from `content/signs`) → lane counts verified
on satellite imagery/Mapillary → signal phase table → curb/island geometry →
QA drive-through. Estimate: ~1 h each inside the 35 h city-pipeline budget
(doc 06).

**Junction-merge note:** OSM models dual carriageways as parallel oneways, so
one physical junction = up to 4 graph nodes ≤ 30 m apart (our 19 signalized
nodes ≈ 4 physical junctions). Wave 2 adds an automatic junction-clustering
pass; until then the sim treats nearby signalized nodes as one logical
controller during hand-polish.

## 7. Wave 2 (post-MVP, in priority order)

1. **Lane markings & lane topology** — per-lane centerlines, turn-lane tags
   (`turn:lanes`), generated decal markings; prerequisite for lane-discipline
   scoring. OSM `lanes` coverage here is only ~45% of edges — expect manual
   verification per lesson route.
2. **Junction clustering** — collapse dual-carriageway node groups into logical
   intersections with approach legs (needed for traffic-AI phase control).
3. **Elevation** — district is mostly flat; add SRTM/EU-DEM sampling for the
   slight Витоша-side slope (hill-start lesson wants ≥ 1 sloped street).
4. **Hand-polish overlay format** — `district-v1.overlay.json` with per-id
   patches (signs, phases, geometry overrides) merged at load time.
5. **More districts** — config-driven; the pipeline already supports it
   (`tools/osm/README.md`).

## 8. Known data-quality issues (measured on this build)

- **`lanes` tag coverage: 45.5% of edges (41.1% of km)** — the majority of
  edges use our defaults (`lanesSource: "default"`). Fine for visual width;
  NOT trustworthy for lane-discipline scoring until verified per lesson route.
- **`maxspeed` coverage: 7.7% of edges** — BG urban default 50 km/h applied
  everywhere else. Legally correct as a default inside urban areas, but any
  signed 30-zone that OSM missed will be wrong until hand-checked.
- **Crossing kinds:** 7 of 54 crossings are `unknown` (no `crossing=*` tag);
  3 crossings sit on non-drivable ways (`edgeId: null`).
- **Signal semantics missing:** OSM has no phase/timing data — all signal
  timing is invented in the sim (traffic-AI doc 15) and tuned per lesson.
- **Small disconnected fragments:** 5 tiny components (2–3 nodes each, gated
  service stubs at the bbox edge) — harmless; world-loader should ignore
  components below ~5 nodes for traffic routing.
- **Buildings are LOD-0 extrusions:** flat-roof prisms from footprint × height
  guess (`heightSource: "default"` = 2 floors); Студентски град high-rises
  will look short where `building:levels` is untagged.
