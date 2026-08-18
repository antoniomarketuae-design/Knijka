import { describe, expect, it } from "vitest";
import { REVERSE_ASSIST_HOLD_S, REVERSE_ASSIST_STANDSTILL_KMH } from "../../engine";
import {
  DEFAULT_STEP_TIMEOUT_S,
  STANDSTILL_BRAKE_OFF_S,
  STANDSTILL_BRAKE_ON_S,
  STOP_SPEED_MS,
  createDriveScript,
  currentStep,
  parseDriveScript,
  stepDriveScript,
  stepLabel,
  targetSpeedMs,
  validateDriveSteps,
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

interface TraceRow {
  t: number;
  speedKmh: number;
  x: number;
  y: number;
  step: number;
}

/**
 * Toy plant: throttle accelerates at 3 m/s², brake decelerates at 6 m/s², plus
 * a little drag. Deliberately NOT the real VehicleSim — the point is that the
 * controller reaches its targets on ANY plant in that envelope, which is what
 * makes a scripted drive reproducible across tiers and surfaces.
 *
 * `accelMs2` / `dragPerS` open that envelope for the motorway case: the default
 * pair terminates at 3/0.15 = 20 m/s ≈ 72 km/h, so a lesson that briefs
 * „установи се около 120–130 км/ч" cannot even be posed on it.
 */
function simulate(
  steps: readonly DriveStep[],
  opts: { seconds: number; dt?: number; headingRad?: number; accelMs2?: number; dragPerS?: number } = {
    seconds: 30,
  },
): { state: DriveScriptState; trace: TraceRow[] } {
  const dt = opts.dt ?? 1 / 60;
  const heading = opts.headingRad ?? 0; // +y
  const accel = opts.accelMs2 ?? 3;
  const drag = opts.dragPerS ?? 0.15;
  let state = createDriveScript(steps, 0);
  let v = 0; // m/s
  let x = 0;
  let y = 0;
  const trace: TraceRow[] = [];
  for (let t = 0; t <= opts.seconds; t += dt) {
    const res = stepDriveScript(state, { t, speedKmh: v * KMH, x, y });
    state = res.state;
    const a = res.command.throttle * accel - res.command.brake * 6 - drag * v;
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

/**
 * A CRUISE SPLIT INTO STEPS MUST BE THE SAME DRIVE AS ONE LONG STEP.
 *
 * sweep161, 2026-08-16, filed seven scenarios as „the motion is not car-like":
 * the right-hand drive lurching 0 → 11 → 2 → 0 км/ч for 190-208 s while the
 * wrong-hand drive ramped cleanly 14 → 59 → 86 → 110 → 135. That sweep did not
 * drive through this controller — but it named the property a scripted drive
 * must have and this file did not have, because MANY SHORT STEPS IS THE NORMAL
 * SHAPE here: the rig shoots a frame on every handover, so a 40 s cruise is
 * written as twenty legs, and every one of them used to dump the integrator.
 *
 * The steady-state throttle is carried by the integrator alone (the P term is
 * zero once the error is zero), so dumping it is dropping the accelerator.
 */
describe("a cruise expressed as many steps is the same drive as one long step", () => {
  const legs = (n: number, sec: number, speedKmh: number): DriveStep[] =>
    Array.from({ length: n }, (_, i) => ({ label: `leg ${i}`, speedKmh, forSec: sec }));
  const worstDeviation = (trace: TraceRow[], target: number, afterSec: number): number =>
    Math.max(...trace.filter((s) => s.t > afterSec).map((s) => Math.abs(s.speedKmh - target)));
  const road = (trace: TraceRow[]): number => trace[trace.length - 1]!.y;

  it("holds 50 km/h across twenty handovers instead of sagging at every one", () => {
    const one = simulate([{ speedKmh: 50, forSec: 40 }], { seconds: 41 });
    const many = simulate(legs(20, 2, 50), { seconds: 41 });
    expect(one.state.log).toHaveLength(1);
    expect(many.state.log).toHaveLength(20);
    // MEASURED. One step: 0.55 km/h worst deviation. Twenty legs BEFORE the
    // integrator was carried: 3.27, sagging to 46.73 after each handover.
    expect(worstDeviation(one.trace, 50, 15)).toBeLessThan(1);
    expect(worstDeviation(many.trace, 50, 15)).toBeLessThan(1);
  });

  it("…and therefore covers the same road in the same time", () => {
    const one = simulate([{ speedKmh: 50, forSec: 40 }], { seconds: 41 });
    const many = simulate(legs(20, 2, 50), { seconds: 41 });
    // MEASURED: 488.9 m against 506.8 m before the fix — 3.5 % of the lesson's
    // road missing, which is how a scripted drive „runs out of route".
    expect(road(many.trace)).toBeGreaterThan(road(one.trace) * 0.995);
  });

  it("settles on a motorway speed the same way — 130 km/h in 2 s legs", () => {
    // The lesson that filed the finding briefs „установи се около 120–130 км/ч",
    // so the plant is opened up far enough to pose it at all.
    const plant = { seconds: 81, accelMs2: 4, dragPerS: 0.06 };
    const one = simulate([{ speedKmh: 130, forSec: 80 }], plant);
    const many = simulate(legs(40, 2, 130), plant);
    // MEASURED before the fix: one step held 129.47-129.64; forty legs sagged
    // to 127.26 and never once reached the band the briefing asks for.
    expect(worstDeviation(one.trace, 130, 40)).toBeLessThan(1);
    expect(worstDeviation(many.trace, 130, 40)).toBeLessThan(1);
  });

  it("a carried demand cannot outlive a step that asks for LESS speed", () => {
    // The other direction, and the one that would make carrying it a defect of
    // its own: a 50 km/h throttle must not be handed to a 10 km/h step, and it
    // must not blow a stop point that follows one.
    const steps: DriveStep[] = [
      { label: "cruise", speedKmh: 50, forSec: 20 },
      { label: "crawl", speedKmh: 10, forSec: 15 },
      { label: "stop", speedKmh: 20, stopAt: { x: 0, y: 330 }, withinM: 2 },
    ];
    const { state, trace } = simulate(steps, { seconds: 150 });
    // Give the crawl 4 s to shed 40 km/h, then hold it to its own target.
    const crawl = trace.filter((s) => s.step === 1 && s.t > 24);
    expect(crawl.length).toBeGreaterThan(500);
    expect(worstDeviation(crawl, 10, 0)).toBeLessThan(1.5);
    const arrival = state.log[2];
    expect(arrival?.reason).toBe("stopped");
    expect(arrival!.speedKmh).toBeLessThan(STOP_SPEED_MS * KMH);
    expect(Math.abs(arrival!.y - 330)).toBeLessThanOrEqual(2);
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

  it("a holdBrake step handing over to a pulsed one lifts on the first frame", () => {
    // The third place the same rule was missing. The duty cycle is carried
    // across handovers precisely so that a pulse never restarts under a pedal
    // that never came up — but a `holdBrake` step left the carried cycle at
    // (phase 0, pedal DOWN), so a pulsed step following one began by extending
    // the hold through a whole ON phase instead of pulsing. A script that says
    // „stand on it, THEN pulse" got a longer stand and a late first pulse.
    const dt = 1 / 60;
    const HOLD_S = 5;
    const steps: DriveStep[] = [
      { label: "stand on it", speedKmh: 0, forSec: HOLD_S, holdBrake: true },
      { label: "then pulse", speedKmh: 0, forSec: 5 },
    ];
    let state = createDriveScript(steps, 0);
    let hold = 0;
    let spanningHold = 0;
    let sinceHandover: number | null = null;
    let secondsToFirstLift = Infinity;
    for (let t = 0; t <= 10; t += dt) {
      const res = stepDriveScript(state, { t, speedKmh: 0, x: 0, y: 0 });
      state = res.state;
      if (res.transitioned) sinceHandover = 0;
      else if (sinceHandover !== null) sinceHandover += dt;
      if (res.command.brake > 0.1) {
        hold += dt;
        if (sinceHandover !== null) spanningHold = Math.max(spanningHold, hold);
      } else {
        hold = 0;
        if (sinceHandover !== null && secondsToFirstLift === Infinity) secondsToFirstLift = sinceHandover;
      }
      if (state.finished) break;
    }
    // MEASURED. BEFORE: the pedal stayed down 0.233 s into the pulsed step — a
    // whole ON phase — and the run of brake spanning the boundary was 5.233 s.
    // AFTER: one frame (0.017 s) and 5.033 s. The hold the script ASKED for is
    // untouched; the hold it did not ask for is gone.
    expect(secondsToFirstLift).toBeLessThan(STANDSTILL_BRAKE_OFF_S);
    expect(spanningHold).toBeLessThan(HOLD_S + STANDSTILL_BRAKE_ON_S * 0.5);
  });

  it("…and the pulsed step that follows is still a hold, not a coast", () => {
    // The opposite direction: lifting once at the boundary must not turn the
    // wait into a car standing on no pedal at all.
    const dt = 1 / 60;
    const steps: DriveStep[] = [
      { speedKmh: 0, forSec: 5, holdBrake: true },
      { speedKmh: 0, forSec: 5 },
    ];
    let state = createDriveScript(steps, 0);
    let framesAfter = 0;
    let brakedAfter = 0;
    let handedOver = false;
    for (let t = 0; t <= 10; t += dt) {
      const res = stepDriveScript(state, { t, speedKmh: 0, x: 0, y: 0 });
      state = res.state;
      if (res.transitioned) handedOver = true;
      else if (handedOver && !state.finished) {
        framesAfter += 1;
        if (res.command.brake > 0.1) brakedAfter += 1;
      }
      if (state.finished) break;
    }
    expect(framesAfter).toBeGreaterThan(200);
    expect(brakedAfter / framesAfter).toBeGreaterThan(0.55);
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

  /**
   * THE SAFETY CAP MUST NOT SHORTEN A DURATION THE SCRIPT STATED.
   *
   * `validateDriveSteps` accepts `forSec` up to 3600 — the gate says a 150 s leg
   * is a drive this rig can honour — and `DEFAULT_STEP_TIMEOUT_S` then ended it
   * at 90 and logged the reason as "timeout", on a step that had asked for a
   * duration and been told yes. sweep161's motorway rows ran 190-208 s each and
   * were filed as „Урокът беше прекъснат преди края"; that sweep did not drive
   * through this controller, but any drive that did would have been cut in the
   * same place, and the debrief cannot tell an abandoned lesson from a rig that
   * let go of the pedals two thirds of the way down the road.
   */
  it("honours a forSec longer than the default safety cap instead of cutting it at 90 s", () => {
    const plant = { seconds: 200, accelMs2: 4, dragPerS: 0.06 };
    const { state, trace } = simulate([{ label: "cruise", speedKmh: 130, forSec: 150 }], plant);
    const leg = state.log[0]!;
    // MEASURED BEFORE: reason "timeout" at t=90.017 s, 3036.3 m of road —
    // byte-identical to `forSec: 90` — and `finished`, so the rig let go.
    expect(leg.reason).toBe("forSec");
    expect(leg.endedAtSec).toBeGreaterThanOrEqual(150);
    expect(leg.endedAtSec).toBeLessThan(151);
    // …and the extra sixty seconds are real ROAD, not a longer clock: 130 km/h
    // for 150 s is ~5.4 km against the 3.0 km the cap used to allow.
    expect(trace[trace.length - 1]!.y).toBeGreaterThan(5000);
  });

  it("…while an explicit timeoutSec still cuts a longer forSec, and a step with no forSec still gets the default", () => {
    // The other direction, and the one that would make the fix a defect of its
    // own: „bounded by whatever the step feels like" is not a safety cap. An
    // explicit `timeoutSec` is the caller's own cap and must still win when it
    // is SHORTER than `forSec` — that spelling is how a script abandons a leg.
    const capped = simulate([{ label: "give up", speedKmh: 40, forSec: 150, timeoutSec: 20 }], { seconds: 60 });
    expect(capped.state.log).toHaveLength(1); // it ended at all — the cap is still a cap
    expect(capped.state.log[0]!.reason).toBe("timeout");
    expect(capped.state.log[0]!.endedAtSec).toBeLessThan(21);
    // …and a step that never says how long it wants is still bounded by the
    // default, so an endless step cannot hang a render.
    const open = simulate([{ label: "open", speedKmh: 40 }], { seconds: 200 });
    expect(open.state.log[0]!.reason).toBe("timeout");
    expect(open.state.log[0]!.endedAtSec).toBeGreaterThanOrEqual(DEFAULT_STEP_TIMEOUT_S);
    expect(open.state.log[0]!.endedAtSec).toBeLessThan(DEFAULT_STEP_TIMEOUT_S + 1);
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

/**
 * A NON-FINITE MEASUREMENT IS NOT A SLOW FRAME, IT IS NO FRAME.
 *
 * Every branch of the controller is a comparison against the sample, and a
 * comparison with NaN is FALSE — so one bad number out of the scene does not
 * raise anything, it produces a car that never touches a pedal. That is
 * word-for-word the evidence sweep161 filed nine times („the car neither
 * accelerates nor coasts; it twitches", „never sustains a speed"), and this
 * file already documents the identical downstream picture for `decelMs2: -1`.
 * Whatever upstream defect puts a NaN in a tick, this controller must not be
 * the thing that turns it into a plausible drive.
 */
describe("the controller refuses a sample it cannot measure", () => {
  it("never puts NaN on a pedal, and one bad frame does not poison the next good one", () => {
    // MEASURED BEFORE: `t: NaN` produced `throttle: NaN` — which goes straight
    // to the synthetic pad and into VehicleInput — and stamped `lastT` with the
    // NaN, so the NEXT frame, a perfectly good one, was ALSO NaN.
    let state = createDriveScript([{ speedKmh: 50, forSec: 999 }], 0);
    const healthy = stepDriveScript(state, { t: 0.1, speedKmh: 10, x: 0, y: 0 });
    state = healthy.state;
    expect(healthy.command.throttle).toBeGreaterThan(0);

    const bad = stepDriveScript(state, { t: NaN, speedKmh: 10, x: 0, y: 0 });
    expect(bad.command).toEqual({ throttle: 0, brake: 0, steer: 0 });
    expect(bad.state.lastT).toBe(0.1); // the last frame that WAS a measurement

    const recovered = stepDriveScript(bad.state, { t: 0.2, speedKmh: 10, x: 0, y: 0 });
    expect(Number.isFinite(recovered.command.throttle)).toBe(true);
    expect(recovered.command.throttle).toBeGreaterThan(0);
  });

  it("counts every refused frame instead of reporting a blind drive as a driven one", () => {
    // A drive whose evidence is „the car never sustained a speed" has to be able
    // to say whether the controller was driving or blind. Silence there is how a
    // review row gets argued from a video.
    let state = createDriveScript([{ speedKmh: 50, forSec: 999 }], 0);
    expect(state.badSamples).toBe(0);
    for (const sample of [
      { t: NaN, speedKmh: 10, x: 0, y: 0 },
      { t: 0.2, speedKmh: NaN, x: 0, y: 0 },
      { t: 0.3, speedKmh: 10, x: NaN, y: 0 },
      { t: 0.4, speedKmh: 10, x: 0, y: Infinity },
    ]) {
      const res = stepDriveScript(state, sample);
      state = res.state;
      expect(res.command).toEqual({ throttle: 0, brake: 0, steer: 0 });
    }
    expect(state.badSamples).toBe(4);
    // …and a blind frame is not time: it cannot end a step, and it cannot be
    // the frame a positional terminator fires on.
    expect(state.log).toHaveLength(0);
    expect(state.index).toBe(0);
  });

  it("…and still drives every sample that IS a measurement", () => {
    // The other direction, and the one that would make the guard worse than the
    // defect: a guard that refuses real frames is a rig that never drives. Zero,
    // negative and signed-zero readings are all measurements.
    let state = createDriveScript([{ speedKmh: 0, forSec: 40 }], 0);
    const reversing = stepDriveScript(state, { t: 0.1, speedKmh: -16, x: -0, y: 0 });
    expect(reversing.command.brake).toBeGreaterThan(0.9);
    expect(reversing.state.badSamples).toBe(0);

    state = createDriveScript([{ speedKmh: 30, forSec: 999 }], 0);
    const fromRest = stepDriveScript(state, { t: 0, speedKmh: 0, x: 0, y: 0 });
    expect(fromRest.command.throttle).toBeGreaterThan(0);
    expect(fromRest.state.badSamples).toBe(0);

    // …and a whole ordinary drive refuses nothing at all.
    const { state: driven } = simulate([{ speedKmh: 40, forSec: 20 }], { seconds: 25 });
    expect(driven.badSamples).toBe(0);
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

  it("carries holdBrake — the field it used to silently drop", () => {
    // `holdBrake` is documented on DriveStep and is the whole way the Б2 proof
    // drive stands on the pedal, and this parser never read it: every `?script=`
    // asking for the continuous hold got the PULSE instead, with nothing on
    // screen to say the rig had changed the drive.
    expect(parseDriveScript('[{"speedKmh":0,"forSec":30,"holdBrake":true}]')).toEqual([
      { speedKmh: 0, forSec: 30, holdBrake: true },
    ]);
    expect(parseDriveScript('[{"speedKmh":0,"forSec":30,"holdBrake":false}]')).toEqual([
      { speedKmh: 0, forSec: 30, holdBrake: false },
    ]);
    // …and it is a boolean, not a truthy string.
    expect(parseDriveScript('[{"speedKmh":0,"forSec":30,"holdBrake":"yes"}]')).toBeNull();
  });

  it("refuses numbers that would make the rig drive a different script", () => {
    // Each of these passes `typeof v === "number"` and each turns the drive
    // into something else — see NUMERIC_RANGE for what each one does.
    expect(parseDriveScript('[{"speedKmh":20,"forSec":1e999}]')).toBeNull(); // Infinity: never ends
    expect(parseDriveScript('[{"speedKmh":20,"forSec":-1}]')).toBeNull(); // ends on frame one
    expect(parseDriveScript('[{"speedKmh":20,"forSec":0}]')).toBeNull(); // a step with no duration
    expect(parseDriveScript('[{"speedKmh":20,"decelMs2":0}]')).toBeNull(); // ramp targets 0 everywhere
    expect(parseDriveScript('[{"speedKmh":20,"decelMs2":-1}]')).toBeNull(); // NaN target, no pedal
    expect(parseDriveScript('[{"speedKmh":20,"withinM":0}]')).toBeNull(); // ring the car cannot occupy
    expect(parseDriveScript('[{"speedKmh":20,"withinM":-2}]')).toBeNull();
    expect(parseDriveScript('[{"speedKmh":-5}]')).toBeNull(); // max(0,…) makes it a wait
    expect(parseDriveScript('[{"speedKmh":20,"steer":5}]')).toBeNull(); // steer is -1..1
    expect(parseDriveScript('[{"speedKmh":20,"timeoutSec":0}]')).toBeNull();
    expect(parseDriveScript('[{"speedKmh":20,"forSec":40000}]')).toBeNull(); // forSec in ms
    expect(parseDriveScript('[{"speedKmh":20,"stopAt":{"x":1e999,"y":0}}]')).toBeNull();
    expect(parseDriveScript('[{"speedKmh":20,"untilNear":{"x":"3","y":4}}]')).toBeNull();
    expect(parseDriveScript('[{"speedKmh":20,"keys":["KeyE",7]}]')).toBeNull();
    expect(parseDriveScript('[{"speedKmh":20,"label":7}]')).toBeNull();
  });

  it("refuses a stop point the ramp can never reach — speedKmh 0 with stopAt", () => {
    // The `decelMs2: 0` row of NUMERIC_RANGE reached through a different field.
    // `targetSpeedMs` is min(cruise, ramp), so a cruise of 0 is a target of 0 at
    // EVERY distance and „drive to this point and stop" becomes „stop where you
    // already are". MEASURED on the plant below: the car never left 0.000 km/h,
    // covered 0.000 m, and burned the whole 90 s cap on reason "timeout".
    expect(parseDriveScript('[{"speedKmh":0,"stopAt":{"x":0,"y":60}}]')).toBeNull();
    expect(validateDriveSteps([{ speedKmh: 0, stopAt: { x: 0, y: 60 } }])).toMatch(/step 0: speedKmh=0 with stopAt/);
    expect(() => createDriveScript([{ speedKmh: 0, stopAt: { x: 0, y: 60 } }], 0)).toThrow(/speedKmh=0 with stopAt/);
  });

  it("…and both legal spellings of the same instruction still drive", () => {
    // The other direction. A wait where the car already is needs no `stopAt`,
    // and a wait somewhere else needs a cruise to get there — refusing either
    // would be the same crime as accepting the frozen one.
    expect(parseDriveScript('[{"speedKmh":0,"forSec":40}]')).toEqual([{ speedKmh: 0, forSec: 40 }]);
    const { state, trace } = simulate([{ label: "approach", speedKmh: 20, stopAt: { x: 0, y: 60 } }], { seconds: 60 });
    // MEASURED: arrives "stopped" at t=13.48 s / 59.40 m, against 0.000 m in
    // 90 s for the refused spelling.
    expect(state.log[0]!.reason).toBe("stopped");
    expect(trace[trace.length - 1]!.y).toBeGreaterThan(55);
    expect(Math.max(...trace.map((s) => s.speedKmh))).toBeGreaterThan(15);
  });

  it("…while every value a real script uses still parses", () => {
    // The other direction. A rule that refuses the legal drive is the same
    // crime as one that accepts the broken one, and these are the values the
    // review rows are actually driven with.
    expect(
      parseDriveScript(
        JSON.stringify([
          { label: "approach", speedKmh: 20, stopAt: { x: -12.5, y: 40 }, withinM: 0.5, decelMs2: 3.5 },
          { speedKmh: 0, forSec: 40, holdBrake: true },
          { speedKmh: 130, steer: -1, timeoutSec: 3600, keys: ["KeyE"] },
          { speedKmh: 25, untilNear: { x: 0, y: 0 }, steer: 1 },
        ]),
      ),
    ).toHaveLength(4);
  });
});

describe("validateDriveSteps is the same gate on the run([…]) side", () => {
  // `?script=` is screened by parseDriveScript, but `window.__driveRig.run()`
  // is not: tools/clips/headless/drive-rig.mjs JSON.parses its own `--script`
  // and hands the array straight over. A silent wrong drive there is a
  // photographed wrong drive, so this side throws.
  it("names the step and the field it refused", () => {
    expect(validateDriveSteps([{ speedKmh: 20 }, { speedKmh: 20, decelMs2: 0 }])).toBe(
      "step 1: decelMs2=0 is outside (0, 20]",
    );
    expect(validateDriveSteps([{ forSec: 3 }])).toBe("step 0: speedKmh is required");
    expect(validateDriveSteps("nope")).toBe("script is not an array");
    expect(validateDriveSteps([{ speedKmh: 20, forSec: 5 }])).toBeNull();
  });

  it("createDriveScript throws rather than arming a script it cannot honour", () => {
    expect(() => createDriveScript([{ speedKmh: 20, decelMs2: -1 }], 0)).toThrow(/decelMs2/);
    // …and the legal script still arms, including the empty one.
    expect(createDriveScript([], 0).finished).toBe(true);
    expect(createDriveScript([{ speedKmh: 20, forSec: 5 }], 0).finished).toBe(false);
  });
});
