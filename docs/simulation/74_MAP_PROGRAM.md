# 74 — MAP PROGRAM: от един квартал към пълна изпитна вселена

**Status:** proposal + shipped prototype (P1 полигон) · **Author:** A3 (map-program lane) · **Date:** 2026-07-12
**Question answered:** Is the single Студентски град district enough for a complete driving-exam curriculum — and where it is not, what maps do we build, in what order, at what cost?

**Verdict up front: the single map is NOT enough.** It hosts the urban exam core excellently (10 of 16 curriculum archetypes fully, 2 partially), but it *structurally cannot host* four curriculum pillars: hill start (engine gap — the world is flat), railway crossing (no rail + no schema), извънградско каране at 90 km/h, and магистрала merging at 140 km/h. The полигон gap is closed by the prototype shipped with this doc.

---

## 1. Audit — what we have: `content/world/district-v1.json` (measured)

Real-Sofia Студентски град, OSM-derived (`tools/osm/build.mjs`), ODbL-attributed. Measured 2026-07-12 from the shipped file:

| Metric | Value |
|---|---|
| Bounds | 1 638 × 1 233 m (local meters, x = east, y = north) |
| Road network | **20.66 km** across 323 edges / 297 nodes |
| Road-class mix (km) | residential 5.02 · service 4.91 · unclassified 4.75 · primary 2.91 · secondary 2.14 · tertiary 0.88 · secondary_link 0.04 |
| One-way edges | 132 of 323 (all 35 primary, 30/36 secondary — the dual-carriageway boulevards) |
| Speed zones | 30 km/h: 5.50 km (78 edges) · 50 km/h: 15.17 km (245 edges) · **nothing above 50** |
| Lane counts | 1×66 · 2×206 · 3×24 · 4×23 · 5×3 · 6×1 |
| Intersections (deg ≥ 3) | **112** — 96 three-way, 16 four-way |
| — signalized | 19 (→ signal clusters, stop lines, lights) |
| — uncontrolled | 93 (right-hand-rule material; a subset gets derived Б2 stop lines via the minor-meets-arterial heuristic + 1 hand override) |
| Pedestrian crossings | **54** — 24 signalized, 16 marked, 7 unmarked, 7 unknown |
| Roundabouts | **1** (rb-1, r = 19.83 m, 6 ring edges) |
| Buildings / spawns | 248 / 6 |
| Elevation | **NONE — the world is flat by contract** (one flat ground-box collider; every road vertex at `ROAD_Y`; terrain relief ≤ 0.25 m is visual-only) |

Signs/stop lines are **derived**, not in the data (OSM has none): signal approaches, the minor-meets-arterial stop heuristic, and the `STOP_LINE_OVERRIDES` hand table (`runtime/stoplines.ts`).

## 2. Audit — the engine's map contract (what ANY district file must satisfy)

Three independent consumers parse the same JSON; a new map must satisfy all three (this is exactly what the P1 prototype test proves):

1. **World builder** — `world/types.ts assertDistrict` → `world/builders/buildWorldGeometry.ts`. Requires: `format: "district-v1"`, `roads.nodes/edges`, `buildings[]`, `meta.attribution.text`. Road **class strings drive everything visual** via constants tables (`world/builders/constants.ts`): width (`lanes × 3.25 m × PERCEPTUAL_ROAD_SCALE 2.5`), center/edge paint (`MARKED_CLASSES` — tertiary and up), sidewalks (`SIDEWALK_CLASSES` — not service), parking bands (`PARKING_LANE_CLASSES`), streetlights/trees/billboards/bus stops (class heuristics). Parking-bay paint is NOT map data — it is lesson data (`options.parkingBays`, the L7 pattern).
2. **Runtime** — `runtime/district.ts parseDistrict` → `runtime/worldRuntime.ts createWorldRuntime`. Requires additionally: `meta.boundsLocalMeters`, `intersections[]` (degree ≥ 3 only), `crossings[]`, `roundabouts[]`, `spawnPoints[]`. Derives stop lines, signal clusters (empty OK — verified), crossing zones, uncontrolled-junction set, speed limits (`edge.maxspeed`, off-road fallback `meta.defaults.maxspeedUrbanKmh`).
3. **Traffic** — `traffic/types.ts TrafficDistrict` → `traffic/graph.ts buildLaneGraph` → `traffic/system.ts createTrafficSystem`. Hard invariants: **edge `geometry` endpoints coincide with `from`/`to` node coordinates**; every ambient route needs a strongly-connected loopable subgraph (SCC ≥ `minLoopM` 150 m); staged actor `pathNodes` must be consecutive directed-lane pairs; crossings anchor pedestrians via `edgeId`.

Shared geometry truth: `nodeOpenRadiusM` (junction-mouth math) is used by all three — painted line, graded line and NPC stop points agree by construction, on any map.

**The loader seam is a single hardcoded line**: `components/sim/LessonScene.tsx:283` — `fetch("/world/district-v1.json")`. That is the entire multi-map bottleneck (§5).

## 3. Coverage matrix — curriculum vs the single map

Curriculum sources: `lessons/specs.ts` (L0–L7 + lex-exam-1), doc 68 §post-Alpha (hill start, parallel parking, **overtaking — 33 q / 75 pt, the largest theory block**, railway crossing, U-turn, adverse weather; then cyclist/tram/bus, second district, motorway), and the BG cat-B training reality (полигон initial maneuvers + city + извънградско).

| # | Curriculum archetype | district-v1 | Why |
|---|---|---|---|
| 1 | Pre-drive + потегляне (L1) | ✅ | any spawn |
| 2 | Junction priority: Б2 stop + lights (L2) | ✅ | 19 signalized + override table |
| 3 | Right-hand rule | ✅ | 93 uncontrolled junctions |
| 4 | Roundabout (L3) | ✅ | rb-1 (only one — no variety) |
| 5 | Pedestrian crossings (L4) | ✅ | 54 crossings, all kinds |
| 6 | Emergency braking (L5) | ✅ | staged lead-car |
| 7 | Night driving (L6) | ✅ | environment flag |
| 8 | Parking — parallel/bay (L7, exam) | ✅ | painted bays anywhere |
| 9 | U-turn / turnaround | ✅ | dual-carriageway block loop + roundabout (exam route uses both) |
| 10 | 30-zone / living-street discipline | ✅ | 5.5 km of 30 km/h |
| 11 | Overtaking (urban) | 🟡 | map has multilane oneways + two-way streets, but NPCs never change lanes (doc 68 C2) and line legality (solid/dashed) is not modeled — staged-events only |
| 12 | Полигон precision maneuvers (старт-стоп, slalom, bay drills at walking pace) | 🟡→✅ | no dedicated ground in the city — **closed by poligon-v1 (this doc, §7)** |
| 13 | Hill start | ❌ **engine** | world is FLAT by contract — not a map problem (§6.1) |
| 14 | Railway crossing (always-grade stop/look) | ❌ | no rail in district, no schema entity, no props/rules |
| 15 | Извънградско: 90 km/h, curves, village transitions, overtaking zones, animals/fog | ❌ | nothing above 50 km/h exists; no rural geometry |
| 16 | Магистрала: merge/exit, 140 km/h, lane discipline, min-speed | ❌ | no dual carriageway with ramps; NPC speed cap is 50 km/h (config) |

**Score: 10 ✅ · 2 🟡 · 4 ❌.** The single map covers the *urban practical exam* (which in Bulgaria is driven in the city) very well — but the курс and the theory bank cover all 16. Every ❌ maps to real exam questions the "learn by driving" engine (doc 65: 1 016 questions → sim events) cannot teach on this map.

## 4. The map program

### P1 — ПОЛИГОН „Учебна площадка" — **BUILT (prototype, §7)**

| | |
|---|---|
| File | `content/world/poligon-v1.json` (12.9 KB) — generator `tools/maps/gen_poligon.mjs` |
| Design | 380 × 260 m closed ground, 2.07 km of road, 17 nodes / 20 edges. Perimeter circuit (unclassified, 2 lanes, 30 km/h) with **20 m corner arcs** (curve technique); tertiary cross-alleys through a central 4-way (painted center line → keep-right drills); two service **maneuvering aprons** (20 km/h): slalom corridor + parking corridor; 1 marked zebra; 3 spawns (старт-стоп grid, slalom, bays); 2 buildings; **7 junctions, ALL uncontrolled** (right-hand rule at walking pace), zero signals — as on a real полигон |
| Graph approach | Hand-authored via deterministic generator script (no OSM, no randomness — byte-identical re-runs). Original work → **no ODbL obligation** (own attribution block; the seam supports non-OSM maps today) |
| Unlocks | старт-стоп grid drills, slalom (needs cone props §6.3), parallel + perpendicular bay parking (bays are lesson data — `POLIGON_BAYS` pattern proven in the test), figure-eight circuit, first-hours acclimatization before city traffic; **hill-start ramp belongs here in v2** once slope support lands (§6.1) |
| Effort | **DONE** (generator + JSON + 16-test contract proof) + ~0.5 day to wire once the loader seam (§5) lands |

### P2 — ИЗВЪНГРАДСКИ ПЪТ (rural two-lane loop) — highest curriculum ROI

| | |
|---|---|
| Design | ~3.5–4 km two-lane loop (secondary class, `maxspeed: 90` **by tag** — the engine grades from the tag, not the class, so 90 works today), sweeping spline curves incl. one blind curve; **village pass-through** ~600 m (residential 50, gateway limit signs — needs authored sign layer §6.5); one long straight **overtaking zone** (dashed centerline) vs solid-line curve sections (needs marking semantics §6.4); 2 bus stops; T-junction onto a gravel minor road; reserved **rail-crossing site** on the loop (activates with §6.2); ~1.4 × 0.9 km bounds, ~5–6 km road incl. village streets |
| Graph approach | Procedural generator (`tools/maps/gen_rural.mjs`) — parametric loop centerline + stamped village grid, hand-tuned constants; same self-validation as P1 |
| Unlocks | 90 km/h discipline (the speed-limit detectors are already generic per-edge), following distance at speed, **overtaking family (33 q / 75 pt)** with staged oncoming/lead actors, village entry/exit transitions, bus-stop rules, fog/night rural hazards, animal dart-out (staged pedestrian-actor variant), rail crossing later |
| Prerequisites | NPC `maxSpeedMps` per-map config (one-line), overtaking marking semantics (§6.4), authored sign layer (§6.5) |
| Effort | ~2–3 days map+generator, +3–5 days engine (overtake grading + config) |

### P3 — МАГИСТРАЛА segment

| | |
|---|---|
| Design | ~4 km dual carriageway = two parallel oneway edges (2–3 lanes each, `maxspeed: 140` by tag) + **2 interchanges**: on/off ramps as `primary_link` oneway edges merging at shallow angles; median as prop/collider strip; endpoints loop back (teleport-free practice loop) |
| Graph approach | Procedural generator (`gen_motorway.mjs`) |
| Unlocks | merging/deceleration lanes, lane discipline (keep right, `laneId` already graded per edge), 140/min-speed rules, high-speed following, motorway overtaking |
| Risk flag | `nodeOpenRadiusM` junction math assumes compact junctions; **shallow-angle ramp merges are elongated** — build a merge-geometry spike test FIRST (same method as the P1 test) before committing the full map. Runtime `RoadClass` type needs widening (`primary_link` etc., §5.7) |
| Effort | ~3–4 days map + 3–5 days engine/tuning (merge geometry is the risk) |

### P4 — Second city district (optional, later)

Another Sofia district through the **existing** OSM pipeline (`tools/osm/` — change `district.config.mjs`, run fetch+build). Near-zero engine work once the seam lands; value = route variety, second roundabout geometry, exam-route diversity. ~1–2 days. Not curriculum-blocking.

## 5. Multi-map engine work (file-level)

1. **`modules/sim/contracts.ts`** — `LessonSpec` gains `world?: { districtId: string }` (absent = `"district-v1"`). Data-only, backward compatible.
2. **`components/sim/LessonScene.tsx:283`** — the seam: `fetch(\`/world/\${lesson.world?.districtId ?? "district-v1"}.json\`)`. Everything downstream (`createWorldRuntime`, `assertDistrict`, `buildWorldGeometry`, `createTrafficSystem`, minimap, spawns) is already parameterized by the parsed object — **proven map-agnostic by the P1 test**.
3. **Publish step** — `content/world/*.json` → `platform/public/world/` (tiny copy script or predev hook; today district-v1.json is duplicated by hand).
4. **`world/builders/buildWorldGeometry.ts`** — the `options.parkingBays` **default** is `LESSON_PARKING_BAYS` (pinned to district-v1 coordinates). On another map the L7 bay would paint off-map (harmless but wrong). LessonScene must pass the *lesson's* bays explicitly; polygon lessons pass their own (P1 test documents the pattern).
5. **Per-lesson traffic config** — LessonScene hardcodes `vehicleCount: 26, pedestrianCount: 20, anchorRadiusM: 280`; полигон wants 0–4 vehicles. Move to `LessonSpec` (data) with the current values as defaults. Also `TrafficConfig.maxSpeedMps` (50 km/h cap) per map for P2/P3.
6. **`runtime/stoplines.ts STOP_LINE_OVERRIDES`** — district-v1-pinned ids; **safe on other maps** (unknown `edgeId` → `continue`, verified), but should migrate to per-map data alongside §6.5.
7. **`runtime/district.ts RoadClass`** — narrower than `world/types.ts` (missing `primary_link`, `tertiary_link`, `living_street`). Type-only widening (runtime never validates class strings; `CLASS_RANK` lookups default to 2).
8. **`world/builders/props.ts PARKING_KIT_SITES`** — district-pinned coords, auto-skipped off-bounds (already covered by the synthetic-district test). No change needed.
9. **Lesson/exam pinning tests** (`guidanceRoute.test.ts`, `exam-spec.test.ts`) — keep pinned to district-v1; new maps get their own pinned specs + tests (P1's test is the template).

**Estimate: 1–2 days** for items 1–5 (the seam) — then any valid district JSON is a playable map.

## 6. Engine capability gaps (curriculum-blocking, NOT map-fixable)

1. **Slope / terrain — blocks hill start.** The flat contract is everywhere: `colliders.ground` is one flat box (buildWorldGeometry), every road vertex sits at `ROAD_Y = 0.02`, edge geometry is 2D `[x, y]`, runtime grading is plan-view 2D, and `VehicleSim` zeroes vertical velocity on the flat plane. What's needed: (a) schema — optional `z` per geometry point (district-v2, additive); (b) builders — loft ribbons/junctions/sidewalks to z, replace the flat ground box with a road-following trimesh/heightfield collider; (c) vehicle — Rapier handles slopes once colliders slope, but the harness contract (12 cm curb, launch/brake tests) and hill-hold/handbrake tuning must be re-verified; the **stall/clutch driveline already exists** (driveline.ts + tests), so hill start becomes teachable the moment the ground can tilt; (d) runtime — grading stays 2D-projected (slope doesn't change plan geometry): cheap. Then add the ramp edge (8–10 %, ~30 m) to полигон v2. **Est: 1–1.5 weeks — the single largest engine item in this program. Do not hand-wave it.**
2. **Railway crossing.** New schema array (`railCrossings[]`: x, y, edgeId, barriers), world props (СВ signs, cross-buck, barrier meshes, track decal), a runtime zone tracker (clone of the crossing-zone pattern) + rule detectors (mandatory stop/look, barrier = red), and a scripted barrier/lights cycle (a train mesh is optional v1 — the barrier IS the grading stimulus). **Est: 3–5 days.** Lands on the P2 reserved site.
3. **Cone/marker props (полигон slalom).** Lesson-authored prop list (the `ParkingBaySpec` pattern) → instanced cones + small colliders; `collision withWhat: "staticObject"` already grades hits. **Est: 1–2 days.**
4. **Overtaking semantics.** Centerline legality per edge (schema: `centerline: "solid" | "dashed"` or zone list), player lane-change detection events, OVERTAKE_* detectors in rules/. The oncoming/lead staged actors and queries already exist. **Est: 3–5 days.** Home: P2.
5. **Authored sign layer.** Signs are heuristic-derived today; village gateways (50↔90), полигон 20-zones and rail approaches need hand-placed signs+meaning. Generalize the proven `STOP_LINE_OVERRIDES` pattern into per-map `signOverrides` consumed by both `runtime/stoplines.ts` and `world/builders/props.ts`. **Est: 1–2 days.**

## 7. Prototype report — P1 ПОЛИГОН (shipped with this doc)

**Files (all additive, nothing existing was edited):**
- `tools/maps/gen_poligon.mjs` — deterministic generator with build.mjs-style self-validation (endpoint/length/degree/connectivity checks, exits non-zero on violation).
- `content/world/poligon-v1.json` — 12.9 KB, 2.07 km, 17 nodes / 20 edges / 7 uncontrolled junctions / 1 zebra / 3 spawns / 2 buildings, 30/20 km/h zones.
- `platform/src/modules/sim/world/__tests__/poligon-district.test.ts` — **16 tests** driving the REAL production stack over the file.

**What the test proves (all green, first run):**
- `assertDistrict` + `buildWorldGeometry`: 20/20 edges ribboned, ≥ 7 junction patches, zero NaN across every mesh/placement buffer, valid indexed trimesh colliders, deterministic per seed, 2 lesson-authored bays painted (+3 quads each — the L7 pattern), zero traffic lights / stop signs / billboards (полигон by design), 1 zebra.
- `createWorldRuntime`: parses; **zero signal clusters and zero stop lines handled cleanly**; all 7 junctions classified uncontrolled (right-hand rule); speed zones resolve 30/20/30-default; all 3 spawns locate onto their authored edges; a clean eastbound sample() run down the start straight produces zero phantom events.
- `buildLaneGraph` + `createTrafficSystem`: 36 directed lanes, **all 36 loopable (one SCC)**; zebra mapped to both spine lanes; ambient routes close and 6 vehicles + pedestrians run 240 frames staying finite and in-bounds; a **staged instructor-car path resolves across the spine and drives**; playback is seed-deterministic.

**Verification:** `npx tsc --noEmit` clean · new test 16/16 · **full platform suite 105 files / 1 184 tests — all passing** (1 168 pre-existing + 16 new). Nothing committed.

**Conclusion:** the engine is already map-agnostic at the data layer — a hand-authored non-OSM district builds, grades and runs traffic with **zero engine changes**. The remaining multi-map cost is the §5 loader seam, not the data contract.

## 8. Sequencing (recommended)

| Wave | Work | Cost | Unblocks |
|---|---|---|---|
| 1 | Multi-map seam (§5.1–5.5) + wire полигон as „Площадка" mode | 1.5–2 d | P1 playable |
| 2 | Cone props + 3–4 полигон drill lessons | 2–3 d | slalom, bay drills, старт-стоп |
| 3 | P2 rural map + overtaking semantics + sign layer | ~1.5 wk | the 33 q/75 pt overtaking block, 90 km/h, village transitions |
| 4 | Slope capability + полигон v2 ramp | 1–1.5 wk | hill start (exam maneuver) |
| 5 | Rail crossing (on P2's reserved site) | 3–5 d | always-grade rail rules |
| 6 | P3 motorway (merge spike test first) | ~2 wk | merging, 140 km/h, lane discipline |
| 7 | P4 second city district (OSM pipeline re-run) | 1–2 d | variety (optional) |
