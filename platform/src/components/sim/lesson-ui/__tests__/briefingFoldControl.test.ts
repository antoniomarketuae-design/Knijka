/**
 * =============================================================================
 * THE BRIEFING'S FOLD HAD A COUNTER AND NO CONTROL — w11, 2026-08-27.
 * =============================================================================
 *
 * TWO ROWS, ONE MECHANISM, both re-judged STILL on the w11 re-drive:
 *
 *   sc-ov-crest-curve:79eb1226      „The PC ИНСТРУКЦИИ panel cuts off after
 *     item 4 with no scrollbar — items 5 and 6, which carry the whole decision
 *     rule (wait for the straight, overtake only with a clear stretch), are
 *     simply not shown."
 *   sc-sp-wet-limit-plate:f687c293  „…the last steps of the briefing are never
 *     drawn." The verifier cropped the list's right edge at ×5 and found „no
 *     scrollbar of any kind", then quoted `LessonPlayShell`'s own admission
 *     back at it: `scrollbar-width: thin` paints an OVERLAY bar that exists
 *     only DURING a scroll, „which is the engine the founder is actually on".
 *
 * So the scroll existed and could not be ASKED FOR — word for word the
 * diagnosis the sibling toast column got on 2026-08-26, whose repair
 * (`revealMoreToasts` + `toastPageScrollTop`) this one takes rather than
 * re-derives. „A sentence that names a gesture is not an affordance; a thing
 * you press is."
 *
 * AND A THIRD ROW, WHICH IS THE SAME CARD SEEN FROM THE ROAD:
 *
 *   sc-ov-crossing-overtake:4bce6fca  „The ИНСТРУКЦИИ panel covers the right
 *     third of the windscreen." Measured by the verifier at ~320 px of a
 *     ~1165 px stage, on DRIVING beats — `sc-ov-crossing-overtake/pc-right/
 *     04-t112s.png`, 11 км/ч on the approach to a pedestrian crossing, with the
 *     right kerb and the parked cars along it under the card. The same frame
 *     shows the «⌨ Клавиши» legend already folded to its pill, because
 *     `controlsLegendLifetime.ts` — this lane — stands it down at the same
 *     floor. The briefing was the one first-run reading surface in the corridor
 *     with no lifetime and exactly one exit, a ✕ that destroys it.
 *
 * WHY THESE ARE SOURCE ASSERTIONS AND NOT A RENDER. This suite runs in `node`
 * and jsdom has no layout in any case: `scrollTop`, `clientHeight` and
 * `scrollHeight` are all 0 there, so a rendered press would assert that 0
 * stayed 0 and pass whatever the handler did. The arithmetic IS testable and is
 * gated at its own export (`shellClipAffordances.test.ts` drives
 * `toastPageScrollTop` on real numbers); what nothing held is the WIRING — that
 * the row is a control at all, that it is bound to the handler, that the
 * handler feeds the list's own three numbers to the shared function, and that
 * the shell hands the card a real speed instead of a literal. Every one of
 * those is a place a repair can ship a value nothing reads.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { briefingStandsDown } from "../LessonPlayShell";
import { TOUCH_HINT_MOVING_KMH } from "../touchHintLifetime";

const SHELL = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");

/** Code only — `briefingOverflow.test.tsx`'s reason, in its own words: a source
 *  assertion that cannot tell code from the paragraph describing it is not a
 *  guard, it is a ban on writing the reason down. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CODE = stripComments(SHELL);
const CARD = CODE.slice(
  CODE.indexOf("export function BriefingCard({"),
  CODE.indexOf('THE „MICRO MAJOR BUTTON WITH SUB MENU"'),
);

describe("briefingStandsDown · the floor is borrowed, not re-decided", () => {
  it("is the same 5 км/ч the touch hint and the key legend stand down at", () => {
    // Three surfaces in this lane now fold when the car is under way, and a
    // second opinion about what „under way" means is how two of them end up
    // disagreeing on the same frame. The constant is IMPORTED here rather than
    // written, so this case fails if the briefing ever grows its own number.
    expect(TOUCH_HINT_MOVING_KMH).toBe(5);
    expect(briefingStandsDown(TOUCH_HINT_MOVING_KMH)).toBe(false);
    expect(briefingStandsDown(TOUCH_HINT_MOVING_KMH + 0.1)).toBe(true);
  });

  it("a standstill keeps the steps — arrival and 03-ready are 0 км/ч", () => {
    // The rows above are about DRIVING beats. Every `01-arrival` and `03-ready`
    // frame in the catalogue is a stationary car, and folding the briefing
    // there would take the authored steps off the one screen the student reads
    // them on — the opposite defect, shipped as a fix.
    expect(briefingStandsDown(0)).toBe(false);
    expect(briefingStandsDown(4.9)).toBe(false);
  });

  it("reversing is driving", () => {
    // `sim.speedKmh` is a magnitude today. A signed reading arriving later must
    // not be the reason a card is immortal in R — the ruling
    // `controlsLegendStandsDown` already wrote down for the same floor.
    expect(briefingStandsDown(-12)).toBe(true);
  });

  it("NaN is false, and that direction is the deliberate one", () => {
    // A speed that cannot be read is not evidence that anyone is driving, and
    // an unreadable number may never be the thing that removes the teaching.
    expect(briefingStandsDown(Number.NaN)).toBe(false);
    expect(briefingStandsDown(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("the «↓ още N стъпки» row is a CONTROL, and it reaches the last step", () => {
  it("is a button bound to the reveal handler, not a <p>", () => {
    // The shipped row was `<p aria-live="polite">↓ още {below} …</p>`: it told
    // the student something was hidden and gave him nothing to press. The two
    // rows this case exists for are both about the steps being unreachable, so
    // the assertion is that the ROW IS PRESSABLE — a mutation back to a
    // paragraph puts the defect back with the counter still on the frame.
    const row = CARD.slice(CARD.indexOf("</ol>"));
    const openTag = row.indexOf("↓ още {below}");
    expect(openTag, "the counter moved out of the card — re-anchor").toBeGreaterThan(-1);
    const control = row.slice(0, openTag);
    expect(control).toContain("<button");
    expect(control).toContain("onClick={revealMoreSteps}");
    expect(control).not.toContain("<p");
    // …and it still ends in a verb. „покажи" names what the thing he is
    // pressing does; the bare count named nothing he could do.
    expect(row.slice(openTag, openTag + 200)).toContain("покажи");
  });

  it("the handler pages the LIST's own three numbers through the shared arithmetic", () => {
    // The dead-predicate half. `toastPageScrollTop` is pure, exported and
    // already gated on real numbers by `shellClipAffordances.test.ts`; what
    // makes it live here is that the briefing's own scroller is what is handed
    // to it and the result is what is assigned back. A handler that computed
    // the number and dropped it would pass every arithmetic case in the tree.
    const body = CARD.slice(CARD.indexOf("const revealMoreSteps"));
    expect(body.slice(0, body.indexOf("}, [measure]);"))).toContain(
      "ol.scrollTop = toastPageScrollTop(ol.scrollTop, ol.clientHeight, ol.scrollHeight)",
    );
    // …and it re-measures synchronously, so the count, the mask and the row's
    // own disappearance land in the same render as the movement. Without this
    // the last press leaves «↓ още 1 стъпка» on a list with nothing under it.
    expect(body.slice(0, body.indexOf("}, [measure]);"))).toContain("measure();");
  });

  it("the last press does not strand the reader at the bottom", () => {
    // `below` reaching 0 is true of a briefing that FITS and of one paged to
    // its END, and those need opposite chrome: none, and the way back. The
    // second control is therefore bound to the list's POSITION, not to the
    // counter — binding it to `below` would put a permanent «↑» on every
    // briefing short enough to fit, which is the invariant the row has carried
    // since it was written („a briefing that fits carries no chrome").
    const row = CARD.slice(CARD.indexOf("</ol>"));
    expect(row).toContain("below > 0 ? (");
    expect(row).toContain("scrollTopPx > 1 ? (");
    expect(row).toContain("onClick={restartSteps}");
    // The restart handler is a real seek, not a decoration.
    const restart = CARD.slice(CARD.indexOf("const restartSteps"));
    expect(restart.slice(0, restart.indexOf("}, [measure]);"))).toContain("ol.scrollTop = 0;");
  });
});

describe("the card folds instead of blanking the kerb — and folds RECOVERABLY", () => {
  it("the lifetime is wired to the cluster's own speed, not to a literal", () => {
    // The wire is the whole repair: `briefingStandsDown` with nothing feeding
    // it is a predicate no rendered code reads. `snap.speedKmh` is
    // `snapshotOf`'s `lastTick?.speedKmh ?? 0` — the number the instrument
    // prints and the number `rules/engine.ts` grades against.
    const mount = CODE.slice(CODE.indexOf("<BriefingCard"));
    expect(mount.slice(0, mount.indexOf("/>"))).toContain("speedKmh={snap.speedKmh}");
    // …and the predicate is actually consulted inside the card.
    expect(CARD).toContain("briefingStandsDown(speedKmh)");
  });

  it("folds to a control, never to nothing — the THEO-4 half", () => {
    // „A teaching card is never treated this way: it moves, it does not
    // disappear" (PlayAreaStyles, this corridor's own rule). The folded state
    // must therefore be a labelled, pressable chip that says how much is behind
    // it — a `return null` here would be the В27 mistake in a layout file:
    // removing the teaching to satisfy a row about the teaching being in the
    // way.
    // Anchored to the EXPANDED card's root, which is the next thing in the
    // file — `indexOf("return (")` would stop at the folded branch's own.
    const folded = CARD.slice(
      CARD.indexOf("if (folded) {"),
      CARD.indexOf('aria-label="Инструкции за упражнението"'),
    );
    expect(folded, "the folded branch moved — re-anchor").not.toBe("");
    expect(folded).toContain("<button");
    expect(folded).toContain("onClick={unfold}");
    expect(folded).toContain("Инструкции");
    expect(folded).toContain("steps.length");
    expect(folded).not.toMatch(/return\s+null/);
  });

  it("never fires twice, and never against a student who has answered it", () => {
    // „The auto-hide that will not let you look is the same crime as the panel
    // that will not go away, pointing the other way" —
    // `controlsLegendLifetime.ts`. The latch is set BEFORE the fold and again
    // in `unfold`, so a student who opens the chip mid-drive keeps the panel
    // for the rest of the lesson however often the car stops and starts.
    const effect = CARD.slice(CARD.indexOf("const foldedOnceRef"), CARD.indexOf("const measure"));
    expect(effect).toContain("if (foldedOnceRef.current) return;");
    expect(effect).toContain("foldedOnceRef.current = true;");
    const unfold = CARD.slice(CARD.indexOf("const unfold ="), CARD.indexOf("const fold ="));
    expect(unfold).toContain("foldedOnceRef.current = true;");
    expect(unfold).toContain("setFolded(false);");
  });

  it("the ✕ is still a ✕, and the fold is a SECOND control beside it", () => {
    // The card had one exit and it was a one-way door: `onClose` clears
    // `briefingOpen` and nothing re-opens it, so „I want the road back" cost
    // the student the authored steps for the rest of the lesson. The fold does
    // not replace that — a student who has read the briefing is entitled to be
    // rid of it — it stands beside it.
    expect(CARD).toContain('<HudCloseButton onClick={onClose} labelBg="Скрий инструкциите" />');
    expect(CARD).toContain("onClick={fold}");
    expect(CARD).toContain('aria-label="Сгъни инструкциите"');
  });

  it("the fold control is 44 px, on the SAME rect the ✕ beside it uses", () => {
    // Row A6: „a control he cannot hit is the same defect as a control that is
    // not there". The ring stays 18 px and an unpainted `::before` carries the
    // target — the column is `min(15rem, 36vw)` and a painted 44 px square
    // would be a third of its width. `popupClose.test.ts` pins the close rule
    // by its exact selector text, so the fold's rect is a SECOND block rather
    // than a comma; this is the gate that stops the duplicate from drifting.
    const STYLES = readFileSync(resolve(__dirname, "../PlayAreaStyles.tsx"), "utf8");
    const body = (attr: string) =>
      new RegExp(`\\[${attr}\\]::before\\s*\\{([^}]*)\\}`).exec(STYLES)?.[1] ?? "";
    expect(body("data-hud-close")).toContain("2.75rem");
    expect(body("data-hud-fold")).toBe(body("data-hud-close"));
    // …and the handle is actually on the control, or the rule is a dead rule.
    expect(CARD).toContain('data-hud-fold=""');
  });

  it("the fold re-attaches the observer, so the counter cannot go stale", () => {
    // The fold unmounts the `<ol>`. An observer left on the detached node
    // freezes `below` at whatever it read before the card became a chip — a
    // number about a list that is no longer on the glass. `folded` in the deps
    // is what makes re-opening re-observe.
    const effect = CARD.slice(CARD.indexOf("new ResizeObserver(measure)"));
    expect(effect.slice(0, effect.indexOf(");") + 2)).toBeTruthy();
    expect(CARD).toContain("}, [measure, steps, folded]);");
  });
});
