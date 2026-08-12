/**
 * THE POINT-LIKE SCALES, SIM SIDE — the Наредба № 38 clause helpers, on top of
 * the shared vocabulary in `lib/content/pointScales.ts`.
 *
 * ===========================================================================
 * THE DEFECT THIS FILE CLOSES
 * ===========================================================================
 * The founder drove the simulator, went deliberately over the limit, and read
 * „−10 т." as his DRIVING LICENCE being docked. He is right to: in Bulgarian,
 * unqualified „точки" means КОНТРОЛНИ точки — the 39-point licence budget —
 * and „т." on its own names nothing at all.
 *
 * `consequences.ts` fixed that on the RESULT screen. It was still live on
 * thirteen other surfaces, and the worst of them is the one he meets minutes
 * EARLIER in the same drive: the teach-moment card, „При повторение: −10 т.",
 * with a chip reading only „ЗДвП чл. 21, ал. 1". Той чл. 21 sets the SPEED
 * LIMIT — it is not where the 10 comes from. The 10 comes from Наредба № 38,
 * приложение № 5, т. 10, б. „в“, and until this file existed no surface said
 * so except the one that had already been repaired by hand.
 *
 * Repairing thirteen call sites by hand would leave the fourteenth free to
 * regress, so the repair is a VOCABULARY: every scored number in the sim HUD
 * and the lesson shell is formatted through it, and
 * `__tests__/point-scales.test.ts` fails the build if a bare „т." reappears
 * anywhere in the directories it guards.
 *
 * ===========================================================================
 * WHERE THE VOCABULARY WENT, AND WHY THIS FILE STILL EXISTS
 * ===========================================================================
 * The four scales and the formatters now live in `@/lib/content/pointScales`,
 * for the reason `lib/content/money.ts` lives there: the THEORY exam prints the
 * same kind of number, `components/exam/ExamRunner.tsx` is a client component,
 * and reaching this vocabulary through `@/modules/sim/rules` would have loaded
 * the driving-rule engine into the chunk a candidate downloads to sit a written
 * test. That file's header carries the full argument.
 *
 * Everything the sim imported from here is re-exported below, so no call site
 * and no import path changed. What STAYS here is the half that is about
 * Наредба № 38's practical-exam annex — the clause letters, the tariff read off
 * the engine's own table, and the pass rule — because that is sim knowledge and
 * belongs on this side of the boundary.
 *
 * ===========================================================================
 * ADR-002
 * ===========================================================================
 * Nothing here is a recalled figure. The clause letters are inverted from
 * `n38.ts` (whose every quote is re-cut from the ingested act by
 * `__tests__/naredba-38-classification.test.ts`) rather than restated.
 */

import { pointsBg, pointsWordsBg } from "@/lib/content/pointScales";
import {
  N38_CLAUSE_CLASS,
  N38_PASS_RULE,
  N38_TERMINATION_CITATION,
  N38_TERMINATION_RULE,
} from "./n38";
import { SEVERITY_POINTS, type SeverityClass } from "./types";

/**
 * The shared vocabulary, re-exported unchanged. `modules/sim/rules/index.ts`
 * and all fourteen repaired surfaces import these from here; the move must be
 * invisible to them.
 */
export {
  CONTROL_SCALE_SOURCE_BG,
  EXAM_SCALE_SOURCE_BG,
  MANOEUVRE_MAX_PER_LINE,
  POINT_SCALES,
  THEORY_EXAM_RULE_BG,
  THEORY_EXAM_SCORE_NOTE_BG,
  THEORY_EXAM_SHORT_NOTE_BG,
  THEORY_EXAM_TIME_RULE_BG,
  THEORY_EXAM_TIME_SOURCE_BG,
  THEORY_QUESTION_WEIGHT_NOTE_BG,
  THEORY_QUESTION_WEIGHT_SOURCE_BG,
  THEORY_SCALE_SOURCE_BG,
  controlPointsTightBg,
  minusPointsBg,
  pointsBg,
  pointsEachBg,
  pointsLabelBg,
  pointsOutOfBg,
  pointsScaleLabelBg,
  pointsWordsBg,
  type PointScaleDef,
  type PointScaleId,
} from "@/lib/content/pointScales";

// ---------------------------------------------------------------------------
// Наредба № 38, приложение № 5 — the practical sheet's own clause letters
// ---------------------------------------------------------------------------

/**
 * Наредба № 38's own clause letters, inverted from `n38.ts` rather than
 * restated, so a re-ingest that moves a class moves this with it.
 */
const CLAUSE_FOR_CLASS: Record<SeverityClass, "а" | "б" | "в"> = (() => {
  const out = {} as Record<SeverityClass, "а" | "б" | "в">;
  for (const clause of Object.keys(N38_CLAUSE_CLASS) as ("а" | "б" | "в")[]) {
    out[N38_CLAUSE_CLASS[clause]] = clause;
  }
  return out;
})();

/** „Наредба № 38 приложение № 5, т. 10, б. „в“" — the clause that sets the mark. */
export function examMarkCitationBg(severityClass: SeverityClass): string {
  return `Наредба № 38 приложение № 5, т. 10, б. „${CLAUSE_FOR_CLASS[severityClass]}“`;
}

/** т. 11, verbatim — re-exported so a surface can quote the pass rule, not paraphrase it. */
export const EXAM_PASS_RULE_BG = N38_PASS_RULE;

/** „наказателна точка" / „наказателни точки" — the exam scale, unabbreviated. */
export function examPointsWordBg(n: number): string {
  return pointsWordsBg("exam", n);
}

/**
 * The tariff for one class of fault — „10 изпитни т." — read off the engine's
 * OWN table rather than retyped. Three surfaces print the 10 / 3 / 1 tariff
 * (the exam briefing, the calibration hint, the result legend) and all three
 * had it as loose literals beside a bare „т.", so a change to the table would
 * have moved the grading and left the three explanations behind.
 */
export function examPointsForClassBg(severityClass: SeverityClass): string {
  return pointsBg("exam", SEVERITY_POINTS[severityClass]);
}

// ---------------------------------------------------------------------------
// The sentence that answers the founder's misreading
// ---------------------------------------------------------------------------

/**
 * What a surface prints under an exam mark when it has room for one line. The
 * long form (all three systems side by side) is
 * `consequences.ts EXAM_VS_CONTROL_POINTS_BG`, rendered once per result screen;
 * this is the in-drive form, where there is room for a sentence and not a
 * paragraph. The THEORY exam's equivalent is `THEORY_EXAM_SHORT_NOTE_BG`.
 */
export const EXAM_POINTS_SHORT_NOTE_BG =
  "Наказателни точки от изпитния лист по Наредба № 38 — важат за този урок. НЕ са контролни точки по книжката.";

// ---------------------------------------------------------------------------
// The sentence that answers the SECOND misreading: „и изпитът свърши?"
// ---------------------------------------------------------------------------

/**
 * WHY THIS IS A SEPARATE VOCABULARY ENTRY AND NOT A PHRASE IN THE CARD.
 *
 * A collision says two things to a student at once, and until 2026-08-10 the
 * product said them as one: „Настъпи сблъсък — реалният изпит се прекратява
 * незабавно", with a 10 beside it and no act named for either half. The number
 * and the ending are set by different provisions of the same наредба (the
 * `N38_TERMINATION_RULE` header in `n38.ts` has the full argument), and the
 * ending one is NARROWER than the sentence implied — so writing it out by hand
 * on each surface is how the over-claim spread to four of them.
 *
 * `examMarkFor()` now carries the same two facts per code, derived; these are
 * the ready-made sentences for surfaces that print prose rather than a mark.
 */

/** чл. 48, ал. 3, verbatim — quote it, never paraphrase it. */
export const EXAM_TERMINATION_RULE_BG = N38_TERMINATION_RULE;

/** „Наредба № 38, чл. 48, ал. 3". */
export const EXAM_TERMINATION_CITATION_BG = N38_TERMINATION_CITATION;

/**
 * What a ПТП costs, both halves, with both addresses — the result screen and
 * the debrief. Deliberately says „една опасна грешка": the founder's whole
 * question was whether a 10 beside a driving simulator is a running balance
 * (контролни точки are), and the answer is that it is a single mark on a single
 * sheet that exists only while the exam does.
 */
export const COLLISION_CONSEQUENCE_BG =
  `Настъпи сблъсък. Това е ЕДНА опасна грешка: ${examPointsForClassBg("opasna")} за самото деяние, ` +
  `а не сбор от много дребни (${examMarkCitationBg("opasna")}). ` +
  `И освен точките, само тази грешка спира и самия изпит (${N38_TERMINATION_CITATION}).`;

/**
 * The in-drive form, for a card with room for a line and not a paragraph.
 * Printed only where the code actually terminates (`ExamMark.terminatesExam`).
 */
export const COLLISION_TERMINATION_SHORT_BG =
  "Освен точките, сблъсъкът е и единствената грешка, която спира самия изпит: " +
  `„Практическият изпит се прекратява … при допускане на ПТП“ (${N38_TERMINATION_CITATION}).`;

/*
 * DELIBERATELY ABSENT: a short paraphrase of the pass rule. There was one here
 * and nothing used it — an unused restatement of „не повече от 9 … не повече от
 * 6" is a second copy of a statutory figure with nothing pinning it to the act,
 * which is precisely how a wrong number ships. Surfaces with room quote
 * `EXAM_PASS_RULE_BG` (т. 11, verbatim, re-cut from the act by n38.ts's own
 * test); surfaces without room say „допустими 9" next to the total, where the
 * scale is already named.
 */
