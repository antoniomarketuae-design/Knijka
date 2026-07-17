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

// ---------------------------------------------------------------------------
// sc-ed-d2-priority-run (ED-02) — the PRIORITY chain
// ---------------------------------------------------------------------------

/** The priority chain's legs, in travel order: [edgeId, geometry-forward].
 *  Mirrors LEGS in traces/scEdD2PriorityRun.ts. */
const PR_LEGS: ReadonlyArray<readonly [string, boolean]> = [
  ["e171919146.0", true],
  ["e695511390.0", true],
  ["e248750627.1", true],
  ["e677692188.0", true],
  ["e751678613.0", true],
  ["e285878100.0", true],
  ["e673714439.0", true],
  ["e855867078.0", true],
  ["e856821052.0", true],
  ["e23040421.0", true],
  ["e1382335108.0", true],
  ["e1382335109.0", true],
  ["e856821053.0", true],
  ["e856821053.1", true],
];

/** The Б2 node the whole drill hangs on. */
const PR_B2_NODE = "n2945503673";
/** The left turn (oncoming) and the equal junction (car from the right). */
const PR_LEFT_NODE = "n4547529959";
const PR_EQUAL_NODE = "n248572866";
/** The signal the ramp complex forces onto the route. */
const PR_SIGNAL = "n4873770118";
/** Road classes the traffic lane graph refuses to build (traffic/types.ts). */
const LANE_GRAPH_EXCLUDED = new Set(["service"]);

describe("d2-v1 carries the sc-ed-d2-priority-run chain (Яворов → Стоян Михайловски → Златовръх)", () => {
  let district: District;
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    district = assertDistrict(loadD2Raw());
    runtime = createWorldRuntime(loadD2Raw());
  });

  it("every leg exists and CHAINS end-to-end to the segment's finish node", () => {
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    let prevTo: string | null = null;
    for (const [id, fwd] of PR_LEGS) {
      const e = byId.get(id);
      expect(e, `leg ${id} missing from d2-v1`).toBeTruthy();
      const from = fwd ? e!.from : e!.to;
      const to = fwd ? e!.to : e!.from;
      if (prevTo !== null) {
        expect(to === prevTo ? "self-loop" : from, `leg ${id} does not chain`).toBe(prevTo);
      }
      prevTo = to;
    }
    expect(prevTo).toBe("n11868151855");
  });

  it("each leg's lanesPerDir is what the drive line's authored offset assumes", () => {
    // UNLIKE the city run, this route cannot use one uniform offset: it runs
    // 1-, 2- and 3-lane oneway legs and 4/5-lane two-way ones. The trace's
    // per-leg offsets are derived from exactly these numbers (spatial.ts:
    // oneway ? lanes : floor(lanes/2)) — if a re-cut relanes an edge, the
    // ghost quietly drives in the wrong lane. Fail here, by name.
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    const expected: Array<[string, boolean, number]> = [
      ["e171919146.0", true, 1],
      ["e695511390.0", true, 1],
      ["e248750627.1", true, 2],
      ["e677692188.0", true, 3],
      ["e751678613.0", false, 2],
      ["e285878100.0", false, 2],
      ["e673714439.0", false, 2],
      ["e855867078.0", false, 2],
      ["e856821052.0", false, 2],
      ["e23040421.0", false, 1],
      ["e1382335108.0", false, 1],
      ["e1382335109.0", false, 1],
      ["e856821053.0", false, 1],
      ["e856821053.1", false, 1],
    ];
    for (const [id, oneway, lanesPerDir] of expected) {
      const e = byId.get(id)!;
      expect(e.oneway, `${id} oneway`).toBe(oneway);
      const actual = e.oneway ? Math.max(1, e.lanes) : Math.max(1, Math.floor(e.lanes / 2));
      expect(actual, `${id} lanesPerDir`).toBe(lanesPerDir);
    }
  });

  it("the spawn pose sits on the Б2 approach's only lane, facing the line", () => {
    // A 1-lane oneway bank centers on the polyline, so the lane center IS the
    // geometry — which is why the template's spawn offset is 0.
    const hit = runtime.locate({ x: -243.96, y: 154.45 });
    expect(hit.edgeId).toBe("e171919146.0");
    expect(hit.laneId).toBe(0);
    expect(Math.abs(hit.laneOffsetM)).toBeLessThan(1);
  });

  it("the route crosses EXACTLY ONE Б2 stop line, on the approach it claims", () => {
    // The whole drill (both mistakes AND the JU-23 config) is unreachable
    // without a derived stopSign line on THIS edge, travelling THIS way.
    const legIds = new Set(PR_LEGS.map(([id]) => id));
    const mine = runtime.debugStopLines().filter((l) => legIds.has(l.id.split("@")[0]));
    const stopSigns = mine.filter((l) => l.control === "stopSign");
    expect(stopSigns.length).toBe(1);
    const b2 = stopSigns[0];
    expect(b2.id.split("@")[0]).toBe("e171919146.0");
    expect(b2.junctionNodeId).toBe(PR_B2_NODE);
    expect(b2.dirSign).toBe(1); // fires for geometry-forward travel = ours
    expect(b2.sM).toBeCloseTo(42.7, 0);
  });

  it("…and exactly one traffic light, which is why the segment has a signal beat", () => {
    // The ramp complex's ONLY link to Стоян Михайловски runs through
    // n4873770118, so the signal is not an authoring choice. Its natural
    // FNV-1a offset (17 ⇒ ns green over t∈[33,53) of the 50 s cycle) is what
    // the shadow's green pass depends on — no signalOffsets dial anywhere.
    const legIds = new Set(PR_LEGS.map(([id]) => id));
    const mine = runtime.debugStopLines().filter((l) => legIds.has(l.id.split("@")[0]));
    const lights = mine.filter((l) => l.control === "trafficLight");
    expect(lights.length).toBe(1);
    expect(lights[0].junctionNodeId).toBe(PR_SIGNAL);
    expect(lights[0].group).toBe("ns");
    expect(lights[0].dirSign).toBe(1);
    expect(runtime.debugSignalClusters().find((c) => c.id === PR_SIGNAL)!.offsetSec).toBe(17);
  });

  it("the two staged junctions are UNCONTROLLED — чл. 37 governs them, nothing else", () => {
    const uncontrolled = new Set(runtime.debugUncontrolledJunctions().map((j) => j.id));
    expect(uncontrolled.has(PR_LEFT_NODE), `${PR_LEFT_NODE} uncontrolled`).toBe(true);
    expect(uncontrolled.has(PR_EQUAL_NODE), `${PR_EQUAL_NODE} uncontrolled`).toBe(true);
    // …and the Б2 node is NOT (it is guarded by the line above) — the drill
    // needs these to be different kinds of junction, not the same one twice.
    expect(uncontrolled.has(PR_B2_NODE)).toBe(false);
  });

  it("both staged actors' paths are lane-graph-buildable (NO service-class arm)", () => {
    // THE constraint that shaped this route. The traffic lane graph excludes
    // class "service" (traffic/types.ts excludedRoadClasses), so an actor on
    // one can never stage — which is exactly why the otherwise-perfect equal
    // junction n348203930 could not carry the car from the right, and why the
    // chain runs on to n248572866 instead. Pin every arm both actors use.
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    const actorArms = [
      "e20302341.0", // oncoming: пл. Велчова завера run-up
      "e856821051.0", // oncoming: into n4547529959
      "e856821052.0", // oncoming: straight out onto Стоян Михайловски
      "e157686323.0", // right-hand car: Галичица
      "e856821053.0", // right-hand car: out across Златовръх
    ];
    for (const id of actorArms) {
      const e = byId.get(id);
      expect(e, `actor arm ${id} missing`).toBeTruthy();
      expect(LANE_GRAPH_EXCLUDED.has(e!.class), `actor arm ${id} class ${e!.class}`).toBe(false);
    }
    // The counter-example, asserted so the WHY stays true: n348203930's only
    // cross arm IS service — if a re-cut ever reclassifies it, the better
    // (shorter) chain becomes available and this template should be revisited.
    expect(byId.get("e31296967.0")!.class).toBe("service");
  });

  it("the oncoming actor has real road behind its hold (the 33 m arm would not)", () => {
    // e856821051.0 alone is 33 m — far too short to hold a car 110 m back.
    // The spec prepends e20302341.0 for exactly this reason; if a re-cut
    // shortens it, the actor stages inside the junction instead of behind it.
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    const lenOf = (id: string): number => {
      const g = byId.get(id)!.geometry;
      let d = 0;
      for (let i = 1; i < g.length; i++) d += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
      return d;
    };
    expect(lenOf("e856821051.0")).toBeLessThan(40);
    expect(lenOf("e20302341.0") + lenOf("e856821051.0")).toBeGreaterThan(120);
    // The right-hand car's Галичица needs the same room for its −80 m hold.
    expect(lenOf("e157686323.0")).toBeGreaterThan(90);
  });

  it("the segment's four reachZone gates locate onto their legs", () => {
    // The template's success gates are denormalized route points; a gate that
    // drifts off its lane silently makes the drill unpassable.
    const gates: Array<[string, number, number, string]> = [
      ["sc-edpr-b2", -300.35, 79.94, "e695511390.0"],
      ["sc-edpr-signal", -516.35, -128.17, "e285878100.0"],
      ["sc-edpr-leftturn", -671.26, 33.98, "e1382335108.0"],
      ["sc-edpr-finish", -735.77, -214.49, "e856821053.1"],
    ];
    for (const [id, x, y, edgeId] of gates) {
      const hit = runtime.locate({ x, y });
      expect(hit.edgeId, `${id} edge`).toBe(edgeId);
      expect(Math.abs(hit.laneOffsetM), `${id} lane offset`).toBeLessThan(2.5);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-ed-d2-stop-address (ED-03) — the „Спрете на удобно място" block
// ---------------------------------------------------------------------------

/** The block: „Незабравка", ONE leg (mirrors LEGS in traces/scEdD2StopAddress.ts). */
const SA_EDGE = "e76856228.0";
/** The block's only junction — the чл. 98 ban the drill's site choice avoids. */
const SA_JUNCTION = "n1119524707";
/** Its other end: the map cut, where the drill spawns at the curb. */
const SA_CUT_NODE = "n1116876635";

describe("d2-v1 carries the sc-ed-d2-stop-address block (Незабравка)", () => {
  let district: District;
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    district = assertDistrict(loadD2Raw());
    runtime = createWorldRuntime(loadD2Raw());
  });

  it("the leg exists, is Незабравка, and is a 375 m two-way residential block", () => {
    const e = district.roads.edges.find((x) => x.id === SA_EDGE);
    expect(e, `leg ${SA_EDGE} missing from d2-v1`).toBeTruthy();
    expect(e!.name).toBe("Незабравка");
    expect(e!.class).toBe("residential");
    expect(e!.from).toBe(SA_CUT_NODE);
    expect(e!.to).toBe(SA_JUNCTION);
    expect(e!.length).toBeCloseTo(375, 0);
    expect(e!.maxspeed).toBe(50);
    // lanesPerDir 1 (spatial.ts: floor(2/2)) is the drive line's ONE authored
    // premise: the curb-lane center sits half a lane width right of the
    // polyline (CURB_OFF in the trace). It is also what makes LANE_CHANGE_* and
    // NOT_KEEPING_RIGHT structurally impossible on this drill.
    expect(e!.oneway).toBe(false);
    expect(e!.lanes).toBe(2);
    expect(Math.floor(e!.lanes / 2)).toBe(1);
  });

  it("THE BLOCK IS EMPTY — no crossing, no derived stop line, no signal", () => {
    // The drill's whole licence to convict HARSH_BRAKING_NO_CAUSE. Each of these
    // is an entry in that detector's cause ledger (engine.ts): a crossing zone,
    // a stop line within 60 m or a forbidding signal would make the dive demo's
    // slam structurally INNOCENT and its card a lie. Assert them by NAME so a
    // re-cut that adds a zebra to Незабравка fails here, not in a byte diff.
    expect(district.crossings.filter((c) => c.edgeId === SA_EDGE)).toEqual([]);
    expect(runtime.debugStopLines().filter((l) => l.id.split("@")[0] === SA_EDGE)).toEqual([]);
    const junction = district.intersections.find((i) => i.id === SA_JUNCTION);
    expect(junction, `${SA_JUNCTION} is not an intersection`).toBeTruthy();
    expect(junction!.signalized).toBe(false);
    // The cut end hosts no junction at all: exactly one edge meets there, which
    // is why a car can legitimately stand at the curb on the drill's first frame.
    expect(district.intersections.some((i) => i.id === SA_CUT_NODE)).toBe(false);
    expect(
      district.roads.edges.filter((e) => e.from === SA_CUT_NODE || e.to === SA_CUT_NODE).map((e) => e.id),
    ).toEqual([SA_EDGE]);
  });

  it("d2-v1 carries NO ban-zone layer — the drill's HONEST LIMIT, pinned", () => {
    // The backlog wanted ILLEGAL_STOP_IN_BAN_ZONE here. That detector reads
    // tick.noStopZone, which comes ONLY from an authored В27 span in the
    // district's `zones` array (engine.ts: „the zone is AUTHORED data — no
    // heuristic zone inference, ever"). d2-v1 is an OSM cut and
    // build_district_d2.mjs emits no zone pass, so the code is unreachable in
    // Лозенец and the template gate-grades site selection instead. This assert
    // is the tripwire: the day a zone pass DOES land on d2, it fails, and
    // sc-ed-d2-stop-address should be revisited to grade the ban properly.
    const raw = loadD2Raw() as { zones?: unknown; meta: { zonesVersion?: number } };
    expect(raw.zones).toBeUndefined();
    expect(raw.meta.zonesVersion).toBeUndefined();
  });

  it("the block is untouched by the two sibling d2 drills", () => {
    // Three templates now share one district; the backlog's rule is that each
    // owns its own road. If a future re-route ever crosses them, the drills stop
    // being independent lessons and start being the same drive with two cards.
    const cityRun = new Set(LEGS.map(([id]) => id));
    const priority = new Set(PR_LEGS.map(([id]) => id));
    expect(cityRun.has(SA_EDGE)).toBe(false);
    expect(priority.has(SA_EDGE)).toBe(false);
  });

  it("the spawn pose sits in the curb lane of the block, facing down the street", () => {
    // d2's spawn-2 IS on this street, but 187 m in — which would leave no block
    // to search — so the drill authors its own pose (validate.ts: position +
    // headingDeg), the two sibling d2 drills' pattern. Pin that spawn-2 fact
    // too: it is the reason the pose exists.
    const hit = runtime.locate({ x: 343.03, y: -127.56 });
    expect(hit.edgeId).toBe(SA_EDGE);
    expect(hit.laneId).toBe(0); // 0 = outermost/curb lane
    expect(Math.abs(hit.laneOffsetM)).toBeLessThan(1);
    const spawn2 = district.spawnPoints.find((s) => s.id === "spawn-2");
    expect(spawn2, "d2 spawn-2").toBeTruthy();
    expect(spawn2!.edgeId).toBe(SA_EDGE);
  });

  it("the three reachZone gates locate onto the block, curb lane, limit 50", () => {
    // The template's success gates are denormalized route points; a gate that
    // drifts off its lane silently makes the drill unpassable.
    const gates: Array<[string, number, number]> = [
      ["sc-edsa-moveoff", 297.63, -166.78],
      ["sc-edsa-planned-approach", 184.48, -279.35],
      ["sc-edsa-legal-stop", 173.85, -313.6],
    ];
    for (const [id, x, y] of gates) {
      const hit = runtime.locate({ x, y });
      expect(hit.edgeId, `${id} edge`).toBe(SA_EDGE);
      expect(hit.laneId, `${id} lane`).toBe(0);
      expect(Math.abs(hit.laneOffsetM), `${id} lane offset`).toBeLessThan(1.5);
      expect(runtime.speedLimitAt({ x, y }), `${id} limit`).toBe(50);
    }
  });

  it("the chosen stop is REALLY clear of the junction — and the dive is REALLY causeless", () => {
    // Two claims the cards make in Bulgarian, in metres. The stop must sit well
    // outside the чл. 98 junction ban (5 m in law; the drill leaves 100+), and
    // the dive demo's slam must sit outside harshBrakeJunctionClearM (35 m) —
    // otherwise the junction itself would excuse the braking and the mistake
    // would grade nothing at all.
    const j = district.roads.nodes.find((n) => n.id === SA_JUNCTION)!;
    const dist = (p: { x: number; y: number }): number => Math.hypot(p.x - j.x, p.y - j.y);
    expect(dist({ x: 173.85, y: -313.6 })).toBeGreaterThan(100);
    expect(dist({ x: 224.63, y: -235.0 })).toBeGreaterThan(35 * 3);
  });
});
