import { describe, expect, it } from "vitest";
import {
  arcLiftPx,
  arcPitchPx,
  arcRisePx,
  arcStationCount,
  arcStationRectPx,
  ARC_STATIONS_LEFT,
  ARC_STATIONS_RIGHT,
  FLANK_LANE_PX,
  notifyColumnFloorPx,
  padCorridorPx,
  padRectPx,
  topRailBandPx,
  touchControlsFloorPx,
  TOUCH_BAND_CSS_VARS,
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

/**
 * Where the compact notification column lands, at its measured worst height.
 *
 * SIDEWAYS IT GIVES THE BAND ITS LANE BACK — 2026-08-14, „FIX · FLANKS", and
 * this is the arithmetic PlayAreaStyles ships: `right` grows by FLANK_LANE_PX
 * and `width` loses the same 60 px, so the box's LEFT edge does not move and
 * `notifyColumnLeftFraction`'s 0.60 contract reads exactly what it read before.
 * Upright the column keeps its full 141 px — 141 − 60 is not a card — and the
 * separation is bought with height instead (`notifyColumnFloorPx`).
 */
function notifyColumnRect(stage: StageBox): StageRect {
  const lane = stage.height >= stage.width ? 0 : FLANK_LANE_PX;
  const width = notifyColumnWidthPx(stage.width, true) - lane;
  const right = NOTIFY_COLUMN_GUTTER_PX + lane + (stage.insetRight ?? 0);
  return {
    x: stage.width - right - width,
    y: COLUMN_TOP_PX + (stage.insetTop ?? 0),
    w: width,
    h: stage.height >= stage.width
      ? MEASURED_WORST_CARD_PX
      : // Sideways the column may now reach its whole cap, which is the point
        // of the new floor — so the sweep charges it the full box rather than
        // the 106.3 px card, or it would be testing a column that cannot
        // happen. 192 px on the founder's phone.
        stage.height - notifyColumnFloorPx(stage) - COLUMN_TOP_PX - (stage.insetTop ?? 0),
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
  it("no two stations overlap — the PITCH is what guarantees it", () => {
    // Consecutive stations are exactly one box-height apart VERTICALLY, so they
    // touch and never cross. The run used to carry this and that is precisely
    // why the flanks were diagonals; if someone shrinks ARC_PITCH_PX below 44
    // to „tighten" the band, this is what fails.
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
    // THE COLUMN AS IT WAS THEN, spelled out rather than read from the helper.
    // `notifyColumnRect` now models the lane the column gives back sideways, so
    // reading it here would score the 2026-08-10 arc against a 2026-08-14
    // column and the two numbers below would drift for a reason that has
    // nothing to do with the defect they record.
    const column: StageRect = {
      x: stage.width - (NOTIFY_COLUMN_GUTTER_PX + (stage.insetRight ?? 0)) - notifyColumnWidthPx(stage.width, true),
      y: COLUMN_TOP_PX + (stage.insetTop ?? 0),
      w: notifyColumnWidthPx(stage.width, true),
      h: MEASURED_WORST_CARD_PX,
    };
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
    // PlayAreaStyles: max-height = 100% − notifyColumnFloorPx − column top.
    // The floor is the COLUMN'S OWN since „FIX · FLANKS" — see the block on
    // notifyColumnFloorCss. It goes UP sideways (the lanes are disjoint, so the
    // column no longer has to clear the band's height) and down upright, where
    // it was never binding.
    const tight: string[] = [];
    for (const { id, stage } of LADDER) {
      const cap = stage.height - notifyColumnFloorPx(stage) - COLUMN_TOP_PX - (stage.insetTop ?? 0);
      if (cap < MEASURED_WORST_CARD_PX) tight.push(`${id} cap ${cap.toFixed(1)} px`);
    }
    expect(tight).toEqual([]);
  });

  it("the card GAINS room sideways out of this wave, and loses none upright", () => {
    // Stated as numbers so „the flanks got fixed and the card got worse" cannot
    // be true silently. Sideways is the orientation people drive in and the one
    // where the card was measured hiding 333 px of its own body.
    const cap = (stage: StageBox) =>
      stage.height - notifyColumnFloorPx(stage) - COLUMN_TOP_PX - (stage.insetTop ?? 0);
    const iphoneL = LADDER[1].stage;
    const smallL = LADDER[3].stage;
    expect(cap(iphoneL)).toBe(192); // was 127.5 under TOUCH_CONTROLS_FLOOR
    expect(cap(smallL)).toBe(180); // was 116
    // …and the area, which is what a sentence actually needs: the column gives
    // 60 px of width to the lane and gets 64 px of height back.
    const area = (stage: StageBox) => {
      const r = notifyColumnRect(stage);
      return Math.round(r.w * r.h);
    };
    expect(area(iphoneL)).toBe(180 * 192);
    expect(area(iphoneL)).toBeGreaterThan(240 * 127.5);
    // Upright the cap drops from 403 to 330 and the measured card is ~205 px,
    // so nothing that ships is clipped by it.
    expect(cap(LADDER[0].stage)).toBe(330);
    expect(cap(LADDER[0].stage)).toBeGreaterThan(MEASURED_WORST_CARD_PX * 2);
  });

  it("TOUCH_CONTROLS_FLOOR did NOT move — every other surface stands still", () => {
    // The whole reason the column got its own floor: this one is spelled into
    // the ⚙ sheet, the demonstration deck, the minimap, the trace timeline and
    // the rotate hint, and none of those is what this wave is about. A floor
    // that cleared the new band would be 369 px of a 393 px landscape stage,
    // i.e. all five pushed off the top of the screen.
    expect(touchControlsFloorPx(LADDER[1].stage)).toBe(257);
    expect(arcRisePx(LADDER[3].stage)).toBe(20);
    expect(LADDER[3].stage.height - touchControlsFloorPx(LADDER[3].stage) - COLUMN_TOP_PX).toBe(116);
  });

  it("the band's climb is a PITCH now, and it is the same on both flanks", () => {
    // The first attempt at this row shared ONE total climb between the flanks,
    // so 132 px gave the three-station side a 66 px pitch and the four-station
    // side 44 — two different-looking rails from one number. A band is built
    // out of a step, not out of a total.
    for (const { stage } of LADDER) expect(arcPitchPx(stage)).toBe(44);
    // …and the LIFT is where portrait gets its own arithmetic: zero sideways,
    // 132 px upright, because upright the pads alone leave the band on the
    // dashboard (the cowl starts at 0.663 of the portrait frame).
    expect(arcLiftPx({ width: 852, height: 393 })).toBe(0);
    expect(arcLiftPx({ width: 780, height: 360 })).toBe(0);
    expect(arcLiftPx({ width: 393, height: 852 })).toBe(132);
    expect(arcLiftPx({ width: 360, height: 780 })).toBe(132);
  });

  it("upright, every station clears the cockpit's own cowl", () => {
    // „the LEFT flank is on the dashboard rather than beside the road."
    // The cowl's top edge sits at 0.663 of the portrait frame's height — the
    // shipped camera, both portrait profiles within 0.0002 of the same aspect —
    // so a station is „beside the road" when its BOTTOM edge is above that.
    const COWL_FRACTION = 0.663;
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      // PHONE portrait only. The fraction is a property of the shipped camera
      // at the two portrait PHONE aspects (0.4613 and 0.4615); a tablet held
      // upright is 0.75 and frames the cockpit differently, so asserting a
      // phone's cowl line there would be measuring nothing.
      if (stage.height < stage.width || stage.width > 420) continue;
      const cowlY = stage.height * COWL_FRACTION;
      for (const s of stations(stage)) {
        if (s.rect.y + s.rect.h > cowlY) {
          bad.push(`${id} ${s.id} bottom ${s.rect.y + s.rect.h} > cowl ${cowlY.toFixed(0)}`);
        }
      }
    }
    expect(bad).toEqual([]);

    // …and it did not pass by accident: the lift is what does it. At lift 0 the
    // left flank is where the founder photographed it — on the dashboard, with
    // «⇨ Дясн» across the speedometer's «120».
    const p = LADDER[0].stage;
    const withoutLift = p.height - (136 + (p.insetBottom ?? 0)) - TOUCH_MIN_PX;
    expect(withoutLift).toBe(638);
    expect(withoutLift + TOUCH_MIN_PX).toBeGreaterThan(p.height * COWL_FRACTION);
  });
});

/**
 * =============================================================================
 * DEFECT 1 — THE ARC RESHAPED UNDER HIS THUMB WHILE HE DROVE. doc 91 §N1 calls
 * it „THE MOST IMPORTANT OMISSION IN §I"; it was reproduced 6/6 and never fixed.
 *
 * Safari's URL bar sliding changes the viewport height, and every length on this
 * screen was derived from that height:
 *
 *     ARC_RISE = clamp(1.25rem, (100% − 22rem) × 0.5, 8.25rem)
 *     pad      = min(44 % of the stage, 9.5rem)
 *
 * Measured with CDP on his own dimensions (402 px of landscape stage, the only
 * device in the set inside the clamp's varying band): the indicator gap
 * compressed 25 → 20 px and the mirror gap 18 → 14 px the first time the bar
 * moved, and on the ladder's profiles the drive pad shrank 152 → 139 → 119.
 *
 * THE FIX IS NOT A NEW CLAMP — a control whose geometry is a function of browser
 * chrome is wrong however the arithmetic is tuned. So: constants, chosen by an
 * ORIENTATION media query, measured upward from the bottom edge. This block is
 * the proof, and it is the shape of the defect: sweep the stage height the way
 * the URL bar does and assert that NOTHING MOVES.
 * =============================================================================
 */
describe("defect 1 · nothing on this screen is a function of the viewport height", () => {
  /** The three heights a sliding URL bar puts a stage at (§N1's own sweep). */
  const SWEEP = [0, -44, -90];

  for (const { id, stage } of LADDER) {
    it(`${id}: every control keeps its rect through a 90 px sweep`, () => {
      const moved: string[] = [];
      for (const delta of SWEEP.slice(1)) {
        const swept: StageBox = { ...stage, height: stage.height + delta };
        // Everything is anchored to the BOTTOM edge, so a shorter stage moves
        // the whole band up with the edge — by exactly `delta`, together. What
        // must never change is a control's SIZE or its distance from any other
        // control, which is what „it is not stabilized" was about.
        for (const side of SIDES) {
          const padRest = padRectPx(side, stage);
          const padSwept = padRectPx(side, swept);
          if (padRest.h !== padSwept.h) {
            moved.push(`${side} pad height ${padRest.h} → ${padSwept.h} at ${delta}`);
          }
          if (padRest.y - padSwept.y !== -delta) {
            moved.push(`${side} pad moved ${padSwept.y - padRest.y} instead of ${delta}`);
          }
          const count = arcStationCount(side);
          for (let i = 1; i < count; i += 1) {
            const gapRest =
              arcStationRectPx(i - 1, side, stage).y - arcStationRectPx(i, side, stage).y;
            const gapSwept =
              arcStationRectPx(i - 1, side, swept).y - arcStationRectPx(i, side, swept).y;
            if (gapRest !== gapSwept) {
              moved.push(`${side} gap ${i - 1}→${i} ${gapRest} → ${gapSwept} at ${delta}`);
            }
            const runRest =
              arcStationRectPx(i, side, stage).x - arcStationRectPx(i - 1, side, stage).x;
            const runSwept =
              arcStationRectPx(i, side, swept).x - arcStationRectPx(i - 1, side, swept).x;
            if (runRest !== runSwept) {
              moved.push(`${side} run ${i - 1}→${i} ${runRest} → ${runSwept} at ${delta}`);
            }
          }
        }
      }
      expect(moved).toEqual([]);
    });
  }

  it("and it did not pass by accident: the OLD arithmetic fails this same sweep", () => {
    // A negative control. Without one, „nothing moved" is indistinguishable
    // from „nothing was measured" — and this project has shipped that summary
    // before. These are the two expressions this wave deleted, evaluated on his
    // own 874 x 402 landscape stage.
    const oldRise = (h: number) => Math.min(132, Math.max(20, (h - 352) * 0.5));
    const oldPad = (h: number) => Math.min(152, h * 0.44);
    const oldSin = (i: number, n: number) => Math.sin((i / (n - 1)) * (Math.PI / 2));

    // THE RISE. 402 → 25, and the first 44 px of URL bar takes it to the floor.
    expect(oldRise(402)).toBe(25);
    expect(oldRise(402 - 44)).toBe(20);
    // …which is the measured 25 → 20 px indicator gap, at two stations.
    expect(oldRise(402) * oldSin(1, 2) - oldRise(358) * oldSin(1, 2)).toBe(5);

    // THE PAD. Stable until the bar has taken 57 px, then it shrinks under the
    // thumb — 15 px on his phone, 33 px on the 360 px Androids.
    expect(oldPad(402)).toBe(152);
    expect(Math.round(oldPad(402 - 90))).toBe(137);
    expect(Math.round(oldPad(360 - 90))).toBe(119);

    // …and the same three numbers under what ships now: flat, on both.
    expect(arcRisePx({ width: 874, height: 402 })).toBe(
      arcRisePx({ width: 874, height: 402 - 90 }),
    );
    expect(padRectPx("right", { width: 874, height: 402 }).h).toBe(
      padRectPx("right", { width: 874, height: 402 - 90 }).h,
    );
  });

  it("the discriminator is an ORIENTATION, which a URL bar cannot flip", () => {
    // Stated because the obvious cheap fix — a media query on HEIGHT — is the
    // same defect in a step function, AND it would be invisible to the harness,
    // which sweeps the viewport height exactly the way the URL bar does. His
    // landscape stage is 402 px and portrait 874; neither crosses the other's
    // side of `orientation` under any sweep this side of the 240 px collapse.
    for (const delta of SWEEP) {
      expect(arcRisePx({ width: 874, height: 402 + delta })).toBe(20);
      expect(arcRisePx({ width: 402, height: 874 + delta })).toBe(132);
      expect(arcLiftPx({ width: 874, height: 402 + delta })).toBe(0);
      expect(arcLiftPx({ width: 402, height: 874 + delta })).toBe(132);
      // …and the pitch is the same number on both sides of the query, which is
      // what makes the two bands read as one system.
      expect(arcPitchPx({ width: 874, height: 402 + delta })).toBe(44);
      expect(arcPitchPx({ width: 402, height: 874 + delta })).toBe(44);
    }
  });

  it("the CSS says the same thing as the arithmetic, in a media query", () => {
    // The two must be generated from one set of numbers or the sweep above
    // stays green while the phone does not — the notifyColumn.ts device.
    expect(TOUCH_BAND_CSS_VARS).toContain("--sim-arc-rise: 8.25rem");
    expect(TOUCH_BAND_CSS_VARS).toContain("--sim-arc-lift: 8.25rem");
    expect(TOUCH_BAND_CSS_VARS).toContain("--sim-column-floor: 30rem");
    expect(TOUCH_BAND_CSS_VARS).toContain("@media (orientation: landscape)");
    expect(TOUCH_BAND_CSS_VARS).toContain("--sim-arc-rise: 1.25rem");
    expect(TOUCH_BAND_CSS_VARS).toContain("--sim-arc-lift: 0rem");
    expect(TOUCH_BAND_CSS_VARS).toContain("--sim-column-floor: 10.75rem");
    // THE RUN IS GONE FROM THE STYLESHEET, not merely set to zero: a variable
    // nothing reads is a variable somebody re-wires by accident.
    expect(TOUCH_BAND_CSS_VARS).not.toContain("--sim-arc-run");
    // The pitch is ONE value with no media query over it — 44 px, both
    // orientations, both flanks. That is the separation guarantee.
    expect(TOUCH_BAND_CSS_VARS).toContain("--sim-arc-pitch: 2.75rem");
    expect(TOUCH_BAND_CSS_VARS.match(/--sim-arc-pitch/g)).toHaveLength(1);
    // …and the clamp against the live stage that caused the defect is gone.
    expect(TOUCH_CONTROLS_FLOOR).not.toContain("clamp(");
    // The two terms that WERE functions of the stage height now read through
    // the variables above. The one `100%` left in this length is the band lift
    // (`100% − svh`), which is the opposite thing: it exists to hold the band
    // still against the small viewport when the chrome slides away.
    expect(TOUCH_CONTROLS_FLOOR).toContain("var(--sim-pad-drive-h");
    expect(TOUCH_CONTROLS_FLOOR).toContain("var(--sim-arc-rise");
    expect(TOUCH_CONTROLS_FLOOR).not.toContain("* 0.44");
    expect(TOUCH_CONTROLS_FLOOR).not.toContain("min(44%");
  });

  it("the rise term divides rather than multiplying a rounded literal", () => {
    // 132 × 0.3333 = 43.9956, which is 0.0044 px INSIDE the neighbour it has to
    // clear — and upright the vertical gap is the whole separation guarantee,
    // because the run is only 24 px there. A four-decimal literal would make
    // this file's central invariant false by a rounding artefact, silently, on
    // the orientation with the least margin. So the CSS divides.
    const portrait: StageBox = { width: 393, height: 852 };
    const gaps: number[] = [];
    for (let i = 1; i < arcStationCount("right"); i += 1) {
      gaps.push(
        arcStationRectPx(i - 1, "right", portrait).y -
          arcStationRectPx(i, "right", portrait).y,
      );
    }
    expect(gaps).toEqual([44, 44, 44]);
  });
});

/**
 * =============================================================================
 * THE SEPARATION RULE — what lets a flank carry FOUR stations on a 360 px phone.
 *
 * Two 44 px boxes cannot overlap if they are 44 px apart in EITHER axis. The old
 * arc put that guarantee entirely in the RUN, at one box-width per station, and
 * that is why four a side was „178 + 178 = 356 px against 360" — the 4 px
 * corridor this file's own history warns about. It is also why the sine had to
 * go: it decelerated, so the top pair was 17.7 px apart in portrait and the
 * „44 px in either axis" claim was only ever true of the widest pair.
 * =============================================================================
 */
describe("the separation rule holds on every flank of every device", () => {
  it("consecutive stations clear 44 px in at least one axis", () => {
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      for (const side of SIDES) {
        const count = arcStationCount(side);
        for (let i = 1; i < count; i += 1) {
          const a = arcStationRectPx(i - 1, side, stage);
          const b = arcStationRectPx(i, side, stage);
          const dx = Math.abs(a.x - b.x);
          const dy = Math.abs(a.y - b.y);
          if (dx < TOUCH_MIN_PX && dy < TOUCH_MIN_PX) {
            bad.push(`${id} ${side}#${i - 1}→#${i}: dx ${dx} dy ${dy.toFixed(1)}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * THE ROW THIS WAVE EXISTS FOR. „strung DIAGONALLY ACROSS THE ROAD … at three
   * different depths, rather than grouped in a readable arc."
   *
   * A BAND IS A COLUMN OF BOXES AT ONE DEPTH. That is not a description, it is
   * a number: the spread between the furthest-in and the furthest-out station
   * on a flank. It was 88 px on the steering flank and 132 px on the throttle
   * one sideways, 48 and 72 upright — measured on the deployed build, six
   * profiles, `tools/mobile/.out/wave12-flanks/before.json`.
   */
  it("every station on a flank is at the SAME depth — insetSpread is 0", () => {
    const bad: string[] = [];
    for (const { id, stage } of LADDER) {
      for (const side of SIDES) {
        const insets = Array.from({ length: arcStationCount(side) }, (_, i) => {
          const r = arcStationRectPx(i, side, stage);
          return side === "left" ? r.x : stage.width - (r.x + r.w);
        });
        const spread = Math.max(...insets) - Math.min(...insets);
        if (spread !== 0) bad.push(`${id} ${side} spread ${spread} px — insets ${insets.join(",")}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("…and it did not pass by accident: the OLD run fails this same check", () => {
    // A negative control, because a green from a check nobody has seen fire is
    // not evidence. The layout this replaced stepped one box-width inboard per
    // station sideways and 24 px upright.
    const oldInset = (stage: StageBox, side: "left" | "right", k: number) =>
      8 + (stage.height >= stage.width ? 24 : 44) * (arcStationCount(side) - 1 - k);
    for (const stage of [LADDER[1].stage, LADDER[0].stage]) {
      for (const side of SIDES) {
        const n = arcStationCount(side);
        const insets = Array.from({ length: n }, (_, i) => oldInset(stage, side, i));
        expect(Math.max(...insets) - Math.min(...insets)).toBeGreaterThan(0);
      }
    }
    // The exact numbers off the deployed build, so this reads as the report and
    // not as a re-derivation: left 88 / right 132 sideways, 48 / 72 upright.
    expect(44 * (ARC_STATIONS_LEFT - 1)).toBe(88);
    expect(44 * (ARC_STATIONS_RIGHT - 1)).toBe(132);
    expect(24 * (ARC_STATIONS_LEFT - 1)).toBe(48);
    expect(24 * (ARC_STATIONS_RIGHT - 1)).toBe(72);
  });

  it("the two bands leave a corridor, and it is wider than the old flanks", () => {
    // A band is `edge + 44` wide, full stop — the station count no longer
    // widens it, which is the other half of deleting the run. Both flanks
    // together take 104 px of the narrowest phone in the ladder, against the
    // 212 px the run-based arithmetic took and the 356 px it took before that.
    const band = ARC_EDGE_FOR_TEST + TOUCH_MIN_PX;
    expect(band).toBe(52);
    expect(band * 2).toBe(104);
    for (const { id, stage } of LADDER) {
      const corridor = stage.width - band * 2 - (stage.insetLeft ?? 0) - (stage.insetRight ?? 0);
      expect(`${id} ${corridor}`).toBe(`${id} ${corridor}`);
      expect(corridor).toBeGreaterThan(200);
    }
  });
});

/** ARC_EDGE_PX is module-private; the ladder sweep above reads it off a rect. */
const ARC_EDGE_FOR_TEST = arcStationRectPx(0, "left", { width: 852, height: 393 }).x;

describe("the shipped CSS is generated from the same numbers", () => {
  it("TOUCH_CONTROLS_FLOOR spells what touchControlsFloorPx computes", () => {
    // The failure this closes: a hand-edited CSS string that no longer matches
    // the resolver, so the sweep above stays green while the phone does not.
    // 152 px pad (9.5rem) + the rise + a 44 px station (2.75rem) + the inset +
    // a 1.25 rem gap. The first two terms used to be a percentage and a clamp
    // against the live stage; they are constants now (defect 1).
    expect(TOUCH_CONTROLS_FLOOR).toContain("9.5rem");
    expect(TOUCH_CONTROLS_FLOOR).toContain("var(--sim-arc-rise, 8.25rem)");
    expect(TOUCH_CONTROLS_FLOOR).toContain("2.75rem");
    expect(TOUCH_CONTROLS_FLOOR).toContain("env(safe-area-inset-bottom, 0px)");
    // The gap is 1.25 rem and not 0.5 rem, and that is the whole of the
    // 1 861 px² deck-on-the-horn overlap: the demonstration toggle carries a
    // 0.75 rem ::before on each side (row C2), so its real edge is 12 px past
    // the box this floor measures against.
    expect(TOUCH_CONTROLS_FLOOR).toContain("1.25rem");
    expect(TOUCH_CONTROLS_FLOOR).not.toContain("0.5rem");
    // THE FALLBACK IS NOT COSMETIC. Consumers outside TouchControls spell this
    // length into surfaces that exist whether or not the overlay is mounted; a
    // bare `var(--sim-arc-rise)` with nothing declared makes the whole `calc()`
    // invalid and the declaration is dropped — the panel would land on the road.
    expect(TOUCH_CONTROLS_FLOOR).toMatch(/var\(--sim-arc-rise,\s*[^)]+\)/);
    expect(TOUCH_CONTROLS_FLOOR).toMatch(/var\(--sim-pad-drive-h,\s*[^)]+\)/);
  });

  it("resolves to the band the founder asked for, on his own phone", () => {
    // iPhone 16 landscape 852 × 393, real insets, sc-zebra-approach@L1 — the
    // frame he photographed. Every station on a flank shares an x; the y's step
    // by exactly 44. What was measured on the deployed build is in the comment
    // beside each one, so the two can be read against each other.
    const stage = LADDER[1].stage;
    const dock = arcStationRectPx(0, "right", stage); // ⚙ / КОЛАН   was [615,176]
    expect(dock).toEqual({ x: 741, y: 176, w: 44, h: 44 });
    const rightMirror = arcStationRectPx(1, "right", stage); // Д     was [659,169.3]
    expect(rightMirror).toEqual({ x: 741, y: 132, w: 44, h: 44 });
    const rearMirror = arcStationRectPx(2, "right", stage); // З      was [703,162.7]
    expect(rearMirror).toEqual({ x: 741, y: 88, w: 44, h: 44 });
    const leftMirror = arcStationRectPx(3, "right", stage); // Л      was [747,156]
    expect(leftMirror).toEqual({ x: 741, y: 44, w: 44, h: 44 });

    // …and the two indicators are on the STEERING flank, which is the founder's
    // ruling: signalling right used to cost the accelerator thumb. The horn
    // joined them at the top station — it is pressed while the car is MOVING.
    // The old x's were 149 / 105 / 61, i.e. the ⇦ label ended up to the RIGHT of
    // the ⇨ one and 88 px of road separated the two ends of the flank.
    const left = arcStationRectPx(0, "left", stage); // ⇦             was [149,192]
    expect(left).toEqual({ x: 67, y: 192, w: 44, h: 44 });
    const right = arcStationRectPx(1, "left", stage); // ⇨            was [105,182]
    expect(right).toEqual({ x: 67, y: 148, w: 44, h: 44 });
    const horn = arcStationRectPx(2, "left", stage); // ⊙             was [61,172]
    expect(horn).toEqual({ x: 67, y: 104, w: 44, h: 44 });
  });

  it("…and to a band beside the road on his phone held upright", () => {
    // 393 × 852, real insets. Everything here used to be on the dashboard: the
    // left flank ran y 506–682 against a cowl that starts at y ≈ 565, and
    // «⇨ Дясн» at [26,572] printed across the speedometer's «120».
    const stage = LADDER[0].stage;
    expect(arcStationRectPx(0, "left", stage)).toEqual({ x: 8, y: 506, w: 44, h: 44 });
    expect(arcStationRectPx(1, "left", stage)).toEqual({ x: 8, y: 462, w: 44, h: 44 });
    expect(arcStationRectPx(2, "left", stage)).toEqual({ x: 8, y: 418, w: 44, h: 44 });
    expect(arcStationRectPx(0, "right", stage)).toEqual({ x: 341, y: 490, w: 44, h: 44 });
    expect(arcStationRectPx(3, "right", stage)).toEqual({ x: 341, y: 358, w: 44, h: 44 });
    // The edge inset is 8 px and not 2: «Л ЛЯВО» ended 13.4 px from the glass,
    // which is what „hard against the right edge" measures as.
    expect(arcStationRectPx(3, "right", stage).x + 44).toBe(stage.width - 8);
  });

  it("the flanks carry the seven controls a moving car needs and nothing else", () => {
    // Stated as a number so „just add one more station" cannot land quietly:
    // the band this file sweeps is what it is because seven controls are on it.
    // LEFT  ⇦ ⇨ and the horn — the steering thumb's.
    // RIGHT the ⚙ dock (= the belt while it is off) and the three mirrors.
    expect(ARC_STATIONS_LEFT).toBe(3);
    expect(ARC_STATIONS_RIGHT).toBe(4);
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
