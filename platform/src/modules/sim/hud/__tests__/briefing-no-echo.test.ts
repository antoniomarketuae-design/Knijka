import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { briefingBodyBg, briefingLineBg } from "../overlayQueue";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { compileScenario } from "../../lessons/scenario/compile";
import type { ScenarioLevel } from "../../lessons/scenario/types";

/**
 * =============================================================================
 * „THERE ARE TWO COPIES OF IT ON SCREEN, IN DIFFERENT STYLING, BOTH CUT."
 *
 * THE EVIDENCE THIS FILE EXISTS FOR is two frames from the founder's own
 * iPhone 16, 2026-08-14, and a device census that reproduced them on all six
 * profiles in both orientations:
 *
 *   PORTRAIT   bold white  «Потегли по улицата и се движи спокойно в своята
 *                           лента. По…»                       ← ellipsis
 *              grey below  «1. Потегли по улицата и се движи спокойно в своята
 *                           лента. По тъмно първо провери късите светлини
 *                           (чл. 70): пред пешеходна пътека…» ← ellipsis
 *   LANDSCAPE  the same two, the first sliced horizontally through the middle
 *              of its glyphs, the second cut at «пред пешеходна».
 *
 * ONE CARD. `LessonPlayShell` §4c set `lineBg = briefingBg[0].textBg` and
 * `detailBg = briefingBg.map(s => `${s.n}. ${s.textBg}`)` — the whole list,
 * step 1 INCLUDED — so `SimOverlay`'s row 2 and row 2b printed the identical
 * 219 characters, two millimetres apart, in two different typefaces, and
 * clamped both. The read sheet behind «ЗАЩО» inherited it: its <h2> and the
 * first line of its body were the same sentence.
 *
 * WHAT IT COST, IN THE ONLY UNITS THAT MATTER HERE. The compact column's cap in
 * landscape is 128 px (`100% − TOUCH_CONTROLS_FLOOR − top` at 852 × 393). The
 * echo was 219 of the 556 characters that card had to hold on
 * `sc-zebra-approach@L1` — 39 % — and 412 of 972 on the same scenario at L4,
 * where step 1 is the exam-protocol complication. Two fifths of a budget that
 * was already three times oversubscribed, spent saying the same thing twice.
 *
 * WHY NO TEST CAUGHT IT, AND WHY THIS ONE CAN. It was a single expression
 * inside a 4 000-line component: nothing importable, nothing assertable, and
 * every probe that looked at the screen counted CLIPPING rather than REPETITION
 * (`el.scrollWidth > el.clientWidth`, which cannot see either). The derivation
 * is two exported pure functions now, so this file can push every compiled rung
 * of all 167 shipped templates through the SAME code the card renders and fail
 * the moment the body starts echoing the line again.
 *
 * IT IS A REGRESSION OF THE THEO-4 FIX, not an ancient bug — which is the part
 * worth remembering. Until row 2b landed, `detailBg` rendered ONLY inside the
 * read sheet: a different surface, one tap away, where a header and its list
 * may legitimately repeat. The moment the body was brought onto the CARD to
 * stop the phone hiding the reasoning, the card began saying everything twice.
 * A fix that moves content between surfaces has to re-ask what each surface is
 * now holding, and that is exactly what this file makes unskippable.
 * =============================================================================
 */

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4];

/**
 * Every compiled rung that actually ships, with its authored briefing.
 *
 * Only the levels a template AUTHORS — `compileScenario` throws on a rung that
 * does not exist (`sc-sign-warning` stops at L3), and a sweep that swallowed
 * that would quietly shrink its own corpus.
 */
const RUNGS = SCENARIO_TEMPLATES.flatMap((spec) =>
  LEVELS.filter((level) => spec.levels.some((l) => l.level === level)).map((level) => {
    const lesson = compileScenario(spec, level);
    return { id: `${spec.id}@L${level}`, steps: lesson.briefingBg ?? [] };
  }),
).filter((r) => r.steps.length > 0);

/** Bulgarian prose comparison: whitespace and case are not the point. */
function norm(s: string): string {
  return s.replace(/\s+/gu, " ").trim().toLocaleLowerCase("bg-BG");
}

describe("the briefing card never prints the same sentence twice", () => {
  it("has a corpus to assert against at all (the selectors.test.mjs lesson)", () => {
    // A rule that sweeps an empty list is the four-month `mustFit` selector
    // that vouched for a screen it had never looked at. 167 templates × 4 rungs.
    expect(RUNGS.length).toBeGreaterThan(600);
  });

  it("the body never repeats the line, on any rung of any shipped template", () => {
    const echoes: string[] = [];
    for (const rung of RUNGS) {
      const line = norm(briefingLineBg(rung.steps));
      const body = briefingBodyBg(rung.steps);
      if (line.length === 0 || body === null) continue;
      if (norm(body).includes(line)) echoes.push(rung.id);
    }
    expect(echoes).toEqual([]);
  });

  it("…and the OLD derivation still fails it, so the assertion has teeth", () => {
    // The exact expression that shipped until 2026-08-14. If this ever stops
    // failing, the test above has stopped testing anything.
    const oldBody = (steps: readonly { n: number; textBg: string }[]) =>
      steps.map((s) => `${s.n}. ${s.textBg}`).join("\n");
    const broken = RUNGS.filter((r) =>
      norm(oldBody(r.steps)).includes(norm(briefingLineBg(r.steps))),
    );
    expect(broken.length).toBe(RUNGS.length);
  });

  it("loses not one authored character: line + body === the whole briefing", () => {
    // The fix must be a DEDUPLICATION, never a truncation. THEO-4 does not
    // permit paying for a height budget with the lesson's own words, and the
    // clamp this replaced was doing precisely that (77 px of the headline and
    // 215 px of the body hidden behind „…", with the student told neither).
    for (const rung of RUNGS) {
      const rebuilt = [
        briefingLineBg(rung.steps),
        ...(briefingBodyBg(rung.steps) ?? "").split("\n").filter(Boolean),
      ]
        .map(norm)
        .join(" ");
      for (const step of rung.steps) {
        expect(rebuilt, `${rung.id} · step ${step.n} went missing`).toContain(norm(step.textBg));
      }
    }
  });

  it("keeps the authored numbering — the body starts at 2., never renumbered", () => {
    for (const rung of RUNGS) {
      if (rung.steps.length < 2) continue;
      const body = briefingBodyBg(rung.steps)!;
      expect(body.startsWith(`${rung.steps[1]!.n}. `), rung.id).toBe(true);
      expect(body.startsWith("1. "), rung.id).toBe(false);
    }
  });

  it("offers no «ПРОЧЕТИ» for a one-step briefing (a sheet onto nothing)", () => {
    expect(briefingBodyBg([{ n: 1, textBg: "Само това." }])).toBeNull();
    expect(briefingBodyBg([])).toBeNull();
    expect(briefingLineBg([])).toBe("");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   …AND THE OTHER HALF: THE CARD MAY NOT SLICE A GLYPH.

   The duplication is why there were two. This is why both were CUT.

   Measured on the deployed build (`wave11-why-sliced.mjs`, WebKit, real insets,
   sc-zebra-approach@L1, 852 × 393): the column caps the card at 128 px; the two
   text rows carried `line-clamp-3` / `line-clamp-6`; `line-clamp` compiles to
   `overflow: hidden`; and an overflow other than `visible` ZEROES a flex item's
   automatic minimum size. So the two text rows were the only shrinkable items
   in the card's column and absorbed the entire 353 px shortfall — the headline
   was given 19.1 px of the 96 px it wanted (1.38 line boxes of 13.75 px, so
   line 2 kept 0.38 of its height and was guillotined through the waist) and the
   body 41.9 px of 257 px. On the 780 × 360 Samsung the headline is a 2.6 px
   sliver: gone.

   The fix is structural — a scroll window that takes the shortfall, with the
   text rows `shrink-0` inside it so nothing is ever laid out at 1.38 lines —
   and a source scan is the only cheap net for it: a clamp reintroduced anywhere
   in this card looks perfectly reasonable in a diff and silently restores both
   the amputation and the silent ellipsis.
   ═══════════════════════════════════════════════════════════════════════════ */
const OVERLAY_SRC = readFileSync(join(__dirname, "..", "SimOverlay.tsx"), "utf8");

describe("SimOverlay's card cannot go back to clipping its own text", () => {
  it("has a scroll window that owns the shortfall", () => {
    expect(OVERLAY_SRC).toContain('data-sim-overlay-text=""');
    // `min-h-0` is what lets a flex item shrink below its content at all, and
    // `shrink` is what makes THIS the item that gives. Without both the card
    // overflows its cap and the control row leaves the screen.
    expect(OVERLAY_SRC).toMatch(/data-sim-overlay-text[\s\S]{0,220}min-h-0[\s\S]{0,120}overflow-y-auto/);
  });

  it("no `line-clamp` and no `truncate` on any authored sentence in this file", () => {
    // The chip («ИНСТРУКЦИИ», «Подготовка») is a LABEL and may still truncate —
    // it is short by construction and it is not the lesson. Every other clamp
    // in this file was hiding authored Bulgarian, and the student was told
    // nothing about any of it.
    const offenders = OVERLAY_SRC.split("\n")
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => /className=.*\b(line-clamp-\d+|truncate)\b/.test(text))
      .filter(({ text }) => !/tracking-wider/.test(text)); // the uppercase chips
    expect(offenders).toEqual([]);
  });

  it("the control row cannot shrink — it is the only way out of a blocking card", () => {
    expect(OVERLAY_SRC).toMatch(/mt-0\.5 flex shrink-0 items-center justify-end/);
  });

  it("the read sheet's own title is no longer a fragment", () => {
    // It used to be `<h2 class="… truncate …">{lineBg}</h2>` and ate 146 of 219
    // characters of the instruction it was heading — on the surface a student
    // is SENT TO because the peek could not finish printing.
    expect(OVERLAY_SRC).not.toMatch(/<h2[^>]*truncate/);
    // …and the sheet keeps the authored line breaks of a numbered briefing,
    // which it never did: the five steps arrived as one run-on paragraph.
    expect(OVERLAY_SRC).toMatch(/whitespace-pre-line[^\n]*\n?[^\n]*\{shown\.detailBg\}/);
  });
});
