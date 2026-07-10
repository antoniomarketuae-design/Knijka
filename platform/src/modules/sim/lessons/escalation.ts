/**
 * Repeat-penalty escalation — the training-layer half of teach-first-then-grade
 * (doc 65 §5, restored by doc 68 A9 / audit finding D7).
 *
 * The scenario coach grades a repeat mistake harder: ×1.0 on the first graded
 * pass, ×1.5 on the next, ×2.0 from then on (scenarios/policy.ts). This module
 * APPLIES that multiplier to the points — but only to the *effective* training
 * score. The OFFICIAL score (Наредба № 38 severity points, pass rule ≤9/≤6/no
 * опасна) is law and stays untouched: base points remain catalog-fixed and the
 * verdict is always computed from them, so a sim result stays comparable to
 * the real practical exam. Escalation exists to make the debrief honest about
 * repetition („повторна грешка ×1.5"), not to rewrite the exam rubric.
 *
 * Pure + deterministic; shared by the client result fold (engine.ts
 * buildLessonResult) and the server-side wire grading (wire.ts).
 */

import type { ViolationEvent } from "../rules";

/** A scored violation the coach graded above ×1.0 (a repeat), as recorded live. */
export interface PenaltyEscalation {
  /** Rule-catalog violation code. */
  code: string;
  /** Session time of the violation, seconds — pairs it to its event. */
  t: number;
  /** Coach multiplier, one of ESCALATION_MULTIPLIERS. */
  multiplier: number;
}

/** A mistake with its escalation applied — the debrief/UI view. */
export interface EscalatedMistake {
  code: string;
  t: number;
  titleBg: string;
  /** Official catalog points (what the exam would score). */
  basePoints: number;
  /** ×1.5 or ×2.0 — the repeat penalty. */
  multiplier: number;
  /** basePoints × multiplier (may be fractional, e.g. 3 × 1.5 = 4.5). */
  effectivePoints: number;
}

/**
 * The only multipliers the coach can produce above base (policy.ts: +0.5 per
 * repeat, capped at 2). The wire validator rejects anything else — a client
 * cannot invent its own escalation ladder.
 */
export const ESCALATION_MULTIPLIERS = [1.5, 2] as const;

export function isEscalationMultiplier(m: unknown): m is 1.5 | 2 {
  return m === 1.5 || m === 2;
}

export interface AppliedEscalations {
  /**
   * Training-layer total: Σ basePoints × multiplier over all mistakes
   * (multiplier 1 where no escalation applies). Always ≥ the official total.
   */
  effectiveTotalPoints: number;
  /** Only the mistakes that actually graded harder (multiplier > 1). */
  escalated: EscalatedMistake[];
}

/**
 * Fold the recorded escalations over the session's mistakes. Escalations are
 * matched to events by (code, t) and each record is consumed at most once, so
 * a duplicated record can never double-charge an event.
 */
export function applyEscalations(
  mistakes: ReadonlyArray<ViolationEvent>,
  escalations: ReadonlyArray<PenaltyEscalation>,
): AppliedEscalations {
  // (code, t) → pending multipliers, consumed in order.
  const pending = new Map<string, number[]>();
  for (const esc of escalations) {
    const key = `${esc.code}@${esc.t}`;
    const list = pending.get(key);
    if (list) list.push(esc.multiplier);
    else pending.set(key, [esc.multiplier]);
  }

  let effectiveTotalPoints = 0;
  const escalated: EscalatedMistake[] = [];
  for (const m of mistakes) {
    const multiplier = pending.get(`${m.code}@${m.t}`)?.shift() ?? 1;
    const effectivePoints = m.points * multiplier;
    effectiveTotalPoints += effectivePoints;
    if (multiplier > 1) {
      escalated.push({
        code: m.code,
        t: m.t,
        titleBg: m.titleBg,
        basePoints: m.points,
        multiplier,
        effectivePoints,
      });
    }
  }
  return { effectiveTotalPoints, escalated };
}
