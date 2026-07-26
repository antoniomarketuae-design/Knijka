/**
 * The hero choreography and the plate's projection.
 *
 * Shader output needs a GPU and a camera move needs eyes, so what is pinned
 * here is everything that can be pinned without either: that the loop closes
 * without a seam, that nothing accumulates into float mush over a long
 * session, that the camera stays where the composition assumes it is, and
 * that the drawn plate and the rendered scene agree about where the road is.
 */

import { describe, expect, it } from "vitest";
// Reaching into the sim module's internals is deliberate and test-only: this
// file's job is to prove the marketing plate and the simulator's sky agree,
// which it can only do by evaluating the real function.
import { ridgeElevationDeg } from "@/modules/sim/environment/skyShader";
import {
  HERO_CAM_AZIMUTH_RAD,
  HERO_CAM_HEIGHT_M,
  HERO_CAM_RADIUS_M,
  HERO_DASH_MARK_M,
  HERO_DASH_PERIOD_M,
  HERO_LANE_WIDTH_M,
  HERO_LANE_X_M,
  HERO_LOOP_S,
  HERO_MARK_WIDTH_M,
  HERO_ROAD_WIDTH_M,
  HERO_SPEED_KMH,
  HERO_WHEEL_RADIUS_M,
  heroCameraPose,
  kmhToMps,
  pingPong,
  PLATE_HORIZON_Y,
  PLATE_RIDGE_AZ_FROM,
  PLATE_RIDGE_AZ_STEP,
  PLATE_RIDGE_AZ_TO,
  PLATE_RIDGE_POINTS,
  PLATE_VANISHING_X,
  PLATE_VIEWBOX_W,
  plateAzimuthX,
  plateDashes,
  plateElevationY,
  plateProject,
  roadScrollM,
  wheelSpinRad,
} from "../heroScene";

describe("the loop never shows a seam", () => {
  it("returns to the exact starting pose after one period", () => {
    const start = heroCameraPose(0);
    const wrapped = heroCameraPose(HERO_LOOP_S);
    for (let i = 0; i < 3; i += 1) {
      expect(wrapped.position[i]).toBeCloseTo(start.position[i], 9);
    }
  });

  it("has a continuous VELOCITY across the seam, not just a continuous position", () => {
    // This is the whole reason the move uses a cosine and not a triangle
    // wave. A triangle wave passes the test above and still visibly bounces,
    // because the direction of travel reverses in a single frame.
    const dt = 1 / 60;
    const before = heroCameraPose(HERO_LOOP_S - dt);
    const at = heroCameraPose(HERO_LOOP_S);
    const after = heroCameraPose(HERO_LOOP_S + dt);
    for (let i = 0; i < 3; i += 1) {
      const inbound = at.position[i] - before.position[i];
      const outbound = after.position[i] - at.position[i];
      // Both steps are ~0 at the turnaround, so compare against the move's
      // own scale rather than demanding they match to many digits.
      expect(Math.abs(outbound - inbound)).toBeLessThan(0.01);
    }
  });

  it("survives a negative clock without mirroring the move", () => {
    const forward = heroCameraPose(HERO_LOOP_S * 0.25);
    const negative = heroCameraPose(-HERO_LOOP_S * 0.75);
    for (let i = 0; i < 3; i += 1) {
      expect(negative.position[i]).toBeCloseTo(forward.position[i], 9);
    }
  });

  it("ping-pongs smoothly on [0, 1]", () => {
    expect(pingPong(0)).toBeCloseTo(0, 12);
    expect(pingPong(0.5)).toBeCloseTo(1, 12);
    expect(pingPong(1)).toBeCloseTo(0, 12);
  });
});

describe("the camera stays inside the shot", () => {
  const samples = Array.from({ length: 240 }, (_, i) => heroCameraPose((i / 240) * HERO_LOOP_S));

  it("never dips below the tarmac or above the roofline sweep", () => {
    const [high, low] = HERO_CAM_HEIGHT_M;
    for (const pose of samples) {
      expect(pose.position[1]).toBeGreaterThanOrEqual(Math.min(high, low) - 1e-9);
      expect(pose.position[1]).toBeLessThanOrEqual(Math.max(high, low) + 1e-9);
    }
  });

  it("stays behind the car — it is a road shot, not a car advert", () => {
    // The car drives south (+Z), so astern is −Z. A camera that ever reached
    // z ≥ 0 would have swung past the doors and put the nose, not the road,
    // in frame.
    for (const pose of samples) expect(pose.position[2]).toBeLessThan(-3);
  });

  it("orbits the CAR, not the origin, and stays within the framed radius", () => {
    const [far, near] = HERO_CAM_RADIUS_M;
    for (const pose of samples) {
      // The car sits in its lane, so the orbit is measured from there.
      const distance = Math.hypot(pose.position[0] - HERO_LANE_X_M, pose.position[2]);
      expect(distance).toBeGreaterThan(Math.min(far, near) - 1e-9);
      expect(distance).toBeLessThan(Math.max(far, near) + 1e-9);
    }
  });

  it("keeps the camera on one side of the car, where the sweep was framed", () => {
    // Both azimuth endpoints are positive, so the camera never crosses the
    // car's own axis. Facing south, +X is screen-LEFT, which is what parks
    // the car in the right third — the composition the headline depends on.
    expect(HERO_CAM_AZIMUTH_RAD[0]).toBeGreaterThan(0);
    expect(HERO_CAM_AZIMUTH_RAD[1]).toBeGreaterThan(0);
    for (const pose of samples) expect(pose.position[0]).toBeGreaterThan(HERO_LANE_X_M);
  });

  it("keeps the car in the right-hand lane, off the centre line", () => {
    // A driving school's hero car straddling the centre line is the one
    // detail a 17-year-old who just learned lane discipline will catch.
    expect(HERO_LANE_X_M).toBeLessThan(0);
    expect(Math.abs(HERO_LANE_X_M)).toBeCloseTo(HERO_LANE_WIDTH_M / 2, 6);
  });

  it("looks at a fixed point down the road, ahead of the car", () => {
    for (const pose of samples) {
      expect(pose.target[2]).toBeGreaterThan(0);
      expect(pose.target).toEqual(samples[0].target);
    }
  });

  it("keeps Vitosha in the shot — the camera looks south", () => {
    // skyShader.ts puts the massif at due south = +Z. If the look target ever
    // went negative the hero would be a road into an empty gradient, which is
    // exactly the "flat-earth test level" tell doc 82 §1.2 item 6 names.
    for (const pose of samples) {
      expect(pose.target[2] - pose.position[2]).toBeGreaterThan(0);
    }
  });
});

describe("nothing accumulates", () => {
  it("wraps the road scroll into one dash period", () => {
    // An unwrapped metre count reaches ~10^5 within an hour, where a 32-bit
    // uniform can no longer resolve the per-frame step and the dashes
    // stutter. An hour of driving must look exactly like the first second.
    for (const t of [0, 1, 12.5, 3600, 86_400]) {
      const s = roadScrollM(t);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(HERO_DASH_PERIOD_M);
    }
  });

  it("keeps the scroll congruent with the true distance travelled", () => {
    const t = 137.42;
    const travelled = kmhToMps(HERO_SPEED_KMH) * t;
    expect(roadScrollM(t)).toBeCloseTo(travelled % HERO_DASH_PERIOD_M, 6);
  });

  it("wraps the wheel angle into one turn, at the rolling rate", () => {
    const TAU = Math.PI * 2;
    for (const t of [0, 0.7, 999.9]) {
      const a = wheelSpinRad(t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(TAU);
    }
    // One wheel circumference of travel = exactly one revolution.
    const oneTurnSec = (TAU * HERO_WHEEL_RADIUS_M) / kmhToMps(HERO_SPEED_KMH);
    expect(wheelSpinRad(oneTurnSec)).toBeCloseTo(0, 6);
  });

  it("handles a clock that went backwards", () => {
    expect(roadScrollM(-1)).toBeGreaterThanOrEqual(0);
    expect(wheelSpinRad(-1)).toBeGreaterThanOrEqual(0);
  });
});

describe("the plate draws the same road the scene renders", () => {
  it("collapses everything onto the vanishing point at infinity", () => {
    const [x, y] = plateProject(HERO_LANE_WIDTH_M, 0, 1e6);
    expect(x).toBeCloseTo(PLATE_VANISHING_X, 2);
    expect(y).toBeCloseTo(PLATE_HORIZON_Y, 2);
  });

  it("puts the road surface below the horizon and the sky above it", () => {
    // A camera above the road sees the road below the horizon line, always.
    for (const z of [3, 8, 40, 200]) {
      expect(plateProject(0, 0, z)[1]).toBeGreaterThan(PLATE_HORIZON_Y);
    }
    // …and a point at eye height sits exactly on it.
    expect(plateProject(0, 1.6, 25)[1]).toBeCloseTo(PLATE_HORIZON_Y, 6);
  });

  it("widens the road as it comes closer", () => {
    const near = plateProject(HERO_ROAD_WIDTH_M / 2, 0, 5)[0] - PLATE_VANISHING_X;
    const far = plateProject(HERO_ROAD_WIDTH_M / 2, 0, 60)[0] - PLATE_VANISHING_X;
    expect(near).toBeGreaterThan(far * 5);
  });

  it("lays the dashes out on the real cadence, tapering with distance", () => {
    const dashes = plateDashes();
    expect(dashes.length).toBeGreaterThan(6);
    for (let i = 1; i < dashes.length; i += 1) {
      // Nearest first: each dash is higher up the frame and narrower.
      expect(dashes[i].yNear).toBeLessThan(dashes[i - 1].yNear);
      expect(dashes[i].halfNear).toBeLessThan(dashes[i - 1].halfNear);
      // Every dash tapers within itself — that taper IS the perspective.
      expect(dashes[i].halfFar).toBeLessThan(dashes[i].halfNear);
      expect(dashes[i].yFar).toBeLessThan(dashes[i].yNear);
    }
  });

  it("runs far enough to converge, and then stops", () => {
    const dashes = plateDashes();
    // Far enough that the eye reads a road converging on a vanishing point.
    expect(dashes.length).toBeGreaterThanOrEqual(10);
    // …but bounded: an unterminated loop would emit slivers forever.
    expect(dashes.length).toBeLessThan(64);
    const last = dashes[dashes.length - 1];
    expect(last.yNear - last.yFar).toBeGreaterThanOrEqual(0.25);
    expect(last.yFar).toBeGreaterThan(PLATE_HORIZON_Y);
  });

  it("draws the SAME Vitosha the sky dome renders", () => {
    // PLATE_RIDGE_POINTS is generated, not drawn (see its doc comment). This
    // is the generator, and it is also the drift guard: if anyone retunes
    // VITOSHA_HUMPS for the simulator, the plate stops matching the 3D layer
    // it crossfades with, and this fails.
    const expected: [number, number][] = [];
    for (
      let az = PLATE_RIDGE_AZ_FROM;
      az <= PLATE_RIDGE_AZ_TO + 1e-9;
      az += PLATE_RIDGE_AZ_STEP
    ) {
      // The shader measures azimuth positive toward the WEST; the plate
      // measures x positive toward +X (east). Hence the sign flip.
      expected.push([plateAzimuthX(-az), plateElevationY(ridgeElevationDeg(az))]);
    }
    expected.sort((a, b) => a[0] - b[0]);

    expect(PLATE_RIDGE_POINTS).toHaveLength(expected.length);
    PLATE_RIDGE_POINTS.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(expected[i][0], 1);
      expect(y).toBeCloseTo(expected[i][1], 1);
    });
  });

  it("puts Cherni Vrah at its real angular height above the horizon", () => {
    // 2,290 m over a ~550 m city floor at ~15 km ≈ 6.6°, so the crest must
    // sit f·tan(6.6°) ≈ 113 plate units above PLATE_HORIZON_Y. A ridge drawn
    // by eye is the one thing worse than no ridge — a Sofia teenager knows it.
    const summitY = Math.min(...PLATE_RIDGE_POINTS.map(([, y]) => y));
    expect(PLATE_HORIZON_Y - summitY).toBeGreaterThan(105);
    expect(PLATE_HORIZON_Y - summitY).toBeLessThan(145);
  });

  it("spans the frame it is drawn into", () => {
    const xs = PLATE_RIDGE_POINTS.map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThanOrEqual(0);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(PLATE_VIEWBOX_W);
  });

  it("uses the real Bulgarian road, not the simulator's 2.5x one", () => {
    // doc 82 §1.2 item 3: the sim's PERCEPTUAL_ROAD_SCALE makes lanes 8.125 m
    // and is named there as the biggest reason it reads as a toy world. The
    // marketing shot has no grading to satisfy, so it must not inherit that.
    expect(HERO_LANE_WIDTH_M).toBeCloseTo(3.25, 6);
    expect(HERO_DASH_MARK_M).toBe(3);
    expect(HERO_DASH_PERIOD_M).toBe(12);
    expect(HERO_MARK_WIDTH_M).toBeLessThan(0.2);
  });
});
