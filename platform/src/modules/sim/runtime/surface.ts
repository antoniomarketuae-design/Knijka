/**
 * sim/runtime — THE ROAD SURFACE. Two slices, one subject:
 *
 *   1. SURFACE GRIP PATCHES — how much grip the surface gives (aquaplane/ice).
 *   2. THE DRIVABLE SURFACE — whether there is a surface there AT ALL.
 *
 * Slice 2 lives at the bottom of the file; its own header carries the defect
 * it exists for.
 *
 * ---------------------------------------------------------------------------
 * 1. SURFACE GRIP PATCHES (the AQUAPLANE + ICE slice; doc 72 §13
 * AC-07-full standing-water float / AC-08 ice band).
 *
 * The `waterPatch` / `icePatch` district zone spans (district.ts) are the
 * ONLY zone kinds consumed by the PHYSICS RIG instead of the rule-engine
 * tick: worldRuntime ignores them (unknown-kind tolerance — no tick channel
 * exists), while this file turns them into district-space RECTS the rig can
 * test the chassis against per physics substep:
 *
 *   LessonScene:  resolveSurfaceGripPatches(district)  → SurfaceGripPatch[]
 *   VehicleRig:   surfacePatchGripAt(patches, x, y, v) → factor per substep
 *                 → VehicleSim.setSurfaceGripFactor(min(lessonBase, factor))
 *
 * Composition law: the patch factor composes with the lesson's base grip by
 * MIN — most restrictive wins (the LessonScene condition-factor discipline).
 * A wet lesson (base 0.7) over a 0.15 water patch runs 0.15 inside the span
 * and 0.7 outside; a dry lesson over an ice patch runs 1 outside, 0.15 on
 * the ice — the map data alone carries the hazard (sc-ac-ice authors NO
 * physics flag at all).
 *
 * Tolerance (the curveAdvisory discipline, A12): unknown edge ids, degenerate
 * spans, and absent/malformed patchGripFactor (or aquaplaneAboveKmh on a
 * waterPatch) drop the WHOLE span — a data slip must never fling the live
 * car. A district without the kinds resolves to [] and the rig's patch
 * branch never runs (the additive/bit-identity law — VehicleSim's setter is
 * then never called).
 *
 * Geometry: a span [fromM, toM] of arclength along the host edge's polyline
 * (the same s-measure every other zone kind uses) becomes one oriented rect
 * per overlapped polyline segment (the shipped straight micro-maps yield
 * exactly one). The rect spans the FULL carriageway width of the host edge
 * (lanes × LANE_WIDTH_M) — standing water / ice covers the whole exposed
 * roadway, both direction banks (doc 72: the flooded dip, the icy bridge).
 */

import { buildCrossingFurniture } from "../world/builders/markings";
import { MeshAccumulator } from "../world/builders/mesh";
import { analyzeNetwork } from "../world/builders/network";
import { buildRoads } from "../world/builders/roads";
import { analyzeRoundabouts, buildRoundabouts } from "../world/builders/roundabout";
import type { District } from "../world/types";
import { LANE_WIDTH_M } from "./spatial";

/** One resolved patch rect, district space (x = east, y = north). */
export interface SurfaceGripPatch {
  /** Rect centre. */
  x: number;
  y: number;
  /** District heading of the rect's LENGTH axis (0 = north, cw-positive). */
  headingDeg: number;
  halfLengthM: number;
  /** Full carriageway half-width of the host edge. */
  halfWidthM: number;
  /** Surface grip inside the rect, fraction of dry (0.05..1). */
  gripFactor: number;
  /**
   * waterPatch only: the patch bites at/above this speed (km/h) and is inert
   * below it (the tyre evacuates the water again). Absent = bites at ANY
   * speed (ice).
   */
  aquaplaneAboveKmh?: number;
}

/**
 * Structural input — deliberately narrower than either District type so both
 * the runtime's (runtime/district.ts) and the world renderer's
 * (world/types.ts) parsed documents satisfy it without cross-module casts.
 */
export interface SurfacePatchSource {
  roads: {
    edges: ReadonlyArray<{
      id: string;
      lanes: number;
      geometry: [number, number][];
    }>;
  };
  zones?: ReadonlyArray<{
    kind: string;
    edgeId: string;
    fromM: number;
    toM: number;
    patchGripFactor?: number;
    aquaplaneAboveKmh?: number;
  }>;
}

/** The setter-side clamp band (VehicleSim.setSurfaceGripFactor mirrors it). */
const PATCH_GRIP_MIN = 0.05;

/**
 * Resolve every VALID waterPatch/icePatch span of a district into rects.
 * Pure + deterministic; [] for every map without the kinds (all shipped
 * pre-slice maps — the FP battery proves it).
 */
export function resolveSurfaceGripPatches(district: SurfacePatchSource): SurfaceGripPatch[] {
  const out: SurfaceGripPatch[] = [];
  const zones = district.zones ?? [];
  if (zones.length === 0) return out;
  const edgeById = new Map(district.roads.edges.map((e) => [e.id, e]));
  for (const z of zones) {
    if (z.kind !== "waterPatch" && z.kind !== "icePatch") continue;
    // Span sanity (the worldRuntime ban-zone gate, mirrored).
    if (!(Number.isFinite(z.fromM) && Number.isFinite(z.toM) && z.fromM >= 0 && z.fromM < z.toM)) {
      continue;
    }
    // patchGripFactor REQUIRED and sane — else the whole span is inert (A12).
    const grip = z.patchGripFactor;
    if (!(typeof grip === "number" && Number.isFinite(grip) && grip > 0 && grip < 1)) continue;
    // waterPatch additionally REQUIRES its float-speed gate.
    let aquaplaneAboveKmh: number | undefined;
    if (z.kind === "waterPatch") {
      const gate = z.aquaplaneAboveKmh;
      if (!(typeof gate === "number" && Number.isFinite(gate) && gate > 0)) continue;
      aquaplaneAboveKmh = gate;
    }
    const edge = edgeById.get(z.edgeId);
    if (!edge || !Array.isArray(edge.geometry) || edge.geometry.length < 2) continue;
    const halfWidthM = (Math.max(1, edge.lanes) * LANE_WIDTH_M) / 2;
    const gripFactor = Math.min(1, Math.max(PATCH_GRIP_MIN, grip));

    // Walk the polyline, clipping [fromM, toM] against each segment's
    // arclength window — one oriented rect per overlapped segment.
    let acc = 0;
    for (let i = 1; i < edge.geometry.length; i++) {
      const [x0, y0] = edge.geometry[i - 1];
      const [x1, y1] = edge.geometry[i];
      const segLen = Math.hypot(x1 - x0, y1 - y0);
      if (segLen < 1e-6) continue;
      const s0 = acc;
      const s1 = acc + segLen;
      acc = s1;
      const from = Math.max(z.fromM, s0);
      const to = Math.min(z.toM, s1);
      if (to <= from) continue;
      const tMid = ((from + to) / 2 - s0) / segLen;
      out.push({
        x: x0 + (x1 - x0) * tMid,
        y: y0 + (y1 - y0) * tMid,
        headingDeg: ((Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI + 360) % 360,
        halfLengthM: (to - from) / 2,
        halfWidthM,
        gripFactor,
        ...(aquaplaneAboveKmh !== undefined ? { aquaplaneAboveKmh } : {}),
      });
    }
  }
  return out;
}

/**
 * The per-substep query VehicleRig runs (zero allocation): the grip factor
 * the patches impose at district position (x, y) at |speedKmh| — 1 when no
 * patch bites (outside every rect, or inside a waterPatch below its float
 * speed), else the MIN of every biting patch's factor. The caller composes
 * the result with the lesson base grip by MIN and feeds
 * VehicleSim.setSurfaceGripFactor.
 *
 * The water speed-gate is INTENTIONALLY live in both directions: a car that
 * slows below aquaplaneAboveKmh WHILE inside the span regains grip — below
 * the float speed the tread evacuates the water again (the doc-72 physics;
 * this is also why the taught duty — slow BEFORE the water — genuinely
 * works: the ~55 km/h transit never floats at all).
 */
export function surfacePatchGripAt(
  patches: readonly SurfaceGripPatch[],
  x: number,
  y: number,
  speedKmh: number,
): number {
  let grip = 1;
  const speed = Math.abs(speedKmh);
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    if (p.aquaplaneAboveKmh !== undefined && speed < p.aquaplaneAboveKmh) continue;
    const h = (p.headingDeg * Math.PI) / 180;
    const ax = Math.sin(h); // length axis (district heading convention)
    const ay = Math.cos(h);
    const dx = x - p.x;
    const dy = y - p.y;
    const along = dx * ax + dy * ay;
    if (along > p.halfLengthM || along < -p.halfLengthM) continue;
    const lateral = dx * ay - dy * ax;
    if (lateral > p.halfWidthM || lateral < -p.halfWidthM) continue;
    if (p.gripFactor < grip) grip = p.gripFactor;
  }
  return grip;
}

// ===========================================================================
// 2. THE DRIVABLE SURFACE — is the car on a road at all?
// ===========================================================================
//
// THE DEFECT THIS EXISTS FOR (sweep161, three critical frames, one cause).
//   · sc-rb-exit-signal / mobile-right / 07-end.png — the session ENDS with the
//     car parked on the roundabout's central grass island, whole windscreen
//     grass, and the debrief lists two mistakes: failure to give way, and the
//     collision. Not one word about leaving the carriageway.
//   · sc-signal-flashing / mobile-right / 04-t077s.png — a collision launches
//     the braked ego onto the pavement; at t077 it stands on the footway beside
//     a bench and a litter bin, at 07-end wedged against a building facade. The
//     only fault ever raised is «Пътнотранспортно произшествие».
//   · sc-ac-truck-spray / mobile-wrong / 04-t102s.png — 145 км/ч across open
//     green field, no road anywhere in frame, the 140 limit chip still on the
//     HUD and no off-road state at all.
//
// One cause, and it is not three missing rules: THE RULE ENGINE GRADES GEOMETRY
// AND NEVER CONSULTS THE SURFACE. Nothing in the runtime could answer "is there
// asphalt under the car" — `locator.ts` calls 30 m from every CENTRELINE
// "off-road", which is a lock-acquisition radius (a 6-lane arterial is 24 m
// wide) and not a kerb; `spatial.EdgeHit.outsideM` is the only real measure of
// it and is consumed by exactly nobody — it ranks rival edges inside
// `nearestEdge` and is thrown away. This slice is the missing consult.
//
// WHERE THE ANSWER COMES FROM. Not from re-deriving the roadway here. The world
// builder already sweeps the asphalt — ribbons at `edgeHalfWidth` (travel lanes
// + the kerbside parking band), junction pads at the approach cut corners with
// their corner arcs, both clipped out of the roundabout islands and back onto
// the ring's outer edge — and `buildWorldGeometry` hands that out as
// `roadSurface` + `junctionSurface`. So the grader reads THE ASPHALT THE
// PAINTER ACTUALLY LAID, triangle for triangle, exactly as `stoplines.ts` reads
// the painter's stop line and `spatial.ts` the painter's lane marks. There is
// no second cross-section here to drift from the first — a mitre at a bend, a
// square end at a dead end, the island bite out of a pad, the 4 m parking band
// on an arterial: all of it is already in the mesh, and none of it is restated.
//
// Re-deriving it was tried on paper first and thrown away: the union of
// centreline corridors plus junction discs puts 13.75 m of "drivable" over
// rb-mini-v1's central island (measured — its four arm↔ring pads open at
// 17.1 m against a 17.85 m ring), i.e. it would have acquitted the very frame
// that opened this slice.
//
// WHAT IS GRADED AND WHAT IS ONLY LABELLED. `under === "carriageway"` and
// `outsideKerbM` come from the ASPHALT meshes alone. `sidewalks` /
// `roundaboutIslands` are optional and only ever refine the LABEL of a point
// already established to be off the asphalt — so a wrong footway/island split
// can change the wording of a debrief and can never change a conviction.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO: convict. `surfaceAt` reports a
// measurement at a POINT; a car is a body, and the threshold is the rule
// engine's to own (see OFF_CARRIAGEWAY_BODY_ALLOWANCE_M below).
//
// MEASURED, on this box, over all 105 shipped districts:
//   · resolve  — 308 ms for all 105 (worst 67 ms, district-v1 at 21,158
//                carriageway triangles); a per-world build cost, like
//                `resolveSurfaceGripPatches`, never a per-tick one;
//   · query    — 1.3 µs on the road (one grid cell), 31 µs in open field
//                (the widening rings, and only while the car is out there);
//   · FALSE-CONVICTION SWEEP — every lane centre of every DRAWN ribbon,
//                86,907 points, reads `carriageway`. Zero exceptions. That
//                sweep is the shipped test (`drivable-surface.test.ts`); a
//                predicate that grades the road has to be proved in BOTH
//                directions or it is just a new way to fail a student.

/** Indexed triangle mesh, world space — structurally `world/types.MeshData`,
 *  narrowed so a MeshAccumulator view (plain arrays) satisfies it too. */
export interface SurfaceMesh {
  /** Flat [x, height, z] triples; district y = −z (builders/mesh.toWorld). */
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

/** The builder meshes the surface is read off. Only the two asphalt ones
 *  decide anything; see "WHAT IS GRADED AND WHAT IS ONLY LABELLED" above. */
export interface DrivableSurfaceMeshes {
  /** `WorldGeometry.roadSurface` — the swept edge ribbons. */
  roadSurface: SurfaceMesh;
  /** `WorldGeometry.junctionSurface` — the fan patch at every node. */
  junctionSurface: SurfaceMesh;
  /** `WorldGeometry.sidewalks` — raised pavement, kerb faces, corner aprons,
   *  the roundabout island's own wall. LABEL only. */
  sidewalks?: SurfaceMesh;
  /** `WorldGeometry.roundaboutIslands` — the planted crowns. LABEL only. */
  roundaboutIslands?: SurfaceMesh;
}

/** What the point stands on. Only `"carriageway"` is a road. */
export type SurfaceUnderCar = "carriageway" | "footway" | "island" | "verge";

/** Caller-owned result slot (the `spatial.EdgeHit` discipline — `surfaceAt`
 *  runs per tick and allocates nothing). */
export interface SurfaceFix {
  under: SurfaceUnderCar;
  /**
   * Metres from the point to the nearest drawn asphalt; 0 on the carriageway.
   * Saturates at SURFACE_PROBE_CAP_M — the search stops there because every
   * consumer's threshold is metres, not tens of metres, and an open field does
   * not get more wrong the further you drive into it.
   */
  outsideKerbM: number;
}

/**
 * Grid cell of the triangle index, m. Measured on district-v1 (the densest
 * shipped map, 21,158 asphalt triangles + 12,200 label ones): 14,934 cells
 * over all 105 districts, and the BUSIEST single cell holds 896 triangles —
 * a junction of two arterials, where the whole point of the query is that a
 * car there is on the road and the very first triangle tested says so.
 */
const SURFACE_CELL_M = 16;

/**
 * How far `surfaceAt` will look for asphalt before reporting the cap, m —
 * three rings of SURFACE_CELL_M. The widest shipped roadway is 56.75 m kerb to
 * kerb (district-v1's 6-lane secondary), so a car a whole roadway clear of the
 * road saturates rather than reporting further; that is deliberate, because
 * every consumer's threshold is about a metre and nothing is learned from
 * knowing a field is 200 m wide.
 */
export const SURFACE_PROBE_CAP_M = 48;

/**
 * A point this close to the asphalt IS on the asphalt, m.
 *
 * Not slack — arithmetic, and the number is measured twice because the two
 * resolve paths quantise differently:
 *
 *  · float64 (`resolveDistrictDrivableSurface`, the builder's own views):
 *    a car on the ribbon's END cross-section sits exactly on the boundary the
 *    junction pad's approach cut shares with it, and the two sides reach that
 *    boundary by different expressions. Sweeping every lane centre of every
 *    DRAWN ribbon on all 105 shipped districts — 86,907 points — raw
 *    containment put 102 of them outside their own asphalt, by ≤ 5.7e-14 m.
 *
 *  · float32 (`resolveDrivableSurface` over `WorldGeometry`, which is what
 *    LessonScene actually runs): `MeshData.positions` is a Float32Array, so a
 *    vertex 800 m out is quantised — 82 of district-v1's 15,127 lane centres
 *    then land up to 2.72e-5 m outside, and the coarsest ulp in the shipped
 *    set (mw-v1 reaches y = 2606 m) is 1.31e-4 m.
 *
 * A millimetre clears the worst of that by 7.6× and sits ~970× below the body
 * allowance below, so it can promote a point on the kerb line and nothing else.
 * A micron was tried first and DOES convict on the production path.
 */
const SURFACE_EDGE_EPS_M = 1e-3;

/**
 * The allowance a CONVICTION owes the car's own body, m — the player's
 * chassis half-width (`collision/bodies.PLAYER_HALF_WIDTH_M` = 0.85 m, the
 * rapier collider's own x extent) plus the 0.12 m kerb, which this engine
 * makes deliberately drivable so a scuff is a thump and not a crash.
 *
 * NOT applied here, and not imported here: this file measures, the rule engine
 * decides. Stated so the decision is made against the geometry rather than
 * dialled in — a centre this far past the kerb has a whole flank off the road,
 * and anything less convicts a car that is still on it.
 */
export const OFF_CARRIAGEWAY_BODY_ALLOWANCE_M = 0.85 + 0.12;

/** A fresh result slot, reading "nowhere near a road" until a query fills it —
 *  so a caller that forgets to query cannot read a free pass out of it. */
export function makeSurfaceFix(): SurfaceFix {
  return { under: "verge", outsideKerbM: SURFACE_PROBE_CAP_M };
}

const LAYER_CARRIAGEWAY = 0;
const LAYER_ISLAND = 1;
const LAYER_FOOTWAY = 2;

/** Resolved surface index. Opaque: build with `resolveDrivableSurface`, read
 *  with `surfaceAt`. */
export interface DrivableSurface {
  /** Triangles indexed, by layer — the census a test can assert on. */
  readonly counts: { carriageway: number; island: number; footway: number };
  /** [ax, ay, bx, by, cx, cy] per triangle, district space. */
  readonly xy: Float64Array;
  readonly layer: Uint8Array;
  /** Cell key → triangle indices whose AABB touches that cell. */
  readonly cells: ReadonlyMap<number, Int32Array>;
}

/** Cell key. ±32,767 cells ≈ ±524 km — a district is ±1 km. */
function cellKey(cx: number, cy: number): number {
  return (cx + 32768) * 65536 + (cy + 32768);
}

/**
 * Index the builder's asphalt (and, if given, its pavement and islands) for
 * point queries. Pure; call once per world build, alongside
 * `resolveSurfaceGripPatches`.
 *
 * Degenerate triangles are dropped: the sidewalk mesh's kerb FACES are
 * vertical, so they project to zero-area slivers and would only ever be found
 * by the distance pass at a distance the road itself already answers.
 */
export function resolveDrivableSurface(meshes: DrivableSurfaceMeshes): DrivableSurface {
  const xs: number[] = [];
  const layers: number[] = [];
  const counts = { carriageway: 0, island: 0, footway: 0 };

  const take = (mesh: SurfaceMesh | undefined, layer: number): void => {
    if (!mesh) return;
    const p = mesh.positions;
    const idx = mesh.indices;
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i] * 3;
      const b = idx[i + 1] * 3;
      const c = idx[i + 2] * 3;
      // world (x, height, z) → district (x, y): y = −z (builders/mesh.toWorld).
      const ax = p[a];
      const ay = -p[a + 2];
      const bx = p[b];
      const by = -p[b + 2];
      const cx = p[c];
      const cy = -p[c + 2];
      if (Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) < 1e-9) continue;
      xs.push(ax, ay, bx, by, cx, cy);
      layers.push(layer);
      if (layer === LAYER_CARRIAGEWAY) counts.carriageway++;
      else if (layer === LAYER_ISLAND) counts.island++;
      else counts.footway++;
    }
  };
  take(meshes.roadSurface, LAYER_CARRIAGEWAY);
  take(meshes.junctionSurface, LAYER_CARRIAGEWAY);
  take(meshes.roundaboutIslands, LAYER_ISLAND);
  take(meshes.sidewalks, LAYER_FOOTWAY);

  const xy = Float64Array.from(xs);
  const layer = Uint8Array.from(layers);
  const buckets = new Map<number, number[]>();
  for (let t = 0; t < layer.length; t++) {
    const o = t * 6;
    const minX = Math.min(xy[o], xy[o + 2], xy[o + 4]);
    const maxX = Math.max(xy[o], xy[o + 2], xy[o + 4]);
    const minY = Math.min(xy[o + 1], xy[o + 3], xy[o + 5]);
    const maxY = Math.max(xy[o + 1], xy[o + 3], xy[o + 5]);
    for (let cx = Math.floor(minX / SURFACE_CELL_M); cx <= Math.floor(maxX / SURFACE_CELL_M); cx++) {
      for (
        let cy = Math.floor(minY / SURFACE_CELL_M);
        cy <= Math.floor(maxY / SURFACE_CELL_M);
        cy++
      ) {
        const k = cellKey(cx, cy);
        let bucket = buckets.get(k);
        if (!bucket) buckets.set(k, (bucket = []));
        bucket.push(t);
      }
    }
  }
  const cells = new Map<number, Int32Array>();
  for (const [k, list] of buckets) cells.set(k, Int32Array.from(list));
  return { counts, xy, layer, cells };
}

/**
 * The same index from a district document alone — for the HEADLESS graders
 * (trace recorder, the bot-completion suites) that never build a world.
 *
 * It is not a second derivation: it runs `buildWorldGeometry`'s own calls, in
 * its own order (network → rings → roads, then the two passes that write kerbed
 * furniture into the very sidewalk accumulator roads returned — the roundabout
 * island wall and the pedestrian refuge island), and indexes what they produce.
 * Same painter, same asphalt. The census-agreement case in
 * drivable-surface.test.ts walks all 105 shipped districts, so a new upstream
 * writer that this list does not mirror goes red rather than drifting.
 *
 * Takes the BUILDER's district type — `assertDistrict(raw)` — because that is
 * what the builder reads; the raw document every headless path already holds
 * satisfies it. Cache the result: it costs a road build, not a query.
 *
 * The price is that `runtime/index` now pulls `builders/roads` +
 * `builders/roundabout` + `builders/markings` (for the refuge-island pass —
 * all three are plain TS, no three/rapier) into anything that imports the
 * runtime barrel. Free on the sim route (LessonScene already builds the world
 * through all of them) and a couple of pure-TS modules everywhere else; if that
 * is ever measured to matter, this ONE function moves to its own module and
 * `resolveDrivableSurface` — which imports nothing — stays here.
 */
export function resolveDistrictDrivableSurface(district: District): DrivableSurface {
  const network = analyzeNetwork(district);
  const rings = analyzeRoundabouts(district, network);
  // `district` third, exactly as `buildWorldGeometry` calls it: it is what
  // tells `buildRoads` that a `scenario-lot` map's `service` aisle is a car
  // park's roadway and carries a kerb. Dropping it here would leave the
  // headless index 32 sidewalk vertices short of the one LessonScene runs on,
  // on all 14 lot maps — the same drift the paragraph above records for the
  // refuge island, and the same census that catches it.
  const roads = buildRoads(network, rings, district);
  // buildWorldGeometry's TWO sidewalk writers, in ITS order. Both raise kerbed
  // furniture into the very accumulator `buildRoads` just returned, and paint
  // into a markings accumulator nothing here reads:
  //   · buildRoundabouts — the central island's kerb + rim;
  //   · buildCrossingFurniture — the kerbed pedestrian refuge island / median
  //     nose (doc 87 B50/B53/B54), which three shipped districts author
  //     (pe-bus-v1, pe-cane-v1, pe-slow-v1) and which this path used to MISS.
  // Missing it left the headless index 16 sidewalk triangles short of the one
  // LessonScene runs on exactly those maps — label-only by the layer rules
  // below, but a drift between the grader the student meets and the grader the
  // traces are recorded against, and the next sidewalk writer added upstream
  // would drift the same way. `resolve paths` in drivable-surface.test.ts now
  // compares the census on ALL 105 districts rather than three of them.
  const paint = new MeshAccumulator();
  const roundabouts = buildRoundabouts(rings, {
    sidewalks: roads.sidewalks,
    markings: paint,
  });
  buildCrossingFurniture(district, network, { sidewalks: roads.sidewalks, markings: paint });
  const view = (acc: MeshAccumulator): SurfaceMesh => ({
    positions: acc.positionsView,
    indices: acc.indicesView,
  });
  return resolveDrivableSurface({
    roadSurface: view(roads.surface),
    junctionSurface: view(roads.junctions),
    sidewalks: view(roads.sidewalks),
    roundaboutIslands: view(roundabouts.islandPlanting),
  });
}

/** Is (px, py) inside triangle `t`? Winding-agnostic (the builder emits CCW
 *  seen from above, but a mirrored strip must not become a hole). */
function triContains(s: DrivableSurface, t: number, px: number, py: number): boolean {
  const o = t * 6;
  const ax = s.xy[o];
  const ay = s.xy[o + 1];
  const bx = s.xy[o + 2];
  const by = s.xy[o + 3];
  const cx = s.xy[o + 4];
  const cy = s.xy[o + 5];
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Distance from (px, py) to segment (ax, ay)-(bx, by). */
function segDist(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** Distance from (px, py) to triangle `t` — 0 inside, else to its nearest edge. */
function triDist(s: DrivableSurface, t: number, px: number, py: number): number {
  if (triContains(s, t, px, py)) return 0;
  const o = t * 6;
  return Math.min(
    segDist(s.xy[o], s.xy[o + 1], s.xy[o + 2], s.xy[o + 3], px, py),
    segDist(s.xy[o + 2], s.xy[o + 3], s.xy[o + 4], s.xy[o + 5], px, py),
    segDist(s.xy[o + 4], s.xy[o + 5], s.xy[o], s.xy[o + 1], px, py),
  );
}

/**
 * What is under district point (x, y), written into `out` (zero allocation).
 *
 * Containment is answered from the point's OWN cell alone and that is exact:
 * a triangle containing the point has an AABB containing it, so it was
 * bucketed into that cell. Only when the point is off the asphalt does the
 * distance pass widen, ring by ring, and it stops the moment the best distance
 * found is already inside the scanned radius — so a car on the road pays for
 * one cell, and a car in a field pays once per tick for a handful.
 *
 * A car is a BODY: the caller that grades should probe the chassis corners (or
 * the centre against OFF_CARRIAGEWAY_BODY_ALLOWANCE_M), never this point alone.
 */
export function surfaceAt(
  surface: DrivableSurface,
  x: number,
  y: number,
  out: SurfaceFix,
): SurfaceFix {
  const cx = Math.floor(x / SURFACE_CELL_M);
  const cy = Math.floor(y / SURFACE_CELL_M);
  const home = surface.cells.get(cellKey(cx, cy));
  let under: SurfaceUnderCar = "verge";
  if (home) {
    for (let i = 0; i < home.length; i++) {
      const t = home[i];
      const l = surface.layer[t];
      // Asphalt wins outright; between the two label layers the island wins,
      // because its wall is drawn into the SIDEWALK mesh and both would hit.
      if (l === LAYER_FOOTWAY && under !== "verge") continue;
      if (l === LAYER_ISLAND && under === "island") continue;
      if (!triContains(surface, t, x, y)) continue;
      if (l === LAYER_CARRIAGEWAY) {
        out.under = "carriageway";
        out.outsideKerbM = 0;
        return out;
      }
      under = l === LAYER_ISLAND ? "island" : "footway";
    }
  }
  out.under = under;

  let best = SURFACE_PROBE_CAP_M;
  const maxRing = Math.ceil(SURFACE_PROBE_CAP_M / SURFACE_CELL_M);
  for (let r = 0; r <= maxRing; r++) {
    for (let gx = cx - r; gx <= cx + r; gx++) {
      for (let gy = cy - r; gy <= cy + r; gy++) {
        // Ring r only: the inner block was scanned at r − 1.
        if (r > 0 && gx > cx - r && gx < cx + r && gy > cy - r && gy < cy + r) continue;
        const bucket = surface.cells.get(cellKey(gx, gy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const t = bucket[i];
          if (surface.layer[t] !== LAYER_CARRIAGEWAY) continue;
          const d = triDist(surface, t, x, y);
          if (d < best) best = d;
        }
      }
    }
    // Nothing in ring r+1 can beat a hit already inside the scanned radius.
    if (best <= r * SURFACE_CELL_M) break;
  }
  // The boundary belongs to the road (SURFACE_EDGE_EPS_M): containment alone
  // drops the ribbon's own end station on the wrong side by ~1e-14 m, and a
  // student driving there is driving on the road.
  if (best <= SURFACE_EDGE_EPS_M) {
    out.under = "carriageway";
    out.outsideKerbM = 0;
    return out;
  }
  out.outsideKerbM = best;
  return out;
}
