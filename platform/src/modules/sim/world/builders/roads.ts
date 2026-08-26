/**
 * Road geometry: asphalt ribbons swept along trimmed edge centerlines,
 * junction fan patches stitched to the exact ribbon cut cross-sections, and
 * raised sidewalks (curb face + walkway + outer skirt) with corner aprons
 * around junction corners.
 *
 * Asphalt/junction UVs are planar (district xy / scale) so the texture is
 * seamless across ribbons and patches.
 *
 * Winding rule used throughout (see mesh.ts): triangles wound CCW in
 * district space face UP after world mapping; a vertical wall emitted as
 * (b0, b1, t1, t0) along travel direction faces the RIGHT of travel.
 */

import {
  CURB_CHAMFER_M,
  CURB_FOOT_TINT,
  GUTTER_BAND_M,
  GUTTER_TINT,
  JUNCTION_Y,
  LANE_WIDTH_M,
  PARKING_LANE_END_INSET_M,
  PARKING_LANE_Y,
  ROAD_Y,
  SIDEWALK_CLASSES,
  sidewalkEndInsetM,
  SIDEWALK_SKIRT_M,
  SIDEWALK_SKIRT_TINT,
  SIDEWALK_TOP_Y,
  SIDEWALK_WIDTH_M,
  WHEEL_TRACK_BAND_HALF_M,
  WHEEL_TRACK_OFFSET_M,
  WHEEL_TRACK_TINT,
} from "./constants";
import {
  add,
  dist,
  mul,
  norm,
  polylineFrames,
  polylineLength,
  sub,
  trimPolyline,
  type Vec2,
} from "./math2d";
import { MeshAccumulator, toWorld, UP } from "./mesh";
import { isBareVergeSide, type NodeInfo, type RoadNetwork } from "./network";
import type { District } from "../types";
import {
  clipIntoRingBoundary,
  clipOutOfIslands,
  hasOuterKerb,
  islandContaining,
  ringAtPoint,
  ringMouthKerbRuns,
  ringOuterKerbRuns,
  ringOutwardSide,
  type RoundaboutRing,
} from "./roundabout";

const ASPHALT_UV_SCALE = 1 / 7; // planar meters -> uv
const SIDEWALK_UV_SCALE = 1 / 2;

export interface RoadBuildResult {
  surface: MeshAccumulator;
  junctions: MeshAccumulator;
  sidewalks: MeshAccumulator;
  /** Tinted curbside parking bands on arterial edges (doc 68 QW3). */
  parkingLanes: MeshAccumulator;
  ribbonCount: number;
  skippedRibbonCount: number;
  junctionPatchCount: number;
  sidewalkStripCount: number;
  parkingLaneStripCount: number;
  /** FR-22, the outer half: mouth-free arcs of circular ring kerb swept. */
  ringKerbRunCount: number;
  /** B16: kerb returns swept — the fillet + straight that carries the boundary
   *  from the ring's outer edge into each arm's own kerb, so a mouth is a gap
   *  in the CIRCLE rather than a gap in the KERB. Two per arm. */
  ringReturnRunCount: number;
  /** Ring edges whose junction-trimmed stub strip the circle replaced. */
  skippedRingStripCount: number;
}

const planarUV = (p: Vec2): [number, number] => [p[0] * ASPHALT_UV_SCALE, p[1] * ASPHALT_UV_SCALE];

// ---------------------------------------------------------------------------
// Ribbons
// ---------------------------------------------------------------------------

/** One lateral station of the ribbon cross-section: offset from the
 *  centreline (negative = left of travel) + a baked luminance multiplier. */
export interface RibbonSectionVertex {
  offset: number;
  tint: number;
}

/**
 * Ribbon cross-section stations with baked wear (doc 71 §4.4, free at
 * runtime): per travel lane, two darker wheel-track bands (soft-edged — a
 * ×WHEEL_TRACK_TINT vertex framed by full-bright vertices one band-half
 * away), plus a grime gutter band at each outer ribbon edge. The parking
 * band region [travelHalf, halfWidth] stays clean — the tinted parkingLanes
 * mesh covers it on arterials. Exported for tests.
 */
export function ribbonCrossSection(
  halfWidth: number,
  parkingM: number,
  lanes: number,
): RibbonSectionVertex[] {
  const travelHalf = halfWidth - parkingM;
  const stations: RibbonSectionVertex[] = [
    { offset: -halfWidth, tint: GUTTER_TINT },
    { offset: -halfWidth + GUTTER_BAND_M, tint: 1 },
    { offset: halfWidth - GUTTER_BAND_M, tint: 1 },
    { offset: halfWidth, tint: GUTTER_TINT },
  ];
  const n = Math.max(1, lanes);
  for (let k = 0; k < n; k++) {
    const laneCenter = -travelHalf + (k + 0.5) * LANE_WIDTH_M;
    if (laneCenter + WHEEL_TRACK_OFFSET_M > travelHalf) break; // clamp mismatch
    for (const side of [-1, 1]) {
      const track = laneCenter + side * WHEEL_TRACK_OFFSET_M;
      stations.push(
        { offset: track - WHEEL_TRACK_BAND_HALF_M, tint: 1 },
        { offset: track, tint: WHEEL_TRACK_TINT },
        { offset: track + WHEEL_TRACK_BAND_HALF_M, tint: 1 },
      );
    }
  }
  // Sort left -> right, clamp into the ribbon, merge near-coincident
  // stations (keep the darker tint so wear never vanishes on thin roads).
  stations.sort((a, b) => a.offset - b.offset);
  const out: RibbonSectionVertex[] = [];
  for (const s of stations) {
    const offset = Math.max(-halfWidth, Math.min(halfWidth, s.offset));
    const prev = out[out.length - 1];
    if (prev && offset - prev.offset < 0.15) {
      prev.tint = Math.min(prev.tint, s.tint);
      continue;
    }
    out.push({ offset, tint: s.tint });
  }
  // Guarantee exact edges (clamping/merging kept them; be defensive).
  out[0]!.offset = -halfWidth;
  out[out.length - 1]!.offset = halfWidth;
  return out;
}

function buildRibbon(
  acc: MeshAccumulator,
  line: Vec2[],
  halfWidth: number,
  section: RibbonSectionVertex[],
): void {
  const frames = polylineFrames(line);
  let prev: number[] = [];
  const cur: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i] as Vec2;
    const f = frames[i]!;
    cur.length = 0;
    for (const s of section) {
      const q = add(p, mul(f.right, s.offset * f.miter));
      cur.push(
        acc.vertex(toWorld(q[0], q[1], ROAD_Y), UP, planarUV(q), [s.tint, s.tint, s.tint]),
      );
    }
    if (i > 0) {
      // Same winding as the old 2-vertex ribbon: (prevL, prevR, curR, curL)
      // per adjacent station pair, CCW seen from above.
      for (let j = 0; j + 1 < cur.length; j++) {
        acc.quad(prev[j]!, prev[j + 1]!, cur[j + 1]!, cur[j]!);
      }
    }
    prev = [...cur];
  }
}

/**
 * One tinted parking band along `line`, spanning lateral offsets
 * [halfWidth - parkingM, halfWidth] on `side` (+1 right of travel, -1 left).
 * Sits a hair above the asphalt ribbon (which already covers this width), so
 * the band reads as a distinct parking strip without any extra cross-section
 * math. UVs are planar and share the asphalt scale.
 */
function buildParkingBand(
  acc: MeshAccumulator,
  line: Vec2[],
  halfWidth: number,
  parkingM: number,
  side: 1 | -1,
): void {
  const frames = polylineFrames(line);
  let prevI = -1;
  let prevO = -1;
  for (let i = 0; i < line.length; i++) {
    const p = line[i] as Vec2;
    const f = frames[i]!;
    const out = mul(f.right, side * f.miter);
    const inner = add(p, mul(out, halfWidth - parkingM));
    const outer = add(p, mul(out, halfWidth));
    const ii = acc.vertex(toWorld(inner[0], inner[1], PARKING_LANE_Y), UP, planarUV(inner));
    const oi = acc.vertex(toWorld(outer[0], outer[1], PARKING_LANE_Y), UP, planarUV(outer));
    if (i > 0) {
      // CCW seen from above: order depends on which side of travel we're on.
      if (side === 1) acc.quad(prevI, prevO, oi, ii);
      else acc.quad(prevO, prevI, ii, oi);
    }
    prevI = ii;
    prevO = oi;
  }
}

// ---------------------------------------------------------------------------
// Junction patches
// ---------------------------------------------------------------------------

/** Corner arc points between two consecutive approach cross-section ends. */
function cornerArc(node: NodeInfo, from: Vec2, to: Vec2): Vec2[] {
  const c = node.pos;
  const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
  let a1 = Math.atan2(to[1] - c[1], to[0] - c[0]);
  while (a1 <= a0) a1 += Math.PI * 2;
  const sweep = a1 - a0;
  if (sweep >= Math.PI * 1.6) return []; // open side of a T/dead-end — no arc
  const r0 = dist(from, c);
  const r1 = dist(to, c);
  const steps = Math.min(5, Math.max(1, Math.round(sweep / 0.45)));
  const pts: Vec2[] = [];
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const ang = a0 + sweep * t;
    const r = r0 + (r1 - r0) * t;
    pts.push([c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r]);
  }
  return pts;
}

export interface JunctionPatch {
  /** CCW boundary of the patch polygon. */
  ring: Vec2[];
  /** Per-corner arc runs: inner boundary points between approach i and i+1. */
  corners: { inner: Vec2[]; hasArc: boolean; insideIsland: boolean; outsideRing: boolean }[];
}

/**
 * Fan-fill the open junction area. The polygon walks the approaches in CCW
 * order using their EXACT ribbon cut points (right then left of each
 * outgoing direction), with rounded corner arcs in between. Star-shaped
 * around the node, so a center fan triangulates it.
 *
 * ROUNDABOUTS (founder: „a Round a bout is a Cyrcle"). At an arm↔ring joint the
 * open radius is the ARM's — on rb-mini that is 17.1 m against an 18 m ring, so
 * four pads reach to within a metre of the centre and union into one open
 * plaza. That plaza IS the square the founder saw. Every boundary point that
 * falls inside a registered central island is therefore pushed radially out
 * onto the island's kerb line: what is left of the pad is the annular
 * carriageway between the kerb and the outside, and the middle stops being
 * asphalt at all. Nodes with no island nearby keep byte-identical geometry —
 * `clipOutOfIslands` returns points outside every island untouched.
 */
function buildJunctionPatch(
  acc: MeshAccumulator,
  node: NodeInfo,
  rings: readonly RoundaboutRing[],
): JunctionPatch | null {
  const aps = node.approaches;
  if (aps.length < 2) return null;
  const ring: Vec2[] = [];
  const corners: JunctionPatch["corners"] = [];
  // FR-22, the outer half. `ownRing` is non-null ONLY at a node that stands on
  // a circulatory carriageway, so the outer clip can never reach a junction
  // that has nothing to do with the roundabout. Boundary points are pulled back
  // onto the ring's drawn edge — probed at up to +10.73 m past it off the
  // mouths and +55.7 m inside one before this line existed, which is the flare
  // that made the outside a square with four lobes on it (B16).
  const ownRing = rings.length === 0 ? null : ringAtPoint(rings, node.pos);
  const clip = (p: Vec2): Vec2 => {
    if (rings.length === 0) return p;
    const q = clipOutOfIslands(rings, p);
    return ownRing ? clipIntoRingBoundary(ownRing, q) : q;
  };
  const beyondRing = (p: Vec2): boolean =>
    ownRing !== null && clipIntoRingBoundary(ownRing, p) !== p;
  for (let i = 0; i < aps.length; i++) {
    const ap = aps[i]!;
    const next = aps[(i + 1) % aps.length]!;
    ring.push(clip(ap.right), clip(ap.left));
    const arc = node.degree >= 3 ? cornerArc(node, ap.left, next.right) : [];
    // A corner whose arc dips into the island is the star-shaped kerb bite the
    // pads used to leave in the middle of the ring. Its asphalt is clipped like
    // everything else; its raised APRON is dropped entirely (buildRoads below),
    // because the island's own kerb is the kerb that belongs there.
    const insideIsland =
      rings.length > 0 && arc.some((p) => islandContaining(rings, p) !== null);
    // The same argument on the OUTSIDE: an arc that was flaring past the ring's
    // outer edge is now clipped onto it, and an apron there would stand a second
    // raised kerb co-planar with the ring's own circular one.
    const outsideRing = arc.some(beyondRing);
    corners.push({
      inner: [clip(ap.left), ...arc.map(clip), clip(next.right)],
      hasArc: arc.length > 0,
      insideIsland,
      outsideRing,
    });
    ring.push(...arc.map(clip));
  }
  if (ring.length < 3) return null;

  const center = acc.vertex(toWorld(node.pos[0], node.pos[1], JUNCTION_Y), UP, planarUV(node.pos));
  const ringIdx = ring.map((p) => acc.vertex(toWorld(p[0], p[1], JUNCTION_Y), UP, planarUV(p)));
  for (let i = 0; i < ringIdx.length; i++) {
    acc.tri(center, ringIdx[i]!, ringIdx[(i + 1) % ringIdx.length]!);
  }
  return { ring, corners };
}

// ---------------------------------------------------------------------------
// Sidewalks
// ---------------------------------------------------------------------------

/** Curb rows: 8 indices per station (see buildSidewalkStrip cross-section). */
type SidewalkRow = [number, number, number, number, number, number, number, number];

const SQRT1_2 = Math.SQRT1_2;

/**
 * One raised sidewalk strip along `line`, offset to one side of the road.
 * Cross-section (road edge outward): curb face (vertical, faces the road,
 * rises to 2 cm below the top), 45° top chamfer (CURB_CHAMFER_M — the strip
 * that catches the low sun, doc 71 §4.4), walkway (flat), skirt (slopes back
 * down to terrain, faces outward). Vertex colors bake an AO-ish read: grime
 * at the curb foot, full-bright chamfer/walkway, slight skirt grime.
 * `side` = +1 right of travel, -1 left.
 */
function buildSidewalkStrip(
  acc: MeshAccumulator,
  line: Vec2[],
  halfWidth: number,
  side: 1 | -1,
): void {
  const frames = polylineFrames(line);
  // Per-row indices:
  // [curbBottom, curbTop, chamferBottom, chamferTop, walkInner, walkOuter, skirtTop, skirtBottom]
  let prev: SidewalkRow | null = null;
  let along = 0;
  for (let i = 0; i < line.length; i++) {
    const p = line[i] as Vec2;
    if (i > 0) along += dist(line[i - 1] as Vec2, p);
    const f = frames[i]!;
    const out = mul(f.right, side * f.miter);
    const outUnit = norm(mul(f.right, side));
    const pCurb = add(p, mul(out, halfWidth));
    // Chamfer inset is metric (unit outward), not mitered — 2 cm, negligible.
    const pCurbIn = add(pCurb, mul(outUnit, CURB_CHAMFER_M));
    const pOuter = add(p, mul(out, halfWidth + SIDEWALK_WIDTH_M));
    const pSkirt = add(p, mul(out, halfWidth + SIDEWALK_WIDTH_M + SIDEWALK_SKIRT_M));
    const nToRoad: [number, number, number] = [-outUnit[0], 0, outUnit[1]];
    const nOutward: [number, number, number] = [outUnit[0], 0, -outUnit[1]];
    // 45° between the road-facing face and up — the sun-catcher.
    const nChamfer: [number, number, number] = [
      -outUnit[0] * SQRT1_2,
      SQRT1_2,
      outUnit[1] * SQRT1_2,
    ];
    const v = along * SIDEWALK_UV_SCALE;
    const chamferY = SIDEWALK_TOP_Y - CURB_CHAMFER_M;
    const foot: [number, number, number] = [CURB_FOOT_TINT, CURB_FOOT_TINT, CURB_FOOT_TINT];
    const skirtTint: [number, number, number] = [
      SIDEWALK_SKIRT_TINT,
      SIDEWALK_SKIRT_TINT,
      SIDEWALK_SKIRT_TINT,
    ];

    const cb = acc.vertex(toWorld(pCurb[0], pCurb[1], ROAD_Y), nToRoad, [0, v], foot);
    const ct = acc.vertex(toWorld(pCurb[0], pCurb[1], chamferY), nToRoad, [0.07, v]);
    const xb = acc.vertex(toWorld(pCurb[0], pCurb[1], chamferY), nChamfer, [0.08, v]);
    const xt = acc.vertex(toWorld(pCurbIn[0], pCurbIn[1], SIDEWALK_TOP_Y), nChamfer, [0.1, v]);
    const wi = acc.vertex(toWorld(pCurbIn[0], pCurbIn[1], SIDEWALK_TOP_Y), UP, [0.1, v]);
    const wo = acc.vertex(toWorld(pOuter[0], pOuter[1], SIDEWALK_TOP_Y), UP, [0.9, v]);
    const st = acc.vertex(
      toWorld(pOuter[0], pOuter[1], SIDEWALK_TOP_Y),
      nOutward,
      [0.92, v],
      skirtTint,
    );
    const sb = acc.vertex(toWorld(pSkirt[0], pSkirt[1], 0), nOutward, [1, v], skirtTint);

    if (prev) {
      const [pcb, pct, pxb, pxt, pwi, pwo, pst, psb] = prev;
      if (side === 1) {
        acc.quad(cb, pcb, pct, ct); // curb face -> faces road (left of travel)
        acc.quad(xb, pxb, pxt, xt); // chamfer (road-and-up facing)
        acc.quad(wi, pwi, pwo, wo); // walkway top (CCW seen from above)
        acc.quad(psb, sb, st, pst); // skirt -> faces outward (right of travel)
      } else {
        acc.quad(pcb, cb, ct, pct);
        acc.quad(pxb, xb, xt, pxt);
        acc.quad(pwi, wi, wo, pwo);
        acc.quad(sb, psb, pst, st);
      }
    }
    prev = [cb, ct, xb, xt, wi, wo, st, sb];
  }
}

/**
 * Corner aprons: raised sidewalk wedges wrapped around junction corner
 * arcs, so sidewalks read continuous around intersections. The inner ring
 * (patch boundary corner run) travels CCW around the node; outward is
 * radially away from the node.
 */
function buildCornerAprons(acc: MeshAccumulator, node: NodeInfo, patch: JunctionPatch): void {
  const aps = node.approaches;
  for (let i = 0; i < aps.length; i++) {
    const ap = aps[i]!;
    const next = aps[(i + 1) % aps.length]!;
    if (!SIDEWALK_CLASSES.has(ap.edge.class) && !SIDEWALK_CLASSES.has(next.edge.class)) continue;
    const corner = patch.corners[i]!;
    if (!corner.hasArc) continue; // open sweep — a wedge would self-cross
    // The bite into the middle of a roundabout. Its arc was clipped onto the
    // island's kerb line, so an apron here would build a SECOND raised kerb
    // co-planar with the island's — a curb-height z-fight, and geometrically
    // the four-pointed star the founder photographed. The island owns this kerb.
    if (corner.insideIsland) continue;
    // …and the same on the outside: the ring's own circular kerb owns that line.
    if (corner.outsideRing) continue;
    const inner = corner.inner;
    const c = node.pos;
    // Same 8-vertex profile as buildSidewalkStrip (chamfer incl.), radial out.
    let prev: SidewalkRow | null = null;
    for (let k = 0; k < inner.length; k++) {
      const p = inner[k] as Vec2;
      const rad = norm(sub(p, c));
      if (rad[0] === 0 && rad[1] === 0) continue;
      const pIn = add(p, mul(rad, CURB_CHAMFER_M));
      const pOut = add(p, mul(rad, SIDEWALK_WIDTH_M));
      const pSkirt = add(p, mul(rad, SIDEWALK_WIDTH_M + SIDEWALK_SKIRT_M));
      const nToRoad: [number, number, number] = [-rad[0], 0, rad[1]];
      const nOutward: [number, number, number] = [rad[0], 0, -rad[1]];
      const nChamfer: [number, number, number] = [
        -rad[0] * SQRT1_2,
        SQRT1_2,
        rad[1] * SQRT1_2,
      ];
      const v = k * 1.5;
      const chamferY = SIDEWALK_TOP_Y - CURB_CHAMFER_M;
      const foot: [number, number, number] = [CURB_FOOT_TINT, CURB_FOOT_TINT, CURB_FOOT_TINT];
      const skirtTint: [number, number, number] = [
        SIDEWALK_SKIRT_TINT,
        SIDEWALK_SKIRT_TINT,
        SIDEWALK_SKIRT_TINT,
      ];
      const cb = acc.vertex(toWorld(p[0], p[1], ROAD_Y), nToRoad, [0, v], foot);
      const ct = acc.vertex(toWorld(p[0], p[1], chamferY), nToRoad, [0.07, v]);
      const xb = acc.vertex(toWorld(p[0], p[1], chamferY), nChamfer, [0.08, v]);
      const xt = acc.vertex(toWorld(pIn[0], pIn[1], SIDEWALK_TOP_Y), nChamfer, [0.1, v]);
      const wi = acc.vertex(toWorld(pIn[0], pIn[1], SIDEWALK_TOP_Y), UP, [0.1, v]);
      const wo = acc.vertex(toWorld(pOut[0], pOut[1], SIDEWALK_TOP_Y), UP, [0.9, v]);
      const st = acc.vertex(
        toWorld(pOut[0], pOut[1], SIDEWALK_TOP_Y),
        nOutward,
        [0.92, v],
        skirtTint,
      );
      const sb = acc.vertex(toWorld(pSkirt[0], pSkirt[1], 0), nOutward, [1, v], skirtTint);
      if (prev) {
        const [pcb, pct, pxb, pxt, pwi, pwo, pst, psb] = prev;
        // Ring runs CCW around the node -> node center is LEFT of travel.
        // Curb faces the node (left): (b1, b0, t0, t1).
        acc.quad(cb, pcb, pct, ct);
        acc.quad(xb, pxb, pxt, xt);
        // Walkway top CCW from above: inner_cur, inner_prev, outer_prev, outer_cur.
        acc.quad(wi, pwi, pwo, wo);
        // Skirt faces outward (right of travel): (b0, b1, t1, t0).
        acc.quad(psb, sb, st, pst);
      }
      prev = [cb, ct, xb, xt, wi, wo, st, sb];
    }
  }
}

// ---------------------------------------------------------------------------
// The kerb a CAR PARK still has to have
// ---------------------------------------------------------------------------

/**
 * THE LOT AISLE — the one carriageway in the product that is driven on every
 * lesson it appears in and was dressed by nothing.
 *
 * MEASURED, on the shipped builder, before it was called a defect. Every one
 * of the 14 committed `scenario-lot` maps is one `residential` APPROACH
 * (y ∈ [-120, -30]) plus one `service` AISLE (y ∈ [-30, +40]), and all fourteen
 * parking drills happen on the aisle. `buildWorldGeometry(lot-gap-long-v1, {})`
 * on 2026-08-26 returned `stats.sidewalkStrips = 2` and a sidewalk mesh
 * spanning district y ∈ [-118.80, -33.23]: the kerb stops 3.2 m short of the
 * gate node and never enters the lot, while `roadSurface` runs the full
 * y ∈ [-120, +40]. So the asphalt the student parks on has no edge of any kind.
 *
 * WHY IT HAPPENS. `SIDEWALK_CLASSES` does not contain `service`, and it is
 * right not to: the two OSM city districts author 58 and 68 `service` edges
 * apiece — every driveway, alley and delivery lane in Studentski grad — and a
 * 3.5 m raised pavement down each of those is a different world, not a repair.
 * The gate is the CLASS; the thing that is wrong is the MAP KIND.
 *
 * WHY IT MATTERS MORE THAN „the lot looks bare". sc-park-gap-long task 2 reads
 * «влез НАПРЕД в мястото и спри УСПОРЕДНО НА БОРДЮРА» (ЗДвП чл. 94) and
 * sc-park-gap-short's briefing says the same. The бордюр the task names is the
 * referent the student is asked to judge his car against, and it was not in the
 * world: w11 `sc-park-gap-long__pc-right/04-t076s.png` is that task chip over a
 * windscreen with no kerb anywhere in it. A drill cannot grade — or even pose —
 * a manoeuvre whose subject the world does not draw.
 *
 * THE GEOMETRY, checked on all 14 maps before a single triangle was emitted
 * (`__tests__/lot-aisle-has-a-kerb.test.ts` re-checks it on every run): the
 * aisle's built half width is 8.125 m and the OUTERMOST corner of any painted
 * bay on any lot map is 7.53 m from the aisle centreline. The kerb face
 * therefore lands 0.595 m outside the last bay corner on every map — outside
 * the paint, never through it, which is the guard that this cannot quietly
 * regrade a bay by fencing part of it off.
 *
 * WHAT IT CANNOT DO, because the question was asked before the change and not
 * after: it cannot book a fault. The kerb top is `CURB_HEIGHT_M` = 0.12 m; the
 * chassis collider's underside sits ~0.3 m above the road (`vehicle/tuning`:
 * wheel anchor -0.1, suspension rest 0.3, wheel radius 0.32, half-extent y
 * 0.35), so a 12 cm kerb cannot reach it and `VehicleRig.onCollisionEnter`
 * cannot fire on one — which matters because every compiled scenario lesson
 * runs at `collisionMinKmh: 0`. And the sidewalk mesh's only other consumer,
 * the drivable-surface index, feeds `surfaceUnderCar`, which on 2026-08-26 had
 * no non-test reader anywhere in the tree. Additive in the world, silent in the
 * grader.
 *
 * FOUR GATES, all of them the ones `buildWorldGeometry`'s own lot passes use:
 * a district must be given at all, `meta.mapKind` must be exactly
 * `"scenario-lot"` (14 of 105 committed maps), and only its `service` edges are
 * named. Every city / exam / полигон / street district builds byte-identically,
 * including `pe-dart-v1`'s service alley and `mg-property-v1`'s service drive,
 * which are streets' furniture and not a car park's.
 */
export function lotAisleKerbEdgeIds(district: District | undefined): ReadonlySet<string> {
  if (!district) return EMPTY_EDGE_IDS;
  // DistrictMeta is an open record, so the kind arrives typed `unknown`; the
  // typeof is what lets the literal comparison through (the zoneSigns.ts /
  // lotApronFootprint pattern).
  const mapKind = district.meta.mapKind;
  if (typeof mapKind !== "string" || mapKind !== "scenario-lot") return EMPTY_EDGE_IDS;
  const ids = new Set<string>();
  for (const edge of district.roads.edges) {
    if (edge.class === LOT_AISLE_CLASS) ids.add(edge.id);
  }
  return ids.size > 0 ? ids : EMPTY_EDGE_IDS;
}

/** A car-park aisle's own road class — the same string `MARKED_CLASSES` keeps
 *  out of the lane-line pass with the same reading („a car-park aisle, a
 *  driveway and a delivery lane"). Bay paint, not lane lines — but a kerb. */
const LOT_AISLE_CLASS = "service";

const EMPTY_EDGE_IDS: ReadonlySet<string> = new Set<string>();

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * `district` is optional and carries exactly one decision: whether an edge that
 * no class set kerbs is nonetheless a CAR PARK's roadway (`lotAisleKerbEdgeIds`
 * above). Omitting it reproduces the pre-2026-08-27 build byte for byte, which
 * is what keeps a caller that has no district honest rather than silently
 * different. The two shipped callers — `buildWorldGeometry` and
 * `runtime/surface.resolveDistrictDrivableSurface` — both pass it, and
 * `drivable-surface.test.ts`'s 105-district census agreement is what fails if
 * one of them ever stops.
 */
export function buildRoads(
  network: RoadNetwork,
  rings: readonly RoundaboutRing[] = [],
  district?: District,
): RoadBuildResult {
  const kerbedEdgeIds = lotAisleKerbEdgeIds(district);
  // Registered ring edge → its roundabout, so the outer kerb below is built
  // against the ring it actually belongs to (a district may hold several).
  const ringByEdgeId = new Map<string, RoundaboutRing>();
  for (const r of rings) for (const id of r.ringEdgeIds) ringByEdgeId.set(id, r);
  // Ribbons + sidewalks carry baked vertex-color wear (wheel tracks, gutter
  // grime, curb-foot AO) — multiplied into their PBR maps at zero frame cost.
  const surface = new MeshAccumulator(true);
  const junctions = new MeshAccumulator();
  const sidewalks = new MeshAccumulator(true);
  const parkingLanes = new MeshAccumulator();
  let ribbonCount = 0;
  let skippedRibbonCount = 0;
  let junctionPatchCount = 0;
  let sidewalkStripCount = 0;
  let parkingLaneStripCount = 0;
  /** Mouth-free arcs of circular ring kerb swept (FR-22, the outer half). */
  let ringKerbRunCount = 0;
  let ringReturnRunCount = 0;
  /** Ring edges whose trimmed-stub strip the circle above replaced. */
  let skippedRingStripCount = 0;

  for (const eb of network.edges) {
    if (!eb.line) {
      skippedRibbonCount++;
      continue;
    }
    buildRibbon(
      surface,
      eb.line,
      eb.halfWidth,
      ribbonCrossSection(eb.halfWidth, eb.parkingM, eb.edge.lanes),
    );
    ribbonCount++;

    if (eb.parkingM > 0) {
      // Parking bands stop short of the junction mouths (no parking within
      // 5 m of a junction) — the bare wide mouth reads as approach flare.
      const lineLen = polylineLength(eb.line);
      if (lineLen > 2 * PARKING_LANE_END_INSET_M + 4) {
        const bandLine =
          trimPolyline(eb.line, PARKING_LANE_END_INSET_M, PARKING_LANE_END_INSET_M, 2) ?? eb.line;
        buildParkingBand(parkingLanes, bandLine, eb.halfWidth, eb.parkingM, 1);
        buildParkingBand(parkingLanes, bandLine, eb.halfWidth, eb.parkingM, -1);
        parkingLaneStripCount += 2;
      }
    }

    const ringOf = ringByEdgeId.get(eb.edge.id);
    if (ringOf) {
      // THE OUTER KERB OF THE RING. A roundabout is two concentric circles, and
      // until now the sim drew neither: ring edges were skipped by the sidewalk
      // pass wholesale, so the circulatory carriageway simply bled into the
      // terrain and the only thing bounding it was the horizon. The strip goes
      // on the OUTWARD side only — the inward side is the central island's own
      // kerb, and a second one there would stand in the traffic lane.
      //
      // FR-22 RESIDUAL: this per-edge strip runs along the JUNCTION-TRIMMED
      // centreline, and `analyzeNetwork` opens 17.125 m of junction at each
      // arm↔ring node — on rb-mini's 90° / 28 m quarters the trim clamps at
      // JUNCTION_TRIM_MAX_FRACTION and leaves 2.8 m of kerb per quarter.
      // Probed: kerb missing on 30 of 45 off-mouth bearings (rb-mini / rb-ped),
      // 60 of 75 (rb-2lane), 66 of 87 (rb-single). Four stubs are not a circle.
      // Where the ring resolves a real profile the circle is swept ONCE, below,
      // out of `ringOuterKerbRuns` — same sweep, same collider, whole shape.
      if (hasOuterKerb(ringOf)) {
        skippedRingStripCount++;
      } else {
        const lineLen = polylineLength(eb.line);
        if (lineLen > 2) {
          const inset = Math.min(0.6, lineLen * 0.08);
          const walkLine = trimPolyline(eb.line, inset, inset, 1.0) ?? eb.line;
          buildSidewalkStrip(sidewalks, walkLine, eb.halfWidth, ringOutwardSide(ringOf, walkLine));
          sidewalkStripCount++;
        }
      }
    } else if (
      (SIDEWALK_CLASSES.has(eb.edge.class) || kerbedEdgeIds.has(eb.edge.id)) &&
      !eb.edge.roundabout
    ) {
      // Pull sidewalk ends back a little so junction corners stay open.
      const lineLen = polylineLength(eb.line);
      if (lineLen > 6) {
        // Shared with the roundabout mouth's kerb return, which has to end
        // exactly where this strip begins (constants.sidewalkEndInsetM). Two
        // copies of this expression leave either a hole in the kerb or a
        // co-planar overlap at every ring mouth, and both are visible from the
        // driving seat.
        const inset = sidewalkEndInsetM(lineLen);
        const walkLine = trimPolyline(eb.line, inset, inset, 1.5) ?? eb.line;
        // A bare verge (a divided street's median kerb, a motorway връзка's
        // grass verge — network.ts BareVergeSide) carries no pavement: the
        // strip that used to be built there landed on the OTHER carriageway's
        // asphalt, which is what put ambient traffic on the pavement.
        for (const side of [1, -1] as const) {
          if (isBareVergeSide(eb.bareVerge, side)) continue;
          buildSidewalkStrip(sidewalks, walkLine, eb.halfWidth, side);
          sidewalkStripCount++;
        }
      }
    }
  }

  // THE CIRCLE ITSELF (FR-22, the outer half). One sweep per mouth-free arc of
  // each ring, at the ring's own drawn half width — so the kerb lands exactly
  // on the edge of the asphalt the ribbon pass laid, all the way round, broken
  // only where an arm really does leave the circle. `buildSidewalkStrip` is the
  // same call every street's pavement uses: same cross-section, same vertex
  // colours, and the same sidewalk accumulator that becomes the collider, so a
  // car is stopped by the outside of a roundabout exactly as by any other kerb.
  for (const ring of rings) {
    for (const run of ringOuterKerbRuns(ring)) {
      buildSidewalkStrip(sidewalks, run, ring.ringHalfWidthM, ringOutwardSide(ring, run));
      sidewalkStripCount++;
      ringKerbRunCount++;
    }
    // …AND THE KERB RETURNS THAT CLOSE THE MOUTHS (B16). Same call, same
    // cross-section, same collider: what changes is that the boundary no longer
    // stops. Swept at half width 0 because these polylines ARE the kerb line —
    // the ring runs above are centrelines, the arm's kerb is not.
    for (const { line, side } of ringMouthKerbRuns(ring)) {
      buildSidewalkStrip(sidewalks, line, 0, side);
      sidewalkStripCount++;
      ringReturnRunCount++;
    }
  }

  for (const node of network.nodes.values()) {
    if (node.approaches.length < 2) continue;
    const patch = buildJunctionPatch(junctions, node, rings);
    if (patch) {
      junctionPatchCount++;
      if (node.degree >= 3) buildCornerAprons(sidewalks, node, patch);
    }
  }

  return {
    surface,
    junctions,
    sidewalks,
    parkingLanes,
    ribbonCount,
    skippedRibbonCount,
    junctionPatchCount,
    sidewalkStripCount,
    parkingLaneStripCount,
    ringKerbRunCount,
    ringReturnRunCount,
    skippedRingStripCount,
  };
}
