/**
 * THE ROOMY CARD PRINTS WHAT IT HAS ROOM FOR, AND THE REST IS ONE PRESS AWAY —
 * sc-roundabout-entry:fe081cf1, and the three items the adversarial verifier
 * left open on the repair in `HudToasts.tsx`.
 *
 * THE ROW: `.audit-frames/w47/frames/sc-roundabout-entry__pc-right/04-t058s.png`
 * — the PC fault card dies at «…или Б2» (character 322 of a 674-character ring
 * paragraph) behind «↓ обяснението продължава — покажи». The repair measures
 * the card against `[data-hud-toast-scroller]` on arrival and prints the
 * catalogue's `peekBg` when the paragraph cannot be seen whole.
 *
 * WHY THIS FILE EXISTS, in the verifier's words: „Deleting the
 * violationToastBodyBg(...) call leaves every gate green." The mechanism was
 * confirmed LIVE in a real browser and guarded by nothing, which is the shape
 * this programme has measured 51 times in 82 repairs. So:
 *
 *   1 · the pure helpers, each in BOTH directions, including every „no claim"
 *       input that must keep the paragraph exactly as it shipped;
 *   2 · the press composition the card actually calls (the «Защо» chip);
 *   3 · the server render — no DOM, which must be the no-claim paragraph;
 *   4 · THE CARD, MOUNTED AND COMMITTED. The first version of this file stopped
 *       at 3 and pinned the rest by source text, and a second adversarial
 *       verifier found that pin BLIND: eight one-line edits — the measurement
 *       never asked for, never pending, always „paragraph", the pending
 *       collapse removed, the chip unwired, the chip unrendered, focus no
 *       longer held — each killed part of the repair with every gate green. A
 *       layout effect, a ref, a scroller and a mousedown all need a renderer
 *       that COMMITS, so section 4 mounts `HudToasts` through `react-reconciler`
 *       (the build `@react-three/fiber` ships, i.e. the product's own
 *       dependency, at the React this app runs) into stand-in elements that
 *       answer exactly the reads the product makes — `closest`, `offsetHeight`,
 *       `clientHeight`, `style` — from a stated layout model. It is not a DOM
 *       and does not pretend to be: what it proves is ORDER and WIRING (what
 *       the arrival commit holds, what the fit read saw, what a press does),
 *       and the pixel numbers stay the Chromium rig's (`vfy-hudtoast/`);
 *   5 · a SOURCE PIN on the same wiring, now pinning each ARGUMENT and not
 *       just the symbol's name; a pin that cannot find its anchor reports
 *       `unresolved` and FAILS — it never passes by not looking;
 *   6 · THE MUTATION MATRIX. Every edit the verifier named is applied to the
 *       shipped source TEXT, compiled by the transform vitest itself uses
 *       (vite's oxc + module-runner transform) and MOUNTED, and must turn the
 *       behaviour RED — and the unmutated text through that same pipeline must
 *       be green, so the evaluator cannot be the thing that passes. The pin is
 *       asserted on the same text, so each row says which layer catches it.
 *
 * 2026-09-17 — THE w49 OVERTURN. The choice was made once, at arrival, and a
 * crash that pins the car shrinks the column a second later (three-line
 * banner + the advisor's recovery card). Section 4 now also mounts a
 * `ResizeObserver` stand-in the test DELIVERS by hand — only to observers of
 * the element that changed, as an engine does — and walks the card through
 * arrival → shrink → chip → further shrink → growth; the resize rule and the
 * chip's new place („…AND THE CHIP MOVED UP BESIDE THE SENTENCE") run as
 * scenarios too, so a mutant module is judged on them. Section 6 adds the
 * repair's own one-line edits, each of which must go red.
 *
 * 2026-09-17, ROUND 3 — THE VERIFIER'S REGRESSION ON THAT SWITCH. Round 2
 * asked „is the card taller than the window?", so a second fault that pushed
 * a whole paragraph down the stack (and raised the fold row: 243 → 213 px)
 * collapsed it under its reader for no gain. The stand-in now answers WHERE a
 * card is (`offsetTop` / `offsetParent` / `scrollTop`), holds the shell's fold
 * row as a sibling of the scroller, and lays out the hidden copy the product
 * measures a summary with; section 4 walks the push, the row, a card cut where
 * it stands, a summary that would still be cut, a card never seen whole, a
 * scrolled stack and an unmeasurable `offsetParent`, and section 6 removes
 * each of the four rules in turn — every removal must go red.
 *
 * `environment: "node"` (vitest.config.ts). `HTMLElement` and `document` are
 * stubbed for the duration of a mount only (the product asks
 * `instanceof HTMLElement` and `typeof document`), and removed after it, so
 * section 3 still renders with no `document` at all.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import createReconciler from "@react-three/fiber/react-reconciler/index.js";
import {
  ConcurrentRoot,
  DefaultEventPriority,
  NoEventPriority,
} from "@react-three/fiber/react-reconciler/constants.js";
import * as React from "react";
import { createContext, createElement } from "react";
import * as JsxDevRuntime from "react/jsx-dev-runtime";
import * as JsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { moduleRunnerTransform, transformWithOxc } from "vite";
import {
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrExportNameKey,
  ssrImportKey,
  ssrImportMetaKey,
  ssrModuleExportsKey,
} from "vite/module-runner";
import { describe, expect, it, vi } from "vitest";
import type { HudEvent } from "../../contracts";
import * as Rules from "../../rules";
import { makeViolation, violationPeekBg } from "../../rules";
import * as RealHud from "../HudToasts";
import {
  HudToasts,
  initialToastBodyChoice,
  pressLandedOnToastWhy,
  TOAST_FIT_SLACK_PX,
  TOAST_MORE_SELECTOR,
  TOAST_SCROLLER_SELECTOR,
  TOAST_WHY_ATTR,
  TOAST_WHY_LABEL_BG,
  toastBodyChoiceAfterResize,
  toastCardFitsWindow,
  toastCardInWindow,
  toastCardPressAction,
  toastSummaryMendsCut,
  violationToastBodyBg,
} from "../HudToasts";
import * as HudPreferences from "../hudPreferences";
import * as SimOverlayModule from "../SimOverlay";

const HUD_PATH = resolve(__dirname, "../HudToasts.tsx");
const HUD_SRC = readFileSync(HUD_PATH, "utf8");
const SHELL_SRC = readFileSync(
  resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
  "utf8",
);

type ViolationEvent = Extract<HudEvent, { kind: "violation" }>;

/** The row's own card, built the way `lessons/engine.ts` builds it. */
function ringEvent(): ViolationEvent {
  const v = makeViolation("FAILED_TO_YIELD", 1, { detail: "roundabout" });
  const peekBg = violationPeekBg("FAILED_TO_YIELD", "roundabout");
  return {
    kind: "violation",
    titleBg: v.titleBg,
    explanationBg: v.explanationBg,
    points: v.points,
    severity: v.severityClass,
    lawRef: v.lawRef,
    ...(peekBg === null ? {} : { peekBg }),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   1 · THE HELPERS, BOTH DIRECTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

describe("toastCardFitsWindow — a cut is called a cut, and nothing else is", () => {
  it("a card inside its window fits, and one past it does not", () => {
    // The pair is the mutation guard: a helper returning a constant passes one.
    expect(toastCardFitsWindow(177, 235)).toBe(true);
    // The rig's ring card, paragraph in flow, in the 650 px stage's column.
    expect(toastCardFitsWindow(408, 235)).toBe(false);
  });

  it("the slack is rounding and only rounding", () => {
    expect(TOAST_FIT_SLACK_PX).toBe(1);
    expect(toastCardFitsWindow(235, 235)).toBe(true);
    expect(toastCardFitsWindow(235 + TOAST_FIT_SLACK_PX, 235)).toBe(true);
    expect(toastCardFitsWindow(235 + TOAST_FIT_SLACK_PX + 1, 235)).toBe(false);
  });

  it("an instrument that cannot read keeps the paragraph — every way it can fail to read", () => {
    // `true` IS the paragraph. An unlaid box (0), a non-finite read and a
    // nonsense negative are all NO CLAIM, and no claim is the card as shipped.
    for (const [card, win] of [
      [408, 0],
      [0, 235],
      [0, 0],
      [Number.NaN, 235],
      [408, Number.NaN],
      [Number.POSITIVE_INFINITY, 235],
      [408, Number.POSITIVE_INFINITY],
      [-5, 235],
      [408, -1],
    ] as const) {
      expect(toastCardFitsWindow(card, win), `${card} in ${win}`).toBe(true);
    }
  });
});

describe("violationToastBodyBg — the summary replaces a cut paragraph, never a whole one, never with nothing", () => {
  const ring = ringEvent();

  it("the row's card really has both strings, and they are different", () => {
    // If the catalogue stopped routing a ring summary, every case below would
    // be asserting about a card the row does not produce.
    expect(ring.peekBg).toBe("Колата в кръга има предимство и идва отляво.");
    expect(ring.explanationBg.length).toBeGreaterThan(600);
  });

  it("shown whole → the paragraph; cut → the summary", () => {
    expect(violationToastBodyBg(ring, true)).toBe(ring.explanationBg);
    expect(violationToastBodyBg(ring, false)).toBe(ring.peekBg);
  });

  it("no summary to fall back to → the paragraph, cut or not (a blank body is a bare verdict)", () => {
    const { peekBg: _drop, ...noPeek } = ring;
    void _drop;
    expect(violationToastBodyBg(noPeek, false)).toBe(ring.explanationBg);
    expect(violationToastBodyBg({ ...ring, peekBg: "" }, false)).toBe(ring.explanationBg);
    expect(violationToastBodyBg({ ...ring, peekBg: "   \n " }, false)).toBe(ring.explanationBg);
    // …and a present paragraph is never swapped for a summary it did not need.
    expect(violationToastBodyBg(noPeek, true)).toBe(ring.explanationBg);
  });
});

describe("initialToastBodyChoice — only a card that can fall back AND can be measured waits", () => {
  it("both → pending; either missing → the paragraph from the first render", () => {
    expect(initialToastBodyChoice(true, true)).toBe("pending");
    expect(initialToastBodyChoice(false, true)).toBe("paragraph");
    // No DOM (a server render, section 3) is no claim.
    expect(initialToastBodyChoice(true, false)).toBe("paragraph");
    expect(initialToastBodyChoice(false, false)).toBe("paragraph");
  });
});

describe("toastBodyChoiceAfterResize — a shrinking window may take a paragraph, nothing may give one back", () => {
  it("a paragraph the geometry says to summarise becomes its summary; otherwise it stays", () => {
    expect(toastBodyChoiceAfterResize("paragraph", true)).toBe("summary");
    expect(toastBodyChoiceAfterResize("paragraph", false)).toBe("paragraph");
  });

  it("a summary stays a summary whatever the window does — growing back is the student's «Защо» press", () => {
    expect(toastBodyChoiceAfterResize("summary", true)).toBe("summary");
    expect(toastBodyChoiceAfterResize("summary", false)).toBe("summary");
  });

  it("pending is the arrival measurement's, never the observer's", () => {
    expect(toastBodyChoiceAfterResize("pending", true)).toBe("pending");
    expect(toastBodyChoiceAfterResize("pending", false)).toBe("pending");
  });
});

describe("toastCardInWindow — whole means top AND foot inside the window, where the card stands", () => {
  it("whole, cut at the foot, cut at the top — the slack is rounding and only rounding", () => {
    expect(toastCardInWindow(0, 100, 100)).toBe("whole");
    expect(toastCardInWindow(0, 100 + TOAST_FIT_SLACK_PX, 100)).toBe("whole");
    expect(toastCardInWindow(0, 102, 100)).toBe("cut");
    // The same height lower down the stack is a cut: HEIGHT is not the question.
    expect(toastCardInWindow(84, 100, 150)).toBe("cut");
    expect(toastCardInWindow(50, 100, 150)).toBe("whole");
    // A top the student has scrolled past is not whole, however short the card.
    expect(toastCardInWindow(-TOAST_FIT_SLACK_PX, 50, 150)).toBe("whole");
    expect(toastCardInWindow(-TOAST_FIT_SLACK_PX - 1, 50, 150)).toBe("cut");
  });

  it("an instrument that cannot read makes no claim — every way it can fail to read", () => {
    for (const [top, card, win] of [
      [0, 100, 0],
      [0, 0, 100],
      [0, -5, 100],
      [0, 100, -1],
      [Number.NaN, 100, 100],
      [0, Number.NaN, 100],
      [0, 100, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(toastCardInWindow(top, card, win), `${top} / ${card} in ${win}`).toBe("unmeasured");
    }
  });
});

describe("toastSummaryMendsCut — the four rules, each in both directions", () => {
  /** A 300 px paragraph at the top of a 200 px window, seen whole at the top. */
  const cutAtTop = { contentTopPx: 0, scrollTopPx: 0, cardPx: 300, windowPx: 200 };
  /** The summary's read: its card, in the window it would get (the same, unless a test says otherwise). */
  const summary = (cardPx: number, windowPx = 200) => () => ({ cardPx, windowPx });

  it("cut where it stands, not pushed, summary whole there → summarise", () => {
    expect(toastSummaryMendsCut(cutAtTop, 0, summary(120))).toBe(true);
  });

  it("1 · a card whole where it stands is never touched — and the summary is never measured for it", () => {
    let measured = 0;
    const read = { ...cutAtTop, windowPx: 300 };
    expect(toastSummaryMendsCut(read, 0, () => (measured++, { cardPx: 120, windowPx: 300 }))).toBe(false);
    expect(measured).toBe(0);
  });

  it("1 · …and where it stands is its place in the stack, not its height against the window", () => {
    // 150 px fits a 200 px window by height; 84 px down the stack it is cut.
    const lower = { contentTopPx: 84, scrollTopPx: 0, cardPx: 150, windowPx: 200 };
    expect(toastSummaryMendsCut(lower, 84, summary(100))).toBe(true);
    // Scrolled up by the student 84 px, the same card is whole again.
    expect(toastSummaryMendsCut({ ...lower, scrollTopPx: 84 }, 84, summary(100))).toBe(false);
  });

  it("2 · a card pushed below where it was last seen whole keeps its paragraph — even where a summary would be whole", () => {
    let measured = 0;
    const pushed = { contentTopPx: 84, scrollTopPx: 0, cardPx: 300, windowPx: 243 };
    expect(toastSummaryMendsCut(pushed, 0, () => (measured++, { cardPx: 111, windowPx: 243 }))).toBe(false);
    expect(measured).toBe(0);
    // One pixel of rounding is not a push.
    expect(toastSummaryMendsCut({ ...pushed, contentTopPx: TOAST_FIT_SLACK_PX }, 0, summary(111, 243))).toBe(true);
  });

  it("4 · a summary that would still be cut is no gain — the paragraph stays", () => {
    expect(toastSummaryMendsCut(cutAtTop, 0, summary(202))).toBe(false);
    // The shell's slack, no more and no less: one pixel over is whole to the
    // shell's fold count too, two is not.
    expect(toastSummaryMendsCut(cutAtTop, 0, summary(200 + TOAST_FIT_SLACK_PX))).toBe(true);
    expect(toastSummaryMendsCut(cutAtTop, 0, summary(200 + TOAST_FIT_SLACK_PX + 1))).toBe(false);
    expect(toastSummaryMendsCut(cutAtTop, 0, summary(Number.NaN))).toBe(false);
    expect(toastSummaryMendsCut(cutAtTop, 0, summary(0))).toBe(false);
  });

  it("4 · …judged in the window the SUMMARY would get, not the one the paragraph has", () => {
    // Beside the paragraph the window is 200; beside the shorter summary the
    // column hands part of it back to the briefing and gives the scroller 190.
    expect(toastSummaryMendsCut(cutAtTop, 0, summary(195, 190))).toBe(false);
    expect(toastSummaryMendsCut(cutAtTop, 0, summary(190, 190))).toBe(true);
    expect(toastSummaryMendsCut(cutAtTop, 0, summary(120, Number.NaN))).toBe(false);
  });

  it("a top the student has scrolled past never summarises (no card above the window is whole in it)", () => {
    expect(toastSummaryMendsCut({ ...cutAtTop, scrollTopPx: 50 }, 0, summary(60))).toBe(false);
  });

  it("an unmeasurable read makes no claim", () => {
    expect(toastSummaryMendsCut({ ...cutAtTop, windowPx: 0 }, 0, summary(120))).toBe(false);
    expect(toastSummaryMendsCut({ ...cutAtTop, contentTopPx: Number.NaN }, 0, summary(120))).toBe(false);
  });

  it("the fold row's selector is the shell's attribute", () => {
    expect(TOAST_MORE_SELECTOR).toBe("[data-hud-toast-more]");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2 · THE «ЗАЩО» PRESS — the composition the card calls, not a copy of it
   ═══════════════════════════════════════════════════════════════════════════ */

/** A stand-in for an element: answers `closest` for the selector it is under. */
function el(under: ReadonlyArray<string>) {
  const asked: string[] = [];
  return {
    asked,
    closest(selector: string) {
      asked.push(selector);
      return under.includes(selector) ? {} : null;
    },
  };
}

describe("the chip is a region of the card, and every other press is what it always was", () => {
  const WHY = `[${TOAST_WHY_ATTR}]`;

  it("the chip speaks the phone's word, and says which way it goes", () => {
    expect(TOAST_WHY_ATTR).toBe("data-hud-toast-why");
    expect(TOAST_WHY_LABEL_BG.closed).toMatch(/^Защо\s*↓$/);
    expect(TOAST_WHY_LABEL_BG.open).toMatch(/^Защо\s*↑$/);
  });

  it("a press on the chip is on the chip — and the question asked is the chip's selector", () => {
    const chip = el([WHY]);
    expect(pressLandedOnToastWhy(chip)).toBe(true);
    expect(chip.asked).toEqual([WHY]);
    expect(pressLandedOnToastWhy(el([]))).toBe(false);
  });

  it("anything that cannot answer `closest` is not on the chip", () => {
    for (const t of [null, undefined, "span", 7, {}, { closest: "no" }]) {
      expect(pressLandedOnToastWhy(t)).toBe(false);
    }
  });

  it("interactive card: chip → why, anywhere else → dismiss", () => {
    const card = { interactive: true, hasWhy: true };
    expect(toastCardPressAction(el([WHY]), card)).toBe("why");
    expect(toastCardPressAction(el([]), card)).toBe("dismiss");
    // A keyboard activation targets the <button> itself: dismiss, as shipped.
    expect(toastCardPressAction(null, card)).toBe("dismiss");
  });

  it("a card with NO toggle never lets a chip-shaped target swallow its dismiss", () => {
    expect(toastCardPressAction(el([WHY]), { interactive: true, hasWhy: false })).toBe("dismiss");
  });

  it("the inert column: the chip still toggles, and nothing else does anything", () => {
    const card = { interactive: false, hasWhy: true };
    expect(toastCardPressAction(el([WHY]), card)).toBe("why");
    expect(toastCardPressAction(el([]), card)).toBe("none");
    expect(toastCardPressAction(el([WHY]), { interactive: false, hasWhy: false })).toBe("none");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3 · THE SERVER RENDER — no DOM, no claim
   ═══════════════════════════════════════════════════════════════════════════ */

describe("a server render is no claim — the ring card is its whole paragraph, with no chip", () => {
  it("the column as the shell mounts it", () => {
    const ring = ringEvent();
    // Section 4 stubs `document` only inside a mount; here it must be absent,
    // or this is not the render it claims to be.
    expect(typeof document).toBe("undefined");
    const html = renderToStaticMarkup(
      createElement(HudToasts, {
        toasts: [{ id: 1, event: ring, raisedAtMs: Date.now() }],
        quiet: false,
        onDismiss: () => {},
      }),
    );
    expect(html).toContain('data-hud-toast-body="paragraph"');
    // Tags stripped: the reader's text, which is where the paragraph must be.
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain(ring.explanationBg.slice(0, 120));
    expect(text).not.toContain(ring.peekBg!);
    // No measurement ran, so nothing may be collapsed and no chip offered.
    expect(html).not.toMatch(/data-hud-toast-body="(pending|summary)"/);
    expect(html).not.toContain(TOAST_WHY_ATTR);
    expect(html).not.toMatch(/height:\s*0/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4 · THE CARD, MOUNTED AND COMMITTED
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * THE LAYOUT MODEL the stand-in elements answer from. Deliberately crude and
 * stated: a `<p>` is ⌈chars / 40⌉ lines of 16 px, a collapsed element
 * (`height: 0`) is 0 px, and the card adds a fixed chrome for its header row,
 * padding and footer. The window is the rig's 235 px column. Under it the ring
 * card is 348 px with its paragraph and 108 px with its summary — the same
 * cut / fits split the Chromium rig measured (408 / 177 px), which is the only
 * property the scenarios below rely on, and the one `modelCardPx` re-checks.
 *
 * ROUND 3 adds WHERE (all stated, all crude): the «Защо» chip — any element
 * whose class floats right — adds 4 px to its box, so a copy measured without
 * it measures a different card; cards stack 8 px apart from the top of the
 * scroller, which sits at the top of the column; the column is every element's
 * `offsetParent` (the stack's instead, when a scenario makes it positioned);
 * the fold row is a 23 px sibling 6 px below the scroller. `offsetTop` does
 * not move with `scrollTop`, as in both engines. While the fold row is taken
 * out of flow (`position: absolute`) the scroller answers the window it would
 * have without the row — `rowGivesBackPx`, 29 px (the row and its gap) unless
 * a scenario opens the briefing, which in the shell's column takes most of what
 * the row frees. No rect is answered at all: the path under test reads layout
 * px only, and a rect read — above all on a live card, which enters from
 * `scale(0.96)` — is refused loudly.
 */
const MODEL_CARD_CHROME_PX = 60;
const MODEL_LINE_PX = 16;
const MODEL_CHARS_PER_LINE = 40;
const MODEL_CHIP_PX = 4;
const MODEL_TOAST_GAP_PX = 8;
const MODEL_MORE_ROW_PX = 23;
const MODEL_COLUMN_GAP_PX = 6;
const RIG_WINDOW_PX = 235;

const BODY_ATTR = "data-hud-toast-body";
const SCROLLER_ATTR = "data-hud-toast-scroller";
const MORE_ATTR = "data-hud-toast-more";

/** A newer card that is not a violation: no hooks, no body, 76 px in the model. */
const PRAISE: HudEvent = { kind: "commendation", titleBg: "Добре огледа" };

function modelParagraphPx(text: string): number {
  return Math.ceil(text.length / MODEL_CHARS_PER_LINE) * MODEL_LINE_PX;
}

function modelCardPx(...paragraphs: string[]): number {
  return MODEL_CARD_CHROME_PX + paragraphs.reduce((px, t) => px + modelParagraphPx(t), 0);
}

/** What a mount records — the evidence every scenario is judged on. */
interface Lab {
  /** Per commit (after the mutation phase, before layout effects): every body. */
  commits: Array<ReadonlyArray<{ attr: unknown; collapsed: boolean; text: string }>>;
  /** Every layout read the PRODUCT made, and whether its body was in flow. */
  reads: Array<{ read: "offsetHeight" | "clientHeight"; bodyInFlow: boolean }>;
  /** The body's inline height as the previous commit's effects LEFT it. */
  bodyUpdates: Array<{ commit: number; heightBefore: string | undefined }>;
  /** Extra px every card reports on top of the model — a footer that wrapped. */
  cardGrowPx: number;
  /** Every hidden copy the product laid out, as it was at the moment it was read. */
  copies: Array<{ inColumn: boolean; ariaHidden: unknown; visibility: string | undefined; position: string | undefined; text: string; chip: boolean }>;
  /** Cards' `offsetParent` is the stack, not the column (a positioned box put between). */
  positionedStack: boolean;
  /** What the scroller gets back while the fold row is out of flow. */
  rowGivesBackPx: number;
  /** What the window loses while a live card's body is squeezed to its summary's room (the briefing takes it back). */
  squeezeCostsWindowPx: number;
}

function styleOf(style: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof style !== "object" || style === null) return out;
  for (const [k, v] of Object.entries(style)) {
    if (v === null || v === undefined || v === "") continue;
    // React DOM's own spelling: 0 is "0", other numbers are px.
    out[k] = typeof v === "number" ? (v === 0 ? "0" : `${v}px`) : String(v);
  }
  return out;
}

class HostText {
  parent: HostEl | null = null;
  constructor(public text: string) {}
}

type HostNode = HostEl | HostText;

function isCollapsed(node: HostEl): boolean {
  return node.style.height === "0" || node.style.height === "0px";
}

/** A stand-in element. Answers the reads `HudToasts.tsx` makes, nothing else. */
class HostEl {
  parent: HostEl | null = null;
  readonly children: HostNode[] = [];
  style: Record<string, string>;
  /** Set on the column (and the container) only. */
  lab: Lab | null = null;
  /** The container's `clientHeight`. Every other element answers 0. */
  windowPx = 0;
  /** Which box of the shell's column this is, when it is one. */
  role: "column" | "scroller" | "more" | null = null;
  scrollTop = 0;
  readonly clientTop = 0;

  constructor(
    readonly type: string,
    public props: Record<string, unknown>,
  ) {
    this.style = styleOf(props.style);
  }

  get parentElement(): HostEl | null {
    return this.parent;
  }

  get className(): string {
    return String(this.props.className ?? "");
  }

  set className(value: string) {
    this.props = { ...this.props, className: value };
  }

  set textContent(text: string) {
    for (const c of this.children.splice(0)) c.parent = null;
    const node = new HostText(text);
    node.parent = this;
    this.children.push(node);
  }

  setAttribute(name: string, value: string): void {
    this.props = { ...this.props, [name]: value };
  }

  appendChild(child: HostNode): void {
    this.append(child);
  }

  removeChild(child: HostNode): void {
    this.remove(child);
  }

  /** `[attr]` only, over descendants — anything else is refused loudly. */
  querySelector(selector: string): HostEl | null {
    const m = /^\[([\w-]+)\]$/.exec(selector);
    if (m === null) {
      throw new Error(`UNRESOLVED: the stand-in element cannot answer querySelector(${JSON.stringify(selector)})`);
    }
    return this.descendants().find((d) => m[1] in d.props) ?? null;
  }

  cloneNode(deep: boolean): HostEl {
    const copy = new HostEl(this.type, { ...this.props });
    copy.style = { ...this.style };
    if (deep) {
      for (const c of this.children) copy.append(c instanceof HostText ? new HostText(c.text) : c.cloneNode(true));
    }
    return copy;
  }

  private root(): HostEl {
    let at: HostEl = this;
    while (at.parent !== null) at = at.parent;
    return at;
  }

  private isCard(): boolean {
    return this.className.includes("hud-toast-in");
  }

  /** The card's height in the model — the same number `offsetHeight` returns, without recording a read. */
  private cardLayoutPx(): number {
    return MODEL_CARD_CHROME_PX + (this.rootLab()?.cardGrowPx ?? 0) + this.modelPx();
  }

  get offsetParent(): HostEl | null {
    const root = this.root();
    if (this === root || root.role !== "column") return null;
    if (this.isCard() && this.parent?.props["data-hud"] === "toasts" && root.lab?.positionedStack) return this.parent;
    return root;
  }

  get offsetTop(): number {
    const column = this.root();
    if (this.role === "scroller" || column.role !== "column") return 0;
    const scroller = column.children.find((c): c is HostEl => c instanceof HostEl && c.role === "scroller");
    if (this.role === "more") return (scroller?.windowPx ?? 0) + MODEL_COLUMN_GAP_PX;
    const stack = this.parent;
    if (!this.isCard() || stack === null || stack.props["data-hud"] !== "toasts") return 0;
    let y = 0;
    for (const sibling of stack.children) {
      if (sibling === this) break;
      if (sibling instanceof HostEl) y += sibling.cardLayoutPx() + MODEL_TOAST_GAP_PX;
    }
    return y;
  }

  append(child: HostNode): void {
    child.parent?.remove(child);
    child.parent = this;
    this.children.push(child);
  }

  insertBefore(child: HostNode, before: HostNode): void {
    child.parent?.remove(child);
    const at = this.children.indexOf(before);
    if (at < 0) throw new Error("stand-in: insertBefore's reference node is not a child");
    child.parent = this;
    this.children.splice(at, 0, child);
  }

  remove(child: HostNode): void {
    const at = this.children.indexOf(child);
    if (at < 0) throw new Error("stand-in: removeChild's node is not a child");
    this.children.splice(at, 1);
    child.parent = null;
  }

  get textContent(): string {
    return this.children.map((c) => (c instanceof HostText ? c.text : c.textContent)).join("");
  }

  descendants(): HostEl[] {
    const out: HostEl[] = [];
    for (const c of this.children) {
      if (c instanceof HostEl) out.push(c, ...c.descendants());
    }
    return out;
  }

  /** `[attr]` only — anything else is a question the stand-in refuses loudly. */
  closest(selector: string): HostEl | null {
    const m = /^\[([\w-]+)\]$/.exec(selector);
    if (m === null) {
      throw new Error(`UNRESOLVED: the stand-in element cannot answer closest(${JSON.stringify(selector)})`);
    }
    for (let at: HostEl | null = this; at !== null; at = at.parent) {
      if (m[1] in at.props) return at;
    }
    return null;
  }

  private rootLab(): Lab | null {
    return this.root().lab;
  }

  private bodyInFlow(): boolean {
    return this.descendants()
      .filter((d) => BODY_ATTR in d.props)
      .every((d) => !isCollapsed(d));
  }

  modelPx(): number {
    if (isCollapsed(this)) return 0;
    if (this.type === "p") {
      // An inline px height (the product squeezing a live body for one read) is the height.
      const px = /^(\d+(?:\.\d+)?)px$/.exec(this.style.height ?? "");
      return px !== null ? Number(px[1]) : modelParagraphPx(this.textContent);
    }
    let px = /\bfloat-right\b/.test(this.className) ? MODEL_CHIP_PX : 0;
    for (const c of this.children) if (c instanceof HostEl) px += c.modelPx();
    return px;
  }

  /** A card laid out straight in the column is the product's hidden copy: record what it was when read. */
  private noteCopyRead(): void {
    const lab = this.rootLab();
    if (lab === null || !this.isCard() || this.parent?.role !== "column") return;
    const body = this.querySelector(`[${BODY_ATTR}]`);
    lab.copies.push({
      inColumn: true,
      ariaHidden: this.props["aria-hidden"],
      visibility: this.style.visibility,
      position: this.style.position,
      text: body?.textContent ?? "",
      chip: this.descendants().some((d) => /\bfloat-right\b/.test(d.className)),
    });
  }

  get offsetHeight(): number {
    const lab = this.rootLab();
    lab?.reads.push({ read: "offsetHeight", bodyInFlow: this.bodyInFlow() });
    if (this.role === "scroller") return this.windowPx;
    if (this.role === "more") return MODEL_MORE_ROW_PX;
    if (!this.isCard()) return this.modelPx();
    this.noteCopyRead();
    return this.cardLayoutPx();
  }

  getBoundingClientRect(): never {
    throw new Error(
      `UNRESOLVED: a rect read on a ${this.isCard() ? "card (a live one enters from scale(0.96))" : `<${this.type}>`} — this path reads layout px only`,
    );
  }

  get clientHeight(): number {
    const lab = this.rootLab();
    lab?.reads.push({ read: "clientHeight", bodyInFlow: this.bodyInFlow() });
    if (this.role === "scroller" && lab !== null) {
      const row = this.parent?.children.find((c): c is HostEl => c instanceof HostEl && c.role === "more");
      const squeezed = this.descendants().some((d) => BODY_ATTR in d.props && /^\d+(\.\d+)?px$/.test(d.style.height ?? "") && d.style.height !== "0px");
      const rowPx = row !== undefined && row.style.position === "absolute" ? lab.rowGivesBackPx : 0;
      return this.windowPx + rowPx - (squeezed ? lab.squeezeCostsWindowPx : 0);
    }
    return this.windowPx;
  }

  noteBodyUpdate(): void {
    const lab = this.rootLab();
    if (lab !== null && BODY_ATTR in this.props) {
      lab.bodyUpdates.push({ commit: lab.commits.length, heightBefore: this.style.height });
    }
  }
}

/** The reconciler surface this file calls — the typings lag the 19.2 build. */
interface HostRoot {
  readonly __hostRoot: true;
}
interface MiniReconciler {
  createContainer(
    container: HostEl,
    tag: number,
    hydrationCallbacks: null,
    isStrictMode: boolean,
    concurrentUpdatesByDefaultOverride: null,
    identifierPrefix: string,
    onUncaughtError: (error: unknown) => void,
    onCaughtError: (error: unknown) => void,
    onRecoverableError: (error: unknown) => void,
    transitionCallbacks: null,
  ): HostRoot;
  updateContainerSync(element: React.ReactNode, root: HostRoot, parent: null, callback: null): void;
  flushSyncWork(): void;
  flushPassiveEffects(): boolean;
  flushSyncFromReconciler<R>(fn: () => R): R;
}

const renderErrors: unknown[] = [];
const collectError = (error: unknown) => {
  renderErrors.push(error);
};
let updatePriority: number = NoEventPriority;

/** A mutation-mode host config over `HostEl` — the same keys R3F's 19.2 config sets. */
const HOST_CONFIG = {
  isPrimaryRenderer: false,
  warnsIfNotActing: false,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  createInstance: (type: string, props: Record<string, unknown>) => new HostEl(type, props),
  createTextInstance: (text: string) => new HostText(text),
  appendInitialChild: (parent: HostEl, child: HostNode) => parent.append(child),
  appendChild: (parent: HostEl, child: HostNode) => parent.append(child),
  appendChildToContainer: (parent: HostEl, child: HostNode) => parent.append(child),
  insertBefore: (parent: HostEl, child: HostNode, before: HostNode) => parent.insertBefore(child, before),
  insertInContainerBefore: (parent: HostEl, child: HostNode, before: HostNode) =>
    parent.insertBefore(child, before),
  removeChild: (parent: HostEl, child: HostNode) => parent.remove(child),
  removeChildFromContainer: (parent: HostEl, child: HostNode) => parent.remove(child),
  commitTextUpdate: (node: HostText, _old: string, text: string) => {
    node.text = text;
  },
  commitUpdate: (node: HostEl, _type: string, _old: unknown, next: Record<string, unknown>) => {
    node.noteBodyUpdate();
    node.props = next;
    node.style = styleOf(next.style);
  },
  resetTextContent: () => {},
  clearContainer: (container: HostEl) => {
    for (const c of [...container.children]) container.remove(c);
  },
  finalizeInitialChildren: () => false,
  commitMount: () => {},
  shouldSetTextContent: () => false,
  getRootHostContext: () => ({}),
  getChildHostContext: (parent: object) => parent,
  getPublicInstance: (node: HostNode) => node,
  prepareForCommit: () => null,
  resetAfterCommit: (container: HostEl) => {
    container.lab?.commits.push(
      container
        .descendants()
        .filter((d) => BODY_ATTR in d.props)
        .map((b) => ({ attr: b.props[BODY_ATTR], collapsed: isCollapsed(b), text: b.textContent })),
    );
  },
  preparePortalMount: () => {},
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  detachDeletedInstance: () => {},
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,
  hideInstance: () => {},
  unhideInstance: () => {},
  hideTextInstance: () => {},
  unhideTextInstance: () => {},
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  requestPostPaintCallback: () => {},
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  HostTransitionContext: createContext<unknown>(null),
  resetFormInstance: () => {},
  setCurrentUpdatePriority: (priority: number) => {
    updatePriority = priority;
  },
  getCurrentUpdatePriority: () => updatePriority,
  resolveUpdatePriority: () => (updatePriority !== NoEventPriority ? updatePriority : DefaultEventPriority),
  rendererPackageName: "hud-toast-fit.test",
  rendererVersion: "0.0.0",
  applyViewTransitionName: () => {},
  restoreViewTransitionName: () => {},
  cancelViewTransitionName: () => {},
  cancelRootViewTransitionName: () => {},
  restoreRootViewTransitionName: () => {},
  InstanceMeasurement: null,
  measureInstance: () => null,
  wasInstanceInViewport: () => true,
  hasInstanceChanged: () => false,
  hasInstanceAffectedParent: () => false,
  suspendOnActiveViewTransition: () => {},
  startGestureTransition: () => null,
  startViewTransition: () => null,
  stopViewTransition: () => {},
  createViewTransitionInstance: () => null,
};

const reconciler = (createReconciler as unknown as (config: object) => MiniReconciler)(HOST_CONFIG);

function throwIfRenderErrors(): void {
  if (renderErrors.length === 0) return;
  const [first] = renderErrors.splice(0);
  throw first instanceof Error ? first : new Error(String(first));
}

/** What the scenarios need from the module under test — real or evaluated. */
type HudModule = Pick<
  typeof RealHud,
  "HudToasts" | "toastBodyChoiceAfterResize" | "toastSummaryMendsCut" | "toastCardInWindow"
>;

/** One `ResizeObserver` the product made during a mount. */
interface ObserverRecord {
  targets: HostEl[];
  callback: () => void;
}

interface Column {
  lab: Lab;
  dismissed: number[];
  card(): HostEl | null;
  body(): HostEl | null;
  chip(): HostEl | null;
  find(pred: (node: HostEl) => boolean): HostEl | null;
  /** Bubbles a synthetic event from `target` through every handler above it. */
  press(target: HostEl, handler: "onMouseDown" | "onClick"): { defaultPrevented: boolean };
  /** The shell re-rendering the same column (the age tick, a sibling toast). */
  rerender(): void;
  /** The scroller. */
  container: HostEl;
  /** Every `ResizeObserver` still connected. */
  observers(): ObserverRecord[];
  /**
   * The window becomes `windowPx`, and — as an engine does — only observers of
   * the element that changed are delivered to, inside a discrete-priority
   * flush so the commit it causes is the one the next line reads.
   */
  resize(windowPx: number): void;
  /** Every card grows by `px` in a window that does not move (a footer wrap). */
  growCards(px: number): void;
  /** Every card in the stack, newest first. */
  cards(): HostEl[];
  /** The column the scroller sits in — where the fold row and the hidden copy go. */
  column: HostEl;
  /** The shell's toast list changes (a newer card arrives, an older one expires). */
  setToasts(toasts: ReadonlyArray<{ id: number; event: HudEvent }>): void;
  /** The shell's fold row mounts under the scroller, or unmounts. No delivery. */
  moreRow(up: boolean): void;
  /** Anything left in the column that is not the scroller or the fold row. */
  leftInColumn(): number;
  /** The fold row, while it is up. */
  row(): HostEl | null;
  unmount(): void;
}

/**
 * Mount the column the way `LessonPlayShell` does, inside a scroller of
 * `windowPx`. `HTMLElement` and `document` exist for exactly this mount's life.
 */
function mountColumn(
  mod: HudModule,
  opts: {
    event: ViolationEvent;
    /** The list the shell mounts with, newest first; defaults to `event` alone. */
    toasts?: ReadonlyArray<{ id: number; event: HudEvent }>;
    /** A positioned box between the cards and the column (cards' offsetParent is the stack). */
    positionedStack?: boolean;
    windowPx: number;
    scroller?: boolean;
    interactive: boolean;
    /** `false` mounts in an engine with no `ResizeObserver` at all. */
    resizeObserver?: boolean;
  },
): Column {
  const lab: Lab = {
    commits: [],
    reads: [],
    bodyUpdates: [],
    cardGrowPx: 0,
    copies: [],
    positionedStack: opts.positionedStack === true,
    rowGivesBackPx: MODEL_MORE_ROW_PX + MODEL_COLUMN_GAP_PX,
    squeezeCostsWindowPx: 0,
  };
  const dismissed: number[] = [];
  const container = new HostEl("div", opts.scroller === false ? {} : { [SCROLLER_ATTR]: "" });
  container.lab = lab;
  container.windowPx = opts.windowPx;
  container.role = "scroller";
  // THE COLUMN — `[data-hud="notify-column"]`, the scroller's parent in the shell.
  const column = new HostEl("div", { "data-hud": "notify-column" });
  column.role = "column";
  column.lab = lab;
  column.append(container);
  let moreRow: HostEl | null = null;

  vi.stubGlobal("HTMLElement", HostEl);
  vi.stubGlobal("document", { createElement: (type: string) => new HostEl(type, {}) });
  // THE OBSERVER STAND-IN. It records what the product observes and delivers
  // NOTHING by itself — not even the initial observation — so every delivery
  // in a scenario is one the scenario wrote down.
  const observers = new Set<ObserverRecord>();
  if (opts.resizeObserver !== false) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private readonly record: ObserverRecord;
        constructor(callback: () => void) {
          this.record = { targets: [], callback };
          observers.add(this.record);
        }
        observe(target: unknown) {
          if (!(target instanceof HostEl)) throw new Error("UNRESOLVED: observe() on something that is not a stand-in element");
          this.record.targets.push(target);
        }
        unobserve(target: unknown) {
          this.record.targets = this.record.targets.filter((t) => t !== target);
        }
        disconnect() {
          this.record.targets = [];
          observers.delete(this.record);
        }
      },
    );
  }

  let toasts: ReadonlyArray<{ id: number; event: HudEvent }> = opts.toasts ?? [{ id: 1, event: opts.event }];
  const element = () =>
    createElement(mod.HudToasts, {
      toasts: [...toasts],
      quiet: false,
      ...(opts.interactive ? { onDismiss: (id: number) => void dismissed.push(id) } : {}),
    });
  const root = reconciler.createContainer(
    container,
    ConcurrentRoot,
    null,
    false,
    null,
    "",
    collectError,
    collectError,
    collectError,
    null,
  );
  const commit = (node: React.ReactNode) => {
    reconciler.updateContainerSync(node, root, null, null);
    reconciler.flushSyncWork();
    reconciler.flushPassiveEffects();
    throwIfRenderErrors();
  };

  try {
    commit(element());
  } catch (error) {
    vi.unstubAllGlobals();
    throw error;
  }

  const find = (pred: (node: HostEl) => boolean) => container.descendants().find(pred) ?? null;
  const card = () =>
    find((d) => d.props["data-hud"] === "toasts")?.children.find((c): c is HostEl => c instanceof HostEl) ?? null;
  const deliverTo = (changed: HostEl | null) => {
    if (changed === null) throw new Error("UNRESOLVED: no element to deliver a resize for");
    reconciler.flushSyncFromReconciler(() => {
      for (const o of [...observers]) if (o.targets.includes(changed)) o.callback();
    });
    reconciler.flushPassiveEffects();
    throwIfRenderErrors();
  };
  return {
    lab,
    dismissed,
    find,
    container,
    observers: () => [...observers],
    resize(windowPx) {
      container.windowPx = windowPx;
      deliverTo(container);
    },
    growCards(px) {
      lab.cardGrowPx += px;
      deliverTo(card());
    },
    card,
    cards: () =>
      find((d) => d.props["data-hud"] === "toasts")?.children.filter((c): c is HostEl => c instanceof HostEl) ?? [],
    column,
    setToasts(next) {
      toasts = next;
      commit(element());
    },
    moreRow(up) {
      if (up && moreRow === null) {
        moreRow = new HostEl("button", { [MORE_ATTR]: "" });
        moreRow.role = "more";
        column.append(moreRow);
      } else if (!up && moreRow !== null) {
        column.remove(moreRow);
        moreRow = null;
      }
    },
    leftInColumn: () => column.children.filter((c) => c !== container && c !== moreRow).length,
    row: () => moreRow,
    body: () => find((d) => BODY_ATTR in d.props),
    chip: () => find((d) => TOAST_WHY_ATTR in d.props),
    press(target, handler) {
      const event = {
        target,
        defaultPrevented: false,
        preventDefault() {
          event.defaultPrevented = true;
        },
        stopPropagation() {},
      };
      reconciler.flushSyncFromReconciler(() => {
        for (let at: HostEl | null = target; at !== null; at = at.parent) {
          const fn = at.props[handler];
          if (typeof fn === "function") fn(event);
        }
      });
      reconciler.flushPassiveEffects();
      throwIfRenderErrors();
      return { defaultPrevented: event.defaultPrevented };
    },
    rerender: () => commit(element()),
    unmount() {
      try {
        commit(null);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  };
}

function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/**
 * The arrival: what the FIRST commit holds (the DOM the shell's passive fold
 * measurement reads) and what the product's own fit read saw.
 */
function arrivalFaults(col: Column, want: { waits: boolean; measured: boolean }): string[] {
  const f: string[] = [];
  const first = col.lab.commits[0]?.[0];
  if (first === undefined) return ["unresolved: the arrival commit holds no data-hud-toast-body"];
  if (want.waits) {
    if (first.attr !== "pending") {
      f.push(`the arrival commit is "${String(first.attr)}", not "pending" — the card never waits to be measured`);
    }
    if (!first.collapsed) {
      f.push("the arrival commit's body takes height — the shell's fold measurement sees the paragraph for a frame");
    }
  } else {
    if (first.attr !== "paragraph") {
      f.push(`a card with nothing to decide arrived "${String(first.attr)}", not "paragraph"`);
    }
    if (first.collapsed) f.push("a card with nothing to decide arrived collapsed");
  }
  const cardReads = col.lab.reads.filter((r) => r.read === "offsetHeight");
  const windowReads = col.lab.reads.filter((r) => r.read === "clientHeight");
  if (want.measured) {
    if (cardReads.length !== 1 || windowReads.length !== 1) {
      f.push(
        `the fit was read ${cardReads.length}× on the card and ${windowReads.length}× on the window — not once each, at arrival`,
      );
    }
    if (cardReads.some((r) => !r.bodyInFlow)) f.push("the fit read measured the card with its body collapsed");
    // Only a card that arrived collapsed can be left un-collapsed by the read;
    // otherwise the arrival faults above already name the root cause.
    if (first.attr === "pending" && first.collapsed) {
      const left = col.lab.bodyUpdates.find((u) => u.commit === 1);
      if (left === undefined) f.push("unresolved: a pending card committed no choice");
      else if (left.heightBefore !== "0") {
        f.push(
          `the measurement left the body at height «${left.heightBefore ?? ""}» — the shell's passive effect would read the paragraph`,
        );
      }
    }
  } else if (cardReads.length + windowReads.length > 0) {
    f.push("a card with no claim to make was measured anyway");
  }
  return f;
}

/** The card as it settles: which body, which text, and whether a chip is offered. */
function settledFaults(col: Column, want: { attr: "summary" | "paragraph"; text: string; chip: boolean }): string[] {
  const f: string[] = [];
  const body = col.body();
  if (body === null) return ["unresolved: no data-hud-toast-body after arrival"];
  if (body.props[BODY_ATTR] !== want.attr || body.textContent !== want.text) {
    f.push(
      `the card settled on "${String(body.props[BODY_ATTR])}" «${clip(body.textContent)}», not ${want.attr === "summary" ? "its summary" : "its paragraph"}`,
    );
  }
  const chip = col.chip();
  if (want.chip && chip === null) f.push("the summarised card offers no «Защо» chip");
  if (!want.chip && chip !== null) f.push("a card showing its paragraph offers a «Защо» chip");
  return f;
}

/** The row's card in the rig's window: the repair's whole reason to exist. */
function cutCardFaults(mod: HudModule, interactive: boolean): string[] {
  const ring = ringEvent();
  const cardPx = modelCardPx(ring.titleBg, ring.explanationBg);
  const summaryPx = modelCardPx(ring.titleBg, ring.peekBg ?? "");
  if (toastCardFitsWindow(cardPx, RIG_WINDOW_PX) || !toastCardFitsWindow(summaryPx, RIG_WINDOW_PX)) {
    return [`unresolved: the model puts the ring card at ${cardPx} / ${summaryPx} px in ${RIG_WINDOW_PX} — not a cut paragraph with a summary that fits`];
  }
  const col = mountColumn(mod, { event: ring, windowPx: RIG_WINDOW_PX, interactive });
  try {
    const f = [
      ...arrivalFaults(col, { waits: true, measured: true }),
      ...settledFaults(col, { attr: "summary", text: ring.peekBg!, chip: true }),
    ];
    const card = col.card();
    if (card === null || card.type !== (interactive ? "button" : "div")) {
      f.push(`unresolved: the ${interactive ? "clickable" : "inert"} card root is not a <${interactive ? "button" : "div"}>`);
      return f;
    }

    // THE CLOCK RE-RENDERS; THE CHOICE DOES NOT MOVE.
    const readsBefore = col.lab.reads.length;
    col.rerender();
    if (col.lab.reads.length !== readsBefore) f.push("a re-render measured the card again — the choice is not latched");
    if (col.body()?.props[BODY_ATTR] !== "summary") f.push("a re-render moved the card off its summary");

    const title = col.find((d) => d.type === "p" && d.textContent === ring.titleBg);
    if (title === null) return [...f, "unresolved: the card's title <p>"];

    // THE CHIP.
    const chip = col.chip();
    if (chip !== null) {
      if (chip.props[TOAST_WHY_ATTR] !== "closed" || chip.textContent !== TOAST_WHY_LABEL_BG.closed) {
        f.push(`the chip does not start closed — it reads "${String(chip.props[TOAST_WHY_ATTR])}" «${chip.textContent}»`);
      }
      if (!col.press(chip, "onMouseDown").defaultPrevented) {
        f.push("a mousedown on the chip does not hold focus — the next Enter would dismiss the card it opened");
      }
      col.press(chip, "onClick");
      if (col.dismissed.length > 0) f.push("a press on the chip dismissed the card");
      const opened = col.body();
      if (opened?.props[BODY_ATTR] !== "paragraph" || opened.textContent !== ring.explanationBg) {
        f.push("a press on the chip did not open the paragraph");
      }
      const openChip = col.chip();
      if (openChip?.props[TOAST_WHY_ATTR] !== "open" || openChip.textContent !== TOAST_WHY_LABEL_BG.open) {
        f.push("the opened chip does not say it closes");
      }
      if (col.lab.reads.length !== readsBefore) f.push("opening the chip re-ran the fit measurement");
      col.press(openChip ?? chip, "onClick");
      if (col.body()?.textContent !== ring.peekBg) f.push("a second press on the chip did not close the paragraph");
    }

    // ANYWHERE ELSE ON THE CARD.
    if (col.press(title, "onMouseDown").defaultPrevented) {
      f.push("a mousedown off the chip is swallowed — the card's own focus behaviour changed");
    }
    col.press(title, "onClick");
    if (interactive && col.dismissed.length !== 1) {
      f.push(`a press off the chip dismissed ${col.dismissed.length} card(s), not 1`);
    }
    if (col.body()?.textContent !== ring.peekBg) f.push("a press off the chip changed the body");
    return f;
  } finally {
    col.unmount();
  }
}

/** Which body the card holds now, and what its chip says. */
function bodyNow(col: Column): string {
  return `${String(col.body()?.props[BODY_ATTR] ?? "none")}/${String(col.chip()?.props[TOAST_WHY_ATTR] ?? "no chip")}`;
}

/**
 * THE w49 OVERTURN, walked end to end on the row's own card: it arrives into a
 * window with room for its paragraph, the crash pins the car and the window
 * shrinks, the student opens and closes «Защо» around a further shrink, and
 * the window then grows back.
 */
function shrinkAfterArrivalFaults(mod: HudModule, interactive: boolean): string[] {
  const ring = ringEvent();
  const ROOMY_PX = 2000;
  if (!toastCardFitsWindow(modelCardPx(ring.titleBg, ring.explanationBg), ROOMY_PX)) {
    return [`unresolved: the model does not fit the ring paragraph in ${ROOMY_PX} px`];
  }
  const col = mountColumn(mod, { event: ring, windowPx: ROOMY_PX, interactive });
  try {
    const f = [
      ...arrivalFaults(col, { waits: true, measured: true }),
      ...settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false }),
    ];
    if (f.length > 0) return f;

    // WATCHED — the scroller for a window that shrinks, the card for a card that grows.
    const live = col.observers();
    if (live.length !== 1) {
      f.push(`a paragraph card that could fall back is watched by ${live.length} observer(s), not 1`);
    } else {
      if (!live[0].targets.includes(col.container)) {
        f.push("the observer does not watch the scroller — a window that shrinks after arrival is never seen");
      }
      if (!live[0].targets.includes(col.card()!)) {
        f.push("the observer does not watch the card — a card that grows in a capped window is never seen");
      }
    }

    // The engine's initial observation, at an unchanged window: nothing moves.
    col.resize(ROOMY_PX);
    if (bodyNow(col) !== "paragraph/no chip") {
      f.push(`the initial observation of an unchanged window moved the card to ${bodyNow(col)}`);
    }

    // THE CRASH PINS THE CAR — the window closes in on the paragraph.
    col.resize(RIG_WINDOW_PX);
    f.push(
      ...settledFaults(col, { attr: "summary", text: ring.peekBg!, chip: true }).map(
        (x) => `after the window shrank: ${x}`,
      ),
    );
    if (col.chip()?.props[TOAST_WHY_ATTR] !== undefined && col.chip()?.props[TOAST_WHY_ATTR] !== "closed") {
      f.push("the chip on a card that just fell back does not start closed");
    }
    if (col.observers().length !== 0) {
      f.push("the observer is still live on a summarised card — something is still listening that could move it");
    }

    // THE WINDOW GROWS BACK — the recovery card dismissed, the banner one line again.
    col.resize(ROOMY_PX);
    if (bodyNow(col) !== "summary/closed") {
      f.push(`a window that grew back left the card at ${bodyNow(col)}, not its closed summary — the card grew by itself`);
    }

    // THE CHIP STILL WORKS, AND AN OPEN CHIP OUTLIVES A SHRINK.
    const chip = col.chip();
    if (chip === null) return [...f, "unresolved: no chip to press after the switch"];
    col.press(chip, "onClick");
    if (bodyNow(col) !== "paragraph/open") f.push(`a press on the chip after the switch left ${bodyNow(col)}, not the open paragraph`);
    col.resize(100);
    if (bodyNow(col) !== "paragraph/open") f.push(`a further shrink under an OPEN chip moved the card to ${bodyNow(col)}`);
    col.press(col.chip() ?? chip, "onClick");
    if (bodyNow(col) !== "summary/closed") f.push(`a second press did not close the paragraph (${bodyNow(col)})`);
    if (interactive && col.dismissed.length > 0) f.push("a press on the chip dismissed the card");
    return f;
  } finally {
    col.unmount();
  }
}

const SCENARIOS: ReadonlyArray<{ name: string; run: (mod: HudModule) => string[] }> = [
  {
    name: "the row's cut card, clickable column: pending on arrival, measured once, summary, chip opens and closes, focus held, dismiss elsewhere",
    run: (mod) => cutCardFaults(mod, true),
  },
  {
    name: "the same card in the inert column: summary and a working chip, and nothing else answers",
    run: (mod) => cutCardFaults(mod, false),
  },
  {
    name: "a card that fits its window: pending on arrival, measured once, keeps its paragraph, no chip",
    run: (mod) => {
      const ring = ringEvent();
      const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
      try {
        return [
          ...arrivalFaults(col, { waits: true, measured: true }),
          ...settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false }),
        ];
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "no summary to fall back to: the paragraph from the first commit, never measured, no chip",
    run: (mod) => {
      const { peekBg: _drop, ...ring } = ringEvent();
      void _drop;
      const col = mountColumn(mod, { event: ring, windowPx: RIG_WINDOW_PX, interactive: true });
      try {
        return [
          ...arrivalFaults(col, { waits: false, measured: false }),
          ...settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false }),
        ];
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "no scroller above the card (the popup rig): no claim — the paragraph",
    run: (mod) => {
      const ring = ringEvent();
      const col = mountColumn(mod, { event: ring, windowPx: RIG_WINDOW_PX, scroller: false, interactive: true });
      try {
        return [
          ...arrivalFaults(col, { waits: true, measured: false }),
          ...settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false }),
        ];
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "a window that has not been laid out (0 px): no claim — the paragraph",
    run: (mod) => {
      const ring = ringEvent();
      const col = mountColumn(mod, { event: ring, windowPx: 0, interactive: true });
      try {
        return [
          ...arrivalFaults(col, { waits: true, measured: true }),
          ...settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false }),
        ];
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "w49: the card fitted on arrival and the window shrank — summary once, closed chip, nothing grows it back, an open chip outlives a further shrink",
    run: (mod) => shrinkAfterArrivalFaults(mod, true),
  },
  {
    name: "w49, the inert column: the same walk",
    run: (mod) => shrinkAfterArrivalFaults(mod, false),
  },
  {
    name: "a card that grows in a window that does not move (a footer wrap) is the same question",
    run: (mod) => {
      const ring = ringEvent();
      const paragraphPx = modelCardPx(ring.titleBg, ring.explanationBg);
      const col = mountColumn(mod, { event: ring, windowPx: paragraphPx + 10, interactive: true });
      try {
        const f = settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false });
        if (f.length > 0) return f;
        col.growCards(40);
        return settledFaults(col, { attr: "summary", text: ring.peekBg!, chip: true }).map(
          (x) => `after the card grew 40 px in its window: ${x}`,
        );
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "a window squeezed to 0 px after arrival is no claim — the paragraph stays, and the next real window asks again",
    run: (mod) => {
      const ring = ringEvent();
      const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
      try {
        const f: string[] = [];
        col.resize(0);
        if (bodyNow(col) !== "paragraph/no chip") f.push(`a 0 px window moved the card to ${bodyNow(col)}`);
        col.resize(RIG_WINDOW_PX);
        if (bodyNow(col) !== "summary/closed") f.push(`the first real window after 0 px left ${bodyNow(col)}, not the summary`);
        return f;
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "no summary to fall back to: nothing is observed, and no shrink moves the paragraph",
    run: (mod) => {
      const { peekBg: _drop, ...ring } = ringEvent();
      void _drop;
      const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
      try {
        const f: string[] = [];
        if (col.observers().length !== 0) f.push(`a card with no summary is watched by ${col.observers().length} observer(s)`);
        col.resize(RIG_WINDOW_PX);
        if (bodyNow(col) !== "paragraph/no chip") f.push(`a card with no summary was moved to ${bodyNow(col)}`);
        return f;
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "an engine with no ResizeObserver: the arrival choice as shipped, and no throw",
    run: (mod) => {
      const ring = ringEvent();
      let col: Column;
      try {
        col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true, resizeObserver: false });
      } catch (error) {
        return [`an engine without ResizeObserver throws on mount: ${error instanceof Error ? error.message : String(error)}`];
      }
      try {
        return settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false });
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "the resize rule, run on the module: one-way, and pending is not its to resolve",
    run: (mod) => {
      const rule = mod.toastBodyChoiceAfterResize;
      const f: string[] = [];
      if (rule("paragraph", true) !== "summary") f.push("a paragraph the geometry says to summarise does not become its summary");
      if (rule("paragraph", false) !== "paragraph") f.push("a paragraph the geometry keeps was moved");
      if (rule("summary", false) !== "summary") f.push("the resize rule grew a summary back to its paragraph");
      if (rule("summary", true) !== "summary") f.push("the resize rule moved a summary");
      if (rule("pending", true) !== "pending" || rule("pending", false) !== "pending") {
        f.push("the resize rule resolved a pending card — that is the arrival measurement's");
      }
      return f;
    },
  },
  {
    name: "the chip floats at the head of the body box, not on the footer row",
    run: (mod) => chipPlacementFaults(mod),
  },
  {
    name: "the geometric rule, run on the module: cut where it stands, not pushed, summary whole — and no claim from a read that cannot be made",
    run: (mod) => geometricRuleFaults(mod),
  },
  {
    name: "round 3 · the verifier's second fault: a whole paragraph pushed down by a newer card, fold row up — keeps its paragraph",
    run: (mod) => pushedByNewerCardFaults(mod),
  },
  {
    name: "round 3 · the fold row is not the window: a paragraph cut only by the row's own box keeps its paragraph",
    run: (mod) => foldRowIsNotTheWindowFaults(mod),
  },
  {
    name: "round 3 · a card fully on the glass is never touched, however the window moved",
    run: (mod) => wholeCardUntouchedFaults(mod),
  },
  {
    name: "round 3 · cut where it stands, not by its height: a card seen whole lower in the stack, then cut there",
    run: (mod) => cutWhereItStandsFaults(mod),
  },
  {
    name: "round 3 · a summary that would still be cut is no gain — and the copy that says so is hidden, in the column, and gone",
    run: (mod) => summaryStillCutFaults(mod),
  },
  {
    name: "round 3 · the copy is the summarised card, chip and all",
    run: (mod) => copyCarriesChipFaults(mod),
  },
  {
    name: "round 3 · rule 4 has the shell's slack exactly: one pixel over switches, two keep the paragraph",
    run: (mod) => summarySlackFaults(mod),
  },
  {
    name: "round 3 · with the briefing open the row frees only a few pixels for the scroller — read, not added up",
    run: (mod) => briefingTakesTheRowFaults(mod),
  },
  {
    name: "round 3 · the summary is judged in the window it would get — a shorter card gives some of the column back",
    run: (mod) => summaryWindowFaults(mod),
  },
  {
    name: "round 3 · a card that never sat whole at the top of the stack (second of a batch) is pushed from birth",
    run: (mod) => neverWholeAtTopFaults(mod),
  },
  {
    name: "round 3 · a card whose offsetParent is not the scroller's is unmeasured — no claim",
    run: (mod) => foreignOffsetParentFaults(mod),
  },
  {
    name: "round 3 · a stack the student has scrolled keeps the paragraph he is paging",
    run: (mod) => scrolledStackFaults(mod),
  },
];

/* ─── round 3 · the narrowed switch, scenario by scenario ─────────────────── */

/** The ring card's two heights in the model, and where it stands under the praise card. */
function ringModel() {
  const ring = ringEvent();
  const paragraphPx = modelCardPx(ring.titleBg, ring.explanationBg);
  const summaryPx = modelCardPx(ring.titleBg, ring.peekBg ?? "") + MODEL_CHIP_PX;
  const praiseTitle = PRAISE.kind === "commendation" ? PRAISE.titleBg : "";
  const praisePx = MODEL_CARD_CHROME_PX + modelParagraphPx(praiseTitle);
  return { ring, paragraphPx, summaryPx, pushedTopPx: praisePx + MODEL_TOAST_GAP_PX };
}

function geometricRuleFaults(mod: HudModule): string[] {
  const f: string[] = [];
  const fit = mod.toastCardInWindow;
  const mends = mod.toastSummaryMendsCut;
  if (fit(0, 100, 100) !== "whole" || fit(0, 102, 100) !== "cut") {
    f.push("toastCardInWindow does not call a whole card whole and a cut card cut");
  }
  if (fit(84, 100, 150) !== "cut") f.push("toastCardInWindow asks the card's height and not where it stands");
  if (fit(-5, 50, 150) !== "cut") f.push("toastCardInWindow calls a card whose top is above the window whole");
  if (fit(0, 100, 0) !== "unmeasured" || fit(0, 0, 100) !== "unmeasured" || fit(Number.NaN, 100, 100) !== "unmeasured") {
    f.push("toastCardInWindow makes a claim from a read that cannot be made");
  }
  const cut = { contentTopPx: 0, scrollTopPx: 0, cardPx: 300, windowPx: 200 };
  const summary = (cardPx: number, windowPx = 200) => () => ({ cardPx, windowPx });
  if (!mends(cut, 0, summary(120))) f.push("toastSummaryMendsCut refuses a cut card whose summary is whole");
  if (mends({ ...cut, windowPx: 300 }, 0, summary(120, 300))) f.push("toastSummaryMendsCut summarises a card fully on the glass");
  if (mends({ ...cut, contentTopPx: 84 }, 0, summary(60))) f.push("toastSummaryMendsCut summarises a card pushed down the stack");
  if (mends(cut, 0, summary(202))) f.push("toastSummaryMendsCut summarises into a summary that is still cut");
  if (mends(cut, 0, summary(195, 190))) f.push("toastSummaryMendsCut judges the summary in the paragraph's window, not its own");
  return f;
}

function pushedByNewerCardFaults(mod: HudModule): string[] {
  const { ring, paragraphPx, summaryPx, pushedTopPx } = ringModel();
  const windowPx = paragraphPx + 10;
  // The model must make the push the ONLY reason to keep the paragraph: the
  // summary would be whole down there, once the row is given back.
  if (pushedTopPx + summaryPx > windowPx) {
    return ["unresolved: in the model the pushed summary would not be whole — the scenario proves nothing"];
  }
  const col = mountColumn(mod, { event: ring, windowPx, interactive: true });
  try {
    const f = settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false });
    if (f.length > 0) return f;
    col.resize(windowPx); // the engine's first observation: whole, at the top
    col.setToasts([
      { id: 2, event: PRAISE },
      { id: 1, event: ring },
    ]);
    col.moreRow(true);
    col.resize(windowPx - MODEL_MORE_ROW_PX - MODEL_COLUMN_GAP_PX); // the row takes its share
    if (bodyNow(col) !== "paragraph/no chip") {
      f.push(`a paragraph pushed down the stack by a newer card collapsed under its reader to ${bodyNow(col)}`);
    }
    if (col.lab.copies.length > 0) {
      f.push("the hidden copy was built for a pushed card — rule 2 must refuse before anything is laid out");
    }
    // The newer card leaves, the row with it: the card is whole at the top again.
    col.setToasts([{ id: 1, event: ring }]);
    col.moreRow(false);
    col.resize(windowPx);
    if (bodyNow(col) !== "paragraph/no chip") {
      f.push(`the card that rose back to the top, whole, was moved to ${bodyNow(col)}`);
    }
    return f;
  } finally {
    col.unmount();
  }
}

function foldRowIsNotTheWindowFaults(mod: HudModule): string[] {
  const { ring, paragraphPx, summaryPx } = ringModel();
  const rowPx = MODEL_MORE_ROW_PX + MODEL_COLUMN_GAP_PX;
  const windowPx = paragraphPx + 2;
  if (paragraphPx <= windowPx - rowPx + TOAST_FIT_SLACK_PX || summaryPx > windowPx - rowPx) {
    return ["unresolved: in the model the row does not cut the paragraph, or the summary would not fit beside the row"];
  }
  const col = mountColumn(mod, { event: ring, windowPx, interactive: true });
  try {
    col.resize(windowPx);
    col.moreRow(true);
    col.resize(windowPx - rowPx);
    return bodyNow(col) === "paragraph/no chip"
      ? []
      : [`the fold row's own box counted as a shrink — the card it was raised beside collapsed to ${bodyNow(col)}`];
  } finally {
    col.unmount();
  }
}

function wholeCardUntouchedFaults(mod: HudModule): string[] {
  const { ring, paragraphPx } = ringModel();
  const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
  try {
    col.resize(2000);
    col.resize(paragraphPx); // closed in on it, and it is still whole
    const f: string[] = [];
    if (bodyNow(col) !== "paragraph/no chip") {
      f.push(`a card fully on the glass was collapsed to ${bodyNow(col)} when the window moved`);
    }
    if (col.lab.copies.length > 0) f.push("the hidden copy was built for a card fully on the glass");
    return f;
  } finally {
    col.unmount();
  }
}

function cutWhereItStandsFaults(mod: HudModule): string[] {
  const { ring, paragraphPx, summaryPx, pushedTopPx } = ringModel();
  const roomyPx = pushedTopPx + paragraphPx + 20;
  const shrunkPx = pushedTopPx + paragraphPx - 20;
  if (!(paragraphPx <= shrunkPx) || pushedTopPx + summaryPx > shrunkPx) {
    return ["unresolved: in the model the card's height alone would not fit the shrunk window, or its summary would not be whole there"];
  }
  const col = mountColumn(mod, { event: ring, windowPx: roomyPx, interactive: true });
  try {
    col.resize(roomyPx);
    col.setToasts([
      { id: 2, event: PRAISE },
      { id: 1, event: ring },
    ]);
    col.resize(roomyPx); // the stack grew; the card is whole where it now stands
    const f = bodyNow(col) === "paragraph/no chip" ? [] : [`a card whole lower in the stack was moved to ${bodyNow(col)}`];
    col.resize(shrunkPx);
    if (bodyNow(col) !== "summary/closed") {
      f.push(
        `a card cut where it stands (its height alone still fits) stayed ${bodyNow(col)} — the switch asked its height, not where it is`,
      );
    }
    return f;
  } finally {
    col.unmount();
  }
}

function summaryStillCutFaults(mod: HudModule): string[] {
  const { ring, summaryPx } = ringModel();
  const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
  try {
    col.resize(2000);
    col.resize(summaryPx - 10);
    const f: string[] = [];
    if (bodyNow(col) !== "paragraph/no chip") {
      f.push(`a paragraph was collapsed to ${bodyNow(col)} although its summary is cut in the same window — no gain, and the text moved`);
    }
    // The copy that answered: laid out once, hidden, outside the live region, removed.
    if (col.lab.copies.length !== 1) {
      f.push(`the summary was measured on ${col.lab.copies.length} hidden copies, not 1`);
    } else {
      const c = col.lab.copies[0];
      if (c.text !== ring.peekBg) f.push("the hidden copy did not carry the summary");
      if (c.ariaHidden !== "true") f.push("the hidden copy is not aria-hidden — a screen reader could meet it");
      if (c.visibility !== "hidden") f.push("the hidden copy is not visibility:hidden");
      if (c.position !== "absolute") f.push("the hidden copy takes a place in the column's flow (not position:absolute)");
    }
    if (col.leftInColumn() !== 0) f.push(`the hidden copy was left in the column (${col.leftInColumn()} extra node(s))`);
    return f;
  } finally {
    col.unmount();
  }
}

function copyCarriesChipFaults(mod: HudModule): string[] {
  const { ring, summaryPx } = ringModel();
  const f: string[] = [];
  // Short of the chip's height by more than the slack: WITH its chip the
  // summary is cut, without it the summary would be whole.
  const tight = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
  try {
    tight.resize(2000);
    tight.resize(summaryPx - MODEL_CHIP_PX + TOAST_FIT_SLACK_PX);
    if (bodyNow(tight) !== "paragraph/no chip") {
      f.push(`a summary that is only whole WITHOUT its chip was taken as whole (${bodyNow(tight)}) — the copy did not carry the chip`);
    }
  } finally {
    tight.unmount();
  }
  // And exactly its height: whole, so the copy is not simply refusing everything.
  const exact = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
  try {
    exact.resize(2000);
    exact.resize(summaryPx);
    if (bodyNow(exact) !== "summary/closed") f.push(`a summary exactly as tall as the window stayed ${bodyNow(exact)}`);
  } finally {
    exact.unmount();
  }
  return f;
}

function summarySlackFaults(mod: HudModule): string[] {
  const { ring, summaryPx } = ringModel();
  const f: string[] = [];
  const over1 = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
  try {
    over1.resize(2000);
    over1.resize(summaryPx - TOAST_FIT_SLACK_PX);
    if (bodyNow(over1) !== "summary/closed") {
      f.push(`a summary within the shell's own slack of its window stayed ${bodyNow(over1)} — rule 4 is stricter than the fold count it must agree with`);
    }
  } finally {
    over1.unmount();
  }
  const over2 = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
  try {
    over2.resize(2000);
    over2.resize(summaryPx - TOAST_FIT_SLACK_PX - 1);
    if (bodyNow(over2) !== "paragraph/no chip") {
      f.push(
        `a summary past the shell's slack was taken as whole (${bodyNow(over2)}) — the shell's fold count calls it cut, the row stays, and the cut grows by the row`,
      );
    }
  } finally {
    over2.unmount();
  }
  return f;
}

function briefingTakesTheRowFaults(mod: HudModule): string[] {
  const { ring, summaryPx } = ringModel();
  const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
  try {
    col.lab.rowGivesBackPx = 3; // the briefing takes the rest of what the row frees
    col.resize(2000);
    col.moreRow(true);
    // With the row up the scroller is 10 px short of the summary. Out of flow,
    // the row frees 3 px for it: still cut. The sum of the row and its gap
    // would promise 29 and call the summary whole.
    col.resize(summaryPx - 10);
    const f: string[] = [];
    if (bodyNow(col) !== "paragraph/no chip") {
      f.push(`the window was added up rather than read — a summary still cut with the briefing open was taken as whole (${bodyNow(col)})`);
    }
    const row = col.row();
    if (row === null) f.push("unresolved: the fold row went missing");
    else if (row.style.position) f.push(`the fold row was left out of flow (position: ${row.style.position}) after the window was read`);
    return f;
  } finally {
    col.unmount();
  }
}

function summaryWindowFaults(mod: HudModule): string[] {
  const { ring, summaryPx } = ringModel();
  const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
  try {
    col.lab.squeezeCostsWindowPx = 6;
    col.resize(2000);
    // Beside the paragraph the window has room for the summary; with the card
    // at the summary's height the column gives 6 px of it back to the briefing.
    col.resize(summaryPx + 2);
    const f: string[] = [];
    if (bodyNow(col) !== "paragraph/no chip") {
      f.push(`the summary was judged in the paragraph's window — it would be cut in its own, and was taken (${bodyNow(col)})`);
    }
    const body = col.body();
    if (body === null) f.push("unresolved: no body after the read");
    else if (body.style.height || body.style.overflow) {
      f.push(`the live body was left squeezed after the read (height «${body.style.height ?? ""}», overflow «${body.style.overflow ?? ""}»)`);
    }
    return f;
  } finally {
    col.unmount();
  }
}

function neverWholeAtTopFaults(mod: HudModule): string[] {
  const { ring, paragraphPx, summaryPx, pushedTopPx } = ringModel();
  const windowPx = paragraphPx + 20; // the arrival test asks height, and says paragraph…
  if (pushedTopPx + paragraphPx <= windowPx + TOAST_FIT_SLACK_PX || pushedTopPx + summaryPx > windowPx) {
    return ["unresolved: in the model the second card is not cut where it arrives, or its summary would not be whole there"];
  }
  const col = mountColumn(mod, {
    event: ring,
    toasts: [
      { id: 2, event: PRAISE },
      { id: 1, event: ring },
    ],
    windowPx,
    interactive: true,
  });
  try {
    const f = settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false });
    if (f.length > 0) return f;
    col.resize(windowPx); // …but it sits under the praise card, cut, and was never whole at the top
    if (bodyNow(col) !== "paragraph/no chip") {
      f.push(`a card that arrived second in a batch, below where every card arrives, was collapsed to ${bodyNow(col)}`);
    }
    return f;
  } finally {
    col.unmount();
  }
}

function foreignOffsetParentFaults(mod: HudModule): string[] {
  const { ring } = ringModel();
  const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true, positionedStack: true });
  try {
    col.resize(2000);
    col.resize(RIG_WINDOW_PX);
    return bodyNow(col) === "paragraph/no chip"
      ? []
      : [`a card measured against a different offsetParent than the scroller's was guessed at and moved to ${bodyNow(col)}`];
  } finally {
    col.unmount();
  }
}

function scrolledStackFaults(mod: HudModule): string[] {
  const { ring, summaryPx } = ringModel();
  const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
  try {
    col.resize(2000);
    col.container.scrollTop = 40;
    col.resize(summaryPx + 60);
    return bodyNow(col) === "paragraph/no chip"
      ? []
      : [`a card the student had scrolled into was collapsed under him to ${bodyNow(col)}`];
  } finally {
    col.unmount();
  }
}


/**
 * WHERE THE CHIP IS — „…AND THE CHIP MOVED UP BESIDE THE SENTENCE". On the
 * footer row it wrapped to a line of its own two seconds in (the card grew
 * 25 px under its reader, 35 of 73 codes) and the w49 −3 card was 139 px in a
 * 119.7 px column; floated beside the summary it is 117 px for its whole
 * life. The stand-in has no layout, so what this runs is the STRUCTURE that
 * layout rests on, on the mounted card: the chip and the body `<p>` share one
 * box, the chip comes first (a float after the text would sit under it), the
 * chip floats, the box contains the float, and nothing of the chip is left in
 * the footer. The pixel numbers are the Chromium/WebKit rig's.
 */
function chipPlacementFaults(mod: HudModule): string[] {
  const ring = ringEvent();
  const col = mountColumn(mod, { event: ring, windowPx: RIG_WINDOW_PX, interactive: true });
  try {
    const chip = col.chip();
    const body = col.body();
    if (chip === null || body === null) return ["unresolved: the summarised card has no chip or no body"];
    const f: string[] = [];
    const box = body.parent;
    if (box === null || chip.parent !== box) {
      f.push("the chip is not in the body's box — it is back on another row of the card");
    } else {
      const at = (n: HostEl) => box.children.indexOf(n);
      if (!(at(chip) < at(body))) f.push("the chip comes after the sentence in its box — a float there drops under the text");
      if (!/\bflow-root\b/.test(String(box.props.className ?? ""))) {
        f.push("the body box does not contain its float (no flow-root) — the footer slides up under the chip");
      }
    }
    if (!/\bfloat-right\b/.test(String(chip.props.className ?? ""))) {
      f.push("the chip does not float — as a row item it narrows every line of an opened paragraph or takes a row of its own");
    }
    // The footer row is the one that holds the citation (and, on a stamped
    // card, the age).
    const law = col.find((d) => d.type === "span" && d.textContent === ring.lawRef);
    if (law === null || law.parent === null) return [...f, "unresolved: no citation row on the card"];
    if (law.parent.descendants().some((d) => TOAST_WHY_ATTR in d.props)) {
      f.push("the chip is on the footer row with the citation and the age — it wraps to a row of its own at «преди 2 с»");
    }
    return f;
  } finally {
    col.unmount();
  }
}

/** Every scenario, faults prefixed by its name. A crash is a fault, not a pass. */
function behaviourFaults(mod: HudModule): string[] {
  const out: string[] = [];
  for (const s of SCENARIOS) {
    try {
      out.push(...s.run(mod).map((f) => `${s.name} :: ${f}`));
    } catch (error) {
      out.push(`${s.name} :: crash: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return out;
}

describe("the card, mounted and committed — the repair does what it says in the order it says", () => {
  it("the stand-ins leave no DOM behind them", () => {
    const col = mountColumn(RealHud, { event: ringEvent(), windowPx: RIG_WINDOW_PX, interactive: true });
    expect(typeof document).toBe("object");
    expect(typeof ResizeObserver).toBe("function");
    col.unmount();
    expect(typeof document).toBe("undefined");
    expect(typeof HTMLElement).toBe("undefined");
    expect(typeof ResizeObserver).toBe("undefined");
  });

  for (const s of SCENARIOS) {
    it(s.name, () => {
      expect(s.run(RealHud)).toEqual([]);
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   5 · THE SAME WIRING, PINNED BY ITS ARGUMENTS
   ═══════════════════════════════════════════════════════════════════════════ */

/** `src.slice(from, to)` where both anchors must exist, or `null`. */
function between(src: string, from: string, to: string): string | null {
  const a = src.indexOf(from);
  if (a < 0) return null;
  const b = src.indexOf(to, a + from.length);
  return b < 0 ? null : src.slice(a, b);
}

/**
 * Everything that would silently turn the repair back into the cut card, or
 * the chip into a control that does nothing. Returns faults; `[]` is green. An
 * anchor it cannot find is a fault named `unresolved:` — never a pass.
 *
 * EACH CHECK PINS THE VALUE, NOT THE NAME. The first version asked
 * `/onWhy=\{/` and `/useToastBodyChoice\(/`, which `onWhy={undefined}` and
 * `useToastBodyChoice(false)` both satisfy. What it still cannot see is a
 * guard made constant INSIDE a function (`… || true`); that is section 4's to
 * catch, by running it, and section 6 records which layer catches which edit.
 */
function wiringFaults(hud: string, shell: string): string[] {
  const faults: string[] = [];

  const toast = between(hud, "function ViolationToast(", "function ToastCard(");
  if (toast === null) {
    faults.push("unresolved: ViolationToast");
  } else {
    // THE BODY. The `<p>` that carries `data-hud-toast-body`, whole.
    const attrAt = toast.indexOf("data-hud-toast-body=");
    const pOpen = attrAt < 0 ? -1 : toast.lastIndexOf("<p", attrAt);
    const pClose = attrAt < 0 ? -1 : toast.indexOf("</p>", attrAt);
    if (pOpen < 0 || pClose < 0) {
      faults.push("unresolved: the data-hud-toast-body <p>");
    } else {
      const p = toast.slice(pOpen, pClose);
      if (!/\{\s*violationToastBodyBg\(\s*event\s*,\s*showParagraph\s*\)\s*\}/.test(p))
        faults.push("the body <p> no longer routes its text through violationToastBodyBg(event, showParagraph)");
      if (/\{\s*event\.(explanationBg|peekBg)\s*\}/.test(p))
        faults.push("the body <p> prints an event string directly");
      if (!/ref=\{bodyRef\}/.test(p))
        faults.push("the body <p> lost ref={bodyRef} — the measurement would read no body");
      if (!/style=\{\s*choice\s*===\s*"pending"\s*\?\s*TOAST_BODY_PENDING_STYLE\s*:\s*undefined\s*\}/.test(p))
        faults.push(
          "the body <p> is no longer collapsed while the choice is pending — the shell's fold measurement would see the paragraph",
        );
    }
    if (!/useToastBodyChoice\(\s*canSummarise\s*,\s*violationToastBodyBg\(\s*event\s*,\s*false\s*\)\s*\)/.test(toast))
      faults.push("ViolationToast no longer measures with useToastBodyChoice(canSummarise, violationToastBodyBg(event, false))");
    if (!/const\s+showParagraph\s*=\s*!summarised\s*\|\|\s*whyOpen\s*;/.test(toast))
      faults.push("showParagraph is no longer «not summarised, or opened by the chip»");
    if (!/cardRef=\{setCard\}/.test(toast)) faults.push("ViolationToast no longer hands its card to the measurement");
    if (!/onWhy=\{\s*summarised\s*\?\s*toggleWhy\s*:\s*undefined\s*\}/.test(toast))
      faults.push("ViolationToast no longer wires the «Защо» chip to its toggle (onWhy={summarised ? toggleWhy : undefined})");
    // THE CHIP, AT THE HEAD OF THE BODY BOX (2026-09-17): the box opens, the
    // chip is its first child, and the body <p> follows it.
    if (!/<div className="mt-1 flow-root">\s*\{\s*summarised\s*\?\s*<ToastWhyChip\b[^>]*\/>\s*:\s*null\s*\}\s*<p\b/.test(toast))
      faults.push(
        'ViolationToast no longer renders the «Защо» chip on a summarised card at the head of the body box (<div className="mt-1 flow-root">{summarised ? <ToastWhyChip …/> : null}<p …)',
      );
    if (/trailing=/.test(toast)) faults.push("the «Защо» chip is handed to the footer row again (trailing=)");
  }

  // THE CHIP'S CLASSES ARE ONE STRING (round 3): the chip and the hidden copy
  // the summary is measured with must lay out the same chip.
  const chipFn = between(hud, "function ToastWhyChip(", "\n}\n");
  const chipClass = /const TOAST_WHY_CHIP_CLASS =\s*"([^"]*)";/.exec(hud);
  if (chipFn === null) faults.push("unresolved: ToastWhyChip");
  else if (!/className=\{TOAST_WHY_CHIP_CLASS\}/.test(chipFn))
    faults.push("the «Защо» chip no longer takes its classes from TOAST_WHY_CHIP_CLASS — the hidden copy would measure a different chip");
  if (chipClass === null) faults.push("unresolved: TOAST_WHY_CHIP_CLASS");
  else if (!/\bfloat-right\b/.test(chipClass[1])) faults.push("the «Защо» chip no longer floats right");

  if (!/const\s+TOAST_BODY_PENDING_STYLE\s*=\s*\{\s*height:\s*0\s*,\s*overflow:\s*"hidden"\s*\}/.test(hud))
    faults.push("TOAST_BODY_PENDING_STYLE no longer takes the pending body's height away");

  const card = between(hud, "function ToastCard(", "export function HudToasts(");
  if (card === null) faults.push("unresolved: ToastCard");
  else if (!/<ViolationToast\b/.test(card)) faults.push("ToastCard no longer renders ViolationToast");

  const measure = between(hud, "function measureToastBodyChoice(", "\n}\n");
  if (measure === null) {
    faults.push("unresolved: measureToastBodyChoice");
  } else {
    if (!/card\.offsetHeight/.test(measure)) faults.push("the fit read is not the card's offsetHeight");
    if (/getBoundingClientRect/.test(measure))
      faults.push("the fit read uses getBoundingClientRect (4 % short under scale(0.96))");
    if (!/\.closest\(\s*TOAST_SCROLLER_SELECTOR\s*\)/.test(measure))
      faults.push("the window is no longer the shell's scroller");
    if (!/scroller\.clientHeight/.test(measure)) faults.push("the window read is not the scroller's clientHeight");
    if (!/body\.style\.height\s*=\s*collapsed\.height/.test(measure))
      faults.push("the body is not collapsed again after the fit read — the shell would measure the paragraph");
    if (!/return\s+fits\s*\?\s*"paragraph"\s*:\s*"summary"/.test(measure))
      faults.push("the measurement no longer answers «fits → paragraph, cut → summary»");
  }

  const hook = between(hud, "function useToastBodyChoice(", "\n}\n");
  if (hook === null) {
    faults.push("unresolved: useToastBodyChoice");
  } else {
    // THE HOOK NOW HOLDS TWO EFFECTS, so each is pinned by what it CALLS: the
    // one that runs the arrival measurement must be a layout effect (it would
    // paint first otherwise); the one that watches the window may be passive.
    const effects = [...hook.matchAll(/\b(useLayoutEffect|useEffect)\(\(\) => \{/g)].map((m) => {
      const end = hook.indexOf("\n  }, [", m.index);
      return { kind: m[1], body: end < 0 ? "" : hook.slice(m.index, end + "\n  }, [".length + 40) };
    });
    const arrival = effects.filter((e) => /measureToastBodyChoice\(/.test(e.body));
    if (arrival.length !== 1) {
      faults.push("unresolved: the one effect that calls measureToastBodyChoice");
    } else {
      if (arrival[0].kind !== "useLayoutEffect")
        faults.push("the arrival choice is made in a passive effect, not a layout effect (it would paint first)");
      if (!/measureToastBodyChoice\(\s*cardRef\.current\s*,\s*bodyRef\.current\s*\)/.test(arrival[0].body))
        faults.push("the choice hook does not call the measurement on its card and body");
    }
    if (!/initialToastBodyChoice\(\s*canSummarise\s*,\s*typeof\s+document\s*!==\s*"undefined"\s*\)/.test(hook))
      faults.push(
        'the choice hook no longer starts pending when it can measure (initialToastBodyChoice(canSummarise, typeof document !== "undefined"))',
      );

    // THE WINDOW, WATCHED (w49).
    const watch = effects.filter((e) => /new\s+ResizeObserver\(/.test(e.body));
    if (watch.length !== 1) {
      faults.push("the choice hook no longer watches the window — no effect creates a ResizeObserver");
    } else {
      const w = watch[0].body;
      if (!/const\s+watchesWindow\s*=\s*canSummarise\s*&&\s*choice\s*===\s*"paragraph"\s*;/.test(hook))
        faults.push('the window is no longer watched exactly while a paragraph could fall back (watchesWindow = canSummarise && choice === "paragraph")');
      if (!/if\s*\(\s*!watchesWindow\s*\)\s*return\s*;/.test(w)) faults.push("the observer effect no longer returns early when nothing is watched");
      if (!/\},\s*\[\s*watchesWindow\s*,\s*summaryBg\s*\]\s*\)/.test(w))
        faults.push("the observer effect no longer keys on watchesWindow and summaryBg");
      if (!/\.observe\(\s*scroller\s*\)/.test(w)) faults.push("the observer no longer watches the scroller");
      if (!/\.observe\(\s*card\s*\)/.test(w)) faults.push("the observer no longer watches the card");
      if (!/\.closest\(\s*TOAST_SCROLLER_SELECTOR\s*\)/.test(w)) faults.push("the observed window is no longer the shell's scroller");
      // ROUND 3: not the arrival test's question — where the card stands.
      if (/toastCardFitsWindow\(/.test(w))
        faults.push("the observer asks the arrival test's question again (height against the window) — round 2's regression");
      if (!/const\s+read\s*=\s*readToastWindow\(\s*card\s*,\s*scroller\s*\)/.test(w))
        faults.push("the observer no longer reads the card where it stands (readToastWindow(card, scroller))");
      if (
        !/toastSummaryMendsCut\(\s*read\s*,\s*wholeContentTopPx\s*,\s*\(\)\s*=>\s*readToastSummaryFit\(\s*card\s*,\s*bodyRef\.current\s*,\s*scroller\s*,\s*summaryBg\s*\)/.test(w)
      )
        faults.push("the observer no longer judges its read with toastSummaryMendsCut against a measured summary");
      if (!/let\s+wholeContentTopPx\s*=\s*0\s*;/.test(w))
        faults.push("the last-seen-whole baseline no longer starts at the top of the stack");
      if (!/setChoice\(\s*\(\s*current\s*\)\s*=>\s*toastBodyChoiceAfterResize\(\s*current\s*,\s*mends\s*\)\s*\)/.test(w))
        faults.push("the observer no longer routes its answer through toastBodyChoiceAfterResize");
      if (!/return\s*\(\)\s*=>\s*observer\.disconnect\(\)\s*;/.test(w)) faults.push("the observer is no longer disconnected when the card stops watching");
    }
  }

  const rule = between(hud, "export function toastBodyChoiceAfterResize(", "\n}\n");
  if (rule === null) faults.push("unresolved: toastBodyChoiceAfterResize");
  else if (!/return\s+current\s*===\s*"paragraph"\s*&&\s*summaryMendsCut\s*\?\s*"summary"\s*:\s*current\s*;/.test(rule))
    faults.push("the resize rule is no longer «a paragraph the geometry says to summarise becomes its summary, and nothing else moves»");

  // THE READ AND THE COPY (round 3).
  const readFn = between(hud, "function readToastWindow(", "\n}\n");
  const probeFn = between(hud, "function readToastScrollerWindow(", "\n}\n");
  const fitFn = between(hud, "function readToastSummaryFit(", "\n}\n");
  if (readFn === null || probeFn === null || fitFn === null) {
    faults.push("unresolved: readToastWindow / readToastScrollerWindow / readToastSummaryFit");
  } else {
    if (/getBoundingClientRect/.test(readFn + probeFn + fitFn))
      faults.push("the read uses a rect — a live card's is 2–3 px low under scale(0.96), and the shell's fold count reads layout px");
    if (!/windowPx:\s*readToastScrollerWindow\(\s*scroller\s*\)/.test(readFn))
      faults.push("the paragraph's window is no longer the probed window");
    if (
      !/more\.style\.position\s*=\s*"absolute"\s*;\s*const\s+windowPx\s*=\s*scroller\.clientHeight\s*;\s*more\.style\.position\s*=\s*position\s*;/.test(probeFn)
    )
      faults.push("the window with the row up is no longer read with the row out of flow (and put back)");
    if (/more\.offsetHeight/.test(probeFn))
      faults.push("the window with the row up is added up from the row's height — wrong whenever the briefing is open");
    if (!/if\s*\(\s*scroller\.scrollTop\s*!==\s*scrollTop\s*\)\s*scroller\.scrollTop\s*=\s*scrollTop\s*;/.test(probeFn))
      faults.push("the probe no longer writes back a scrollTop the grown scroller clamped");
    if (!/return\s*\{\s*cardPx\s*,\s*windowPx:\s*readToastScrollerWindow\(\s*scroller\s*\)\s*\}\s*;\s*\}\s*finally/.test(fitFn))
      faults.push("the summary's window is no longer read with the live card at the summary's height");
    if (
      !/finally\s*\{\s*body\.style\.height\s*=\s*kept\.height\s*;\s*body\.style\.overflow\s*=\s*kept\.overflow\s*;\s*if\s*\(\s*scroller\.scrollTop\s*!==\s*kept\.scrollTop\s*\)\s*scroller\.scrollTop\s*=\s*kept\.scrollTop\s*;\s*\}/.test(
        fitFn,
      )
    )
      faults.push("the live body, or the scrollTop the squeeze clamps, is no longer put back in a finally after the summary's window is read");
    if (!/card\.offsetTop\s*-\s*scroller\.offsetTop\s*-\s*scroller\.clientTop/.test(readFn))
      faults.push("the card's place in the stack is no longer its offsetTop less the scroller's");
    if (!/card\.offsetParent\s*===\s*scroller\.offsetParent/.test(readFn))
      faults.push("the read no longer refuses a card whose offsetParent is not the scroller's");
    if (!/scrollTopPx:\s*scroller\.scrollTop/.test(readFn)) faults.push("the read no longer carries the scroller's scrollTop");
    if (!/querySelector\(\s*TOAST_MORE_SELECTOR\s*\)/.test(probeFn)) faults.push("the read no longer looks for the shell's fold row");
  }
  const copyFn = between(hud, "function measureToastSummaryCardPx(", "\n}\n");
  if (copyFn === null) {
    faults.push("unresolved: measureToastSummaryCardPx");
  } else {
    if (!/card\.cloneNode\(\s*true\s*\)/.test(copyFn))
      faults.push("the summary is no longer measured on a copy of the card — the live card is inside an aria-live region");
    if (!/setAttribute\(\s*"aria-hidden"\s*,\s*"true"\s*\)/.test(copyFn)) faults.push("the hidden copy is no longer aria-hidden");
    if (!/style\.visibility\s*=\s*"hidden"/.test(copyFn)) faults.push("the hidden copy is no longer visibility:hidden");
    if (!/finally\s*\{\s*column\.removeChild\(\s*copy\s*\)\s*;\s*\}/.test(copyFn))
      faults.push("the hidden copy is no longer removed in a finally");
    if (!/const\s+column\s*=\s*scroller\.parentElement\s*;/.test(copyFn))
      faults.push("the hidden copy is no longer laid out in the column, outside the live region and the scroller");
    if (!/chip\.className\s*=\s*TOAST_WHY_CHIP_CLASS/.test(copyFn)) faults.push("the hidden copy's chip no longer carries the chip's own classes");
    if (!/return\s+copy\.offsetHeight\s*;/.test(copyFn))
      faults.push("the hidden copy is no longer read as offsetHeight — the unit the shell's fold count reads the rendered card in");
  }

  const footer = between(hud, "function ToastFooter(", "\n}\n");
  if (footer === null) faults.push("unresolved: ToastFooter");
  else if (/trailing|ToastWhyChip/.test(footer)) faults.push("ToastFooter carries the «Защо» chip again");

  const shellFn = between(hud, "function ToastShell(", "\n}\n");
  if (shellFn === null) {
    faults.push("unresolved: ToastShell");
  } else {
    if (!/toastCardPressAction\(\s*e\.target/.test(shellFn))
      faults.push("ToastShell does not route presses through toastCardPressAction");
    // THE TWO CARD ROOTS — each opening tag, from `<button`/`<div` to the
    // `<ToastGround />` it wraps, so a prop is pinned on the element it rides.
    const roots = [...shellFn.matchAll(/<ToastGround\b/g)].map((m) => {
      const at = Math.max(shellFn.lastIndexOf("<button", m.index), shellFn.lastIndexOf("<div", m.index));
      return at < 0 ? "" : shellFn.slice(at, m.index);
    });
    const button = roots.find((r) => r.startsWith("<button"));
    const inert = roots.find((r) => r.startsWith("<div"));
    if (roots.length !== 2 || button === undefined || inert === undefined) {
      faults.push("unresolved: ToastShell's two card roots (a <button> and a <div>, each over <ToastGround />)");
    } else {
      if (!/onClick=\{press\}/.test(button)) faults.push("the card <button> no longer calls the press composition");
      if (!/onClick=\{\s*hasWhy\s*\?\s*press\s*:\s*undefined\s*\}/.test(inert))
        faults.push("the inert card <div> no longer calls the press composition for its chip");
      for (const [name, tag] of [
        ["<button>", button],
        ["inert <div>", inert],
      ] as const) {
        if (!/onMouseDown=\{\s*hasWhy\s*\?\s*holdFocus\s*:\s*undefined\s*\}/.test(tag))
          faults.push(`the card ${name} no longer holds focus on a «Защо» press (onMouseDown={hasWhy ? holdFocus : undefined})`);
        if (!/ref=\{cardRef\}/.test(tag)) faults.push(`the card ${name} no longer hands its element to the measurement`);
      }
    }
  }

  // THE SHELL END. The selector names the shell's attribute; the attribute must
  // exist on a real element and hold the column the cards mount in.
  if (shell.indexOf('data-hud-toast-more=""') < 0)
    faults.push("LessonPlayShell.tsx no longer carries data-hud-toast-more — rule 3 could never give the row back");
  const scrollerAt = shell.indexOf('data-hud-toast-scroller=""');
  if (scrollerAt < 0) {
    faults.push("LessonPlayShell.tsx no longer carries data-hud-toast-scroller");
  } else {
    const toastsAt = shell.indexOf("<HudToasts", scrollerAt);
    const moreAt = shell.indexOf('data-hud-toast-more=""', scrollerAt);
    if (toastsAt < 0 || (moreAt >= 0 && toastsAt > moreAt))
      faults.push("<HudToasts> is no longer mounted inside [data-hud-toast-scroller]");
  }
  return faults;
}

describe("the repair is wired where section 4 runs it", () => {
  it("the selector is the shell's attribute", () => {
    expect(TOAST_SCROLLER_SELECTOR).toBe("[data-hud-toast-scroller]");
    expect(TOAST_SCROLLER_SELECTOR).toBe(`[${SCROLLER_ATTR}]`);
  });

  it("HudToasts.tsx and LessonPlayShell.tsx, as they are in the tree: no faults", () => {
    expect(wiringFaults(HUD_SRC, SHELL_SRC)).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   6 · MUTATION-TESTED — every edit below is applied to the shipped TEXT
   ═══════════════════════════════════════════════════════════════════════════ */

/** Apply one edit, and refuse a mutation that did not change anything. */
function mutate(src: string, from: string | RegExp, to: string): string {
  const out = src.replace(from, to);
  expect(out, `mutation did not apply: ${String(from)}`).not.toBe(src);
  return out;
}

const MUTANT_DEPS: Readonly<Record<string, unknown>> = {
  react: React,
  "react/jsx-runtime": JsxRuntime,
  "react/jsx-dev-runtime": JsxDevRuntime,
  "../rules": Rules,
  "./hudPreferences": HudPreferences,
  "./SimOverlay": SimOverlayModule,
};

type AsyncFn = (...args: unknown[]) => Promise<void>;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...params: string[]) => AsyncFn;

/**
 * `HudToasts.tsx`'s TEXT, compiled the way vitest compiles the real file (oxc
 * for TSX, then vite's module-runner transform) and evaluated the way vite's
 * `ESModulesEvaluator` evaluates it, against the SAME module instances the real
 * file imports. An import it does not provide is a thrown `UNRESOLVED`, never
 * a stand-in.
 */
async function evaluateHudToasts(src: string): Promise<HudModule> {
  const ts = await transformWithOxc(src, HUD_PATH, { lang: "tsx", jsx: { runtime: "automatic" } });
  const ssr = await moduleRunnerTransform(ts.code, null, HUD_PATH, src);
  if (ssr === null) throw new Error("UNRESOLVED: vite produced no module-runner code for HudToasts.tsx");
  const exported: Record<string, unknown> = {};
  await new AsyncFunction(
    ssrModuleExportsKey,
    ssrImportMetaKey,
    ssrImportKey,
    ssrDynamicImportKey,
    ssrExportAllKey,
    ssrExportNameKey,
    `"use strict";\n${ssr.code}`,
  )(
    exported,
    {},
    (id: string) => {
      if (!(id in MUTANT_DEPS)) {
        throw new Error(`UNRESOLVED: HudToasts.tsx imports "${id}", which this evaluator does not provide`);
      }
      return MUTANT_DEPS[id];
    },
    (id: string) => {
      throw new Error(`UNRESOLVED: HudToasts.tsx dynamically imports "${id}"`);
    },
    () => {
      throw new Error("UNRESOLVED: HudToasts.tsx re-exports a whole module");
    },
    (name: string, getter: () => unknown) =>
      Object.defineProperty(exported, name, { enumerable: true, configurable: true, get: getter }),
  );
  if (typeof exported.HudToasts !== "function") {
    throw new Error("UNRESOLVED: the evaluated HudToasts.tsx exports no HudToasts component");
  }
  return exported as unknown as HudModule;
}

describe("…and the evaluator is not the thing that passes", () => {
  it("the shipped text, through the same transform and mount: every scenario green, every export present", async () => {
    const evaluated = await evaluateHudToasts(HUD_SRC);
    expect(Object.keys(evaluated).sort()).toEqual(Object.keys(RealHud).sort());
    expect(behaviourFaults(evaluated)).toEqual([]);
  });
});

describe("THE VERIFIER'S EIGHT — each one-line edit turns this file RED", () => {
  /**
   * `behaviour` must match a fault from section 4 run on the mutant; `pin` a
   * fault from section 5 on the same text, or `null` where the pin by design
   * cannot see it (a constant guard inside a function body).
   */
  const EIGHT: ReadonlyArray<{
    n: number;
    name: string;
    from: string;
    to: string;
    behaviour: RegExp;
    pin: RegExp | null;
  }> = [
    {
      n: 1,
      name: "the card never asks to be measured — useToastBodyChoice(false)",
      from: "useToastBodyChoice(canSummarise, violationToastBodyBg(event, false))",
      to: "useToastBodyChoice(false, violationToastBodyBg(event, false))",
      behaviour: /not "pending" — the card never waits/,
      pin: /useToastBodyChoice\(canSummarise, violationToastBodyBg/,
    },
    {
      n: 2,
      name: "the paragraph is always shown — const showParagraph = true",
      from: "const showParagraph = !summarised || whyOpen;",
      to: "const showParagraph = true;",
      behaviour: /not its summary/,
      pin: /showParagraph is no longer/,
    },
    {
      n: 3,
      name: "the first render never waits — initialToastBodyChoice(canSummarise, false)",
      from: 'initialToastBodyChoice(canSummarise, typeof document !== "undefined")',
      to: "initialToastBodyChoice(canSummarise, false)",
      behaviour: /not "pending" — the card never waits/,
      pin: /no longer starts pending/,
    },
    {
      n: 4,
      name: "the measurement always answers paragraph — a constant guard",
      from: '  if (card === null || body === null) return "paragraph";',
      to: '  if (card === null || body === null || true) return "paragraph";',
      behaviour: /not its summary/,
      pin: null,
    },
    {
      n: 5,
      name: "the pending body is not collapsed — the one-frame false fold row returns",
      from: 'style={choice === "pending" ? TOAST_BODY_PENDING_STYLE : undefined}',
      to: "",
      behaviour: /arrival commit's body takes height/,
      pin: /no longer collapsed while the choice is pending/,
    },
    {
      n: 6,
      name: "the chip is never wired — onWhy={undefined}",
      from: "onWhy={summarised ? toggleWhy : undefined}",
      to: "onWhy={undefined}",
      behaviour: /a press on the chip dismissed the card|does not hold focus/,
      pin: /chip to its toggle/,
    },
    {
      n: 7,
      // The verifier's edit, at the chip's 2026-09-17 site (it was the footer's
      // `trailing` prop, and the edit is the same: the chip is not rendered).
      name: "the chip is never rendered — {null} where the chip was",
      from: "{summarised ? <ToastWhyChip open={whyOpen} color={meta.color} /> : null}",
      to: "{null}",
      behaviour: /offers no «Защо» chip/,
      pin: /no longer renders the «Защо» chip/,
    },
    {
      n: 8,
      name: "the clickable card no longer holds focus on a chip press — onMouseDown removed",
      from: "      onMouseDown={hasWhy ? holdFocus : undefined}\n      aria-label",
      to: "      aria-label",
      behaviour: /does not hold focus/,
      pin: /card <button> no longer holds focus/,
    },
  ];

  for (const m of EIGHT) {
    it(`#${m.n} ${m.name}`, async () => {
      const src = mutate(HUD_SRC, m.from, m.to);
      const faults = behaviourFaults(await evaluateHudToasts(src));
      expect(faults.length, "the mounted card stayed green on a broken source").toBeGreaterThan(0);
      expect(
        faults.some((f) => m.behaviour.test(f) && !/:: (crash|unresolved)/.test(f)),
        faults.join("\n"),
      ).toBe(true);

      const pinned = wiringFaults(src, SHELL_SRC);
      if (m.pin === null) {
        // Recorded, not hidden: this edit is invisible to text and caught above.
        expect(pinned).toEqual([]);
      } else {
        expect(pinned.some((f) => m.pin!.test(f)), pinned.join(" · ")).toBe(true);
      }
    });
  }
});

describe("THE w49 REPAIR — each one-line edit to the shrink switch or the chip's place turns this file RED", () => {
  /** Same shape and same two layers as the verifier's eight above. */
  const W49: ReadonlyArray<{ name: string; from: string; to: string; behaviour: RegExp; pin: RegExp | null }> = [
    {
      name: "the observer is deleted — the window is never watched",
      from: "  const watchesWindow = canSummarise && choice === \"paragraph\";",
      to: "  const watchesWindow = false;",
      behaviour: /watched by 0 observer\(s\), not 1|after the window shrank: the card settled on "paragraph"/,
      pin: /watched exactly while a paragraph could fall back/,
    },
    {
      name: "the scroller is not observed — a shrinking window is never seen",
      from: "    observer.observe(scroller);\n",
      to: "",
      behaviour: /does not watch the scroller/,
      pin: /no longer watches the scroller/,
    },
    {
      name: "the card is not observed — a card that grows in a capped window is never seen",
      from: "    observer.observe(card);\n",
      to: "",
      behaviour: /does not watch the card|after the card grew 40 px in its window/,
      pin: /no longer watches the card/,
    },
    {
      name: "the observer measures and never switches",
      from: "      setChoice((current) => toastBodyChoiceAfterResize(current, mends));\n",
      to: "      void mends;\n",
      behaviour: /after the window shrank: the card settled on "paragraph"/,
      pin: /no longer routes its answer through toastBodyChoiceAfterResize/,
    },
    {
      name: "the observer stays on after the switch",
      from: "  const watchesWindow = canSummarise && choice === \"paragraph\";",
      to: "  const watchesWindow = canSummarise && choice !== \"pending\";",
      behaviour: /still live on a summarised card/,
      pin: /watched exactly while a paragraph could fall back/,
    },
    {
      name: "the observer is never disconnected",
      from: "    return () => observer.disconnect();\n",
      to: "    return undefined;\n",
      behaviour: /still live on a summarised card/,
      pin: /no longer disconnected/,
    },
    {
      name: "the resize rule grows a summary back when the window allows it",
      from: '  return current === "paragraph" && summaryMendsCut ? "summary" : current;',
      to: '  return current === "pending" ? current : summaryMendsCut ? "summary" : "paragraph";',
      behaviour: /grew a summary back to its paragraph/,
      pin: /resize rule is no longer/,
    },
    {
      // Round 2's edit was on the observer's own height test, which round 3
      // removed; the guard now lives in `toastCardInWindow`. In a mounted walk a
      // 0 px window cannot switch anyway (no summary is whole in it), so the
      // module-level run is what sees this one, and the pin by design cannot.
      name: "a 0 px window counts as a read",
      from: '  if (cardPx <= 0 || windowPx <= 0) return "unmeasured";',
      to: '  if (cardPx <= 0) return "unmeasured";',
      behaviour: /makes a claim from a read that cannot be made/,
      pin: null,
    },
    {
      name: "an engine without ResizeObserver is not guarded",
      from: '    if (card === null || typeof ResizeObserver === "undefined") return;',
      to: "    if (card === null) return;",
      behaviour: /an engine without ResizeObserver throws|no ResizeObserver.*crash|ResizeObserver is not defined/,
      pin: null,
    },
    {
      name: "the chip goes after the sentence — a float there drops under the text",
      from:
        "        {summarised ? <ToastWhyChip open={whyOpen} color={meta.color} /> : null}\n" +
        "        <p\n" +
        "          ref={bodyRef}\n" +
        '          data-hud-toast-body={choice === "pending" ? "pending" : showParagraph ? "paragraph" : "summary"}\n' +
        '          className="text-xs leading-snug text-muted"\n' +
        '          style={choice === "pending" ? TOAST_BODY_PENDING_STYLE : undefined}\n' +
        "        >\n" +
        "          {violationToastBodyBg(event, showParagraph)}\n" +
        "        </p>\n",
      to:
        "        <p\n" +
        "          ref={bodyRef}\n" +
        '          data-hud-toast-body={choice === "pending" ? "pending" : showParagraph ? "paragraph" : "summary"}\n' +
        '          className="text-xs leading-snug text-muted"\n' +
        '          style={choice === "pending" ? TOAST_BODY_PENDING_STYLE : undefined}\n' +
        "        >\n" +
        "          {violationToastBodyBg(event, showParagraph)}\n" +
        "        </p>\n" +
        "        {summarised ? <ToastWhyChip open={whyOpen} color={meta.color} /> : null}\n",
      behaviour: /the chip comes after the sentence/,
      pin: /at the head of the body box/,
    },
    {
      name: "the chip stops floating — a row item",
      from: '"pointer-events-auto float-right ml-1.5 cursor-pointer',
      to: '"pointer-events-auto ml-auto shrink-0 cursor-pointer',
      behaviour: /the chip does not float/,
      pin: /no longer floats right/,
    },
    {
      name: "the body box stops containing its float",
      from: '<div className="mt-1 flow-root">',
      to: '<div className="mt-1">',
      behaviour: /does not contain its float/,
      pin: /at the head of the body box/,
    },
  ];

  for (const m of W49) {
    it(m.name, async () => {
      const src = mutate(HUD_SRC, m.from, m.to);
      const faults = behaviourFaults(await evaluateHudToasts(src));
      expect(faults.length, "the mounted card stayed green on a broken source").toBeGreaterThan(0);
      expect(
        faults.some((f) => m.behaviour.test(f) && !/:: unresolved/.test(f)),
        faults.join("\n"),
      ).toBe(true);
      const pinned = wiringFaults(src, SHELL_SRC);
      if (m.pin === null) {
        expect(pinned).toEqual([]);
      } else {
        expect(pinned.some((f) => m.pin!.test(f)), pinned.join(" · ")).toBe(true);
      }
    });
  }
});

describe("ROUND 3 — each of the four rules, removed, turns this file RED (the verifier's regression comes back)", () => {
  /**
   * Same shape and same two layers as the matrices above. Each edit is one of
   * the ways round 2's switch was wrong, put back: the „actually cut" test
   * removed or asked by height, the push let through, the row counted as a
   * shrink, a summary that is still cut taken, and the copy that answers rule
   * 4 measuring a different card — or left behind, or visible to a reader.
   */
  const R3: ReadonlyArray<{ name: string; from: string; to: string; behaviour: RegExp; pin: RegExp | null }> = [
    {
      name: "rule 1 removed — the «actually cut» condition is gone",
      from: '  if (toastCardInWindow(topPx, read.cardPx, read.windowPx) !== "cut") return false;\n',
      to: "",
      behaviour: /a card fully on the glass was collapsed|summarises a card fully on the glass/,
      pin: null,
    },
    {
      name: "rule 1 asked by height — round 2's question: the card's height against the window, not where it stands",
      from: 'toastCardInWindow(topPx, read.cardPx, read.windowPx) !== "cut"',
      to: 'toastCardInWindow(0, read.cardPx, read.windowPx) !== "cut"',
      behaviour: /the switch asked its height, not where it is/,
      pin: null,
    },
    {
      name: "rule 2 removed — a card pushed down by a newer one collapses (the verifier's 243 → 111)",
      from: "  if (!(read.contentTopPx <= wholeContentTopPx + TOAST_FIT_SLACK_PX)) return false;\n",
      to: "",
      behaviour: /pushed down the stack by a newer card collapsed under its reader|summarises a card pushed down the stack/,
      pin: null,
    },
    {
      name: "rule 2's baseline never set — a card never seen whole at the top is not pushed",
      from: "    let wholeContentTopPx = 0;",
      to: "    let wholeContentTopPx = Number.POSITIVE_INFINITY;",
      behaviour: /arrived second in a batch/,
      pin: /baseline no longer starts at the top of the stack/,
    },
    {
      name: "rule 2's baseline never follows a whole read — a card whole lower in the stack reads as pushed",
      from: "        wholeContentTopPx = read.contentTopPx;\n",
      to: "",
      behaviour: /the switch asked its height, not where it is/,
      pin: null,
    },
    {
      name: "rule 3 removed — the fold row's own box counts as a shrink",
      from: '  more.style.position = "absolute";\n',
      to: "",
      behaviour: /the fold row's own box counted as a shrink/,
      pin: /no longer read with the row out of flow/,
    },
    {
      name: "rule 3 added up — clientHeight plus the row plus its gap, round 2's arithmetic",
      from: '  more.style.position = "absolute";\n  const windowPx = scroller.clientHeight;\n  more.style.position = position;\n',
      to: "  const windowPx = scroller.clientHeight + more.offsetHeight + 6;\n",
      behaviour: /the window was added up rather than read/,
      pin: /added up from the row's height/,
    },
    {
      name: "rule 3's probe is not undone — the row is left out of flow",
      from: "  more.style.position = position;\n",
      to: "",
      behaviour: /the fold row was left out of flow/,
      pin: /no longer read with the row out of flow/,
    },
    {
      name: "rule 4 removed — a summary that is still cut is taken",
      from: '  return toastCardInWindow(topPx, summary.cardPx, summary.windowPx) === "whole";',
      to: "  return true;",
      behaviour: /although its summary is cut in the same window|summarises into a summary that is still cut/,
      pin: null,
    },
    {
      name: "rule 4 stricter than the shell's fold count — a summary the shell calls whole is refused",
      from: 'toastCardInWindow(topPx, summary.cardPx, summary.windowPx) === "whole"',
      to: 'toastCardInWindow(topPx, summary.cardPx + TOAST_FIT_SLACK_PX, summary.windowPx) === "whole"',
      behaviour: /rule 4 is stricter than the fold count it must agree with/,
      pin: null,
    },
    {
      name: "rule 4 looser than the shell's fold count — a summary the shell calls cut is taken",
      from: 'toastCardInWindow(topPx, summary.cardPx, summary.windowPx) === "whole"',
      to: 'toastCardInWindow(topPx, summary.cardPx - TOAST_FIT_SLACK_PX, summary.windowPx) === "whole"',
      behaviour: /a summary past the shell's slack was taken as whole/,
      pin: null,
    },
    {
      name: "rule 4 judged in the paragraph's window — the column gives the shorter card less",
      from: 'toastCardInWindow(topPx, summary.cardPx, summary.windowPx) === "whole"',
      to: 'toastCardInWindow(topPx, summary.cardPx, read.windowPx) === "whole"',
      behaviour: /judged in the paragraph's window|judges the summary in the paragraph's window/,
      pin: null,
    },
    {
      name: "the live card is not squeezed for the summary's read — the read can never be made",
      from: '  body.style.height = `${Math.max(0, body.offsetHeight - shorterByPx)}px`;\n',
      to: "",
      behaviour: /after the window shrank: the card settled on "paragraph"/,
      pin: null,
    },
    {
      name: "the live body is left squeezed after the read",
      from: "    body.style.height = kept.height;\n",
      to: "",
      behaviour: /the live body was left squeezed/,
      pin: /no longer put back in a finally/,
    },
    {
      name: "the copy is measured without its chip",
      from: "  box.insertBefore(chip, body);\n",
      to: "",
      behaviour: /the copy did not carry the chip/,
      pin: null,
    },
    {
      name: "the copy is left in the column",
      from: "    column.removeChild(copy);\n",
      to: "",
      behaviour: /the hidden copy was left in the column/,
      pin: /no longer removed in a finally/,
    },
    {
      name: "the copy is not aria-hidden",
      from: '  copy.setAttribute("aria-hidden", "true");\n',
      to: "",
      behaviour: /not aria-hidden/,
      pin: /no longer aria-hidden/,
    },
    {
      name: "the copy is not hidden",
      from: '  copy.style.visibility = "hidden";\n',
      to: "",
      behaviour: /not visibility:hidden/,
      pin: /no longer visibility:hidden/,
    },
    {
      name: "a card whose offsetParent is not the scroller's is guessed at",
      from: "    contentTopPx: sharedParent ? card.offsetTop - scroller.offsetTop - scroller.clientTop : Number.NaN,",
      to: "    contentTopPx: card.offsetTop - scroller.offsetTop - scroller.clientTop,",
      behaviour: /different offsetParent than the scroller's was guessed at/,
      pin: null,
    },
    {
      name: "a top the student scrolled past counts as inside the window",
      from: "  return topPx >= -TOAST_FIT_SLACK_PX && topPx + cardPx <= windowPx + TOAST_FIT_SLACK_PX ? \"whole\" : \"cut\";",
      to: "  return topPx + cardPx <= windowPx + TOAST_FIT_SLACK_PX ? \"whole\" : \"cut\";",
      behaviour: /scrolled into was collapsed under him|top is above the window whole/,
      pin: null,
    },
  ];

  for (const m of R3) {
    it(m.name, async () => {
      const src = mutate(HUD_SRC, m.from, m.to);
      const faults = behaviourFaults(await evaluateHudToasts(src));
      expect(faults.length, "the mounted card stayed green on a broken source").toBeGreaterThan(0);
      expect(
        faults.some((f) => m.behaviour.test(f) && !/:: (crash|unresolved)/.test(f)),
        faults.join("\n"),
      ).toBe(true);
      const pinned = wiringFaults(src, SHELL_SRC);
      if (m.pin === null) {
        // Recorded, not hidden: a change inside a function body is the running
        // scenarios' to catch, and the pin must not claim it.
        expect(pinned).toEqual([]);
      } else {
        expect(pinned.some((f) => m.pin!.test(f)), pinned.join(" · ")).toBe(true);
      }
    });
  }
});

describe("…and the pin FAILS on each thing it claims to catch (mutation-tested)", () => {
  const cases: ReadonlyArray<{ name: string; hud?: [string | RegExp, string]; shell?: [string | RegExp, string]; expect: RegExp }> = [
    {
      name: "the body prints the paragraph directly (the first verifier's deletion)",
      hud: ["{violationToastBodyBg(event, showParagraph)}", "{event.explanationBg}"],
      expect: /violationToastBodyBg/,
    },
    {
      name: "the fit read goes back to a transformed rect",
      hud: ["toastCardFitsWindow(card.offsetHeight,", "toastCardFitsWindow(card.getBoundingClientRect().height,"],
      expect: /offsetHeight|getBoundingClientRect/,
    },
    {
      name: "the choice moves to a passive effect",
      hud: [/useLayoutEffect\(\(\) => \{\n(\s*)if \(choice !== "pending"\)/, 'useEffect(() => {\n$1if (choice !== "pending")'],
      expect: /layout effect|passive effect/,
    },
    {
      name: "the body loses its ref",
      hud: ["ref={bodyRef}\n", "\n"],
      expect: /bodyRef/,
    },
    {
      name: "the collapse is not restored after the read",
      hud: ["body.style.height = collapsed.height;", ""],
      expect: /collapsed again/,
    },
    {
      name: "the pending style stops collapsing anything",
      hud: ['{ height: 0, overflow: "hidden" }', '{ overflow: "hidden" }'],
      expect: /TOAST_BODY_PENDING_STYLE/,
    },
    {
      name: "the card goes back to dismiss-only",
      hud: ["onClick={press}", "onClick={onDismiss}"],
      expect: /press composition/,
    },
    {
      name: "the inert card loses its hold on focus",
      hud: ["        onMouseDown={hasWhy ? holdFocus : undefined}\n        className", "        className"],
      expect: /inert <div> no longer holds focus/,
    },
    {
      // The stand-in has no scroll anchoring to clamp, so only the pin sees
      // this one. What the browsers see is in the rig: without it Chromium
      // raised „ResizeObserver loop completed with undelivered notifications"
      // on the second-card case, 1 of 1, because the clamp fires a `scroll`
      // the shell answers inside the same delivery.
      name: "the scrollTop the summary squeeze clamps is not put back",
      hud: ["    if (scroller.scrollTop !== kept.scrollTop) scroller.scrollTop = kept.scrollTop;\n", ""],
      expect: /is no longer put back in a finally/,
    },
    {
      name: "the shell drops the scroller attribute",
      shell: ['data-hud-toast-scroller=""', 'data-hud-toast-list=""'],
      expect: /data-hud-toast-scroller/,
    },
    {
      name: "an anchor is renamed — the pin reports it cannot read, it does not pass",
      hud: ["function ViolationToast(", "function FaultToast("],
      expect: /^unresolved: ViolationToast$/,
    },
    {
      name: "a card root loses its <ToastGround /> — the pin cannot find the tag, and says so",
      hud: ["      <ToastGround />\n      {children}\n    </button>", "      {children}\n    </button>"],
      expect: /^unresolved: ToastShell's two card roots/,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const hud = c.hud ? mutate(HUD_SRC, c.hud[0], c.hud[1]) : HUD_SRC;
      const shell = c.shell ? mutate(SHELL_SRC, c.shell[0], c.shell[1]) : SHELL_SRC;
      const faults = wiringFaults(hud, shell);
      expect(faults.length, "the pin stayed green on a broken source").toBeGreaterThan(0);
      expect(faults.some((f) => c.expect.test(f)), faults.join(" · ")).toBe(true);
    });
  }
});
