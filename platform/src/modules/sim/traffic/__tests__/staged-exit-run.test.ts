/**
 * FR-B5-EXIT (sweep161, 2026-08-18) — A STAGED ACTOR THAT RUNS OUT OF PATH
 * MUST LEAVE, NOT PARK ACROSS THE LESSON.
 *
 * WHAT WAS FOUND BY LOOKING. Five sweep-161 findings, all "BROKEN / critical",
 * all routed at `staged.ts`, all saying the same sentence in five accents:
 * *"the lesson's own event never happens"*. The frames back them —
 * `sc-ln-decisive-change/mobile-right/04-t123s.png` is an empty left lane at
 * t = 123 s under a briefing that turns on a car arriving in it, and
 * `sc-jx-giveway-b1/pc-right/04-t108s.png` is ЗАДАЧА 1/3 still showing after
 * 108 s of waiting for a priority stream that never comes.
 *
 * Driving those scenarios headlessly at level 1 with each one's compiled
 * ambient count found ONE mechanism under all five: a non-looping actor that
 * reaches the end of its path stopped on the last metre of it and stood there
 * for the rest of the lesson. `sc-lndc-target` at rest (4.06, 400.00) from
 * t ≈ 25 s — 185 s of a 210 s lesson with the left lane empty. `sc-mrg-mainline`
 * at rest (−8.13, 960.00) from t ≈ 40 s. And on `jxg-giveway-v1`,
 * `sc-jxgb-conflict` at rest (−120.00, 154.06) — in a live boulevard lane, with
 * the ambient priority stream dammed nose-to-tail behind it.
 *
 * The control is what settles it, and it is the first test below: driving the
 * give-way drill correctly and holding at the Б1 line, EVERY body in the world
 * covered 0.0 m over t = 150…210 s with the staged actors staged, against
 * 562.7 m and 560.1 m for the same two ambient cars with them not staged.
 *
 * Doc 87 FR-B5-VAN had already named this exact sentence as the defect and
 * then repaired it by lengthening ONE template's path. Every path is finite,
 * so the mechanism simply moved to the next district. It is fixed at the cause
 * here: the actor drives away.
 *
 * The three tests are the three directions the fix could be wrong in:
 *   1. it must actually unblock the stream (fails on the old behaviour),
 *   2. it must not become a licence to drive through anything,
 *   3. it must not change what a runner sees (`finished`, `s`) or what an
 *      actor that never reaches its end publishes.
 */
import { describe, expect, it } from "vitest";

import { compileScenario } from "../../lessons/scenario/compile";
import { SC_JX_GIVEWAY_B1 } from "../../lessons/scenario/templates-junctions";
import { createScenarioDirector, lessonSeed } from "../../orchestrator";
import { loadDistrict } from "../../world/referents";
import {
  applyStagedCommand,
  buildStagedVehiclePolylinePath,
  createStagedVehicle,
  updateStagedVehicle,
  type StagedEnv,
} from "../staged";
import { createTrafficSystem } from "../system";
import type { StagedVehicleSpec, TrafficDistrict, TrafficVehicleState } from "../types";
import { VEHICLE_PROFILE_LENGTH_M } from "../types";

const LANE_X = 4.0625;
/** The mouth-2 Б1 line is at y = 122.275; the drill stops just short of it. */
const YIELD_Y = 118;
const DT = 1 / 60;
/** The window the finding is about: the lesson's last minute. */
const WINDOW_FROM = 150;
const WINDOW_TO = 210;

/**
 * Drive the give-way drill the way its own instructions read — up the tertiary
 * street, stop short of the Б1 line, and WAIT, which is what the audited run
 * did for 180 s — and return how far each body travelled in the last minute.
 */
function metresCoveredLate(withStaged: boolean): Map<number, number> {
  const lesson = compileScenario(SC_JX_GIVEWAY_B1, 1);
  const traffic = createTrafficSystem(loadDistrict("jxg-giveway-v1") as TrafficDistrict, {
    anchor: { x: LANE_X, y: -115 },
    anchorRadiusM: lesson.traffic?.anchorRadiusM ?? 400,
    vehicleCount: lesson.traffic?.vehicleCount ?? 0,
    pedestrianCount: 0,
  });
  const director = createScenarioDirector(withStaged ? (lesson.stagedEvents ?? []) : [], traffic, {
    seed: lessonSeed(lesson.id),
  });

  let t = 0;
  let py = -115;
  let rolling = true;
  const last = new Map<number, { x: number; y: number }>();
  const moved = new Map<number, number>();
  while (t <= WINDOW_TO) {
    let pv = 0;
    if (rolling) {
      pv = 22 / 3.6;
      py += pv * DT;
      if (py >= YIELD_Y) {
        py = YIELD_Y;
        rolling = false;
      }
    }
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: LANE_X, y: py },
      playerSpeedKmh: pv * 3.6,
      playerHeadingDeg: 0,
    });
    director.step({
      tSec: t,
      dtSec: DT,
      x: LANE_X,
      y: py,
      speedKmh: pv * 3.6,
      headingDeg: 0,
      brakePedal: rolling ? 0 : 1,
      tickEvents: [],
    });
    if (t >= WINDOW_FROM) {
      for (const v of traffic.vehicles) {
        const p = last.get(v.id);
        if (p) moved.set(v.id, (moved.get(v.id) ?? 0) + Math.hypot(v.x - p.x, v.y - p.y));
        last.set(v.id, { x: v.x, y: v.y });
      }
    }
    t += DT;
  }
  return moved;
}

describe("FR-B5-EXIT — the priority stream clears", () => {
  it(
    "the ambient stream keeps circulating with the lesson's own actors staged",
    () => {
      // The control: the same district, the same seed, the same drive, with the
      // staged actors simply not staged. Whatever the ambient fleet manages
      // here is what the lesson is entitled to.
      const without = metresCoveredLate(false);
      const withThem = metresCoveredLate(true);
      const bestWithout = Math.max(...without.values());
      // Ambient ids are 0..n-1; staged ids start at STAGED_STATE_ID_BASE 1000.
      const ambientWith = [...withThem].filter(([id]) => id < 1000).map(([, m]) => m);
      const bestWith = Math.max(...ambientWith);

      // The control has to be a real stream, or this test proves nothing.
      expect(bestWithout).toBeGreaterThan(300);
      // MEASURED before the fix: every body in the world, ambient and staged,
      // covered 0.0 m across this whole window — the world was dead and the
      // student was waiting for a stream that could not come. Half the control
      // is a floor no deadlock can sneak under and no live fleet can miss.
      expect(
        bestWith,
        `busiest ambient body covered ${bestWith.toFixed(1)} m over t=${WINDOW_FROM}..${WINDOW_TO} s, against ${bestWithout.toFixed(1)} m with no staged actors`,
      ).toBeGreaterThan(bestWithout / 2);
    },
    300000,
  );
});

// ---------------------------------------------------------------------------
// The other two directions, on a bare straight path so the only thing moving
// is the mechanism under test.
// ---------------------------------------------------------------------------

const STRAIGHT: StagedVehicleSpec = {
  kind: "vehicle",
  id: "exit-probe",
  pathNodes: [],
  railPath: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  hold: { nodeIndex: 0, offsetM: 0 },
  cruiseSpeedMps: 10,
  playerGuard: false,
};

function env(ambient: TrafficVehicleState[]): StagedEnv {
  return {
    hasPlayer: false,
    playerX: 0,
    playerY: 0,
    playerSpeedMps: 0,
    crossingCounts: new Map(),
    ambient,
  };
}

function body(x: number, y: number): TrafficVehicleState {
  return { id: 7, x, y, dirX: 0, dirY: 1, speedMps: 0, braking: false, colorIndex: 0 };
}

function probe(ambient: TrafficVehicleState[]) {
  const path = buildStagedVehiclePolylinePath(STRAIGHT.railPath!)!;
  const agent = createStagedVehicle(STRAIGHT, path, 1000);
  const e = env(ambient);
  applyStagedCommand(agent, { type: "cruise" }, e);
  return { agent, e };
}

describe("FR-B5-EXIT — the retirement run is not a licence", () => {
  it("stops short of a body standing past the path end instead of driving through it", () => {
    // A car parked 20 m past the end of the path, dead in the retirement
    // corridor. The actor must LEAVE — and must still not clip.
    const blocker = body(120, 0);
    const { agent, e } = probe([blocker]);
    let closest = Infinity;
    for (let i = 0; i < 60 * 60; i++) {
      updateStagedVehicle(agent, DT, e);
      closest = Math.min(closest, Math.hypot(blocker.x - agent.state.x, blocker.y - agent.state.y));
    }
    // Two 4.1 m cars are interpenetrating below this many metres of centres.
    expect(
      closest,
      `closest approach ${closest.toFixed(2)} m of centres`,
    ).toBeGreaterThanOrEqual(VEHICLE_PROFILE_LENGTH_M.car);
    // …and it genuinely tried: it is past the end of its path, not parked on
    // the last metre. Without this half, a fix that simply never retires
    // anything would pass the clipping half above.
    expect(agent.state.x).toBeGreaterThan(100);
    expect(agent.state.x).toBeLessThan(120);
  });

  // ── THE OTHER BODY IN THE WORLD, AND IT IS THE ONE BEING GRADED ──────────
  //
  // The describe above says „not a licence to drive through ANYTHING" and then
  // only ever put an AMBIENT car in the way, because `closesOnAmbient` is the
  // only clamp the retirement branch consulted. The player guard (staged.ts
  // step 2) works by lowering `target`, and the retirement run does not read
  // `target` — it coasts on `exitSpeed`. So the sentence was true of the test
  // and false of the code: measured, the actor passed through a stationary
  // player at 0.000 m of centres, at 10 m/s, while an ambient body in the
  // identical geometry was cleared by 4.667 m.
  //
  // That is a student stopped where the drill told him to stop, rear-ended by
  // a car whose only remaining job is to leave, and billed COLLISION −10
  // опасна for it. Both directions are asserted: it must not reach him, and it
  // must still not be parked on the last metre of its path.
  it("stops short of the PLAYER standing past the path end, and still leaves", () => {
    const path = buildStagedVehiclePolylinePath(STRAIGHT.railPath!)!;
    // Same actor, with the guard every authored actor gets unless it is a
    // staged collision (`playerGuard` defaults true — STRAIGHT opts out).
    const agent = createStagedVehicle({ ...STRAIGHT, playerGuard: true }, path, 1000);
    const e: StagedEnv = { ...env([]), hasPlayer: true, playerX: 120, playerY: 0 };
    applyStagedCommand(agent, { type: "cruise" }, e);
    let closest = Infinity;
    for (let i = 0; i < 60 * 60; i++) {
      updateStagedVehicle(agent, DT, e);
      closest = Math.min(closest, Math.hypot(e.playerX - agent.state.x, e.playerY - agent.state.y));
    }
    expect(
      closest,
      `closest approach to the player ${closest.toFixed(3)} m of centres`,
    ).toBeGreaterThanOrEqual(VEHICLE_PROFILE_LENGTH_M.car);
    // …and it did retire: past the end of its path, short of the player.
    expect(agent.state.x).toBeGreaterThan(100);
    expect(agent.state.x).toBeLessThan(120);
  });

  it("an actor authored to ignore the player still ignores him while retiring", () => {
    // The opposite direction, so the clamp above cannot quietly become „staged
    // collisions no longer happen": `playerGuard: false` is how a template asks
    // for contact, and the retirement run must not overrule it either.
    const { agent, e: base } = probe([]);
    const e: StagedEnv = { ...base, hasPlayer: true, playerX: 120, playerY: 0 };
    for (let i = 0; i < 60 * 60; i++) updateStagedVehicle(agent, DT, e);
    expect(agent.state.x).toBeCloseTo(170, 3);
  });

  it("clears the scene when nothing is in the way, and travels only forward", () => {
    const { agent, e } = probe([]);
    for (let i = 0; i < 60 * 60; i++) updateStagedVehicle(agent, DT, e);
    // 70 m past the 100 m path end — beyond the ambient fleet's own 60 m
    // lookahead corridor, so no ambient agent can queue behind it any more.
    expect(agent.state.x).toBeCloseTo(170, 3);
    expect(agent.state.y).toBeCloseTo(0, 6);
    expect(agent.state.speedMps).toBe(0);
  });
});

describe("FR-B5-EXIT — what a runner sees is unchanged", () => {
  it("latches `finished` at the path end and never publishes an arc past it", () => {
    const { agent, e } = probe([]);
    let finishedAtArc = -1;
    let maxArc = 0;
    let brakingWhileRetiring = false;
    for (let i = 0; i < 60 * 60; i++) {
      const wasFinished = agent.finished;
      updateStagedVehicle(agent, DT, e);
      if (!wasFinished && agent.finished) finishedAtArc = agent.view.s;
      maxArc = Math.max(maxArc, agent.view.s);
      // A car driving out of the scene is not braking — lit lamps on a
      // departing car are the same lie as unlit lamps on a waiting one.
      if (agent.finished && agent.state.speedMps > 0 && agent.state.braking) {
        brakingWhileRetiring = true;
      }
    }
    expect(finishedAtArc).toBeCloseTo(agent.view.pathLengthM, 6);
    expect(maxArc).toBeCloseTo(agent.view.pathLengthM, 6);
    expect(brakingWhileRetiring).toBe(false);
  });

  it("an actor still on its path publishes exactly the path pose", () => {
    const { agent, e } = probe([]);
    for (let i = 0; i < 60 * 5; i++) updateStagedVehicle(agent, DT, e); // ~46 m in
    expect(agent.finished).toBe(false);
    expect(agent.exitM).toBe(0);
    // Straight path along +x at y = 0: any exit term would show up here.
    expect(agent.state.y).toBe(0);
    expect(agent.state.x).toBeCloseTo(agent.view.s, 6);
    expect(agent.state.x).toBeLessThan(100);
  });

  it("`reset` un-retires an actor that had already left", () => {
    const { agent, e } = probe([]);
    for (let i = 0; i < 60 * 60; i++) updateStagedVehicle(agent, DT, e);
    expect(agent.finished).toBe(true);
    expect(agent.exitM).toBeGreaterThan(0);
    // reset is the orchestrator's re-arm; a retired actor must come all the way
    // back to its hold pose, not to 70 m past the end of the road.
    applyStagedCommand(agent, { type: "reset" }, e);
    expect(agent.state.x).toBeCloseTo(0, 6);
    expect(agent.exitM).toBe(0);
    expect(agent.finished).toBe(false);
  });
});
