/**
 * THE HARSH-BRAKE CAUSE LEDGER BEYOND 120 m — ROUND 4 OF
 * `sc-follow-tailgater:63c0c28c` C2a / `:f42dce4f` (rules/engine.ts, the cause
 * ledger above `causelessBraking`).
 *
 * The round-3 verifier refuted the ledger ONLY beyond harshBrakeSignalCauseM
 * (120 m):
 *  R2  a lead braking 6 m/s² 125–200 m ahead was billed after ONE dropped frame
 *      at 2.5–2.8 Hz (round 3's own C1 restarts the track, and beyond the reach
 *      a young track was no cause) or under a mild heading weave (the lead is in
 *      the corridor in stretches too short for any reading) — base acquitted;
 *  R1  the far reading lags, so a lead braking 2.5 m/s² beyond 120 m was billed at
 *      a 0.75 s reaction in the 30–120 Hz cells — the coarse cells acquitted.
 *
 * INTEGRATOR RULING (round 4, A12: in doubt, acquit). The row needs a conviction
 * only INSIDE 120 m (the drill's FTG lead sits at 74–95 m), so inside the reach
 * rounds 1–3 stand exactly. BEYOND it a lead in the channel is a CAUSE when ANY of:
 *  - its windowed closing is ≥ harshBrakeClosingLeadMps (3 m/s, base's line, now
 *    measured over the window);
 *  - its quick OR far deceleration reading is at the braking line;
 *  - its readings are not built yet (a young track, after a restart or an entry;
 *    a blink is bridged with the verdict it last had);
 *  - the memories: seen braking or closing at that line within 1.0 s, or it
 *    ENTERED the corridor within 2.0 s.
 * Beyond 120 m nothing convicts that base acquitted.
 *
 * Every act is sampled at 2.5 / 2.8 / 4 / 10 / 30 / 60 / 120 Hz, at four phases
 * and on the round-2 verifier's two jittered phone schedules (its own generator).
 * The R1/R2 blocks are the round-3 verifier's own acts, ported with its numbers.
 */

import { describe, expect, it } from "vitest";
import { LEAD_CAUSE_MEMORY_SEC, LEAD_ENTRY_MEMORY_SEC, createRuleEngine, reduceTick } from "../engine";
import { DEFAULT_RULE_CONFIG } from "../types";
import { tick } from "./fixtures";

const RATES = [2.5, 2.8, 4, 10, 30, 60, 120] as const;
const MODES = ["ph0", "ph0.25", "ph0.5", "ph0.75", "jit1", "jit2"] as const;
const REACH = DEFAULT_RULE_CONFIG.harshBrakeSignalCauseM;

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

interface Act {
  speedKmh: (tau: number) => number;
  /** the lead channel at frame time τ, given the student's exact travel and the frame index (null = nobody) */
  leadGapM: (tau: number, travel: number, frame: number) => number | null;
  durationSec: number;
}

/** One drive of a FRESH act on the given frame times; whether HARSH_BRAKING_NO_CAUSE was billed. */
function drive(act: Act, ft: readonly number[]): boolean {
  let state = createRuleEngine();
  let travel = 0;
  let tf = 0;
  let hit = false;
  ft.forEach((t, k) => {
    while (tf < t - 1e-12) {
      const h = Math.min(0.0005, t - tf);
      travel += ((act.speedKmh(tf) + act.speedKmh(tf + h)) / 2 / 3.6) * h;
      tf += h;
    }
    const g = act.leadGapM(t, travel, k);
    const r = reduceTick(
      state,
      tick(t, { speedKmh: Math.max(0, act.speedKmh(t)), position: { x: 0, y: travel }, gear: 3, ...(g !== null ? { leadGapM: g } : {}), events: [] }),
    );
    state = r.state;
    for (const e of r.events) if (e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE") hit = true;
  });
  return hit;
}

/** The rate/mode cells whose verdict is NOT `want` (empty = unanimous and right). */
function offenders(mk: () => Act, want: boolean): string[] {
  const out: string[] = [];
  for (const hz of RATES) {
    for (const m of MODES) {
      const act = mk();
      if (drive(act, frames(hz, m, act.durationSec)) !== want) out.push(`${hz}Hz/${m}`);
    }
  }
  return out;
}

const stopAt =
  (fromKmh: number, decel: number, onset: number) =>
  (tau: number): number =>
    tau < onset ? fromKmh : Math.max(0, fromKmh - decel * 3.6 * (tau - onset));

/** A lead's position along the road from the student's start: `gap0` ahead at τ = 0, cruising `vKmh`, braking `decel` from `brakeAt` to rest. */
const leadPos =
  (gap0: number, vKmh: number, brakeAt = Infinity, decel = 0) =>
  (tau: number): number => {
    const v = vKmh / 3.6;
    if (tau <= brakeAt) return gap0 + v * tau;
    const tb = Math.min(tau - brakeAt, decel > 0 ? v / decel : Infinity);
    return gap0 + v * brakeAt + v * tb - 0.5 * decel * tb * tb;
  };

/** The verifier's acts start the lead in view at τ = 0 and act at BR = 4 s, so the 2 s entry memory has long expired. */
const BR = 4.0;

describe("ROUND-3 VERIFIER R2, PORTED — ONE DROPPED FRAME beyond 120 m is not an absence", () => {
  // P2: a lead gap0 ahead (both at 50 км/ч) brakes 6 m/s² from BR; the FIRST frame at
  // or after BR + d is null; the student stamps 8.5 m/s² `react` s after the lead's
  // onset. At 2.5–2.8 Hz one null frame leaves 0.71–0.8 s between readings, the track
  // restarts as an entry (C1), and in round 3 a young track beyond the reach was no
  // cause: billed up to 9/42 cells at the product's own 1.0 s reaction. Base: 0.
  for (const gap0 of [125, 150, 200]) {
    it(`a lead ${gap0} m ahead braking 6 m/s², one null frame 0.6 s before to 0.6 s after its onset, stamp 0.75 / 1.0 / 1.5 s later: acquitted at every rate`, () => {
      const bad: string[] = [];
      for (const d of [-0.6, -0.2, 0, 0.2, 0.4, 0.6]) {
        for (const react of [0.75, 1.0, 1.5]) {
          const mk = (): Act => {
            const lp = leadPos(gap0, 50, BR, 6);
            const onset = BR + react;
            let kd: number | null = null;
            return {
              speedKmh: stopAt(50, 8.5, onset),
              leadGapM: (tau, x, k) => {
                if (kd === null && tau >= BR + d) kd = k;
                return kd === k ? null : lp(tau) - x;
              },
              durationSec: onset + 4,
            };
          };
          for (const c of offenders(mk, false)) bad.push(`drop@${d} react${react} ${c}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
  it("the act's premise: the lead is beyond the reach at the 0.75 s and 1.0 s stamps (at 125 m the 1.5 s stamp falls just inside it, where rounds 1–3 decide)", () => {
    for (const gap0 of [125, 150, 200]) {
      const lp = leadPos(gap0, 50, BR, 6);
      // the student keeps 50 км/ч until his stamp; the gap shrinks only by the lead's own braking
      expect(lp(BR + 1.0) - (50 / 3.6) * (BR + 1.0)).toBeGreaterThan(REACH);
    }
    expect(leadPos(125, 50, BR, 6)(BR + 1.5) - (50 / 3.6) * (BR + 1.5)).toBeLessThan(REACH);
    expect(leadPos(150, 50, BR, 6)(BR + 1.5) - (50 / 3.6) * (BR + 1.5)).toBeGreaterThan(REACH);
  });
});

describe("ROUND-3 VERIFIER R2, PORTED — A HEADING WEAVE beyond 120 m is not an absence", () => {
  // P3: the same braking lead behind leadGapFor's own corridor — the channel reads
  // null whenever |(gap + 4.5)·sin θ| > 4 m — while the student's heading weaves ±A°
  // with period T. At 125–200 m the lead is in the corridor in stretches under a
  // second, so no reading ever forms: round 3 billed up to 42/42 (base 0–6).
  for (const A of [0.5, 1.0, 1.5, 2.5]) {
    it(`a ±${A}° weave (period 2 / 4 s) around a lead braking 6 m/s² 125 / 150 / 200 m ahead, stamp 0.75 / 1.0 / 1.5 s later: acquitted at every rate`, () => {
      const bad: string[] = [];
      for (const period of [2, 4]) {
        for (const gap0 of [125, 150, 200]) {
          for (const react of [0.75, 1.0, 1.5]) {
            for (const ph of [0, 0.5, 1.0]) {
              const mk = (): Act => {
                const lp = leadPos(gap0, 50, BR, 6);
                const onset = BR + react;
                return {
                  speedKmh: stopAt(50, 8.5, onset),
                  leadGapM: (tau, x) => {
                    const g = lp(tau) - x;
                    const th = ((A * Math.PI) / 180) * Math.sin((2 * Math.PI * (tau + ph)) / period);
                    return Math.abs((g + 4.5) * Math.sin(th)) > 4.0 ? null : g;
                  },
                  durationSec: onset + 4,
                };
              };
              for (const c of offenders(mk, false)) bad.push(`T${period} gap0=${gap0} react${react} ph${ph} ${c}`);
            }
          }
        }
      }
      expect(bad).toEqual([]);
    });
  }
});

describe("ROUND-3 VERIFIER R1, PORTED — the braking line beyond 120 m holds at a 0.75 s reaction (R2-d at any range)", () => {
  // P1: the student and a lead gap0 ahead both cruise v; the lead brakes ld from BR
  // (long tracked, so not new); the student stamps 8.5 m/s² `react` s later. Round 3
  // asked the QUICK reading beyond the reach only until the far reading existed, and
  // the far reading crosses the line late (1.18 s for 2.5 m/s²): billed 14/42 at
  // 0.75 s, all in the 30–120 Hz cells. Base billed these too (its closing line saw
  // nothing yet) — the ruling is the braking line «at every rate».
  for (const v of [50, 90]) {
    for (const gap0 of [125, 150, 200, 300]) {
      it(`${v} км/ч, a lead ${gap0} m ahead braking 2.2 / 2.5 / 3 m/s², stamp 0.75 / 1.0 / 1.5 / 2.5 s later: acquitted at every rate`, () => {
        const bad: string[] = [];
        for (const ld of [2.2, 2.5, 3]) {
          for (const react of [0.75, 1.0, 1.5, 2.5]) {
            const mk = (): Act => {
              const lp = leadPos(gap0, v, BR, ld);
              const onset = BR + react;
              return { speedKmh: stopAt(v, 8.5, onset), leadGapM: (tau, x) => lp(tau) - x, durationSec: onset + 4 };
            };
            for (const c of offenders(mk, false)) bad.push(`ld${ld} react${react} ${c}`);
          }
        }
        expect(bad).toEqual([]);
      });
    }
  }
});

describe("THE CLOSING LINE beyond 120 m — base's 3 m/s, measured over the window", () => {
  // A STEADY lead (no braking, followed far longer than the 2 s entry memory) whose gap
  // AT THE STAMP is gap0 > 120 m; the student, at 58 км/ч, closes on it at c m/s and
  // stamps 9.4 m/s² at 6 s. Its demand is under the 0.5 line in every cell (largest:
  // c = 8 at 125 m, 0.27), so only the closing line can decide.
  const steady = (gap0: number, c: number) => (): Act => {
    const onset = 6.0;
    const vLead = 58 / 3.6 - c;
    const lp = (tau: number) => gap0 + c * onset + vLead * tau;
    return { speedKmh: stopAt(58, 9.4, onset), leadGapM: (tau, x) => lp(tau) - x, durationSec: onset + 4 };
  };
  for (const gap0 of [125, 150, 200, 300]) {
    it(`a steady lead ${gap0} m ahead closed at 0 / 1.5 / 2.7 m/s — read, not braking, not new, closing under the line: convicted at every rate`, () => {
      const bad: string[] = [];
      for (const c of [0, 1.5, 2.7]) for (const x of offenders(steady(gap0, c), true)) bad.push(`c${c} ${x}`);
      expect(bad).toEqual([]);
    });
    it(`…the same lead closed at 3.3 / 4.6 / 8 m/s — a fast closing on a lead is base's cause: acquitted at every rate`, () => {
      const bad: string[] = [];
      for (const c of [3.3, 4.6, 8]) for (const x of offenders(steady(gap0, c), false)) bad.push(`c${c} ${x}`);
      expect(bad).toEqual([]);
    });
  }
  it("the line is base's own config value, and the act's demand never reaches the demand line", () => {
    expect(DEFAULT_RULE_CONFIG.harshBrakeClosingLeadMps).toBe(3);
    expect((8 * 8) / (2 * (125 - 8))).toBeLessThan(0.5);
  });
  // THE CLOSING THE DRIVER REACTED TO IS THE ONE BEFORE THE PEDAL. On a frame that
  // already contains the stamp the windowed closing has fallen (9.4 m/s² takes 1.5 m/s
  // off a 4.6 m/s closing's window mean within 0.4 s); a phone whose first braking
  // frame lands late would read it under the line. So the far closing is remembered
  // for LEAD_CAUSE_MEMORY_SEC, like round 2's demand. Isolated: the steady lead closed
  // at 4.6 m/s VANISHES from the channel at τv (it turns off), and the student stamps
  // `after` s later — only the memory can speak once the bridge (0.5 s) has ended.
  const vanishes = (after: number) => (): Act => {
    const tv = 6.0;
    const onset = tv + after;
    const lp = (tau: number) => 160 + 4.6 * tv + (58 / 3.6 - 4.6) * tau;
    return { speedKmh: stopAt(58, 9.4, onset), leadGapM: (tau, x) => (tau >= tv ? null : lp(tau) - x), durationSec: onset + 4 };
  };
  it("a far lead closed at 4.6 m/s that left the channel 0.6 s before the stamp: still remembered — acquitted at every rate", () => {
    expect(LEAD_CAUSE_MEMORY_SEC).toBe(1.0);
    expect(offenders(vanishes(0.6), false)).toEqual([]);
  });
  it("…1.6 s before the stamp: the memory has run out and the corridor is empty — convicted at every rate", () => {
    expect(offenders(vanishes(1.6), true)).toEqual([]);
  });
});

describe("A LEAD WHOSE READINGS ARE NOT BUILT, OR THAT JUST ENTERED, IS A CAUSE beyond 120 m too", () => {
  // A steady 45 км/ч car appears from an empty channel 150 m ahead of a student at 50
  // (closing 1.4 m/s — under the closing line, demand ≈ 0.01). Round 2 ruled «a car
  // that appears beyond the reach is no surprise» and convicted; round 4 reverses it
  // beyond the reach (A12): unread for 1.0 s, entered for 2.0 s.
  const appears = (stampAfter: number) => (): Act => {
    const entry = 1.5;
    const lp = (tau: number) => 150 + (50 / 3.6) * entry + (45 / 3.6) * (tau - entry);
    return { speedKmh: stopAt(50, 8.5, entry + stampAfter), leadGapM: (tau, x) => (tau < entry ? null : lp(tau) - x), durationSec: entry + stampAfter + 4 };
  };
  it("stamp 0.4 s after it appeared (its readings not built): acquitted at every rate", () => {
    expect(offenders(appears(0.4), false)).toEqual([]);
  });
  it("stamp 1.5 s after it appeared (read, steady, but entered within 2.0 s): acquitted at every rate", () => {
    expect(LEAD_ENTRY_MEMORY_SEC).toBe(2.0);
    expect(offenders(appears(1.5), false)).toEqual([]);
  });
  it("stamp 3.0 s after it appeared: read, steady, slow closing, not new — convicted at every rate", () => {
    expect(offenders(appears(3.0), true)).toEqual([]);
  });
  // The ENTRY memory outlives the lead's stay in the channel: the weave's own shape,
  // isolated. A steady 45 км/ч car is in view 150 m ahead for 0.4 s (too short for any
  // reading) and then gone; the student stamps `after` s after it appeared.
  const glimpse = (after: number) => (): Act => {
    const entry = 1.5;
    const lp = (tau: number) => 150 + (50 / 3.6) * entry + (45 / 3.6) * (tau - entry);
    return {
      speedKmh: stopAt(50, 8.5, entry + after),
      leadGapM: (tau, x) => (tau >= entry && tau < entry + 0.4 ? lp(tau) - x : null),
      durationSec: entry + after + 4,
    };
  };
  it("a car glimpsed 150 m ahead for 0.4 s, stamp 1.5 s after it appeared (it has been gone 1.1 s): acquitted at every rate", () => {
    expect(offenders(glimpse(1.5), false)).toEqual([]);
  });
  it("…stamp 3.0 s after it appeared: convicted at every rate", () => {
    expect(offenders(glimpse(3.0), true)).toEqual([]);
  });
});

describe("INSIDE 120 m ROUNDS 1–3 STAND EXACTLY — nothing of the far ledger reaches in", () => {
  // A steady lead closed at 4.6 m/s (the drill's FTG_LEAD shape) crosses into the reach
  // at τc = 6 s; the student stamps 0.6 s later, the lead ~117 m ahead. Inside the reach
  // a read, steady lead whose closing a lift absorbs is no cause (rounds 1–3), so this is
  // convicted — although 0.6 s earlier the same lead was a far cause by its closing.
  const crossing = (stampAfter: number) => (): Act => {
    const tc = 6.0;
    const onset = tc + stampAfter;
    const lp = (tau: number) => REACH + 4.6 * tc + (58 / 3.6 - 4.6) * tau;
    return { speedKmh: stopAt(58, 9.4, onset), leadGapM: (tau, x) => lp(tau) - x, durationSec: onset + 4 };
  };
  it("the act's premise: the lead is inside the reach on every frame from the stamp on, beyond it before τc", () => {
    const lp = (tau: number) => REACH + 4.6 * 6 + (58 / 3.6 - 4.6) * tau;
    expect(lp(5.9) - (58 / 3.6) * 5.9).toBeGreaterThan(REACH);
    expect(lp(6.6) - (58 / 3.6) * 6.6).toBeLessThan(REACH);
  });
  it("a steady lead that crossed into the reach 0.6 s before the stamp: convicted at every rate (the far closing memory does not reach in)", () => {
    expect(offenders(crossing(0.6), true)).toEqual([]);
  });
  // Round 3's own QUICK reading inside the reach, pinned at the round-3 verifier's X12
  // shape: a lead 60 / 90 / 110 m ahead (both at 50 км/ч) brakes a moderate 2.5 m/s²,
  // the student stamps 0.75 s later — before the far reading can cross the line.
  for (const gap0 of [60, 90, 110]) {
    it(`a lead ${gap0} m ahead braking 2.5 m/s², stamp 0.75 s later: acquitted at every rate (the quick reading, as round 3 has it)`, () => {
      const mk = (): Act => {
        const lp = leadPos(gap0, 50, BR, 2.5);
        const onset = BR + 0.75;
        return { speedKmh: stopAt(50, 8.5, onset), leadGapM: (tau, x) => lp(tau) - x, durationSec: onset + 4 };
      };
      expect(offenders(mk, false)).toEqual([]);
    });
  }
});

/** `offenders` on a subset of the rates. */
function offendersAt(mk: () => Act, want: boolean, rates: readonly number[]): string[] {
  const out: string[] = [];
  for (const hz of rates) {
    for (const m of MODES) {
      const act = mk();
      if (drive(act, frames(hz, m, act.durationSec)) !== want) out.push(`${hz}Hz/${m}`);
    }
  }
  return out;
}

describe("EACH FAR CAUSE HAS AN EDGE OF ITS OWN (isolated acts — the first mutation pass found these unpinned)", () => {
  // A RESTART, NOT AN ENTRY: a steady far lead 130 m ahead (45 км/ч, the student at 50
  // closes at 1.4 m/s — under the closing line) turns off at τr and the channel then
  // reads the next car, 30 m FARTHER (a restart: a farther car is no surprise, so no
  // entry memory speaks). Only UNREAD can acquit a stamp right after it.
  const τr = 4.0;
  const replaced = (stampAfter: number, blink = false) => (): Act => {
    const near = (tau: number) => 130 + (5 / 3.6) * τr + (45 / 3.6) * tau;
    const far = (tau: number) => 160 + (5 / 3.6) * τr + (45 / 3.6) * tau;
    const onset = τr + stampAfter;
    return {
      speedKmh: stopAt(50, 8.5, onset),
      leadGapM: (tau, x) => (blink && tau >= onset && tau < onset + 0.45 ? null : (tau < τr ? near(tau) : far(tau)) - x),
      durationSec: onset + 4,
    };
  };
  it("a farther car replaces a far lead, stamp 0.3 s after — its readings not built: acquitted at every rate", () => {
    expect(offenders(replaced(0.3), false)).toEqual([]);
  });
  it("…stamp 2.0 s after — read, steady, closing 1.4 m/s, never an entry: convicted at every rate", () => {
    expect(offenders(replaced(2.0), true)).toEqual([]);
  });
  // …and A BLINK HOLDS THAT VERDICT: the replaced, still unread car drops out of the
  // channel for 0.45 s from the stamp 0.55 s after the restart (every rate has read it
  // by then). No memory speaks for an unread restart, so only the held verdict does.
  it("the unread far car blinks for 0.45 s on the stamp: the blink holds «unread» — acquitted at every rate", () => {
    expect(offenders(replaced(0.55, true), false)).toEqual([]);
  });

  // THE FAR BRAKING MEMORY ALONE: a lead 150 m ahead, FASTER than the student (70 км/ч
  // against 50, so it opens the gap and no closing line speaks), brakes 6 m/s² from BR
  // and turns off 0.8 s later — read braking by the quick reading from ~0.41 s, before
  // the far reading (0.91 s) or round 3's memory could say it. The student stamps
  // `after` s after it vanished, the bridge (0.5 s) long over. Pinned at 4–120 Hz: the
  // quick reading crosses the line 0.5 s before the far one, and a 2.5–2.8 Hz frame
  // (0.36–0.5 s) cannot land inside that half second on every phase, so there the
  // act cannot isolate this one memory (its edges blur by a frame, as round 2 said).
  const brakesAndGoes = (after: number) => (): Act => {
    const lp = leadPos(150, 70, BR, 6);
    const gone = BR + 0.8;
    return { speedKmh: stopAt(50, 8.5, gone + after), leadGapM: (tau, x) => (tau >= gone ? null : lp(tau) - x), durationSec: gone + after + 4 };
  };
  it("the act's premise: the lead never closes on the student, and it is beyond the reach when it goes", () => {
    const lp = leadPos(150, 70, BR, 6);
    expect(lp(BR + 0.8) - (50 / 3.6) * (BR + 0.8)).toBeGreaterThan(REACH);
    expect(70 / 3.6 - 6 * 0.8).toBeGreaterThan(50 / 3.6); // still faster than the student when it goes
  });
  it("a far lead seen braking, gone 0.6 s before the stamp: remembered — acquitted at 4–120 Hz", () => {
    expect(offendersAt(brakesAndGoes(0.6), false, [4, 10, 30, 60, 120])).toEqual([]);
  });
  it("…gone 1.6 s before the stamp: the memory has run out — convicted at 4–120 Hz", () => {
    expect(offendersAt(brakesAndGoes(1.6), true, [4, 10, 30, 60, 120])).toEqual([]);
  });

  // A FAR ENTRY DOES NOT REACH IN: a 36.4 км/ч car appears 128 m ahead of a student at
  // 58 (closing 6 m/s — a far cause while it is beyond the reach) and is within the
  // reach from 1.33 s. A stamp 1.6 s after it appeared — inside its 2.0 s entry memory,
  // but with the car 118 m ahead, read, steady, demand 0.16 — is judged by rounds 1–3,
  // for which an entry beyond the reach is no surprise: convicted.
  it("a car that appeared 128 m ahead and has come within the reach, stamp 1.6 s after it appeared: convicted at every rate", () => {
    const mk = (): Act => {
      const entry = 2.0;
      const lp = (tau: number) => 128 + (58 / 3.6) * entry + (58 / 3.6 - 6) * (tau - entry);
      return { speedKmh: stopAt(58, 9.4, entry + 1.6), leadGapM: (tau, x) => (tau < entry ? null : lp(tau) - x), durationSec: entry + 5.6 };
    };
    expect(offenders(mk, true)).toEqual([]);
  });

  // A BLINK OF A LEAD INSIDE THE REACH IS JUDGED AT ITS INSIDE GAP: the crossing act
  // above, with the lead out of the channel for 0.3 s from the stamp. Bridged, the lead
  // is still ~117 m ahead and the far memories stay silent. Pinned at 10–120 Hz, where a
  // 0.3 s blink is shorter than the 0.5 s bridge; on a 2.5–4 Hz phone the same blink
  // leaves a silence longer than the window, the channel is EMPTY, and an empty channel
  // is exactly where the far memories are meant to speak.
  it("a lead that crossed into the reach 0.6 s before the stamp blinks for 0.3 s on it: convicted at 10–120 Hz", () => {
    const mk = (): Act => {
      const tc = 6.0;
      const onset = tc + 0.6;
      const lp = (tau: number) => REACH + 4.6 * tc + (58 / 3.6 - 4.6) * tau;
      return { speedKmh: stopAt(58, 9.4, onset), leadGapM: (tau, x) => (tau >= onset && tau < onset + 0.3 ? null : lp(tau) - x), durationSec: onset + 4 };
    };
    expect(offendersAt(mk, true, [10, 30, 60, 120])).toEqual([]);
  });

  // ROUND 2's DEMAND MEMORY, INSIDE THE REACH (beyond it the closing line now covers
  // what it used to): a 20 км/ч lead 110 m ahead of a student at 60 closes at 11.1 m/s
  // and demands 0.62 at the pedal — but on a phone frame that lands 0.4 s into the
  // stamp the windowed closing already demands < 0.5. The closing the driver reacted to
  // is the one before the pedal: acquitted at every rate.
  it("a slow lead 110 m ahead whose closing demands 0.62 at the pedal: acquitted at every rate (round 2's demand memory)", () => {
    const mk = (): Act => {
      const onset = 4.0;
      const c = (60 - 20) / 3.6;
      const lp = (tau: number) => 110 + c * onset + (20 / 3.6) * tau;
      return { speedKmh: stopAt(60, 8.5, onset), leadGapM: (tau, x) => lp(tau) - x, durationSec: onset + 4 };
    };
    expect(offenders(mk, false)).toEqual([]);
  });
});

describe("THE FAR MEMORIES ARE STAMPED ONLY BEYOND THE REACH", () => {
  // The drill's own shape INSIDE the reach — a steady lead ~90 m ahead closed at 4.6 m/s,
  // no cause for rounds 1–3 — turns off at τv (gone for good), and the student stamps
  // 0.6 s later, the channel empty. Had the far ledger stamped its closing memory for
  // a lead inside the reach, the empty channel would let that memory acquit him.
  it("a steady lead 90 m ahead closed at 4.6 m/s that turned off 0.6 s before the stamp: convicted at every rate", () => {
    const mk = (): Act => {
      const tv = 6.0;
      const onset = tv + 0.6;
      const lp = (tau: number) => 90 + 4.6 * tv + (58 / 3.6 - 4.6) * tau;
      return { speedKmh: stopAt(58, 9.4, onset), leadGapM: (tau, x) => (tau >= tv ? null : lp(tau) - x), durationSec: onset + 4 };
    };
    expect(offenders(mk, true)).toEqual([]);
  });
});
