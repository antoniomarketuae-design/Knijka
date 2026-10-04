/**
 * THE HARSH-BRAKE CAUSE LEDGER, ROUND 3 OF `sc-follow-tailgater:63c0c28c` C2a /
 * `:f42dce4f` (rules/engine.ts `leadCauseReadings`, `stepLeadTrack`).
 *
 * The round-2 verifier refuted two things and named a third:
 *  F1  a lead braking 6–8 m/s² 125–200 m ahead was billed «Рязко спиране без
 *      причина» in up to 42 of 42 cells where base billed none: the braking cause
 *      and its memory were stamped only within harshBrakeSignalCauseM (120 m).
 *      RULING: a lead braking at or above the braking line is a cause at ANY
 *      range the lead channel reports — on a far-lead deceleration estimate that
 *      a steady lead cannot push over the line.
 *  F2  a nearer car was an ENTRY only when the gap fell by more than
 *      (student speed + 50 m/s)·Δt + 5 m — 6.1 m at 60 Hz, 21 m at 4 Hz, 30.6 m at
 *      2.5 Hz — so one cut-in was an entry on a desktop and invisible on a phone.
 *      RULING: compare the reading with the gap the TRACK PREDICTS for this
 *      instant and call it an entry when it is nearer by a FIXED margin.
 *  C1  the silence was measured only on null frames: a null frame exactly 0.5 s
 *      after the last reading kept the track, and the next reading interpolated
 *      across a 0.99 s hole (lead deceleration 0.11 read for 5.2). RULING: a
 *      reading that arrives after a silence longer than the window restarts the
 *      track.
 *
 * WHAT THE FAR-LEAD NOISE WAS (measured before the estimator was chosen). The
 * verifier's C2 saw the drill's steady `FTG_LEAD` read ≥ 2 m/s² 130–140 m ahead
 * at 2.8 and 10 Hz. Logged through the lesson session, it is not jitter: when the
 * lead reaches the end of its 400 m path the traffic system finishes it with a
 * ONE-FRAME FORWARD POSITION STEP (0.05–0.78 m measured across 2.5–120 Hz in the
 * drill, 0.02–1.13 m on the recorded replays; at most one frame of its own
 * motion — `traffic/staged.ts` clamps `s` to the path end and then adds the
 * whole frame's retirement run), and a 0.5 s two-window difference reads a step
 * δ as −δ/W² for one window and +δ/W² for the next — 0.52 m at 10 Hz is ±2.08
 * m/s². The student's own odometer adds BACKWARD steps of the same shape at his
 * brake onset (≤ a·dt²/8, 0.3 m on a 0.5 s frame). So the far estimate is built
 * so that a forward step of ANY size cannot raise it and a backward one raises
 * it by at most 2|δ| m/s² (see `leadCauseReadings`), and the acts below prove
 * both halves: a steady lead with a step still convicts, a braking lead still
 * acquits.
 *
 * Every act is sampled at 2.5 / 2.8 / 4 / 10 / 30 / 60 / 120 Hz, at four phases
 * and on the round-2 verifier's two jittered phone schedules (dt uniform in
 * [0.55, 1.45]/hz, capped at 0.5 s — its own generator, so its cells are these).
 */

import { describe, expect, it } from "vitest";
import {
  LEAD_ENTRY_MARGIN_M,
  LEAD_FAR_WINDOWS,
  LEAD_TRACK_WINDOW_SEC,
  createRuleEngine,
  leadCauseReadings,
  reduceTick,
} from "../engine";
import { DEFAULT_RULE_CONFIG } from "../types";
import type { RuleEngineState } from "../engine";
import { tick } from "./fixtures";

const RATES = [2.5, 2.8, 4, 10, 30, 60, 120] as const;
const MODES = ["ph0", "ph0.25", "ph0.5", "ph0.75", "jit1", "jit2"] as const;

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
  /** the lead channel at frame time τ, given the student's exact travel (null = nobody) */
  leadGapM: (tau: number, travel: number) => number | null;
  durationSec: number;
  /** the world re-stages the student (a position jump the speed cannot explain) at this time */
  restageAt?: number;
}

/** One drive on the given frame times; returns whether HARSH_BRAKING_NO_CAUSE was billed, and the final state. */
function drive(act: Act, ft: readonly number[]): { hit: boolean; state: RuleEngineState; states: Array<{ t: number; s: RuleEngineState }> } {
  let state = createRuleEngine();
  let travel = 0;
  let tf = 0;
  let hit = false;
  const states: Array<{ t: number; s: RuleEngineState }> = [];
  for (const t of ft) {
    while (tf < t - 1e-12) {
      const h = Math.min(0.0005, t - tf);
      travel += ((act.speedKmh(tf) + act.speedKmh(tf + h)) / 2 / 3.6) * h;
      tf += h;
    }
    const g = act.leadGapM(t, travel);
    const r = reduceTick(
      state,
      tick(t, { speedKmh: Math.max(0, act.speedKmh(t)), position: { x: 0, y: act.restageAt !== undefined && t >= act.restageAt ? travel + 300 : travel }, gear: 3, ...(g !== null ? { leadGapM: g } : {}), events: [] }),
    );
    state = r.state;
    states.push({ t, s: state });
    for (const e of r.events) if (e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE") hit = true;
  }
  return { hit, state, states };
}

/** The rate/mode cells whose verdict is NOT `want` (empty = unanimous and right). */
function offenders(mk: () => Act, want: boolean): string[] {
  const out: string[] = [];
  for (const hz of RATES) {
    for (const m of MODES) {
      const act = mk();
      if (drive(act, frames(hz, m, act.durationSec)).hit !== want) out.push(`${hz}Hz/${m}`);
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

/** The verifier's acts all start the lead in view at τ = 0 and act at BR = 4 s, so the 2 s entry memory has long expired. */
const BR = 4.0;

describe("F1 — A LEAD BRAKING HARD IS A CAUSE AT ANY RANGE (the round-2 verifier's N3 acts, ported)", () => {
  // The lead and the student both cruise v; the lead, gap0 ahead, brakes ld from BR;
  // the student stamps 8.5 m/s² `react` s later. Base acquitted every one of these
  // (its closing clause was a cause «at any distance»); round 2 billed up to 42/42.
  for (const v of [50, 90]) {
    for (const gap0 of [125, 140, 160, 200]) {
      it(`${v} км/ч, a lead ${gap0} m ahead braking 6 or 8 m/s², the student stamping 0.75 / 1.0 / 1.5 / 2.5 s later: acquitted at every rate`, () => {
        const bad: string[] = [];
        for (const ld of [6, 8]) {
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
  it("the act's premise: the lead is beyond the reach a visible cue gets (harshBrakeSignalCauseM) when the student stamps", () => {
    for (const gap0 of [125, 140, 160, 200]) {
      for (const ld of [6, 8]) {
        // the gap only shrinks after the lead's onset; at the earliest stamp it is still past the reach
        const lp = leadPos(gap0, 50, BR, ld);
        expect(lp(BR + 0.75) - (50 / 3.6) * (BR + 0.75)).toBeGreaterThan(DEFAULT_RULE_CONFIG.harshBrakeSignalCauseM);
      }
    }
  });
});

describe("F1 — …AND A STEADY FAR LEAD IS NOT, EVEN WHEN ITS POSITION STEPS A LITTLE", () => {
  // ROUND 4 (integrator ruling, beyond 120 m base-like acquittal). This block used the
  // drill's own geometry — a steady 41.4 км/ч lead closed at 4.6 m/s — and convicted.
  // Beyond harshBrakeSignalCauseM a windowed closing ≥ harshBrakeClosingLeadMps (3 m/s)
  // is a cause again, so that act now acquits (lead-cause-beyond-reach.test.ts pins
  // both sides of the line), and the QUICK reading speaks at any range, so a position
  // step ≥ 0.5 m (its ±δ/W² reads ±2 m/s²) acquits too — the A12 side, by ruling. What
  // this block still guards: a steady far lead closed UNDER the line (1.8 m/s: a
  // student at 58 behind a lead at 51.5 км/ч) convicts, and a step the quick reading
  // cannot push over the line does not acquit it. The quick reading reads a step δ as
  // ±δ/W² (4δ m/s²) and the student's own odometer adds a backward step of up to
  // a·dt²/8 at his brake onset (0.29 m for 9.4 m/s² on a 0.5 s frame): measured, |δ| =
  // 0.3 m already acquits a 2.5 Hz «jit1» cell, so the guard is |δ| = 0.15 m — the size
  // of the path-end step at 4 and 120 Hz (0.055 and 0.06 m measured in the drill). The far reading's immunity to a step of ANY
  // size stays pinned below on the exported readings.
  // `gap0` is the gap AT THE STAMP, so the lead is beyond the reach the whole time the
  // ledger asks about it.
  const LEAD_KMH = 58 - 1.8 * 3.6;
  const steadyWithStep = (gap0: number, delta: number, stepBefore: number) => (): Act => {
    const onset = 6.0;
    const lp = leadPos(gap0 + ((58 - LEAD_KMH) / 3.6) * onset, LEAD_KMH);
    return {
      speedKmh: stopAt(58, 9.4, onset),
      leadGapM: (tau, x) => lp(tau) + (tau >= onset - stepBefore ? delta : 0) - x,
      durationSec: onset + 4,
    };
  };
  for (const gap0 of [125, 140, 170, 200]) {
    it(`a steady lead ${gap0} m ahead at the stamp, closed at 1.8 m/s, no step: convicted at every rate`, () => {
      expect(offenders(steadyWithStep(gap0, 0, 0), true)).toEqual([]);
    });
  }
  for (const delta of [0.15, -0.15]) {
    it(`a steady lead 140 m ahead at the stamp whose position steps ${delta > 0 ? "+" : ""}${delta} m once, from 2.0 s before the stamp to 0.5 s after: convicted at every rate`, () => {
      const bad: string[] = [];
      for (const stepBefore of [2.0, 1.6, 1.25, 1.0, 0.8, 0.6, 0.4, 0.2, 0, -0.2, -0.5]) {
        for (const c of offenders(steadyWithStep(140, delta, stepBefore), true)) bad.push(`step ${stepBefore}s before: ${c}`);
      }
      expect(bad).toEqual([]);
    });
  }
});

describe("F1 — the far reading's arithmetic, pinned on the exported readings", () => {
  // A lead track sampled at `hz` from τ = 0 (student parked at odo 0, so the gap IS the
  // lead's position); read at the last sample.
  const trackOf = (hz: number, until: number, pos: (tau: number) => number) => {
    const tr: Array<{ t: number; odoM: number; gapM: number }> = [];
    for (let k = 0; k / hz <= until + 1e-9; k++) tr.push({ t: k / hz, odoM: 0, gapM: pos(k / hz) });
    return tr;
  };
  const farAt = (hz: number, until: number, pos: (tau: number) => number) => {
    const tr = trackOf(hz, until, pos);
    const last = tr[tr.length - 1];
    return leadCauseReadings(tr, last.t, 0, last.gapM);
  };
  it("needs LEAD_FAR_WINDOWS × W = 2.5 s of track; null before", () => {
    expect(LEAD_FAR_WINDOWS * LEAD_TRACK_WINDOW_SEC).toBe(2.5);
    expect(farAt(10, 2.4, (tau) => 100 + 11.5 * tau).leadDecelFarMps2).toBeNull();
    expect(farAt(10, 2.5, (tau) => 100 + 11.5 * tau).leadDecelFarMps2).toBeCloseTo(0, 9);
  });
  it("a lead braking steadily at 6 m/s² reads exactly 6 once the braking spans the windows, at every rate", () => {
    // braking from 2.0 s (50 км/ч, at rest at 4.31 s); read at 4.0 s, when v₁ and v₂ both lie inside the braking
    for (const hz of [2, 4, 10, 60]) {
      expect(farAt(hz, 4.0, leadPos(100, 50, 2.0, 6)).leadDecelFarMps2!, `${hz} Hz`).toBeCloseTo(6, 6);
    }
  });
  it("…and crosses the 2 m/s² line 0.91 s after the lead's brake onset (2·a·(τ − 0.5)² = 2)", () => {
    const pos = leadPos(100, 50, 3.0, 6);
    const tr = trackOf(120, 5, pos);
    const reading = (tau: number) => leadCauseReadings(tr.filter((x) => x.t <= tau + 1e-9), tau, 0, pos(tau)).leadDecelFarMps2!;
    expect(reading(3.0 + 0.88)).toBeLessThan(2);
    expect(reading(3.0 + 0.94)).toBeGreaterThan(2);
  });
  it("ONE forward step of any size, anywhere in the 2.5 s, never raises it above 0 for a steady lead", () => {
    let worst = -Infinity;
    for (const hz of [2, 2.5, 2.8, 4, 10, 60]) {
      for (const delta of [0.3, 0.78, 3, 5.75]) {
        for (let at = 0.01; at < 2.5; at += 0.037) {
          const pos = (tau: number) => 100 + 11.5 * tau + (tau >= 2.5 - at ? delta : 0);
          worst = Math.max(worst, farAt(hz, 2.5, pos).leadDecelFarMps2!);
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(1e-9);
  });
  it("ONE backward step raises it by at most |δ|/2W² (straddling the v₀/v₁ edge): the odometer's 0.3 m reads ≤ 0.6, a 1 m step reaches the line", () => {
    let worst03 = -Infinity;
    let worst1 = -Infinity;
    for (const hz of [2, 2.5, 2.8, 4, 10, 60]) {
      for (let at = 0.01; at < 2.5; at += 0.013) {
        const p03 = (tau: number) => 100 + 11.5 * tau - (tau >= 2.5 - at ? 0.3 : 0);
        const p1 = (tau: number) => 100 + 11.5 * tau - (tau >= 2.5 - at ? 1.0 : 0);
        worst03 = Math.max(worst03, farAt(hz, 2.5, p03).leadDecelFarMps2!);
        worst1 = Math.max(worst1, farAt(hz, 2.5, p1).leadDecelFarMps2!);
      }
    }
    expect(worst03).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(worst03).toBeGreaterThan(0.45); // the bound is approached, not merely respected
    expect(worst1).toBeLessThanOrEqual(2 + 1e-9);
  });
  it("the QUICK reading, by contrast, reads a 0.52 m forward step as ±2.08 m/s² (what the round-2 verifier's C2 saw at 10 Hz)", () => {
    let hi = -Infinity;
    let lo = Infinity;
    for (let tau = 1.0; tau <= 2.5 + 1e-9; tau += 0.1) {
      const pos = (x: number) => 100 + 11.5 * x + (x >= 1.25 ? 0.52 : 0);
      const tr = trackOf(10, tau, pos);
      const q = leadCauseReadings(tr, tr[tr.length - 1].t, 0, tr[tr.length - 1].gapM).leadDecelMps2!;
      hi = Math.max(hi, q);
      lo = Math.min(lo, q);
    }
    expect(hi).toBeCloseTo(2.08, 6);
    expect(lo).toBeCloseTo(-2.08, 6);
  });
});

describe("F2 — A CUT-IN IS AN ENTRY AT EVERY RATE (the round-2 verifier's N6 act, ported)", () => {
  // A steady old lead 90 m ahead at 50 км/ч (in view since τ = 0); at tc = 5 s a
  // steady 40 км/ч car pulls in J m NEARER than it; the student, at 50, stamps
  // 8.5 m/s² `after` s later. The new car's closing (2.8 m/s from ~70–80 m) demands
  // ≈ 0.05, so only its newness — the 2.0 s entry memory — can acquit.
  const tc = BR + 1;
  const cutIn = (J: number, after: number) => (): Act => {
    const old = (tau: number) => 90 + (50 / 3.6) * tau;
    const nw = (tau: number) => 90 - J + (50 / 3.6) * tc + (40 / 3.6) * (tau - tc);
    const onset = tc + after;
    return { speedKmh: stopAt(50, 8.5, onset), leadGapM: (tau, x) => (tau < tc ? old(tau) : nw(tau)) - x, durationSec: onset + 4 };
  };
  for (const J of [6, 10, 20, 30]) {
    it(`a car cutting in ${J} m nearer than the old lead is an ENTRY on the first frame that sees it, at every rate`, () => {
      const bad: string[] = [];
      for (const hz of RATES) {
        for (const m of MODES) {
          const act = cutIn(J, 10)();
          const ft = frames(hz, m, tc + 1.5);
          const first = ft.find((t) => t >= tc)!;
          const { state } = drive(act, ft);
          if (state.leadMemory.enteredAt !== first) bad.push(`${hz}Hz/${m}: enteredAt ${state.leadMemory.enteredAt} (first frame ${first})`);
        }
      }
      expect(bad).toEqual([]);
    });
    it(`…so a stamp 0.3 / 1.0 / 1.4 / 1.7 / 1.9 s after the ${J} m cut-in is acquitted at every rate`, () => {
      const bad: string[] = [];
      for (const after of [0.3, 1.0, 1.4, 1.7, 1.9]) for (const c of offenders(cutIn(J, after), false)) bad.push(`after ${after}: ${c}`);
      expect(bad).toEqual([]);
    });
  }
  // The memory's edge is blurred by up to two coarse frames, on the acquittal side
  // and by round 2's design: the entry is stamped on the first frame that SEES the car
  // (up to a frame after it pulled in), and the memory is asked at the START of the
  // pedal's frame. At 2.5 Hz that is 0.8 s, so the convicting twin stamps 3.0 s after.
  it("the memory ends: a stamp 3.0 s after a 10 m cut-in, the student merely faster than the new car — convicted at every rate", () => {
    expect(offenders(cutIn(10, 3.0), true)).toEqual([]);
  });
  it("a FARTHER car in the old lead's place (10 m and 30 m farther) is a restart, never an entry, at every rate", () => {
    const bad: string[] = [];
    for (const J of [-10, -30]) {
      for (const hz of RATES) {
        for (const m of MODES) {
          const { state } = drive(cutIn(J, 10)(), frames(hz, m, tc + 1.5));
          // the old lead's first sight at the start of the drive is the only entry
          if (state.leadMemory.enteredAt !== null && state.leadMemory.enteredAt >= tc) bad.push(`J${J} ${hz}Hz/${m}: enteredAt ${state.leadMemory.enteredAt}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
  it("the entry margin is a fixed distance (it does not scale with the frame) and it is smaller than the smallest cut-in the ruling names", () => {
    expect(typeof LEAD_ENTRY_MARGIN_M).toBe("number");
    expect(LEAD_ENTRY_MARGIN_M).toBeGreaterThanOrEqual(1.25);
    expect(LEAD_ENTRY_MARGIN_M).toBeLessThan(6);
  });
});

describe("F2 — real motion is not a cut-in: a lead that brakes, accelerates or steps is never an entry", () => {
  // A lead followed since τ = 0 that brakes 8 m/s² (to rest), accelerates 3 m/s²,
  // or finishes its path with a forward position step of 0.78 m, must not be called
  // an entry — the margin covers what real motion and the path-end step do.
  const motions: Array<[string, (tau: number) => number]> = [
    ["brakes 8 m/s² from 70 m to rest", leadPos(70, 50, BR, 8)],
    ["brakes 10 m/s² from 70 m to rest", leadPos(70, 50, BR, 10)],
    ["accelerates 3 m/s² from 70 m", (tau) => 70 + (50 / 3.6) * tau + (tau > BR ? 1.5 * (tau - BR) ** 2 : 0)],
    ["steps +0.78 m once at 100 m (the path-end finish)", (tau) => 100 + (41.4 / 3.6) * tau + (tau >= BR ? 0.78 : 0)],
  ];
  for (const [name, lp] of motions) {
    it(`a lead that ${name}: no entry after the first sight, at every rate`, () => {
      const bad: string[] = [];
      for (const hz of RATES) {
        for (const m of MODES) {
          const act: Act = { speedKmh: () => 50, leadGapM: (tau, x) => Math.max(0.5, lp(tau) - x), durationSec: BR + 3 };
          const { state } = drive(act, frames(hz, m, act.durationSec));
          if (state.leadMemory.enteredAt !== null && state.leadMemory.enteredAt > 1) bad.push(`${hz}Hz/${m}: enteredAt ${state.leadMemory.enteredAt}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
});

describe("C1 — A READING AFTER A SILENCE LONGER THAN THE WINDOW RESTARTS THE TRACK", () => {
  // The round-2 verifier's N1 act: a lead 70 m ahead (in view since τ = 0) brakes
  // 6 m/s² from BR; the channel is null for 0.45 s from BR + 0.2; the student stamps
  // 8.5 m/s² 0.3 s into the silence. On its 2.8 Hz and 2.5 Hz «jit2» phone schedules a
  // null frame fell exactly 0.5 s after the last reading, the track was kept, and the
  // reading after the 0.99 s hole read the lead's deceleration as 0.11 — billed. Its
  // twin with no blink was acquitted on the same frames.
  const blink = (withBlink: boolean) => (): Act => {
    const lp = leadPos(70, 50, BR, 6);
    const d = BR + 0.2;
    const onset = d + 0.3;
    return {
      speedKmh: stopAt(50, 8.5, onset),
      leadGapM: (tau, x) => (withBlink && tau >= d && tau < d + 0.45 ? null : lp(tau) - x),
      durationSec: onset + 4,
    };
  };
  it("the verifier's two cells (2.8 Hz and 2.5 Hz «jit2»): acquitted, as their no-blink twins are", () => {
    for (const hz of [2.8, 2.5]) {
      const ft = frames(hz, "jit2", blink(true)().durationSec);
      expect(drive(blink(false)(), ft).hit, `${hz} Hz no blink`).toBe(false);
      expect(drive(blink(true)(), ft).hit, `${hz} Hz blink`).toBe(false);
    }
  });
  it("…and at every rate and schedule", () => {
    expect(offenders(blink(true), false)).toEqual([]);
  });
  // ISOLATED, on a hand-built schedule: readings every 0.25 s to t1 = 3.0, then a null
  // frame at exactly t1 + W (the bridge keeps the track on it), then the next reading at
  // t1 + 0.85. That reading must START a track — one sample, an entry — instead of
  // interpolating across the hole.
  it("a reading 0.85 s after the last one, with a null frame between at exactly the window, starts a fresh track as an entry", () => {
    const ft = [...Array.from({ length: 12 }, (_, i) => 0.25 * (i + 1)), 3.0 + LEAD_TRACK_WINDOW_SEC, 3.85];
    const act: Act = {
      speedKmh: () => 50,
      leadGapM: (tau, x) => (Math.abs(tau - (3.0 + LEAD_TRACK_WINDOW_SEC)) < 1e-9 ? null : 80 + (40 / 3.6) * tau - x),
      durationSec: 4,
    };
    const { states } = drive(act, ft);
    const atNull = states.find((r) => Math.abs(r.t - 3.5) < 1e-9)!.s;
    expect(atNull.leadTrack.length).toBeGreaterThan(1); // bridged, not emptied
    const after = states[states.length - 1].s;
    expect(after.leadTrack.length).toBe(1);
    expect(after.leadMemory.enteredAt).toBe(3.85);
  });
  it("…but two consecutive READINGS a long frame apart (a 1 Hz fixture feed, no null between) are not a silence: the track continues", () => {
    const ft = [1, 2, 3, 4, 5];
    const act: Act = { speedKmh: () => 50, leadGapM: (tau, x) => 80 + (40 / 3.6) * tau - x, durationSec: 5 };
    const { state } = drive(act, ft);
    expect(state.leadTrack.length).toBeGreaterThan(1);
    expect(state.leadMemory.enteredAt).toBe(1);
  });
  it("…and a null frame long BEFORE does not make every later long frame a silence: the flag is cleared by the next reading", () => {
    // nobody in the channel at τ = 1, then readings at 1 Hz: the reading at 2 is the
    // first sight (an entry); those after it continue the track
    const ft = [1, 2, 3, 4, 5, 6];
    const act: Act = { speedKmh: () => 50, leadGapM: (tau, x) => (tau < 1.5 ? null : 80 + (40 / 3.6) * tau - x), durationSec: 6 };
    const { state } = drive(act, ft);
    expect(state.leadMemory.enteredAt).toBe(2);
    expect(state.leadTrack.length).toBeGreaterThan(1);
  });
});

describe("F1 — THE BRAKING MEMORY REACHES PAST 120 m TOO (isolated: the far lead then leaves the corridor)", () => {
  // A 50 км/ч lead (in view since τ = 0) brakes 6 m/s² from BR; at BR + 1.4 — read
  // braking by the far reading since ~BR + 0.9, still ~150 m ahead — it leaves the
  // corridor for good. The student, at 58, stamps 9.4 m/s² `after` s after it vanished.
  // Its closing then demands ≈ 0.4 (< 0.5), it is beyond the reach (no UNREAD, no
  // ENTRY), and the bridge ends 0.5 s after it vanished — only the braking memory can
  // speak for it.
  const vanishes = (after: number) => (): Act => {
    const lp = leadPos(170, 50, BR, 6);
    const gone = BR + 1.4;
    return { speedKmh: stopAt(58, 9.4, gone + after), leadGapM: (tau, x) => (tau >= gone ? null : lp(tau) - x), durationSec: gone + after + 4 };
  };
  it("the act's premise: the lead is beyond the reach when it vanishes", () => {
    const lp = leadPos(170, 50, BR, 6);
    expect(lp(BR + 1.4) - (58 / 3.6) * (BR + 1.4)).toBeGreaterThan(DEFAULT_RULE_CONFIG.harshBrakeSignalCauseM);
  });
  it("stamp 0.6 s after it vanished — within a second of being seen braking: acquitted at every rate", () => {
    expect(offenders(vanishes(0.6), false)).toEqual([]);
  });
  it("stamp 1.6 s after it vanished — the memory has run out and the corridor is empty: convicted at every rate", () => {
    expect(offenders(vanishes(1.6), true)).toEqual([]);
  });
});

describe("R2-d, RE-ISOLATED — the QUICK reading's braking line inside the reach (round 2's pin is now also met by the far reading)", () => {
  // Round 2 pinned the braking line with a lead braking 2.5 m/s² at 110 m stamped 1.3 s
  // after its onset; in round 3 the far reading (2.5 ≥ 2 after 1.13 s) acquits that act
  // too, so it no longer pins the QUICK reading's line. Here the world re-stages the
  // student at 2.5 s: the track restarts, so the far reading cannot exist before 5.0 s
  // and the quick one only from 3.5 s. A steady 41.4 км/ч lead ~90 m ahead brakes a
  // moderate 2.5 m/s² from 3.6; the student, at 58, stamps 9.4 m/s² at 4.4. The quick
  // reading crosses 2 at ~4.23 and its closing demands < 0.45, so only the quick
  // reading's line can acquit before the bill falls.
  const act = (): Act => {
    const lead = (tau: number) => 110 + (41.4 / 3.6) * Math.min(tau, 3.6) + (tau > 3.6 ? (41.4 / 3.6) * (tau - 3.6) - 1.25 * (tau - 3.6) ** 2 : 0);
    return { speedKmh: stopAt(58, 9.4, 4.4), leadGapM: (tau, x) => lead(tau) - x, durationSec: 8, restageAt: 2.5 };
  };
  it("a lead in the reach braking 2.5 m/s², read only by the quick reading: acquitted at every rate", () => {
    expect(offenders(act, false)).toEqual([]);
  });
});
