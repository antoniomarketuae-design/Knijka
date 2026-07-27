/**
 * Central islands for scene stills — the disc a roundabout's `roundabouts[]`
 * entry describes but the world builder has no mesh for.
 *
 * THE DEFECT THIS EXISTS FOR (founder review 2026-07-27, q-krastovishta-064/065:
 * „it is not real roundabout - rather 4 small roundabouts", „we need proper 1
 * roundabout"). district-v1 declares a roundabout as {x, y, radius, edgeIds} and
 * the world builder consumes that for the Б1 + Д11 entry signs and the runtime's
 * circulating band — but it draws NO island. The middle of a ring is therefore
 * bare junction asphalt, and what a picture actually shows is the four junction
 * pads the builder opens at the arm↔ring joints (radius = widest approach half
 * width + curb fillet ≈ 17 m each). Four pads around an empty middle read as
 * four small roundabouts, which is exactly what the founder saw.
 *
 * So the still draws the island the district already declares. Nothing here is
 * invented: the centre and the ring radius come straight out of the file, and
 * the island's radius is the ring centreline radius minus the ring's OWN drawn
 * half-width — i.e. precisely the inner edge of the circulatory carriageway,
 * derived with the builder's own `edgeTravelHalfWidth` rule so paint, asphalt
 * and island cannot drift apart.
 *
 * Scope, stated plainly: this is the dev still route only. No graded geometry
 * moves, and the SIM still renders a ring without an island — that gap belongs
 * to sim/world's builders, not to a picture question.
 *
 * Pure data — no three.js, no React — so the node suite can assert it.
 */

import { LANE_WIDTH_M } from "@/modules/sim/world";
import type { District, DistrictEdge } from "@/modules/sim/world";

/**
 * Floor the world builder applies to a roundabout ring's travel half-width
 * (network.ts edgeTravelHalfWidth: „single-lane roundabout rings read too thin
 * — BG ring lanes are wide"). Mirrored so the island lands on the SAME inner
 * edge the asphalt ribbon is swept to.
 */
const RING_MIN_HALF_WIDTH_M = 2.4;

/** The drawn travel half-width of one ring edge, the builder's way. */
function ringEdgeHalfWidthM(edge: DistrictEdge): number {
  const lanes = Math.max(1, edge.lanes);
  return Math.max((lanes * LANE_WIDTH_M) / 2, RING_MIN_HALF_WIDTH_M);
}

/** One island to draw: district-space centre + the disc's outer radius. */
export interface RoundaboutIslandSpec {
  id: string;
  x: number;
  y: number;
  /** Outer radius of the island disc = ring centreline radius − ring half width. */
  radiusM: number;
}

/**
 * Every roundabout the district registers, as an island disc.
 *
 * A registration whose ring is so wide (or so tight) that no island survives is
 * SKIPPED rather than drawn at a degenerate radius — a zero-radius disc in the
 * middle of a junction would be a new lie, not a fix.
 */
export function roundaboutIslands(district: District): RoundaboutIslandSpec[] {
  const edgeById = new Map(district.roads.edges.map((e) => [e.id, e]));
  const out: RoundaboutIslandSpec[] = [];
  for (const rb of district.roundabouts ?? []) {
    // Widest registered ring edge wins: a mixed-width ring must not let the
    // island overlap the fattest carriageway.
    let half = RING_MIN_HALF_WIDTH_M;
    for (const id of rb.edgeIds) {
      const edge = edgeById.get(id);
      if (edge) half = Math.max(half, ringEdgeHalfWidthM(edge));
    }
    const radiusM = rb.radius - half;
    if (!(radiusM > 1)) continue; // no island survives — draw nothing
    out.push({ id: rb.id, x: rb.x, y: rb.y, radiusM });
  }
  return out;
}
