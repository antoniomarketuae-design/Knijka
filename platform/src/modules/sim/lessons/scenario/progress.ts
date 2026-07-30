/**
 * Scenario level progression (S1, doc 76 §8 "levels gate softly"): L1 of
 * every template is ALWAYS open (founder ruling §12 — free tier gets L1;
 * the library is a practice shelf, not a second campaign); L2..L5 open on the
 * previous authored level.
 *
 * Stars come from the PERSISTED session rows (SimSessionEventsJson
 * .rubricStars — computed server-side in finishLessonAction from the graded
 * result + validated wire measurement channels), so the same pure fold runs
 * on the /simulator page (level picker) and in the save action (a locked
 * level's session is refused). Pure — no store access here.
 *
 * ---------------------------------------------------------------------------
 * B9 (doc 86 §3, 2026-07-30) — WHY A RUNG NO LONGER WALLS THE CATALOG.
 *
 * The gate used to be stars-only: `bestStars >= 2` on the previous rung, or
 * the next one stayed shut. That is a clean rule and it was the wrong one,
 * for two reasons the founder hit in the same afternoon.
 *
 * The mechanical one: `scoreRubric` forces 1★ whenever `completedAll` is
 * false, and 128 of 154 templates author a `parTimeSec`-only rubric with no
 * measured component at all — so ONE unfinished objective, for ANY reason,
 * pinned the rung at 1★ and locked everything behind it. Section 2 of doc 86
 * lists eighteen ways the simulator itself produced that unfinished objective:
 * a fault fired where the world did not justify it, a marker stood past the
 * line it graded, a car had already gone. Every one of those false positives
 * converted directly into a progression wall the student could not argue with.
 *
 * The pedagogical one, and the one that decides it — the founder's own ruling:
 * «Users should always have the option to continue to the next lesson
 * immediately and return later. Many users prefer to complete all lessons
 * first and review mistakes afterwards.» That is how people actually learn a
 * curriculum, and it is how the theory side already works.
 *
 * So the gate now opens on an ATTEMPT and the star bar becomes what it always
 * should have been: the mark of a rung PASSED, not the key to the next door.
 * Nothing is hidden — `passed`, `bestStars` and `unlockedBy` all ride out of
 * this fold so the catalog can show a rung as open-but-unpassed and invite the
 * student back to it. A student who advances on a false fault keeps advancing;
 * a student who advances on a real one still sees, on every visit to the
 * catalog, exactly which rung is owed.
 */

import { parseScenarioLessonId } from "./resolve";
import type { ScenarioLevel, ScenarioSpec } from "./types";

/**
 * Stars on a level that mark it PASSED — „clean, done properly" (doc 76 §8).
 * Since B9 this is a QUALITY bar, not a lock: it decides `passed`, drives the
 * „върни се към…" prompts and the next-step recommendation, and no longer
 * decides `unlocked`. See `ScenarioLevelProgress.unlockedBy`.
 */
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

/** Why a rung is open — so the catalog can say so instead of just unlocking. */
export type ScenarioUnlockReason =
  /** L1: always open (doc 76 §12, the free-tier ruling). */
  | "first"
  /** The previous rung was passed at ≥ SCENARIO_UNLOCK_MIN_STARS. */
  | "stars"
  /** B9: the previous rung was ATTEMPTED — continue now, come back later. */
  | "attempt"
  /** Admin override (`unlockAll`). */
  | "admin";

export interface ScenarioLevelProgress {
  level: ScenarioLevel;
  unlocked: boolean;
  attempts: number;
  /** Best (highest) stars across this level's sessions; null before any. */
  bestStars: 1 | 2 | 3 | null;
  /**
   * This rung itself has been driven to ≥ SCENARIO_UNLOCK_MIN_STARS. B9: a
   * rung can be OPEN and UNPASSED at the same time, and the catalog has to be
   * able to tell the student which — „отворено, но още не е взето" is the
   * whole point of letting him move on.
   */
  passed: boolean;
  /** Why `unlocked` is true; null when the rung is still shut. */
  unlockedBy: ScenarioUnlockReason | null;
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
  let prevAttempts = 0;
  let first = true;
  return ordered.map((rung) => {
    const acc = byLevel.get(rung.level);
    // Order matters only for the REASON, never for the verdict: "first" and
    // "stars" are reported ahead of "attempt" so the catalog can keep saying
    // „взето с 3★" where that is what happened.
    const unlockedBy: ScenarioUnlockReason | null = first
      ? "first"
      : prevBest !== null && prevBest >= SCENARIO_UNLOCK_MIN_STARS
        ? "stars"
        : prevAttempts > 0
          ? "attempt"
          : unlockAll
            ? "admin"
            : null;
    first = false;
    prevBest = acc?.best ?? null;
    prevAttempts = acc?.attempts ?? 0;
    const best = acc?.best ?? null;
    return {
      level: rung.level,
      unlocked: unlockedBy !== null,
      attempts: acc?.attempts ?? 0,
      bestStars: best,
      passed: best !== null && best >= SCENARIO_UNLOCK_MIN_STARS,
      unlockedBy,
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
