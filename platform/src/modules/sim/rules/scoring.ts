/**
 * Scoring accumulator mirroring the official practical-exam pass rule
 * (docs/education/32, Наредба № 38):
 *
 *   pass <=> total penalty points <= 9 AND points from основни <= 6
 *            AND no опасна mistake.
 *
 * One опасна is 10 points and already exceeds the 9-point cap, so the
 * `hasDangerous` flag is technically redundant for pass/fail — we keep it
 * explicit because the official rubric names it as an instant-fail condition
 * and the UI/debrief must surface it as such (the sim session still continues
 * for learning value).
 *
 * ---------------------------------------------------------------------------
 * THE LEDGER CLOSES WHEN THE DRIVE DOES (2026-08-17, the catalogue sweep)
 * ---------------------------------------------------------------------------
 *
 * The fold above had no notion that an exam can END, so it kept billing for as
 * long as events kept arriving. The 2026-08-16 sweep photographed what that
 * costs on a scale whose own allowance is 9:
 *
 *   sc-follow-distance   mobile-wrong   42 × ПТП   «420 наказателни точки»
 *   sc-follow-brake      pc-wrong       21 × ПТП   «210 наказателни точки»
 *   sc-ov-crossing-overtake mobile-wrong 16 × ПТП + 1 × скорост «161»
 *   sc-ov-ban-overtake   mobile-RIGHT    3 × ПТП   «30 наказателни точки»
 *   sc-ov-narrow         pc-RIGHT        2 × ПТП   «20» — against «10» for the
 *                                                  reckless run on the same
 *                                                  lesson, i.e. the careful
 *                                                  drive graded twice as badly
 *                                                  as charging the gap.
 *
 * Re-driven on staging on 2026-08-17 through `tools/mobile/lesson-audit.mjs`,
 * the first of those now reads «Опасни грешки 17 · 170 · Общо (допустими 9) 17
 * 170» — engine.ts's `COLLISION_REOPEN_TRAVEL_M` collapsed 42 reports into 17
 * real encounters and correctly stopped there, because between bumps the car
 * genuinely moved. The remaining 17 are the half a travel gate cannot reach.
 *
 * The sweep printed each of these directly above the catalogue's own sentence for
 * COLLISION: «Това е ЕДНА опасна грешка и цялата десетка е цената на самото
 * деяние — не сбор от натрупани дребни пропуски… сесията се оценява като
 * прекратена.» The card promised a termination the ledger never performed.
 *
 * WHY THIS IS NOT THE ENGINE'S BUG WEARING A DIFFERENT HAT. engine.ts already
 * defends the other half: `COLLISION_REOPEN_TRAVEL_M` refuses to open a second
 * contact episode until the car has actually driven 2 m, so one embedded bumper
 * re-reported for a minute bills once. That gate answers „HAVE THE BODIES COME
 * APART?" — and it cannot answer „IS THE EXAM STILL RUNNING?", because the
 * answer to the second is no even when the answer to the first is yes. A
 * student who hits a car, reverses out, drives fifty metres and hits another
 * has genuinely had two accidents, and the practical exam still ended at the
 * first one. That is the 30 above: three separations, three honest contact
 * episodes, one exam that was over after 10 points. Only the ledger can know
 * this, because only the ledger holds the whole session.
 *
 * WHAT CLOSES IT, AND WHAT DELIBERATELY DOES NOT. Наредба № 38, чл. 48, ал. 3
 * (n38.ts `N38_TERMINATION_RULE`) ends a practical exam in exactly two cases:
 * повторна намеса на комисията, and допускане на ПТП. It is NOT „any опасна":
 * n38.ts records that the product once told students every опасна „прекратява
 * изпита на място" and that this was wrong — a red light or a missed Б2 costs
 * 10, and 10 > 9 makes the exam НЕИЗДЪРЖАН by приложение № 5, т. 11, but the
 * candidate keeps driving and the examiner keeps ticking. So a second red light
 * still bills a second 10 here, exactly as before. The only closer is the
 * catalogue's `terminateSession` flag — today COLLISION alone, an invariant
 * `__tests__/naredba-38-classification.test.ts` holds.
 *
 * IT CANNOT CREDIT ANYBODY, AND THAT IS STRUCTURAL, NOT LUCKY. Dropping points
 * is the shape of change that turns a failure into a false pass, so the closer
 * additionally requires the terminating violation to be `opasna` itself. That
 * violation is APPLIED before the ledger closes, so `hasDangerous` is already
 * true at every closed ledger and `isPassing` is false whatever follows — a
 * closed ledger can never be a passing one. Guarded in
 * `__tests__/scoring-ledger-close.test.ts` („closing the ledger can never turn
 * a fail into a pass").
 *
 * THE `opasna` REQUIREMENT ITSELF WAS UNGUARDED UNTIL 2026-08-23, which is the
 * shape this whole paragraph was written to prevent: the sentence above is an
 * argument, and an argument is not a test. Deleting `severityClass === "opasna"`
 * from the closing predicate left all 810 tests of `src/modules/sim/rules`
 * GREEN. It is now ONE predicate (`closesTheLedger`, which `ledgerCloseTime`
 * calls rather than restating) and the block „the guard that keeps the closure
 * from manufacturing a pass" fails on its deletion — including the case that
 * `hasDangerous` cannot catch, a terminating fault of a LIGHTER class, where
 * nothing опасно happened and the closure would drop a 10-point sheet to 3.
 *
 * IT IS TIME-BASED, NOT POSITION-BASED. The closing moment is found first and
 * the fold then skips violations with `t` STRICTLY AFTER it, so an event array
 * that is not sorted by time (nothing in the contract promises it is —
 * summary.ts sorts, the live shell does not) cannot silently swallow points
 * that were earned BEFORE the crash. Same-instant events still score: a
 * speeding bill on the collision frame happened on the exam's last frame, not
 * after it.
 *
 * ONE TERMINATION, ONE BILL — AND WHY `t` ALONE CANNOT SAY IT. Keeping the
 * same instant scorable is the right trade for a speeding bill and the wrong
 * one for a SECOND ПТП: `t > closeAt` is false for both, so a duplicate of the
 * very fault that ended the exam would be billed a second time and the protocol
 * table would print «Опасни грешки 2» directly under the catalogue's own
 * sentence saying it is one. Events sharing a frame share `t` exactly — that is
 * what a frame is — so the tie is reachable by construction the moment anything
 * but rules/engine.ts feeds this fold (its contact latch happens to allow one
 * report per tick; scoring is a public module API and cannot rest on that).
 * The fold therefore bills the closer ONCE and marks every later terminating
 * fault unscored whatever its `t`, which is the rule чл. 48, ал. 3 actually
 * states rather than a time comparison that usually implies it. It cannot
 * credit anybody for the same structural reason as the closure itself: the
 * copy it drops is a DUPLICATE of a fault already applied, so `hasDangerous`
 * was true before the drop and stays true after it.
 *
 * WHAT THIS LEDGER DOES NOT REACH, MEASURED — AND THE CORPUS THAT MEASUREMENT
 * WAS TAKEN OVER (re-measured 2026-08-18). The figure that stood here — „every
 * `run.log` under `.audit-frames/sweep161`, 348 legs carrying one… 26 are still
 * over 30" — reproduces exactly, and 348 is not the sweep. A leg writes its
 * mistake list to whichever name its chunk of the harness used: `run.log` on
 * 348 legs, `log.txt` on 123, `drive.log` on 23 — 494 in all. Reading one name
 * dropped 146 legs, and the 11 residual legs among them are ALL junction
 * lessons, which is where the worst of it lives: sc-junction-scan/pc-wrong
 * «356» — the largest residue in the corpus — sc-junction-scan/mobile-wrong
 * «287»→206, sc-junction-stop/pc-wrong «394»→133, sc-junction-left/pc-wrong
 * «344»→113, sc-junction-gap/mobile-wrong «243»→111. A corpus selected by
 * filename hid the family with the most to say.
 *
 * Over all 494: 279 legs finished over the 9-point allowance; through this
 * ledger 37 are still over 30, and 13,245 photographed points become 6,385.
 * Two invariants hold across every one of the 494 — no leg bills more than 10
 * points of ПТП (one crash, one bill, on real drives and not only on the
 * fixtures below), and of the 3,307 points left in those 37 legs exactly 170
 * are collision points: one closer each in the 17 of them that crashed at all.
 * The other 3,137 are a single continuing condition billed per sample —
 * WRONG_WAY ×5–7 and EMERGENCY_LANE_DRIVING ×6 on sc-ac-wind-truck-pass and
 * sc-merge-accel-lane, SPEEDING_DANGEROUS ×10–11 on sc-ed-reverse-line and the
 * sc-park lessons, STOP_SIGN_NO_FULL_STOP ×11 on sc-merge-from-property,
 * SPEEDING_DANGEROUS/STOP_SIGN_NO_FULL_STOP/FAILED_TO_YIELD ×3–5 each through
 * the junction family. That is the episode gate in engine.ts
 * (`__tests__/sweep161-fault-episodes.test.ts`), not this ledger, and it must
 * NOT be answered here by collapsing repeats: two red lights are two faults,
 * and collapsing repeated второстепенни would turn a 10-point fail into a
 * 7-point pass — the one direction a scorer may never move.
 *
 * WHAT IS STILL SHOWN. Nothing here touches the mistake LIST. Post-closure
 * faults keep their cards, their explanations and their concept ids — the sim
 * carries on precisely so they can be taught. `unscoredAfterClose` counts them
 * so a debrief can say so out loud instead of leaving a student to reconcile
 * «Опасни грешки 1» in the protocol table with a list of sixteen.
 */

import type { ScorableEvent, ViolationEvent } from "./types";

export const PASS_MAX_TOTAL_POINTS = 9;
export const PASS_MAX_OSNOVNI_POINTS = 6;

export interface ScoreBreakdown {
  totalPoints: number;
  opasniPoints: number;
  osnovniPoints: number;
  vtorostepenniPoints: number;
  opasniCount: number;
  osnovniCount: number;
  vtorostepenniCount: number;
  /** At least one опасна mistake — official instant-fail condition. */
  hasDangerous: boolean;
  /**
   * Session time (s) the exam ENDED at — Наредба № 38, чл. 48, ал. 3 — or null
   * for a session that ran to its own finish. Faults after it are taught, not
   * scored (see the header).
   */
  ledgerClosedAtSec: number | null;
  /**
   * How many violations are SHOWN but not billed — those after that moment,
   * plus any further copy of the terminating fault itself (see the header;
   * one shares the closing frame's `t` and is not "after" it). Zero whenever
   * `ledgerClosedAtSec` is null. Exists so the protocol table and the mistake
   * list can be reconciled on the screen rather than in the student's head.
   */
  unscoredAfterClose: number;
}

export function emptyScore(): ScoreBreakdown {
  return {
    totalPoints: 0,
    opasniPoints: 0,
    osnovniPoints: 0,
    vtorostepenniPoints: 0,
    opasniCount: 0,
    osnovniCount: 0,
    vtorostepenniCount: 0,
    hasDangerous: false,
    ledgerClosedAtSec: null,
    unscoredAfterClose: 0,
  };
}

/**
 * Pure fold step — returns a new breakdown, never mutates.
 *
 * THE RAW STEP, ON PURPOSE. It bills whatever it is handed and knows nothing
 * about termination: a single event cannot tell whether the exam was still
 * running when it happened, only the session can (see the header). Callers that
 * fold a whole session must use `accumulateScore`. `lessons/exam.ts` folds
 * manually and correctly does NOT need this — its loop returns on the very
 * event that trips the termination, so it never walks past a closed ledger.
 */
export function applyViolation(score: ScoreBreakdown, v: ViolationEvent): ScoreBreakdown {
  const next: ScoreBreakdown = { ...score, totalPoints: score.totalPoints + v.points };
  switch (v.severityClass) {
    case "opasna":
      next.opasniPoints += v.points;
      next.opasniCount += 1;
      next.hasDangerous = true;
      break;
    case "osnovna":
      next.osnovniPoints += v.points;
      next.osnovniCount += 1;
      break;
    case "vtorostepenna":
      next.vtorostepenniPoints += v.points;
      next.vtorostepenniCount += 1;
      break;
  }
  return next;
}

/**
 * Does this event carry the ground that ends the exam? The catalogue's
 * `terminateSession` flag (Наредба № 38, чл. 48, ал. 3; today COLLISION alone)
 * AND `opasna`.
 *
 * THE `opasna` HALF IS THE NO-FALSE-PASS GUARD, NOT DECORATION — see the
 * header. A terminating fault of any lighter class would close the ledger at a
 * total that could still be under 9, and dropping the rest would manufacture an
 * ИЗДЪРЖАН out of a drive that was failing.
 *
 * IT IS ONE PREDICATE BECAUSE IT USED TO BE TWO, AND NOTHING NOTICED (measured
 * 2026-08-23). `ledgerCloseTime` inlined the same three conditions and this
 * function restated them, with a comment claiming they were „the same test".
 * Mutating EITHER copy to drop `severityClass === "opasna"` left all 810 tests
 * of `src/modules/sim/rules` GREEN — the clause the header spends a paragraph
 * defending was, in both copies, unguarded and free to drift. The tests below
 * (`the guard that keeps the closure from manufacturing a pass`) now fail on
 * that mutation; sharing the predicate is what makes ONE such test enough.
 */
function closesTheLedger(e: ScorableEvent): boolean {
  return e.kind === "violation" && e.terminateSession === true && e.severityClass === "opasna";
}

/**
 * The moment the practical exam ended, or null if it never did — the EARLIEST
 * violation that `closesTheLedger`.
 *
 * Exported so a surface can name the second the drive stopped counting without
 * re-deriving the rule.
 */
export function ledgerCloseTime(events: ReadonlyArray<ScorableEvent>): number | null {
  let closeAt: number | null = null;
  for (const e of events) {
    if (!closesTheLedger(e)) continue;
    if (closeAt === null || e.t < closeAt) closeAt = e.t;
  }
  return closeAt;
}

/**
 * WHICH ROWS THE LEDGER ACTUALLY CHARGED — one flag per event of `events`, in
 * the same order, `false` for the ones the closure taught instead of scoring.
 *
 * IT EXISTS BECAUSE `unscoredAfterClose` IS A COUNT, AND A COUNT CANNOT BE
 * PRINTED NEXT TO A ROW. Every surface that lists faults was therefore summing
 * `points` itself, which is the ledger's own arithmetic performed WITHOUT the
 * closure — and it said so out loud. Measured 2026-08-18 on the
 * sc-hz-accident-scene squeeze (a car and a pedestrian struck 0.3 s apart): the
 * verdict read «10 наказателни точки», and the mistake list two lines below it
 * read «20 наказателни т.» over the same two rows. Both numbers came out of
 * this module; only one of them came out of this function.
 *
 * The closure rule is not restated here — `accumulateScore` folds this array,
 * so the flags and the totals cannot drift apart by construction.
 */
export function ledgerBilling(events: ReadonlyArray<ScorableEvent>): boolean[] {
  const closeAt = ledgerCloseTime(events);
  // The exam ends once, so the fault that ends it is billed once — including
  // against a copy sharing the closing frame, which `t > closeAt` cannot see.
  let closerBilled = false;
  const billed: boolean[] = [];
  for (const e of events) {
    if (e.kind !== "violation") {
      billed.push(false);
      continue;
    }
    if ((closeAt !== null && e.t > closeAt) || (closesTheLedger(e) && closerBilled)) {
      // Taught, not scored — the exam was already over when this happened.
      billed.push(false);
      continue;
    }
    // Set BEFORE the fold step so the closer is applied exactly once; that
    // application is what makes `hasDangerous` true at every closed ledger.
    if (closesTheLedger(e)) closerBilled = true;
    billed.push(true);
  }
  return billed;
}

export function accumulateScore(events: ReadonlyArray<ScorableEvent>): ScoreBreakdown {
  const billed = ledgerBilling(events);
  let score = emptyScore();
  score.ledgerClosedAtSec = ledgerCloseTime(events);
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.kind !== "violation") continue;
    if (!billed[i]) {
      score = { ...score, unscoredAfterClose: score.unscoredAfterClose + 1 };
      continue;
    }
    score = applyViolation(score, e);
  }
  return score;
}

/** The official pass rule (doc 32). */
export function isPassing(score: ScoreBreakdown): boolean {
  return (
    !score.hasDangerous &&
    score.totalPoints <= PASS_MAX_TOTAL_POINTS &&
    score.osnovniPoints <= PASS_MAX_OSNOVNI_POINTS
  );
}
