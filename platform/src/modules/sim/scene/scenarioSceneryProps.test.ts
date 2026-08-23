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
// Deep import, on purpose: `hzBrakeDontSwerveObstacles` is not on the traces
// barrel (barrel-bundle-weight.test.ts ratchets that surface), and a literal
// re-pin of its numbers here would be a copy that keeps passing after the
// original moves. The lane11-data-truth battery deep-imports traces the same way.
import { hzBrakeDontSwerveObstacles } from "@/modules/sim/traces/scHzBrakeDontSwerve";
import {
  CHASSIS_HALF_EXTENTS,
  COCKPIT_EYE,
  SUSPENSION_REST_LENGTH,
  WHEEL_POSITIONS,
  WHEEL_RADIUS,
} from "@/modules/sim/vehicle/tuning";
import {
  busStopSheltersOf,
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

  it("sc-follow-standstill holds NO dressing — its column is staged actors now", () => {
    // Founder R3 #40 was answered here with two visual-only cars at
    // (4.0625, 298 / 306). Sweep 161 killed that answer twice over: from
    // COCKPIT_EYE (1.20 m) a 1.45 m roof directly behind another 1.45 m roof
    // is occluded at EVERY distance, and templates-following.ts now stages the
    // queue as actors with rooflines (FS_QUEUE_AHEAD — a van at 298, a truck
    // at 307), so the held cars were drawn inside them. See the block comment
    // in scenarioSceneryProps.ts and __tests__/held-vs-staged.test.ts.
    expect(heldSceneryFor("sc-follow-standstill@L2", loadDistrict("fo-follow-v1"))).toEqual([]);
    // …and the table is not simply empty: its neighbours in the same wave keep
    // their bodies, so this assertion cannot pass by gutting HELD_SCENERY.
    expect(
      heldSceneryFor("sc-ov-narrow@L1", loadDistrict("ov-narrow-v1")).length,
    ).toBeGreaterThanOrEqual(12);
    expect(heldSceneryFor("sc-hazard-obstacle@L1", loadDistrict("hz-obstacle-v1")).length).toBe(1);
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

// ═══════════════════════════════════════════════════════════════════════════
// SWEEP 161 REPAIRS — the two objects a briefing named and the world withheld
// ═══════════════════════════════════════════════════════════════════════════

describe("sc-hz-brake-dont-swerve — the препятствие is a body, not a painted ring", () => {
  /**
   * «There is no physical obstacle at the stop mark … represented only by a
   * flat orange ring painted on the tarmac, a cyan light beam and a „Спри тук"
   * floating label. Nothing occupies the lane, so the full-force stop is a stop
   * before an abstraction.»
   *   .audit-frames/wave-c/frames/sc-hz-brake-dont-swerve__pc-right/04-t093s.png
   *
   * The rect is deep-imported, not re-typed: a literal copy of (4.06, 190, 0.8,
   * 1.2) in this file would keep passing after the trace moved the debris.
   */
  const [DEBRIS] = hzBrakeDontSwerveObstacles();
  const held = heldSceneryFor("sc-hz-brake-dont-swerve@L1", loadDistrict("hz-debris-v1"));

  it("stands ON the graded rect, footprint for footprint", () => {
    expect(held).toHaveLength(1);
    const block = held[0];
    expect(block.kind).toBe("wall");
    if (block.kind !== "wall") return;
    expect([block.x, block.y, block.headingDeg]).toEqual([DEBRIS.x, DEBRIS.y, DEBRIS.headingDeg]);
    // The L7 painted-rect-equals-graded-rect law. `wall` colliders are
    // [thicknessM/2, heightM/2, lengthM/2] with length along the heading, so
    // these two equalities ARE „the body the student sees is the rectangle the
    // drill grades" — a nudge to either number breaks them.
    expect(block.lengthM / 2).toBe(DEBRIS.halfLengthM);
    expect((block.thicknessM ?? 0.3) / 2).toBe(DEBRIS.halfWidthM);
  });

  it("is hittable, and grades on the code its own rect already names", () => {
    const block = held[0];
    // `ScenarioWallObstacle` has no `visual` escape hatch — a wall always
    // mounts its cuboid. Asserted so a future `visual` field cannot be switched
    // on here without this test noticing.
    expect(block.kind).toBe("wall");
    expect("visual" in block).toBe(false);
    // ScenarioObstacles mounts wall colliders UNTAGGED, so VehicleRig grades
    // contact as "staticObject" — which is this rect's own `withWhat`. Same
    // code, same rectangle: the authored consequence, reaching the live driver.
    expect(DEBRIS.withWhat).toBe("staticObject");
  });

  it("its height is a load-bearing number, bounded at both ends by the car", () => {
    const block = held[0];
    if (block.kind !== "wall") return;
    const height = block.heightM ?? 1.2;
    // FLOOR — the chassis collider's fully-extended ground clearance. A block
    // lower than this passes UNDER the body box: the wheels would scrub it and
    // the car would straddle „препятствието" it was told to stop for.
    // The chassis origin rides one wheel radius + one fully-extended spring +
    // the attachment drop above the road; the body box hangs half its height
    // below that origin.
    const chassisOriginAboveRoadM =
      WHEEL_RADIUS + SUSPENSION_REST_LENGTH + Math.abs(WHEEL_POSITIONS[0].y);
    const bodyClearanceM = chassisOriginAboveRoadM - CHASSIS_HALF_EXTENTS.y;
    expect(bodyClearanceM).toBeCloseTo(0.37, 6);
    expect(height).toBeGreaterThan(bodyClearanceM);
    // CEILING — the driver's own eye above the road (COCKPIT_EYE is chassis
    // local). The student must SEE the whole object and the road past it: above
    // his eyeline the silhouette stops being fallen load and becomes the
    // stopped VEHICLE of the sibling drill (sc-hazard-obstacle), whose lesson
    // is „ease around", not „stop dead".
    const eyeAboveRoadM = chassisOriginAboveRoadM + COCKPIT_EYE.y;
    expect(height).toBeLessThan(eyeAboveRoadM);
  });

  it("clears the stop objective it must not block, and costs zero decoration", () => {
    const block = held[0];
    if (block.kind !== "wall") return;
    // sc-hzbds-stop is a 4 m zone at (4.06, 184); the hero's nose reaches
    // 184 + CHASSIS_HALF_EXTENTS.z when it rests on the mark.
    const heroNoseY = 184 + CHASSIS_HALF_EXTENTS.z;
    const blockNearY = block.y - block.lengthM / 2;
    expect(blockNearY - heroNoseY).toBeGreaterThan(2);
    // Rule 3 opens a circle here; hz-debris-v1 must lose no kerb for it.
    const raw = loadDistrict("hz-debris-v1") as TrafficDistrict;
    const W = 3.25 * PERCEPTUAL_ROAD_SCALE;
    const zones = parkedClearZonesFor("sc-hz-brake-dont-swerve@L1", raw);
    expect(zones.length).toBeGreaterThan(0); // the rule DID fire
    const before = computeParkedCars(raw, W, []);
    const after = computeParkedCars(raw, W, zones);
    expect(after.map((c) => `${c.x},${c.y}`)).toEqual(before.map((c) => `${c.x},${c.y}`));
  });
});

describe("busStopSheltersOf — the навес a district authors and nothing drew", () => {
  /**
   * sc-pk-busstop-ban (critical): «The world does not contain the landmark the
   * lesson is entirely about … The briefing's навес (shelter) is absent».
   * Its instruction 2 is «Зоната ѝ не започва ПРИ НАВЕСА» and its second
   * mistake card is «Водачът спря ПРЕДИ НАВЕСА» — two sentences about a thing
   * that was not in the world.
   */
  const W = 3.25 * PERCEPTUAL_ROAD_SCALE;
  /** Worst-case parked-decoration half-width (the kit's widest body), m. */
  const PARKED_HALF_W = 0.95;

  const CASES = [
    // district, template, span fromY, span toY, kerb band x, building face x
    ["mg-busstop-v1", "sc-merge-bus-pullout", 130, 176, 18.25, 22.25],
    ["pk-busstop-v1", "sc-pk-busstop-ban", 180, 210, 10.125, 14.13],
  ] as const;

  it.each(CASES)(
    "%s: one panel, at the midpoint of the district's OWN authored span",
    (districtId, templateId, fromY, toY) => {
      const raw = loadDistrict(districtId);
      const scenario = (
        raw as {
          meta: {
            scenario: {
              busBayY?: { fromY: number; toY: number };
              busStopPocketY?: { fromY: number; toY: number };
            };
          };
        }
      ).meta.scenario;
      const authored = scenario.busBayY ?? scenario.busStopPocketY;
      // The span is the district's data, not a number this test invents.
      expect(authored).toEqual({ fromY, toY });

      const shelters = busStopSheltersOf(raw);
      expect(shelters).toHaveLength(1);
      const s = shelters[0];
      expect(s.kind).toBe("wall");
      expect(s.y).toBe((fromY + toY) / 2);
      expect(s.headingDeg).toBe(0); // along the straight street
      // …and it reaches the scene through the ONE composition LessonScene
      // mounts, not only through its own helper.
      expect(heldSceneryFor(`${templateId}@L1`, raw)).toContainEqual(s);
    },
  );

  it.each(CASES)(
    "%s: the panel stands BEHIND the parked band and IN FRONT of the building",
    (districtId, _templateId, _fromY, _toY, kerbX, buildingFaceX) => {
      const [s] = busStopSheltersOf(loadDistrict(districtId));
      const near = s.x - (s.thicknessM ?? 0.3) / 2;
      const far = s.x + (s.thicknessM ?? 0.3) / 2;
      // NEAR side: clear of the outer flank of any car parked on the band, so
      // no decoration body is ever drawn inside the shelter. A setback of 0
      // fails here — the panel would land inside the parked bodies.
      expect(near).toBeGreaterThan(kerbX + PARKED_HALF_W);
      // FAR side: still kerb furniture, not part of the building line. A
      // runaway setback fails here.
      expect(far).toBeLessThan(buildingFaceX);
      // It never reaches the carriageway: the driven edge is the kerb band
      // centre minus PARK_BAND_CENTER_M (2.0).
      expect(near).toBeGreaterThan(kerbX - 2.0);
    },
  );

  it("is tall enough to be seen over the parked band and long enough to read as a навес", () => {
    const [s] = busStopSheltersOf(loadDistrict("pk-busstop-v1"));
    // A parked fleet roofline is 1.45 m (ScenarioObstacles rigTopY's default —
    // the number the sc-follow-standstill removal was argued from). A panel
    // shorter than that is invisible from the road the moment one car parks in
    // front of it, which is the exact defect this shelter exists to end.
    expect(s.heightM ?? 1.2).toBeGreaterThan(1.45);
    // A structure shorter than one civilian car is a POST, not a shelter (the
    // fleet „car" profile is 4.1 m long — HELD_CAR_HALF_DIAG_M's own 2.05).
    expect(s.lengthM).toBeGreaterThanOrEqual(2.05 * 2);
    // …and it still fits inside the span it was derived from.
    expect(s.lengthM).toBeLessThan(210 - 180);
  });

  it("takes NOTHING away: both stop kerbs keep every decoration body they had", () => {
    for (const [districtId, templateId] of CASES) {
      const raw = loadDistrict(districtId) as TrafficDistrict;
      const zones = parkedClearZonesFor(`${templateId}@L1`, raw);
      const shelters = busStopSheltersOf(raw);
      // The same zone list WITHOUT the rule-3 circles the shelter opened.
      const withoutShelter = zones.filter(
        (z) => !shelters.some((s) => s.x === z.x && s.y === z.y),
      );
      expect(withoutShelter.length).toBeLessThan(zones.length); // it DID open some
      const before = computeParkedCars(raw, W, withoutShelter);
      const after = computeParkedCars(raw, W, zones);
      expect(after.map((c) => `${c.x},${c.y}`), districtId).toEqual(
        before.map((c) => `${c.x},${c.y}`),
      );
    }
  });

  it("fires ONLY where a span is authored, and never twice at one stop", () => {
    // sp-creep-v1 authors a real `kind: "busStop"` frontage and props.ts builds
    // the modelled навес there — this derivation must stand down, or that map
    // gets two shelters in one place.
    const creep = loadDistrict("sp-creep-v1");
    expect(
      (creep as { buildings: Array<{ kind?: string }> }).buildings.some(
        (b) => b.kind === "busStop",
      ),
    ).toBe(true);
    expect(busStopSheltersOf(creep)).toEqual([]);
    // …AND THE sp-creep-v1 LINE ABOVE CANNOT CONVICT THE GUARD IT NAMES, which
    // is why the synthetic below exists (adversarial verify 2026-08-23): that
    // map authors no `busBayY`/`busStopPocketY` at all, so deleting the
    // `kind === "busStop"` early return leaves it [] anyway — measured, the
    // mutation stays GREEN on the whole battery. Only a district with BOTH a
    // frontage and a span can tell the guard from the empty span, and no
    // shipped map has both. Hand-built, therefore, and it is the only case in
    // this file that is: it is the one assertion that would otherwise pass
    // while `props.ts`'s modelled навес and this one stood in the same place.
    expect(
      busStopSheltersOf({
        buildings: [{ kind: "busStop", footprint: [[9, 190], [13, 190], [13, 200], [9, 200]] }],
        meta: {
          scenario: {
            archetype: "straight-street",
            lanesPerDirection: 1,
            laneCenterRightM: 4.06,
            busStopPocketY: { fromY: 180, toY: 210 },
          },
        },
      }),
    ).toEqual([]);
    // The districts that name no stop are byte-identical.
    expect(busStopSheltersOf(loadDistrict("hz-obstacle-v1"))).toEqual([]);
    expect(busStopSheltersOf(loadDistrict("pe-child-v1"))).toEqual([]);
    expect(busStopSheltersOf(loadDistrict("poligon-v1"))).toEqual([]);
    // Defensive, like scenarioConesOf: junk in, [] out — never a throw.
    expect(busStopSheltersOf(null)).toEqual([]);
    expect(busStopSheltersOf({})).toEqual([]);
    // No archetype and no laneCenterRightM → no guessed heading, no guessed kerb.
    expect(busStopSheltersOf({ meta: { scenario: { busBayY: { fromY: 1, toY: 2 } } } })).toEqual([]);
    // Straight-street only: a curve needs a heading this function cannot derive.
    expect(
      busStopSheltersOf({
        meta: {
          scenario: {
            archetype: "roundabout",
            lanesPerDirection: 1,
            laneCenterRightM: 4.06,
            busBayY: { fromY: 1, toY: 2 },
          },
        },
      }),
    ).toEqual([]);
  });
});
