/**
 * Hazard → mastery feed.
 *
 * WHY THIS EXISTS. A differentiator that keeps its own score in its own corner
 * is a silo, and a silo is how a feature quietly becomes optional. The
 * simulator already solved this: every catalog violation carries a
 * knowledge-graph `conceptId`, and modules/learning/simFeed.ts folds sim
 * mistakes into the SAME Progress rows that practice and exams write, so a
 * mistake made while driving shows up in review scheduling and readiness. A
 * hazard item is anchored to the same catalog codes, so it folds in the same
 * way — one mastery picture, three sources of evidence.
 *
 * EVIDENCE MODEL (the decisions, written down so they can be argued with):
 *
 *  missed   → a violation observation, but ONE SEVERITY STEP SOFTER than the
 *             catalog says (опасна→основна, основна→второстепенна). Missing a
 *             hazard on video is real evidence of a scanning gap, but it is not
 *             the same evidence as driving through the crossing: the student
 *             had no wheel, no mirrors and no peripheral vision. Grading it at
 *             full опасна weight would let a hard clip reset a concept's SM-2
 *             ladder as hard as a 10-point exam fault, and the review queue
 *             would fill up with concepts the student may actually know.
 *  excellent
 *  good     → a commendation: weak positive evidence, exactly like driving
 *             correctly past one stop sign (simFeed SIM_COMMENDATION_GAIN).
 *  late     → nothing. One point means the press landed inside the window, so
 *             it is not a failure; but it is not evidence of mastery either.
 *             Silence is the honest reading.
 *  early    → nothing. Pressing before the hazard exists is a strategy problem
 *             the reveal addresses directly; it says nothing about whether the
 *             student understands чл. 119.
 *  void     → nothing. A voided clip taught us nothing about the student, and
 *             feeding an anti-cheat trip into mastery would punish twice.
 *
 * Items whose catalog entry has no `conceptId` (a handful do not) contribute
 * nothing — inventing a concept link to make the graph look busier is how a
 * mastery number stops meaning anything.
 */

import type { HazardVerdict } from "@/components/hazard/types";
import type { SimObservation, SimSeverity } from "@/modules/learning";
import { VIOLATIONS } from "@/modules/sim/rules";
import { getHazardBank, type HazardBank } from "./bank";

/** One graded clip, as the run summary reports it (HazardRunItemLine fits). */
export interface HazardOutcomeLine {
  itemId: string;
  verdict: HazardVerdict;
}

/**
 * One step softer than the catalog. See the evidence model in the header — the
 * floor is второстепенна, which simFeed treats as a mastery dip with no lapse
 * and no schedule change.
 */
export const HAZARD_SEVERITY_SOFTENING: Record<SimSeverity, SimSeverity> = {
  opasna: "osnovna",
  osnovna: "vtorostepenna",
  vtorostepenna: "vtorostepenna",
};

/**
 * Turn graded clips into mastery observations. Pure — the caller decides
 * whether to persist them, which is what makes this testable without a store.
 */
export function hazardObservations(
  lines: readonly HazardOutcomeLine[],
  bank: HazardBank = getHazardBank(),
): SimObservation[] {
  const out: SimObservation[] = [];
  for (const line of lines) {
    const item = bank.byId(line.itemId);
    if (item === undefined) continue;
    const spec = VIOLATIONS[item.violationCode];
    const conceptId = spec?.conceptId;
    if (conceptId === undefined) continue;

    if (line.verdict === "missed") {
      out.push({
        conceptId,
        kind: "violation",
        severity: HAZARD_SEVERITY_SOFTENING[spec.severityClass],
      });
    } else if (line.verdict === "excellent" || line.verdict === "good") {
      out.push({ conceptId, kind: "commendation" });
    }
    // late / early / void: deliberately silent — see the header.
  }
  return out;
}

/**
 * Fold a finished run into the learner model.
 *
 * Best-effort by design, exactly like submitExam's mastery feed: a failure to
 * update Progress must never lose or invalidate a graded run. The run row is
 * the evidence; mastery is a derived convenience.
 *
 * CALL SITE. The delivery layer's run lifecycle has no user id at judge time
 * (the port is deliberately two methods), so this is called ONCE by the surface
 * that finished the run — the server action that receives `summary !== null`
 * from submitHazardReaction. Until that call exists the feed is inert, which is
 * a wiring gap and not a silent wrong number.
 */
export async function recordHazardOutcomes(
  userId: string,
  lines: readonly HazardOutcomeLine[],
  now: Date = new Date(),
): Promise<void> {
  const observations = hazardObservations(lines);
  if (observations.length === 0) return;
  try {
    const { recordSimObservations } = await import("@/modules/learning");
    await recordSimObservations(userId, observations, now);
  } catch (err) {
    console.warn("hazard: mastery feed failed (run is still graded)", err);
  }
}
