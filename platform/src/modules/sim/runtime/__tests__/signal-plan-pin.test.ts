/**
 * SIGNAL-PLAN one-shot pin (LessonSpec.signalPlan → armSignalPlan — the
 * founder traffic-light fix 2026-07-17), against the committed sx-v1
 * district (ONE single-node cluster "sx-n-c" at the origin, natural FNV-1a
 * offset; drawn lane centers ±4.0625 m; south stop line at y = −27.725).
 *
 * The capability contract:
 *  - the pin is APPROACH-RELATIVE: the first sample() frame inside the
 *    trigger ring rebases the cluster so the phase facing the player's OWN
 *    heading STARTS at that moment — greenFresh = full 20 s green,
 *    redFresh = full 26 s red (→ redYellow 1 s → green: the taught arc);
 *  - ONE-SHOT: a single rebase per arm; leaving and re-entering the ring
 *    never re-pins (the cycle continues from the rebased clock);
 *  - group-honest: the rebase pins the axis-group of the player's heading —
 *    the crossing axis shows the OPPOSITE phase;
 *  - fail-innocent: unknown clusterId / malformed triggerM / invalid arm
 *    values arm nothing (wall-clock behavior, bit-identical);
 *  - the trace RECORDER never calls armSignalPlan, so this whole file is
 *    LIVE-session behavior — the byte-frozen trace gates prove the rest.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SignalPlanSpec, VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "..";

const SX_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world/sx-v1.json",
);
const sxRaw = JSON.parse(readFileSync(SX_PATH, "utf-8")) as unknown;

const NODE = "sx-n-c";
const LANE = 4.0625;
/** The lesson-spawn anchor the scene passes (sx-spawn-south, district space). */
const SPAWN = { x: LANE, y: -120 };

function mkRuntime(): DistrictWorldRuntime {
  return createWorldRuntime(sxRaw);
}

function sampleAt(
  rt: DistrictWorldRuntime,
  x: number,
  y: number,
  headingDeg: number,
  t: number,
  speedKmh = 20,
) {
  const v: VehicleSample = {
    position: { x, y },
    headingDeg,
    speedKmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
  return rt.sample(v, t, false);
}

function offsetOf(rt: DistrictWorldRuntime): number {
  return rt.debugSignalClusters()[0].offsetSec;
}

describe("armSignalPlan — approach-relative one-shot phase pin", () => {
  it("greenFresh: the first frame inside the ring starts a FULL green for the approach", () => {
    const rt = mkRuntime();
    rt.armSignalPlan({ arm: "greenFresh", triggerM: 45 }, SPAWN);
    // Simulate the pre-drive wall clock: 33 s idle → the natural ns phase is
    // deep in red (offset 1: local 34 ∈ red [23,49)) — the founder's bug.
    rt.update(33);
    const before = offsetOf(rt);
    // Outside the ring (d ≈ 60): nothing fires, red stays.
    sampleAt(rt, LANE, -60, 0, 0);
    expect(offsetOf(rt)).toBe(before);
    expect(rt.signalPhaseInfo(NODE, 0).phase).toBe("red");
    // First frame inside the ring (d ≈ 44.8): a full 20 s green begins NOW,
    // and the SAME tick already reads it in the next-line context.
    const tick = sampleAt(rt, LANE, -44, 0, 0.1);
    expect(offsetOf(rt)).not.toBe(before);
    expect(rt.signalPhaseInfo(NODE, 0)).toEqual({ phase: "green", timeToChangeSec: 20 });
    expect(tick.nextStopLineState).toBe("green");
  });

  it("redFresh: a full red begins, then redYellow, then green — the taught arc", () => {
    const rt = mkRuntime();
    rt.armSignalPlan({ arm: "redFresh", triggerM: 45 }, SPAWN);
    rt.update(7.5); // arbitrary wall-clock elapse (natural phase irrelevant)
    sampleAt(rt, LANE, -44, 0, 0);
    const atFire = rt.signalPhaseInfo(NODE, 0);
    expect(atFire.phase).toBe("red");
    expect(atFire.timeToChangeSec).toBeCloseTo(26, 5); // red [23,49) — the FULL red
    rt.update(26.01); // red served → the 1 s redYellow window
    expect(rt.signalPhaseInfo(NODE, 0).phase).toBe("redYellow");
    rt.update(1); // → clean green
    expect(rt.signalPhaseInfo(NODE, 0).phase).toBe("green");
  });

  it("is ONE-SHOT: leaving and re-entering the ring never re-pins", () => {
    const rt = mkRuntime();
    rt.armSignalPlan({ arm: "greenFresh", triggerM: 45 }, SPAWN);
    rt.update(12);
    sampleAt(rt, LANE, -44, 0, 0); // fire
    const pinned = offsetOf(rt);
    rt.update(5); // 5 s of the fresh green consumed
    sampleAt(rt, LANE, -60, 0, 5); // retreat outside the ring…
    sampleAt(rt, LANE, -44, 0, 5.1); // …and re-enter
    expect(offsetOf(rt)).toBe(pinned);
    // The cycle continued from the rebased clock: 15 s of green left, not 20.
    expect(rt.signalPhaseInfo(NODE, 0).phase).toBe("green");
    expect(rt.signalPhaseInfo(NODE, 0).timeToChangeSec).toBeCloseTo(15, 5);
  });

  it("respects the trigger distance exactly (just outside never fires)", () => {
    const rt = mkRuntime();
    rt.armSignalPlan({ arm: "greenFresh", triggerM: 45 }, SPAWN);
    rt.update(9);
    const before = offsetOf(rt);
    // d((4.0625, −46), origin) ≈ 46.18 > 45 — no fire.
    sampleAt(rt, LANE, -46, 0, 0);
    expect(offsetOf(rt)).toBe(before);
    // d((4.0625, −44), origin) ≈ 44.19 ≤ 45 — fires.
    sampleAt(rt, LANE, -44, 0, 0.1);
    expect(offsetOf(rt)).not.toBe(before);
  });

  it("pins the axis-group of the player's HEADING — the crossing axis shows red", () => {
    const rt = mkRuntime();
    // The sc-turn-left-oncoming shape: westbound approach on the east arm.
    rt.armSignalPlan({ arm: "greenFresh", triggerM: 45 }, { x: 120, y: LANE });
    rt.update(21);
    sampleAt(rt, 44, LANE, 270, 0); // d ≈ 44.2 — fires, heading west (ew group)
    expect(rt.signalPhaseInfo(NODE, 270)).toEqual({ phase: "green", timeToChangeSec: 20 });
    // The ns axis holds red across the whole fresh ew green (two-phase machine).
    expect(rt.signalPhaseInfo(NODE, 0).phase).toBe("red");
  });

  it("resolves the cluster by clusterId (member node id) without a spawn anchor", () => {
    const rt = mkRuntime();
    rt.armSignalPlan({ arm: "greenFresh", triggerM: 45, clusterId: NODE });
    rt.update(33);
    const before = offsetOf(rt);
    sampleAt(rt, LANE, -44, 0, 0);
    expect(offsetOf(rt)).not.toBe(before);
    expect(rt.signalPhaseInfo(NODE, 0).phase).toBe("green");
  });

  it("fail-innocent: unknown clusterId / bad triggerM / bad arm all arm NOTHING", () => {
    for (const plan of [
      { arm: "greenFresh", triggerM: 45, clusterId: "no-such-node" },
      { arm: "greenFresh", triggerM: 0 },
      { arm: "greenFresh", triggerM: Number.NaN },
      { arm: "amberish", triggerM: 45 }, // malformed wire data shape
    ] as SignalPlanSpec[]) {
      const rt = mkRuntime();
      rt.armSignalPlan(plan, SPAWN);
      rt.update(33);
      const before = offsetOf(rt);
      sampleAt(rt, LANE, -44, 0, 0);
      expect(offsetOf(rt)).toBe(before);
    }
  });

  it("unarmed runtime = wall-clock behavior (the absent-field default)", () => {
    const rt = mkRuntime();
    rt.update(33);
    const before = offsetOf(rt);
    sampleAt(rt, LANE, -44, 0, 0);
    expect(offsetOf(rt)).toBe(before);
  });
});
