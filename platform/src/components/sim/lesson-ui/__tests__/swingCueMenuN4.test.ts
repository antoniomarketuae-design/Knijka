/**
 * N4 — «МЕНЮ НА УРОКА» OPEN WITH THE SWING CUE UP AND A YIELDING ROW ACTIVE.
 * sc-ac-crosswind:a9db1738 clause 4 (phone half), lane «swingcue», integrator
 * rulings R-SC1 (A) and SC-C (2026-11-09, N4 RECORDED).
 *
 * The lane's census (swingCueYield.test.tsx, T3) left this state out. The menu
 * does NOT silence the queue (LessonPlayShell `pauseModalUp` reads only the quiz
 * and the consequence card; `playMenuOpen` pauses the car, not the rows), so a
 * task standby stays the active row while the sheet is open. PlayAreaStyles
 * stands the follow chip and the demo deck down under the open menu
 * (sc-ed-reverse-line:d6fb0f3c); it does not name the cue.
 *
 * WHAT IS PINNED (the verifier's reading, executed):
 *   base — the cue is hidden and the peek column is visible;
 *   tree — the cue is drawn in the column's own box (same top) and the column
 *          yields by visibility, so the open menu still has exactly ONE of the
 *          two on the glass: nothing new is stacked.
 * The row itself closes only on the W3Z-3 device drive; this file does not
 * close it, it makes any change to the arbitration deliberate.
 */
import { describe, expect, it } from "vitest";
import { FLANK_LANE_PX } from "../../TouchControls";
import { el, painted, resolveLengthPx, winnerFor, type CssRule, type El, type Env } from "./cssCascadeEvaluator";
import { baseRules, buildCell, ITEMS, treeRules, type CellInput, type Side } from "./swingCueCensus";

interface Profile {
  id: string;
  w: number;
  h: number;
  insetTop: number;
  insetRight: number;
}
const LAND: Profile = { id: "iphone16-landscape", w: 852, h: 393, insetTop: 0, insetRight: 59 };
const PORT: Profile = { id: "iphone16-portrait", w: 393, h: 852, insetTop: 59, insetRight: 0 };
const envOf = (p: Profile): Env => ({
  orientation: p.w > p.h ? "landscape" : "portrait",
  widthPx: p.w,
  heightPx: p.h,
  reducedMotion: false,
});
const lengthEnv = (p: Profile) => ({
  cbHeightPx: p.h,
  safeTopPx: p.insetTop,
  safeRightPx: p.insetRight,
  viewportWidthPx: p.w,
  vars: { "--spacing": 4, "--sim-glance-h": 131, "--sim-mirror-h": 97, "--sim-flank-lane": p.w > p.h ? FLANK_LANE_PX : 0 },
});

const RULES: Record<Side, CssRule[]> = { base: baseRules(), tree: treeRules() };

const MENU_OPEN_STANDBY: CellInput = {
  compact: true,
  active: ITEMS.standby,
  shellSheetOpen: false,
  domSheetOpen: false,
  cue: true,
  touchHint: false,
  demoDeck: true,
  html: {},
};

/** The cell's DOM plus PlayMenu as it renders open (LessonPlayShell: data-hud="play-menu" › role="menu"). */
function menuCell(side: Side, menuOpen: boolean) {
  const dom = buildCell(MENU_OPEN_STANDBY, side);
  const stage = dom.root.children[0];
  const menu: El = el(
    "div",
    "play-menu",
    { "data-hud": "play-menu" },
    ["pointer-events-none", "absolute", "z-20", "flex", "flex-col", "items-start"],
    [],
    menuOpen ? [el("div", "menu-sheet", { role: "menu", "aria-label": "Меню на урока" })] : [],
  );
  menu.parent = stage;
  stage.children.push(menu);
  const deck = dom.witnesses.find((w) => w.attrs["data-hud"] === "demo-deck") ?? null;
  return { ...dom, deck };
}

function topPx(rules: CssRule[], e: El, p: Profile): number {
  const w = winnerFor(rules, e, "top", envOf(p));
  if (w.unresolved || w.value === null) throw new Error(`top unresolved on ${e.name}`);
  return resolveLengthPx(w.value, lengthEnv(p));
}

describe("N4 · the lesson menu open over the swing cue and a yielding row", () => {
  for (const p of [LAND, PORT]) {
    it(`the menu selector is live in this DOM (the deck stands down under it) · ${p.id}`, () => {
      for (const side of ["base", "tree"] as const) {
        const closed = menuCell(side, false);
        const open = menuCell(side, true);
        expect(closed.deck, "the demo deck witness is mounted").not.toBeNull();
        expect(painted(RULES[side], closed.deck as El, envOf(p)).visibility, `${side}: deck with the menu closed`).toBe("visible");
        expect(painted(RULES[side], open.deck as El, envOf(p)).visibility, `${side}: deck under the open menu`).toBe("hidden");
      }
    });

    it(`base: cue hidden, column visible · ${p.id}`, () => {
      const d = menuCell("base", true);
      const cue = painted(RULES.base, d.cue as El, envOf(p));
      const col = painted(RULES.base, d.peek as El, envOf(p));
      expect([...cue.unresolved, ...col.unresolved], "base: the evaluator could not decide").toEqual([]);
      expect({ cue: cue.drawn, column: col.drawn }, "N4 base under the open menu (cue drawn, column visible)").toEqual({ cue: false, column: true });
    });

    it(`tree: the cue is drawn in the column's box and the column yields — nothing new stacked · ${p.id}`, () => {
      const d = menuCell("tree", true);
      const cue = painted(RULES.tree, d.cue as El, envOf(p));
      const col = painted(RULES.tree, d.peek as El, envOf(p));
      expect([...cue.unresolved, ...col.unresolved], "tree: the evaluator could not decide").toEqual([]);
      expect({ cue: cue.drawn, column: col.drawn }, "N4 tree under the open menu (cue drawn, column visible)").toEqual({ cue: true, column: false });
      expect(col.displayNone, "the column yields by visibility, never display:none").toBe(false);
      expect(cue.drawn && col.drawn, "N4: the cue and the column are never both on the glass under the menu").toBe(false);
      const dTop = Math.abs(topPx(RULES.tree, d.cue as El, p) - topPx(RULES.tree, d.peek as El, p));
      expect(dTop, "N4: |cue top − column top| px under the open menu").toBeLessThan(0.01);
    });
  }
});
