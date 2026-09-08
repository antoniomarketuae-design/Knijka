import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMENDATIONS,
  PER_ACT_COPY,
  VIOLATIONS,
  YIELD_PRAISE_SITUATION_COPY,
} from "../catalog";

/* ─────────────────────────────────────────────────────────────────────────────
   „A TITLE THAT FILLS THE PEEK LEAVES THE AUTHORED WHY NOTHING."

   THE EVIDENCE THIS FILE EXISTS FOR is a photograph, not a hypothesis:
   `.audit-frames/w10-3/frames/sc-merge-from-property__mobile-right/
   04-t024s.png` (sc-merge-from-property:6715b581). A phone mid-drive, one card
   on the glass:

       ⚠ −10 ИЗПИТНИ Т.                    (+1)
       Непропускане на пътно
       превозно средство с          ← the fault NAME, cut at a preposition
       ↓ ОЩЕ 10 РЕДА
       ЗАЩО   ✕

   Zero lines of explanation. A seventeen-year-old is charged ten points for an
   ОПАСНА ГРЕШКА, is not told which one, and is told nothing about why it is
   dangerous — requirement zero (doc 64 THEO-4) breached by a string length.

   THE ARITHMETIC, all of it off `hud/SimOverlay.tsx`'s own `textWindowStyle`
   (whose floor is owned and asserted by `hud/__tests__/hud-off-the-road.test
   .ts`; this file re-reads the literal so the two cannot drift apart):

       the window        `minHeight: "2.75rem"`   = 44 px
       a title line box  11 px at `leading-tight` = 13.75 px  (`lineBg`)
       a body line box   11 px at `leading-snug`  = 15.125 px (`detailBg`)

       3 title lines → 41.25 of 44 px  → 2.75 px left → NO body line
       2 title lines → 27.50 of 44 px  → 16.5 px left → one whole body line

   So the peek's contract is exactly: A TITLE MAY OCCUPY AT MOST TWO LINE
   BOXES. Above that the card is a verdict with no reason attached, which is
   the one thing THEO-4 forbids. SimOverlay's own block names the remedy and
   says it is „an AUTHORING one: a `lineBg` short enough for the peek to
   finish" — this is that authoring rule, as a gate rather than a paragraph.

   WHY CHARACTERS AND NOT PIXELS, stated so the number is not read as more than
   it is. There is no font in jsdom and no run-time metric to import, so the
   line capacity is a PROXY, calibrated on the frame above rather than guessed:

       the compact column   `NOTIFY_COLUMN_MAX_WIDTH_COMPACT_PX` = 240 px,
                            leaving ≈180 px of text between the card's paddings
       measured on 04-t024s (852 × 393 at dpr 3): «Непропускане на пътно» —
                            21 characters — runs 139 CSS px, a mean advance of
                            6.6 px for this alphabet at 11 px bold, and the line
                            broke rather than take «превозно» (9 more characters
                            = 59 px, which would have made 198 > 180)
       180 / 6.6          = 27.3 characters

   The gate uses 26 — one character below the measurement — and the whole
   catalogue clears it with the single exception this lane repaired. It is
   deliberately NOT tuned to the tightest number that keeps today's rows green:
   at 25 and at 27 the failing set is the same one row, so the answer does not
   depend on where inside the measured band the line is drawn.
   ───────────────────────────────────────────────────────────────────────────── */

/** `hud/SimOverlay.tsx`'s peek text window, read rather than restated. */
const OVERLAY = readFileSync(
  resolve(__dirname, "../../hud/SimOverlay.tsx"),
  "utf8",
);

/** px. 11 px at `leading-tight` — the box one line of `lineBg` occupies. */
const TITLE_LINE_PX = 13.75;
/** px. 11 px at `leading-snug` — the box one line of `detailBg` occupies. */
const BODY_LINE_PX = 15.125;
/** px. The peek's text window floor (`minHeight: "2.75rem"`). */
const WINDOW_PX = 2.75 * 16;

/** Characters one line of the compact card holds — see the block above. */
const PEEK_LINE_CHARS = 26;

/** Greedy word wrap, the browser's own algorithm at a character budget. */
function wrap(title: string, perLine = PEEK_LINE_CHARS): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of title.trim().split(/\s+/)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (next.length <= perLine) {
      line = next;
    } else {
      if (line !== "") out.push(line);
      line = word;
    }
  }
  if (line !== "") out.push(line);
  return out;
}

describe("the peek card's title budget", () => {
  it("is two line boxes, and the window is still the 44 px this is derived from", () => {
    expect(OVERLAY).toContain('minHeight: "2.75rem"');
    // Two title lines still leave a whole line of authored WHY…
    expect(WINDOW_PX).toBeGreaterThanOrEqual(2 * TITLE_LINE_PX + BODY_LINE_PX);
    // …and three do not. This is the inequality the gate below enforces.
    expect(WINDOW_PX).toBeLessThan(3 * TITLE_LINE_PX + BODY_LINE_PX);
  });

  /**
   * THE ROW ITSELF. Every offence and every commendation a student can meet on
   * the glass mid-drive goes through `SimOverlay`'s peek as `lineBg`, so this
   * walks the whole catalogue rather than the codes one lesson happens to fire.
   * A new row that cannot finish in two lines fails HERE, instead of being
   * photographed on a phone three waves later.
   */
  it("no violation title needs a third line, so the WHY always reaches the glass", () => {
    const over = Object.entries(VIOLATIONS)
      .map(([code, spec]) => [code, spec.titleBg, wrap(spec.titleBg)] as const)
      .filter(([, , lines]) => lines.length > 2)
      .map(([code, title, lines]) => `${code} (${title.length} chars): ${lines.join(" / ")}`);
    expect(over).toEqual([]);
  });

  it("no commendation title needs a third line either", () => {
    const over = Object.entries(COMMENDATIONS)
      .map(([code, spec]) => [code, spec.titleBg, wrap(spec.titleBg)] as const)
      .filter(([, , lines]) => lines.length > 2)
      .map(([code, title, lines]) => `${code} (${title.length} chars): ${lines.join(" / ")}`);
    expect(over).toEqual([]);
  });

  /**
   * THE PHOTOGRAPH, KEPT AS A CASE so the gate is anchored to the defect and
   * not only to today's corpus. Both strings the audit filed against are here:
   * the one on the frame, and the one the catalogue carries now.
   */
  it("refuses the two strings the audit photographed and accepts their repairs", () => {
    expect(wrap("Непропускане на пътно превозно средство с предимство")).toHaveLength(3);
    expect(wrap("Изпреварване на велосипедист без странична дистанция")).toHaveLength(3);
    expect(wrap(VIOLATIONS.FAILED_TO_YIELD.titleBg).length).toBeLessThanOrEqual(2);
    expect(wrap(VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg).length).toBeLessThanOrEqual(2);
  });

  /**
   * AND THE ANSWER DOES NOT DEPEND ON WHERE IN THE MEASURED BAND THE LINE IS
   * DRAWN. 6.6 px per character is a mean, not a metric, so the gate is only
   * honest if it holds across the band that mean can plausibly be off by. It
   * does: 25, 26 and 27 characters per line all leave the catalogue clean.
   */
  it("holds across the measured band, not only at the number it is set to", () => {
    for (const perLine of [25, 26, 27]) {
      const over = Object.entries(VIOLATIONS)
        .filter(([, spec]) => wrap(spec.titleBg, perLine).length > 2)
        .map(([code]) => `${code} @${perLine}`);
      expect(over).toEqual([]);
    }
  });

  /**
   * ── THE OVERRIDE CHANNEL, w28 2026-09-04 ─────────────────────────────────
   *
   * THE TWO CASES ABOVE WALKED THE POOLED ROWS AND STOPPED THERE, and a pooled
   * row is not what a student necessarily reads. `makeViolation` resolves
   * `overrides?.titleBg ?? act?.titleBg ?? spec.titleBg` and `makeCommendation`
   * does the same off `YIELD_PRAISE_SITUATION_COPY`, so on every event that
   * carries a `detail` (or a `situation`) the string on the glass comes out of
   * one of these tables and never touches the row the gate was checking. The
   * budget is a property of the WINDOW, so it has to be total over every string
   * that can reach it.
   *
   * IT WAS NOT ACADEMIC: `YIELD_PRAISE_SITUATION_COPY.emergency` shipped at 47
   * characters — «Правилно пропуснат / автомобил със специален / режим», three
   * line boxes — while `COMMENDATIONS.YIELDED_TO_PRIORITY`, the row it
   * overrides, is 29 and passed. That is the photographed defect reached
   * through a side door, and this case is the door.
   *
   * WHAT IS NOT WALKED HERE, stated so the hole is named rather than implied:
   * `JUNCTION_SCAN_COPY` and `SNOW_LIGHTS_COPY` ride the same `overrides`
   * channel from `rules/engine.ts` and are module-private there. Both were
   * measured at this budget when this case was written — 2 lines each
   * («Непълно оглеждане при знак / Б1», «Движение в снеговалеж без /
   * светлини») — and neither is reachable from this file without exporting a
   * const out of the reducer. `PER_ACT_COPY`, which this case does walk, is
   * where that table's own docblock says the next act table goes — so it is
   * the registry the growth arrives through.
   */
  it("no per-act or per-situation OVERRIDE title needs a third line either", () => {
    const over: string[] = [];
    for (const [code, table] of Object.entries(PER_ACT_COPY)) {
      for (const [detail, copy] of Object.entries(table ?? {})) {
        const lines = wrap(copy.titleBg);
        if (lines.length > 2) {
          over.push(`${code}/${detail} (${copy.titleBg.length} chars): ${lines.join(" / ")}`);
        }
      }
    }
    for (const [situation, copy] of Object.entries(YIELD_PRAISE_SITUATION_COPY)) {
      const lines = wrap(copy.titleBg);
      if (lines.length > 2) {
        over.push(
          `YIELDED_TO_PRIORITY/${situation} (${copy.titleBg.length} chars): ${lines.join(" / ")}`,
        );
      }
    }
    expect(over).toEqual([]);
  });

  /**
   * THE STRING THIS LANE CUT, kept as a case for the reason the two above it
   * are kept: so the gate is anchored to the defect and not only to today's
   * corpus.
   */
  it("refuses the praise title the override channel was shipping and accepts its repair", () => {
    expect(wrap("Правилно пропуснат автомобил със специален режим")).toHaveLength(3);
    expect(wrap(YIELD_PRAISE_SITUATION_COPY.emergency.titleBg).length).toBeLessThanOrEqual(2);
    // …and it did not lose the half that says WHICH act was praised.
    expect(YIELD_PRAISE_SITUATION_COPY.emergency.titleBg).toContain("специален режим");
  });
});
