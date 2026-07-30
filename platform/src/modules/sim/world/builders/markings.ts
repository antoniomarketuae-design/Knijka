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
  ARTERIAL_CLASSES,
  BUS_LANE_SEAM_WIDTH_M,
  CENTER_LINE_WIDTH_M,
  DASH_GAP_M,
  DASH_LENGTH_M,
  DASH_WIDTH_M,
  EDGE_LINE_INSET_M,
  EDGE_LINE_WIDTH_M,
  EMERGENCY_LANE_SEAM_WIDTH_M,
  MARKED_CLASSES,
  MARKING_Y,
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
      // its curb side. Only on hosts that paint no edge line of their own —
      // mw-v1 is `motorway`, deliberately outside ARTERIAL_CLASSES (no street
      // furniture on a motorway), so it had literally nothing on the outside.
      // On the `primary` motorway maps (mw-entry/mw-exit) the arterial pass
      // already draws that line, and a second one would just double it.
      const outerW = emergency && !ARTERIAL_CLASSES.has(eb.edge.class) ? EDGE_LINE_WIDTH_M : 0;
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
  };
}
