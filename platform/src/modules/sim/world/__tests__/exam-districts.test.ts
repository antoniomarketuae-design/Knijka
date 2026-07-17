/**
 * EXAM-DRILLS district battery — the topology contract sc-ed-d2-city-run
 * stands on (doc 76 §9 stage 2).
 *
 * d2-district.test.ts already proves d2-v1 satisfies the FULL engine contract
 * (structure, builder, runtime, traffic, an innocent drive). This battery
 * proves the NARROWER thing the exam segment actually depends on and that the
 * general battery cannot know about: that the specific „Лозенец" run the
 * template authors — eight named бул. Драган Цанков edges, two signal
 * clusters, the derived stop lines on THIS pair of approaches, and one
 * mid-block zebra between them — exists in the committed map with the
 * geometry the template's denormalized literals claim.
 *
 * WHY THAT IS WORTH ITS OWN FILE: the template and the trace script carry
 * ~20 pinned numbers (spawn pose, four reachZone gates, the walker's curb
 * point). Every one of them is a silent lie the day someone re-cuts Лозенец
 * from a fresher Overpass snapshot. The trace gate would catch it as a byte
 * diff with no explanation; this battery names WHAT moved.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { assertDistrict, type District } from "../types";

function loadD2Raw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "d2-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "d2-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`d2-v1.json not found (run: node tools/maps/build_district_d2.mjs)`);
}

/** The segment's legs, in travel order: [edgeId, geometry-forward]. Mirrors
 *  LEGS in traces/scEdD2CityRun.ts — the drive line's authored content. */
const LEGS: ReadonlyArray<readonly [string, boolean]> = [
  ["e601140178.0", true],
  ["e29435479.0", true],
  ["e601140177.0", true],
  ["e435203751.0", true],
  ["e435203752.0", false],
  ["e1233248921.0", false],
  ["e171919144.0", true],
  ["e1131622979.0", true],
];

/** The zebra the чл. 119 beat hangs on (template SC_ED_D2_CITY_RUN_PED). */
const ZEBRA_ID = "n331946209";
/** The two signal clusters the segment crosses, by cluster-key node id. */
const CLUSTER_1 = "n1286733599";
const CLUSTER_2 = "n152073034";

describe("d2-v1 carries the sc-ed-d2-city-run exam segment (бул. Драган Цанков)", () => {
  let district: District;
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    district = assertDistrict(loadD2Raw());
    runtime = createWorldRuntime(loadD2Raw());
  });

  it("every leg exists, is бул. Драган Цанков, and CHAINS end-to-end", () => {
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    let prevTo: string | null = null;
    for (const [id, fwd] of LEGS) {
      const e = byId.get(id);
      expect(e, `leg ${id} missing from d2-v1`).toBeTruthy();
      expect(e!.name, `leg ${id} name`).toBe("бул. Драган Цанков");
      const from = fwd ? e!.from : e!.to;
      const to = fwd ? e!.to : e!.from;
      if (prevTo !== null) {
        // The route is only drivable if each leg starts where the last ended.
        expect(to === prevTo ? "self-loop" : from, `leg ${id} does not chain`).toBe(prevTo);
      }
      prevTo = to;
    }
    // …and ends at the boulevard's NW node (the segment's finish gate).
    expect(prevTo).toBe("n2038686042");
  });

  it("every leg is a TWO-WAY 4/5-lane carriageway — the single-offset premise", () => {
    // The drive line is built as ONE centerline chain offset once, which is
    // only legitimate because lanesPerDir is 2 for every leg (spatial.ts:
    // oneway ? lanes : floor(lanes/2)). A oneway leg, or a 2- or 6-lane one,
    // would silently put the ghost in the wrong lane.
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    for (const [id] of LEGS) {
      const e = byId.get(id)!;
      expect(e.oneway, `leg ${id} oneway`).toBe(false);
      expect([4, 5], `leg ${id} lanes`).toContain(e.lanes);
      expect(Math.floor(e.lanes / 2), `leg ${id} lanesPerDir`).toBe(2);
      expect(e.maxspeed, `leg ${id} limit`).toBe(50);
    }
  });

  it("the spawn pose sits in the curb lane of the segment's first leg", () => {
    // The template spawns at an explicit pose (d2's 5 spawnPoints are all on
    // quiet streets, none on this arterial) — so the pose IS map-dependent
    // data and must locate onto the right edge, curb lane, right way round.
    const hit = runtime.locate({ x: 795.08, y: -359.73 });
    expect(hit.edgeId).toBe("e601140178.0");
    expect(hit.laneId).toBe(0); // 0 = outermost/curb lane
    expect(Math.abs(hit.laneOffsetM)).toBeLessThan(1);
  });

  it("crosses TWO distinct signal clusters, each with a derived stop line on THIS approach", () => {
    const clusters = runtime.debugSignalClusters();
    const c1 = clusters.find((c) => c.id === CLUSTER_1);
    const c2 = clusters.find((c) => c.id === CLUSTER_2);
    expect(c1, `cluster ${CLUSTER_1}`).toBeTruthy();
    expect(c2, `cluster ${CLUSTER_2}`).toBeTruthy();
    expect(c1!.id).not.toBe(c2!.id);

    // The whole drill is only gradeable because the runtime DERIVES a stop
    // line on the two approaches the segment actually uses. Most d2
    // approaches have none (19 lines for 9 signalized junctions) — picking a
    // lineless approach would make RED_LIGHT_CROSSED structurally unreachable
    // and the „преминаване на червено" demo unauthorable.
    const lines = runtime.debugStopLines();
    const legIds = new Set(LEGS.map(([id]) => id));
    const mine = lines.filter((l) => legIds.has(l.id.split("@")[0]));
    const byEdge = new Map(mine.map((l) => [l.id.split("@")[0], l]));

    const l1 = byEdge.get("e601140178.0");
    expect(l1, "no stop line on the cluster-1 approach e601140178.0").toBeTruthy();
    expect(l1!.control).toBe("trafficLight");
    expect(l1!.junctionNodeId).toBe("n152073029"); // a CLUSTER_1 member
    expect(l1!.group).toBe("ns");
    expect(l1!.dirSign).toBe(1); // fires for geometry-forward travel = ours
    expect(l1!.sM).toBeCloseTo(36.6, 0);

    const l2 = byEdge.get("e435203751.0");
    expect(l2, "no stop line on the cluster-2 approach e435203751.0").toBeTruthy();
    expect(l2!.control).toBe("trafficLight");
    expect(l2!.junctionNodeId).toBe("n152073034");
    expect(l2!.group).toBe("ew");
    expect(l2!.dirSign).toBe(1);
    expect(l2!.sM).toBeCloseTo(83.3, 0);
  });

  it("the two clusters' NATURAL offsets are what make the segment's story true", () => {
    // No signalOffsets dial is used anywhere: the shadow meets cluster 1 GREEN
    // and cluster 2 RED because Лозенец's own FNV-1a offsets say so. If a
    // re-cut changes a cluster id (and thus its hashed offset), the drill's
    // whole premise moves — fail here, loudly, rather than in a byte diff.
    const clusters = runtime.debugSignalClusters();
    expect(clusters.find((c) => c.id === CLUSTER_1)!.offsetSec).toBe(0);
    expect(clusters.find((c) => c.id === CLUSTER_2)!.offsetSec).toBe(40);
  });

  it("the zebra is a MARKED, UNSIGNALIZED, MID-BLOCK crossing on the last leg", () => {
    const z = district.crossings.find((c) => c.id === ZEBRA_ID);
    expect(z, `crossing ${ZEBRA_ID}`).toBeTruthy();
    expect(z!.kind).toBe("marked");
    // Unsignalized is the teach goal: no lamp protects her, чл. 119 alone does.
    expect(z!.signalized).toBe(false);
    expect(z!.edgeId).toBe("e1131622979.0");
    expect(z!.x).toBeCloseTo(138.3, 2);
    expect(z!.y).toBeCloseTo(205.78, 2);
    // MID-BLOCK: the node hosts no junction, so no right-hand-rule or signal
    // adjudication can fire here and contaminate the pedestrian-only sheet.
    expect(district.intersections.some((i) => i.id === ZEBRA_ID)).toBe(false);
    // Exactly two edges meet — the boulevard passing through (degree 2).
    const inc = district.roads.edges.filter((e) => e.from === ZEBRA_ID || e.to === ZEBRA_ID);
    expect(inc.map((e) => e.id).sort()).toEqual(["e1131622979.0", "e171919144.0"]);
  });

  it("the staged walker's curb point is off the carriageway, on the player's LEFT", () => {
    // SC_ED_D2_CITY_RUN_PED.start is a denormalized literal; this is the check
    // that it is not simply a number someone liked. Carriageway half-width =
    // lanesPerDir(2) × LANE_WIDTH_M, and she must stand 1.6 m clear of it
    // (roadFromM) so her first 1.6 m of walk is verge, not road.
    const W = 3.25 * PERCEPTUAL_ROAD_SCALE;
    const halfWidth = 2 * W; // 16.25 m
    const start = { x: 125.08, y: 193.79 };
    const zebra = { x: 138.3, y: 205.78 };
    const d = Math.hypot(start.x - zebra.x, start.y - zebra.y);
    expect(d).toBeCloseTo(halfWidth + 1.6, 1);

    // She walks along the road's normal, toward the player's side. Travel
    // heading at the zebra ≈ 317.8° ⇒ right-of-travel normal ≈ 47.8°.
    const dir = { x: 0.7408, y: 0.6717 };
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 3);
    // start + d·dir lands back on the crossing point (she walks THROUGH it).
    expect(start.x + d * dir.x).toBeCloseTo(zebra.x, 1);
    expect(start.y + d * dir.y).toBeCloseTo(zebra.y, 1);
  });

  it("the segment's four reachZone gates locate onto their legs, curb lane", () => {
    // The template's success gates are denormalized route points; a gate that
    // drifts off its lane silently makes the drill unpassable.
    const gates: Array<[string, number, number, string]> = [
      ["sc-edcr-signal-1", 722.14, -265.02, "e29435479.0"],
      ["sc-edcr-signal-2", 481.38, -123.71, "e435203752.0"],
      ["sc-edcr-keep-right", 264.99, 82.11, "e171919144.0"],
      ["sc-edcr-finish", 87.3, 278.69, "e1131622979.0"],
    ];
    for (const [id, x, y, edgeId] of gates) {
      const hit = runtime.locate({ x, y });
      expect(hit.edgeId, `${id} edge`).toBe(edgeId);
      expect(hit.laneId, `${id} lane`).toBe(0);
      expect(Math.abs(hit.laneOffsetM), `${id} lane offset`).toBeLessThan(1.5);
      expect(runtime.speedLimitAt({ x, y }), `${id} limit`).toBe(50);
    }
  });
});
