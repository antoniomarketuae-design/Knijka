/**
 * THE ЖИЛИЩНА-ЗОНА GATEWAY — planters and bollards on the pavement at every
 * mouth of a living zone.
 *
 * WHY IT EXISTS — sc-pe-zone-living:37bbb618, major: „the world is not a home
 * zone … the drive happens on a wide multi-lane boulevard … nothing about the
 * geometry signals the zone the rule depends on." The paint half of that row
 * was answered by `calmedZoneKeepsWholeWidth` (no lane division inside the
 * zone) and the posts half by the Д15/Д16 pass in props.ts; what remained was
 * the MOUTH itself, which read as one more metre of the same street. The
 * founder ruled on 2026-09-27 that the zone gets a visible gateway („distinct
 * paving, planters or bollards at the mouth, or a narrower travel width").
 *
 * WHAT IS BUILT, per boundary and per kerb:
 *   · a short row of bollards along the kerb edge from the junction cut into
 *     the zone — the line that says „the street changes here";
 *   · a pair of planters FLANKING the Д15/Д16 plate that stands on that kerb,
 *     so the plate reads as the gate's post rather than as one more pole. If a
 *     kerb carries no plate the pair stands where one would.
 *
 * WHAT IS DELIBERATELY NOT BUILT, and why grading cannot move:
 *   · nothing on the carriageway. Every item stands on the pavement, clear of
 *     the kerb face by its own half-depth, so the ribbon, the lane graph, the
 *     traffic system and every graded surface are the ones that were there;
 *   · no collider. The pavement is already the kerb collider; these are
 *     render-only placements, like the lamp-derived furniture;
 *   · no narrower travel width. `roads.ts` sweeps the surface from
 *     `edgeHalfWidth`, which the runtime's lane graph and the lane-offset
 *     grading read too — narrowing it would move the ground under the whole
 *     lesson to make a picture;
 *   · no distinct paving. A second road material is a renderer change with a
 *     draw of its own for one mouth in one district; the gateway reads without
 *     it.
 *
 * WHERE A MOUTH IS: `livingZoneMouths` is the SAME boundary rule the Д15/Д16
 * pass posts from (props.ts calls it), so the gate and the plate cannot
 * disagree about where the zone begins. A boundary is a node where a
 * living-zone carriageway meets at least one arm that is not one; two zone
 * spans meeting are INSIDE the zone and get nothing. Measured over the corpus,
 * only pe-zone-v1 carries such an edge, so every other district builds an
 * empty list and is otherwise byte-identical.
 */

import type { ZoneGatewayKind, ZoneGatewayPlacement } from "../types";
import { livingZoneCarriageway, SIDEWALK_TOP_Y } from "./constants";
import { add, mul, perpRight, type Vec2 } from "./math2d";
import { toWorld } from "./mesh";
import { isBareVergeSide, type Approach, type RoadNetwork } from "./network";

/** Bollards: stations along the kerb from the junction cut, m. */
const GATEWAY_BOLLARD_ALONG_M: readonly number[] = [0.8, 2.0, 3.2, 4.4, 5.6, 6.8];
/** Bollards stand this far in from the kerb face (0.18 m post). */
const GATEWAY_BOLLARD_LATERAL_M = 0.45;
/** Planters stand this far in from the kerb face (0.56 m deep). */
const GATEWAY_PLANTER_LATERAL_M = 0.75;
/** Planters flank the plate at this distance either side of it, m. */
const GATEWAY_PLANTER_FLANK_M = 1.6;
/** Where the planter pair stands when the kerb has no plate, m from the cut. */
const GATEWAY_PLANTER_DEFAULT_ALONG_M = 8.0;
/** How far along the zone a plate may stand and still be THIS mouth's, m. */
const GATEWAY_PLATE_SEARCH_M = 30;
/** How far off the kerb line a plate may stand and still be on THIS kerb, m. */
const GATEWAY_PLATE_LATERAL_TOL_M = 1.5;
/** Nearest any gateway item may stand to a post, lamp, tree or pole, m. */
export const GATEWAY_CLEARANCE_M = 0.9;

/**
 * Every zone-side approach at a living-zone BOUNDARY, in network order — the
 * rule the Д15/Д16 pass posts from and the gateway builds from.
 */
export function livingZoneMouths(network: RoadNetwork): Approach[] {
  const out: Approach[] = [];
  for (const eb of network.edges) {
    if (!livingZoneCarriageway(eb.edge)) continue;
    for (const nodeId of [eb.edge.from, eb.edge.to]) {
      const info = network.nodes.get(nodeId);
      if (!info) continue;
      const others = info.approaches.filter((a) => a.edgeId !== eb.edge.id);
      if (!others.some((a) => !livingZoneCarriageway(a.edge))) continue;
      const ap = info.approaches.find((a) => a.edgeId === eb.edge.id);
      if (!ap) continue;
      out.push(ap);
    }
  }
  return out;
}

export interface ZoneGatewayInput {
  network: RoadNetwork;
  /** The Д15/Д16 plates already posted (district space). */
  plates: ReadonlyArray<{ at: Vec2 }>;
  /** Every post, lamp, tree and pole already standing (district space). */
  avoid: readonly Vec2[];
}

/** Build the gateway placements for every living-zone mouth. */
export function buildZoneGateways(input: ZoneGatewayInput): ZoneGatewayPlacement[] {
  const out: ZoneGatewayPlacement[] = [];
  const taken: Vec2[] = [...input.avoid];
  for (const ap of livingZoneMouths(input.network)) {
    const into = ap.dir; // away from the node, i.e. INTO the zone
    const yaw = Math.atan2(into[1], into[0]); // local +X along the kerb
    const eb = input.network.edgeById.get(ap.edgeId);
    const node = input.network.nodes.get(eb?.edge.from ?? "");
    // `side` is relative to INTO the zone; the bare-verge tag is relative to the
    // edge's own from→to, which INTO runs against when this mouth is its `to`.
    const alongEdge = node !== undefined && node.approaches.includes(ap) ? 1 : -1;
    for (const side of [1, -1] as const) {
      // No pavement on that verge, nothing to stand the gate on.
      if (isBareVergeSide(eb?.bareVerge ?? null, (side * alongEdge) as 1 | -1)) continue;
      const outward = mul(perpRight(into), side);
      const kerbAt = (along: number, lateral: number): Vec2 =>
        add(add(ap.cut, mul(into, along)), mul(outward, ap.halfWidth + lateral));

      const place = (kind: ZoneGatewayKind, along: number, lateral: number): void => {
        const p = kerbAt(along, lateral);
        if (taken.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < GATEWAY_CLEARANCE_M)) return;
        taken.push(p);
        out.push({ kind, position: toWorld(p[0], p[1], SIDEWALK_TOP_Y), yaw });
      };

      for (const along of GATEWAY_BOLLARD_ALONG_M) place("bollard", along, GATEWAY_BOLLARD_LATERAL_M);

      // The plate on THIS kerb of THIS mouth: nearest the cut, within reach.
      let plateAlong: number | null = null;
      for (const pl of input.plates) {
        const d: Vec2 = [pl.at[0] - ap.cut[0], pl.at[1] - ap.cut[1]];
        const along = d[0] * into[0] + d[1] * into[1];
        const lateral = d[0] * outward[0] + d[1] * outward[1] - ap.halfWidth;
        if (along < 0 || along > GATEWAY_PLATE_SEARCH_M) continue;
        if (lateral < 0 || lateral > GATEWAY_PLATE_LATERAL_TOL_M) continue;
        if (plateAlong === null || along < plateAlong) plateAlong = along;
      }
      const centre = plateAlong ?? GATEWAY_PLANTER_DEFAULT_ALONG_M;
      place("planter", centre - GATEWAY_PLANTER_FLANK_M, GATEWAY_PLANTER_LATERAL_M);
      place("planter", centre + GATEWAY_PLANTER_FLANK_M, GATEWAY_PLANTER_LATERAL_M);
    }
  }
  return out;
}
