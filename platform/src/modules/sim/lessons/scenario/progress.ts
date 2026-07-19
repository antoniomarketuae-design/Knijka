/**
 * Scenario level progression (S1, doc 76 §8 "levels gate softly"): L1 of
 * every template is ALWAYS open (founder ruling §12 — free tier gets L1;
 * the library is a practice shelf, not a second campaign); L2..L5 unlock by
 * STARS on the previous authored level: one session at ≥ 2★ ("clean, done
 * properly") opens the next rung.
 *
 * Stars come from the PERSISTED session rows (SimSessionEventsJson
 * .rubricStars — computed server-side in finishLessonAction from the graded
 * result + validated wire measurement channels), so the same pure fold runs
 * on the /simulator page (level picker) and in the save action (a locked
 * level's session is refused). Pure — no store access here.
 */

import { parseScenarioLessonId } from "./resolve";
import type { ScenarioLevel, ScenarioSpec } from "./types";

/** Stars on the previous level required to unlock the next (doc 76 §8). */
export const SCENARIO_UNLOCK_MIN_STARS = 2;

/**
 * Explicit gate override, passed by callers that resolved it SERVER-SIDE
 * (admin role from the session — never from client input). `unlockAll` opens
 * every authored rung; attempts/stars folding is unaffected.
 */
export interface ProgressGateOptions {
  unlockAll?: boolean;
}

/** The slice of a persisted session row the progression fold reads. */
export interface ScenarioAttemptRow {
  lessonId: string;
  /** SimSessionEventsJson.rubricStars; null on rows without one. */
  rubricStars: number | null;
}

export interface ScenarioLevelProgress {
  level: ScenarioLevel;
  unlocked: boolean;
  attempts: number;
  /** Best (highest) stars across this level's sessions; null before any. */
  bestStars: 1 | 2 | 3 | null;
}

/** Per-authored-level progression of one template from the session history. */
export function scenarioLevelProgress(
  spec: Pick<ScenarioSpec, "id" | "levels">,
  rows: ReadonlyArray<ScenarioAttemptRow>,
  opts?: ProgressGateOptions,
): ScenarioLevelProgress[] {
  const unlockAll = opts?.unlockAll === true;
  const byLevel = new Map<number, { attempts: number; best: 1 | 2 | 3 | null }>();
  for (const row of rows) {
    const parsed = parseScenarioLessonId(row.lessonId);
    if (parsed === null || parsed.templateId !== spec.id) continue;
    const acc = byLevel.get(parsed.level) ?? { attempts: 0, best: null };
    acc.attempts += 1;
    const stars = row.rubricStars;
    if (stars === 1 || stars === 2 || stars === 3) {
      acc.best = acc.best === null ? stars : (Math.max(acc.best, stars) as 1 | 2 | 3);
    }
    byLevel.set(parsed.level, acc);
  }

  const ordered = [...spec.levels].sort((a, b) => a.level - b.level);
  let prevBest: number | null = null;
  let first = true;
  return ordered.map((rung) => {
    const acc = byLevel.get(rung.level);
    const unlocked =
      unlockAll || first || (prevBest !== null && prevBest >= SCENARIO_UNLOCK_MIN_STARS);
    first = false;
    prevBest = acc?.best ?? null;
    return {
      level: rung.level,
      unlocked,
      attempts: acc?.attempts ?? 0,
      bestStars: acc?.best ?? null,
    };
  });
}

/** The single-level check the save action runs before persisting. */
export function isScenarioLevelUnlocked(
  spec: Pick<ScenarioSpec, "id" | "levels">,
  level: ScenarioLevel,
  rows: ReadonlyArray<ScenarioAttemptRow>,
  opts?: ProgressGateOptions,
): boolean {
  // Note: even with unlockAll, a level the template does not author stays
  // locked — the override opens real rungs, it never invents them.
  return scenarioLevelProgress(spec, rows, opts).some(
    (p) => p.level === level && p.unlocked,
  );
}
