/**
 * THE ENCOUNTER WAITS FOR HIS TURN — sc-turn-left-oncoming:d079e687 (clause 5),
 * the runner half. `OncomingLeftTurnRunner.committed` answers «did he begin
 * the left turn at this junction while the encounter was live», and
 * lessons/objectives.ts reads `committed: false` as «he never turned»: the
 * debrief's «Интервал: завоят не беше започнат…».
 *
 * Until 2026-10-09 the encounter was live only until its car was 40 m past the
 * node, unless a `sawYield` latch had caught the student at ≤ 8 km/h while
 * that car was within 36 m of the node. A student rolling up at 11.5 km/h
 * while the car went through missed the latch, the runner resolved «clear,
 * committed: false» behind his back, and the turn he made a few seconds later
 * was a turn the outcome said never happened. The rig-w2 phone drives printed
 * exactly that under the ✓ of the turn task (4 of 4 runs at 43b4109).
 *
 * Same site and frame pipeline as oncoming-left-turn.test.ts (n179974491,
 * signalized, approach lamp pinned green).
 */

import { describe, expect, it } from "vitest";
import type { OncomingLeftTurnSpec, StagedEventOutcome } from "../../contracts";
import {
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
const APPROACH_BEARING = 254;
const LANE_OFFSET = 4.0625;
const START_S = 240; // ≈112 m short of the junction on the east arm

function edge(edgeId: string): Array<[number, number]> {
  const e = loadRawDistrict().roads.edges.find((x) => x.id === edgeId);
  if (!e) throw new Error(`edge ${edgeId} not in district`);
  return e.geometry.map((p) => [p[0], p[1]]);
}
const rev = (p: Array<[number, number]>) => [...p].reverse();
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
const turnPath = () => offsetRight(concat(rev(edge("e519275131.0")), edge("e724866098.0")), LANE_OFFSET);
// On west past the node for 145 m (the oncoming's own two edges, reversed) —
// beyond the hold radius, which for this spec is its 95 m arming distance.
const straightPath = () =>
  offsetRight(
    concat(rev(edge("e519275131.0")), rev(edge("e661825048.3")), rev(edge("e661825048.2"))),
    LANE_OFFSET,
  );

function pinGreen(stack: Stack): void {
  stack.runtime.setSignalClusterOffset(
    NODE,
    stack.runtime.signalOffsetForPhaseStart(NODE, APPROACH_BEARING, "green", 0),
  );
}

const SPEC: OncomingLeftTurnSpec = {
  id: "t-ltap-late",
  kind: "oncomingLeftTurn",
  junction: { nodeId: NODE, x: J.x, y: J.y },
  actor: {
    pathNodes: ["n332113263", "n348207502", "n179974491", "n417233856"],
    hold: { nodeIndex: 2, offsetM: -115 },
    cruiseSpeedMps: 8.5,
  },
  junctionNodeIndex: 2,
  armDistM: 95,
  gapSec: 6,
  clearSpeedMps: 12.5,
};

/** 11.5 km/h — over the 8 km/h the old latch asked for, a normal careful roll. */
const ROLL_MPS = 3.2;

interface Drive {
  stack: Stack;
  outcome: StagedEventOutcome | undefined;
  /** Session time of the runtime's left `turnStarted` (null: none). */
  turnAt: number | null;
  /** Session time the staged car first stood > 40 m past the node. */
  carClearAt: number | null;
  /** Player's distance to the node when the outcome landed, m. */
  dAtOutcome: number | null;
  /** Max player speed while the car was within ±36 m of the node, km/h. */
  minKmhInCarWindow: number;
}

/**
 * Creep in at 7 km/h until the encounter arms (≤ 95 m, ≤ 8 km/h), then roll at
 * 11.5 km/h while its car crosses the node, stop 16 m short of the node, wait
 * until the car is gone, then either turn left or drive straight on.
 */
function drive(kind: "turn" | "straight"): Drive {
  const stack = makeStack([SPEC]);
  const driver = new PolyDriver(kind === "turn" ? turnPath() : straightPath(), START_S);
  const arcJ = driver.arcOf(J.x, J.y);
  let turnAt: number | null = null;
  let carClearAt: number | null = null;
  let stoppedAt: number | null = null;
  let dAtOutcome: number | null = null;
  let minKmhInCarWindow = Infinity;
  // 90 s: the straight-on student rolls 95 m in and 95 m out at 11.5 km/h.
  for (let i = 0; i < 60 * 90; i++) {
    pinGreen(stack);
    const view = stack.traffic.staged(SPEC.id)!;
    const carArc = view.s - view.nodeS[2];
    if (carClearAt === null && carArc > 40) carClearAt = stack.t;
    const armed = view.speedMps > 0 || carArc > -114;
    let target: number;
    if (!armed) target = 2; // 7.2 km/h until the encounter is triggered
    else if (kind === "straight") target = ROLL_MPS;
    else if (stoppedAt === null && driver.s < arcJ - 16) target = ROLL_MPS;
    else if (carClearAt === null || stack.t < carClearAt + 2) target = 0;
    else target = 6;
    if (target === 0 && stoppedAt === null && driver.s >= arcJ - 16.5) stoppedAt = stack.t;
    const pose = driver.advance(DT, target);
    if (Math.abs(carArc) <= 36) minKmhInCarWindow = Math.min(minKmhInCarWindow, pose.speedKmh);
    const before = stack.outcomes.length;
    const tick = stepFrame(stack, pose, { indicator: kind === "turn" ? "left" : "off" });
    if (turnAt === null && tick.events.some((e) => e.kind === "turnStarted" && e.direction === "left")) {
      turnAt = stack.t;
    }
    if (stack.outcomes.length > before && dAtOutcome === null) {
      dAtOutcome = Math.hypot(pose.x - J.x, pose.y - J.y);
    }
    if (driver.s >= driver.length) break;
    if (stack.outcomes.length > 0 && (kind === "straight" || turnAt !== null)) break;
  }
  return {
    stack,
    outcome: stack.outcomes.find((o) => o.eventId === SPEC.id),
    turnAt,
    carClearAt,
    dAtOutcome,
    minKmhInCarWindow,
  };
}

describe("the oncoming car went through before he turned — the outcome still says he turned", () => {
  const d = drive("turn");

  it("the drive is the one the old latch missed: never at or under 8 km/h while the car was within 36 m", () => {
    expect(d.carClearAt).not.toBeNull();
    expect(d.minKmhInCarWindow).toBeGreaterThan(8);
    expect(d.turnAt).not.toBeNull();
    // He turned AFTER the car was 40 m clear — the encounter he is judged on
    // was over by then, and only the turn was still to come.
    expect(d.turnAt!).toBeGreaterThan(d.carClearAt!);
  });

  it("the encounter resolves at his turn, committed: true — not before it, committed: false", () => {
    expect(d.outcome).toBeDefined();
    expect(d.outcome!.committed).toBe(true);
    expect(d.outcome!.tSec).toBeGreaterThanOrEqual(d.turnAt!);
    // The car was past the node at the commit, so there is no inbound figure
    // to record — the «лентата беше чиста» account, which is true here.
    expect(d.outcome!.acceptedGapSec).toBeUndefined();
    expect(d.outcome!.detail).toBe("clear");
    expect(violationCodes(d.stack.ruleEvents)).toEqual([]);
  });
});

describe("a student who drives straight on, never turning, is still reported as never turning", () => {
  const d = drive("straight");

  it("the outcome lands only once he has left the junction, committed: false", () => {
    // «Left» is past the hold radius: the larger of its 60 m floor and the
    // distance this encounter arms at (SPEC.armDistM 95 — round 2).
    expect(d.turnAt).toBeNull();
    expect(d.outcome).toBeDefined();
    expect(d.outcome!.committed).toBe(false);
    expect(d.outcome!.detail).toBe("clear");
    expect(d.dAtOutcome!).toBeGreaterThan(SPEC.armDistM);
    expect(d.dAtOutcome!).toBeLessThan(SPEC.armDistM + 1);
  });
});
