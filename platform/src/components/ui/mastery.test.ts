import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { masteryBarColor, masteryInkColor } from "./mastery";

/**
 * The mastery percentage, as numbers.
 *
 * The bug this guards: the zero branch of the shared colour helper used to
 * return `--border-strong`, a hairline token, and three call sites piped it
 * into a `color:`. A student who had OPENED a topic and scored 0% — the most
 * common state a beginner is in — read their own progress at 1.57 : 1 on the
 * cluster palette the whole authenticated app is pinned to, and it failed in
 * the two legacy themes too (1.72 : 1 each). Not a regression; just never
 * measured.
 *
 * So the assertion RESOLVES the token the helper returns against the
 * stylesheet that actually ships and computes the ratio, rather than asserting
 * a hex. A hex assertion would pass forever while a palette retune underneath
 * it quietly re-broke the thing — and the whole reason this is a test is that
 * the previous guard was a "keep them in sync" comment.
 *
 * The WCAG maths is a deliberate re-implementation of the one in
 * app/clusterScope.test.ts, on the same reasoning stated there: arithmetic
 * borrowed from the code under test only proves the two agree with each other.
 */

const CSS = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

/** Declaration body of the rule whose selector list starts at `anchor`. */
function ruleBody(anchor: string): string {
  const at = CSS.indexOf(`\n${anchor}`);
  if (at === -1) throw new Error(`no rule found for selector ${anchor}`);
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("\n}", open);
  return CSS.slice(open + 1, close);
}

/** Every `--name: #rrggbb` in a rule body, lowercased. */
function tokens(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, hex] of body.matchAll(
    /(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g,
  )) {
    out[name] = hex.toLowerCase();
  }
  return out;
}

/**
 * All three palettes a student can actually be looking at. The authenticated
 * app is pinned to `cluster` today, but the app themes are still authored and
 * still reachable, and the point of the fix is that the ink token clears the
 * bar in every one of them rather than in the one that happens to ship.
 */
const PALETTES = {
  cluster: tokens(ruleBody('[data-surface="cluster"],')),
  "app-dark": tokens(ruleBody(':root[data-theme="dark"] {')),
  "app-light": tokens(ruleBody(':root[data-theme="light"] {')),
} as const;

/** Grounds the figure can sit on: `.card`/`.hud-panel` are `--surface`, the
 *  page behind them `--background`, and TopicSectionGroup's summary lifts to
 *  `--surface-2` on hover. Cheaper to clear all three than to argue. */
const GROUNDS = ["--background", "--surface", "--surface-2"] as const;

function channel(byte: number): number {
  const s = byte / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `var(--muted)` → `#8fa0b8`, in the palette under test. Throws rather than
 *  returning a default: a helper that started returning a literal colour, or a
 *  token that vanished from the stylesheet, must fail loudly here. */
function resolveToken(value: string, palette: Record<string, string>): string {
  const name = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
  if (!name) throw new Error(`not a token reference: ${value}`);
  const hex = palette[name];
  if (!hex) throw new Error(`token ${name} is not defined in this palette`);
  return hex;
}

/** WCAG 2.1: 4.5 : 1 for body text. The figure is 11–12px, so no large-text
 *  exemption is available even in principle. */
const AA_BODY = 4.5;

// The states the figure is actually rendered in. `started` mirrors the label:
// a not-started topic shows an em-dash, everything else shows a percentage.
const NO_PROGRESS: ReadonlyArray<readonly [string, number, boolean]> = [
  ["not started", 0, false],
  ["opened, scored 0%", 0, true], // the state that was broken
];
const EARNED: ReadonlyArray<readonly [string, number, boolean]> = [
  ["barely started", 0.12, true],
  ["getting there", 0.5, true],
  ["mastered", 0.9, true],
];

describe("the zero-mastery figure clears AA in every palette", () => {
  // This block is the fix. All three palettes, because the ink token has to be
  // a text token everywhere rather than in whichever theme happens to ship —
  // and because the two legacy themes are how we know 1.57 : 1 was never a
  // cluster-retune regression in the first place.
  it.each(
    NO_PROGRESS.flatMap(([label, mastery, started]) =>
      Object.entries(PALETTES).flatMap(([theme, palette]) =>
        GROUNDS.map(
          (ground) => [label, theme, ground, mastery, started, palette] as const,
        ),
      ),
    ),
  )("%s — %s, on %s", (_label, _theme, ground, mastery, started, palette) => {
    const ink = resolveToken(masteryInkColor(mastery, started), palette);
    expect(ratio(ink, palette[ground])).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("never hands a border token to a color:", () => {
    // The specific shape of the bug, asserted directly so a future edit that
    // reaches for `--border-strong` again fails on intent, not just on maths.
    for (const [, mastery, started] of [...NO_PROGRESS, ...EARNED]) {
      expect(masteryInkColor(mastery, started)).not.toBe("var(--border-strong)");
    }
  });
});

describe("the earned tiers clear AA on the palette that ships", () => {
  /**
   * Scoped to `cluster` deliberately, and the scoping is a finding rather than
   * a convenience. The same three tier tokens measured in `app-light` are:
   *
   *   --accent  #1b6bd6 → 4.36 : 1 on --surface-2   (barely started / getting there)
   *   --success #0e9f6e → 3.04 : 1 on --background,
   *                       3.39 : 1 on --surface,
   *                       2.90 : 1 on --surface-2   (mastered)
   *
   * i.e. a mastered topic's own figure is the least readable thing on the
   * light-theme card. That is pre-existing, it is a retune of `--success` and
   * `--accent` in globals.css rather than anything this helper can decide, and
   * it is out of this lane — the authenticated app is pinned to `cluster`, so
   * no student sees it today. Asserting it here would mean either failing the
   * gate on someone else's file or writing a floor low enough to be useless.
   */
  it.each(
    EARNED.flatMap(([label, mastery, started]) =>
      GROUNDS.map((ground) => [label, ground, mastery, started] as const),
    ),
  )("%s, on %s", (_label, ground, mastery, started) => {
    const palette = PALETTES.cluster;
    const ink = resolveToken(masteryInkColor(mastery, started), palette);
    expect(ratio(ink, palette[ground])).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe("mastery bar keeps its graphic token", () => {
  it("an untouched topic still draws the empty-bar hairline", () => {
    // The fix is text-only on purpose. A bar is a graphic: nothing is
    // identified by the unfilled remainder, so WCAG 1.4.11 does not reach it,
    // and raising it to an ink token would make every untouched topic look
    // like it had progress.
    expect(masteryBarColor(0)).toBe("var(--border-strong)");
  });

  it("the earned tiers are the same colours ink uses", () => {
    // Bar and ink may only disagree about zero. If they drift anywhere else,
    // a topic's figure and its bar stop being the same statement.
    for (const mastery of [0.12, 0.5, 0.9]) {
      expect(masteryBarColor(mastery)).toBe(masteryInkColor(mastery, true));
    }
  });
});

describe("the call sites use the shared helper", () => {
  // Three copies of this table with "keep them in sync" comments is how the
  // bug survived; re-triplicating it is how it comes back.
  // The theory hub's two entries changed name when the accordion became the
  // instrument deck (TopicSectionGroup/TopicCard → TopicGauge/TopicSheet), but
  // the invariant is the file's, not the filename's: whatever paints a mastery
  // colour imports the table instead of copying it.
  const CALL_SITES = [
    "../theory/TopicGauge.tsx",
    "../theory/TopicSheet.tsx",
    "../theory/TheoryFocus.tsx",
    "../dashboard/TopicMasteryGrid.tsx",
  ] as const;

  it.each(CALL_SITES)("%s imports it instead of redeclaring it", (rel) => {
    const src = readFileSync(resolve(__dirname, rel), "utf8");
    expect(src).toContain('from "@/components/ui/mastery"');
    expect(src).not.toMatch(/function\s+masteryColor\s*\(/);
  });
});
