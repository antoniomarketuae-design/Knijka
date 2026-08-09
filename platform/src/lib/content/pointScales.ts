/**
 * THE POINT-LIKE SCALES — one place that knows how to write a scored number
 * down, so no surface in this product can write one down without saying what
 * it counts.
 *
 * ===========================================================================
 * THE DEFECT THIS FILE CLOSES
 * ===========================================================================
 * The founder drove the simulator, went deliberately over the limit, and read
 * „−10 т." as his DRIVING LICENCE being docked. He is right to: in Bulgarian,
 * unqualified „точки" means КОНТРОЛНИ точки — the 39-point licence budget —
 * and „т." on its own names nothing at all.
 *
 * The simulator half of the repair is `modules/sim/rules/scales.ts`, which is
 * where this vocabulary was born and where the Наредба № 38 clause helpers
 * still live. This file is the same vocabulary with the sim removed from it.
 *
 * ===========================================================================
 * WHY IT MOVED OUT OF `modules/sim/rules`
 * ===========================================================================
 * The sim wave closed fourteen bare „т." and left TEN alive on the theory
 * exam — `app/(dashboard)/exams/**` and `components/exam/**`, the screen a
 * student sits in front of for forty timed minutes. Its own scanner was
 * structurally blind to them, and its own note said so: „that is a fifth scale
 * on another team's surface".
 *
 * It is not a fifth scale. It is the FOURTH — `theory` — which the sim
 * already had, for the same counter, because a mid-drive micro-quiz question
 * is worth what it is worth on the theoretical exam (`MicroQuizQuestion.points`
 * is documented in `modules/sim/lessons/quiz-trigger.ts` as „Official exam
 * weight (1|2|3)"). Giving the exam screens a scale of their own would have
 * put two names on one unit, which is the ambiguity this whole wave exists to
 * kill. So the theory exam reuses `theory` — and this file grounds it in the
 * act, which the sim lane had left ungrounded (`isLaw: false`, no citation).
 *
 * The FILE moved because `components/exam/ExamRunner.tsx` is a client
 * component: importing the vocabulary through `@/modules/sim/rules` would have
 * pulled `engine.ts`, `catalog.ts` and `consequences.ts` — about 5 000 lines of
 * driving-rule engine — into the chunk a candidate downloads to sit a theory
 * test. `package.json` declares no `sideEffects: false`, so nothing would have
 * been shaken out. Same reasoning, and the same address, as
 * `lib/content/money.ts`: what two halves of the product share must belong to
 * neither. Every `modules/sim/rules` import path is unchanged — `scales.ts`
 * re-exports all of this.
 *
 * ===========================================================================
 * FOUR SCALES, AND WHY A FIND-AND-REPLACE WOULD HAVE BEEN WRONG
 * ===========================================================================
 *   1. `exam`      НАКАЗАТЕЛНИ (ИЗПИТНИ) ТОЧКИ — the PRACTICAL exam sheet,
 *                  Наредба № 38, приложение № 5, т. 10. 10 / 3 / 1 per fault,
 *                  fail above 9. Deducted. Bounded to ONE drive.
 *   2. `control`   КОНТРОЛНИ ТОЧКИ — the licence, Наредба № Iз-2539. 39 max,
 *                  26 at first issue. Deducted, and only by a penalty that has
 *                  entered into force on the road. THE SIMULATOR NEVER AWARDS
 *                  THESE — it only ever quotes what the street would cost.
 *   3. `manoeuvre` THE MANOEUVRE RUBRIC — 0..2 per criterion on the sim result
 *                  screen. NOT LAW AT ALL: it is this product's own quality
 *                  grade, and it runs the OTHER WAY — 2 is the good number.
 *   4. `theory`    ТОЧКИ ОТ ПРАВИЛНИ ОТГОВОРИ on the THEORETICAL exam —
 *                  Наредба № 38, чл. 39, ал. 1. Earned, not deducted.
 *
 * „изпитни точки" is scale 1 and nothing else. Stamping it on scale 4 to clear
 * a scanner would be worse than the bare number it replaced.
 *
 * A fifth thing that is not a point at all — ГЛОБА, money, in EUR — lives in
 * `money.ts` next door.
 *
 * ===========================================================================
 * ADR-002
 * ===========================================================================
 * Nothing here is a recalled figure. The three LEGAL scales carry act
 * designations only; every NUMBER attached to them is re-cut from
 * `content/law/acts/naredba-38.json` at test time
 * (`modules/sim/rules/__tests__/point-scales.test.ts` for чл. 39,
 * `naredba-38-classification.test.ts` for приложение № 5). The one product
 * scale carries no citation and says so out loud — „оценка на симулатора, не
 * закон" is the honest label, and an invented article would be worse than none.
 */

// ---------------------------------------------------------------------------
// The scales
// ---------------------------------------------------------------------------

export type PointScaleId = "exam" | "control" | "manoeuvre" | "theory";

export interface PointScaleDef {
  readonly id: PointScaleId;
  /**
   * Qualifier that sits BETWEEN the number and „т." („10 изпитни т."), agreeing
   * with точка — feminine. Empty when the scale qualifies itself after the
   * abbreviation instead.
   */
  readonly beforeSingularBg: string;
  readonly beforePluralBg: string;
  /** Qualifier that sits AFTER „т." („2 т. за изпълнение"). Empty otherwise. */
  readonly afterBg: string;
  /** The unabbreviated noun phrase: „наказателна точка" / „наказателни точки". */
  readonly wordSingularBg: string;
  readonly wordPluralBg: string;
  /** What the scale IS, as a heading would name it. */
  readonly nameBg: string;
  /**
   * Where the scale comes from. An act + unit for the legal ones; for the one
   * this product invented, the fact that it invented it.
   */
  readonly sourceBg: string;
  /** True only for the scales a statute defines. */
  readonly isLaw: boolean;
  /** Direction — deducted (bad) or earned (good). The result screen shows both. */
  readonly direction: "deducted" | "earned";
  /**
   * One sentence a surface can print under the number: what it is, how big the
   * scale is, and — because this is the reading everyone makes — what it is not.
   */
  readonly noteBg: string;
}

/** The act + unit behind every наказателна точка, without a clause letter. */
export const EXAM_SCALE_SOURCE_BG = "Наредба № 38, приложение № 5, т. 10";

/** The licence budget's act. The figures themselves live in `consequences.ts`. */
export const CONTROL_SCALE_SOURCE_BG = "Наредба № Iз-2539";

/**
 * The theoretical exam's own article. The FIGURES it sets (45 / 97 / 87 / 40
 * min for кат. В и В1) are below, and are re-cut from the ingested act by the
 * point-scales suite rather than typed here twice.
 */
export const THEORY_SCALE_SOURCE_BG = "Наредба № 38, чл. 39, ал. 1";

/**
 * The manoeuvre rubric's per-criterion ceiling — the `0 | 1 | 2` of
 * `lessons/scenario/types.ts RubricBreakdownLine.points`. Named here rather
 * than typed as a literal into the result screen so the denominator a student
 * reads cannot drift from the union that produces the numerator;
 * `modules/sim/rules/__tests__/point-scales.test.ts` holds the two together at
 * compile time.
 */
export const MANOEUVRE_MAX_PER_LINE = 2;

export const POINT_SCALES: Record<PointScaleId, PointScaleDef> = {
  exam: {
    id: "exam",
    beforeSingularBg: "изпитна",
    beforePluralBg: "изпитни",
    afterBg: "",
    wordSingularBg: "наказателна точка",
    wordPluralBg: "наказателни точки",
    nameBg: "наказателни (изпитни) точки",
    sourceBg: EXAM_SCALE_SOURCE_BG,
    isLaw: true,
    direction: "deducted",
    noteBg:
      "Наказателни (изпитни) точки от листа на практическия изпит по Наредба № 38 — оценка на това каране и нищо друго. НЕ са контролни точки по книжката.",
  },
  control: {
    id: "control",
    beforeSingularBg: "контролна",
    beforePluralBg: "контролни",
    afterBg: "",
    wordSingularBg: "контролна точка",
    wordPluralBg: "контролни точки",
    nameBg: "контролни точки по книжката",
    sourceBg: CONTROL_SCALE_SOURCE_BG,
    isLaw: true,
    direction: "deducted",
    noteBg:
      "Контролни точки по книжката (Наредба № Iз-2539) — отнемат се само за нарушение на пътя, влязло в сила. Симулаторът не отнема контролни точки; той само показва какво би струвало на пътя.",
  },
  manoeuvre: {
    id: "manoeuvre",
    beforeSingularBg: "",
    beforePluralBg: "",
    afterBg: "за изпълнение",
    wordSingularBg: "точка за изпълнение",
    wordPluralBg: "точки за изпълнение",
    nameBg: "точки за изпълнение на маневрата",
    sourceBg: "оценка на симулатора — не е закон",
    isLaw: false,
    direction: "earned",
    noteBg:
      "Точки за изпълнение — оценка на симулатора за качеството на маневрата, по 0–2 за всеки показател. Тук точките се ПЕЧЕЛЯТ (2 е най-доброто) — обратно на наказателните. Не са наказателни точки по Наредба № 38 и не са контролни точки по книжката.",
  },
  theory: {
    id: "theory",
    beforeSingularBg: "",
    beforePluralBg: "",
    /*
     * „3 т. по теорията", not „3 т. от правилни отговори".
     *
     * The act's own noun phrase is the latter (see `wordPluralBg`), and it is
     * what a heading and a note say. The INLINE abbreviation stays „по
     * теорията" for two reasons: it is the form already shipped and
     * photographed on the sim's micro-quiz chip, where the student first meets
     * this counter, and one phrase for one counter across both halves of the
     * product is the whole point of having a vocabulary. The same split as
     * scale 1, which renders „10 изпитни т." under the heading „наказателни
     * (изпитни) точки".
     */
    afterBg: "по теорията",
    wordSingularBg: "точка от правилен отговор",
    wordPluralBg: "точки от правилни отговори",
    nameBg: "точки от правилни отговори на теоретичния изпит",
    sourceBg: THEORY_SCALE_SOURCE_BG,
    /*
     * LAW, and this is the correction. The sim lane declared this scale
     * `isLaw: false` with no citation, which is true of the per-question WEIGHT
     * (see THEORY_QUESTION_WEIGHT_NOTE_BG) and false of the scale: чл. 39,
     * ал. 1 sets the 45 questions, the ceiling of 97 and the pass mark of 87
     * for категории В и В1 in the наредба's own sentence.
     */
    isLaw: true,
    direction: "earned",
    noteBg:
      "Толкова тежи този въпрос на ТЕОРЕТИЧНИЯ изпит. Печели се с верен отговор и няма нищо общо с наказателните точки от карането, нито с контролните точки по книжката.",
  },
};

// ---------------------------------------------------------------------------
// The one way to write a scored number down
// ---------------------------------------------------------------------------

function joinBg(parts: readonly string[]): string {
  return parts.filter((p) => p !== "").join(" ");
}

/**
 * „1 изпитна т." / „10 изпитни т." — точка is feminine, so the qualifier has to
 * agree, and it does not agree just because the noun is abbreviated. „−1
 * изпитни т." reads as a machine talking; this product's whole claim is that it
 * reads as an instructor.
 */
export function pointsLabelBg(n: number, adjSingular: string, adjPlural: string): string {
  return joinBg([String(n), n === 1 ? adjSingular : adjPlural, "т."]);
}

/** THE formatter. „10 изпитни т.", „2 т. за изпълнение", „3 т. по теорията". */
export function pointsBg(scale: PointScaleId, n: number): string {
  const s = POINT_SCALES[scale];
  return joinBg([String(n), n === 1 ? s.beforeSingularBg : s.beforePluralBg, "т.", s.afterBg]);
}

/** The same, spelled out for a headline: „10 наказателни точки". */
export function pointsWordsBg(scale: PointScaleId, n: number): string {
  const s = POINT_SCALES[scale];
  return `${n} ${n === 1 ? s.wordSingularBg : s.wordPluralBg}`;
}

/** A deduction, with the true minus sign: „−10 изпитни т.". */
export function minusPointsBg(scale: PointScaleId, n: number): string {
  return `−${pointsBg(scale, n)}`;
}

/** A score against its ceiling: „4 / 9 изпитни т.", „1 / 2 т. за изпълнение". */
export function pointsOutOfBg(scale: PointScaleId, n: number, max: number): string {
  const s = POINT_SCALES[scale];
  return joinBg([`${n} / ${max}`, max === 1 ? s.beforeSingularBg : s.beforePluralBg, "т.", s.afterBg]);
}

/** A tariff rather than a tally: „по 10 изпитни т.". */
export function pointsEachBg(scale: PointScaleId, n: number): string {
  return `по ${pointsBg(scale, n)}`;
}

/**
 * The scale's noun phrase with NO number in it — „изпитни точки", „контролни
 * точки", „точки за изпълнение", „точки по теорията".
 *
 * For a column heading, a `<dt>`, a caption under a fraction: the places where
 * the number is already on screen in its own element and repeating it inside
 * the label would print it twice. It is deliberately the SHORT phrase, agreeing
 * with the inline abbreviation the same surface uses („97 · точки по теорията"
 * over „97 · т. по теорията"), and not `nameBg`, which is the long formal
 * designation a note or a legend spells out.
 *
 * Six labels on the theory-exam screens were reading „точки максимум", „точки
 * за успех", „Загубени точки" — bare „точки", which to a Bulgarian is
 * КОНТРОЛНИ точки, i.e. exactly the founder's misreading with the abbreviation
 * spelled out. A helper, not six hand-written strings, for the same reason
 * `pointsBg` exists.
 */
export function pointsScaleLabelBg(scale: PointScaleId): string {
  const s = POINT_SCALES[scale];
  return joinBg([s.beforePluralBg, "точки", s.afterBg]);
}

/**
 * Контролни точки in a column too narrow for the word. The abbreviation is only
 * ever legible under a „Книжка" header — `pointsBg("control", n)` is the
 * default and this is the exception, kept here so there is still exactly one
 * place that writes контролни точки down.
 */
export function controlPointsTightBg(n: number): string {
  return `${n} к.т.`;
}

// ---------------------------------------------------------------------------
// The theoretical exam — the scale the /exams screens count in
// ---------------------------------------------------------------------------

/**
 * Наредба № 38, чл. 39, ал. 1 — VERBATIM, кат. В и В1.
 *
 * Every number the mock exam is built on is in this one sentence, which is why
 * it is quoted rather than paraphrased: `point-scales.test.ts` re-cuts it from
 * `content/law/acts/naredba-38.json` on every run and compares it to
 * `modules/exam`'s constants, so an amendment moves the exam or turns the suite
 * red. It cannot do neither.
 */
export const THEORY_EXAM_RULE_BG =
  "Тестовете за провеждане на теоретичните изпити на кандидатите за придобиване на правоспособност за управление на МПС от категории В и В1 съдържат 45 въпроса. Максималният брой точки, от правилни отговори на всички изпитни въпроси, е 97. Теоретичният изпит е успешно положен, когато кандидатът има не по-малко от 87 точки.";

/** чл. 39, ал. 10 — the clock, verbatim as far as it concerns ал. 1. */
export const THEORY_EXAM_TIME_RULE_BG =
  "За решаване на изпитния тест по ал. 1, 3, 5 и 8 на кандидатите се предоставят 40 минути";

/** The ref to print beside the quote above. */
export const THEORY_EXAM_TIME_SOURCE_BG = "Наредба № 38, чл. 39, ал. 10";

/**
 * WHERE THE 1 / 2 / 3 IS NOT.
 *
 * The наредба sets the total and the threshold; it does not enumerate what an
 * individual question weighs. чл. 38, ал. 1 hands that to the изпълнителен
 * директор of ИААА, who approves the questions themselves. So the product may
 * say a question is worth 3 and may say where that power comes from — it may
 * not cite a наредба clause for the number 3, because there is not one. ADR-002:
 * show the rule and the article, never invent the figure.
 */
export const THEORY_QUESTION_WEIGHT_NOTE_BG =
  "Тежестта на отделния въпрос (1, 2 или 3) идва от изпитните въпроси, утвърдени от изпълнителния директор на ИААА (Наредба № 38, чл. 38, ал. 1) — самата наредба не изброява тежести.";

/** The article that delegates the question set, for the note above. */
export const THEORY_QUESTION_WEIGHT_SOURCE_BG = "Наредба № 38, чл. 38, ал. 1";

/**
 * The sentence that answers the founder's misreading, in the theory exam's own
 * words. The sim's in-drive form is `EXAM_POINTS_SHORT_NOTE_BG` over in
 * `modules/sim/rules/scales.ts`; this is the one for a screen whose every
 * number is on scale 4.
 *
 * It has to rule out BOTH of the other point systems, not just the licence: on
 * this product „изпитни точки" already means the practical sheet, so a student
 * who has driven a lesson has a second wrong answer available to him.
 */
export const THEORY_EXAM_SCORE_NOTE_BG =
  "Точки от правилни отговори на теоретичния изпит (Наредба № 38, чл. 39, ал. 1): 97 максимум, изпитът е издържан при не по-малко от 87. Печелят се с верен отговор. НЕ са контролни точки по книжката и НЕ са наказателните (изпитни) точки от практическия изпит.";

/** The same thing in one line, for a surface with room for a sentence and not a paragraph. */
export const THEORY_EXAM_SHORT_NOTE_BG =
  "Точки от правилни отговори на теоретичния изпит (Наредба № 38, чл. 39, ал. 1). НЕ са контролни точки по книжката.";
