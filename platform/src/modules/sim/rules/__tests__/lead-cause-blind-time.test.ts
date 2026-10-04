/**
 * THE HARSH-BRAKE CAUSE LEDGER HAS NO BLIND TIME — ROUND 2 OF
 * `sc-follow-tailgater:63c0c28c` C2a / `:f42dce4f` (rules/engine.ts
 * `stepLeadTrack`, `leadMemory`, `LEAD_DEMAND_LINE_MPS2`).
 *
 * Round 1 made the lead's readings rate-free by measuring them over a 0.5 s
 * window — and emptied the window on ANY frame the lead channel was null. The
 * round-1 verifier (R1) showed what that cost: for 0.5 s (closing) and 1.0 s
 * (the lead's own deceleration) after one null frame, or after a ±2.5° weave of
 * the student's heading carried a car 100 m ahead out of the 4 m corridor, a
 * lead braking 6 m/s² read as no cause, and a lawful hard stop for it was
 * billed 35 of 35 times. Base acquitted every one.
 *
 * The integrator's rulings (A12: when a cause is unknown or plausible, ACQUIT):
 *  R2-a  a blink is not an absence — null frames up to LEAD_TRACK_WINDOW_SEC are
 *        bridged; a lead in reach whose readings are not built yet is a cause.
 *  R2-b  memory — a lead seen braking within 1.0 s, or one that ENTERED the
 *        corridor within 2.0 s, is a cause.
 *  R2-c  the demand line is 0.5 m/s² (a lift of the throttle), not 2.
 *  R2-d  a lead braking 2.5 m/s² beyond 45 m acquits at every rate.
 *
 * Every act is sampled at 2.5 / 2.8 / 4 / 10 / 30 / 60 / 120 Hz × four phases,
 * like `lead-track-rate-free.test.ts`. The first block is the verifier's own
 * battery cases, ported unchanged in their numbers; each later block isolates
 * ONE new behaviour — the act is built so that nothing else can acquit it, and
 * its convicting twin shows the behaviour has an edge.
 */

import { describe, expect, it } from "vitest";
import {
  LEAD_CAUSE_MEMORY_SEC,
  LEAD_DEMAND_LINE_MPS2,
  LEAD_ENTRY_MEMORY_SEC,
  LEAD_REACTION_SEC,
  LEAD_TRACK_WINDOW_SEC,
  createRuleEngine,
  leadCauseReadings,
  reduceTick,
} from "../engine";
import { DEFAULT_RULE_CONFIG } from "../types";
import type { RuleEngineState } from "../engine";
import { tick } from "./fixtures";

const RATES = [2.5, 2.8, 4, 10, 30, 60, 120] as const;
const PHASES = [0, 0.11, 0.23, 0.37] as const;

interface Act {
  speedKmh: (tau: number) => number;
  /** gap to the lead (null = nobody in the channel) at frame time τ, given the student's travel and the frame index */
  leadGapM?: (tau: number, travel: number, frame: number) => number | null;
  durationSec: number;
}

/** One drive of a FRESH act (an act may carry per-drive state, e.g. «the first frame after τ0»). */
function run(mk: () => Act, hz: number, phase: number): boolean {
  const act = mk();
  const dt = 1 / hz;
  let state = createRuleEngine();
  let travel = 0;
  let tf = 0;
  let hit = false;
  for (let k = 0; ; k++) {
    const t = k * dt + phase * dt;
    if (t > act.durationSec) break;
    while (tf < t - 1e-12) {
      const h = Math.min(0.0005, t - tf);
      travel += ((act.speedKmh(tf) + act.speedKmh(tf + h)) / 2 / 3.6) * h;
      tf += h;
    }
    const g = act.leadGapM?.(t, travel, k) ?? null;
    const r = reduceTick(
      state,
      tick(t, { speedKmh: act.speedKmh(t), position: { x: 0, y: travel }, gear: 3, ...(g !== null ? { leadGapM: g } : {}), events: [] }),
    );
    state = r.state;
    for (const e of r.events) if (e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE") hit = true;
  }
  return hit;
}

/** The rate/phase cells whose verdict is NOT `want` (empty = unanimous and right). */
function offenders(mk: () => Act, want: boolean): string[] {
  const out: string[] = [];
  for (const hz of RATES) for (const ph of PHASES) if (run(mk, hz, ph) !== want) out.push(`${hz}Hz/${ph}`);
  return out;
}

const stop =
  (fromKmh: number, decel: number, onset: number) =>
  (tau: number): number =>
    tau < onset ? fromKmh : Math.max(0, fromKmh - decel * 3.6 * (tau - onset));

/** A lead's position along the road (from the student's start): `gap0` ahead at τ = 0, cruising `vKmh`, braking `decel` from `brakeAt` to rest. */
const leadPos =
  (gap0: number, vKmh: number, brakeAt = Infinity, decel = 0) =>
  (tau: number): number => {
    const v = vKmh / 3.6;
    if (tau <= brakeAt) return gap0 + v * tau;
    const tb = Math.min(tau - brakeAt, decel > 0 ? v / decel : Infinity);
    return gap0 + v * brakeAt + v * tb - 0.5 * decel * tb * tb;
  };

/** Demand of a closing c on a gap g, as the ledger computes it (for the act's own sanity checks). */
const demandOf = (c: number, g: number): number => {
  const room = g - c * LEAD_REACTION_SEC;
  return c <= 0 ? 0 : room <= 0 ? Infinity : (c * c) / (2 * room);
};

describe("the round-2 constants are the rulings' numbers", () => {
  it("demand line 0.5 m/s², braking memory 1.0 s, entry memory 2.0 s — the entry memory outlasts the readings' build time", () => {
    expect(LEAD_DEMAND_LINE_MPS2).toBe(0.5);
    expect(LEAD_CAUSE_MEMORY_SEC).toBe(1.0);
    expect(LEAD_ENTRY_MEMORY_SEC).toBe(2.0);
    expect(LEAD_ENTRY_MEMORY_SEC).toBeGreaterThan(2 * LEAD_TRACK_WINDOW_SEC);
  });
});

describe("VERIFIER R1, PORTED — a lawful hard stop for a braking lead is acquitted at every rate however the channel blinked", () => {
  // Battery section D: a lead 70 m ahead at 50 км/ч brakes 6 m/s² from τ = 1.5; the
  // student, also at 50, stamps 8.5 m/s² `react` s later; ONE frame of the lead
  // channel — the first at or after `drop` s before the stamp — is null.
  for (const drop of [0.1, 0.3]) {
    for (const react of [0.75, 1.0, 1.5]) {
      it(`one null frame ${drop} s before a stamp ${react} s after the lead braked`, () => {
        const mk = (): Act => {
          const lp = leadPos(70, 50, 1.5, 6);
          const onset = 1.5 + react;
          let dropped: number | null = null;
          return {
            speedKmh: stop(50, 8.5, onset),
            leadGapM: (tau, s, k) => {
              if (dropped === null && tau >= onset - drop) dropped = k;
              return dropped === k ? null : lp(tau) - s;
            },
            durationSec: onset + 4,
          };
        };
        expect(offenders(mk, false)).toEqual([]);
      });
    }
  }
  // Battery section H: a same-lane lead 110 m ahead brakes 6 m/s²; the student's
  // heading weaves ±2.5° (≈ ±0.4 m sideways) and the channel applies leadGapFor's own
  // corridor, |(gap + 4.5)·sin θ| > 4 m → null — at this range that is ~0.8 s unseen
  // in every half period, longer than the bridge, so the MEMORY carries it.
  for (const period of [2, 4]) {
    it(`a ±2.5° heading weave (period ${period} s) around a lead braking 110 m ahead, stamp 1.5 s after it braked`, () => {
      const mk = (): Act => {
        const lp = leadPos(110, 50, 1.5, 6);
        return {
          speedKmh: stop(50, 8.5, 3.0),
          leadGapM: (tau, s) => {
            const g = lp(tau) - s;
            const th = ((2.5 * Math.PI) / 180) * Math.sin((2 * Math.PI * tau) / period);
            return Math.abs((g + 4.5) * Math.sin(th)) > 4.0 ? null : g;
          },
          durationSec: 7,
        };
      };
      expect(offenders(mk, false)).toEqual([]);
    });
  }
  // Battery section B: a slower car ENTERS the corridor at τ = 1.5 at g0 and brakes from
  // entry; the student stamps 0.3–0.5 s after it appeared.
  for (const g0 of [55, 70, 90]) {
    for (const ld of [3, 6]) {
      it(`a 40 км/ч car entering the corridor ${g0} m ahead and braking ${ld} m/s², stamp 0.3 and 0.5 s after it appeared`, () => {
        for (const react of [0.3, 0.5]) {
          const mk = (): Act => {
            const entry = 1.5;
            const v = 40 / 3.6;
            const lp = (tau: number): number => {
              const tt = tau - entry;
              const tb = Math.min(tt, v / ld);
              return g0 + (50 / 3.6) * entry + v * tb - 0.5 * ld * tb * tb;
            };
            return {
              speedKmh: stop(50, 8.5, entry + react),
              leadGapM: (tau, s) => (tau < entry ? null : lp(tau) - s),
              durationSec: entry + react + 4,
            };
          };
          expect(offenders(mk, false), `react ${react}`).toEqual([]);
        }
      });
    }
  }
});

describe("R2-a — A BLINK IS BRIDGED", () => {
  // ISOLATED: a steady car 30 m ahead — inside the 45 m window, so the DISTANCE clause
  // is its only cause (no closing, no braking; followed since τ = 0, so not an entry) —
  // is unseen for 0.45 s from the stamp. Bridged, it is still 30 m ahead; emptied, the
  // road reads clear and the 0.4 s sustain fills inside the blink.
  const close = (unseenFrom: number, unseenSec: number) => (): Act => {
    const onset = 3.0;
    const lp = leadPos(30, 58);
    return {
      speedKmh: stop(58, 9.4, onset),
      leadGapM: (tau, s) => (tau >= onset + unseenFrom && tau < onset + unseenFrom + unseenSec ? null : lp(tau) - s),
      durationSec: onset + 4,
    };
  };
  it("a car 30 m ahead unseen for 0.45 s from the stamp: acquitted at every rate", () => {
    expect(offenders(close(0, 0.45), false)).toEqual([]);
  });
  it("…unseen from 1.0 s BEFORE the stamp it has gone (a silence longer than the bridge, and no memory speaks for a car that was only close): convicted at every rate", () => {
    expect(offenders(close(-1.0, 4), true)).toEqual([]);
  });
  // A12 PINS: a stopped queue 180 m ahead of a student at 50 км/ч: demand 0.58 ≥ 0.5, so
  // it is a cause; at 180 m it is beyond harshBrakeSignalCauseM (120 m), so neither
  // UNREAD nor ENTRY can speak for it. One null frame at (or just before) the stamp —
  // round 1 emptied the track there and the 0.4 s sustain filled in the blind 0.5 s.
  const queue = (dropBefore: number) => (): Act => {
    const onset = 3.0;
    const qPos = (50 / 3.6) * onset + 180;
    let dropped: number | null = null;
    return {
      speedKmh: stop(50, 8.5, onset),
      leadGapM: (tau, s, k) => {
        if (dropped === null && tau >= onset - dropBefore) dropped = k;
        return dropped === k ? null : qPos - s;
      },
      durationSec: onset + 4,
    };
  };
  it("the act's premise: the queue's demand clears the line and it sits beyond the reach", () => {
    expect(demandOf(50 / 3.6, 180)).toBeGreaterThan(LEAD_DEMAND_LINE_MPS2);
    expect(180).toBeGreaterThan(DEFAULT_RULE_CONFIG.harshBrakeSignalCauseM);
  });
  it("no blink: acquitted at every rate (the demand arm)", () => {
    expect(offenders(queue(-1e9), false)).toEqual([]);
  });
  it("one null frame on the stamp's first frame, and one 0.1 s before it: acquitted at every rate", () => {
    expect(offenders(queue(0), false)).toEqual([]);
    expect(offenders(queue(0.1), false)).toEqual([]);
  });
  it("a silence LONGER than the bridge AND the memory is an absence: the same queue unseen for 1.6 s before the stamp is no cause — convicted", () => {
    const mk = (): Act => {
      const onset = 3.0;
      const qPos = (50 / 3.6) * onset + 180;
      return { speedKmh: stop(50, 8.5, onset), leadGapM: (tau, s) => (tau >= onset - 1.6 ? null : qPos - s), durationSec: onset + 4 };
    };
    expect(offenders(mk, true)).toEqual([]);
  });
});

describe("R2-a — A LEAD WHOSE READINGS ARE NOT BUILT IS A CAUSE (isolated: a re-stage, which is NOT an entry)", () => {
  // The world moves the car 300 m at τ = 2.5 and the lead keeps its place 86 m ahead
  // (a re-stage re-places the scene). The track restarts; the readings need 2W = 1.0 s.
  // A re-stage is not a car pulling out, so the ENTRY memory does not speak.
  const restaged = (stampAfter: number) => (): Act => {
    const steady = leadPos(86, 41.4);
    return {
      speedKmh: stop(58, 9.4, 2.5 + stampAfter),
      leadGapM: (tau, s) => steady(tau) - s,
      durationSec: 2.5 + stampAfter + 4,
    };
  };
  function runRestaged(mk: () => Act, hz: number, phase: number): boolean {
    const act = mk();
    const dt = 1 / hz;
    let state = createRuleEngine();
    let travel = 0;
    let tf = 0;
    let hit = false;
    for (let k = 0; ; k++) {
      const t = k * dt + phase * dt;
      if (t > act.durationSec) break;
      while (tf < t - 1e-12) {
        const h = Math.min(0.0005, t - tf);
        travel += ((act.speedKmh(tf) + act.speedKmh(tf + h)) / 2 / 3.6) * h;
        tf += h;
      }
      const g = act.leadGapM!(t, travel, k);
      const r = reduceTick(
        state,
        tick(t, { speedKmh: act.speedKmh(t), position: { x: 0, y: t < 2.5 ? travel : travel + 300 }, gear: 3, ...(g !== null ? { leadGapM: g } : {}), events: [] }),
      );
      state = r.state;
      for (const e of r.events) if (e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE") hit = true;
    }
    return hit;
  }
  const offendersRestaged = (mk: () => Act, want: boolean): string[] => {
    const out: string[] = [];
    for (const hz of RATES) for (const ph of PHASES) if (runRestaged(mk, hz, ph) !== want) out.push(`${hz}Hz/${ph}`);
    return out;
  };
  it("a stamp 0.3 s after the re-stage, the lead not yet read: acquitted at every rate", () => {
    expect(offendersRestaged(restaged(0.3), false)).toEqual([]);
  });
  it("a stamp 1.5 s after it, the readings built (a steady car, demand 0.14): convicted at every rate", () => {
    expect(offendersRestaged(restaged(1.5), true)).toEqual([]);
  });
  // A BLINK HOLDS THE LEAD'S LAST VERDICT. The same re-staged lead, still unread, drops
  // out of the channel for 0.45 s exactly as the student stamps 0.2 s after the re-stage.
  // UNREAD is the one cause no memory carries, so only the held verdict speaks for the
  // blink; the 0.4 s sustain fills inside it on a desktop.
  const blinkWhileUnread = (): Act => {
    const steady = leadPos(86, 41.4);
    const onset = 2.7;
    return {
      speedKmh: stop(58, 9.4, onset),
      leadGapM: (tau, s) => (tau >= onset && tau < onset + 0.45 ? null : steady(tau) - s),
      durationSec: onset + 4,
    };
  };
  it("a blink of 0.45 s on the stamp, the re-staged lead still unread: the blink holds its last verdict — acquitted at every rate", () => {
    expect(offendersRestaged(blinkWhileUnread, false)).toEqual([]);
  });
  // The same for a FARTHER car in the lead's place — a gap discontinuity the motion
  // cannot explain, outward: the lead 60 m ahead turned off and the channel now reads
  // the next car, 110 m ahead (both steady 41.4 км/ч, demand 0.19 and 0.10). Not a car
  // pulling out in front of the student, so a restart and not an entry.
  const replaced = (stampAfter: number) => (): Act => {
    const near = leadPos(60 + 4.6 * 2.5, 41.4);
    const far = leadPos(110 + 4.6 * 2.5, 41.4);
    return {
      speedKmh: stop(58, 9.4, 2.5 + stampAfter),
      leadGapM: (tau, s) => (tau < 2.5 ? near(tau) : far(tau)) - s,
      durationSec: 2.5 + stampAfter + 4,
    };
  };
  it("a farther car replaces the lead: 0.3 s after, the new lead not yet read — acquitted at every rate", () => {
    expect(offenders(replaced(0.3), false)).toEqual([]);
  });
  it("…1.5 s after, the readings built (a steady car the student is merely faster than) — convicted at every rate", () => {
    expect(offenders(replaced(1.5), true)).toEqual([]);
  });
});

describe("R2-b — A LEAD THAT ENTERED THE CORRIDOR WITHIN 2.0 s IS A CAUSE (isolated: steady, slower, demand < 0.5)", () => {
  // A steady 30 км/ч car appears 70 m ahead of a student at 50 at τ = 1.5. Its closing
  // (5.6 m/s) demands 0.24–0.31 m/s² — under the line — so only its newness can acquit.
  const appears = (stampAfter: number, how: "silence" | "cut-in") => (): Act => {
    const entry = 1.5;
    const lp = (tau: number) => 70 + (50 / 3.6) * entry + (30 / 3.6) * (tau - entry);
    return {
      speedKmh: stop(50, 8.5, entry + stampAfter),
      // «cut-in»: the channel read a far car 160 m ahead until the new one pulled in
      leadGapM: (tau, s) => (tau < entry ? (how === "silence" ? null : 160 + (50 / 3.6) * tau - s) : lp(tau) - s),
      durationSec: entry + stampAfter + 4,
    };
  };
  it("the act's premise: its demand is under the line at both stamps", () => {
    const c = (50 - 30) / 3.6;
    expect(demandOf(c, 70 - c * 1.5)).toBeLessThan(LEAD_DEMAND_LINE_MPS2);
    expect(demandOf(c, 70 - c * 2.6)).toBeLessThan(LEAD_DEMAND_LINE_MPS2);
  });
  it("appeared from an empty corridor, stamp 1.5 s later: acquitted at every rate", () => {
    expect(offenders(appears(1.5, "silence"), false)).toEqual([]);
  });
  it("pulled in front of a far lead (a nearer car — a gap discontinuity the motion cannot explain), stamp 1.5 s later: acquitted", () => {
    expect(offenders(appears(1.5, "cut-in"), false)).toEqual([]);
  });
  it("the memory ends: stamp 2.6 s after it appeared, the student merely faster than it — convicted at every rate", () => {
    expect(offenders(appears(2.6, "silence"), true)).toEqual([]);
  });
  // ROUND 4 (integrator ruling, beyond 120 m base-like acquittal): this act used to be
  // «a car that appears BEYOND the reach is no surprise to stamp for — convicted». The
  // round-3 verifier showed what that cost: one dropped frame or a mild heading weave
  // turns a far lead braking 6 m/s² into a car that has just «appeared», and a lawful
  // stop for it was billed. A12 now spends the unknown on the acquittal beyond the reach
  // too: unread for 1.0 s, entered for 2.0 s (lead-cause-beyond-reach.test.ts has the
  // convicting twin 3.0 s after it appeared).
  it("a car that appears BEYOND the reach (150 m), stamp 0.4 s later — its readings not built: acquitted (round 4)", () => {
    const mk = (): Act => {
      const entry = 1.5;
      const lp = (tau: number) => 150 + (50 / 3.6) * entry + (45 / 3.6) * (tau - entry);
      return { speedKmh: stop(50, 8.5, entry + 0.4), leadGapM: (tau, s) => (tau < entry ? null : lp(tau) - s), durationSec: entry + 4.4 };
    };
    expect(offenders(mk, false)).toEqual([]);
  });
});

describe("R2-b — A LEAD SEEN BRAKING WITHIN 1.0 s IS A CAUSE (isolated: it then leaves the corridor for longer than the bridge)", () => {
  // A lead 90 m ahead brakes 6 m/s² from τ = 1.0; at τ = 2.4 (read braking since ~1.8)
  // it leaves the corridor for good. The student, at 58 км/ч (clear of the 35 км/ч
  // onset floor at every rate), stamps 9.4 m/s² `after` s after it vanished.
  const vanishes = (after: number) => (): Act => {
    const lp = leadPos(90, 50, 1.0, 6);
    return {
      speedKmh: stop(58, 9.4, 2.4 + after),
      leadGapM: (tau, s) => (tau >= 2.4 ? null : lp(tau) - s),
      durationSec: 2.4 + after + 4,
    };
  };
  it("stamp 0.6 s after it vanished — still within a second of being seen braking: acquitted at every rate", () => {
    expect(offenders(vanishes(0.6), false)).toEqual([]);
  });
  it("stamp 1.6 s after it vanished — the memory has run out and the corridor is empty: convicted at every rate", () => {
    expect(offenders(vanishes(1.6), true)).toEqual([]);
  });
});

describe("R2-c — THE DEMAND LINE IS A LIFT OF THE THROTTLE (verifier C1, ported)", () => {
  // Battery section C at 50 км/ч: a stopped queue D m ahead at the stamp, seen for 3 s.
  for (const D of [65, 100, 150, 200]) {
    it(`a stopped queue ${D} m ahead at 50 км/ч (demand ${demandOf(50 / 3.6, D).toFixed(2)}): acquitted at every rate`, () => {
      const mk = (): Act => {
        const onset = 3.0;
        const qPos = (50 / 3.6) * onset + D;
        return { speedKmh: stop(50, 8.5, onset), leadGapM: (_tau, s) => qPos - s, durationSec: onset + 4 };
      };
      expect(offenders(mk, false)).toEqual([]);
    });
  }
  // Battery section A, late reaction: a lead braking 8 m/s² to rest, the student stamping
  // 2.5 s after the lead's onset (≈ 0.76 s after it stopped — its braking memory still on,
  // so the 96 m case also runs 1.5 s later, when only the demand of a car at rest speaks).
  for (const [gap0, late] of [[67, 2.5], [96, 2.5], [96, 3.5]] as const) {
    it(`a lead that braked to rest from ${gap0} m, the student stamping ${late} s after its onset: acquitted`, () => {
      const mk = (): Act => {
        const lp = leadPos(gap0 + 20.8, 50, 1.5, 8); // gap0 at its onset: the student at 50 covers 20.8 m by then
        return { speedKmh: stop(50, 8.5, 1.5 + late), leadGapM: (tau, s) => lp(tau) - s, durationSec: 1.5 + late + 4 };
      };
      expect(offenders(mk, false)).toEqual([]);
    });
  }
  it("the drill's FTG_LEAD (closing 4.6 m/s, 75–90 m, demand 0.13–0.15) is still under the line", () => {
    expect(demandOf(4.6, 75)).toBeLessThan(LEAD_DEMAND_LINE_MPS2);
    expect(demandOf(4.6, 90)).toBeLessThan(LEAD_DEMAND_LINE_MPS2);
  });
});

describe("R2-d — THE LEAD-BRAKING LINE IS PINNED (verifier survivor V4)", () => {
  // A lead 110 m ahead, both at 50 км/ч, brakes a moderate 2.5 m/s² from τ = 2.5 (seen
  // for 2.5 s — not an entry). The student stamps 1.3 s later: the windowed reading has
  // held 2.5 for 0.3 s, and the closing (≈ 3 m/s from 108 m) demands 0.04 — so the
  // braking arm is the only thing that can acquit.
  it("the act's premise: the closing's demand is far under the line", () => {
    expect(demandOf(2.5 * 1.3, 110 - 0.5 * 2.5 * 1.3 * 1.3)).toBeLessThan(0.1);
  });
  it("a lead braking 2.5 m/s² beyond 45 m: acquitted at every rate", () => {
    const mk = (): Act => {
      const lp = leadPos(110, 50, 2.5, 2.5);
      return { speedKmh: stop(50, 8.5, 3.8), leadGapM: (tau, s) => lp(tau) - s, durationSec: 8 };
    };
    expect(offenders(mk, false)).toEqual([]);
  });
});

describe("the ledger's arithmetic, pinned where no drive can reach it", () => {
  it("V5 — a closing whose reaction distance alone eats the gap demands an UNBOUNDED deceleration, never zero", () => {
    // a head-on closing of 52 m/s on a car 50 m ahead: the reaction second covers more than the gap
    const r = leadCauseReadings([{ t: 0, odoM: 0, gapM: 76 }, { t: 0.5, odoM: 12.5, gapM: 50 }], 0.5, 12.5, 50);
    expect(r.closingMps).toBeCloseTo(52, 6);
    expect(r.demandMps2).toBe(Infinity);
  });
  it("V7 — the first qualifying frame credits the span its own reading covers (accelWindowSec's anchor), not one frame", () => {
    // 60 Hz, 58 км/ч, a 9.4 m/s² stamp at τ = 1.0: find the first frame the windowed
    // deceleration reaches the emergency line and read the credit it was given.
    let state: RuleEngineState = createRuleEngine();
    const dt = 1 / 60;
    const v = stop(58, 9.4, 1.0);
    let credit: number | null = null;
    let anchorSpan: number | null = null;
    for (let k = 0; k * dt <= 2 && credit === null; k++) {
      const t = k * dt;
      const before = state.speedWindow.length > 0 ? state.speedWindow : null;
      const r = reduceTick(state, tick(t, { speedKmh: v(t), position: { x: 0, y: 0 }, gear: 3, events: [] }));
      if (r.state.harshBrake.lastQualAt !== null && state.harshBrake.lastQualAt === null) {
        credit = r.state.harshBrake.qualifiedSec;
        // the anchor the reading was taken against: the newest sample at or before t − accelWindowSec
        const w = before!.filter((x) => x.t <= t - DEFAULT_RULE_CONFIG.accelWindowSec + 1e-12);
        anchorSpan = t - (w.length > 0 ? w[w.length - 1].t : before![0].t);
      }
      state = r.state;
    }
    expect(credit).not.toBeNull();
    expect(credit!).toBeGreaterThan(dt * 1.5);
    expect(credit!).toBeCloseTo(anchorSpan!, 9);
  });
});
