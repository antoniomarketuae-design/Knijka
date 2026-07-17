/**
 * ln-v1 contract battery for sc-ln-decisive-change (wave 8, doc 76 §3). The map
 * is REUSED from sc-lane-change (tools/maps/gen_two_lane_road.mjs — one straight
 * 2+2 boulevard, 400 m, 50 km/h), so ln-district.test.ts already proves the
 * FULL engine contract. This battery pins only the invariants THIS template's
 * gap-selection drill depends on and that the trace scripts denormalize by
 * value — if any drifts, the recorded ghosts stop grading their authored codes:
 *
 *   1. the target-lane car's staged offset (extraRightOffsetM = LN_LEFT −
 *      LN_RIGHT) lands on the LEFT lane center x = 4.06 — the lane the passing
 *      car rides and the player merges behind;
 *   2. the world runtime numbers the bank right→left (laneId 0 @ 12.19, 1 @
 *      4.06) with the boundary at x = 8.125 — the frontier the lane-change
 *      adjudicator grades on;
 *   3. the half-merge straddle line x = 7.5 sits in laneId 1 with
 *      |laneOffsetM| past laneKeepMaxOffsetM (3.25) toward the DIVIDER (negative
 *      offset), so it grades POOR_LANE_KEEPING and NOT the center-line touch —
 *      the whole distinction the second mistake demo rests on.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";

/** Pinned from templates-lanes3.ts (the L7 copy truth). */
const LN_RIGHT = 12.19; // laneId 0 — the player's cruise lane
const LN_LEFT = 4.06; // laneId 1 — the target lane
const LN_SPLIT = 8.125; // the drawn lane boundary
const X_HALF = 7.5; // the half-merge straddle line

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "ln-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ln-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`ln-v1.json not found (run: node tools/maps/gen_two_lane_road.mjs)`);
}

const sample = (x: number, y: number): VehicleSample => ({
  position: { x, y },
  headingDeg: 0,
  speedKmh: 34,
  indicator: "off",
  headlights: "off",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

describe("ln-v1 — the target-lane car offset (rearTailgater staging)", () => {
  let raw: TrafficDistrict;
  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("extraRightOffsetM (LN_LEFT − LN_RIGHT) lands the staged car on the LEFT lane center", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: LN_RIGHT, y: 15 },
      anchorRadiusM: 400,
    });
    const staged = traffic.stage({
      kind: "vehicle",
      id: "lndc-test-target",
      pathNodes: ["ln-n-start", "ln-n-end"],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 11,
      extraRightOffsetM: LN_LEFT - LN_RIGHT, // −8.13 — the sc-lndc-target offset
    });
    expect(staged).not.toBeNull();
    expect(Math.abs(traffic.staged("lndc-test-target")!.x - LN_LEFT)).toBeLessThan(0.05);
  });
});

describe("ln-v1 — the laneId frontier + the half-merge straddle line", () => {
  let runtime: DistrictWorldRuntime;
  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
    runtime.update(1 / 60);
  });

  it("numbers the northbound bank right→left with the boundary at x = 8.125", () => {
    const right = runtime.sample(sample(LN_RIGHT, 250), 1, false);
    expect(right.laneId).toBe(0);
    expect(right.laneCount).toBe(2);
    expect(Math.abs(right.laneOffsetM)).toBeLessThan(0.2);

    const left = runtime.sample(sample(LN_LEFT, 260), 2, false);
    expect(left.laneId).toBe(1);
    expect(Math.abs(left.laneOffsetM)).toBeLessThan(0.2);

    // A fresh sample just LEFT of the drawn boundary is laneId 1; just right of
    // it is laneId 0 — the frontier the lane-change adjudicator reads.
    const justLeft = createWorldRuntime(loadRaw());
    justLeft.update(1 / 60);
    expect(justLeft.sample(sample(LN_SPLIT - 0.2, 250), 1, false).laneId).toBe(1);
    const justRight = createWorldRuntime(loadRaw());
    justRight.update(1 / 60);
    expect(justRight.sample(sample(LN_SPLIT + 0.2, 250), 1, false).laneId).toBe(0);
  });

  it("the half-merge line x = 7.5 is laneId 1, off past laneKeepMaxOffsetM toward the DIVIDER", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.update(1 / 60);
    const t = rt.sample(sample(X_HALF, 250), 1, false);
    expect(t.laneId).toBe(1);
    // Negative offset = toward the divider (away from oncoming), so the
    // center-line condition (which needs the offset toward oncoming) can never
    // arm here — the straddle grades POOR_LANE_KEEPING, never CENTER_LINE_TOUCHED.
    expect(t.laneOffsetM).toBeLessThan(0);
    expect(Math.abs(t.laneOffsetM)).toBeGreaterThan(DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM);
    // …and it is NOT the leftmost-lane center-line geometry: the drift is inside
    // laneId 1 (the leftmost) but pointed at the divider, so the specific
    // center-line arm (laneId === laneCount − 1 AND offset toward oncoming) is
    // structurally impossible at this line.
    expect(t.laneId).toBe((t.laneCount ?? 1) - 1); // it IS the leftmost lane…
    expect(t.laneOffsetM).toBeLessThan(0); // …but the offset points the wrong way for center-line
  });
});
