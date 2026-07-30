/**
 * „Поглед отгоре" discoverability cue — the founder's Тясно гнездо note
 * (2026-07-30, ledger 86 D11):
 *
 *   „4. Тясно гнездо — here this is a specific case, where we can Ping
 *    somewhere on the screen with low brightness/contrast Press G for Eagle
 *    View, because its beginning and the user may not know of existing G
 *    option the camera angel from above yet. … This reminder should appear
 *    only when relevant. It should use low brightness and low contrast so it
 *    assists new users without distracting experienced ones."
 *
 * The top-down camera has existed since doc 76 §4 and every scenario rung
 * grants it (`DEFAULT_LEVEL_AIDS.topdownAllowed`), but the only place it is
 * advertised is row 19 of the collapsed keyboard legend, behind „Всички
 * клавиши". A student reversing into a 2.5 m pocket has no way to learn it
 * exists — which is precisely his complaint.
 *
 * WHEN IS IT RELEVANT? Not „the lesson is a parking lesson" — that would park
 * a chip on screen for the whole drive. It is relevant at the moment the
 * overhead view starts paying: **reverse engaged on a lesson whose objective
 * is a bay maneuver, while the student is not already looking from above**.
 * Selecting R is the student saying „I am about to do the hard part".
 *
 * Once the student takes the hint (or reaches top-down any other way) the cue
 * flips to a fading ✓ and never returns this session. If he ignores it, it
 * retires itself after CAMERA_HINT_VISIBLE_SEC so it can never become
 * furniture — the same discipline the glance pings follow.
 *
 * Pure: no DOM, no three, no React. The chip that renders it is
 * `CameraAidHint.tsx`; the states below are unit-tested.
 */

import type { LessonSpec } from "../contracts";
// Direct module, not the scenario barrel: the barrel drags all 154 template
// literals in, and this file needs one string parser.
import { parseScenarioLessonId } from "../lessons/scenario/resolve";

/** Highest rung the cue renders on — beginner rungs only, never the exam. */
export const CAMERA_HINT_MAX_LEVEL = 3;

/** Seconds of continuous reverse before the cue appears (a bounce through R
 *  on the way to P must not flash it). */
export const CAMERA_HINT_ARM_SEC = 0.8;

/** How long the cue stays up if the student never takes it. */
export const CAMERA_HINT_VISIBLE_SEC = 14;

/** Maneuvers whose whole difficulty is geometry the driver cannot see from
 *  either seat-level camera. `parkInBay` is the founder's Тясно гнездо;
 *  `threePointTurn` is the same problem with more kerbs. */
const OVERHEAD_MANEUVERS: ReadonlySet<string> = new Set(["parkInBay", "threePointTurn"]);

/**
 * Does this lesson have a maneuver the overhead view is FOR? Reads the
 * authored objective params — no scenario-id allowlist, so every present and
 * future bay/turn drill inherits the cue without an edit here.
 */
export function lessonHasOverheadManeuver(lesson: Pick<LessonSpec, "objectives">): boolean {
  return lesson.objectives.some((o) => {
    if (o.kind !== "completeManeuver") return false;
    const maneuver = o.params["maneuver"];
    return typeof maneuver === "string" && OVERHEAD_MANEUVERS.has(maneuver);
  });
}

/**
 * Full eligibility. `topdownReachable` is the caller's live answer to „is G in
 * the cycle on this rung" (LessonScene's `topdownInCycle`) — the honesty rule:
 * never advertise a view the rung has locked out.
 */
export function cameraAidHintEligible(
  lesson: Pick<LessonSpec, "id" | "order" | "objectives" | "examMode">,
  topdownReachable: boolean,
): boolean {
  if (!topdownReachable) return false;
  if (lesson.examMode === true) return false;
  if (!lessonHasOverheadManeuver(lesson)) return false;
  // Curriculum lessons carry no difficulty rung (`order` is a syllabus
  // position), and Урок 7 „Паркиране" is precisely a first-timer reversing
  // into a painted bay — the case the cue exists for. Scenario rungs use the
  // real level: L1–L3 teach, L4 is the exam rung, L5 is „Усложнени".
  const scenario = parseScenarioLessonId(lesson.id);
  return scenario === null || scenario.level <= CAMERA_HINT_MAX_LEVEL;
}

// ---------------------------------------------------------------------------
// Runtime phase
// ---------------------------------------------------------------------------

/** "off" = nothing drawn; "hint" = the low-contrast cue; "done" = fading ✓. */
export type CameraAidHintPhase = "off" | "hint" | "done";

export interface CameraAidHintState {
  phase: CameraAidHintPhase;
  /** Continuous seconds the selector has shown R (reset by any other gear). */
  reverseHeldSec: number;
  /** Seconds the cue has been up (retires it at CAMERA_HINT_VISIBLE_SEC). */
  shownSec: number;
  /** Once true the cue is spent for the session — shown, taken or retired. */
  spent: boolean;
}

export function createCameraAidHintState(): CameraAidHintState {
  return { phase: "off", reverseHeldSec: 0, shownSec: 0, spent: false };
}

export interface CameraAidHintInput {
  /** DashboardStatus.gearLabel — "P" | "R" | "N" | "D" | "M2"… */
  gearLabel: string;
  /** True while the camera is already in the top-down view. */
  topdown: boolean;
  /** Seconds since the previous observation. */
  dtSec: number;
}

/**
 * Advance the cue. Mutates in place (polled at low Hz, but the no-allocation
 * grammar of the HUD channels applies anyway) and returns true when the
 * VISIBLE phase changed, so the component snapshots React state only then.
 */
export function observeCameraAidHint(s: CameraAidHintState, i: CameraAidHintInput): boolean {
  // Taking the hint (by chip, by key, by the C cycle — the cue does not care
  // how) is the success case: confirm it once, then never speak again.
  if (i.topdown) {
    s.reverseHeldSec = 0;
    if (s.phase === "hint") {
      s.phase = "done";
      s.shownSec = 0;
      s.spent = true;
      return true;
    }
    s.spent = true;
    return false;
  }

  if (s.phase === "done") {
    s.shownSec += i.dtSec;
    if (s.shownSec >= 2) {
      s.phase = "off";
      return true;
    }
    return false;
  }

  if (s.phase === "hint") {
    s.shownSec += i.dtSec;
    if (s.shownSec >= CAMERA_HINT_VISIBLE_SEC) {
      s.phase = "off";
      return true;
    }
    return false;
  }

  if (s.spent) return false;

  if (i.gearLabel === "R") {
    s.reverseHeldSec += i.dtSec;
    if (s.reverseHeldSec >= CAMERA_HINT_ARM_SEC) {
      s.phase = "hint";
      s.shownSec = 0;
      s.spent = true;
      return true;
    }
  } else {
    s.reverseHeldSec = 0;
  }
  return false;
}
