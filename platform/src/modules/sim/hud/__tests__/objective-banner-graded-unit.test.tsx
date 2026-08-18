import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObjectiveBanner } from "../ObjectiveBanner";
import { NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX } from "../notifyColumn";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { compileScenario } from "../../lessons/scenario/compile";
import type { ScenarioLevel } from "../../lessons/scenario/types";

/**
 * =============================================================================
 * „THE ONE FIGURE THE STUDENT IS BEING SCORED AGAINST IS UNREADABLE."
 *
 * THE EVIDENCE THIS FILE EXISTS FOR is `sc-ac-aquaplane/pc-right/01-arrival.png`
 * from the 161-scenario redrive, where the speed cap wraps mid-unit:
 *
 *     «… дръж под 63 км/»
 *     «ч»
 *
 * — and `sc-ac-rain-lights/pc-right/04-t090s.png`, filed MAJOR rather than
 * minor for the same shape on a world label, with the sentence this file is
 * named after: „«не по-бързо от 47 км/» … so the one figure the student is
 * being scored against is unreadable."
 *
 * IT IS NOT `break-words`. UAX #14 puts a line-break opportunity AFTER a
 * SOLIDUS, so «км/ч» ships a legal wrap point in its own middle and the engine
 * takes it whenever the line happens to fill to just past the slash. The window
 * is one character wide, which is exactly why it shows on one frame and not on
 * the ninety-nine either side of it — and exactly why a guard has to be a
 * corpus sweep rather than a photograph.
 *
 * WHAT IS ASSERTED HERE, and the two directions it has to hold in:
 *
 *   1. the numeral and its unit come out of this component as ONE unbreakable
 *      run — the direction the frame is about;
 *   2. NOTHING ELSE DOES. A blanket `nowrap` would close the finding and open a
 *      worse one: the catalogue's longest title is 77 characters and this
 *      column's content box is 312 px, so an unbreakable sentence is a clipped
 *      sentence (`hud-card-fit`'s photograph). „Loosen the check until
 *      everybody passes" has a layout form, and this is it;
 *   3. the TEXT is unchanged — no word joiners, no NBSPs. `advisorEchoTrim` in
 *      the shell compares the advisor's sentence against this exact string to
 *      decide whether the card below is repeating the banner, and every probe
 *      in `tools/mobile` reads `textContent`. A fix that edits the copy to fix
 *      the layout breaks both, silently.
 * =============================================================================
 */

/** `renderToStaticMarkup` emits no hydration comments, but never assume it. */
function markupOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node).replace(/<!--\s*-->/gu, "");
}

/**
 * Every run this component has declared unbreakable, in order.
 *
 * Matched on the SHIPPED declaration rather than on a class name: the binding
 * is an inline `white-space`, and an inline style is the one thing the UNPANEL
 * cascade in `PlayAreaStyles` cannot overrule (its sweep is `!important` on
 * `background-*` / `box-shadow` only, and `white-space` is on neither list).
 */
function nowrapRuns(markup: string): string[] {
  return [...markup.matchAll(/<span style="white-space:\s*nowrap"[^>]*>([^<]*)<\/span>/gu)].map(
    (m) => m[1]!,
  );
}

/** The rendered sentence as the student reads it — tags stripped, text kept. */
function textOf(markup: string, afterTag: "p"): string {
  const open = markup.indexOf(`<${afterTag} `);
  const close = markup.indexOf(`</${afterTag}>`, open);
  return markup.slice(open, close).replace(/<[^>]*>/gu, "");
}

const CAPPED = "Подмини авариралата кола в лентата за движение — под 110 км/ч";
const UNCAPPED = "Приближи кръстовището овладяно, готов за завой";

const steady = (titleBg: string) =>
  markupOf(<ObjectiveBanner titleBg={titleBg} index={1} total={3} progress={0.4} flash={null} />);

const flashing = (titleBg: string) =>
  markupOf(
    <ObjectiveBanner
      titleBg={UNCAPPED}
      index={2}
      total={3}
      progress={null}
      flash={{ titleBg, key: 1 }}
    />,
  );

/**
 * The banner exactly as it shipped until 2026-08-18 for a capped objective,
 * pasted rather than described — the sibling suite's device, for the sibling
 * suite's reason: „a guard that cannot be shown to fail on the behaviour it
 * replaced is the green-assertion-as-evidence this whole suite exists to end".
 */
const AS_SHIPPED_BEFORE =
  '<div role="status" data-hud="objective-banner" class="hud-ghost hud-banner-in pointer-events-none flex w-full min-w-0 flex-col gap-1 px-1 py-0.5 select-none">' +
  '<span class="text-[10px] font-black uppercase tracking-wider text-accent">Задача 1/3</span>' +
  `<p class="break-words text-[11px] font-bold leading-tight text-foreground">${CAPPED}</p></div>`;

describe("the graded speed leaves this component in one piece", () => {
  it("binds the numeral to its unit on the steady branch", () => {
    expect(nowrapRuns(steady(CAPPED))).toEqual(["110 км/ч"]);
  });

  it("…and on the completion-flash branch, which is the narrower box", () => {
    // `px-3` a side against the steady branch's `px-1`, plus a 20 px tick and
    // an 8 px gap: the tick card has 40 px less room for the same sentence, so
    // it is the branch a wrap is MORE likely on.
    expect(nowrapRuns(flashing(CAPPED))).toEqual(["110 км/ч"]);
  });

  it("the detector has teeth: the shape that shipped before bound nothing", () => {
    expect(nowrapRuns(AS_SHIPPED_BEFORE)).toEqual([]);
    expect(AS_SHIPPED_BEFORE).toContain(CAPPED);
  });

  it("does not touch a title that carries no unit — the over-correction", () => {
    // The failure this guards is the blanket `nowrap`: it would satisfy every
    // assertion above and clip the 77-character titles instead.
    expect(nowrapRuns(steady(UNCAPPED))).toEqual([]);
    expect(nowrapRuns(flashing(UNCAPPED))).toEqual([]);
  });

  it("leaves the authored sentence byte-for-byte intact", () => {
    // `advisorEchoTrim` compares the advisor's text against THIS string, and
    // the mobile probes read `textContent`. A word joiner or an NBSP would fix
    // the pixels and break both without reddening anything else.
    expect(textOf(steady(CAPPED), "p")).toBe(CAPPED);
    expect(textOf(steady(UNCAPPED), "p")).toBe(UNCAPPED);
  });

  it("binds every occurrence when a sentence carries two caps", () => {
    // Nothing in today's catalogue does; the loop is written to, so a future
    // template that does is covered rather than half-covered.
    const two = "Мини зоната под 30 км/ч, после подхода под 50 км/ч";
    expect(nowrapRuns(steady(two))).toEqual(["30 км/ч", "50 км/ч"]);
    expect(textOf(steady(two), "p")).toBe(two);
  });

  it("binds a bare unit that has no numeral in front of it", () => {
    // The intra-unit break is in «км/ч» itself; the numeral is the second half
    // of the defect, not the trigger.
    expect(nowrapRuns(steady("Дръж скоростта в км/ч под знака"))).toEqual(["км/ч"]);
  });
});

/**
 * =============================================================================
 * THE SWEEP — how much of the shipped catalogue this is about, and how much of
 * it the fix is allowed to touch.
 *
 * MEASURED 2026-08-18 over every objective of every compiled rung:
 *
 *     663 rungs, 1 575 rung-objectives
 *      40 carry «км/ч» (10 distinct sentences); the longest is 61 characters
 *       0 carry any OTHER token-with-a-solidus after a numeral — the rest of
 *         the tail is «с» (16) and «метра» (4), neither of which has a break
 *         opportunity inside it, so neither is bound
 *       8 characters is the longest run this creates («110 км/ч») against a
 *         45-character telemetry line, i.e. the binding cannot itself overflow
 * =============================================================================
 */
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4];

const TITLES = SCENARIO_TEMPLATES.flatMap((spec) =>
  LEVELS.filter((level) => spec.levels.some((l) => l.level === level)).flatMap((level) =>
    compileScenario(spec, level).objectives.map((o) => o.titleBg),
  ),
);

/** The same budget the sibling suite derives, restated from the same constant. */
const MONO_BUDGET_CHARS = Math.floor((NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX - 8) / 6.8);

describe("the shipped catalogue, swept", () => {
  it("has a corpus to sweep at all (the selectors.test.mjs lesson)", () => {
    expect(TITLES.length).toBeGreaterThan(600);
  });

  it("really does ship capped objectives — the fix is not hypothetical", () => {
    // A FLOOR and not the count: titles are authored copy and this must not
    // redden when somebody rewords one. MEASURED: 40.
    expect(TITLES.filter((t) => t.includes("км/ч")).length).toBeGreaterThanOrEqual(20);
  });

  it("every «км/ч» in the catalogue comes out inside a bound run", () => {
    const unbound = TITLES.filter((t) => t.includes("км/ч")).filter((t) => {
      const runs = nowrapRuns(steady(t));
      return runs.length !== (t.match(/км\/ч/gu) ?? []).length;
    });
    expect(unbound).toEqual([]);
  });

  it("…and no title without one is bound at all", () => {
    const overreach = TITLES.filter((t) => !t.includes("км/ч")).filter(
      (t) => nowrapRuns(steady(t)).length > 0,
    );
    expect(overreach).toEqual([]);
  });

  it("no bound run is wide enough to overflow the column it sits in", () => {
    // The direction that says the fix did not buy a clipped sentence to close
    // an amputated unit: an unbreakable run longer than the line budget is a
    // run that hangs out of `overflow-hidden`. MEASURED longest: 8 characters.
    const longest = Math.max(
      0,
      ...TITLES.flatMap((t) => nowrapRuns(steady(t)).map((r) => r.length)),
    );
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThan(MONO_BUDGET_CHARS);
  });

  it("every rendered title still reads as its authored self", () => {
    const altered = TITLES.filter((t) => textOf(steady(t), "p") !== t);
    expect(altered).toEqual([]);
  });
});
