/**
 * sim/runtime — lane-level locator with hysteresis.
 *
 * Maps a noisy world position to (edge, lane, lateral offset):
 * - Edge hysteresis: once locked to an edge, the locator only switches when a
 *   rival edge is closer by EDGE_SWITCH_MARGIN_M, so positions jittering near
 *   a junction or a parallel road don't flip-flop.
 * - Lane hysteresis: within an edge, the lane id only changes once the vehicle
 *   is LANE_SWITCH_DEADBAND_M past the lane boundary.
 * - > OFF_ROAD_DISTANCE_M (30 m) from every centerline ⇒ edgeId null.
 *
 * Lane model (until wave-2 lane topology, doc 17 §7): lanes are procedural
 * bands of LANE_WIDTH_M around the OSM centerline. Oneway edges center the
 * full bank on the polyline; two-way edges put `lanesPerDir` lanes on each
 * side. laneId 0 = rightmost lane OF THE VEHICLE'S CARRIAGEWAY (side of the
 * centerline it is on), increasing leftward — matching SimTick's convention.
 * Lane ids are stable along one edge; crossing to an edge with a different
 * lane count can renumber (documented limitation, needs lane topology data).
 */

import { LANE_WIDTH_M, OFF_ROAD_DISTANCE_M, makeEdgeHit, type DistrictIndex, type EdgeHit } from "./spatial";
import { bearingDeg, signedDeltaDeg } from "./geometry";

/** A rival edge must be closer than the locked one by this much to steal the
 * fix. ~Half the scaled lane width: lane centers now sit 4–12 m off their
 * centerline, so junction-area rivals brush much closer than they used to. */
const EDGE_SWITCH_MARGIN_M = 4.0;
const LANE_SWITCH_DEADBAND_M = 0.35;

/**
 * C1 revision — heading gate on lock STEALING. A vehicle crossing a side-
 * street mouth passes within centimeters of that stub's centerline; distance
 * alone then flips the committed lock onto the stub for ~1 s, and the sweep
 * bills the stub's limit (SPEEDING_DANGEROUS vs a 30 km/h service mouth on
 * the boulevard) or its direction (WRONG_WAY on an opposing oneway link at a
 * junction corner) against a driver riding their own lane. While the LOCKED
 * edge is still heading-plausible, a rival may steal the fix only if the
 * vehicle's heading is plausible for the rival too:
 *  - two-way rival: within HEADING_GATE_DEG of EITHER geometry direction;
 *  - oneway rival: within HEADING_GATE_DEG of its legal flow — locking onto
 *    an opposing oneway the driver merely brushes IS the wrong-way FP.
 * Acquisition (no lock / lock off-road) stays distance-only, so a genuine
 * wrong-way run — where the old edge falls away — still locks and grades
 * (wrong-way.test.ts holds).
 */
const HEADING_GATE_DEG = 60;

export interface LocateFix {
  /** Index into DistrictIndex.edges, or -1 when off-road. */
  edgeIdx: number;
  edgeId: string | null;
  laneId: number;
  laneOffsetM: number;
  /** Arclength along the edge polyline, meters (0 when off-road). */
  sM: number;
  /** Distance to the edge centerline, meters (Infinity when off-road). */
  distM: number;
  /**
   * Nominal travel direction of the vehicle's lane bank along the geometry:
   * +1 = with geometry (from → to), -1 = against. On oneway edges always +1.
   * (Which BANK the vehicle occupies — actual motion may oppose it.)
   */
  travelDir: 1 | -1;
}

export function makeLocateFix(): LocateFix {
  return { edgeIdx: -1, edgeId: null, laneId: 0, laneOffsetM: 0, sM: 0, distM: Infinity, travelDir: 1 };
}

interface LaneCalc {
  laneId: number;
  laneOffsetM: number;
  travelDir: 1 | -1;
}

export class Locator {
  private readonly index: DistrictIndex;

  // Committed tracking state (the player vehicle).
  private lockedEdgeIdx = -1;
  private lockedLaneId = -1;
  private lockedTravelDir: 1 | -1 = 1;
  /** Heading of the last track() call — part of the committed lock state, so
   * peek() applies the SAME steal gate and never disagrees with tracking. */
  private lockedHeadingDeg: number | undefined = undefined;

  // Scratch — zero per-call allocation on the tracking path.
  private readonly bestHit = makeEdgeHit();
  private readonly currentHit = makeEdgeHit();
  private readonly laneCalc: LaneCalc = { laneId: 0, laneOffsetM: 0, travelDir: 1 };
  private readonly fix: LocateFix = makeLocateFix();

  constructor(index: DistrictIndex) {
    this.index = index;
  }

  /**
   * Track the vehicle: applies + commits hysteresis state. Returns an
   * internally reused fix — copy fields out, do not hold the reference.
   * `headingDeg` (when the caller knows it) arms the heading gate on lock
   * stealing — see HEADING_GATE_DEG.
   */
  track(x: number, y: number, headingDeg?: number): LocateFix {
    const chosen = this.chooseEdge(x, y, headingDeg);
    this.lockedHeadingDeg = headingDeg;
    this.applyFix(chosen, /* commit */ true);
    return this.fix;
  }

  /**
   * Pure lookup for HUD/minimap (`WorldRuntime.locate`): benefits from the
   * committed lock (stable answers for the same vehicle — including its
   * heading gate, so peek never flip-flops against tracking) but never
   * mutates it, so out-of-band calls cannot corrupt the sample() tracking.
   */
  peek(x: number, y: number): LocateFix {
    const chosen = this.chooseEdge(x, y, this.lockedHeadingDeg);
    this.applyFix(chosen, /* commit */ false);
    return this.fix;
  }

  /** Heading plausibility of a hit (see HEADING_GATE_DEG). */
  private headingPlausible(hit: EdgeHit, headingDeg: number): boolean {
    const fwd = bearingDeg(hit.tanX, hit.tanY);
    const dFwd = Math.abs(signedDeltaDeg(headingDeg, fwd));
    if (dFwd <= HEADING_GATE_DEG) return true;
    const rt = this.index.edgeRt(hit.edgeIdx);
    if (rt.edge.oneway) return false; // opposing a oneway's flow = implausible
    return 180 - dFwd <= HEADING_GATE_DEG;
  }

  private chooseEdge(x: number, y: number, headingDeg?: number): EdgeHit | null {
    const best = this.bestHit;
    const hasBest = this.index.nearestEdge(x, y, OFF_ROAD_DISTANCE_M, best);

    if (this.lockedEdgeIdx >= 0) {
      const cur = this.index.projectOnEdge(this.lockedEdgeIdx, x, y, this.currentHit);
      if (cur.distM <= OFF_ROAD_DISTANCE_M) {
        // Locked edge still plausible — switch only on a clear win, and (with
        // a known heading) only onto a rival the heading is plausible for,
        // unless the locked edge itself has become heading-implausible.
        if (hasBest && best.edgeIdx !== this.lockedEdgeIdx && best.distM + EDGE_SWITCH_MARGIN_M < cur.distM) {
          if (
            headingDeg === undefined ||
            this.headingPlausible(best, headingDeg) ||
            !this.headingPlausible(cur, headingDeg)
          ) {
            return best;
          }
        }
        return cur;
      }
    }
    return hasBest ? best : null;
  }

  private applyFix(hit: EdgeHit | null, commit: boolean): void {
    const fix = this.fix;
    if (hit === null) {
      fix.edgeIdx = -1;
      fix.edgeId = null;
      fix.laneId = 0;
      fix.laneOffsetM = 0;
      fix.sM = 0;
      fix.distM = Infinity;
      fix.travelDir = 1;
      if (commit) {
        this.lockedEdgeIdx = -1;
        this.lockedLaneId = -1;
      }
      return;
    }

    const rt = this.index.edgeRt(hit.edgeIdx);
    const sameEdge = hit.edgeIdx === this.lockedEdgeIdx;
    const prevLane = sameEdge ? this.lockedLaneId : -1;
    const prevDir = sameEdge ? this.lockedTravelDir : null;
    this.computeLane(rt.edge.oneway, rt.lanesPerDir, hit.latSignedM, prevLane, prevDir, this.laneCalc);

    fix.edgeIdx = hit.edgeIdx;
    fix.edgeId = rt.edge.id;
    fix.laneId = this.laneCalc.laneId;
    fix.laneOffsetM = this.laneCalc.laneOffsetM;
    fix.sM = hit.sM;
    fix.distM = hit.distM;
    fix.travelDir = this.laneCalc.travelDir;

    if (commit) {
      this.lockedEdgeIdx = hit.edgeIdx;
      this.lockedLaneId = this.laneCalc.laneId;
      this.lockedTravelDir = this.laneCalc.travelDir;
    }
  }

  /**
   * Lane math. `latSigned` is + left of the geometry direction (from spatial).
   * Two-way: the vehicle's bank is the side it is on — right of centerline
   * travels geometry-forward (right-hand traffic), left travels against.
   * Lateral coordinate `d` = distance from the centerline into the bank;
   * laneId = lanesPerDir-1-floor(d/W) so the OUTERMOST (curb) lane is 0.
   * laneOffset sign: + = left RELATIVE TO TRAVEL DIRECTION — for both banks
   * that is "toward the centerline", which mirrors cleanly to center - d.
   */
  private computeLane(
    oneway: boolean,
    lanesPerDir: number,
    latSigned: number,
    prevLaneId: number,
    prevDir: 1 | -1 | null,
    out: LaneCalc,
  ): void {
    const W = LANE_WIDTH_M;
    let travelDir: 1 | -1;
    let d: number; // distance from the bank's inner boundary, ≥ 0

    if (oneway) {
      travelDir = 1;
      // Bank spans latRight ∈ [-half, +half]; measure d from the LEFT bank
      // boundary so d grows to the right: d = latRight + half.
      const half = (lanesPerDir * W) / 2;
      d = -latSigned + half;
      d = Math.max(0, Math.min(lanesPerDir * W, d));
      // Lane j (0 = rightmost): center at d = lanesPerDir*W - (j + 0.5)*W.
      let laneId = lanesPerDir - 1 - Math.min(lanesPerDir - 1, Math.floor(d / W));
      laneId = this.laneWithHysteresis(laneId, prevDir === travelDir ? prevLaneId : -1, d, lanesPerDir);
      const center = lanesPerDir * W - (laneId + 0.5) * W;
      out.laneId = laneId;
      out.laneOffsetM = center - d; // + = left of travel (smaller d)
      out.travelDir = travelDir;
      return;
    }

    // Two-way: right of centerline (latSigned < 0) = geometry-forward bank.
    if (latSigned <= 0) {
      travelDir = 1;
      d = -latSigned;
    } else {
      travelDir = -1;
      d = latSigned;
    }
    d = Math.max(0, Math.min(lanesPerDir * W, d));
    const laneFromCenter = Math.min(lanesPerDir - 1, Math.floor(d / W));
    let laneId = lanesPerDir - 1 - laneFromCenter;
    laneId = this.laneWithHysteresis(laneId, prevDir === travelDir ? prevLaneId : -1, d, lanesPerDir);
    const center = (lanesPerDir - 1 - laneId + 0.5) * W;
    // + = left of travel = toward the centerline = decreasing d (both banks).
    out.laneId = laneId;
    out.laneOffsetM = center - d;
    out.travelDir = travelDir;
  }

  /** Keep the previous lane while the position is within the deadband past the boundary. */
  private laneWithHysteresis(laneId: number, prevLaneId: number, d: number, lanesPerDir: number): number {
    if (prevLaneId < 0 || prevLaneId >= lanesPerDir || prevLaneId === laneId) return laneId;
    const W = LANE_WIDTH_M;
    const prevCenter = (lanesPerDir - 1 - prevLaneId + 0.5) * W;
    if (Math.abs(d - prevCenter) <= W / 2 + LANE_SWITCH_DEADBAND_M) return prevLaneId;
    return laneId;
  }
}
