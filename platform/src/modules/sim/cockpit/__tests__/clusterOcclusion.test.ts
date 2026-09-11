/**
 * WHAT THE STEERING WHEEL COVERS — the claim R1 opened with, made checkable.
 *
 * THE FRAMES. Three catalogue rows marked CRITICAL report the same thing:
 * sc-vp-telltale, sc-vp-handbrake and sc-vp-telltale-red all say „no lamp of
 * any colour renders in any frame". Two more, routed at this file, say it from
 * the lesson's side:
 *
 *   sc-pk-stop-vs-park/mobile-right/04-t134s.png — briefing step 6 orders
 *       „Подай десен мигач и паркирай плътно вдясно"; the cluster shows one
 *       dial, «0 км/ч» and «D», and no turn-signal telltale.
 *   sc-park-gap-long/mobile-right/02-briefing.png — steps 4–5 require a mirror
 *       check, a right indicator and dipped headlights; nothing in the cluster
 *       confirms any of them.
 *
 * They are right about the frame and wrong about the cause. The state IS fed
 * (clusterReadout) and the painter DOES paint it (InstrumentCluster) — the rail
 * is simply behind the wheel. These assertions hold that, in both directions:
 * the elements the founder CAN read must stay readable, and the rail must be
 * reported as hidden until somebody actually moves it.
 *
 * WHY THIS IS NOT „TESTING THE CONSTANTS". `faceVisibleFraction` is the
 * acceptance test the relocation needs. Today it returns 0 for the rail, which
 * is the defect. When the rail moves it must return 1 — and the digits and the
 * gear letter must STILL return 1, which is the half a layout pass loses.
 */

import { describe, expect, it } from "vitest";

import {
  DIAL_CX,
  DIAL_CY,
  DIGIT_COUNT,
  DIGIT_GAP,
  DIGIT_H,
  DIGIT_W,
  DIGITS_CX,
  DIGITS_CY,
  FACE_WHEEL_SILHOUETTE,
  GEAR_CX,
  GEAR_CY,
  GEAR_H,
  GEAR_W,
  LAMP_CY,
  LAMP_KEYS,
  MARK_CX,
  MARK_CY,
  MARK_H,
  MARK_W,
  ODO_DIGIT_COUNT,
  ODO_DIGIT_GAP,
  ODO_DIGIT_H,
  ODO_DIGIT_W,
  ODO_DIGITS_CX,
  ODO_DIGITS_CY,
  ODO_UNIT_CX,
  ODO_UNIT_CY,
  ODO_UNIT_H,
  ODO_UNIT_W,
  UNIT_H,
  NEEDLE_R_TIP,
  RULE_Y,
  FACE_W,
  GLANCE_FLOOR_CSS_PX,
  faceElementIsVisible,
  inkHeightCssPx,
  faceInkRect,
  faceVisibleFloorY,
  faceVisibleFraction,
  faceWorstFloorY,
  lampGlyphRect,
  type FaceRect,
} from "../clusterLayout";

/** The three digit cells of the speed readout, as authored by the builder. */
function digitCells(): FaceRect[] {
  const span = DIGIT_COUNT * DIGIT_W + (DIGIT_COUNT - 1) * DIGIT_GAP;
  return Array.from({ length: DIGIT_COUNT }, (_, i) => ({
    cx: DIGITS_CX - span / 2 + DIGIT_W / 2 + i * (DIGIT_W + DIGIT_GAP),
    cy: DIGITS_CY,
    w: DIGIT_W,
    h: DIGIT_H,
  }));
}

/** The trip-odometer digit cells, laid out exactly as the builder lays them. */
function odoDigitCells(): FaceRect[] {
  const span = ODO_DIGIT_COUNT * ODO_DIGIT_W + (ODO_DIGIT_COUNT - 1) * ODO_DIGIT_GAP;
  return Array.from({ length: ODO_DIGIT_COUNT }, (_, i) => ({
    cx: ODO_DIGITS_CX - span / 2 + ODO_DIGIT_W / 2 + i * (ODO_DIGIT_W + ODO_DIGIT_GAP),
    cy: ODO_DIGITS_CY,
    w: ODO_DIGIT_W,
    h: ODO_DIGIT_H,
  }));
}

describe("faceVisibleFloorY — the measured silhouette", () => {
  it("returns the sampled floor at each sample and interpolates between them", () => {
    for (const s of FACE_WHEEL_SILHOUETTE) {
      expect(faceVisibleFloorY(s.x)).toBeCloseTo(s.floorY, 9);
    }
    // Halfway between −115 (−16) and −9 (+41) is +12.5.
    expect(faceVisibleFloorY(-62)).toBeCloseTo(12.5, 6);
  });

  it("peaks at the wheel BOSS, which is why the centre column is the worst", () => {
    const boss = faceVisibleFloorY(-9);
    for (const s of FACE_WHEEL_SILHOUETTE) expect(boss).toBeGreaterThanOrEqual(s.floorY);
    // …and the right edge of the plate is the clearest column on the face.
    expect(faceVisibleFloorY(233)).toBeLessThan(faceVisibleFloorY(-220));
  });

  it("holds flat outside the sampled span instead of extrapolating into the bezel", () => {
    expect(faceVisibleFloorY(-256)).toBe(FACE_WHEEL_SILHOUETTE[0]!.floorY);
    expect(faceVisibleFloorY(256)).toBe(
      FACE_WHEEL_SILHOUETTE[FACE_WHEEL_SILHOUETTE.length - 1]!.floorY,
    );
    // NaN must not become NaN geometry: this feeds a boolean a layout pass reads.
    expect(Number.isFinite(faceVisibleFloorY(Number.NaN))).toBe(true);
  });
});

describe("faceWorstFloorY — the span rule, not the centre", () => {
  it("finds a knot INSIDE the span that neither edge sees", () => {
    // THE CENTROID TRAP, stated as a case. This rect is centred at x −60, where
    // the floor is +14.6, and its edges are at −111 (−18.2) and −9 (+41). A
    // centre-only test would report +14.6 and clear anything above it; the boss
    // at the right edge is +41. The gap is 26 design units of pure wrongness.
    const rect: FaceRect = { cx: -60, cy: 30, w: 102, h: 20 };
    expect(faceWorstFloorY(rect)).toBeCloseTo(41, 6);
    expect(faceWorstFloorY(rect)).toBeGreaterThan(faceVisibleFloorY(rect.cx));
  });

  it("is monotone in width — a wider element can never be MORE clear", () => {
    const narrow: FaceRect = { cx: -60, cy: 30, w: 10, h: 20 };
    const wide: FaceRect = { cx: -60, cy: 30, w: 200, h: 20 };
    expect(faceWorstFloorY(wide)).toBeGreaterThanOrEqual(faceWorstFloorY(narrow));
  });
});

describe("what the founder CAN read stays readable", () => {
  it("every digit of the speed readout is wholly clear of the wheel", () => {
    // R1 moved the speed here precisely because the dial hub was hidden, and
    // the founder confirmed «0 км/ч D» legible in the same frame in which the
    // dial numerals were not. If a layout pass ever breaks this, it has traded
    // the one readout that works for the one that does not.
    for (const cell of digitCells()) {
      expect(faceElementIsVisible(faceInkRect(cell))).toBe(true);
    }
  });

  it("but the digit CELLS reach behind the boss — ink is the right box", () => {
    // The distinction is not academic: judged as CELLS the speed readout would
    // be reported hidden, which is the false-refusal direction and would send
    // the next lane to move the one element that is fine.
    const centreCell = digitCells()[1]!;
    expect(faceElementIsVisible(centreCell)).toBe(false);
    expect(faceElementIsVisible(faceInkRect(centreCell))).toBe(true);
  });

  it("the gear letter is wholly clear, with the widest margin on the face", () => {
    const gear = faceInkRect({ cx: GEAR_CX, cy: GEAR_CY, w: GEAR_W, h: GEAR_H });
    expect(faceElementIsVisible(gear)).toBe(true);
    expect(gear.cy - gear.h / 2 - faceWorstFloorY(gear)).toBeGreaterThan(100);
  });

  it("…and so is every cell of the trip odometer — sc-pk-stop-vs-park:e788ce46", () => {
    // The row is „no tachometer, no fuel gauge and no odometer", and the ONE of
    // the three the car has a real quantity behind is now on the face. It is
    // worth a placement assertion for the same reason the speed digits are: the
    // strip it took is BELOW the gear column, i.e. closer to the wheel than
    // anything else that has to be read, so a future layout pass that drifts it
    // down has to fail here rather than in a sweep frame.
    for (const cell of odoDigitCells()) {
      expect(faceElementIsVisible(faceInkRect(cell))).toBe(true);
      // Whole CELLS, not just their ink — this readout has no boss above it.
      expect(faceElementIsVisible(cell)).toBe(true);
    }
    expect(
      faceElementIsVisible({ cx: ODO_UNIT_CX, cy: ODO_UNIT_CY, w: ODO_UNIT_W, h: ODO_UNIT_H }),
    ).toBe(true);
  });

  it("…and it clears R2's glance floor at the CABIN mount, not just the reel", () => {
    // THE HALF THAT THE OCCLUSION TEST ALONE WOULD MISS, and the reason this
    // readout is 62 units tall and three cells wide rather than 48 and four.
    // `dialNumeralsLegibleAt` exists because an element can be wholly visible
    // and still not be a number: the dial ring is 5.6–8.3 CSS px of ink at the
    // cabin's 158 px face and was withdrawn there. A four-cell odometer at
    // ODO_DIGIT_H 48 would have been 8.3 px — the same band, the same defect.
    const CABIN_LANDSCAPE_FACE_CSS_PX = 158;
    expect(inkHeightCssPx(ODO_DIGIT_H, CABIN_LANDSCAPE_FACE_CSS_PX)).toBeGreaterThanOrEqual(
      GLANCE_FLOOR_CSS_PX,
    );
    // The unit caption is a WORD cell (fitText fills it), so its quad height IS
    // its ink height — no CHAR_INK_H_FRACTION applies. 35 rather than the
    // shipped „км/ч" caption's 34: at 158 px, 34 gives 10.492, which misses the
    // floor by 0.008 px. Not worth moving the speed's caption for, worth not
    // copying into a new one.
    expect((CABIN_LANDSCAPE_FACE_CSS_PX * ODO_UNIT_H) / FACE_W).toBeGreaterThanOrEqual(
      GLANCE_FLOOR_CSS_PX,
    );
    expect(ODO_UNIT_H).toBeGreaterThanOrEqual(UNIT_H);
    // NON-VACUITY: the size that was first shipped fails this, which is what
    // makes the assertion above a floor rather than a description.
    expect(inkHeightCssPx(48, CABIN_LANDSCAPE_FACE_CSS_PX)).toBeLessThan(GLANCE_FLOOR_CSS_PX);
  });

  it("a FOURTH digit cell would not fit — the reason the unit changes instead", () => {
    // Pinned because it is the whole justification for `odoCells` switching to
    // kilometres, and because the obvious "improvement" is to add a cell. The
    // block's left end is what costs: past the x-107 knot the wheel boss climbs
    // to +41 and the strip stops existing.
    const four = odoDigitCells();
    const span = ODO_DIGIT_COUNT * ODO_DIGIT_W + (ODO_DIGIT_COUNT - 1) * ODO_DIGIT_GAP;
    const widened: FaceRect = {
      cx: ODO_DIGITS_CX - (ODO_DIGIT_W + ODO_DIGIT_GAP) / 2,
      cy: ODO_DIGITS_CY,
      w: span + ODO_DIGIT_W + ODO_DIGIT_GAP,
      h: ODO_DIGIT_H,
    };
    expect(four).toHaveLength(ODO_DIGIT_COUNT);
    expect(faceElementIsVisible(widened)).toBe(false);
  });

  it("the odometer does not collide with the gear column it sits under", () => {
    // Two elements on the same columns, one above the other: the gap is what
    // keeps «0042 м» from reading as part of the selector.
    const gearBottom = GEAR_CY - GEAR_H / 2;
    for (const cell of odoDigitCells()) expect(cell.cy + cell.h / 2).toBeLessThan(gearBottom);
    expect(ODO_UNIT_CY + ODO_UNIT_H / 2).toBeLessThan(gearBottom);
    // …and it stays above the hairline rule, which belongs to the hidden band.
    for (const cell of odoDigitCells()) expect(cell.cy - cell.h / 2).toBeGreaterThan(RULE_Y);
  });

  it("the dial's needle tip band clears the rim at the speeds a learner drives", () => {
    // The dial was lifted 14 units to keep the 0–40 km/h arc above the rim. At
    // 0 km/h the needle points to 225° (lower-LEFT), so the tip is the lowest
    // thing the dial owns — check it there rather than at the top of the scale.
    const a = (225 * Math.PI) / 180;
    const tip: FaceRect = {
      cx: DIAL_CX + Math.cos(a) * NEEDLE_R_TIP,
      cy: DIAL_CY + Math.sin(a) * NEEDLE_R_TIP,
      w: 4,
      h: 4,
    };
    // MEASURED, and it corrects the guess this assertion was first written
    // with: the tip lands at x −225, y −31, and the plate's left column clears
    // to −45. R1's „sitting 14 units higher keeps the 0–40 km/h ticks above the
    // steering-wheel rim" is therefore TRUE, and now checkable. The dial's
    // failure is legibility (dialNumeralsLegibleAt), not occlusion — two
    // different defects that a layout pass must not confuse.
    expect(faceVisibleFraction(tip)).toBe(1);
  });
});

describe("the telltale rail — the defect, pinned so a move can be proved", () => {
  it("not one lamp glyph is wholly visible", () => {
    for (let i = 0; i < LAMP_KEYS.length; i++) {
      expect(faceElementIsVisible(lampGlyphRect(i))).toBe(false);
    }
  });

  it("no lamp CENTRE is visible either — including the turn arrows", () => {
    // The centres are what „no lamp renders" means: a lamp whose centre is
    // behind the rim has no readable state at all. arrowLeft and arrowRight are
    // slots 0 and 7, and they are the two the parking briefings grade
    // („Подай десен мигач") — so they are named rather than left to the loop.
    const arrowLeft = LAMP_KEYS.indexOf("arrowLeft");
    const arrowRight = LAMP_KEYS.indexOf("arrowRight");
    expect(arrowLeft).toBeGreaterThanOrEqual(0);
    expect(arrowRight).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < LAMP_KEYS.length; i++) {
      const r = lampGlyphRect(i);
      expect(faceWorstFloorY(r)).toBeGreaterThan(r.cy);
    }
    // The two ends are not symmetric, and the asymmetry is worth naming: the
    // LEFT arrow is wholly gone, while the RIGHT one keeps a sliver of its top
    // edge — the same crumb InstrumentCluster measured on the PC frame as „a
    // ~8 px slit between rim and column shroud". A sliver is not a telltale:
    // its centre is behind the rim, so it carries no readable state, and the
    // band below is deliberately tight so that a real fix (a whole lamp) cannot
    // pass by widening the sliver.
    expect(faceVisibleFraction(lampGlyphRect(arrowLeft))).toBe(0);
    const right = faceVisibleFraction(lampGlyphRect(arrowRight));
    expect(right).toBeGreaterThan(0);
    expect(right).toBeLessThan(0.25);
  });

  it("the rule above the rail and the wordmark are gone with it", () => {
    expect(faceVisibleFraction({ cx: 0, cy: RULE_Y, w: 472, h: 1.5 })).toBe(0);
    expect(
      faceElementIsVisible(faceInkRect({ cx: MARK_CX, cy: MARK_CY, w: MARK_W, h: MARK_H })),
    ).toBe(false);
  });

  it("the rail is hidden by its PLACEMENT, not by its size — the fix is a move", () => {
    // The acceptance test for whoever relocates it. Same cells, same pitch,
    // lifted onto the clear top band: every lamp becomes wholly visible. So the
    // 40-unit cell is not the problem and shrinking the rail would not help —
    // LAMP_CY is. (Placing it there for real also has to displace the dial and
    // the digits, which is why this lane did not ship the move blind: it needs
    // a render, and every „0 defects" report in this project was an instrument
    // that had never looked.)
    for (let i = 0; i < LAMP_KEYS.length; i++) {
      const moved = { ...lampGlyphRect(i), cy: 100 };
      expect(faceElementIsVisible(moved)).toBe(true);
    }
    // And the current y is the reason: nothing at LAMP_CY clears the wheel
    // anywhere across the rail's own span.
    expect(LAMP_CY).toBeLessThan(faceWorstFloorY(lampGlyphRect(0)));
  });
});
