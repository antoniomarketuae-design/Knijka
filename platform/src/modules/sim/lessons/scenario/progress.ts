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
 * copy is the smaller half: `actions.ts:272` runs `isScenarioLevelUnlocked` as
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
 *
 * ---------------------------------------------------------------------------
 * 2026-08-24 — THE LOCK THAT EXPLAINED ITSELF WITH THE RULE B9 DELETED.
 *
 * B9 changed what opens a rung and this fold has told nobody since. It reports
 * `unlockedBy` for an OPEN rung and, for a SHUT one, `null` and nothing else —
 * so the picker had no requirement to print and wrote its own. What it wrote
 * is the PRE-B9 rule, and it is still on the screen today:
 *
 *   ScenarioCatalog.tsx:113  „Ниво 1 е винаги отворено; следващото ниво се
 *                             отключва с ≥ 2★."
 *   ScenarioCatalog.tsx:226  „Отключва се с ≥ 2★ на предишното ниво"
 *
 * Both sentences are false against this file. `unlockedBy: "attempt"` opens the
 * next rung off ANY persisted attempt — 1★, 0★, an aborted session — which is
 * the founder ruling B9 exists to serve («Users should always have the option
 * to continue to the next lesson immediately and return later»). Measured on
 * SC_PARK_PERP_REV with the single row `sc-park-perp-rev@L1` at 1★ — one star
 * BELOW the bar the copy names: `isScenarioLevelUnlocked(spec, 2, rows) === true`
 * and the save action accepts the drive, while the same picker sheet captions
 * L3–L5 „Отключва се с ≥ 2★ на предишното ниво" — a star rule that will not be
 * what opens those either.
 *
 * The cost is the wall FR-06 and FR-23 were filed about, rebuilt in copy after
 * the engine stopped enforcing it: a student who takes 1★ is told he needs two
 * stars to go on, and the two stars are not what he needs. A student staring at
 * a genuinely shut rung is pointed at a star target that opens nothing — he has
 * to DRIVE the rung below, once, and no surface says so. Doc 64 THEO-4:
 * a decision the product takes about the student is explained or it is a defect,
 * and an explanation that is not the reason is the worse half of that.
 *
 * So the fold now states the requirement itself, in the student's own language,
 * out of the SAME branch that decides `unlocked` (`scenarioLockRequirementBg`
 * below) — the sentence and the gate are computed together and cannot drift
 * apart again the way the picker's hand-written copy did. It names the rung the
 * student must drive, taken from the PREVIOUS AUTHORED ENTRY and never from
 * `level - 1` arithmetic (the trap progression.ts:52 documents: a gapped ladder
 * makes arithmetic point at a rung that does not exist).
 *
 * NOT YET ON THE SCREEN, and this is the honest half of the note: `page.tsx:122`
 * projects the fold into `ScenarioCatalogEntry` (components/sim/lesson-ui/
 * types.ts:71) as four fields — level, unlocked, attempts, bestStars — so
 * `passed`, `unlockedBy` and now `lockedByBg` die at that seam, and B9's own
 * promise („Nothing is hidden — `passed`, `bestStars` and `unlockedBy` all ride
 * out of this fold") has never been true past this module's edge. Carrying the
 * field through is one line in each of those two files plus the subtitle at
 * ScenarioCatalog.tsx:226; none of the three is this lane's to edit.
 */

import { parseScenarioLessonId } from "./resolve";
import type { ScenarioLevel, ScenarioSpec } from "./types";

/**
 * Stars on a level that mark it PASSED — „clean, done properly" (doc 76 §8).
 * Since B9 this is a QUALITY bar, not a lock: it decides `passed`, drives the
 * „върни се към…" prompts and the next-step recommendation, and no longer
 * decides `unlocked`. See `ScenarioLevelProgress.unlockedBy`.
 *
 * THE NAME STILL SAYS „UNLOCK" AND IT NO LONGER DOES ONE — read the docstring,
 * not the identifier, and do not build a gate out of this number. Two callers
 * read the name: `ScenarioCatalog.tsx:113`/`:226` interpolate it into the two
 * on-screen sentences the 2026-08-24 header note takes apart, and
 * `nextStep.ts:162` withholds the „Следващо ниво" button below it — which is a
 * legitimate QUALITY choice there («one rung harder is earned», nextStep.ts
 * header) but is justified in that file's prose by the retired unlock rule. Use
 * `scenarioLockRequirementBg` for anything a student reads about a shut rung.
 */
export const SCENARIO_UNLOCK_MIN_STARS = 2;

/**
 * The requirement a SHUT rung is waiting on, as the student needs to read it.
 *
 * ONE sentence, generated in one place, because the picker's hand-written
 * version drifted off the rule (header, 2026-08-24) and nothing could tell:
 * copy that restates a gate is only as true as the day it was typed. This is
 * called from the same branch that returns `unlockedBy: null`, so a change to
 * the gate is a change to the sentence.
 *
 * It says DRIVE, not PASS, and it says the grade does not matter, because that
 * is exactly what B9 made true and exactly what the student is not being told:
 * an attempt row is an attempt row whether it ended ИЗДЪРЖАН, НЕИЗДЪРЖАН or
 * «Урокът беше прекъснат преди края». Stars are not in this sentence and must
 * never come back into it — they mark a rung PASSED (`passed`), they open
 * nothing.
 */
export function scenarioLockRequirementBg(previousLevel: ScenarioLevel): string {
  return `Карай Ниво ${previousLevel} веднъж — отваря се независимо от оценката.`;
}

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
  /**
   * What a SHUT rung is waiting on, in the student's own language — present
   * exactly when `unlocked` is false, null otherwise. The picker prints this
   * instead of restating the gate in its own words; see the 2026-08-24 note in
   * the header for what its own words had become.
   */
  lockedByBg: string | null;
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
  // The rung the student must drive to open the next one — the PREVIOUS
  // AUTHORED ENTRY, never `rung.level - 1`. Arithmetic on a gapped ladder
  // names a rung that does not exist (progression.ts:52 measured that exact
  // failure on the fractional полигон orders), and the requirement sentence
  // has to point at something the picker can actually offer.
  let prevLevel: ScenarioLevel | null = null;
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
    // Computed HERE, off the same `unlockedBy` the verdict is taken from, so
    // the sentence a student reads cannot say one thing while the gate does
    // another — which is precisely what happened while this was the picker's
    // own hand-written string.
    const lockedByBg =
      unlockedBy === null && prevLevel !== null
        ? scenarioLockRequirementBg(prevLevel)
        : null;
    first = false;
    prevBest = acc?.best ?? null;
    prevAttempts = acc?.attempts ?? 0;
    prevLevel = rung.level;
    const best = acc?.best ?? null;
    return {
      level: rung.level,
      unlocked: unlockedBy !== null,
      attempts: acc?.attempts ?? 0,
      bestStars: best,
      passed: best !== null && best >= SCENARIO_UNLOCK_MIN_STARS,
      unlockedBy,
      lockedByBg,
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
