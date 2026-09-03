/**
 * THE RUNG CENSUS GATE — founder register B2 („L2 L3 L4 L5 THEY HAVE NOTHING
 * MORE") and B19 („same question 6 just this time L5 — and it has no difference
 * at all"), asked as a number instead of an impression.
 *
 * WHY A CENSUS AND NOT MORE UNIT TESTS. Both rows have been PARTIAL-SEEN
 * through several waves, and every wave answered a question he did not ask:
 * „is L1 different from L3?" (yes — the aids), „does any rung author a
 * complication?" (yes — 347). His question is how many rungs are the SAME DRIVE
 * with a different number on it, and until this file nothing counted that. The
 * three buckets are `lessons/difficulty.ts`'s, and the classifier reads
 * COMPILED lessons — the objects createLessonSession runs — never the authored
 * spec, because a claim in a template has never been evidence here.
 *
 * MEASURED 2026-08-16, all 167 templates, every adjacent authored rung pair:
 *
 *   pair      WORLD   FRAME   NUMBER-ONLY   rung not authored
 *   L1 → L2       1       0           166                   0
 *   L2 → L3      22       0           145                   0
 *   L3 → L4       0     162             0                   5
 *   L4 → L5     142       0        →  3  ←                 22
 *
 * The arrowed cell is B19 verbatim — three L5 rungs whose entire difference
 * from their own L4 was `toleranceScale`. It is 0 after the L5 floor, and the
 * assertions below fail on the tree as it stood before this lane.
 *
 * The other three rows are pinned as RATCHETS, not fixed: L2/L3 are aid-fade
 * rungs no compiler table can fill and L4 is the exam frame, and all three
 * reasons are written out per family in `lessons/difficulty.ts`. Pinning them
 * is what stops the honest statement „the ladder cannot fill these" from
 * quietly becoming „the ladder used to fill these".
 *
 * RE-MEASURED 2026-08-28 (wave 8): the L1 → L2 row is now 0 / 0 / 167 / 0. The
 * ONE world step that row ever had was `sc-junction-scan`'s, and the raise is
 * argued at the assertion itself — see „THE RATCHET WAS RAISED" below, which is
 * the only place in this file a pinned number has ever gone up.
 */

import { describe, expect, it } from "vitest";
import {
  L5_PLUS_ONE_CAR_ONLY,
  MIN_PERCEPTIBLE_VEHICLE_RISE,
  SCENARIO_FAMILY_LADDER_VERDICT,
  classifyRungStep,
  isSubPerceptibleTrafficStep,
  type RungStepKind,
} from "../difficulty";
import { compileScenario, l5LadderFloorApplies } from "../scenario/compile";
import { L5_LADDER_FLOOR_CONDITIONS, l5Night } from "../scenario/complications";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { SCENARIO_FAMILIES, type ScenarioLevel, type ScenarioSpec } from "../scenario/types";

const PAIRS: ReadonlyArray<readonly [ScenarioLevel, ScenarioLevel]> = [
  [2, 1],
  [3, 2],
  [4, 3],
  [5, 4],
];

/** One census row. The four bucket keys are exactly `RungStepKind`, so the
 *  tally below indexes by the classifier's own verdict and cannot drift from
 *  it — a fifth bucket would fail to compile here rather than go uncounted. */
type Row = Record<RungStepKind, number> & {
  /** Templates that do not author both rungs of the pair. */
  missing: number;
};

function census(): Map<string, Row> {
  const rows = new Map<string, Row>();
  for (const [hi, lo] of PAIRS) {
    rows.set(`L${lo}->L${hi}`, { world: 0, frame: 0, number: 0, none: 0, missing: 0 });
  }
  for (const spec of SCENARIO_TEMPLATES) {
    const authored = new Set(spec.levels.map((l) => l.level));
    for (const [hi, lo] of PAIRS) {
      const row = rows.get(`L${lo}->L${hi}`)!;
      if (!authored.has(hi) || !authored.has(lo)) {
        row.missing += 1;
        continue;
      }
      row[classifyRungStep(spec, hi, lo).kind] += 1;
    }
  }
  return rows;
}

/** The three B19 templates, by id, so the failure names them rather than a count. */
const B19_TEMPLATES = ["sc-park-parallel", "sc-maneuver-3point", "sc-rx-barrier-drop"];

// ---------------------------------------------------------------------------
// 1. B19 — no L5 may be the rung below plus a number
// ---------------------------------------------------------------------------

describe("no L5 is its own L4 with a different number on it (B19)", () => {
  it("every authored L5 changes the WORLD, not just a tolerance", () => {
    const numbersOnly: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const authored = new Set(spec.levels.map((l) => l.level));
      if (!authored.has(5) || !authored.has(4)) continue;
      const step = classifyRungStep(spec, 5, 4);
      if (step.kind === "number" || step.kind === "none") {
        numbersOnly.push(`${spec.id}@L5 differs from its L4 only in [${step.number.join(", ") || "nothing"}]`);
      }
    }
    expect(
      numbersOnly,
      `${numbersOnly.length} L5 rung(s) are the rung below plus a number:\n${numbersOnly.join("\n")}`,
    ).toEqual([]);
  });

  it("the three rungs the founder's row is about now compile a night drive", () => {
    for (const id of B19_TEMPLATES) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === id)!;
      expect(spec, id).toBeTruthy();
      const l5 = compileScenario(spec, 5);
      expect(l5.environment?.timeOfDay, `${id}@L5`).toBe("night");
      // …and the rung below is untouched: the floor is an L5 rule, and a
      // complication that leaked one rung down would be the „L5 arrives early"
      // defect s-l5-variants.test.ts guards on the authored wave.
      expect(compileScenario(spec, 4).environment?.timeOfDay, `${id}@L4`).toBeUndefined();
    }
  });

  it("the lamp duty is stated where it becomes gradeable", () => {
    // The floor sets night, and night arms a headlights duty. The L10 predicate
    // (world/referents.ts) reads briefingBg, so the sentence has to be THERE —
    // this is the same rule level-complication.test.ts enforces catalog-wide,
    // re-checked here because this lane is the one that adds dark rungs.
    for (const id of B19_TEMPLATES) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === id)!;
      const brief = compileScenario(spec, 5).briefingBg ?? [];
      expect(brief.some((s) => /светлин|фаров/i.test(s.textBg)), `${id}@L5`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The floor fires narrowly, and adds nothing an author could not have written
// ---------------------------------------------------------------------------

describe("the L5 floor never overrules an author", () => {
  it("fires on exactly the rungs whose measured delta was empty", () => {
    const fired = SCENARIO_TEMPLATES.filter((s) => l5LadderFloorApplies(s, 5)).map((s) => s.id);
    expect(fired.sort()).toEqual([...B19_TEMPLATES].sort());
  });

  it("never fires below L5", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      for (const level of [1, 2, 3, 4] as const) {
        expect(l5LadderFloorApplies(spec, level), `${spec.id}@L${level}`).toBe(false);
      }
    }
  });

  /**
   * THE EQUIVALENCE THAT MAKES THE FLOOR SAFE: the lesson it compiles is
   * byte-identical to the one the template would have produced by writing
   * `conditions: { night: true }` on that rung itself. Nothing hidden rides
   * along — no tightened gate, no extra actor, no second dial — so the floor
   * cannot make a drill harder to FINISH (doc 86 B3/B5), only darker.
   */
  it("compiles exactly what `conditions: { night: true }` on the rung would have", () => {
    for (const id of B19_TEMPLATES) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === id)!;
      const authored = JSON.parse(JSON.stringify(spec)) as ScenarioSpec;
      const rung = authored.levels.find((l) => l.level === 5)!;
      rung.conditions = { ...(rung.conditions ?? {}), night: true };
      expect(l5LadderFloorApplies(authored, 5), `${id}: author spoke, floor must stand down`).toBe(false);
      expect(compileScenario(spec, 5)).toEqual(compileScenario(authored, 5));
    }
  });

  it("stands down the moment the rung adds anything of its own", () => {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-rx-barrier-drop")!;
    const withCar = JSON.parse(JSON.stringify(spec)) as ScenarioSpec;
    withCar.levels.find((l) => l.level === 5)!.traffic = { vehicleCount: 3 };
    expect(l5LadderFloorApplies(withCar, 5)).toBe(false);
    expect(compileScenario(withCar, 5).environment).toBeUndefined();
  });

  it("uses the same conditions the hand-authored night recipe does — one truth", () => {
    expect(L5_LADDER_FLOOR_CONDITIONS).toEqual(l5Night().conditions);
  });
});

// ---------------------------------------------------------------------------
// 3. The census itself — the ratchets, including the rungs no ladder can fill
// ---------------------------------------------------------------------------

describe("the census, held", () => {
  it("L4 → L5: every authored rung changes the world, and 22 templates author none", () => {
    const row = census().get("L4->L5")!;
    // 142 → 145 is the L5 floor; `missing` is the 22 templates that stop at L4
    // (or, for the five reels clip drills, at L3) — listed per family with the
    // reason in SCENARIO_FAMILY_LADDER_VERDICT.
    expect(row.number + row.none, "an L5 that is L4 plus a number").toBe(0);
    expect(row.world).toBeGreaterThanOrEqual(145);
    expect(row.missing).toBeLessThanOrEqual(22);
  });

  it("L3 → L4 is the exam FRAME on every template that authors it — stated, not fixed", () => {
    const row = census().get("L3->L4")!;
    // Uniform by design: cold start + the exam flag (19 also tighten a rubric).
    // Deepening it from the ladder was measured and rejected — see the header of
    // lessons/difficulty.ts. This assertion exists so that verdict cannot rot
    // into „it used to add something and we lost it".
    expect(row.frame).toBeGreaterThanOrEqual(162);
    expect(row.number + row.none, "an exam rung that changes nothing at all").toBe(0);
    expect(row.missing).toBeLessThanOrEqual(5); // the templates-reels.ts clip drills
  });

  it("L1 → L2 and L2 → L3 are the aid-fade rungs — the ratchet may only improve", () => {
    const c = census();
    // The honest numbers, and the reason they are what they are is written out
    // in SCENARIO_FAMILY_LADDER_VERDICT: these two rungs' content is the
    // scaffolding coming off, and every mechanism that could ADD there needs a
    // map the compiler cannot see. `toBeLessThanOrEqual` is the ratchet — a
    // future lane that gives L2 something real makes this number fall.
    //
    // ── THE RATCHET WAS RAISED, 166 → 167, 2026-08-28 (integrator, wave 8) ──
    //
    // WHO AND WHAT. The lane that repaired `sc-junction-scan`
    // (templates-junctions.ts, rows sc-junction-scan:e6834882 / :28e782ab and
    // the ambient row named below) deleted that template's authored
    // `traffic: { vehicleCount: 4 }`, handing the drill to the junction family
    // baseline. That is the whole of the change, and it is the ONLY template
    // this row ever counted as a world step: the census now reads
    // `{ number: 167 }` with an EMPTY not-number list, so 167 is every
    // template that authors both rungs, and no other row moved.
    //
    // WHY IT IS NOT A REGRESSION — the step that was lost was not perceptible,
    // by this file's own standard. Compiled through DEFAULT_LEVEL_TRAFFIC_SCALE
    // (0.5 / 0.75 / 1 / 1 / 1.5), the authored 4 laddered to 2 / 3 / 4 / 4 / 6,
    // so the L1 → L2 "world" step this ratchet was counting as content was
    // `traffic 2->3` — a rise of ONE car. `MIN_PERCEPTIBLE_VEHICLE_RISE` is 2,
    // and the describe block below asserts that `traffic 5->6` IS
    // sub-perceptible. The census was crediting at L1 → L2 exactly the step it
    // refuses to credit at L4 → L5. 166 was never 166 real rungs.
    //
    // WHY THE CHANGE WAS WORTH ITS COST — the L1 the step was bought with was
    // BELOW the family floor. `rungTraffic` (scenario/compile.ts) never clamps
    // an AUTHORED count, so the key opted this drill out of
    // SCENARIO_FAMILY_TRAFFIC_FLOOR — "the count below which the drill's own
    // SUBJECT disappears" — on a lesson whose subject IS the car you did not
    // see. `traffic/__tests__/ambient-presence.test.ts` names this template in
    // its scope note as a real open row measuring cross 13 % / 1 pass per
    // minute at L1, below its own MIN_PASSAGES_PER_MIN of 2, and excluded only
    // because it hand-authored a count. It no longer does: that suite now
    // COLLECTS `sc-junction-scan@L1: the crossing arm is not dead` (on tj-scan-v1
    // since `sc-junction-scan:28e782ab`) and it passes (verified 2026-08-28, 24
    // passed). Compiled traffic is now 4 / 4 / 5 / 5 / 6 — byte-identical to
    // `sc-junction-stop`, which was its sibling on the same district and spawn
    // until that row gave this drill its own Б2 T.
    //
    // WHAT IT COST, NOT HIDDEN: L4 → L5 for this template went 4→6 to 5→6, so
    // it joins `L5_PLUS_ONE_CAR_ONLY` beside the sibling that was already on
    // that list for the same reason. That list is the named residual and the
    // describe block below is what stops it growing quietly.
    //
    // THIS RAISE IS NOT A PRECEDENT. It is allowed because the step that
    // disappeared was measurably imperceptible and the rung underneath it was
    // measurably dead. A raise without both halves shown is a loosened gate.
    expect(c.get("L1->L2")!.number + c.get("L1->L2")!.none).toBeLessThanOrEqual(167);
    expect(c.get("L2->L3")!.number + c.get("L2->L3")!.none).toBeLessThanOrEqual(145);
    // Nothing is missing at the bottom of the ladder: every template authors
    // L1, L2 and L3, so a low rung can never be „absent" instead of thin.
    expect(c.get("L1->L2")!.missing).toBe(0);
    expect(c.get("L2->L3")!.missing).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. The residual, named — so it cannot grow quietly
// ---------------------------------------------------------------------------

describe("the L5 rungs whose whole addition is one ambient car", () => {
  it("is exactly the documented list", () => {
    const found: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const authored = new Set(spec.levels.map((l) => l.level));
      if (!authored.has(5) || !authored.has(4)) continue;
      if (isSubPerceptibleTrafficStep(classifyRungStep(spec, 5, 4))) found.push(spec.id);
    }
    expect(found.sort(), "an L5 gained or lost a sub-perceptible rung").toEqual(
      [...L5_PLUS_ONE_CAR_ONLY].sort(),
    );
  });

  it("the threshold is the one the ceiling sweep can separate", () => {
    expect(MIN_PERCEPTIBLE_VEHICLE_RISE).toBe(2);
    expect(isSubPerceptibleTrafficStep({ kind: "world", world: ["traffic 5->6"], frame: [], number: [] })).toBe(true);
    expect(isSubPerceptibleTrafficStep({ kind: "world", world: ["traffic 4->6"], frame: [], number: [] })).toBe(false);
    // A rise that comes WITH something else is not the case this names — the
    // student has the other thing to perceive.
    expect(
      isSubPerceptibleTrafficStep({ kind: "world", world: ["traffic 5->6", "env +timeOfDay"], frame: [], number: [] }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. The per-family verdict must match the compiler, or it is just prose
// ---------------------------------------------------------------------------

describe("SCENARIO_FAMILY_LADDER_VERDICT", () => {
  it("names every family exactly once", () => {
    expect(Object.keys(SCENARIO_FAMILY_LADDER_VERDICT).sort()).toEqual([...SCENARIO_FAMILIES].sort());
  });

  it("its withoutL5 list is what the catalog actually authors", () => {
    const actual = new Map<string, string[]>();
    for (const spec of SCENARIO_TEMPLATES) {
      const list = actual.get(spec.family) ?? [];
      if (!spec.levels.some((l) => l.level === 5)) list.push(spec.id);
      actual.set(spec.family, list);
    }
    for (const family of SCENARIO_FAMILIES) {
      expect([...(actual.get(family) ?? [])].sort(), `${family}: the verdict has gone stale`).toEqual(
        [...SCENARIO_FAMILY_LADDER_VERDICT[family].withoutL5].sort(),
      );
    }
  });

  it("every verdict states a reason, not a placeholder", () => {
    for (const family of SCENARIO_FAMILIES) {
      expect(SCENARIO_FAMILY_LADDER_VERDICT[family].why.length, family).toBeGreaterThan(60);
    }
  });
});
