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
import type { ViolationEvent } from "../rules";
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
      `Урокът „${lesson.titleBg}“ е издържан: ${summary.score.totalPoints} наказателни точки при допустими 9. Точно това иска да види изпитващият.`,
    );
  } else if (!result.completedAll) {
    lines.push(
      `Урокът „${lesson.titleBg}“ не е завършен — остана неизпълнена задача от маршрута. Резултатът се брои, но за успешен урок мини целия маршрут.`,
    );
  } else {
    const reasons: string[] = [];
    if (summary.score.hasDangerous) reasons.push("допусната е опасна грешка");
    if (summary.score.totalPoints > 9) reasons.push(`${summary.score.totalPoints} т. общо (допустими 9)`);
    if (summary.score.osnovniPoints > 6) reasons.push(`${summary.score.osnovniPoints} т. от основни грешки (допустими 6)`);
    lines.push(
      `Урокът „${lesson.titleBg}“ не е издържан по официалните критерии: ${reasons.join("; ")}.`,
    );
  }
  if (summary.terminated) {
    lines.push(
      "Настъпи сблъсък — на реалния изпит това прекратява изпита незабавно. Продължихме за упражнение, но оценката отразява прекратяване.",
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
  if (groups.length > 0) {
    lines.push("");
    lines.push("Най-важните грешки (подредени по тежест):");
    for (const g of groups.slice(0, MAX_MISTAKE_LINES)) {
      const times = g.count > 1 ? ` ×${g.count}` : "";
      const escMult = maxEscalationByCode.get(g.code);
      const escNote = escMult !== undefined ? ` — повторна грешка ×${fmtPoints(escMult)}` : "";
      lines.push(
        `• ${g.titleBg}${times} — ${g.severityLabel}, ${g.totalPoints} т. (${g.lawRef})${escNote}`,
      );
    }
    if (groups.length > MAX_MISTAKE_LINES) {
      lines.push(`• …и още ${groups.length - MAX_MISTAKE_LINES} вида нарушения — виж пълния списък в резултата.`);
    }
    if (result.effectiveScore > result.score) {
      lines.push(
        `• Тренировъчен резултат: ${fmtPoints(result.effectiveScore)} т. — повторените грешки тежат повече (×1.5/×2.0). Официалният резултат остава ${result.score} т.`,
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
  const now = result.score;
  if (now < priorBestScore) {
    return `Личен напредък: ${now} т. срещу най-добрите ти ${priorBestScore} т. досега за този урок — свали резултата, продължавай така.`;
  }
  if (now === priorBestScore) {
    return `Изравни най-добрия си резултат за този урок (${priorBestScore} т.). Следващата цел е да го подобриш.`;
  }
  return `Най-добрият ти резултат за този урок остава ${priorBestScore} т.; този път допусна повече (${now} т.). Спокойно — повтори го и ще го стигнеш.`;
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

function groupMistakes(mistakes: ReadonlyArray<ViolationEvent>): MistakeGroup[] {
  const byCode = new Map<string, MistakeGroup>();
  for (const m of mistakes) {
    const g = byCode.get(m.code);
    if (g) {
      g.count += 1;
      g.totalPoints += m.points;
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
      });
    }
  }
  return [...byCode.values()].sort((a, b) => {
    const rank = SEVERITY_RANK[b.severityClass] - SEVERITY_RANK[a.severityClass];
    return rank !== 0 ? rank : b.totalPoints - a.totalPoints;
  });
}
