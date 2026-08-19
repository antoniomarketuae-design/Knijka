/**
 * THE NUMBER THE STUDENT IS GRADED ON, AND IS NOW TOLD — the authored-cap wave.
 *
 * ── THE DEFECT ──
 *
 * `advisorPromptForObjective` returned the objective's bare title, with no
 * speed in it, for 499 of the 953 compiled reachZone cards that carry a speed
 * cap. The gate went on grading every one of them. Split by what the student
 * could actually see — the objective's own title, every step of the compiled
 * briefing, and the street's posted limit:
 *
 *   169  cards showed NO speed number on any surface, and had a gate anyway
 *   116  showed only numbers ABOVE their gate, so the student who obeyed the
 *        strictest figure he had been given failed a threshold nobody stated
 *
 * The exhibit is the reference lesson. `sc-zebra-approach@L1 / sc-za-approach`
 * reads «Приближи пътеката с готовност за спиране», names no speed, and grades
 * at 45. The sharp end of the 116 is `sc-crossing-child-ball@L1`: its briefing
 * says «под 40 км/ч» and its gate is 37 — obey the briefing at 39 and fail.
 *
 * That second class is the founder's own complaint standing one street over. He
 * signalled a roundabout exit correctly and the engine failed him; here a
 * student drives the number he was given and the engine fails him. THEO-4
 * requirement zero forbids both: this product is a virtual driving instructor
 * that explains every decision, and a grade against an unstated threshold is
 * the definition of the bare verdict it may never hand a seventeen-year-old.
 *
 * ── THE CONTRACT CHOSEN ──
 *
 * (a) THE CARD NAMES THE NUMBER IT IS GRADED ON. Not (b): a cap that stops
 * grading is a lesson that stops teaching speed discipline, and speed is the
 * single most-graded thing in the Bulgarian practical exam.
 *
 * The number it names is the AUTHOR'S OWN CAP — the template's `maxSpeedKmh`
 * before `scenario/params.ts widenSpeedCap` folded the rung's grace into it —
 * carried onto the compiled objective by `compile.ts` under
 * AUTHORED_MAX_SPEED_PARAM_KEY and read by `advisor.ts spokenCapKmh` as its
 * fourth source. It is never the grader's tolerance (that was sweep161's
 * photographed defect, «дръж под 54.5 км/ч») and it is never above the gate, so
 * the card can never coach a student into failing the task it is coaching.
 *
 * ── THE INVARIANT, and it is checkable ──
 *
 *   EVERY capped objective states the number it is graded on, on the card
 *   itself, and the number it states can never fail the student who obeys it.
 *
 * Everything below either pins that or pins the direction it must not fail in.
 * The second half of each block is the opposite direction, because a card that
 * said „под 5 км/ч" everywhere would satisfy the first half perfectly.
 */

import { describe, expect, it } from "vitest";
import { advisorPromptForObjective, advisorPromptForSession } from "../advisor";
import { createLessonSession } from "../engine";
import { parseObjectiveParams } from "../objectives";
import { AUTHORED_MAX_SPEED_PARAM_KEY, compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { LessonSessionState } from "../types";
import type { LessonObjective, LessonSpec } from "../../contracts";

/** Mirrors REACH_ZONE_HALT_CAP_KMH / ADVISOR_HALT_CAP_KMH — kept local so this
 *  file states the band it reasons about rather than inheriting it silently. */
const HALT_CAP_KMH = 8;

const KMH = (s: string) =>
  [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*км\/ч/g)].map((m) => Number(m[1].replace(",", ".")));

interface Card {
  lessonId: string;
  objectiveId: string;
  titleBg: string;
  /** The gate: `maxSpeedKmh` after the rung's grace. */
  cap: number;
  /** The template's own figure, before the grace. */
  authored: number | undefined;
  posted: number | undefined;
  /** Every «N км/ч» anywhere in the compiled briefing. */
  briefNums: number[];
  /** The card exactly as `advisorPromptForSession` builds it. */
  textBg: string;
  spoken: number | undefined;
}

/**
 * Every capped reachZone card in the catalogue, built through the SAME call
 * `advisorPromptForSession` makes — five arguments, the authored cap included.
 *
 * Deliberately not shared with `advisor-sweep161.test.ts`, which walks the same
 * catalogue: a shared fixture is a single point of failure for two censuses
 * that exist to cross-check each other, and this project has already had a
 * probe report zero defects because ONE helper was wrong.
 */
function everyCappedCard(): Card[] {
  const out: Card[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) {
      const lesson: LessonSpec = compileScenario(spec, rung.level as ScenarioLevel);
      const briefNums = KMH((lesson.briefingBg ?? []).map((s) => s.textBg).join(" | "));
      for (const o of lesson.objectives) {
        if (o.kind !== "reachZone") continue;
        const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
        if (cap === undefined) continue;
        const rawAuthored = o.params[AUTHORED_MAX_SPEED_PARAM_KEY];
        const authored = typeof rawAuthored === "number" ? rawAuthored : undefined;
        const textBg = advisorPromptForObjective(
          o.titleBg,
          { kind: "reachZone", ...(o.params as object) } as never,
          undefined,
          lesson.postedLimitKmh,
          authored,
        ).textBg;
        out.push({
          lessonId: lesson.id,
          objectiveId: o.id,
          titleBg: o.titleBg,
          cap,
          authored,
          posted: lesson.postedLimitKmh,
          briefNums,
          textBg,
          spoken: textBg.includes("дръж под") ? KMH(textBg).at(-1) : undefined,
        });
      }
    }
  }
  return out;
}

/** One compiled objective by id, with its lesson. */
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

/** The card for one compiled objective, exactly as the session builds it. */
function cardFor(scenarioId: string, objectiveId: string, level: ScenarioLevel = 1): string {
  const { lesson, o } = objectiveOf(scenarioId, objectiveId, level);
  const authored = o.params[AUTHORED_MAX_SPEED_PARAM_KEY];
  return advisorPromptForObjective(
    o.titleBg,
    { kind: o.kind, ...(o.params as object) } as never,
    undefined,
    lesson.postedLimitKmh,
    typeof authored === "number" ? authored : undefined,
  ).textBg;
}

// ---------------------------------------------------------------------------
// 0. THE HARNESS CHECKS ITSELF FIRST
// ---------------------------------------------------------------------------

describe("the instrument, before anything it measures", () => {
  it("the sweep is wired to the real card — it goes blind if the authored cap is withheld", () => {
    // THE SELF-CHECK THIS FILE EXISTS BEHIND. `advisor-sweep161.test.ts` spent a
    // run measuring a four-argument call after the HUD had moved to five, and
    // stayed green on cards the product no longer showed. So: withhold the
    // fifth argument on a card whose ONLY number source is the authored cap and
    // the sweep must fall silent. If this ever passes both ways, the sweep below
    // is measuring a ghost and every count in it is worthless.
    const { lesson, o } = objectiveOf("sc-zebra-approach", "sc-za-approach");
    const withAuthored = advisorPromptForObjective(
      o.titleBg,
      { kind: "reachZone", ...(o.params as object) } as never,
      undefined,
      lesson.postedLimitKmh,
      o.params[AUTHORED_MAX_SPEED_PARAM_KEY] as number,
    ).textBg;
    const withoutAuthored = advisorPromptForObjective(
      o.titleBg,
      { kind: "reachZone", ...(o.params as object) } as never,
      undefined,
      lesson.postedLimitKmh,
    ).textBg;
    expect(withAuthored).toContain("дръж под");
    expect(withoutAuthored).not.toContain("дръж под");
    expect(withoutAuthored).toBe(o.titleBg);
  });

  it("the catalogue sweep sees the whole catalogue", () => {
    const cards = everyCappedCard();
    expect(cards.length).toBe(953);
    expect(new Set(cards.map((c) => c.lessonId)).size).toBeGreaterThan(100);
  });

  it("and the LIVE session path carries it too — not just the pure function", () => {
    // THE WIRING IS THE HALF A PURE-FUNCTION SUITE CANNOT SEE. Everything above
    // calls `advisorPromptForObjective` directly; the product calls
    // `advisorPromptForSession`, which has to dig the authored cap out of the
    // RAW compiled objective (`active.spec.params`) because the parsed params it
    // already holds have had the key whitelisted away. Break that one lookup and
    // every assertion in this file stays green while the glass goes silent.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-zebra-approach")!;
    const lesson = compileScenario(spec, 1);
    const idx = lesson.objectives.findIndex((o) => o.id === "sc-za-approach");
    const s: LessonSessionState = {
      ...createLessonSession(lesson),
      phase: "driving",
      currentObjectiveIndex: idx,
    };
    expect(advisorPromptForSession(s)?.textBg).toBe(
      "Приближи пътеката с готовност за спиране — дръж под 40 км/ч",
    );
  });
});

// ---------------------------------------------------------------------------
// 1. THE INVARIANT
// ---------------------------------------------------------------------------

describe("no capped objective grades against a number the card does not state", () => {
  it("all 953 capped cards speak a number", () => {
    const silent = everyCappedCard()
      .filter((c) => c.spoken === undefined)
      .map((c) => `${c.lessonId} ${c.objectiveId}: cap=${c.cap} :: ${c.titleBg}`);
    expect(silent).toEqual([]);
  });

  it("the census splits exactly, and the halves are named", () => {
    // PINNED BECAUSE THE LAST ONE ROTTED. advisor.ts carried „494 without a
    // number / 459 with" while HEAD measured 499 / 454, and the only assertions
    // on it were `> 900` and `> 400` — loose enough that five cards could cross
    // between the halves unnoticed. Exact, both halves, every time.
    const cards = everyCappedCard();
    const halt = cards.filter((c) => c.cap <= HALT_CAP_KMH);
    const aboveHalt = cards.filter((c) => c.cap > HALT_CAP_KMH);
    expect(cards.length).toBe(953);
    expect(halt.length).toBe(309);
    expect(aboveHalt.length).toBe(644);
    expect(cards.filter((c) => c.spoken !== undefined).length).toBe(953);
  });

  it("and the number spoken belongs to somebody — sign, title, halt band or the author's own cap", () => {
    const orphan: string[] = [];
    for (const c of everyCappedCard()) {
      const titleNums = KMH(c.titleBg);
      const isHalt = c.cap <= HALT_CAP_KMH && c.spoken === c.cap;
      const isSign = c.posted !== undefined && c.posted < c.cap && c.spoken === c.posted;
      const isTitle = c.spoken !== undefined && titleNums.includes(c.spoken);
      const isOwnCap = c.authored !== undefined && c.spoken === c.authored;
      // The gate still clamps a LOOSER authored figure down to itself; there
      // the spoken number is the gate's, and saying it is the only honest
      // option (see „the Math.min half" below).
      const isGateUnderAuthor =
        c.spoken === c.cap && [...titleNums, ...(c.authored !== undefined ? [c.authored] : [])].some((n) => n > c.cap);
      if (!isHalt && !isSign && !isTitle && !isOwnCap && !isGateUnderAuthor) {
        orphan.push(`${c.lessonId} ${c.objectiveId}: spoke ${c.spoken} (cap=${c.cap} posted=${c.posted} authored=${c.authored})`);
      }
    }
    expect(orphan).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. THE TWO DIRECTIONS — a false failure and a false certificate are the same
//    crime pointing opposite ways, so both are pinned.
// ---------------------------------------------------------------------------

describe("the card can never fail the student who obeys it", () => {
  it("no spoken number is above its own gate", () => {
    const over = everyCappedCard()
      .filter((c) => c.spoken !== undefined && c.spoken > c.cap)
      .map((c) => `${c.lessonId} ${c.objectiveId}: said ${c.spoken}, gate ${c.cap}`);
    expect(over).toEqual([]);
  });

  it("and the clause it adds still fits the card it is painted on", () => {
    // THE FRAME WINS, and this is the half of it a pure test CAN reach. 499
    // cards grew by «— дръж под NN км/ч», ~18 characters, on the surface whose
    // own header records a banner that already overlaps the follow chip. The
    // yield voice is held to <150 characters on this same card
    // (`yield-voice.test.ts`), so that is the band applied here — a number
    // stated in a sentence that clips is a number nobody was told.
    //
    // MEASURED after the change: the longest card in the catalogue is 94 ch
    // (`sc-vu-emergency sc-vue-made-way`), inside the 95-character band the
    // briefing wave measured off the deployed phone. That is the margin; it is
    // stated so the next clause added here has to re-measure rather than guess.
    // What a repository test still cannot see is the painted frame, so the
    // remaining risk is named in this wave's report rather than assumed away.
    const over = everyCappedCard()
      .filter((c) => c.textBg.length >= 150)
      .map((c) => `${c.lessonId} ${c.objectiveId}: ${c.textBg.length} ch — ${c.textBg}`);
    expect(over).toEqual([]);
  });

  it("no card speaks a FRACTION of a km/h — the tolerance's own signature", () => {
    // The guarantee is upstream: every authored cap in the catalogue is an
    // integer, so the fourth source cannot produce «дръж под 36.5 км/ч». If a
    // template ever authors a fraction this fails HERE, naming the row, rather
    // than quietly putting a figure on the glass no speedometer can show.
    const fractional = everyCappedCard()
      .filter((c) => /\d+[.,]\d+\s*км\/ч/.test(c.textBg))
      .map((c) => `${c.lessonId} ${c.objectiveId}: ${c.textBg}`);
    expect(fractional).toEqual([]);
    const nonIntegral = everyCappedCard()
      .filter((c) => c.authored !== undefined && !Number.isInteger(c.authored))
      .map((c) => `${c.lessonId} ${c.objectiveId}: authored=${c.authored}`);
    expect(nonIntegral).toEqual([]);
  });
});

describe("and it never hands out a green tick the gate did not earn", () => {
  it("the authored cap is at or under the gate on all 953 — it may only be stricter", () => {
    const looser = everyCappedCard()
      .filter((c) => c.authored !== undefined && c.authored > c.cap)
      .map((c) => `${c.lessonId} ${c.objectiveId}: authored=${c.authored} > cap=${c.cap}`);
    expect(looser).toEqual([]);
  });

  it("THE GATE DID NOT MOVE — the grader never sees the coaching number", () => {
    // The whole safety of this wave rests on one property: the key is dropped
    // by `parseObjectiveParams`'s whitelist, so it is a coaching channel by
    // construction and cannot become a threshold. sc-za-approach is the case
    // where the two numbers actually differ (40 authored, 45 graded).
    const { o } = objectiveOf("sc-zebra-approach", "sc-za-approach");
    expect(o.params[AUTHORED_MAX_SPEED_PARAM_KEY]).toBe(40);
    expect((o.params as { maxSpeedKmh?: number }).maxSpeedKmh).toBe(45);
    const parsed = parseObjectiveParams(o);
    expect(parsed.kind).toBe("reachZone");
    // The grader is held to 45, not coached down to 40 …
    expect((parsed as { maxSpeedKmh?: number }).maxSpeedKmh).toBe(45);
    // … and the coaching figure is not in the parsed record at all.
    expect(Object.keys(parsed)).not.toContain(AUTHORED_MAX_SPEED_PARAM_KEY);
  });

  it("a Math.min that stopped clamping would be caught: a looser authored figure still yields the gate", () => {
    // MUTATION, run in-test rather than described. Feed the advisor an authored
    // cap of 90 over a gate of 45 — the shape of a template whose title says
    // «под 90 км/ч» on a stricter rung. If `Math.min(visible, capKmh)` were
    // ever dropped the card would license 90 through a 45 gate.
    const { lesson, o } = objectiveOf("sc-zebra-approach", "sc-za-approach");
    const text = advisorPromptForObjective(
      o.titleBg,
      { kind: "reachZone", ...(o.params as object) } as never,
      undefined,
      lesson.postedLimitKmh,
      90,
    ).textBg;
    expect(text).toBe(`${o.titleBg} — дръж под 45 км/ч`);
    expect(text).not.toContain("90");
  });
});

// ---------------------------------------------------------------------------
// 3. THE EXHIBITS — the two classes, each on the frame that opened it
// ---------------------------------------------------------------------------

describe("the exhibits", () => {
  it("sc-zebra-approach@L1: the reference lesson stops grading at 45 in silence", () => {
    const { o } = objectiveOf("sc-zebra-approach", "sc-za-approach");
    expect(o.titleBg).toBe("Приближи пътеката с готовност за спиране");
    expect((o.params as { maxSpeedKmh?: number }).maxSpeedKmh).toBe(45);
    expect(cardFor("sc-zebra-approach", "sc-za-approach")).toBe(
      "Приближи пътеката с готовност за спиране — дръж под 40 км/ч",
    );
  });

  it("sc-crossing-child-ball@L1: the briefing said 40 over a gate of 37; the card now says 32", () => {
    // THE FALSE-FAILURE CLASS, and the reason this lane is the founder's own
    // complaint one street over. Every number the student could see was 40; the
    // gate was 37; 39 km/h failed him with nothing on any surface to explain it.
    const { lesson, o } = objectiveOf("sc-crossing-child-ball", "sc-cbl-approach");
    const briefNums = KMH((lesson.briefingBg ?? []).map((s) => s.textBg).join(" | "));
    expect(briefNums).toContain(40);
    expect((o.params as { maxSpeedKmh?: number }).maxSpeedKmh).toBe(37);
    const card = cardFor("sc-crossing-child-ball", "sc-cbl-approach");
    expect(card).toBe("Приближи пътеката бавно, с готовност за спиране — дръж под 32 км/ч");
    // The strictest figure the student is now shown is at or under the gate,
    // which is the property the 116 lacked.
    expect(32).toBeLessThanOrEqual(37);
  });

  it("the historical census of the two classes, as measured at the head of this wave", () => {
    // A CENSUS, NOT A LIVE INVARIANT — it reads the compiled BRIEFING, which
    // template authors legitimately edit. If a briefing gains or loses a «N
    // км/ч» this goes red: RE-MEASURE and restate it, never relax it. The
    // method is exactly the one in the header — old rule = title + posted-below-
    // gate only, i.e. `spokenCapKmh` without its fourth source.
    let noneStated = 0;
    let statedAboveGate = 0;
    let oldSpoken = 0;
    for (const c of everyCappedCard()) {
      const titleNums = KMH(c.titleBg);
      const sources = [
        ...(titleNums.length > 0 ? [Math.min(...titleNums)] : []),
        ...(c.posted !== undefined && c.posted > 0 && c.posted < c.cap ? [c.posted] : []),
      ];
      if (c.cap <= HALT_CAP_KMH || sources.length > 0) oldSpoken++;
      if (c.cap <= HALT_CAP_KMH) continue;
      const surfaces = [...titleNums, ...c.briefNums, ...(c.posted !== undefined ? [c.posted] : [])];
      if (surfaces.length === 0) noneStated++;
      else if (Math.min(...surfaces) > c.cap) statedAboveGate++;
    }
    // What the card said before source 4 — and what advisor.ts's own comment
    // got wrong by five in each direction.
    expect(oldSpoken).toBe(454);
    expect(953 - oldSpoken).toBe(499);
    // The two classes inside that 499.
    expect(noneStated).toBe(169);
    expect(statedAboveGate).toBe(116);
  });
});

// ---------------------------------------------------------------------------
// 4. WHAT MUST NOT HAVE CHANGED
// ---------------------------------------------------------------------------

describe("source 4 only ever fills a hole", () => {
  it("not one card that already spoke a number now speaks a different one", () => {
    // The strongest guard against this wave having quietly re-coached the
    // catalogue: recompute what the old three sources would have said, and
    // require that wherever they said anything, the card still says exactly it.
    const moved: string[] = [];
    for (const c of everyCappedCard()) {
      if (c.cap <= HALT_CAP_KMH) {
        if (c.spoken !== c.cap) moved.push(`${c.lessonId} ${c.objectiveId}: halt card said ${c.spoken}, cap ${c.cap}`);
        continue;
      }
      const titleNums = KMH(c.titleBg);
      const sources = [
        ...(titleNums.length > 0 ? [Math.min(...titleNums)] : []),
        ...(c.posted !== undefined && c.posted > 0 && c.posted < c.cap ? [c.posted] : []),
      ];
      if (sources.length === 0) continue;
      const before = Math.min(Math.min(...sources), c.cap);
      if (c.spoken !== before) {
        moved.push(`${c.lessonId} ${c.objectiveId}: was ${before}, now ${c.spoken}`);
      }
    }
    expect(moved).toEqual([]);
  });

  it("a lesson compiled outside the scenario pipeline still behaves exactly as before", () => {
    // Curriculum lessons, the exam bank and every hand-built test double carry
    // no authored cap. Silence there is the SHIPPED behaviour, not a new hole:
    // this argument degrades, it does not demand.
    const text = advisorPromptForObjective(
      "Стигни зоната",
      { kind: "reachZone", x: 0, y: 0, radiusM: 5, maxSpeedKmh: 41 } as never,
      undefined,
      undefined,
      undefined,
    ).textBg;
    expect(text).toBe("Стигни зоната");
  });

  it("an uncapped reachZone gains no number from anywhere", () => {
    const text = advisorPromptForObjective(
      "Премини пътеката, след като е свободна",
      { kind: "reachZone", x: 0, y: 0, radiusM: 12 } as never,
      undefined,
      50,
      30,
    ).textBg;
    expect(text).toBe("Премини пътеката, след като е свободна");
  });

  it("a nonsense authored cap is refused, not spoken", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const text = advisorPromptForObjective(
        "Стигни зоната",
        { kind: "reachZone", x: 0, y: 0, radiusM: 5, maxSpeedKmh: 41 } as never,
        undefined,
        undefined,
        bad,
      ).textBg;
      expect(text).toBe("Стигни зоната");
    }
  });
});
