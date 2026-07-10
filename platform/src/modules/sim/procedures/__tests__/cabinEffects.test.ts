import { describe, expect, it } from "vitest";
import {
  applyPreDriveStepToCabin,
  drivelineEffectOf,
  hasPreDriveCabinEffect,
  PRE_DRIVE_CABIN_EFFECT_STEPS,
  PRE_DRIVE_DRIVELINE_EFFECT_STEPS,
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
  it("exactly three steps carry a cabin-electrics effect (belt, lights, signal)", () => {
    expect(PRE_DRIVE_CABIN_EFFECT_STEPS).toEqual([
      "fasten-seatbelt",
      "headlights-on",
      "signal",
    ]);
  });

  it("exactly three steps carry a driveline effect (A1: engine, gear, parking brake)", () => {
    expect(PRE_DRIVE_DRIVELINE_EFFECT_STEPS).toEqual([
      "start-engine",
      "select-gear",
      "release-handbrake",
    ]);
    expect(drivelineEffectOf("start-engine")).toBe("engine-on");
    expect(drivelineEffectOf("select-gear")).toBe("select-forward");
    expect(drivelineEffectOf("release-handbrake")).toBe("parking-brake-off");
    for (const stepId of PRE_DRIVE_STEP_ORDER) {
      if (!PRE_DRIVE_DRIVELINE_EFFECT_STEPS.includes(stepId)) {
        expect(drivelineEffectOf(stepId)).toBeNull();
      }
    }
  });

  it("hasPreDriveCabinEffect = cabin ∪ driveline effects (the shell's forward filter)", () => {
    for (const stepId of PRE_DRIVE_STEP_ORDER) {
      expect(hasPreDriveCabinEffect(stepId)).toBe(
        PRE_DRIVE_CABIN_EFFECT_STEPS.includes(stepId) ||
          PRE_DRIVE_DRIVELINE_EFFECT_STEPS.includes(stepId),
      );
    }
  });

  it("steps without a cabin-electrics effect leave the cabin unchanged (identity)", () => {
    const nonCabin = PRE_DRIVE_STEP_ORDER.filter(
      (id) => !PRE_DRIVE_CABIN_EFFECT_STEPS.includes(id),
    );
    expect(nonCabin).toHaveLength(PRE_DRIVE_STEP_ORDER.length - 3);
    const s = cabin();
    for (const stepId of nonCabin) {
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
