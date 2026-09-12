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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Color } from "three";
import { describe, expect, it } from "vitest";

import { inertGlassBands, initialPrimeMask, mirrorGlassIsLive } from "../MirrorRig";
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

/**
 * …AND THE HONEST BLANK HAD TO LOOK LIKE GLASS — sc-vu-pass-clearance:d770323a.
 *
 * The rule above is the half that was already right: the unattended door glass
 * may not carry a stale reflection. What it left was the PICTURE, and five
 * successive verifies described that picture in the same words — „a solid
 * matte-black housing with one flat grey-blue quad standing in for glass … a
 * uniform dark rectangle in a frame where road, kerb and buildings are all lit
 * and visible around it". A single flat fill does not read as glass; it reads
 * as a broken part, and `cabinLook` measures ~47 % of the left mirror on
 * screen at the driving pose, so the student is looking straight at it.
 *
 * `inertGlassBands` is the fix and it claims exactly one thing: the unattended
 * state is no longer ONE colour. These cases hold the split, the direction
 * (sky lighter than ground — the mirror is aimed down), and the fallback.
 */
describe("inertGlassBands — unlit glass, not a hole", () => {
  const glass = () => new Color(0x0a0c10);

  it("splits one flat fill into two DIFFERENT bands", () => {
    const sky = new Color();
    const ground = new Color();
    inertGlassBands(glass(), new Color(0x8fa2b4), sky, ground);
    expect(sky.getHex(), "sky must not equal ground — that was the defect").not.toBe(
      ground.getHex(),
    );
  });

  it("the sky band is the lighter one, because the glass is aimed DOWN", () => {
    const sky = new Color();
    const ground = new Color();
    inertGlassBands(glass(), new Color(0x8fa2b4), sky, ground);
    const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(lum(sky)).toBeGreaterThan(lum(ground));
    // …and both stay well short of the atmosphere itself: this is TINTED glass
    // at a glancing angle, not a window cut in the door.
    expect(lum(sky)).toBeLessThan(lum(new Color(0x8fa2b4)));
  });

  it("a dark sky makes a dark mirror — the colour is the WORLD's, not authored", () => {
    // Night and fog come out right for free only if the atmosphere is read per
    // clear. A night lesson whose mirror glowed would be the same class of lie
    // the stale reflection was.
    const daySky = new Color();
    const dayGround = new Color();
    inertGlassBands(glass(), new Color(0x8fa2b4), daySky, dayGround);
    const nightSky = new Color();
    const nightGround = new Color();
    inertGlassBands(glass(), new Color(0x11161f), nightSky, nightGround);
    const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(lum(nightSky)).toBeLessThan(lum(daySky));
  });

  it("no atmosphere = the flat authored tint, i.e. exactly what shipped", () => {
    // `scene.fog` is absent on some rigs and in every headless fixture. The
    // repair may not depend on it existing.
    const sky = new Color();
    const ground = new Color();
    inertGlassBands(glass(), null, sky, ground);
    expect(sky.getHex()).toBe(glass().getHex());
    expect(ground.getHex()).toBe(glass().getHex());
  });

  it("the bands reach the renderer — the clear is scissored into two", () => {
    // Without these two lines `inertGlassBands` is a pure function nothing
    // calls and the glass is exactly as flat as it was before the repair.
    const rig = readFileSync(resolve(__dirname, "../MirrorRig.tsx"), "utf8");
    expect(rig).toContain("inertGlassBands(color, atmosphere, INERT_SKY_SCRATCH, INERT_GROUND_SCRATCH);");
    expect(rig).toContain("gl.setScissor(0, groundPx, target.width, target.height - groundPx);");
    // …and the atmosphere really is the live scene's, not a constant.
    expect(rig).toContain("scene.fog instanceof FogExp2 ? scene.fog.color : null,");
  });
});
