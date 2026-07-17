/**
 * ReverseAssist — the auto-reverse state machine (founder 2026-07-17:
 * „стрелката надолу не кара колата назад").
 *
 * Pure timing rules over FUNCTIONAL pedals:
 *  a) D + standstill + brake held ≥ 0.35 s  → "shiftToR"
 *  c) R + standstill + brake held ≥ 0.35 s  → "shiftToD"
 *  suppression: 2 s of silence after any manual selector shift.
 * Rule b (the in-R pedal swap) is applyReversePedalRemap, tested below.
 */

import { describe, expect, it } from "vitest";
import type { SelectorPosition, VehicleInput } from "@/modules/sim/vehicle";
import {
  applyReversePedalRemap,
  REVERSE_ASSIST_HOLD_S,
  REVERSE_ASSIST_SUPPRESS_S,
  ReverseAssist,
  shouldRemapReversePedals,
  type ReverseAssistCommand,
} from "../reverseAssist";

const DT = 0.05; // 20 Hz frames — HOLD_S (0.35) is exactly 7 frames

interface FrameOverrides {
  speedKmh?: number;
  selector?: SelectorPosition;
  brakePedal?: number;
  throttlePedal?: number;
  dtSec?: number;
}

function frame(o: FrameOverrides = {}) {
  return {
    speedKmh: o.speedKmh ?? 0,
    selector: o.selector ?? ("D" as SelectorPosition),
    brakePedal: o.brakePedal ?? 1,
    throttlePedal: o.throttlePedal ?? 0,
    dtSec: o.dtSec ?? DT,
  };
}

/** Run `n` identical frames; returns every non-null command emitted. */
function run(assist: ReverseAssist, n: number, o: FrameOverrides = {}): ReverseAssistCommand[] {
  const out: ReverseAssistCommand[] = [];
  for (let i = 0; i < n; i++) {
    const cmd = assist.update(frame(o));
    if (cmd) out.push(cmd);
  }
  return out;
}

describe("ReverseAssist rule a (D → R)", () => {
  it("emits shiftToR after a continuous 0.35 s brake hold at standstill", () => {
    const a = new ReverseAssist();
    expect(run(a, 6)).toEqual([]); // 0.30 s — not yet
    expect(a.update(frame())).toBe("shiftToR"); // 0.35 s exactly
  });

  it("emits at most once per completed hold (timer resets on emit)", () => {
    const a = new ReverseAssist();
    expect(run(a, 7)).toEqual(["shiftToR"]);
    // Still holding in D (glue failed to shift, hypothetically): a FULL new
    // hold is required before anything fires again.
    expect(run(a, 6)).toEqual([]);
  });

  it("releasing the brake mid-hold resets the timer", () => {
    const a = new ReverseAssist();
    run(a, 5); // 0.25 s in
    a.update(frame({ brakePedal: 0 })); // lift
    expect(run(a, 6)).toEqual([]); // fresh hold — 0.30 s is not enough
    expect(run(a, 1)).toEqual(["shiftToR"]);
  });

  it("does nothing while the car is moving (|speed| ≥ 0.6 km/h)", () => {
    const a = new ReverseAssist();
    expect(run(a, 40, { speedKmh: 0.6 })).toEqual([]);
    expect(run(a, 40, { speedKmh: -5 })).toEqual([]);
  });

  it("held throttle vetoes the toggle (both pedals down is ambiguous)", () => {
    const a = new ReverseAssist();
    expect(run(a, 40, { throttlePedal: 0.5 })).toEqual([]);
  });

  it.each(["P", "N", "M"] as const)("stays silent in selector %s", (selector) => {
    const a = new ReverseAssist();
    expect(run(a, 40, { selector })).toEqual([]);
  });
});

describe("ReverseAssist rule c (R → D)", () => {
  it("emits shiftToD after the (remapped) brake hold at standstill in R", () => {
    const a = new ReverseAssist();
    expect(run(a, 6, { selector: "R" })).toEqual([]);
    expect(a.update(frame({ selector: "R" }))).toBe("shiftToD");
  });

  it("reverse-throttling (functional throttle held) never toggles", () => {
    const a = new ReverseAssist();
    expect(
      run(a, 40, { selector: "R", brakePedal: 0, throttlePedal: 1 }),
    ).toEqual([]);
  });
});

describe("ReverseAssist manual-shift suppression", () => {
  it("stays silent for 2 s after a manual shift, then works again", () => {
    const a = new ReverseAssist();
    a.noteManualShift();
    const silentFrames = Math.ceil(REVERSE_ASSIST_SUPPRESS_S / DT); // 40
    expect(run(a, silentFrames, {})).toEqual([]); // eligible the whole time
    // Suppression consumed — a fresh full hold now fires.
    const holdFrames = Math.ceil(REVERSE_ASSIST_HOLD_S / DT); // 7
    expect(run(a, holdFrames, {})).toEqual(["shiftToR"]);
  });

  it("a manual shift mid-hold drops the accumulated hold time", () => {
    const a = new ReverseAssist();
    run(a, 6); // 0.30 s in
    a.noteManualShift();
    run(a, 40); // burn the 2 s silence
    expect(run(a, 6)).toEqual([]); // needs the FULL 0.35 s again
    expect(run(a, 1)).toEqual(["shiftToR"]);
  });
});

describe("applyReversePedalRemap (rule b)", () => {
  it("swaps throttle and brake in place, leaving steer/handbrake alone", () => {
    const input: VehicleInput = { throttle: 0.8, brake: 0.2, steer: -1, handbrake: true };
    applyReversePedalRemap(input);
    expect(input).toEqual({ throttle: 0.2, brake: 0.8, steer: -1, handbrake: true });
  });
});

describe("shouldRemapReversePedals", () => {
  it("remaps only in R on the automatic box", () => {
    expect(shouldRemapReversePedals("R", "automatic")).toBe(true);
    expect(shouldRemapReversePedals("R", "manual")).toBe(false); // real R semantics
    expect(shouldRemapReversePedals("D", "automatic")).toBe(false);
    expect(shouldRemapReversePedals("P", "automatic")).toBe(false);
    expect(shouldRemapReversePedals("N", "automatic")).toBe(false);
  });
});
