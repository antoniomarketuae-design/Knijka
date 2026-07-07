/**
 * sim/runtime — pedestrian-crossing zone tracker.
 *
 * Emits the SimTick zone events (rules/types.ts semantics):
 * - crossingZoneEntered — vehicle enters the ~25 m approach zone of a
 *   crossing. Re-emitted for the same crossing when the pedestrian flag flips
 *   while the vehicle is still inside (contract explicitly allows this).
 * - crossingPassed — the vehicle's position passes the crossing point
 *   (ahead → behind along the vehicle's heading, laterally close).
 *
 * A zone only arms when the vehicle is on the crossing's host edge or an edge
 * sharing a node with it — a parallel street 20 m away must not trigger it.
 * Exit uses a 28 m radius (hysteresis) and re-arms the zone for re-entry.
 *
 * Pedestrians: there is no traffic module yet, so `pedestrianOnCrossing` is
 * false until a query hook is installed (WorldRuntime.setPedestrianQuery) —
 * the traffic workstream plugs in without touching this file.
 */

import type { SimTickEvent } from "../rules/types";
import type { District } from "./district";
import type { DistrictIndex } from "./spatial";

export const CROSSING_ZONE_RADIUS_M = 25;
const ZONE_EXIT_RADIUS_M = 28;
/** Max lateral distance for a legitimate "passed over the crossing". */
const PASS_LATERAL_MAX_M = 8;

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
        z.inside = false;
        z.passed = false;
        z.lastAheadM = -Infinity;
        this.active.splice(i, 1);
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
