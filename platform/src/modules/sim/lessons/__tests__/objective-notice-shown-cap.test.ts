/**
 * ONE TASK, ONE NUMBER — the НАУЧИ card that contradicted the toast above it.
 *
 * THE FRAME. `.audit-frames/w10-1/frames/sc-ac-crosswind__pc-right/04-t084s.png`:
 * instruction 3 reads «тук около 34 км/ч, таванът е 40», the objective toast in
 * the same 200 px band reads «дръж под 40 км/ч», the cockpit strip on the mobile
 * leg reads «задачата иска ≤40» — and the coach card fires «Задачата иска да си
 * тук с не повече от 45 км/ч». Four surfaces, one waypoint, two numbers; and the
 * odd one out is the GRADER'S, so the student who obeyed the figure he was told
 * to obey read a card telling him a different one.
 *
 * WHERE THE 45 CAME FROM. `sc-acx-open` authors 40. The L1 rung is tolerance
 * 1.5 and `scenario/params.ts widenSpeedCap` folds
 * SPEED_CAP_GRACE_KMH_PER_TOLERANCE × 0.5 = 5 km/h into the compiled
 * `maxSpeedKmh`, bounded by the posted 50. Three of the four surfaces already
 * spoke the author's figure — they read `advisor.ts advisorPromptForObjective`,
 * directly or by parsing its sentence back out (`LessonPlayShell
 * taskCapKmhFromPrompt`) — and `lessons/engine.ts objectiveNotice` was the one
 * surface still printing the compiled number raw.
 *
 * THE SIBLING, so this is a class and not an anecdote: `sc-acs-approach`
 * (sc-ac-snow) authors 25 and compiles to 30 on the same arithmetic, and its own
 * row was closed twice on «the three LABELS were reconciled» and overturned
 * twice because the fourth surface was not.
 *
 * WHAT THIS FILE PINS, and why the third one is the one that matters: the
 * behaviour on a driven session, the fallback for lessons that never went
 * through `scenario/compile.ts`, and THE GENERAL FORM over the whole catalogue —
 * every capped card in the product, not the two the frames happened to catch.
 * A rule with one enforced instance is a convention.
 */

import { describe, expect, it } from "vitest";
import type { HudEvent, LessonObjective, LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { advisorPromptForObjective, shownObjectiveCapKmh } from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import { AUTHORED_MAX_SPEED_PARAM_KEY, compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import { makeTick } from "./fixtures";

const NOTICE_TITLE = "Стигна точката, но твърде бързо";

/** Mirrors REACH_ZONE_HALT_CAP_KMH / ADVISOR_HALT_CAP_KMH — stated locally so
 *  this file names the band it reasons about rather than inheriting it. */
const HALT_CAP_KMH = 8;

const KMH = (s: string) =>
  [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*км\/ч/g)].map((m) => Number(m[1].replace(",", ".")));

/** One compiled objective, with the lesson it was compiled into. */
function objectiveOf(
  scenarioId: string,
  objectiveId: string,
  level: ScenarioLevel = 1,
): { lesson: LessonSpec; o: LessonObjective } {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === scenarioId);
  if (spec === undefined) throw new Error(`no such template: ${scenarioId}`);
  const lesson = compileScenario(spec, level);
  const o = lesson.objectives.find((x) => x.id === objectiveId);
  if (o === undefined) throw new Error(`no such objective: ${scenarioId}/${objectiveId}`);
  return { lesson, o };
}

/**
 * A DRIVABLE ROUTE CARRYING A REAL CATALOGUE OBJECTIVE'S NUMBERS.
 *
 * The compiled scenario's own waypoint sits hundreds of metres down an authored
 * street; driving to it here would be a world test, not an engine one. So the
 * three numbers that decide this card — the compiled gate, the author's figure
 * and the street's posted limit — are lifted OFF the catalogue and grafted onto
 * a straight route north of the spawn. If a template re-authors its cap the
 * numbers move with it and this test keeps measuring the product rather than a
 * copy of it.
 */
function routeCarrying(scenarioId: string, objectiveId: string): {
  lesson: LessonSpec;
  cap: number;
  authored: number;
} {
  const { lesson: compiled, o } = objectiveOf(scenarioId, objectiveId);
  const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
  const authored = o.params[AUTHORED_MAX_SPEED_PARAM_KEY];
  if (typeof cap !== "number" || typeof authored !== "number") {
    throw new Error(`${scenarioId}/${objectiveId} is not a capped compiled reachZone`);
  }
  const lesson: LessonSpec = {
    id: `t-shown-cap-${objectiveId}`,
    order: 99,
    titleBg: "Тестов маршрут",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    postedLimitKmh: compiled.postedLimitKmh,
    objectives: [
      {
        id: objectiveId,
        titleBg: o.titleBg,
        kind: "reachZone",
        params: { x: 0, y: 100, radiusM: 6, maxSpeedKmh: cap, [AUTHORED_MAX_SPEED_PARAM_KEY]: authored },
      },
      {
        id: "t-finish",
        titleBg: "Спри в края на маршрута",
        kind: "reachZone",
        params: { x: 0, y: 300, radiusM: 15 },
      },
    ],
  };
  return { lesson, cap, authored };
}

/** Drive straight north through the capped zone, comfortably over the gate. */
function driveOverTheCap(lesson: LessonSpec, speedKmh: number): HudEvent[] {
  let s = createLessonSession(lesson);
  const hud: HudEvent[] = [];
  const ticks: SimTick[] = [];
  for (let y = 0; y <= 140; y++) {
    ticks.push(makeTick({ t: y, speedKmh, position: { x: 0, y }, maxSpeedKmh: 50 }));
  }
  for (const tick of ticks) {
    const r = applyTick(s, tick);
    s = r.state;
    hud.push(...r.hudEvents);
  }
  return hud;
}

function noticeText(hud: HudEvent[]): string {
  const card = hud.find(
    (e): e is Extract<HudEvent, { kind: "lesson" }> =>
      e.kind === "lesson" && e.titleBg === NOTICE_TITLE,
  );
  if (card === undefined) throw new Error("the over-cap card never fired");
  return card.explanationBg;
}

// ---------------------------------------------------------------------------
// 0. THE DEFECT IS REAL IN THE SHIPPED CATALOGUE, before anything is asserted
//    about the repair
// ---------------------------------------------------------------------------

describe("the split this file closes exists in the product", () => {
  it("the two photographed lessons compile a gate above the figure they show", () => {
    // Read off the catalogue, not typed in: if a template re-authors its cap
    // these move, and the assertion below still describes the same defect.
    const crosswind = objectiveOf("sc-ac-crosswind", "sc-acx-open");
    const snow = objectiveOf("sc-ac-snow", "sc-acs-approach");
    for (const { lesson, o } of [crosswind, snow]) {
      const cap = (o.params as { maxSpeedKmh: number }).maxSpeedKmh;
      const authored = o.params[AUTHORED_MAX_SPEED_PARAM_KEY] as number;
      expect(authored).toBeLessThan(cap);
      // And the figure the world shows is the AUTHORED one — this is what the
      // toast, the gate bar and the cockpit strip all read.
      expect(
        shownObjectiveCapKmh(o, cap, lesson.postedLimitKmh),
      ).toBe(authored);
    }
  });

  it("it is a class, not two lessons: many compiled rungs grade above what they say", () => {
    let split = 0;
    let capped = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (cap === undefined || cap <= HALT_CAP_KMH) continue;
          capped += 1;
          if (shownObjectiveCapKmh(o, cap, lesson.postedLimitKmh) < cap) split += 1;
        }
      }
    }
    // Measured 2026-08-24 on this tree: 953 capped reachZone gates, 644 of them
    // above the halt band, of which 329 are graded on a looser number than the
    // one the student is shown — this card's old figure, 329 times over. The
    // floors are deliberately far below those figures — this assertion exists to
    // fail if the class ever becomes EMPTY (which would mean the sweep is
    // measuring nothing), not to pin a census that authoring will move.
    expect(capped).toBeGreaterThan(200);
    expect(split).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// 1. THE CARD ON A DRIVEN SESSION
// ---------------------------------------------------------------------------

describe("the over-cap coach card says the number the world showed", () => {
  it("sc-ac-crosswind: the card names the authored cap, never the rung's grace", () => {
    const { lesson, cap, authored } = routeCarrying("sc-ac-crosswind", "sc-acx-open");
    const text = noticeText(driveOverTheCap(lesson, 59));
    // The frame's own numbers: the card said 45 beside a toast saying 40.
    expect(text).toContain(`не повече от ${authored} км/ч`);
    expect(text).not.toContain(`${cap} км/ч`);
    // And the measured speed is still reported — THEO-4 wants both figures and
    // the corrective, never a bare refusal.
    expect(text).toContain("59 км/ч");
    expect(text).toContain("Намали");
  });

  it("sc-ac-snow: the sibling row, on the same arithmetic", () => {
    const { lesson, cap, authored } = routeCarrying("sc-ac-snow", "sc-acs-approach");
    const text = noticeText(driveOverTheCap(lesson, 44));
    expect(text).toContain(`не повече от ${authored} км/ч`);
    expect(text).not.toContain(`${cap} км/ч`);
  });

  it("a lesson that never went through the scenario compiler is untouched", () => {
    // Curriculum specs, the exam bank and hand-built doubles carry no authored
    // key because no rung was ever applied — there `maxSpeedKmh` IS the author's
    // own figure, and the card must go on printing it. This is the case
    // route-finish.test.ts's `t-route-capped` drives; if this goes red the
    // fallback has started inventing numbers.
    const lesson: LessonSpec = {
      id: "t-shown-cap-uncompiled",
      order: 99,
      titleBg: "Тестов маршрут",
      descriptionBg: "тест",
      conceptIds: [],
      spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
      preDrive: false,
      objectives: [
        {
          id: "t-slow",
          titleBg: "Мини бавно през стеснението",
          kind: "reachZone",
          params: { x: 0, y: 100, radiusM: 6, maxSpeedKmh: 20 },
        },
        { id: "t-finish", titleBg: "Спри в края", kind: "reachZone", params: { x: 0, y: 300, radiusM: 15 } },
      ],
    };
    expect(noticeText(driveOverTheCap(lesson, 34))).toContain("не повече от 20 км/ч");
  });
});

// ---------------------------------------------------------------------------
// 2. THE GENERAL FORM — every capped card in the catalogue, not the two above
// ---------------------------------------------------------------------------

describe("across the whole catalogue the coach card and the advisor speak one number", () => {
  it("the card's figure is the advisor's figure wherever the advisor speaks one", () => {
    const divergent: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (cap === undefined) continue;
          const authored = o.params[AUTHORED_MAX_SPEED_PARAM_KEY];
          const textBg = advisorPromptForObjective(
            o.titleBg,
            { kind: "reachZone", ...(o.params as object) } as never,
            undefined,
            lesson.postedLimitKmh,
            typeof authored === "number" ? authored : undefined,
          ).textBg;
          if (!textBg.includes("дръж под")) continue;
          const spoken = KMH(textBg).at(-1);
          const shown = shownObjectiveCapKmh(o, cap, lesson.postedLimitKmh);
          if (spoken !== shown) divergent.push(`${lesson.id}/${o.id}: card ${shown} vs toast ${spoken}`);
        }
      }
    }
    expect(divergent).toEqual([]);
  });

  it("the card can only ever be STRICTER than the gate, never looser", () => {
    // The half that must not be dropped, and the reason this repair is allowed
    // to ship at all: a card naming a number ABOVE the gate would coach a
    // student straight into failing the task he is being coached through. The
    // `Math.min` at the end of `spokenCapKmh` is what holds it.
    const looser: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (cap === undefined) continue;
          const shown = shownObjectiveCapKmh(o, cap, lesson.postedLimitKmh);
          if (shown > cap) looser.push(`${lesson.id}/${o.id}: ${shown} > ${cap}`);
        }
      }
    }
    expect(looser).toEqual([]);
  });
});
