/**
 * THE TASK CEILING, ROUND 13 — shared witness programmes (not a test file), for the reducer-level and lesson-level
 * round-13 tests.
 *
 *  · `orderShape` / `ORDER_PLACEMENTS` — the round-12 verifier's ORDER probe
 *    (`scratchpad/cap/verify12/probes/zz-v12b-order.test.ts`), its `build` frame for frame: one driving line (a
 *    sign-bound ≤60 mark blown at 67.6 on a posted 60; 3 s in the sign's grace band; the sign then rises to 70 over the
 *    ≤60 stamp, the car at 66) and ONE weather or bend first bill moved by fractions of a second across the stamp frame.
 *  · `pairBlow` — a sign-bound blow whose GLASS figure is under its compiled GATE (the round-12 verifier's V16 class:
 *    306 of the 521 committed capped objectives; `sc-speed-creep` L2 shows ≤50 over a gate of 54.5).
 *  · `stampCard` — the verifier's card probe (`zz-v12b-card.test.ts`): the stamp-billed arrival, the sign risen to 65
 *    by the frame the card is shown on.
 */
import type { SimTick } from "..";
import { tick } from "./fixtures";
import { prog } from "./taskCapProgrammes";

export const TASK = "TASK_SPEED_CAP_EXCEEDED";
export const COND = "SPEED_TOO_FAST_FOR_CONDITIONS";
export const CURVE = "SPEED_TOO_FAST_FOR_CURVE";

/** A stamp and an arrival with the glass figure and the gate given SEPARATELY (rounds 3–12 helpers write them equal). */
export const arrPair = (gate: number, glass: number, b: number, v: number) => ({ taskCapArrival: { capKmh: gate, shownKmh: glass, graceKmh: 5, blownAtSec: b, arrivalKmh: v } });
export const stampPair = (gate: number, glass: number, b: number) => ({ taskSpeedCap: { capKmh: gate, shownKmh: glass, graceKmh: 5, blownAtSec: b } });

// ---------------------------------------------------------------------------
// THE ORDER PROBE (verifier 12, `build`, verbatim but for the pair)
// ---------------------------------------------------------------------------

export interface OrderShape {
  /** The graded twin: the sign 70 from the start (the cap under the sign at the blow). */
  graded: boolean;
  /** The first frame the sign is 70 (the stamp). */
  stampAt: number;
  /** A bend advisory 45 over [from, to): its first bill lands at from + 1.5 s. */
  bend?: [number, number];
  /** A rain window over [from, to): its first bill lands at from + 3 s. */
  rain?: [number, number];
  /** The sign drops back to 60 with the car at 68 (the speeding bills 2 s later). */
  signBackAt?: number;
  /** A second ≤60 mark blown at this time. */
  mark2?: number;
  /** Seconds of stretch after the stamp. */
  len: number;
  /** The compiled gate and the glass figure of the ≤60 mark (default 60 / 60). */
  gate?: number;
  glass?: number;
  /** The speed held from the stamp on (default 66: over the task's bill line). */
  stretchKmh?: number;
  /** The sign the stretch is driven under (default 70: the car at 66 is under it, so the M-16 hold starts on the stamp
   *  and the act ends 4 s later). 62 keeps the car OVER the sign, inside its grace band: the act runs on through the stretch. */
  raised?: number;
  /** A second rain window (a second weather act of the ledger, after the first has closed). */
  rain2?: [number, number];
}
/** 10 Hz frames. Blow frame 1.0 (the arrival speed 67.6 read from the frame before it). */
export function orderShape(sh: OrderShape): SimTick[] {
  const out: SimTick[] = [];
  const gate = sh.gate ?? 60;
  const glass = sh.glass ?? 60;
  const end = sh.stampAt + sh.len;
  for (let i = 0; i < Math.round((end + 15) * 10); i++) {
    const t = i / 10;
    let v = 57;
    let sign = sh.graded ? 70 : 60;
    const o: Record<string, unknown> = {};
    if (t >= 0.9 - 1e-9 && t < 1.0 - 1e-9) v = 67.6;
    if (t >= 1.0 - 1e-9 && t < end - 1e-9) {
      // the wait: in the grace band of the posted 60 (no SPEEDING bill, no correction); then over the task line under the raised sign
      v = t >= sh.stampAt - 1e-9 ? (sh.stretchKmh ?? 66) : 64;
      if (!sh.graded && t >= sh.stampAt - 1e-9) sign = sh.raised ?? 70;
      if (sh.signBackAt !== undefined && t >= sh.signBackAt - 1e-9) {
        sign = 60;
        v = 68;
      }
      const latch = sh.mark2 !== undefined && t >= sh.mark2 - 1e-9 ? sh.mark2 : 1.0;
      if (Math.abs(t - 1.0) < 1e-9) Object.assign(o, arrPair(gate, glass, 1.0, 67.6));
      if (sh.mark2 !== undefined && Math.abs(t - sh.mark2) < 1e-9) Object.assign(o, arrPair(gate, glass, sh.mark2, 67.6));
      if (glass < sign) Object.assign(o, stampPair(gate, glass, latch));
    }
    if (t >= end - 1e-9) {
      v = 50;
      sign = 60;
    }
    if (sh.bend && t >= sh.bend[0] - 1e-9 && t < sh.bend[1] - 1e-9) o.curveAdvisoryKmh = 45;
    if ((sh.rain && t >= sh.rain[0] - 1e-9 && t < sh.rain[1] - 1e-9) || (sh.rain2 && t >= sh.rain2[0] - 1e-9 && t < sh.rain2[1] - 1e-9)) {
      o.rain = true;
      o.headlights = "low";
    }
    out.push(tick(t, { maxSpeedKmh: sign, speedKmh: v, ...o } as Partial<SimTick>));
  }
  return out;
}

/** The stamp frame of the verifier's probe: the sign rises 3 s after the blow. */
export const ORDER_STAMP_AT = 4.0;
/** Where the weather's or the bend's FIRST BILL lands, relative to the stamp frame (the verifier's five placements). */
export const ORDER_PLACEMENTS: ReadonlyArray<{ tag: string; off: number; side: "before" | "on" | "after" }> = [
  { tag: "0.5 s BEFORE the stamp", off: -0.5, side: "before" },
  { tag: "ONE FRAME BEFORE the stamp", off: -0.1, side: "before" },
  { tag: "ON the stamp frame", off: 0, side: "on" },
  { tag: "ONE FRAME AFTER the stamp", off: 0.1, side: "after" },
  { tag: "0.2 s AFTER the stamp", off: 0.2, side: "after" },
  { tag: "1 s AFTER the stamp", off: 1.0, side: "after" },
];
/** One kin first bill at `ORDER_STAMP_AT + off`: the bend's window opens 1.5 s before it, the rain's 3 s before it. */
export function orderKin(kind: "BEND" | "RAIN", off: number, len: number, extra: Partial<OrderShape> = {}): SimTick[] {
  const tb = ORDER_STAMP_AT + off;
  return orderShape({
    graded: false,
    stampAt: ORDER_STAMP_AT,
    len,
    ...(kind === "BEND" ? { bend: [tb - 1.5, tb + 1.0] as [number, number] } : { rain: [tb - 3.0, tb + 1.0] as [number, number] }),
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// THE PAIR (the verifier's V16 class) and THE STAMP-BILLED CARD (its V35)
// ---------------------------------------------------------------------------

/**
 * `sc-speed-creep` L2's own numbers at reducer level: the glass shows ≤50, the compiled gate is 54.5, the sign 50 —
 * a sign-bound mark (the glass figure AT the sign) blown at 59.7; the car back at 46 from the next frame, so the
 * arrival waits out the M-16 hold and bills on the held correction (5.0), quoting its blow.
 */
export const PAIR_SIGN_BOUND: SimTick[] = prog(
  [
    { from: 0, to: 0.9, v: 47 },
    { from: 0.9, to: 1.0, v: 59.7 },
    { from: 1.0, to: 1.1, v: 46, o: { ...arrPair(54.5, 50, 1.0, 59.7) } },
    { from: 1.1, to: 12, v: 46 },
  ],
  { maxSpeedKmh: 50 },
);
/** The same mark absorbed at its blow into a SPEEDING_OVER_LIMIT already billed in the act (59.7 held 3 s on the 50). */
export const PAIR_SIGN_BOUND_SPEEDING: SimTick[] = prog(
  [
    { from: 0, to: 1.0, v: 47 },
    { from: 1.0, to: 4.0, v: 59.7 },
    { from: 4.0, to: 4.1, v: 59.7, o: { ...arrPair(54.5, 50, 4.0, 59.7) } },
    { from: 4.1, to: 12, v: 46 },
  ],
  { maxSpeedKmh: 50 },
);
/**
 * An arrival handed over at 57 through a gate of 54.5 whose glass shows 50. Rounds 13–14 refused it (over the glass
 * figure plus the slack, under the gate's 59.5); round 15 (founder ruling 2026-10-03 «LIKE A SPEED SIGN») bills it:
 * the line is the glass figure plus the sign's tolerance, 55.
 */
export const PAIR_UNDER_THE_LINE: SimTick[] = prog(
  [
    { from: 0, to: 1.0, v: 47 },
    { from: 1.0, to: 1.1, v: 46, o: { maxSpeedKmh: 70, ...arrPair(54.5, 50, 1.0, 57), ...stampPair(54.5, 50, 1.0) } },
    { from: 1.1, to: 8, v: 46, o: { maxSpeedKmh: 70, ...stampPair(54.5, 50, 1.0) } },
  ],
  { maxSpeedKmh: 70 },
);
/**
 * A GRADED mark with the glass under the gate (≤50 shown, gate 54.5, on a posted 70), blown at 62; then 5 s at 52 —
 * over the glass figure, under the bill line 59.5: the grace band, neither a bill nor a correction — and 8 s at 62.
 * One continuing breach: the stretch's first bill is absorbed at 4.0… and the act's ONE re-grade lands when the
 * accrued seconds over the line reach 9 (the 52 km/h frames stop the clock, they do not wipe it).
 */
export const PAIR_GRADED_GRACE_BAND: SimTick[] = prog(
  [
    { from: 0, to: 1.0, v: 47 },
    { from: 1.0, to: 1.1, v: 62, o: { ...arrPair(54.5, 50, 1.0, 62), ...stampPair(54.5, 50, 1.0) } },
    { from: 1.1, to: 4.5, v: 62, o: { ...stampPair(54.5, 50, 1.0) } },
    { from: 4.5, to: 9.5, v: 52, o: { ...stampPair(54.5, 50, 1.0) } },
    { from: 9.5, to: 17.5, v: 62, o: { ...stampPair(54.5, 50, 1.0) } },
    { from: 17.5, to: 30, v: 45 },
  ],
  { maxSpeedKmh: 70 },
);
/**
 * A stamped stretch REVERSED over. The mark blown at 62, the car held at 62 for 7.4 s more (the stretch's first bill
 * absorbed at 4.0; the re-grade's clock 1.6 s short of its 9 s), then 3 s REVERSING at 65 — over the line by magnitude,
 * and a negative speed is at or under the glass figure, the line's own correction — then 40 forward. The task's line
 * reads forward motion: the re-grade's clock does not run while the car backs, so the act is never charged.
 */
export const PAIR_REVERSING: SimTick[] = prog(
  [
    { from: 0, to: 1.0, v: 47 },
    { from: 1.0, to: 1.1, v: 62, o: { ...arrPair(54.5, 50, 1.0, 62), ...stampPair(54.5, 50, 1.0) } },
    { from: 1.1, to: 8.5, v: 62, o: { ...stampPair(54.5, 50, 1.0) } },
    { from: 8.5, to: 11.5, v: -65, o: { gear: -1, ...stampPair(54.5, 50, 1.0) } },
    { from: 11.5, to: 24, v: 40, o: { ...stampPair(54.5, 50, 1.0) } },
  ],
  { maxSpeedKmh: 70 },
);

/**
 * The verifier's card probe: a sign-bound ≤60 mark blown at 67.6 on a posted 60; from the next frame the sign is 65
 * with the latch stamping, the car at 68 for 14 s. `glass`/`gate` let the same shape run with the glass under the gate.
 */
export function stampCard(gate: number, glass: number): SimTick[] {
  return prog(
    [
      { from: 0, to: 1.0, v: 57, o: { maxSpeedKmh: 60 } },
      { from: 1.0, to: 1.1, v: 67.6, o: { maxSpeedKmh: 60, ...arrPair(gate, glass, 1.0, 67.6) } },
      { from: 1.1, to: 15.1, v: 68, o: { maxSpeedKmh: 65, ...stampPair(gate, glass, 1.0) } },
      { from: 15.1, to: 30, v: 50, o: { maxSpeedKmh: 60 } },
    ],
    {},
  );
}

/**
 * A graded mark (glass ≤50 over a gate of 54.5, posted 70) blown at 62, then 10 s at 57: over the GLASS figure plus the
 * sign's tolerance (55), under the old gate + slack line (59.5). Through round 14 that was the task's grace band; since
 * round 15 (founder ruling 2026-10-03 «LIKE A SPEED SIGN») it is over the line — a continuing breach.
 */
export const PAIR_BETWEEN_THE_LINES: SimTick[] = prog(
  [
    { from: 0, to: 1.0, v: 47 },
    { from: 1.0, to: 1.1, v: 62, o: { ...arrPair(54.5, 50, 1.0, 62), ...stampPair(54.5, 50, 1.0) } },
    { from: 1.1, to: 11.1, v: 57, o: { ...stampPair(54.5, 50, 1.0) } },
    { from: 11.1, to: 22, v: 45 },
  ],
  { maxSpeedKmh: 70 },
);
/**
 * `sc-signal-response` L1's own numbers: the glass shows ≤45, the compiled gate is 50, the sign 50 — the gate AT the
 * sign, the glass figure UNDER it. The cap binds under the sign (ruling 2 reads the figure the student was shown), so
 * the mark blown at 55.2 is a GRADED blow: billed on its own frame, stamped from it.
 */
export const PAIR_GATE_AT_SIGN: SimTick[] = prog(
  [
    { from: 0, to: 1.0, v: 44 },
    { from: 1.0, to: 1.1, v: 55.2, o: { ...arrPair(50, 45, 1.0, 55.2), ...stampPair(50, 45, 1.0) } },
    { from: 1.1, to: 3.0, v: 44, o: { ...stampPair(50, 45, 1.0) } },
    { from: 3.0, to: 12, v: 44 },
  ],
  { maxSpeedKmh: 50 },
);

/**
 * THE REPEAT (the round-13 points differential, generated programme L51). The чл. 20, ал. 2 topic is SPENT first (a
 * taught weather overspeed at 3.0, then 4 s under every line), then a sign-bound «≤50» is blown at 59.7 and billed on its
 * stamp — CHARGED, a point on repeat — and the weather takes the act: its first bill lands `weatherOff` seconds from
 * the stamp frame (before it, on it, or after it) and it is held 12 s, past its own re-grade, with the car over the
 * task's line too. One act, one bill: ONE point in every order — the act's re-grade answers to the bill the student
 * was shown for the act, and that bill was already charged.
 */
export function repeatThenWeather(weatherOff: number): SimTick[] {
  const stampAt = 12.2;
  const from = Math.round((stampAt + weatherOff - 3) * 10) / 10;
  const wet = (t0: number, t1: number, o: Record<string, unknown>) => {
    // split a segment at the rain window's edges
    const cuts = [t0, ...[from, from + 12].filter((x) => x > t0 && x < t1), t1];
    return cuts.slice(0, -1).map((a, i) => ({ from: a, to: cuts[i + 1], o: { ...o, ...(a >= from - 1e-9 && a < from + 12 - 1e-9 ? { rain: true } : {}) } }));
  };
  return prog(
    [
      { from: 0, to: 4.0, v: 47, o: { rain: true } },
      { from: 4.0, to: 8.0, v: 30 },
      ...wet(8.0, 12.0, {}).map((x) => ({ ...x, v: 48 })),
      ...wet(12.0, 12.1, {}).map((x) => ({ ...x, v: 59.7 })),
      ...wet(12.1, 12.2, { ...arrPair(50, 50, 12.1, 59.7) }).map((x) => ({ ...x, v: 54 })),
      ...wet(12.2, 26.2, { maxSpeedKmh: 70, ...stampPair(50, 50, 12.1) }).map((x) => ({ ...x, v: 62 })),
      { from: 26.2, to: 40, v: 30 },
    ],
    { maxSpeedKmh: 50 },
  );
}

/**
 * THE OTHER TASK BILL THAT TAKES A WAITING ACT'S ONE BILL — a NEW MARK (round 7: «a second blow — or any other task first
 * bill — inside the same act takes the act's one bill»). A sign-bound «≤60» blown at 67.6 on a posted 60, the car on in
 * the sign's grace band (62: the arrival waits), and at 6.0 a graded «≤45» mark blown at 62 — its bill takes the waiting
 * act's one bill. ONE weather or bend first bill lands `off` seconds from that blow frame: before it (the kin bill takes
 * the waiting arrival, and the new mark's is absorbed in its act), on it, or after it.
 */
export function newMarkWhileWaiting(kind: "BEND" | "RAIN", off: number): SimTick[] {
  const tm = 6.0;
  const tb = Math.round((tm + off) * 10) / 10;
  const [from, to] = kind === "BEND" ? [tb - 1.5, tb + 2.5] : [tb - 3, tb + 2.5];
  const out: SimTick[] = [];
  for (let i = 0; i < 300; i++) {
    const t = i / 10;
    const o: Record<string, unknown> = {};
    let v = 57;
    if (t >= 0.9 - 1e-9 && t < 1.0 - 1e-9) v = 67.6;
    else if (t >= 1.0 - 1e-9 && t < tm - 1e-9) v = 62;
    else if (t >= tm - 1e-9 && t < 9.0 - 1e-9) v = 56;
    else if (t >= 9.0 - 1e-9) v = 40;
    if (Math.abs(t - 1.0) < 1e-9) Object.assign(o, arrPair(60, 60, 1.0, 67.6));
    if (Math.abs(t - tm) < 1e-9) Object.assign(o, arrPair(45, 45, tm, 62));
    if (t >= tm - 1e-9 && t < 20 - 1e-9) Object.assign(o, stampPair(45, 45, tm));
    if (t >= from - 1e-9 && t < to - 1e-9) {
      if (kind === "BEND") o.curveAdvisoryKmh = 45;
      else o.rain = true;
    }
    out.push(tick(t, { maxSpeedKmh: 60, speedKmh: v, ...o } as Partial<SimTick>));
  }
  return out;
}

// ---------------------------------------------------------------------------
// ONE BILL OF THE LAW PER ACT (round 13, the fourth cut)
// ---------------------------------------------------------------------------

/** The stretch driven under a sign of 62: the car at 66 stays OVER the sign, in its grace band — the M-16 act runs on. */
export const HELD_OPEN = 62;
/**
 * THE WEATHER AND THE BEND IN ONE ACT, each first bill placed on its own: the rain's at `ORDER_STAMP_AT + wOff`, the
 * bend's at `ORDER_STAMP_AT + bOff` (the verifier's order shape, the act held open through a 10 s stretch).
 */
export function twoKin(wOff: number, bOff: number, extra: Partial<OrderShape> = {}): SimTick[] {
  const tw = ORDER_STAMP_AT + wOff;
  const tb = ORDER_STAMP_AT + bOff;
  return orderShape({ graded: false, stampAt: ORDER_STAMP_AT, len: 10, raised: HELD_OPEN, rain: [tw - 3.0, tw + 1.5], bend: [tb - 1.5, tb + 1.5], ...extra });
}
/** Every order of the three: the rain's bill, the bend's and the stamp (S at 4.0). */
export const TWO_KIN_PLACEMENTS: ReadonlyArray<{ tag: string; wOff: number; bOff: number; first: "W" | "B" | "S" }> = [
  { tag: "W < B < S", wOff: -1.0, bOff: -0.6, first: "W" },
  { tag: "B < W < S", wOff: -0.6, bOff: -1.0, first: "B" },
  { tag: "W < S < B", wOff: -0.3, bOff: 0.3, first: "W" },
  { tag: "B < S < W", wOff: 0.3, bOff: -0.3, first: "B" },
  { tag: "S < W < B", wOff: 0.4, bOff: 0.9, first: "S" },
  { tag: "S < B < W", wOff: 0.9, bOff: 0.4, first: "S" },
  { tag: "W = B < S (one frame)", wOff: -0.5, bOff: -0.5, first: "W" },
  { tag: "S < W = B (one frame)", wOff: 0.5, bOff: 0.5, first: "S" },
];
/**
 * A SECOND ACT OF THE LEDGER INSIDE THE SAME M-16 ACT (round 11's C1 shape): the rain's first bill at 3.0 takes the
 * waiting arrival, the rain stops at 3.5 (its act ends; the car still over the sign), and a second rain window bills
 * at 9.0 — with the bend's first bill `bOff` seconds from it (before it or after it).
 */
export function secondWeatherAct(bOff: number | null, stretchKmh?: number): SimTick[] {
  const tb = 9.0 + (bOff ?? 0);
  return orderShape({
    graded: false,
    stampAt: ORDER_STAMP_AT,
    len: 10,
    raised: HELD_OPEN,
    rain: [0, 3.5],
    rain2: [6.0, 10.0],
    ...(stretchKmh !== undefined ? { stretchKmh } : {}),
    ...(bOff !== null ? { bend: [tb - 1.5, tb + 1.0] as [number, number] } : {}),
  });
}
/**
 * A NEW BREACH AFTER THE OWNER'S LAPSE, inside a sign-bound act that has its card (round 3's C3 shape). SPEEDING_OVER_LIMIT
 * takes the sign-bound «≤60» arrival (68 held on the posted 60); at 6.0 a graded «≤45» mark is blown and SHOWN (two laws,
 * two bills) — the act's one card of чл. 20, ал. 2 — and the car is over its line for 0.5 s, then in its grace band (48:
 * the task owner LAPSES, its episode still open); fog from 6.6 (lamps on) — a weather breach that began after the lapse,
 * its first bill at 9.6, inside the M-16 act (the correction is not held until 10.0).
 */
export function lapseThenWeather(): SimTick[] {
  const out: SimTick[] = [];
  for (let i = 0; i < 250; i++) {
    const t = i / 10;
    const o: Record<string, unknown> = {};
    let v = 57;
    if (t >= 0.9 - 1e-9 && t < 1.0 - 1e-9) v = 67.6;
    else if (t >= 1.0 - 1e-9 && t < 6.0 - 1e-9) v = 68;
    else if (t >= 6.0 - 1e-9 && t < 6.5 - 1e-9) v = 56;
    else if (t >= 6.5 - 1e-9 && t < 12 - 1e-9) v = 48;
    else if (t >= 12 - 1e-9) v = 30;
    if (Math.abs(t - 1.0) < 1e-9) Object.assign(o, arrPair(60, 60, 1.0, 67.6));
    if (Math.abs(t - 6.0) < 1e-9) Object.assign(o, arrPair(45, 45, 6.0, 68));
    if (t >= 6.0 - 1e-9 && t < 20 - 1e-9) Object.assign(o, stampPair(45, 45, 6.0));
    if (t >= 6.6 - 1e-9 && t < 11 - 1e-9) {
      o.fog = true;
      o.fogLightsOn = true;
    }
    out.push(tick(t, { maxSpeedKmh: 60, speedKmh: v, ...o } as Partial<SimTick>));
  }
  return out;
}
/**
 * TWO ACTS OF THE LEDGER, EACH HELD PAST A RE-GRADE, INSIDE ONE SIGN-BOUND ACT: the car in the grace band of the posted
 * 60 for 30 s after the blow (no stamp: the sign never rises), a rain window held 10 s (its first bill takes the waiting
 * arrival, its re-grade is the act's one charge), a 2 s gap, and a second rain window held 10 s more. `cutAt` ends the
 * drive there (inside the second window, past its first bill).
 */
export function longTwice(cutAt?: number): SimTick[] {
  const out: SimTick[] = [];
  const end = cutAt ?? 45;
  for (let i = 0; i < Math.round(end * 10); i++) {
    const t = i / 10;
    const o: Record<string, unknown> = {};
    let v = 57;
    if (t >= 0.9 - 1e-9 && t < 1.0 - 1e-9) v = 67.6;
    else if (t >= 1.0 - 1e-9 && t < 31 - 1e-9) v = 64;
    else if (t >= 31 - 1e-9) v = 45;
    if (Math.abs(t - 1.0) < 1e-9) Object.assign(o, arrPair(60, 60, 1.0, 67.6));
    if ((t >= 2 - 1e-9 && t < 12 - 1e-9) || (t >= 14 - 1e-9 && t < 24 - 1e-9)) {
      o.rain = true;
      o.headlights = "low";
    }
    out.push(tick(t, { maxSpeedKmh: 60, speedKmh: v, ...o } as Partial<SimTick>));
  }
  return out;
}

/**
 * A KEPT ACT RESTORED INSIDE AN ACT THAT HAS REACHED ITS ONE RE-GRADE. A sign-bound «≤60» blown at 67.6, the car in the
 * sign's grace band (64) for 17 s: a short rain window (its first bill at 5.0 takes the waiting arrival; its act ends at
 * 5.5 and is KEPT with the latch, uncharged), then a second rain window held 10 s (its first bill at 10.0 is absorbed and
 * names a new act of the ledger; its re-grade at 16.0 is the sign-bound act's ONE). At 18.0 the sign rises to 62 and the
 * latch stamps the car (66) over its line for 12 s: the kept weather act is restored — inside an act that has already
 * reached its re-grade.
 */
export function keptAfterTheActsRegrade(): SimTick[] {
  const out: SimTick[] = [];
  for (let i = 0; i < 450; i++) {
    const t = i / 10;
    const o: Record<string, unknown> = {};
    let v = 57;
    let sign = 60;
    if (t >= 0.9 - 1e-9 && t < 1.0 - 1e-9) v = 67.6;
    else if (t >= 1.0 - 1e-9 && t < 18 - 1e-9) v = 64;
    else if (t >= 18 - 1e-9 && t < 30 - 1e-9) {
      v = 66;
      sign = 62;
      Object.assign(o, stampPair(60, 60, 1.0));
    } else if (t >= 30 - 1e-9) v = 45;
    if (Math.abs(t - 1.0) < 1e-9) Object.assign(o, arrPair(60, 60, 1.0, 67.6));
    if ((t >= 2 - 1e-9 && t < 5.5 - 1e-9) || (t >= 7 - 1e-9 && t < 17 - 1e-9)) {
      o.rain = true;
      o.headlights = "low";
    }
    out.push(tick(t, { maxSpeedKmh: sign, speedKmh: v, ...o } as Partial<SimTick>));
  }
  return out;
}
/**
 * THE KEPT ACT JOINED AT THE HAND-OVER. A sign-bound «≤60» blown at 67.6; the stamp at 4.0 (the sign 62: the car stays
 * over it) with the car at 64 — over the sign, not over the task's line (65): the stamp's act ends on its own frame and
 * is KEPT with the latch. A rain window opened after it first-bills at 7.1 and takes the act over (it ends at 7.6); from
 * 9.0 the car is at 66, over the task's line — the kept act is restored — in a second rain window opened at 8.5 and held
 * 10 s. The act restored is the WEATHER's (the act the hand-over made), so the weather's re-grade at 17.5 is named
 * after its owner.
 */
export function keptJoinedAtTheHandOver(): SimTick[] {
  const out: SimTick[] = [];
  for (let i = 0; i < 350; i++) {
    const t = i / 10;
    const o: Record<string, unknown> = {};
    let v = 57;
    let sign = 60;
    if (t >= 0.9 - 1e-9 && t < 1.0 - 1e-9) v = 67.6;
    else if (t >= 1.0 - 1e-9 && t < 9 - 1e-9) v = 64;
    else if (t >= 9 - 1e-9 && t < 20 - 1e-9) v = 66;
    else if (t >= 20 - 1e-9) v = 45;
    if (t >= 4 - 1e-9 && t < 20 - 1e-9) {
      sign = 62;
      Object.assign(o, stampPair(60, 60, 1.0));
    }
    if (Math.abs(t - 1.0) < 1e-9) Object.assign(o, arrPair(60, 60, 1.0, 67.6));
    if ((t >= 4.1 - 1e-9 && t < 7.6 - 1e-9) || (t >= 8.5 - 1e-9 && t < 18.5 - 1e-9)) {
      o.rain = true;
      o.headlights = "low";
    }
    out.push(tick(t, { maxSpeedKmh: sign, speedKmh: v, ...o } as Partial<SimTick>));
  }
  return out;
}

/**
 * A SIGN-BOUND MARK BLOWN IN REVERSE (the round-12 verifier's N4, on a shape the product can make: the reverse exit of
 * `sc-park-bay-exit-rev` L3/L5 — gate 20, glass 20, posted 20). The lesson's evaluator judges the mark on |speed|, so
 * a car backing at 26.5 through a «≤20» mark blows it; the reducer's M-16 correction reads the SIGNED speed, so the car
 * has been at or under the sign all along and the correction is already HELD on the blow frame. Forward at 10 until
 * `from`, backing at 26.5 for 3 s through the mark (blown at `from` + 2, the arrival speed 26.5), then forward at 10.
 */
export function blownInReverse(gate: number, glass: number, sign: number, from = 4.0): SimTick[] {
  const out: SimTick[] = [];
  const blowT = from + 2;
  for (let i = 0; i < 160; i++) {
    const t = i / 10;
    const o: Record<string, unknown> = { edgeId: "e1", position: { x: 5, y: 5 } };
    let v = 10;
    if (t >= from - 1e-9 && t < from + 3 - 1e-9) {
      v = -26.5;
      o.gear = -1;
    }
    if (Math.abs(t - blowT) < 1e-9) Object.assign(o, arrPair(gate, glass, blowT, 26.5));
    out.push(tick(t, { maxSpeedKmh: sign, speedKmh: v, ...o } as Partial<SimTick>));
  }
  return out;
}
