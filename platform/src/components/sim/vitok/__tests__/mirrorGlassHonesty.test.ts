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

import { Color, Vector4, type WebGLRenderTarget, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import {
  clearMirrorToInert,
  inertGlassBands,
  inertSkyBandRect,
  initialPrimeMask,
  mirrorGlassIsLive,
  INERT_GROUND_FRACTION,
} from "../MirrorRig";
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

  it("the bands reach the frame loop — the clear really is the live scene's", () => {
    // Without these two lines `inertGlassBands` is a pure function nothing
    // calls and the glass is exactly as flat as it was before the repair.
    // (The band's GEOMETRY is no longer grepped for; it is driven below, which
    // is what caught the pixel-ratio defect a grep had certified as fixed.)
    const rig = readFileSync(resolve(__dirname, "../MirrorRig.tsx"), "utf8");
    expect(rig).toContain("inertGlassBands(color, atmosphere, INERT_SKY_SCRATCH, INERT_GROUND_SCRATCH);");
    // …and the atmosphere really is the live scene's, not a constant.
    expect(rig).toContain("scene.fog instanceof FogExp2 ? scene.fog.color : null,");
  });
});

/**
 * ── AND THE SECOND BAND HAD TO SURVIVE A PIXEL RATIO — sc-vu-pass-clearance:d770323a.
 *
 * `inertGlassBands` computes two colours; the clear has to actually land them
 * in two different parts of a 160 × 96 render target. It did not. The band was
 * programmed with `gl.setScissor`, which is a CSS-pixel call — three multiplies
 * it by the renderer's pixel ratio before it reaches GL — while a bound render
 * target's scissor is read straight off `renderTarget.scissor`, unscaled.
 *
 * `autoQualityCeiling()` caps every touch device at `med`, and `maxDprFor` gives
 * a handset on `med` `clamp(devicePixelRatio, 1, 2)` — so on the founder's phone
 * the rect (0, 60, 160, 36) reached GL as (0, 120, 320, 72): entirely above a
 * 96-row buffer, an intersection of zero pixels. The sky clear wrote nothing and
 * the glass stayed the single flat fill the repair existed to remove. It painted
 * 21 of 36 rows at 1.25 (a desktop on `med`), 6 at 1.5, and came out right only
 * at pixelRatio 1 — the desktop audit harness, the one machine the corpus is
 * photographed on.
 *
 * The previous version of the assertion was `expect(rig).toContain("gl.setScissor(…)")`.
 * It passed. That is why these cases DRIVE the function against a recording
 * renderer instead of reading the file: a grep can only confirm that a line was
 * written, never that the rectangle it writes lands inside the glass.
 *
 * MUTATION CHECK RUN BEFORE COMMIT: restoring the `gl.setScissor` /
 * `gl.setScissorTest` pair reds „never programs a RENDERER-space scissor" and
 * „writes the ground over the whole glass…"; dropping the band entirely reds
 * the clear count; leaving `target.scissorTest` armed reds „hands the glass
 * back whole".
 */
describe("clearMirrorToInert — the band is expressed in TARGET pixels", () => {
  const TARGET_W = 160;
  const TARGET_H = 96;
  const GLASS = 0x0a0c10;
  const ATMOSPHERE = 0x8fa2b4;
  /** What the composer had set before the blank runs, so the restore is real. */
  const PREV_COLOR = 0x123456;
  const PREV_ALPHA = 0.25;

  interface ClearRecord {
    target: unknown;
    scissorTest: boolean;
    scissor: [number, number, number, number];
    color: number;
  }

  function drive() {
    // A stub and not a real WebGLRenderTarget: the four fields the blank reads
    // are the whole contract, and a real one would want a GL context.
    const target = {
      width: TARGET_W,
      height: TARGET_H,
      scissor: new Vector4(0, 0, TARGET_W, TARGET_H),
      scissorTest: false,
    };
    const priorTarget = { name: "the composer's own target" };
    let bound: unknown = priorTarget;
    const clearColor = new Color(PREV_COLOR);
    let clearAlpha = PREV_ALPHA;
    const clears: ClearRecord[] = [];
    /** Every CSS-pixel call the repair is forbidden to make. */
    const rendererSpace: string[] = [];

    const gl = {
      getRenderTarget: () => bound,
      getClearColor: (out: Color) => out.copy(clearColor),
      getClearAlpha: () => clearAlpha,
      setClearColor: (c: Color, a: number) => {
        clearColor.copy(c);
        clearAlpha = a;
      },
      setRenderTarget: (t: unknown) => {
        bound = t;
      },
      clear: () => {
        const t = bound === target ? target : null;
        clears.push({
          target: bound,
          scissorTest: t ? t.scissorTest : false,
          scissor: t
            ? [t.scissor.x, t.scissor.y, t.scissor.z, t.scissor.w]
            : [0, 0, 0, 0],
          color: clearColor.getHex(),
        });
      },
      setScissor: () => rendererSpace.push("setScissor"),
      setScissorTest: () => rendererSpace.push("setScissorTest"),
      getScissorTest: () => {
        rendererSpace.push("getScissorTest");
        return false;
      },
    };

    clearMirrorToInert(
      gl as unknown as WebGLRenderer,
      target as unknown as WebGLRenderTarget,
      new Color(GLASS),
      new Color(ATMOSPHERE),
    );
    return { target, priorTarget, clears, rendererSpace, bound: () => bound, clearColor, alpha: () => clearAlpha };
  }

  it("writes the ground over the whole glass, then the sky over the top band", () => {
    const { clears } = drive();
    expect(clears).toHaveLength(2);
    // 1 — the ground, unscissored, so no part of the glass is ever left
    // uninitialised even if the band below is refused.
    expect(clears[0].scissorTest).toBe(false);
    // 2 — the sky, scissored to the strip above the ground fraction. GL's
    // origin is bottom-left, so that strip is the HIGH rows.
    expect(clears[1].scissorTest).toBe(true);
    const [x, y, w, h] = clears[1].scissor;
    expect([x, w]).toEqual([0, TARGET_W]);
    expect(y).toBe(Math.round(TARGET_H * INERT_GROUND_FRACTION));
    expect(h).toBeGreaterThan(0);
    // THE CASE THAT WOULD HAVE CAUGHT IT: the band must reach the top row of
    // THIS target. Any rect scaled by a pixel ratio > 1 overshoots it, and at
    // ratio 2 it clears the buffer entirely and paints nothing.
    expect(y + h).toBe(TARGET_H);
    // …and the two clears are two DIFFERENT colours, or there is one band.
    expect(clears[0].color).not.toBe(clears[1].color);
  });

  it("never programs a RENDERER-space scissor — that one is in CSS pixels", () => {
    const { rendererSpace } = drive();
    expect(rendererSpace).toEqual([]);
  });

  it("hands the glass back whole, so the live pass is not clipped to the band", () => {
    // The same target carries the attended pass. A band left armed would render
    // world into 36 rows and leave the rest holding the last blank.
    const { target } = drive();
    expect(target.scissorTest).toBe(false);
  });

  it("restores the render target and clear colour the composer owns", () => {
    const { bound, priorTarget, clearColor, alpha } = drive();
    expect(bound()).toBe(priorTarget);
    expect(clearColor.getHex()).toBe(PREV_COLOR);
    expect(alpha()).toBe(PREV_ALPHA);
  });
});

describe("inertSkyBandRect — the rect the glass is split on", () => {
  it("puts the split at the ground fraction and runs to the top row", () => {
    const band = inertSkyBandRect(96);
    expect(band.y).toBe(60); // round(96 × 0.62)
    expect(band.height).toBe(36);
    expect(band.y + band.height).toBe(96);
  });

  it("never returns a band that would spill past the glass", () => {
    // Sizes this rig does not use today, so a future target size cannot make
    // the sky clear write outside its own buffer.
    for (const h of [1, 2, 3, 16, 64, 96, 128, 256]) {
      const band = inertSkyBandRect(h);
      expect(band.y).toBeGreaterThanOrEqual(0);
      expect(band.height).toBeGreaterThanOrEqual(0);
      expect(band.y + band.height).toBe(h);
    }
  });
});
