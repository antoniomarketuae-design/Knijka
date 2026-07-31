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
import { resolveScenarioNextStep, resolveScenarioNextSteps } from "../nextStep";
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
  /**
   * FR-06 (founder, 2026-07-29): „we should give users an option continue to
   * next question although you made mistake and come back to this later …
   * currently we are blocking them from advancing."
   *
   * These two used to assert `toBeNull()` — a failed attempt got NO forward
   * button of any kind, so the only way out of a card was to drive it clean.
   * The rule now splits: the next CARD is offered (a different skill at its
   * easiest rung — failing a roundabout does not make a student unready for a
   * zebra), the next RUNG is not (one level harder is earned, and the server
   * refuses a star-locked attempt anyway).
   */
  it("FR-06: a failed attempt still leads to the next CARD, never to the next rung", () => {
    const steps = resolveScenarioNextSteps(
      { templateId: "sc-park-a", level: 1, passed: false, allObjectivesPassed: true },
      CATALOG,
    );
    expect(steps.level).toBeNull();
    expect(steps.template).toMatchObject({ kind: "template", templateId: "sc-park-b", level: 1 });
  });

  it("FR-06: the same when an objective is still red", () => {
    const steps = resolveScenarioNextSteps(
      { templateId: "sc-park-a", level: 1, passed: true, allObjectivesPassed: false },
      CATALOG,
    );
    expect(steps.level).toBeNull();
    expect(steps.template).toMatchObject({ kind: "template", templateId: "sc-park-b", level: 1 });
  });

  it("FR-06: a failed run on the LAST card still offers nothing — honestly", () => {
    // The catalog is exhausted, so there is genuinely nowhere forward. The end
    // screen says so rather than dead-ending on a button that does nothing.
    expect(
      resolveScenarioNextSteps(
        { templateId: "sc-rail-a", level: 4, passed: false, allObjectivesPassed: false },
        CATALOG,
      ),
    ).toEqual({ level: null, template: null });
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

/**
 * The TWO-target view (founder 2026-07-17: „the button for next lesson goes to
 * stage 2 of the same lesson … we also have to add a button that switches to
 * the NEXT LESSON"). The end screen renders one button per non-null target —
 * so which of them is null IS the product behavior under test.
 */
describe("resolveScenarioNextSteps — both targets", () => {
  it("offers the rung AND the next card mid-ladder", () => {
    const steps = resolveScenarioNextSteps(
      { templateId: "sc-park-a", level: 1, ...green },
      CATALOG,
    );
    expect(steps.level).toMatchObject({
      kind: "level",
      templateId: "sc-park-a",
      level: 2,
      lessonId: "sc-park-a@L2",
    });
    // Independent of the rung — „Следващ сценарий" leaves this ladder.
    expect(steps.template).toMatchObject({
      kind: "template",
      templateId: "sc-park-b",
      level: 1,
      lessonId: "sc-park-b@L1",
    });
  });

  it("withholds ONLY the rung when the stars leave it locked (doc 76 §8)", () => {
    // Green but 1★: L2 would be refused server-side (LEVEL_LOCKED) after a
    // full drive, so no „Следващо ниво" button — but L1 of the next card is
    // never gated, so the student still has somewhere to go.
    const steps = resolveScenarioNextSteps(
      { templateId: "sc-park-a", level: 1, passed: true, allObjectivesPassed: true, stars: 1 },
      CATALOG,
    );
    expect(steps.level).toBeNull();
    expect(steps.template).toMatchObject({ templateId: "sc-park-b", level: 1 });
  });

  it("withholds ONLY the rung at the top of the ladder", () => {
    const steps = resolveScenarioNextSteps(
      { templateId: "sc-park-a", level: 4, ...green },
      CATALOG,
    );
    expect(steps.level).toBeNull();
    expect(steps.template).toMatchObject({ templateId: "sc-park-b", level: 1 });
  });

  it("withholds ONLY the card on the last template's lower rungs", () => {
    // The ladder continues, the library does not — one button, no „премина
    // целия каталог" line (the end screen keys that off BOTH being null).
    const steps = resolveScenarioNextSteps(
      { templateId: "sc-rail-a", level: 1, ...green },
      CATALOG,
    );
    expect(steps.level).toMatchObject({ templateId: "sc-rail-a", level: 2 });
    expect(steps.template).toBeNull();
  });

  it("offers nothing at the end of the catalog", () => {
    expect(
      resolveScenarioNextSteps({ templateId: "sc-rail-a", level: 4, ...green }, CATALOG),
    ).toEqual({ level: null, template: null });
  });

  it("offers nothing for a foreign id or an unauthored rung", () => {
    // Not a gate on the STUDENT — a gate on nonsense input. A card that is not
    // in the catalog and a rung that never compiled cannot have been played,
    // so there is no „next" to resolve from either of them.
    const none = { level: null, template: null };
    expect(
      resolveScenarioNextSteps({ templateId: "sc-nope", level: 1, ...green }, CATALOG),
    ).toEqual(none);
    expect(
      resolveScenarioNextSteps({ templateId: "sc-park-a", level: 5, ...green }, CATALOG),
    ).toEqual(none);
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

  it("the single-target view is exactly `level ?? template` everywhere", () => {
    // ONE ordering source: the singular export must stay a view of the plural
    // resolution, never a second walk of the catalog that could drift.
    for (const s of SCENARIO_TEMPLATES) {
      for (const rung of s.levels) {
        for (const stars of [1, 2, 3] as const) {
          const input = { templateId: s.id, level: rung.level, passed: true, allObjectivesPassed: true, stars };
          const steps = resolveScenarioNextSteps(input);
          expect(resolveScenarioNextStep(input)).toEqual(steps.level ?? steps.template);
        }
      }
    }
  });

  it("the next CARD is offered on every green rung, star-locked or not", () => {
    // The star gate must never strand a student: L1 of the successor is
    // ungated, so „Следващ сценарий" survives a 1★ pass on any non-last card.
    const last = SCENARIO_TEMPLATES[SCENARIO_TEMPLATES.length - 1];
    for (const s of SCENARIO_TEMPLATES) {
      if (s.id === last.id) continue;
      for (const rung of s.levels) {
        const steps = resolveScenarioNextSteps({
          templateId: s.id,
          level: rung.level,
          passed: true,
          allObjectivesPassed: true,
          stars: 1,
        });
        expect(steps.level).toBeNull(); // 1★ never opens a rung
        expect(steps.template).not.toBeNull();
      }
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
