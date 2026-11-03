/**
 * A test-only mount of the REAL phone drive pad (TouchControls) and of the
 * REAL desktop mouse pedals (MousePedals), for pinning what their pointer
 * handlers hand the touch source — sc-turn-left-oncoming:d0017a65, integrator
 * rulings R7 / R8 / R10 (2026-11-01).
 *
 * There is no DOM in this project's vitest config, so the component body is
 * run once against a minimal hooks dispatcher: its state is real, its effects
 * run in order, nothing re-renders (the technique, why it is admissible and
 * how it fails loudly if React moves the slot are written up in
 * touchPadRelease.test.tsx «THE LIVE HARNESS»). Callers stub `window` /
 * `document` / `navigator` / `requestAnimationFrame` first (`browserStubs`).
 *
 * Not a test file: imported by components/sim/__tests__/pedalStampsOverlay
 * .test.tsx and engine/__tests__/reverseAssist-cadence.test.ts.
 */
import * as React from "react";
import type { TouchInputSource } from "@/modules/sim/engine";
import type { CabinControls } from "@/modules/sim/scene/cabin";
import { TouchControls } from "../TouchControls";
import { MousePedals } from "../lesson-ui/MousePedals";

type Props = Record<string, unknown>;
type Handlers = Record<string, (e: unknown) => void>;

/** What TouchControls' and MousePedals' effects touch on `window`. */
export function browserStubs(extraWindow: Record<string, unknown> = {}): Record<string, unknown> {
  let nextTimer = 1;
  return {
    window: {
      addEventListener() {},
      removeEventListener() {},
      setInterval: () => nextTimer++,
      clearInterval() {},
      setTimeout: () => nextTimer++,
      clearTimeout() {},
      localStorage: { getItem: () => null },
      ...extraWindow,
    },
    document: { documentElement: { dataset: {} as Record<string, string> } },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => undefined,
  };
}

/** Run one function component's body once; its effects run in order. */
export function runComponent(component: unknown, props: Props): unknown {
  const slots: Array<{ v: unknown }> = [];
  const effects: Array<() => unknown> = [];
  let cursor = 0;
  const slot = (init: () => unknown): { v: unknown } => {
    if (cursor === slots.length) slots.push({ v: init() });
    return slots[cursor++]!;
  };
  const dispatcher = {
    useState(initial: unknown) {
      const s = slot(() => (typeof initial === "function" ? (initial as () => unknown)() : initial));
      return [
        s.v,
        (update: unknown) => {
          s.v = typeof update === "function" ? (update as (p: unknown) => unknown)(s.v) : update;
        },
      ];
    },
    useRef(initial: unknown) {
      return slot(() => ({ current: initial })).v;
    },
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useEffect(fn: () => unknown) {
      effects.push(fn);
    },
    useLayoutEffect(fn: () => unknown) {
      effects.push(fn);
    },
    useDebugValue() {},
    useId: () => ":r0:",
  };
  const internals = (
    React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H: unknown } }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (!internals) throw new Error("React's dispatcher slot has moved — this harness is blind");
  const previous = internals.H;
  let tree: unknown;
  try {
    internals.H = dispatcher;
    tree = (component as (p: Props) => unknown)(props);
  } finally {
    internals.H = previous;
  }
  for (const run of effects) run();
  return tree;
}

/** Every element whose props satisfy `pick`, depth-first (render order). */
export function collect(node: unknown, pick: (props: Props) => boolean, found: React.ReactElement[] = []): React.ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, pick, found);
    return found;
  }
  if (!React.isValidElement(node)) return found;
  const props = node.props as Props & { children?: unknown };
  if (pick(props)) found.push(node);
  if (props.children !== undefined) collect(props.children, pick, found);
  return found;
}

/** The drive pad's box: top 100, height 152 → its middle is at clientY 176. */
export const PAD_TOP = 100;
export const PAD_HEIGHT = 152;
export const PAD_MIDDLE_Y = PAD_TOP + PAD_HEIGHT / 2;
/** Past the 66 px pedal range below the middle: a full brake. */
export const PAD_BRAKE_Y = PAD_MIDDLE_Y + 80;
/** Past the 66 px pedal range above the middle: full throttle. */
export const PAD_THROTTLE_Y = PAD_MIDDLE_Y - 80;

export interface PadSample {
  clientY: number;
  timeStamp: number;
}

export interface DrivePad {
  /** A pointerdown at `s`. */
  down(s: PadSample, pointerId?: number): void;
  /** ONE frame-aligned pointermove carrying `samples` (oldest first) in its
   *  `getCoalescedEvents()`; the event itself is the last of them.
   *  `coalesced: "absent"` — a browser without the method (the event alone);
   *  `"empty"` — the method returns []. */
  move(samples: readonly PadSample[], pointerId?: number, coalesced?: "list" | "absent" | "empty"): void;
  /** A pointerup at `s`. */
  up(s: PadSample, pointerId?: number): void;
}

/** Mount the REAL TouchControls on `touch` and hand back its drive pad. */
export function mountDrivePad(touch: TouchInputSource): DrivePad {
  const tree = runComponent(TouchControls, {
    touch,
    cabinRef: { current: null } as { current: CabinControls | null },
    onToggleCamera: () => undefined,
    onPause: () => undefined,
    onReset: () => undefined,
    onToggleFullscreen: null,
    hidden: false,
  });
  const sliders = collect(tree, (p) => p.role === "slider");
  if (sliders.length !== 2) throw new Error(`expected the steer and the drive pad, found ${sliders.length} sliders`);
  const pad = sliders[1]!.props as Handlers;
  const el = {
    setPointerCapture() {},
    setAttribute() {},
    getBoundingClientRect: () => ({ top: PAD_TOP, height: PAD_HEIGHT }),
  };
  const event = (pointerId: number, s: PadSample, coalesced: readonly PadSample[] | null | undefined) => ({
    pointerId,
    buttons: 1,
    button: 0,
    pointerType: "touch",
    clientX: 0,
    clientY: s.clientY,
    timeStamp: s.timeStamp,
    currentTarget: el,
    target: el,
    preventDefault() {},
    stopPropagation() {},
    nativeEvent:
      coalesced === undefined
        ? { clientY: s.clientY, timeStamp: s.timeStamp }
        : { clientY: s.clientY, timeStamp: s.timeStamp, getCoalescedEvents: () => coalesced ?? [] },
  });
  return {
    down: (s, id = 1) => pad.onPointerDown!(event(id, s, undefined)),
    move: (samples, id = 1, coalesced = "list") => {
      const last = samples[samples.length - 1]!;
      pad.onPointerMove!(event(id, last, coalesced === "list" ? samples : coalesced === "empty" ? null : undefined));
    },
    up: (s, id = 1) => pad.onPointerUp!(event(id, s, undefined)),
  };
}

export interface MousePedalButtons {
  brake: Handlers;
  throttle: Handlers;
}

/** Mount the REAL MousePedals on `touch` and render its two Pedal buttons. */
export function mountMousePedals(touch: TouchInputSource): MousePedalButtons {
  const tree = runComponent(MousePedals, { touch, hidden: false });
  const pedals = collect(tree, (p) => typeof p.onValue === "function");
  if (pedals.length !== 2) throw new Error(`expected the brake and the throttle pedal, found ${pedals.length}`);
  const button = (pedal: React.ReactElement): Handlers => {
    const found = collect(runComponent(pedal.type, pedal.props as Props), (p) => typeof p.onPointerDown === "function");
    if (found.length !== 1) throw new Error("a Pedal renders one button");
    return found[0]!.props as Handlers;
  };
  return { brake: button(pedals[0]!), throttle: button(pedals[1]!) };
}
