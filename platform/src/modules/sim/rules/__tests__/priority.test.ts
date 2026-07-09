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
});
