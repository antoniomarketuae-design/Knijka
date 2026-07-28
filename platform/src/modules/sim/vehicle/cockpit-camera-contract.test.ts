// ============================================================================
// COCKPIT CAMERA CONTRACT — automated acceptance test (doc 71 §4.9 / §6,
// lane 12 `docs/simulation/quality-gap/12_cockpit_balance.md`, REVISED per
// the founder world-first directive of 2026-07-10).
//
// FOUNDER DIRECTIVE (2026-07-10): ≥65–70% of the cockpit frame must be world,
// interior ≤~30–35%. Camera math proved the v1 interior GLB was the fault:
// its visor/header line sat at chassis y≈0.71 (headliner 0.77) while the
// raised eye is ABOVE the old glass top — the window could never exceed ~54%
// (measured: 21% at the shipped pose). The ASSET was rebuilt
// (tools/blender/hero_interior_v2.py: headliner y 0.857–0.885, glass-top
// edge (0.850, z 0.16) above the frame-top ray, slim canopy A-pillars,
// shaved cowl/binnacle, cluster tucked 2.5 cm lower) and the camera retuned:
// pitch −5° (band −5…−7°), up-offset +0.05. New acceptance bands:
//   cowl ≤ 0.33 (world ≥ ~67% of frame height), horizon 0.55–0.62,
//   header ≥ 0.97 / out of frame.
//
// FOUNDER REVISION 2026-07-28 („the cockpit can be shrinked with few % down so
// the Front Window is bigger"): the PITCH BAND alone moved to −4…−7° and the
// shipped value to −4°, taking the cowl from 0.327 to 0.307 (window 67% → 69%).
// Every composition band above is UNCHANGED and green at the new pitch; the
// rationale for the band change sits with the pitch assertion below.
//
// This test IS the contract. It rebuilds the shipped cockpit camera pose
// (CameraRig's exact quaternion composition: FLIP_Y · pitch) as pure
// projection math — no WebGL, no R3F — and projects the known interior-GLB
// landmark points through the camera matrix, asserting the frame-composition
// bands. Any future camera tune must keep this green or CONSCIOUSLY change
// the bands here, in the same commit, with a rationale.
//
// Landmark provenance (chassis-local: +X car-left, +Y up, +Z forward):
//  - hotspot_mirror_left/right/rear, screen_cluster, steering_wheel: dumped
//    from public/sim/vehicles/hero_interior.glb node transforms through the
//    VitokCockpit mount (yaw-π, y −0.55 — UNCHANGED by the v2 rebuild).
//    Wheel-rim top = wheel node (0.34, 0.30, 0.52) tilted 64.2° about X,
//    rim radius 0.2045 m. screen_cluster dropped 2.5 cm in v2 → y 0.399.
//  - dash top / cowl (y 0.48, z 0.70): the v2 shaved binnacle-hood cap line
//    (blender bz ≤ 1.036 − (by−0.67)·0.24 → chassis y 0.482 at z 0.70).
//  - windshield glass base (0.436, 0.92): VehicleRig's tint plane base —
//    plane centre (0, 0.66, 0.76), raked −0.62 rad, half-height 0.275 m.
//    The plane predates the v2 aperture; its base still sits sightline-
//    adjacent to the cowl (≤0.02 of frame height above it).
//  - glass top / header (0.850, 0.16): v2 header-strip front-bottom edge
//    (blender by 0.16, bz 1.400) — capped by the GT-E exterior roofline
//    (skin y 0.886 over the header, 0.907 peak), NOT the founder's ideal
//    0.95–1.00, but above the frame-top ray at rest, which delivers the
//    intent (header out of frame).
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
  /** Dash-top / cowl line (v2 shaved hood cap), sampled dead ahead. */
  cowl: { x: COCKPIT_EYE.x, y: 0.48, z: 0.7 },
  /** Windshield tint-plane base — sightline-adjacent to the cowl. */
  glassBase: { x: COCKPIT_EYE.x, y: 0.436, z: 0.92 },
  /** v2 glass-top / header-strip front edge — must stay out of frame. */
  header: { x: COCKPIT_EYE.x, y: 0.85, z: 0.16 },
  /** Steering-wheel rim top (12 o'clock). */
  wheelTop: { x: 0.34, y: 0.484, z: 0.431 },
  /** Instrument-cluster screen centre (GLB screen_cluster, v2: −2.5 cm). */
  cluster: { x: 0.34, y: 0.399, z: 0.7106 },
  /** Interior rear-view mirror glass centre (GLB hotspot_mirror_rear) — RAISED
   *  to a small header-mounted housing in the 2026-07-11 black-mass fix (was
   *  (0, 0.687, 0.575), the eye-level block that the v2 camera dropped into the
   *  sightline). Now (0, 0.803, 0.50): projects to the upper-right, out of the
   *  road band. */
  interiorMirror: { x: 0.0, y: 0.803, z: 0.5 },
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

describe("cockpit camera pose (founder world-first revision of doc 71 §4.9)", () => {
  it("ships vFOV 47 at the 16:9 reference aspect, under the hard ceiling", () => {
    expect(cockpitVFovForAspect(COCKPIT_ASPECT_REF)).toBeCloseTo(47, 6);
    expect(COCKPIT_FOV).toBe(47);
    expect(COCKPIT_FOV).toBeLessThanOrEqual(COCKPIT_FOV_MAX);
    expect(COCKPIT_FOV_MAX).toBe(56); // lane 12 §4: >56 breaks 10–30 m judgments
    expect((COCKPIT_HFOV_RAD * 180) / Math.PI).toBeCloseTo(75.41, 1);
  });

  // BAND CHANGED CONSCIOUSLY, 2026-07-28 (this file's own header requires the
  // rationale to live in the same commit as the change).
  //
  // Founder review, verbatim: „the cockpit can be shrinked with few % down so
  // the Front Window is bigger, and yes currently can read the speedometer."
  // The band's LOWER edge moves 5° → 4°; the upper edge and every composition
  // band below are untouched, and all of them stay green at the new value.
  //
  // Why the band and not something else: the two levers that would grow the
  // road band without panning are both pinned by the v2 asset — raising the eye
  // drops the header (y 0.850, z 0.16) into frame faster than it drops the cowl
  // out, and narrowing vFOV pushes the left door-mirror glass (already at
  // fx ≈ 0.003) off the picture. Pitch is what is left, and 4° is its floor:
  // at 3.5° the header edge projects to fy 0.968, inside the frame and under
  // the ≥0.97 band asserted below. See tuning.ts COCKPIT_PITCH_BASE.
  it("pitches 4° down, inside the founder band (4–7°)", () => {
    const pitchDeg = (-COCKPIT_PITCH_BASE * 180) / Math.PI;
    expect(pitchDeg).toBeCloseTo(4, 6);
    expect(pitchDeg).toBeGreaterThanOrEqual(4);
    expect(pitchDeg).toBeLessThanOrEqual(7);
  });

  it("sits at the design eye point + lane-12 offsets, inside their tolerances", () => {
    // aft −0.30…−0.45 (ruled −0.375), inboard +0.05…+0.15 (ruled +0.10),
    // up 0…+0.05 — resolved to the +0.05 ceiling: the founder cowl cap
    // (≤0.33) is unreachable from lower eye heights (see tuning.ts).
    expect(COCKPIT_CAM_OFFSET.aft).toBeGreaterThanOrEqual(0.3);
    expect(COCKPIT_CAM_OFFSET.aft).toBeLessThanOrEqual(0.45);
    expect(COCKPIT_CAM_OFFSET.inboard).toBeGreaterThanOrEqual(0.05);
    expect(COCKPIT_CAM_OFFSET.inboard).toBeLessThanOrEqual(0.15);
    expect(COCKPIT_CAM_OFFSET.up).toBeGreaterThanOrEqual(0);
    expect(COCKPIT_CAM_OFFSET.up).toBeLessThanOrEqual(0.05);
  });
});

describe("frame composition bands at 16:9 (founder contract: world ≥65%)", () => {
  it("cowl / dash-top line lands at 0.28–0.33 of frame height", () => {
    // THE headline band: everything above the cowl line is world, so
    // cowl ≤ 0.33 ⇔ window ≥ ~67% of frame height (header is out of frame).
    expect(f.cowl.y).toBeGreaterThanOrEqual(0.28);
    expect(f.cowl.y).toBeLessThanOrEqual(0.33);
  });

  it("windshield glass base stays sightline-adjacent to the cowl", () => {
    // VehicleRig's tint plane predates the v2 aperture; its base must stay
    // within 2% of frame height of the cowl line (v2 measured: +0.009) so
    // no floating glass edge appears above the dash silhouette.
    expect(Math.abs(f.glassBase.y - f.cowl.y)).toBeLessThan(0.02);
  });

  it("horizon lands at 0.55–0.62 of frame height (founder band)", () => {
    expect(f.horizon.y).toBeGreaterThanOrEqual(0.55);
    expect(f.horizon.y).toBeLessThanOrEqual(0.62);
  });

  it("road point 10 m ahead is visible at rows 0.42–0.50 (graded 10–100 m band)", () => {
    expect(f.road10m.y).toBeGreaterThanOrEqual(0.42);
    expect(f.road10m.y).toBeLessThanOrEqual(0.5);
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

  it("glass-top / header edge is at ≥0.97 — out of frame at rest", () => {
    // Founder band: header ≥0.97 or out of frame. At the 2026-07-28 pitch of
    // 4° the v2 header sits at fy ≈ 0.980 — still out of the picture at rest,
    // and THE reason the pitch floor is 4° and not lower (3.5° → 0.968).
    // Transient nose-lift G-pitch (≤~2°, COCKPIT_PITCH_GAIN) can dip it into
    // the top of the frame under hard acceleration; that is a moving sliver of
    // headliner, never a letterbox.
    expect(f.header.y).toBeGreaterThanOrEqual(0.97);
  });

  it("interior mirror sits high-right, clear of the graded road band", () => {
    // 2026-07-11 BLACK-MASS FIX: the mirror glass was RAISED from eye level
    // (0, 0.687, 0.575) — where the v2 camera dropped it into the sightline as
    // a central black mass — to a small header-mounted housing (0, 0.803, 0.50).
    // It now projects to the UPPER-RIGHT (fx ≈ 0.71, fy ≈ 0.75), above the
    // horizon (0.60) and well clear of the graded 10–100 m road band, which is
    // exactly the founder directive "high-center/top-right and small". The
    // bands below are UNCHANGED (the raised position still satisfies them) —
    // the window-size assertions above are untouched. MirrorRig's rear-view
    // RTT vantage stays at (0,0.687,0.575) by design (sample point ≠ glass).
    expect(f.interiorMirror.x).toBeGreaterThanOrEqual(0.6);
    expect(f.interiorMirror.x).toBeLessThanOrEqual(0.95);
    expect(f.interiorMirror.y).toBeGreaterThan(f.road10m.y);
    expect(f.interiorMirror.y).toBeGreaterThan(f.horizon.y); // now ABOVE horizon
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
