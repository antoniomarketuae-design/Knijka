/**
 * B58 — THE PRINTED GATE LABEL MAY NOT EXCEED THE SIGN.
 *
 * The gate bar drawn across the lane is not a debug read-out: it carries an
 * instruction in the instructor's voice — «Карай дотук / не по-бързо от N
 * км/ч» — and the founder found it reading **57 on a street posted 50**, inside
 * «Превишаване над +10 км/ч», the one drill whose whole subject is that 51–60
 * км/ч in a 50 zone is a scored fault. „A student who obeys the number the
 * world shows him commits the mistake the world is grading."
 *
 * Half of that number was the difficulty ladder and is fixed at source
 * (`scenario/params.ts`; pinned by `b58-gate-never-over-posted.test.ts`). The
 * other half is authored: **113 compiled gates across 20 templates carry a cap
 * their own street's limit does not allow** (55 on a 50, 92 on a 90, 33 on a
 * 30, 52 on a 50). Those numbers are GRADING slack — a beginner's speedometer,
 * the rule engine's own `speedingGraceMaxKmh` — and re-authoring 113 graded
 * gates plus their committed traces is a decision, not a bug fix. What is not
 * defensible is printing them. So the gate keeps grading what it graded, and
 * the sentence on the glass is clamped to the law.
 *
 * This file pins that clamp and the geometry lookup under it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { capLineBg, postedLimitAt } from "./RouteGuidance";
import {
  SCENARIO_TEMPLATES,
  compileScenario,
  shownObjectiveCapKmh,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
import { callSitesOf } from "./lesson-ui/__tests__/callSiteShape";
import type { GuidancePointGoal } from "@/modules/sim/scene/guidanceRoute";

const goal = (over: Partial<GuidancePointGoal> = {}): GuidancePointGoal => ({
  kind: "point",
  x: 4.06,
  y: 200,
  marker: true,
  affordance: "through",
  shape: { kind: "gate", halfWidthM: 4, dirX: 0, dirY: 1 },
  acceptRadiusM: 6,
  labelBg: "Карай дотук",
  ...over,
});

/** ov-keepright-v1's shape: one 360 m northbound edge on x = 0, posted 50. */
const oneStreet = {
  roads: {
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 0, y: 360 },
    ],
    edges: [
      {
        id: "ov-kr-road",
        from: "a",
        to: "b",
        oneway: false,
        maxspeed: 50,
        geometry: [
          [0, 0],
          [0, 360],
        ] as [number, number][],
      },
    ],
  },
};

/** A 50 → 30 transition street: two edges end to end, different limits. */
const transition = {
  roads: {
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 0, y: 200 },
      { id: "c", x: 0, y: 400 },
    ],
    edges: [
      {
        id: "fast",
        from: "a",
        to: "b",
        oneway: false,
        maxspeed: 50,
        geometry: [
          [0, 0],
          [0, 200],
        ] as [number, number][],
      },
      {
        id: "slow",
        from: "b",
        to: "c",
        oneway: false,
        maxspeed: 30,
        geometry: [
          [0, 200],
          [0, 400],
        ] as [number, number][],
      },
    ],
  },
};

describe("B58 — the gate label is clamped to the posted limit", () => {
  it("HIS FRAME: a 52 cap on a street posted 50 prints 50, never 52 and never 57", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 52 }), 50)).toBe("не по-бързо от 50 км/ч");
    expect(capLineBg(goal({ maxSpeedKmh: 57 }), 50)).toBe("не по-бързо от 50 км/ч");
  });

  it("a cap already under the sign prints itself — the clamp only ever removes a lie", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 20 }), 50)).toBe("не по-бързо от 20 км/ч");
    expect(capLineBg(goal({ maxSpeedKmh: 45 }), 50)).toBe("не по-бързо от 45 км/ч");
  });

  it("a HALT demand is never clamped — «спри» must not become a speed limit", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 5, affordance: "halt" }), 50)).toBe("спри — под 5 км/ч");
  });

  it("no posted limit in hand ⇒ byte-identical to the shipped label", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 57 }))).toBe("не по-бързо от 57 км/ч");
    expect(capLineBg(goal({}))).toBe("");
  });

  it("reads the limit off the nearest carriageway edge", () => {
    expect(postedLimitAt(oneStreet, 4.06, 200)).toBe(50);
    expect(postedLimitAt(oneStreet, -30, 12)).toBe(50);
  });

  it("a 50→30 transition clamps each gate to the zone it stands in, not the map's headline", () => {
    expect(postedLimitAt(transition, 4.06, 100)).toBe(50);
    expect(postedLimitAt(transition, 4.06, 330)).toBe(30);
    expect(capLineBg(goal({ maxSpeedKmh: 33 }), postedLimitAt(transition, 4.06, 330))).toBe(
      "не по-бързо от 30 км/ч",
    );
  });

  it("a district that declares no limit leaves the label exactly as authored", () => {
    const noLimit = {
      roads: {
        nodes: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 0, y: 100 },
        ],
        edges: [
          {
            id: "e",
            from: "a",
            to: "b",
            oneway: false,
            geometry: [
              [0, 0],
              [0, 100],
            ] as [number, number][],
          },
        ],
      },
    };
    expect(postedLimitAt(noLimit, 0, 50)).toBeUndefined();
    expect(capLineBg(goal({ maxSpeedKmh: 57 }), postedLimitAt(noLimit, 0, 50))).toBe(
      "не по-бързо от 57 км/ч",
    );
  });
});

/**
 * =============================================================================
 * O51, ONE SURFACE FURTHER IN — THE PLAQUE MAY NOT PRINT ABOVE THE SENTENCE.
 * `sc-follow-tailgater:06c4a8be`, w10-3, round 11.
 * =============================================================================
 *
 * THE FRAME, opened before anything was changed.
 * `.audit-frames/w10-3/frames/sc-follow-tailgater__pc-right/04-t087s.png` holds
 * all three numbers at once:
 *
 *   in-world plaque   «Карай дотук · не по-бързо от 41 км/ч»
 *   task chip         «дръж под 36 км/ч»
 *   cockpit strip     «задачата иска ≤36»
 *
 * One objective — `sc-ftg-ease`, «Успокой темпото», authored
 * `reachZone(maxSpeedKmh: 36)` in `templates-following.ts`. The 41 is the L1
 * rung's grace (`scenario/params.ts widenSpeedCap`), i.e. the GATE. B58 taught
 * this plaque not to exceed the SIGN; O51 reconciled the card, the toast and
 * the strip on the advisor's spoken figure. The plaque was the one surface
 * left holding the raw gate.
 *
 * WHY THIS CANNOT REFUSE A CORRECT DRIVE — the only reason it may ship. The
 * clamp is `Math.min` against a number the advisor has ALREADY spoken, and
 * `spokenCapKmh` itself ends on a `Math.min` with the compiled cap. So the
 * plaque only ever comes DOWN, the gate still accepts 41, and a student who
 * obeys the world is inside the number that grades him. The catalogue case
 * below drives all 953 capped rungs and asserts that direction rather than
 * asserting it here in prose.
 */
describe("O51 — the world plaque prints the figure the student was told", () => {
  it("HIS FRAME: gate 41, sentence 36 ⇒ the plaque reads 36", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 41 }), 50, 36)).toBe("не по-бързо от 36 км/ч");
  });

  it("the clamp only ever REMOVES — a sentence above the gate cannot loosen it", () => {
    // `spokenCapKmh` cannot produce this today (it ends on a min with the gate),
    // but a caller that got it wrong must not be able to print a number the
    // grader will bill. 41 stands.
    expect(capLineBg(goal({ maxSpeedKmh: 41 }), 50, 55)).toBe("не по-бързо от 41 км/ч");
  });

  it("the sign still wins when it is the strictest of the three", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 57 }), 50, 55)).toBe("не по-бързо от 50 км/ч");
  });

  it("a HALT demand is untouched — «спри» is not a speed the advisor can undercut", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 5, affordance: "halt" }), 50, 3)).toBe(
      "спри — под 5 км/ч",
    );
  });

  it("no sentence in hand ⇒ byte-identical to the shipped label", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 57 }), 50)).toBe("не по-бързо от 50 км/ч");
    expect(capLineBg(goal({ maxSpeedKmh: 57 }))).toBe("не по-бързо от 57 км/ч");
    expect(capLineBg(goal({ maxSpeedKmh: 41 }), undefined, undefined)).toBe(
      "не по-бързо от 41 км/ч",
    );
  });

  /**
   * THE GENERAL FORM. A rule with one enforced instance is a convention, and
   * this one has 953 instances. Driven, not quoted: every capped rung of the
   * shipped catalogue is compiled, the advisor's resolution is taken through
   * the SAME public function the component calls, and the plaque is asked what
   * it would print.
   */
  it("across the whole catalogue the plaque never exceeds the sentence — and the class is not empty", () => {
    let capped = 0;
    let split = 0;
    let tailgaterEase: { gate: number; shown: number } | null = null;
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const gate = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (gate === undefined) continue;
          capped += 1;
          const shown = shownObjectiveCapKmh(o, gate, lesson.postedLimitKmh);
          // The direction: the sentence is never above the gate, so the clamp
          // can never refuse a drive the gate would have accepted.
          expect(shown).toBeLessThanOrEqual(gate);
          if (shown < gate) split += 1;
          expect(capLineBg(goal({ maxSpeedKmh: gate }), undefined, shown)).toBe(
            `не по-бързо от ${Math.round(shown)} км/ч`,
          );
          if (lesson.id === "sc-follow-tailgater@L1" && o.id === "sc-ftg-ease") {
            tailgaterEase = { gate, shown };
          }
        }
      }
    }
    // Not vacuous: a clamp that never fires is a comment, and the census in
    // `advisor.ts` put this class at 212 of 953.
    expect(capped).toBeGreaterThan(900);
    expect(split).toBeGreaterThan(100);
    // And the row's own rung, so a catalogue edit that quietly re-authors the
    // 36 fails here rather than on someone's screen.
    expect(tailgaterEase).toEqual({ gate: 41, shown: 36 });
  });

  /**
   * DOES ANYTHING RENDER IT. Six predicates shipped this week, gated, read by
   * nothing. Both plates are read as CALL TREES — a substring match would be
   * satisfied by `shownAtGoal && undefined`, which type-checks and blanks the
   * clamp on all 953 rungs.
   */
  it("both plates in RouteGuidance are actually built with the sentence", () => {
    const src = readFileSync(resolve(__dirname, "./RouteGuidance.tsx"), "utf8");
    const plates = callSitesOf(src, ["makeLabelTexture"]).filter(
      (c) => c.args[0] === "pointGoal",
    );
    expect(plates.map((c) => c.args)).toEqual([
      ["pointGoal", "postedAtGoal", "true", "shownAtGoal"],
      ["pointGoal", "postedAtGoal", "false", "shownAtGoal"],
    ]);
    // …and the gate that decides whether the second plate is built at all asks
    // the same question with the same three arguments, or the two plates can
    // disagree about whether there is a cap line.
    const guards = callSitesOf(src, ["capLineBg"]).filter((c) => c.args[0] === "pointGoal");
    expect(guards.map((c) => c.args)).toEqual([["pointGoal", "postedAtGoal", "shownAtGoal"]]);
    // The resolver is the module's own, not a local re-derivation of the grace.
    expect(callSitesOf(src, ["shownObjectiveCapKmh"]).map((c) => c.args)).toEqual([
      ["spec", "pointGoal.maxSpeedKmh", "lesson.postedLimitKmh"],
    ]);
  });
});
