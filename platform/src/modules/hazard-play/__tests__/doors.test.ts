/**
 * The doors are a table, and this is the test that keeps them one.
 *
 * The failure this guards against is not a bug, it is a drift: somebody adds a
 * fourth surface, gives it its own branch "just for now", and six weeks later
 * the hazard numbers cannot be pooled because two doors grade differently. The
 * assertions below are deliberately about SHAPE — same keys, same lengths
 * table, admission is the only thing that varies — rather than about values.
 */

import { describe, expect, it } from "vitest";
import { HAZARD_DOORS, isHazardDoor } from "@/components/hazard/types";
import { HAZARD_RUN_LENGTH, hazardDoorRequiresPack } from "../index";

describe("door policy", () => {
  it("only the standalone section needs a pack", () => {
    expect(hazardDoorRequiresPack("section")).toBe(true);
    expect(hazardDoorRequiresPack("simulator")).toBe(false);
    expect(hazardDoorRequiresPack("theory")).toBe(false);
  });

  it("every door has a run length — a missing row would deal an undefined run", () => {
    for (const door of HAZARD_DOORS) {
      expect(HAZARD_RUN_LENGTH[door]).toBeGreaterThan(0);
      expect(Number.isInteger(HAZARD_RUN_LENGTH[door])).toBe(true);
    }
    expect(Object.keys(HAZARD_RUN_LENGTH).sort()).toEqual([...HAZARD_DOORS].sort());
  });

  it("the embedded doors stay shorter than the section — they interrupt something", () => {
    expect(HAZARD_RUN_LENGTH.simulator).toBeLessThan(HAZARD_RUN_LENGTH.section);
    expect(HAZARD_RUN_LENGTH.theory).toBeLessThan(HAZARD_RUN_LENGTH.section);
  });

  it("rejects anything that is not a door — the value arrives from a POST body", () => {
    expect(isHazardDoor("section")).toBe(true);
    for (const value of [null, undefined, 1, "Section", "sim", {}, ["section"]]) {
      expect(isHazardDoor(value)).toBe(false);
    }
  });
});
