/**
 * THE HARSH-BRAKE CAUSE LEDGER IS THE SAME AT EVERY FRAME RATE
 * (`sc-follow-tailgater:f42dce4f` and `:63c0c28c` C2a — rules/engine.ts
 * `LEAD_TRACK_WINDOW_SEC`, `leadCauseReadings`, and the first-qualifying-frame
 * credit in the sustain).
 *
 * Every drive here is ONE continuous act — a speed profile and a lead profile
 * written as functions of time — sampled at the rates the product is actually
 * fed (2.5 / 2.8 / 4 Hz phones, 10, 30, 60 and 120 Hz), at four phases of the
 * frame. The verdict must not depend on either. Three halves:
 *
 *  1. A12 — every cause the ledger names still acquits a hard stop at EVERY
 *     rate: a lead braking hard beyond the 45 m window, a stopped queue whose
 *     closing demands braking, a forbidding light, an armed crossing, a hazard
 *     event, a stop line and a junction ahead.
 *  2. The row — a student who is merely FASTER than a steady lead 86 m ahead
 *     (closing 4.6 m/s, the drill's `FTG_LEAD`) has no cause, at every rate.
 *  3. The boundary — 7.00 m/s² acquits and 7.01 convicts at every rate here
 *     too (false-positives.test.ts holds it at the fixture rates and is unmoved).
 */

import { describe, expect, it } from "vitest";
import { AMBER_REACTION_SEC } from "../../runtime";
import { PHYSICS_MAX_FRAME_DT } from "../../../../components/sim/lesson-ui/sessionClock";
import {
  LEAD_REACTION_SEC,
  LEAD_TRACK_WINDOW_SEC,
  createRuleEngine,
  leadCauseReadings,
  reduceTick,
} from "../engine";
import type { SimTick, SimTickEvent } from "../types";
import { tick } from "./fixtures";

const RATES = [2.5, 2.8, 4, 10, 30, 60, 120] as const;
const PHASES = [0, 0.11, 0.23, 0.37] as const; // fraction of a frame the act is shifted by

interface Act {
  /** student speed, km/h, at continuous time τ (s) */
  speedKmh: (tau: number) => number;
  /** gap to the lead, m (null = nobody ahead), at τ — given the student's own travel s(τ) */
  leadGapM?: (tau: number, studentTravelM: number, frame: number) => number | null;
  /** the car's world y at τ (default: its own travel) — a re-stage is a jump here */
  positionY?: (tau: number, studentTravelM: number) => number;
  /** extra tick fields at τ */
  extra?: (tau: number) => Partial<SimTick>;
  /** one-shot events at τ ≥ at */
  events?: Array<{ at: number; e: SimTickEvent }>;
  durationSec: number;
}

/** Sample one act at `hz`, shifted by `phase` of a frame, through the reducer. */
function run(act: Act, hz: number, phase: number): string[] {
  const dt = 1 / hz;
  let state = createRuleEngine();
  const codes: string[] = [];
  // the student's own travel, integrated finely and read at each frame
  let travel = 0;
  let tf = 0;
  const fine = 0.0005;
  const fired = new Set<number>();
  for (let k = 0; ; k++) {
    const t = k * dt + phase * dt;
    if (t > act.durationSec) break;
    while (tf < t - 1e-12) {
      const h = Math.min(fine, t - tf);
      travel += ((act.speedKmh(tf) + act.speedKmh(tf + h)) / 2 / 3.6) * h;
      tf += h;
    }
    const events: SimTickEvent[] = [];
    act.events?.forEach((ev, i) => {
      if (t >= ev.at && !fired.has(i)) {
        fired.add(i);
        events.push(ev.e);
      }
    });
    const g = act.leadGapM?.(t, travel, k) ?? null;
    const r = reduceTick(
      state,
      tick(t, {
        speedKmh: act.speedKmh(t),
        position: { x: 0, y: act.positionY?.(t, travel) ?? travel },
        gear: 3,
        ...(g !== null ? { leadGapM: g } : {}),
        ...act.extra?.(t),
        events,
      }),
    );
    state = r.state;
    for (const e of r.events) if (e.kind === "violation") codes.push(e.code);
  }
  return codes;
}

/** A hard stop from `fromKmh` at `decel` m/s², the pedal landing at `onset` s. */
const stop =
  (fromKmh: number, decel: number, onset: number) =>
  (tau: number): number =>
    tau < onset ? fromKmh : Math.max(0, fromKmh - decel * 3.6 * (tau - onset));

/** A lead at `gap0` ahead, cruising at `vKmh`, braking at `decel` from `brakeAt` (s) to rest. */
const leadAhead =
  (gap0: number, vKmh: number, brakeAt = Infinity, decel = 0) =>
  (tau: number, travel: number): number => {
    const v = vKmh / 3.6;
    let s: number;
    if (tau <= brakeAt) s = v * tau;
    else {
      const tb = Math.min(tau - brakeAt, decel > 0 ? v / decel : Infinity);
      s = v * brakeAt + v * tb - 0.5 * decel * tb * tb;
    }
    return gap0 + s - travel;
  };

function verdicts(act: Act): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const hz of RATES) for (const ph of PHASES) out[`${hz}Hz/${ph}`] = run(act, hz, ph).includes("HARSH_BRAKING_NO_CAUSE");
  return out;
}
const all = (v: Record<string, boolean>, want: boolean) => Object.entries(v).filter(([, x]) => x !== want).map(([k]) => k);

describe("the cause ledger's constants are the product's own numbers", () => {
  it("the lead window is the longest frame the session clock can hand the reducer", () => {
    expect(LEAD_TRACK_WINDOW_SEC).toBe(PHYSICS_MAX_FRAME_DT);
  });
  it("the reaction time is the product's one reaction time", () => {
    expect(LEAD_REACTION_SEC).toBe(AMBER_REACTION_SEC);
  });
});

describe("POSITIVE CONTROL — the same hard stop with nothing ahead convicts at every rate and phase", () => {
  it("58 км/ч, 9.4 m/s², an empty road", () => {
    expect(all(verdicts({ speedKmh: stop(58, 9.4, 1.2), durationSec: 5 }), true)).toEqual([]);
  });
});

describe("THE ROW — being faster than a steady lead far ahead is not a cause", () => {
  it("the drill's FTG_LEAD: 11.5 m/s, 86 m ahead, the student at 58 км/ч (closing 4.6 m/s) — convicted at every rate", () => {
    // Followed for 3.2 s before the stamp (round 2: a lead that ENTERED the corridor
    // within LEAD_ENTRY_MEMORY_SEC is a cause, and the drill's lead has been in front
    // of the student for half a minute by the first brake check), 86 m ahead at it.
    const act: Act = { speedKmh: stop(58, 9.4, 3.2), leadGapM: leadAhead(86 + 4.6 * 3.2, 41.4), durationSec: 7 };
    // sanity: the closing the old per-frame clause read as a cause is really there
    const r = leadCauseReadings([{ t: 0, odoM: 0, gapM: 90 }, { t: 0.5, odoM: 8.06, gapM: 87.7 }], 0.5, 8.06, 87.7);
    expect(r.closingMps).toBeCloseTo(4.6, 1);
    expect(r.demandMps2).toBeLessThan(0.2);
    expect(all(verdicts(act), true)).toEqual([]);
  });
});

describe("A12 — every cause still acquits at every rate and phase", () => {
  it("a lead braking hard 60 m ahead — beyond the 45 m window — and the student stamping 0.7 s later", () => {
    const act: Act = { speedKmh: stop(50, 9, 1.7), leadGapM: leadAhead(60, 50, 1.0, 6), durationSec: 5 };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  it("…and the same at 100 m (inside harshBrakeSignalCauseM, the reach a visible light has)", () => {
    const act: Act = { speedKmh: stop(50, 9, 1.7), leadGapM: leadAhead(100, 50, 1.0, 6), durationSec: 5 };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  it("a stopped queue 70 m ahead at 60 км/ч — the closing demands braking, and the stop ends 55 m short of it", () => {
    // Outside the 45 m window for the WHOLE stop (60 км/ч at 9 m/s² takes 15.4 m),
    // so only the demand arm can acquit: 16.7² / 2(70 − 16.7·1.0) = 2.6 m/s² at
    // the pedal, still 2.4 on a 2.5 Hz phone's first braking frame 0.4 s later.
    const act: Act = { speedKmh: stop(60, 9, 1.0), leadGapM: leadAhead(70 + (60 / 3.6) * 1.0, 0), durationSec: 5 };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  it("a forbidding light 70 m ahead", () => {
    const act: Act = {
      speedKmh: stop(55, 9, 1.0),
      extra: () => ({ nextStopLineM: 70, nextStopLineControl: "trafficLight", nextStopLineState: "yellow" }),
      durationSec: 5,
    };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  it("an armed crossing (pedestrian on the zebra)", () => {
    const act: Act = {
      speedKmh: stop(45, 9, 1.0),
      events: [{ at: 0.8, e: { kind: "crossingZoneEntered", crossingId: "x1", pedestrianOnCrossing: true } }],
      durationSec: 5,
    };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  it("a hazard-shaped event (a priority situation) just before", () => {
    const act: Act = {
      speedKmh: stop(50, 9, 1.0),
      events: [{ at: 0.6, e: { kind: "prioritySituation", situation: "rightHand", violated: false } }],
      durationSec: 5,
    };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  it("a stop line 50 m ahead", () => {
    const act: Act = { speedKmh: stop(50, 9, 1.0), extra: () => ({ nextStopLineM: 50 }), durationSec: 5 };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  it("a junction 30 m ahead", () => {
    const act: Act = { speedKmh: stop(50, 9, 1.0), extra: () => ({ nextJunctionM: 30 }), durationSec: 5 };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  it("a lead inside the 45 m window, steady — the distance clause, unchanged", () => {
    const act: Act = { speedKmh: stop(50, 9, 1.0), leadGapM: leadAhead(40, 50), durationSec: 5 };
    expect(all(verdicts(act), false)).toEqual([]);
  });
});

describe("THE BOUNDARY — 7.00 acquits, 7.01 convicts, at every rate and phase", () => {
  it("7.00 m/s² from 60 км/ч on an empty road", () => {
    expect(all(verdicts({ speedKmh: stop(60, 7.0, 1.0), durationSec: 5 }), false)).toEqual([]);
  });
  it("7.01 m/s² from 60 км/ч on an empty road", () => {
    expect(all(verdicts({ speedKmh: stop(60, 7.01, 1.0), durationSec: 5 }), true)).toEqual([]);
  });
});

describe("the lead readings are rate-free", () => {
  it("closing and the lead's own deceleration read the same at every rate (a lead braking at 6 m/s² 60 m ahead)", () => {
    const at = 1.6; // s — 0.6 s into the lead's brake
    const studentKmh = 50;
    const gap = leadAhead(60, 50, 1.0, 6);
    const readings = RATES.map((hz) => {
      const track: Array<{ t: number; odoM: number; gapM: number }> = [];
      const dt = 1 / hz;
      let last = { t: 0, odo: 0, g: 0 };
      for (let k = 0; k * dt <= at + 1e-9; k++) {
        const t = k * dt;
        const odo = (studentKmh / 3.6) * t;
        const g = gap(t, odo);
        track.push({ t, odoM: odo, gapM: g });
        last = { t, odo, g };
      }
      return { hz, ...leadCauseReadings(track, last.t, last.odo, last.g), t: last.t };
    });
    // compare against the analytic values at each rate's own last frame time
    for (const r of readings) {
      expect(r.leadDecelMps2, `${r.hz} Hz`).not.toBeNull();
      // the lead has braked for ≥ one window by then at every rate: its windowed deceleration is ~6
      expect(r.leadDecelMps2!, `${r.hz} Hz`).toBeGreaterThan(2);
    }
    const c = readings.map((r) => r.closingMps!);
    const expected = readings.map((r) => {
      const W = LEAD_TRACK_WINDOW_SEC;
      return (gap(r.t - W, (studentKmh / 3.6) * (r.t - W)) - gap(r.t, (studentKmh / 3.6) * r.t)) / W;
    });
    // linear interpolation of a braking lead's quadratic gap errs by at most a·dt²/8 per end:
    // 6 · 0.4² / 8 / 0.5 = 0.24 m/s at 2.5 Hz, and less at every finer rate
    c.forEach((x, i) => expect(Math.abs(x - expected[i]), `${readings[i].hz} Hz`).toBeLessThan(0.25));
  });
});

describe("what is NOT a lead cause, at every rate and phase (each one an escape the windowed ledger closes)", () => {
  it("a 10 cm frame-to-frame wobble in the gap reading is not a closing — a rate over a frame would make it one at 120 Hz", () => {
    const steady = leadAhead(86 + 4.6 * 3.2, 41.4); // followed 3.2 s, as in THE ROW
    const act: Act = { speedKmh: stop(58, 9.4, 3.2), leadGapM: (tau, s, k) => steady(tau, s) + (k % 2 === 0 ? 0.1 : -0.1), durationSec: 7 };
    expect(all(verdicts(act), true)).toEqual([]);
  });
  it("a hard launch TOWARDS a steady lead is not the lead braking — its speed is the student's travel plus the gap, not the gap alone", () => {
    // 2.5 m/s² from 30 to 58 км/ч, then the stamp; the lead cruises 41.4 км/ч 80 m ahead
    const launch = (tau: number): number => {
      const v = Math.min(58, 30 + 2.5 * 3.6 * tau);
      const reached = (58 - 30) / (2.5 * 3.6);
      return tau < reached ? v : stop(58, 9.4, reached)(tau);
    };
    const act: Act = { speedKmh: launch, leadGapM: leadAhead(80, 41.4), durationSec: 6 };
    expect(all(verdicts(act), true)).toEqual([]);
  });
  // ROUND 3 (integrator ruling F1): this act used to CONVICT — rounds 1–2 asked «is it
  // braking?» only within harshBrakeSignalCauseM (120 m). The ruling is base's own: a
  // lead braking at or above the braking line is a cause at ANY range, so a stamp 0.7 s
  // after a lead 150 m ahead brakes 6 m/s² is acquitted, and at every rate. (The lead
  // has been seen only 1.7 s, too short for the far reading — the quick one speaks for
  // a young track; see the ledger's ROUND 3 note and lead-cause-far-and-entry.test.ts.)
  it("a lead braking 150 m ahead is a cause like any braking lead (ruling F1 — the reach no longer limits it): acquitted at every rate", () => {
    const act: Act = { speedKmh: stop(50, 9, 1.7), leadGapM: leadAhead(150, 50, 1.0, 6), durationSec: 5 };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  // ROUND 4 (integrator ruling, beyond 120 m base-like acquittal): this act used to
  // CONVICT. Beyond harshBrakeSignalCauseM a lead whose WINDOWED closing is at
  // harshBrakeClosingLeadMps (3 m/s, base's own line) or more is a cause again — so the
  // drill's steady lead closed at 4.6 m/s, if it is 150 m ahead rather than 86, acquits,
  // the same at every rate. Its twin, closed at 2.0 m/s (under the line), convicts.
  it("…a STEADY lead 150 m ahead closed at 4.6 m/s (≥ the 3 m/s closing line, beyond the reach): acquitted at every rate", () => {
    const act: Act = { speedKmh: stop(58, 9.4, 3.2), leadGapM: leadAhead(150 + 4.6 * 3.2, 41.4), durationSec: 7 };
    expect(all(verdicts(act), false)).toEqual([]);
  });
  it("…and a STEADY lead 150 m ahead closed at only 2.0 m/s is still no cause: convicted at every rate", () => {
    const act: Act = { speedKmh: stop(58, 9.4, 3.2), leadGapM: leadAhead(150 + 2.0 * 3.2, 58 - 2.0 * 3.6), durationSec: 7 };
    expect(all(verdicts(act), true)).toEqual([]);
  });
  // ROUND 2 (integrator rulings R2-a/R2-b): these two acts used to CONVICT a stamp
  // right after the event, because the track was empty and an empty track read as no
  // cause. A12 spends that unknown on the acquittal now — a lead whose readings are
  // not built yet is a cause, and so is one that has just entered the corridor — so
  // each act is asked twice: right after the event (acquitted) and once the readings
  // are built (judged on them, and a steady car the student is merely faster than is
  // still no cause). What has NOT changed is the point of both tests: no closing is
  // ever read ACROSS the event.
  const restage = (stampAfter: number): Act => ({
    // the world moves the car 300 m at τ = 1.0 s; the lead channel reads 150 m before and, after it,
    // a steady 41.4 км/ч car that was 60 m ahead at the jump (the student had covered 15.28 m by then)
    speedKmh: stop(55, 9.4, 1.0 + stampAfter),
    positionY: (tau, s) => (tau < 1.0 ? s : s + 300),
    leadGapM: (tau, s) => (tau < 1.0 ? 150 : 60 + (41.4 / 3.6) * (tau - 1.0) - (s - (55 / 3.6) * 1.0)),
    durationSec: 4 + stampAfter,
  });
  it("the gap across a re-stage is two different roads: 0.3 s after it the lead is UNREAD, which is a cause (R2-a)", () => {
    expect(all(verdicts(restage(0.3)), false)).toEqual([]);
  });
  it("…and 1.5 s after it the readings are built and show a steady car, not a closing across the jump — convicted", () => {
    expect(all(verdicts(restage(1.5)), true)).toEqual([]);
  });
  const comesBack = (stampAfter: number): Act => ({
    // seen at 150 m, gone for 2 s, back at 70 m (a different, steady 41.4 км/ч car)
    speedKmh: stop(55, 9.4, 3.0 + stampAfter),
    leadGapM: (tau, s) => (tau < 1.0 ? 150 : tau < 3.0 ? null : 70 + (41.4 / 3.6) * (tau - 3.0) - (s - (55 / 3.6) * 3.0)),
    durationSec: 6 + stampAfter,
  });
  it("a lead that left the channel and came back is a new lead: as the student stamps it has just ENTERED, a cause (R2-b)", () => {
    expect(all(verdicts(comesBack(0.05)), false)).toEqual([]);
  });
  it("…and 3.0 s after it came back (past the 2.0 s memory by more than a phone frame either side) it is a steady car the student is merely faster than (demand 0.13) — convicted", () => {
    expect(all(verdicts(comesBack(3.0)), true)).toEqual([]);
  });
});
