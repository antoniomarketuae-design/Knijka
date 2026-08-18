/**
 * TITLE-TRUTH — the ROUNDABOUT shelf (templates-roundabout.ts).
 *
 * `junctions-title-truth.test.ts` states D3 for the JUNCTIONS group: „an
 * objective title may not promise what its gate cannot see", and there the
 * forbidden promise is another road-user's PRIORITY. This file is the same law
 * for the roundabout shelf, with the two promises sweep 161 found being made
 * here:
 *
 *   (a) THE ABSENCE OF A STOP — «без да спираш в кръга». `stepReachZone`
 *       (objectives.ts) is handed one position and one speed per tick and keeps
 *       no record of rests, so it cannot see one. On a FLOW cap the claim
 *       graded backwards on top of that: a car at REST inside the disc clears a
 *       20 km/h cap more easily than one at ring pace, so the act the sentence
 *       forbade helped collect the tick. Measured below, not argued — „a dead
 *       stop in the ring still collects the east gate".
 *   (b) A GAP CHOICE — «Влез в истинската пролука», «изчакай пролука». Which
 *       gap a driver took is a fact about ANOTHER car's position, and a SimTick
 *       carries no other actor (rules/types.ts). The short-gap entry and the
 *       correct one cross (18, 0) on the same arc at the same pace.
 *
 * THESE ASSERTIONS FAIL ON THE TITLES SHIPPED BEFORE THIS WAVE:
 *   sc-rbc-past-east   «Подмини източния изход, БЕЗ ДА СПИРАШ в кръга»
 *   sc-rbg-yield-line  «Спри на линията за пропускане и ИЗЧАКАЙ ПРОЛУКА»
 *   sc-rbg-past-east   «ВЛЕЗ В ИСТИНСКАТА ПРОЛУКА и подмини първия изход»
 * The duties are untouched and still graded — the gap judgment by
 * FAILED_TO_YIELD and COLLISION on sc-rb-busy-gap's own mistake demos, the
 * halt at the give-way line by the 6 km/h cap that survives in full below.
 * Every `params` object is byte-identical to what shipped, which this file
 * pins: no drive that passed yesterday fails today.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. Sweep 161's headline symptom on this
 * shelf („every leg collides, the careful drive scores no better than the
 * reckless one") is not a title defect and is not fixed by this file: the
 * sweep's driver has no steering at all — `tools/mobile/lesson-audit.mjs`
 * actuates `KeyW` and `KeyS` and nothing else — so it drives off the south arm
 * into the central island on every roundabout in the catalogue. The four
 * templates' own end-to-end proofs (s-w1/s-w2/s-w3/s-w4-bot-completion) are
 * what say the drills grade; this file only removes three certificates they
 * were handing out for free.
 */

import { describe, expect, it } from "vitest";
import { makeTick } from "../../__tests__/fixtures";
import { applyTick, createLessonSession } from "../../engine";
import { REACH_ZONE_HALT_CAP_KMH } from "../../objectives";
import type { LessonSpec } from "../../../contracts";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_ROUNDABOUT } from "../templates-roundabout";
import type { ScenarioSpec } from "../types";

const GROUP: readonly ScenarioSpec[] = SCENARIO_TEMPLATES_ROUNDABOUT;

/**
 * A claim that no stop happened. Substring stems on purpose — Cyrillic has no
 * `\b` in a JS regex without the `u` dance, and „спираш"/„спиране" after „без"
 * is unambiguous. It matches the negation ONLY: a title that says «Спри …» is
 * a halt DEMAND, which a cap at or below REACH_ZONE_HALT_CAP_KMH really does
 * express, and is audited by the interlock further down instead.
 */
const NO_STOP_CLAIM = /без\s+(да\s+)?(спираш|спиране|излишно\s+спиране)/i;

/**
 * A claim about the gap between two other cars. „пролука" is the only word in
 * this shelf's vocabulary that names it, and there is no reading of it that a
 * one-ego-tick evaluator can support.
 */
const GAP_CLAIM = /пролук/i;

// ---------------------------------------------------------------------------
// The matchers are not vacuous — pinned against the exact strings that shipped
// ---------------------------------------------------------------------------

describe("the matchers read the shipped-before titles as claims and the replacements as none", () => {
  it("the no-stop matcher", () => {
    expect(NO_STOP_CLAIM.test("Подмини източния изход, без да спираш в кръга")).toBe(true);
    expect(NO_STOP_CLAIM.test("Премини участъка под В27, без спиране")).toBe(true);
    // The replacement, and the halt demand it must not be confused with.
    expect(NO_STOP_CLAIM.test("Подмини източния изход, без да излизаш от кръга")).toBe(false);
    expect(NO_STOP_CLAIM.test("Спри на линията за пропускане преди входа")).toBe(false);
  });

  it("the gap matcher", () => {
    expect(GAP_CLAIM.test("Влез в истинската пролука и подмини първия изход")).toBe(true);
    expect(GAP_CLAIM.test("Спри на линията за пропускане и изчакай пролука")).toBe(true);
    expect(GAP_CLAIM.test("Подмини първия изход (изток), без да излизаш от кръга")).toBe(false);
    expect(GAP_CLAIM.test("Спри на линията за пропускане преди входа")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The law
// ---------------------------------------------------------------------------

describe("a roundabout reachZone title may not certify a stop that never happened", () => {
  for (const scenario of GROUP) {
    for (const objective of scenario.success) {
      if (objective.params.kind !== "reachZone") continue;
      it(`${scenario.id} / ${objective.id}`, () => {
        if (objective.params.kind !== "reachZone") return;
        const p = objective.params;
        expect(
          NO_STOP_CLAIM.test(objective.titleBg),
          `${objective.id}: „${objective.titleBg}" certifies that no stop was made, but its ` +
            `gate is a disc at (${p.x}, ${p.y}) r${p.radiusM}` +
            `${p.maxSpeedKmh === undefined ? "" : ` capped at ${p.maxSpeedKmh} km/h`} — one ` +
            `position and one speed per tick, no history of rests. On a flow cap a car AT REST ` +
            `inside the disc clears it more easily than one at pace, so the sentence grades ` +
            `backwards. Name the mouth and the ring instead.`,
        ).toBe(false);
      });
    }
  }
});

describe("a roundabout reachZone title may not certify which gap was taken", () => {
  for (const scenario of GROUP) {
    for (const objective of scenario.success) {
      if (objective.params.kind !== "reachZone") continue;
      it(`${scenario.id} / ${objective.id}`, () => {
        if (objective.params.kind !== "reachZone") return;
        const p = objective.params;
        expect(
          GAP_CLAIM.test(objective.titleBg),
          `${objective.id}: „${objective.titleBg}" certifies a gap choice, but a SimTick ` +
            `carries no other actor — the disc at (${p.x}, ${p.y}) r${p.radiusM} cannot tell ` +
            `the short-gap entry from the correct one. FAILED_TO_YIELD and COLLISION grade ` +
            `that decision; this gate does not, so it must not say it does.`,
        ).toBe(false);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// The opposite direction: the rewrite moved COPY, and only copy
// ---------------------------------------------------------------------------

describe("the three rewritten rows kept their gates byte-for-byte", () => {
  const shipped: ReadonlyArray<
    readonly [string, string, Record<string, unknown>]
  > = [
    [
      "sc-rb-circulate-priority",
      "sc-rbc-past-east",
      { kind: "reachZone", x: 18, y: 0, radiusM: 6, maxSpeedKmh: 20 },
    ],
    [
      "sc-rb-busy-gap",
      "sc-rbg-yield-line",
      { kind: "reachZone", x: 4.06, y: -26, radiusM: 3, maxSpeedKmh: 6 },
    ],
    [
      "sc-rb-busy-gap",
      "sc-rbg-past-east",
      { kind: "reachZone", x: 18, y: 0, radiusM: 6, maxSpeedKmh: 20 },
    ],
  ];

  for (const [scenarioId, objectiveId, params] of shipped) {
    it(`${scenarioId} / ${objectiveId}`, () => {
      const scenario = GROUP.find((s) => s.id === scenarioId)!;
      const objective = scenario.success.find((o) => o.id === objectiveId)!;
      expect(objective.params).toEqual(params);
    });
  }
});

describe("the one halt claim left standing keeps the cap that expresses it", () => {
  /**
   * «Спри на линията за пропускане преди входа» is the surviving imperative on
   * this shelf, and it earns its place: a 6 km/h cap is at or under
   * REACH_ZONE_HALT_CAP_KMH (8), which is what makes a zone a stop demand and
   * what `scenario/params.ts widenSpeedCap` refuses to widen on any rung. The
   * exemption is the CAP, not the id — raise it above 8 and «Спри» starts
   * accepting a rolling car.
   */
  it("sc-rbg-yield-line", () => {
    const scenario = GROUP.find((s) => s.id === "sc-rb-busy-gap")!;
    const objective = scenario.success.find((o) => o.id === "sc-rbg-yield-line")!;
    expect(objective.titleBg).toContain("Спри");
    expect(objective.params.kind).toBe("reachZone");
    if (objective.params.kind !== "reachZone") return;
    expect(objective.params.maxSpeedKmh).toBeLessThanOrEqual(REACH_ZONE_HALT_CAP_KMH);
  });
});

// ---------------------------------------------------------------------------
// The measurements the rewrite rests on — driven, not argued
// ---------------------------------------------------------------------------

/** The compiled reachZone gate of one objective, after the rung's ladder. */
function gate(
  lesson: LessonSpec,
  objectiveId: string,
): { x: number; y: number; radiusM: number; maxSpeedKmh: number } {
  const o = lesson.objectives.find((x) => x.id === objectiveId)!;
  const p = o.params as { x: number; y: number; radiusM: number; maxSpeedKmh: number };
  return { x: p.x, y: p.y, radiusM: p.radiusM, maxSpeedKmh: p.maxSpeedKmh };
}

const statusOf = (
  s: ReturnType<typeof createLessonSession>,
  objectiveId: string,
): string => s.objectives.find((o) => o.spec.id === objectiveId)!.status;

describe("a dead stop in the ring still collects the east gate", () => {
  /**
   * THE REASON THE „без да спираш" CLAUSE COULD NOT SIMPLY BE MADE TRUE.
   *
   * The drive below is the exact failure sc-rb-circulate-priority exists to
   * teach: enter the empty ring, then STOP DEAD inside it for thirty seconds to
   * „let in" the car standing at the west mouth, then creep on. Nothing in the
   * product bills it — HARSH_BRAKING_NO_CAUSE is structurally unable to fire
   * inside a roundabout (the template's own panic-brake card says so) — and the
   * gate below hands the tick over anyway, because a car at rest satisfies a
   * 20 km/h cap perfectly.
   *
   * Sweep 161's own counts on the same drill: 7 full stops on pc-right, 8 on
   * mobile-right, and not one word about a stop in either debrief.
   */
  it("sc-rb-circulate-priority @L3", () => {
    const spec = GROUP.find((s) => s.id === "sc-rb-circulate-priority")!;
    const lesson = compileScenario(spec, 3);
    const east = gate(lesson, "sc-rbc-past-east");

    let s = createLessonSession(lesson);
    // Frame zero at the real spawn (rbm-spawn-south, 4.06, −93): latches
    // `everOutside` so nothing is conceded for standing still at the start.
    s = applyTick(s, makeTick({ t: 0, position: { x: 4.06, y: -93 }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 6, position: { x: 4.06, y: -40 }, speedKmh: 12 })).state;
    // …and then the mistake: at rest ON the east mouth, held for 30 s.
    s = applyTick(s, makeTick({ t: 20, position: { x: east.x, y: east.y }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 50, position: { x: east.x, y: east.y }, speedKmh: 0 })).state;

    expect(statusOf(s, "sc-rbc-past-east")).toBe("done");
  });
});

describe("the flow cap still refuses the drive it was authored to refuse", () => {
  /**
   * The other direction, and the one that matters more: the remedy was a COPY
   * change, so the gate must still discriminate exactly as it did. A car that
   * sweeps the east mouth without ever coming near the cap — every frame at
   * cap + 25 km/h, which is clear of REACH_ZONE_CAP_SLACK_KMH (5) and of the
   * approach-credit window — collects nothing. Delete the cap to „fix" a
   * missing credit and this test goes red.
   */
  it("sc-rb-circulate-priority @L3", () => {
    const spec = GROUP.find((s) => s.id === "sc-rb-circulate-priority")!;
    const lesson = compileScenario(spec, 3);
    const east = gate(lesson, "sc-rbc-past-east");
    const fast = east.maxSpeedKmh + 25;

    let s = createLessonSession(lesson);
    s = applyTick(s, makeTick({ t: 0, position: { x: 4.06, y: -93 }, speedKmh: fast })).state;
    s = applyTick(s, makeTick({ t: 4, position: { x: 4.06, y: -40 }, speedKmh: fast })).state;
    s = applyTick(s, makeTick({ t: 8, position: { x: east.x, y: east.y }, speedKmh: fast })).state;
    s = applyTick(s, makeTick({ t: 12, position: { x: east.x, y: east.y + 8 }, speedKmh: fast })).state;

    expect(statusOf(s, "sc-rbc-past-east")).not.toBe("done");
  });
});

describe("the give-way halt is real in both directions", () => {
  /**
   * The clause that SURVIVED in sc-rbg-yield-line's title, driven from both
   * sides on the same rung:
   *   · the barge — the template's own note says the demo rides the line at
   *     ~22 km/h — collects nothing;
   *   · the halt at the paint does.
   * Raise the cap over REACH_ZONE_HALT_CAP_KMH and the first half goes red.
   */
  const spec = GROUP.find((s) => s.id === "sc-rb-busy-gap")!;
  const lesson = compileScenario(spec, 3);
  const line = gate(lesson, "sc-rbg-yield-line");

  it("the ~22 km/h barge misses the line outright", () => {
    let s = createLessonSession(lesson);
    s = applyTick(s, makeTick({ t: 0, position: { x: 4.06, y: -93 }, speedKmh: 22 })).state;
    s = applyTick(s, makeTick({ t: 4, position: { x: 4.06, y: -50 }, speedKmh: 22 })).state;
    s = applyTick(s, makeTick({ t: 8, position: { x: line.x, y: line.y }, speedKmh: 22 })).state;
    s = applyTick(s, makeTick({ t: 12, position: { x: line.x, y: line.y + 12 }, speedKmh: 22 })).state;

    expect(statusOf(s, "sc-rbg-yield-line")).not.toBe("done");
  });

  it("the halt on the paint collects it", () => {
    let s = createLessonSession(lesson);
    s = applyTick(s, makeTick({ t: 0, position: { x: 4.06, y: -93 }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 4, position: { x: 4.06, y: -50 }, speedKmh: 14 })).state;
    s = applyTick(s, makeTick({ t: 9, position: { x: line.x, y: line.y }, speedKmh: 0 })).state;

    expect(statusOf(s, "sc-rbg-yield-line")).toBe("done");
  });
});
