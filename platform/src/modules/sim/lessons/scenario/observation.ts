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

  // ONE GLANCE MAY SATISFY ONLY ONE MOMENT (doc 76 §6 honesty rule).
  //
  // The windows above OVERLAP by construction: the last moment's window is
  // [reverseEnd − 5, ∞) and every middle moment's is [reverseStart, reverseEnd],
  // so the final five seconds of the reverse phase lie in both. The previous
  // loop tested each moment against the whole glance list independently, and a
  // single glance one second before the car stopped therefore credited the
  // middle moment AND the final check — «наблюдение 2/3» off one look.
  //
  // That is reachable on every template that ships this channel: eleven parking
  // drills author three moments each (obs-before-reverse, obs-during-reverse /
  // obs-van-side / obs-opposite-row, obs-final-check), and the middle one names
  // a DIFFERENT thing to look at from the last. Crediting both from one glance
  // is a rubric star for an observation the student never made — the same crime
  // as a green tick for a skill nothing measured, on the surface the debrief
  // reads its stars off.
  //
  // So glances are CONSUMED: a moment takes a glance and no other moment may
  // count it again. n moments now require n distinct glances.
  //
  // WHICH moment gets a contested glance decides what the DEBRIEF PRINTS, so it
  // is not a tie-break — it is the whole answer. The assignment runs LAST MOMENT
  // FIRST, each taking the LATEST unspent glance inside its own window. A single
  // look one second before the car stops is then credited as the pre-stop check
  // it obviously was, and the during-reverse moment goes unticked. Assigning
  // forward instead (earliest moment, earliest glance) produces the same COUNT
  // and the wrong NAME: it prints „Оглед по време на движението назад ✓" and
  // refuses „Последна проверка преди спиране" to a student who made exactly the
  // final check — a false refusal and a false certificate in one row.
  //
  // Later moments having first claim can never starve an earlier one of a
  // credit it would otherwise have had: the windows run in time order, so a
  // glance a later moment can take is one an earlier moment's window either
  // also contains (same count either way) or does not reach at all.
  //
  // The other direction is preserved deliberately — a student who really does
  // look three times still scores 3/3, and no window was narrowed, so no glance
  // that used to count stops counting on its own account.
  const spent = new Set<number>();
  const takeLatestGlance = (fromSec: number, toSec: number): boolean => {
    for (let g = glances.length - 1; g >= 0; g--) {
      if (spent.has(g)) continue;
      if (glances[g] >= fromSec && glances[g] <= toSec) {
        spent.add(g);
        return true;
      }
    }
    return false;
  };

  const filled = new Array<boolean>(moments.length).fill(false);
  for (let i = moments.length - 1; i >= 0; i--) {
    const isFirst = i === 0;
    const isLast = i === moments.length - 1 && moments.length >= 2;
    filled[i] = isFirst
      ? takeLatestGlance(reverseStart - BEFORE_WINDOW_SEC, reverseStart + BEGIN_GRACE_SEC)
      : isLast
        ? takeLatestGlance(reverseEnd - FINAL_WINDOW_SEC, Number.POSITIVE_INFINITY)
        : takeLatestGlance(reverseStart, reverseEnd);
  }
  // Reported in AUTHORED order — the rubric renders the moment titles in the
  // order the template wrote them, and `glances` is already sorted by tSec.
  const observed = moments.filter((_, i) => filled[i]).map((m) => m.id);
  return { observedMomentIds: observed };
}
