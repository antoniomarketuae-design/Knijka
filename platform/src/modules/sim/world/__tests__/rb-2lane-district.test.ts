/**
 * TWO-LANE ROUNDABOUT archetype contract battery (Scenario Studio doc 76 §3;
 * the rb-mini-district.test.ts pattern).
 *
 * content/world/rb-2lane-v1.json is the roundabout family's SECOND generated
 * micro-map (tools/maps/gen_rb_2lane.mjs — a TWO-lane CCW ring at R = 26 with
 * 2×2-lane arms, encoded with district-v1's rb-1 conventions: oneway
 * `roundabout: true` ring edges + roundabouts[] registration + uncontrolled
 * degree-3 joints). Doc 72 RB-04 named it as missing world data — „district has
 * single-lane rb-1 only" — so this battery's whole job is to prove the LANES
 * are real to the engine, not just to the JSON:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: Б1 (give way) + Д11
 *                (roundabout) signs at every entry, no stop signs/lights;
 *   2. lanes   — the RUNTIME's locator resolves the ring into two lanes at
 *                r = 30.06 (laneId 0, outer) and r = 21.94 (laneId 1, inner),
 *                and the arms into two lanes per bank at x = 12.19 / 4.06.
 *                sc-rb-lane-choice pins all four numbers BY VALUE;
 *   3. runtime — the roundabout tracker ARMS from roundabouts[]: a barging
 *                entry against a circulating vehicle grades prioritySituation
 *                "roundabout" violated;
 *   4. traffic — the lane graph carries the ring + arms in one SCC, and a
 *                staged loop actor rides the OUTER lane by default while
 *                extraRightOffsetM −8.125 puts one in the INNER lane (the L5
 *                rung's second car).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const RING_NODES = ["rb2-n-s", "rb2-n-e", "rb2-n-n", "rb2-n-w"];
const RING_LOOP = [...RING_NODES, "rb2-n-s"];
/** The ring lane centre radii sc-rb-lane-choice pins by value. */
const LANE_OUTER_R = 30.06;
const LANE_INNER_R = 21.94;
/** The south-arm inbound lane centres the drill's start + gates pin by value. */
const ARM_CURB_X = 12.19;
const ARM_INNER_X = 4.06;
/** One drawn lane at the perceptual road scale (3.25 × 2.5). */
const LANE_W = 8.125;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "rb-2lane-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "rb-2lane-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `rb-2lane-v1.json not found (run: node tools/maps/gen_rb_2lane.mjs) in: ${candidates.join(", ")}`,
  );
}

const sample = (x: number, y: number, headingDeg: number, speedKmh: number): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh,
  indicator: "off",
  headlights: "off",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

/** Ring point at circulation angle φ (deg from the SOUTH node, CCW through
 *  EAST) on a lane radius — the same helper traces/scRbLaneChoice.ts uses. */
const ring = (phiDeg: number, radius: number): [number, number] => {
  const a = (phiDeg * Math.PI) / 180;
  return [radius * Math.sin(a), -radius * Math.cos(a)];
};

describe("rb-2lane-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (rb-1 conventions at TWO lanes)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(8);
    expect(district.roads.edges.length).toBe(8);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts).toHaveLength(1);
    const rb = district.roundabouts[0];
    expect(rb).toMatchObject({ id: "rb2-rb-1", x: 0, y: 0, radius: 26 });
    expect(rb.edgeIds).toHaveLength(4);
    // Every registered ring edge is oneway + roundabout + TWO-lane and the
    // sequence closes CCW (s → e → n → w → s). The `lanes: 2` is THE archetype
    // delta against rb-mini-v1 — the reason this district exists.
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    const seq = rb.edgeIds.map((id) => byId.get(id)!);
    for (let i = 0; i < seq.length; i++) {
      expect(seq[i].oneway, seq[i].id).toBe(true);
      expect(seq[i].roundabout, seq[i].id).toBe(true);
      expect(seq[i].lanes, seq[i].id).toBe(2);
      expect(seq[i].to).toBe(seq[(i + 1) % seq.length].from);
    }
    expect(seq.map((e) => e.from)).toEqual(RING_NODES);
    // The arms carry TWO lanes per direction — without that there is no lane to
    // choose on the approach and the drill has no premise.
    for (const id of ["rb2-e-arm-s", "rb2-e-arm-e", "rb2-e-arm-n", "rb2-e-arm-w"]) {
      const arm = byId.get(id)!;
      expect(arm.oneway, id).toBe(false);
      expect(arm.lanes, id).toBe(4);
      expect(RING_NODES).toContain(arm.to);
    }
    // All four arm↔ring joints are unsignalized degree-3 intersections.
    expect(district.intersections.map((i) => i.id).sort()).toEqual([...RING_NODES].sort());
    for (const ix of district.intersections) {
      expect(ix.signalized).toBe(false);
      expect(ix.degree).toBe(3);
    }
  });

  it("signs every entry: give way (Б1) + roundabout (Д11), zero stop signs/lights", () => {
    expect(world.stats.signs.giveWay).toBeGreaterThanOrEqual(4);
    expect(world.stats.signs.roundabout).toBeGreaterThanOrEqual(4);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("produces no NaN/infinite coordinates in any buffer or placement", () => {
    const buffers = [
      world.roadSurface,
      world.junctionSurface,
      world.sidewalks,
      world.markings,
      world.parkingLanes,
      world.roadDecals,
      world.terrain,
      world.terrainPaved,
      world.buildingRoofs,
      ...world.buildingWalls,
    ];
    let nonFinite = 0;
    for (const mesh of buffers) {
      for (let i = 0; i < mesh.positions.length; i++) {
        if (!Number.isFinite(mesh.positions[i])) nonFinite++;
      }
    }
    for (const list of [world.signs, world.streetlights, world.trees, world.busStops]) {
      for (const t of list) {
        if (!t.position.every(Number.isFinite) || !Number.isFinite(t.yaw)) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });

  it("stays inside the performance budget (micro-map)", () => {
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(district, { seed: 7 });
    expect(again.stats).toEqual(world.stats);
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", "rb-2lane-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "rb-2lane-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "rb-2lane-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

/**
 * THE LANE BATTERY — the reason this district exists, and the invariants
 * sc-rb-lane-choice (templates-roundabout.ts) pins BY VALUE. Every number the
 * drill authors — the shadow's inner-lane radius, the staged car's outer-lane
 * radius, the approach lane centres, the drag radius of mistake 1 — is a
 * consequence of the engine's PROCEDURAL lane model meeting `lanes: 2`. If that
 * model ever changes, the drill silently starts teaching something else. This
 * battery is what makes that impossible.
 */
describe("rb-2lane-v1 — the two ring lanes are real to the runtime", () => {
  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
  });

  it("meta publishes the lane truth the ScenarioSpec copies", () => {
    const sc = district.meta.scenario as unknown as {
      ringLanesPerDirection: number;
      ringLaneRadiiM: number[];
      armLanesPerDirection: number;
      armLaneCentersM: number[];
      exitOrderFromSouth: string[];
    };
    expect(sc.ringLanesPerDirection).toBe(2);
    expect(sc.ringLaneRadiiM).toEqual([LANE_OUTER_R, LANE_INNER_R]); // laneId 0 first
    expect(sc.armLanesPerDirection).toBe(2);
    expect(sc.armLaneCentersM).toEqual([ARM_CURB_X, ARM_INNER_X]);
    // The lanes are exactly one drawn lane apart — the locator's own pitch.
    // (Precision 1: the file rounds to 2 dp, so 30.06 − 21.94 = 8.12 against a
    // true pitch of 8.125.)
    expect(sc.ringLaneRadiiM[0] - sc.ringLaneRadiiM[1]).toBeCloseTo(LANE_W, 1);
    expect(sc.armLaneCentersM[0] - sc.armLaneCentersM[1]).toBeCloseTo(LANE_W, 1);
  });

  it("west IS the third spoke counter-clockwise from the south entry", () => {
    // The drill enters at rb2-n-s and counts mouths: east (1st), north (2nd),
    // west (3rd) — the exit its arrows reserve for the INNER lane. That order is
    // the ring edge sequence, not an assumption.
    const rb = district.roundabouts[0];
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    const seq = rb.edgeIds.map((id) => byId.get(id)!);
    const fromSouth = seq.findIndex((e) => e.from === "rb2-n-s");
    expect(fromSouth).toBeGreaterThanOrEqual(0);
    const order = [0, 1, 2].map((i) => seq[(fromSouth + i) % seq.length].to);
    expect(order).toEqual(["rb2-n-e", "rb2-n-n", "rb2-n-w"]);
    expect((district.meta.scenario as unknown as { exitOrderFromSouth: string[] }).exitOrderFromSouth).toEqual(order);
  });

  it("the LOCATOR resolves r = 21.94 as laneId 1 (inner) and r = 30.06 as laneId 0 (outer)", () => {
    // THE assertion the whole template rests on. A vehicle tracked around the
    // ring on each authored lane radius must resolve to that lane, centred.
    const rt = createWorldRuntime(loadRaw());
    for (const [radius, wantLane] of [
      [LANE_OUTER_R, 0],
      [LANE_INNER_R, 1],
    ] as const) {
      const fresh = createWorldRuntime(loadRaw());
      let t = 0;
      const seen: number[] = [];
      const offsets: number[] = [];
      for (let phi = 5; phi <= 175; phi += 5) {
        const [x, y] = ring(phi, radius);
        t += 0.3;
        fresh.update(0.3);
        const tick = fresh.sample(sample(x, y, (90 - phi + 360) % 360, 12), t, false);
        if (phi < 40) continue; // let the edge lock settle
        seen.push(tick.laneId);
        offsets.push(tick.laneOffsetM);
      }
      for (const l of seen) expect(l, `r=${radius}`).toBe(wantLane);
      // …and CENTRED: |laneOffsetM| well under laneKeepMaxOffsetM (3.25), which
      // is exactly why the shadow riding these radii never grades
      // POOR_LANE_KEEPING.
      for (const o of offsets) expect(Math.abs(o), `r=${radius}`).toBeLessThan(1.5);
    }
    // The ring centerline itself (r = 26) is the LANE LINE — a car there is
    // straddling, and the engine says so. This is the fact mistake 1 is built
    // on (it drags r = 26.3, 3.76 m off the outer lane's centre).
    let t = 0;
    let worst = 0;
    for (let phi = 40; phi <= 175; phi += 5) {
      const [x, y] = ring(phi, 26);
      t += 0.3;
      rt.update(0.3);
      const tick = rt.sample(sample(x, y, (90 - phi + 360) % 360, 12), t, false);
      worst = Math.max(worst, Math.abs(tick.laneOffsetM));
    }
    expect(worst).toBeGreaterThan(3.25); // the straddle band — POOR_LANE_KEEPING's own tolerance
  });

  it("mistake 1's drag radius straddles the line WITHOUT changing lane", () => {
    // r = 26.3 must be past the straddle tolerance (3.25) yet stay laneId 0 —
    // otherwise the demo grades a lane change instead of the wandering line.
    const rt = createWorldRuntime(loadRaw());
    let t = 0;
    const lanes: number[] = [];
    const offs: number[] = [];
    for (let phi = 40; phi <= 185; phi += 5) {
      const [x, y] = ring(phi, phi < 60 ? LANE_OUTER_R : 26.3); // settle in lane 0 first
      t += 0.3;
      rt.update(0.3);
      const tick = rt.sample(sample(x, y, (90 - phi + 360) % 360, 12), t, false);
      if (phi < 90) continue;
      lanes.push(tick.laneId);
      offs.push(Math.abs(tick.laneOffsetM));
    }
    for (const l of lanes) expect(l).toBe(0); // never hands over to the inner lane
    for (const o of offs) expect(o).toBeGreaterThan(3.25); // …and never innocent
  });

  it("the south arm's two inbound lanes sit at x = 12.19 (curb) and x = 4.06 (inner)", () => {
    const rt = createWorldRuntime(loadRaw());
    for (const [x, wantLane] of [
      [ARM_CURB_X, 0],
      [ARM_INNER_X, 1],
    ] as const) {
      const fresh = createWorldRuntime(loadRaw());
      let t = 0;
      for (let y = -95; y <= -50; y += 5) {
        t += 0.3;
        fresh.update(0.3);
        const tick = fresh.sample(sample(x, y, 0, 45), t, false);
        if (y < -85) continue;
        expect(tick.laneId, `x=${x} y=${y}`).toBe(wantLane);
        expect(Math.abs(tick.laneOffsetM), `x=${x} y=${y}`).toBeLessThan(1.5);
      }
    }
    // The drill's lane gate (reachZone r = 3.5 on the inner lane at y = −46) is
    // satisfiable ONLY from that lane: the curb lane is 8.13 m away.
    expect(Math.abs(ARM_CURB_X - ARM_INNER_X)).toBeGreaterThan(3.5 * 2);
    // …and the same for the ring gate at the north mouth (r = 3.5 on the inner
    // lane): mistake 1's outer-lane line misses it by a full lane.
    expect(Math.abs(LANE_OUTER_R - LANE_INNER_R)).toBeGreaterThan(3.5 * 2);
  });

  it("publishes an arrow assignment that TEACHES a choice (authored pedagogy, not a data layer)", () => {
    // district-v1 has no lane-intent zone kind, so nothing in the runtime reads
    // these — the ScenarioSpec teaches from them and gates the lane with a
    // reachZone (the sc-ln-turn-lane-arrows ruling). What the battery CAN prove
    // is that the assignment is coherent: distinct arrows, and exactly one lane
    // painted for the third exit.
    const arrows = (district.meta.scenario as unknown as {
      laneArrows: { lanes: Array<{ laneId: number; centerM: number; arrow: string; exits: number[] }> };
    }).laneArrows;
    expect(arrows.lanes).toHaveLength(2);
    expect(new Set(arrows.lanes.map((l) => l.arrow)).size).toBe(2);
    const third = arrows.lanes.filter((l) => l.exits.includes(3));
    expect(third).toHaveLength(1);
    expect(third[0].laneId).toBe(1); // the INNER lane — the drill's whole premise
    expect(third[0].centerM).toBe(ARM_INNER_X);
    const first = arrows.lanes.filter((l) => l.exits.includes(1));
    expect(first).toHaveLength(1);
    expect(first[0].laneId).toBe(0); // the OUTER/curb lane — mistake 1's choice
  });

  it("resolves the ring 30 / arm 50 limits on BOTH ring lanes, away from the mouths", () => {
    const rt = createWorldRuntime(loadRaw());
    // Probed at φ = 45 (between the south and east spokes) on each lane. NOT at
    // a mouth, and that caveat is a real property of a radial-arm roundabout
    // worth pinning: the outer lane passes exactly OVER each arm's centerline
    // where it meets the ring (e.g. (0, −30.06) lies on the south arm's axis),
    // so the heading-free `speedLimitAt` peek there answers with the ARM's 50.
    // The tracked locator does not have that problem — its heading gate keeps
    // the lock on the ring (proved by the lane battery above, and by the
    // shadow's zero violations) — but a peek is a peek.
    for (const radius of [LANE_INNER_R, LANE_OUTER_R]) {
      const [x, y] = ring(45, radius);
      expect(rt.speedLimitAt({ x, y }), `r=${radius}`).toBe(30);
    }
    expect(rt.speedLimitAt({ x: ARM_INNER_X, y: -80 })).toBe(50); // south arm
    expect(rt.speedLimitAt({ x: -70, y: 12.19 })).toBe(50); // west arm (the exit)
  });

  it("the drill's objective radii bracket the two-lane ring", () => {
    // success[2] roundabout maneuver — enterRadiusM 33 admits the whole band
    // (the outer lane rides 30.06), exitRadiusM 46 sits beyond it, and the
    // drill's last authored point (−72, 12.19) clears it with margin.
    expect(33).toBeGreaterThan(LANE_OUTER_R);
    expect(Math.hypot(-72, 12.19)).toBeGreaterThan(46);
    // …while the ring itself never reaches the exit radius: circulating can
    // never accidentally complete the maneuver.
    for (let phi = 0; phi < 360; phi += 15) {
      expect(Math.hypot(...ring(phi, LANE_OUTER_R))).toBeLessThan(46);
    }
    // The yield line (4.06, −35.5) sits INSIDE the roundabout tracker's reach
    // (radius + ROUNDABOUT_ENTRY_MARGIN_M = 38) — the wall that makes the wait
    // count at all (see the trace script's header).
    expect(Math.hypot(ARM_INNER_X, -35.5)).toBeLessThan(26 + 12);
  });
});

describe("rb-2lane-v1 through the world runtime — circulatingConflict machinery", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives no signals/stop lines; the 4 ring joints stay uncontrolled", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0); // heuristic skips roundabout nodes
    expect(runtime.debugUncontrolledJunctions().map((j) => j.id).sort()).toEqual([...RING_NODES].sort());
  });

  it("a barging entry against circulating traffic grades prioritySituation roundabout/violated", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.setCirculatingQuery(() => true); // a car is always on the ring band
    const events: Array<{ situation: string; violated: boolean }> = [];
    let t = 0;
    // Constant 22 km/h straight at the south mouth — inward, fast, never
    // braking: the conflict is visible from the tracker's 38 m reach.
    for (let y = -70; y <= -20; y += 1) {
      t += 1 / 6.1;
      rt.update(1 / 6.1);
      const tick = rt.sample(sample(ARM_INNER_X, y, 0, 22), t, false);
      for (const e of tick.events) {
        if (e.kind === "prioritySituation") events.push({ situation: e.situation, violated: e.violated });
      }
    }
    const rbEvents = events.filter((e) => e.situation === "roundabout");
    expect(rbEvents.length).toBe(1); // once per approach
    expect(rbEvents[0].violated).toBe(true);
  });
});

describe("rb-2lane-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 4 ring lanes + 8 arm lanes, one SCC", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // The graph models one DRIVEN lane per travel direction (its documented
    // limitation), so a 2-lane oneway ring is still 4 lanes — offset to the
    // rightmost lane. That is exactly why the staged circulator lands in the
    // OUTER lane for free, and why the L5 inner car needs extraRightOffsetM.
    expect(graph.lanes.length).toBe(12);
    expect(graph.loopLanes.size).toBe(12);
    for (const lane of graph.lanes) {
      if (raw.roads.edges.find((e) => e.id === lane.edgeId)?.roundabout) {
        expect(lane.maxspeedKmh).toBeLessThanOrEqual(30);
      }
    }
  });

  it("a staged loop actor rides the OUTER ring lane by default — the template's car", () => {
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    const view = traffic.stage({
      kind: "vehicle",
      id: "rb2-test-outer",
      pathNodes: RING_LOOP,
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 4,
      loop: true,
    });
    expect(view).not.toBeNull();
    traffic.stagedCommand("rb2-test-outer", { type: "cruise" });
    for (let i = 0; i < 60 * 10; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      const v = traffic.staged("rb2-test-outer")!;
      // Glued to the OUTER lane the whole time — sc-rb-lane-choice's staged car
      // authors extraRightOffsetM 0 precisely to get this.
      expect(Math.abs(Math.hypot(v.x, v.y) - LANE_OUTER_R)).toBeLessThan(1.5);
    }
  });

  it("extraRightOffsetM −8.125 puts a staged actor in the INNER ring lane (the L5 car)", () => {
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    const view = traffic.stage({
      kind: "vehicle",
      id: "rb2-test-inner",
      pathNodes: RING_LOOP,
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 4,
      loop: true,
      extraRightOffsetM: -8.125, // one drawn lane LEFT of the graph's default
    });
    expect(view).not.toBeNull();
    traffic.stagedCommand("rb2-test-inner", { type: "cruise" });
    for (let i = 0; i < 60 * 10; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      const v = traffic.staged("rb2-test-inner")!;
      expect(Math.abs(Math.hypot(v.x, v.y) - LANE_INNER_R)).toBeLessThan(1.5);
    }
  });

  it("a circulating actor registers as a conflict for a driver at the south mouth", () => {
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    traffic.stage({
      kind: "vehicle",
      id: "rb2-test-circ",
      pathNodes: RING_LOOP,
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 4,
      loop: true,
    });
    traffic.stagedCommand("rb2-test-circ", { type: "cruise" });
    let sawConflict = false;
    let wrapped = false;
    let maxS = 0;
    for (let i = 0; i < 60 * 60; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      const view = traffic.staged("rb2-test-circ")!;
      if (view.s < maxS - 20) wrapped = true;
      maxS = Math.max(maxS, view.s);
      // Probe from the drill's yield line, northbound — the entering driver's
      // frame. The band is radius + ROUNDABOUT_BAND_EXTRA_M = 35, which must
      // reach the OUTER lane (30.06) or the entry teaches nothing.
      if (traffic.circulatingConflict(0, 0, ARM_INNER_X, -35.5, 0, 35)) sawConflict = true;
    }
    expect(wrapped).toBe(true); // 60 s at 4 m/s > the 187 m outer lap
    expect(sawConflict).toBe(true);
  });
});
