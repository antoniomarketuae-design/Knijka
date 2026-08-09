/**
 * THE THEORY EXAM'S OWN SCALE — grounded in the act, then read off the screen.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS
 * ===========================================================================
 * The simulator wave closed fourteen bare „т." and reported „0 across 56
 * files". Both halves of that sentence were true and the product still had TEN
 * live, because the scanner's directory list stopped at the simulator. Two of
 * the ten were `components/exam/*` — the screen a candidate looks at for forty
 * timed minutes — and they were missing from that lane's written disclosure as
 * well as from its scan. `modules/sim/rules/__tests__/point-scales.test.ts` now
 * walks `/exams` and `components/exam` too; that closes the SOURCE half.
 *
 * This file closes the two halves a source scan cannot reach:
 *
 *   1. THE ACT. The theory exam's numbers — 45 questions, a ceiling of 97, a
 *      pass mark of 87, 40 minutes — were constants in `modules/exam/types.ts`
 *      whose only citation was a product doc. They are re-cut here from
 *      `content/law/acts/naredba-38.json` and compared, so an amendment either
 *      moves the exam or turns this suite red. ADR-002: a figure with a doc
 *      reference and no act behind it is a figure nobody has checked.
 *
 *   2. THE SCREEN. The founder's complaint came from LOOKING AT one, and the
 *      data behind it was correct the whole time. So the result card and the
 *      review card are rendered with `react-dom/server` and read the way a
 *      student reads them.
 *
 * ===========================================================================
 * WHAT THE SCALE IS CALLED, AND WHAT IT IS NOT
 * ===========================================================================
 * Наредба № 38, чл. 39, ал. 1 — „Максималният брой точки, от правилни отговори
 * на всички изпитни въпроси, е 97." So: ТОЧКИ ОТ ПРАВИЛНИ ОТГОВОРИ.
 *
 * NOT „изпитни точки". On this product that phrase now means the PRACTICAL
 * sheet — приложение № 5, т. 10, 10/3/1 per fault, fail above 9 — and stamping
 * it on a written test would have been worse than the bare „т." it replaced,
 * because a wrong label is believed and a bare number is only unclear.
 *
 * And NOT a fifth scale. `POINT_SCALES.theory` already counted this unit for
 * the simulator's mid-drive micro-quiz (`MicroQuizQuestion.points` is
 * documented in quiz-trigger.ts as „Official exam weight (1|2|3)"). Two ids for
 * one counter would have re-created the exact ambiguity B58 is about. What the
 * scale lacked was its act, which is what the first half of this file supplies.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  POINT_SCALES,
  THEORY_EXAM_RULE_BG,
  THEORY_EXAM_SCORE_NOTE_BG,
  THEORY_EXAM_SHORT_NOTE_BG,
  THEORY_EXAM_TIME_RULE_BG,
  THEORY_QUESTION_WEIGHT_NOTE_BG,
  pointsBg,
  pointsOutOfBg,
  pointsScaleLabelBg,
  pointsWordsBg,
} from "@/lib/content/pointScales";
import {
  EXAM_DURATION_SEC,
  EXAM_MAX_POINTS,
  EXAM_PASS_POINTS,
  EXAM_QUESTION_COUNT,
} from "@/modules/exam";
import { ReviewList, ScoreSummaryCard } from "../ExamResultView";
import type { ReviewQuestion } from "../types";

// ---------------------------------------------------------------------------
// 1. The act
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

interface Act {
  actId: string;
  sourceId: string;
  units: Array<{ ref: string; contextBg: string | null; textBg: string }>;
}

const act = JSON.parse(
  readFileSync(path.join(repoRoot, "content/law/acts/naredba-38.json"), "utf-8"),
) as Act;

/** Whitespace is an extraction artifact (line wrapping); words are not. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

const chl39 = norm(act.units.find((u) => u.ref === "чл. 39")?.textBg ?? "");
const chl38 = norm(act.units.find((u) => u.ref === "чл. 38")?.textBg ?? "");

/**
 * ал. 1 sliced out between its own opening words and ал. 2.
 *
 * Anchored on „категории В и В1", NOT on „Тестовете за провеждане", because
 * чл. 39 opens six other alineas with that same phrase for other categories —
 * ал. 3 is А1/А2/А at 40 questions / 90 / 81, ал. 8 is АМ и Ттм at 37 / 84 / 75.
 * Slicing on the wrong one would ground the mock exam in a motorcycle test and
 * every assertion below would still pass.
 */
const AL1_START = "Тестовете за провеждане на теоретичните изпити на кандидатите за придобиване на правоспособност за управление на МПС от категории В и В1";
const al1 = chl39.slice(chl39.indexOf(AL1_START), chl39.indexOf("(2) (Нова")).trim();

describe("Наредба № 38, чл. 39, ал. 1 — the act the mock exam is a copy of", () => {
  it("is the ingested SARS text", () => {
    expect(act.actId).toBe("naredba-38");
    expect(act.sourceId).toBe("src-naredba-38-sars");
    expect(chl39.length).toBeGreaterThan(0);
    expect(al1.length).toBeGreaterThan(0);
  });

  it("addresses категории В и В1 and not one of the six other alineas", () => {
    expect(al1).toContain("категории В и В1");
    // The neighbours, so a re-ingest that renumbers the article cannot let this
    // slice drift onto the motorcycle test unnoticed.
    expect(chl39).toContain("от категории А1, А2 и А съдържат 40 въпроса");
    expect(al1).not.toContain("А1, А2 и А");
  });

  it("is quoted verbatim by the vocabulary — not paraphrased", () => {
    expect(THEORY_EXAM_RULE_BG).toBe(al1);
  });

  it("sets all three figures the exam module is built on", () => {
    // Read out of the act's own sentence, then compared. Not asserted as
    // literals: a literal here is a fourth copy of the number.
    const questions = /съдържат (\d+) въпроса/.exec(al1);
    const ceiling = /Максималният брой точки, от правилни отговори на всички изпитни въпроси, е (\d+)/.exec(al1);
    const pass = /не по-малко от (\d+) точки/.exec(al1);
    expect(questions?.[1]).toBeDefined();
    expect(ceiling?.[1]).toBeDefined();
    expect(pass?.[1]).toBeDefined();

    expect(EXAM_QUESTION_COUNT).toBe(Number(questions?.[1]));
    expect(EXAM_MAX_POINTS).toBe(Number(ceiling?.[1]));
    expect(EXAM_PASS_POINTS).toBe(Number(pass?.[1]));
  });

  it("the clock comes from ал. 10, and ал. 1 is one of the alineas it covers", () => {
    expect(chl39).toContain(THEORY_EXAM_TIME_RULE_BG);
    const minutes = /по ал\. 1, 3, 5 и 8 на кандидатите се предоставят (\d+) минути/.exec(chl39);
    expect(minutes?.[1]).toBeDefined();
    expect(EXAM_DURATION_SEC).toBe(Number(minutes?.[1]) * 60);
  });

  it("names the article for the 1/2/3 weight and quotes NO figure for it", () => {
    // ADR-002, in the direction that is easy to get wrong. The наредба sets the
    // total and the threshold; it never enumerates what one question weighs —
    // чл. 38, ал. 1 hands the question set to the ИААА director. A previous wave
    // invented „50 метра" for railway crossings and shipped it approved; the
    // discipline is to show the rule and the article with no number.
    expect(chl38).toContain("утвърждава изпитни въпроси");
    expect(chl38).toContain('изпълнителният директор на Изпълнителна агенция "Автомобилна администрация"');
    expect(THEORY_QUESTION_WEIGHT_NOTE_BG).toContain("Наредба № 38, чл. 38, ал. 1");
    expect(THEORY_QUESTION_WEIGHT_NOTE_BG).toContain("самата наредба не изброява тежести");

    // And the наредба really is silent on it — checked over the WHOLE act, all
    // 78 units including every приложение, because the claim the note makes is
    // about the наредба and not about two of its articles. If a future ingest
    // starts listing weights, this sentence becomes false and must be rewritten
    // rather than left standing because a narrower assertion still passed.
    const weightBearing = act.units.filter(
      (u) => /тежест/i.test(u.textBg) || /по [123] точк/i.test(u.textBg),
    );
    expect(weightBearing.map((u) => u.ref)).toEqual([]);
    expect(act.units.length).toBeGreaterThan(70);
  });
});

describe("the scale, named the way the act names it", () => {
  it("is точки от правилни отговори, cited to чл. 39, ал. 1", () => {
    expect(POINT_SCALES.theory.wordPluralBg).toBe("точки от правилни отговори");
    expect(POINT_SCALES.theory.nameBg).toBe("точки от правилни отговори на теоретичния изпит");
    expect(POINT_SCALES.theory.sourceBg).toBe("Наредба № 38, чл. 39, ал. 1");
    expect(POINT_SCALES.theory.isLaw).toBe(true);
    // Earned, not deducted — the opposite direction from both point systems it
    // is mistaken for.
    expect(POINT_SCALES.theory.direction).toBe("earned");
  });

  it("never borrows the practical sheet's label", () => {
    for (const s of [
      pointsBg("theory", 3),
      pointsOutOfBg("theory", 78, 97),
      pointsWordsBg("theory", 97),
      pointsScaleLabelBg("theory"),
      POINT_SCALES.theory.nameBg,
      THEORY_EXAM_SCORE_NOTE_BG,
      THEORY_EXAM_SHORT_NOTE_BG,
    ]) {
      expect(s, s).not.toMatch(/изпитни точки|изпитни т\.|изпитна т\./);
      expect(s, s).not.toMatch(/наказателн\w* точк/);
    }
    // …except where it rules it out BY NAME, which is the one place it must
    // appear: a student who has driven a lesson has two wrong readings, not one.
    expect(THEORY_EXAM_SCORE_NOTE_BG).toContain("НЕ са наказателните (изпитни) точки");
  });

  it("rules out контролни точки — the reading the founder actually made", () => {
    expect(THEORY_EXAM_SCORE_NOTE_BG).toContain("НЕ са контролни точки по книжката");
    expect(THEORY_EXAM_SHORT_NOTE_BG).toContain("НЕ са контролни точки по книжката");
    expect(POINT_SCALES.theory.noteBg).toContain("нито с контролните точки по книжката");
  });

  it("carries the act in the sentence a student reads, not only in a field", () => {
    expect(THEORY_EXAM_SCORE_NOTE_BG).toContain("Наредба № 38, чл. 39, ал. 1");
    expect(THEORY_EXAM_SHORT_NOTE_BG).toContain("Наредба № 38, чл. 39, ал. 1");
  });

  it("the note's own figures are the act's figures", () => {
    // The note is prose, and doc 93 G-8 records that no gate checks prose. This
    // one is checked: it states 97 and 87 in a sentence, and those are the two
    // numbers the exam is graded on.
    expect(THEORY_EXAM_SCORE_NOTE_BG).toContain(`${EXAM_MAX_POINTS} максимум`);
    expect(THEORY_EXAM_SCORE_NOTE_BG).toContain(`не по-малко от ${EXAM_PASS_POINTS}`);
  });
});

// ---------------------------------------------------------------------------
// 2. The screen
// ---------------------------------------------------------------------------

/** Markup with tags stripped — what a reader actually reads. */
function textOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/** A failed attempt — the case where the numbers are read hardest. */
const FAILED = {
  score: 74,
  maxScore: EXAM_MAX_POINTS,
  passPoints: EXAM_PASS_POINTS,
  passed: false,
  late: false,
  timeUsedSec: 1980,
};

describe("the result card — the verdict screen, rendered", () => {
  const card = textOf(<ScoreSummaryCard {...FAILED} />);

  it("names the scale on the headline fraction", () => {
    // WAS „74" „/ 97 точки". Bare „точки" IS the founder's misreading, spelled
    // out: in Bulgarian it means контролни точки.
    expect(card).toContain("/ 97");
    expect(card).toContain("точки от правилни отговори на теоретичния изпит");
    expect(card).not.toMatch(/\/ 97 точки(?! от)/);
  });

  it("names it on every tile too, not just once at the top", () => {
    expect(card).toContain("Праг — точки по теорията");
    expect(card).toContain("Загубени точки по теорията");
    // WAS „Загубени точки" followed by the figure. „точки" with no qualifier is
    // the licence budget to a Bulgarian reader.
    expect(card).not.toMatch(/Загубени точки(?! по теорията)/);
  });

  it("puts the act and both refusals under the verdict", () => {
    expect(card).toContain("Наредба № 38, чл. 39, ал. 1");
    expect(card).toContain("НЕ са контролни точки по книжката");
    expect(card).toContain("НЕ са наказателните (изпитни) точки");
  });

  it("writes no bare „т.“ and no unqualified „точки“ anywhere on it", () => {
    // The rendered-text version of the source scan: a component can assemble a
    // bare unit out of two qualified halves and the scanner would never see it.
    expect(card).not.toMatch(/\d\s*т\.(?!\s*\d)(?!\s*(по|за|изпитн|контролн))/);
    expect(card).not.toMatch(/\d+ точки(?! от правилни| по теорията)/);
  });

  it("still says the true thing about a late paper (THEO-4)", () => {
    const late = textOf(<ScoreSummaryCard {...FAILED} late />);
    expect(late).toContain("Времето изтече");
    expect(late).toContain("отговорите ти са оценени");
  });
});

describe("the review card — 45 of these per paper, the densest „т.“ on the theory side", () => {
  const question: ReviewQuestion = {
    questionId: "q-1",
    textBg: "Кога е разрешено изпреварването отдясно?",
    type: "single",
    answered: true,
    correct: false,
    pointsAwarded: 0,
    maxPoints: 3,
    options: [
      { id: "a", textBg: "Никога.", correct: true, chosen: false },
      { id: "b", textBg: "Винаги.", correct: false, chosen: true },
    ],
    explanationBg: "Изпреварването се извършва отляво.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 42" }],
    integrity: "verified",
    noticeBg: "",
  };

  const list = textOf(<ReviewList review={[question]} />);

  it("puts the scale on the per-question chip", () => {
    // WAS „0 от 3 т.".
    expect(list).toContain("0 / 3 т. по теорията");
    expect(list).not.toMatch(/0 от 3 т\./);
  });

  it("agrees with точка at one point", () => {
    const one = textOf(
      <ReviewList review={[{ ...question, maxPoints: 1, pointsAwarded: 1, correct: true }]} />,
    );
    // точка is feminine and this scale takes no adjective, so the qualifier
    // sits after the abbreviation and does not have to inflect — but the
    // rendering must still be the vocabulary's, not a hand-built string.
    expect(one).toContain("1 / 1 т. по теорията");
  });

  it("still teaches before it grades — the chip did not eat the explanation", () => {
    expect(list).toContain("Изпреварването се извършва отляво");
    expect(list).toContain("ЗДвП");
    expect(list).toContain("чл. 42");
  });
});
