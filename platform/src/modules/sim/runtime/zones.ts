/**
 * sim/runtime — pedestrian-crossing zone tracker.
 *
 * Emits the SimTick zone events (rules/types.ts semantics):
 * - crossingZoneEntered — vehicle enters the ~35 m approach zone of a
 *   crossing. Re-emitted for the same crossing when the pedestrian flag flips
 *   while the vehicle is still inside (contract explicitly allows this).
 * - crossingPassed — the vehicle's position passes the crossing point
 *   (ahead → behind along the vehicle's heading, laterally close).
 *
 * A zone only arms when the vehicle is on the crossing's host edge or an edge
 * sharing a node with it — a parallel street must not trigger it (the
 * edge-adjacency gate, not the radius, carries that guarantee).
 * Exit uses a 38 m radius (hysteresis), emits `crossingZoneExited` and re-arms
 * the zone for re-entry.
 * Radii/lateral bounds scaled with the perceptual road scale: the outer lane
 * of a 6-lane arterial now runs ~20 m from the crossing point.
 *
 * WHICH CROSSINGS ARE GRADED (doc 87 A13/A16). Not all of them. A zone is built
 * only where the world gives the student a referent for the duty — the painted
 * пътека, or a жилищна зона whose law needs no paint. `gradesCrossingDuty` is
 * that question, and its zebra half is the PAINTER'S own condition, imported
 * from builders/constants.ts so paint and grading cannot drift (the discipline
 * doc 86 T1 established for lane paint, applied to crossings).
 *
 * Pedestrians: there is no traffic module yet, so `pedestrianOnCrossing` is
 * false until a query hook is installed (WorldRuntime.setPedestrianQuery) —
 * the traffic workstream plugs in without touching this file.
 */

import type { SimTickEvent } from "../rules/types";
import { gradesCrossingDuty } from "../world/builders/constants";
import type { District } from "./district";
import type { DistrictIndex } from "./spatial";

export const CROSSING_ZONE_RADIUS_M = 35;
const ZONE_EXIT_RADIUS_M = 38;
/** Max lateral distance for a legitimate "passed over the crossing" — must
 * cover the outermost scaled lane center (~20.3 m on 6-lane arterials). */
const PASS_LATERAL_MAX_M = 22;

export type PedestrianQuery = (crossingId: string) => boolean;

interface ZoneRt {
  id: string;
  x: number;
  y: number;
  /** Edge indices from which this zone can be armed. */
  armEdges: number[];
  // --- mutable state ---
  inside: boolean;
  passed: boolean;
  lastFlag: boolean;
  lastAheadM: number;
}

export class CrossingZoneTracker {
  private readonly zones: ZoneRt[] = [];
  private readonly zonesByEdge = new Map<number, number[]>();
  /** Zones currently `inside` (kept hot even if the vehicle changes edge). */
  private readonly active: number[] = [];

  constructor(district: District, index: DistrictIndex) {
    for (const c of district.crossings) {
      if (c.edgeId === null) continue; // crossing on a non-drivable way
      const host = index.edgeRtById(c.edgeId);
      if (host === null) continue;
      // THE WORLD REFERENT (doc 87 A13/A16). An `unmarked` node on an ordinary
      // street is bare asphalt: markings.ts draws nothing there, no sign stands
      // there, and §1 т.53 ДР ЗДвП says an unmarked place is not a пешеходна
      // пътека at all. Arming the zone anyway billed the 10-point опасна
      // PEDESTRIAN_CROSSING_TOO_FAST — and the yield and overtake duties — on
      // 14 such nodes (5 in district-v1, 9 in d2-v1), the two city maps the
      // curriculum and the mock exam run on. A student cannot learn from a
      // fault whose cause is invisible; he learns that the grader is arbitrary.
      // Census after this line: 109 crossings graded off paint, 1 off the
      // жилищна зона (pe-zone-v1's pz-x-1), 14 no longer graded at all.
      if (!gradesCrossingDuty(c, host.edge)) continue;
      const armEdges = new Set<number>([host.idx]);
      for (const nodeId of [host.edge.from, host.edge.to]) {
        for (const adj of index.edgesAtNode.get(nodeId) ?? []) armEdges.add(adj);
      }
      const zoneIdx = this.zones.length;
      this.zones.push({
        id: c.id,
        x: c.x,
        y: c.y,
        armEdges: [...armEdges],
        inside: false,
        passed: false,
        lastFlag: false,
        lastAheadM: -Infinity,
      });
      for (const e of armEdges) {
        let list = this.zonesByEdge.get(e);
        if (!list) this.zonesByEdge.set(e, (list = []));
        list.push(zoneIdx);
      }
    }
  }

  /** Process one frame. Appends zone events to `events`. */
  update(
    px: number,
    py: number,
    headingDeg: number,
    curEdgeIdx: number,
    pedQuery: PedestrianQuery,
    events: SimTickEvent[],
  ): void {
    const rad = (headingDeg * Math.PI) / 180;
    const hx = Math.sin(rad);
    const hy = Math.cos(rad);

    // 1. Currently active zones: exit / flag updates / pass detection.
    for (let i = this.active.length - 1; i >= 0; i--) {
      const z = this.zones[this.active[i]];
      const dx = z.x - px;
      const dy = z.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist > ZONE_EXIT_RADIUS_M) {
        // THE ZONE'S OTHER CLOSING BRACKET (audit H-5). A driver who turns off
        // at the junction instead of crossing never sends `crossingPassed`, so
        // without this event the reducer's `s.crossing` stayed armed for the
        // rest of the session: OVERTAKING_AT_CROSSING is gated on it
        // (rules/engine.ts:779) and kept convicting kilometres from any zebra,
        // and the approach-speed clock kept running on open road. The event has
        // been in the contract since the audit; nothing ever emitted it.
        const wasPassed = z.passed;
        z.inside = false;
        z.passed = false;
        z.lastAheadM = -Infinity;
        this.active.splice(i, 1);
        // A zone that already fired `crossingPassed` is closed in the reducer
        // — re-closing it is harmless but noisy, so only the turn-away case
        // (and the reverse-back-out case) speaks.
        if (!wasPassed) events.push({ kind: "crossingZoneExited", crossingId: z.id });
        continue;
      }
      const flag = pedQuery(z.id);
      if (flag !== z.lastFlag) {
        z.lastFlag = flag;
        events.push({ kind: "crossingZoneEntered", crossingId: z.id, pedestrianOnCrossing: flag });
      }
      const ahead = dx * hx + dy * hy;
      const lateral = Math.abs(dx * hy - dy * hx);
      if (!z.passed && z.lastAheadM > 0 && ahead <= 0 && lateral <= PASS_LATERAL_MAX_M) {
        z.passed = true;
        // `hostEdgeId` IS DELIBERATELY NOT PUBLISHED — measured, not assumed.
        // The reducer's H-6 gate (rules/types.ts, crossing-host-edge.test.ts) is
        // written and unit-tested but has never been armed, because nothing
        // emits the field. I tried. It cannot be armed against the shipped OSM
        // cuts: their crossing nodes are shared by several ways, so the
        // crossing's authored `edgeId` routinely names a DIFFERENT way from the
        // one the locator puts the car on — including at n331946209, the marked
        // mid-block zebra sc-ed-d2-city-run is built around, where the crossing
        // says e1131622979.0 and the tick says e171919144.0 on a legitimate,
        // graded pass. Publishing the field would therefore delete real
        // convictions (the shadow loses its PEDESTRIAN_YIELDED) instead of
        // suppressing false ones. The gate's premise — "the locator is committed
        // to the host edge by the time the paint passes under the axle" — is
        // true for the authored micro-maps and false for the two city cuts.
        // Arming it needs the crossing's host attribution fixed in
        // tools/osm (a way-membership set, not one id), not a runtime tweak.
        events.push({ kind: "crossingPassed", crossingId: z.id, pedestrianOnCrossing: pedQuery(z.id) });
      }
      z.lastAheadM = ahead;
    }

    // 2. Arm zones reachable from the current edge.
    if (curEdgeIdx >= 0) {
      const candidates = this.zonesByEdge.get(curEdgeIdx);
      if (candidates) {
        for (let i = 0; i < candidates.length; i++) {
          const z = this.zones[candidates[i]];
          if (z.inside) continue;
          const dx = z.x - px;
          const dy = z.y - py;
          if (dx * dx + dy * dy > CROSSING_ZONE_RADIUS_M * CROSSING_ZONE_RADIUS_M) continue;
          z.inside = true;
          z.passed = false;
          z.lastFlag = pedQuery(z.id);
          z.lastAheadM = dx * hx + dy * hy;
          this.active.push(candidates[i]);
          events.push({ kind: "crossingZoneEntered", crossingId: z.id, pedestrianOnCrossing: z.lastFlag });
        }
      }
    }
  }
}
