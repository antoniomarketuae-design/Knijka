/**
 * sim/runtime — turn detector.
 *
 * TWO PATHS, ONE EVENT. Both emit `turnStarted` at the unchanged 55°
 * (TURN_THRESHOLD_DEG) and only inside a junction area (≤ 40 m from an
 * intersection node — the runtime supplies that flag and the node).
 *
 * 1. THE BASE WINDOW (unchanged). Emits when the accumulated signed heading
 *    change over a sliding 3 s window exceeds 55°. Heading is CW-positive, so
 *    a positive window sum = right turn. One event per manoeuvre: after
 *    firing, the window re-arms only once its sum falls back under 15°.
 *
 * 2. THE ADDED, ROAD-REFERENCED PATH (lane slowturn, row
 *    sc-turn-left-oncoming:1613ef2c). The window needs 55° inside 3 s, i.e.
 *    about 17.5 km/h on an R15 corner, so a careful 10–14 km/h turn, and any
 *    turn interrupted by a stop, never fired at all: no left-turn
 *    adjudication, no «Завиване без мигач», no hook — the slow cutter and the
 *    slow turner without a signal were graded as if they had driven straight
 *    on. The added path measures, over ONE junction visit (the nearest node
 *    within 40 m; it resets when that node changes or the car leaves the
 *    area) and over MOVING grid points only (forward speed ≥ 2 km/h, the base
 *    gate), the signed change in the car's direction of travel AGAINST THE
 *    ROAD: per step, Δheading − Δreference, where the reference is the
 *    tangent of the edge the lane fix holds at the visit start (in its travel
 *    sense), carried through the node onto that edge's least-deflection
 *    continuation when that continuation bends less than 55° (a continuation
 *    bending more is itself a turn by this file's own definition). So a car
 *    FOLLOWING the road nets ≈ 0° however the road bends, and a car leaving
 *    it accumulates exactly its departure from it. There is no time window: a
 *    stop pauses the measure (no movement, no accumulation) and never resets
 *    it. It fires when |measure| > 55° with ≥ 3 m travelled in the visit.
 *    Reversing (negative speed), yawing at rest, a lane change (a few degrees
 *    against the road, given back) and the ring (roundabout nodes are
 *    excluded outright) never reach it. A U-turn at a junction is treated as
 *    the base treats it at speed (ruling R2 (a)): at the 55° point it cannot
 *    be told from a left turn without delaying the decision.
 *
 *    THE DEFERRAL — BASE EVENTS NEVER MOVE (ruling R8'). Measured on every
 *    committed demo and rig tape (531 tapes, 43 visits with a base event):
 *    the road measure alone crosses 55° EARLIER than the base window on 15 of
 *    them (11 by one grid step, sc-ed-d2-priority-run's correct demo by
 *    0.783 s, the four ltap rig-w2 tapes by 0.35 s). So the added path waits,
 *    and every condition it waits on is read off the base window's own
 *    definition (TURN_WINDOW_SEC, TURN_REARM_DEG, the 55° line) — no new
 *    number. It fires on the first grid point on which the measure is past
 *    55° and
 *      EITHER (a) the base window itself — the same moving heading deltas,
 *          counted over 3 s of MOVING time (a stop does not drain it) — has
 *          held above TURN_REARM_DEG for more than TURN_WINDOW_SEC: the window
 *          has been full of this turn for a whole window and is below 55°, so
 *          the base is not about to report it (the fast release);
 *      OR (a') the grid point on which the measure went past 55° — and has
 *          stayed past it since; a swing that goes past and falls back starts
 *          again — has left the base window (more than TURN_WINDOW_SEC ago):
 *          whatever the window can still fire on from here is heading change
 *          made after the measure was already past 55°. This is the BOUND
 *          (ruling R12): (a) alone waited forever on a slow arc — at 5–7 km/h
 *          on sc-turn-left-oncoming's R15 corner the window hovers about 15°,
 *          keeps dipping under TURN_REARM_DEG, and (a) never opened, so the
 *          turn got no event at all (the round-2 verifier's F-A);
 *      AND (b) the base window's |sum| is NOT still rising on this grid point.
 *          A window still climbing may cross 55° itself on the next point,
 *          and that turn is the base's to report at its own step. (a) alone
 *          let a 10 km/h right turn round sc-vu-bikelane-turn's tight corner
 *          fire one grid step before the base window and swallow its event,
 *          and with it the turn's cyclist credit — measured on a recorded
 *          probe drive, 6/8/10 km/h; (b) closes it.
 *    WHY IT CANNOT STARVE. Past the deadline (a') only (b) can hold the
 *    event back, and (b) holds only on a grid point where |window| strictly
 *    grows — where the newest heading delta out-turns the one leaving the
 *    window. That cannot outlast the turn: on the first point the car stops
 *    turning (it stops, or its heading settles on the exit) nothing new
 *    enters, and within one window everything old has left, so |window|
 *    cannot grow on every point; and if it grows past 55° the BASE fires,
 *    which is the visit's one event. So a junction turn whose measure passes
 *    55° gets exactly one event, base or added, unless the visit ends first.
 *    Proven by census, not for every possible drive (ruling R4): on every
 *    committed demo and rig tape 0 of the 43 base events move, and the
 *    deadline moves none of them (the earliest-crossing base visit is
 *    0.783 s, inside the window). COST (measured, a recorded cost and never
 *    a reason to drop an event): the added commit lands at most one window
 *    after the true moving 55° point — exactly 3.00 s at 5–7 km/h on R15,
 *    1.6–2.4 s on a turn interrupted by a stop, and 2–3 grid steps
 *    (≤ 0.05 s) on a continuous 8–14 km/h R15 turn.
 *
 *    SUPPRESSION. Every base event keeps its grid step. The added path never
 *    fires in a visit where the base already fired, and when both would fire
 *    on the same step ONE event is emitted, the base one. After an added
 *    event, the next base event in the same visit is suppressed only until
 *    the base window sum first falls below TURN_REARM_DEG (it is the same
 *    manoeuvre the added event already reported); base events after that
 *    re-arm are emitted unchanged. At most one added event per visit.
 *
 *    THE FLAG (ruling R11). An added event carries `addedPath: true`; a base
 *    event never does. The consumers that BILL read it exactly as a base
 *    event (FAILED_TO_YIELD through the N1 tracker, TURN_WITHOUT_INDICATOR,
 *    WRONG_LANE_FOR_DIRECTION, the right-turn cyclist hook) — and the N1
 *    tracker adds ONE piece of evidence at an added commit only: a vehicle he
 *    had to give way to — judged on its OWN planned route through the node
 *    (oncoming, straight on or turning right; never a left- or U-turner), its
 *    route across the junction meeting his body — that braked for him while
 *    his body lay on that route ahead of it, still arriving or held for him,
 *    was not given way (ruling R13''', runtime/leftTurnGiveWay.ts and
 *    worldRuntime.ts LEFT_TURN_FORCED_SHED_MPS: on a slow turn the guard keeps
 *    the measured gap above 2.0 s by braking the car he cuts in front of). The consumers
 *    that CREDIT or NARRATE skip it (the left-turn yield praise, the Интервал
 *    row and its figure, the cyclist credit, the micro-quiz): their figures
 *    were built for a fast turn and are not yet true of a slow one, so a slow
 *    careful turn still earns no praise and no row — an omission, never a
 *    false sentence (candidate «slowcredit»).
 *
 *    KNOWN LIMIT — SPLIT NODES (ruling R10). The visit is keyed to the
 *    NEAREST node. Where two intersection nodes lie within 40 m along a
 *    turning path (in the catalogue: only d2-v1, about 46 pairs), the nearest
 *    node can change mid-turn, the visit resets, and a slow turn there can be
 *    split and missed. The base window is unaffected.
 *
 * A TURN IS A CHANGE IN THE DIRECTION OF TRAVEL (doc 87 B8/B9). It is not a
 * change in the direction the body happens to point: a car standing still that
 * yaws — a chassis settling onto its springs at spawn, a wheel turned against
 * the kerb — has rotated, not turned, and there is nothing there to signal or
 * to observe. The founder opened „Полигон — начални маневри", pressed nothing,
 * and was billed «Завиване без мигач» (ЗДвП чл. 25, основна) at 0 км/ч with the
 * checklist still on 0/13. The window therefore carries DISTANCE alongside the
 * heading: a frame that did not move contributes no heading, and a window that
 * did not cover `TURN_MIN_TRAVEL_M` cannot fire at all. A real turn is
 * untouched — the tightest junction mouth in the catalog still sweeps 55° over
 * ~5 m of asphalt. Both paths share that gate.
 *
 * Ring buffers are fixed-size Float64Arrays — zero steady-state allocation.
 * Per ADR-014 the runtime feeds this once per fixed grid point, from the grid
 * state it already has (pose, speed, lane fix, nearest node); no frame-end
 * pose and no clock of its own.
 */

import type { SimTickEvent, TurnDirection } from "../rules/types";
import { bearingDeg, signedDeltaDeg } from "./geometry";
import type { DistrictIndex } from "./spatial";

export const TURN_THRESHOLD_DEG = 55;
export const TURN_WINDOW_SEC = 3;
export const TURN_REARM_DEG = 15;
/** "On junction area" radius used by the runtime when calling update().
 * Covers the scaled junction patches (open radii reach ~36 m on arterials —
 * perceptual road scale); turns start at the mouth, not at the node. */
export const JUNCTION_AREA_RADIUS_M = 40;
/**
 * Below this the vehicle is not travelling, so its heading change is body
 * rotation, not a turn. 2 km/h = 0.56 m/s — under a slow walk, and an order of
 * magnitude under the ~20 km/h a junction turn is actually taken at.
 */
export const TURN_MIN_SPEED_KMH = 2;
/**
 * Ground covered inside the window before 55° may be called a turn. The
 * geometric floor: 55° swept on the tightest mouth the world builds
 * (JUNCTION_CORNER_RADIUS_MINOR_M = 9 m) is 8.6 m of arc, and even a 4 m
 * three-point-turn radius covers 3.8 m. 3 m keeps every real manoeuvre and
 * rejects everything a parked car can do.
 */
export const TURN_MIN_TRAVEL_M = 3;

/** 3 s at ~340 Hz — beyond any realistic frame rate. */
const CAPACITY = 1024;

/** One link of the road reference: an edge and the sense it is travelled in. */
export interface TurnRoadLink {
  readonly edgeIdx: number;
  readonly sign: 1 | -1;
}

/** What the added path needs to know about the road network. */
export interface TurnRoadPort {
  /** Bearing of edge `edgeIdx` at arclength `sM`, travelled in sense `sign`. */
  bearingDeg(edgeIdx: number, sM: number, sign: 1 | -1): number;
  /**
   * The least-deflection continuation of `edgeIdx` (travelled in `sign`) at
   * its far node, when it deflects less than TURN_THRESHOLD_DEG; else null.
   */
  through(edgeIdx: number, sign: 1 | -1): TurnRoadLink | null;
}

/** The grid state the added path reads on one step (all already computed by
 *  the runtime before its turn call). */
export interface TurnRoadSample {
  /** The nearest intersection node within JUNCTION_AREA_RADIUS_M, or null. */
  nodeId: string | null;
  /** That node is a roundabout node (the ring is excluded from the added path). */
  ring: boolean;
  /** The lane fix (edge index, −1 when off the network) and its arclength. */
  edgeIdx: number;
  sM: number;
  port: TurnRoadPort;
}

/** The road port over a district index. The through-link per (edge, sense) is
 *  a property of the map, so it is computed once and cached. */
export function createTurnRoadPort(index: DistrictIndex): TurnRoadPort {
  const cache = new Map<number, TurnRoadLink | null>();
  const bearing = (e: number, sM: number, sign: 1 | -1): number => {
    const [tx, ty] = index.tangentAt(e, sM);
    return bearingDeg(tx * sign, ty * sign);
  };
  return {
    bearingDeg: bearing,
    through(e0: number, s0: 1 | -1): TurnRoadLink | null {
      const key = e0 * 2 + (s0 > 0 ? 1 : 0);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const rt0 = index.edges[e0];
      const node = s0 > 0 ? rt0.edge.to : rt0.edge.from;
      const arrive = bearing(e0, s0 > 0 ? rt0.totalLen : 0, s0);
      let best: TurnRoadLink | null = null;
      let bestDefl = Infinity;
      for (const e of index.edgesAtNode.get(node) ?? []) {
        if (e === e0) continue;
        const rt = index.edges[e];
        if (rt.edge.from === rt.edge.to) continue;
        const sign: 1 | -1 = rt.edge.from === node ? 1 : -1;
        if (rt.edge.oneway && sign < 0) continue; // a one-way edge is not travelled backwards
        const depart = bearing(e, sign > 0 ? 0 : rt.totalLen, sign);
        const defl = Math.abs(signedDeltaDeg(arrive, depart));
        if (defl < bestDefl) {
          bestDefl = defl;
          best = { edgeIdx: e, sign };
        }
      }
      const res = best !== null && bestDefl < TURN_THRESHOLD_DEG ? best : null;
      cache.set(key, res);
      return res;
    },
  };
}

export class TurnDetector {
  private readonly times = new Float64Array(CAPACITY);
  private readonly deltas = new Float64Array(CAPACITY);
  private readonly dists = new Float64Array(CAPACITY);
  private head = 0; // next write
  private tail = 0; // oldest
  private count = 0;
  private sumDeg = 0;
  private sumDistM = 0;
  private lastHeading: number | null = null;
  private lastT: number | null = null;
  private armed = true;

  // ── The deferral's clock: the base window's own moving heading deltas,
  // counted over MOVING time (a stop pauses it instead of draining it).
  private readonly mTimes = new Float64Array(CAPACITY);
  private readonly mDeltas = new Float64Array(CAPACITY);
  private mHead = 0;
  private mTail = 0;
  private mCount = 0;
  private mSumDeg = 0;
  private movingT = 0;
  /** Last step at which the moving-time window sum was within TURN_REARM_DEG. */
  private quietT = -Infinity;
  /** |base window sum| on the previous grid point (the "still rising" test). */
  private prevMag = 0;

  // ── The added path's junction visit.
  private vNode: string | null = null;
  private vPrevHeading: number | null = null;
  private vAccDeg = 0;
  private vTravelM = 0;
  private vCrossed = false;
  /** Grid time at which this visit's road measure went past 55° (and stays
   *  past it), or null — the deferral's deadline is counted from it. */
  private vOverT: number | null = null;
  private vBaseFired = false;
  private vSuppressBase = false;
  private vRefEdge = -1;
  private vRefSign: 1 | -1 = 1;
  private vRefDeg: number | null = null;

  reset(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.sumDeg = 0;
    this.sumDistM = 0;
    this.lastHeading = null;
    this.lastT = null;
    this.armed = true;
    this.mHead = 0;
    this.mTail = 0;
    this.mCount = 0;
    this.mSumDeg = 0;
    this.movingT = 0;
    this.quietT = -Infinity;
    this.prevMag = 0;
    this.vNode = null;
    this.vPrevHeading = null;
    this.resetVisit(null, 0);
  }

  /**
   * Feed one grid point. Appends a turnStarted event when a turn begins.
   *
   * `speedKmh` is the travel gate (doc 87 B8/B9). A caller that cannot answer
   * — there is none in-tree, but the parameter is optional so a fixture does
   * not have to lie — is treated as "moving at the reference pace", i.e. the
   * pre-gate behaviour, because inventing a stop is worse than not knowing.
   *
   * `road` arms the added, road-referenced path (see the header). Absent, the
   * detector is the base window alone, byte for byte.
   */
  update(
    tSec: number,
    headingDeg: number,
    inJunctionArea: boolean,
    events: SimTickEvent[],
    speedKmh?: number,
    road?: TurnRoadSample,
  ): void {
    const dtSec = this.lastT === null ? 0 : Math.max(0, tSec - this.lastT);
    this.lastT = tSec;
    // Unknown speed = the old behaviour: assume the window fills with travel.
    const speed = speedKmh ?? Number.POSITIVE_INFINITY;
    const moving = speed >= TURN_MIN_SPEED_KMH;
    const frameDistM = Number.isFinite(speed)
      ? (speed / 3.6) * dtSec
      : (TURN_MIN_TRAVEL_M * dtSec) / TURN_WINDOW_SEC;

    // A frame the car did not travel contributes no heading: a body rotating
    // in place is not changing its direction of travel.
    const raw = this.lastHeading === null ? 0 : signedDeltaDeg(this.lastHeading, headingDeg);
    this.lastHeading = headingDeg;
    const delta = moving ? raw : 0;

    // Evict entries older than the window (and make room when full).
    const cutoff = tSec - TURN_WINDOW_SEC;
    while (this.count > 0 && (this.times[this.tail] < cutoff || this.count >= CAPACITY)) {
      this.sumDeg -= this.deltas[this.tail];
      this.sumDistM -= this.dists[this.tail];
      this.tail = (this.tail + 1) % CAPACITY;
      this.count--;
    }

    this.times[this.head] = tSec;
    this.deltas[this.head] = delta;
    this.dists[this.head] = moving ? frameDistM : 0;
    this.head = (this.head + 1) % CAPACITY;
    this.count++;
    this.sumDeg += delta;
    this.sumDistM += moving ? frameDistM : 0;

    const mag = Math.abs(this.sumDeg);
    // Was the base window still RISING on this grid point? (Read before it is
    // overwritten: the added path's second deferral, see below.)
    const baseRising = mag > this.prevMag;
    this.prevMag = mag;
    const travelled = this.sumDistM >= TURN_MIN_TRAVEL_M;
    let baseFired: TurnDirection | null = null;
    if (this.armed && mag > TURN_THRESHOLD_DEG && inJunctionArea && travelled) {
      this.armed = false;
      baseFired = this.sumDeg > 0 ? "right" : "left";
    } else if (!this.armed && mag < TURN_REARM_DEG) {
      this.armed = true;
    }

    if (road === undefined) {
      if (baseFired !== null) events.push({ kind: "turnStarted", direction: baseFired });
      return;
    }

    // ── The deferral's moving-time window (same deltas as the base window).
    if (moving) {
      this.movingT += dtSec;
      const mCutoff = this.movingT - TURN_WINDOW_SEC;
      while (this.mCount > 0 && (this.mTimes[this.mTail] < mCutoff || this.mCount >= CAPACITY)) {
        this.mSumDeg -= this.mDeltas[this.mTail];
        this.mTail = (this.mTail + 1) % CAPACITY;
        this.mCount--;
      }
      this.mTimes[this.mHead] = this.movingT;
      this.mDeltas[this.mHead] = delta;
      this.mHead = (this.mHead + 1) % CAPACITY;
      this.mCount++;
      this.mSumDeg += delta;
    }
    if (Math.abs(this.mSumDeg) <= TURN_REARM_DEG) this.quietT = tSec;

    // ── The junction visit.
    const node = road.nodeId;
    if (node === null) {
      this.vNode = null;
      this.vPrevHeading = headingDeg;
      this.vSuppressBase = false;
      if (baseFired !== null) events.push({ kind: "turnStarted", direction: baseFired });
      return;
    }
    let fresh = false;
    if (node !== this.vNode) {
      this.vNode = node;
      this.resetVisit(road, headingDeg);
      this.vPrevHeading = headingDeg;
      fresh = true;
    } else {
      const prevRef = this.vRefDeg;
      this.followRoad(road);
      const dHeading = this.vPrevHeading === null ? 0 : signedDeltaDeg(this.vPrevHeading, headingDeg);
      this.vPrevHeading = headingDeg;
      const dRoad =
        this.vRefDeg !== null && prevRef !== null ? signedDeltaDeg(prevRef, this.vRefDeg) : 0;
      if (moving) {
        this.vAccDeg += dHeading - dRoad;
        this.vTravelM += frameDistM;
      }
    }

    // Base first: it keeps its step, unless it is the tail of the manoeuvre
    // an added event in this visit has already reported.
    if (baseFired !== null) {
      if (this.vSuppressBase) {
        // suppressed: the same manoeuvre as this visit's added event
      } else {
        events.push({ kind: "turnStarted", direction: baseFired });
        this.vBaseFired = true;
      }
    }
    if (this.vSuppressBase && Math.abs(this.sumDeg) < TURN_REARM_DEG) this.vSuppressBase = false;

    if (fresh || this.vCrossed || road.ring) return;
    if (!(Math.abs(this.vAccDeg) > TURN_THRESHOLD_DEG && this.vTravelM >= TURN_MIN_TRAVEL_M)) {
      this.vOverT = null;
      return;
    }
    if (this.vOverT === null) this.vOverT = tSec;
    // The deferral (header): (a) the window has held a turn for a whole window
    // of moving time, OR (a') the grid point on which the measure went past 55°
    // has left the base window — whatever the window can still fire on from
    // here is heading change made after that point. (a') is the bound: the
    // deferral delays, it never starves.
    if (!(tSec - this.quietT > TURN_WINDOW_SEC || tSec - this.vOverT > TURN_WINDOW_SEC)) return;
    // …and never while the base window is still rising: a window still
    // climbing may yet cross 55° itself on the next grid point, and that turn
    // is the base's to report at its own step.
    if (baseRising) return;
    this.vCrossed = true;
    if (this.vBaseFired) return; // the base already reported this visit's turn
    this.vSuppressBase = Math.abs(this.sumDeg) >= TURN_REARM_DEG;
    events.push({
      kind: "turnStarted",
      direction: this.vAccDeg > 0 ? "right" : "left",
      addedPath: true,
    });
  }

  private resetVisit(road: TurnRoadSample | null, headingDeg: number): void {
    this.vAccDeg = 0;
    this.vTravelM = 0;
    this.vCrossed = false;
    this.vOverT = null;
    this.vBaseFired = false;
    this.vSuppressBase = false;
    this.vRefEdge = -1;
    this.vRefSign = 1;
    this.vRefDeg = null;
    if (road !== null && road.edgeIdx >= 0) {
      const fwd = road.port.bearingDeg(road.edgeIdx, road.sM, 1);
      this.vRefSign = Math.abs(signedDeltaDeg(headingDeg, fwd)) <= 90 ? 1 : -1;
      this.vRefEdge = road.edgeIdx;
      this.vRefDeg = road.port.bearingDeg(road.edgeIdx, road.sM, this.vRefSign);
    }
  }

  /** Carry the reference along the road: the same edge, or its through edge;
   *  anything else means the car has left the through road — hold. */
  private followRoad(road: TurnRoadSample): void {
    if (this.vRefEdge < 0) return;
    if (road.edgeIdx === this.vRefEdge) {
      this.vRefDeg = road.port.bearingDeg(road.edgeIdx, road.sM, this.vRefSign);
      return;
    }
    if (road.edgeIdx < 0) return;
    const th = road.port.through(this.vRefEdge, this.vRefSign);
    if (th !== null && th.edgeIdx === road.edgeIdx) {
      this.vRefEdge = th.edgeIdx;
      this.vRefSign = th.sign;
      this.vRefDeg = road.port.bearingDeg(road.edgeIdx, road.sM, this.vRefSign);
    }
  }
}
