/**
 * The PRODUCT side of the calibration pair: what the app was predicting for
 * this student at the moment they reported their real result.
 *
 * It is a seam rather than a direct call for two reasons. It keeps the
 * outcomes module's unit tests pure — capturing a snapshot otherwise needs a
 * loaded content repo plus the learning and exam stores. And it keeps the
 * cross-module dependency one-directional and LAZY: nothing here is imported
 * until a report is actually being written, so `import { … } from
 * "@/modules/outcomes"` never boots the content repo or Prisma.
 *
 * Both sources are consumed through their public index.ts (docs/architecture/05).
 */

import type { ReadinessSnapshot } from "./types";

export type ReadinessSnapshotProvider = (
  userId: string,
) => Promise<ReadinessSnapshot>;

/**
 * The fallback when readiness cannot be computed. A report is worth more than
 * its snapshot: losing the outcome because the content repo failed to load
 * would destroy the only irreplaceable half of the pair (the student will not
 * come back and re-report). `mockAttempts: 0` + score 0 is honest — it says
 * "we had no prediction", and the calibration can see the difference.
 */
export const NO_SNAPSHOT: ReadinessSnapshot = {
  readinessScore: 0,
  mockAttempts: 0,
  bestMockScore: null,
};

async function prismaBackedSnapshot(
  userId: string,
): Promise<ReadinessSnapshot> {
  // Readiness is computed over the content repo, which the module APIs expect
  // to be initialized already (see modules/learning/index.ts header).
  await import("@/lib/content/loader");
  const [{ getReadiness }, { getExamHistory }] = await Promise.all([
    import("@/modules/learning"),
    import("@/modules/exam"),
  ]);

  const [readiness, history] = await Promise.all([
    getReadiness(userId),
    getExamHistory(userId),
  ]);

  // Only finished attempts count: an abandoned exam is not a mock the student
  // ever got a score from, and counting it would inflate "how much did they
  // practise the real format" in every calibration bucket.
  const finished = history.filter((h) => h.status === "completed");
  const scores = finished
    .map((h) => h.score)
    .filter((s): s is number => typeof s === "number");

  return {
    readinessScore: clampScore(readiness.score),
    mockAttempts: finished.length,
    bestMockScore: scores.length > 0 ? Math.max(...scores) : null,
  };
}

/** 0..100 integer — the column is an Int and the bands assume that range. */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

let provider: ReadinessSnapshotProvider | null = null;

/** Tests inject a stub (or null to reset); production computes for real. */
export function setReadinessSnapshotProvider(
  p: ReadinessSnapshotProvider | null,
): void {
  provider = p;
}

/**
 * Never throws: see NO_SNAPSHOT. The warning is deliberately loud, because a
 * silent run of snapshot-less rows would look like "readiness predicts
 * nothing" in the calibration view months later.
 */
export async function captureReadinessSnapshot(
  userId: string,
): Promise<ReadinessSnapshot> {
  const fn = provider ?? prismaBackedSnapshot;
  try {
    const snapshot = await fn(userId);
    return {
      readinessScore: clampScore(snapshot.readinessScore),
      mockAttempts: Math.max(0, Math.trunc(snapshot.mockAttempts)),
      bestMockScore: snapshot.bestMockScore,
    };
  } catch (err) {
    console.warn(
      "outcomes: readiness snapshot failed — storing the outcome without a prediction",
      err,
    );
    return NO_SNAPSHOT;
  }
}
