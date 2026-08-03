import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  notifyColumnLeftFraction,
  notifyColumnWidthPx,
  rectIsInNotifyColumn,
  NOTIFY_COLUMN_GUTTER_PX,
  NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX,
  NOTIFY_COLUMN_MIN_LEFT_FRACTION,
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_WIDTH_CSS_COMPACT,
  NOTIFY_COLUMN_WIDTH_CSS_ROOMY,
} from "../notifyColumn";
import { hudCardMaxWidthPx, TOAST_CARD_WIDTH_PX } from "../hudPreferences";

/**
 * =============================================================================
 * „MOVE EVERY TEXT PANEL OFF THE MIDDLE OF THE ROAD, TO THE RIGHT EDGE."
 *
 * Third asking, 2026-08-03. The attempt before this one made the panels
 * TRANSPARENT and reported the chrome budget improving from 70 % to 85 %; the
 * founder's view stayed blocked because nothing MOVED. So the assertions here
 * are about POSITION and nothing else — a coverage percentage cannot pass this
 * file.
 * =============================================================================
 */

/** The devices this product is judged on (tools/mobile/lib/devices.mjs) plus a
 *  laptop and the desktop the harness renders at. */
const LADDER = [320, 360, 375, 390, 393, 430, 448, 640, 852, 1024, 1280, 1920];

describe("the column is at the right edge on every device in the ladder", () => {
  it("never lets its left edge come left of 60 % of the width", () => {
    const bad: string[] = [];
    for (const w of LADDER) {
      for (const compact of [true, false]) {
        const f = notifyColumnLeftFraction(w, compact);
        if (f < NOTIFY_COLUMN_MIN_LEFT_FRACTION) {
          bad.push(`${w}px ${compact ? "compact" : "roomy"} → left at ${f.toFixed(3)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("the founder's own phone, both orientations, in numbers", () => {
    // 393 portrait: 36 vw = 141.5 px, so the column starts at x = 239.5 (0.61).
    expect(notifyColumnWidthPx(393, true)).toBeCloseTo(141.48, 1);
    expect(notifyColumnLeftFraction(393, true)).toBeCloseTo(0.61, 2);
    // 852 landscape: the 15 rem cap bites, so it starts at x = 600 (0.70).
    expect(notifyColumnWidthPx(852, true)).toBe(NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX);
    expect(notifyColumnLeftFraction(852, true)).toBeCloseTo(0.704, 2);
  });

  it("never asks for more width than the phone it is on", () => {
    for (const w of LADDER) {
      expect(notifyColumnWidthPx(w, true)).toBeLessThanOrEqual(hudCardMaxWidthPx(w));
    }
  });

  it("is exactly the toast card's width once the cap bites, so nothing reflows", () => {
    expect(NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX).toBe(TOAST_CARD_WIDTH_PX);
  });

  it("degrades to a safe answer on a nonsense viewport", () => {
    expect(notifyColumnWidthPx(0, true)).toBe(0);
    expect(notifyColumnWidthPx(Number.NaN, false)).toBe(0);
    expect(notifyColumnLeftFraction(0, true)).toBe(1);
  });
});

describe("the acceptance predicate has teeth", () => {
  // THE MEASUREMENT THE RENDERED FRAME IS JUDGED BY. Both examples are real:
  // the first is the objective stack as it shipped this morning (measured at
  // 1280×800: x = 353.1, w = 573.7), the second is where it lands after.
  it("rejects the centred banner that was on the road, accepts the moved one", () => {
    expect(rectIsInNotifyColumn({ x: 353.1, width: 573.7 }, 1280)).toBe(false);
    expect(rectIsInNotifyColumn({ x: 948, width: 320 }, 1280)).toBe(true);
  });

  it("rejects a card that is at the right edge but reaches back past the middle", () => {
    // A full-width strip anchored right is the top-rail shape being replaced.
    expect(rectIsInNotifyColumn({ x: 58, width: 323 }, 393)).toBe(false);
  });

  it("rejects a card that is narrow but floating, not at the edge", () => {
    expect(rectIsInNotifyColumn({ x: 800, width: 200 }, 1280)).toBe(false);
  });

  it("accepts the compact column on the founder's portrait phone", () => {
    expect(rectIsInNotifyColumn({ x: 239.5, width: 141.5 }, 393)).toBe(true);
  });
});

describe("the shipped CSS is generated from the same constants", () => {
  it("expresses both widths as a self-limiting min()", () => {
    expect(NOTIFY_COLUMN_WIDTH_CSS_ROOMY).toBe("min(20rem, 30vw)");
    expect(NOTIFY_COLUMN_WIDTH_CSS_COMPACT).toBe("min(15rem, 36vw)");
  });

  it("keeps the right inset safe-area aware — viewport-fit=cover ships", () => {
    expect(NOTIFY_COLUMN_RIGHT_CSS).toContain("env(safe-area-inset-right");
    expect(NOTIFY_COLUMN_RIGHT_CSS).toContain(`${NOTIFY_COLUMN_GUTTER_PX / 16}rem`);
  });

  /**
   * A stylesheet in a template literal can rot into a no-op without a single
   * type error (`unpanel.test.ts` says so in its own header, for the same
   * reason). These are the three surfaces that are moved by the CASCADE rather
   * than by their own component — the scene owns their files — so if the rule
   * text stops naming them, nothing anywhere else goes red.
   */
  it("PlayAreaStyles still moves the scene-owned panels into the column", () => {
    const css = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
      "utf8",
    );
    for (const surface of ['[data-hud="demo-deck"]', '[data-hud="audio-prompt"]']) {
      const rule = new RegExp(
        `${surface.replace(/[[\]"=]/g, (c) => `\\${c}`)}[^}]*\\{[^}]*NOTIFY_COLUMN_RIGHT_CSS`,
      );
      expect(css, `${surface} is no longer pulled to the right column`).toMatch(rule);
    }
  });

  it("the play shell and the overlay both read the column from this module", () => {
    const shell = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
      "utf8",
    );
    const overlay = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");
    expect(shell).toContain("NOTIFY_COLUMN_WIDTH_CSS_ROOMY");
    expect(shell).toContain('data-hud="notify-column"');
    expect(overlay).toContain("NOTIFY_COLUMN_WIDTH_CSS_COMPACT");
    // …and the shape it replaces is gone, not merely unused.
    expect(shell).not.toMatch(/left-1\/2 top-3 flex/);
  });
});
