/**
 * RAIL PACK slice-1 detector (ADR-006 stage 3a — authored railCrossing
 * district zones) — true-positive coverage + the STRUCTURAL innocent sides.
 * The taxonomy archetypes:
 *   RAIL_CROSSING_VIOLATION  RX-01/RX-02/RX-03  опасна (10)
 *
 * The LEGAL ASYMMETRY (ЗДвП чл. 51–53) is the design constraint this file
 * enforces from both sides:
 *   - UNGUARDED (railGuarded absent): the mandatory FULL STOP before the band
 *     — entry without a recent qualifying stop convicts; entry after one is
 *     innocent;
 *   - GUARDED + OPEN: NO stop duty at all — a stop-free crossing is LEGAL and
 *     must never convict (чл. 52 — the barrier does the guarding);
 *   - GUARDED + BARRED: entry convicts unconditionally — a polite stop first
 *     does NOT acquit;
 *   - ON the band: coming to REST convicts with NO queue exemption (RX-03 —
 *     following the queue onto the tracks IS the kill), while braking
 *     THROUGH without stopping never does.
 * The A12 whole-drive cases also live in false-positives.test.ts.
 */

import { describe, expect, it } from "vitest";
import type { RuleEvent, ViolationEvent } from "../types";
import { codes, cruise, drive, tick } from "./fixtures";

function violationsOf(events: RuleEvent[], code: string): ViolationEvent[] {
  return events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === code);
}

describe("RAIL_CROSSING_VIOLATION — unguarded entry (RX-02, the mandatory stop)", () => {
  it("rolling onto the band with no stop grades опасна (10) once, detail no-stop", () => {
    const { events } = drive([
      tick(0, { speedKmh: 30, railCrossing: "approach" }),
      tick(1, { speedKmh: 30, railCrossing: "approach" }),
      tick(2, { speedKmh: 30, railCrossing: "on" }),
      tick(3, { speedKmh: 30, railCrossing: "on" }),
      tick(4, { speedKmh: 30 }),
    ]);
    const v = violationsOf(events, "RAIL_CROSSING_VIOLATION");
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("opasna");
    expect(v[0].points).toBe(10);
    expect(v[0].detail).toBe("no-stop");
  });

  it("a full stop at the line, then a brisk crossing, is the correct ritual — innocent", () => {
    const { events } = drive([
      tick(0, { speedKmh: 30, railCrossing: "approach" }),
      tick(1, { speedKmh: 12, railCrossing: "approach" }),
      tick(2, { speedKmh: 0, railCrossing: "approach" }),
      tick(3, { speedKmh: 0, railCrossing: "approach" }), // qualifying full stop
      tick(4, { speedKmh: 14, railCrossing: "approach" }),
      tick(5, { speedKmh: 20, railCrossing: "on" }), // entry 2 s after the stop
      tick(6, { speedKmh: 25, railCrossing: "on" }),
      tick(7, { speedKmh: 30 }),
    ]);
    expect(codes(events)).not.toContain("RAIL_CROSSING_VIOLATION");
  });

  it("a stop made too LONG before the band (recency expired) does not satisfy the duty", () => {
    const { events } = drive([
      tick(0, { speedKmh: 0, railCrossing: "approach" }),
      tick(1, { speedKmh: 0, railCrossing: "approach" }), // stop ends here (t=1)
      ...cruise(2, 8, { speedKmh: 25, railCrossing: "approach" }),
      tick(9, { speedKmh: 25, railCrossing: "on" }), // 8 s later — outside stopRecencySec
      tick(10, { speedKmh: 25 }),
    ]);
    expect(violationsOf(events, "RAIL_CROSSING_VIOLATION")).toHaveLength(1);
    expect(violationsOf(events, "RAIL_CROSSING_VIOLATION")[0].detail).toBe("no-stop");
  });

  it("a vehicle materialising ON the band (no approach seen) never grades an entry", () => {
    const { events } = drive([
      tick(0, { speedKmh: 25, railCrossing: "on" }),
      tick(1, { speedKmh: 25, railCrossing: "on" }),
      tick(2, { speedKmh: 25 }),
    ]);
    expect(codes(events)).not.toContain("RAIL_CROSSING_VIOLATION");
  });

  it("reverse maneuvering across the band never grades (parking country, A12)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 8, gear: -1, railCrossing: "approach" }),
      tick(1, { speedKmh: 8, gear: -1, railCrossing: "approach" }),
      tick(2, { speedKmh: 8, gear: -1, railCrossing: "on" }),
      tick(3, { speedKmh: 8, gear: -1 }),
    ]);
    expect(codes(events)).not.toContain("RAIL_CROSSING_VIOLATION");
  });
});

describe("RAIL_CROSSING_VIOLATION — guarded crossing (RX-01, the barred-entry ban)", () => {
  it("entering while BARRED grades опасна once, detail entered-barred", () => {
    const { events } = drive([
      tick(0, { speedKmh: 30, railCrossing: "approach", railGuarded: true, railBarred: true }),
      tick(1, { speedKmh: 30, railCrossing: "approach", railGuarded: true, railBarred: true }),
      tick(2, { speedKmh: 30, railCrossing: "on", railGuarded: true, railBarred: true }),
      tick(3, { speedKmh: 30, railCrossing: "on", railGuarded: true, railBarred: true }),
      tick(4, { speedKmh: 30 }),
    ]);
    const v = violationsOf(events, "RAIL_CROSSING_VIOLATION");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toBe("entered-barred");
  });

  it("a polite full stop first does NOT acquit a barred entry (the weave)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20, railCrossing: "approach", railGuarded: true, railBarred: true }),
      tick(1, { speedKmh: 0, railCrossing: "approach", railGuarded: true, railBarred: true }),
      tick(2, { speedKmh: 0, railCrossing: "approach", railGuarded: true, railBarred: true }),
      tick(3, { speedKmh: 8, railCrossing: "approach", railGuarded: true, railBarred: true }),
      tick(4, { speedKmh: 8, railCrossing: "on", railGuarded: true, railBarred: true }),
      tick(5, { speedKmh: 15 }),
    ]);
    const v = violationsOf(events, "RAIL_CROSSING_VIOLATION");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toBe("entered-barred");
  });

  it("THE LEGAL ASYMMETRY: crossing a guarded-OPEN crossing WITHOUT stopping is legal (чл. 52)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 35, railCrossing: "approach", railGuarded: true }),
      tick(1, { speedKmh: 35, railCrossing: "approach", railGuarded: true }),
      tick(2, { speedKmh: 35, railCrossing: "on", railGuarded: true }),
      tick(3, { speedKmh: 35, railCrossing: "on", railGuarded: true }),
      tick(4, { speedKmh: 35 }),
    ]);
    expect(codes(events)).not.toContain("RAIL_CROSSING_VIOLATION");
  });

  it("a long wait at the BARRED approach line is exactly correct — innocent", () => {
    const { events } = drive([
      tick(0, { speedKmh: 25, railCrossing: "approach", railGuarded: true, railBarred: true }),
      ...cruise(1, 35, { speedKmh: 0, railCrossing: "approach", railGuarded: true, railBarred: true }),
      tick(36, { speedKmh: 15, railCrossing: "approach", railGuarded: true }),
      tick(37, { speedKmh: 20, railCrossing: "on", railGuarded: true }),
      tick(38, { speedKmh: 25 }),
    ]);
    expect(events.filter((e) => e.kind === "violation")).toEqual([]);
  });
});

describe("RAIL_CROSSING_VIOLATION — at rest ON the band (RX-03, no queue exemption)", () => {
  it("freezing mid-band ≥ 2 s grades once, detail stopped-on-track — after a CORRECT entry", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20, railCrossing: "approach" }),
      tick(1, { speedKmh: 0, railCrossing: "approach" }),
      tick(2, { speedKmh: 0, railCrossing: "approach" }), // the mandatory stop (entry innocent)
      tick(3, { speedKmh: 10, railCrossing: "on" }),
      tick(4, { speedKmh: 0, railCrossing: "on" }),
      tick(5, { speedKmh: 0, railCrossing: "on" }),
      tick(6, { speedKmh: 0, railCrossing: "on" }), // ≥ 2 s at rest on the rails
      tick(7, { speedKmh: 15, railCrossing: "on" }),
      tick(8, { speedKmh: 25 }),
    ]);
    const v = violationsOf(events, "RAIL_CROSSING_VIOLATION");
    expect(v).toHaveLength(1);
    expect(v[0].detail).toBe("stopped-on-track");
  });

  it("a QUEUE does NOT exempt the rest on the rails — the RX-03 kill is exactly this", () => {
    const { events } = drive([
      tick(0, { speedKmh: 15, railCrossing: "approach", leadGapM: 8 }),
      tick(1, { speedKmh: 0, railCrossing: "approach", leadGapM: 6 }),
      tick(2, { speedKmh: 0, railCrossing: "approach", leadGapM: 6 }),
      tick(3, { speedKmh: 6, railCrossing: "on", leadGapM: 6 }),
      ...cruise(4, 8, { speedKmh: 0, railCrossing: "on", leadGapM: 5 }),
      tick(9, { speedKmh: 15 }),
    ]);
    expect(violationsOf(events, "RAIL_CROSSING_VIOLATION")).toHaveLength(1);
    expect(violationsOf(events, "RAIL_CROSSING_VIOLATION")[0].detail).toBe("stopped-on-track");
  });

  it("braking THROUGH the band without coming to rest never convicts", () => {
    const { events } = drive([
      tick(0, { speedKmh: 30, railCrossing: "approach", railGuarded: true }),
      tick(1, { speedKmh: 20, railCrossing: "approach", railGuarded: true }),
      tick(2, { speedKmh: 10, railCrossing: "on", railGuarded: true }),
      tick(3, { speedKmh: 6, railCrossing: "on", railGuarded: true }),
      tick(4, { speedKmh: 12, railCrossing: "on", railGuarded: true }),
      tick(5, { speedKmh: 25 }),
    ]);
    expect(codes(events)).not.toContain("RAIL_CROSSING_VIOLATION");
  });

  it("two distinct acts bill twice: a no-stop entry AND a rest on the band", () => {
    const { events } = drive([
      tick(0, { speedKmh: 30, railCrossing: "approach" }),
      tick(1, { speedKmh: 30, railCrossing: "approach" }),
      tick(2, { speedKmh: 25, railCrossing: "on" }), // entry with no stop → bill 1
      ...cruise(3, 7, { speedKmh: 0, railCrossing: "on" }), // rest on the rails → bill 2
      tick(8, { speedKmh: 20 }),
    ]);
    const v = violationsOf(events, "RAIL_CROSSING_VIOLATION");
    expect(v).toHaveLength(2);
    expect(v.map((e) => e.detail)).toEqual(["no-stop", "stopped-on-track"]);
  });

  it("a continuing rest bills once (the episode latches until the car moves on)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20, railCrossing: "approach" }),
      tick(1, { speedKmh: 0, railCrossing: "approach" }),
      tick(2, { speedKmh: 0, railCrossing: "approach" }),
      tick(3, { speedKmh: 8, railCrossing: "on" }),
      ...cruise(4, 20, { speedKmh: 0, railCrossing: "on" }), // a 16 s freeze — one bill
      tick(21, { speedKmh: 15 }),
    ]);
    expect(violationsOf(events, "RAIL_CROSSING_VIOLATION")).toHaveLength(1);
  });
});

describe("RAIL_CROSSING_VIOLATION — absent context is silent (the v1 world)", () => {
  it("a long drive with stops and no rail fields never fires (absent = innocent)", () => {
    const { events } = drive([
      ...cruise(0, 10, { speedKmh: 30 }),
      ...cruise(11, 16, { speedKmh: 0 }),
      ...cruise(17, 25, { speedKmh: 30 }),
    ]);
    expect(codes(events)).not.toContain("RAIL_CROSSING_VIOLATION");
  });
});
