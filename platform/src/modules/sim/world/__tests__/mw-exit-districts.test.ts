/**
 * MOTORWAY-EXIT contract battery (the merge-districts.test.ts pattern, run
 * backwards) — doc 72 §8 SP-10 „Магистрала" изход + SP-05 „Скорост в завой" on
 * the връзка.
 *
 * content/world/mw-exit-v1.json (tools/maps/gen_mw_exit.mjs) is the exit twin
 * of mw-entry-v1: a divided 2+2 motorway whose northbound carriageway is SPLIT
 * into three collinear segments at plain degree-2 nodes, plus an un-tagged exit
 * ramp that leaves the curb-lane center at the gore tangentially and carries a
 * curveAdvisory span over its bend. The battery proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - THE ARCHETYPE'S WHOLE IDEA — the emergencyLane span is interrupted for
 *    exactly the 280 m of the deceleration lane, so the SAME curb lane reads as
 *    a legal travel lane between taper and gore and as the аварийна лента on
 *    either side of it. That one data gap is what makes „намали ЧАК в лентата
 *    за намаляване" gradable with zero new engine code;
 *  - the ramp's marked bend puts an advisory on the tick, so a driver who never
 *    shed speed grades SPEED_TOO_FAST_FOR_CURVE on the връзка while the shadow
 *    at the advisory stays innocent;
 *  - the LOCATOR resolves the authored line the trace scripts drive: laneId 2 →
 *    laneId 1 → the deceleration lane → the ramp, with the hand-off at the gore
 *    and no lock ever stolen across the median;
 *  - the archetype's REASON TO EXIST end-to-end through the REAL reducer:
 *    braking in the deceleration lane is INNOCENT, cruising laneId 1 past the
 *    gore is INNOCENT (the resumed span exempts keep-right — the „изпуснах
 *    изхода, карам нататък" continuation чл. 58 demands), and hugging the curb
 *    lane past the gore grades exactly EMERGENCY_LANE_DRIVING;
 *  - the ramp is NOT motorway-tagged, so the correct advisory pace on it can
 *    never grade DRIVING_TOO_SLOW_FOR_MOTORWAY.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent, type SimTick } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** mw-exit-v1 truths (generator params — asserted against the file below). */
const TAPER_Y = 520; // the deceleration lane opens
const NOSE_Y = 800; // the gore: the ramp leaves
const END_Y = 1220;
const LIMIT_KMH = 140;
const RAMP_KMH = 90;
const ADVISORY_KMH = 60;
const RAMP_R = 250;
const RAMP_SWEEP_DEG = 45;
const RAMP_ARC_M = 196.34; // the chorded polyline's own length (meta.scenario)
const X_CURB = 8.13; // laneId 0 — decel lane between taper/gore, аварийна elsewhere
const X_CRUISE = 0; // laneId 1 — the lane you exit FROM
const X_LEFT = -8.12; // laneId 2 — the overtaking lane
const APPROACH_EDGE = "mwx-e-nb-approach";
const DECEL_EDGE = "mwx-e-nb-decel";
const MAIN_EDGE = "mwx-e-nb-main";
const SB_EDGE = "mwx-e-sb";
const RAMP_EDGE = "mwx-e-ramp";
const NB_EDGES = [APPROACH_EDGE, DECEL_EDGE, MAIN_EDGE];

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_mw_exit.mjs) in: ${candidates.join(", ")}`);
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

/** The ramp arc as the generator sampled it (centre + radius from
 *  meta.scenario) — the same helper the trace script uses. */
function rampArcPoints(): Array<{ x: number; y: number; headingDeg: number }> {
  const cx = X_CURB + RAMP_R;
  const cy = NOSE_Y;
  const out: Array<{ x: number; y: number; headingDeg: number }> = [];
  for (let i = 0; i <= RAMP_SWEEP_DEG / 1.5; i++) {
    const deg = i * 1.5;
    const th = (deg * Math.PI) / 180;
    out.push({ x: cx - RAMP_R * Math.cos(th), y: cy + RAMP_R * Math.sin(th), headingDeg: deg });
  }
  return out;
}

describe("mw-exit-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw("mw-exit-v1"));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document: a 2+2 motorway split into three collinear nb segments + an exit ramp", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(8);
    expect(district.roads.edges.length).toBe(5);
    for (const id of [...NB_EDGES, SB_EDGE]) {
      const e = district.roads.edges.find((x) => x.id === id)!;
      expect(e, id).toBeDefined();
      expect(e.oneway, id).toBe(true);
      expect(e.lanes, id).toBe(3); // curb + 2 travel
      expect(e.maxspeed, id).toBe(LIMIT_KMH); // the honest АМ 140
      expect(e.motorway, id).toBe(true);
    }
    // The nb split: approach → decel (280 m, the deceleration lane) → main.
    const seg = (id: string) => district.roads.edges.find((e) => e.id === id)!;
    expect(seg(APPROACH_EDGE).length).toBe(TAPER_Y);
    expect(seg(DECEL_EDGE).length).toBe(NOSE_Y - TAPER_Y);
    expect(seg(MAIN_EDGE).length).toBe(END_Y - NOSE_Y);
    for (const id of NB_EDGES) for (const [x] of seg(id).geometry) expect(x, id).toBe(0);
    // The joints are plain degree-2 vertices (a data boundary, not a junction);
    // the gore is the RAMP's own start node, so the nose never becomes one.
    for (const nodeId of ["mwx-n-taper", "mwx-n-nose"]) {
      const degree = district.roads.edges.filter((e) => e.from === nodeId || e.to === nodeId).length;
      expect(degree, nodeId).toBe(2);
    }
    const goreDegree = district.roads.edges.filter(
      (e) => e.from === "mwx-n-ramp-gore" || e.to === "mwx-n-ramp-gore",
    ).length;
    expect(goreDegree).toBe(1);
    expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
  });

  it("THE ARCHETYPE: the emergencyLane span is interrupted for exactly the deceleration lane", () => {
    const emerg = district.zones!.filter((z) => z.kind === "emergencyLane");
    expect(emerg).toHaveLength(3);
    const hosts = emerg.map((z) => z.edgeId).sort();
    expect(hosts).toEqual([APPROACH_EDGE, MAIN_EDGE, SB_EDGE].sort());
    // The deceleration segment carries NO span — its curb lane is a LEGAL
    // travel lane. This single gap is the whole map.
    expect(hosts).not.toContain(DECEL_EDGE);
    for (const z of emerg) {
      expect(z.signRef).toBe("М2");
      expect(z.fromM).toBe(0);
      expect(z.toM).toBe(district.roads.edges.find((e) => e.id === z.edgeId)!.length);
    }
  });

  it("the ramp's marked bend carries the ONE curveAdvisory span, posted А1 + Т-табела 60", () => {
    const curve = district.zones!.filter((z) => z.kind === "curveAdvisory");
    expect(curve).toHaveLength(1);
    const z = curve[0];
    expect(z.id).toBe("mwx-z-ramp-curve");
    expect(z.edgeId).toBe(RAMP_EDGE);
    expect(z.signRef).toBe("А1");
    expect(z.advisoryKmh).toBe(ADVISORY_KMH);
    // The arc IS the zone: it starts at the gore and ends where the tail begins.
    expect(z.fromM).toBe(0);
    expect(z.toM).toBeCloseTo(RAMP_ARC_M, 2);
    const ramp = district.roads.edges.find((e) => e.id === RAMP_EDGE)!;
    expect(z.toM).toBeLessThan(ramp.length); // the straight tail is envelope-free
  });

  it("the ramp is a plain un-tagged връзка: one lane, чл. 21 90, leaving the curb-lane center at the gore tangentially", () => {
    const ramp = district.roads.edges.find((e) => e.id === RAMP_EDGE)!;
    expect(ramp.oneway).toBe(true);
    expect(ramp.lanes).toBe(1);
    expect(ramp.maxspeed).toBe(RAMP_KMH);
    expect(ramp.class).toBe("secondary_link");
    // NOT motorway-tagged: a driver correctly down at the advisory here must
    // never meet the SP-10 flow floor (the detector stays disarmed).
    expect(ramp.motorway).toBeUndefined();
    expect(ramp.geometry[0]).toEqual([X_CURB, NOSE_Y]);
    // Tangential departure: the first chord bears at most one sampling step.
    const [[x0, y0], [x1, y1]] = ramp.geometry;
    const firstChordDeg = (Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI;
    expect(firstChordDeg).toBeGreaterThan(0);
    expect(firstChordDeg).toBeLessThanOrEqual(1.5);
    // …and the whole arc really is R 250 × 45° around the pinned centre.
    for (const p of rampArcPoints()) {
      expect(Math.hypot(p.x - (X_CURB + RAMP_R), p.y - NOSE_Y)).toBeCloseTo(RAMP_R, 6);
    }
  });

  it("pins the authored lane centers + story arclengths in meta.scenario (the L7 copy truth)", () => {
    const sc = district.meta.scenario as {
      archetype: string;
      laneCurbX: number;
      laneCruiseX: number;
      laneLeftX: number;
      lanesPerDirection: number;
      taperY: number;
      noseY: number;
      endY: number;
      decelEdgeId: string;
      rampEdgeId: string;
      rampArc: { cx: number; cy: number; radiusM: number; sweepDeg: number; stepDeg: number };
      rampArcEnd: [number, number];
      rampEnd: [number, number];
      rampTailHeadingDeg: number;
      curveZone: { id: string; fromM: number; toM: number; advisoryKmh: number };
    };
    expect(sc.archetype).toBe("merge-lane");
    expect(sc.lanesPerDirection).toBe(2);
    expect(sc.laneCurbX).toBe(X_CURB);
    expect(sc.laneCruiseX).toBe(X_CRUISE);
    expect(sc.laneLeftX).toBe(X_LEFT);
    expect(sc.taperY).toBe(TAPER_Y);
    expect(sc.noseY).toBe(NOSE_Y);
    expect(sc.endY).toBe(END_Y);
    expect(sc.decelEdgeId).toBe(DECEL_EDGE);
    expect(sc.rampEdgeId).toBe(RAMP_EDGE);
    expect(sc.rampArc).toEqual({ cx: X_CURB + RAMP_R, cy: NOSE_Y, radiusM: RAMP_R, sweepDeg: RAMP_SWEEP_DEG, stepDeg: 1.5 });
    expect(sc.rampTailHeadingDeg).toBe(RAMP_SWEEP_DEG);
    expect(sc.curveZone.advisoryKmh).toBe(ADVISORY_KMH);
    // The arc end + ramp end the ScenarioSpec/trace scripts pin by value.
    const ramp = district.roads.edges.find((e) => e.id === RAMP_EDGE)!;
    expect(sc.rampEnd).toEqual(ramp.geometry[ramp.geometry.length - 1]);
    expect(sc.rampArcEnd).toEqual(ramp.geometry[ramp.geometry.length - 2]);
    // The spawns the ScenarioSpec/trace scripts pin by value.
    const start = district.spawnPoints.find((s) => s.id === "mwx-spawn-left-lane")!;
    expect([start.x, start.y, start.heading]).toEqual([X_LEFT, 15, 0]);
    expect(start.edgeId).toBe(APPROACH_EDGE);
    const decel = district.spawnPoints.find((s) => s.id === "mwx-spawn-decel")!;
    expect(decel.x).toBe(X_CURB);
    expect(decel.y).toBeGreaterThan(TAPER_Y);
    expect(decel.y).toBeLessThan(NOSE_Y);
    const finish = district.spawnPoints.find((s) => s.id === "mwx-spawn-ramp-exit")!;
    expect(finish.edgeId).toBe(RAMP_EDGE);
    expect(finish.heading).toBe(RAMP_SWEEP_DEG);
  });

  it("hosts a plain motorway exit: no lights, no stop signs, no zebras, no junctions — only the ramp's А1 post", () => {
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
    // The curveAdvisory span renders its warning post (builders/zoneSigns.ts);
    // the emergencyLane spans are marking-only and place nothing. NO exit
    // direction sign exists as an asset yet — the generator header's honest
    // gap: the ScenarioSpec copy carries that teaching.
    expect(world.stats.signs.curve).toBe(1);
    expect(world.stats.signs.noOvertaking).toBe(0);
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

  it("stays inside the performance budget (micro-map) and is deterministic for a fixed seed", () => {
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
    expect(buildWorldGeometry(district, { seed: 7 }).stats).toEqual(world.stats);
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", "mw-exit-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "mw-exit-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "mw-exit-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("mw-exit-v1 through the world runtime — the exit context on the tick", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw("mw-exit-v1"));
  });

  it("derives ZERO signals, stop lines and junction trackers (collinear splits + a gore are not junctions)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("THE DATA GAP on the tick: the curb lane is a travel lane between taper and gore, the аварийна лента outside it", () => {
    const at = (y: number): SimTick => {
      const rt = createWorldRuntime(loadRaw("mw-exit-v1"));
      rt.update(1 / 60);
      return rt.sample(sample(X_CURB, y, 0, 90), 1, false);
    };
    const before = at(TAPER_Y - 60);
    expect(before.edgeId).toBe(APPROACH_EDGE);
    expect(before.laneId).toBe(0);
    expect(before.emergencyLaneRight).toBe(true); // хард шолдър — not a travel lane yet
    const inLane = at(TAPER_Y + 80);
    expect(inLane.edgeId).toBe(DECEL_EDGE);
    expect(inLane.laneId).toBe(0);
    expect(inLane.laneCount).toBe(3);
    expect(inLane.motorway).toBe(true);
    expect(inLane.maxSpeedKmh).toBe(LIMIT_KMH);
    expect(inLane.emergencyLaneRight).toBeUndefined(); // ЛЕНТА ЗА НАМАЛЯВАНЕ
    expect(inLane.curveAdvisoryKmh).toBeUndefined(); // the envelope lives on the ramp
    const after = at(NOSE_Y + 150);
    expect(after.edgeId).toBe(MAIN_EDGE);
    expect(after.laneId).toBe(0);
    expect(after.emergencyLaneRight).toBe(true); // the span resumes at the gore
  });

  it("resolves the cruise and the overtaking lane to laneIds 1/2 on every nb segment", () => {
    for (const [y, edgeId] of [
      [TAPER_Y - 60, APPROACH_EDGE],
      [TAPER_Y + 80, DECEL_EDGE],
      [NOSE_Y + 150, MAIN_EDGE],
    ] as Array<[number, string]>) {
      const rt = createWorldRuntime(loadRaw("mw-exit-v1"));
      rt.update(1 / 60);
      const cruise = rt.sample(sample(X_CRUISE, y, 0, 130), 1, false);
      expect(cruise.edgeId, edgeId).toBe(edgeId);
      expect(cruise.laneId, edgeId).toBe(1);
      const rt2 = createWorldRuntime(loadRaw("mw-exit-v1"));
      rt2.update(1 / 60);
      const left = rt2.sample(sample(X_LEFT, y, 0, 130), 1, false);
      expect(left.laneId, edgeId).toBe(2);
      expect(left.motorway, edgeId).toBe(true);
    }
  });

  it("THE GORE: the fix is handed from the deceleration lane to the ramp within a car length of the nose", () => {
    const rt = createWorldRuntime(loadRaw("mw-exit-v1"));
    let t = 0;
    const at = (x: number, y: number, h: number): SimTick => {
      t += 0.1;
      rt.update(0.1);
      return rt.sample(sample(x, y, h, 60), t, false);
    };
    // Down the deceleration lane…
    let handedOverAtY = Infinity;
    for (let y = TAPER_Y + 40; y < NOSE_Y; y += 1) {
      const tick = at(X_CURB, y, 0);
      if (tick.edgeId === RAMP_EDGE) {
        handedOverAtY = y;
        break;
      }
      expect(tick.edgeId, `y=${y}`).toBe(DECEL_EDGE);
      expect(tick.emergencyLaneRight, `y=${y}`).toBeUndefined();
      expect(tick.maxSpeedKmh, `y=${y}`).toBe(LIMIT_KMH);
    }
    // The hand-off is a gore artefact — within a car length of the nose, never
    // deep in the лента за намаляване (where the АМ limit must still govern).
    expect(handedOverAtY).toBeGreaterThan(NOSE_Y - 6);
    expect(handedOverAtY).toBeLessThanOrEqual(NOSE_Y);
  });

  it("THE RAMP: its own un-tagged context, with the advisory on every tick of the marked bend", () => {
    const rt = createWorldRuntime(loadRaw("mw-exit-v1"));
    let t = 0;
    // The span is [0, toM) in the Locator's sM measure, so the arc's LAST
    // vertex (sM === toM, the tail's first metre) is already envelope-free —
    // the drills grade inside the bend, which is where the drive spends its
    // whole arc. Every vertex before it must carry the advisory.
    for (const p of rampArcPoints().slice(0, -1)) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(sample(p.x, p.y, p.headingDeg, ADVISORY_KMH), t, false);
      expect(tick.edgeId, `deg=${p.headingDeg}`).toBe(RAMP_EDGE);
      expect(tick.maxSpeedKmh, `deg=${p.headingDeg}`).toBe(RAMP_KMH);
      expect(tick.curveAdvisoryKmh, `deg=${p.headingDeg}`).toBe(ADVISORY_KMH);
      // The ramp must never arm the motorway detectors — the advisory pace on a
      // връзка is exiting, not crawling on the carriageway.
      expect(tick.motorway, `deg=${p.headingDeg}`).toBeUndefined();
      expect(tick.emergencyLaneRight, `deg=${p.headingDeg}`).toBeUndefined();
      expect(tick.wrongWay, `deg=${p.headingDeg}`).not.toBe(true);
      // …and the ramp centerline is never mistaken for a wandering lane.
      expect(Math.abs(tick.laneOffsetM), `deg=${p.headingDeg}`).toBeLessThan(1);
    }
  });

  it("keeps a stable northbound lock at 130 km/h from the taper to the end (never steals across the median)", () => {
    const rt = createWorldRuntime(loadRaw("mw-exit-v1"));
    const step = 3.61; // 130 km/h at 10 Hz
    let t = 0;
    for (let y = TAPER_Y + 5; y <= END_Y - 15; y += step) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(sample(X_CRUISE, y, 0, 130), t, false);
      // The nb chain, with the locator's own steal margin around the joint:
      // the decel edge keeps the lock until a rival wins by EDGE_SWITCH_MARGIN
      // (4 m), so the hand-off to the mainline lands just past the nose.
      const expectedEdges =
        y < NOSE_Y ? [DECEL_EDGE] : y < NOSE_Y + 5 ? [DECEL_EDGE, MAIN_EDGE] : [MAIN_EDGE];
      expect(expectedEdges, `y=${y}`).toContain(tick.edgeId);
      expect(tick.laneId, `y=${y}`).toBe(1);
      expect(Math.abs(tick.laneOffsetM), `y=${y}`).toBeLessThan(0.6);
      expect(tick.wrongWay, `y=${y}`).not.toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("mw-exit-v1 — exit adjudication through the real reducer", () => {
  /** Drive north at per-arclength lane/speed profiles (the curve-battery
   *  discipline: dt 0.1 s, y advances by v·dt). */
  const exitDrive = (
    profile: (y: number) => { x: number; kmh: number },
    fromY: number,
    toY: number,
  ): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("mw-exit-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    let y = fromY;
    while (y < toY) {
      const { x, kmh } = profile(y);
      y += (kmh / 3.6) * dt;
      t += dt;
      rt.update(dt);
      const tick: SimTick = rt.sample(sample(x, y, 0, kmh), t, false);
      const r = reduceTick(rules, tick);
      rules = r.state;
      out.push(...r.events);
    }
    return out;
  };
  /** Ride the ramp arc at a fixed speed (heading follows the tangent). */
  const rampDrive = (kmh: number): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("mw-exit-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    const stepM = (kmh / 3.6) * dt;
    const cx = X_CURB + RAMP_R;
    let t = 0;
    for (let s = 0; s < RAMP_ARC_M; s += stepM) {
      const th = s / RAMP_R;
      t += dt;
      rt.update(dt);
      const tick: SimTick = rt.sample(
        sample(cx - RAMP_R * Math.cos(th), NOSE_Y + RAMP_R * Math.sin(th), (th * 180) / Math.PI, kmh),
        t,
        false,
      );
      const r = reduceTick(rules, tick);
      rules = r.state;
      out.push(...r.events);
    }
    return out;
  };
  const violations = (events: RuleEvent[]) =>
    events.filter((e) => e.kind === "violation").map((e) => e.code);

  it("braking down the DECELERATION lane is fully innocent (no span ⇒ no чл. 58 excursion, no keep-right)", () => {
    const events = exitDrive(
      (y) => ({ x: X_CURB, kmh: Math.max(ADVISORY_KMH, 130 - (y - (TAPER_Y + 5)) * 0.3) }),
      TAPER_Y + 5,
      NOSE_Y - 10,
    );
    expect(violations(events)).toEqual([]);
  });

  it("THE MISSED EXIT (чл. 58): cruising laneId 1 past the gore is fully innocent — you drive ON to the next exit", () => {
    const events = exitDrive(() => ({ x: X_CRUISE, kmh: 130 }), NOSE_Y + 5, END_Y - 20);
    expect(violations(events)).toEqual([]);
    expect(events.some((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING")).toBe(true);
  });

  it("THE GORE'S CONSEQUENCE: hugging the curb lane past the exit grades exactly EMERGENCY_LANE_DRIVING", () => {
    const events = exitDrive(() => ({ x: X_CURB, kmh: 95 }), NOSE_Y + 160, END_Y - 20);
    expect(violations(events)).toEqual(["EMERGENCY_LANE_DRIVING"]);
  });

  it("the 130 km/h left-lane hog on the approach still grades exactly NOT_KEEPING_RIGHT (OV-11 unharmed)", () => {
    // 500 m at 130 km/h = 13.8 s — past the 12 s keep-right sustain.
    const events = exitDrive(() => ({ x: X_LEFT, kmh: 130 }), 15, TAPER_Y - 5);
    expect(violations(events)).toEqual(["NOT_KEEPING_RIGHT"]);
  });

  it("THE SPAN GAP'S PRICE, bounded: declining the exit and holding laneId 1 down the whole deceleration lane is still innocent", () => {
    // Without the span, laneId 0 is the rightmost REQUIRED lane on the decel
    // segment — so laneId 1 technically „hogs" there. The lane is deliberately
    // short enough in TIME (280 m at motorway pace ≈ 7.8 s) that the 12 s
    // keep-right sustain can never bill the driver who simply drives on. The
    // generator asserts that budget; this is its end-to-end proof.
    const events = exitDrive(() => ({ x: X_CRUISE, kmh: 130 }), TAPER_Y + 1, NOSE_Y - 1);
    expect(violations(events)).toEqual([]);
  });

  it("the causeless 40 km/h crawl on the CARRIAGEWAY grades DRIVING_TOO_SLOW_FOR_MOTORWAY (the SP-10 floor is armed)", () => {
    // On the APPROACH, where the live span exempts laneId 1 from keep-right —
    // the crawl is the only fault on offer.
    const events = exitDrive(() => ({ x: X_CRUISE, kmh: 40 }), 100, 300);
    // TWO bills for a CONTINUING crawl — the teach the free mini-lesson spends
    // and the marked charge it consumed (w11, rules/engine.ts
    // MOTORWAY_CRAWL_REGRADE_SEC); `lessons/engine.ts` drops the marked one
    // wherever the code was already charged, so the sheet still prices it once.
    expect(violations(events)).toEqual([
      "DRIVING_TOO_SLOW_FOR_MOTORWAY",
      "DRIVING_TOO_SLOW_FOR_MOTORWAY",
    ]);
  });

  it("THE RAMP ENVELOPE: the advisory pace is innocent, motorway pace on the bend grades exactly SPEED_TOO_FAST_FOR_CURVE", () => {
    expect(violations(rampDrive(ADVISORY_KMH))).toEqual([]);
    // …and it is never a motorway crawl — the връзка carries no motorway tag.
    expect(violations(rampDrive(ADVISORY_KMH))).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");
    expect(violations(rampDrive(85))).toEqual(["SPEED_TOO_FAST_FOR_CURVE"]);
  });
});

// ---------------------------------------------------------------------------
// Traffic layer — the staged rear car's path must resolve
// ---------------------------------------------------------------------------

describe("mw-exit-v1 through the traffic lane graph + system", () => {
  it("chains the three nb segments into a continuous staged path and keeps the ramp its own lane", () => {
    const raw = loadRaw("mw-exit-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(5); // one per oneway edge (3 nb + sb + ramp)
    expect(graph.crossingLanes.size).toBe(0);
    // The staged rear car of SC_MERGE_MOTORWAY_EXIT walks nb-start → taper →
    // nose → nb-end: every hop must be lane-graph-connected.
    const hops: Array<[string, string]> = [
      ["mwx-n-nb-start", "mwx-n-taper"],
      ["mwx-n-taper", "mwx-n-nose"],
      ["mwx-n-nose", "mwx-n-nb-end"],
    ];
    for (const [from, to] of hops) {
      const out = graph.nodeOut.get(from) ?? [];
      expect(out.some((li) => graph.lanes[li].toNode === to), `${from} → ${to}`).toBe(true);
    }
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(X_CRUISE, TAPER_Y, 0)).toBe(Infinity);
  });
});
