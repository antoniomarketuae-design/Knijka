/**
 * „Следващ сценарий" resolver (nextStep.ts).
 *
 * The structural cases run against a SYNTHETIC catalog: the real library is
 * an assembly line (templates land continuously), so pinning ids/indices here
 * would make this suite other agents' problem. The real catalog is covered by
 * INVARIANTS instead — properties that must hold whatever lands next.
 */

import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import { resolveScenarioNextStep } from "../nextStep";
import type { ScenarioFamily, ScenarioLevel, ScenarioSpec } from "../types";

/** A spec stub — the resolver reads id/family/titleBg/levels only. */
function spec(id: string, family: ScenarioFamily, levels: ScenarioLevel[]): ScenarioSpec {
  return {
    id,
    family,
    titleBg: `Заглавие ${id}`,
    levels: levels.map((level) => ({ level })),
  } as unknown as ScenarioSpec;
}

// parking ×2 → pedestrians ×1 → rail ×1: a family block, a rollover and an end.
const CATALOG: readonly ScenarioSpec[] = [
  spec("sc-park-a", "parking", [1, 2, 3, 4]),
  spec("sc-park-b", "parking", [1, 2, 3, 4, 5]),
  spec("sc-zebra-a", "pedestrians", [1, 2, 3, 4]),
  spec("sc-rail-a", "rail", [1, 2, 3, 4]),
];

const green = { passed: true, allObjectivesPassed: true, stars: 3 as const };

describe("resolveScenarioNextStep — the ladder", () => {
  it("steps mid-ladder: same template, next authored level", () => {
    const next = resolveScenarioNextStep(
      { templateId: "sc-park-a", level: 1, ...green },
      CATALOG,
    );
    expect(next).toMatchObject({
      kind: "level",
      templateId: "sc-park-a",
      level: 2,
      lessonId: "sc-park-a@L2",
      sameFamily: true,
    });
  });

  it("steps L3 → L4 (the exam rung is just the next rung)", () => {
    expect(
      resolveScenarioNextStep({ templateId: "sc-park-a", level: 3, ...green }, CATALOG),
    ).toMatchObject({ kind: "level", level: 4, lessonId: "sc-park-a@L4" });
  });

  it("L4 → L5 when the template authors a fifth rung", () => {
    expect(
      resolveScenarioNextStep({ templateId: "sc-park-b", level: 4, ...green }, CATALOG),
    ).toMatchObject({ kind: "level", templateId: "sc-park-b", level: 5 });
  });

  it("top of the ladder → the next template in catalog order, lowest rung", () => {
    // sc-park-a tops out at L4 → the next CARD, not the next family.
    const next = resolveScenarioNextStep(
      { templateId: "sc-park-a", level: 4, ...green },
      CATALOG,
    );
    expect(next).toMatchObject({
      kind: "template",
      templateId: "sc-park-b",
      level: 1,
      lessonId: "sc-park-b@L1",
      sameFamily: true, // the family block has not ended yet
    });
  });

  it("rolls into the next family when the family block ends", () => {
    // sc-park-b is the last parking card and tops out at L5.
    const next = resolveScenarioNextStep(
      { templateId: "sc-park-b", level: 5, ...green },
      CATALOG,
    );
    expect(next).toMatchObject({
      kind: "template",
      templateId: "sc-zebra-a",
      level: 1,
      family: "pedestrians",
      sameFamily: false,
    });
  });

  it("returns null at the very end of the catalog", () => {
    expect(
      resolveScenarioNextStep({ templateId: "sc-rail-a", level: 4, ...green }, CATALOG),
    ).toBeNull();
  });
});

describe("resolveScenarioNextStep — the gates", () => {
  it("offers nothing when the attempt did not pass", () => {
    expect(
      resolveScenarioNextStep(
        { templateId: "sc-park-a", level: 1, passed: false, allObjectivesPassed: true },
        CATALOG,
      ),
    ).toBeNull();
  });

  it("offers nothing when an objective is still red", () => {
    expect(
      resolveScenarioNextStep(
        { templateId: "sc-park-a", level: 1, passed: true, allObjectivesPassed: false },
        CATALOG,
      ),
    ).toBeNull();
  });

  it("skips a star-locked level step (doc 76 §8) rather than dead-ending on LEVEL_LOCKED", () => {
    // Green but 1★ → L2 stays locked server-side; the cascade falls through
    // to the next card's L1, which is never gated.
    const next = resolveScenarioNextStep(
      { templateId: "sc-park-a", level: 1, passed: true, allObjectivesPassed: true, stars: 1 },
      CATALOG,
    );
    expect(next).toMatchObject({ kind: "template", templateId: "sc-park-b", level: 1 });
  });

  it("takes the level step at exactly the unlock threshold (2★)", () => {
    expect(
      resolveScenarioNextStep(
        { templateId: "sc-park-a", level: 1, passed: true, allObjectivesPassed: true, stars: 2 },
        CATALOG,
      ),
    ).toMatchObject({ kind: "level", level: 2 });
  });

  it("allows the level step when stars are unknown (server stays the authority)", () => {
    expect(
      resolveScenarioNextStep(
        { templateId: "sc-park-a", level: 1, passed: true, allObjectivesPassed: true },
        CATALOG,
      ),
    ).toMatchObject({ kind: "level", level: 2 });
  });

  it("returns null for a foreign template or an unauthored rung", () => {
    expect(
      resolveScenarioNextStep({ templateId: "sc-nope", level: 1, ...green }, CATALOG),
    ).toBeNull();
    expect(
      resolveScenarioNextStep({ templateId: "sc-park-a", level: 5, ...green }, CATALOG),
    ).toBeNull();
  });
});

describe("resolveScenarioNextStep — invariants over the real catalog", () => {
  const top = (s: ScenarioSpec) => Math.max(...s.levels.map((l) => l.level)) as ScenarioLevel;
  const low = (s: ScenarioSpec) => Math.min(...s.levels.map((l) => l.level)) as ScenarioLevel;

  it("walks the whole library and ends exactly once, on the last card", () => {
    const last = SCENARIO_TEMPLATES[SCENARIO_TEMPLATES.length - 1];
    for (const s of SCENARIO_TEMPLATES) {
      const next = resolveScenarioNextStep({ templateId: s.id, level: top(s), ...green });
      if (s.id === last.id) expect(next).toBeNull();
      else expect(next).not.toBeNull();
    }
  });

  it("a topped-out card hands over to its array successor's lowest rung", () => {
    for (let i = 0; i < SCENARIO_TEMPLATES.length - 1; i += 1) {
      const s = SCENARIO_TEMPLATES[i];
      const successor = SCENARIO_TEMPLATES[i + 1];
      expect(
        resolveScenarioNextStep({ templateId: s.id, level: top(s), ...green }),
      ).toMatchObject({
        kind: "template",
        templateId: successor.id,
        level: low(successor),
      });
    }
  });

  it("every resolved rung is one the compiler actually authors", () => {
    const byId = new Map(SCENARIO_TEMPLATES.map((s) => [s.id, s]));
    for (const s of SCENARIO_TEMPLATES) {
      for (const rung of s.levels) {
        const next = resolveScenarioNextStep({ templateId: s.id, level: rung.level, ...green });
        if (next === null) continue;
        const target = byId.get(next.templateId);
        expect(target).toBeDefined();
        expect(target?.levels.some((l) => l.level === next.level)).toBe(true);
        expect(next.lessonId).toBe(`${next.templateId}@L${next.level}`);
      }
    }
  });
});
