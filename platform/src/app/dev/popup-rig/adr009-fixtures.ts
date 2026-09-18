/**
 * =============================================================================
 * ADR-009 PHONE-FIT FIXTURES — the states, and nothing but the states.
 * (doc 92 §7 lane P · founder Ruling A, 2026-09-17)
 * =============================================================================
 *
 * WHY THIS FILE EXISTS. ADR-009 adds or rewrites eleven Bulgarian strings
 * across five surfaces, and when this lane opened, NOT ONE of them had been
 * photographed. Lane F's verifier put the position plainly: it measured its
 * lane's longest new strings at 71, 77 and 92 characters against a ~48-char
 * budget and then wrote «I looked at no frame and make no claim». A character
 * count is not a fit measurement — it cannot see a `line-clamp`, a flex row
 * that will not wrap, or an authored briefing step pushed under a card's
 * bottom edge — so this lane builds the states and looks at them.
 *
 * ── NOTHING HERE IS TYPED. EVERY STRING IS COMPILED OR RETRIEVED. ───────────
 *
 * The first version of this file DID type three of them, and its own docblock
 * said it had not. `ROUNDABOUT_BRIEFING` claimed to be `sc-rb-lane-choice`'s
 * authored briefing «copied from templates-roundabout.ts»; none of its five
 * strings existed in any template, it was 247 characters against the real
 * 920, and it told the student to hold the RIGHT lane in the drill whose
 * whole subject is taking the INNER lane to the third exit. The rig was
 * photographing a briefing the product cannot print, and measuring the rule
 * line against a quarter of the text it will actually land under.
 *
 * So provenance is no longer a promise in a comment. The briefings, the target
 * codes, the rubric and the debrief on every fixture below come out of
 * `compileScenario` / `scoreRubric` / `buildDebrief` — the same three calls
 * `LessonPlayShell` and `actions.ts` make — and the act copy, the verdict
 * words, the stake sentences and the calibration reveal come out of the
 * catalogue and the pure modules that own them. A string this file cannot
 * obtain from the product is a string this file does not draw: `mustCompile`,
 * `mustTargets` and `mustRubricSpec` throw rather than degrade, because a rig
 * that quietly falls back to a placeholder photographs «fits» about text nobody
 * will ever read. `__tests__/adr009-rig.test.ts §2` holds the rule from the
 * other side: after comments are stripped this file contains no Cyrillic at
 * all, so a hand-typed sentence coming back is a red test and not a docblock
 * that has quietly stopped being true.
 *
 * The only prose written in this lane is the rig's own section headings, in
 * `Adr009Gallery.tsx` — chrome on a dev page, never a product surface.
 *
 * ── THE FOUR LESSONS, AND WHY EACH ONE IS HERE ──────────────────────────────
 *
 * Measured 2026-09-18 by compiling all 808 authored rungs and ranking the
 * 403 that carry a rule line (`lessonMistakeRuleBg !== null`):
 *
 *   sc-vu-pass-clearance@L3   1 target  — doc 92 §5.3's own worked example
 *   sc-rb-lane-choice@L3      4 targets — the corpus's ONLY four-target shape
 *                             (set sizes {0:405, 1:260, 2:120, 3:19, 4:4});
 *                             therefore the longest «Не е взет» note, the
 *                             tallest reason block and the longest rule line
 *                             (178 ch) the product can produce. 5 steps/920 ch.
 *   sc-rb-lane-choice@L5      the same four targets with the L5 complication
 *                             step in front: 6 steps / 1 347 ch + the 178-ch
 *                             rule — the worst case the rule line's own
 *                             lesson can put under it.
 *   sc-ov-crest-curve@L5      8 steps / 1 739 ch — the LONGEST authored
 *                             briefing in the corpus among rungs that carry a
 *                             rule line, on any measure that counts characters.
 *   sc-merge-roadworks-shift@L5  8 steps / 1 520 ch, and the only one of the
 *                             four whose rubric has a quality component, so it
 *                             is the rung that actually renders
 *                             `NO_QUALITY_MEASURED_LESSON_MISTAKE_BG`.
 *   sc-ac-truck-spray@L3      10 steps / 662 ch — the longest by STEP COUNT,
 *                             kept because the fold counter counts steps.
 *
 * Steps and characters rank differently (truck-spray is 1st by steps and 41st
 * by characters), and the column's cap is a height in pixels — so both axes
 * are on a frame and neither is called «the worst case» on its own.
 */

import {
  buildDebrief,
  compileScenario,
  lessonMistakeCopy,
  lessonMistakeNamesBg,
  scenarioById,
  scoreRubric,
  teachChipBg,
  teachStakeBg,
  lessonMistakeTargetCodes,
} from "@/modules/sim/lessons";
import type {
  LessonMistakeHit,
  LessonResult,
  LessonSpec,
  RubricScore,
  ScenarioLevel,
  TeachMoment,
} from "@/modules/sim/lessons";
import {
  EXAM_POINTS_SHORT_NOTE_BG,
  buildSessionSummary,
  makeViolation,
  type ViolationCode,
} from "@/modules/sim/rules";
import { teachMomentPeekBg } from "@/components/sim/lesson-ui/LessonPlayShell";
import type { SimOverlayItem } from "@/modules/sim/hud";
/**
 * DEEP IMPORT, for the reason `CalibrationGate.tsx:31-34` gives in its own
 * header: `@/modules/learning`'s barrel reaches `readiness.ts` → `store.ts` →
 * `lib/db.ts` → Prisma, so importing the calibration copy through it drags the
 * learning module's SERVER half into this client bundle (measured: the route
 * 500s on `Can't resolve 'dns'` from `pg`). `calibration.ts` is a leaf with no
 * imports of its own, which is why the gate reaches for it the same way.
 */
import {
  calibrationError,
  calibrationRevealCopy,
  classifyCalibration,
  verdictAgrees,
  type CalibrationRecord,
} from "@/modules/learning/calibration";
import type { CalibrationReveal } from "@/components/sim/lesson-ui/CalibrationGate";
import type { SessionHistoryEntry } from "@/app/(dashboard)/simulator/session-history";
import { historyLessonMistakeRowFields } from "@/app/(dashboard)/simulator/historyLessonMistakes";
import { historyMistakeGroups } from "@/app/(dashboard)/simulator/historyMistakes";

// ---------------------------------------------------------------------------
// 0. RETRIEVAL, WITH NO QUIET FALLBACK
// ---------------------------------------------------------------------------

/**
 * A compiled rung, or a thrown error naming the rung.
 *
 * The fallback a rig must never have is the reassuring one. If a template is
 * renamed or a rung stops compiling, a `?? SOMETHING` here would draw a card
 * with placeholder text on it and the frame would still be filed as «fits» —
 * which is precisely the defect this lane was opened to remove. A dev page
 * that throws is read in one second; a dev page that lies is read in a report.
 */
function mustCompile(scenarioId: string, level: ScenarioLevel): LessonSpec {
  const spec = scenarioById(scenarioId);
  if (spec === undefined) {
    throw new Error(`adr009 rig: no scenario template "${scenarioId}"`);
  }
  return compileScenario(spec, level);
}

/** The rung's ADR-009 targets, in authored order — or a thrown error. */
function mustTargets(lesson: LessonSpec, label: string): readonly ViolationCode[] {
  const targets = lessonMistakeTargetCodes(lesson);
  if (targets === null || targets.size === 0) {
    throw new Error(`adr009 rig: ${label} carries no lessonMistakeTargets`);
  }
  return [...targets.values()].map((t) => t.code as ViolationCode);
}

/** The template's rubric — the same object `LessonPlayShell` scores against
 *  (`scenarioSpec.rubric`, shell :5332), not the compiled rung's copy. */
function mustRubricSpec(scenarioId: string): NonNullable<
  ReturnType<typeof scenarioById>
>["rubric"] {
  const spec = scenarioById(scenarioId);
  if (spec === undefined || spec.rubric === undefined) {
    throw new Error(`adr009 rig: "${scenarioId}" has no rubric to score`);
  }
  return spec.rubric;
}

// ---------------------------------------------------------------------------
// 1. THE LESSONS
// ---------------------------------------------------------------------------

/** doc 92 §5.3's worked example — one target. */
export const PASS_CLEARANCE_L3 = mustCompile("sc-vu-pass-clearance", 3);
/** The corpus's only four-target lesson; §5.10's worst rule line lives here. */
export const LANE_CHOICE_L3 = mustCompile("sc-rb-lane-choice", 3);
/** …and its own hardest rung: the L5 complication step in front of the five. */
export const LANE_CHOICE_L5 = mustCompile("sc-rb-lane-choice", 5);
/** The longest authored briefing by CHARACTERS among rungs with a rule line. */
export const CREST_CURVE_L5 = mustCompile("sc-ov-crest-curve", 5);
/** The longest with a rubric that measures something — see §5.6/§5.7 below. */
export const ROADWORKS_SHIFT_L5 = mustCompile("sc-merge-roadworks-shift", 5);
/** The longest by STEPS (10) — the axis the fold counter counts in. */
export const TRUCK_SPRAY_L3 = mustCompile("sc-ac-truck-spray", 3);

/** `VULNERABLE_PASS_TOO_CLOSE`, read off the compiler rather than typed. */
export const ONE_CODE: ViolationCode = mustTargets(
  PASS_CLEARANCE_L3,
  "sc-vu-pass-clearance@L3",
)[0];

/** The four, read off the compiler rather than typed. */
export const FOUR_CODES: readonly ViolationCode[] = mustTargets(
  LANE_CHOICE_L3,
  "sc-rb-lane-choice@L3",
);

/** The rubric the four-target fixtures score against (`parTimeSec` only). */
export const LANE_CHOICE_RUBRIC_SPEC = mustRubricSpec("sc-rb-lane-choice");
/** …and the one with a quality component, which abstains — see §5.6. */
export const ROADWORKS_SHIFT_RUBRIC_SPEC = mustRubricSpec("sc-merge-roadworks-shift");

// ---------------------------------------------------------------------------
// 2. RESULTS
// ---------------------------------------------------------------------------

/**
 * One hit, with its title RETRIEVED rather than typed.
 *
 * `lessonMistakeCopy` is the same retrieval the result screen, the debrief and
 * the history row all run, so a fixture built through it cannot drift from the
 * three surfaces it is standing in for. It returns null only for a code the
 * catalogue no longer carries; these five are catalogued, and the `?? code`
 * tail exists so a future catalogue rename degrades to a visible code on the
 * frame instead of an empty string that photographs as «fits».
 */
function hit(
  code: ViolationCode,
  t: number,
  charged: boolean,
  demoTitleBg?: string,
): LessonMistakeHit {
  const copy = lessonMistakeCopy({ code, t });
  return {
    code,
    t,
    charged,
    titleBg: copy?.titleBg ?? code,
    ...(demoTitleBg === undefined ? {} : { demoTitleBg }),
  };
}

/**
 * The FOUR sheet states a drive with a hit can be in, and where they come from.
 *
 * `sheetEvents` is the list `buildSessionSummary` folds, i.e. the изпитен лист
 * itself — never a hard-coded `score`. Doc 92's own census of the 2 434
 * authored drives splits them:
 *
 *   clean      558 drives — 0 т., the ordinary «Не е взет» (133 route
 *              finished, 425 not: `lessonMistakeVerdictNoteBg` closes on a
 *              different clause on each side of that split).
 *   charged     the repeat that reached the лист. Two occurrences of one
 *              target = 2 × 3 т. = 6 т., well inside the 9 the лист allows, so
 *              the verdict is still «Не е взет» and `sheetStandingBg` takes its
 *              SECOND branch («6 наказателни точки — в допустимото по изпитния
 *              лист»). That branch had never been on a frame.
 *   failed      96 drives (25+25+25+21 by rung, Σ `rungs.*.mistake.failHit` in
 *              docs/simulation/adr-009/prototype-after-census.json), 68 of them
 *              with a charged COLLISION (doc 92 §5.8) — the ONE state where the
 *              end screen («Неиздържан») and the history row could disagree.
 *              A per-LESSON count for this state is deliberately not quoted: no
 *              committed artefact carries one (`auditRows` is a 58-row sample),
 *              and a figure a reader cannot reproduce is the defect this round
 *              was called to remove.
 *   aborted     the student quit with the hit already committed.
 */
export type SheetState = "clean" | "charged" | "failed" | "aborted";

function sheetEvents(state: SheetState, codes: readonly ViolationCode[]) {
  switch (state) {
    case "charged":
      // The SAME act twice: the first is free (Ruling A), the repeat is
      // charged and is what the лист records. 2 × 3 т. = 6 т. — in допустимото.
      return [makeViolation(codes[0], 64.2), makeViolation(codes[0], 121.6)];
    case "failed":
      // 68 of the 96 struck something, and it is the COLLISION that is charged,
      // not the hit: 10 т. on its own, `summary.passed` false, which is what
      // makes this «Неиздържан» while the lesson's own act is still on its
      // FIRST, free occurrence. The hits therefore stay uncharged here — an
      // earlier draft put a repeat on this drive too and the engine dropped it,
      // because `buildSessionSummary` stops scoring after a collision (the
      // exam terminates): the hit would have claimed «повторението ѝ влезе в
      // изпитния лист» over a sheet that never recorded it. MEASURED: collision
      // at 64.2 then the repeat at 121.6 scores 10, not 13.
      return [makeViolation("COLLISION" as ViolationCode, 64.2)];
    case "clean":
    case "aborted":
      return [];
  }
}

/**
 * A practice drive of THIS rung, with the lesson's own mistakes on it.
 *
 * It takes the LESSON and not a code list, because everything the fixture needs
 * is already on the rung: the target codes, the demo title the fold stamps on
 * the hit (`lessonMistake.ts:240` — `earliest.target.demoTitleBg`, the author's
 * own name for the act when exactly one demo cites the code) and the lesson id.
 * The first version of this file typed the demo title by hand; the reason it no
 * longer does is the same reason `ROUNDABOUT_BRIEFING` had to go.
 *
 * `passed` is stated as the engine computes it (`engine.ts buildLessonResult`:
 * the AND that now carries `lessonMistakes.length === 0`) rather than
 * hard-coded, so a fixture cannot outlive the rule.
 */
export function notTakenResult(
  lesson: LessonSpec,
  opts: { completedAll: boolean; sheet?: SheetState },
): LessonResult {
  const targets = lesson.lessonMistakeTargets ?? [];
  if (targets.length === 0) {
    throw new Error(`adr009 rig: "${lesson.id}" carries no lessonMistakeTargets`);
  }
  const sheet = opts.sheet ?? "clean";
  const codes = targets.map((t) => t.code as ViolationCode);
  const summary = buildSessionSummary(sheetEvents(sheet, codes));
  const aborted = sheet === "aborted";
  const hits = targets.map((t, i) =>
    hit(t.code as ViolationCode, 20.9 + i * 27.4, sheet === "charged" && i === 0, t.demoTitleBg),
  );
  return {
    lessonId: lesson.id,
    summary,
    objectives: [],
    completedAll: opts.completedAll,
    aborted,
    passed: summary.passed && opts.completedAll && !aborted && hits.length === 0,
    score: summary.score.totalPoints,
    effectiveScore: summary.score.totalPoints,
    escalations: [],
    durationSec: 212,
    lessonMistakes: hits,
  };
}

/** The stars and the breakdown, scored by the product's own scorer. */
export function rubricFor(
  result: LessonResult,
  spec: typeof LANE_CHOICE_RUBRIC_SPEC,
): RubricScore {
  if (spec === undefined) throw new Error("adr009 rig: rubricFor got no rubric spec");
  return scoreRubric(result, spec);
}

/**
 * The debrief text, built by `buildDebrief` exactly as `actions.ts:335` builds
 * the stored one. Passing `debriefText={null}` — which this rig used to do —
 * switches off §5.6's whole branch, so the sentence ADR-009 adds to the debrief
 * was on none of the frames.
 */
export function debriefTextFor(lesson: LessonSpec, result: LessonResult): string {
  return buildDebrief(lesson, result).text;
}

// ---------------------------------------------------------------------------
// 3. THE TEACH MOMENT — four kinds, two surfaces
// ---------------------------------------------------------------------------

/**
 * The FOUR teach-card kinds (doc 92 §5.5), each as the engine stamps it.
 *
 * `lessonMistake` and `charged` are the only two inputs `teachStakeKind` reads,
 * so these four moments are the complete state space of the card — not a
 * selection from it. The act itself is the same on all four on purpose: the
 * thing being compared is the STAKE SENTENCE and the header, and changing the
 * act underneath them would put a different explanation in every frame.
 */
export function teachMoments(): Record<
  "freeFirst" | "lessonFirst" | "lessonCharged" | "charged",
  TeachMoment
> {
  const base = (code: ViolationCode, t: number): TeachMoment => {
    const event = makeViolation(code, t);
    return {
      code,
      scenarioId: null,
      titleBg: event.titleBg,
      explanationBg: event.explanationBg,
      lawRef: event.lawRef,
      severity: event.severityClass,
      points: event.points,
      t,
    };
  };
  return {
    freeFirst: base(ONE_CODE, 21.9),
    lessonFirst: { ...base(ONE_CODE, 21.9), lessonMistake: true },
    lessonCharged: { ...base(ONE_CODE, 64.2), lessonMistake: true, charged: true },
    charged: { ...base(ONE_CODE, 64.2), charged: true },
  };
}

/**
 * THE PHONE'S ONLY TEACH SURFACE, built the way the shell builds it.
 *
 * `TeachMomentOverlay` is the ROOMY card — the shell renders it behind
 * `{!compact && …}` (`LessonPlayShell.tsx:8761`) — so on a phone the whole of
 * what a student is told at the moment of the mistake is this notification
 * (`LessonPlayShell.tsx:6289-6336`). It is the surface that carried the
 * forbidden «Първа среща — не се брои в резултата» over the lesson's own
 * mistake, lane E's verifier filed that as a live THEO-4 defect, and lane G
 * wired the fix while this rig's first set of frames was being taken — so the
 * repaired surface was photographed by nobody.
 *
 * EVERY FIELD IS THE SHELL'S OWN EXPRESSION, copied as an expression and not as
 * a result: `teachChipBg`, `teachStakeBg(..., { citeMark: true })`,
 * `teachMomentPeekBg` and `EXAM_POINTS_SHORT_NOTE_BG`, in the shell's order and
 * with the shell's two `\n\n` joins. A rig that re-composed this string would
 * be measuring its own sentence.
 */
export function teachNotificationItems(): Record<
  "freeFirst" | "lessonFirst" | "lessonCharged" | "charged",
  SimOverlayItem
> {
  const moments = teachMoments();
  const item = (m: TeachMoment): SimOverlayItem => ({
    id: `teach:${m.code}:${m.t}`,
    kind: "teach",
    tone: "teach",
    chipBg: teachChipBg(m),
    lineBg: m.titleBg,
    detailBg: `${m.explanationBg}\n\n${teachStakeBg(m, { citeMark: true })}\n\n${EXAM_POINTS_SHORT_NOTE_BG}`,
    peekBg: teachMomentPeekBg(m.code),
    lawRef: m.lawRef ?? null,
    blocking: true,
    onAck: () => undefined,
  });
  return {
    freeFirst: item(moments.freeFirst),
    lessonFirst: item(moments.lessonFirst),
    lessonCharged: item(moments.lessonCharged),
    charged: item(moments.charged),
  };
}

// ---------------------------------------------------------------------------
// 4. HISTORY
// ---------------------------------------------------------------------------

/**
 * A history row for a drive with the lesson's own mistake on it.
 *
 * The four ADR-009 fields come from `historyLessonMistakeRowFields`, which is
 * the SAME call `page.tsx` spreads into every row — not from
 * `historyLessonMistakeView` directly. That matters for the failed-sheet row:
 * the corner's «gravest charged fault OR the lesson's act» decision lives in
 * the wrapper, and a rig that called the fold underneath it would photograph
 * the corner the product does not choose.
 */
export function notTakenHistoryEntry(
  lesson: LessonSpec,
  opts: { sheet: SheetState },
): SessionHistoryEntry {
  const charged = opts.sheet === "charged";
  const sheetPassed = opts.sheet !== "failed";
  const aborted = opts.sheet === "aborted";
  const rows = (lesson.lessonMistakeTargets ?? []).map((t, i) => ({
    code: t.code as ViolationCode,
    t: 20.9 + i * 27.4,
    charged: charged && i === 0,
  }));
  const result = notTakenResult(lesson, { completedAll: true, sheet: opts.sheet });
  // The charged faults GROUPED, and the corner's argument, both as
  // `page.tsx:232/257` derive them: `historyMistakeGroups(ev.ruleEvents)` and
  // then `mistakes[0].titleBg`. Null on a clean sheet — nothing was charged,
  // which is the whole reason this row's corner had to change.
  const groups = historyMistakeGroups(result.summary.mistakes);
  const fields = historyLessonMistakeRowFields(
    { lessonMistakes: rows, aborted, sheetPassed },
    groups.length > 0 ? groups[0].titleBg : null,
  );
  return {
    id: "rig-adr009-row",
    // `compile.ts:1396` builds exactly this string, and `page.tsx:221-228`
    // rebuilds it per rung for the history title map — so the row's own title is
    // the compiled lesson's, not a shortened hand-typed one.
    lessonTitleBg: lesson.titleBg,
    finishedAtIso: "2026-09-18T09:12:00.000Z",
    passed: false,
    aborted,
    terminated: result.summary.terminated,
    score: result.score,
    effectiveScore: result.effectiveScore,
    mistakeCount: groups.reduce((n, g) => n + g.count, 0),
    nearMissCount: 0,
    mistakes: groups,
    debrief: null,
    payloadUnreadable: false,
    ...fields,
  };
}

// ---------------------------------------------------------------------------
// 5. CALIBRATION
// ---------------------------------------------------------------------------

/**
 * The reveal half of the calibration gate, composed the way the server action
 * composes it.
 *
 * `calibration-actions.ts:116-127` builds this object out of four pure calls —
 * `classifyCalibration`, `calibrationError`, `verdictAgrees` and
 * `calibrationRevealCopy` — and the last of those is «the one place that
 * decides what the reveal says». The rig's first version typed `titleBg` and
 * `bodyBg` by hand, and got one of them wrong in the way that matters least
 * and proves most: «Беше по-строг към себе си» against the real «Беше по-строг
 * към себе си ОТ ИЗПИТА». A fit measurement taken on a shorter sentence than
 * the product prints is not a measurement.
 */
export function calibrationRevealFor(input: {
  predictedPoints: number;
  predictedPass: boolean;
  actualPoints: number;
  actualPass: boolean;
}): CalibrationReveal {
  const record: CalibrationRecord = {
    simSessionId: "rig-adr009",
    lessonId: "rig-adr009",
    predictedPoints: input.predictedPoints,
    predictedPass: input.predictedPass,
    actualPoints: input.actualPoints,
    actualPass: input.actualPass,
    recordedAt: new Date("2026-09-18T09:12:00.000Z"),
  };
  const copy = calibrationRevealCopy(record);
  return {
    predictedPoints: record.predictedPoints,
    predictedPass: record.predictedPass,
    actualPoints: record.actualPoints,
    actualPass: record.actualPass,
    errorPoints: calibrationError(record),
    verdict: classifyCalibration(record),
    verdictAgreed: verdictAgrees(record),
    titleBg: copy.titleBg,
    bodyBg: copy.bodyBg,
  };
}

/**
 * §5.9's names clause, from the same helper the end screen's note uses.
 *
 * The gate takes `{ namesBg, one }` and composes the rest itself; `namesBg` is
 * `lessonMistakeNamesBg(hits)` at every live call site, so it is that here too.
 * At four hits the form is «„…“, „…“ и още 2» (78 ch) — a shape the hand-typed
 * fixture never reached, because it only ever listed one and two.
 */
export function calibrationNamesFor(codes: readonly ViolationCode[]): {
  namesBg: string;
  one: boolean;
} {
  const hits = codes.map((code, i) => hit(code, 20.9 + i * 27.4, false));
  return { namesBg: lessonMistakeNamesBg(hits), one: hits.length === 1 };
}
