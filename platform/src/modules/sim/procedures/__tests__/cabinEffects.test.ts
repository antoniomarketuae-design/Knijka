import { describe, expect, it } from "vitest";
import {
  applyPreDriveStepToCabin,
  hasPreDriveCabinEffect,
  PRE_DRIVE_CABIN_EFFECT_STEPS,
  type PreDriveCabinState,
} from "../cabinEffects";
import { PRE_DRIVE_STEP_ORDER } from "../steps";
import type { PreDriveStepId } from "../types";

const cabin = (over: Partial<PreDriveCabinState> = {}): PreDriveCabinState => ({
  seatbeltOn: false,
  headlights: "off",
  indicator: "off",
  ...over,
});

describe("pre-drive cabin effects — the QW5 honesty map", () => {
  it("exactly three steps carry a real cabin effect (belt, lights, signal)", () => {
    expect(PRE_DRIVE_CABIN_EFFECT_STEPS).toEqual([
      "fasten-seatbelt",
      "headlights-on",
      "signal",
    ]);
    for (const stepId of PRE_DRIVE_STEP_ORDER) {
      expect(hasPreDriveCabinEffect(stepId)).toBe(
        PRE_DRIVE_CABIN_EFFECT_STEPS.includes(stepId),
      );
    }
  });

  it("informational steps change nothing (identity — cheap no-op detection)", () => {
    const informational = PRE_DRIVE_STEP_ORDER.filter(
      (id) => !hasPreDriveCabinEffect(id),
    );
    expect(informational).toHaveLength(PRE_DRIVE_STEP_ORDER.length - 3);
    const s = cabin();
    for (const stepId of informational) {
      expect(applyPreDriveStepToCabin(stepId, s)).toBe(s);
    }
  });

  it("fasten-seatbelt belts the cabin — the A6 contradiction killer", () => {
    const next = applyPreDriveStepToCabin("fasten-seatbelt", cabin());
    expect(next).toEqual(cabin({ seatbeltOn: true }));
    // Idempotent: already belted (e.g. the student pressed B) → identity.
    expect(applyPreDriveStepToCabin("fasten-seatbelt", next)).toBe(next);
  });

  it("headlights-on turns low beams on but never downgrades the student's own setting", () => {
    expect(applyPreDriveStepToCabin("headlights-on", cabin())).toEqual(
      cabin({ headlights: "low" }),
    );
    const low = cabin({ headlights: "low" });
    expect(applyPreDriveStepToCabin("headlights-on", low)).toBe(low);
    const high = cabin({ headlights: "high" });
    expect(applyPreDriveStepToCabin("headlights-on", high)).toBe(high);
  });

  it("signal sets the LEFT indicator (step text: подай ляв мигач)", () => {
    expect(applyPreDriveStepToCabin("signal", cabin())).toEqual(
      cabin({ indicator: "left" }),
    );
    // A wrong-side indicator is corrected to the taught side.
    expect(applyPreDriveStepToCabin("signal", cabin({ indicator: "right" }))).toEqual(
      cabin({ indicator: "left" }),
    );
    const left = cabin({ indicator: "left" });
    expect(applyPreDriveStepToCabin("signal", left)).toBe(left);
  });

  it("effects never touch unrelated cabin state", () => {
    const start = cabin({ seatbeltOn: true, headlights: "high", indicator: "right" });
    let s = start;
    for (const stepId of PRE_DRIVE_STEP_ORDER) {
      s = applyPreDriveStepToCabin(stepId, s);
    }
    // Belt + lights already set stay; only the indicator moves (signal step).
    expect(s).toEqual(cabin({ seatbeltOn: true, headlights: "high", indicator: "left" }));
  });

  it("covers every step id without throwing (map stays total as steps evolve)", () => {
    const all: PreDriveStepId[] = [...PRE_DRIVE_STEP_ORDER];
    for (const stepId of all) {
      expect(() => applyPreDriveStepToCabin(stepId, cabin())).not.toThrow();
    }
  });
});
