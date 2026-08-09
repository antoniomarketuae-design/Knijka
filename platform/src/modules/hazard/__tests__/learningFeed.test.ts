import { afterEach, describe, expect, it } from "vitest";
import { setHazardBank } from "../bank";
import { HAZARD_SEVERITY_SOFTENING, hazardObservations, recordHazardOutcomes } from "../learningFeed";
import { makeBank, makeItemSource } from "./fixtures";

// PEDESTRIAN_CROSSING_TOO_FAST is опасна → c-crosswalk-yield.
// FOLLOWING_TOO_CLOSE is основна and carries NO conceptId in the catalog.
const bank = makeBank([
  makeItemSource("hz-ped"),
  makeItemSource("hz-gap", {
    violationCode: "FOLLOWING_TOO_CLOSE",
    lawRefEcho: "ЗДвП чл. 23, ал. 1",
  }),
]);

describe("hazardObservations", () => {
  it("grades a missed hazard one severity step softer than the catalog", () => {
    expect(hazardObservations([{ itemId: "hz-ped", verdict: "missed" }], bank)).toEqual([
      { conceptId: "c-crosswalk-yield", kind: "violation", severity: "osnovna" },
    ]);
    expect(HAZARD_SEVERITY_SOFTENING.opasna).toBe("osnovna");
    expect(HAZARD_SEVERITY_SOFTENING.vtorostepenna).toBe("vtorostepenna");
  });

  it("treats a spotted hazard as weak positive evidence", () => {
    expect(
      hazardObservations(
        [
          { itemId: "hz-ped", verdict: "excellent" },
          { itemId: "hz-ped", verdict: "good" },
        ],
        bank,
      ),
    ).toEqual([
      { conceptId: "c-crosswalk-yield", kind: "commendation" },
      { conceptId: "c-crosswalk-yield", kind: "commendation" },
    ]);
  });

  it("stays silent on late, early and voided clips", () => {
    expect(
      hazardObservations(
        [
          { itemId: "hz-ped", verdict: "late" },
          { itemId: "hz-ped", verdict: "early" },
          { itemId: "hz-ped", verdict: "void" },
        ],
        bank,
      ),
    ).toEqual([]);
  });

  it("contributes nothing for a rule with no concept link rather than inventing one", () => {
    expect(hazardObservations([{ itemId: "hz-gap", verdict: "missed" }], bank)).toEqual([]);
  });

  it("ignores an item id the bank does not know", () => {
    expect(hazardObservations([{ itemId: "hz-gone", verdict: "missed" }], bank)).toEqual([]);
  });
});

describe("recordHazardOutcomes", () => {
  afterEach(() => setHazardBank(null));

  it("does not touch the learning module when there is nothing to record", async () => {
    setHazardBank(bank);
    // No observations => no dynamic import, so this resolves without a store.
    await expect(
      recordHazardOutcomes("u1", [{ itemId: "hz-ped", verdict: "late" }]),
    ).resolves.toBeUndefined();
  });
});
