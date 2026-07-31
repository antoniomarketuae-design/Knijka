/**
 * The COCKPIT door-mirror windows' contract — founder item 45.
 *
 * He stated the ceiling as a number: «not more than 10% of the screen». A
 * promise in a comment is not a contract, so it is swept across every aspect the
 * product ships on, plus two extremes, here. He also stated the placement in
 * words that leave nothing to interpret — «on the right side if he press right
 * and on the left side if he press left» — so that is asserted too, on the sign
 * of the window's own centre.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  doorMirrorCenterNdc,
  doorMirrorQuadHalfSize,
  doorMirrorQuadOffset,
  doorMirrorRect,
  DOOR_MIRROR_CADENCE,
  DOOR_MIRROR_CADENCE_PHASE,
  DOOR_MIRROR_CENTER_Y_NDC,
  DOOR_MIRROR_EYE,
  DOOR_MIRROR_FOV_DEG,
  DOOR_MIRROR_MAX_SCREEN_FRACTION,
  DOOR_MIRROR_PIXEL_ASPECT,
  DOOR_MIRROR_TARGET_HEIGHT,
  DOOR_MIRROR_TARGET_WIDTH,
  DOOR_MIRROR_YAW_RAD,
  type DoorMirrorSide,
} from "./cockpitDoorMirror";

/** 4:3, 16:10, 16:9, 21:9, an iPhone in portrait, and two absurd extremes. */
const ASPECTS = [4 / 3, 1.6, 16 / 9, 21 / 9, 375 / 812, 0.3, 5] as const;
const SIDES: DoorMirrorSide[] = ["left", "right"];

describe("doorMirrorRect — the ≤10 % contract he stated as a number", () => {
  it("never exceeds a tenth of the screen at any aspect", () => {
    for (const a of ASPECTS) {
      const r = doorMirrorRect(a);
      expect(
        r.screenAreaFraction,
        `aspect ${a.toFixed(3)} → ${(r.screenAreaFraction * 100).toFixed(1)} % of screen`,
      ).toBeLessThanOrEqual(DOOR_MIRROR_MAX_SCREEN_FRACTION);
    }
  });

  it("holds the ceiling for ANY authored size, not just the shipped one", () => {
    // The clamp is the contract, not the arithmetic. If somebody doubles
    // DOOR_MIRROR_HEIGHT_FRACTION next month the window must still obey him.
    for (const a of ASPECTS) {
      for (const scale of [1, 0.5, 0.2]) {
        expect(doorMirrorRect(a, scale).screenAreaFraction).toBeLessThanOrEqual(
          DOOR_MIRROR_MAX_SCREEN_FRACTION,
        );
      }
    }
  });

  it("is big enough to see what is happening behind — his actual complaint", () => {
    // Readability is a PIXEL property, so it is pinned on the height fraction,
    // not the area: on a 5:1 ultrawide the same window is a small share of a
    // very wide screen while being exactly as many pixels tall as on 16:9.
    for (const a of ASPECTS.filter((x) => x >= 0.4)) {
      expect(doorMirrorRect(a).heightFraction, `aspect ${a}`).toBeGreaterThanOrEqual(0.15);
    }
    // …and on every shipping landscape shape it uses most of the budget he
    // allowed. A 1 % sliver would satisfy the ceiling and fail the ask.
    for (const a of [4 / 3, 1.6, 16 / 9, 21 / 9]) {
      expect(doorMirrorRect(a).screenAreaFraction, `aspect ${a}`).toBeGreaterThan(0.045);
    }
  });

  it("keeps the render target's pixel shape, so nothing is squeezed", () => {
    for (const a of [4 / 3, 1.6, 16 / 9, 21 / 9]) {
      const r = doorMirrorRect(a);
      // pixel aspect = (widthFraction · W) / (heightFraction · H) = wf·a/hf
      expect((r.widthFraction * a) / r.heightFraction, `aspect ${a}`).toBeCloseTo(
        DOOR_MIRROR_PIXEL_ASPECT,
        6,
      );
    }
    expect(DOOR_MIRROR_TARGET_WIDTH / DOOR_MIRROR_TARGET_HEIGHT).toBeCloseTo(
      DOOR_MIRROR_PIXEL_ASPECT,
      6,
    );
  });

  it("survives a garbage aspect instead of producing NaN geometry", () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = doorMirrorRect(bad);
      expect(Number.isFinite(r.widthFraction)).toBe(true);
      expect(Number.isFinite(r.heightFraction)).toBe(true);
      expect(r.screenAreaFraction).toBeLessThanOrEqual(DOOR_MIRROR_MAX_SCREEN_FRACTION);
    }
  });
});

describe("doorMirrorCenterNdc — «left if he press left, right if he press right»", () => {
  it("puts Q's window on the left of the screen and E's on the right", () => {
    for (const a of ASPECTS) {
      expect(doorMirrorCenterNdc("left", a).x, `aspect ${a}`).toBeLessThan(0);
      expect(doorMirrorCenterNdc("right", a).x, `aspect ${a}`).toBeGreaterThan(0);
    }
  });

  it("keeps the whole window on screen, with a margin", () => {
    for (const a of ASPECTS) {
      const rect = doorMirrorRect(a);
      for (const side of SIDES) {
        const c = doorMirrorCenterNdc(side, a);
        // NDC half-extents: a fraction-of-viewport w maps to w in NDC half-width.
        expect(Math.abs(c.x) + rect.widthFraction, `${side} @ ${a}`).toBeLessThanOrEqual(1);
        expect(Math.abs(c.y) + rect.heightFraction, `${side} @ ${a}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("mirrors the two sides exactly", () => {
    for (const a of ASPECTS) {
      expect(doorMirrorCenterNdc("left", a).x).toBeCloseTo(-doorMirrorCenterNdc("right", a).x, 12);
    }
  });

  it("sits in the band the cockpit HUD actually leaves free", () => {
    // DOM always paints over the canvas, so a window that strays into a HUD
    // bank is row B76 repeating with a different card on top. The two edges are
    // MEASURED off a rendered 1440×900 cockpit frame, not assumed: the
    // „Клавиши" key table (`controls-help`) reaches 378 px = 42 % of the play
    // area — NDC +0.16 — and the touch-control cluster starts around 93 %, NDC
    // −0.86. The first cut of this window sat at −0.08 and the legend clipped
    // its corner; these are the numbers that caught it.
    const LEGEND_FOOT_NDC = 0.16;
    const TOUCH_CONTROLS_HEAD_NDC = -0.86;
    for (const a of ASPECTS.filter((x) => x >= 0.4)) {
      const rect = doorMirrorRect(a);
      const top = DOOR_MIRROR_CENTER_Y_NDC + rect.heightFraction;
      const bottom = DOOR_MIRROR_CENTER_Y_NDC - rect.heightFraction;
      expect(top, `aspect ${a} — under the „Клавиши" table`).toBeLessThan(LEGEND_FOOT_NDC);
      expect(bottom, `aspect ${a} — above the touch controls`).toBeGreaterThan(
        TOUCH_CONTROLS_HEAD_NDC,
      );
    }
  });
});

describe("the quad that carries it", () => {
  it("subtends the rect's exact screen fraction at any distance and fov", () => {
    const vFov = (52 * Math.PI) / 180;
    for (const a of [4 / 3, 16 / 9, 21 / 9]) {
      for (const d of [0.4, 0.5, 2]) {
        const { halfWidth, halfHeight } = doorMirrorQuadHalfSize(d, vFov, a);
        const viewHeight = 2 * d * Math.tan(vFov / 2);
        const viewWidth = viewHeight * a;
        const rect = doorMirrorRect(a);
        expect((halfWidth * 2) / viewWidth).toBeCloseTo(rect.widthFraction, 9);
        expect((halfHeight * 2) / viewHeight).toBeCloseTo(rect.heightFraction, 9);
      }
    }
  });

  it("places the quad at the same NDC centre the rect is measured at", () => {
    const vFov = (52 * Math.PI) / 180;
    const d = 0.5;
    for (const a of [4 / 3, 16 / 9]) {
      for (const side of SIDES) {
        const off = doorMirrorQuadOffset(side, d, vFov, a);
        const viewHeight = 2 * d * Math.tan(vFov / 2);
        const viewWidth = viewHeight * a;
        const ndc = doorMirrorCenterNdc(side, a);
        expect((off.x * 2) / viewWidth).toBeCloseTo(ndc.x, 9);
        expect((off.y * 2) / viewHeight).toBeCloseTo(ndc.y, 9);
      }
    }
  });
});

describe("the pass — aim, vantage and budget", () => {
  it("looks through the GLB door glass, 0.9 m outboard, not from the driver's eye", () => {
    // The outboard vantage IS the door mirror. A pass from the eye point would
    // be a second rear-view window wearing a door mirror's name.
    expect(DOOR_MIRROR_EYE.left.x).toBeGreaterThan(0.8); // chassis +X is car-LEFT
    expect(DOOR_MIRROR_EYE.right.x).toBeLessThan(-0.8);
    expect(DOOR_MIRROR_EYE.left.y).toBeCloseTo(DOOR_MIRROR_EYE.right.y, 12);
    expect(DOOR_MIRROR_EYE.left.z).toBeCloseTo(DOOR_MIRROR_EYE.right.z, 12);
  });

  it("stays pinned to MirrorRig's authored MIRROR_DEFS positions", () => {
    // DOOR_MIRROR_EYE duplicates literals out of a "use client" component that
    // cannot be imported into a Node test. This is the pin: if the GLB glass
    // moves and MIRROR_DEFS is re-authored, this fails and the two get resynced
    // instead of silently drifting into two different door mirrors.
    const src = readFileSync(
      join(process.cwd(), "src/components/sim/vitok/MirrorRig.tsx"),
      "utf8",
    );
    const fmt = (v: number) => (Object.is(v, -0) ? "0" : String(v));
    for (const side of SIDES) {
      const e = DOOR_MIRROR_EYE[side];
      expect(src, `MIRROR_DEFS.${side}`).toContain(`pos: [${fmt(e.x)}, ${fmt(e.y)}, ${fmt(e.z)}]`);
    }
  });

  it("keeps the yaw at zero — REF 6 failure #3 never comes back", () => {
    // An outward yaw of ∓0.14 aimed the left glass ~8° into the roadside lawn
    // and the mirror read as "solid green". The outboard EYE does that job.
    expect(DOOR_MIRROR_YAW_RAD).toBe(0);
  });

  it("is wide enough to hold the adjacent lane AND the car's own flank", () => {
    // Horizontal field = 2·atan(tan(vFov/2)·aspect). Below ~40° the window is a
    // telephoto crop of the road behind and shows no lane beside you at all.
    const h =
      2 *
      Math.atan(Math.tan((DOOR_MIRROR_FOV_DEG * Math.PI) / 360) * DOOR_MIRROR_PIXEL_ASPECT) *
      (180 / Math.PI);
    expect(h).toBeGreaterThan(40);
    expect(h).toBeLessThan(75); // past this it is a fisheye, not a mirror
  });

  it("never costs a reduced-scene pass every frame", () => {
    // The window adds at most 1/DOOR_MIRROR_CADENCE passes per frame, and only
    // while a glance is actually held. MirrorRig's own ≤1-pass-per-frame budget
    // is untouched by this file, so the cockpit's worst case during a held
    // glance is 1.5 — stated in cockpitDoorMirror.ts and pinned here.
    expect(DOOR_MIRROR_CADENCE).toBeGreaterThanOrEqual(2);
    expect(DOOR_MIRROR_CADENCE_PHASE).toBeGreaterThanOrEqual(0);
    expect(DOOR_MIRROR_CADENCE_PHASE).toBeLessThan(DOOR_MIRROR_CADENCE);
    let passes = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      if (frame % DOOR_MIRROR_CADENCE === DOOR_MIRROR_CADENCE_PHASE) passes += 1;
    }
    expect(passes).toBe(30); // 30 Hz at 60 fps — the chase window's own rate
  });
});
