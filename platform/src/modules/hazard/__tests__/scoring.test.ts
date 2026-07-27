import { describe, expect, it } from "vitest";
import {
  HAZARD_BANDS,
  bandEdges,
  bandFor,
  detectSpam,
  pointsForBand,
  sanitizePresses,
  scoreHazardItem,
} from "../scoring";
import { HAZARD_MAX_POINTS_PER_ITEM, type HazardWindow } from "../types";
import { WINDOW } from "./fixtures";

/**
 * WINDOW is [4, 8] → five 0.8 s bands:
 *   [4.0, 4.8) 5 pts · [4.8, 5.6) 4 · [5.6, 6.4) 3 · [6.4, 7.2) 2 · [7.2, 8.0] 1
 */
const score = (presses: number[], window: HazardWindow = WINDOW) =>
  scoreHazardItem("hz-x", window, presses);

describe("bandEdges", () => {
  it("returns six edges spanning the window", () => {
    expect(bandEdges(WINDOW)).toEqual([4, 4.8, 5.6, 6.4, 7.2, 8]);
  });

  it("pins the last edge to closeSec exactly (no float drift past the cut)", () => {
    const w = { openSec: 0.1, closeSec: 3.7 };
    const edges = bandEdges(w);
    expect(edges).toHaveLength(HAZARD_BANDS + 1);
    expect(edges[HAZARD_BANDS]).toBe(3.7);
    expect(edges[0]).toBe(0.1);
  });
});

describe("bandFor", () => {
  it.each([
    [4, 0],
    [4.79, 0],
    [4.8, 1],
    [5.6, 2],
    [6.4, 3],
    [7.2, 4],
    [7.99, 4],
    [8, 4], // the cut itself still scores — the last band is closed at both ends
  ])("puts %ss in band %s", (t, band) => {
    expect(bandFor(WINDOW, t)).toBe(band);
  });

  it("refuses presses outside the window", () => {
    expect(bandFor(WINDOW, 3.999)).toBeNull();
    expect(bandFor(WINDOW, 8.001)).toBeNull();
    expect(bandFor(WINDOW, Number.NaN)).toBeNull();
  });

  it("refuses a degenerate window instead of dividing by zero", () => {
    expect(bandFor({ openSec: 5, closeSec: 5 }, 5)).toBeNull();
  });

  /**
   * The fairness property: what the reveal timeline DRAWS and what the scorer
   * PAYS must be the same band, on awkward window geometry too. Floating-point
   * edges are exactly where a "provably fair" claim would otherwise quietly
   * stop being true.
   */
  it.each([
    [4, 8],
    [3.07, 7.07],
    [0.1, 3.7],
    [2.333, 9.777],
    [1, 2.5],
  ])("agrees with bandEdges on every edge of [%s, %s]", (openSec, closeSec) => {
    const window = { openSec, closeSec };
    const edges = bandEdges(window);
    for (let i = 0; i < HAZARD_BANDS; i++) {
      expect(bandFor(window, edges[i])).toBe(i);
      if (i > 0) {
        // A hair earlier belongs to the previous (better-paying) band.
        expect(bandFor(window, edges[i] - 1e-9)).toBe(i - 1);
      }
    }
    expect(bandFor(window, closeSec)).toBe(HAZARD_BANDS - 1);
  });
});

describe("pointsForBand", () => {
  it("pays the maximum for the earliest band and 1 for the last", () => {
    expect(pointsForBand(0)).toBe(HAZARD_MAX_POINTS_PER_ITEM);
    expect(pointsForBand(HAZARD_BANDS - 1)).toBe(1);
  });
});

describe("scoreHazardItem — earlier is better, inside the window", () => {
  it.each([
    [4, 5],
    [4.9, 4],
    [6, 3],
    [7, 2],
    [7.9, 1],
    [8, 1],
  ])("a press at %ss scores %s", (t, points) => {
    const r = score([t]);
    expect(r.outcome).toBe("scored");
    expect(r.points).toBe(points);
    expect(r.scoredAtSec).toBe(t);
    expect(r.maxPoints).toBe(HAZARD_MAX_POINTS_PER_ITEM);
  });

  it("takes the EARLIEST in-window press when there are several", () => {
    const r = score([7.5, 5, 6.2]);
    expect(r.points).toBe(4);
    expect(r.scoredAtSec).toBe(5);
  });

  it("does not care what order the client sent them in", () => {
    expect(score([7.5, 5, 6.2])).toEqual(score([6.2, 7.5, 5]));
  });
});

describe("scoreHazardItem — pressing before the hazard exists never scores", () => {
  it("reports 'early' when every press predates the window", () => {
    const r = score([1.2, 3.9]);
    expect(r.outcome).toBe("early");
    expect(r.points).toBe(0);
    expect(r.band).toBeNull();
    expect(r.earlyPresses).toBe(2);
    expect(r.scoredAtSec).toBeNull();
  });

  it("gives no credit for the early guess when a later press lands in the window", () => {
    const r = score([2, 6.5]);
    expect(r.points).toBe(2); // band 3 — graded on 6.5, not on the 2 s guess
    expect(r.scoredAtSec).toBe(6.5);
    expect(r.earlyPresses).toBe(1);
  });
});

describe("scoreHazardItem — silence and late presses", () => {
  it("reports 'missed' when nothing was pressed", () => {
    const r = score([]);
    expect(r).toMatchObject({
      outcome: "missed",
      points: 0,
      band: null,
      scoredAtSec: null,
      earlyPresses: 0,
      latePresses: 0,
      spamReason: null,
    });
  });

  it("counts a press inside the late slack as evidence but never scores it", () => {
    const r = score([8.3]);
    expect(r.outcome).toBe("missed");
    expect(r.latePresses).toBe(1);
    expect(r.points).toBe(0);
  });

  it("drops a timestamp that could not have come from the clip at all", () => {
    const r = score([12]);
    expect(r.latePresses).toBe(0);
    expect(r.outcome).toBe("missed");
  });
});

describe("sanitizePresses", () => {
  it("drops values a hostile client made up, and sorts what is left", () => {
    expect(sanitizePresses([Number.NaN, -1, 1e9, 6, Number.POSITIVE_INFINITY, 5], WINDOW)).toEqual([
      5, 6,
    ]);
  });

  it("collapses a double-fire into one press", () => {
    expect(sanitizePresses([5, 5.05], WINDOW)).toEqual([5]);
  });

  it("keeps two presses a human could really have made", () => {
    expect(sanitizePresses([5, 5.2], WINDOW)).toEqual([5, 5.2]);
  });
});

describe("detectSpam — flood", () => {
  it("voids a clip covered in presses", () => {
    const presses = [0.5, 1.5, 2.5, 3.5, 4.2, 5.5, 6.5, 7.5];
    expect(detectSpam(presses, WINDOW)).toBe("flood");
  });

  it("scores zero even though one of those presses was in the best band", () => {
    const r = score([0.5, 1.5, 2.5, 3.5, 4.2, 5.5, 6.5, 7.5]);
    expect(r.outcome).toBe("spam");
    expect(r.spamReason).toBe("flood");
    expect(r.points).toBe(0);
    expect(r.band).toBeNull();
    // The evidence is still reported — a voided clip is explained, not just zeroed.
    expect(r.earlyPresses).toBe(4);
  });

  it("tolerates a nervous student pressing at several different things", () => {
    expect(detectSpam([2, 3.4, 5, 6.1], WINDOW)).toBeNull();
  });

  it("does not accuse a bouncy trackpad: debounce runs BEFORE the count", () => {
    const bouncy = [2, 2.03, 3.4, 3.43, 5, 5.02, 6.1, 6.12, 7, 7.04, 7.6, 7.63];
    const r = score(bouncy);
    expect(r.outcome).toBe("scored"); // 12 raw events, 6 real presses
    expect(r.spamReason).toBeNull();
  });

  it("scales the allowance with the length of the clip", () => {
    const long: HazardWindow = { openSec: 8, closeSec: 20 };
    const eight = [1, 2, 3, 4.5, 6, 9, 12, 15];
    expect(detectSpam(eight, WINDOW)).toBe("flood"); // 8 presses in an 8 s clip
    expect(detectSpam(eight, long)).toBeNull(); // the same 8 in a 20 s clip
  });
});

describe("detectSpam — metronome", () => {
  it("voids five evenly spaced presses", () => {
    const metronome = [0.5, 1.7, 2.9, 4.1, 5.3];
    expect(detectSpam(metronome, WINDOW)).toBe("rhythm");
    const r = score(metronome);
    expect(r.outcome).toBe("spam");
    expect(r.points).toBe(0); // 4.1 and 5.3 were in-window and still earn nothing
  });

  it("does not fire on a drifting sequence that merely looks regular", () => {
    const drifting = [0.5, 0.9, 1.5, 2.3, 3.3]; // gaps 0.4 0.6 0.8 1.0
    expect(detectSpam(drifting, WINDOW)).toBeNull();
    expect(score(drifting).outcome).toBe("early");
  });

  it("needs a real run — four presses are not a pattern", () => {
    expect(detectSpam([1, 2, 3, 4], WINDOW)).toBeNull();
  });
});

describe("scoreHazardItem — degenerate window", () => {
  it("never invents a band (the bank loader rejects these; the maths stays safe)", () => {
    const r = score([5], { openSec: 5, closeSec: 5 });
    expect(r.band).toBeNull();
    expect(r.points).toBe(0);
    expect(r.scoredAtSec).toBeNull();
  });
});
