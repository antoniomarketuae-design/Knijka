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
 *
 * ===========================================================================
 * (c) THE ARM — 2026-08-23, THE PROMISE THIS FILE ITSELF WALKED PAST.
 * ===========================================================================
 *
 * The two laws above iterate `scenario.success` and open with
 * `if (objective.params.kind !== "reachZone") continue;`. The row every drill
 * on this shelf ENDS on is a `completeManeuver`, so it was never examined — and
 * it was carrying the loudest claim of the four: «Излез на ТРЕТИЯ изход…»,
 * «…на СЕВЕРНИЯ изход…», «…на ВТОРИЯ изход…».
 *
 * `stepRoundabout` (objectives.ts) is handed one centre and two radii. It
 * measures distance to that centre, |net arc| swept inside `enterRadiusM`, and
 * whether the right stalk was lit in the exit window. A circle names no compass
 * point, so WHICH ARM the car left by is not a fact this row can hold.
 *
 * DRIVEN, THROUGH THE PRODUCTION STACK — the first block at the bottom of this
 * file. A car that enters the south mouth of sc-rb-circulate-priority, rides
 * 90° of ring and leaves at the FIRST (east) exit with its right indicator on
 * collected «Излез на СЕВЕРНИЯ изход с включен десен мигач», zero violations,
 * ИЗДЪРЖАН, 3★, in 23 seconds. It clears ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG (45)
 * twice over, so none of the hardening that row already carries — the reverse
 * guard, the arc floor, the void-on-unsignalled-exit — reaches it.
 *
 * THE REMEDY IS NOT ANOTHER DELETION. The arm moved to a gate that can see one:
 * a disc ON THE RING, `EXIT_APPROACH_LEAD_DEG` before each drill's own exit,
 * inserted BEFORE the maneuver row. The engine steps objectives strictly in
 * order (engine.ts advances one index per completion), so collecting the
 * shelf's existing mouth gate and then this one is a statement about a PATH.
 * The east-exit drive above now leaves that task open and is told which one.
 * The maneuver row keeps grading exactly what it always graded — the passage
 * and the stalk — and now says only that.
 *
 * THREE OF THE FOUR. sc-rb-lane-choice's ring has no room for such a disc and
 * that is arithmetic, not an omission — `NO_ARM_GATE_POSSIBLE` below carries
 * the derivation and re-computes it from the shipped params on every run, so
 * a map with room in it fails this file rather than being forgotten.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeTick } from "../../__tests__/fixtures";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { REACH_ZONE_HALT_CAP_KMH } from "../../objectives";
import type { LessonSpec, StagedEventSpec } from "../../../contracts";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { compileScenario } from "../compile";
import { scoreRubric } from "../rubric";
import { EXIT_APPROACH_RADIUS_M, SCENARIO_TEMPLATES_ROUNDABOUT } from "../templates-roundabout";
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

// ---------------------------------------------------------------------------
// (c) THE ARM — the law, the drive that made it necessary, and the gate's teeth
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

/**
 * A claim about WHICH exit was taken — an ordinal («третия изход») or a compass
 * arm («северния изход»). Both forms are in the shipped-before strings and both
 * are facts about an ARM, which is what `stepRoundabout` has no parameter for.
 *
 * Attributive endings are matched with a stem + `\p{L}*` rather than a fixed
 * suffix: Bulgarian inflects («трети/третия/третият»), and a matcher that only
 * caught one form is exactly the instrument bug this programme has shipped
 * before. Pinned against the four exact strings that shipped, below.
 */
const NAMED_EXIT_CLAIM =
  /(?:първ|втор|трет|четвърт)\p{L}*\s+изход|(?:северн|южн|източн|западн)\p{L}*\s+изход/iu;

describe("the exit matcher reads the shipped-before titles as claims and the replacement as none", () => {
  it("the ordinals and the compass arms", () => {
    expect(NAMED_EXIT_CLAIM.test("Излез на третия изход с включен десен мигач")).toBe(true);
    expect(NAMED_EXIT_CLAIM.test("Излез на северния изход с включен десен мигач")).toBe(true);
    expect(NAMED_EXIT_CLAIM.test("Излез на втория изход с включен десен мигач")).toBe(true);
    // The replacement, and the reachZone titles that legitimately DO name a
    // mouth — they are discs at a place, and a place is what a disc sees. The
    // law below is scoped to `completeManeuver` rows for exactly that reason.
    expect(NAMED_EXIT_CLAIM.test("Премини през кръга и го напусни с включен десен мигач")).toBe(false);
    expect(NAMED_EXIT_CLAIM.test("Стигни по кръга до третия изход (запад)")).toBe(true);
  });
});

describe("a roundabout MANEUVER title may not name which exit was taken", () => {
  for (const scenario of GROUP) {
    for (const objective of scenario.success) {
      if (objective.params.kind !== "completeManeuver") continue;
      if (objective.params.maneuver !== "roundabout") continue;
      it(`${scenario.id} / ${objective.id}`, () => {
        if (objective.params.kind !== "completeManeuver") return;
        if (objective.params.maneuver !== "roundabout") return;
        const p = objective.params;
        expect(
          NAMED_EXIT_CLAIM.test(objective.titleBg),
          `${objective.id}: „${objective.titleBg}" certifies WHICH exit was taken, but ` +
            `stepRoundabout is handed one centre (${p.x}, ${p.y}) and two radii ` +
            `(enter ${p.enterRadiusM} / exit ${p.exitRadiusM}) — it measures distance, net ` +
            `arc and the stalk, and a circle names no arm. The east-exit drive below collects ` +
            `this row in full. Name the arm on a gate that stands on it.`,
        ).toBe(false);
      });
    }
  }
});

/** The east-exit bail-out: south mouth in, 90° of ring, out the FIRST exit with
 *  the right stalk lit — a lawful little drive, and not this drill. */
function eastExitDrive(): DriveScript {
  const X = 4.06;
  const R = 18;
  const ring = (phi: number): [number, number] => {
    const a = (phi * Math.PI) / 180;
    return [R * Math.sin(a), -R * Math.cos(a)];
  };
  const run: Array<[number, number]> = [];
  for (let p = 60; p <= 80; p += 10) run.push(ring(p));
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X, -93], [X, -60]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[X, -60], [X, -40], [X, -27.5]], targetKmh: 18, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [[X, -27.5], [6.0, -23.0], [8.5, -18.5], [11.0, -15.0], ring(48), ring(55)],
        targetKmh: 17,
        stopAtEnd: false,
      },
      { kind: "drive", points: run, targetKmh: 12, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        kind: "drive",
        points: [ring(85), [17.5, -2.5], [20.0, -4.06], [26.0, -4.06], [40.0, -4.06], [58.0, -4.06]],
        targetKmh: 12,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

describe("THE DRIVE THAT RETIRED THE OLD TITLE — leaving at the FIRST exit", () => {
  const spec = GROUP.find((s) => s.id === "sc-rb-circulate-priority")!;
  const lesson = compileScenario(spec, 3);
  let session = createLessonSession(lesson);
  recordScriptedDrive(loadDistrict("rb-mini-v1"), eastExitDrive(), {
    scenarioId: spec.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: [...(spec.staged ?? [])] as StagedEventSpec[],
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  const done = (id: string) => result.objectives.find((o) => o.id === id)?.done;

  it("it is a clean, lawful drive — the drill is refused on the ROUTE, not on a fault", () => {
    // The point of the whole block: nothing here is naughty. No violation, no
    // collision. The student simply took the wrong exit, which is the one thing
    // this drill exists to grade, so it has to be the route list that says so.
    expect(session.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual([]);
  });

  it("it still clears the ring gate it genuinely reached", () => {
    expect(done("sc-rbc-past-east")).toBe(true);
  });

  it("…and is NOT credited with the northern exit (this went red before the gate existed)", () => {
    // BEFORE: objectives were [past-east, exit] and this drive returned
    // completedAll=true, passed=true, score=0, 3★ at 23 s — a full pass for a
    // drive that never went near the north arm.
    expect(done("sc-rbc-exit-approach")).toBe(false);
    expect(result.completedAll).toBe(false);
    expect(scoreRubric(result, spec.rubric!).stars).toBeLessThan(3);
  });

  it("the reason it is refused is the ARM and nothing else — the maneuver row is exit-blind still", () => {
    // Stated as a measurement so a future change upstream cannot make this
    // block pass for a different reason than the one it was written for: the
    // exit-blindness is still there, it is simply no longer the last word.
    // (The maneuver row never activates on this drive — the sequential engine
    // stops at the open gate — which is why it reads as not done here.)
    expect(done("sc-rbc-exit")).toBe(false);
    const maneuver = spec.success.find((o) => o.id === "sc-rbc-exit")!;
    expect(maneuver.params.kind).toBe("completeManeuver");
    if (maneuver.params.kind !== "completeManeuver") return;
    if (maneuver.params.maneuver !== "roundabout") return;
    expect(maneuver.params.x).toBe(0);
    expect(maneuver.params.y).toBe(0);
  });
});

/**
 * THE ONE DRILL THE REMEDY DOES NOT REACH, named rather than skipped.
 *
 * sc-rb-lane-choice rides rb-2lane, whose exit is a lane change onto the OUTER
 * ring lane at r = 30.06 against an `enterRadiusM` of 33. The containment rule
 * below leaves (33 − 30.06) / 1.5 = 1.96 m of authored radius for a disc that
 * would have to sit ON that line — smaller than a car — and any disc drawn far
 * enough inward to satisfy containment is ≥ 3 m off the committed shadow's
 * exit line, which never comes inside r = 30.06. It needs a map with room in
 * it, which no template can author. Listed here so „three of the four" cannot
 * quietly become the standard.
 */
const NO_ARM_GATE_POSSIBLE = ["sc-rb-lane-choice"];

describe("every drill on this shelf names its exit on a gate that stands on the ring", () => {
  it("the exception list is exactly the drills whose ring has no room for one", () => {
    // The arithmetic, not the preference — re-derived from the shipped params
    // so a map or an enterRadiusM with room in it flips this and the exception
    // has to be removed.
    const cramped: string[] = [];
    for (const scenario of GROUP) {
      const maneuver = scenario.success.find(
        (o) => o.params.kind === "completeManeuver" && o.params.maneuver === "roundabout",
      )!;
      if (maneuver.params.kind !== "completeManeuver") continue;
      if (maneuver.params.maneuver !== "roundabout") continue;
      // The radius the drill's own exit line would need a disc to sit on: the
      // outermost ring lane it is driven on. rb-mini is single-lane (18);
      // rb-2lane's exit lane is the outer one (30.06).
      const exitLaneR = scenario.map.districtId === "rb-2lane-v1" ? 30.06 : 18;
      const authorable = (maneuver.params.enterRadiusM - exitLaneR) / 1.5;
      if (authorable < EXIT_APPROACH_RADIUS_M) cramped.push(scenario.id);
    }
    expect(cramped).toEqual(NO_ARM_GATE_POSSIBLE);
  });

  for (const scenario of GROUP) {
    if (NO_ARM_GATE_POSSIBLE.includes(scenario.id)) continue;
    const ids = scenario.success.map((o) => o.id);
    const maneuverIdx = scenario.success.findIndex(
      (o) => o.params.kind === "completeManeuver" && o.params.maneuver === "roundabout",
    );

    it(`${scenario.id} carries an exit-approach gate, and it stands BEFORE the maneuver`, () => {
      expect(maneuverIdx, `${scenario.id}: ${ids.join(", ")}`).toBeGreaterThan(0);
      const approach = scenario.success[maneuverIdx - 1];
      expect(approach.id, `${scenario.id}: ${ids.join(", ")}`).toMatch(/-exit-approach$/);
      expect(NAMED_EXIT_CLAIM.test(approach.titleBg), approach.titleBg).toBe(true);
    });

    /**
     * THE CEILING THE GATE LIVES UNDER, and it is the reason the radius is 5
     * and not a rounder number. `stepRoundabout` latches `entered` from
     * `d <= enterRadiusM`, and the maneuver row is stepped only AFTER this gate
     * completes. A disc a car could satisfy from OUTSIDE that circle hands the
     * maneuver a car already leaving: `entered` never latches, the exit branch
     * never runs, and the drill becomes uncompletable without driving back in.
     * Raise EXIT_APPROACH_RADIUS_M past the slack, or move the gate outward,
     * and this goes red.
     */
    it(`${scenario.id}: the whole acceptance disc lies inside enterRadiusM, on EVERY rung`, () => {
      // ON EVERY RUNG, and that is the half an authored-spec check would have
      // missed: `scenario/params.ts widenRadius` stretches a waypoint by up to
      // REACH_ZONE_GRACE_M at L1/L2, so the ceiling has to hold against the
      // COMPILED number, not the one written above.
      expect(
        (scenario.success[maneuverIdx - 1].params as { radiusM: number }).radiusM,
      ).toBe(EXIT_APPROACH_RADIUS_M);
      for (const rung of scenario.levels) {
        const lesson = compileScenario(scenario, rung.level);
        const approach = lesson.objectives[maneuverIdx - 1];
        const maneuver = lesson.objectives[maneuverIdx];
        const a = approach.params as { x: number; y: number; radiusM: number };
        const m = maneuver.params as { x: number; y: number; enterRadiusM: number };
        const reach = Math.hypot(a.x - m.x, a.y - m.y) + a.radiusM;
        expect(
          reach,
          `${approach.id}@L${rung.level}: the disc reaches ${reach.toFixed(2)} m from the island ` +
            `against an enterRadiusM of ${m.enterRadiusM} — a car that satisfied it out there ` +
            `would hand the maneuver a ring it never entered, and the drill could not be ` +
            `finished without driving back in`,
        ).toBeLessThanOrEqual(m.enterRadiusM);
      }
    });
  }
});

describe("the duty the maneuver title gave up is still said in the student's own words", () => {
  // A fix that removes a sentence and puts nothing back is the failure mode
  // this whole programme is trying to stop. Every drill must still TELL the
  // student which exit is his, in the briefing he reads before he drives.
  for (const scenario of GROUP) {
    it(`${scenario.id}`, () => {
      const spoken = [scenario.objectiveBg, ...scenario.instructionsBg.map((i) => i.textBg)].join(" ");
      expect(NAMED_EXIT_CLAIM.test(spoken), `${scenario.id} no longer names its exit anywhere`).toBe(true);
    });
  }
});
