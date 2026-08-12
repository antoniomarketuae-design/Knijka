/**
 * THE FOUNDER'S CASE, pinned: driving past a car that is standing still is not
 * a crash (2026-08-10).
 *
 * He reported «−10 наказателни точки» for a пътнотранспортно произшествие on a
 * pass where nothing was touched. The cause was `BrakingLeadCarRunner`'s
 * contact test, which carried no `*_CONTACT_M` constant and so survived the
 * sweep that retired the other three:
 *
 *     const gap = playerGap - LEAD_CAR_LENGTH_M;   // hypot(centres) − 4.3
 *     if (gap <= 0.3 && input.speedKmh > 2) → collision
 *
 * `hypot` is ISOTROPIC: it fires at 4.6 m between CENTRES in every direction.
 * Two flanks touch at 0.85 + 0.92 = 1.77 m of centres, so ABEAM it convicted a
 * pass with up to 4.6 − 1.77 = 2.83 m of clear air — wider than the car doing
 * the passing. Driven on the shipped lesson, the boundary measured 2.82 m fires
 * / 2.84 m clear, and a lawful pass leaving 1.29 m of daylight was the ONLY
 * violation on an otherwise clean drive.
 *
 * This gate drives the real production stack — createWorldRuntime +
 * createTrafficSystem + the scenario director + the rule engine — on
 * sc-follow-brake, whose staged lead brake-slams and comes to a complete
 * STANDSTILL in the player's lane. It asserts both halves, because a fix that
 * only stopped convicting would be worse than the bug:
 *
 *   · 1.29 m of daylight beside the standing car → NO violation at all;
 *   · bodies actually overlapping → COLLISION, as before.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { obbSeparationM, playerObb, PLAYER_HALF_WIDTH_M } from "../../collision";
import type { StagedEventSpec } from "../../contracts";
import { SC_FOLLOW_BRAKE } from "../../lessons/scenario/templates-following";
import { recordScriptedDrive, type DriveScript } from "../../traces/recorder";
import { vehicleHalfLengthM, vehicleHalfWidthM } from "../../traffic/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const DISTRICT = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "fo-brake-v1.json"), "utf-8"),
) as unknown;

/** fo-brake-v1 northbound lane centre — the lane the lead stands in. */
const LANE_X = 4.06;
/** The lead's MEASURED rest pose on this drive (probed, not assumed). */
const LEAD_REST_X = 4.0625;
/** Flank-to-flank touching distance between the two centre lines, m. */
const FLANK_TOUCH_M = PLAYER_HALF_WIDTH_M + vehicleHalfWidthM("car");
/** The retired constants, kept as literals so the test documents the defect. */
const RETIRED_LEAD_CAR_LENGTH_M = 4.3;
const RETIRED_LEAD_GAP_TRIGGER_M = 0.3;

/** Follow, then go around the standing car holding `passX`, then rejoin. */
function passScript(passX: number): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 120], [LANE_X, 200]], targetKmh: 40, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[LANE_X, 200], [passX, 216]], targetKmh: 18, stopAtEnd: false },
      { kind: "drive", points: [[passX, 216], [passX, 246]], targetKmh: 14, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[passX, 246], [LANE_X, 262]], targetKmh: 18, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[LANE_X, 262], [LANE_X, 330]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

function violationsOf(passX: number): string[] {
  const rec = recordScriptedDrive(DISTRICT, passScript(passX), {
    scenarioId: "sc-follow-brake",
    kind: "mistake",
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_BRAKE.staged ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
  });
  return rec.ruleEvents
    .filter((e) => e.kind === "violation")
    .map((e) => (e as { code: string }).code);
}

describe("passing a car that is standing still is not a crash (the founder's case)", () => {
  it("1.29 m of daylight beside the standing lead grades NOTHING", () => {
    const passX = 1.0;
    // the geometry the verdict is measured against, stated in the test
    const clearanceM = LEAD_REST_X - passX - FLANK_TOUCH_M;
    expect(clearanceM).toBeCloseTo(1.2925, 4);
    expect(violationsOf(passX)).toEqual([]);
  });

  it("the retired isotropic test WOULD have billed that exact pass", () => {
    // hypot(centres) − LEAD_CAR_LENGTH_M ≤ 0.3, abeam ⇒ centres = the lateral gap
    const centres = LEAD_REST_X - 1.0;
    expect(centres - RETIRED_LEAD_CAR_LENGTH_M).toBeLessThanOrEqual(RETIRED_LEAD_GAP_TRIGGER_M);
    // …and its false-positive band was almost three metres of clear air wide
    const widestFalsePositiveM =
      RETIRED_LEAD_CAR_LENGTH_M + RETIRED_LEAD_GAP_TRIGGER_M - FLANK_TOUCH_M;
    expect(widestFalsePositiveM).toBeCloseTo(2.83, 2);
  });

  it("bodies that really overlap STILL grade COLLISION", () => {
    // 1.56 m of centres abeam = 0.21 m of interpenetration
    const passX = 2.5;
    const clearanceM = LEAD_REST_X - passX - FLANK_TOUCH_M;
    expect(clearanceM).toBeLessThan(0);
    expect(violationsOf(passX)).toContain("COLLISION");
  });

  it("the exact geometry agrees with the drive: touching at 1.77 m of centres", () => {
    const half = vehicleHalfWidthM("car");
    const lead = {
      x: LEAD_REST_X,
      y: 0,
      headingDeg: 0,
      halfLengthM: vehicleHalfLengthM("car"),
      halfWidthM: half,
    };
    expect(obbSeparationM(playerObb(LEAD_REST_X - FLANK_TOUCH_M, 0, 0), lead)).toBeCloseTo(0, 9);
    expect(obbSeparationM(playerObb(1.0, 0, 0), lead)).toBeCloseTo(1.2925, 6);
    expect(obbSeparationM(playerObb(2.5, 0, 0), lead)).toBeCloseTo(-0.2075, 6);
  });
});
