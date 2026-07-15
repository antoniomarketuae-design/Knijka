/**
 * Observation channel (S1, doc 76 §6): map a recorded ATTEMPT trace's glance
 * events onto a template's authored observation moments, so the rubric can
 * score „наблюдение" from what the student actually did (mirror/shoulder
 * keys and cockpit hotspot presses — the same graded glance path).
 *
 * V1 mapper — the PARKING-FAMILY window model, honest about its shape: the
 * maneuver's story is "look BEFORE reversing → keep looking WHILE reversing
 * → final check before the stop", so the authored moments map onto windows
 * around the attempt's reverse phase in ORDER:
 *   - moment[0]           ← a glance within 10 s before reverse begins
 *                           (or right as it begins);
 *   - middle moments      ← a glance while reverse gear is engaged;
 *   - last moment (n ≥ 2) ← a glance in the final 5 s of the reverse phase
 *                           or after it (the pre-stop check).
 * No reverse phase in the trace ⇒ null — the channel is UNMEASURED
 * (scoreRubric renders "не се измерва", never a silent 0), exactly the
 * doc 76 §6 honesty rule.
 */

import type { ScenarioTrace } from "../../traces";
import type { RubricObservationInput, RubricSpec } from "./types";

const BEFORE_WINDOW_SEC = 10;
const BEGIN_GRACE_SEC = 0.75;
const FINAL_WINDOW_SEC = 5;

type Moments = NonNullable<RubricSpec["observation"]>["moments"];

export function parkingObservationFromTrace(
  trace: Pick<ScenarioTrace, "samples" | "events">,
  moments: Moments,
): RubricObservationInput | null {
  if (moments.length === 0) return { observedMomentIds: [] };

  let reverseStart: number | null = null;
  let reverseEnd: number | null = null;
  for (const s of trace.samples) {
    if (s.gear < 0) {
      if (reverseStart === null) reverseStart = s.tSec;
      reverseEnd = s.tSec;
    }
  }
  if (reverseStart === null || reverseEnd === null) return null;

  const glances = trace.events
    .filter((e) => e.kind.startsWith("glance-"))
    .map((e) => e.tSec);

  const covered = (fromSec: number, toSec: number): boolean =>
    glances.some((t) => t >= fromSec && t <= toSec);

  const observed: string[] = [];
  for (let i = 0; i < moments.length; i++) {
    const isFirst = i === 0;
    const isLast = i === moments.length - 1 && moments.length >= 2;
    const ok = isFirst
      ? covered(reverseStart - BEFORE_WINDOW_SEC, reverseStart + BEGIN_GRACE_SEC)
      : isLast
        ? covered(reverseEnd - FINAL_WINDOW_SEC, Number.POSITIVE_INFINITY)
        : covered(reverseStart, reverseEnd);
    if (ok) observed.push(moments[i].id);
  }
  return { observedMomentIds: observed };
}
