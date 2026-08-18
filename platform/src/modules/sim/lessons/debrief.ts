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
  billRoadConsequences,
  deriveSpeedingBand,
  examMarkFor,
  examPointsWordBg,
  formatEur,
  gravestViolation,
  instrumentLabelBg,
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
import type { LessonResult } from "./types";

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
  totalPoints: number;
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
 */
const COMMENDATION_CONTRADICTED_BG =
  " — но не всеки път: същото умение е и сред грешките в този урок. Умението се брои за усвоено, когато го правиш ВСЕКИ път.";

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
    lines.push(
      `Прекъсна урока „${lesson.titleBg}“ преди края. Нищо страшно — запазихме наблюденията дотук, а маршрутът те чака отново.`,
    );
  } else if (result.passed) {
    lines.push(
      `Урокът „${lesson.titleBg}“ е издържан: ${examPointsWordBg(summary.score.totalPoints)} от изпитния лист при допустими 9. Точно това иска да види изпитващият.`,
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
    goodBlock.push(
      coached.length > 0
        ? "Какво се получи добре: чисто каране по изпитния лист — нито едно нарушение не влезе в точките."
        : "Какво се получи добре: чисто каране без нито едно нарушение по изпитния лист — задръж това ниво.",
    );
  }

  // -- mistakes ---------------------------------------------------------------
  const mistakeBlock: string[] = [];
  // A9: repeat mistakes graded harder (×1.5/×2.0) — name that per group and
  // show the training total, keeping the official score clearly separate.
  const maxEscalationByCode = new Map<string, number>();
  for (const esc of result.escalations) {
    const prev = maxEscalationByCode.get(esc.code) ?? 1;
    if (esc.multiplier > prev) maxEscalationByCode.set(esc.code, esc.multiplier);
  }
  const groups = groupMistakes(summary.mistakes);
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
    for (const g of groups.slice(0, MAX_MISTAKE_LINES)) {
      const times = g.count > 1 ? ` ×${g.count}` : "";
      const escMult = maxEscalationByCode.get(g.code);
      const escNote = escMult !== undefined ? ` — повторна грешка ×${fmtPoints(escMult)}` : "";
      // The citation on this line is now the clause the POINTS come from
      // (Наредба № 38, приложение № 5, т. 10), with the rule that was broken
      // beside it. They used to be one chip, which is how a limits table ended
      // up looking like the source of a ten-point exam mark.
      const mark = codeIsKnown(g.code) ? examMarkFor(g.code as ViolationCode) : null;
      const basis = mark === null ? g.lawRef : `${mark.citationBg}; правилото: ${g.lawRef}`;
      mistakeBlock.push(
        `• ${g.titleBg}${times} — ${g.severityLabel}, ${pts(g.totalPoints)} по изпитния лист (${basis})${escNote}`,
      );
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
      const road =
        covered !== null
          ? // ONE ACT, ONE PRICE. Not silence and not a repeat of the figure:
            // the sentence that says WHERE the price is and why the two faults
            // are one offence — the same finding the fault card renders.
            [offenceCoveredLineBg(covered)]
          : codeIsKnown(g.code)
            ? roadLines(g.code as ViolationCode, g.worstSpeedDetail)
            : [];
      if (road.length === 0) anyBlank = true;
      for (const line of road) mistakeBlock.push(`  → ${line}`);
    }
    if (anyBlank) {
      mistakeBlock.push(
        "  → За останалите от изброените нарушения санкцията на пътя още не е извлечена дословно от закона, затова тук няма сума. По-добре празно, отколкото сгрешено число.",
      );
    }
    if (groups.length > MAX_MISTAKE_LINES) {
      mistakeBlock.push(`• …и още ${groups.length - MAX_MISTAKE_LINES} вида нарушения — виж пълния списък в резултата.`);
    }
    if (result.effectiveScore > result.score) {
      mistakeBlock.push(
        `• Тренировъчен резултат: ${pts(result.effectiveScore)} — повторените грешки тежат повече (×1.5/×2.0). Официалният резултат остава ${pts(result.score)}`,
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
  const nearMissCount = result.nearMisses?.length ?? 0;
  if (nearMissCount > 0) {
    lines.push("");
    lines.push(
      `Разминавания на косъм: ${nearMissCount}. Не се броят като грешки, но на пътя късметът не е стратегия — виж къде се случиха на картата на грешките и мини оттам по-бавно и по-широко.`,
    );
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
 */
function coachedLines(coached: ReadonlyArray<{ code: string; titleBg: string }>): string[] {
  const counts = new Map<string, number>();
  for (const c of coached) counts.set(c.titleBg, (counts.get(c.titleBg) ?? 0) + 1);
  const rows = [...counts.entries()]
    .slice(0, MAX_COACHED_NAMED)
    .map(([title, n]) => `• ${title}${n > 1 ? ` ×${n}` : ""}`);
  if (counts.size > MAX_COACHED_NAMED) {
    rows.push(`• …и още ${counts.size - MAX_COACHED_NAMED} — виж пълния списък в резултата.`);
  }
  return rows;
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
    return `Изравни най-добрия си резултат за този урок (${pts(priorBestScore)} по изпитния лист). Следващата цел е да го подобриш.`;
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
 * CLEAN_DRIVING is the one commendation with no conceptId and it is correctly
 * left alone: it is awarded for a measured violation-free STRETCH, which a
 * fault somewhere else in the drive does not retract.
 */
function commendationLines(result: LessonResult): string[] {
  const convicted = new Set(result.summary.conceptIds);
  const seen = new Map<string, { count: number; contradicted: boolean }>();
  for (const c of result.summary.commendations) {
    const contradicted = c.conceptId !== undefined && convicted.has(c.conceptId);
    const prev = seen.get(c.titleBg);
    if (prev === undefined) seen.set(c.titleBg, { count: 1, contradicted });
    else {
      prev.count += 1;
      prev.contradicted = prev.contradicted || contradicted;
    }
  }
  return [...seen.entries()]
    .slice(0, MAX_COMMENDATION_LINES)
    .map(
      ([title, g]) =>
        `• ${title}${g.count > 1 ? ` ×${g.count}` : ""}${g.contradicted ? COMMENDATION_CONTRADICTED_BG : ""}`,
    );
}

/** Excess over the limit, for picking the worst event in a speeding group. */
function excessOf(detail: string | undefined): number | null {
  const m = parseSpeedMeasurement(detail);
  return m === null ? null : m.measuredKmh - m.limitKmh;
}

function groupMistakes(mistakes: ReadonlyArray<ViolationEvent>): MistakeGroup[] {
  const byCode = new Map<string, MistakeGroup>();
  for (const m of mistakes) {
    const g = byCode.get(m.code);
    if (g) {
      g.count += 1;
      g.totalPoints += m.points;
      const here = excessOf(m.detail);
      const best = excessOf(g.worstSpeedDetail);
      if (here !== null && (best === null || here > best)) g.worstSpeedDetail = m.detail;
    } else {
      byCode.set(m.code, {
        code: m.code,
        titleBg: m.titleBg,
        lawRef: m.lawRef,
        conceptId: m.conceptId,
        severityClass: m.severityClass,
        severityLabel: SEVERITY_LABEL[m.severityClass],
        points: m.points,
        count: 1,
        totalPoints: m.points,
        worstSpeedDetail: excessOf(m.detail) === null ? undefined : m.detail,
      });
    }
  }
  return [...byCode.values()].sort((a, b) => {
    const rank = SEVERITY_RANK[b.severityClass] - SEVERITY_RANK[a.severityClass];
    return rank !== 0 ? rank : b.totalPoints - a.totalPoints;
  });
}
