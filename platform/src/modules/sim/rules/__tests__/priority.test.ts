import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../types";
import { codes, drive, tick } from "./fixtures";

const priority = (violated: boolean, situation = "give-way"): SimTickEvent => ({
  kind: "prioritySituation",
  situation,
  violated,
});

// Phase 2 grading pipeline: the worldRuntime adjudicator (next increment) decides
// `violated`; the reducer grades it. Here we drive synthetic events.
describe("priority-situation grading", () => {
  it("grades a failure to yield as опасна, carrying the situation", () => {
    const { events } = drive([tick(1, { speedKmh: 30, events: [priority(true)] })]);
    expect(codes(events)).toContain("FAILED_TO_YIELD");
    const v = events.find((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD");
    expect(v).toMatchObject({ severityClass: "opasna", detail: "give-way" });
  });

  it("does not grade when the driver yielded correctly", () => {
    const { events } = drive([tick(1, { speedKmh: 30, events: [priority(false)] })]);
    expect(codes(events)).not.toContain("FAILED_TO_YIELD");
  });

  // ADR-006 stage 1b (doc 72 VU-09): the RESERVED "emergency" situation routes
  // to its own catalog code (special-regime duty, ЗДвП чл. 91) — every other
  // situation keeps grading FAILED_TO_YIELD byte-identically (asserted above).
  it("routes the 'emergency' situation to EMERGENCY_NOT_YIELDED (опасна, чл. 91)", () => {
    const { events } = drive([tick(1, { speedKmh: 45, events: [priority(true, "emergency")] })]);
    expect(codes(events)).toContain("EMERGENCY_NOT_YIELDED");
    expect(codes(events)).not.toContain("FAILED_TO_YIELD");
    const v = events.find((e) => e.kind === "violation" && e.code === "EMERGENCY_NOT_YIELDED");
    expect(v).toMatchObject({ severityClass: "opasna", detail: "emergency", lawRef: "ЗДвП чл. 91" });
  });

  it("commends an emergency approach the driver made way for", () => {
    const { events } = drive([
      tick(1, {
        speedKmh: 28,
        events: [{ kind: "prioritySituation", situation: "emergency", violated: false, yielded: true }],
      }),
    ]);
    expect(codes(events)).toContain("YIELDED_TO_PRIORITY");
    expect(events.filter((e) => e.kind === "violation")).toEqual([]);
  });
});
