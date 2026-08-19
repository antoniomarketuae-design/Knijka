/**
 * =============================================================================
 * RUN THE EFFECT, DO NOT SPELL IT — the shared harness, extracted 2026-08-19.
 *
 * WHY THIS FILE EXISTS, IN ONE MEASUREMENT. The sweep of 2026-08-19 mutated
 * twelve test files that assert against COMMENT-STRIPPED SOURCE TEXT and ran
 * each one against its own defect restored. Twelve stayed GREEN. Two examples,
 * both from files in this directory:
 *
 *   · `SessionEndScreen`'s gate-release `useEffect` was replaced by a call to
 *     an inert local of the SAME NAME-SHAPE (`noEffect(() => { … }, [deps])`),
 *     so every string `session-end-gate-release.test.ts` greps for survived
 *     character for character. 7/7 GREEN — while the debrief goes back to
 *     opening 64 px down its own first control on four measured mobile frames.
 *   · `useFoldLines`'s `measure` callback was replaced by `() => {}` with the
 *     whole original body left in the file under another name. 28/28 GREEN
 *     across `sim-overlay-fold` and `sim-overlay-line-grid` — while the teach
 *     card goes back to slicing its body text through the middle of a line of
 *     glyphs on twenty-three lessons.
 *
 * A test that passes equally before and after guards nothing. The answer is not
 * a tighter regex — every one of those mutations would walk past a tighter
 * regex too, because the defect is that nothing EXECUTES. The answer is to run
 * the component.
 *
 * ── WHY NOT `@testing-library/react` ────────────────────────────────────────
 *
 * There is no DOM in this project's vitest config (`environment: "node"`) and
 * no jsdom in the tree, so the usual answer — render it and let the effects run
 * — is not available. What IS available is that React's hooks are just calls
 * into a dispatcher slot, and the slot is reachable. `touchPadRelease.test.tsx`
 * proved this on `TouchControls` (ledger item C5, §7) and the technique is
 * copied here verbatim rather than reinvented, so there is one of it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: re-render. Every caller asserts about the
 * FIRST commit, which is what an effect and its cleanup need. A setter mutates
 * the slot and returns; nothing re-renders, and a test that depended on one
 * would be testing this harness rather than the component.
 *
 * IF REACT MOVES THE SLOT THIS FAILS LOUDLY (`expect(internals)`), which is the
 * only acceptable failure mode for a harness that reaches into internals: it
 * must never degrade into a test that quietly passes on nothing.
 * =============================================================================
 */
import * as React from "react";
import { expect } from "vitest";

/** A timer the fake clock owns, as `setInterval`/`setTimeout` handed it over. */
export interface FakeTimer {
  id: number;
  fn: () => void;
  ms: number;
  kind: "interval" | "timeout";
}

/** What `mountHook` hands back: the render's return value, plus the levers. */
export interface Mounted<T> {
  /** Whatever the function returned on its first (and only) commit. */
  value: T;
  /** Every `useState`/`useRef` slot, in call order — the component's own state. */
  slots: Array<{ v: unknown }>;
  /** Timers scheduled by the effects that ran, in order. */
  timers: FakeTimer[];
  /** Fire every scheduled interval once, and every due timeout once. */
  tick(): void;
  /** Every effect cleanup, in order — what an unmount does. */
  unmount(): void;
  /** The fake `window` the effects were given, so a caller can inspect it. */
  window: FakeWindow;
  /** Every `ResizeObserver` the effects constructed, in order. */
  observers: FakeResizeObserver[];
  /**
   * Re-run the body against the slots as they now stand, and hand back the new
   * tree — what a component does after a setter fires. This is the only way to
   * see what an effect's `setState` PUBLISHED: the first commit's tree is the
   * one the effect had not run for yet.
   */
  rerender(): T;
  /**
   * Re-render AND re-run the effects, `passes` times — what React does when an
   * effect's `setState` changes something a later effect is armed by.
   *
   * The shell needs this: `immersive` is false on the first commit (its inputs
   * are state that effects fill in), so `useVisualViewportBox(immersive || …)`
   * returns early and subscribes to nothing. A harness that stopped at the
   * first commit would report „no listener" for a hook that is wired perfectly,
   * which is a FALSE FAILURE — as bad as a false certificate.
   *
   * Every effect's cleanup runs before it is re-run, so subscriptions are not
   * counted twice. Dependency arrays are NOT compared: this deliberately
   * over-runs rather than guessing at React's scheduling, and over-running is
   * the safe direction for a harness whose product is evidence.
   */
  settle(passes?: number): T;
}

export interface FakeWindow {
  listeners: Array<{ type: string; fn: (e: unknown) => void; capture: boolean }>;
  addEventListener(type: string, fn: (e: unknown) => void, capture?: boolean | object): void;
  removeEventListener(type: string, fn: (e: unknown) => void, capture?: boolean | object): void;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  /** Deliver an event to every listener registered for `type`. */
  dispatch(type: string, event: unknown): void;
  localStorage: { getItem(): null; setItem(): void };
  visualViewport: unknown;
  navigator: Record<string, unknown>;
  innerWidth: number;
  innerHeight: number;
  matchMedia(): { matches: boolean; addEventListener(): void; removeEventListener(): void };
}

function fakeWindow(overrides: Partial<FakeWindow> = {}): FakeWindow {
  const listeners: FakeWindow["listeners"] = [];
  const timers: FakeTimer[] = [];
  let nextId = 1;
  const w: FakeWindow = {
    listeners,
    addEventListener(type, fn, capture) {
      listeners.push({ type, fn, capture: capture === true });
    },
    removeEventListener(type, fn, capture) {
      const at = listeners.findIndex(
        (l) => l.type === type && l.fn === fn && l.capture === (capture === true),
      );
      if (at >= 0) listeners.splice(at, 1);
    },
    setInterval(fn, ms) {
      const id = nextId++;
      timers.push({ id, fn, ms, kind: "interval" });
      return id;
    },
    clearInterval(id) {
      const at = timers.findIndex((t) => t.id === id);
      if (at >= 0) timers.splice(at, 1);
    },
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.push({ id, fn, ms, kind: "timeout" });
      return id;
    },
    clearTimeout(id) {
      const at = timers.findIndex((t) => t.id === id);
      if (at >= 0) timers.splice(at, 1);
    },
    dispatch(type, event) {
      for (const l of [...listeners]) if (l.type === type) l.fn(event);
    },
    localStorage: { getItem: () => null, setItem: () => undefined },
    visualViewport: null,
    // Present-but-empty rather than absent: components read `window.navigator`
    // unguarded (the standalone-display probe does), and an absent one throws
    // a TypeError that reads like a harness bug rather than like a missing
    // fake. An empty object gives every optional read `undefined`, which is
    // what a server render sees.
    navigator: {},
    innerWidth: 852,
    innerHeight: 393,
    matchMedia: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
    ...overrides,
  };
  // The timer array the harness reports has to be the SAME array the closures
  // above push into, or `tick()` fires a copy taken before the effects ran —
  // which is a harness that reports zero timers and calls it "no interval".
  (w as unknown as { __timers: FakeTimer[] }).__timers = timers;
  return w;
}

/**
 * Install `window`/`document` globals for the duration of one mount, and hand
 * back the restore. Node has neither, which is the same branch a server render
 * takes — so a component that reads them unguarded fails here loudly rather
 * than being quietly skipped.
 */
function installGlobals(
  w: FakeWindow,
  doc: unknown,
  observers: FakeResizeObserver[],
  extra: Record<string, unknown> = {},
): () => void {
  const g = globalThis as Record<string, unknown>;
  const keys = ["window", "document", "ResizeObserver", ...Object.keys(extra)];
  const had = keys.map((k) => k in g);
  const prev = keys.map((k) => g[k]);
  g.window = w;
  g.document = doc;
  for (const [k, v] of Object.entries(extra)) g[k] = v;
  // A REAL constructor, not a stub that swallows the call. `useFoldLines` and
  // the shell's own root observer BOTH bail out when `ResizeObserver` is
  // undefined, so a harness without one silently skips the measurement it was
  // written to exercise — green, on nothing, in the reassuring direction.
  g.ResizeObserver = class implements FakeResizeObserver {
    readonly targets: unknown[] = [];
    constructor(private readonly cb: () => void) {
      observers.push(this);
    }
    observe(target: unknown): void {
      this.targets.push(target);
    }
    unobserve(target: unknown): void {
      const at = this.targets.indexOf(target);
      if (at >= 0) this.targets.splice(at, 1);
    }
    disconnect(): void {
      this.targets.length = 0;
      const at = observers.indexOf(this);
      if (at >= 0) observers.splice(at, 1);
    }
    /** What the engine does after a reflow. */
    fire(): void {
      this.cb();
    }
  };
  return () => {
    keys.forEach((k, i) => {
      if (had[i]) g[k] = prev[i];
      else delete g[k];
    });
  };
}

/** The observers a mount created, in construction order. */
export interface FakeResizeObserver {
  readonly targets: unknown[];
  observe(target: unknown): void;
  unobserve(target: unknown): void;
  disconnect(): void;
  fire(): void;
}

/** A `document` with as much of one as these effects actually touch. */
export function fakeDocument(): Record<string, unknown> {
  const listeners: Array<{ type: string; fn: (e: unknown) => void }> = [];
  return {
    documentElement: { dataset: {} as Record<string, string>, style: { setProperty() {} } },
    body: { dataset: {} as Record<string, string> },
    listeners,
    addEventListener(type: string, fn: (e: unknown) => void) {
      listeners.push({ type, fn });
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      const at = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (at >= 0) listeners.splice(at, 1);
    },
    createElement: () => ({ style: {}, setAttribute() {}, removeAttribute() {} }),
    fullscreenElement: null,
  };
}

/**
 * Call a React function component or hook with a real dispatcher, run its
 * effects, and hand back the levers.
 *
 * `render` is called INSIDE the dispatcher swap, so a caller may pass either a
 * component (`() => TouchControls(props)`) or a bare hook call.
 */
export function mountHook<T>(
  render: () => T,
  options: {
    window?: Partial<FakeWindow>;
    document?: unknown;
    /**
     * Run between the render and the effect flush — the moment React attaches
     * DOM nodes to the refs the render just allocated. A caller that needs an
     * effect to find something in `someRef.current` puts it there here; there
     * is no other window in which to do it, because the render has to have run
     * for the slot to exist and the effect must not have run yet.
     */
    beforeEffects?: (slots: Array<{ v: unknown }>) => void;
    /**
     * Extra globals to install for the duration of the mount — `getComputedStyle`
     * is the one this project needs, because a measurement effect that reads it
     * is exactly the kind of effect a source scan cannot see running.
     */
    globals?: Record<string, unknown>;
  } = {},
): Mounted<T> {
  const w = fakeWindow(options.window);
  const doc = options.document ?? fakeDocument();
  const observers: FakeResizeObserver[] = [];
  const restore = installGlobals(w, doc, observers, options.globals);

  const slots: Array<{ v: unknown }> = [];
  const effects: Array<() => (() => void) | void> = [];
  let cursor = 0;
  const slot = <S,>(init: () => S): { v: unknown } => {
    if (cursor === slots.length) slots.push({ v: init() });
    return slots[cursor++]!;
  };
  const dispatcher = {
    useState<S>(initial: S | (() => S)) {
      const s = slot(() => (typeof initial === "function" ? (initial as () => S)() : initial));
      return [
        s.v as S,
        (update: unknown) => {
          s.v = typeof update === "function" ? (update as (p: unknown) => unknown)(s.v) : update;
        },
      ];
    },
    useRef<S>(initial: S) {
      return slot(() => ({ current: initial })).v;
    },
    useCallback: <F,>(fn: F) => fn,
    useMemo: <S,>(fn: () => S) => fn(),
    useEffect(fn: () => (() => void) | void) {
      effects.push(fn);
    },
    useLayoutEffect(fn: () => (() => void) | void) {
      effects.push(fn);
    },
    useInsertionEffect(fn: () => (() => void) | void) {
      effects.push(fn);
    },
    useDebugValue() {},
    useId: () => ":r0:",
    useSyncExternalStore: <S,>(_sub: unknown, getSnapshot: () => S) => getSnapshot(),
    useTransition: () => [false, (fn: () => void) => fn()],
    useReducer<S, A>(reduce: (s: S, a: A) => S, initial: S) {
      const s = slot(() => initial);
      return [
        s.v as S,
        (action: A) => {
          s.v = reduce(s.v as S, action);
        },
      ];
    },
  };

  const internals = (
    React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H: unknown };
    }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  expect(internals, "React's dispatcher slot has moved — this harness is blind").toBeTruthy();
  const shared = internals as { H: unknown };
  const previous = shared.H;
  let value: T;
  try {
    shared.H = dispatcher;
    value = render();
  } finally {
    shared.H = previous;
  }

  options.beforeEffects?.(slots);
  let cleanups = effects.map((run) => run());
  const timers = (w as unknown as { __timers: FakeTimer[] }).__timers;

  return {
    value,
    slots,
    timers,
    window: w,
    observers,
    rerender() {
      // Re-run the body against the SLOTS AS THEY NOW STAND. That is what a
      // component does after a setter fires, and it is the only way to see what
      // an effect's `setState` actually published: the harness does not
      // schedule work, so the first commit's tree is the one the effect had not
      // run for yet. Effects queued by this pass are deliberately dropped —
      // running them would need a dependency comparison, and a harness that
      // guesses at React's scheduling is a harness the assertions are about.
      cursor = 0;
      const queued = effects.length;
      const before = shared.H;
      try {
        shared.H = dispatcher;
        value = render();
      } finally {
        shared.H = before;
        effects.length = queued;
      }
      return value;
    },
    settle(passes = 3) {
      for (let i = 0; i < passes; i += 1) {
        // Tear down the previous commit's subscriptions first, or a listener
        // count becomes a count of passes.
        for (const c of cleanups) if (typeof c === "function") c();
        effects.length = 0;
        cursor = 0;
        const before = shared.H;
        try {
          shared.H = dispatcher;
          value = render();
        } finally {
          shared.H = before;
        }
        cleanups = effects.map((run) => run());
      }
      // …and one last render, so the tree handed back is the one the final
      // effect flush produced rather than the one that provoked it.
      cursor = 0;
      const last = shared.H;
      try {
        shared.H = dispatcher;
        value = render();
      } finally {
        shared.H = last;
        effects.length = 0;
      }
      return value;
    },
    tick() {
      for (const t of [...timers]) {
        t.fn();
        if (t.kind === "timeout") w.clearTimeout(t.id);
      }
    },
    unmount() {
      for (const c of cleanups) if (typeof c === "function") c();
      restore();
    },
    // A mount that is never unmounted would leak the globals into the next
    // test in the file, so callers are expected to unmount. `restore` is held
    // in the closure above; this is the only way back out.
  };
}

/**
 * Walk a React element tree depth-first and collect the props of every node
 * matching `pick`. Read off the TREE, not off the source, so a decoy string
 * cannot satisfy an assertion about what is rendered.
 */
export function collectProps(
  node: unknown,
  pick: (props: Record<string, unknown>, type: unknown) => boolean,
  found: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const child of node) collectProps(child, pick, found);
    return found;
  }
  if (!React.isValidElement(node)) return found;
  const props = node.props as Record<string, unknown>;
  if (pick(props, node.type)) found.push(props);
  if (props.children !== undefined) collectProps(props.children, pick, found);
  return found;
}
