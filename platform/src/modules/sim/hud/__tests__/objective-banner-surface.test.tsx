import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ObjectiveBanner } from "../ObjectiveBanner";
import { NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX } from "../notifyColumn";
import { GHOST_SURFACES, UNPANEL_CSS } from "../../../../components/sim/lesson-ui/PlayAreaStyles";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { compileScenario } from "../../lessons/scenario/compile";
import type { ScenarioLevel } from "../../lessons/scenario/types";

/**
 * =============================================================================
 * „THE TASK IS PRINTED OVER ANOTHER PANEL, IN THE TELEMETRY FACE, AND NOTHING
 *  IN THE HARNESS CAN SEE IT."
 *
 * THE EVIDENCE THIS FILE EXISTS FOR is seventeen frames of the 161-scenario
 * catalogue sweep, all routed at `ObjectiveBanner.tsx`. Read off the pixels of
 * `sc-roundabout-entry/pc-right/04-t141s.png` (1440 × 900, stage at x 265 /
 * y 107, ±2 px):
 *
 *     the banner       [1096, 159, 320 × 46]
 *     «Следвай синята линия»
 *                      [1242, 162, 174 × 27]   ← entirely inside it
 *
 * Two ghost surfaces at full opacity in the same 4 698 px², compositing
 * glyph-for-glyph into «Премини през кръговото иCизлезiс десенамигачıя». Same
 * shape on sc-ov-keep-right, sc-ed-reverse-line, sc-ed-poligon-chain,
 * sc-ed-d2-city-run, sc-follow-brake and sc-ln-turn-lane-arrows.
 *
 * WHY NO PROBE HAD EVER REPORTED IT, and this is the part this file guards.
 * `tools/mobile/lesson-audit.mjs`'s census enumerates `[data-hud]`; so do the
 * overlap sweeps; so does every arbitration rule in `PlayAreaStyles`. This
 * banner — the one surface that is up for the WHOLE DRIVE — carried no such
 * attribute, so all of them read straight through it and reported nothing. That
 * is not a hypothesis: `notifyColumn.ts` records the identical failure against
 * the shadow-line legend („the first measurement reported ZERO overlaps while
 * sitting entirely on top of it"), found only by looking at a frame.
 *
 * WHAT IS ASSERTED HERE, and what deliberately is NOT. The collision itself is
 * fixed in `PlayAreaStyles` / `LessonScene` — the chip's lane, not this
 * component — and the verbatim echo below the banner is fixed in `advisor.ts`.
 * Neither is this file's to make. What IS this file's:
 *
 *   1. the surface has a NAME, on both of its branches, so a rule can address
 *      it and a census can charge for it;
 *   2. the authored instruction is a SENTENCE (`<p>`), which is the only thing
 *      that puts it back in the reading face — UNPANEL's exemption is by TAG;
 *   3. the counter is NOT, because a counter is telemetry;
 *   4. the three-file chain that makes (2) work still exists: this component
 *      carries `.hud-ghost`, `.hud-ghost` is on `GHOST_SURFACES`, and the
 *      `:is(p, …)` exemption still names `p`. Break any link and the `<p>`
 *      becomes decoration — silently, with every test still green, which is the
 *      exact failure mode `unpanel.test.ts` was written for.
 * =============================================================================
 */

/** `renderToStaticMarkup` emits no hydration comments, but never assume it. */
function markupOf(node: React.ReactElement): string {
  return renderToStaticMarkup(node).replace(/<!--\s*-->/g, "");
}

/**
 * The tag of the element whose text content IS `text` — the question „which
 * face does the UNPANEL layer set this string in", answered structurally.
 *
 * A raw-markup scan rather than a DOM query because this suite runs in
 * `environment: "node"` (vitest.config.ts) and `FaultCard`'s tests already
 * establish `react-dom/server` as the way component output is asserted here.
 */
function tagHolding(markup: string, text: string): string | null {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/gu, (c) => `\\${c}`);
  return new RegExp(`<([a-z0-9]+)[^>]*>${escaped}</\\1>`, "iu").exec(markup)?.[1] ?? null;
}

const STEADY = markupOf(
  <ObjectiveBanner
    titleBg="Приближи кръстовището овладяно, готов за завой"
    index={1}
    total={3}
    progress={0.4}
    flash={null}
  />,
);

const FLASHING = markupOf(
  <ObjectiveBanner
    titleBg="Спри плавно преди линията"
    index={2}
    total={3}
    progress={null}
    flash={{ titleBg: "Приближи кръстовището овладяно, готов за завой", key: 1 }}
  />,
);

/**
 * The banner exactly as it shipped until 2026-08-17, pasted rather than
 * described. Every assertion below is run against it too — a guard that cannot
 * be shown to fail on the behaviour it replaced is the green-assertion-as-
 * evidence this whole suite exists to end (`hud-card-fit.test.ts`'s „the
 * detector has teeth").
 */
const AS_SHIPPED_BEFORE =
  '<div role="status" class="hud-ghost hud-banner-in pointer-events-none flex w-full min-w-0 flex-col gap-1 px-1 py-0.5 select-none">' +
  '<span class="text-[10px] font-black uppercase tracking-wider text-accent">Задача 1/3</span>' +
  '<span class="break-words text-[11px] font-bold leading-tight text-foreground">' +
  "Приближи кръстовището овладяно, готов за завой</span></div>";

describe("the objective banner is a NAMED surface", () => {
  it("carries data-hud on the steady branch, so a census can see it", () => {
    expect(STEADY).toContain('data-hud="objective-banner"');
  });

  it("…and on the completion-flash branch, which is the same surface", () => {
    // A panel that renames itself for 1.6 s every time an objective completes
    // would drop out of any census taken in that window — and a completion is
    // exactly when a sweep tends to photograph.
    expect(FLASHING).toContain('data-hud="objective-banner"');
  });

  it("the detector has teeth: the shape that shipped before carries no name", () => {
    expect(AS_SHIPPED_BEFORE).not.toContain("data-hud");
  });

  it("is not accidentally sharing a name with another surface", () => {
    // `objective-banner` must be new vocabulary; if it collided with an existing
    // `data-hud` the PlayAreaStyles rules for that surface would silently start
    // applying here.
    expect(UNPANEL_CSS).not.toContain('data-hud="objective-banner"');
    expect(GHOST_SURFACES).not.toContain('[data-hud="objective-banner"]');
  });
});

describe("the authored instruction is prose; the counter is telemetry", () => {
  const TITLE = "Приближи кръстовището овладяно, готов за завой";

  it("prints the objective title inside a <p>", () => {
    expect(tagHolding(STEADY, TITLE)).toBe("p");
  });

  it("prints the completed objective inside a <p> as well", () => {
    expect(tagHolding(FLASHING, TITLE)).toBe("p");
  });

  it("keeps «Задача i/т» a <span> — the other direction", () => {
    // The failure this guards is the over-correction: a pass that turns every
    // string in the HUD into prose loses the telemetry face for the readouts,
    // which is the half of the founder's 2026-08-02 reference that the FIRST
    // unpanel pass got right.
    expect(tagHolding(STEADY, "Задача 1/3")).toBe("span");
  });

  it("the detector has teeth: the shape that shipped before set the task in mono", () => {
    // `<span>` is outside `:is(p, h1, h2, h3, blockquote)`, so the register's
    // `font-family: var(--font-mono)` reached the sentence.
    expect(tagHolding(AS_SHIPPED_BEFORE, TITLE)).toBe("span");
    expect(tagHolding(AS_SHIPPED_BEFORE, "Задача 1/3")).toBe("span");
  });
});

describe("the three-file chain that makes the <p> mean anything", () => {
  it("the banner is still a ghost surface — the rule is scoped to those", () => {
    expect(STEADY).toContain("hud-ghost");
    expect(FLASHING).toContain("hud-ghost");
    expect(GHOST_SURFACES).toContain(".hud-ghost");
  });

  it("UNPANEL still exempts <p> from the telemetry face", () => {
    // The same assertion `unpanel.test.ts` makes about the toast, restated here
    // because THIS component now depends on it: drop `p` from that selector and
    // the objective goes back to mono with nothing failing.
    expect(UNPANEL_CSS).toMatch(/:is\(p, h1, h2, h3, blockquote\)[\s\S]{0,80}var\(--font-sans\)/);
  });

  it("…and still strips the <p>'s own fill, so it did not become a panel", () => {
    // The sweep's element list has to keep naming `p`, or a `<p>` inside a ghost
    // surface would keep any background it inherits — trading a face problem for
    // the panel the 2026-08-02 pass removed.
    expect(UNPANEL_CSS).toMatch(/:is\(div, span, button, kbd, p, li, a, section\)/);
  });
});

/**
 * =============================================================================
 * WHAT THE TELEMETRY FACE COSTS THE OBJECTIVE, OVER THE WHOLE CATALOGUE.
 *
 * MEASURED, off the shipped frame rather than assumed: on
 * `sc-roundabout-entry/pc-right/04-t141s.png` the 45-character title
 * «Приближи кръстовището овладяно, готов за завой» laid out 307 px in this
 * column — 6.8 px a character in JetBrains Mono at `text-[11px]`. The roomy
 * column is `NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX` wide and the banner spends
 * `px-1` (4 px) a side, so the line budget is 45 characters.
 *
 * `PlayAreaStyles`' own comparison of the two faces in one box is „about 24
 * characters per line [mono] against about 35 in the body face" — 1.46× — which
 * puts the reading face at 65 characters on this line. That ratio is QUOTED, not
 * re-measured here: only the mono figure came off a frame.
 *
 * SWEPT over every objective of every compiled rung of the shipped catalogue,
 * 2026-08-17:
 *
 *     1 563 rung-objectives
 *       684 (43.8 %) longer than the 45-character telemetry line
 *       664 of those fit the 65-character reading line — one line instead of two
 *        20 are long in either face (worst 77 characters) and simply wrap
 * =============================================================================
 */
const MONO_PX_PER_CHAR = 6.8;
const BANNER_SIDE_PADDING_PX = 4;
const SANS_CHARS_PER_MONO_CHAR = 35 / 24;

const CONTENT_PX = NOTIFY_COLUMN_MAX_WIDTH_ROOMY_PX - 2 * BANNER_SIDE_PADDING_PX;
const MONO_BUDGET_CHARS = Math.floor(CONTENT_PX / MONO_PX_PER_CHAR);
const SANS_BUDGET_CHARS = Math.floor(MONO_BUDGET_CHARS * SANS_CHARS_PER_MONO_CHAR);

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4];

/** Every objective title the catalogue actually ships, one entry per rung. */
const TITLES = SCENARIO_TEMPLATES.flatMap((spec) =>
  LEVELS.filter((level) => spec.levels.some((l) => l.level === level)).flatMap((level) =>
    compileScenario(spec, level).objectives.map((o) => ({
      id: `${spec.id}@L${level}/${o.id}`,
      titleBg: o.titleBg,
    })),
  ),
);

describe("the line budget the face change buys back", () => {
  it("states the arithmetic, so the numbers can be re-run rather than trusted", () => {
    expect(CONTENT_PX).toBe(312);
    expect(MONO_BUDGET_CHARS).toBe(45);
    expect(SANS_BUDGET_CHARS).toBe(65);
  });

  it("has a corpus to sweep at all (the selectors.test.mjs lesson)", () => {
    // A sweep over an empty list is the `mustFit` selector that vouched for a
    // screen it had never looked at, for four months.
    expect(TITLES.length).toBeGreaterThan(600);
  });

  it("the catalogue really does overflow a mono line — the change is not cosmetic", () => {
    const overMono = TITLES.filter((t) => t.titleBg.length > MONO_BUDGET_CHARS);
    // MEASURED 2026-08-17 over all 1 563 rung-objectives: 684 (43.8 %). The
    // assertion is a FLOOR and not the count, because titles are authored copy
    // and this must not redden when somebody shortens one; a floor at half the
    // measured value still cannot be satisfied by an empty or broken sweep.
    expect(overMono.length).toBeGreaterThan(300);
  });

  it("…and the reading face is where they come back onto one line", () => {
    // The direction that matters, and the reason the `<p>` is not taste: every
    // title the telemetry face wrapped and the reading face does not.
    // MEASURED: 664 of the 684 recover; the remaining 20 are long in either face
    // (worst 77 characters) and wrap, which is what `break-words` is for.
    const recovered = TITLES.filter(
      (t) => t.titleBg.length > MONO_BUDGET_CHARS && t.titleBg.length <= SANS_BUDGET_CHARS,
    );
    expect(recovered.length).toBeGreaterThan(300);
  });

  it("no title is beyond BOTH budgets without being able to wrap", () => {
    // `break-words` is what keeps a 16-letter Bulgarian compound from being
    // amputated by the column's `overflow-hidden` (hud-card-fit's photograph).
    // A long title is fine; a long title in a box that cannot wrap is not.
    expect(STEADY).toMatch(/class="[^"]*\bbreak-words\b/);
  });
});
