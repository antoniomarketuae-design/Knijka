import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  driveAxisFromPadY,
  PadPointer,
  steerFromDrag,
  TOUCH_DRIVE_ABSOLUTE_RANGE_PX,
  TOUCH_STEER_RANGE_PX,
  TouchInputSource,
} from "@/modules/sim/engine";
import type { CabinControls } from "@/modules/sim/scene/cabin";
import {
  DRIVE_ARIA_CENTRE_TEXT,
  driveAxisAria,
  publishAxisAria,
  STEER_ARIA_CENTRE_TEXT,
  steerAxisAria,
  TouchControls,
} from "./TouchControls";

/**
 * =============================================================================
 * THE CONTROL THAT REPORTED ITSELF CENTRED AT FULL LOCK — sc-zebra-approach,
 * finding 952e056d, verified in source at TouchControls.tsx:2357 and :2408.
 *
 * Both thumb pads are `role="slider"`. Both declare `aria-valuemin={-100}` and
 * `aria-valuemax={100}`. Both hardcoded `aria-valuenow={0}` as a LITERAL, and
 * nothing anywhere updated it: the knob is moved through a ref and a DOM style
 * (deliberately — a `setState` at gesture rate is a rendering bug on this
 * screen), so the visible control tracked the thumb while the ACCESSIBLE value
 * stayed at centre at every position either pad can reach.
 *
 * ── WHY THAT IS A DEFECT AND NOT A GAP ──────────────────────────────────────
 *
 * Declaring a min and a max is a promise that the position is readable. A
 * student who cannot see the screen asks the wheel where it is, is told
 * „centre", and has no way to discover otherwise, because every position
 * answers the same. On a phone this pad is the ONLY way to drive and the
 * audience is 17–18-year-olds. And doc 64 THEO-4: a bare number is a verdict —
 * the pad now says what the number MEANS.
 *
 * ── HOW THIS FILE IS BUILT TO SURVIVE THE OBVIOUS NEUTRALISATION ────────────
 *
 * The defect BEING FIXED is a field pinned to a constant, so a test that only
 * checked „an `aria-valuenow` attribute is written" would be satisfied by
 * writing the constant `0` on every event — the same shape as the original bug
 * and green. Every row below therefore compares the ANNOUNCED value against the
 * value the car is actually being driven on, read back out of
 * `TouchInputSource.mergeInto` — the same merge `SimInput.read()` performs. A
 * pin cannot pass that, because the car would have to stop moving too.
 *
 * §3 mounts the REAL component against a fake window and drives its REAL
 * handlers (there is no DOM in this project's vitest config, `environment:
 * "node"` — the technique and its justification are documented at length in
 * touchPadRelease.test.tsx, whose harness this one is a trimmed copy of). The
 * pads' nodes are recorders, so „which attribute was written, with what, and in
 * what order" is observable without a browser.
 * =============================================================================
 */

/* ═══ §1 THE WHEEL, AS ARITHMETIC ═══════════════════════════════════════════ */

describe("§1 steerAxisAria — the wheel announces the value it is steering on", () => {
  it("centre is centre, and says why that matters", () => {
    const aria = steerAxisAria(steerFromDrag(0, TOUCH_STEER_RANGE_PX));
    expect(aria.valueNow).toBe(0);
    expect(aria.valueText).toBe(STEER_ARIA_CENTRE_TEXT);
    expect(aria.valueText).toContain("прави"); // the wheels, not the number
  });

  it("full lock reaches the ends of the range it advertises — both of them", () => {
    const right = steerAxisAria(steerFromDrag(TOUCH_STEER_RANGE_PX, TOUCH_STEER_RANGE_PX));
    const left = steerAxisAria(steerFromDrag(-TOUCH_STEER_RANGE_PX, TOUCH_STEER_RANGE_PX));
    // This is the finding in one pair of lines: before the fix both of these
    // were 0, inside a control declaring aria-valuemin=-100/aria-valuemax=100.
    expect(right.valueNow).toBe(100);
    expect(left.valueNow).toBe(-100);
    expect(right.valueText).toContain("надясно");
    expect(left.valueText).toContain("наляво");
    // THEO-4, and the mirror of §2's «до дупка» / «аварийно спиране»: the end of
    // the range carries its MEANING and not only its number. Without this pair
    // the sentence could decay to a bare «Волан 100% надясно» — still passing
    // the two `toContain`s above, and still a verdict rather than an
    // instructor. (Added by the verifier: a degraded full-lock sentence was
    // one of four edits this file could not see.)
    expect(right.valueText).toContain("пълен волан");
    expect(left.valueText).toContain("пълен волан");
    expect(
      steerAxisAria(steerFromDrag(42, TOUCH_STEER_RANGE_PX)).valueText,
    ).not.toContain("пълен волан");
  });

  it("the sign is the SCREEN's, and it is flipped exactly once", () => {
    // engine convention is +1 = LEFT (`steerFromDrag`'s own last line). A
    // slider whose value fell as the thumb moved right would be a second
    // convention for a reader to hold; the flip lives in one function.
    const dragRight = steerFromDrag(40, TOUCH_STEER_RANGE_PX);
    expect(dragRight).toBeLessThan(0); // engine: right is negative
    expect(steerAxisAria(dragRight).valueNow).toBeGreaterThan(0); // slider: positive
  });

  it("every reachable position gets its own number — a pin cannot pass this", () => {
    const dxs = [-84, -63, -42, -21, 0, 21, 42, 63, 84];
    const announced = dxs.map(
      (dx) => steerAxisAria(steerFromDrag(dx, TOUCH_STEER_RANGE_PX)).valueNow,
    );
    expect(new Set(announced).size).toBe(dxs.length);
    // …and monotonic with the thumb, which is what „readable position" means.
    for (let i = 1; i < announced.length; i++) {
      expect(announced[i]).toBeGreaterThan(announced[i - 1]!);
    }
    expect(Math.min(...announced)).toBe(-100);
    expect(Math.max(...announced)).toBe(100);
  });

  it("stays inside the range the element advertises", () => {
    for (const dx of [-500, -84, 0, 84, 500]) {
      const { valueNow } = steerAxisAria(steerFromDrag(dx, TOUCH_STEER_RANGE_PX));
      expect(valueNow).toBeGreaterThanOrEqual(-100);
      expect(valueNow).toBeLessThanOrEqual(100);
    }
  });
});

/* ═══ §2 THE DRIVETRAIN AXIS, INCLUDING THE MODE THAT SWAPS IT ══════════════ */

/** The pad box the component reads with `getBoundingClientRect()`. */
const PAD_TOP = 100;
const PAD_H = 152;
const PAD_CENTRE_Y = PAD_TOP + PAD_H / 2;
const FULL = TOUCH_DRIVE_ABSOLUTE_RANGE_PX;

function axisAt(clientY: number): number {
  return driveAxisFromPadY(clientY, PAD_CENTRE_Y);
}

describe("§2 driveAxisAria — up, down, and the mode where those two trade places", () => {
  it("the neutral band is a POSITION, and it is explained as one", () => {
    const aria = driveAxisAria(axisAt(PAD_CENTRE_Y), false);
    expect(aria.valueNow).toBe(0);
    expect(aria.valueText).toBe(DRIVE_ARIA_CENTRE_TEXT);
    expect(aria.valueText).toContain("инерция");
  });

  it("a floored pedal announces a floored pedal, in both directions", () => {
    const gas = driveAxisAria(axisAt(PAD_CENTRE_Y - FULL), false);
    const brake = driveAxisAria(axisAt(PAD_CENTRE_Y + FULL), false);
    expect(gas.valueNow).toBe(100);
    expect(brake.valueNow).toBe(-100);
    expect(gas.valueText).toContain("Газ");
    expect(brake.valueText).toContain("Спирачка");
    // THEO-4: the extremes carry their consequence, not only their number.
    expect(gas.valueText).toContain("до дупка");
    expect(brake.valueText).toContain("аварийно спиране");
  });

  it("partial pedal is partial, and distinct from both ends", () => {
    const half = driveAxisAria(axisAt(PAD_CENTRE_Y - FULL / 2), false);
    expect(half.valueNow).toBeGreaterThan(0);
    expect(half.valueNow).toBeLessThan(100);
    expect(half.valueText).toContain("Газ");
    expect(half.valueText).not.toContain("до дупка");
  });

  it("IN R WITH THE ASSIST LIVE THE SENTENCE FOLLOWS THE SWAP, not the pad", () => {
    // `applyReversePedalRemap` exchanges the two channels downstream, so „up"
    // is the brake and „down" is the reverse accelerator — the same fact
    // `driveAxisLabelBg` already carries. A pad announcing «Газ 80%» while the
    // car was braking would be this file's own defect, one mode over.
    const up = driveAxisAria(axisAt(PAD_CENTRE_Y - FULL), true);
    const down = driveAxisAria(axisAt(PAD_CENTRE_Y + FULL), true);
    expect(up.valueText).toContain("Спирачка");
    expect(down.valueText).toContain("Заден ход");
    // The NUMBER is the pad's geometry and does not move with the mode: up is
    // still +100. Only the meaning of that number changed.
    expect(up.valueNow).toBe(100);
    expect(down.valueNow).toBe(-100);
  });

  it("…and does not follow it when the swap is off", () => {
    expect(driveAxisAria(axisAt(PAD_CENTRE_Y - FULL), false).valueText).toContain("Газ");
    expect(driveAxisAria(axisAt(PAD_CENTRE_Y + FULL), false).valueText).not.toContain(
      "Заден ход",
    );
  });

  it("centre says the same thing in both modes — no pedal down, R feels like D", () => {
    expect(driveAxisAria(0, true).valueText).toBe(driveAxisAria(0, false).valueText);
  });
});

/* ═══ §3 THE WIRING — the real component, its real handlers, a recording node ═ */

/** As much of a pad's node as these handlers actually touch. */
interface RecordingPadEl {
  attrs: Record<string, string>;
  setAttribute(name: string, value: string): void;
  setPointerCapture(pointerId: number): void;
  getBoundingClientRect(): { top: number; height: number };
}

function recordingPadEl(top = PAD_TOP, height = PAD_H): RecordingPadEl {
  const attrs: Record<string, string> = {};
  return {
    attrs,
    setAttribute(name, value) {
      attrs[name] = value;
    },
    setPointerCapture() {},
    getBoundingClientRect: () => ({ top, height }),
  };
}

type PadProps = Record<string, unknown>;

interface Mounted {
  touch: TouchInputSource;
  /** `[left = steering, right = drivetrain]`, in render order. */
  pads: [PadProps, PadProps];
  /**
   * Put the cabin into a state and render again.
   *
   * The only reason this exists is `reverseGestureRef`, which is assigned
   * DURING RENDER from the cabin's selector letter — so the swapped-channel
   * sentence («Заден ход» instead of «Газ») is unreachable from a harness that
   * mounts once. §2 proves the sentence; this proves the component actually
   * feeds it the mode.
   *
   * The cabin snapshot is component state, and state slots are the only ones
   * holding a bare `null` (refs hold `{current: …}`), so the first such slot is
   * `snap`. That is an inference about hook ORDER, which is exactly the kind of
   * thing that rots — so it is SELF-CHECKED: the caller asserts the pad's
   * `aria-label` changed to the R sentence, which only happens if the right
   * slot was written. A wrong guess fails loudly instead of quietly asserting
   * nothing.
   *
   * It re-renders and deliberately does NOT re-run the effects: nothing below
   * needs one, and a second copy of the axis watchdog's interval would be the
   * harness testing itself rather than the component.
   */
  setGear(gearLabel: string): [PadProps, PadProps];
  /**
   * Raise or dismiss a card — the `hidden` prop the shell drives from
   * „paused ‖ quiz ‖ teach ‖ consequence ‖ end".
   *
   * This is the FOURTH release edge and the one doc 91 §C1 was written about,
   * so it is also the one whose aria half must not go unwatched: `parkKnobs`
   * releases both axes AND brings both announced positions home in the same
   * call. Re-renders and runs only the effects THAT RENDER ADDED, so the
   * hide-effect fires exactly once and the axis watchdog is not stacked.
   */
  setHidden(hidden: boolean): [PadProps, PadProps];
}

const restoreGlobals: Array<() => void> = [];
afterEach(() => {
  while (restoreGlobals.length) restoreGlobals.pop()?.();
});

function mountOverlay(): Mounted {
  const touch = new TouchInputSource();
  const fakeWindow = {
    addEventListener() {},
    removeEventListener() {},
    setInterval: () => 1,
    clearInterval() {},
    localStorage: { getItem: () => null },
  };
  const fakeDocument = { documentElement: { dataset: {} as Record<string, string> } };
  const g = globalThis as Record<string, unknown>;
  const hadWindow = "window" in g;
  const hadDocument = "document" in g;
  const prevWindow = g.window;
  const prevDocument = g.document;
  g.window = fakeWindow;
  g.document = fakeDocument;
  restoreGlobals.push(() => {
    if (hadWindow) g.window = prevWindow;
    else delete g.window;
    if (hadDocument) g.document = prevDocument;
    else delete g.document;
  });

  const slots: Array<{ v: unknown }> = [];
  const effects: Array<() => (() => void) | void> = [];
  let cursor = 0;
  const slot = <T,>(init: () => T): { v: unknown } => {
    if (cursor === slots.length) slots.push({ v: init() });
    return slots[cursor++]!;
  };
  const dispatcher = {
    useState<T>(initial: T | (() => T)) {
      const s = slot(() => (typeof initial === "function" ? (initial as () => T)() : initial));
      return [
        s.v as T,
        (update: unknown) => {
          s.v = typeof update === "function" ? (update as (p: unknown) => unknown)(s.v) : update;
        },
      ];
    },
    useRef<T>(initial: T) {
      return slot(() => ({ current: initial })).v;
    },
    useCallback: <T,>(fn: T) => fn,
    useMemo: <T,>(fn: () => T) => fn(),
    useEffect(fn: () => (() => void) | void) {
      effects.push(fn);
    },
    useLayoutEffect(fn: () => (() => void) | void) {
      effects.push(fn);
    },
    useDebugValue() {},
    useId: () => ":r0:",
  };
  const internals = (
    React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H: unknown };
    }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  expect(internals, "React's dispatcher slot has moved — this harness is blind").toBeTruthy();
  const shared = internals as { H: unknown };
  const props = {
    touch,
    cabinRef: { current: null } as { current: CabinControls | null },
    hidden: false,
    onToggleCamera: () => undefined,
    onPause: () => undefined,
    onReset: () => undefined,
    onToggleFullscreen: null,
  } as Parameters<typeof TouchControls>[0];

  const render = (): [PadProps, PadProps] => {
    const previousDispatcher = shared.H;
    cursor = 0;
    let tree: unknown;
    try {
      shared.H = dispatcher;
      tree = TouchControls(props);
    } finally {
      shared.H = previousDispatcher;
    }
    const found = collectSliders(tree);
    expect(found.length, "both pads must still render as sliders").toBe(2);
    return [found[0]!, found[1]!];
  };

  const runEffectsAddedSince = (before: number) => {
    for (const run of effects.slice(before)) run();
  };

  const pads = render();
  runEffectsAddedSince(0);
  const padPointers = slots.map((s) => s.v).filter((v): v is PadPointer => v instanceof PadPointer);
  expect(padPointers.length, "the two PadPointers must be component state").toBe(2);

  return {
    touch,
    pads,
    setGear(gearLabel: string) {
      const nulls = slots.filter((s) => s.v === null);
      expect(nulls.length, "the cabin snapshot must still be a nullable state slot").toBeGreaterThan(
        0,
      );
      nulls[0]!.v = { gearLabel, transmission: "automatic" };
      const before = effects.length;
      const next = render();
      // The mode change is not a pointer event, so the only thing that can
      // re-announce it is an effect from THIS render (see the block beside
      // `reverseGesture` in the component). Running them is what makes the
      // held-thumb row below able to fail.
      runEffectsAddedSince(before);
      return next;
    },
    setHidden(hidden: boolean) {
      (props as unknown as { hidden: boolean }).hidden = hidden;
      const before = effects.length;
      const next = render();
      runEffectsAddedSince(before);
      return next;
    },
  };
}

/** Every `role="slider"` element's props, depth-first — i.e. in render order. */
function collectSliders(node: unknown, found: PadProps[] = []): PadProps[] {
  if (Array.isArray(node)) {
    for (const child of node) collectSliders(child, found);
    return found;
  }
  if (!React.isValidElement(node)) return found;
  const props = node.props as PadProps & { children?: unknown };
  if (props.role === "slider") found.push(props);
  if (props.children !== undefined) collectSliders(props.children, found);
  return found;
}

type Handler = (e: unknown) => void;
const handler = (pad: PadProps, name: string): Handler => {
  const fn = pad[name];
  expect(typeof fn, `the pad must still wire ${name}`).toBe("function");
  return fn as Handler;
};

/** What `SimInput.read()` hands the merge — a car being driven on nothing else,
 *  so whatever comes back out is exactly what this overlay commanded. */
function merged(touch: TouchInputSource) {
  const out = { steer: 0, throttle: 0, brake: 0, handbrake: false, clutch: 0 };
  touch.mergeInto(out);
  return out;
}

const announced = (el: RecordingPadEl): number => Number(el.attrs["aria-valuenow"]);

/** `Math.round(-0 * 100)` is `-0`, and `toBe` is `Object.is`. The component
 *  normalises centre to `+0` deliberately (an `aria-valuenow="-0"` in the
 *  markup would be its own small lie); this keeps the EXPECTATION from being
 *  the thing that differs. */
const plusZero = (n: number): number => (n === 0 ? 0 : n);

describe("§3 THE WIRING — what the pad SAYS is what the car is DRIVEN on", () => {
  it("the markup's at-rest values are honest, and the range is still declared", () => {
    const { pads } = mountOverlay();
    for (const pad of pads) {
      expect(pad["aria-valuemin"]).toBe(-100);
      expect(pad["aria-valuemax"]).toBe(100);
      expect(pad["aria-valuenow"]).toBe(0); // true before the first press
    }
    expect(pads[0]["aria-valuetext"]).toBe(STEER_ARIA_CENTRE_TEXT);
    expect(pads[1]["aria-valuetext"]).toBe(DRIVE_ARIA_CENTRE_TEXT);
    // …AND THE NUMBER IS ANNOUNCED AGAINST THE RIGHT AXIS. `role="slider"`
    // defaults to horizontal, which is true of the wheel and false of the
    // drivetrain pad — whose whole ruling is „up is forward, middle is stop,
    // down is backwards". A vertical control described as horizontal is the
    // same lie as a pinned value, one attribute over.
    expect(pads[0]["aria-orientation"]).toBeUndefined(); // horizontal by default
    expect(pads[1]["aria-orientation"]).toBe("vertical");
  });

  it("THE REGRESSION: the wheel at full lock no longer reports itself centred", () => {
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[0], "onPointerDown")({ pointerId: 4, clientX: 200, currentTarget: el });
    // Full lock right: the gesture is relative, so this is the start x plus the
    // whole published range.
    handler(pads[0], "onPointerMove")({
      pointerId: 4,
      clientX: 200 + TOUCH_STEER_RANGE_PX,
      currentTarget: el,
    });

    expect(merged(touch).steer).toBe(-1); // engine: full RIGHT lock
    expect(announced(el)).toBe(100); // slider: the far end of its own range
    expect(announced(el)).not.toBe(0); // …which is what the finding measured
    expect(el.attrs["aria-valuetext"]).toContain("надясно");
  });

  it("…and tracks the thumb through the middle rather than only at the ends", () => {
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[0], "onPointerDown")({ pointerId: 4, clientX: 200, currentTarget: el });

    const seen: number[] = [];
    for (const dx of [-84, -40, 0, 40, 84]) {
      handler(pads[0], "onPointerMove")({ pointerId: 4, clientX: 200 + dx, currentTarget: el });
      // THE LOAD-BEARING ROW. The announced value is compared against the value
      // that was just handed to the physics, not against a recomputation of the
      // pixel geometry — so a pin, a stale write or a drifted second copy of the
      // curve all fail here together.
      expect(announced(el)).toBe(plusZero(Math.round(-merged(touch).steer * 100)));
      seen.push(announced(el));
    }
    expect(new Set(seen).size).toBe(5);
  });

  it("a release springs the announced value back to centre too", () => {
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[0], "onPointerDown")({ pointerId: 4, clientX: 200, currentTarget: el });
    handler(pads[0], "onPointerMove")({ pointerId: 4, clientX: 120, currentTarget: el });
    expect(announced(el)).not.toBe(0);

    handler(pads[0], "onPointerUp")({ pointerId: 4, currentTarget: el });
    expect(merged(touch).steer).toBe(0);
    expect(announced(el)).toBe(0);
    expect(el.attrs["aria-valuetext"]).toBe(STEER_ARIA_CENTRE_TEXT);
  });

  it("THE REGRESSION, PEDAL SIDE: a floored throttle is not announced as centre", () => {
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[1], "onPointerDown")({
      pointerId: 7,
      clientY: PAD_CENTRE_Y - FULL,
      currentTarget: el,
    });
    expect(merged(touch).throttle).toBe(1);
    expect(announced(el)).toBe(100);
    expect(el.attrs["aria-valuetext"]).toContain("Газ");
  });

  it("…and a floored brake reports the other end of the same range", () => {
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[1], "onPointerDown")({
      pointerId: 7,
      clientY: PAD_CENTRE_Y + FULL,
      currentTarget: el,
    });
    expect(merged(touch).brake).toBe(1);
    expect(announced(el)).toBe(-100);
    expect(el.attrs["aria-valuetext"]).toContain("Спирачка");
  });

  it("the pedal's announced value equals the pedal the car is being given", () => {
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[1], "onPointerDown")({ pointerId: 7, clientY: PAD_CENTRE_Y, currentTarget: el });
    for (const y of [PAD_CENTRE_Y - FULL, PAD_CENTRE_Y - 40, PAD_CENTRE_Y, PAD_CENTRE_Y + 40, PAD_CENTRE_Y + FULL]) {
      handler(pads[1], "onPointerMove")({ pointerId: 7, clientY: y, currentTarget: el });
      const { throttle, brake } = merged(touch);
      // One channel is ever held (`driveApply`), so the signed axis is the
      // difference — and that is the number the slider must be reporting.
      expect(announced(el)).toBe(plusZero(Math.round((throttle - brake) * 100)));
    }
  });

  it("the neutral band announces neutral rather than nothing", () => {
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[1], "onPointerDown")({
      pointerId: 7,
      clientY: PAD_CENTRE_Y - FULL,
      currentTarget: el,
    });
    handler(pads[1], "onPointerMove")({ pointerId: 7, clientY: PAD_CENTRE_Y, currentTarget: el });
    expect(merged(touch).throttle).toBe(0);
    expect(announced(el)).toBe(0);
    expect(el.attrs["aria-valuetext"]).toBe(DRIVE_ARIA_CENTRE_TEXT);
  });

  it("IN R THE LIVE PAD ANNOUNCES THE SWAP, not only the pure function", () => {
    const mounted = mountOverlay();
    // Self-check that the harness reached the cabin at all: the pad's
    // accessible NAME is the shipped, already-tested statement of this mode
    // (`driveAxisLabelBg`), so if this changed, the component really is in R.
    const before = String(mounted.pads[1]["aria-label"]);
    const pads = mounted.setGear("R");
    const after = String(pads[1]["aria-label"]);
    expect(after).not.toBe(before);
    expect(after).toContain("надолу назад"); // the swapped-channel label

    // …and now the announced sentence, through the real handler.
    const el = recordingPadEl();
    handler(pads[1], "onPointerDown")({
      pointerId: 7,
      clientY: PAD_CENTRE_Y + FULL,
      currentTarget: el,
    });
    // Down is the REVERSE ACCELERATOR here. A pad that said «Спирачка 100%»
    // while the car pulled backwards would be the original defect in words
    // instead of numbers.
    expect(el.attrs["aria-valuetext"]).toContain("Заден ход");
    expect(announced(el)).toBe(-100);

    handler(pads[1], "onPointerMove")({
      pointerId: 7,
      clientY: PAD_CENTRE_Y - FULL,
      currentTarget: el,
    });
    expect(el.attrs["aria-valuetext"]).toContain("Спирачка");
    expect(el.attrs["aria-valuetext"]).not.toContain("Газ");
  });

  it("a release brings the PEDAL's announced value home too", () => {
    // The wheel's release edge is asserted three tests up; the pedal's was not,
    // and it is the worse of the two to lose. A wheel springs back on its own,
    // but a pad still announcing «Газ 100%» after the thumb has gone is telling
    // a student who cannot see the knob that the car is still accelerating.
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[1], "onPointerDown")({
      pointerId: 7,
      clientY: PAD_CENTRE_Y - FULL,
      currentTarget: el,
    });
    expect(announced(el)).toBe(100);

    handler(pads[1], "onPointerUp")({ pointerId: 7, currentTarget: el });
    expect(merged(touch).throttle).toBe(0);
    expect(announced(el)).toBe(0);
    expect(el.attrs["aria-valuetext"]).toBe(DRIVE_ARIA_CENTRE_TEXT);
  });

  it("A HIDE BRINGS BOTH ANNOUNCED POSITIONS HOME — the teach-card edge", () => {
    // THE FOURTH EDGE, and the one this component's history is about (doc 91
    // §C1). A card takes the screen, `releaseTouchControls` drops both axes and
    // both pads' pointer ownership, and `parkKnobs` has to bring the ANNOUNCED
    // position home in the same call. `aria-hidden` covers the subtree only
    // while the card is up: it comes back on dismissal, and a pad that returned
    // to the tree still claiming a floored throttle would be claiming a
    // throttle the hide released — the original defect, on the one edge no
    // gesture can correct, because a motionless thumb emits no pointermove.
    const mounted = mountOverlay();
    const wheel = recordingPadEl();
    const pedal = recordingPadEl();
    handler(mounted.pads[0], "onPointerDown")({
      pointerId: 4,
      clientX: 200,
      currentTarget: wheel,
    });
    handler(mounted.pads[0], "onPointerMove")({
      pointerId: 4,
      clientX: 200 - TOUCH_STEER_RANGE_PX,
      currentTarget: wheel,
    });
    handler(mounted.pads[1], "onPointerDown")({
      pointerId: 7,
      clientY: PAD_CENTRE_Y - FULL,
      currentTarget: pedal,
    });
    expect(announced(wheel)).toBe(-100);
    expect(announced(pedal)).toBe(100);

    mounted.setHidden(true);

    // The axes are released — the car must not be driven through a card …
    const out = merged(mounted.touch);
    expect([out.steer, out.throttle, out.brake]).toEqual([0, 0, 0]);
    // … and the two pads say so.
    expect(announced(wheel)).toBe(0);
    expect(announced(pedal)).toBe(0);
    expect(wheel.attrs["aria-valuetext"]).toBe(STEER_ARIA_CENTRE_TEXT);
    expect(pedal.attrs["aria-valuetext"]).toBe(DRIVE_ARIA_CENTRE_TEXT);
  });

  it("an ADOPTED WHEEL gesture announces too — the second door, on BOTH pads", () => {
    // The drive pad's adopt door is covered below. The wheel's was not, and the
    // two are the same code written twice, which is this file's own stated
    // reason for distrusting one copy on the evidence of the other.
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[0], "onPointerMove")({
      pointerId: 9,
      buttons: 1,
      clientX: 200,
      currentTarget: el,
    });
    // The wheel is RELATIVE: adoption seats the origin under the finger, so the
    // position that proves the node was seated is the next move on it.
    handler(pads[0], "onPointerMove")({
      pointerId: 9,
      buttons: 1,
      clientX: 200 + TOUCH_STEER_RANGE_PX,
      currentTarget: el,
    });
    expect(merged(touch).steer).toBe(-1); // engine: full RIGHT lock
    expect(announced(el)).toBe(100);
    expect(el.attrs["aria-valuetext"]).toContain("надясно");
  });

  it("THE SWAP ARRIVES UNDER A HELD THUMB, and the pad re-announces without one", () => {
    // LAW 1 (`reverseAssist.ts`): „brake held at a standstill for
    // REVERSE_ASSIST_HOLD_S toggles the direction of travel". So D→R happens
    // WITH THE PEDAL STILL DOWN — the finger that caused it emits no
    // `pointermove`, and every publish in the gesture path is a pointer event.
    // A thumb that does not wobble would therefore be told «Спирачка 100% —
    // аварийно спиране» after „down" had stopped meaning brake: the finding's
    // own defect, arriving through the one door a gesture cannot close.
    const mounted = mountOverlay();
    const el = recordingPadEl();
    handler(mounted.pads[1], "onPointerDown")({
      pointerId: 7,
      clientY: PAD_CENTRE_Y + FULL,
      currentTarget: el,
    });
    expect(el.attrs["aria-valuetext"]).toContain("Спирачка");

    // …the selector goes to R. NO pointer event follows — this is the whole row.
    mounted.setGear("R");

    expect(el.attrs["aria-valuetext"]).toContain("Заден ход");
    expect(el.attrs["aria-valuetext"]).not.toContain("Спирачка");
    // The POSITION did not move, because the thumb did not: only its meaning.
    expect(announced(el)).toBe(-100);
  });

  it("…and a pad NOBODY is holding is not re-announced by a mode change", () => {
    // The counterpart invariant: A MODE CHANGE MUST NEVER RESURRECT A POSITION
    // NO FINGER IS COMMANDING. The component states it twice — the effect skips
    // an unowned pad, and every release edge clears the recorded axis — and this
    // row asserts the OUTCOME, not which of the two delivered it. Measured by
    // mutation 2026-08-22: removing either one alone leaves this green, because
    // the other still holds. That is two guards for one invariant, which is
    // deliberate here (a future edit that forgets to clear must not become a
    // lying pad) — but it is why this row is not evidence for either guard on
    // its own, and saying so is cheaper than a reader assuming it is.
    const mounted = mountOverlay();
    const el = recordingPadEl();
    handler(mounted.pads[1], "onPointerDown")({
      pointerId: 7,
      clientY: PAD_CENTRE_Y + FULL,
      currentTarget: el,
    });
    handler(mounted.pads[1], "onPointerUp")({ pointerId: 7, currentTarget: el });
    expect(announced(el)).toBe(0);

    mounted.setGear("R");

    expect(announced(el)).toBe(0);
    expect(el.attrs["aria-valuetext"]).toBe(DRIVE_ARIA_CENTRE_TEXT);
  });

  it("an ADOPTED gesture announces too — the second door does what the first does", () => {
    // `adoptable()` is a full second entrance (a thumb already on the glass when
    // a teach card is dismissed). A door that captured the pointer and drove the
    // car but left the announced value behind would restore the exact defect for
    // the one student most likely to meet it.
    const { touch, pads } = mountOverlay();
    const el = recordingPadEl();
    handler(pads[1], "onPointerMove")({
      pointerId: 9,
      buttons: 1,
      clientY: PAD_CENTRE_Y - FULL,
      currentTarget: el,
    });
    expect(merged(touch).throttle).toBe(1);
    expect(announced(el)).toBe(100);
  });
});

/* ═══ §4 THE WRITER ═════════════════════════════════════════════════════════ */

describe("§4 publishAxisAria — both attributes or neither", () => {
  it("writes the number AND the sentence, in one call", () => {
    const el = recordingPadEl();
    publishAxisAria(el, { valueNow: -73, valueText: "Спирачка 73%." });
    expect(el.attrs["aria-valuenow"]).toBe("-73");
    expect(el.attrs["aria-valuetext"]).toBe("Спирачка 73%.");
  });

  it("is a no-op before a pad's node has been seated", () => {
    expect(() => publishAxisAria(null, steerAxisAria(0))).not.toThrow();
  });
});
