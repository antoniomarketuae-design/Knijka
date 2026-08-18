/**
 * FR-B5-RETURN (sweep161, 2026-08-18) — THE LESSON'S OWN CAR HAS TO STILL BE
 * THERE AT MINUTE THREE.
 *
 * WHAT WAS FOUND BY LOOKING. Five sweep-161 findings, all "BROKEN / critical",
 * all routed at `staged.ts`, all one sentence in five accents: *"the lesson's
 * own event never happens"*.
 *
 *   sc-ln-decisive-change  "at t123s and again at t208s the left lane is empty
 *                           to the horizon … the objective was nevertheless
 *                           ticked at 2:12"
 *   sc-merge-accel-lane    "the carriageway is empty to the horizon in both
 *                           directions … the briefing asks the student to find
 *                           the gap between the cars; there are no cars"
 *   sc-jx-giveway-b1       "180 s of a 205 s lesson in lawful waits … the
 *                           priority stream on the main road never clears"
 *
 * FR-B5-EXIT (staged.ts) answered the third of those and half of the first: an
 * actor that ran out of path used to STOP ON THE LAST METRE of it, damming the
 * ambient stream behind it. It now drives 70 m clear. What it did not answer is
 * the sentence the findings actually make, and the reason is in its own
 * justification — "past this an ambient agent no longer sees the actor at all,
 * WHICH IS THE PROPERTY THAT HAS TO HOLD, not the number". It checked that
 * property against one observer. The student is the other one, and 70 m does
 * not clear him: `LessonScene` draws traffic to 420 m and ln-v1 is 400 m long.
 *
 * HOW THIS FILE MEASURES IT. Not with the 42 s shadow trace — the frames were
 * not taken of that drive. The audit bot's own logged speed profile is read off
 * `.audit-frames/sweep161/sc-ln-decisive-change/pc-right/run.log` (a stop-go
 * crawl of 0…14 км/ч for the whole 210 s) and replayed, which reproduces the
 * finding exactly:
 *
 *   t= 30 s  player y= 69   `sc-lndc-target` y=322, 15.0 m/s ← passing, leaving
 *   t= 40 s  player y= 85                    y=470,  0.0 m/s ← retired
 *   t=123 s  player y=203                    y=470,  0.0 m/s ← 267 m dead ahead
 *   t=208 s  player y=330                    y=470,  0.0 m/s ← 151 m dead ahead
 *
 * The last two rows are the finding's own cited frames. 25 seconds of lesson,
 * 173 seconds of horizon — and `metresCoveredLate` below is exactly 0.0 on that
 * build.
 *
 * The four tests are the four directions the fix could be wrong in:
 *   1. it must actually put a car back in the lane the briefing is about
 *      (fails on the old behaviour: 0.0 m),
 *   2. it must never re-enter in front of the student,
 *   3. it must not give a ONE-SHOT HAZARD a second, unscripted run,
 *   4. it must not carry an actor's authored licence to ignore the student into
 *      a run nobody authored.
 */
import { describe, expect, it } from "vitest";

import { compileScenario } from "../../lessons/scenario/compile";
import { SC_LN_DECISIVE_CHANGE } from "../../lessons/scenario/templates-lanes3";
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

const DT = 1 / 30;
/** ln-v1's right (player) and left (target) lane centres — templates-lanes3.ts. */
const LN_RIGHT = 12.19;
const LN_LEFT = 4.0625;
/** ln-spawn-start's arc on the northbound road. */
const START_Y = 15;
const LESSON_SEC = 210;
/**
 * The window the finding is about: after the scripted encounter is over. On the
 * crawl profile `sc-lndc-target` has passed and retired by t ≈ 37 s, so from 60 s
 * on there is nothing left of the lesson but whatever the street produces.
 */
const LATE_FROM = 60;

/**
 * The audit bot's speed in км/ч at 5 s resolution, transcribed from
 * `.audit-frames/sweep161/sc-ln-decisive-change/pc-right/run.log`. It never
 * clears 14 км/ч and it stops repeatedly — which is the whole reason the actor
 * outruns the lesson.
 */
const CRAWL_KMH = [
  14, 2, 11, 2, 0, 10, 11, 0, 2, 11, 0, 0, 10, 6, 0, 10, 11, 0, 1, 11, 2, 0, 10, 11, 0, 0, 11, 2, 0,
  10, 11, 0, 2, 11, 2, 0, 10, 11, 0,
];

interface LateRun {
  /** Metres the lesson's own staged car covered over t = LATE_FROM…210 s. */
  actorMetresLate: number;
  /** Seconds of that window with the car MOVING in the target lane. */
  aliveSec: number;
  /** Did the scripted encounter run at all before the window opened? */
  encounterRan: boolean;
}

/** Drive `sc-ln-decisive-change` at L1 the way the audit bot drove it. */
function driveTheAuditsOwnCrawl(): LateRun {
  const lesson = compileScenario(SC_LN_DECISIVE_CHANGE, 1);
  const traffic = createTrafficSystem(loadDistrict("ln-v1") as TrafficDistrict, {
    anchor: { x: LN_RIGHT, y: START_Y },
    anchorRadiusM: lesson.traffic?.anchorRadiusM ?? 400,
    vehicleCount: lesson.traffic?.vehicleCount ?? 0,
    pedestrianCount: 0,
  });
  const events = lesson.stagedEvents ?? [];
  const director = createScenarioDirector(events, traffic, { seed: lessonSeed(lesson.id) });

  let t = 0;
  let py = START_Y;
  let last: { x: number; y: number } | null = null;
  const out: LateRun = { actorMetresLate: 0, aliveSec: 0, encounterRan: false };
  let nextSec = LATE_FROM;
  while (t <= LESSON_SEC) {
    const kmh = CRAWL_KMH[Math.floor(t / 5) % CRAWL_KMH.length];
    py += (kmh / 3.6) * DT;
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: LN_RIGHT, y: py },
      playerSpeedKmh: kmh,
      playerHeadingDeg: 0,
    });
    director.step({
      tSec: t,
      dtSec: DT,
      x: LN_RIGHT,
      y: py,
      speedKmh: kmh,
      headingDeg: 0,
      brakePedal: kmh < 1 ? 1 : 0,
      tickEvents: [],
    });
    const car = traffic.staged("sc-lndc-target");
    if (car) {
      // The encounter itself: the car draws level with the student. Without
      // this the test could pass on an actor that only ever circles.
      if (Math.abs(car.y - py) < 12) out.encounterRan = true;
      if (t >= LATE_FROM) {
        if (last) {
          const step = Math.hypot(car.x - last.x, car.y - last.y);
          // The re-entry itself is a jump back to the hold pose, not travel.
          // Counting it inflated this number from 2,093 m to 4,443 m — a metric
          // that scores teleports is not a metric, so a step no car could take
          // in one frame (0.033 s ⇒ 5 m is 540 км/ч) is dropped.
          if (step < 5) out.actorMetresLate += step;
        }
        last = { x: car.x, y: car.y };
        if (t >= nextSec) {
          nextSec += 1;
          // MOVING, and in the lane «Изчакай колата в съседната лента» is about.
          if (car.speedMps > 0.9 && Math.abs(car.x - LN_LEFT) < 2) out.aliveSec++;
        }
      }
    }
    t += DT;
  }
  return out;
}

describe("FR-B5-RETURN — the lane the briefing is about keeps carrying traffic", () => {
  it(
    "the lesson's own car is still driving it at minute three",
    () => {
      const r = driveTheAuditsOwnCrawl();
      // The control half: the scripted encounter has to have happened, or this
      // test would be satisfied by a car that merely circles past a student it
      // never meets.
      expect(r.encounterRan, "the target car never drew level with the student").toBe(true);
      // MEASURED on the pre-fix build: 0.0 m and 0 s. The actor was at rest at
      // (4.06, 470) — 70 m past the end of a 400 m road — from t = 37 s to the
      // 210 s cap, which is the two frames the finding cites. With the fix:
      // 2,093.3 m and 149 s of 150. The floor is one full length of the road
      // across a 150 s window — far under what the fix produces and far over
      // anything a dead street can fake.
      expect(
        r.actorMetresLate,
        `the staged car covered ${r.actorMetresLate.toFixed(1)} m over t=${LATE_FROM}..${LESSON_SEC} s`,
      ).toBeGreaterThan(400);
      // …and it is MOVING IN THE TARGET LANE, not merely displaced. A third of
      // the window is the bar; the whole point is that the student who looks
      // left at any minute of the lesson sees the traffic he was briefed about.
      expect(
        r.aliveSec,
        `${r.aliveSec} s of ${LESSON_SEC - LATE_FROM} with a moving car in the target lane`,
      ).toBeGreaterThan(50);
    },
    120000,
  );
});

// ---------------------------------------------------------------------------
// The three ways it must NOT go, on a bare straight path so the only thing
// moving is the mechanism under test.
// ---------------------------------------------------------------------------

const STRAIGHT: StagedVehicleSpec = {
  kind: "vehicle",
  id: "return-probe",
  pathNodes: [],
  railPath: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  hold: { nodeIndex: 0, offsetM: 0 },
  cruiseSpeedMps: 10,
};

function env(over: Partial<StagedEnv> = {}): StagedEnv {
  return {
    hasPlayer: false,
    playerX: 0,
    playerY: 0,
    playerSpeedMps: 0,
    crossingCounts: new Map(),
    ambient: [],
    ...over,
  };
}

function body(x: number, y: number): TrafficVehicleState {
  return { id: 7, x, y, dirX: 1, dirY: 0, speedMps: 0, braking: false, colorIndex: 0 };
}

/** The same straight line, but staged as a ROAD-GRAPH actor (no `railPath`). */
function roadProbe(over: Partial<StagedVehicleSpec> = {}) {
  const path = buildStagedVehiclePolylinePath(STRAIGHT.railPath!)!;
  const spec: StagedVehicleSpec = { ...STRAIGHT, railPath: undefined, ...over };
  return createStagedVehicle(spec, path, 1000);
}

describe("FR-B5-RETURN — and it is not a licence", () => {
  it("never re-enters in front of the student, and does re-enter once he is past", () => {
    // A CONTROLLED PAIR: identical actor, identical seconds, the student the
    // same 20 m off the path in both — so the corridor guard (lateral < 3 m) is
    // out of it and the ONLY difference is how far ALONG the path he is. The
    // first draft put him ON the line at 30 m and proved nothing: the player
    // guard braked the actor to a stop at x = 24 and it never finished, so
    // `returns === 0` was true for a reason that had nothing to do with the
    // clearance being tested.
    //
    // 30 m — INSIDE the 70 m clearance. A car materialising at the hold pose
    // here pops into his mirror at 30 m, which is the defect in the other
    // direction.
    const near = roadProbe();
    const nearEnv = env({ hasPlayer: true, playerX: 30, playerY: 20 });
    applyStagedCommand(near, { type: "cruise" }, nearEnv);
    for (let i = 0; i < 60 * 60; i++) updateStagedVehicle(near, DT, nearEnv);
    expect(near.returns, "returned while the student was 30 m past the hold pose").toBe(0);
    // It still LEFT — this is not the old „park on the last metre" behaviour
    // sneaking back in under a new name, and it is what makes the 0 above mean
    // „held back" rather than „never got there".
    expect(near.finished).toBe(true);
    expect(near.state.x).toBeCloseTo(170, 3);

    // …and 200 m, which is where the drill actually has him by minute two.
    const far = roadProbe();
    const farEnv = env({ hasPlayer: true, playerX: 200, playerY: 20 });
    applyStagedCommand(far, { type: "cruise" }, farEnv);
    for (let i = 0; i < 60 * 60; i++) updateStagedVehicle(far, DT, farEnv);
    expect(far.returns).toBeGreaterThan(0);
  });

  it("a one-shot hazard on its own rail crosses once and stays gone", () => {
    // The RX „жп прелез" train is the catalogue's only `railPath` actor and it
    // is authored to ignore cars. A second train through a crossing the lesson
    // has just declared clear would convict a student who did as he was told.
    const path = buildStagedVehiclePolylinePath(STRAIGHT.railPath!)!;
    const train = createStagedVehicle({ ...STRAIGHT, playerGuard: false }, path, 1000);
    const e = env({ hasPlayer: true, playerX: 500, playerY: 0 });
    applyStagedCommand(train, { type: "cruise" }, e);
    for (let i = 0; i < 60 * 60; i++) updateStagedVehicle(train, DT, e);
    expect(train.finished).toBe(true);
    expect(train.returns).toBe(0);
  });

  it("a returning actor is guarded against the student even when its spec is not", () => {
    // `playerGuard: false` is how the лепка is staged (runners.ts
    // RearTailgaterRunner) and it buys ONE authored thing: the sub-6 m pose of
    // a scripted encounter. Carried into a second, unscripted run it is a car
    // re-entering at pass speed with no clamp against the one body it must
    // never touch. Both `sc-lndc-target` and `sc-mrg-mainline` are лепки, so
    // this is the exact actor the findings are about.
    const car = roadProbe({ playerGuard: false });
    // Far enough for the return to be allowed; then he is driven into.
    const e = env({ hasPlayer: true, playerX: 300, playerY: 0 });
    applyStagedCommand(car, { type: "cruise" }, e);
    for (let i = 0; i < 60 * 30; i++) updateStagedVehicle(car, DT, e);
    expect(car.returns, "the лепка has to come back — that is the fix").toBeGreaterThan(0);
    // Now he stands ON its second lap, 60 m along the path.
    e.playerX = 60;
    let closest = Infinity;
    for (let i = 0; i < 60 * 60; i++) {
      updateStagedVehicle(car, DT, e);
      closest = Math.min(closest, Math.hypot(e.playerX - car.state.x, e.playerY - car.state.y));
    }
    // Two 4.1 m cars are interpenetrating below this many metres of centres.
    expect(closest, `closest approach to the student ${closest.toFixed(3)} m`).toBeGreaterThan(4.1);
  });

  it("never materialises inside a body standing on the hold pose", () => {
    const car = roadProbe();
    // The blocker starts WELL CLEAR and is moved onto the hold pose only after
    // the actor has driven off it. The first draft parked it on the hold pose
    // from frame 0 and proved nothing: the actor was born inside it, the
    // anti-overlap clamp refused every step, it never moved at all, and
    // `returns === 0` was true because nothing had happened. Disabling the
    // guard under test left the test green — which is how it was caught.
    const parked = body(400, 0);
    const e = env({ hasPlayer: true, playerX: 300, playerY: 20, ambient: [parked] });
    applyStagedCommand(car, { type: "cruise" }, e);
    for (let i = 0; i < 60 * 5; i++) updateStagedVehicle(car, DT, e);
    expect(car.state.x, "the actor has to leave the hold pose first").toBeGreaterThan(30);
    parked.x = 1; // …and now an ambient car is standing on it
    let everFinished = false;
    for (let i = 0; i < 60 * 55; i++) {
      updateStagedVehicle(car, DT, e);
      everFinished ||= car.finished;
    }
    expect(car.returns, "returned onto an occupied hold pose").toBe(0);
    // Latched during the loop, not snapshotted after it: with the guard
    // removed the actor returns and un-latches `finished`, so a snapshot would
    // trip on the sanity check instead of naming the defect.
    expect(everFinished, "it has to have run out of path to want to return").toBe(true);
    // Move the blocker off and the same actor comes back round — so the guard
    // above is a guard and not an off switch.
    parked.x = 400;
    for (let i = 0; i < 60 * 30; i++) updateStagedVehicle(car, DT, e);
    expect(car.returns).toBeGreaterThan(0);
  });
});
