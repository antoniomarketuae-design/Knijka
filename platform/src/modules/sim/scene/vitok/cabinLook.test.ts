/**
 * THE MOUSE-FIRST ACCEPTANCE TEST, in numbers (founder review 2026-07-30,
 * register rows FR-17 / FR-25).
 *
 * His measurement: „ten of thirteen cockpit controls answer a click, and
 * clicking all ten moves the checklist 0/13 → 1/13 AND STOPS." His
 * requirement: „EVERY dashboard control answers a mouse click."
 *
 * This file is that requirement as an assertion. It pins four things:
 *   1. the re-derived projection reproduces the SHIPPED cockpit composition
 *      (same landmarks as vehicle/cockpit-camera-contract.test.ts);
 *   2. the three controls the founder could not reach are provably off screen
 *      at the driving pose — so the reason for the head turns stays visible in
 *      the tree instead of becoming folklore;
 *   3. every one of the thirteen IS reachable in the pose the reach table
 *      names, at every window shape the app serves;
 *   4. the HUD height cap really does clear the controls in its column.
 */

import { describe, expect, it } from "vitest";
import {
  CABIN_LOOK_FOR_HOTSPOT,
  CABIN_LOOK_POSE_IDS,
  CABIN_LOOK_POSES,
  HUD_LEFT_COLUMN_FRACTION,
  HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION,
  hotspotClickPoint,
  hotspotIsReachable,
  hotspotScreenRect,
  hotspotVisibleRect,
  projectCockpitPoint,
  topmostControlEdgeInColumn,
  type CabinLookPoseId,
} from "./cabinLook";
import { COCKPIT_HOTSPOTS, hotspotMouseVerbBg } from "./hotspots";
import { COCKPIT_HOTSPOT_NAMES } from "../../procedures";

/** Window shapes the app is actually served at: the 16:9 reference, the
 *  1100×619 non-fullscreen /simulator box, an ultrawide, a laptop 16:10 and a
 *  short landscape phone. */
const ASPECTS = [16 / 9, 1100 / 619, 21 / 9, 16 / 10, 852 / 393];

describe("cabin look · the projection is the SHIPPED cockpit camera", () => {
  it("reproduces the cockpit-camera-contract landmarks to 3 decimals", () => {
    // Values copied from vehicle/tuning.ts's own frame-fraction table and from
    // the three.js projection in cockpit-camera-contract.test.ts. If these
    // drift, this module has stopped describing the camera the student uses.
    const at = (p: [number, number, number]) => projectCockpitPoint(p, "forward");
    const horizon = at([0.24, 0.71, 1e6]);
    expect(horizon.y).toBeCloseTo(0.58, 2);
    const cowl = at([0.24, 0.48, 0.7]);
    expect(cowl.y).toBeCloseTo(0.307, 3);
    const doorMirrorLeft = at([0.905, 0.455, 0.592]);
    expect(doorMirrorLeft.x).toBeCloseTo(0.001, 3);
    expect(doorMirrorLeft.y).toBeCloseTo(0.24, 3);
    // B58 raised the mirror station 105 mm (the В26 «50» the speed lessons tell
    // the student to read sat behind the glass); the landmark moved with it.
    const interiorMirror = at([0, 0.908, 0.5]);
    expect(interiorMirror.x).toBeCloseTo(0.71, 3);
    expect(interiorMirror.y).toBeCloseTo(0.889, 3);
  });

  it("reports a point behind the lens as not-ahead instead of guessing", () => {
    const behind = projectCockpitPoint([0.24, 0.71, -5], "forward");
    expect(behind.ahead).toBe(false);
  });
});

describe("cabin look · the three controls he could not reach", () => {
  it("the seat-belt buckle is off the BOTTOM of the driving frame", () => {
    // 0.66 m below the eye, 0.035 m in front of it — 80.5° straight down.
    expect(hotspotIsReachable("hotspot_belt", "forward")).toBe(false);
    const r = hotspotScreenRect("hotspot_belt", "forward");
    expect(r).not.toBeNull();
    expect(r!.top).toBeGreaterThan(1); // entirely below the canvas
  });

  it("the right door mirror is off the RIGHT of the driving frame", () => {
    expect(hotspotIsReachable("hotspot_mirror_right", "forward")).toBe(false);
    const r = hotspotScreenRect("hotspot_mirror_right", "forward");
    expect(r).not.toBeNull();
    expect(r!.left).toBeGreaterThan(1);
  });

  it("the light switch IS in the driving frame — it was the panel on top of it", () => {
    // The founder's third unreachable control was never a geometry problem,
    // and recording that here is what stops it being "fixed" in the wrong file.
    expect(hotspotIsReachable("hotspot_headlights", "forward")).toBe(true);
    const p = hotspotClickPoint("hotspot_headlights", "forward");
    expect(p).not.toBeNull();
    expect(p!.x).toBeGreaterThan(0.15);
    expect(p!.x).toBeLessThan(0.32); // …i.e. under a 320 px top-left panel
  });
});

describe("cabin look · ALL THIRTEEN answer a mouse click", () => {
  it("covers every doc-69 hotspot name — no control is missing a pose", () => {
    for (const name of COCKPIT_HOTSPOT_NAMES) {
      expect(CABIN_LOOK_FOR_HOTSPOT[name], name).toBeDefined();
    }
    expect(Object.keys(CABIN_LOOK_FOR_HOTSPOT).sort()).toEqual([...COCKPIT_HOTSPOT_NAMES].sort());
    expect(COCKPIT_HOTSPOTS).toHaveLength(13);
  });

  it("is reachable in its named pose at every window shape the app serves", () => {
    for (const aspect of ASPECTS) {
      for (const name of COCKPIT_HOTSPOT_NAMES) {
        const pose = CABIN_LOOK_FOR_HOTSPOT[name];
        expect(
          hotspotIsReachable(name, pose, aspect),
          `${name} @ ${pose} @ aspect ${aspect.toFixed(2)}`,
        ).toBe(true);
        const click = hotspotClickPoint(name, pose, aspect);
        expect(click, `${name} click point`).not.toBeNull();
        expect(click!.x).toBeGreaterThan(0);
        expect(click!.x).toBeLessThan(1);
        expect(click!.y).toBeGreaterThan(0);
        expect(click!.y).toBeLessThan(1);
      }
    }
  });

  it("at the reference 16:9 window only two controls need a head turn", () => {
    const away = COCKPIT_HOTSPOT_NAMES.filter((n) => !hotspotIsReachable(n, "forward", 16 / 9));
    expect(away.sort()).toEqual(["hotspot_belt", "hotspot_mirror_right"]);
  });

  it("a WIDE window costs three more — the reason the console pose exists", () => {
    // The cockpit holds its horizontal FOV across window shapes (doc 71 §4.9),
    // so width is bought with vertical field: at 21:9 the vFOV is 36.7° and the
    // lower console leaves the picture. „Ten of thirteen" was a 16:9 number.
    const wide = COCKPIT_HOTSPOT_NAMES.filter((n) => !hotspotIsReachable(n, "forward", 21 / 9));
    expect(wide.sort()).toEqual([
      "hotspot_belt",
      "hotspot_gear_selector",
      "hotspot_horn",
      "hotspot_mirror_right",
      "hotspot_parking_brake",
    ]);
    // …and the console pose puts every one of those three back.
    for (const n of ["hotspot_gear_selector", "hotspot_horn", "hotspot_parking_brake"] as const) {
      expect(hotspotIsReachable(n, "console", 21 / 9), n).toBe(true);
    }
  });

  it("the right-mirror pose IS the graded glance angle — no jump at the handover", () => {
    // CameraRig's GLANCE_OFFSETS.right. Kept identical on purpose: the student
    // turns his head, then presses the mirror, and the glance takes the neck
    // over at the same angle instead of whipping further right.
    expect(CABIN_LOOK_POSES.mirrorRight.yaw).toBeCloseTo(-0.93, 6);
    expect(CABIN_LOOK_POSES.mirrorRight.pitch).toBeCloseTo(-0.09, 6);
  });

  it("the driving pose is a real zero — a lesson never starts turned", () => {
    expect(CABIN_LOOK_POSES.forward.yaw).toBe(0);
    expect(CABIN_LOOK_POSES.forward.pitch).toBe(0);
    expect(CABIN_LOOK_POSE_IDS[0]).toBe("forward");
  });

  it("every pose carries Bulgarian button copy", () => {
    for (const id of CABIN_LOOK_POSE_IDS) {
      const pose = CABIN_LOOK_POSES[id as CabinLookPoseId];
      expect(pose.labelBg.length, id).toBeGreaterThan(5);
      expect(pose.hintBg.length, id).toBeGreaterThan(10);
    }
  });
});

describe("cabin look · the control says its own name, on the car", () => {
  // „We should re-work the whole engine with the buttons, BECAUSE WE READ ON
  // LEFT." The pending control has pulsed since A2, but a pulse is a nameless
  // blue box — and at the belt pose it is a nameless blue box in an almost
  // black frame. These four assertions are the chip that fixes that: it exists
  // for every control, it is short enough to sit ON the control, and it names
  // the GESTURE rather than a key.
  it("every one of the thirteen carries a short on-car name", () => {
    for (const spec of COCKPIT_HOTSPOTS) {
      expect(spec.shortBg.length, spec.name).toBeGreaterThan(2);
      // Two words at most: the chip is pinned to a control that is 80–150 mm
      // wide, and a sentence there would cover the thing it is pointing at.
      expect(spec.shortBg.split(" ").length, spec.name).toBeLessThanOrEqual(3);
      // It is a NAME, not an instruction: the verb comes from the action.
      expect(spec.shortBg, spec.name).not.toMatch(/Щракни|Задръж/);
    }
  });

  it("no chip name carries a keyboard key — the keys live in the legend", () => {
    for (const spec of COCKPIT_HOTSPOTS) {
      expect(spec.shortBg, spec.name).not.toMatch(/клавиш|Space|\[|\]/i);
    }
  });

  it("the gesture is derived from the handler, so a label cannot lie", () => {
    // The two HELD families are the horn and every mirror glance — the same
    // press-and-hold contract the H/Q/E/F keys have, and the same one the
    // pointer-down/up handlers in VitokCockpit implement.
    const held = COCKPIT_HOTSPOTS.filter((s) => hotspotMouseVerbBg(s.action) === "Задръж");
    expect(held.map((s) => s.name).sort()).toEqual([
      "hotspot_horn",
      "hotspot_mirror_left",
      "hotspot_mirror_rear",
      "hotspot_mirror_right",
    ]);
    for (const spec of COCKPIT_HOTSPOTS) {
      expect(["Щракни", "Задръж"]).toContain(hotspotMouseVerbBg(spec.action));
    }
  });

  it("a chip is only ever asked for where the control is on screen", () => {
    // The component filters through `hotspotIsReachable` at the LIVE pose, so
    // the two controls that need a head turn are unlabelled until the head has
    // turned — a label at the edge of a picture the control is not in would be
    // exactly the „read something instead of seeing it" the row is about.
    expect(hotspotIsReachable("hotspot_belt", "forward")).toBe(false);
    expect(hotspotIsReachable("hotspot_belt", "belt")).toBe(true);
    expect(hotspotIsReachable("hotspot_mirror_right", "forward")).toBe(false);
    expect(hotspotIsReachable("hotspot_mirror_right", "mirrorRight")).toBe(true);
  });
});

describe("cabin look · the HUD may not stand on a control it names", () => {
  it("the top-left cap clears every control in that column, at every aspect", () => {
    // The founder measured a light switch that „falls under the Подготовка
    // преди потегляне panel". This is the number that stops that recurring:
    // the panel's max-height, and the highest control in its column.
    for (const aspect of ASPECTS) {
      const highest = topmostControlEdgeInColumn(0, HUD_LEFT_COLUMN_FRACTION, "forward", aspect);
      expect(
        highest,
        `highest control in the left column @ aspect ${aspect.toFixed(2)}`,
      ).toBeGreaterThan(HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION);
    }
  });

  it("in a LOOK pose, the panel never covers the control that pose is for", () => {
    // A look pose exists to bring ONE set of controls into the picture, and the
    // invariant that matters is that the panel does not then stand on them.
    // (Other controls do drift under the left column at some poses — the
    // interior mirror sits top-left during a right-mirror glance — but nothing
    // asks the student to click those from there; he looks forward, where the
    // strong assertion above applies and the interior mirror is at x 0.57–0.86.)
    for (const pose of CABIN_LOOK_POSE_IDS) {
      if (pose === "forward") continue;
      const owned = COCKPIT_HOTSPOT_NAMES.filter((n) => CABIN_LOOK_FOR_HOTSPOT[n] === pose);
      expect(owned.length, `${pose} owns no control`).toBeGreaterThan(0);
      for (const aspect of ASPECTS) {
        for (const name of owned) {
          const r = hotspotVisibleRect(name, pose, aspect);
          expect(r, `${name} @ ${pose}`).not.toBeNull();
          const underPanel =
            r!.left < HUD_LEFT_COLUMN_FRACTION && r!.top < HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION;
          expect(underPanel, `${name} @ ${pose} @ ${aspect.toFixed(2)}`).toBe(false);
        }
      }
    }
  });
});
