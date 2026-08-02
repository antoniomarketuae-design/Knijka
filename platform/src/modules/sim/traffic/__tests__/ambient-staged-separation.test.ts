/**
 * AMBIENT ↔ STAGED SEPARATION — doc 87 FR-27's precondition.
 *
 * `staged.ts` shipped with an honest, documented v1 limitation: *"ambient
 * agents do not see staged actors"*. It cost nothing while every scenario
 * lesson compiled to `vehicleCount: 0`. The moment the yielding families carry
 * a real street (SCENARIO_FAMILY_TRAFFIC_BASELINE), it becomes the founder's
 * own complaint at car scale — he watched a pedestrian walk THROUGH a parked
 * car (items 22/23/24) and called it, correctly, unacceptable. A boulevard car
 * sliding through the very car the lesson is about is the same defect, bigger.
 *
 * Measured before the fix, 4 ambient agents on the junction/signals/following
 * districts: five templates put an ambient car and a staged actor within
 * **0.02–0.05 m of centres**. Three of the five were overlapping at t = 0.0 s —
 * a seeding collision no running clamp can undo, because neither body is
 * "advancing into" the other.
 *
 * So there are three guarantees here, and all three are needed:
 *   1. an ambient agent never advances into a staged actor (vehicles.ts),
 *   2. a staged actor never advances into an ambient agent (staged.ts),
 *   3. staging an actor displaces any ambient agent already standing there
 *      (system.ts → separateVehicleFrom).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTrafficSystem } from "../system";
import type { TrafficDistrict, TrafficUpdateContext, TrafficVehicleState } from "../types";
import { VEHICLE_PROFILE_LENGTH_M } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const DT = 1 / 30;
/**
 * No player in this probe: the guarantee under test is ambient ↔ staged, and a
 * player pose would add a THIRD avoidance term and hide which of the two fixes
 * is doing the work. `playerPos` is required (not optional) precisely so a
 * caller has to say "there is nobody driving" out loud rather than forget.
 */
const CTX: TrafficUpdateContext = { signalPhase: () => "green", playerPos: null };
/** Two 4.1 m cars are interpenetrating below this many metres of CENTRES. */
const CLIP_M = VEHICLE_PROFILE_LENGTH_M.car;

function district(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

interface Case {
  districtId: string;
  /** A staged path across the map, in lane-graph node ids. */
  pathNodes: string[];
  anchor: { x: number; y: number };
}

/** The two districts the whole junction/signals family is played on. */
const CASES: Case[] = [
  { districtId: "sx-v1", pathNodes: ["sx-n-w", "sx-n-c", "sx-n-e"], anchor: { x: 4, y: -35 } },
  { districtId: "tj-stop-v1", pathNodes: ["tj-n-w", "tj-n-c", "tj-n-e"], anchor: { x: 4, y: -60 } },
];

function build(c: Case, vehicleCount: number) {
  const tr = createTrafficSystem(district(c.districtId), {
    seed: 7,
    vehicleCount,
    pedestrianCount: 0,
    anchor: c.anchor,
    anchorRadiusM: 400,
  });
  const ambient: TrafficVehicleState[] = tr.vehicles.slice();
  const view = tr.stage({
    kind: "vehicle",
    id: "probe-actor",
    pathNodes: c.pathNodes,
    hold: { nodeIndex: 0, offsetM: 2 },
    cruiseSpeedMps: 11,
  });
  return { tr, ambient, view };
}

describe("FR-27 — an ambient car and a staged actor are never in the same place", () => {
  for (const c of CASES) {
    it(`${c.districtId}: staging an actor never leaves an ambient car inside it`, () => {
      const { ambient, view } = build(c, 4);
      expect(view, "the probe path must resolve on this district").not.toBeNull();
      expect(ambient.length).toBeGreaterThan(0);
      for (const a of ambient) {
        expect(
          Math.hypot(a.x - view!.x, a.y - view!.y),
          `${c.districtId}: ambient car sits inside the staged actor at stage() time`,
        ).toBeGreaterThanOrEqual(CLIP_M);
      }
    });

    it(`${c.districtId}: 60 s of driving never puts two bodies inside each other`, () => {
      const { tr, ambient, view } = build(c, 4);
      expect(view).not.toBeNull();
      tr.stagedCommand("probe-actor", { type: "cruise" });
      let min = Infinity;
      for (let i = 0; i < 60 * 30; i++) {
        tr.update(DT, CTX);
        const s = tr.staged("probe-actor")!;
        for (const a of ambient) {
          const d = Math.hypot(a.x - s.x, a.y - s.y);
          if (d < min) min = d;
        }
      }
      expect(min, `${c.districtId}: closest centres over the minute`).toBeGreaterThanOrEqual(
        CLIP_M,
      );
    });
  }

  it("a zero-ambient lesson is untouched — the staged actor drives its script", () => {
    // The guarantee must cost nothing where there is no ambient traffic, which
    // is still most of the catalog (and every recorded ghost: the trace
    // recorder pins vehicleCount 0 by law).
    const c = CASES[0];
    const withNone = build(c, 0);
    withNone.tr.stagedCommand("probe-actor", { type: "cruise" });
    const poses: number[] = [];
    for (let i = 0; i < 20 * 30; i++) {
      withNone.tr.update(DT, CTX);
      if (i % 60 === 0) poses.push(withNone.tr.staged("probe-actor")!.x);
    }
    // It moved, and it never stalled: an actor alone on the map is unaffected.
    expect(new Set(poses.map((p) => p.toFixed(3))).size).toBeGreaterThan(1);
  });
});
