import { describe, expect, it } from "vitest";
import {
  MIRROR_BIT,
  MIRROR_KINDS,
  doorMirrorsFollowTask,
  mirrorGlassDecision,
  mirrorGlassIsLive,
  mirrorGlassIsWatched,
  mirrorIsAttended,
  selectMirrorPass,
  type MirrorKind,
  type MirrorQuality,
} from "./mirrorAttention";

/**
 * FOUNDER RULING 2026-09-22 «Live when the task uses it» — row
 * sc-vu-pass-clearance:d770323a: on MEDIUM quality the left door mirror was a
 * blank quad «in any frame», in a lesson whose briefing says «Огледало, мигач
 * наляво…». The ruling: on medium, render the door mirror live in lessons whose
 * task relies on it; high unchanged; low unchanged.
 *
 * The student in the judge's frames never glanced (the audit bot presses only
 * Escape/W/S), so every case below is the EYES-FORWARD, NO-GLANCE state — the
 * state the frames photographed.
 */

const FRAMES = 64;

/** Door passes scheduled over FRAMES frames with the driver looking ahead. */
function doorPasses(preset: MirrorQuality, tasked: boolean): Record<MirrorKind, number> {
  const out: Record<MirrorKind, number> = { rear: 0, left: 0, right: 0 };
  for (let f = 0; f < FRAMES; f++) {
    const k = selectMirrorPass(f, preset, null, 0, "forward", 0, tasked);
    if (k) out[k]++;
  }
  return out;
}

describe("doorMirrorsFollowTask — the ruling as one predicate", () => {
  it("is true on MEDIUM exactly when the lesson declares the task", () => {
    expect(doorMirrorsFollowTask("medium", true)).toBe(true);
    expect(doorMirrorsFollowTask("medium", false)).toBe(false);
  });

  it("leaves LOW alone — the ruling names medium, and low is the budget tier", () => {
    expect(doorMirrorsFollowTask("low", true)).toBe(false);
    expect(doorMirrorsFollowTask("low", false)).toBe(false);
  });

  it("is true on HIGH too — a tier may not LOSE what a lower tier has", () => {
    // ROUND 2 CORRECTION. The round-1 comment here said high „has always
    // free-run the doors, so it needs no flag". That is true of the PASSES
    // (`selectMirrorPass` returns any due kind on high) and false of the GLASS:
    // `mirrorGlassIsLive` blanks an unattended door on every preset, high
    // included. So without this clause a tasked lesson was live on medium and
    // blank on high — a student who turned the quality UP lost the mirror his
    // lesson is about.
    expect(doorMirrorsFollowTask("high", true)).toBe(true);
    expect(doorMirrorsFollowTask("high", false)).toBe(false);
  });

  it("the tiers are MONOTONE: no state is live on a lower preset and blank on a higher one", () => {
    const PRESETS: MirrorQuality[] = ["low", "medium", "high"];
    for (const kind of MIRROR_KINDS) {
      for (const tasked of [false, true]) {
        for (const wasLive of [false, true]) {
          for (const passed of [false, true]) {
            for (const pose of ["forward", "mirrorLeft", "mirrorRight"] as const) {
              for (const glance of [null, "left", "right", "shoulder"] as const) {
                const live = PRESETS.map((preset) =>
                  mirrorGlassDecision(
                    kind,
                    wasLive,
                    passed,
                    doorMirrorsFollowTask(preset, tasked),
                    glance,
                    1,
                    pose,
                  ),
                );
                expect(
                  live[0] <= live[1] && live[1] <= live[2],
                  `${kind} tasked=${tasked} wasLive=${wasLive} passed=${passed} ${pose}/${glance}: ${live.join(",")}`,
                ).toBe(true);
              }
            }
          }
        }
      }
    }
  });
});

describe("mirrorGlassDecision — the WHOLE glass rule, in one place", () => {
  it("the rear is always live, whatever anything else says", () => {
    for (const tasked of [false, true]) {
      expect(mirrorGlassDecision("rear", false, false, tasked, null, 0, "forward")).toBe(true);
    }
  });

  it("an unattended, untasked door is blanked — the defect this rig removed", () => {
    expect(mirrorGlassDecision("left", true, true, false, null, 0, "forward")).toBe(false);
    expect(mirrorGlassDecision("right", true, true, false, null, 0, "forward")).toBe(false);
  });

  it("a TASKED door is live with the eyes forward, on medium and on high", () => {
    for (const preset of ["medium", "high"] as const) {
      const follows = doorMirrorsFollowTask(preset, true);
      // …from the first pass that ran, and it stays live between passes.
      expect(mirrorGlassDecision("left", false, true, follows, null, 0, "forward")).toBe(true);
      expect(mirrorGlassDecision("left", true, false, follows, null, 0, "forward")).toBe(true);
      // …and never before one: an unpassed, never-live glass shows nothing.
      expect(mirrorGlassDecision("left", false, false, follows, null, 0, "forward")).toBe(false);
    }
  });

  it("composes the two rules it is made of, at every input", () => {
    for (const kind of MIRROR_KINDS) {
      for (const follows of [false, true]) {
        for (const wasLive of [false, true]) {
          for (const passed of [false, true]) {
            for (const pose of ["forward", "mirrorLeft", "mirrorRight"] as const) {
              for (const glance of [null, "left", "right", "shoulder"] as const) {
                expect(
                  mirrorGlassDecision(kind, wasLive, passed, follows, glance, 1, pose),
                ).toBe(
                  mirrorGlassIsLive(
                    kind,
                    wasLive,
                    mirrorGlassIsWatched(kind, follows, glance, 1, pose),
                    passed,
                  ),
                );
              }
            }
          }
        }
      }
    }
  });
});

describe("selectMirrorPass on MEDIUM — the door mirror stays live in a tasked lesson", () => {
  it("schedules both doors on their own phases with no glance at all", () => {
    const tasked = doorPasses("medium", true);
    // Every 4th frame each (phases 1 and 3) — the medium cadence, not a new one.
    expect(tasked.left).toBe(FRAMES / 4);
    expect(tasked.right).toBe(FRAMES / 4);
    // The rear is untouched: every even frame.
    expect(tasked.rear).toBe(FRAMES / 2);
  });

  it("…and schedules NO door pass in an untasked lesson (the attention gate stands)", () => {
    const plain = doorPasses("medium", false);
    expect(plain.left).toBe(0);
    expect(plain.right).toBe(0);
    expect(plain.rear).toBe(FRAMES / 2);
  });

  it("defaults to untasked, so every caller that predates the ruling is unchanged", () => {
    for (let f = 0; f < FRAMES; f++) {
      expect(selectMirrorPass(f, "medium", null, 0, "forward", 0)).toBe(
        selectMirrorPass(f, "medium", null, 0, "forward", 0, false),
      );
    }
  });

  it("keeps the one-pass-per-frame invariant: the doors land only on odd frames", () => {
    for (let f = 0; f < FRAMES; f++) {
      const k = selectMirrorPass(f, "medium", null, 0, "forward", 0, true);
      if (k === "left" || k === "right") expect(f % 2).toBe(1);
      if (k === "rear") expect(f % 2).toBe(0);
    }
  });
});

describe("HIGH and LOW schedule the same PASSES with and without the flag", () => {
  // The flag changes the GLASS on high (see the monotonicity case above); what
  // it cannot change there is the pass schedule, because high already returns
  // every due kind. Low is untouched on both counts.
  for (const preset of ["high", "low"] as const) {
    it(`${preset}: the flag changes no frame's answer`, () => {
      for (let f = 0; f < FRAMES; f++) {
        for (const unprimed of [0, MIRROR_BIT.rear]) {
          expect(selectMirrorPass(f, preset, null, 0, "forward", unprimed, true)).toBe(
            selectMirrorPass(f, preset, null, 0, "forward", unprimed, false),
          );
        }
      }
    });
  }

  it("low still renders a door only while it is looked through", () => {
    const low = doorPasses("low", true);
    expect(low.left).toBe(0);
    expect(low.right).toBe(0);
  });
});

describe("mirrorGlassIsWatched — the glass is allowed to show what the passes keep current", () => {
  it("a tasked door counts as watched with the eyes forward, so it is never blanked", () => {
    expect(mirrorGlassIsWatched("left", true, null, 0, "forward")).toBe(true);
    expect(mirrorGlassIsWatched("right", true, null, 0, "forward")).toBe(true);
  });

  it("an untasked door answers exactly what the attention rule answers", () => {
    for (const kind of MIRROR_KINDS) {
      for (const pose of ["forward", "mirrorLeft", "mirrorRight"] as const) {
        for (const glance of [null, "left", "right", "shoulder"] as const) {
          expect(mirrorGlassIsWatched(kind, false, glance, 1, pose)).toBe(
            mirrorIsAttended(kind, glance, 1, pose),
          );
        }
      }
    }
  });
});
