/**
 * THE SPEED CONTRACT'S LOWER EDGE — sc-ac-night-overdrive:b9d61410 (critical).
 *
 * THE FRAME. `.audit-frames/sweep161/sc-ac-night-overdrive/pc-right/
 * 08-debrief.png`: «✓ Мини неосветения участък със съобразена за видимостта
 * скорост 2:45» on a drive that never exceeded 15 км/ч. A gate named for a
 * speed CHOSEN FOR THE VISIBILITY, ticked at walking pace — and it is the only
 * objective the right run ever earns, so the whole lesson's certificate rested
 * on a test a stationary car passes.
 *
 * THE MECHANISM. `maxSpeedKmh` entered `stepReachZone` as `speedKmh <= cap` and
 * nothing else. A ceiling is satisfied downwards without limit: 0 км/ч cleared
 * this gate exactly as completely as the taught 50 did. The 58 → 50 tightening
 * recorded in `templates-conditions2.ts` moved that ceiling DOWN, which is
 * harder for a fast car and no answer whatever to a slow one.
 *
 * WHAT THIS FILE PINS, in the order that decides whether the repair is real:
 *  §1 the crawl the frame photographed is REFUSED, at every rung;
 *  §2 the taught speed still EARNS it, at every rung — the false-refusal half,
 *     which is the failure this project ranks worst;
 *  §3 the student is TOLD, on both surfaces, before and at the refusal
 *     (THEO-4: never a bare verdict, and never an unannounced number);
 *  §4 the anti-trap: a crawl that picks the pace up ON the mark re-earns it;
 *  §5 nothing else in the catalogue moved.
 */

import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import { advisorPromptForObjective } from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import {
  REACH_ZONE_CAP_SLACK_KMH,
  createEvalState,
  parseObjectiveParams,
  stepObjective,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

const LESSON_ID = "sc-ac-night-overdrive";
const GATE_ID = "sc-acno-adapted";
const RUNGS: ScenarioLevel[] = [1, 2, 3, 4, 5];
/** The speed the audited drive never exceeded. */
const THE_CRAWL_KMH = 15;
/** What the committed shadow actually rides across the disc. */
const THE_TAUGHT_KMH = 50;
const SLOW_CARD_TITLE = "Мина точката твърде бавно";

const spec = (id: string) => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === id);
  if (s === undefined) throw new Error(`no such template: ${id}`);
  return s;
};

/** The gate as the student's own session parses it, at one rung. */
function gateAt(level: ScenarioLevel): {
  params: ObjectiveParams & { x: number; y: number; radiusM: number };
  cap: number;
  floor: number;
  titleBg: string;
  postedLimitKmh: number | undefined;
} {
  const lesson = compileScenario(spec(LESSON_ID), level);
  const o = lesson.objectives.find((x) => x.id === GATE_ID);
  if (o === undefined) throw new Error(`no ${GATE_ID} at L${level}`);
  const params = parseObjectiveParams(o) as ObjectiveParams & {
    x: number;
    y: number;
    radiusM: number;
    maxSpeedKmh?: number;
    minSpeedKmh?: number;
  };
  if (params.maxSpeedKmh === undefined || params.minSpeedKmh === undefined) {
    throw new Error(`L${level}: the gate lost an edge of its speed band`);
  }
  return {
    params,
    cap: params.maxSpeedKmh,
    floor: params.minSpeedKmh,
    titleBg: o.titleBg,
    postedLimitKmh: lesson.postedLimitKmh,
  };
}

/**
 * Drive the lane straight through the disc at one steady speed and report
 * whether the gate ticked — the same read `lessons/engine.ts` performs (it
 * never re-steps a completed objective).
 *
 * Sampled every 0.5 s, the tick rate the product actually runs at, so the
 * approach really is measured rather than teleported over.
 */
function transitAt(level: ScenarioLevel, speedKmh: number): boolean {
  const { params } = gateAt(level);
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  const perTickM = (speedKmh / 3.6) * 0.5;
  for (let i = 0; i < 400 && !done; i++) {
    const y = params.y - 80 + i * Math.max(perTickM, 0.25);
    if (y > params.y + 80) break;
    const r = stepObjective(
      params,
      evalState,
      makeTick({ t: i * 0.5, speedKmh, position: { x: params.x, y }, maxSpeedKmh: 90 }),
    );
    evalState = r.evalState;
    done = r.done;
  }
  return done;
}

// ---------------------------------------------------------------------------
// §1 — THE CRAWL IS REFUSED
// ---------------------------------------------------------------------------

describe("§1 the drive the frame photographed no longer earns the gate", () => {
  it("the band is authored on the shipped gate, both edges, at every rung", () => {
    for (const level of RUNGS) {
      const { cap, floor } = gateAt(level);
      expect(floor, `L${level} floor`).toBe(35);
      // The ladder lifts the CEILING and leaves the floor alone, so the band is
      // widest for the beginner — the direction an aid is allowed to move in.
      expect(cap, `L${level} cap`).toBeGreaterThanOrEqual(THE_TAUGHT_KMH);
      expect(cap - floor, `L${level} band`).toBeGreaterThanOrEqual(REACH_ZONE_CAP_SLACK_KMH);
    }
    expect(gateAt(1).cap).toBeGreaterThan(gateAt(5).cap);
  });

  it("15 км/ч — the audited drive — is refused at every rung", () => {
    for (const level of RUNGS) {
      expect(transitAt(level, THE_CRAWL_KMH), `L${level} @ ${THE_CRAWL_KMH} км/ч`).toBe(false);
    }
  });

  it("…and so is the standing car the ceiling alone credited", () => {
    for (const level of RUNGS) {
      expect(transitAt(level, 3), `L${level} @ 3 км/ч`).toBe(false);
    }
  });

  it("THE COUNTER-PROOF — the ceiling alone still credits both, which is the defect", () => {
    // The gate with its floor stripped is the shipped evaluator of sweep161.
    // If this ever goes green the repair has stopped being a repair and the
    // §1 assertions above would be passing for some other reason.
    const { params } = gateAt(3);
    const ceilingOnly = parseObjectiveParams({
      id: GATE_ID,
      titleBg: gateAt(3).titleBg,
      kind: "reachZone",
      params: {
        x: params.x,
        y: params.y,
        radiusM: params.radiusM,
        maxSpeedKmh: gateAt(3).cap,
      },
    }) as ObjectiveParams & { x: number; y: number };
    const crawlPast = (p: ObjectiveParams & { x: number; y: number }): boolean => {
      let st: ObjectiveEvalState = createEvalState(p);
      let done = false;
      for (let i = 0; i < 200 && !done; i++) {
        const r = stepObjective(
          p,
          st,
          makeTick({
            t: i * 0.5,
            speedKmh: THE_CRAWL_KMH,
            position: { x: params.x, y: params.y - 40 + i * 2.08 },
            maxSpeedKmh: 90,
          }),
        );
        st = r.evalState;
        done = r.done;
      }
      return done;
    };
    expect(crawlPast(ceilingOnly), "a ceiling is satisfied downwards without limit").toBe(true);
    expect(crawlPast(params as ObjectiveParams & { x: number; y: number })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §2 — AND THE HONEST DRIVE IS NOT REFUSED
//
// A false refusal and a false certificate are the same crime pointing opposite
// ways, and this half is the one the founder has actually been burned by. The
// committed shadow's own replay through the whole production pipeline lives in
// `scenario/__tests__/lane-world-claims.test.ts` §6; this is the evaluator-level
// band check that says WHERE the margin is.
// ---------------------------------------------------------------------------

describe("§2 the speed the lesson teaches still earns it", () => {
  it("the taught 50 км/ч ticks at every rung", () => {
    for (const level of RUNGS) {
      expect(transitAt(level, THE_TAUGHT_KMH), `L${level} @ ${THE_TAUGHT_KMH} км/ч`).toBe(true);
    }
  });

  it("the briefing's own order sits inside the band, with room on both sides", () => {
    // Step 2 orders «стабилизирай около 50 км/ч» — asserted rather than
    // remembered, because if that sentence changes the number 35 is arbitrary.
    const ordered = spec(LESSON_ID).instructionsBg.some((i) =>
      /стабилизирай около 50 км\/ч/u.test(i.textBg),
    );
    expect(ordered).toBe(true);
    for (const level of RUNGS) {
      const { cap, floor } = gateAt(level);
      expect(THE_TAUGHT_KMH, `L${level} floor margin`).toBeGreaterThan(floor);
      expect(THE_TAUGHT_KMH, `L${level} cap margin`).toBeLessThanOrEqual(cap);
    }
  });

  it("a driver who wobbles a few км/ч under the floor keeps the tick", () => {
    // EARNED WIDE, SPENT NARROW. The floor mirrors the ceiling's dead band, so
    // the same speedometer/physics wobble the cap forgives above is forgiven
    // below: 32 км/ч after honouring the band is not a refusal.
    const { params, floor } = gateAt(3);
    let st: ObjectiveEvalState = createEvalState(params);
    let done = false;
    const path: [number, number][] = [
      [params.y - 30, 48],
      [params.y - 20, 46],
      [params.y - 10, 44],
      [params.y - 2, floor + 1],
      [params.y + 2, floor - (REACH_ZONE_CAP_SLACK_KMH - 2)],
    ];
    path.forEach(([y, v], i) => {
      const r = stepObjective(
        params,
        st,
        makeTick({ t: i * 0.5, speedKmh: v, position: { x: params.x, y }, maxSpeedKmh: 90 }),
      );
      st = r.evalState;
      done = done || r.done;
    });
    expect(done).toBe(true);
  });

  it("a band narrower than the wobble is refused at the PARSE, not at the student", () => {
    expect(() =>
      parseObjectiveParams({
        id: "x",
        titleBg: "т",
        kind: "reachZone",
        params: { x: 0, y: 10, radiusM: 5, maxSpeedKmh: 40, minSpeedKmh: 37 },
      }),
    ).toThrow(/minSpeedKmh/u);
    expect(() =>
      parseObjectiveParams({
        id: "x",
        titleBg: "т",
        kind: "reachZone",
        params: { x: 0, y: 10, radiusM: 5, maxSpeedKmh: 40, minSpeedKmh: 0 },
      }),
    ).toThrow(/minSpeedKmh/u);
  });
});

// ---------------------------------------------------------------------------
// §3 — THE STUDENT IS TOLD (doc 64 THEO-4)
//
// A refusal nobody explains is the bare verdict this product forbids, and it
// would have swapped a false ✓ for a task that silently never ticks. Two
// surfaces: the advisor names the band BEFORE the mark, the coach card explains
// the refusal AT it.
// ---------------------------------------------------------------------------

/** A straight route carrying the shipped gate's own numbers, driven live. */
function driveThroughAt(speedKmh: number): HudEvent[] {
  const { params, cap, floor, titleBg } = gateAt(3);
  const lesson: LessonSpec = {
    id: "t-speed-floor",
    order: 99,
    titleBg: "Тестов маршрут",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    postedLimitKmh: 90,
    objectives: [
      {
        id: GATE_ID,
        titleBg,
        kind: "reachZone",
        params: { x: 0, y: 100, radiusM: params.radiusM, maxSpeedKmh: cap, minSpeedKmh: floor },
      },
      { id: "t-finish", titleBg: "Спри в края", kind: "reachZone", params: { x: 0, y: 300, radiusM: 15 } },
    ],
  };
  let s = createLessonSession(lesson);
  const hud: HudEvent[] = [];
  const step = (speedKmh / 3.6) * 0.5;
  for (let i = 0; i * step <= 160; i++) {
    const r = applyTick(
      s,
      makeTick({ t: i * 0.5, speedKmh, position: { x: 0, y: i * step }, maxSpeedKmh: 90 }),
    );
    s = r.state;
    hud.push(...r.hudEvents);
  }
  return hud;
}

describe("§3 the refusal explains itself on both surfaces", () => {
  it("the coach card fires on the crawl, with the wanted and the measured number", () => {
    const card = driveThroughAt(THE_CRAWL_KMH).find(
      (e): e is Extract<HudEvent, { kind: "lesson" }> =>
        e.kind === "lesson" && e.titleBg === SLOW_CARD_TITLE,
    );
    expect(card, "the too-slow card never fired").toBeDefined();
    const text = card!.explanationBg;
    // THEO-4: what the task wants, what was observed, why it is the dangerous
    // half, and what to do — never a bare verdict.
    expect(text).toContain("поне 35 км/ч");
    expect(text).toContain(`${THE_CRAWL_KMH} км/ч`);
    expect(text).toMatch(/спираш в осветеното/u);
    expect(text).toMatch(/пречка за движението/u);
    expect(text).toMatch(/Ускори СЕГА|остава неизпълнена/u);
    // ADR-002 — the citation is retrieved (ЗДвП чл. 5, ал. 1, т. 1: „не трябва
    // да създава опасности и пречки за движението", content/law/acts/zdvp.json),
    // never free-recalled prose.
    expect(card!.lawRef).toBe("ЗДвП чл. 5");
  });

  it("…and stays silent on the drive that honours the band", () => {
    const quiet = driveThroughAt(THE_TAUGHT_KMH).filter(
      (e) => e.kind === "lesson" && e.titleBg === SLOW_CARD_TITLE,
    );
    expect(quiet).toEqual([]);
  });

  it("the advisor names the floor BEFORE the mark — a gate may not refuse an untold number", () => {
    const { params, cap, floor, titleBg, postedLimitKmh } = gateAt(1);
    const textBg = advisorPromptForObjective(titleBg, params, undefined, postedLimitKmh, 50).textBg;
    expect(textBg).toContain(`не под ${floor}`);
    // The cap tail must keep the END of the sentence: `LessonPlayShell
    // taskCapKmhFromPrompt` recovers the cockpit strip's «задачата иска ≤N»
    // with a regex anchored there, and `taskCapThread.test.ts` additionally
    // requires the last «N км/ч» run in the card to be that same figure.
    expect(textBg.endsWith(`дръж под ${Math.min(cap, 50)} км/ч`)).toBe(true);
    // …and the clause still fits the card it is painted on (the 95 ch phone
    // band `advisor-authored-cap.test.ts` measured off the deployed device).
    expect(textBg.length).toBeLessThan(95);
  });
});

// ---------------------------------------------------------------------------
// §4 — IT MAY NOT TRAP ANYONE
// ---------------------------------------------------------------------------

describe("§4 the floor rides the same latch, so self-correction is never punished", () => {
  it("a crawl that picks the pace up while still on the mark earns the tick", () => {
    const { params, floor } = gateAt(3);
    let st: ObjectiveEvalState = createEvalState(params);
    let done = false;
    const path: [number, number][] = [
      [params.y - 20, 12],
      [params.y - 8, 10],
      [params.y - 1, 9], // arrives crawling — refused on this frame
      [params.y + 1, floor + 4], // …and picks it up while still inside the disc
      [params.y + 3, floor + 6],
    ];
    path.forEach(([y, v], i) => {
      const r = stepObjective(
        params,
        st,
        makeTick({ t: i * 0.5, speedKmh: v, position: { x: params.x, y }, maxSpeedKmh: 90 }),
      );
      st = r.evalState;
      done = done || r.done;
    });
    expect(done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §5 — AND NOTHING ELSE IN THE CATALOGUE MOVED
// ---------------------------------------------------------------------------

describe("§5 exactly one gate in the whole library carries a floor", () => {
  it("the census names it, so a blanket floor cannot arrive unnoticed", () => {
    const carriers: string[] = [];
    for (const s of SCENARIO_TEMPLATES) {
      // The template's OWN authored rungs — `compileScenario` refuses a level a
      // template omits, and some of the catalogue stops at L4.
      for (const { level } of s.levels) {
        for (const o of compileScenario(s, level).objectives) {
          const p = parseObjectiveParams(o) as { kind: string; minSpeedKmh?: number };
          if (p.kind === "reachZone" && p.minSpeedKmh !== undefined) {
            carriers.push(`${s.id}/${o.id}@L${level}`);
          }
        }
      }
    }
    expect(carriers).toEqual(RUNGS.map((l) => `${LESSON_ID}/${GATE_ID}@L${l}`));
  });
});
