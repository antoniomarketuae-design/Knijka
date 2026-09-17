/**
 * THE ROOMY CARD PRINTS WHAT IT HAS ROOM FOR, AND THE REST IS ONE PRESS AWAY —
 * sc-roundabout-entry:fe081cf1, and the three items the adversarial verifier
 * left open on the repair in `HudToasts.tsx`.
 *
 * THE ROW: `.audit-frames/w47/frames/sc-roundabout-entry__pc-right/04-t058s.png`
 * — the PC fault card dies at «…или Б2» (character 322 of a 674-character ring
 * paragraph) behind «↓ обяснението продължава — покажи». The repair measures
 * the card against `[data-hud-toast-scroller]` on arrival and prints the
 * catalogue's `peekBg` when the paragraph cannot be seen whole.
 *
 * WHY THIS FILE EXISTS, in the verifier's words: „Deleting the
 * violationToastBodyBg(...) call leaves every gate green." The mechanism was
 * confirmed LIVE in a real browser and guarded by nothing, which is the shape
 * this programme has measured 51 times in 82 repairs. So:
 *
 *   1 · the pure helpers, each in BOTH directions, including every „no claim"
 *       input that must keep the paragraph exactly as it shipped;
 *   2 · the press composition the card actually calls (the «Защо» chip);
 *   3 · the server render — no DOM, which must be the no-claim paragraph;
 *   4 · THE CARD, MOUNTED AND COMMITTED. The first version of this file stopped
 *       at 3 and pinned the rest by source text, and a second adversarial
 *       verifier found that pin BLIND: eight one-line edits — the measurement
 *       never asked for, never pending, always „paragraph", the pending
 *       collapse removed, the chip unwired, the chip unrendered, focus no
 *       longer held — each killed part of the repair with every gate green. A
 *       layout effect, a ref, a scroller and a mousedown all need a renderer
 *       that COMMITS, so section 4 mounts `HudToasts` through `react-reconciler`
 *       (the build `@react-three/fiber` ships, i.e. the product's own
 *       dependency, at the React this app runs) into stand-in elements that
 *       answer exactly the reads the product makes — `closest`, `offsetHeight`,
 *       `clientHeight`, `style` — from a stated layout model. It is not a DOM
 *       and does not pretend to be: what it proves is ORDER and WIRING (what
 *       the arrival commit holds, what the fit read saw, what a press does),
 *       and the pixel numbers stay the Chromium rig's (`vfy-hudtoast/`);
 *   5 · a SOURCE PIN on the same wiring, now pinning each ARGUMENT and not
 *       just the symbol's name; a pin that cannot find its anchor reports
 *       `unresolved` and FAILS — it never passes by not looking;
 *   6 · THE MUTATION MATRIX. Every edit the verifier named is applied to the
 *       shipped source TEXT, compiled by the transform vitest itself uses
 *       (vite's oxc + module-runner transform) and MOUNTED, and must turn the
 *       behaviour RED — and the unmutated text through that same pipeline must
 *       be green, so the evaluator cannot be the thing that passes. The pin is
 *       asserted on the same text, so each row says which layer catches it.
 *
 * `environment: "node"` (vitest.config.ts). `HTMLElement` and `document` are
 * stubbed for the duration of a mount only (the product asks
 * `instanceof HTMLElement` and `typeof document`), and removed after it, so
 * section 3 still renders with no `document` at all.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import createReconciler from "@react-three/fiber/react-reconciler/index.js";
import {
  ConcurrentRoot,
  DefaultEventPriority,
  NoEventPriority,
} from "@react-three/fiber/react-reconciler/constants.js";
import * as React from "react";
import { createContext, createElement } from "react";
import * as JsxDevRuntime from "react/jsx-dev-runtime";
import * as JsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { moduleRunnerTransform, transformWithOxc } from "vite";
import {
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrExportNameKey,
  ssrImportKey,
  ssrImportMetaKey,
  ssrModuleExportsKey,
} from "vite/module-runner";
import { describe, expect, it, vi } from "vitest";
import type { HudEvent } from "../../contracts";
import * as Rules from "../../rules";
import { makeViolation, violationPeekBg } from "../../rules";
import * as RealHud from "../HudToasts";
import {
  HudToasts,
  initialToastBodyChoice,
  pressLandedOnToastWhy,
  TOAST_FIT_SLACK_PX,
  TOAST_SCROLLER_SELECTOR,
  TOAST_WHY_ATTR,
  TOAST_WHY_LABEL_BG,
  toastCardFitsWindow,
  toastCardPressAction,
  violationToastBodyBg,
} from "../HudToasts";
import * as HudPreferences from "../hudPreferences";
import * as SimOverlayModule from "../SimOverlay";

const HUD_PATH = resolve(__dirname, "../HudToasts.tsx");
const HUD_SRC = readFileSync(HUD_PATH, "utf8");
const SHELL_SRC = readFileSync(
  resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"),
  "utf8",
);

type ViolationEvent = Extract<HudEvent, { kind: "violation" }>;

/** The row's own card, built the way `lessons/engine.ts` builds it. */
function ringEvent(): ViolationEvent {
  const v = makeViolation("FAILED_TO_YIELD", 1, { detail: "roundabout" });
  const peekBg = violationPeekBg("FAILED_TO_YIELD", "roundabout");
  return {
    kind: "violation",
    titleBg: v.titleBg,
    explanationBg: v.explanationBg,
    points: v.points,
    severity: v.severityClass,
    lawRef: v.lawRef,
    ...(peekBg === null ? {} : { peekBg }),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   1 · THE HELPERS, BOTH DIRECTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

describe("toastCardFitsWindow — a cut is called a cut, and nothing else is", () => {
  it("a card inside its window fits, and one past it does not", () => {
    // The pair is the mutation guard: a helper returning a constant passes one.
    expect(toastCardFitsWindow(177, 235)).toBe(true);
    // The rig's ring card, paragraph in flow, in the 650 px stage's column.
    expect(toastCardFitsWindow(408, 235)).toBe(false);
  });

  it("the slack is rounding and only rounding", () => {
    expect(TOAST_FIT_SLACK_PX).toBe(1);
    expect(toastCardFitsWindow(235, 235)).toBe(true);
    expect(toastCardFitsWindow(235 + TOAST_FIT_SLACK_PX, 235)).toBe(true);
    expect(toastCardFitsWindow(235 + TOAST_FIT_SLACK_PX + 1, 235)).toBe(false);
  });

  it("an instrument that cannot read keeps the paragraph — every way it can fail to read", () => {
    // `true` IS the paragraph. An unlaid box (0), a non-finite read and a
    // nonsense negative are all NO CLAIM, and no claim is the card as shipped.
    for (const [card, win] of [
      [408, 0],
      [0, 235],
      [0, 0],
      [Number.NaN, 235],
      [408, Number.NaN],
      [Number.POSITIVE_INFINITY, 235],
      [408, Number.POSITIVE_INFINITY],
      [-5, 235],
      [408, -1],
    ] as const) {
      expect(toastCardFitsWindow(card, win), `${card} in ${win}`).toBe(true);
    }
  });
});

describe("violationToastBodyBg — the summary replaces a cut paragraph, never a whole one, never with nothing", () => {
  const ring = ringEvent();

  it("the row's card really has both strings, and they are different", () => {
    // If the catalogue stopped routing a ring summary, every case below would
    // be asserting about a card the row does not produce.
    expect(ring.peekBg).toBe("Колата в кръга има предимство и идва отляво.");
    expect(ring.explanationBg.length).toBeGreaterThan(600);
  });

  it("shown whole → the paragraph; cut → the summary", () => {
    expect(violationToastBodyBg(ring, true)).toBe(ring.explanationBg);
    expect(violationToastBodyBg(ring, false)).toBe(ring.peekBg);
  });

  it("no summary to fall back to → the paragraph, cut or not (a blank body is a bare verdict)", () => {
    const { peekBg: _drop, ...noPeek } = ring;
    void _drop;
    expect(violationToastBodyBg(noPeek, false)).toBe(ring.explanationBg);
    expect(violationToastBodyBg({ ...ring, peekBg: "" }, false)).toBe(ring.explanationBg);
    expect(violationToastBodyBg({ ...ring, peekBg: "   \n " }, false)).toBe(ring.explanationBg);
    // …and a present paragraph is never swapped for a summary it did not need.
    expect(violationToastBodyBg(noPeek, true)).toBe(ring.explanationBg);
  });
});

describe("initialToastBodyChoice — only a card that can fall back AND can be measured waits", () => {
  it("both → pending; either missing → the paragraph from the first render", () => {
    expect(initialToastBodyChoice(true, true)).toBe("pending");
    expect(initialToastBodyChoice(false, true)).toBe("paragraph");
    // No DOM (a server render, section 3) is no claim.
    expect(initialToastBodyChoice(true, false)).toBe("paragraph");
    expect(initialToastBodyChoice(false, false)).toBe("paragraph");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2 · THE «ЗАЩО» PRESS — the composition the card calls, not a copy of it
   ═══════════════════════════════════════════════════════════════════════════ */

/** A stand-in for an element: answers `closest` for the selector it is under. */
function el(under: ReadonlyArray<string>) {
  const asked: string[] = [];
  return {
    asked,
    closest(selector: string) {
      asked.push(selector);
      return under.includes(selector) ? {} : null;
    },
  };
}

describe("the chip is a region of the card, and every other press is what it always was", () => {
  const WHY = `[${TOAST_WHY_ATTR}]`;

  it("the chip speaks the phone's word, and says which way it goes", () => {
    expect(TOAST_WHY_ATTR).toBe("data-hud-toast-why");
    expect(TOAST_WHY_LABEL_BG.closed).toMatch(/^Защо\s*↓$/);
    expect(TOAST_WHY_LABEL_BG.open).toMatch(/^Защо\s*↑$/);
  });

  it("a press on the chip is on the chip — and the question asked is the chip's selector", () => {
    const chip = el([WHY]);
    expect(pressLandedOnToastWhy(chip)).toBe(true);
    expect(chip.asked).toEqual([WHY]);
    expect(pressLandedOnToastWhy(el([]))).toBe(false);
  });

  it("anything that cannot answer `closest` is not on the chip", () => {
    for (const t of [null, undefined, "span", 7, {}, { closest: "no" }]) {
      expect(pressLandedOnToastWhy(t)).toBe(false);
    }
  });

  it("interactive card: chip → why, anywhere else → dismiss", () => {
    const card = { interactive: true, hasWhy: true };
    expect(toastCardPressAction(el([WHY]), card)).toBe("why");
    expect(toastCardPressAction(el([]), card)).toBe("dismiss");
    // A keyboard activation targets the <button> itself: dismiss, as shipped.
    expect(toastCardPressAction(null, card)).toBe("dismiss");
  });

  it("a card with NO toggle never lets a chip-shaped target swallow its dismiss", () => {
    expect(toastCardPressAction(el([WHY]), { interactive: true, hasWhy: false })).toBe("dismiss");
  });

  it("the inert column: the chip still toggles, and nothing else does anything", () => {
    const card = { interactive: false, hasWhy: true };
    expect(toastCardPressAction(el([WHY]), card)).toBe("why");
    expect(toastCardPressAction(el([]), card)).toBe("none");
    expect(toastCardPressAction(el([WHY]), { interactive: false, hasWhy: false })).toBe("none");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3 · THE SERVER RENDER — no DOM, no claim
   ═══════════════════════════════════════════════════════════════════════════ */

describe("a server render is no claim — the ring card is its whole paragraph, with no chip", () => {
  it("the column as the shell mounts it", () => {
    const ring = ringEvent();
    // Section 4 stubs `document` only inside a mount; here it must be absent,
    // or this is not the render it claims to be.
    expect(typeof document).toBe("undefined");
    const html = renderToStaticMarkup(
      createElement(HudToasts, {
        toasts: [{ id: 1, event: ring, raisedAtMs: Date.now() }],
        quiet: false,
        onDismiss: () => {},
      }),
    );
    expect(html).toContain('data-hud-toast-body="paragraph"');
    // Tags stripped: the reader's text, which is where the paragraph must be.
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain(ring.explanationBg.slice(0, 120));
    expect(text).not.toContain(ring.peekBg!);
    // No measurement ran, so nothing may be collapsed and no chip offered.
    expect(html).not.toMatch(/data-hud-toast-body="(pending|summary)"/);
    expect(html).not.toContain(TOAST_WHY_ATTR);
    expect(html).not.toMatch(/height:\s*0/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4 · THE CARD, MOUNTED AND COMMITTED
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * THE LAYOUT MODEL the stand-in elements answer from. Deliberately crude and
 * stated: a `<p>` is ⌈chars / 40⌉ lines of 16 px, a collapsed element
 * (`height: 0`) is 0 px, and the card adds a fixed chrome for its header row,
 * padding and footer. The window is the rig's 235 px column. Under it the ring
 * card is 348 px with its paragraph and 108 px with its summary — the same
 * cut / fits split the Chromium rig measured (408 / 177 px), which is the only
 * property the scenarios below rely on, and the one `modelCardPx` re-checks.
 */
const MODEL_CARD_CHROME_PX = 60;
const MODEL_LINE_PX = 16;
const MODEL_CHARS_PER_LINE = 40;
const RIG_WINDOW_PX = 235;

const BODY_ATTR = "data-hud-toast-body";
const SCROLLER_ATTR = "data-hud-toast-scroller";

function modelParagraphPx(text: string): number {
  return Math.ceil(text.length / MODEL_CHARS_PER_LINE) * MODEL_LINE_PX;
}

function modelCardPx(...paragraphs: string[]): number {
  return MODEL_CARD_CHROME_PX + paragraphs.reduce((px, t) => px + modelParagraphPx(t), 0);
}

/** What a mount records — the evidence every scenario is judged on. */
interface Lab {
  /** Per commit (after the mutation phase, before layout effects): every body. */
  commits: Array<ReadonlyArray<{ attr: unknown; collapsed: boolean; text: string }>>;
  /** Every layout read the PRODUCT made, and whether its body was in flow. */
  reads: Array<{ read: "offsetHeight" | "clientHeight"; bodyInFlow: boolean }>;
  /** The body's inline height as the previous commit's effects LEFT it. */
  bodyUpdates: Array<{ commit: number; heightBefore: string | undefined }>;
}

function styleOf(style: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof style !== "object" || style === null) return out;
  for (const [k, v] of Object.entries(style)) {
    if (v === null || v === undefined || v === "") continue;
    // React DOM's own spelling: 0 is "0", other numbers are px.
    out[k] = typeof v === "number" ? (v === 0 ? "0" : `${v}px`) : String(v);
  }
  return out;
}

class HostText {
  parent: HostEl | null = null;
  constructor(public text: string) {}
}

type HostNode = HostEl | HostText;

function isCollapsed(node: HostEl): boolean {
  return node.style.height === "0" || node.style.height === "0px";
}

/** A stand-in element. Answers the reads `HudToasts.tsx` makes, nothing else. */
class HostEl {
  parent: HostEl | null = null;
  readonly children: HostNode[] = [];
  style: Record<string, string>;
  /** Set on the container only. */
  lab: Lab | null = null;
  /** The container's `clientHeight`. Every other element answers 0. */
  windowPx = 0;

  constructor(
    readonly type: string,
    public props: Record<string, unknown>,
  ) {
    this.style = styleOf(props.style);
  }

  append(child: HostNode): void {
    child.parent?.remove(child);
    child.parent = this;
    this.children.push(child);
  }

  insertBefore(child: HostNode, before: HostNode): void {
    child.parent?.remove(child);
    const at = this.children.indexOf(before);
    if (at < 0) throw new Error("stand-in: insertBefore's reference node is not a child");
    child.parent = this;
    this.children.splice(at, 0, child);
  }

  remove(child: HostNode): void {
    const at = this.children.indexOf(child);
    if (at < 0) throw new Error("stand-in: removeChild's node is not a child");
    this.children.splice(at, 1);
    child.parent = null;
  }

  get textContent(): string {
    return this.children.map((c) => (c instanceof HostText ? c.text : c.textContent)).join("");
  }

  descendants(): HostEl[] {
    const out: HostEl[] = [];
    for (const c of this.children) {
      if (c instanceof HostEl) out.push(c, ...c.descendants());
    }
    return out;
  }

  /** `[attr]` only — anything else is a question the stand-in refuses loudly. */
  closest(selector: string): HostEl | null {
    const m = /^\[([\w-]+)\]$/.exec(selector);
    if (m === null) {
      throw new Error(`UNRESOLVED: the stand-in element cannot answer closest(${JSON.stringify(selector)})`);
    }
    for (let at: HostEl | null = this; at !== null; at = at.parent) {
      if (m[1] in at.props) return at;
    }
    return null;
  }

  private rootLab(): Lab | null {
    let at: HostEl = this;
    while (at.parent !== null) at = at.parent;
    return at.lab;
  }

  private bodyInFlow(): boolean {
    return this.descendants()
      .filter((d) => BODY_ATTR in d.props)
      .every((d) => !isCollapsed(d));
  }

  modelPx(): number {
    if (isCollapsed(this)) return 0;
    if (this.type === "p") return modelParagraphPx(this.textContent);
    let px = 0;
    for (const c of this.children) if (c instanceof HostEl) px += c.modelPx();
    return px;
  }

  get offsetHeight(): number {
    this.rootLab()?.reads.push({ read: "offsetHeight", bodyInFlow: this.bodyInFlow() });
    const isCard = String(this.props.className ?? "").includes("hud-toast-in");
    return (isCard ? MODEL_CARD_CHROME_PX : 0) + this.modelPx();
  }

  get clientHeight(): number {
    this.rootLab()?.reads.push({ read: "clientHeight", bodyInFlow: this.bodyInFlow() });
    return this.windowPx;
  }

  noteBodyUpdate(): void {
    const lab = this.rootLab();
    if (lab !== null && BODY_ATTR in this.props) {
      lab.bodyUpdates.push({ commit: lab.commits.length, heightBefore: this.style.height });
    }
  }
}

/** The reconciler surface this file calls — the typings lag the 19.2 build. */
interface HostRoot {
  readonly __hostRoot: true;
}
interface MiniReconciler {
  createContainer(
    container: HostEl,
    tag: number,
    hydrationCallbacks: null,
    isStrictMode: boolean,
    concurrentUpdatesByDefaultOverride: null,
    identifierPrefix: string,
    onUncaughtError: (error: unknown) => void,
    onCaughtError: (error: unknown) => void,
    onRecoverableError: (error: unknown) => void,
    transitionCallbacks: null,
  ): HostRoot;
  updateContainerSync(element: React.ReactNode, root: HostRoot, parent: null, callback: null): void;
  flushSyncWork(): void;
  flushPassiveEffects(): boolean;
  flushSyncFromReconciler<R>(fn: () => R): R;
}

const renderErrors: unknown[] = [];
const collectError = (error: unknown) => {
  renderErrors.push(error);
};
let updatePriority: number = NoEventPriority;

/** A mutation-mode host config over `HostEl` — the same keys R3F's 19.2 config sets. */
const HOST_CONFIG = {
  isPrimaryRenderer: false,
  warnsIfNotActing: false,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  createInstance: (type: string, props: Record<string, unknown>) => new HostEl(type, props),
  createTextInstance: (text: string) => new HostText(text),
  appendInitialChild: (parent: HostEl, child: HostNode) => parent.append(child),
  appendChild: (parent: HostEl, child: HostNode) => parent.append(child),
  appendChildToContainer: (parent: HostEl, child: HostNode) => parent.append(child),
  insertBefore: (parent: HostEl, child: HostNode, before: HostNode) => parent.insertBefore(child, before),
  insertInContainerBefore: (parent: HostEl, child: HostNode, before: HostNode) =>
    parent.insertBefore(child, before),
  removeChild: (parent: HostEl, child: HostNode) => parent.remove(child),
  removeChildFromContainer: (parent: HostEl, child: HostNode) => parent.remove(child),
  commitTextUpdate: (node: HostText, _old: string, text: string) => {
    node.text = text;
  },
  commitUpdate: (node: HostEl, _type: string, _old: unknown, next: Record<string, unknown>) => {
    node.noteBodyUpdate();
    node.props = next;
    node.style = styleOf(next.style);
  },
  resetTextContent: () => {},
  clearContainer: (container: HostEl) => {
    for (const c of [...container.children]) container.remove(c);
  },
  finalizeInitialChildren: () => false,
  commitMount: () => {},
  shouldSetTextContent: () => false,
  getRootHostContext: () => ({}),
  getChildHostContext: (parent: object) => parent,
  getPublicInstance: (node: HostNode) => node,
  prepareForCommit: () => null,
  resetAfterCommit: (container: HostEl) => {
    container.lab?.commits.push(
      container
        .descendants()
        .filter((d) => BODY_ATTR in d.props)
        .map((b) => ({ attr: b.props[BODY_ATTR], collapsed: isCollapsed(b), text: b.textContent })),
    );
  },
  preparePortalMount: () => {},
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  getInstanceFromNode: () => null,
  beforeActiveInstanceBlur: () => {},
  afterActiveInstanceBlur: () => {},
  detachDeletedInstance: () => {},
  prepareScopeUpdate: () => {},
  getInstanceFromScope: () => null,
  hideInstance: () => {},
  unhideInstance: () => {},
  hideTextInstance: () => {},
  unhideTextInstance: () => {},
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: () => {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  requestPostPaintCallback: () => {},
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit: () => {},
  suspendInstance: () => {},
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  HostTransitionContext: createContext<unknown>(null),
  resetFormInstance: () => {},
  setCurrentUpdatePriority: (priority: number) => {
    updatePriority = priority;
  },
  getCurrentUpdatePriority: () => updatePriority,
  resolveUpdatePriority: () => (updatePriority !== NoEventPriority ? updatePriority : DefaultEventPriority),
  rendererPackageName: "hud-toast-fit.test",
  rendererVersion: "0.0.0",
  applyViewTransitionName: () => {},
  restoreViewTransitionName: () => {},
  cancelViewTransitionName: () => {},
  cancelRootViewTransitionName: () => {},
  restoreRootViewTransitionName: () => {},
  InstanceMeasurement: null,
  measureInstance: () => null,
  wasInstanceInViewport: () => true,
  hasInstanceChanged: () => false,
  hasInstanceAffectedParent: () => false,
  suspendOnActiveViewTransition: () => {},
  startGestureTransition: () => null,
  startViewTransition: () => null,
  stopViewTransition: () => {},
  createViewTransitionInstance: () => null,
};

const reconciler = (createReconciler as unknown as (config: object) => MiniReconciler)(HOST_CONFIG);

function throwIfRenderErrors(): void {
  if (renderErrors.length === 0) return;
  const [first] = renderErrors.splice(0);
  throw first instanceof Error ? first : new Error(String(first));
}

/** Only what a mount needs from the module under test — real or evaluated. */
type HudModule = Pick<typeof RealHud, "HudToasts">;

interface Column {
  lab: Lab;
  dismissed: number[];
  card(): HostEl | null;
  body(): HostEl | null;
  chip(): HostEl | null;
  find(pred: (node: HostEl) => boolean): HostEl | null;
  /** Bubbles a synthetic event from `target` through every handler above it. */
  press(target: HostEl, handler: "onMouseDown" | "onClick"): { defaultPrevented: boolean };
  /** The shell re-rendering the same column (the age tick, a sibling toast). */
  rerender(): void;
  unmount(): void;
}

/**
 * Mount the column the way `LessonPlayShell` does, inside a scroller of
 * `windowPx`. `HTMLElement` and `document` exist for exactly this mount's life.
 */
function mountColumn(
  mod: HudModule,
  opts: { event: ViolationEvent; windowPx: number; scroller?: boolean; interactive: boolean },
): Column {
  const lab: Lab = { commits: [], reads: [], bodyUpdates: [] };
  const dismissed: number[] = [];
  const container = new HostEl("div", opts.scroller === false ? {} : { [SCROLLER_ATTR]: "" });
  container.lab = lab;
  container.windowPx = opts.windowPx;

  vi.stubGlobal("HTMLElement", HostEl);
  vi.stubGlobal("document", {});

  const element = () =>
    createElement(mod.HudToasts, {
      toasts: [{ id: 1, event: opts.event }],
      quiet: false,
      ...(opts.interactive ? { onDismiss: (id: number) => void dismissed.push(id) } : {}),
    });
  const root = reconciler.createContainer(
    container,
    ConcurrentRoot,
    null,
    false,
    null,
    "",
    collectError,
    collectError,
    collectError,
    null,
  );
  const commit = (node: React.ReactNode) => {
    reconciler.updateContainerSync(node, root, null, null);
    reconciler.flushSyncWork();
    reconciler.flushPassiveEffects();
    throwIfRenderErrors();
  };

  try {
    commit(element());
  } catch (error) {
    vi.unstubAllGlobals();
    throw error;
  }

  const find = (pred: (node: HostEl) => boolean) => container.descendants().find(pred) ?? null;
  return {
    lab,
    dismissed,
    find,
    card: () =>
      find((d) => d.props["data-hud"] === "toasts")?.children.find((c): c is HostEl => c instanceof HostEl) ?? null,
    body: () => find((d) => BODY_ATTR in d.props),
    chip: () => find((d) => TOAST_WHY_ATTR in d.props),
    press(target, handler) {
      const event = {
        target,
        defaultPrevented: false,
        preventDefault() {
          event.defaultPrevented = true;
        },
        stopPropagation() {},
      };
      reconciler.flushSyncFromReconciler(() => {
        for (let at: HostEl | null = target; at !== null; at = at.parent) {
          const fn = at.props[handler];
          if (typeof fn === "function") fn(event);
        }
      });
      reconciler.flushPassiveEffects();
      throwIfRenderErrors();
      return { defaultPrevented: event.defaultPrevented };
    },
    rerender: () => commit(element()),
    unmount() {
      try {
        commit(null);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  };
}

function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/**
 * The arrival: what the FIRST commit holds (the DOM the shell's passive fold
 * measurement reads) and what the product's own fit read saw.
 */
function arrivalFaults(col: Column, want: { waits: boolean; measured: boolean }): string[] {
  const f: string[] = [];
  const first = col.lab.commits[0]?.[0];
  if (first === undefined) return ["unresolved: the arrival commit holds no data-hud-toast-body"];
  if (want.waits) {
    if (first.attr !== "pending") {
      f.push(`the arrival commit is "${String(first.attr)}", not "pending" — the card never waits to be measured`);
    }
    if (!first.collapsed) {
      f.push("the arrival commit's body takes height — the shell's fold measurement sees the paragraph for a frame");
    }
  } else {
    if (first.attr !== "paragraph") {
      f.push(`a card with nothing to decide arrived "${String(first.attr)}", not "paragraph"`);
    }
    if (first.collapsed) f.push("a card with nothing to decide arrived collapsed");
  }
  const cardReads = col.lab.reads.filter((r) => r.read === "offsetHeight");
  const windowReads = col.lab.reads.filter((r) => r.read === "clientHeight");
  if (want.measured) {
    if (cardReads.length !== 1 || windowReads.length !== 1) {
      f.push(
        `the fit was read ${cardReads.length}× on the card and ${windowReads.length}× on the window — not once each, at arrival`,
      );
    }
    if (cardReads.some((r) => !r.bodyInFlow)) f.push("the fit read measured the card with its body collapsed");
    // Only a card that arrived collapsed can be left un-collapsed by the read;
    // otherwise the arrival faults above already name the root cause.
    if (first.attr === "pending" && first.collapsed) {
      const left = col.lab.bodyUpdates.find((u) => u.commit === 1);
      if (left === undefined) f.push("unresolved: a pending card committed no choice");
      else if (left.heightBefore !== "0") {
        f.push(
          `the measurement left the body at height «${left.heightBefore ?? ""}» — the shell's passive effect would read the paragraph`,
        );
      }
    }
  } else if (cardReads.length + windowReads.length > 0) {
    f.push("a card with no claim to make was measured anyway");
  }
  return f;
}

/** The card as it settles: which body, which text, and whether a chip is offered. */
function settledFaults(col: Column, want: { attr: "summary" | "paragraph"; text: string; chip: boolean }): string[] {
  const f: string[] = [];
  const body = col.body();
  if (body === null) return ["unresolved: no data-hud-toast-body after arrival"];
  if (body.props[BODY_ATTR] !== want.attr || body.textContent !== want.text) {
    f.push(
      `the card settled on "${String(body.props[BODY_ATTR])}" «${clip(body.textContent)}», not ${want.attr === "summary" ? "its summary" : "its paragraph"}`,
    );
  }
  const chip = col.chip();
  if (want.chip && chip === null) f.push("the summarised card offers no «Защо» chip");
  if (!want.chip && chip !== null) f.push("a card showing its paragraph offers a «Защо» chip");
  return f;
}

/** The row's card in the rig's window: the repair's whole reason to exist. */
function cutCardFaults(mod: HudModule, interactive: boolean): string[] {
  const ring = ringEvent();
  const cardPx = modelCardPx(ring.titleBg, ring.explanationBg);
  const summaryPx = modelCardPx(ring.titleBg, ring.peekBg ?? "");
  if (toastCardFitsWindow(cardPx, RIG_WINDOW_PX) || !toastCardFitsWindow(summaryPx, RIG_WINDOW_PX)) {
    return [`unresolved: the model puts the ring card at ${cardPx} / ${summaryPx} px in ${RIG_WINDOW_PX} — not a cut paragraph with a summary that fits`];
  }
  const col = mountColumn(mod, { event: ring, windowPx: RIG_WINDOW_PX, interactive });
  try {
    const f = [
      ...arrivalFaults(col, { waits: true, measured: true }),
      ...settledFaults(col, { attr: "summary", text: ring.peekBg!, chip: true }),
    ];
    const card = col.card();
    if (card === null || card.type !== (interactive ? "button" : "div")) {
      f.push(`unresolved: the ${interactive ? "clickable" : "inert"} card root is not a <${interactive ? "button" : "div"}>`);
      return f;
    }

    // THE CLOCK RE-RENDERS; THE CHOICE DOES NOT MOVE.
    const readsBefore = col.lab.reads.length;
    col.rerender();
    if (col.lab.reads.length !== readsBefore) f.push("a re-render measured the card again — the choice is not latched");
    if (col.body()?.props[BODY_ATTR] !== "summary") f.push("a re-render moved the card off its summary");

    const title = col.find((d) => d.type === "p" && d.textContent === ring.titleBg);
    if (title === null) return [...f, "unresolved: the card's title <p>"];

    // THE CHIP.
    const chip = col.chip();
    if (chip !== null) {
      if (chip.props[TOAST_WHY_ATTR] !== "closed" || chip.textContent !== TOAST_WHY_LABEL_BG.closed) {
        f.push(`the chip does not start closed — it reads "${String(chip.props[TOAST_WHY_ATTR])}" «${chip.textContent}»`);
      }
      if (!col.press(chip, "onMouseDown").defaultPrevented) {
        f.push("a mousedown on the chip does not hold focus — the next Enter would dismiss the card it opened");
      }
      col.press(chip, "onClick");
      if (col.dismissed.length > 0) f.push("a press on the chip dismissed the card");
      const opened = col.body();
      if (opened?.props[BODY_ATTR] !== "paragraph" || opened.textContent !== ring.explanationBg) {
        f.push("a press on the chip did not open the paragraph");
      }
      const openChip = col.chip();
      if (openChip?.props[TOAST_WHY_ATTR] !== "open" || openChip.textContent !== TOAST_WHY_LABEL_BG.open) {
        f.push("the opened chip does not say it closes");
      }
      if (col.lab.reads.length !== readsBefore) f.push("opening the chip re-ran the fit measurement");
      col.press(openChip ?? chip, "onClick");
      if (col.body()?.textContent !== ring.peekBg) f.push("a second press on the chip did not close the paragraph");
    }

    // ANYWHERE ELSE ON THE CARD.
    if (col.press(title, "onMouseDown").defaultPrevented) {
      f.push("a mousedown off the chip is swallowed — the card's own focus behaviour changed");
    }
    col.press(title, "onClick");
    if (interactive && col.dismissed.length !== 1) {
      f.push(`a press off the chip dismissed ${col.dismissed.length} card(s), not 1`);
    }
    if (col.body()?.textContent !== ring.peekBg) f.push("a press off the chip changed the body");
    return f;
  } finally {
    col.unmount();
  }
}

const SCENARIOS: ReadonlyArray<{ name: string; run: (mod: HudModule) => string[] }> = [
  {
    name: "the row's cut card, clickable column: pending on arrival, measured once, summary, chip opens and closes, focus held, dismiss elsewhere",
    run: (mod) => cutCardFaults(mod, true),
  },
  {
    name: "the same card in the inert column: summary and a working chip, and nothing else answers",
    run: (mod) => cutCardFaults(mod, false),
  },
  {
    name: "a card that fits its window: pending on arrival, measured once, keeps its paragraph, no chip",
    run: (mod) => {
      const ring = ringEvent();
      const col = mountColumn(mod, { event: ring, windowPx: 2000, interactive: true });
      try {
        return [
          ...arrivalFaults(col, { waits: true, measured: true }),
          ...settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false }),
        ];
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "no summary to fall back to: the paragraph from the first commit, never measured, no chip",
    run: (mod) => {
      const { peekBg: _drop, ...ring } = ringEvent();
      void _drop;
      const col = mountColumn(mod, { event: ring, windowPx: RIG_WINDOW_PX, interactive: true });
      try {
        return [
          ...arrivalFaults(col, { waits: false, measured: false }),
          ...settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false }),
        ];
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "no scroller above the card (the popup rig): no claim — the paragraph",
    run: (mod) => {
      const ring = ringEvent();
      const col = mountColumn(mod, { event: ring, windowPx: RIG_WINDOW_PX, scroller: false, interactive: true });
      try {
        return [
          ...arrivalFaults(col, { waits: true, measured: false }),
          ...settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false }),
        ];
      } finally {
        col.unmount();
      }
    },
  },
  {
    name: "a window that has not been laid out (0 px): no claim — the paragraph",
    run: (mod) => {
      const ring = ringEvent();
      const col = mountColumn(mod, { event: ring, windowPx: 0, interactive: true });
      try {
        return [
          ...arrivalFaults(col, { waits: true, measured: true }),
          ...settledFaults(col, { attr: "paragraph", text: ring.explanationBg, chip: false }),
        ];
      } finally {
        col.unmount();
      }
    },
  },
];

/** Every scenario, faults prefixed by its name. A crash is a fault, not a pass. */
function behaviourFaults(mod: HudModule): string[] {
  const out: string[] = [];
  for (const s of SCENARIOS) {
    try {
      out.push(...s.run(mod).map((f) => `${s.name} :: ${f}`));
    } catch (error) {
      out.push(`${s.name} :: crash: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return out;
}

describe("the card, mounted and committed — the repair does what it says in the order it says", () => {
  it("the stand-ins leave no DOM behind them", () => {
    const col = mountColumn(RealHud, { event: ringEvent(), windowPx: RIG_WINDOW_PX, interactive: true });
    expect(typeof document).toBe("object");
    col.unmount();
    expect(typeof document).toBe("undefined");
    expect(typeof HTMLElement).toBe("undefined");
  });

  for (const s of SCENARIOS) {
    it(s.name, () => {
      expect(s.run(RealHud)).toEqual([]);
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   5 · THE SAME WIRING, PINNED BY ITS ARGUMENTS
   ═══════════════════════════════════════════════════════════════════════════ */

/** `src.slice(from, to)` where both anchors must exist, or `null`. */
function between(src: string, from: string, to: string): string | null {
  const a = src.indexOf(from);
  if (a < 0) return null;
  const b = src.indexOf(to, a + from.length);
  return b < 0 ? null : src.slice(a, b);
}

/**
 * Everything that would silently turn the repair back into the cut card, or
 * the chip into a control that does nothing. Returns faults; `[]` is green. An
 * anchor it cannot find is a fault named `unresolved:` — never a pass.
 *
 * EACH CHECK PINS THE VALUE, NOT THE NAME. The first version asked
 * `/onWhy=\{/` and `/useToastBodyChoice\(/`, which `onWhy={undefined}` and
 * `useToastBodyChoice(false)` both satisfy. What it still cannot see is a
 * guard made constant INSIDE a function (`… || true`); that is section 4's to
 * catch, by running it, and section 6 records which layer catches which edit.
 */
function wiringFaults(hud: string, shell: string): string[] {
  const faults: string[] = [];

  const toast = between(hud, "function ViolationToast(", "function ToastCard(");
  if (toast === null) {
    faults.push("unresolved: ViolationToast");
  } else {
    // THE BODY. The `<p>` that carries `data-hud-toast-body`, whole.
    const attrAt = toast.indexOf("data-hud-toast-body=");
    const pOpen = attrAt < 0 ? -1 : toast.lastIndexOf("<p", attrAt);
    const pClose = attrAt < 0 ? -1 : toast.indexOf("</p>", attrAt);
    if (pOpen < 0 || pClose < 0) {
      faults.push("unresolved: the data-hud-toast-body <p>");
    } else {
      const p = toast.slice(pOpen, pClose);
      if (!/\{\s*violationToastBodyBg\(\s*event\s*,\s*showParagraph\s*\)\s*\}/.test(p))
        faults.push("the body <p> no longer routes its text through violationToastBodyBg(event, showParagraph)");
      if (/\{\s*event\.(explanationBg|peekBg)\s*\}/.test(p))
        faults.push("the body <p> prints an event string directly");
      if (!/ref=\{bodyRef\}/.test(p))
        faults.push("the body <p> lost ref={bodyRef} — the measurement would read no body");
      if (!/style=\{\s*choice\s*===\s*"pending"\s*\?\s*TOAST_BODY_PENDING_STYLE\s*:\s*undefined\s*\}/.test(p))
        faults.push(
          "the body <p> is no longer collapsed while the choice is pending — the shell's fold measurement would see the paragraph",
        );
    }
    if (!/useToastBodyChoice\(\s*canSummarise\s*\)/.test(toast))
      faults.push("ViolationToast no longer measures with useToastBodyChoice(canSummarise)");
    if (!/const\s+showParagraph\s*=\s*!summarised\s*\|\|\s*whyOpen\s*;/.test(toast))
      faults.push("showParagraph is no longer «not summarised, or opened by the chip»");
    if (!/cardRef=\{setCard\}/.test(toast)) faults.push("ViolationToast no longer hands its card to the measurement");
    if (!/onWhy=\{\s*summarised\s*\?\s*toggleWhy\s*:\s*undefined\s*\}/.test(toast))
      faults.push("ViolationToast no longer wires the «Защо» chip to its toggle (onWhy={summarised ? toggleWhy : undefined})");
    if (!/trailing=\{\s*summarised\s*\?\s*<ToastWhyChip\b/.test(toast))
      faults.push("ViolationToast no longer renders the «Защо» chip on a summarised card (trailing={summarised ? <ToastWhyChip …})");
  }

  if (!/const\s+TOAST_BODY_PENDING_STYLE\s*=\s*\{\s*height:\s*0\s*,\s*overflow:\s*"hidden"\s*\}/.test(hud))
    faults.push("TOAST_BODY_PENDING_STYLE no longer takes the pending body's height away");

  const card = between(hud, "function ToastCard(", "export function HudToasts(");
  if (card === null) faults.push("unresolved: ToastCard");
  else if (!/<ViolationToast\b/.test(card)) faults.push("ToastCard no longer renders ViolationToast");

  const measure = between(hud, "function measureToastBodyChoice(", "\n}\n");
  if (measure === null) {
    faults.push("unresolved: measureToastBodyChoice");
  } else {
    if (!/card\.offsetHeight/.test(measure)) faults.push("the fit read is not the card's offsetHeight");
    if (/getBoundingClientRect/.test(measure))
      faults.push("the fit read uses getBoundingClientRect (4 % short under scale(0.96))");
    if (!/\.closest\(\s*TOAST_SCROLLER_SELECTOR\s*\)/.test(measure))
      faults.push("the window is no longer the shell's scroller");
    if (!/scroller\.clientHeight/.test(measure)) faults.push("the window read is not the scroller's clientHeight");
    if (!/body\.style\.height\s*=\s*collapsed\.height/.test(measure))
      faults.push("the body is not collapsed again after the fit read — the shell would measure the paragraph");
    if (!/return\s+fits\s*\?\s*"paragraph"\s*:\s*"summary"/.test(measure))
      faults.push("the measurement no longer answers «fits → paragraph, cut → summary»");
  }

  const hook = between(hud, "function useToastBodyChoice(", "\n}\n");
  if (hook === null) {
    faults.push("unresolved: useToastBodyChoice");
  } else {
    if (!/useLayoutEffect\(/.test(hook)) faults.push("the choice is not made in a layout effect (it would paint first)");
    if (/\buseEffect\(/.test(hook)) faults.push("the choice hook uses a passive effect");
    if (!/measureToastBodyChoice\(\s*cardRef\.current\s*,\s*bodyRef\.current\s*\)/.test(hook))
      faults.push("the choice hook does not call the measurement on its card and body");
    if (!/initialToastBodyChoice\(\s*canSummarise\s*,\s*typeof\s+document\s*!==\s*"undefined"\s*\)/.test(hook))
      faults.push(
        'the choice hook no longer starts pending when it can measure (initialToastBodyChoice(canSummarise, typeof document !== "undefined"))',
      );
  }

  const shellFn = between(hud, "function ToastShell(", "\n}\n");
  if (shellFn === null) {
    faults.push("unresolved: ToastShell");
  } else {
    if (!/toastCardPressAction\(\s*e\.target/.test(shellFn))
      faults.push("ToastShell does not route presses through toastCardPressAction");
    // THE TWO CARD ROOTS — each opening tag, from `<button`/`<div` to the
    // `<ToastGround />` it wraps, so a prop is pinned on the element it rides.
    const roots = [...shellFn.matchAll(/<ToastGround\b/g)].map((m) => {
      const at = Math.max(shellFn.lastIndexOf("<button", m.index), shellFn.lastIndexOf("<div", m.index));
      return at < 0 ? "" : shellFn.slice(at, m.index);
    });
    const button = roots.find((r) => r.startsWith("<button"));
    const inert = roots.find((r) => r.startsWith("<div"));
    if (roots.length !== 2 || button === undefined || inert === undefined) {
      faults.push("unresolved: ToastShell's two card roots (a <button> and a <div>, each over <ToastGround />)");
    } else {
      if (!/onClick=\{press\}/.test(button)) faults.push("the card <button> no longer calls the press composition");
      if (!/onClick=\{\s*hasWhy\s*\?\s*press\s*:\s*undefined\s*\}/.test(inert))
        faults.push("the inert card <div> no longer calls the press composition for its chip");
      for (const [name, tag] of [
        ["<button>", button],
        ["inert <div>", inert],
      ] as const) {
        if (!/onMouseDown=\{\s*hasWhy\s*\?\s*holdFocus\s*:\s*undefined\s*\}/.test(tag))
          faults.push(`the card ${name} no longer holds focus on a «Защо» press (onMouseDown={hasWhy ? holdFocus : undefined})`);
        if (!/ref=\{cardRef\}/.test(tag)) faults.push(`the card ${name} no longer hands its element to the measurement`);
      }
    }
  }

  // THE SHELL END. The selector names the shell's attribute; the attribute must
  // exist on a real element and hold the column the cards mount in.
  const scrollerAt = shell.indexOf('data-hud-toast-scroller=""');
  if (scrollerAt < 0) {
    faults.push("LessonPlayShell.tsx no longer carries data-hud-toast-scroller");
  } else {
    const toastsAt = shell.indexOf("<HudToasts", scrollerAt);
    const moreAt = shell.indexOf('data-hud-toast-more=""', scrollerAt);
    if (toastsAt < 0 || (moreAt >= 0 && toastsAt > moreAt))
      faults.push("<HudToasts> is no longer mounted inside [data-hud-toast-scroller]");
  }
  return faults;
}

describe("the repair is wired where section 4 runs it", () => {
  it("the selector is the shell's attribute", () => {
    expect(TOAST_SCROLLER_SELECTOR).toBe("[data-hud-toast-scroller]");
    expect(TOAST_SCROLLER_SELECTOR).toBe(`[${SCROLLER_ATTR}]`);
  });

  it("HudToasts.tsx and LessonPlayShell.tsx, as they are in the tree: no faults", () => {
    expect(wiringFaults(HUD_SRC, SHELL_SRC)).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   6 · MUTATION-TESTED — every edit below is applied to the shipped TEXT
   ═══════════════════════════════════════════════════════════════════════════ */

/** Apply one edit, and refuse a mutation that did not change anything. */
function mutate(src: string, from: string | RegExp, to: string): string {
  const out = src.replace(from, to);
  expect(out, `mutation did not apply: ${String(from)}`).not.toBe(src);
  return out;
}

const MUTANT_DEPS: Readonly<Record<string, unknown>> = {
  react: React,
  "react/jsx-runtime": JsxRuntime,
  "react/jsx-dev-runtime": JsxDevRuntime,
  "../rules": Rules,
  "./hudPreferences": HudPreferences,
  "./SimOverlay": SimOverlayModule,
};

type AsyncFn = (...args: unknown[]) => Promise<void>;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...params: string[]) => AsyncFn;

/**
 * `HudToasts.tsx`'s TEXT, compiled the way vitest compiles the real file (oxc
 * for TSX, then vite's module-runner transform) and evaluated the way vite's
 * `ESModulesEvaluator` evaluates it, against the SAME module instances the real
 * file imports. An import it does not provide is a thrown `UNRESOLVED`, never
 * a stand-in.
 */
async function evaluateHudToasts(src: string): Promise<HudModule> {
  const ts = await transformWithOxc(src, HUD_PATH, { lang: "tsx", jsx: { runtime: "automatic" } });
  const ssr = await moduleRunnerTransform(ts.code, null, HUD_PATH, src);
  if (ssr === null) throw new Error("UNRESOLVED: vite produced no module-runner code for HudToasts.tsx");
  const exported: Record<string, unknown> = {};
  await new AsyncFunction(
    ssrModuleExportsKey,
    ssrImportMetaKey,
    ssrImportKey,
    ssrDynamicImportKey,
    ssrExportAllKey,
    ssrExportNameKey,
    `"use strict";\n${ssr.code}`,
  )(
    exported,
    {},
    (id: string) => {
      if (!(id in MUTANT_DEPS)) {
        throw new Error(`UNRESOLVED: HudToasts.tsx imports "${id}", which this evaluator does not provide`);
      }
      return MUTANT_DEPS[id];
    },
    (id: string) => {
      throw new Error(`UNRESOLVED: HudToasts.tsx dynamically imports "${id}"`);
    },
    () => {
      throw new Error("UNRESOLVED: HudToasts.tsx re-exports a whole module");
    },
    (name: string, getter: () => unknown) =>
      Object.defineProperty(exported, name, { enumerable: true, configurable: true, get: getter }),
  );
  if (typeof exported.HudToasts !== "function") {
    throw new Error("UNRESOLVED: the evaluated HudToasts.tsx exports no HudToasts component");
  }
  return exported as unknown as HudModule;
}

describe("…and the evaluator is not the thing that passes", () => {
  it("the shipped text, through the same transform and mount: every scenario green, every export present", async () => {
    const evaluated = await evaluateHudToasts(HUD_SRC);
    expect(Object.keys(evaluated).sort()).toEqual(Object.keys(RealHud).sort());
    expect(behaviourFaults(evaluated)).toEqual([]);
  });
});

describe("THE VERIFIER'S EIGHT — each one-line edit turns this file RED", () => {
  /**
   * `behaviour` must match a fault from section 4 run on the mutant; `pin` a
   * fault from section 5 on the same text, or `null` where the pin by design
   * cannot see it (a constant guard inside a function body).
   */
  const EIGHT: ReadonlyArray<{
    n: number;
    name: string;
    from: string;
    to: string;
    behaviour: RegExp;
    pin: RegExp | null;
  }> = [
    {
      n: 1,
      name: "the card never asks to be measured — useToastBodyChoice(false)",
      from: "useToastBodyChoice(canSummarise)",
      to: "useToastBodyChoice(false)",
      behaviour: /not "pending" — the card never waits/,
      pin: /useToastBodyChoice\(canSummarise\)/,
    },
    {
      n: 2,
      name: "the paragraph is always shown — const showParagraph = true",
      from: "const showParagraph = !summarised || whyOpen;",
      to: "const showParagraph = true;",
      behaviour: /not its summary/,
      pin: /showParagraph is no longer/,
    },
    {
      n: 3,
      name: "the first render never waits — initialToastBodyChoice(canSummarise, false)",
      from: 'initialToastBodyChoice(canSummarise, typeof document !== "undefined")',
      to: "initialToastBodyChoice(canSummarise, false)",
      behaviour: /not "pending" — the card never waits/,
      pin: /no longer starts pending/,
    },
    {
      n: 4,
      name: "the measurement always answers paragraph — a constant guard",
      from: '  if (card === null || body === null) return "paragraph";',
      to: '  if (card === null || body === null || true) return "paragraph";',
      behaviour: /not its summary/,
      pin: null,
    },
    {
      n: 5,
      name: "the pending body is not collapsed — the one-frame false fold row returns",
      from: 'style={choice === "pending" ? TOAST_BODY_PENDING_STYLE : undefined}',
      to: "",
      behaviour: /arrival commit's body takes height/,
      pin: /no longer collapsed while the choice is pending/,
    },
    {
      n: 6,
      name: "the chip is never wired — onWhy={undefined}",
      from: "onWhy={summarised ? toggleWhy : undefined}",
      to: "onWhy={undefined}",
      behaviour: /a press on the chip dismissed the card|does not hold focus/,
      pin: /chip to its toggle/,
    },
    {
      n: 7,
      name: "the chip is never rendered — trailing={null}",
      from: "trailing={summarised ? <ToastWhyChip open={whyOpen} color={meta.color} /> : null}",
      to: "trailing={null}",
      behaviour: /offers no «Защо» chip/,
      pin: /no longer renders the «Защо» chip/,
    },
    {
      n: 8,
      name: "the clickable card no longer holds focus on a chip press — onMouseDown removed",
      from: "      onMouseDown={hasWhy ? holdFocus : undefined}\n      aria-label",
      to: "      aria-label",
      behaviour: /does not hold focus/,
      pin: /card <button> no longer holds focus/,
    },
  ];

  for (const m of EIGHT) {
    it(`#${m.n} ${m.name}`, async () => {
      const src = mutate(HUD_SRC, m.from, m.to);
      const faults = behaviourFaults(await evaluateHudToasts(src));
      expect(faults.length, "the mounted card stayed green on a broken source").toBeGreaterThan(0);
      expect(
        faults.some((f) => m.behaviour.test(f) && !/:: (crash|unresolved)/.test(f)),
        faults.join("\n"),
      ).toBe(true);

      const pinned = wiringFaults(src, SHELL_SRC);
      if (m.pin === null) {
        // Recorded, not hidden: this edit is invisible to text and caught above.
        expect(pinned).toEqual([]);
      } else {
        expect(pinned.some((f) => m.pin!.test(f)), pinned.join(" · ")).toBe(true);
      }
    });
  }
});

describe("…and the pin FAILS on each thing it claims to catch (mutation-tested)", () => {
  const cases: ReadonlyArray<{ name: string; hud?: [string | RegExp, string]; shell?: [string | RegExp, string]; expect: RegExp }> = [
    {
      name: "the body prints the paragraph directly (the first verifier's deletion)",
      hud: ["{violationToastBodyBg(event, showParagraph)}", "{event.explanationBg}"],
      expect: /violationToastBodyBg/,
    },
    {
      name: "the fit read goes back to a transformed rect",
      hud: ["toastCardFitsWindow(card.offsetHeight,", "toastCardFitsWindow(card.getBoundingClientRect().height,"],
      expect: /offsetHeight|getBoundingClientRect/,
    },
    {
      name: "the choice moves to a passive effect",
      hud: [/useLayoutEffect\(\(\) => \{\n(\s*)if \(choice !== "pending"\)/, 'useEffect(() => {\n$1if (choice !== "pending")'],
      expect: /layout effect|passive effect/,
    },
    {
      name: "the body loses its ref",
      hud: ["ref={bodyRef}\n", "\n"],
      expect: /bodyRef/,
    },
    {
      name: "the collapse is not restored after the read",
      hud: ["body.style.height = collapsed.height;", ""],
      expect: /collapsed again/,
    },
    {
      name: "the pending style stops collapsing anything",
      hud: ['{ height: 0, overflow: "hidden" }', '{ overflow: "hidden" }'],
      expect: /TOAST_BODY_PENDING_STYLE/,
    },
    {
      name: "the card goes back to dismiss-only",
      hud: ["onClick={press}", "onClick={onDismiss}"],
      expect: /press composition/,
    },
    {
      name: "the inert card loses its hold on focus",
      hud: ["        onMouseDown={hasWhy ? holdFocus : undefined}\n        className", "        className"],
      expect: /inert <div> no longer holds focus/,
    },
    {
      name: "the shell drops the scroller attribute",
      shell: ['data-hud-toast-scroller=""', 'data-hud-toast-list=""'],
      expect: /data-hud-toast-scroller/,
    },
    {
      name: "an anchor is renamed — the pin reports it cannot read, it does not pass",
      hud: ["function ViolationToast(", "function FaultToast("],
      expect: /^unresolved: ViolationToast$/,
    },
    {
      name: "a card root loses its <ToastGround /> — the pin cannot find the tag, and says so",
      hud: ["      <ToastGround />\n      {children}\n    </button>", "      {children}\n    </button>"],
      expect: /^unresolved: ToastShell's two card roots/,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const hud = c.hud ? mutate(HUD_SRC, c.hud[0], c.hud[1]) : HUD_SRC;
      const shell = c.shell ? mutate(SHELL_SRC, c.shell[0], c.shell[1]) : SHELL_SRC;
      const faults = wiringFaults(hud, shell);
      expect(faults.length, "the pin stayed green on a broken source").toBeGreaterThan(0);
      expect(faults.some((f) => c.expect.test(f)), faults.join(" · ")).toBe(true);
    });
  }
});
