import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  HAZARD_BAND_TOP_FRACTION,
  NOTIFY_COLUMN_GUTTER_PX,
  PEEK_SCRIM_FEATHER_PX,
  notifyColumnWidthPx,
} from "@/modules/sim/hud";
import {
  MIRROR_BAND_LEFT_FRACTION,
  NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
  notifyColumnMaxHeightCss,
  notifyColumnTopPx,
} from "@/modules/sim/hud/notifyColumn";
import { hotspotScreenRect } from "@/modules/sim/scene/vitok/cabinLook";
import {
  FLANK_LANE_PX,
  TOP_RAIL_ROW_CSS,
  TOP_RAIL_TOP_CSS,
  TOUCH_HINT_LANDSCAPE_LEFT_CSS,
  TOUCH_HINT_LANDSCAPE_TOP_CSS,
  PLAY_MENU_LEFT_CSS,
  arcStationRectPx,
  padRectPx,
  playMenuRectPx,
  touchHintLandscapeFloorCss,
  touchHintLandscapeRectPx,
} from "../../TouchControls";
import { PlayAreaStyles } from "../PlayAreaStyles";

/**
 * «RE-ANCHOR THE MIRROR — AND MOVE THE NOTIFICATION CARD» — founder ruling
 * 2026-09-22 (follow-up), row `sc-mw-emergency-lane:3ffb0692`.
 *
 * Re-anchoring the phone mirror brings it DOWN, and the right-edge corridor
 * hangs under the mirror («the HUD moves, not the mirror», B74/B76). The one
 * tenant of that corridor that could not afford the step was the first-run
 * touch hint: it CLIPS what it cannot hold (a `pointer-events-none` box whose
 * words no thumb can scroll back), it needs 124.5 px (measured off
 * `03-ready.png` at dpr 3, the same figure `mirror-lane-corridor.test.ts`
 * holds), and under the lowered mirror the right corridor holds 118.5 px on the
 * founder's own handset. The ruling: move the card on wide phones so it neither
 * covers road nor clips.
 *
 * WHERE IT WENT: the LEFT corridor the founder drew on 2026-08-03, under the
 * «Меню · Изглед · Пауза» rail, on the rail's own left edge. That corridor is
 * EMPTY while the hint is up — the rank ladder in `PlayAreaStyles` hides the
 * demonstration deck, the audio card and the three chips whenever the hint is
 * on the glass, and hides the hint whenever the overlay speaks — and it is
 * nowhere near the interior mirror, so no station drop can ever reach it.
 *
 * This file holds the geometry through the SAME resolvers the stylesheet is
 * generated from (`TouchControls`), on the three sideways stages the ladder
 * serves, and holds that the stylesheet really writes it.
 */

const PHONES = [
  { id: "iphone16 852×393", width: 852, height: 393, insetBottom: 21, insetLeft: 59, insetRight: 59 },
  { id: "android 780×360", width: 780, height: 360, insetBottom: 0 },
  { id: "samsung gesture 780×340", width: 780, height: 340, insetBottom: 0 },
];
/** The card as measured on the catalogue's frames (see the header). */
const TOUCH_HINT_CARD_PX = 124.5;
/** The peek card's own chrome — hud-off-the-road.test.ts derives it from
 *  SimOverlay's class names; the column can never paint shorter than this. */
const PEEK_CARD_CHROME_PX = 106;

describe("the hint's sideways corridor, resolved", () => {
  it("holds the whole card on the two stages the row names, and scrolls less than before on the third", () => {
    const [iphone, android, samsung] = PHONES.map((p) => touchHintLandscapeRectPx(p));
    expect(iphone.maxHeight).toBeGreaterThanOrEqual(TOUCH_HINT_CARD_PX);
    expect(android.maxHeight).toBeGreaterThanOrEqual(TOUCH_HINT_CARD_PX);
    // The right corridor made it scroll 20.9 px here BEFORE the mirror moved;
    // the left one leaves ~4.3. Pinned so it cannot grow quietly.
    expect(TOUCH_HINT_CARD_PX - samsung.maxHeight).toBeLessThan(5);
  });

  it("never enters the hazard band — the ceiling is the band itself", () => {
    for (const p of PHONES) {
      const r = touchHintLandscapeRectPx(p);
      expect((r.y + r.maxHeight) / p.height, p.id).toBeLessThanOrEqual(HAZARD_BAND_TOP_FRACTION + 1e-9);
    }
  });

  it("keeps the text measure it was measured at (180 px), so 124.5 still describes it", () => {
    for (const p of PHONES) {
      const r = touchHintLandscapeRectPx(p);
      expect(r.width, p.id).toBe(notifyColumnWidthPx(p.width, true) - FLANK_LANE_PX);
      expect(r.width, p.id).toBe(180);
    }
  });

  it("stands on the rail's left edge and below the rail's row", () => {
    for (const p of PHONES) {
      const r = touchHintLandscapeRectPx(p);
      const menu = playMenuRectPx(p);
      expect(r.boxLeft, p.id).toBe(menu.x);
      expect(r.x, p.id).toBe(menu.x + PEEK_SCRIM_FEATHER_PX.left);
      expect(r.y, p.id).toBeGreaterThanOrEqual(menu.y + menu.h);
    }
  });

  it("touches no control: not the left flank's stations, not the steering pad", () => {
    for (const p of PHONES) {
      const r = touchHintLandscapeRectPx(p);
      for (let i = 0; i < 4; i++) {
        const st = arcStationRectPx(i, "left", p);
        expect(r.boxLeft, `${p.id} station ${i}`).toBeGreaterThanOrEqual(st.x + st.w);
      }
      const pad = padRectPx("left", p);
      expect(r.boxBottom, p.id).toBeLessThanOrEqual(pad.y);
    }
  });

  it("on a SHORT stage the steering pad, not the band, is the floor — and it is honoured", () => {
    // On the ladder the band always binds (the pad top is ~30 px below it), so
    // the pad term is only visible on a short sideways stage: 700 × 260 puts the
    // pad's top at y 124, under the band's 137.8.
    const short = { width: 700, height: 260 };
    const r = touchHintLandscapeRectPx(short);
    const pad = padRectPx("left", short);
    expect(pad.y).toBeLessThan(short.height * HAZARD_BAND_TOP_FRACTION);
    expect(r.boxBottom).toBeLessThanOrEqual(pad.y);
    expect(r.maxHeight).toBeLessThan(short.height * HAZARD_BAND_TOP_FRACTION - r.y);
  });

  it("is nowhere near the interior mirror at ANY station drop — x-disjoint from its band", () => {
    for (const p of PHONES) {
      const r = touchHintLandscapeRectPx(p);
      expect(r.boxRight, p.id).toBeLessThan(p.width * MIRROR_BAND_LEFT_FRACTION);
      // …and the projection agrees with the published band edge at the shipped drop.
      const mirror = hotspotScreenRect("hotspot_mirror_rear", "forward", p.width / p.height)!;
      expect(r.boxRight, p.id).toBeLessThan(mirror.left * p.width);
    }
  });

  it("does not reach the middle of the picture — the vanishing point is road", () => {
    for (const p of PHONES) {
      expect(touchHintLandscapeRectPx(p).boxRight / p.width, p.id).toBeLessThan(0.45);
    }
  });

  it("clears the left door mirror, the other instrument in this corridor", () => {
    for (const p of PHONES) {
      const r = touchHintLandscapeRectPx(p);
      const door = hotspotScreenRect("hotspot_mirror_left", "forward", p.width / p.height)!;
      expect(r.boxBottom, p.id).toBeLessThan(door.top * p.height);
    }
  });
});

describe("the right corridor's column under the LOWERED mirror", () => {
  it("does not intersect the mirror's projected box at the shipped drop", () => {
    for (const p of PHONES) {
      const mirror = hotspotScreenRect("hotspot_mirror_rear", "forward", p.width / p.height)!;
      const top = notifyColumnTopPx(p, true);
      expect(top, p.id).toBeGreaterThanOrEqual(mirror.bottom * p.height);
      // …and the column really is under the mirror's x band, i.e. the y test is
      // the one that matters (a column moved out of the band would pass above
      // without saying so).
      const colRight = p.width - NOTIFY_COLUMN_GUTTER_PX - (p.insetRight ?? 0) - FLANK_LANE_PX;
      expect(colRight, p.id).toBeGreaterThan(mirror.left * p.width);
    }
  });

  it("still keeps the peek's shortest card out of the hazard band — it does not cover road", () => {
    for (const p of PHONES) {
      const top = notifyColumnTopPx(p, true);
      expect((top + PEEK_CARD_CHROME_PX) / p.height, p.id).toBeLessThan(HAZARD_BAND_TOP_FRACTION);
    }
  });
});

describe("the stylesheet writes it", () => {
  const nl = (s: string): string => s.replace(/\r\n/g, "\n");
  const SRC = nl(readFileSync(join(__dirname, "..", "PlayAreaStyles.tsx"), "utf8"));
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /** The landscape block that moves the hint, and the unconditional rule it overrides. */
  const HEAD = '[data-sim-compact="on"] [data-hud="touch-hint"] {';
  /** Every `@media (orientation: landscape) { … }` block, whole. `${…}`
   *  interpolations are balanced, so plain depth counting finds the close. */
  const landscapeBlocks = (): string[] =>
    [...CODE.matchAll(/@media \(orientation: landscape\) \{/g)].map((m) => {
      const open = m.index! + m[0].length - 1;
      let depth = 0;
      for (let j = open; j < CODE.length; j++) {
        if (CODE[j] === "{") depth++;
        else if (CODE[j] === "}" && --depth === 0) return CODE.slice(m.index!, j + 1);
      }
      return CODE.slice(m.index!);
    });
  /** The rule inside one of them that names the hint — its declarations only,
   *  up to the rule's own close (a line holding just `}` at rule indent). */
  const landscapeRule = (): string => {
    for (const block of landscapeBlocks()) {
      const i = block.indexOf(HEAD);
      if (i < 0) continue;
      const rest = block.slice(i);
      const end = rest.search(/\n\s*\}\s*\n/);
      return end < 0 ? rest : rest.slice(0, end);
    }
    return "";
  };

  it("has a sideways rule for the hint, and it comes AFTER the unconditional one (cascade order)", () => {
    const rule = landscapeRule();
    expect(rule, "no @media (orientation: landscape) rule moves the touch hint").not.toBe("");
    const base = CODE.indexOf(HEAD);
    const media = CODE.indexOf(rule);
    expect(base).toBeGreaterThanOrEqual(0);
    expect(media).toBeGreaterThan(base);
  });

  it("places it from the TouchControls lengths, not typed numbers", () => {
    const rule = landscapeRule();
    expect(rule).toContain("top: ${TOUCH_HINT_LANDSCAPE_TOP_CSS};");
    expect(rule).toContain("left: ${TOUCH_HINT_LANDSCAPE_LEFT_CSS};");
    expect(rule).toContain("right: auto;");
    expect(rule).toContain("width: calc(${NOTIFY_COLUMN_WIDTH_CSS_COMPACT} - ${FLANK_LANE_VAR});");
    expect(rule).toContain("align-items: flex-start;");
    expect(rule).toContain("text-align: left;");
    // The ceiling is measured from the SAME top the card is placed at, against
    // the LEFT floor — the half-landed swap `mirror-lane-corridor.test.ts`
    // records is the failure this pins.
    const ceiling = rule.slice(rule.indexOf("max-height:"));
    expect(ceiling).toContain("touchHintLandscapeFloorCss()");
    expect(ceiling).toContain("TOUCH_HINT_LANDSCAPE_TOP_CSS");
    expect(ceiling).toContain("HAZARD_BAND_TOP_FRACTION");
    expect(ceiling).not.toContain("NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN");
  });

  it("the lengths are the rail's own: its top plus its row, and its left edge", () => {
    expect(TOUCH_HINT_LANDSCAPE_TOP_CSS).toBe(`calc(${TOP_RAIL_TOP_CSS} + ${TOP_RAIL_ROW_CSS})`);
    expect(TOUCH_HINT_LANDSCAPE_LEFT_CSS).toBe(PLAY_MENU_LEFT_CSS);
    // …and the generated ceiling is the band-bounded one, from that top.
    const css = notifyColumnMaxHeightCss(
      touchHintLandscapeFloorCss(),
      TOUCH_HINT_LANDSCAPE_TOP_CSS,
      HAZARD_BAND_TOP_FRACTION,
    );
    expect(css).toContain(`${HAZARD_BAND_TOP_FRACTION * 100}%`);
    expect(css).toContain("--sim-pad-steer-h");
    expect(css).not.toContain(NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN);
  });
});

/**
 * THE CORRIDOR IS EMPTY ONLY BECAUSE THE RANK LADDER SAYS SO — pinned on the
 * RENDERED stylesheet (round-2 verification, F3).
 *
 * The hint's sideways box (x 127–345, y 60–224 CSS on 852 × 393) sits squarely
 * on the collapsed «🎬 Демонстрация ▸» deck toggle (≈ x 124–257, y 110–137 on
 * the w61 04-t094s frame). The two never paint together for one reason only:
 * `[data-sim-compact="on"]:has([data-hud="touch-hint"]) [data-hud="demo-deck"]
 * { display: none }`. Deleting that rule left 278 tests green; this block is
 * what turns it red. It reads the stylesheet PlayAreaStyles really renders —
 * every `${…}` resolved — not its source.
 */
describe("the left corridor is empty while the hint is up — the rank ladder, pinned", () => {
  const el = PlayAreaStyles() as ReactElement<{ children: string }>;
  const CSS = el.props.children.replace(/\/\*[\s\S]*?\*\//g, "");

  interface Rule {
    selectors: string[];
    body: string;
    /** The at-rule preludes this rule is nested in (outermost first). */
    context: string[];
  }
  /** Every style rule in the sheet, with the at-rules that condition it. */
  const rules: Rule[] = (() => {
    const out: Rule[] = [];
    const walk = (src: string, context: string[]) => {
      let i = 0;
      while (i < src.length) {
        const open = src.indexOf("{", i);
        if (open < 0) return;
        const prelude = src.slice(i, open).trim();
        let depth = 0;
        let close = open;
        for (; close < src.length; close++) {
          if (src[close] === "{") depth++;
          else if (src[close] === "}" && --depth === 0) break;
        }
        const inner = src.slice(open + 1, close);
        if (prelude.startsWith("@")) walk(inner, [...context, prelude]);
        else
          out.push({
            selectors: prelude.split(",").map((x) => x.replace(/\s+/g, " ").trim()),
            body: inner,
            context,
          });
        i = close + 1;
      }
    };
    walk(CSS, []);
    return out;
  })();

  const displayOf = (body: string): string | null => {
    const m = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(body);
    return m ? m[1].trim() : null;
  };
  /** The unconditional (no @media / @supports) rule that hides `target` under `when`. */
  const standDown = (when: string, target: string): Rule | undefined =>
    rules.find(
      (r) =>
        r.context.length === 0 &&
        r.selectors.includes(`${when} [data-hud="${target}"]`) &&
        displayOf(r.body) === "none",
    );
  /** Every rule that could set `display` on `target` (its last compound names it). */
  const displayRulesFor = (target: string) =>
    rules.filter(
      (r) =>
        displayOf(r.body) !== null &&
        r.selectors.some((sel) => /\S+$/.exec(sel)![0].includes(`[data-hud="${target}"]`)),
    );

  it("the stylesheet parses into its rules (the reader can see what it pins)", () => {
    // Every `{` is either an at-rule or a style rule, and every style rule was read.
    const opens = (CSS.match(/\{/g) ?? []).length;
    const atRules = (CSS.match(/@[^{};]+\{/g) ?? []).length;
    expect(rules.length).toBe(opens - atRules);
    expect(rules.length).toBeGreaterThan(50);
    expect(CSS).not.toContain("${");
  });

  it("the demonstration deck stands down while the hint is on the glass — unconditionally", () => {
    const rule = standDown('[data-sim-compact="on"]:has([data-hud="touch-hint"])', "demo-deck");
    expect(rule, "no unconditional :has(touch-hint) → demo-deck { display: none }").toBeDefined();
  });

  it("…and nothing in the sheet can show it again: every display rule on the deck is `none`, none !important", () => {
    const onDeck = displayRulesFor("demo-deck");
    expect(onDeck.length).toBeGreaterThan(0);
    for (const r of onDeck) {
      expect(displayOf(r.body), r.selectors.join(", ")).toBe("none");
    }
    expect(CSS).not.toMatch(/display\s*:[^;]*!important/);
  });

  it("…and the deck's own element carries no inline display to outrank it (its `flex` is a class, 0-1-0 < 0-3-0)", () => {
    const scene = readFileSync(join(__dirname, "..", "..", "LessonScene.tsx"), "utf8").replace(/\r\n/g, "\n");
    const at = scene.indexOf('      data-hud="demo-deck"\n');
    expect(at).toBeGreaterThan(0);
    const tag = scene.slice(at, scene.indexOf(">", at));
    expect(tag).not.toMatch(/style=/);
    expect(tag).toMatch(/className="[^"]*\bflex\b/);
  });

  it("the audio card stands down for the hint too, and the hint for the speaking overlay", () => {
    expect(standDown('[data-sim-compact="on"]:has([data-hud="touch-hint"])', "audio-prompt")).toBeDefined();
    expect(standDown('[data-sim-compact="on"][data-sim-overlay-active="on"]', "touch-hint")).toBeDefined();
  });

  it("the «Меню» rail the hint stands under really is on PLAY_MENU_LEFT_CSS", () => {
    const shell = readFileSync(join(__dirname, "..", "LessonPlayShell.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(shell).toContain("        left: PLAY_MENU_LEFT_CSS,\n        top: PLAY_MENU_TOP_CSS,");
  });
});
