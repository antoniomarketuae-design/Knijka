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
 *
 * Those windows OVERLAP at both of the middle's edges, and one glance may
 * satisfy only one moment, so the mapper assigns in a fixed order rather than
 * per-moment: PRE-STOP CHECK → BEFORE-CHECK → DURING-CHECKS. That keeps each
 * named check on the edge it is named after, and §5 of the test file shows the
 * ordering costs no credit — WHILE THE REVERSE PHASE LASTS AT LEAST
 * `FINAL_WINDOW_SEC + BEGIN_GRACE_SEC` = 5.75 s, which is the only span §5
 * exercises. Under it the two NAMED windows overlap each other and the pre-stop
 * check wins the before-check's tail; see „THE SHORT-REVERSE RESIDUAL" below.
 */

import type { ScenarioTrace } from "../../traces";
import type { RubricObservationInput, RubricSpec } from "./types";

const BEFORE_WINDOW_SEC = 10;
/**
 * How late the "look BEFORE reversing" check may be and still be that check.
 *
 * The learner puts the selector in R and looks — in that order, three quarters
 * of a second apart, because the hand and the head are not on the same clock.
 * That is the glance the moment is named after, so the window reaches past the
 * instant reverse engages to collect it. It is NOT a licence to skip the check:
 * `BEFORE_WINDOW_SEC` still requires the look to be within ten seconds of the
 * manoeuvre, and one glance may still satisfy only one moment.
 */
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
  // is not a tie-break — it is the whole answer. The pre-stop check has FIRST
  // CLAIM on the final window, taking the LATEST unspent glance in it. A single
  // look one second before the car stops is then credited as the pre-stop check
  // it obviously was, and the during-reverse moment goes unticked. Letting the
  // middle moment have it instead produces the same COUNT and the wrong NAME: it
  // prints „Оглед по време на движението назад ✓" and refuses „Последна проверка
  // преди спиране" to a student who made exactly the final check — a false
  // refusal and a false certificate in one row.
  //
  // The other direction is preserved deliberately — a student who really does
  // look three times still scores 3/3, and no window was narrowed, so no glance
  // that used to count stops counting on its own account.
  //
  // ---------------------------------------------------------------------------
  //
  // BOTH SHARED EDGES BELONG TO THE NAMED CHECK, NOT TO THE MIDDLE.
  //
  // The during-reverse window [reverseStart, reverseEnd] swallows BOTH of its
  // neighbours' overlaps — the final five seconds at its top, and at its bottom
  // the BEGIN_GRACE_SEC tail the before-check reaches across. Running the
  // assignment purely last-moment-first resolved the top edge correctly and the
  // bottom edge backwards: a lone glance at reverseStart + 0.5 was taken by the
  // middle moment, so the debrief printed „Оглед по време на движението назад ✓"
  // and refused „Оглед ПРЕДИ включване на задна" to a student who made exactly
  // the before-check, half a second late. Both halves are false and the ✓ is the
  // dangerous half: it certifies that he kept watching while the car was moving
  // backwards, which is the one thing he did not do.
  //
  // MEASURED, on the shipped mapper, three moments, reverse over [10, 20]:
  //   glances [10.5] → ["obs-during-reverse"]   ← the defect
  //   glances [10.8] → ["obs-during-reverse"]   ← identical, and 10.8 is OUTSIDE
  //                                               the grace window entirely
  // Inside the grace and outside it produced the same debrief, which is what an
  // unguarded constant looks like from the student's side: BEGIN_GRACE_SEC could
  // be set to 0 and 2 296 tests across 107 files stayed green.
  //
  // THE ORDER IS THE FIX: pre-stop check → before-check → during-checks.
  //
  // …AND THE BEFORE-CHECK TAKES ITS EARLIEST GLANCE, NOT ITS LATEST, WHICH IS
  // THE HALF THAT COSTS NOTHING. Its window is the only one reaching back before
  // the manoeuvre, so the early glances are its alone and the shared tail is
  // worth more to the middle moment than to it. Give it the latest instead and
  // the student who looks at 5 s and again at 10.5 s loses a credit he has today
  // — the before-check would eat 10.5, and 5 is outside every other window. §5 of
  // the test file brute-forces that ON ITS FIXTURE: over a 696-input sweep the
  // number of moments credited equals the true maximum matching between glances
  // and windows, so no naming decision here is paid for in stars.
  //
  // ---------------------------------------------------------------------------
  //
  // THE SHORT-REVERSE RESIDUAL — KNOWN, PRE-EXISTING, STILL OPEN.
  //
  // §5's fixture reverses for 10 s, and the maximality it proves holds only
  // while the reverse phase lasts at least FINAL_WINDOW_SEC + BEGIN_GRACE_SEC =
  // 5.75 s. Under that the pre-stop window [reverseEnd − 5, ∞) opens INSIDE — or
  // before — the before-check's grace tail, the two NAMED windows overlap each
  // other, the pre-stop check goes first and takes the glance the before-check is
  // named after, and the count can fall below the maximum matching too.
  //
  // MEASURED against an independent brute-force matcher — three moments,
  // exhaustive 1-, 2- and 3-glance sweep, 696 inputs per span:
  //   span 10.00 s → 0 sub-maximal    5.75 s → 0        5.74 s →  54
  //   span  4.17 s → 207              1.95 s → 157
  // …and against the mapper as it shipped before this change: 0 inputs, at every
  // span and every cardinality, where this version credits FEWER moments. The
  // residual is inherited, not introduced here — but it is live, not theoretical.
  // Eight committed parking traces reverse for under 5.75 s, and two templates
  // (sc-park-parallel-exit, sc-park-bay-exit-rev) begin ALREADY in reverse, so
  // reverseStart = 0 and the before-window is the drill's first 0.75 s. On
  // content/traces/sc-park-parallel-exit/mistake-no-look.trace.json — reverse
  // [0, 5.0], a single glance at t = 0 — this mapper prints „Огледало и през ляво
  // рамо преди изнасянето в лентата ✓", the move-off check made at the END of the
  // manoeuvre, and refuses „Оглед назад ПРЕДИ включване на задна", the one check
  // the student actually made. That is this file's own defect at the other window.
  //
  // LEFT ALONE ON PURPOSE. Clamping the pre-stop window to open at reverseStart +
  // BEGIN_GRACE_SEC fixes the name and DOES take a credit away: on reverse
  // [10, 14] with glances at 5 and 9.5 the student scores 2 today (before +
  // pre-stop) and 1 after the clamp — 9.5 lies in no other window. Trading a
  // false certificate for a lost star moves the defect rather than closing it.
  // Closing it properly means an augmenting-path matcher (maximal under any name
  // priority), or admitting that a „pre-stop check" window which can open before
  // the car ever moved is the wrong window — a scoring change with its own
  // evidence, not a tie-break tweak.
  const spent = new Set<number>();
  const takeGlance = (fromSec: number, toSec: number, prefer: "earliest" | "latest"): boolean => {
    const from = prefer === "latest" ? glances.length - 1 : 0;
    const step = prefer === "latest" ? -1 : 1;
    for (let g = from; g >= 0 && g < glances.length; g += step) {
      if (spent.has(g)) continue;
      if (glances[g] >= fromSec && glances[g] <= toSec) {
        spent.add(g);
        return true;
      }
    }
    return false;
  };

  const filled = new Array<boolean>(moments.length).fill(false);
  const lastIndex = moments.length - 1;
  const hasLastMoment = moments.length >= 2;

  if (hasLastMoment) {
    filled[lastIndex] = takeGlance(
      reverseEnd - FINAL_WINDOW_SEC,
      Number.POSITIVE_INFINITY,
      "latest",
    );
  }
  filled[0] = takeGlance(
    reverseStart - BEFORE_WINDOW_SEC,
    reverseStart + BEGIN_GRACE_SEC,
    "earliest",
  );
  // Middle moments run backwards so a later one gets the later look — the same
  // temporal correspondence the moments are authored in.
  for (let i = (hasLastMoment ? lastIndex - 1 : lastIndex); i >= 1; i--) {
    filled[i] = takeGlance(reverseStart, reverseEnd, "latest");
  }
  // Reported in AUTHORED order — the rubric renders the moment titles in the
  // order the template wrote them, and `glances` is already sorted by tSec.
  const observed = moments.filter((_, i) => filled[i]).map((m) => m.id);
  return { observedMomentIds: observed };
}
