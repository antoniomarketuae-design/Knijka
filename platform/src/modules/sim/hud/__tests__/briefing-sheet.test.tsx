/**
 * =============================================================================
 * THE PHONE'S BRIEFING IS THE WHOLE SHEET, OR IT IS NOT ON THE GLASS AT ALL.
 * sc-vu-emergency:2e634d4d · sc-sig-controller-postures:f7e046c4 (2026-10-08).
 * =============================================================================
 *
 * WHAT THE w79 CAPTURE MEASURED on the phone lens (852 × 393, DPR 3, tree
 * 8b5a7f2): a student who had OPTED IN to the briefing got a peek — step 1 of 5
 * as an unnumbered lead, the other four (a list opening at «2.») wholly under
 * the fold, a read button «ПРОЧЕТИ ↓17» («↓36» on the controller lesson) and
 * «РАЗБРАХ» — and the car DROVE with that peek up (2.3–3.1 m on 1.5 s of
 * throttle). So a student could set off having seen one step of five on the
 * surface he had asked for in order to read all five.
 *
 * THE DECISION (integrator, under the founder's delegation of 2026-10-08):
 * «PHONE BRIEFING, OPTED IN → THE FULL SHEET.» Both routes — the stored opt-in
 * at arrival («Показвай ги в началото») and МЕНЮ → «Инструкции · N стъпки» —
 * show the READ SHEET directly: every authored step numbered 1.–N in one face,
 * the sim frozen while it is up, ONE dismiss control («РАЗБРАХ», 36 px). No
 * «ПРОЧЕТИ ↓N» counter, no peek, no unnumbered lead. The 2026-09-20 rulings are
 * unchanged: #1 the phone briefing is OFF by default, #4 the reading button is
 * 36 px and stays in the card.
 *
 * HOW THIS FILE HOLDS IT. There is no jsdom in this project (`environment:
 * "node"`), so the glass is read three ways, each the device a sibling suite
 * already uses:
 *   · `renderToStaticMarkup(<SimOverlay …/>)` — the DOM the phone layout paints
 *     for the item the queue selected (`SimOverlay` is mounted on compact only);
 *   · `hookHarness.mountHook` — the component RUN, effects and all, so «РАЗБРАХ»
 *     is pressed and the freeze is observed rather than spelled;
 *   · the start machine + the queue as pure functions, driven through the same
 *     sequence the shell drives them (`briefing-start.test.ts`'s technique),
 *     with the shell's own call sites source-pinned at the bottom.
 *
 * THEO-4: every assertion about numbering compares the glass against the
 * AUTHORED steps of the compiled lesson, character for character — a sheet that
 * numbers 1.–N over the wrong sentences would pass a count and fail a student.
 *
 * ── ROUND 2 (2026-10-08) — WHAT ROUND 1 GOT WRONG, AND WHAT IS HELD NOW ───────
 *
 * F1, the refutation. Round 1 made the acknowledgement a fixed 36 px and left
 * the fold cue inside it; in WebKit the cue wraps to 2–3 lines in the 88 px
 * landscape rail, so on every rung that folds the button's own words were
 * painted outside its box («Разбрах» sliced, «ПОКАЖИ» under the section's
 * clip). The button now holds its label and nothing else, and the cue stands in
 * the sheet's foot beside it (§ 1, § 6) and says what the press does.
 *
 * The four mutants that survived round 1 are each held by an EXECUTED test:
 *   · the freeze term dead but still spelled, and the shell feeding the
 *     producer steps 2…N — § 10 parses the shell and RUNS its own statements;
 *   · every blocking sheet shrunk to 36 px, and the ✕ gone from every sheet —
 *     § 6b opens a teach sheet and a violation sheet by a tap and reads them.
 *
 * MEASURED IN A BROWSER (not in this file — node has no layout engine). WebKit
 * at the audit harness's phone profiles, the lane's compiled CSS and this
 * `SimOverlay`, every one of the 808 rungs on each box; rig and report in the
 * lane's scratch (`briefsheet-impl/rig`, `out/report-census.json`):
 *
 *                               852×393   780×360   393×852   360×780
 *   sheet · 1.–N == authored      808       808       808       808
 *   one button, label only        808       808       808       808
 *   button box                   88×36     88×36    367×36    334×36
 *   label line box inside it    9 px top and bottom, on every rung
 *   rungs that fold                10        20         0         0
 *   cue: lines / box            5 / 88×68.75  (both landscape boxes)
 *   cue ends above the button     6 px      6 px        —         —
 *   cue line box outside its box   0         0          —         —
 *   anything under the clip        0         0          0         0
 *   cue count == lines hidden    10/10     20/20        —         —
 *   press 1 reveals, no ack      10/10     20/20        —         —
 *   press 2 acknowledges         10/10     20/20        —         —
 *   one press acknowledges (fit)  798       788       808       808
 *
 * No shipped briefing folds upright, so the beside-the-button layout was
 * measured on a synthetic briefing twice the longest: cue 2 lines (27.5 px),
 * 8 px left of a 36 px button, nothing outside its box. Before, same rig
 * (the verifier's): button 88×36 holding 44–54 px, ink 8 px above and 10.5 px
 * below its box on all 10 + 20 folding rungs.
 *
 * NOT MEASURED: a device, and the real shell under throttle. Both are owed.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { compileScenario } from "../../lessons/scenario/compile";
import type { ScenarioLevel } from "../../lessons/scenario/types";
import {
  BRIEFING_START_INITIAL,
  briefingIsOpen,
  briefingStartReducer,
  nextBriefingStartEvent,
  type BriefingStartState,
} from "../briefingStart";
import { BRIEFING_AUTO_DEFAULT_COMPACT, briefingOpensAtStart } from "../hudPreferences";
import {
  briefingSheetItem,
  overlaySheetHoldsDrive,
  selectOverlay,
  type BriefingStepBg,
  type OverlaySelection,
  type SimOverlayItem,
} from "../overlayQueue";
import { sheetFitsWhole, type SheetViewport } from "../sheetLayout";
import { SimOverlay, sheetFootFoldBg } from "../SimOverlay";
import { collectProps, mountHook } from "./hookHarness";

// ---------------------------------------------------------------------------
// The catalogue — every rung of every shipped template, compiled.
// ---------------------------------------------------------------------------

interface Rung {
  readonly id: string;
  readonly steps: readonly BriefingStepBg[];
}

const RUNGS: readonly Rung[] = SCENARIO_TEMPLATES.flatMap((spec) =>
  spec.levels.map((l) => ({
    id: `${spec.id}@L${l.level}`,
    steps: compileScenario(spec, l.level as ScenarioLevel).briefingBg ?? [],
  })),
);

function rung(id: string): Rung {
  const hit = RUNGS.find((r) => r.id === id);
  expect(hit, `unresolved: ${id} is not in the compiled catalogue`).toBeDefined();
  return hit!;
}

const authoredChars = (r: Rung): number => r.steps.reduce((n, s) => n + s.textBg.length, 0);
const LONGEST_BY_CHARS = [...RUNGS].sort((a, b) => authoredChars(b) - authoredChars(a))[0]!;
const LONGEST_BY_STEPS = [...RUNGS].sort((a, b) => b.steps.length - a.steps.length)[0]!;

// ---------------------------------------------------------------------------
// The phone, as the shell drives it — start machine → candidate → queue.
// ---------------------------------------------------------------------------

interface Phone {
  readonly start: BriefingStartState;
}

/** Mount on a phone: the effect body `nextBriefingStartEvent`, run to rest. */
function arriveOnPhone(stored: boolean | null): Phone {
  let start = BRIEFING_START_INITIAL;
  for (let i = 0; i < 4; i += 1) {
    const event = nextBriefingStartEvent(start, true, stored);
    if (event === null) break;
    start = briefingStartReducer(start, event);
  }
  return { start };
}

/** МЕНЮ → «Инструкции · N стъпки» (`recallBriefing` → `recall`). */
const menuRecall = (p: Phone): Phone => ({
  start: briefingStartReducer(p.start, { type: "recall" }),
});

/** «РАЗБРАХ» (`onAck` → `closeBriefing` → `dismiss`). */
const pressAck = (p: Phone): Phone => ({
  start: briefingStartReducer(p.start, { type: "dismiss" }),
});

/**
 * The shell's briefing candidate — `briefingOpen && briefing.length > 0 &&
 * !mistakeMode && !ended ? briefingSheetItem(briefing, closeBriefing) : null`.
 * That expression is source-pinned in «the shell wires it» below; this is the
 * same producer, so what is asserted here is the item the shell queues.
 */
function candidate(p: Phone, steps: readonly BriefingStepBg[], onAck?: () => void): SimOverlayItem | null {
  return briefingIsOpen(p.start) ? briefingSheetItem(steps, onAck) : null;
}

const TASK: SimOverlayItem = {
  id: "task:1/2",
  kind: "task",
  tone: "neutral",
  chipBg: "Задача 1/2",
  lineBg: "Установи се в дясната лента.",
};
const BELT: SimOverlayItem = {
  id: "warning:belt",
  kind: "warning",
  tone: "warn",
  chipBg: "Колан",
  lineBg: "Предпазният колан не е закопчан.",
  detailBg: "Закопчай колана, преди да потеглиш.",
};
const VIOLATION: SimOverlayItem = {
  id: "toast:7",
  kind: "violation",
  tone: "danger",
  chipBg: "−5 т.",
  lineBg: "Превишена скорост",
  detailBg: "Движеше се над разрешената скорост.",
};
const TEACH: SimOverlayItem = {
  id: "teach:SPEEDING:22",
  kind: "teach",
  tone: "teach",
  chipBg: "Учебен момент",
  lineBg: "Превишена скорост",
  detailBg: "Спирачният път расте с квадрата на скоростта.",
  blocking: true,
  onAck: () => undefined,
};

/** The glass for a phone state: everything that competes for the one slot. */
function glass(
  p: Phone,
  steps: readonly BriefingStepBg[],
  others: readonly SimOverlayItem[] = [TASK],
): OverlaySelection {
  return selectOverlay([...others, candidate(p, steps)]);
}

function markup(selection: OverlaySelection): string {
  return renderToStaticMarkup(<SimOverlay item={selection.active} queued={selection.queued} />);
}

// ---------------------------------------------------------------------------
// Reading the DOM.
// ---------------------------------------------------------------------------

const decode = (s: string): string =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const text = (html: string): string => decode(html.replace(/<[^>]+>/g, ""));

const sheetIsUp = (html: string): boolean => html.includes('data-sim-overlay-state="open"');
const peekIsUp = (html: string): boolean => html.includes('data-sim-overlay-state="peek"');

/** The sheet's scroller — the element whose children are the steps. */
function sheetScroller(html: string): string | null {
  const at = html.indexOf('data-sim-overlay-sheet-text=""');
  if (at < 0) return null;
  const from = html.indexOf(">", at) + 1;
  const rail = html.indexOf('data-sim-overlay-sheet-rail=""', from);
  if (rail < 0) return null;
  return html.slice(from, html.lastIndexOf("</div>", rail));
}

/**
 * Everything on the glass that is NOT an authored step — chip, controls, cues.
 *
 * The «↓» ban is a ban on a COUNTER, and it has to be read off the chrome: an
 * authored step may itself print the glyph (`sc-lane-control-signal` teaches
 * the green «↓» above a lane), and a census that forbade the character
 * everywhere would be asking the sheet to censor the lesson.
 */
function chromeText(html: string): string {
  const inner = sheetScroller(html);
  return text(inner === null ? html : html.replace(inner, ""));
}

const FOLD_COUNTERS = [
  "data-sim-overlay-fold",
  "data-sim-overlay-sheet-fold",
  "data-sim-overlay-ack-fold",
  "data-sim-overlay-foot-fold",
] as const;

interface SheetList {
  /** One entry per painted step, in order, tags stripped. */
  readonly lines: string[];
  /** The class of the element each line is painted in — the FACE. */
  readonly faces: string[];
}

function sheetList(html: string): SheetList | null {
  const inner = sheetScroller(html);
  if (inner === null) return null;
  const lead = /<h2 class="([^"]*)">([\s\S]*?)<\/h2>/.exec(inner);
  if (lead === null) return null;
  const body = /<p class="([^"]*)">([\s\S]*?)<\/p>/.exec(inner);
  const bodyLines = body === null ? [] : text(body[2]!).split("\n");
  return {
    lines: [text(lead[2]!), ...bodyLines],
    faces: [lead[1]!, ...bodyLines.map(() => body![1]!)],
  };
}

/** The list, or a failed ASSERTION saying there is none (never a TypeError). */
function listOnGlass(html: string, label: string): SheetList {
  const list = sheetList(html);
  expect(list, `${label}: no sheet list on the glass`).not.toBeNull();
  return list!;
}

/** The numbered sheet, exactly as authored: «1. …» … «N. …». */
const authoredSheet = (steps: readonly BriefingStepBg[]): string[] =>
  steps.map((s, i) => `${i + 1}. ${s.textBg}`);

const buttons = (html: string): string[] => html.match(/<button\b[\s\S]*?<\/button>/g) ?? [];

// ===========================================================================
// 1 · THE OPTED-IN ARRIVAL
// ===========================================================================

describe("opted in at arrival — the read sheet is up, the peek is not", () => {
  const { steps } = rung("sc-vu-emergency@L1");
  const html = markup(glass(arriveOnPhone(true), steps));

  it("PRECONDITION: the stored opt-in opens the briefing on a phone", () => {
    expect(briefingOpensAtStart(true, "on")).toBe(true);
    expect(briefingIsOpen(arriveOnPhone(true).start)).toBe(true);
  });

  it("the sheet is the surface: a modal dialog, and no peek beside or under it", () => {
    expect(sheetIsUp(html), "the briefing did not arrive as the read sheet").toBe(true);
    expect(peekIsUp(html), "the teaser peek is back on the glass").toBe(false);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('data-sim-overlay-sheet-only=""');
  });

  it("no «↓» counter, no «ПРОЧЕТИ», anywhere on the glass", () => {
    expect(chromeText(html)).not.toContain("↓");
    expect(text(html), "this lesson's own steps print no arrow").not.toContain("↓");
    for (const counter of FOLD_COUNTERS) expect(html).not.toContain(counter);
    expect(html).not.toMatch(/>\s*Прочети/);
    expect(html).not.toContain("aria-expanded");
  });

  it("ONE dismiss control — «Разбрах» — and no ✕ of either kind", () => {
    const all = buttons(html);
    expect(all.length, `the sheet paints ${all.length} buttons`).toBe(1);
    expect(text(all[0]!)).toBe("Разбрах");
    expect(html).not.toContain('aria-label="Затвори"');
    expect(html).not.toContain("Скрий известието");
    expect(html).not.toContain("data-hud-close");
  });

  it("that control is 36 px (ruling #4) and it is INSIDE the sheet", () => {
    const ack = buttons(html)[0]!;
    const cls = /class="([^"]*)"/.exec(ack)?.[1]?.split(/\s+/) ?? [];
    expect(cls, "the acknowledgement lost its 36 px height").toContain("h-9");
    expect(cls, "a vertical padding would grow it past 36 px").toContain("py-0");
    expect(cls).not.toContain("py-3");
    const section = html.indexOf('data-sim-overlay-sheet=""');
    expect(section).toBeGreaterThan(-1);
    expect(html.indexOf("<button")).toBeGreaterThan(section);
    expect(html.indexOf("<button")).toBeLessThan(html.indexOf("</section>"));
  });

  it("…and a 36 px box holds its own word and NOTHING else (round 2, F1)", () => {
    // A fixed height and a wrapping passenger cannot share a box: round 1 left
    // the fold cue inside this button and the glass sliced «Разбрах» through
    // its glyphs. The button's whole content is its label — no element child
    // that could wrap, on a sheet that fits and (§ 6) on one that does not.
    const ack = buttons(html)[0]!;
    expect(ack, "something rides inside the 36 px button again").toMatch(
      /^<button\b[^>]*>Разбрах<\/button>$/,
    );
    // It stands in the sheet's foot, alone and full width while nothing is folded.
    expect(html).toMatch(/<div data-sim-overlay-sheet-foot="" class="[^"]*"><button\b/);
    const cls = /class="([^"]*)"/.exec(ack)?.[1]?.split(/\s+/) ?? [];
    expect(cls).toContain("w-full");
    expect(cls, "a cue-less button gave half its row away").not.toContain("w-2/5");
  });
});

// ===========================================================================
// 2 · THE NUMBERING — 1.–N, N = the authored step count, in one face
// ===========================================================================

describe("every authored step is numbered 1.–N, whole, in one face", () => {
  const CASES: ReadonlyArray<[string, Rung, number]> = [
    ["sc-vu-emergency (the row)", rung("sc-vu-emergency@L1"), 5],
    ["sc-sig-controller-postures (the row)", rung("sc-sig-controller-postures@L1"), 5],
    ["the longest briefing by characters", LONGEST_BY_CHARS, 8],
    ["the briefing with the most steps", LONGEST_BY_STEPS, 11],
  ];

  it("PRECONDITION: the two extremes are the catalogue's, not this file's", () => {
    expect(LONGEST_BY_CHARS.id).toBe("sc-ov-crest-curve@L4");
    expect(Math.max(...RUNGS.map((r) => r.steps.length))).toBe(11);
  });

  it.each(CASES)("%s", (_label, r, n) => {
    expect(r.steps.length, `${r.id}: the authored step count moved`).toBe(n);
    const list = listOnGlass(markup(glass(arriveOnPhone(true), r.steps)), r.id);
    expect(list.lines).toEqual(authoredSheet(r.steps));
    expect(list.lines[0]!.startsWith("1. "), "the lead is unnumbered again").toBe(true);
    expect(list.lines).toHaveLength(n);
  });

  it("ONE face: the lead is painted as item 1, not as a headline over items 2…N", () => {
    const list = listOnGlass(
      markup(glass(arriveOnPhone(true), rung("sc-vu-emergency@L1").steps)),
      "sc-vu-emergency@L1",
    );
    const tokens = (cls: string) =>
      cls.split(/\s+/).filter((t) => /^(text-|font-|leading-)/.test(t)).sort();
    const lead = tokens(list.faces[0]!);
    for (const face of list.faces.slice(1)) expect(tokens(face)).toEqual(lead);
    expect(lead).not.toContain("font-extrabold");
    expect(lead).toContain("text-xs");
  });

  it("a one-step briefing is still the sheet, numbered «1.» (no body, no hole)", () => {
    const one: BriefingStepBg[] = [{ n: 1, textBg: "Само това." }];
    const html = markup(glass(arriveOnPhone(true), one));
    expect(sheetIsUp(html)).toBe(true);
    expect(listOnGlass(html, "one step").lines).toEqual(["1. Само това."]);
    expect(buttons(html)).toHaveLength(1);
  });

  it("no steps at all is no surface — the producer refuses an empty sheet", () => {
    expect(briefingSheetItem([])).toBeNull();
    expect(markup(glass(arriveOnPhone(true), []))).not.toContain("Инструкции");
  });
});

// ===========================================================================
// 3 · THE FREEZE — true while the sheet shows, false after «РАЗБРАХ»
// ===========================================================================

function computedStyleFor(node: unknown): { lineHeight: string; paddingBottom: string } {
  const n = node as { __lineHeight?: number; __paddingBottom?: number };
  return {
    lineHeight: n.__lineHeight === undefined ? "normal" : `${n.__lineHeight}px`,
    paddingBottom: n.__paddingBottom === undefined ? "0px" : `${n.__paddingBottom}px`,
  };
}

/** RUN the overlay over a live phone state, the way the shell's poll does. */
function runPhone(steps: readonly BriefingStepBg[], initial: Phone) {
  let phone = initial;
  const opened: boolean[] = [];
  const onAck = () => {
    phone = pressAck(phone);
  };
  const selection = () => selectOverlay([TASK, candidate(phone, steps, onAck)]);
  const mounted = mountHook(
    () =>
      SimOverlay({
        item: selection().active,
        queued: selection().queued,
        onOpenChange: (open: boolean) => opened.push(open),
      } as unknown as Parameters<typeof SimOverlay>[0]),
    { globals: { getComputedStyle: computedStyleFor } },
  );
  return {
    mounted,
    opened,
    selection,
    phone: () => phone,
    ackButton(tree: unknown = mounted.value) {
      const found = collectProps(tree, (_p, type) => type === "button");
      expect(found.length, "the sheet must paint exactly one button").toBe(1);
      return found[0] as { onClick: (e: { detail: number }) => void; children: unknown };
    },
  };
}

describe("the sim is frozen while the sheet shows, and released by «РАЗБРАХ»", () => {
  const { steps } = rung("sc-vu-emergency@L1");

  it("the queue's own answer: held while the sheet is the active item", () => {
    const up = glass(arriveOnPhone(true), steps);
    expect(up.active?.id).toBe("briefing");
    expect(overlaySheetHoldsDrive(up), "the car is free under an unread sheet").toBe(true);
    const down = glass(pressAck(arriveOnPhone(true)), steps);
    expect(down.active?.id).toBe("task:1/2");
    expect(overlaySheetHoldsDrive(down), "the car stays frozen after «Разбрах»").toBe(false);
  });

  it("…and nothing else on the glass holds it: a peek is not a pause", () => {
    for (const item of [TASK, BELT, VIOLATION, TEACH]) {
      expect(overlaySheetHoldsDrive(selectOverlay([item])), item.id).toBe(false);
    }
    expect(overlaySheetHoldsDrive(selectOverlay([]))).toBe(false);
  });

  it("RUN: the overlay reports the read mode from its first commit, and «РАЗБРАХ» ends it", () => {
    const run = runPhone(steps, arriveOnPhone(true));
    expect(run.opened, "the shell was never told the sheet is open").toEqual([true]);
    expect(overlaySheetHoldsDrive(run.selection())).toBe(true);

    run.ackButton().onClick({ detail: 0 });
    expect(briefingIsOpen(run.phone().start), "«Разбрах» did not reach the owner").toBe(false);
    expect(overlaySheetHoldsDrive(run.selection())).toBe(false);

    // The next poll: the owner no longer offers the briefing; the task line is
    // a peek again and the read mode is reported closed.
    const after = run.mounted.settle(1);
    expect(run.opened[run.opened.length - 1]).toBe(false);
    expect(collectProps(after, (p) => p["data-sim-overlay-state"] === "open")).toHaveLength(0);
    expect(collectProps(after, (p) => p["data-sim-overlay-state"] === "peek")).toHaveLength(1);
    run.mounted.unmount();
  });

  it("RUN: Escape is not a way AROUND the sheet — it is the same one exit", () => {
    const run = runPhone(steps, arriveOnPhone(true));
    const event = {
      key: "Escape",
      code: "Escape",
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    };
    run.mounted.window.dispatch("keydown", event);
    expect(briefingIsOpen(run.phone().start), "Escape left a sheet with no surface behind it").toBe(false);
    run.mounted.unmount();
  });
});

// ===========================================================================
// 4 · THE МЕНЮ ROUTE — the same sheet
// ===========================================================================

describe("МЕНЮ → «Инструкции · N стъпки» gives the same sheet", () => {
  const { steps } = rung("sc-sig-controller-postures@L1");

  it("byte for byte the arrival's sheet, frozen the same way", () => {
    const arrival = glass(arriveOnPhone(true), steps);
    const recalled = glass(menuRecall(arriveOnPhone(null)), steps);
    expect(markup(recalled)).toBe(markup(arrival));
    expect(sheetIsUp(markup(recalled))).toBe(true);
    expect(overlaySheetHoldsDrive(recalled)).toBe(true);
  });

  it("…as many times as the student asks, and «РАЗБРАХ» ends each one", () => {
    let phone = arriveOnPhone(null);
    for (let i = 0; i < 3; i += 1) {
      phone = menuRecall(phone);
      const up = glass(phone, steps);
      expect(listOnGlass(markup(up), `recall ${i + 1}`).lines).toEqual(authoredSheet(steps));
      expect(overlaySheetHoldsDrive(up)).toBe(true);
      phone = pressAck(phone);
      expect(overlaySheetHoldsDrive(glass(phone, steps))).toBe(false);
    }
  });

  it("after an opted-in arrival was read, the МЕНЮ still brings it back whole", () => {
    const phone = menuRecall(pressAck(arriveOnPhone(true)));
    expect(listOnGlass(markup(glass(phone, steps)), "re-recall").lines).toEqual(authoredSheet(steps));
  });
});

// ===========================================================================
// 5 · RULING #1 — NOT opted in: no briefing surface at arrival
// ===========================================================================

describe("ruling #1 pinned: the phone briefing is OFF by default", () => {
  const { steps } = rung("sc-vu-emergency@L1");

  it("the default is still `false` on compact", () => {
    expect(BRIEFING_AUTO_DEFAULT_COMPACT).toBe(false);
    expect(briefingOpensAtStart(true, null)).toBe(false);
  });

  it.each([
    ["nothing stored", null],
    ["a stored opt-OUT", false],
  ] as const)("%s → no sheet, no peek, no freeze — the road", (_label, stored) => {
    const phone = arriveOnPhone(stored);
    expect(candidate(phone, steps)).toBeNull();
    const alone = selectOverlay([candidate(phone, steps)]);
    expect(alone.active).toBeNull();
    expect(markup(alone)).toBe("");
    const withTask = glass(phone, steps);
    const html = markup(withTask);
    expect(sheetIsUp(html)).toBe(false);
    expect(html).not.toContain("Инструкции");
    expect(html).not.toContain(steps[0]!.textBg.slice(0, 24));
    expect(overlaySheetHoldsDrive(withTask)).toBe(false);
  });
});

// ===========================================================================
// 6 · IT CANNOT BE DRIVEN PAST UNREAD
// ===========================================================================

/**
 * A sheet scroller that does not fit: a 4-line lead and a body, sixteen 16.5 px
 * lines in view and `hiddenLines` more under the fold, plus the 10 px of
 * bottom padding every scroll window in this card carries (the fade's twin).
 */
function foldedSheetWindow(hiddenLines: number) {
  const LINE = 16.5;
  const PAD = 10;
  const rows = [
    { top: 0, height: 4 * LINE },
    { top: 4 * LINE, height: (12 + hiddenLines) * LINE },
  ];
  const el = {
    scrollTop: 0,
    clientHeight: 16 * LINE,
    scrollHeight: (16 + hiddenLines) * LINE + PAD,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 646, height: 16 * LINE }),
    children: rows.map((r) => ({
      getBoundingClientRect: () => ({
        top: r.top - el.scrollTop,
        left: 0,
        width: 646,
        height: r.height,
      }),
      getAttribute: () => null,
      __lineHeight: LINE,
    })),
    __paddingBottom: PAD,
    scrolledTo: [] as number[],
    scrollTo({ top }: { top: number }) {
      el.scrolledTo.push(top);
      el.scrollTop = top;
    },
  };
  return el;
}

describe("the opted-in briefing can no longer be driven past unread", () => {
  const { steps } = rung("sc-vu-emergency@L1");

  it("a card that outranks its KIND does not take the glass from it", () => {
    // The w79 mechanism one level down: the briefing is a `hint` (60); an armed
    // telltale is 70, a graded fault 80, a teach moment 90. Priority alone used
    // to hand them the slot and leave the car free under an unread briefing.
    for (const rival of [BELT, VIOLATION, TEACH]) {
      const sel = selectOverlay([rival, TASK, candidate(arriveOnPhone(true), steps)]);
      expect(sel.active?.id, `${rival.kind} took the slot from the sheet`).toBe("briefing");
      expect(overlaySheetHoldsDrive(sel), rival.kind).toBe(true);
      expect(sel.waiting.map((w) => w.id)).toContain(rival.id);
    }
  });

  it("…in either caller order — the answer is not an accident of the list", () => {
    const item = candidate(arriveOnPhone(true), steps);
    expect(selectOverlay([item, VIOLATION]).active?.id).toBe("briefing");
    expect(selectOverlay([VIOLATION, item]).active?.id).toBe("briefing");
  });

  it("…and once it is read, priority is exactly what it was", () => {
    const sel = selectOverlay([BELT, VIOLATION, TASK, candidate(pressAck(arriveOnPhone(true)), steps)]);
    expect(sel.active?.id).toBe("toast:7");
    expect(sel.queued).toBe(1);
  });

  it("the drive is held on EVERY poll until «РАЗБРАХ», whatever else arrives", () => {
    let phone = arriveOnPhone(true);
    const arrivals: SimOverlayItem[][] = [[TASK], [BELT, TASK], [VIOLATION, BELT], [TEACH], []];
    for (const others of arrivals) {
      expect(overlaySheetHoldsDrive(glass(phone, steps, others))).toBe(true);
    }
    phone = pressAck(phone);
    for (const others of arrivals) {
      expect(overlaySheetHoldsDrive(glass(phone, steps, others))).toBe(false);
    }
  });

  it("RUN: «РАЗБРАХ» cannot delete lines the student has not seen — it reveals first", () => {
    const run = runPhone(steps, arriveOnPhone(true));
    const el = foldedSheetWindow(3);
    const scroller = collectProps(run.mounted.value, (p) => "data-sim-overlay-sheet-text" in p);
    expect(scroller).toHaveLength(1);
    (scroller[0]!.ref as { current: unknown }).current = el;
    run.mounted.settle(1);
    run.mounted.observers.forEach((o) => o.fire());
    const tree = run.mounted.rerender();

    // THEO-4: the sheet SAYS it scrolls — and says what the one control that
    // ends it will do on this press, in words: «„Разбрах“ първо превърта до края».
    const cue = collectProps(tree, (p) => "data-sim-overlay-foot-fold" in p);
    expect(cue, "a sheet that does not fit must say so").toHaveLength(1);
    const said = text(renderToStaticMarkup(<>{cue[0]!.children as never}</>));
    expect(said).toBe("↓ още 3 реда — „Разбрах“ първо превърта до края");
    expect(said).toBe(sheetFootFoldBg(3, "Разбрах"));
    expect(cue[0]!["aria-hidden"], "the button's accessible name is «Разбрах», no count").toBe(true);

    // ROUND 2 · F1 — THE CUE HAS ITS OWN BOX. The refuted frame was this cue
    // inside a 36 px button (2–3 wrapped lines, 44–54 px of content): «Разбрах»
    // sliced, «ПОКАЖИ» under the section's clip. It is a SIBLING of the button
    // now, in the sheet's foot, and the button holds its label alone.
    const foot = collectProps(tree, (p) => "data-sim-overlay-sheet-foot" in p);
    expect(foot, "the sheet has no foot to stand the cue in").toHaveLength(1);
    expect(collectProps(foot[0]!.children, (p) => "data-sim-overlay-foot-fold" in p)).toHaveLength(1);
    expect(collectProps(foot[0]!.children, (_p, type) => type === "button")).toHaveLength(1);
    const folded = run.ackButton(tree) as unknown as { className: string; children: unknown };
    expect(folded.children, "the cue is back INSIDE the 36 px button").toBe("Разбрах");
    expect(
      collectProps(folded.children, (p) => "data-sim-overlay-foot-fold" in p || "data-sim-overlay-ack-fold" in p),
    ).toHaveLength(0);
    const cls = folded.className.split(/\s+/);
    expect(cls, "a folded sheet grew its button past 36 px").toEqual(expect.arrayContaining(["h-9", "py-0"]));
    expect(cls).not.toContain("py-3");
    // Upright it gives the cue 3/5 of the row; in the landscape rail it is the rail's width.
    expect(cls).toEqual(expect.arrayContaining(["w-2/5", "landscape:w-full"]));
    // Its ink is the sheet's tone, not the accent fill's foreground (dark on dark).
    expect(cue[0]!.style, "the cue lost its own ink").toEqual({ color: "var(--accent)" });
    // ONE count per surface: neither the 44 px button's cue nor the header's copy.
    expect(collectProps(tree, (p) => "data-sim-overlay-ack-fold" in p)).toHaveLength(0);
    expect(collectProps(tree, (p) => "data-sim-overlay-sheet-fold" in p)).toHaveLength(0);

    run.ackButton(tree).onClick({ detail: 0 });
    expect(el.scrolledTo, "the first press must reveal, not dismiss").toEqual([3 * 16.5 + 10]);
    expect(briefingIsOpen(run.phone().start)).toBe(true);
    expect(overlaySheetHoldsDrive(run.selection())).toBe(true);

    // The scroll reached the end, the window re-measured: the cue is GONE on
    // the frame where the next press acknowledges, and the button that is left
    // says only «Разбрах» — full width again, still 36 px.
    run.mounted.observers.forEach((o) => o.fire());
    const revealed = run.mounted.rerender();
    expect(
      collectProps(revealed, (p) => "data-sim-overlay-foot-fold" in p),
      "the cue still promises a scroll that has already happened",
    ).toHaveLength(0);
    const alone = run.ackButton(revealed) as unknown as { className: string; children: unknown };
    expect(alone.children).toBe("Разбрах");
    expect(alone.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-9", "py-0", "w-full"]));
    expect(alone.className.split(/\s+/)).not.toContain("w-2/5");

    run.ackButton(revealed).onClick({ detail: 0 });
    expect(briefingIsOpen(run.phone().start)).toBe(false);
    run.mounted.unmount();
  });

  it("the cue's sentence: the count, its agreement, and the button it names", () => {
    expect(sheetFootFoldBg(1, "Разбрах")).toBe("↓ още 1 ред — „Разбрах“ първо превърта до края");
    expect(sheetFootFoldBg(2, "Разбрах")).toBe("↓ още 2 реда — „Разбрах“ първо превърта до края");
    expect(sheetFootFoldBg(17, "Разбрах")).toBe("↓ още 17 реда — „Разбрах“ първо превърта до края");
    // It QUOTES the label the button prints; it does not retype one.
    expect(sheetFootFoldBg(2, "Продължи")).toContain("„Продължи“");
    expect(sheetFootFoldBg(2, "Продължи")).not.toContain("Разбрах");
  });
});

// ===========================================================================
// 6b · EVERY OTHER SHEET KEEPS WHAT IT HAD — 44 px, its ✕, its cue in the button
// ===========================================================================

/**
 * ROUND 2 · the two mutants that walked through round 1's suite: «every
 * blocking sheet shrinks to 36 px» and «the ✕ is gone from EVERY sheet». Both
 * were true statements about the briefing sheet applied to sheets that are not
 * it, and nothing committed held the difference — the identity census that
 * would have was a temporary file.
 *
 * A tap-opened sheet is reached by a TAP, so this runs the component: mount
 * the peek, press its open control, read the sheet that comes up.
 */
function openByTap(item: SimOverlayItem) {
  const mounted = mountHook(
    () => SimOverlay({ item, queued: 0 } as unknown as Parameters<typeof SimOverlay>[0]),
    { globals: { getComputedStyle: computedStyleFor } },
  );
  const opener = collectProps(mounted.value, (p, type) => type === "button" && "aria-expanded" in p);
  expect(opener, `${item.id}: the peek paints no control that opens its sheet`).toHaveLength(1);
  expect(collectProps(mounted.value, (p) => p["data-sim-overlay-state"] === "open")).toHaveLength(0);
  (opener[0] as unknown as { onClick: (e: { detail: number }) => void }).onClick({ detail: 0 });
  const tree = mounted.rerender();
  const sheet = collectProps(tree, (p) => p["data-sim-overlay-state"] === "open");
  expect(sheet, `${item.id}: the tap did not open the sheet`).toHaveLength(1);
  const all = collectProps(sheet[0]!.children, (_p, type) => type === "button") as Array<{
    className: string;
    children: unknown;
    "aria-label"?: string;
  }>;
  return {
    mounted,
    tree,
    sheet: sheet[0]!,
    close: all.filter((b) => b["aria-label"] === "Затвори"),
    acks: all.filter((b) => b["aria-label"] === undefined),
  };
}

describe("a sheet a TAP opened keeps its 44 px button and its ✕ (the briefing's 36 px is its own)", () => {
  /** `.btn-accent`'s own `py-3` over a 20 px `text-sm` line: 12 + 20 + 12 = 44. */
  const ACK_44 =
    "btn-accent w-full shrink-0 justify-center py-3 text-sm landscape:flex-col landscape:gap-1 landscape:px-2";

  it("a BLOCKING teach moment: ✕ «Затвори» and a 44 px «Разбрах» — not the briefing's 36", () => {
    const up = openByTap(TEACH);
    expect(up.sheet["data-sim-overlay-sheet-only"], "a tap-opened sheet claims to be sheet-only").toBeUndefined();
    expect(up.close, "the teach sheet lost its ✕").toHaveLength(1);
    expect(up.acks, "the teach sheet must paint exactly one acknowledgement").toHaveLength(1);
    const cls = up.acks[0]!.className.split(/\s+/);
    expect(cls, "the teach sheet's «Разбрах» lost its 44 px (py-3)").toContain("py-3");
    expect(cls, "the briefing's 36 px leaked onto a teach sheet").not.toContain("h-9");
    expect(cls).not.toContain("py-0");
    expect(up.acks[0]!.className, "every other blocking sheet is byte-identical").toBe(ACK_44);
    // …and it has no foot: the foot is the briefing sheet's.
    expect(collectProps(up.tree, (p) => "data-sim-overlay-sheet-foot" in p)).toHaveLength(0);
    up.mounted.unmount();
  });

  it("…and when THAT sheet folds, its cue rides inside its 44 px button, in the old words", () => {
    const up = openByTap(TEACH);
    const el = foldedSheetWindow(2);
    const scroller = collectProps(up.tree, (p) => "data-sim-overlay-sheet-text" in p);
    expect(scroller).toHaveLength(1);
    (scroller[0]!.ref as { current: unknown }).current = el;
    up.mounted.settle(1);
    up.mounted.observers.forEach((o) => o.fire());
    const tree = up.mounted.rerender();
    const ack = collectProps(tree, (p, type) => type === "button" && p["aria-label"] === undefined && !("aria-expanded" in p));
    expect(ack).toHaveLength(1);
    const inside = collectProps(ack[0]!.children, (p) => "data-sim-overlay-ack-fold" in p);
    expect(inside, "the 44 px button lost the cue it has room for").toHaveLength(1);
    expect(text(renderToStaticMarkup(<>{inside[0]!.children as never}</>))).toBe("↓ още 2 реда — покажи");
    expect(collectProps(tree, (p) => "data-sim-overlay-foot-fold" in p)).toHaveLength(0);
    expect((ack[0] as unknown as { className: string }).className).toBe(ACK_44);
    up.mounted.unmount();
  });

  it("a NON-blocking violation's «Защо» sheet: the ✕ is its ONLY control — it must be there", () => {
    const up = openByTap(VIOLATION);
    expect(up.close, "a tap-opened sheet with no ✕ has no control at all on a phone").toHaveLength(1);
    expect(up.acks).toHaveLength(0);
    expect(up.close[0]!.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]));
    up.mounted.unmount();
  });

  it("…while the briefing sheet, RUN the same way, has neither: 36 px, no ✕", () => {
    const run = runPhone(rung("sc-vu-emergency@L1").steps, arriveOnPhone(true));
    const sheet = collectProps(run.mounted.value, (p) => p["data-sim-overlay-state"] === "open");
    expect(sheet).toHaveLength(1);
    expect(sheet[0]!["data-sim-overlay-sheet-only"]).toBe("");
    const all = collectProps(sheet[0]!.children, (_p, type) => type === "button") as Array<{
      className: string;
      "aria-label"?: string;
    }>;
    expect(all.map((b) => b["aria-label"])).toEqual([undefined]);
    expect(all[0]!.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-9", "py-0"]));
    expect(all[0]!.className).not.toBe(ACK_44);
    run.mounted.unmount();
  });
});

// ===========================================================================
// 7 · THE CENSUS — every lesson's briefing through the phone queue, opted in
// ===========================================================================

describe("CENSUS: every rung of every template, opted in, through the phone queue", () => {
  it("the census is the whole catalogue (pinned, so a shrunken corpus cannot pass)", () => {
    expect(SCENARIO_TEMPLATES.length).toBe(167);
    expect(RUNGS.length).toBe(808);
    expect(RUNGS.filter((r) => r.steps.length === 0)).toEqual([]);
  });

  it("sheet shown · numbered 1.–N · N = the authored count · one «Разбрах» · held", () => {
    const failures: string[] = [];
    const phone = arriveOnPhone(true);
    for (const r of RUNGS) {
      const sel = selectOverlay([BELT, TASK, candidate(phone, r.steps)]);
      const html = markup(sel);
      const list = sheetList(html);
      const want = authoredSheet(r.steps);
      if (!sheetIsUp(html)) failures.push(`${r.id}: no sheet`);
      if (peekIsUp(html)) failures.push(`${r.id}: a peek is on the glass`);
      if (list === null) failures.push(`${r.id}: no list`);
      else {
        if (list.lines.length !== r.steps.length) {
          failures.push(`${r.id}: N=${list.lines.length}, authored ${r.steps.length}`);
        }
        list.lines.forEach((line, i) => {
          if (line !== want[i]) failures.push(`${r.id}: line ${i + 1} is not authored step ${i + 1}`);
        });
      }
      if (chromeText(html).includes("↓") || FOLD_COUNTERS.some((c) => html.includes(c))) {
        failures.push(`${r.id}: a «↓» counter`);
      }
      const all = buttons(html);
      if (all.length !== 1 || text(all[0]!) !== "Разбрах") failures.push(`${r.id}: controls`);
      if (!overlaySheetHoldsDrive(sel)) failures.push(`${r.id}: not held`);
    }
    expect(failures, failures.slice(0, 20).join("\n")).toEqual([]);
  });

  it("…and the «↓» ban did not cost a lesson its own arrow", () => {
    // The counter check above reads the chrome only. This is the other half: the
    // one template whose STEPS print the glyph still prints it, on the sheet.
    const withArrow = RUNGS.filter((r) => r.steps.some((s) => s.textBg.includes("↓")));
    expect(withArrow.map((r) => r.id)).toEqual([
      "sc-lane-control-signal@L1",
      "sc-lane-control-signal@L2",
      "sc-lane-control-signal@L3",
    ]);
    for (const r of withArrow) {
      const html = markup(glass(arriveOnPhone(true), r.steps));
      expect(listOnGlass(html, r.id).lines.join(" ")).toContain("↓");
      expect(chromeText(html)).not.toContain("↓");
    }
  });

  it("the authored numbers ARE 1…N on every rung (so «N.» on the glass is the author's)", () => {
    const off = RUNGS.filter((r) => r.steps.some((s, i) => s.n !== i + 1)).map((r) => r.id);
    expect(off).toEqual([]);
  });
});

// ===========================================================================
// 8 · WHEN IT DOES NOT FIT — it scrolls INSIDE, and one press shows the rest
// ===========================================================================

/**
 * `sheetLayout.ts`'s model: conservative by construction (it never predicts
 * fewer lines than the glass painted — `sheet-layout.test.ts` § 1), so every
 * «fits» below has slack and every «overflows» is an upper bound.
 *
 * PORTRAIT IS CHARGED MORE THAN THIS SHEET SPENDS: the stacked model prices the
 * 44 px ✕ row and a 44 px «Разбрах», and this sheet has no ✕ and a 36 px
 * button. That is the safe direction for a fit; it is NOT a glass measurement,
 * and none is claimed here.
 */
const PHONES: Record<string, SheetViewport> = {
  "852x393 (iPhone 16, the w79 lens)": { width: 852, height: 393, safeArea: { top: 0, right: 59, bottom: 21, left: 59 } },
  "780x360 (smallest landscape)": { width: 780, height: 360, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
  "393x852 (iPhone 16 upright)": { width: 393, height: 852, safeArea: { top: 59, right: 0, bottom: 34, left: 0 } },
  "360x780 (smallest upright)": { width: 360, height: 780, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
};

describe("the longest briefings against the sheet's box", () => {
  const fitOf = (vp: SheetViewport, r: Rung) => sheetFitsWhole(vp, authoredSheet(r.steps), true);

  it("the two rows fit whole at 852 × 393 — the frame the capture measured", () => {
    const vp = PHONES["852x393 (iPhone 16, the w79 lens)"]!;
    for (const id of ["sc-vu-emergency@L1", "sc-sig-controller-postures@L1"]) {
      const fit = fitOf(vp, rung(id));
      expect(fit.fits, `${id}: ${fit.textPx} px in ${fit.windowPx} px`).toBe(true);
    }
  });

  it("MEASURED: how many rungs the model cannot certify, per phone (an upper bound)", () => {
    const measured = Object.fromEntries(
      Object.entries(PHONES).map(([name, vp]) => {
        const over = RUNGS.map((r) => fitOf(vp, r)).filter((f) => !f.fits);
        const worst = Math.max(0, ...over.map((f) => f.textPx - f.windowPx));
        return [name, { overflowing: over.length, worstHiddenPx: worst }];
      }),
    );
    expect(measured).toEqual({
      "852x393 (iPhone 16, the w79 lens)": { overflowing: 13, worstHiddenPx: 72 },
      "780x360 (smallest landscape)": { overflowing: 25, worstHiddenPx: 55.5 },
      "393x852 (iPhone 16 upright)": { overflowing: 0, worstHiddenPx: 0 },
      "360x780 (smallest upright)": { overflowing: 2, worstHiddenPx: 53 },
    });
  });

  it("the longest briefing in the catalogue is among them — so the scroll path is live", () => {
    const fit = fitOf(PHONES["852x393 (iPhone 16, the w79 lens)"]!, LONGEST_BY_CHARS);
    expect(fit.fits).toBe(false);
    expect(fit.textPx).toBe(396);
    expect(fit.windowPx).toBe(324);
  });

  it("NOTHING hides more than one window: the press that scrolls to the end skips no unread line", () => {
    // `tapSheetAck` scrolls to the END. That is only honest while what is under
    // the fold is shorter than the window — otherwise the press would skip a
    // middle the student never saw. Held for every rung on every phone.
    const skipped: string[] = [];
    for (const [name, vp] of Object.entries(PHONES)) {
      for (const r of RUNGS) {
        const fit = fitOf(vp, r);
        if (fit.textPx - fit.windowPx >= fit.windowPx) skipped.push(`${r.id} on ${name}`);
      }
    }
    expect(skipped).toEqual([]);
  });
});

// ===========================================================================
// 9 · THE SHELL WIRES IT — and what only served the peek is gone
// ===========================================================================

describe("the shell wires it (source-pinned: the shell cannot be rendered in node)", () => {
  const SHELL = readFileSync(
    resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
    "utf8",
  );
  const CODE = SHELL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("the comment remover removes comments", () => {
    expect(SHELL).toContain("THE READ MODE STOPS THE CAR");
    expect(CODE).not.toContain("THE READ MODE STOPS THE CAR");
    expect(CODE).toContain("const overlay = selectOverlay(");
  });

  it("the phone's candidate IS the producer this file executes, behind the same gate", () => {
    expect(CODE).toMatch(
      /briefingOpen && briefing\.length > 0 && !mistakeMode && !ended\s*\?\s*briefingSheetItem\(briefing, closeBriefing\)\s*:\s*null,/,
    );
    expect(CODE.match(/briefingSheetItem\(/g) ?? []).toHaveLength(1);
    expect(CODE, "a second, hand-built briefing item is back in the shell").not.toContain(
      'id: "briefing",',
    );
  });

  it("the queue is compact-only, so the roomy stage never sees this item", () => {
    expect(CODE).toMatch(/const overlayCandidates: \(SimOverlayItem \| null\)\[\] = !compact \|\| pauseModalUp\s*\?\s*\[\]/);
  });

  it("the car is frozen by the SELECTION, on the commit that paints the sheet", () => {
    const at = CODE.indexOf("paused={");
    expect(at, "unresolved: the scene's `paused` prop").toBeGreaterThan(-1);
    const paused = CODE.slice(at, CODE.indexOf("driveLocked=", at));
    expect(paused).toContain("overlaySheetOpen ||");
    expect(paused, "the freeze waits for an effect round-trip again").toContain(
      "overlaySheetHoldsDrive(overlay) ||",
    );
    expect(paused).toContain("playMenuOpen");
  });

  it("the МЕНЮ row and the stored opt-in are the two routes, unchanged", () => {
    expect(CODE).toMatch(/key: "briefing",[\s\S]{0,600}?onSelect: recallBriefing/);
    expect(CODE).toMatch(/key: "briefingAuto"[\s\S]{0,400}?onSelect: toggleBriefingAutoOpen/);
    const at = CODE.indexOf("const recallBriefing = useCallback");
    expect(at).toBeGreaterThan(-1);
    expect(CODE.slice(at, at + 300)).toContain('dispatchBriefingStart({ type: "recall" })');
  });

  it("DELETED: the peek's mid-drive stand-down, which would take an unread sheet away", () => {
    // `compactBriefingFold` folded the phone's item the first time the cluster
    // read above walking pace. Under a sheet that freezes the car it could only
    // ever fire on a lesson that SPAWNS moving — and there it would remove the
    // sheet, and with it the freeze, before the student had read a word.
    expect(CODE).not.toContain("compactBriefingFold");
    expect(CODE).not.toContain("!briefingFold.folded && briefing.length");
  });

  it("DELETED: the recalled peek's non-blocking latch and its ✕ undo", () => {
    expect(CODE).not.toContain("briefingRecalled");
    expect(CODE).not.toContain("setBriefingRecalled");
    const at = CODE.indexOf("const recallBriefing = useCallback");
    const body = CODE.slice(at, CODE.indexOf("}, [", at));
    expect(body).not.toContain("setDismissedOverlayIds");
    expect(body).not.toContain("reofferOverlay");
  });
});

// ===========================================================================
// 10 · THE SHELL'S OWN CODE, EXECUTED — not spelled
// ===========================================================================

/**
 * ROUND 2 · WHY § 9 WAS NOT ENOUGH. Two mutants of `LessonPlayShell.tsx` walked
 * through every pin above:
 *
 *   V3  paused={ … ((false as boolean) && (overlaySheetHoldsDrive(overlay) || true)) || … }
 *       — the term § 9 greps for is still spelled; it can no longer be true.
 *   V4  const briefing = (lesson.briefingBg ?? []).slice(1);
 *       — the producer § 7 executes is still the one called; it is handed N−1
 *       steps, so the PRODUCT opens at «2.» — the very defect of the row.
 *
 * A pin on text holds text. The shell cannot be rendered in node (it mounts a
 * WebGL scene), but the statements that carry the briefing from the lesson to
 * the scene's `paused` prop are plain expressions over a handful of names. So
 * this block PARSES the shell (the TypeScript compiler, the same one that
 * builds it), lifts those statements out by what they ARE — the declaration
 * named `briefing`, the `paused` attribute of `<SceneSlot>` — and RUNS them,
 * with the real start machine, the real producer, the real queue and the real
 * `SimOverlay` on either side. What is asserted is what the shell's code
 * computes, so a mutant has to change the answer to change the text.
 *
 * AN IDENTIFIER THIS BLOCK DOES NOT KNOW IS A RED TEST, NOT A DEFAULT. If the
 * shell's expression starts reading a name the scope below does not supply, the
 * run reports «unresolved» by name instead of quietly evaluating `undefined`.
 *
 * WHAT IT STILL IS NOT: a drive. It executes the shell's expressions, not the
 * shell — React's scheduling, the scene's use of `paused`, and the pedals are
 * outside it. The pose delta under throttle on the built app is owed to a
 * device capture and is not claimed here.
 */
describe("the shell's own statements, executed: lesson → item → sheet → paused", () => {
  const SHELL_PATH = resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx");
  const SHELL = readFileSync(SHELL_PATH, "utf8");
  const SF = ts.createSourceFile("LessonPlayShell.tsx", SHELL, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);

  const walk = (node: ts.Node, visit: (n: ts.Node) => void): void => {
    visit(node);
    node.forEachChild((child) => walk(child, visit));
  };
  const inShell = (node: ts.Node): boolean => {
    for (let at: ts.Node | undefined = node.parent; at !== undefined; at = at.parent) {
      if (ts.isFunctionDeclaration(at) && at.name !== undefined) return at.name.text === "LessonPlayShell";
    }
    return false;
  };

  /** The initialiser of `const <name> = …` in the shell component. Exactly one. */
  function declared(name: string): ts.Expression {
    const found: ts.Expression[] = [];
    walk(SF, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === name &&
        n.initializer !== undefined &&
        inShell(n)
      ) {
        found.push(n.initializer);
      }
    });
    expect(found.length, `unresolved: the shell declares \`${name}\` ${found.length} times`).toBe(1);
    return found[0]!;
  }

  /** The expression in `<SceneSlot paused={…} />`. Exactly one. */
  function scenePaused(): ts.Expression {
    const found: ts.Expression[] = [];
    walk(SF, (n) => {
      if (
        ts.isJsxAttribute(n) &&
        n.name.getText(SF) === "paused" &&
        ts.isJsxSelfClosingElement(n.parent.parent) &&
        n.parent.parent.tagName.getText(SF) === "SceneSlot" &&
        n.initializer !== undefined &&
        ts.isJsxExpression(n.initializer) &&
        n.initializer.expression !== undefined
      ) {
        found.push(n.initializer.expression);
      }
    });
    expect(found.length, `unresolved: <SceneSlot paused={…}> found ${found.length} times`).toBe(1);
    return found[0]!;
  }

  /** The phone's briefing candidate: the one element of `overlayCandidates` that calls the producer. */
  function briefingCandidate(): ts.Expression {
    const found: ts.Expression[] = [];
    walk(declared("overlayCandidates"), (n) => {
      if (ts.isArrayLiteralExpression(n)) {
        for (const element of n.elements) {
          if (element.getText(SF).includes("briefingSheetItem(")) found.push(element);
        }
      }
    });
    expect(found.length, `unresolved: ${found.length} overlay candidates call briefingSheetItem`).toBe(1);
    return found[0]!;
  }

  /**
   * RUN source text as an expression against a scope of NAMED values. Type
   * syntax is stripped by the compiler; nothing else is rewritten.
   */
  function runText(source: string, scope: Record<string, unknown>, label: string): unknown {
    const js = ts.transpileModule(`__out(${source});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const unresolved: string[] = [];
    const proxy = new Proxy(scope, {
      has: (_t, key) => typeof key === "string" && key !== "__out",
      get: (target, key) => {
        if (typeof key !== "string") return undefined;
        if (key in target) return target[key];
        if (key === "undefined") return undefined;
        unresolved.push(key);
        return undefined;
      },
    });
    let out: unknown;
    let thrown: string | null = null;
    try {
      // A sloppy-mode function on purpose: `with` is what lets the shell's own
      // free identifiers resolve against the scope without rewriting them.
      new Function("__scope", "__out", `with (__scope) { ${js} }`)(proxy, (value: unknown) => {
        out = value;
      });
    } catch (error) {
      thrown = String(error);
    }
    expect(unresolved, `unresolved: the shell's \`${label}\` reads names this test does not supply`).toEqual([]);
    expect(thrown, `the shell's \`${label}\` did not run`).toBeNull();
    return out;
  }
  const run = (expr: ts.Expression, scope: Record<string, unknown>, label: string): unknown =>
    runText(expr.getText(SF), scope, label);

  /** A phone session over the shell's own code. */
  function shell(steps: readonly BriefingStepBg[], stored: boolean | null) {
    let start = arriveOnPhone(stored).start;
    const dispatchBriefingStart = (event: Parameters<typeof briefingStartReducer>[1]) => {
      start = briefingStartReducer(start, event);
    };
    const useCallback = <T,>(fn: T): T => fn;
    // `const briefing = lesson.briefingBg ?? [];` — the lesson is the compiled rung.
    const briefing = run(declared("briefing"), { lesson: { briefingBg: steps } }, "briefing");
    const closeBriefing = run(declared("closeBriefing"), { useCallback, dispatchBriefingStart }, "closeBriefing");
    const recallBriefing = run(
      declared("recallBriefing"),
      { useCallback, dispatchBriefingStart, setBriefingFold: () => undefined },
      "recallBriefing",
    ) as () => void;

    /** One render of the shell, on a phone, mid-lesson, with a task line competing. */
    const render = (other: { playMenuOpen?: boolean } = {}) => {
      const briefingOpen = run(declared("briefingOpen"), { briefingIsOpen, briefingStart: start }, "briefingOpen");
      const candidate4c = run(
        briefingCandidate(),
        { briefingOpen, briefing, mistakeMode: false, ended: false, briefingSheetItem, closeBriefing },
        "overlayCandidates[briefing]",
      ) as SimOverlayItem | null;
      const overlay = run(
        declared("overlay"),
        { selectOverlay, dismissedOverlayIds: new Set<string>(), overlayCandidates: [TASK, candidate4c] },
        "overlay",
      ) as OverlaySelection;
      const paused = run(
        scenePaused(),
        {
          ended: false,
          activeQuiz: null,
          teachQueue: [],
          consequence: null,
          overlaySheetOpen: false,
          overlaySheetHoldsDrive,
          overlay,
          playMenuOpen: other.playMenuOpen ?? false,
        },
        "paused",
      );
      return { candidate4c, overlay, paused };
    };
    return { render, recallBriefing, isOpen: () => briefingIsOpen(start) };
  }

  /** «Разбрах», pressed on the sheet `SimOverlay` paints for the shell's selection. */
  function pressRazbrah(overlay: OverlaySelection): void {
    const mounted = mountHook(
      () =>
        SimOverlay({ item: overlay.active, queued: overlay.queued } as unknown as Parameters<typeof SimOverlay>[0]),
      { globals: { getComputedStyle: computedStyleFor } },
    );
    const found = collectProps(mounted.value, (_p, type) => type === "button");
    expect(found.length, "the sheet must paint exactly one button").toBe(1);
    expect(found[0]!.children).toBe("Разбрах");
    (found[0] as unknown as { onClick: (e: { detail: number }) => void }).onClick({ detail: 0 });
    mounted.unmount();
  }

  const NAMED: ReadonlyArray<[string, Rung, number]> = [
    ["sc-vu-emergency (the row)", rung("sc-vu-emergency@L1"), 5],
    ["sc-sig-controller-postures (the row)", rung("sc-sig-controller-postures@L1"), 5],
    ["the longest briefing in the catalogue", LONGEST_BY_CHARS, 8],
  ];

  it("the seams resolve: six declarations, one candidate, one `paused`", () => {
    for (const name of ["briefing", "briefingOpen", "closeBriefing", "recallBriefing", "overlayCandidates", "overlay"]) {
      declared(name);
    }
    briefingCandidate();
    scenePaused();
  });

  it("the runner runs what it is given — and a dead term or a sliced list changes its answer", () => {
    expect(runText("a || (b as boolean)", { a: false, b: true }, "probe")).toBe(true);
    // The two round-1 survivors, in miniature: the runner EXECUTES them.
    expect(
      runText("((false as boolean) && (f(x) || true)) || a", { a: false, f: () => true, x: 1 }, "probe"),
    ).toBe(false);
    expect(runText("(xs ?? []).slice(1)", { xs: [1, 2, 3] }, "probe")).toEqual([2, 3]);
  });

  it.each(NAMED)("%s — the item the SHELL builds carries all N authored steps, from «1.»", (_label, r, n) => {
    expect(r.steps.length, `${r.id}: the authored step count moved`).toBe(n);
    const { candidate4c, overlay } = shell(r.steps, true).render();
    expect(candidate4c, `${r.id}: the shell queued no briefing for an opted-in phone`).not.toBeNull();
    expect(overlay.active?.id, `${r.id}: the shell's selection is not the briefing`).toBe("briefing");
    const list = listOnGlass(markup(overlay), r.id);
    expect(list.lines.length, `${r.id}: the shell's sheet shows ${list.lines.length} of ${n} steps`).toBe(n);
    expect(list.lines[0], `${r.id}: the shell's sheet does not open at step 1`).toBe(`1. ${r.steps[0]!.textBg}`);
    expect(list.lines).toEqual(authoredSheet(r.steps));
  });

  it.each(NAMED)("%s — `paused` is TRUE while that sheet is the active item, FALSE after «Разбрах»", (_label, r) => {
    const session = shell(r.steps, true);
    const up = session.render();
    expect(up.overlay.active?.sheetOnly, `${r.id}: the active item is not the sheet`).toBe(true);
    expect(up.paused, `${r.id}: the shell leaves the car free under the unread sheet`).toBe(true);

    pressRazbrah(up.overlay);
    expect(session.isOpen(), "«Разбрах» did not reach the shell's closeBriefing").toBe(false);
    const down = session.render();
    expect(down.candidate4c).toBeNull();
    expect(down.overlay.active?.id).toBe("task:1/2");
    expect(down.paused, `${r.id}: the shell keeps the car frozen after «Разбрах»`).toBe(false);
  });

  it("МЕНЮ → «Инструкции»: the shell's own recall brings the same sheet and the same freeze", () => {
    const r = rung("sc-sig-controller-postures@L1");
    const session = shell(r.steps, null);
    const road = session.render();
    expect(road.candidate4c, "ruling #1: nothing stored, and the shell queued a briefing").toBeNull();
    expect(road.paused, "ruling #1: the default-off arrival is frozen").toBe(false);

    session.recallBriefing();
    const up = session.render();
    expect(listOnGlass(markup(up.overlay), r.id).lines).toEqual(authoredSheet(r.steps));
    expect(up.paused, "the recalled sheet does not hold the car").toBe(true);
    expect(markup(up.overlay)).toBe(markup(shell(r.steps, true).render().overlay));

    pressRazbrah(up.overlay);
    expect(session.render().paused, "the car stays frozen after the recalled sheet is read").toBe(false);
  });

  it("…and the sheet's term is not the only one alive: the other owners of `paused` still pause", () => {
    // With no sheet, `paused` must follow its other owners — otherwise «false
    // after Разбрах» above could be satisfied by an expression that is never true.
    const session = shell(rung("sc-vu-emergency@L1").steps, null);
    expect(session.render().paused).toBe(false);
    expect(session.render({ playMenuOpen: true }).paused, "МЕНЮ no longer pauses the scene").toBe(true);
  });
});
