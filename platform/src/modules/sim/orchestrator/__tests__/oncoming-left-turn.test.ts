/**
 * N1 integration — oncomingLeftTurn against the REAL district through the
 * production frame pipeline (runtime → traffic → sample → director → rule
 * engine), the events-integration.test.ts pattern.
 *
 * Site: n179974491 (448.9, -250.4) — the signalized 4-way with all arms
 * two-way (turns.test.ts's reference junction). Player approaches WESTBOUND
 * on the east arm (e519275131.0 reversed) and turns LEFT onto the south arm
 * (e724866098.0); the staged oncoming drives EASTBOUND straight through
 * [n348207502 → n179974491 → n417233856]. Signalized site ⇒ no RHR tracker
 * and no stop-sign give-way check can double-grade the encounter; the
 * player's approach lamp is pinned GREEN every frame.
 *
 * Gap tiers (exam-bank style): 1.4 s tight (guilty band), 2.6 s advisory
 * (legal-but-unsafe — measured, not graded), 6 s safe.
 */

import { describe, expect, it } from "vitest";
import type { OncomingLeftTurnSpec } from "../../contracts";
import { LEFT_TURN_GAP_ADVISORY_SEC, LEFT_TURN_GAP_SAFE_SEC } from "../../runtime";
import {
  commendationCodes,
  DT,
  loadRawDistrict,
  makeStack,
  offsetRight,
  PolyDriver,
  stepFrame,
  violationCodes,
  type Stack,
} from "./helpers";

const J = { x: 448.94, y: -250.42 };
const NODE = "n179974491";
/** Player approach bearing at the junction (westbound on the east arm). */
const APPROACH_BEARING = 254;
/** Scaled lane-center offset for the right lane of a 2-lane two-way edge. */
const LANE_OFFSET = 4.0625;

function edgeGeometry(edgeId: string): Array<[number, number]> {
  const raw = loadRawDistrict();
  const edge = raw.roads.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error(`edge ${edgeId} not in district`);
  return edge.geometry.map((p) => [p[0], p[1]]);
}

function reversed(points: Array<[number, number]>): Array<[number, number]> {
  return [...points].reverse();
}

function concat(...legs: Array<Array<[number, number]>>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const leg of legs) {
    for (const p of leg) {
      const last = out[out.length - 1];
      if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.05) continue;
      out.push(p);
    }
  }
  return out;
}

/** Keep the player's approach lamp on green (phase noise must not grade). */
function pinGreen(stack: Stack): void {
  stack.runtime.setSignalClusterOffset(
    NODE,
    stack.runtime.signalOffsetForPhaseStart(NODE, APPROACH_BEARING, "green", 0),
  );
}

function ltapSpec(gapSec: number): OncomingLeftTurnSpec {
  return {
    id: "t-ltap",
    kind: "oncomingLeftTurn",
    junction: { nodeId: NODE, x: J.x, y: J.y },
    actor: {
      // Extended runway west of the junction (e661825048.2 + .3 ≈ 145 m) so
      // every gap tier crosses the node at full cruise speed.
      pathNodes: ["n332113263", "n348207502", "n179974491", "n417233856"],
      hold: { nodeIndex: 2, offsetM: -115 },
      cruiseSpeedMps: 8.5,
    },
    junctionNodeIndex: 2,
    armDistM: 95,
    gapSec,
    clearSpeedMps: 12.5,
  };
}

/** Westbound approach + left turn onto the south arm (single mitred corner). */
const turnPath = () =>
  offsetRight(
    concat(reversed(edgeGeometry("e519275131.0")), edgeGeometry("e724866098.0")),
    LANE_OFFSET,
  );

/** Straight west through the junction (no turn — the innocent pass-by). */
const straightPath = () =>
  offsetRight(
    concat(reversed(edgeGeometry("e519275131.0")), reversed(edgeGeometry("e661825048.3"))),
    LANE_OFFSET,
  );

const START_S = 240; // ≈112 m short of the junction on the east arm

function runSteadyTurn(gapSec: number, seed = 7): Stack {
  const stack = makeStack([ltapSpec(gapSec)], seed);
  const driver = new PolyDriver(turnPath(), START_S);
  for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
    pinGreen(stack);
    stepFrame(stack, driver.advance(DT, 7.5), { indicator: "left" });
    if (driver.s >= driver.length) break;
  }
  return stack;
}

describe("oncomingLeftTurn (integration)", () => {
  it("turning across the tight gap grades FAILED_TO_YIELD (left-turn-oncoming)", () => {
    const stack = runSteadyTurn(1.4);
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.eventId).toBe("t-ltap");
    expect(outcome.success).toBe(false);
    expect(["violation", "collision"]).toContain(outcome.detail);
    const failed = stack.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD",
    );
    expect(failed).toBeDefined();
    expect(failed && "detail" in failed ? failed.detail : "").toBe("left-turn-oncoming");
  });

  it("waiting for the oncoming and then turning earns the yield commendation", () => {
    const stack = makeStack([ltapSpec(1.4)]);
    const driver = new PolyDriver(turnPath(), START_S);
    const arcJ = driver.arcOf(J.x, J.y);
    for (let i = 0; i < 120 * 30 && stack.outcomes.length === 0; i++) {
      pinGreen(stack);
      const view = stack.traffic.staged("t-ltap")!;
      const cleared = view.s > view.nodeS[2] + 32;
      const target = driver.s >= arcJ - 16 && !cleared ? 0 : driver.s >= arcJ - 16 ? 6 : 7.5;
      stepFrame(stack, driver.advance(DT, target), { indicator: "left" });
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "yielded" });
    expect(commendationCodes(stack.ruleEvents)).toContain("YIELDED_TO_PRIORITY");
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
  });

  it("the advisory-tier gap does NOT grade but IS measured (< 3 s accepted gap)", () => {
    const stack = runSteadyTurn(2.5);
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.success).toBe(true);
    expect(outcome.detail).toBe("clear");
    expect(violationCodes(stack.ruleEvents)).not.toContain("FAILED_TO_YIELD");
    // The gap-acceptance measurement channel — scenarios rubric < 3 s as the
    // unsafe-but-legal advisory (doc 72 JU-10: "< 4 s away" is the mistake).
    expect(outcome.acceptedGapSec).toBeDefined();
    expect(outcome.acceptedGapSec!).toBeGreaterThan(1.9);
    expect(outcome.acceptedGapSec!).toBeLessThan(LEFT_TURN_GAP_ADVISORY_SEC);
  });

  it("a safe 6 s gap resolves clear with the accepted gap ≥ the 4 s norm", () => {
    const stack = runSteadyTurn(6.0);
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.success).toBe(true);
    expect(outcome.detail).toBe("clear");
    expect(outcome.acceptedGapSec).toBeDefined();
    expect(outcome.acceptedGapSec!).toBeGreaterThanOrEqual(LEFT_TURN_GAP_SAFE_SEC);
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
  });

  it("innocent: driving STRAIGHT past the oncoming never grades (no commit, no crime)", () => {
    const stack = makeStack([ltapSpec(1.4)]);
    const driver = new PolyDriver(straightPath(), START_S);
    const arcJ = driver.arcOf(J.x, J.y);
    for (let i = 0; i < 60 * 30; i++) {
      pinGreen(stack);
      stepFrame(stack, driver.advance(DT, 7.5));
      if (driver.s >= arcJ + 25) break; // stop short of the next junction
    }
    expect(violationCodes(stack.ruleEvents)).not.toContain("FAILED_TO_YIELD");
  });

  it("innocent: turning left across an oncoming STOPPED at its red", () => {
    const stack = makeStack([]); // no runner — a dead-stopped staged car only
    const staged = stack.traffic.stage({
      kind: "vehicle",
      id: "t-stopped",
      pathNodes: ["n348207502", "n179974491", "n417233856"],
      hold: { nodeIndex: 1, offsetM: -14 },
      cruiseSpeedMps: 8,
    });
    expect(staged).not.toBeNull();
    const stack2 = stack;
    const driver = new PolyDriver(turnPath(), START_S);
    let turned = false;
    for (let i = 0; i < 60 * 30; i++) {
      pinGreen(stack2);
      const tick = stepFrame(stack2, driver.advance(DT, 7.5), { indicator: "left" });
      if (tick.events.some((e) => e.kind === "turnStarted" && e.direction === "left")) {
        turned = true;
      }
      if (driver.s >= driver.length) break;
    }
    expect(turned).toBe(true); // the innocence is about a REAL left turn
    expect(violationCodes(stack2.ruleEvents)).toEqual([]);
  });

  it("same seed + same driving = identical staging, grading and measurements", () => {
    const a = runSteadyTurn(1.4);
    const b = runSteadyTurn(1.4);
    expect(a.outcomes).toEqual(b.outcomes);
    expect(violationCodes(a.ruleEvents)).toEqual(violationCodes(b.ruleEvents));
  });

  it("re-stages deterministically on retry (reset → same encounter again)", () => {
    const stack = runSteadyTurn(1.4);
    expect(stack.outcomes[0]?.detail).toBeDefined();
    stack.director.reset();
    const view = stack.traffic.staged("t-ltap")!;
    expect(view.speedMps).toBe(0); // back at the dormant hold pose
    const driver = new PolyDriver(turnPath(), START_S);
    const before = stack.ruleEvents.length;
    for (let i = 0; i < 60 * 30 && stack.director.outcomes.length === 0; i++) {
      pinGreen(stack);
      stepFrame(stack, driver.advance(DT, 7.5), { indicator: "left" });
      if (driver.s >= driver.length) break;
    }
    expect(stack.director.outcomes).toHaveLength(1);
    expect(stack.director.outcomes[0].success).toBe(false);
    expect(violationCodes(stack.ruleEvents.slice(before))).toContain("FAILED_TO_YIELD");
  });
});
