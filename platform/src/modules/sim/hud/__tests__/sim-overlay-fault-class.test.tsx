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
 *   3. the MARK SURVIVES the narrow lane — the class is the `truncate`d half
 *      and the mark is `shrink-0`, because a mark clipped from the right is
 *      the founder's own «−10 т.» misreading with the qualifier removed;
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
   * MEASURED on the frame in this file's header, by scanning row 1's band for
   * danger-red ink (`.audit-frames/w26/frames/sc-junction-gap__mobile-wrong/
   * 04-t012s.png`, dpr 3):
   *
   *   ⚠ glyph    device 1626–1661   CSS 542.0–553.7
   *   «−10»      device 1687–1737   CSS 562.3–579.0
   *   «ИЗПИТНИ»  device 1764–1892   CSS 588.0–630.7   → 6.1 CSS px per capital
   *   «Т.»       device 1919–1947   CSS 639.7–649.0
   *
   * The mark is 86.7 CSS px; the lane after it is ~46 px with a queue badge up
   * and ~69 px without. «ОПАСНА» is 36.6, «ОСНОВНА» 42.7, «ВТОРОСТЕПЕННА» 79.3
   * — so the longest class cannot fit beside a «+3» on the narrowest phone, and
   * ONE `truncate`d string would have eaten the mark from the right.
   */
  it("the class truncates and the mark never does", () => {
    const html = peekMarkup(violationItem("vtorostepenna", "−1 изпитна т."), 3);
    // …past the handle's own value: `data-sim-overlay-mark-class=""` ends in
    // the four characters `class=""`, and a slice that began at the handle read
    // THAT as the element's class list and passed on an empty string.
    const handle = 'data-sim-overlay-mark-class=""';
    const classSpan = html.slice(html.indexOf(handle) + handle.length);
    const classClasses = /class="([^"]*)"/.exec(classSpan)?.[1] ?? "";
    expect(classClasses).toContain("truncate");
    expect(classClasses).toContain("min-w-0");

    // …and the chip that follows it is the one that may not give. Walked from
    // the class span's own close rather than searched for by its text: the
    // mark's string also appears in the card's `aria-label`, and a search that
    // found THAT read the wrapper's class list and asserted nothing.
    const afterClass = classSpan.slice(classSpan.indexOf("</span>"));
    const markSpan = afterClass.slice(afterClass.indexOf("<span"));
    expect(markSpan).toContain("· −1 изпитна т.");
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
