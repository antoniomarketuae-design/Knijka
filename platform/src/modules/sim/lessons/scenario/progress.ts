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
 *
 * ---------------------------------------------------------------------------
 * 2026-08-18 — THE RUNG THE STUDENT HAD ALREADY DRIVEN, REPORTED SHUT.
 *
 * B9 rewrote what opens a rung and left one question still unasked: has he
 * driven THIS one? Every branch below looked at the rung BELOW, so a row set
 * with an attempt at Ln and nothing at Ln-1 came out contradicting itself in
 * both directions at once. MEASURED on SC_PARK_PERP_REV with the single row
 * `sc-park-perp-rev@L4` at 3★ (`__tests__/progress-self-attested-rung.test.ts`):
 *
 *   L4  attempts 1 · bestStars 3 · passed TRUE  · unlocked FALSE
 *   L5  attempts 0 · bestStars null · passed false · unlocked TRUE
 *
 * — a ladder reading [open, shut, shut, SHUT, open], so the rung ABOVE the shut
 * one was open off the very rows said to leave it shut, and `passed && !
 * unlocked` was a state this fold could emit. `ScenarioCatalog.tsx:226` paints
 * that rung 🔒 „Отключва се с ≥ 2★ на предишното ниво" over a 3★ pass, and the
 * copy is the smaller half: `actions.ts:154` runs `isScenarioLevelUnlocked` as
 * the SAVE gate, so re-driving it answers `LEVEL_LOCKED` and the finished drive
 * is discarded — the false failure, in the one place it costs a whole session.
 *
 * Reachable through the admin gate (`{ unlockAll: user.isAdmin }` at both call
 * sites: the override opens the rung, the row outlives the flag), and it is the
 * shape `lessons/store.ts:168` warns a windowed `listSessions` would hand to
 * everyone — „the two unlock gates need their own query that cannot lose a
 * pass".
 *
 * The rung therefore also attests for itself („played"). This is NOT the gate
 * being loosened, which is the distinction this file lives on: the ONLY thing
 * that credits a rung is that rung's own persisted attempt row, and such a row
 * exists only because the save action already accepted the rung as open when it
 * was written. Nothing credits a rung nobody drove — the second half of the
 * test above is that direction, and fails the moment it stops holding.
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
  /**
   * THIS rung has a persisted attempt of its own. Reported only when no rung
   * below accounts for it, so it never displaces „first"/„stars"/„attempt" —
   * see the 2026-08-18 note in the header for the state it ends.
   */
  | "played"
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
    // „взето с 3★" where that is what happened. "played" sits behind all three
    // for the same reason — it is the rung's LAST resort, not its story, so
    // adding it renamed no rung that already had a reason.
    const unlockedBy: ScenarioUnlockReason | null = first
      ? "first"
      : prevBest !== null && prevBest >= SCENARIO_UNLOCK_MIN_STARS
        ? "stars"
        : prevAttempts > 0
          ? "attempt"
          : (acc?.attempts ?? 0) > 0
            ? "played"
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
