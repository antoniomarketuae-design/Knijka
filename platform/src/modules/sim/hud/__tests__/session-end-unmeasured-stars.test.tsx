/**
 * ★★★ AND NOT ONE WORD SAYING WHAT EARNED THEM.
 *
 * The frame, read off a STEERED drive of the shipped build (the harness could
 * only accelerate and brake until 2026-08-22, so this one survives the „the car
 * was failing, not the product" objection):
 *
 *   .audit-frames/proof/frames/sc-sp-harsh-brake__mobile-right/
 *     _audit-debrief.json → section[aria-label="Оценка на маневрата"]
 *
 *   „Оценка на маневрата · оценка на симулатора — не е закон · ★★★ · Точки за
 *    изпълнение — оценка на симулатора за качеството на маневрата, по 0–2 за
 *    всеки показател. Тук точките се ПЕЧЕЛЯТ (2 е най-доброто) … ·
 *    Ориентировъчно време — 185 с при ориентир 75 с — спокойно, точността е
 *    преди скоростта."
 *
 * That is the card in full — `"items"` in the same file lists exactly one row.
 * Three filled stars under a heading that promises an opinion on the EXECUTION,
 * a note promising „0–2 за всеки показател", and then no показател at all: the
 * one row present is par time, which doc 76 §6 makes informational and the star
 * fold ignores. `sc-follow-distance__mobile-right` (ИЗДЪРЖАН, „3 от 3 звезди",
 * contentH 1331) is the identical shape on a different lesson.
 *
 * WHICH FINDING THIS IS. `sc-sp-harsh-brake:08dc81f8` filed it as a clipping
 * defect — „the star rating is visible but the explanation of what earned it is
 * not". The clipping half was the shell's and is announced now (the „↓ РАЗБОРЪТ
 * ПРОДЪЛЖАВА" pill is on the same frame set). The half underneath it is this
 * one, and it does not need scrolling to see: on a `parTimeSec`-only rubric
 * THERE IS NO EXPLANATION ANYWHERE ON THE CARD TO SCROLL TO. 128 of the 196
 * authored rubrics in `lessons/scenario/templates-*.ts` are that shape.
 *
 * THE NUMBER IS NOT ON TRIAL HERE. „Full stars from cleanliness" is a stated
 * contract with ~141 assertions behind it and changing it is an ADR. Every
 * assertion below is about what the card SAYS beside the number.
 *
 * MUTATION LOG — each mutation applied ALONE to `SessionEndScreen.tsx`, this
 * file untouched, every run WATCHED before the lane reported (13 tests total):
 *   1. delete the `{unmeasuredStarsBg !== null ? …}` block from the card
 *        → 2 failed: „says where three unmeasured stars came from",
 *          „clean + completed: the star row has exactly one account beside it"
 *   2. `if (true) return null;` at the top of `unmeasuredStarsNoteBg`
 *        → the same 2 failed
 *   3. predicate `line.points !== null` → `line.measured` — the plausible
 *      „simplification", and the trap: par time is measured:true / points:null
 *        → the same 2 failed, which is why the harder predicate was chosen
 *   4. delete the `manoeuvreGradeReasonBg(result) !== null` guard
 *        → 7 failed: both „THE OTHER DIRECTION" cap cases and five of the six
 *          one-account shapes — i.e. the note turns into wallpaper
 *   5. delete the `some(points !== null)` guard
 *        → 1 failed: „a rubric that DID measure quality says nothing of the
 *          kind"
 *
 * `renderToStaticMarkup` and not a DOM: vitest.config.ts is `environment:
 * "node"` for the whole suite — the sibling `session-end-numbers.test.tsx`
 * precedent, and the question here is what the markup says.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSessionSummary, makeViolation, type ScorableEvent } from "../../rules";
import {
  scoreRubric,
  type LessonResult,
  type ObjectiveOutcome,
  type RubricScore,
} from "../../lessons";
import { SessionEndScreen, unmeasuredStarsNoteBg } from "../SessionEndScreen";

/** A real graded result: the summary is the ENGINE's, never hand-written. */
function resultOf(
  events: ScorableEvent[],
  over: Partial<LessonResult> = {},
): LessonResult {
  const summary = buildSessionSummary(events);
  return {
    lessonId: "sc-sp-harsh-brake",
    summary,
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: summary.passed,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 185,
    ...over,
  };
}

function screenMarkup(result: LessonResult, rubric: RubricScore | null): string {
  return renderToStaticMarkup(
    <SessionEndScreen
      lessonTitleBg="Рязко спиране без причина · Ниво 1 — Пълна помощ"
      result={result}
      debriefText="разбор"
      concepts={[]}
      xpEarned={100}
      onRetry={() => undefined}
      onExit={() => undefined}
      nextLessonTitleBg={null}
      onNextLesson={null}
      rubric={rubric}
    />,
  );
}

/**
 * Markup with tags stripped — what a reader actually reads. The star COUNT is
 * only in the row's `aria-label`, which strips with the tag, so the count is
 * asserted against `screenMarkup` and the prose against this.
 */
function screenText(result: LessonResult, rubric: RubricScore | null): string {
  return screenMarkup(result, rubric)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `sc-sp-harsh-brake`'s ACTUAL authored rubric — `templates-sp.ts:961` reads
 * `rubric: { parTimeSec: 75 }`, and the frame above reports „ориентир 75 с".
 * Retyping the literal rather than importing the catalog keeps this suite off
 * the template graph; the number is pinned by the frame, not by taste.
 */
const HARSH_BRAKE_RUBRIC = { parTimeSec: 75 };

/** A parkInBay channel that DID measure — the other direction's fixture. */
function parkedObjective(alignment: "centered" | "sloppy"): ObjectiveOutcome {
  return {
    id: "obj-park",
    titleBg: "Паркирай в очертанията",
    done: true,
    completedAtSec: 120,
    detail: {
      kind: "parkInBay",
      attempts: 1,
      inBay: true,
      centerOffsetM: 0.1,
      headingOffsetDeg: 1.5,
      alignment,
    },
  };
}

describe("the fixture is the measured shape, produced by the real scorer", () => {
  const clean = resultOf([]);
  const scored = scoreRubric(clean, HARSH_BRAKE_RUBRIC);

  it("a clean, completed run on a parTime-only rubric is the three-star card", () => {
    expect(clean.passed).toBe(true);
    expect(clean.score).toBe(0);
    expect(scored.stars).toBe(3);
  });

  it("…and it carries no показател: one informational row, no 0–2 anywhere", () => {
    expect(scored.breakdownBg.map((l) => l.id)).toEqual(["parTime"]);
    expect(scored.breakdownBg.every((l) => l.points === null)).toBe(true);
    // THE TRAP THAT MAKES `measured` THE WRONG PREDICATE: par time reports
    // measured:true and still feeds no star. A note gated on `measured` would
    // go silent on exactly the 128 rubrics that need it.
    expect(scored.breakdownBg[0].measured).toBe(true);
  });
});

describe("the card accounts for its own star row", () => {
  it("says where three unmeasured stars came from", () => {
    const clean = resultOf([]);
    const scored = scoreRubric(clean, HARSH_BRAKE_RUBRIC);
    const text = screenText(clean, scored);

    // Three filled stars are on the card — the number this note explains.
    expect(screenMarkup(clean, scored)).toContain('aria-label="3 от 3 звезди"');
    // …and now so is the fact that makes it readable.
    expect(text).toContain("Звездите идват изцяло от изпитния лист");
    expect(text).toContain("не наруши нищо");
    // It names WHY there are no rows — the promise „по 0–2 за всеки показател"
    // two lines above is otherwise unkept with no explanation.
    expect(text).toContain("няма показатели за качество на изпълнението");
  });

  it("does not smuggle in a cap that is not there", () => {
    const clean = resultOf([]);
    const text = screenText(clean, scoreRubric(clean, HARSH_BRAKE_RUBRIC));
    expect(text).not.toContain("Само една звезда");
    expect(text).not.toContain("Най-много две звезди");
  });

  it("THE OTHER DIRECTION: a rubric that DID measure quality says nothing of the kind", () => {
    const parked = resultOf([], { objectives: [parkedObjective("centered")] });
    const scored = scoreRubric(parked, {
      parTimeSec: 75,
      placement: { objectiveId: "obj-park" },
    });
    // A real 0–2 row exists, so the rows ARE the explanation.
    expect(scored.breakdownBg.some((l) => l.points !== null)).toBe(true);
    expect(unmeasuredStarsNoteBg(parked, scored)).toBeNull();
    expect(screenText(parked, scored)).not.toContain(
      "Звездите идват изцяло от изпитния лист",
    );
  });

  it("THE OTHER DIRECTION: a capped run keeps the cap sentence and gains no second one", () => {
    // A collision — `manoeuvreGradeReasonBg` already owns this slot and says
    // „Само една звезда, защото има сблъсък". Two paragraphs about one star
    // row is the wallpaper this note exists to avoid.
    const collided = resultOf([makeViolation("COLLISION", 22)], {
      completedAll: false,
    });
    const scored = scoreRubric(collided, HARSH_BRAKE_RUBRIC);
    expect(scored.stars).toBe(1);
    expect(scored.breakdownBg.every((l) => l.points === null)).toBe(true);

    expect(unmeasuredStarsNoteBg(collided, scored)).toBeNull();
    const text = screenText(collided, scored);
    expect(text).toContain("Само една звезда");
    expect(text).not.toContain("Звездите идват изцяло от изпитния лист");
  });

  it("THE OTHER DIRECTION: a two-star ceiling is a cap, not a silence", () => {
    // One основна: `scoreRubric` caps at two and the cap sentence explains the
    // withheld third star. Nothing is silent, so this note stays out.
    const oneMinor = resultOf([makeViolation("TURN_WITHOUT_INDICATOR", 10)]);
    const scored = scoreRubric(oneMinor, HARSH_BRAKE_RUBRIC);
    expect(scored.stars).toBe(2);
    expect(unmeasuredStarsNoteBg(oneMinor, scored)).toBeNull();
  });
});

describe("the card is never silent and never doubled", () => {
  /**
   * The invariant the two helpers hold between them: EXACTLY ONE sentence
   * accounts for the star row, on every shape the sweep produced. Before this
   * lane the clean parTime-only run had zero — which is the bare verdict doc 64
   * THEO-4 forbids on the card whose whole subject is how well it was driven.
   */
  const shapes: Array<[string, LessonResult]> = [
    ["clean + completed", resultOf([])],
    ["clean + unfinished", resultOf([], { completedAll: false, passed: false })],
    ["clean + aborted", resultOf([], { aborted: true, passed: false })],
    ["one основна", resultOf([makeViolation("TURN_WITHOUT_INDICATOR", 10)])],
    ["collision", resultOf([makeViolation("COLLISION", 22)], { completedAll: false })],
    [
      "over the allowance",
      resultOf([10, 20, 30, 40].map((t) => makeViolation("TURN_WITHOUT_INDICATOR", t))),
    ],
  ];

  for (const [label, result] of shapes) {
    it(`${label}: the star row has exactly one account beside it`, () => {
      const scored = scoreRubric(result, HARSH_BRAKE_RUBRIC);
      const text = screenText(result, scored);
      const accounts = [
        text.includes("Само една звезда"),
        text.includes("Най-много две звезди"),
        text.includes("Звездите идват изцяло от изпитния лист"),
      ].filter(Boolean).length;
      expect(`${label}: ${accounts}`).toBe(`${label}: 1`);
    });
  }
});

/**
 * VERIFIER, ROUND 5 — THE SHAPE THE SUITE ABOVE NEVER DROVE.
 *
 * Every fixture above is a `parTimeSec`-only rubric or one whose placement
 * MEASURED. Between them sits a third shape, and the note was false on it: a
 * lesson that AUTHORS a показател which then abstains on every drive.
 *
 * `sc-merge-accel-lane` (templates-merging.ts:166) is that lesson —
 * `observation` with two moments, no placement, no economy. Its glance channel
 * is `parkingObservationFromTrace`, which returns null unless the trace has a
 * reverse phase (scenario/observation.ts), and a motorway merge has none: the
 * observation row abstains on EVERY drive, `points: null` / `measured: false`.
 * Twelve of the 162 authored rubrics are this shape (merging ×5, vru2 ×4,
 * merging2, lanes3, cockpit2).
 *
 * Rendered before the third guard, that card said „този урок няма показатели
 * … наблюдение" two lines above a row headed „Наблюдение" naming the two
 * moments — a false sentence, and the SECOND account of one star row, because
 * `scoreRubric` had already appended `NO_QUALITY_MEASURED_BG` to that row.
 *
 * MUTATION: delete the `line.id !== "parTime"` guard → both tests below go red
 * (accounts 2, and the false claim reappears).
 */
const MERGE_RUBRIC = {
  observation: {
    moments: [
      { id: "sc-mrg-glance-mirror", titleBg: "Ляво огледало, докато ускоряваш в лентата" },
      { id: "sc-mrg-glance-shoulder", titleBg: "Мъртва зона през рамо, преди да завъртиш волана" },
    ],
  },
  parTimeSec: 55,
};

describe("a lesson whose only показател ABSTAINS is already accounted for", () => {
  // No observation input — the real shipping path for every non-reversing
  // lesson, not a contrived one.
  const clean = resultOf([], { lessonId: "sc-merge-accel-lane", durationSec: 60 });
  const scored = scoreRubric(clean, MERGE_RUBRIC);

  it("the fixture is the abstaining shape: three stars, no row scored", () => {
    expect(scored.stars).toBe(3);
    expect(scored.breakdownBg.map((l) => l.id)).toEqual(["observation", "parTime"]);
    expect(scored.breakdownBg.every((l) => l.points === null)).toBe(true);
  });

  it("the card does not claim a показател it authored does not exist", () => {
    const text = screenText(clean, scored);
    // The row is on the card, naming what the examiner watches here…
    expect(text).toContain("Мъртва зона през рамо");
    // …so the card must not say the lesson has no показатели.
    expect(text).not.toContain("няма показатели за качество на изпълнението");
    expect(unmeasuredStarsNoteBg(clean, scored)).toBeNull();
  });

  it("…and still has exactly one account of its star row — scoreRubric's", () => {
    const text = screenText(clean, scored);
    const accounts = [
      text.includes("Само една звезда"),
      text.includes("Най-много две звезди"),
      text.includes("Звездите идват изцяло от изпитния лист"),
      // rubric.ts NO_QUALITY_MEASURED_BG, appended to the abstaining row.
      text.includes("звездите горе идват само от изпитния лист"),
    ].filter(Boolean).length;
    expect(accounts).toBe(1);
  });
});
