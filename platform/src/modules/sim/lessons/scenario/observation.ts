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
 * A glance also has to be the RIGHT WAY ROUND: a moment whose title names a
 * side is satisfied only by a glance to that side. See „WHICH WAY THE STUDENT
 * LOOKED" below for the derivation and for the committed trace that proved
 * the interior mirror was ticking a left-shoulder check.
 *
 * No reverse phase in the trace ⇒ null — the channel is UNMEASURED
 * (scoreRubric renders "не се измерва", never a silent 0), exactly the
 * doc 76 §6 honesty rule.
 *
 * DO NOT LIFT THAT NULL FOR THE MOVE-OFF FAMILY UNTIL A SHOULDER CONTROL
 * EXISTS. It is tempting: 12 of the 27 templates that author observation
 * moments are not parking drills (rubric.ts), so on those the debrief prints
 * „Няма измерване …" on every drive of every student, on the one card in the
 * product that grades оглеждане. A move-off window model is easy — the phase
 * boundary is the first sample that moves, exactly as `reverseStart` is the
 * first with `gear < 0`.
 *
 * It would make the product WORSE, and here is the arithmetic. `SC_VP_HANDBRAKE`
 * (templates-cockpit2.ts:136-137) authors two moments: „Поглед в огледалото,
 * преди колата да тръгне" and „Поглед през ляво рамо в мъртвата зона". The
 * cabin has no blind-spot glance to give — `MirrorGlanceKind` (scene/cabin.ts:72,
 * the audit corpus knows it as :22) is „left" | „right" | „rear" and stops
 * there, and every camera pose, touch
 * station and rule-engine channel downstream is keyed to those three. So the
 * only kind that can reach the second moment is `glance-left`, the LEFT DOOR
 * MIRROR. Open the window and the mapper starts printing „Поглед през ляво
 * рамо в мъртвата зона ✓" for a student who pressed the mirror — the exact
 * false certificate the side rule below was written to retire, re-issued at
 * the other end of the file, on the drill whose whole subject it is. An
 * honest „не се измерва" that names the moments and tells the student what
 * the examiner watches (rubric.ts) beats a green tick for an act the
 * interface cannot receive. The null stays until the shoulder glance ships.
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

// ---------------------------------------------------------------------------
// WHICH WAY THE STUDENT LOOKED — THE HALF THIS MAPPER USED TO THROW AWAY.
//
// The trace records the SIDE of every glance („glance-left" / „glance-right" /
// „glance-rear", traces/types.ts `TraceEventKind`) and the template names the
// side in the moment's own title. This function used to do
// `.map((e) => e.tSec)` and discard the kind, so the two windows below were
// matched on TIME ALONE: any glance satisfied any moment whose window it fell
// in, whatever the moment said to look at.
//
// MEASURED, on a committed trace, on a shipped drill — the reason this is not
// a tidiness change. `content/traces/sc-park-parallel-exit/mistake-no-look.
// trace.json` contains exactly ONE glance and it is `glance-rear`, the
// INTERIOR mirror. `SC_PARK_PARALLEL_EXIT` (templates-parking.ts:888) authors
// its second moment as „Огледало и през ЛЯВО РАМО преди изнасянето в лентата".
// Before this change the mapper returned `["obs-before-moveoff"]` for that
// drive: a look in the interior mirror printed a ✓ against a check over the
// LEFT SHOULDER, on the demonstration whose own file name is `mistake-no-look`.
// That is the product teaching a seventeen-year-old that the mirror discharges
// the blind-spot duty — the single most expensive thing this simulator could
// teach, since the blind spot is by definition the part the mirror does not
// show. After the change the same drive returns `["obs-before-reverse"]`: the
// rear look he DID make, credited under the name it deserves, and the
// left-shoulder moment refused. Same count, opposite lesson — and the NAME is
// the whole answer here, for exactly the reason set out under „BOTH SHARED
// EDGES BELONG TO THE NAMED CHECK" below.
//
// WHY ONLY THE SIDE, AND ONLY WHEN A GLANCE NOUN IS PRESENT.
//   · „назад" / „задна" are NOT read as a direction to look. In these titles
//     they mean the reverse GEAR („преди включване на задна") or the car's
//     direction of travel („Наблюдение назад по време на завъртането"), not
//     the mirror. Deriving „rear" from them would refuse a door-mirror glance
//     that is a perfectly good look during a reverse.
//   · a side word is only binding when the title also names the thing a glance
//     control addresses (огледало / рамо / мъртва зона). „Поглед напред-
//     надясно по алеята" (templates-vru2.ts:1100) is a look through the
//     WINDSCREEN; demanding the right door mirror for it would be a false
//     refusal.
//   · both sides named ⇒ no requirement. One glance cannot be two.
//
// A KIND THIS PARSER DOES NOT RECOGNISE NEVER SATISFIES A SIDED MOMENT. That
// is the honest default: if the record does not say the student looked left,
// the mapper must not say he did.
// ---------------------------------------------------------------------------

/** The side an authored moment names, or a recorded glance carries. */
type GlanceSide = "left" | "right";

/** Read the side out of a `TraceEventKind` — substring rather than equality so
 *  a future compound kind („glance-shoulder-left") is read correctly by a
 *  mapper nobody remembered to update. */
function glanceSideOfKind(kind: string): GlanceSide | null {
  if (kind.includes("left")) return "left";
  if (kind.includes("right")) return "right";
  return null;
}

/** The nouns a glance CONTROL addresses. Without one of these a side word in
 *  the title is describing the manoeuvre or the road, not where to look. */
const GLANCE_TARGET_RE = /(огледал|рамо|мъртва\s+зона)/iu;
/**
 * Bulgarian left — ляв/лява/ляво/лявото/лявата, plus наляво/вляво/отляво.
 *
 * A BARE SUBSTRING WAS WRONG AND WOULD HAVE SHIPPED. `/ляв/` also matches
 * „нама**ляв**ане", and „Огледало и рамо, преди да влезеш в лентата за
 * намаляване" (templates-merging2.ts:213) is a DECELERATION lane, not a left
 * one — it would have demanded a left-mirror glance for a merge to the right.
 * It is inert only because that template has no reverse phase, i.e. the
 * catalogue hid the bug rather than the predicate being right. So the stem is
 * anchored at a Unicode word boundary with the directional prefixes spelled
 * out, the same construction `scene/cabin.ts` uses for its lamp imperatives —
 * and for the same reason: `\b` is ASCII-only and never matches a Cyrillic
 * boundary, so it silently matches nothing and reads as a clean catalogue.
 */
const LEFT_RE = /(?:^|[^\p{L}])(?:на|в|от)?ляв(?:[оаиуе]|ия|ият|ите|ото|ата)?(?![\p{L}])/iu;
/** Bulgarian right — дясно/дясна/дясната/вдясно/надясно, and десен/десни. */
const RIGHT_RE =
  /(?:^|[^\p{L}])(?:на|в|от)?(?:дясн(?:[оаи]|ия|ият|ите|ото|ата)?|десен|десни(?:те)?)(?![\p{L}])/iu;

/** Which side a moment REQUIRES, or null when it names none (the majority —
 *  those keep the pre-existing any-glance behaviour exactly). */
function requiredSideOfMoment(titleBg: string): GlanceSide | null {
  if (!GLANCE_TARGET_RE.test(titleBg)) return null;
  const left = LEFT_RE.test(titleBg);
  const right = RIGHT_RE.test(titleBg);
  if (left === right) return null; // neither named, or both — no single side
  return left ? "left" : "right";
}

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
    .map((e) => ({ tSec: e.tSec, side: glanceSideOfKind(e.kind) }));
  /** The side each moment names, resolved once (see the block above). */
  const needSides = moments.map((m) => requiredSideOfMoment(m.titleBg));

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
  //
  // ---------------------------------------------------------------------------
  //
  // THE SIDE FILTER AND THE ORDER, TOGETHER — A SECOND, SMALLER RESIDUAL.
  //
  // The assignment order below is unchanged, and it is still name-first: the
  // pre-stop check, then the before-check, then the middles. A side
  // requirement can only ever SHRINK a moment's candidate set, so no moment
  // gains a glance it did not have and the maximality §5 brute-forces (over a
  // side-neutral fixture, which is what it sweeps) is untouched there.
  //
  // Where a sided and a neutral moment compete for the same glance the order
  // decides, exactly as it already did for the overlapping windows — and the
  // named checks, which are where the sided titles live, go first. On every
  // shipped template exactly one moment carries a side, so nothing can contest
  // it today. Left as-is rather than sorted-by-strictness for the same reason
  // the residual below is left alone: a scoring reshuffle needs its own
  // evidence, not a tie-break tweak.
  const spent = new Set<number>();
  const takeGlance = (
    fromSec: number,
    toSec: number,
    prefer: "earliest" | "latest",
    needSide: GlanceSide | null,
  ): boolean => {
    const from = prefer === "latest" ? glances.length - 1 : 0;
    const step = prefer === "latest" ? -1 : 1;
    for (let g = from; g >= 0 && g < glances.length; g += step) {
      if (spent.has(g)) continue;
      const glance = glances[g];
      if (needSide !== null && glance.side !== needSide) continue;
      if (glance.tSec >= fromSec && glance.tSec <= toSec) {
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
      needSides[lastIndex],
    );
  }
  filled[0] = takeGlance(
    reverseStart - BEFORE_WINDOW_SEC,
    reverseStart + BEGIN_GRACE_SEC,
    "earliest",
    needSides[0],
  );
  // Middle moments run backwards so a later one gets the later look — the same
  // temporal correspondence the moments are authored in.
  for (let i = (hasLastMoment ? lastIndex - 1 : lastIndex); i >= 1; i--) {
    filled[i] = takeGlance(reverseStart, reverseEnd, "latest", needSides[i]);
  }
  // Reported in AUTHORED order — the rubric renders the moment titles in the
  // order the template wrote them, and `glances` is already sorted by tSec.
  const observed = moments.filter((_, i) => filled[i]).map((m) => m.id);
  return { observedMomentIds: observed };
}
