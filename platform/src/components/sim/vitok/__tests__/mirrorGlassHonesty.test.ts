/**
 * A DOOR MIRROR MAY ONLY SHOW WHAT IT IS SEEING NOW — sweep 161.
 *
 * THE FRAME: `sc-vu-pass-clearance` — „the left wing mirror is a solid
 * matte-black lump with a single flat grey-blue quad standing in for glass —
 * it reflects nothing at all, in any frame", filed against a briefing whose
 * step 3 is «Огледало, мигач наляво и се отмести осезаемо наляво».
 *
 * TWO THINGS ARE TRUE AND ONLY ONE OF THEM IS A CODE DEFECT, so both are
 * pinned here rather than one being quietly dropped:
 *
 *  1. THE JUDGE COULD NOT HAVE SEEN A LIVE DOOR MIRROR. `tools/mobile/
 *     lesson-audit.mjs` emits exactly three keys across the whole catalogue —
 *     Escape, KeyW, KeyS — and never presses Л/З/Д or a mirror hotspot. Every
 *     door-mirror frame in the corpus is therefore the UNATTENDED state. The
 *     literal claim „reflects nothing, in any frame" is an artefact of an
 *     instrument that never looked.
 *  2. THE UNATTENDED STATE WAS A LIE, and that is the defect. The glass wore
 *     the live render-target material from mount, so what it actually held was
 *     the PRIMING pass — a crisp reflection of the spawn moment, frozen for
 *     the rest of the lesson, while ~47 % of the left mirror's width is on
 *     screen at the driving pose (cabinLook). A mirror that reports a clear
 *     lane from thirty seconds ago is worse for a learner than glass that is
 *     visibly not being looked through — and this lesson grades a lane change.
 *
 * The rule under test is `mirrorGlassIsLive`, which the frame loop calls at
 * both points it decides: the un-attend sweep and the post-pass promotion.
 *
 * MUTATION CHECK RUN BEFORE THIS WAS COMMITTED: making the function
 * `return true` (the old mount-time swap) reds the four cases that matter, and
 * dropping the `attended` clause reds the release cases specifically.
 */

import { describe, expect, it } from "vitest";

import { initialPrimeMask, mirrorGlassIsLive } from "../MirrorRig";
import { MIRROR_BIT, MIRROR_KINDS } from "@/modules/sim/scene/vitok/mirrorAttention";

describe("mirrorGlassIsLive — the door glass tells the truth or nothing", () => {
  it("never shows a texture before a pass has filled it while attended", () => {
    // The frame after the student starts a glance but before the mirror's own
    // cadence phase comes round. Nothing has been rendered for him yet, so the
    // authored dark-gloss glass is the honest answer.
    expect(mirrorGlassIsLive("left", false, true, false)).toBe(false);
    expect(mirrorGlassIsLive("right", false, true, false)).toBe(false);
  });

  it("goes live on the pass that runs while he is looking through it", () => {
    expect(mirrorGlassIsLive("left", false, true, true)).toBe(true);
    expect(mirrorGlassIsLive("right", false, true, true)).toBe(true);
  });

  it("stays live between passes, so it does not strobe at the cadence", () => {
    // medium refreshes a door every 4th frame; low every 8th. If the glass
    // reverted on the frames with no pass it would flicker at 15 Hz.
    expect(mirrorGlassIsLive("left", true, true, false)).toBe(true);
  });

  it("hands the glass back the moment the glance ends — the whole point", () => {
    // This is case 2 in the header. Without it the last rendered frame stays
    // on the glass for the rest of the lesson and reads as a live mirror.
    expect(mirrorGlassIsLive("left", true, false, false)).toBe(false);
    // …and not even a pass may keep it live once he has looked away: the
    // priming path can fire a pass with nobody looking.
    expect(mirrorGlassIsLive("left", true, false, true)).toBe(false);
    expect(mirrorGlassIsLive("left", false, false, true)).toBe(false);
  });

  it("keeps the REAR mirror live unconditionally", () => {
    // It is in the picture at the driving pose and it is the tailgater
    // instrument (doc 62 #44) — it must never depend on being asked for.
    for (const wasLive of [false, true]) {
      for (const attended of [false, true]) {
        for (const passed of [false, true]) {
          expect(mirrorGlassIsLive("rear", wasLive, attended, passed)).toBe(true);
        }
      }
    }
  });
});

describe("initialPrimeMask — only the rear is primed", () => {
  it("arms the rear and neither door", () => {
    const mask = initialPrimeMask(MIRROR_KINDS);
    expect(mask & MIRROR_BIT.rear).toBe(MIRROR_BIT.rear);
    expect(mask & MIRROR_BIT.left).toBe(0);
    expect(mask & MIRROR_BIT.right).toBe(0);
  });

  it("is consistent with the glass rule — a primed target is one that shows", () => {
    // The invariant that ties the two functions together: a mirror is primed
    // exactly when its glass can be live without a pass of its own. Priming a
    // door wrote a buffer nobody was allowed to see, and that buffer WAS the
    // stale spawn reflection.
    const mask = initialPrimeMask(MIRROR_KINDS);
    for (const kind of MIRROR_KINDS) {
      const primed = (mask & MIRROR_BIT[kind]) !== 0;
      const liveWithoutOwnPass = mirrorGlassIsLive(kind, false, false, false);
      expect(primed, `${kind}: primed=${primed} liveWithoutOwnPass=${liveWithoutOwnPass}`).toBe(
        liveWithoutOwnPass,
      );
    }
  });
});
