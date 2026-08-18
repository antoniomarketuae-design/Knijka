// Held-scenery contracts (the render-only audit wave): the pinned dressing
// poses stay glued to their single truths — the district meta payloads and
// the trace-harness obstacle rects — and the visual/hittable split follows
// each drill's authored grading channel (see scenarioSceneryProps.ts header).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "@/modules/sim/contracts";
import { computeParkedCars, type TrafficDistrict } from "@/modules/sim/traffic";
import {
  BUS_OBSTACLE,
  PARK_DEPTH_VAN,
  PARK_DEPTH_WALL,
  pkVanObstacle,
} from "@/modules/sim/traces";
import {
  heldSceneryFor,
  parkedClearZonesFor,
  scenarioConesOf,
} from "./scenarioSceneryProps";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

function loadTraceSamples(repoPath: string): Array<{ x: number; y: number }> {
  const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, ...repoPath.split("/")), "utf-8")) as {
    samples: Array<{ x: number; y: number }>;
  };
  return raw.samples;
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
    // `extra` = bodies with no rect twin: pure dressing this table chose (doc
    // 88's crash tableau), which must still be visual-only but is pinned to
    // nothing. The RECT-BACKED poses stay first and stay exact, so a dressing
    // body can never quietly displace one.
    const wrecks: Array<[string, Array<[number, number, number]>, number]> = [
      ["sc-hazard-obstacle@L1", [[5.5, 130, 0]], 0],
      ["sc-ac-wet-braking@L1", [[4.06, 310, 0]], 0],
      ["sc-ac-snow@L1", [[4.06, 310, 0]], 0],
      [
        "sc-hz-accident-scene@L1",
        [
          [7.0, 150, 20],
          [7.2, 162, -15],
        ],
        1, // the broadside car — scenery-held-conflicts.test.ts measures it
      ],
      // scReels.ts accidentMistake(): the parked car hit-and-fled at the
      // authored COLLISION point (~5.7, 148) — bodied at the collision spot.
      ["sc-accident-own-conduct@L1", [[6.4, 149, 0]], 0],
    ];
    for (const [lessonId, poses, extra] of wrecks) {
      const held = heldSceneryFor(lessonId, {});
      expect(held.length, lessonId).toBe(poses.length + extra);
      for (let i = 0; i < held.length; i++) {
        const o = held[i];
        expect(o.kind, lessonId).toBe("vehicle");
        if (o.kind !== "vehicle") continue;
        if (i < poses.length) expect([o.x, o.y, o.headingDeg], lessonId).toEqual(poses[i]);
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

  it("the parking-depth van and wall stand on their recorder twins, and DO collide", () => {
    // Both drills are ABOUT the neighbour, and both grade a geometric contact
    // with it in their own mistake demos — so unlike the wreck dressing above,
    // these bodies carry colliders. Pinned pose-for-pose against the headless
    // rects the committed traces were recorded with.
    const van = heldSceneryFor("sc-park-van@L3", loadDistrict("lot-van-v1"));
    expect(van).toHaveLength(1);
    expect(van[0].kind).toBe("vehicle");
    if (van[0].kind !== "vehicle") return;
    expect([van[0].x, van[0].y, van[0].headingDeg]).toEqual([
      PARK_DEPTH_VAN.x,
      PARK_DEPTH_VAN.y,
      PARK_DEPTH_VAN.headingDeg,
    ]);
    expect(van[0].model).toBe("kargo_v");
    expect(van[0].visual).toBeUndefined(); // hittable — the drill grades it

    const wall = heldSceneryFor("sc-park-wall@L3", loadDistrict("lot-wall-v1"));
    expect(wall).toHaveLength(1);
    expect(wall[0].kind).toBe("wall");
    if (wall[0].kind !== "wall") return;
    expect([wall[0].x, wall[0].y, wall[0].headingDeg]).toEqual([
      PARK_DEPTH_WALL.x,
      PARK_DEPTH_WALL.y,
      PARK_DEPTH_WALL.headingDeg,
    ]);
    // The rendered box and the graded rect are the same object: half-extents
    // either side of the authored length/thickness.
    expect(wall[0].lengthM / 2).toBe(PARK_DEPTH_WALL.halfLengthM);
    expect((wall[0].thicknessM ?? 0.3) / 2).toBe(PARK_DEPTH_WALL.halfWidthM);
  });
});

describe("parkedClearZonesFor — the curb-decoration clear zones (doc 66 R5, v1 №9; re-derived, doc 86 L9/D10)", () => {
  // The three committed sc-junction-stop drives — the mistake the pilot clip
  // replays, the second mistake, and the shadow (BOTH ghost lines per the R0
  // ruling; m1 stops short of the junction but is pinned along for free).
  const JSTOP_TRACES = [
    "content/traces/sc-junction-stop/mistake-rolling-stop.trace.json",
    "content/traces/sc-junction-stop/mistake-past-line.trace.json",
    "content/traces/sc-junction-stop/shadow-correct.trace.json",
  ];
  const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;
  /** Worst-case body half-length of the parked fleet + hero half-width —
   *  the same flank vocabulary the dressing tests above use. */
  const CAR_HALF_LEN = 2.25;
  const HERO_HALF_W = 0.85;

  it("no longer authors a junction zone — the curb pass itself is now чл. 98-legal", () => {
    // Was: a one-entry allowlist, `sc-junction-stop: [{0, 0, 16}]`, put there
    // because edge tj-e-e's first slot landed at (11, −10.125), 15.0 m from
    // tj-n-c, and both committed ghost lines cut the corner through it (0.84 /
    // 0.85 m). computeParkedCars now measures the walk against the junction
    // mouth nodeOpenRadiusM opens plus чл. 98's 5 m, so no template needs the
    // entry and its two silent siblings (sc-junction-scan, sc-junction-gap)
    // are covered by construction.
    expect(parkedClearZonesFor("sc-junction-stop@L1")).toEqual([]);
    expect(parkedClearZonesFor("sc-junction-scan@L1")).toEqual([]);
    expect(parkedClearZonesFor("sc-follow-distance@L2")).toEqual([]);
    expect(parkedClearZonesFor("not-a-scenario-id")).toEqual([]);
  });

  it("derives a walk corridor for every staged pedestrian, from the spec itself", () => {
    // sc-hz-emergency-stop's child walks (9.5, 150) → (−9.5, 150) and the curb
    // pass seated a body at (10.13, 149.60): the walker STARTED inside it
    // (0.00 m clearance, no pathfinding anywhere in staged.ts). The zones are
    // circles covering that authored line — no allowlist, no per-template
    // authoring.
    const zones = parkedClearZonesFor("sc-hz-emergency-stop@L1");
    expect(zones.length).toBeGreaterThan(3);
    for (const z of zones) {
      expect(z.y).toBeCloseTo(150, 6);
      expect(z.x).toBeGreaterThanOrEqual(-9.5 - 1e-6);
      expect(z.x).toBeLessThanOrEqual(9.5 + 1e-6);
      // walker half-shoulder 0.35 + the body half-diagonal hypot(2.25, 0.95).
      expect(z.radiusM).toBeCloseTo(0.35 + Math.hypot(2.25, 0.95), 6);
    }
    // Consecutive circles overlap, so the union has no gap for a body to hide
    // in — the whole point of a corridor rather than two end circles.
    for (let i = 1; i < zones.length; i++) {
      expect(Math.hypot(zones[i].x - zones[i - 1].x, zones[i].y - zones[i - 1].y))
        .toBeLessThanOrEqual(zones[i].radiusM + 1e-6);
    }
    // A template with no walking pedestrian gets nothing.
    expect(parkedClearZonesFor("sc-park-perp-rev@L1")).toEqual([]);
  });

  it("the corner car both sc-junction-stop ghost lines cut through is gone, zone or no zone", () => {
    const district = loadDistrict("tj-stop-v1") as TrafficDistrict;
    const parked = computeParkedCars(district, LANE_W);
    // The offender: edge tj-e-e slot 0 at (11, −10.125), 14.95 m from tj-n-c —
    // inside the 27.125 m junction mouth, i.e. parked in the intersection.
    expect(parked.find((c) => Math.hypot(c.x - 11, c.y + 10.125) < 0.01)).toBeUndefined();
    // Its two neighbours at arc 17.6 and 24.2 are gone with it: the lawful
    // band on that arm starts at 27.125 + 5 + 2.25 = 34.375 m.
    for (const c of parked) {
      expect(Math.hypot(c.x, c.y), `(${c.x.toFixed(2)}, ${c.y.toFixed(2)})`)
        .toBeGreaterThan(27.125);
    }
    // The R0 geometric check, now over every survivor: no committed ghost
    // sample comes within a body's worst-case half-length + the hero's
    // half-width of any body centre.
    for (const tracePath of JSTOP_TRACES) {
      const samples = loadTraceSamples(tracePath);
      for (const c of parked) {
        let nearest = Number.POSITIVE_INFINITY;
        for (const s of samples) {
          const d = Math.hypot(s.x - c.x, s.y - c.y);
          if (d < nearest) nearest = d;
        }
        expect(nearest, `${tracePath} vs parked (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`)
          .toBeGreaterThan(CAR_HALF_LEN + HERO_HALF_W);
      }
    }
  });
});
