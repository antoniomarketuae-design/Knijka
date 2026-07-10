/**
 * A8 integration — the five staged events against the REAL district, driven
 * through the production frame pipeline (runtime → traffic → sample →
 * director → rule engine). Each event gets a failure branch (the mistake the
 * encounter teaches, graded by the EXISTING rule engine) and a success
 * branch (the correct resolution), plus seeded-determinism coverage.
 *
 * The suites reuse the AUTHORED lesson specs (lessons/specs.ts) so the
 * pinned district geometry is what actually gets validated.
 */

import { describe, expect, it } from "vitest";
import type {
  BrakingLeadCarSpec,
  CyclistRightHookSpec,
  PedestrianDartOutSpec,
  PriorityFromRightSpec,
  RoundaboutEntrySpec,
} from "../../contracts";
import { lessonById } from "../../lessons/specs";
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

function stagedOf<T>(lessonId: string, eventId: string): T {
  const lesson = lessonById(lessonId);
  const spec = lesson?.stagedEvents?.find((e) => e.id === eventId);
  if (!spec) throw new Error(`missing staged event ${eventId} on ${lessonId}`);
  return spec as T;
}

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

/** Scaled lane-center offset for the right lane of a 2-lane two-way edge. */
const LANE_OFFSET = 4.0625;

// ---------------------------------------------------------------------------
// 1. L4 — pedestrian dart-out
// ---------------------------------------------------------------------------

describe("L4 pedestrian dart-out (integration)", () => {
  const spec = stagedOf<PedestrianDartOutSpec>("l4-crossings", "l4-ped-dart-out");
  // The player's own edge, right lane bank, driven spawn→crossing direction.
  const path = () => offsetRight(edgeGeometry("e28780082.0"), LANE_OFFSET);

  it("triggers on a fast approach and the rule engine grades the failure", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 60);
    for (let i = 0; i < 30 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 12.5)); // ~45 km/h, never brakes
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.eventId).toBe("l4-ped-dart-out");
    expect(outcome.success).toBe(false);
    expect(["violation", "collision"]).toContain(outcome.detail);
    expect(outcome.approachSpeedKmh).toBeGreaterThanOrEqual(spec.minTriggerSpeedKmh);
    // The EXISTING detectors graded it — a 10-point опасна fired.
    const codes = violationCodes(stack.ruleEvents);
    expect(
      codes.some((c) =>
        ["PEDESTRIAN_NOT_YIELDED", "PEDESTRIAN_CROSSING_TOO_FAST", "COLLISION"].includes(c),
      ),
    ).toBe(true);
  });

  it("a yielding driver resolves the encounter successfully with a measured reaction", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 60);
    let triggeredAt: number | null = null;
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      const phase = stack.director.snapshot()[0].phase;
      if (phase === "triggered" && triggeredAt === null) triggeredAt = stack.t;
      const reacting = triggeredAt !== null && stack.t - triggeredAt >= 0.5;
      const pose = driver.advance(DT, reacting ? 0 : 11);
      pose.brakePedal = reacting ? 1 : 0;
      stepFrame(stack, pose);
    }
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.success).toBe(true);
    expect(outcome.detail).toBe("yielded");
    expect(outcome.reactionTimeSec).toBeGreaterThan(0.4);
    expect(outcome.reactionTimeSec).toBeLessThan(0.8);
    expect(violationCodes(stack.ruleEvents)).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(violationCodes(stack.ruleEvents)).not.toContain("COLLISION");
  });

  it("never fires for a slow local-street crawl (arm condition holds)", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 60);
    for (let i = 0; i < 90 * 30; i++) {
      stepFrame(stack, driver.advance(DT, 4)); // ~14 km/h, under the trigger
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(0);
    // Pedestrian never released — still standing at the curb.
    expect(stack.traffic.staged(spec.id)!.s).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. L2 — priority from the right (stop-guarded junction, give-way check)
// ---------------------------------------------------------------------------

describe("L2 priority-from-right (integration)", () => {
  const spec = stagedOf<PriorityFromRightSpec>("l2-intersections", "l2-priority-from-right");

  // spawn-4 route: north on the oneways, right turn east at the Б2 T-junction,
  // east to the arterial junction n5063751788, then north.
  const path = () =>
    concat(
      edgeGeometry("e226063192.0"), // oneway, single lane → centerline
      edgeGeometry("e897608662.0"),
      offsetRight(reversed(edgeGeometry("e904964433.0")), LANE_OFFSET), // east
      offsetRight(reversed(edgeGeometry("e30122178.0")), LANE_OFFSET),
      offsetRight(reversed(edgeGeometry("e1375487708.0")), LANE_OFFSET),
      offsetRight(reversed(edgeGeometry("e1375487707.0")), LANE_OFFSET),
      offsetRight(edgeGeometry("e672169337.0"), 4), // north on the arterial
    );

  it("barging across the stop line meets the car and grades FAILED_TO_YIELD", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 90);
    for (let i = 0; i < 90 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 7.8)); // ~28 km/h, rolls every stop
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.success).toBe(false);
    expect(["violation", "collision"]).toContain(outcome.detail);
    expect(violationCodes(stack.ruleEvents)).toContain("FAILED_TO_YIELD");
  });

  it("stopping at the line while the car passes earns the yield commendation", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 90);
    const arcJunction = driver.arcOf(spec.junction.x, spec.junction.y);
    const waitAt = arcJunction - 20; // ~12 m before the graded line
    for (let i = 0; i < 120 * 30 && stack.outcomes.length === 0; i++) {
      const view = stack.traffic.staged(spec.id)!;
      const carCleared = view.s > view.nodeS[spec.junctionNodeIndex] + 30;
      const target = driver.s >= waitAt && !carCleared ? 0 : driver.s >= waitAt ? 5 : 7.8;
      stepFrame(stack, driver.advance(DT, target));
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "yielded" });
    expect(violationCodes(stack.ruleEvents)).not.toContain("FAILED_TO_YIELD");
    expect(commendationCodes(stack.ruleEvents)).toContain("YIELDED_TO_PRIORITY");
  });

  it("the same machinery grades barging via conflictFromRight at an uncontrolled junction", () => {
    // Synthetic variant at n348207502 (uncontrolled 4-way on the L3 corridor):
    // player northbound, scripted car from the RIGHT (east arm) — the
    // runtime's right-hand-rule tracker adjudicates via conflictFromRight.
    // leadSec is NEGATIVE here: the stop-line check samples the crossing
    // instant (car must already be at the box → positive lead), while the
    // RHR check spans the player's whole core visit — the car must still be
    // approaching from the right as the player barges in.
    const rhr: PriorityFromRightSpec = {
      id: "t-rhr",
      kind: "priorityFromRight",
      junction: { nodeId: "n348207502", x: 389.21, y: -271.99 },
      junctionControl: "uncontrolled",
      actor: {
        pathNodes: ["n179974491", "n348207502", "n332113263"],
        hold: { nodeIndex: 1, offsetM: -60 },
        cruiseSpeedMps: 8.5,
      },
      junctionNodeIndex: 1,
      armDistM: 90,
      leadSec: -0.8,
      lineDistM: 16,
      clearSpeedMps: 12.5,
    };
    const stack = makeStack([rhr]);
    // Northbound approach: e31297253.0 then e1164416887.0 (single oneways).
    const driver = new PolyDriver(
      concat(edgeGeometry("e31297253.0"), edgeGeometry("e1164416887.0"), [[389.5, -262]]),
      140,
    );
    for (let i = 0; i < 90 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 8.3)); // ~30 km/h straight through
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0].success).toBe(false);
    const failedToYield = stack.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD",
    );
    expect(failedToYield).toBeDefined();
    expect(failedToYield && "detail" in failedToYield ? failedToYield.detail : "").toBe(
      "right-hand-rule",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. L5 — braking lead car + ball dart-out with measured reaction time
// ---------------------------------------------------------------------------

describe("L5 braking lead car (integration)", () => {
  const spec = stagedOf<BrakingLeadCarSpec>("l5-emergency-braking", "l5-braking-lead-car");
  const path = () => concat(edgeGeometry("e661825071.0"), []); // 1-lane oneway → centerline

  interface L5Run {
    stack: Stack;
    slamAtSec: number | null;
  }

  /** Reactive controller: cruise at ~50, brake hard `reactionSec` after the
   *  hazard visual fires (pure function of observed state → deterministic). */
  function runL5(reactionSec: number | null, seed = 7): L5Run {
    const stack = makeStack([spec], seed);
    const driver = new PolyDriver(path(), 105); // spawn-2 sits at s≈105
    let slamAtSec: number | null = null;
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      if (slamAtSec === null && stack.director.hazardActive) slamAtSec = stack.t;
      const braking =
        reactionSec !== null && slamAtSec !== null && stack.t - slamAtSec >= reactionSec;
      const pose = driver.advance(DT, braking ? 0 : 14);
      pose.brakePedal = braking ? 1 : 0;
      stepFrame(stack, pose);
      if (driver.s >= driver.length) break;
    }
    return { stack, slamAtSec };
  }

  it("slams at the staged point, darts the ball, and measures the reaction time", () => {
    const { stack, slamAtSec } = runL5(0.55);
    expect(slamAtSec).not.toBeNull();
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome).toMatchObject({ success: true, detail: "stoppedInTime" });
    expect(outcome.reactionTimeSec).toBeGreaterThan(0.45);
    expect(outcome.reactionTimeSec).toBeLessThan(0.75);
    expect(outcome.stopGapM).toBeGreaterThan(0.5);
    expect(outcome.approachSpeedKmh).toBeGreaterThanOrEqual(spec.minSlamSpeedKmh);
    // No collision, no yield-class violations for a clean emergency stop.
    expect(violationCodes(stack.ruleEvents)).not.toContain("COLLISION");

    // Housekeeping: hazard retires and the lead car drives on after the beat.
    const view = stack.traffic.staged(spec.id)!;
    const stopped = view.s;
    const parked = stack.ticks.at(-1)!;
    void parked;
    const driver = new PolyDriver(path(), 105);
    const hold = driver.poseAt(Math.max(0, stopped - 30)); // player waits behind
    for (let i = 0; i < Math.round((spec.resumeAfterSec + 2) / DT); i++) {
      stepFrame(stack, { ...hold, speedKmh: 0, brakePedal: 0 });
    }
    expect(stack.director.hazardActive).toBe(false);
    expect(stack.traffic.staged(spec.id)!.s).toBeGreaterThan(stopped + 2);
  });

  it("failing to brake rear-ends the lead car — graded COLLISION by the reducer", () => {
    const { stack } = runL5(null);
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: false, detail: "hitLeadCar" });
    expect(violationCodes(stack.ruleEvents)).toContain("COLLISION");
    // The collision arrived through the tick pipeline (existing vocabulary).
    expect(
      stack.ticks.some((t) =>
        t.events.some((e) => e.kind === "collision" && e.withWhat === "vehicle"),
      ),
    ).toBe(true);
  });

  it("same seed + same driving = identical staging and measurements", () => {
    const a = runL5(0.55);
    const b = runL5(0.55);
    expect(a.slamAtSec).toBe(b.slamAtSec);
    expect(a.stack.outcomes).toEqual(b.stack.outcomes);
    const va = a.stack.traffic.staged(spec.id)!;
    const vb = b.stack.traffic.staged(spec.id)!;
    expect(va.s).toBe(vb.s);
    expect(va.x).toBe(vb.x);
  });
});

// ---------------------------------------------------------------------------
// 4. L3 — cyclist right-hook at the uncontrolled T
// ---------------------------------------------------------------------------

describe("L3 cyclist right-hook (integration)", () => {
  const spec = stagedOf<CyclistRightHookSpec>("l3-roundabout", "l3-cyclist-right-hook");
  // Southbound on the shared straight (right lane), then the right turn west.
  // Offset ONCE over the concatenated centerline so the corner reads as a
  // single clean right-turn vertex (per-leg offsetting would insert a jog
  // that corrupts the turn detector's heading window).
  const path = () =>
    offsetRight(
      concat(reversed(edgeGeometry("e170139947.0")), edgeGeometry("e1164416587.0")),
      LANE_OFFSET,
    );

  it("turning right across the cyclist is adjudicated FAILED_TO_YIELD (or collision)", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 10);
    for (let i = 0; i < 90 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 7.8)); // ~28 km/h, unchecked turn
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.success).toBe(false);
    expect(["violation", "collision"]).toContain(outcome.detail);
    const codes = violationCodes(stack.ruleEvents);
    expect(codes.some((c) => c === "FAILED_TO_YIELD" || c === "COLLISION")).toBe(true);
  });

  it("waiting for the cyclist to clear resolves as yielded", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 10);
    const arcJ = driver.arcOf(spec.junction.x, spec.junction.y);
    for (let i = 0; i < 120 * 30 && stack.outcomes.length === 0; i++) {
      const view = stack.traffic.staged(spec.id)!;
      const cyclistClear = view.s > view.nodeS[spec.junctionNodeIndex] + 10;
      const target = driver.s >= arcJ - 12 && !cyclistClear ? 0 : driver.s >= arcJ - 12 ? 5 : 7.8;
      stepFrame(stack, driver.advance(DT, target));
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "yielded" });
    expect(violationCodes(stack.ruleEvents)).not.toContain("FAILED_TO_YIELD");
    expect(violationCodes(stack.ruleEvents)).not.toContain("COLLISION");
    expect(commendationCodes(stack.ruleEvents)).toContain("YIELDED_TO_PRIORITY");
  });
});

// ---------------------------------------------------------------------------
// 5. L3 — roundabout entry conflict
// ---------------------------------------------------------------------------

describe("L3 roundabout entry (integration)", () => {
  const spec = stagedOf<RoundaboutEntrySpec>("l3-roundabout", "l3-roundabout-conflict");
  // Approach on e53561253.0 (oneway into the SE entry), then along the ring
  // arc toward the next ring node — entering while the circulator conflicts.
  const path = () =>
    concat(edgeGeometry("e53561253.0"), [
      [-20.1, -344],
      [-22, -336],
    ]);

  it("entering at speed against the circulating car grades FAILED_TO_YIELD", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 0);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 6.9)); // ~25 km/h, barges the entry
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: false, detail: "violation" });
    const failedToYield = stack.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD",
    );
    expect(failedToYield).toBeDefined();
    expect(failedToYield && "detail" in failedToYield ? failedToYield.detail : "").toBe(
      "roundabout",
    );
  });

  it("yielding at the entry while the car circulates earns the commendation", () => {
    // The runtime tracker arms 12 m beyond the ring (dCenter ≤ 31.8) and
    // flags ANY >3 km/h inward movement while the circulator is on the left —
    // so a correct student is already crawling when they enter that zone,
    // registers the conflict at yield speed, and does not push in.
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 0);
    const arcEntry = driver.arcOf(spec.entry.x, spec.entry.y);
    let waitedFrames = 0;
    for (let i = 0; i < 120 * 30 && stack.outcomes.length === 0; i++) {
      if (driver.s < arcEntry - 20) {
        stepFrame(stack, driver.advance(DT, 6.9)); // normal approach
      } else if (driver.s < arcEntry - 9 && waitedFrames === 0) {
        stepFrame(stack, driver.advance(DT, 0.8)); // creep into the zone ≤3 km/h
      } else {
        waitedFrames++;
        if (waitedFrames <= Math.round(5 / DT)) {
          // Hold at the yield line while the circulator passes on the left.
          stepFrame(stack, driver.advance(DT, 0));
        } else {
          // Decide not to enter yet — back away from the ring; leaving the
          // vicinity makes the runtime tracker adjudicate the yield.
          stepFrame(stack, driver.retreat(DT, 3));
        }
      }
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "yielded" });
    expect(commendationCodes(stack.ruleEvents)).toContain("YIELDED_TO_PRIORITY");
    expect(violationCodes(stack.ruleEvents)).not.toContain("FAILED_TO_YIELD");
  });

  it("the circulator keeps looping deterministically (ring path wraps)", () => {
    const stack = makeStack([spec]);
    const view = stack.traffic.staged(spec.id)!;
    // Park the player near the ring so the event arms and locks the loop.
    const pose = { x: spec.entry.x + 6, y: spec.entry.y - 8, headingDeg: 324, speedKmh: 0, brakePedal: 0 };
    for (let i = 0; i < 40 * 30; i++) stepFrame(stack, pose);
    // One full lap is ~123 m — the actor must have wrapped at least once.
    expect(view.pathLengthM).toBeGreaterThan(100);
    expect(view.speedMps).toBeGreaterThan(0);
    expect(view.s).toBeLessThan(view.pathLengthM);
  });
});
