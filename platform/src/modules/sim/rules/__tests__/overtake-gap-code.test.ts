/**
 * OVERTAKE_INSUFFICIENT_GAP reducer mapping (doc 72 OV-05 — the overtake-
 * corridor adjudication's grading side). The runtime's tracker emits the
 * reserved prioritySituation vocabulary with situation "overtake-oncoming";
 * the reducer maps it to its OWN catalog code (the EMERGENCY_NOT_YIELDED
 * precedent) — every other situation keeps grading byte-identically.
 */

import { describe, expect, it } from "vitest";
import type { ViolationEvent } from "../types";
import { drive, tick } from "./fixtures";

describe("prioritySituation 'overtake-oncoming' → OVERTAKE_INSUFFICIENT_GAP", () => {
  it("violated grades the dedicated опасна (10) with the situation in detail", () => {
    const { events } = drive([
      tick(0, {
        speedKmh: 55,
        events: [
          {
            kind: "prioritySituation",
            situation: "overtake-oncoming",
            violated: true,
            gapSec: 3.1,
          },
        ],
      }),
    ]);
    const v = events.filter(
      (e): e is ViolationEvent => e.kind === "violation" && e.code === "OVERTAKE_INSUFFICIENT_GAP",
    );
    expect(v).toHaveLength(1);
    expect(v[0].severityClass).toBe("opasna");
    expect(v[0].points).toBe(10);
    expect(v[0].detail).toBe("overtake-oncoming");
    expect(v[0].lawRef).toContain("чл. 42");
    // The catalog invariant: COLLISION stays the only terminating code.
    expect(v[0].terminateSession).toBeUndefined();
    // Never the generic priority code — a head-on gamble is its own lesson.
    expect(events.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")).toBe(false);
  });

  it("every other situation keeps grading FAILED_TO_YIELD byte-identically", () => {
    const { events } = drive([
      tick(0, {
        speedKmh: 30,
        events: [{ kind: "prioritySituation", situation: "narrow-meeting", violated: true }],
      }),
    ]);
    expect(events.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")).toBe(true);
    expect(
      events.some((e) => e.kind === "violation" && e.code === "OVERTAKE_INSUFFICIENT_GAP"),
    ).toBe(false);
  });
});
