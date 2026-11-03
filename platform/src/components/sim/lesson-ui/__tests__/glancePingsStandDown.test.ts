/**
 * AFTER A PERSON STRIKE THE «огледай» EDGE PINGS STAND DOWN — lane endings2 at
 * integration, the round-3 verifier's condition C1 (integrator ruling N18,
 * 2026-11-03).
 *
 * On the round-3 tree the glance pings (GlanceEdgePings, driven by advisor.ts
 * `observeGlancePingsTick`) pulsed on both edges for the whole ~190 s rest at
 * the Б2 line after the strike on sc-merge-from-property/mistake-walk-through
 * L1–L3, under the banner «След удара в човек — не продължавай…»: the give-way
 * scan for the next move of a drive the student must not continue. The rule
 * (`glancePingsStandDown`): under "personStruck", and under no other hold, the
 * component renders no ping chip; the state machine still runs and the
 * hold-to-glance buttons stay.
 *
 * Read on the REAL component: its body is run against a minimal hooks
 * dispatcher (the overlayMount.ts technique — no DOM in this vitest config)
 * that KEEPS its slots between renders, so the tick tap the component installs
 * moves its real `pings` state and every frame re-renders it with the hold the
 * shell would pass that frame (`routeHoldForSession`, `snap.objectiveHold`).
 * A chip counts when the PingChip element the component returns renders the
 * `data-hud="glance-ping"` pill.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { describe, expect, it } from "vitest";
import type { SimTick } from "@/modules/sim/rules";
import {
  SCENARIO_TEMPLATES,
  compileScenario,
  glancePingsStandDown,
  routeHoldForSession,
  type LessonSpec,
  type RouteHold,
} from "@/modules/sim/lessons";
import { parseScenarioTrace } from "@/modules/sim/traces/parse";
import { liveChainReplay } from "@/modules/sim/lessons/scenario/__tests__/liveChainReplay";
import { loadDistrict } from "@/modules/sim/lessons/scenario/__tests__/witnessLiveRung";
import { GlanceEdgePings, type GlancePingTap } from "../GlanceEdgePings";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLATFORM = path.resolve(HERE, "../../../../..");
const REPO_ROOT = path.resolve(PLATFORM, "..");

type Props = Record<string, unknown>;

/** A re-renderable mount: slots survive between renders; effects run on the first. */
function mount(component: (p: Props) => unknown) {
  const slots: Array<{ v: unknown }> = [];
  let cursor = 0;
  let first = true;
  const effects: Array<() => unknown> = [];
  const slot = (init: () => unknown): { v: unknown } => {
    if (cursor === slots.length) slots.push({ v: init() });
    return slots[cursor++]!;
  };
  const dispatcher = {
    useState(initial: unknown) {
      const s = slot(() => (typeof initial === "function" ? (initial as () => unknown)() : initial));
      return [s.v, (u: unknown) => { s.v = typeof u === "function" ? (u as (p: unknown) => unknown)(s.v) : u; }];
    },
    useRef(initial: unknown) {
      return slot(() => ({ current: initial })).v;
    },
    useCallback: (fn: unknown) => fn,
    useMemo: (fn: () => unknown) => fn(),
    useEffect(fn: () => unknown) {
      if (first) effects.push(fn);
    },
    useLayoutEffect(fn: () => unknown) {
      if (first) effects.push(fn);
    },
    useDebugValue() {},
    useId: () => ":r0:",
  };
  const internals = (
    React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: { H: unknown } }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (!internals) throw new Error("React's dispatcher slot has moved — this harness is blind");
  return (props: Props): unknown => {
    cursor = 0;
    const previous = internals.H;
    let tree: unknown;
    try {
      internals.H = dispatcher;
      tree = component(props);
    } finally {
      internals.H = previous;
    }
    if (first) {
      first = false;
      for (const run of effects) run();
    }
    return tree;
  };
}

function collect(node: unknown, pick: (el: React.ReactElement) => boolean, found: React.ReactElement[] = []): React.ReactElement[] {
  if (Array.isArray(node)) {
    for (const c of node) collect(c, pick, found);
    return found;
  }
  if (!React.isValidElement(node)) return found;
  if (pick(node)) found.push(node);
  const children = (node.props as { children?: unknown }).children;
  if (children !== undefined) collect(children, pick, found);
  return found;
}

interface Glass {
  /** Ping pills on screen (left + right), each PingChip rendered. */
  chips: number;
  buttons: number;
}

/** What the component puts on the glass for this render. */
function read(tree: unknown): Glass {
  let chips = 0;
  for (const el of collect(tree, (e) => typeof e.type === "function" && typeof (e.props as Props).side === "string")) {
    const out = (el.type as (p: Props) => unknown)(el.props as Props);
    chips += collect(out, (e) => (e.props as Props)["data-hud"] === "glance-ping").length;
  }
  const buttons = collect(tree, (e) => (e.props as Props)["data-hud"] === "glance-buttons").length;
  return { chips, buttons };
}

interface Run {
  frames: number;
  /** Frames under each hold value the shell would pass. */
  holdFrames: Record<string, number>;
  /** Chip-frames with the real hold, by hold. */
  chipFramesByHold: Record<string, number>;
  /** Chip-frames the SAME state would show with no hold, by hold. */
  baselineChipFramesByHold: Record<string, number>;
  /** Longest run of seconds at rest that the no-hold render pulses under the person hold. */
  maxRestPingUnderHoldSec: number;
  /** Frames where the render with crashPinned / offRoad / null differs from the no-hold render. */
  otherHoldMismatch: number;
  /** Frames under the person hold with no glance-button cluster. */
  buttonsMissingUnderHold: number;
}

function replay(id: string, file: string, L: 1 | 2 | 3, holdAfterSec: number): Run {
  const spec = SCENARIO_TEMPLATES.find((x) => x.id === id)!;
  const lesson: LessonSpec = compileScenario(spec, L);
  const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", id, file), "utf-8")))!;
  const tapRef: { current: GlancePingTap | null } = { current: null };
  const render = mount(GlanceEdgePings as unknown as (p: Props) => unknown);
  const props = (routeHold: RouteHold | null): Props => ({
    lesson,
    cabinRef: { current: null },
    tapRef,
    hidden: false,
    showButtons: true,
    routeHold,
  });
  render(props(null)); // mounts: the effect installs the tick tap
  if (tapRef.current === null) throw new Error("GlanceEdgePings installed no tick tap — not an eligible lesson");
  const r: Run = {
    frames: 0,
    holdFrames: {},
    chipFramesByHold: {},
    baselineChipFramesByHold: {},
    maxRestPingUnderHoldSec: 0,
    otherHoldMismatch: 0,
    buttonsMissingUnderHold: 0,
  };
  let restRun = 0;
  let lastT: number | null = null;
  liveChainReplay({
    lesson,
    districtRaw: loadDistrict(spec.map.districtId),
    trace,
    holdAfterSec,
    afterApply: ({ t, tick, step }: { t: number; tick: SimTick; step: { state: Parameters<typeof routeHoldForSession>[0] } }) => {
      tapRef.current?.(tick);
      if (step.state.phase !== "driving") return;
      const hold = routeHoldForSession(step.state);
      const key = String(hold);
      r.frames++;
      r.holdFrames[key] = (r.holdFrames[key] ?? 0) + 1;
      const real = read(render(props(hold)));
      const base = read(render(props(null)));
      if (real.chips > 0) r.chipFramesByHold[key] = (r.chipFramesByHold[key] ?? 0) + 1;
      if (base.chips > 0) r.baselineChipFramesByHold[key] = (r.baselineChipFramesByHold[key] ?? 0) + 1;
      for (const other of ["crashPinned", "offRoad"] as const) {
        if (read(render(props(other))).chips !== base.chips) r.otherHoldMismatch++;
      }
      if (hold !== "personStruck" && real.chips !== base.chips) r.otherHoldMismatch++;
      if (hold === "personStruck" && real.buttons === 0) r.buttonsMissingUnderHold++;
      const dt = lastT === null ? 0 : t - lastT;
      lastT = t;
      if (hold === "personStruck" && base.chips > 0 && Math.abs(tick.speedKmh) < 0.5) {
        restRun += dt;
        r.maxRestPingUnderHoldSec = Math.max(r.maxRestPingUnderHoldSec, restRun);
      } else restRun = 0;
    },
  });
  return r;
}

describe("glancePingsStandDown — the pure predicate (N18: personStruck only)", () => {
  it("is true for the person hold and false for every other hold value", () => {
    expect(glancePingsStandDown("personStruck")).toBe(true);
    for (const h of [null, undefined, "crashPinned", "offRoad"] as const) {
      expect(glancePingsStandDown(h), String(h)).toBe(false);
    }
  });
});

describe("the real GlanceEdgePings after a person strike (C1)", () => {
  for (const L of [1, 2, 3] as const) {
    it(`sc-merge-from-property mistake-walk-through L${L} + 240 s at rest: no «огледай» chip under the person hold`, () => {
      const r = replay("sc-merge-from-property", "mistake-walk-through.trace.json", L, 240);
      // Not vacuous: the strike happened, the hold stood for minutes, and the
      // SAME state with no hold would pulse the pings through a long rest.
      expect(r.holdFrames.personStruck ?? 0).toBeGreaterThan(180 * 60);
      expect(r.baselineChipFramesByHold.personStruck ?? 0).toBeGreaterThan(180 * 60);
      expect(r.maxRestPingUnderHoldSec).toBeGreaterThan(180);
      // The rule.
      expect(r.chipFramesByHold.personStruck ?? 0, "ping chip frames under the person hold").toBe(0);
      // Narrow: every other hold, and the frames before the strike, render as with no hold.
      expect(r.otherHoldMismatch, "frames where crashPinned / offRoad / no hold differ from no hold").toBe(0);
      // The buttons are controls and stay.
      expect(r.buttonsMissingUnderHold).toBe(0);
    }, 600_000);
  }

  it("a drive with no strike (sc-merge-from-property shadow-correct L1): the pings are as they shipped", () => {
    const r = replay("sc-merge-from-property", "shadow-correct.trace.json", 1, 30);
    expect(r.holdFrames.personStruck ?? 0).toBe(0);
    expect(r.baselineChipFramesByHold.null ?? 0, "the clean drive approaches the Б2 line with pings").toBeGreaterThan(0);
    expect(r.chipFramesByHold.null ?? 0).toBe(r.baselineChipFramesByHold.null ?? 0);
    expect(r.otherHoldMismatch).toBe(0);
  }, 600_000);
});

describe("the scene passes its hold to the pings", () => {
  it("LessonScene mounts <GlanceEdgePings> with routeHold={routeHold}", () => {
    const src = readFileSync(path.join(PLATFORM, "src", "components", "sim", "LessonScene.tsx"), "utf-8");
    const mountSrc = /<GlanceEdgePings\b[\s\S]*?\/>/.exec(src)?.[0] ?? "";
    expect(mountSrc).toMatch(/\brouteHold=\{routeHold\}/);
  });
});
