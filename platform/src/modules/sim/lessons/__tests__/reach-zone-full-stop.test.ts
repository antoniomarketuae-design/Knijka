/**
 * «СПРИ НАПЪЛНО» MEANS THE STOP THE LAW MEANS — `requireFullStop`, the eighth
 * ReachZoneWitnessDemand (objectives.ts, 2026-09-03).
 *
 * THE PROTOCOL THIS FILE IS CUT FROM (sc-merge-from-property:ab353b86;
 * `.audit-frames/w24/frames/sc-merge-from-property__mobile-right/run.log`,
 * target HEAD 15c4b29, 37 frames, 0 LOST, ended naturally, EVIDENCE complete).
 * One sheet, two channels, opposite verdicts:
 *
 *   Задачи от маршрута  ✓ Спри пред тротоара и пропусни пешеходеца  0:46
 *                       ✓ СПРИ НАПЪЛНО НА Б2 НА ИЗХОДА             1:16
 *   Грешки (3)          ✗ НЕСПИРАНЕ НА ЗНАК Б2 „СПРИ!" −10 изпитни т.
 *                         ОПАСНА ГРЕШКА
 *   Похвали (1)         ★ Правилно пропускане на пешеходец
 *                       — and no `FULL_STOP_AT_STOP_SIGN` beside it.
 *
 * The route task certified the full stop the rule engine had just billed him
 * ten points for not making, and the tick is the half printed on the glass
 * while he is still driving. Its frames carry the shape: `04-t050s` 3 км/ч,
 * `04-t055s` 1 км/ч with the praise card up, `04-t061s` 11, `04-t066s` 22 with
 * the −10 card up.
 *
 * NEITHER A NUMBER NOR A LEDGER COULD CLOSE IT, and §4 is where that is
 * measured rather than argued. A cap states a speed and cannot state the
 * dwell (`fullStopMinDurationSec`) or the recency (`stopRecencySec`) the law
 * also demands; and the certificate on a stop-line gate is granted at the
 * disc's LEADING EDGE, metres before the paint, so the bill always lands after
 * the tick and no after-the-fact read could withdraw it. The demand therefore
 * asks the rule engine, on the frame the tick would be granted, the same
 * question the line itself will be judged by.
 *
 * §1 is the dead-predicate check: `serializeObjectiveParams` is a WHITELIST and
 * a term it does not name never reaches the session the student plays. §4
 * drives `applyTick` — the entry point `LessonPlayShell.tsx` itself calls —
 * with a real `stopLineCrossed` tick event, so `rules/engine.ts` decides the
 * bill and the commendation for itself; nothing downstream of the grader that
 * owns the duty is fabricated.
 *
 * THE MUTATION THAT MUST TURN THESE RED: drop the `stopOk` conjunct in
 * `stepReachZone`, the `qualifyingStopCurrent` forwarding in
 * `lessons/engine.ts`, or the whitelist line in `scenario/params.ts`, and every
 * „REFUSED" row below goes green.
 */

import { describe, expect, it } from "vitest";
import type { LessonObjective, LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import {
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
  type WitnessedReachZoneParams,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState, ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

const MFP = "sc-merge-from-property";
const STOP_GATE = "sc-mfp-stop-line";
/** mg-property-v1: the outbound exit-lane centre; the derived Б2 is at x 27.73. */
const EXIT_Y = 4.06;

/** The shipped objective, read out of the catalogue rather than copied. */
function shipped(specId: string, objectiveId: string): LessonObjective {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === specId);
  if (spec === undefined) throw new Error(`no template ${specId}`);
  const o = spec.success.find((x) => x.id === objectiveId);
  if (o === undefined) throw new Error(`no objective ${objectiveId} on ${specId}`);
  return {
    id: o.id,
    titleBg: o.titleBg,
    kind: "reachZone",
    params: o.params as unknown as Record<string, unknown>,
  };
}

function parsed(titleBg: string, params: Record<string, unknown>): WitnessedReachZoneParams {
  const objective: LessonObjective = { id: "o1", titleBg, kind: "reachZone", params };
  return parseObjectiveParams(objective) as WitnessedReachZoneParams;
}

// ---------------------------------------------------------------------------
// 1 · THE WHITELIST — the term has to survive compileScenario or it is dead
// ---------------------------------------------------------------------------

describe("the demand reaches the compiled lesson the student actually plays", () => {
  it("survives every rung of the ladder on sc-mfp-stop-line", () => {
    // `serializeObjectiveParams` silently drops anything its switch does not
    // name (scenario/params.ts). `requireRailClear` was authored, parsed, read
    // and template-gated and STILL never reached a session for exactly this
    // reason — so what is asserted here is the COMPILED artefact, at every
    // rung, not the template it came from.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === MFP)!;
    for (const level of [1, 2, 3, 4, 5] as const) {
      const compiled = compileScenario(spec, level);
      const gate = compiled.objectives.find((o) => o.id === STOP_GATE)!;
      expect(gate.params.requireFullStop, `L${level}`).toBe(true);
      // …and it parses on the compiled rung, which is the object the session
      // actually evaluates.
      expect(
        (parseObjectiveParams(gate) as WitnessedReachZoneParams).requireFullStop,
        `L${level} parsed`,
      ).toBe(true);
    }
  });

  it("no other gate in the catalogue acquires it by accident", () => {
    // AUTHORED ONLY — there is no title matcher, deliberately: «спри» opens
    // dozens of banners and most of them mean „stop short of something", not
    // the ЗДвП чл. 50 standstill. A derivation added later shows up here.
    const armed: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const o of spec.success) {
        const p = o.params as unknown as Record<string, unknown>;
        if (p.requireFullStop === true) armed.push(`${spec.id}/${o.id}`);
      }
    }
    expect(armed).toEqual([`${MFP}/${STOP_GATE}`]);
  });
});

// ---------------------------------------------------------------------------
// 2 · THE PARSE — the only accepted value is the one that means something
// ---------------------------------------------------------------------------

describe("requireFullStop parses as a claim, not as a number", () => {
  it("carries an authored true onto the parsed params", () => {
    const p = parsed("Спри напълно на Б2", {
      x: 29,
      y: EXIT_Y,
      radiusM: 3,
      maxSpeedKmh: 3,
      requireFullStop: true,
    });
    expect(p.requireFullStop).toBe(true);
  });

  it("refuses anything else at the parse rather than at a student", () => {
    for (const bad of [false, 1, "true", null]) {
      expect(() =>
        parsed("Спри напълно на Б2", { x: 29, y: EXIT_Y, radiusM: 3, requireFullStop: bad }),
      ).toThrow(/requireFullStop/);
    }
  });

  it("a gate that does not author it is bit-identical to shipped", () => {
    const p = parsed("Стигни края на отсечката", { x: 29, y: EXIT_Y, radiusM: 3 });
    expect(p.requireFullStop).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3 · THE EVALUATOR — both directions, and „unknown" is never a refusal
// ---------------------------------------------------------------------------

/** Creep west down the exit lane at `speedKmh`, through the Б2 at x 27.73. */
function creepToTheLine(speedKmh: number): SimTick[] {
  const ticks: SimTick[] = [];
  let t = 0;
  for (let x = 36; x >= 26; x -= 0.5) {
    ticks.push(makeTick({ t, speedKmh, maxSpeedKmh: 20, position: { x, y: EXIT_Y } }));
    t += 0.5;
  }
  return ticks;
}

function run(params: ObjectiveParams, ticks: SimTick[], ctx: ObjectiveContext): boolean {
  let evalState: ObjectiveEvalState = createEvalState(params);
  for (const tick of ticks) {
    const r = stepObjective(params, evalState, tick, ctx);
    evalState = r.evalState;
    if (r.done) return true;
  }
  return false;
}

describe("«Спри напълно на Б2 на изхода» is refused on the drive that never stood still", () => {
  const gate = parseObjectiveParams(shipped(MFP, STOP_GATE));
  const base: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0 };
  // 2.5 км/ч is under the gate's own 3 cap and over the engine's 1 — the exact
  // band the contradicting sheet was printed from.
  const roll = creepToTheLine(2.5);

  it("REFUSED: no qualifying stop on any frame, no certificate", () => {
    expect(run(gate, roll, { ...base, qualifyingStopCurrent: false })).toBe(false);
  });

  it("GRANTED: the engine says a full stop is current, and the tick arrives", () => {
    expect(run(gate, roll, { ...base, qualifyingStopCurrent: true })).toBe(true);
  });

  it("UNKNOWN IS NEVER A REFUSAL — a context that cannot answer keeps the old tick", () => {
    expect(run(gate, roll, base)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 · ENGINE-LEVEL — the live path, with the rule engine judging for itself
// ---------------------------------------------------------------------------

/**
 * ALL FOUR shipped gates of the exit, on a spec that skips the pre-drive
 * choreography so the tick stream is the only variable. Titles and params come
 * out of `SCENARIO_TEMPLATES`, so a retitle in `templates-merging.ts` reaches
 * this test rather than passing it by.
 *
 * The merge and finish gates are 40 and 118 m up the boulevard and this drive
 * never turns, so they stay open — which is the point: the session must still
 * be LIVE when the car reaches the paint, or the crossing is never graded and
 * the commendation half of §4 would be testing the reducer's exit condition
 * instead of the repair.
 */
function exitLesson(): LessonSpec {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === MFP)!;
  return {
    id: "t-full-stop-mfp",
    order: 99,
    titleBg: "Тест — Б2 на изхода от имот",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 44, y: EXIT_Y }, headingDeg: 270 },
    preDrive: false,
    objectives: spec.success.map((o) => shipped(MFP, o.id)),
  };
}

/**
 * The measured approach, reproduced through the real reducer. The car creeps
 * west down the exit lane at 2.5 км/ч — inside the gate's 3 cap, outside the
 * engine's 1 — and, when `haltAtX` is given, stands still there long enough to
 * satisfy `fullStopMinDurationSec`. It reports the runtime's own
 * `stopLineCrossed{control:"stopSign"}` on the frame it passes the derived Б2
 * at x 27.73, so `rules/engine.ts` picks FULL_STOP_AT_STOP_SIGN or
 * STOP_SIGN_NO_FULL_STOP itself.
 */
function driveTheExit(haltAtX: number | null): LessonSessionState {
  let s = createLessonSession(exitLesson());
  let t = 0;
  const push = (x: number, speedKmh: number, crossed: boolean): void => {
    const tick = makeTick({
      t,
      speedKmh,
      maxSpeedKmh: 20,
      position: { x, y: EXIT_Y },
      headingDeg: 270,
      ...(crossed
        ? { events: [{ kind: "stopLineCrossed" as const, control: "stopSign" as const }] }
        : {}),
    });
    s = applyTick(s, tick).state;
    t += 0.5;
  };
  for (let x = 44; x >= 20; x -= 0.5) {
    // Cross the paint exactly once, on the frame the car passes x 27.73.
    push(x, 2.5, x <= 27.73 && x > 27.23);
    if (haltAtX !== null && Math.abs(x - haltAtX) < 0.25) {
      // Four frames at rest: two seconds, well over `fullStopMinDurationSec`
      // and well inside `stopRecencySec` of the paint two metres ahead.
      for (let i = 0; i < 4; i++) push(x, 0, false);
    }
  }
  return s;
}

describe("the live path: applyTick stops issuing the certificate the sheet contradicts", () => {
  it("CLEAN: the drive that actually stood still keeps both ticks and is commended", () => {
    const s = driveTheExit(29.5);
    const r = buildLessonResult(s);
    expect(
      s.events.some((e) => e.kind === "commendation" && e.code === "FULL_STOP_AT_STOP_SIGN"),
    ).toBe(true);
    expect(s.events.some((e) => e.kind === "violation")).toBe(false);
    // The two gates this drive can reach; the merge and finish gates are up the
    // boulevard and this stream never turns.
    expect(r.objectives.map((o) => o.done)).toEqual([true, true, false, false]);
  });

  it("REFUSED: the 2.5 км/ч roll is billed AND loses the tick it used to keep", () => {
    const s = driveTheExit(null);
    const r = buildLessonResult(s);
    // The bill is the rule engine's own, out of the real Б2 branch.
    expect(r.summary.mistakes.some((m) => m.code === "STOP_SIGN_NO_FULL_STOP")).toBe(true);
    // The тротоар gate is untouched — this demand withdraws only what it claims.
    expect(r.objectives[0].done).toBe(true);
    // …and the sentence the finding quoted stops being printable: the protocol
    // can no longer certify «Спри напълно на Б2» on a drive it fines for not.
    expect(r.objectives[1].done).toBe(false);
    expect(r.completedAll).toBe(false);
  });

  it("the withheld gate is not the terminal one, so no drive is stranded by it", () => {
    // sc-mfp-stop-line is 2 of 4 on the shipped drill, so this refusal can
    // never leave a student unable to reach the protocol the way a finish gate
    // would (the `yieldFailedVoidsObjective` lesson, lessons/engine.ts).
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === MFP)!;
    expect(spec.success.map((o) => o.id).indexOf(STOP_GATE)).toBe(1);
    expect(spec.success.length).toBe(4);
  });
});
