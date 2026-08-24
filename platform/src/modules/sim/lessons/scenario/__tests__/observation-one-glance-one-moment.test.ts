/**
 * THE OBSERVATION CHANNEL CREDITED TWO MOMENTS FOR ONE GLANCE.
 *
 * `parkingObservationFromTrace` maps a recorded drive's glance events onto a
 * template's authored observation moments, and the rubric turns the result into
 * the debrief's «наблюдение» stars — a surface the student reads as „I looked
 * where I was supposed to look".
 *
 * THE DEFECT, and why it is the same crime as a green tick for an unmeasured
 * skill. The authored windows OVERLAP by construction:
 *
 *   moment[0]        [reverseStart − 10, reverseStart + 0.75]
 *   middle moments   [reverseStart, reverseEnd]
 *   last moment      [reverseEnd − 5, ∞)
 *
 * so the final five seconds of the reverse phase sit inside BOTH the middle
 * window and the last one. The mapper tested every moment against the whole
 * glance list independently, so a single look one second before the car stopped
 * satisfied the middle moment AND the pre-stop check.
 *
 * It is reachable everywhere the channel ships. Eleven parking templates author
 * three moments each, and on two of them the middle moment names a DIFFERENT
 * thing to look at than the last — sc-park-van's `obs-van-side` (the blind side
 * of the van beside you) and sc-park-double's `obs-opposite-row`. A student who
 * checks his mirror once at the end of the manoeuvre was told he had also
 * checked the van.
 *
 * THE FIX is to consume glances: no glance may be counted twice, so n moments
 * require n distinct glances. And WHICH moment gets a contested glance is what
 * the debrief prints, so the assignment runs in a FIXED ORDER rather than
 * per-moment — the pre-stop check claims the final window before the middle
 * moment can. Let the middle moment have it and the debrief ticks „Оглед по
 * време на движението назад" and refuses „Последна проверка преди спиране" to a
 * student who made exactly the final check.
 *
 * BOTH DIRECTIONS ARE PROVED BELOW, and the second one matters as much as the
 * first: a student who really does look three times must still score 3/3. A
 * refusal that cannot be lifted by doing the thing right is the founder's own
 * complaint, and §3 is there so tightening this channel can never become that.
 *
 * ==========================================================================
 * §4 AND §5 — THE SAME DEFECT AT THE MIDDLE WINDOW'S OTHER EDGE, 2026-08-24.
 * ==========================================================================
 *
 * The during-reverse window swallows BOTH of its neighbours' overlaps. §1 took
 * back the top one — the final five seconds — and left the bottom one: the
 * `BEGIN_GRACE_SEC` tail, the three quarters of a second in which the head
 * follows the hand into reverse. A lone glance there was still taken by the
 * middle moment.
 *
 * MEASURED on the shipped mapper, reverse over [10, 20]:
 *
 *   glances [10.5] → ["obs-during-reverse"]   ← INSIDE the grace window
 *   glances [10.8] → ["obs-during-reverse"]   ← outside it
 *
 * The student read the same debrief either side of a line the code draws, which
 * is what an unguarded constant looks like from the surface it is supposed to
 * move: `BEGIN_GRACE_SEC = 0` left 2 296 tests in 107 files GREEN.
 *
 * WHY IT OUTWEIGHS THE COUNT, which does not change. The learner selects R and
 * looks — hand first, head a beat later. The debrief told him „Оглед по време на
 * движението назад ✓" and refused „Оглед ПРЕДИ включване на задна". Both are
 * false, and the ✓ is the half that gets a seventeen-year-old hurt: it certifies
 * that he kept watching while the car was travelling backwards, which is the one
 * thing he did not do.
 *
 * §4 pins every window edge in both directions. §5 answers the question §4
 * raises — every naming rule risks costing a credit somewhere else — by brute-
 * forcing the maximum matching over a 696-input sweep, so this mapper can never
 * buy a better name with a lost star. Its first row is the negative control for
 * the reference itself.
 */

import { describe, expect, it } from "vitest";
import { parkingObservationFromTrace } from "../observation";
import type { RubricSpec } from "../types";

type Moments = NonNullable<RubricSpec["observation"]>["moments"];

/** The three moments every parking drill in the catalogue authors. */
const THREE: Moments = [
  { id: "obs-before-reverse", titleBg: "Оглед ПРЕДИ включване на задна" },
  { id: "obs-during-reverse", titleBg: "Оглед по време на движението назад" },
  { id: "obs-final-check", titleBg: "Последна проверка преди спиране" },
];

/**
 * A minimal trace with a reverse phase over [10, 20] s and glances at the given
 * times. Only the two fields the mapper reads are populated — `gear` on the
 * samples and `kind`/`tSec` on the events — so nothing here can pass by
 * accident through some other channel.
 */
function trace(glanceTimes: number[]): Parameters<typeof parkingObservationFromTrace>[0] {
  const samples: Parameters<typeof parkingObservationFromTrace>[0]["samples"] = [];
  for (let t = 0; t <= 30; t += 0.5) {
    samples.push({ tSec: t, gear: t >= 10 && t <= 20 ? -1 : 1 } as never);
  }
  return {
    samples,
    events: glanceTimes.map((tSec) => ({ tSec, kind: "glance-mirror" }) as never),
  };
}

const observed = (glanceTimes: number[], moments: Moments = THREE): readonly string[] =>
  parkingObservationFromTrace(trace(glanceTimes), moments)?.observedMomentIds ?? [];

// ---------------------------------------------------------------------------
// §1 — the defect, re-measured on the shipped window model
// ---------------------------------------------------------------------------

describe("§1 one glance credits one moment", () => {
  it("a single look 1 s before the stop credits the FINAL check and nothing else", () => {
    // t = 19 is inside [reverseEnd − 5, ∞) = [15, ∞) AND inside
    // [reverseStart, reverseEnd] = [10, 20]. Before the fix this returned BOTH
    // `obs-during-reverse` and `obs-final-check` — «наблюдение 2/3» for one look.
    expect(observed([19])).toEqual(["obs-final-check"]);
  });

  it("a single look mid-reverse credits the DURING moment and nothing else", () => {
    // t = 12 is outside the final window, so only the middle moment can take it.
    expect(observed([12])).toEqual(["obs-during-reverse"]);
  });

  it("a single look before reversing credits only the BEFORE moment", () => {
    expect(observed([4])).toEqual(["obs-before-reverse"]);
  });

  it("two looks can never be three moments", () => {
    // The invariant in one line, and the one a positional mapper cannot hold:
    // the credited set is never larger than the number of glances.
    for (const times of [[4], [12], [19], [4, 12], [4, 19], [12, 19], [4, 12, 19]]) {
      expect(observed(times).length, JSON.stringify(times)).toBeLessThanOrEqual(times.length);
    }
  });
});

// ---------------------------------------------------------------------------
// §2 — THE MUTATION: the old mapper, restored here, fails §1
//
// The rule this project pays for: a test that passes equally before and after
// guards nothing. `positionalObserved` is the shipped loop put back verbatim
// (`glances.some(...)` per moment, no consumption). If the two ever agree on
// the case below, the fix has been undone and this dies.
// ---------------------------------------------------------------------------

describe("§2 the previous mapper is shown to over-credit the same input", () => {
  function positionalObserved(glanceTimes: number[], moments: Moments): readonly string[] {
    const glances = glanceTimes;
    const reverseStart = 10;
    const reverseEnd = 20;
    const covered = (from: number, to: number) => glances.some((t) => t >= from && t <= to);
    const out: string[] = [];
    for (let i = 0; i < moments.length; i++) {
      const isFirst = i === 0;
      const isLast = i === moments.length - 1 && moments.length >= 2;
      const ok = isFirst
        ? covered(reverseStart - 10, reverseStart + 0.75)
        : isLast
          ? covered(reverseEnd - 5, Number.POSITIVE_INFINITY)
          : covered(reverseStart, reverseEnd);
      if (ok) out.push(moments[i].id);
    }
    return out;
  }

  it("the old loop returns 2 moments for the one glance at t = 19; the new one returns 1", () => {
    expect(positionalObserved([19], THREE)).toEqual(["obs-during-reverse", "obs-final-check"]);
    expect(observed([19])).toEqual(["obs-final-check"]);
  });

  it("…and the two agree wherever the windows do NOT overlap", () => {
    // The fix is narrow on purpose: it changes the overlap and nothing else, so
    // every input that was already honest is bit-identical.
    for (const times of [[4], [12], [4, 12], [4, 12, 19], [2, 11, 18]]) {
      expect(observed(times), JSON.stringify(times)).toEqual(positionalObserved(times, THREE));
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — THE OTHER DIRECTION: doing it right still scores full marks
// ---------------------------------------------------------------------------

describe("§3 a student who really looks three times still scores 3/3", () => {
  it("before, during and at the end → every moment credited", () => {
    expect(observed([5, 13, 19])).toEqual([
      "obs-before-reverse",
      "obs-during-reverse",
      "obs-final-check",
    ]);
  });

  it("…and an extra glance never costs him one", () => {
    // A diligent student with MORE looks than moments must never end up with
    // fewer credits than one with exactly three.
    expect(observed([5, 11, 13, 16, 19])).toHaveLength(3);
    expect(observed([2, 5, 12, 14, 17, 19, 22])).toHaveLength(3);
  });

  it("the honest-UNMEASURED contract is untouched: no reverse phase ⇒ null", () => {
    // doc 76 §6 — `scoreRubric` renders „не се измерва", never a silent 0.
    const noReverse = {
      samples: [{ tSec: 0, gear: 1 }, { tSec: 1, gear: 1 }] as never[],
      events: [{ tSec: 0.5, kind: "glance-mirror" }] as never[],
    };
    expect(parkingObservationFromTrace(noReverse, THREE)).toBeNull();
  });

  it("a two-moment template (sc-park-parallel-exit) still needs two distinct glances", () => {
    const two: Moments = [
      { id: "obs-before-reverse", titleBg: "Оглед преди задната" },
      { id: "obs-before-moveoff", titleBg: "Оглед преди потегляне" },
    ];
    expect(observed([19], two)).toEqual(["obs-before-moveoff"]);
    expect(observed([5, 19], two)).toEqual(["obs-before-reverse", "obs-before-moveoff"]);
  });
});

// ---------------------------------------------------------------------------
// §4 — EVERY WINDOW EDGE, IN BOTH DIRECTIONS
//
// Guarding one constant is worth nothing while its neighbours are free, so each
// row below is a PAIR: the last value the window still credits and the first one
// it refuses. Shrinking OR growing any of the three numbers turns this red.
// ---------------------------------------------------------------------------

describe("§4 the grace window belongs to the BEFORE-check", () => {
  it("a lone look half a second after R engages is the BEFORE-check, not a during-look", () => {
    // reverseStart = 10, so [10, 10.75] is the grace tail — and it sits inside
    // the middle moment's [10, 20] as well. This shipped as
    // ["obs-during-reverse"]. MUTATION: `BEGIN_GRACE_SEC = 0` puts 10.5 outside
    // the before-window and the middle moment takes it straight back.
    expect(observed([10.5])).toEqual(["obs-before-reverse"]);
  });

  it("…and the grace has an EDGE: a look past it is honestly a during-look", () => {
    // The fix must not become „the before-check takes anything near the start".
    // 10.75 is the last instant it may claim; 10.8 belongs to the middle moment.
    expect(observed([10.75])).toEqual(["obs-before-reverse"]);
    expect(observed([10.8])).toEqual(["obs-during-reverse"]);
  });

  it("the late before-check still combines with the other two", () => {
    expect(observed([10.5, 14, 19])).toEqual([
      "obs-before-reverse",
      "obs-during-reverse",
      "obs-final-check",
    ]);
    // …and on its own alongside a pre-stop check it names BOTH correctly. This
    // shipped as ["obs-during-reverse", "obs-final-check"].
    expect(observed([10.5, 19])).toEqual(["obs-before-reverse", "obs-final-check"]);
  });

  it("BEFORE_WINDOW_SEC and FINAL_WINDOW_SEC keep their own edges too", () => {
    expect(observed([0])).toEqual(["obs-before-reverse"]); // exactly 10 s before
    expect(observed([-0.5])).toEqual([]); // 10.5 s before — too long ago to count
    expect(observed([15])).toEqual(["obs-final-check"]); // exactly reverseEnd − 5
    expect(observed([14.5])).toEqual(["obs-during-reverse"]); // 5.5 s before the stop
  });
});

// ---------------------------------------------------------------------------
// §5 — THE NAMING IS NEVER PAID FOR IN STARS
//
// §1 and §4 both decide WHICH moment gets a contested glance, and every such
// rule is one wrong step from costing a credit: hand a glance to the moment
// whose NAME fits and the moment that could have used it may find nothing left.
// This programme's standing rule is to ask what a fix TAKES AWAY, so this
// section answers it by brute force rather than by argument — on every input the
// number of moments credited must equal the true maximum matching between
// glances and windows.
//
// The reference is deliberately dumb: try every assignment of glances to moments
// and keep the biggest legal one. It shares no code, no ordering and no
// preference with the mapper, so it cannot share a bug with it either.
// ---------------------------------------------------------------------------

describe("§5 the credited COUNT is always the maximum a matcher could achieve", () => {
  /** The authored window for moment `i`, on the fixture's reverse phase [10, 20]. */
  function windowFor(i: number, n: number): [number, number] {
    if (i === 0) return [0, 10.75];
    if (i === n - 1 && n >= 2) return [15, Number.POSITIVE_INFINITY];
    return [10, 20];
  }

  /** Maximum bipartite matching, by exhaustive search over glance→moment maps. */
  function maxMatching(glanceTimes: number[], n: number): number {
    let best = 0;
    const used = new Array<boolean>(n).fill(false);
    const walk = (g: number, taken: number): void => {
      if (taken + (glanceTimes.length - g) <= best) return; // cannot beat `best`
      if (g === glanceTimes.length) {
        best = Math.max(best, taken);
        return;
      }
      walk(g + 1, taken); // this glance credits nothing
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        const [from, to] = windowFor(i, n);
        if (glanceTimes[g] < from || glanceTimes[g] > to) continue;
        used[i] = true;
        walk(g + 1, taken + 1);
        used[i] = false;
      }
    };
    walk(0, 0);
    return best;
  }

  it("the reference disagrees with a mapper that hands the grace tail away", () => {
    // The negative control for the reference itself. [5, 10.5] admits a matching
    // of size 2 (5 → before, 10.5 → during). A before-check taking its LATEST
    // glance instead of its earliest would eat 10.5, leave 5 outside every other
    // window, and score 1 — the trap the "earliest" preference exists to avoid.
    expect(maxMatching([5, 10.5], 3)).toBe(2);
    expect(observed([5, 10.5])).toEqual(["obs-before-reverse", "obs-during-reverse"]);
  });

  it("agrees with the reference on every input in a 3-moment sweep", () => {
    const grid = [-1, 0, 2, 5, 9.9, 10, 10.5, 10.75, 10.8, 12, 15, 17, 19, 20, 21, 26];
    let checked = 0;
    for (let a = 0; a < grid.length; a++) {
      expect(observed([grid[a]]).length, `[${grid[a]}]`).toBe(maxMatching([grid[a]], 3));
      checked++;
      for (let b = a + 1; b < grid.length; b++) {
        const pair = [grid[a], grid[b]];
        expect(observed(pair).length, JSON.stringify(pair)).toBe(maxMatching(pair, 3));
        checked++;
        for (let c = b + 1; c < grid.length; c++) {
          const trio = [grid[a], grid[b], grid[c]];
          expect(observed(trio).length, JSON.stringify(trio)).toBe(maxMatching(trio, 3));
          checked++;
        }
      }
    }
    // The sweep is real: every 1-, 2- and 3-glance drive over 16 times = 696.
    expect(checked).toBe(696);
  });

  it("…and on the two-moment templates as well", () => {
    const two: Moments = [
      { id: "obs-before-reverse", titleBg: "Оглед преди задната" },
      { id: "obs-before-moveoff", titleBg: "Оглед преди потегляне" },
    ];
    const grid = [-1, 0, 5, 10, 10.5, 10.8, 14, 15, 19, 22];
    for (let a = 0; a < grid.length; a++) {
      for (let b = a; b < grid.length; b++) {
        const pair = a === b ? [grid[a]] : [grid[a], grid[b]];
        expect(observed(pair, two).length, JSON.stringify(pair)).toBe(maxMatching(pair, 2));
      }
    }
  });
});
