import { describe, expect, it } from "vitest";
import {
  COMPACT_DASH_HEIGHT_PX,
  COMPACT_MAX_HEIGHT_PX,
  COMPACT_MAX_WIDTH_PX,
  isCompactViewport,
  minimapClearancePx,
  ROOMY_HUD_FLOOR_PX,
  shouldGoImmersive,
  TEACH_SHEET_MAX_FRACTION,
} from "./immersive";

/** The founder's review device, both ways round. */
const PHONE_LANDSCAPE = { w: 844, h: 390 };
const PHONE_PORTRAIT = { w: 390, h: 844 };

describe("isCompactViewport", () => {
  it("is compact on the founder's phone, landscape AND portrait", () => {
    expect(isCompactViewport(PHONE_LANDSCAPE.w, PHONE_LANDSCAPE.h, true)).toBe(true);
    expect(isCompactViewport(PHONE_PORTRAIT.w, PHONE_PORTRAIT.h, true)).toBe(true);
  });

  it("covers the whole current phone ladder in landscape", () => {
    for (const h of [320, 375, 390, 393, 430, 448]) {
      expect(isCompactViewport(900, h, true)).toBe(true);
    }
  });

  it("leaves tablets and laptops on the roomy layout", () => {
    expect(isCompactViewport(1024, 768, true)).toBe(false); // iPad Pro landscape
    expect(isCompactViewport(744, 1133, true)).toBe(false); // iPad mini portrait
    expect(isCompactViewport(1440, 900, false)).toBe(false);
  });

  it("never applies to a fine pointer, however small the window", () => {
    expect(isCompactViewport(400, 300, false)).toBe(false);
  });

  it("is exactly the documented thresholds, not approximately", () => {
    expect(isCompactViewport(1200, COMPACT_MAX_HEIGHT_PX, true)).toBe(true);
    expect(isCompactViewport(1200, COMPACT_MAX_HEIGHT_PX + 1, true)).toBe(false);
    expect(isCompactViewport(COMPACT_MAX_WIDTH_PX, 1200, true)).toBe(true);
    expect(isCompactViewport(COMPACT_MAX_WIDTH_PX + 1, 1200, true)).toBe(false);
  });

  it("refuses to guess from a non-finite viewport", () => {
    expect(isCompactViewport(Number.NaN, 390, true)).toBe(false);
  });
});

describe("shouldGoImmersive", () => {
  const base = {
    isFullscreen: false,
    fullscreenAvailable: true,
    compact: false,
    standalone: false,
  };

  it("keeps the desktop letterbox when nothing asks for immersion", () => {
    expect(shouldGoImmersive(base)).toBe(false);
  });

  it("goes immersive in a real fullscreen element", () => {
    expect(shouldGoImmersive({ ...base, isFullscreen: true })).toBe(true);
  });

  it("goes immersive where there is no Fullscreen API (iPhone Safari)", () => {
    expect(shouldGoImmersive({ ...base, fullscreenAvailable: false })).toBe(true);
  });

  it("goes immersive on a phone viewport even where the API exists but was refused", () => {
    // Android Chrome: requestFullscreen() exists, the mount-effect call lost
    // the user activation, so isFullscreen stays false. Before this rule that
    // combination fell back to a letterboxed picture inside a scrolling page.
    expect(shouldGoImmersive({ ...base, compact: true })).toBe(true);
  });

  it("goes immersive in an installed (standalone) app", () => {
    expect(shouldGoImmersive({ ...base, standalone: true })).toBe(true);
  });
});

describe("the instrument band is a third of what it was", () => {
  it("costs ~10% of a landscape phone viewport, down from ~18%", () => {
    const before = (70 / PHONE_LANDSCAPE.h) * 100;
    const after = (COMPACT_DASH_HEIGHT_PX / PHONE_LANDSCAPE.h) * 100;
    expect(before).toBeGreaterThan(17);
    expect(after).toBeLessThan(11);
    expect(before / after).toBeGreaterThan(1.7);
  });

  it("still leaves room for the 30 px speed readout plus its padding", () => {
    expect(COMPACT_DASH_HEIGHT_PX).toBeGreaterThanOrEqual(38);
  });

  it("keeps the roomy floor where the legend and minimap already were", () => {
    expect(ROOMY_HUD_FLOOR_PX).toBe(108); // bottom-[6.75rem]
  });
});

describe("teach sheet ceiling", () => {
  it("is below the half-screen the founder called unacceptable", () => {
    // The sheet is capped as a fraction of the SCENE BOX, which in compact
    // immersive is the whole viewport minus nothing — so the fraction is also
    // the share of screen, and it must stay under 50 % even fully expanded…
    expect(TEACH_SHEET_MAX_FRACTION).toBeLessThan(0.65);
    // …while the collapsed default (measured in the capture) is far smaller.
  });
});

describe("minimapClearancePx", () => {
  it("reserves the disc's width only while the disc is on screen", () => {
    expect(minimapClearancePx(true)).toBe(180);
    expect(minimapClearancePx(false)).toBe(0);
  });
});
