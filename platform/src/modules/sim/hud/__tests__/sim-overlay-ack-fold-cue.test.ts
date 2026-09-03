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
