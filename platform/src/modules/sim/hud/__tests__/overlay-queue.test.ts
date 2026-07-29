import { describe, expect, it } from "vitest";
import {
  hasWhy,
  isAmbientOverlay,
  overlayCentreBand,
  overlayPriority,
  peekWithinBudget,
  rectClearsCentreBand,
  rectViewportFraction,
  requiresWhy,
  selectOverlay,
  OVERLAY_CENTRE_BAND,
  OVERLAY_PEEK_HEIGHT_PX,
  OVERLAY_PEEK_MAX_FRACTION,
  type SimOverlayItem,
  type SimOverlayKind,
} from "../overlayQueue";

/**
 * The founder's iPhone 16, 2026-07-29: a „ЗАДАЧА" card, a teach card and a red
 * belt warning stacked down the screen before the road got a pixel. „not
 * acceptable it is not playable at all."
 *
 * These are the rules that make that state unrepresentable, asserted against
 * his actual device geometry — 393×852 portrait and 852×393 landscape.
 */

const IPHONE16_PORTRAIT = { w: 393, h: 852 };
const IPHONE16_LANDSCAPE = { w: 852, h: 393 };

function item(kind: SimOverlayKind, over: Partial<SimOverlayItem> = {}): SimOverlayItem {
  return {
    id: `${kind}-1`,
    kind,
    tone: "neutral",
    lineBg: `линия за ${kind}`,
    ...over,
  };
}

describe("selectOverlay — one overlay, never three", () => {
  it("shows nothing when nothing is speaking", () => {
    expect(selectOverlay([]).active).toBeNull();
    expect(selectOverlay([null, undefined]).active).toBeNull();
  });

  it("returns exactly ONE active item no matter how many arrive", () => {
    // The founder's screenshot, as data.
    const selection = selectOverlay([
      item("task"),
      item("teach"),
      item("warning"),
    ]);
    expect(selection.active).not.toBeNull();
    expect(selection.waiting).toHaveLength(2);
    // …and the one that speaks is the one that froze the car.
    expect(selection.active?.kind).toBe("teach");
  });

  it("ranks safety and blocking pauses above ambient guidance", () => {
    const order: SimOverlayKind[] = [
      "end",
      "teach",
      "violation",
      "warning",
      "hint",
      "praise",
      "predrive",
      "advisor",
      "task",
      "legend",
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(overlayPriority(order[i - 1])).toBeGreaterThan(overlayPriority(order[i]));
    }
  });

  it("counts the queue but does not count ambient guidance as pending", () => {
    // A belt warning covering a task line is not "two messages waiting" — the
    // task line has not changed in a minute. Only real pending events earn +N.
    const ambientOnly = selectOverlay([item("warning"), item("task"), item("advisor")]);
    expect(ambientOnly.queued).toBe(0);

    const realQueue = selectOverlay([
      item("teach"),
      item("violation"),
      item("hint"),
      item("task"),
    ]);
    expect(realQueue.queued).toBe(2);
  });

  it("is stable: equal priority keeps caller order, so the line cannot flicker", () => {
    const a = item("violation", { id: "v-new" });
    const b = item("violation", { id: "v-old" });
    expect(selectOverlay([a, b]).active?.id).toBe("v-new");
    expect(selectOverlay([a, b]).active?.id).toBe("v-new");
  });

  it("keeps ambient kinds classified as ambient", () => {
    for (const kind of ["task", "advisor", "predrive", "legend"] as SimOverlayKind[]) {
      expect(isAmbientOverlay(kind)).toBe(true);
    }
    for (const kind of ["end", "teach", "violation", "warning", "hint"] as SimOverlayKind[]) {
      expect(isAmbientOverlay(kind)).toBe(false);
    }
  });
});

describe("THEO-4 — a one-line overlay may never become a bare verdict", () => {
  it("demands an authored WHY from everything that names a mistake", () => {
    for (const kind of ["teach", "violation", "hint", "warning"] as SimOverlayKind[]) {
      expect(requiresWhy(kind)).toBe(true);
      expect(hasWhy(item(kind))).toBe(false);
      expect(hasWhy(item(kind, { detailBg: "защото законът казва…" }))).toBe(true);
    }
  });

  it("does not demand one from praise, tasks, prompts or the ribbon legend", () => {
    for (const kind of ["praise", "task", "advisor", "legend", "predrive", "end"] as SimOverlayKind[]) {
      expect(requiresWhy(kind)).toBe(false);
      expect(hasWhy(item(kind))).toBe(true);
    }
  });

  it("treats whitespace as no explanation at all", () => {
    expect(hasWhy(item("violation", { detailBg: "   " }))).toBe(false);
  });
});

describe("the budget — 12 % of the viewport, and never the road", () => {
  it("keeps the centre band off both corners and both rails", () => {
    const band = overlayCentreBand(IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h);
    expect(band.top).toBeGreaterThan(0);
    expect(band.bottom).toBeLessThan(IPHONE16_LANDSCAPE.h);
    expect(band.left).toBeGreaterThan(0);
    expect(band.right).toBeLessThan(IPHONE16_LANDSCAPE.w);
  });

  it("passes the real peek pill on the founder's landscape phone", () => {
    // Measured geometry: top rail, 8 px down, right of the 44 px micro menu,
    // a generous 420 px of text. This is the DEFAULT state.
    const peek = { x: 117, y: 8, width: 420, height: OVERLAY_PEEK_HEIGHT_PX };
    expect(rectClearsCentreBand(peek, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(true);
    expect(peekWithinBudget(peek, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(true);
    expect(
      rectViewportFraction(peek, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h),
    ).toBeLessThan(0.06);
  });

  it("passes the real peek pill in portrait too", () => {
    const peek = { x: 58, y: 67, width: 323, height: OVERLAY_PEEK_HEIGHT_PX };
    expect(rectClearsCentreBand(peek, IPHONE16_PORTRAIT.w, IPHONE16_PORTRAIT.h)).toBe(true);
    expect(peekWithinBudget(peek, IPHONE16_PORTRAIT.w, IPHONE16_PORTRAIT.h)).toBe(true);
  });

  it("REJECTS a second stacked row on the landscape phone — the reason the pill shares the rail", () => {
    // 44 px pill under a 52 px top rail starts at 58 and ends at 102; the band
    // starts at 78.6. This is the measurement that decided the layout, and it
    // has to keep failing or the layout stops being justified.
    const secondRow = { x: 117, y: 58, width: 420, height: OVERLAY_PEEK_HEIGHT_PX };
    expect(rectClearsCentreBand(secondRow, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(
      false,
    );
  });

  it("REJECTS the panels it replaced", () => {
    // The old teach card: `absolute inset-0` inside the scene box.
    const teachModal = { x: 0, y: 0, width: 852, height: 393 };
    expect(rectClearsCentreBand(teachModal, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(
      false,
    );
    expect(peekWithinBudget(teachModal, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(false);

    // The old compact teach sheet: 62 % of the viewport, above the band.
    const teachSheet = { x: 0, y: 109, width: 852, height: 244 };
    expect(peekWithinBudget(teachSheet, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(false);
    expect(rectClearsCentreBand(teachSheet, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(
      false,
    );
  });

  it("touching the band's edge is not entering it", () => {
    const band = overlayCentreBand(IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h);
    const flush = { x: 0, y: band.top - 44, width: 852, height: 44 };
    expect(rectClearsCentreBand(flush, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(true);
    const oneInside = { x: 0, y: band.top - 43, width: 852, height: 44 };
    expect(rectClearsCentreBand(oneInside, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBe(
      false,
    );
  });

  it("charges only the on-screen part of a rect, and never divides by zero", () => {
    const half = { x: -426, y: 0, width: 852, height: 393 };
    expect(rectViewportFraction(half, IPHONE16_LANDSCAPE.w, IPHONE16_LANDSCAPE.h)).toBeCloseTo(
      0.5,
      3,
    );
    expect(rectViewportFraction(half, 0, 0)).toBe(0);
  });

  it("states the numbers the WebKit probe asserts against", () => {
    // tools/mobile/overlay-probe.mjs cannot import TypeScript, so it carries
    // these four fractions as literals. Pinning them here is what keeps the
    // screen and its measurement from quietly disagreeing.
    expect(OVERLAY_PEEK_MAX_FRACTION).toBe(0.12);
    expect(OVERLAY_CENTRE_BAND).toEqual({ x0: 0.16, x1: 0.84, y0: 0.2, y1: 0.74 });
  });
});
