/**
 * =============================================================================
 * THE COLUMN'S PAINT REPORT FOLLOWS WHAT IT PAINTS — sc-roundabout-entry:fe081cf1
 * (major), whycut round 3, integration condition «PIN AT INTEGRATION» (W5).
 *
 * WHAT THIS PINS. A judged card that waited behind an opened explanation
 * restarts its clock ONLY when `HudToasts` reports it painted (`onPainted` ->
 * `useHudToastQueue.painted`). The report is an effect keyed on the painted ids
 * (`[paintedKey, onPainted]`). The round-3 verifier's mutant M5 cut the key to
 * `[onPainted]`, so the column reports once, on mount, and never again: on the
 * glass a fault stood for 38 s without expiring, and three waiting faults were
 * never painted at all (real-browser cell w5cell-m5.mjs). It survived all 224
 * vitest rows, because every executed row looked only at the FIRST commit and
 * the shared `hookHarness` deliberately does not compare dependency arrays.
 *
 * HOW. The defect lives in a dependency array, so the instrument must compare
 * dependency arrays the way React does (`areHookInputsEqual`: `Object.is` on
 * every slot; no array means run every commit) and must re-render with new
 * props. `renderWithDeps` below is that and nothing more: one function
 * component, called with React's own dispatcher slot swapped (the technique
 * `hookHarness.ts` documents), effects re-run only when their deps changed,
 * the previous cleanup first. There is no DOM in this vitest config.
 * =============================================================================
 */
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { HudEvent } from "../../contracts";
import { HudToasts, type HudToast } from "../HudToasts";

type Deps = readonly unknown[] | undefined;
type EffectSlot = { deps: Deps; cleanup: (() => void) | void };

function depsChanged(prev: Deps, next: Deps): boolean {
  if (prev === undefined || next === undefined) return true;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i += 1) if (!Object.is(prev[i], next[i])) return true;
  return false;
}

/** Render one function component across commits, React's effect rule included. */
function renderWithDeps<P>(component: (props: P) => unknown, first: P) {
  const g = globalThis as Record<string, unknown>;
  const hadWindow = "window" in g;
  const prevWindow = g.window;
  g.window = {
    setInterval: () => 0,
    clearInterval: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  };
  const internals = (
    React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H: unknown } }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  expect(internals, "React's dispatcher slot has moved — this instrument is blind").toBeTruthy();
  const shared = internals as { H: unknown };

  const slots: Array<{ v: unknown }> = [];
  const effectSlots: EffectSlot[] = [];
  let cursor = 0;
  let effectCursor = 0;
  let pending: Array<{ at: number; fn: () => (() => void) | void; deps: Deps }> = [];
  const slot = (init: () => unknown) => {
    if (cursor === slots.length) slots.push({ v: init() });
    return slots[cursor++]!;
  };
  const memo = (fn: () => unknown, deps: Deps) => {
    const s = slot(() => ({ deps: undefined as Deps, value: undefined as unknown, set: false }));
    const m = s.v as { deps: Deps; value: unknown; set: boolean };
    if (!m.set || depsChanged(m.deps, deps)) {
      m.value = fn();
      m.deps = deps;
      m.set = true;
    }
    return m.value;
  };
  const effect = (fn: () => (() => void) | void, deps?: readonly unknown[]) => {
    const at = effectCursor++;
    const prev = effectSlots[at];
    if (prev === undefined || depsChanged(prev.deps, deps)) pending.push({ at, fn, deps });
  };
  const dispatcher = {
    useState(initial: unknown) {
      const s = slot(() => (typeof initial === "function" ? (initial as () => unknown)() : initial));
      return [s.v, (u: unknown) => (s.v = typeof u === "function" ? (u as (p: unknown) => unknown)(s.v) : u)];
    },
    useRef(initial: unknown) {
      return slot(() => ({ current: initial })).v;
    },
    useCallback: (fn: unknown, deps?: readonly unknown[]) => memo(() => fn, deps),
    useMemo: (fn: () => unknown, deps?: readonly unknown[]) => memo(fn, deps),
    useEffect: effect,
    useLayoutEffect: effect,
    useInsertionEffect: effect,
    useDebugValue() {},
    useId: () => ":r0:",
  };

  const commit = (props: P) => {
    cursor = 0;
    effectCursor = 0;
    pending = [];
    const before = shared.H;
    try {
      shared.H = dispatcher;
      component(props);
    } finally {
      shared.H = before;
    }
    // React's commit: for every effect whose deps changed, the old cleanup, then the new body.
    for (const p of pending) {
      const old = effectSlots[p.at];
      if (old !== undefined && typeof old.cleanup === "function") old.cleanup();
      effectSlots[p.at] = { deps: p.deps, cleanup: p.fn() };
    }
  };
  commit(first);
  return {
    rerender: commit,
    unmount() {
      for (const e of effectSlots) if (e !== undefined && typeof e.cleanup === "function") e.cleanup();
      if (hadWindow) g.window = prevWindow;
      else delete g.window;
    },
  };
}

const fault = (title: string): HudEvent => ({
  kind: "violation",
  titleBg: title,
  explanationBg: "Х".repeat(323),
  peekBg: "Кратко.",
  points: 10,
  severity: "opasna",
  lawRef: "ЗДвП чл. 20, ал. 2",
});
const praise = (title: string): HudEvent => ({ kind: "commendation", titleBg: title });
const toast = (id: number, event: HudEvent): HudToast => ({ id, event });

type Props = Parameters<typeof HudToasts>[0];
let mounted: { unmount(): void } | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe("the column re-reports on every change of what it paints (M5 pin)", () => {
  it("re-rendered with a changed painted set, the report follows — a new card, the opened card alone, an empty column", () => {
    const reports: number[][] = [];
    // ONE callback for every commit, as the shell's `painted` is: only the
    // painted ids may make the report fire again.
    const onPainted = (ids: readonly number[]) => reports.push([...ids]);
    const f1 = toast(1, fault("F1"));
    const p2 = toast(2, praise("Браво"));
    const f3 = toast(3, fault("F3"));
    const f4 = toast(4, fault("F4"));
    const r = renderWithDeps<Props>(HudToasts as (p: Props) => unknown, { toasts: [f3, p2, f1], onPainted });
    mounted = r;
    expect(reports, "the column did not report its first paint").toEqual([[3, 2]]);

    r.rerender({ toasts: [f4, f3, p2, f1], onPainted });
    expect(reports, "a newer card reached the glass and the column's report did not follow it").toEqual([
      [3, 2],
      [4, 3],
    ]);

    r.rerender({ toasts: [f4, f3, p2, f1], onPainted, reading: { id: 1, held: true } } as Props);
    expect(reports, "the opened card became the one card painted and the report did not follow it").toEqual([
      [3, 2],
      [4, 3],
      [1],
    ]);

    r.rerender({ toasts: [f4, f3, p2], onPainted });
    expect(reports, "the reading closed and the cards that waited were painted, unreported").toEqual([
      [3, 2],
      [4, 3],
      [1],
      [4, 3],
    ]);

    r.rerender({ toasts: [], onPainted });
    expect(reports, "the column emptied and the report did not follow it").toEqual([[3, 2], [4, 3], [1], [4, 3], []]);
  });

  it("…and a re-render that paints the same cards says nothing new (keyed on the ids, not the array)", () => {
    const reports: number[][] = [];
    const onPainted = (ids: readonly number[]) => reports.push([...ids]);
    const r = renderWithDeps<Props>(HudToasts as (p: Props) => unknown, {
      toasts: [toast(3, fault("F3")), toast(2, praise("Браво"))],
      onPainted,
    });
    mounted = r;
    r.rerender({ toasts: [toast(3, fault("F3")), toast(2, praise("Браво"))], onPainted });
    expect(reports, "the same painted set was reported twice").toEqual([[3, 2]]);
  });
});
