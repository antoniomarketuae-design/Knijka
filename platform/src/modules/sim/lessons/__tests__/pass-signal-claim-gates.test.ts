/**
 * TITLE-HONESTY GUARDS for the passSignal gates — the sibling of
 * `stop-claim-gates.test.ts`, which guards the same class on the reachZone side
 * and could never reach this one: passSignal grades EVENTS, not geometry.
 *
 * Both rows below were found by driving the shipped catalogue on staging
 * (2026-08-17 sweep) and both had the same shape — the debrief certifying, in
 * words, an act the SAME debrief convicted on the line underneath:
 *
 *   sc-sig-controller-live  ✓ «…по разрешение на регулировчика» / «Изчака
 *                             червения сигнал и потегли на зелено»
 *                           ✗ «Неизпълнение на сигнала на регулировчика −10»
 *   sc-junction-gap         ✓ «Премини стоп-линията след ПЪЛНО СПИРАНЕ…»
 *                           ✗ «Неспиране на знак Б2 „Спри!"» × 7, 0 full stops
 *   sc-junction-left        the same, × 11
 *   sc-junction-stop        the same, × 13, and the run reached ЗАДАЧА 3/3
 *
 * Every `it` here is written to FAIL on the code as it shipped that morning,
 * and every one of them is paired with the opposite direction — the drive that
 * must keep its tick — because a gate that refuses everybody is the same defect
 * pointing the other way.
 */

import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import type { SimTick, SimTickEvent } from "../../rules";
import {
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  PASS_SIGNAL_QUEUE_REACH_M,
} from "../objectives";
import type { ObjectiveEvalState, ObjectiveParams } from "../types";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { EXAM_LESSON, LESSONS, POLIGON_LESSONS } from "../specs";
import { makeTick, tickWithEvents } from "./fixtures";

function parsed(params: Record<string, unknown>): ObjectiveParams {
  return parseObjectiveParams({
    id: "o1",
    titleBg: "Тест",
    kind: "passSignal" as LessonObjective["kind"],
    params,
  });
}

/** Feed a tick sequence to one objective; report the FINAL step's verdict. */
function run(params: ObjectiveParams, ticks: SimTick[]) {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let progress = 0;
  let detail;
  for (const tick of ticks) {
    const r = stepObjective(params, evalState, tick);
    evalState = r.evalState;
    progress = r.progress;
    detail = r.detail;
    if (r.done) done = true;
  }
  return { done, progress, evalState, detail };
}

// ---------------------------------------------------------------------------
// 1. The officer beats the lamp — in BOTH directions (sc-sig-controller-live)
// ---------------------------------------------------------------------------

describe("passSignal / requireRedMet — the controller is the effective signal", () => {
  const gated = parsed({
    nodeId: "sx-n-c",
    x: 0,
    y: 0,
    radiusM: 45,
    control: "trafficLight",
    requireRedMet: true,
  });
  const at = (y: number, speedKmh: number, t: number) =>
    makeTick({ t, position: { x: 0, y }, speedKmh });
  const cross = (t: number, e: Partial<Extract<SimTickEvent, { kind: "stopLineCrossed" }>>) =>
    tickWithEvents(
      t,
      [{ kind: "stopLineCrossed", control: "trafficLight", ...e } as SimTickEvent],
      { position: { x: 0, y: 0 }, speedKmh: 22 },
    );

  /** Stop at the line, then cross — the only variable is who said "go". */
  const waitThenCross = (e: Partial<Extract<SimTickEvent, { kind: "stopLineCrossed" }>>) => [
    at(-40, 30, 1),
    at(-28, 0, 2), // full stop on the approach
    at(-28, 0, 3),
    cross(30, e),
  ];

  it("the ONE act the drill forbids no longer buys the gate: crossing on a green the officer is holding", () => {
    // The shipped `mistake-wait-for-green` drive, frame for frame: the lamp goes
    // green, the регулировчик is chest-on to this approach, the student goes.
    // Before the fix this latched `waitedOutGreen` and the objective ticked in
    // the same second the engine billed CONTROLLER_SIGNAL_VIOLATED.
    const r = run(gated, waitThenCross({ lightState: "green", controller: "halt" }));
    expect(r.done).toBe(false);
    expect(r.progress).toBe(0.5); // crossed, gate unmet — the banner stays open
    expect(r.detail).toMatchObject({ redMetHere: false, redMetVia: null });
  });

  it("…and the ordinary junction is untouched: the same wait, no officer present, still completes", () => {
    const r = run(gated, waitThenCross({ lightState: "green" }));
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ redMetHere: true, redMetVia: "waitedOutGreen" });
  });

  it("…and an officer who PERMITS the green certifies it exactly as before", () => {
    const r = run(gated, waitThenCross({ lightState: "green", controller: "proceed" }));
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ redMetVia: "waitedOutGreen" });
  });

  it("the template's own completion path is intact: red lamp + officer's wave, no stop at all", () => {
    // sc-sig-controller-live's shadow rolls the red line at 22 km/h on the wave.
    const r = run(gated, [at(-40, 25, 1), cross(2, { lightState: "red", controller: "proceed" })]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ redMetVia: "controllerProceed" });
  });
});

// ---------------------------------------------------------------------------
// 2. Б2 is a stop, not a place you drive past (sc-junction-gap/-left/-stop)
// ---------------------------------------------------------------------------

describe("passSignal / control stopSign — the crossing must be one the run stopped for", () => {
  // tj-emerge-v1's authored rung: node radius 45, Б2 line 27.7 m out.
  const b2 = parsed({ nodeId: "tj-n-c", x: 0, y: 0, radiusM: 45, control: "stopSign" });
  const at = (y: number, speedKmh: number, t: number, extra: Partial<SimTick> = {}) =>
    makeTick({ t, position: { x: 4.06, y }, speedKmh, ...extra });
  const crossB2 = (t: number, speedKmh: number) =>
    tickWithEvents(t, [{ kind: "stopLineCrossed", control: "stopSign" }], {
      position: { x: 4.06, y: -27.7 },
      speedKmh,
    });

  it("a rolled Б2 no longer completes the objective that says «след пълно спиране»", () => {
    // The staging wrong-drive: approach at speed, cross at speed, never stop.
    const r = run(b2, [at(-80, 55, 1), at(-50, 62, 2), crossB2(3, 68), at(10, 70, 4)]);
    expect(r.done).toBe(false);
    expect(r.progress).toBe(0); // `crossed` is the whole latch here — see objectives.ts
    expect(r.evalState).toMatchObject({ type: "passSignal", crossed: false });
  });

  it("…and the drive that DOES stop keeps its tick", () => {
    const r = run(b2, [at(-80, 40, 1), at(-30, 0, 2), at(-30, 0, 3), crossB2(4, 12)]);
    expect(r.done).toBe(true);
    expect(r.evalState).toMatchObject({ crossed: true });
  });

  it("a retry after a rolled line completes — the student is refused, never trapped", () => {
    const r = run(b2, [
      at(-80, 55, 1),
      crossB2(2, 60), // rolled it
      at(-60, 20, 3), // came back round
      at(-30, 0, 4), // and did it properly
      at(-30, 0, 5),
      crossB2(6, 10),
    ]);
    expect(r.done).toBe(true);
  });

  it("a stop made PAST the junction cannot buy a crossing already behind the car", () => {
    // The failure mode a plain `crossed && stoppedOnApproach` conjunction would
    // have introduced: the approach memory reaches radius + 60 m, which extends
    // well beyond the box, so braking to a halt after the turn would have
    // certified the line the car rolled.
    const r = run(b2, [
      at(-80, 55, 1),
      crossB2(2, 60),
      at(20, 20, 3),
      at(40, 0, 4), // at rest 40 m past the node — still "on approach"
      at(40, 0, 5),
    ]);
    expect(r.done).toBe(false);
  });

  it("the queue longer than the node radius is credited, not punished", () => {
    // Four cars ahead put his lawful stop outside the r45 circle; the world
    // reports the Б2 line ahead of him, which is the positive evidence the arm
    // demands. Without this arm the tightening would refuse a textbook drive.
    const outside = -60; // 60 m from the node, outside radius 45
    const r = run(b2, [
      at(-90, 30, 1),
      at(outside, 0, 2, {
        nextStopLineControl: "stopSign",
        nextStopLineM: PASS_SIGNAL_QUEUE_REACH_M - 20,
      }),
      at(outside, 0, 3, {
        nextStopLineControl: "stopSign",
        nextStopLineM: PASS_SIGNAL_QUEUE_REACH_M - 20,
      }),
      at(-40, 8, 4),
      crossB2(5, 10),
    ]);
    expect(r.done).toBe(true);
  });

  it("a halt with no Б2 line reported ahead, outside the circle, certifies nothing", () => {
    const r = run(b2, [at(-90, 30, 1), at(-60, 0, 2), at(-60, 0, 3), crossB2(4, 40)]);
    expect(r.done).toBe(false);
  });

  it("a trafficLight rung is untouched: crossing on green with no stop still completes", () => {
    const lamp = parsed({ nodeId: "n1", x: 0, y: 0, radiusM: 30, control: "trafficLight" });
    const r = run(lamp, [
      tickWithEvents(1, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "green" }], {
        position: { x: 0, y: 0 },
        speedKmh: 45,
      }),
    ]);
    expect(r.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. The catalogue invariant — every shipped Б2 rung, driven both ways
// ---------------------------------------------------------------------------

describe("every shipped stopSign rung answers to the stop its title promises", () => {
  interface Row {
    specId: string;
    objectiveId: string;
    titleBg: string;
    params: ObjectiveParams;
    x: number;
    y: number;
  }

  const rows: Row[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const o of spec.success) {
      const p = o.params as { kind?: string; control?: string; x?: number; y?: number };
      if (p.kind !== "passSignal" || p.control !== "stopSign") continue;
      rows.push({
        specId: spec.id,
        objectiveId: o.id,
        titleBg: o.titleBg,
        // A ScenarioObjective carries its kind INSIDE params (compile.ts lifts
        // it); LessonObjective carries it alongside. Same data, one hop.
        params: parseObjectiveParams({
          id: o.id,
          titleBg: o.titleBg,
          kind: "passSignal",
          params: o.params as unknown as Record<string, unknown>,
        }),
        x: p.x ?? 0,
        y: p.y ?? 0,
      });
    }
  }
  // Every PLAYABLE spec, not just the curriculum: `lessonById` resolves the
  // полигон entries and the exam too, and the exam's own Б2 rung («…спри
  // напълно») is the loudest claim of the six.
  for (const lesson of [...LESSONS, ...POLIGON_LESSONS, EXAM_LESSON]) {
    for (const o of lesson.objectives) {
      const p = o.params as { control?: string; x?: number; y?: number };
      if (o.kind !== "passSignal" || p.control !== "stopSign") continue;
      rows.push({
        specId: lesson.id,
        objectiveId: o.id,
        titleBg: o.titleBg,
        params: parseObjectiveParams(o),
        x: p.x ?? 0,
        y: p.y ?? 0,
      });
    }
  }

  it("the sweep's census is intact (a new Б2 rung must be driven by this file too)", () => {
    expect(rows.map((r) => `${r.specId}/${r.objectiveId}`).sort()).toEqual([
      "l2-intersections/l2-stop-sign",
      "lex-exam-1/ex-stop-b2",
      "sc-junction-gap/sc-jgap-line",
      "sc-junction-left/sc-jleft-line",
      "sc-junction-scan/sc-jscan-line",
      "sc-junction-stop/sc-jstop-line",
    ]);
  });

  for (const row of rows) {
    it(`${row.specId}/${row.objectiveId} — rolled: refused · stopped: credited`, () => {
      const near = (dy: number, speedKmh: number, t: number) =>
        makeTick({ t, position: { x: row.x, y: row.y + dy }, speedKmh });
      const cross = (t: number, speedKmh: number) =>
        tickWithEvents(t, [{ kind: "stopLineCrossed", control: "stopSign" }], {
          position: { x: row.x, y: row.y },
          speedKmh,
        });

      const rolled = run(row.params, [near(-20, 50, 1), cross(2, 55)]);
      expect(rolled.done).toBe(false);

      const stopped = run(row.params, [near(-20, 20, 1), near(-8, 0, 2), near(-8, 0, 3), cross(4, 9)]);
      expect(stopped.done).toBe(true);
    });
  }
});
