/**
 * THE ROUND-5 ORACLE — sc-mv-uturn-ban, «ONE DEFINITION OF THE ACT», computed
 * from the RAW POSE of every frame and the built road, and from nothing the
 * product's tracker holds.
 *
 * It is a helper for witnesses, not a test: `mv-uturn-ban-one-definition-of-
 * the-act.test.ts` pins the verifier's classes against it, and the fuzz file
 * (kept outside the tree) composes drives and compares the product's rows with
 * what this file says.
 *
 * WHAT IT READS: `tick.t`, `tick.position`, `tick.headingDeg`, `tick.speedKmh`.
 * WHAT IT KNOWS ABOUT THE ROAD (content/world/mv-uturn-v1.json, restated — this
 * file imports nothing from the rule engine): the boulevard runs due north with
 * its axis at x = 0; the М1 is authored from y 40 to y 220; the road stops
 * having a fix on a car more than 30 m from its centreline.
 *
 * THE INTEGRATOR'S RULING, AS APPLIED HERE (journal wf_74b8f25e-b7e → round 5):
 *
 *  R5-1 A TURN-ROUND IS AN EVENT OF THE HEADING. The car has a TRAVEL
 *       DIRECTION along the road: the road direction its nose was last within
 *       45° of. A turn-round is one yaw excursion that takes the nose from
 *       within 45° of that direction to within 45° of the opposite one, on
 *       whichever half the centre is. Stated once, and pinned:
 *         · THE SWING — A RATE OVER A WINDOW (round 6, R6-5). Yaw is counted
 *           in whole degrees. The nose is swinging one way while its counted
 *           degrees keep arriving that way at a mean rate of at least 1° per
 *           2.5 m (every arc tighter than a 143 m radius), the window being
 *           the stretch of path each degree took:
 *             – it BEGINS on the frame the nose leaves the heading it stood
 *               at, if the first degree arrives within 2.5 m of that frame;
 *             – it ENDS 2 m after its last counted degree (decision 1);
 *             – it RESUMES as the same swing, keeping its place, when the next
 *               degree the same way arrives within 6.5 m at that mean rate
 *               (three degrees on a 115 m radius are 6.02 m apart).
 *           So the same path gives the same swing, and the same place,
 *           whatever step its heading is sampled in. A standing car is still
 *           mid-swing.
 *         · IT BEGINS where the swing that carries the nose out of the 45°
 *           band began — the last frame on which the nose still stood at the
 *           heading it turned away from. That frame's station is THE PLACE.
 *         · IT IS CONFIRMED when the nose has stayed within 45° of the
 *           opposite direction for 0.6 s (the hysteresis: a 90° dead band and
 *           the crossing detector's own sustain). From that frame the travel
 *           direction is the new one.
 *         · IT COMPLETES when the swing that carried the nose into the
 *           opposite band ends (or carries it on out of the new direction's
 *           band: a full circle is two turn-rounds). A crossing made while that swing is still
 *           going is made DURING the turn-round, however far round the nose
 *           already is; one made after it is made by a car already travelling
 *           the other way.
 *  R5-2 A crossing of the SOLID axis is the lesson's U-turn iff
 *         (i)   the centre went over where the axis is solid;
 *         (ii)  a turn-round completed at or after it, the car not having come
 *               HOME before that turn-round began — back on the bank and
 *               direction it came from, or settled for 0.6 s travelling with
 *               the bank it crossed to — on a frame on which it was not still
 *               swinging on the swing it crossed on or on one begun since,
 *               across;
 *         (iii) the axis is solid at the station where that turn-round begins.
 *  R5-3 A place measured on the road is kept while the road has no fix on the
 *       car. The nose is a fact of the pose wherever the car is, so the swing
 *       and the excursion are followed out there too; what the road cannot
 *       give is a STATION, so a swing or an excursion that begins out there
 *       is unplaced — and nothing is confirmed until the road sees the car
 *       again.
 *
 * ROUND 6 (journal wf_0e0b8b7a-edb → the closing round). This file knows no
 * EDGE: the boulevard is one road to it, from y 0 to y 620, so a turn-round
 * made past the junction at y 280 is a turn-round like any other and what
 * R5-2 says of a later crossing does not depend on which of the road's two
 * edges the car was handed to (R6-1). Three things are added, all from the
 * pose:
 *
 *  HOME (`homeAt`) — the half a crossing is measured FROM. It is the half the
 *       centre is on when the road first sees the car; it becomes the half the
 *       car is on when (a) the car has travelled WITH that half's direction
 *       for 0.6 s, not mid-swing, or (b) a turn-round that names no crossing
 *       is confirmed; and (c), R6-2, when the swing of a turn-round that NAMES
 *       a crossing ends, it becomes the half of the car's NEW travel
 *       direction, wherever the centre is. A bill on a frame the centre is AT
 *       HOME is a bill for a crossing the centre has not made (R6-1, W2).
 *  THE WRONG-HALF RUN (`wrongHalfRuns`, R6-2) — at the end of such a swing
 *       the centre is across the solid axis from that half and stays there:
 *       a NEW crossing, due a bill of its own after the sustain.
 *  «НАСРЕЩНАТА» (`oncomingAt`, R6-3) — the half the centre is on is the
 *       ONCOMING half exactly when its traffic runs against the car's travel
 *       direction (R5-1) on that frame.
 */

import type { SimTick } from "../../../rules";

export const SPAN = { fromY: 40, toY: 220 } as const;
export const WITH_DEG = 45;
export const SUSTAIN_SEC = 0.6;
export const SWING_ADVANCE_DEG = 1;
export const SWING_SETTLE_M = 2;
/** R6-5: the rate, as the window one degree may take (1° in 2.5 m ↔ a 143 m radius). */
export const SWING_RATE_WINDOW_M = 2.5;
/** …and a degree that took longer than this never resumes a swing. */
export const SWING_RESUME_MAX_M = 6.5;
/** The nose still stands at a heading while it is within this of it, degrees. */
export const SWING_STILL_DEG = 0.05;
/** `runtime/locator` lock radius, restated: past this the road has no fix on the car. */
export const FIX_M = 30;
/** Half the carriageway (two 8.125 m lanes a side), restated: past it the centre is off the road's banks. */
export const KERB_M = 16.25;

export function wrap180(d: number): number {
  let x = d;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x;
}
export const inSpan = (y: number): boolean => y >= SPAN.fromY && y <= SPAN.toY;

type Side = "E" | "W";
/** +1 = travelling north, −1 = travelling south. */
type Dir = 1 | -1;

export interface OracleCrossing {
  i: number;
  t: number;
  y: number;
  from: Side;
  /** The axis is solid where the centre went over. */
  solid: boolean;
  /** R5-2, applied literally. */
  uTurn: boolean;
  /** Why not, when it is not (the first clause that failed). */
  why: "" | "dashed-crossing" | "no-turn-round" | "after-the-turn-round" | "back-home-first" | "begun-over-dashes" | "unplaced";
}
export interface OracleTurnRound {
  /** The frame it begins on (the swing's first frame); −1 = unplaced. */
  beginI: number;
  beginY: number | null;
  beginX: number | null;
  /** The axis at the begin station: true solid, false dashed, null unplaced. */
  beginSolid: boolean | null;
  /** First frame of the unbroken run within 45° of the opposite direction. */
  arrivedI: number;
  /** The frame the run has lasted the sustain: the travel direction flips here. */
  confirmedI: number;
  confirmedT: number;
  /** Last frame of the swing that carried the nose into the opposite band. */
  endI: number;
  endT: number;
  /** Travel direction before it. */
  from: Dir;
}
export interface OracleWrongHalfRun {
  /** The first frame after the swing of a NAMING turn-round has ended. */
  fromI: number;
  fromT: number;
  y: number;
  /** How long the centre then stays across from the half of its travel direction, seconds. */
  heldSec: number;
  /** R5-2 for this standing crossing: a LATER turn-round, begun where the axis is solid, makes its bill the U-turn. */
  uTurn: boolean;
  why: OracleCrossing["why"];
}
export interface OracleTruth {
  crossings: OracleCrossing[];
  turnRounds: OracleTurnRound[];
  /** Travel direction per frame (0 until the nose is first along the road). */
  dirAt: Array<Dir | 0>;
  /** HOME per frame: the half a crossing is measured from (null until the road first sees the car). */
  homeAt: Array<Side | null>;
  /** R6-2: after a naming turn-round's swing, the centre across the SOLID axis from the half of its new travel direction. */
  wrongHalfRuns: OracleWrongHalfRun[];
}

const offDir = (h: number, dir: Dir): number => (dir === 1 ? Math.abs(wrap180(h)) : 180 - Math.abs(wrap180(h)));
const sideOf = (x: number): Side => (x > 0 ? "E" : "W");

/**
 * Everything R5-1 … R5-3 say about one drive, from its poses.
 */
export function oracle(ticks: readonly SimTick[]): OracleTruth {
  const n = ticks.length;
  const X = ticks.map((k) => k.position.x);
  const Y = ticks.map((k) => k.position.y);
  const H = ticks.map((k) => wrap180(k.headingDeg));
  const T = ticks.map((k) => k.t);
  const seen = X.map((x) => Math.abs(x) <= FIX_M);

  // ---- the swings: an id per frame, and each swing's sense and first frame ----
  // (R6-5) A swing's id changes when it ends or turns the other way; a swing
  // that resumes takes its id back. Its first frame is the one the nose LEFT
  // its standing heading on — a station only if the road could see the car
  // there.
  const swingId: number[] = new Array<number>(n).fill(0);
  const swingSense: number[] = [0]; // by id; id 0 = «not swinging»
  const swingStart: number[] = [-1]; // by id: the last frame at the standing heading; −1 = no station
  {
    let id = 0;
    /** The swing that last ended (it may resume). */
    let endedId = 0;
    /** The heading the degrees are counted from. */
    let countedH = H[0] ?? 0;
    let still = true;
    let leftSense = 0;
    let leftM = 0;
    let leftI = -1;
    /** Since the last counted degree: metres, and the heading it was counted at. */
    let degM = Number.POSITIVE_INFINITY;
    let degH: number | null = null;
    for (let i = 1; i < n; i++) {
      const dt = Math.min(2, Math.max(0, T[i] - T[i - 1]));
      const step = (Math.abs(ticks[i].speedKmh) / 3.6) * dt;
      degM += step;
      const d = wrap180(H[i] - countedH);
      const sense = d > 0 ? 1 : -1;
      if (Math.abs(d) <= SWING_STILL_DEG) {
        still = true;
        leftSense = 0;
        leftM = 0;
      } else {
        if (still || leftSense !== sense) {
          leftSense = sense;
          leftM = 0;
          leftI = seen[i - 1] ? i - 1 : -1;
        }
        still = false;
        leftM += step;
        if (Math.abs(d) >= SWING_ADVANCE_DEG) {
          if (id !== 0 && swingSense[id] === sense) {
            // the swing in progress
          } else if (
            id === 0 &&
            endedId !== 0 &&
            swingSense[endedId] === sense &&
            degH !== null &&
            degM <= SWING_RESUME_MAX_M &&
            sense * wrap180(H[i] - degH) * SWING_RATE_WINDOW_M >= degM
          ) {
            id = endedId;
          } else {
            swingSense.push(sense);
            swingStart.push(leftI);
            id = swingSense.length - 1;
          }
          degM = 0;
          degH = H[i];
          countedH = H[i];
          still = true;
          leftSense = 0;
          leftM = 0;
        } else if (leftM >= SWING_RATE_WINDOW_M) {
          countedH = H[i];
          still = true;
          leftSense = 0;
          leftM = 0;
        }
      }
      if (id !== 0 && degM >= SWING_SETTLE_M) {
        endedId = id;
        id = 0;
      }
      swingId[i] = id;
    }
  }

  // ---- the travel direction and the turn-rounds ----
  const dirAt: Array<Dir | 0> = new Array<Dir | 0>(n).fill(0);
  const turnRounds: OracleTurnRound[] = [];
  {
    let dir: Dir | 0 = 0;
    let turning = false;
    let beginI = -1;
    let arrivedI = -1;
    let arrivalSwing = 0;
    for (let i = 0; i < n; i++) {
      const prevSeenI = i > 0 && seen[i - 1] ? i - 1 : -1;
      if (dir === 0) {
        // The first direction is read where the road first sees the car.
        if (seen[i]) {
          if (Math.abs(H[i]) <= WITH_DEG) dir = 1;
          else if (Math.abs(H[i]) >= 180 - WITH_DEG) dir = -1;
        }
        dirAt[i] = dir;
        continue;
      }
      const a = offDir(H[i], dir);
      if (a <= WITH_DEG) {
        turning = false;
        arrivedI = -1;
      } else {
        if (!turning) {
          turning = true;
          // The place: where the swing in progress began; with no swing in
          // progress, the frame before this one; after an unseen stretch, unknown.
          beginI = swingId[i] !== 0 ? swingStart[swingId[i]] : prevSeenI;
        }
        if (a >= 180 - WITH_DEG) {
          if (arrivedI < 0) {
            arrivedI = i;
            arrivalSwing = swingId[i];
          }
          // Confirmed only on a frame the road can see.
          if (seen[i] && T[i] - T[arrivedI] >= SUSTAIN_SEC - 1e-9) {
            // The swing's last frame: scan on from the arrival — and no further
            // than the nose stays within 45° of the NEW direction (a swing that
            // carries it on out of that band is the next excursion).
            let endI = arrivedI;
            const newDir: Dir = dir === 1 ? -1 : 1;
            if (arrivalSwing !== 0) {
              while (endI + 1 < n && swingId[endI + 1] === arrivalSwing && offDir(H[endI + 1], newDir) <= WITH_DEG) endI++;
            } else {
              endI = arrivedI - 1;
            }
            turnRounds.push({
              beginI,
              beginY: beginI >= 0 ? Y[beginI] : null,
              beginX: beginI >= 0 ? X[beginI] : null,
              beginSolid: beginI >= 0 ? inSpan(Y[beginI]) : null,
              arrivedI,
              confirmedI: i,
              confirmedT: T[i],
              endI,
              endT: T[Math.max(0, endI)],
              from: dir,
            });
            dir = dir === 1 ? -1 : 1;
            turning = false;
            arrivedI = -1;
          }
        } else {
          arrivedI = -1;
        }
      }
      dirAt[i] = dir;
    }
  }

  // ---- the centre's crossings, and R5-2 ----
  const crossings: OracleCrossing[] = [];
  /** The turn-round that makes the standing crossing at frame i the U-turn. */
  const namedBy = new Map<number, OracleTurnRound>();
  for (let i = 1; i < n; i++) {
    const from = sideOf(X[i - 1]);
    if (sideOf(X[i]) === from) continue;
    const c: OracleCrossing = { i, t: T[i], y: Y[i], from, solid: inSpan(Y[i]), uTurn: false, why: "" };
    crossings.push(c);
    if (!c.solid) {
      c.why = "dashed-crossing";
      continue;
    }
    c.why = judgeStanding(i, from);
    c.uTurn = c.why === "";
  }
  /**
   * R5-2 (ii) and (iii) FOR A CENTRE ACROSS THE SOLID AXIS FROM `from` SINCE
   * FRAME `i` — a crossing made on that frame, or (R6-2) a car the swing of a
   * billed turn-round has left there. `""` = it is the U-turn.
   */
  function judgeStanding(i: number, from: Side): OracleCrossing["why"] {
    // (ii) the turn-rounds this crossing can belong to: the one just confirmed,
    // if its swing is still going (the crossing is made during it) — and the
    // first one confirmed at or after it. R5-2 asks whether ONE qualifies: a
    // crossing made in the tail of a turn-round begun over the dashes is still
    // the U-turn if the car stays out and then turns round where the axis is
    // solid. The verdict reported when none does is the first candidate's.
    const justDone = [...turnRounds].reverse().find((r) => r.confirmedI < i);
    const next = turnRounds.find((r) => r.confirmedI >= i);
    const candidates: Array<OracleTurnRound | undefined> = [];
    if (justDone !== undefined && justDone.endI >= i) candidates.push(justDone);
    candidates.push(next);
    let first: OracleCrossing["why"] | null = null;
    for (const cand of candidates) {
      const why = judgeAgainst(i, from, cand, justDone);
      if (why === "") {
        namedBy.set(i, cand as OracleTurnRound);
        return "";
      }
      if (first === null) first = why;
    }
    return first ?? "no-turn-round";
  }
  function judgeAgainst(i: number, from: Side, tr: OracleTurnRound | undefined, justDone: OracleTurnRound | undefined): OracleCrossing["why"] {
    const c: { why: OracleCrossing["why"] } = { why: "" };
    judge: {
    if (tr === undefined) {
      // No turn-round is confirmed at or after it. If one was confirmed before
      // it, the car was already travelling the other way when it crossed.
      c.why = justDone !== undefined ? "after-the-turn-round" : "no-turn-round";
      break judge;
    }
    if (tr.endI < i) {
      // The nose was already in the opposite band and its swing had ended.
      c.why = "after-the-turn-round";
      break judge;
    }
    // …the car not having gone back to the bank and direction it came from
    // before that turn-round began.
    const dirThen = dirAt[i - 1] === 0 ? tr.from : (dirAt[i - 1] as Dir);
    let home = false;
    const until = tr.beginI >= 0 ? tr.beginI : tr.arrivedI;
    /** Since when (frame) the car has been across and travelling WITH that bank. */
    let withFar = -1;
    for (let j = i; j < until; j++) {
      if (Math.abs(X[j]) > KERB_M) continue;
      const sj = sideOf(X[j]);
      // Still on the swing it crossed on, or on one begun since, across?
      const sw = swingId[j];
      // (A crossing made in the tail of a turn-round already confirmed is not waiting on that swing.)
      const inATail = justDone !== undefined && justDone.endI >= i && tr !== justDone;
      const midSwing = sw !== 0 && ((sw === swingId[i] && !inATail) || (swingStart[sw] >= i && sideOf(X[swingStart[sw]]) !== from));
      if (sj === from) {
        withFar = -1;
        if (j > i && offDir(H[j], dirThen) <= WITH_DEG && !midSwing) {
          home = true;
          break;
        }
        continue;
      }
      // Across: travelling with the bank it is on (the east half runs north, the west half south)?
      if (offDir(H[j], sj === "E" ? 1 : -1) <= WITH_DEG) {
        if (withFar < 0) withFar = j;
        if (T[j] - T[withFar] >= SUSTAIN_SEC - 1e-9 && !midSwing) {
          home = true;
          break;
        }
      } else {
        withFar = -1;
      }
    }
    if (home) {
      c.why = "back-home-first";
      break judge;
    }
    // (iii) the place.
    if (tr.beginSolid === null) {
      c.why = "unplaced";
      break judge;
    }
    if (!tr.beginSolid) {
      c.why = "begun-over-dashes";
      break judge;
    }
    }
    return c.why;
  }
  // ---- HOME, and the wrong-half runs (R6-1, R6-2) ----
  const halfOf = (d: Dir): Side => (d === 1 ? "E" : "W");
  const homeAt: Array<Side | null> = new Array<Side | null>(n).fill(null);
  const wrongHalfRuns: OracleWrongHalfRun[] = [];
  {
    /** The turn-rounds that NAME a crossing (R5-2), by the frame their swing ends on. */
    const namingEnd = new Map<number, OracleTurnRound>();
    const plainConfirm = new Map<number, OracleTurnRound>();
    /** The frame after the one the swing a turn-round arrived on ENDS (not merely leaves the new band). */
    const afterSwingOf = (tr: OracleTurnRound): number => {
      const sw = swingId[tr.arrivedI];
      let e = Math.max(tr.arrivedI, tr.confirmedI);
      if (sw !== 0) while (e + 1 < n && swingId[e + 1] === sw) e++;
      return e + 1;
    };
    for (const tr of turnRounds) {
      const names = crossings.some((c) => c.uTurn && namedBy.get(c.i) === tr);
      if (names) namingEnd.set(afterSwingOf(tr), tr);
      else plainConfirm.set(tr.confirmedI, tr);
    }
    let home: Side | null = null;
    /** The frame the centre last left HOME on (−1 = it is at home). */
    let leftI = -1;
    let withFar = -1;
    for (let i = 0; i < n; i++) {
      const onRoad = Math.abs(X[i]) <= KERB_M;
      const side = sideOf(X[i]);
      if (home === null) {
        if (onRoad) home = side;
        homeAt[i] = home;
        continue;
      }
      if (namingEnd.has(i) && dirAt[i] !== 0) {
        // (c) R6-2: the swing of a naming turn-round has ended.
        home = halfOf(dirAt[i] as Dir);
        leftI = side === home ? -1 : i;
        withFar = -1;
        // Across the SOLID axis: the centre last passed the axis where it is solid.
        const lastPass = [...crossings].reverse().find((c) => c.i <= i);
        if (onRoad && side !== home && lastPass !== undefined && lastPass.solid) {
          let j = i;
          while (j + 1 < n && sideOf(X[j + 1]) !== home && Math.abs(X[j + 1]) <= KERB_M) j++;
          const why = judgeStanding(i, home);
          wrongHalfRuns.push({ fromI: i, fromT: T[i], y: Y[i], heldSec: T[j] - T[i], uTurn: why === "", why });
          // A later turn-round that makes THIS standing crossing the U-turn is a naming turn-round too.
          const later = why === "" ? namedBy.get(i) : undefined;
          if (later !== undefined && plainConfirm.get(later.confirmedI) === later) {
            plainConfirm.delete(later.confirmedI);
            namingEnd.set(afterSwingOf(later), later);
          }
        }
      } else if (plainConfirm.has(i)) {
        // (b) a turn-round that names nothing: where the car is, is home.
        home = side;
        leftI = -1;
        withFar = -1;
      }
      if (onRoad) {
        if (side === home) {
          leftI = -1;
          withFar = -1;
        } else {
          if (leftI < 0) leftI = i;
          const sw = swingId[i];
          const start = sw !== 0 ? swingStart[sw] : -1;
          // (A crossing made in the tail of a turn-round already confirmed belongs to that turn-round: its
          // swing is not one this crossing is still waiting on.)
          const leftInATail = turnRounds.some((r) => leftI > r.confirmedI && leftI <= r.endI);
          const midSwing = sw !== 0 && ((sw === swingId[leftI] && !leftInATail) || (start >= leftI && sideOf(X[start]) !== home));
          if (offDir(H[i], side === "E" ? 1 : -1) <= WITH_DEG) {
            if (withFar < 0) withFar = i;
            // (a) travelling WITH the half it is on, for the sustain, not mid-swing.
            if (T[i] - T[withFar] >= SUSTAIN_SEC - 1e-9 && !midSwing) {
              home = side;
              leftI = -1;
              withFar = -1;
            }
          } else {
            withFar = -1;
          }
        }
      }
      homeAt[i] = home;
    }
  }
  return { crossings, turnRounds, dirAt, homeAt, wrongHalfRuns };
}

/**
 * R6-3 — IS THE HALF THE CENTRE IS ON THE ONCOMING ONE, for the car's travel
 * direction on frame `i`? The east half carries traffic north, the west half
 * south. `null` = the car has no travel direction yet. A frame within two
 * frames of a confirmed turn-round is a BOUNDARY frame (`"boundary"`): the
 * travel direction changes there, and either reading is the truth of a frame
 * one sixtieth of a second away.
 */
export function oncomingAt(truth: OracleTruth, ticks: readonly SimTick[], i: number): boolean | "boundary" | null {
  const d = truth.dirAt[i];
  if (d === 0) return null;
  if (truth.turnRounds.some((r) => Math.abs(r.confirmedI - i) <= 2)) return "boundary";
  const half: Dir = ticks[i].position.x > 0 ? 1 : -1;
  return half !== d;
}

/**
 * R6-1 / W2 — WAS THE CENTRE ACROSS FROM HOME when a bill went out at frame
 * `i`? (Home can become the half the car is on at the very frame the sustain
 * is met, which is the frame a bill by position goes out on: the three frames
 * before it are read too.)
 */
export function acrossFromHomeAt(truth: OracleTruth, ticks: readonly SimTick[], i: number): boolean {
  for (let j = Math.max(0, i - 3); j <= i; j++) {
    const h = truth.homeAt[j];
    if (h !== null && sideOf(ticks[j].position.x) !== h) return true;
  }
  return false;
}

/**
 * R6-1 / W2, IN FULL — IS A BILL AT FRAME `i` THE BILL OF A CROSSING THE CENTRE
 * HAS MADE? Either the centre is across from home on that frame, or the centre
 * really went over the axis the detector's sustain before it (0.5–0.8 s: the
 * bill by position of that crossing — the way back over the solid axis during a
 * turn-round ends with the centre AT home, and is a crossing all the same).
 */
export function billIsOfACrossing(truth: OracleTruth, ticks: readonly SimTick[], i: number): boolean {
  if (acrossFromHomeAt(truth, ticks, i)) return true;
  const t = ticks[i].t;
  return truth.crossings.some((c) => t - c.t >= 0.5 && t - c.t <= 0.8);
}

/** The crossing a bill at session time `t` is about: the last solid one at or before it. */
export function crossingBilledAt(truth: OracleTruth, t: number): OracleCrossing | null {
  let best: OracleCrossing | null = null;
  for (const c of truth.crossings) {
    if (c.solid && c.t <= t + 1e-6) best = c;
  }
  return best;
}
