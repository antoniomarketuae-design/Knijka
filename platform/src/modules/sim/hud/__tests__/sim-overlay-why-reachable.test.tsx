/**
 * THE CONSUMER `whyIsReachable` NEVER HAD.
 *
 * `overlayQueue.whyIsReachable` was added by the referent-gate round with a
 * forty-assertion test and, measured across the whole of `platform/src` minus
 * tests, THREE hits: its own `export function` line and two mentions in prose.
 * It was not on the `hud` barrel either, so by doc 05 nothing outside its own
 * file could have called it even in principle. Its own header names this
 * directory's `SimOverlay.foldLinesBelow` as „the measured half" — and that
 * half was live, called from the fold effect, feeding «↓ още N реда». So the
 * measurement shipped and the judgement did not, which is the precise shape
 * this wave exists to find: a card whose explanation is 39 lines behind a
 * 2.5-line peek renders exactly like one whose explanation fits.
 *
 * `overlay-queue-moment.test.ts` already proves the predicate in isolation, and
 * proving it again is what let it sit unwired for two rounds. THIS file proves
 * the CHAIN instead:
 *
 *   1. the arithmetic that turns a laid-out card into the predicate's two
 *      numbers — `detailLinesInWindow`, against the five frames the predicate
 *      was derived from;
 *   2. that `SimOverlay` really calls both, in CODE and not in a comment — the
 *      scan strips comments first, and proves it stripped them, because this
 *      file's own component carries a warning about a verifier who commented a
 *      line out and watched forty-three tests stay green;
 *   3. the false-alarm direction on the real rendered component: a server
 *      render has measured nothing, so it must claim nothing.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectProps, mountHook } from "./hookHarness";
import { SimOverlay, detailLinesInWindow } from "../SimOverlay";
import { whyIsReachable, type SimOverlayItem } from "../overlayQueue";

/** A graded fault — the kind that owes a WHY and has one. */
function violation(detailBg: string): SimOverlayItem {
  return {
    id: "toast:41",
    kind: "violation",
    tone: "danger",
    chipBg: "−10 т.",
    lineBg: "Опасна грешка",
    detailBg,
    lawRef: "ЗДвП чл. 21",
  };
}

/** 11 px `leading-snug` — the peek's real grain, 15.125 px on the device. */
const LEADING = 15.125;

/**
 * One laid-out card: a body of `detailLines` lines starting `topPx` below the
 * content top, inside a window that is cut at `windowPx`.
 */
function readout(detailLines: number, topPx: number, windowPx: number) {
  return detailLinesInWindow(
    { offsetTop: topPx, heightPx: detailLines * LEADING, lineHeightPx: LEADING },
    { scrollTop: 0, bottomPx: windowPx },
  );
}

describe("detailLinesInWindow — the measured half the predicate refuses to guess", () => {
  it("counts a body that fits entirely inside the cut window", () => {
    // Two lines of line + a three-line body inside a 95.8 px window: the whole
    // explanation is on the glass and the card owes nobody an escalation.
    const r = readout(3, 2 * LEADING, 95.8);
    expect(r.detailLines).toBe(3);
    expect(r.visibleLines).toBe(3);
    expect(whyIsReachable(violation("три реда"), r)).toBe(true);
  });

  it("…and it does NOT credit a line that is two thirds painted", () => {
    // The reassuring direction, refused. The window ends part-way through the
    // third body line; a rounding instrument would call it three.
    const r = detailLinesInWindow(
      { offsetTop: 0, heightPx: 3 * LEADING, lineHeightPx: LEADING },
      { scrollTop: 0, bottomPx: 2 * LEADING + 0.66 * LEADING },
    );
    expect(r.detailLines).toBe(3);
    expect(r.visibleLines).toBe(2);
  });

  it("…and a body that fits EXACTLY is not shaved by a fractional line box", () => {
    // 44.99 px of text against a 15.125 px grain. Without FOLD_SLACK_PX this
    // reports two lines of three and the card escalates over nothing.
    const r = detailLinesInWindow(
      { offsetTop: 0, heightPx: 3 * LEADING - 0.01, lineHeightPx: LEADING },
      { scrollTop: 0, bottomPx: 3 * LEADING - 0.01 },
    );
    expect(r.visibleLines).toBe(3);
  });

  it("THE FIVE FRAMES: an explanation mostly below the fold is not reachable", () => {
    // The peek's own budget after the mirror lane is 95.8 px ≈ 6 lines at
    // 15.125, and the line above the body takes two of them. Each row is one of
    // the frames `whyIsReachable`'s header lists by hidden-line count.
    const frames: readonly { detailLines: number; windowPx: number; hidden: number }[] = [
      { detailLines: 42, windowPx: 3 * LEADING + 2 * LEADING, hidden: 39 },
      { detailLines: 17, windowPx: 2 * LEADING + 2 * LEADING, hidden: 15 },
      { detailLines: 10, windowPx: 2 * LEADING + 2 * LEADING, hidden: 8 },
      { detailLines: 6, windowPx: 1 * LEADING + 2 * LEADING, hidden: 5 },
    ];
    for (const f of frames) {
      const r = readout(f.detailLines, 2 * LEADING, f.windowPx);
      expect(r.detailLines, `${f.hidden} hidden`).toBe(f.detailLines);
      expect(r.detailLines - r.visibleLines, `${f.hidden} hidden`).toBe(f.hidden);
      expect(whyIsReachable(violation("x".repeat(400)), r), `${f.hidden} hidden`).toBe(false);
    }
  });

  it("a body scrolled ABOVE the window counts none of itself as visible", () => {
    // The student has scrolled past it: nothing of the explanation is on the
    // glass at this instant, and „was visible earlier" is not a measurement
    // this function is allowed to make.
    const r = detailLinesInWindow(
      { offsetTop: 0, heightPx: 4 * LEADING, lineHeightPx: LEADING },
      { scrollTop: 200, bottomPx: 60 },
    );
    expect(r.visibleLines).toBe(0);
    expect(r.detailLines).toBe(4);
  });

  it("no body at all is 0/0 — which the predicate reads as „nothing to fold“", () => {
    expect(detailLinesInWindow(null, { scrollTop: 0, bottomPx: 95.8 })).toEqual({
      visibleLines: 0,
      detailLines: 0,
    });
    // …and that is the value the hook starts at, so an unmeasured card is never
    // accused. Proved on the real component three blocks down.
    expect(whyIsReachable(violation("нещо"), { visibleLines: 0, detailLines: 0 })).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   THE BINDING, AND THE INSTRUMENT THAT CANNOT BE SATISFIED BY A COMMENT.

   `SimOverlay.tsx` cannot be laid out in this suite — there is no jsdom in this
   project and `useFoldLines` needs `ResizeObserver`, `getBoundingClientRect`
   and `getComputedStyle` — so the binding is read as source, the device
   `hud-off-the-road.test.ts` and `touchHintLifetime.test.ts` already use on
   files of this shape.

   THE TRAP THAT DEVICE HAS, WRITTEN DOWN IN THIS VERY COMPONENT: „a verifier
   commented this line out and forty-three tests stayed green, because the only
   thing guarding it was a regex over the file's own text and a comment
   satisfies one of those." This file's component is 2 000 lines of prose about
   the fold, so a naive scan for `whyIsReachable` would pass on the comments
   alone. Comments are therefore removed BEFORE the scan, and the remover is
   itself checked against a sentence that exists only in prose.
   ═══════════════════════════════════════════════════════════════════════════ */

const SRC = readFileSync(join(__dirname, "../SimOverlay.tsx"), "utf8");

/** Block comments (including `{/* … *\/}`) and whole-line `//` rows, gone. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

describe("SimOverlay reads the predicate — in code, not in prose", () => {
  const CODE = stripComments(SRC);

  it("the comment remover really removes comments", () => {
    // The instrument's own calibration. This sentence is in a block comment in
    // the component and nowhere else; if it survives, every row below is
    // measuring prose and the file is worthless.
    const inProse = "on boxes that fit perfectly";
    expect(SRC).toContain(inProse);
    expect(CODE).not.toContain(inProse);
    // …and the remover has not eaten the component itself.
    expect(CODE).toContain("export function SimOverlay");
  });

  it("the fold effect measures the EXPLANATION, not only the scroll position", () => {
    expect(CODE).toContain("detailLinesInWindow(");
    // Against the CUT window (`foldWindowPx`), not the raw box: counting to
    // `clientHeight` credits the half-line the snap exists to stop showing.
    expect(CODE).toContain("bottomPx: win.bottomPx");
    // …and the body is found by its own attribute rather than by an index.
    expect(CODE).toContain('child.getAttribute("data-sim-overlay-body")');
  });

  it("the card asks whether the WHY arrived", () => {
    expect(CODE).toContain("whyIsReachable(shown, peekFold.why)");
    // …and the import is a real import, not a mention.
    expect(CODE).toContain("whyIsReachable,");
  });

  it("…and something the student can see changes when it did not", () => {
    // Both halves. The chip that opens the sheet names the size of what it is
    // holding, and the card states the fact so a steered drive can photograph
    // it instead of inferring it from the words.
    expect(CODE).toContain("data-sim-overlay-why-folded={whyReachable ? undefined : whyFoldedLines}");
    expect(CODE).toContain("whyFoldedLines");
    expect(CODE).toMatch(/\?\s*\(shown\.openLabelBg \?\? "Защо"\)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   §RUN — THE CARD ITSELF, MEASURED AND RE-READ OFF THE PUBLISHED TREE.

   `sim-overlay-fold.test.ts` built this technique for exactly this component's
   exactly this hook (its header records the verifier who moved the whole effect
   body under a dead `if` and watched 28 source-scanning assertions stay green).
   Everything below is read off what `SimOverlay` RETURNED after the engine's
   `ResizeObserver` fired — no source strings, no fixture of the component's own
   output.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The peek of `sc-rb-exit-signal`, boxes taken off its own frame. */
function peekWindow(bodyLines: number) {
  const TITLE = 13.75;
  const BODY = 15.125;
  const rows = [
    { top: 0, height: 2 * TITLE, lineHeight: TITLE, body: false },
    { top: 2 * TITLE + 2, height: bodyLines * BODY, lineHeight: BODY, body: true },
  ];
  return {
    scrollTop: 0,
    clientHeight: 96,
    scrollHeight: 2 * TITLE + 2 + bodyLines * BODY + 10,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 180, height: 96 }),
    children: rows.map((r) => ({
      getBoundingClientRect: () => ({ top: r.top, left: 0, width: 180, height: r.height }),
      getAttribute: (name: string) => (name === "data-sim-overlay-body" && r.body ? "" : null),
      __lineHeight: r.lineHeight,
    })),
    __paddingBottom: 10,
  };
}

function computedStyleFor(node: unknown): { lineHeight: string; paddingBottom: string } {
  const n = node as { __lineHeight?: number; __paddingBottom?: number };
  return {
    lineHeight: n.__lineHeight === undefined ? "normal" : `${n.__lineHeight}px`,
    paddingBottom: n.__paddingBottom === undefined ? "0px" : `${n.__paddingBottom}px`,
  };
}

/** Mount the card over a window of `bodyLines` lines and let it measure. */
function mountPeek(bodyLines: number) {
  const el = peekWindow(bodyLines);
  const mounted = mountHook(
    () =>
      SimOverlay({
        item: violation("ред\n".repeat(bodyLines).trim()),
        queued: 0,
      } as unknown as Parameters<typeof SimOverlay>[0]),
    { globals: { getComputedStyle: computedStyleFor } },
  );
  const windows = collectProps(mounted.value, (p) => "data-sim-overlay-text" in p);
  expect(windows.length, "the peek must still render exactly one scroll window").toBe(1);
  (windows[0]!.ref as { current: unknown }).current = el;
  mounted.settle(1);
  mounted.observers.forEach((o) => o.fire());
  return mounted;
}

/** What the card published about its own fold state, off the tree. */
function foldState(tree: unknown): { folded: unknown; label: string } {
  const cards = collectProps(tree, (p) => "data-sim-overlay-card" in p);
  const chips = collectProps(tree, (p) => String(p["aria-expanded"] ?? "") !== "");
  return {
    folded: cards[0]?.["data-sim-overlay-why-folded"],
    label: String(chips[0]?.children ?? ""),
  };
}

describe("§RUN the card escalates when its explanation did not arrive", () => {
  it("an eleven-line WHY behind a four-line window is NOT reachable, and says so", () => {
    // The frame: 96 px of column, two lines of title at 13.75 and eleven lines
    // of body at 15.125. Four body lines are on the glass and seven are not,
    // which is a minority of the explanation — the ratio floor
    // `WHY_REACHABLE_MIN_VISIBLE_FRACTION` refuses.
    const mounted = mountPeek(11);
    const state = foldState(mounted.rerender());
    expect(state.folded, "the card must state the fold as a fact, not imply it").toBe(7);
    // …and the control that opens the sheet names the size of what it holds.
    expect(state.label).toBe("Защо ↓7");
    mounted.unmount();
  });

  it("THE OPPOSITE DIRECTION: a WHY that fits leaves the card exactly as it was", () => {
    // The false-refusal half, and it costs as much as the miss: a chip that
    // shouted a count on every card would be an alarm nobody reads inside a
    // round, and the next genuinely cut explanation would go unnoticed. Three
    // lines of body sit whole inside the same 96 px window.
    const mounted = mountPeek(3);
    const state = foldState(mounted.rerender());
    expect(state.folded).toBeUndefined();
    expect(state.label).toBe("Защо");
    mounted.unmount();
  });

  it("…and a card that has not measured yet accuses nobody", () => {
    // The first commit, before the observer fires: `useFoldLines` starts at 0/0
    // and the predicate reads that as „nothing authored is folded".
    const el = peekWindow(11);
    const mounted = mountHook(
      () =>
        SimOverlay({
          item: violation("ред\n".repeat(11).trim()),
          queued: 0,
        } as unknown as Parameters<typeof SimOverlay>[0]),
      { globals: { getComputedStyle: computedStyleFor } },
    );
    const windows = collectProps(mounted.value, (p) => "data-sim-overlay-text" in p);
    (windows[0]!.ref as { current: unknown }).current = el;
    mounted.settle(1);
    const state = foldState(mounted.rerender());
    expect(state.folded).toBeUndefined();
    expect(state.label).toBe("Защо");
    mounted.unmount();
  });
});

describe("the server render measures nothing, so it accuses nobody", () => {
  const LONG =
    "Движеше се над разрешената скорост. ".repeat(20) +
    "Спирачният път расте с квадрата на скоростта.";

  it("a 40-line explanation on an unmeasured card raises no fold state", () => {
    // THE FALSE-ALARM DIRECTION, and it costs exactly as much as the miss: a
    // card that shouts «↓39» on every server render would be an alarm nobody
    // reads within a round, and the graded step would go back behind the fold
    // unnoticed. `useFoldLines` starts at 0/0 and `whyIsReachable` reads that
    // as „nothing authored is folded".
    const html = renderToStaticMarkup(<SimOverlay item={violation(LONG)} queued={0} />);
    expect(html).not.toContain("data-sim-overlay-why-folded");
    // The chip is the plain word, with no count bolted onto it.
    expect(html).toContain(">Защо<");
    expect(html).not.toContain("Защо ↓");
    // …and the body is on the glass, carrying the attribute the measurement
    // finds it by. If this ever disappears the measurement silently becomes
    // „no explanation at all", which reads as REACHABLE — the reassuring
    // direction again, which is why it is asserted here and not assumed.
    expect(html).toContain("data-sim-overlay-body");
  });
});
