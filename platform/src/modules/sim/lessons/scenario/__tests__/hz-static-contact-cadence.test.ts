/**
 * sc-hz-brake-dont-swerve:a7d0dd29 [critical] — A CRASH INTO THE STATIC
 * OBSTACLE IS BILLED ON EVERY DISPLAY, AT THE SPEED OF THE STEP IT BEGAN ON.
 *
 * THE DEFECT (filed 2026-10-10, evidence .audit-frames/triage-1010/
 * r2-sc-hz-brake-dont-swerve-phone-contact-unbilled.json). On the phone lens a
 * no-brake drive into this lesson's fallen-load block at 50–59 км/ч went
 * UNBILLED — ИЗДЪРЖАН, 0 наказателни точки, ★★★, both tasks ticked — while PC
 * and a phone repeat of the same drive billed the 10-point опасна COLLISION
 * «Удар в неподвижно препятствие». PC billed 3 of 3 contacts, the phone 1 of 3.
 *
 * THE CAUSE, measured in process on the base (rapierContactDrive.ts carries the
 * model; the lane's report the numbers). @react-three/rapier 2.2.0 runs every
 * physics step a frame owes, THEN drains rapier's collision events once, and
 * calls the chassis' `onCollisionEnter` for a started pair only from inside
 * `world.contactPair(…)` — once per manifold rapier still holds AT THE DRAIN.
 * The car rebounds off the block and leaves solver contact three steps after
 * it arrived. So inside a phone's frame (7 steps in the evidence, up to 30) the
 * started pair is drained with no manifold left and the enter is never called:
 * the crash is simply not reported. Where it is still reported, its impact
 * speed is the car's velocity at the frame's END (VehicleRig read
 * `linvel()` at the drain), not at the step the contact began.
 *
 * WHAT THIS FILE HOLDS THE PRODUCT TO. The same closed-loop drive — decided
 * per physics step from the car after the previous one, so the TRAJECTORY is
 * one trajectory on every cadence — is driven on rapier through
 * @react-three/rapier's stepper, VehicleRig's contact path and LessonScene's
 * own graded call, at 60 Hz, 30 Hz, the recorded w69 phone deltas (both
 * phases, one opening with the 7.5 s stall) and a 2 fps lens, with the frame
 * boundaries moved one step at a time so the impact lands on EVERY step of a
 * multi-step frame. On every one of them:
 *   · the COLLISION is billed, as often, at the same session time and for the
 *     same points as at 60 Hz;
 *   · the whole sheet (`buildLessonResult`) is the 60 Hz sheet;
 *   · the impact speed the rig judged is the 60 Hz one (the task's tolerance
 *     is one step's change; the step record gives it exactly).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { hittableObstacleBodies, liveContactBodies, nameLiveContact } from "@/components/sim/LessonScene";
import { playerObb } from "../../../collision";
import { directorContactCast } from "../../../orchestrator/director";
import { createGradeGridSample } from "../../../scene/gradeGrid";
import { buildLessonWorldCore } from "../../../scene/lessonWorldRecipe";
import { applyTick, createLessonSession } from "../../engine";
import { compileScenario } from "../compile";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../templates-hazards2";
import { buildLiveWorld } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";
import {
  driveIntoContact,
  initRapier,
  judgedUntilEnd,
  phased,
  SCENE_COLLISION_NAMES,
  sceneHandleCollision,
  sheetDigest,
  type ContactDriveOutcome,
  type DriveState,
} from "./rapierContactDrive";

beforeAll(async () => {
  await initRapier();
});

/** w69-h1-mob frame deltas, ms — verbatim from grade-grid-cadence.census. */
const W69 = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927,
  1365, 498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332,
  1272, 355, 654, 770, 419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623,
  7505, 655, 1887, 453, 329, 362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384,
  439, 453, 370, 339,
].map((m) => m / 1000);

/** [label, deltas, how many one-step phase shifts to try]. */
const CADENCES: ReadonlyArray<readonly [string, readonly number[], number]> = [
  ["30 Hz", [1 / 30], 2],
  ["w69 phone A", W69, 8],
  ["w69 phone B (stall first)", [...W69.slice(61), ...W69.slice(0, 61)], 8],
  ["2 fps lens", [0.5], 30],
];

const SPAWN = { x: 4.06, y: 15, headingDeg: 0 };

/**
 * Hold `targetKmh` dead straight; brake fully from `brakeAtY` on (never if
 * undefined). From the step after the crash (a speed drop of more than
 * 20 км/ч in one step) either RELEASE every pedal — the rig's `stop()` in the
 * evidence drives (hz-drive.mjs: «__driveRig.stop(), all pedals») — or hold
 * the brake, as a driver who has just hit something would. Decided from the
 * car after the previous step only; a fresh controller per drive.
 */
function cruiseInto(targetKmh: number, brakeAtY?: number, afterCrash: "release" | "brake" | "push" = "brake") {
  return () => {
    let prevKmh = 0;
    let crashed = false;
    return (st: DriveState) => {
      if (prevKmh - st.speedKmh > 20 && afterCrash !== "push") crashed = true;
      prevKmh = st.speedKmh;
      if (crashed && afterCrash === "release") return { throttle: 0, brake: 0, steer: 0 };
      if (crashed || (brakeAtY !== undefined && st.y >= brakeAtY)) return { throttle: 0, brake: 1, steer: 0 };
      const err = targetKmh - st.speedKmh;
      return { throttle: err > 0 ? Math.min(1, err / 5 + 0.2) : 0.12, brake: 0, steer: 0 };
    };
  };
}

interface DriveCase {
  name: string;
  level: 1 | 3;
  control: () => (st: DriveState) => { throttle: number; brake: number; steer: number };
}
const DRIVES: DriveCase[] = [
  // the rig's phone-L3-late / pc-L3-late60: belted, 50 км/ч, no brake, and
  // at the contact the rig's stop() — every pedal released
  { name: "L3 no brake at 50 км/ч, pedals released at the crash", level: 3, control: cruiseInto(50, undefined, "release") },
  // the same, and the driver stands on the brake after the crash
  { name: "L3 no brake at 50 км/ч", level: 3, control: cruiseInto(50) },
  // the harness mobile-wrong cell: L1, 58–59 км/ч into the block
  { name: "L1 no brake at 58 км/ч", level: 1, control: cruiseInto(58) },
  // a late brake: full pedal 7 m short of the contact pose
  { name: "L3 late brake from y 180", level: 3, control: cruiseInto(50, 180) },
];

function drive(c: DriveCase, deltas: readonly number[]): ContactDriveOutcome {
  return driveIntoContact({
    lesson: compileScenario(SC_HZ_BRAKE_DONT_SWERVE, c.level),
    raw: loadDistrict(SC_HZ_BRAKE_DONT_SWERVE.map.districtId),
    start: SPAWN,
    control: c.control(),
    deltas,
    maxSteps: 60 * 40,
  });
}

const graded = (o: ContactDriveOutcome) => judgedUntilEnd(o).filter((j) => j.graded);

describe("sc-hz-brake-dont-swerve — the block is hit on every display, and billed on every display", () => {
  for (const c of DRIVES) {
    describe(c.name, () => {
      let ref: ContactDriveOutcome;
      beforeAll(() => {
        ref = drive(c, [1 / 60]);
      });

      it("60 Hz, the anchor: the car reaches the block at speed, and the drive bills the 10-point опасна COLLISION with a static object", () => {
        expect(ref.mounted.walls, "the lesson's block is mounted").toBe(1);
        expect(ref.impactStep, "the car never struck anything").toBeGreaterThan(0);
        const before = ref.speedAfterStep[ref.impactStep - 1];
        expect(before, "the approach speed into the block").toBeGreaterThan(c.name.includes("late") ? 15 : 45);
        expect(ref.collisions.length, "COLLISION bills at 60 Hz").toBeGreaterThanOrEqual(1);
        expect(ref.collisions[0].points).toBe(10);
        expect(ref.collisions[0].withWhat).toBe("staticObject");
        expect(ref.result.passed, "a crash into the block is not a pass").toBe(false);
        expect(graded(ref).length).toBeGreaterThanOrEqual(1);
      });

      for (const [label, deltas, phases] of CADENCES) {
        it(`${label}: the impact lands on every step of a frame (${phases} phases) — the COLLISION, its time, its points, the impact speed and the whole sheet are 60 Hz's`, () => {
          const wrong: string[] = [];
          let multiStepFrames = 0;
          for (let lead = 0; lead < phases; lead++) {
            const o = drive(c, phased(deltas, lead));
            if (o.maxStepsPerFrame > 1) multiStepFrames++;
            // the physics is one trajectory (the drive is decided per step)
            if (o.impactStep !== ref.impactStep) wrong.push(`lead ${lead}: impact at step ${o.impactStep}, 60 Hz ${ref.impactStep}`);
            const bills = JSON.stringify(o.collisions);
            if (bills !== JSON.stringify(ref.collisions)) {
              wrong.push(`lead ${lead}: COLLISION bills ${bills} — 60 Hz ${JSON.stringify(ref.collisions)}`);
            }
            const speeds = graded(o).map((j) => j.impactKmh);
            const refSpeeds = graded(ref).map((j) => j.impactKmh);
            const oneStep = Math.abs(ref.speedAfterStep[ref.impactStep] - ref.speedAfterStep[ref.impactStep - 1]);
            if (
              speeds.length !== refSpeeds.length ||
              speeds.some((v, i) => !(Math.abs(v - refSpeeds[i]) <= oneStep) || v !== refSpeeds[i])
            ) {
              wrong.push(`lead ${lead}: judged impact km/h ${JSON.stringify(speeds)} — 60 Hz ${JSON.stringify(refSpeeds)}`);
            }
            const booked = graded(o).map((j) => j.bookedStep);
            const refBooked = graded(ref).map((j) => j.bookedStep);
            if (JSON.stringify(booked) !== JSON.stringify(refBooked)) {
              wrong.push(`lead ${lead}: booked at grid points ${JSON.stringify(booked)} — 60 Hz ${JSON.stringify(refBooked)}`);
            }
            if (sheetDigest(o.result) !== sheetDigest(ref.result)) {
              wrong.push(
                `lead ${lead}: the sheet differs — passed ${o.result.passed} score ${o.result.score} (60 Hz: passed ${ref.result.passed} score ${ref.result.score})`,
              );
            }
          }
          expect(multiStepFrames, "the cadence never put two steps in a frame — the cell proves nothing").toBeGreaterThan(0);
          expect(wrong).toEqual([]);
        });
      }
    });
  }
});

/** Into the east façade (hzd-b-east, x 16.13 — the district's building
 *  trimesh, untagged) square on, from the carriageway at y 192, crossing the
 *  kerb on the way; the brake from the step after the crash. */
const FACADE_START = { x: 0, y: 192, headingDeg: 90 };
function intoFacade(kmh: number) {
  return () => {
    let prev = 0;
    let crashed = false;
    return (st: DriveState) => {
      if (prev - st.speedKmh > 8) crashed = true;
      prev = st.speedKmh;
      if (crashed) return { throttle: 0, brake: 1, steer: 0 };
      const err = kmh - st.speedKmh;
      return { throttle: err > 0 ? Math.min(1, err / 5 + 0.2) : 0.1, brake: 0, steer: 0 };
    };
  };
}

describe("the step record's contacts ARE rapier's STARTED events — at one step per frame, exactly what the old onCollisionEnter was handed", () => {
  const cases: Array<[string, DriveCase["level"], DriveCase["control"], { x: number; y: number; headingDeg: number }]> = [
    ...DRIVES.map((d) => [d.name, d.level, d.control, SPAWN] as [string, DriveCase["level"], DriveCase["control"], typeof SPAWN]),
    ["L3 into the east façade at 30 км/ч", 3, intoFacade(30), FACADE_START],
    // the throttle held after the crash: the car rebounds, LEAVES solver contact
    // while rapier still holds the pair's manifold, and strikes again — the
    // second strike is a second STARTED event, and the step record must see it
    ["L3 into the block at 50 км/ч, throttle held (it rebounds and strikes again)", 3, cruiseInto(50, undefined, "push"), SPAWN],
  ];
  for (const [name, level, control, start] of cases) {
    it(`${name}: the same contacts, at the same steps, on the same bodies, at the same speeds — one per manifold`, () => {
      const o = driveIntoContact({
        lesson: compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level),
        raw: loadDistrict(SC_HZ_BRAKE_DONT_SWERVE.map.districtId),
        start,
        control: control(),
        deltas: [1 / 60],
        maxSteps: 60 * 30,
        auditStartedEvents: true,
      });
      expect(o.maxStepsPerFrame).toBe(1);
      expect(o.rapierStarted.length, "rapier reported no contact — the drive proves nothing").toBeGreaterThan(0);
      expect(o.stepRecordStarted).toEqual(o.rapierStarted);
      if (name.includes("strikes again")) expect(o.rapierStarted.length, "the car did not strike twice").toBeGreaterThan(1);
    });
  }
});

describe("the district's façade — at the scenario threshold and at the street tolerance — on every display", () => {
  for (const [name, streetTolerance] of [
    ["the scenario lesson (every contact graded)", false],
    ["the same lesson judged at the street tolerance of 10 км/ч (a curriculum lesson's default)", true],
  ] as const) {
    it(`${name}: every contact judged, its grid point, its speed, whether it was graded, and the sheet are 60 Hz's on 30 Hz, both w69 phases and the 2 fps lens`, () => {
      const lesson = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 3);
      if (streetTolerance) lesson.collisionMinKmh = undefined;
      const run = (deltas: readonly number[]) =>
        driveIntoContact({
          lesson,
          raw: loadDistrict(SC_HZ_BRAKE_DONT_SWERVE.map.districtId),
          start: FACADE_START,
          control: intoFacade(30)(),
          deltas,
          maxSteps: 60 * 8,
        });
      const ref = run([1 / 60]);
      const refJudged = JSON.stringify(judgedUntilEnd(ref));
      expect(judgedUntilEnd(ref).length, "the drive touched nothing").toBeGreaterThan(0);
      const wrong: string[] = [];
      for (const [label, deltas, phases] of CADENCES) {
        for (let lead = 0; lead < Math.min(phases, 6); lead++) {
          const o = run(phased(deltas, lead));
          const j = JSON.stringify(judgedUntilEnd(o));
          if (j !== refJudged) wrong.push(`${label} lead ${lead}: judged ${j.slice(0, 200)} — 60 Hz ${refJudged.slice(0, 200)}`);
          if (sheetDigest(o.result) !== sheetDigest(ref.result)) wrong.push(`${label} lead ${lead}: the sheet differs`);
        }
      }
      expect(wrong).toEqual([]);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// THE SCENE'S END OF THE EAR — LessonScene's own `handleCollision`, executed
// ───────────────────────────────────────────────────────────────────────────
//
// The verifier's condition F6 (mutant V8): with `if (withWhat !==
// "staticObject")` put in front of the scene's `runtime.pushCollision(…)`,
// every test above stayed green — the harness re-implemented the callback, so
// the cadence proof stopped at the rig's ear. Two things hold it now: the
// harness's graded branch calls the scene's own callback (rapierContactDrive
// `sceneHandleCollision`), so every drive above runs to the runtime's queue
// through the scene's statement; and the three tests below run that callback
// alone, on the lesson's live world, and read what it pushed and what the
// engine made of it.

/** LessonScene's `handleCollision` on the lesson's live world, its
 *  `runtime.pushCollision` and the crash cut observed (and passed on). */
function sceneCollisionOn(level: 1 | 3) {
  const lesson = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level);
  const raw = loadDistrict(SC_HZ_BRAKE_DONT_SWERVE.map.districtId);
  const { runtime, traffic, director } = buildLiveWorld(lesson, raw);
  const pushed: Array<[string, string | undefined]> = [];
  const push = runtime.pushCollision.bind(runtime);
  runtime.pushCollision = (withWhat, bodyId) => {
    pushed.push([withWhat, bodyId]);
    push(withWhat, bodyId);
  };
  const impactCuts: number[] = [];
  const cut = sceneHandleCollision();
  const handle = cut.bind({
    impactCutRef: { current: { impact: (kmh: number) => impactCuts.push(kmh) } },
    runtime,
    nameLiveContact,
    playerObb,
    liveContactBodies,
    directorContactCast,
    director,
    traffic,
    hittableObstacleBodies,
    built: buildLessonWorldCore(lesson, raw),
    obstacleFootprintsRef: { current: [] },
  });
  // The student at the grid point of the contact's step: belted, in D, at the
  // lesson's start pose (the name is not asked of a static object, and no
  // staged body stands here).
  const student = createGradeGridSample();
  student.seatbeltOn = true;
  student.gear = 1;
  student.engineOn = true;
  student.position.x = SPAWN.x;
  student.position.y = SPAWN.y;
  student.headingDeg = SPAWN.headingDeg;
  student.speedKmh = 6.01;
  return { lesson, runtime, cut, handle, pushed, impactCuts, student };
}

describe("LessonScene's own handleCollision, cut out of the scene and executed — what the rig's ear calls", () => {
  it("is the callback VehicleRig's ear calls: (impactKmh, withWhat, student), and it reads no name this file does not hand it", () => {
    const cut = sceneHandleCollision();
    expect(cut.params, "the scene's callback no longer takes the student of the contact's grid point").toBe(3);
    expect([...SCENE_COLLISION_NAMES].filter((n) => !new RegExp(`\\b${n}\\b`).test(cut.text))).toEqual([]);
  });

  it("a STATIC-OBJECT contact is pushed to the runtime — one report, unnamed — and the crash is shown", () => {
    const s = sceneCollisionOn(3);
    s.handle(6.01, "staticObject", s.student);
    expect(s.pushed, "the scene did not push the static-object collision the rig graded").toEqual([
      ["staticObject", undefined],
    ]);
    expect(s.impactCuts).toEqual([6.01]);
  });

  it("…and that push is the 10-point опасна COLLISION on the sheet: the runtime drains it into the next tick and the engine bills it", () => {
    for (const level of [1, 3] as const) {
      const s = sceneCollisionOn(level);
      s.handle(6.01, "staticObject", s.student);
      const tick = s.runtime.sample(s.student, 1 / 60, false);
      expect(
        tick.events.filter((e) => e.kind === "collision"),
        `L${level}: the tick after the scene's callback carries no collision`,
      ).toEqual([{ kind: "collision", withWhat: "staticObject" }]);
      const session = applyTick(createLessonSession(s.lesson), tick).state;
      const bills = session.events
        .map((e) => e as { kind?: string; code?: string; points?: number; detail?: string })
        .filter((e) => e.kind === "violation" && e.code === "COLLISION")
        .map((e) => [e.points, e.detail]);
      expect(bills, `L${level}: COLLISION bills after a pushed static-object contact`).toEqual([[10, "staticObject"]]);
    }
  });

  it("a contact with a VEHICLE shell is pushed as a vehicle (unnamed here: no staged body is within reach of the start pose)", () => {
    const s = sceneCollisionOn(3);
    s.handle(12, "vehicle", s.student);
    expect(s.pushed).toEqual([["vehicle", undefined]]);
  });
});
