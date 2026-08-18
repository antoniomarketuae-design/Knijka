/**
 * WAS THE ACTOR IN THE PICTURE? — the VRU family, sweep161 read a third time
 * (2026-08-18).
 *
 * Three batteries now stand over these five lessons and each asks a different
 * question. `vru-title-truth-and-encounter.test.ts` asks whether the GRADE is
 * honest once the encounter happens. `vru-staged-encounter-reach.test.ts` asks
 * whether a student driving at a pace nobody authored can REACH the actor at
 * all. This one asks the question the frames forced: at the exact instants the
 * sweep photographed, WHERE WAS THE ACTOR, and is the rig the template asks the
 * fleet for the rig the fleet would draw?
 *
 * It exists because four of sweep161's seven BROKEN findings against
 * templates-vru.ts say some version of „the lesson's own actor is never
 * visible", and a template file has exactly two ways to be responsible for
 * that: it can put the actor somewhere the camera is not, or it can ask for a
 * model the fleet does not have. Everything below measures those two, in the
 * production stack, so that the day either one breaks the routing turns red
 * instead of quietly becoming true — and so that a later sweep cannot be
 * answered with „the frames under-sample" a second time.
 *
 * NOTHING HERE IS A TRIPWIRE. Every assertion is green today and every one of
 * them is a direction a repair must not cost anything.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict, TrafficVehicleState } from "../../../traffic/types";
import {
  CYCLIST_MODEL_INDEX,
  EMERGENCY_MODEL_INDEX,
  modelForVehicle,
} from "../../../traffic/vehicleFleet";
import { createRuleEngine } from "../../../rules";
import { createScenarioDirector } from "../../../orchestrator/director";
import { DT, stepFrame, type Stack } from "../../../orchestrator/__tests__/helpers";
import type { StagedEventSpec } from "../../../contracts";
import { createEvalState, stepObjective } from "../../objectives";
import { makeTick } from "../../__tests__/fixtures";
import type { ScenarioTrace } from "../../../traces/types";
import {
  SC_VU_CYCLIST_HOOK,
  SC_VU_EMERGENCY,
  SC_VU_EMERGENCY_JUNCTION,
  SC_VU_PASS_CLEARANCE,
} from "../templates-vru";

const REPO_ROOT = join(process.cwd(), "..");
const loadDistrict = (id: string): TrafficDistrict =>
  JSON.parse(readFileSync(join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));

/** The live hero car's launch ramp, read off the deployed build's own speed
 *  probe (17 км/ч at t = 1 s, 52 км/ч at t = 6 s) — NOT the recorder's 2.2. */
const HERO_ACCEL_MPS2 = 1.95;
/** The sweep's careful bot: CRUISE_KMH 12 in lesson-audit.mjs, and it never
 *  read above 15 км/ч on any VRU leg. */
const CRAWL_MPS = 2.8;

/** Same wiring `makeStack` gives district-v1, for the VRU maps: seven query
 *  hookups, ambient traffic zeroed so the staged actor is the only other road
 *  user, seed 7 (which also fixes the runners' release jitter). */
function makeStackFor(districtId: string, events: StagedEventSpec[]): Stack {
  const raw = loadDistrict(districtId);
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  runtime.setCyclistQuery((px, py, h, r) => traffic.cyclistNear(px, py, h, r));
  runtime.setOvertakenQuery((px, py, h, r) => traffic.overtakenNear(px, py, h, r));
  return {
    runtime,
    traffic,
    director: createScenarioDirector(events, traffic, { seed: 7, signals: runtime }),
    rules: createRuleEngine(),
    ruleEvents: [],
    ticks: [],
    outcomes: [],
    t: 0,
  };
}

/** The staged actor's PUBLISHED traffic state — the object TrafficLayer hands
 *  the fleet builder, not the director's private view. */
function publishedState(stack: Stack): TrafficVehicleState {
  // STAGED_STATE_ID_BASE is 1000; ambient counts are zero, so there is exactly
  // one entry and it is the lesson's actor.
  const staged = stack.traffic.vehicles.filter((v) => v.id >= 1000);
  expect(staged).toHaveLength(1);
  return staged[0];
}

// ---------------------------------------------------------------------------
// 1. The render handoff this file owns
// ---------------------------------------------------------------------------

/**
 * `modelForVehicle` is the ENTIRE decision about which rig gets drawn: it is
 * what `buildTrafficFleet` calls per vehicle to choose an instanced mesh, and
 * `profile` is its only input besides the id. So this is the exact seam between
 * a number authored in templates-vru.ts and a body on the glass, and asserting
 * it here means „the ambulance is a blue hatchback now" cannot happen by
 * deleting one line while tidying a spec.
 *
 * MEASURED 2026-08-18 through the production stack (the numbers the header's
 * second-pass section quotes): emergency → 15, cyclist → 17.
 */
const RENDER_CONTRACT: ReadonlyArray<{
  specId: string;
  districtId: string;
  actorId: string;
  profile: "emergency" | "cyclist";
  modelIndex: number;
  staged: readonly StagedEventSpec[];
}> = [
  {
    specId: "sc-vu-emergency",
    districtId: "ln-v1",
    actorId: "sc-vue-approach",
    profile: "emergency",
    modelIndex: EMERGENCY_MODEL_INDEX,
    staged: (SC_VU_EMERGENCY.staged ?? []) as readonly StagedEventSpec[],
  },
  {
    specId: "sc-vu-emergency-junction",
    districtId: "tj-rhr-v1",
    actorId: "sc-vuej-ev",
    profile: "emergency",
    modelIndex: EMERGENCY_MODEL_INDEX,
    staged: (SC_VU_EMERGENCY_JUNCTION.staged ?? []) as readonly StagedEventSpec[],
  },
  {
    specId: "sc-vu-cyclist-hook",
    districtId: "vu-cyclist-v1",
    actorId: "sc-vu-cyclist",
    profile: "cyclist",
    modelIndex: CYCLIST_MODEL_INDEX,
    staged: (SC_VU_CYCLIST_HOOK.staged ?? []) as readonly StagedEventSpec[],
  },
  {
    specId: "sc-vu-pass-clearance",
    districtId: "vu-pass-v1",
    actorId: "sc-vup-cyclist",
    profile: "cyclist",
    modelIndex: CYCLIST_MODEL_INDEX,
    staged: (SC_VU_PASS_CLEARANCE.staged ?? []) as readonly StagedEventSpec[],
  },
];

describe("vru: the rig this template asks the fleet for", () => {
  for (const row of RENDER_CONTRACT) {
    it(`${row.specId}/${row.actorId} publishes profile "${row.profile}" and resolves to its own rig`, () => {
      const stack = makeStackFor(row.districtId, [...row.staged]);
      // One frame is enough: stage() runs on the director's first step, which
      // is also when LessonScene stages — before TrafficLayer mounts.
      stepFrame(
        stack,
        { x: 0, y: 0, headingDeg: 0, speedKmh: 0, brakePedal: 0 },
        { indicator: "off", mirrorGlance: null },
      );
      const state = publishedState(stack);
      expect(state.profile).toBe(row.profile);
      expect(modelForVehicle(state)).toBe(row.modelIndex);
      // …and the two rigs are genuinely different models, so this table can
      // never pass by both sides collapsing onto one fallback.
      expect(EMERGENCY_MODEL_INDEX).not.toBe(CYCLIST_MODEL_INDEX);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. sc-vu-emergency — the ambulance at the three instants the sweep shot
// ---------------------------------------------------------------------------

/** ln-v1 lane centres (meta.scenario) — the right lane every student spawns in
 *  and the LEFT lane that is the EV's чл. 91 corridor. */
const EM_RIGHT_X = 12.19;
const EM_LEFT_X = 4.06;

/** Poses of both cars, sampled on the frame nearest each whole second. */
function emergencyPoses(seconds: readonly number[]): Map<
  number,
  { playerY: number; ev: { x: number; y: number; speedMps: number } }
> {
  const stack = makeStackFor("ln-v1", [...(SC_VU_EMERGENCY.staged ?? [])] as StagedEventSpec[]);
  const want = new Set(seconds);
  const out = new Map<number, { playerY: number; ev: { x: number; y: number; speedMps: number } }>();
  let y = 15; // ln-spawn-start
  let v = 0;
  for (let i = 0; i < 30 * 40 && out.size < want.size; i++) {
    v = Math.min(CRAWL_MPS, v + HERO_ACCEL_MPS2 * DT);
    y += v * DT;
    stepFrame(
      stack,
      { x: EM_RIGHT_X, y, headingDeg: 0, speedKmh: v * 3.6, brakePedal: 0 },
      { indicator: "off", mirrorGlance: null },
    );
    const whole = Math.round(stack.t);
    if (want.has(whole) && !out.has(whole) && Math.abs(stack.t - whole) < DT / 2) {
      const a = stack.traffic.staged("sc-vue-approach")!;
      out.set(whole, { playerY: y, ev: { x: a.x, y: a.y, speedMps: a.speedMps } });
    }
  }
  return out;
}

describe("sc-vu-emergency: the ambulance was inside the shot the sweep says is empty", () => {
  it("mirror at t = 1 s and t = 6 s, windscreen at t = 12 s — measured at the sweep's own pace", () => {
    // THE FRAMES THIS PINS: sc-vu-emergency/pc-right 04-t001s.png (empty
    // mirror), 04-t006s.png (empty mirror, 0 км/ч), 04-t012s.png (empty
    // four-lane boulevard, 11 км/ч). The careful bot's whole drive is a
    // creep-and-stop under CRUISE_KMH 12; held here at a flat 2.8 m/s, which
    // is the FASTEST it ever was, so every distance below is an upper bound on
    // how far away the ambulance could have been.
    const p = emergencyPoses([1, 6, 12]);

    const t1 = p.get(1)!;
    // Behind the player and inside the mirror: 15.3 m measured.
    expect(t1.playerY - t1.ev.y).toBeGreaterThan(5);
    expect(t1.playerY - t1.ev.y).toBeLessThan(25);

    const t6 = p.get(6)!;
    // Still behind — 3.0 m measured — i.e. filling the mirror, about to pass.
    expect(t6.playerY - t6.ev.y).toBeGreaterThan(0);
    expect(t6.playerY - t6.ev.y).toBeLessThan(10);
    expect(t6.ev.speedMps).toBeGreaterThan(5);

    const t12 = p.get(12)!;
    // Past him and dead ahead in the left lane — 61 m measured, which on a
    // 400 m straight boulevard is the middle of the windscreen.
    expect(t12.ev.y - t12.playerY).toBeGreaterThan(30);
    expect(t12.ev.y - t12.playerY).toBeLessThan(90);

    // THE OTHER DIRECTION, so „make it visible" can never be answered by
    // parking the ambulance on top of the student: it holds the LEFT lane —
    // its own чл. 91 corridor, 8.13 m off the student's line — at all three.
    for (const t of [1, 6, 12]) expect(p.get(t)!.ev.x).toBeCloseTo(EM_LEFT_X, 1);
  });
});

// ---------------------------------------------------------------------------
// 3. sc-vu-emergency-junction — the crossing is not a three-second flash
// ---------------------------------------------------------------------------

/** tj-rhr-v1 stem lane centre and spawn (tj-spawn-south). */
const VUEJ_LANE_X = 4.0625;
const VUEJ_SPAWN_Y = -105;

/**
 * Drive the stem at the sweep's careful pace and report, per whole second, how
 * far the ambulance still is out on the east arm and how fast it is going.
 */
function junctionApproach(): Map<number, { playerY: number; evX: number; evSpeed: number }> {
  const stack = makeStackFor("tj-rhr-v1", [
    ...(SC_VU_EMERGENCY_JUNCTION.staged ?? []),
  ] as StagedEventSpec[]);
  const out = new Map<number, { playerY: number; evX: number; evSpeed: number }>();
  let y = VUEJ_SPAWN_Y;
  let v = 0;
  for (let i = 0; i < 30 * 60; i++) {
    v = Math.min(CRAWL_MPS, v + HERO_ACCEL_MPS2 * DT);
    y += v * DT;
    stepFrame(
      stack,
      { x: VUEJ_LANE_X, y, headingDeg: 0, speedKmh: v * 3.6, brakePedal: 0 },
      { indicator: "off", mirrorGlance: null },
    );
    const whole = Math.round(stack.t);
    if (!out.has(whole) && Math.abs(stack.t - whole) < DT / 2) {
      const a = stack.traffic.staged("sc-vuej-ev")!;
      out.set(whole, { playerY: y, evX: a.x, evSpeed: a.speedMps });
    }
  }
  return out;
}

describe("sc-vu-emergency-junction: the ambulance is on screen for seconds, not for a flash", () => {
  it("it runs the east arm in front of the careful student for ~18 s, across five sweep frames", () => {
    // THE CLAIM THIS RETIRES, from this file's own header: „the frames DO
    // under-sample: at 5–6 s spacing a 3 s crossing is missed more often than
    // caught." The crossing is not 3 s. Measured at the sweep's careful pace:
    // the EV holds at x = 95 until t = 13.3 s, then x = 81 at t = 17, 58 at
    // t = 22, 20 at t = 27, through the box at t ≈ 29.5, past x = −30 at
    // t = 32.0.
    const p = junctionApproach();

    // THE WINDOW ITSELF, first, because it is the claim that retires the
    // excuse: the seconds during which the ambulance is both MOVING and still
    // short of x = −30 (i.e. approaching or in the box, ahead of a student
    // climbing the stem). Fifteen is the bar because the sweep's frame cadence
    // is 5–6 s: at or above it the ambulance is photographed three times or
    // more, and „the cadence missed it" stops being a possible answer.
    const onScreen = [...p.entries()]
      .filter(([, s]) => s.evSpeed > 0.5 && s.evX > -30)
      .map(([t]) => t);
    expect(Math.max(...onScreen) - Math.min(...onScreen)).toBeGreaterThanOrEqual(15);

    // Dormant while the student is still far down the stem…
    expect(p.get(10)!.evSpeed).toBe(0);
    // …then moving, and moving at every instant the sweep photographed.
    for (const t of [17, 22, 27]) {
      const s = p.get(t)!;
      expect(s.evSpeed, `EV stationary at t=${t}s`).toBeGreaterThan(0.5);
      // Ahead of him on the east arm, inside the forward cone — 100 m, 73 m
      // and 45 m of straight-line separation measured, on a map whose own east
      // arm is 150 m long.
      const dist = Math.hypot(s.evX - VUEJ_LANE_X, 0 - s.playerY);
      expect(dist, `EV ${dist.toFixed(1)} m away at t=${t}s`).toBeLessThan(110);
      expect(s.evX).toBeGreaterThan(0); // still short of the box: approaching
    }
    // …and it is past the box by t = 33 s, so the window really does close —
    // the other direction, without which „on screen for 18 s" could be bought
    // by an ambulance that simply never leaves.
    expect(p.get(33)!.evX).toBeLessThan(-30);
  });
});

// ---------------------------------------------------------------------------
// 4. sc-vu-cyclist-hook — the drive the sweep made cannot complete the lesson
// ---------------------------------------------------------------------------

/** vu-cyclist-v1: the eastbound through lane, the west spawn, and the east
 *  edge of the built tile (meta.boundsLocalMeters.maxX). */
const HOOK_LANE_Y = -4.06;
const HOOK_SPAWN_X = -115;

function hookObjective() {
  return SC_VU_CYCLIST_HOOK.success.find((o) => o.id === "sc-vu-turned")!;
}

/** Replay a pose stream through the SHIPPED evaluator, exactly as a session
 *  would: fresh eval state, one tick per sample, monotonic latches. */
function replayObjective(
  params: ReturnType<typeof hookObjective>["params"],
  samples: readonly { tSec: number; x: number; y: number; speedKmh: number; headingDeg: number }[],
): boolean {
  let state = createEvalState(params);
  let done = false;
  for (const s of samples) {
    const r = stepObjective(
      params,
      state,
      makeTick({
        t: s.tSec,
        speedKmh: s.speedKmh,
        position: { x: s.x, y: s.y },
        headingDeg: s.headingDeg,
        gear: 1,
        indicator: "off",
      }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

describe("sc-vu-cyclist-hook: the second disc is the right turn, and only the right turn", () => {
  it("a car that never steers never completes it — and runs out of built world instead", () => {
    // WHAT THE SWEEP ACTUALLY DROVE. tools/mobile/lesson-audit.mjs actuates two
    // keys, KeyW and KeyS, and never steers; so on a lesson whose event IS a
    // right turn the car goes straight down the through lane. Both legs did —
    // and both ended «Пътнотранспортно произшествие», 20 наказателни точки,
    // НЕИЗДЪРЖАН, careful and flat-out alike (pc-right/04-t179s.png and
    // pc-wrong/04-t023s.png are the same orange wall).
    const samples: { tSec: number; x: number; y: number; speedKmh: number; headingDeg: number }[] =
      [];
    let x = HOOK_SPAWN_X;
    let v = 0;
    let leftTileAtM: number | null = null;
    for (let i = 0; i < 30 * 200; i++) {
      v = Math.min(16.4, v + HERO_ACCEL_MPS2 * DT);
      x += v * DT;
      samples.push({ tSec: i * DT, x, y: HOOK_LANE_Y, speedKmh: v * 3.6, headingDeg: 90 });
      if (leftTileAtM === null && x > 130) leftTileAtM = x - HOOK_SPAWN_X;
      if (x > 200) break;
    }
    expect(replayObjective(hookObjective().params, samples)).toBe(false);
    // …by a margin nothing about pace or grace could close: the disc is r10 and
    // the straight line's closest approach is 40.94 m.
    const params = hookObjective().params;
    expect(params.kind).toBe("reachZone");
    if (params.kind !== "reachZone") throw new Error("unreachable");
    const closest = Math.min(
      ...samples.map((s) => Math.hypot(s.x - params.x, s.y - params.y)),
    );
    expect(closest).toBeGreaterThan(params.radiusM * 3);
    // And the through road runs out of vu-cyclist-v1 245 m from the spawn:
    // everything after that is scene backdrop, which is where the collision the
    // debrief charges came from. (World-boundary question, routed with (a).)
    expect(leftTileAtM).toBeCloseTo(245, 0);
  });

  it("the committed shadow, which does turn right, completes it", () => {
    // THE OTHER DIRECTION. Without this, „the straight drive fails" would be
    // satisfied by a disc nobody can reach — the exact false-refusal this
    // family has already been burned by once.
    const trace = JSON.parse(
      readFileSync(
        join(REPO_ROOT, "content", "traces", "sc-vu-cyclist-hook", "shadow-correct.trace.json"),
        "utf8",
      ),
    ) as ScenarioTrace;
    expect(
      replayObjective(
        hookObjective().params,
        trace.samples.map((s) => ({
          tSec: s.tSec,
          x: s.x,
          y: s.y,
          speedKmh: s.speedKmh,
          headingDeg: s.headingDeg,
        })),
      ),
    ).toBe(true);
    // …and it never goes east of the stem, i.e. it turned rather than drifted
    // into the disc from the through road.
    expect(Math.max(...trace.samples.map((s) => s.x))).toBeLessThan(0);
  });
});
