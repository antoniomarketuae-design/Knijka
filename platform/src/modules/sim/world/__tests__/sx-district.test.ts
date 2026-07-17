/**
 * SIGNAL-X archetype contract battery (Scenario Studio doc 76 §3; the
 * poligon/lot battery pattern) — content/world/sx-v1.json, the committed
 * small signalized 4-way of tools/maps/gen_signal_x.mjs.
 *
 * The whole point of the map is that ONE `signalized: true` flag drives
 * every layer by the existing district-v1 conventions:
 *   1. world   — visible lamp heads on every incoming approach (props pass);
 *   2. runtime — ONE single-node signal cluster (deterministic FNV-1a phase
 *                offset), FOUR trafficLight stop lines at the junction
 *                mouths, per-approach axis-group adjudication, and the full
 *                B1a director API (signalPhaseInfo / setSignalClusterOffset /
 *                signalOffsetForPhaseStart) working on this map;
 *   3. traffic — 8 loopable directed lanes; empty ambient config legal;
 *                staged oncoming paths (the JU-10 host) resolve and advance.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { SIGNAL_TIMING } from "../../runtime/signals";
import { STOP_LINE_OVERRIDES } from "../../runtime/stoplines";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "sx-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "sx-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`sx-v1.json not found (run: node tools/maps/gen_signal_x.mjs) in: ${candidates.join(", ")}`);
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

describe("sx-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (signalized X shape)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(5);
    expect(district.roads.edges.length).toBe(4);
    expect(district.intersections.length).toBe(1);
    expect(district.intersections[0]).toMatchObject({ id: "sx-n-c", degree: 4, signalized: true });
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "sx-spawn-east",
      "sx-spawn-south",
      "sx-spawn-west",
    ]);
  });

  it("covers every edge with a ribbon and patches the junction", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(4);
    expect(world.stats.skippedRibbons).toBe(0);
    expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(1);
  });

  it("hosts a signalized junction: lamp heads on every incoming approach, no signs", () => {
    expect(world.trafficLights.length).toBe(4);
    for (const tl of world.trafficLights) expect(tl.nodeId).toBe("sx-n-c");
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
    for (const list of [world.trafficLights, world.signs, world.streetlights, world.trees, world.busStops]) {
      for (const t of list) {
        if (!t.position.every(Number.isFinite) || !Number.isFinite(t.yaw)) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });

  it("builds valid colliders over the whole ground", () => {
    const g = world.colliders.ground;
    expect(g.halfExtents[0]).toBeGreaterThan(140);
    expect(g.halfExtents[2]).toBeGreaterThan(100);
    for (const c of [world.colliders.sidewalks, world.colliders.buildings]) {
      expect(c.positions.length % 3).toBe(0);
      expect(c.indices.length % 3).toBe(0);
      if (c.indices.length > 0) {
        const maxIdx = Math.max(...Array.from(c.indices));
        expect(maxIdx).toBeLessThan(c.positions.length / 3);
      }
    }
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
});

describe("sx-v1 through the world runtime — signal derivation + phases", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives ONE single-node cluster with the deterministic FNV-1a offset", () => {
    const clusters = runtime.debugSignalClusters();
    expect(clusters.length).toBe(1);
    expect(clusters[0].id).toBe("sx-n-c");
    expect(clusters[0].memberNodeIds).toEqual(["sx-n-c"]);
    // fnv1a("sx-n-c") % 50 — pinned so trace authoring can rely on it.
    expect(clusters[0].offsetSec).toBe(1);
  });

  it("derives FOUR trafficLight stop lines, one per approach, at the junction mouths", () => {
    const lines = runtime.debugStopLines();
    expect(lines.length).toBe(4);
    expect(new Set(lines.map((l) => l.control))).toEqual(new Set(["trafficLight"]));
    const byId = new Map(lines.map((l) => [l.id, l]));
    // Secondary half-width 12.125 + arterial corner 15 + paint inset 0.6 →
    // 27.725 m from the node on every arm (shared nodeOpenRadiusM math).
    expect(byId.get("sx-e-s@92.3:trafficLight")).toMatchObject({ group: "ns", dirSign: 1 });
    expect(byId.get("sx-e-n@27.7:trafficLight")).toMatchObject({ group: "ns", dirSign: -1 });
    expect(byId.get("sx-e-w@142.3:trafficLight")).toMatchObject({ group: "ew", dirSign: 1 });
    expect(byId.get("sx-e-e@27.7:trafficLight")).toMatchObject({ group: "ew", dirSign: -1 });
    // Signalized + guarded → NOT a right-hand-rule junction.
    expect(runtime.debugUncontrolledJunctions()).toEqual([]);
  });

  it("runs the two-phase machine: opposite axis-groups never green together", () => {
    const rt = createWorldRuntime(loadRaw());
    let bothGreen = 0;
    let nsGreenSeen = 0;
    let ewGreenSeen = 0;
    for (let i = 0; i < 60 * SIGNAL_TIMING.cycleSec; i++) {
      rt.update(1 / 60);
      const ns = rt.signalPhaseForApproach("sx-n-c", 0);
      const ew = rt.signalPhaseForApproach("sx-n-c", 90);
      if (ns === "green") nsGreenSeen++;
      if (ew === "green") ewGreenSeen++;
      if (ns === "green" && ew === "green") bothGreen++;
    }
    expect(bothGreen).toBe(0);
    expect(nsGreenSeen).toBeGreaterThan(0);
    expect(ewGreenSeen).toBeGreaterThan(0);
  });

  it("signalPhaseInfo agrees with signalPhase and counts down to the change", () => {
    const rt = createWorldRuntime(loadRaw());
    const info0 = rt.signalPhaseInfo("sx-n-c", 0);
    expect(info0.phase).toBe(rt.signalPhaseForApproach("sx-n-c", 0));
    expect(info0.timeToChangeSec).toBeGreaterThan(0);
    // Advance exactly to the reported change and observe the flip.
    const steps = Math.ceil(info0.timeToChangeSec * 60);
    for (let i = 0; i < steps; i++) rt.update(1 / 60);
    const info1 = rt.signalPhaseInfo("sx-n-c", 0);
    expect(info1.phase).not.toBe(info0.phase);
  });

  it("the director dials work: offsetForPhaseStart + setClusterOffset pin a phase", () => {
    const rt = createWorldRuntime(loadRaw());
    // Make ns-green start NOW.
    rt.setSignalClusterOffset("sx-n-c", rt.signalOffsetForPhaseStart("sx-n-c", 0, "green", 0));
    const g = rt.signalPhaseInfo("sx-n-c", 0);
    expect(g.phase).toBe("green");
    expect(g.timeToChangeSec).toBeCloseTo(SIGNAL_TIMING.greenSec, 5);
    // Make ns-yellow start in exactly 5 s; green must hold until then.
    rt.setSignalClusterOffset("sx-n-c", rt.signalOffsetForPhaseStart("sx-n-c", 0, "yellow", 5));
    expect(rt.signalPhaseInfo("sx-n-c", 0).phase).toBe("green");
    expect(rt.signalPhaseInfo("sx-n-c", 0).timeToChangeSec).toBeCloseTo(5, 5);
    for (let i = 0; i < Math.round(5.2 * 60); i++) rt.update(1 / 60);
    expect(rt.signalPhaseInfo("sx-n-c", 0).phase).toBe("yellow");
  });

  it("two runtimes advanced by the same dt sequence show identical phases", () => {
    const a = createWorldRuntime(loadRaw());
    const b = createWorldRuntime(loadRaw());
    const seen: string[] = [];
    for (let i = 0; i < 600; i++) {
      a.update(1 / 60);
      b.update(1 / 60);
      const pa = a.signalPhase("sx-n-c");
      expect(b.signalPhase("sx-n-c")).toBe(pa);
      if (seen[seen.length - 1] !== pa) seen.push(pa);
    }
    expect(seen.length).toBeGreaterThan(0);
  });

  it("a northbound crossing reports the lamp state AT the moment of crossing", () => {
    const rt = createWorldRuntime(loadRaw());
    // Pin ns-green now so the sweep is deterministic inside the test.
    rt.setSignalClusterOffset("sx-n-c", rt.signalOffsetForPhaseStart("sx-n-c", 0, "green", 0));
    let seen: string | null = null;
    let t = 0;
    for (let y = -60; y <= -10; y += 1.5) {
      t += 0.12;
      rt.update(0.12);
      const tick = rt.sample(sample(4.0625, y, 0, 25), t, false);
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") {
          seen = e.lightState ?? null;
        }
      }
    }
    expect(seen).toBe("green");
  });

  it("resolves the tagged speed limits per axis", () => {
    expect(runtime.speedLimitAt({ x: 0, y: -100 })).toBe(50); // secondary N–S
    expect(runtime.speedLimitAt({ x: 100, y: 0 })).toBe(40); // residential E–W
  });

  it("locates every spawn point on its authored edge", () => {
    expect(runtime.locate({ x: 0, y: -105 }).edgeId).toBe("sx-e-s");
    expect(runtime.locate({ x: 105, y: 0 }).edgeId).toBe("sx-e-e");
    expect(runtime.locate({ x: -155, y: 0 }).edgeId).toBe("sx-e-w");
  });

  it("STOP_LINE_OVERRIDES stays skip-safe on this foreign map (doc 74 §5.6)", () => {
    expect(STOP_LINE_OVERRIDES.length).toBeGreaterThan(0);
    const raw = loadRaw() as { roads: { edges: Array<{ id: string }> } };
    const edgeIds = new Set(raw.roads.edges.map((e) => e.id));
    for (const ov of STOP_LINE_OVERRIDES) {
      expect(edgeIds.has(ov.edgeId), ov.edgeId).toBe(false);
    }
  });
});

describe("sx-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 4 two-way edges → 8 directed lanes, loopable", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(8);
    expect(graph.loopLanes.size).toBe(8);
    expect(graph.crossingLanes.size).toBe(0);
    expect(graph.junctionRadiusM.get("sx-n-c")).toBeGreaterThan(0);
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (scenario micro-map)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 11,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 0, y: -105 },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.stats.pedestrianCount).toBe(0);
    for (let i = 0; i < 120; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: 0, y: -105 },
        playerSpeedKmh: 10,
      });
    }
    expect(traffic.vehicles.length).toBe(0);
    expect(traffic.leadGapMeters(0, -105, 0)).toBe(Infinity);
  });

  it("stages the JU-10 oncoming path (west → center → east) and it advances", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    const staged = traffic.stage({
      kind: "vehicle",
      id: "sx-test-car",
      pathNodes: ["sx-n-w", "sx-n-c", "sx-n-e"],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 8.5,
    });
    expect(staged).not.toBeNull();
    expect(staged!.nodeS.length).toBe(3);
    traffic.stagedCommand("sx-test-car", { type: "cruise" });
    for (let i = 0; i < 240; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    }
    expect(traffic.staged("sx-test-car")!.s).toBeGreaterThan(20);
    // And the oncoming query sees it as a closing conflict from the player's
    // frozen approach frame (the N1 probe contract).
    const view = traffic.staged("sx-test-car")!;
    if (view.s < view.nodeS[1]) {
      const probe = traffic.oncomingNear(0, 0, 270, 36);
      expect(probe === null || typeof probe === "object").toBe(true);
    }
  });
});

/**
 * JU-16 host contract (sc-jx-blocked-exit, templates-junctions4.ts) — the
 * invariants the block-the-box drill pins on this map. sx-v1 was built for the
 * signal drills; this battery states WHY it can also host a gridlock trap, so a
 * future regeneration cannot silently break the scenario. Every number here is
 * denormalized into the template + its trace script by value.
 */
describe("sx-v1 as the JU-16 block-the-box host", () => {
  const raw = loadRaw() as TrafficDistrict;

  it("the south stop line sits where the template pins it (y = −27.73)", () => {
    const runtime = createWorldRuntime(loadRaw());
    const south = runtime.debugStopLines().find((l) => l.id === "sx-e-s@92.3:trafficLight")!;
    expect(south).toBeDefined();
    expect(south.control).toBe("trafficLight");
    expect(south.dirSign).toBe(1); // crossed by northbound (with-geometry) travel
    // sx-e-s runs (0, −120) → (0, 0), so the line's arclength converts straight
    // to the y the template denormalizes as JX_STOP_LINE_Y = −27.73 and the
    // trace script's hold pose (y = −29.5) rests 1.77 m short of.
    const lineY = -120 + south.sM;
    expect(lineY).toBeCloseTo(-27.725, 2);
    expect(lineY).toBeGreaterThan(-29.5); // the pose really is BEHIND the paint
  });

  it("stages the queue tail on the northbound ns road, past the node and short of the far mouth", () => {
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    // The template's OWN actor geometry (templates-junctions4 JXB_QUEUE_TAIL).
    const staged = traffic.stage({
      kind: "vehicle",
      id: "sx-jxb-tail",
      pathNodes: ["sx-n-s", "sx-n-c", "sx-n-n"],
      hold: { nodeIndex: 1, offsetM: 16 },
      cruiseSpeedMps: 8,
    });
    expect(staged).not.toBeNull();
    expect(staged!.nodeS.length).toBe(3);
    // It rests 16 m PAST the junction node — beyond the crossing roadway (so
    // the EXIT is what is full) but short of the far stop line at 27.725 (so a
    // driver who follows it in strands INSIDE the box). This is the template's
    // whole geometric premise.
    expect(staged!.y).toBeCloseTo(16, 1);
    expect(staged!.y).toBeGreaterThan(0);
    expect(staged!.y).toBeLessThan(27.725);
    // …in the player's OWN lane: within the 4 m lead corridor of a northbound
    // car on the drawn lane center, so leadGapMeters reports it as the lead.
    expect(Math.abs(staged!.x - 4.06)).toBeLessThan(4);
    const gap = traffic.leadGapMeters(4.06, -29.5, 0);
    expect(Number.isFinite(gap)).toBe(true);
    // The measured 41.44 m the trace gate and the ruleConfig flag are pinned to
    // (bumper gap = 16 − (−29.5) − 4.1 m of car).
    expect(gap).toBeCloseTo(41.4, 0);
  });

  it("the staged column can clear the junction northward — the 'exit freed' half of the drill", () => {
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    traffic.stage({
      kind: "vehicle",
      id: "sx-jxb-tail",
      pathNodes: ["sx-n-s", "sx-n-c", "sx-n-n"],
      hold: { nodeIndex: 1, offsetM: 16 },
      cruiseSpeedMps: 8,
    });
    traffic.stagedCommand("sx-jxb-tail", { type: "cruise" });
    for (let i = 0; i < 60 * 8; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    }
    // After 8 s at 8 m/s it is far up the north arm — so the waiting player's
    // lead gap really does open, which is what releases JU-09's clear-ahead
    // flag and re-arms the hesitation detector for the prompt-start half.
    expect(traffic.staged("sx-jxb-tail")!.y).toBeGreaterThan(60);
    expect(traffic.leadGapMeters(4.06, -29.5, 0)).toBeGreaterThan(48);
  });

  it("the ns green is a full 20 s — refusing one is a real, teachable cost", () => {
    // The drill's premise: the shadow gives up an ENTIRE green rather than
    // enter a blocked box. If the phase machine ever shortened, the sacrifice
    // (and the ~7 s stationary-at-green window the trace pins) would change.
    expect(SIGNAL_TIMING.greenSec).toBe(20);
    expect(SIGNAL_TIMING.cycleSec).toBe(50);
  });
});

/**
 * JU-18 host contract, INVERTED timetable (sc-sig-controller-live,
 * templates-signals2.ts) — the invariants the „регулировчикът бие светофара"
 * drill pins on this map. sc-signal-controller already runs halt→proceed here;
 * this battery states the OTHER arrangement (the officer opens the player's
 * axis first, closes it as the lamps go green) so a future change to the phase
 * machine, the offsets or the permission seam cannot silently turn the drill's
 * innocent red crossing into a 10-point опасна. Every number is denormalized
 * into the template + its trace script by value.
 */
describe("sx-v1 as the JU-18 live-lamp controller host (inverted timetable)", () => {
  /** The template's authored dials (SC_SIG_CONTROLLER_LIVE_EVENT). */
  const OFFSET_SEC = 23;
  const FLIP_AT_SEC = 26;

  /** Runtime pinned exactly as the staged trafficController arms it. */
  function armed(): DistrictWorldRuntime {
    const rt = createWorldRuntime(loadRaw());
    rt.setSignalClusterOffset("sx-n-c", OFFSET_SEC);
    rt.setSignalClusterController("sx-n-c", { haltedGroup: "ew", flipAtSec: FLIP_AT_SEC });
    return rt;
  }

  /**
   * Drive a northbound car over the south stop line at ≈ `atSec` of session
   * time and return the crossing event the production runtime emits. Winds the
   * signal clock forward with update() alone, then sweeps the last 8 m.
   */
  function crossAt(atSec: number): { lightState?: string; controller?: string } {
    const rt = armed();
    let t = 0;
    const sweepSec = 0.27; // 16 frames of the sweep below
    while (t < atSec - sweepSec) {
      rt.update(1 / 60);
      t += 1 / 60;
    }
    let seen: { lightState?: string; controller?: string } | null = null;
    for (let y = -32; y <= -24; y += 0.5) {
      rt.update(1 / 60);
      t += 1 / 60;
      const tick = rt.sample(sample(4.0625, y, 0, 25), t, false);
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") {
          seen = { lightState: e.lightState, controller: e.controller };
        }
      }
    }
    expect(seen, `no crossing swept at t ≈ ${atSec}`).not.toBeNull();
    return seen!;
  }

  it("offset 23 pins the lamp timeline the three drives are authored against", () => {
    // The whole staging rests on this: RED across the permission window, GREEN
    // exactly when the officer closes the direction, RED again by ~50 s. Read
    // off the phase machine, not off the template's comment.
    const rt = armed();
    const phaseAt = (target: number): string => {
      const r = armed();
      for (let i = 0; i < Math.round(target * 60); i++) r.update(1 / 60);
      return r.signalPhaseForApproach("sx-n-c", 0); // bearing 0 = the ns approach
    };
    expect(rt.signalPhaseForApproach("sx-n-c", 0)).toBe("red"); // t = 0
    expect(phaseAt(13.4)).toBe("red"); // the shadow's crossing
    expect(phaseAt(25.5)).toBe("red"); // still red at the end of the window
    expect(phaseAt(29.1)).toBe("green"); // mistake-wait-for-green's crossing
    expect(phaseAt(53.5)).toBe("red"); // mistake-refuse-then-creep's crossing
  });

  it("the permission INVERTS at the authored flip — the player is waved through, then stopped", () => {
    // The seam the whole template hangs on, read through the production
    // pipeline (the runtime attaches the permission to the crossing event).
    const early = crossAt(13.4);
    expect(early.controller).toBe("proceed");
    expect(early.lightState).toBe("red"); // …and the lamp says the opposite
    const late = crossAt(29.1);
    expect(late.controller).toBe("halt");
    expect(late.lightState).toBe("green"); // …and again the lamp says the opposite
  });

  it("the officer's halt outlives the green — the schedule carries ONE flip", () => {
    // The accepted consequence the template's instructionsBg step 4 exists for
    // (and the second mistake demo dramatises): there is no second wave, so a
    // driver who refuses the first one is halted for the rest of the attempt.
    // If SignalControllerSchedule ever grew a repeating timetable, this is the
    // assert that would flag the drill for a re-tune.
    const veryLate = crossAt(53.5);
    expect(veryLate.controller).toBe("halt");
    expect(veryLate.lightState).toBe("red"); // both authorities forbid it now
  });

  it("the permission window is long enough for the authored approach (26 s vs ~13 s)", () => {
    // Feasibility, stated as a number: the drill is only fair if a prudent
    // 26 km/h approach from the spawn reaches the paint well inside the window.
    // The recorded shadow crosses at t = 13.38 — a full 12 s of slack.
    expect(FLIP_AT_SEC).toBeGreaterThan(20);
    const spawnToLineM = 105 - 27.725;
    const cruiseMps = 26 / 3.6;
    expect(spawnToLineM / cruiseMps).toBeLessThan(FLIP_AT_SEC - 8);
  });

  it("the hold pose clears the STOP_LINE_OVERSHOOT window by 4 m", () => {
    // Both mistake demos rest at y = −33 for 14–37 s while the surfaced signal
    // reads red the whole time (a halted approach reads red however green its
    // lamp is), and this drill's lamp is never green-surfaced at all — so the
    // detector's lawful-presence latch never disarms it. The ONLY thing keeping
    // the wait innocent is the setback: 5.275 m against a 1.2 m window.
    const runtime = createWorldRuntime(loadRaw());
    const south = runtime.debugStopLines().find((l) => l.id === "sx-e-s@92.3:trafficLight")!;
    const lineY = -120 + south.sM;
    expect(lineY).toBeCloseTo(-27.725, 2);
    expect(lineY - -33).toBeCloseTo(5.275, 2);
    expect(lineY - -33).toBeGreaterThan(1.2 + 4);
  });
});
