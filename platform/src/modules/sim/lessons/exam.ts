/**
 * A13 — exam-mode termination fold (pure, shared by the client session
 * reducer and the server grading path, exactly like escalation.ts).
 *
 * A mock exam does not let a failing candidate keep driving. This module
 * answers one question from an ordered event stream: did (and when did) the
 * exam end, and why. Training lessons deliberately DON'T end (the sim keeps
 * going for learning value — see rules/scoring.ts header); examMode restores
 * the exam's behavior.
 *
 * WHAT THE ACT ACTUALLY SAYS, corrected 2026-08-10. This header used to claim
 * „the examiner stops the exam the moment a limit is crossed (Наредба № 38)".
 * Наредба № 38 says that of exactly two things — чл. 48, ал. 3: „Практическият
 * изпит се прекратява при повторна намеса на комисията … и при допускане на
 * ПТП." A limit crossed is a DIFFERENT fact, decided by приложение № 5, т. 11:
 * over 9 наказателни точки (or over 6 from основни) is НЕИЗДЪРЖАН, and one
 * опасна is 10, so a single опасна settles the verdict. Ending the mock drive
 * at the moment the verdict can no longer change is this product's choice and
 * a defensible one; calling all four cases „прекратяване по наредбата" was not,
 * and the reason lines below now say which is which. See rules/n38.ts
 * `N38_TERMINATION_RULE`.
 *
 * Reason priority for the tripping violation:
 *   collision (terminateSession catalog flag — the one statutory ground) →
 *   dangerous-mistake (any опасна = 10 > 9 = certain fail) → total > 9 →
 *   основни > 6. Both point limits can trip on the same event; the total
 *   cap is named first, matching the rubric's order.
 */

import {
  applyViolation,
  emptyScore,
  N38_TERMINATION_CITATION,
  PASS_MAX_OSNOVNI_POINTS,
  PASS_MAX_TOTAL_POINTS,
  type ScorableEvent,
  type ViolationEvent,
} from "../rules";
import type { ExamTermination, ExamTerminationReason } from "./types";

/** Examiner-voice reason lines („Изпитът се прекратява: …"). Authored copy —
 *  shared by the exam end framing and any future stored-protocol rendering. */
export const EXAM_TERMINATION_TEXT_BG: Record<ExamTerminationReason, string> = {
  collision: `настъпи пътнотранспортно произшествие — ${N38_TERMINATION_CITATION}, единственото основание, по което наредбата спира самото каране`,
  "dangerous-mistake":
    "допусната е опасна грешка — 10 наказателни точки при допустими 9, така че изпитът вече е неиздържан (приложение № 5, т. 11)",
  "total-points-exceeded": "надвишени са допустимите 9 наказателни точки",
  "osnovni-points-exceeded": "надвишени са допустимите 6 наказателни точки от основни грешки",
};

/** Reason of the violation that just crossed a limit, or null while legal. */
function tripReason(
  v: ViolationEvent,
  totalPoints: number,
  osnovniPoints: number,
): ExamTerminationReason | null {
  if (v.terminateSession === true) return "collision";
  if (v.severityClass === "opasna") return "dangerous-mistake";
  if (totalPoints > PASS_MAX_TOTAL_POINTS) return "total-points-exceeded";
  if (osnovniPoints > PASS_MAX_OSNOVNI_POINTS) return "osnovni-points-exceeded";
  return null;
}

/**
 * Fold the (chronologically sorted) scored events of a session and return the
 * FIRST moment the official limits were crossed — or null for a session that
 * stayed within them. Pure and deterministic; commendations are ignored.
 */
export function examTerminationFor(
  events: ReadonlyArray<ScorableEvent>,
): ExamTermination | null {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  let score = emptyScore();
  for (const e of sorted) {
    if (e.kind !== "violation") continue;
    score = applyViolation(score, e);
    const reason = tripReason(e, score.totalPoints, score.osnovniPoints);
    if (reason !== null) return { reason, tSec: e.t };
  }
  return null;
}
