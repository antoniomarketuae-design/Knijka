/**
 * B1a Wave-1 — the additive SimTick world context (doc 72 capabilities 1+N3)
 * against the REAL district:
 *  - zone/oneway legality surface (the OSM-verified «Зона 30» tags),
 *  - noOvertake/noUTurn passthrough (schema-tolerant, surface-only),
 *  - next-stop-line context (distance / control / live lamp state),
 *  - the amber `stoppable` adjudication on yellow crossings (JU-06), driven
 *    through the pinned-phase API on the reference junction approach.
 */

import { describe, expect, it } from "vitest";
import { createWorldRuntime, comfortableStopPossible } from "..";
import type { SimTick, SimTickEvent } from "../../rules/types";
import { drive, edgeById, edgeDrivePath, loadDistrict, mkVehicle } from "./helpers";

/** Reference junction (бул. Св. Климент Охридски × ул. Трайко Станоев). */
const JUNCTION = "n179974491";
/** The 352 m two-way approach edge along Трайко Станоев; edge.from = junction. */
const APPROACH_EDGE = "e519275131.0";
/** Scaled lane-center offset of a 1-lane-per-direction two-way edge. */
const LANE_OFFSET = 4.0625;

function stopLineArcOnApproach(rt: ReturnType<typeof createWorldRuntime>): number {
  const line = rt
    .debugStopLines()
    .find((l) => l.id.startsWith(`${APPROACH_EDGE}@`) && l.control === "trafficLight");
  if (!line) throw new Error("no trafficLight stop line on the approach edge");
  return line.sM; // edge.from IS the junction node → sM = setback from the node
}

type Crossed = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

/** Drive the approach at constant speed with the flip pinned `flipEtaSec`
 * of travel time before the line; returns the yellow crossing event. */
function driveThroughPinnedAmber(speedMps: number, flipEtaSec: number): Crossed | undefined {
  const district = loadDistrict();
  const rt = createWorldRuntime(district);
  const edge = edgeById(district, APPROACH_EDGE);
  const lineS = stopLineArcOnApproach(rt);
  const startDistM = 60; // metres before the line at t=0
  const dt = 0.1;
  const poses = edgeDrivePath(edge, lineS + startDistM, Math.max(0, lineS - 8), speedMps * dt, LANE_OFFSET);
  // Pin: yellow starts when the driver is flipEtaSec short of the line.
  const bearing = poses[0].headingDeg;
  const flipInSec = startDistM / speedMps - flipEtaSec;
  rt.setSignalClusterOffset(
    JUNCTION,
    rt.signalOffsetForPhaseStart(JUNCTION, bearing, "yellow", flipInSec),
  );
  const { ticks } = drive(rt, poses, { dtSec: dt, speedKmh: speedMps * 3.6 });
  for (const tick of ticks) {
    for (const e of tick.events) {
      if (e.kind === "stopLineCrossed" && e.control === "trafficLight") return e;
    }
  }
  return undefined;
}

describe("zone / legality surface (doc 72 N3)", () => {
  const district = loadDistrict();

  it("district-v1 carries exactly the ten OSM-verified «Зона 30» edges", () => {
    const tagged = district.roads.edges.filter((e) => e.zone !== undefined);
    expect(tagged).toHaveLength(10);
    for (const e of tagged) {
      expect(e.zone).toBe("thirty");
      // The tag is CONTEXT — the enforced limit lives in maxspeed, so the
      // existing SPEEDING_* machinery already grades the zone.
      expect(e.maxspeed).toBe(30);
    }
  });

  it("surfaces zone + oneway on the tick the way maxSpeedKmh flows", () => {
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, "e170139947.0"); // ул. Проф. Борис Боровски, zone thirty
    const mid = edge.length / 2;
    const poses = edgeDrivePath(edge, mid - 10, mid + 10, 2, LANE_OFFSET);
    const { ticks } = drive(rt, poses, { speedKmh: 25 });
    const inZone = ticks.filter((t) => t.zone === "thirty");
    expect(inZone.length).toBeGreaterThan(0);
    for (const t of inZone) {
      expect(t.maxSpeedKmh).toBe(30);
      expect(t.oneway).toBe(edge.oneway);
    }
  });

  it("passes noOvertake / noUTurn through to the tick (surface-only context)", () => {
    // No district edge carries the bans yet (no data support — doc 72 rule:
    // never invent zones); prove the additive schema flows via a clone.
    const clone = JSON.parse(JSON.stringify(district)) as typeof district;
    const edge = clone.roads.edges.find((e) => e.id === APPROACH_EDGE);
    if (!edge) throw new Error("approach edge missing");
    edge.noOvertake = true;
    edge.noUTurn = true;
    const rt = createWorldRuntime(clone);
    const poses = edgeDrivePath(edgeById(clone, APPROACH_EDGE), 150, 160, 2, LANE_OFFSET);
    const { ticks } = drive(rt, poses, { speedKmh: 30 });
    const on = ticks.filter((t) => t.noOvertake === true);
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((t) => t.noUTurn === true)).toBe(true);
  });

  it("untagged edges leave the context fields unset (absent = unknown)", () => {
    const rt = createWorldRuntime(district);
    const poses = edgeDrivePath(edgeById(district, APPROACH_EDGE), 150, 160, 2, LANE_OFFSET);
    const { ticks } = drive(rt, poses, { speedKmh: 30 });
    for (const t of ticks) {
      expect(t.zone).toBeUndefined();
      expect(t.noOvertake).toBeUndefined();
      expect(t.noUTurn).toBeUndefined();
    }
  });
});

describe("next-stop-line tick context (B1a capability 1)", () => {
  it("reports a shrinking distance + control + live lamp state on the approach", () => {
    const district = loadDistrict();
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, APPROACH_EDGE);
    const lineS = stopLineArcOnApproach(rt);
    const poses = edgeDrivePath(edge, lineS + 100, lineS + 10, 2, LANE_OFFSET);
    const { ticks } = drive(rt, poses, { speedKmh: 30 });
    const withLine = ticks.filter((t) => t.nextStopLineM !== undefined);
    expect(withLine.length).toBeGreaterThan(10);
    for (const t of withLine) {
      expect(t.nextStopLineControl).toBe("trafficLight");
      expect(["red", "redYellow", "yellow", "green"]).toContain(t.nextStopLineState);
    }
    // Monotonically approaching the line (constant-speed run toward it).
    const dists = withLine.map((t) => t.nextStopLineM as number);
    expect(dists[dists.length - 1]).toBeLessThan(dists[0]);
  });

  it("reports junction proximity within the context radius", () => {
    const district = loadDistrict();
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, APPROACH_EDGE);
    const poses = edgeDrivePath(edge, 70, 30, 2, LANE_OFFSET);
    const { ticks } = drive(rt, poses, { speedKmh: 30 });
    const last = ticks[ticks.length - 1];
    expect(last.nextJunctionM).toBeDefined();
    expect(last.nextJunctionM as number).toBeLessThan(40);
  });
});

describe("amber `stoppable` adjudication (doc 72 JU-06)", () => {
  it("comfortableStopPossible: physics sanity at the taught margins", () => {
    // 50 km/h, flip 60 m out: reaction 13.9 m + braking 32.2 m (×1.15 ≈ 53) →
    // stoppable; flip 30 m out at 50 → the true dilemma, NOT stoppable.
    expect(comfortableStopPossible(60, 50)).toBe(true);
    expect(comfortableStopPossible(30, 50)).toBe(false);
    // Slow roll: 15 km/h needs ~8 m — 10.4 m is a clear gamble.
    expect(comfortableStopPossible(10.4, 15)).toBe(true);
  });

  it("slow late-yellow roll-through carries stoppable: true (the gamble)", () => {
    const ev = driveThroughPinnedAmber(4.17, 2.5); // 15 km/h, flip 2.5 s out
    expect(ev).toBeDefined();
    expect(ev!.lightState).toBe("yellow");
    expect(ev!.stoppable).toBe(true);
  });

  it("fast dilemma-zone crossing carries stoppable: false (legal clearance)", () => {
    const ev = driveThroughPinnedAmber(8.33, 1.5); // 30 km/h, flip 1.5 s out
    expect(ev).toBeDefined();
    expect(ev!.lightState).toBe("yellow");
    expect(ev!.stoppable).toBe(false);
  });

  it("a green-wave crossing carries no amber verdict at all", () => {
    // Flip far in the future: the driver crosses on green.
    const district = loadDistrict();
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, APPROACH_EDGE);
    const lineS = stopLineArcOnApproach(rt);
    const poses = edgeDrivePath(edge, lineS + 40, Math.max(0, lineS - 8), 0.833, LANE_OFFSET);
    rt.setSignalClusterOffset(
      JUNCTION,
      rt.signalOffsetForPhaseStart(JUNCTION, poses[0].headingDeg, "yellow", 15),
    );
    const { ticks } = drive(rt, poses, { dtSec: 0.1, speedKmh: 30 });
    const crossed: Crossed[] = [];
    for (const t of ticks as SimTick[]) {
      for (const e of t.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") crossed.push(e);
      }
    }
    expect(crossed).toHaveLength(1);
    expect(crossed[0].lightState).toBe("green");
    expect(crossed[0].stoppable).toBeUndefined();
  });
});
