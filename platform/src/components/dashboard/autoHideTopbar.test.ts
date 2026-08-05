import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTO_HIDE_MEDIA_QUERY,
  INITIAL_AUTO_HIDE_STATE,
  SCROLL_GESTURE_PX,
  TOPBAR_REVEAL_BAND_PX,
  TOPBAR_SLIDE_MS,
  QUESTION_SURFACE_SELECTOR,
  autoHideEventForPointer,
  autoHideReducer,
  isAutoHideRoute,
  isEdgeRevealPointer,
  type AutoHideEvent,
  type AutoHideState,
  type PointerPhase,
} from "./autoHideTopbar";

/**
 * THE TOP BAR STANDS DOWN WHILE A QUESTION IS UP — and cannot stop doing it
 * quietly.
 *
 * ROW C3 IS THE REASON THIS FILE IS SHAPED THE WAY IT IS. A fold selector
 * matched NOTHING for an entire phase and no test noticed, because the test
 * asserted that a selector string was present rather than that it FOUND
 * anything. The auto-hide has exactly the same failure mode and it is silent in
 * the same way: if `QUESTION_SURFACE_SELECTOR` stops matching, the bar simply
 * never leaves, row C5 re-opens, and every unit test about class names still
 * passes. So the handle is resolved here — the tag is looked for as a real
 * element in the real runners, and the count has to be non-zero — and the two
 * negatives (the result view, the consent form) are checked the same way rather
 * than assumed.
 *
 * WHAT IS PINNED, in the founder's words:
 *   „bar hidden when a question is up in landscape"  → §machine + §handle
 *   „bar returns on the gesture"                     → §machine + §ways back
 *   „bar never hidden in portrait"                   → §portrait
 * plus the two constraints that have already cost this project rows: no control
 * shrank to buy the space (C6), and nothing reflows under a moving bar (C8).
 */

const SRC = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");

const SHELL = read("components/dashboard/DashboardShell.tsx");
const PRACTICE = read("components/theory/PracticeSession.tsx");
const EXAM_RUNNER = read("components/exam/ExamRunner.tsx");
const EXAM_RESULT = read("components/exam/ExamResultView.tsx");
const OUTCOME = read("app/(dashboard)/outcome/outcome-client.tsx");
const GROUP_LAYOUT = read("app/(dashboard)/layout.tsx");
const GLOBALS = read("app/globals.css");
const QUESTION_BUDGET = read("components/theory/questionBudget.ts");

/** Strip whitespace so a formatter cannot redden an assertion about markup. */
const flat = (s: string) => s.replace(/\s+/g, "");

/**
 * Every OPENING TAG of `tag` that the file actually RENDERS. This is the
 * difference row C3 turns on: `expect(src).toContain("fieldset")` passes on a
 * comment, on an import and on a string in a fixture. This returns elements,
 * and an empty array is a failure.
 *
 * COMMENTS ARE STRIPPED FIRST, and that is not hygiene — it is the same bug one
 * layer up. This file's own first draft „found" two <main> elements in the
 * (dashboard) layout that were both PROSE („`<main>` used to be exactly as tall
 * as the page inside it") in a block comment above the real one. A guard that
 * can be satisfied by a sentence about the element is not a guard.
 */
function jsxElements(source: string, tag: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  return [...code.matchAll(new RegExp(`<${tag}(?=[\\s/>])[^>]*>`, "g"))].map(
    (m) => m[0],
  );
}

/** The `className={...}` / `className="..."` string that contains `needle`. */
function classListWith(source: string, needle: string): string {
  const at = source.indexOf(needle);
  if (at === -1) return "";
  const open = source.lastIndexOf("className", at);
  if (open === -1) return "";
  return source.slice(open, source.indexOf("\n", at) + 1);
}

/* ------------------------------------------------------------------ machine */

describe("the machine — hidden on a question, back on the gesture", () => {
  const run = (...events: AutoHideEvent[]): AutoHideState =>
    events.reduce(autoHideReducer, INITIAL_AUTO_HIDE_STATE);

  it("starts in flow: the bar is where it has always been", () => {
    expect(INITIAL_AUTO_HIDE_STATE).toEqual({
      armed: false,
      hidden: false,
      anchorY: 0,
    });
  });

  /**
   * ARMING **IS** HIDING, in one commit. If the two were separate frames the
   * reclaimed 48px would arrive after `useQuestionBudget` had already clamped
   * the question against the old height — and that hook only ever shrinks
   * within a question, so the bar would be gone and the question STILL cut off.
   */
  it("hides on the same commit that takes the bar out of flow", () => {
    expect(run({ type: "arm", y: 0 })).toEqual({
      armed: true,
      hidden: true,
      anchorY: 0,
    });
  });

  it("is idempotent — a re-render does not re-hide a bar the student revealed", () => {
    const revealed = run({ type: "arm", y: 0 }, { type: "reveal" });
    expect(revealed.hidden).toBe(false);
    expect(autoHideReducer(revealed, { type: "arm", y: 0 })).toBe(revealed);
  });

  /** The question went away (result view, summary, rotation, route change). */
  it("puts the bar back IN FLOW when it stands down", () => {
    const after = run(
      { type: "arm", y: 0 },
      { type: "scroll", y: 300 },
      { type: "disarm" },
    );
    expect(after.armed).toBe(false);
    expect(after.hidden).toBe(false);
  });

  it("comes back on an upward scroll", () => {
    const after = run(
      { type: "arm", y: 400 },
      { type: "scroll", y: 400 - SCROLL_GESTURE_PX },
    );
    expect(after.hidden).toBe(false);
  });

  it("leaves again on a downward scroll", () => {
    const after = run(
      { type: "arm", y: 400 },
      { type: "scroll", y: 380 },
      { type: "scroll", y: 380 + SCROLL_GESTURE_PX },
    );
    expect(after.hidden).toBe(true);
  });

  /**
   * A slow drag must ACCUMULATE into a gesture. If the anchor moved on every
   * pixel the bar could only ever be revealed by a flick, which is the opposite
   * of what a student who has just realised the nav is missing will do.
   */
  it("accumulates a slow drag instead of eating it a pixel at a time", () => {
    let state = run({ type: "arm", y: 400 });
    for (let i = 1; i < SCROLL_GESTURE_PX; i += 1) {
      state = autoHideReducer(state, { type: "scroll", y: 400 - i });
      expect(state.hidden).toBe(true); // still under the threshold
    }
    state = autoHideReducer(state, { type: "scroll", y: 400 - SCROLL_GESTURE_PX });
    expect(state.hidden).toBe(false);
  });

  it("re-hides when the student goes back to the question", () => {
    const after = run({ type: "arm", y: 0 }, { type: "reveal" }, { type: "dismiss" });
    expect(after.hidden).toBe(true);
  });

  /* --- §portrait: THE PROPERTY THAT MUST NEVER REGRESS --------------------- */

  /**
   * Portrait passes 18 of 18 and this change must not cost a single one of
   * them. Nothing that is not `armed` can ever be `hidden` — not a scroll, not
   * a reveal, not a dismiss, in any order — so on a viewport that never arms
   * (see §portrait viewport below) the bar is structurally unhideable.
   */
  it("cannot hide the bar while it is not armed — in any event order", () => {
    const events: AutoHideEvent[] = [
      { type: "scroll", y: 500 },
      { type: "scroll", y: 0 },
      { type: "reveal" },
      { type: "dismiss" },
      { type: "disarm" },
    ];
    for (const a of events) {
      for (const b of events) {
        for (const c of events) {
          expect(run(a, b, c).hidden).toBe(false);
        }
      }
    }
  });
});

/* ------------------------------------------------------------ ways back */

describe("the way back is reachable without knowing it exists", () => {
  it("takes a tap anywhere in the top band", () => {
    for (const y of [0, 1, 20, TOPBAR_REVEAL_BAND_PX]) {
      expect(isEdgeRevealPointer({ clientY: y, onInteractiveTarget: false })).toBe(
        true,
      );
    }
  });

  it("is thumb-sized — the same 44px every touch target in this app is held to", () => {
    expect(TOPBAR_REVEAL_BAND_PX).toBe(44);
    expect(
      isEdgeRevealPointer({
        clientY: TOPBAR_REVEAL_BAND_PX + 1,
        onInteractiveTarget: false,
      }),
    ).toBe(false);
  });

  /**
   * A tap aimed at a CONTROL is never a reveal. Revealing puts 48px back into
   * the flow, and doing that between a finger going down and coming up on an
   * answer option would move the option out from under it.
   */
  it("never steals a tap that was aimed at a control", () => {
    expect(isEdgeRevealPointer({ clientY: 2, onInteractiveTarget: true })).toBe(
      false,
    );
  });

  it("the shell brings the bar back when focus enters it", () => {
    expect(SHELL).toContain("onFocusCapture={topbar.reveal}");
  });
});

/* ------------------------------------------------------------- the whole tap */

/**
 * §THE WHOLE TAP — the block that exists because the screen said something 54
 * green tests did not.
 *
 * The first cut decided reveal on pointer-DOWN and dismiss on pointer-UP, in
 * two handlers. Both halves were covered and both were right. A TAP IS BOTH
 * HALVES, about 50 ms apart, so the edge tap revealed the bar and dismissed it
 * again before the frame was painted: photographed at 852x393 on WebKit, the
 * „bar back after the gesture" frame came out byte-identical to the „bar gone"
 * one, `data-topbar-hidden` still `on`, the bar still at y=-48. The founder's
 * primary way back did not work at all.
 *
 * So a gesture is now replayed END TO END here — the same pure function the
 * hook's listeners call, then the reducer — and what is asserted is the state a
 * student would be looking at, not the event that was dispatched.
 */
describe("§the whole tap — a gesture is a down AND an up", () => {
  /** Replay a tap through exactly what the DOM listeners do. */
  const tap = (
    state: AutoHideState,
    at: { y: number; onInteractiveTarget?: boolean; insideTopbar?: boolean; insideDialog?: boolean },
    /** Engines that send both `touch*` and `pointer*` deliver each phase twice. */
    { duplicated = false }: { duplicated?: boolean } = {},
  ): AutoHideState => {
    let next = state;
    const phases: PointerPhase[] = duplicated
      ? ["down", "down", "up", "up"]
      : ["down", "up"];
    for (const phase of phases) {
      const event = autoHideEventForPointer({
        phase,
        clientY: at.y,
        insideTopbar: at.insideTopbar ?? false,
        insideDialog: at.insideDialog ?? false,
        onInteractiveTarget: at.onInteractiveTarget ?? false,
      });
      if (event) next = autoHideReducer(next, event);
    }
    return next;
  };

  const hiddenBar = autoHideReducer(INITIAL_AUTO_HIDE_STATE, { type: "arm", y: 0 });

  it("A TAP ON THE EDGE LEAVES THE BAR ON SCREEN", () => {
    expect(hiddenBar.hidden).toBe(true); // precondition, stated
    expect(tap(hiddenBar, { y: 8 }).hidden).toBe(false);
  });

  /**
   * The same tap on an engine that sends BOTH event families. A „this gesture
   * already revealed" flag would be cleared by the first `up` and let the
   * second one dismiss — which is why the decision is stateless instead.
   */
  it("survives an engine that sends touch AND pointer for one tap", () => {
    expect(tap(hiddenBar, { y: 8 }, { duplicated: true }).hidden).toBe(false);
  });

  it("anywhere in the band, not just the very top pixel", () => {
    for (const y of [0, 1, 22, TOPBAR_REVEAL_BAND_PX]) {
      expect(tap(hiddenBar, { y }).hidden, `y=${y}`).toBe(false);
    }
  });

  /** …and the bar still stands down when the student goes back to the question. */
  it("a tap on the question re-hides the bar", () => {
    const revealed = tap(hiddenBar, { y: 8 });
    expect(tap(revealed, { y: 300 }).hidden).toBe(true);
  });

  it("a tap that was aimed at an answer never moves the bar", () => {
    // Down is refused (it was aimed at a control); the lift is outside the
    // band, so the bar stands down — it never appears under the finger.
    const after = tap(hiddenBar, { y: 20, onInteractiveTarget: true });
    expect(after.hidden).toBe(true);
    expect(tap(hiddenBar, { y: 200, onInteractiveTarget: true }).hidden).toBe(true);
  });

  it("the bar's own controls and the open drawer are left alone", () => {
    const revealed = tap(hiddenBar, { y: 8 });
    expect(tap(revealed, { y: 20, insideTopbar: true })).toBe(revealed);
    expect(tap(revealed, { y: 200, insideDialog: true })).toBe(revealed);
  });

  /** The phase-by-phase decisions, so a regression names itself. */
  it.each([
    ["down in the band", "down" as const, 8, { type: "reveal" }],
    ["up in the band — the tail of the reveal tap, NOT a dismiss", "up" as const, 8, null],
    ["down on the content", "down" as const, 300, null],
    ["up on the content", "up" as const, 300, { type: "dismiss" }],
  ])("%s", (_name, phase, y, expected) => {
    expect(
      autoHideEventForPointer({
        phase,
        clientY: y,
        insideTopbar: false,
        insideDialog: false,
        onInteractiveTarget: false,
      }),
    ).toEqual(expected);
  });

  /**
   * THE HOOK MUST GO THROUGH THIS FUNCTION. Everything above is worth nothing
   * if a listener starts deciding for itself again — which is exactly how the
   * defect got in. The two phases are passed literally, and both event families
   * are wired, because WebKit's `touchscreen.tap()` sends `touchstart` and no
   * `pointerdown` at all: the first cut of the gesture was dead on the only
   * engine this product is measured on.
   */
  it("the hook decides taps ONLY through this function", () => {
    const HOOK = read("components/dashboard/autoHideTopbar.ts");
    // The listener effect ONLY — up to its dependency array. Slicing to the end
    // of the file would sweep in `reveal`, the focus callback, whose whole job
    // is to dispatch a reveal; a guard that a legitimate line trips is a guard
    // someone deletes.
    const from = HOOK.indexOf("const onScroll =");
    const to = HOOK.indexOf("}, [state.armed]);", from);
    expect(from, "the listener effect moved").toBeGreaterThan(-1);
    expect(to, "the listener effect's dependency array moved").toBeGreaterThan(from);
    const listeners = HOOK.slice(from, to);
    expect(listeners).toContain("autoHideEventForPointer({");
    expect(listeners).toContain('onPointer("down")');
    expect(listeners).toContain('onPointer("up")');
    // No hand-rolled dispatch in a listener — the reason the halves diverged.
    expect(listeners).not.toMatch(/dispatch\(\{\s*type:\s*"(reveal|dismiss)"/);
    for (const type of ["pointerdown", "touchstart", "pointerup", "touchend"]) {
      expect(HOOK).toContain(`"${type}"`);
    }
  });
});

/* ------------------------------------------------------------------- handle */

describe("§handle — the thing it keys on is a thing that exists", () => {
  const scopeId = /^#([\w-]+)\s+(\w+)$/.exec(QUESTION_SURFACE_SELECTOR);

  const [, SCOPE, TAG] = scopeId ?? ["", "", ""];

  /** Every assertion below is vacuous if this one fails — so it fails first. */
  it("is a scope + a tag, both of which can be resolved", () => {
    expect(scopeId).not.toBeNull();
    expect(SCOPE.length).toBeGreaterThan(0);
    expect(TAG.length).toBeGreaterThan(0);
  });

  /** The scope. `#main-content` is the group layout's own content region. */
  it("scopes to the <main> the app actually renders", () => {
    const mains = jsxElements(GROUP_LAYOUT, "main");
    expect(mains.length).toBeGreaterThan(0);
    expect(mains.some((el) => el.includes(`id="${SCOPE}"`))).toBe(true);
  });

  /**
   * THE POSITIVES. Not „the source mentions fieldset" — the elements are
   * enumerated, and zero of them is a failure. This is the assertion row C3
   * says has to exist: if either runner stops rendering the element, the bar
   * silently stops hiding on that surface and this goes red instead.
   */
  it.each([
    ["the practice runner", () => PRACTICE],
    ["the exam runner", () => EXAM_RUNNER],
  ])("finds a live question on %s", (_name, source) => {
    expect(jsxElements(source(), TAG).length).toBeGreaterThan(0);
  });

  /**
   * THE NEGATIVES, and they are the „must not hide where the student needs to
   * leave quickly" half of the ruling. The exam result view is the screen a
   * student lands on after 40 minutes; if it carried the handle the bar would
   * stay away on it.
   */
  it("finds nothing on the exam result view — the bar is never hidden there", () => {
    expect(jsxElements(EXAM_RESULT, TAG)).toHaveLength(0);
  });

  it("the practice summary returns BEFORE the question markup", () => {
    const summaryReturn = PRACTICE.indexOf("return <SessionSummary");
    const question = PRACTICE.indexOf(`<${TAG}`);
    expect(summaryReturn).toBeGreaterThan(-1);
    expect(question).toBeGreaterThan(summaryReturn);
  });

  /**
   * WHY THE ROUTE GATE IS LOAD-BEARING RATHER THAN BELT-AND-BRACES: /outcome is
   * the „как мина изпитът?" consent form and it renders the same element. It is
   * a GDPR surface a student must be able to walk away from, so the handle
   * alone would be wrong there — and if someone ever deletes the route gate as
   * redundant, this is the test that explains what it was for.
   */
  it("the consent form carries the same element, which is why routes are gated", () => {
    expect(jsxElements(OUTCOME, TAG).length).toBeGreaterThan(0);
    expect(isAutoHideRoute("/outcome")).toBe(false);
  });
});

describe("§routes — only a question RUNNER may take the bar away", () => {
  it.each([
    "/theory/practice",
    "/exams/cm8fake0001",
    "/exams/cm8fake0001/",
    "/dev/fold-rig",
  ])("arms on %s", (path) => {
    expect(isAutoHideRoute(path)).toBe(true);
  });

  it.each([
    "/",
    "/dashboard",
    "/theory",
    "/theory/pravila",
    "/exams",
    "/exams/",
    "/outcome",
    "/settings",
    "/pricing",
    "/simulator",
    "/classroom",
  ])("never arms on %s", (path) => {
    expect(isAutoHideRoute(path)).toBe(false);
  });
});

/* ----------------------------------------------------------------- portrait */

describe("§portrait viewport — 18 of 18 cannot be regressed by this", () => {
  const maxHeight = /max-height:\s*(\d+)px/.exec(AUTO_HIDE_MEDIA_QUERY);
  const maxWidth = /max-width:\s*(\d+)px/.exec(AUTO_HIDE_MEDIA_QUERY);

  it("is height-gated at the same 520px cut the rest of the app uses", () => {
    expect(maxHeight).not.toBeNull();
    expect(Number(maxHeight?.[1])).toBe(520);
    // The two other places that spell this number, so a change to one of them
    // cannot leave the bar hiding on a viewport nothing else calls „short".
    expect(GLOBALS).toContain("@custom-variant short (@media (max-height: 520px))");
    expect(QUESTION_BUDGET).toContain('"(max-height: 520px)"');
  });

  /**
   * The arithmetic, stated rather than trusted: the SHORTEST portrait viewport
   * this product is measured on is an iPhone 16 with Safari's toolbars up, at
   * 745px, and the Android floor is 780. Both are far above the cut, so a
   * portrait phone cannot match the query and cannot arm — which is what makes
   * „do not change portrait behaviour" a property instead of an intention.
   */
  it.each([745, 780, 812, 852])("cannot match a %ipx-tall portrait phone", (h) => {
    expect(h).toBeGreaterThan(Number(maxHeight?.[1]));
  });

  /** …and a landscape phone (393px, or the 360px Android floor) does match. */
  it.each([360, 393])("does match a %ipx-tall landscape phone", (h) => {
    expect(h).toBeLessThanOrEqual(Number(maxHeight?.[1]));
  });

  /**
   * The width half keeps it off `lg`, where the sidebar is the navigation and
   * this bar is `lg:hidden` anyway. 1023 is Tailwind's `lg` (1024px) minus one.
   */
  it("stays below lg, where the sidebar is the navigation", () => {
    expect(Number(maxWidth?.[1])).toBe(1023);
    expect(SHELL).toContain("lg:hidden");
  });
});

/* -------------------------------------------------------------------- shell */

describe("§shell — a transform, not a reflow (C8), and no shrunken control (C6)", () => {
  const HEADER = (() => {
    const at = SHELL.indexOf("data-app-topbar");
    if (at === -1) return "";
    return SHELL.slice(SHELL.lastIndexOf("<header", at), SHELL.indexOf("</header>", at));
  })();

  /**
   * THE 48px COMES FROM LEAVING THE FLOW, and it is the one thing a transform
   * cannot do on its own: translating a `sticky` flex item slides a picture of
   * the bar away and hands the page nothing back.
   */
  it("swaps sticky for fixed while armed, and back when it stands down", () => {
    // The slice has to have found the element, or the whole block is vacuous.
    expect(HEADER).toContain("data-app-topbar");
    expect(HEADER).toContain("fixed inset-x-0 top-0");
    expect(HEADER).toContain('"sticky top-0"');
    expect(HEADER).toContain("topbar.armed");
  });

  /** The hide itself is a transform and nothing else. */
  it("hides on translateY and animates ONLY the transform", () => {
    expect(HEADER).toContain("-translate-y-full");
    expect(HEADER).toContain("transition-transform");
    // `transition-all` (or a height/margin/padding transition) would reflow the
    // page under a moving element on every frame — exactly what the C8 probe's
    // „elements moved" counts.
    expect(HEADER).not.toContain("transition-all");
    expect(HEADER).not.toMatch(/transition-\[(height|margin|padding|top)/);
    expect(HEADER).not.toMatch(/\bh-\[/); // no animated height either
  });

  it("disables the slide under prefers-reduced-motion", () => {
    expect(HEADER).toContain("motion-reduce:transition-none");
    expect(HEADER).toContain(`transitionDuration: \`\${TOPBAR_SLIDE_MS}ms\``);
    expect(TOPBAR_SLIDE_MS).toBeGreaterThan(0);
  });

  /**
   * A `fixed` bar resolves against the VIEWPORT, so <body>'s safe-area padding
   * never reaches it — the same trap that put the nav drawer's rows 43px inside
   * a landscape notch (shellStability.test.ts §1). It only pays them while it
   * is fixed; while sticky it is inside the padded box and would double up.
   */
  it("pays its own safe-area insets while it is out of flow", () => {
    expect(flat(HEADER)).toContain(
      flat(`paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))"`),
    );
    expect(flat(HEADER)).toContain(
      flat(`paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))"`),
    );
    for (const use of HEADER.match(/env\(safe-area-inset-[a-z]+[^)]*\)/g) ?? []) {
      expect(use).toMatch(/,\s*0px\s*\)$/);
    }
  });

  /**
   * ROW C6 WAS CLOSED ON „0 controls under 44px on any dashboard route", and
   * shrinking this button was the option the founder rejected by name when he
   * ruled on C5. The space came from moving the bar; the hamburger is untouched.
   */
  it("did not shrink the hamburger to buy the space", () => {
    expect(HEADER).toContain("min-h-11 min-w-11");
  });

  it("still states the bar's own height — the 48px is reclaimed, not trimmed", () => {
    expect(HEADER).toContain("h-16");
    expect(HEADER).toContain("short:h-12");
  });

  it("publishes its state so a probe can read it instead of guessing", () => {
    expect(HEADER).toContain("data-topbar-armed");
    expect(HEADER).toContain("data-topbar-hidden");
  });
});

describe("§affordance — visible, and not a control", () => {
  const HANDLE = (() => {
    const at = SHELL.indexOf("data-topbar-handle");
    if (at === -1) return "";
    return SHELL.slice(SHELL.lastIndexOf("<div", at), SHELL.indexOf("</div>", at));
  })();

  it("is drawn whenever the bar is away", () => {
    expect(SHELL).toContain("topbar.armed && topbar.hidden ?");
    // A slice that found nothing would make every assertion below vacuously
    // true — the row C3 shape again, one level down.
    expect(HANDLE.length).toBeGreaterThan(0);
    expect(HANDLE).toContain("data-topbar-handle");
  });

  /**
   * NOT A BUTTON. A 3px control would be a control under 44px on a dashboard
   * route — the row C6 finding again — and a 44px one would be an invisible
   * slab sitting on top of the question. So it is decorative and the gesture is
   * a passive pointer test (see §ways back).
   */
  it("is decorative — aria-hidden, inert, and not an interactive element", () => {
    expect(HANDLE).toContain("aria-hidden");
    expect(HANDLE).toContain("pointer-events-none");
    expect(jsxElements(HANDLE, "button")).toHaveLength(0);
    expect(jsxElements(HANDLE, "a")).toHaveLength(0);
    expect(jsxElements(HANDLE, "input")).toHaveLength(0);
    expect(HANDLE).not.toContain("onClick");
    expect(HANDLE).not.toContain("tabIndex");
  });

  it("is actually visible — a lit hairline, not a transparent hotspot", () => {
    expect(HANDLE).toContain("bg-accent-2");
    expect(HANDLE).toContain("fixed inset-x-0 top-0");
  });

  /**
   * AND IT COSTS THE QUESTION NOTHING. It is drawn inside the top padding
   * <main> already had, so none of the reclaimed 48px goes back and no element
   * on the page is overlapped — which is the other thing the C8 probe counts.
   * Both numbers are read out of the real sources, so shrinking `short:py-1`
   * without shrinking the handle turns this red.
   */
  it("fits inside the padding <main> already had — 0 of the 48px given back", () => {
    const handlePx = Number(/h-\[(\d+)px\]/.exec(HANDLE)?.[1]);
    const mainClass = classListWith(GROUP_LAYOUT, "short:py-");
    const mainPadRem = Number(/short:py-(\d+(?:\.\d+)?)/.exec(mainClass)?.[1]);
    expect(Number.isFinite(handlePx)).toBe(true);
    expect(Number.isFinite(mainPadRem)).toBe(true);
    expect(handlePx).toBeLessThanOrEqual(mainPadRem * 4); // Tailwind: 1 unit = 4px
  });
});
