/**
 * THE FAR CLOSING WITH NO AVERAGING LAG — ROUND 5 OF `sc-follow-tailgater:63c0c28c`
 * C2a / `:f42dce4f` (rules/engine.ts `leadClosingNowMps`, the cause ledger above
 * `causelessBraking`).
 *
 * Round 4 made a lead BEYOND harshBrakeSignalCauseM (120 m) a cause when it closed
 * at harshBrakeClosingLeadMps (3 m/s, base's line) or more — but measured that
 * closing as a 0.5 s MEAN, which runs W/2 = 0.25 s behind a closing that is still
 * rising. The round-4 verifier (F1) billed stops base acquitted:
 *  Q1  the student speeds up 1–3 m/s² toward a STEADY lead 125–200 m ahead, then
 *      stamps 9.4 m/s² from 58 км/ч; the real closing at the pedal is 3.1–4 m/s,
 *      the window read 2.35–3.75 — round 4 billed 42/42 cells where base, reading
 *      the closing frame by frame, acquitted every 30–120 Hz cell;
 *  Q2  the student holds 58 км/ч; a lead 125–200 m ahead slows 1–1.9 m/s² (under
 *      the braking line) from 0.5–2 s before the pedal, the real closing at the
 *      pedal 3.1–3.5 m/s.
 * INTEGRATOR RULING (round 5, N2): beyond the reach the closing that stamps the
 * far closing memory is measured WITHOUT an averaging lag of its own — the
 * student's exact speed on the tick minus the lead's CURRENT speed. Same 3 m/s
 * line, same 1.0 s memory. Beyond 120 m nothing base acquits may convict.
 *
 * THE ORACLE. Base acquitted a stop when, on a frame of the pedal application, the
 * gap had shrunk at 3 m/s or more since the previous frame. On an exact trace
 * that reading is the TRUE mean closing over the frame, so each cell below is
 * judged against the act's own kinematics, never against a frozen expectation:
 *  - ACQUITTED wherever the real closing reached the line by a margin — at the
 *    student's last frame before the pedal, at his first frame after it, or as
 *    the mean over the frame the pedal fell in (exactly what base read);
 *  - CONVICTED wherever, on every frame from 1.5 s before the pedal (the 1.0 s
 *    memory plus the longest frame) to 1.0 s after it, both the real closing and
 *    the frame's mean closing stayed under the line by a margin
 *    (nothing else is a cause in these acts: the lead is read, steady or slowing
 *    under the braking line, and long in the corridor).
 * Cells between the two margins are not asserted. The acts are the verifier's
 * own (q-acts.json), on the same 7 rates × 4 phases + 2 jittered phone schedules.
 */

import { describe, expect, it } from "vitest";
import { LEAD_CAUSE_MEMORY_SEC, createRuleEngine, leadClosingNowMps, reduceTick } from "../engine";
import { DEFAULT_RULE_CONFIG } from "../types";
import { tick } from "./fixtures";

const RATES = [2.5, 2.8, 4, 10, 30, 60, 120] as const;
const MODES = ["ph0", "ph0.25", "ph0.5", "ph0.75", "jit1", "jit2"] as const;
const LINE = DEFAULT_RULE_CONFIG.harshBrakeClosingLeadMps;
const REACH = DEFAULT_RULE_CONFIG.harshBrakeSignalCauseM;
/** How far over (under) the line the real closing must be for a cell to be asserted acquitted (convicted), m/s. */
const MARGIN = 0.05;

function mulberry(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The round-2 verifier's frame schedules, verbatim: uniform at a phase, or jittered like a phone. */
function frames(hz: number, mode: string, dur: number): number[] {
  const out: number[] = [];
  if (mode.startsWith("ph")) {
    const ph = Number(mode.slice(2));
    for (let k = 1; (k + ph) / hz <= dur; k++) out.push((k + ph) / hz);
  } else {
    const rnd = mulberry(Number(mode.slice(3)) * 131 + Math.round(hz * 10));
    let t = 0;
    for (;;) {
      t += Math.min(0.5, (0.55 + 0.9 * rnd()) / hz);
      if (t > dur) break;
      out.push(t);
    }
  }
  return out;
}

/** A drive with an analytic student (speed, km/h) and lead (position and speed along the road, m and m/s). */
interface Act {
  onset: number;
  durationSec: number;
  speedKmh: (tau: number) => number;
  leadX: (tau: number) => number;
  leadV: (tau: number) => number;
  /** false = nobody in the lead channel at τ */
  present?: (tau: number) => boolean;
  /** per-frame gap jitter, m (0 = exact) */
  noiseM?: number;
  seed?: number;
}

interface Drive {
  billed: boolean;
  billedAt: number | null;
  ft: number[];
  gaps: number[];
  travel: number[];
}

function drive(act: Act, ft: readonly number[]): Drive {
  let state = createRuleEngine();
  let travel = 0;
  let tf = 0;
  let billedAt: number | null = null;
  const gaps: number[] = [];
  const trav: number[] = [];
  const rnd = mulberry(act.seed ?? 7);
  for (const t of ft) {
    while (tf < t - 1e-12) {
      const h = Math.min(0.0005, t - tf);
      travel += ((act.speedKmh(tf) + act.speedKmh(tf + h)) / 2 / 3.6) * h;
      tf += h;
    }
    const g = act.present?.(t) === false ? null : act.leadX(t) - travel + (act.noiseM ? (2 * rnd() - 1) * act.noiseM : 0);
    gaps.push(g ?? NaN);
    trav.push(travel);
    const r = reduceTick(
      state,
      tick(t, { speedKmh: Math.max(0, act.speedKmh(t)), position: { x: 0, y: travel }, gear: 3, ...(g !== null ? { leadGapM: g } : {}), events: [] }),
    );
    state = r.state;
    for (const e of r.events) if (e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE" && billedAt === null) billedAt = t;
  }
  return { billed: billedAt !== null, billedAt, ft: [...ft], gaps, travel: trav };
}

/** The real closing at τ, m/s. */
const realClosing = (act: Act, tau: number): number => Math.max(0, act.speedKmh(tau)) / 3.6 - act.leadV(tau);

/** What the act's own kinematics say this cell must be: true = billed, false = acquitted, null = not asserted. */
function oracle(act: Act, d: Drive): boolean | null {
  const ft = d.ft;
  const k = ft.findIndex((t) => t > act.onset);
  if (k < 1) return null;
  const frameMean = (j: number) => (d.gaps[j - 1] - d.gaps[j]) / (ft[j] - ft[j - 1]);
  const atPedal = Math.max(realClosing(act, ft[k - 1]), realClosing(act, ft[k]), frameMean(k));
  if (atPedal >= LINE + MARGIN) return false;
  // every frame whose reading could still be remembered when the bill falls: from a
  // memory span (and the longest frame) before the pedal to a second after it
  let worst = -Infinity;
  for (let j = 1; j < ft.length; j++) {
    if (ft[j] < act.onset - LEAD_CAUSE_MEMORY_SEC - 0.5 || ft[j] > act.onset + 1.0) continue;
    worst = Math.max(worst, realClosing(act, ft[j]), frameMean(j));
  }
  return worst <= LINE - MARGIN ? true : null;
}

/**
 * The cells (rate/mode) whose verdict contradicts the oracle, and how many cells were
 * asserted. `acquittalsOnly`: assert only the cells the oracle says must be acquitted
 * (the F1 direction) — for acts where a reading this round did not touch can acquit
 * on its own (round 4's quick deceleration reading, whose odometer step at the pedal
 * reads a lead slowing 1.5–1.9 m/s² over the 2 m/s² line at 2.5–4 Hz: A12, kept).
 * `minHz`: skip rates below it.
 */
function contradictions(mk: () => Act, opts: { acquittalsOnly?: boolean; minHz?: number } = {}): { bad: string[]; asserted: number } {
  const bad: string[] = [];
  let asserted = 0;
  for (const hz of RATES) {
    if (opts.minHz !== undefined && hz < opts.minHz) continue;
    for (const m of MODES) {
      const act = mk();
      const d = drive(act, frames(hz, m, act.durationSec));
      const want = oracle(act, d);
      if (want === null || (opts.acquittalsOnly && want)) continue;
      asserted++;
      if (d.billed !== want) bad.push(`${hz}Hz/${m}:${d.billed ? "billed" : "acquitted"}`);
    }
  }
  return { bad, asserted };
}

/** Q1 (verifier): the student speeds up at aAcc toward a STEADY lead, then stamps 9.4 m/s² from 58 км/ч at τ = 5 s. */
function q1(aAcc: number, cStar: number, gOn: number): Act {
  const onset = 5;
  const vOn = 58 / 3.6;
  const v0 = vOn - aAcc * onset;
  const vL = vOn - cStar;
  const xOn = v0 * onset + 0.5 * aAcc * onset * onset;
  const X0 = xOn + gOn - vL * onset;
  return {
    onset,
    durationSec: onset + 3,
    speedKmh: (tau) => (tau < onset ? (v0 + aAcc * tau) * 3.6 : Math.max(0, 58 - 9.4 * 3.6 * (tau - onset))),
    leadX: (tau) => X0 + vL * tau,
    leadV: () => vL,
  };
}

/** Q2 (verifier): the student holds 58 км/ч; the lead slows at ld from `react` s before the pedal (τ = 5 s). */
function q2(ld: number, react: number, cStar: number, gOn: number): Act {
  const onset = 5;
  const vS = 58 / 3.6;
  const vL0 = vS - cStar + ld * react;
  const tb = onset - react;
  const lpos = (tau: number) => (tau <= tb ? vL0 * tau : vL0 * tb + vL0 * (tau - tb) - 0.5 * ld * (tau - tb) ** 2);
  const X0 = vS * onset + gOn - lpos(onset);
  return {
    onset,
    durationSec: onset + 3,
    speedKmh: (tau) => (tau < onset ? 58 : Math.max(0, 58 - 9.4 * 3.6 * (tau - onset))),
    leadX: (tau) => X0 + lpos(tau),
    leadV: (tau) => (tau <= tb ? vL0 : vL0 - ld * (tau - tb)),
  };
}

describe("the acts are beyond the reach", () => {
  it("every Q1/Q2 lead is more than harshBrakeSignalCauseM ahead at the pedal", () => {
    expect(REACH).toBe(120);
    const gapAtPedal = (act: Act) => {
      let x = 0;
      for (let tau = 0; tau < act.onset - 1e-9; tau += 0.0005) x += ((act.speedKmh(tau) + act.speedKmh(tau + 0.0005)) / 2 / 3.6) * 0.0005;
      return act.leadX(act.onset) - x;
    };
    for (const act of [q1(1, 3.1, 125), q1(3, 4.0, 125), q2(1.9, 2.0, 3.5, 125), q2(1.0, 0.3, 3.2, 150)]) {
      expect(gapAtPedal(act)).toBeGreaterThan(REACH);
    }
  });
});

describe("ROUND-4 VERIFIER Q1, PORTED — a student speeding up toward a steady far lead", () => {
  for (const aAcc of [1, 2, 3]) {
    it(`speeding up at ${aAcc} m/s², real closing at the pedal 3.1 / 3.3 / 3.5 / 4.0 m/s, lead 125 / 150 / 200 m ahead: every cell graded as its own closing says`, () => {
      const bad: string[] = [];
      let asserted = 0;
      let acquittalsAsserted = 0;
      for (const cStar of [3.1, 3.3, 3.5, 4.0]) {
        for (const gOn of [125, 150, 200]) {
          const r = contradictions(() => q1(aAcc, cStar, gOn));
          asserted += r.asserted;
          if (cStar >= 3.3) acquittalsAsserted += r.asserted;
          for (const b of r.bad) bad.push(`c*${cStar} gOn${gOn} ${b}`);
        }
      }
      expect(bad).toEqual([]);
      // the oracle must actually assert: at 3.3 m/s and over, the 10–120 Hz cells at least
      expect(acquittalsAsserted).toBeGreaterThanOrEqual(2 * 3 * 4 * 6);
      expect(asserted).toBeGreaterThan(0);
    });
  }
  it("the verifier's own trace: speeding up at 2 m/s², 3.3 m/s at the pedal, lead 150 m ahead — acquitted at 10, 30, 60 and 120 Hz in every phase and schedule (round 4: billed in all of them)", () => {
    const billed: string[] = [];
    for (const hz of [10, 30, 60, 120]) {
      for (const m of MODES) {
        const act = q1(2, 3.3, 150);
        if (drive(act, frames(hz, m, act.durationSec)).billed) billed.push(`${hz}Hz/${m}`);
      }
    }
    expect(billed).toEqual([]);
  });
});

describe("ROUND-4 VERIFIER Q2, PORTED — a far lead slowing under the braking line", () => {
  for (const ld of [1.0, 1.5, 1.9]) {
    it(`a lead slowing ${ld} m/s² from 0.5 / 1 / 2 s before the pedal, real closing at the pedal 3.1 / 3.3 / 3.5 m/s, 125 / 150 / 200 m ahead: acquitted in every cell its own closing says must be`, () => {
      // The current speed is exact once the lead's deceleration has held over the
      // three samples it is read from — at 2.5–2.8 Hz those span 0.7–1.0 s, so a lead
      // that began slowing 0.5 s before is asserted from 4 Hz up (the three 2.5 Hz
      // cells it then bills, base bills too).
      const bad: string[] = [];
      let acquittalsAsserted = 0;
      for (const react of [0.5, 1.0, 2.0]) {
        for (const cStar of [3.1, 3.3, 3.5]) {
          for (const gOn of [125, 150, 200]) {
            const r = contradictions(() => q2(ld, react, cStar, gOn), { acquittalsOnly: true, minHz: react < 1 ? 4 : undefined });
            if (cStar >= 3.3) acquittalsAsserted += r.asserted;
            for (const b of r.bad) bad.push(`react${react} c*${cStar} gOn${gOn} ${b}`);
          }
        }
      }
      expect(bad).toEqual([]);
      expect(acquittalsAsserted).toBeGreaterThanOrEqual(3 * 2 * 3 * 4 * 6 - 3 * 4 * 6);
    });
  }
  it("the verifier's own case: a lead slowing 1.5 m/s² from 0.5 s before the pedal, 3.3 m/s at the pedal, 150 m ahead — acquitted at 10, 30, 60 and 120 Hz in every phase and schedule (round 4: billed in all of them)", () => {
    const billed: string[] = [];
    for (const hz of [10, 30, 60, 120]) {
      for (const m of MODES) {
        const act = q2(1.5, 0.5, 3.3, 150);
        if (drive(act, frames(hz, m, act.durationSec)).billed) billed.push(`${hz}Hz/${m}`);
      }
    }
    expect(billed).toEqual([]);
  });
  it("a lead that began slowing only 0.3 / 0.4 s before the pedal (1.5–1.9 m/s², 3.2–3.3 m/s at the pedal), 10–120 Hz: still read at its current speed — acquitted wherever its own closing says", () => {
    // the three samples span one window (LEAD_SPEED_NOW_SPAN_SEC); read over a longer span these leads lag and are billed
    const bad: string[] = [];
    let asserted = 0;
    for (const ld of [1.5, 1.9]) {
      for (const react of [0.3, 0.4]) {
        for (const cStar of [3.2, 3.3]) {
          const r = contradictions(() => q2(ld, react, cStar, 150), { acquittalsOnly: true, minHz: 10 });
          asserted += r.asserted;
          for (const b of r.bad) bad.push(`ld${ld} react${react} c*${cStar} ${b}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(asserted).toBeGreaterThanOrEqual(2 * 2 * 2 * 4 * 6);
  });
});

describe("THE PEDAL BETWEEN TWO FRAMES — the closing peaks inside the frame", () => {
  // A closing that rises until the pedal and falls after it peaks between two frames:
  // both endpoint readings can sit under the line while the frame's MEAN — what base
  // read — is over it. Measured: speeding up 3–4 m/s² toward a steady lead at 3.2–3.5
  // m/s, a 4–10 Hz frame whose pedal falls 0.1–0.2 s after the previous frame.
  it("speeding up 3 / 4 m/s² toward a steady lead 150 m ahead, 3.2 / 3.3 / 3.5 m/s at the pedal, 4 and 10 Hz at 16 phases: every cell graded as its own closing says", () => {
    const bad: string[] = [];
    let frameMeanOnly = 0;
    for (const aAcc of [3, 4]) {
      for (const cStar of [3.2, 3.3, 3.5]) {
        for (const hz of [4, 10]) {
          for (let p = 0; p < 16; p++) {
            const act = q1(aAcc, cStar, 150);
            const ft: number[] = [];
            for (let k = 1; (k + p / 16) / hz <= act.durationSec; k++) ft.push((k + p / 16) / hz);
            const d = drive(act, ft);
            const want = oracle(act, d);
            const k = ft.findIndex((t) => t > act.onset);
            const ends = Math.max(realClosing(act, ft[k - 1]), realClosing(act, ft[k]));
            const mean = (d.gaps[k - 1] - d.gaps[k]) / (ft[k] - ft[k - 1]);
            if (ends < LINE && mean >= LINE + MARGIN) frameMeanOnly++;
            if (want !== null && d.billed !== want) bad.push(`a${aAcc} c*${cStar} ${hz}Hz/p${p}:${d.billed ? "billed" : "acquitted"}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
    // the act really contains frames that only the frame's mean can acquit
    expect(frameMeanOnly).toBeGreaterThan(0);
  });
});

describe("the line still convicts beyond the reach", () => {
  it("a steady far lead closing 2.0 m/s with ±1 cm of per-frame gap jitter, 150 / 200 m ahead: convicted at every rate (the current-speed reading is not made of single-frame differences)", () => {
    const bad: string[] = [];
    for (const gOn of [150, 200]) {
      for (const hz of RATES) {
        for (const m of MODES) {
          const onset = 5;
          const vS = 58 / 3.6;
          const vL = vS - 2.0;
          const X0 = vS * onset + gOn - vL * onset;
          const act: Act = {
            onset,
            durationSec: onset + 3,
            speedKmh: (tau) => (tau < onset ? 58 : Math.max(0, 58 - 9.4 * 3.6 * (tau - onset))),
            leadX: (tau) => X0 + vL * tau,
            leadV: () => vL,
            noiseM: 0.01,
            seed: Math.round(gOn * 10 + hz * 100) + m.length,
          };
          if (!drive(act, frames(hz, m, act.durationSec)).billed) bad.push(`gOn${gOn} ${hz}Hz/${m}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
  it("a student speeding up 2 m/s² toward a steady far lead with only 2.5 m/s at the pedal: convicted at every rate", () => {
    const bad: string[] = [];
    for (const hz of RATES) {
      for (const m of MODES) {
        const act = q1(2, 2.5, 150);
        if (!drive(act, frames(hz, m, act.durationSec)).billed) bad.push(`${hz}Hz/${m}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("the student's travel is read from his positions", () => {
  // The lead's position is the student's travel plus the gap. His travel is read from
  // his positions (`leadPosOdoM`) — the trapezoid of his speeds misses the peak at the
  // pedal and reads a steady lead as slowing (see Q1, which convicts at 2.5–4 Hz only
  // on positions) — but only where a frame's displacement can be his own motion.
  it("a feed whose car never moves on the map (a fixture at the origin): the steady far lead closing 2.0 m/s is still convicted at every rate", () => {
    const bad: string[] = [];
    for (const hz of RATES) {
      for (const m of MODES) {
        const onset = 5;
        const vS = 58 / 3.6;
        const vL = vS - 2.0;
        const sp = (tau: number) => (tau < onset ? 58 : Math.max(0, 58 - 9.4 * 3.6 * (tau - onset)));
        let state = createRuleEngine();
        let travel = 0;
        let tf = 0;
        let billed = false;
        for (const t of frames(hz, m, onset + 3)) {
          while (tf < t - 1e-12) {
            const h = Math.min(0.0005, t - tf);
            travel += ((sp(tf) + sp(tf + h)) / 2 / 3.6) * h;
            tf += h;
          }
          const g = 150 + vS * onset - vL * onset + vL * t - travel;
          const r = reduceTick(state, tick(t, { speedKmh: sp(t), gear: 3, leadGapM: g, events: [] }));
          state = r.state;
          for (const e of r.events) if (e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE") billed = true;
        }
        if (!billed) bad.push(`${hz}Hz/${m}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("the closing now, on the exported reading (exact traces)", () => {
  // A lead braking 3 m/s² from 30 m/s, the student's travel exact; samples on a jittered
  // 10 Hz schedule. The quadratic through three real samples is exact for a constant
  // deceleration, so both terms are the act's own kinematics to rounding.
  const leadX = (tau: number) => 200 + 30 * tau - 1.5 * tau * tau;
  const leadV = (tau: number) => 30 - 3 * tau;
  const times: number[] = [];
  for (let k = 0, t = 0; t <= 2.0 + 1e-9; k++) {
    times.push(t);
    t = +(t + 0.1 + (k % 3 === 0 ? 0.013 : k % 3 === 1 ? -0.011 : 0)).toFixed(6);
  }
  const sAt = (tau: number) => 20 * tau;
  const track = times.map((tau) => ({ t: tau, odoM: sAt(tau), gapM: leadX(tau) - sAt(tau), sM: sAt(tau) }));
  const now = times[times.length - 1];
  const dt = now - times[times.length - 2];
  it("the tick's term is the student's speed on the tick minus the lead's speed at that instant", () => {
    const c = leadClosingNowMps(track, now, sAt(now), leadX(now) - sAt(now), 30, 0, dt)!;
    expect(c).toBeCloseTo(30 - leadV(now), 9);
  });
  it("the frame's term is the student's mean speed over the frame minus the lead's mean speed over it — the per-frame closing base read", () => {
    const studentMean = 31;
    const leadMeanOverFrame = (leadX(now) - leadX(now - dt)) / dt;
    const c = leadClosingNowMps(track, now, sAt(now), leadX(now) - sAt(now), 20, studentMean, dt)!;
    expect(c).toBeCloseTo(studentMean - leadMeanOverFrame, 9);
  });
});

describe("the closing on the frame before the pedal", () => {
  // The student speeds up toward a steady far lead and stamps a few milliseconds after
  // a frame: on that frame the real closing is over the line, the frame's mean (it
  // spans the acceleration) is not, and the next frame is all braking. Only the
  // student's speed ON THE TICK says so.
  it("speeding up 3 m/s², 3.2 / 3.3 m/s at the pedal, a frame 5 ms before it, 2.5 / 2.8 / 4 Hz: acquitted", () => {
    const billed: string[] = [];
    for (const cStar of [3.2, 3.3]) {
      for (const hz of [2.5, 2.8, 4]) {
        const act = q1(3, cStar, 150);
        const off = (act.onset - 0.005) * hz - Math.floor((act.onset - 0.005) * hz);
        const ft: number[] = [];
        for (let k = 1; (k + off) / hz <= act.durationSec; k++) ft.push((k + off) / hz);
        const d = drive(act, ft);
        expect(oracle(act, d)).toBe(false);
        if (d.billed) billed.push(`c*${cStar} ${hz}Hz`);
      }
    }
    expect(billed).toEqual([]);
  });
});

describe("the closing on the LAST frame a far lead is seen", () => {
  // The student speeds up 2 m/s² toward a steady far lead, which leaves the channel
  // (turns off) a few milliseconds after a frame; he stamps 0.3 s later. The closing
  // memory can only be stamped while the lead is read, so the frame before it left is
  // the last word — and on it only his speed ON THE TICK (not the previous tick's,
  // not the frame's mean, which spans the acceleration) is over the line.
  const act = (cAtLast: number, hz: number): { a: Act; ft: number[] } => {
    const tOff = 5;
    const onset = tOff + 0.3;
    const base = q1(2, cAtLast, 150);
    const vOff = 58 / 3.6;
    const a: Act = {
      ...base,
      onset,
      durationSec: onset + 3,
      speedKmh: (tau) =>
        tau < tOff ? base.speedKmh(Math.min(tau, tOff - 1e-9)) : tau < onset ? vOff * 3.6 : Math.max(0, 58 - 9.4 * 3.6 * (tau - onset)),
      present: (tau) => tau < tOff,
    };
    const off = (tOff - 0.005) * hz - Math.floor((tOff - 0.005) * hz);
    const ft: number[] = [];
    for (let k = 1; (k + off) / hz <= a.durationSec; k++) ft.push((k + off) / hz);
    return { a, ft };
  };
  it("3.3 m/s on that frame, 2.5 / 2.8 / 4 Hz: acquitted; 2.8 m/s (every frame under the line): convicted", () => {
    const wrong: string[] = [];
    for (const hz of [2.5, 2.8, 4]) {
      const hi = act(3.3, hz);
      if (drive(hi.a, hi.ft).billed) wrong.push(`3.3 ${hz}Hz billed`);
      const lo = act(2.8, hz);
      if (!drive(lo.a, lo.ft).billed) wrong.push(`2.8 ${hz}Hz acquitted`);
    }
    expect(wrong).toEqual([]);
  });
});

describe("a reading the ledger calls UNREAD stamps no closing memory", () => {
  // A farther car replaces a far lead (a restart, not an entry, so no entry memory) and
  // pulls away: closing 5 m/s at the restart, falling 3 m/s². Its track is unread for
  // 2 W — a cause in itself while it lasts — and when it is read the closing is under
  // the line; the student stamps 1.05 s after the restart. Had the young track stamped
  // the closing memory (3.5 m/s at 0.5 s), it would acquit a stop no reading supports.
  it("10–120 Hz: convicted", () => {
    const acquitted: string[] = [];
    for (const hz of [10, 30, 60, 120]) {
      for (const m of MODES) {
        const t0 = 4;
        const onset = t0 + 1.05;
        const vS = 58 / 3.6;
        const xB0 = vS * t0 + 170;
        const act: Act = {
          onset,
          durationSec: onset + 3,
          speedKmh: (tau) => (tau < onset ? 58 : Math.max(0, 58 - 9.4 * 3.6 * (tau - onset))),
          leadX: (tau) => (tau < t0 ? 140 + (vS - 1) * tau : xB0 + (vS - 5) * (tau - t0) + 1.5 * (tau - t0) ** 2),
          leadV: (tau) => (tau < t0 ? vS - 1 : vS - 5 + 3 * (tau - t0)),
        };
        if (!drive(act, frames(hz, m, act.durationSec)).billed) acquitted.push(`${hz}Hz/${m}`);
      }
    }
    expect(acquitted).toEqual([]);
  });
});

describe("the memory is the ruling's 1.0 s", () => {
  it("is LEAD_CAUSE_MEMORY_SEC", () => {
    expect(LEAD_CAUSE_MEMORY_SEC).toBe(1.0);
  });
});
