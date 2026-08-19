/**
 * Painted road markings as flat geometry strips slightly above the asphalt:
 * dashed white lane separators, solid edge lines (arterials), stop lines at
 * signalized/stop-controlled approaches, give-way dash lines, zebra
 * crossings at crossing positions, lesson-authored parking-bay U-shapes
 * (doc 68 A5 — L7's bay), and meta-authored lane-intent arrows
 * (meta.scenario.laneArrows — the SN-04/RB approach glyphs).
 */

import type { ParkingBaySpec } from "../../contracts";
import type { District, DistrictZone } from "../types";
import {
  BUS_LANE_SEAM_WIDTH_M,
  CENTER_LINE_WIDTH_M,
  CURB_CHAMFER_M,
  CURB_FOOT_TINT,
  DASH_GAP_M,
  DASH_LENGTH_M,
  DASH_WIDTH_M,
  EDGE_LINE_CLASSES,
  EDGE_LINE_INSET_M,
  EDGE_LINE_WIDTH_M,
  EMERGENCY_LANE_SEAM_WIDTH_M,
  GIVE_WAY_TRIANGLE_BASE_M,
  GIVE_WAY_TRIANGLE_LENGTH_M,
  GIVE_WAY_TRIANGLE_SETBACK_M,
  MARKED_CLASSES,
  MARKING_Y,
  paintsZebra,
  ROAD_Y,
  SIDEWALK_TOP_Y,
  SOLID_CENTER_LINE_WIDTH_M,
  SOLID_LANE_DIVIDER_WIDTH_M,
  SPEED_GLYPH_DIGIT_GAP_M,
  SPEED_GLYPH_DIGIT_H_M,
  SPEED_GLYPH_DIGIT_W_M,
  SPEED_GLYPH_INSET_M,
  SPEED_GLYPH_MAX_KMH,
  SPEED_GLYPH_MIN_EDGE_M,
  SPEED_GLYPH_PITCH_M,
  SPEED_GLYPH_STROKE_M,
  STOP_LINE_WIDTH_M,
  ZEBRA_GAP_M,
  ZEBRA_LENGTH_M,
  ZEBRA_STRIPE_ACROSS_M,
  LANE_WIDTH_M,
} from "./constants";
import {
  add,
  mul,
  norm,
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
  /** Lane-intent arrow quads painted from meta.scenario.laneArrows (0 on
   *  every district without the meta — the byte-identity contract). */
  laneArrowQuads: number;
  /** Painted zone-speed numeral quads („30"/„20" road glyphs — founder R3
   *  #33/#34; 0 on every map without a qualifying zone edge). */
  speedGlyphQuads: number;
  /** М18 „триъгълник" symbols painted before an М7 линия за изчакване
   *  (Наредба № 2/2001 чл. 23 ал. 3). 0 on every map with no Б1 approach. */
  giveWayTriangles: number;
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

/**
 * Dash MIDPOINT arclengths for one drawn line — the SINGLE walk both dashed
 * painters below use, so the plain pass and the span-excluding pass cannot
 * drift apart (they used to carry two copies of the same `while` loop).
 *
 * COUNT is the fixed-pitch walk's, verbatim: start half a gap in, step
 * dashLen + gapLen, keep every dash that fits whole. Nothing is added and
 * nothing is dropped, so every district's marking quad count — and every
 * suite that pins one — is unchanged by this function's existence.
 *
 * SPACING is then fitted to the run instead of being anchored at the near end.
 * The old walk paid out its slack entirely at the FAR end, which on a
 * junction-trimmed arm is the junction mouth, and the residue was pure phase
 * luck. Measured on the sweep-161 junction maps (drawn line length → metres of
 * unpainted осева between the last dash and the mouth):
 *   jx-equal-v1   all four arms 111.27 m → 11.27 m
 *   tj-occluded-v1 south stem    111.27 m → 11.27 m   (the sc-junction-blind arm)
 *   tj-emerge-v1  south stem      71.28 m → 10.28 m   (the Б2 arm)
 *   sx-v1         north arm       61.28 m →  0.28 m
 *                 east/south arms 91.28 m →  4.28 m
 * Four arms of the SAME class at the SAME junction ending their paint anywhere
 * from 0.3 m to 11.3 m short of the mouth is the audit's „the same road class
 * renders three different ways across the set", and on the two равнозначни
 * junctions it is 11.3 m of bare asphalt on top of the 17.1 m junction patch.
 * With the rhythm fitted, EVERY run — every arm, every district — starts and
 * ends exactly gapLen/2 = 4.0 m from its own ends, the way a marking crew lays
 * a dashed line between two fixed joints. The interior gap absorbs the slack
 * (jx-equal-v1: 8.00 m → 9.04 m), and it can never fall below dashLen because
 * the fixed-pitch walk had already fitted `n` dashes at gapLen.
 */
function dashStations(total: number, dashLen: number, gapLen: number): number[] {
  let n = 0;
  for (let s = gapLen / 2; s + dashLen < total; s += dashLen + gapLen) n++;
  if (n === 0) return [];
  // One dash has no rhythm to fit — centre it, which is the n > 1 rule's own
  // limit (equal margins at both ends).
  if (n === 1) return [total / 2];
  const margin = gapLen / 2;
  const gap = (total - 2 * margin - n * dashLen) / (n - 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(margin + i * (dashLen + gap) + dashLen / 2);
  return out;
}

/** Dashed line along a polyline. Returns quad count. */
function paintDashedLine(
  acc: MeshAccumulator,
  line: Vec2[],
  width: number,
  dashLen = DASH_LENGTH_M,
  gapLen = DASH_GAP_M,
): number {
  let quads = 0;
  for (const s of dashStations(polylineLength(line), dashLen, gapLen)) {
    const mid = pointAlong(line, s);
    paintQuad(acc, mid.point, mid.tangent, dashLen / 2, width / 2);
    quads++;
  }
  return quads;
}

// ---------------------------------------------------------------------------
// Zone-authored SOLID markings (ADR-006 stage 2b — the world SHOWS what
// District.zones GRADE). Until this pass markings.ts never read district.zones,
// so an authored М1 осева was invisible AND, worse, a DASHED "overtaking OK"
// line was painted over a span the engine grades as CROSSED_SOLID_LINE. Three
// kinds render here: solidCenterLine (a continuous осева over its span),
// noOvertaking (the осева PLUS every same-direction divider — В24 must be
// unbroken on whichever line the graded overtake crosses) and
// busLane/emergencyLane (a seam on the laneId-0 curb-lane boundary, plus the
// outer edge line that makes an emergency lane read as a lane you may not use).
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
   *  centre, the emergency lane's outer carriageway edge) — then nothing is
   *  suppressed, only the solid is added. */
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
    if (z.kind === "solidCenterLine" || z.kind === "noOvertaking") {
      // осева = the bank boundary (off 0). The off-0 dash exists only for an
      // even lane count; odd/residential hosts paint no centre dash (k = -1)
      // but STILL get the solid — the lesson depends on the line being visible.
      //
      // noOvertaking (В24) paints the SAME solid М1 over its span (founder R3
      // doc 62 #50): a dashed centre line over the ban span visually PERMITS
      // exactly what the zone grades as OVERTAKING_IN_BAN_ZONE.
      addSeg(lanes % 2 === 0 ? lanes / 2 : -1, 0, SOLID_CENTER_LINE_WIDTH_M, z.fromM, z.toM);
      if (z.kind === "noOvertaking") {
        // …and on a multi-lane carriageway, EVERY divider inside the span, not
        // only the осева. The R3 fix stopped at the centre line on the theory
        // that В24 „bans overtaking, not lane discipline paint" — but the
        // detector it has to agree with grades a laneId CHANGE (engine.ts
        // OVERTAKING_IN_BAN_ZONE reads the denoised lane-change signal), and on
        // ov-ban-v1's 2+2 boulevard that change crosses the SAME-DIRECTION
        // divider at ±W, which stayed dashed. So the ban was posted on a road
        // whose paint invited the exact manoeuvre it grades — the founder's
        // verdict-board note verbatim („it must be unbroken line and currently
        // is broken line which is allowing overtake"). The line a driver
        // crosses to изпревари inside a В24 span is М1, whichever line it is;
        // this is the junctionPriorityControls lesson applied to paint: the
        // grader and the painter must name the SAME boundary.
        for (let k = 1; k < lanes; k++) {
          const off = -travelHalf + k * W;
          if (Math.abs(off) < 1e-6) continue; // the осева, added above
          if (Math.abs(off) > travelHalf - 0.4) continue; // the dash loop's own skip
          addSeg(k, off, SOLID_LANE_DIVIDER_WIDTH_M, z.fromM, z.toM);
        }
      }
    } else if (z.kind === "busLane" || z.kind === "emergencyLane") {
      const emergency = z.kind === "emergencyLane";
      // The аварийна лента is bounded by the WIDE continuous line, the bus lane
      // by the ordinary seam — same boundary, different marking (Наредба № 2).
      const seamW = emergency ? EMERGENCY_LANE_SEAM_WIDTH_M : BUS_LANE_SEAM_WIDTH_M;
      const lanesPerDir = eb.edge.oneway ? Math.max(1, lanes) : Math.max(1, Math.floor(lanes / 2));
      if (lanesPerDir < 2) continue; // no boundary between laneId 0 and 1 to seam
      // An emergency lane needs BOTH of its edges painted or it reads as one
      // more travel lane: the wide inner line AND the carriageway edge line on
      // its curb side. Only on hosts that paint no edge line of their own.
      //
      // This used to ask ARTERIAL_CLASSES and was the loudest symptom of B81's
      // cause: `motorway` is outside that set because a motorway carries no
      // street FURNITURE, so mw-v1 „had literally nothing on the outside" and
      // this branch was written to hand it one. Now that the edge line asks
      // EDGE_LINE_CLASSES — a set about paint — a motorway paints its own,
      // continuous over the whole ribbon instead of only over the zone span,
      // and this branch correctly falls to 0 rather than doubling it.
      const outerW = emergency && !EDGE_LINE_CLASSES.has(eb.edge.class) ? EDGE_LINE_WIDTH_M : 0;
      // …and it sits INSET from the carriageway edge, on the arterial pass's own
      // terms (`travelHalf - EDGE_LINE_INSET_M` below, „so paint never underlaps
      // it"): a 0.3 m strip centred exactly on travelHalf hangs half its width
      // off the asphalt ribbon — halfWidth IS travelHalf on a motorway, which
      // carries no parking band — and reads at cockpit height as paint peeling
      // into the verge. The lane it bounds is unchanged: the emergency lane
      // still runs seam → carriageway edge, the line just lies inside it.
      const outerOff = travelHalf - EDGE_LINE_INSET_M;
      if (eb.edge.oneway) {
        const k = lanesPerDir - 1;
        addSeg(k, -travelHalf + k * W, seamW, z.fromM, z.toM);
        if (outerW) addSeg(-1, outerOff, outerW, z.fromM, z.toM);
      } else {
        // Right bank (k = lanes-1, off = +(lanesPerDir-1)*W) and left bank
        // (k = 1, off = -(lanesPerDir-1)*W): both curb-lane-0 boundaries.
        addSeg(lanes - 1, -travelHalf + (lanes - 1) * W, seamW, z.fromM, z.toM);
        addSeg(1, -travelHalf + W, seamW, z.fromM, z.toM);
        if (outerW) {
          addSeg(-1, outerOff, outerW, z.fromM, z.toM);
          addSeg(-1, -outerOff, outerW, z.fromM, z.toM);
        }
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
 *
 * The byte-identity is now STRUCTURAL rather than promised: both painters walk
 * the one `dashStations` list, so a change to the rhythm cannot land on the
 * plain pass while the suppression pass keeps the old stations — which would
 * paint a dash the authored solid was supposed to cover.
 */
function paintDashedLineExcluding(
  acc: MeshAccumulator,
  line: Vec2[],
  width: number,
  exclude: ReadonlyArray<{ from: number; to: number }>,
  dashLen = DASH_LENGTH_M,
  gapLen = DASH_GAP_M,
): number {
  let quads = 0;
  for (const mid of dashStations(polylineLength(line), dashLen, gapLen)) {
    let skip = false;
    for (const ex of exclude) {
      if (mid >= ex.from && mid <= ex.to) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    const p = pointAlong(line, mid);
    paintQuad(acc, p.point, p.tangent, dashLen / 2, width / 2);
    quads++;
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
 *
 * Returns the quads it painted — ONE for the solid М7 (Б2/светофар), but the
 * М7 линия за изчакване under a Б1 is a row of `n` dashes, and the caller used
 * to book every stop line as a single quad whatever it drew. Measured on the
 * shipped give-way maps: a residential arm's dashed line emits 4 quads and a
 * 2+2 secondary arm 8, all of them counted as 1, so `WorldStats.markingQuads`
 * under-reported the paint on every Б1 approach in the world. That stat is the
 * number an audit reads to ask „did the world draw what it claims" — the whole
 * complaint family this file sits under — so it may not be an estimate.
 */
function paintStopLine(acc: MeshAccumulator, ap: Approach, dashed: boolean): number {
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
    return n;
  }
  const mid = (from + to) / 2;
  const half = (to - from) / 2;
  paintQuad(acc, add(base, mul(lineDir, -mid)), lineDir, half, STOP_LINE_WIDTH_M / 2);
  return 1;
}

/**
 * М18 „триъгълник" — the give-way symbol on the carriageway just BEFORE the М7
 * линия за изчакване (Наредба № 2/2001, чл. 23, ал. 3; see constants.ts for the
 * verbatim text and for why this exists at all).
 *
 * Geometry is derived from the SAME approach frame `paintStopLine` uses, so the
 * symbol and the line it belongs to can never drift apart:
 *   - `away` points out of the junction, so the driver who must give way travels
 *     `-away` and „before the line" is at a LARGER +away offset;
 *   - the apex therefore points along `+away`, i.e. straight back at that
 *     driver. That orientation IS the legal content of ал. 3 — the same
 *     triangle drawn the other way up is a different marking;
 *   - across the road it is centred on each INCOMING travel lane (the half the
 *     М7 line already spans), never on the parking band and never on the
 *     oncoming half.
 *
 * Returns the number of triangles painted (one per incoming lane).
 */
function paintGiveWayTriangles(acc: MeshAccumulator, ap: Approach): number {
  const away = ap.cutTangentAway;
  const lineDir = perpRight(away);
  const travelHalf = ap.halfWidth - ap.parkingM;
  if (travelHalf <= 0.5) return 0;

  // The М7 line's own span, restated from paintStopLine so the two agree.
  const inner = 0.15;
  const outer = travelHalf - 0.2;
  const from = ap.edge.oneway ? -outer : inner;
  const to = outer;
  const span = to - from;
  if (span <= 0.5) return 0;

  // The symbol's BASE sits `SETBACK` before the line; the apex is a further
  // LENGTH out, pointing at the driver.
  const lineBase = add(ap.cut, mul(away, STOP_LINE_BEYOND_CUT_M));
  const baseS = GIVE_WAY_TRIANGLE_SETBACK_M;
  const apexS = baseS + GIVE_WAY_TRIANGLE_LENGTH_M;

  // One symbol per incoming travel lane, on that lane's centre. `span` is the
  // incoming half (or the whole carriageway on a one-way arm), so dividing it
  // by the lane count places the symbol where the wheel tracks are, whatever
  // the arm's width and lane count.
  const lanes = Math.max(1, ap.edge.oneway ? ap.edge.lanes : Math.floor(ap.edge.lanes / 2));
  const half = GIVE_WAY_TRIANGLE_BASE_M / 2;
  let painted = 0;
  for (let i = 0; i < lanes; i++) {
    const t = from + (span * (i + 0.5)) / lanes;
    // Symbol must fit inside the carriageway, not hang over the curb.
    if (t - half < Math.min(from, to) - 1e-6 || t + half > to + 1e-6) continue;
    const centre = add(lineBase, mul(lineDir, -t));
    const baseL = add(add(centre, mul(away, baseS)), mul(lineDir, -half));
    const baseR = add(add(centre, mul(away, baseS)), mul(lineDir, half));
    const apex = add(centre, mul(away, apexS));
    // District-space CCW → front-facing up after toWorld (mesh.ts).
    const ia = acc.vertex(toWorld(baseL[0], baseL[1], MARKING_Y), UP, [0, 0]);
    const ib = acc.vertex(toWorld(baseR[0], baseR[1], MARKING_Y), UP, [1, 0]);
    const ic = acc.vertex(toWorld(apex[0], apex[1], MARKING_Y), UP, [0.5, 1]);
    // Wind by measured signed area rather than by assuming which way `lineDir`
    // ran: `away` flips per approach, and a back-faced symbol is invisible.
    const area =
      (baseR[0] - baseL[0]) * (apex[1] - baseL[1]) - (apex[0] - baseL[0]) * (baseR[1] - baseL[1]);
    if (area >= 0) acc.tri(ia, ib, ic);
    else acc.tri(ia, ic, ib);
    painted++;
  }
  return painted;
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

/** Widest an ANGLED crossing may be skewed off perpendicular before its own
 *  1/cos span widening stops describing a crossing (2× the carriageway). Every
 *  shipped angled crossing is inside it — gen_pe_crossings.mjs authors 18° and
 *  −12° — so the clamp changes no map that exists; it exists so a bad number
 *  cannot hang the build (see paintZebra). */
const ZEBRA_MAX_SKEW_DEG = 60;

/**
 * Margin the island clamp keeps below the outermost bar's own offset, so the
 * „does a bar survive" test is decided by geometry rather than by the last bit
 * of a double: the loop skips a bar when `|off| < islandHalfW + stripe/2`, and
 * the round trip `(maxOff − stripe/2) + stripe/2` is not algebraically
 * guaranteed to land back on or below `maxOff`.
 *
 * NOT LOAD-BEARING, and said out loud rather than implied by its existence:
 * setting this to 0 leaves all 67 assertions in markings-paint-truth.test.ts
 * green, and a 37,760-case sweep (halfWidth 1…60 m × 8 skews) found the round
 * trip never exceeding `maxOff` at all. It is kept because it is free and the
 * hazard is real in principle — not because a failing case exists. 1 nm is
 * invisible in a world measured in metres and seven orders of magnitude above
 * the ~1e-16 m rounding the offsets actually carry.
 */
const ISLAND_PAINT_EPS_M = 1e-9;

/** Rotate a unit direction by `deg` (positive = toward the road's right). */
function rotate(d: Vec2, deg: number): Vec2 {
  if (deg === 0) return d;
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
}

/**
 * The lattice of bar offsets `paintZebra` walks, extracted so the ISLAND CLAMP
 * below and the loop it protects cannot drift apart. `maxOff` is the outermost
 * bar's distance from the centreline — the number that decides whether a refuge
 * island leaves any paint at all.
 */
function zebraBarLattice(
  halfWidth: number,
  skewDeg: number,
): { skew: number; step: number; count: number; start: number; maxOff: number } {
  const skew = Math.max(-ZEBRA_MAX_SKEW_DEG, Math.min(ZEBRA_MAX_SKEW_DEG, skewDeg));
  const step = ZEBRA_STRIPE_ACROSS_M + ZEBRA_GAP_M;
  const span = (halfWidth * 2 - 0.5) / Math.cos((skew * Math.PI) / 180);
  const count = Math.max(2, Math.floor(span / step));
  const start = -((count - 1) * step) / 2;
  // `maxOff` is taken from the LOOP'S OWN arithmetic at both ends rather than
  // from the algebraic `((count−1)·step)/2`, because the loop evaluates
  // `start + i·step` and `-(X/2) + X` is not guaranteed bit-identical to `X/2`.
  // HONESTLY MEASURED, so nobody reads this as a bug that was observed: across
  // 37,760 (halfWidth 1…60 m × 8 skews incl. ±90) the two forms agreed
  // EXACTLY, every time. The min-form is kept because it is free and is the
  // only one provably ≤ both endpoints — not because a case was found.
  return {
    skew,
    step,
    count,
    start,
    maxOff: Math.min(Math.abs(start), Math.abs(start + (count - 1) * step)),
  };
}

/**
 * The refuge-island half-width the world may actually BUILD at this crossing —
 * THE ONE NUMBER the bars and the kerb both read (O32).
 *
 * WHAT WAS WRONG. `runtime/zones.ts` grades a crossing off `gradesCrossingDuty`
 * → `paintsZebra`, which reads the crossing's `kind` and KNOWS NOTHING ABOUT
 * BARS. The painter's bar loop, meanwhile, refuses every bar that would land on
 * the island — so a wide enough kerb deletes the whole пешеходна пътека while
 * the grader goes on believing there is one. MEASURED end to end 2026-08-19 on
 * the §7 fixture (16.25 m residential street, `kind: "marked"`): at
 * `island.widthM = 14` the crossing adds 0 marking vertices, `zebraCrossings`
 * is 0 — AND `CrossingZoneTracker` still builds its zone, and `reduceTick`
 * still bills the 10-point опасна PEDESTRIAN_CROSSING_TOO_FAST. A seventeen-
 * year-old convicted under чл. 119 at paint the world never drew is the
 * founder's own roundabout complaint pointed at a zebra: a FALSE FAILURE.
 *
 * WHY CLAMP RATHER THAN REFUSE. Refusing (dropping the duty where no bar lands)
 * is the false-certificate direction of the same crime — «Непропускане на
 * пешеходец» is one of the two faults the reference lesson exists to teach, and
 * a guard that answers „no zebra here" hands out a green tick for a skill the
 * lesson never measured. Clamping is also the doctrine this file already
 * settled for `skewDeg` one screen up: nothing validates authored furniture
 * (`assertDistrict` is the cheap seam guard, not a schema validator), so the
 * painter owns the domain and must keep painting inside it.
 *
 * THE BOUND. A bar at offset `off` survives iff `|off| >= islandHalfW +
 * ZEBRA_STRIPE_ACROSS_M/2`, so the outermost pair survives exactly up to
 * `maxOff − ZEBRA_STRIPE_ACROSS_M/2`. Derived from the lattice rather than from
 * the carriageway, because the floored bar count quantises the outermost bar
 * well inside the kerb: on the 16.25 m two-lane street the 11 bars reach
 * ±7.0 m, so the bound is 6.6 m — not the 7.5 m a „halfWidth − stripe" guess
 * gives, which would still paint nothing. `count` is floored at 2, so `maxOff`
 * is never below `step/2 = 0.7` and the bound is never below 0.3 m.
 *
 * CHANGES NO MAP THAT EXISTS. All three authored islands in content/world
 * (pe-bus 2.0 m, pe-cane 2.2 m, pe-slow 2.4 m — halves 1.0/1.1/1.2) sit far
 * under 6.6 m, so every committed marking buffer is byte-identical.
 */
export function crossingIslandHalfWidthM(
  requestedHalfWidthM: number,
  carriagewayHalfWidthM: number,
  skewDeg: number,
): number {
  if (!(requestedHalfWidthM > 0)) return 0;
  const { maxOff } = zebraBarLattice(carriagewayHalfWidthM, skewDeg);
  // The epsilon is belt over braces and is measured not to bite — see its own
  // docstring rather than reading its presence as evidence of a failing case.
  const bound = maxOff - ZEBRA_STRIPE_ACROSS_M / 2 - ISLAND_PAINT_EPS_M;
  return Math.min(requestedHalfWidthM, Math.max(0, bound));
}

/**
 * Zebra crossing: longitudinal bars across the full road width.
 *
 * doc 87 B50/B53/B54 — the bars now answer to the crossing's FURNITURE:
 *  - `islandHalfW` opens the gap a central refuge stands in (bars that would
 *    be painted ON the island are refused, not drawn under a kerb) — CLAMPED
 *    by `crossingIslandHalfWidthM` so the gap can never eat the last bar;
 *  - `skewDeg` rotates the whole crossing off perpendicular (an ANGLED
 *    crossing), layout axis and bar axis together, with the span widened by
 *    1/cos so the paint still reaches both kerbs;
 *  - `staggerM` offsets the far half along the road (a STAGGERED crossing).
 * All three default to 0/undefined, and at those values every emitted vertex
 * is byte-identical to the pre-furniture painter.
 */
function paintZebra(
  acc: MeshAccumulator,
  at: Vec2,
  roadDir: Vec2,
  halfWidth: number,
  furniture: { islandHalfW?: number; skewDeg?: number; staggerM?: number } = {},
): number {
  // `skewDeg` is authored data and assertDistrict validates nothing about it,
  // so the 1/cos widening below has to be given a domain. At |skew| → 90° the
  // factor diverges: skewDeg 90 on a 16.25 m street asks for a 2.6e17 m span,
  // i.e. ~1.9e17 bars, and the loop below never returns — a world build that
  // hangs forever with no error, from ONE bad number in a map generator.
  // Clamped rather than refused on purpose: `runtime/zones` grades the crossing
  // off `paintsZebra`, which knows nothing about skew, so dropping the paint
  // would grade a пешеходна пътека the world never drew — this file's whole
  // complaint family, pointed the other way. MAX keeps the widening at 2×,
  // past which a „bar" is longer than two carriageways and is not a crossing.
  const { skew, step, count, start } = zebraBarLattice(halfWidth, furniture.skewDeg ?? 0);
  // THE CLAMP, not the raw authored half-width (O32). Unclamped, a kerb wide
  // enough to swallow the outermost bar deletes the whole пешеходна пътека
  // while `runtime/zones` — which grades off `paintsZebra`, i.e. off `kind` —
  // goes on convicting чл. 119 at it. `buildCrossingFurniture` raises its prism
  // from the SAME call, so the kerb shrinks with the gap and no bar is ever
  // painted under it. See `crossingIslandHalfWidthM` for the measurement.
  const islandHalfW = crossingIslandHalfWidthM(
    furniture.islandHalfW ?? 0,
    halfWidth,
    furniture.skewDeg ?? 0,
  );
  const stagger = furniture.staggerM ?? 0;
  const barDir = rotate(roadDir, skew);
  const r = perpRight(barDir);
  let painted = 0;
  for (let i = 0; i < count; i++) {
    const off = start + i * step;
    // The refuge island: no bar may be painted on the kerbed nose.
    if (islandHalfW > 0 && Math.abs(off) < islandHalfW + ZEBRA_STRIPE_ACROSS_M / 2) continue;
    // A STAGGERED crossing walks its far half further along the street; the
    // near half (right of the centreline, where the pedestrian starts on a
    // right-hand-drive street) stays where the crossing point is.
    const along = stagger !== 0 && off < 0 ? mul(roadDir, stagger) : ([0, 0] as Vec2);
    paintQuad(
      acc,
      add(add(at, mul(r, off)), along),
      barDir,
      ZEBRA_LENGTH_M / 2,
      ZEBRA_STRIPE_ACROSS_M / 2,
    );
    painted++;
  }
  return painted;
}

// ---------------------------------------------------------------------------
// Lane-intent arrows (meta.scenario.laneArrows — the SN-04 sc-ln-turn-lane-
// arrows drill + the rb-2lane roundabout approach). The arrows are META, not a
// data layer (doc 72 N3's lane-intent zone kind is still outstanding): the map
// generator authors edge(s) + travel bank + geometry-arclength span + per-lane
// arrow, the ScenarioSpec teaches from it, and this pass makes it VISIBLE —
// М10-style glyphs built procedurally (stem/bend quads + triangle heads, no
// textures) into the SAME markings accumulator. Painted LAST, so a district
// without the meta keeps byte-identical marking buffers.
//
// Frames: fromM/toM are arclength along the FULL edge geometry (the zone-solid
// frame above: line arclength = geometry arclength − (eb.trimFrom + 0.8)).
// `centerM` is the lane centre's offset from the centreline toward the RIGHT
// of the travelling bank's own forward (runtime/spatial.ts locator math), so
// one read serves either travelDir.
// ---------------------------------------------------------------------------

/** Glyph length along travel; sized against the 8.125 m perceptual lanes. */
const LANE_ARROW_LENGTH_M = 7.5;
/** Repeat spacing of glyph stations along the authored span. */
const LANE_ARROW_PITCH_M = 30;
const ARROW_STEM_W = 1.0;
const ARROW_HEAD_W = 2.6;
const ARROW_HEAD_L = 2.5;
const SQ2 = Math.SQRT1_2;

type ArrowGlyph = "through" | "left" | "right" | "throughRight";

/** Authored arrow vocab → painted glyph. Unknown vocab paints nothing (a
 *  future kind must add its glyph here, never crash a build). Roundabout
 *  vocab (rb-2lane): the outer lane serves the near exits (right + through),
 *  the inner lane the far exits / U-turn (reads as the left glyph). */
const ARROW_GLYPHS: Readonly<Record<string, ArrowGlyph>> = {
  through: "through",
  left: "left",
  right: "right",
  nearExits: "throughRight",
  farExits: "left",
};

/** One CCW quad in the glyph's local frame (u = right of travel, v = along
 *  travel, origin at the glyph centre). Triangle heads repeat the apex — the
 *  degenerate second tri keeps the markings mesh's 6-index-per-quad shape. */
type GlyphQuad = [Vec2, Vec2, Vec2, Vec2];

/** Rectangle stroke from `base` along unit `e` (local frame), CCW. */
function glyphStroke(base: Vec2, e: Vec2, lengthM: number, widthM: number): GlyphQuad {
  const pe: Vec2 = [e[1], -e[0]]; // perpRight in the local frame
  const a = add(base, mul(pe, -widthM / 2));
  const b = add(base, mul(pe, widthM / 2));
  return [a, b, add(b, mul(e, lengthM)), add(a, mul(e, lengthM))];
}

/** Arrowhead triangle (as a degenerate quad) pointing along unit `e`. */
function glyphHead(base: Vec2, e: Vec2, lengthM: number, halfWidthM: number): GlyphQuad {
  const pe: Vec2 = [e[1], -e[0]];
  const apex = add(base, mul(e, lengthM));
  return [add(base, mul(pe, -halfWidthM)), add(base, mul(pe, halfWidthM)), apex, apex];
}

/** The four glyphs, built once. Turn glyphs bend at 45° and stay inside the
 *  lane: max lateral reach ≈ 2.2 m against the 4.06 m half-lane. */
const GLYPH_QUADS: Readonly<Record<ArrowGlyph, readonly GlyphQuad[]>> = (() => {
  const half = LANE_ARROW_LENGTH_M / 2;
  const up: Vec2 = [0, 1];
  const through: GlyphQuad[] = [
    glyphStroke([0, -half], up, LANE_ARROW_LENGTH_M - ARROW_HEAD_L, ARROW_STEM_W),
    glyphHead([0, half - ARROW_HEAD_L], up, ARROW_HEAD_L, ARROW_HEAD_W / 2),
  ];
  const turn = (s: 1 | -1): GlyphQuad[] => {
    const diag: Vec2 = [s * SQ2, SQ2];
    return [
      glyphStroke([0, -half], up, half + 1.2, ARROW_STEM_W),
      glyphStroke([0, 1.2], diag, 1.7, ARROW_STEM_W),
      glyphHead(add([0, 1.2], mul(diag, 1.7)), diag, 1.35, 1.3),
    ];
  };
  const branch: Vec2 = [SQ2, SQ2];
  const throughRight: GlyphQuad[] = [
    ...through,
    glyphStroke([0, -0.8], branch, 1.5, 0.9),
    glyphHead(add([0, -0.8], mul(branch, 1.5)), branch, 1.2, 1.05),
  ];
  return { through, left: turn(-1), right: turn(1), throughRight };
})();

interface LaneArrowsAuthored {
  edgeIds: string[];
  travelDir: 1 | -1;
  fromM: number;
  toM: number;
  lanes: Array<{ centerM: number; glyph: ArrowGlyph }>;
}

/** Defensive read of meta.scenario.laneArrows (single edgeId or edgeIds[]).
 *  Anything malformed → null, and the whole pass is a no-op. */
function readLaneArrows(district: District): LaneArrowsAuthored | null {
  const sc = district.meta.scenario as { laneArrows?: Record<string, unknown> } | undefined;
  const la = sc?.laneArrows;
  if (!la || typeof la !== "object") return null;
  const edgeIds = Array.isArray(la.edgeIds)
    ? (la.edgeIds as unknown[]).filter((e): e is string => typeof e === "string")
    : typeof la.edgeId === "string"
      ? [la.edgeId]
      : [];
  const { fromM, toM } = la;
  if (edgeIds.length === 0) return null;
  if (typeof fromM !== "number" || typeof toM !== "number" || !(fromM < toM)) return null;
  const lanes: LaneArrowsAuthored["lanes"] = [];
  if (Array.isArray(la.lanes)) {
    for (const l of la.lanes as Array<Record<string, unknown> | null>) {
      const glyph = typeof l?.arrow === "string" ? ARROW_GLYPHS[l.arrow] : undefined;
      if (glyph && typeof l?.centerM === "number" && Number.isFinite(l.centerM)) {
        lanes.push({ centerM: l.centerM, glyph });
      }
    }
  }
  if (lanes.length === 0) return null;
  return { edgeIds, travelDir: la.travelDir === -1 ? -1 : 1, fromM, toM, lanes };
}

/** Paint every authored lane-intent glyph. Runs for ALL road classes (the
 *  rb-2lane arms are unclassified and paint no lane lines, yet the approach
 *  arrows are the whole lesson — the residential-осева precedent). */
function paintLaneArrows(acc: MeshAccumulator, district: District, network: RoadNetwork): number {
  const authored = readLaneArrows(district);
  if (!authored) return 0;
  const halfLen = LANE_ARROW_LENGTH_M / 2;
  let quads = 0;
  for (const edgeId of authored.edgeIds) {
    const eb = network.edgeById.get(edgeId);
    if (!eb?.line) continue;
    const line = trimPolyline(eb.line, 0.8, 0.8, 2.5);
    if (!line) continue;
    const s0 = eb.trimFrom + 0.8; // geometry arclength of line[0] (solids frame)
    const lineLen = polylineLength(line);
    // Stations walk the authored span at a fixed pitch; a station whose full
    // glyph falls off the junction-trimmed line is skipped, so the paint
    // clamps to the drawn extent exactly like the zone solids do.
    for (let sGeom = authored.fromM + halfLen; sGeom + halfLen <= authored.toM; sGeom += LANE_ARROW_PITCH_M) {
      const sLine = sGeom - s0;
      if (sLine - halfLen < 0 || sLine + halfLen > lineLen) continue;
      const at = pointAlong(line, sLine);
      const fwd = authored.travelDir === -1 ? mul(at.tangent, -1) : at.tangent;
      const right = perpRight(fwd);
      for (const lane of authored.lanes) {
        const origin = add(at.point, mul(right, lane.centerM));
        for (const q of GLYPH_QUADS[lane.glyph]) {
          const idx = [0, 0, 0, 0];
          for (let i = 0; i < 4; i++) {
            const [u, v] = q[i] as Vec2;
            const p = add(add(origin, mul(right, u)), mul(fwd, v));
            idx[i] = acc.vertex(toWorld(p[0], p[1], MARKING_Y), UP, [
              i === 1 || i === 2 ? 1 : 0,
              i >= 2 ? 1 : 0,
            ]);
          }
          acc.quad(idx[0] as number, idx[1] as number, idx[2] as number, idx[3] as number);
          quads++;
        }
      }
    }
  }
  return quads;
}

// ---------------------------------------------------------------------------
// Painted zone-speed numerals (founder R3 doc 62 #33/#34: the 30-zone drills
// show NO „30" anywhere, and the sign kit ships no В26-30 face — placing the
// 50 face would lie, so the HONEST render stopgap is the road glyph BG zone
// streets actually paint). Procedural seven-segment digits in the same
// markings accumulator — the lane-arrow precedent: no textures, painted last,
// and a map without a qualifying edge keeps byte-identical marking buffers.
//
// Qualifying edge (deliberately narrow — blast-radius discipline):
//   - scenario micro-map (meta.mapKind "scenario-*"; city/exam/полигон never
//     change), AND the edge's maxspeed is TAGGED at a zone speed (<= 30), AND
//   - the edge carries the B1a legality `zone` tag (sp-trans/pe-school school,
//     pe-zone residential — the signed-zone edges), OR the map is a
//     straight-street archetype whose long street IS the zone (sp-zone30's
//     360 m / vu-child's 300 m; the >= 150 m gate keeps 90 m driveway stubs
//     like pk-drive paint-free), AND
//   - every digit of the limit has a glyph (0/2/3 cover the legal 20/30).
// ---------------------------------------------------------------------------

/** Seven-segment rectangles in a unit digit box (x right, y along travel),
 *  as [x0, y0, x1, y1] fractions. s = stroke fraction of the box width. */
type Seg7 = "A" | "B" | "C" | "D" | "E" | "F" | "G";
const SEG7_DIGITS: Readonly<Record<string, readonly Seg7[]>> = {
  "0": ["A", "B", "C", "D", "E", "F"],
  "2": ["A", "B", "G", "E", "D"],
  "3": ["A", "B", "C", "D", "G"],
};

/** One digit's segment quads in LOCAL meters (u right, v along travel, origin
 *  at the digit's bottom-left). Emitted per station — cheap (<= 6 quads). */
function digitSegmentRects(ch: string): Array<[number, number, number, number]> {
  const segs = SEG7_DIGITS[ch];
  if (!segs) return [];
  const w = SPEED_GLYPH_DIGIT_W_M;
  const h = SPEED_GLYPH_DIGIT_H_M;
  const t = SPEED_GLYPH_STROKE_M;
  const rects: Record<Seg7, [number, number, number, number]> = {
    A: [0, h - t, w, h],
    B: [w - t, h / 2, w, h],
    C: [w - t, 0, w, h / 2],
    D: [0, 0, w, t],
    E: [0, 0, t, h / 2],
    F: [0, h / 2, t, h],
    G: [0, h / 2 - t / 2, w, h / 2 + t / 2],
  };
  return segs.map((s) => rects[s]);
}

/** Does the district's meta say "scenario micro-map"? (zoneSigns.ts twin.) */
function isScenarioMap(district: District): boolean {
  const mapKind = district.meta.mapKind;
  return typeof mapKind === "string" && mapKind.startsWith("scenario");
}

/** Paint the numeral stations for every qualifying zone edge. */
function paintSpeedGlyphs(acc: MeshAccumulator, district: District, network: RoadNetwork): number {
  if (!isScenarioMap(district)) return 0;
  const scenario = district.meta.scenario as { archetype?: unknown } | undefined;
  const straightStreet = scenario?.archetype === "straight-street";
  let quads = 0;

  for (const eb of network.edges) {
    const edge = eb.edge;
    if (!eb.line) continue;
    if (edge.maxspeedSource !== "tag" || edge.maxspeed > SPEED_GLYPH_MAX_KMH) continue;
    const zoneTagged = edge.zone !== undefined;
    const wholeStreetZone = straightStreet && edge.length >= SPEED_GLYPH_MIN_EDGE_M;
    if (!zoneTagged && !wholeStreetZone) continue;
    const digits = String(edge.maxspeed).split("");
    if (!digits.every((d) => SEG7_DIGITS[d])) continue; // no glyph → no paint

    const line = trimPolyline(eb.line, 0.8, 0.8, 2.5);
    if (!line) continue;
    const lineLen = polylineLength(line);
    const travelHalf = eb.halfWidth - eb.parkingM;
    // Curb-lane centre of each bank (the driver's own lane).
    const laneCenter = Math.max(LANE_WIDTH_M / 2, travelHalf - LANE_WIDTH_M / 2);
    const glyphLen = SPEED_GLYPH_DIGIT_H_M;
    const totalW = digits.length * SPEED_GLYPH_DIGIT_W_M + (digits.length - 1) * SPEED_GLYPH_DIGIT_GAP_M;

    // One station run per travel bank (forward always; reverse on two-way).
    for (const bank of edge.oneway ? [1] : [1, -1]) {
      for (let s = SPEED_GLYPH_INSET_M; s + glyphLen <= lineLen - 2; s += SPEED_GLYPH_PITCH_M) {
        // Station base at the driver's near end: forward bank at arclength s
        // (glyph spans [s, s+len]); reverse bank at lineLen−s (glyph spans
        // [lineLen−s−len, lineLen−s] along its own travel direction).
        const at = pointAlong(line, bank === 1 ? s : lineLen - s);
        // The glyph's BASE faces its own approaching driver: v runs along the
        // bank's travel direction, u right of it — digits read upright.
        const fwd = bank === 1 ? at.tangent : mul(at.tangent, -1);
        const right = perpRight(fwd); // flips with fwd → each bank's own right
        const base = add(at.point, mul(right, laneCenter));
        for (let d = 0; d < digits.length; d++) {
          const u0 = -totalW / 2 + d * (SPEED_GLYPH_DIGIT_W_M + SPEED_GLYPH_DIGIT_GAP_M);
          for (const [x0, y0, x1, y1] of digitSegmentRects(digits[d]!)) {
            const corners: Vec2[] = [
              [u0 + x0, y0],
              [u0 + x1, y0],
              [u0 + x1, y1],
              [u0 + x0, y1],
            ];
            const idx = corners.map(([u, v], i) => {
              const p = add(add(base, mul(right, u)), mul(fwd, v));
              return acc.vertex(toWorld(p[0], p[1], MARKING_Y), UP, [
                i === 1 || i === 2 ? 1 : 0,
                i >= 2 ? 1 : 0,
              ]);
            });
            acc.quad(idx[0]!, idx[1]!, idx[2]!, idx[3]!);
            quads++;
          }
        }
      }
    }
  }
  return quads;
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
  let giveWayTriangles = 0;

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
    //
    // T16 (founder item 46): the осева is the boundary at off ≈ 0 on a TWO-WAY
    // edge — the one line on the carriageway with oncoming traffic behind it —
    // and it is painted at CENTER_LINE_WIDTH_M so the student can tell it from
    // the same-direction dividers he may legally cross. Dash rhythm is
    // untouched, so the quad COUNT of every already-marked district is
    // unchanged: only the stroke of the middle line moves.
    for (let k = 1; k < lanes; k++) {
      const off = -travelHalf + k * LANE_WIDTH_M;
      if (Math.abs(off) > travelHalf - 0.4) continue;
      const isCentreLine = !eb.edge.oneway && Math.abs(off) < 1e-6;
      const width = isCentreLine ? CENTER_LINE_WIDTH_M : DASH_WIDTH_M;
      const offLine = offsetPolyline(line, off);
      const ex = suppress.get(k);
      markingQuads += ex
        ? paintDashedLineExcluding(acc, offLine, width, ex)
        : paintDashedLine(acc, offLine, width);
    }
    if (EDGE_LINE_CLASSES.has(eb.edge.class)) {
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
        markingQuads += paintStopLine(acc, ap, false);
        stopLines++;
      } else if (giveWayEdges.has(`${node.id}:${ap.edgeId}`)) {
        markingQuads += paintStopLine(acc, ap, true);
        stopLines++;
        // …and the М18 symbol the М7 line is allowed to carry. Painted here,
        // next to the line it belongs to, so the pair can never be placed by
        // two different derivations.
        const tris = paintGiveWayTriangles(acc, ap);
        giveWayTriangles += tris;
        markingQuads += tris;
      }
    }
  }

  // -- zebra crossings ---------------------------------------------------------
  // `paintsZebra` is this loop's own condition, lifted into constants.ts so the
  // grader (runtime/zones.ts) asks the painter instead of guessing (doc 86 T1).
  for (const crossing of district.crossings) {
    if (!crossing.edgeId) continue;
    if (!paintsZebra(crossing)) continue;
    const eb = network.edgeById.get(crossing.edgeId);
    if (!eb) continue;
    const proj = projectOntoPolyline(eb.edge.geometry as Vec2[], [crossing.x, crossing.y]);
    if (proj.distance > 25) continue; // data glitch guard
    const bars = paintZebra(acc, proj.point, proj.tangent, eb.halfWidth, {
      islandHalfW: crossing.island ? crossing.island.widthM / 2 : 0,
      skewDeg: crossing.skewDeg ?? 0,
      staggerM: crossing.staggerM ?? 0,
    });
    markingQuads += bars;
    // COUNT THE PAINT, NOT THE VISIT. This read `zebraCrossings++`, one line
    // below a `markingQuads +=` that was already spending paintZebra's RETURN
    // VALUE — so the same call answered two questions and only one of them was
    // listened to. `WorldStats.zebraCrossings` is the number ~70 district
    // batteries read as „this world has N зебри"; incremented per crossing
    // VISITED it is a counter THAT CANNOT FALL WHEN THE PAINT DISAPPEARS, which
    // is the one event it exists to report. The audit's own complaint family —
    // „the lesson names a marking the world does not have" — is exactly what
    // this number would have had to stay silent about.
    //
    // THE ISLAND ZERO IS NOW UNREACHABLE (O32, 2026-08-19), and this line is
    // what proves it rather than what works around it. `count` is floored at 2
    // and only the island `continue` can skip a bar, so `bars === 0` required an
    // `islandHalfW` past the OUTERMOST bar offset — reachable in one authored
    // number, because `assertDistrict` is the cheap seam guard, not a schema
    // validator. `crossingIslandHalfWidthM` now clamps that half-width below the
    // outermost bar, and `buildCrossingFurniture` raises its prism from the SAME
    // call, so the kerb shrinks with the gap instead of covering paint.
    //
    // WHAT IT COST BEFORE, measured end to end on the §7 fixture (16.25 m
    // residential street, `kind: "marked"`, `island.widthM = 14`): the crossing
    // added 0 marking vertices — and `CrossingZoneTracker` still built its zone,
    // and `reduceTick` still billed the 10-point опасна
    // PEDESTRIAN_CROSSING_TOO_FAST. чл. 119 at a пешеходна пътека the world
    // never drew: the founder's own roundabout complaint pointed at a zebra.
    // `runtime/zones` grades off `gradesCrossingDuty` → `paintsZebra`, which
    // reads `kind` and knows nothing about bars, so the painter is the only
    // side that could close it without loosening a duty — and loosening it
    // would delete «Непропускане на пешеходец», the false-certificate direction
    // of the same crime.
    //
    // The guard stays, and stays load-bearing in the other direction: it is what
    // keeps `zebraCrossings` — the number ~70 district batteries read as „this
    // world has N зебри" — a count of PAINT rather than of visits, so it can
    // still fall if any future furniture field learns to swallow a bar.
    // markings-paint-truth.test.ts §7a sweeps every island width and fails both
    // if this becomes `zebraCrossings++` and if the clamp is removed; §7d drives
    // the grader against the painter and fails if they ever disagree again.
    //
    // MEASURED on the committed corpus: three crossings in 105 districts author
    // an island at all — pe-bus 2.0 m, pe-cane 2.2 m, pe-slow 2.4 m, every one
    // on a ~16.25 m street (rx-tram-island-v1's „island" is a tram platform, not
    // a crossing refuge) — all three sit far under the 6.6 m bound, so no
    // marking or sidewalk buffer moves a byte and no battery's number changes.
    if (bars > 0) zebraCrossings++;
  }

  // -- parking bays (lesson-authored, doc 68 A5) -------------------------------
  for (const bay of parkingBays) {
    markingQuads += paintParkingBay(acc, bay);
  }

  // -- zone-authored solids (М1 осева + bus/emergency curb seams) --------------
  markingQuads += paintZoneSolids(acc, district, network);

  // -- lane-intent arrows (meta.scenario.laneArrows) — LAST, so a district
  //    without the meta keeps byte-identical marking buffers ------------------
  const laneArrowQuads = paintLaneArrows(acc, district, network);
  markingQuads += laneArrowQuads;

  // -- painted zone-speed numerals („30"/„20" glyphs, founder R3 #33/#34) —
  //    appended after everything, so any map without a qualifying zone edge
  //    keeps byte-identical marking buffers -----------------------------------
  const speedGlyphQuads = paintSpeedGlyphs(acc, district, network);
  markingQuads += speedGlyphQuads;

  return {
    markings: acc,
    markingQuads,
    stopLines,
    zebraCrossings,
    parkingBays: parkingBays.length,
    laneArrowQuads,
    speedGlyphQuads,
    giveWayTriangles,
  };
}

// ---------------------------------------------------------------------------
// CROSSING FURNITURE — doc 87 B50 / B53 / B54.
//
// The register's refusal, in his own words about six consecutive pedestrian
// lessons: „same map, same engineering, everything same … already 5-6
// different questions". Six axes of variety had already been authored into
// tools/maps/gen_pe_crossings.mjs — streetscape, roadscape, terminus,
// nearfield, carriageway, class — and the sheet still read as one street,
// because every one of them acts BESIDE the road or PAST the end of the drive.
//
// The one thing none of them could touch is THE CROSSING ITSELF, and the
// reason was structural, not aesthetic: `DistrictCrossing` was
// `{id, x, y, kind, signalized, edgeId}`. A median, a refuge island, a raised
// table, a staggered or an angled crossing was not expressible in district-v1
// AT ALL. Nor could one be faked with a building —
// `cityBuildings.DATA_HEIGHT_MIN_M` clamps every authored volume up to 3 m, so
// a 0.3 m island renders as a WALL ACROSS THE ROAD.
//
// This pass builds what the new fields describe:
//   - the REFUGE ISLAND / median nose, as a kerbed prism into the SIDEWALK
//     mesh — which is also the kerb collider, so a car cannot mount it (the
//     construction the roundabout central island already uses) — plus the
//     М-hatch band painted around its foot;
//   - the RAISED TABLE ramp bands (chevron teeth on both approaches and the
//     plateau edge lines).
//
// WHAT IT DELIBERATELY DOES NOT DO, and why the graded geometry is safe:
//   - it never moves `crossing.x`/`y`, which is the ONLY thing
//     `runtime/zones.CrossingZoneTracker` derives the graded zone from;
//   - it never changes any edge width, lane count or centreline, so every lane
//     centre (x = ±4.06 on a two-lane perceptual street) is where it was and
//     every committed trace still drives its own rail. A 2.4 m island (±1.2 m)
//     leaves 2.86 m between its kerb and the driven rail;
//   - the table is PAINT, not displacement: the ribbon mesh and the ground
//     collider come from the same vertices, and lifting one without the other
//     is how a car drives through tarmac.
// ---------------------------------------------------------------------------

/** Island kerb chamfer — the sidewalk profile own value. */
const ISLAND_CHAMFER_M = CURB_CHAMFER_M;
/** Length of the island tapered nose at each end, m. */
const ISLAND_NOSE_M = 1.6;
/** White hatch band painted around the island foot. */
const ISLAND_HATCH_W_M = 0.35;
/** Ramp-band chevron tooth: base across the road, length along it. */
const TABLE_TOOTH_BASE_M = 0.55;
const TABLE_TOOTH_LEN_M = 0.8;
/** Gap between ramp-band teeth, m. */
const TABLE_TOOTH_GAP_M = 0.55;

export interface CrossingFurnitureResult {
  /** Kerbed refuge islands built into the sidewalk mesh (and its collider). */
  islands: number;
  /** Raised-table ramp bands painted (2 per table — one per approach). */
  tableRamps: number;
  /** Quads added to the SIDEWALK mesh by the island prisms. */
  islandQuads: number;
  /** Quads added to the MARKINGS mesh (hatch + ramp teeth + plateau lines). */
  furnitureQuads: number;
}

/** One island footprint ring, district space, CCW: a rectangle tapered at both
 *  ends so the nose reads as a nose and not as a kerbed box. `s` runs along the
 *  road (toward the departure side), `t` across it (to the right). */
function islandRing(at: Vec2, roadDir: Vec2, halfW: number, backM: number, fwdM: number): Vec2[] {
  const r = perpRight(roadDir);
  const nose = Math.min(ISLAND_NOSE_M, backM * 0.6, fwdM * 0.6);
  const p = (s: number, t: number): Vec2 => add(add(at, mul(roadDir, s)), mul(r, t));
  return [
    p(-backM, 0),
    p(-backM + nose, halfW),
    p(fwdM - nose, halfW),
    p(fwdM, 0),
    p(fwdM - nose, -halfW),
    p(-backM + nose, -halfW),
  ];
}

/** Kerbed prism from `ring`: vertical face ROAD_Y→top, 45° chamfer, flat top.
 *  Emitted into the SIDEWALK accumulator, which is also the kerb collider. */
function buildIslandPrism(acc: MeshAccumulator, ring: Vec2[]): number {
  const n = ring.length;
  const topY = SIDEWALK_TOP_Y;
  const chamferY = topY - ISLAND_CHAMFER_M;
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p[0];
    cy += p[1];
  }
  cx /= n;
  cy /= n;
  let quads = 0;
  const footIdx: number[] = [];
  const midIdx: number[] = [];
  const topIdx: number[] = [];
  const topFan: number[] = [];
  const foot: [number, number, number] = [CURB_FOOT_TINT, CURB_FOOT_TINT, CURB_FOOT_TINT];
  for (let i = 0; i < n; i++) {
    const p = ring[i] as Vec2;
    const outward = norm([p[0] - cx, p[1] - cy]);
    const nOut: [number, number, number] = [outward[0], 0, -outward[1]];
    const inset: Vec2 = [
      p[0] - outward[0] * ISLAND_CHAMFER_M,
      p[1] - outward[1] * ISLAND_CHAMFER_M,
    ];
    footIdx.push(acc.vertex(toWorld(p[0], p[1], ROAD_Y), nOut, [0, 0], foot));
    midIdx.push(acc.vertex(toWorld(p[0], p[1], chamferY), nOut, [0.07, 0]));
    topIdx.push(acc.vertex(toWorld(inset[0], inset[1], topY), UP, [0.1, 0]));
    topFan.push(acc.vertex(toWorld(inset[0], inset[1], topY), UP, [inset[0] * 0.2, inset[1] * 0.2]));
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    acc.quad(footIdx[i]!, footIdx[j]!, midIdx[j]!, midIdx[i]!);
    acc.quad(midIdx[i]!, midIdx[j]!, topIdx[j]!, topIdx[i]!);
    quads += 2;
  }
  // Flat top as a fan from vertex 0 — the ring is convex by construction.
  for (let i = 1; i < n - 1; i++) acc.tri(topFan[0]!, topFan[i]!, topFan[i + 1]!);
  quads += n - 2;
  return quads;
}

/** White hatch band hugging the island foot — what a driver reads as „solid
 *  object ahead" long before the kerb itself resolves. */
function paintIslandHatch(acc: MeshAccumulator, ring: Vec2[]): number {
  let quads = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Vec2;
    const b = ring[(i + 1) % ring.length] as Vec2;
    const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
    const l = Math.hypot(d[0], d[1]);
    if (l < 1e-3) continue;
    const dir: Vec2 = [d[0] / l, d[1] / l];
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // Painted OUTSIDE the kerb line: a quad under an opaque prism is a quad
    // nobody ever sees.
    const c = add(mid, mul(perpRight(dir), -ISLAND_HATCH_W_M / 2));
    paintQuad(acc, c, dir, l / 2, ISLAND_HATCH_W_M / 2);
    quads++;
  }
  return quads;
}

/** One ramp band of a raised table: the plateau transverse edge line plus a row
 *  of triangle teeth across the road. `sign` = +1 departure, −1 approach. */
function paintTableRamp(
  acc: MeshAccumulator,
  at: Vec2,
  roadDir: Vec2,
  halfWidth: number,
  rampM: number,
  sign: 1 | -1,
): number {
  const r = perpRight(roadDir);
  const edge = add(at, mul(roadDir, sign * (ZEBRA_LENGTH_M / 2 + 0.4)));
  paintQuad(acc, edge, roadDir, STOP_LINE_WIDTH_M / 2, halfWidth - 0.25);
  let quads = 1;
  const step = TABLE_TOOTH_BASE_M + TABLE_TOOTH_GAP_M;
  const span = halfWidth * 2 - 0.5;
  const count = Math.max(2, Math.floor(span / step));
  const start = -((count - 1) * step) / 2;
  const toothLen = Math.min(TABLE_TOOTH_LEN_M, Math.max(0.4, rampM * 0.6));
  const base = add(edge, mul(roadDir, sign * (rampM - toothLen / 2)));
  for (let i = 0; i < count; i++) {
    const c = add(base, mul(r, start + i * step));
    const tip = add(c, mul(roadDir, -sign * toothLen));
    const l = add(c, mul(r, -TABLE_TOOTH_BASE_M / 2));
    const rr = add(c, mul(r, TABLE_TOOTH_BASE_M / 2));
    const ia = acc.vertex(toWorld(l[0], l[1], MARKING_Y), UP, [0, 0]);
    const ib = acc.vertex(toWorld(rr[0], rr[1], MARKING_Y), UP, [1, 0]);
    const ic = acc.vertex(toWorld(tip[0], tip[1], MARKING_Y), UP, [0.5, 1]);
    // District-CCW winding (mesh.ts) — flipped for the far-side band.
    if (sign === 1) acc.tri(ia, ib, ic);
    else acc.tri(ia, ic, ib);
    quads++;
  }
  return quads;
}

/**
 * Build every crossing furniture item the district authors. Runs AFTER
 * buildMarkings and BEFORE the decal pass, so road wear keeps out from under
 * the new paint exactly as it does for every other marking (decals.ts
 * MarkingKeepOut reads the markings mesh, which this pass has already grown).
 *
 * A district whose crossings carry no furniture fields adds ZERO vertices to
 * either mesh — the additive contract every builder pass here holds.
 */
export function buildCrossingFurniture(
  district: District,
  network: RoadNetwork,
  meshes: { sidewalks: MeshAccumulator; markings: MeshAccumulator },
): CrossingFurnitureResult {
  let islands = 0;
  let tableRamps = 0;
  let islandQuads = 0;
  let furnitureQuads = 0;
  for (const crossing of district.crossings) {
    if (!crossing.edgeId) continue;
    const eb = network.edgeById.get(crossing.edgeId);
    if (!eb) continue;
    const island = crossing.island;
    const rampM = crossing.tableRampM ?? 0;
    if ((!island || island.widthM <= 0) && rampM <= 0) continue;
    const proj = projectOntoPolyline(eb.edge.geometry as Vec2[], [crossing.x, crossing.y]);
    if (proj.distance > 25) continue; // same data-glitch guard as the zebra
    if (island && island.widthM > 0) {
      // THE SAME CLAMP THE BARS READ (O32) — one call, two consumers, so the
      // kerb can never be wider than the gap the zebra left for it. Reading the
      // raw `island.widthM` here was the half of the defect that made clamping
      // the bars alone unsafe: paint forced back onto the road would be drawn
      // UNDER the prism, which is the very thing paintZebra's island skip
      // exists to prevent. All three shipped islands are far inside the bound,
      // so every committed sidewalk and marking buffer is byte-identical.
      const ring = islandRing(
        proj.point,
        proj.tangent,
        crossingIslandHalfWidthM(island.widthM / 2, eb.halfWidth, crossing.skewDeg ?? 0),
        Math.max(1, island.approachM),
        Math.max(1, island.departM),
      );
      furnitureQuads += paintIslandHatch(meshes.markings, ring);
      islandQuads += buildIslandPrism(meshes.sidewalks, ring);
      islands++;
    }
    if (rampM > 0) {
      const { point, tangent } = proj;
      furnitureQuads += paintTableRamp(meshes.markings, point, tangent, eb.halfWidth, rampM, -1);
      furnitureQuads += paintTableRamp(meshes.markings, point, tangent, eb.halfWidth, rampM, 1);
      tableRamps += 2;
    }
  }
  return { islands, tableRamps, islandQuads, furnitureQuads };
}
