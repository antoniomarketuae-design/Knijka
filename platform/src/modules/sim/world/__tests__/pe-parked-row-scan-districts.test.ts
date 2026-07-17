/**
 * sc-pe-parked-row-scan district battery — the REUSED pe-child-v1 map (doc 72
 * PE-04), asserting the invariants THIS scenario adds on top of the shared
 * pe-districts battery (which already pins pe-child-v1's street/zebra/spawn).
 *
 * The new axes (the backlog's „new spans/trigger points only"):
 *   1. THE EAST-CURB DART. The child steps off the RIGHT-side parked row —
 *      start x = +9.73 (mirror of the family's −9.73), inside the map bounds,
 *      westbound INTO the driver's lane. This battery proves the reused map
 *      admits that staged geometry.
 *   2. THE LATE OCCUPANCY WINDOW. roadFromM 4.0 (against the family's 1.6) keeps
 *      the child OFF the driving-surface flag until it clears the parked row:
 *      the battery drives the exact template spans through the traffic system
 *      and asserts pedestrianOnCrossing goes off → on → off, AND that the flag
 *      is still FALSE once the walker has passed the west-edge 1.6 m mark a
 *      whole family-window earlier would have flipped it (the delta that lets
 *      the fast-row demo strike before occupancy).
 *
 * Shape copied from pe-districts.test.ts (the traffic-lane-graph section).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SC_PE_PARKED_ROW_SCAN } from "../../lessons/scenario/templates-pe2";
import { createTrafficSystem } from "../../traffic/system";
import { type TrafficDistrict } from "../../traffic/types";
import { assertDistrict, type District } from "../types";

const DISTRICT_ID = "pe-child-v1";
const X_LANE = 4.06;
const CROSSING_Y = 78;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
}

describe("pe-child-v1 hosts the sc-pe-parked-row-scan reuse", () => {
  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadRaw(DISTRICT_ID));
  });

  it("pins the crossing / limit / spawn the template denormalizes", () => {
    expect(SC_PE_PARKED_ROW_SCAN.map.districtId).toBe(DISTRICT_ID);
    expect(district.crossings.map((c) => c.id)).toEqual(["pe-x-1"]);
    expect(district.crossings[0].x).toBe(0);
    expect(district.crossings[0].y).toBe(CROSSING_Y);
    expect(district.roads.edges[0].maxspeed).toBe(40);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual(["pe-spawn-approach", "pe-spawn-finish"]);
    const approach = district.spawnPoints.find((s) => s.id === "pe-spawn-approach")!;
    expect(approach.x).toBe(X_LANE);
  });

  it("the template's east-curb dart starts inside the map bounds", () => {
    const child = SC_PE_PARKED_ROW_SCAN.staged![0];
    expect(child.kind).toBe("pedestrianDartOut");
    if (child.kind !== "pedestrianDartOut") return;
    expect(child.crossingId).toBe("pe-x-1");
    expect(child.crossing).toEqual({ x: 0, y: CROSSING_Y });
    // Off the RIGHT (east) curb, westbound into the driver's lane.
    expect(child.start.x).toBeGreaterThan(0);
    expect(child.dir).toEqual({ x: -1, y: 0 });
    const b = district.meta.boundsLocalMeters;
    expect(child.start.x).toBeLessThanOrEqual(b.maxX);
    expect(child.start.x - child.travelM).toBeGreaterThanOrEqual(b.minX);
    // The delta that defines the scenario: the LATE occupancy window.
    expect(child.roadFromM).toBe(4.0);
    expect(child.roadToM).toBe(18.0);
  });

  it("the east-curb span drives pedestrianOnCrossing off → on → off (the dart chain)", () => {
    const raw = loadRaw(DISTRICT_ID) as TrafficDistrict;
    const child = SC_PE_PARKED_ROW_SCAN.staged![0];
    if (child.kind !== "pedestrianDartOut") throw new Error("staged[0] must be the dart");
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: X_LANE, y: 15 },
      anchorRadiusM: 400,
    });
    // The exact template geometry: east curb → across the carriageway → walk-out.
    const staged = traffic.stage({
      kind: "pedestrian",
      id: "prs-test-ped",
      path: [
        { x: child.start.x, y: CROSSING_Y },
        { x: child.start.x + child.dir.x * child.travelM, y: CROSSING_Y },
      ],
      speedMps: child.speedMps,
      crossingId: "pe-x-1",
      roadFromM: child.roadFromM,
      roadToM: child.roadToM,
    });
    expect(staged).not.toBeNull();
    expect(traffic.pedestrianOnCrossing("pe-x-1")).toBe(false);

    traffic.stagedCommand("prs-test-ped", { type: "cruise" });
    const onFlags: boolean[] = [];
    const flagAtTravel: Array<{ s: number; on: boolean }> = [];
    for (let i = 0; i < 60 * 16; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      const st = traffic.staged("prs-test-ped");
      if (i % 20 === 0) {
        onFlags.push(traffic.pedestrianOnCrossing("pe-x-1"));
        if (st) flagAtTravel.push({ s: st.s, on: traffic.pedestrianOnCrossing("pe-x-1") });
      }
    }
    // Off at the start, ON while walking the (late) span, off after the walk-out.
    expect(onFlags[0]).toBe(false);
    expect(onFlags).toContain(true);
    expect(onFlags[onFlags.length - 1]).toBe(false);
    expect(traffic.staged("prs-test-ped")!.finished).toBe(true);

    // The roadFromM 4.0 delta: at any sampled point where the walker has entered
    // the carriageway (travel > 1.6, the family's OLD west-edge window) but not
    // yet cleared the parked row (travel < 4.0), the flag is still FALSE — this
    // is why a fast car strikes before occupancy ever flips.
    for (const f of flagAtTravel) {
      if (f.s > 1.6 && f.s < 4.0) expect(f.on).toBe(false);
    }
  });
});
