/**
 * Test support — the ring-exit hand-over walk (sc-rb-lane-choice:ffdffd55,
 * clause 1b). Nothing in the product imports it.
 *
 * For every mouth of every ring of a district, and every lane a car can leave
 * the ring by, a car is put on the ring's outer lane just upstream of the mouth
 * (so the locator's lock is the ring's) and then walked OUTWARD along that exit
 * lane's own centre line, heading along the exit road. The walk reports where
 * the fix left the ring and what the tick read on the way.
 */

import type { District } from "..";
import { Locator } from "../locator";
import { DistrictIndex, LANE_WIDTH_M, makeEdgeHit } from "../spatial";

export interface RingExitWalk {
  ringEdgeId: string;
  exitEdgeId: string;
  /** Exit lane, 0 = kerb lane (the locator's own numbering). */
  laneId: number;
  /** Arclength along the exit road at which the fix left the ring, m (null: never within the walk). */
  handoverAtM: number | null;
  /** How far beyond the RING's carriageway the car's centre was at that step, m. */
  outsideRingAtHandoverM: number | null;
  /**
   * Metres the fix read a ring edge, lane lines «painted», with |laneOffsetM|
   * past `bandM` — while the car was on the exit lane's centre line.
   */
  offBandRunM: number;
  /** Worst |laneOffsetM| read on the EXIT road after the hand-over, m. */
  worstOffsetOnExitM: number;
}

const STEP_M = 0.05;
const WALK_M = 45;

function bearing(dx: number, dy: number): number {
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export function ringExitWalks(district: District, bandM: number): RingExitWalk[] {
  const index = new DistrictIndex(district);
  const out: RingExitWalk[] = [];
  const hit = makeEdgeHit();
  for (const ringRt of index.edges) {
    if (!ringRt.edge.roundabout) continue;
    const node = ringRt.edge.to;
    for (const exitIdx of index.edgesAtNode.get(node) ?? []) {
      const ex = index.edgeRt(exitIdx);
      if (ex.edge.roundabout) continue;
      const along = ex.edge.from === node ? 1 : -1;
      if (along === -1 && ex.edge.oneway) continue; // flows INTO the ring: not an exit
      for (let lane = 0; lane < ex.lanesPerDir; lane++) {
        // Lateral of the lane centre, to the RIGHT of outbound travel.
        const rightOfAxisM = ex.edge.oneway
          ? ((ex.lanesPerDir - 1) / 2 - lane) * LANE_WIDTH_M
          : (ex.lanesPerDir - 1 - lane + 0.5) * LANE_WIDTH_M;
        const locator = new Locator(index);
        // Seed the lock on the ring: drive its outer lane from mid-edge to 1 m
        // upstream of the mouth, as a circulating car arrives there.
        const outerM = ((ringRt.lanesPerDir - 1) / 2) * LANE_WIDTH_M;
        let seedEdgeIdx = -1;
        for (let sr = ringRt.totalLen / 2; sr <= ringRt.totalLen - 1 + 1e-9; sr += 0.5) {
          const [rx, ry] = index.pointAt(ringRt.idx, sr);
          const [rtx, rty] = index.tangentAt(ringRt.idx, sr);
          seedEdgeIdx = locator.track(rx + rty * outerM, ry - rtx * outerM, bearing(rtx, rty)).edgeIdx;
        }
        if (seedEdgeIdx < 0 || !index.edgeRt(seedEdgeIdx).edge.roundabout) {
          throw new Error(`ringExitWalk: ${ringRt.edge.id} did not seed a ring lock`);
        }
        const walk: RingExitWalk = {
          ringEdgeId: ringRt.edge.id,
          exitEdgeId: ex.edge.id,
          laneId: lane,
          handoverAtM: null,
          outsideRingAtHandoverM: null,
          offBandRunM: 0,
          worstOffsetOnExitM: 0,
        };
        let lastRingIdx = seedEdgeIdx;
        const lenM = Math.min(WALK_M, ex.totalLen);
        for (let s = 0; s <= lenM + 1e-9; s += STEP_M) {
          const sEdge = along === 1 ? s : ex.totalLen - s;
          const [cx, cy] = index.pointAt(exitIdx, sEdge);
          const [gx, gy] = index.tangentAt(exitIdx, sEdge);
          const tx = gx * along;
          const ty = gy * along;
          const x = cx + ty * rightOfAxisM;
          const y = cy - tx * rightOfAxisM;
          const fix = locator.track(x, y, bearing(tx, ty));
          const onRing = fix.edgeIdx >= 0 && index.edgeRt(fix.edgeIdx).edge.roundabout;
          if (onRing) {
            lastRingIdx = fix.edgeIdx;
            if (walk.handoverAtM === null && fix.laneLinesPainted && Math.abs(fix.laneOffsetM) > bandM) {
              walk.offBandRunM += STEP_M;
            }
          } else if (fix.edgeIdx >= 0) {
            if (walk.handoverAtM === null) {
              walk.handoverAtM = +s.toFixed(2);
              walk.outsideRingAtHandoverM = +index.projectOnEdge(lastRingIdx, x, y, hit).outsideM.toFixed(2);
            }
            if (fix.edgeIdx === exitIdx) {
              walk.worstOffsetOnExitM = Math.max(walk.worstOffsetOnExitM, Math.abs(fix.laneOffsetM));
            }
          }
        }
        walk.offBandRunM = +walk.offBandRunM.toFixed(2);
        walk.worstOffsetOnExitM = +walk.worstOffsetOnExitM.toFixed(2);
        out.push(walk);
      }
    }
  }
  return out;
}
