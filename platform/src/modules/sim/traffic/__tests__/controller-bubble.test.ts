/**
 * Register row B42 / ledger L4 — the регулировчик's gesture bubble.
 *
 * The founder asked for this twice and doc 86 §12.5 lists it as his
 * third-most-repeated ask: *„each position the traffic officers shows on top of
 * his head some bubble must appear stating what exactly he is pointing, who is
 * he letting go, whos turn its to pass"*. Lane 9 authored the teaching content
 * (`CONTROLLER_GESTURES`) and correctly refused to cross into `traffic/` to
 * render it; this lane renders it.
 *
 * The caption lives in `traffic/controllerGestures.ts` because a presentation
 * module must not import lesson content (docs/architecture/05). That leaves one
 * risk — two copies of the same answer drifting apart — and this file is the
 * guard against it. A TEST may cross the boundary; shipped code may not.
 *
 * ADR-002 is the reason the `lawRef` equality below is not optional: the
 * article must be RETRIEVED from the authored bank, never recalled. If someone
 * edits the citation on one side, this fails.
 */
import { describe, expect, it } from "vitest";
import { CONTROLLER_GESTURES } from "@/modules/sim/lessons/scenario/templates-signals";
import {
  BUBBLE_ARM_RAISED,
  BUBBLE_CHEST_OR_BACK,
  BUBBLE_SIDE_PROFILE,
  CONTROLLER_BUBBLES,
} from "../controllerGestures";
import {
  BUBBLE_MIN_FONT_SCALE,
  BUBBLE_PAD_X,
  BUBBLE_TEX_H,
  BUBBLE_TEX_W,
  drawControllerBubble,
} from "../TrafficLayer";

describe("controller bubble copy (B42)", () => {
  it("carries exactly the three authored postures, in the authored order", () => {
    expect(CONTROLLER_BUBBLES.map((b) => b.posture)).toEqual(
      CONTROLLER_GESTURES.map((g) => g.posture),
    );
  });

  it("the index constants the renderer picks by match the array", () => {
    expect(CONTROLLER_BUBBLES[BUBBLE_SIDE_PROFILE].posture).toBe("sideProfile");
    expect(CONTROLLER_BUBBLES[BUBBLE_CHEST_OR_BACK].posture).toBe("chestOrBack");
    expect(CONTROLLER_BUBBLES[BUBBLE_ARM_RAISED].posture).toBe("armRaised");
  });

  it("cites the SAME law as the authored gesture it captions (ADR-002)", () => {
    for (let i = 0; i < CONTROLLER_BUBBLES.length; i++) {
      expect(CONTROLLER_BUBBLES[i].lawRef, CONTROLLER_BUBBLES[i].posture).toBe(
        CONTROLLER_GESTURES[i].lawRef,
      );
    }
  });

  it("answers his three questions on every posture, in Bulgarian (THEO-4)", () => {
    for (const b of CONTROLLER_BUBBLES) {
      // What am I looking at / who goes / who stops / whose priority it is —
      // never a bare verdict. His sentence names all four.
      expect(b.poseBg.length, b.posture).toBeGreaterThan(12);
      expect(b.goBg, b.posture).toMatch(/^Минава:/);
      expect(b.stopBg, b.posture).toMatch(/^Спира(ш|т)?:/);
      expect(b.priorityBg, b.posture).toMatch(/^Предимството /);
      for (const s of [b.headlineBg, b.poseBg, b.goBg, b.stopBg, b.priorityBg]) {
        expect(s, `${b.posture}: "${s}" must be Bulgarian`).toMatch(/[А-Яа-я]/);
        expect(s, `${b.posture}: "${s}" must have no latin letters`).not.toMatch(/[A-Za-z]/);
      }
    }
  });

  it("the PRIORITY line answers a different question from the GO line (B41)", () => {
    // The row this file exists for was closed on „all three of his questions
    // are answered" while the card carried three of FOUR. The failure mode if
    // someone ever collapses them again is that `priorityBg` becomes a restated
    // `goBg` — true, and useless, because the mistake the drill grades is a
    // student who read „who goes" right and drove anyway.
    for (const b of CONTROLLER_BUBBLES) {
      expect(b.priorityBg, b.posture).not.toBe(b.goBg);
      expect(b.priorityBg, b.posture).not.toBe(b.stopBg);
    }
    // Two of the three name the LAMP, because the confusion is never abstract:
    // it is always „but the light was green". The raised-arm posture is the
    // exception on purpose — there the answer is that priority is nobody's.
    const lampAware = CONTROLLER_BUBBLES.filter((b) => /червено|зелено/.test(b.priorityBg));
    expect(lampAware.map((b) => b.posture)).toEqual(["sideProfile", "chestOrBack"]);
    expect(CONTROLLER_BUBBLES[BUBBLE_ARM_RAISED].priorityBg).toMatch(/ничие/);
  });

  it("stays short enough to read on a billboard from the approach", () => {
    // The bubble canvas is 1024 px wide and these are drawn at 44-46 px; past
    // ~44 characters a line starts running off the card. A hard cap is cheaper
    // than discovering it in a frame.
    for (const b of CONTROLLER_BUBBLES) {
      expect(b.headlineBg.length, b.posture).toBeLessThanOrEqual(12);
      expect(b.poseBg.length, b.posture).toBeLessThanOrEqual(40);
      expect(b.goBg.length, b.posture).toBeLessThanOrEqual(40);
      expect(b.stopBg.length, b.posture).toBeLessThanOrEqual(40);
      expect(b.priorityBg.length, b.posture).toBeLessThanOrEqual(40);
      // `lawRef` HAD NO CAP, and on 2026-08-09 it grew: the article numbers came
      // off the two acts `content/law/acts` does not hold, so
      // „ППЗДвП чл. 29, ал. 3; ЗДвП чл. 7" (32) became
      // „ППЗДвП сигнали на регулировчика; ЗДвП чл. 7" (43). It is painted by
      // `TrafficLayer.drawControllerBubble` with a bare `fillText` — centred,
      // no wrap, no `measureText` clamp — so a long enough string simply runs
      // off the card, in the one place in this product where the law reference
      // is read FROM THE DRIVING SEAT.
      //
      // The cap is derived from a line that has already been rendered and
      // looked at rather than guessed: `poseBg` is 40 characters at 46 px, and
      // the law line is drawn at 38 px, so the ink-equivalent budget is
      // 40 × 46/38 ≈ 48. Today's longest is 43.
      //
      // The budget STAYS — a line that needs shrinking to fit is still worse
      // copy than one that fits — but it is no longer the only thing standing
      // between a long string and a frame with the law hanging off the card.
      // The painter is clamped now; see the describe below.
      expect(b.lawRef.length, `${b.posture}: lawRef runs off the bubble`).toBeLessThanOrEqual(48);
    }
  });

  it("the три headlines are distinct verdicts, not the same word", () => {
    const set = new Set(CONTROLLER_BUBBLES.map((b) => b.headlineBg));
    expect(set.size).toBe(CONTROLLER_BUBBLES.length);
  });
});

// ---------------------------------------------------------------------------
// THE PAINTER (B41) — the half the budget above could never guard.
//
// `drawControllerBubble` painted five bare `fillText` calls: centred, no wrap,
// no `measureText`. A string wider than the card ran off BOTH sides of it, and
// nothing in the build could see that happen because the only observable is a
// rendered frame. The fix is a shrink-to-fit clamp in the painter; this drives
// the real painter against a recording 2D context whose glyphs are a known
// width, so „did the ink stay inside the card" is arithmetic on what the
// painter actually asked for.
// ---------------------------------------------------------------------------

interface PaintedLine {
  text: string;
  sizePx: number;
  /** Baseline the painter asked for, px down the 1024×576 canvas. */
  y: number;
  maxWidth: number | undefined;
  width: number;
}

/** Monospace-ish stand-in: every glyph is 0.62 em. Real Cyrillic in Segoe UI
 *  runs ≈ 0.5–0.6 em, so this is a deliberately UNFORGIVING metric — a clamp
 *  that keeps the ink inside here keeps it inside on the shipped font. */
const EM_PER_CHAR = 0.62;

function recordingCanvas(): { canvas: HTMLCanvasElement; lines: PaintedLine[] } {
  const lines: PaintedLine[] = [];
  let sizePx = 10;
  const ctx = {
    // `font` is the only channel the painter uses to change the size.
    set font(v: string) {
      const m = /(\d+(?:\.\d+)?)px/.exec(v);
      sizePx = m === null ? sizePx : Number(m[1]);
    },
    get font() {
      return `${sizePx}px stub`;
    },
    textAlign: "center",
    textBaseline: "alphabetic",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    measureText: (t: string) => ({ width: t.length * EM_PER_CHAR * sizePx }),
    fillText: (text: string, _x: number, y: number, maxWidth?: number) => {
      // What the browser actually paints: `maxWidth` CONDENSES the glyphs, so
      // the ink is min(natural, maxWidth). Modelling that is what makes the
      // floor case honest instead of a stub artefact.
      const natural = text.length * EM_PER_CHAR * sizePx;
      lines.push({
        text,
        sizePx,
        y,
        maxWidth,
        width: maxWidth === undefined ? natural : Math.min(natural, maxWidth),
      });
    },
    clearRect: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
  };
  const canvas = {
    width: BUBBLE_TEX_W,
    height: BUBBLE_TEX_H,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return { canvas, lines };
}

describe("the bubble PAINTER clamps its own ink (B41)", () => {
  const INK_BUDGET = BUBBLE_TEX_W - 2 * BUBBLE_PAD_X;

  it("paints all six authored lines for every posture", () => {
    for (const b of CONTROLLER_BUBBLES) {
      const { canvas, lines } = recordingCanvas();
      drawControllerBubble(canvas, b);
      expect(lines.map((l) => l.text), b.posture).toEqual([
        b.headlineBg,
        b.poseBg,
        b.goBg,
        b.stopBg,
        b.priorityBg,
        b.lawRef,
      ]);
    }
  });

  it("every painted line sits inside the card body, above the tail (B41)", () => {
    // Adding a sixth line is where a card silently starts painting over its own
    // pointer. The baselines are authored constants; this is the only place
    // that can catch one drifting past the body.
    const TAIL = 34;
    for (const b of CONTROLLER_BUBBLES) {
      const { canvas, lines } = recordingCanvas();
      drawControllerBubble(canvas, b);
      let prev = 0;
      for (const l of lines) {
        // Ascender above the baseline, descender below — Segoe UI runs ≈0.75 /
        // ≈0.25 em, rounded away from the card in both directions.
        expect(l.y - 0.8 * l.sizePx, `${b.posture}: "${l.text}" clips the top`).toBeGreaterThan(0);
        expect(
          l.y + 0.3 * l.sizePx,
          `${b.posture}: "${l.text}" runs into the tail`,
        ).toBeLessThan(BUBBLE_TEX_H - TAIL);
        expect(l.y, `${b.posture}: "${l.text}" is out of reading order`).toBeGreaterThan(prev);
        prev = l.y;
      }
    }
  });

  it("no shipped line exceeds the card's ink width", () => {
    for (const b of CONTROLLER_BUBBLES) {
      const { canvas, lines } = recordingCanvas();
      drawControllerBubble(canvas, b);
      for (const l of lines) {
        expect(l.width, `${b.posture}: "${l.text}" is ${l.width.toFixed(0)} px`).toBeLessThanOrEqual(
          INK_BUDGET,
        );
        // Every call carries the canvas' own squeeze as the backstop.
        expect(l.maxWidth, `${b.posture}: "${l.text}" has no maxWidth`).toBe(INK_BUDGET);
      }
    }
  });

  it("a law line long enough to overflow is SHRUNK, never truncated", () => {
    // The exact class of regression this exists for: a citation that grows.
    // 56 characters against today's 43 — the painter must still put the WHOLE
    // string on the card, at a smaller size.
    const grown = "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7 и чл. 6";
    const { canvas, lines } = recordingCanvas();
    drawControllerBubble(canvas, { ...CONTROLLER_BUBBLES[1], lawRef: grown });
    const law = lines[5];
    expect(law.text).toBe(grown); // no ellipsis, no cut — ADR-002
    expect(law.width).toBeLessThanOrEqual(INK_BUDGET);
    expect(law.sizePx).toBeLessThan(38); // it did shrink
    expect(law.sizePx).toBeGreaterThanOrEqual(Math.floor(38 * BUBBLE_MIN_FONT_SCALE));
  });

  it("past the legibility floor the canvas squeeze still keeps ink on the card", () => {
    // A string nobody should ship (82 chars) — the shrink stops at
    // BUBBLE_MIN_FONT_SCALE rather than dissolving the law into a grey smear,
    // and the `maxWidth` argument condenses the rest. The card never leaks.
    const absurd =
      "ППЗДвП сигнали на регулировчика; ЗДвП чл. 7; ЗДвП чл. 6; ППЗДвП чл. 66; ЗДвП чл. 50";
    const { canvas, lines } = recordingCanvas();
    drawControllerBubble(canvas, { ...CONTROLLER_BUBBLES[1], lawRef: absurd });
    const law = lines[5];
    expect(law.text).toBe(absurd);
    expect(law.sizePx).toBe(Math.floor(38 * BUBBLE_MIN_FONT_SCALE));
    expect(law.width).toBeLessThanOrEqual(INK_BUDGET);
  });

  it("a line that already fits is painted at its authored size (no silent shrink)", () => {
    const { canvas, lines } = recordingCanvas();
    drawControllerBubble(canvas, CONTROLLER_BUBBLES[2]); // „ВНИМАНИЕ" — the short one
    expect(lines[0].sizePx).toBe(116);
    expect(lines[1].sizePx).toBe(44);
  });

  it("NON-VACUITY: the pre-fix painter would have overflowed on today's copy", () => {
    // Reconstructs the defect. The shipped 43-character lawRef at the authored
    // 38 px is 43 × 0.62 × 38 = 1013 px of ink in a 936 px card — off both
    // sides. If this ever stops being true the test above has gone vacuous and
    // is no longer guarding anything.
    const longest = CONTROLLER_BUBBLES.reduce((a, b) =>
      a.lawRef.length >= b.lawRef.length ? a : b,
    );
    const unclamped = longest.lawRef.length * EM_PER_CHAR * 38;
    expect(unclamped).toBeGreaterThan(INK_BUDGET);
  });
});
