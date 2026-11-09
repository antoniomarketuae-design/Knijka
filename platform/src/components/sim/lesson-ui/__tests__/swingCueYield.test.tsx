/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PHONE'S «ВТОРИ ЗАМАХ» CUE IS DRAWN IN THE ROW'S PLACE —
 * sc-ac-crosswind:a9db1738 clause 4 (the phone half), lane «swingcue»,
 * integrator rulings W3Z-2 (3) and R-SC1 (A), 2026-11-06.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE DEFECT (rig-w3z, PE-1 and PE-2, iPhone 16 landscape 852 × 393): the cue
 * MOUNTED for the named act and read «(hidden)», no client rects, for its whole
 * life (26.08 → 30.35 on the rig clock); the push chip was removed one frame
 * after the mount. PlayAreaStyles stood the cue down whenever the shell's
 * overlay row held the slot (`[data-sim-overlay-active="on"]`), and while
 * driving the W8 task standby holds it almost continuously. So the phone student
 * saw the gust chip vanish with NOTHING in its place — the swing's only
 * explanation on the glass (THEO-4), which the briefing promises.
 *
 * WHAT THIS FILE PROVES, all of it over the RENDERED stylesheets of base (the
 * 1feba3a fixture) and of the tree, through `cssCascadeEvaluator`:
 *   T2  the shell decision and its call site's argument list (O54/O51 shape);
 *   T3  the census: every compact state in which the cue can mount, landscape
 *       and portrait, base → tree, plus the yield rule's self-sufficiency;
 *   T4  every rule without [data-sim-compact="on"] is byte-identical (the PC);
 *   T5  every protected rule is byte-identical and the new rules are exactly six;
 *   T6  no yielding kind is produced blocking or sheet-only (shell side);
 *   T7  the drawn cue's top IS the column's top in every camera / glance state;
 *   T8  the drawn cue ends above HAZARD_BAND_TOP_FRACTION on six phone profiles;
 *   and the side effects (a)–(f) the brief names.
 * T1 (the predicate) and the hud half of T6 are in
 * modules/sim/hud/__tests__/swing-cue-yield.test.ts.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  NOTIFY_COLUMN_TOP_CSS_COMPACT,
  overlayYieldsToSwingCue,
  type SimOverlayItem,
} from "@/modules/sim/hud";
import {
  HAZARD_BAND_TOP_FRACTION,
  MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE,
  NOTIFY_COLUMN_MAX_STAGE_FRACTION,
  NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
  notifyColumnMirrorLanePx,
  notifyColumnWidthPx,
} from "@/modules/sim/hud/notifyColumn";
import { FLANK_LANE_PX } from "../../TouchControls";
import { compileScenario, type ScenarioCompileOptions } from "@/modules/sim/lessons/scenario/compile";
import { SCENARIO_TEMPLATES_CONDITIONS } from "@/modules/sim/lessons/scenario/templates-conditions";
import { SCENARIO_TEMPLATES_CONDITIONS2 } from "@/modules/sim/lessons/scenario/templates-conditions2";
import {
  advisorOverlayRow,
  advisorTaskRows,
  swingCueYieldAttr,
  taskOverlayRow,
  type AdvisorTaskRowsInput,
} from "../LessonPlayShell";
import { callSitesOf, jsxPropsOf } from "./callSiteShape";
import {
  matches,
  matchSet,
  painted,
  parseSheets,
  resolveLengthPx,
  winnerFor,
  type CssRule,
  type El,
  type Env,
} from "./cssCascadeEvaluator";
import {
  baseRules,
  buildCell,
  ITEMS,
  renderedTreeSheets,
  TAILWIND_UTILITIES,
  treeRules,
  type CellInput,
  type Side,
} from "./swingCueCensus";
import {
  BASE_PLAY_AREA_CSS,
  BASE_SIM_OVERLAY_CSS,
} from "./swingCueYield.base.fixture";

const nl = (s: string) => s.replace(/\r\n/g, "\n");
const SHELL = nl(readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8"));
const SCENE = nl(readFileSync(resolve(__dirname, "../../LessonScene.tsx"), "utf8"));

/** The suite's console is quiet; set SWINGCUE_REPORT=<file> to collect the printed census and bounds. */
const report = (s: string): void => {
  console.log(s);
  const out = process.env.SWINGCUE_REPORT;
  if (out) appendFileSync(out, `${s}\n`);
};

const BASE = baseRules();
const TREE = treeRules();
const rulesOf = (side: Side): CssRule[] => (side === "base" ? BASE : TREE);

/** The six rules this lane adds, by their exact rendered selector lists. */
const NARROWED_CUE_SELECTOR =
  '[data-sim-compact="on"][data-sim-overlay-active="on"]:not([data-sim-overlay-yields="on"]) [data-hud="wind-swing-cue"]';
const BASE_CUE_SELECTOR = '[data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="wind-swing-cue"]';
const NEW_SELECTOR_LISTS: readonly string[] = [
  '[data-sim-compact="on"][data-sim-overlay-active="on"]:has([data-hud="overlay-read"]) [data-hud="wind-swing-cue"]',
  '[data-sim-compact="on"][data-sim-overlay-yields="on"]:has([data-hud="wind-swing-cue"]):not(:has([data-hud="touch-hint"])):not(:has([data-hud="overlay-read"])) [data-hud="notify-column"]',
  '[data-sim-compact="on"] [data-hud="wind-swing-cue"]',
  'html[data-sim-camera="chase"] [data-sim-compact="on"] [data-hud="wind-swing-cue"]',
  'html[data-sim-glance="rear"] [data-sim-compact="on"] [data-hud="wind-swing-cue"], html[data-sim-glance="right"] [data-sim-compact="on"] [data-hud="wind-swing-cue"]',
  'html[data-sim-car-sheet="open"] [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="wind-swing-cue"]',
];
const YIELD_RULE_SELECTOR = NEW_SELECTOR_LISTS[1];

/* ─────────────────────────────── profiles ───────────────────────────────── */

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
/** Two arbitrary, distinct lengths: a top that ignored either would not tie. */
const GLANCE_H = 131;
const MIRROR_H = 97;
const lengthEnv = (p: Profile) => ({
  cbHeightPx: p.h,
  safeTopPx: p.insetTop,
  safeRightPx: p.insetRight,
  viewportWidthPx: p.w,
  vars: {
    "--spacing": 4,
    "--sim-glance-h": GLANCE_H,
    "--sim-mirror-h": MIRROR_H,
    "--sim-flank-lane": p.w > p.h ? FLANK_LANE_PX : 0,
  },
});

/* ─────────────────────────────── the census ─────────────────────────────── */

const DRIVING: Omit<CellInput, "active"> = {
  compact: true,
  shellSheetOpen: false,
  domSheetOpen: false,
  cue: true,
  touchHint: false,
  audioPrompt: true,
  telltalePings: true,
  demoDeck: true,
  html: {},
};

interface Cell {
  id: string;
  input: CellInput;
  /** Expected on the TREE: is the cue drawn? is the peek column visible (null = not mounted)? */
  tree: { cue: boolean; column: boolean | null };
  /** Expected on BASE. */
  base: { cue: boolean; column: boolean | null };
  /** Only for one orientation. */
  only?: "landscape" | "portrait";
}

const yielding = (id: string, active: SimOverlayItem, extra: Partial<CellInput> = {}): Cell => ({
  id,
  input: { ...DRIVING, ...extra, active },
  tree: { cue: true, column: false },
  base: { cue: false, column: true },
});
const unchanged = (id: string, input: CellInput, both: { cue: boolean; column: boolean | null }): Cell => ({
  id,
  input,
  tree: both,
  base: both,
});

const CELLS: Cell[] = [
  unchanged("C0 overlay inactive (or the row ✕-dismissed)", { ...DRIVING, active: null }, { cue: true, column: null }),
  yielding("C1 task STANDBY", ITEMS.standby),
  yielding("C2 task ANNOUNCEMENT", ITEMS.announcement),
  yielding("C3 advisor (announce or heard)", ITEMS.advisor),
  yielding("C4 legend", ITEMS.legend),
  yielding("C5a praise flash (objective complete)", ITEMS.praiseFlash),
  yielding("C5b praise toast (commendation)", ITEMS.praiseToast),
  yielding("C6 pre-drive step", ITEMS.predrive),
  unchanged("C7a hint: world-edge", { ...DRIVING, active: ITEMS.worldEdge }, { cue: false, column: true }),
  unchanged("C7b hint: coached", { ...DRIVING, active: ITEMS.coachedHint }, { cue: false, column: true }),
  unchanged("C7c hint: blocking mistake demonstration", { ...DRIVING, active: ITEMS.mistakeDemo }, { cue: false, column: true }),
  unchanged(
    "C7d hint: sheet-only briefing (steady)",
    { ...DRIVING, active: ITEMS.briefing, domSheetOpen: true, shellSheetOpen: true, html: { overlayRead: true } },
    { cue: false, column: null },
  ),
  unchanged(
    "C7e hint: sheet-only briefing (its first commit, shell not yet told)",
    { ...DRIVING, active: ITEMS.briefing, domSheetOpen: true, shellSheetOpen: false },
    { cue: false, column: null },
  ),
  unchanged("C8 warning", { ...DRIVING, active: ITEMS.warning }, { cue: false, column: true }),
  unchanged("C9 violation", { ...DRIVING, active: ITEMS.violation }, { cue: false, column: true }),
  unchanged("C10 teach", { ...DRIVING, active: ITEMS.teach }, { cue: false, column: true }),
  unchanged("C11 end", { ...DRIVING, active: ITEMS.end }, { cue: false, column: true }),
  unchanged(
    "C12 read sheet open (steady)",
    { ...DRIVING, active: ITEMS.advisor, domSheetOpen: true, shellSheetOpen: true, html: { overlayRead: true } },
    { cue: false, column: null },
  ),
  unchanged(
    "C12a read sheet: its opening commit",
    { ...DRIVING, active: ITEMS.advisor, domSheetOpen: true, shellSheetOpen: false },
    { cue: false, column: null },
  ),
  unchanged(
    "C12b read sheet: its closing commit",
    { ...DRIVING, active: ITEMS.advisor, domSheetOpen: false, shellSheetOpen: true, html: { overlayRead: true } },
    { cue: false, column: true },
  ),
  unchanged("C13 touch hint, no row", { ...DRIVING, active: null, touchHint: true }, { cue: false, column: null }),
  unchanged("C13b touch hint + a yielding row", { ...DRIVING, active: ITEMS.standby, touchHint: true }, { cue: false, column: true }),
  unchanged("C14 pause modal up (candidates [])", { ...DRIVING, active: null }, { cue: true, column: null }),
  yielding("C15a chase", ITEMS.standby, { html: { camera: "chase" } }),
  yielding("C15b rear glance", ITEMS.standby, { html: { glance: "rear" } }),
  yielding("C15c right glance", ITEMS.standby, { html: { glance: "right" } }),
  yielding("C15d chase + rear glance", ITEMS.standby, { html: { camera: "chase", glance: "rear" } }),
  yielding("C15e chase + left glance", ITEMS.standby, { html: { camera: "chase", glance: "left" } }),
  {
    id: "C16 landscape car sheet + a yielding row",
    input: { ...DRIVING, active: ITEMS.standby, html: { carSheet: true } },
    tree: { cue: false, column: false },
    base: { cue: false, column: false },
    only: "landscape",
  },
  yielding("C16a car sheet: its opening commit (html attribute not yet written)", ITEMS.standby),
  { ...yielding("C16p portrait car sheet + a yielding row", ITEMS.standby, { html: { carSheet: true } }), only: "portrait" },
  unchanged("C16c car sheet, no row", { ...DRIVING, active: null, html: { carSheet: true } }, { cue: true, column: null }),
  unchanged("C17 exam (the cue never mounts)", { ...DRIVING, active: ITEMS.standby, cue: false }, { cue: false, column: true }),
  unchanged(
    "C18 telltale (the cue never mounts)",
    { ...DRIVING, active: ITEMS.standby, cue: false, telltaleCue: true },
    { cue: false, column: true },
  ),
  unchanged("C19 follow chip up, no cue, standby", { ...DRIVING, active: ITEMS.standby, cue: false, followHint: true }, { cue: false, column: true }),
  // A row that would yield if it were not blocking / sheet-only. No producer
  // ships one (T6); the stylesheet holds anyway.
  unchanged("C20 hypothetical blocking task row", { ...DRIVING, active: ITEMS.blockingTask }, { cue: false, column: true }),
  unchanged("C21 hypothetical sheet-only praise", { ...DRIVING, active: ITEMS.sheetOnlyPraise, domSheetOpen: true, shellSheetOpen: true }, { cue: false, column: null }),
];

interface Reading {
  cueDrawn: boolean | null;
  columnVisible: boolean | null;
  cueTopPx: number | null;
  columnTopPx: number | null;
  unresolved: string[];
}

function read(cell: Cell, side: Side, p: Profile): Reading {
  const dom = buildCell(cell.input, side);
  const env = envOf(p);
  const rules = rulesOf(side);
  const unresolved: string[] = [];
  const topOf = (e: El): number | null => {
    const w = winnerFor(rules, e, "top", env);
    if (w.unresolved) unresolved.push(w.unresolved);
    return w.value === null ? null : resolveLengthPx(w.value, lengthEnv(p));
  };
  let cueDrawn: boolean | null = null;
  let cueTopPx: number | null = null;
  if (dom.cue) {
    const pc = painted(rules, dom.cue, env);
    unresolved.push(...pc.unresolved);
    cueDrawn = pc.drawn;
    cueTopPx = topOf(dom.cue);
  }
  let columnVisible: boolean | null = null;
  let columnTopPx: number | null = null;
  if (dom.peek) {
    const pp = painted(rules, dom.peek, env);
    unresolved.push(...pp.unresolved);
    // The column never leaves the layout by display (side effect (a)).
    expect(pp.displayNone, `${cell.id} ${side}: the column must never be display:none`).toBe(false);
    columnVisible = pp.drawn;
    columnTopPx = topOf(dom.peek);
  }
  return { cueDrawn, columnVisible, cueTopPx, columnTopPx, unresolved };
}

const orientationsOf = (c: Cell): Profile[] =>
  c.only === "landscape" ? [LAND] : c.only === "portrait" ? [PORT] : [LAND, PORT];

/** The column's resolved top in a state, computed from the column's own rules even where no peek is mounted. */
function columnTopIn(cell: Cell, side: Side, p: Profile): number {
  const dom = buildCell({ ...cell.input, active: ITEMS.standby, domSheetOpen: false }, side);
  if (!dom.peek) throw new Error("no peek to measure");
  const w = winnerFor(rulesOf(side), dom.peek, "top", envOf(p));
  if (w.unresolved || w.value === null) throw new Error(`column top unresolved in ${cell.id}`);
  return resolveLengthPx(w.value, lengthEnv(p));
}

describe("T3 · the census — every compact state the cue can mount in, base → tree", () => {
  for (const cell of CELLS) {
    for (const p of orientationsOf(cell)) {
      it(`${cell.id} · ${p.id}`, () => {
        for (const side of ["base", "tree"] as const) {
          const r = read(cell, side, p);
          expect(r.unresolved, `${cell.id} ${side}: the evaluator could not decide`).toEqual([]);
          const want = side === "tree" ? cell.tree : cell.base;
          expect({ cue: r.cueDrawn ?? false, column: r.columnVisible }, `${cell.id} ${side} (cue drawn, column visible)`).toEqual({
            cue: want.cue,
            column: want.column,
          });
        }
      });
    }
  }

  it("prints the census table (base → tree: cue drawn, cue top, column visible)", () => {
    const rows: string[] = [];
    for (const cell of CELLS)
      for (const p of orientationsOf(cell)) {
        const b = read(cell, "base", p);
        const t = read(cell, "tree", p);
        const f = (r: Reading) =>
          `cue ${r.cueDrawn === null ? "—" : r.cueDrawn ? "DRAWN" : "hidden"} top ${r.cueTopPx === null ? "—" : r.cueTopPx.toFixed(2)} · column ${r.columnVisible === null ? "—" : r.columnVisible ? "visible" : "yields"}`;
        rows.push(`${cell.id} [${p.w > p.h ? "L" : "P"}]  ${f(b)}  →  ${f(t)}`);
      }
    report(`[swingcue census]\n${rows.join("\n")}`);
    expect(rows.length).toBeGreaterThan(CELLS.length);
  });

  it("the yield rule is SELF-SUFFICIENT: wherever it matches, the cue is drawn or the column was already hidden by a base rule", () => {
    const withoutYield = TREE.filter((r) => r.selectorText.replace(/\s+/g, " ").trim() !== YIELD_RULE_SELECTOR);
    expect(withoutYield.length).toBe(TREE.length - 1);
    let matched = 0;
    const states: CellInput[] = [];
    // Every census input, plus every combination of the facts the rule reads.
    for (const c of CELLS) states.push(c.input);
    for (const active of Object.values(ITEMS) as SimOverlayItem[])
      for (const touchHint of [false, true])
        for (const domSheetOpen of [false, true])
          for (const shellSheetOpen of [false, true])
            for (const carSheet of [false, true])
              states.push({ ...DRIVING, active, touchHint, domSheetOpen, shellSheetOpen, html: { carSheet, overlayRead: domSheetOpen } });
    for (const input of states)
      for (const p of [LAND, PORT]) {
        const dom = buildCell(input, "tree");
        if (!dom.peek) continue;
        const env = envOf(p);
        if (matches(YIELD_RULE_SELECTOR, dom.peek) !== true) continue;
        matched++;
        const cueDrawn = dom.cue !== null && painted(TREE, dom.cue, env).drawn;
        const hiddenByBase = painted(withoutYield, dom.peek, env).visibility === "hidden";
        expect(cueDrawn || hiddenByBase, `${JSON.stringify(input.active?.kind)} ${p.id} th=${input.touchHint} car=${input.html.carSheet}`).toBe(true);
        // …and where the column was already hidden, it is the landscape car sheet, at the same value.
        if (!cueDrawn) {
          expect(input.html.carSheet && p === LAND, "the only base hide is the landscape car sheet").toBe(true);
        }
      }
    expect(matched, "the invariant must actually be exercised").toBeGreaterThan(20);
  });

  it("(f) the yield rule is inert on the roomy column: display:none on both sides", () => {
    for (const p of [LAND, PORT]) {
      for (const side of ["base", "tree"] as const) {
        const dom = buildCell({ ...DRIVING, active: ITEMS.standby }, side);
        const pr = painted(rulesOf(side), dom.roomyColumn, envOf(p));
        expect(pr.displayNone, `${side} ${p.id}`).toBe(true);
        expect(pr.drawn).toBe(false);
      }
    }
  });
});

/* ─────────────────────────────── T7 ─────────────────────────────────────── */

describe("T7 · the drawn cue stands on the column's own top, in every camera and glance state", () => {
  const states = CELLS.filter((c) => c.tree.cue);
  for (const cell of states)
    for (const p of orientationsOf(cell))
      it(`${cell.id} · ${p.id}`, () => {
        const t = read(cell, "tree", p);
        const want = columnTopIn(cell, "tree", p);
        expect(t.cueTopPx, `${cell.id}: cue top vs the column's resolved top`).not.toBeNull();
        expect(Math.abs((t.cueTopPx as number) - want), `${cell.id}: |cue top − column top| px`).toBeLessThan(0.01);
      });

  it("the camera / glance states actually move the column (else the equality above is trivial)", () => {
    const cockpit = columnTopIn(CELLS[1], "tree", LAND);
    const rear = columnTopIn({ ...CELLS[1], input: { ...CELLS[1].input, html: { glance: "rear" } } }, "tree", LAND);
    expect(rear).not.toBe(cockpit);
    // and base's cue stood on top-16 = 64 px, or the chase step — never on the column's top.
    const base = read(CELLS[0], "base", LAND);
    expect(base.cueTopPx).toBe(64);
    const baseChase = read({ ...CELLS[0], input: { ...CELLS[0].input, html: { camera: "chase" } } }, "base", LAND);
    expect(baseChase.cueTopPx).toBe(64 + MIRROR_H);
  });

  it("…and on a sideways phone that top clears the interior mirror's lane", () => {
    for (const p of [LAND, { id: "samsung-780x360", w: 780, h: 360, insetTop: 0, insetRight: 0 }, { id: "780x340", w: 780, h: 340, insetTop: 0, insetRight: 0 }, { id: "844x390", w: 844, h: 390, insetTop: 0, insetRight: 47 }]) {
      const t = read(CELLS[1], "tree", p);
      expect(t.cueTopPx as number, p.id).toBeGreaterThanOrEqual(notifyColumnMirrorLanePx({ width: p.w, height: p.h }, true) - 1e-9);
      // base drew it inside the mirror lane (band + gutter) where it was drawn at all (C0 / C14)
      const b = read(CELLS[0], "base", p);
      expect(b.cueTopPx as number).toBeLessThan(notifyColumnMirrorLanePx({ width: p.w, height: p.h }, true));
      expect(MIRROR_BAND_BOTTOM_FRACTION_COMPACT_LANDSCAPE).toBe(0.188);
    }
  });

  it("…and upright its x-span IS the column's (the flank lane is 0 there)", () => {
    const dom = buildCell({ ...DRIVING, active: ITEMS.standby }, "tree");
    const env = envOf(PORT);
    for (const prop of ["right", "width"]) {
      const cue = winnerFor(TREE, dom.cue as El, prop, env);
      const col = winnerFor(TREE, dom.peek as El, prop, env);
      expect(cue.unresolved).toBeNull();
      expect(resolveLengthPx(cue.value as string, lengthEnv(PORT))).toBeCloseTo(resolveLengthPx(col.value as string, lengthEnv(PORT)), 6);
    }
  });
});

/* ─────────────────────────────── T8 ─────────────────────────────────────── */

/**
 * THE HAZARD BOUND. Node cannot lay text out, so the plate's height is bounded
 * by arithmetic: the cue's sentence (read from LessonScene, so a text change
 * re-runs this) greedy-wrapped at its measured glyph advances into the text
 * box, at 16 px a line (text-xs) plus 14 px of plate (py-1.5 + 1 px borders).
 *
 * THE ADVANCES ARE MEASURED, not guessed: IBM Plex Sans (the app's --font-sans,
 * app/layout.tsx), wght 700 (font-bold), read from the two shipped woff2
 * subsets (.next/static/media 1bcd0e671759a44c… sha256 5bac7252…120a for
 * U+0400-045F, 03fc1b4a8d284b5e… sha256 056e4e24…9818 for U+0000-00FF and
 * U+2000-206F): hmtx default advances plus the HVAR deltas at wght = 700, in
 * units of 1/1000 em. Greedy wrapping is monotone in word width, so widening
 * every advance by MARGIN (kerning, rounding) can only add lines: the result is
 * an UPPER bound for any engine that wraps greedily at spaces (no hyphenation
 * or balancing is set on the plate).
 */
const ADVANCE_700: Record<string, number> = {
  В: 667, т: 492, о: 564, р: 608, и: 612, " ": 236, з: 531, а: 569, м: 726, х: 560, "!": 320,
  О: 714, п: 597, у: 534, с: 517, к: 591, й: 612, е: 562, ц: 633, я: 585, л: 611, в: 576,
  н: 612, "—": 780, д: 658, ъ: 639, ",": 310, б: 567, ".": 310,
};
const MARGIN = 1.05;
const FONT_PX = 12;
const LINE_PX = 16;
const PLATE_CHROME_PX = 6 + 6 + 1 + 1;
const TEXT_INSET_PX = 14 + 14 + 1 + 1;

const cueSentence = (): string => {
  const m = /data-hud="wind-swing-cue"[\s\S]*?<div className="[^"]*">([\s\S]*?)<\/div>/.exec(SCENE);
  if (!m) throw new Error("the cue's sentence was not found in LessonScene");
  return m[1].replace(/\s+/g, " ").trim();
};
const widthPx = (s: string): number =>
  [...s].reduce((a, ch) => {
    const adv = ADVANCE_700[ch];
    if (adv === undefined) throw new Error(`no measured advance for «${ch}» — re-measure the font`);
    return a + adv;
  }, 0) *
  (FONT_PX / 1000) *
  MARGIN;
function greedyLines(text: string, boxPx: number): number {
  let lines = 1;
  let cur = "";
  for (const w of text.split(" ")) {
    if (cur === "") cur = w;
    else if (widthPx(`${cur} ${w}`) <= boxPx) cur = `${cur} ${w}`;
    else {
      lines++;
      cur = w;
    }
  }
  return lines;
}

const HAZARD_PROFILES: Profile[] = [
  { id: "iPhone 16 landscape", w: 852, h: 393, insetTop: 0, insetRight: 59 },
  { id: "iPhone 14 landscape", w: 844, h: 390, insetTop: 0, insetRight: 47 },
  { id: "Samsung 780×360", w: 780, h: 360, insetTop: 0, insetRight: 0 },
  { id: "Samsung 780×340", w: 780, h: 340, insetTop: 0, insetRight: 0 },
  { id: "iPhone 16 portrait", w: 393, h: 852, insetTop: 59, insetRight: 0 },
  { id: "Samsung 360×780", w: 360, h: 780, insetTop: 0, insetRight: 0 },
];

describe("T8 · the drawn cue ends above the hazard band on every phone profile", () => {
  it("the sentence is the shipped one, and every glyph has a measured advance", () => {
    const s = cueSentence();
    expect(s.startsWith("Втори замах! Отпускай корекцията плавно")).toBe(true);
    expect(() => widthPx(s)).not.toThrow();
  });

  for (const p of HAZARD_PROFILES)
    it(p.id, () => {
      const landscape = p.w > p.h;
      const box = notifyColumnWidthPx(p.w, true) - (landscape ? FLANK_LANE_PX : 0);
      const lines = greedyLines(cueSentence(), box - TEXT_INSET_PX);
      const top = read(CELLS[1], "tree", p).cueTopPx as number;
      expect(top).toBeCloseTo(resolveLengthPx(NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN, lengthEnv(p)), 6);
      const bottom = top + lines * LINE_PX + PLATE_CHROME_PX;
      const frac = bottom / p.h;
      report(
        `[swingcue T8] ${p.id} ${p.w}×${p.h}: box ${box.toFixed(1)} px, ${lines} lines, top ${top.toFixed(2)}, bottom ≤ ${bottom.toFixed(2)} = ${frac.toFixed(4)} of the stage · hazard ${HAZARD_BAND_TOP_FRACTION} · column box ceiling ${NOTIFY_COLUMN_MAX_STAGE_FRACTION} · peek painted floor 0.480 (notifyColumn.ts, at the old 0.166 top) / shortest card 0.478-0.523 (at 0.188)`,
      );
      expect(frac, `${p.id}: the drawn cue's bottom over the stage`).toBeLessThan(HAZARD_BAND_TOP_FRACTION);
    });
});

/* ─────────────────────────────── T2 ─────────────────────────────────────── */

describe("T2 · the shell decision and its call site", () => {
  const ALL: (SimOverlayItem | null)[] = [null, ...(Object.values(ITEMS) as SimOverlayItem[])];
  it("swingCueYieldAttr is «on» exactly when compact, the sheet is shut and the row yields", () => {
    for (const compact of [false, true])
      for (const sheetOpen of [false, true])
        for (const active of ALL) {
          const want = compact && !sheetOpen && overlayYieldsToSwingCue(active) ? "on" : undefined;
          expect(swingCueYieldAttr(compact, sheetOpen, active), `${compact}/${sheetOpen}/${active?.id}`).toBe(want);
        }
  });

  it("…pinned on the cases that matter, independent of the predicate", () => {
    expect(swingCueYieldAttr(true, false, ITEMS.standby)).toBe("on");
    expect(swingCueYieldAttr(true, false, ITEMS.praiseFlash)).toBe("on");
    expect(swingCueYieldAttr(false, false, ITEMS.standby)).toBeUndefined(); // the PC
    expect(swingCueYieldAttr(true, true, ITEMS.standby)).toBeUndefined(); // the read sheet
    expect(swingCueYieldAttr(true, false, null)).toBeUndefined();
    expect(swingCueYieldAttr(true, false, ITEMS.coachedHint)).toBeUndefined();
    expect(swingCueYieldAttr(true, false, ITEMS.briefing)).toBeUndefined();
  });

  it("the root writes it exactly as swingCueYieldAttr(compact, overlaySheetOpen, overlay.active) — no literal, no inline expression", () => {
    const withAttr = jsxPropsOf(SHELL, "div").filter((p) => "data-sim-overlay-yields" in p);
    expect(withAttr).toHaveLength(1);
    expect(withAttr[0]["data-sim-overlay-yields"]).toBe("swingCueYieldAttr(compact, overlaySheetOpen, overlay.active)");
    // on the shell root itself, beside the attribute it refines
    expect(withAttr[0]["data-sim-overlay-active"]).toBe('compact && (overlay.active !== null || overlaySheetOpen) ? "on" : undefined');
    expect(withAttr[0]["data-sim-compact"]).toBe('compact ? "on" : undefined');
    const calls = callSitesOf(SHELL, ["swingCueYieldAttr"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["compact", "overlaySheetOpen", "overlay.active"]);
  });

  it("no new data-hud=\"notify-column\" anchor: the shell still has its two, the first in the N4 comment", () => {
    const at = [...SHELL.matchAll(/data-hud="notify-column"/g)].map((m) => m.index as number);
    expect(at).toHaveLength(2);
    expect(SHELL.slice(at[0] - 80, at[0])).toContain("reads 260 characters forward");
  });
});

/* ─────────────────────────────── T4 / T5 ────────────────────────────────── */

/** A new rule by its exact selector list — an ASSERTION when it is missing, never a crash. */
function ruleBySelectors(sel: string): CssRule {
  const r = TREE.find((x) => x.selectors.join(", ") === sel);
  expect(r, `the rendered tree has no rule «${sel}»`).toBeDefined();
  return r as CssRule;
}

const keyOf = (r: CssRule) => `${r.sheet} ${r.conditions.join(" ")} ${r.rawExact}`;

describe("T4 · every rule without [data-sim-compact=\"on\"] is byte-identical in the RENDERED CSS (the PC)", () => {
  it("both stylesheets, rule by rule, in order", () => {
    const pc = (rs: CssRule[]) => rs.filter((r) => !r.selectorText.includes('[data-sim-compact="on"]')).map(keyOf);
    expect(pc(TREE)).toEqual(pc(BASE));
  });
  it("the SimOverlay sheet is byte-identical as a whole (comments aside)", () => {
    const t = renderedTreeSheets();
    expect(t.simOverlay.replace(/\/\*[\s\S]*?\*\//g, "")).toBe(BASE_SIM_OVERLAY_CSS);
  });
});

describe("T5 · every protected rule is byte-identical, and the new rules are exactly the six", () => {
  it("tree = base with the cue's third selector narrowed, plus the six new rules", () => {
    const isNew = (r: CssRule) => NEW_SELECTOR_LISTS.includes(r.selectors.join(", "));
    const added = TREE.filter(isNew);
    expect(added.map((r) => r.selectors.join(", ")).sort()).toEqual([...NEW_SELECTOR_LISTS].sort());
    const kept = TREE.filter((r) => !isNew(r));
    expect(kept.length).toBe(BASE.length);
    const diffs: number[] = [];
    kept.forEach((r, i) => {
      if (keyOf(r) !== keyOf(BASE[i])) diffs.push(i);
    });
    expect(diffs, "exactly one changed rule").toHaveLength(1);
    const b = BASE[diffs[0]];
    const t = kept[diffs[0]];
    expect(b.selectors.slice(0, 2)).toEqual(t.selectors.slice(0, 2));
    expect(b.selectors[2]).toBe(BASE_CUE_SELECTOR);
    expect(t.selectors[2]).toBe(NARROWED_CUE_SELECTOR);
    expect(t.decls).toEqual(b.decls);
  });

  it("the narrowed rule's first two selectors (follow-hint, telltale-cue) keep their text", () => {
    const r = TREE.find((x) => x.selectors.includes(NARROWED_CUE_SELECTOR));
    expect(r?.selectors.slice(0, 2)).toEqual([
      '[data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="follow-hint"]',
      '[data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="telltale-cue"]',
    ]);
  });

  it("every new rule is compact-scoped, (1c) sits inside the landscape media block, and the column yields by visibility", () => {
    for (const sel of NEW_SELECTOR_LISTS) {
      const r = ruleBySelectors(sel);
      for (const s of r.selectors) expect(s, "compact-scoped").toContain('[data-sim-compact="on"]');
    }
    const carSheet = ruleBySelectors(NEW_SELECTOR_LISTS[5]);
    expect(carSheet.conditions).toEqual(["@media (orientation: landscape)"]);
    const y = ruleBySelectors(YIELD_RULE_SELECTOR);
    expect(y.decls).toEqual([{ prop: "visibility", value: "hidden", important: false }]);
    // and no rule anywhere hides the column by display
    for (const r of TREE)
      if (r.selectors.some((s) => s.endsWith('[data-hud="notify-column"]')))
        expect(r.decls.some((d) => d.prop === "display" && d.value === "none"), r.selectorText).toBe(false);
  });
});

/* ─────────────────────────────── side effects ───────────────────────────── */

describe("side effects (a)–(e): nothing else moves", () => {
  const PROPS = ["display", "visibility", "top", "animation", "z-index", "right", "width", "left", "transform", "translate"];
  const ALLOWED = new Set<string>([
    BASE_CUE_SELECTOR,
    NARROWED_CUE_SELECTOR,
    ...NEW_SELECTOR_LISTS.flatMap((s) => s.split(", ")),
  ]);

  for (const cell of CELLS)
    for (const p of orientationsOf(cell))
      it(`${cell.id} · ${p.id}: every other surface keeps its match set and its winners`, () => {
        const b = buildCell(cell.input, "base");
        const t = buildCell(cell.input, "tree");
        const env = envOf(p);
        // (d)/(e): the witnesses — follow-hint, telltale-cue, audio-prompt,
        // telltale-pings, demo-deck, touch-hint, touch-controls — and the
        // peek's own card.
        const pairs: [El, El][] = b.witnesses.map((w, i) => [w, t.witnesses[i]]);
        if (b.peek && t.peek) pairs.push([b.peek.children[0], t.peek.children[0]]);
        for (const [eb, et] of pairs) {
          const mb = matchSet(BASE, eb, env);
          const mt = matchSet(TREE, et, env);
          expect(mb.unresolved.concat(mt.unresolved), `${eb.name}: undecidable`).toEqual([]);
          expect(mt.set, `${eb.name}: match set`).toEqual(mb.set);
          for (const prop of PROPS) {
            const wb = winnerFor(BASE, eb, prop, env);
            const wt = winnerFor(TREE, et, prop, env);
            expect([wt.value, wt.unresolved], `${eb.name} ${prop}`).toEqual([wb.value, wb.unresolved]);
          }
        }
        // the cue and the column: only the rules this lane owns may differ
        for (const [eb, et] of [
          [b.cue, t.cue],
          [b.peek, t.peek],
        ] as [El | null, El | null][]) {
          if (eb === null || et === null) continue;
          const sel = (rs: CssRule[], e: El) =>
            new Set(rs.flatMap((r) => r.selectors.filter((s) => matches(s, e) === true).map((s) => `${r.conditions.join(" ")}|${s}`)));
          const sb = sel(BASE, eb);
          const st = sel(TREE, et);
          const changed = [...sb].filter((s) => !st.has(s)).concat([...st].filter((s) => !sb.has(s)));
          for (const s of changed) expect(ALLOWED.has(s.split("|")[1]), `${eb.name}: unexpected rule ${s}`).toBe(true);
        }
      });

  it("(c) the column yields by a visibility change only, so .sim-overlay-in does not replay", () => {
    // An animation restarts when animation-name changes or the box is re-created
    // (display:none → shown). The yield writes ONE declaration, visibility, on
    // the column; nothing this lane adds declares display or animation on the
    // column or its card.
    for (const sel of NEW_SELECTOR_LISTS) {
      const r = ruleBySelectors(sel);
      if (!r.selectors.some((s) => s.endsWith('[data-hud="notify-column"]'))) continue;
      expect(r.decls.map((d) => d.prop)).toEqual(["visibility"]);
    }
  });

  it("(a) no product code reads the column's computed visibility", () => {
    // touchHintOnGlass (touchHintLifetime.ts) is the only computed-visibility
    // reader in the app and it walks the TOUCH HINT's ancestors, which do not
    // include the column; useCardOverhang measures rects, which visibility keeps.
    const overlay = nl(readFileSync(resolve(__dirname, "../../../../modules/sim/hud/SimOverlay.tsx"), "utf8"));
    // (SimOverlay reads getComputedStyle for line-height and padding only.)
    for (const src of [overlay, SHELL]) expect(src).not.toMatch(/\.visibility\b|checkVisibility/);
  });
});

/* ─────────────────────────────── T6 (shell) ─────────────────────────────── */

describe("T6 · no yielding kind is produced blocking or sheet-only (the shell's producers)", () => {
  const YIELDING = new Set(["task", "legend", "advisor", "predrive", "praise"]);

  it("every object literal in the shell that names a kind keeps yielding kinds non-blocking and not sheet-only", () => {
    const sf = ts.createSourceFile("shell.tsx", SHELL, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const seen: string[] = [];
    const walk = (n: ts.Node): void => {
      if (ts.isObjectLiteralExpression(n)) {
        const props = new Map<string, string>();
        for (const pr of n.properties)
          if (ts.isPropertyAssignment(pr) && (ts.isIdentifier(pr.name) || ts.isStringLiteral(pr.name)))
            props.set(pr.name.text, pr.initializer.getText(sf).replace(/\s+/g, " "));
        const kind = props.get("kind");
        if (kind !== undefined) {
          const k = /^"([a-z]+)"/.exec(kind)?.[1];
          if (k !== undefined && YIELDING.has(k)) {
            seen.push(k);
            for (const flag of ["blocking", "sheetOnly"]) {
              const v = props.get(flag);
              expect(v === undefined || v === "false", `a ${k} item sets ${flag}: ${v}`).toBe(true);
            }
          }
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    // the enumerated sites: taskOverlayRow (task), advisorOverlayRow's base
    // (advisor), the praise flash and the commendation toast (praise),
    // pre-drive, legend
    for (const k of YIELDING) expect(seen, k).toContain(k);
  });

  it("…and the builders, executed, produce rows that yield", () => {
    const input = {
      taskLineBg: "Мини отсечката",
      taskKey: "k",
      mistakeMode: false,
      objectiveIndex: 1,
      objectiveTotal: 2,
      fold: { advisorSpeaks: true, taskDetailBg: null },
      advisorPrompt: { textBg: "Задръж лек волан надясно.", keys: [], peekBg: "Задръж волана" },
    } as unknown as AdvisorTaskRowsInput;
    const task = taskOverlayRow(input);
    expect(overlayYieldsToSwingCue(task)).toBe(true);
    expect(overlayYieldsToSwingCue(advisorOverlayRow(input.advisorPrompt as never))).toBe(true);
    const [adv, praise] = advisorTaskRows(input, {
      advisorFresh: true,
      praiseFresh: true,
      taskFresh: false,
      flash: { key: "o1", titleBg: "Мини отсечката" } as never,
    });
    expect(praise?.kind).toBe("praise");
    expect(overlayYieldsToSwingCue(praise)).toBe(true);
    expect(overlayYieldsToSwingCue(adv)).toBe(true);
  });
});

/* ─────────────────────────────── the evaluator on base ──────────────────── */

describe("the base rules the census leans on, read by the evaluator (it must reproduce the defect)", () => {
  it("base: the standby holds the cue display:none for its whole life on a phone — the rig-w3z defect", () => {
    const dom = buildCell({ ...DRIVING, active: ITEMS.standby }, "base");
    const w = winnerFor(BASE, dom.cue as El, "display", envOf(LAND));
    expect(w.value).toBe("none");
    expect(w.selector).toBe(BASE_CUE_SELECTOR);
  });
  it("base fixture sanity: the rendered base sheet parses and holds the base selector", () => {
    expect(parseSheets([{ name: "x", css: BASE_PLAY_AREA_CSS }]).some((r) => r.selectors.includes(BASE_CUE_SELECTOR))).toBe(true);
    expect(TAILWIND_UTILITIES).toContain(".top-16");
    expect(NOTIFY_COLUMN_TOP_CSS_COMPACT).not.toBe(NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN);
  });
});

/* ─────────────────────────────── C17 / C18 ─────────────────────────────── */

describe("C17 / C18 · the cue never mounts in an exam or beside a telltale on either lesson", () => {
  it("the exam path passes no swing setter (LessonScene)", () => {
    expect(SCENE).toContain("onSecondSwing={lesson.examMode === true ? undefined : setWindSwingCueOn}");
    expect(SCENE).toContain("{windSwingCueOn && !telltaleCueOn ? (");
  });

  it("neither crosswind lesson stages a telltale at any level, normal or mistake-experience", () => {
    const specs = [
      SCENARIO_TEMPLATES_CONDITIONS.find((s) => s.id === "sc-ac-crosswind"),
      SCENARIO_TEMPLATES_CONDITIONS2.find((s) => s.id === "sc-ac-wind-truck-pass"),
    ];
    let compiled = 0;
    for (const maybe of specs) {
      expect(maybe, "lesson template").toBeDefined();
      if (maybe === undefined) continue;
      const spec = maybe;
      for (const rung of spec.levels) {
        const variants: (ScenarioCompileOptions | undefined)[] = [undefined];
        // the THEO-3 mistake-experience sessions are authored per template
        (spec.mistakes ?? []).forEach((_, i) => variants.push({ mistakeExperience: { mistakeIndex: i } }));
        for (const opts of variants) {
          let lesson: unknown;
          try {
            lesson = compileScenario(spec, rung.level, opts);
          } catch (e) {
            if (opts !== undefined) continue; // a mistake this rung does not stage
            throw e;
          }
          compiled++;
          // The ONLY producer of the red lamp is the telltaleStimulus runner
          // (orchestrator/runners.ts, TelltaleStimulusRunner).
          expect(JSON.stringify(lesson), `${spec.id} L${rung.level}`).not.toContain("telltaleStimulus");
        }
      }
    }
    expect(compiled).toBeGreaterThanOrEqual(10);
  });
});
