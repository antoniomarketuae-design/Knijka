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
 *   2. THE OCCUPANCY WINDOW IS THE CARRIAGEWAY — doc 86 T11, RE-BASELINED.
 *      This battery used to pin `roadFromM 4.0` and to assert that the flag
 *      stayed FALSE while the walker was between arc 1.6 and arc 4.0. That was
 *      the defect, written down as a contract: the kerb stand-back is 9.73 m
 *      and the carriageway half-width 8.125 m, so the child is physically on
 *      the tarmac from arc 1.605 — and 4.0 put the flag 2.4 m late, i.e. only
 *      once the child was 0.8 m off the bumper. A driver who blew the 32 km/h
 *      cap therefore passed an OCCUPIED crossing while `pedestrianOnCrossing`
 *      read false and was billed nothing, while the obedient driver collided.
 *      The window is now the family's real geometry (1.6 / 17.85) and the
 *      battery asserts the flag flips AT the carriageway edge.
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
    // doc 86 T11: the occupancy window is the CARRIAGEWAY, not a grading dial.
    // 9.73 kerb stand-back − 8.125 half-carriageway = 1.605 in, + 8.125 = 17.855 out.
    expect(child.roadFromM).toBeCloseTo(Math.abs(child.start.x) - 8.125, 1);
    expect(child.roadToM).toBeCloseTo(Math.abs(child.start.x) + 8.125, 1);
    expect(child.roadFromM).toBe(1.6);
    expect(child.roadToM).toBe(17.85);
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
    // Off at the start, ON while walking the carriageway, off after the walk-out.
    expect(onFlags[0]).toBe(false);
    expect(onFlags).toContain(true);
    expect(onFlags[onFlags.length - 1]).toBe(false);
    expect(traffic.staged("prs-test-ped")!.finished).toBe(true);

    // doc 86 T11 — the assertion INVERTED. It used to demand `on === false`
    // while the walker was between arc 1.6 and arc 4.0. Every one of those
    // sample points has the child standing on the tarmac inside the driving
    // lane, so the flag must be TRUE: that is the whole difference between a
    // speeding driver being convicted of чл. 119 and being convicted of nothing.
    const insideCarriageway = flagAtTravel.filter((f) => f.s > 1.8 && f.s < 17.6);
    expect(insideCarriageway.length).toBeGreaterThan(4);
    for (const f of insideCarriageway) {
      expect(f.on, `walker at arc ${f.s.toFixed(2)} m is on the carriageway`).toBe(true);
    }
  });
});
