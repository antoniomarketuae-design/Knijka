/**
 * StagedVehicleSpec.oneRun (sc-ln-obstacle-meeting:114706e0) — a road car its
 * lesson COUNTS drives its script once, retires off-scene and never comes back
 * round; every other road car still returns (FR-B5-RETURN unchanged).
 *
 * A CONTROLLED PAIR on a bare straight road-graph-style path: identical actor,
 * identical seconds, the student 200 m along and 20 m off the path (far past
 * guard 1's 70 m, out of the 3 m corridor), so the ONLY difference between the
 * two runs is the flag.
 */
import { describe, expect, it } from "vitest";
import {
  applyStagedCommand,
  buildStagedVehiclePolylinePath,
  createStagedVehicle,
  updateStagedVehicle,
  type StagedEnv,
} from "../staged";
import type { StagedVehicleSpec } from "../types";

const DT = 1 / 30;
const LINE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];
const SPEC: StagedVehicleSpec = {
  kind: "vehicle",
  id: "one-run-probe",
  pathNodes: [],
  hold: { nodeIndex: 0, offsetM: 0 },
  cruiseSpeedMps: 10,
};

function run(over: Partial<StagedVehicleSpec>) {
  const path = buildStagedVehiclePolylinePath(LINE)!;
  const agent = createStagedVehicle({ ...SPEC, ...over }, path, 1000);
  const env: StagedEnv = {
    hasPlayer: true,
    playerX: 200,
    playerY: 20,
    playerSpeedMps: 5,
    crossingCounts: new Map(),
    ambient: [],
  };
  applyStagedCommand(agent, { type: "cruise" }, env);
  let maxX = -Infinity;
  for (let i = 0; i < 60 * 60; i++) {
    updateStagedVehicle(agent, DT, env);
    maxX = Math.max(maxX, agent.state.x);
  }
  return { agent, maxX };
}

describe("StagedVehicleSpec.oneRun — one run, then gone", () => {
  it("the same car WITHOUT the flag comes back round (the control)", () => {
    const { agent } = run({});
    expect(agent.returns).toBeGreaterThan(0);
  });

  it("WITH the flag it finishes, retires 70 m past its path end and stays there for the rest of the minute", () => {
    const { agent, maxX } = run({ oneRun: true });
    expect(agent.returns).toBe(0);
    expect(agent.finished).toBe(true);
    expect(agent.state.x).toBeCloseTo(170, 3);
    expect(maxX).toBeCloseTo(170, 3);
    expect(agent.view.returns).toBe(0);
  });

  it("oneRun: false is the default behaviour, byte for byte", () => {
    const a = run({}).agent;
    const b = run({ oneRun: false }).agent;
    expect(b.returns).toBe(a.returns);
    expect(b.state.x).toBe(a.state.x);
    expect(b.state.y).toBe(a.state.y);
    expect(b.s).toBe(a.s);
  });
});
