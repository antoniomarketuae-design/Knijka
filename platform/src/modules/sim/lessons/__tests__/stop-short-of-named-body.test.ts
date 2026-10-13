/**
 * «СПРИ ПРЕДИ ПРЕПЯТСТВИЕТО» IS NOT DONE BY A CAR THAT HAS TOUCHED IT —
 * `ReachZoneParams.stopShortOf` (lane hztick round 2,
 * sc-hz-brake-dont-swerve:a7d0dd29).
 *
 * THE DRIVE THIS FILE IS CUT FROM (rig-w3d, PC and phone, 8cb0707): 49.6 км/ч
 * into the fallen-load block with the brake never touched — «Удар в неподвижно
 * препятствие −10», and half a second later «✓ Спри преди препятствието — с
 * пълна спирачка, В своята лента» and «Задачите от маршрута са изпълнени». The
 * product's chassis is thrown back off what it hits, so on the contact's own
 * grid point it already read under the gate's 6 км/ч cap, and a car rolling
 * back is «at ≤ 1 км/ч» to the rule engine's signed full stop.
 *
 * WHY ROUND 1 DID NOT CLOSE IT, and this is the half worth remembering. It
 * asked «did the impact ARREST the car?» and answered from the speed on the
 * bill's grid point — «travelling above 1 км/ч one grid point before, at or
 * under it now». Its own unit test pinned «20 → 1.4 км/ч on the bill tick is a
 * scrape, not an arrest», and the chassis showed a 45 км/ч frontal strike with
 * a quarter of the wheel on leaving +1.6 км/ч there: the pin encoded the hole.
 * A touch at 0.97 км/ч was never «travelling» at all. Nineteen of the
 * verifier's ninety swerves and twenty-nine of its eighty-one slow touches
 * kept the tick. THE QUESTION WAS WRONG: the banner's word is «преди».
 *
 * THE RULE: a graded static-object contact at whose own grid point the car's
 * body is on the rectangle the gate names closes the task for the rest of the
 * attempt — no speed is read, no latch protects it, a fresh approach does not
 * re-open it, and a tick given before the touch is taken back at the fold. A
 * contact with ANY OTHER body leaves the gate alone.
 *
 * ENGINE-LEVEL ON PURPOSE (§3 on): `applyTick`, the entry point the shell
 * itself calls, on the compiled rung — a term the `serializeObjectiveParams`
 * whitelist drops is green in every test that does not cross that boundary.
 * The product's chassis drives the same rule in
 * `scenario/__tests__/hz-stop-before-contact.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { obbSeparationM, playerObb, SWEEP_RESOLUTION_M } from "../../collision";
import type { LessonObjective, LessonSpec } from "../../contracts";
import { HALT_VOIDED_ROW_BG, objectiveDetailText } from "../../hud/SessionEndScreen";
import type { SimTick } from "../../rules";
import { buildDebrief, HALT_VOIDED_DEBRIEF_BG } from "../debrief";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import {
  createEvalState,
  namedBodyTouched,
  namedBodyTouchVoidsObjective,
  parseObjectiveParams,
  reachZoneJourneyRefusal,
  stepObjective,
  type ObjectiveContext,
  type WitnessedReachZoneParams,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../scenario/templates-hazards2";
import type { LessonSessionState, ObjectiveEvalState } from "../types";
import { makeTick } from "./fixtures";

const STOP_ID = "sc-hzbds-stop";
const STOP_TASK = "Спри преди препятствието — с пълна спирачка, В своята лента";
const ROUTE_DONE = "Задачите от маршрута са изпълнени";
const VOID_ROW = "Не се отчете: колата удари препятствието — задачата е да спреш преди него.";
const VOID_DEBRIEF = `Задачата «${STOP_TASK}» не се отчете: колата удари препятствието — задачата е да спреш преди него. Спирай по-рано.`;
const JOURNEY_CLAUSE = "по-рано в този урок колата удари препятствието, преди което трябваше да спре";
const ROUTE_END_TITLE = "Край на маршрута";

/** The block (`templates-hazards2 DEBRIS_BLOCK`; the chassis witness pins it to
 *  the trace rect and the scene's collider). */
const BLOCK = { x: 4.06, y: 190, headingDeg: 0, halfLengthM: 1.2, halfWidthM: 0.8 };
const LANE_X = 4.06;
/** The car centre's y with its nose ON the block's near face, dead straight:
 *  188.8 − `CHASSIS_HALF_EXTENTS.z` (2.02). */
const NOSE_ON_Y = 186.78;
const sepAt = (x: number, y: number, headingDeg = 0) => obbSeparationM(playerObb(x, y, headingDeg), BLOCK);
/** The y at which a car at (x, heading) stands `sepM` short of the block. */
function yStanding(sepM: number, x = LANE_X, headingDeg = 0): number {
  let lo = 170;
  let hi = 188.7;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (sepAt(x, mid, headingDeg) > sepM) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ───────────────────────────────────────────────────────────────────────────
// §1 · the geometry: WHICH body, never whether
// ───────────────────────────────────────────────────────────────────────────

describe("namedBodyTouched — is the car's box on the named rectangle", () => {
  it("the fixture is the car it says it is: nose on the face is separation 0", () => {
    expect(sepAt(LANE_X, NOSE_ON_Y)).toBeCloseTo(0, 6);
    expect(sepAt(LANE_X, yStanding(0.3))).toBeCloseTo(0.3, 6);
    expect(sepAt(3.78, yStanding(0.005, 3.78, 355), 355)).toBeCloseTo(0.005, 6);
  });

  it("on the block: overlapping, nose on the face, and anywhere inside the collision module's contact resolution — straight or yawed, either way", () => {
    const pose = (x: number, y: number, headingDeg = 0) => ({ x, y, headingDeg });
    expect(namedBodyTouched(BLOCK, pose(LANE_X, NOSE_ON_Y + 0.08))).toBe(true); // 8 cm into it
    expect(namedBodyTouched(BLOCK, pose(LANE_X, NOSE_ON_Y))).toBe(true);
    expect(namedBodyTouched(BLOCK, pose(LANE_X, yStanding(0.013)))).toBe(true); // the widest the chassis showed
    expect(namedBodyTouched(BLOCK, pose(3.78, yStanding(0.005, 3.78, 355), 355))).toBe(true);
    expect(namedBodyTouched(BLOCK, pose(4.34, yStanding(0.005, 4.34, 5), 5))).toBe(true);
    expect(namedBodyTouched(BLOCK, pose(3.5, yStanding(0.01, 3.5, 344), 344))).toBe(true);
    expect(namedBodyTouched(BLOCK, pose(LANE_X, yStanding(SWEEP_RESOLUTION_M - 0.01)))).toBe(true);
  });

  it("NOT on it: past the reach, beside it on the kerb, in the other lane, down the road", () => {
    const pose = (x: number, y: number, headingDeg = 0) => ({ x, y, headingDeg });
    expect(SWEEP_RESOLUTION_M).toBe(0.15);
    expect(namedBodyTouched(BLOCK, pose(LANE_X, yStanding(SWEEP_RESOLUTION_M + 0.01)))).toBe(false);
    expect(namedBodyTouched(BLOCK, pose(LANE_X, yStanding(0.3)))).toBe(false);
    expect(namedBodyTouched(BLOCK, pose(LANE_X, yStanding(0.9)))).toBe(false);
    // Flank on the kerb beside the block (lane edge x 8.125, half-width 0.85):
    // 1.5 m of daylight to the rectangle.
    expect(sepAt(7.275, 190)).toBeCloseTo(1.565, 3);
    expect(namedBodyTouched(BLOCK, pose(7.275, 190))).toBe(false);
    expect(namedBodyTouched(BLOCK, pose(-4.06, 190))).toBe(false); // the escort's lane
    expect(namedBodyTouched(BLOCK, pose(LANE_X, 150))).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §2 · the term: parsed, refused when malformed, read outside the latch
// ───────────────────────────────────────────────────────────────────────────

function parsed(params: Record<string, unknown>): WitnessedReachZoneParams {
  const objective: LessonObjective = { id: "o1", titleBg: STOP_TASK, kind: "reachZone", params };
  return parseObjectiveParams(objective) as WitnessedReachZoneParams;
}
const GATE = { x: LANE_X, y: 184, radiusM: 4, maxSpeedKmh: 6 };

describe("stopShortOf — the authored term", () => {
  it("parses to its own copy, and is absent when not authored (the title alone derives nothing)", () => {
    const p = parsed({ ...GATE, stopShortOf: BLOCK });
    expect(p.stopShortOf).toEqual(BLOCK);
    expect(p.stopShortOf).not.toBe(BLOCK);
    expect(parsed(GATE).stopShortOf).toBeUndefined();
  });

  it("a malformed rectangle throws — a silently dropped demand is the false ✓", () => {
    for (const bad of [
      true,
      null,
      "block",
      {},
      { ...BLOCK, x: undefined },
      { ...BLOCK, headingDeg: "0" },
      { ...BLOCK, halfLengthM: 0 },
      { ...BLOCK, halfWidthM: -0.8 },
      { ...BLOCK, y: Number.NaN },
    ]) {
      expect(() => parsed({ ...GATE, stopShortOf: bad }), JSON.stringify(bad)).toThrow(
        /reachZone stopShortOf needs x, y, headingDeg and halfLengthM, halfWidthM > 0/,
      );
    }
  });

  it("namedBodyTouchVoidsObjective: only a gate that names a body, only once it has been touched", () => {
    const named = parsed({ ...GATE, stopShortOf: BLOCK });
    const bare = parsed(GATE);
    expect(namedBodyTouchVoidsObjective(named, true)).toBe(true);
    expect(namedBodyTouchVoidsObjective(named, false)).toBe(false);
    expect(namedBodyTouchVoidsObjective(bare, true)).toBe(false);
    expect(namedBodyTouchVoidsObjective({ kind: "driveDistance", meters: 50 } as never, true)).toBe(false);
  });

  /** A lawful halt on the mark: in under the cap, then standing with the rule
   *  engine's stop current. */
  const HALT: SimTick[] = [
    makeTick({ t: 1, position: { x: LANE_X, y: 178 }, speedKmh: 5 }),
    makeTick({ t: 2, position: { x: LANE_X, y: 183 }, speedKmh: 4 }),
    makeTick({ t: 3, position: { x: LANE_X, y: 184 }, speedKmh: 0 }),
    makeTick({ t: 4, position: { x: LANE_X, y: 184 }, speedKmh: 0 }),
  ];
  function evaluate(params: WitnessedReachZoneParams, ctx: ObjectiveContext) {
    let st: ObjectiveEvalState = createEvalState(params);
    let done = false;
    for (const tick of HALT) {
      const r = stepObjective(params, st, tick, ctx);
      st = r.evalState;
      done = done || r.done;
    }
    return { done, st };
  }
  const CTX: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0, qualifyingStopCurrent: true };

  it("the evaluator: a touched body refuses the tick with the halt contract LATCHED and the stop current — and only on a gate that names a body", () => {
    const named = parsed({ ...GATE, stopShortOf: BLOCK });
    expect(named.requireFullStop, "the banner's «пълна спирачка» still derives the full-stop demand").toBe(true);
    const clean = evaluate(named, CTX);
    expect(clean.done).toBe(true);
    const touched = evaluate(named, { ...CTX, touchedNamedBody: true });
    expect(touched.done).toBe(false);
    // OUTSIDE the latch: the contract is latched all the same — round 1's
    // «only while the contract had not latched» is the half this is not.
    expect(touched.st.type === "reachZone" && touched.st.capMet).toBe(true);
    // Unknown is never a refusal.
    expect(evaluate(named, { ...CTX, touchedNamedBody: false }).done).toBe(true);
    // A gate without the key never consults the fact.
    expect(evaluate(parsed(GATE), { ...CTX, touchedNamedBody: true }).done).toBe(true);
  });

  it("it is a JOURNEY refusal — slowing down cannot undo it — and it is asked last", () => {
    const named = parsed({ ...GATE, stopShortOf: BLOCK });
    expect(reachZoneJourneyRefusal(named, { ...CTX, touchedNamedBody: true })).toBe("stopShortOf");
    expect(reachZoneJourneyRefusal(named, CTX)).toBeNull();
    expect(reachZoneJourneyRefusal(parsed(GATE), { ...CTX, touchedNamedBody: true })).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §3 · the engine, on the compiled rung
// ───────────────────────────────────────────────────────────────────────────

type Hit = "staticObject" | "vehicle" | "pedestrian";
/** A tick on the drill's own lane axis unless told otherwise. */
const at = (
  y: number,
  speedKmh: number,
  t: number,
  hit?: Hit,
  pose: { x?: number; headingDeg?: number } = {},
): SimTick =>
  makeTick({
    t,
    position: { x: pose.x ?? LANE_X, y },
    headingDeg: pose.headingDeg ?? 0,
    speedKmh,
    ...(hit ? { events: [{ kind: "collision" as const, withWhat: hit }] } : {}),
  });

interface Ran {
  session: LessonSessionState;
  result: ReturnType<typeof buildLessonResult>;
  /** Every `lesson` card raised: title and whole text. */
  said: Array<{ t: number; titleBg: string; text: string }>;
  /** Every «task done» toast raised. */
  toasts: string[];
  stopDone: boolean;
  debrief: string;
}
function run(lesson: LessonSpec, ticks: SimTick[]): Ran {
  let session: LessonSessionState = createLessonSession(lesson);
  const said: Ran["said"] = [];
  const toasts: string[] = [];
  for (const tick of ticks) {
    const step = applyTick(session, tick);
    session = step.state;
    for (const h of step.hudEvents) {
      if (h.kind === "lesson") said.push({ t: tick.t, titleBg: h.titleBg ?? "", text: JSON.stringify(h) });
      if (h.kind === "objectiveComplete") toasts.push((h as { titleBg?: string }).titleBg ?? "");
    }
  }
  const result = buildLessonResult(session);
  const stop = result.objectives.findIndex((ob) => ob.id === STOP_ID);
  return {
    session,
    result,
    said,
    toasts,
    stopDone: result.objectives[stop].done,
    debrief: buildDebrief(lesson, result, {}).text,
  };
}

/** 45 км/ч up the lane, through task 1, to `toY`. */
const approach = (toY: number): SimTick[] => {
  const out: SimTick[] = [];
  let t = 0;
  for (let y = 60; y <= toY; y += 3) out.push(at(y, 45, (t += 0.24)));
  return out;
};
const tOf = (ticks: SimTick[]) => ticks[ticks.length - 1].t;
/** The driver's own halt on the mark from `t0`: slowing in, then standing a second. */
const haltOnTheMark = (t0: number): SimTick[] => [
  at(176, 30, t0 + 0.4),
  at(181, 12, t0 + 1.0),
  at(183.5, 3, t0 + 1.6),
  ...Array.from({ length: 60 }, (_, i) => at(184, 0, t0 + 2.0 + i / 60)),
];
/** Standing `n` grid points at `y` from `t0`. */
const standing = (y: number, t0: number, n = 60, pose: { x?: number; headingDeg?: number } = {}): SimTick[] =>
  Array.from({ length: n }, (_, i) => at(y, 0, t0 + i / 60, undefined, pose));

const LEVELS = [1, 3] as const;
const lessonAt = (level: 1 | 3) => compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level);

describe("a touch of the block closes the task — at ANY speed, at any yaw", () => {
  /**
   * `before → at` is the car's speed one grid point before the contact and at
   * it. The first three are the product chassis's own numbers (the witness
   * drives them); the last three are speeds no «arrest» predicate could read.
   */
  const TOUCHES: Array<{ name: string; before: number; at: number; x?: number; headingDeg?: number }> = [
    { name: "49.9 км/ч dead straight, thrown back at −3.9 (the rig's LATE50)", before: 49.9, at: -3.9 },
    { name: "44.9 км/ч with a quarter of the wheel on: still +1.6 FORWARD on the contact's grid point (round 1 kept this tick)", before: 44.9, at: 1.6, x: 3.78, headingDeg: 355 },
    { name: "a touch at 0.97 км/ч — never «travelling» (round 1 kept this tick)", before: 0.97, at: -0.08 },
    { name: "a creep at 0.5 км/ч that is still creeping after it", before: 0.5, at: 0.3 },
    { name: "a glancing 20 → 18 км/ч that does not slow the car — round 1's own pin called it «a scrape, not an arrest»", before: 20, at: 18 },
    { name: "a 0.04 км/ч kiss", before: 0.04, at: 0 },
  ];
  for (const level of LEVELS) {
    for (const c of TOUCHES) {
      it(`L${level}: ${c.name} — refused, recorded, and the sheet says why`, () => {
        const pose = { x: c.x, headingDeg: c.headingDeg };
        const yTouch = yStanding(0.004, c.x ?? LANE_X, c.headingDeg ?? 0);
        const a = approach(168);
        const t0 = tOf(a);
        const ticks = [
          ...a,
          at(174, Math.max(c.before, 8), t0 + 0.5),
          at(yTouch - 0.3, c.before, t0 + 1.2, undefined, pose),
          at(yTouch, c.at, t0 + 1.2 + 1 / 60, "staticObject", pose),
          // …and then the driver's own halt, right there, a whole second of it.
          ...standing(yTouch, t0 + 1.3, 90, pose),
        ];
        const r = run(lessonAt(level), ticks);
        expect(r.session.events.filter((e) => e.code === "COLLISION").map((e) => e.titleBg)).toEqual([
          "Удар в неподвижно препятствие",
        ]);
        expect(r.session.touchedNamedBodies).toEqual([STOP_ID]);
        expect(r.stopDone, "the task ticked on a car that had touched the block").toBe(false);
        expect(r.toasts).toEqual(["Мини участъка с разрешената скорост"]);
        expect(r.result.objectives[1].completedAtSec).toBeNull();
        expect(r.result.objectives[1].detail).toEqual({ kind: "haltVoided", reason: "touched" });
        expect(objectiveDetailText(r.result.objectives[1].detail)).toBe(VOID_ROW);
        expect(r.debrief.split(VOID_DEBRIEF).length, "the reason line, once").toBe(2);
        expect(r.debrief).not.toContain(ROUTE_DONE);
        expect(r.result.completedAll).toBe(false);
        expect(r.result.score).toBe(10);
      });
    }

    it(`L${level}: the halt contract LATCHED a metre before the touch (under the cap, in the disc) — the touch still closes the task`, () => {
      const a = approach(168);
      const t0 = tOf(a);
      const before = run(lessonAt(level), [...a, at(176, 30, t0 + 0.4), at(181, 14, t0 + 1.0), at(184.5, 5.5, t0 + 1.8)]);
      const st = before.session.evalStates[1];
      expect(st.type === "reachZone" && st.capMet, "the fixture did not latch the contract").toBe(true);
      const r = run(lessonAt(level), [
        ...a,
        at(176, 30, t0 + 0.4),
        at(181, 14, t0 + 1.0),
        at(184.5, 5.5, t0 + 1.8),
        at(NOSE_ON_Y - 0.05, 5, t0 + 3.2),
        at(NOSE_ON_Y, -0.4, t0 + 3.2 + 1 / 60, "staticObject"),
        ...standing(NOSE_ON_Y, t0 + 3.3, 90),
      ]);
      expect(r.stopDone).toBe(false);
      expect(r.session.touchedNamedBodies).toEqual([STOP_ID]);
    });

    it(`L${level}: the touch arrives on the very grid point the halt would have completed — no tick, and no «task done» toast for a row the sheet shows open`, () => {
      // Standing a hair short of the block, in the disc: find the grid point
      // the tick lands on, then run the drive again with a contact reported
      // on that grid point (the car's box inside the reach).
      const a = approach(168);
      const t0 = tOf(a);
      const y = yStanding(0.1);
      const lead = [...a, at(176, 30, t0 + 0.4), at(181, 12, t0 + 1.0), at(y - 0.4, 3, t0 + 1.6)];
      const still = standing(y, t0 + 2.0, 90);
      let session = createLessonSession(lessonAt(level));
      let landsOn = -1;
      [...lead, ...still].forEach((tick, i) => {
        session = applyTick(session, tick).state;
        if (landsOn < 0 && session.objectives[1].status === "done") landsOn = i;
      });
      expect(landsOn, "the fixture never ticks").toBeGreaterThan(lead.length);
      const ticks = [...lead, ...still].map((tick, i) =>
        i === landsOn ? { ...tick, events: [{ kind: "collision" as const, withWhat: "staticObject" as const }] } : tick,
      );
      const r = run(lessonAt(level), ticks);
      expect(r.stopDone).toBe(false);
      expect(r.toasts, "a «task done» toast for a task the sheet shows open").toEqual(["Мини участъка с разрешената скорост"]);
      expect(r.session.objectives[1].status).toBe("active");
    });
  }
});

describe("a contact with ANOTHER body does not close this task", () => {
  /** Back down the road, out of the ring and of the crash pin, then the
   *  driver's own approach and halt on the mark. */
  const backOffAndHalt = (t: number): SimTick[] => [
    at(178, -10, t + 2),
    at(168, -10, t + 5),
    at(165, 0, t + 6),
    at(172, 15, t + 8.6),
    at(176, 14, t + 9.6),
    at(181, 8, t + 10.6),
    at(183.4, 3, t + 11.6),
    ...standing(184, t + 12.1, 60),
  ];
  /** Each case: the ticks after a 45 км/ч approach to y 147 that ended at `t0`. */
  const OTHERS: Array<{ name: string; tail: (t0: number) => SimTick[] }> = [
    {
      name: "a static contact with the car's box 0.3 m short of the block (something else in the lane), and he stands where it stopped him",
      tail: (t0) => [
        at(176, 30, t0 + 2),
        at(181, 12, t0 + 2.6),
        at(183.5, 5, t0 + 3.2),
        at(yStanding(0.3) - 0.2, 4, t0 + 4.6),
        at(yStanding(0.3), 0.5, t0 + 4.6 + 1 / 60, "staticObject"),
        ...standing(yStanding(0.3), t0 + 4.7, 90),
      ],
    },
    {
      name: "the kerb beside the block, mounted at 14 км/ч (a static contact 1.5 m from the rectangle)",
      tail: (t0) => [
        at(170, 30, t0 + 1.6),
        at(187, 14, t0 + 3.6, undefined, { x: 6.9 }),
        at(190, 9, t0 + 3.6 + 1 / 60, "staticObject", { x: 7.275 }),
        ...backOffAndHalt(t0 + 3.7),
      ],
    },
    {
      name: "a VEHICLE contact reported with the car's nose on the block (the category is not the block's)",
      tail: (t0) => [
        at(176, 30, t0 + 2),
        at(181, 12, t0 + 2.6),
        at(183.5, 5, t0 + 3.2),
        at(NOSE_ON_Y - 0.1, 3, t0 + 5.6),
        at(NOSE_ON_Y, 2, t0 + 5.6 + 1 / 60, "vehicle"),
        ...standing(NOSE_ON_Y, t0 + 5.7, 90),
      ],
    },
    {
      name: "a static contact 34 m back down the road",
      tail: (t0) => [
        at(150.2, 20, t0 + 1 / 60, "staticObject"),
        at(156, 25, t0 + 3),
        at(168, 30, t0 + 4.5),
        at(178, 18, t0 + 6),
        at(182.5, 6, t0 + 7),
        ...standing(184, t0 + 7.6, 60),
      ],
    },
  ];
  for (const level of LEVELS) {
    for (const c of OTHERS) {
      it(`L${level}: ${c.name} — billed on its own row, and the stop the driver makes is ticked`, () => {
        const a = approach(147);
        const r = run(lessonAt(level), [...a, ...c.tail(tOf(a))]);
        expect(r.session.events.filter((e) => e.code === "COLLISION").length, "the contact was not billed").toBe(1);
        expect(r.result.score).toBe(10);
        expect(r.session.touchedNamedBodies, "a contact with another body was booked to the block").toBeUndefined();
        expect(r.stopDone, "a stop the driver made was refused for a contact with another body").toBe(true);
        expect(r.result.objectives[1].detail).toBeUndefined();
        expect(r.debrief).not.toContain("не се отчете");
      });
    }
  }
});

describe("a billed contact with ANOTHER body BEFORE the block does not hide the touch (the round-2 verifier's surviving mutant V3, pinned at the landing)", () => {
  /**
   * The touch is keyed on the CONTACT EVENT of its own grid point, never on
   * whether the run already carries a COLLISION bill: a student who clips the
   * escort car on the way up and then drives into the block has still touched
   * the block. The verifier drove it on the chassis (ESCORT-THEN-BLOCK: vehicle
   * bill at step 648, block strike at 914 — recorded, no ✓) and no test held
   * it: «only the first collision of a run can be a touch» was green on all 160.
   */
  /** 45 км/ч to y 147, then the escort clipped at y 150.2, 34 m before the block's mark. */
  const escortStrike = (): SimTick[] => {
    const a = approach(147);
    return [...a, at(150.2, 20, tOf(a) + 1 / 60, "vehicle")];
  };
  for (const level of LEVELS) {
    it(`L${level}: the escort is struck and billed, then the car drives on into the block — the touch IS recorded, the stop is refused, and the sheet says why`, () => {
      const lead = escortStrike();
      const t0 = tOf(lead);
      const yTouch = yStanding(0.004);
      const upToTheBlock = [
        ...lead,
        at(156, 25, t0 + 3),
        at(168, 30, t0 + 4.5),
        at(174, 12, t0 + 5.5),
        at(yTouch - 0.3, 5, t0 + 6.6),
      ];
      // Antecedent: on the grid point before the block is touched the run ALREADY holds a billed contact — with a
      // vehicle, booked to no gate.
      const before = run(lessonAt(level), upToTheBlock);
      const billsBefore = before.session.events.filter((e) => e.code === "COLLISION");
      expect(billsBefore.map((e) => e.titleBg)).toEqual(["Удар в друго превозно средство"]);
      expect(before.session.touchedNamedBodies).toBeUndefined();
      // The block, at −0.4 км/ч after the contact, and then a whole second standing on it.
      const r = run(lessonAt(level), [
        ...upToTheBlock,
        at(yTouch, -0.4, t0 + 6.6 + 1 / 60, "staticObject"),
        ...standing(yTouch, t0 + 6.7, 90),
      ]);
      // THE PIN: the touch is recorded although a collision was already on the sheet…
      expect(r.session.touchedNamedBodies, "the block touch was lost behind the earlier bill").toEqual([STOP_ID]);
      // …so the stop is not ticked, and the row and the debrief say why.
      expect(r.stopDone, "the task ticked on a car that had touched the block").toBe(false);
      expect(r.toasts).toEqual(["Мини участъка с разрешената скорост"]);
      expect(r.result.objectives[1].completedAtSec).toBeNull();
      expect(r.result.objectives[1].detail).toEqual({ kind: "haltVoided", reason: "touched" });
      expect(objectiveDetailText(r.result.objectives[1].detail)).toBe(VOID_ROW);
      expect(r.debrief.split(VOID_DEBRIEF).length, "the reason line, once").toBe(2);
      expect(r.debrief).not.toContain(ROUTE_DONE);
      expect(r.result.completedAll).toBe(false);
      // Both contacts are on the sheet, each on its own row, in the order they happened.
      expect(r.session.events.filter((e) => e.code === "COLLISION").map((e) => e.titleBg)).toEqual([
        "Удар в друго превозно средство",
        "Удар в неподвижно препятствие",
      ]);
    });

    it(`L${level}: …and the same escort strike followed by the driver's own stop SHORT of the block keeps the tick — it is the block's touch that closes the task, not the earlier bill`, () => {
      const lead = escortStrike();
      const t0 = tOf(lead);
      const r = run(lessonAt(level), [
        ...lead,
        at(156, 25, t0 + 3),
        at(168, 30, t0 + 4.5),
        at(178, 18, t0 + 6),
        at(182.5, 6, t0 + 7),
        ...standing(184, t0 + 7.6, 60),
      ]);
      expect(r.session.events.filter((e) => e.code === "COLLISION").map((e) => e.titleBg)).toEqual(["Удар в друго превозно средство"]);
      expect(r.session.touchedNamedBodies).toBeUndefined();
      expect(r.stopDone, "a stop the driver made was refused for a contact with another body").toBe(true);
      expect(r.result.objectives[1].detail).toBeUndefined();
      expect(r.debrief).not.toContain("не се отчете");
    });
  }
});

describe("NOT in the THEO-3 sandbox, where hitting the block is the assignment", () => {
  for (const level of LEVELS) {
    it(`L${level}: «Направи грешката» for the late-brake demo — the touch is not recorded and the session is byte for byte the lesson without the key`, () => {
      const lateBrake = SC_HZ_BRAKE_DONT_SWERVE.mistakes.findIndex((m) => m.titleBg === "Късно спиране в препятствието");
      expect(lateBrake).toBeGreaterThanOrEqual(0);
      const sandbox = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level, { mistakeExperience: { mistakeIndex: lateBrake } });
      expect(sandbox.mistakeExperience?.codes).toEqual(["COLLISION"]);
      const bare: LessonSpec = {
        ...sandbox,
        objectives: sandbox.objectives.map((o) => {
          const { stopShortOf: _struck, ...params } = o.params as Record<string, unknown>;
          return { ...o, params };
        }),
      };
      const a = approach(183);
      const t0 = tOf(a);
      const ticks = [
        ...a,
        at(NOSE_ON_Y, -3.8, t0 + 1 / 60, "staticObject"),
        ...Array.from({ length: 120 }, (_, i) => at(NOSE_ON_Y - 0.017 * (i + 1), Math.min(0, -3.8 + 0.04 * i), t0 + (i + 2) / 60)),
      ];
      const r = run(sandbox, ticks);
      expect(r.session.events, "the sandbox scored something").toEqual([]);
      expect(r.session.touchedNamedBodies).toBeUndefined();
      expect(r.result.objectives[1].detail).toBeUndefined();
      const was = run(bare, ticks);
      expect(r.result).toEqual(was.result);
      expect(r.said).toEqual(was.said);
      expect(r.toasts).toEqual(was.toasts);
    });
  }
});

describe("for the rest of the attempt — and the drive can still end", () => {
  for (const level of LEVELS) {
    it(`L${level}: after the touch the drive ends by itself where the route ends, half a second under the cap — on «Край на маршрута», never on «притисната»`, () => {
      const a = approach(183);
      const t0 = tOf(a);
      const ticks = [
        ...a,
        at(NOSE_ON_Y, -3.8, t0 + 1 / 60, "staticObject"),
        // Rolling back, free of the block, for two seconds.
        ...Array.from({ length: 120 }, (_, i) => at(NOSE_ON_Y - 0.017 * (i + 1), Math.min(0, -3.8 + 0.04 * i), t0 + (i + 2) / 60)),
      ];
      const r = run(lessonAt(level), ticks);
      expect(r.session.phase).toBe("completed");
      const ending = r.said[r.said.length - 1];
      expect(ending.titleBg).toBe(ROUTE_END_TITLE);
      expect(ending.t - (t0 + 1 / 60), "half a second after the contact").toBeCloseTo(0.5, 6);
      expect(r.said.filter((s) => s.text.includes("притисната"))).toEqual([]);
      expect(r.stopDone).toBe(false);
    });

    it(`L${level}: SELF-CORRECTION DOES NOT RE-OPEN IT — off the block, back down the road, on the mark again and standing: still not ticked, and the drive ends`, () => {
      const a = approach(183);
      const t0 = tOf(a);
      const ticks = [
        ...a,
        at(NOSE_ON_Y, -3.8, t0 + 1 / 60, "staticObject"),
        at(183, -12, t0 + 0.3),
        at(176, -12, t0 + 2.4),
        at(166, -12, t0 + 5.4), // out of the ring, out of the end zone, out of the crash pin
        at(165, 0, t0 + 6.4),
        at(172, 15, t0 + 9),
        at(177, 12, t0 + 10.2),
        at(181, 8, t0 + 11.4),
        at(183.4, 3, t0 + 12.4),
        ...standing(184, t0 + 13, 90),
      ];
      const r = run(lessonAt(level), ticks);
      expect(r.session.crashPin, "the fixture never left the crash pin").toBeUndefined();
      expect(r.stopDone, "a second approach re-opened a task the touch had closed").toBe(false);
      expect(r.session.touchedNamedBodies).toEqual([STOP_ID]);
      expect(r.session.phase).toBe("completed");
      expect(r.said[r.said.length - 1].titleBg).toBe(ROUTE_END_TITLE);
      expect(r.result.objectives[1].detail).toEqual({ kind: "haltVoided", reason: "touched" });
    });

    it(`L${level}: over the cap on the mark AFTER a touch (reversing off the block at 12 км/ч), the cap card does not say «Намали СЕГА» — slowing down cannot earn it any more, and the card says what did happen`, () => {
      const a = approach(168);
      const t0 = tOf(a);
      const ticks = [
        ...a,
        at(172, 5, t0 + 0.6),
        at(180, 5, t0 + 6),
        at(NOSE_ON_Y - 0.1, 5, t0 + 11),
        at(NOSE_ON_Y, 4.5, t0 + 11 + 1 / 60, "staticObject"),
        at(183, -12, t0 + 11.3),
        at(176, -12, t0 + 13.4),
      ];
      const r = run(lessonAt(level), ticks);
      // Creeping in at 5 км/ч the car was never over the cap before the touch.
      expect(r.said.filter((s) => s.titleBg === "Стигна точката, но твърде бързо" && s.t <= t0 + 11.1)).toEqual([]);
      const capCards = r.said.filter((s) => s.titleBg === "Стигна точката, но твърде бързо");
      expect(capCards.length, "the cap card was not raised").toBe(1);
      expect(capCards[0].text).not.toContain("Намали СЕГА");
      expect(capCards[0].text).toContain(JOURNEY_CLAUSE);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §4 · THE ORDER: stopped clean, ticked — and only then crept into it
// ───────────────────────────────────────────────────────────────────────────

describe("the order — a tick given before the touch", () => {
  const cleanHalt = (): SimTick[] => {
    const a = approach(168);
    return [...a, ...haltOnTheMark(tOf(a))];
  };

  for (const level of LEVELS) {
    it(`L${level}, ON THE DRILL AS SHIPPED this cannot arise: the stop is the last task, the attempt completes on the grid point it is ticked, and nothing driven after it is heard`, () => {
      const halt = cleanHalt();
      const done = run(lessonAt(level), halt);
      expect(done.stopDone).toBe(true);
      expect(done.session.phase).toBe("completed");
      expect(done.result.passed).toBe(true);
      // …and then the creep into the block, on a session that is already over.
      const t1 = tOf(halt);
      const after = [at(185.5, 4, t1 + 1), at(NOSE_ON_Y, 1.5, t1 + 2, "staticObject"), ...standing(NOSE_ON_Y, t1 + 2.1, 30)];
      let session = done.session;
      for (const tick of after) session = applyTick(session, tick).state;
      expect(session, "a tick was heard after the attempt ended").toBe(done.session);
      expect(buildLessonResult(session)).toEqual(done.result);
    });

    it(`L${level}, WHERE THE STOP IS NOT THE LAST TASK the fold takes the tick back — one sheet does not certify the stop short of a body and bill the contact with it`, () => {
      const lesson = lessonAt(level);
      const longer: LessonSpec = {
        ...lesson,
        objectives: [
          ...lesson.objectives,
          { id: "x-on", titleBg: "Продължи до края на улицата", kind: "reachZone", params: { x: LANE_X, y: 260, radiusM: 6 } },
        ],
      };
      const halt = cleanHalt();
      const t1 = tOf(halt);
      const ticked = run(longer, halt);
      expect(ticked.stopDone).toBe(true);
      expect(ticked.session.phase).toBe("driving");
      const tickedAt = ticked.result.objectives[1].completedAtSec;

      const r = run(longer, [
        ...halt,
        at(185.5, 4, t1 + 1),
        at(NOSE_ON_Y, 1.5, t1 + 2, "staticObject"),
        ...standing(NOSE_ON_Y, t1 + 2.1, 30),
      ]);
      // WHAT THE LEDGER DOES: in the loop a done task is never stepped again —
      // its row keeps the tick and its time…
      expect(r.session.objectives[1].status).toBe("done");
      expect(r.session.objectives[1].completedAtSec).toBe(tickedAt);
      expect(r.session.touchedNamedBodies).toEqual([STOP_ID]);
      // …and the FOLD takes it back, with its clock, and says why.
      expect(r.stopDone).toBe(false);
      expect(r.result.objectives[1].completedAtSec).toBeNull();
      expect(r.result.objectives[1].detail).toEqual({ kind: "haltVoided", reason: "touched" });
      expect(r.result.completedAll).toBe(false);
      expect(r.debrief).toContain(VOID_DEBRIEF);
      expect(r.debrief).not.toContain(ROUTE_DONE);
      expect(r.result.score).toBe(10);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §5 · the two sentences
// ───────────────────────────────────────────────────────────────────────────

describe("the row and the debrief are one sentence, and say only what is true of every drive that shows them", () => {
  it("one reason, on both tables", () => {
    expect(Object.keys(HALT_VOIDED_ROW_BG)).toEqual(["touched"]);
    expect(Object.keys(HALT_VOIDED_DEBRIEF_BG)).toEqual(["touched"]);
    expect(HALT_VOIDED_ROW_BG.touched).toBe(VOID_ROW);
    expect(`Задачата «${STOP_TASK}» ${HALT_VOIDED_DEBRIEF_BG.touched}`).toBe(VOID_DEBRIEF);
    // The debrief's first sentence IS the row, lower-cased after «Задачата «…»».
    expect(HALT_VOIDED_DEBRIEF_BG.touched.startsWith(VOID_ROW[0].toLowerCase() + VOID_ROW.slice(1))).toBe(true);
  });

  it("nothing about how hard the pedal was pressed (the tick carries no brake channel), nothing about what stopped the car", () => {
    for (const text of [HALT_VOIDED_ROW_BG.touched, HALT_VOIDED_DEBRIEF_BG.touched, JOURNEY_CLAUSE]) {
      expect(text).not.toMatch(/твърд|силн|докрай|спря от удара|спирачката/);
    }
    expect(HALT_VOIDED_DEBRIEF_BG.touched.endsWith("Спирай по-рано.")).toBe(true);
  });
});
