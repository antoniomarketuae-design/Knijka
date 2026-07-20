/**
 * B1a Wave-3 detector pack (doc 72 capability 1 — CONFIG-GATED per-lesson
 * drills on EXISTING telemetry) — true-positive coverage. Each ships FLAGGED
 * OFF (the A12 innocent-drive contract treats the pattern as innocent by
 * default — see types.ts), so every case here enables the drill config first:
 *   JUNCTION_SCAN_INCOMPLETE       JU-23  основна (3)   — junctionScanObservationEnabled
 *   FOLLOWING_TOO_CLOSE_FOR_RAIN   FO-04  второстепенна (1) — followRainAwareEnabled
 * The innocent side of each (including the default-OFF guarantee) lives in
 * false-positives.test.ts (the contract).
 */

import { describe, expect, it } from "vitest";
import type { RuleEvent, SimTickEvent, ViolationEvent } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

function violationsOf(events: RuleEvent[], code: string): ViolationEvent[] {
  return events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === code);
}

const glance = (mirror: "left" | "right" | "rear"): SimTickEvent => ({ kind: "mirrorGlance", mirror });
const stopSign: SimTickEvent = { kind: "stopLineCrossed", control: "stopSign" };
const giveWay: SimTickEvent = { kind: "stopLineCrossed", control: "giveWay" };

// ---------------------------------------------------------------------------
// JU-23 — junction-scan lookback (single-glance emergence)
// ---------------------------------------------------------------------------

describe("JUNCTION_SCAN_INCOMPLETE (JU-23 — един поглед не стига)", () => {
  const enabled = { junctionScanObservationEnabled: true } as const;

  it("crossing a Б2 line after a full stop but WITHOUT a ляво-дясно scan grades основна", () => {
    // A full stop happened (so no STOP_SIGN_NO_FULL_STOP), yet no left/right
    // glance — the isolated fault is the incomplete observation.
    const { events } = drive(
      [
        tick(0, { speedKmh: 12 }),
        tick(1, { speedKmh: 0.4 }),
        tick(2, { speedKmh: 0.4 }), // qualifying full stop
        tick(3, { speedKmh: 6, events: [stopSign] }), // cross, no glances
      ],
      enabled,
    );
    const v = violationsOf(events, "JUNCTION_SCAN_INCOMPLETE");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("osnovna");
    expect(v[0].points).toBe(3);
    // it charges observation, not the stop — the full stop still earns its praise
    expect(codes(events)).toContain("FULL_STOP_AT_STOP_SIGN");
    expect(codes(events)).not.toContain("STOP_SIGN_NO_FULL_STOP");
  });

  it("a single glance is not enough — left only, missing the right, still grades", () => {
    const { events } = drive(
      [
        tick(0, { speedKmh: 12 }),
        tick(1, { speedKmh: 0.4, events: [glance("left")] }),
        tick(2, { speedKmh: 0.4 }),
        tick(3, { speedKmh: 6, events: [stopSign] }),
      ],
      enabled,
    );
    expect(violationsOf(events, "JUNCTION_SCAN_INCOMPLETE")).toHaveLength(1);
  });

  it("a stale scan while MOVING grades — freshness is per mouth, not per drive", () => {
    // Glances taken 8 s (and ~45 m) of DRIVING before the line are the mouth-1
    // scan arriving at mouth 2 — moving time ages the scan at full rate.
    const { events } = drive(
      [
        tick(0, { speedKmh: 20, events: [glance("left"), glance("right")] }),
        ...cruise(1, 7, { speedKmh: 20 }), // driving on — the world changes
        tick(8, { speedKmh: 12, events: [stopSign] }),
      ],
      enabled,
    );
    expect(violationsOf(events, "JUNCTION_SCAN_INCOMPLETE")).toHaveLength(1);
  });

  it("founder R3 #13: glance both sides at the mouth, WAIT for the priority car, cross — clean", () => {
    // The founder's live sequence at sc-jx-giveway-b1's second Б1 mouth: crawl
    // up, look left and right AT the mouth, stand waiting for the staged
    // priority car to pass (~7 s), then cross. Before the wait-freeze fix the
    // 5 s lookback expired DURING the legally-required wait and the crossing
    // graded JUNCTION_SCAN_INCOMPLETE although he had scanned; stopped time
    // must not stale a scan of a world that is not moving past you.
    const { events } = drive(
      [
        tick(0, { speedKmh: 10 }),
        tick(1, { speedKmh: 3, events: [glance("left")] }),
        tick(2, { speedKmh: 0.4, events: [glance("right")] }),
        ...cruise(3, 9, { speedKmh: 0.4 }), // waiting for the priority car
        tick(10, { speedKmh: 6, events: [giveWay] }),
      ],
      enabled,
    );
    expect(violationsOf(events, "JUNCTION_SCAN_INCOMPLETE")).toHaveLength(0);
  });

  it("the same wait at a Б2 stays clean too — and still earns the full-stop praise", () => {
    const { events } = drive(
      [
        tick(0, { speedKmh: 10 }),
        tick(1, { speedKmh: 0.4, events: [glance("left")] }),
        tick(2, { speedKmh: 0.4, events: [glance("right")] }),
        ...cruise(3, 9, { speedKmh: 0.4 }), // long queue wait at the sign
        tick(10, { speedKmh: 6, events: [stopSign] }),
      ],
      enabled,
    );
    expect(violationsOf(events, "JUNCTION_SCAN_INCOMPLETE")).toHaveLength(0);
    expect(codes(events)).toContain("FULL_STOP_AT_STOP_SIGN");
  });

  it("the wait-freeze credits only STOPPED time — a wait followed by a long roll still goes stale", () => {
    // Scan at the mouth, wait 4 s, then ROLL 8 s (and ~40 m) before crossing:
    // the moving tail alone exceeds the lookback — the scan is a memory of a
    // different place and grades.
    const { events } = drive(
      [
        tick(0, { speedKmh: 0.4, events: [glance("left"), glance("right")] }),
        ...cruise(1, 4, { speedKmh: 0.4 }), // waiting (frozen)
        ...cruise(5, 12, { speedKmh: 18 }), // rolling on (ages at full rate)
        tick(13, { speedKmh: 12, events: [giveWay] }),
      ],
      enabled,
    );
    expect(violationsOf(events, "JUNCTION_SCAN_INCOMPLETE")).toHaveLength(1);
  });

  it("a rolling stop that ALSO skips the scan bills both faults (distinct acts)", () => {
    const { events } = drive(
      [
        tick(0, { speedKmh: 18 }),
        tick(1, { speedKmh: 8, events: [stopSign] }), // never stopped + never scanned
      ],
      enabled,
    );
    expect(codes(events)).toContain("STOP_SIGN_NO_FULL_STOP");
    expect(codes(events)).toContain("JUNCTION_SCAN_INCOMPLETE");
  });
});

// ---------------------------------------------------------------------------
// FO-04 — rain-aware following
// ---------------------------------------------------------------------------

describe("FOLLOWING_TOO_CLOSE_FOR_RAIN (FO-04 — дистанция в дъжд)", () => {
  const enabled = { followRainAwareEnabled: true } as const;

  it("a dry-safe but wet-imprudent gap in rain grades второстепенна", () => {
    // At 40 km/h the dry fire threshold is ~14 m and the wet-prudent fire
    // threshold ~22 m; an 18 m gap is fine for dry (base основна silent) but
    // too close for rain. Speed 40 ≤ the 42.5 rain envelope, so no
    // conditions-speed leaks; lows on, so no rain-lights code.
    const { events } = drive(
      cruise(0, 6, { speedKmh: 40, rain: true, leadGapM: 18 }),
      enabled,
    );
    const v = violationsOf(events, "FOLLOWING_TOO_CLOSE_FOR_RAIN");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("vtorostepenna");
    expect(v[0].points).toBe(1);
    expect(codes(events)).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes(events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("a gap close enough to fail even for DRY bills the base основна, not the rain code", () => {
    // 10 m at 40 km/h is under the ~14 m dry fire threshold — the base
    // FOLLOWING_TOO_CLOSE fires; the rain code sits in the band ABOVE it and
    // stays silent (no double-bill).
    const { events } = drive(
      cruise(0, 6, { speedKmh: 40, rain: true, leadGapM: 10 }),
      enabled,
    );
    expect(codes(events)).toContain("FOLLOWING_TOO_CLOSE");
    expect(codes(events)).not.toContain("FOLLOWING_TOO_CLOSE_FOR_RAIN");
  });
});
