import { describe, expect, it } from "vitest";
import type { SignalPhase } from "../../contracts";
import { createTrafficSystem } from "../system";
import type { TrafficSystem, TrafficUpdateContext } from "../types";
import { loadRealDistrict } from "./fixtures";

const DT = 1 / 60;
const PHASES: SignalPhase[] = ["red", "redYellow", "green", "yellow"];

/**
 * Deterministic scripted world: signal phases are a pure function of
 * (node id, time), the player drives a circle. Exercises signals, player
 * avoidance and pedestrian gates identically across runs.
 */
function makeScript() {
  let t = 0;
  const playerPos = { x: 0, y: 0 };
  const ctx: TrafficUpdateContext = {
    signalPhase: (id: string) =>
      PHASES[(id.charCodeAt(id.length - 1) + Math.floor(t / 7)) % PHASES.length],
    playerPos,
    playerSpeedKmh: 30,
    playerHeadingDeg: 0,
  };
  return {
    ctx,
    step(system: TrafficSystem) {
      t += DT;
      playerPos.x = 250 * Math.cos(t * 0.05);
      playerPos.y = 250 * Math.sin(t * 0.05);
      ctx.playerHeadingDeg = (t * 20) % 360;
      system.update(DT, ctx);
    },
  };
}

describe("determinism per seed (real district)", () => {
  it("same seed + same inputs = bit-identical playback", () => {
    const district = loadRealDistrict();
    const a = createTrafficSystem(district, { seed: 7 });
    const b = createTrafficSystem(district, { seed: 7 });
    const scriptA = makeScript();
    const scriptB = makeScript();

    expect(a.vehicles.length).toBe(b.vehicles.length);
    expect(a.pedestrians.length).toBe(b.pedestrians.length);
    expect(a.vehicles.length).toBeGreaterThanOrEqual(8);
    expect(a.pedestrians.length).toBeGreaterThanOrEqual(6);

    for (let step = 1; step <= 1800; step++) {
      scriptA.step(a);
      scriptB.step(b);
      if (step % 300 !== 0) continue;
      for (let i = 0; i < a.vehicles.length; i++) {
        expect(a.vehicles[i].x).toBe(b.vehicles[i].x);
        expect(a.vehicles[i].y).toBe(b.vehicles[i].y);
        expect(a.vehicles[i].speedMps).toBe(b.vehicles[i].speedMps);
        expect(a.vehicles[i].braking).toBe(b.vehicles[i].braking);
      }
      for (let i = 0; i < a.pedestrians.length; i++) {
        expect(a.pedestrians[i].x).toBe(b.pedestrians[i].x);
        expect(a.pedestrians[i].y).toBe(b.pedestrians[i].y);
        expect(a.pedestrians[i].onCrossing).toBe(b.pedestrians[i].onCrossing);
      }
    }
  });

  it("a different seed produces a different world", () => {
    const district = loadRealDistrict();
    const a = createTrafficSystem(district, { seed: 7 });
    const c = createTrafficSystem(district, { seed: 8 });
    const scriptA = makeScript();
    const scriptC = makeScript();
    for (let step = 0; step < 600; step++) {
      scriptA.step(a);
      scriptC.step(c);
    }
    let divergence = 0;
    for (let i = 0; i < Math.min(a.vehicles.length, c.vehicles.length); i++) {
      divergence += Math.abs(a.vehicles[i].x - c.vehicles[i].x);
      divergence += Math.abs(a.vehicles[i].y - c.vehicles[i].y);
    }
    expect(divergence).toBeGreaterThan(1);
  });
});

describe("performance envelope", () => {
  it("stays well under 1 ms/frame at target agent counts", () => {
    const district = loadRealDistrict();
    const system = createTrafficSystem(district, {
      seed: 42,
      vehicleCount: 12,
      pedestrianCount: 10,
    });
    expect(system.stats.vehicleCount).toBe(12);
    expect(system.stats.pedestrianCount).toBe(10);

    const script = makeScript();
    for (let i = 0; i < 300; i++) script.step(system); // warmup / JIT
    const t0 = performance.now();
    const frames = 3000;
    for (let i = 0; i < frames; i++) script.step(system);
    const avgMs = (performance.now() - t0) / frames;
    console.log(`traffic update avg: ${avgMs.toFixed(4)} ms/frame (12 veh + 10 ped)`);
    // Generous CI bound; locally this measures in the tens of microseconds.
    expect(avgMs).toBeLessThan(2);
  });
});
