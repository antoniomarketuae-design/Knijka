/**
 * A STRUCK BODY ON THE ROAD, THROUGH THE WHOLE CHAIN — lane staticcardcopy,
 * sc-hz-brake-dont-swerve:b7297cb7 (integrator rulings C1–C3, S1–S10; S2(a),
 * the centre rule and the T3 replacement, 2026-11-04). T1, T2, the STEP 2
 * (iv) cut and the driven controls.
 *
 * THE CHAIN. The recipe stamps a held wall or prop whose centre stands on the
 * built carriageway (`scene/scenarioSceneryProps.stampHeldOnCarriageway`); the
 * harness mounts it as ScenarioObstacles does, `STATIC_ON_CARRIAGEWAY_USER_DATA`
 * included (imported from the product module); the product chassis on rapier
 * strikes it; the step record hands the contact to the product's own
 * `hearChassisContact`, which hands the fact on; LessonScene's own
 * `handleCollision` (cut out of its source) forwards it to the runtime; the
 * runtime emits `{ kind: "collision", withWhat: "staticObject",
 * onCarriageway: true }`; the rule engine bills «staticObjectOnRoad»; every
 * surface prints the act's copy. The recorder demos go the same way from
 * their rects' by-value flag.
 *
 * WHAT A DRIVE HERE DOES NOT PROVE: that VehicleRig's real graded closure and
 * ScenarioObstacles' JSX forward and mount the fact — the harness re-models
 * both. Those are pinned by execution in
 * components/sim/__tests__/chassis-contact-ear.test.ts and
 * components/sim/__tests__/scenario-obstacles-carriageway-tag.test.ts.
 *
 * THE BASE PRINT these rows replace (lane PROGRESS.md, STEP 0(b)): the hz block
 * LATE50 at L1/L3/L5 — grid point 858, 31.29 km/h, COLLISION/staticObject, the
 * 323-character paragraph with all three false clauses and the peek «Не се появи
 * внезапно.», crash pin {forward, staticObject, front}.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../../contracts";
import { COLLISION_CONTACT_COPY, VIOLATIONS, type SimTick } from "../../../rules";
import { makeSurfaceFix, surfaceAt, districtDrivableSurfaceOf } from "../../../runtime";
import { hzBrakeDontSwerveObstacles, recordScHzBrakeDontSwerveDrive } from "../../../traces/scHzBrakeDontSwerve";
import { recordScMergeRoadworksShiftDrive } from "../../../traces/scMergeRoadworksShift";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { buildDebrief } from "../../debrief";
import { lessonMistakeCopy } from "../../lessonMistake";
import { LESSONS } from "../../specs";
import { rebuildRuleEvents, serializeRuleEvents } from "../../wire";
import type { LessonSessionState, TeachMoment } from "../../types";
import { heldStaticContactBodies } from "../../../scene/scenarioSceneryProps";
import { teachMomentOneLinerBg } from "@/components/sim/lesson-ui/LessonPlayShell";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../templates-hazards2";
import { SC_MERGE_ROADWORKS_SHIFT } from "../templates-merging";
import type { ScenarioLevel } from "../types";
import {
  driveIntoContact,
  initRapier,
  judgedUntilEnd,
  sceneHandleCollision,
  SCENE_COLLISION_NAMES,
  type ContactDriveOutcome,
  type DriveState,
} from "./rapierContactDrive";
import { loadDistrict } from "./witnessLiveRung";

beforeAll(async () => {
  await initRapier();
});

const ON_ROAD = COLLISION_CONTACT_COPY.staticObjectOnRoad;
const OFF_ROAD = COLLISION_CONTACT_COPY.staticObject;
const FALSE_CLAUSES = [
  "пътят ѝ е излязъл извън платното",
  "Излизането от платното е самото произшествие",
  "Не се появи внезапно.",
] as const;

/** Hold `kmh` straight (or with `steer`); full brake from `brakeAtY` on, and
 *  from the step after the crash. Decided from the car after the step before. */
function cruiseInto(kmh: number, brakeAtY?: number, steer = 0) {
  let prev = 0;
  let crashed = false;
  return (st: DriveState) => {
    if (prev - st.speedKmh > 8) crashed = true;
    prev = st.speedKmh;
    if (crashed || (brakeAtY !== undefined && st.y >= brakeAtY)) return { throttle: 0, brake: 1, steer: 0 };
    const err = kmh - st.speedKmh;
    return { throttle: err > 0 ? Math.min(1, err / 5 + 0.2) : 0.12, brake: 0, steer };
  };
}

interface Surfaces {
  o: ContactDriveOutcome;
  lesson: LessonSpec;
  events: Array<Record<string, unknown>>;
  toasts: Array<Extract<HudEvent, { kind: "violation" }>>;
  moments: TeachMoment[];
}

function drive(
  lesson: LessonSpec,
  districtId: string,
  start: { x: number; y: number; headingDeg: number },
  control: (st: DriveState) => Record<string, number>,
  maxSteps: number,
  tracePoses = false,
): Surfaces {
  const events: Array<Record<string, unknown>> = [];
  const toasts: Surfaces["toasts"] = [];
  const moments: TeachMoment[] = [];
  const o = driveIntoContact({
    lesson,
    raw: loadDistrict(districtId),
    start,
    control,
    deltas: [1 / 60],
    maxSteps,
    tracePoses,
    onStep: (tick, step) => {
      for (const e of tick.events) if (e.kind === "collision") events.push({ ...e });
      for (const h of step.hudEvents) if (h.kind === "violation" && h.titleBg === OFF_ROAD.titleBg) toasts.push(h);
      for (const m of step.teachMoments ?? []) if (m.code === "COLLISION") moments.push(m);
    },
  });
  return { o, lesson, events, toasts, moments };
}

/** Every surface's COLLISION copy for a drive: [title, explanation, peek] per surface. */
function printed(s: Surfaces) {
  const mistakes = s.o.result.summary.mistakes.filter((m) => m.code === "COLLISION");
  const st = s.o.session as LessonSessionState & { events: never; penaltyEscalations: never; eventPositions?: never };
  const rebuilt = (rebuildRuleEvents(serializeRuleEvents(st.events, st.penaltyEscalations, st.eventPositions ?? [])) ?? []).filter(
    (e) => e.kind === "violation" && e.code === "COLLISION",
  ) as Array<{ detail?: string; explanationBg: string; titleBg: string }>;
  const debrief = buildDebrief(s.lesson, s.o.result, { coachedMistakes: s.o.result.coachedMistakes }).text;
  return {
    details: mistakes.map((m) => m.detail),
    toast: s.toasts.map((t) => [t.titleBg, t.explanationBg, t.peekBg]),
    sheet: mistakes.map((m) => {
      const c = lessonMistakeCopy({ code: m.code, t: m.t, ...(m.detail !== undefined ? { detail: m.detail } : {}) })!;
      return [c.titleBg, c.explanationBg, c.peekBg];
    }),
    rebuilt: rebuilt.map((e) => [e.detail, e.titleBg, e.explanationBg]),
    moments: s.moments.map((m) => [(m as { peekBg?: string }).peekBg, teachMomentOneLinerBg(m)]),
    // The COLLISION rows' «Какво стана» only (a drive may also bill another code).
    whatHappened: debrief
      .split("\n")
      .filter((l) => l === `  → Какво стана: ${ON_ROAD.explanationBg}` || l === `  → Какво стана: ${OFF_ROAD.explanationBg}`),
    debrief,
  };
}

function expectOnRoadEverywhere(label: string, s: Surfaces) {
  const p = printed(s);
  expect(p.details.length, `${label}: no COLLISION billed`).toBeGreaterThan(0);
  expect(new Set(p.details), `${label}: the bill's detail`).toEqual(new Set(["staticObjectOnRoad"]));
  // A HUD toast carries no code: the COLLISION toasts are picked by the shared static title. Never vacuous.
  expect(p.toast.length, `${label}: no COLLISION toast reached the glass`).toBeGreaterThan(0);
  for (const t of p.toast) expect(t, `${label}: the toast`).toEqual([ON_ROAD.titleBg, ON_ROAD.explanationBg, ON_ROAD.peekBg]);
  for (const t of p.sheet) expect(t, `${label}: the lesson-mistake sheet`).toEqual([ON_ROAD.titleBg, ON_ROAD.explanationBg, ON_ROAD.peekBg]);
  for (const r of p.rebuilt) expect(r, `${label}: rebuildRuleEvents`).toEqual(["staticObjectOnRoad", ON_ROAD.titleBg, ON_ROAD.explanationBg]);
  for (const m of p.moments) expect(m, `${label}: the teach moment's peek and the phone one-liner`).toEqual([ON_ROAD.peekBg, ON_ROAD.peekBg]);
  expect(p.whatHappened.length, `${label}: the debrief's «Какво стана»`).toBeGreaterThan(0);
  for (const w of p.whatHappened) expect(w).toBe(`  → Какво стана: ${ON_ROAD.explanationBg}`);
  const all = JSON.stringify([p.toast, p.sheet, p.rebuilt, p.moments]) + p.debrief;
  for (const f of FALSE_CLAUSES) expect(all, `${label}: prints «${f}»`).not.toContain(f);
  return p;
}

function expectOffRoadEverywhere(label: string, s: Surfaces) {
  const p = printed(s);
  expect(p.details.length, `${label}: no COLLISION billed`).toBeGreaterThan(0);
  expect(new Set(p.details), `${label}: the bill's detail`).toEqual(new Set(["staticObject"]));
  expect(p.toast.length, `${label}: no COLLISION toast reached the glass`).toBeGreaterThan(0);
  for (const t of p.toast) expect(t, `${label}: the toast`).toEqual([OFF_ROAD.titleBg, OFF_ROAD.explanationBg, OFF_ROAD.peekBg]);
  for (const t of p.sheet) expect(t, `${label}: the sheet`).toEqual([OFF_ROAD.titleBg, OFF_ROAD.explanationBg, OFF_ROAD.peekBg]);
  for (const w of p.whatHappened) expect(w).toBe(`  → Какво стана: ${OFF_ROAD.explanationBg}`);
  for (const e of s.events) expect(e, `${label}: the event carries no carriageway key`).not.toHaveProperty("onCarriageway");
  return p;
}

const tpl = (id: string) => SCENARIO_TEMPLATES.find((s) => s.id === id)!;

describe("T1 — a live block strike, LATE50, at L1, L3 and L5: every surface prints the on-road copy", () => {
  for (const L of [1, 3, 5] as ScenarioLevel[]) {
    it(`L${L}: the contact carries the body's fact, the bill reads «staticObjectOnRoad», and nothing graded moved from base`, () => {
      const lesson = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, L);
      const s = drive(lesson, SC_HZ_BRAKE_DONT_SWERVE.map.districtId, { x: 4.06, y: 15, headingDeg: 0 }, cruiseInto(50, 180), 60 * 40);
      // The chain carried the fact from the collider to the tick.
      expect(s.events).toEqual([{ kind: "collision", withWhat: "staticObject", onCarriageway: true }]);
      expectOnRoadEverywhere(`hz L${L}`, s);
      if (L === 1) expect(s.moments.length, "L1 pauses with the teach card").toBeGreaterThan(0);
      // GUARDS — base's numbers, unmoved (STEP 0(b)).
      expect(judgedUntilEnd(s.o).map((j) => [j.bookedStep, +j.impactKmh.toFixed(2), j.withWhat, j.graded])).toEqual([
        [858, 31.29, "staticObject", true],
      ]);
      const bill = s.o.result.summary.mistakes.find((m) => m.code === "COLLISION")!;
      expect([bill.points, bill.severityClass, bill.terminateSession, bill.lawRef]).toEqual([
        10,
        "opasna",
        true,
        VIOLATIONS.COLLISION.lawRef,
      ]);
      const pin = (s.o.session as { crashPin?: { impact?: unknown } }).crashPin;
      expect(pin?.impact, "the crash pin reads the on-road bill as a static object (S4)").toEqual({
        travel: "forward",
        body: "staticObject",
        end: "front",
      });
    });
  }
});

describe("the same body, struck other ways (live)", () => {
  it("a roadworks taper cone, car centre on the carriageway: the on-road copy", () => {
    const lesson = compileScenario(SC_MERGE_ROADWORKS_SHIFT, 1);
    const s = drive(lesson, SC_MERGE_ROADWORKS_SHIFT.map.districtId, { x: 8.3, y: 196, headingDeg: 0 }, cruiseInto(8), 60 * 15);
    expect(s.events.length).toBeGreaterThan(0);
    for (const e of s.events) expect(e).toMatchObject({ withWhat: "staticObject", onCarriageway: true });
    expectOnRoadEverywhere("roadworks taper cone", s);
  });

  it("the block clipped on a swerve: the on-road copy", () => {
    const lesson = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 3);
    // From the left of the lane, heading 5° to the right: the line crosses into
    // the block's left half (x 3.26) about 25 m on.
    const s = drive(lesson, SC_HZ_BRAKE_DONT_SWERVE.map.districtId, { x: 1.0, y: 160, headingDeg: 5 }, cruiseInto(25), 60 * 20);
    expectOnRoadEverywhere("hz block, clipped while steering", s);
  });

  it("S2(a): the sc-park-wall lot wall and an sc-ed-poligon-chain cone print the on-road copy too", () => {
    for (const [id, x, y, h] of [
      // nose-in to the free bay 5, 0.1 m short of the wall, creeping on
      ["sc-park-wall", 5.03, 6.0, 0],
      ["sc-ed-poligon-chain", 140, -129 - 18, 0],
    ] as const) {
      const spec = tpl(id);
      const s = drive(compileScenario(spec, 1), spec.map.districtId, { x, y, headingDeg: h }, cruiseInto(15), 60 * 10);
      expectOnRoadEverywhere(id, s);
    }
  });
});

describe("T3 — THE BODY, NOT THE POSE, driven: off-road bodies keep today's copy byte for byte", () => {
  it("(2) an sc-roundabout-entry island strike with the car's centre ON the carriageway: staticObject", () => {
    const spec = tpl("sc-roundabout-entry");
    const s = drive(compileScenario(spec, 1), spec.map.districtId, { x: 0, y: -40, headingDeg: 0 }, cruiseInto(15), 60 * 15, true);
    const surface = districtDrivableSurfaceOf(loadDistrict(spec.map.districtId) as object)!;
    const k = judgedUntilEnd(s.o)[0].bookedStep;
    // poseAfterStep[i] is the car after step i: the step before the contact began.
    const [x, y] = s.o.poseAfterStep[k - 1];
    expect(surfaceAt(surface, x, y, makeSurfaceFix()).under, `the car's centre (${x.toFixed(2)}, ${y.toFixed(2)}) is on the ring's carriageway`).toBe("carriageway");
    expectOffRoadEverywhere("roundabout island", s);
  });

  it("an l0-free-drive façade at 50 km/h: staticObject", () => {
    const l0 = LESSONS.find((l) => l.id === "l0-free-drive")!;
    const s = drive(l0, "district-v1", { x: -70.4415977941719, y: -448.9816804167297, headingDeg: 4.687765847628214 }, cruiseInto(50), 60 * 25);
    expectOffRoadEverywhere("l0 façade", s);
  });

  it("an sc-pk-driveway wall (both of its walls stand off the carriageway): staticObject", () => {
    const spec = tpl("sc-pk-driveway");
    const s = drive(compileScenario(spec, 1), spec.map.districtId, { x: 11, y: 45 - 18, headingDeg: 0 }, cruiseInto(15), 60 * 10);
    expectOffRoadEverywhere("pk-driveway wall", s);
  });
});

describe("T2 — the recorder demos: mistake-late-brake and mistake-squeeze-cones at L1–L5", () => {
  for (const [name, spec, record] of [
    ["mistake-late-brake", SC_HZ_BRAKE_DONT_SWERVE, recordScHzBrakeDontSwerveDrive],
    ["mistake-squeeze-cones", SC_MERGE_ROADWORKS_SHIFT, recordScMergeRoadworksShiftDrive],
  ] as const) {
    it(`${spec.id}/${name}: every rung prints the on-road copy from the rects' by-value flag`, () => {
      const rungs = ([1, 2, 3, 4, 5] as ScenarioLevel[]).map((L) => {
        const lesson = compileScenario(spec, L);
        return { L, lesson, session: createLessonSession(lesson, { staticContactBodies: heldStaticContactBodies(lesson.id) }), s: { toasts: [], moments: [], events: [] } as Pick<Surfaces, "toasts" | "moments" | "events"> };
      });
      const d = (record as (raw: unknown, n: string, x: { onTick: (t: SimTick) => void }) => { ruleEvents: Array<{ kind: string; code?: string; detail?: string }> })(
        loadDistrict(spec.map.districtId),
        name,
        {
          onTick: (tick) => {
            for (const r of rungs) {
              if (r.session.phase === "completed" || r.session.phase === "aborted") continue;
              for (const e of tick.events) if (e.kind === "collision") r.s.events.push({ ...e });
              const step = applyTick(r.session, tick);
              r.session = step.state;
              for (const h of step.hudEvents) if (h.kind === "violation" && h.titleBg === OFF_ROAD.titleBg) r.s.toasts.push(h);
              for (const m of step.teachMoments ?? []) if (m.code === "COLLISION") r.s.moments.push(m);
            }
          },
        },
      );
      expect(d.ruleEvents.filter((e) => e.kind === "violation" && e.code === "COLLISION").map((e) => e.detail).length).toBeGreaterThan(0);
      for (const e of d.ruleEvents) if (e.kind === "violation" && e.code === "COLLISION") expect(e.detail).toBe("staticObjectOnRoad");
      for (const r of rungs) {
        const result = buildLessonResult(r.session);
        const fake = { o: { result, session: r.session } as unknown as ContactDriveOutcome, lesson: r.lesson, ...r.s } as Surfaces;
        expectOnRoadEverywhere(`${spec.id}/${name}/L${r.L}`, fake);
      }
    });
  }

  it("the recorder rect carries the fact by value (the twin of the live stamp)", () => {
    expect(hzBrakeDontSwerveObstacles().map((r) => r.onCarriageway)).toEqual([true]);
  });
});

describe("STEP 2 (iv) — LessonScene's own handleCollision forwards the fact to the runtime", () => {
  function sceneWith(pushes: unknown[][]) {
    const scope: Record<string, unknown> = {
      impactCutRef: { current: null },
      runtime: { pushCollision: (...a: unknown[]) => void pushes.push(a) },
      nameLiveContact: () => undefined,
      playerObb: () => ({}),
      liveContactBodies: () => [],
      directorContactCast: () => null,
      director: null,
      traffic: { staged: () => undefined },
      hittableObstacleBodies: () => [],
      built: { scenarioObstacles: [] },
      obstacleFootprintsRef: { current: [] },
    };
    expect(Object.keys(scope).sort()).toEqual([...SCENE_COLLISION_NAMES].sort());
    return sceneHandleCollision().bind(scope as never);
  }
  const student = { position: { x: 4.06, y: 186.8 }, headingDeg: 0 } as never;

  it("a stamped body's contact reaches pushCollision with the fact as its third argument", () => {
    const pushes: unknown[][] = [];
    sceneWith(pushes)(31.29, "staticObject", student, true);
    expect(pushes, "handleCollision must hand the struck body's carriageway fact to runtime.pushCollision").toEqual([
      ["staticObject", undefined, true],
    ]);
  });

  it("every other contact reaches it without the fact", () => {
    const pushes: unknown[][] = [];
    sceneWith(pushes)(31.29, "staticObject", student);
    expect(pushes).toEqual([["staticObject", undefined, undefined]]);
  });
});
