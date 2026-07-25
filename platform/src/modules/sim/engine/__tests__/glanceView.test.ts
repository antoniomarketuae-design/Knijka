// Chase-view glances — the pure decision layer behind CameraRig's glance
// orbit (founder ruling 2026-07-20, doc 62 S5: a graded action must always
// have an information payoff). The rig is a dumb consumer; everything worth
// asserting (the aspects, the priorities, the shared hold envelope, the arc
// lock) is here.

import { describe, expect, it } from "vitest";
import {
  chaseGlanceOrbit,
  glanceOrbitLock,
  CHASE_GLANCE_ASPECT_RAD,
  CHASE_GLANCE_LOCK_RATE_RADS,
  CHASE_GLANCE_SIDE_ORBIT_RAD,
  type GlanceViewMirror,
} from "../glanceView";
import { CHASE_REVERSE_ORBIT_RAD, reverseSwingEnvelope } from "../reverseView";

/** The cabin's glance ease time (GLANCE_EASE_S) — repeated here as a plain
 *  number because an engine test must not import the component layer. */
const EASE_S = 0.18;
const MIRRORS: GlanceViewMirror[] = ["left", "right", "rear"];

describe("aspects", () => {
  it("LEFT looks toward the car's left-forward quarter (+Y orbit = toward car-left)", () => {
    expect(CHASE_GLANCE_ASPECT_RAD.left).toBe(CHASE_GLANCE_SIDE_ORBIT_RAD);
    expect(CHASE_GLANCE_ASPECT_RAD.left).toBeGreaterThan(0);
  });

  it("RIGHT is the exact mirror of LEFT", () => {
    expect(CHASE_GLANCE_ASPECT_RAD.right).toBe(-CHASE_GLANCE_ASPECT_RAD.left);
  });

  it("a side glance is a quarter look, not a flank stare", () => {
    // Between 30° (would barely widen the frame — no payoff) and 90° (would
    // trade the road ahead for the cross street instead of adding to it).
    expect(CHASE_GLANCE_SIDE_ORBIT_RAD).toBeGreaterThan(Math.PI / 6);
    expect(CHASE_GLANCE_SIDE_ORBIT_RAD).toBeLessThan(Math.PI / 2);
  });

  it("REAR IS the reverse-view aspect — composed, never duplicated", () => {
    expect(CHASE_GLANCE_ASPECT_RAD.rear).toBe(CHASE_REVERSE_ORBIT_RAD);
  });
});

describe("chaseGlanceOrbit — engagement", () => {
  it("a full hold reaches the full aspect, per mirror", () => {
    for (const m of MIRRORS) {
      expect(chaseGlanceOrbit("chase", m, 1, 0)).toBe(CHASE_GLANCE_ASPECT_RAD[m]);
    }
  });

  it("no glance, no orbit", () => {
    expect(chaseGlanceOrbit("chase", null, 1, 0)).toBe(0);
    expect(chaseGlanceOrbit("chase", "left", 0, 0)).toBe(0);
  });

  it("eases with the SAME smoothstep the cockpit head uses — one gesture, one easing", () => {
    for (const s of [0.1, 0.3, 0.5, 0.9]) {
      expect(chaseGlanceOrbit("chase", "left", s, 0)).toBeCloseTo(
        reverseSwingEnvelope(s) * CHASE_GLANCE_ASPECT_RAD.left,
        12,
      );
    }
    // Ease-in: the early orbit lags the raw envelope (no whip off the mark).
    expect(Math.abs(chaseGlanceOrbit("chase", "left", 0.1, 0))).toBeLessThan(
      0.1 * CHASE_GLANCE_SIDE_ORBIT_RAD,
    );
  });

  it("is monotonic in the hold envelope — release unwinds through the same aspects", () => {
    // Cabin keeps the mirror set through the ease-out, so the falling
    // envelope IS the damped return: the same curve, walked backwards.
    let prev = -1;
    for (let s = 0; s <= 1.001; s += 0.05) {
      const o = chaseGlanceOrbit("chase", "left", s, 0);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });

  it("clamps an envelope outside 0..1", () => {
    expect(chaseGlanceOrbit("chase", "left", 1.5, 0)).toBe(CHASE_GLANCE_ASPECT_RAD.left);
    expect(chaseGlanceOrbit("chase", "left", -0.5, 0)).toBe(0);
  });
});

describe("chaseGlanceOrbit — priorities", () => {
  it("the explicitly chosen POV wins over everything: only chase orbits", () => {
    for (const m of MIRRORS) {
      // Cockpit: the head swing is already real. Top-down: sees everything.
      expect(chaseGlanceOrbit("cockpit", m, 1, 0)).toBe(0);
      expect(chaseGlanceOrbit("topdown", m, 1, 0)).toBe(0);
    }
  });

  it("an active reverse swing wins — the glance claims nothing it still holds", () => {
    for (const m of MIRRORS) {
      expect(chaseGlanceOrbit("chase", m, 1, 1)).toBe(0);
    }
    // ...and a clamped over-swing never flips the glance's sign.
    expect(chaseGlanceOrbit("chase", "left", 1, 1.2)).toBe(0);
  });

  it("REAR handover never dips: reverse + rear-glance compose to the one boot aspect", () => {
    // F held while R engages/releases: whichever way the reverse envelope is
    // moving, envelope + glance sum to exactly CHASE_REVERSE_ORBIT_RAD.
    for (let r = 0; r <= 1.001; r += 0.125) {
      const total = r * CHASE_REVERSE_ORBIT_RAD + chaseGlanceOrbit("chase", "rear", 1, r);
      expect(total).toBeCloseTo(CHASE_REVERSE_ORBIT_RAD, 10);
    }
  });

  it("a held side glance blends smoothly out of a fading reverse swing", () => {
    // R released while Q held: the total orbit morphs monotonically from the
    // boot aspect (π) down to the left quarter (π/3) — no crossover jump.
    let prev = Infinity;
    for (let r = 1; r >= -0.001; r -= 0.1) {
      const total = r * CHASE_REVERSE_ORBIT_RAD + chaseGlanceOrbit("chase", "left", 1, r);
      expect(total).toBeLessThanOrEqual(prev + 1e-12);
      prev = total;
    }
    expect(prev).toBeCloseTo(CHASE_GLANCE_ASPECT_RAD.left, 10);
  });

  it("stays available in exam mode: no argument can express a rung", () => {
    // Structural pin, mirroring reverseView's: a glance is a graded act, not
    // an aid — if someone adds an exam gate parameter, this fails.
    expect(chaseGlanceOrbit.length).toBe(4);
  });
});

describe("glanceOrbitLock", () => {
  it("is inert when the orbit is settled — steady holds keep the trailing chase feel", () => {
    expect(glanceOrbitLock(0, 0, 1 / 60)).toBe(0);
    expect(glanceOrbitLock(CHASE_GLANCE_SIDE_ORBIT_RAD, CHASE_GLANCE_SIDE_ORBIT_RAD, 1 / 60)).toBe(0);
  });

  it("is a no-op on a dead frame (paused tab, mode re-entry) — never NaN", () => {
    expect(glanceOrbitLock(0, 1, 0)).toBe(0);
    expect(glanceOrbitLock(0, 1, -1)).toBe(0);
  });

  it("rides the arc through a real glance swing", () => {
    // Simulate the GlanceHold ease-in at 60 fps: the mid-swing frames must be
    // fully locked (the desired position sweeps far faster than the chase
    // lerp can track — same physics as the reverse orbit lock).
    const dt = 1 / 60;
    let s = 0;
    let prevOrbit = 0;
    const midSwingLocks: number[] = [];
    for (let i = 0; i < 20; i++) {
      s = Math.min(1, s + dt / EASE_S);
      const orbit = chaseGlanceOrbit("chase", "left", s, 0);
      const lock = glanceOrbitLock(prevOrbit, orbit, dt);
      if (s > 0.2 && s < 0.8) midSwingLocks.push(lock);
      prevOrbit = orbit;
    }
    expect(midSwingLocks.length).toBeGreaterThan(0);
    for (const lock of midSwingLocks) expect(lock).toBe(1);
    // ...and once the hold settles, the lock lets go completely.
    expect(glanceOrbitLock(prevOrbit, chaseGlanceOrbit("chase", "left", 1, 0), dt)).toBe(0);
  });

  it("fades linearly below the rate threshold, capped at a full lerp, sign-agnostic", () => {
    const dt = 1 / 60;
    const half = (CHASE_GLANCE_LOCK_RATE_RADS / 2) * dt;
    expect(glanceOrbitLock(0, half, dt)).toBeCloseTo(0.5, 10);
    expect(glanceOrbitLock(0, -half, dt)).toBeCloseTo(0.5, 10);
    expect(glanceOrbitLock(0, 10, dt)).toBe(1);
    for (let d = 0; d <= 0.02; d += 0.001) {
      expect(glanceOrbitLock(0, d, dt)).toBeLessThanOrEqual(1);
    }
  });
});
