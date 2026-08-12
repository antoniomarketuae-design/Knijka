/**
 * „КОЯ Е НАЙ-ТЕЖКАТА ГРЕШКА НА КАРТАТА" — one ordering over a set of cited
 * codes, so that no surface has to pick one by hand again.
 *
 * ===========================================================================
 * THE DEFECT THIS FILE EXISTS FOR (2026-08-10, seen RENDERED)
 * ===========================================================================
 * `sc-pe-parked-row-scan / mistake-fast-row` shows a student driving 50 km/h
 * past a row of parked cars, a child stepping out from between two of them, and
 * THE CAR HITTING HER — since the geometry wave, a real rectangle strike, not a
 * scripted beat. The demo cites three codes and lists them in the order the
 * lesson tells them:
 *
 *     ["SPEEDING_OVER_LIMIT", "PEDESTRIAN_CROSSING_TOO_FAST", "COLLISION"]
 *
 * `MistakeConsequenceOverlay` read `codeRefs[0]` for the severity chip, the
 * points figure, the law chip AND the чл. 48, ал. 3 termination rider, so the
 * card badged running over a child
 *
 *     «второстепенна грешка · −1 изпитна т.»,  with no termination line,
 *
 * while its own stored prose said „Трето, ударът прекратява изпита." A card
 * that misprices what the student has just watched teaches the wrong lesson
 * more effectively than no card at all (THEO-4).
 *
 * ===========================================================================
 * WHY „FIRST-LISTED" HAS NO BASIS, AND WHAT REPLACES IT
 * ===========================================================================
 * Наредба № 38, приложение № 5, т. 10 prices a fault by its CLASS — опасна 10,
 * основна 3, второстепенна 1 — and т. 11 fails the sheet above 9, so an опасна
 * fault decides the outcome of the sheet on its own. Nothing in the act, or in
 * any act this repo holds, gives authoring order any meaning at all. The order
 * of `codeRefs` is an editorial decision about which fault the LESSON leads
 * with; it was silently doubling as a legal one.
 *
 * The ordering here is the act's, in two steps:
 *
 *   1. CLASS, by the points т. 10 attaches to it. 10 > 3 > 1.
 *   2. Within a class, THE ONE THAT ENDS THE EXAM WINS. Наредба № 38,
 *      чл. 48, ал. 3 ends a practical exam „при повторна намеса на комисията …
 *      и при допускане на ПТП", and exactly one code in the catalogue carries
 *      that flag. FAILED_TO_YIELD and COLLISION are both опасни and both cost
 *      10; only the second stops the exam, so only the second may badge a card
 *      that shows a ПТП. Nine of the twenty-four cards this fixed are of that
 *      shape — same number, different sentence.
 *   3. Ties beyond that keep the author's order, so a card with two equal
 *      faults still leads with the one the lesson leads with.
 *
 * A REORDER IS NOT A FIX. One card (`sc-hz-brake-dont-swerve`) had already been
 * corrected by moving COLLISION to the front of its list. That mends one card
 * and leaves the mechanism — and the next author to add a code at index 0
 * silently re-prices the badge. The derivation is the fix; the reorder becomes
 * a no-op, which is how it should be.
 *
 * NOT A SCORE. This answers „which fault prices this card", never „what did the
 * drive cost": a session with three faults is charged all three (rules/scoring
 * `accumulateScore` sums them). Anything summing points wants that fold, not
 * this function.
 */

import { VIOLATIONS, type ViolationSpec } from "./catalog";
import { SEVERITY_POINTS, type SeverityClass, type ViolationCode } from "./types";

/**
 * The act's own ordering of the three classes, expressed as the points т. 10
 * attaches to each — so it cannot drift from the charge it ranks by.
 */
export function severityRank(severity: SeverityClass): number {
  return SEVERITY_POINTS[severity];
}

/** A resolved winner: the code and the catalogue row that priced it. */
export interface GravestViolation {
  code: ViolationCode;
  spec: ViolationSpec;
}

/** Catalog row of a code (string-keyed lookup over the closed record). */
function specOf(code: string): ViolationSpec | undefined {
  return (VIOLATIONS as Record<string, ViolationSpec | undefined>)[code];
}

/**
 * The gravest of `codes` under Наредба № 38 — class first, then the fault that
 * ends the exam, then the author's order. Unknown codes are skipped (they carry
 * no charge to compare); `null` when none of them resolves.
 */
export function gravestViolation(codes: readonly string[]): GravestViolation | null {
  let best: GravestViolation | null = null;
  for (const code of codes) {
    const spec = specOf(code);
    if (spec === undefined) continue;
    if (best === null) {
      best = { code: code as ViolationCode, spec };
      continue;
    }
    const byClass = severityRank(spec.severityClass) - severityRank(best.spec.severityClass);
    if (byClass > 0) {
      best = { code: code as ViolationCode, spec };
      continue;
    }
    // Same class: чл. 48, ал. 3 outranks „only" a failed sheet.
    if (byClass === 0 && spec.terminateSession === true && best.spec.terminateSession !== true) {
      best = { code: code as ViolationCode, spec };
    }
  }
  return best;
}
