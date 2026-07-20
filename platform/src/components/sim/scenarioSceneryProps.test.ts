// Held-scenery contracts (the render-only audit wave): the pinned dressing
// poses stay glued to their single truths — the district meta payloads and
// the trace-harness obstacle rects — and the visual/hittable split follows
// each drill's authored grading channel (see scenarioSceneryProps.ts header).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUS_OBSTACLE, pkVanObstacle } from "@/modules/sim/traces";
import { heldSceneryFor, scenarioConesOf } from "./scenarioSceneryProps";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

describe("scenarioConesOf — the district meta.scenario.cones seam", () => {
  it("reads every authored hz-roadworks-v1 cone, coordinate-for-coordinate", () => {
    const raw = loadDistrict("hz-roadworks-v1");
    const cones = scenarioConesOf(raw);
    const authored = (
      raw as { meta: { scenario: { cones: Array<{ x: number; y: number }> } } }
    ).meta.scenario.cones;
    expect(cones.length).toBe(10);
    expect(cones.length).toBe(authored.length);
    for (let i = 0; i < cones.length; i++) {
      expect(cones[i]).toEqual({
        kind: "prop",
        prop: "cone",
        x: authored[i].x,
        y: authored[i].y,
        headingDeg: 0,
      });
    }
  });

  it("yields [] defensively for cone-less districts and malformed documents", () => {
    expect(scenarioConesOf(loadDistrict("pe-child-v1"))).toEqual([]);
    expect(scenarioConesOf(loadDistrict("pk-stop-v1"))).toEqual([]);
    expect(scenarioConesOf(null)).toEqual([]);
    expect(scenarioConesOf({})).toEqual([]);
    expect(scenarioConesOf({ meta: { scenario: { cones: [{ x: "no" }] } } })).toEqual([]);
  });
});

describe("heldSceneryFor — per-template dressing", () => {
  it("sc-merge-roadworks-shift gets exactly the district's 10 hittable cones", () => {
    const held = heldSceneryFor("sc-merge-roadworks-shift@L3", loadDistrict("hz-roadworks-v1"));
    expect(held.length).toBe(10);
    for (const o of held) expect(o.kind).toBe("prop");
  });

  it("sc-pk-smooth-stop's van body sits ON the recorder rect (the public twin)", () => {
    const [rect] = pkVanObstacle();
    const held = heldSceneryFor("sc-pk-smooth-stop@L2", loadDistrict("pk-stop-v1"));
    expect(held.length).toBe(1);
    const van = held[0];
    expect(van.kind).toBe("vehicle");
    if (van.kind !== "vehicle") return;
    expect(van.x).toBe(rect.x);
    expect(van.y).toBe(rect.y);
    expect(van.headingDeg).toBe(rect.headingDeg);
    // Visual-only: the drill's consequence channel is the trace rect + the
    // stop-mark zone — a live collider would be a new, unauthored surface.
    expect(van.visual).toBe(true);
  });

  it("every stalled/wreck body is visual-only; the poligon cones are hittable", () => {
    // Pinned BY VALUE from the trace harnesses (hazardObstacleRects /
    // wetVanObstacle / snowVanObstacle / hzAccidentObstacles — not on the
    // public barrel, hence the literal re-pins here).
    const wrecks: Array<[string, Array<[number, number, number]>]> = [
      ["sc-hazard-obstacle@L1", [[5.5, 130, 0]]],
      ["sc-ac-wet-braking@L1", [[4.06, 310, 0]]],
      ["sc-ac-snow@L1", [[4.06, 310, 0]]],
      [
        "sc-hz-accident-scene@L1",
        [
          [7.0, 150, 20],
          [7.2, 162, -15],
        ],
      ],
    ];
    for (const [lessonId, poses] of wrecks) {
      const held = heldSceneryFor(lessonId, {});
      expect(held.length, lessonId).toBe(poses.length);
      for (let i = 0; i < poses.length; i++) {
        const o = held[i];
        expect(o.kind, lessonId).toBe("vehicle");
        if (o.kind !== "vehicle") continue;
        expect([o.x, o.y, o.headingDeg], lessonId).toEqual(poses[i]);
        expect(o.visual, lessonId).toBe(true);
      }
    }
    // The chain's bay-mouth cones (traces/scEdPoligonChain.ts twins): props,
    // colliders included — „Удар в конус" is the drill's own graded mistake.
    const chain = heldSceneryFor("sc-ed-poligon-chain@L1", loadDistrict("poligon-v1"));
    expect(chain).toEqual([
      { kind: "prop", prop: "cone", x: 140, y: -129, headingDeg: 0 },
      { kind: "prop", prop: "cone", x: 146.5, y: -129, headingDeg: 0 },
    ]);
  });

  it("the pe-child parked row is visual dressing that respects the drive's pinned lines", () => {
    const held = heldSceneryFor("sc-pe-parked-row-scan@L3", loadDistrict("pe-child-v1"));
    expect(held.length).toBeGreaterThanOrEqual(10);
    for (const o of held) {
      expect(o.kind).toBe("vehicle");
      if (o.kind !== "vehicle") continue;
      expect(o.visual).toBe(true);
      expect(o.headingDeg).toBe(0); // parallel to the northbound street
      // East-side row: inner flank (widest fleet body ≈ 1.0 half-width) stays
      // east of the mistake-hug ghost's right flank (X_HUG 5.0 + hero 0.85).
      expect(o.x - 1.0).toBeGreaterThan(5.85);
      // …and the outer flank stays inside the east curb (x = 9.73).
      expect(o.x + 1.0).toBeLessThan(9.73);
      // чл. 98 daylight around the zebra (pe-x-1 at y = 78): no body within
      // ~7.5 m of the crossing centre (car half-length 2.25 + 5 m clearance).
      expect(Math.abs(o.y - 78)).toBeGreaterThanOrEqual(7.5);
    }
  });

  it("sc-crossing-bus-shadow's truck occluder sits ON the BUS_OBSTACLE rect (R3 #26)", () => {
    // Founder ruling: the procedural box truck stands in for the bus until a
    // real bus rig exists — same center/heading as the trace-graded rect, so
    // the body the student sees IS the zone the shadow proves it never touches.
    const held = heldSceneryFor("sc-crossing-bus-shadow@L3", loadDistrict("pe-bus-v1"));
    expect(held.length).toBe(1);
    const truck = held[0];
    expect(truck.kind).toBe("vehicle");
    if (truck.kind !== "vehicle") return;
    expect(truck.model).toBe("box_truck");
    expect(truck.x).toBe(BUS_OBSTACLE.x);
    expect(truck.y).toBe(BUS_OBSTACLE.y);
    expect(truck.headingDeg).toBe(BUS_OBSTACLE.headingDeg);
    // Visual-only: the collision consequence stays in the trace channel
    // (BUS_OBSTACLE's SAT test) where the drill authored it.
    expect(truck.visual).toBe(true);
    // The 7.5 m truck body fits INSIDE the graded 12 m rect — the visible
    // occluder never exceeds the no-touch zone the shadow proves.
    expect(BUS_OBSTACLE.halfLengthM * 2).toBeGreaterThanOrEqual(7.5);
    expect(BUS_OBSTACLE.halfWidthM * 2).toBeGreaterThanOrEqual(2.4);
  });

  it("sc-follow-standstill's kolona stands AHEAD of the staged lead, visual-only", () => {
    // Founder R3 #40: the lead (FS_LEAD_CAR, templates-following.ts) holds at
    // (4.0625, 290); the queue bodies continue the column past it. The player
    // and shadow never pass y ≈ 281, so the dressing can never be driven into.
    const held = heldSceneryFor("sc-follow-standstill@L2", loadDistrict("fo-follow-v1"));
    expect(held.length).toBe(2);
    let prevY = 290; // the staged lead's pinned rest
    for (const o of held) {
      expect(o.kind).toBe("vehicle");
      if (o.kind !== "vehicle") continue;
      expect(o.visual).toBe(true);
      expect(o.x).toBe(4.0625); // the lead's own lane center
      expect(o.headingDeg).toBe(0); // queued northbound, like the lead
      // A queue, not a scatter: 4.5–12 m of centers between consecutive cars.
      expect(o.y - prevY).toBeGreaterThanOrEqual(4.5);
      expect(o.y - prevY).toBeLessThanOrEqual(12);
      prevY = o.y;
    }
  });

  it("sc-ov-narrow's both-side rows narrow the corridor without touching a driven line", () => {
    // Founder R3 #49: driven lines (traces/scOvNarrow.ts) span x ∈ [−4.06,
    // 4.06] (flank 4.91); the squeeze corridor y ∈ [105, 150] runs in the
    // west lane and the staged oncoming holds at (−4.06, 200).
    const held = heldSceneryFor("sc-ov-narrow@L1", loadDistrict("ov-narrow-v1"));
    expect(held.length).toBeGreaterThanOrEqual(12);
    const CAR_HALF_LEN = 2.25;
    for (const o of held) {
      expect(o.kind).toBe("vehicle");
      if (o.kind !== "vehicle") continue;
      expect(o.visual).toBe(true); // dressing tier — no collider, no grading
      // Curb-hugging: inner flank at |6.0| clears every driven flank (4.91)
      // by ≥ 1.09 m; outer flank stays inside the carriageway edge (8.125).
      expect(Math.abs(o.x)).toBe(7.0);
      // The west (oncoming) lane through the squeeze section stays undressed —
      // that IS the meeting corridor — and the staged oncoming's hold at
      // y = 200 keeps daylight too.
      if (o.x < 0) {
        expect(o.headingDeg).toBe(180); // parked with the southbound flow
        const clearOfSection = o.y + CAR_HALF_LEN < 105 || o.y - CAR_HALF_LEN > 150;
        expect(clearOfSection, `west body at y=${o.y}`).toBe(true);
        expect(Math.abs(o.y - 200)).toBeGreaterThanOrEqual(4.5);
      } else {
        expect(o.headingDeg).toBe(0);
        // East bodies keep clear of the corner-cut diagonals (y 96..114 and
        // 146..154 reach x = 1..2 only; at x = 7 the only true constraint is
        // the wait pose at (4.06, 104) — flank clearance already proven — so
        // pin the authored bands: south row ends before the section, north
        // row resumes after the return cut.
        const inBands = o.y + CAR_HALF_LEN < 96 || o.y - CAR_HALF_LEN > 158;
        expect(inBands, `east body at y=${o.y}`).toBe(true);
      }
    }
  });

  it("templates without dressing get only the district cones; foreign ids get none", () => {
    expect(heldSceneryFor("sc-ac-rain-lights@L2", loadDistrict("ac-rain-v1"))).toEqual([]);
    expect(heldSceneryFor("sc-ed-reverse-line@L1", loadDistrict("poligon-v1"))).toEqual([]);
    expect(heldSceneryFor("not-a-scenario-id", loadDistrict("hz-roadworks-v1")).length).toBe(10);
    expect(heldSceneryFor("not-a-scenario-id", {})).toEqual([]);
  });
});
