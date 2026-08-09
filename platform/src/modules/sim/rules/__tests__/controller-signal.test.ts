/**
 * JU-18 регулировчик — the reducer side of the hierarchy (ADR-006 stage 1d):
 * a stopLineCrossed that carries a CONTROLLER permission grades ONLY against
 * it (ЗДвП чл. 7 — сигналите на регулировчика са над светофара и знаците):
 *
 *  - "halt" → CONTROLLER_SIGNAL_VIOLATED (опасна, 10 т.) — REGARDLESS of the
 *    lamp state, green included (the taught mistake: obeying the lamps);
 *  - "proceed" → NOTHING — even on a red lamp (the controller's permission
 *    acquits);
 *  - absent (every pre-JU-18 runtime) → the lamp grading, byte-identical.
 */

import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../catalog";
import type { SimTickEvent } from "../types";
import { codes, drive, tick } from "./fixtures";

function crossing(
  lightState: "red" | "redYellow" | "yellow" | "green",
  controller?: "halt" | "proceed",
): SimTickEvent {
  return {
    kind: "stopLineCrossed",
    control: "trafficLight",
    lightState,
    ...(controller !== undefined ? { controller } : {}),
  };
}

describe("CONTROLLER_SIGNAL_VIOLATED — the guilty side", () => {
  it("crossing on halt convicts EVEN ON GREEN LAMPS (the hierarchy lesson)", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 20, events: [crossing("green", "halt")] }),
    ]);
    expect(codes(events)).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    const v = events[0];
    expect(v.kind).toBe("violation");
    if (v.kind === "violation") {
      expect(v.severityClass).toBe("opasna");
      expect(v.points).toBe(10);
      expect(v.lawRef).toBe("ЗДвП чл. 6, т. 2; чл. 7, ал. 1");
      expect(v.conceptId).toBe("c-signal-hierarchy");
    }
  });

  it("crossing on halt convicts exactly once per crossing, on any lamp state", () => {
    for (const lamp of ["red", "redYellow", "yellow", "green"] as const) {
      const { events } = drive([
        tick(0, { speedKmh: 15 }),
        tick(1, { speedKmh: 15, events: [crossing(lamp, "halt")] }),
      ]);
      expect(codes(events), `lamp ${lamp}`).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    }
  });

  it("never fires a lamp code alongside — the permission REPLACES the lamp grading", () => {
    const { events } = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 20, events: [crossing("red", "halt")] }),
    ]);
    expect(codes(events)).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    expect(codes(events)).not.toContain("RED_LIGHT_CROSSED");
  });
});

describe("CONTROLLER permission 'proceed' — the innocent side", () => {
  it("crossing under the controller's permission on a RED lamp grades NOTHING", () => {
    const { events } = drive([
      tick(0, { speedKmh: 18 }),
      tick(1, { speedKmh: 18, events: [crossing("red", "proceed")] }),
      tick(2, { speedKmh: 18 }),
    ]);
    expect(events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("crossing waved-through on every lamp state grades NOTHING", () => {
    for (const lamp of ["red", "redYellow", "yellow", "green"] as const) {
      const { events } = drive([
        tick(0, { speedKmh: 18 }),
        tick(1, { speedKmh: 18, events: [crossing(lamp, "proceed")] }),
      ]);
      expect(events.filter((e) => e.kind === "violation"), `lamp ${lamp}`).toEqual([]);
    }
  });
});

describe("no controller field — pre-JU-18 lamp grading is byte-identical", () => {
  it("red still grades RED_LIGHT_CROSSED; green stays innocent", () => {
    const red = drive([tick(0, { speedKmh: 20 }), tick(1, { speedKmh: 20, events: [crossing("red")] })]);
    expect(codes(red.events)).toEqual(["RED_LIGHT_CROSSED"]);
    const green = drive([
      tick(0, { speedKmh: 20 }),
      tick(1, { speedKmh: 20, events: [crossing("green")] }),
    ]);
    expect(green.events.filter((e) => e.kind === "violation")).toEqual([]);
  });
});

describe("catalog entry", () => {
  it("carries the official severity, Bulgarian copy, corrective and hierarchy grounding", () => {
    const spec = VIOLATIONS.CONTROLLER_SIGNAL_VIOLATED;
    expect(spec.severityClass).toBe("opasna");
    expect(spec.points).toBe(10);
    expect(spec.titleBg).toMatch(/[Ѐ-ӿ]/);
    expect(spec.explanationBg).toMatch(/регулировчик/i);
    expect(spec.correctiveBg).toMatch(/[Ѐ-ӿ]/);
    expect(spec.lawRef).toBe("ЗДвП чл. 6, т. 2; чл. 7, ал. 1");
    expect(spec.conceptId).toBe("c-signal-hierarchy");
  });
});
