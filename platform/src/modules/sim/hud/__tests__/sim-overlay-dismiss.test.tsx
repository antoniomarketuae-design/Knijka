/**
 * ROW A6, THE PHONE HALF — „those pop ups need to be able to be removed when
 * clicked with the mouse … currently they are much much annoying".
 *
 * The desktop half shipped in `HudToasts` and has a test. The phone half did
 * not, and the reason it could rot unnoticed is one expression:
 *
 *     const interactive = hasDetail || blocking;   // SimOverlay, before
 *
 * An ordinary line — a task, a piece of guidance, a „Браво" — matched neither
 * arm, so it rendered with `pointer-events: none`, no control of any kind, and
 * left only when its TTL expired. Nothing asserted otherwise, and the frame
 * that „proved" the fix was taken on the roomy column via `?state=column`,
 * which a coarse-pointer 393 px viewport never reaches.
 *
 * This file renders the real component (`react-dom/server`, the FaultCard
 * precedent — no DOM needed) and asserts the SHAPE of all three cases:
 *
 *   1. a plain line IS the dismiss button, the way a toast card is on desktop;
 *   2. a line with a WHY keeps „Защо" and gets the ✕ as a third 44 px chip;
 *   3. a BLOCKING line has no ✕ at all — it is answered, not dismissed, and
 *      that is the contract that keeps a teach moment and the end-of-session
 *      verdict from being swiped away unread (THEO-4).
 *
 * The click itself is proved on the device, in the real lesson shell — this
 * asserts that the control exists to be clicked.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SimOverlay } from "../SimOverlay";
import { OVERLAY_PEEK_HEIGHT_PX, type SimOverlayItem } from "../overlayQueue";

function markup(item: SimOverlayItem, queued = 0): string {
  return renderToStaticMarkup(<SimOverlay item={item} queued={queued} />);
}

/** The peek card element, whatever tag it is rendered as. */
function cardTag(html: string): string | null {
  const m = /<(\w+)([^>]*)data-sim-overlay-card="(button|panel)"/.exec(html);
  return m === null ? null : `${m[1]}:${m[3]}`;
}

const TASK: SimOverlayItem = {
  id: "task:2/3",
  kind: "task",
  tone: "neutral",
  chipBg: "Задача 2/3",
  lineBg: "Спри плътно до бордюра след кръстовището.",
};

const VIOLATION: SimOverlayItem = {
  id: "toast:7",
  kind: "violation",
  tone: "danger",
  chipBg: "−5 т.",
  lineBg: "Превишена скорост",
  detailBg: "Караш с 68 km/h там, където ограничението е 50 km/h.",
  lawRef: "ЗДвП чл. 21",
};

const TEACH: SimOverlayItem = {
  id: "teach:SPEEDING:22",
  kind: "teach",
  tone: "teach",
  chipBg: "Учебен момент",
  lineBg: "Превишена скорост",
  detailBg: "Спирачният път расте с квадрата на скоростта.",
  lawRef: "ЗДвП чл. 21, ал. 1",
  blocking: true,
  onAck: () => undefined,
};

describe("A6 — every line the drive is not waiting on can be removed", () => {
  it("makes a PLAIN line the dismiss button itself, like the desktop toast card", () => {
    const html = markup(TASK);
    expect(cardTag(html)).toBe("button:button");
    // The label names the action AND the line, so a screen reader hears what
    // it is about to remove — the same shape as „Скрий известието" on desktop.
    expect(html).toContain('aria-label="Скрий известието');
    expect(html).toContain("Спри плътно до бордюра");
    // The one thing that made this row dead: the card was pointer-events-none.
    expect(html).toContain("pointer-events-auto");
    expect(html).not.toContain("pointer-events-none absolute z-30 flex flex-col items-end\" style=\"min-height");
  });

  it("gives a line WITH a why both controls — Защо and a ✕ — and keeps them 44 px", () => {
    const html = markup(VIOLATION);
    expect(cardTag(html)).toBe("div:panel");
    expect(html).toContain("Защо");
    expect(html).toContain('aria-label="Скрий известието"');
    // h-11/w-11 is 2.75rem = 44 px in both axes. A 24 px chip with a big label
    // is the touch-target violation this project already counts 19 of.
    expect(html).toMatch(/aria-label="Скрий известието"[^>]*class="[^"]*h-11 w-11[^"]*"/);
  });

  it("NEVER offers a ✕ on a blocking line — it is answered, not swiped away", () => {
    const html = markup(TEACH);
    expect(cardTag(html)).toBe("div:panel");
    expect(html).toContain("Разбрах");
    expect(html).not.toContain("Скрий известието");
    // THEO-4: the authored WHY is still one tap behind „Защо".
    expect(html).toContain("Защо");
  });

  it("keeps the acknowledgement on a NON-blocking line that still has one", () => {
    // A2 on a phone: once the student turns the automatic debrief off, the
    // end-of-session line stops blocking — but „Резултат" has to survive that,
    // or the verdict loses its route to the law-cited debrief.
    const html = markup({
      id: "end",
      kind: "end",
      tone: "warn",
      chipBg: "−15 т.",
      lineBg: "Неиздържан — виж разбора",
      ackLabelBg: "Резултат",
      onAck: () => undefined,
    });
    expect(html).toContain("Резултат");
    expect(html).toContain('aria-label="Скрий известието"');
  });

  it("floors every card at the 44 px thumb rule, because every card is now touchable", () => {
    for (const item of [TASK, VIOLATION, TEACH]) {
      expect(markup(item)).toContain(`min-height:${OVERLAY_PEEK_HEIGHT_PX}px`);
    }
  });

  it("still counts the queue behind the line it is showing", () => {
    expect(markup(VIOLATION, 2)).toContain("+2");
  });
});
