/**
 * THE ROUND-2 RE-JUDGE VERIFIER'S REDUCER TAPES (2026-11-02, lane flooredinvite,
 * `sc-follow-tailgater:63c0c28c`; the integrator's Q7 and Q8), rebuilt verbatim
 * from its probe (60 Hz; the profile is the acceleration in m/s² by time and
 * speed; `extra` adds tick fields by time). Shared by
 * unbilled-brake-cause-void.test.ts and the base-measurement recorder that wrote
 * unbilled-brake-round3.base.json (the base 230c7b8 reducer's CLEAN_DRIVING
 * times on these very tapes).
 *
 *  · PUMPVOID — 60 км/ч: 0.25 s at −9, a release of `r`, 0.3 s at −9 (it
 *    pumps on burst 2), and a junction 20 m ahead from `cAt` into burst 2 —
 *    the cause arm voids the chain; then back up to 50 and on.
 *  · PUMPNOCAUSE — the same pump with no junction: the control (a pumped
 *    record, the praise over it withheld).
 *  · CAUSEVOID — 38 км/ч: 0.2 s at −9, a release of `g`, 0.6 s at −9 (it pumps,
 *    then floors), a stop line 3 m ahead from 0.55 s into burst 2 — the cause
 *    arm voids the floored record.
 *  · F1TAIL — 50 км/ч: 0.15 s at −9.5, a release of `g`, 0.15 s at −9.5, then
 *    0.9 s at −6.5 (burst 2's window keeps its credit on the firm tail).
 */
import type { SimTick } from "../types";
import { tick } from "./fixtures";

export type Prof = (t: number, v: number) => number;
export type Extra = (t: number, v: number) => Partial<SimTick>;

export function round3Tape(cruiseKmh: number, endSec: number, prof: Prof, hz = 60, maxKmh = 50, extra?: Extra): SimTick[] {
  const dt = 1 / hz;
  const out: SimTick[] = [];
  let v = cruiseKmh / 3.6;
  let y = 0;
  const n = Math.round(endSec * hz);
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    out.push(
      tick(t, {
        speedKmh: v * 3.6,
        maxSpeedKmh: maxKmh,
        gear: v * 3.6 > 25 ? 3 : v > 0 ? 2 : 1,
        position: { x: 0, y },
        ...(extra ? extra(t, v) : {}),
      }),
    );
    const a = prof(t, v);
    const v0 = v;
    v = Math.max(0, v + a * dt);
    y += ((v0 + v) / 2) * dt;
  }
  return out;
}

const H = 1 / 60;

export function round3Tapes(): Record<string, SimTick[]> {
  const cases: Record<string, SimTick[]> = {};
  for (const g of [0.1, 0.2, 0.3]) {
    for (let k = 0; k <= 96; k++) {
      const t0 = 16.5 + k * H;
      cases[`F1TAIL_g${g}_t0_${t0.toFixed(3)}`] = round3Tape(50, 40, (t, v) => {
        const u = t - t0 + 1e-9;
        if (u >= 0 && u < 0.15) return -9.5;
        if (u >= 0.15 + g && u < 0.3 + g) return -9.5;
        if (u >= 0.3 + g && u < 1.2 + g && v > 2) return -6.5;
        return 0;
      });
    }
  }
  for (const g of [0.1, 0.15, 0.25]) {
    for (let k = 0; k <= 66; k++) {
      const t0 = 22.7 + k * H;
      cases[`CAUSEVOID_g${g}_t0_${t0.toFixed(3)}`] = round3Tape(
        38,
        40,
        (t, v) => {
          const u = t - t0 + 1e-9;
          if (u >= 0 && u < 0.2) return -9;
          if (u >= 0.2 + g && u < 0.8 + g && v > 0.5) return -9;
          return 0;
        },
        60,
        50,
        (t) => (t - t0 >= 0.2 + g + 0.55 && t - t0 < 0.2 + g + 3 ? { nextStopLineM: 3 } : {}),
      );
    }
  }
  const pumpProf =
    (t0: number, r: number): Prof =>
    (t, v) => {
      const u = t - t0 + 1e-9;
      if (u >= 0 && u < 0.25) return -9;
      if (u >= 0.25 + r && u < 0.55 + r) return -9;
      if (u >= 0.55 + r && v < 50 / 3.6) return 2;
      return 0;
    };
  for (const r of [0.1, 0.2]) {
    for (const cAt of [0.2, 0.25]) {
      for (const t0 of [6, 8, 10, 12]) {
        cases[`PUMPVOID_r${r}_c${cAt}_t0_${t0}`] = round3Tape(60, 60, pumpProf(t0, r), 60, 90, (t) =>
          t - t0 >= 0.25 + r + cAt && t - t0 < 0.25 + r + cAt + 3 ? { nextJunctionM: 20 } : {},
        );
        cases[`PUMPNOCAUSE_r${r}_c${cAt}_t0_${t0}`] = round3Tape(60, 60, pumpProf(t0, r), 60, 90);
      }
    }
  }
  return cases;
}

/**
 * ROUND 4 (the integrator's Q9 — the round-3 verifier's PUMPTAILVOID, from its
 * probe zzV4Probe.test.ts 'tail' family): 60 км/ч, 0.25 s at −9, a release of
 * `r`, 0.3 s at −9 (the chain pumps on burst 2), then a GENTLE tail at −`a` for
 * `T` s with the pedal never released, and a junction 20 m ahead only from the
 * END of the tail (the cause arm then reaches the open application long after
 * its last credited frame); then back up to 50. `withCause` false is the
 * verifier's PUMPTAILNOCAUSE control.
 */
export function pumpTailTape(r: number, a: number, T: number, t0: number, withCause: boolean, causeAfterBurst2Sec: number = T): SimTick[] {
  const prof: Prof = (t, v) => {
    const u = t - t0 + 1e-9;
    if (u >= 0 && u < 0.25) return -9;
    if (u >= 0.25 + r && u < 0.55 + r) return -9;
    if (u >= 0.55 + r && u < 0.55 + r + T + 0.1) return v > 1 ? -a : 0;
    if (u >= 0.55 + r + T + 0.1 && v < 50 / 3.6) return 2;
    return 0;
  };
  return round3Tape(60, 45, prof, 60, 90, withCause
    ? (t) => (t - t0 >= 0.55 + r + causeAfterBurst2Sec && t - t0 < 0.55 + r + causeAfterBurst2Sec + 3 ? { nextJunctionM: 20 } : {})
    : undefined);
}

export function round4TailTapes(): Record<string, SimTick[]> {
  const cases: Record<string, SimTick[]> = {};
  for (const r of [0.1, 0.2]) {
    for (const a of [3, 4.5]) {
      for (const T of [1.0, 2.0]) {
        for (let k = 0; k <= 50; k++) {
          const t0 = 12.5 + k * 0.05;
          cases[`PUMPTAILVOID_r${r}_a${a}_T${T}_t0_${t0.toFixed(2)}`] = pumpTailTape(r, a, T, t0, true);
          if (k % 10 === 0) cases[`PUMPTAILNOCAUSE_r${r}_a${a}_T${T}_t0_${t0.toFixed(2)}`] = pumpTailTape(r, a, T, t0, false);
        }
      }
    }
  }
  return cases;
}

/**
 * ROUND 5 (the round-4 verifier's FLOORTAILVOID, zzV5Probe.test.ts; the
 * integrator's Q10b): `cruiseKmh` (38), `b1` s at −9 (0.2; 0 = no first burst,
 * a single application), a release of `g`, −9 for `T2` s (from 38 it pumps on
 * burst 2 and then FLOORS — burst 2 alone holds the sustain from under the
 * floor), then a gentle −2.6 tail for `tail` s with the pedal never released,
 * and a junction 20 m ahead from `causeAfterSec` after the tape's brake began
 * (default: the END of the tail — the cause reaches the open application long
 * after its last credited frame); then back up to `cruiseKmh`. `withCause`
 * false is the FLOORTAILNOCAUSE control. `endSec` 60 so a later payout exists.
 */
export function floorTailTape(
  g: number,
  T2: number,
  tail: number,
  t0: number,
  withCause: boolean,
  o: { b1?: number; cruiseKmh?: number; causeAfterSec?: number; endSec?: number } = {},
): SimTick[] {
  const b1 = o.b1 ?? 0.2;
  const cruise = o.cruiseKmh ?? 38;
  const prof: Prof = (t, v) => {
    const u = t - t0 + 1e-9;
    if (b1 > 0 && u >= 0 && u < b1) return -9;
    if (u >= b1 + g && u < b1 + g + T2) return -9;
    if (u >= b1 + g + T2 && u < b1 + g + T2 + tail + 0.1) return v > 0.6 ? -2.6 : 0;
    if (u >= b1 + g + T2 + tail + 0.1 && v < cruise / 3.6) return 2;
    return 0;
  };
  const cAt = o.causeAfterSec ?? b1 + g + T2 + tail;
  return round3Tape(cruise, o.endSec ?? 60, prof, 60, 50, withCause
    ? (t) => (t - t0 >= cAt && t - t0 < cAt + 3 ? { nextJunctionM: 20 } : {})
    : undefined);
}

/**
 * ROUND 6 (Q10c, the round-5 verifier's v6-repress): a floored brake check
 * (`single` false: from 38 км/ч −9 for 0.2 s, 0.1 s off, −9 for 0.5 s — pumps,
 * then floors; `single` true: from 30 км/ч one −9 application of 0.6 s), then a
 * −2.6 tail for `tail` s, a junction 20 m ahead from the tail's END for 3 s
 * (a late cause), a release of `R` s, a gentle RE-PRESS at `aP` for 1 s with the
 * junction still in reach, then back up to the cruise. `withCause` false is the
 * no-cause control (the same kinematics).
 */
export function repressTape(
  o: { single: boolean; tail: number; R: number; aP: number; t0: number },
  withCause: boolean,
): SimTick[] {
  const b1 = o.single ? 0 : 0.2;
  const g = o.single ? 0 : 0.1;
  const T2 = o.single ? 0.6 : 0.5;
  const cruise = o.single ? 30 : 38;
  const e1 = b1 + g + T2;
  const e2 = e1 + o.tail;
  const e3 = e2 + o.R;
  const e4 = e3 + 1.0;
  const prof: Prof = (t, v) => {
    const u = t - o.t0 + 1e-9;
    if (b1 > 0 && u >= 0 && u < b1) return -9;
    if (u >= b1 + g && u < e1) return -9;
    if (u >= e1 && u < e2) return v > 0.6 ? -2.6 : 0;
    if (u >= e2 && u < e3) return 0;
    if (u >= e3 && u < e4) return v > 0.6 ? o.aP : 0;
    if (u >= e4 && v < cruise / 3.6) return 2;
    return 0;
  };
  return round3Tape(cruise, 60, prof, 60, 50, withCause
    ? (t) => (t - o.t0 >= e2 && t - o.t0 < e2 + 3 ? { nextJunctionM: 20 } : {})
    : undefined);
}

/**
 * ROUND 7 (Q10f, the round-6 verifier's zzV7Split): a brake check whose LATE
 * cause leaves reach while the pedal is still down, then a short release and a
 * re-press. From `cruise`: −9 for `b1` s (0 = a single application), `g` off,
 * −9 for `T2`, a gentle tail at `aT` for `tail` s — the cause (a lane
 * excursion, laneOffsetM 3.6, or a junction 20 m ahead) from `cs` after the
 * burst ends, lasting `cd` — then a release of `R` s, a second application at
 * `a2` for `P` s, then back up to the cruise. `withCause` false is the no-cause
 * control (the same kinematics).
 */
export interface SplitShape {
  cruise: number;
  b1: number;
  g: number;
  T2: number;
  aT: number;
  tail: number;
  cs: number;
  cd: number;
  R: number;
  a2: number;
  P: number;
  t0: number;
  kind: "lane" | "junction";
}
export function splitTape(o: SplitShape, withCause: boolean): SimTick[] {
  const { b1, g, T2, aT, tail, R, a2, P, cruise, t0 } = o;
  const e1 = b1 + g + T2;
  const e2 = e1 + tail;
  const e3 = e2 + R;
  const e4 = e3 + P;
  const prof: Prof = (t, v) => {
    const u = t - t0 + 1e-9;
    if (b1 > 0 && u >= 0 && u < b1) return -9;
    if (u >= b1 + g && u < e1) return -9;
    if (u >= e1 && u < e2) return v > 0.6 ? aT : 0;
    if (u >= e2 && u < e3) return 0;
    if (u >= e3 && u < e4) return v > 0.6 ? a2 : 0;
    if (u >= e4 && v < cruise / 3.6) return 2;
    return 0;
  };
  const c0 = e1 + o.cs;
  const c1 = c0 + o.cd;
  return round3Tape(cruise, 70, prof, 60, 90, withCause
    ? (t) => {
        const u = t - t0 + 1e-9;
        if (u >= c0 && u < c1) return o.kind === "lane" ? { laneOffsetM: 3.6 } : { nextJunctionM: 20 };
        return {};
      }
    : undefined);
}

/**
 * ROUND 7 (Q10g): the differential fuzz's timeline — from `cruise`, at `t0` a
 * run of pedal segments ({ d seconds, a m/s² }; a < 0 brakes while the car
 * still moves, 0 is a release), then back up to the cruise at +2 m/s².
 */
export function segmentTape(cruise: number, t0: number, segs: Array<{ d: number; a: number }>, endSec: number): SimTick[] {
  const bounds: number[] = [];
  let acc = t0;
  for (const sg of segs) {
    acc += sg.d;
    bounds.push(acc);
  }
  const end = acc;
  return round3Tape(cruise, endSec, (t, v) => {
    const u = t + 1e-9;
    if (u >= t0 && u < end) {
      const a = segs[bounds.findIndex((b) => u < b)]!.a;
      return a < 0 ? (v > 0.6 ? a : 0) : 0;
    }
    if (u >= end && v < cruise / 3.6) return 2;
    return 0;
  }, 60, 90);
}
