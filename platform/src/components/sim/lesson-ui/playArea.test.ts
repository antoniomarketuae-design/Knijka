import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Euler, Quaternion, Vector3 } from "three";
import {
  COCKPIT_ASPECT_REF,
  COCKPIT_EYE,
  COCKPIT_PITCH_BASE,
  cockpitVFovForAspect,
} from "@/modules/sim/vehicle";
import {
  PLAY_ASPECT,
  PLAY_BOTTOM_GUTTER_PX,
  PLAY_MIN_HEIGHT_PX,
  playMaxWidthPx,
} from "./playArea";

describe("letterboxed play area (founder 2026-07-28: use the dark space)", () => {
  it("spends the window's HEIGHT, which `aspect-video w-full` never did", () => {
    // The whole bug in one assertion: given the height left under the picture,
    // there is a width that fills it. 956 px is the measured room at a
    // 1920×1080 window (viewport − 80 px of chrome above − the bottom gutter).
    expect(playMaxWidthPx(956)).toBe(1700);
    // …and that cap is BIGGER than the reading column the picture used to be
    // stuck in (max-w-6xl minus padding ≈ 1088 px), so on a 1920 window the
    // limit becomes the content area, not the prose measure.
    expect(playMaxWidthPx(956)).toBeGreaterThan(1088);
  });

  it("never proposes a sliver: a very short window pins at the floor", () => {
    expect(playMaxWidthPx(0)).toBe(Math.round(PLAY_MIN_HEIGHT_PX * PLAY_ASPECT));
    expect(playMaxWidthPx(-500)).toBe(Math.round(PLAY_MIN_HEIGHT_PX * PLAY_ASPECT));
    // Above the floor it tracks the room exactly.
    expect(playMaxWidthPx(600)).toBe(Math.round(600 * PLAY_ASPECT));
  });

  it("refuses to answer when it has not been measured", () => {
    expect(playMaxWidthPx(Number.NaN)).toBeNull();
    expect(playMaxWidthPx(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("leaves room for the ODbL attribution footer under the picture", () => {
    expect(PLAY_BOTTOM_GUTTER_PX).toBeGreaterThan(0);
  });
});

// --- The reason the box may only grow, never get squarer ---------------------
//
// CameraRig holds the cockpit hFOV constant and derives vFOV from the LIVE
// aspect, so the box's shape IS the camera's framing. The bands below are the
// ones vehicle/cockpit-camera-contract.test.ts asserts at 16:9; this file
// re-runs the same projection at the aspects a "just make it taller" fix would
// have produced, and shows they break — which is why playArea.ts fixes the
// aspect at 16:9 and only changes the SIZE.
const FLIP_Y = new Quaternion(0, 1, 0, 0);
/** v2 header-strip front edge — the contract's "out of frame at rest" landmark. */
const HEADER = { x: COCKPIT_EYE.x, y: 0.85, z: 0.16 };
/** v2 shaved binnacle-hood cap line, sampled dead ahead. */
const COWL = { x: COCKPIT_EYE.x, y: 0.48, z: 0.7 };

function frameY(aspect: number, p: { x: number; y: number; z: number }): number {
  const cam = new PerspectiveCamera(cockpitVFovForAspect(aspect), aspect, 0.1, 2000);
  cam.position.set(COCKPIT_EYE.x, COCKPIT_EYE.y, COCKPIT_EYE.z);
  cam.quaternion
    .copy(FLIP_Y)
    .multiply(new Quaternion().setFromEuler(new Euler(COCKPIT_PITCH_BASE, 0, 0, "YXZ")));
  cam.updateMatrixWorld(true);
  return (new Vector3(p.x, p.y, p.z).project(cam).y + 1) / 2;
}

describe("why the play box is 16:9 and not merely 'taller'", () => {
  it("is exactly the aspect the cockpit camera contract is authored at", () => {
    expect(PLAY_ASPECT).toBe(COCKPIT_ASPECT_REF);
  });

  it("keeps the header strip out of frame — a squarer box drops it in", () => {
    // Contract band: header ≥ 0.97 (out of the picture at rest).
    expect(frameY(PLAY_ASPECT, HEADER)).toBeGreaterThanOrEqual(0.97);
    // 1.70 and 1.60 are what a "fill the leftover height" box would have been
    // at a 1366×768 and a 1280×800 laptop. Both put headliner in the frame.
    expect(frameY(1.7, HEADER)).toBeLessThan(0.97);
    expect(frameY(1.6, HEADER)).toBeLessThan(0.97);
  });

  it("keeps the cowl inside the founder world-share band", () => {
    // Contract band: cowl ≤ 0.33 ⇔ world ≥ ~67 % of frame height.
    expect(frameY(PLAY_ASPECT, COWL)).toBeLessThanOrEqual(0.33);
    // Squarer than ~1.5 and the dash starts eating the windscreen again.
    expect(frameY(1.5, COWL)).toBeGreaterThan(0.33);
  });

  it("is safe to grow: a WIDER frame only moves the interior further down", () => {
    // Growing the box never changes the aspect, but if a future ultrawide
    // ruling ever does, this is the direction that is harmless.
    expect(frameY(2.0, COWL)).toBeLessThan(frameY(PLAY_ASPECT, COWL));
    expect(frameY(2.0, HEADER)).toBeGreaterThan(frameY(PLAY_ASPECT, HEADER));
  });
});
