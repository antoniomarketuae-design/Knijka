import { describe, expect, it } from "vitest";
import { REVERSE_ASSIST_HOLD_S, REVERSE_ASSIST_STANDSTILL_KMH } from "../../engine";
import {
  STANDSTILL_BRAKE_OFF_S,
  STANDSTILL_BRAKE_ON_S,
  STOP_SPEED_MS,
  createDriveScript,
  currentStep,
  parseDriveScript,
  stepDriveScript,
  stepLabel,
  targetSpeedMs,
  type DriveScriptState,
  type DriveStep,
} from "../driveScript";

/**
 * The controller is the reason this rig exists: the previous wave's OPEN-LOOP
 * rig arrived at a give-way point at 37 km/h on a drive that called for a stop,
 * so a fault card there could not be ruled either way. These tests hold it to
 * the specification — „hold 20 km/h, brake to 0 at x, wait N seconds, then go"
 * — against a toy longitudinal plant, so the claim is measured, not asserted.
 */

const KMH = 3.6;

/**
 * Toy plant: throttle accelerates at 3 m/s², brake decelerates at 6 m/s², plus
 * a little drag. Deliberately NOT the real VehicleSim — the point is that the
 * controller reaches its targets on ANY plant in that envelope, which is what
 * makes a scripted drive reproducible across tiers and surfaces.
 */
function simulate(
  steps: readonly DriveStep[],
  opts: { seconds: number; dt?: number; headingRad?: number } = { seconds: 30 },
): {
  state: DriveScriptState;
  trace: Array<{ t: number; speedKmh: number; x: number; y: number; step: number }>;
} {
  const dt = opts.dt ?? 1 / 60;
  const heading = opts.headingRad ?? 0; // +y
  let state = createDriveScript(steps, 0);
  let v = 0; // m/s
  let x = 0;
  let y = 0;
  const trace: Array<{ t: number; speedKmh: number; x: number; y: number; step: number }> = [];
  for (let t = 0; t <= opts.seconds; t += dt) {
    const res = stepDriveScript(state, { t, speedKmh: v * KMH, x, y });
    state = res.state;
    const a = res.command.throttle * 3 - res.command.brake * 6 - 0.15 * v;
    v = Math.max(0, v + a * dt);
    x += Math.sin(heading) * v * dt;
    y += Math.cos(heading) * v * dt;
    trace.push({ t, speedKmh: v * KMH, x, y, step: state.index });
    if (state.finished) break;
  }
  return { state, trace };
}

describe("targetSpeedMs", () => {
  it("returns the cruise cap when the step has no stop point", () => {
    expect(targetSpeedMs({ speedKmh: 36 }, { t: 0, speedKmh: 0, x: 0, y: 0 })).toBeCloseTo(10, 6);
  });

  it("ramps down toward a stop point and reaches zero at it", () => {
    const step: DriveStep = { speedKmh: 50, stopAt: { x: 0, y: 100 }, withinM: 2 };
    const far = targetSpeedMs(step, { t: 0, speedKmh: 0, x: 0, y: 0 });
    const near = targetSpeedMs(step, { t: 0, speedKmh: 0, x: 0, y: 90 });
    const at = targetSpeedMs(step, { t: 0, speedKmh: 0, x: 0, y: 100 });
    expect(far).toBeCloseTo(50 / KMH, 6); // capped by cruise 100 m out
    expect(near).toBeLessThan(far);
    expect(near).toBeGreaterThan(0);
    expect(at).toBe(0);
  });
});

describe("hold a speed", () => {
  it("settles on 20 km/h and stays there (±1.5 km/h)", () => {
    const { trace } = simulate([{ label: "hold", speedKmh: 20, forSec: 25 }], { seconds: 26 });
    const settled = trace.filter((s) => s.t > 8 && s.t < 24);
    expect(settled.length).toBeGreaterThan(500);
    for (const s of settled) expect(Math.abs(s.speedKmh - 20)).toBeLessThan(1.5);
  });

  it("holds 50 km/h too — the gain is not tuned to one speed", () => {
    const { trace } = simulate([{ speedKmh: 50, forSec: 30 }], { seconds: 31 });
    const settled = trace.filter((s) => s.t > 15);
    for (const s of settled) expect(Math.abs(s.speedKmh - 50)).toBeLessThan(2);
  });
});

describe("brake to 0 at a point — the B15 failure mode", () => {
  const steps: DriveStep[] = [
    { label: "approach", speedKmh: 20, stopAt: { x: 0, y: 60 }, withinM: 2 },
    { label: "wait", speedKmh: 0, forSec: 40 },
    { label: "go", speedKmh: 25, forSec: 5 },
  ];

  it("arrives at the stop point at ~0 km/h, not at 37", () => {
    const { state, trace } = simulate(steps, { seconds: 120 });
    const handover = state.log[0];
    expect(handover).toBeDefined();
    expect(handover!.reason).toBe("stopped");
    expect(handover!.speedKmh).toBeLessThan(STOP_SPEED_MS * KMH);
    expect(Math.abs(handover!.y - 60)).toBeLessThanOrEqual(2);
    // …and it never blew through the point at speed on the way in: every frame
    // of the approach step stayed short of the far edge of the tolerance ring.
    const approach = trace.filter((s) => s.step === 0);
    expect(approach.length).toBeGreaterThan(100);
    expect(Math.max(...approach.map((s) => s.y))).toBeLessThanOrEqual(62);
  });

  it("actually waits forty seconds standing still", () => {
    const { state, trace } = simulate(steps, { seconds: 120 });
    const wait = state.log[1];
    expect(wait).toBeDefined();
    expect(wait!.reason).toBe("forSec");
    expect(wait!.endedAtSec - wait!.startedAtSec).toBeGreaterThanOrEqual(40);
    const during = trace.filter((s) => s.t > wait!.startedAtSec + 1 && s.t < wait!.endedAtSec);
    expect(during.length).toBeGreaterThan(1000);
    for (const s of during) expect(s.speedKmh).toBeLessThan(1);
    // …and does not creep: the whole wait happens within a few cm of one spot.
    const ys = during.map((s) => s.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.1);
  });

  it("then goes, and the script finishes", () => {
    const { state } = simulate(steps, { seconds: 120 });
    expect(state.finished).toBe(true);
    expect(state.log.map((l) => l.label)).toEqual(["approach", "wait", "go"]);
  });
});

describe("the standstill hold must not trip the auto-reverse assist", () => {
  /**
   * MEASURED, not theorised. The first forty-second wait this rig ever drove
   * held full brake at a stop line; `gear` flipped 1 → -1 exactly
   * REVERSE_ASSIST_HOLD_S after the wheels stopped and the car accelerated
   * BACKWARDS to 16.8 km/h into a collision, because in R the pedals swap and a
   * held brake is a floored reverse accelerator (engine/reverseAssist.ts).
   *
   * The constants are imported from the assist itself so that re-tuning the
   * assist breaks this test rather than silently breaking every scripted wait.
   */
  it("never applies the brake continuously for REVERSE_ASSIST_HOLD_S", () => {
    expect(STANDSTILL_BRAKE_ON_S).toBeLessThan(REVERSE_ASSIST_HOLD_S);
    expect(STANDSTILL_BRAKE_OFF_S).toBeGreaterThan(0);

    // Replay a stationary car through a 40 s wait and measure the longest run
    // of consecutive braking frames, in seconds, the way the assist counts it.
    const dt = 1 / 60;
    let state = createDriveScript([{ label: "wait", speedKmh: 0, forSec: 40 }], 0);
    let longestHold = 0;
    let hold = 0;
    let released = false;
    for (let t = 0; t <= 40; t += dt) {
      const res = stepDriveScript(state, { t, speedKmh: 0, x: 0, y: 0 });
      state = res.state;
      // The assist's own test: |v| below standstill, functional brake > 0.1.
      if (res.command.brake > 0.1 && Math.abs(0) < REVERSE_ASSIST_STANDSTILL_KMH) {
        hold += dt;
        longestHold = Math.max(longestHold, hold);
      } else {
        hold = 0;
        released = true;
      }
    }
    expect(released).toBe(true);
    expect(longestHold).toBeLessThan(REVERSE_ASSIST_HOLD_S);
  });

  /**
   * B15, 2026-08-04 — the SAME defect one layer up, and the single-step test
   * above could never see it. The row is closed by photographs at 4 / 8 / 40 /
   * 60 s and the rig shoots a frame on every step handover, so his wait is
   * SIXTEEN steps, not one. Each transition used to reset the duty cycle to
   * "pedal down, phase 0" without lifting the pedal, so a handover landing
   * mid-ON-phase fused two ON phases into a hold of up to 2 × ON = 0.44 s >
   * REVERSE_ASSIST_HOLD_S. Measured on sc-roundabout-entry@L1 before this fix:
   * gear 1 → -1 at t=41.670 s, then 25 km/h BACKWARDS down the approach arm.
   */
  it("never applies it for that long ACROSS A STEP HANDOVER either", () => {
    const dt = 1 / 60;
    // Sixteen short waits — B15's own shape, and handovers land at every phase
    // of the duty cycle because 2.0 s is not a whole number of 0.34 s cycles.
    const steps = Array.from({ length: 16 }, (_, i) => ({ label: `wait ${i}`, speedKmh: 0, forSec: 2 }));
    let state = createDriveScript(steps, 0);
    let longestHold = 0;
    let hold = 0;
    let handovers = 0;
    for (let t = 0; t <= 33; t += dt) {
      const res = stepDriveScript(state, { t, speedKmh: 0, x: 0, y: 0 });
      state = res.state;
      if (res.transitioned) handovers += 1;
      if (res.command.brake > 0.1) {
        hold += dt;
        longestHold = Math.max(longestHold, hold);
      } else hold = 0;
    }
    expect(handovers).toBe(16);
    expect(longestHold).toBeLessThan(REVERSE_ASSIST_HOLD_S);
  });

  it("still keeps the pedal down most of the time (it is a hold, not a coast)", () => {
    const dt = 1 / 60;
    let state = createDriveScript([{ speedKmh: 0, forSec: 10 }], 0);
    let braked = 0;
    let frames = 0;
    for (let t = 0; t <= 10; t += dt) {
      const res = stepDriveScript(state, { t, speedKmh: 0, x: 0, y: 0 });
      state = res.state;
      frames += 1;
      if (res.command.brake > 0.1) braked += 1;
    }
    expect(braked / frames).toBeGreaterThan(0.55);
  });

  it("holdBrake opts into the continuous hold a real student applies", () => {
    // The pulse is a workaround for a defect that is now fixed at the root
    // (engine/reverseAssist.ts LAWS 1 and 2), and a workaround that cannot be
    // switched off cannot photograph the fix. This flag is how the Б2 proof
    // drive stands on the pedal for thirty seconds without lifting it once.
    const dt = 1 / 60;
    let state = createDriveScript([{ speedKmh: 0, forSec: 30, holdBrake: true }], 0);
    let frames = 0;
    let braked = 0;
    for (let t = 0; t <= 30; t += dt) {
      const res = stepDriveScript(state, { t, speedKmh: 0, x: 0, y: 0 });
      state = res.state;
      frames += 1;
      if (res.command.brake === 1) braked += 1;
      expect(res.command.throttle).toBe(0);
    }
    expect(braked).toBe(frames); // not one lifted frame in thirty seconds
  });

  it("holdBrake survives a step handover — the fused hold B15 could not do", () => {
    const dt = 1 / 60;
    const steps = Array.from({ length: 8 }, (_, i) => ({
      label: `wait ${i}`,
      speedKmh: 0,
      forSec: 2,
      holdBrake: true,
    }));
    let state = createDriveScript(steps, 0);
    let handovers = 0;
    let lifted = 0;
    for (let t = 0; t <= 17; t += dt) {
      const res = stepDriveScript(state, { t, speedKmh: 0, x: 0, y: 0 });
      state = res.state;
      if (res.transitioned) handovers += 1;
      if (!state.finished && res.command.brake < 1) lifted += 1;
    }
    expect(handovers).toBe(8);
    expect(lifted).toBe(0);
  });

  it("a car rolling BACKWARDS is braked, not ignored (signed speed)", () => {
    // max(0, speedKmh) was the first spelling: a car reversing at 16 km/h read
    // as 0 km/h, matched the target, and got no pedal at all.
    const state = createDriveScript([{ speedKmh: 0, forSec: 40 }], 0);
    const res = stepDriveScript(state, { t: 0.1, speedKmh: -16, x: 0, y: 0 });
    expect(res.command.brake).toBeGreaterThan(0.9);
    expect(res.command.throttle).toBe(0);
  });
});

describe("terminators", () => {
  it("untilNear ends the step on arrival without braking", () => {
    const { state } = simulate(
      [{ label: "roll", speedKmh: 30, untilNear: { x: 0, y: 40 }, withinM: 3 }],
      { seconds: 60 },
    );
    expect(state.log[0]!.reason).toBe("near");
    expect(state.log[0]!.speedKmh).toBeGreaterThan(20);
  });

  it("forSec caps a positional step that can never arrive", () => {
    const { state } = simulate(
      [{ label: "nowhere", speedKmh: 10, stopAt: { x: 9999, y: 9999 }, forSec: 6 }],
      { seconds: 20 },
    );
    expect(state.log[0]!.reason).toBe("forSec");
  });

  it("a step with no terminator runs until the timeout and is logged as such", () => {
    const { state } = simulate([{ speedKmh: 10, timeoutSec: 5 }], { seconds: 20 });
    expect(state.log[0]!.reason).toBe("timeout");
  });

  it("an empty script is finished immediately and commands nothing", () => {
    const s = createDriveScript([], 0);
    expect(s.finished).toBe(true);
    const res = stepDriveScript(s, { t: 0.1, speedKmh: 30, x: 0, y: 0 });
    expect(res.command).toEqual({ throttle: 0, brake: 0, steer: 0 });
  });
});

describe("steer and keys ride the step", () => {
  it("the step's constant steer is emitted every frame of that step", () => {
    let state = createDriveScript([{ speedKmh: 10, steer: 0.4, forSec: 2 }], 0);
    const res = stepDriveScript(state, { t: 0.5, speedKmh: 8, x: 0, y: 0 });
    state = res.state;
    expect(res.command.steer).toBeCloseTo(0.4, 6);
  });

  it("currentStep/stepLabel expose the running step for the DOM half", () => {
    const state = createDriveScript([{ label: "glance right", speedKmh: 10, keys: ["KeyE"] }], 0);
    expect(currentStep(state)?.keys).toEqual(["KeyE"]);
    expect(stepLabel(state)).toBe("glance right");
    expect(stepLabel(createDriveScript([{ speedKmh: 12 }], 0))).toBe("12 km/h");
  });
});

describe("the controller cannot be fooled by a stalled tab", () => {
  it("a forty-second frame gap does not wind the integrator up (dt is clamped)", () => {
    // Small error on purpose: the proportional term alone is ~0.15, so anything
    // near full throttle here could only come from an unclamped integral.
    const state = createDriveScript([{ speedKmh: 30, forSec: 999 }], 0);
    const first = stepDriveScript(state, { t: 0.016, speedKmh: 29, x: 0, y: 0 });
    const jumped = stepDriveScript(first.state, { t: 40, speedKmh: 29, x: 0, y: 0 });
    expect(jumped.command.throttle).toBeLessThan(0.3);
  });

  it("time never runs backwards into a negative dt", () => {
    const state = createDriveScript([{ speedKmh: 30, forSec: 999 }], 10);
    const res = stepDriveScript(state, { t: 5, speedKmh: 0, x: 0, y: 0 });
    expect(Number.isFinite(res.command.throttle)).toBe(true);
    expect(res.command.throttle).toBeGreaterThanOrEqual(0);
  });
});

describe("parseDriveScript", () => {
  it("parses the documented shape", () => {
    const raw = JSON.stringify([
      { label: "approach", speedKmh: 20, stopAt: { x: 1, y: 2 }, withinM: 1.5 },
      { speedKmh: 0, forSec: 40 },
      { speedKmh: 25, steer: -0.2, keys: ["KeyE"], untilNear: { x: 3, y: 4 } },
    ]);
    expect(parseDriveScript(raw)).toEqual([
      { label: "approach", speedKmh: 20, stopAt: { x: 1, y: 2 }, withinM: 1.5 },
      { speedKmh: 0, forSec: 40 },
      { speedKmh: 25, steer: -0.2, keys: ["KeyE"], untilNear: { x: 3, y: 4 } },
    ]);
  });

  it("refuses anything malformed rather than driving a different script", () => {
    expect(parseDriveScript("not json")).toBeNull();
    expect(parseDriveScript('{"speedKmh":10}')).toBeNull(); // not an array
    expect(parseDriveScript('[{"forSec":3}]')).toBeNull(); // no speed
    expect(parseDriveScript('[{"speedKmh":"20"}]')).toBeNull();
    expect(parseDriveScript("[null]")).toBeNull();
  });

  it("drops fields it does not understand instead of passing them through", () => {
    expect(parseDriveScript('[{"speedKmh":10,"hack":"rm -rf"}]')).toEqual([{ speedKmh: 10 }]);
  });
});
