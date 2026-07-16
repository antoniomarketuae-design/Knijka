/**
 * ADR-006 stage 1b integration — emergencyApproach against the REAL district
 * (doc 72 VU-09 „Линейка отзад", ЗДвП чл. 91). Site: the 352 m two-way
 * residential east arm e519275131.0 (n179974491 → n417233856, limit 50),
 * mid-block — far from both end junctions, so no signal/priority machinery
 * interferes.
 *
 * The emergency actor (profile "emergency") runs the player's direction
 * offset 6.5 m LEFT of the right-lane center (the oncoming-lane side — real
 * EV pathing), closing from behind at ~61 km/h. Make way (ease right and/or
 * slow, or simply stand) → YIELDED_TO_PRIORITY; hold the middle at speed
 * through the generous window → EMERGENCY_NOT_YIELDED ("emergency" — never
 * the junction FAILED_TO_YIELD).
 */

import { describe, expect, it } from "vitest";
import type { EmergencyApproachSpec } from "../../contracts";
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

const EDGE = "e519275131.0";
/** Scaled lane-center offset for the right lane of a 2-lane two-way edge. */
const LANE_OFFSET = 4.0625;

function edgeGeometry(): Array<[number, number]> {
  const raw = loadRawDistrict();
  const edge = raw.roads.edges.find((e) => e.id === EDGE);
  if (!edge) throw new Error(`edge ${EDGE} not in district`);
  return edge.geometry.map((p) => [p[0], p[1]]);
}

function emergencySpec(): EmergencyApproachSpec {
  return {
    id: "t-emergency",
    kind: "emergencyApproach",
    actor: {
      pathNodes: ["n179974491", "n417233856"],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 17,
      extraRightOffsetM: -6.5, // oncoming-lane side: passes on the player's left
      profile: "emergency",
    },
    releaseGapM: 40,
    armBehindM: 60,
    responseWindowSec: 6.5,
    yieldShiftM: 0.8,
    yieldSlowKmh: 38,
    passAheadM: 18,
    clearSpeedMps: 19,
  };
}

/** Approximate gap between the player's and the actor's edge arcs, m. */
function behindApprox(stack: Stack, driverS: number): number {
  const view = stack.traffic.staged("t-emergency");
  return view ? driverS - view.s : Infinity;
}

describe("emergencyApproach (integration)", () => {
  it("holding the lane center at speed convicts EMERGENCY_NOT_YIELDED (situation 'emergency')", () => {
    const stack = makeStack([emergencySpec()]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    const driver = new PolyDriver(path, 55);
    for (let i = 0; i < 40 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 12.5)); // ~45 km/h, centered, unmoved
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({
      eventId: "t-emergency",
      kind: "emergencyApproach",
      success: false,
      detail: "violation",
    });
    const emergency = violationCodes(stack.ruleEvents).filter((c) => c === "EMERGENCY_NOT_YIELDED");
    expect(emergency).toHaveLength(1); // one adjudication per approach
    expect(violationCodes(stack.ruleEvents)).not.toContain("FAILED_TO_YIELD");
    const v = stack.ruleEvents.find((e) => e.kind === "violation" && e.code === "EMERGENCY_NOT_YIELDED");
    expect(v && "detail" in v ? v.detail : "").toBe("emergency");
  });

  it("innocent: slowing while keeping right lets it pass — YIELDED_TO_PRIORITY, zero violations", () => {
    const stack = makeStack([emergencySpec()]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    const driver = new PolyDriver(path, 55);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      // Cruise until the EV is genuinely close behind, then shed speed —
      // the make-way response, well inside the window.
      const target = behindApprox(stack, driver.s) <= 55 ? 8 : 12.5;
      stepFrame(stack, driver.advance(DT, target));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "yielded" });
    expect(commendationCodes(stack.ruleEvents)).toContain("YIELDED_TO_PRIORITY");
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
  });

  it("innocent: a player already stopped at the curb is an immediate yield", () => {
    const stack = makeStack([emergencySpec()]);
    // Curb-side line: 1.8 m right of the lane center, stopped mid-block.
    const path = offsetRight(edgeGeometry(), LANE_OFFSET + 1.8);
    const driver = new PolyDriver(path, 55);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      const target = driver.s >= 95 ? 0 : 10; // pull up and stand
      stepFrame(stack, driver.advance(DT, target));
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "yielded" });
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
  });

  it("never fires without an armed approach: too close for release = no run, no events", () => {
    const stack = makeStack([emergencySpec()]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    const driver = new PolyDriver(path, 20); // inside releaseGapM of the hold
    for (let i = 0; i < 15 * 30; i++) {
      stepFrame(stack, driver.advance(DT, 0.5)); // crawls, never opens the gap
    }
    expect(stack.outcomes).toEqual([]);
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
    expect(commendationCodes(stack.ruleEvents)).toEqual([]);
    expect(stack.director.snapshot()[0].phase).toBe("armed"); // still dormant
    const view = stack.traffic.staged("t-emergency")!;
    expect(view.speedMps).toBe(0); // the actor never started its run
  });

  it("same seed + same driving = identical outcomes (deterministic staging)", () => {
    const runOnce = () => {
      const stack = makeStack([emergencySpec()]);
      const path = offsetRight(edgeGeometry(), LANE_OFFSET);
      const driver = new PolyDriver(path, 55);
      for (let i = 0; i < 40 * 30 && stack.outcomes.length === 0; i++) {
        stepFrame(stack, driver.advance(DT, 12.5));
        if (driver.s >= driver.length) break;
      }
      return stack;
    };
    const a = runOnce();
    const b = runOnce();
    expect(a.outcomes).toEqual(b.outcomes);
    expect(violationCodes(a.ruleEvents)).toEqual(violationCodes(b.ruleEvents));
  });
});
