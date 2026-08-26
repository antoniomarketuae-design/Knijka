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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WORLD_LABEL_GLANCE_FLOOR_CSS_PX,
  WORLD_LABEL_LEGIBILITY_MAX_SCALE,
  worldLabelScaleFor,
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

/* ═══════════════════════════════════════════════════════════════════════════
   …AND THE CONSUMER, WHICH FOR A WEEK DID NOT EXIST — 2026-08-26.

   Everything above this line was true on 2026-08-19 and changed nothing a
   student sees. `worldLabelLineIsLegible` had ONE importer in the whole tree —
   this file — so no plaque was ever resized or refused for failing the glance
   floor at runtime, and the next label to fall under it would have been caught
   by nobody. The three rows the lane closed (sc-jx-equal-left, sc-junction-blind,
   sc-jx-blocked-exit) rest on the `WORLD_LABEL_MAX_SCALE` clamp, which really
   did ship — and which is a CEILING, so it can only ever make a card SMALLER
   than the sizing rule asks for. It cannot answer a card that is too small.

   `worldLabelScaleFor` is the missing half: the sizing rule, then the floor,
   then a bounded amount of growth. `WorldProps` calls it once per frame for the
   B35 signal-head caption — the shared channel this file's header says
   everything is to migrate onto.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("worldLabelScaleFor — the floor, applied where the card is drawn", () => {
  it("leaves a card that ALREADY clears the floor exactly as the rule drew it", () => {
    // The false-refusal direction, and on this channel it is expensive: the
    // plaque hangs over the junction the student is trying to read, so a card
    // that grew where it was already legible is furniture on the one part of
    // the frame that matters. The PC play area clears the floor at the
    // reference distance (proved three blocks up), so nothing moves.
    for (const d of [4, WORLD_LABEL_REF_DIST_M, 30, 45, 61]) {
      expect(worldLabelScaleFor(d, PC_H, PC_VFOV), `${d} m`).toBe(worldLabelScaleAt(d));
    }
  });

  it("grows the card on the handset — by the ratio it is short by, and no more", () => {
    // 7.8 px against a 10.5 px floor at the reference distance: short by about
    // 1.35, and that is exactly what it grows by. Not a round number and not a
    // preference — the floor divided by the measurement.
    const d = WORLD_LABEL_REF_DIST_M;
    const apparent = worldLabelApparentCssPx(WORLD_LABEL_LINE_PX.headline, d, PHONE_H, PHONE_VFOV);
    expect(apparent).toBeLessThan(WORLD_LABEL_GLANCE_FLOOR_CSS_PX);
    const s = worldLabelScaleFor(d, PHONE_H, PHONE_VFOV);
    expect(s).toBeCloseTo(worldLabelScaleAt(d) * (WORLD_LABEL_GLANCE_FLOOR_CSS_PX / apparent), 9);
    // …and the card it produces really is legible, which is the only test that
    // matters: the grown plane's headline stands ON the floor, not under it.
    expect(apparent * (s / worldLabelScaleAt(d))).toBeCloseTo(
      WORLD_LABEL_GLANCE_FLOOR_CSS_PX,
      9,
    );
  });

  it("never shrinks a card, and never grows past its own ceiling", () => {
    for (const d of [1, 4, 18, 45, 61, 200]) {
      const s = worldLabelScaleFor(d, PHONE_H, PHONE_VFOV);
      expect(s, `${d} m`).toBeGreaterThanOrEqual(worldLabelScaleAt(d));
      expect(s, `${d} m`).toBeLessThanOrEqual(WORLD_LABEL_LEGIBILITY_MAX_SCALE);
    }
    // A stage one pixel tall would ask for a plaque the size of the district;
    // the ceiling is what stops the fix from becoming the next finding.
    expect(worldLabelScaleFor(45, 1, PHONE_VFOV)).toBe(WORLD_LABEL_LEGIBILITY_MAX_SCALE);
  });

  it("an UNMEASURABLE stage changes nothing — it does not invent growth", () => {
    // A canvas of zero height mid-resize, an orthographic camera with no `fov`
    // (the top-down aid), a NaN out of a torn read. „I could not measure" is
    // not evidence that the card is too small, and the direction that costs the
    // student here is a 12 m plaque over the junction on a missing number.
    for (const bad of [0, -1, Number.NaN]) {
      expect(worldLabelScaleFor(45, bad, PHONE_VFOV), `height ${bad}`).toBe(worldLabelScaleAt(45));
      expect(worldLabelScaleFor(45, PHONE_H, bad), `fov ${bad}`).toBe(worldLabelScaleAt(45));
    }
  });
});

describe("WorldProps draws the caption at the scale the floor asks for", () => {
  // `WorldProps.tsx` is R3F and cannot be mounted here, so the binding is read
  // as source — with the comments removed FIRST, because these files are
  // thousands of lines of prose about exactly these constants and a scan that
  // counted them would be satisfied by the paragraph explaining the fix rather
  // than by the fix.
  const SRC = readFileSync(join(__dirname, "../WorldProps.tsx"), "utf8");
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

  it("the comment remover really removes comments", () => {
    const inProse = "the card rendered INSIDE the housing";
    expect(SRC).toContain(inProse);
    expect(CODE).not.toContain(inProse);
  });

  it("the frame loop asks for the scale instead of re-deriving the clamp", () => {
    expect(CODE).toContain("worldLabelScaleFor(labelDist, frame.size.height, vFovRad)");
    // …and the inline clamp is GONE. While it stood beside the call the
    // renderer and the instrument could disagree again without anything saying
    // so, which is the condition that produced this whole family.
    expect(CODE).not.toContain("WORLD_LABEL_MAX_SCALE");
    expect(CODE).not.toContain("WORLD_LABEL_REF_DIST_M");
  });
});
