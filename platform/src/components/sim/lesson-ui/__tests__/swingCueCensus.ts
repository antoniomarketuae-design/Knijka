/**
 * THE SWING-CUE CENSUS, AS DATA — lane «swingcue», sc-ac-crosswind:a9db1738
 * clause 4 (phone half), integrator ruling R-SC1 (A).
 *
 * One small DOM per census state, built from the SAME inputs the product uses
 * (the shell's `overlay.active`, its `overlaySheetOpen`, SimOverlay's open
 * state, which scene nodes are mounted, the <html> attributes TouchControls,
 * SimOverlay and CameraRig write) and evaluated by `cssCascadeEvaluator` over
 * the RENDERED stylesheets of base (the 1feba3a fixture) and of the tree.
 *
 * Every element and class below is the one the product renders, cited:
 *   · shell root            LessonPlayShell.tsx (data-sim-compact /
 *                           data-sim-overlay-active / data-sim-overlay-yields)
 *   · [data-sim-stage]      LessonPlayShell.tsx, `relative … overflow-hidden`
 *   · static wrapper        LessonPlayShell.tsx `h-full w-full` (touchAction)
 *   · LessonScene root      LessonScene.tsx `relative h-full w-full`
 *   · the cue               LessonScene.tsx `pointer-events-none absolute
 *                           left-1/2 top-16 z-10 -translate-x-1/2` + its plate
 *   · the peek column       SimOverlay.tsx `pointer-events-none absolute z-30
 *                           flex flex-col items-end`, inline top / right / width
 *   · the read sheet        SimOverlay.tsx data-hud="overlay-read"
 *   · the roomy column      LessonPlayShell.tsx data-hud="notify-column",
 *                           class `hidden` on compact
 * Tailwind's utilities are modelled as the layered rules they are: only the
 * three on these elements that set display / visibility / top (`flex`,
 * `hidden`, `top-16`), in Tailwind's own order (display utilities before
 * `hidden`, which is what lets `hidden` win on the roomy column).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SimOverlay, type SimOverlayItem } from "@/modules/sim/hud";
import { NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN } from "@/modules/sim/hud/notifyColumn";
import { NOTIFY_COLUMN_RIGHT_CSS, NOTIFY_COLUMN_WIDTH_CSS_COMPACT } from "@/modules/sim/hud";
import { FLANK_LANE_VAR } from "@/modules/sim/hud/notifyColumn";
import { PlayAreaStyles } from "../PlayAreaStyles";
import { swingCueYieldAttr } from "../LessonPlayShell";
import { BASE_PLAY_AREA_CSS, BASE_SIM_OVERLAY_CSS } from "./swingCueYield.base.fixture";
import { el, parseSheets, type CssRule, type El } from "./cssCascadeEvaluator";

export const TAILWIND_UTILITIES = `@layer utilities {
  .flex { display: flex; }
  .hidden { display: none; }
  .top-16 { top: calc(var(--spacing) * 16); }
}`;

const styleBodies = (html: string): string[] => {
  const out: string[] = [];
  const re = /<style>([\s\S]*?)<\/style>/g;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) out.push(m[1]);
  return out;
};

export function renderedTreeSheets(): { playArea: string; simOverlay: string } {
  const pa = styleBodies(renderToStaticMarkup(createElement(PlayAreaStyles)));
  const so = styleBodies(
    renderToStaticMarkup(
      createElement(SimOverlay, { item: { id: "t", kind: "task", tone: "neutral", lineBg: "x" }, queued: 0 }),
    ),
  );
  if (pa.length !== 1 || so.length !== 1) throw new Error(`expected one <style> each, got ${pa.length}/${so.length}`);
  for (const s of [...pa, ...so])
    if (/&quot;|&amp;|&lt;|&gt;|&#x27;/.test(s)) throw new Error("the rendered <style> was HTML-escaped");
  return { playArea: pa[0], simOverlay: so[0] };
}

export function treeRules(): CssRule[] {
  const t = renderedTreeSheets();
  return parseSheets([
    { name: "tailwind", css: TAILWIND_UTILITIES },
    { name: "PlayAreaStyles", css: t.playArea },
    { name: "SimOverlay", css: t.simOverlay },
  ]);
}
export function baseRules(): CssRule[] {
  return parseSheets([
    { name: "tailwind", css: TAILWIND_UTILITIES },
    { name: "PlayAreaStyles", css: BASE_PLAY_AREA_CSS },
    { name: "SimOverlay", css: BASE_SIM_OVERLAY_CSS },
  ]);
}

/* ─────────────────────────────── a census state ─────────────────────────── */

export interface CellInput {
  compact: boolean;
  /** The shell's `overlay.active` (after the ✕ filter). */
  active: SimOverlayItem | null;
  /** The shell's `overlaySheetOpen` (an effect behind SimOverlay's `open`). */
  shellSheetOpen: boolean;
  /** SimOverlay's own `open` this commit: the read sheet mounted, the peek not. */
  domSheetOpen: boolean;
  cue: boolean;
  touchHint: boolean;
  /** Scene chips mounted beside the cue (the witnesses for side effect (e)). */
  followHint?: boolean;
  telltaleCue?: boolean;
  audioPrompt?: boolean;
  telltalePings?: boolean;
  demoDeck?: boolean;
  html: {
    camera?: "chase";
    glance?: "rear" | "right" | "left";
    carSheet?: boolean;
    overlayRead?: boolean;
  };
}

export interface CellDom {
  html: El;
  root: El;
  cue: El | null;
  peek: El | null;
  read: El | null;
  roomyColumn: El;
  /** Every element whose match set must not change (side effect (e)). */
  witnesses: El[];
}

/** Which tree to model: base never writes the yields attribute. */
export type Side = "base" | "tree";

export function buildCell(c: CellInput, side: Side): CellDom {
  const overlayActive = c.compact && (c.active !== null || c.shellSheetOpen) ? "on" : undefined;
  const yields = side === "tree" ? swingCueYieldAttr(c.compact, c.shellSheetOpen, c.active) : undefined;
  const cue = c.cue
    ? el(
        "div",
        "cue",
        { "data-hud": "wind-swing-cue" },
        ["pointer-events-none", "absolute", "left-1/2", "top-16", "z-10", "-translate-x-1/2"],
        [],
        [el("div", "cue-plate", {}, ["rounded-2xl", "border", "bg-background/85", "px-3.5", "py-1.5", "text-xs", "font-bold"])],
      )
    : null;
  const witnesses: El[] = [];
  const w = (on: boolean | undefined, hud: string): El[] => {
    if (!on) return [];
    const e = el("div", hud, { "data-hud": hud }, ["pointer-events-none", "absolute"]);
    witnesses.push(e);
    return [e];
  };
  const touchHint = w(c.touchHint, "touch-hint");
  const touchControls = el("div", "touch-controls", { "data-hud": "touch-controls" }, ["pointer-events-none", "absolute", "inset-0", "z-10"]);
  witnesses.push(touchControls);
  const sceneRoot = el("div", "scene-root", {}, ["relative", "h-full", "w-full"], [], [
    ...(cue ? [cue] : []),
    // LessonScene renders the follow chip only while the cue is NOT up.
    ...w(c.followHint && !c.cue, "follow-hint"),
    // …and the cue only while the telltale cue is not.
    ...w(c.telltaleCue && !c.cue, "telltale-cue"),
    ...w(c.audioPrompt, "audio-prompt"),
    ...w(c.telltalePings, "telltale-pings"),
    ...touchHint,
    touchControls,
  ]);
  const peek =
    c.compact && c.active !== null && !c.domSheetOpen
      ? el(
          "div",
          "peek",
          { "data-sim-overlay": c.active.kind, "data-sim-overlay-state": "peek", "data-hud": "notify-column" },
          ["pointer-events-none", "absolute", "z-30", "flex", "flex-col", "items-end"],
          [
            { prop: "top", value: NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN, important: false },
            { prop: "right", value: `calc(${NOTIFY_COLUMN_RIGHT_CSS} + ${FLANK_LANE_VAR})`, important: false },
            { prop: "width", value: `calc(${NOTIFY_COLUMN_WIDTH_CSS_COMPACT} - ${FLANK_LANE_VAR})`, important: false },
          ],
          [el("div", "peek-card", {}, ["sim-overlay-in"])],
        )
      : null;
  const read =
    c.compact && c.domSheetOpen && c.active !== null
      ? el("div", "read", { "data-sim-overlay": c.active.kind, "data-sim-overlay-state": "open", "data-hud": "overlay-read" }, ["pointer-events-none", "absolute", "inset-x-0", "z-40", "flex", "justify-center"])
      : null;
  const roomyColumn = el(
    "div",
    "roomy-column",
    { "data-hud": "notify-column" },
    ["pointer-events-none", "absolute", "z-30", "flex", "min-h-0", "flex-col", "items-stretch", "gap-1.5", "overflow-hidden", ...(c.compact ? ["hidden"] : [])],
  );
  const deck = w(c.demoDeck, "demo-deck");
  const stage = el("div", "stage", { "data-sim-stage": "" }, ["relative", "mx-auto", "w-full", "overflow-hidden"], [], [
    el("div", "static-wrap", {}, ["h-full", "w-full"], [], [sceneRoot]),
    ...(peek ? [peek] : []),
    ...(read ? [read] : []),
    ...deck,
    roomyColumn,
  ]);
  const root = el(
    "div",
    "shell-root",
    {
      "data-sim-shell": "",
      "data-sim-compact": c.compact ? "on" : undefined,
      "data-sim-overlay-active": overlayActive,
      "data-sim-overlay-yields": yields,
    },
    [],
    [],
    [stage],
  );
  const html = el(
    "html",
    "html",
    {
      "data-sim-camera": c.html.camera,
      "data-sim-glance": c.html.glance,
      "data-sim-car-sheet": c.html.carSheet ? "open" : undefined,
      "data-sim-overlay-read": c.html.overlayRead ? "open" : undefined,
    },
    [],
    [],
    [el("body", "body", {}, [], [], [root])],
  );
  return { html, root, cue, peek, read, roomyColumn, witnesses };
}

/* ─────────────────────────────── the items ──────────────────────────────── */

export const ITEMS = {
  standby: { id: "task:1", kind: "task", tone: "neutral", chipBg: "Задача 1/2", lineBg: "Мини отсечката" },
  announcement: { id: "task:2", kind: "task", tone: "neutral", chipBg: "Задача 2/2", lineBg: "Стигни края на отсечката" },
  advisor: { id: "advisor:x", kind: "advisor", tone: "neutral", lineBg: "Съветник", peekBg: "Задръж лек волан" },
  legend: { id: "legend", kind: "legend", tone: "neutral", lineBg: "Зелената линия …" },
  praiseFlash: { id: "praise:o1", kind: "praise", tone: "good", lineBg: "Мини отсечката" },
  praiseToast: { id: "toast:9", kind: "praise", tone: "good", chipBg: "Браво", lineBg: "Чисто и спокойно каране" },
  predrive: { id: "predrive:belt", kind: "predrive", tone: "neutral", chipBg: "Подготовка", lineBg: "Колан", noDismiss: true },
  worldEdge: { id: "edge", kind: "hint", tone: "warn", lineBg: "Ръбът на света", blocking: false },
  coachedHint: { id: "toast:3", kind: "hint", tone: "teach", lineBg: "Съвет" },
  mistakeDemo: { id: "demo", kind: "hint", tone: "teach", lineBg: "Демонстрация", blocking: true },
  briefing: { id: "briefing", kind: "hint", tone: "neutral", lineBg: "1. …", sheetOnly: true, blocking: true },
  warning: { id: "warn", kind: "warning", tone: "warn", lineBg: "Коланът" },
  violation: { id: "toast:4", kind: "violation", tone: "danger", lineBg: "Нарушение" },
  teach: { id: "teach", kind: "teach", tone: "teach", lineBg: "Урок", blocking: true },
  end: { id: "end", kind: "end", tone: "good", lineBg: "Край", blocking: true },
  /** A hypothetical blocking ambient row: no producer ships one (T6), but the rule must hold anyway. */
  blockingTask: { id: "t-b", kind: "task", tone: "neutral", lineBg: "x", blocking: true },
  sheetOnlyPraise: { id: "p-s", kind: "praise", tone: "good", lineBg: "x", sheetOnly: true },
} satisfies Record<string, SimOverlayItem>;
