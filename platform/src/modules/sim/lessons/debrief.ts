/**
 * Template debrief generator v1 — a deterministic Bulgarian text built ONLY
 * from rule-engine events (titles/explanations/lawRefs authored in the
 * violation catalog, never free-recalled — ADR-002).
 *
 * Structure: verdict → what went well (commendations) → the most important
 * mistakes (grouped, ordered by severity) → what to practice (concept ids
 * that link the mistakes back to the theory knowledge graph).
 *
 * ============================ AI DEBRIEF SEAM ============================
 * The tutor layer will later replace/augment `text` with an LLM-written
 * debrief (dialogue tone, personalized). Contract for that layer:
 *  - input: the same LessonResult + this template as the grounding draft;
 *  - the LLM may rephrase but must keep every lawRef citation intact and may
 *    NOT introduce legal claims that are not present in the events (ADR-002:
 *    retrieval + citation only, no free recall of Bulgarian law).
 * Callers should treat `buildDebrief` as the fallback when the AI layer is
 * unavailable. Nothing else in this module may call an LLM.
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

interface MistakeGroup {
  code: string;
  titleBg: string;
  lawRef: string;
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

export function buildDebrief(lesson: LessonSpec, result: LessonResult): DebriefOutput {
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
  const groups = groupMistakes(summary.mistakes);
  if (groups.length > 0) {
    lines.push("");
    lines.push("Най-важните грешки:");
    for (const g of groups.slice(0, MAX_MISTAKE_LINES)) {
      const times = g.count > 1 ? ` ×${g.count}` : "";
      lines.push(`• ${g.titleBg}${times} — ${g.severityLabel}, ${g.totalPoints} т. (${g.lawRef})`);
    }
    if (groups.length > MAX_MISTAKE_LINES) {
      lines.push(`• …и още ${groups.length - MAX_MISTAKE_LINES} вида нарушения — виж пълния списък в резултата.`);
    }
  }

  // -- what to practice ---------------------------------------------------------
  const conceptIds = summary.conceptIds;
  if (conceptIds.length > 0) {
    lines.push("");
    lines.push(
      "Какво да упражниш: грешките по-горе са свързани с конкретни теми от теорията — премини ги отново в раздел „Теория“, после повтори урока.",
    );
  } else if (!result.passed && !result.aborted && !result.completedAll) {
    lines.push("");
    lines.push("Какво да упражниш: повтори урока и завърши всички задачи от маршрута — карането беше чисто.");
  }

  return { text: lines.join("\n"), conceptIds };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

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
