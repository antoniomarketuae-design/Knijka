/**
 * Staged-actor tests — the A8 stage()/stagedCommand()/staged() seam against
 * the REAL district lane graph (path resolution) and the square fixture
 * (behavior commands), plus determinism of the scripted update path.
 */

import { describe, expect, it } from "vitest";
import { createTrafficSystem } from "../system";
import type { StagedVehicleSpec, TrafficSystem, TrafficUpdateContext } from "../types";
import { loadRealDistrict, makeSquareDistrict } from "./fixtures";

const DT = 1 / 60;

function ctx(player?: { x: number; y: number; speedKmh?: number; headingDeg?: number }): TrafficUpdateContext {
  return {
    signalPhase: () => "green",
    playerPos: player ? { x: player.x, y: player.y } : null,
    playerSpeedKmh: player?.speedKmh,
    playerHeadingDeg: player?.headingDeg,
  };
}

function run(system: TrafficSystem, seconds: number, c: TrafficUpdateContext): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) system.update(DT, c);
}

/** Square loop A(0,0)->B(300,0)->C(300,300)->D(0,300)->A (oneway, 2 lanes). */
function squareSystem(): TrafficSystem {
  return createTrafficSystem(makeSquareDistrict({ crossingOnAB: true }), {
    seed: 5,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
}

const SQUARE_CAR: StagedVehicleSpec = {
  kind: "vehicle",
  id: "car-1",
  pathNodes: ["A", "B", "C"],
  hold: { nodeIndex: 0, offsetM: 50 },
  cruiseSpeedMps: 10,
};

describe("staged actor staging", () => {
  it("resolves a real-district node path with monotonic node arcs", () => {
    const system = createTrafficSystem(loadRealDistrict(), {
      seed: 1,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    // The L2 staged car's actual path (secondary arterial, 6 nodes).
    const view = system.stage({
      kind: "vehicle",
      id: "l2-car",
      pathNodes: [
        "n1113186267",
        "n5063751788",
        "n9601848047",
        "n6294463135",
        "n1805512602",
        "n330851787",
      ],
      hold: { nodeIndex: 1, offsetM: -75 },
      cruiseSpeedMps: 8.5,
    });
    expect(view).not.toBeNull();
    const nodeS = view!.nodeS;
    expect(nodeS).toHaveLength(6);
    for (let i = 1; i < nodeS.length; i++) expect(nodeS[i]).toBeGreaterThan(nodeS[i - 1]);
    // Hold pose: 75 m before the junction node arc.
    expect(view!.s).toBeCloseTo(nodeS[1] - 75, 6);
    // Published into the shared state array (render + queries see it).
    expect(system.vehicles.some((v) => v.x === view!.x && v.y === view!.y)).toBe(true);
    // Dormant until commanded.
    run(system, 1, ctx());
    expect(view!.speedMps).toBe(0);
  });

  it("rejects unknown ids, duplicate ids and unconnected node paths", () => {
    const system = squareSystem();
    expect(
      system.stage({ ...SQUARE_CAR, id: "bad", pathNodes: ["A", "C"] }), // no direct lane A->C
    ).toBeNull();
    expect(system.stage(SQUARE_CAR)).not.toBeNull();
    expect(system.stage(SQUARE_CAR)).toBeNull(); // duplicate id
    expect(system.staged("nope")).toBeNull();
  });
});

describe("staged vehicle commands", () => {
  it("cruise follows the path at the commanded speed and finishes at the end", () => {
    const system = squareSystem();
    const view = system.stage(SQUARE_CAR)!;
    system.stagedCommand("car-1", { type: "cruise" });
    run(system, 5, ctx()); // 0→10 m/s takes ~3.9 s at the 2.6 m/s² default
    expect(view.speedMps).toBeCloseTo(10, 1);
    const sAfter5 = view.s;
    expect(sAfter5).toBeGreaterThan(50 + 25);
    // Runs through B (s=300) onto BC and latches `finished` ON the path end
    // (600). Stepped a frame at a time and caught at the latch, because that is
    // the frame every runner in runners.ts reads it on; FR-B5-RETURN un-latches
    // it again once the retirement run has cleared, so a probe 60 s later would
    // be asking a different question and getting a different actor.
    let latchedAtArc = -1;
    for (let i = 0; i < Math.round(60 / DT) && latchedAtArc < 0; i++) {
      const wasFinished = view.finished;
      system.update(DT, ctx());
      if (!wasFinished && view.finished) latchedAtArc = view.s;
    }
    expect(latchedAtArc).toBeCloseTo(view.pathLengthM, 6);
  });

  it("matchPlayer holds the commanded gap ahead of a moving player", () => {
    const system = squareSystem();
    const view = system.stage(SQUARE_CAR)!;
    system.stagedCommand("car-1", { type: "matchPlayer", gapM: 25, maxSpeedMps: 20 });
    // Player drives east along AB IN-LANE (lane center is offset ~4.06 m
    // right of the geometry = y ≈ -4) at 10 m/s, starting 30 m behind.
    let px = 20;
    for (let i = 0; i < 60 * 12; i++) {
      px += 10 * DT;
      system.update(DT, ctx({ x: px, y: -4.06, speedKmh: 36, headingDeg: 90 }));
    }
    const gap = view.s - px; // same axis while both on AB… actor may be past B
    if (view.s < 300) {
      expect(gap).toBeGreaterThan(18);
      expect(gap).toBeLessThan(32);
      expect(view.speedMps).toBeGreaterThan(8);
      expect(view.speedMps).toBeLessThan(12);
    }
  });

  it("brake slams to a full stop and holds it", () => {
    const system = squareSystem();
    const view = system.stage(SQUARE_CAR)!;
    system.stagedCommand("car-1", { type: "cruise" });
    run(system, 4, ctx());
    const vBefore = view.speedMps;
    expect(vBefore).toBeGreaterThan(9);
    system.stagedCommand("car-1", { type: "brake", decelMps2: 7.5 });
    run(system, 2, ctx());
    expect(view.speedMps).toBe(0);
    const sStopped = view.s;
    run(system, 2, ctx());
    expect(view.s).toBe(sStopped);
  });

  it("player guard: never rams a player standing in the corridor ahead", () => {
    const system = squareSystem();
    const view = system.stage(SQUARE_CAR)!;
    system.stagedCommand("car-1", { type: "cruise" });
    // Player parked IN-LANE on AB at x=120 (actor holds at 50, cruises east).
    const player = { x: 120, y: -4.06, speedKmh: 0, headingDeg: 90 };
    run(system, 20, ctx(player));
    // Stops short of the player (guard aims ~6 m, allow integration slack).
    expect(view.s).toBeLessThan(120 - 3.5);
    expect(view.speedMps).toBeLessThan(0.5);
  });

  it("reset returns the actor to its hold pose", () => {
    const system = squareSystem();
    const view = system.stage(SQUARE_CAR)!;
    system.stagedCommand("car-1", { type: "cruise" });
    run(system, 5, ctx());
    expect(view.s).toBeGreaterThan(60);
    system.stagedCommand("car-1", { type: "reset" });
    expect(view.s).toBeCloseTo(50, 6);
    expect(view.speedMps).toBe(0);
    run(system, 1, ctx());
    expect(view.s).toBeCloseTo(50, 6); // dormant again (hold)
  });
});

describe("staged pedestrian", () => {
  it("stays dormant, walks on cruise, and drives crossing occupancy", () => {
    const system = squareSystem(); // crossing x1 at (150, 0) on AB
    const view = system.stage({
      kind: "pedestrian",
      id: "ped-1",
      path: [
        { x: 150, y: 9.7 },
        { x: 150, y: -13.8 },
      ],
      speedMps: 2.9,
      crossingId: "x1",
      roadFromM: 1.2,
      roadToM: 18.3,
    })!;
    expect(view).not.toBeNull();
    run(system, 2, ctx());
    expect(view.s).toBe(0);
    expect(system.pedestrianOnCrossing("x1")).toBe(false);

    system.stagedCommand("ped-1", { type: "cruise" });
    run(system, 2, ctx()); // 5.8 m in — on the roadway span
    expect(view.s).toBeGreaterThan(4);
    expect(system.pedestrianOnCrossing("x1")).toBe(true);
    expect(system.pedestrians.some((p) => p.onCrossing)).toBe(true);

    run(system, 8, ctx()); // fully across
    expect(view.finished).toBe(true);
    expect(system.pedestrianOnCrossing("x1")).toBe(false);

    system.stagedCommand("ped-1", { type: "reset" });
    expect(view.s).toBe(0);
    expect(view.finished).toBe(false);
    expect(system.pedestrianOnCrossing("x1")).toBe(false);
  });

  it("publishes the standing pose ONLY when the spec authors one (VP-11 officer)", () => {
    const system = squareSystem();
    system.stage({
      kind: "pedestrian",
      id: "officer",
      path: [
        { x: 150, y: 9.7 },
        { x: 148.5, y: 9.7 },
      ],
      speedMps: 0,
      pose: "stopSignal",
    });
    system.stage({
      kind: "pedestrian",
      id: "plain-ped",
      path: [
        { x: 160, y: 9.7 },
        { x: 160, y: -13.8 },
      ],
      speedMps: 2.9,
    });
    const officer = system.pedestrians.find((p) => p.pose === "stopSignal")!;
    expect(officer).toBeDefined();
    expect(officer.x).toBeCloseTo(150, 3); // stands at the path start…
    run(system, 3, ctx());
    expect(officer.x).toBeCloseTo(150, 3); // …and never walks uncommanded
    expect(officer.speedMps).toBe(0);
    // The pose-less staged pedestrian publishes the exact pre-pose shape.
    const plain = system.pedestrians.find((p) => p !== officer && p.id >= 1000)!;
    expect("pose" in plain).toBe(false);
  });

  it("publishes the body variant ONLY when the spec authors one (R3 #25–28)", () => {
    const system = squareSystem();
    system.stage({
      kind: "pedestrian",
      id: "child-ped",
      path: [
        { x: 150, y: 9.7 },
        { x: 150, y: -13.8 },
      ],
      speedMps: 2.6,
      variant: "child",
    });
    system.stage({
      kind: "pedestrian",
      id: "cane-ped",
      path: [
        { x: 160, y: 9.7 },
        { x: 160, y: -13.8 },
      ],
      speedMps: 0.75,
      variant: "elder",
    });
    system.stage({
      kind: "pedestrian",
      id: "plain-ped",
      path: [
        { x: 170, y: 9.7 },
        { x: 170, y: -13.8 },
      ],
      speedMps: 1.4,
    });
    const child = system.pedestrians.find((p) => p.variant === "child")!;
    const elder = system.pedestrians.find((p) => p.variant === "elder")!;
    expect(child).toBeDefined();
    expect(elder).toBeDefined();
    expect(child.x).toBeCloseTo(150, 3);
    expect(elder.x).toBeCloseTo(160, 3);
    // The variant is presentation data only — the walk machinery is untouched:
    // released, the child crosses exactly like any staged walker.
    system.stagedCommand("child-ped", { type: "cruise" });
    run(system, 2, ctx());
    expect(child.y).toBeLessThan(9.7);
    // The variant-less staged pedestrian publishes the exact pre-variant shape.
    const plain = system.pedestrians.find(
      (p) => p.id >= 1000 && p !== child && p !== elder,
    )!;
    expect("variant" in plain).toBe(false);
  });

  it("publishes the directTraffic pose for the JU-18 controller figure", () => {
    const system = squareSystem();
    system.stage({
      kind: "pedestrian",
      id: "controller",
      path: [
        { x: 150, y: 9.7 },
        { x: 148.5, y: 9.7 },
      ],
      speedMps: 0,
      pose: "directTraffic",
    });
    const controller = system.pedestrians.find((p) => p.pose === "directTraffic")!;
    expect(controller).toBeDefined();
    expect(controller.x).toBeCloseTo(150, 3); // stands at the post…
    run(system, 3, ctx());
    expect(controller.x).toBeCloseTo(150, 3); // …and never walks uncommanded
    expect(controller.speedMps).toBe(0);
  });
});

describe("staged determinism", () => {
  it("same commands + same player stream = bit-identical staged playback", () => {
    const mk = () => {
      const system = createTrafficSystem(loadRealDistrict(), {
        seed: 9,
        vehicleCount: 4,
        pedestrianCount: 3,
      });
      system.stage({
        kind: "vehicle",
        id: "sync-car",
        pathNodes: ["n1113186267", "n5063751788", "n9601848047"],
        hold: { nodeIndex: 1, offsetM: -70 },
        cruiseSpeedMps: 9,
      });
      return system;
    };
    const a = mk();
    const b = mk();
    const drive = (system: TrafficSystem, i: number) => {
      const t = i * DT;
      if (i === 120) system.stagedCommand("sync-car", { type: "cruise", speedMps: 6 });
      if (i === 400) system.stagedCommand("sync-car", { type: "brake", decelMps2: 7 });
      system.update(DT, ctx({ x: 434 + Math.sin(t) * 5, y: -30 + t * 8, speedKmh: 29, headingDeg: 2 }));
    };
    for (let i = 0; i < 900; i++) {
      drive(a, i);
      drive(b, i);
    }
    const va = a.staged("sync-car")!;
    const vb = b.staged("sync-car")!;
    expect(va.s).toBe(vb.s);
    expect(va.x).toBe(vb.x);
    expect(va.y).toBe(vb.y);
    expect(va.speedMps).toBe(vb.speedMps);
    for (let i = 0; i < a.vehicles.length; i++) {
      expect(a.vehicles[i].x).toBe(b.vehicles[i].x);
      expect(a.vehicles[i].y).toBe(b.vehicles[i].y);
    }
  });
});

// ---------------------------------------------------------------------------
// RX „жп прелез" — a staged vehicle riding an EXPLICIT rail polyline (railPath)
// instead of a lane-graph path (the TRAIN crosses a line that is NOT a road).
// ---------------------------------------------------------------------------

describe("staged vehicle on an authored railPath (the RX train)", () => {
  const RAIL_TRAIN: StagedVehicleSpec = {
    kind: "vehicle",
    id: "rail-train",
    pathNodes: [], // no lane-graph path — the rail line is authored
    railPath: [
      { x: -130, y: 153 },
      { x: 130, y: 153 },
    ],
    hold: { nodeIndex: 0, offsetM: 80 },
    cruiseSpeedMps: 12,
    accelMps2: 3.5,
    profile: "train",
    playerGuard: false,
  };

  it("resolves the explicit polyline (no road graph): nodeS at each vertex, holds off-axis", () => {
    const system = squareSystem();
    const view = system.stage(RAIL_TRAIN);
    expect(view).not.toBeNull();
    expect(view!.pathLengthM).toBeCloseTo(260); // -130 → 130
    expect(view!.nodeS).toEqual([0, 260]); // both endpoints exposed as node arcs
    expect(view!.s).toBeCloseTo(80); // hold arc (partway down the line, off-frame)
    // Dormant pose sits on the band-centre line, west of the street axis.
    expect(view!.y).toBeCloseTo(153);
    expect(view!.x).toBeCloseTo(-50); // -130 + 80
    // Published as a rail vehicle, not tagged a cyclist proxy (offset 0).
    expect(system.vehicleCollisionKind(view === null ? -1 : 1000)).toBe("vehicle");
  });

  it("runs east across the axis on cruise, finishes at the far end, and leaves", () => {
    const system = squareSystem();
    system.stage(RAIL_TRAIN);
    system.stagedCommand("rail-train", { type: "cruise" });
    // The arc reaches the 260 m rail end at t ≈ 22 s; 30 s also covers the
    // FR-B5-EXIT retirement run that follows it.
    run(system, 30, ctx());
    const view = system.staged("rail-train")!;
    expect(view.finished).toBe(true);
    // The ARC still ends exactly at the rail end — `finished` and `s` are what
    // the runners read, and FR-B5-EXIT deliberately leaves both untouched.
    expect(view.s).toBeCloseTo(view.pathLengthM, 6);
    // The BODY, though, has left: a train that reaches the end of its rail has
    // gone, not parked across the crossing the lesson is about. 130 + the 70 m
    // retirement run.
    expect(view.x).toBeCloseTo(200);
    expect(view.y).toBeCloseTo(153); // never left the rail line
    expect(view.speedMps).toBe(0); // …and is at rest once it is clear
  });
});
