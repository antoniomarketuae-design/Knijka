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
  OFC_ARM_OUT_RAD,
  drawControllerBubble,
  officerArmTarget,
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
// THE CAPTION AGAINST THE MESH (sweep161,
// `sc-signal-controller/mobile-right/04-t076s.png`).
//
// The side-profile caption shipped as „Виждаш го СТРАНИЧНО, ръцете долу" while
// the officer in that frame holds both arms straight out horizontally. Every
// test above passes on that string: they check length, language, prefixes and
// ink width, and NONE of them has ever looked at the figure the card is stuck
// to. The copy and the renderer could say opposite things forever.
//
// So this drives the renderer's own `officerArmTarget` and asks the only
// question that matters — is the arm state this sentence names the arm state
// the student is looking at. It is deliberately a NEGATIVE test (the caption
// may say nothing about arms, as today's does; it may not say the wrong
// thing), because naming the arms at all is a teaching mistake in its own
// right: `officerArmTarget` takes no posture, so both arms are out for the
// permitting AND the prohibiting reading, and the discriminator is which side
// of him you stand on.
// ---------------------------------------------------------------------------

// NO `\b` IN THESE. The first draft used one and the non-vacuity case below
// caught it on the very first run: JavaScript's `\b` is defined against ASCII
// `\w`, so between „ръцете" and the following space there is no word boundary
// at all and the detector silently matched nothing — a probe that reports
// „no caption describes the wrong arms" about a caption that does. Word order
// is allowed both ways („ръцете отпуснати" / „отпуснати ръце") with a 12-char
// leash so the two halves have to be in the same clause.
const ARMS = "ръ(?:ка|ката|це|цете)";
const DOWN = "(?:надолу|долу|отпуснат|спуснат|свален)";
const OUT = "(?:настрани|встрани|хоризонтално)";
/** Copy that claims the arms are DOWN. */
const SAYS_ARMS_DOWN = new RegExp(`${ARMS}[^.]{0,12}?${DOWN}|${DOWN}[^.]{0,12}?${ARMS}`);
/** Copy that claims the arms are OUT sideways. */
const SAYS_ARMS_OUT = new RegExp(`${ARMS}[^.]{0,12}?${OUT}|${OUT}[^.]{0,12}?${ARMS}`);

describe("the pose caption matches the arms the renderer holds", () => {
  /** What the figure is actually doing, read off the shipped pose function. */
  function armsOut(attention: boolean): boolean {
    const left = { lat: 0, sag: 0 };
    const right = { lat: 0, sag: 0 };
    officerArmTarget(attention, 0, left);
    officerArmTarget(attention, 1, right);
    // „Out" means a real lateral swing on BOTH arms — the ±OFC_ARM_OUT_RAD
    // case. The attention pose sets lat = 0 and raises one arm sagittally.
    return Math.abs(left.lat) > 0.35 && Math.abs(right.lat) > 0.35;
  }

  it("NON-VACUITY: the regexes catch the exact strings that were photographed", () => {
    // The probe rule of this audit — a detector is worthless until it is shown
    // failing the case a human already confirmed by eye. These two are the
    // shipped caption (frame 04-t076s) and the authored long form it mirrors
    // (`CONTROLLER_GESTURES[0].poseBg`), both of which describe lowered arms.
    expect("Виждаш го СТРАНИЧНО, ръцете долу").toMatch(SAYS_ARMS_DOWN);
    expect("Страничен профил към теб, ръцете отпуснати надолу").toMatch(SAYS_ARMS_DOWN);
    expect("Виждаш го СТРАНИЧНО — ръцете настрани").toMatch(SAYS_ARMS_OUT);
    // …and do not fire on copy that stays off the subject, or the test would
    // be unsatisfiable rather than true.
    expect("Виждаш го СТРАНИЧНО — срещу рамото му").not.toMatch(SAYS_ARMS_DOWN);
    expect("Виждаш го СТРАНИЧНО — срещу рамото му").not.toMatch(SAYS_ARMS_OUT);
  });

  it("the renderer really does hold both arms out on the two body-facing postures", () => {
    // The premise of the assertion below. If a later change drops the lateral
    // swing this flips, and the caption requirement below flips with it.
    expect(OFC_ARM_OUT_RAD).toBeGreaterThan(0.35);
    expect(armsOut(false), "both arms out sideways when not signalling внимание").toBe(true);
    expect(armsOut(true), "внимание is one arm UP, not both out").toBe(false);
  });

  it("no caption describes an arm state the mesh is not in", () => {
    // sideProfile and chestOrBack are the two the driver reads off the body;
    // armRaised is the внимание pose. Index order is pinned above.
    const bodyFacing = [
      CONTROLLER_BUBBLES[BUBBLE_SIDE_PROFILE],
      CONTROLLER_BUBBLES[BUBBLE_CHEST_OR_BACK],
    ];
    for (const b of bodyFacing) {
      if (armsOut(false)) {
        expect(b.poseBg, `${b.posture}: the mesh holds the arms OUT`).not.toMatch(SAYS_ARMS_DOWN);
      } else {
        expect(b.poseBg, `${b.posture}: the mesh holds the arms DOWN`).not.toMatch(SAYS_ARMS_OUT);
      }
    }
    // The внимание pose has lat = 0 — nothing is out sideways there.
    expect(CONTROLLER_BUBBLES[BUBBLE_ARM_RAISED].poseBg).not.toMatch(SAYS_ARMS_OUT);
  });

  it("the arms are NOT offered as the thing that tells the two apart", () => {
    // The failure this is really guarding: `officerArmTarget` is posture-blind,
    // so „arms out = минавай" would grade the halt posture as permission —
    // authored as the опасна грешка `mistake-barge-chest`. Whatever the pose
    // lines say, they must differ on the BODY, not on the limbs.
    const side = CONTROLLER_BUBBLES[BUBBLE_SIDE_PROFILE].poseBg;
    const chest = CONTROLLER_BUBBLES[BUBBLE_CHEST_OR_BACK].poseBg;
    expect(side, "side profile must name the side you are on").toMatch(
      /СТРАНИЧНО|профил|рамо/,
    );
    expect(chest, "the halt pose must name the chest or the back").toMatch(/ГЪРДИ|ГРЪБ/);
    // Neither may lean on an arm word to carry the difference.
    expect(SAYS_ARMS_OUT.test(side) && SAYS_ARMS_OUT.test(chest)).toBe(false);
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
