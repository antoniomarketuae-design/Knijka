// ============================================================================
// COCKPIT CAMERA CONTRACT — automated acceptance test (doc 71 §4.9 / §6,
// lane 12 `docs/simulation/quality-gap/12_cockpit_balance.md`).
//
// This test IS the contract. It rebuilds the shipped cockpit camera pose
// (CameraRig's exact quaternion composition: FLIP_Y · pitch) as pure
// projection math — no WebGL, no R3F — and projects the known interior-GLB
// landmark points through the camera matrix, asserting the frame-composition
// bands the founder accepted after rejecting both the hood cam AND the REF 6
// letterbox. Any future camera tune must keep this green or CONSCIOUSLY
// change the bands here, in the same commit, with a rationale.
//
// Landmark provenance (chassis-local: +X car-left, +Y up, +Z forward):
//  - hotspot_mirror_left/right/rear, screen_cluster, steering_wheel: dumped
//    from public/sim/vehicles/hero_interior.glb node transforms through the
//    VitokCockpit mount (yaw-π, y −0.55). Wheel-rim top = wheel node
//    (0.34, 0.30, 0.52) tilted 64.2° about X, rim radius 0.2045 m.
//  - dash top / cowl (y 0.48, z 0.70): A3 interior audit (tuning.ts).
//  - windshield glass base/top: VehicleRig's aperture-refit glass plane —
//    centre (0, 0.66, 0.76), raked −0.62 rad, half-height 0.275 m.
//  - road plane y −0.49 (chassis centre sits ~0.49 m above the road).
// ============================================================================

import { describe, expect, it } from "vitest";
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";
import {
  COCKPIT_ASPECT_REF,
  COCKPIT_CAM_OFFSET,
  COCKPIT_EYE,
  COCKPIT_FOV,
  COCKPIT_FOV_MAX,
  COCKPIT_HFOV_RAD,
  COCKPIT_PITCH_BASE,
  cockpitVFovForAspect,
} from "./tuning";

// --- Landmarks (see provenance above) ---------------------------------------
const LANDMARKS = {
  /** Dash-top / cowl line, sampled dead ahead of the camera. */
  cowl: { x: COCKPIT_EYE.x, y: 0.48, z: 0.7 },
  /** Windshield GLASS base — must be sightline-coincident with the cowl. */
  glassBase: { x: COCKPIT_EYE.x, y: 0.436, z: 0.92 },
  /** Windshield GLASS top = the roof-header line that letterboxed REF 6. */
  header: { x: COCKPIT_EYE.x, y: 0.884, z: 0.6 },
  /** Steering-wheel rim top (12 o'clock). */
  wheelTop: { x: 0.34, y: 0.484, z: 0.431 },
  /** Instrument-cluster screen centre (GLB screen_cluster). */
  cluster: { x: 0.34, y: 0.424, z: 0.7106 },
  /** Interior rear-view mirror glass centre (GLB hotspot_mirror_rear). */
  interiorMirror: { x: 0.0, y: 0.687, z: 0.575 },
  /** Left door-mirror glass centre (GLB hotspot_mirror_left). */
  doorMirrorLeft: { x: 0.905, y: 0.455, z: 0.592 },
  /** Road surface point ~10 m ahead of the driver. */
  road10m: { x: COCKPIT_EYE.x, y: -0.49, z: 10 },
  /** Effective horizon (level line at infinity). */
  horizon: { x: COCKPIT_EYE.x, y: COCKPIT_EYE.y, z: 1e6 },
} as const;

/** 180° about +Y — cameras look down −Z, the car drives along +Z (CameraRig). */
const FLIP_Y = new Quaternion(0, 1, 0, 0);

/** Build the shipped cockpit camera at rest (chassis at identity). */
function buildCockpitCamera(aspect: number): PerspectiveCamera {
  const cam = new PerspectiveCamera(cockpitVFovForAspect(aspect), aspect, 0.1, 2000);
  cam.position.set(COCKPIT_EYE.x, COCKPIT_EYE.y, COCKPIT_EYE.z);
  // Exact CameraRig composition at rest: quat = FLIP_Y · Euler(pitch,0,0,YXZ).
  cam.quaternion
    .copy(FLIP_Y)
    .multiply(new Quaternion().setFromEuler(new Euler(COCKPIT_PITCH_BASE, 0, 0, "YXZ")));
  cam.updateMatrixWorld(true);
  return cam;
}

/** Project a chassis-local point → frame fractions from BOTTOM-LEFT (0..1). */
function frameFraction(
  cam: PerspectiveCamera,
  p: { x: number; y: number; z: number },
): { x: number; y: number } {
  const v = new Vector3(p.x, p.y, p.z).project(cam);
  return { x: (v.x + 1) / 2, y: (v.y + 1) / 2 };
}

const cam = buildCockpitCamera(COCKPIT_ASPECT_REF);
const f = Object.fromEntries(
  Object.entries(LANDMARKS).map(([k, p]) => [k, frameFraction(cam, p)]),
) as Record<keyof typeof LANDMARKS, { x: number; y: number }>;

describe("cockpit camera pose (doc 71 §4.9 ruled numbers)", () => {
  it("ships vFOV 47 at the 16:9 reference aspect, under the hard ceiling", () => {
    expect(cockpitVFovForAspect(COCKPIT_ASPECT_REF)).toBeCloseTo(47, 6);
    expect(COCKPIT_FOV).toBe(47);
    expect(COCKPIT_FOV).toBeLessThanOrEqual(COCKPIT_FOV_MAX);
    expect(COCKPIT_FOV_MAX).toBe(56); // lane 12 §4: >56 breaks 10–30 m judgments
    expect((COCKPIT_HFOV_RAD * 180) / Math.PI).toBeCloseTo(75.41, 1);
  });

  it("pitches 8° down, inside the lane-12 slider band (7–9°)", () => {
    const pitchDeg = (-COCKPIT_PITCH_BASE * 180) / Math.PI;
    expect(pitchDeg).toBeCloseTo(8, 6);
    expect(pitchDeg).toBeGreaterThanOrEqual(7);
    expect(pitchDeg).toBeLessThanOrEqual(9);
  });

  it("sits at the design eye point + lane-12 offsets, inside their tolerances", () => {
    // aft −0.30…−0.45 (ruled −0.375), inboard +0.05…+0.15 (ruled +0.10),
    // up 0…+0.05 (ruled +0.02, resolved to +0.01 against the GT-E GLB cowl).
    expect(COCKPIT_CAM_OFFSET.aft).toBeGreaterThanOrEqual(0.3);
    expect(COCKPIT_CAM_OFFSET.aft).toBeLessThanOrEqual(0.45);
    expect(COCKPIT_CAM_OFFSET.inboard).toBeGreaterThanOrEqual(0.05);
    expect(COCKPIT_CAM_OFFSET.inboard).toBeLessThanOrEqual(0.15);
    expect(COCKPIT_CAM_OFFSET.up).toBeGreaterThanOrEqual(0);
    expect(COCKPIT_CAM_OFFSET.up).toBeLessThanOrEqual(0.05);
  });
});

describe("frame composition bands at 16:9 (the doc 71 §6 acceptance rows)", () => {
  it("cowl / dash-top line lands at 0.42–0.46 of frame height", () => {
    expect(f.cowl.y).toBeGreaterThanOrEqual(0.42);
    expect(f.cowl.y).toBeLessThanOrEqual(0.46);
  });

  it("windshield glass base is sightline-coincident with the cowl", () => {
    // The GT-E dash top slopes away exactly along the camera sightline — if
    // these ever diverge, a landmark (or the GLB) moved.
    expect(Math.abs(f.glassBase.y - f.cowl.y)).toBeLessThan(0.01);
  });

  it("horizon lands at 0.63–0.68 of frame height", () => {
    expect(f.horizon.y).toBeGreaterThanOrEqual(0.63);
    expect(f.horizon.y).toBeLessThanOrEqual(0.68);
  });

  it("road point 10 m ahead is visible at rows 0.50–0.56 (graded 10–100 m band)", () => {
    expect(f.road10m.y).toBeGreaterThanOrEqual(0.5);
    expect(f.road10m.y).toBeLessThanOrEqual(0.56);
    // …and it is world, not dash: strictly above the cowl line.
    expect(f.road10m.y).toBeGreaterThan(f.cowl.y);
  });

  it("steering-wheel rim top is visible below the dash line", () => {
    expect(f.wheelTop.y).toBeGreaterThan(0.05);
    expect(f.wheelTop.y).toBeLessThan(f.cowl.y);
    expect(f.wheelTop.x).toBeGreaterThan(0.2); // near frame centre, not clipped
    expect(f.wheelTop.x).toBeLessThan(0.6);
  });

  it("instrument cluster is readable inside the interior band", () => {
    expect(f.cluster.y).toBeGreaterThan(0.1);
    expect(f.cluster.y).toBeLessThan(f.cowl.y);
  });

  it("roof header intrudes at most ~8% of frame height (REF 6 regression guard)", () => {
    expect(f.header.y).toBeGreaterThanOrEqual(0.92);
  });

  it("interior mirror sits upper-right: clear of the graded road view, fully in frame", () => {
    // CONSCIOUS BAND CHANGE vs doc 71 §6 (x∈[0.78,0.95], y∈[0.88,0.97]):
    // lane 12's corner figure assumed (a) the vertical half-angle for the
    // horizontal projection (an aspect slip — 17° right of axis in a 75.4°
    // hFOV frame is fx 0.70, not 0.85) and (b) a mirror mounted at the
    // windshield top like a real sedan. The GT-E GLB authors the glass at
    // the car centreline near eye height (0, 0.687, 0.575), so from the
    // ruled aft camera it geometrically CANNOT reach that corner — even at
    // the tolerance-box extreme (aft −0.30, inboard +0.05) fx tops out at
    // 0.75. Contract INTENT preserved as: right of centre, above the
    // horizon line (clear of the graded 10–100 m road band), inside frame.
    expect(f.interiorMirror.x).toBeGreaterThanOrEqual(0.6);
    expect(f.interiorMirror.x).toBeLessThanOrEqual(0.95);
    expect(f.interiorMirror.y).toBeGreaterThan(f.horizon.y);
    expect(f.interiorMirror.y).toBeLessThanOrEqual(0.97);
  });

  it("left door-mirror glass centre is visible at the left frame edge", () => {
    // Lane 12: "~37° left from the aft camera → visible at the left frame
    // edge" — the glass centre must stay on-screen (fx ≥ 0) in the lower half.
    expect(f.doorMirrorLeft.x).toBeGreaterThanOrEqual(0);
    expect(f.doorMirrorLeft.x).toBeLessThan(0.3);
    expect(f.doorMirrorLeft.y).toBeGreaterThan(0.1);
    expect(f.doorMirrorLeft.y).toBeLessThan(0.6);
  });
});

describe("hFOV lock on resize (doc 71 §4.9 ruling)", () => {
  it("holds the ~75.4° horizontal FOV on wider-than-reference windows", () => {
    for (const aspect of [16 / 9, 2.0, 21 / 9, 32 / 9]) {
      const vfov = cockpitVFovForAspect(aspect);
      const hfovDeg =
        (2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * aspect) * 180) / Math.PI;
      expect(hfovDeg).toBeCloseTo((COCKPIT_HFOV_RAD * 180) / Math.PI, 4);
    }
  });

  it("keeps the horizontal composition identical across unclamped aspects", () => {
    // The lock's observable promise: the interior mirror's frame-x does not
    // move when the window gets wider.
    const ultrawide = buildCockpitCamera(21 / 9);
    const there = frameFraction(ultrawide, LANDMARKS.interiorMirror);
    expect(there.x).toBeCloseTo(f.interiorMirror.x, 4);
  });

  it("clamps the derived vFOV at 56 for narrow/portrait windows (hard rule)", () => {
    // Squarer than ~1.45:1 would need vFOV > 56 to hold hFOV — the graded
    // distance-judgment ceiling wins and hFOV is sacrificed instead.
    for (const aspect of [0.5, 9 / 16, 3 / 4, 1, 4 / 3, 1.45]) {
      expect(cockpitVFovForAspect(aspect)).toBeCloseTo(56, 6);
    }
    // Sweep: no legal aspect may ever exceed the ceiling.
    for (let aspect = 0.4; aspect <= 4; aspect += 0.05) {
      expect(cockpitVFovForAspect(aspect)).toBeLessThanOrEqual(COCKPIT_FOV_MAX + 1e-9);
    }
    // Degenerate input falls back to the reference FOV.
    expect(cockpitVFovForAspect(0)).toBe(COCKPIT_FOV);
    expect(cockpitVFovForAspect(Number.NaN)).toBe(COCKPIT_FOV);
  });
});
