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
 * require n distinct glances. The assignment runs LAST MOMENT FIRST, each taking
 * the LATEST unspent glance in its window — because WHICH moment gets a
 * contested glance is what the debrief prints. Assigning forward instead gives
 * the same count and the wrong name: it ticks „Оглед по време на движението
 * назад" and refuses „Последна проверка преди спиране" to a student who made
 * exactly the final check.
 *
 * BOTH DIRECTIONS ARE PROVED BELOW, and the second one matters as much as the
 * first: a student who really does look three times must still score 3/3. A
 * refusal that cannot be lifted by doing the thing right is the founder's own
 * complaint, and §3 is there so tightening this channel can never become that.
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
