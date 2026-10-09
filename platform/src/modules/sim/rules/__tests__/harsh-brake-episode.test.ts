/**
 * ONE ANSWER TO «WAS THAT BRAKE HARSH?» — `harshBrakeEpisode.ts` held to the
 * rule engine's own causeless-harsh-brake ledger (sc-ac-wind-truck-pass:ff1d4290
 * round 3; the integrator's decision D2 of 2026-10-08).
 *
 * The truck-pass lesson bills «водачът му трябваше да спира рязко» only when the
 * overtaken truck REALLY braked hard for the student, and «hard» has to be the
 * product's word, not a new one. The engine already convicts the student's own
 * brake by it (HARSH_BRAKING_NO_CAUSE: over `harshBrakeDecelMps2` 7 m/s² for
 * `harshBrakeSustainSec` 0.4 s, mean exclusive, read over `accelWindowSec`). The
 * runner asks the same question of the truck's account through
 * `stepHarshBrakeTrack`. This file drives BOTH over the same speed traces —
 * the engine through `reduceTick` exactly as a session does, the step on the
 * same trace read as speed lost — and requires the same verdict, on the same
 * frame or the next, on every row: the A12 rows (under, on and over the line;
 * a spike; an emergency stop after a gentle brake) and the rows the truck
 * actually produces (8 m/s² for 12–60 frames — the guard's brake — including
 * the 23- and 24-frame brakes that straddle the sustain).
 */

import { describe, expect, it } from "vitest";
import { isHarshBrakeWindow, newHarshBrakeTrack, stepHarshBrakeTrack } from "../harshBrakeEpisode";
import { DEFAULT_RULE_CONFIG } from "../types";
import { drive, tick } from "./fixtures";

const LINE = {
  harshBrakeDecelMps2: DEFAULT_RULE_CONFIG.harshBrakeDecelMps2,
  harshBrakeSustainSec: DEFAULT_RULE_CONFIG.harshBrakeSustainSec,
  accelWindowSec: DEFAULT_RULE_CONFIG.accelWindowSec,
};

/** A speed trace at `hz`: `v0` km/h for 0.5 s, then each segment [decel m/s², seconds], then held. */
function trace(hz: number, v0Kmh: number, segments: Array<[number, number]>, tailSec = 1.5): Array<{ t: number; kmh: number }> {
  const out: Array<{ t: number; kmh: number }> = [];
  const dt = 1 / hz;
  let v = v0Kmh / 3.6;
  let i = 0;
  const lead = Math.round(0.5 * hz);
  for (let k = 0; k <= lead; k++) out.push({ t: (i++) * dt, kmh: v * 3.6 });
  for (const [decel, sec] of segments) {
    const n = Math.round(sec * hz);
    for (let k = 0; k < n; k++) {
      v = Math.max(0, v - decel * dt);
      out.push({ t: (i++) * dt, kmh: v * 3.6 });
    }
  }
  const tail = Math.round(tailSec * hz);
  for (let k = 0; k < tail; k++) out.push({ t: (i++) * dt, kmh: v * 3.6 });
  return out;
}

/** The engine's verdict: the time HARSH_BRAKING_NO_CAUSE is pushed, or null. */
function engineFires(tr: Array<{ t: number; kmh: number }>): number | null {
  const { events } = drive(tr.map((s) => tick(s.t, { speedKmh: s.kmh, maxSpeedKmh: 130, gear: 3 })));
  const e = events.find((x) => x.code === "HARSH_BRAKING_NO_CAUSE");
  return e ? e.t : null;
}

/** The step's verdict on the same trace, read as speed LOST since the start. */
function stepFires(tr: Array<{ t: number; kmh: number }>): number | null {
  const track = newHarshBrakeTrack();
  const v0 = tr[0]!.kmh / 3.6;
  for (const s of tr) {
    if (stepHarshBrakeTrack(track, s.t, v0 - s.kmh / 3.6, LINE) !== null) return s.t;
  }
  return null;
}

const ROWS: Array<[string, Array<[number, number]>]> = [
  ["firm 4.5 m/s² for 2 s", [[4.5, 2]]],
  ["5 m/s² for 1.5 s", [[5, 1.5]]],
  ["6.99 m/s² for 1.5 s", [[6.99, 1.5]]],
  ["7.00 m/s² for 1.5 s (on the line: acquits)", [[7, 1.5]]],
  ["7.01 m/s² for 1.5 s", [[7.01, 1.5]]],
  ["7.5 m/s² for 1 s", [[7.5, 1]]],
  ["9 m/s² for 1 s", [[9, 1]]],
  ["5 m/s² with one 9 m/s² frame", [[5, 0.5], [9, 1 / 60], [5, 0.5]]],
  ["9 m/s² for 0.2 s, then 5", [[9, 0.2], [5, 1]]],
  // From 100 км/ч so the emergency half starts over the engine's 35 км/ч floor
  // (the floor is the one thing the step does not apply — see the last block).
  ["emergency 9 after 2 s of gentle 5, from 100 км/ч", [[5, 2], [9, 1]]],
];
// The truck's own guard: 8 m/s² for n whole frames, then released.
for (const n of [12, 18, 20, 22, 23, 24, 25, 26, 30, 45, 60]) ROWS.push([`guard 8 m/s² for ${n} frames`, [[8, n / 60]]]);

/**
 * How far apart the two convictions may land: the next frame — except on the
 * one row whose window RE-ANCHORS (a long gentle brake before the emergency):
 * there the window is re-opened every 0.4 s through the gentle half, and the
 * engine's bare `>=` on a sum of frames re-opens it on the 24th frame or the
 * 25th as the sum rounds, where the step's tie rule always takes the 24th — so
 * the same conviction can land a few frames apart. Both convict.
 */
const slack = (name: string, hz: number): number => (/after 2 s of gentle/.test(name) ? 0.15 : 1 / hz + 1e-9);

describe("the step's verdict IS the engine's, on every row, at 60 Hz", () => {
  for (const [name, segs] of ROWS) {
    it(name, () => {
      const tr = trace(60, /100 км/.test(name) ? 100 : 60, segs);
      const eng = engineFires(tr);
      const st = stepFires(tr);
      expect(st === null, `engine ${eng}, step ${st}`).toBe(eng === null);
      if (eng !== null && st !== null) expect(Math.abs(eng - st)).toBeLessThanOrEqual(slack(name, 60));
    });
  }
});

describe("…and at the frame rates the A12 battery measured (30 / 120 Hz) on the rows away from the tie", () => {
  for (const hz of [30, 120]) {
    for (const [name, segs] of ROWS.filter(([n]) => !/guard 8 m\/s² for 2[2-6] frames/.test(n))) {
      it(`${hz} Hz — ${name}`, () => {
        const tr = trace(hz, /100 км/.test(name) ? 100 : 60, segs);
        const eng = engineFires(tr);
        const st = stepFires(tr);
        expect(st === null, `engine ${eng}, step ${st}`).toBe(eng === null);
        if (eng !== null && st !== null) expect(Math.abs(eng - st)).toBeLessThanOrEqual(slack(name, hz));
      });
    }
  }
});

describe("what the rows mean for the truck", () => {
  it("THE ONE STATED DIFFERENCE: the engine's 35 км/ч onset floor (a student's clumsy low-speed stab) is not applied to another vehicle's account — a hard brake from 30 км/ч is harsh for the truck", () => {
    expect(DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh).toBe(35);
    const tr = trace(60, 30, [[8, 0.6]]);
    expect(engineFires(tr)).toBeNull();
    expect(stepFires(tr)).not.toBeNull();
  });

  it("a guard brake must be held 0.4 s from the frame its reading opens the window: 8 m/s² over 23 frames acquits, 25 convicts", () => {
    expect(stepFires(trace(60, 40, [[8, 23 / 60]]))).toBeNull();
    expect(stepFires(trace(60, 40, [[8, 25 / 60]]))).not.toBeNull();
  });

  it("the window predicate: both halves of the sustain, the exact tie held, the mean exclusive", () => {
    expect(isHarshBrakeWindow({ heldSec: 0.4, qualifiedSec: 0.4, meanDecelMps2: 8 }, LINE)).toBe(true);
    expect(isHarshBrakeWindow({ heldSec: 0.39999999999999997, qualifiedSec: 0.4, meanDecelMps2: 8 }, LINE)).toBe(true);
    expect(isHarshBrakeWindow({ heldSec: 0.39, qualifiedSec: 0.4, meanDecelMps2: 8 }, LINE)).toBe(false);
    expect(isHarshBrakeWindow({ heldSec: 0.4, qualifiedSec: 0.39, meanDecelMps2: 8 }, LINE)).toBe(false);
    expect(isHarshBrakeWindow({ heldSec: 0.4, qualifiedSec: 0.4, meanDecelMps2: 7 }, LINE)).toBe(false);
    expect(isHarshBrakeWindow({ heldSec: 0.4, qualifiedSec: 0.4, meanDecelMps2: 7.0001 }, LINE)).toBe(true);
  });
});
