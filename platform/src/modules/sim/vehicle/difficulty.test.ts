import { describe, expect, it } from "vitest";
import {
  applyDifficulty,
  createDriveAssistState,
  DIFFICULTY_PRESETS,
} from "./difficulty";
import type { VehicleInput } from "./VehicleSim";

const FULL: VehicleInput = { throttle: 1, brake: 0, steer: 1, handbrake: false };
const DT = 1 / 60;

describe("applyDifficulty", () => {
  it("beginner halves+eases throttle vs advanced (full)", () => {
    const b = applyDifficulty(FULL, "beginner", 0, DT, createDriveAssistState());
    // beginner: 1^2 * 0.5 = 0.5
    expect(b.throttle).toBeCloseTo(0.5, 5);
    const a = applyDifficulty(FULL, "advanced", 0, DT, createDriveAssistState());
    expect(a.throttle).toBeCloseTo(1, 5);
  });

  it("eased curve makes partial throttle gentler in beginner", () => {
    // input 0.5: beginner 0.5^2*0.5 = 0.125 ; advanced linear 0.5
    const b = applyDifficulty(
      { ...FULL, throttle: 0.5 },
      "beginner",
      0,
      DT,
      createDriveAssistState(),
    );
    expect(b.throttle).toBeCloseTo(0.125, 5);
  });

  it("governor cuts throttle to zero at/over the speed cap", () => {
    const cap = DIFFICULTY_PRESETS.beginner.speedCapKmh!;
    const atCap = applyDifficulty(FULL, "beginner", cap, DT, createDriveAssistState());
    expect(atCap.throttle).toBe(0);
    const over = applyDifficulty(FULL, "beginner", cap + 20, DT, createDriveAssistState());
    expect(over.throttle).toBe(0);
    // well below cap: full (halved) throttle available
    const below = applyDifficulty(FULL, "beginner", 10, DT, createDriveAssistState());
    expect(below.throttle).toBeCloseTo(0.5, 5);
  });

  it("advanced has no speed governor", () => {
    const fast = applyDifficulty(FULL, "advanced", 200, DT, createDriveAssistState());
    expect(fast.throttle).toBeCloseTo(1, 5);
  });

  it("steering low-passes toward the (scaled) target over time", () => {
    const state = createDriveAssistState();
    const first = applyDifficulty(FULL, "beginner", 0, DT, state).steer;
    // one 1/60s step with tau 0.25 → far from the 0.6 target
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.6);
    // many steps → converges to steerSens (0.6)
    let s = first;
    for (let i = 0; i < 200; i++) s = applyDifficulty(FULL, "beginner", 0, DT, state).steer;
    expect(s).toBeCloseTo(0.6, 2);
  });

  it("brake and handbrake pass through", () => {
    const r = applyDifficulty(
      { throttle: 0, brake: 0.8, steer: 0, handbrake: true },
      "normal",
      0,
      DT,
      createDriveAssistState(),
    );
    expect(r.brake).toBeCloseTo(0.8, 5);
    expect(r.handbrake).toBe(true);
  });
});
