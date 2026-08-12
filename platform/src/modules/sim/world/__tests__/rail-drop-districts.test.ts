/**
 * rx-drop-v1 archetype contract battery — the DESCENDING-barrier crossing
 * (ADR-006 stage 3a RAIL PACK; the rail-districts.test.ts pattern, one map).
 *
 * content/world/rx-drop-v1.json is the guarded crossing whose barrier is OPEN
 * at session start and DESCENDS in front of the player — the deterministic
 * timetable down [20, 60) of every 90 s (tools/maps/gen_rail_crossing.mjs, the
 * same generator + self-validation as rx-guarded-v1, re-phased). It hosts
 * „Бариерата тръгва надолу" (sc-rx-barrier-drop, RX-01). The battery proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - the rail span phases exactly as authored, and the barrier is UP at spawn,
 *    DOWN across [20, 60), and UP again — deterministic in session time;
 *  - the archetype's REASON TO EXIST end-to-end through the REAL reducer: an
 *    OPEN-window transit stays innocent (чл. 52), a transit that dives onto the
 *    band inside the down-window convicts (entered-barred), and coming to REST
 *    on the band convicts (stopped-on-track) — the drill's two mistakes.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent, type ViolationEvent } from "../../rules";
import { createWorldRuntime, RAIL_APPROACH_M, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "rx-drop-v1";
const EDGE_ID = "rxd-e-street";
/** rx-drop-v1 (1+1): the single northbound lane center. */
const RX_LANE = 4.06;
/** rx-drop-v1: the authored track band. */
const BAND_FROM = 150;
const BAND_TO = 156;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_rail_crossing.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document carrying ONE authored guarded rail span", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.id).toBe(EDGE_ID);
    expect(road.lanes).toBe(2);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(50);
    expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
    expect(district.zones).toHaveLength(1);
    const z = district.zones![0];
    expect(z.kind).toBe("railCrossing");
    expect(z.signRef).toBe("А34");
    expect(z.edgeId).toBe(EDGE_ID);
    expect(z.fromM).toBe(BAND_FROM);
    expect(z.toM).toBe(BAND_TO);
    expect(z.guarded).toBe(true);
    // The DROP signature: OPEN at spawn (downFromSec > 0), barred [20, 60).
    expect(z.barrier).toEqual({ cycleSec: 90, downFromSec: 20, downToSec: 60 });
  });

  it("hosts a plain street: no lights, no stop signs, no zebras", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
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

  it("stays trivially inside the performance budget (micro-map)", () => {
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
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

describe(`${ID} through the world runtime — the descending barrier on the tick`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals, stop lines and junction trackers", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("phases the crossing EXACTLY: absent / approach / on / absent (northbound)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const phaseAt = (y: number, tSec: number) => {
      rt.update(1 / 60);
      const tick = rt.sample(sample(RX_LANE, y, 0, 30), tSec, false);
      return { phase: tick.railCrossing, guarded: tick.railGuarded };
    };
    // Before the approach window (northbound): nothing (session clock in the
    // OPEN window so guarded is only surfaced once phased).
    const far = phaseAt(BAND_FROM - RAIL_APPROACH_M - 10, 5);
    expect(far.phase).toBeUndefined();
    expect(far.guarded).toBeUndefined();
    // Inside the approach window: "approach" + the А34 guarded flag.
    const appr = phaseAt(BAND_FROM - 10, 5);
    expect(appr.phase).toBe("approach");
    expect(appr.guarded).toBe(true);
    // On the band: "on".
    expect(phaseAt((BAND_FROM + BAND_TO) / 2, 5).phase).toBe("on");
    // Past the band (northbound — the band is BEHIND): nothing.
    expect(phaseAt(BAND_TO + 12, 5).phase).toBeUndefined();
  });

  it("the barrier is UP at spawn, DOWN across [20, 60), UP again — deterministic in session time", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const barredAt = (tSec: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(RX_LANE, BAND_FROM - 8, 0, 20), tSec, false).railBarred;
    };
    // OPEN at session start — the drop is in FRONT of the player, not on it.
    expect(barredAt(2)).toBeUndefined(); // up at spawn
    expect(barredAt(19.5)).toBeUndefined(); // …to the very edge of the drop
    expect(barredAt(20.5)).toBe(true); // descends at t = 20
    expect(barredAt(59.5)).toBe(true); // …down through the window
    expect(barredAt(60.5)).toBeUndefined(); // lifts at t = 60
    expect(barredAt(89)).toBeUndefined(); // still open
    expect(barredAt(112)).toBe(true); // next cycle (112 mod 90 = 22)
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

/** Drive rx-drop-v1 northbound at 30 km/h, optionally resting `restOnBandSec`
 *  mid-band; the session clock starts at t0 (the barrier phase the drive meets). */
function railDrive(opts: { t0?: number; restOnBandSec?: number } = {}): RuleEvent[] {
  const rt = createWorldRuntime(loadRaw(ID));
  let rules = createRuleEngine();
  const out: RuleEvent[] = [];
  const dt = 0.1;
  let t = opts.t0 ?? 0;
  const step = (y: number, speedKmh: number) => {
    t += dt;
    rt.update(dt);
    const tick = rt.sample(sample(RX_LANE, y, 0, speedKmh), t, false);
    const r = reduceTick(rules, tick);
    rules = r.state;
    out.push(...r.events);
  };
  const vMps = 30 / 3.6;
  for (let y = 15; y < 153; y += vMps * dt) step(y, 30); // approach + onto the band
  if (opts.restOnBandSec) {
    for (let i = 0; i < Math.round(opts.restOnBandSec / dt); i++) step(153, 0);
  }
  for (let y = 153; y < 280; y += vMps * dt) step(y, 30); // …and drive out
  return out;
}
const violations = (events: RuleEvent[]) =>
  [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];
const railDetails = (events: RuleEvent[]) =>
  events
    .filter((e): e is ViolationEvent => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION")
    .map((e) => e.detail);

describe(`${ID} — RX-01 „спускане" adjudication through the real reducer`, () => {
  it("THE LEGAL ASYMMETRY: a stop-free transit in the OPEN window stays innocent (чл. 52)", () => {
    // Session clock at 62 s — the barrier is up ([60, 90) of the cycle) and the
    // whole 265 m transit at 30 km/h finishes before the next drop at 110 s.
    expect(violations(railDrive({ t0: 62 }))).toEqual([]);
  });

  it("diving onto the band inside the DOWN-window grades exactly RAIL_CROSSING_VIOLATION (entered-barred)", () => {
    // t0 = 25 → band entry at ~t 41, deep inside the barred window [20, 60).
    const ev = railDrive({ t0: 25 });
    expect(violations(ev)).toEqual(["RAIL_CROSSING_VIOLATION"]);
    expect(railDetails(ev)).toEqual(["entered-barred"]);
  });

  it("entering OPEN then FREEZING on the band grades exactly RAIL_CROSSING_VIOLATION (stopped-on-track)", () => {
    // t0 = 0 → band entry at ~t 16 (open, innocent), then a 3 s rest as the
    // barrier comes down at t = 20 — the drill's second mistake.
    const ev = railDrive({ t0: 0, restOnBandSec: 3 });
    expect(violations(ev)).toEqual(["RAIL_CROSSING_VIOLATION"]);
    expect(railDetails(ev)).toEqual(["stopped-on-track"]);
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe(`${ID} through the traffic lane graph + system`, () => {
  it("builds the 1+1 lane graph; zero traffic is a LEGAL config", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(RX_LANE, 15, 0)).toBe(Infinity);
  });
});
