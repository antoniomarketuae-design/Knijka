/**
 * A SNOW LESSON THAT ORDERS «включи късите светлини» MUST SHOW A LIGHTS ROW.
 *
 * O28 and O35 are the same hole found from two directions, a round apart, by
 * lanes that never met:
 *
 *   O28 (round 6, the GRADER) — `rules/engine.ts` armed a low-beam detector for
 *        rain and for fog and NONE for snow, so a winter lesson could demand
 *        lamps its own grader could never see.
 *   O35 (round 8, the DISPLAY) — `DashboardStatus.headlightsRequired` was
 *        written `isNight || rain`, and compile makes the three weathers
 *        EXCLUSIVE, so a snow lesson has `rain === false` and `fog === false`.
 *        The bit was false, and the student got no lights row at all.
 *
 * One channel, no single owner, two drifts. The fix is to stop shipping the
 * CONCLUSION between files and ship the CONDITIONS instead: the scene publishes
 * the same four flags `reduceTick` grades on, and `armedTelltaleWarnings`
 * derives the duty and its citation from them.
 *
 * This file pins the display half on the real derivation, and pins the legacy
 * single-bit path as the thing that is still wrong — so nobody re-wires a caller
 * back onto it by accident and reads the green suite as permission.
 *
 * WHAT IT DOES NOT PIN, STATED BECAUSE A MUTATION PROVED IT RATHER THAN BECAUSE
 * IT SOUNDED PRUDENT. Two mutations were run against this file:
 *
 *   · the scene stops publishing the conditions (`dash.conditions = undefined`,
 *     i.e. exactly the O35 state)            → SURVIVED, suite still green
 *   · a caller forces the legacy path        → SURVIVED, suite still green
 *
 * Both survive because a unit test that builds its own `DashboardStatus` never
 * loads `LessonScene.tsx`, so nothing it asserts can depend on what that file
 * writes. The first cut of this file was worse: it passed `s.conditions` into
 * `armedTelltaleWarnings` itself, supplying the very wiring it claimed to test.
 * That was removed — it now calls the function exactly as the product does —
 * and the caller argument was given a default of `s.conditions`, so omission
 * can no longer be a caller's mistake at all.
 *
 * The scene's own write remains UNPINNED and is filed as such rather than
 * hidden behind a green tick. That is the honest boundary of this file: it
 * proves the derivation and the contract, not the publication.
 */

import { describe, expect, it } from "vitest";
import { armedTelltaleWarnings, headlightDutyCode } from "../telltaleWarnings";
import { createDashboardStatus, type DashboardStatus } from "../dashboardStatus";

/** A car that is running and stationary — "about to drive", which is when the
 *  belt-and-lamps warnings are supposed to arm. */
function ready(over: Partial<DashboardStatus> = {}): DashboardStatus {
  return { ...createDashboardStatus(), engineOn: true, headlights: "off", ...over };
}

// NO SECOND ARGUMENT, DELIBERATELY. The first cut of this file passed
// s.conditions here, and a mutation proved that worthless: reverting either
// live call site left the suite green, because the test supplied what the
// wiring was supposed to. Calling it exactly as the product does is what makes
// these assertions about the product.
const lightsRow = (s: DashboardStatus) =>
  armedTelltaleWarnings(s).find((w) => w.id === "lights") ?? null;

describe("the lights row can see snow", () => {
  it("THE DEFECT, as a live derivation: snow alone requires the lamps", () => {
    // The single flag that made this invisible. If `headlightDutyCode` ever
    // stops answering for snow, this is the first thing red.
    expect(headlightDutyCode({ isNight: false, rain: false, fog: false, snow: true })).not.toBeNull();
  });

  it("a snow drive with the lamps OFF shows the row", () => {
    const s = ready({ conditions: { isNight: false, rain: false, fog: false, snow: true } });
    const row = lightsRow(s);
    expect(row).not.toBeNull();
    expect(row!.labelBg).toContain("Светлините");
    // It must carry a code, because the row is what tells the student WHICH
    // duty he is failing — THEO-4 forbids a bare warning as much as a bare
    // verdict.
    expect(row!.code).toBeTruthy();
  });

  it("THE OTHER DIRECTION: the same snow drive with the lamps ON shows nothing", () => {
    // A row that appears whatever the student does is not a warning, it is
    // wallpaper — and it would make the assertion above pass for free.
    const s = ready({
      headlights: "low",
      conditions: { isNight: false, rain: false, fog: false, snow: true },
    });
    expect(lightsRow(s)).toBeNull();
  });

  it("THE OTHER DIRECTION: a clear dry day with the lamps off shows nothing", () => {
    const s = ready({ conditions: { isNight: false, rain: false, fog: false, snow: false } });
    expect(lightsRow(s)).toBeNull();
  });

  it("night and rain still arm it — the snow term did not displace them", () => {
    for (const c of [
      { isNight: true, rain: false, fog: false, snow: false },
      { isNight: false, rain: true, fog: false, snow: false },
    ]) {
      expect(lightsRow(ready({ conditions: c })), JSON.stringify(c)).not.toBeNull();
    }
  });

  it("THE LEGACY BIT IS STILL WRONG, and that is pinned rather than hidden", () => {
    // `conditions` absent = the old single-bit path, kept byte-for-byte so no
    // headless or legacy mount breaks. It reads `headlightsRequired`, which the
    // scene writes as `isNight || rain` — false on a snow lesson. Asserting the
    // wrongness is what stops someone re-wiring a live caller onto it and
    // reading the green suite as permission: if this ever starts passing, the
    // legacy path was fixed and this test should be replaced, not deleted.
    const legacySnow = ready({ headlightsRequired: false });
    expect(legacySnow.conditions).toBeUndefined();
    expect(armedTelltaleWarnings(legacySnow).find((w) => w.id === "lights")).toBeUndefined();
    // …and the derivation disagrees with it on exactly that input, which is the
    // whole finding in one line.
    expect(
      lightsRow(ready({ conditions: { isNight: false, rain: false, fog: false, snow: true } })),
    ).not.toBeNull();
  });
});
