/**
 * A13 — exam-mode termination fold (pure, shared by the client session
 * reducer and the server grading path, exactly like escalation.ts).
 *
 * The official practical exam does not let a failing candidate keep driving:
 * the examiner stops the exam the moment a limit is crossed (Наредба № 38 /
 * doc 32). Training lessons deliberately DON'T do that (the sim keeps going
 * for learning value — see rules/scoring.ts header); examMode restores the
 * official behavior. This module answers one question from an ordered event
 * stream: did (and when did) the exam terminate, and why.
 *
 * Reason priority for the tripping violation:
 *   collision (terminateSession catalog flag — a ПТП ends the exam on the
 *   spot) → dangerous-mistake (any опасна = instant fail) → total > 9 →
 *   основни > 6. Both point limits can trip on the same event; the total
 *   cap is named first, matching the rubric's order.
 */

import {
  applyViolation,
  emptyScore,
  PASS_MAX_OSNOVNI_POINTS,
  PASS_MAX_TOTAL_POINTS,
  type ScorableEvent,
  type ViolationEvent,
} from "../rules";
import type { ExamTermination, ExamTerminationReason } from "./types";

/** Examiner-voice reason lines („Изпитът се прекратява: …"). Authored copy —
 *  shared by the exam end framing and any future stored-protocol rendering. */
export const EXAM_TERMINATION_TEXT_BG: Record<ExamTerminationReason, string> = {
  collision: "настъпи пътнотранспортно произшествие",
  "dangerous-mistake": "допусната е опасна грешка",
  "total-points-exceeded": "надвишени са допустимите 9 наказателни точки",
  "osnovni-points-exceeded": "надвишени са допустимите 6 точки от основни грешки",
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
