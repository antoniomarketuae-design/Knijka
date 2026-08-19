/**
 * THE WINDSCREEN TINT PANE HAS TO DIE BEHIND THE HEADER — sweep 161.
 *
 * WHAT THE FRAME SHOWS (the reason this file exists). In
 * `sc-ac-wind-truck-pass/mobile-wrong/04-t034s.png` — and, the judge noted, in
 * truck-spray and city-run too, so it is not scenario-specific — a large
 * untextured translucent grey quad hangs across the upper half of the view,
 * starting at the A-pillar and running far out into the sky over the fields.
 *
 * It is this pane. `VehicleRig` mounts one raked plane as the only "glass" the
 * cockpit looks through, and it used to stop 0.44 m of chassis-z SHORT of the
 * header strip it is supposed to end behind — so its top edge ended in mid-air
 * over the bonnet and drew a hard tint step across open sky.
 *
 * MEASURED BOTH WAYS BEFORE ANY OF THIS WAS WRITTEN:
 *   · projected through the shipped cockpit camera, the old top edge landed at
 *     frame height fy 0.889 on the iPhone-16 landscape aspect;
 *   · scanning that same frame's sky for the luminance step finds it at row 132
 *     of 1179 — fy 0.888. Three decimals, from two independent instruments.
 *   · and it was never a phone bug: fy 0.819 at 16:9, fy 0.787 at 1.6.
 *
 * These assertions are about WHERE THE PANE'S OWN CORNERS PROJECT, derived from
 * the very constants the mesh renders with. Restoring the old geometry
 * (centre 0.66/0.76, rake −0.62, length 0.55) puts the top edge back at
 * fy 0.889 and fails the first two cases — checked by mutation, not assumed.
 */

import { describe, expect, it } from "vitest";
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";

import {
  WINDSHIELD_CENTRE_Y,
  WINDSHIELD_CENTRE_Z,
  WINDSHIELD_LENGTH_M,
  WINDSHIELD_RAKE_RAD,
  WIPER_FRAME_RAKE_RAD,
  WIPER_FRAME_Y,
  WIPER_FRAME_Z,
} from "../VehicleRig";
import {
  COCKPIT_EYE,
  COCKPIT_PITCH_BASE,
  cockpitVFovForAspect,
} from "@/modules/sim/vehicle";

/**
 * The cockpit-camera contract's own landmarks for the two ends of THIS pane
 * (`vehicle/cockpit-camera-contract.test.ts` LANDMARKS):
 *   glassBase — "windshield tint-plane base"
 *   header    — "v2 glass-top / header-strip front edge"
 * Restated here rather than imported because they live in a test file. They are
 * not the assertion; they are what the assertion checks the pane against.
 */
const GLASS_BASE = { y: 0.436, z: 0.92 };
const HEADER = { y: 0.85, z: 0.16 };

/** The founder's handset, landscape — the aspect every mobile frame in the
 *  catalogue was shot at, and the one the artifact was measured on. */
const PHONE_ASPECT = 2556 / 1179;
/** The second platform the sweep drove. */
const PC_ASPECT = 1440 / 900;
/** The aspect COCKPIT_FOV is authored at. */
const REF_ASPECT = 16 / 9;

/** 180° about +Y — cameras look down −Z, the car drives along +Z (CameraRig). */
const FLIP_Y = new Quaternion(0, 1, 0, 0);

/** The shipped cockpit camera at rest, exactly as the contract test builds it. */
function cockpitCamera(aspect: number): PerspectiveCamera {
  const cam = new PerspectiveCamera(cockpitVFovForAspect(aspect), aspect, 0.1, 2000);
  cam.position.set(COCKPIT_EYE.x, COCKPIT_EYE.y, COCKPIT_EYE.z);
  cam.quaternion
    .copy(FLIP_Y)
    .multiply(new Quaternion().setFromEuler(new Euler(COCKPIT_PITCH_BASE, 0, 0, "YXZ")));
  cam.updateMatrixWorld(true);
  return cam;
}

/** Frame height fraction from the BOTTOM (1 = top edge of the canvas). */
function frameY(cam: PerspectiveCamera, p: { y: number; z: number }): number {
  return (new Vector3(0, p.y, p.z).project(cam).y + 1) / 2;
}

/** The pane's two ends, reconstructed from the constants the MESH uses: a
 *  planeGeometry lies in local XY, so its local +Y maps to (0, cos, sin) under
 *  a rotation about X. If the mesh moves, this moves with it. */
function paneEnds() {
  const up = new Vector3(0, 1, 0).applyEuler(new Euler(WINDSHIELD_RAKE_RAD, 0, 0));
  const centre = new Vector3(0, WINDSHIELD_CENTRE_Y, WINDSHIELD_CENTRE_Z);
  const half = WINDSHIELD_LENGTH_M / 2;
  return {
    top: centre.clone().addScaledVector(up, half),
    base: centre.clone().addScaledVector(up, -half),
  };
}

describe("the windscreen tint pane spans the aperture the camera frames", () => {
  it("ends exactly on the contract's glassBase and header landmarks", () => {
    const { top, base } = paneEnds();
    // The base was always right — this holds it, so a fix to the top cannot
    // slide the glass off the cowl on its way past.
    expect(base.y).toBeCloseTo(GLASS_BASE.y, 3);
    expect(base.z).toBeCloseTo(GLASS_BASE.z, 3);
    // The top is the fix. The old pane reached (0.884, 0.600) — 0.44 m of
    // chassis-z short of the header, which is the whole defect.
    expect(top.y).toBeCloseTo(HEADER.y, 3);
    expect(top.z).toBeCloseTo(HEADER.z, 3);
  });

  it("puts NO tint step in the sky on the aspect the artifact was photographed at", () => {
    const cam = cockpitCamera(PHONE_ASPECT);
    const topFy = frameY(cam, paneEnds().top);
    // Off the top of the canvas entirely: there is no edge to see. The old
    // geometry scored 0.889 here, and the frame's own luminance step agreed
    // to three decimals — so a regression is caught by this number alone.
    expect(topFy).toBeGreaterThan(1);
  });

  it("never leaves its top edge below the header on any shipped aspect", () => {
    // The general statement of the same thing, and the one that survives an
    // aspect change: wherever the pane's top edge lands, the opaque header
    // strip is at least as high, so the rail's own geometry covers it. A pane
    // that stops short shows an edge with nothing behind it — which is
    // precisely what „extending far into the sky over the fields" was.
    for (const aspect of [PHONE_ASPECT, PC_ASPECT, REF_ASPECT]) {
      const cam = cockpitCamera(aspect);
      const topFy = frameY(cam, paneEnds().top);
      const headerFy = frameY(cam, HEADER);
      expect(topFy, `aspect ${aspect.toFixed(3)}`).toBeGreaterThanOrEqual(headerFy - 1e-6);
    }
  });

  it("still covers the cowl sightline it always did — the fix only added sky", () => {
    // A pane that stopped covering the road band would be a worse defect than
    // the one being fixed, so pin the base's projection too.
    const cam = cockpitCamera(PHONE_ASPECT);
    const baseFy = frameY(cam, paneEnds().base);
    expect(baseFy).toBeGreaterThan(0.2);
    expect(baseFy).toBeLessThan(0.4);
  });
});

describe("the wipers did NOT move with the glass", () => {
  it("keeps the REF 8 park frame the parked blades were verified against", () => {
    // REF 8 tuned the park angle, and the R0 round-3 pass photographed the
    // parked blades hidden by the cowl, against THIS origin and rake. They
    // used to be literally the same numbers as the glass; a later "tidy-up"
    // that re-unified them would silently undo a by-eye verification.
    expect(WIPER_FRAME_Y).toBeCloseTo(0.66, 6);
    expect(WIPER_FRAME_Z).toBeCloseTo(0.76, 6);
    expect(WIPER_FRAME_RAKE_RAD).toBeCloseTo(-0.62, 6);
  });

  it("is now a different pose from the glass, and says so", () => {
    // The coupling is broken on purpose. If these ever agree again, either the
    // glass has been shortened back (the defect returns) or the wipers have
    // been dragged up the screen (a new one).
    expect(WINDSHIELD_CENTRE_Z).not.toBeCloseTo(WIPER_FRAME_Z, 3);
    expect(WINDSHIELD_RAKE_RAD).not.toBeCloseTo(WIPER_FRAME_RAKE_RAD, 3);
  });
});
