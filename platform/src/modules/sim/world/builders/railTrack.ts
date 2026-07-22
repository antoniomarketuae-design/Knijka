/**
 * Rail-track deck geometry (RAIL-TRACK-VISUAL slice) — every `railCrossing`
 * zone span finally SHOWS the track it grades. Until now a rail crossing put
 * only a crossbuck + warning sign at the kerb (builders/zoneSigns.ts) and
 * NOTHING on the carriageway, so the road read as a plain street — the founder
 * approved "full realism" for railway level crossings.
 *
 * Pure data pass, additive by construction (the zoneSigns / waterDecals
 * contract): a district without a `railCrossing` zone yields ZERO quads, so
 * every shipped rail-free map builds byte-identical geometry. Renders for BOTH
 * guarded and unguarded crossings — the deck is the same; the barrier arm +
 * lights are furniture handled elsewhere (zoneSigns / RailBarriers).
 *
 * Geometry, per span (a short, ~straight stretch of track — stamped from a
 * single frame at the band centre, like a zone sign, not swept):
 *  - a dark ballast/sleeper BAND quad the full carriageway width across
 *    [fromM, toM];
 *  - evenly-spaced SLEEPER ties, each elongated ALONG travel (perpendicular to
 *    the rails) and repeated ACROSS the road;
 *  - two parallel steel RAILS running ACROSS the carriageway (i.e. along the
 *    crossing / train direction), raised as thin bars with a top + two sides.
 *
 * Two accumulators come out so the renderer can give each its own material:
 *  - `deck` (vertex-coloured, matte): the ballast band + sleepers;
 *  - `rails` (single metallic colour): the two steel rails.
 *
 * Coordinate frame mirrors markings.ts / waterDecals.ts exactly: district
 * space x-east / y-north, zone fromM/toM are arclength along the FULL edge
 * geometry (the same s-measure zoneSigns + the runtime use), and every emitted
 * position is world space via toWorld (x, h, -y). `along` = the edge tangent
 * (travel), `across` = perpRight(along) (right of travel — the crossing runs
 * this way).
 */

import { PERCEPTUAL_ROAD_SCALE } from "../../contracts";
import type { District } from "../types";
import { MARKING_Y } from "./constants";
import {
  add,
  mul,
  perpRight,
  pointAlong,
  polylineLength,
  type Vec2,
} from "./math2d";
import { dirToWorld, MeshAccumulator, toWorld, UP } from "./mesh";
import type { RoadNetwork } from "./network";

// --- heights (stacked, all above the paint so a rail deck reads over any
// lane paint that might share the span) -------------------------------------
/** Ballast band — the lowest layer, a hair over the marking plane. */
export const RAIL_BALLAST_Y = MARKING_Y + 0.004;
/** Sleeper ties + rail feet sit on the ballast. */
export const RAIL_SLEEPER_Y = RAIL_BALLAST_Y + 0.006;
/** Steel rail crown height above the ties (thin raised bar, visual only —
 *  the rails are NOT colliders; the flat ground stays drivable). */
export const RAIL_RAISE_M = 0.05;
export const RAIL_HEAD_Y = RAIL_SLEEPER_Y + RAIL_RAISE_M;

// --- plan dimensions --------------------------------------------------------
/** Keep the deck inside the kerbs (halfWidth reaches the curb face). */
export const RAIL_DECK_EDGE_INSET_M = 0.25;
/** Between-rail spacing (standard gauge 1.435 m, perceptually scaled with the
 *  road cross-section so a single track reads proportionate to the 2.5× lanes). */
export const RAIL_GAUGE_M = 1.435 * PERCEPTUAL_ROAD_SCALE;
/** Rail head width along travel (a real ~7 cm head reads like thread at this
 *  scale; widened so the crown catches light). */
export const RAIL_HEAD_WIDTH_M = 0.3;
/** Sleeper tie width along its short axis (across the road). */
export const SLEEPER_WIDTH_M = 0.6;
/** Tie pitch across the carriageway. */
export const SLEEPER_SPACING_M = 1.5;
/** Each tie overhangs the outer rail by this much (real ties run past the rails). */
export const SLEEPER_OVERHANG_M = 0.7;
/** Spans shorter than this build nothing (degenerate data). */
const MIN_SPAN_M = 0.5;

/** Ballast (DARK crushed stone) — vertex colour on the deck mesh. Kept dark
 *  and close to the sleeper tone on purpose: a LIGHT ballast + dark ties read
 *  as a zebra crosswalk, not a track bed (founder R0). The whole crossing must
 *  read as one distinct DARK strip across the road, with the steel rails the
 *  thing that stands out. */
const BALLAST_COLOR: [number, number, number] = [0.2, 0.19, 0.18];
/** Creosote sleeper tie (dark brown) — a touch darker than the ballast so the
 *  ties read as ties without the high contrast that looked like crosswalk bars. */
const SLEEPER_COLOR: [number, number, number] = [0.12, 0.1, 0.08];

export interface RailTrackBuildResult {
  /** Ballast band + sleeper ties (dark, vertex-coloured, matte). */
  deck: MeshAccumulator;
  /** Two steel rails running across the carriageway (metallic). */
  rails: MeshAccumulator;
  /** Deck quads emitted (1 ballast band + N sleeper ties per span). */
  deckQuads: number;
  /** Rail quads emitted (6 per span — 2 rails × top + 2 sides). */
  railQuads: number;
}

type V3 = [number, number, number];
const v3sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const v3dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function v3norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/**
 * Add one planar quad (world-space corners CCW-ish), orienting it to face
 * `outward`: the geometric normal is computed from the winding and, if it
 * opposes `outward`, the winding is reversed so the front face (three.js culls
 * the back) always faces out — no per-face winding derivation to get wrong.
 */
function addQuad(
  acc: MeshAccumulator,
  corners: [V3, V3, V3, V3],
  outward: V3,
  color?: [number, number, number],
): void {
  let [c0, c1, c2, c3] = corners;
  let n = v3norm(v3cross(v3sub(c1, c0), v3sub(c2, c0)));
  if (v3dot(n, outward) < 0) {
    [c1, c3] = [c3, c1];
    n = [-n[0], -n[1], -n[2]];
  }
  const i0 = acc.vertex(c0, n, [0, 0], color);
  const i1 = acc.vertex(c1, n, [1, 0], color);
  const i2 = acc.vertex(c2, n, [1, 1], color);
  const i3 = acc.vertex(c3, n, [0, 1], color);
  acc.quad(i0, i1, i2, i3);
}

/** A flat (up-facing) quad centred at district `c`, extending ±alongHalf along
 *  `along` and ±acrossHalf along `across`, at height `y`. */
function flatQuad(
  acc: MeshAccumulator,
  c: Vec2,
  along: Vec2,
  across: Vec2,
  alongHalf: number,
  acrossHalf: number,
  y: number,
  color?: [number, number, number],
): void {
  const bl = add(add(c, mul(along, -alongHalf)), mul(across, -acrossHalf));
  const br = add(add(c, mul(along, -alongHalf)), mul(across, acrossHalf));
  const fr = add(add(c, mul(along, alongHalf)), mul(across, acrossHalf));
  const fl = add(add(c, mul(along, alongHalf)), mul(across, -acrossHalf));
  addQuad(
    acc,
    [
      toWorld(bl[0], bl[1], y),
      toWorld(br[0], br[1], y),
      toWorld(fr[0], fr[1], y),
      toWorld(fl[0], fl[1], y),
    ],
    UP,
    color,
  );
}

/**
 * Build the rail-track deck for every `railCrossing` zone. Output order follows
 * the authored zones order — deterministic, data-driven, seed-free.
 */
export function buildRailTracks(district: District, network: RoadNetwork): RailTrackBuildResult {
  const deck = new MeshAccumulator(true); // ballast/sleeper vertex colours
  const rails = new MeshAccumulator(false);
  let deckQuads = 0;
  let railQuads = 0;

  const zones = district.zones;
  if (!zones || zones.length === 0) return { deck, rails, deckQuads, railQuads };

  for (const zone of zones) {
    if (zone.kind !== "railCrossing") continue;
    if (!(Number.isFinite(zone.fromM) && Number.isFinite(zone.toM) && zone.fromM < zone.toM)) {
      continue;
    }
    const eb = network.edgeById.get(zone.edgeId);
    if (!eb) continue; // unknown edge — ignore (forward-compat contract)
    const g = eb.edge.geometry as Vec2[];
    if (g.length < 2) continue;

    const total = polylineLength(g);
    const from = Math.max(0, Math.min(zone.fromM, total));
    const to = Math.max(0, Math.min(zone.toM, total));
    const spanLen = to - from;
    if (spanLen < MIN_SPAN_M) continue;

    // Single stamp frame at the band centre (crossings are short + straight).
    const mid = (from + to) / 2;
    const { point: c, tangent } = pointAlong(g, mid);
    const along = tangent; // unit travel direction
    const across = perpRight(along); // right of travel — the crossing runs this way
    const halfW = eb.halfWidth - RAIL_DECK_EDGE_INSET_M; // full carriageway across
    if (halfW <= 0) continue;
    const bandHalf = spanLen / 2;

    // -- ballast band (full width across, full span along) -------------------
    flatQuad(deck, c, along, across, bandHalf, halfW, RAIL_BALLAST_Y, BALLAST_COLOR);
    deckQuads++;

    // -- sleeper ties: elongated ALONG travel, repeated ACROSS the road ------
    const fullW = 2 * halfW;
    const nTies = Math.max(1, Math.floor(fullW / SLEEPER_SPACING_M));
    const startOff = -((nTies - 1) * SLEEPER_SPACING_M) / 2;
    const tieHalfAlong = RAIL_GAUGE_M / 2 + SLEEPER_OVERHANG_M;
    const tieHalfAcross = SLEEPER_WIDTH_M / 2;
    for (let i = 0; i < nTies; i++) {
      const off = startOff + i * SLEEPER_SPACING_M;
      const tieC = add(c, mul(across, off));
      flatQuad(deck, tieC, along, across, tieHalfAlong, tieHalfAcross, RAIL_SLEEPER_Y, SLEEPER_COLOR);
      deckQuads++;
    }

    // -- two steel rails running ACROSS the road, raised as thin bars --------
    const railHalfW = RAIL_HEAD_WIDTH_M / 2; // along travel
    for (const s of [-1, 1] as const) {
      const railC = add(c, mul(along, (s * RAIL_GAUGE_M) / 2));
      // Rail top: spans ±halfW across (along `across`), ±railHalfW along travel.
      flatQuad(rails, railC, along, across, railHalfW, halfW, RAIL_HEAD_Y);
      railQuads++;
      // Two side faces at the along-edges of the head, dropping to the ties.
      for (const side of [-1, 1] as const) {
        const edgeMid = add(railC, mul(along, side * railHalfW));
        const low = add(edgeMid, mul(across, -halfW));
        const high = add(edgeMid, mul(across, halfW));
        addQuad(
          rails,
          [
            toWorld(low[0], low[1], RAIL_SLEEPER_Y),
            toWorld(high[0], high[1], RAIL_SLEEPER_Y),
            toWorld(high[0], high[1], RAIL_HEAD_Y),
            toWorld(low[0], low[1], RAIL_HEAD_Y),
          ],
          dirToWorld(mul(along, side)), // face outward along ±travel
        );
        railQuads++;
      }
    }
  }

  return { deck, rails, deckQuads, railQuads };
}
