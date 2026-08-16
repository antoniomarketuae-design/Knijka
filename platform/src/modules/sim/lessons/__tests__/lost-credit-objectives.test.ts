/**
 * LOST CREDIT — correct driving the objective evaluators failed to record
 * (2026-08-16 sweep). Each block drives the exact shape that was thrown away,
 * and each is paired with the counter-proof that the repair did not turn the
 * gate into a rubber stamp.
 *
 * Every "was rejected" number here is the OLD evaluator's, measured before the
 * change; the comments carry them so a future reader can re-derive the line.
 */

import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import type { SimTick } from "../../rules";
import { createEvalState, parseObjectiveParams, stepObjective } from "../objectives";
import type { ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

function parsed(kind: LessonObjective["kind"], params: Record<string, unknown>): ObjectiveParams {
  return parseObjectiveParams({ id: "o1", titleBg: "Тест", kind, params });
}

/**
 * Fold a drive through one objective; returns whether it ever completed and the
 * highest deceleration the evaluator ever held. `peak` is sampled every frame
 * rather than read at the end because a REJECTED attempt zeroes it on the way
 * out (the re-arm), so the final state says nothing about what was measured.
 */
function drive(params: ObjectiveParams, ticks: SimTick[]): { done: boolean; peak: number } {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let peak = 0;
  for (const tick of ticks) {
    const r = stepObjective(params, evalState, tick);
    evalState = r.evalState;
    if (evalState.type === "smoothStop") peak = Math.max(peak, evalState.maxDecelMs2);
    if (r.done) done = true;
  }
  return { done, peak };
}

// ---------------------------------------------------------------------------
// ① smoothStop — the derivative that measured the frame rate, not the driving
// ---------------------------------------------------------------------------

describe("smoothStop is graded at the rate the car brakes, not the rate it renders", () => {
  const params = parsed("completeManeuver", {
    maneuver: "smoothStop",
    minApproachKmh: 20,
    maxDecelMs2: 3.5,
  });

  /**
   * A stop at a CONSTANT rate, sampled at `hz`, with the driveline's own
   * reported-speed wobble on top. The wobble is deterministic (a plain LCG) so
   * the gate is reproducible, and its amplitude is the repo's own measured
   * figure — audit M-18 quotes 0.06 km/h in the rule engine's ACCEL WINDOW note.
   *
   * `onTick` runs inside useFrame and `speedKmh` is raw Rapier linvel projected
   * on the body forward axis, which swings as the chassis pitches — i.e. this is
   * the shape of the signal the LIVE car produces and the kinematic trace suite
   * never does (recorder.ts computes speed analytically ⇒ wobble exactly 0,
   * which is why every recorded gate was green while lesson one failed).
   */
  function constantRateStop(
    fromKmh: number,
    decelMs2: number,
    hz: number,
    wobbleKmh: number,
  ): SimTick[] {
    const dt = 1 / hz;
    const ticks: SimTick[] = [];
    let seed = 20260816;
    const noise = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return ((seed / 2147483648) * 2 - 1) * wobbleKmh;
    };
    const trueStopSec = fromKmh / 3.6 / decelMs2;
    for (let i = 0; ; i += 1) {
      const t = i * dt;
      const clean = Math.max(0, fromKmh - decelMs2 * 3.6 * t);
      ticks.push(makeTick({ t, speedKmh: Math.max(0, clean + noise()) }));
      if (t > trueStopSec + 0.5) break;
    }
    return ticks;
  }

  it("a textbook 2.5 m/s² stop completes at 120 fps with the driveline's own wobble", () => {
    // OLD: 0/20 trials completed at 120 Hz with 0.03 km/h of wobble and worse
    // at 0.06 — a 0.06 km/h jitter across an 8 ms frame differentiates to
    // ~2.1 m/s², and the evaluator keeps the PEAK over ~400 frames, so it
    // collects the worst sample of the stop rather than a typical one.
    const r = drive(params, constantRateStop(30, 2.5, 120, 0.06));
    expect(r.done).toBe(true);
    expect(r.peak).toBeLessThan(3.5);
  });

  it("…and at 60 fps, and at the 20 Hz of a coarse frame, and with no wobble at all", () => {
    for (const [hz, wobble] of [
      [60, 0.06],
      [120, 0.12],
      [20, 0.12],
      [60, 0],
    ] as const) {
      const r = drive(params, constantRateStop(30, 2.5, hz, wobble));
      expect(r.done, `${hz} Hz / ${wobble} km/h`).toBe(true);
    }
  });

  it("COUNTER-PROOF: a real slam is still refused at the same frame rate", () => {
    // The whole risk of a window is that it averages a genuine emergency stop
    // away. It does not: 0.5 s is a fifth of the stop, so every window inside
    // the slam reads the slam's own rate.
    const r = drive(params, constantRateStop(40, 6, 120, 0.06));
    expect(r.done).toBe(false);
    expect(r.peak).toBeGreaterThan(3.5);
  });

  it("COUNTER-PROOF: the measured peak is the physical rate, not the noise", () => {
    const r = drive(params, constantRateStop(30, 2.5, 120, 0.06));
    expect(r.peak).toBeGreaterThan(2.0);
    expect(r.peak).toBeLessThan(3.0);
  });

  it("recorded 1 Hz traces differentiate exactly as they did before", () => {
    // At trace/replay rates every span already exceeds the window, so the
    // arithmetic IS the old frame-to-frame delta and both verdicts are the
    // shipped ones: 50 km/h → 0 in one second is 13.9 m/s² (refused), 30 → 0
    // over four is ~2.1 (credited).
    expect(drive(params, [makeTick({ t: 0, speedKmh: 50 }), makeTick({ t: 1, speedKmh: 0 })]).done)
      .toBe(false);
    const gentle = drive(
      params,
      [30, 24, 16, 8, 0].map((v, i) => makeTick({ t: i, speedKmh: v })),
    );
    expect(gentle.done).toBe(true);
    expect(gentle.peak).toBeCloseTo(2.22, 1);
  });
});

// ---------------------------------------------------------------------------
// ⑧ reachZone — the approach axis frozen on an abandoned attempt
// ---------------------------------------------------------------------------

describe("reachZone judges the approach the student actually made", () => {
  // A halt mark with the paint 2 m in front of it (the FR-24 signed cut) —
  // credit ends at the LINE, and the lawful stop is short of it.
  const params = parsed("reachZone", {
    x: 0,
    y: 0,
    radiusM: 4,
    maxSpeedKmh: 5,
    acceptBeforeMarkM: 2,
  });
  const at = (t: number, x: number, y: number, speedKmh: number): SimTick =>
    makeTick({ t, position: { x, y }, speedKmh });

  /**
   * The self-correction. He clips the grace ring on the first pass from 75° off
   * the road's line — still cornering, nowhere near the approach the waypoint is
   * authored for — thinks better of it, backs out, comes round and makes the
   * real approach straight down the road, then stops 2.5 m short of the mark,
   * i.e. half a metre BEHIND the paint. Textbook.
   */
  const selfCorrection: SimTick[] = [
    at(0, 20, 30, 25), // far outside — everOutside latches
    at(1, 3.9, 14.5, 22),
    at(2, 2.59, 9.66, 20), // outside the 9 m ring: the frame the first axis comes from
    at(3, 1.8, 6.7, 20), // ENTERS the ring at 75° off the road — the abandoned attempt
    at(4, 4, 15, 20), // …and leaves it again
    at(5, 20, 0, 20), // round onto the real approach
    at(6, 10, 0, 12), // outside the ring, on the road axis
    at(7, 6, 0, 8), // ENTERS the ring down the road
    at(8, 3.5, 0, 4),
    at(9, 2.5, 0, 0), // at rest, 0.5 m behind the paint
    at(10, 2.5, 0, 0),
  ];

  it("a stop behind the paint is credited after a re-approach", () => {
    // OLD: refused, and not by a hair — on the axis latched at t=2 EVERY point
    // of the honest approach reads as past the line. At the resting point
    // along = −0.65 m against a −2 m boundary (and −1.04 m at the far edge of
    // the acceptance circle), while on the axis he actually drove it is −2.50 m,
    // half a metre behind the paint. He was judged on the attempt he abandoned.
    expect(drive(params, selfCorrection).done).toBe(true);
  });

  it("COUNTER-PROOF: the capsule may rotate toward the fresh approach, never turn around", () => {
    // The same waypoint, overshot: he crosses the paint, leaves the ring on the
    // FAR side, turns round and comes back the other way, stopping 2.5 m past
    // the mark in the original sense. On a re-latched axis that would read as
    // „2.5 m short", which is exactly the stop B18/FR-24 exists to refuse — so
    // the dot-product guard keeps the original axis and the refusal stands.
    const overshootAndReturn: SimTick[] = [
      at(0, 30, 0, 25),
      at(1, 10, 0, 20),
      at(2, 6, 0, 12), // enters the ring on the honest approach
      at(3, -6, 0, 12), // …and blows straight past the mark
      at(4, -20, 0, 20), // well outside the ring, beyond the junction
      at(5, -10, 0, 15), // turns round and comes back from the far side
      at(6, -6, 0, 8),
      at(7, -2.5, 0, 0), // at rest, 2.5 m PAST the paint he was asked to stop at
      at(8, -2.5, 0, 0),
    ];
    expect(drive(params, overshootAndReturn).done).toBe(false);
  });

  it("a single honest approach is unchanged — the mark is reached at the cap", () => {
    expect(
      drive(params, [at(0, 30, 0, 25), at(1, 10, 0, 20), at(2, 6, 0, 8), at(3, 2.6, 0, 0)]).done,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⑨ passSignal — the red waited out from the back of the queue
// ---------------------------------------------------------------------------

describe("passSignal counts the red the student actually sat through", () => {
  const gated = parsed("passSignal", {
    nodeId: "n5997970086",
    x: 400,
    y: 200,
    radiusM: 30,
    control: "trafficLight",
    requireRedMet: true,
  });
  const queued = (t: number, x: number, speedKmh: number, state: "red" | "green"): SimTick =>
    makeTick({
      t,
      position: { x, y: 200 },
      speedKmh,
      nextStopLineControl: "trafficLight",
      nextStopLineState: state,
      nextStopLineM: 400 - x,
    });
  const crossOn = (t: number, lightState: "green" | "redYellow"): SimTick =>
    tickWithEvents(t, [{ kind: "stopLineCrossed", control: "trafficLight", lightState }], {
      position: { x: 400, y: 200 },
      speedKmh: 15,
    });

  it("waiting the red out at the queue tail, then crossing on green, completes the gate", () => {
    // OLD: refused. He stops 55 m from the line — 70 m from the node, outside
    // its 30 m radius — so `stoppedInZoneVisit` never latched and the gate
    // stayed open on a student who handled the red exactly as taught. The queue
    // length decided the grade, not the driving.
    const r = drive(gated, [
      queued(1, 300, 30, "red"),
      queued(2, 345, 0, "red"), // joins the tail, 55 m back
      queued(12, 345, 0, "red"),
      queued(20, 360, 0, "green"), // the queue starts to move
      queued(24, 385, 8, "green"),
      crossOn(26, "green"),
    ]);
    expect(r.done).toBe(true);
  });

  it("COUNTER-PROOF: stopping at the red and then CREEPING over on red+yellow does not", () => {
    // The shipped `sc-signal-redyellow / mistake-creep` shape. The queue arm
    // certifies the red; only a crossing on GREEN spends it, so the demo still
    // fails its gate — this is the assertion that caught a first draft which
    // latched the red directly and passed the mistake demo through the whole
    // production stack.
    const r = drive(gated, [
      queued(1, 300, 30, "red"),
      queued(2, 345, 0, "red"),
      queued(12, 350, 0, "red"),
      crossOn(14, "redYellow"),
    ]);
    expect(r.done).toBe(false);
  });

  it("COUNTER-PROOF: a halt with no forbidding light reported certifies nothing", () => {
    // Same geometry, same stop, but the world says the light ahead is green —
    // he simply parked on the approach. Outside the acceptance circle the arm
    // demands POSITIVE evidence, so nothing latches.
    const r = drive(gated, [
      queued(1, 300, 30, "green"),
      queued(2, 345, 0, "green"),
      queued(12, 350, 0, "green"),
      crossOn(14, "green"),
    ]);
    expect(r.done).toBe(false);
  });

  it("COUNTER-PROOF: a tick with no signal context behaves exactly as it shipped", () => {
    // Legacy sources, recorded traces and hand-built ticks cannot answer the
    // three optional fields; the evaluator must then be byte-identical.
    const r = drive(gated, [
      makeTick({ t: 1, position: { x: 345, y: 200 }, speedKmh: 0 }),
      makeTick({ t: 12, position: { x: 350, y: 200 }, speedKmh: 0 }),
      crossOn(14, "green"),
    ]);
    expect(r.done).toBe(false);
  });
});
