/**
 * Roundabouts — the central island, the annular carriageway and the ring's own
 * circular markings.
 *
 * THE DEFECT THIS EXISTS FOR (founder, twice). First: „this is not proper
 * round-about it doesnt have the proper shape". Then, plainly: „a Round a bout
 * is a Cyrcle, it has sphere shape not a triangle or square shape in any kind."
 *
 * The data was never wrong. rb-mini-v1 registers a clean r = 18 ring as four
 * one-way arcs, and every consumer that reads `roundabouts[]` — the Б1 + Д11
 * entry signs, the runtime's circulating band, the traffic lane graph — is
 * correct. NOTHING DREW THE CIRCLE. `network.edgeTravelHalfWidth` merely widens
 * a ring edge, and the four arm↔ring nodes each open an ordinary junction pad
 * of `nodeOpenRadiusM` ≈ 17 m. On an 18 m ring those four pads meet in the
 * middle and union into one open plaza: no island, no kerb, no annulus. What
 * the student drove was a square with rounded corners.
 *
 * The island derivation itself was already written and unit-tested — on the DEV
 * STILL ROUTE (app/dev/scene-still/roundaboutIsland.ts), whose own header said
 * „the SIM still renders a ring without an island — that gap belongs to
 * sim/world's builders". This module is that port, and it is now the ONLY copy:
 * the still route consumes the world builder like every other surface.
 *
 * WHAT IS DERIVED, AND FROM WHAT (nothing here is authored):
 *   - the centre and the ring radius come out of `roundabouts[]`;
 *   - the ring's drawn half width is `edgeTravelHalfWidth` of its own widest
 *     registered edge — the same function that sweeps the asphalt, so paint,
 *     carriageway and kerb cannot drift apart;
 *   - the island radius is the ring's TIGHTEST measured radius minus that half
 *     width, i.e. exactly the inner edge of the circulatory carriageway. The
 *     tightest, not the declared, because an OSM ring is not a perfect circle
 *     (d2-v1 wanders 26.7–29.3 m against a declared 28) and a disc drawn at the
 *     mean would pave over the carriageway where the ring pinches in.
 *
 * AND WHAT IS REFUSED. A registration whose middle is not actually empty gets
 * NO island. d2-v1 is the live case: бул. „Пейо К. Яворов" (a primary, drawn
 * 24.25 m curb-to-curb) runs straight through the interior — its carriageway
 * band covers the centre point itself. A disc there would be grass painted over
 * a road a student can be graded on. Refusing to draw is the honest answer; a
 * pretty lie is not an improvement on a missing circle.
 *
 * Pure data + typed-array meshes — no three.js, no React, so the node suite
 * asserts the shipped geometry directly.
 */

import type { District, DistrictEdge } from "../types";
import {
  CURB_CHAMFER_M,
  CURB_FOOT_TINT,
  DASH_GAP_M,
  DASH_LENGTH_M,
  DASH_WIDTH_M,
  LANE_WIDTH_M,
  MARKING_Y,
  ROAD_Y,
  SIDEWALK_TOP_Y,
} from "./constants";
import { add, mul, perpRight, type Vec2 } from "./math2d";
import { MeshAccumulator, toWorld, UP } from "./mesh";
import { edgeHalfWidth, edgeTravelHalfWidth, type RoadNetwork } from "./network";

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Clearance kept between the island kerb and any carriageway that intrudes
 *  into the ring's interior — half a metre of asphalt, never a shared edge. */
const ISLAND_INTRUSION_CLEARANCE_M = 0.5;

/**
 * An island is drawn only when it survives at this fraction of the size the
 * ring alone would allow. Below it the "roundabout" is a junction with a ring
 * tag and a road through the middle: a token disc floating in an open plaza
 * teaches nothing, and pretending otherwise is the failure this whole module
 * exists to end.
 */
const ISLAND_MIN_SURVIVING_FRACTION = 0.5;

/** Smallest island worth building at all (below this it is a bollard, not a
 *  central island, and a driver reads it as debris). */
const ISLAND_MIN_RADIUS_M = 3;

// ---------------------------------------------------------------------------
// FR-22, THE OUTER HALF — „a Round a bout is a Cyrcle" applies to BOTH circles
// ---------------------------------------------------------------------------
//
// THE RESIDUAL THIS SECTION CLOSES, MEASURED BEFORE IT WAS WRITTEN. The island
// pass made the INNER boundary a circle. The OUTER boundary was still built the
// way every ordinary street's pavement is: `buildSidewalkStrip` along each ring
// edge's JUNCTION-TRIMMED centreline. `analyzeNetwork` opens 17.125 m of
// junction at each arm↔ring node, so on rb-mini's 90° / 28 m quarters the trim
// clamps at JUNCTION_TRIM_MAX_FRACTION and leaves **2.8 m of kerb per quarter**.
// Probed on the shipped geometry, kerb present at radius `ringRadius +
// ringHalfWidth`, sampled at 2° and counted only where no arm could excuse it:
//
//     rb-mini-v1    kerb missing on 30 of 45 off-mouth bearings
//     rb-ped-v1     kerb missing on 30 of 45
//     rb-2lane-v1   kerb missing on 60 of 75
//     rb-single-v1  kerb missing on 66 of 87
//
// …and the junction pads spilled up to **+10.73 m past the outer edge** on
// bearings no arm points at. Four short kerb stubs with open plaza between them
// and asphalt bleeding into the terrain IS the square he photographed; the
// island only fixed the middle of it.
//
// The fix is the one `buildRingDivider` below already argues for the PAINT, in
// its own words — „a circle is not a polyline sum; it is drawn as a circle" —
// applied to the KERB. Nothing here is authored: the profile is walked off the
// registered ring polylines, and the gaps are the arms the network already
// holds. A ring with no registered arms gets an unbroken kerb; a ring whose
// arms eat the whole circle gets no circular kerb at all and keeps today's
// stubs, because a kerb that is all gap is not a circle either.

/** Bearing resolution of the ring profile — 1° (0.73 m of arc on a 42 m ring). */
export const RING_PROFILE_BUCKETS = 360;

/**
 * Entry flare each side of an arm's TRAVEL carriageway at the mouth, m. A real
 * mouth is wider than the road that feeds it — the kerb peels away before the
 * give-way line so an entering car has somewhere to aim. Deliberately small:
 * every metre of flare is a metre of circle the driver does not see, and the
 * carriageway it is added to is already at PERCEPTUAL_ROAD_SCALE 2.5.
 *
 * Measured from the arm's TRAVEL half width, not `edgeHalfWidth`: the kerbside
 * parking band is not an entry lane, and `PARKING_LANE_END_INSET_M` already
 * stops the band 5 m short of the junction, so counting it opened a mouth
 * across asphalt nobody enters from. On rb-2lane (three-lane primary arms) that
 * one term was the difference between a 0.744 mouth fraction — refused, four
 * kerb stubs, the defect intact — and 0.529, which is a circle with four gaps.
 */
const RING_MOUTH_FLARE_M = 1.5;

/**
 * A ring whose mouths already eat this much of its circumference has no circle
 * left to draw, so the circular kerb is refused and the per-edge strips stand.
 * Drawing four kerb slivers and calling it a circle is the failure this whole
 * module exists to end.
 */
const RING_MAX_MOUTH_FRACTION = 0.72;

/** Shortest arc of kerb worth building — below it the strip reads as debris. */
const RING_MIN_KERB_RUN_M = 4;

const TAU = Math.PI * 2;

/** Bearing → bucket index, always in range. */
function bucketOf(bearing: number): number {
  const a = ((bearing % TAU) + TAU) % TAU;
  return Math.min(RING_PROFILE_BUCKETS - 1, Math.floor((a / TAU) * RING_PROFILE_BUCKETS));
}

/** Ring-centreline radius at a bearing (nearest bucket — the profile is dense). */
export function ringCentreRadiusAt(ring: RoundaboutRing, bearing: number): number {
  return ring.centreProfileM[bucketOf(bearing)] ?? ring.ringRadiusM;
}

/** Outer edge of the drawn circulatory carriageway at a bearing, m. */
export function ringOuterRadiusAt(ring: RoundaboutRing, bearing: number): number {
  return ringCentreRadiusAt(ring, bearing) + ring.ringHalfWidthM;
}

/** Is this bearing inside one of the ring's entry mouths? */
export function ringBearingInMouth(ring: RoundaboutRing, bearing: number): boolean {
  for (const m of ring.mouths) {
    let d = Math.abs((((bearing - m.bearing) % TAU) + TAU) % TAU);
    if (d > Math.PI) d = TAU - d;
    if (d <= m.halfAngle) return true;
  }
  return false;
}

/**
 * Walk the registered ring polylines into a radius-by-bearing profile of the
 * ring CENTRELINE. Segments are sampled, not just vertices: a chorded ring sags
 * between its vertices and the kerb has to follow the asphalt, not the ideal.
 */
function centreProfile(
  centre: Vec2,
  ringIds: ReadonlySet<string>,
  edgeById: ReadonlyMap<string, DistrictEdge>,
): number[] | null {
  const sum = new Array<number>(RING_PROFILE_BUCKETS).fill(0);
  const hits = new Array<number>(RING_PROFILE_BUCKETS).fill(0);
  for (const id of ringIds) {
    const g = edgeById.get(id)?.geometry as Vec2[] | undefined;
    if (!g) continue;
    for (let i = 0; i + 1 < g.length; i++) {
      const a = g[i]!;
      const b = g[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // Step by ANGLE, not by metres. A fixed 0.5 m step is finer than a 1°
      // bucket only on a ring bigger than ~28 m radius: on rb-mini (r 18) it
      // reached 62 % of the buckets, the profile was refused as "not a ring",
      // and the circle was silently not drawn on the very map the founder
      // photographed. rb-single passed and rb-mini did not — which is exactly
      // how the probe caught it.
      const rMid = Math.max(
        1,
        Math.hypot((a[0] + b[0]) / 2 - centre[0], (a[1] + b[1]) / 2 - centre[1]),
      );
      const perBucketM = (TAU * rMid) / RING_PROFILE_BUCKETS;
      const steps = Math.max(1, Math.ceil(len / Math.min(0.5, perBucketM / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a[0] + (b[0] - a[0]) * t - centre[0];
        const y = a[1] + (b[1] - a[1]) * t - centre[1];
        const r = Math.hypot(x, y);
        if (r < 1e-6) continue;
        const k = bucketOf(Math.atan2(y, x));
        sum[k] += r;
        hits[k]++;
      }
    }
  }
  const filled = hits.filter((h) => h > 0).length;
  // A registration that does not actually go round (an arc, a broken ring) has
  // no circle to draw; say so instead of inventing the missing two thirds.
  if (filled < RING_PROFILE_BUCKETS * 0.9) return null;
  const out = new Array<number>(RING_PROFILE_BUCKETS).fill(0);
  for (let k = 0; k < RING_PROFILE_BUCKETS; k++) {
    out[k] = hits[k]! > 0 ? sum[k]! / hits[k]! : 0;
  }
  // Circularly fill the few buckets a coarse polyline may have missed.
  for (let k = 0; k < RING_PROFILE_BUCKETS; k++) {
    if (out[k]! > 0) continue;
    let lo = k;
    let hi = k;
    while (out[(lo + RING_PROFILE_BUCKETS) % RING_PROFILE_BUCKETS] === 0) lo--;
    while (out[hi % RING_PROFILE_BUCKETS] === 0) hi++;
    const a = out[((lo % RING_PROFILE_BUCKETS) + RING_PROFILE_BUCKETS) % RING_PROFILE_BUCKETS]!;
    const b = out[hi % RING_PROFILE_BUCKETS]!;
    out[k] = a + ((b - a) * (k - lo)) / (hi - lo);
  }
  return out;
}

/**
 * The arms that break the kerb. An arm is any non-ring approach at a node that
 * sits on the ring; its gap is as wide as its own drawn carriageway plus the
 * entry flare, subtended at the outer edge. Derived from the network the world
 * is already built from, so a map cannot post a mouth it does not have.
 */
function ringMouths(
  centre: Vec2,
  ringIds: ReadonlySet<string>,
  ringHalfWidthM: number,
  profile: readonly number[],
  network: RoadNetwork,
): RingMouth[] {
  const out: RingMouth[] = [];
  for (const node of network.nodes.values()) {
    if (!node.approaches.some((a) => ringIds.has(a.edgeId))) continue;
    const bearing = Math.atan2(node.pos[1] - centre[1], node.pos[0] - centre[0]);
    const outerR = (profile[bucketOf(bearing)] ?? 0) + ringHalfWidthM;
    if (outerR < 1) continue;
    for (const ap of node.approaches) {
      if (ringIds.has(ap.edgeId)) continue;
      const travelHalf = Math.max(0.5, ap.halfWidth - ap.parkingM);
      const halfM = Math.min(outerR * 0.98, travelHalf + RING_MOUTH_FLARE_M);
      out.push({ bearing, halfAngle: Math.asin(halfM / outerR), armEdgeId: ap.edgeId });
    }
  }
  return out;
}

/** One roundabout, resolved into everything the geometry passes need. */
export interface RoundaboutRing {
  id: string;
  /** District-space centre, straight out of `roundabouts[]`. */
  centre: Vec2;
  /** Tightest measured distance from the centre to the ring centreline. */
  ringRadiusM: number;
  /** Drawn travel half width of the widest registered ring edge. */
  ringHalfWidthM: number;
  /** Widest lane count on the ring (2+ ⇒ the circulatory lanes are divided). */
  ringLanes: number;
  /** Edge ids of the circulatory carriageway, as registered. */
  ringEdgeIds: ReadonlySet<string>;
  /**
   * Outer radius of the central island, or null when the interior is not
   * actually free (see the module header — d2-v1). Null means: draw no island,
   * clip no junction pad, change nothing about this registration.
   */
  islandRadiusM: number | null;
  /** Why the island was refused, for the census/test to state rather than guess. */
  refusedBecause: string | null;
  /**
   * FR-22, THE OUTER HALF. Radius of the ring CENTRELINE at bearing bucket i
   * (`RING_PROFILE_BUCKETS` buckets of 1°), derived by walking the registered
   * ring polylines. On a synthetic ring every bucket holds the same number and
   * the profile IS a circle; on an OSM ring that wanders (d2-v1: 26.8…29.3
   * against a declared 28) it follows the asphalt that is actually drawn.
   */
  centreProfileM: readonly number[];
  /**
   * Where an ARM breaks the outer kerb: bearing from the centre + the half
   * angle its carriageway and entry flare subtend at the outer edge. Everything
   * that is not a mouth is kerb, all the way round.
   */
  mouths: readonly RingMouth[];
}

/** One entry/exit mouth in the ring's outer kerb. */
export interface RingMouth {
  /** Bearing of the arm node from the ring centre, radians. */
  bearing: number;
  /** Half the angular width of the gap, radians. */
  halfAngle: number;
  /** The arm's edge id — so a test can name the mouth it is standing in. */
  armEdgeId: string;
}

/** Distance from `c` to the swept carriageway band of segment a→b, half width h.
 *  Zero when `c` is ON the drawn asphalt. A band, not a capsule: an arm that
 *  ENDS on the ring approaches the centre no closer than its endpoint, because
 *  its width runs tangentially, and a capsule test would wrongly veto the very
 *  islands this module exists to draw. */
function bandDistance(c: Vec2, a: Vec2, b: Vec2, h: number): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l = Math.hypot(vx, vy);
  if (l < 1e-9) return Math.max(0, Math.hypot(c[0] - a[0], c[1] - a[1]) - h);
  const ux = vx / l;
  const uy = vy / l;
  const dx = c[0] - a[0];
  const dy = c[1] - a[1];
  const along = dx * ux + dy * uy;
  const perp = Math.abs(-dx * uy + dy * ux);
  const outAlong = along < 0 ? -along : along > l ? along - l : 0;
  return Math.hypot(outAlong, Math.max(0, perp - h));
}

/** Resolve every registered roundabout into a RoundaboutRing. */
export function analyzeRoundabouts(district: District, network: RoadNetwork): RoundaboutRing[] {
  const edgeById = new Map<string, DistrictEdge>(district.roads.edges.map((e) => [e.id, e]));
  const out: RoundaboutRing[] = [];

  for (const rb of district.roundabouts ?? []) {
    const centre: Vec2 = [rb.x, rb.y];
    const ringIds = new Set(rb.edgeIds);

    let ringRadiusM = Infinity;
    let ringHalfWidthM = 0;
    let ringLanes = 1;
    // Sharpest turn between consecutive ring segments — see the miter note below.
    let maxTurnRad = 0;
    for (const id of rb.edgeIds) {
      const edge = edgeById.get(id);
      if (!edge) continue;
      ringHalfWidthM = Math.max(ringHalfWidthM, edgeTravelHalfWidth(edge));
      ringLanes = Math.max(ringLanes, Math.max(1, edge.lanes));
      const g = edge.geometry as Vec2[];
      // Distance to the SEGMENTS, not to the vertices: a ring is stored as a
      // chorded polyline, so its chords sag INSIDE the circle its vertices sit
      // on (0.15 m on rb-mini's 15° steps). Measuring vertices only would put
      // the island kerb under the asphalt by exactly that sag.
      for (let i = 0; i + 1 < g.length; i++) {
        ringRadiusM = Math.min(ringRadiusM, bandDistance(centre, g[i]!, g[i + 1]!, 0));
        if (i + 2 < g.length) {
          const a: Vec2 = [g[i + 1]![0] - g[i]![0], g[i + 1]![1] - g[i]![1]];
          const b: Vec2 = [g[i + 2]![0] - g[i + 1]![0], g[i + 2]![1] - g[i + 1]![1]];
          const la = Math.hypot(a[0], a[1]);
          const lb = Math.hypot(b[0], b[1]);
          if (la > 1e-9 && lb > 1e-9) {
            const cos = Math.min(1, Math.max(-1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)));
            maxTurnRad = Math.max(maxTurnRad, Math.acos(cos));
          }
        }
      }
    }
    if (!Number.isFinite(ringRadiusM) || ringHalfWidthM <= 0) continue;

    // The ribbon sweep MITERS its cross-section at every polyline vertex, so
    // the drawn inner edge reaches halfWidth / cos(turn/2) inboard — further
    // than halfWidth. Give the kerb that back, or a chorded ring lays a
    // centimetre or two of asphalt over the island it is supposed to bound.
    const miterExcessM = ringHalfWidthM * (1 / Math.cos(maxTurnRad / 2) - 1);
    const fromRing = ringRadiusM - ringHalfWidthM - miterExcessM;
    let limit = fromRing;
    let intruder: string | null = null;
    for (const edge of district.roads.edges) {
      if (ringIds.has(edge.id)) continue;
      const h = edgeHalfWidth(edge);
      const g = edge.geometry as Vec2[];
      for (let i = 0; i + 1 < g.length; i++) {
        const d = bandDistance(centre, g[i]!, g[i + 1]!, h) - ISLAND_INTRUSION_CLEARANCE_M;
        if (d < limit) {
          limit = d;
          intruder = edge.id;
        }
      }
    }

    let islandRadiusM: number | null = Math.min(fromRing, limit);
    let refusedBecause: string | null = null;
    if (islandRadiusM < ISLAND_MIN_RADIUS_M) {
      refusedBecause =
        intruder === null
          ? `ring too tight for its own carriageway (r ${ringRadiusM.toFixed(2)} − half ${ringHalfWidthM.toFixed(2)})`
          : `edge ${intruder} is drawn through the interior`;
      islandRadiusM = null;
    } else if (islandRadiusM < fromRing * ISLAND_MIN_SURVIVING_FRACTION) {
      refusedBecause = `edge ${intruder} is drawn through the interior (only ${islandRadiusM.toFixed(2)} m of ${fromRing.toFixed(2)} m survives)`;
      islandRadiusM = null;
    }

    // FR-22, the outer half. Both are derived, both may come back empty, and an
    // empty one means "keep today's per-edge strips" — never "draw a lie".
    const profile = centreProfile(centre, ringIds, edgeById);
    const mouths = profile ? ringMouths(centre, ringIds, ringHalfWidthM, profile, network) : [];
    // A ring whose arms already eat the circle has no circle left to draw.
    const mouthFraction = mouths.reduce((s, m) => s + (2 * m.halfAngle) / TAU, 0);
    const drawCircle = profile !== null && mouthFraction <= RING_MAX_MOUTH_FRACTION;

    out.push({
      id: rb.id,
      centre,
      ringRadiusM,
      ringHalfWidthM,
      centreProfileM: drawCircle ? profile! : [],
      mouths: drawCircle ? mouths : [],
      ringLanes,
      ringEdgeIds: ringIds,
      islandRadiusM,
      refusedBecause,
    });
  }
  return out;
}

/**
 * The island a point falls inside, or null. Used by the road builder to keep
 * junction asphalt and junction kerbs OUT of the middle of a ring — the second
 * half of the fix, without which the pads simply reappear on top of the disc.
 */
export function islandContaining(
  rings: readonly RoundaboutRing[],
  p: Vec2,
): RoundaboutRing | null {
  for (const ring of rings) {
    if (ring.islandRadiusM === null) continue;
    if (Math.hypot(p[0] - ring.centre[0], p[1] - ring.centre[1]) < ring.islandRadiusM - 1e-6) {
      return ring;
    }
  }
  return null;
}

/**
 * Does this ring carry a DERIVED circular outer kerb? False keeps every
 * consumer on the pre-FR-22 path byte for byte (a broken registration, or one
 * whose arms eat the circle).
 */
export function hasOuterKerb(ring: RoundaboutRing): boolean {
  return ring.centreProfileM.length === RING_PROFILE_BUCKETS;
}

/**
 * The ring a NODE belongs to — its position sits on the circulatory
 * carriageway. This is the scope of the outer clip below: only the arm↔ring
 * pads are clipped, so a junction 200 m away is never dragged onto a circle it
 * has nothing to do with.
 */
export function ringAtPoint(rings: readonly RoundaboutRing[], p: Vec2): RoundaboutRing | null {
  for (const ring of rings) {
    if (!hasOuterKerb(ring)) continue;
    const dx = p[0] - ring.centre[0];
    const dy = p[1] - ring.centre[1];
    const r = Math.hypot(dx, dy);
    if (r < 1e-6) continue;
    if (Math.abs(r - ringCentreRadiusAt(ring, Math.atan2(dy, dx))) <= ring.ringHalfWidthM + 2) {
      return ring;
    }
  }
  return null;
}

/**
 * Pull `p` radially back onto the ring's outer edge — the mirror of
 * `clipOutOfIslands`, and the other half of the same sentence. A junction pad
 * at an arm↔ring node opens at the ARM's radius (17.125 m on rb-mini), so its
 * boundary and its corner fillets flare metres past the circulatory
 * carriageway on bearings no arm points at: probed at up to +10.73 m. Inside a
 * MOUTH nothing is clipped, because that is where the road really does leave
 * the circle. Points already inside come back untouched.
 */
export function clipIntoRingOuter(ring: RoundaboutRing, p: Vec2): Vec2 {
  const dx = p[0] - ring.centre[0];
  const dy = p[1] - ring.centre[1];
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return p;
  const bearing = Math.atan2(dy, dx);
  if (ringBearingInMouth(ring, bearing)) return p;
  const outer = ringOuterRadiusAt(ring, bearing);
  if (d <= outer + 1e-6) return p;
  const s = outer / d;
  return [ring.centre[0] + dx * s, ring.centre[1] + dy * s];
}

/**
 * The mouth-free arcs of the ring CENTRELINE, as dense polylines. `buildRoads`
 * sweeps each one with the ordinary pavement cross-section at the ring's own
 * half width, so the outer kerb of a roundabout is built by exactly the code
 * that builds every other kerb in the world — same profile, same vertex
 * colours, same collider — and only its SHAPE comes from here.
 *
 * Returned counter-clockwise in district space, which is also the direction
 * right-hand traffic circulates; `ringOutwardSide` still derives the side from
 * the geometry rather than trusting that.
 */
export function ringOuterKerbRuns(ring: RoundaboutRing): Vec2[][] {
  if (!hasOuterKerb(ring)) return [];
  const N = RING_PROFILE_BUCKETS;
  const bearingOf = (k: number) => ((k % N) + N) % N * (TAU / N);
  const stationAt = (k: number): Vec2 => {
    const a = bearingOf(k);
    const r = ring.centreProfileM[((k % N) + N) % N]!;
    return [ring.centre[0] + Math.cos(a) * r, ring.centre[1] + Math.sin(a) * r];
  };
  const open = Array.from({ length: N }, (_, k) => !ringBearingInMouth(ring, bearingOf(k) + TAU / (2 * N)));

  // No mouth at all: one closed loop.
  if (open.every(Boolean)) {
    const loop: Vec2[] = [];
    for (let k = 0; k <= N; k++) loop.push(stationAt(k));
    return [loop];
  }
  if (!open.some(Boolean)) return [];

  // Start at a bucket that FOLLOWS a mouth, so no run is split at k = 0.
  let start = 0;
  while (!(open[start]! && !open[(start + N - 1) % N]!)) start++;

  // Collect runs as BUCKET INDEX SPANS, then turn them into polylines. Indices,
  // not re-derived bearings: the seam fix below is "one bucket further", which
  // is unambiguous on an index and error-prone on an angle.
  const spans: Array<[number, number]> = [];
  let from: number | null = null;
  for (let i = 0; i < N; i++) {
    const k = start + i;
    if (open[k % N]!) {
      if (from === null) from = k;
    } else if (from !== null) {
      spans.push([from, k - 1]);
      from = null;
    }
  }
  if (from !== null) spans.push([from, start + N - 1]);

  const perBucketM = (TAU * ring.ringRadiusM) / N;
  const minBuckets = Math.max(2, Math.ceil(RING_MIN_KERB_RUN_M / perBucketM));
  const out: Vec2[][] = [];
  for (const [a, b] of spans) {
    if (b - a + 1 < minBuckets) continue;
    // THE SEAM. A strip is quads BETWEEN stations, so a span of buckets a…b
    // needs stations a−1…b+1 to have kerb over every one of them — measured as
    // a 1-of-52 hole on rb-2lane before this line. Tucking the last metre of
    // kerb into the mouth is also what a real entry looks like: the flare
    // starts AT the kerb, it does not start beside it.
    const run: Vec2[] = [];
    for (let k = a - 1; k <= b + 1; k++) run.push(stationAt(k));
    out.push(run);
  }
  return out;
}

/** Push `p` radially out onto the island's kerb line. Points already outside
 *  come back untouched, so a pad that never entered the ring is byte-identical. */
export function clipOutOfIslands(rings: readonly RoundaboutRing[], p: Vec2): Vec2 {
  const ring = islandContaining(rings, p);
  if (!ring || ring.islandRadiusM === null) return p;
  const dx = p[0] - ring.centre[0];
  const dy = p[1] - ring.centre[1];
  const d = Math.hypot(dx, dy);
  // Dead centre has no radial direction; nudge north so the fan stays sane.
  if (d < 1e-6) return [ring.centre[0], ring.centre[1] + ring.islandRadiusM];
  const s = ring.islandRadiusM / d;
  return [ring.centre[0] + dx * s, ring.centre[1] + dy * s];
}

/**
 * Which side of a ring edge faces AWAY from the centre (+1 = right of travel).
 * Derived, never assumed: right-hand traffic circulates counter-clockwise so
 * the outside IS the driver's right, but an OSM ring can be digitised either
 * way and a kerb built on the wrong side would stand in the carriageway.
 */
export function ringOutwardSide(ring: RoundaboutRing, line: readonly Vec2[]): 1 | -1 {
  const mid = line[Math.floor(line.length / 2)]!;
  const prev = line[Math.max(0, Math.floor(line.length / 2) - 1)]!;
  const dir: Vec2 = [mid[0] - prev[0], mid[1] - prev[1]];
  const right = perpRight(dir);
  const radial: Vec2 = [mid[0] - ring.centre[0], mid[1] - ring.centre[1]];
  return right[0] * radial[0] + right[1] * radial[1] >= 0 ? 1 : -1;
}

// ---------------------------------------------------------------------------
// The island mesh
// ---------------------------------------------------------------------------

/** Radial segments of the island disc — 96 keeps the kerb read as a circle
 *  rather than a polygon at cockpit range on the widest shipped ring (34 m). */
const ISLAND_SEGMENTS = 96;
/** Concrete rim between the kerb face and the planting, m. */
export const ISLAND_KERB_BAND_M = 1.1;
/** Radial rings across the planted crown (smooth dome, cheap). */
const ISLAND_CROWN_RINGS = 6;

/**
 * HEIGHT OF THE PLANTED CROWN — and this is the measurement the whole module
 * turns on, so it is written down rather than tuned by feel.
 *
 * The first render of this pass drew the island FLAT at kerb height. From the
 * driver's seat, 46 m back on the south approach of rb-mini, it was invisible:
 * eye 1.2 m, island near edge 32 m ahead, so a 0.14 m disc sits 0.25° above the
 * road — about three pixels at 62° FOV. The top-down showed a perfect green
 * circle and the cockpit showed an empty grey plain. That is the exact trap
 * this wave exists to stop falling into: a fix that photographs well from a
 * camera the student never sits in.
 *
 * A real central island has bulk — mounded earth, shrubs, a monument — and that
 * bulk is what tells a driver at 50 m that the road ahead goes AROUND something.
 * It also teaches: you are not supposed to see across a roundabout, you are
 * supposed to look where you are going. Scaled with the ring so a 34 m island is
 * not a pancake and a 14 m one is not a hill.
 */
function crownRiseM(islandRadiusM: number): number {
  return Math.min(1.6, Math.max(0.8, islandRadiusM * 0.09));
}

/** Planting height at radius `r` on an island of rim radius `rim` — a raised
 *  cosine, so the crown meets the concrete rim tangentially (no crease). */
function crownHeightAt(r: number, rim: number, rise: number): number {
  if (rim <= 1e-6) return SIDEWALK_TOP_Y;
  const t = Math.min(1, Math.max(0, r / rim));
  return SIDEWALK_TOP_Y + rise * 0.5 * (1 + Math.cos(Math.PI * t));
}

export interface RoundaboutBuildResult {
  /** Islands actually drawn (a refused registration is not counted). */
  islands: number;
  /** Ring divider dashes painted (0 on single-lane rings — nothing to divide). */
  ringDividerQuads: number;
  /** Planted crowns + shrubs of every island — its own mesh (see below). */
  islandPlanting: MeshAccumulator;
}

/**
 * KERB + RIM go into `sidewalks`: the concrete material, vertex-coloured like
 * every other kerb in the world, AND — the part that matters — the sidewalk
 * accumulator is what `colliders.sidewalks` is built from, so the island's kerb
 * stops a car exactly like a pavement edge does. A central island a student can
 * drive across is not an island.
 *
 * The PLANTING gets its own mesh instead of joining `terrain.grass`, and that
 * is deliberate: the terrain mesh carries a hard contract (every vertex at or
 * below 0.3 m, so ground relief never pokes through the flat physics plane you
 * drive on), which a mounded island would violate for a reason that has nothing
 * to do with terrain. One extra draw call, on the six districts that have a
 * ring, sharing the ground PBR set already uploaded — no new texture.
 */
function buildIsland(
  ring: RoundaboutRing,
  sidewalks: MeshAccumulator,
  planting: MeshAccumulator,
): void {
  const r = ring.islandRadiusM;
  if (r === null) return;
  const [cx, cy] = ring.centre;
  const chamferY = SIDEWALK_TOP_Y - CURB_CHAMFER_M;
  const rimInner = Math.max(0.5, r - ISLAND_KERB_BAND_M);
  const rise = crownRiseM(r);
  const foot: [number, number, number] = [CURB_FOOT_TINT, CURB_FOOT_TINT, CURB_FOOT_TINT];

  // Ring of kerb stations: foot, top of the vertical face, chamfer top, rim
  // inner — the same four-vertex profile a sidewalk strip uses, so consecutive
  // stations quad up identically.
  type Station = { cb: number; ct: number; xt: number; ri: number };
  const stations: Station[] = [];

  for (let i = 0; i <= ISLAND_SEGMENTS; i++) {
    const a = (i / ISLAND_SEGMENTS) * Math.PI * 2;
    const ox = Math.cos(a);
    const oy = Math.sin(a);
    const outer: Vec2 = [cx + ox * r, cy + oy * r];
    const chamfer: Vec2 = [cx + ox * (r - CURB_CHAMFER_M), cy + oy * (r - CURB_CHAMFER_M)];
    const rim: Vec2 = [cx + ox * rimInner, cy + oy * rimInner];
    // Outward normal in world space (district y → −z).
    const nOut: [number, number, number] = [ox, 0, -oy];
    const nChamfer: [number, number, number] = [
      ox * Math.SQRT1_2,
      Math.SQRT1_2,
      -oy * Math.SQRT1_2,
    ];
    const v = (i / ISLAND_SEGMENTS) * (2 * Math.PI * r) * 0.5; // arclength UV
    stations.push({
      cb: sidewalks.vertex(toWorld(outer[0], outer[1], ROAD_Y), nOut, [0, v], foot),
      ct: sidewalks.vertex(toWorld(outer[0], outer[1], chamferY), nOut, [0.07, v]),
      xt: sidewalks.vertex(toWorld(chamfer[0], chamfer[1], SIDEWALK_TOP_Y), nChamfer, [0.1, v]),
      ri: sidewalks.vertex(toWorld(rim[0], rim[1], SIDEWALK_TOP_Y), UP, [0.9, v]),
    });
  }

  for (let i = 0; i < ISLAND_SEGMENTS; i++) {
    const a = stations[i]!;
    const b = stations[i + 1]!;
    // The disc's interior is to the LEFT of travel round the ring of stations
    // (stations run counter-clockwise in district space), so the kerb face —
    // which must look OUTWARD, away from the island — is wound (b0, a0, a1, b1).
    sidewalks.quad(b.cb, a.cb, a.ct, b.ct); // vertical kerb face, faces the road
    sidewalks.quad(b.ct, a.ct, a.xt, b.xt); // 45° chamfer (catches the low sun)
    sidewalks.quad(b.xt, a.xt, a.ri, b.ri); // concrete rim, flat, faces up
  }

  // -- planted crown ---------------------------------------------------------
  const grid: number[][] = [];
  for (let k = 0; k <= ISLAND_CROWN_RINGS; k++) {
    const rr = rimInner * (1 - k / ISLAND_CROWN_RINGS);
    const h = crownHeightAt(rr, rimInner, rise);
    // dh/dr of the raised cosine, for the surface normal.
    const dhdr =
      rimInner <= 1e-6
        ? 0
        : -rise * 0.5 * (Math.PI / rimInner) * Math.sin((Math.PI * rr) / rimInner);
    const row: number[] = [];
    for (let i = 0; i <= ISLAND_SEGMENTS; i++) {
      const a = (i / ISLAND_SEGMENTS) * Math.PI * 2;
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      const x = cx + ox * rr;
      const y = cy + oy * rr;
      // Same district-gradient → world-normal form as terrain.ts.
      const gx = dhdr * ox;
      const gy = dhdr * oy;
      const inv = 1 / Math.hypot(gx, 1, gy);
      row.push(
        planting.vertex([x, h, -y], [-gx * inv, inv, gy * inv], [x / 8, y / 8]),
      );
    }
    grid.push(row);
  }
  for (let k = 0; k < ISLAND_CROWN_RINGS; k++) {
    const outerRow = grid[k]!;
    const innerRow = grid[k + 1]!;
    for (let i = 0; i < ISLAND_SEGMENTS; i++) {
      // District-CCW seen from above.
      planting.quad(outerRow[i]!, outerRow[i + 1]!, innerRow[i + 1]!, innerRow[i]!);
    }
  }

  // -- shrubs ----------------------------------------------------------------
  // Deterministic, evenly spaced, well inside the rim so they never stand
  // between an entering driver and the circulating traffic he must yield to —
  // they close the view ACROSS the ring, which is what a real island does.
  const shrubRing = rimInner * 0.55;
  const count = Math.min(14, Math.max(5, Math.round((2 * Math.PI * shrubRing) / 9)));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / 7;
    const x = cx + Math.cos(a) * shrubRing;
    const y = cy + Math.sin(a) * shrubRing;
    buildShrub(planting, x, y, crownHeightAt(shrubRing, rimInner, rise));
  }
}

/** Radius / height of one island shrub, m — a clipped ornamental, not a tree. */
const SHRUB_R = 1.15;
const SHRUB_H = 1.9;
const SHRUB_SEGMENTS = 8;
const SHRUB_RINGS = 3;

/** One dome-shaped shrub standing on the crown at (x, y, baseY). */
function buildShrub(acc: MeshAccumulator, x: number, y: number, baseY: number): void {
  const rows: number[][] = [];
  for (let k = 0; k <= SHRUB_RINGS; k++) {
    const t = k / SHRUB_RINGS; // 0 = base, 1 = apex
    const rr = SHRUB_R * Math.cos((t * Math.PI) / 2);
    const hh = baseY + SHRUB_H * Math.sin((t * Math.PI) / 2);
    const row: number[] = [];
    for (let i = 0; i <= SHRUB_SEGMENTS; i++) {
      const a = (i / SHRUB_SEGMENTS) * Math.PI * 2;
      const ox = Math.cos(a);
      const oy = Math.sin(a);
      // Outward-and-up normal of a hemisphere-ish surface.
      const n: [number, number, number] = [ox * (1 - t), Math.max(0.3, t), -oy * (1 - t)];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      row.push(
        acc.vertex(
          [x + ox * rr, hh, -(y + oy * rr)],
          [n[0] / l, n[1] / l, n[2] / l],
          [(x + ox * rr) / 4, (y + oy * rr) / 4],
        ),
      );
    }
    rows.push(row);
  }
  for (let k = 0; k < SHRUB_RINGS; k++) {
    const lo = rows[k]!;
    const hi = rows[k + 1]!;
    for (let i = 0; i < SHRUB_SEGMENTS; i++) {
      acc.quad(lo[i]!, lo[i + 1]!, hi[i + 1]!, hi[i]!);
    }
  }
}

/**
 * The circular lane divider of a MULTI-lane ring — the one ring marking a
 * Bulgarian roundabout actually carries, and the thing that tells a driver in
 * the outer lane that the inner lane is a lane and not shoulder.
 *
 * It has to be painted here rather than by the lane-line pass, and that is the
 * whole point: `analyzeNetwork` trims every ring arc back by the junction open
 * radius, which on a four-arm ring eats 80° of every 90° quarter. What survived
 * for markings.ts to paint was a 6 m stub per quarter — the founder's „no ring
 * lane markings" was the lane pass being starved of ring, not switched off.
 * A circle is not a polyline sum; it is drawn as a circle.
 *
 * Single-lane rings get nothing, deliberately: there is no boundary to draw and
 * an invented circle of paint would be a new falsehood on the map.
 */
function buildRingDivider(ring: RoundaboutRing, markings: MeshAccumulator): number {
  if (ring.ringLanes < 2) return 0;
  // Boundary k = 1 of the ring's own cross-section, measured from its inner
  // edge — identical arithmetic to markings.ts's lane boundaries.
  const travelHalf = ring.ringHalfWidthM;
  const boundaryOffset = -travelHalf + LANE_WIDTH_M;
  const radius = ring.ringRadiusM + boundaryOffset;
  if (radius <= 1) return 0;

  const circumference = 2 * Math.PI * radius;
  const pitch = DASH_LENGTH_M + DASH_GAP_M;
  const count = Math.max(4, Math.round(circumference / pitch));
  const step = circumference / count;
  const halfW = DASH_WIDTH_M / 2;
  let quads = 0;

  for (let i = 0; i < count; i++) {
    const a0 = ((i * step) / radius) % (Math.PI * 2);
    const a1 = a0 + DASH_LENGTH_M / radius;
    // A dash short enough (3 m on an ≥18 m radius) that a straight quad is
    // within a centimetre of the arc — the same approximation every dashed
    // line on a curved street already makes.
    const p0: Vec2 = [
      ring.centre[0] + Math.cos(a0) * radius,
      ring.centre[1] + Math.sin(a0) * radius,
    ];
    const p1: Vec2 = [
      ring.centre[0] + Math.cos(a1) * radius,
      ring.centre[1] + Math.sin(a1) * radius,
    ];
    const dir: Vec2 = [p1[0] - p0[0], p1[1] - p0[1]];
    const l = Math.hypot(dir[0], dir[1]);
    if (l < 1e-6) continue;
    const u: Vec2 = [dir[0] / l, dir[1] / l];
    const rgt = perpRight(u);
    const corners: Vec2[] = [
      add(p0, mul(rgt, -halfW)),
      add(p0, mul(rgt, halfW)),
      add(p1, mul(rgt, halfW)),
      add(p1, mul(rgt, -halfW)),
    ];
    const idx = corners.map((c, k) =>
      markings.vertex(toWorld(c[0], c[1], MARKING_Y), UP, [k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0]),
    );
    markings.quad(idx[0]!, idx[1]!, idx[2]!, idx[3]!);
    quads++;
  }
  return quads;
}

/**
 * Draw every roundabout the district registers: the kerbed central island and
 * the ring's circular markings. Meshes are the EXISTING sidewalk/terrain/paint
 * accumulators, so this pass adds geometry and zero draw calls.
 */
export function buildRoundabouts(
  rings: readonly RoundaboutRing[],
  meshes: { sidewalks: MeshAccumulator; markings: MeshAccumulator },
): RoundaboutBuildResult {
  const islandPlanting = new MeshAccumulator();
  let islands = 0;
  let ringDividerQuads = 0;
  for (const ring of rings) {
    if (ring.islandRadiusM !== null) {
      buildIsland(ring, meshes.sidewalks, islandPlanting);
      islands++;
    }
    ringDividerQuads += buildRingDivider(ring, meshes.markings);
  }
  return { islands, ringDividerQuads, islandPlanting };
}
