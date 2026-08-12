import { describe, expect, it } from "vitest";
import {
  arcRisePx,
  arcStationCount,
  arcStationRectPx,
  ARC_STATIONS_LEFT,
  ARC_STATIONS_RIGHT,
  padCorridorPx,
  padRectPx,
  topRailBandPx,
  touchControlsFloorPx,
  TOUCH_CONTROLS_FLOOR,
  type StageBox,
  type StageRect,
} from "./TouchControls";
import {
  notifyColumnWidthPx,
  NOTIFY_COLUMN_GUTTER_PX,
} from "@/modules/sim/hud";
import {
  TOUCH_DRIVE_ABSOLUTE_RANGE_PX,
  TOUCH_DRIVE_NEUTRAL_HALF_PX,
} from "@/modules/sim/engine";

/**
 * =============================================================================
 * THE THUMB ARC AGAINST EVERYTHING ELSE ON THE SCREEN — doc 87 row C1.
 *
 * HIS ROW, verbatim: „Landing state is a 100 %-of-viewport modal — 0 % road."
 * The modal was gone long before this file existed. What was left is worse and
 * quieter, and it took a purpose-built browser sweep to see it: on the founder's
 * own phone held SIDEWAYS, the right-hand arc's stations were painted INSIDE the
 * notification column, so
 *
 *     «Мигач надясно» ⇨ [707, 88, 44×44]  sat under «Разбрах» [704.9, 70.3,
 *        76.1×44] — 1 157 px² of hit-box overlap, and elementFromPoint at the
 *        indicator's own centre returned the dismiss button. A THUMB AIMED AT
 *        THE RIGHT INDICATOR PRESSED «РАЗБРАХ», on a driving screen.
 *     «Контроли на автомобила» ⚙ [747, 44, 44×44] — its centre returned the
 *        card's own sentence, so the settings button was dead while any line
 *        was speaking.
 *     «🎬 Демонстрация ▸» × «Клаксон — задръж» = 1 861 px², the largest overlap
 *        on the screen, reported by no lane at all.
 *
 * WHY A UNIT TEST AND NOT ONLY A BROWSER SWEEP. Every lane that looked at this
 * screen reported „0 controls painted over", and that summary was true of the
 * check it came from and false about the screen. The lengths that decide this
 * geometry were CSS strings, so nothing in the repo could evaluate them and the
 * only instrument that could was a browser somebody had to think to point at
 * it. TouchControls now states them ONCE as numbers, generates its CSS from
 * them and exports a resolver — the notifyColumn.ts device — so the ladder can
 * be swept here, on every commit, in 20 ms.
 *
 * WHAT THIS FILE CANNOT DO, stated so nobody mistakes it for the whole gate: it
 * resolves the arithmetic, not the layout. It cannot see a stylesheet that
 * moves a panel, a card whose text grew, or a `::before` on somebody else's
 * button. tools/mobile/stability-probe.mjs is still the instrument that looks
 * at the rendered page; this is the one that stops the arithmetic drifting
 * between two people who each measured once.
 * =============================================================================
 */

/**
 * THE LADDER, and it is the harness's own (tools/mobile/lib/devices.mjs) with
 * its REAL safe-area insets — Playwright's WebKit reports env() = 0, so the
 * profile has always had to supply the notch, and the two lists must agree or
 * this file is testing a phone nobody owns.
 */
const LADDER: { id: string; stage: StageBox }[] = [
  {
    id: "iphone16-portrait 393x852",
    stage: { width: 393, height: 852, insetTop: 0, insetRight: 0, insetBottom: 34, insetLeft: 0 },
  },
  {
    id: "iphone16-landscape 852x393",
    stage: { width: 852, height: 393, insetTop: 0, insetRight: 59, insetBottom: 21, insetLeft: 59 },
  },
  { id: "small-portrait 360x780", stage: { width: 360, height: 780 } },
  { id: "small-landscape 780x360", stage: { width: 780, height: 360 } },
  // Two the ladder does not carry, because a rule that only holds on four
  // numbers is a coincidence: a small tablet held both ways.
  { id: "tablet-portrait 768x1024", stage: { width: 768, height: 1024 } },
  { id: "tablet-landscape 1024x768", stage: { width: 1024, height: 768 } },
];

/** WCAG/HIG, and the number row C6 was closed on. */
const TOUCH_MIN_PX = 44;

/**
 * THE TALLEST CARD THE COMPACT COLUMN HAS EVER BEEN MEASURED AT — 106.3 px,
 * the three-line «ИНСТРУКЦИИ» briefing with its «ЗАЩО» and «РАЗБРАХ» row, taken
 * in WebKit on 2026-08-10 at 852×393 and 780×360 with the real insets emulated.
 *
 * It is a MEASUREMENT and it is used two ways below: as the height the column
 * occupies when the arc has to clear it, and as the floor the column's own cap
 * may never fall under. The second is the one that matters — a cap below this
 * clips an authored sentence, and a card that names a graded mistake and cannot
 * print the WHY is what THEO-4 forbids. It has happened once already
 * (PlayAreaStyles, 2026-08-09: the card rendered „ЗАЩО" and nothing else).
 */
const MEASURED_WORST_CARD_PX = 106.3;

/** The compact column's own top offset — NOTIFY_COLUMN_TOP_CSS_COMPACT. */
const COLUMN_TOP_PX = 8;

function overlap(a: StageRect, b: StageRect): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

/** Where the compact notification column lands, at its measured worst height. */
function notifyColumnRect(stage: StageBox): StageRect {
  const width = notifyColumnWidthPx(stage.width, true);
  const right = NOTIFY_COLUMN_GUTTER_PX + (stage.insetRight ?? 0);
  return {
    x: stage.width - right - width,
    y: COLUMN_TOP_PX + (stage.insetTop ?? 0),
    w: width,
    h: MEASURED_WORST_CARD_PX,
  };
}

const SIDES = ["left", "right"] as const;
/**
 * THE FLANKS ARE NO LONGER THE SAME LENGTH — 2026-08-12, the control-system
 * rework. Two stations left (both indicators, on the founder's ruling) and
 * three right (the three graded mirror glances); pause, horn, the ⚙ sheet and
 * the camera left the flanks for the top rail. So the sweep asks each side how
 * many it has instead of assuming four, which is also what stops this file
 * from silently testing a station that is not rendered.
 */
const stations = (stage: StageBox) =>
  SIDES.flatMap((side) =>
    Array.from({ length: arcStationCount(side) }, (_, i) => ({
      id: `${side}#${i}`,
      side,
      rect: arcStationRectPx(i, side, stage),
    })),
  );

describe("every station is a thumb target, on every device in the ladder", () => {
  it("is exactly 44 x 44 and never leaves the stage", () => {
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      for (const s of stations(stage)) {
        if (s.rect.w < TOUCH_MIN_PX || s.rect.h < TOUCH_MIN_PX) {
          bad.push(`${id} ${s.id} is ${s.rect.w}x${s.rect.h}`);
        }
        if (
          s.rect.x < 0 ||
          s.rect.y < 0 ||
          s.rect.x + s.rect.w > stage.width ||
          s.rect.y + s.rect.h > stage.height
        ) {
          bad.push(`${id} ${s.id} is off the stage at ${JSON.stringify(s.rect)}`);
        }
      }
    }
    // Row C6 was closed on „0 controls under 44 px on any dashboard route" and
    // he rejected shrinking explicitly. Row C1 is not allowed to pay with it.
    expect(bad).toEqual([]);
  });
});

describe("nothing on this screen is under anything else on this screen", () => {
  it("no two stations overlap — the RUN is what guarantees it", () => {
    // Consecutive stations are exactly one box-width apart horizontally, so
    // they touch and never cross however flat the rise becomes. That is the
    // whole reason the rise is free to follow the stage; if someone shrinks
    // ARC_RUN_STEP_PX below 44 to „tighten" the arc, this is what fails.
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      const all = stations(stage);
      for (let a = 0; a < all.length; a += 1) {
        for (let b = a + 1; b < all.length; b += 1) {
          const px2 = overlap(all[a].rect, all[b].rect);
          if (px2 > 0) bad.push(`${id} ${all[a].id} x ${all[b].id} = ${Math.round(px2)} px²`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("no station is swallowed by the pad it measures from", () => {
    // A thumb-down on a station that overlaps a pad starts a steering or
    // throttle gesture instead. Station 0 sits exactly ON the pad's top edge,
    // which is a touch, not an overlap.
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      for (const s of stations(stage)) {
        for (const side of SIDES) {
          const px2 = overlap(s.rect, padRectPx(side, stage));
          if (px2 > 0) bad.push(`${id} ${s.id} x ${side} pad = ${Math.round(px2)} px²`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * THE ROW. The column's left edge may never come left of 0.60 of the width —
   * that is notifyColumn.ts's contract and his own drawing, and it is read
   * here, never restated. So the arc is what has to be clear of it.
   */
  it("no station enters the notification column", () => {
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      const column = notifyColumnRect(stage);
      for (const s of stations(stage)) {
        const px2 = overlap(s.rect, column);
        if (px2 > 0) bad.push(`${id} ${s.id} x notify-column = ${Math.round(px2)} px²`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("and it did not pass by accident: the OLD arc fails this same check", () => {
    // A negative control, because a green from a check nobody has seen fire is
    // not evidence. The arc this row replaced was `bottom = padH + 44·k`, i.e.
    // a 132 px climb, with the run as a sine bulge of 80 px.
    const stage = LADDER[1].stage; // the founder's phone, sideways
    const padH = Math.min(152, stage.height * 0.44);
    const oldSin = [1, 0.866, 0.5, 0];
    const column = notifyColumnRect(stage);
    const old = (k: number): StageRect => ({
      x: stage.width - (2 + 80 * oldSin[k] + (stage.insetRight ?? 0)) - TOUCH_MIN_PX,
      y: stage.height - (padH + 44 * k + (stage.insetBottom ?? 0)) - TOUCH_MIN_PX,
      w: TOUCH_MIN_PX,
      h: TOUCH_MIN_PX,
    });

    // Station 2 is «Мигач надясно» — the right indicator, the control the row
    // is named for. 1 157 px² here, and 1 157 px² measured in WebKit against
    // «Разбрах» itself, which is the whole width of the card's button row.
    expect(old(2)).toEqual({ x: 707, y: 88, w: 44, h: 44 });
    expect(Math.round(overlap(old(2), column))).toBe(1157);

    // Station 3 is ⚙. 1 496 px² against the column as a box; in the rendered
    // page its centre landed on the card's SENTENCE, which is not a control, so
    // the browser sweep charged it only the 602 px² it shared with «Разбрах» —
    // and reported the button as OCCLUDED, which is the same defect measured
    // the other way.
    expect(old(3)).toEqual({ x: 747, y: 44, w: 44, h: 44 });
    expect(Math.round(overlap(old(3), column))).toBe(1496);

    // …and the two lower ones were always clear, which is why an arc that was
    // half wrong looked half right.
    expect(overlap(old(0), column)).toBe(0);
    expect(overlap(old(1), column)).toBe(0);
  });
});

describe("the control band leaves the column its authored sentence", () => {
  it("caps the compact column above 106.3 px on every device in the ladder", () => {
    // PlayAreaStyles: max-height = 100% − TOUCH_CONTROLS_FLOOR − column top.
    const tight: string[] = [];
    for (const { id, stage } of LADDER) {
      const cap = stage.height - touchControlsFloorPx(stage) - COLUMN_TOP_PX - (stage.insetTop ?? 0);
      if (cap < MEASURED_WORST_CARD_PX) tight.push(`${id} cap ${cap.toFixed(1)} px`);
    }
    expect(tight).toEqual([]);
  });

  it("the smallest phone in the ladder is the one that sets the rise floor", () => {
    // Stated as a number so „just make the arc taller" cannot land quietly:
    // 780 x 360 has 116 px of column above the band and 106.3 px of card.
    const small = LADDER[3].stage;
    expect(arcRisePx(small.height)).toBe(20);
    expect(small.height - touchControlsFloorPx(small) - COLUMN_TOP_PX).toBe(116);
  });

  it("portrait keeps the founder's full climb — nothing was paid for there", () => {
    // The first attempt at this row flattened both orientations with one
    // percentage and pushed the pause glyph onto the speedometer, on the
    // orientation that had no collision. Both portraits are at the ceiling.
    expect(arcRisePx(852)).toBe(132);
    expect(arcRisePx(780)).toBe(132);
    // …and both landscape phones are at the floor.
    expect(arcRisePx(393)).toBe(20.5);
    expect(arcRisePx(360)).toBe(20);
  });
});

describe("the shipped CSS is generated from the same numbers", () => {
  it("TOUCH_CONTROLS_FLOOR spells what touchControlsFloorPx computes", () => {
    // The failure this closes: a hand-edited CSS string that no longer matches
    // the resolver, so the sweep above stays green while the phone does not.
    // 152 px pad (9.5rem) + the rise + a 44 px station (2.75rem) + the inset +
    // a 1.25 rem gap.
    expect(TOUCH_CONTROLS_FLOOR).toContain("min(44%, 9.5rem)");
    expect(TOUCH_CONTROLS_FLOOR).toContain("clamp(1.25rem, (100% - 22rem) * 0.5, 8.25rem)");
    expect(TOUCH_CONTROLS_FLOOR).toContain("2.75rem");
    expect(TOUCH_CONTROLS_FLOOR).toContain("env(safe-area-inset-bottom, 0px)");
    // The gap is 1.25 rem and not 0.5 rem, and that is the whole of the
    // 1 861 px² deck-on-the-horn overlap: the demonstration toggle carries a
    // 0.75 rem ::before on each side (row C2), so its real edge is 12 px past
    // the box this floor measures against.
    expect(TOUCH_CONTROLS_FLOOR).toContain("1.25rem");
    expect(TOUCH_CONTROLS_FLOOR).not.toContain("0.5rem");
  });

  it("resolves to the numbers measured in WebKit on the founder's phone", () => {
    // iPhone 16 landscape, real insets, sc-zebra-approach@L1.
    //
    // THE THREE MIRROR GLANCES NOW OCCUPY THE THREE STATIONS THE RIGHT FLANK
    // HAS, and they land on the same three x's the old four-station arc put its
    // top three on — the run step is the box's own width either way, so the
    // curve did not move, it lost its innermost station. What changed is WHAT
    // is standing on them: «Клаксон», «Мигач надясно» and ⚙ went to the top
    // rail, where no thumb rests.
    const stage = LADDER[1].stage;
    const rightMirror = arcStationRectPx(0, "right", stage); // Д
    expect(rightMirror.x).toBe(659);
    expect(rightMirror.y).toBe(176);
    const rearMirror = arcStationRectPx(1, "right", stage); // З
    expect(rearMirror.x).toBe(703);
    expect(rearMirror.y).toBeCloseTo(161.5, 1);
    const leftMirror = arcStationRectPx(2, "right", stage); // Л
    expect(leftMirror.x).toBe(747);
    expect(leftMirror.y).toBeCloseTo(155.5, 1);

    // …and the two indicators are on the STEERING flank, which is the founder's
    // ruling: signalling right used to cost the accelerator thumb.
    const left = arcStationRectPx(0, "left", stage); // ⇦
    expect(left.x).toBe(105);
    expect(left.y).toBe(192);
    const right = arcStationRectPx(1, "left", stage); // ⇨
    expect(right.x).toBe(61);
    expect(right.y).toBeCloseTo(171.5, 1);
  });

  it("the flanks carry the five side-of-the-car controls and nothing else", () => {
    // Stated as a number so „just add one more station" cannot land quietly:
    // the band this file sweeps is what it is because five controls are on it.
    expect(ARC_STATIONS_LEFT).toBe(2);
    expect(ARC_STATIONS_RIGHT).toBe(3);
  });
});

/**
 * =============================================================================
 * THE TWO CORRIDORS THE REWORK CREATED — 2026-08-12.
 *
 * Both are places a NON-CONTROL is told to live, and both are checked here for
 * the same reason the arc is: they are CSS `min()` expressions that only a
 * browser could evaluate, and the browser only ever gets asked after somebody
 * suspects the answer. The measured defects they close are in doc 91 and in the
 * phone sweep: a line of the drive pad's own teaching text across «Клаксон» and
 * both mirror glances (733 / 355 / 197 px², every landscape profile), and the
 * «50» limit disc on the steering pad (397–457 px², every portrait profile).
 * =============================================================================
 */
describe("the top rail never reaches the notification column", () => {
  it("stops short of 0.60 of the width on every device in the ladder", () => {
    // notifyColumn.ts owns that contract as arithmetic; this reads it rather
    // than restating it, so a wider column moves the rail instead of hiding
    // under it.
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      const rail = topRailBandPx(stage);
      if (rail.w < TOUCH_MIN_PX) bad.push(`${id} rail band is only ${rail.w.toFixed(1)} px wide`);
      if (rail.x + rail.w > rail.columnLeftPx) {
        bad.push(`${id} rail reaches ${rail.x + rail.w} past the column at ${rail.columnLeftPx}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the narrowest phone still fits three 44 px cells across", () => {
    // 360 px portrait is the floor of the ladder. Below three the rail folds to
    // four rows and starts eating the top of the picture.
    const small = LADDER[2].stage;
    expect(topRailBandPx(small).w).toBeGreaterThanOrEqual(3 * TOUCH_MIN_PX);
  });
});

describe("the corridor between the two thumb pads is real on every profile", () => {
  it("is wide enough for the instrument readout it now has to hold", () => {
    // PORTRAIT is the binding case and it is the tightest thing in this file:
    // the two pads are 42 % and 36 % of the width, so the corridor is ~63 px on
    // a 360 and the speed digit the founder signed off as legible is 30 px —
    // about 55 px for „132". 56 is that number, and it is the floor.
    const NEEDED_PX = 56;
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      const corridor = padCorridorPx(stage);
      if (corridor.w < NEEDED_PX) bad.push(`${id} corridor is ${corridor.w.toFixed(1)} px`);
    }
    expect(bad).toEqual([]);
  });

  it("no station and no pad is inside it", () => {
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      const c = padCorridorPx(stage);
      const corridor: StageRect = { x: c.x, y: 0, w: c.w, h: stage.height };
      for (const side of SIDES) {
        if (overlap(corridor, padRectPx(side, stage)) > 0) bad.push(`${id} ${side} pad`);
      }
      for (const s of stations(stage)) {
        if (overlap(corridor, s.rect) > 0) bad.push(`${id} ${s.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * =============================================================================
 * THE PAD HAS TO BE BIG ENOUGH FOR THE AXIS THAT LIVES ON IT — 2026-08-11.
 *
 * The drivetrain axis became ABSOLUTE on the founder's ruling („up is forward,
 * middle is stop, down is backwards"), and an absolute control is bounded by
 * its own box in a way a relative drag never was: full throttle is
 * TOUCH_DRIVE_ABSOLUTE_RANGE_PX ABOVE the pad's centre and full brake the same
 * distance below it, so a pad shorter than twice that range cannot reach one
 * end of its own travel. Nothing on screen would look wrong; the student would
 * simply never get 100 % of the brake, on some phones and not others.
 *
 * That is exactly the class of defect this file exists for — CSS arithmetic
 * that only a browser could evaluate and only if someone thought to look — so
 * the floor is swept here with the pads, on every device in the ladder.
 * =============================================================================
 */
describe("the drivetrain pad is tall enough for an absolute axis", () => {
  const NEEDED = TOUCH_DRIVE_ABSOLUTE_RANGE_PX * 2;

  for (const { id, stage } of LADDER) {
    it(`${id}: the pad holds the full ±${TOUCH_DRIVE_ABSOLUTE_RANGE_PX} px of travel`, () => {
      const pad = padRectPx("right", stage);
      expect(pad.h).toBeGreaterThanOrEqual(NEEDED);
    });
  }

  it("the neutral band is the same 44 px target every other control gets", () => {
    expect(TOUCH_DRIVE_NEUTRAL_HALF_PX * 2).toBe(TOUCH_MIN_PX);
  });
});
