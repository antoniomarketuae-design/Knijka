/**
 * THE WORLD RUNS AT THE CAR'S PACE — O13/O19, the row routed twice and carried
 * unchanged through two rounds.
 *
 * A previous wave replaced the lesson clock so the ego car's two-second duties
 * are two seconds of the world it drives in (`lesson-ui/sessionClock.ts`). The
 * traffic system kept its own `MAX_DT_SEC = 0.1`, so below 10 fps the world
 * moved at a FIFTH of the pace of the car moving through it. MEASURED here
 * against the pre-fix build (`git show HEAD:…/system.ts` imported side by side,
 * real district, seed 7, 20 s of warm-up, then one frame):
 *
 *   one update(0.5)   pre-fix  8.825 m of ambient travel, timeSec +0.1000
 *                     post-fix 44.109 m,                  timeSec +0.5000   4.998×
 *
 * and `update(0.5)` was BIT-IDENTICAL to `update(0.1)` on the pre-fix build:
 * the ceiling did not slow the world, it threw 0.4 s away.
 *
 * WHAT THIS FILE HAS TO PROVE, in both directions, because a clock fix can lie
 * either way:
 *
 *   · the fifth is gone                              → `update(0.5)` moves the
 *     world the same distance the same half-second moves it at 60 Hz;
 *   · nothing above 10 fps moved                     → the golden below is the
 *     PRE-FIX playback, captured from the old file and asserted against the new
 *     one, so a "fix" that quietly re-times ordinary frames is caught;
 *   · the crossing still reads EMPTY when it is empty → §3's last test runs the
 *     released and the dormant pedestrian through the SAME loop and counts
 *     occupied frames in each. A gate that answers true always is the false
 *     certificate, and the first draft of that test did not catch it;
 *   · no body tunnels                                → §4 runs the refused fix
 *     ("just raise the clamp to 0.5") through the same loop and counts the
 *     bodies it puts through each other.
 *
 * EVERY ASSERTION HERE WAS BROKEN ON PURPOSE BEFORE IT WAS BELIEVED. The three
 * production mutations and what each kills:
 *
 *   M1  restore the truncation (`steps: 1, dt: min(dtSec, 0.1)`)
 *       → 6 red: the plan sum, the ceiling, the 0.5 s ratio, subdivided-not-
 *         widened, and the 5 fps and 2 fps crossing rows. The golden stays
 *         green, which is how we know it is guarding the other direction.
 *   M2  raise the clamp instead (`steps: 1, dt: min(dtSec, 0.5)`) — the fix the
 *       brief refused → 5 red, including BOTH tunnelling rows.
 *   M3  always take ≥ 2 sub-steps → 2 red: the pass-through and the pre-fix
 *       golden. Nothing else notices, which is exactly why the golden is here.
 */

import { describe, expect, it } from "vitest";
import { PHYSICS_MAX_FRAME_DT } from "@/components/sim/lesson-ui/sessionClock";
import type { SignalPhase } from "../../contracts";
import { buildLaneGraph } from "../graph";
import {
  applyStagedCommand,
  createStagedVehicle,
  resolveStagedVehiclePath,
  updateStagedVehicle,
  type StagedEnv,
} from "../staged";
import {
  createTrafficSystem,
  MAX_FRAME_DT_SEC,
  TRAFFIC_MAX_SUBSTEP_SEC,
  trafficSubStepPlan,
} from "../system";
import {
  DEFAULT_TRAFFIC_CONFIG,
  type StagedVehicleSpec,
  type TrafficSystem,
  type TrafficUpdateContext,
  type TrafficVehicleState,
} from "../types";
import { loadRealDistrict, makeSquareDistrict } from "./fixtures";

// ---------------------------------------------------------------------------
// 1 · The plan arithmetic
// ---------------------------------------------------------------------------

describe("trafficSubStepPlan", () => {
  it("never throws time away: steps × dt is exactly the frame", () => {
    for (const dtSec of [1 / 60, 1 / 30, 0.05, 0.1, 0.1000000001, 0.11, 0.15, 0.2, 0.25, 0.3, 0.4, 0.499, 0.5]) {
      const { steps, dt } = trafficSubStepPlan(dtSec);
      // Exact, not `toBeCloseTo`: the whole finding is a frame arriving short.
      expect(steps * dt, `sum at dt=${dtSec}`).toBe(dtSec);
    }
  });

  it("never hands a body a longer interval than the one that shipped", () => {
    // 0.1 is what `MAX_DT_SEC` used to truncate to, and §4 shows why widening
    // it instead of subdividing is the fix that had to be refused.
    for (let dtSec = 0.001; dtSec <= 4; dtSec += 0.001) {
      const { dt } = trafficSubStepPlan(dtSec);
      expect(dt, `sub-step at dt=${dtSec.toFixed(3)}`).toBeLessThanOrEqual(TRAFFIC_MAX_SUBSTEP_SEC);
    }
  });

  it("passes a sub-0.1 frame through untouched — one step, same argument", () => {
    for (const dtSec of [1 / 60, 1 / 30, 1 / 20, 0.05, 0.09999, TRAFFIC_MAX_SUBSTEP_SEC]) {
      expect(trafficSubStepPlan(dtSec)).toEqual({ steps: 1, dt: dtSec });
    }
  });

  it("refuses a frame that is zero, negative or NaN — the sessionClock ruling", () => {
    // NaN must not reach `timeSec`: one NaN there makes every sustain window
    // and scored comparison for the rest of the session answer false in silence.
    for (const bad of [0, -0, -1 / 60, NaN]) {
      expect(trafficSubStepPlan(bad), String(bad)).toEqual({ steps: 0, dt: 0 });
    }
  });

  it("caps a monstrous frame at the ego car's own ceiling, and at five sub-steps", () => {
    // 3,218 ms and 4,234 ms are real frames from docs/simulation/91_MOBILE_AUDIT
    // §G5 — the shader-compile stall in the first six seconds of every session
    // at phone dimensions.
    for (const dtSec of [0.6, 1, 3.218, 4.234, 1e6, Infinity]) {
      const { steps, dt } = trafficSubStepPlan(dtSec);
      expect(steps * dt, `capped at dt=${dtSec}`).toBe(MAX_FRAME_DT_SEC);
      expect(steps).toBe(5);
    }
  });

  it("that ceiling IS the ego car's — read out of the file that owns it", () => {
    // `sessionClock.ts` in turn reads @react-three/rapier's own `clamp(dt,0,0.5)`
    // out of node_modules. If either end moves, this fails instead of the world
    // silently drifting away from the car again.
    expect(MAX_FRAME_DT_SEC).toBe(PHYSICS_MAX_FRAME_DT);
  });
});

// ---------------------------------------------------------------------------
// 2 · The system: the fifth is gone, and nothing above 10 fps moved
// ---------------------------------------------------------------------------

const PHASES: SignalPhase[] = ["red", "redYellow", "green", "yellow"];

/** The determinism suite's scripted world, so this file grades the same drive. */
function script(DT: number) {
  let t = 0;
  const playerPos = { x: 0, y: 0 };
  const ctx: TrafficUpdateContext = {
    signalPhase: (id: string) => PHASES[(id.charCodeAt(id.length - 1) + Math.floor(t / 7)) % 4],
    playerPos,
    playerSpeedKmh: 30,
    playerHeadingDeg: 0,
  };
  return (s: TrafficSystem) => {
    t += DT;
    playerPos.x = 250 * Math.cos(t * 0.05);
    playerPos.y = 250 * Math.sin(t * 0.05);
    ctx.playerHeadingDeg = (t * 20) % 360;
    s.update(DT, ctx);
  };
}

const IDLE: TrafficUpdateContext = { signalPhase: () => "green", playerPos: null };

function travelOf(system: TrafficSystem, before: ReadonlyArray<{ x: number; y: number }>): number {
  let sum = 0;
  for (let i = 0; i < before.length; i++) {
    sum += Math.hypot(system.vehicles[i].x - before[i].x, system.vehicles[i].y - before[i].y);
  }
  return sum;
}

function snapshot(system: TrafficSystem) {
  return system.vehicles.map((v) => ({ x: v.x, y: v.y }));
}

describe("one slow frame is one frame of world", () => {
  it("a 0.5 s frame moves the world as far as that half-second does at 60 Hz", () => {
    const district = loadRealDistrict();
    const big = createTrafficSystem(district, { seed: 7 });
    const fine = createTrafficSystem(district, { seed: 7 });
    const warmBig = script(1 / 60);
    const warmFine = script(1 / 60);
    for (let i = 0; i < 1200; i++) {
      warmBig(big);
      warmFine(fine);
    }

    const b0 = snapshot(big);
    const f0 = snapshot(fine);
    big.update(MAX_FRAME_DT_SEC, IDLE);
    for (let i = 0; i < 30; i++) fine.update(1 / 60, IDLE);

    const oneFrame = travelOf(big, b0);
    const sameHalfSecond = travelOf(fine, f0);

    // MEASURED against the pre-fix build in the identical setup: the same
    // `update(0.5)` returned 8.825 m against this control's ~44 m, i.e. 0.200×.
    // MUTATION: restore `const dt = dtSec > 0.1 ? 0.1 : dtSec` and this ratio
    // drops to 0.20 and the assertion fails. It is the finding itself.
    const ratio = oneFrame / sameHalfSecond;
    expect(ratio, `one 0.5 s frame moved ${oneFrame.toFixed(3)} m against ${sameHalfSecond.toFixed(3)} m`)
      .toBeGreaterThan(0.97);
    expect(ratio).toBeLessThan(1.03);

    // …and the clock the rule engine shares with it advanced by the whole frame.
    expect(big.timeSec - fine.timeSec).toBeCloseTo(0, 9);
  });

  it("and the frame is subdivided, not widened — five steps of 0.1, not one of 0.5", () => {
    expect(trafficSubStepPlan(MAX_FRAME_DT_SEC)).toEqual({ steps: 5, dt: TRAFFIC_MAX_SUBSTEP_SEC });
  });

  /**
   * THE PRE-FIX GOLDEN. Captured 2026-08-19 by importing `HEAD`'s own
   * `system.ts` beside the new one and driving both through `script(1/60)` for
   * 1800 frames on the real district at seed 7. Every published byte of all 10
   * cars and 8 pedestrians matched at dt = 1/60, 1/30, 1/20, 0.05 and 0.1; the
   * four rows below are that run, and they are asserted EXACTLY.
   *
   * This is the false-certificate direction of this lane. A sub-step loop that
   * re-times ordinary frames — an off-by-one, a trailing sliver step, a `dt`
   * recomputed per body — would still make §2's ratio green while quietly
   * moving every gap, every sustain window and every graded verdict on the
   * machines that were fine. Only a golden taken from the OLD code can catch it.
   */
  it("is bit-identical to the pre-fix build above 10 fps", () => {
    const system = createTrafficSystem(loadRealDistrict(), { seed: 7 });
    const step = script(1 / 60);
    for (let i = 0; i < 1800; i++) step(system);

    expect(system.timeSec).toBe(29.999999999999577);
    expect([system.vehicles[0].x, system.vehicles[0].y, system.vehicles[0].speedMps]).toEqual([
      -44.89081338110693, 211.38362583425754, 11.475623702503672,
    ]);
    expect([system.vehicles[3].x, system.vehicles[3].y, system.vehicles[3].speedMps]).toEqual([
      462.24910097334146, -291.9428485855432, 0,
    ]);
    expect([system.pedestrians[0].x, system.pedestrians[0].y]).toEqual([
      16.174578620019197, -441.84212833321845,
    ]);
    expect([system.pedestrians[5].x, system.pedestrians[5].y]).toEqual([
      -212.95925482589402, 165.99407057653582,
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3 · What it cost a student: the crossing the phone reported clear
// ---------------------------------------------------------------------------

const PLAYER_MPS = 50 / 3.6;
const CROSSING_X = 150;
/** 50 m out = 3.6 s of approach at 50 km/h. */
const START_X = 100;

/**
 * Walk a player up the AB edge at a constant 50 km/h in frames of `dt`, with a
 * staged pedestrian released to cross at the same moment. The player advances
 * by the WHOLE frame — that is what `LessonScene` does since the lesson clock
 * landed — so this is precisely "a car at full pace inside a world that was
 * running at a fifth".
 */
function approachCrossing(dt: number) {
  const system = createTrafficSystem(makeSquareDistrict({ crossingOnAB: true }), {
    seed: 5,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const ped = system.stage({
    kind: "pedestrian",
    id: "ped-1",
    path: [
      { x: CROSSING_X, y: 9.7 },
      { x: CROSSING_X, y: -13.8 },
    ],
    speedMps: 1.25, // an ordinary walk, not a dart-out
    crossingId: "x1",
    roadFromM: 1.2,
    roadToM: 18.3,
  })!;
  system.stagedCommand("ped-1", { type: "cruise" });

  let x = START_X;
  let onCrossingAtArrival: boolean | null = null;
  let pedSAtArrival = -1;
  let everOnCrossing = false;
  const frames = Math.round(18 / dt);
  for (let i = 0; i < frames; i++) {
    const prevX = x;
    x += PLAYER_MPS * dt;
    system.update(dt, {
      signalPhase: () => "green",
      playerPos: { x, y: -4 },
      playerSpeedKmh: 50,
      playerHeadingDeg: 90,
    });
    if (system.pedestrianOnCrossing("x1")) everOnCrossing = true;
    if (onCrossingAtArrival === null && prevX < CROSSING_X && x >= CROSSING_X) {
      onCrossingAtArrival = system.pedestrianOnCrossing("x1");
      pedSAtArrival = ped.s;
    }
  }
  return {
    onCrossingAtArrival,
    pedSAtArrival,
    everOnCrossing,
    clearedAtEnd: system.pedestrianOnCrossing("x1"),
    pedS: ped.s,
  };
}

describe("«пропусни пешеходеца» is graded against the same world at every frame rate", () => {
  /**
   * MEASURED before the fix, same harness, `ped.s` when the player's bumper
   * reaches the crossing (roadway span 1.2–18.3 m):
   *
   *   60 fps 4.50 m on   ·  30 fps 4.54 m on  ·  10 fps 4.63 m on
   *    5 fps 2.38 m on   ·   2 fps 1.00 m OFF — still on the kerb, crossing
   *                          reported CLEAR
   *
   * and after: 4.50 / 4.54 / 4.63 / 4.75 / 5.00, on at every rate. The 2 fps
   * row is both crimes at once — the student who correctly stops is graded
   * against an empty road, and the student who drives through is not marked.
   *
   * MUTATION: restore the truncation and the `dt = 0.5` case returns false.
   */
  for (const [dt, label] of [
    [1 / 60, "60 fps"],
    [1 / 30, "30 fps"],
    [0.1, "10 fps"],
    [0.2, "5 fps"],
    [MAX_FRAME_DT_SEC, "2 fps"],
  ] as const) {
    it(`${label}: the pedestrian is on the roadway when the player arrives`, () => {
      const r = approachCrossing(dt);
      expect(r.onCrossingAtArrival, `ped was ${r.pedSAtArrival.toFixed(2)} m along a 1.2–18.3 m span`)
        .toBe(true);
      // The other direction of the same gate, in the same run: a crossing that
      // answers `true` unconditionally would satisfy the line above and teach
      // a student to stop for nobody.
      expect(r.everOnCrossing).toBe(true);
      expect(r.clearedAtEnd, "still occupied 18 s later — the gate never releases").toBe(false);
    });
  }

  /**
   * THE FALSE-CERTIFICATE ARM, AND IT HAD TO BE REWRITTEN ONCE.
   *
   * The first version stood a dormant pedestrian at the kerb, drove 18 s of the
   * longest frame and asserted the crossing read clear. MUTATION: release that
   * pedestrian, so the crossing MUST become occupied — and the test stayed
   * green, because after 18 s of walking the actor had already cleared the
   * 18.3 m roadway span and the final sample was false for the wrong reason.
   * A check that survives its own refutation guards nothing.
   *
   * So both arms now run in one test, sampled EVERY frame rather than at the
   * end: the released actor must occupy the crossing at some frame, and the
   * dormant one must occupy it at none. Releasing the dormant arm now fails it
   * by construction, and a `pedestrianOnCrossing` hard-wired to either constant
   * fails one arm or the other.
   */
  it("reports the crossing occupied only when somebody is actually on it", () => {
    const walk = (release: boolean) => {
      const system = createTrafficSystem(makeSquareDistrict({ crossingOnAB: true }), {
        seed: 5,
        vehicleCount: 0,
        pedestrianCount: 0,
      });
      system.stage({
        kind: "pedestrian",
        id: "ped-1",
        path: [
          { x: CROSSING_X, y: 9.7 },
          { x: CROSSING_X, y: -13.8 },
        ],
        speedMps: 1.25,
        crossingId: "x1",
        roadFromM: 1.2,
        roadToM: 18.3,
      });
      if (release) system.stagedCommand("ped-1", { type: "cruise" });
      let occupiedFrames = 0;
      for (let i = 0; i < 36; i++) {
        system.update(MAX_FRAME_DT_SEC, IDLE);
        if (system.pedestrianOnCrossing("x1")) occupiedFrames++;
      }
      return occupiedFrames;
    };

    // Released: 18.3 − 1.2 = 17.1 m of roadway at 1.25 m/s ≈ 13.7 s of it, so
    // roughly 27 of the 36 half-second frames must read occupied.
    expect(walk(true), "a pedestrian crossed and the gate never fired").toBeGreaterThan(20);
    // Dormant at the kerb: not one frame of it, at the longest frame this
    // system now accepts. Sub-stepping must not walk an actor nobody released.
    expect(walk(false), "an empty crossing reported an occupant").toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4 · No tunnelling — and what the refused fix would have cost
// ---------------------------------------------------------------------------

/**
 * WHY THE CLAMP COULD NOT SIMPLY BE RAISED.
 *
 * `staged.ts`'s hard anti-overlap clamp (`closesOnAmbient`, staged.ts:409) is a
 * POST-STEP test: it refuses a step whose END lands inside the separation
 * bubble. Car against car that bubble is 2.05 + 2.05 + 0.5 = 4.6 m, so a step
 * that carries a body more than 9.2 m of closing travel can start clear, finish
 * clear, and have crossed the other body in between — the classic non-swept
 * failure, and exactly what `MAX_DT_SEC = 0.1` was buying.
 *
 * The boundary is that geometry and nothing else: 0.25 s at the fastest
 * authored `cruiseSpeedMps` (36) is 9.0 m and clean; 0.5 s is 18 m and not.
 */
const SEPARATION_BUBBLE_M = 4.6;

const sweepDistrict = makeSquareDistrict();
const sweepGraph = buildLaneGraph(sweepDistrict, {
  laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
  excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
  crossingSignalRadiusM: 45,
});

/** A staged car at a rolling start, and one stopped ambient car in its lane. */
function blockedLane(cruiseMps: number, blockerX: number) {
  const spec: StagedVehicleSpec = {
    kind: "vehicle",
    id: "car",
    pathNodes: ["A", "B", "C"],
    hold: { nodeIndex: 0, offsetM: 40 },
    cruiseSpeedMps: cruiseMps,
  };
  const path = resolveStagedVehiclePath(sweepGraph, spec.pathNodes, 0)!;
  const agent = createStagedVehicle(spec, path, 1000);
  const blocker: TrafficVehicleState = {
    id: 1,
    x: blockerX,
    y: agent.state.y, // the actor's own lane centre
    dirX: 1,
    dirY: 0,
    speedMps: 0,
    braking: true,
    colorIndex: 0,
  };
  const env: StagedEnv = {
    hasPlayer: false,
    playerX: 0,
    playerY: 0,
    playerSpeedMps: 0,
    crossingCounts: new Map(),
    ambient: [blocker],
  };
  applyStagedCommand(agent, { type: "cruise" }, env);
  agent.speed = cruiseMps; // already travelling when it meets the blocker
  return { agent, env, blocker };
}

/**
 * Drive 20 s of world time with a given step size and count how many starting
 * PHASES end with the actor on the far side of a body it never touched. The
 * phase matters: whether a jump straddles the bubble depends on where in the
 * approach the step boundaries fall, so one alignment proves nothing and 600
 * of them, 5 cm apart, cover every alignment a 18 m step can have.
 */
function tunnelSweep(stepSec: number, cruiseMps: number): number {
  let tunnelled = 0;
  for (let k = 0; k < 600; k++) {
    const { agent, env, blocker } = blockedLane(cruiseMps, 120 + k * 0.05);
    const n = Math.round(20 / stepSec);
    for (let i = 0; i < n; i++) {
      updateStagedVehicle(agent, stepSec, env);
      if (agent.state.x > blocker.x + 0.5) {
        tunnelled++;
        break;
      }
    }
  }
  return tunnelled;
}

describe("no body tunnels at the largest frame this now accepts", () => {
  it("the sub-step is short enough that the bubble cannot be jumped", () => {
    const FASTEST_AUTHORED_MPS = 36;
    const travelPerSubStep = FASTEST_AUTHORED_MPS * TRAFFIC_MAX_SUBSTEP_SEC;
    // 3.6 m against the 9.2 m a body would have to cover to start clear, finish
    // clear and be through. The margin is 2.56×, and it is arithmetic, not luck.
    expect(travelPerSubStep).toBeLessThan(2 * SEPARATION_BUBBLE_M);
  });

  for (const cruise of [30, 36]) {
    it(`${cruise} m/s: 0 of 600 phases tunnel at the shipped sub-step`, () => {
      expect(tunnelSweep(TRAFFIC_MAX_SUBSTEP_SEC, cruise)).toBe(0);
      // …and every step the plan can produce is at most that long.
      expect(tunnelSweep(trafficSubStepPlan(MAX_FRAME_DT_SEC).dt, cruise)).toBe(0);
    });

    /**
     * THE MUTATION, RUN RATHER THAN DESCRIBED. This is the convenient fix —
     * leave one step per frame and raise the ceiling to 0.5 — driven through
     * the identical loop. MEASURED 2026-08-19: 150/600 phases at 30 m/s and
     * 203/600 at 36 m/s put the staged car clean through a stopped ambient car.
     * At every step ≤ 0.25 s (≤ 9.0 m of travel, under the 9.2 m bubble) it is
     * 0/600. The assertion is `>0`, not the exact count, so a change in the
     * guard tuning cannot make this test lie about the direction.
     */
    it(`${cruise} m/s: raising the clamp instead would drive bodies through each other`, () => {
      const straddles = MAX_FRAME_DT_SEC * cruise > 2 * SEPARATION_BUBBLE_M;
      expect(straddles, "a 0.5 s step at this speed clears the bubble in one jump").toBe(true);
      expect(tunnelSweep(MAX_FRAME_DT_SEC, cruise)).toBeGreaterThan(0);
    });
  }

  it("…and the ambient fleet is still held off the player through a slow frame", () => {
    // The kinematic promise in vehicles.ts is re-asserted on every sub-step
    // (it reads the agent's own fresh pose), so five short steps assert it five
    // times where one long step asserted it once.
    const system = createTrafficSystem(makeSquareDistrict(), {
      seed: 11,
      vehicleCount: 4,
      pedestrianCount: 0,
    });
    const px = 200;
    const py = -4.06; // the A->B lane centre the seeded fleet runs down
    const ctx: TrafficUpdateContext = {
      signalPhase: () => "green",
      playerPos: { x: px, y: py },
      playerSpeedKmh: 0,
      playerHeadingDeg: 90,
    };
    let minCentreM = Infinity;
    for (let i = 0; i < 240; i++) {
      system.update(MAX_FRAME_DT_SEC, ctx);
      for (const v of system.vehicles) {
        const d = Math.hypot(v.x - px, v.y - py);
        if (d < minCentreM) minCentreM = d;
      }
    }
    // 4.9 m is `2 × HALF_LEN + 0.8` — the standoff vehicles.ts promises.
    expect(minCentreM, "an ambient car ended up inside the student").toBeGreaterThan(4.5);
  });
});
