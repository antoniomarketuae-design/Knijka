/**
 * sc-vu-emergency:2e634d4d (major) — „THE MOBILE IN-COCKPIT BRIEFING CARD IS A
 * CLIPPED TEASER THAT HIDES 6 TO 27 LINES BEHIND A «↓ ОЩЕ N РЕДА» FADE."
 *
 * THE FRAME. `.audit-frames/w10-2/frames/sc-vu-emergency__mobile-right/
 * 01-arrival.png`, iPhone 16 landscape 852 × 393 at dpr 3, tree ae4a4990. The
 * peek prints «ⓘ ИНСТРУКЦИИ», two lines of «Потегли по булеварда в дясната
 * лента и се установи» — cut after the verb, the object «на спокойна скорост»
 * below the fold — then «↓ ОЩЕ 20 РЕДА», and twelve pixels under that counter
 * the «ПРОЧЕТИ» and «РАЗБРАХ» chips. The SAME leg's `02-briefing.png` shows
 * all five authored steps whole inside the read sheet, so no Bulgarian is
 * missing from the catalogue: what the card did was announce twenty unread
 * lines and stand the control that ends the briefing directly under the
 * announcement.
 *
 * WHAT WAS ALREADY DONE AND WHY IT DID NOT REACH THIS CONTROL. The peek's cut
 * words became a tap that opens the sheet (`tapCutText`, ba3ed16); the plain
 * card's own body scrolls before it dismisses (`tapDismissCard`, „the student
 * cannot delete words he has not seen"); the SHEET's «Разбрах» reveals what is
 * left before it acknowledges (`tapSheetAck`, 6363677 —„the button that admits
 * the fold may not also delete it"). The peek's own «Разбрах» is the third
 * control of that shape on the same card and was still
 * `useTapActivation(acknowledge)`.
 *
 * IT OPENS THE SHEET RATHER THAN SCROLLING, which is where it departs from its
 * two siblings, and the block at `tapAck` carries the arithmetic: this window
 * lands on its 44 px floor on every compact profile, so `cardTapAction`'s
 * scroll-to-the-end would jump past eighteen unread lines and take the counter
 * to zero having shown none of them.
 *
 * SOURCE-PINNED FOR THE WIRING, RENDERED FOR THE SHAPE. This suite runs under
 * `environment: "node"` (vitest.config.ts) — there is no layout engine, so
 * `scrollHeight` is 0, `readRestScrollTop` answers null and a driven press
 * would take the acknowledge branch no matter what the component did. That is
 * the same reason `sim-overlay-ack-fold-cue.test.ts` gives for pinning its own
 * half, and the failure being guarded against is a one-line revert that keeps
 * the label, the cue and the markup and costs only the student the sentence.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { overlayHasDetail, SimOverlay } from "../SimOverlay";
import type { SimOverlayItem } from "../overlayQueue";

const SOURCE = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");

/**
 * The source with its prose taken out. This file argues about the defect in
 * Bulgarian and quotes the strings it asserts on, so an assertion that cannot
 * tell code from the paragraph explaining it would be a ban on writing the
 * reason down (`sim-overlay-ack-fold-cue.test.ts`, same technique).
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * The peek acknowledgement's handler body, comments already stripped and cut at
 * its OWN terminator rather than at a character count — a fixed-width slice
 * reaches into whatever happens to follow, which is how a pinned absence
 * („this handler does not scroll") turns into an assertion about the next
 * declaration. `\n  });` is the handler's own closing indent; every nested call
 * inside it closes deeper.
 */
const HANDLER = ((): string => {
  const at = CODE.indexOf("const tapAck = useTapActivation(");
  expect(at, "the peek's acknowledgement handler is gone").toBeGreaterThan(-1);
  const end = CODE.indexOf("\n  });", at);
  expect(end, "the handler does not close where its indent says").toBeGreaterThan(at);
  return CODE.slice(at, end + "\n  });".length);
})();

/** The arrival briefing of the filed lesson, in the shape the shell feeds. */
const BRIEFING: SimOverlayItem = {
  id: "briefing",
  kind: "hint",
  tone: "neutral",
  chipBg: "Инструкции",
  lineBg: "Потегли по булеварда в дясната лента и се установи на спокойна скорост.",
  detailBg:
    "2. Поглеждай периодично в огледалото за обратно виждане — синята лампа се вижда там, преди сирената да е оглушителна.\n" +
    "3. Зад теб приближава линейка. Мигач надясно и плавно се отдръпни към десния край на лентата — коридорът ѝ минава отляво.\n" +
    "4. Намали, докато премине — без рязко спиране в лентата. Не ускорявай и не се мести наляво: това блокира пътя ѝ.\n" +
    "5. Щом линейката отмине, върни се плавно в средата на лентата и продължи.",
  openLabelBg: "Прочети",
  ackLabelBg: "Разбрах",
  blocking: true,
  onAck: () => undefined,
};

describe("overlayHasDetail — one answer to: is there a sheet behind this card", () => {
  it("is true for an authored explanation and for rich detail", () => {
    expect(overlayHasDetail(BRIEFING)).toBe(true);
    expect(
      overlayHasDetail({ ...BRIEFING, detailBg: undefined, hasRichDetail: true }),
    ).toBe(true);
  });

  it("is false when there is nothing to open — including whitespace-only copy", () => {
    expect(overlayHasDetail({ ...BRIEFING, detailBg: undefined })).toBe(false);
    expect(overlayHasDetail({ ...BRIEFING, detailBg: "   \n  " })).toBe(false);
  });

  it("is the ONE expression the card asks with, so the chip and the ack agree", () => {
    // The «ПРОЧЕТИ» chip renders on `hasDetail`; the acknowledgement beside it
    // decides whether there is anywhere to send the reader. Two copies of the
    // predicate is how those two come to disagree about the same card.
    expect(CODE).toMatch(/const\s+hasDetail\s*=\s*overlayHasDetail\(shown\)/);
    expect(HANDLER).toContain("overlayHasDetail(shown)");
  });
});

describe("the peek's «Разбрах» reveals before it ends (sc-vu-emergency:2e634d4d)", () => {
  it("no longer acknowledges unconditionally", () => {
    // The exact shape this repair replaces, pinned as an absence: the revert is
    // one line and it is silent.
    expect(CODE).not.toMatch(/const\s+tapAck\s*=\s*useTapActivation\(\s*acknowledge\s*\)/);
  });

  it("reads the PEEK's own text window at tap time, not a stale count", () => {
    // `peekFold.lines` is refreshed by a `ResizeObserver` and by `onScroll`,
    // and a tap that ends a briefing may not depend on which of them ran last.
    expect(HANDLER).toContain("peekFold.ref.current");
    expect(HANDLER).toContain("readRestScrollTop({");
    expect(HANDLER).toContain("scrollHeight: el.scrollHeight");
    expect(HANDLER).toContain("padBottomPx");
    expect(HANDLER).not.toContain("peekFold.lines");
  });

  it("opens the read sheet and does NOT scroll a 44 px window to its end", () => {
    // `cardTapAction` answers a fold by scrolling to the end. That is right for
    // the 220 px sheet scroller and for the plain card; here it would jump past
    // eighteen unread lines and take «↓ още N реда» to zero having shown none.
    expect(HANDLER).toContain("setOpenItem(shown)");
    // `scrollTo({` and not `scrollTo` — the handler READS `el.scrollTop`, and
    // an absence assertion that a property name satisfies proves nothing.
    expect(HANDLER).not.toContain("scrollTo({");
    expect(HANDLER).not.toContain("cardTapAction");
  });

  it("reveals FIRST and only then acknowledges", () => {
    const open = HANDLER.indexOf("setOpenItem(shown)");
    const ack = HANDLER.indexOf("acknowledge();");
    expect(open).toBeGreaterThan(-1);
    expect(ack, "the chip no longer acknowledges at all").toBeGreaterThan(-1);
    expect(open).toBeLessThan(ack);
    // …and the reveal RETURNS, so one press can never do both.
    expect(HANDLER.slice(open, ack)).toContain("return;");
  });

  it("is gated on `blocking`, so an authored ack keeps what its word promises", () => {
    // The chip renders under `blocking || hasAck`. «Резултат» on the
    // end-of-session line is not a control that ends a reading — it opens the
    // debrief — so its first press must still do what it says.
    expect(HANDLER).toMatch(/shown !== null && blocking &&/);
  });

  it("falls back to today's behaviour when nothing can be measured", () => {
    // No ref, no layout engine, no fold: `readRestScrollTop` answers null and
    // the press acknowledges, which is the shipped behaviour exactly. The floor
    // of this change is „no worse".
    expect(HANDLER).toMatch(/el !== null/);
    expect(HANDLER).toMatch(/if\s*\(rest !== null\)/);
  });

  it("leaves the keyboard as a one-press exit for the assistive path", () => {
    // The whole body is in the accessibility tree regardless of the fold, which
    // is why the cue is `aria-hidden`; a second press would cost an AT user a
    // press and buy nothing.
    expect(CODE).toMatch(/if\s*\(blocking\)\s*acknowledge\(\);/);
  });
});

describe("the card the row was filed on still renders both ways out", () => {
  it("paints «ПРОЧЕТИ» and «РАЗБРАХ» and no ✕, exactly as the frame shows", () => {
    const html = renderToStaticMarkup(<SimOverlay item={BRIEFING} queued={0} />);
    expect(html).toContain("Прочети");
    expect(html).toContain("Разбрах");
    // A blocking card is answered, not dismissed — `closable` requires
    // `!blocking`, so nothing on this card loses a one-press exit it had.
    expect(html).not.toContain('aria-label="Скрий известието"');
  });
});
