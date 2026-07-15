/**
 * N1 left-turn-across-path adjudication (doc 72 JU-10 — „ляв завой срещу
 * насрещните"). The tracker grades the ACCEPTED GAP at the turn commit:
 *  - gap ≤ LEFT_TURN_CONVICT_GAP_SEC (2 s)  → violated "left-turn-oncoming"
 *  - waited for a real conflict, then turned → yielded commendation
 *  - everything else (incl. the < 3 s advisory band) → silent (A12).
 *
 * FP battery (the mission's ≥ 4 innocent cases, A12 style):
 *  1. oncoming STOPPED (at its red)          — closing floor filters it
 *  2. oncoming far / big gap                 — gap-based, not presence-based
 *  3. oncoming TURNING AWAY before commit    — heading filter + memory expiry
 *  4. queue CREEP opposite                   — 1.2 m/s at 20 m is a 16 s gap
 *  5. conflict born < 0.9 s before commit    — conflict-visible minimum (C1)
 *  6. hard-braking commit inside the window  — braking stand-down (D1-bounded)
 *
 * Green-arrow note: SignalPhase has no green-arrow member (contracts.ts —
 * red | redYellow | green | yellow), so the "left on a green arrow" FP case
 * is structurally impossible until arrow semantics exist; re-check when N2
 * grows filter arrows (doc 72 JU-09).
 */

import { describe, expect, it } from "vitest";
import { createWorldRuntime, type OncomingConflict } from "..";
import { eventsOf, loadDistrict, mkVehicle, type PathPose } from "./helpers";
import type { SimTick } from "../../rules/types";

// Reference junction n179974491 (signalized 4-way, all arms two-way — see
// turns.test.ts). Signalized ⇒ the RHR tracker never arms here.
const J = { x: 448.94, y: -250.42 };

/** Straight southbound approach toward J (heading 178), `n` poses. */
function approach(n: number, fromM = 26, toM = 8): PathPose[] {
  const poses: PathPose[] = [];
  for (let i = 0; i < n; i++) {
    const d = fromM + ((toM - fromM) * i) / Math.max(1, n - 1);
    poses.push({ x: J.x, y: J.y + d, headingDeg: 178 });
  }
  return poses;
}

/** A -90° sweep at the junction → turnStarted: left (mirrors turns.test.ts). */
function leftSweep(): PathPose[] {
  const poses: PathPose[] = [];
  for (let i = 0; i < 30; i++) {
    const heading = 178 + ((88 - 178) * i) / 29;
    const rad = (heading * Math.PI) / 180;
    poses.push({ x: J.x + 6 * Math.sin(rad), y: J.y + 6 * Math.cos(rad), headingDeg: heading });
  }
  return poses;
}

interface Frame {
  pose: PathPose;
  speedKmh: number;
}

function frames(poses: PathPose[], speedKmh: number): Frame[] {
  return poses.map((pose) => ({ pose, speedKmh }));
}

/** Frame counter shared between the run loop and a scripted oncoming query. */
const clock = { frame: 0 };

/** Production call order (update → sample), dt = 0.05 s per frame. */
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
    ticks.push(rt.sample(mkVehicle(f.pose, { speedKmh: f.speedKmh }), t, false));
    clock.frame++;
  }
  return ticks;
}

/** Rich oncoming query following a per-frame script (reads the run clock). */
function scriptedQuery(script: (frame: number) => OncomingConflict | null) {
  return () => script(clock.frame);
}

const TIGHT: OncomingConflict = { distM: 12, closingMps: 8 }; // gap 1.5 s
const priorityOf = (ticks: SimTick[]) => eventsOf(ticks, "prioritySituation");

describe("left-turn-across-path adjudication (JU-10)", () => {
  it("convicts a left turn across a close oncoming car and reports the accepted gap", () => {
    const rt = createWorldRuntime(loadDistrict());
    rt.setOncomingQuery(() => TIGHT);
    const ticks = run(rt, frames([...approach(24), ...leftSweep()], 30));
    expect(priorityOf(ticks)).toContainEqual({
      kind: "prioritySituation",
      situation: "left-turn-oncoming",
      violated: true,
      gapSec: 1.5,
    });
  });

  it("legacy boolean wiring still convicts via the tight-radius fallback", () => {
    const rt = createWorldRuntime(loadDistrict());
    rt.setOncomingQuery(() => true);
    const ticks = run(rt, frames([...approach(24), ...leftSweep()], 30));
    expect(priorityOf(ticks)).toContainEqual({
      kind: "prioritySituation",
      situation: "left-turn-oncoming",
      violated: true,
    });
  });

  it("emits nothing when the way is clear (turn itself still detected)", () => {
    const rt = createWorldRuntime(loadDistrict());
    const ticks = run(rt, frames([...approach(24), ...leftSweep()], 30));
    expect(priorityOf(ticks)).toHaveLength(0);
    expect(eventsOf(ticks, "turnStarted")).toContainEqual({
      kind: "turnStarted",
      direction: "left",
    });
  });

  it("innocent: oncoming STOPPED at its red makes no arrival claim", () => {
    const rt = createWorldRuntime(loadDistrict());
    rt.setOncomingQuery(() => ({ distM: 14, closingMps: 0.2 }));
    const ticks = run(rt, frames([...approach(24), ...leftSweep()], 30));
    expect(priorityOf(ticks)).toHaveLength(0);
  });

  it("innocent: a far oncoming (8 s gap) is not a conflict", () => {
    const rt = createWorldRuntime(loadDistrict());
    rt.setOncomingQuery(() => ({ distM: 34, closingMps: 4.2 })); // ~8.1 s
    const ticks = run(rt, frames([...approach(24), ...leftSweep()], 30));
    expect(priorityOf(ticks)).toHaveLength(0);
  });

  it("innocent: queue creep opposite (1.2 m/s at 20 m ≈ 17 s gap)", () => {
    const rt = createWorldRuntime(loadDistrict());
    rt.setOncomingQuery(() => ({ distM: 20, closingMps: 1.2 }));
    const ticks = run(rt, frames([...approach(24), ...leftSweep()], 30));
    expect(priorityOf(ticks)).toHaveLength(0);
  });

  it("innocent: the oncoming turned away well before the commit (memory expired)", () => {
    const rt = createWorldRuntime(loadDistrict());
    // Tight while approaching, gone (turned off) for the last 2 s before the
    // sweep registers the commit — beyond LEFT_TURN_GAP_MEMORY_SEC.
    rt.setOncomingQuery(scriptedQuery((frame) => (frame < 20 ? TIGHT : null)));
    const ticks = run(rt, frames([...approach(60), ...leftSweep()], 30));
    expect(priorityOf(ticks)).toHaveLength(0);
  });

  it("innocent: conflict born a fraction of a second before the commit (C1 sustain)", () => {
    const rt = createWorldRuntime(loadDistrict());
    // approach(24) + sweep: turnStarted lands ~frame 42 (55° at ~frame 18 of
    // the sweep). Conflict pops up 10 frames (0.5 s) earlier — a staged birth
    // no human could have adjudicated.
    rt.setOncomingQuery(scriptedQuery((frame) => (frame >= 32 ? TIGHT : null)));
    const ticks = run(rt, frames([...approach(24), ...leftSweep()], 30));
    expect(priorityOf(ticks)).toHaveLength(0);
  });

  it("innocent: hard braking within the reaction window stands the conviction down", () => {
    const rt = createWorldRuntime(loadDistrict());
    rt.setOncomingQuery(() => TIGHT);
    // Speed falls 1.2 km/h per 0.05 s frame ≈ 6.7 m/s² — an emergency-grade
    // response begun immediately; the commit registers mid-brake, inside the
    // D1-bounded stand-down window.
    const poses = [...approach(24), ...leftSweep()];
    const fs: Frame[] = poses.map((pose, i) => ({
      pose,
      speedKmh: Math.max(12, 62 - i * 1.2),
    }));
    const ticks = run(rt, fs);
    expect(priorityOf(ticks).filter((e) => "violated" in e && e.violated)).toHaveLength(0);
  });

  it("commends waiting for the gap and then turning", () => {
    const rt = createWorldRuntime(loadDistrict());
    // Conflict (3 s gap — real, but not convict-tight) while the player
    // waits at the mouth; it passes; the player then takes the turn.
    rt.setOncomingQuery(
      scriptedQuery((frame) => (frame < 50 ? { distM: 24, closingMps: 8 } : null)),
    );
    const hold = approach(50, 9, 8); // creeping/waiting at the mouth
    const fs: Frame[] = [
      ...frames(approach(20, 26, 10), 25),
      ...frames(hold, 4), // waiting: ≤ yield speed while the conflict holds
      ...frames(leftSweep(), 20),
    ];
    const ticks = run(rt, fs);
    expect(priorityOf(ticks)).toContainEqual({
      kind: "prioritySituation",
      situation: "left-turn-oncoming",
      violated: false,
      yielded: true,
    });
    expect(priorityOf(ticks).filter((e) => "violated" in e && e.violated)).toHaveLength(0);
  });
});
