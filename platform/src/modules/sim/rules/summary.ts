/**
 * Session summary builder — turns the full event stream of a sim session
 * (rule-engine events + pre-drive procedure events) into the debrief payload:
 * score breakdown by official class, pass/fail per the official rule, the
 * mistake list with legal references, and the linked knowledge-graph concept
 * ids. The concept ids are how sim mistakes drive theory recommendations
 * (learning module reads them; sim itself never touches the DB —
 * docs/architecture/05).
 */

import {
  accumulateScore,
  isPassing,
  PASS_MAX_OSNOVNI_POINTS,
  PASS_MAX_TOTAL_POINTS,
  type ScoreBreakdown,
} from "./scoring";
import type { CommendationEvent, ScorableEvent, ViolationEvent } from "./types";

export type FailReason =
  | "dangerous-mistake" // at least one опасна
  | "total-points-exceeded" // > 9 total
  | "osnovni-points-exceeded"; // > 6 from основни

export interface SessionSummary {
  score: ScoreBreakdown;
  /** Official pass rule: <= 9 total, <= 6 from основни, no опасна. */
  passed: boolean;
  failReasons: FailReason[];
  /** A collision occurred — official exams terminate; we grade it as such. */
  terminated: boolean;
  /** All violations, chronological. */
  mistakes: ViolationEvent[];
  /** All commendations, chronological. */
  commendations: CommendationEvent[];
  /**
   * Unique concept ids linked from the MISTAKES (not commendations), in order
   * of first occurrence — the input for theory recommendations.
   */
  conceptIds: string[];
}

export function buildSessionSummary(events: ReadonlyArray<ScorableEvent>): SessionSummary {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const mistakes = sorted.filter((e): e is ViolationEvent => e.kind === "violation");
  const commendations = sorted.filter((e): e is CommendationEvent => e.kind === "commendation");

  const score = accumulateScore(mistakes);
  const passed = isPassing(score);

  const failReasons: FailReason[] = [];
  if (score.hasDangerous) failReasons.push("dangerous-mistake");
  if (score.totalPoints > PASS_MAX_TOTAL_POINTS) failReasons.push("total-points-exceeded");
  if (score.osnovniPoints > PASS_MAX_OSNOVNI_POINTS) failReasons.push("osnovni-points-exceeded");

  // ---------------------------------------------------------------------
  // THE TEACH-FIRST HOLE, RULED ON 2026-08-09 (register row 21). READ THIS
  // BEFORE "fixing" the loop below — the omission is understood, not missed.
  // ---------------------------------------------------------------------
  // The loop reads MISTAKES, and `mistakes` are the SCORED events only:
  // lessons/engine.ts pushes to `scoredEvents` when `coachStep` returns
  // `scored: true`, and to `teachMoments` when it returns mode "teach". A
  // first-encounter основна (scenarios/policy.ts `teach-first-then-grade`) is
  // taught, never scored — so it contributes NO conceptId, and the theory
  // recommender never learns the student met it.
  //
  // That was tolerable while the class held codes a student meets repeatedly.
  // It stopped being tolerable on 2026-08-09, when the Наредба № 38 review
  // moved CROSSED_SOLID_LINE from опасна (always-grade, first encounter
  // included) into this class. Крайният ефект, verified by driving
  // sc-ov-solid-return at L3: the FIRST crossing of a solid осева raises a
  // „Учебен момент" card reading „Първа среща — не се брои в резултата. При
  // повторение: −3 т.", the result screen reads 0 наказателни точки — and
  // `c-longitudinal-markings` is never recommended. The single most-taught
  // marking rule in the syllabus is invisible to the recommender exactly once
  // per student: the one time we KNOW he did not know it.
  //
  // THE RULING. Teach-first is right for the SCORE and wrong for the
  // RECOMMENDER, and the two have been fused only because the recommender
  // reads the score. Withholding the penalty from a first-timer is the whole
  // point of A12 and must not be undone — a 17-year-old punished for a rule
  // nobody taught him is the trust failure the policy exists to prevent. But
  // the justification for not charging is „we teach it instead", and the
  // teaching that the charge buys IS the linked theory practice. Dropping the
  // conceptId means the student gets a modal and the system forgets. A taught
  // encounter is not weaker evidence of a knowledge gap than a graded one —
  // it is the SAME evidence, arriving earlier and cheaper. Deliberately not
  // teaching to it is the one outcome no reading of the north star supports.
  //
  // WHAT IS NOT CHANGED HERE, AND WHY. `buildSessionSummary` takes
  // ScorableEvents; feeding it taught events would give them POINTS, which is
  // precisely the thing that must not happen. The smallest honest closure is a
  // second, unscored channel — the taught codes' conceptIds unioned in after
  // the loop — and it costs one line in lessons/engine.ts (pass
  // `teachMoments`) plus the learning module's agreement that a taught concept
  // is a recommendable one. That crosses a module boundary (docs/architecture
  // /05) and changes what the theory side is told, so it is the lead's call
  // and not a severity edit's side effect. Written here rather than filed
  // elsewhere because THIS loop is where the signal is dropped.
  //
  // ── 2026-08-20: THE CHANNEL WAS BUILT, AND NOTHING EVER FED IT ──
  //
  // sweep161 photographed the consequence a second time —
  // `sc-follow-cutin/mobile-wrong/08-debrief.png`: *„0 наказателни точки, 0
  // опасни, 0 основни, despite doing 59 km/h in a posted 50 zone and drawing a
  // 'Превишена скорост' teach card on screen. The only mark against it is that
  // not all route tasks were done."* The finding was filed against THIS file.
  //
  // It is not this file. `buildSessionSummary` is a reducer over scored events
  // and 0 is the honest total of what it was handed. The half that is missing
  // is downstream, and it has already been written: `lessons/debrief.ts`
  // carries `DebriefContext.coachedMistakes`, filters it against the ledger so
  // a charged code cannot be filed under „не влизат в точките", and prints the
  // section — its own docstring cites the identical defect on
  // `sc-signal-flashing · mobile · wrong` (59 against a 50 badge, debrief said
  // „чисто каране без нито едно нарушение").
  //
  // AND NO PRODUCTION CALLER PASSES IT. Grepped across `src/`, the only places
  // that supply `coachedMistakes` are two test files that hand it to themselves.
  // The authoritative server debrief —
  // `app/(dashboard)/simulator/actions.ts`, the `buildDebrief(lesson, result,
  // {...})` call — passes `microQuiz`, `priorBestScore` and `conceptTitles` and
  // stops there, and the client fallback in
  // `components/sim/lesson-ui/LessonPlayShell.tsx` calls `buildDebrief(lesson,
  // result)` with no context at all, while holding the teach queue itself
  // (`setTeachQueue`, same file). So the feature is green in CI and absent on
  // the glass, which is why two sweeps in a row photographed it as fixed code.
  // Routed there: the queue has to ride the session payload to the server, or
  // the fallback has to pass its own. Nothing in `rules/` can do it.
  const conceptIds: string[] = [];
  for (const m of mistakes) {
    if (m.conceptId !== undefined && !conceptIds.includes(m.conceptId)) {
      conceptIds.push(m.conceptId);
    }
  }

  return {
    score,
    passed,
    failReasons,
    terminated: mistakes.some((m) => m.terminateSession === true),
    mistakes,
    commendations,
    conceptIds,
  };
}
