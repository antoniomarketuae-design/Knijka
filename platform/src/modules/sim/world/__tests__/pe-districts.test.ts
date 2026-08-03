/**
 * PE-family crossing micro-map contract battery (Scenario Studio doc 76 §3;
 * the zb-district.test.ts pattern, parametrized over the S3 batch-1 maps).
 *
 * content/world/{pe-clear,pe-slow,pe-rain}-v1.json are the pedestrian-family
 * generated micro-maps (tools/maps/gen_pe_crossings.mjs — one straight
 * two-lane street, ONE unsignalized marked zebra each). The battery proves
 * every file satisfies the FULL engine contract each district drives through:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: the zebra painted
 *                (stats.zebraCrossings), no lights/stop signs, zero errors;
 *   2. runtime — createWorldRuntime derives the CrossingZoneTracker zone from
 *                crossings[]: the zone ARMS (~35 m), tracks the installed
 *                pedestrian query, and fires crossingPassed — the exact events
 *                the PEDESTRIAN_* rule detectors grade;
 *   3. traffic — buildLaneGraph maps the crossing onto every directed lane; a
 *                STAGED pedestrian's road-span occupancy drives
 *                pedestrianOnCrossing (the dart-out grading chain).
 *
 * ⚠ DOC 87 FR-41 / B50 / B53 — THIS BATTERY USED TO PIN THE DEFECT. Until this
 * change it asserted `roads.edges.length === 1`, `class` untested, one lane
 * width, one cross-section — SEVEN TIMES, once per district — and every one of
 * the seven passed. The founder played catalog 24–30 back to back and wrote
 * „already 5-6 different questions" about what is in fact seven consecutive
 * lessons on seven copies of one street, and the re-look photographed it: seven
 * straight ribbons, no junction, no side road, no bend, no sign, no lamp. Each
 * lesson passed every gate it had; **the SEQUENCE was the defect**, and a
 * per-district battery is structurally blind to a sequence.
 *
 * So the per-district cases now carry the ROADSCAPE each map declares, and a
 * FAMILY section at the bottom asserts the thing no per-district test can: that
 * the seven differ from each other. A future instance that copies an existing
 * cross-section fails there, not in review.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { computeParkedCars } from "../../traffic/TrafficLayer";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import {
  edgeBareVerge,
  edgeHalfWidth,
  edgeParkingWidthM,
  edgeTravelHalfWidth,
} from "../builders/network";
import { assertDistrict, type District, type WorldGeometry } from "../types";

interface PeMapCase {
  id: string;
  crossingY: number;
  limitKmh: number;
  lengthM: number;
  /** doc 87 FR-41 — the cross-section this street declares (ROADSCAPES). */
  roadscape: string;
  roadClass: string;
  /** Curbside parking band per side, m: 4 = the parked row stands on asphalt
   *  (FR-21's car half), 0 = this street has no kerbside parking at all. */
  bandM: number;
  oneway: boolean;
  /** Directed lanes buildLaneGraph derives ON THE GRADED STREET (a one-way
   *  street has one). Terminus legs add their own — `graphLanes` is the total. */
  lanes: number;
  /**
   * doc 87 B50/B53/B54 — the TERMINUS: what this street runs into, past the
   * furthest sample of every recorded drive on it. This is the axis that
   * answers „dead straight to a flat horizon", and the three numbers beside it
   * are what „2 nodes / 1 edge / 0 intersections, seven times" measured.
   */
  terminus: string;
  nodes: number;
  edges: number;
  /** Total directed lanes in the district (street + every terminus leg). */
  graphLanes: number;
  /** The ban-zone face this street posts, if any. */
  banSignRef: string | null;
  /** Lamp columns: an ARTERIAL class is lit, a residential one is not. */
  lit: boolean;
  /** The side, if any, that has NO pavement at all (network.edgeBareVerge). */
  bareVerge: string | null;
}

const CASES: PeMapCase[] = [
  { id: "pe-clear-v1", crossingY: 90, limitKmh: 50, lengthM: 150,
    roadscape: "collector-shopping", roadClass: "tertiary", bandM: 0,
    oneway: false, lanes: 2, banSignRef: "В27", lit: true, bareVerge: null ,
    terminus: "opens-to-collector", graphLanes: 4, nodes: 3, edges: 2 },
  { id: "pe-slow-v1", crossingY: 85, limitKmh: 40, lengthM: 145,
    roadscape: "residential-clinic", roadClass: "residential", bandM: 0,
    oneway: false, lanes: 2, banSignRef: "В27", lit: false, bareVerge: null ,
    terminus: "closed-by-block", graphLanes: 2, nodes: 2, edges: 1 },
  { id: "pe-rain-v1", crossingY: 95, limitKmh: 50, lengthM: 155,
    roadscape: "industrial-canyon", roadClass: "unclassified", bandM: 0,
    oneway: false, lanes: 2, banSignRef: null, lit: false, bareVerge: "right" ,
    terminus: "bends-away-left", graphLanes: 4, nodes: 3, edges: 2 },
  { id: "pe-dart-v1", crossingY: 80, limitKmh: 50, lengthM: 140,
    roadscape: "residential-blind-corner", roadClass: "residential", bandM: 0,
    oneway: false, lanes: 2, banSignRef: "В24", lit: false, bareVerge: null ,
    terminus: "necks-to-service", graphLanes: 2, nodes: 3, edges: 2 },
  { id: "pe-bus-v1", crossingY: 88, limitKmh: 50, lengthM: 148,
    roadscape: "freight-collector", roadClass: "tertiary", bandM: 0,
    oneway: false, lanes: 2, banSignRef: "В24", lit: true, bareVerge: null ,
    terminus: "bends-away-right", graphLanes: 4, nodes: 3, edges: 2 },
  { id: "pe-child-v1", crossingY: 78, limitKmh: 40, lengthM: 138,
    roadscape: "courtyard-street", roadClass: "residential", bandM: 0,
    oneway: false, lanes: 2, banSignRef: null, lit: false, bareVerge: null ,
    terminus: "opens-to-green", graphLanes: 2, nodes: 2, edges: 1 },
  { id: "pe-cane-v1", crossingY: 92, limitKmh: 50, lengthM: 152,
    roadscape: "oneway-institute", roadClass: "residential", bandM: 0,
    oneway: true, lanes: 1, banSignRef: null, lit: false, bareVerge: null ,
    terminus: "jogs-and-continues", graphLanes: 3, nodes: 4, edges: 3 },
];


/**
 * Right-lane centre, and the ONE number the whole family may not move: all 21
 * committed PE ghost traces are dead-straight rails at exactly this x
 * (measured — min = max = 4.06 on every sample of every trace). It is the
 * two-lane bidirectional offset AND the one-way rightmost-lane offset
 * (`traffic/graph.laneOffsetFor`), which is why pe-cane-v1 could become
 * one-way without re-recording a single trace.
 */
const X_LANE = 4.06;
/** The lane width LessonScene mounts TrafficLayer with (its own default). */
const LANE_W = 3.25 * 2.5;
/** Parked-body half-width, m (traffic/TrafficLayer PARKED_HALF_W_M). */
const PARKED_HALF_W_M = 0.95;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_pe_crossings.mjs) in: ${candidates.join(", ")}`);
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

for (const c of CASES) {
  describe(`${c.id} through the world builder`, () => {
    let raw: unknown;
    let district: District;
    let world: WorldGeometry;

    beforeAll(() => {
      raw = loadRaw(c.id);
      district = assertDistrict(raw);
      world = buildWorldGeometry(district, { seed: 7 });
    });

    it("is a structurally valid district-v1 document (street shape)", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      // doc 87 B50: this used to be `toBe(2)` / `toBe(1)` for all seven, which
      // is precisely the number the founder was reading off the screen. The
      // GRADED street is still edges[0] and still 2 nodes' worth of straight
      // line; what varies is the TERMINUS hanging off pe-n-end.
      expect(district.roads.nodes.length).toBe(c.nodes);
      expect(district.roads.edges.length).toBe(c.edges);
      expect(district.roads.edges[0].id).toBe("pe-e-street");
      expect(district.roads.edges[0].maxspeed).toBe(c.limitKmh);
      expect(district.roads.edges[0].length).toBe(c.lengthM);
      expect((district.meta.scenario as Record<string, unknown>).terminus).toBe(c.terminus);
      // Still zero: every terminus leg hangs off the terminal node in a CHAIN,
      // so every node it adds is degree 2 — a joint, never a junction. This is
      // the assertion that keeps a crossing drill free of a give-way
      // obligation it never teaches (see the generator header).
      expect(district.intersections.length).toBe(0);
      // …and no leg may reach back into the graded street.
      for (const e of district.roads.edges.slice(1)) {
        for (const [, y] of e.geometry) expect(y).toBeGreaterThanOrEqual(c.lengthM);
      }
      expect(district.roundabouts.length).toBe(0);
      expect(district.crossings.map((cr) => cr.id)).toEqual(["pe-x-1"]);
      const cross = district.crossings[0];
      expect(cross.kind).toBe("marked");
      expect(cross.signalized).toBe(false);
      expect(cross.edgeId).toBe("pe-e-street");
      expect(cross.x).toBe(0);
      expect(cross.y).toBe(c.crossingY);
      expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
        "pe-spawn-approach",
        "pe-spawn-finish",
      ]);
    });

    it("paints the zebra and hosts no lights or stop signs", () => {
      expect(world.stats.zebraCrossings).toBe(1);
      expect(world.trafficLights.length).toBe(0);
      expect(world.stats.signs.stop).toBe(0);
      expect(world.stats.signs.giveWay).toBe(0);
    });

    it("builds the CROSS-SECTION its roadscape declares (doc 87 FR-41)", () => {
      const edge = district.roads.edges[0];
      const sc = district.meta.scenario as Record<string, unknown>;
      expect(sc.roadscape).toBe(c.roadscape);
      expect(edge.class).toBe(c.roadClass);
      expect(edge.oneway).toBe(c.oneway);
      // The kerb is where the world draws it: travel lanes + the band.
      expect(edgeParkingWidthM(edge)).toBe(c.bandM);
      expect(edgeHalfWidth(edge)).toBeCloseTo(8.125 + c.bandM, 3);
      expect(sc.curbToCurbM).toBeCloseTo(2 * (8.125 + c.bandM), 2);
      expect(sc.bareVerge ?? null).toBe(c.bareVerge);
      expect(edgeBareVerge(edge)).toBe(c.bareVerge);
      // An arterial class is lit and edge-lined; a residential one is not.
      expect(world.streetlights.length > 0).toBe(c.lit);
      // The ban zone posts a REAL face, not a note in the JSON.
      const banFaces = world.signs.filter(
        (s) => s.kind === "noStopping" || s.kind === "noOvertaking",
      );
      expect(banFaces.length).toBe(c.banSignRef === null ? 0 : 1);
      if (c.banSignRef !== null) {
        expect(banFaces[0].kind).toBe(c.banSignRef === "В27" ? "noStopping" : "noOvertaking");
      }
    });

    it("FR-21 (car half): this street parks nobody on its pavement", () => {
      // The curb pass seats every body at travelHalf + 2.0 m. With no band that
      // is 2 m PAST the kerb — the middle of the 3.5 m footway, which is what he
      // photographed („a car which is standing on the sidewalk"). With the band
      // it is the band's own centre line, i.e. asphalt. Nothing about the pass
      // changes; the KERB moves out from under the row.
      const bodies = computeParkedCars(district as unknown as TrafficDistrict, LANE_W);
      const edge = district.roads.edges[0];
      const kerbAt = edgeHalfWidth(edge);
      if (c.bandM === 0) {
        // `parkingBand: false` — no band is drawn, so nothing is placed. This
        // is the whole of FR-21's car half on this family.
        expect(edge).toMatchObject({ parkingBand: false });
        expect(bodies.length).toBe(0);
        return;
      }
      expect(bodies.length).toBeGreaterThan(5);
      const onFootway = bodies.filter((b) => Math.abs(b.x) - PARKED_HALF_W_M > kerbAt + 1e-6);
      expect(onFootway.map((b) => `(${b.x.toFixed(2)}, ${b.y.toFixed(2)})`)).toEqual([]);
      // …and every body is fully INSIDE the band, not straddling its inner edge.
      const outsideBand = bodies.filter(
        (b) => Math.abs(b.x) - PARKED_HALF_W_M < edgeTravelHalfWidth(edge) - 1e-6,
      );
      expect(outsideBand.length).toBe(0);
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
      expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
        Array.from(world.markings.positions.slice(0, 300)),
      );
    });

    it("the published copy is byte-identical to the content source", () => {
      const srcCandidates = [
        path.join(process.cwd(), "content", "world", `${c.id}.json`),
        path.resolve(process.cwd(), "..", "content", "world", `${c.id}.json`),
      ];
      const src = srcCandidates.find((f) => fs.existsSync(f))!;
      const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", `${c.id}.json`);
      expect(fs.existsSync(pub)).toBe(true);
      expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
    });
  });

  describe(`${c.id} through the world runtime — the crossing-zone chain`, () => {
    let runtime: DistrictWorldRuntime;

    beforeAll(() => {
      runtime = createWorldRuntime(loadRaw(c.id));
    });

    it("derives ZERO signals, stop lines and junction trackers (street by design)", () => {
      expect(runtime.debugSignalClusters().length).toBe(0);
      expect(runtime.debugStopLines().length).toBe(0);
      expect(runtime.debugUncontrolledJunctions().length).toBe(0);
    });

    it("resolves the authored limit everywhere on the street", () => {
      expect(runtime.speedLimitAt({ x: X_LANE, y: 15 })).toBe(c.limitKmh);
      expect(runtime.speedLimitAt({ x: X_LANE, y: c.crossingY + 30 })).toBe(c.limitKmh);
    });

    it("CrossingZoneTracker arms pe-x-1 ~35 m out, tracks the pedestrian flag and fires crossingPassed", () => {
      const rt = createWorldRuntime(loadRaw(c.id));
      let pedOn = false;
      rt.setPedestrianQuery((id) => (id === "pe-x-1" ? pedOn : false));

      const drive = (yFrom: number, yTo: number, t0: number) => {
        const collected: Array<{ y: number; kind: string; flag?: boolean; id?: string }> = [];
        let t = t0;
        for (let y = yFrom; y <= yTo; y += 2) {
          t += 0.2;
          rt.update(0.2);
          const tick = rt.sample(sample(X_LANE, y, 0, 25), t, false);
          for (const e of tick.events) {
            if (e.kind === "crossingZoneEntered" || e.kind === "crossingPassed") {
              collected.push({ y, kind: e.kind, flag: e.pedestrianOnCrossing, id: e.crossingId });
            }
          }
        }
        return collected;
      };

      // Approach with nobody on the crossing: zone arms near d = 35.
      const first = drive(15, c.crossingY - 19, 0);
      const entered = first.find((e) => e.kind === "crossingZoneEntered" && e.id === "pe-x-1");
      expect(entered).toBeDefined();
      expect(entered!.flag).toBe(false);
      expect(Math.abs(c.crossingY - entered!.y - 35)).toBeLessThanOrEqual(4); // ~35 m before the crossing

      // The pedestrian steps on WHILE the vehicle is inside the zone: the
      // contract re-emits the zone event with the flipped flag.
      pedOn = true;
      const second = drive(c.crossingY - 17, c.crossingY - 11, 8);
      const reEmit = second.find((e) => e.kind === "crossingZoneEntered" && e.id === "pe-x-1");
      expect(reEmit).toBeDefined();
      expect(reEmit!.flag).toBe(true);

      // She clears; passing over the crossing fires crossingPassed(false) —
      // exactly what the reducer turns into PEDESTRIAN_YIELDED after a slow-down.
      pedOn = false;
      const third = drive(c.crossingY - 9, c.crossingY + 11, 12);
      const passed = third.find((e) => e.kind === "crossingPassed" && e.id === "pe-x-1");
      expect(passed).toBeDefined();
      expect(passed!.flag).toBe(false);
    });
  });

  describe(`${c.id} through the traffic lane graph + system`, () => {
    let raw: TrafficDistrict;

    beforeAll(() => {
      raw = loadRaw(c.id) as TrafficDistrict;
    });

    it("builds the lane graph its roadscape implies, with the crossing on every lane", () => {
      const graph = buildLaneGraph(raw, {
        laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
        excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
        crossingSignalRadiusM: 45,
      });
      // A two-way street has both directions; a ONE-WAY street has one, and
      // `traffic/graph.laneOffsetFor` puts that single lane on the rightmost
      // lane centre — x = 4.06, the very rail every committed trace drives.
      // The GRADED street's lanes are `c.lanes`; the terminus legs bring the
      // district total to `c.graphLanes` (0 extra on the two frontage-only
      // termini, and none at all on the service alley — `service` is in
      // DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses, so no ambient car uses it).
      expect(graph.lanes.length).toBe(c.graphLanes);
      // Loop lanes = the lanes an ambient car can drive round for ever. On a
      // two-way street every lane loops (out and back), so the count matches;
      // on the ONE-WAY district the whole chain is one directed run, so it is
      // the street's own single lane. Pinned rather than skipped: this is the
      // number that decides whether ambient traffic exists on a terminus leg.
      expect(graph.loopLanes.size).toBe(c.oneway ? c.lanes : c.graphLanes);
      // The crossing is on the STREET's lanes only — a terminus never touches it.
      expect(graph.crossingLanes.get("pe-x-1")?.length).toBe(c.lanes);
      expect(graph.crossingSignalNode.size).toBe(0); // unsignalized zebra
      const driven = graph.lanes.find((l) => l.px.every((x) => Math.abs(x - X_LANE) < 0.01));
      expect(driven, "the recorded ghost rail must still be a lane centre").toBeDefined();
    });

    it("a STAGED pedestrian's road span drives pedestrianOnCrossing (the dart-out chain)", () => {
      const traffic = createTrafficSystem(raw, {
        seed: 3,
        vehicleCount: 0,
        pedestrianCount: 0,
        anchor: { x: X_LANE, y: 15 },
        anchorRadiusM: 400,
      });
      // West curb → across the 16.25 m carriageway → east walk-out (the same
      // geometry the PE templates stage at pe-x-1).
      const staged = traffic.stage({
        kind: "pedestrian",
        id: "pe-test-ped",
        path: [
          { x: -9.73, y: c.crossingY },
          { x: 13.73, y: c.crossingY },
        ],
        speedMps: 1.4,
        crossingId: "pe-x-1",
        roadFromM: 1.6,
        roadToM: 17.85,
      });
      expect(staged).not.toBeNull();
      expect(traffic.pedestrianOnCrossing("pe-x-1")).toBe(false);

      traffic.stagedCommand("pe-test-ped", { type: "cruise" });
      const onFlags: boolean[] = [];
      for (let i = 0; i < 60 * 18; i++) {
        traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
        if (i % 30 === 0) onFlags.push(traffic.pedestrianOnCrossing("pe-x-1"));
      }
      // Off the road at the start, ON while walking the span, off after.
      expect(onFlags[0]).toBe(false);
      expect(onFlags).toContain(true);
      expect(onFlags[onFlags.length - 1]).toBe(false);
      expect(traffic.staged("pe-test-ped")!.finished).toBe(true);
    });
  });
}

// ---------------------------------------------------------------------------
// THE FAMILY — doc 87 FR-41 / B50 / B53: the sequence is the defect
// ---------------------------------------------------------------------------
//
// Catalog positions 24–30 are seven consecutive lessons on these seven maps.
// Every per-district block above passed while all seven were the same street,
// which is precisely why this section exists: a per-district battery cannot see
// a sequence. Everything here reads the SHIPPED JSON, not the generator.

describe("the PE family is seven DIFFERENT streets (doc 87 FR-41)", () => {
  const built = CASES.map((c) => {
    const district = assertDistrict(loadRaw(c.id));
    return { c, district, world: buildWorldGeometry(district, { seed: 7 }) };
  });

  it("no two districts share a roadscape", () => {
    const scapes = built.map((b) => (b.district.meta.scenario as Record<string, unknown>).roadscape);
    expect(new Set(scapes).size).toBe(built.length);
  });

  it("no two districts share a TERMINUS — nothing runs dead straight to a flat horizon", () => {
    // doc 87 B50/B53/B54. The re-look's own words about the state BEFORE this
    // axis: „every one of the seven is 2 nodes / 1 edge / 0 intersections / 1
    // crossing, 138-160 m, dead straight to a flat horizon". Both halves are
    // asserted here: the NAME must be unique, and the SHAPE must actually
    // differ — a terminus that adds no road and no vista is a copy with a new
    // label on it.
    const ends = built.map((b) => (b.district.meta.scenario as Record<string, unknown>).terminus);
    expect(new Set(ends).size).toBe(built.length);

    // Every street ends in SOMETHING: either real road past the terminal node,
    // or frontage standing in the vista beyond it. Never nothing.
    for (const b of built) {
      const L = b.district.roads.edges[0].length;
      const legRoadM = b.district.roads.edges
        .slice(1)
        .reduce((s, e) => s + e.length, 0);
      const vistaVolumes = b.district.buildings.filter((bl) =>
        bl.footprint.some(([, y]) => y > L),
      ).length;
      expect(
        legRoadM > 60 || vistaVolumes >= 2,
        `${b.c.id} (${(b.district.meta.scenario as Record<string, unknown>).terminus}) ends in nothing: ` +
          `${legRoadM.toFixed(1)} m of leg, ${vistaVolumes} vista volumes`,
      ).toBe(true);
    }

    // The TOPOLOGY the founder was reading off the screen — 2 nodes / 1 edge,
    // seven times — is no longer one number.
    const shapes = new Set(built.map((b) => `${b.district.roads.nodes.length}/${b.district.roads.edges.length}`));
    expect(shapes.size).toBeGreaterThanOrEqual(3);
    // Four of the seven carry real extra road; the other three close the vista
    // with frontage. Both answers are legitimate; all seven being the same is not.
    const withLegs = built.filter((b) => b.district.roads.edges.length > 1).length;
    expect(withLegs).toBeGreaterThanOrEqual(3);
    expect(withLegs).toBeLessThan(built.length);
  });

  it("a terminus never touches the graded street, on any of the seven", () => {
    // The whole axis is only free because it lives north of the terminal node.
    // If that ever stops being true, 21 recorded ghost traces silently rot.
    for (const b of built) {
      const L = b.district.roads.edges[0].length;
      for (const e of b.district.roads.edges.slice(1)) {
        for (const [, y] of e.geometry) {
          expect(y, `${b.c.id}: ${e.id} reaches back into the graded street`).toBeGreaterThanOrEqual(L);
        }
      }
      // …and no leg may park a body (FR-21: this family carries none at all).
      for (const e of b.district.roads.edges.slice(1)) {
        expect(e.parkingBand, `${b.c.id}: ${e.id} must declare parkingBand:false`).toBe(false);
      }
    }
  });

  it("no two districts share a CROSS-SECTION signature", () => {
    // The signature is what a driver reads from the seat in the first second:
    // how wide the asphalt is, whether it is lit and edge-lined, whether there
    // is a parked row, which way the traffic runs, and what is posted.
    const sig = built.map((b) => {
      const e = b.district.roads.edges[0];
      const bodies = computeParkedCars(b.district as unknown as TrafficDistrict, LANE_W);
      return [
        `class=${e.class}`,
        `curb2curb=${(2 * edgeHalfWidth(e)).toFixed(2)}`,
        `oneway=${e.oneway}`,
        `lit=${b.world.streetlights.length > 0}`,
        `verge=${edgeBareVerge(e) ?? "both-paved"}`,
        `parked=${bodies.length > 0}`,
        `ban=${
          b.world.signs
            .filter((s) => s.kind === "noStopping" || s.kind === "noOvertaking")
            .map((s) => s.kind)
            .sort()
            .join("+") || "none"
        }`,
      ].join(" ");
    });
    // Duplicates, reported as pairs so the failure names the two lessons.
    const dupes: string[] = [];
    for (let i = 0; i < sig.length; i++) {
      for (let j = i + 1; j < sig.length; j++) {
        if (sig[i] === sig[j]) dupes.push(`${CASES[i].id} == ${CASES[j].id}: ${sig[i]}`);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("the family really does span the levers, not just permute one", () => {
    const classes = new Set(built.map((b) => b.district.roads.edges[0].class));
    const widths = new Set(built.map((b) => (2 * edgeHalfWidth(b.district.roads.edges[0])).toFixed(2)));
    const lit = built.filter((b) => b.world.streetlights.length > 0).length;
    const oneways = built.filter((b) => b.district.roads.edges[0].oneway).length;
    const banFaces = built.filter((b) =>
      b.world.signs.some((s) => s.kind === "noStopping" || s.kind === "noOvertaking"),
    ).length;
    const bare = built.filter(
      (b) => computeParkedCars(b.district as unknown as TrafficDistrict, LANE_W).length === 0,
    ).length;

    // tertiary + residential + unclassified — the class is what decides edge
    // lines, lamp columns and priority rank.  is deliberately
    // NOT used: it would claim a жилищна зона (чл. 62-63 pedestrian priority on
    // the whole carriageway) on a street posted 40 km/h — see the generator.
    expect(classes.size).toBeGreaterThanOrEqual(3);
    // Curb-to-curb is deliberately ONE value across the family: see the
    // generator header, lever 3 — widening these streets re-times two tuned
    // drills (s3-pe-bot-completion drops them 3 stars → 1), so the width lever
    // belongs to whoever re-tunes them, not to the map pass.
    expect(widths.size).toBe(1);
    expect(lit).toBeGreaterThanOrEqual(2); // the two collectors carry lamp columns
    expect(lit).toBeLessThan(built.length); // …and the rest deliberately do not
    expect(oneways).toBe(1); // exactly one one-way street
    expect(banFaces).toBe(4); // two В27 + two В24, posted faces not tags
    // FR-21: none of the seven parks a body on its pavement any more, and the
    // way it is closed here is by not placing one at all.
    expect(bare).toBe(built.length);
    // …and one street has no pavement on one side at all.
    expect(built.filter((b) => edgeBareVerge(b.district.roads.edges[0]) !== null).length).toBe(1);
  });


  it("FR-21 — not one parked body in the whole family stands on a footway", () => {
    const offenders: string[] = [];
    for (const b of built) {
      const edge = b.district.roads.edges[0];
      const kerbAt = edgeHalfWidth(edge);
      for (const body of computeParkedCars(b.district as unknown as TrafficDistrict, LANE_W)) {
        if (Math.abs(body.x) - PARKED_HALF_W_M > kerbAt + 1e-6) {
          offenders.push(
            `${b.c.id}: body (${body.x.toFixed(2)}, ${body.y.toFixed(2)}) is ` +
              `${(Math.abs(body.x) - PARKED_HALF_W_M - kerbAt).toFixed(2)} m past the kerb`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("and every recorded ghost rail is still a lane centre", () => {
    // The whole variety pass is worthless if it silently invalidates the 21
    // committed traces. x = 4.06 on every sample of every PE trace — measured.
    for (const b of built) {
      const graph = buildLaneGraph(b.district as unknown as TrafficDistrict, {
        laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
        excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
        crossingSignalRadiusM: 45,
      });
      const hit = graph.lanes.some((l) => l.px.every((x) => Math.abs(x - X_LANE) < 0.01));
      expect(hit, `${b.c.id} moved the ghost rail`).toBe(true);
    }
  });
});
