/**
 * ADR-006 stage 1d integration — trafficController against the REAL sx-v1
 * district (doc 72 JU-18 „Регулировчик", ЗДвП чл. 7). The runner ARMS the
 * whole mechanic at session start through the director's SignalDirectorPort
 * (cluster mode "controlled" + authored timetable + lamp pin) and stages the
 * posed figure; GRADING is 100% the production pipeline — the runtime's
 * stopLineCrossed carries the controller permission and the reducer grades
 * it. The runner itself emits ZERO SimTick events (amberDilemma precedent).
 *
 * Site: sx-n-c (single-node cluster at the origin); the player approaches up
 * the south stem (lane x = 4.0625, stop line y = −27.725, group "ns"). The
 * authored staging (SC_SIGNAL_CONTROLLER_EVENT): lamp offset 45 ⇒ ns GREEN
 * for t ∈ [5, 25); halt ns until the flip at t = 30 (by then the lamps are
 * red) — the hierarchy in both directions.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../runtime";
import { createRuleEngine, reduceTick } from "../../rules";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";
import { SC_SIGNAL_CONTROLLER_EVENT } from "../../lessons/scenario/templates-signals";
import { createScenarioDirector } from "../director";
import { commendationCodes, DT, PolyDriver, violationCodes, type Stack } from "./helpers";

const LANE = 4.0625;
const SX_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world/sx-v1.json",
);

let sxCache: TrafficDistrict | null = null;
function loadSx(): TrafficDistrict {
  if (!sxCache) sxCache = JSON.parse(readFileSync(SX_PATH, "utf-8")) as TrafficDistrict;
  return sxCache;
}

/** The production stack on sx-v1 (mirrors helpers.makeStack, sx district). */
function makeSxStack(seed = 7): Stack {
  const raw = loadSx();
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, { seed, vehicleCount: 0, pedestrianCount: 0 });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  const director = createScenarioDirector([SC_SIGNAL_CONTROLLER_EVENT], traffic, {
    seed,
    signals: runtime,
  });
  return {
    runtime,
    traffic,
    director,
    rules: createRuleEngine(),
    ruleEvents: [],
    ticks: [],
    outcomes: [],
    t: 0,
  };
}

/** One production-ordered frame (helpers.stepFrame, sx wiring). */
function step(stack: Stack, p: { x: number; y: number; headingDeg: number; speedKmh: number; brakePedal: number }): void {
  stack.t += DT;
  stack.runtime.update(DT);
  stack.traffic.update(DT, {
    signalPhase: (id) => stack.runtime.signalPhase(id),
    playerPos: { x: p.x, y: p.y },
    playerSpeedKmh: p.speedKmh,
    playerHeadingDeg: p.headingDeg,
  });
  const tick = stack.runtime.sample(
    {
      position: { x: p.x, y: p.y },
      headingDeg: p.headingDeg,
      speedKmh: p.speedKmh,
      indicator: "off",
      headlights: "off",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 1,
      mirrorGlance: null,
    },
    stack.t,
    false,
    false,
    Infinity,
  );
  const staged = stack.director.step({
    tSec: stack.t,
    dtSec: DT,
    x: p.x,
    y: p.y,
    speedKmh: p.speedKmh,
    headingDeg: p.headingDeg,
    brakePedal: p.brakePedal,
    tickEvents: tick.events,
  });
  for (const e of staged.events) tick.events.push(e);
  stack.outcomes.push(...staged.outcomes);
  const { state, events } = reduceTick(stack.rules, tick);
  stack.rules = state;
  stack.ruleEvents.push(...events);
  stack.ticks.push(tick);
}

const PATH: Array<[number, number]> = [
  [LANE, -105],
  [LANE, 48],
];
/** Arc of the hold point (y = −31, just before the −27.725 stop line). */
const HOLD_ARC = 105 - 31;

/** Barge through on the (green) lamps while the controller halts. */
function runBarge(stack: Stack): void {
  const driver = new PolyDriver(PATH, 0);
  for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
    step(stack, driver.advance(DT, 5.5)); // ~20 km/h
    if (driver.s >= driver.length) break;
  }
}

/** Hold at the line through the halt; proceed after the authored flip. */
function runYield(stack: Stack): void {
  const driver = new PolyDriver(PATH, 0);
  for (let i = 0; i < 90 * 30 && stack.outcomes.length === 0; i++) {
    const holding = driver.s >= HOLD_ARC - 1 && stack.t < 32;
    const frame = driver.advance(DT, holding ? 0 : 5);
    step(stack, { ...frame, brakePedal: holding ? 0.6 : 0 });
    if (driver.s >= driver.length) break;
  }
}

describe("trafficController (integration, sx-v1)", () => {
  it("arms the mechanic at session start: posed figure + green lamps over a halted approach", () => {
    const stack = makeSxStack();
    // The figure: pose "directTraffic", standing at the junction post.
    const figure = stack.traffic.pedestrians.find((p) => p.pose === "directTraffic")!;
    expect(figure).toBeDefined();
    expect(figure.x).toBeCloseTo(0, 3);
    expect(figure.y).toBeCloseTo(0, 3);
    // Drive the clock into the authored green window: lamps GREEN for the
    // approach the controller HALTS — the misleading-but-visible staging —
    // and the surfaced context reads the EFFECTIVE signal (red).
    const driver = new PolyDriver(PATH, 0);
    while (stack.t < 10) step(stack, driver.advance(DT, 4));
    expect(stack.runtime.signalPhaseForApproach("sx-n-c", 0)).toBe("green");
    const tick = stack.ticks[stack.ticks.length - 1];
    expect(tick.nextStopLineControl).toBe("trafficLight");
    expect(tick.nextStopLineState).toBe("red");
    // The figure never walks.
    expect(figure.speedMps).toBe(0);
  });

  it("guilty side: crossing on green lamps while halted grades EXACTLY the controller code", () => {
    const stack = makeSxStack();
    runBarge(stack);
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({
      eventId: "sc-sctrl-controller",
      kind: "trafficController",
      success: false,
      detail: "violation",
    });
    expect([...new Set(violationCodes(stack.ruleEvents))]).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    // The lamp truth at the graded crossing IS green (probed on the event).
    const crossing = stack.ticks
      .flatMap((t) => t.events)
      .find((e) => e.kind === "stopLineCrossed" && e.control === "trafficLight");
    expect(crossing).toMatchObject({ lightState: "green", controller: "halt" });
  });

  it("innocent side: waiting out the halt and proceeding after the flip (red lamps) grades NOTHING", () => {
    const stack = makeSxStack();
    runYield(stack);
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "yielded" });
    expect(stack.outcomes[0].tSec).toBeGreaterThan(30);
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
    const crossing = stack.ticks
      .flatMap((t) => t.events)
      .find((e) => e.kind === "stopLineCrossed" && e.control === "trafficLight");
    expect(crossing).toMatchObject({ controller: "proceed" });
  });

  it("the runner emits ZERO SimTick events — the grading event is the runtime's own", () => {
    const stack = makeSxStack();
    runBarge(stack);
    // Nothing the reducer grades came from the director: no prioritySituation,
    // no collision — only the runtime's stopLineCrossed carries the verdict.
    for (const tick of stack.ticks) {
      expect(tick.events.filter((e) => e.kind === "prioritySituation" || e.kind === "collision")).toEqual([]);
    }
    expect(commendationCodes(stack.ruleEvents)).not.toContain("YIELDED_TO_PRIORITY");
  });

  it("reset() re-arms the encounter for a fresh attempt", () => {
    const stack = makeSxStack();
    runBarge(stack);
    expect(stack.outcomes).toHaveLength(1);
    stack.director.reset();
    expect(stack.director.snapshot()[0].phase).toBe("armed");
    // Second attempt resolves again (post-flip now — the permitted side).
    const driver = new PolyDriver(PATH, 0);
    for (let i = 0; i < 90 * 30 && stack.outcomes.length < 2; i++) {
      step(stack, driver.advance(DT, 5.5));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(2);
  });

  it("same seed + same driving = identical outcomes and codes (deterministic)", () => {
    const a = makeSxStack();
    const b = makeSxStack();
    runBarge(a);
    runBarge(b);
    expect(a.outcomes).toEqual(b.outcomes);
    expect(violationCodes(a.ruleEvents)).toEqual(violationCodes(b.ruleEvents));
  });
});
