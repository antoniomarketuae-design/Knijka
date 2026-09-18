/**
 * ADR-009 — A PRACTICE LESSON IS NOT TAKEN WHEN THE STUDENT COMMITS THE MISTAKE
 * IT EXISTS TO TEACH (founder Ruling A, 2026-09-17).
 *
 * Full spec: `docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md`; the decision
 * itself is ADR-009 in `docs/architecture/07_ARCHITECTURE_DECISION_RECORDS.md`.
 *
 * THE RULING, IN ONE PARAGRAPH. Park on the bus stop in the lesson about where
 * you may stop, and the lesson is not taken — the first time, and even though
 * the изпитен лист takes NO points for that first occurrence. The two halves
 * are not in tension: teach-first is why the student was shown a card instead
 * of a fine, and «не е взет» is why the tick did not become the goal. The exam
 * rung (L4 / `examMode`) is untouched, byte for byte, because ADR-009 is a
 * LESSON rule and not an exam rule — a practical exam in Bulgaria is scored on
 * Наредба № 38 and nothing this file does may change that number.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT IS PURE. Four things had to be said
 * in exactly one place each, and each of them had already been said twice
 * somewhere in this codebase before a lane noticed:
 *
 *  1. WHEN THE RULE APPLIES (`lessonMistakeTargetCodes`). The exam exemption is
 *     a founder ruling; stated per consumer it would have drifted in four of
 *     the five readers (engine regrade guard, coach flag, cap reserve,
 *     first-card bypass, the fold).
 *  2. WHAT HAPPENED (`foldLessonMistakes`). The client folds it in
 *     `engine.ts buildLessonResult`; the server folds it in
 *     `wire.ts gradeFinishWire`. Two implementations of one verdict is how the
 *     stored row starts disagreeing with the screen that produced it — the
 *     shape `escalation.ts` documents at length, twice.
 *  3. WHAT IT IS CALLED (`lessonMistakeCopy`, `lessonMistakeNamesBg`). Every
 *     name is RETRIEVED from the rules catalogue, act-aware first and pooled
 *     second (ADR-002). Nothing here writes a legal sentence or an article
 *     number: the only citation any of these strings carries comes out of
 *     `examMarkCitationBg`, which is cut from `n38.ts`.
 *  4. WHAT THE TEACH CARD SAYS (`teachStake*`). THREE sites print that stake
 *     sentence independently today — the compact card, the roomy card and the
 *     phone notification — and all three print «Първа среща — не се брои в
 *     резултата» unconditionally, INCLUDING on the L1 pause-on-error arm where
 *     the points had just been taken. One helper fixes that lie once and keeps
 *     the untouched case byte-identical (see `TEACH STAKE` below).
 *
 * THEO-4 (requirement zero): nothing here returns a bare verdict. «Урокът не се
 * зачита» never travels without the act that caused it and what to do instead.
 */

import type { LessonMistakeTarget, LessonSpec } from "../contracts";
import {
  VIOLATIONS,
  actCopy,
  examMarkCitationBg,
  makeViolation,
  minusPointsBg,
  violationPeekBg,
  type ScorableEvent,
  type ViolationCode,
} from "../rules";
import type { CoachedMistake, LessonMistakeHit, TeachMoment } from "./types";

/**
 * Ceiling on a rung's derived target set — a derivation guard, not a product
 * limit. The measured maximum is 4 (`sc-rb-lane-choice` L1/L2/L3/L5, doc 92
 * §2.2); a rung that suddenly wants nine has a derivation bug, and a reason
 * block naming nine acts is not a reason a seventeen-year-old can act on.
 *
 * WHO ENFORCES IT: `lessons/scenario/lessonMistakeTargets.ts`
 * `deriveLessonMistakeTargets`, which throws a `ScenarioCompileError` naming
 * every code rather than truncating — a silently truncated target set is a
 * lesson quietly opting half-way out of ADR-009. THIS MODULE DOES NOT CHECK IT:
 * `lessonMistakeTargetCodes` below reads whatever the compiler wrote and will
 * return nine if nine ever reach it, which is why the cap lives at the only
 * place that can refuse the lesson instead of degrading it.
 *
 * (History, because this block has been wrong in both directions: it first
 * claimed the derivation asserted the cap while lane B was unbuilt; it was then
 * corrected to «a number, not a guard, and nothing enforces it», which lane B's
 * landing made false in the other direction. The local test mirrors the literal
 * so the two files cannot drift apart on the value.)
 */
export const MAX_LESSON_MISTAKE_TARGETS = 8;

/** The chip a target teach card wears beside its header (doc 92 §5.5). */
export const LESSON_MISTAKE_CHIP_BG = "урокът не се зачита";

/**
 * The fields of a `LessonSpec` this module reads. A `LessonSpec` satisfies it,
 * and so does a hand-built object in a test — which matters, because the
 * applicability rule is the one thing here that MUST be exercised without
 * compiling a whole scenario.
 */
export type LessonMistakeLesson = Pick<
  LessonSpec,
  "lessonMistakeTargets" | "examMode" | "mistakeExperience"
>;

// ---------------------------------------------------------------------------
// 1. WHEN THE RULE APPLIES
// ---------------------------------------------------------------------------

/**
 * THE APPLICABILITY RULE — the only place it is written.
 *
 * `null` means «ADR-009 does not apply to this session», and every caller must
 * read that as today's behaviour rather than as an empty target list, because
 * the two differ in the engine: a session with no targets still runs the
 * ordinary teach-first path, and a session the rule does not apply to must not
 * even consult it.
 *
 * The two exemptions are both rulings, not conveniences:
 *  - `examMode` — founder Ruling A exempts the exam rung explicitly. Doc 92 §9
 *    (pass criterion 5) records 488 L4 drives graded identically on `passed`,
 *    stars, points, fault codes and coached codes. ⚠ THAT FIGURE IS
 *    PROTOTYPE-MEASURED AND NOT REPRODUCIBLE IN THIS REPO: it comes from
 *    `rev/proto`, a scratch worktree the reviser patched, and the instrument
 *    doc 92 §9 names — `tools/audit/lesson-mistake-census.mjs` — is lane H's
 *    unbuilt work and does not exist at HEAD. Cite it as doc 92 §9 says it, not
 *    as something a reader here can re-run.
 *  - `mistakeExperience` — the THEO-3 sandbox („Направи грешката"), where the
 *    mistake IS the assignment. Failing a student for doing what the product
 *    just asked him to do would be the same defect with the sign flipped.
 *
 * A Map, not a Set, because every consumer that asks «is this code a target»
 * also wants the target's `demoTitleBg` in the same breath.
 */
export function lessonMistakeTargetCodes(
  lesson: LessonMistakeLesson,
): ReadonlyMap<string, LessonMistakeTarget> | null {
  if (lesson.examMode === true) return null;
  if (lesson.mistakeExperience !== undefined) return null;
  const targets = lesson.lessonMistakeTargets;
  if (targets === undefined || targets.length === 0) return null;
  return new Map(targets.map((t) => [t.code, t]));
}

// ---------------------------------------------------------------------------
// 2. WHAT HAPPENED — the one fold, run on both sides
// ---------------------------------------------------------------------------

/** Only catalogued codes have a title, a corrective or a concept to retrieve. */
function isCataloguedCode(code: string): code is ViolationCode {
  return code in VIOLATIONS;
}

/**
 * The retrieved title for one occurrence: the ACT's own string where the
 * catalogue authors one for this `detail`, the pooled row otherwise — the same
 * two-step, in the same order, that `makeViolation` runs for a charged event.
 * An uncatalogued code keeps whatever the record already carried, which is how
 * a future code reaches a screen as itself instead of as an empty string.
 */
function retrievedTitleBg(code: string, detail: string | undefined, fallbackBg: string): string {
  if (!isCataloguedCode(code)) return fallbackBg;
  return actCopy(code, detail)?.titleBg ?? VIOLATIONS[code].titleBg;
}

/**
 * THE VERDICT FOLD — client (`engine.ts buildLessonResult`) and server
 * (`wire.ts gradeFinishWire`) both call THIS, over the same two records.
 *
 * `events` is the charged ledger and `coached` is the half the score
 * deliberately did not charge (see `CoachedMistake`'s header on why that
 * channel had to exist at all). Under ADR-009 the lesson's own mistake is
 * normally in the SECOND list — its first occurrence is always taught and
 * always free — so a fold that read only the ledger would have found nothing
 * on the very drives the ruling is about.
 *
 * ONE ROW PER CODE, and the two halves of that row come from DIFFERENT places:
 *  - `t` and `detail` come from the EARLIEST occurrence, because that is the
 *    moment the student was taught at, and the reason block must name the act
 *    the card named;
 *  - `charged` is a property of the whole episode list, not of the earliest
 *    row — «some occurrence reached the изпитен лист» is exactly what the
 *    repeat sentence claims, and the earliest occurrence is precisely the one
 *    that was NOT charged on a target (it was taught). Reading `charged` off
 *    the earliest row would therefore say «не влиза в наказателните точки» on
 *    a drive where the repeat had just cost three of them.
 *
 * WHY IT COLLECTS BEFORE IT REDUCES, rather than merging as it walks. The
 * merging form needed an `if (charged) existing.charged = true` line that,
 * given events-before-coached order, could only ever run in a state where it
 * changed nothing — a dead line inside the one function this whole ADR turns
 * on. Collecting first makes the OR structural: it is `rows.some(…)`, and no
 * input order can make that mean something else.
 *
 * Ties (an equal `t` in both records) keep the FIRST-LISTED occurrence, and
 * events are collected before coached — so a charged occurrence's act wins a
 * tie. Stated because it is the only input-order dependence left in this
 * function, and a fold whose output depends on array order without saying so
 * is a parity bug waiting for the server to build its lists differently.
 *
 * Sorted by `(t, code)`: stable, and the order the student met them in.
 */
export function foldLessonMistakes(
  lesson: LessonMistakeLesson,
  events: readonly ScorableEvent[],
  coached: readonly CoachedMistake[],
): LessonMistakeHit[] {
  const targets = lessonMistakeTargetCodes(lesson);
  if (targets === null) return [];

  /** One occurrence of one target code, from either record. */
  interface Occurrence {
    target: LessonMistakeTarget;
    t: number;
    detail: string | undefined;
    /** It reached the изпитен лист (a charged ledger event). */
    charged: boolean;
    /** The record's own title — used only for an uncatalogued code. */
    titleBg: string;
  }

  const byCode = new Map<string, Occurrence[]>();
  const collect = (occurrence: Occurrence): void => {
    const rows = byCode.get(occurrence.target.code);
    if (rows === undefined) byCode.set(occurrence.target.code, [occurrence]);
    else rows.push(occurrence);
  };

  for (const e of events) {
    if (e.kind !== "violation") continue;
    const target = targets.get(e.code);
    if (target === undefined) continue;
    collect({ target, t: e.t, detail: e.detail, charged: true, titleBg: e.titleBg });
  }
  for (const c of coached) {
    const target = targets.get(c.code);
    if (target === undefined) continue;
    collect({ target, t: c.t, detail: c.detail, charged: false, titleBg: c.titleBg });
  }

  const hits: LessonMistakeHit[] = [];
  for (const [code, rows] of byCode) {
    const earliest = rows.reduce((a, b) => (b.t < a.t ? b : a));
    const hit: LessonMistakeHit = {
      code,
      t: earliest.t,
      charged: rows.some((r) => r.charged),
      titleBg: retrievedTitleBg(code, earliest.detail, earliest.titleBg),
    };
    if (earliest.detail !== undefined) hit.detail = earliest.detail;
    if (earliest.target.demoTitleBg !== undefined) hit.demoTitleBg = earliest.target.demoTitleBg;
    hits.push(hit);
  }

  return hits.sort((a, b) => a.t - b.t || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

// ---------------------------------------------------------------------------
// 3. WHAT IT IS CALLED — retrieval only (ADR-002)
// ---------------------------------------------------------------------------

/**
 * Everything a surface needs to EXPLAIN one hit, all of it retrieved.
 *
 * NARROWER THAN THE SPEC'S SKETCH ON THREE FIELDS, deliberately (doc 92 §3.2
 * writes all three as `string | null`). `ViolationSpec.correctiveBg`,
 * `ViolationSpec.peekBg` and `ViolationEvent.lawRef` are REQUIRED at HEAD — tsc
 * refuses a catalogue row without a corrective or a peek, and `makeViolation`
 * always resolves a `lawRef` — so a nullable declaration here would send every
 * consuming lane a guard that can never fire. That is the dead-predicate shape
 * this programme measured 51 times in 82 repairs, and a reader who sees
 * `| null` reasonably concludes it happens.
 *
 * ⚠ `peekBg` WAS DECLARED `string | null` UNTIL 2026-09-18, AND THAT IS THE
 * DEFECT THIS PARAGRAPH EXISTS TO RECORD. The block above used to end «the two
 * that ARE nullable say so and mean it» while `peekBg` was one of them: lane
 * A's adversarial verifier measured that all 58 catalogue codes resolve a
 * non-null peek (re-measured on this tree 2026-09-18 — 0 null, 0 empty), so
 * this file was shipping the very shape its own sentence rejects, two lines
 * under the sentence. The narrowing is a TYPE fact and not a
 * today's-data fact: `ViolationSpec.peekBg` stopped being optional on
 * 2026-09-11 (`rules/catalog.ts:130-152`, after `sc-roundabout-entry: fe081cf1`
 * kept being re-filed against cut phone cards), so tsc now refuses a row
 * without one. `violationPeekBg` still declares `string | null` for that
 * history; this module reconciles it once, at the single call site below,
 * rather than handing an unreachable null to five consuming lanes.
 *
 * ONE FIELD IS GENUINELY NULLABLE, and it is measured rather than assumed:
 * `conceptId` is absent on 3 of the 58 codes (FOLLOWING_TOO_CLOSE,
 * NOT_KEEPING_RIGHT, POOR_LANE_KEEPING — measured 2026-09-18), so a consumer's
 * `if (conceptId === null)` really does run and the debrief really does render a
 * hit with no theory chip. THE WHOLE SET is pinned by this module's test, not
 * merely one member of it: until 2026-09-18 this sentence said «pinned» while
 * the test asserted `toContain("POOR_LANE_KEEPING")` and `length > 0`, and a
 * verifier swapped the set for a different one with all 50 tests still green.
 * A code gaining or losing a `conceptId` now reds that case on purpose — it
 * changes whether a consuming lane's null branch can run at all.
 */
export interface LessonMistakeCopy {
  titleBg: string;
  explanationBg: string;
  /** „какво трябваше да направя" — required on every catalogue row. */
  correctiveBg: string;
  lawRef: string;
  /** The one line a phone card can finish — required on every catalogue row. */
  peekBg: string;
  /** content/concepts.json link; `null` on the 3 codes that author none. */
  conceptId: string | null;
}

/**
 * The catalogue copy for one hit — RETRIEVED, never composed (ADR-002).
 *
 * Takes only `(code, detail)` on purpose: the history row stores exactly that
 * (doc 92 §5.8) and must retitle from the catalogue at render time rather than
 * trusting a title a browser sent months ago.
 *
 * `null` FOR AN UNCATALOGUED CODE, and that is the honest answer rather than a
 * hole. A stored drive can name a code a later catalogue no longer carries;
 * a caller that gets `null` drops the row, exactly as `debrief.ts
 * correctiveFor` and `wire.ts`'s coached-row rebuild already do. Returning a
 * stub with an empty title would put a blank bullet under «Грешката на този
 * урок» instead — a bare verdict with nothing to learn from, which is the one
 * thing THEO-4 forbids.
 */
export function lessonMistakeCopy(hit: {
  code: string;
  t: number;
  detail?: string;
}): LessonMistakeCopy | null {
  if (!isCataloguedCode(hit.code)) return null;
  const code = hit.code;
  const event = makeViolation(code, hit.t, hit.detail !== undefined ? { detail: hit.detail } : {});
  const spec = VIOLATIONS[code];
  return {
    titleBg: event.titleBg,
    explanationBg: event.explanationBg,
    correctiveBg: spec.correctiveBg,
    lawRef: event.lawRef,
    // Act-then-pool, the same order as the title: `violationPeekBg` prefers the
    // ACT's own summary where `PER_ACT_COPY` authors one for this `detail`.
    // Measured 2026-09-18: 6 codes author one across 15 acts, and all 15 say
    // something the pooled line does not — «Ставаш втори ред на платното.» on
    // ILLEGAL_STOP_IN_BAN_ZONE/law-alongside against the pooled «Спрялата кола
    // закрива видимостта.». On a card with room for ONE line that is the whole
    // reason, so the detail may not be dropped here.
    //
    // `?? spec.peekBg` IS A TYPE RECONCILIATION, NOT A FALLBACK. `spec.peekBg`
    // is exactly the string `violationPeekBg` returns when no act copy matches,
    // and it is a required field, so the branch is unreachable — written here
    // once rather than passed on as a `| null` every consuming lane would have
    // to guard. The interface header above has the history.
    peekBg: violationPeekBg(code, hit.detail) ?? spec.peekBg,
    conceptId: spec.conceptId ?? null,
  };
}

/**
 * The concepts the hits touch, in hit order, de-duplicated.
 *
 * The debrief puts these FIRST in its `conceptIds` union (doc 92 §5.6.9), so
 * the theory link a student is offered after a not-taken lesson is the theory
 * for the act that cost it — not whichever incidental code happened to be
 * charged as well.
 */
export function lessonMistakeConceptIds(hits: readonly { code: string }[]): string[] {
  const out: string[] = [];
  for (const hit of hits) {
    if (!isCataloguedCode(hit.code)) continue;
    const conceptId = VIOLATIONS[hit.code].conceptId;
    if (conceptId === undefined || out.includes(conceptId)) continue;
    out.push(conceptId);
  }
  return out;
}

/** „A“ — the quoting every other surface in this product uses for an act. */
function quoted(titleBg: string): string {
  return `„${titleBg}“`;
}

/**
 * The hits as a phrase a sentence can take: „A“ · „A“ и „B“ · „A“, „B“ и още N.
 *
 * IT STOPS AT TWO NAMES DELIBERATELY. This phrase is substituted into running
 * prose — the verdict note, the debrief headline, the calibration reveal line —
 * and those sentences are already at the phone's budget with one act in them.
 * Four titles spelled out would push the sentence off the glass, and a reason a
 * student cannot read is not a reason. The full list is always one surface away:
 * the reason block and the debrief's «Грешката на този урок» section print every
 * hit with its explanation and its corrective.
 *
 * Empty input returns an empty string — the callers all guard on
 * `hits.length > 0` before composing a sentence, and a placeholder here would
 * only make a missing guard render as prose.
 */
export function lessonMistakeNamesBg(hits: readonly { titleBg: string }[]): string {
  if (hits.length === 0) return "";
  if (hits.length === 1) return quoted(hits[0].titleBg);
  if (hits.length === 2) return `${quoted(hits[0].titleBg)} и ${quoted(hits[1].titleBg)}`;
  return `${quoted(hits[0].titleBg)}, ${quoted(hits[1].titleBg)} и още ${hits.length - 2}`;
}

/**
 * THE RULE, BEFORE THE DRIVE (doc 92 §5.10; rendered by the shell, lane G).
 *
 * WHY IT IS NOT OPTIONAL. THEO-4 as this codebase already reads it calls
 * grading against an unstated threshold a bare verdict
 * (`lessons/scenario/compile.ts:384-405`). Many targets are stand-in detectors
 * — HARSH_BRAKING_NO_CAUSE stands in for «паническо спиране» in 13 lessons —
 * and no student can guess from the briefing that a panic stop is the one act
 * that costs this particular lesson. So the lesson says it first, in its own
 * words, before he starts: the rule, not the verdict.
 *
 * POOLED titles, not act-aware: a target is a CODE, and no act has happened
 * yet. Every code is named — unlike `lessonMistakeNamesBg`, which shortens a
 * list of things that already happened — because this line is the only place
 * the student is warned, and «и още 2» warns him about nothing. The measured
 * worst case is 4 codes (`sc-rb-lane-choice`); if the line then will not fit
 * the phone briefing, founder question F3 decides where it goes and NOTHING
 * ships until it is answered (doc 92 §13) — authored briefing steps are not
 * shortened to make room.
 *
 * `null` when ADR-009 does not apply or the rung has no targets: no line, and
 * the briefing renders exactly as it does today.
 */
export function lessonMistakeRuleBg(lesson: LessonMistakeLesson): string | null {
  const targets = lessonMistakeTargetCodes(lesson);
  if (targets === null) return null;
  const names = [...targets.values()]
    .map((t) => (isCataloguedCode(t.code) ? quoted(VIOLATIONS[t.code].titleBg) : null))
    .filter((n): n is string => n !== null);
  if (names.length === 0) return null;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} или ${names[names.length - 1]}`;
  return `Урокът не се зачита, ако допуснеш ${list} — дори веднъж.`;
}

// ---------------------------------------------------------------------------
// 4. TEACH STAKE — the sentence the card prints at the moment of the mistake
// ---------------------------------------------------------------------------

/**
 * Which of the four stake sentences this moment gets.
 *
 * `free-first` is today's card and the reason this helper exists: the other
 * three are new sentences, and `free-first` must stay BYTE-IDENTICAL at all
 * three sites it is printed at, or every existing teach card in the product
 * changes wording the day lane E adopts the helper. Pinned by
 * `__tests__/lessonMistake.test.ts` against the literals copied out of
 * `TeachMomentOverlay.tsx` and `LessonPlayShell.tsx`.
 *
 * `charged` without `lessonMistake` is not a new case — it is the L1
 * pause-on-error arm, where the card has always claimed «не се брои в
 * резултата» over points it had just taken.
 */
export type TeachStakeKind = "free-first" | "lesson-first" | "lesson-charged" | "charged";

export function teachStakeKind(
  m: Pick<TeachMoment, "lessonMistake" | "charged">,
): TeachStakeKind {
  if (m.lessonMistake === true) return m.charged === true ? "lesson-charged" : "lesson-first";
  return m.charged === true ? "charged" : "free-first";
}

/** One run of stake text; `strong` renders as `<strong>` at every site. */
export interface StakeSegment {
  text: string;
  strong?: true;
}

/** The fields of a `TeachMoment` the stake sentence reads. */
export type TeachStakeMoment = Pick<
  TeachMoment,
  "points" | "severity" | "lessonMistake" | "charged"
>;

export interface TeachStakeOptions {
  /**
   * Print «по Наредба № 38 приложение № 5, т. 10, б. „в“» after the mark. The
   * compact card and the phone notification do; the ROOMY card does not,
   * because it already prints the same citation as its own «оценка:» chip
   * (`TeachMomentOverlay.tsx:519-521`) and a card citing one clause twice reads
   * as two rules.
   */
  citeMark: boolean;
  /**
   * «(опасна грешка)» — the class in words, supplied by the caller because the
   * label map lives on the card (`TeachMomentOverlay.tsx SEVERITY_LABEL`) and
   * duplicating it here is how two surfaces start naming one class differently.
   * Omitted by the PHONE notification, which has never printed it: its chip row
   * carries the class already.
   */
  severityLabelBg?: string;
}

/**
 * The repeat cost, as the three existing sites compose it: the mark, then the
 * class in brackets where the caller asked for it, then the clause where the
 * caller asked for that. `minusPointsBg("exam", …)` names its own scale —
 * a bare „−10 т." is the founder's photographed defect, read as his licence.
 */
function markSegments(m: TeachStakeMoment, opts: TeachStakeOptions): StakeSegment[] {
  const sev = opts.severityLabelBg === undefined ? "" : ` (${opts.severityLabelBg})`;
  const cite = opts.citeMark ? ` по ${examMarkCitationBg(m.severity)}` : "";
  return [{ text: minusPointsBg("exam", m.points), strong: true }, { text: `${sev}${cite}` }];
}

/** «, а повторните грешки тежат още повече (×1.5 / ×2.0).» — the ladder tail. */
const LADDER_TAIL = ", а повторните грешки тежат още повече (×1.5 / ×2.0).";

/**
 * THE ONE SOURCE for the stake sentence at all three sites (doc 92 §5.5).
 *
 * The four sentences, and why each says what it says:
 *
 *  - `free-first` — unchanged, byte for byte. The first encounter really is
 *    free and really does not touch the result.
 *  - `lesson-first` — «урокът няма да се зачете, дори да е първа среща», and
 *    the next clause is what keeps it honest: «В наказателните точки не влиза».
 *    That sentence is now true WITHOUT EXCEPTION, because the continuing-breach
 *    re-bill of the same episode is dropped for a target (doc 92 §3.4b b); it
 *    would have been a lie the day a re-bill landed six seconds later.
 *  - `lesson-charged` — a charged target is always a genuine REPEAT (the first
 *    occurrence is always taught), so the card says «Отново», and the repeat
 *    DOES reach the изпитен лист (founder answer F1).
 *  - `charged` — the L1 pause arm on any code. It drops today's false «не се
 *    брои в резултата» and says where the points went.
 *
 * THEO-4: every variant names the act's consequence and the way out of it; none
 * of them is a verdict on its own. ADR-002: the only citation is
 * `examMarkCitationBg`'s, retrieved from Наредба № 38.
 */
export function teachStakeSegments(
  m: TeachStakeMoment,
  opts: TeachStakeOptions,
): StakeSegment[] {
  const mark = markSegments(m, opts);
  switch (teachStakeKind(m)) {
    case "free-first":
      return [
        { text: "Първа среща — " },
        { text: "не се брои в резултата", strong: true },
        { text: ". При повторение: " },
        ...mark,
        { text: LADDER_TAIL },
      ];
    case "lesson-first":
      return [
        { text: "Това е грешката, която този урок учи — затова " },
        { text: "урокът няма да се зачете", strong: true },
        { text: ", дори да е първа среща. В наказателните точки не влиза; при повторение: " },
        ...mark,
        { text: LADDER_TAIL },
      ];
    case "lesson-charged":
      return [
        { text: "Отново грешката, която този урок учи — " },
        { text: "урокът не се зачита", strong: true },
        { text: ". Повторението влиза в изпитния лист: " },
        ...mark,
        { text: "." },
      ];
    case "charged":
      return [{ text: "Влиза в изпитния лист: " }, ...mark, { text: LADDER_TAIL }];
  }
}

/** The same sentence as plain text — the phone notification's `detailBg`. */
export function teachStakeBg(m: TeachStakeMoment, opts: TeachStakeOptions): string {
  return teachStakeSegments(m, opts)
    .map((s) => s.text)
    .join("");
}

/**
 * The card's header label. A target moment says so in the header, because a
 * student who reads «Учебен момент» and nothing else has been told the opposite
 * of what is about to happen to his lesson.
 */
export function teachChipBg(m: Pick<TeachMoment, "lessonMistake" | "charged">): string {
  const kind = teachStakeKind(m);
  return kind === "lesson-first" || kind === "lesson-charged" ? "Грешката на урока" : "Учебен момент";
}

/**
 * The roomy card's header subline, replacing the fixed «Пауза — първа среща с
 * тази ситуация» (`TeachMomentOverlay.tsx:476`) — which was false on three of
 * the four kinds, and visible without «Повече» on all of them.
 */
export function teachSublineBg(m: Pick<TeachMoment, "lessonMistake" | "charged">): string {
  switch (teachStakeKind(m)) {
    case "free-first":
      return "Пауза — първа среща с тази ситуация";
    case "lesson-first":
      return "Пауза — грешката, която този урок учи";
    case "lesson-charged":
      return "Пауза — повторена грешка на урока";
    case "charged":
      return "Пауза — грешка, която влиза в изпитния лист";
  }
}
