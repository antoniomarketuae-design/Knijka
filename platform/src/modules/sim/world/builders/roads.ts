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
  JUNCTION_Y,
  ROAD_Y,
  SIDEWALK_CLASSES,
  SIDEWALK_SKIRT_M,
  SIDEWALK_TOP_Y,
  SIDEWALK_WIDTH_M,
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
import type { NodeInfo, RoadNetwork } from "./network";

const ASPHALT_UV_SCALE = 1 / 7; // planar meters -> uv
const SIDEWALK_UV_SCALE = 1 / 2;

export interface RoadBuildResult {
  surface: MeshAccumulator;
  junctions: MeshAccumulator;
  sidewalks: MeshAccumulator;
  ribbonCount: number;
  skippedRibbonCount: number;
  junctionPatchCount: number;
  sidewalkStripCount: number;
}

const planarUV = (p: Vec2): [number, number] => [p[0] * ASPHALT_UV_SCALE, p[1] * ASPHALT_UV_SCALE];

// ---------------------------------------------------------------------------
// Ribbons
// ---------------------------------------------------------------------------

function buildRibbon(acc: MeshAccumulator, line: Vec2[], halfWidth: number): void {
  const frames = polylineFrames(line);
  let prevL = -1;
  let prevR = -1;
  for (let i = 0; i < line.length; i++) {
    const p = line[i] as Vec2;
    const f = frames[i]!;
    const off = mul(f.right, halfWidth * f.miter);
    const l = sub(p, off);
    const r = add(p, off);
    const li = acc.vertex(toWorld(l[0], l[1], ROAD_Y), UP, planarUV(l));
    const ri = acc.vertex(toWorld(r[0], r[1], ROAD_Y), UP, planarUV(r));
    if (i > 0) acc.quad(prevL, prevR, ri, li);
    prevL = li;
    prevR = ri;
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
  corners: { inner: Vec2[]; hasArc: boolean }[];
}

/**
 * Fan-fill the open junction area. The polygon walks the approaches in CCW
 * order using their EXACT ribbon cut points (right then left of each
 * outgoing direction), with rounded corner arcs in between. Star-shaped
 * around the node, so a center fan triangulates it.
 */
function buildJunctionPatch(acc: MeshAccumulator, node: NodeInfo): JunctionPatch | null {
  const aps = node.approaches;
  if (aps.length < 2) return null;
  const ring: Vec2[] = [];
  const corners: JunctionPatch["corners"] = [];
  for (let i = 0; i < aps.length; i++) {
    const ap = aps[i]!;
    const next = aps[(i + 1) % aps.length]!;
    ring.push(ap.right, ap.left);
    const arc = node.degree >= 3 ? cornerArc(node, ap.left, next.right) : [];
    corners.push({ inner: [ap.left, ...arc, next.right], hasArc: arc.length > 0 });
    ring.push(...arc);
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

/**
 * One raised sidewalk strip along `line`, offset to one side of the road.
 * Cross-section (road edge outward): curb face (vertical, faces the road),
 * walkway (flat, 2 m), skirt (slopes back down to terrain, faces outward).
 * `side` = +1 right of travel, -1 left.
 */
function buildSidewalkStrip(
  acc: MeshAccumulator,
  line: Vec2[],
  halfWidth: number,
  side: 1 | -1,
): void {
  const frames = polylineFrames(line);
  // Per-row indices: [curbBottom, curbTop, walkInner, walkOuter, skirtTop, skirtBottom]
  let prev: [number, number, number, number, number, number] | null = null;
  let along = 0;
  for (let i = 0; i < line.length; i++) {
    const p = line[i] as Vec2;
    if (i > 0) along += dist(line[i - 1] as Vec2, p);
    const f = frames[i]!;
    const out = mul(f.right, side * f.miter);
    const outUnit = norm(mul(f.right, side));
    const pCurb = add(p, mul(out, halfWidth));
    const pOuter = add(p, mul(out, halfWidth + SIDEWALK_WIDTH_M));
    const pSkirt = add(p, mul(out, halfWidth + SIDEWALK_WIDTH_M + SIDEWALK_SKIRT_M));
    const nToRoad: [number, number, number] = [-outUnit[0], 0, outUnit[1]];
    const nOutward: [number, number, number] = [outUnit[0], 0, -outUnit[1]];
    const v = along * SIDEWALK_UV_SCALE;

    const cb = acc.vertex(toWorld(pCurb[0], pCurb[1], ROAD_Y), nToRoad, [0, v]);
    const ct = acc.vertex(toWorld(pCurb[0], pCurb[1], SIDEWALK_TOP_Y), nToRoad, [0.08, v]);
    const wi = acc.vertex(toWorld(pCurb[0], pCurb[1], SIDEWALK_TOP_Y), UP, [0.1, v]);
    const wo = acc.vertex(toWorld(pOuter[0], pOuter[1], SIDEWALK_TOP_Y), UP, [0.9, v]);
    const st = acc.vertex(toWorld(pOuter[0], pOuter[1], SIDEWALK_TOP_Y), nOutward, [0.92, v]);
    const sb = acc.vertex(toWorld(pSkirt[0], pSkirt[1], 0), nOutward, [1, v]);

    if (prev) {
      const [pcb, pct, pwi, pwo, pst, psb] = prev;
      if (side === 1) {
        acc.quad(cb, pcb, pct, ct); // curb face -> faces road (left of travel)
        acc.quad(wi, pwi, pwo, wo); // walkway top (CCW seen from above)
        acc.quad(psb, sb, st, pst); // skirt -> faces outward (right of travel)
      } else {
        acc.quad(pcb, cb, ct, pct);
        acc.quad(pwi, wi, wo, pwo);
        acc.quad(sb, psb, pst, st);
      }
    }
    prev = [cb, ct, wi, wo, st, sb];
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
    const inner = corner.inner;
    const c = node.pos;
    // Per-row indices: [curbBottom, curbTop, walkInner, walkOuter, skirtTop, skirtBottom]
    let prev: [number, number, number, number, number, number] | null = null;
    for (let k = 0; k < inner.length; k++) {
      const p = inner[k] as Vec2;
      const rad = norm(sub(p, c));
      if (rad[0] === 0 && rad[1] === 0) continue;
      const pOut = add(p, mul(rad, SIDEWALK_WIDTH_M));
      const pSkirt = add(p, mul(rad, SIDEWALK_WIDTH_M + SIDEWALK_SKIRT_M));
      const nToRoad: [number, number, number] = [-rad[0], 0, rad[1]];
      const nOutward: [number, number, number] = [rad[0], 0, -rad[1]];
      const v = k * 1.5;
      const cb = acc.vertex(toWorld(p[0], p[1], ROAD_Y), nToRoad, [0, v]);
      const ct = acc.vertex(toWorld(p[0], p[1], SIDEWALK_TOP_Y), nToRoad, [0.08, v]);
      const wi = acc.vertex(toWorld(p[0], p[1], SIDEWALK_TOP_Y), UP, [0.1, v]);
      const wo = acc.vertex(toWorld(pOut[0], pOut[1], SIDEWALK_TOP_Y), UP, [0.9, v]);
      const st = acc.vertex(toWorld(pOut[0], pOut[1], SIDEWALK_TOP_Y), nOutward, [0.92, v]);
      const sb = acc.vertex(toWorld(pSkirt[0], pSkirt[1], 0), nOutward, [1, v]);
      if (prev) {
        const [pcb, pct, pwi, pwo, pst, psb] = prev;
        // Ring runs CCW around the node -> node center is LEFT of travel.
        // Curb faces the node (left): (b1, b0, t0, t1).
        acc.quad(cb, pcb, pct, ct);
        // Walkway top CCW from above: inner_cur, inner_prev, outer_prev, outer_cur.
        acc.quad(wi, pwi, pwo, wo);
        // Skirt faces outward (right of travel): (b0, b1, t1, t0).
        acc.quad(psb, sb, st, pst);
      }
      prev = [cb, ct, wi, wo, st, sb];
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildRoads(network: RoadNetwork): RoadBuildResult {
  const surface = new MeshAccumulator();
  const junctions = new MeshAccumulator();
  const sidewalks = new MeshAccumulator();
  let ribbonCount = 0;
  let skippedRibbonCount = 0;
  let junctionPatchCount = 0;
  let sidewalkStripCount = 0;

  for (const eb of network.edges) {
    if (!eb.line) {
      skippedRibbonCount++;
      continue;
    }
    buildRibbon(surface, eb.line, eb.halfWidth);
    ribbonCount++;

    if (SIDEWALK_CLASSES.has(eb.edge.class) && !eb.edge.roundabout) {
      // Pull sidewalk ends back a little so junction corners stay open.
      const lineLen = polylineLength(eb.line);
      if (lineLen > 6) {
        const inset = Math.min(1.2, lineLen * 0.08);
        const walkLine = trimPolyline(eb.line, inset, inset, 1.5) ?? eb.line;
        buildSidewalkStrip(sidewalks, walkLine, eb.halfWidth, 1);
        buildSidewalkStrip(sidewalks, walkLine, eb.halfWidth, -1);
        sidewalkStripCount += 2;
      }
    }
  }

  for (const node of network.nodes.values()) {
    if (node.approaches.length < 2) continue;
    const patch = buildJunctionPatch(junctions, node);
    if (patch) {
      junctionPatchCount++;
      if (node.degree >= 3) buildCornerAprons(sidewalks, node, patch);
    }
  }

  return {
    surface,
    junctions,
    sidewalks,
    ribbonCount,
    skippedRibbonCount,
    junctionPatchCount,
    sidewalkStripCount,
  };
}
