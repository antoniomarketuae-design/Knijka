import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDashboardStatus, dashboardHash } from "../dashboardStatus";

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
