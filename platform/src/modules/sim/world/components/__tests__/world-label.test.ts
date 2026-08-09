/**
 * Register row B35 — the affordance that says „this one is off".
 *
 * The lamps were already right: the 2026-08-03 look wave sampled every lens on
 * the dead head against the same head on the live drill and proved every one of
 * them sits at `LAMP_OFF`. What the frame ALSO proved is that this changes
 * nothing for a student — a dead head and a working head both show three
 * coloured discs, and at native 1:1 from the stop line the whole head is about
 * 8 × 30 px. The row was refused twice for exactly that, and the remedy the
 * register prescribes is a caption anchored to the head.
 *
 * THREE THINGS CAN GO WRONG AND NONE OF THEM SHOW UP IN A TYPE CHECK, so this
 * file holds all three:
 *
 *  1. THE STATE MAP. Label the wrong states and the product either shouts over
 *     a working red or, worse, stays silent on the one head the lesson is
 *     about. `amberFlashOff` is the trap: it is every lens unlit — visually
 *     identical to загаснал — so it must carry the SAME caption as
 *     `amberFlashOn` or the card flickers at 2 Hz with the blink.
 *  2. THE LAW (ADR-002). The caption is read from the driving seat. Its article
 *     is re-read out of `content/law/acts` on every run and matched against the
 *     rule the caption states, so a citation cannot be edited on one side.
 *  3. THE PAINTER. The B41 defect, one file over: five bare `fillText` calls
 *     ran the law line off both sides of the officer's bubble and nothing in
 *     the build could see it, because the only observable was a rendered frame.
 *     This drives the real painter against a recording 2D context whose glyph
 *     width is known, so „did the ink stay inside the card" is arithmetic.
 */
import { describe, expect, it } from "vitest";
import { getArticle } from "@/lib/content/law";
import type { SignalLampState } from "@/modules/sim/contracts";
import {
  SIGNAL_HEAD_LABELS,
  SIGNAL_LABEL_MAX_DIST_M,
  signalLabelKindFor,
  type SignalLabelKind,
} from "../signalHeadLabels";
import {
  drawWorldLabel,
  WORLD_LABEL_H_M,
  WORLD_LABEL_MAX_SCALE,
  WORLD_LABEL_MIN_FONT_SCALE,
  WORLD_LABEL_PAD_X,
  WORLD_LABEL_REF_DIST_M,
  WORLD_LABEL_TEX_H,
  WORLD_LABEL_TEX_W,
  WORLD_LABEL_W_M,
} from "../worldLabel";

/** Every member of the union, written out — adding a state to
 *  `SignalLampState` without deciding whether it is readable should break
 *  here, not in a frame. */
const ALL_STATES: readonly SignalLampState[] = [
  "red",
  "redYellow",
  "yellow",
  "green",
  "dark",
  "amberFlashOn",
  "amberFlashOff",
];

describe("which heads get a caption (B35)", () => {
  it("captions exactly the two states whose lenses cannot be read", () => {
    const labelled = ALL_STATES.filter((s) => signalLabelKindFor(s) !== null);
    expect(labelled).toEqual(["dark", "amberFlashOn", "amberFlashOff"]);
  });

  it("says nothing over a head that is lit — the lens IS the message", () => {
    for (const s of ["red", "redYellow", "yellow", "green"] as const) {
      expect(signalLabelKindFor(s), s).toBeNull();
    }
  });

  it("both halves of the amber blink carry ONE caption, so it cannot flicker", () => {
    // `amberFlashOff` is every lens unlit — the same three discs as загаснал.
    // If the two halves mapped differently the card would repaint at 2 Hz.
    expect(signalLabelKindFor("amberFlashOn")).toBe("amberFlash");
    expect(signalLabelKindFor("amberFlashOff")).toBe("amberFlash");
    expect(signalLabelKindFor("dark")).toBe("dark");
  });

  it("has copy for every kind the mapper can return", () => {
    for (const s of ALL_STATES) {
      const kind = signalLabelKindFor(s);
      if (kind !== null) expect(SIGNAL_HEAD_LABELS[kind], s).toBeDefined();
    }
  });
});

describe("the caption itself (THEO-4 — never a bare verdict)", () => {
  const kinds = Object.keys(SIGNAL_HEAD_LABELS) as SignalLabelKind[];

  it("names the state, says what it means, and says what to DO", () => {
    for (const k of kinds) {
      const c = SIGNAL_HEAD_LABELS[k];
      expect(c.headlineBg.length, k).toBeGreaterThan(6);
      expect(c.line1Bg.length, k).toBeGreaterThan(12);
      // The instruction half. A caption that named the state and stopped would
      // be the „bare correct/wrong verdict" the theory rule forbids.
      expect(c.line2Bg, k).toMatch(/Пропусни/);
      expect(c.line2Bg, k).toMatch(/ОТДЯСНО/);
    }
  });

  it("is Bulgarian, with no latin letters anywhere a student reads", () => {
    for (const k of kinds) {
      const c = SIGNAL_HEAD_LABELS[k];
      for (const s of [c.headlineBg, c.line1Bg, c.line2Bg, c.lawRef]) {
        expect(s, `${k}: "${s}"`).toMatch(/[А-Яа-я]/);
        expect(s, `${k}: "${s}" has latin letters`).not.toMatch(/[A-Za-z]/);
      }
    }
  });

  it("the two headlines are different words — that is the whole point", () => {
    expect(new Set(kinds.map((k) => SIGNAL_HEAD_LABELS[k].headlineBg)).size).toBe(kinds.length);
  });

  it("distinguishes a dead head from a blinking one by colour as well as text", () => {
    expect(SIGNAL_HEAD_LABELS.dark.accent).not.toBe(SIGNAL_HEAD_LABELS.amberFlash.accent);
  });
});

describe("ADR-002 — the article is RETRIEVED, never recalled", () => {
  it("every caption cites an article the corpus actually holds", () => {
    for (const k of Object.keys(SIGNAL_HEAD_LABELS) as SignalLabelKind[]) {
      const ref = SIGNAL_HEAD_LABELS[k].lawRef;
      const m = /чл\.\s*\d+[а-я]?/.exec(ref);
      expect(m, `${k}: "${ref}" states no article`).not.toBeNull();
      const found = getArticle("zdvp", m![0]);
      expect(found.found, `${k}: ЗДвП ${m![0]} is not in content/law/acts`).toBe(true);
    }
  });

  it("ЗДвП чл. 48 says what the caption says it says", () => {
    const found = getArticle("zdvp", "чл. 48");
    expect(found.found).toBe(true);
    if (!found.found) return;
    // „На кръстовище на равнозначни пътища … да пропусне … които се намират
    // или приближават от дясната му страна". The caption states equal-value
    // junction + give way to the right; both halves must be in the statute.
    expect(found.unit.textBg).toContain("равнозначни пътища");
    expect(found.unit.textBg).toContain("дясната");
    expect(found.unit.textBg).toContain("пропусне");
  });

  it("claims no article for the step the corpus does not hold", () => {
    // „A dark head makes the junction равнозначно" is ППЗДвП, which
    // `content/law/acts` does not carry. The caption may state the RULE, but
    // it must not carry an article number for it — the founder's ruling.
    for (const k of Object.keys(SIGNAL_HEAD_LABELS) as SignalLabelKind[]) {
      const refs = SIGNAL_HEAD_LABELS[k].lawRef.match(/чл\.\s*\d+[а-я]?/g) ?? [];
      expect(refs.length, `${k}: more than one article cited`).toBe(1);
      expect(SIGNAL_HEAD_LABELS[k].lawRef, k).not.toMatch(/ППЗДвП[^·]*чл\./);
    }
  });
});

describe("the geometry a frame is taken through", () => {
  it("the plane's aspect matches the texture's, or the type is stretched", () => {
    const tex = WORLD_LABEL_TEX_W / WORLD_LABEL_TEX_H;
    const plane = WORLD_LABEL_W_M / WORLD_LABEL_H_M;
    expect(Math.abs(tex - plane)).toBeLessThan(0.002);
  });

  it("holds apparent size out past the distance the drill asks him to slow at", () => {
    // `sc-signal-dead` instruction 2: «Намали отрано». The look wave drove it
    // from 45 m out. The caption must still be at full apparent size there.
    const held = WORLD_LABEL_REF_DIST_M * WORLD_LABEL_MAX_SCALE;
    expect(held).toBeGreaterThanOrEqual(45);
    // …and it must stop growing before the cull distance, otherwise the card
    // shrinks in apparent size for the last stretch before it vanishes.
    expect(held).toBeLessThanOrEqual(SIGNAL_LABEL_MAX_DIST_M);
  });
});

// ---------------------------------------------------------------------------
// THE PAINTER — same recording-context technique as the B42 bubble's gate, for
// the same reason: the only other observable is a rendered frame.
// ---------------------------------------------------------------------------

interface PaintedLine {
  text: string;
  sizePx: number;
  maxWidth: number | undefined;
  width: number;
}

/** Deliberately UNFORGIVING metric: every glyph 0.62 em. Real Cyrillic in
 *  Segoe UI runs ≈ 0.5–0.6 em, so ink that fits here fits on the shipped font. */
const EM_PER_CHAR = 0.62;

function recordingCanvas(): { canvas: HTMLCanvasElement; lines: PaintedLine[] } {
  const lines: PaintedLine[] = [];
  let sizePx = 10;
  const ctx = {
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
    fillText: (text: string, _x: number, _y: number, maxWidth?: number) => {
      // `maxWidth` CONDENSES the glyphs, so the ink is min(natural, maxWidth).
      const natural = text.length * EM_PER_CHAR * sizePx;
      lines.push({
        text,
        sizePx,
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
    width: WORLD_LABEL_TEX_W,
    height: WORLD_LABEL_TEX_H,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return { canvas, lines };
}

describe("the world-label PAINTER clamps its own ink", () => {
  const INK_BUDGET = WORLD_LABEL_TEX_W - 2 * WORLD_LABEL_PAD_X;
  const kinds = Object.keys(SIGNAL_HEAD_LABELS) as SignalLabelKind[];

  it("paints all four authored lines, in order, for every caption", () => {
    for (const k of kinds) {
      const c = SIGNAL_HEAD_LABELS[k];
      const { canvas, lines } = recordingCanvas();
      drawWorldLabel(canvas, c);
      expect(
        lines.map((l) => l.text),
        k,
      ).toEqual([c.headlineBg, c.line1Bg, c.line2Bg, c.lawRef]);
    }
  });

  it("no shipped line leaves the card", () => {
    for (const k of kinds) {
      const { canvas, lines } = recordingCanvas();
      drawWorldLabel(canvas, SIGNAL_HEAD_LABELS[k]);
      for (const l of lines) {
        expect(l.width, `${k}: "${l.text}" is ${l.width.toFixed(0)} px`).toBeLessThanOrEqual(
          INK_BUDGET + 0.5,
        );
      }
    }
  });

  it("no shipped line is squeezed to the floor — that means the COPY is wrong", () => {
    // The clamp is a safety net, not a licence to author long lines: at the
    // floor the browser condenses the glyphs and the line stops being legible
    // at the distance it exists to be legible at.
    for (const k of kinds) {
      const { canvas, lines } = recordingCanvas();
      drawWorldLabel(canvas, SIGNAL_HEAD_LABELS[k]);
      for (const l of lines) {
        expect(l.width, `${k}: "${l.text}" is condensed at the floor`).toBeLessThan(INK_BUDGET);
      }
    }
  });

  it("a line long enough to overflow is SHRUNK, never truncated", () => {
    const { canvas, lines } = recordingCanvas();
    const long = "Т".repeat(120);
    drawWorldLabel(canvas, {
      headlineBg: long,
      line1Bg: "к",
      line2Bg: "к",
      // A REAL ref, even in a fixture. law-citations.test.ts walks the whole
      // modules/sim tree — „the scan is over the tree, never over a list" — so
      // that a new file cannot escape it. A filler „к" here trips that sweep,
      // and the honest fix is to stop writing unresolvable refs rather than to
      // teach the guard to look away from tests.
      lawRef: "ЗДвП чл. 6",
      accent: "#fff",
    });
    const headline = lines[0]!;
    expect(headline.text).toBe(long); // every character still painted
    expect(headline.width).toBeLessThanOrEqual(INK_BUDGET + 0.5);
    expect(headline.sizePx).toBeGreaterThanOrEqual(Math.floor(100 * WORLD_LABEL_MIN_FONT_SCALE));
  });
});
