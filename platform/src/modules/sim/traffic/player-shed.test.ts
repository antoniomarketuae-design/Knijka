/**
 * WHAT A CAR HAS HAD TO DO BECAUSE OF THE STUDENT — the traffic module's half
 * of the founder ruling of 2026-10-05, «bill forced braking»:
 *
 *   „Bill it only when a circulating car actually has to brake or swerve
 *    because of the entry, or there is contact."
 *
 * The roundabout tracker (runtime/worldRuntime.ts §4c) convicts on the speed a
 * circulating car lost to him. It does not compute that; each car's own model
 * accounts it (`playerShedThisStep`) and `TrafficSystem.circulatingTraffic`
 * hands the running totals across. These tests are about that account, on the
 * production traffic system, on rb-mini-v1:
 *
 *   · THE FLOOR IS NIL. A platoon nobody disturbs accounts exactly 0.000 m/s
 *     for as long as it circulates — staged cars and the ambient fleet alike,
 *     with the student absent, parked on the arm, or waiting at the line.
 *   · THE ACCOUNT IS THE SPEED IT LOST. A staged car that has to brake for a
 *     body in its lane accounts what its speedometer lost, to the bit.
 *   · ONLY HIS SHARE. Speed a car sheds on its own command, or for another
 *     car, is not his.
 *   · THE REPORT says who is in the band, what each has accounted, and the
 *     presence flags the commendation reads.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyStagedCommand,
  buildStagedVehiclePolylinePath,
  createStagedVehicle,
  STAGED_BRAKE_LAMP_MARGIN_MPS,
  updateStagedVehicle,
  type StagedEnv,
  type StagedVehicleAgent,
} from "./staged";
import { circulatingRowsFor, createTrafficSystem } from "./system";
import {
  VEHICLE_PROFILE_LENGTH_M,
  VEHICLE_PROFILE_WIDTH_M,
  type CirculatingVehicle,
  type StagedVehicleSpec,
  type TrafficDistrict,
  type TrafficSystem,
  type TrafficVehicleState,
  type VehicleProfile,
} from "./types";
import { playerShedThisStep } from "./vehicles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = JSON.parse(
  readFileSync(path.resolve(HERE, "../../../../../content/world/rb-mini-v1.json"), "utf-8"),
) as TrafficDistrict;
const DT = 1 / 60;
const R = 18;
const BAND = R + 9;
const RING_LOOP = ["rbm-n-w", "rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"];
const CRUISE = 2.9;

/** Ring point at circulation angle φ (deg from the SOUTH node, CCW through east). */
const ring = (phiDeg: number, r = R): { x: number; y: number } => {
  const a = (phiDeg * Math.PI) / 180;
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
};
const phiOf = (x: number, y: number): number => {
  const d = (Math.atan2(x, -y) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
};

function world(ambient = 0, seed = 3): TrafficSystem {
  return createTrafficSystem(RAW, {
    seed,
    vehicleCount: ambient,
    pedestrianCount: 0,
    anchor: { x: 4.06, y: -93 },
    anchorRadiusM: 400,
  });
}

/** A staged loop car on the ring, cruising, guarded against the player (the RoundaboutEntryRunner's cast). */
function stageRingCar(traffic: TrafficSystem, id = "ring-car", offsetM = 0): void {
  const view = traffic.stage({
    kind: "vehicle",
    id,
    pathNodes: RING_LOOP,
    hold: { nodeIndex: 0, offsetM },
    cruiseSpeedMps: CRUISE,
    loop: true,
    playerGuard: true,
  });
  if (!view) throw new Error("ring car failed to stage");
  traffic.stagedCommand(id, { type: "cruise" });
}

type Player = { x: number; y: number; speedKmh: number; headingDeg: number } | null;
function step(traffic: TrafficSystem, player: Player): void {
  traffic.update(DT, {
    signalPhase: () => "green",
    playerPos: player ? { x: player.x, y: player.y } : null,
    ...(player ? { playerSpeedKmh: player.speedKmh, playerHeadingDeg: player.headingDeg } : {}),
  });
}
/** The report, asked from the south give-way line. */
const report = (traffic: TrafficSystem, at = { x: 4.06, y: -27.5 }, headingDeg = 0) =>
  traffic.circulatingTraffic(0, 0, at.x, at.y, headingDeg, BAND);
const shedOf = (traffic: TrafficSystem): number =>
  report(traffic).vehicles.reduce((m: number, v: CirculatingVehicle) => Math.max(m, v.playerShedMps), 0);

describe("playerShedThisStep — his share of one step's slow-down", () => {
  it("is the speed the car lost below what it would have done without him", () => {
    expect(playerShedThisStep(2.9, 2.5, 2.9)).toBeCloseTo(0.4, 12); // cruising, braked for him
    expect(playerShedThisStep(2.9, 2.9, 2.9)).toBe(0); // nothing happened
  });

  it("a car that merely accelerates LESS is not braking: no loss", () => {
    // 2.0 → 2.02 with him, 2.0 → 2.04 without him.
    expect(playerShedThisStep(2.0, 2.02, 2.04)).toBe(0);
  });

  it("speed it was shedding anyway (a red light, a bend, another car) is not his", () => {
    // Without him it would have slowed 6.0 → 5.5; with him it slowed to 5.2.
    expect(playerShedThisStep(6.0, 5.2, 5.5)).toBeCloseTo(0.3, 12);
    // …and if he changes nothing about it, nothing is his.
    expect(playerShedThisStep(6.0, 5.5, 5.5)).toBe(0);
  });

  it("never negative", () => {
    expect(playerShedThisStep(2.9, 3.1, 2.9)).toBe(0);
    expect(playerShedThisStep(0, 0, 0)).toBe(0);
  });
});

describe("THE NOISE FLOOR — a platoon nobody disturbs accounts exactly nothing", () => {
  it("three staged cars circulating for two full laps with no student in the world: 0.000 m/s, and every speed is the cruise", () => {
    const traffic = world();
    stageRingCar(traffic, "a", 0);
    stageRingCar(traffic, "b", 8.2);
    stageRingCar(traffic, "c", 16.4);
    let worst = 0;
    let slowest = Infinity;
    for (let i = 0; i < 60 * 80; i++) {
      step(traffic, null);
      worst = Math.max(worst, shedOf(traffic));
      if (i > 120) for (const id of ["a", "b", "c"]) slowest = Math.min(slowest, traffic.staged(id)!.speedMps);
    }
    expect(report(traffic).vehicles).toHaveLength(3);
    expect(worst).toBe(0);
    expect(slowest).toBe(CRUISE);
  });

  it("…and with a student parked on the arm, or standing on the give-way line the whole time: still exactly 0", () => {
    for (const at of [{ x: 4.06, y: -60 }, { x: 4.06, y: -27.5 }]) {
      const traffic = world();
      stageRingCar(traffic, "a", 0);
      stageRingCar(traffic, "b", 8.2);
      let worst = 0;
      for (let i = 0; i < 60 * 80; i++) {
        step(traffic, { ...at, speedKmh: 0, headingDeg: 0 });
        worst = Math.max(worst, shedOf(traffic));
      }
      expect(worst, `student at y=${at.y}`).toBe(0);
    }
  });

  it("an ambient fleet with no student in the world brakes for junctions and for each other — and accounts none of it to him", () => {
    const traffic = world(6, 11);
    let worst = 0;
    let braked = false;
    for (let i = 0; i < 60 * 90; i++) {
      step(traffic, null);
      for (const v of traffic.vehicles) if (v.braking) braked = true;
      worst = Math.max(worst, shedOf(traffic));
    }
    expect(traffic.stats.vehicleCount).toBe(6);
    expect(braked).toBe(true); // the fleet does slow down — for its own reasons
    expect(worst).toBe(0);
  });

  it("the threshold a conviction needs is the model's own brake-lamp line, well clear of that floor", () => {
    expect(STAGED_BRAKE_LAMP_MARGIN_MPS).toBe(0.3);
    // One 60 Hz frame of the staged guard's 8 m/s² ramp is 0.133 m/s: a single
    // frame of trimming is under the line, three are over it.
    expect(8 * DT).toBeLessThan(STAGED_BRAKE_LAMP_MARGIN_MPS);
    expect(3 * 8 * DT).toBeGreaterThan(STAGED_BRAKE_LAMP_MARGIN_MPS);
  });
});

describe("THE ACCOUNT — a staged car that has to brake for him accounts what its speedometer lost", () => {
  /** Let the car circulate to φ ≈ `phi`, with nobody in its way. */
  function runTo(traffic: TrafficSystem, id: string, phi: number): void {
    for (let i = 0; i < 60 * 120; i++) {
      step(traffic, null);
      const v = traffic.staged(id)!;
      if (v.speedMps === CRUISE && Math.abs(phiOf(v.x, v.y) - phi) < 0.5) return;
    }
    throw new Error("the ring car never reached φ " + phi);
  }

  it("a body standing in its lane 8 m ahead: it brakes, and the account equals the speed it lost", () => {
    const traffic = world();
    stageRingCar(traffic);
    runTo(traffic, "ring-car", 300); // on the west side, heading for the south mouth
    const car = traffic.staged("ring-car")!;
    // 8 m of ring ahead of it, on its own circle.
    const ahead = ring(phiOf(car.x, car.y) + (8 / R) * (180 / Math.PI));
    const before = shedOf(traffic);
    expect(before).toBe(0);
    let minSpeed = Infinity;
    for (let i = 0; i < 90; i++) {
      step(traffic, { ...ahead, speedKmh: 0, headingDeg: 90 });
      minSpeed = Math.min(minSpeed, traffic.staged("ring-car")!.speedMps);
    }
    const lost = CRUISE - minSpeed;
    expect(lost).toBeGreaterThan(1); // it really had to brake
    expect(shedOf(traffic)).toBeCloseTo(lost, 9);
  });

  it("the same body 14 m ahead is outside its braking reach (9.6 m at 2.9 m/s): it holds its speed and accounts nothing", () => {
    const traffic = world();
    stageRingCar(traffic);
    runTo(traffic, "ring-car", 300);
    const car = traffic.staged("ring-car")!;
    const ahead = ring(phiOf(car.x, car.y) + (14 / R) * (180 / Math.PI));
    for (let i = 0; i < 30; i++) step(traffic, { ...ahead, speedKmh: 0, headingDeg: 90 });
    expect(traffic.staged("ring-car")!.speedMps).toBe(CRUISE);
    expect(shedOf(traffic)).toBe(0);
  });

  it("the account is cumulative and monotone: a second braking adds to the first, and going free again takes nothing back", () => {
    const traffic = world();
    stageRingCar(traffic);
    runTo(traffic, "ring-car", 300);
    const seen: number[] = [];
    for (let round = 0; round < 2; round++) {
      const car = traffic.staged("ring-car")!;
      const ahead = ring(phiOf(car.x, car.y) + (8 / R) * (180 / Math.PI));
      for (let i = 0; i < 60; i++) {
        step(traffic, { ...ahead, speedKmh: 0, headingDeg: 90 });
        seen.push(shedOf(traffic));
      }
      // He goes away; it accelerates back to its cruise.
      for (let i = 0; i < 240; i++) {
        step(traffic, null);
        seen.push(shedOf(traffic));
      }
      expect(traffic.staged("ring-car")!.speedMps).toBe(CRUISE);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[seen.length - 1]).toBeGreaterThan(2 * 1);
  });

  it("speed it sheds on its OWN command is not his: a `brake` to a stop with him nowhere near its lane accounts nothing", () => {
    const traffic = world();
    stageRingCar(traffic);
    runTo(traffic, "ring-car", 300);
    traffic.stagedCommand("ring-car", { type: "brake" });
    for (let i = 0; i < 120; i++) step(traffic, { x: 4.06, y: -60, speedKmh: 0, headingDeg: 0 });
    expect(traffic.staged("ring-car")!.speedMps).toBe(0);
    expect(shedOf(traffic)).toBe(0);
  });

  it("when BOTH its command and its guard slow it, the command's own share is never his", () => {
    // Told to drop to 2.0 m/s (at its own 4.5 m/s²) with him standing 7.5 m
    // ahead, where the guard asks for ~0.7 (at 8 m/s²). Step by step the
    // command would have taken 4.5·dt off anyway, so only the 3.5·dt the guard
    // adds is his until the car is under 2.0 — seven frames, 0.525 m/s that is
    // NOT his — and everything below 2.0 is.
    const traffic = world();
    stageRingCar(traffic);
    runTo(traffic, "ring-car", 300);
    const car = traffic.staged("ring-car")!;
    const ahead = ring(phiOf(car.x, car.y) + (7.5 / R) * (180 / Math.PI));
    traffic.stagedCommand("ring-car", { type: "cruise", speedMps: 2.0 });
    let minSpeed = Infinity;
    for (let i = 0; i < 20; i++) {
      step(traffic, { ...ahead, speedKmh: 0, headingDeg: 90 });
      minSpeed = Math.min(minSpeed, traffic.staged("ring-car")!.speedMps);
    }
    expect(minSpeed).toBeLessThan(1.5);
    const his = shedOf(traffic);
    const total = CRUISE - minSpeed;
    // All of what it lost below its commanded 2.0 is his…
    expect(his).toBeGreaterThanOrEqual(2.0 - minSpeed - 1e-9);
    // …and the command's own seven frames (7 × 4.5 m/s² × 1/60 s) are not.
    expect(total - his).toBeCloseTo(7 * 4.5 * DT, 6);
  });

  it("…nor is a slow-down to a lower commanded cruise that happens while he is in its lane, beyond what the guard takes off", () => {
    // The car is told to drop to 2.0 m/s; he stands 10 m ahead, where the guard
    // alone would still allow 2.6 m/s or more for the quarter second this
    // takes. The command is the binding one: all of the 0.9 m/s it sheds is
    // its own.
    const traffic = world();
    stageRingCar(traffic);
    runTo(traffic, "ring-car", 300);
    const car = traffic.staged("ring-car")!;
    const ahead = ring(phiOf(car.x, car.y) + (10 / R) * (180 / Math.PI));
    traffic.stagedCommand("ring-car", { type: "cruise", speedMps: 2.0 });
    for (let i = 0; i < 15; i++) step(traffic, { ...ahead, speedKmh: 0, headingDeg: 90 });
    expect(traffic.staged("ring-car")!.speedMps).toBe(2.0);
    expect(shedOf(traffic)).toBe(0);
  });
});

describe("THE AMBIENT FLEET — its following law accounts the same way", () => {
  it("a student standing in an ambient car's lane makes it brake, and only then does its account move", () => {
    const traffic = world(6, 11);
    // Let the fleet settle, then find a car that is rolling and park the
    // student 12 m dead ahead of it in its own lane.
    for (let i = 0; i < 60 * 20; i++) step(traffic, null);
    const target = traffic.vehicles.find((v) => v.speedMps > 4)!;
    expect(target).toBeDefined();
    const at = { x: target.x + target.dirX * 12, y: target.y + target.dirY * 12 };
    // THE AMBIENT FLEET IS IN THE REPORT: the car is a row of it (a report built
    // from the staged cast alone would have no row for it — and no account).
    const row = () => traffic.circulatingTraffic(target.x, target.y, at.x, at.y, 0, 400).vehicles.find((v) => v.id === target.id);
    expect(row(), "an ambient car in the band must be a row of the circulating report").toBeDefined();
    const all = () => row()?.playerShedMps ?? Number.NaN;
    expect(all()).toBe(0);
    const v0 = target.speedMps;
    for (let i = 0; i < 90; i++) step(traffic, { ...at, speedKmh: 0, headingDeg: 0 });
    expect(target.speedMps).toBeLessThan(v0 - 1);
    const shed = all();
    expect(shed).toBeGreaterThan(1);
    // Never more than the speed it actually came down by (its own free-road
    // acceleration it gave up is not counted as braking).
    expect(shed).toBeLessThanOrEqual(v0 - target.speedMps + 1e-9);
  });
});

describe("THE STAGED ACCOUNT, branch by branch — every way his body slows an actor is accounted, and nothing another body does is", () => {
  // The staged model has three places the student can take speed off an actor:
  // the following guard (step 2 — «THE ACCOUNT» above drives it), the cross
  // guard for a student coming onto a returning actor's road (2a), and the hard
  // refusal of a step that would close inside the standoff (3c). And one place
  // where somebody else takes over: an ambient car that becomes the binding
  // obstacle (2b). Each on a bare straight path, so the only thing moving is
  // the branch under test.
  const CRUISE_MPS = 10;
  const SPEC: StagedVehicleSpec = {
    kind: "vehicle",
    id: "account-probe",
    pathNodes: [],
    railPath: [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
    ],
    hold: { nodeIndex: 0, offsetM: 0 },
    cruiseSpeedMps: CRUISE_MPS,
    playerGuard: true,
  };
  const env = (over: Partial<StagedEnv> = {}): StagedEnv => ({
    hasPlayer: false,
    playerX: 0,
    playerY: 0,
    playerSpeedMps: 0,
    crossingCounts: new Map(),
    ambient: [],
    ...over,
  });
  /** An actor at its cruise on a RETURN lap (the laps nobody timed), with nobody about. */
  function cruising(): StagedVehicleAgent {
    const agent = createStagedVehicle(SPEC, buildStagedVehiclePolylinePath(SPEC.railPath!)!, 1000);
    const e = env();
    applyStagedCommand(agent, { type: "cruise" }, e);
    for (let i = 0; i < 60 * 8; i++) updateStagedVehicle(agent, DT, e);
    expect(agent.speed).toBe(CRUISE_MPS);
    expect(agent.playerShedMps).toBe(0);
    agent.returns = 1;
    return agent;
  }

  it("3c — THE HARD CLAMP: a student standing 4.5 m beside its line (outside the 3 m following corridor) stops it dead inside the 6 m standoff, and the whole of the speed it loses there is his", () => {
    const agent = cruising();
    // Beside the path and far ahead: no guard sees him (not in the corridor,
    // not coming onto the road). Only the standoff will.
    const e = env({ hasPlayer: true, playerX: agent.state.x + 60, playerY: 4.5 });
    let clampedFrom: number | null = null;
    for (let i = 0; i < 60 * 8 && clampedFrom === null; i++) {
      const before = agent.speed;
      const shedBefore = agent.playerShedMps;
      updateStagedVehicle(agent, DT, e);
      if (agent.speed === 0) clampedFrom = before;
      else expect(agent.playerShedMps, "nothing is his until the clamp").toBe(shedBefore);
    }
    expect(clampedFrom).toBe(CRUISE_MPS); // it was still at its cruise: no soft guard had bound
    expect(Math.hypot(e.playerX - agent.state.x, e.playerY - agent.state.y)).toBeGreaterThanOrEqual(6 - CRUISE_MPS * DT);
    expect(agent.playerShedMps).toBeCloseTo(CRUISE_MPS, 9);
  });

  it("2a — THE CROSS GUARD: a student coming onto its road from the side, never inside the following corridor, makes it brake — and the account is the speed it lost", () => {
    const agent = cruising();
    const x = agent.state.x + 40;
    // He closes on its line from 16 m off to 4 m off (the corridor is 3 m).
    let y = 16;
    const e = env({ hasPlayer: true, playerX: x, playerY: y, playerSpeedMps: 3 });
    let minSpeed = Infinity;
    for (let i = 0; i < 60 * 4; i++) {
      if (y > 4) y -= 3 * DT;
      e.playerY = y;
      updateStagedVehicle(agent, DT, e);
      if (agent.speed < minSpeed) minSpeed = agent.speed;
      expect(Math.abs(e.playerY)).toBeGreaterThanOrEqual(3.99); // step 2's corridor never saw him
    }
    const lost = CRUISE_MPS - minSpeed;
    expect(lost).toBeGreaterThan(3); // it really braked for him
    expect(agent.playerShedMps).toBeCloseTo(lost, 9);
  });

  it("2b — AN AMBIENT CAR TAKES OVER: with the student 12 m ahead in its lane and an ambient car 4.5 m ahead, it is the ambient car that stops it — and none of that is his", () => {
    const agent = cruising();
    const ambientCar: TrafficVehicleState = {
      id: 7,
      x: agent.state.x + 4.5,
      y: 0,
      dirX: 0,
      dirY: 1, // crossing: a wall, not a leader
      speedMps: 0,
      braking: false,
      colorIndex: 0,
    };
    const e = env({ hasPlayer: true, playerX: agent.state.x + 12, playerY: 0, ambient: [ambientCar] });
    updateStagedVehicle(agent, DT, e);
    // The ambient body's own hard refusal (3b) took all of it in one step.
    expect(agent.speed).toBe(0);
    expect(agent.playerShedMps).toBe(0);
    for (let i = 0; i < 30; i++) updateStagedVehicle(agent, DT, e);
    expect(agent.playerShedMps).toBe(0);
    // …and with the ambient car gone, the same student at the same 12 m IS the
    // binding obstacle: the account moves.
    const again = cruising();
    const e2 = env({ hasPlayer: true, playerX: again.state.x + 12, playerY: 0 });
    for (let i = 0; i < 30; i++) updateStagedVehicle(again, DT, e2);
    expect(again.playerShedMps).toBeGreaterThan(1);
  });
});

describe("THE AMBIENT FLEET — the hard clamps: speed his BODY takes off a car is his even when his following term is not the binding one", () => {
  /** A fleet that has settled, and one car in it that is rolling. */
  function rollingCar(): { traffic: TrafficSystem; target: TrafficVehicleState } {
    const traffic = world(6, 11);
    for (let i = 0; i < 60 * 20; i++) step(traffic, null);
    const target = traffic.vehicles.find((v) => v.speedMps > 4)!;
    expect(target).toBeDefined();
    return { traffic, target };
  }
  const accountOf = (traffic: TrafficSystem, target: TrafficVehicleState): number =>
    traffic.circulatingTraffic(target.x, target.y, target.x, target.y, 0, 400).vehicles.find((v) => v.id === target.id)!
      .playerShedMps;
  const bearing = (v: TrafficVehicleState): number => (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI;
  /** A staged car parked 7 m ahead of `target` and 4 m to its right. */
  function parkBeside(traffic: TrafficSystem, target: TrafficVehicleState): void {
    const px = target.dirY;
    const py = -target.dirX;
    const at = { x: target.x + target.dirX * 7 + px * 4, y: target.y + target.dirY * 7 + py * 4 };
    const parked = traffic.stage({
      kind: "vehicle",
      id: "parked-beside",
      pathNodes: [],
      railPath: [at, { x: at.x + px * 30, y: at.y + py * 30 }],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 1,
      playerGuard: false,
    });
    expect(parked).not.toBeNull();
  }

  it("THE CORRIDOR CLAMP: he cuts in 4.8 m ahead of a car, going faster than it, while it is braking for a car parked in the next lane — his following term is the smaller one, but it is HIS body the car is stopped dead against", () => {
    const { traffic, target } = rollingCar();
    // Inside the fleet's conservative 5 m corridor, so the parked car's is the
    // binding term — and it is not in the car's path, so no clamp of its own.
    parkBeside(traffic, target);
    const v0 = target.speedMps;
    expect(accountOf(traffic, target)).toBe(0);
    // He is 4.8 m ahead in its own lane, doing 60 км/ч the same way.
    step(traffic, {
      x: target.x + target.dirX * 4.8,
      y: target.y + target.dirY * 4.8,
      speedKmh: 60,
      headingDeg: bearing(target),
    });
    expect(target.speedMps).toBe(0);
    // All of the speed it had left after its own law took a step for the parked car.
    expect(accountOf(traffic, target)).toBeGreaterThan(v0 - 5.5 * DT - 1e-9);
    expect(accountOf(traffic, target)).toBeLessThanOrEqual(v0);
  });

  it("…and the same car, braking for the same parked car with nobody in front of it, accounts nothing: it is not stopped, and what it sheds is the parked car's doing", () => {
    const { traffic, target } = rollingCar();
    parkBeside(traffic, target);
    const v0 = target.speedMps;
    step(traffic, null);
    expect(target.speedMps).toBeGreaterThan(0);
    expect(target.speedMps).toBeLessThan(v0); // it does brake — for the parked car
    expect(accountOf(traffic, target)).toBe(0);
  });

  it("THE RADIAL CLAMP — the junction box: a car whose next pose hops the box onto a student standing in it has no following term for him at all (he is beside or behind its heading), and the step is refused — stopped dead in one step, on his account", () => {
    // tj-occluded-v1, the pose `ambient-player-separation.test.ts` was written
    // on: the lane graph trims both lanes back from the node, so a turning
    // car's pose HOPS the box. The corridor law cannot see a student standing
    // there; only the radial clamp refuses the step.
    const TJ = JSON.parse(
      readFileSync(path.resolve(HERE, "../../../../../content/world/tj-occluded-v1.json"), "utf-8"),
    ) as TrafficDistrict;
    const HZ30 = 1 / 30;
    const SPAWN = { x: 4.06, y: -115 };
    const BOX = { x: -1.14, y: -6.47 };
    let events = 0;
    for (const [seed, n] of [
      [3, 5],
      [12, 4],
      [4, 4],
      [6, 4],
    ]) {
      const tr = createTrafficSystem(TJ, { seed, vehicleCount: n, pedestrianCount: 0, anchor: SPAWN, anchorRadiusM: 400 });
      const prev = new Map<number, { speed: number; shed: number; x: number; y: number; dirX: number; dirY: number }>();
      for (let i = 0; i < 60 * 30; i++) {
        const inBox = i * HZ30 >= 20;
        tr.update(HZ30, {
          signalPhase: () => "green",
          playerPos: inBox ? BOX : SPAWN,
          playerSpeedKmh: 0,
          playerHeadingDeg: 340,
        });
        for (const row of tr.circulatingTraffic(BOX.x, BOX.y, BOX.x, BOX.y, 0, 400).vehicles) {
          const p = prev.get(row.id);
          if (inBox && p !== undefined && p.speed > 1 && row.speedMps === 0) {
            // Where he stood in the car's own frame on the frame before.
            const relX = BOX.x - p.x;
            const relY = BOX.y - p.y;
            const along = relX * p.dirX + relY * p.dirY;
            const lateral = Math.abs(relX * p.dirY - relY * p.dirX);
            if (along <= -2 || lateral >= 5) {
              // Outside the following corridor (ahead > −2 m, lateral < 5 m):
              // no term of his was in its law. All of the stop is the clamp.
              events++;
              const where = `seed ${seed}, n ${n}, t ${(i * HZ30).toFixed(2)} s`;
              // Its own law may have taken one step of braking first (≤ 5.5 m/s²).
              expect(row.playerShedMps - p.shed, where).toBeGreaterThan(p.speed - 5.5 * HZ30 - 1e-9);
              expect(row.playerShedMps - p.shed, where).toBeLessThanOrEqual(p.speed + 1e-9);
            }
          }
          prev.set(row.id, {
            speed: row.speedMps,
            shed: row.playerShedMps,
            x: row.x,
            y: row.y,
            dirX: row.dirX,
            dirY: row.dirY,
          });
        }
      }
    }
    expect(events, "cars frozen against him from outside their following corridor").toBeGreaterThanOrEqual(3);
  });
});

describe("TrafficSystem.circulatingTraffic — the report the runtime's roundabout tracker is wired to", () => {
  it("`conflict` is exactly the presence boolean `circulatingConflict` gives for the same arguments, on every frame of a lap", () => {
    const traffic = world();
    stageRingCar(traffic);
    let both = 0;
    for (let i = 0; i < 60 * 45; i++) {
      step(traffic, null);
      const a = traffic.circulatingConflict(0, 0, 4.06, -27.5, 0, BAND);
      const b = traffic.circulatingTraffic(0, 0, 4.06, -27.5, 0, BAND).conflict;
      expect(b).toBe(a);
      if (a) both++;
    }
    expect(both).toBeGreaterThan(60); // the car really was a conflict for a while
  });

  it("carries every vehicle in the band, moving OR stopped, with its body size — and none outside it", () => {
    const traffic = world();
    stageRingCar(traffic, "moving", 0);
    const parked = traffic.stage({
      kind: "vehicle",
      id: "parked",
      pathNodes: RING_LOOP,
      hold: { nodeIndex: 0, offsetM: 40 },
      cruiseSpeedMps: CRUISE,
      loop: true,
      playerGuard: true,
    });
    expect(parked).not.toBeNull();
    for (let i = 0; i < 30; i++) step(traffic, null);
    const rep = report(traffic);
    expect(rep.vehicles).toHaveLength(2);
    expect(rep.vehicles.map((v) => v.speedMps > 0).sort()).toEqual([false, true]);
    for (const v of rep.vehicles) {
      expect(v.halfLengthM).toBeCloseTo(2.05, 6);
      expect(v.halfWidthM).toBeGreaterThan(0.5);
      expect(Math.hypot(v.x, v.y)).toBeLessThan(BAND);
    }
    // A band that stops short of the ring holds nothing.
    expect(traffic.circulatingTraffic(0, 0, 4.06, -27.5, 0, 10).vehicles).toHaveLength(0);
  });

  it("`approaching` is true while the car is still coming to his azimuth and `pastEntry` once it has gone by — never both", () => {
    const traffic = world();
    stageRingCar(traffic);
    const flags: string[] = [];
    for (let i = 0; i < 60 * 45; i++) {
      step(traffic, null);
      const v = report(traffic).vehicles[0];
      expect(v.approaching && v.pastEntry).toBe(false);
      const f = v.approaching ? "A" : v.pastEntry ? "P" : "-";
      if (flags[flags.length - 1] !== f) flags.push(f);
    }
    // Round the far side it is neither counted nor past (out of reach, or more
    // than half a lap away); it comes into reach, approaches, and goes by. (For
    // a few frames at his azimuth it is neither: presence wants it 1.5 m to his
    // left, which it stops being a moment before it is geometrically past.)
    expect(flags.join("")).toMatch(/A-?P/);
    // It flips at his azimuth: on the frame it first reads `pastEntry` after
    // approaching, the car is within a degree of φ = atan(4.06 / 27.5) = 8.4°.
    const t2 = world();
    stageRingCar(t2);
    let approached = false;
    let flipPhi: number | null = null;
    for (let i = 0; i < 60 * 45 && flipPhi === null; i++) {
      step(t2, null);
      const v = report(t2).vehicles[0];
      if (approached && v.pastEntry) flipPhi = phiOf(v.x, v.y);
      if (v.approaching) approached = true;
    }
    expect(flipPhi).not.toBeNull();
    expect(Math.abs(flipPhi! - 8.4)).toBeLessThan(1);
  });

  it("the rows are reused, not reallocated: the per-frame query settles to the same objects", () => {
    const traffic = world();
    stageRingCar(traffic);
    step(traffic, null);
    const first = report(traffic);
    const row = first.vehicles[0];
    step(traffic, null);
    const second = report(traffic);
    expect(second).toBe(first);
    expect(second.vehicles[0]).toBe(row);
  });
});

describe("circulatingRowsFor — the pure row builder", () => {
  const agent = (x: number, y: number, dirX: number, dirY: number, speedMps: number, shed: number, id = 1) => ({
    state: { id, x, y, dirX, dirY, speedMps },
    playerShedMps: shed,
  });

  it("writes one row per agent in the band from `from`, keeps what is before it, and returns the next index", () => {
    const out: CirculatingVehicle[] = [];
    const west = ring(270);
    const n1 = circulatingRowsFor([agent(west.x, west.y, 0, -1, 2.9, 0.7, 5)], 0, 0, 4.06, -27.5, 0, BAND, out, 0);
    expect(n1).toBe(1);
    const far = agent(200, 200, 1, 0, 9, 3, 6);
    const east = ring(90);
    const n2 = circulatingRowsFor([far, agent(east.x, east.y, 0, 1, 0, 1.5, 7)], 0, 0, 4.06, -27.5, 0, BAND, out, n1);
    expect(n2).toBe(2);
    expect(out.map((r) => r.id)).toEqual([5, 7]);
    expect(out.map((r) => r.playerShedMps)).toEqual([0.7, 1.5]);
    // A stopped car is still a row (a car he has just brought to a standstill
    // does 0 m/s) — but it is not `approaching`: presence wants it moving.
    expect(out[1].speedMps).toBe(0);
    expect(out[1].approaching).toBe(false);
  });

  it("EVERY ROW CARRIES ITS OWN BODY — half the length and half the width of the vehicle's profile, not a car's: a bus's rear end clears his mouth 4 m of road later than a car's does", () => {
    // The roundabout tracker's «passed the mouth» is the vehicle's REAR END
    // past it, and its contact test is the vehicle's box: both are read off
    // these two numbers (worldRuntime.ts rbPassedMouth / §4c). The tables are
    // written out here, not imported through the helper under test.
    const west = ring(270);
    const profiled = (profile: VehicleProfile | undefined, id: number) => ({
      state: { id, x: west.x, y: west.y, dirX: 0, dirY: -1, speedMps: 2.9, ...(profile ? { profile } : {}) },
      playerShedMps: 0,
    });
    const PROFILES: Array<VehicleProfile | undefined> = [undefined, "car", "van", "truck", "bus", "emergency", "tram", "cyclist"];
    const out: CirculatingVehicle[] = [];
    const n = circulatingRowsFor(PROFILES.map((p, i) => profiled(p, i + 1)), 0, 0, 4.06, -27.5, 0, BAND, out, 0);
    expect(n).toBe(PROFILES.length);
    PROFILES.forEach((p, i) => {
      expect(out[i].halfLengthM, String(p)).toBe(VEHICLE_PROFILE_LENGTH_M[p ?? "car"] / 2);
      expect(out[i].halfWidthM, String(p)).toBe(VEHICLE_PROFILE_WIDTH_M[p ?? "car"] / 2);
    });
    // The numbers themselves, for the two that matter most on a ring.
    expect(out[1].halfLengthM).toBe(2.05);
    expect(out[4].halfLengthM).toBe(6);
    expect(out[4].halfLengthM - out[1].halfLengthM).toBeCloseTo(3.95, 6);
    expect(out[3].halfLengthM).toBeGreaterThan(out[1].halfLengthM + 1);
    // Rows are reused: a row that was a bus last frame is a car's size when a car is written into it.
    circulatingRowsFor([profiled("car", 99)], 0, 0, 4.06, -27.5, 0, BAND, out, 4);
    expect(out[4].id).toBe(99);
    expect(out[4].halfLengthM).toBe(2.05);
  });
});
