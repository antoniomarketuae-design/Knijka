"use client";

/**
 * Session-end screen — the official-style verdict after a lesson: score
 * breakdown table by severity class (опасни / основни / второстепенни, the
 * exact taxonomy of the practical exam — doc 32), pass/fail styled like the
 * mock-exam results, the mistake list with law-ref chips, the debrief text
 * and the follow-up actions.
 *
 * A15 (feedback v2): learning consolidates where the student sees WHERE it
 * happened and WHAT the right action was —
 *  - mistake map: a static MistakeMap panel (same polyline machinery as the
 *    live minimap) plotting every positioned violation severity-colored,
 *    near-misses as hollow rings, commendations as subtle dots (toggle);
 *    tapping a marker scrolls to + flashes the matching row below;
 *  - per-mistake corrective: the catalog's authored `correctiveBg` line
 *    („какво трябваше да направя") under every mistake row — ADR-002 copy,
 *    and the grounding input for the post-Alpha LLM debrief;
 *  - objective measurements: A10's ObjectiveOutcome.detail rendered on the
 *    objective rows (reaction time + band, park attempts/alignment, met red,
 *    signaled roundabout exit).
 *
 * XP chip: renders only when `xpEarned` is a number — sim lessons award no XP
 * until the gamification event union accepts sim_lesson (see lessons/types.ts).
 *
 * ---------------------------------------------------------------------------
 * DOC 86 · L15 — SKIPPABLE, AND SKIPPABLE FOR GOOD
 *
 * Founder, global item 2: „at the end of each lesson a popup window pops, which
 * is kind of annoying, we should allow users to skip it with space, so when
 * they push space to click Skip, also note them below … that it's skippable
 * with space, and also there must a button at this note to allow user to choose
 * if he wants to turn this off."
 *
 * Three things, all three here:
 *  1. SPACE (and Enter) activates Skip. Bound on the WINDOW in the CAPTURE
 *     phase with `stopPropagation`, exactly as `TeachMomentOverlay` does it and
 *     for the same reason — Space is the cabin's parking-brake toggle
 *     (`engine/input.ts:223`) and the cabin listens on the bubble phase. Safe
 *     here in a way it is not on a live toast: the shell pauses the scene the
 *     moment the session ends (`LessonPlayShell` `paused={ended || …}`).
 *  2. THE NOTE. „Space = пропусни" is rendered, right under the Skip control,
 *     not left as folklore. `SESSION_END_SKIP_HINT_BG` is its single source.
 *  3. THE SETTING, in that same note: „Не показвай автоматично" persists, and
 *     the next lesson ends with a one-line verdict bar instead of a popup.
 *
 * THEO-4 HOLDS THROUGH ALL OF IT. Skipping hides the debrief; it never
 * replaces it with a bare verdict. The bar the shell renders instead always
 * carries „Виж разбора", and this screen — the mistake list with every
 * authored `correctiveBg` and law chip — is one click behind it, unchanged.
 * Both controls are omitted entirely (`onSkip == null`) while the I1
 * calibration gate holds the result: there is nothing to skip yet.
 *
 * ── 2026-08-09 · A2's OTHER HALF: NONE OF THE ABOVE REACHED A PHONE. ────────
 * The shell passed `onSkip={!compact && …}` and this file omits BOTH the skip
 * control and the setting when `onSkip` is null — so on the 393 px screen the
 * founder reviews on, L15 rendered nothing at all. The block below is now
 * `compact`-aware instead of roomy-only:
 *   · the close control spans the phone and reads „▾ Скрий разбора" (it IS the
 *     button the shell used to draw above this screen — one control, not two);
 *   · the note beside it says how to skip in TOUCH words, because printing
 *     „Space" on a device that has no Space key is folklore, not a hint;
 *   · the setting renders, and on a phone it governs the thing that actually
 *     pops up there — the blocking end-of-session line (`LessonPlayShell`'s
 *     overlay candidate 1), which freezes the layer until „Резултат" opens the
 *     very debrief the student was trying to skip.
 * ---------------------------------------------------------------------------
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckControl } from "@/components/ui/CheckControl";
import {
  COLLISION_CONSEQUENCE_BG,
  MANOEUVRE_MAX_PER_LINE,
  POINT_SCALES,
  SEVERITY_POINTS,
  VIOLATIONS,
  billRoadConsequences,
  ledgerBilling,
  pointsBg,
  pointsEachBg,
  pointsOutOfBg,
  pointsWordsBg,
  type FailReason,
  type ViolationCode,
} from "../rules";
import {
  REACTION_BAND_LABELS_BG,
  type LessonResult,
  type ObjectiveDetail,
  type ParkAlignment,
  type RedMetVia,
  type RubricScore,
} from "../lessons";
import { FaultCard, ThreeSystemsNote } from "./FaultCard";
import {
  MistakeMap,
  type MinimapPolyline,
  type MistakeMapMarker,
} from "./Minimap";
import {
  retryCtaClass,
  scenarioCtaRow,
  type SessionEndScenarioTarget,
} from "./sessionEndCtas";
import { SESSION_END_SKIP_HINT_BG } from "./hudPreferences";

export interface SessionEndConcept {
  id: string;
  titleBg: string;
  /** Theory deep link, e.g. /theory/practice?topic=… */
  href: string;
}

/**
 * Every one of these counts НАКАЗАТЕЛНИ (изпитни) точки — Наредба № 38's exam
 * sheet — and says so, because „точки" on its own reads as контролни точки to
 * any Bulgarian driver. See FaultCard.tsx for the full ruling.
 */
const FAIL_REASON_TEXT: Record<FailReason, string> = {
  "dangerous-mistake": "допусната е опасна грешка — директно неиздържан",
  "total-points-exceeded": "повече от 9 наказателни точки от изпитния лист",
  "osnovni-points-exceeded": "повече от 6 наказателни точки от основни грешки",
};

const PARK_ALIGNMENT_LABELS: Record<ParkAlignment, string> = {
  centered: "центрирано",
  acceptable: "приемливо",
  sloppy: "неточно",
};

const NEAR_MISS_KIND_LABELS: Record<"vehicle" | "pedestrian" | "cyclist", string> = {
  vehicle: "автомобил",
  pedestrian: "пешеходец",
  cyclist: "велосипедист",
};

function clock(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = Math.floor(tSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** A15: the catalog's authored corrective action; null for unknown codes. */
function correctiveFor(code: string): string | null {
  if (!(code in VIOLATIONS)) return null;
  return VIOLATIONS[code as ViolationCode].correctiveBg;
}

/**
 * The met-red account, one sentence per SIGNATURE — never one sentence for
 * both.
 *
 * A red is met in exactly two lawful ways (lessons/types.ts · RedMetVia), and
 * they are opposite acts: one waits, one deliberately does not. This line used
 * to be rendered from `redMetHere` alone, so BOTH printed „Изчака червения
 * сигнал и потегли на зелено". On `sc-sig-controller-live` that was false on
 * every successful run without exception — the officer's wave is that
 * template's only completion path, and the bot crosses the red line at 22 km/h
 * having stopped for nothing. The student was congratulated, in words, for a
 * wait he never made.
 *
 * THEO-4 forbids answering that by printing nothing: a bare ✓ owes the student
 * the reasoning. So the регулировчик case states what he actually did AND why
 * it was right — ЗДвП чл. 7, the officer above the светофар, which is also why
 * the rule engine bills no опасна for it (rules/engine.ts: „proceed" is
 * innocent even on red).
 */
const RED_MET_TEXT_BG: Record<RedMetVia, string> = {
  waitedOutGreen: "Изчака червения сигнал и потегли на зелено",
  controllerProceed:
    "Премина на забраняващ сигнал по знака на регулировчика, без да чака зелено — по ЗДвП чл. 7 сигналите на регулировчика са над светофара, затова това е правилно, а не преминаване на червен сигнал",
};

/**
 * Replayed pre-2026-08-17 payloads recorded the boolean but not the act (see
 * wire.ts). True of both signatures, claims neither: the one honest thing left
 * to say when the record cannot say which.
 */
const RED_MET_UNRECORDED_BG = "Срещна забраняващ сигнал на това кръстовище и го премина правилно";

/* ---------------------------------------------------------------------------
 * SWEEP 161 · THREE NUMBERS THAT CONTRADICTED THE WORDS BESIDE THEM
 *
 * Each of the three was read off a drive of the shipped build, not reasoned
 * about; the frame is named at the helper that answers it. NONE of them moves a
 * number. The grading, the star fold and the XP award are all correct and all
 * stay exactly as they are — what was missing every time is the sentence that
 * ties the number to the one printed next to it, which is THEO-4's whole ask:
 * no verdict on this screen stands bare.
 * ------------------------------------------------------------------------- */

/**
 * The collision paragraph's arithmetic — supplied only when the collision is
 * NOT the whole dangerous account.
 *
 * MEASURED · sc-vu-cyclist-hook/pc/wrong · 08-debrief.png: „Настъпи сблъсък.
 * Това е ЕДНА опасна грешка: 10 изпитни т. …" printed ~35 px under a „20
 * наказателни точки" headline and ~190 px above a row reading „Опасни грешки
 * (по 10 изпитни т.) 2 20". Every figure on that frame is right, and the
 * paragraph itself is the founder's own ruling (rules/scales.ts
 * COLLISION_CONSEQUENCE_BG) — it is right ABOUT THE COLLISION. But read where
 * it sits it is the account OF THE HEADLINE, and as that account it says ten
 * while the headline says twenty.
 *
 * So the ruled copy is untouched and the missing half is supplied. The two can
 * only ever disagree when the drive carried a SECOND опасна beside the
 * collision, so that is the only case this speaks in: null otherwise, because a
 * run whose only опасна IS the collision would get a sentence that restates the
 * table and teaches nothing.
 */
export function collisionTotalReconcileBg(
  opasniCount: number,
  opasniPoints: number,
): string | null {
  if (opasniCount <= 1) return null;
  return (
    `Числото горе е за целия урок: ${opasniCount} опасни грешки ` +
    `${pointsEachBg("exam", SEVERITY_POINTS.opasna)} правят ` +
    `${pointsBg("exam", opasniPoints)} — сблъсъкът е една от тях.`
  );
}

/**
 * Why the manoeuvre grade landed where it did.
 *
 * MEASURED · sc-ed-reverse-line: a run with „0 наказателни точки · Общо
 * (допустими 9) 0" and a run with „100 наказателни точки · Опасни грешки 10
 * 100" printed the SAME „Оценка на маневрата ★☆☆" — one star, identically. Both
 * stars are arithmetically right: doc 76 §6 floors the grade at one star
 * whenever legality is in question and both of those runs were. What the card
 * never said is WHICH question, so the one score that exists to grade quality
 * of execution could not tell a flawless drive from a catastrophic one.
 *
 * THE STAR NUMBER IS NOT RECOMPUTED HERE. This reads the same four facts
 * `scoreRubric` (lessons/scenario/rubric.ts) caps on, in the order it applies
 * them, and names them. `session-end-numbers.test.tsx` drives the real
 * `scoreRubric` and fails if the two ever disagree about which runs are
 * floored — the note explaining a cap must not be able to outlive the cap.
 */
export function manoeuvreGradeReasonBg(result: LessonResult): string | null {
  const floors: string[] = [];
  // A collision IS the опасна, named precisely — printing both reads as two.
  if (result.summary.terminated) floors.push("има сблъсък");
  else if (result.summary.score.hasDangerous) floors.push("има опасна грешка");
  if (result.aborted) floors.push("урокът беше прекъснат");
  if (!result.completedAll) floors.push("остана неизпълнена задача от маршрута");
  if (floors.length > 0) {
    return (
      `Само една звезда, защото ${floors.join(", ")}. Оценката на маневрата не ` +
      `може да надскочи закона: докато това е в сила, тя стои на дъното, ` +
      `колкото и чисто да е било останалото каране.`
    );
  }
  if (result.score > 0) {
    return (
      `Най-много две звезди, защото има ${pointsWordsBg("exam", result.score)} ` +
      // „без нито една точка" would be a BARE точка, i.e. контролни точки to a
      // Bulgarian reader — the misreading this whole vocabulary exists to stop
      // (rules/__tests__/point-scales.test.ts caught it here).
      `по изпитния лист. Третата се дава само на каране без нито една наказателна точка.`
    );
  }
  // Nothing capped it. The breakdown rows below are then the explanation —
  // WHEN THERE ARE ANY. `unmeasuredStarsNoteBg` answers the case where there
  // are not; read the two together, they cover the card between them.
  return null;
}

/**
 * ★★★ WITH NOTHING BEHIND IT — the half of the star row nobody was accounting
 * for.
 *
 * MEASURED · `.audit-frames/proof/frames/sc-sp-harsh-brake__mobile-right`
 * (steered, 2026-08-22) · `_audit-debrief.json`, the „Оценка на маневрата"
 * card in full:
 *
 *   „Оценка на маневрата · оценка на симулатора — не е закон · ★★★ · Точки за
 *    изпълнение — оценка на симулатора за качеството на маневрата, по 0–2 за
 *    всеки показател … · Ориентировъчно време — 185 с при ориентир 75 с"
 *
 * That is the whole card. Three filled stars under a heading that promises an
 * opinion ON THE EXECUTION, a note promising „0–2 за всеки показател", and then
 * not one показател — the single row present is par time, which `scoreRubric`
 * marks informational and the star fold ignores by construction (doc 76 §6).
 * `sc-follow-distance__mobile-right` is byte-for-byte the same shape. THIS IS
 * THE BARE VERDICT doc 64 THEO-4 forbids, on the one card whose entire subject
 * is how well the manoeuvre was driven.
 *
 * WHY IT IS THE COMMON CASE AND NOT AN EDGE. A balanced-brace scan of
 * `lessons/scenario/templates-*.ts` finds 162 authored rubrics (the lane first
 * reported 196; recounted by the verifier — 128 is the figure that matters and
 * it is the same one doc 86 D7 reached), of which 128
 * name NO quality component at all — most are literally `rubric: { parTimeSec:
 * n }` (sc-sp-harsh-brake: 75). On every one of them `scoreRubric`'s
 * `measuredCount` is 0 and the stars fall out of `completedAll` and `score ===
 * 0`, i.e. THE ИЗПИТЕН ЛИСТ SAID A SECOND TIME under the manoeuvre's label.
 *
 * WHY THE SENTENCE HAD NOWHERE TO LIVE UNTIL NOW. `rubric.ts` already authored
 * it (`NO_QUALITY_MEASURED_BG`) and hangs it on rows that abstained — but a
 * rubric with no quality component authors no such row, so on those 128 the
 * sentence is attached to nothing and never renders. That file's own comment
 * says so and parks the half it cannot reach: a new row needs a new member in
 * `RubricBreakdownLine["id"]` (`lessons/scenario/types.ts`), and the par-time
 * row cannot carry it either — `b15-lawful-wait.test.ts` („without a wait the
 * line is byte-identical to what shipped") pins that string with an exact
 * `toBe`. NONE OF THAT IS NEEDED HERE. The sentence is not a row — it is the
 * card's account of its own star row, and the card is this file's.
 *
 * THE NUMBER IS NOT TOUCHED, AND NOTHING IS TAKEN AWAY. „Full stars from
 * cleanliness" is a stated contract (rubric.ts counts ~141 assertions behind
 * it); changing what the star scale MEANS is an ADR, not a render edit. The
 * student keeps the three stars, keeps the pass, keeps the XP. What he gains is
 * the one fact that makes them readable: they say „не наруши нищо", not
 * „изкара маневрата отлично".
 *
 * NOT WALLPAPER — it speaks only into the silence. When anything capped the
 * grade `manoeuvreGradeReasonBg` has already accounted for the number in that
 * exact slot, and a second paragraph on every failed run is noise; when a
 * quality component DID score, the rows carry their own 0–2 and their own
 * sentence. So: no cap sentence AND no scoring row.
 *
 * WHY `points !== null` AND NOT `measured`. They are not the same question and
 * the par-time row is the counter-example that matters: it reports
 * `measured: true` with `points: null`, because it WAS measured and still feeds
 * no star. `measured` would count it and silence this note on precisely the 128
 * rubrics it exists for. Every `points: 0 | 1 | 2` push in `scoreRubric` is
 * preceded by `measuredCount += 1` and no other push is, so „some line carries
 * points" is `measuredCount > 0` exactly.
 */
export function unmeasuredStarsNoteBg(
  result: LessonResult,
  rubric: RubricScore,
): string | null {
  if (manoeuvreGradeReasonBg(result) !== null) return null;
  if (rubric.breakdownBg.some((line) => line.points !== null)) return null;
  // VERIFIER, ROUND 5 — THE SENTENCE WAS FALSE ON 12 TEMPLATES, AND IT WAS THE
  // SECOND SENTENCE ON THE CARD, NOT THE FIRST.
  //
  // The two guards above ask „did anything SCORE?". The sentence below answers
  // a narrower question: „does this lesson AUTHOR a показател at all?" — and on
  // an `observation`-only rubric those come apart. `templates-merging.ts:166`
  // (sc-merge-accel-lane) authors two glance moments and no placement/economy;
  // `parkingObservationFromTrace` (scenario/observation.ts) returns null unless
  // the drive contains a reverse phase, and a motorway merge has none, so the
  // observation row abstains on EVERY drive of it: `points: null`,
  // `measured: false`. Guard 2 therefore passes and, unguarded, the card told a
  // student „този урок няма показатели … наблюдение" two lines above a row
  // headed „Наблюдение" naming „Ляво огледало…" and „Мъртва зона през рамо…".
  // Rendered and counted, not reasoned: that shape came out at TWO accounts of
  // one star row, the second of them untrue.
  //
  // And nothing was missing there to begin with. `scoreRubric` appends
  // `NO_QUALITY_MEASURED_BG` to every unmeasured row when `measuredCount` is 0,
  // and it renders — `line.detailBg` is printed by the breakdown `<li>` below.
  // A quality component that abstains ALWAYS pushes such a row (every
  // `measured: true` push in that file carries numeric points; the only
  // `measured: true` / `points: null` line in the product is par time), so a
  // rubric with any quality component already carries exactly one account.
  // This note exists for the 128 rubrics that carry NO row to hang it on.
  //
  // Census of the shipped catalogue (balanced-brace scan of
  // `lessons/scenario/templates-*.ts`): 162 authored rubrics — 128 with no
  // quality component (this note's constituency), 12 observation-only (the
  // false case above), 22 with placement/economy.
  if (rubric.breakdownBg.some((line) => line.id !== "parTime")) return null;
  return (
    `Този урок няма показатели за качество на изпълнението (точност на ` +
    `позицията, икономичност на маневрата, наблюдение), затова нито един не бе ` +
    `измерен. Звездите идват изцяло от изпитния лист — маршрут, изминат ` +
    `докрай, без нито една наказателна точка — и казват „не наруши нищо“, а не ` +
    `„изкара маневрата отлично“.`
  );
}

/* ---------------------------------------------------------------------------
 * SWEEP 161 · THE BADGE THAT CONVICTED SIX FAULTLESS DRIVES
 *
 * MEASURED · ten findings, one shape: sc-sp-curve, sc-follow-distance,
 * sc-follow-rain-gap, sc-follow-cutin, sc-follow-tailgater, sc-ov-oncoming-gap,
 * sc-ov-return-gap, sc-ov-night-gap, sc-ov-crest-curve, sc-ov-being-overtaken.
 * The frame that shows it whole is
 * `.audit-frames/sweep161/sc-ov-being-overtaken/pc-wrong/08-debrief.png`:
 * „Опасни грешки 0 0 · Основни грешки 0 0 · Второстепенни грешки 0 0 · Общо
 * (допустими 9) 0 0" — and directly above that table a red НЕИЗДЪРЖАН with NOT
 * ONE bullet beneath it, because `summary.failReasons` is empty and there is
 * nothing for `FAIL_REASON_TEXT` to print. A verdict with no evidence, on the
 * screen whose entire job is evidence. sc-ov-crest-curve records the scale:
 * 28 of 28 runs in that chunk ended НЕИЗДЪРЖАН, six of them with zero mistakes
 * and zero точки.
 *
 * NOTHING BELOW LOOSENS THE GRADE AND `result.passed` IS NOT TOUCHED. No run
 * becomes a pass, no lesson unlocks, no star is added: `passed` stays „official
 * rule AND every objective AND not aborted" (lessons/types.ts) and
 * `scenarioCtaRow` / `onNextLesson` still read exactly that. What changes is
 * that the badge stops printing the one word it had no basis for.
 *
 * НЕИЗДЪРЖАН IS A FINDING OF THE ИЗПИТЕН ЛИСТ and of nothing else — Наредба
 * № 38's sheet, decided by `summary.passed` together with `summary.failReasons`
 * (rules/summary.ts: hasDangerous · >9 общо · >6 основни). A drive that broke
 * none of those and simply never reached the end of the route has no such
 * finding against it. It is not издържан either — an unfinished lesson is not a
 * passed one, and the two warning lines already on this card („Урокът беше
 * прекъснат преди края." / „Не всички задачи от маршрута бяха изпълнени.") say
 * why. It is НЕЗАВЪРШЕН: the state the run was actually in, taking nothing the
 * student earned and granting nothing he did not.
 * ------------------------------------------------------------------------- */

/** passed · failed (the изпитен лист says so) · unfinished (nothing says so). */
export type SessionVerdict = "passed" | "failed" | "unfinished";

/**
 * The three-way read of one `LessonResult`. `result.passed` is the AND of three
 * conditions and this splits the false branch by WHICH of them failed — it
 * never re-derives any of them.
 */
export function sessionVerdict(result: LessonResult): SessionVerdict {
  if (result.passed) return "passed";
  // The изпитен лист is the only authority for „Неиздържан". When it is clean
  // the drive failed no rule; it merely stopped early — see the block above.
  return result.summary.passed ? "unfinished" : "failed";
}

export const SESSION_VERDICT_LABEL_BG: Record<SessionVerdict, string> = {
  passed: "Издържан",
  failed: "Неиздържан",
  unfinished: "Незавършен",
};

/** Warning, not danger: an unfinished run is unresolved, not condemned. */
const VERDICT_PILL_CLASS: Record<SessionVerdict, string> = {
  passed: "bg-success/15 text-success",
  failed: "bg-danger/15 text-danger",
  unfinished: "bg-warning/15 text-warning",
};

/**
 * THEO-4 on the one badge that had no explanation available to it.
 *
 * „Неиздържан" always had the `failReasons` list under it and „Издържан" needs
 * no defence; „Незавършен" is the state with nothing authored, so it gets the
 * sentence that says both halves — why it is not the one word and not the other
 * — and what to do about it. Null for the other two verdicts: they are already
 * accounted for, and a third sentence would be wallpaper.
 */
export function unfinishedVerdictNoteBg(result: LessonResult): string | null {
  if (sessionVerdict(result) !== "unfinished") return null;
  const sheetBg =
    result.score === 0
      ? "Изпитният лист остана чист"
      : `${pointsWordsBg("exam", result.score)} — в допустимото по изпитния лист`;
  /**
   * „НЯМА НАРУШЕНИЕ" WAS A CLAIM ABOUT THE DRIVE, ON THE EVIDENCE OF THE
   * SHEET. MEASURED · wave-c · `sc-signal-hesitation` · mobile · wrong
   * (04-t012s.png; finding a448e5f0): the HUD raised «Превишена скорост (+1)»
   * over a cluster reading 59 км/ч against a 50 sign — an unscored teach
   * toast, shown twice — and this sentence then told the same student «няма
   * нарушение, което да го отсъди». A 17-year-old reading both screens learns
   * that 59 in a 50 is not a violation. So the claim is scoped to the sheet
   * (which is all this function ever read), and when the result carries the
   * shown-but-not-charged record, the sentence says where those cards went
   * instead of denying them.
   */
  const coachedCount = result.coachedMistakes?.length ?? 0;
  const noConviction =
    coachedCount > 0
      ? "няма нарушение в листа, което да го отсъди — показаните по време на карането " +
        "забележки са учебни моменти и не влизат в наказателните точки (виж разбора)"
      : "няма нарушение в изпитния лист, което да го отсъди";
  return (
    `${sheetBg}, затова тук не пише „Неиздържан“: ${noConviction}. ` +
    `Не пише и „Издържан“ — зачита се само урок, изкаран докрай. ` +
    `Карай го отново и стигни до края, за да получиш оценка.`
  );
}

/**
 * The tone of the НАКАЗАТЕЛНИ-ТОЧКИ number — read off the number, never off the
 * verdict beside it.
 *
 * MEASURED · sc-lane-change/mobile-right/08-debrief.png: a 96 px „0" painted in
 * `--danger`, forty pixels above a red НЕИЗДЪРЖАН, on a drive that was cut
 * short with a spotless sheet. sc-park-gap-long/mobile-right reads the same
 * („0 наказателни точки … НЕИЗДЪРЖАН"), and sc-zebra-approach/pc-right pins the
 * other half of it: THE SAME ZERO IS GREEN THERE, because that run happened to
 * pass. One number, one meaning, two opposite colour codes between lessons.
 *
 * The cause was `result.passed ? "text-success" : "text-danger"` — the headline
 * number wearing the VERDICT's colour, so the two carried one bit between them
 * and a clean drive could not be told from a wrecked one at a glance.
 *
 * The bands are the exam sheet's own: zero is the only clean score, everything
 * up to the allowance is a warning, and past it — or with an опасна anywhere —
 * it is danger. `examSheetPassed` is `summary.passed` (rules/summary.ts), i.e.
 * the same predicate the табло's «допустими 9» row is measured against, so this
 * cannot drift green while the sheet says otherwise.
 */
export function pointsToneClass(points: number, examSheetPassed: boolean): string {
  if (points === 0) return "text-success";
  return examSheetPassed ? "text-warning" : "text-danger";
}

/**
 * What the XP chip says when the verdict directly above it disagrees with it.
 *
 * MEASURED · sc-rb-exit-signal/mobile/right · 08-debrief.png: „НЕИЗДЪРЖАН" and
 * „+40 XP" stacked ~60 px apart on one card, over a collision and zero
 * objectives met. THE AWARD IS CORRECT AND STAYS: 40 is `XP_SIM_COMPLETED` and
 * A14 pays it for finishing the drive on purpose (gamification/xp.ts — „effort
 * counts, guessing/grinding doesn't win"), which is also why an aborted session
 * is paid nothing at all and this chip never renders there. A bare „+40 XP"
 * under a red НЕИЗДЪРЖАН says none of that; it reads as a reward for the run.
 *
 * It takes the VERDICT and not a boolean since the badge became three-way: the
 * note names the word the student can see, and on
 * sc-ov-being-overtaken/pc-wrong (0 точки · 0 of 2 objectives · +40 XP) that
 * word is „Незавършен". A note that said „Неиздържан" beside a badge reading
 * „Незавършен" would be the same contradiction one line lower down.
 *
 * AND THE CHIP STOPS DRESSING AS A PRIZE. MEASURED ·
 * sc-park-van/mobile-right/08-debrief.png: the „+40 XP" pill is the same shape
 * and the same weight as the „НЕИЗДЪРЖАН" pill 45 px above it, in the accent
 * colour this product uses for the recommended action — over a collision.
 * sc-ln-turn-lane-arrows/mobile-right files it in one line: „a green reward
 * chip under a failed, crash-ending run". On a non-pass it becomes a plain
 * outlined receipt in muted ink: the same words, none of the celebration.
 */
export function xpChipBg(
  xpEarned: number,
  verdict: SessionVerdict,
): { labelBg: string; noteBg: string | null; chipClass: string } {
  if (verdict === "passed") {
    return {
      labelBg: `+${xpEarned} XP`,
      noteBg: null,
      chipClass: "bg-accent/15 text-accent",
    };
  }
  return {
    labelBg: `+${xpEarned} XP за завършеното каране`,
    noteBg:
      "XP се дава за времето зад волана, не за резултата — оценката на този " +
      `опит остава „${SESSION_VERDICT_LABEL_BG[verdict]}“.`,
    chipClass: "border border-border text-muted",
  };
}

/**
 * The I1 gate's leftover scroll offset, cleared on the element that holds it.
 *
 * `scrollIntoView` moves every scrollable ANCESTOR and, by definition, never an
 * element's OWN `scrollTop` — and this screen's root IS a scroll container
 * (`max-h-full … overflow-y-auto`, the innermost one a thumb can grab). The
 * locked and unlocked returns are both a `<div>` in the same position, so React
 * reconciles them onto the SAME DOM node and that node's `scrollTop` outlives
 * the swap. Resetting it is the half `scrollIntoView` cannot reach; the call
 * that follows is the other half, for the shell's scrim and the document.
 *
 * A parameter object rather than an effect body so the pair can be driven:
 * the suite is `environment: "node"` (vitest.config.ts) and has no DOM.
 */
export function releaseGateScroll(
  el: { scrollTop: number; scrollIntoView: (opts: ScrollIntoViewOptions) => void } | null,
): void {
  if (el === null) return;
  el.scrollTop = 0;
  el.scrollIntoView({ block: "start" });
}

/** The gate RELEASE edge — never the gate's current state. See the effect. */
export function gateReleased(wasLocked: boolean, isLocked: boolean): boolean {
  return wasLocked && !isLocked;
}

/** A10 measurement channel → one human line on the objective row. */
export function objectiveDetailText(detail: ObjectiveDetail | undefined): string | null {
  if (detail === undefined) return null;
  switch (detail.kind) {
    case "emergencyStop": {
      if (detail.reactionTimeSec !== null && detail.band !== null) {
        const gap =
          detail.stopGapM !== null ? ` · спря на ${detail.stopGapM.toFixed(1)} м` : "";
        return `Реакция: ${detail.reactionTimeSec.toFixed(2)} с — ${REACTION_BAND_LABELS_BG[detail.band]}${gap}`;
      }
      if (detail.outcome === "passedWithoutStopping") return "Подмина опасността, без да спре";
      if (detail.outcome === "hitLeadCar") return "Удар в спиращата кола отпред";
      return null;
    }
    case "parkInBay": {
      if (detail.attempts === 0) return null;
      const parts = [`${detail.attempts} ${detail.attempts === 1 ? "опит" : "опита"}`];
      if (detail.alignment !== null) {
        parts.push(`подравняване: ${PARK_ALIGNMENT_LABELS[detail.alignment]}`);
      }
      return `Паркиране: ${parts.join(" · ")}`;
    }
    case "passSignal": {
      if (!detail.redMetHere) return null;
      if (detail.redMetVia === null) return RED_MET_UNRECORDED_BG;
      return RED_MET_TEXT_BG[detail.redMetVia];
    }
    case "roundabout":
      return detail.exitSignaled ? "Излезе от кръговото с десен мигач" : null;
    case "threePointTurn": {
      if (detail.movements === 0) return null;
      return `Обратен завой: ${detail.movements} ${detail.movements === 1 ? "движение" : "движения"}`;
    }
  }
}

/**
 * Everything the map + row-linking needs, derived once from the result:
 * markers carry row keys (`v:i` mistakes, `n:i` near-misses, `c:i`
 * commendations); positions pair to events by (kind, code, t), consumed once
 * each — the exact scheme the lessons engine recorded them with.
 */
function buildMapModel(result: LessonResult) {
  const pool = new Map<string, Array<{ x: number; y: number }>>();
  for (const p of result.eventPositions ?? []) {
    const key = `${p.kind}:${p.code}@${p.t}`;
    const list = pool.get(key);
    if (list) list.push({ x: p.x, y: p.y });
    else pool.set(key, [{ x: p.x, y: p.y }]);
  }
  const take = (kind: string, code: string, t: number) =>
    pool.get(`${kind}:${code}@${t}`)?.shift() ?? null;

  const mistakeMarkers: MistakeMapMarker[] = [];
  result.summary.mistakes.forEach((m, i) => {
    const pos = take("violation", m.code, m.t);
    if (pos !== null) {
      mistakeMarkers.push({ id: `v:${i}`, x: pos.x, y: pos.y, kind: m.severityClass });
    }
  });

  const nearMissMarkers: MistakeMapMarker[] = [];
  (result.nearMisses ?? []).forEach((n, i) => {
    if (n.x !== null && n.y !== null) {
      nearMissMarkers.push({ id: `n:${i}`, x: n.x, y: n.y, kind: "nearMiss" });
    }
  });

  const commendationMarkers: MistakeMapMarker[] = [];
  result.summary.commendations.forEach((c, i) => {
    const pos = take("commendation", c.code, c.t);
    if (pos !== null) {
      commendationMarkers.push({ id: `c:${i}`, x: pos.x, y: pos.y, kind: "commendation" });
    }
  });

  return { mistakeMarkers, nearMissMarkers, commendationMarkers };
}

export function SessionEndScreen({
  lessonTitleBg,
  result,
  debriefText,
  concepts,
  xpEarned,
  onRetry,
  onExit,
  nextLessonTitleBg,
  onNextLesson,
  mapPolylines = null,
  rubric = null,
  nextScenarioLevel = null,
  nextScenarioTemplate = null,
  catalogCompleteBg = null,
  calibrationGate = null,
  calibrationLocked = false,
  myDriveHref = null,
  onSkip = null,
  autoOpen = true,
  onAutoOpenChange = null,
  compact = false,
}: {
  lessonTitleBg: string;
  result: LessonResult;
  /** null while the session is still being saved server-side. */
  debriefText: string | null;
  concepts: SessionEndConcept[];
  xpEarned: number | null;
  onRetry: () => void;
  /**
   * „Назад към таблото" (founder R3 #5/#23): leave the session back to the
   * simulator select screen — a CLIENT-SIDE exit through the shell's own
   * owner, never a route hop. The old <Link href="/dashboard"> left the
   * /simulator page entirely: any hiccup on the dashboard route (its data
   * layer has no DB fallback, unlike /simulator's) surfaced the (dashboard)
   * error boundary, and its recovery links walked the founder to the landing
   * page. The owner (simulator-client) restores the catalog anchored at the
   * just-played template instead.
   */
  onExit: () => void;
  /** Next lesson in the curriculum; null on the last lesson. */
  nextLessonTitleBg: string | null;
  /** null = next lesson locked (this attempt did not pass). */
  onNextLesson: (() => void) | null;
  /**
   * A15: district/route polylines for the static mistake map (the shell
   * hands over its last live-minimap frame — the polylines are the full
   * district, so no live vehicle is needed). null → no map panel.
   */
  mapPolylines?: MinimapPolyline[] | null;
  /**
   * S1 (doc 76 §6): the scenario rubric — stars + breakdown, rendered as an
   * ADDITIVE quality section right under the verdict (official points stay
   * the primary result). null (every curriculum lesson) = no section.
   */
  rubric?: RubricScore | null;
  /**
   * S1 (founder 2026-07-17): the two forward targets of a green scenario run
   * — one rung harder on the SAME maneuver („Следващо ниво"), and the next
   * card in the library („Следващ сценарий"). Either may be null on its own:
   * a star-locked rung (doc 76 §8) leaves `nextScenarioLevel` null while the
   * ungated next card still shows. Whenever any of them renders, „Повтори"
   * steps back to secondary. Both null on every curriculum lesson.
   */
  nextScenarioLevel?: SessionEndScenarioTarget | null;
  /** null = topped out on the last card, or the run was not green. */
  nextScenarioTemplate?: SessionEndScenarioTarget | null;
  /** End of the scenario library: a closing line instead of a dead button. */
  catalogCompleteBg?: string | null;
  /**
   * I1 „Позна ли се?" (doc 82 §5.3): the self-assessment calibration gate,
   * passed in as an opaque slot. A SLOT and not a prop bundle on purpose —
   * the gate talks to the learning module and a server action, and this screen
   * is the sim module's; keeping it a ReactNode means no new cross-module edge
   * for a widget the owner already renders.
   */
  calibrationGate?: ReactNode;
  /**
   * While true this screen renders ONLY the gate. The score, the mistake map,
   * the mistake list and the debrief must all stay UNMOUNTED — a student who
   * can already read „0 точки" is not predicting anything, and the calibration
   * error would measure nothing at all.
   */
  calibrationLocked?: boolean;
  /**
   * I2 „Твоят дубъл" (doc 82 §5.3): deep link to the replay of THIS drive.
   * null when the session did not persist a trace — there is nothing to watch,
   * and a dead link on the result screen is worse than no link.
   */
  myDriveHref?: string | null;
  /**
   * L15: close this screen without leaving the session. null → no Skip control
   * and no key binding (compact, where the debrief is already tap-to-open, and
   * while the calibration gate holds the result).
   */
  onSkip?: (() => void) | null;
  /** L15: the persisted „Показвай разбора автоматично" state. */
  autoOpen?: boolean;
  /** L15: null → the setting is not offered (same cases as `onSkip`). */
  onAutoOpenChange?: ((next: boolean) => void) | null;
  /**
   * A2: phone-shaped viewport. It changes two things and only two — the close
   * control spans the width of the phone instead of hiding in the corner as a
   * ghost link, and the note says how to skip in TOUCH words. Printing „Space"
   * on a device with no Space key is folklore, not a hint; the key binding
   * itself stays live (a compact window with a keyboard is a real case).
   */
  compact?: boolean;
}) {
  const { summary } = result;
  const score = summary.score;
  const nearMisses = result.nearMisses ?? [];

  // S1: which forward buttons exist and which one carries the accent is the
  // pure builder's call (sessionEndCtas.ts) — 0, 1 or 2 of them.
  const scenarioCtas = scenarioCtaRow(
    {
      level: nextScenarioLevel,
      template: nextScenarioTemplate,
    },
    // FR-06: a forward button after a FAILED run is an escape, not a reward —
    // the builder relabels it („Продължи напред"), adds the sentence that says
    // the lesson stays open, and leaves the accent on „Повтори".
    { passed: result.passed && result.completedAll },
  );

  // -- A15 mistake map state ---------------------------------------------------
  const [showGood, setShowGood] = useState(false);
  const [selected, setSelected] = useState<{ key: string; pulse: number } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const registerRow = (key: string) => (el: HTMLLIElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  };

  const { mistakeMarkers, nearMissMarkers, commendationMarkers } = useMemo(
    () => buildMapModel(result),
    [result],
  );

  /**
   * ONE ACT, ONE ROAD PRICE (rules/offences.ts). The list below renders one card
   * per FAULT — which is right, an examiner logs two marks for one unbelted
   * move-off — but it used to render one PRICE per fault too, so a student who
   * forgot a single belt was shown 200 лв. and 20 контролни точки. The billing
   * decides which rows carry the money; the score table above is untouched.
   */
  const roadBilling = useMemo(
    () => billRoadConsequences(summary.mistakes),
    [summary.mistakes],
  );
  /**
   * …AND THE SAME QUESTION FOR THE OTHER SCALE: which rows the ИЗПИТЕН ЛИСТ
   * charged. Наредба № 38, чл. 48, ал. 3 closes the sheet at the first
   * terminating опасна, so a fault after it is taught and not scored, and
   * `rules/scoring.ts ledgerBilling` is the per-row answer `accumulateScore`
   * itself folds — the totals in the table above and the marks on the rows
   * below therefore cannot drift apart by construction.
   *
   * MEASURED 2026-08-19, on this screen, before this line existed. `FaultCard`
   * learned the closure on 2026-08-18 but reads it from a prop that DEFAULTS TO
   * BILLED (deliberately: an unwired card must overstate a penalty, never hide
   * one), and this render site never passed it — so the fix sat in a component
   * nothing mounts directly while the screen went on printing the catalogue
   * base. The sc-hz-accident-scene squeeze (a car struck at 13.13 s, a bystander
   * at 13.43 s) rendered «−10 изпитни т.» on BOTH rows — Σ 20 — above a table
   * reading 10 and a debrief reading «без допълнителни точки — изпитът вече
   * беше прекратен» about that very row. Three surfaces, one drive, two numbers.
   * `__tests__/session-end-ledger-close.test.tsx` renders THIS screen and sums
   * the marks off the markup, because a test that renders the card alone earns
   * the green the same way it was earned the first time.
   */
  const examBilling = useMemo(() => ledgerBilling(summary.mistakes), [summary.mistakes]);
  const markers = useMemo(
    () => [
      ...mistakeMarkers,
      ...nearMissMarkers,
      ...(showGood ? commendationMarkers : []),
    ],
    [mistakeMarkers, nearMissMarkers, commendationMarkers, showGood],
  );
  const hasMap = mapPolylines !== null && mapPolylines.length > 0 && markers.length > 0;

  const selectMarker = (key: string) => {
    setSelected((prev) => ({ key, pulse: (prev?.pulse ?? 0) + 1 }));
    const row = rowRefs.current.get(key);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  /** Row classes + remount key so re-selecting restarts the flash. */
  const rowFlash = (key: string) =>
    selected?.key === key
      ? { className: "sim-end-row-flash", key: `${key}:${selected.pulse}` }
      : { className: "", key };

  // -- L15: Space/Enter = Skip ------------------------------------------------
  //
  // The handler behind a ref so the window listener has a stable identity and
  // is not torn down and re-registered by the shell's 150 ms HUD poll — the
  // same shape SimOverlay uses (`ackRef`).
  const skipRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    skipRef.current = onSkip;
  });
  const skipEnabled = onSkip !== null && !calibrationLocked;
  const skip = useCallback(() => skipRef.current?.(), []);
  useEffect(() => {
    if (!skipEnabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code !== "Space" && e.key !== "Enter") return;
      // Enter on a focused control is that control's own activation — Space on
      // one is too, and this screen is full of them (Повтори, Следващ урок…).
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA") return;
      // CAPTURE + stopPropagation: the cabin's own window listener reads Space
      // as the parking brake on the bubble phase (engine/input.ts:223).
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      skip();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [skipEnabled, skip]);

  // -- I1 RELEASE: PUT THE READER AT THE TOP OF WHAT JUST APPEARED ------------
  //
  // MEASURED · sc-rb-exit-signal/mobile/right · 08-debrief.png (852 × 393 CSS
  // px): the FIRST thing on the result screen is the bottom half of „Докосни
  // „▾ Скрий разбора“, за да пропуснеш разбора" and a sliced „Не показвай
  // автоматично" pill — rows y≈0–25 — with the 44 px control that owns them
  // entirely above the top edge. A ~64 px offset, i.e. exactly the button plus
  // the gap plus the scrim's p-4.
  //
  // NOTHING ON THIS SCREEN SCROLLED. The CALIBRATION GATE did. The gate and the
  // result are the same mounted subtree inside the shell's one scrolling scrim
  // (LessonPlayShell `data-hud="end-screen"` + playArea.ts
  // OVERLAY_SCRIM_CLASS, which carries the `overflow-y-auto`) — `calibrationLocked`
  // only swaps what this component RETURNS, the scrim never remounts — so the
  // offset a thumb needed to reach «Пропусни» at the bottom of the gate card is
  // still there when a document five times as long replaces it. That run's
  // ladder log names the gate as its last rung, and the PC leg of the same
  // sweep shows no offset at all: at 900 px the gate fits and nothing had to
  // scroll. Three facts, one mechanism.
  //
  // `scrollIntoView` on our OWN root and not a reach into the scrim: it asks
  // the browser to put THIS element at the top of whatever scrolls it, which is
  // the shell's business to change and not ours to know — and it moves the
  // document too on a layout where that is the scroller. `scroll-mt-4` on the
  // root gives back the scrim's own p-4, so the button lands where a fresh
  // mount would have put it rather than flush against the edge. A no-op
  // whenever the offset was already zero: the roomy case, and every mount that
  // did not come through the gate.
  //
  // ── 2026-08-18: THE OTHER BOX. `scrollIntoView` alone could not have cleared
  // this, and the four frames that still show the slice say so — sc-crossing-
  // dart, sc-signal-flashing, sc-ed-poligon-chain and the sc-rb-exit-signal
  // frame above, all mobile, all with «Сесията завърши — първо се самооцени» on
  // the 07-end frame before them. The root below is itself a scroll container
  // (`max-h-full … overflow-y-auto`) and it is the INNERMOST one under a thumb,
  // so it is where the gate's offset lands; `scrollIntoView` is specified to
  // move ancestors and never the element's own `scrollTop`. `releaseGateScroll`
  // does both, in that order.
  const resultRef = useRef<HTMLDivElement>(null);
  const wasCalibrationLocked = useRef(calibrationLocked);
  useEffect(() => {
    const released = gateReleased(wasCalibrationLocked.current, calibrationLocked);
    wasCalibrationLocked.current = calibrationLocked;
    if (released) releaseGateScroll(resultRef.current);
  }, [calibrationLocked]);

  // Sweep 161's three sentences, derived once each (see the helper block above).
  const collisionReconcileBg = collisionTotalReconcileBg(
    score.opasniCount,
    score.opasniPoints,
  );
  const manoeuvreReasonBg = manoeuvreGradeReasonBg(result);
  // …and the other half of the same slot: the card's account of its star row
  // when NOTHING about the manoeuvre was measured (see unmeasuredStarsNoteBg).
  // The two are mutually exclusive by construction. The THIRD account of the
  // same star row lives one file over — `scoreRubric` appends
  // `NO_QUALITY_MEASURED_BG` to an abstaining row when nothing was measured —
  // and `unmeasuredStarsNoteBg`'s last guard stands out of its way, so the card
  // carries exactly one sentence about its stars: never none, never two.
  const unmeasuredStarsBg =
    rubric !== null ? unmeasuredStarsNoteBg(result, rubric) : null;

  // The badge, and the number's tone read off the number rather than off the
  // badge — see SESSION_VERDICT_LABEL_BG and pointsToneClass.
  const verdict = sessionVerdict(result);
  const unfinishedNoteBg = unfinishedVerdictNoteBg(result);

  // The class legend. „(10 т.)" beside a headline about наказателни точки was
  // the last bare unit left on the repaired result screen, and the tariff is
  // read off the engine's own SEVERITY_POINTS rather than retyped here.
  const rows = [
    { label: "Опасни грешки", per: pointsEachBg("exam", SEVERITY_POINTS.opasna), count: score.opasniCount, points: score.opasniPoints, tone: "var(--danger)" },
    { label: "Основни грешки", per: pointsEachBg("exam", SEVERITY_POINTS.osnovna), count: score.osnovniCount, points: score.osnovniPoints, tone: "var(--warning)" },
    { label: "Второстепенни грешки", per: pointsEachBg("exam", SEVERITY_POINTS.vtorostepenna), count: score.vtorostepenniCount, points: score.vtorostepenniPoints, tone: "var(--accent-soft)" },
  ];

  // I1: the gate holds the whole screen back. Nothing below this line renders
  // until the student has predicted (or skipped) — see calibrationLocked.
  if (calibrationLocked && calibrationGate !== null) {
    return (
      <div className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-1">
        {calibrationGate}
      </div>
    );
  }

  return (
    <div
      ref={resultRef}
      // `scroll-mt-4` pairs with the effect above — see OVERLAY_SCRIM_CLASS's p-4.
      className="flex max-h-full w-full max-w-2xl scroll-mt-4 flex-col gap-4 overflow-y-auto p-1"
    >
      {/* Row-flash animation (scoped to this screen; motion-reduce = no flash). */}
      <style>{`
        @keyframes sim-end-row-flash {
          0% { background-color: color-mix(in srgb, var(--accent) 28%, transparent); }
          100% { background-color: transparent; }
        }
        .sim-end-row-flash {
          animation: sim-end-row-flash 1.4s ease-out;
          border-color: var(--accent) !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .sim-end-row-flash { animation: none; }
        }
      `}</style>

      {/* L15 — the skip control, and DIRECTLY BELOW IT the note the founder
          asked for („note them below … that it's skippable with space") with
          the opt-out button in that same note.

          At the TOP rather than under the CTAs: the debrief scrolls, and a
          „press Space" hint the student can only find after reading the thing
          they wanted to skip is not a hint. The Skip button is right-aligned
          and ghost-weight so it never competes with „Повтори" / „Следващо
          ниво" — leaving is the cheap action, not the recommended one. */}
      {skipEnabled ? (
        <div
          data-hud="end-skip"
          className={`flex flex-col gap-1 ${compact ? "items-stretch" : "items-end"}`}
        >
          <button
            type="button"
            onClick={skip}
            // A2, the phone half: on a 393 px screen a right-aligned ghost link
            // is the control the founder does not find. It becomes the full
            // width of the column and 44 px tall — the same button the shell
            // used to render above this screen, now with the note and the
            // setting attached to it, which is what he asked for.
            className={
              compact
                ? "btn-ghost h-11 w-full shrink-0 justify-center text-xs"
                : "btn-ghost px-4 py-1.5 text-xs"
            }
            aria-keyshortcuts="Space"
          >
            {compact ? "▾ Скрий разбора" : "Пропусни разбора"}
          </button>
          <p
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted ${
              compact ? "justify-center" : "justify-end"
            }`}
          >
            {compact ? (
              // No `kbd` chip: this device has no Space key. The binding above
              // is still registered — a compact window with a keyboard attached
              // is a real case — it is simply not advertised to a thumb.
              <span>Докосни „▾ Скрий разбора“, за да пропуснеш разбора</span>
            ) : (
              <span>
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold">
                  Space
                </kbd>{" "}
                {/* SESSION_END_SKIP_HINT_BG is „Space = пропусни"; the kbd chip
                    already says „Space", so only the tail is spelled out here. */}
                {SESSION_END_SKIP_HINT_BG.replace("Space = ", "")} разбора
              </span>
            )}
            {onAutoOpenChange !== null ? (
              <>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => onAutoOpenChange(!autoOpen)}
                  aria-pressed={!autoOpen}
                  className="rounded-full border border-border px-2 py-0.5 font-semibold transition hover:text-foreground motion-reduce:transition-none"
                >
                  {autoOpen ? "Не показвай автоматично" : "Показвай автоматично"}
                </button>
              </>
            ) : null}
          </p>
          {onAutoOpenChange !== null && !autoOpen ? (
            // THEO-4: switching the popup off must never cost the student the
            // explanation. Say where it went — and the two device classes put
            // it in different places, so the sentence names the right one.
            <p
              className={`text-[11px] font-semibold text-muted ${
                compact ? "text-center" : "text-right"
              }`}
            >
              {compact
                ? "Разборът вече няма да те спира — намираш го с „Резултат“ на реда или с „Виж разбора“ в менюто."
                : "Разборът вече няма да се отваря сам — ще го намираш с „Виж разбора“ в лентата след урока."}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Verdict card */}
      <section
        aria-labelledby="sim-result-title"
        className="card flex flex-col items-center gap-3 p-6"
      >
        <h2 id="sim-result-title" className="text-base font-extrabold text-muted">
          {lessonTitleBg} · резултат
        </h2>

        <p className="flex items-baseline gap-2">
          <span
            className={`text-6xl font-black tabular-nums ${pointsToneClass(
              result.score,
              summary.passed,
            )}`}
          >
            {result.score}
          </span>
          <span className="text-xl font-bold text-muted">
            {result.score === 1 ? "наказателна точка" : "наказателни точки"}
          </span>
        </p>
        {/* The unit, spelled out under the headline number. Without it „10 т."
            reads as контролни точки — the licence — which is what happened. */}
        <p className="-mt-2 text-center text-[11px] font-semibold text-muted">
          от изпитния лист по Наредба № 38 · важат за този урок · не са контролни точки по книжката
        </p>

        <p
          className={`rounded-full px-4 py-1.5 text-sm font-black uppercase tracking-wide ${VERDICT_PILL_CLASS[verdict]}`}
        >
          {SESSION_VERDICT_LABEL_BG[verdict]}
        </p>
        {/* „Незавършен" is the one badge with no authored account behind it —
            `failReasons` is empty by definition there (see the block above). */}
        {unfinishedNoteBg !== null ? (
          <p className="-mt-1 max-w-prose text-center text-xs font-semibold leading-relaxed text-warning">
            {unfinishedNoteBg}
          </p>
        ) : null}

        {/* The chip says what the XP is FOR whenever the verdict above it
            disagrees with it — see xpChipBg. */}
        {xpEarned !== null ? (
          (() => {
            const xp = xpChipBg(xpEarned, verdict);
            return (
              <>
                <p className={`rounded-full px-3 py-1 text-xs font-black ${xp.chipClass}`}>
                  {xp.labelBg}
                </p>
                {xp.noteBg !== null ? (
                  <p className="-mt-2 max-w-prose text-center text-[11px] font-semibold text-muted">
                    {xp.noteBg}
                  </p>
                ) : null}
              </>
            );
          })()
        ) : null}

        {result.aborted ? (
          <p className="text-center text-sm font-semibold text-warning">
            Урокът беше прекъснат преди края.
          </p>
        ) : null}
        {/* THE SECOND POINTS QUESTION (2026-08-10). This line used to read
            „Настъпи сблъсък — реалният изпит се прекратява незабавно." and
            nothing else: a 10 six centimetres above it, an ending asserted with
            no act behind it, and no word on whether the 10 was this one fault
            or a balance running out. All three are answered now, and the two
            halves are cited SEPARATELY because they come from separate
            provisions — приложение № 5, т. 10, б. „в“ sets the mark, чл. 48,
            ал. 3 stops the exam. See rules/n38.ts N38_TERMINATION_RULE. */}
        {summary.terminated ? (
          <p className="max-w-prose text-center text-sm font-semibold leading-relaxed text-danger">
            {COLLISION_CONSEQUENCE_BG}
            {/* …and, when the collision was not the only опасна, the arithmetic
                that reconciles „ЕДНА … 10" with the total above and the count
                below it (sweep 161 — see collisionTotalReconcileBg). */}
            {collisionReconcileBg !== null ? <> {collisionReconcileBg}</> : null}
          </p>
        ) : null}
        {!result.completedAll && !result.aborted ? (
          <p className="text-center text-sm font-semibold text-warning">
            Не всички задачи от маршрута бяха изпълнени.
          </p>
        ) : null}
        {!summary.passed && summary.failReasons.length > 0 ? (
          <ul className="text-center text-xs font-semibold text-muted">
            {summary.failReasons.map((r) => (
              <li key={r}>• {FAIL_REASON_TEXT[r]}</li>
            ))}
          </ul>
        ) : null}

        {/* Official-style breakdown table */}
        <table className="mt-2 w-full text-sm">
          <caption className="visually-hidden">
            Разбивка на наказателните точки по класове грешки
          </caption>
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th scope="col" className="py-1.5 font-bold">Клас грешка</th>
              <th scope="col" className="py-1.5 text-right font-bold">Брой</th>
              <th scope="col" className="py-1.5 text-right font-bold">Точки</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <td className="py-2 font-semibold">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: r.tone }} aria-hidden />
                  {r.label} <span className="text-xs text-muted">({r.per})</span>
                </td>
                <td className="py-2 text-right font-black tabular-nums">{r.count}</td>
                <td className="py-2 text-right font-black tabular-nums">{r.points}</td>
              </tr>
            ))}
            <tr className="border-t border-border-strong">
              <td className="py-2 font-extrabold">Общо (допустими 9)</td>
              <td className="py-2 text-right font-black tabular-nums">
                {score.opasniCount + score.osnovniCount + score.vtorostepenniCount}
              </td>
              {/* Same tone rule as the headline, on the same number — this cell
                  read red on a „0 0" row in the frames (pointsToneClass). */}
              <td className={`py-2 text-right font-black tabular-nums ${pointsToneClass(score.totalPoints, summary.passed)}`}>
                {score.totalPoints}
              </td>
            </tr>
          </tbody>
        </table>
        {/* THE TABLE IS A FLOOR, AND UNTIL THIS LINE NOTHING ON IT SAID SO.
            MEASURED · wave-c · sc-mw-min-speed · pc · right (08-debrief.png;
            finding ed5a5b84): after the t=87 crash closed the ledger the HUD
            booked four more priced cards — «−1», «−3», «−10» twice — and this
            table then read «Опасни 1/10 · Основни 0/0 · Второстепенни 0/0 ·
            Общо 1/10» with nothing reconciling the two. The scorer is right
            (Наредба № 38, чл. 48, ал. 3 withholds the rows after the close);
            the PRODUCT never explained itself, so a student — and every audit
            reading the tally — read a floor as a count. The debrief prose
            carries the same reconciliation („долна граница“); the two surfaces
            must not diverge. Agreement forked on the count for the „1
            движения“ reason. */}
        {score.unscoredAfterClose > 0 ? (
          <p className="mt-1 text-xs font-semibold text-muted">
            Таблицата е долна граница, не пълен брой: изпитът се прекратява при
            произшествието (Наредба № 38, чл. 48, ал. 3), затова{" "}
            {score.unscoredAfterClose === 1
              ? "показаното след прекратяването нарушение не добавя наказателни точки тук"
              : `показаните след прекратяването ${score.unscoredAfterClose} нарушения не добавят наказателни точки тук`}{" "}
            — всяко от тях е в списъка с грешките по-долу.
          </p>
        ) : null}
      </section>

      {/* S1: scenario rubric — the maneuver-quality layer (doc 76 §6).
          Official points above remain the verdict; stars grade HOW WELL. */}
      {rubric !== null ? (
        <section aria-label="Оценка на маневрата" className="card flex flex-col gap-2 p-5">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-extrabold">Оценка на маневрата</h3>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted">
              {POINT_SCALES.manoeuvre.sourceBg}
            </span>
            <span
              aria-label={`${rubric.stars} от 3 звезди`}
              className="ml-auto text-lg tracking-wide"
            >
              {/* HOLLOW glyph for an unearned star, not a grey filled one.
                  Colour alone carried the whole grade here: on a one-star run
                  the row's text content was „★★★", so every reader that reads
                  text rather than pixels — the audit harness's own ledger
                  included — was handed three stars for the worst drive in the
                  sweep, and a student in bright sun reads it the same way. */}
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  aria-hidden
                  style={{ color: s <= rubric.stars ? "var(--warning)" : "var(--border-strong)" }}
                >
                  {s <= rubric.stars ? "★" : "☆"}
                </span>
              ))}
            </span>
          </div>
          {/* WHY it landed there. Without this the flawless run and the
              catastrophic one print the same ★☆☆ — see manoeuvreGradeReasonBg. */}
          {manoeuvreReasonBg !== null ? (
            <p className="text-xs font-semibold leading-relaxed text-warning">
              {manoeuvreReasonBg}
            </p>
          ) : null}
          {/* …and when nothing capped it AND nothing was measured, the same
              slot says where the stars actually came from. Muted and not
              `--warning`: nothing is wrong on such a run — the student passed
              — the reading of the number is simply not what the heading above
              it advertises. See unmeasuredStarsNoteBg. */}
          {unmeasuredStarsBg !== null ? (
            <p className="text-xs font-semibold leading-relaxed text-muted">
              {unmeasuredStarsBg}
            </p>
          ) : null}
          {/* THE FOURTH SCALE, AND THE ONE A FIND-AND-REPLACE WOULD HAVE GOT
              WRONG. „1 / 2 т." sits a few centimetres under a headline reading
              „20 наказателни точки", and it is NOT the exam sheet, NOT the
              licence, and not law at all — it is this product's own quality
              grade, and it runs the OTHER WAY: 2 is the good number. Labelling
              it „изпитни точки" would have been as wrong as leaving it bare. */}
          <p className="text-[11px] leading-relaxed text-muted">
            {POINT_SCALES.manoeuvre.noteBg}
          </p>
          <ul className="flex flex-col gap-1.5">
            {rubric.breakdownBg.map((line) => (
              <li key={line.id} className="flex flex-col gap-0.5 text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{line.labelBg}</span>
                  <span className="ml-auto shrink-0 text-xs font-black tabular-nums text-muted">
                    {line.points !== null
                      ? pointsOutOfBg("manoeuvre", line.points, MANOEUVRE_MAX_PER_LINE)
                      : line.measured
                        ? "—"
                        : "не се измерва"}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted">{line.detailBg}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* A15: mistake map — WHERE it happened */}
      {hasMap ? (
        <section aria-label="Карта на грешките" className="card flex flex-col gap-2 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-extrabold">Къде се случи</h3>
            {commendationMarkers.length > 0 ? (
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted">
                {/* This one shipped with no class at all — a raw UA control on
                    the cluster palette, i.e. the worst case of the whole bug
                    class. It is also the only interactive thing in this header
                    row, so a box that reads as empty is a toggle nobody finds. */}
                <CheckControl
                  type="checkbox"
                  checked={showGood}
                  onChange={(e) => setShowGood(e.target.checked)}
                />
                Покажи и похвалите
              </label>
            ) : null}
          </div>
          <MistakeMap
            polylines={mapPolylines}
            markers={markers}
            selectedId={selected?.key ?? null}
            onSelect={selectMarker}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold text-muted">
            <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--danger)" }} />опасна</span>
            <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--warning)" }} />основна</span>
            <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent-soft)" }} />второстепенна</span>
            {nearMissMarkers.length > 0 ? (
              <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "var(--warning)" }} />на косъм</span>
            ) : null}
            {showGood ? (
              <span><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--success)" }} />похвала</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Objectives outcome */}
      {result.objectives.length > 0 ? (
        <section aria-label="Задачи от маршрута" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold">Задачи от маршрута</h3>
          <ul className="flex flex-col gap-1.5">
            {result.objectives.map((o) => {
              const detailText = objectiveDetailText(o.detail);
              return (
                <li key={o.id} className="flex flex-col gap-0.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black"
                      style={
                        o.done
                          ? { background: "var(--success)", color: "var(--accent-foreground)" }
                          : { border: "1px solid var(--border-strong)", color: "var(--muted)" }
                      }
                    >
                      {o.done ? "✓" : "–"}
                    </span>
                    <span className={o.done ? "font-semibold" : "font-semibold text-muted"}>
                      {o.titleBg}
                    </span>
                    {o.done && o.completedAtSec !== null ? (
                      <span className="ml-auto text-xs tabular-nums text-muted">{clock(o.completedAtSec)}</span>
                    ) : null}
                  </div>
                  {/* A10 measurement channel — „Реакция: 0.68 с — отличен" */}
                  {detailText !== null ? (
                    <p className="pl-7 text-xs font-semibold text-muted">{detailText}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Mistakes */}
      {summary.mistakes.length > 0 ? (
        <section aria-label="Грешки" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold">Грешки ({summary.mistakes.length})</h3>
          {/* The founder's ruling, on the screen that caused it: изпитни точки,
              контролни точки and глоба are three systems and must never be
              conflated. Said once, above the list, rather than on every row. */}
          <ThreeSystemsNote />
          <ul className="flex flex-col gap-2">
            {summary.mistakes.map((m, i) => {
              const key = `v:${i}`;
              const flash = rowFlash(key);
              return (
                <li
                  key={flash.key}
                  ref={registerRow(key)}
                  className={`flex flex-col gap-1 rounded-xl border border-border p-3 ${flash.className}`}
                >
                  <FaultCard
                    event={m}
                    correctiveBg={correctiveFor(m.code)}
                    atBg={clock(m.t)}
                    billing={roadBilling[i]}
                    examBilled={examBilling[i]}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* A15: near misses — nothing graded, honestly surfaced */}
      {nearMisses.length > 0 ? (
        <section aria-label="Разминавания на косъм" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold text-warning">
            Разминавания на косъм ({nearMisses.length})
          </h3>
          <p className="text-xs leading-relaxed text-muted">
            Не се броят като грешки — нищо не се удари. Но „мина ми“ не е умение:
            виж къде беше на косъм и мини оттам по-бавно и по-широко.
          </p>
          <ul className="flex flex-col gap-1.5">
            {nearMisses.map((n, i) => {
              const key = `n:${i}`;
              const flash = rowFlash(key);
              return (
                <li
                  key={flash.key}
                  ref={registerRow(key)}
                  className={`flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm ${flash.className}`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 shrink-0 rounded-full border-2"
                    style={{ borderColor: "var(--warning)" }}
                  />
                  <span className="font-semibold">
                    {NEAR_MISS_KIND_LABELS[n.kind]} — на {n.clearanceM.toFixed(1)} м
                  </span>
                  <span className="ml-auto text-xs tabular-nums text-muted">{clock(n.tSec)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Commendations */}
      {summary.commendations.length > 0 ? (
        <section aria-label="Похвали" className="card flex flex-col gap-2 p-5">
          <h3 className="text-sm font-extrabold text-success">Похвали</h3>
          <ul className="flex flex-col gap-1">
            {summary.commendations.map((c, i) => {
              const key = `c:${i}`;
              const flash = rowFlash(key);
              return (
                <li
                  key={flash.key}
                  ref={registerRow(key)}
                  className={`flex items-center gap-2 rounded-lg px-1 text-sm ${flash.className}`}
                >
                  <span aria-hidden className="text-success">✓</span>
                  <span className="font-semibold">{c.titleBg}</span>
                  <span className="ml-auto text-xs tabular-nums text-muted">{clock(c.t)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Debrief */}
      <section aria-label="Разбор" className="card flex flex-col gap-2 p-5">
        <h3 className="text-sm font-extrabold">Разбор от инструктора</h3>
        {debriefText === null ? (
          <p className="text-sm text-muted">Записване на сесията…</p>
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed">{debriefText}</p>
        )}
        {concepts.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {concepts.map((c) => (
              <Link
                key={c.id}
                href={c.href}
                className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-accent transition hover:border-accent motion-reduce:transition-none"
              >
                {c.titleBg}
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {/* S1: the library is finished — say so instead of offering nothing. */}
      {catalogCompleteBg !== null ? (
        <p
          aria-label="Край на библиотеката със сценарии"
          className="rounded-xl border border-success/50 bg-success/10 px-4 py-3 text-sm font-semibold text-success"
        >
          {catalogCompleteBg}
        </p>
      ) : null}

      {/* S1: the forward actions — a green rung leads on, and (founder
          2026-07-17) it leads TWO ways: one rung harder on this maneuver, or
          out to the next card. Own row, side by side from `sm` up: each label
          names its destination, so they are far too long to sit in the
          wrapping utility row below without breaking into ragged lines at
          laptop width. The grid gives them equal halves; the accent/ghost
          pair (never two accents) says which one is the default. */}
      {scenarioCtas.length > 0 ? (
        <div className={`grid gap-3 ${scenarioCtas.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {scenarioCtas.map((cta) => (
            <button
              key={cta.id}
              type="button"
              className={`${cta.className} w-full min-w-0 flex-col items-start gap-0.5 px-4 py-2.5 text-left`}
              onClick={cta.onStart}
            >
              <span className="text-[10px] font-black uppercase tracking-wider opacity-70">
                {cta.leadBg}
              </span>
              {/* Long template titles ellipsis rather than reflow the row —
                  the full name stays in the DOM for the accessible name. The
                  arrow sits outside the truncation so it never gets eaten. */}
              <span className="flex w-full items-baseline gap-1 text-sm font-bold">
                <span className="min-w-0 truncate">{cta.labelBg}</span>
                <span aria-hidden className="shrink-0">
                  →
                </span>
              </span>
              {/* FR-06: the one sentence that keeps this from reading as
                  „you're done here" — present only after a failed run. */}
              {cta.noteBg !== undefined ? (
                <span className="w-full text-[11px] font-medium leading-snug opacity-75">
                  {cta.noteBg}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {/* „Повтори" keeps its weight only while nothing leads forward — and
            it is the way back to the stars when a rung is locked. */}
        <button type="button" className={retryCtaClass(scenarioCtas)} onClick={onRetry}>
          Повтори
        </button>
        {nextLessonTitleBg !== null ? (
          onNextLesson !== null ? (
            <button type="button" className="btn-ghost" onClick={onNextLesson}>
              Следващ урок: {nextLessonTitleBg}
            </button>
          ) : (
            <span className="btn-ghost cursor-not-allowed opacity-50" aria-disabled>
              Следващ урок: заключен
            </span>
          )
        ) : null}
        {/* I2: the drive is already recorded and stored — this is the only
            place a student would think to look for it. */}
        {myDriveHref !== null ? (
          <Link href={myDriveHref} className="btn-ghost">
            Виж своя дубъл
          </Link>
        ) : null}
        <button type="button" className="btn-ghost ml-auto" onClick={onExit}>
          Назад към таблото
        </button>
      </div>
    </div>
  );
}
