import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { arcRisePx, touchControlsFloorPx } from "../../../../components/sim/TouchControls";

/**
 * =============================================================================
 * NOTHING MAY STAND ON THE THUMBS — doc 91 §I10 (L3) AND §O.3 N4.
 *
 * Both rows in this file were closed on `/dev/drive-rig` by an earlier wave and
 * both were still wrong on the deployed `/simulator`, which is the whole reason
 * doc 91 §O exists. So the assertions here are deliberately of the kind a rig
 * cannot flatter: the ARITHMETIC of the corridor (pure functions the component
 * exports) and the SOURCE TEXT of the two declarations that were wrong. A
 * percentage, a screenshot or „0 overlaps" from a harness page would all have
 * passed before either fix and would pass again if either is reverted.
 *
 * ── I10 · THE MINIMAP COLUMN ────────────────────────────────────────────────
 * It hung from `--sim-hud-floor`, which is the INSTRUMENT band (dash + 8 =
 * 48 px on every profile in the ladder) and not the thumb band, which reaches
 * 224 px higher. Measured on the deployed /simulator with the map turned on
 * from the micro menu the way a student turns it on:
 *
 *   iphone16-portrait   column [205,628,168×168]  ∩ drivetrain pad 17 112 px²
 *   iphone16-landscape  column [605,169,168×168]  ∩ drivetrain pad 20 500 px²
 *                                                 ∩ 3 mirror glances 3 950 px²
 *
 * ── N4 · THE CARD THAT TEACHES «M►» STOOD ON «M►» ───────────────────────────
 * Two fingers on the deployed /simulator through CDP: on small-landscape and
 * galaxy-gesturebar-landscape the gear-up cell answered «Скоростният лост е на
 * N» at its own centre and the pointerdown was delivered to that card, so
 * «Напреднал» could not be driven by thumb while the identical clutch plus a
 * keyboard «]» reached M1. The tap helper was bound at that cell the whole
 * time — the finger simply never arrived.
 * =============================================================================
 */

const SHELL = readFileSync(
  resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
  "utf8",
);
const STYLES = readFileSync(
  resolve(__dirname, "../../../../components/sim/lesson-ui/PlayAreaStyles.tsx"),
  "utf8",
);
const MINIMAP = readFileSync(resolve(__dirname, "../Minimap.tsx"), "utf8");

/** The six profiles doc 91 measures on, as {stage box} after the shell's p-2. */
const LADDER = [
  { id: "iphone16-portrait", width: 393 - 16, height: 852 - 16, insetBottom: 34 },
  { id: "iphone16-landscape", width: 852 - 16, height: 393 - 16, insetBottom: 21 },
  { id: "small-portrait", width: 360 - 16, height: 780 - 16, insetBottom: 0 },
  { id: "small-landscape", width: 780 - 16, height: 360 - 16, insetBottom: 0 },
  { id: "galaxy-gesturebar-portrait", width: 360 - 16, height: 780 - 16, insetBottom: 24 },
  { id: "galaxy-gesturebar-landscape", width: 780 - 16, height: 360 - 16, insetBottom: 24 },
];

/** The disc's own size, and the ceiling the shell's clamp keeps. */
const MINIMAP_DISC_PX = 168;

describe("I10 · the minimap column clears the thumb band", () => {
  it("hangs from TOUCH_CONTROLS_FLOOR on compact, not from the instrument floor", () => {
    // The exact expression, because the defect was a plausible-looking
    // `var(--sim-hud-floor, 6.75rem)` that had been correct for a HUD without
    // thumb controls in it and was never revisited when they arrived.
    expect(SHELL).toContain(
      'bottom: compact ? TOUCH_CONTROLS_FLOOR : "var(--sim-hud-floor, 6.75rem)",',
    );
    // …from the constant, not a copy of today's number. TouchControls is the
    // one file actively reshaping this band; a literal here would strand.
    //
    // Matched on the SYMBOL and its source, not on the whole import line: §I11
    // added a second thing the shell needs from the same file
    // (`touchControlsFloorCss`, the percentage-free rendering of this same
    // floor that a `max-height` can legally resolve), and an exact-line
    // assertion turns any future co-import into a red test about nothing. What
    // this row is defending is that the number comes from TouchControls.
    expect(SHELL).toMatch(/import \{[^}]*\bTOUCH_CONTROLS_FLOOR\b[^}]*\} from "\.\.\/TouchControls";/);
  });

  it("shrinks the disc to the corridor, because on a phone held sideways there is no 168 px hole", () => {
    expect(SHELL).toContain("displayHeightCss={");
    expect(SHELL).toContain(
      "`max(72px, min(168px, calc(100% - ${TOUCH_CONTROLS_FLOOR} - 1rem)))`",
    );
    // The component has to honour it as a HEIGHT with aspect-ratio doing the
    // width: a percentage on the width axis would resolve against the stage's
    // WIDTH (836 px in landscape) and the clamp would never bind.
    expect(MINIMAP).toContain("displayHeightCss?: string;");
    expect(MINIMAP).toContain('{ height: displayHeightCss, aspectRatio: "1 / 1" }');
  });

  it("the corridor arithmetic says the clamp is needed on every landscape profile and on no portrait one", () => {
    const corridor = (stage: (typeof LADDER)[number]) =>
      stage.height - touchControlsFloorPx(stage);
    const portrait = LADDER.filter((s) => s.height > s.width);
    const landscape = LADDER.filter((s) => s.height < s.width);

    // Portrait has room to spare — the disc keeps its full size there, so the
    // clamp must not be costing anything on the orientation that was fine.
    for (const stage of portrait) {
      expect(corridor(stage)).toBeGreaterThan(MINIMAP_DISC_PX);
    }
    // Landscape has none, on all three, which is why §I10's own fallback
    // („move to the left corridor") is not available either: that corridor is
    // 108 px tall and the demonstration deck already stands in it.
    for (const stage of landscape) {
      expect(corridor(stage)).toBeLessThan(MINIMAP_DISC_PX);
      // …and never so small that the student turns the map on and sees a dot.
      expect(corridor(stage)).toBeGreaterThan(72);
    }
    // The worst case in the ladder, stated as a number so a future change to
    // the pad, the arc's clamp or the gesture-bar inset moves this test and not
    // just the pixels: Samsung, sideways, 34.6 % of the Bulgarian market.
    // ⚠ 85 → 84 and 109 → 108 on 2026-08-13, and the 1 px is the whole of
    // defect 1. The drive pad was `min(44 % of the stage, 152px)`, and on a
    // 344 px landscape stage 44 % is 151.36 — so the pad was 0.64 px SHORT of
    // its cap, i.e. still on the sloping part of the expression, i.e. still
    // changing size as Safari's URL bar moved. It is a flat 152 px now, which
    // is what the cap already produced everywhere else, and the corridor loses
    // the 0.64 px the shrinking used to give it back.
    const galaxy = LADDER.find((s) => s.id === "galaxy-gesturebar-landscape")!;
    expect(Math.round(corridor(galaxy))).toBe(84);
    // …and the whole ladder, so a change to the pad, the gap or the inset has
    // to come past a number rather than past a screenshot.
    expect(LADDER.map((s) => `${s.id}=${Math.round(corridor(s))}`)).toEqual([
      "iphone16-portrait=454",
      "iphone16-landscape=120",
      "small-portrait=416",
      "small-landscape=108",
      "galaxy-gesturebar-portrait=392",
      "galaxy-gesturebar-landscape=84",
    ]);
    // The arc is at its floor on every landscape stage and at its ceiling on
    // every portrait one — the reason the two orientations differ this much.
    // As of 2026-08-13 those are the only two values it has: the clamp against
    // the live stage height was defect 1 (§N1), and it is an orientation now.
    expect(arcRisePx(galaxy)).toBe(20);
    expect(arcRisePx({ width: 393, height: 836 })).toBe(132);
  });
});

describe("N4 · the open ⚙ sheet outranks the notification column", () => {
  it("raises the touch-control root while the sheet is open, and only then", () => {
    expect(STYLES).toContain(
      'html[data-sim-car-sheet="open"] [data-hud="touch-controls"] {',
    );
    const rule = STYLES.slice(
      STYLES.indexOf('html[data-sim-car-sheet="open"] [data-hud="touch-controls"] {'),
    ).slice(0, 120);
    expect(rule).toContain("z-index: 40;");
  });

  it("40 actually beats the column, which is the only reason the rule works", () => {
    // The column is `z-30` in the shell. If that ever changes, this rule
    // silently stops doing anything and «M►» goes back under the card that
    // teaches it — which is exactly how N4 survived four waves.
    expect(SHELL).toContain('data-hud="notify-column"');
    const column = SHELL.slice(SHELL.indexOf('data-hud="notify-column"')).slice(0, 260);
    expect(column).toContain("z-30");
    expect(40).toBeGreaterThan(30);
  });

  it("does not hide the card — a teaching line moves or yields rank, it does not disappear", () => {
    // The touch HINT is allowed `display: none` under the same selector (it is
    // an unread sentence, not a running explanation). The notification column
    // is not, and this pins the difference so the next edit cannot quietly
    // promote one rule into the other.
    expect(STYLES).toContain('html[data-sim-car-sheet="open"] [data-hud="touch-hint"] {');
    const afterColumnRule = STYLES.slice(
      STYLES.indexOf('html[data-sim-car-sheet="open"] [data-hud="touch-controls"] {'),
    ).slice(0, 200);
    expect(afterColumnRule).not.toContain("display: none");
    expect(STYLES).not.toContain(
      'html[data-sim-car-sheet="open"] [data-hud="notify-column"] {\n        display: none;',
    );
  });
});
