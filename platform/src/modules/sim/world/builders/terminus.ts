/**
 * THE STREET END — the ends that run OUT OF THE WORLD, and what stands in them.
 *
 * TWO PASSES SHARE ONE DEFINITION OF „AN END". `props.ts` plants the treeline
 * that dresses the flanks; this module builds the mass that closes the AXIS.
 * Both are gated on exactly the same set of ends — scenario micro-maps only,
 * dead ends near the district boundary, on a street class the B65 dressing
 * lights — and that set is `terminusEnds` here so the two cannot drift apart.
 * A city / exam / полигон district's boundary ends are the edge of an OSM
 * extract, not a street that stops, and they get nothing.
 *
 * WHY THE CLOSING MASS IS A BUILDING VOLUME AND NOT A PROP: see the
 * TERMINUS_CLOSE_* header in constants.ts. Short version — the four facade
 * meshes and the roof mesh are drawn on every district already, so a volume
 * costs ZERO draw calls and 26 triangles, and `buildBuildings` merges its walls
 * into `colliders.buildings` in the same loop, so it is the one candidate that
 * is not a wall the student can drive through.
 *
 * It is NOT written into the district document: `district.buildings` stays
 * byte-identical, `stats.buildings` keeps counting the authored footprints
 * only, and nothing in the runtime, the lessons or the traces sees a new
 * building. This is scenery, and it is built where scenery is built.
 */

import type { District, DistrictBuilding, TerminusClosurePlacement } from "../types";
import { resolveBuildingHeightM } from "./cityBuildings";
import {
  SCENARIO_LIT_CLASSES,
  TERMINUS_BOUNDARY_MARGIN_M,
  TERMINUS_CLOSE_BUILDING_CLEAR_M,
  TERMINUS_CLOSE_DEFAULT_HEIGHT_M,
  TERMINUS_CLOSE_DEPTH_M,
  TERMINUS_CLOSE_HALF_W_M,
  TERMINUS_CLOSE_MAX_HEIGHT_M,
  TERMINUS_CLOSE_MIN_HEIGHT_M,
  TERMINUS_CLOSE_NEAR_M,
  TERMINUS_CLOSE_OVERLAP_M,
  TERMINUS_CLOSE_ROAD_CLEAR_M,
  TERMINUS_CLOSE_STEP_HEIGHT_FRACTION,
  TERMINUS_CLOSE_STEP_M,
  TERMINUS_CLOSE_TERRAIN_INSET_M,
  TERRAIN_MARGIN_M,
} from "./constants";
import {
  add,
  hashString,
  mul,
  perpRight,
  pointAlong,
  polylineLength,
  SegmentGrid,
  type Vec2,
} from "./math2d";
import type { RoadNetwork } from "./network";
import { scenarioSignScale } from "./zoneSigns";

/** A dead end that runs out of the world, with the frame the passes build in. */
export interface TerminusEnd {
  nodeId: string;
  /** The end node, district space. */
  pos: Vec2;
  /** Unit vector pointing OUT of the district along the approach. */
  out: Vec2;
  /** Unit vector 90° right of `out`. */
  lateral: Vec2;
  /** Carriageway half-width at the approach (includes the parking band). */
  halfWidth: number;
}

/**
 * The ends both terminus passes act on, in a stable order.
 *
 * The order is `[...deadEnds].sort()` because `props.ts` spends its own RNG
 * stream walking this list: re-ordering it would silently re-place the grove on
 * 90 districts. Do not "improve" it into insertion order.
 */
export function terminusEnds(district: District, network: RoadNetwork): TerminusEnd[] {
  if (scenarioSignScale(district) === undefined) return [];
  const bounds = district.meta.boundsLocalMeters;
  const m = TERMINUS_BOUNDARY_MARGIN_M;
  const nearBoundary = (p: Vec2) =>
    p[0] < bounds.minX + m ||
    p[0] > bounds.maxX - m ||
    p[1] < bounds.minY + m ||
    p[1] > bounds.maxY - m;
  const nodePos = new Map(district.roads.nodes.map((n) => [n.id, [n.x, n.y] as Vec2]));
  const ends: TerminusEnd[] = [];
  for (const nodeId of [...network.deadEnds].sort()) {
    const pos = nodePos.get(nodeId);
    if (!pos || !nearBoundary(pos)) continue;
    const ap = network.nodes.get(nodeId)?.approaches[0];
    if (!ap || ap.edge.roundabout || !SCENARIO_LIT_CLASSES.has(ap.edge.class)) continue;
    const g = ap.edge.geometry as Vec2[];
    const atStart = ap.edge.from === nodeId;
    const { tangent } = pointAlong(g, atStart ? 0 : polylineLength(g));
    // OUT of the district: at a `from` end the tangent points inward.
    const away = atStart ? mul(tangent, -1) : tangent;
    ends.push({ nodeId, pos, out: away, lateral: perpRight(away), halfWidth: ap.halfWidth });
  }
  return ends;
}

type Aabb = [number, number, number, number];

const aabbOf = (ring: readonly Vec2[]): Aabb => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  return [minX, minY, maxX, maxY];
};

const overlaps = (a: Aabb, b: Aabb, pad: number): boolean =>
  a[0] - pad < b[2] && a[2] + pad > b[0] && a[1] - pad < b[3] && a[3] + pad > b[1];

/**
 * The height the closing mass takes from the street it closes: the MEDIAN of
 * the district's own frontage, clamped into the band. A median rather than a
 * mean so one 34 m block cannot pull a low-rise street's end into a tower.
 */
function frontageHeightM(district: District): number {
  const hs = district.buildings
    .filter((b) => Array.isArray(b.footprint) && b.footprint.length >= 3)
    .map((b) => resolveBuildingHeightM(b))
    .sort((a, b) => a - b);
  if (hs.length === 0) return TERMINUS_CLOSE_DEFAULT_HEIGHT_M;
  const med = hs[Math.floor(hs.length / 2)]!;
  return Math.min(TERMINUS_CLOSE_MAX_HEIGHT_M, Math.max(TERMINUS_CLOSE_MIN_HEIGHT_M, med));
}

/** One closing volume, in the end's own (lateral u, outward s) frame. */
interface Part {
  tag: string;
  u0: number;
  u1: number;
  s0: number;
  s1: number;
  heightScale: number;
}

/**
 * The pair. One half reaches from the left kerb PAST the axis, the other from
 * the right kerb past it and `TERMINUS_CLOSE_STEP_M` further back, so the join
 * is an overlap (never a slit on the axis) and the silhouette is a step
 * (never a single slab). Which half is the near one is decided per end by the
 * node id, so the same corner does not repeat down the catalogue.
 */
function partsFor(nodeId: string): Part[] {
  const near = TERMINUS_CLOSE_NEAR_M;
  const w = TERMINUS_CLOSE_HALF_W_M;
  const o = TERMINUS_CLOSE_OVERLAP_M;
  const d = TERMINUS_CLOSE_DEPTH_M;
  const step = TERMINUS_CLOSE_STEP_M;
  const mirror = hashString(`terminus:${nodeId}`) % 2 === 1 ? -1 : 1;
  const flip = (a: number, b: number): [number, number] =>
    mirror === 1 ? [a, b] : [-b, -a];
  const [aU0, aU1] = flip(-w, o);
  const [bU0, bU1] = flip(-o, w);
  return [
    { tag: "a", u0: aU0, u1: aU1, s0: near, s1: near + d, heightScale: 1 },
    {
      tag: "b",
      u0: bU0,
      u1: bU1,
      s0: near + step,
      s1: near + step + d,
      heightScale: TERMINUS_CLOSE_STEP_HEIGHT_FRACTION,
    },
  ];
}

/** What one accepted closing volume is: the mass to build, and the record of
 *  where it stands that WorldGeometry publishes. */
export interface TerminusClosure {
  placement: TerminusClosurePlacement;
  volume: DistrictBuilding;
}

/**
 * The closing volumes for every eligible end, as synthetic footprints for
 * `buildBuildings`' extra-volume pass. Empty on every district that is not a
 * scenario micro-map, and on every end where a guard refuses.
 */
export function buildTerminusClosure(
  district: District,
  network: RoadNetwork,
): TerminusClosure[] {
  const ends = terminusEnds(district, network);
  if (ends.length === 0) return [];

  const b = district.meta.boundsLocalMeters;
  const inset = TERRAIN_MARGIN_M - TERMINUS_CLOSE_TERRAIN_INSET_M;
  const onDrawnGround = (ring: readonly Vec2[]) =>
    ring.every(
      (p) =>
        p[0] >= b.minX - inset &&
        p[0] <= b.maxX + inset &&
        p[1] >= b.minY - inset &&
        p[1] <= b.maxY + inset,
    );

  const roadGrid = new SegmentGrid(24);
  for (const eb of network.edges) roadGrid.addPolyline(eb.edge.geometry as Vec2[]);

  // Everything already standing on the map, plus every closure accepted at an
  // EARLIER end — so two ends that face each other across a short map cannot
  // build into one another. The two halves of the SAME end are excluded on
  // purpose: their overlap is the join, and it is what keeps a slit off the
  // axis (constants.TERMINUS_CLOSE_OVERLAP_M).
  const taken: Aabb[] = district.buildings
    .filter((f) => Array.isArray(f.footprint) && f.footprint.length >= 3)
    .map((f) => aabbOf(f.footprint as Vec2[]));

  const heightM = frontageHeightM(district);
  const out: TerminusClosure[] = [];

  for (const end of ends) {
    const at = (u: number, s: number): Vec2 =>
      add(add(end.pos, mul(end.out, s)), mul(end.lateral, u));
    const mine: Aabb[] = [];
    for (const part of partsFor(end.nodeId)) {
      const ring: Vec2[] = [
        at(part.u0, part.s0),
        at(part.u1, part.s0),
        at(part.u1, part.s1),
        at(part.u0, part.s1),
      ];
      if (!onDrawnGround(ring)) continue;
      // THE COLLIDER GUARD, over the whole rectangle on a 4 m lattice. Corners
      // alone would pass a road that crosses the middle of it.
      let clear = true;
      const du = Math.abs(part.u1 - part.u0);
      const ds = Math.abs(part.s1 - part.s0);
      const nu = Math.max(1, Math.ceil(du / 4));
      const ns = Math.max(1, Math.ceil(ds / 4));
      for (let i = 0; i <= nu && clear; i++) {
        for (let j = 0; j <= ns && clear; j++) {
          const p = at(part.u0 + (du * i) / nu, part.s0 + (ds * j) / ns);
          if (
            roadGrid.distanceTo(p, TERMINUS_CLOSE_ROAD_CLEAR_M + 1) < TERMINUS_CLOSE_ROAD_CLEAR_M
          ) {
            clear = false;
          }
        }
      }
      if (!clear) continue;
      const box = aabbOf(ring);
      if (taken.some((t) => overlaps(box, t, TERMINUS_CLOSE_BUILDING_CLEAR_M))) continue;
      mine.push(box);
      const footprint = ring.map((p) => [p[0], p[1]] as [number, number]);
      const h = Math.max(TERMINUS_CLOSE_MIN_HEIGHT_M, heightM * part.heightScale);
      out.push({
        placement: { nodeId: end.nodeId, footprint, heightM: h },
        volume: {
          id: `terminus-close-${end.nodeId}-${part.tag}`,
          // `heightSource: "height"` so resolveBuildingHeightM takes this
          // number instead of hashing a 15–25 m default out of the id.
          height: h,
          heightSource: "height",
          footprint,
        },
      });
    }
    taken.push(...mine);
  }
  return out;
}
