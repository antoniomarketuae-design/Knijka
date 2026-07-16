import { describe, expect, it } from "vitest";
import type { LessonObjective, StagedEventOutcome } from "../../contracts";
import {
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
} from "../objectives";
import type { ObjectiveDetail, ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

function parsed(kind: LessonObjective["kind"], params: Record<string, unknown>): ObjectiveParams {
  return parseObjectiveParams({ id: "o1", titleBg: "Тест", kind, params });
}

/** Run a tick sequence through one objective, returning done + final state. */
function run(
  params: ObjectiveParams,
  ticks: ReturnType<typeof makeTick>[],
  ctx?: ObjectiveContext,
) {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let progress = 0;
  let detail: ObjectiveDetail | undefined;
  for (const tick of ticks) {
    const r = stepObjective(params, evalState, tick, ctx);
    evalState = r.evalState;
    progress = r.progress;
    detail = r.detail;
    if (r.done) {
      done = true;
      break;
    }
  }
  return { done, progress, evalState, detail };
}

describe("parseObjectiveParams", () => {
  it("rejects malformed specs loudly", () => {
    expect(() => parsed("reachZone", { x: 1 })).toThrow(/reachZone/);
    expect(() => parsed("passSignal", { nodeId: "n1", x: 0, y: 0, radiusM: 10, control: "nope" })).toThrow();
    expect(() => parsed("driveDistance", { meters: 0 })).toThrow();
    expect(() =>
      parsed("completeManeuver", { maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 30, exitRadiusM: 20 }),
    ).toThrow();
    expect(() => parsed("completeManeuver", { maneuver: "wheelie" })).toThrow();
  });

  it("applies smoothStop defaults", () => {
    const p = parsed("completeManeuver", { maneuver: "smoothStop" });
    expect(p).toMatchObject({ maneuver: "smoothStop", minApproachKmh: 20, maxDecelMs2: 3.5 });
  });

  it("A10: emergencyStop without a stagedEventId is a spec error (no speed-only arming)", () => {
    expect(() => parsed("completeManeuver", { maneuver: "emergencyStop" })).toThrow(/stagedEventId/);
    expect(() =>
      parsed("completeManeuver", { maneuver: "emergencyStop", minApproachKmh: 40, minDecelMs2: 5 }),
    ).toThrow(/stagedEventId/);
  });

  it("A10: parkInBay without a bay rect is a spec error (no coordinate-free parks)", () => {
    expect(() => parsed("completeManeuver", { maneuver: "parkInBay", holdSec: 1.5 })).toThrow(/bay/);
    expect(() =>
      parsed("completeManeuver", { maneuver: "parkInBay", bay: { x: 0, y: 0, headingDeg: 0, widthM: 0, lengthM: 6 } }),
    ).toThrow(/bay/);
  });

  it("A10: parkInBay applies tolerance defaults", () => {
    const p = parsed("completeManeuver", {
      maneuver: "parkInBay",
      bay: { x: 1, y: 2, headingDeg: 45, widthM: 3, lengthM: 6.6 },
    });
    expect(p).toMatchObject({ maneuver: "parkInBay", holdSec: 1.5, centerTolM: 0.5, headingTolDeg: 10 });
  });

  it("A10: requireRedMet is trafficLight-only (a stop sign would deadlock it)", () => {
    expect(() =>
      parsed("passSignal", { nodeId: "n1", x: 0, y: 0, radiusM: 10, control: "stopSign", requireRedMet: true }),
    ).toThrow(/requireRedMet/);
    const p = parsed("passSignal", {
      nodeId: "n1",
      x: 0,
      y: 0,
      radiusM: 10,
      control: "trafficLight",
      requireRedMet: true,
    });
    expect(p).toMatchObject({ kind: "passSignal", requireRedMet: true });
  });
});

describe("reachZone", () => {
  const params = parsed("reachZone", { x: 100, y: 0, radiusM: 15 });

  it("completes on entering the zone", () => {
    const r = run(params, [
      makeTick({ t: 1, position: { x: 0, y: 0 }, speedKmh: 40 }),
      makeTick({ t: 2, position: { x: 90, y: 0 }, speedKmh: 40 }),
    ]);
    expect(r.done).toBe(true);
  });

  it("stays open outside the radius", () => {
    const r = run(params, [makeTick({ t: 1, position: { x: 80, y: 0 } })]);
    expect(r.done).toBe(false);
  });

  it("respects the optional max speed gate", () => {
    const slowZone = parsed("reachZone", { x: 0, y: 0, radiusM: 15, maxSpeedKmh: 10 });
    expect(run(slowZone, [makeTick({ t: 1, speedKmh: 30 })]).done).toBe(false);
    expect(run(slowZone, [makeTick({ t: 2, speedKmh: 8 })]).done).toBe(true);
  });
});

describe("passSignal", () => {
  const params = parsed("passSignal", {
    nodeId: "n1805512602",
    x: 430,
    y: 235,
    radiusM: 30,
    control: "trafficLight",
  });

  it("completes when the matching stop line is crossed near the node", () => {
    const r = run(params, [
      tickWithEvents(5, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "green" }], {
        position: { x: 425, y: 230 },
      }),
    ]);
    expect(r.done).toBe(true);
  });

  it("completes even on red — progression is not correctness", () => {
    const r = run(params, [
      tickWithEvents(5, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        position: { x: 430, y: 235 },
      }),
    ]);
    expect(r.done).toBe(true);
  });

  it("ignores crossings of the wrong control type or far away", () => {
    const wrongControl = run(params, [
      tickWithEvents(5, [{ kind: "stopLineCrossed", control: "stopSign" }], {
        position: { x: 430, y: 235 },
      }),
    ]);
    expect(wrongControl.done).toBe(false);

    const farAway = run(params, [
      tickWithEvents(5, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "green" }], {
        position: { x: 0, y: 0 },
      }),
    ]);
    expect(farAway.done).toBe(false);
  });
});

describe("passSignal / requireRedMet (A10 — L2 must meet a red)", () => {
  const gated = parsed("passSignal", {
    nodeId: "n5997970086",
    x: 400,
    y: 200,
    radiusM: 30,
    control: "trafficLight",
    requireRedMet: true,
  });
  const at = (x: number) => ({ position: { x, y: 200 } });
  const crossGreen = (t: number) =>
    tickWithEvents(t, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "green" }], {
      ...at(400),
      speedKmh: 20,
    });

  it("D4 cheat path: a greens-only crossing no longer completes the gated objective", () => {
    const r = run(gated, [makeTick({ t: 1, ...at(360), speedKmh: 40 }), crossGreen(2)]);
    expect(r.done).toBe(false);
    expect(r.progress).toBe(0.5); // crossed, but the run never met a red
    expect(r.detail).toMatchObject({ kind: "passSignal", redMetHere: false, redsMetInRun: 0 });
  });

  it("completes after stopping at the light, then proceeding on green (waited out a red)", () => {
    const r = run(gated, [
      makeTick({ t: 1, ...at(360), speedKmh: 40 }),
      makeTick({ t: 2, ...at(395), speedKmh: 0 }), // full stop at the line
      crossGreen(30),
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ kind: "passSignal", redMetHere: true });
  });

  it("crossing ON red also counts as a met red (progression; the rule engine grades it)", () => {
    const r = run(gated, [
      tickWithEvents(2, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        ...at(400),
        speedKmh: 30,
      }),
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ redMetHere: true });
  });

  it("a red met earlier in the run (ctx.redsMetInRun) satisfies the gate", () => {
    const ctx: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 1 };
    const r = run(gated, [crossGreen(2)], ctx);
    expect(r.done).toBe(true);
  });

  it("a stop OUTSIDE the zone certifies nothing", () => {
    const r = run(gated, [
      makeTick({ t: 1, ...at(300), speedKmh: 0 }), // stop 100 m away
      makeTick({ t: 2, ...at(380), speedKmh: 30 }),
      crossGreen(3),
    ]);
    expect(r.done).toBe(false);
  });

  it("the in-zone stop is visit-scoped: leaving the zone forgets it", () => {
    const r = run(gated, [
      makeTick({ t: 1, ...at(395), speedKmh: 0 }), // stopped at the line…
      makeTick({ t: 2, ...at(300), speedKmh: 40 }), // …then drove away
      makeTick({ t: 3, ...at(390), speedKmh: 30 }), // returned, no stop this visit
      crossGreen(4),
    ]);
    expect(r.done).toBe(false);
  });

  it("stays open after a lucky green until a later red is met at the same junction", () => {
    let evalState: ObjectiveEvalState = createEvalState(gated);
    const ctx: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0 };
    // Lucky green crossing…
    let r = stepObjective(gated, evalState, crossGreen(1), ctx);
    evalState = r.evalState;
    expect(r.done).toBe(false);
    // …loop back, stop at the line, wait the red out, cross on green.
    r = stepObjective(gated, evalState, makeTick({ t: 40, ...at(396), speedKmh: 0 }), ctx);
    evalState = r.evalState;
    r = stepObjective(gated, evalState, crossGreen(70), ctx);
    expect(r.done).toBe(true);
  });
});

describe("driveDistance", () => {
  const params = parsed("driveDistance", { meters: 100 });

  it("accumulates odometer distance and reports progress", () => {
    const ticks = [];
    for (let i = 0; i <= 6; i++) {
      ticks.push(makeTick({ t: i, position: { x: i * 20, y: 0 }, speedKmh: 50 }));
    }
    const r = run(params, ticks);
    expect(r.done).toBe(true);
  });

  it("ignores teleport jumps (reset/respawn)", () => {
    const r = run(params, [
      makeTick({ t: 0, position: { x: 0, y: 0 } }),
      makeTick({ t: 1, position: { x: 500, y: 0 } }), // teleport — not driving
      makeTick({ t: 2, position: { x: 510, y: 0 } }),
    ]);
    expect(r.done).toBe(false);
    expect(r.progress).toBeCloseTo(0.1, 5);
  });
});

describe("completeManeuver / smoothStop", () => {
  const params = parsed("completeManeuver", {
    maneuver: "smoothStop",
    minApproachKmh: 20,
    maxDecelMs2: 3.5,
  });

  /** speed profile as [t, kmh] pairs at a fixed position (position irrelevant). */
  const profile = (pairs: Array<[number, number]>) =>
    pairs.map(([t, v]) => makeTick({ t, speedKmh: v }));

  it("completes on a gentle stop from speed", () => {
    // 30 km/h → 0 over 4 s ≈ 2.1 m/s² — smooth.
    const r = run(params, profile([[0, 30], [1, 24], [2, 16], [3, 8], [4, 0]]));
    expect(r.done).toBe(true);
  });

  it("rejects a harsh stop and re-arms for another attempt", () => {
    // 50 km/h → 0 in 1 s ≈ 13.9 m/s² — emergency braking.
    const harsh = run(params, profile([[0, 50], [1, 0]]));
    expect(harsh.done).toBe(false);

    // Same session state: accelerate again, then stop smoothly => done.
    let evalState = harsh.evalState;
    let done = false;
    for (const tick of profile([[2, 15], [3, 30], [4, 20], [5, 10], [6, 0]])) {
      const r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
      if (r.done) done = true;
    }
    expect(done).toBe(true);
  });

  it("does not complete while the car never reached approach speed", () => {
    const r = run(params, profile([[0, 5], [1, 10], [2, 0]]));
    expect(r.done).toBe(false);
  });
});

describe("completeManeuver / emergencyStop (A10 — stimulus-locked)", () => {
  const params = parsed("completeManeuver", {
    maneuver: "emergencyStop",
    stagedEventId: "l5-braking-lead-car",
  });
  const profile = (pairs: Array<[number, number]>) =>
    pairs.map(([t, v]) => makeTick({ t, speedKmh: v }));
  const outcome = (over: Partial<StagedEventOutcome> = {}): StagedEventOutcome => ({
    eventId: "l5-braking-lead-car",
    kind: "brakingLeadCar",
    success: true,
    detail: "stoppedInTime",
    tSec: 12,
    reactionTimeSec: 0.6,
    stopGapM: 4.2,
    approachSpeedKmh: 48,
    ...over,
  });
  const ctxWith = (...outcomes: StagedEventOutcome[]): ObjectiveContext => ({
    stagedOutcomes: outcomes,
    redsMetInRun: 0,
  });

  it("D4 cheat path: a hard stop with NO stimulus never completes it", () => {
    // The exact profile that used to pass (45 km/h → 0 in 1 s ≈ 12.5 m/s²).
    const r = run(params, profile([[0, 45], [1, 0]]));
    expect(r.done).toBe(false);
    expect(r.progress).toBe(0);
    expect(r.detail).toMatchObject({ kind: "emergencyStop", outcome: "pending", band: null });

    // Nor does ANY speed theatrics without an outcome, ever.
    const wild = run(params, profile([[0, 80], [1, 0], [2, 70], [3, 0], [4, 90], [5, 0]]));
    expect(wild.done).toBe(false);
  });

  it("completes from a successful staged outcome, with the reaction time banded", () => {
    const r = run(params, [makeTick({ t: 13, speedKmh: 0 })], ctxWith(outcome()));
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({
      kind: "emergencyStop",
      outcome: "stoppedInTime",
      reactionTimeSec: 0.6,
      band: "otlichen",
      stopGapM: 4.2,
    });
  });

  it("bands the reaction time: <0.8 отличен, <1.2 добър, else бавен", () => {
    const band = (rt: number) =>
      run(params, [makeTick({ t: 13 })], ctxWith(outcome({ reactionTimeSec: rt }))).detail;
    expect(band(0.79)).toMatchObject({ band: "otlichen" });
    expect(band(0.8)).toMatchObject({ band: "dobur" });
    expect(band(1.19)).toMatchObject({ band: "dobur" });
    expect(band(1.2)).toMatchObject({ band: "baven" });
    expect(band(2.4)).toMatchObject({ band: "baven" });
  });

  it("fails (stays incomplete) on hitLeadCar and passedWithoutStopping", () => {
    const hit = run(
      params,
      [makeTick({ t: 13 })],
      ctxWith(outcome({ success: false, detail: "hitLeadCar", stopGapM: 0 })),
    );
    expect(hit.done).toBe(false);
    expect(hit.progress).toBe(0.5); // stimulus fired and was measured — stop not earned
    expect(hit.detail).toMatchObject({ kind: "emergencyStop", outcome: "hitLeadCar" });

    const swerved = run(
      params,
      [makeTick({ t: 13 })],
      ctxWith(outcome({ success: false, detail: "passedWithoutStopping" })),
    );
    expect(swerved.done).toBe(false);
    expect(swerved.detail).toMatchObject({ outcome: "passedWithoutStopping" });
  });

  it("a restaged retry can still complete it (last outcome for the event wins)", () => {
    const r = run(
      params,
      [makeTick({ t: 30 })],
      ctxWith(
        outcome({ success: false, detail: "hitLeadCar", tSec: 12 }),
        outcome({ tSec: 28, reactionTimeSec: 1.0 }),
      ),
    );
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ band: "dobur" });
  });

  it("ignores outcomes of other staged events", () => {
    const other = outcome({ eventId: "l2-priority-from-right" });
    const r = run(params, [makeTick({ t: 13 })], ctxWith(other));
    expect(r.done).toBe(false);
  });
});

describe("completeManeuver / parkInBay (A10 — bay-locked)", () => {
  // Bay centred at the origin, axis due north: inside ⇔ |x| ≤ 1.5, |y| ≤ 3.3.
  const params = parsed("completeManeuver", {
    maneuver: "parkInBay",
    holdSec: 1.5,
    bay: { x: 0, y: 0, headingDeg: 0, widthM: 3.0, lengthM: 6.6 },
  });
  /** Tick at (x, y) with the given speed/gear/heading (defaults: aligned north). */
  const at = (
    t: number,
    x: number,
    y: number,
    over: Partial<ReturnType<typeof makeTick>> = {},
  ) => makeTick({ t, position: { x, y }, headingDeg: 0, ...over });

  it("D4 cheat path: any-reverse + held-stop ANYWHERE no longer completes it", () => {
    // The exact sequence that used to pass — but 30 m from the bay.
    const r = run(params, [
      at(0, 30, 0, { speedKmh: 8, gear: -1 }),
      at(1, 30, 0, { speedKmh: 3, gear: -1 }),
      at(2, 30, 0, { speedKmh: 0, gear: -1 }),
      at(3, 30, 0, { speedKmh: 0, gear: 0 }),
      at(3.6, 30, 0, { speedKmh: 0, gear: 0 }),
    ]);
    expect(r.done).toBe(false);
    expect(r.detail).toMatchObject({ kind: "parkInBay", inBay: false, attempts: 0 });
  });

  it("completes only at rest inside the bay: reversed in, centred, aligned, held", () => {
    const r = run(params, [
      at(0, 0, 10, { speedKmh: 15 }), // pulled ahead of the bay
      at(1, 0.4, 6, { speedKmh: 6, gear: -1 }), // reversing, in the maneuver zone
      at(2, 0.3, 2, { speedKmh: 4, gear: -1 }), // entering the bay (attempt 1)
      at(3, 0.1, 0.1, { speedKmh: 0, gear: -1 }), // at rest, centred — hold starts
      at(4, 0.1, 0.1, { speedKmh: 0, gear: 0 }), // held 1 s — not yet
      at(4.6, 0.1, 0.1, { speedKmh: 0, gear: 0 }), // held 1.6 s ≥ 1.5 s => done
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ kind: "parkInBay", attempts: 1, inBay: true });
    expect(r.detail?.kind === "parkInBay" && r.detail.alignment).toBe("centered");
  });

  it("a stop inside the bay WITHOUT reverse does not complete (forward nose-in)", () => {
    const r = run(params, [
      at(0, 0, -10, { speedKmh: 20, gear: 2 }), // driving up in D
      at(1, 0, -2, { speedKmh: 8, gear: 1 }), // nosing in forward
      at(2, 0, 0, { speedKmh: 0, gear: 1 }),
      at(4, 0, 0, { speedKmh: 0, gear: 1 }), // held long enough — still not a park
    ]);
    expect(r.done).toBe(false);
  });

  it("reverse banked far from the bay does not count (maneuver zone)", () => {
    const r = run(params, [
      at(0, 0, -40, { speedKmh: 5, gear: -1 }), // reverse 40 m away — no credit
      at(1, 0, -10, { speedKmh: 20, gear: 2 }),
      at(2, 0, 0, { speedKmh: 0, gear: 1 }), // forward into the bay
      at(4, 0, 0, { speedKmh: 0, gear: 1 }),
    ]);
    expect(r.done).toBe(false);
  });

  it("a sloppy park (off-centre or crooked) stays open and reports its quality", () => {
    const offCentre = run(params, [
      at(0, 1.0, 2.0, { speedKmh: 4, gear: -1 }), // inside, but 1 m off-axis
      at(1, 1.0, 2.0, { speedKmh: 0, gear: -1 }),
      at(3, 1.0, 2.0, { speedKmh: 0, gear: 0 }),
    ]);
    expect(offCentre.done).toBe(false);
    expect(offCentre.detail?.kind === "parkInBay" && offCentre.detail.alignment).toBe("sloppy");

    const crooked = run(params, [
      at(0, 0, 0, { speedKmh: 4, gear: -1, headingDeg: 25 }),
      at(1, 0, 0, { speedKmh: 0, gear: -1, headingDeg: 25 }),
      at(3, 0, 0, { speedKmh: 0, gear: 0, headingDeg: 25 }),
    ]);
    expect(crooked.done).toBe(false);
    expect(crooked.detail?.kind === "parkInBay" && crooked.detail.alignment).toBe("sloppy");
  });

  it("heading is folded to the bay axis (parked facing either way is aligned)", () => {
    const r = run(params, [
      at(0, 0, 2, { speedKmh: 4, gear: -1, headingDeg: 184 }),
      at(1, 0, 0.1, { speedKmh: 0, gear: -1, headingDeg: 184 }),
      at(3, 0, 0.1, { speedKmh: 0, gear: 0, headingDeg: 184 }),
    ]);
    expect(r.done).toBe(true);
  });

  it("rolling resets the hold clock", () => {
    const r = run(params, [
      at(0, 0, 1, { speedKmh: 4, gear: -1 }),
      at(1, 0, 0.2, { speedKmh: 0, gear: -1 }), // stop begins
      at(1.5, 0, 0.3, { speedKmh: 6, gear: -1 }), // rolled — clock resets
      at(2, 0, 0.2, { speedKmh: 0, gear: -1 }), // new stop begins at t=2
      at(3, 0, 0.2, { speedKmh: 0, gear: 0 }), // only 1 s held — not done
    ]);
    expect(r.done).toBe(false);
    expect(r.progress).toBeCloseTo(0.9, 5); // in bay, at rest, aligned — holding
  });

  it("leaving the bay opens a NEW attempt and revokes the reverse credit", () => {
    let evalState: ObjectiveEvalState = createEvalState(params);
    const feed = (tick: ReturnType<typeof makeTick>) => {
      const r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
      return r;
    };
    feed(at(0, 0, 8, { speedKmh: 10 }));
    feed(at(1, 0, 2, { speedKmh: 5, gear: -1 })); // attempt 1 (reversed in)
    feed(at(2, 0, 8, { speedKmh: 10, gear: 1 })); // pulled out — attempt over
    feed(at(3, 0, 2, { speedKmh: 5, gear: 1 })); // attempt 2, forward this time
    const r = feed(at(5, 0, 0, { speedKmh: 0, gear: 1 }));
    expect(r.detail).toMatchObject({ kind: "parkInBay", attempts: 2 });
    expect(r.done).toBe(false); // reverse credit from attempt 1 was revoked

    // Reversing INSIDE the bay to adjust restores the credit for attempt 2.
    feed(at(6, 0, 0.5, { speedKmh: 3, gear: -1 }));
    feed(at(7, 0, 0.2, { speedKmh: 0, gear: 0 }));
    const done = feed(at(8.6, 0, 0.2, { speedKmh: 0, gear: 0 }));
    expect(done.done).toBe(true);
    expect(done.detail).toMatchObject({ attempts: 2 });
  });
});

describe("completeManeuver / roundabout (A10 — exit under right indicator)", () => {
  const params = parsed("completeManeuver", {
    maneuver: "roundabout",
    x: -38,
    y: -343,
    enterRadiusM: 26,
    exitRadiusM: 45,
  });
  const approach = makeTick({ t: 0, position: { x: 20, y: -343 } }); // 58 m out
  const inRing = makeTick({ t: 1, position: { x: -30, y: -330 } }); // ~15 m
  const exiting = (t: number, indicator: "off" | "left" | "right") =>
    makeTick({ t, position: { x: -38, y: -300 }, indicator }); // 43 m — annulus
  const out = (t: number, indicator: "off" | "left" | "right" = "off") =>
    makeTick({ t, position: { x: -38, y: -290 }, indicator }); // 53 m — outside

  it("requires entering before exiting counts", () => {
    // Approaching from 100 m away — outside exitRadius means nothing yet.
    const r = run(params, [makeTick({ t: 0, position: { x: 62, y: -343 } })]);
    expect(r.done).toBe(false);
  });

  it("completes after enter → exit with the right indicator in the exit window", () => {
    const r = run(params, [approach, inRing, exiting(2, "right"), out(3)]);
    expect(r.done).toBe(true);
  });

  it("the indicator on the exit-crossing tick itself also counts", () => {
    const r = run(params, [approach, inRing, out(2, "right")]);
    expect(r.done).toBe(true);
  });

  it("D4 cheat path: enter → exit WITHOUT the signal no longer completes, and voids the traversal", () => {
    let evalState: ObjectiveEvalState = createEvalState(params);
    let done = false;
    for (const tick of [approach, inRing, exiting(2, "off"), out(3, "off")]) {
      const r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
      done ||= r.done;
    }
    expect(done).toBe(false);
    // Traversal voided: signaling right NOW, already outside, earns nothing…
    let r = stepObjective(params, evalState, out(4, "right"));
    evalState = r.evalState;
    expect(r.done).toBe(false);
    expect(r.detail).toMatchObject({ kind: "roundabout", entered: false });
    // …the student must go around again and exit properly.
    for (const tick of [
      makeTick({ t: 5, position: { x: -30, y: -330 } }),
      makeTick({ t: 6, position: { x: -38, y: -300 }, indicator: "right" }),
    ]) {
      r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
    }
    r = stepObjective(params, evalState, out(7));
    expect(r.done).toBe(true);
  });

  it("signaling only on the APPROACH (before entering) earns nothing", () => {
    const signaledApproach = makeTick({
      t: 0,
      position: { x: -8, y: -343 }, // 30 m out — inside the annulus, not entered
      indicator: "right",
    });
    const r = run(params, [signaledApproach, inRing, exiting(2, "off"), out(3)]);
    expect(r.done).toBe(false);
  });

  it("a LEFT indicator (or none) in the exit window does not count", () => {
    const r = run(params, [approach, inRing, exiting(2, "left"), out(3)]);
    expect(r.done).toBe(false);
  });
});

describe("completeManeuver / threePointTurn (обратен завой — corridor-locked)", () => {
  // Corridor centred at the origin, axis due north: inside ⇔ |x| ≤ 4, |y| ≤ 6.
  // Start heading north (0); the turn must end facing back (~180°).
  const params = parsed("completeManeuver", {
    maneuver: "threePointTurn",
    corridor: { x: 0, y: 0, halfWidthM: 4, halfLengthM: 6 },
    startHeadingDeg: 0,
    toleranceDeg: 20,
    holdSec: 0.6,
  });
  /** Tick at (x, y) with the given speed/gear/heading. */
  const at = (
    t: number,
    x: number,
    y: number,
    over: Partial<ReturnType<typeof makeTick>> = {},
  ) => makeTick({ t, position: { x, y }, headingDeg: 0, ...over });

  it("rejects a malformed corridor or a missing start heading", () => {
    expect(() =>
      parsed("completeManeuver", { maneuver: "threePointTurn", startHeadingDeg: 0 }),
    ).toThrow(/corridor/);
    expect(() =>
      parsed("completeManeuver", {
        maneuver: "threePointTurn",
        corridor: { x: 0, y: 0, halfWidthM: 0, halfLengthM: 6 },
        startHeadingDeg: 0,
      }),
    ).toThrow(/corridor/);
    expect(() =>
      parsed("completeManeuver", {
        maneuver: "threePointTurn",
        corridor: { x: 0, y: 0, halfWidthM: 4, halfLengthM: 6 },
      }),
    ).toThrow(/startHeadingDeg/);
  });

  it("applies tolerance/hold defaults", () => {
    const p = parsed("completeManeuver", {
      maneuver: "threePointTurn",
      corridor: { x: 1, y: 2, halfWidthM: 4, halfLengthM: 6 },
      startHeadingDeg: 90,
    });
    expect(p).toMatchObject({ maneuver: "threePointTurn", toleranceDeg: 20, holdSec: 0.6 });
  });

  it("FIRES ON COMPLETION: forward → reverse → forward, ends facing back, at rest, held", () => {
    const r = run(params, [
      at(0, 0, 5, { speedKmh: 6, gear: 1, headingDeg: 0 }), // enter, forward-left (move 1)
      at(1, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 95 }), // reverse-right (move 2 — shunt 1)
      at(2, 0, 2, { speedKmh: 4, gear: 1, headingDeg: 160 }), // forward-away (move 3 — shunt 2)
      at(3, -1, 0, { speedKmh: 0, gear: 1, headingDeg: 180 }), // at rest facing south — hold starts
      at(3.4, -1, 0, { speedKmh: 0, gear: 0, headingDeg: 180 }), // held 0.4 s — not yet
      at(3.7, -1, 0, { speedKmh: 0, gear: 0, headingDeg: 180 }), // held 0.7 s ≥ 0.6 => done
    ]);
    expect(r.done).toBe(true);
    // A clean three-point turn: two direction changes → three movements.
    expect(r.detail).toMatchObject({ kind: "threePointTurn", reversals: 2, movements: 3, entered: true });
  });

  it("counts extra shunts: a five-point turn reports 5 movements", () => {
    const r = run(params, [
      at(0, 0, 5, { speedKmh: 5, gear: 1, headingDeg: 0 }),
      at(1, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 60 }), // shunt 1
      at(2, 0, 3, { speedKmh: 4, gear: 1, headingDeg: 110 }), // shunt 2
      at(3, 0, 2, { speedKmh: 4, gear: -1, headingDeg: 150 }), // shunt 3
      at(4, -1, 1, { speedKmh: 4, gear: 1, headingDeg: 175 }), // shunt 4
      at(5, -1, 0, { speedKmh: 0, gear: 1, headingDeg: 180 }),
      at(5.7, -1, 0, { speedKmh: 0, gear: 0, headingDeg: 180 }),
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ reversals: 4, movements: 5 });
  });

  it("FIRES ON FAILURE: stopping in the corridor still facing FORWARD never completes", () => {
    const r = run(params, [
      at(0, 0, 4, { speedKmh: 5, gear: 1, headingDeg: 0 }), // entered, forward
      at(1, 0, 0, { speedKmh: 0, gear: 1, headingDeg: 0 }), // at rest — but never turned
      at(3, 0, 0, { speedKmh: 0, gear: 0, headingDeg: 0 }), // held long — direction not reversed
    ]);
    expect(r.done).toBe(false);
    expect(r.detail).toMatchObject({ kind: "threePointTurn", movements: 1, headingToTargetDeg: 180 });
  });

  it("FIRES ON FAILURE: an incomplete turn (stops facing east, ~90°) does not complete", () => {
    const r = run(params, [
      at(0, 0, 5, { speedKmh: 5, gear: 1, headingDeg: 0 }),
      at(1, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 60 }), // shunt 1
      at(2, 0, 1, { speedKmh: 4, gear: 1, headingDeg: 90 }), // shunt 2, but only turned to east
      at(3, 0, 0, { speedKmh: 0, gear: 1, headingDeg: 90 }),
      at(3.7, 0, 0, { speedKmh: 0, gear: 0, headingDeg: 90 }),
    ]);
    expect(r.done).toBe(false); // heading 90° is 90° off the 180° target (> 20° tol)
  });

  it("FIRES ON FAILURE: reversing direction but coming to rest OUTSIDE the corridor", () => {
    const r = run(params, [
      at(0, 0, 5, { speedKmh: 5, gear: 1, headingDeg: 0 }),
      at(1, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 95 }),
      at(2, 0, 2, { speedKmh: 4, gear: 1, headingDeg: 160 }),
      at(3, 0, 10, { speedKmh: 0, gear: 1, headingDeg: 180 }), // faces back, but y=10 is outside
      at(3.7, 0, 10, { speedKmh: 0, gear: 0, headingDeg: 180 }),
    ]);
    expect(r.done).toBe(false);
  });

  it("rolling resets the hold clock", () => {
    const r = run(params, [
      at(0, 0, 4, { speedKmh: 4, gear: -1, headingDeg: 120 }),
      at(1, -1, 1, { speedKmh: 4, gear: 1, headingDeg: 178 }), // shunt, facing ~back
      at(2, -1, 0, { speedKmh: 0, gear: 1, headingDeg: 180 }), // stop begins
      at(2.4, -1, 0.2, { speedKmh: 5, gear: 1, headingDeg: 180 }), // rolled — clock resets
      at(3, -1, 0, { speedKmh: 0, gear: 0, headingDeg: 180 }), // only ~0 s held — not done
    ]);
    expect(r.done).toBe(false);
  });
});
