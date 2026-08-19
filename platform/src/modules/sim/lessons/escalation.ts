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
 *
 * AND THE SHARING IS NOW THE WHOLE POINT. `foldTrainingScore` at the foot of
 * this file is the ONE home of the ledger-billing filter; `escalationQueue` is
 * the one home of the consumption rule. Both were copied per caller before, and
 * both copies drifted — see each function's header for the drive that shipped.
 */

import { ledgerBilling, type ViolationEvent } from "../rules";

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
 * THE CONSUMPTION RULE, in one place: records are queued per (code, t) and each
 * is spent by at most ONE event, in order. Returns the taker; 1 means „no
 * record left on this key", which is the un-escalated weight.
 *
 * A QUEUE AND NOT A MAX, and the difference is measurable rather than
 * theoretical. Three PEDESTRIAN_NOT_YIELDED at t = 6, 40, 40 against records
 * [×1.5@40, ×2@40] — reachable through the ordinary tick path, because one tick
 * can close two occupied crossings — fold to
 *
 *   consumed  10 + 15 + 20 = 45   ← what every builder and every stored row says
 *   maxed     10 + 20 + 20 = 50   ← what one re-derivation printed to a student
 *
 * The 50 appeared on no other surface. The semantics are pinned by
 * `__tests__/debrief-training-total-consumption.test.ts`; do not "simplify"
 * this into a lookup that can serve the same record twice.
 */
export function escalationQueue(
  escalations: ReadonlyArray<PenaltyEscalation>,
): (code: string, t: number) => number {
  const pending = new Map<string, number[]>();
  for (const esc of escalations) {
    const key = `${esc.code}@${esc.t}`;
    const list = pending.get(key);
    if (list) list.push(esc.multiplier);
    else pending.set(key, [esc.multiplier]);
  }
  return (code, t) => pending.get(`${code}@${t}`)?.shift() ?? 1;
}

/**
 * Fold the recorded escalations over the mistakes GIVEN. Escalations are matched
 * to events by (code, t) and each record is consumed at most once, so a
 * duplicated record can never double-charge an event.
 *
 * THIS IS THE RAW FOLD AND NOT THE ONE A RESULT-BUILDER WANTS — it prices every
 * row it is handed, including rows Наредба № 38, чл. 48, ал. 3 closed over.
 * `buildLessonResult` and `gradeFinishWire` must call `foldTrainingScore`
 * below, which applies the ledger filter first. Exported unfiltered only so a
 * test can re-derive the arithmetic independently of that filter.
 */
export function applyEscalations(
  mistakes: ReadonlyArray<ViolationEvent>,
  escalations: ReadonlyArray<PenaltyEscalation>,
): AppliedEscalations {
  const take = escalationQueue(escalations);

  let effectiveTotalPoints = 0;
  const escalated: EscalatedMistake[] = [];
  for (const m of mistakes) {
    const multiplier = take(m.code, m.t);
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

/**
 * THE TRAINING-LAYER FOLD EVERY RESULT-BUILDER MUST USE — over the rows the
 * ledger charged, and no others.
 *
 * The training total is a WEIGHTING of the exam's arithmetic, not a second
 * arithmetic. Handed the whole mistake list, `applyEscalations` re-instates
 * every fault Наредба № 38, чл. 48, ал. 3 closed over and then escalates them;
 * filtering the MISTAKES fixes the total and the false «повторна грешка» at
 * once, because the records pair to events by (code, t) — a row that is not
 * folded cannot carry its record either. A genuine repeat (two red lights,
 * nothing terminating) is untouched: nothing closes that ledger.
 *
 * IT LIVES HERE BECAUSE OWNING A COPY EACH IS WHAT SHIPPED THE LIE. `engine.ts
 * buildLessonResult` (client) and `wire.ts gradeFinishWire` (server) each had
 * their own, they were repaired in separate lanes, and for the window between
 * those lanes `LessonPlayShell.tsx:2683` — which renders the SERVER's
 * `debriefText` whenever the save succeeds — printed «Удар в пешеходец … без
 * допълнителни точки … — повторна грешка ×1.5» and «Тренировъчен резултат: 25
 * наказателни т.» on a drive the client scored 10/10.
 *
 * RE-MEASURED 2026-08-19 with the filter deleted from `wire.ts` alone, on
 * l0-free-drive: two missed zebras (t = 4, 8), a collision at t = 12 that closes
 * the ledger, a third missed zebra at t = 20 the coach graded ×2.0.
 *
 *   CLIENT  score=30  effective=35  escalations=[×1.5@8]
 *   SERVER  score=30  effective=55  escalations=[×1.5@8, ×2@20]
 *
 * and the 55 is what `actions.ts` persists and session-history badges. NOTE
 * WHAT DID NOT DIVERGE: both debriefs read «Тренировъчен резултат: 35», because
 * `debrief.ts` re-derives that line from its own billed rows. So a guard that
 * only compares the two debrief TEXTS passes on this input while the stored
 * training total is off by 20 — the divergence test has to compare the
 * RESULTS. It does: `__tests__/one-home-training-fold.test.ts`.
 */
export function foldTrainingScore(
  mistakes: ReadonlyArray<ViolationEvent>,
  escalations: ReadonlyArray<PenaltyEscalation>,
): AppliedEscalations {
  const billed = ledgerBilling(mistakes);
  return applyEscalations(
    mistakes.filter((_, i) => billed[i]),
    escalations,
  );
}
