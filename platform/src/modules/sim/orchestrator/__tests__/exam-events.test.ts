/**
 * A13 — the exam's staged events against the REAL district, through the
 * production stack (same harness as events-integration.test.ts).
 *
 * Three of the exam's five encounters reuse the lesson geometry VERBATIM
 * (shared builders in lessons/specs.ts) and are exercised by the L2/L3
 * suites; here we prove the two NEWLY-PLACED ones stage and resolve:
 *  - all five exam events stage dormant on the lane graph (createRunner /
 *    traffic.stage throw on unresolvable paths — a data bug bricks the exam
 *    at session start, so it must fail HERE first);
 *  - ex-braking-lead (re-placed on the opening straight of spawn-4): the
 *    lead car matches, slams at the authored point, and a braking candidate
 *    resolves stoppedInTime with a measured reaction — with NO hazard visual
 *    (triggersHazard false: brake lights are the exam stimulus);
 *  - ex-ped-dart-out (new crossing n11364730203): a non-yielding westbound
 *    approach triggers the dart and the EXISTING detectors grade it.
 */

import { describe, expect, it } from "vitest";
import type { BrakingLeadCarSpec, PedestrianDartOutSpec } from "../../contracts";
import { EXAM_LESSON } from "../../lessons/specs";
import {
  DT,
  loadRawDistrict,
  makeStack,
  offsetRight,
  PolyDriver,
  stepFrame,
  violationCodes,
} from "./helpers";

function examStaged<T>(eventId: string): T {
  const spec = EXAM_LESSON.stagedEvents?.find((e) => e.id === eventId);
  if (!spec) throw new Error(`missing staged event ${eventId} on the exam spec`);
  return spec as T;
}

function edgeGeometry(edgeId: string): Array<[number, number]> {
  const raw = loadRawDistrict();
  const edge = raw.roads.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error(`edge ${edgeId} not in district`);
  return edge.geometry.map((p) => [p[0], p[1]]);
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

describe("exam staged events stage on the real district", () => {
  it("all five events stage dormant without throwing", () => {
    const stack = makeStack([...(EXAM_LESSON.stagedEvents ?? [])]);
    for (const ev of EXAM_LESSON.stagedEvents ?? []) {
      if (ev.kind === "pedestrianDartOut") continue; // pedestrians publish on release
      const view = stack.traffic.staged(ev.id);
      expect(view, `${ev.id}: staged actor missing`).toBeDefined();
    }
    expect(stack.director.snapshot()).toHaveLength(5);
  });
});

describe("ex-braking-lead (opening straight of spawn-4)", () => {
  const spec = examStaged<BrakingLeadCarSpec>("ex-braking-lead");
  // The player's own northbound oneways (single lane → centerline), spawn-4
  // sits at s≈90 of the concatenated polyline.
  const path = () => concat(edgeGeometry("e226063192.0"), edgeGeometry("e897608662.0"));

  it("slams at the staged point and a braking candidate stops in time — no hazard visual", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 90);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      const view = stack.traffic.staged(spec.id)!;
      const pose = driver.poseAt(driver.s);
      const gap = Math.hypot(pose.x - view.x, pose.y - view.y);
      // Reactive candidate: cruise at ~43 km/h; the follow gap holds ~20–24 m
      // while matching, so a gap collapsing under 17 m IS the slam — brake.
      const braking = gap < 17;
      const frame = driver.advance(DT, braking ? 0 : 12);
      frame.brakePedal = braking ? 1 : 0;
      stepFrame(stack, frame);
      // The exam authors no ball visual — the flag must never flip.
      expect(stack.director.hazardActive).toBe(false);
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome).toMatchObject({
      eventId: "ex-braking-lead",
      success: true,
      detail: "stoppedInTime",
    });
    expect(outcome.reactionTimeSec).toBeGreaterThan(0);
    expect(outcome.approachSpeedKmh).toBeGreaterThanOrEqual(spec.minSlamSpeedKmh);
    expect(violationCodes(stack.ruleEvents)).not.toContain("COLLISION");
  });

  it("never rams the candidate from behind while dormant/matching (playerGuard)", () => {
    const stack = makeStack([spec]);
    // Park ON the lead car's lane just ahead of its hold — it must stay put.
    const driver = new PolyDriver(path(), 90);
    const pose = driver.poseAt(90);
    for (let i = 0; i < 5 * 30; i++) {
      stepFrame(stack, { ...pose, speedKmh: 0, brakePedal: 0 });
    }
    expect(stack.outcomes).toHaveLength(0);
    expect(violationCodes(stack.ruleEvents)).not.toContain("COLLISION");
  });
});

describe("ex-ped-dart-out (crossing n11364730203, westbound straight)", () => {
  const spec = examStaged<PedestrianDartOutSpec>("ex-ped-dart-out");
  /** Scaled right-lane offset of the 2-lane two-way street. */
  const LANE_OFFSET = 4.0625;
  // Westbound along the crossing's own edge, extended past the crossing so
  // the encounter can adjudicate after the player clears the zone.
  const path = () =>
    offsetRight(concat(edgeGeometry("e35467616.0"), [[52, -386.5]]), LANE_OFFSET);

  it("a fast, non-yielding approach triggers the dart and the detectors grade it", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 0);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 12.5)); // ~45 km/h, never brakes
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.eventId).toBe("ex-ped-dart-out");
    expect(outcome.success).toBe(false);
    expect(["violation", "collision"]).toContain(outcome.detail);
    const codes = violationCodes(stack.ruleEvents);
    expect(
      codes.some((c) =>
        ["PEDESTRIAN_NOT_YIELDED", "PEDESTRIAN_CROSSING_TOO_FAST", "COLLISION"].includes(c),
      ),
    ).toBe(true);
  });

  it("never fires for a slow crawl (exam arming holds)", () => {
    const stack = makeStack([spec]);
    const driver = new PolyDriver(path(), 0);
    for (let i = 0; i < 90 * 30; i++) {
      stepFrame(stack, driver.advance(DT, 4)); // ~14 km/h, under the trigger
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(0);
  });
});
