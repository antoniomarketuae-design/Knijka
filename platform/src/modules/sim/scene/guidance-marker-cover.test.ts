/**
 * THE COACH PANEL YIELDS TO A ROAD SIGN DRAWN THROUGH IT — sc-zebra-approach:
 * 2c75cf8f, upheld on a fresh frame at w11, w12, w13, w14, w15, w17, w21, w22,
 * w23, w24, w25, w26, w27, w28, w29, w30 and w31.
 *
 * WHY THIS FILE IS NOT PART OF `guidance-marker-sign.test.ts`. That suite holds
 * the PLACEMENT contract: where the post stands, how tall it is, and the 1.80 m
 * of ground `MARKER_SIGN_LATERAL_M` puts between it and the road's own sign
 * band. Every one of its assertions still passes and none of them was wrong.
 * What this file holds is the thing that contract cannot express — that a
 * clearance in metres is a clearance AT ONE DISTANCE, and the plate that
 * actually bisects the caption is a different plate, further up the same kerb,
 * at a range where the same lateral offset subtends the same angle.
 *
 * THE NUMBERS BELOW ARE READ OFF THE FRAME THE ROW WAS LAST UPHELD ON —
 * `.audit-frames/w31/frames/sc-zebra-approach__mobile-right/04-t033s.png`,
 * cropped 4× — against the cockpit's own projection (vFOV 39.25° at 2556×1179,
 * −4° pitch, eye ≈ 1.2 m):
 *
 *   the coach pill    69 px tall for 1.67 m of card   →  40.0 m
 *   the А18 plate     73 px wide for a 1.35 m face    →  30.6 m
 *
 * so the occluder stands at 0.76 × the panel's range. Nothing in this file is
 * asserted as a pixel count: the frame fixes the two RANGES, and the geometry
 * is then done in metres by the module under test.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildWorldGeometry } from "@/modules/sim/world/builders/buildWorldGeometry";
import { assertDistrict } from "@/modules/sim/world/types";

import {
  GATE_HALF_WIDTH_M,
  MARKER_SIGN_INK_HALF_W_M,
  MARKER_SIGN_LATERAL_M,
  MARKER_SIGN_PANEL_W_M,
  MARKER_SIGN_PANEL_Y,
  WORLD_KERB_SIGN_LATERAL_M,
  WORLD_SIGN_MIN_FACE_FRACTION,
  markerSignIsCovered,
  type WorldSignLike,
} from "./guidanceRoute";

/** The two ranges the w31 crop fixes, m. */
const PANEL_RANGE_M = 40.0;
const PLATE_RANGE_M = 30.6;

/** Scenario maps stamp every plate at `SCENARIO_SIGN_SCALE`. */
const SCENARIO_SCALE = 1.5;
const EYE = { x: 0, y: 1.2, z: 0 } as const;
/** Roadside plates are based on the asphalt plane (`props.ts` ROAD_Y). */
const ROAD_Y = 0.02;

/**
 * The street the frame was taken on, laid out in three-space so the arithmetic
 * is readable: the student drives +X from the origin, the kerb is +Z, and both
 * the road's plates and the coach's post stand on it at their own offsets.
 */
function panelAt(rangeM: number): { x: number; y: number; z: number } {
  return { x: rangeM, y: MARKER_SIGN_PANEL_Y, z: MARKER_SIGN_LATERAL_M };
}
/** A plate facing back down the street at the approaching student (+Z is the
 *  face's outward side, so a face pointing at −X is yaw = −π/2). */
function plateAt(rangeM: number, lateralM = WORLD_KERB_SIGN_LATERAL_M): WorldSignLike {
  return { position: [rangeM, ROAD_Y, lateralM], yaw: -Math.PI / 2, scale: SCENARIO_SCALE };
}

describe("the defect the lateral offset could not reach", () => {
  it("a plate at 0.76× the panel's range lands on the caption — the w31 frame", () => {
    expect(markerSignIsCovered(EYE, panelAt(PANEL_RANGE_M), [plateAt(PLATE_RANGE_M)])).toBe(true);
  });

  it("…and it is the RANGE that does it, not the plate's offset from the route", () => {
    // The identical plate, at the identical kerb offset, standing level with
    // the panel instead of short of it: this is the state wave 8 bought, and
    // the caption must survive it or that repair was spent for nothing.
    expect(markerSignIsCovered(EYE, panelAt(PANEL_RANGE_M), [plateAt(PANEL_RANGE_M - 0.5)])).toBe(
      false,
    );
  });

  it("the collision band is a RATIO, so it follows the panel down the street", () => {
    // The row is not about one metre mark. As the student closes, the plate
    // that covers the caption is whichever one sits at ~0.76 of the remaining
    // range — which is why sixteen re-drives caught it at sixteen different
    // odometer readings (t016s … t098s across the sweeps).
    for (const D of [24, 30, 40, 55, 66]) {
      expect(markerSignIsCovered(EYE, panelAt(D), [plateAt(D * 0.76)]), `${D} m`).toBe(true);
    }
  });

  it("NEGATIVE CONTROL — no plate, no yield, at every range in the band", () => {
    for (let D = 21; D <= 68; D += 1) {
      expect(markerSignIsCovered(EYE, panelAt(D), []), `${D} m`).toBe(false);
    }
  });
});

describe("what it refuses to take the caption away for", () => {
  it("a plate on the OTHER kerb", () => {
    expect(
      markerSignIsCovered(EYE, panelAt(PANEL_RANGE_M), [
        plateAt(PLATE_RANGE_M, -WORLD_KERB_SIGN_LATERAL_M),
      ]),
    ).toBe(false);
  });

  it("a plate BEHIND the panel, which loses the depth test to it", () => {
    expect(
      markerSignIsCovered(EYE, panelAt(PANEL_RANGE_M), [plateAt(PANEL_RANGE_M + 6)]),
    ).toBe(false);
  });

  it("a plate turned edge-on to the student", () => {
    const edgeOn: WorldSignLike = { ...plateAt(PLATE_RANGE_M), yaw: 0 };
    // Sanity: the same post, face-on, IS the defect — so the yaw is the only
    // difference between the two readings.
    expect(markerSignIsCovered(EYE, panelAt(PANEL_RANGE_M), [plateAt(PLATE_RANGE_M)])).toBe(true);
    expect(markerSignIsCovered(EYE, panelAt(PANEL_RANGE_M), [edgeOn])).toBe(false);
    expect(WORLD_SIGN_MIN_FACE_FRACTION).toBeGreaterThan(0);
    expect(WORLD_SIGN_MIN_FACE_FRACTION).toBeLessThan(1);
  });

  it("a plate mounted at ankle height, which is under the card and not on it", () => {
    const low: WorldSignLike = { ...plateAt(PLATE_RANGE_M), scale: 0.25 };
    expect(markerSignIsCovered(EYE, panelAt(PANEL_RANGE_M), [low])).toBe(false);
  });

  it("the ink column is the SAME 0.2 margin the placement gate already holds", () => {
    // `guidance-marker-sign.test.ts` asserts `acrossPanel < 0.2` — the plate on
    // the panel's inboard margin rather than on its centred text. The two
    // numbers live in one place so they cannot drift apart.
    expect(MARKER_SIGN_INK_HALF_W_M / MARKER_SIGN_PANEL_W_M).toBeCloseTo(0.5 - 0.2, 12);
  });
});

describe("…and it reaches the map the row was filed on", () => {
  /** zb-v1's own А18 posts, as three-space placements. */
  function zbSigns(): WorldSignLike[] {
    const raw = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../../../../content/world/zb-v1.json"), "utf8"),
    ) as unknown;
    return buildWorldGeometry(assertDistrict(raw)).signs.map((s) => ({
      position: s.position,
      yaw: s.yaw,
      ...(s.scale === undefined ? {} : { scale: s.scale }),
    }));
  }

  it("zb-v1 really does post plates on the kerb the coach's post stands on", () => {
    const signs = zbSigns();
    expect(signs.length).toBeGreaterThan(0);
    // The east kerb of the north-running centreline x = 0 — the same band
    // `guidance-marker-sign.test.ts` pins WORLD_KERB_SIGN_LATERAL_M against.
    const east = signs.map((s) => s.position[0]).filter((x) => x > GATE_HALF_WIDTH_M);
    expect(east.length).toBeGreaterThan(0);
  });

  it("a northbound student meets the collision on zb-v1's real posts", () => {
    // The route is the east lane centre; the coach's panel stands
    // MARKER_SIGN_LATERAL_M further out and 40 m up the road, exactly as the
    // frame catches it. Walk the eye north and ask the module, in metres.
    const signs = zbSigns();
    const routeX = GATE_HALF_WIDTH_M;
    let covered = 0;
    let clear = 0;
    for (let z = -140; z <= 60; z += 1) {
      const panel = {
        x: routeX + MARKER_SIGN_LATERAL_M,
        y: MARKER_SIGN_PANEL_Y,
        z: z + PANEL_RANGE_M,
      };
      if (markerSignIsCovered({ x: routeX, y: EYE.y, z }, panel, signs)) covered += 1;
      else clear += 1;
    }
    // It fires on the map the row was filed on — the whole point of the repair.
    expect(covered).toBeGreaterThan(0);
    // …and it is not a switch that turns the caption off for the lesson. The
    // panel's own band is 68 → 21 m of road; at the scenario streets' posted
    // 50 km/h the ≥3 s floor `guidance-marker-sign.test.ts` holds it to is
    // 41.7 m, so the caption must survive far more of this walk than it loses.
    expect(clear).toBeGreaterThan(covered * 4);
  });
});
