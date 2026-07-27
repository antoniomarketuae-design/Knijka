/**
 * Central-island contracts for scene stills (founder review 2026-07-27,
 * q-krastovishta-064/065: „it is not real roundabout - rather 4 small
 * roundabouts … we need proper 1 roundabout").
 *
 * The island is what turns four junction pads into one roundabout, so the two
 * things worth locking are (a) it lands EXACTLY on the inner edge of the
 * circulatory carriageway — one metre out and it either paves over the ring or
 * leaves a grass gutter — and (b) it is big enough to swallow the inner corner
 * aprons the world builder wraps around every arm↔ring joint, which are the
 * star-shaped kerbs the founder actually saw.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertDistrict, type District } from "@/modules/sim/world";
import { roundaboutIslands } from "./roundaboutIsland";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

function readDistrict(districtId: string): District {
  return assertDistrict(
    JSON.parse(readFileSync(path.join(REPO, "platform/public/world", `${districtId}.json`), "utf-8")),
  );
}

/** builders/constants.ts LANE_WIDTH_M — copied, not imported: this asserts the
 *  SHIPPED geometry, so it must not move silently when the constant does. */
const LANE_WIDTH_M = 3.25 * 2.5;
/** builders/constants.ts JUNCTION_CORNER_RADIUS_MINOR_M (arms rank <= 2). */
const JUNCTION_CORNER_RADIUS_M = 9;

describe("roundaboutIslands", () => {
  it("rb-single-v1: the island stops exactly at the inner edge of the ring lane", () => {
    const district = readDistrict("rb-single-v1");
    const islands = roundaboutIslands(district);
    expect(islands).toHaveLength(1);
    const [isle] = islands;
    const rb = district.roundabouts[0];
    // Single-lane ring ⇒ drawn half width 4.0625 m (edgeTravelHalfWidth).
    expect(isle.radiusM).toBeCloseTo(rb.radius - LANE_WIDTH_M / 2, 6);
    expect(isle).toMatchObject({ id: rb.id, x: rb.x, y: rb.y });
  });

  it("rb-single-v1: the island covers the junction pads' inner corner aprons", () => {
    // THE REGRESSION. The builder opens a pad of `openRadius` at every arm↔ring
    // joint and wraps a raised curb apron around its INNER corner — the arc
    // that bulges toward the centre and, on a small ring, meets its three
    // neighbours as a star. An island that does not reach that bulge leaves the
    // star sticking out and the picture still reads as four mouths.
    const district = readDistrict("rb-single-v1");
    const [isle] = roundaboutIslands(district);
    const R = district.roundabouts[0].radius;
    const ringHalf = LANE_WIDTH_M / 2;
    const openRadius = LANE_WIDTH_M + JUNCTION_CORNER_RADIUS_M; // 2-lane arm half + fillet
    // The apron arc rides at |innerRingCut − node|; its deepest point toward the
    // centre therefore sits at R − that distance.
    const theta = openRadius / R;
    const bulgeM = Math.hypot(
      (R - ringHalf) * Math.sin(theta),
      R - (R - ringHalf) * Math.cos(theta),
    );
    const deepestBiteRadiusM = R - bulgeM;
    expect(deepestBiteRadiusM).toBeGreaterThan(0); // sanity: the bite is inboard
    expect(isle.radiusM).toBeGreaterThan(deepestBiteRadiusM);
  });

  it("draws nothing for a district that registers no roundabout", () => {
    const district = readDistrict("tj-stop-v1");
    expect(district.roundabouts).toHaveLength(0);
    expect(roundaboutIslands(district)).toEqual([]);
  });

  it("skips a registration whose ring lane leaves no island at all", () => {
    // A degenerate disc in the middle of a junction would be a new lie, not a
    // fix — so a ring narrower than its own carriageway draws nothing.
    const district = readDistrict("rb-single-v1");
    const degenerate: District = {
      ...district,
      roundabouts: [{ ...district.roundabouts[0], radius: 3 }],
    };
    expect(roundaboutIslands(degenerate)).toEqual([]);
  });
});
