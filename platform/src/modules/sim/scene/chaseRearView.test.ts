/**
 * L16 — the chase-view rear window's contract (doc 86, founder items 44/45).
 *
 * The founder's own ceiling is a number: «not more than 10% of the screen». A
 * promise in a comment is not a contract, so it is swept across every aspect
 * ratio the product ships on, plus the extremes, here.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  rearViewBottomFraction,
  rearViewCenterNdc,
  rearViewQuadHalfSize,
  rearViewQuadOffset,
  rearViewRect,
  REAR_VIEW_FOV_DEG,
  REAR_VIEW_IDLE_CADENCE,
  REAR_VIEW_IDLE_OPACITY,
  REAR_VIEW_IDLE_SCALE,
  REAR_VIEW_CADENCE,
  REAR_VIEW_MAX_SCREEN_FRACTION,
  REAR_VIEW_YAW_RAD,
  type RearViewSide,
} from "./chaseRearView";

/** 4:3, 16:10, 16:9, 21:9, an iPhone in portrait, and two absurd extremes. */
const ASPECTS = [4 / 3, 1.6, 16 / 9, 21 / 9, 375 / 812, 0.3, 5] as const;
const SIDES: RearViewSide[] = ["left", "right", "rear"];

const COMPONENTS = resolve(__dirname, "../../../components/sim");
const CAMERA_RIG = readFileSync(resolve(COMPONENTS, "CameraRig.tsx"), "utf8");
const VITOK_COCKPIT = readFileSync(resolve(COMPONENTS, "vitok/VitokCockpit.tsx"), "utf8");

/**
 * ===========================================================================
 * WHICH CAMERA THE MIRROR IS IN — the assertion whose absence cost a whole
 * review round.
 *
 * `docs/simulation/89_WHAT_I_MISSED.md` §4 states, as a verified finding:
 * „No rear-view mirror in the CHASE view — verified in code … `MirrorRig.tsx:41`
 * — *Passes only run at all while the cockpit camera is live.* The mirror,
 * including the Q/E windows just built, exists only in the cockpit."
 *
 * That reading is correct about `MirrorRig` and WRONG about the product. There
 * are TWO instruments, in two files:
 *
 *   · `vitok/MirrorRig.tsx`   — render-to-texture onto the GLB glass in the
 *     CABIN. Cockpit only, by construction, and rightly so: there is no GLB
 *     glass on screen in any other camera.
 *   · `CameraRig.tsx` + this module — a camera-locked quad, which is the CHASE
 *     view's mirror. Persistent since register row B74's second pass.
 *
 * Reading either file alone answers for the wrong half of the product, so the
 * fact is pinned here rather than left to be re-derived from a comment. If the
 * chase window is ever made glance-only again, or moved behind the cockpit
 * camera, these go red — instead of a fourth reviewer photographing it.
 * ===========================================================================
 */
describe("the chase view has a mirror, and it is not MirrorRig", () => {
  it("MirrorRig is mounted for the COCKPIT camera only — that much is true", () => {
    expect(VITOK_COCKPIT).toMatch(/<MirrorRig[^>]*active=\{cockpitView\}/);
  });

  it("…and CameraRig owns a SECOND rear view, live whenever the camera is chase", () => {
    // `mode === "chase" ? (heldSide ?? "rear") : null` — the `?? "rear"` is the
    // whole of row B74: no key pressed, mirror still there.
    expect(CAMERA_RIG).toMatch(/mode === "chase"\s*\?\s*\(heldSide \?\? "rear"\)\s*:\s*null/);
  });

  it("the chase window renders a real pass, not a placeholder", () => {
    // One `renderMirrorPass` inside the chase block, fed by this module's
    // constants — a quad with no pass behind it is a black rectangle, which is
    // exactly the doc-82 bug this reuses the fix for.
    expect(CAMERA_RIG).toMatch(/renderMirrorPass\(state\.gl, \{[\s\S]{0,200}?target: rv\.target/);
    expect(CAMERA_RIG).toMatch(/REAR_VIEW_FOG_MIN_DENSITY/);
    expect(CAMERA_RIG).toMatch(/REAR_VIEW_IDLE_CADENCE/);
  });

  it("Q/E/F move the SAME window rather than adding a second one in chase", () => {
    // Item 45: „a small window on the right side if he press right". In chase
    // that is this window sliding to the glanced side (`off.x * env`), not a
    // separate widget — the cockpit's door-mirror windows are the ones gated on
    // `mode === "cockpit"`.
    expect(CAMERA_RIG).toMatch(/off\.x \* env/);
    expect(CAMERA_RIG).toMatch(/mode === "cockpit" && glanceS > 0/);
  });
});

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

/**
 * ROW B74 — the mirror that is there when nobody presses anything.
 *
 * The first pass shipped this window bound to the glance HOLD, and the audit
 * frame of `sc-follow-tailgater` (chase POV, no key down) had no mirror on it
 * at all. „Put Rear Mirror some small window in the POV after pressing C" is
 * about the VIEW, not about a key: the mirror is now permanent in chase at
 * REAR_VIEW_IDLE_SCALE, and a glance grows it. These pin the properties the
 * rig relies on when it interpolates between the two.
 */
describe("REAR_VIEW_IDLE_SCALE — the persistent interior mirror", () => {
  it("is smaller than the glanced window, and never zero", () => {
    expect(REAR_VIEW_IDLE_SCALE).toBeGreaterThan(0.4);
    expect(REAR_VIEW_IDLE_SCALE).toBeLessThan(1);
  });

  it("shrinks about its centre: strictly less screen at every aspect", () => {
    for (const a of ASPECTS) {
      const open = rearViewRect(a);
      const idle = rearViewRect(a, REAR_VIEW_IDLE_SCALE);
      expect(idle.heightFraction, `aspect ${a}`).toBeLessThan(open.heightFraction);
      expect(idle.screenAreaFraction, `aspect ${a}`).toBeLessThan(open.screenAreaFraction);
      // The founder's ceiling is a ceiling at EVERY rung, not just at full size.
      expect(idle.screenAreaFraction).toBeLessThanOrEqual(REAR_VIEW_MAX_SCREEN_FRACTION);
    }
  });

  it("keeps the same 2.4:1 pixel shape as the open window", () => {
    for (const a of [4 / 3, 1.6, 16 / 9, 21 / 9]) {
      const r = rearViewRect(a, REAR_VIEW_IDLE_SCALE);
      expect((r.widthFraction * a) / r.heightFraction).toBeCloseTo(2.4, 5);
    }
  });

  it("hangs from the same top edge, so growing it does not make it jump", () => {
    // Both rungs share the top margin; only the lower edge moves. That is what
    // lets the rig interpolate size on the glance envelope without the window
    // sliding vertically under the student's eye.
    for (const a of ASPECTS) {
      for (const side of SIDES) {
        const open = rearViewCenterNdc(side, a);
        const idle = rearViewCenterNdc(side, a, REAR_VIEW_IDLE_SCALE);
        const topOf = (c: { y: number }, hf: number) => c.y + hf;
        expect(topOf(idle, rearViewRect(a, REAR_VIEW_IDLE_SCALE).heightFraction)).toBeCloseTo(
          topOf(open, rearViewRect(a).heightFraction),
          9,
        );
      }
    }
  });

  it("stays fully on screen at the idle rung too", () => {
    for (const a of ASPECTS) {
      const r = rearViewRect(a, REAR_VIEW_IDLE_SCALE);
      for (const side of SIDES) {
        const c = rearViewCenterNdc(side, a, REAR_VIEW_IDLE_SCALE);
        expect(Math.abs(c.x) + r.widthFraction, `x, aspect ${a}, ${side}`).toBeLessThanOrEqual(1);
        expect(c.y + r.heightFraction, `y, aspect ${a}, ${side}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("costs less per frame than a glance, and is visible without being loud", () => {
    expect(REAR_VIEW_IDLE_CADENCE).toBeGreaterThan(REAR_VIEW_CADENCE);
    expect(REAR_VIEW_IDLE_OPACITY).toBeGreaterThan(0.5);
    expect(REAR_VIEW_IDLE_OPACITY).toBeLessThan(1);
  });
});

/**
 * ROW B76 — the number the DOM needs.
 *
 * The window is a quad inside the canvas; every HUD card is DOM painted over
 * that canvas. No renderOrder can reorder those two, so the HUD steps below the
 * window and needs to know where its lower edge is.
 */
describe("rearViewBottomFraction — where the HUD has to start", () => {
  it("is the window's lower edge as a share of viewport height", () => {
    for (const a of ASPECTS) {
      for (const scale of [1, REAR_VIEW_IDLE_SCALE]) {
        const c = rearViewCenterNdc("rear", a, scale);
        const hf = rearViewRect(a, scale).heightFraction;
        // NDC y → fraction from the top is (1 − y) / 2; the lower edge is
        // centre − halfHeight, and halfHeight in NDC is heightFraction.
        expect(rearViewBottomFraction(a, scale)).toBeCloseTo((1 - (c.y - hf)) / 2, 9);
      }
    }
  });

  it("leaves the bottom two thirds of the screen alone", () => {
    for (const a of ASPECTS) {
      expect(rearViewBottomFraction(a), `aspect ${a}`).toBeLessThan(0.34);
      expect(rearViewBottomFraction(a, REAR_VIEW_IDLE_SCALE)).toBeLessThan(
        rearViewBottomFraction(a),
      );
    }
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
