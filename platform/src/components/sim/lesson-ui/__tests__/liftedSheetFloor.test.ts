import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIFTED_SHEET_FLOOR_CSS } from "../PlayAreaStyles";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FLOOR EDGE ON A SHEET THAT DOES NOT REACH THE FLOOR — sc-rb-exit-signal:
 * a57347d2, and the three couplings that make the rule mean anything.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE ROW: „The card's rounded bottom border is cut off, so the panel reads as
 * chopped." Re-measured on
 * `.audit-frames/w13/frames/sc-rb-exit-signal__mobile-right/02-briefing.png`
 * (2556 × 1179 device px at dpr 3 = the 852 × 393 stage): the card's fill and
 * its left hairline both stop at device y ≈ 1057.5, i.e. 40.5 CSS px above the
 * bottom of the picture, against `COMPACT_DASH_HEIGHT_PX = 40`. The sheet is
 * not clipped — it is standing on the instrument band with a class list that
 * assumes it is standing on the screen's own edge.
 *
 * WHY THIS FILE EXISTS AT ALL. The repair is four declarations inside a
 * template literal in `PlayAreaStyles.tsx`, which is the one construct in this
 * app that can rot into a no-op with no type error, no failing render and no
 * changed pixel in any existing test — the lesson `unpanelInkExemption.test.ts`
 * was written after the tier picker's fill survived an entire unpanel pass. So
 * nothing here greps for characters. Each block pins a JOINT: a fact this rule
 * borrows from a file it does not own, which will move one day without anybody
 * thinking about this stylesheet.
 *
 *   1. The rule is INTERPOLATED into the <style> the shell mounts. A constant
 *      that is exported and never emitted is the same as no constant.
 *   2. The shell PUBLISHES the gate, from the same expression that fills
 *      `--sim-dash-h`. A rule keyed on an attribute nobody writes matches
 *      nothing, silently.
 *   3. The selector MATCHES the tree `SimOverlay` actually ships, and does NOT
 *      match the two trees it must leave alone (no lift; not a direct child).
 *      Applied, not read.
 *   4. The bottom radius EQUALS the top radius the component authors. If the
 *      hud lane restyles the sheet to `rounded-t-3xl`, this rule would go on
 *      quietly drawing a 1 rem bottom against a 1.5 rem top, and the card would
 *      read as lopsided instead of chopped — a different defect, arrived at by
 *      the fix.
 *
 * IT IS NOT A SUBSTITUTE FOR LOOKING. The acceptance evidence is that frame,
 * re-driven on a phone profile, with the bottom-left corner cropped at 300 %.
 */

const SRC = join(process.cwd(), "src");
const PLAY_AREA_STYLES = readFileSync(
  join(SRC, "components", "sim", "lesson-ui", "PlayAreaStyles.tsx"),
  "utf8",
);
const LESSON_PLAY_SHELL = readFileSync(
  join(SRC, "components", "sim", "lesson-ui", "LessonPlayShell.tsx"),
  "utf8",
);
const SIM_OVERLAY = readFileSync(join(SRC, "modules", "sim", "hud", "SimOverlay.tsx"), "utf8");

// ---------------------------------------------------------------------------
// A selector matcher small enough to reason about. vitest runs `environment:
// "node"` in this project, so there is no `Element.matches` to borrow — and
// pulling a DOM in for four elements would be a larger dependency than this.
//
// It understands exactly what THIS selector uses: a tag name, `[attr]`,
// `[attr="value"]`, descendant combinators and the child combinator. Anything
// else throws rather than answering „no match", because „no match" is the
// reassuring direction and a matcher that lies that way would let every
// assertion below pass for the wrong reason.
// ---------------------------------------------------------------------------
interface El {
  tag: string;
  attrs: Record<string, string>;
  parent: El | null;
}

type Step = { compound: string; combinator: ">" | " " };

function parseSelector(sel: string): Step[] {
  const tokens = sel.trim().replace(/\s*>\s*/g, " > ").split(/\s+/);
  const steps: Step[] = [];
  let pendingChild = false;
  for (const t of tokens) {
    if (t === ">") {
      pendingChild = true;
      continue;
    }
    steps.push({ compound: t, combinator: pendingChild ? ">" : " " });
    pendingChild = false;
  }
  return steps;
}

function matchesCompound(el: El, compound: string): boolean {
  // Split "section[a=\"b\"][c]" into a leading tag and bracketed parts.
  const parts = compound.match(/^[a-zA-Z][\w-]*|\[[^\]]*\]/g);
  if (parts === null || parts.join("") !== compound) {
    throw new Error(`selector compound not understood: ${compound}`);
  }
  for (const part of parts) {
    if (!part.startsWith("[")) {
      if (el.tag !== part) return false;
      continue;
    }
    const body = part.slice(1, -1);
    const eq = body.indexOf("=");
    if (eq === -1) {
      if (!(body in el.attrs)) return false;
      continue;
    }
    const name = body.slice(0, eq);
    const want = body.slice(eq + 1).replace(/^["']|["']$/g, "");
    if (el.attrs[name] !== want) return false;
  }
  return true;
}

/** Right-to-left, the way an engine does it. */
function matches(el: El, sel: string): boolean {
  const steps = parseSelector(sel);
  const last = steps[steps.length - 1];
  if (last === undefined) throw new Error("empty selector");
  if (!matchesCompound(el, last.compound)) return false;
  let cursor: El | null = el;
  for (let i = steps.length - 1; i > 0; i--) {
    const step = steps[i];
    const ancestorStep = steps[i - 1];
    if (step.combinator === ">") {
      cursor = cursor === null ? null : cursor.parent;
      if (cursor === null || !matchesCompound(cursor, ancestorStep.compound)) return false;
    } else {
      let walk: El | null = cursor === null ? null : cursor.parent;
      while (walk !== null && !matchesCompound(walk, ancestorStep.compound)) walk = walk.parent;
      if (walk === null) return false;
      cursor = walk;
    }
  }
  return true;
}

function el(tag: string, attrs: Record<string, string>, parent: El | null): El {
  return { tag, attrs, parent };
}

/** The one selector this file is about, lifted out of the shipped rule text. */
function shippedSelector(): string {
  const m = /^\s*(\[data-sim-dash-lift[^{]*?)\s*\{/m.exec(LIFTED_SHEET_FLOOR_CSS);
  expect(m, "LIFTED_SHEET_FLOOR_CSS no longer opens with a data-sim-dash-lift rule").not.toBeNull();
  return (m as RegExpExecArray)[1].replace(/\s+/g, " ").trim();
}

describe("the matcher's own negative controls", () => {
  it("refuses a construct it does not understand rather than answering false", () => {
    const node = el("section", {}, null);
    expect(() => matches(node, "section:first-child")).toThrow(/not understood/);
  });

  it("distinguishes a child combinator from a descendant one", () => {
    const root = el("div", { "data-x": "on" }, null);
    const mid = el("div", {}, root);
    const leaf = el("section", {}, mid);
    expect(matches(leaf, '[data-x="on"] section')).toBe(true);
    expect(matches(leaf, '[data-x="on"] > section')).toBe(false);
  });
});

describe("1 · the rule is mounted, not merely exported", () => {
  it("is interpolated into the <style> PlayAreaStyles renders", () => {
    const styleBlock = /<style>\{`([\s\S]*?)`\}<\/style>/.exec(PLAY_AREA_STYLES);
    expect(styleBlock, "PlayAreaStyles no longer renders a single <style> template").not.toBeNull();
    expect((styleBlock as RegExpExecArray)[1]).toContain("${LIFTED_SHEET_FLOOR_CSS}");
  });

  it("carries all four declarations the chopped corner needs", () => {
    for (const decl of [
      "border-bottom-width",
      "border-bottom-style",
      "border-bottom-left-radius",
      "border-bottom-right-radius",
    ]) {
      expect(LIFTED_SHEET_FLOOR_CSS).toContain(decl);
    }
  });
});

describe("2 · the shell publishes the gate the rule is keyed on", () => {
  it("writes data-sim-dash-lift from the same quantity as --sim-dash-h", () => {
    expect(LESSON_PLAY_SHELL).toContain('data-sim-dash-lift={dashHeightPx > 0 ? "on" : undefined}');
    expect(LESSON_PLAY_SHELL).toContain('["--sim-dash-h" as string]: `${dashHeightPx}px`');
  });

  it("keeps that quantity zero exactly where the sheet really is on the floor", () => {
    // Roomy and ended both mean „no band", which is the one case the authored
    // top-only shape is correct for. If this expression grows a third arm the
    // rule's gate has to be re-read against it.
    expect(LESSON_PLAY_SHELL).toContain(
      "const dashHeightPx = ended ? 0 : compact ? COMPACT_DASH_HEIGHT_PX : 0;",
    );
  });
});

describe("3 · the selector matches the tree SimOverlay ships", () => {
  const shell = (lift: boolean) =>
    el("div", lift ? { "data-sim-dash-lift": "on" } : {}, null);

  it("matches the read sheet on a phone mid-session", () => {
    const root = shell(true);
    const stage = el("div", { "data-sim-stage": "" }, root);
    const dialog = el("div", { "data-hud": "overlay-read" }, stage);
    const sheet = el("section", {}, dialog);
    expect(matches(sheet, shippedSelector())).toBe(true);
  });

  it("does NOT match once the band is gone (roomy, or the session ended)", () => {
    const root = shell(false);
    const stage = el("div", { "data-sim-stage": "" }, root);
    const dialog = el("div", { "data-hud": "overlay-read" }, stage);
    const sheet = el("section", {}, dialog);
    expect(matches(sheet, shippedSelector())).toBe(false);
  });

  it("does NOT reach a section that is not the dialog's own box", () => {
    const root = shell(true);
    const stage = el("div", { "data-sim-stage": "" }, root);
    const dialog = el("div", { "data-hud": "overlay-read" }, stage);
    const inner = el("div", {}, dialog);
    const nested = el("section", {}, inner);
    expect(matches(nested, shippedSelector())).toBe(false);
  });

  it("pins the three facts it borrows from SimOverlay.tsx", () => {
    // (a) the dialog wrapper's name, (b) that its own box is a <section>, and
    // (c) that the box still draws only three sides. If the hud lane closes
    // this in the component instead, (c) fails here and this rule can go.
    const readMode = SIM_OVERLAY.indexOf('data-hud="overlay-read"');
    expect(readMode, "SimOverlay no longer names the read dialog").toBeGreaterThan(-1);
    const section = SIM_OVERLAY.indexOf("<section", readMode);
    expect(section).toBeGreaterThan(-1);
    // Nothing else may open between the dialog and its section, or the rule's
    // child combinator is aimed one level too high.
    expect(SIM_OVERLAY.slice(readMode, section)).not.toMatch(/<[a-z]/);
    const classNames = /className="([^"]*)"/.exec(SIM_OVERLAY.slice(section, section + 600));
    expect(classNames).not.toBeNull();
    const cls = (classNames as RegExpExecArray)[1];
    expect(cls).toContain("border-x border-t");
    expect(cls).not.toMatch(/\bborder-b\b|\brounded-b/);
  });
});

describe("4 · the bottom radius equals the top radius the component authors", () => {
  // Tailwind's scale, only the rungs this class list could plausibly move to.
  const RADIUS_REM: Record<string, string> = {
    lg: "0.5rem",
    xl: "0.75rem",
    "2xl": "1rem",
    "3xl": "1.5rem",
  };

  it("tracks SimOverlay's own rounded-t-* rung", () => {
    const readMode = SIM_OVERLAY.indexOf('data-hud="overlay-read"');
    const section = SIM_OVERLAY.indexOf("<section", readMode);
    const cls = (
      /className="([^"]*)"/.exec(SIM_OVERLAY.slice(section, section + 600)) as RegExpExecArray
    )[1];
    const rung = /\brounded-t-([\w]+)\b/.exec(cls);
    expect(rung, "the read sheet no longer rounds only its top").not.toBeNull();
    const want = RADIUS_REM[(rung as RegExpExecArray)[1]];
    expect(want, `unmapped Tailwind radius rung ${(rung as RegExpExecArray)[1]}`).toBeDefined();
    expect(LIFTED_SHEET_FLOOR_CSS).toContain(`border-bottom-left-radius: ${want};`);
    expect(LIFTED_SHEET_FLOOR_CSS).toContain(`border-bottom-right-radius: ${want};`);
  });
});
