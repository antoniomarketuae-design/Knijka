import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTapActivationState,
  createTapHandlers,
  tapClickActivates,
  tapOwnsPointerType,
  tapPointerCancel,
  tapPointerDown,
  tapPointerUp,
  tapPointWithin,
  TAP_CLICK_SUPPRESS_MS,
  type TapActivationState,
  type TapRect,
} from "../tapActivation";

/**
 * =============================================================================
 * EVERY BUTTON IN THE SIMULATOR, UNDER A SECOND FINGER — doc 91 · C2/D2/I2.
 *
 * THE MEASUREMENT THIS FILE PINS. With no finger on the glass, a tap on
 * «Мигач надясно» fires `pointerdown → pointerup → click`. With ONE finger
 * planted — on either pad, or on the bare canvas, so it is not pointer capture
 * — the identical tap fires `pointerdown → pointerup` and NO `click`. A `click`
 * born of a touch is a compatibility mouse event and the spec dispatches those
 * only for the PRIMARY touch point.
 *
 * So `onClick` — the idiom every one of these buttons used — is unreachable
 * during the only activity the product exists for. Both indicators, ALL THREE
 * GRADED MIRROR GLANCES, «Пауза», the ⚙ that opens the seatbelt sheet, every
 * cell in it, «РАЗБРАХ» on a teach card and every row of the lesson menu.
 *
 * WHY A UNIT TEST AND NOT A BROWSER SWEEP. The browser is what found this and
 * a browser is the wrong instrument to keep it found: reproducing it needs real
 * multi-touch (CDP `Input.dispatchTouchEvent` with explicit `touchPoints`
 * arrays — Playwright's touchscreen is single-tap and cannot do it), on a
 * viewport that actually reports `pointer: coarse`, on a box that has already
 * lied about that once this week. The rules below are arithmetic on a state
 * object, and arithmetic runs in every gate in 20 ms.
 *
 * WHAT THE ARITHMETIC CANNOT SEE, stated so nobody mistakes this for the whole
 * gate: it cannot tell you that the handlers are actually bound to a button.
 * The second half of this file reads the four call sites and asserts exactly
 * that, in the `tsconfigHygiene`/`buttonClasses` idiom this repo already uses.
 * =============================================================================
 */

/** A 44 px target at (100,100) — the real size of every control at issue. */
const TARGET: TapRect = { left: 100, top: 100, right: 144, bottom: 144 };
const CENTRE = { x: 122, y: 122 };

/** One finger's whole press, in one line. Returns whether the control acted. */
function press(
  state: TapActivationState,
  opts: {
    id?: number;
    kind?: string;
    up?: { x: number; y: number };
    rect?: TapRect;
    now?: number;
  } = {},
): boolean {
  const id = opts.id ?? 4; // the id the browser gave his throttle thumb
  tapPointerDown(state, id, opts.kind ?? "touch");
  return tapPointerUp(state, id, opts.up ?? CENTRE, opts.rect ?? TARGET, opts.now ?? 0);
}

// ---------------------------------------------------------------------------

describe("the defect itself: a touch acts with no click behind it", () => {
  it("a press and release inside the control fires — no `click` required", () => {
    const state = createTapActivationState();
    expect(press(state)).toBe(true);
  });

  it("and it fires the FIRST time, which is the whole complaint", () => {
    // C1's shape was a ref that latched; this one must be re-armable forever.
    const state = createTapActivationState();
    for (let i = 0; i < 50; i += 1) {
      expect(press(state, { id: 4 + i, now: i * 1000 })).toBe(true);
    }
  });
});

describe("the click path is untouched — mouse, keyboard, assistive", () => {
  it("a mouse pointer is not taken at all: `click` stays the mouse's way in", () => {
    expect(tapOwnsPointerType("mouse")).toBe(false);
    const state = createTapActivationState();
    expect(press(state, { kind: "mouse" })).toBe(false);
    // …and nothing was marked, so the mouse's own click runs normally.
    expect(tapClickActivates(state, 1, 0)).toBe(true);
  });

  it("touch and pen are taken; an unknown webview pointerType is taken too", () => {
    // Taking an unknown kind is at worst redundant (the mark de-duplicates the
    // click that follows). Skipping it would leave that webview with the dead
    // button this whole change exists to fix.
    for (const kind of ["touch", "pen", ""]) expect(tapOwnsPointerType(kind)).toBe(true);
  });

  it("a mouse press does not disarm a finger that is already down", () => {
    const state = createTapActivationState();
    tapPointerDown(state, 4, "touch");
    tapPointerDown(state, 1, "mouse"); // a hybrid laptop's cursor wanders in
    expect(tapPointerUp(state, 4, CENTRE, TARGET, 0)).toBe(true);
  });

  it("keyboard / screen-reader activation is NEVER suppressed", () => {
    // `detail === 0` is the tell: Enter/Space on a focused button, VoiceOver,
    // `element.click()`. Answered before the marks are even consulted, so no
    // confusion in the touch path can cost an assistive user their only way in.
    const state = createTapActivationState();
    press(state, { now: 0 });
    expect(state.pendingClicks.length).toBe(1);
    expect(tapClickActivates(state, 0, 0)).toBe(true);
    // …and it did not eat the mark the compatibility click is still owed.
    expect(state.pendingClicks.length).toBe(1);
  });
});

describe("no double fire — the way this change would double-toggle an indicator", () => {
  it("the compatibility click that follows our own activation is swallowed", () => {
    const state = createTapActivationState();
    expect(press(state, { now: 0 })).toBe(true);
    expect(tapClickActivates(state, 1, 8)).toBe(false);
  });

  it("the NEXT genuine click still fires — one mark, one click", () => {
    const state = createTapActivationState();
    press(state, { now: 0 });
    expect(tapClickActivates(state, 1, 8)).toBe(false);
    expect(tapClickActivates(state, 1, 9)).toBe(true);
  });

  it("TWO taps before EITHER click lands are two marks, not one", () => {
    // A flag would swallow one click and let the other through, and this
    // screen was measured at 29.6 React commits/s — event delivery does queue.
    const state = createTapActivationState();
    press(state, { id: 4, now: 0 });
    press(state, { id: 5, now: 120 });
    expect(tapClickActivates(state, 1, 130)).toBe(false);
    expect(tapClickActivates(state, 1, 131)).toBe(false);
    expect(tapClickActivates(state, 1, 132)).toBe(true);
  });

  it("a mark expires, so a click that never came cannot eat a later one", () => {
    // The multi-touch case IS the case where the click never comes.
    const state = createTapActivationState();
    press(state, { now: 0 });
    expect(tapClickActivates(state, 1, TAP_CLICK_SUPPRESS_MS + 1)).toBe(true);
  });

  it("marks are pruned on the press path too, so they cannot pile up", () => {
    // In the multi-touch case `tapClickActivates` is never called at all — this
    // is the only path that runs during a long session of dead clicks.
    const state = createTapActivationState();
    for (let i = 0; i < 200; i += 1) press(state, { id: 4 + i, now: i * 1000 });
    expect(state.pendingClicks.length).toBe(1);
  });

  it("a release OUTSIDE leaves no mark — a stray click after it still works", () => {
    const state = createTapActivationState();
    expect(press(state, { up: { x: 300, y: 300 } })).toBe(false);
    expect(state.pendingClicks.length).toBe(0);
    expect(tapClickActivates(state, 1, 1)).toBe(true);
  });
});

describe("a press that ends somewhere else must not act", () => {
  it("released outside the control: nothing happens", () => {
    // Touch pointers get IMPLICIT pointer capture, so `pointerup` is delivered
    // here whatever the finger did. Without the hit test this would be WORSE
    // than the `onClick` it replaces, which would not have fired either.
    const state = createTapActivationState();
    expect(press(state, { up: { x: 122, y: 260 } })).toBe(false);
  });

  it("one pixel out on any side is out", () => {
    const outs = [
      { x: 99, y: 122 },
      { x: 145, y: 122 },
      { x: 122, y: 99 },
      { x: 122, y: 145 },
    ];
    for (const up of outs) {
      expect(press(createTapActivationState(), { up })).toBe(false);
    }
  });

  it("but the edge itself is a press, not a miss", () => {
    const edges = [
      { x: 100, y: 100 },
      { x: 144, y: 100 },
      { x: 100, y: 144 },
      { x: 144, y: 144 },
    ];
    for (const up of edges) {
      expect(press(createTapActivationState(), { up })).toBe(true);
    }
  });

  it("a control that collapsed under the thumb is not still pressable", () => {
    const gone: TapRect = { left: 100, top: 100, right: 100, bottom: 100 };
    expect(press(createTapActivationState(), { rect: gone })).toBe(false);
    expect(tapPointWithin(CENTRE, gone)).toBe(false);
  });
});

describe("a wobble is not a change of mind — ±3 px still fires", () => {
  it("every direction, at the tolerance the audit held the pads to", () => {
    for (const dx of [-3, 0, 3]) {
      for (const dy of [-3, 0, 3]) {
        const up = { x: CENTRE.x + dx, y: CENTRE.y + dy };
        expect(press(createTapActivationState(), { up })).toBe(true);
      }
    }
  });

  it("and there are 19 px of headroom before a wobble could ever miss", () => {
    // Leaving a 44 px target means travelling ~22 px from its centre. That is
    // a decision, not a tremor — which is why no slop constant is needed here.
    const halfSpan = (TARGET.right - TARGET.left) / 2;
    expect(halfSpan - 3).toBeGreaterThanOrEqual(19);
  });
});

describe("a gesture the browser took away must not act", () => {
  it("pointercancel disarms: a scroll that started here is not a tap", () => {
    const state = createTapActivationState();
    tapPointerDown(state, 4, "touch");
    tapPointerCancel(state, 4);
    expect(tapPointerUp(state, 4, CENTRE, TARGET, 0)).toBe(false);
  });

  it("another finger's cancel does not disarm this one", () => {
    const state = createTapActivationState();
    tapPointerDown(state, 4, "touch");
    tapPointerCancel(state, 9);
    expect(tapPointerUp(state, 4, CENTRE, TARGET, 0)).toBe(true);
  });

  it("an unconditional reset is available for teardown", () => {
    const state = createTapActivationState();
    tapPointerDown(state, 4, "touch");
    tapPointerCancel(state);
    expect(tapPointerUp(state, 4, CENTRE, TARGET, 0)).toBe(false);
  });
});

describe("a press that was never ours must not act — the stray-touch rule", () => {
  it("a release with no press behind it fires nothing", () => {
    const state = createTapActivationState();
    expect(tapPointerUp(state, 4, CENTRE, TARGET, 0)).toBe(false);
  });

  it("a drag that began elsewhere and merely ENDS on the button fires nothing", () => {
    // This is the behaviour change the doc flags: on a screen where a finger is
    // always on the glass, a control that answers any passing pointer is a
    // hazard. Ownership is by `pointerId`, and this is where that is enforced.
    const state = createTapActivationState();
    tapPointerDown(state, 4, "touch"); // the throttle thumb, on the pad
    expect(tapPointerUp(state, 7, CENTRE, TARGET, 0)).toBe(false);
  });

  it("…and a foreign release does not steal the arm from the finger that owns it", () => {
    const state = createTapActivationState();
    tapPointerDown(state, 4, "touch");
    tapPointerUp(state, 7, CENTRE, TARGET, 0);
    expect(tapPointerUp(state, 4, CENTRE, TARGET, 0)).toBe(true);
  });

  it("one press, one activation: a second release of the same id is dead", () => {
    const state = createTapActivationState();
    tapPointerDown(state, 4, "touch");
    expect(tapPointerUp(state, 4, CENTRE, TARGET, 0)).toBe(true);
    expect(tapPointerUp(state, 4, CENTRE, TARGET, 1)).toBe(false);
  });
});

describe("it can never brick itself — the lesson C1 taught", () => {
  it("a press whose end we never see does not refuse the next one", () => {
    // C1: `drivePointer` kept a dead id and `if (… !== null) return;` then
    // refused every future touch for the rest of the session. `tapPointerDown`
    // OVERWRITES for exactly this reason.
    const state = createTapActivationState();
    tapPointerDown(state, 4, "touch"); // an ancestor takes capture; no up, no cancel
    tapPointerDown(state, 5, "touch");
    expect(tapPointerUp(state, 5, CENTRE, TARGET, 0)).toBe(true);
  });

  it("a second finger on the same button replaces the first, and still acts", () => {
    const state = createTapActivationState();
    tapPointerDown(state, 4, "touch");
    tapPointerDown(state, 5, "touch");
    expect(tapPointerUp(state, 4, CENTRE, TARGET, 0)).toBe(false);
    expect(tapPointerUp(state, 5, CENTRE, TARGET, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE COMPOSITION — the seam between a real event and the arithmetic above.
//
// Everything so far calls the four predicates DIRECTLY. Each one can be right
// while the wiring between them and a browser event is wrong, and nothing above
// would move: read `target` instead of `currentTarget` and every release is
// hit-tested against the 15 px glyph inside the button instead of the 44 px
// control; drop `event.detail` and the compatibility click stops being
// suppressed, which is a double-toggling indicator — a control that ends where
// it started, indistinguishable from the dead one being fixed.
//
// `createTapHandlers` exists so this runs in the gate. The environment here is
// `node` with no jsdom in it (component tests go through `react-dom/server`,
// which binds no handlers at all), so a hook cannot be driven — a factory can.
// ---------------------------------------------------------------------------

/** A button, with a rect that may change between press and release. */
function fakeButton(rect: () => TapRect) {
  return { getBoundingClientRect: rect };
}

/**
 * One control and one finger. `fired` counts ACTIVATIONS — the number the whole
 * change is about, since both failure modes (dead, and double-toggled) are a
 * wrong count and nothing else.
 */
function harness(rectAt: () => TapRect = () => TARGET) {
  let clock = 0;
  const fired: number[] = [];
  const state = createTapActivationState();
  const h = createTapHandlers(
    state,
    () => fired.push(clock),
    () => clock,
  );
  const target = fakeButton(rectAt);
  return {
    state,
    fired,
    at(ms: number) {
      clock = ms;
    },
    down(id: number, kind = "touch") {
      h.onPointerDown({ pointerId: id, pointerType: kind, clientX: 0, clientY: 0, currentTarget: target });
    },
    up(id: number, point = CENTRE, kind = "touch") {
      h.onPointerUp({
        pointerId: id,
        pointerType: kind,
        clientX: point.x,
        clientY: point.y,
        currentTarget: target,
      });
    },
    cancel(id: number, kind = "touch") {
      h.onPointerCancel({ pointerId: id, pointerType: kind, clientX: 0, clientY: 0, currentTarget: target });
    },
    /** `detail: 1` = a pointer was behind it; `0` = keyboard / AT / .click(). */
    click(detail = 1) {
      h.onClick({ detail });
    },
  };
}

describe("one press, one activation — the whole sequence, composed", () => {
  it("finger down, up, and the compatibility click that follows: acts ONCE", () => {
    // THE double-fire case. Twice would toggle «Мигач надясно» back off.
    const t = harness();
    t.down(4);
    t.up(4);
    t.at(8);
    t.click();
    expect(t.fired.length).toBe(1);
  });

  it("under a second finger the click never comes — and it still acts once", () => {
    // This IS the defect: with a thumb on the throttle no `click` is dispatched
    // at all, because a touch `click` is a compatibility event for the PRIMARY
    // touch point only. Before this module that meant zero activations.
    const t = harness();
    t.down(4);
    t.up(4);
    expect(t.fired.length).toBe(1);
  });

  it("two taps are two activations — suppression may never eat a real press", () => {
    const t = harness();
    t.down(4);
    t.up(4);
    t.at(8);
    t.click();
    t.at(400);
    t.down(5);
    t.up(5);
    t.at(408);
    t.click();
    expect(t.fired.length).toBe(2);
  });

  it("a mouse acts through its click, exactly as it always did", () => {
    // The pointer path declines the mouse outright, so the click is its ONLY
    // way in and there is nothing left to suppress it.
    const t = harness();
    t.down(1, "mouse");
    t.up(1, CENTRE, "mouse");
    expect(t.fired.length).toBe(0);
    t.click();
    expect(t.fired.length).toBe(1);
  });

  it("keyboard and assistive activation act, with no pointer events at all", () => {
    const t = harness();
    t.click(0);
    expect(t.fired.length).toBe(1);
  });

  it("…and are never suppressed by a mark a touch left behind", () => {
    const t = harness();
    t.down(4);
    t.up(4); // leaves a mark
    t.click(0); // Enter on the focused button, a beat later
    expect(t.fired.length).toBe(2);
  });
});

describe("the release is judged against the BUTTON, where it is at release", () => {
  it("a release anywhere inside the 44 px control fires, not just at centre", () => {
    // If `target` were read instead of `currentTarget`, the rect would be the
    // glyph's and a corner press would miss.
    const t = harness();
    t.down(4);
    t.up(4, { x: 101, y: 143 });
    expect(t.fired.length).toBe(1);
  });

  it("a control that MOVED under the thumb is judged where it now is", () => {
    // The rect is read on `pointerup`, not cached at `pointerdown`: a card that
    // scrolled or animated must not act on a release over empty road.
    let rect: TapRect = TARGET;
    const t = harness(() => rect);
    t.down(4);
    rect = { left: 300, top: 300, right: 344, bottom: 344 };
    t.up(4, CENTRE);
    expect(t.fired.length).toBe(0);
  });

  it("a press that releases outside acts NOT — and leaves the click intact", () => {
    // Touch gets implicit pointer capture, so `pointerup` is delivered here
    // wherever the finger actually lifted. Without the hit test this would be
    // worse than the `onClick` it replaces.
    const t = harness();
    t.down(4);
    t.up(4, { x: 122, y: 260 });
    expect(t.fired.length).toBe(0);
    t.click(); // a stray genuine click must still work
    expect(t.fired.length).toBe(1);
  });

  it("a ±3 px wobble still fires, in every direction", () => {
    for (const dx of [-3, 0, 3]) {
      for (const dy of [-3, 0, 3]) {
        const t = harness();
        t.down(4);
        t.up(4, { x: CENTRE.x + dx, y: CENTRE.y + dy });
        expect(t.fired.length, `wobble ${dx},${dy}`).toBe(1);
      }
    }
  });
});

describe("a gesture that was never a tap acts NOT, and costs nothing after", () => {
  it("pointercancel disarms, and the next press still works", () => {
    const t = harness();
    t.down(4);
    t.cancel(4);
    t.up(4);
    expect(t.fired.length).toBe(0);
    t.at(100);
    t.down(5);
    t.up(5);
    expect(t.fired.length).toBe(1);
  });

  it("a drag that began elsewhere and merely ENDS here does nothing", () => {
    // …and, crucially, leaves NO mark — so a genuine click after it is not
    // swallowed by a press this control never owned.
    const t = harness();
    t.up(7); // a foreign pointer's release, no `down` behind it
    expect(t.fired.length).toBe(0);
    t.click();
    expect(t.fired.length).toBe(1);
  });

  it("a press whose end we never see does not brick the control — the C1 rule", () => {
    const t = harness();
    t.down(4); // an ancestor takes capture: no up, no cancel, ever
    t.at(5000);
    t.down(5);
    t.up(5);
    expect(t.fired.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// THE CALL SITES. The arithmetic above is worthless if the handlers are not
// bound, and „bound" is a property of source text, not of a state object.
// ---------------------------------------------------------------------------

const SRC = path.resolve(__dirname, "../../../..");
const read = (rel: string): string => readFileSync(path.join(SRC, rel), "utf8");

/** These files carry long narrative comments that QUOTE the very markup being
 *  counted (SimOverlay's header quotes `<button aria-label="Скрий известието">`
 *  verbatim). Count the code, not the prose about the code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The source between two markers. `to` omitted = to the end of the file. */
function slice(source: string, from: string, to?: string): string {
  const a = source.indexOf(from);
  expect(a, `marker not found: ${from}`).toBeGreaterThanOrEqual(0);
  if (to === undefined) return source.slice(a);
  const b = source.indexOf(to, a + from.length);
  expect(b, `marker not found after ${from}: ${to}`).toBeGreaterThanOrEqual(0);
  return source.slice(a, b);
}

describe("the four call sites bind the pointer path", () => {
  it("TouchControls · GlyphButton — 8 arc stations, incl. all three glances", () => {
    const body = slice(
      stripComments(read("components/sim/TouchControls.tsx")),
      "function GlyphButton(",
      // `function HoldGlyphButton(` until 2026-08-12: the momentary idiom was
      // lifted out of that component into the `useHoldButton` hook when the top
      // rail's horn and the ⚙ sheet's clutch needed the same three release
      // paths. The claim this test makes is unchanged; only the next marker in
      // the file moved.
      "function useHoldButton(",
    );
    expect(body).toContain("useTapActivation(");
    expect(body).toContain("{...tap}");
    expect(body).not.toContain("onClick={onClick}");
  });

  it("TouchControls · SheetCell — every cell of the ⚙ sheet, incl. «КОЛАН»", () => {
    const body = slice(stripComments(read("components/sim/TouchControls.tsx")), "function SheetCell(");
    expect(body).toContain("useTapActivation(");
    expect(body).toContain("{...tap}");
    expect(body).not.toContain("onClick={onClick}");
  });

  it("SimOverlay — «РАЗБРАХ», «ЗАЩО» and the ✕, on the peek AND in the sheet", () => {
    const source = stripComments(read("modules/sim/hud/SimOverlay.tsx"));
    const buttons = source.match(/<button\b/g) ?? [];
    const spreads = source.match(/\{\.\.\.tap[A-Za-z]*\}/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    expect(spreads.length).toBe(buttons.length);
    // Not one `onClick` left in the file: on this surface EVERY control is a
    // touch control, so a bare one is the regression, not a style opinion.
    expect(source).not.toMatch(/onClick[=:]/);
  });

  it("LessonPlayShell · PlayMenu — the toggle and every row", () => {
    const source = stripComments(read("components/sim/lesson-ui/LessonPlayShell.tsx"));
    const menu = slice(source, "function PlayMenuRow(", "export function LessonPlayShell(");
    const buttons = menu.match(/<button\b/g) ?? [];
    expect(buttons.length).toBe(2); // the row, and МЕНЮ/ЗАТВОРИ
    expect(menu.match(/\{\.\.\.tap[A-Za-z]*\}/g)?.length).toBe(2);
    expect(menu).not.toMatch(/onClick[=:]/);
  });

  it("TraceTimeline · the demonstration deck — five transport controls", () => {
    // WHY THIS PANEL IS IN THE SAME CLASS AS THE FOUR ABOVE, measured rather
    // than assumed: the deck is anchored to the SAME `TOUCH_CONTROLS_FLOOR` as
    // the ⚙ sheet and stands over the drivetrain pad (TouchControls' own header
    // measures 6 240 px² of overlap with the deck merely COLLAPSED). Watching a
    // demonstration with a thumb on the throttle is the ordinary case.
    const source = stripComments(read("components/sim/lesson-ui/TraceTimeline.tsx"));
    expect(source.match(/\{\.\.\.tap[A-Za-z]*\}/g)?.length).toBe(5); // ▶ ⏮ ⏭ speed 🔁
    // The two survivors are DESKTOP-ONLY BRANCHES and must stay that way: the
    // annotation ticks (`touch ? null : ticks.map(…)`) and the speed pills
    // (`touch ? <one button> : SPEEDS.map(…)`). A mouse click was never broken,
    // and a hook cannot go inside a `.map` anyway.
    expect(source.match(/onClick[=:]/g)?.length).toBe(2);
    expect(source).toContain("touch\n        ? null\n        : ticks.map(");
    expect(source).toContain("const speedControl = touch ? (");
  });

  it("the horn keeps the idiom it always had — nothing regressed it to onClick", () => {
    // IT IS A HOOK NOW, AND THAT IS WHY THIS TEST MATTERS MORE, NOT LESS.
    // `HoldGlyphButton` was one component with one caller. On 2026-08-12 the
    // same three release paths became `useHoldButton`, shared by the rail's
    // «Клаксон» AND by the ⚙ sheet's «СЪЕД» — and a clutch latched down by a
    // lost pointer event freewheels the car, so the guarantee is now load-
    // bearing in two places instead of one.
    const source = stripComments(read("components/sim/TouchControls.tsx"));
    const hook = slice(source, "function useHoldButton(", "const RAIL_CLASS");
    for (const path of ["onPointerUp: end", "onPointerCancel: end", "onLostPointerCapture: end"]) {
      expect(hook, `every release path must clear the hold: ${path}`).toContain(path);
    }
    // …and an unmount is a release too: a quiz pause mid-honk must not latch
    // the horn, and a sheet that closes mid-shift must not latch the clutch.
    expect(hook).toContain("useEffect(() => end");
    // Both hold controls go through it — neither may grow its own handlers.
    for (const marker of ["function RailHoldButton(", "function SheetHoldCell("]) {
      const body = slice(source, marker, undefined).slice(0, 900);
      expect(body, `${marker} must use the shared hook`).toContain("useHoldButton(");
    }
  });
});

// ---------------------------------------------------------------------------
// THE CENSUS, AS A RATCHET — J-WAVE-4.
//
// Wave 1 fixed four call sites and wrote „every button fires with a second
// thumb planted". Wave 3 read that as a property of the SCREEN when it was a
// property of FOUR FILES, and went looking for a fifth defect at the gear
// cell. There is none — measured on the production build, `/simulator`, six
// device profiles, two genuine CDP touch points: «СЪЕД» held by one finger and
// «M►» pressed by another shifts N → M1 on all six. What there IS, and what
// nobody had counted, is the number below.
//
// THE PREMISE, RE-MEASURED ON THIS BUILD rather than inherited: with one finger
// planted on the road, all 35 controls reachable on the compact driving screen
// (bare · ⚙ sheet open · ☰ menu open) receive `pointerdown` and `pointerup`,
// and NOT ONE receives a `click`. So on that surface `onClick` is not a weaker
// binding — it is no binding at all, and the arithmetic below is the whole
// question of whether a control works.
//
// The list is a RATCHET, not a wish: it fails when a new `onClick`-only button
// appears on the driving surface, and it fails — asking to be updated — when
// one of the known-uncovered surfaces is fixed. Both are the point.
// ---------------------------------------------------------------------------

/** Counted the same way for every row, so no file gets a friendlier ruler. */
function activationCounts(rel: string): {
  buttons: number;
  pointer: number;
  onClick: number;
} {
  const s = stripComments(read(rel));
  return {
    buttons: (s.match(/<button\b/g) ?? []).length,
    pointer:
      (s.match(/\{\.\.\.tap[A-Za-z]*\}/g) ?? []).length +
      (s.match(/\{\.\.\.handlers\}/g) ?? []).length,
    onClick: (s.match(/onClick[=:]/g) ?? []).length,
  };
}

describe("the second-finger census of the compact driving surface", () => {
  /**
   * COVERED: every `<button>` in the file is reachable with a thumb already on
   * the glass, either through `useTapActivation` or through `useHoldButton`.
   * `desktopOnly` is the number that render only in a `touch ? … : …`
   * alternative branch — a mouse `click` fires under any number of other
   * fingers and always has, so those are correct as they are.
   */
  const COVERED = [
    { rel: "components/sim/TouchControls.tsx", pointer: 5, desktopOnly: 0 },
    // 6 → 7 on 2026-08-12: doc 91 §I11 gave the open sheet an «⤢» expand, and
    // this census is exactly the guard that says a NEW control on this surface
    // must arrive with a pointer path rather than an `onClick`. It did.
    { rel: "modules/sim/hud/SimOverlay.tsx", pointer: 7, desktopOnly: 0 },
    { rel: "components/sim/lesson-ui/TraceTimeline.tsx", pointer: 5, desktopOnly: 2 },
  ];
  it("LessonScene · the demonstration's own open/close toggle", () => {
    // The seam this closes: with the deck's five transport controls fixed and
    // this one left on `onClick`, a phone could PAUSE a demonstration with a
    // thumb on the throttle and then not shut it. A control that traps is worse
    // than one that is merely missing.
    const body = slice(
      stripComments(read("components/sim/LessonScene.tsx")),
      "const toggle = (",
      "aria-expanded={open}",
    );
    expect(body).toContain("{...tapToggle}");
    expect(body).not.toMatch(/onClick[=:]/);
    // `tabIndex={-1}` and the mousedown preventDefault are NOT what C2 is
    // about: this button must still refuse focus so the canvas keeps it.
    expect(body).toContain("tabIndex={-1}");
    expect(body).toContain("onMouseDown={(e) => e.preventDefault()}");
  });
  for (const row of COVERED) {
    it(`${row.rel} — every button on the phone has a pointer path`, () => {
      const c = activationCounts(row.rel);
      expect(c.pointer, "pointer-path bindings").toBe(row.pointer);
      expect(
        c.pointer + row.desktopOnly,
        `${row.rel}: ${c.buttons} <button> but only ${c.pointer} pointer paths ` +
          `and ${row.desktopOnly} allowed desktop-only. A control on this surface ` +
          `with only onClick is DEAD while a second finger is down — doc 91 §C2.`,
      ).toBe(c.buttons);
    });
  }

  /**
   * KNOWN UNCOVERED, PINNED SO IT CANNOT GROW. Every one of these renders on
   * the compact driving screen and every one of them is `onClick`-only. They
   * are not fixed here, and the reason is written down rather than implied:
   *
   *  · PreDriveChecklist — `LessonPlayShell:3300` says, in the source, that
   *    „another lane is reshaping [it] right now (the mouse-first pre-drive
   *    rework)" and carries `data-hud-keep`. Editing it from this side is the
   *    collision that marker exists to prevent. It reaches a phone through
   *    `SimOverlay`'s `renderDetail`, so its cells are genuinely at risk.
   *  · LessonScene — FOUR of its six now. The demonstration toggle was fixed
   *    first; **the menu-pause resume «Продължи» was fixed in doc 91 §R (W1)**,
   *    after wave 7 priced the residue on the product: on six of six profiles,
   *    with a thumb resting on the drive pad, «Пауза» → «Продължи» did nothing,
   *    and lifting the thumb made the identical press work. It is the one card
   *    a student raises WHILE DRIVING, so it was the expensive half of this
   *    debt. What is left: the tier pill segments (`display:none` on every
   *    compact stage since J-WAVE-3, so not a phone control at all), two roomy
   *    collapsibles, and the first-run touch hint's «Разбрах» — which is a
   *    compact control and is now the single honest residue.
   *
   * NOT IN THIS LIST, and each for a checked reason rather than an oversight:
   * `HudToasts` (roomy only — `LessonPlayShell:3031` renders it under
   * `compact ? null :`), and the modal cards (`TeachMomentOverlay`,
   * `MicroQuizOverlay`, `MistakeConsequenceOverlay`, `CalibrationGate`,
   * `SessionEndScreen`, `ExamBriefingCard`), which take `visible` away from the
   * touch overlay so the pads are gone while they are up. Those are a second-
   * order case — a finger still RESTING on the glass — not this one.
   */
  const UNCOVERED = [
    { rel: "modules/sim/hud/PreDriveChecklist.tsx", buttons: 8, pointer: 0 },
    { rel: "components/sim/LessonScene.tsx", buttons: 6, pointer: 2 },
  ];
  for (const row of UNCOVERED) {
    it(`${row.rel} — ${row.buttons - row.pointer} controls still onClick-only, and no more`, () => {
      const c = activationCounts(row.rel);
      expect(
        c.buttons - c.pointer,
        `${row.rel} had ${row.buttons - row.pointer} onClick-only controls on the compact ` +
          `driving surface and now has ${c.buttons - c.pointer}. Adding one is a new dead ` +
          `control; removing one means this number is stale and the debt should come down.`,
      ).toBe(row.buttons - row.pointer);
    });
  }
});
