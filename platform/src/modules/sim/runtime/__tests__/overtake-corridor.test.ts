/**
 * OVERTAKE-CORRIDOR adjudication (doc 72 OV-05/OV-08 — „изпреварване срещу
 * насрещен", the head-on family). The tracker grades COMMITTED occupancy of
 * the opposing bank of a two-way DASHED-line road against the measured
 * oncoming gap (distM / closingMps — the JU-10 quantity):
 *  - gap ≤ OVERTAKE_CONVICT_GAP_SEC (4 s) while committed at speed, sustained
 *    → violated "overtake-oncoming" (reducer: OVERTAKE_INSUFFICIENT_GAP)
 *  - the ABORT (braking out within the D1-bounded window / returning to the
 *    own bank) NEVER convicts — the OV-08 discipline is sacred
 *  - everything else (safe gap, the 4–7 s advisory band, empty road) → silent.
 *
 * FP battery (the task's bias-away-from-FPs bar):
 *  1. legal dashed-line overtake with a huge gap      — gap-based, not presence
 *  2. the abort (brake + tuck back)                    — braking stand-down
 *  3. opposingBank with NO oncoming (empty road)       — silence by construction
 *  4. sub-commit creep (the narrow-street squeeze)     — commit-speed bar
 *  5. solid-span excursion (ov-solid-v1)               — CROSSED_SOLID_LINE's act
 *  6. junction left-turn sweep (district-v1)           — the JU-10 tracker's act
 *  7. reverse maneuvering                              — A12 reverse exemption
 *  8. legacy boolean oncoming wiring                   — never convicts on presence
 * Plus the guard-rescue latch: a tight gap observed while committed convicts
 * even after the staged victim guard-stops (the gap-memory discipline).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createWorldRuntime,
  OVERTAKE_CONVICT_GAP_SEC,
  OVERTAKE_GAP_SAFE_SEC,
  type OncomingConflict,
} from "..";
import { eventsOf, loadDistrict, mkVehicle, type PathPose } from "./helpers";
import type { SimTick } from "../../rules/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadWorld(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

/** ov-oncoming-v1 lane centers (meta.scenario — the L7 copy truth). */
const X_OWN = 4.06;
const X_OPP = -2.5; // fully on the oncoming bank (center past the осева)

interface Frame {
  pose: PathPose;
  speedKmh: number;
  gear?: number;
}

/** `n` northbound poses at lateral x from y0, spaced for `speedKmh` at dt. */
function northRun(x: number, y0: number, n: number, speedKmh: number, dt = 0.05, gear = 1): Frame[] {
  const frames: Frame[] = [];
  const step = (speedKmh / 3.6) * dt;
  for (let i = 0; i < n; i++) {
    frames.push({ pose: { x, y: y0 + i * step, headingDeg: 0 }, speedKmh, gear });
  }
  return frames;
}

/** Frame counter shared between the run loop and a scripted oncoming query. */
const clock = { frame: 0 };

function run(
  rt: ReturnType<typeof createWorldRuntime>,
  fs: Frame[],
  dt = 0.05,
): SimTick[] {
  const ticks: SimTick[] = [];
  let t = 0;
  clock.frame = 0;
  for (const f of fs) {
    t += dt;
    rt.update(dt);
    ticks.push(rt.sample(mkVehicle(f.pose, { speedKmh: f.speedKmh, gear: f.gear ?? 1 }), t, false));
    clock.frame++;
  }
  return ticks;
}

function scriptedQuery(script: (frame: number) => OncomingConflict | boolean | null) {
  return () => script(clock.frame);
}

/** 3 s measured gap at a 14 m/s oncoming — squarely in the convict band. */
const TIGHT: OncomingConflict = { distM: 42, closingMps: 14 };
/** 10 s gap — comfortably past OVERTAKE_GAP_SAFE_SEC. */
const SAFE: OncomingConflict = { distM: 140, closingMps: 14 };

const overtakeOf = (ticks: SimTick[]) =>
  eventsOf(ticks, "prioritySituation").filter(
    (e) => "situation" in e && e.situation === "overtake-oncoming",
  );

describe("overtake-corridor adjudication (OV-05) — the convict band", () => {
  it("bands are ordered as documented (convict < safe)", () => {
    expect(OVERTAKE_CONVICT_GAP_SEC).toBeLessThan(OVERTAKE_GAP_SAFE_SEC);
  });

  it("convicts a committed pass against a 3 s oncoming, once, with the measured gap", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    rt.setOncomingQuery(() => TIGHT);
    // 2.5 s on the opposing bank at 55 km/h — well past the 0.9 s sustain.
    const ticks = run(rt, northRun(X_OPP, 200, 50, 55));
    const events = overtakeOf(ticks);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      kind: "prioritySituation",
      situation: "overtake-oncoming",
      violated: true,
      gapSec: 3,
    });
  });

  it("one bill per excursion — a re-pull-out after a genuine return is a second act", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    rt.setOncomingQuery(() => TIGHT);
    const ticks = run(rt, [
      ...northRun(X_OPP, 150, 50, 55), // excursion 1 (convicts once)
      ...northRun(X_OWN, 190, 30, 55), // genuinely back in the own lane
      ...northRun(X_OPP, 215, 50, 55), // excursion 2 (a fresh gamble)
    ]);
    expect(overtakeOf(ticks)).toHaveLength(2);
  });

  it("guard-rescue latch: a tight gap seen while committed convicts even after the victim guard-stops", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    // Tight for 0.5 s, then the staged oncoming emergency-brakes (its closing
    // collapses → the live query dissolves) while the player pushes on.
    rt.setOncomingQuery(scriptedQuery((frame) => (frame < 10 ? TIGHT : null)));
    const ticks = run(rt, northRun(X_OPP, 200, 60, 55));
    expect(overtakeOf(ticks)).toHaveLength(1);
  });
});

describe("overtake-corridor — THE ABORT IS SACRED (OV-08) + FP battery", () => {
  it("FP-1: a legal dashed-line overtake with a huge gap stays silent", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    rt.setOncomingQuery(() => SAFE);
    const ticks = run(rt, [
      ...northRun(X_OWN, 150, 20, 55),
      ...northRun(X_OPP, 165, 80, 60), // 4 s out — the pass
      ...northRun(X_OWN, 232, 20, 60),
    ]);
    expect(overtakeOf(ticks)).toHaveLength(0);
  });

  it("FP-2: the abort — brakes out of the shrinking window and tucks back → completely clean", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    rt.setOncomingQuery(scriptedQuery((frame) => (frame < 20 ? SAFE : TIGHT)));
    // Out at 60; the gap flips tight at frame 20; the driver brakes HARD
    // (≈ 5.6 m/s² — 1 km/h per 0.05 s frame) and is back on the own bank
    // within ~1.5 s — the D1-bounded stand-down covers the whole retreat.
    const out: Frame[] = [];
    let y = 165;
    for (let i = 0; i < 50; i++) {
      const speed = i < 20 ? 60 : Math.max(18, 60 - (i - 20) * 1.0 * (3.6 * 0.05 * 5.6));
      const x = i < 45 ? X_OPP : X_OWN;
      y += (speed / 3.6) * 0.05;
      out.push({ pose: { x, y, headingDeg: 0 }, speedKmh: speed });
    }
    const ticks = run(rt, [...out, ...northRun(X_OWN, y, 30, 25)]);
    expect(overtakeOf(ticks)).toHaveLength(0);
  });

  it("FP-3: opposingBank with NO oncoming (empty road overtake) stays silent", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    // No query installed at all — the default returns false (nobody anywhere).
    const ticks = run(rt, northRun(X_OPP, 200, 100, 60));
    expect(overtakeOf(ticks)).toHaveLength(0);
  });

  it("FP-4: sub-commit creep against a close oncoming stays silent (the narrow-street squeeze)", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    rt.setOncomingQuery(() => ({ distM: 20, closingMps: 6 })); // 3.3 s at meeting-crawl speeds
    const ticks = run(rt, northRun(X_OPP, 200, 60, 14)); // 14 km/h — inching past
    expect(overtakeOf(ticks)).toHaveLength(0);
  });

  it("FP-5: inside an authored М1 span the corridor stands down (CROSSED_SOLID_LINE's act)", () => {
    const rt = createWorldRuntime(loadWorld("ov-solid-v1"));
    rt.setOncomingQuery(() => TIGHT);
    // ov-solid-v1's span covers y ∈ [90, 230]: the excursion lives wholly inside.
    const ticks = run(rt, northRun(X_OPP, 130, 50, 55));
    expect(overtakeOf(ticks)).toHaveLength(0);
  });

  it("…and the SAME map's dashed stretch (outside the span) still grades — the gate is the span, not the map", () => {
    const rt = createWorldRuntime(loadWorld("ov-solid-v1"));
    rt.setOncomingQuery(() => TIGHT);
    const ticks = run(rt, northRun(X_OPP, 20, 50, 55)); // y 20..~58 < 90
    expect(overtakeOf(ticks)).toHaveLength(1);
  });

  it("FP-6: a junction left-turn sweep never grades the corridor (the JU-10 tracker's act)", () => {
    // The left-turn-yield convict setup verbatim (district-v1 junction
    // n179974491), with a convict-tight oncoming: the LTAP tracker grades
    // left-turn-oncoming; the corridor must stay silent inside the junction
    // area even where the turn sweeps an opposing bank.
    const J = { x: 448.94, y: -250.42 };
    const rt = createWorldRuntime(loadDistrict());
    rt.setOncomingQuery(() => ({ distM: 12, closingMps: 8 }));
    const poses: PathPose[] = [];
    for (let i = 0; i < 24; i++) {
      poses.push({ x: J.x, y: J.y + 26 - (18 * i) / 23, headingDeg: 178 });
    }
    for (let i = 0; i < 30; i++) {
      const heading = 178 + ((88 - 178) * i) / 29;
      const rad = (heading * Math.PI) / 180;
      poses.push({ x: J.x + 6 * Math.sin(rad), y: J.y + 6 * Math.cos(rad), headingDeg: heading });
    }
    const ticks = run(rt, poses.map((pose) => ({ pose, speedKmh: 30 })));
    expect(overtakeOf(ticks)).toHaveLength(0);
    // The junction conflict still graded through its own tracker.
    expect(
      eventsOf(ticks, "prioritySituation").filter(
        (e) => "situation" in e && e.situation === "left-turn-oncoming",
      ),
    ).not.toHaveLength(0);
  });

  it("FP-7: reverse maneuvering across the осева stays silent (A12)", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    rt.setOncomingQuery(() => TIGHT);
    const ticks = run(rt, northRun(X_OPP, 200, 50, 25, 0.05, -1));
    expect(overtakeOf(ticks)).toHaveLength(0);
  });

  it("FP-8: legacy boolean oncoming wiring never convicts the corridor (no gap telemetry)", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    rt.setOncomingQuery(() => true);
    const ticks = run(rt, northRun(X_OPP, 200, 60, 55));
    expect(overtakeOf(ticks)).toHaveLength(0);
  });

  it("the 4–7 s advisory band is measured country, never graded (founder ruling mirror)", () => {
    const rt = createWorldRuntime(loadWorld("ov-oncoming-v1"));
    rt.setOncomingQuery(() => ({ distM: 77, closingMps: 14 })); // 5.5 s
    const ticks = run(rt, northRun(X_OPP, 200, 60, 55));
    expect(overtakeOf(ticks)).toHaveLength(0);
  });
});
