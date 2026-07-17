/**
 * Painted road markings as flat geometry strips slightly above the asphalt:
 * dashed white lane separators, solid edge lines (arterials), stop lines at
 * signalized/stop-controlled approaches, give-way dash lines, zebra
 * crossings at crossing positions, and lesson-authored parking-bay U-shapes
 * (doc 68 A5 — L7's bay).
 */

import type { ParkingBaySpec } from "../../contracts";
import type { District, DistrictZone } from "../types";
import {
  ARTERIAL_CLASSES,
  BUS_LANE_SEAM_WIDTH_M,
  DASH_GAP_M,
  DASH_LENGTH_M,
  DASH_WIDTH_M,
  EDGE_LINE_INSET_M,
  EDGE_LINE_WIDTH_M,
  MARKED_CLASSES,
  MARKING_Y,
  SOLID_CENTER_LINE_WIDTH_M,
  STOP_LINE_WIDTH_M,
  ZEBRA_GAP_M,
  ZEBRA_LENGTH_M,
  ZEBRA_STRIPE_ACROSS_M,
  LANE_WIDTH_M,
} from "./constants";
import {
  add,
  mul,
  offsetPolyline,
  perpRight,
  pointAlong,
  polylineLength,
  projectOntoPolyline,
  trimPolyline,
  type Vec2,
} from "./math2d";
import { MeshAccumulator, toWorld, UP } from "./mesh";
import { STOP_LINE_BEYOND_CUT_M, type Approach, type EdgeBuild, type RoadNetwork } from "./network";

export interface MarkingBuildResult {
  markings: MeshAccumulator;
  markingQuads: number;
  stopLines: number;
  zebraCrossings: number;
  parkingBays: number;
}

/** Flat quad centered at `p`, extending ±alongHalf along `dir`, ±acrossHalf sideways. */
function paintQuad(
  acc: MeshAccumulator,
  p: Vec2,
  dir: Vec2,
  alongHalf: number,
  acrossHalf: number,
): void {
  const r = perpRight(dir);
  const a = add(add(p, mul(dir, -alongHalf)), mul(r, -acrossHalf));
  const b = add(add(p, mul(dir, -alongHalf)), mul(r, acrossHalf));
  const c = add(add(p, mul(dir, alongHalf)), mul(r, acrossHalf));
  const d = add(add(p, mul(dir, alongHalf)), mul(r, -acrossHalf));
  // (a,b,c,d): back-left, back-right, front-right, front-left — CCW? With
  // dir=(0,1): a=(-w,-l) b=(w,-l) c=(w,l) d=(-w,l) -> CCW.
  const ia = acc.vertex(toWorld(a[0], a[1], MARKING_Y), UP, [0, 0]);
  const ib = acc.vertex(toWorld(b[0], b[1], MARKING_Y), UP, [1, 0]);
  const ic = acc.vertex(toWorld(c[0], c[1], MARKING_Y), UP, [1, 1]);
  const id = acc.vertex(toWorld(d[0], d[1], MARKING_Y), UP, [0, 1]);
  acc.quad(ia, ib, ic, id);
}

/** Continuous line strip along a polyline (solid marking). */
function paintSolidLine(acc: MeshAccumulator, line: Vec2[], width: number): number {
  const frames = line.length >= 2 ? offsetPolyline(line, width / 2) : null;
  const inner = line.length >= 2 ? offsetPolyline(line, -width / 2) : null;
  if (!frames || !inner) return 0;
  let prevL = -1;
  let prevR = -1;
  let quads = 0;
  for (let i = 0; i < line.length; i++) {
    const l = inner[i] as Vec2;
    const r = frames[i] as Vec2;
    const li = acc.vertex(toWorld(l[0], l[1], MARKING_Y), UP, [0, 0]);
    const ri = acc.vertex(toWorld(r[0], r[1], MARKING_Y), UP, [1, 0]);
    if (i > 0) {
      acc.quad(prevL, prevR, ri, li);
      quads++;
    }
    prevL = li;
    prevR = ri;
  }
  return quads;
}

/** Dashed line along a polyline. Returns quad count. */
function paintDashedLine(
  acc: MeshAccumulator,
  line: Vec2[],
  width: number,
  dashLen = DASH_LENGTH_M,
  gapLen = DASH_GAP_M,
): number {
  const total = polylineLength(line);
  let s = gapLen / 2;
  let quads = 0;
  while (s + dashLen < total) {
    const mid = pointAlong(line, s + dashLen / 2);
    paintQuad(acc, mid.point, mid.tangent, dashLen / 2, width / 2);
    quads++;
    s += dashLen + gapLen;
  }
  return quads;
}

// ---------------------------------------------------------------------------
// Zone-authored SOLID markings (ADR-006 stage 2b — the world SHOWS what
// District.zones GRADE). Until this pass markings.ts never read district.zones,
// so an authored М1 осева was invisible AND, worse, a DASHED "overtaking OK"
// line was painted over a span the engine grades as CROSSED_SOLID_LINE. Two
// kinds render here: solidCenterLine (a continuous осева over its span) and
// busLane/emergencyLane (a solid seam on the laneId-0 curb-lane boundary).
//
// Arclength frame: zone fromM/toM are arclength along the FULL edge geometry
// (the same s-measure the runtime + zoneSigns.ts use). The painted lane lines
// run along `line` — the junction-trimmed centreline, offset 0.8 m more at each
// end (see the lane-line loop). `line` is a contiguous sub-path of the geometry
// starting at geometry-arclength eb.trimFrom + 0.8, so a geometry arclength s
// maps to line arclength s - (eb.trimFrom + 0.8). No arclength math is
// re-derived: membership + span extraction reuse polylineLength / trimPolyline.
// ---------------------------------------------------------------------------

/** One authored solid marking on a lane boundary, over one or more spans. */
interface SolidBoundary {
  /** Dashed-lane-loop boundary index (1..lanes-1) this solid replaces, or -1
   *  when the host paints no dashes there (residential centre line, odd-lane
   *  centre) — then nothing is suppressed, only the solid is added. */
  k: number;
  /** Lateral offset from the centreline, offsetPolyline convention (+ = right
   *  of geometry-forward). Kept identical to the loop's `-travelHalf + k*W` so
   *  the solid lands exactly on the (suppressed) dashed divider. */
  off: number;
  width: number;
  /** Solid spans in `line` (trimmed-centreline) arclength, clamped to the drawn
   *  extent [0, lineLen]. */
  segs: Array<{ from: number; to: number }>;
}

/**
 * The authored solid markings on one edge, derived from district.zones. Pure
 * function of the edge + zones, so the lane-line loop (dash suppression) and
 * the solid-paint pass call it identically and cannot diverge.
 *
 * laneId-0 boundary (bus/emergency): mirrors runtime/spatial.ts buildEdge() —
 * lanesPerDir = oneway ? lanes : floor(lanes/2); laneId 0 is the curb lane, so
 * its inner boundary sits (lanesPerDir-1) lane widths off the centreline. On a
 * two-way road BOTH banks carry a curb lane 0 (the zone flags the whole edge;
 * the reducer's laneId gate grades either bank), so both seams are drawn.
 */
function authoredSolidBoundaries(
  eb: EdgeBuild,
  line: Vec2[],
  s0: number,
  travelHalf: number,
  lanes: number,
  zones: readonly DistrictZone[],
): SolidBoundary[] {
  const lineLen = polylineLength(line);
  const W = LANE_WIDTH_M;
  const out: SolidBoundary[] = [];
  const addSeg = (k: number, off: number, width: number, fromM: number, toM: number) => {
    const from = Math.max(0, Math.min(lineLen, fromM - s0));
    const to = Math.max(0, Math.min(lineLen, toM - s0));
    if (to - from <= 0.5) return; // span outside the drawn extent
    let b = out.find((x) => x.k === k && Math.abs(x.off - off) < 1e-6 && x.width === width);
    if (!b) out.push((b = { k, off, width, segs: [] }));
    b.segs.push({ from, to });
  };
  for (const z of zones) {
    if (z.edgeId !== eb.edge.id) continue;
    if (!(Number.isFinite(z.fromM) && Number.isFinite(z.toM) && z.fromM < z.toM)) continue;
    if (z.kind === "solidCenterLine") {
      // осева = the bank boundary (off 0). The off-0 dash exists only for an
      // even lane count; odd/residential hosts paint no centre dash (k = -1)
      // but STILL get the solid — the lesson depends on the line being visible.
      addSeg(lanes % 2 === 0 ? lanes / 2 : -1, 0, SOLID_CENTER_LINE_WIDTH_M, z.fromM, z.toM);
    } else if (z.kind === "busLane" || z.kind === "emergencyLane") {
      const lanesPerDir = eb.edge.oneway ? Math.max(1, lanes) : Math.max(1, Math.floor(lanes / 2));
      if (lanesPerDir < 2) continue; // no boundary between laneId 0 and 1 to seam
      if (eb.edge.oneway) {
        const k = lanesPerDir - 1;
        addSeg(k, -travelHalf + k * W, BUS_LANE_SEAM_WIDTH_M, z.fromM, z.toM);
      } else {
        // Right bank (k = lanes-1, off = +(lanesPerDir-1)*W) and left bank
        // (k = 1, off = -(lanesPerDir-1)*W): both curb-lane-0 boundaries.
        addSeg(lanes - 1, -travelHalf + (lanes - 1) * W, BUS_LANE_SEAM_WIDTH_M, z.fromM, z.toM);
        addSeg(1, -travelHalf + W, BUS_LANE_SEAM_WIDTH_M, z.fromM, z.toM);
      }
    }
  }
  return out;
}

/**
 * Dashed line with span exclusion: byte-identical to paintDashedLine for every
 * dash whose midpoint arclength falls OUTSIDE `exclude`, and skips the rest
 * (an authored solid covers those). `exclude` is in the same arclength frame as
 * the walk (line-frame ≈ offset-line frame; the sub-dash miter drift on curves
 * is cosmetically irrelevant against 100 m+ spans).
 */
function paintDashedLineExcluding(
  acc: MeshAccumulator,
  line: Vec2[],
  width: number,
  exclude: ReadonlyArray<{ from: number; to: number }>,
  dashLen = DASH_LENGTH_M,
  gapLen = DASH_GAP_M,
): number {
  const total = polylineLength(line);
  let s = gapLen / 2;
  let quads = 0;
  while (s + dashLen < total) {
    const mid = s + dashLen / 2;
    let skip = false;
    for (const ex of exclude) {
      if (mid >= ex.from && mid <= ex.to) {
        skip = true;
        break;
      }
    }
    if (!skip) {
      const p = pointAlong(line, mid);
      paintQuad(acc, p.point, p.tangent, dashLen / 2, width / 2);
      quads++;
    }
    s += dashLen + gapLen;
  }
  return quads;
}

/**
 * Paint every authored solid marking (solidCenterLine осева + bus/emergency
 * curb seams) over its span. Runs for ALL edges (not just MARKED_CLASSES): a
 * residential host authoring an М1 span paints no dashes yet must still show
 * the solid osева. Byte-identity: only edges with a matching zone add geometry,
 * so a zoneless district leaves this pass empty.
 */
function paintZoneSolids(acc: MeshAccumulator, district: District, network: RoadNetwork): number {
  const zones = district.zones;
  if (!zones || zones.length === 0) return 0;
  let quads = 0;
  for (const eb of network.edges) {
    if (!eb.line) continue;
    const line = trimPolyline(eb.line, 0.8, 0.8, 2.5);
    if (!line) continue;
    const s0 = eb.trimFrom + 0.8;
    const travelHalf = eb.halfWidth - eb.parkingM;
    const lanes = Math.max(1, eb.edge.lanes);
    const lineLen = polylineLength(line);
    for (const b of authoredSolidBoundaries(eb, line, s0, travelHalf, lanes, zones)) {
      for (const seg of b.segs) {
        const sub = trimPolyline(line, seg.from, lineLen - seg.to, 0.5);
        if (!sub) continue;
        const offSub = b.off === 0 ? sub : offsetPolyline(sub, b.off);
        quads += paintSolidLine(acc, offSub, b.width);
      }
    }
  }
  return quads;
}

/**
 * Stop line across the incoming half of an approach (or full width when
 * oneway). Placed at the ribbon cut cross-section, i.e. the junction mouth.
 */
function paintStopLine(acc: MeshAccumulator, ap: Approach, dashed: boolean): void {
  const away = ap.cutTangentAway;
  const rightOfAway = perpRight(away);
  // Incoming traffic drives toward the node on ITS right side, which is the
  // LEFT half relative to the away direction. The line spans the TRAVEL lanes
  // only — never the parking band (ap.parkingM).
  const inner = 0.15;
  const outer = ap.halfWidth - ap.parkingM - 0.2;
  const lineDir = rightOfAway;
  // Just outside the junction mouth — the runtime derives its GRADED stop
  // lines at the same cut + STOP_LINE_BEYOND_CUT_M, so paint and grading
  // always coincide (runtime/stoplines.ts).
  const base = add(ap.cut, mul(away, STOP_LINE_BEYOND_CUT_M));
  const from = ap.edge.oneway ? -outer : inner;
  const to = outer;
  if (dashed) {
    const span = to - from;
    const n = Math.max(2, Math.floor(span / 1.8)); // dash pitch scaled with paint
    for (let i = 0; i < n; i++) {
      const t = from + (span * (i + 0.5)) / n;
      // give-way line: short dashes along the stop line direction
      paintQuad(acc, add(base, mul(lineDir, -t)), lineDir, 0.5, STOP_LINE_WIDTH_M / 2);
    }
  } else {
    const mid = (from + to) / 2;
    const half = (to - from) / 2;
    paintQuad(acc, add(base, mul(lineDir, -mid)), lineDir, half, STOP_LINE_WIDTH_M / 2);
  }
}

/** Parking-bay stroke width — reads as bay paint next to the 0.25 m dashes. */
const BAY_LINE_WIDTH_M = 0.25;

/**
 * Parking bay: white U-shape at the bay rect (district space). Three strokes —
 * the longitudinal side line on the bay's LEFT edge (toward the roadway for a
 * bay on the right-hand curb) plus both transverse end lines; the curb closes
 * the fourth side, exactly how curbside bays are marked. Author a left-curb
 * bay by flipping headingDeg 180°. Returns quads painted (3).
 */
function paintParkingBay(acc: MeshAccumulator, bay: ParkingBaySpec): number {
  const h = (bay.headingDeg * Math.PI) / 180;
  const dir: Vec2 = [Math.sin(h), Math.cos(h)];
  const right = perpRight(dir);
  const c: Vec2 = [bay.x, bay.y];
  const halfL = bay.lengthM / 2;
  const halfW = bay.widthM / 2;
  const w = BAY_LINE_WIDTH_M;
  // Side line along the travel direction, on the left (roadway-facing) edge.
  paintQuad(acc, add(c, mul(right, -halfW)), dir, halfL, w / 2);
  // End lines across the bay (slight overlap with the side line is coplanar
  // same-color paint — invisible).
  paintQuad(acc, add(c, mul(dir, -halfL)), right, halfW, w / 2);
  paintQuad(acc, add(c, mul(dir, halfL)), right, halfW, w / 2);
  return 3;
}

/** Zebra crossing: longitudinal bars across the full road width. */
function paintZebra(
  acc: MeshAccumulator,
  at: Vec2,
  roadDir: Vec2,
  halfWidth: number,
): number {
  const r = perpRight(roadDir);
  const step = ZEBRA_STRIPE_ACROSS_M + ZEBRA_GAP_M;
  const span = halfWidth * 2 - 0.5;
  const count = Math.max(2, Math.floor(span / step));
  const start = -((count - 1) * step) / 2;
  for (let i = 0; i < count; i++) {
    const off = start + i * step;
    paintQuad(acc, add(at, mul(r, off)), roadDir, ZEBRA_LENGTH_M / 2, ZEBRA_STRIPE_ACROSS_M / 2);
  }
  return count;
}

// ---------------------------------------------------------------------------

export function buildMarkings(
  district: District,
  network: RoadNetwork,
  stopSignEdges: ReadonlySet<string>,
  giveWayEdges: ReadonlySet<string>,
  parkingBays: readonly ParkingBaySpec[] = [],
): MarkingBuildResult {
  const acc = new MeshAccumulator();
  let markingQuads = 0;
  let stopLines = 0;
  let zebraCrossings = 0;

  // -- lane lines ------------------------------------------------------------
  const zones = district.zones ?? [];
  for (const eb of network.edges) {
    if (!eb.line) continue;
    if (!MARKED_CLASSES.has(eb.edge.class)) continue;
    const line = trimPolyline(eb.line, 0.8, 0.8, 2.5);
    if (!line) continue;
    const lanes = Math.max(1, eb.edge.lanes);
    // Paint geometry works off the TRAVEL width — the parking band (parkingM,
    // doc 68 QW3) is inside eb.halfWidth but carries no lane lines; the solid
    // edge line separates the travel lanes from the parking band.
    const travelHalf = eb.halfWidth - eb.parkingM;
    // Zone-authored solids on this edge → per-boundary spans whose dashes are
    // suppressed here (the solid is painted in paintZoneSolids below). Empty on
    // a zoneless district, so the dash geometry stays byte-identical there.
    const suppress = new Map<number, Array<{ from: number; to: number }>>();
    if (zones.length) {
      const s0 = eb.trimFrom + 0.8;
      for (const b of authoredSolidBoundaries(eb, line, s0, travelHalf, lanes, zones)) {
        if (b.k >= 1) suppress.set(b.k, [...(suppress.get(b.k) ?? []), ...b.segs]);
      }
    }
    // Lane boundaries at every internal multiple of LANE_WIDTH from the left
    // edge. For two-way edges the middle boundary is the center line.
    for (let k = 1; k < lanes; k++) {
      const off = -travelHalf + k * LANE_WIDTH_M;
      if (Math.abs(off) > travelHalf - 0.4) continue;
      const offLine = offsetPolyline(line, off);
      const ex = suppress.get(k);
      markingQuads += ex
        ? paintDashedLineExcluding(acc, offLine, DASH_WIDTH_M, ex)
        : paintDashedLine(acc, offLine, DASH_WIDTH_M);
    }
    if (ARTERIAL_CLASSES.has(eb.edge.class)) {
      // With a parking band the edge line sits ON the travel/parking boundary;
      // without one it stays inset from the curb so paint never underlaps it.
      const edgeOff = eb.parkingM > 0 ? travelHalf : travelHalf - EDGE_LINE_INSET_M;
      for (const side of [-1, 1] as const) {
        const offLine = offsetPolyline(line, side * edgeOff);
        markingQuads += paintSolidLine(acc, offLine, EDGE_LINE_WIDTH_M);
      }
    }
  }

  // -- stop / give-way lines at junction mouths -------------------------------
  for (const node of network.nodes.values()) {
    if (node.degree < 3) continue;
    for (const ap of node.approaches) {
      if (!ap.incoming) continue;
      if (node.signalized || stopSignEdges.has(`${node.id}:${ap.edgeId}`)) {
        paintStopLine(acc, ap, false);
        stopLines++;
        markingQuads++;
      } else if (giveWayEdges.has(`${node.id}:${ap.edgeId}`)) {
        paintStopLine(acc, ap, true);
        stopLines++;
        markingQuads++;
      }
    }
  }

  // -- zebra crossings ---------------------------------------------------------
  for (const crossing of district.crossings) {
    if (!crossing.edgeId) continue;
    if (crossing.kind !== "marked" && crossing.kind !== "signals") continue;
    const eb = network.edgeById.get(crossing.edgeId);
    if (!eb) continue;
    const proj = projectOntoPolyline(eb.edge.geometry as Vec2[], [crossing.x, crossing.y]);
    if (proj.distance > 25) continue; // data glitch guard
    markingQuads += paintZebra(acc, proj.point, proj.tangent, eb.halfWidth);
    zebraCrossings++;
  }

  // -- parking bays (lesson-authored, doc 68 A5) -------------------------------
  for (const bay of parkingBays) {
    markingQuads += paintParkingBay(acc, bay);
  }

  // -- zone-authored solids (М1 осева + bus/emergency curb seams) --------------
  markingQuads += paintZoneSolids(acc, district, network);

  return {
    markings: acc,
    markingQuads,
    stopLines,
    zebraCrossings,
    parkingBays: parkingBays.length,
  };
}
