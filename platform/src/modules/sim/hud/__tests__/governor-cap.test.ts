import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDashboardStatus, dashboardHash } from "../dashboardStatus";
import { GovernorCapMark } from "../StatusDashboard";

/**
 * =============================================================================
 * THE TIER'S CEILING IS ON SCREEN, AND IT SURVIVES THE COCKPIT FOLD.
 * 2026-08-11 — the „silent refusal" sweep, item 2.
 *
 * THE DEFECT. `vehicle/difficulty.ts` clamps the throttle to zero across the
 * last `GOVERNOR_BAND_KMH` before a per-tier cap. Measured 2026-08-11 over all
 * 105 districts: Начинаещ governs at 30 on the 31 maps posted 20–40, at 40 on
 * the 65 posted 50, at 60 / 80 / 130 on the rural and motorway maps; Нормален
 * at 50 / 60 / 80 / 100 / 150; Напреднал not at all. `governorCapKmh` existed,
 * was exported, and was read by exactly ONE test — nothing ever printed it. A
 * student pressing harder and going no faster had no way to learn it is the
 * tier and not the car.
 *
 * WHY THIS FILE IS ABOUT PLACEMENT AND NOT ABOUT COPY. Row C7 hides
 * `[data-hud="speed-block"]` in the cockpit camera, because the „Виток" 3D
 * cluster already draws speed and the selector there — and the cockpit is the
 * camera a lesson OPENS in. A cap mark placed inside that group would be
 * invisible for most of every drive, and the failure would be silent: no test,
 * no type error, just a number nobody sees. The legal-limit disc is outside
 * the group for exactly this reason (the cluster shows what the car does,
 * never what the law allows); the governor mark has the same argument — no
 * real car has a tier.
 * =============================================================================
 */

// Newlines normalised so a `\n` anchor cannot silently slice the wrong half on
// a CRLF checkout. Defensive: this file is LF today.
const SRC = fs
  .readFileSync(
    path.join(process.cwd(), "src", "modules", "sim", "hud", "StatusDashboard.tsx"),
    "utf8",
  )
  .replace(/\r\n/g, "\n");

/**
 * The two rendered variants — the phone readout and the roomy bar.
 *
 * The roomy anchor is searched FROM the compact one on purpose: this file's
 * first run matched the `Telltale` helper's own `return (<div` 265 lines
 * earlier, and the two slices came out inverted. The guard below is what said
 * so instead of the suite passing on garbage — which is the whole reason a
 * source test carries one.
 */
const COMPACT_AT = SRC.indexOf("if (compact) {");
const ROOMY_AT = SRC.indexOf("  return (\n    <div", COMPACT_AT);
if (COMPACT_AT === -1 || ROOMY_AT === -1) {
  throw new Error("StatusDashboard's two variants moved — this file is measuring nothing");
}
const COMPACT = SRC.slice(COMPACT_AT, ROOMY_AT);
const ROOMY = SRC.slice(ROOMY_AT);

/**
 * The source of the JSX element that opens at `from`, tag-balanced on `tag`.
 *
 * Deliberately dumb: it counts `<tag` against `</tag` and nothing else, which
 * is sound here because neither speed block contains a nested element of its
 * own tag and no string inside them contains the token. If that ever stops
 * being true this returns a short block and the negative control below — which
 * demands the SPEED be inside what it extracted — goes red rather than the
 * assertion quietly passing on an empty slice.
 */
function elementSource(src: string, from: number, tag: "span" | "div"): string {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let depth = 0;
  let i = from;
  while (i < src.length) {
    const nextOpen = src.indexOf(open, i);
    const nextClose = src.indexOf(close, i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + open.length;
      continue;
    }
    depth--;
    i = nextClose + close.length;
    if (depth === 0) return src.slice(from, i);
  }
  throw new Error(`unbalanced <${tag}> from index ${from}`);
}

/**
 * Every element carrying the camera handle, in one variant's source.
 *
 * The handle is matched INSIDE an opening tag (`[^>]*` cannot cross a `>`), not
 * merely found anywhere in the text: this file's second run matched the two
 * `{/* … *​/}` comments that discuss the fold rule and reported five blocks
 * where there are three.
 */
function speedBlocks(variant: string, tag: "span" | "div"): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*data-hud="speed-block"`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(variant)) !== null) out.push(elementSource(variant, m.index, tag));
  return out;
}

describe("the governor cap is printed at all", () => {
  it("both variants render the mark — neither drifts from the other", () => {
    // Row C7 is the precedent for insisting on BOTH: the camera handle lived on
    // the compact readout and not on the roomy bar, so the fold rule matched
    // nothing on the desktop the founder was actually looking at.
    expect(COMPACT).toContain("<GovernorCapMark");
    expect(ROOMY).toContain("<GovernorCapMark");
  });

  it("the mark says WHOSE ceiling it is, not merely that there is one", () => {
    // „it is the tier and not the car" is the sentence the student needs, and
    // the tier picker that would otherwise supply it is hidden during a mirror
    // glance and behind any rank-1 overlay on a phone (PlayAreaStyles).
    expect(SRC).toContain("tierBg={snap.governorTierBg}");
    expect(SRC).toMatch(/\{nameBg\} ≤\{cap\}/);
    // No cap = no mark. Printing „no ceiling" is furniture that teaches nothing.
    expect(SRC).toContain("if (capKmh === null) return null;");
  });

  /**
   * THE MARK IS INK, NEVER A CONTROL — the one claim that decides whether it
   * needed the 44 px / overlap treatment a new control gets.
   *
   * Measured from `padRectPx` (TouchControls' own resolver, generated from the
   * shipped CSS) the readout sits in the gap between the two thumb pads:
   * 350 px of clearance on an iPhone 16 landscape and 396 px on the small
   * phone — the two orientations this screen is designed for. In PORTRAIT the
   * gap is only 86.5 / 79.2 px and the readout ALREADY exceeded it before this
   * mark existed; what keeps that from being a defect is that neither the mark
   * nor the bar nor the shell's wrapper takes pointer events, so a thumb aimed
   * at the wheel or the throttle reaches it through the text.
   */
  it("neither variant can take a touch from the thumb pads underneath", () => {
    expect(COMPACT).toContain("pointer-events-none");
    expect(ROOMY).toContain("pointer-events-none");
    // …and the mark adds no listener, no button and no tabbable node of its own.
    const mark = SRC.slice(SRC.indexOf("function GovernorCapMark"), SRC.indexOf("export function StatusDashboard"));
    expect(mark).not.toMatch(/onClick|onPointer|tabIndex|<button/);
  });

  it("it lights from the physics predicate, not from a re-derived inequality", () => {
    // A mark that lit at a different speed from the clamp would be a NEW lie —
    // so the HUD asks `governorScale`'s own wrapper and imports NOTHING it
    // could re-derive the band from.
    expect(SRC).toContain("governorIsEasing(capKmh, speedKmh)");
    expect(SRC).toContain('import { governorIsEasing } from "../vehicle";');
    const imports = SRC.slice(0, SRC.indexOf("const DASHBOARD_POLL_MS"));
    expect(imports).not.toContain("GOVERNOR_BAND_KMH");
  });
});

describe("…and it survives the cockpit fold (row C7)", () => {
  const blocks = [...speedBlocks(COMPACT, "span"), ...speedBlocks(ROOMY, "div")];

  it("the walk actually found the folded groups — the negative control", () => {
    // Without this, every `not.toContain` below would pass just as happily on
    // an empty array, which is precisely how „0 controls painted over" was
    // reported for a week about a screen with three overlaps on it.
    expect(blocks.length).toBe(3); // compact ×1, roomy ×2 (gear + speed)
    for (const b of blocks) expect(b.length).toBeGreaterThan(80);
    // The thing the fold exists to hide must be inside what we extracted.
    expect(blocks.filter((b) => b.includes("{speed}")).length).toBe(2);
    expect(blocks.filter((b) => b.includes("{snap.gearLabel}")).length).toBe(2);
  });

  it("the mark is in NO folded group", () => {
    for (const b of blocks) expect(b).not.toContain("GovernorCapMark");
  });

  it("it stands beside the limit disc, which has the same argument", () => {
    for (const variant of [COMPACT, ROOMY]) {
      const disc = variant.indexOf("Ограничение ${limit}");
      const mark = variant.indexOf("<GovernorCapMark");
      expect(disc).toBeGreaterThan(-1);
      expect(mark).toBeGreaterThan(disc);
    }
  });
});

describe("the channel re-renders when the tier changes", () => {
  it("the hash notices a new cap and a new tier name", () => {
    const base = createDashboardStatus();
    expect(base.governorCapKmh).toBeNull();
    // A field the bar DRAWS and the hash ignores is a readout that keeps the
    // previous tier's number on screen until the speed happens to change.
    expect(dashboardHash({ ...base, governorCapKmh: 40, governorTierBg: "Начинаещ" })).not.toBe(
      dashboardHash(base),
    );
    expect(dashboardHash({ ...base, governorCapKmh: 40, governorTierBg: "Начинаещ" })).not.toBe(
      dashboardHash({ ...base, governorCapKmh: 60, governorTierBg: "Нормален" }),
    );
    // …and two tiers that happen to share a cap are still distinguishable
    // (Начинаещ 30 / Нормален 30 was a real collision before the L17 floor).
    expect(dashboardHash({ ...base, governorCapKmh: 30, governorTierBg: "Начинаещ" })).not.toBe(
      dashboardHash({ ...base, governorCapKmh: 30, governorTierBg: "Нормален" }),
    );
  });
});

/**
 * =============================================================================
 * THE MODE CAP IS NOT LEGAL ADVICE — 2026-08-16.
 *
 * THE DEFECT, MEASURED on the deployed build (iPhone-16 landscape,
 * `sc-vp-handbrake` L1): the whole bar was 104 px wide and read, as one string,
 * **„D 6 км/ч 50 Нормален ≤60"**. The red-ringed В26 disc occupied x 378–402
 * and this mark began at x 408 — **6 px** between a legal prohibition sign and
 * a training-mode throttle ceiling, with no rule, no label and no register
 * change between them. Founder: „…it reads as «the limit is 50, you may do 60»,
 * to a 17-year-old learning the law."
 *
 * The 60 is `rules/engine.ts:562` NORMAL_CAP_MARGIN_KMH = 10 — posted limit
 * plus ten, a governor on the PEDAL. Nothing on screen said so.
 *
 * WHY THESE ARE RENDER TESTS AND THE ONES ABOVE ARE NOT. The bar's state
 * arrives through an interval effect, so a static render of `StatusDashboard`
 * always carries `governorCapKmh: null` and never draws the mark — which is
 * why every existing guard here reads the source instead. A grep cannot tell
 * „the clause renders when the cap is above the limit" from „the string exists
 * somewhere in the file", and that conditional is the whole of this change, so
 * `GovernorCapMark` is now exported and rendered directly.
 * =============================================================================
 */
describe("the governor cap cannot be read as a permission", () => {
  const mark = (capKmh: number | null, limitKmh: number, speedKmh = 20) =>
    renderToStaticMarkup(
      createElement(GovernorCapMark, {
        capKmh,
        limitKmh,
        speedKmh,
        tierBg: "Нормален",
        size: "compact" as const,
      }),
    );

  it("names the REGISTER the number belongs to — a mode of the car, not the road", () => {
    // OLD: the mark was the bare string „Нормален ≤60". In Bulgarian that parses
    // as „Normal ≤60" — the tier's name is an ordinary adjective, so the one
    // word available to disambiguate was disambiguating the wrong way.
    //
    // The assertion is on the LABELLED span and not on the substring „Режим":
    // the first draft searched the whole markup, and the aria-label has always
    // opened with „Режимът „Нормален“ пуска…", so it passed on the old bare
    // mark too. A guard that green-lights the defect it was written for is
    // worse than no guard, and it took reverting the component to notice.
    const html = mark(60, 50);
    expect(html).toContain('data-hud="governor-register"');
    expect(html).toMatch(/data-hud="governor-register"[^>]*>\s*Режим\s*</);
  });

  it("says the sign wins when the mode ceiling is ABOVE the posted limit", () => {
    // The founder's own frame: cap 60, sign 50.
    expect(mark(60, 50)).toContain("знакът важи");
  });

  it("…and says nothing of the kind when the ceiling is at or under the sign", () => {
    // Below the limit there is no misreading to correct, and a permanent
    // disclaimer would be furniture. This is the assertion that proves the
    // clause is CONDITIONAL rather than always-on — i.e. that the component
    // was actually told what the law says on this road.
    expect(mark(40, 50)).not.toContain("знакът важи");
    expect(mark(50, 50)).not.toContain("знакът важи");
    // Negative control: the 40 case still rendered a mark at all, so the
    // `not.toContain` above is not passing on an empty string.
    expect(mark(40, 50)).toContain("Нормален ≤40");
  });

  it("still prints whose ceiling it is, and still vanishes when there is none", () => {
    expect(mark(60, 50)).toContain("Нормален ≤60");
    expect(mark(null, 50)).toBe(""); // „Напреднал" — no cap, no mark
  });

  it("the register label survives on the PHONE, where he read it", () => {
    // The telltale captions in this file are `hidden … sm:block`. If the
    // register word had borrowed that class it would be invisible on exactly
    // the device the complaint came from, and this suite would still be green.
    const src = SRC.slice(
      SRC.indexOf("export function GovernorCapMark"),
      SRC.indexOf("export function StatusDashboard"),
    );
    expect(src).toContain('data-hud="governor-register"');
    expect(src).not.toMatch(/governor-register[\s\S]{0,400}?\bhidden\b/);
    // …and it must not dress itself as a road sign: a red ring with a numeral
    // in it IS В26, and that shape is reserved for the law (see the disc).
    expect(src).not.toContain("rounded-full");
    expect(src).not.toContain("--danger");
  });

  it("a hairline separates the В26 disc from the mark, in BOTH variants", () => {
    // 6 px of whitespace was the entire separation. The compact variant drops
    // the band and every divider with it, which is right for instruments that
    // are merely adjacent and wrong for the one adjacency that changes what a
    // number MEANS — so the rule had to be added back for this pair only.
    for (const variant of [COMPACT, ROOMY]) {
      const disc = variant.indexOf("Ограничение ${limit}");
      const rule = variant.indexOf("<Divider short />", disc);
      const cap = variant.indexOf("<GovernorCapMark", disc);
      expect(disc).toBeGreaterThan(-1);
      expect(rule).toBeGreaterThan(disc);
      expect(cap).toBeGreaterThan(rule);
    }
  });

  it("the mark is told the posted limit by both variants", () => {
    // Without this the conditional above silently becomes dead code.
    const passes = SRC.match(/limitKmh=\{limitKmh\}/g) ?? [];
    expect(passes).toHaveLength(2); // compact + roomy
  });
});
