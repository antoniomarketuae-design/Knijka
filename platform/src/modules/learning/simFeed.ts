/**
 * Sim → mastery feed (A14).
 *
 * The simulator's rule engine links every catalog violation/commendation to a
 * knowledge-graph concept (sim/rules/catalog.ts `conceptId`). After the
 * server graded and persisted a session (finishLessonAction), it calls
 * recordSimObservations() with the concept-linked events — SERVER-REBUILT
 * canonical events only, never client-claimed severities — and this feed
 * folds them into the same Progress rows practice and exams write, so sim
 * mistakes surface in review scheduling, readiness and practice selection.
 *
 * Evidence model (documented decisions):
 *  - A violation is a wrong-answer-EQUIVALENT observation, severity-weighted
 *    (опасна > основна > второстепенна, mirroring the official 10/3/1-point
 *    hierarchy of doc 32):
 *      опасна        mastery ×0.60 (= WRONG_DECAY — grades like a wrong
 *                    answer), lapse++, SM-2 reset → review due in 1 day
 *      основна       mastery ×0.75, lapse++, SM-2 reset → review due in 1 day
 *      второстепенна mastery ×0.90 only — no lapse, schedule untouched. A
 *                    1-point slip (brief lane wobble) is not a knowledge
 *                    failure; grading it as a full SM-2 lapse would flood the
 *                    review queue from perfectly normal early driving.
 *  - A commendation is WEAK positive evidence: mastery += (1-m)×0.10 — well
 *    under the 0.25..0.45 gains of an answered question, because driving
 *    correctly past one stop sign proves less than answering a question about
 *    it. It never advances the SM-2 ladder (same rule as ahead-of-schedule
 *    practice: early success never inflates intervals).
 *  - Observations compound sequentially in event order when several touch the
 *    same concept (same rule as examFeed).
 *
 * Persistence is progress-only (store.upsertProgress) — the sim module owns
 * the SimSession row; no attempt rows are written here.
 */

import { schedule } from "./scheduler";
import {
  getLearningStore,
  type ProgressRow,
  type ProgressUpdate,
  type SimSeverity,
} from "./store";

export interface SimObservation {
  conceptId: string;
  kind: "violation" | "commendation";
  /** Required for violations (ignored for commendations). */
  severity?: SimSeverity;
}

/** Severity-weighted multiplicative mastery decay per violation. */
export const SIM_VIOLATION_DECAY: Record<SimSeverity, number> = {
  opasna: 0.6,
  osnovna: 0.75,
  vtorostepenna: 0.9,
};

/** Weak positive gain per commendation (cf. GAIN_BY_POINTS 0.25..0.45). */
export const SIM_COMMENDATION_GAIN = 0.1;

export async function recordSimObservations(
  userId: string,
  observations: SimObservation[],
  now: Date = new Date(),
): Promise<void> {
  if (observations.length === 0) return;

  const store = getLearningStore();
  const progress = await store.getProgress(userId);
  const state = new Map<
    string,
    Pick<ProgressRow, "mastery" | "reps" | "lapses" | "dueAt">
  >(
    progress.map((p) => [
      p.conceptId,
      { mastery: p.mastery, reps: p.reps, lapses: p.lapses, dueAt: p.dueAt },
    ]),
  );
  const touched = new Set<string>();

  for (const obs of observations) {
    if (obs.conceptId.length === 0) continue;
    if (obs.kind === "violation" && obs.severity === undefined) continue;

    const cur = state.get(obs.conceptId) ?? {
      mastery: 0,
      reps: 0,
      lapses: 0,
      dueAt: null,
    };

    if (obs.kind === "violation") {
      const severity = obs.severity as SimSeverity;
      if (severity === "vtorostepenna") {
        // Minor slip: mastery dip only — no lapse, schedule untouched.
        state.set(obs.conceptId, {
          ...cur,
          mastery: cur.mastery * SIM_VIOLATION_DECAY.vtorostepenna,
        });
      } else {
        // опасна/основна: wrong-answer treatment with severity-weighted decay
        // (опасна ×0.6 ≡ applyWrong exactly; основна is the milder ×0.75).
        // schedule(_, false, now) is the SM-2 lapse: reps 0, review in 1 day.
        const next = schedule({ reps: cur.reps, dueAt: cur.dueAt }, false, now);
        state.set(obs.conceptId, {
          mastery: cur.mastery * SIM_VIOLATION_DECAY[severity],
          lapses: cur.lapses + 1,
          reps: next.reps,
          dueAt: next.dueAt,
        });
      }
    } else {
      // Commendation: weak asymptotic gain, SM-2 state untouched.
      state.set(obs.conceptId, {
        ...cur,
        mastery: Math.min(
          1,
          cur.mastery + (1 - cur.mastery) * SIM_COMMENDATION_GAIN,
        ),
      });
    }
    touched.add(obs.conceptId);
  }

  if (touched.size === 0) return;

  const updates: ProgressUpdate[] = [...touched].map((conceptId) => {
    const s = state.get(conceptId)!;
    return {
      conceptId,
      mastery: s.mastery,
      reps: s.reps,
      lapses: s.lapses,
      dueAt: s.dueAt,
    };
  });

  await store.upsertProgress(userId, updates);
}
