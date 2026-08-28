/**
 * Template debrief generator v1 — a deterministic Bulgarian coaching text built
 * ONLY from session facts (rule-engine events with titles/explanations/lawRefs
 * authored in the violation catalog, the micro-quiz tally, the store's prior
 * best score, and concept titles from the content repo). Nothing is
 * free-recalled — ADR-002.
 *
 * Structure: verdict → improvement vs the driver's own best → theory-in-motion
 * (micro-quiz) → what went well → the most important mistakes (grouped, law-
 * cited, dangerous-first) → what to practice next (the concept behind the worst
 * mistake, named + linked to theory).
 *
 * THE ORDER OF THE MIDDLE TWO IS CONDITIONAL SINCE 2026-08-17, and the reason
 * is measured rather than aesthetic: an опасна грешка outranks praise, and
 * nothing else does. See the „gravity before praise" comment at the site.
 *
 * ============================ AI DEBRIEF SEAM ============================
 * The tutor layer will later replace/augment `text` with an LLM-written
 * debrief (dialogue tone, personalized). Contract for that layer:
 *  - input: the same LessonResult + DebriefContext + this template as the
 *    grounding draft;
 *  - the LLM may rephrase but must keep every lawRef citation intact and may
 *    NOT introduce legal claims that are not present in the events (ADR-002:
 *    retrieval + citation only, no free recall of Bulgarian law).
 * Callers treat `buildDebrief` as the fallback when the AI layer is
 * unavailable. Nothing else in this module may call an LLM. The concrete
 * call site is marked `// AI debrief hook` at the bottom of buildDebrief.
 * =========================================================================
 */

import type { LessonSpec } from "../contracts";
import {
  COLLISION_CONSEQUENCE_BG,
  EXAM_VS_CONTROL_POINTS_BG,
  SEVERITY_POINTS,
  VIOLATIONS,
  actCopy,
  billRoadConsequences,
  deriveSpeedingBand,
  examMarkFor,
  examPointsWordBg,
  formatEur,
  gravestViolation,
  instrumentLabelBg,
  ledgerBilling,
  offenceCoveredLineBg,
  parseSpeedMeasurement,
  pointsBg,
  pointsEachBg,
  pointsLabelBg,
  roadConsequenceFor,
  withEurBg,
  type ConditionalPenalty,
  type ControlPointsFigure,
  type OffenceBilling,
  type ViolationCode,
  type ViolationEvent,
} from "../rules";
import type { LessonResult, SessionNearMiss } from "./types";

export interface DebriefOutput {
  /** Plain text (newline-separated sections) — stored in SimSession.debrief. */
  text: string;
  /**
   * Concept ids to practice, mistake-driven, in order of first occurrence —
   * the UI links them to theory topics; the learning module uses them for
   * recommendations.
   */
  conceptIds: string[];
}

/**
 * Session facts the deterministic template can weave in but that the pure
 * engine does not own (store history, content titles, micro-quiz tally). The
 * caller (server action) supplies what it has; every field is optional so the
 * client can render an instant fallback with none of it.
 */
export interface DebriefContext {
  /** Contextual theory checks answered during the drive. */
  microQuiz?: { total: number; correct: number };
  /**
   * Fewest penalty points the driver scored on THIS lesson BEFORE this attempt.
   * null/undefined = first attempt (no history) → improvement coaching skipped.
   */
  priorBestScore?: number | null;
  /** conceptId → Bulgarian title, for a NAMED "practice this next" pointer. */
  conceptTitles?: Record<string, string>;
  /**
   * THE MISTAKES THAT WERE SHOWN AND DELIBERATELY NOT SCORED — the teach
   * moments (lessons/engine.ts `teachMoments`, scenarios/policy.ts
   * teach-first-then-grade). Codes and titles only: the debrief never re-prices
   * them, because withholding the charge from a first encounter is the whole
   * point of A12 and must not be undone from here.
   *
   * WHY THE DEBRIEF NEEDS TO KNOW. Without it this file can only read the
   * SCORED ledger, and it was then stating things about the whole drive that
   * only the ledger's half is evidence for. Driven 2026-08-16,
   * `sc-signal-flashing` · mobile · wrong: at t = 12 s the HUD raised
   * «Превишена скорост» over a cluster reading 59 км/ч against the HUD's own 50
   * badge — a teach card, `+1` deep, so it never reached `summary.mistakes`.
   * The debrief that followed said, verbatim, «чисто каране без нито едно
   * нарушение — задръж това ниво» and «карането беше чисто». A seventeen-year-
   * old who did 59 in a 50 was told to hold that standard.
   *
   * Optional and absent-by-default: with none supplied the claims below are
   * scoped to the exam sheet (true of what was read) instead of the drive.
   *
   * SAFE TO HAND OVER THE WHOLE QUEUE. `lessons/engine.ts` also pushes a SCORED
   * violation into `teachMoments` whenever S1 `pauseOnError` is on, and
   * `TeachMoment` carries no flag telling that arm from the teach arm — so
   * `buildDebrief` filters this list against `summary.mistakes` itself rather
   * than trusting the caller to. A code the sheet charged is dropped from here
   * and stays where its points are, in the mistakes block.
   */
  coachedMistakes?: ReadonlyArray<{ code: string; titleBg: string }>;
}

interface MistakeGroup {
  code: string;
  titleBg: string;
  lawRef: string;
  conceptId: string | undefined;
  severityClass: ViolationEvent["severityClass"];
  severityLabel: string;
  points: number;
  count: number;
  /**
   * Points the LEDGER charged for this group — Σ over its BILLED rows only
   * (`rules/scoring.ts ledgerBilling`), which is not Σ `points`. Faults after
   * the exam ended are shown and taught but cost nothing (Наредба № 38, чл. 48,
   * ал. 3), and summing them here is how one drive came to print «20
   * наказателни т.» four lines under a verdict of «10».
   */
  totalPoints: number;
  /** How many of `count` rows the ledger actually charged. */
  billedCount: number;
  /**
   * …AND WHAT THE CLOSURE WITHHELD ON THIS GROUP — Σ `points` over its UNBILLED
   * rows, the exact complement of `totalPoints`.
   *
   * It exists so the floor sentence at the foot of the block can be CHECKED.
   * That sentence sums the withheld rows and prints one figure («…щеше да
   * струва още 24 наказателни т.»), and the rows it sums each printed «без
   * допълнителни точки» with no price of their own — so on the measured
   * sc-mw-min-speed drive the reader was handed 24 and given 10 + nothing +
   * nothing + nothing to reach it with. Derived here rather than as
   * `points × (count − billedCount)`, because `points` is the FIRST event's
   * price and a code whose rows can differ (a speeding band) would make that
   * product a plausible wrong number.
   */
  withheldPoints: number;
  /**
   * The ACT this group is, when its code grades more than one
   * (`rules/catalog.ts actCopy`): the struck body for COLLISION, the act for
   * RAIL_CROSSING_VIOLATION. Undefined for every code that pools one string.
   * Part of the group KEY — see `groupMistakes`.
   */
  actKey: string | undefined;
  /** The act's own authored explanation, when it has one. */
  actExplanationBg: string | undefined;
  /** Session times of this group's events — pairs it to its escalation records. */
  times: number[];
  /**
   * …and the subset of those times the LEDGER CHARGED, which is the only subset
   * an escalation note may be read off. A multiplier weights a price; a row
   * whose price Наредба № 38, чл. 48, ал. 3 already withheld has no price to
   * weight, and saying it earned one is a sentence that contradicts its own
   * first half. Measured 2026-08-19 on the SERVER debrief of
   * `sc-hz-accident-scene` L3 — the copy the student actually reads
   * (`LessonPlayShell.tsx:2683`): «Удар в пешеходец — опасна, без допълнителни
   * точки — изпитът вече беше прекратен … — повторна грешка ×1.5».
   *
   * FINER THAN A `billedCount > 0` GUARD, and deliberately: a group can hold
   * one charged row and one closed-over row, and keying on the count alone
   * would let the closed row's multiplier print on the charged one's line.
   * Empty here = no note, which is that guard as a special case.
   */
  billedTimes: number[];
  /**
   * The speeding measurement of the WORST event in the group, when the code
   * carries one (`rules/consequences.ts encodeSpeedMeasurement`). Grouping
   * collapses „×3" into one line, so the line has to pick a speed — and the
   * only defensible pick is the fastest, because that is the rung the student
   * would actually have been charged on. Absent for every other code.
   */
  worstSpeedDetail: string | undefined;
}

const SEVERITY_LABEL: Record<ViolationEvent["severityClass"], string> = {
  opasna: "опасна",
  osnovna: "основна",
  vtorostepenna: "второстепенна",
};

/** Weight for ordering mistake groups: dangerous first, then by damage. */
const SEVERITY_RANK: Record<ViolationEvent["severityClass"], number> = {
  opasna: 2,
  osnovna: 1,
  vtorostepenna: 0,
};

const MAX_MISTAKE_LINES = 4;
const MAX_COMMENDATION_LINES = 3;
/** Unfinished route tasks quoted by name before the count takes over. */
const MAX_UNFINISHED_NAMED = 2;
/** Teach-moment rows listed by name in the „Учебни моменти" section before the count takes over. */
const MAX_COACHED_NAMED = 2;

/**
 * The rider on a commendation the SAME drive convicted the SAME skill for.
 *
 * Not a deletion — the good act happened and the student is owed the credit.
 * What he is not owed is a debrief that praises a skill it is about to
 * penalise, in silence, as though the two were about different drives. Order-
 * neutral wording on purpose: with an опасна грешка in the run the mistakes
 * block prints ABOVE this line, and below it otherwise.
 *
 * THE LEADING „ — " CAME OFF (finding sc-ac-wind-truck-pass:62436dd4). The
 * sentence is now shared with the RESULT SCREEN's «Похвали» card, which prints
 * one commendation per row and needs it as a sentence rather than as a
 * continuation of a bullet. The dash is punctuation for THIS medium and is
 * added back at the one call site below, so the debrief text is byte-identical
 * (`debrief-truthfulness.test.ts` pins «Правилно отстъпено предимство — но не
 * всеки път»). See `commendationRiderBg`.
 */
const COMMENDATION_CONTRADICTED_BG =
  "но не всеки път: същото умение е и сред грешките в този урок. Умението се брои за усвоено, когато го правиш ВСЕКИ път.";

export function buildDebrief(
  lesson: LessonSpec,
  result: LessonResult,
  context: DebriefContext = {},
): DebriefOutput {
  const { summary } = result;
  const lines: string[] = [];
  /**
   * Shown, deliberately unscored — see DebriefContext.coachedMistakes.
   *
   * FILTERED AGAINST THE LEDGER, and the filter is the section's own heading.
   * „Учебни моменти (не влизат в точките)“ is a claim about the SCORE, and
   * `lessons/engine.ts` fills `teachMoments` from BOTH arms of `coachStep`: the
   * teach arm, and a SCORED violation whenever S1 `pauseOnError` is on. A caller
   * that hands that queue over whole would file a fault that cost 10 изпитни т.
   * under a heading saying it cost nothing. Nothing is re-priced here — A12 still
   * owns the withholding; a code that is in `summary.mistakes` simply belongs to
   * the mistakes block, which already prints it with its points.
   */
  // `Set<string>` and not the inferred `Set<ViolationCode>`: the channel carries
  // plain strings (DebriefContext.coachedMistakes), exactly like MistakeGroup.code.
  const scoredCodes = new Set<string>(summary.mistakes.map((m) => m.code));
  const coached = (context.coachedMistakes ?? []).filter((c) => !scoredCodes.has(c.code));
  /**
   * THE THIRD RECORD OF „this drive was not clean", HOISTED because THREE
   * sentences below have to consult it and one of them is the headline.
   *
   * A near miss is graded at nothing by construction (`lessons/types.ts
   * SessionNearMiss` — „session stat only") and this file does not change that.
   * It is however a fact the RUN recorded about itself, exactly like a teach
   * moment, and the sentences that claim a spotless drive were reading only two
   * of the three channels — see the reservation block in the „издържан" branch
   * for the measured drive (`sc-vu-pass-clearance:54930e5c`: 0.5 m from a
   * cyclist, «Точно това иска да види изпитващият»).
   */
  const nearMisses = result.nearMisses ?? [];
  const nearMissCount = nearMisses.length;
  const closestNearMiss = nearMissClosest(nearMisses);

  // -- verdict ---------------------------------------------------------------
  /**
   * THE OFFICIAL CRITERIA, HOISTED OUT OF THE LAST BRANCH — because the last
   * branch is reached only by a run that FINISHED its route, and a drive can
   * break the sheet and the route at once.
   *
   * MEASURED · sweep 161 · `sc-signal-flashing` · mobile · right: four
   * collisions, 4 × опасна = 40 изпитни т., НЕИЗДЪРЖАН, one task left open — so
   * it took the unfinished branch and the entire verdict read «не е завършен —
   * остана неизпълнена задача от маршрута. Резултатът се брои, но за успешен
   * урок мини целия маршрут.» Forty points and four dangerous errors were never
   * named, and „мини целия маршрут" is advice that would NOT have passed this
   * drive. `sc-rx-guarded` · pc · wrong is the same shape with one опасна and 10
   * т. Each of the three criteria below fails the lesson on its own (Наредба
   * № 38, приложение № 5, т. 11), which is what lets the sentence say „и с
   * изминат докрай маршрут" as arithmetic rather than as emphasis.
   */
  const criteriaBroken: string[] = [];
  if (summary.score.hasDangerous) criteriaBroken.push(dangerousCriterionBg(summary));
  // „10 т. общо" was the exact string the founder read as his licence. The
  // unit rides on the number now, everywhere it is printed.
  if (summary.score.totalPoints > 9) {
    criteriaBroken.push(`${examPointsWordBg(summary.score.totalPoints)} от изпитния лист (допустими 9)`);
  }
  if (summary.score.osnovniPoints > 6) {
    criteriaBroken.push(`${examPointsWordBg(summary.score.osnovniPoints)} от основни грешки (допустими 6)`);
  }
  if (result.aborted) {
    /**
     * …AND THE ABORT BRANCH IS THE THIRD ONE THE HOIST ABOVE HAD TO REACH.
     *
     * MEASURED · Wave C · `sc-mw-min-speed` · pc · right
     * (`.audit-frames/wave-c/frames/sc-mw-min-speed__pc-right/`): the car hits
     * another vehicle at t = 87 (04-t087s, «ОПАСНА ГРЕШКА −10 изпитни т. · Удар
     * в друго превозно средство»), the run is stopped with „Прекрати урока", and
     * the result screen reads «Урокът беше прекъснат преди края» over «10
     * наказателни точки · НЕИЗДЪРЖАН». The debrief this file wrote for that
     * drive opened, in full: «Прекъсна урока … преди края. Нищо страшно —
     * запазихме наблюденията дотук, а маршрутът те чака отново.» A crash met
     * with reassurance, and not one of the criteria named.
     *
     * The three criteria are MONOTONE — points only accumulate and an опасна is
     * never un-committed — so „finishing the route would not have rescued this"
     * is arithmetic here for the same reason it is arithmetic in the unfinished
     * branch below, not a guess about a drive that did not happen. The gentle
     * sentence is kept whole for the drive it was written for: a student who
     * quits with a clean sheet is still met with «Нищо страшно».
     */
    const head = `Прекъсна урока „${lesson.titleBg}“ преди края.`;
    // Agreeing, because one broken criterion is the common case and „всеки от
    // тези критерии" about a single one is the „1 движения" defect again.
    const eachOfThem =
      criteriaBroken.length === 1
        ? "Този критерий сам по себе си прави урока неиздържан"
        : "Всеки от тези критерии сам по себе си прави урока неиздържан";
    lines.push(
      criteriaBroken.length === 0
        ? `${head} Нищо страшно — запазихме наблюденията дотук, а маршрутът те чака отново.`
        : `${head} Но прекъсването не изтрива изпитния лист — ${criteriaBroken.join("; ")}. ` +
          `${eachOfThem} (Наредба № 38, приложение № 5, т. 11), така че довършването на маршрута ` +
          `нямаше да го поправи. Запазихме наблюденията, а маршрутът те чака отново — започни от ` +
          `грешките по-долу.`,
    );
  } else if (result.passed) {
    /**
     * „ИЗДЪРЖАН" IS THE LAW'S VERDICT. „ТОЧНО ТОВА ИСКА ДА ВИДИ ИЗПИТВАЩИЯТ"
     * IS A CERTIFICATE — AND THIS LINE WAS HANDING IT OUT ON DRIVES THE
     * PRODUCT'S OWN RECORD HAD ALREADY QUALIFIED.
     *
     * MEASURED · w13 · counted over every `_audit-debrief.json` in
     * `.audit-frames/w13/frames`: 181 debriefs captured, 44 of them print this
     * sentence, and NINETEEN of those 44 also print „Учебни моменти (не влизат
     * в точките)" — i.e. the drive was SHOWN a violation and A12 deliberately
     * withheld the charge. `sc-signal-flashing__pc-right` is the whole defect
     * in two sentences, four lines apart in one paragraph:
     *
     *   «…е издържан: 0 наказателни точки от изпитния лист при допустими 9.
     *    Точно това иска да види изпитващият.»
     *   «Учебни моменти (не влизат в точките): • Рязко спиране без причина»
     *
     * A seventeen-year-old who stamped on the brake for no reason is told, one
     * paragraph earlier, that this is exactly what the examiner wants to see.
     * It is the SAME hole `DebriefContext.coachedMistakes` was built to close
     * one block down: the clean-drive praise line was scoped to the sheet and
     * the VERDICT sentence above it — the headline, the first thing read —
     * never was. Four more of the 44 pass carrying three points of основна
     * грешка on the sheet (`sc-lane-change`, `sc-merge-lane-end`,
     * `sc-merge-roadworks-shift`, `sc-ov-keep-right`) and collected the same
     * superlative over it.
     *
     * NOTHING IS RE-GRADED, and the drive that earned the sentence keeps it
     * byte-identical. `passed` is Наредба № 38, приложение № 5, т. 11's own
     * verdict and is untouched; the points figure is untouched; a spotless
     * sheet with nothing forgiven still reads exactly as it shipped. What is
     * withheld is only the claim about what the EXAMINER would have wanted,
     * on the runs where the product itself recorded a reservation — the same
     * ruling the rubric already applies on the star row, where a forgiven
     * violation caps the drive at 2★ (`scenario/rubric.ts`).
     *
     * AND IT MAY NOT SAY THE LESSON WOULD HAVE FAILED ON A REPEAT. A
     * второстепенна is 1 изпитна т. and 0 + 1 is still inside the 9, so that
     * sentence would be false arithmetic dressed as a warning. The teach
     * section's own «при повторение вече влиза в изпитния лист» is the true
     * form of it and stays where it is; this line points at that section
     * instead of paraphrasing it.
     */
    const head = `Урокът „${lesson.titleBg}“ е издържан: ${examPointsWordBg(summary.score.totalPoints)} от изпитния лист при допустими 9.`;
    // Counted by TITLE, because „Учебни моменти" is deduplicated by title
    // (`coachedLines`) and the queue behind it was measured EIGHT deep on one
    // drive — a raw row count here would name a number that section never
    // prints, which is the „24 over 10" defect in a smaller frame.
    const coachedKinds = new Set(coached.map((c) => c.titleBg)).size;
    const reservations: string[] = [];
    if (summary.score.totalPoints > 0) {
      reservations.push(
        `${examPointsWordBg(summary.score.totalPoints)} вече са в листа, а запасът за целия изпит е 9`,
      );
    }
    if (coachedKinds > 0) {
      reservations.push(
        coachedKinds === 1
          ? "едно нарушение беше показано и този път не влезе в точките"
          : `${coachedKinds} нарушения бяха показани и този път не влязоха в точките`,
      );
    }
    /**
     * …AND THE THIRD RESERVATION THE RUN HAD ALREADY RECORDED AND THIS SENTENCE
     * NEVER READ — finding `sc-vu-pass-clearance:54930e5c`.
     *
     * MEASURED · w10-2 · `sc-vu-pass-clearance` · pc · wrong
     * (`frames/sc-vu-pass-clearance__pc-wrong/_audit-debrief.json`). One result
     * screen, two sections, verbatim:
     *
     *   section[aria-label="Разминавания на косъм"]
     *     «Разминавания на косъм (1) … велосипедист — на 0.5 м 0:40»
     *   section[aria-label="Разбор"]
     *     «…е издържан: 0 наказателни точки … Точно това иска да види изпитващият.»
     *
     * Half a metre from a cyclist at speed, recorded by the product, printed on
     * the product's own card — and the headline of the debrief beside it told a
     * seventeen-year-old that this is exactly what the examiner wants to see.
     * The two channels the sentence DID consult were both silent: the sheet was
     * clean and (on a leg with no teach moment) so was the teach queue, so
     * `reservations` was empty and the superlative printed unopposed.
     *
     * NOTHING IS RE-GRADED. A near miss folds into no score by construction
     * (`lessons/types.ts SessionNearMiss` — „session stat only"), `passed` is
     * untouched, the XP and the stars are untouched. What the line stops doing
     * is claiming the examiner would have wanted a drive the product itself
     * flagged. The clearance is the recorded number, not a derived one, and the
     * closest encounter is the defensible pick for the same reason
     * `worstSpeedDetail` picks the fastest: it is the rung the student was
     * actually on.
     *
     * PAIRED WITH THE CARD, DELIBERATELY. `hud/SessionEndScreen.tsx` carries
     * the same reservation on the verdict card itself (`nearMissReservationBg`)
     * — the card is where the ИЗДЪРЖАН pill, the ★★★ row and the „+100 XP" chip
     * sit, and the near-miss section is 1 300 px below them. Two surfaces, one
     * derivation; see that function for the wire gap this side still has.
     */
    if (closestNearMiss !== null) {
      reservations.push(
        nearMisses.length === 1
          ? `имаше разминаване на косъм — ${nearMissPhraseBg(closestNearMiss)}`
          : `имаше ${nearMisses.length} разминавания на косъм, най-близкото ${nearMissPhraseBg(closestNearMiss)}`,
      );
    }
    // Each thing pointed at is GUARANTEED to be below: points > 0 implies a
    // billed row, so the mistakes block prints; `coachedKinds > 0` is the very
    // condition the teach section prints on; and the near-miss paragraph prints
    // on exactly `nearMisses.length > 0`. No pointer to a section the student
    // cannot find.
    //
    // DESCRIBED, NOT QUOTED BY HEADING, and that is deliberate rather than
    // stylistic: a pointer carrying the literal string „Най-важните грешки"
    // would make this paragraph the FIRST match for it in the document, and the
    // „gravity before praise" ordering is asserted by `indexOf` on exactly that
    // string (`debrief-truthfulness.test.ts`). A cross-reference must not be
    // mistakable for the thing it refers to.
    //
    // BUILT FROM THE FLAGS, NOT FROM `reservations.length`. The count keyed the
    // wording until a THIRD channel joined the list, and „length === 2" then
    // meant three different pairs — the shape that prints „грешките и учебните
    // моменти" over a drive that has neither. Each clause is named by the thing
    // that put it there.
    const wherePartsBg = [
      ...(summary.score.totalPoints > 0 ? ["грешките"] : []),
      ...(coachedKinds > 0 ? ["учебните моменти"] : []),
      ...(closestNearMiss !== null ? ["разминаванията на косъм"] : []),
    ];
    const where = `${joinBg(wherePartsBg)} по-долу`;
    lines.push(
      reservations.length === 0
        ? `${head} Точно това иска да види изпитващият.`
        : `${head} Но „издържан“ не значи „чисто“: ${reservations.join("; ")}. ` +
          `Изпитващият гледа цялото каране, а не само дали запасът е стигнал — прочети ${where} ` +
          `и повтори урока с тях наум.`,
    );
  } else if (!result.completedAll) {
    const head = `Урокът „${lesson.titleBg}“ не е завършен — ${unfinishedTaskPhrase(result)}.`;
    lines.push(
      criteriaBroken.length === 0
        ? `${head} Резултатът се брои, но за успешен урок мини целия маршрут.`
        : `${head} Но маршрутът не е единствената причина: ${criteriaBroken.join("; ")} — урокът нямаше да е издържан и с изминат докрай маршрут.`,
    );
  } else {
    lines.push(
      `Урокът „${lesson.titleBg}“ не е издържан по официалните критерии: ${criteriaBroken.join("; ")}.`,
    );
  }
  if (summary.terminated) {
    // Both halves, both addresses — the mark is приложение № 5, т. 10, б. „в“,
    // the ending is чл. 48, ал. 3, and until 2026-08-10 this line cited
    // neither. (rules/scales.ts COLLISION_CONSEQUENCE_BG.)
    lines.push(
      `${COLLISION_CONSEQUENCE_BG} В симулатора продължихме за упражнение, но оценката отразява прекратяване.`,
    );
    /**
     * …AND THE ARITHMETIC THAT TIES ITS TEN TO THE TOTAL, when the collision was
     * not the whole dangerous account.
     *
     * MEASURED · sweep 161 · `sc-pk-driveway` · pc · right: «Настъпи сблъсък.
     * Това е ЕДНА опасна грешка: 10 изпитни т. …» printed under a „20
     * наказателни точки" headline and above a row reading „Опасни грешки (по 10
     * изпитни т.) 2 20"; `sc-signal-flashing` · mobile · right is the same
     * sentence over 4 and 40. Every figure there is right and the ruled copy is
     * the founder's own — it is right ABOUT THE COLLISION. Read where it sits it
     * is the account OF THE TOTAL, and as that account it says ten while the
     * total says twenty. So the copy is untouched and the missing half is
     * supplied. Silent at a count of one, where the sentence could only restate
     * the number it has just given. (The result screen carries the same repair
     * as `collisionTotalReconcileBg`; the two surfaces must not diverge.)
     */
    if (summary.score.opasniCount > 1) {
      lines.push(
        // Short form („изпитни т.") on both figures, because the sentence it
        // continues is COLLISION_CONSEQUENCE_BG and that one is in the short
        // form — the same scale said two ways inside one paragraph is how a
        // reader starts believing there are two scales.
        `Опасните грешки в този урок обаче са ${summary.score.opasniCount}, не една: ` +
          `${pointsEachBg("exam", SEVERITY_POINTS.opasna)} правят ${pointsBg("exam", summary.score.opasniPoints)} — сблъсъкът е една от тях.`,
      );
    }
  }

  // -- failed with a spotless sheet ------------------------------------------
  /**
   * THE SENTENCE THE BADGE CANNOT SAY. `passed` is the AND of three things —
   * the official point rule, every task done, and not aborted — so a run can
   * be stamped НЕИЗДЪРЖАН with a perfect error table, and five scenarios in
   * the 2026-08-16 sweep were: sc-follow-brake, sc-ov-keep-right,
   * sc-merge-bus-pullout, sc-merge-motorway-exit and sc-ln-decisive-change all
   * printed «0 наказателни точки · НЕИЗДЪРЖАН» over «Опасни 0 · Основни 0 ·
   * Второстепенни 0 · Общо (допустими 9) 0». To a seventeen-year-old that reads
   * as „you failed with no mistakes", and the prose beside it said nothing to
   * separate the two.
   *
   * The arithmetic below is the check, not a mood: !passed with an empty
   * mistake list and a zero total can ONLY be the route half of the AND, so the
   * line can name the real reason without guessing at one.
   */
  if (!result.passed && summary.mistakes.length === 0 && summary.score.totalPoints === 0) {
    const because = result.aborted
      ? "оценката е за прекъснатия урок, не за карането"
      : "оценката е за незавършения маршрут, не за карането";
    lines.push(`По изпитния лист нямаш нито една наказателна точка (0 при допустими 9) — ${because}.`);
  }

  // -- failed with the route done, which is the mirror of it ------------------
  /**
   * THE OTHER HALF OF THE SAME AND, and the sweep caught it too.
   *
   * MEASURED · sweep 161 · `sc-zebra-approach` · mobile · right: the route sheet
   * on the result screen carried «✓ Приближи пътеката с готовност за спиране
   * 0:41» and «✓ Премини пътеката, след като е свободна 1:25» — both green —
   * over a red НЕИЗДЪРЖАН, and nothing on the screen said how the two go
   * together. The verdict above names the criteria; what it cannot say is that
   * the OTHER half of `passed` was met, so the student reads two ticks and a
   * fail and is left to guess which one is lying.
   *
   * Gated on `objectives.length > 0` because a lesson with no tasks is
   * vacuously complete (l0 free drive), and „задачите са изпълнени" about no
   * tasks is a hollow credit — the one shape of this sentence that would be
   * praise for nothing. Mutually exclusive with the block above: a run that is
   * complete, unaborted and still !passed must have broken the point rule, so
   * its sheet is never spotless.
   */
  if (
    !result.passed &&
    !result.aborted &&
    result.completedAll &&
    result.objectives.length > 0
  ) {
    lines.push(
      "Задачите от маршрута са изпълнени — този урок не пада заради маршрута, а заради изпитния лист по-горе.",
    );
  }

  // -- improvement vs the driver's own best ----------------------------------
  const improvement = improvementLine(result, context.priorBestScore);
  if (improvement !== null) lines.push(improvement);

  // -- theory in motion (micro-quiz) -----------------------------------------
  const quiz = context.microQuiz;
  if (quiz && quiz.total > 0) {
    lines.push("");
    lines.push("Теория в движение:");
    lines.push(
      `• Отговори вярно на ${quiz.correct} от ${quiz.total} въпроса по време на карането — те влияят на същата готовност като тренировките в „Теория“.`,
    );
    lines.push(
      quiz.correct === quiz.total
        ? "• Знанието ти от теорията се пренася на пътя. Точно това търсим."
        : "• Прегледай темите зад въпросите, на които се поколеба — затова изникват в движение.",
    );
  }

  // -- what went well ----------------------------------------------------------
  /**
   * BUILT, NOT PRINTED. Both this block and the mistakes block below accumulate
   * into their own array; the ORDER they reach `lines` is decided once, after
   * both exist, at „gravity before praise" further down.
   */
  const goodBlock: string[] = [];
  const goodLines = commendationLines(result);
  if (goodLines.length > 0) {
    goodBlock.push("");
    goodBlock.push("Какво се получи добре:");
    goodBlock.push(...goodLines);
  } else if (summary.mistakes.length === 0 && !result.aborted) {
    goodBlock.push("");
    /**
     * SCOPED TO THE SHEET IT READ. This said «чисто каране без нито едно
     * нарушение — задръж това ниво» about the DRIVE, on the evidence of the
     * scored ledger alone — and a teach moment is by construction a mistake
     * that never reaches that ledger (see DebriefContext.coachedMistakes for
     * the 59-in-a-50 drive this sentence congratulated). „по изпитния лист" is
     * the honest span of the claim with nothing supplied; with a teach moment
     * on record the invitation to HOLD this standard comes off, and the
     * „Учебни моменти" section below says what actually happened.
     */
    /**
     * …AND A NEAR MISS REVOKES THE INVITATION FOR THE SAME REASON A TEACH
     * MOMENT DOES. „задръж това ниво" is an instruction to REPEAT this drive,
     * and on the measured leg (`sc-vu-pass-clearance` · pc · wrong) the drive
     * being held up as the standard passed a cyclist at half a metre. The
     * CLAIM stays true and scoped — the sheet was clean — but a drive the
     * product itself flagged is not one to reproduce.
     */
    goodBlock.push(
      coached.length > 0 || nearMissCount > 0
        ? "Какво се получи добре: чисто каране по изпитния лист — нито едно нарушение не влезе в точките."
        : "Какво се получи добре: чисто каране без нито едно нарушение по изпитния лист — задръж това ниво.",
    );
  }

  // -- mistakes ---------------------------------------------------------------
  const mistakeBlock: string[] = [];
  /**
   * A9: repeat mistakes graded harder (×1.5/×2.0) — name that per group and show
   * the training total, keeping the official score clearly separate.
   *
   * PAIRED BY (code, t), NOT BY CODE. An escalation record names the EVENT it
   * escalated, and with one row per ACT a code can now own two groups: keying
   * this by code alone printed «повторна грешка ×1.5» on the vehicle row for a
   * multiplier the PEDESTRIAN row had earned. (Two victims in one crash are not
   * a repeat at all — that is fixed where the record is made, in engine.ts's
   * `buildLessonResult`; this pairing is what stops a real repeat's note from
   * landing on the wrong act.)
   */
  const escalationAt = new Map<string, number>();
  for (const esc of result.escalations) {
    const key = `${esc.code}@${esc.t}`;
    const prev = escalationAt.get(key) ?? 1;
    if (esc.multiplier > prev) escalationAt.set(key, esc.multiplier);
  }
  const ledgerBilled = ledgerBilling(summary.mistakes);
  const groups = groupMistakes(summary.mistakes, ledgerBilled);
  /**
   * ONE ACT, ONE ROAD PRICE — the same ruling the result screen renders
   * (rules/offences.ts), applied to the text so the two surfaces cannot say
   * different things about the same drive. `groupMistakes` collapses by CODE,
   * so the question here is per code: was this code ever the row that carried
   * the price? If it never was, its money is somebody else's line, and printing
   * it again is the 200 лв. defect in prose.
   */
  const billing = billRoadConsequences(summary.mistakes);
  const billedCodes = new Set<string>();
  const coveredByCode = new Map<string, NonNullable<OffenceBilling["coveredBy"]>>();
  summary.mistakes.forEach((m, i) => {
    const b = billing[i];
    if (b.billed) billedCodes.add(m.code);
    else if (b.coveredBy !== null && !coveredByCode.has(m.code)) coveredByCode.set(m.code, b.coveredBy);
  });
  /** null = this code pays for itself somewhere in the drive; otherwise, who does. */
  const coveredElsewhere = (code: string): NonNullable<OffenceBilling["coveredBy"]> | null =>
    billedCodes.has(code) ? null : (coveredByCode.get(code) ?? null);
  if (groups.length > 0) {
    mistakeBlock.push("");
    mistakeBlock.push("Най-важните грешки (подредени по тежест):");
    // Said once, before the first number: which of the three point systems
    // these points belong to. „10 т." with no unit reads as контролни точки.
    mistakeBlock.push(EXAM_VS_CONTROL_POINTS_BG);
    let anyBlank = false;
    /** Codes whose road half has already been printed on an earlier act row. */
    const roadSaidForCode = new Set<string>();
    const shown = selectShownGroups(groups);
    for (const g of shown) {
      const times = g.count > 1 ? ` ×${g.count}` : "";
      let escMult: number | undefined;
      // OVER THE BILLED TIMES ONLY — see MistakeGroup.billedTimes for the
      // sentence this refuses to print.
      for (const tAt of g.billedTimes) {
        const m = escalationAt.get(`${g.code}@${tAt}`);
        if (m !== undefined && (escMult === undefined || m > escMult)) escMult = m;
      }
      const escNote = escMult !== undefined ? ` — повторна грешка ×${fmtPoints(escMult)}` : "";
      // The citation on this line is now the clause the POINTS come from
      // (Наредба № 38, приложение № 5, т. 10), with the rule that was broken
      // beside it. They used to be one chip, which is how a limits table ended
      // up looking like the source of a ten-point exam mark.
      const mark = codeIsKnown(g.code) ? examMarkFor(g.code as ViolationCode) : null;
      const basis = mark === null ? g.lawRef : `${mark.citationBg}; правилото: ${g.lawRef}`;
      /**
       * THE MONEY HALF OF THE ROW, and it has two readings because the ledger
       * has two. A group the exam charged prints its charge; a group it closed
       * over prints WHY it is free instead of printing a zero, because „0
       * наказателни т." next to «Удар в пешеходец» reads as „this did not
       * matter" — the precise opposite of the lesson.
       */
      /**
       * …AND A ×N ROW HAS TO SAY WHICH OF THE N WERE CHARGED, or the figure is
       * ambiguous in exactly the way this lane exists to end. On the real L3
       * squeeze the student strikes two wrecked cars and a bystander, and the
       * vehicle row reads «×2 … 10 наказателни т.» — the same «10» a single
       * crash prints. Without this clause the reader has to guess whether two
       * crashes cost ten or whether one of them is missing from the sum.
       */
      const partial =
        g.billedCount > 0 && g.billedCount < g.count
          ? ` (от тях ${g.billedCount} влиза в точките)`
          : "";
      const priced =
        g.billedCount > 0
          ? `${pts(g.totalPoints)} по изпитния лист${partial} (${basis})`
          : // …AND WHAT IT WOULD HAVE COST, because the block's own floor
            // sentence below sums these rows into one figure and a Σ whose terms
            // are invisible is the bare verdict again with a bigger number. The
            // shared clause «изпитът вече беше прекратен» is untouched — two
            // other surfaces are pinned to it verbatim (FaultCard.tsx).
            `без допълнителни точки — изпитът вече беше прекратен, иначе щеше да ` +
            `струва ${pts(g.withheldPoints)} (${basis})`;
      mistakeBlock.push(`• ${g.titleBg}${times} — ${g.severityLabel}, ${priced}${escNote}`);
      /**
       * WHAT WAS STRUCK, IN ITS OWN WORDS (THEO-4). `makeViolation` stamps the
       * act's authored explanation onto the event and this list used to drop it
       * on the floor: on the drive that opened this lane the debrief never once
       * contained the word «пешеходец», though the student had run a man over.
       * Printed only where the code grades more than one act (COLLISION's four
       * bodies, the three rail acts), because everywhere else the corrective
       * below already carries the teaching and a second paragraph per row would
       * bury it.
       */
      if (g.actExplanationBg !== undefined) {
        mistakeBlock.push(`  → Какво стана: ${g.actExplanationBg}`);
      }
      // A15: the authored corrective — WHAT the right action was, from the
      // violation catalog (ADR-002: authored copy, never generated). Part of
      // the grounding draft for the post-Alpha LLM debrief: the LLM may
      // rephrase this line but must not invent corrective advice.
      const corrective = correctiveFor(g.code);
      if (corrective !== null) mistakeBlock.push(`  → Правилното действие: ${corrective}`);
      // The debrief is PLAIN TEXT — it has no FaultCard to carry the rider, and
      // it is what /review/my-drive replays weeks later. So the one fault that
      // ends an exam quotes the article that ends it, here, verbatim. Derived
      // from `terminatesExam`, so a class can never imply it (Наредба № 38
      // чл. 48, ал. 3 reaches ПТП and повторна намеса — not опасна as such).
      if (mark !== null && mark.terminatesExam) {
        mistakeBlock.push(`  → Спира самия изпит: „${mark.terminationQuoteBg}“ — ${mark.terminationCitationBg}.`);
      }
      // THE OTHER HALF. A real instructor says both: „this fails your exam,
      // and on the street a camera sends you a фиш for X." Retrieved, never
      // recalled — and silent rather than invented where we hold nothing.
      const covered = coveredElsewhere(g.code);
      /**
       * …AND IT IS PRICED BY CODE, so a code split across two ACT rows must not
       * print its money twice. `roadLines` takes a code and nothing else, so the
       * two rows of one crash would carry the identical «глоба 153,39 €»
       * paragraph and a student adding them up reads 306,78 € for one impact.
       * The figure we hold is per code; saying it once is the whole of what the
       * data supports.
       */
      const roadAlreadySaid = roadSaidForCode.has(g.code);
      const road =
        covered !== null
          ? // ONE ACT, ONE PRICE. Not silence and not a repeat of the figure:
            // the sentence that says WHERE the price is and why the two faults
            // are one offence — the same finding the fault card renders.
            [offenceCoveredLineBg(covered)]
          : roadAlreadySaid
            ? ["Санкцията на пътя за това нарушение е изписана на реда по-горе — не я броим втори път тук."]
            : codeIsKnown(g.code)
              ? roadLines(g.code as ViolationCode, g.worstSpeedDetail)
              : [];
      if (road.length === 0) anyBlank = true;
      else if (covered === null && !roadAlreadySaid) roadSaidForCode.add(g.code);
      for (const line of road) mistakeBlock.push(`  → ${line}`);
    }
    if (anyBlank) {
      mistakeBlock.push(
        "  → За останалите от изброените нарушения санкцията на пътя още не е извлечена дословно от закона, затова тук няма сума. По-добре празно, отколкото сгрешено число.",
      );
    }
    if (groups.length > shown.length) {
      mistakeBlock.push(`• …и още ${groups.length - shown.length} вида нарушения — виж пълния списък в резултата.`);
    }
    /**
     * THE RECONCILIATION, SAID OUT LOUD. `unscoredAfterClose` has existed since
     * the ledger learned to close and no surface ever printed it, so a student
     * was left to reconcile a verdict of 10 against a list of two dangerous
     * rows in his own head — and the arithmetic he would do there is 20. The
     * list is deliberately NOT trimmed to the billed rows: чл. 48, ал. 3 ends
     * the exam, not the drive, and what happened after it is exactly what the
     * simulator kept running to teach.
     */
    if (summary.score.unscoredAfterClose > 0) {
      const rest =
        summary.score.unscoredAfterClose === 1
          ? "затова следващото нарушение се показва, но не добавя точки"
          : `затова следващите ${summary.score.unscoredAfterClose} нарушения се показват, но не добавят точки`;
      /**
       * THE ACT THAT CLOSED IT, AND THE RULE THAT ACTUALLY CLOSES ONE.
       *
       * The sentence here read «Само първата опасна грешка влиза в точките:
       * изпитът се прекратява при нея (Наредба № 38, чл. 48, ал. 3)» — and that
       * is not what чл. 48, ал. 3 says. It ends a practical exam at ПТП and at
       * повторна намеса на комисията, NOT at any опасна: `rules/scoring.ts`'
       * header records that the product once told students every опасна
       * „прекратява изпита на място" and that this was wrong, and
       * `debrief-collision-truth.test.ts` drives the counterexample — two missed
       * zebras, two опасни, both charged, nothing closed.
       *
       * IT ALSO CONTRADICTED THE ROWS DIRECTLY ABOVE IT. Two аварийна-лента
       * опасни and then a crash bills all three, so the verdict says «допуснати
       * са 3 опасни грешки … 30 наказателни точки» and this line said only the
       * first one counted. Naming the closing ACT costs nothing — it is the
       * earliest terminating опасна, the same pick `rules/scoring.ts
       * ledgerCloseTime` makes — and it turns a false general rule into a true
       * statement about this drive.
       */
      const closer = summary.mistakes.reduce<ViolationEvent | undefined>(
        (best, m) =>
          m.terminateSession === true && m.severityClass === "opasna" && (best === undefined || m.t < best.t)
            ? m
            : best,
        undefined,
      );
      const closedAt =
        closer === undefined ? "деянието, което прекратява изпита" : `«${closer.titleBg}»`;
      mistakeBlock.push(
        `• Изпитът е прекратен при ${closedAt}: Наредба № 38, чл. 48, ал. 3 прекратява практическия ` +
          `изпит при пътнотранспортно произшествие и при повторна намеса на комисията — не при всяка ` +
          `опасна грешка (две опасни грешки без произшествие се броят и двете), ${rest}. Показани са, ` +
          `защото в симулатора продължихме да караме за упражнение — на истински изпит дотук щеше да е ` +
          `свършило.`,
      );
      /**
       * THE ARITHMETIC THAT MAKES THE TABLE READABLE — the whole of finding
       * `sc-mw-min-speed:ed5a5b84` in one sentence.
       *
       * On that drive the student was shown four fault cards after the crash,
       * each announcing its own price — «−1 изпитна т.», «−3 изпитни т.», «−10
       * изпитни т.» twice — and then a protocol table reading «Опасни 1 / 10 ·
       * Основни 0 / 0 · Второстепенни 0 / 0 · Общо (допустими 9) 1 / 10».
       * Twenty-four points of announced faults and a total of ten, with nothing
       * anywhere on the screen reconciling the two. The audit read that as the
       * scorer dropping bookings; the frames say the scorer was right and the
       * PRODUCT never explained itself. A tally the student cannot derive from
       * what he was shown is a bare verdict, which THEO-4 forbids.
       *
       * Σ over the rows THIS block priced at zero — the same discipline as the
       * training total below. `pts` because a bare number beside a driving
       * simulator reads as контролни точки.
       *
       * CHECKABLE ONLY BECAUSE THE ROWS NOW CARRY THEIR OWN PRICE. As first
       * written this comment claimed the figure was checkable against the list
       * above it, and it was not: every closed-over row read «без допълнителни
       * точки» and named no number, so 24 stood over 10 + nothing + nothing +
       * nothing. `MistakeGroup.withheldPoints` is what closed that, and the
       * remainder is stated rather than hidden — a group the ledger charged in
       * PART prints its charge and how many rows carried it but not the price
       * of the rest, and a drive with more groups than `MAX_MISTAKE_LINES`
       * folds the overflow into «…и още N вида нарушения». On both the sum here
       * is still the true total, and still larger than what the visible rows
       * name.
       */
      let withheldPoints = 0;
      summary.mistakes.forEach((m, i) => {
        if (!ledgerBilled[i]) withheldPoints += m.points;
      });
      if (withheldPoints > 0) {
        mistakeBlock.push(
          // Neuter singular throughout („това… щеше… не го чети"), because the
          // count behind the figure is 1 on some drives and 4 on others and a
          // sentence that agrees with neither is the „1 движения" defect again.
          `  → Затова таблицата с точките е ДОЛНА ГРАНИЦА, а не брой на грешките: това, което се ` +
            `показа след прекратяването, щеше да струва още ${pts(withheldPoints)}, ако изпитът още ` +
            `вървеше. Изпитът свършва при произшествието — пътят не свършва, затова не го чети като ` +
            `безплатно.`,
        );
      }
    }
    /**
     * THE TRAINING TOTAL IS THIS SHEET'S OWN ARITHMETIC, not a number handed in.
     *
     * `result.effectiveScore` is built twice — `engine.ts buildLessonResult` for
     * the client, `wire.ts gradeFinishWire` for the server — and for eight
     * months only one of them filtered out the rows the ledger closed over. The
     * server's copy is the one `LessonPlayShell.tsx:2683` renders, so what
     * shipped on `sc-hz-accident-scene` L3 was «Тренировъчен резултат: 25
     * наказателни т.» printed directly beneath two rows reading 10 and «без
     * допълнителни точки» — a figure the student could not reach from anything
     * above it, and which appeared on no other surface.
     *
     * Both builders are correct as of this lane. Re-deriving anyway is not
     * belt-and-braces about them: it is what makes the number CHECKABLE. Σ over
     * the rows this block priced, each weighted by the multiplier this block
     * printed — so the line can never again disagree with the list it closes.
     * NOT a loosening: the figure still comes from the coach's recorded
     * multipliers and a drive with no genuine repeat still prints nothing.
     *
     * CONSUMED, NOT MAXED — and this cost a regression to learn. The first
     * version of this re-derivation weighted each row with `escalationAt`, the
     * max-per-(code, t) map built above for the ROW NOTE. `applyEscalations`
     * (escalation.ts) does something different: it queues the records per
     * (code, t) and `shift()`s one per matching event, so a record is spent
     * once. The two agree until TWO BILLED ROWS SHARE A (code, t), which is
     * reachable through the ordinary tick path — two occupied `crossingPassed`
     * events in one tick. Measured, three PEDESTRIAN_NOT_YIELDED at t = 6, 40,
     * 40 against records [×1.5@40, ×2@40]:
     *
     *   applyEscalations  10 + 15 + 20 = 45   ← both builders, and the row
     *                                            `actions.ts:335` persists and
     *                                            `session-history.tsx` badges
     *   max map           10 + 20 + 20 = 50   ← printed to the student
     *
     * 50 appeared on no other surface and could not be reached from the rows
     * above it — which is, word for word, the complaint the paragraph above
     * raises about the shipped 25. A sheet that re-derives has to re-derive the
     * SAME arithmetic, so this walks its own queue exactly as escalation.ts
     * does. The row note keeps the max map: it chooses which multiplier to NAME
     * on a row, and never sums.
     */
    const trainingPending = new Map<string, number[]>();
    for (const esc of result.escalations) {
      const key = `${esc.code}@${esc.t}`;
      const list = trainingPending.get(key);
      if (list) list.push(esc.multiplier);
      else trainingPending.set(key, [esc.multiplier]);
    }
    let trainingTotal = 0;
    summary.mistakes.forEach((m, i) => {
      // Shift for EVERY mistake, billed or not, so the queue is consumed in the
      // same order applyEscalations consumes it — an unbilled row still spends
      // the record that named it. Only billed rows reach the sum.
      const multiplier = trainingPending.get(`${m.code}@${m.t}`)?.shift() ?? 1;
      if (!ledgerBilled[i]) return;
      trainingTotal += m.points * multiplier;
    });
    if (trainingTotal > result.score) {
      mistakeBlock.push(
        `• Тренировъчен резултат: ${pts(trainingTotal)} — повторените грешки тежат повече (×1.5/×2.0). Официалният резултат остава ${pts(result.score)}`,
      );
    }
  }

  // -- gravity before praise --------------------------------------------------
  /**
   * ORDER IS A JUDGEMENT, AND IT WAS WRONG ON THE DRIVE THAT MATTERED MOST.
   *
   * Driven 2026-08-16, `sc-signal-flashing` · mobile · right: four COLLISION
   * events, 4 × опасна = 40 изпитни т., НЕИЗДЪРЖАН — and the debrief opened, in
   * this order, «Какво се получи добре: • Правилно отстъпено предимство», then
   * «Най-важните грешки…». The praise stood above four −10 rows, and the first
   * thing after the verdict is read as the headline.
   *
   * So: an опасна грешка outranks praise, and NOTHING ELSE DOES. Below that
   * line the encouraging order ships exactly as before — a student with a
   * one-point slip is still met with what he did right first, which is the
   * whole reason the section was put there. `hasDangerous` is the summary's own
   * flag (rules/summary.ts), not a re-derivation.
   */
  if (summary.score.hasDangerous) {
    lines.push(...mistakeBlock, ...goodBlock);
  } else {
    lines.push(...goodBlock, ...mistakeBlock);
  }

  // -- teach moments (shown, deliberately not scored) -------------------------
  /**
   * ITS OWN SECTION, PRINTED EXACTLY ONCE. The first draft hung this sentence
   * off the three lines that could otherwise over-claim a clean drive, and the
   * rendered text then carried it THREE TIMES, two lines apart — the same
   * defect rules/catalog.ts records against the COLLISION card („it printed
   * twice, two lines apart"), reproduced by writing the fix in three places
   * instead of one. Hanging it off a sentence also lost it entirely on the run
   * that HAD commendations, because the clean-drive line it rode on is skipped
   * there. A section has neither problem: it appears whenever the channel holds
   * anything, and never twice.
   *
   * Placed after the graded blocks and before the near-misses on purpose — both
   * of those are the same kind of thing, a session fact that carries no points
   * and is said anyway (THEO-4).
   */
  if (coached.length > 0) {
    lines.push("");
    lines.push("Учебни моменти (не влизат в точките):");
    for (const line of coachedLines(coached)) lines.push(line);
    lines.push(
      "Първата среща не се наказва — точно затова я показахме. При повторение вече влиза в изпитния лист, така че не я подминавай.",
    );
  }

  // -- near misses (A15 — session fact, nothing graded) -----------------------
  /**
   * …AND IT NAMES THE MARGIN NOW. The paragraph gave a COUNT and sent the
   * student to a map; the one number that makes „на косъм" mean anything — how
   * close it actually was — was on the result screen's own row («велосипедист —
   * на 0.5 м») and nowhere in the prose that /review/my-drive replays weeks
   * later. A bare count is the bare verdict THEO-4 forbids, wearing the
   * „nothing was graded" sign. Nothing is priced and nothing is re-derived: the
   * clearance is the recorded figure, printed to the same one decimal the row
   * beside it uses.
   */
  if (closestNearMiss !== null) {
    lines.push("");
    lines.push(
      `Разминавания на косъм: ${nearMissCount} — ${
        nearMissCount === 1 ? "" : "най-близкото "
      }${nearMissPhraseBg(closestNearMiss)}. Не се броят като грешки, но на пътя късметът не е стратегия — виж къде се случиха на картата на грешките и мини оттам по-бавно и по-широко.`,
    );
  }

  // -- the rule this lesson exists for, replayed -------------------------------
  /**
   * THE PROTOCOL NEVER TAUGHT THE FACT THE LESSON WAS BUILT AROUND — finding
   * `sc-ac-wet-braking:e59f82a5`.
   *
   * MEASURED · sweep 161 · `sc-ac-wet-braking` · pc · wrong (`run.log`). The
   * lesson is «Спирачен път на мокро». The student brakes at the dry point,
   * runs into the stopped car ahead and is shown «20 наказателни точки ·
   * НЕИЗДЪРЖАН». Searched over the whole captured debrief of that leg: «1,4» —
   * 0 hits. «спирачен път» — 0 hits. «хлъзг» — 0 hits. «мокр» — 2 hits, and
   * both are the lesson TITLE. The one sentence the lesson exists to install —
   * «на мокро спирачният път е около 1,4 пъти по-дълъг от сухия» — appears in
   * the run exactly twice, both times BEFORE the drive: as briefing step 3 and
   * as the demonstration caption (line 185 of the same log). By the time he
   * crashes he has dismissed both, and the debrief that follows never says it
   * again.
   *
   * That shape is not one lesson's. `instructionsBg` on all ~166 templates
   * carries the rule of the drill in the student's own words, and until this
   * block NOTHING downstream of the drive read it — the briefing card
   * (`LessonPlayShell` §4c) is the only consumer and it is gone the moment the
   * car moves.
   *
   * RETRIEVAL, NOT GENERATION (ADR-002). Every character below is the authored
   * template text, byte-for-byte: `lesson.descriptionBg` is `ScenarioSpec
   * .objectiveBg` (`scenario/compile.ts:1259`) and `lesson.briefingBg` is
   * `ScenarioSpec.instructionsBg` with the rung's complication in front
   * (compile.ts:1274). No law is quoted that the template did not quote, no
   * number is derived, nothing is re-priced.
   *
   * ONLY WHEN THERE IS SOMETHING TO RE-READ. A drive that passed with a clean
   * sheet, no teach moment and no near miss gets its debrief byte-identical —
   * the same discipline the verdict line is written to. It is the drive that
   * went wrong that needs the rule back, and it is exactly that drive which had
   * to dismiss the briefing to start.
   *
   * NOT ON THE «Преживей грешката» SANDBOX. `compile.ts:1373` DELETES the
   * briefing there on purpose („showing the correct numbered steps beside
   * „направи грешката нарочно" would be the shell arguing with itself") and
   * rewrites `descriptionBg` to «…направи грешката: <mistake title>». Replaying
   * that as „the rule of this lesson" would print the wrong action as the right
   * one, so the whole block stands out of the way there.
   */
  const somethingToRelearn =
    !result.passed || summary.mistakes.length > 0 || coached.length > 0 || nearMissCount > 0;
  if (somethingToRelearn && lesson.mistakeExperience === undefined) {
    const briefing = lesson.briefingBg ?? [];
    if (briefing.length > 0 || lesson.descriptionBg.length > 0) {
      lines.push("");
      lines.push("Правилото на този урок (от инструктажа преди карането):");
      if (lesson.descriptionBg.length > 0) lines.push(`• ${lesson.descriptionBg}`);
      // Numbered from the compiled list's own `n`, not from the loop index —
      // the complication rung renumbers behind its own step 1 (compile.ts) and
      // the debrief must not invent a second numbering for the same briefing.
      for (const step of briefing) lines.push(`${step.n}. ${step.textBg}`);
      lines.push(
        "Прочети го пак сега, докато карането е прясно — това е разликата между „знам го“ и „правя го“.",
      );
    }
  }

  // -- what to practice next --------------------------------------------------
  const conceptIds = summary.conceptIds;
  if (conceptIds.length > 0) {
    // Focus = the concept behind the single most severe mistake (dangerous
    // first, then most damaging). This is the concrete "start here" pointer.
    const focusId = groups.length > 0 ? groups[0].conceptId : conceptIds[0];
    const focusTitle = focusId ? context.conceptTitles?.[focusId] : undefined;
    lines.push("");
    if (focusTitle) {
      lines.push(
        `Какво да упражниш: започни от „${focusTitle}“ — темата зад най-тежката ти грешка. Отвори я в раздел „Теория“, после повтори урока.`,
      );
    } else {
      lines.push(
        "Какво да упражниш: грешките по-горе са свързани с конкретни теми от теорията — премини ги отново в раздел „Теория“, после повтори урока.",
      );
    }
  } else if (groups.length > 0) {
    /**
     * MISTAKES WITH NO CONCEPT BEHIND THEM — the branch that did not exist, and
     * the hole was not theoretical. `summary.conceptIds` is built from the
     * mistakes' `conceptId`, and THREE catalogue codes deliberately carry none:
     * FOLLOWING_TOO_CLOSE, NOT_KEEPING_RIGHT and POOR_LANE_KEEPING. A drive
     * convicted of nothing else therefore fell through to the „карането беше
     * чисто" line below — i.e. exactly the tailgating and keep-right lessons
     * (sc-follow-distance, sc-follow-brake, sc-ov-keep-right) told the student
     * his driving had been clean while their own error table listed the fault.
     *
     * There is no theory topic to link, so the pointer is the fault itself,
     * named from the group the run already ranked worst. «…» for the same
     * reason `unfinishedTaskPhrase` uses it — catalogue titles quote signs
     * («Неспиране на знак Б2 „Спри!“»), so „…“ around them nests.
     */
    lines.push("");
    lines.push(
      `Какво да упражниш: започни от «${groups[0].titleBg}» — това е най-тежката ти грешка в този урок. Прочети правилното действие по-горе и повтори урока с него наум.`,
    );
  } else if (!result.passed && !result.aborted && !result.completedAll) {
    lines.push("");
    /**
     * Reachable now ONLY with an empty mistake list (`groups.length === 0`),
     * which is what „карането беше чисто" always claimed to mean. It is still
     * scoped to the sheet, and still yields to a teach moment when one is known.
     */
    lines.push(
      coached.length > 0
        ? "Какво да упражниш: повтори урока, завърши всички задачи от маршрута и внимавай за учебния момент по-горе."
        : nearMissCount > 0
          ? // Its own branch and not the teach one: „внимавай за учебния момент"
            // would point at a section this drive does not have.
            "Какво да упражниш: повтори урока, завърши всички задачи от маршрута и мини по-широко там, където се размина на косъм."
          : "Какво да упражниш: повтори урока и завърши всички задачи от маршрута — карането беше чисто по изпитния лист.",
    );
  }

  // AI debrief hook — see the AI DEBRIEF SEAM header. The tutor module would
  // slot in here: given `lesson`, `result`, `context` and `lines.join("\n")`
  // as the grounding draft, produce a personalized rephrase (citations intact).
  // It needs an API key (ADR-002) and is intentionally NOT called now; the
  // deterministic template below is the shipped + fallback text.
  return { text: lines.join("\n"), conceptIds };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * „допусната е опасна грешка" WITH THE ACT IN IT.
 *
 * MEASURED · sweep 161 · `sc-rx-guarded` · pc · wrong
 * (`.audit-frames/sweep161/sc-rx-guarded/pc-wrong/08-debrief.png`, and the DOM
 * dump beside it in `run.log`): everything above the fold on a 1440×900 desktop
 * read «Не всички задачи от маршрута бяха изпълнени», «допусната е опасна
 * грешка — директно неиздържан», «повече от 9 наказателни точки от изпитния
 * лист» and a 1/0/0 table. The offence — «Нарушение на правилата за жп прелез»
 * — was named exactly once in the whole document, in the mistakes block, which
 * on that viewport sat below two more cards. The student is shown a verdict and
 * a number with nothing attached to either. A verdict is not a verdict until it
 * says what for, and this file owns the one sentence that carries the criteria.
 *
 * THE PICK IS `rules/gravest.ts`, NOT `mistakes[0]`. Наредба № 38 ranks by class
 * and then by чл. 48, ал. 3 (a ПТП outranks a merely-failed sheet at the same 10
 * points); chronological order has no standing at all, which is that file's
 * entire subject. Nothing is re-priced here — the ordering is borrowed, the
 * points stay where the summary put them.
 *
 * Falls back to the bare clause when nothing resolves. `summary.mistakes` can in
 * principle carry a code the catalogue does not (pre-drive machine, future
 * codes), and a verdict reading „опасна грешка «undefined»" is worse than one
 * that says less — the same discipline as `roadLines` returning empty rather
 * than guessing a fine.
 */
function dangerousCriterionBg(summary: LessonResult["summary"]): string {
  const dangerous = summary.mistakes.filter((m) => m.severityClass === "opasna");
  const gravest = gravestViolation(dangerous.map((m) => m.code));
  // The EVENT's own titleBg and not the catalogue row's: RAIL_CROSSING_VIOLATION
  // grades three different acts under one code and carries per-act copy
  // (rules/catalog.ts), so the row would name the code where the event names the
  // deed. «…» around it for `unfinishedTaskPhrase`'s reason — catalogue titles
  // quote signs in „…“, and the outer pair has to be the one that moves.
  const worst =
    (gravest === null ? undefined : dangerous.find((m) => m.code === gravest.code)) ?? dangerous[0];
  if (worst === undefined) return "допусната е опасна грешка";
  return summary.score.opasniCount > 1
    ? `допуснати са ${summary.score.opasniCount} опасни грешки, най-тежката «${worst.titleBg}»`
    : `допусната е опасна грешка: «${worst.titleBg}»`;
}

/**
 * WHICH task was left — by name, from `ObjectiveOutcome.titleBg`.
 *
 * The sentence used to end at „остана неизпълнена задача от маршрута", and a
 * student who has just been shown a red НЕИЗДЪРЖАН over a spotless error table
 * cannot act on that. Measured on the 2026-08-16 sweep: `sc-ov-keep-right`'s
 * debrief named no task at all, and `sc-signal-flashing`'s named none either
 * while the route sheet ON THE SAME SCREEN listed one open row («– Премини
 * правó напред, след като пропуснеш идващия отдясно»). The titles were already
 * in the result; nothing new is measured here, it is only said.
 *
 * The old wording survives as the fallback for a result with no objectives at
 * all (a free drive is vacuously complete, so this is unreachable there — but a
 * server-rebuilt result with an empty list must still read as a sentence).
 *
 * «…» AND NOT „…“ FOR THE TITLES, and the reason is in the rendered text rather
 * than in a style guide: objective titles quote road signs, so the first draft
 * printed „Премини кръстовището със знак „Стоп““ — a quote opened twice and
 * closed twice with nothing saying which pair was which. The authored title is
 * not ours to re-punctuate, so the OUTER pair moves.
 */
function unfinishedTaskPhrase(result: LessonResult): string {
  const open = result.objectives.filter((o) => !o.done);
  if (open.length === 0) return "остана неизпълнена задача от маршрута";
  const named = open
    .slice(0, MAX_UNFINISHED_NAMED)
    .map((o) => `«${o.titleBg}»`)
    .join(", ");
  if (open.length === 1) return `остана неизпълнена задачата ${named}`;
  const rest =
    open.length > MAX_UNFINISHED_NAMED ? ` и още ${open.length - MAX_UNFINISHED_NAMED}` : "";
  return `останаха неизпълнени задачите ${named}${rest}`;
}

/**
 * The teach moments as bullets — the half of the drive the score is
 * deliberately silent about (DebriefContext.coachedMistakes).
 *
 * THEO-4: a virtual instructor explains every decision, and „we saw it and
 * chose not to charge you" is a decision. Nothing is priced here: the lines
 * name the acts, and the sentence the caller prints under them states the rule
 * that the NEXT one costs points — which is exactly what the live teach card
 * said and what the debrief then forgot. Deduplicated by title, because the
 * queue that raises these was measured EIGHT deep on one drive.
 *
 * …AND A NAME IS NOT A TEACH. Until this lane the whole section was three bare
 * labels — «• Превишена скорост», «• Рязко спиране без причина», «• Неустойчиво
 * движение в лентата» — under a heading saying they cost nothing. That is the
 * bare verdict THEO-4 forbids, wearing the opposite sign: the student is told a
 * category and given no way to act on it, on the one channel that exists
 * BECAUSE the sheet stayed silent. Measured on `sc-signal-flashing__pc-right`
 * (w13), whose only teach row read «• Рязко спиране без причина» and stopped
 * there, and on `sc-ac-wind-truck-pass__pc-wrong`, two rows, same shape.
 *
 * The fix is retrieval, not generation: `VIOLATIONS[code].correctiveBg` is the
 * authored „какво трябваше да направя" line the catalogue already carries and
 * the mistakes block already prints for the SCORED half of the same drive
 * (ADR-002 — the AI never free-recalls; A15 authored copy). A charge is still
 * not made and no law is quoted: the price stays withheld, the corrective is
 * given. An uncatalogued code degrades to the bare row exactly as before.
 */
function coachedLines(coached: ReadonlyArray<{ code: string; titleBg: string }>): string[] {
  /** First code seen per title — the corrective is authored per code. */
  const counts = new Map<string, { n: number; code: string }>();
  for (const c of coached) {
    const prev = counts.get(c.titleBg);
    if (prev === undefined) counts.set(c.titleBg, { n: 1, code: c.code });
    else prev.n += 1;
  }
  const rows: string[] = [];
  for (const [title, g] of [...counts.entries()].slice(0, MAX_COACHED_NAMED)) {
    rows.push(`• ${title}${g.n > 1 ? ` ×${g.n}` : ""}`);
    const corrective = correctiveFor(g.code);
    // Indented „→" exactly as the mistakes block indents its own corrective, so
    // the two halves of one drive read as one instructor and not as two.
    if (corrective !== null) rows.push(`  → Правилното действие: ${corrective}`);
  }
  if (counts.size > MAX_COACHED_NAMED) {
    rows.push(`• …и още ${counts.size - MAX_COACHED_NAMED} — виж пълния списък в резултата.`);
  }
  return rows;
}

/**
 * „a, b и c" — a Bulgarian list, agreeing, from however many clauses there are.
 *
 * Written because the clause it serves used to be selected by COUNT, and a
 * count cannot tell three channels apart (see the `where` block). Empty in,
 * empty out: the caller never renders it then.
 */
function joinBg(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

/**
 * WHAT WAS NEARLY HIT, IN ONE WORD — the single source for both post-drive
 * surfaces.
 *
 * `hud/SessionEndScreen.tsx` kept its own copy of this map, which is how two
 * surfaces of one result screen come to name the same encounter differently.
 * It imports this one now. Exported rather than duplicated for the reason
 * `commendationRiderBg` is: a judgement (or a noun) written twice diverges.
 */
export const NEAR_MISS_KIND_BG: Record<SessionNearMiss["kind"], string> = {
  vehicle: "автомобил",
  pedestrian: "пешеходец",
  cyclist: "велосипедист",
};

/**
 * The TIGHTEST encounter of the run, or null — the only defensible pick for a
 * one-line summary, for the same reason `worstSpeedDetail` picks the fastest:
 * it is the margin the student actually drove on. Ties keep the earlier one.
 */
export function nearMissClosest(
  nearMisses: ReadonlyArray<SessionNearMiss>,
): SessionNearMiss | null {
  let best: SessionNearMiss | null = null;
  for (const n of nearMisses) {
    if (best === null || n.clearanceM < best.clearanceM) best = n;
  }
  return best;
}

/**
 * „велосипедист на 0,5 м" — the recorded clearance, in the decimal comma this
 * product writes numbers with, and nothing derived. One decimal because that is
 * the precision the result screen's own near-miss row prints
 * (`clearanceM.toFixed(1)`), and two surfaces must not round one measurement
 * differently.
 */
export function nearMissPhraseBg(n: SessionNearMiss): string {
  return `${NEAR_MISS_KIND_BG[n.kind]} на ${n.clearanceM.toFixed(1).replace(".", ",")} м`;
}

/** Escalated values can be half-points (3 × 1.5 = 4.5) — print them cleanly. */
function fmtPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * „1 наказателна т." / „4.5 наказателни т." — the unit, agreeing.
 *
 * Every point figure this file prints goes through here. That is the whole
 * wave in one function: a bare „т." reads as КОНТРОЛНИ точки to a Bulgarian
 * driver, and the founder read his lesson score as his licence because of it.
 * Escalated half-points come through as 4.5, which is plural.
 */
function pts(n: number): string {
  return pointsLabelBg(Number(fmtPoints(n)), "наказателна", "наказателни");
}

/**
 * A15: authored corrective action for a violation code (catalog correctiveBg).
 * Guarded lookup — MistakeGroup.code is a plain string (pre-drive machine and
 * future codes flow through here), so an unknown code degrades to no line.
 */
function correctiveFor(code: string): string | null {
  if (!(code in VIOLATIONS)) return null;
  return VIOLATIONS[code as ViolationCode].correctiveBg;
}

/** MistakeGroup.code is a plain string; only catalogued codes have a basis. */
function codeIsKnown(code: string): boolean {
  return code in VIOLATIONS;
}

/**
 * THE REAL-WORLD HALF, as coaching lines.
 *
 * Returns EMPTY when nothing has been retrieved for the code — the caller then
 * prints one honest sentence for the whole list instead of four identical
 * apologies. Every number below comes out of `rules/consequences.ts`, whose
 * quotes are re-cut from `content/law/acts` by its own test; this function
 * composes sentences around them and introduces no figure of its own.
 */
/** The licence half of any figure, said the one way it is said everywhere. */
function cpPhraseBg(cp: ControlPointsFigure): string {
  if (cp.status === "grounded" && cp.points !== null) return `${cp.points} контролни точки от книжката`;
  if (cp.status === "not-listed") return "0 контролни точки — нарушението не е в изчерпателния списък";
  return "контролни точки: не е установено";
}

/**
 * A gated penalty as one sentence, CONDITION FIRST. The order is the whole
 * point: „300 € ако стане ПТП" is read as three hundred euro, and „ако от
 * нарушението настъпи ПТП — 300 €" is read as a condition.
 */
function gatedLineBg(step: ConditionalPenalty): string {
  return (
    `${step.conditionBg[0].toUpperCase()}${step.conditionBg.slice(1)} — глоба ` +
    `${formatEur(step.fine.eurCents)} (${step.fine.amountBgn} лв. по текста на закона) и ` +
    `${cpPhraseBg(step.controlPoints)}. (${step.fine.source.citationBg})`
  );
}

function roadLines(code: ViolationCode, speedDetail?: string): string[] {
  const road = roadConsequenceFor(code);
  if (road.kind === "unknown") return [];

  if (road.kind === "authored") {
    const refs = road.refsBg.length > 0 ? ` (${road.refsBg.join("; ")})` : "";
    // `withEurBg` and not the raw prose: the structured branch below quotes the
    // fine in euro, and the same debrief printing лв. in one paragraph and € in
    // the next is the two-currency defect in text form. Anything inside „…“ is
    // left exactly as the act wrote it.
    return [`На пътя (не влиза в оценката на урока): ${withEurBg(road.textBg)}${refs}`];
  }

  if (road.kind === "single") {
    return [
      `На пътя (не влиза в оценката на урока): глоба ${formatEur(road.fine.eurCents)} ` +
        `(${road.fine.amountBgn} лв. по текста на закона) и ${cpPhraseBg(road.controlPoints)}. Пристига като ` +
        `${instrumentLabelBg(road.fine.instruments)}. ` +
        `(${road.fine.source.citationBg}; ${road.controlPoints.source.citationBg})`,
      ...(road.escalation ?? []).map(gatedLineBg),
    ];
  }

  /**
   * IT COSTS NOTHING ON THE STREET, AND THAT IS THE LINE. Not an empty return:
   * `roadLines` returns empty for „we have not retrieved this yet", and the
   * caller then prints one collective apology. A fault we HAVE researched and
   * found to carry no road penalty must not be swept into that pile — the
   * student would read „unknown" where the answer is „nothing".
   */
  if (road.kind === "exam-only") {
    return [
      `На пътя (не влиза в оценката на урока): ${road.headlineBg} ${road.whyBg} ` +
        `(изпитната половина: ${road.examSource.citationBg})`,
    ];
  }

  /** The duty is broken, the money is gated — both halves or neither. */
  if (road.kind === "conditional") {
    const licence =
      road.controlPoints === undefined
        ? ""
        : ` Книжка: ${cpPhraseBg(road.controlPoints)}.`;
    return [
      `На пътя (не влиза в оценката на урока): ${road.headlineBg}${licence}`,
      ...road.branches.map(gatedLineBg),
    ];
  }

  // A ladder: one exam fault, several road penalties. THE STUDENT'S OWN RUNG
  // COMES FIRST when the reducer carried his speed and the limit through on the
  // event — that is the whole point of `deriveSpeedingBand`, and „here is the
  // table, find yourself" was the defect. The act's rungs still follow it,
  // because the ladder is the teaching; and ал. 2's answer is given alongside
  // whenever it differs, since the engine does not know whether the lesson was
  // in a населено място and inventing that would be inventing the penalty.
  const measured = parseSpeedMeasurement(speedDetail);
  const derived: string[] = [];
  if (measured !== null) {
    const here = deriveSpeedingBand({ ...measured, scope: "urban" });
    const outside = deriveSpeedingBand({ ...measured, scope: "outsideUrban" });
    derived.push(`Твоят случай: ${here.arithmeticBg} ${here.verdictBg}`);
    if (here.escalation !== null) derived.push(here.escalation.noteBg);
    if (outside.totalBgn !== here.totalBgn || outside.tier?.fine.banBg !== here.tier?.fine.banBg) {
      derived.push(`Ако беше извън населено място: ${outside.verdictBg}`);
    }
    derived.push(here.toleranceBg);
  }
  const rungs = road.tiers
    .map((t) => {
      const ban = t.fine.banBg === null ? "" : ` + ${t.fine.banBg}`;
      const cp =
        t.controlPoints.status === "grounded" && t.controlPoints.points !== null
          ? ` и ${t.controlPoints.points} контролни точки`
          : "";
      return `${t.bandBg} — ${formatEur(t.fine.eurCents)}${ban}${cp}`;
    })
    .join("; ");
  const low = road.tiers[0];
  const high = road.tiers[road.tiers.length - 1];
  return [
    ...derived,
    `На пътя (не влиза в оценката на урока) глобата зависи от превишението — ${road.scopeBg}: ${rungs}.`,
    road.appliesBg,
    `Долните стъпала пристигат като ${instrumentLabelBg(low.fine.instruments)}; горните — като ` +
      `${instrumentLabelBg(high.fine.instruments)}. ${road.footnoteBg}`,
  ];
}

/**
 * Coaching line comparing this attempt's penalty points to the driver's own
 * best on this lesson. Aborted attempts (score not comparable) are skipped, as
 * is the first-ever attempt (no history).
 */
function improvementLine(
  result: LessonResult,
  priorBestScore: number | null | undefined,
): string | null {
  if (result.aborted || priorBestScore === null || priorBestScore === undefined) {
    return null;
  }
  /**
   * EVERY number in these three sentences, not just the first one.
   *
   * The rule this file is built on is `pts`'s own docstring — „Every point
   * figure this file prints goes through here" — and two figures in this
   * function did not. MEASURED · sweep 161 · `sc-signal-flashing` · mobile ·
   * right (`.audit-frames/sweep161/sc-signal-flashing/mobile-right/08-debrief
   * .png`; the sentence is in `audit.log` under INSTRUCTOR DEBRIEF): «Най-
   * добрият ти резултат за този урок остава 0 наказателни т. по изпитния лист;
   * този път допусна повече (40).» A bare „(40)" two sentences after a „10
   * изпитни т." and one sentence before the контролни-точки explainer — the
   * exact reading the founder made of his own lesson score, printed on the
   * drive with four collisions on it. The comparison sentence had the same hole
   * in „срещу най-добрите ти 4 досега".
   */
  const now = result.score;
  if (now < priorBestScore) {
    return `Личен напредък: ${pts(now)} по изпитния лист срещу най-добрите ти ${pts(priorBestScore)} досега за този урок — свали резултата, продължавай така.`;
  }
  if (now === priorBestScore) {
    /**
     * „СЛЕДВАЩАТА ЦЕЛ Е ДА ГО ПОДОБРИШ" IS AN INSTRUCTION THAT CANNOT BE
     * CARRIED OUT AT THE BOTTOM OF THE SCALE.
     *
     * `score` is penalty points and the floor is zero, so a tie AT zero is the
     * best sheet the lesson can produce — and the line told the student to beat
     * it. MEASURED · sweep 161 · `sc-vu-emergency/pc-right/log.txt` (the leg the
     * ИЗДЪРЖАН + ★★★ + „+100 XP" card was read off) and · w13 ·
     * `sc-signal-flashing__pc-right`, both verbatim: «Изравни най-добрия си
     * резултат за този урок (0 наказателни т. по изпитния лист). Следващата цел
     * е да го подобриш.»
     *
     * The honest goal at the floor is REPETITION, which is also the product's
     * own standing line about what counts as learned (see
     * COMMENDATION_CONTRADICTED_BG). Every other tie keeps the sentence it had.
     */
    return priorBestScore === 0
      ? `Изравни най-добрия си резултат за този урок (${pts(priorBestScore)} по изпитния лист) — и по-нисък няма, нулата е дъното на скалата. Следващата цел не е по-малко, а същото, повторено: умението се брои за усвоено, когато излиза ВСЕКИ път.`
      : `Изравни най-добрия си резултат за този урок (${pts(priorBestScore)} по изпитния лист). Следващата цел е да го подобриш.`;
  }
  return `Най-добрият ти резултат за този урок остава ${pts(priorBestScore)} по изпитния лист; този път допусна повече (${pts(now)}). Спокойно — повтори го и ще го стигнеш.`;
}

/**
 * COMMEND AND CONVICT THE SAME SKILL, AND SAY SO.
 *
 * The contradiction axis is the `conceptId` — the one field both catalogues
 * already share (rules/catalog.ts), so this is a lookup and not a new opinion:
 * YIELDED_TO_PRIORITY and FAILURE_TO_YIELD are both `c-priority-concept`;
 * PEDESTRIAN_YIELDED and PEDESTRIAN_NOT_YIELDED are both `c-crosswalk-yield`;
 * FULL_STOP_AT_STOP_SIGN and STOP_SIGN_NO_FULL_STOP are both
 * `c-give-way-stop-behavior`; SAFE_LANE_CHANGE and LANE_CHANGE_WITHOUT_INDICATOR
 * are both `c-lane-change`; PREDRIVE_PERFECT and the two predrive faults are
 * both `c-pre-drive-check`. `summary.conceptIds` is built from the MISTAKES
 * only (rules/summary.ts), so membership means „this drive was penalised for
 * this very skill".
 *
 * CLEAN_DRIVING IS THE ONE THAT CANNOT USE THAT AXIS, AND IT WAS THEREFORE
 * GETTING NOTHING. This paragraph used to read „it is correctly left alone: it
 * is awarded for a measured violation-free STRETCH, which a fault somewhere
 * else in the drive does not retract." The premise is true; the conclusion was
 * measured false on the page.
 *
 * MEASURED · w13 · `sc-ac-wind-truck-pass`, BOTH platforms
 * (`frames/sc-ac-wind-truck-pass__pc-wrong/_audit-debrief.json` and the
 * `mobile-wrong` twin, plus both `run.log`s): a drive stamped НЕИЗДЪРЖАН · 39
 * наказателни точки · 3 опасни (one of them a collision at 1:13) · 3 основни,
 * whose debrief closes with «Какво се получи добре: • Чисто и спокойно каране
 * ×2» — and whose «Похвали» card prints it twice with clocks, at 0:49 and 1:11.
 * The 1:11 one is twelve seconds after driving up the emergency lane and two
 * seconds before the crash. A student who ran into something is told, on the
 * card that fails him, that his driving was clean and calm.
 *
 * The engine is RIGHT: `rules/engine.ts` awards this per 250 m of
 * violation-free travel and resets the counter on every fresh fault, so each
 * of those two stretches happened. What is wrong is the SENTENCE. The other
 * five commendations name a SKILL («Правилно отстъпено предимство») and a skill
 * is not retracted by the rest of the drive; this one names the DRIVE
 * («Чисто и спокойно каране») — a claim about the absence of faults — and the
 * drive is exactly what the mistakes block is about to contradict. So its
 * contradiction axis is not a `conceptId` it does not have: it is the run's own
 * fault ledger, which is the only thing „чисто" can mean.
 *
 * NOT A DELETION, for the same reason `COMMENDATION_CONTRADICTED_BG` is not
 * one — the metres were driven and the credit is owed (the XP for them is
 * booked off the EVENT, `gamification/xp.ts`, and is not touched from here).
 * What the student stops being handed is the unscoped reading.
 */
function commendationLines(result: LessonResult): string[] {
  const seen = new Map<string, { count: number; contradicted: boolean; unclean: boolean }>();
  for (const c of result.summary.commendations) {
    // ONE derivation, two surfaces — see `commendationRiderFlags`. The card
    // asks the same question per ROW; this block ORs the answers across the
    // rows a title pools, because the bullet stands for all of them.
    const { contradicted, unclean } = commendationRiderFlags(result.summary, c);
    const prev = seen.get(c.titleBg);
    if (prev === undefined) seen.set(c.titleBg, { count: 1, contradicted, unclean });
    else {
      prev.count += 1;
      prev.contradicted = prev.contradicted || contradicted;
      prev.unclean = prev.unclean || unclean;
    }
  }
  return [...seen.entries()]
    .slice(0, MAX_COMMENDATION_LINES)
    .map(([title, g]) => {
      const rider = commendationRiderBg(result.summary, g);
      // The dash is this medium's punctuation — see COMMENDATION_CONTRADICTED_BG.
      return `• ${title}${g.count > 1 ? ` ×${g.count}` : ""}${rider === null ? "" : ` — ${rider}`}`;
    });
}

/**
 * WHICH RIDERS ONE COMMENDATION HAS EARNED ON THIS DRIVE — the two questions
 * `commendationLines` asks, lifted out so a SECOND surface can ask them.
 *
 * MEASURED · w13 · `sc-ac-wind-truck-pass`, both platforms
 * (`frames/sc-ac-wind-truck-pass__pc-wrong/_audit-debrief.json`, verbatim):
 * `section[aria-label="Похвали"]` reads «Похвали ✓ Чисто и спокойно каране 0:49
 * ✓ Чисто и спокойно каране 1:11» — bare title, bare clock, twice — on the same
 * card that prints «39 наказателни точки · НЕИЗДЪРЖАН · Опасни грешки 3 30»,
 * one of those опасни a collision two seconds after the second commendation.
 * The debrief prose beside it now carries the scope (`cleanDrivingScopeBg`);
 * the CARD carried nothing, so the repair landed on the surface the finding
 * does not name and the photographed one kept handing out the certificate.
 *
 * A JUDGEMENT MADE TWICE IS A JUDGEMENT THAT WILL DIVERGE — this file's own
 * standing rule («the two surfaces must not diverge», the ledger-close note).
 * So the derivation lives here, once, and `hud/SessionEndScreen.tsx` reads it;
 * neither surface can ever again praise a skill the other qualifies.
 *
 * Both questions are lookups over the summary, not new opinions:
 *  · `contradicted` — the praise's `conceptId` is among the ones the MISTAKES
 *    produced (`rules/summary.ts` builds `conceptIds` from mistakes only), i.e.
 *    this very skill was also penalised;
 *  · `unclean` — CLEAN_DRIVING is the one code that names the DRIVE rather than
 *    a skill, and any scored row falsifies „чисто".
 */
export interface CommendationRiders {
  contradicted: boolean;
  unclean: boolean;
}

export function commendationRiderFlags(
  summary: LessonResult["summary"],
  c: { code: string; conceptId?: string },
): CommendationRiders {
  return {
    contradicted: c.conceptId !== undefined && summary.conceptIds.includes(c.conceptId),
    // Keyed on the CODE and not on the title: `rules/catalog.ts` retitles
    // pooled praise per situation (YIELD_PRAISE_SITUATION_COPY), so a title
    // match is not a code match on this channel.
    unclean: c.code === "CLEAN_DRIVING" && summary.mistakes.length > 0,
  };
}

/**
 * The rider text for a set of flags, WITHOUT leading punctuation — null when
 * the commendation stands unqualified, which is the common case and must stay
 * byte-identical on both surfaces (a spotless drive's praise is untouched).
 */
export function commendationRiderBg(
  summary: LessonResult["summary"],
  flags: CommendationRiders,
): string | null {
  const parts: string[] = [];
  if (flags.contradicted) parts.push(COMMENDATION_CONTRADICTED_BG);
  if (flags.unclean) parts.push(cleanDrivingScopeBg(summary));
  return parts.length === 0 ? null : parts.join(" — ");
}

/**
 * The rider CLEAN_DRIVING needs, said in terms of this drive.
 *
 * Order-neutral («в същия урок»), because „gravity before praise" puts the
 * mistakes block above this line on a dangerous run and below it otherwise —
 * the same discipline `COMMENDATION_CONTRADICTED_BG` is written to.
 *
 * The опасни count is `summary.score.opasniCount`, which is the figure the
 * verdict above and the protocol table on the same screen both print («Опасни
 * грешки (по 10 изпитни т.) 3 30»). Nothing is re-derived and nothing is
 * priced: the rider states WHAT the praise was measured over and leaves every
 * number where the summary put it.
 */
function cleanDrivingScopeBg(summary: LessonResult["summary"]): string {
  const opasni = summary.score.opasniCount;
  const alsoBg =
    opasni === 1
      ? "в същия урок има и опасна грешка"
      : opasni > 1
        ? `в същия урок има и ${opasni} опасни грешки`
        : "в същия урок има и отбелязани грешки";
  // No leading „ — ": the sentence is shared with the result screen's «Похвали»
  // card, which prints it as a line of its own. See COMMENDATION_CONTRADICTED_BG.
  return (
    `но само на отделни отсечки от маршрута: ${alsoBg}. Похвалата е за метрите без` +
    ` нито едно нарушение, не за урока — „чисто каране“ се брои чак когато ЦЯЛОТО каране е такова.`
  );
}

/** Excess over the limit, for picking the worst event in a speeding group. */
function excessOf(detail: string | undefined): number | null {
  const m = parseSpeedMeasurement(detail);
  return m === null ? null : m.measuredKmh - m.limitKmh;
}

/**
 * ONE ROW PER ACT, PRICED BY THE LEDGER — not one row per CODE, priced by
 * addition.
 *
 * MEASURED 2026-08-18, `sc-hz-accident-scene` L3, the tight-and-fast squeeze:
 * the student strikes a wrecked car and then a bystander 0.3 s later. The
 * engine bills both, `makeViolation` stamps each with its own authored copy
 * («Удар в друго превозно средство» / «Удар в пешеходец»), the ledger closes at
 * the first and scores 10 — and this function collapsed the two into one group
 * by CODE, took the FIRST row's title for both, and added the points. The
 * debrief then told a seventeen-year-old, in four separate false sentences,
 * that he had hit two VEHICLES for 20 points as a REPEATED mistake worth a
 * training total of 25. «Пешеходец» appeared nowhere in it. The one thing that
 * actually happened — he ran over a person — was the thing grouping deleted.
 *
 * So the key is (code, act) and the price is what `ledgerBilling` says was
 * charged. Both halves matter and each defends a direction:
 *  · keying on the ACT alone would split a speeding group by its measurement
 *    (`detail` carries the km/h) and print five rows for one continuing
 *    offence, so only codes with AUTHORED per-act copy split — `actCopy`
 *    answers that, and answers it from the catalogue rather than from a list
 *    kept here that would rot the next time a code grades two acts;
 *  · summing `points` would keep publishing a figure the verdict contradicts,
 *    and it is the SHOWN rows that make the list long, so `count` still counts
 *    every row and only the money follows the ledger.
 */
function groupMistakes(
  mistakes: ReadonlyArray<ViolationEvent>,
  billed: ReadonlyArray<boolean>,
): MistakeGroup[] {
  const byAct = new Map<string, MistakeGroup>();
  mistakes.forEach((m, i) => {
    const act = codeIsKnown(m.code) ? actCopy(m.code as ViolationCode, m.detail) : null;
    const actKey = act === null ? undefined : m.detail;
    const paid = billed[i] === true ? m.points : 0;
    const withheld = billed[i] === true ? 0 : m.points;
    const key = `${m.code}|${actKey ?? ""}`;
    const g = byAct.get(key);
    if (g) {
      g.count += 1;
      g.billedCount += billed[i] === true ? 1 : 0;
      g.totalPoints += paid;
      g.withheldPoints += withheld;
      g.times.push(m.t);
      if (billed[i] === true) g.billedTimes.push(m.t);
      const here = excessOf(m.detail);
      const best = excessOf(g.worstSpeedDetail);
      if (here !== null && (best === null || here > best)) g.worstSpeedDetail = m.detail;
    } else {
      byAct.set(key, {
        code: m.code,
        titleBg: m.titleBg,
        lawRef: m.lawRef,
        conceptId: m.conceptId,
        severityClass: m.severityClass,
        severityLabel: SEVERITY_LABEL[m.severityClass],
        points: m.points,
        count: 1,
        billedCount: billed[i] === true ? 1 : 0,
        totalPoints: paid,
        withheldPoints: withheld,
        actKey,
        actExplanationBg: act?.explanationBg,
        times: [m.t],
        billedTimes: billed[i] === true ? [m.t] : [],
        worstSpeedDetail: excessOf(m.detail) === null ? undefined : m.detail,
      });
    }
  });
  return [...byAct.values()].sort((a, b) => {
    const rank = SEVERITY_RANK[b.severityClass] - SEVERITY_RANK[a.severityClass];
    if (rank !== 0) return rank;
    const paid = b.totalPoints - a.totalPoints;
    // A row the closure zeroed still outranks a lighter one that was charged —
    // running a person over is not the least of the drive because the exam had
    // already ended. Ties inside a class fall back to how many rows there were.
    return paid !== 0 ? paid : b.count - a.count;
  });
}

/**
 * WHICH GROUPS THE SHEET PRINTS — the cap, with the one class it may not spend
 * itself on.
 *
 * MEASURED 2026-08-19, and it is the cost of the fix directly above. Four
 * charged опасни (непропускане, пешеходец, обратна посока, червено) and then
 * the crash: a wrecked car at t = 13.13 and the bystander at 13.43. Under the
 * blind-sum grouping this file used to do, COLLISION was ONE group worth 20 and
 * sorted first, so the crash was the sheet's opening line. Pricing it honestly
 * — 10 for the car, 0 for the man the closure covered — dropped both rows below
 * four ties at 10 and the sheet became:
 *
 *   • Непропускане на пътно превозно средство с предимство …
 *   • Непропускане на пешеходец …
 *   • Движение в обратна посока по еднопосочна улица …
 *   • Преминаване на червен сигнал …
 *   • …и още 2 вида нарушения — виж пълния списък в резултата.
 *
 * «Удар в пешеходец»: absent. «Удар в друго превозно средство»: absent. The
 * honest build was MORE SILENT about the man in the road than the broken one,
 * on the only surface that carries the corrective, the law and «Какво стана».
 *
 * WHY EXEMPTION AND NOT RE-ORDERING. Re-ordering cannot reach this: every row
 * here is опасна and every one is a catalog 10, so sorting by severity, by
 * shown points or by billed points leaves six exact ties and the crash still
 * lands wherever insertion order puts it — last, because it happened last. And
 * the demotion is not an accident of one drive: the closure zeroes precisely
 * the rows that FOLLOW the gravest event, so a price-ordered sheet will
 * systematically bury the worst thing that happened whenever it happened late.
 * The rule has to be about the CLASS, not the number.
 *
 * The class is `terminatesExam` — the catalogue's own flag (`rules/scales.ts`
 * examMarkFor, Наредба № 38 чл. 48, ал. 3), which today is COLLISION alone. Not
 * hardcoded to that code: a fault grave enough to end an exam is grave enough
 * to be on the sheet that explains the exam, and a future terminating code
 * inherits the guarantee without anyone remembering to come back here.
 *
 * The cap stretches rather than evicts when the exempt rows alone exceed it —
 * four bodies struck is four rows, because dropping one of them is the defect
 * this function exists to prevent. Display order is untouched: the survivors
 * are printed in the sort's own order, so the sheet still reads „подредени по
 * тежест".
 */
function selectShownGroups(groups: ReadonlyArray<MistakeGroup>): MistakeGroup[] {
  const endsTheExam = (g: MistakeGroup): boolean =>
    codeIsKnown(g.code) && examMarkFor(g.code as ViolationCode).terminatesExam;
  const exempt = groups.filter(endsTheExam);
  const rest = groups.filter((g) => !endsTheExam(g));
  const slots = Math.max(0, MAX_MISTAKE_LINES - exempt.length);
  const keep = new Set<MistakeGroup>([...exempt, ...rest.slice(0, slots)]);
  return groups.filter((g) => keep.has(g));
}
