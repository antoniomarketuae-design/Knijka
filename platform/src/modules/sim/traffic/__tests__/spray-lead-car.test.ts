/**
 * =============================================================================
 * THE CAR IN FRONT THROWS SPRAY TOO — sc-follow-rain-gap:b18e6e60.
 * =============================================================================
 *
 * The row, in its own words: „no spray off the lead car". Judged STILL on six
 * consecutive rounds; the standing verify's own scope for the remainder reads
 * „spray off the lead vehicle first, then puddles, then a specular sheen", and
 * the leg it was last measured on (`5c200d0b102f`, mobile-right) is ИЗДЪРЖАН
 * with both objectives ticked — so this is a world-versus-briefing mismatch,
 * not a false refusal. `sc-follow-rain-gap` instruction 3 is «Помни: дневните
 * светят само напред и оставят габаритите ти тъмни В ПРЪСКИТЕ».
 *
 * WHY THE PRODUCT HAD NONE. `vehicleFleet.ts` gated the whole пелена on a set
 * of three HEAVY profiles, and `templates-following.ts FR_LEAD_CAR` authors no
 * `profile` at all — so the one vehicle this lesson stages was outside the
 * gate, and the one drill that renders the curtain (`sc-ac-truck-spray`) was
 * paying for the rule with a different lesson's picture.
 *
 * WHAT IS ASSERTED HERE, and it is three separate claims because a repair that
 * satisfied the first two and broke the third would be worse than none:
 *
 *   1. a staged car throws something;
 *   2. a HEAVY emitter still throws materially more of it at the same weather,
 *      speed and gap — the „HIGH vehicle you cannot see past" discriminator
 *      the section header defends is kept by ARITHMETIC and not by absence;
 *   3. ambient traffic throws nothing, which is the allocation property that
 *      keeps every non-staged lesson bit-identical to shipped.
 *
 * AND THE WIRE. `sprayStrength` is a number nothing would read if TrafficLayer
 * did not multiply it into the density it already computes — the 51-of-82
 * defect class — so the last case reads the render loop's own source.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  emitsSpray,
  sprayActiveSlabs,
  sprayDensity,
  SPRAY_SLABS,
  sprayStrength,
} from "../vehicleFleet";

/** The pinned drill conditions: full storm, the lead's own 25 км/ч cruise
 *  (`FR_LEAD_CAR.paceSpeedMps` = 7 m/s), at the gap the lesson teaches. */
const RAIN = 1;
const LEAD_MPS = 7;
/** `sc-ac-truck-spray` paces its student at ~59.9 m of bumper gap. */
const TRUCK_DRILL_GAP_M = 59;

const slabsFor = (v: Parameters<typeof sprayStrength>[0], mps: number, gapM: number) =>
  sprayActiveSlabs(sprayDensity(RAIN, mps, gapM) * sprayStrength(v));

/** A staged actor always publishes `indicator` (types.ts: „Absent on every
 *  ambient agent … staged vehicles always publish it, default \"off\""). */
const stagedCar = { indicator: "off" } as const;
const stagedCarExplicit = { profile: "car", indicator: "off" } as const;
const stagedTruck = { profile: "truck", indicator: "off" } as const;
const ambient = {} as const;

describe("sprayStrength · who throws water", () => {
  it("a staged CAR throws some — this is the whole of the row", () => {
    expect(emitsSpray(stagedCar)).toBe(true);
    expect(sprayStrength(stagedCar)).toBeGreaterThan(0);
    // …and a spec that spells the profile out reaches the same answer, so the
    // repair does not depend on an author having omitted a field.
    expect(sprayStrength(stagedCarExplicit)).toBe(sprayStrength(stagedCar));
  });

  it("AMBIENT traffic still throws nothing — the allocation property", () => {
    // TrafficLayer sizes its spray InstancedMesh from `emitsSpray`; a lesson
    // that stages no cast must still allocate zero instances and mount no
    // mesh, which is what keeps every non-rain, non-staged lesson unchanged.
    expect(emitsSpray(ambient)).toBe(false);
    expect(sprayStrength(ambient)).toBe(0);
    // A parked/ambient van is scenery too — the heavy-profile answer may not
    // leak into vehicles the lesson did not stage.
    expect(sprayStrength({ profile: "cyclist" })).toBe(0);
  });

  it("the HEAVY profiles are bit-identical to shipped: strength exactly 1", () => {
    // Every number in `spraySlabShape`'s measured tables was taken at full
    // density. A strength term that scaled the truck by anything but 1 would
    // silently invalidate the drill those tables were tuned on.
    for (const profile of ["truck", "van", "emergency"] as const) {
      expect(sprayStrength({ profile, indicator: "off" }), profile).toBe(1);
      // …and the heavy profiles do not need the staged marker to qualify.
      expect(sprayStrength({ profile }), profile).toBe(1);
    }
  });
});

describe("the discriminator survives — a car is a haze, a truck is a curtain", () => {
  it("at the truck drill's own pinned gap the truck draws strictly more slabs", () => {
    const car = slabsFor(stagedCar, LEAD_MPS, TRUCK_DRILL_GAP_M);
    const truck = slabsFor(stagedTruck, 18, TRUCK_DRILL_GAP_M);
    expect(car).toBeGreaterThan(0); // he sees water
    expect(truck).toBeGreaterThanOrEqual(car + 2); // and he cannot see past a truck
    expect(truck).toBeLessThanOrEqual(SPRAY_SLABS);
  });

  it("even matched for speed and gap, the car never reaches the truck's curtain", () => {
    // The honest comparison — same storm, same speed, same distance — so the
    // gap between them is the STRENGTH term and not the drill's staging.
    for (const gapM of [15, 30, 45, 60, 80]) {
      const car = slabsFor(stagedCar, 18, gapM);
      const truck = slabsFor(stagedTruck, 18, gapM);
      expect(truck, `gap ${gapM}`).toBeGreaterThan(car);
    }
  });

  it("a car standing in a wet jam throws nothing, and neither does a dry road", () => {
    // Both halves of „or it is a decoration that lies about the weather".
    expect(slabsFor(stagedCar, 0, 20)).toBe(0);
    expect(sprayActiveSlabs(sprayDensity(0, LEAD_MPS, 20) * sprayStrength(stagedCar))).toBe(0);
  });
});

describe("the strength reaches the render loop", () => {
  it("TrafficLayer multiplies it into the density it already computes", () => {
    // Without this line `sprayStrength` is a predicate nothing reads and the
    // lead car is exactly as dry as it was before the repair.
    const layer = readFileSync(resolve(__dirname, "../TrafficLayer.tsx"), "utf8");
    expect(layer).toContain(
      "sprayDensity(rainNow, v.speedMps, eyeGapM) * sprayStrength(v),",
    );
    expect(layer).toContain("sprayStrength,");
  });
});
