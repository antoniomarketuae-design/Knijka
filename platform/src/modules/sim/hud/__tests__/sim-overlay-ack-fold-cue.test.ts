/**
 * sc-merge-accel-lane:b75b356e (major) — „THE BRIEFING OVERLAY CLIPS ITS LAST
 * LINE BEHIND THE «РАЗБРАХ» BUTTON — item 6 breaks at «вече е аварийната» and
 * the rest is hidden."
 *
 * THE ROW IS CLOSED IN THE PRODUCT AND WAS NOT CLOSED IN THE SUITE. Two
 * commits did the work, both after the sweep-161 frame the row was filed on
 * (2026-08-17 21:29):
 *
 *   2f5ce8f (2026-08-18) `foldMaskCss` / `foldWindowPx` — the window is masked
 *     to its own LINE GRID at both ends, so the cut can no longer fall through
 *     the middle of a row of glyphs. That is the „sliced ascenders 8 px above
 *     the blue «Разбрах»" half of the row, and it is gated
 *     (`sim-overlay-fold.test.ts`).
 *   f91dd1c (2026-08-28) `ackCarriesSheetFold` — the CONTINUATION CUE at the
 *     cut. The block at that constant carries the measurement, and it names
 *     THIS row and this lesson's own frame: the section is already at its
 *     393 px cap, the last visible line is whole and flush, the two hidden
 *     lines are the hard-shoulder warning, and the only thing that admitted
 *     they existed was «↓ ОЩЕ 2 РЕДА» ~560 px away in the header. So the count
 *     moved onto the one control that ENDS the reading.
 *
 * AND THE SECOND OF THOSE SHIPPED WITH NO GATE AT ALL — `ackCarriesSheetFold`
 * and `data-sim-overlay-ack-fold` appear in exactly one file in `src`, the
 * component. This file is that gate, and nothing else about the surface is
 * changed by it.
 *
 * IT IS SOURCE-PINNED, and that is this component's own ratified technique for
 * this class rather than a shortcut: jsdom has no layout engine, so
 * `sheetFold.lines` is 0 under `happy-dom`/`jsdom` and the branch this test is
 * about would never render — „a rendered assertion about a flex box's height
 * would pass no matter what the class list said" (briefingOverflow.test.tsx).
 * The failure being guarded against is precisely a deletion, which is what
 * this file's own register records happening once before: „THIS LINE IS THE
 * WHOLE WIRE, and it was ungated for one round: a verifier deleted it alone
 * and `briefing-no-echo` + `sim-overlay-fold` + `overlay-queue` stayed 56/56
 * green while every phone lost the number."
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");

/**
 * The source with its prose taken out. This file argues about the defect in
 * Bulgarian and quotes the very strings it asserts on, so an assertion that
 * cannot tell code from the paragraph explaining it would be a ban on writing
 * the reason down (briefingOverflow.test.tsx's own note, same technique).
 */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the sheet's «Разбрах» carries the fold count (sc-merge-accel-lane:b75b356e)", () => {
  it("derives the cue from the MEASURED fold, not from a constant", () => {
    // `blocking && sheetFold.lines > 0` — both halves load-bearing. A cue that
    // is always on is chrome; one keyed to `blocking` keeps the header's copy
    // on every card that has no acknowledgement button to put it on.
    expect(CODE).toMatch(/const\s+ackCarriesSheetFold\s*=\s*blocking\s*&&\s*sheetFold\.lines\s*>\s*0/);
  });

  it("paints it INSIDE the acknowledgement control, at the cut", () => {
    // The whole point of f91dd1c is that the count sits where the tap is and
    // not 560 px away in the header. It is a sibling of the label inside the
    // same `<button>`, so `.btn-accent`'s existing flex row absorbs it and the
    // scroller above loses no line to announce that lines are missing.
    const ackButton = CODE.slice(
      CODE.indexOf("{...tapSheetAck}"),
      CODE.indexOf("{...tapSheetAck}") + 900,
    );
    expect(ackButton).toContain("ackCarriesSheetFold");
    expect(ackButton).toContain("data-sim-overlay-ack-fold");
    expect(ackButton).toContain("sheetFold.lines");
  });

  it("counts in Bulgarian and agrees with itself on the singular", () => {
    // «↓ още 1 ред» / «↓ още 2 реда». A counter that says „1 реда" is a counter
    // the reader stops trusting, which costs the sheet the one affordance it
    // has at the cut.
    //
    // ASSERTED INSIDE THE BUTTON, not over the whole file: the header's own
    // «↓ още N реда» row carries the identical ternary and predates this
    // repair by ten days, so a file-wide `toContain` would pass against the
    // pre-f91dd1c source and prove nothing.
    const ackButton = CODE.slice(
      CODE.indexOf("{...tapSheetAck}"),
      CODE.indexOf("{...tapSheetAck}") + 900,
    );
    expect(ackButton).toContain('sheetFold.lines === 1 ? "ред" : "реда"');
  });

  it("stands the header's copy down when the button is carrying it", () => {
    // One count per surface. Two rows saying the same number is the „the same
    // sentence was printed twice" defect this component already paid for once.
    expect(CODE).toMatch(/ackCarriesSheetFold\s*\?\s*null\s*:/);
  });

  it("keeps the accessible name «Разбрах» — the cue is for eyes only", () => {
    // Assistive technology reads the whole body out of the DOM regardless of
    // scroll position, so announcing a fold to it would describe a problem it
    // does not have. `aria-hidden` is what keeps the button's name the label.
    const ackButton = CODE.slice(
      CODE.indexOf("{...tapSheetAck}"),
      CODE.indexOf("{...tapSheetAck}") + 900,
    );
    expect(ackButton).toContain("aria-hidden");
  });
});

/**
 * …AND THE CONTROL THAT ADMITS THE FOLD MUST NOT DELETE IT — 2026-09-04.
 *
 * The block above gates the CUE and that is all it ever gated. `tapSheetAck`
 * was `useTapActivation(acknowledge)`: one press ended the briefing whatever
 * «↓ ОЩЕ 2 РЕДА» said two pixels to the right of the label. So the row's own
 * words — „and the rest is hidden" — were still true of the sheet at
 * `w27/…/sc-merge-accel-lane__mobile-right/02-briefing.png`: the two lines the
 * button counted were «…лента — там не се кара», and pressing the button the
 * student is told to press was the one action that guaranteed he never read
 * them. A measurement wired to a label and not to a behaviour is this corpus's
 * dead-predicate class wearing a different coat.
 *
 * The peek has carried the answer since 2026-08-26 and this suite already
 * drives it end-to-end (`sim-overlay-dismiss.test.tsx`, the `cardTapAction`
 * block): scroll to the end first, acknowledge on the next press. What is
 * asserted here is the WIRING — that the sheet's acknowledgement calls that
 * same exported branch against its OWN window — because the arithmetic is
 * already gated and cannot be gated twice, and because jsdom has no layout
 * engine, so a rendered press of this button reports `scrollHeight === 0` and
 * would take the dismiss branch no matter what the component did.
 */
describe("the sheet's «Разбрах» reveals before it ends (sc-merge-accel-lane:b75b356e)", () => {
  /**
   * The handler's body, comments already stripped by `CODE` — and cut at its
   * OWN terminator rather than at a character count.
   *
   * IT USED TO BE `+ 900` AND THAT WAS A BUG IN THIS FILE, not a stylistic
   * point (2026-09-09, sc-vu-emergency:2e634d4d). A fixed-width slice reads
   * whatever happens to follow the subject, so the pinned ABSENCE below — „this
   * handler must not read `peekFold`" — became an assertion about the next
   * declaration in the component. The moment the PEEK's own «Разбрах» was given
   * the same reveal-before-you-end rule one block down, this test failed while
   * the sheet's handler was byte-identical. `\n  });` is the handler's own
   * closing indent; every nested call inside it closes deeper.
   */
  const HANDLER = ((): string => {
    const at = CODE.indexOf("const tapSheetAck = useTapActivation(");
    expect(at, "the sheet's acknowledgement handler is gone").toBeGreaterThan(-1);
    const end = CODE.indexOf("\n  });", at);
    expect(end, "the handler does not close where its indent says").toBeGreaterThan(at);
    return CODE.slice(at, end + "\n  });".length);
  })();

  it("no longer acknowledges unconditionally", () => {
    // The exact shape this repair replaces. Pinned as an absence because it is
    // a one-line revert away, and the revert is silent: the button keeps its
    // label, its cue and its markup, and only the student loses the sentence.
    expect(CODE).not.toMatch(/const\s+tapSheetAck\s*=\s*useTapActivation\(\s*acknowledge\s*\)/);
  });

  it("reads the SHEET's own text window, not the peek's and not a stale count", () => {
    // `sheetFold.ref`, at tap time: `sheetFold.lines` is refreshed by a
    // `ResizeObserver` and by `onScroll`, and a tap that ends the briefing may
    // not depend on which of them ran last.
    expect(HANDLER).toContain("sheetFold.ref.current");
    expect(HANDLER).not.toContain("peekFold");
    expect(HANDLER).toContain("scrollHeight: el.scrollHeight");
    expect(HANDLER).toContain("padBottomPx");
  });

  it("routes through the exported branch instead of re-deciding inline", () => {
    // Re-deciding here is exactly how the ✕-scrolls regression survived 729
    // green tests: the arithmetic was right and the component did not call it.
    expect(HANDLER).toContain("cardTapAction({");
    // This button paints no ✕ — it IS the acknowledgement — so the glyph half
    // of the branch is answered here and not left to a coordinate that never
    // arrives.
    expect(HANDLER).toMatch(/onDismissGlyph:\s*false/);
  });

  it("scrolls FIRST and only then acknowledges", () => {
    const scroll = HANDLER.indexOf("el.scrollTo({ top: action.top })");
    const ack = HANDLER.indexOf("acknowledge();");
    expect(scroll, "the scroll branch is gone").toBeGreaterThan(-1);
    expect(ack, "the button no longer acknowledges at all").toBeGreaterThan(-1);
    expect(scroll).toBeLessThan(ack);
    // …and the scroll branch RETURNS, so one press can never do both.
    expect(HANDLER.slice(scroll, ack)).toContain("return;");
  });

  it("leaves the ✕ and the keyboard as one-press exits", () => {
    // A blocking sheet with no single-press way out is a worse defect than the
    // fold. The ✕ closes the sheet outright, and Space/Enter still acknowledges
    // — assistive technology reads the whole body out of the DOM regardless of
    // scroll position, which is why the cue is `aria-hidden` in the first place.
    expect(CODE).toMatch(/const\s+tapCloseSheet\s*=\s*useTapActivation\(\(\)\s*=>\s*setOpenItem\(null\)\)/);
    expect(CODE).toMatch(/if\s*\(blocking\)\s*acknowledge\(\);/);
  });
});
