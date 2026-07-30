/**
 * L16 — the chase-view rear window's contract (doc 86, founder items 44/45).
 *
 * The founder's own ceiling is a number: «not more than 10% of the screen». A
 * promise in a comment is not a contract, so it is swept across every aspect
 * ratio the product ships on, plus the extremes, here.
 */

import { describe, expect, it } from "vitest";
import {
  rearViewCenterNdc,
  rearViewQuadHalfSize,
  rearViewQuadOffset,
  rearViewRect,
  REAR_VIEW_FOV_DEG,
  REAR_VIEW_MAX_SCREEN_FRACTION,
  REAR_VIEW_YAW_RAD,
  type RearViewSide,
} from "./chaseRearView";

/** 4:3, 16:10, 16:9, 21:9, an iPhone in portrait, and two absurd extremes. */
const ASPECTS = [4 / 3, 1.6, 16 / 9, 21 / 9, 375 / 812, 0.3, 5] as const;
const SIDES: RearViewSide[] = ["left", "right", "rear"];

describe("rearViewRect — the ≤10 % contract", () => {
  it("never exceeds a tenth of the screen at any aspect", () => {
    for (const a of ASPECTS) {
      const r = rearViewRect(a);
      expect(
        r.screenAreaFraction,
        `aspect ${a.toFixed(3)} → ${(r.screenAreaFraction * 100).toFixed(1)} % of screen`,
      ).toBeLessThanOrEqual(REAR_VIEW_MAX_SCREEN_FRACTION);
    }
  });

  it("is still big enough to read a car in", () => {
    // Readability is a PIXEL property, so it is pinned on the height fraction,
    // not on the area: on a 5:1 ultrawide the same window is only 1.7 % of the
    // screen's area while being exactly as many pixels tall as on a 16:9.
    // Swept from 0.4 up: the narrowest shipping viewport is an iPhone in
    // portrait at 375/812 ≈ 0.462, and the 0.3 entry below exists only to prove
    // the geometry cannot produce nonsense, not that it stays readable there.
    for (const a of ASPECTS.filter((x) => x >= 0.4)) {
      expect(rearViewRect(a).heightFraction, `aspect ${a}`).toBeGreaterThanOrEqual(0.1);
    }
    // …and on every shipping landscape shape it is a real inset, not a sliver.
    for (const a of [4 / 3, 1.6, 16 / 9, 21 / 9]) {
      expect(rearViewRect(a).screenAreaFraction, `aspect ${a}`).toBeGreaterThan(0.03);
    }
  });

  it("keeps a constant PIXEL shape on landscape windows (2.4:1 letterbox)", () => {
    for (const a of [4 / 3, 1.6, 16 / 9, 21 / 9]) {
      const r = rearViewRect(a);
      // pixel aspect = (widthFraction · W) / (heightFraction · H) = wf·a/hf
      expect((r.widthFraction * a) / r.heightFraction).toBeCloseTo(2.4, 5);
    }
  });

  it("degrades safely on garbage input instead of producing NaN geometry", () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = rearViewRect(bad);
      expect(Number.isFinite(r.widthFraction)).toBe(true);
      expect(Number.isFinite(r.heightFraction)).toBe(true);
      expect(r.screenAreaFraction).toBeLessThanOrEqual(REAR_VIEW_MAX_SCREEN_FRACTION);
    }
  });
});

describe("rearViewCenterNdc — item 45's placement, literally", () => {
  it("Q opens on the LEFT of the screen and E on the RIGHT", () => {
    for (const a of ASPECTS) {
      expect(rearViewCenterNdc("left", a).x, `aspect ${a}`).toBeLessThan(0);
      expect(rearViewCenterNdc("right", a).x, `aspect ${a}`).toBeGreaterThan(0);
      // F is the interior mirror — it hangs in the middle, like a real one.
      expect(rearViewCenterNdc("rear", a).x).toBe(0);
    }
  });

  it("rides the TOP of the frame, clear of the HUD cards along the bottom", () => {
    for (const a of ASPECTS) {
      for (const side of SIDES) {
        expect(rearViewCenterNdc(side, a).y).toBeGreaterThan(0.4);
      }
    }
  });

  it("stays fully inside the viewport — no edge of the window is off-screen", () => {
    for (const a of ASPECTS) {
      const r = rearViewRect(a);
      for (const side of SIDES) {
        const c = rearViewCenterNdc(side, a);
        expect(Math.abs(c.x) + r.widthFraction, `x, aspect ${a}, ${side}`).toBeLessThanOrEqual(1);
        expect(c.y + r.heightFraction, `y, aspect ${a}, ${side}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("the two side windows are mirror images of each other", () => {
    for (const a of ASPECTS) {
      expect(rearViewCenterNdc("left", a).x).toBeCloseTo(-rearViewCenterNdc("right", a).x, 10);
      expect(rearViewCenterNdc("left", a).y).toBeCloseTo(rearViewCenterNdc("right", a).y, 10);
    }
  });
});

describe("REAR_VIEW_YAW_RAD — which way the camera actually looks", () => {
  /**
   * The rig gives the pass camera the CHASSIS quaternion, so its view axis is
   * chassis −Z (rearward — the car drives +Z). Rotating about +Y by θ sends
   * that axis to (−sin θ, 0, −cos θ). Chassis +X is car-LEFT (the convention
   * MirrorRig's ±0.905 m door-mirror positions and CameraRig's cockpit sway
   * both use), so a NEGATIVE θ is the left glance. Getting this sign wrong
   * shows the student the wrong blind spot, which is worse than no window.
   */
  const axisFor = (yaw: number) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

  it("all three sides look BACKWARD", () => {
    for (const side of SIDES) {
      expect(axisFor(REAR_VIEW_YAW_RAD[side]).z, side).toBeLessThan(0);
    }
  });

  it("Q looks over the car's LEFT (+X) and E over its RIGHT (−X)", () => {
    expect(axisFor(REAR_VIEW_YAW_RAD.left).x).toBeGreaterThan(0.3);
    expect(axisFor(REAR_VIEW_YAW_RAD.right).x).toBeLessThan(-0.3);
    expect(axisFor(REAR_VIEW_YAW_RAD.rear).x).toBeCloseTo(0, 10);
  });

  it("the quarters are wider than the straight-back look", () => {
    expect(REAR_VIEW_FOV_DEG.left).toBeGreaterThan(REAR_VIEW_FOV_DEG.rear);
    expect(REAR_VIEW_FOV_DEG.left).toBe(REAR_VIEW_FOV_DEG.right);
  });
});

describe("the camera-locked quad reproduces the NDC rect exactly", () => {
  /** Project a camera-local point (x, y, −d) back to NDC. */
  const toNdc = (x: number, y: number, d: number, vFov: number, aspect: number) => {
    const h = 2 * d * Math.tan(vFov / 2);
    return { x: (x * 2) / (h * aspect), y: (y * 2) / h };
  };

  it("size and position survive the round-trip at any distance and FOV", () => {
    for (const aspect of [4 / 3, 16 / 9, 21 / 9]) {
      for (const fovDeg of [50, 55, 61]) {
        for (const d of [0.3, 0.5, 2]) {
          const vFov = (fovDeg * Math.PI) / 180;
          const { halfWidth, halfHeight } = rearViewQuadHalfSize(d, vFov, aspect);
          const rect = rearViewRect(aspect);
          // A half-size in world units maps to widthFraction in NDC.
          const back = toNdc(halfWidth, halfHeight, d, vFov, aspect);
          expect(back.x).toBeCloseTo(rect.widthFraction, 9);
          expect(back.y).toBeCloseTo(rect.heightFraction, 9);
          for (const side of SIDES) {
            const off = rearViewQuadOffset(side, d, vFov, aspect);
            const c = toNdc(off.x, off.y, d, vFov, aspect);
            const want = rearViewCenterNdc(side, aspect);
            expect(c.x).toBeCloseTo(want.x, 9);
            expect(c.y).toBeCloseTo(want.y, 9);
          }
        }
      }
    }
  });
});
