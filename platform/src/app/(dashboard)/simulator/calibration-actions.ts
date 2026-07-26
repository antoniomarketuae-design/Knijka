"use server";

/**
 * Server action for the „Позна ли се?" calibration gate (doc 82 §5.3 I1).
 *
 * The student predicts their own official result before the debrief unlocks;
 * this action pairs that prediction with the engine's verdict and answers with
 * both halves plus the authored copy for the reveal.
 *
 * Trust model, same shape as finishLessonAction: the client sends ONLY the
 * belief. The actual points and the actual pass/fail are read back off the
 * already-persisted SimSession inside the store, keyed on this user — so a
 * hand-crafted POST can neither answer for someone else's drive nor supply the
 * number it is being measured against. Write-once, because the response
 * reveals the answer.
 *
 * Bulgarian copy comes from the pure module (@/modules/learning), never from
 * this layer and never from a model: a calibration verdict is a judgement
 * about the student's judgement, and requirement-zero (doc 64 THEO-4) forbids
 * a bare right/wrong anywhere in the product.
 */

import { requireUser } from "@/modules/auth";
import {
  CALIBRATION_VERDICT_BODY_BG,
  CALIBRATION_VERDICT_TITLE_BG,
  calibrationError,
  classifyCalibration,
  parsePredictionInput,
  verdictAgrees,
  type CalibrationVerdict,
} from "@/modules/learning";
// Deep import (like actions.ts reaching sim/traces/attemptStore): the
// calibration STORE is the server half — Prisma — and is deliberately off the
// learning barrel, which client-reachable code imports for the pure copy.
import { getCalibrationStore } from "@/modules/learning/calibrationStore";
import { canDriveSimulator } from "./access";

const MAX_ID_LENGTH = 120;

export interface SelfPredictionRevealed {
  ok: true;
  /** false when the drive had already been predicted — the ORIGINAL answer
   *  comes back, so a reload of the end screen shows what was really said. */
  firstAnswer: boolean;
  predictedPoints: number;
  predictedPass: boolean;
  actualPoints: number;
  actualPass: boolean;
  /** predicted − actual; negative = the student flattered themselves. */
  errorPoints: number;
  verdict: CalibrationVerdict;
  verdictAgreed: boolean;
  titleBg: string;
  bodyBg: string;
}

export type SelfPredictionActionResult =
  | SelfPredictionRevealed
  | { ok: false; code: "INVALID_INPUT" | "UNAVAILABLE" };

/**
 * Record one self-prediction and reveal the engine's answer.
 *
 * `UNAVAILABLE` covers "no such session for you" and "that session carries no
 * official score" in one code on purpose: distinguishing them would confirm
 * the existence of another account's session id to whoever guessed it.
 */
export async function recordSelfPredictionAction(
  simSessionId: string,
  input: unknown,
): Promise<SelfPredictionActionResult> {
  const user = await requireUser();

  // C-3 entitlement gate, for the same reason finishLessonAction has one: a
  // server action is a public POST endpoint, and this one writes a row.
  if (!(await canDriveSimulator(user))) {
    throw new Error("recordSelfPredictionAction: no simulator entitlement");
  }

  if (
    typeof simSessionId !== "string" ||
    simSessionId.length === 0 ||
    simSessionId.length > MAX_ID_LENGTH
  ) {
    return { ok: false, code: "INVALID_INPUT" };
  }

  const prediction = parsePredictionInput(input);
  if (prediction === null) return { ok: false, code: "INVALID_INPUT" };

  const result = await getCalibrationStore().record(user.id, simSessionId, prediction);
  if (result.record === undefined) return { ok: false, code: "UNAVAILABLE" };

  const record = result.record;
  const verdict = classifyCalibration(record);
  return {
    ok: true,
    firstAnswer: result.status === "recorded",
    predictedPoints: record.predictedPoints,
    predictedPass: record.predictedPass,
    actualPoints: record.actualPoints,
    actualPass: record.actualPass,
    errorPoints: calibrationError(record),
    verdict,
    verdictAgreed: verdictAgrees(record),
    titleBg: CALIBRATION_VERDICT_TITLE_BG[verdict],
    bodyBg: CALIBRATION_VERDICT_BODY_BG[verdict],
  };
}
