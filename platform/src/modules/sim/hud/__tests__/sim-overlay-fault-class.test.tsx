/**
 * THE PHONE'S FAULT CARD NAMES THE CLASS OF THE FAULT — sc-junction-gap:4c2e452f.
 *
 * THE FRAME, and it is a photograph of the shipped build rather than a
 * hypothesis: `.audit-frames/w26/frames/sc-junction-gap__mobile-wrong/
 * 04-t012s.png`, captured 2026-09-04 against tree `8b9d135`, iPhone 16
 * landscape at dpr 3. The card reads
 *
 *     ⚠  −10 ИЗПИТНИ Т.                              (+3)
 *     Неспиране на знак Б2 „Спри!“
 *     Премина знака Б2 без пълно
 *     преди 5 с            ( ЗАЩО ↓5 )   ( ✕ )
 *
 * and nothing on it — nor in the sheet «ЗАЩО» opens — says «опасна». The same
 * lesson's `run.log` for the same beat carries the whole DOM text of that card
 * («−10 изпитни т.+3Неспиране на знак Б2 „Спри!“Премина знака Б2 без пълно
 * спиране…»), so this is an absence in the markup and not an occlusion.
 *
 * WHY THAT IS A DEFECT AND NOT A LAYOUT PREFERENCE. Наредба № 38, приложение
 * № 5, т. 10 prices a fault BY ITS CLASS — 10 / 3 / 1 — so the class is the
 * verdict and the figure is its consequence. Two of the product's three fault
 * surfaces already print it:
 *
 *   · `HudToasts.ToastCard` (the ROOMY leg of the very same toast) prints
 *     `SEVERITY_META[severity].label` on the left of the card and the mark on
 *     the right;
 *   · `SessionEndScreen`'s `FaultCard` prints «опасна грешка · наказателни
 *     точки по изпитния лист · Наредба № 38 приложение № 5, т. 10, б. „в“» on
 *     every row of the debrief.
 *
 * The compact re-map in `LessonPlayShell` carried the mark alone, so the class
 * was a DESKTOP-ONLY fact — and the compact `tone` collapses опасна and основна
 * into one „danger", so on a phone two classes with two different tariffs
 * arrived indistinguishable. A verdict a student cannot classify is THEO-4's
 * requirement zero, one surface at a time.
 *
 * WHAT IS PROVED HERE, IN THE ORDER THE FAILURE HAPPENED:
 *   1. the class is MOUNTED — the real `SimOverlay`, rendered as the shell
 *      renders it, for all three classes;
 *   2. BOTH DIRECTIONS — an item with no class prints none. Inventing a class
 *      on a «Браво» or a task line is the same crime as dropping one;
 *   3. NEITHER HALF is cut in the narrow lane — they share a `flex-wrap` box,
 *      because the first answer („the class is the half that truncates") left
 *      the class at 10.7 px of ink on the shipped phone, i.e. one letter and an
 *      ellipsis. See the block over that test for the re-measurement;
 *   4. the vocabulary is RETRIEVED (ADR-002) — the token the phone prints is
 *      the token the debrief's `examMarkFor().classBg` prints, so the two
 *      surfaces cannot drift and neither one spells the наредба's words;
 *   5. the PRODUCER is wired — `LessonPlayShell`'s violation re-map is the only
 *      path that builds this card, and a green renderer beside an unfed field
 *      is this directory's own signature failure.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { examMarkFor, N38_CLASS_LABEL_BG, type SeverityClass } from "../../rules";
import { SimOverlay } from "../SimOverlay";
import type { SimOverlayItem } from "../overlayQueue";

/** Markup with tags stripped — what a reader actually reads. */
function textOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function peek(item: SimOverlayItem, queued = 0): string {
  return textOf(<SimOverlay item={item} queued={queued} />);
}

function peekMarkup(item: SimOverlayItem, queued = 0): string {
  return renderToStaticMarkup(<SimOverlay item={item} queued={queued} />);
}

/** The card in the frame, as the `...(!ended` re-map builds it. */
function violationItem(severity: SeverityClass, chipBg: string): SimOverlayItem {
  return {
    id: "toast:7",
    kind: "violation",
    tone: severity === "vtorostepenna" ? "warn" : "danger",
    chipBg,
    markClassBg: N38_CLASS_LABEL_BG[severity],
    lineBg: "Неспиране на знак Б2 „Спри!“",
    detailBg: "Премина знака Б2 без пълно спиране. На СТОП се спира напълно винаги.",
    lawRef: "ЗДвП чл. 47",
  };
}

describe("the mounted card, not the field", () => {
  it("prints the class beside the mark, and a different class prints differently", () => {
    // The pair is the mutation guard: a renderer that had been hard-wired to
    // one word, or that had gone back to printing `chipBg` alone, satisfies
    // neither line — the two must DIFFER and both must carry their own mark.
    const opasna = peek(violationItem("opasna", "−10 изпитни т."));
    expect(opasna).toContain("опасна");
    expect(opasna).toContain("−10 изпитни т.");

    const vtoro = peek(violationItem("vtorostepenna", "−1 изпитна т."));
    expect(vtoro).toContain("второстепенна");
    expect(vtoro).toContain("−1 изпитна т.");

    expect(opasna).not.toContain("второстепенна");
    expect(vtoro).not.toContain("опасна");
  });

  it("names основна as its own class — the tone cannot, and that is why this field exists", () => {
    // `tone` is „danger" for BOTH опасна and основна (`LessonPlayShell`'s
    // re-map), so before this field the only carrier of the difference on a
    // phone was a colour the two classes share. −3 against −10 is the tariff
    // the наредба sets by class; the card must say which one it is.
    const osnovna = peek(violationItem("osnovna", "−3 изпитни т."));
    expect(osnovna).toContain("основна");
    expect(osnovna).toContain("−3 изпитни т.");
  });

  it("says NOTHING about a class on an item that has none", () => {
    // A commendation and a task line are not graded faults. „When in doubt say
    // nothing" is asserted as hard as „when known, say it" — an invented class
    // on a «Браво» is a verdict the engine never reached.
    const praise = peek({
      id: "toast:9",
      kind: "praise",
      tone: "good",
      chipBg: "Браво",
      lineBg: "Правилно спиране на знак Б2",
    });
    expect(praise).toContain("Браво");
    for (const label of Object.values(N38_CLASS_LABEL_BG)) {
      expect(praise).not.toContain(label);
    }
  });
});

describe("the narrow lane — which half gives when the row runs out of room", () => {
  /*
   * THE FIRST ANSWER HERE WAS „THE CLASS TRUNCATES", AND ON THE PHONE THAT
   * TRUNCATED IT TO ONE LETTER. The row was re-opened on the frames of its own
   * repair: `.audit-frames/w27/frames/sc-junction-gap__mobile-wrong/04-t012s.png`
   * (tree 85495fd — the first sweep that carries this field), same phone, same
   * dpr 3, same red-ink scan of row 1's band:
   *
   *   ⚠ glyph    device 1627–1660   CSS 542.3–553.3
   *   the class  device 1686–1718   CSS 562.0–572.7   ← 10.7 px: «О» + «…»
   *   «·»        device 1761–1766   CSS 587.0–588.7
   *   «−10»      device 1798–1848   CSS 599.3–616.0
   *   «ИЗПИТНИ»  device 1875–2003   CSS 625.0–667.7   → 6.1 CSS px per capital
   *   «Т.»       device 2030–2058   CSS 676.7–686.0
   *
   * The old paragraph's «lane after the mark is ~46 px» was measured between
   * the mark's right edge and the «+3» badge — a lane the class never occupies,
   * because it is laid out BEFORE the mark. What it really gets is 176 − 14
   * (glyph) − 18 (three gaps) − 99 (the mark WITH its separator, not 86.7) − 23
   * (badge) ≈ 22 px, against the 36.6 «ОПАСНА» needs. So the field was mounted,
   * fed, asserted — and the card still named no class.
   *
   * THE PAIR NOW WRAPS INSTEAD. One `flex-wrap` box holds both: it is one line
   * whenever they fit (156 px of lane against 131 on every card with no queue
   * badge) and two when they do not, so NEITHER half is ever cut. The separator
   * goes with the change and not as tidying — riding with the mark, it would
   * open the second line, and a middot starting a line reads as a bullet. The
   * roomy card has always separated the two with space alone (`ToastCard`'s
   * `justify-between`), so this also removes a divergence.
   */
  it("the pair wraps, and neither the class nor the mark is ever cut", () => {
    const html = peekMarkup(violationItem("vtorostepenna", "−1 изпитна т."), 3);
    // …past the handle's own value: `data-sim-overlay-mark-class=""` ends in
    // the four characters `class=""`, and a slice that began at the handle read
    // THAT as the element's class list and passed on an empty string.
    const handle = 'data-sim-overlay-mark-class=""';
    const before = html.slice(0, html.indexOf(handle));
    const classSpan = html.slice(html.indexOf(handle) + handle.length);
    const classClasses = /class="([^"]*)"/.exec(classSpan)?.[1] ?? "";
    // `max-w-full` and not `min-w-0`: inside a wrap box the class is its own
    // line's only item, so the bound that matters is the box's width. It keeps
    // `truncate` for the one case the wrap cannot answer — a class longer than
    // the whole column — which no member of the наредба's table is.
    expect(classClasses).toContain("truncate");
    expect(classClasses).toContain("max-w-full");

    // THE WRAP BOX IS THE REPAIR, so it is asserted and not assumed. It is the
    // `<span` immediately enclosing the class span, i.e. the second-to-last one
    // opened before the handle.
    const classOpen = before.lastIndexOf("<span");
    const groupOpen = before.lastIndexOf("<span", classOpen - 1);
    const groupClasses = /class="([^"]*)"/.exec(before.slice(groupOpen, classOpen))?.[1] ?? "";
    expect(groupClasses).toContain("flex-wrap");

    // …and the chip inside it is still the one that may not give. Walked from
    // the class span's own close rather than searched for by its text: the
    // mark's string also appears in the card's `aria-label`, and a search that
    // found THAT read the wrapper's class list and asserted nothing.
    const afterClass = classSpan.slice(classSpan.indexOf("</span>"));
    const markSpan = afterClass.slice(afterClass.indexOf("<span"));
    expect(markSpan).toContain("−1 изпитна т.");
    // The separator is gone WITH the wrap, and a returning «·» would land at
    // the head of the wrapped line.
    expect(markSpan).not.toContain("· −1");
    const markClasses = /class="([^"]*)"/.exec(markSpan)?.[1] ?? "";
    expect(markClasses).toContain("shrink-0");
    expect(markClasses).toContain("whitespace-nowrap");
    expect(markClasses).not.toContain("truncate");
  });

  it("a card with no class keeps the chip's own truncation — nothing else changes", () => {
    // The 240 px column has always relied on it for «ИНСТРУКЦИИ» and «ЗАДАЧА
    // 2/3». This branch must be untouched by the one above.
    const html = peekMarkup({
      id: "task:1",
      kind: "task",
      tone: "neutral",
      chipBg: "Задача 2/3",
      lineBg: "Спри напълно преди стоп-линията",
    });
    const idx = html.indexOf("Задача 2/3");
    const open = html.lastIndexOf("<span", idx);
    const classes = /class="([^"]*)"/.exec(html.slice(open, idx))?.[1] ?? "";
    expect(classes).toContain("truncate");
  });
});

describe("ADR-002 — the word comes off the наредба, not off this keyboard", () => {
  it("the phone prints the same token the debrief's FaultCard prints", () => {
    // `FaultCard` renders `examMarkFor(code).classBg`. If the two ever diverge,
    // one screen of this product calls a fault опасна and another calls it
    // something else — which is the class of drift this pin exists to stop.
    expect(examMarkFor("COLLISION").classBg).toBe(N38_CLASS_LABEL_BG.opasna);
    expect(examMarkFor("COLLISION").classBg).toBe("опасна");
    expect(Object.keys(N38_CLASS_LABEL_BG).sort()).toEqual([
      "opasna",
      "osnovna",
      "vtorostepenna",
    ]);
  });
});

describe("the producer — a field nothing feeds is not a repair", () => {
  it("`LessonPlayShell`'s violation re-map sets the class from the retrieved table", () => {
    // The hook cannot be invoked without a DOM and a whole lesson session, so
    // the wiring is read off the source. Narrow on purpose: it asserts the ONE
    // thing that could silently take the class off every shipped phone card,
    // which is this re-map going back to a mark-only literal.
    const src = readFileSync(
      resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
      "utf8",
    );
    const remap = src.slice(
      src.indexOf('if (t.event.kind === "violation")'),
      src.indexOf('if (t.event.kind === "lesson")'),
    );
    expect(remap).toContain('chipBg: minusPointsBg("exam", t.event.points)');
    expect(remap).toContain("markClassBg: N38_CLASS_LABEL_BG[t.event.severity]");
    // …and the token is imported rather than spelled, so a re-ingest of the
    // наредба that moves a label moves this card with it.
    expect(remap).not.toMatch(/markClassBg:\s*"/);
  });
});
