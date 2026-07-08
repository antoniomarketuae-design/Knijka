import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import { createEvalState, parseObjectiveParams, stepObjective } from "../objectives";
import type { ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

function parsed(kind: LessonObjective["kind"], params: Record<string, unknown>): ObjectiveParams {
  return parseObjectiveParams({ id: "o1", titleBg: "Тест", kind, params });
}

/** Run a tick sequence through one objective, returning done + final state. */
function run(params: ObjectiveParams, ticks: ReturnType<typeof makeTick>[]) {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let progress = 0;
  for (const tick of ticks) {
    const r = stepObjective(params, evalState, tick);
    evalState = r.evalState;
    progress = r.progress;
    if (r.done) {
      done = true;
      break;
    }
  }
  return { done, progress, evalState };
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

describe("completeManeuver / emergencyStop", () => {
  const params = parsed("completeManeuver", {
    maneuver: "emergencyStop",
    minApproachKmh: 40,
    minDecelMs2: 5,
  });
  const profile = (pairs: Array<[number, number]>) =>
    pairs.map(([t, v]) => makeTick({ t, speedKmh: v }));

  it("applies defaults", () => {
    const p = parsed("completeManeuver", { maneuver: "emergencyStop" });
    expect(p).toMatchObject({ maneuver: "emergencyStop", minApproachKmh: 40, minDecelMs2: 5 });
  });

  it("completes on a firm stop from speed (peak decel ≥ 5 m/s²)", () => {
    // 45 km/h → 0 in 1 s ≈ 12.5 m/s² — a decisive emergency brake.
    const r = run(params, profile([[0, 45], [1, 0]]));
    expect(r.done).toBe(true);
  });

  it("rejects a gentle coast to a halt and re-arms", () => {
    // 45 km/h → 0 over 5 s ≈ 2.5 m/s² — too soft to be an emergency stop.
    const soft = run(params, profile([[0, 45], [1, 36], [2, 27], [3, 18], [4, 9], [5, 0]]));
    expect(soft.done).toBe(false);

    // Re-armed: accelerate again and brake hard => done.
    let evalState = soft.evalState;
    let done = false;
    for (const tick of profile([[6, 42], [7, 0]])) {
      const r = stepObjective(params, evalState, tick);
      evalState = r.evalState;
      if (r.done) done = true;
    }
    expect(done).toBe(true);
  });

  it("does not complete if approach speed was never reached", () => {
    const r = run(params, profile([[0, 20], [1, 0]]));
    expect(r.done).toBe(false);
  });
});

describe("completeManeuver / parkInBay", () => {
  const params = parsed("completeManeuver", { maneuver: "parkInBay", holdSec: 1.5 });

  it("applies the holdSec default", () => {
    const p = parsed("completeManeuver", { maneuver: "parkInBay" });
    expect(p).toMatchObject({ maneuver: "parkInBay", holdSec: 1.5 });
  });

  it("completes after reverse gear + a held full stop", () => {
    const r = run(params, [
      makeTick({ t: 0, speedKmh: 8, gear: -1 }), // reversing into the bay
      makeTick({ t: 1, speedKmh: 3, gear: -1 }),
      makeTick({ t: 2, speedKmh: 0, gear: -1 }), // stop begins at t=2
      makeTick({ t: 3, speedKmh: 0, gear: 0 }), // held 1 s — not yet
      makeTick({ t: 3.6, speedKmh: 0, gear: 0 }), // held 1.6 s ≥ 1.5 s => done
    ]);
    expect(r.done).toBe(true);
  });

  it("does not complete without reverse gear", () => {
    const r = run(params, [
      makeTick({ t: 0, speedKmh: 5, gear: 1 }),
      makeTick({ t: 1, speedKmh: 0, gear: 1 }),
      makeTick({ t: 3, speedKmh: 0, gear: 1 }),
    ]);
    expect(r.done).toBe(false);
  });

  it("resets the stop clock if the car rolls again", () => {
    const r = run(params, [
      makeTick({ t: 0, speedKmh: 4, gear: -1 }),
      makeTick({ t: 1, speedKmh: 0, gear: -1 }), // stop begins
      makeTick({ t: 1.5, speedKmh: 6, gear: -1 }), // rolled again — clock resets
      makeTick({ t: 2, speedKmh: 0, gear: -1 }), // new stop begins at t=2
      makeTick({ t: 3, speedKmh: 0, gear: 0 }), // only 1 s held — not done
    ]);
    expect(r.done).toBe(false);
    expect(r.progress).toBeCloseTo(0.75, 5); // reverse used + currently stopped
  });
});

describe("completeManeuver / roundabout", () => {
  const params = parsed("completeManeuver", {
    maneuver: "roundabout",
    x: -38,
    y: -343,
    enterRadiusM: 26,
    exitRadiusM: 45,
  });

  it("requires entering before exiting counts", () => {
    // Approaching from 100 m away — outside exitRadius means nothing yet.
    const r = run(params, [makeTick({ t: 0, position: { x: 62, y: -343 } })]);
    expect(r.done).toBe(false);
  });

  it("completes after enter → exit", () => {
    const r = run(params, [
      makeTick({ t: 0, position: { x: 20, y: -343 } }), // approach (58 m out)
      makeTick({ t: 1, position: { x: -30, y: -330 } }), // inside ring (~15 m)
      makeTick({ t: 2, position: { x: -38, y: -300 } }), // exiting (43 m) — not yet
      makeTick({ t: 3, position: { x: -38, y: -290 } }), // 53 m out — exited
    ]);
    expect(r.done).toBe(true);
  });
});
