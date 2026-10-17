/**
 * Pedestrian agents — sidewalk out-and-back loops anchored on a crossing.
 *
 * Each pedestrian owns a precomputed loop of segments:
 *   walk sidewalk A -> [wait, cross] -> walk sidewalk B out -> walk B back ->
 *   [wait, cross back] -> walk A back -> repeat
 * Before every "cross" segment the agent waits 1-2 s at the curb, then polls
 * a gate each frame:
 *   - signalized crossing: go when the VEHICLE phase for the mapped signal
 *     node is "red" (that is the pedestrian green),
 *   - unsignalized: go when no traffic vehicle is within the safe time gap on
 *     the crossing's lanes AND the player is not bearing down on it (a
 *     player STOPPED near the crossing does not block — that is the yield
 *     teaching moment).
 *
 * While a pedestrian is on the roadway span of a crossing the system's
 * crossingCounts map is incremented — that feeds TrafficSystem.pedestrianOnCrossing
 * (and through the runtime's setPedestrianQuery hook, the rule engine).
 */

import type { SignalPhase } from "../contracts";
import { isMotorwayCarriageway, sidewalkEndInsetM } from "../world/builders/constants";
import { edgeParkingWidthM, JUNCTION_TRIM_MAX_FRACTION, nodeOpenRadiusM } from "../world/builders/network";
import { offsetPolyline, projectOntoPolyline, sampleLane, type LaneGraph } from "./graph";
import { rngRange, type Rng } from "./rng";
import type { VehicleAgent } from "./vehicles";
import type { DistrictCrossing, DistrictEdge, TrafficConfig, TrafficPedestrianState } from "./types";

export interface PedSegment {
  kind: "walk" | "cross";
  crossingId: string | null;
  px: Float64Array;
  py: Float64Array;
  cum: Float64Array;
  length: number;
  /** Roadway span of a cross segment (arc range that counts as on-crossing). */
  roadFrom: number;
  roadTo: number;
  /** Crossing center — used by the unsignalized player-gap check. */
  crossX: number;
  crossY: number;
}

export interface PedRoute {
  segments: PedSegment[];
}

export type PedMode = "walking" | "waiting";

export interface PedestrianAgent {
  state: TrafficPedestrianState;
  route: PedRoute;
  segIdx: number;
  s: number;
  segHint: number;
  mode: PedMode;
  waitLeft: number;
  /** Per-agent rng stream (wait-time jitter) — keeps determinism local. */
  rng: Rng;
  baseSpeed: number;
  /** Whether this agent currently counts toward its crossing's occupancy. */
  onRoad: boolean;
}

export interface PedestrianEnv {
  cfg: TrafficConfig;
  graph: LaneGraph;
  vehicles: VehicleAgent[];
  crossingCounts: Map<string, number>;
  signalPhase: (id: string) => SignalPhase;
  hasPlayer: boolean;
  playerX: number;
  playerY: number;
  playerSpeedKmh: number;
}

// ---------------------------------------------------------------------------
// Where a pedestrian walks, laterally — founder item B14/B46/B49, the CAUSE.
//
// HIS SENTENCE, three lessons running: „the Pedestrian at the end when he
// leaves the Zebra, he goes trough a car", „he passes like a ghost trough some
// car", „ghost crossing trough stopped car".
//
// It was never a rendering or a collision bug. It is two constants that were
// written years apart and have overlapped by construction ever since:
//
//   • this file put the sidewalk at `travelHalf + 0.4 + 1.2 = travelHalf + 1.6`,
//     a number from before the 4 m curbside parking band and before the
//     procedural parked row existed;
//   • `TrafficLayer` seats every parked body at `travelHalf + PARK_BAND_CENTER_M`
//     (2.0) with a half-width of 0.95, i.e. spanning
//     `travelHalf + 1.05 … travelHalf + 2.95`.
//
// travelHalf + 1.6 is 0.55 m INSIDE the near flank of every parked car in the
// district. Not sometimes — always, on every street the pass parks. Measured
// over the 100 committed districts before this change: **19 of 121 pedestrian
// walk loops on 11 districts pass through a parked body, up to 1.25 m deep**
// (zb-v1 — the lesson he was looking at — 2 of 2; rb-ped-v1 3 of 3;
// pe-school-v1, pe-zone-v1, ov-crossing-v1, pk-banx-v1, rx-tram-stop-v1,
// rx-tram-island-v1 all 1 of 1).
//
// The SECOND half of the same mistake, and the one FR-21's fix created: the
// offset was measured from the TRAVEL lanes, not from the kerb. Where a street
// declares `parkingBand` the world moves its kerb out 4 m — and the walk did
// not move with it, so the pedestrian was left walking down the middle of the
// parking lane, on the carriageway. Measured: **50 crossing-edges on 5
// districts had their walk line inside the kerb.**
//
// So the offset is now derived from the same geometry the world draws the kerb
// with and the parking pass seats bodies in:
//
//   • no procedural row on the footway (a declared band puts the row inside
//     the carriageway, or the street parks nobody) — walk `PED_STAND_BACK_M`
//     past the KERB, mid-pavement, exactly as before but from the right datum;
//   • row standing ON the footway (the FR-21 budget: a class the pass parks but
//     the world draws no band for) — walk `PED_KERB_WALK_M` past the kerb, i.e.
//     BETWEEN the kerb and the cars. It is tight, because a 1.9 m car parked in
//     the middle of a 3.5 m pavement genuinely leaves 1.05 m at the kerb and
//     0.55 m at the wall. Kerbside and not wallside on purpose: a walker behind
//     the row is hidden from the driver, and the whole lesson is about seeing
//     her.
// ---------------------------------------------------------------------------

/** Walker half-width (shoulders), m — what must clear a parked body's flank. */
export const PED_SHOULDER_HALF_M = 0.25;
/** Stand-back from the kerb on a clear pavement, m (the historic 1.6 measured
 *  from the travel lanes, now measured from the kerb). */
export const PED_STAND_BACK_M = 1.6;
/** Stand-back where the procedural parked row stands on the footway, m.
 *  Bounded on both sides and there is no slack in it:
 *    ≥ SIDEWALK_SKIRT_M 0.35 + shoulders 0.25 = 0.60 (fully off the kerb face)
 *    ≤ (PARK_BAND_CENTER_M 2.0 − PARKED_HALF_W_M 0.95) − 0.25 = 0.80 (clear of
 *      the nearest body's flank). */
export const PED_KERB_WALK_M = 0.7;
/** Lead-in each side of the carriageway that still counts as "on the crossing"
 *  for `crossingCounts` / the rule engine — a pedestrian who has stepped off
 *  the kerb is already «стъпил на пътеката» (ЗДвП чл. 119).
 *
 *  1.1 m is not a new number: it is what today's geometry implied (a 1.6 m
 *  stand-back with a 0.5 m margin), reproduced exactly so that moving the WALK
 *  LINE can never shrink a graded window. Where the walk is pulled in to the
 *  kerb the margin clamps at 0 and the window only grows. */
const CROSSING_LEAD_IN_M = 1.1;

/**
 * Lateral offset of the sidewalk this edge's walkers use, measured from the
 * road centre line. `laneWidthM` is the runtime's lane width (the world's
 * LANE_WIDTH_M); the parking band comes from the same `edgeParkingWidthM` the
 * kerb, the ribbon, the colliders and the FR-21 footway ledger all use, so the
 * walk and the kerb can never disagree again.
 */
export function pedSidewalkOffsetM(edge: DistrictEdge, laneWidthM: number): number {
  const travelHalf = (Math.max(1, edge.lanes) * laneWidthM) / 2;
  const bandM = edgeParkingWidthM(edge);
  const kerb = travelHalf + bandM;
  // A row on the FOOTWAY is exactly the case `parked-on-footway.test.ts`
  // budgets: the pass parks this class, and the world draws it no band. An
  // explicit `parkingBand: false` says the street parks nobody at all.
  const rowOnFootway = bandM === 0 && (edge as { parkingBand?: unknown }).parkingBand !== false;
  return kerb + (rowOnFootway ? PED_KERB_WALK_M : PED_STAND_BACK_M);
}

/** Carriageway half width (kerb line) — the span a crossing walk grades over. */
export function pedCarriagewayHalfM(edge: DistrictEdge, laneWidthM: number): number {
  return (Math.max(1, edge.lanes) * laneWidthM) / 2 + edgeParkingWidthM(edge);
}

const samp = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };

// ---------------------------------------------------------------------------
// Route construction
// ---------------------------------------------------------------------------

function makeSegment(
  kind: "walk" | "cross",
  crossingId: string | null,
  pts: number[][],
  roadFrom: number,
  roadTo: number,
  crossX: number,
  crossY: number,
): PedSegment {
  const off = offsetPolyline(pts, 0);
  return {
    kind,
    crossingId,
    px: off.px,
    py: off.py,
    cum: off.cum,
    length: off.length,
    roadFrom,
    roadTo,
    crossX,
    crossY,
  };
}

/** Slice of a polyline between arc lengths s0 < s1 (as point list). */
function subPolyline(
  px: Float64Array,
  py: Float64Array,
  cum: Float64Array,
  s0: number,
  s1: number,
): number[][] {
  const pts: number[][] = [];
  const evalAt = (s: number): [number, number] => {
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const segLen = cum[i + 1] - cum[i];
    const t = segLen > 0 ? (s - cum[i]) / segLen : 0;
    return [px[i] + (px[i + 1] - px[i]) * t, py[i] + (py[i + 1] - py[i]) * t];
  };
  pts.push(evalAt(s0));
  for (let i = 0; i < cum.length; i++) {
    if (cum[i] > s0 + 0.05 && cum[i] < s1 - 0.05) pts.push([px[i], py[i]]);
  }
  pts.push(evalAt(s1));
  return pts;
}

/**
 * Build a pedestrian loop anchored on `crossing`. Returns null when the
 * crossing's edge is degenerate (too short to host a walk).
 */
export function buildPedRoute(
  crossing: DistrictCrossing,
  edge: DistrictEdge,
  laneWidthM: number,
  rng: Rng,
): PedRoute | null {
  if (edge.geometry.length < 2) return null;
  const center = offsetPolyline(edge.geometry, 0);
  if (center.length < 10) return null;

  const proj = projectOntoPolyline(center.px, center.py, center.cum, crossing.x, crossing.y);
  const sC = Math.min(Math.max(proj.s, 1), center.length - 1);

  // B14 — kerb line and walking line from the same geometry the world uses.
  const halfRoad = pedCarriagewayHalfM(edge, laneWidthM);
  const sideOff = pedSidewalkOffsetM(edge, laneWidthM);
  const back = Math.min(rngRange(rng, 25, 60), sC);
  const fwd = Math.min(rngRange(rng, 25, 60), center.length - sC);

  // Sidewalk sub-polylines around the crossing, offset each side of the road.
  const approachPts = subPolyline(center.px, center.py, center.cum, sC - back, sC);
  const awayPts = subPolyline(center.px, center.py, center.cum, sC, sC + fwd);
  const sideA = offsetPolyline(approachPts, sideOff); // right of edge direction
  const sideB = offsetPolyline(awayPts, -sideOff); // left of edge direction

  const toPts = (o: { px: Float64Array; py: Float64Array }, reverse: boolean): number[][] => {
    const pts: number[][] = [];
    for (let i = 0; i < o.px.length; i++) pts.push([o.px[i], o.py[i]]);
    if (reverse) pts.reverse();
    return pts;
  };

  const aEnd: number[] = [sideA.px[sideA.px.length - 1], sideA.py[sideA.py.length - 1]];
  const bStart: number[] = [sideB.px[0], sideB.py[0]];
  const crossLen = Math.hypot(bStart[0] - aEnd[0], bStart[1] - aEnd[1]);
  if (crossLen < 2) return null;
  // Roadway span within the cross segment: the carriageway itself, opened by
  // CROSSING_LEAD_IN_M each side so a walker who has stepped off the kerb
  // already counts as on the crossing.
  const margin = Math.max(0, (crossLen - 2 * halfRoad) / 2 - CROSSING_LEAD_IN_M);
  const roadFrom = margin;
  const roadTo = crossLen - margin;

  const segments: PedSegment[] = [
    makeSegment("walk", null, toPts(sideA, false), 0, 0, 0, 0),
    makeSegment("cross", crossing.id, [aEnd, bStart], roadFrom, roadTo, crossing.x, crossing.y),
    makeSegment("walk", null, toPts(sideB, false), 0, 0, 0, 0),
    makeSegment("walk", null, toPts(sideB, true), 0, 0, 0, 0),
    makeSegment("cross", crossing.id, [bStart, aEnd], roadFrom, roadTo, crossing.x, crossing.y),
    makeSegment("walk", null, toPts(sideA, true), 0, 0, 0, 0),
  ];
  for (const seg of segments) if (!(seg.length > 0.2)) return null;
  return { segments };
}

// ---------------------------------------------------------------------------
// SIDEWALK-ONLY WALKERS — the empty-pavement class, and why a crossing could
// never have populated these streets.
//
// FOUR MAJOR ROWS, ONE SENTENCE, w11: sc-sp-limit-end „a city street lined
// with parked cars on the right kerb and railings on the left, and not one
// pedestrian on either pavement in 207 s of frames on either platform";
// sc-vu-emergency „a four-lane city boulevard with tower blocks both sides …
// and not a single pedestrian on either pavement in any frame of either drive
// on either platform"; sc-sp-eco-coast the same of a signalled boulevard;
// sc-vu-cyclist-hook the same of a junction in a lesson built ENTIRELY around
// vulnerable road users — „the only human the world contains is the single
// scripted cyclist".
//
// THE OBVIOUS FIX IS A NO-OP, AND THAT IS THE FINDING UNDER THE FINDING.
// `SCENARIO_DEFAULT_TRAFFIC.pedestrianCount` is 0 (lessons/scenario/compile.ts),
// so the first move anyone makes is to raise it. Measured over the 105
// committed districts in `platform/public/world`: **84 of them declare ZERO
// crossings.** Every pedestrian this file has ever built is anchored on a
// `DistrictCrossing` (`buildPedRoute` takes one and returns null without it),
// so on `sp-signs-v1`, `sx-v1`, `ln-v1` and `vu-cyclist-v1` — the four maps
// those four rows were photographed on, 0 crossings between them — raising the
// count would have spawned NOBODY and the ledger would have banked a repair
// that changes not one pixel. That is the dead-predicate class this audit
// keeps measuring, and it would have been earned here by reading a constant
// instead of the data under it.
//
// SO THE WALK IS ANCHORED ON THE EDGE, and it deliberately has no `cross`
// segment. That is not a simplification, it is the whole safety argument:
//
//   · `crossingCounts` is incremented ONLY from `setOnRoad`, which is called
//     ONLY for a segment of kind "cross". A route made of walk segments can
//     never touch it, so `TrafficSystem.pedestrianOnCrossing` — and through
//     `runtime.setPedestrianQuery`, the rule engine's crossing duties — cannot
//     see these agents at all. compile.ts's own reason for keeping ambient
//     pedestrians at zero is „ambient pedestrians on a junction drill would arm
//     crossing duties the copy never mentions", and that reason survives this
//     change intact: nothing here arms anything.
//   · The lateral line is `pedSidewalkOffsetM`, unchanged and shared — the
//     same B14/FR-21 geometry the crossing walkers use, so a pavement walker
//     cannot end up inside a parked body or out on the carriageway by a route
//     the audited one already proved safe.
//   · The only other live reader of `traffic.pedestrians` is
//     `components/sim/NpcColliders`, whose near-miss tracker opens a window at
//     0.75 m of body clearance and is documented there as a NON-GRADED stat. A
//     walker stands `PED_STAND_BACK_M` past the kerb, i.e. metres outside the
//     travel lane, so it cannot open one from the carriageway — and if the
//     student mounts the pavement, a near-miss with a person there is the
//     honest reading.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WHERE THE PAVEMENT ENDS — sc-sig-controller-postures:4f446777.
//
// The block above promised «no carriageway span anywhere», and the route was
// built from s = 0: the edge's centre line offset sideways FROM THE NODE. At a
// junction the node is the middle of the crossing road, so the beat ran off
// the kerb and across the other street's carriageway to its centre line and
// back. Measured at base on sx-v1 (the регулировчик drill, live scene
// config): walker 2 of sx-e-e stood on the N-S carriageway from t 97.7 to
// 118.6, out to x = 0.03 beside the officer, through the northbound lane the
// student was told to drive; walker 5 did the same on the west arm. Over the
// catalogue's 158 distinct live traffic configs, 74 put a pavement walker on
// a carriageway at base (traffic/__tests__/pavement-walker-junction.test.ts).
// Where the world draws no pavement edge to edge — a divided road whose far
// side is the other carriageway — the beat is also CHECKED clear of every
// carriageway and cut to the clear stretch it stands on (clearStretch).
//
// THE NUMBER IS THE WORLD'S. The pavement a walker is drawn on is the strip
// `world/builders/roads.ts` lays along the JUNCTION-TRIMMED centre line
// (`analyzeNetwork`: the node's open radius `nodeOpenRadiusM` over every edge
// touching it, clamped at JUNCTION_TRIM_MAX_FRACTION of the edge), pulled in
// by `sidewalkEndInsetM` so the corner stays open. A walker's beat now stops
// exactly there — where the kerb the student sees turns the corner — so it
// cannot step off a drawn pavement into the junction. Only at JUNCTIONS
// (three or more edges meet): a way-split joint or a dead end has no other
// carriageway for the pavement to cross, and the beat keeps its old end.
// ---------------------------------------------------------------------------

/** roads.ts draws no pavement strip on a trimmed line this short or shorter. */
const PAVEMENT_MIN_LINE_M = 6;

/** The arc span `[fromS, toS]` of `edge` along which its pavement is drawn
 *  at its junction ends (see the block above); `{0, totalM}` at an edge with
 *  no junction end; null when the world draws no pavement between its two
 *  junctions at all (the trimmed line is no longer than 6 m — roads.ts). */
export interface PedPavementSpan {
  fromS: number;
  toS: number;
}

/** Edges touching each node — the world's `touching` map (analyzeNetwork). */
export function pedEdgesAtNode(edges: readonly DistrictEdge[]): Map<string, DistrictEdge[]> {
  const out = new Map<string, DistrictEdge[]>();
  for (const e of edges) {
    for (const id of [e.from, e.to]) {
      let bucket = out.get(id);
      if (!bucket) out.set(id, (bucket = []));
      bucket.push(e);
    }
  }
  return out;
}

/**
 * What a walker's route is checked against, built ONCE per district by the
 * traffic system: the node → edges map the junction cut is computed from, and
 * every edge's carriageway (its kerb half width `pedCarriagewayHalfM`, the
 * same number the crossing span is graded over) with the junction boxes their
 * ends meet in — so «no carriageway span anywhere» is checked, not asserted.
 */
export interface PedPavementWorld {
  edgesAtNode: ReadonlyMap<string, readonly DistrictEdge[]>;
  bands: ReadonlyArray<{
    edgeId: string;
    geometry: readonly (readonly number[])[];
    half: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>;
  /** Junction boxes: a node three or more edges meet at, the widest kerb half. */
  boxes: ReadonlyArray<{ x: number; y: number; r: number }>;
}

export function pedPavementWorld(edges: readonly DistrictEdge[], laneWidthM: number): PedPavementWorld {
  const edgesAtNode = pedEdgesAtNode(edges);
  const bands: Array<PedPavementWorld["bands"][number]> = [];
  const halfById = new Map<string, number>();
  const nodeAt = new Map<string, readonly number[]>();
  for (const e of edges) {
    if (e.geometry.length < 2) continue;
    const half = pedCarriagewayHalfM(e, laneWidthM);
    halfById.set(e.id, half);
    nodeAt.set(e.from, e.geometry[0]);
    nodeAt.set(e.to, e.geometry[e.geometry.length - 1]);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of e.geometry) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    bands.push({
      edgeId: e.id,
      geometry: e.geometry,
      half,
      minX: minX - half,
      minY: minY - half,
      maxX: maxX + half,
      maxY: maxY + half,
    });
  }
  const boxes: Array<{ x: number; y: number; r: number }> = [];
  for (const [id, touched] of edgesAtNode) {
    const at = nodeAt.get(id);
    if (touched.length < 3 || at === undefined) continue;
    let r = 0;
    for (const e of touched) r = Math.max(r, halfById.get(e.id) ?? 0);
    boxes.push({ x: at[0], y: at[1], r });
  }
  return { edgesAtNode, bands, boxes };
}

/**
 * Is (x, y) on a carriageway other than `ownEdgeId`'s — inside another edge's
 * kerb band between its own end cross-sections, or inside a junction box?
 * (A joint's end disc is not carriageway: the next edge's band carries it.)
 */
export function pedOnOtherCarriageway(
  world: PedPavementWorld,
  ownEdgeId: string,
  x: number,
  y: number,
): boolean {
  for (const b of world.boxes) {
    const dx = b.x - x;
    const dy = b.y - y;
    if (dx * dx + dy * dy < b.r * b.r) return true;
  }
  for (const band of world.bands) {
    if (band.edgeId === ownEdgeId) continue;
    if (x < band.minX || x > band.maxX || y < band.minY || y > band.maxY) continue;
    const g = band.geometry;
    const last = g.length - 2;
    for (let i = 0; i <= last; i++) {
      const ax = g[i][0];
      const ay = g[i][1];
      const dx = g[i + 1][0] - ax;
      const dy = g[i + 1][1] - ay;
      const l2 = dx * dx + dy * dy;
      if (!(l2 > 0)) continue;
      let t = ((x - ax) * dx + (y - ay) * dy) / l2;
      if ((i === 0 && t <= 0) || (i === last && t >= 1)) continue;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x;
      const ey = ay + dy * t - y;
      if (ex * ex + ey * ey < band.half * band.half) return true;
    }
  }
  return false;
}

/** Spacing of the clearance check along a walk line, m. */
const PED_CLEARANCE_STEP_M = 0.5;

/** Pavement trim of the world's junction cut at both ends of `edge` (`totalM`
 *  = its centre-line length). */
export function pedPavementSpan(
  edge: DistrictEdge,
  totalM: number,
  edgesAtNode: ReadonlyMap<string, readonly DistrictEdge[]>,
): PedPavementSpan | null {
  const touchedFrom = edgesAtNode.get(edge.from) ?? [];
  const touchedTo = edgesAtNode.get(edge.to) ?? [];
  const junctionFrom = touchedFrom.length >= 3;
  const junctionTo = touchedTo.length >= 3;
  if (!junctionFrom && !junctionTo) return { fromS: 0, toS: totalM };
  const sFrom = Math.min(nodeOpenRadiusM(touchedFrom, touchedFrom.length), totalM * JUNCTION_TRIM_MAX_FRACTION);
  const sTo = Math.min(nodeOpenRadiusM(touchedTo, touchedTo.length), totalM * JUNCTION_TRIM_MAX_FRACTION);
  const lineLen = totalM - sFrom - sTo;
  if (!(lineLen > PAVEMENT_MIN_LINE_M)) return null;
  const inset = sidewalkEndInsetM(lineLen);
  return {
    fromS: junctionFrom ? sFrom + inset : 0,
    toS: junctionTo ? totalM - sTo - inset : totalM,
  };
}

/** Shortest edge worth walking, m — below this the out-and-back is a pirouette. */
export const SIDEWALK_MIN_EDGE_M = 60;
/** Half-length band of one walker's out-and-back beat, m. */
const SIDEWALK_BEAT_MIN_M = 55;
const SIDEWALK_BEAT_MAX_M = 130;

/**
 * The arc interval [u0, u1] of `walk` around `anchorU` on which no sample lies
 * on another carriageway (`pedOnOtherCarriageway`, every PED_CLEARANCE_STEP_M
 * and at both ends); the whole line when it is all clear; null when the anchor
 * itself is not clear.
 */
function clearStretch(
  world: PedPavementWorld,
  ownEdgeId: string,
  walk: { px: Float64Array; py: Float64Array; cum: Float64Array; length: number },
  anchorU: number,
): [number, number] | null {
  const n = Math.max(1, Math.ceil(walk.length / PED_CLEARANCE_STEP_M));
  const at = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };
  const ok: boolean[] = [];
  for (let i = 0; i <= n; i++) {
    sampleLane(walk, (walk.length * i) / n, at.segHint, at);
    ok.push(!pedOnOtherCarriageway(world, ownEdgeId, at.x, at.y));
  }
  if (ok.every(Boolean)) return [0, walk.length];
  const a = Math.min(n, Math.max(0, Math.round((anchorU / walk.length) * n)));
  if (!ok[a]) return null;
  let i0 = a;
  while (i0 > 0 && ok[i0 - 1]) i0--;
  let i1 = a;
  while (i1 < n && ok[i1 + 1]) i1++;
  return [(walk.length * i0) / n, (walk.length * i1) / n];
}

/**
 * Build a PAVEMENT loop along `edge`: out along one side and back, no
 * carriageway span anywhere in it. `side` is +1 for the right of the edge
 * direction and −1 for the left (the same convention `buildPedRoute` uses for
 * its two sidewalks). `anchorS` is the arc length the beat is centred on, so
 * the caller can put walkers where the driver actually is.
 *
 * Returns null when the edge is too short or too degenerate to host a walk —
 * the same contract `buildPedRoute` has, so the caller's loop is unchanged.
 *
 * `world` (the district's `pedPavementWorld`, which the live system always
 * passes) does two things, both «WHERE THE PAVEMENT ENDS»: it confines the beat
 * to the drawn pavement at the edge's junction ends (`pedPavementSpan`), and it
 * CHECKS the promise above — the walk line, every 0.5 m, against every other
 * edge's carriageway and every junction box — keeping only the clear stretch
 * the beat's anchor stands on (null when that is shorter than a beat may be).
 * Omitted, the beat runs node to node, unchecked (the bench tests). The beat's
 * one rng draw is taken first either way, so a trim never moves another
 * walker's stream.
 */
export function buildPedSidewalkRoute(
  edge: DistrictEdge,
  laneWidthM: number,
  side: 1 | -1,
  anchorS: number,
  rng: Rng,
  world?: PedPavementWorld,
): PedRoute | null {
  if (edge.geometry.length < 2) return null;
  const center = offsetPolyline(edge.geometry, 0);
  if (center.length < SIDEWALK_MIN_EDGE_M) return null;

  const half = rngRange(rng, SIDEWALK_BEAT_MIN_M, SIDEWALK_BEAT_MAX_M);
  const span = world
    ? pedPavementSpan(edge, center.length, world.edgesAtNode)
    : { fromS: 0, toS: center.length };
  if (span === null) return null;
  const sC = Math.min(Math.max(anchorS, span.fromS), span.toS);
  const s0 = Math.max(span.fromS, sC - half);
  const s1 = Math.min(span.toS, sC + half);
  if (s1 - s0 < SIDEWALK_MIN_EDGE_M * 0.5) return null;

  const sideOff = pedSidewalkOffsetM(edge, laneWidthM);
  const pts = subPolyline(center.px, center.py, center.cum, s0, s1);
  let walk = offsetPolyline(pts, side * sideOff);
  if (world) {
    const clear = clearStretch(world, edge.id, walk, ((sC - s0) / (s1 - s0)) * walk.length);
    if (clear === null) return null;
    if (clear[0] > 0 || clear[1] < walk.length) {
      walk = offsetPolyline(subPolyline(walk.px, walk.py, walk.cum, clear[0], clear[1]), 0);
    }
  }
  if (!(walk.length > SIDEWALK_MIN_EDGE_M * 0.5)) return null;

  const out: number[][] = [];
  for (let i = 0; i < walk.px.length; i++) out.push([walk.px[i], walk.py[i]]);
  const back = [...out].reverse();

  const segments: PedSegment[] = [
    makeSegment("walk", null, out, 0, 0, 0, 0),
    makeSegment("walk", null, back, 0, 0, 0, 0),
  ];
  for (const seg of segments) if (!(seg.length > 0.2)) return null;
  return { segments };
}

/**
 * How many pavement walkers a district can carry, from the district's own
 * walkable kerb length. The caller may override it (a lesson's `traffic
 * .sidewalkPedestrianCount`); this is what the live scene asks for when nobody
 * has said otherwise.
 *
 * DERIVED AND NOT CHOSEN, in both directions:
 *
 *   · one walker per 90 m of walkable EDGE — measured against the maps the
 *     four rows were filed on, that is 4 on `ln-v1` (a 400 m two-lane street),
 *     3 on `vu-cyclist-v1`, 8 on `sp-signs-v1` and 4 on `sx-v1`. Both
 *     pavements of a 400 m street with four people on them is a quiet
 *     residential street, which is what those maps depict; it is not a crowd
 *     and it is not the empty film set the frames show today.
 *   · the ceiling is `DEFAULT_LESSON_TRAFFIC.pedestrianCount` (20, the city
 *     value the full `district-v1` has run at since doc 74 §5.5) minus room
 *     for the crossing walkers that map also seeds, so no district ever
 *     carries more people than the one the renderer was tuned on.
 *   · a district whose walkable edges are all shorter than
 *     `SIDEWALK_MIN_EDGE_M` gets ZERO rather than a rounded-up one: the
 *     parking lots are exactly that shape, and one person pacing a 30 m aisle
 *     reads as a bug, not as a street.
 */
export const SIDEWALK_METRES_PER_WALKER = 90;
export const SIDEWALK_BUDGET_MAX = 12;

/**
 * How far past a motorway carriageway's kerb a link's terminal point may lie
 * and still be its ramp. One metre of slack over `pedCarriagewayHalfM`: a nose
 * is authored ON the carriageway (mw-entry-v1's is 8.13 m inside a 12.19 m half
 * width), and a road that merely passes nearby is metres further out.
 */
const RAMP_JOIN_SLACK_M = 1.0;

/**
 * The edges no pavement walker may be seeded on — the class list, PLUS the two
 * shapes a class list cannot see.
 *
 * `footwaylessRoadClasses` asks the class NAME, and `world/builders/network.ts`
 * already had to stop doing that once (sc-merge-motorway-exit:22f793e2): of the
 * three committed motorway maps only mw-v1 and mw-entry-v1 tag their
 * carriageways `class: "motorway"` — mw-exit-v1's are `class: "primary"` with
 * `motorway: true`. And neither list nor tag catches the ВРЪЗКА that feeds one:
 * `mwe-e-ramp` is a 143.6 m `secondary_link` and was, until this predicate, the
 * ONLY walkable edge on mw-entry-v1, so both of that map's ambient walkers stood
 * on the verge of the on-ramp the student spawns 20 m up. MEASURED on the
 * committed bank, budget before → after: mw-entry-v1 2 → 0, mw-exit-v1 12 → 0,
 * and not one of the other 103 districts moves by a walker.
 *
 * ЗДвП чл. 55, ал. 1: on a road signed автомагистрала „движението на пешеходци
 * … е забранено" (retrieved from content/law/acts/zdvp.json — ADR-002, never
 * free recall). Since repair wave 21 the ramp carries the Д5 that puts it inside
 * that regime, so a walker there is the world contradicting the plate it posts.
 *
 * The ramp test is the one `world/builders/props.ts` already uses to decide
 * which link earns a Д5 — a terminal point inside the carriageway's own half
 * width — so the plate pass and this pass cannot disagree about what a ramp is.
 */
export function footwaylessEdgeIds(
  edges: readonly DistrictEdge[],
  footwaylessRoadClasses: readonly string[],
  laneWidthM: number,
): Set<string> {
  const byClass = new Set(footwaylessRoadClasses);
  const out = new Set<string>();
  const carriageways: Array<{ line: ReturnType<typeof offsetPolyline>; kerbM: number }> = [];
  for (const e of edges) {
    const motorway = isMotorwayCarriageway(e);
    if (byClass.has(e.class) || motorway) out.add(e.id);
    if (motorway && e.geometry.length >= 2) {
      carriageways.push({
        line: offsetPolyline(e.geometry, 0),
        kerbM: pedCarriagewayHalfM(e, laneWidthM) + RAMP_JOIN_SLACK_M,
      });
    }
  }
  if (carriageways.length === 0) return out;
  for (const e of edges) {
    if (out.has(e.id) || !e.class.endsWith("_link") || e.geometry.length < 2) continue;
    const ends = [e.geometry[0], e.geometry[e.geometry.length - 1]];
    const joins = carriageways.some((c) =>
      ends.some(
        ([x, y]) => projectOntoPolyline(c.line.px, c.line.py, c.line.cum, x, y).dist <= c.kerbM,
      ),
    );
    if (joins) out.add(e.id);
  }
  return out;
}

export function ambientSidewalkBudget(
  district: { roads: { edges: readonly DistrictEdge[] } },
  footwaylessRoadClasses: readonly string[],
  laneWidthM: number,
): number {
  const footwayless = footwaylessEdgeIds(district.roads.edges, footwaylessRoadClasses, laneWidthM);
  let walkableM = 0;
  for (const e of district.roads.edges) {
    if (footwayless.has(e.id)) continue;
    if (e.geometry.length < 2 || e.length < SIDEWALK_MIN_EDGE_M) continue;
    walkableM += e.length;
  }
  if (walkableM <= 0) return 0;
  return Math.min(SIDEWALK_BUDGET_MAX, Math.round(walkableM / SIDEWALK_METRES_PER_WALKER));
}

export function createPedestrianAgent(
  id: number,
  route: PedRoute,
  rng: Rng,
  colorIndex: number,
  cfg: TrafficConfig,
): PedestrianAgent {
  const startS = rng() * route.segments[0].length * 0.9;
  return {
    state: {
      id,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      walkPhase: rng() * Math.PI * 2,
      onCrossing: false,
      colorIndex,
    },
    route,
    segIdx: 0,
    s: startS,
    segHint: 0,
    mode: "walking",
    waitLeft: 0,
    rng,
    baseSpeed: cfg.pedSpeedMps * rngRange(rng, 0.85, 1.15),
    onRoad: false,
  };
}

// ---------------------------------------------------------------------------
// Per-frame update
// ---------------------------------------------------------------------------

/** May the pedestrian start (or keep) crossing `crossingId`? */
export function crossingGateOpen(
  crossingId: string,
  crossX: number,
  crossY: number,
  env: PedestrianEnv,
): boolean {
  const signalNode = env.graph.crossingSignalNode.get(crossingId);
  if (signalNode) {
    // Vehicle red = pedestrian green.
    return env.signalPhase(signalNode) === "red";
  }
  // Unsignalized: require a safe gap to every traffic vehicle approaching
  // the crossing on any lane it spans.
  const refs = env.graph.crossingLanes.get(crossingId);
  if (refs) {
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      for (let j = 0; j < env.vehicles.length; j++) {
        const veh = env.vehicles[j];
        if (veh.route.laneIndices[veh.routePos] !== ref.laneIndex) continue;
        if (veh.s > ref.s + 2) continue; // already past the crossing
        const dist = ref.s - veh.s;
        if (dist < 12) return false;
        if (dist / Math.max(veh.speed, 0.3) < env.cfg.pedGapSec) return false;
      }
    }
  }
  // Player gap: a MOVING player nearby blocks; a stopped one yields.
  if (env.hasPlayer && env.playerSpeedKmh > 5) {
    const dx = env.playerX - crossX;
    const dy = env.playerY - crossY;
    if (dx * dx + dy * dy < env.cfg.pedPlayerGapM * env.cfg.pedPlayerGapM) return false;
  }
  return true;
}

function setOnRoad(agent: PedestrianAgent, crossingId: string | null, on: boolean, env: PedestrianEnv): void {
  if (agent.onRoad === on || !crossingId) return;
  agent.onRoad = on;
  agent.state.onCrossing = on;
  const count = env.crossingCounts.get(crossingId) ?? 0;
  env.crossingCounts.set(crossingId, Math.max(0, count + (on ? 1 : -1)));
}

export function updatePedestrian(agent: PedestrianAgent, dt: number, env: PedestrianEnv): void {
  const segments = agent.route.segments;
  let seg = segments[agent.segIdx];

  if (agent.mode === "waiting") {
    agent.state.speedMps = 0;
    if (agent.waitLeft > 0) {
      agent.waitLeft -= dt;
    } else if (crossingGateOpen(seg.crossingId as string, seg.crossX, seg.crossY, env)) {
      agent.mode = "walking";
    }
    return; // stands at the curb (pose already published on arrival)
  }

  const speed = seg.kind === "cross" ? agent.baseSpeed * 1.25 : agent.baseSpeed;
  agent.s += speed * dt;
  agent.state.walkPhase += speed * dt * 2.4;

  // On-crossing bookkeeping for the roadway span.
  if (seg.kind === "cross") {
    setOnRoad(agent, seg.crossingId, agent.s >= seg.roadFrom && agent.s <= seg.roadTo, env);
  }

  // Segment transitions (a frame never spans two segments at walking speed).
  if (agent.s >= seg.length) {
    if (seg.kind === "cross") setOnRoad(agent, seg.crossingId, false, env);
    agent.segIdx = (agent.segIdx + 1) % segments.length;
    agent.s = 0;
    agent.segHint = 0;
    seg = segments[agent.segIdx];
    if (seg.kind === "cross") {
      agent.mode = "waiting";
      agent.waitLeft = rngRange(agent.rng, env.cfg.pedWaitMinSec, env.cfg.pedWaitMaxSec);
    }
  }

  // Publish pose.
  sampleLane(seg, agent.s, agent.segHint, samp);
  agent.segHint = samp.segHint;
  agent.state.x = samp.x;
  agent.state.y = samp.y;
  if (samp.dirX !== 0 || samp.dirY !== 0) {
    agent.state.dirX = samp.dirX;
    agent.state.dirY = samp.dirY;
  }
  agent.state.speedMps = speed;
}
