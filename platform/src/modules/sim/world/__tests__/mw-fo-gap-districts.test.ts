/**
 * District battery for sc-fo-motorway-gap (wave 8) — mw-v1 is REUSED, so this
 * asserts only the invariants THIS template newly leans on, on top of the full
 * mw-district.test.ts contract:
 *
 *  - the spawn the template pins (mw-spawn-approach at (0, 15), north);
 *  - the cruise-lane geometry (x = 0, the northbound travel lane);
 *  - THE reuse-critical fact: the staged lead's path [mw-n-nb-start,
 *    mw-n-nb-end] resolves through the lane graph to the EMERGENCY-lane offset
 *    (x = 8.13), so the template's extraRightOffsetM = -8.13 lands the lead in
 *    the CRUISE lane (x = 0) where the player drives. If a future lane-graph
 *    change moved that resolution, the lead would silently drift out of the
 *    player's lead corridor and the whole following drill would stop grading —
 *    this test is the tripwire.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLaneGraph } from "../../traffic/graph";
import { resolveStagedVehiclePath } from "../../traffic/staged";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";

const NB_START = "mw-n-nb-start";
const NB_END = "mw-n-nb-end";
const X_CRUISE = 0;
const X_GRAPH_LANE = 8.13; // the mw-e-nb graph lane sits at the emergency offset
const LEAD_OFFSET_M = -8.13; // the template's extraRightOffsetM (cruise = graph lane − 8.13)

function loadRaw(id: string): TrafficDistrict {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as TrafficDistrict;
  }
  throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
}

describe("mw-v1 — sc-fo-motorway-gap reuse invariants", () => {
  const raw = loadRaw("mw-v1") as unknown as {
    spawnPoints: { id: string; x: number; y: number; heading: number }[];
    meta: { scenario: { laneCruiseX: number; params: Record<string, number> } };
  };

  it("pins the spawn the template starts from", () => {
    const spawn = raw.spawnPoints.find((s) => s.id === "mw-spawn-approach")!;
    expect(spawn, "mw-spawn-approach must exist").toBeDefined();
    expect(spawn.x).toBe(X_CRUISE);
    expect(spawn.y).toBe(15);
    expect(spawn.heading).toBe(0);
  });

  it("pins the cruise-lane center the player + lead share", () => {
    expect(raw.meta.scenario.laneCruiseX).toBe(X_CRUISE);
    expect(raw.meta.scenario.params.lengthM).toBe(1000);
    expect(raw.meta.scenario.params.maxspeedKmh).toBe(140);
  });

  it("the staged lead path resolves to the emergency-lane offset (x = 8.13)", () => {
    const graph = buildLaneGraph(loadRaw("mw-v1"), {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    const pathRaw = resolveStagedVehiclePath(graph, [NB_START, NB_END], 0);
    expect(pathRaw, "the nb node pair must resolve to a lane").not.toBeNull();
    // The graph's single nb lane sits at the emergency offset (the probe truth).
    expect(Math.abs(pathRaw!.px[0] - X_GRAPH_LANE)).toBeLessThan(0.2);
  });

  it("extraRightOffsetM = -8.13 shifts the lead INTO the cruise lane (x ≈ 0)", () => {
    const graph = buildLaneGraph(loadRaw("mw-v1"), {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    const shifted = resolveStagedVehiclePath(graph, [NB_START, NB_END], LEAD_OFFSET_M);
    expect(shifted, "the offset path must resolve").not.toBeNull();
    // Every sample of the shifted lead path sits in the cruise lane (x ≈ 0),
    // inside the 4 m lead corridor the player at x = 0 reads.
    for (let i = 0; i < shifted!.px.length; i++) {
      expect(Math.abs(shifted!.px[i] - X_CRUISE), `sample ${i}`).toBeLessThan(1.0);
    }
  });
});
