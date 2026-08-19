/**
 * IS THE WORLD-LABEL CARD BIG ENOUGH TO READ? — the header's own claim, checked.
 *
 * worldLabel.ts says „THE SIZING RULE IS THE POINT … the caption is readable
 * from the distance at which the student can still act on it — not only from
 * the stop line, where the decision has already been made". It is a claim about
 * SCREEN size expressed entirely in texture pixels, which are not a size.
 *
 * THE FRAMES that made this worth measuring (all five BROKEN rows routed at
 * worldLabel.ts describe the same symptom on world-anchored plaques):
 *
 *   sc-junction-blind/mobile-right/05-stopped.png — „a grey smear about 6 px
 *       tall"
 *   sc-jx-equal-left/mobile-right/04-t039s.png    — „its second line is
 *       rendered at roughly 6 px — a grey blur"
 *   sc-jx-blocked-exit/pc-right/05-stopped.png    — „an illegible blur at
 *       roughly 5 px"
 *
 * Those particular plaques are painted by `components/sim/RouteGuidance.tsx`,
 * not by this file — see the lane report. But the SHARED channel has the same
 * disease and nothing had ever measured it, so these assertions hold the
 * numbers for the channel the register wants everything to migrate onto.
 *
 * BOTH DIRECTIONS. A predicate that says „nothing is legible" is as useless as
 * one that says everything is. The cases below include mounts and distances
 * where lines DO clear the floor, so a future fix can be seen to work.
 */

import { describe, expect, it } from "vitest";

import {
  WORLD_LABEL_GLANCE_FLOOR_CSS_PX,
  WORLD_LABEL_H_M,
  WORLD_LABEL_LINE_PX,
  WORLD_LABEL_MAX_SCALE,
  WORLD_LABEL_REF_DIST_M,
  WORLD_LABEL_TEX_H,
  worldLabelApparentCssPx,
  worldLabelInkMetres,
  worldLabelLineIsLegible,
  worldLabelScaleAt,
} from "../worldLabel";

/** His handset, landscape: 852×393 CSS, vFOV 39.248° (cockpitVFovForAspect). */
const PHONE_H = 393;
const PHONE_VFOV = (39.248 * Math.PI) / 180;
/** The PC window the sweep drove: ~1164×648 of play area at 1440×900, vFOV
 *  51.573° at 1.6:1. */
const PC_H = 648;
const PC_VFOV = (51.573 * Math.PI) / 180;

describe("worldLabelScaleAt — the sizing rule, stated once", () => {
  it("is unscaled inside the reference distance and grows past it", () => {
    expect(worldLabelScaleAt(1)).toBe(1);
    expect(worldLabelScaleAt(WORLD_LABEL_REF_DIST_M)).toBe(1);
    expect(worldLabelScaleAt(WORLD_LABEL_REF_DIST_M * 2)).toBeCloseTo(2, 9);
  });

  it("stops growing at the ceiling, and answers a nonsense distance", () => {
    expect(worldLabelScaleAt(10_000)).toBe(WORLD_LABEL_MAX_SCALE);
    expect(worldLabelScaleAt(0)).toBe(1);
    expect(worldLabelScaleAt(Number.NaN)).toBe(1);
  });
});

describe("apparent size — where the plateau is, and how high", () => {
  it("is at its MINIMUM exactly at the reference distance", () => {
    // This is why the reference distance is the number that matters: closer in
    // the card is unscaled and grows as you approach; beyond it the scale
    // cancels the distance. So one measurement at REF describes the whole
    // approach, and it is the worst case rather than a sample.
    const at = (d: number) =>
      worldLabelApparentCssPx(WORLD_LABEL_LINE_PX.lawRef, d, PHONE_H, PHONE_VFOV);
    const plateau = at(WORLD_LABEL_REF_DIST_M);
    for (const d of [2, 5, 9, 14, 17.9]) expect(at(d)).toBeGreaterThan(plateau);
    // …and it holds flat across the growth band rather than sagging.
    for (const d of [20, 30, 45, WORLD_LABEL_REF_DIST_M * WORLD_LABEL_MAX_SCALE]) {
      expect(at(d)).toBeCloseTo(plateau, 6);
    }
    // Past the ceiling it shrinks again — the honest end of the rule.
    expect(at(WORLD_LABEL_REF_DIST_M * WORLD_LABEL_MAX_SCALE * 2)).toBeLessThan(plateau);
  });

  it("converts texture px to metres through the card's own aspect", () => {
    // A stretched conversion would make every number below wrong in the
    // reassuring direction, so it is pinned to the constants rather than to a
    // literal: 38 of 470 px of a 1.5605 m card.
    expect(worldLabelInkMetres(WORLD_LABEL_TEX_H)).toBeCloseTo(WORLD_LABEL_H_M, 9);
    expect(worldLabelInkMetres(WORLD_LABEL_LINE_PX.lawRef)).toBeCloseTo(0.12618, 4);
  });
});

describe("the measurement this lane recorded", () => {
  it("puts EVERY line of the card under the floor on the founder's handset", () => {
    const at = (px: number) =>
      worldLabelApparentCssPx(px, WORLD_LABEL_REF_DIST_M, PHONE_H, PHONE_VFOV);
    // Even the shouted headline — 10.2 against a floor of 10.5 — and this
    // treats the whole em as ink, so the real cap height is ~0.7 of it.
    expect(at(WORLD_LABEL_LINE_PX.headline)).toBeCloseTo(10.16, 1);
    expect(at(WORLD_LABEL_LINE_PX.line2)).toBeCloseTo(5.49, 1);
    expect(at(WORLD_LABEL_LINE_PX.line1)).toBeCloseTo(5.08, 1);
    expect(at(WORLD_LABEL_LINE_PX.lawRef)).toBeCloseTo(3.86, 1);
    for (const px of Object.values(WORLD_LABEL_LINE_PX)) {
      expect(
        worldLabelLineIsLegible(px, WORLD_LABEL_REF_DIST_M, PHONE_H, PHONE_VFOV),
      ).toBe(false);
    }
    // The catalogue read 5–6 px off the frames. The channel's own body lines
    // land at 5.1 and 5.5 — the instrument and the eye agree.
    expect(at(WORLD_LABEL_LINE_PX.line1)).toBeGreaterThan(4);
    expect(at(WORLD_LABEL_LINE_PX.line1)).toBeLessThan(7);
  });

  it("the law line is the worst, and by how much — 2.7× under", () => {
    // ADR-002 makes this the line that may not simply be dropped: it is the
    // citation. Its shortfall is the size of the problem to be solved.
    const px = worldLabelApparentCssPx(
      WORLD_LABEL_LINE_PX.lawRef,
      WORLD_LABEL_REF_DIST_M,
      PHONE_H,
      PHONE_VFOV,
    );
    expect(WORLD_LABEL_GLANCE_FLOOR_CSS_PX / px).toBeGreaterThan(2.5);
    expect(WORLD_LABEL_GLANCE_FLOOR_CSS_PX / px).toBeLessThan(3);
  });
});

describe("the predicate discriminates — it does not condemn everybody", () => {
  it("the headline DOES clear the floor on the PC window", () => {
    // A false refusal is as bad as a false certificate: if this returned false
    // everywhere it would be an alarm, not a measurement. The taller PC play
    // area carries the headline over the floor at the same distance.
    expect(
      worldLabelLineIsLegible(
        WORLD_LABEL_LINE_PX.headline,
        WORLD_LABEL_REF_DIST_M,
        PC_H,
        PC_VFOV,
      ),
    ).toBe(true);
    // …and the law line still does not, on either mount. The gap between the
    // biggest and the smallest line is what a copy fix has to close.
    expect(
      worldLabelLineIsLegible(WORLD_LABEL_LINE_PX.lawRef, WORLD_LABEL_REF_DIST_M, PC_H, PC_VFOV),
    ).toBe(false);
  });

  it("every line clears the floor close up, which is exactly the complaint", () => {
    // At 4 m — the stop line, where the decision has already been made — the
    // whole card is legible on the handset. The card is not too small; it is
    // too small WHERE IT MATTERS, which is the header's own contract failing
    // rather than a general shortage of pixels.
    for (const px of Object.values(WORLD_LABEL_LINE_PX)) {
      expect(worldLabelLineIsLegible(px, 4, PHONE_H, PHONE_VFOV)).toBe(true);
    }
  });

  it("answers a degenerate mount with 0 rather than NaN or Infinity", () => {
    for (const bad of [0, -1, Number.NaN]) {
      expect(worldLabelApparentCssPx(WORLD_LABEL_LINE_PX.lawRef, bad, PHONE_H, PHONE_VFOV)).toBe(0);
      expect(worldLabelApparentCssPx(WORLD_LABEL_LINE_PX.lawRef, 18, bad, PHONE_VFOV)).toBe(0);
      expect(worldLabelApparentCssPx(WORLD_LABEL_LINE_PX.lawRef, 18, PHONE_H, bad)).toBe(0);
    }
  });
});
