/**
 * THE NEAR-MISS ENTRY LINE — the A11 detector's own threshold, pinned by behaviour
 * (the resumed round-11 task-cap lane; its drift mutant DVC5).
 *
 * `DEFAULT_NEAR_MISS_CONFIG.enterClearanceM` is the body-envelope clearance below
 * which the detector opens a danger window: 0.75 m. Every near-miss the scene
 * reports is decided by it, and each one reaches the end-screen mistake map and
 * the stored session (`finishLessonPayload` → `wire.ts parseNearMisses`). The
 * payload tests derive their clearance domain FROM this config on purpose (the
 * parity stop rule), so a retune of the line moves that domain with it and they
 * stay green; and `proximity.test.ts` checks the window's mechanics with
 * clearances (0.23, 0.4, 1.03) that sit on the same side of 0.5 and 0.75 alike.
 * So nothing pinned the line itself: 0.75 → 0.5 dropped every pass between them
 * from the stored record with every test green. These cases pin it from both
 * sides — a pass whose tightest clearance is just under the line is one near-miss
 * reported at that clearance; one just over it is none.
 */
import { describe, expect, it } from "vitest";
import { createNearMissTracker, DEFAULT_NEAR_MISS_CONFIG, stepNearMiss, type NearMissAgent, type NearMissPlayer } from "../proximity";

const DT = 1 / 60;
const PLAYER_HALF_W = 0.85;
const VEH_HALF_W = 0.92;
const VEH_HALF_L = 2.1;

/** One oncoming pass at a fixed lateral offset: every clearance the detector reported. */
function pass(clearanceM: number): number[] {
  const tracker = createNearMissTracker(1);
  const out: number[] = [];
  const player: NearMissPlayer = { x: 0, y: 0, headingDeg: 0, speedMps: 10, halfWidthM: PLAYER_HALF_W, halfLengthM: 2.02 };
  const lat = PLAYER_HALF_W + VEH_HALF_W + clearanceM;
  for (let i = 0; i < 60 * 6; i++) {
    const agent: NearMissAgent = { x: lat, y: 30 - i * DT * 18, dirX: 0, dirY: -1, speedMps: 8 };
    stepNearMiss(tracker, DT, player, [agent], VEH_HALF_W, VEH_HALF_L, DEFAULT_NEAR_MISS_CONFIG, (_i, c) => out.push(c));
  }
  return out;
}

describe("the near-miss entry line is 0.75 m of body-envelope clearance", () => {
  it("the config declares it", () => {
    expect(DEFAULT_NEAR_MISS_CONFIG.enterClearanceM).toBe(0.75);
  });
  it("a pass at 0.74 m is ONE near-miss, reported at its clearance; so are 0.6 m and 0.51 m (between the line and half a metre)", () => {
    for (const c of [0.74, 0.6, 0.51]) {
      const got = pass(c);
      expect(got).toHaveLength(1);
      expect(got[0]).toBeCloseTo(c, 5);
    }
  });
  it("a pass at 0.76 m — just over the line — is none", () => {
    expect(pass(0.76)).toEqual([]);
  });
});
