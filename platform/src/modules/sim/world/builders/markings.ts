/**
 * Painted road markings as flat geometry strips slightly above the asphalt:
 * dashed white lane separators, solid edge lines (arterials), stop lines at
 * signalized/stop-controlled approaches, give-way dash lines, and zebra
 * crossings at crossing positions.
 */

import type { District } from "../types";
import {
  ARTERIAL_CLASSES,
  DASH_GAP_M,
  DASH_LENGTH_M,
  DASH_WIDTH_M,
  EDGE_LINE_INSET_M,
  EDGE_LINE_WIDTH_M,
  MARKED_CLASSES,
  MARKING_Y,
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
import type { Approach, RoadNetwork } from "./network";

export interface MarkingBuildResult {
  markings: MeshAccumulator;
  markingQuads: number;
  stopLines: number;
  zebraCrossings: number;
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
  const base = add(ap.cut, mul(away, 0.6)); // just outside the junction mouth
  const from = ap.edge.oneway ? -outer : inner;
  const to = outer;
  if (dashed) {
    const span = to - from;
    const n = Math.max(2, Math.floor(span / 0.9));
    for (let i = 0; i < n; i++) {
      const t = from + (span * (i + 0.5)) / n;
      // give-way line: short dashes along the stop line direction
      paintQuad(acc, add(base, mul(lineDir, -t)), lineDir, 0.25, STOP_LINE_WIDTH_M / 2);
    }
  } else {
    const mid = (from + to) / 2;
    const half = (to - from) / 2;
    paintQuad(acc, add(base, mul(lineDir, -mid)), lineDir, half, STOP_LINE_WIDTH_M / 2);
  }
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
): MarkingBuildResult {
  const acc = new MeshAccumulator();
  let markingQuads = 0;
  let stopLines = 0;
  let zebraCrossings = 0;

  // -- lane lines ------------------------------------------------------------
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
    // Lane boundaries at every internal multiple of LANE_WIDTH from the left
    // edge. For two-way edges the middle boundary is the center line.
    for (let k = 1; k < lanes; k++) {
      const off = -travelHalf + k * LANE_WIDTH_M;
      if (Math.abs(off) > travelHalf - 0.4) continue;
      const offLine = offsetPolyline(line, off);
      markingQuads += paintDashedLine(acc, offLine, DASH_WIDTH_M);
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

  return { markings: acc, markingQuads, stopLines, zebraCrossings };
}
