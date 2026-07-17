/**
 * mv-uturn-v1 contract battery (the ov-solid2-districts.test.ts pattern) — the
 * U-TURN BAN boulevard behind sc-mv-uturn-ban (OV-17 × PK-12; ЗДвП чл. 38,
 * Наредба № 2/2001 М1, знак В23).
 *
 * wb-boulevard-v1 (shipped) is 200 m of empty boulevard with nothing on it, so
 * every metre of it is a legal place to turn and its drill is pure vehicle
 * control. This map's whole claim is that the same maneuver has a WHERE and a
 * WHEN, and both are readable off the road. The battery proves the file earns it:
 *  - the М1 seam surfaces on the tick exactly across its arclength — and, the
 *    load-bearing half, the DASHED road at the gap provably does NOT flag,
 *    because a solid flag at y = 264 would turn the shadow's LAWFUL turn into
 *    the very violation the first mistake demo exists to grade;
 *  - the ban is 150 m of patience away from the gap, and the gap is a REAL
 *    junction — which is not decoration but the arming condition of the only
 *    adjudicator that can grade a U-turn against oncoming traffic (JU-10);
 *  - the derived CONTROL: a Б2 on the stem (so the node is guarded, so the
 *    right-hand-rule tracker can never bill a phantom FAILED_TO_YIELD beside the
 *    чл. 38 one), and no signal anywhere;
 *  - the JU-10 GAP ARITHMETIC, pinned: a node-centred gap measurement carries a
 *    permanent lateral term, so an oncoming car in the CURB lane can never reach
 *    the 2 s convict bar on a 2+2. That single fact decides where the template's
 *    stream must be staged, and it is asserted here rather than trusted.
 *
 * PINNED GAP — the ban nobody paints. The markings builder renders no solid
 * осева along an М1 span, and the world's sign pass has no В23 SignKind: the
 * whole ban is invisible today. That is RENDER-only (grading reads authored
 * spans, never paint), and it is pinned below rather than left as a comment so
 * the day the builder learns М1 or В23, this test fails loudly and tells its
 * author what to check.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { resolveStagedVehiclePath } from "../../traffic/staged";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "mv-uturn-v1";
/** Lane-bank centres of the 2+2 boulevard (PERCEPTUAL_ROAD_SCALE). */
const LANE_OUT = 12.19;
const LANE_IN = 4.06;
/** Authored geometry — mirrored in meta.scenario (asserted below). */
const SPAWN_Y = 15;
const BAN_FROM_Y = 40;
const BAN_TO_Y = 220;
const TEMPTING_Y = 130;
const GAP_Y = 280;
const LENGTH_M = 620;
/** runtime/turns.ts JUNCTION_AREA_RADIUS_M — the JU-10 tracker's reach. */
const JUNCTION_AREA_M = 40;
/** worldRuntime LEFT_TURN_CONVICT_GAP_SEC — the опасна bar this map must clear. */
const CONVICT_GAP_SEC = 2.0;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_mv_uturn.mjs) in: ${candidates.join(", ")}`);
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

describe(`${ID} through the world builder`, () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw(ID));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document: one 2+2 boulevard, one stem, ONE М1 span", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.meta.zonesVersion).toBe(1);
    expect(district.roads.nodes.length).toBe(4);
    expect(district.roads.edges.length).toBe(3);
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    for (const id of ["mvu-e-ban", "mvu-e-beyond"]) {
      const e = byId.get(id)!;
      // The single-arc premise (a 32.5 m carriageway) AND the CROSSED_SOLID_LINE
      // channel's own arming law: a two-way edge with marked banks. A one-way or
      // a narrow road would hand the excursion to a different adjudicator and
      // this map would grade nothing it claims to.
      expect(e.lanes, id).toBe(4);
      expect(e.oneway, id).toBe(false);
      expect(e.maxspeed, id).toBe(50);
      expect(e.class, id).toBe("primary");
    }
    expect(byId.get("mvu-e-ban")!.length).toBe(GAP_Y);
    expect(byId.get("mvu-e-beyond")!.length).toBe(LENGTH_M - GAP_Y);
    expect(byId.get("mvu-e-cross")!.class).toBe("residential");
    expect(byId.get("mvu-e-cross")!.lanes).toBe(2);

    expect(district.zones).toHaveLength(1);
    const [solid] = district.zones!;
    expect(solid.id).toBe("mvu-z-solidcenterline");
    expect(solid.kind).toBe("solidCenterLine");
    expect(solid.signRef).toBe("М1");
    expect(solid.edgeId).toBe("mvu-e-ban");
    // The ban edge starts at the origin on x = 0, so arclength EQUALS district y.
    expect(solid.fromM).toBe(BAN_FROM_Y);
    expect(solid.toM).toBe(BAN_TO_Y);
  });

  it("THE MAP'S REASON TO EXIST: the ban is a stretch, and the lawful gap costs 150 m of patience", () => {
    const s = district.meta.scenario as {
      temptingSpotY: number;
      legalGapY: number;
      gapReachM: number;
      dashedRunInY: { fromY: number; toY: number; lengthM: number; markingRef: string };
    };
    // The tempting spot is INSIDE the ban — that IS the drill. A driver who
    // turns there is convicted; the same arc 150 m on is the shadow.
    expect(s.temptingSpotY).toBe(TEMPTING_Y);
    expect(s.temptingSpotY).toBeGreaterThan(BAN_FROM_Y);
    expect(s.temptingSpotY).toBeLessThan(BAN_TO_Y);
    expect(s.legalGapY).toBe(GAP_Y);
    expect(s.gapReachM).toBe(GAP_Y - TEMPTING_Y);
    expect(s.gapReachM).toBe(150);
    // …and the marking that says the ban is over runs INTO the gap with no
    // unmarked metre between: „прекъсната = вече може" has to be readable.
    expect(s.dashedRunInY.fromY).toBe(BAN_TO_Y);
    expect(s.dashedRunInY.toY).toBe(GAP_Y);
    expect(s.dashedRunInY.markingRef).toBe("М2");
    // The ban is long enough to be a decision, not a plate flashing past: 180 m
    // is ~13 s at the posted 50.
    expect(BAN_TO_Y - BAN_FROM_Y).toBe(180);
  });

  it("the legal gap is a REAL junction — the JU-10 tracker's arming condition, as data", () => {
    // Not decoration. The only adjudicator that grades „обръщане срещу
    // насрещните" is the left-turn-across-path tracker, and it arms EXCLUSIVELY
    // when nearestIx !== null (worldRuntime). Off a junction the same act falls
    // to the overtake corridor, which bills OVERTAKE_INSUFFICIENT_GAP — чл. 42's
    // head-on gamble, a different law and a different lesson from чл. 38.
    expect(district.intersections).toHaveLength(1);
    const [ix] = district.intersections;
    expect(ix.id).toBe("mvu-n-gap");
    expect(ix.x).toBe(0);
    expect(ix.y).toBe(GAP_Y);
    expect(ix.degree).toBe(3);
    expect(ix.signalized).toBe(false);
    // …and the SAME node disarms the corridor at the gap (ocArmed's nearestIx
    // exemption): one act, one code, by construction.
    expect(district.crossings).toHaveLength(0);
    expect(district.roundabouts).toHaveLength(0);
    expect(world.trafficLights.length).toBe(0);
  });

  it("the М1 span clears the junction area — the banned marking and the lawful turn never overlap", () => {
    // The junction area reaches JUNCTION_AREA_M back from the node. An М1 span
    // running into it would put the ban and the permission on the same metres,
    // and the template's whole claim („плътна = НЕ, прекъсната = ДА") would stop
    // being readable off the map.
    expect(GAP_Y - JUNCTION_AREA_M).toBeGreaterThan(BAN_TO_Y);
    // The turn box lives INSIDE the junction area, or the shadow's own turn
    // would never be adjudicated at all.
    const corridor = (district.meta.scenario as { uturnCorridor: { x: number; y: number; halfWidthM: number; halfLengthM: number } })
      .uturnCorridor;
    expect(corridor).toEqual({ x: 0, y: GAP_Y, halfWidthM: 15, halfLengthM: 20 });
    expect(corridor.halfLengthM).toBeLessThan(JUNCTION_AREA_M);
  });

  it("meta.scenario mirrors the committed geometry (the ScenarioSpec's single truth)", () => {
    const s = district.meta.scenario as {
      archetype: string;
      lanesPerDirection: number;
      laneCenterOuterM: number;
      laneCenterInnerM: number;
      junctionNodeId: string;
      expectedControl: string;
      params: { lengthM: number; maxspeedKmh: number; lanes: number; banFromM: number; banToM: number; gapY: number };
      banZone: { id: string; kind: string; signRef: string; fromM: number; toM: number };
      uturnBanSign: {
        signRef: string;
        nameBg: string;
        lawRef: string;
        atY: number;
        spanY: { fromY: number; toY: number };
        graded: boolean;
      };
    };
    expect(s.archetype).toBe("straight-street");
    expect(s.lanesPerDirection).toBe(2);
    expect(s.laneCenterOuterM).toBe(LANE_OUT);
    expect(s.laneCenterInnerM).toBe(LANE_IN);
    expect(s.junctionNodeId).toBe("mvu-n-gap");
    expect(s.params).toEqual({
      lengthM: LENGTH_M,
      maxspeedKmh: 50,
      lanes: 4,
      banFromM: BAN_FROM_Y,
      banToM: BAN_TO_Y,
      temptingY: TEMPTING_Y,
      gapY: GAP_Y,
    });
    expect(s.banZone.fromM).toBe(BAN_FROM_Y);
    expect(s.banZone.toM).toBe(BAN_TO_Y);
    // The В23 posting — the sign the whole template is NAMED after, and the
    // honest `graded: false` that says no detector reads it. No ZoneKind carries
    // a U-turn ban and the `noUTurn` tick channel is EDGE-scoped while this ban
    // is SPAN-scoped, so tagging the edge would declare the ban true across the
    // 60 m of dashed run-in where the lesson is that it has ENDED. The GRADED
    // wall is what the law actually makes it: the М1 you cannot cross.
    expect(s.uturnBanSign.signRef).toBe("В23");
    expect(s.uturnBanSign.nameBg).toBe("Забранено е завиването в обратна посока");
    expect(s.uturnBanSign.lawRef).toMatch(/^Наредба № РД-02-21-1\/23\.11\.2023/);
    expect(s.uturnBanSign.atY).toBe(BAN_FROM_Y);
    expect(s.uturnBanSign.spanY).toEqual({ fromY: BAN_FROM_Y, toY: BAN_TO_Y });
    expect(s.uturnBanSign.graded).toBe(false);
    for (const e of district.roads.edges) {
      expect((e as { noUTurn?: boolean }).noUTurn, `${e.id} must not carry the edge-scoped noUTurn tag`).toBeUndefined();
    }
  });

  it("the spawns land where the drill needs them (start + temptation on the ban, the gap on dashes)", () => {
    const zoneAt = (y: number) => district.zones!.find((z) => y >= z.fromM && y <= z.toM);
    const at = (id: string) => district.spawnPoints.find((s) => s.id === id)!;
    expect(at("mvu-spawn-start").y).toBe(SPAWN_Y);
    expect(at("mvu-spawn-start").x).toBe(LANE_OUT);
    // The spawn is BEFORE the ban: the driver READS the marking arriving, he is
    // not born under it.
    expect(zoneAt(SPAWN_Y)).toBeUndefined();
    // The temptation, as a coordinate — banned, and it looks fine.
    expect(at("mvu-spawn-tempting").y).toBe(TEMPTING_Y);
    expect(zoneAt(TEMPTING_Y)).toBeDefined();
    // The lawful place, in the INNER lane: обръщането се започва от лентата до
    // осевата. Turning HERE is legal — that is the point.
    const gap = at("mvu-spawn-gap");
    expect(gap.x).toBe(LANE_IN);
    expect(gap.y).toBe(GAP_Y - 18);
    expect(zoneAt(gap.y)).toBeUndefined();
    const finish = at("mvu-spawn-finish");
    expect(finish.x).toBe(-LANE_OUT);
    expect(finish.heading).toBe(180);
    expect(zoneAt(finish.y)).toBeUndefined();
  });

  it("PINNED RENDER GAP: no М1 paint, no В23 post — the ban is graded, not drawn", () => {
    // Honest scope (the gen_ov_solid2 precedent): the markings builder paints no
    // solid осева along an М1 span and the sign pass has no В23 SignKind, so
    // this map's entire ban is invisible in the scene today. Grading reads the
    // authored span and is exact regardless; the template copy carries the
    // teaching. When either builder learns this vocabulary, THIS test fails and
    // its author gets told to re-check the template's „знакът В23" copy.
    const banSigns = world.signs.filter((s) => String(s.kind).toLowerCase().includes("uturn"));
    expect(banSigns).toHaveLength(0);
    // The stem's derived Б2 IS placed (props.ts maxRank >= 5 → kind "stop") —
    // graded control and visuals agree there, which is the contrast that makes
    // the М1's absence a gap rather than a policy.
    expect(world.signs.some((s) => s.kind === "stop")).toBe(true);
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

  it("stays trivially inside the performance budget (micro-map)", () => {
    expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(district, { seed: 7 });
    expect(again.stats).toEqual(world.stats);
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", `${ID}.json`),
      path.resolve(process.cwd(), "..", "content", "world", `${ID}.json`),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", `${ID}.json`);
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe(`${ID} through the world runtime — one ban, and dashes where the turn is legal`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives the Б2 on the STEM and nothing else — so the gap is guarded, never right-hand-rule", () => {
    // The reason the boulevard is `primary` and the stem `residential`. The
    // stop-sign heuristic (rank >= 4 meets rank <= 2) puts a Б2 line on the
    // stem's mouth, which lands mvu-n-gap in guardedNodeIds — and a guarded node
    // is NOT an uncontrolled junction. So the right-hand-rule tracker never arms
    // here, and no drive can pick up a phantom „предимство отдясно"
    // FAILED_TO_YIELD beside the чл. 38 one this map exists to grade. Both
    // halves of that sentence are asserted.
    const lines = runtime.debugStopLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].control).toBe("stopSign");
    expect(lines[0].junctionNodeId).toBe("mvu-n-gap");
    expect(runtime.debugUncontrolledJunctions()).toEqual([]);
    expect(runtime.debugSignalClusters().length).toBe(0);
    // …and the derived line sits far down the stem, nowhere the U-turn arc goes:
    // the player is never on mvu-e-cross's approach and can never sweep it.
    expect(lines[0].sM).toBeGreaterThan(40);
  });

  it("flags solidCenterLine across the ban and NOWHERE else — the seam, meter by meter", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const solidAt = (x: number, y: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(x, y, 0, 40), y, false).solidCenterLine;
    };
    // Before the ban: the driver reads it arriving.
    expect(solidAt(LANE_OUT, SPAWN_Y)).toBeUndefined();
    expect(solidAt(LANE_OUT, BAN_FROM_Y - 5)).toBeUndefined();
    // The ban itself, on BOTH banks (a U-turn crosses both).
    expect(solidAt(LANE_OUT, BAN_FROM_Y + 1)).toBe(true);
    expect(solidAt(LANE_OUT, TEMPTING_Y)).toBe(true);
    expect(solidAt(LANE_IN, TEMPTING_Y)).toBe(true);
    expect(solidAt(-LANE_IN, TEMPTING_Y)).toBe(true);
    expect(solidAt(-LANE_OUT, TEMPTING_Y)).toBe(true);
    expect(solidAt(LANE_OUT, BAN_TO_Y - 1)).toBe(true);
    // THE load-bearing half: the dashed run-in and the gap must stay clear. A
    // solid flag leaking forward would grade the SHADOW's lawful turn as
    // CROSSED_SOLID_LINE — the drill would convict the answer it teaches.
    expect(solidAt(LANE_OUT, BAN_TO_Y + 1)).toBeUndefined();
    expect(solidAt(LANE_IN, 250)).toBeUndefined();
    expect(solidAt(LANE_IN, 264)).toBeUndefined(); // where the shadow's arc starts
    expect(solidAt(-LANE_OUT, 264)).toBeUndefined(); // …and where it lands
    expect(solidAt(LANE_IN, GAP_Y)).toBeUndefined();
    expect(solidAt(LANE_OUT, GAP_Y + 40)).toBeUndefined();
    expect(solidAt(LANE_OUT, LENGTH_M - 15)).toBeUndefined();
    // Nothing else leaks onto the tick — this map bans nothing but the line.
    const tick = rt.sample(sample(LANE_OUT, TEMPTING_Y, 0, 40), TEMPTING_Y, false);
    expect(tick.noStopZone).toBeUndefined();
    expect(tick.noParkZone).toBeUndefined();
    expect(tick.noOvertakeZone).toBeUndefined();
    expect(tick.busLaneRight).toBeUndefined();
    expect(tick.noUTurn).toBeUndefined(); // see the meta.scenario assertion above
    expect(tick.oneway).toBe(false);
    expect(tick.maxSpeedKmh).toBe(50);
  });

  it("the opposing-bank seam fires the way the demos need it: north-bound at x < 0 only", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const oppAt = (x: number, y: number, h: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(x, y, h, 14), y, false).opposingBank;
    };
    // The mistake demo's excursion: still pointing north-ish, already across.
    // This ± the solid flag above IS the CROSSED_SOLID_LINE condition.
    expect(oppAt(-LANE_IN, TEMPTING_Y, 0)).toBe(true);
    expect(oppAt(-LANE_OUT, TEMPTING_Y, 300)).toBe(true);
    // Own bank north-bound, and the far bank once genuinely turned around — a
    // car that has completed its turn is INNOCENT, which is why the demo bills
    // once rather than for the whole drive home.
    expect(oppAt(LANE_OUT, TEMPTING_Y, 0)).toBeUndefined();
    expect(oppAt(-LANE_OUT, TEMPTING_Y, 180)).toBeUndefined();
  });
});

describe(`${ID} through the traffic graph — where the oncoming stream can be staged`, () => {
  it("THE JU-10 GAP ARITHMETIC: a curb-lane oncoming can NEVER reach the convict bar on a 2+2", () => {
    // The fact that decides the template's staging, asserted rather than
    // trusted. The left-turn tracker measures its gap from the JUNCTION NODE:
    // gapSec = dist / closing, so a car `X` metres off that axis carries a
    // permanent lateral term and gapSec bottoms out at 2·X/v — independent of
    // distance. On the graph's default CURB lane (X = 12.19) that floor is
    // 3.05 s, ABOVE the 2.0 s convict bar at every distance and every speed: the
    // тежката грешка of this drill would be structurally ungradable. Shifted to
    // the INNER lane (X = 4.06 — extraRightOffsetM −8.125 in the template) the
    // floor is 1.02 s and the tight band is a real ~1.7 s window.
    const gapSec = (laneX: number, aheadM: number, mps: number) => {
      const dist = Math.hypot(laneX, aheadM);
      return dist / ((aheadM / dist) * mps);
    };
    const minGap = (laneX: number, mps: number) => {
      let best = Infinity;
      for (let d = 0.1; d < 40; d += 0.01) best = Math.min(best, gapSec(laneX, d, mps));
      return best;
    };
    expect(minGap(LANE_OUT, 8)).toBeGreaterThan(CONVICT_GAP_SEC);
    expect(minGap(LANE_OUT, 8)).toBeCloseTo((2 * LANE_OUT) / 8, 1);
    expect(minGap(LANE_IN, 8)).toBeLessThan(CONVICT_GAP_SEC);
    expect(minGap(LANE_IN, 8)).toBeCloseTo((2 * LANE_IN) / 8, 1);
  });

  it("stages the stream's southbound path across BOTH boulevard halves, in the inner lane", () => {
    const raw = loadRaw(ID);
    const graph = buildLaneGraph(raw as TrafficDistrict, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45, // the TrafficSystem constructor's own literal
    });
    // The graph's own curb offset for this 2+2 — the number the template's
    // extraRightOffsetM is measured against (traffic/graph.laneOffsetFor).
    const curb = resolveStagedVehiclePath(graph, ["mvu-n-end", "mvu-n-gap", "mvu-n-start"], 0)!;
    expect(curb).not.toBeNull();
    expect(curb.px[0]).toBeCloseTo(-LANE_OUT, 1);
    // The template's own staging: 8.125 m back toward the осева = the inner lane.
    const inner = resolveStagedVehiclePath(graph, ["mvu-n-end", "mvu-n-gap", "mvu-n-start"], -8.125)!;
    expect(inner).not.toBeNull();
    for (let i = 0; i < inner.px.length; i++) expect(inner.px[i]).toBeCloseTo(-LANE_IN, 1);
    // The path runs the WHOLE boulevard, node to node, so hold arc s ⇒ y = 620 − s
    // (the arithmetic every drive script in scMvUturnBan.ts is authored against).
    expect(inner.length).toBeCloseTo(LENGTH_M, 0);
    expect(inner.nodeS[0]).toBeCloseTo(0, 1);
    expect(inner.nodeS[1]).toBeCloseTo(LENGTH_M - GAP_Y, 0);
    expect(inner.nodeS[2]).toBeCloseTo(LENGTH_M, 0);
    expect(inner.py[0]).toBeCloseTo(LENGTH_M, 0);
    expect(inner.py[inner.py.length - 1]).toBeCloseTo(0, 0);
  });
});
