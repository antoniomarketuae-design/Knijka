/**
 * ScenarioSpec validation — the assembly-line gate must catch every malformed
 * field with an ACTIONABLE message (agent-authored specs run through it
 * unattended; doc 76 §9).
 */
import { describe, expect, it } from "vitest";
import { ScenarioSpecError, assertScenarioSpec, validateScenarioSpec } from "../validate";
import { SC_PARK_PERP_REV } from "../templates";
import type { ScenarioSpec } from "../types";

/** Deep-clone the valid P0 template as a mutation base. */
function clone(): ScenarioSpec {
  return JSON.parse(JSON.stringify(SC_PARK_PERP_REV)) as ScenarioSpec;
}

function errorsOf(mutate: (s: ScenarioSpec) => void): string[] {
  const s = clone();
  mutate(s);
  return validateScenarioSpec(s);
}

describe("validateScenarioSpec", () => {
  it("accepts the P0 template with zero errors", () => {
    expect(validateScenarioSpec(SC_PARK_PERP_REV)).toEqual([]);
  });

  it("assertScenarioSpec throws a ScenarioSpecError listing EVERY problem", () => {
    const s = clone();
    s.id = "PARK";
    s.archetypeIds = [];
    s.teach.lawRef = "член 40";
    try {
      assertScenarioSpec(s);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ScenarioSpecError);
      const err = e as ScenarioSpecError;
      expect(err.errors.length).toBe(3);
      expect(err.message).toContain('id "PARK"');
      expect(err.message).toContain("archetypeIds is REQUIRED");
      expect(err.message).toContain("lawRef");
    }
  });

  it("enforces the sc-<family>-<slug> naming standard", () => {
    expect(errorsOf((s) => (s.id = "park-perp"))[0]).toMatch(/sc-<family>-<slug>/);
    expect(errorsOf((s) => (s.id = "sc-Пark"))[0]).toMatch(/must match/);
  });

  it("rejects unknown doc-72 archetype ids by name", () => {
    const errors = errorsOf((s) => (s.archetypeIds = ["PK-02", "PK-99"]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"PK-99" is not a doc-72 archetype id');
  });

  it("validates conceptIds against a supplied registry (and skips without one)", () => {
    const s = clone();
    s.conceptIds = ["c-reversing", "c-not-a-concept"];
    // Without a registry: reference check skipped, structure still enforced.
    expect(validateScenarioSpec(s)).toEqual([]);
    const errors = validateScenarioSpec(s, { conceptIds: new Set(["c-reversing"]) });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"c-not-a-concept" does not exist');
  });

  it("requires non-empty conceptIds and archetypeIds", () => {
    expect(errorsOf((s) => (s.conceptIds = []))[0]).toContain("conceptIds is REQUIRED");
    expect(errorsOf((s) => (s.archetypeIds = []))[0]).toContain("archetypeIds is REQUIRED");
  });

  it("rejects an unknown map archetype and a non-kebab districtId", () => {
    expect(
      errorsOf((s) => (s.map.archetype = "car-wash" as ScenarioSpec["map"]["archetype"]))[0],
    ).toContain('"car-wash" is not a known generator');
    expect(errorsOf((s) => (s.map.districtId = "Lot Perp!"))[0]).toContain("map.districtId");
  });

  it("start needs exactly one of spawnPointId | position (+ heading with a pose)", () => {
    expect(errorsOf((s) => delete s.start.spawnPointId)[0]).toContain("EXACTLY ONE");
    expect(
      errorsOf((s) => {
        s.start.position = { x: 0, y: 0 };
      })[0],
    ).toContain("EXACTLY ONE");
    const errors = errorsOf((s) => {
      delete s.start.spawnPointId;
      s.start.position = { x: 0, y: 0 }; // no headingDeg
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("requires start.headingDeg");
  });

  it("instructions must be contiguous 1..n Bulgarian steps", () => {
    expect(errorsOf((s) => (s.instructionsBg[2].n = 7))[0]).toContain("must be 3 (contiguous 1..n)");
    expect(errorsOf((s) => (s.instructionsBg[0].textBg = "drive slowly"))[0]).toContain(
      "non-empty Bulgarian text",
    );
    expect(errorsOf((s) => (s.instructionsBg = []))[0]).toContain("at least one numbered step");
  });

  it("success objectives run through the REAL objective parser", () => {
    const errors = errorsOf((s) => {
      const park = s.success[1].params;
      if (park.kind === "completeManeuver" && park.maneuver === "parkInBay") {
        park.bay.widthM = -1; // malformed bay → parseObjectiveParams throws
      }
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('success "sc-ppr-park"');
    expect(errors[0]).toContain("parkInBay needs bay");
  });

  it("rejects duplicate success objective ids", () => {
    expect(errorsOf((s) => (s.success[1].id = s.success[0].id))[0]).toContain(
      'duplicate objective id',
    );
  });

  it("rubric must cross-reference success objectives and order its attempt bands", () => {
    expect(errorsOf((s) => (s.rubric!.placement!.objectiveId = "nope"))[0]).toContain(
      '"nope" is not a success objective id',
    );
    expect(
      errorsOf((s) => {
        s.rubric!.economy = { objectiveId: "sc-ppr-park", attemptsFor3Stars: 3, attemptsFor2Stars: 2 };
      })[0],
    ).toContain("attemptsFor3Stars <= attemptsFor2Stars");
  });

  it("trace refs must be .json paths; pending is the explicit typed marker", () => {
    expect(errorsOf((s) => (s.shadow.path = ""))[0]).toContain("shadow: traceRef.path is required");
    expect(errorsOf((s) => (s.shadow.path = "traces/shadow.bin"))[0]).toContain(
      "must point to a .json trace file",
    );
    expect(errorsOf((s) => (s.mistakes[0].traceRef.path = "")).length).toBe(1);
  });

  it("mistake demos must cite real rules-catalog ViolationCodes", () => {
    const errors = errorsOf((s) => (s.mistakes[0].codeRefs = ["CLIPPED_NEIGHBOR"]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"CLIPPED_NEIGHBOR" is not a rules-catalog ViolationCode');
    expect(errorsOf((s) => (s.mistakes[0].codeRefs = []))[0]).toContain(
      "must name at least one ViolationCode",
    );
  });

  it("teach.lawRef must cite ЗДвП / ППЗДвП / Наредба", () => {
    expect(errorsOf((s) => (s.teach.lawRef = "art. 40"))[0]).toContain("must cite ЗДвП");
    expect(errorsOf((s) => (s.teach.lawRef = "ППЗДвП чл. 31"))).toEqual([]);
  });

  it("levels must be unique, ascending, 1..5, with sane deltas", () => {
    expect(errorsOf((s) => (s.levels[1].level = 1))).toEqual([
      "levels: duplicate L1",
      "levels must be ascending by level (found L1 after L1)",
    ]);
    expect(errorsOf((s) => (s.levels[0].level = 9 as 1))[0]).toContain("must be 1..5");
    expect(errorsOf((s) => (s.levels[0].toleranceScale = 0))[0]).toContain(
      "toleranceScale must be in (0, 3]",
    );
    expect(errorsOf((s) => (s.levels = []))[0]).toContain("at least one LevelSpec");
  });

  it("fog/snow are TAGGABLE (no validation error — the compile gates them)", () => {
    expect(errorsOf((s) => (s.conditions = { weather: "fog" }))).toEqual([]);
    expect(errorsOf((s) => (s.conditions = { weather: "smog" as "fog" }))[0]).toContain(
      "must be dry|rain|fog|snow",
    );
  });

  it("localeBg is pinned to bg-BG (doc 76 §0 — no country packs)", () => {
    expect(errorsOf((s) => (s.localeBg = "en-GB" as "bg-BG"))[0]).toContain('localeBg must be "bg-BG"');
  });
});
