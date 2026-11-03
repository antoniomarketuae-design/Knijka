/**
 * THE SHELL'S OWN WIRING UNDER THE PERSON HOLD, READ BY BEHAVIOUR — lane
 * endings2 at integration, the round-3 verifier's condition C2.
 *
 * personStrikeHold.test.ts (8) and (9) pin two shell rules by their SOURCE
 * TEXT: the transmission-switch handler answers through personHoldControlHint
 * (verifier mutant X1: the handler left unwrapped), and the ribbon legend's
 * gate reads routeGuidanceStandsDown — personStruck only — rather than any hold
 * (mutant X6). A rewording that keeps the behaviour, or a behaviour change that
 * keeps the text, could pass those. This file runs the REAL LessonPlayShell
 * body headless and watches what it does:
 *
 *  · the shell's own tick handler (`onTick` on its scene slot) is fed a drive
 *    that strikes a pedestrian at 40 km/h and stands at rest; its own
 *    `onTransmissionChanged` handler is then called, and the card it pushes on
 *    the toast column is read off the HudToasts element it renders;
 *  · the shell's HUD snapshot (its `snap` state, which the 150 ms poll writes)
 *    is set to the struck session's snapshot, and to the same snapshot under
 *    crashPinned / offRoad / no hold, and the roomy ribbon legend
 *    (`data-hud="ribbon-legend"`) is looked for on each render.
 *
 * There is no DOM in this vitest config, so the body runs against a minimal
 * hooks dispatcher that keeps its slots between renders (the overlayMount.ts
 * technique); effects are not run — nothing here needs one (the toast queue's
 * push is a state update; the poll is emulated by writing the snapshot).
 */
import * as React from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SimTick } from "@/modules/sim/rules";
import {
  SCENARIO_TEMPLATES,
  applyTick,
  compileScenario,
  createLessonSession,
  personHoldCopy,
  routeHoldForSession,
  type LessonSessionState,
  type LessonSpec,
  type RouteHold,
} from "@/modules/sim/lessons";
import { makeTick } from "@/modules/sim/lessons/__tests__/fixtures";
import {
  LessonPlayShell,
  snapshotOf,
  transmissionSwitchCauseBg,
  transmissionSwitchHint,
  type HudSnapshot,
} from "../LessonPlayShell";

type Props = Record<string, unknown>;
type G = Record<string, unknown>;
const g = globalThis as G;
const saved: Record<string, unknown> = {};
const STUBBED = ["window", "document", "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "matchMedia"];

beforeAll(() => {
  for (const k of STUBBED) saved[k] = g[k];
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  g.window = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    localStorage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia,
    location: { search: "", href: "http://localhost/", pathname: "/" },
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    navigator: { userAgent: "node", maxTouchPoints: 0 },
  };
  g.document = { documentElement: { dataset: {}, style: {} }, addEventListener() {}, removeEventListener() {}, visibilityState: "visible", body: {} };
  g.requestAnimationFrame = () => 1;
  g.cancelAnimationFrame = () => undefined;
  g.localStorage = localStorage;
  g.matchMedia = matchMedia;
});
afterAll(() => {
  for (const k of STUBBED) g[k] = saved[k];
});

interface Mounted {
  slots: Array<{ v: unknown }>;
  render: () => unknown;
}

/** Run a function component's body on a dispatcher that keeps its slots. */
function mount(component: (p: Props) => unknown, props: Props): Mounted {
  const slots: Array<{ v: unknown }> = [];
  let cursor = 0;
  const slot = (init: () => unknown) => {
    if (cursor === slots.length) slots.push({ v: init() });
    return slots[cursor++]!;
  };
  const dispatcher = {
    useState(i: unknown) {
      const s = slot(() => (typeof i === "function" ? (i as () => unknown)() : i));
      return [s.v, (u: unknown) => { s.v = typeof u === "function" ? (u as (p: unknown) => unknown)(s.v) : u; }];
    },
    useReducer(r: (s: unknown, a: unknown) => unknown, i: unknown, init?: (x: unknown) => unknown) {
      const s = slot(() => (init ? init(i) : i));
      return [s.v, (a: unknown) => { s.v = r(s.v, a); }];
    },
    useRef(i: unknown) {
      return slot(() => ({ current: i })).v;
    },
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useEffect() {},
    useLayoutEffect() {},
    useInsertionEffect() {},
    useContext: (c: { _currentValue?: unknown }) => c._currentValue,
    useSyncExternalStore: (_s: unknown, get: () => unknown, server?: () => unknown) => (server ?? get)(),
    useDebugValue() {},
    useId: () => ":r0:",
    useTransition: () => [false, (f: () => void) => f()],
    useDeferredValue: (v: unknown) => v,
  };
  const internals = (
    React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H: unknown } }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (!internals) throw new Error("React's dispatcher slot has moved — this harness is blind");
  return {
    slots,
    render: () => {
      cursor = 0;
      const previous = internals.H;
      try {
        internals.H = dispatcher;
        return component(props);
      } finally {
        internals.H = previous;
      }
    },
  };
}

function collect(n: unknown, pick: (p: Props) => boolean, out: React.ReactElement[] = []): React.ReactElement[] {
  if (Array.isArray(n)) {
    for (const c of n) collect(c, pick, out);
    return out;
  }
  if (!React.isValidElement(n)) return out;
  const p = n.props as Props;
  if (pick(p)) out.push(n);
  if (p.children !== undefined) collect(p.children, pick, out);
  return out;
}

function one(tree: unknown, pick: (p: Props) => boolean, what: string): Props {
  const found = collect(tree, pick);
  if (found.length !== 1) throw new Error(`expected one ${what}, found ${found.length}`);
  return found[0]!.props as Props;
}

const DT = 0.05;
/** North along x = 4.06 at `kmh`; a pedestrian bill at `strikeY` (when given); to rest `restAfterM` on; stand `standSec`. */
function northDrive(o: { strikeY: number | null; kmh: number; restAfterM: number; standSec: number }): SimTick[] {
  const ticks: SimTick[] = [];
  let t = 0;
  let y = 0;
  let struck = false;
  const restY = (o.strikeY ?? 20) + o.restAfterM;
  while (y < restY) {
    const events: SimTick["events"] = [];
    const hit = o.strikeY !== null && !struck && y >= o.strikeY;
    if (hit) {
      events.push({ kind: "collision", withWhat: "pedestrian" });
      struck = true;
    }
    const slowing = o.strikeY === null ? y >= 20 : struck;
    const v = !slowing ? o.kmh : Math.max(2, o.kmh * Math.sqrt(Math.max(0, (restY - y) / Math.max(o.restAfterM, 0.01))));
    ticks.push(makeTick({ t, speedKmh: v, headingDeg: 0, position: { x: 4.06, y }, events }));
    t = +(t + DT).toFixed(6);
    y += (v / 3.6) * DT;
  }
  for (let i = 0; i < o.standSec / DT; i++) {
    ticks.push(makeTick({ t, speedKmh: 0, headingDeg: 0, position: { x: 4.06, y } }));
    t = +(t + DT).toFixed(6);
  }
  return ticks;
}

const lesson: LessonSpec = compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === "sc-pe-jaywalker")!, 2);

/** Mount the shell, drive `ticks` through ITS tick handler; return the mount and the session the same ticks give. */
function shellAfter(ticks: SimTick[]): { m: Mounted; session: LessonSessionState } {
  const m = mount(LessonPlayShell as unknown as (p: Props) => unknown, {
    lesson,
    quality: "med",
    nextLesson: null,
    onExitToSelect() {},
    onStartLesson() {},
  });
  const scene = one(m.render(), (p) => typeof p.onTransmissionChanged === "function" && typeof p.onTick === "function", "scene slot");
  const onTick = scene.onTick as (t: SimTick) => void;
  for (const t of ticks) onTick(t);
  let s = createLessonSession(lesson);
  for (const t of ticks) s = applyTick(s, t).state;
  return { m, session: s };
}

type Card = { id: number; event: { titleBg?: string; explanationBg?: string } };
/** The toast column the shell renders (newest first, capped). */
function toastsOf(tree: unknown): Card[] {
  const col = collect(tree, (p) => Array.isArray(p.toasts));
  if (col.length === 0) throw new Error("the shell rendered no toast column");
  return (col[0]!.props as { toasts: Card[] }).toasts;
}
const newestId = (cards: Card[]) => cards.reduce((mx, c) => Math.max(mx, c.id), 0);

/** Call the shell's own onTransmissionChanged; return the ONE card it raised. */
function switchTransmissionOnShell(m: Mounted): { titleBg?: string; explanationBg?: string } {
  const scene = one(m.render(), (p) => typeof p.onTransmissionChanged === "function", "scene slot");
  const before = newestId(toastsOf(m.render()));
  (scene.onTransmissionChanged as (tr: string, sel: string) => void)("manual", "M");
  const raised = toastsOf(m.render()).filter((c) => c.id > before);
  if (raised.length !== 1) throw new Error(`the handler raised ${raised.length} cards, expected one`);
  return raised[0]!.event;
}

describe("C2 / X1 — the shell's transmission-switch handler, called live, says the cause and the exit under the person hold", () => {
  it("after a pedestrian strike (the free phase): the card is the cause sentence and the exit peek, never the raw hint", () => {
    const { m, session } = shellAfter(northDrive({ strikeY: 20, kmh: 40, restAfterM: 8, standSec: 5 }));
    expect(routeHoldForSession(session)).toBe("personStruck");
    const card = switchTransmissionOnShell(m);
    expect(card.titleBg).toBe(transmissionSwitchCauseBg("M"));
    expect(card.explanationBg).toBe(personHoldCopy(session)!.peekBg);
    for (const input of ["keyboard", "touch"] as const) {
      for (const box of ["automatic", "manual"] as const) {
        expect(card.titleBg).not.toBe(transmissionSwitchHint("manual", "M", input, box).titleBg);
      }
    }
  });

  it("control: the same handler with no strike pushes the hint that shipped", () => {
    const { m, session } = shellAfter(northDrive({ strikeY: null, kmh: 30, restAfterM: 8, standSec: 2 }));
    expect(routeHoldForSession(session)).not.toBe("personStruck");
    const card = switchTransmissionOnShell(m);
    const shipped = (["keyboard", "touch"] as const).flatMap((input) =>
      (["automatic", "manual"] as const).map((box) => transmissionSwitchHint("manual", "M", input, box)),
    );
    expect(shipped.some((h) => h.titleBg === card.titleBg && h.explanationBg === card.explanationBg)).toBe(true);
  });
});

describe("C2 / X6 — the roomy ribbon legend leaves under the person hold only", () => {
  const legends = (m: Mounted, snap: HudSnapshot): number => {
    const s = m.slots.find((x) => x.v !== null && typeof x.v === "object" && "objectiveHold" in (x.v as object) && "objectiveHoldWayOut" in (x.v as object));
    if (s === undefined) throw new Error("the shell's HUD snapshot slot was not found");
    s.v = snap;
    return collect(m.render(), (p) => p["data-hud"] === "ribbon-legend").length;
  };

  it("the struck session's own snapshot: no legend; the same snapshot under crashPinned / offRoad / no hold: the legend", () => {
    const { m, session } = shellAfter(northDrive({ strikeY: 20, kmh: 40, restAfterM: 8, standSec: 5 }));
    const struck = snapshotOf(session, null, null, null);
    expect(struck.objectiveHold).toBe("personStruck");
    expect(legends(m, struck), "legend under personStruck").toBe(0);
    for (const hold of ["crashPinned", "offRoad", null] as Array<RouteHold | null>) {
      expect(legends(m, { ...struck, objectiveHold: hold }), `legend under ${String(hold)}`).toBe(1);
    }
  });

  it("control: a drive with no strike shows the legend", () => {
    const { m, session } = shellAfter(northDrive({ strikeY: null, kmh: 30, restAfterM: 8, standSec: 2 }));
    expect(legends(m, snapshotOf(session, null, null, null))).toBe(1);
  });
});
