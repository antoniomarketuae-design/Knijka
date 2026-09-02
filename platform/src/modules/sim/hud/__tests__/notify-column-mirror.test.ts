import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  notifyColumnMaxHeightPx,
  notifyColumnMirrorLanePx,
  notifyColumnTopPx,
  MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE,
  MIRROR_BAND_BOTTOM_FRACTION_COMPACT_PORTRAIT,
  MIRROR_BAND_BOTTOM_FRACTION_ROOMY,
  MIRROR_BAND_LEFT_FRACTION,
  NOTIFY_COLUMN_MIRROR_GUTTER_PX,
  NOTIFY_COLUMN_TOP_CSS_COMPACT,
  NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
  NOTIFY_COLUMN_TOP_CSS_ROOMY,
} from "../notifyColumn";
// The judgement, not the layout — see `mirrorBand.ts`'s header for why it is
// here and not in the module the lengths ship from.
import { rectClearsMirrorBand } from "./mirrorBand";
import { OVERLAY_PEEK_HEIGHT_PX } from "../overlayQueue";
import { hotspotScreenRect } from "../../scene/vitok/cabinLook";
import { notifyColumnFloorPx } from "../../../../components/sim/TouchControls";
import { ROOMY_HUD_FLOOR_PX } from "../../../../components/sim/lesson-ui/immersive";

/**
 * =============================================================================
 * „THE HUD IS STANDING ON THE MIRROR" — 2026-08-17, the catalogue sweep.
 *
 * SIXTEEN findings were routed to `notifyColumn.ts`; eight of them are one
 * defect photographed eight times. The right-edge column starts 8 px from the
 * top of the stage and the cockpit's interior mirror is projected into exactly
 * that corner, so on every sideways phone the card's chip, its title and its
 * first authored line are printed on a live reflection — and the mirror, which
 * on `sc-park-van` is the entire subject of the lesson, is printed on too.
 *
 * WHY THIS FILE ASSERTS ARITHMETIC AND NOT A RENDER: the mirror lives inside
 * the WebGL canvas, so no DOM probe in this project can see it — which is the
 * reason the overlap survived every layout sweep that came before. What CAN be
 * asserted honestly from here is that the lane this module publishes is still
 * the one the shipped cockpit projection implies, and that the shipped `top`
 * lengths still clear it.
 *
 * EVERY MEASUREMENT BELOW CAME OFF THE DEPLOYED BUILD (sweep161, WebKit, real
 * insets, iPhone 16 landscape 852 × 393 at DPR 3) — the frames are named in
 * the block this file guards.
 * =============================================================================
 */

/** The stages the ladder actually serves, with the insets they really carry. */
const PHONES_LANDSCAPE = [
  { id: "iphone16 852×393", width: 852, height: 393, insetBottom: 21 },
  { id: "android 780×360", width: 780, height: 360, insetBottom: 0 },
  { id: "samsung gesture 780×340", width: 780, height: 340, insetBottom: 0 },
];
const PHONES_PORTRAIT = [
  { id: "iphone16 393×852", width: 393, height: 852, insetBottom: 34 },
  { id: "android 360×780", width: 360, height: 780, insetBottom: 0 },
];
/** …and the two desktop STAGES (the window less the shell's rail and toolbar). */
const DESKTOPS = [
  { id: "1264×619", width: 1264, height: 619 },
  { id: "1165×650 (the 1440×900 the drive harness renders)", width: 1165, height: 650 },
];

/** Where the mirror's own proxy box ends, straight off the shipped projection. */
const mirrorBottomFraction = (width: number, height: number): number => {
  const r = hotspotScreenRect("hotspot_mirror_rear", "forward", width / height);
  expect(r, "the cockpit projection has stopped answering for the interior mirror").not.toBeNull();
  return r!.bottom;
};

describe("the lane is derived from the cockpit, not chosen", () => {
  it("covers the mirror's floor on every landscape phone in the ladder", () => {
    // 0.1649 · 0.1651 · 0.1454 — the three sideways profiles in
    // tools/mobile/lib/devices.mjs. If the GLB node moves (it already moved
    // once, B58's 105 mm mirror-station raise), this is the line that says so
    // instead of the founder's screenshot.
    for (const p of PHONES_LANDSCAPE) {
      expect(
        MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE,
        `${p.id}: the published lane no longer reaches the mirror's floor`,
      ).toBeGreaterThanOrEqual(mirrorBottomFraction(p.width, p.height));
    }
    // …and it is not wildly generous either: the worst of the three is within
    // 2 % of the constant, or the peek is paying for clearance nobody needs.
    const worst = Math.max(...PHONES_LANDSCAPE.map((p) => mirrorBottomFraction(p.width, p.height)));
    expect(MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE - worst).toBeLessThan(0.02);
  });

  it("covers it on every desktop stage, and on the 16:9 the cockpit is authored at", () => {
    for (const d of [...DESKTOPS, { id: "16:9", width: 1280, height: 720 }]) {
      expect(
        MIRROR_BAND_BOTTOM_FRACTION_ROOMY,
        `${d.id}: the roomy lane no longer reaches the mirror's floor`,
      ).toBeGreaterThanOrEqual(mirrorBottomFraction(d.width, d.height));
    }
    // The stated coverage floor: aspect 1.70 is the squarest window this
    // number is claimed for, and the block in notifyColumn.ts says so.
    expect(MIRROR_BAND_BOTTOM_FRACTION_ROOMY).toBeGreaterThanOrEqual(
      mirrorBottomFraction(1700, 1000),
    );
  });

  it("…and the PORTRAIT number is the vFOV clamp's plateau, not a guess", () => {
    // `cockpitVFovForAspect` pins at COCKPIT_FOV_MAX (56°) below ~1.45:1, so
    // every upright phone reads the same fraction. It is published because a
    // portrait media query cannot be written without it — see the shortfall
    // test at the bottom of this file for what it does NOT yet claim.
    for (const p of PHONES_PORTRAIT) {
      expect(MIRROR_BAND_BOTTOM_FRACTION_COMPACT_PORTRAIT).toBeGreaterThanOrEqual(
        mirrorBottomFraction(p.width, p.height),
      );
    }
  });

  it("the mirror's LEFT edge is the projection's, so the other corridor is spared", () => {
    for (const p of [...PHONES_LANDSCAPE, ...DESKTOPS]) {
      const r = hotspotScreenRect("hotspot_mirror_rear", "forward", p.width / p.height);
      expect(MIRROR_BAND_LEFT_FRACTION, `${p.id}`).toBeLessThanOrEqual(r!.left + 1e-9);
    }
  });
});

describe("the predicate has teeth in both directions", () => {
  const IPHONE_L = { width: 852, height: 393 };

  it("REJECTS the column as it shipped this morning, ACCEPTS the one that clears", () => {
    // Measured on the deployed build, sc-ov-solid-line/mobile-right/01-arrival:
    // [data-hud="notify-column"] [541, 8, 180 × 161] against a mirror painted
    // [524, 0 → 707, 70]. This is the assertion that fails on the old geometry.
    expect(rectClearsMirrorBand({ x: 541, y: 8, width: 180 }, IPHONE_L, true)).toBe(false);
    // …and where `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN` puts it: 73.2 px.
    const top = notifyColumnTopPx(IPHONE_L, true);
    expect(rectClearsMirrorBand({ x: 541, y: top, width: 180 }, IPHONE_L, true)).toBe(true);
  });

  it("…and it is a real boundary, not a rule that credits everything below 8 px", () => {
    const lane = notifyColumnMirrorLanePx(IPHONE_L, true);
    expect(rectClearsMirrorBand({ x: 541, y: lane, width: 180 }, IPHONE_L, true)).toBe(true);
    expect(rectClearsMirrorBand({ x: 541, y: lane - 0.5, width: 180 }, IPHONE_L, true)).toBe(false);
  });

  it("SPARES the left corridor, and JUDGES anything that reaches into the band", () => {
    // «Меню» is [8, 8, 47.6 × 44] and the lesson-menu row beside it sits in the
    // same corner. Neither is anywhere near this mirror, and a rule stated as
    // „the top of the stage" rather than as a rect would drag both of them down
    // the picture to fix a box on the other side of the frame.
    expect(rectClearsMirrorBand({ x: 8, y: 8, width: 47.6 }, IPHONE_L, true)).toBe(true);
    expect(rectClearsMirrorBand({ x: 8, y: 8, width: 300 }, IPHONE_L, true)).toBe(true);
    // …and the case that is NOT excused, because it really is under the glass:
    // the open demonstration deck sideways lays out [123, 60, 410 × 58] on this
    // stage (`DECK_COMPACT_OPEN_LEFT_CSS` past «Меню» plus the 59 px notch),
    // so its right edge reaches 533 against a mirror that starts at 488. The
    // rule says so — and the answer is still not to move it: its own corridor
    // between the top rail and the control band is 83.5 px.
    expect(rectClearsMirrorBand({ x: 123, y: 60, width: 410 }, IPHONE_L, true)).toBe(false);
    // One pixel either side of the x boundary, so „judged" is a boundary and
    // not a coincidence of the numbers above.
    const edge = 852 * MIRROR_BAND_LEFT_FRACTION;
    expect(rectClearsMirrorBand({ x: 8, y: 8, width: edge - 8 }, IPHONE_L, true)).toBe(true);
    expect(rectClearsMirrorBand({ x: 8, y: 8, width: edge - 8 + 1 }, IPHONE_L, true)).toBe(false);
  });

  it("degrades to a safe answer on a nonsense stage", () => {
    expect(rectClearsMirrorBand({ x: 0, y: 0, width: 10 }, { width: 0, height: 0 }, true)).toBe(
      false,
    );
    expect(notifyColumnMirrorLanePx({ width: 0, height: 0 }, true)).toBe(0);
    expect(notifyColumnTopPx({ width: Number.NaN, height: Number.NaN }, false)).toBe(0);
  });
});

describe("the ROOMY top carries the lane, and could pay for it", () => {
  it("the value that shipped before this row fails on both desktop stages", () => {
    // 3.25 rem = 52 px, the tier picker's clearance and nothing else. The
    // mirror ends at 114.3 px on a 1264 × 619 stage and 145.0 on a 1165 × 650.
    for (const d of DESKTOPS) {
      expect(rectClearsMirrorBand({ x: d.width - 332, y: 52, width: 320 }, d, false)).toBe(false);
    }
  });

  it("…and the value that ships now clears it on both", () => {
    for (const d of DESKTOPS) {
      const top = notifyColumnTopPx(d, false);
      expect(rectClearsMirrorBand({ x: d.width - 332, y: top, width: 320 }, d, false)).toBe(true);
    }
    expect(notifyColumnTopPx(DESKTOPS[0], false)).toBeCloseTo(156.56, 2);
    expect(notifyColumnTopPx(DESKTOPS[1], false)).toBeCloseTo(164, 2);
  });

  it("the tallest column on record still stops short of the instrument band", () => {
    // 316.6 px — `[data-hud="notify-column"] [924, 144.5, 320 × 316.6]`, the
    // five-step briefing, measured at 1264 × 619 and quoted in notifyColumn.ts.
    // The shell's own cap is written `calc(100% - 108px - 3.5rem)` and does NOT
    // follow this top, so the clearance is checked here rather than assumed.
    const TALLEST_MEASURED_COLUMN_PX = 316.6;
    for (const d of DESKTOPS) {
      const floor = notifyColumnTopPx(d, false) + TALLEST_MEASURED_COLUMN_PX;
      expect(floor, `${d.id}: the roomy column now reaches the instrument band`).toBeLessThan(
        d.height - ROOMY_HUD_FLOOR_PX,
      );
    }
  });
});

describe("the COMPACT datum stays put, and the column gets its own top", () => {
  it("the datum is unchanged — the rail and the deck stand on it", () => {
    // `TouchControls.TOP_RAIL_TOP_CSS` IS this constant, and PlayAreaStyles
    // writes the sideways deck as `calc(<datum> + TOP_RAIL_ROW_CSS)`. Adding
    // 0.166 of the stage here moves that deck 60 → 125 px on a 393 px stage,
    // against a control band that starts at 135.5. This test is what stops the
    // next pass from taking the one-line shortcut.
    expect(NOTIFY_COLUMN_TOP_CSS_COMPACT).toBe("calc(0.5rem + env(safe-area-inset-top, 0px))");
    const touch = readFileSync(
      resolve(__dirname, "../../../../components/sim/TouchControls.tsx"),
      "utf8",
    );
    expect(touch).toContain("export const TOP_RAIL_TOP_CSS = NOTIFY_COLUMN_TOP_CSS_COMPACT;");
  });

  it("…and it does NOT clear the mirror, which is why a second constant exists", () => {
    for (const p of PHONES_LANDSCAPE) {
      expect(8, `${p.id}`).toBeLessThan(notifyColumnMirrorLanePx(p, true));
    }
  });

  it("the column's own top clears it on all three sideways phones", () => {
    for (const p of PHONES_LANDSCAPE) {
      const top = notifyColumnTopPx(p, true);
      expect(
        rectClearsMirrorBand({ x: p.width - 131 - 180, y: top, width: 180 }, p, true),
        `${p.id}`,
      ).toBe(true);
    }
  });

  it("what the swap costs, and that what is left is still a card", () => {
    // The peek shrinks because the corridor between the mirror and the ROAD IS
    // this narrow — 0.166 → 0.40 of the stage, the second number being the
    // cockpit horizon since 2026-09-02 — and the words are not deleted: the
    // fold already prints «↓ още N реда» beside «ПРОЧЕТИ».
    const iphone = { width: 852, height: 393, insetBottom: 21 };
    const android = { width: 780, height: 360, insetBottom: 0 };
    const before = (s: typeof iphone): number => notifyColumnMaxHeightPx(s.height, notifyColumnFloorPx(s), 8);
    const after = (s: typeof iphone): number =>
      notifyColumnMaxHeightPx(s.height, notifyColumnFloorPx(s), notifyColumnTopPx(s, true));
    // EXPECTATIONS CHANGED 2026-09-02 (`sc-ov-oncoming-gap:5de3bffb`): the
    // column's ceiling moved 0.43 → 0.40 when the horizon it was derived from
    // was found to have been read in the wrong direction. 161/95.75/147/87.04
    // were that ceiling's numbers.
    expect(Math.round(before(iphone))).toBe(149);
    expect(after(iphone)).toBeCloseTo(83.96, 1);
    expect(Math.round(before(android))).toBe(136);
    expect(after(android)).toBeCloseTo(76.24, 1);
    // …and a peek is still a peek: 44 px is the pill's own minimum, and the
    // card paints past the ceiling rather than clipping «ПРОЧЕТИ» (the compact
    // column sets no `overflow`). What that costs is now the honest residue of
    // this row: the CHROME, not the ceiling, is what still reaches the road —
    // 0.405 on the iPhone and 0.427 on the Android against a horizon at 0.402,
    // i.e. one to nine pixels, and no ceiling can take them back.
    for (const s of [iphone, android]) {
      expect(after(s)).toBeGreaterThan(OVERLAY_PEEK_HEIGHT_PX);
      const chrome = 14 + 12 + 44 + 16; // chip · fold line · «ПРОЧЕТИ» row · padding
      const worstFloor = (notifyColumnTopPx(s, true) + Math.max(after(s), chrome)) / s.height;
      expect(worstFloor).toBeLessThan(0.43);
    }
  });
});

describe("the shipped lengths are generated from the constants above", () => {
  it("both tops are one `max()` of the corner datum and the mirror's lane", () => {
    expect(NOTIFY_COLUMN_TOP_CSS_ROOMY).toBe(
      "calc(max(3.25rem, 24% + 0.5rem) + env(safe-area-inset-top, 0px))",
    );
    expect(NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN).toBe(
      "calc(max(0.5rem, 16.6% + 0.5rem) + env(safe-area-inset-top, 0px))",
    );
    // The percentage is the fraction and the rem is the gutter — written from
    // the constants, so a change to either cannot leave the CSS behind.
    expect(NOTIFY_COLUMN_TOP_CSS_ROOMY).toContain(`${MIRROR_BAND_BOTTOM_FRACTION_ROOMY * 100}%`);
    expect(NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN).toContain(
      `${MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE * 100}%`,
    );
    expect(NOTIFY_COLUMN_TOP_CSS_ROOMY).toContain(`${NOTIFY_COLUMN_MIRROR_GUTTER_PX / 16}rem`);
  });

  it("every surface that reads the ROOMY top is a right-column surface", () => {
    // That is the whole reason the roomy half could be applied from this module
    // and the compact half could not. If a rule for something in the LEFT
    // corridor ever starts reading it, this list stops matching and the mirror
    // lane starts moving boxes it was never derived for.
    const css = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
      "utf8",
    );
    const users = [...css.matchAll(/\$\{NOTIFY_COLUMN_TOP_CSS_ROOMY\}/g)].map((m) =>
      // The selector that opened the rule this declaration is in — 400 chars
      // back covers the longest of the three rules and stops well short of the
      // previous one, and the prose above them names no `data-hud` handle.
      css.slice(Math.max(0, m.index - 400), m.index),
    );
    expect(users.length).toBeGreaterThan(0);
    for (const rule of users) {
      expect(
        rule,
        `an unexpected surface now hangs off the roomy column top:\n${rule.slice(-200)}`,
      ).toMatch(/audio-prompt|touch-hint|notify-column/);
    }
  });

  it("…and the shell still positions the roomy column from this constant", () => {
    const shell = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("top: NOTIFY_COLUMN_TOP_CSS_ROOMY,");
  });
});

describe("what this row knowingly does NOT close", () => {
  it("PORTRAIT is under-cleared, and the number is written down rather than implied", () => {
    // One static percentage cannot serve 0.166 sideways and 0.276 upright, and
    // the orientation question is answered in PlayAreaStyles' media queries,
    // not here (the same split the demonstration deck's caption already uses).
    // No frame in this catalogue is portrait — the harness drives
    // `iphone16-landscape` — so the gap is recorded, not guessed at.
    for (const p of PHONES_PORTRAIT) {
      const required = notifyColumnMirrorLanePx(p, true);
      const shipped = notifyColumnTopPx(p, true);
      expect(shipped).toBeLessThan(required);
    }
    expect(notifyColumnMirrorLanePx(PHONES_PORTRAIT[0], true)).toBeCloseTo(243.15, 1);
    expect(notifyColumnTopPx(PHONES_PORTRAIT[0], true)).toBeCloseTo(149.43, 1);
  });
});
