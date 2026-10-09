/**
 * THE STAGED WORLD'S CLOCK — sc-roundabout-entry:7b747c15 (traffic half).
 *
 * Staged actors are integrated in steps of at most STAGED_MAX_SUBSTEP_SEC —
 * the ego car's own physics step — whatever the frame, and between two of
 * those steps the `StagedSubstepListener` (the scenario director) is handed
 * the sub-step time and the player's interpolated pose. Pinned here:
 *
 *   1. the step IS the physics step (FIXED_DT), and a 60 Hz frame is one
 *      staged step — the call every committed demo was recorded with;
 *   2. the same command stream moves a staged car to the same place on every
 *      cadence (within 1 cm after 6 s), where the old 0.1 s ambient sub-steps
 *      left it a frame-dependent distance away;
 *   3. the listener contract: never called on a one-step frame, called at
 *      every interior step of a long frame with exact times and a linearly
 *      interpolated player, `frameEnd` after every update, and never across a
 *      teleport of the player.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RoundaboutEntrySpec } from "../../contracts";
import { compileScenario } from "../../lessons/scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../../lessons/scenario/templates-flow";
import { FIXED_DT } from "../../vehicle/tuning";
import { createTrafficSystem, STAGED_MAX_SUBSTEP_SEC, stagedSubStepsPer } from "../system";
import type { StagedSubstepPlayer, TrafficDistrict } from "../types";
import { PlayerStepTrackBuffer } from "../playerTrack";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const RAW = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "rb-mini-v1.json"), "utf-8"),
) as TrafficDistrict;

const RING = (compileScenario(SC_ROUNDABOUT_ENTRY, 1).stagedEvents ?? []).find(
  (s) => s.kind === "roundaboutEntry",
) as RoundaboutEntrySpec;

function world() {
  const traffic = createTrafficSystem(RAW, { vehicleCount: 0, pedestrianCount: 0 });
  const view = traffic.stage({
    kind: "vehicle",
    id: "clock-car",
    pathNodes: RING.actor.pathNodes,
    hold: RING.actor.hold,
    cruiseSpeedMps: RING.actor.cruiseSpeedMps,
    loop: true,
    colorIndex: 0,
  });
  if (!view) throw new Error("the ring path failed to stage");
  return traffic;
}

/** A far-away, parked player (the car never meets him). */
const FAR = { x: 400, y: 400 };

function driveFor(frames: readonly number[], seconds: number): number {
  const traffic = world();
  const ctx = { signalPhase: () => "green" as const, playerPos: FAR, playerSpeedKmh: 0, playerHeadingDeg: 0 };
  traffic.update(1 / 60, ctx);
  traffic.stagedCommand("clock-car", { type: "cruise" });
  let t = 0;
  let i = 0;
  while (t < seconds - 1e-9) {
    const dt = Math.min(frames[i++ % frames.length], seconds - t);
    traffic.update(dt, ctx);
    t += dt;
  }
  return traffic.staged("clock-car")!.s;
}

describe("staged actors run on the physics step", () => {
  it("the step is FIXED_DT; one 60 Hz frame is one step; longer frames are the fewest equal steps ≤ it", () => {
    expect(STAGED_MAX_SUBSTEP_SEC).toBe(FIXED_DT);
    expect(stagedSubStepsPer(1 / 60)).toBe(1);
    expect(stagedSubStepsPer(1 / 30)).toBe(2);
    expect(stagedSubStepsPer(0.1)).toBe(6);
    expect(stagedSubStepsPer(0.0168)).toBe(2); // a real «60 Hz» frame a hair long
    expect(stagedSubStepsPer(0)).toBe(0);
  });

  it("the same command stream puts the car in the same place on every cadence (≤ 1 cm after 6 s)", () => {
    const ref = driveFor([1 / 60], 6);
    const runs: Array<[string, number]> = [
      ["30 Hz", driveFor([1 / 30], 6)],
      ["steady 0.1 s", driveFor([0.1], 6)],
      ["steady 0.5 s", driveFor([0.5], 6)],
      ["phone-like (frames already through rapier's 0.5 s clamp)", driveFor([0.234, 0.5, 0.255, 0.5, 0.259, 0.5, 0.5, 0.277, 0.311], 6)],
    ];
    for (const [name, s] of runs) {
      expect(Math.abs(s - ref), `${name}: ${s.toFixed(4)} m vs 60 Hz ${ref.toFixed(4)} m`).toBeLessThan(0.01);
    }
  });
});

describe("the sub-step listener contract", () => {
  function recorder() {
    const calls: Array<{ e: number; h: number; f: number; p: StagedSubstepPlayer }> = [];
    let ends = 0;
    return {
      calls,
      ends: () => ends,
      listener: {
        substep(e: number, h: number, f: number, p: Readonly<StagedSubstepPlayer>) {
          calls.push({ e, h, f, p: { ...p } });
        },
        frameEnd() {
          ends++;
        },
      },
    };
  }

  it("is silent on one-step frames and on the first update (nothing to interpolate from)", () => {
    const traffic = world();
    const rec = recorder();
    traffic.setStagedSubstepListener(rec.listener);
    const ctx = { signalPhase: () => "green" as const, playerPos: { x: 0, y: -60 }, playerSpeedKmh: 30, playerHeadingDeg: 0 };
    traffic.update(0.5, ctx); // first update: no previous pose
    for (let i = 0; i < 30; i++) traffic.update(1 / 60, { ...ctx, playerPos: { x: 0, y: -60 + 0.14 * (i + 1) } });
    expect(rec.calls).toEqual([]);
    expect(rec.ends()).toBe(31);
  });

  it("calls every interior step of a long frame, at its time, with the player interpolated", () => {
    const traffic = world();
    const rec = recorder();
    traffic.setStagedSubstepListener(rec.listener);
    const base = { signalPhase: () => "green" as const, playerHeadingDeg: 10 };
    traffic.update(1 / 60, { ...base, playerPos: { x: 0, y: -60 }, playerSpeedKmh: 36 });
    traffic.update(0.5, { ...base, playerPos: { x: 0, y: -55 }, playerSpeedKmh: 36, playerHeadingDeg: 20 });
    expect(rec.calls).toHaveLength(29);
    rec.calls.forEach((c, k) => {
      const j = k + 1;
      expect(c.h).toBeCloseTo(1 / 60, 12);
      expect(c.f).toBeCloseTo(0.5, 12);
      expect(c.e).toBeCloseTo(j / 60, 12);
      expect(c.p.y).toBeCloseTo(-60 + 5 * (j / 30), 9);
      expect(c.p.speedKmh).toBeCloseTo(36, 9);
      expect(c.p.headingDeg).toBeCloseTo(10 + 10 * (j / 30), 9);
    });
    expect(rec.ends()).toBe(2);
  });

  it("never interpolates across a teleport (a respawn is not a drive)", () => {
    const traffic = world();
    const rec = recorder();
    traffic.setStagedSubstepListener(rec.listener);
    const base = { signalPhase: () => "green" as const, playerHeadingDeg: 0, playerSpeedKmh: 0 };
    traffic.update(1 / 60, { ...base, playerPos: { x: 0, y: -60 } });
    traffic.update(0.5, { ...base, playerPos: { x: 0, y: 60 } }); // 120 m at a standstill
    expect(rec.calls).toEqual([]);
    expect(rec.ends()).toBe(2);
  });
});

/*
 * ROUND 2 — the staged world on the SESSION's grid, the student's own per-step
 * states, and the path end / retirement / re-entry on the session clock.
 */
describe("round 2: the session grid, the per-step track, and the path end", () => {
  const green = () => "green" as const;

  /** Same car as `world()` but NOT looping, so it runs out of road, retires and comes back. */
  function openWorld() {
    const traffic = createTrafficSystem(RAW, { vehicleCount: 0, pedestrianCount: 0 });
    const view = traffic.stage({
      kind: "vehicle",
      id: "open-car",
      pathNodes: RING.actor.pathNodes,
      hold: RING.actor.hold,
      cruiseSpeedMps: 12,
      colorIndex: 0,
    });
    if (!view) throw new Error("the ring path failed to stage");
    return traffic;
  }

  /** Drive `seconds` of session time on a cadence, passing the session clock; sample at frame ends. */
  function driveAligned(
    make: () => ReturnType<typeof createTrafficSystem>,
    id: string,
    frames: readonly number[],
    seconds: number,
  ) {
    const traffic = make();
    const ctx = { signalPhase: green, playerPos: FAR, playerSpeedKmh: 0, playerHeadingDeg: 0 };
    let t = 1 / 60;
    traffic.update(1 / 60, { ...ctx, sessionTimeSec: t });
    traffic.stagedCommand(id, { type: "cruise" });
    const samples: Array<[number, number, number]> = [];
    let i = 0;
    while (t < seconds - 1e-9) {
      const dt = Math.min(frames[i++ % frames.length], seconds - t);
      t += dt;
      traffic.update(dt, { ...ctx, sessionTimeSec: t });
      const v = traffic.staged(id)!;
      samples.push([t, v.s, v.returns ?? 0]);
    }
    const v = traffic.staged(id)!;
    return { s: v.s, x: v.x, y: v.y, returns: v.returns ?? 0, samples };
  }

  it("with the session clock, staged steps are cut at k·FIXED_DT and the director is called there", () => {
    const traffic = world();
    const rec: Array<{ e: number; h: number }> = [];
    traffic.setStagedSubstepListener({ substep: (e, h) => rec.push({ e, h }), frameEnd: () => {} });
    const base = { signalPhase: green, playerHeadingDeg: 0, playerSpeedKmh: 36 };
    const t0 = 1 / 60;
    traffic.update(t0, { ...base, playerPos: { x: 0, y: -60 }, sessionTimeSec: t0 });
    const dt = 0.277;
    traffic.update(dt, { ...base, playerPos: { x: 0, y: -60 + 10 * dt }, sessionTimeSec: t0 + dt });
    // Grid points strictly inside (t0, t0 + dt): k = 2 … 17 (17/60 = 0.2833 < 0.2937).
    expect(rec.map((c) => Math.round((t0 + c.e) * 60))).toEqual(Array.from({ length: 16 }, (_, i) => i + 2));
    for (const c of rec) expect(Math.abs((t0 + c.e) * 60 - Math.round((t0 + c.e) * 60))).toBeLessThan(1e-9);
    // The time handed over is the time since the director last decided.
    for (const c of rec) expect(c.h).toBeCloseTo(1 / 60, 12);
  });

  it("the same command stream on the session grid: the car agrees to ≤ 2 mm on every cadence after 6 s", () => {
    const ref = driveAligned(world, "clock-car", [1 / 60], 6);
    const cadences: Array<[string, readonly number[]]> = [
      ["30 Hz", [1 / 30]],
      ["0.25/0.4 s", [0.25, 0.4]],
      ["phone-like", [0.234, 0.5, 0.255, 0.5, 0.259, 0.5, 0.5, 0.277, 0.311]],
      ["steady 0.37 s", [0.37]],
    ];
    for (const [name, frames] of cadences) {
      const run = driveAligned(world, "clock-car", frames, 6);
      expect(Math.abs(run.s - ref.s), `${name}: ${run.s.toFixed(5)} vs ${ref.s.toFixed(5)}`).toBeLessThan(0.002);
    }
  });

  it("the path end, the retirement run and the re-entry are timed on the session clock (RETURN_DUE_SEC)", () => {
    const T = 90;
    const ref = driveAligned(openWorld, "open-car", [1 / 60], T);
    expect(ref.returns, "the car really ran out of road, retired and came back").toBeGreaterThanOrEqual(1);
    const cadences: Array<[string, readonly number[]]> = [
      ["0.25/0.4 s", [0.25, 0.4]],
      ["phone-like", [0.234, 0.5, 0.255, 0.5, 0.259, 0.5, 0.5, 0.277, 0.311]],
      ["steady 0.37 s", [0.37]],
    ];
    for (const [name, frames] of cadences) {
      const run = driveAligned(openWorld, "open-car", frames, T);
      expect(run.returns, `${name}: re-entries`).toBe(ref.returns);
      // One physics step of its travel (12 m/s) + 1 cm, after path ends, 70 m runs and re-entries.
      expect(Math.hypot(run.x - ref.x, run.y - ref.y), `${name}: pose at ${T} s`).toBeLessThan(12 / 60 + 0.01);
      // …and at every frame of the run that falls on a 60 Hz frame, on the same lap.
      for (const [t, s, n] of run.samples) {
        const j = ref.samples.findIndex(([u]) => u >= t - 1e-9);
        if (j < 0) continue;
        const [u, rs, rn] = ref.samples[j];
        if (Math.abs(u - t) > 1e-6 || rn !== n) continue;
        expect(Math.abs(s - rs), `${name}: arc at ${t.toFixed(3)} s`).toBeLessThan(12 / 60 + 0.01);
      }
    }
  });

  it("a long frame carrying the car's per-step states hands THOSE to the director, not the chord", () => {
    const traffic = world();
    const rec: Array<{ e: number; p: StagedSubstepPlayer }> = [];
    traffic.setStagedSubstepListener({ substep: (e, _h, _f, p) => rec.push({ e, p: { ...p } }), frameEnd: () => {} });
    const base = { signalPhase: green, playerHeadingDeg: 0 };
    traffic.update(1 / 60, { ...base, playerPos: { x: 0, y: -60 }, playerSpeedKmh: 36, sessionTimeSec: 1 / 60 });
    // He brakes to rest 1 m on in the first 0.2 s of a 0.5 s frame and stands: the chord would
    // have him rolling at 18 km/h half-way through the frame.
    const track = new PlayerStepTrackBuffer();
    const yAt = (tau: number) => -60 + (tau < 0.2 ? 10 * tau - 25 * tau * tau : 1);
    const vAt = (tau: number) => (tau < 0.2 ? (10 - 50 * tau) * 3.6 : 0);
    for (let k = 1; k < 30; k++) track.push(k / 60, 0, yAt(k / 60), vAt(k / 60), 0);
    traffic.update(0.5, {
      ...base,
      playerPos: { x: 0, y: yAt(0.5) },
      playerSpeedKmh: 0,
      playerTrack: track,
      sessionTimeSec: 1 / 60 + 0.5,
    });
    expect(rec).toHaveLength(29);
    for (const c of rec) {
      expect(c.p.y).toBeCloseTo(yAt(c.e), 9);
      expect(c.p.speedKmh).toBeCloseTo(vAt(c.e), 9);
    }
    // Half-way through the frame he is standing; the chord said 18 km/h.
    expect(rec[14].p.speedKmh).toBe(0);
  });

  it("…including across a pose jump the speeds cannot explain (the samples are real; nothing is invented)", () => {
    const base = { signalPhase: green, playerHeadingDeg: 0, playerSpeedKmh: 12 };
    const run = (withTrack: boolean) => {
      const traffic = world();
      const rec: number[] = [];
      traffic.setStagedSubstepListener({ substep: (e) => rec.push(e), frameEnd: () => {} });
      traffic.update(1 / 60, { ...base, playerPos: { x: 0, y: -60 }, sessionTimeSec: 1 / 60 });
      const track = new PlayerStepTrackBuffer();
      for (let k = 1; k < 24; k++) track.push(k / 60, 0, -60 + (k < 12 ? 0.05 * k : 4 + 0.05 * k), 12, 0);
      // 5.2 m in 0.4 s at «12 km/h»: the chord test alone calls this a teleport.
      traffic.update(0.4, {
        ...base,
        playerPos: { x: 0, y: -54.8 },
        playerTrack: withTrack ? track : null,
        sessionTimeSec: 1 / 60 + 0.4,
      });
      return rec;
    };
    expect(run(true)).toHaveLength(23);
    expect(run(false), "without the track it is a teleport, as before").toEqual([]);
  });
});

describe("round 2: RETURN_DUE_SEC inside a step the frame end cut short", () => {
  const green = () => "green" as const;
  const ctx = { signalPhase: green, playerPos: FAR, playerSpeedKmh: 0, playerHeadingDeg: 0 };

  function open(speed: number) {
    const traffic = createTrafficSystem(RAW, { vehicleCount: 0, pedestrianCount: 0 });
    traffic.stage({
      kind: "vehicle",
      id: "due-car",
      pathNodes: RING.actor.pathNodes,
      hold: RING.actor.hold,
      cruiseSpeedMps: speed,
      colorIndex: 0,
    });
    traffic.update(1 / 60, { ...ctx, sessionTimeSec: 1 / 60 });
    traffic.stagedCommand("due-car", { type: "cruise" });
    return traffic;
  }

  /** 60 Hz to `until`, sampling the car; the first frame ending after `cut` ends AT `cut` instead. */
  function drive(speed: number, until: number, cut: number | null) {
    const traffic = open(speed);
    const out: Array<{ t: number; s: number; v: number; fin: boolean; returns: number; x: number; y: number }> = [];
    let k = 1;
    let t = 1 / 60;
    let cutDone = cut === null;
    while (t < until - 1e-9) {
      let next = (k + 1) / 60;
      if (!cutDone && next > cut! + 1e-12) {
        next = cut!;
        cutDone = true;
      } else {
        k++;
      }
      traffic.update(next - t, { ...ctx, sessionTimeSec: next });
      t = next;
      const v = traffic.staged("due-car")!;
      out.push({ t, s: v.s, v: v.speedMps, fin: v.finished, returns: v.returns ?? 0, x: v.x, y: v.y });
    }
    return out;
  }

  it("a re-entry that falls due one step after a run ending just inside a cut step lands where the 60 Hz one does", () => {
    // Pick a cruise speed whose retirement run ends well inside a physics step (≥ 5 ms past a grid
    // point), so re-entering one step early would show: the car would start 5–16 ms early.
    let chosen: { speed: number; tc: number } | null = null;
    for (const speed of [12, 11, 10, 9, 13, 14]) {
      const ref = drive(speed, 60, null);
      const i = ref.findIndex((r) => r.fin);
      if (i <= 0 || ref[i - 1].v <= 0) continue;
      const a = ref[i - 1];
      const tEnd = a.t + (RING_LEN(ref) - a.s) / a.v; // the instant the car passed its last node
      const tc = tEnd + 70 / Math.max(a.v, 4); // …and the instant its 70 m retirement run ended
      const phase = tc * 60 - Math.floor(tc * 60);
      if (phase > 0.3 && phase < 0.95) {
        chosen = { speed, tc };
        break;
      }
    }
    expect(chosen, "a cruise speed whose run ends mid-step").not.toBeNull();
    const { speed, tc } = chosen!;
    const T = tc + 3;
    const ref = drive(speed, T, null);
    // The frame end lands 1 ms after the run ends: the next staged step is cut short.
    const cutRun = drive(speed, T, tc + 0.001);
    const r = ref[ref.length - 1];
    const c = cutRun[cutRun.length - 1];
    expect(r.returns).toBe(1);
    expect(c.returns).toBe(1);
    // Re-entered at the same instant (one physics step after the run, on the session clock) and
    // owed the same part of its first step: the two cars agree to the millimetre 3 s later.
    expect(Math.hypot(c.x - r.x, c.y - r.y), `cruise ${speed} m/s, run ended at ${tc.toFixed(4)} s`).toBeLessThan(0.002);
  });
});

/** The ring path's length as the replay published it (the view's arc at the frame it finished). */
function RING_LEN(samples: ReadonlyArray<{ s: number; fin: boolean }>): number {
  const f = samples.find((r) => r.fin);
  return f ? f.s : Infinity;
}

/*
 * ROUND 3 — THE FIXED-STEP ACCUMULATOR (system.ts stepGrid). The round-2 grid
 * cut a step at every frame end, so a frame shorter than the step, or ending
 * off the grid, integrated the world on a finer, frame-dependent grid (its
 * verifier: 75 census cells over at 120 Hz, 99 at 144 Hz, 40 on a desktop
 * jitter). Now the world advances ONLY at the grid points k·FIXED_DT, in whole
 * steps, and the index of the last one is an integer.
 */
describe("round 3: the fixed-step accumulator", () => {
  const green = () => "green" as const;
  const ctx = { signalPhase: green, playerPos: FAR, playerSpeedKmh: 0, playerHeadingDeg: 0 };
  const gridK = (t: unknown) => (t as { gridK: number }).gridK;

  /** Drive `seconds` on a cadence (the last frame cut to end exactly there), passing the session clock. */
  function driveGrid(
    make: () => ReturnType<typeof createTrafficSystem>,
    id: string,
    frames: readonly number[],
    seconds: number,
    each?: (t: number, traffic: ReturnType<typeof createTrafficSystem>) => void,
    /** No session clock: the recorder / clip-feed path (equal steps of ≤ one step per frame). */
    legacy = false,
  ) {
    const traffic = make();
    let t = 1 / 60;
    traffic.update(1 / 60, legacy ? ctx : { ...ctx, sessionTimeSec: t });
    traffic.stagedCommand(id, { type: "cruise" });
    let i = 0;
    while (t < seconds - 1e-9) {
      const dt = Math.min(frames[i++ % frames.length], seconds - t);
      t += dt;
      traffic.update(dt, legacy ? ctx : { ...ctx, sessionTimeSec: t });
      each?.(t, traffic);
    }
    return traffic;
  }

  it("a frame advances exactly the grid points it crosses: none inside one step, n whole steps across n", () => {
    const traffic = world();
    const calls: Array<{ g: number | undefined; h: number }> = [];
    const ends: Array<[boolean | undefined, number | undefined]> = [];
    traffic.setStagedSubstepListener({
      substep: (_e, h, _f, _p, g) => calls.push({ g, h }),
      frameEnd: (d, h) => ends.push([d, h]),
    });
    let t = 1 / 60;
    traffic.update(1 / 60, { ...ctx, sessionTimeSec: t });
    expect(gridK(traffic)).toBe(1);
    traffic.stagedCommand("clock-car", { type: "cruise" });
    // 120 Hz: the first half-step frame advances NOTHING…
    const s0 = traffic.staged("clock-car")!.s;
    t += 1 / 120;
    traffic.update(1 / 120, { ...ctx, sessionTimeSec: t });
    expect(gridK(traffic)).toBe(1);
    expect(traffic.staged("clock-car")!.s).toBe(s0);
    expect(ends[ends.length - 1]).toEqual([false, FIXED_DT]);
    // …the second reaches the grid point: one whole step, decided at the frame end.
    t += 1 / 120;
    traffic.update(1 / 120, { ...ctx, sessionTimeSec: t });
    expect(gridK(traffic)).toBe(2);
    expect(traffic.staged("clock-car")!.s).toBeGreaterThan(s0);
    expect(ends[ends.length - 1]).toEqual([true, FIXED_DT]);
    expect(calls).toEqual([]);
    // A 0.2937 s frame ending off the grid (2/60 + 0.2937 = 19.62 steps): grid points 3…19, each a
    // whole step decided at its own instant (k·FIXED_DT exactly), the frame end deciding nothing.
    t += 0.2937;
    traffic.update(0.2937, { ...ctx, sessionTimeSec: t });
    expect(gridK(traffic)).toBe(19);
    expect(calls.map((c) => c.g)).toEqual(Array.from({ length: 17 }, (_, i) => (i + 3) * FIXED_DT));
    for (const c of calls) expect(c.h).toBe(FIXED_DT);
    expect(ends[ends.length - 1]).toEqual([false, FIXED_DT]);
  });

  it("the same command stream: the staged car is the SAME car on every cadence (≤ 1 µm after 6 s)", () => {
    const ref = driveGrid(world, "clock-car", [1 / 60], 6).staged("clock-car")!.s;
    const cadences: Array<[string, readonly number[]]> = [
      ["120 Hz", [1 / 120]],
      ["144 Hz", [1 / 144]],
      ["60 Hz ±1 ms", [1 / 60 + 0.001, 1 / 60 - 0.0007, 1 / 60 + 0.0004, 1 / 60 - 0.001]],
      ["desktop jitter", [0.011, 0.017, 0.012, 0.02, 0.014, 0.033, 0.01, 0.035, 0.161, 0.5]],
      ["phone-like", [0.234, 0.5, 0.255, 0.5, 0.259, 0.5, 0.5, 0.277, 0.311]],
      ["steady 0.37 s", [0.37]],
    ];
    for (const [name, frames] of cadences) {
      const s = driveGrid(world, "clock-car", frames, 6).staged("clock-car")!.s;
      expect(Math.abs(s - ref), `${name}: ${s.toFixed(9)} vs 60 Hz ${ref.toFixed(9)}`).toBeLessThan(1e-6);
    }
  });

  /*
   * F3 (round-2 verifier): `agent.carrySec = 0` survived every test, because a
   * missing carry moves a returned car by less than one step — inside every
   * one-step bound — and with the fixed grid it is missing identically on
   * every cadence, so no cross-cadence comparison can see it. So this pins the
   * re-entry against its EXACT due position: a car with an instant
   * acceleration (accelMps2 1e6) runs its path at constant v, finishes it at
   * t_end = t_cmd + (L − s₀)/v, runs its 70 m retirement to t_run = t_end +
   * 70/v, falls due one physics step later (RETURN_DUE_SEC) and must then be
   * at s₀ + v·(t − t_due) — to the millimetre, on every cadence.
   */
  it("F3: a re-entered car is where it would be had it re-entered at the instant it fell due (≤ 1 mm)", () => {
    const openCar = (v: number) => () => {
      const traffic = createTrafficSystem(RAW, { vehicleCount: 0, pedestrianCount: 0 });
      traffic.stage({
        kind: "vehicle",
        id: "due-car",
        pathNodes: RING.actor.pathNodes,
        hold: RING.actor.hold,
        cruiseSpeedMps: v,
        accelMps2: 1e6,
        colorIndex: 0,
      });
      return traffic;
    };
    // A speed whose due instant falls well inside a step, so a missing carry is ≥ 30 % of a step.
    let chosen: { v: number; tDue: number; s0: number } | null = null;
    for (const v of [12, 11, 13, 10, 14, 9, 15]) {
      const probe = openCar(v)();
      const view = probe.staged("due-car")!;
      const s0 = view.s;
      const L = view.pathLengthM;
      const tCmd = 1 / 60;
      const tDue = tCmd + (L - s0) / v + 70 / v + 1 / 60;
      const phase = tDue * 60 - Math.floor(tDue * 60);
      if (phase > 0.3 && phase < 0.7) {
        chosen = { v, tDue, s0 };
        break;
      }
    }
    expect(chosen, "a cruise speed whose re-entry falls due mid-step").not.toBeNull();
    const { v, tDue, s0 } = chosen!;
    const T = Math.ceil((tDue + 3) * 60) / 60;
    for (const [name, frames] of [
      ["60 Hz", [1 / 60]],
      ["144 Hz", [1 / 144]],
      ["phone-like", [0.234, 0.5, 0.255, 0.5, 0.259, 0.5, 0.5, 0.277, 0.311]],
      ["steady 0.37 s", [0.37]],
      // Without the session clock (the recorder, the clip feed) steps can be SHORTER than
      // RETURN_DUE_SEC — there the due time, not the next step, decides the re-entry.
      ["no session clock, 120 Hz", [1 / 120]],
      ["no session clock, 0.37 s", [0.37]],
    ] as Array<[string, number[]]>) {
      const traffic = driveGrid(openCar(v), "due-car", frames, T, undefined, name.startsWith("no session clock"));
      const view = traffic.staged("due-car")!;
      expect(view.returns, `${name}: one re-entry`).toBe(1);
      const expected = s0 + v * (T - tDue);
      expect(Math.abs(view.s - expected), `${name}: arc ${view.s.toFixed(5)} vs due ${expected.toFixed(5)} (v ${v}, due ${tDue.toFixed(5)} s)`).toBeLessThan(0.001);
    }
  });
});

/*
 * ROUND 3 — WHAT IS DRAWN. Grading reads the grid states; the renderer draws
 * each body between its last two grid states by `renderFraction` — exactly one
 * physics step behind the frame end, the lag rapier draws the student's own
 * car at (`<Physics interpolate>`: lerp(previous, current, accumulator/step)).
 */
describe("round 3: the drawn pose (render only)", () => {
  const green = () => "green" as const;
  const ctx = { signalPhase: green, playerPos: FAR, playerSpeedKmh: 0, playerHeadingDeg: 0 };
  const gridK = (t: unknown) => (t as { gridK: number }).gridK;

  /** Every grid state of the 60 Hz run, by grid index (the world is identical on every cadence). */
  function gridStates(seconds: number): Map<number, [number, number]> {
    const traffic = world();
    const out = new Map<number, [number, number]>();
    let t = 1 / 60;
    traffic.update(1 / 60, { ...ctx, sessionTimeSec: t });
    traffic.stagedCommand("clock-car", { type: "cruise" });
    const idx = () => traffic.vehicles.findIndex((v) => v.id >= 1000);
    out.set(gridK(traffic), [traffic.vehicles[idx()].x, traffic.vehicles[idx()].y]);
    for (let k = 2; k * FIXED_DT <= seconds + 1e-9; k++) {
      t += 1 / 60;
      traffic.update(1 / 60, { ...ctx, sessionTimeSec: t });
      const v = traffic.vehicles[idx()];
      out.set(gridK(traffic), [v.x, v.y]);
    }
    return out;
  }

  it("never off the segment between its two grid states, one step behind the frame end; a grid state exactly on a grid frame", () => {
    const ref = gridStates(6);
    const pose = { x: 0, y: 0, dirX: 0, dirY: 0 };
    for (const [name, frames] of [
      ["60 Hz", [1 / 60]],
      ["120 Hz", [1 / 120]],
      ["144 Hz", [1 / 144]],
      ["desktop jitter", [0.011, 0.017, 0.012, 0.02, 0.014, 0.033, 0.01, 0.035, 0.161]],
      ["steady 0.37 s", [0.37]],
    ] as Array<[string, number[]]>) {
      const traffic = world();
      let t = 1 / 60;
      traffic.update(1 / 60, { ...ctx, sessionTimeSec: t });
      traffic.stagedCommand("clock-car", { type: "cruise" });
      const i = traffic.vehicles.findIndex((v) => v.id >= 1000);
      let j = 0;
      let onGridFrames = 0;
      while (t < 6 - 1e-9) {
        const dt = Math.min(frames[j++ % frames.length], 6 - t);
        t += dt;
        traffic.update(dt, { ...ctx, sessionTimeSec: t });
        const K = gridK(traffic);
        if (K < 2) continue; // the 60 Hz reference starts at grid point 1
        const a = ref.get(K - 1)!;
        const b = ref.get(K)!;
        traffic.vehicleRenderPose(i, pose);
        // On the segment [a, b]: its projection parameter in [0, 1] and no distance off it.
        const sx = b[0] - a[0];
        const sy = b[1] - a[1];
        const len2 = sx * sx + sy * sy;
        const u = len2 > 0 ? ((pose.x - a[0]) * sx + (pose.y - a[1]) * sy) / len2 : 0;
        const off = Math.hypot(pose.x - (a[0] + u * sx), pose.y - (a[1] + u * sy));
        expect(u, `${name} t=${t.toFixed(4)}: along the segment`).toBeGreaterThanOrEqual(-1e-9);
        expect(u, `${name} t=${t.toFixed(4)}: along the segment`).toBeLessThanOrEqual(1 + 1e-9);
        expect(off, `${name} t=${t.toFixed(4)}: off the segment`).toBeLessThan(1e-9);
        // One step behind the frame end: the drawn instant is t − FIXED_DT, i.e. u = (t − K·step)/step.
        const lagFrac = (t - K * FIXED_DT) / FIXED_DT;
        const onGrid = Math.abs(lagFrac) < 1e-6;
        expect(traffic.renderFraction, `${name} t=${t.toFixed(4)}: fraction`).toBeCloseTo(onGrid ? 0 : lagFrac, 9);
        if (len2 > 1e-12) expect(u, `${name} t=${t.toFixed(4)}: drawn at t − one step`).toBeCloseTo(onGrid ? 0 : lagFrac, 6);
        if (onGrid) {
          onGridFrames++;
          // A frame that ends ON a grid point draws a grid state exactly (no blend).
          expect(pose.x).toBe(a[0]);
          expect(pose.y).toBe(a[1]);
        }
      }
      if (name === "60 Hz" || name === "120 Hz") expect(onGridFrames, `${name}: grid frames seen`).toBeGreaterThan(100);
    }
  });

  it("round 4: one update per grid point (scene/gradeGrid.ts) + setRenderSessionTime(frame end) draws exactly what one whole-frame update draws", () => {
    const pa = { x: 0, y: 0, dirX: 0, dirY: 0 };
    const pb = { x: 0, y: 0, dirX: 0, dirY: 0 };
    for (const [name, frames] of [
      ["120 Hz", [1 / 120]],
      ["144 Hz", [1 / 144]],
      ["desktop jitter", [0.011, 0.017, 0.012, 0.02, 0.014, 0.033, 0.01, 0.035, 0.161]],
      ["steady 0.37 s", [0.37]],
    ] as Array<[string, number[]]>) {
      const whole = world();
      const grid = world();
      let t = 1 / 60;
      whole.update(1 / 60, { ...ctx, sessionTimeSec: t });
      grid.update(1 / 60, { ...ctx, sessionTimeSec: t });
      whole.stagedCommand("clock-car", { type: "cruise" });
      grid.stagedCommand("clock-car", { type: "cruise" });
      const i = whole.vehicles.findIndex((v) => v.id >= 1000);
      let kLast = 1;
      let j = 0;
      let lerped = 0;
      while (t < 4 - 1e-9) {
        const dt = frames[j++ % frames.length];
        t += dt;
        whole.update(dt, { ...ctx, sessionTimeSec: t });
        const kEnd = Math.floor(t / FIXED_DT + 1e-6);
        for (let k = kLast + 1; k <= kEnd; k++) grid.update(FIXED_DT, { ...ctx, sessionTimeSec: k * FIXED_DT });
        kLast = Math.max(kLast, kEnd);
        grid.setRenderSessionTime(t);
        expect(grid.renderFraction, `${name} t=${t.toFixed(4)}: fraction`).toBeCloseTo(whole.renderFraction, 9);
        whole.vehicleRenderPose(i, pa);
        grid.vehicleRenderPose(i, pb);
        expect(Math.hypot(pa.x - pb.x, pa.y - pb.y), `${name} t=${t.toFixed(4)}: drawn pose`).toBeLessThan(1e-9);
        if (grid.renderFraction > 0.05 && grid.renderFraction < 0.95) lerped++;
      }
      // The fraction really interpolates on these cadences (it is not pinned at 0 or 1).
      expect(lerped, `${name}: frames drawn between two grid states`).toBeGreaterThan(5);
    }
  });

  it("without the session clock nothing is interpolated: the drawn pose is the simulated one", () => {
    const traffic = world();
    traffic.update(1 / 60, ctx);
    traffic.stagedCommand("clock-car", { type: "cruise" });
    for (let k = 0; k < 30; k++) traffic.update(0.037, ctx);
    const i = traffic.vehicles.findIndex((v) => v.id >= 1000);
    const pose = traffic.vehicleRenderPose(i, { x: 0, y: 0, dirX: 0, dirY: 0 });
    expect(traffic.renderFraction).toBe(1);
    expect([pose.x, pose.y]).toEqual([traffic.vehicles[i].x, traffic.vehicles[i].y]);
  });

  it("a teleport (FR-B5-RETURN re-entry) is drawn where the body now is, never swept across the road", () => {
    const traffic = createTrafficSystem(RAW, { vehicleCount: 0, pedestrianCount: 0 });
    traffic.stage({ kind: "vehicle", id: "jump-car", pathNodes: RING.actor.pathNodes, hold: RING.actor.hold, cruiseSpeedMps: 14, colorIndex: 0 });
    let t = 1 / 60;
    traffic.update(1 / 60, { ...ctx, sessionTimeSec: t });
    traffic.stagedCommand("jump-car", { type: "cruise" });
    const i = traffic.vehicles.findIndex((v) => v.id >= 1000);
    const pose = { x: 0, y: 0, dirX: 0, dirY: 0 };
    // 120 Hz: every other frame ends ON the grid and draws the PREVIOUS grid state, the one
    // before a re-entry when the re-entry was that frame's step — so a sweep would show.
    let after = -1;
    let frames = 0;
    while (t < 90 && (after < 0 || frames - after < 20)) {
      t += 1 / 120;
      frames++;
      traffic.update(1 / 120, { ...ctx, sessionTimeSec: t });
      if (after < 0 && (traffic.staged("jump-car")!.returns ?? 0) > 0) after = frames;
      traffic.vehicleRenderPose(i, pose);
      const v = traffic.vehicles[i];
      // Never more than one step of its travel from where it is (14 m/s · one step).
      expect(Math.hypot(pose.x - v.x, pose.y - v.y), `t=${t.toFixed(4)} s`).toBeLessThanOrEqual(14 * FIXED_DT + 1e-6);
    }
    expect(after, "the car came back round").toBeGreaterThan(0);
  });
});
