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
  VIOLATIONS,
  billRoadConsequences,
  deriveSpeedingBand,
  examMarkFor,
  examPointsWordBg,
  formatEur,
  instrumentLabelBg,
  offenceCoveredLineBg,
  parseSpeedMeasurement,
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

export function buildDebrief(
  lesson: LessonSpec,
  result: LessonResult,
  context: DebriefContext = {},
): DebriefOutput {
  const { summary } = result;
  const lines: string[] = [];

  // -- verdict ---------------------------------------------------------------
  if (result.aborted) {
    lines.push(
      `Прекъсна урока „${lesson.titleBg}“ преди края. Нищо страшно — запазихме наблюденията дотук, а маршрутът те чака отново.`,
    );
  } else if (result.passed) {
    lines.push(
      `Урокът „${lesson.titleBg}“ е издържан: ${examPointsWordBg(summary.score.totalPoints)} от изпитния лист при допустими 9. Точно това иска да види изпитващият.`,
    );
  } else if (!result.completedAll) {
    lines.push(
      `Урокът „${lesson.titleBg}“ не е завършен — остана неизпълнена задача от маршрута. Резултатът се брои, но за успешен урок мини целия маршрут.`,
    );
  } else {
    const reasons: string[] = [];
    if (summary.score.hasDangerous) reasons.push("допусната е опасна грешка");
    // „10 т. общо" was the exact string the founder read as his licence. The
    // unit rides on the number now, everywhere it is printed.
    if (summary.score.totalPoints > 9) {
      reasons.push(`${examPointsWordBg(summary.score.totalPoints)} от изпитния лист (допустими 9)`);
    }
    if (summary.score.osnovniPoints > 6) {
      reasons.push(`${examPointsWordBg(summary.score.osnovniPoints)} от основни грешки (допустими 6)`);
    }
    lines.push(
      `Урокът „${lesson.titleBg}“ не е издържан по официалните критерии: ${reasons.join("; ")}.`,
    );
  }
  if (summary.terminated) {
    // Both halves, both addresses — the mark is приложение № 5, т. 10, б. „в“,
    // the ending is чл. 48, ал. 3, and until 2026-08-10 this line cited
    // neither. (rules/scales.ts COLLISION_CONSEQUENCE_BG.)
    lines.push(
      `${COLLISION_CONSEQUENCE_BG} В симулатора продължихме за упражнение, но оценката отразява прекратяване.`,
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
  const goodLines = commendationLines(result);
  if (goodLines.length > 0) {
    lines.push("");
    lines.push("Какво се получи добре:");
    lines.push(...goodLines);
  } else if (summary.mistakes.length === 0 && !result.aborted) {
    lines.push("");
    lines.push("Какво се получи добре: чисто каране без нито едно нарушение — задръж това ниво.");
  }

  // -- mistakes ---------------------------------------------------------------
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
    lines.push("");
    lines.push("Най-важните грешки (подредени по тежест):");
    // Said once, before the first number: which of the three point systems
    // these points belong to. „10 т." with no unit reads as контролни точки.
    lines.push(EXAM_VS_CONTROL_POINTS_BG);
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
      lines.push(
        `• ${g.titleBg}${times} — ${g.severityLabel}, ${pts(g.totalPoints)} по изпитния лист (${basis})${escNote}`,
      );
      // A15: the authored corrective — WHAT the right action was, from the
      // violation catalog (ADR-002: authored copy, never generated). Part of
      // the grounding draft for the post-Alpha LLM debrief: the LLM may
      // rephrase this line but must not invent corrective advice.
      const corrective = correctiveFor(g.code);
      if (corrective !== null) lines.push(`  → Правилното действие: ${corrective}`);
      // The debrief is PLAIN TEXT — it has no FaultCard to carry the rider, and
      // it is what /review/my-drive replays weeks later. So the one fault that
      // ends an exam quotes the article that ends it, here, verbatim. Derived
      // from `terminatesExam`, so a class can never imply it (Наредба № 38
      // чл. 48, ал. 3 reaches ПТП and повторна намеса — not опасна as such).
      if (mark !== null && mark.terminatesExam) {
        lines.push(`  → Спира самия изпит: „${mark.terminationQuoteBg}“ — ${mark.terminationCitationBg}.`);
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
      for (const line of road) lines.push(`  → ${line}`);
    }
    if (anyBlank) {
      lines.push(
        "  → За останалите от изброените нарушения санкцията на пътя още не е извлечена дословно от закона, затова тук няма сума. По-добре празно, отколкото сгрешено число.",
      );
    }
    if (groups.length > MAX_MISTAKE_LINES) {
      lines.push(`• …и още ${groups.length - MAX_MISTAKE_LINES} вида нарушения — виж пълния списък в резултата.`);
    }
    if (result.effectiveScore > result.score) {
      lines.push(
        `• Тренировъчен резултат: ${pts(result.effectiveScore)} — повторените грешки тежат повече (×1.5/×2.0). Официалният резултат остава ${pts(result.score)}`,
      );
    }
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
  } else if (!result.passed && !result.aborted && !result.completedAll) {
    lines.push("");
    lines.push("Какво да упражниш: повтори урока и завърши всички задачи от маршрута — карането беше чисто.");
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
  // Same unit discipline as everywhere else in this file: „т." on its own
  // reads as контролни точки, so the first number in each sentence carries it.
  const now = result.score;
  if (now < priorBestScore) {
    return `Личен напредък: ${pts(now)} по изпитния лист срещу най-добрите ти ${priorBestScore} досега за този урок — свали резултата, продължавай така.`;
  }
  if (now === priorBestScore) {
    return `Изравни най-добрия си резултат за този урок (${pts(priorBestScore)} по изпитния лист). Следващата цел е да го подобриш.`;
  }
  return `Най-добрият ти резултат за този урок остава ${pts(priorBestScore)} по изпитния лист; този път допусна повече (${now}). Спокойно — повтори го и ще го стигнеш.`;
}

function commendationLines(result: LessonResult): string[] {
  const seen = new Map<string, number>();
  for (const c of result.summary.commendations) {
    seen.set(c.titleBg, (seen.get(c.titleBg) ?? 0) + 1);
  }
  return [...seen.entries()]
    .slice(0, MAX_COMMENDATION_LINES)
    .map(([title, count]) => `• ${title}${count > 1 ? ` ×${count}` : ""}`);
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
