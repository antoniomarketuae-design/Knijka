/**
 * CENSUS — the ring-exit hand-over across the roundabout family
 * (sc-rb-lane-choice:ffdffd55, clause 1b; rig-w2, 2026-10-08).
 *
 * The row was filed against one lesson. The cause — a ring edge keeping the
 * tick's fix past the ring's own kerb, where its lane offset is a clamped
 * constant and its lane lines count as painted (`runtime/locator.ts`,
 * RING_RELEASE_OUTSIDE_M) — is every ring's. So every authored demo of every
 * roundabout lesson is driven here, with each rung's own cast, through the live
 * chain (./rbFamilyCensus.ts), and the exit of each is read off the tick.
 *
 * MEASURED AT 43b4109, BEFORE THE CHANGE (all rungs alike; m beyond the ring's
 * kerb at the hand-over · s of ring-edge reading past the straddle band · the
 * exit pace):
 *
 *   sc-roundabout-entry        shadow 4.69 m · 1.90 s · 12.0   no-signal 4.04 · 1.28 · 13.8
 *   sc-rb-exit-signal          shadow 4.68 m · 2.17 s · 10.5   no-signal 4.04 · 1.28 · 13.8
 *   sc-rb-circulate-priority   shadow 4.14 m · 1.88 s · 12.0   wandering 4.14 · 2.23 · 10.1
 *   sc-rb-busy-gap             shadow 4.13 m · 2.38 s ·  9.5
 *   sc-rb-lane-choice          shadow 8.08 m · 2.87 s · 12.2   outer-lane 8.10 · 2.87 · 12.2
 *   sc-rb-ped-exit             shadow 4.11 m · 1.88 s · 10.7   through-ped 4.13 · 1.88 · 12.0
 *
 * Every one of them under laneKeepSustainSec (3 s) — which is why no committed
 * demo ever showed it — and every one of them a function of the exit pace: the
 * lane-choice shadow had 0.13 s in hand, and busy-gap's would have been billed
 * at 7.5 км/ч. AFTER: 0.35–0.39 m and 0.30–0.75 s on all of them, and the 87
 * graded rows (grader ledger, teach cards, lesson mistakes, verdict, score,
 * tasks) are identical before and after — no demo's outcome moved.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import { censusKey, driveOnLiveChain, ROUNDABOUT_FAMILY, rungsOf, type DriveReading } from "./rbFamilyCensus";

const SUSTAIN_SEC = DEFAULT_RULE_CONFIG.laneKeepSustainSec;
/** The locator's release margin (its lane deadband, 0.35 m) plus one 60 Hz
 *  frame of travel at the fastest exit in the family (13.8 км/ч = 6.4 cm). */
const RELEASE_BOUND_M = 0.35 + 0.1;

const rows = new Map<string, DriveReading>();
for (const d of ROUNDABOUT_FAMILY) {
  for (const level of rungsOf(d.spec)) {
    rows.set(censusKey(d, level), driveOnLiveChain(d.spec, level, d.kind, d.script()));
  }
}

describe("census — every demo of every roundabout lesson, at every rung it authors", () => {
  it("covers the family: 6 lessons, 18 demos, 87 drives, 61 of which leave a ring", () => {
    expect(new Set(ROUNDABOUT_FAMILY.map((d) => d.spec.id)).size).toBe(6);
    expect(ROUNDABOUT_FAMILY.length).toBe(18);
    expect(rows.size).toBe(87);
    expect([...rows.values()].filter((r) => r.handovers.length > 0).length).toBe(61);
  });

  it("every exit: the tick leaves the ring edge at the ring's kerb (base: 4.04–8.10 m beyond it)", () => {
    for (const [key, r] of rows) {
      for (const h of r.handovers) {
        expect(h.outsideRingM, `${key} ${h.from}→${h.to}`).toBeLessThanOrEqual(RELEASE_BOUND_M);
      }
    }
  });

  it("every exit: under a second of ring-edge reading past the band behind it — a third of the sustain, where the lane-choice shadow had 2.87 s of 3", () => {
    let worst = 0;
    for (const [key, r] of rows) {
      for (const h of r.handovers) {
        expect(h.offBandSec, `${key} ${h.from}→${h.to}`).toBeLessThan(SUSTAIN_SEC / 3);
        worst = Math.max(worst, h.offBandSec);
      }
    }
    expect(worst).toBeGreaterThan(0); // the reading is live, not vacuous
  });

  it("«Неустойчиво движение в лентата» is named in exactly the two demos that ARE about the line, at every rung, and in no other", () => {
    const aboutTheLine = new Set(["sc-rb-circulate-priority/mistake-wandering-line", "sc-rb-lane-choice/mistake-outer-lane-far-exit"]);
    const named: string[] = [];
    for (const [key, r] of rows) {
      const codes = [...r.graded.recorder, ...r.graded.violations, ...r.graded.teach, ...r.graded.lessonMistakes.map((m) => m[0])];
      const demo = key.split("/").slice(0, 2).join("/");
      expect(codes.includes("POOR_LANE_KEEPING"), key).toBe(aboutTheLine.has(demo));
      if (codes.includes("POOR_LANE_KEEPING")) named.push(key);
    }
    expect(named.length).toBe(4 + 5); // circulate-priority authors four rungs
  });

  it("the two demos about the line are billed for a line they really rode: seconds of it, on the ring, before any exit", () => {
    for (const [key, r] of rows) {
      if (key.includes("mistake-wandering-line")) expect(r.longestRingOffBandSec, key).toBeGreaterThan(SUSTAIN_SEC + 1.5);
      if (key.includes("mistake-outer-lane-far-exit")) expect(r.longestRingOffBandSec, key).toBeGreaterThan(15);
    }
  });

  it("no correct demo draws a teach card or a named lesson mistake, and none reads the ring past the band for even half the sustain anywhere", () => {
    for (const [key, r] of rows) {
      if (!key.includes("/shadow-correct/")) continue;
      expect(r.longestRingOffBandSec, key).toBeLessThan(SUSTAIN_SEC / 2);
      expect(r.graded.teach, key).toEqual([]);
      expect(r.graded.lessonMistakes, key).toEqual([]);
    }
  });
});
