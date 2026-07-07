# TRAFFIC AI SYSTEM

> Status: **v1 implemented** — scripted ambient traffic (`platform/src/modules/sim/traffic/`).
> Scope note: v1 is deliberately NOT "traffic AI". It is deterministic scripted
> traffic whose only job is to make the district feel alive and to create
> teaching situations (red lights that matter, pedestrians to yield to,
> vehicles to keep distance from). The AI ambitions (personalities, Behavioral
> NPCs, Traffic Controller — docs/00_PRODUCT_VISION.md, H2) build on these hooks.

## v1 design (implemented)

### Architecture

Pure-TS logic (zero React/three imports) + a thin instanced R3F presentation:

| File | Responsibility |
|---|---|
| `traffic/graph.ts` | district-v1.json → directed **lane graph**: one lane per travel direction per drivable edge, centerline offset 3.25 m/2 to the right of travel (right-hand driving), precomputed cumulative arc lengths, end-node signal/intersection facts, crossing arc positions; largest SCC (Tarjan) marks loop-safe lanes |
| `traffic/routes.ts` | precomputed **closed loops**: seeded random walk through the SCC, closed by deterministic BFS back to the start node; validated by tests against the real district |
| `traffic/vehicles.ts` | kinematic vehicle agents: IDM car following, signal stop envelopes, yellow-light commit latch, unsignalized-junction time-slot reservation, player lookahead, crossing yield; hard post-integration anti-overlap clamps |
| `traffic/pedestrians.ts` | sidewalk out-and-back loops anchored on crossings; curb wait 1–2 s; signalized/unsignalized crossing gates; crossing-occupancy bookkeeping |
| `traffic/system.ts` | `createTrafficSystem(district, config)` — owns all agents, one `update(dt, ctx)` per frame (pedestrians, then vehicles), zero allocations in the update path |
| `traffic/TrafficLayer.tsx` | 6 instanced draw calls total: bodies / cabins / wheels / brake bars / ped capsules / ped heads; 4 seeded body colors; brake bars light on deceleration; zero-scale-matrix culling beyond 150 m |

All logic runs in district space (x = east, y = north, meters); presentation
maps to three.js `(x, -z)` exactly as district-v1.json documents.

### Behavior matrix

| Situation | Vehicle agent | Pedestrian agent |
|---|---|---|
| Red / red+yellow at lane end | decelerates (IDM) to stop line 8 m before the node, holds | signalized crossing: vehicle-red = walk |
| Yellow | stops if `v²/2b` fits before the line; otherwise commits and clears the junction (latched — no mid-box panic brake) | treated as "don't start" |
| Green | proceeds; corner speed capped by turn sharpness (≈4 m/s at 90°) | waits |
| Unsignalized junction (degree ≥ 3) | time-slot reservation per node id; non-holders stop ~6.5 m short; stale slots (>0.8 s unrenewed) reclaimed | — |
| Agent ahead on same/next lane | IDM following (min gap 2 m + 1.4 s headway); hard no-overlap clamp | — |
| Player ahead in lane (±2.3 m lateral, 60 m lookahead) | follows/stops exactly like an agent leader; can NEVER clip through (post-integration clamp, ≥0.8 m bumper gap); resumes when player leaves | moving player within 22 m of an unsignalized crossing blocks; a **stopped** player releases the gate — the "yield and they cross" teaching moment |
| Pedestrian on crossing | stops 4 m before the crossing while occupied (checked 60 m ahead across lane boundaries) | occupancy exposed per crossing id |
| Vehicle approaching unsignalized crossing | — | waits unless every vehicle is ≥12 m away AND ≥3 s time-to-arrival |

### Determinism & performance

- `(seed, district, config, dt sequence)` → bit-identical playback (verified
  by test: 1800 frames on the real district, exact float equality).
- All randomness via mulberry32 streams fixed at init; per-pedestrian streams
  for wait jitter. No `Math.random`, no `Date.now`.
- Update path allocates nothing; scratch objects live for the session.
- Measured: **~0.009 ms/frame** for 12 vehicles + 10 pedestrians on the real
  district (budget was ≤1 ms). Presentation adds 6 draw calls.

### Integration contract (for the integrator)

```ts
const traffic = createTrafficSystem(districtJson, { seed, vehicleCount: 10, pedestrianCount: 8 });
runtime.setPedestrianQuery?.(id => traffic.pedestrianOnCrossing(id)); // once

// per frame, in this order:
runtime.update(dt);                                   // 1. signals advance
traffic.update(dt, {                                  // 2. traffic reacts
  signalPhase: id => runtime.signalPhase(id),
  playerPos: { x, y }, playerSpeedKmh, playerHeadingDeg,
});
// 3. render; <TrafficLayer system runtime playerRef .../> can run step 2 itself
```

Vehicles query `signalPhase` with **signalized intersection node ids** from
`intersections[]`; pedestrians with the signal node mapped from a signalized
crossing (nearest signalized intersection ≤45 m — computed at init). The
runtime should return a sane default for unknown ids ("green" keeps traffic
flowing). Crossings whose signal cannot be mapped fall back to gap-based
crossing.

## v1 limitations (accepted)

- **No lane changes / overtaking** — agents hold the rightmost lane of their
  loop; a blocked lane stays blocked until the obstacle clears.
- **No personalities** — one gentle, law-abiding temperament with only a
  seeded desired-speed factor (0.82–1.0 × limit).
- Player detection is a heading-ray approximation — precise on straights,
  approximate on sharp curves (a hard proximity clamp still prevents contact).
- `lanes=1` bidirectional alleys share one centerline: opposing agents may
  visually overlap there (rare; excluded `service` class removes most cases).
- Rare junction gridlock is possible (two holders mutually blocked past their
  nodes); reservations go stale in 0.8 s so it self-heals visually rather than
  deadlocking the system.
- Pedestrians never jaywalk, never react to vehicles mid-crossing; vehicles
  committed past a stop line ignore late red flips (by design — real drivers do).

## v2 roadmap hooks

- **Personalities** (vision doc 00, H2 "AI traffic personalities"): the whole
  temperament surface is already parameterized per agent (`desiredFactor`,
  IDM accel/decel/headway, ped wait/gap). A personality = a named preset +
  rule-bending policies (rolls stops, late yellow, close follower) selected by
  the seeded init — pure data, no engine change.
- **Scenario Generator / Traffic Controller**: `TrafficUpdateContext` is the
  seam — a controller can spawn scripted "situation agents" (e.g. a car that
  runs the red as the player approaches) by adding a second agent pool with
  authored routes; determinism per seed already supports replay/dashcam.
- **Behavioral NPCs**: pedestrian gate + crossing occupancy are the contract;
  richer NPCs only need to keep answering `pedestrianOnCrossing`.
- Lane changes need lane-adjacency in the graph build (left-lane polylines are
  a config change — `laneOffsetFor` already models per-direction lane counts).
- Rule-engine tie-in: `prioritySituation` SimTick events (rules/types.ts,
  reserved v2) can be adjudicated from the reservation table — the engine
  knows exactly who had the slot and who barged in.

## Test coverage

`npx vitest run src/modules/sim/traffic` — 29 tests: real-district graph
integrity, route loop validity (edge connectivity incl. wrap), red/redYellow/
yellow stop envelopes + yellow commit, IDM queueing and no-overlap invariants,
player blocking + resume, pedestrian wait/gate/occupancy flows (signalized +
unsignalized + player-yield), bit-exact determinism per seed, perf envelope.
