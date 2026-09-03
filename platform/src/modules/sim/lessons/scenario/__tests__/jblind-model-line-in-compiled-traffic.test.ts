/**
 * THE MODEL LINE, REPLAYED AT THE DENSITY THE RUNG COMPILES TO.
 *
 * `sc-junction-blind:dea35510` was refuted three times — sweep 161, w17, w18 —
 * and each refutation was true only at `vehicleCount: 0`, a configuration no
 * student has ever played. The reason nothing in the suite could see that is
 * mechanical and was named in `templates-junctions2.ts` (w21, address 3):
 * `recordScriptedDrive` defaults `vehicleCount: 0` and `recordScJunction2Drive`
 * passed none, so §2a of `pk-junctions2-sweep161-truth.test.ts`, the sc-ju2
 * trace gate and every committed ghost certify this lesson's model answer on an
 * EMPTY STREET. This template authors no `traffic`, so it inherits the family
 * baseline (`compile.ts` SCENARIO_FAMILY_TRAFFIC_BASELINE.junction) and every
 * rung a student plays compiles to 4-6 colliding ambient bodies.
 *
 * This file is that missing instrument. It drives the COMMITTED shadow tape —
 * the same one the L1 «Демонстрация — следвай сянката» deck plays — through the
 * production session (`compileScenario` → `createLessonSession` → `applyTick`
 * every frame) at `lesson.traffic.vehicleCount`, over a fixed 20-seed sweep, on
 * every rung.
 *
 * MEASURED HERE, on the tree that carries wave 20's arrival clauses
 * (`traffic/system.ts conflictFromRightFor`: a vehicle that will be past the
 * node by the time he arrives, or that arrives more than RIGHT_ARRIVAL_LATE_SEC
 * after he is clear, is no longer a conflict):
 *
 *   compiled count   L1 n=4: 3/20 · L2 n=4: 3/20 · L3 n=5: 1/20 · L4 n=5: 1/20
 *                    L5 n=6: 0/20        every conviction FAILED_TO_YIELD
 *   the same sweep at vehicleCount 0      0/20 on all five rungs
 *
 * Before those clauses the same sweep convicted the same tape on 10-11 of 20 at
 * L1/L3/L5 (the w21/w22 blocks in `templates-junctions2.ts` carry the runs). So
 * MAX_CONVICTED_SEEDS below is a RATCHET at what the product achieves today: it
 * may be lowered when a repair earns it and must never be raised. A regression
 * in the arrival clauses puts this file back in the 10-11 band and turns it red.
 *
 * AND IT CANNOT BE SATISFIED BY GRADING LESS. The obvious way to make a model
 * line survive is to blunt the predicate that convicts it, so the same sweep
 * runs the two MISTAKE tapes at the same counts and requires them to stay
 * convicted — barge on FAILED_TO_YIELD, no-look on COLLISION. A change that
 * buys the shadow's survival by weakening `conflictFromRightFor` fails here.
 *
 * WHAT THIS DOES NOT CLAIM. A scripted tape cannot react, so the seeds that do
 * convict are cars that genuinely arrive within the engine's own conviction band
 * while the tape releases from its fixed eight-second hold. A student can see
 * them and wait; the tape cannot. That is why the bar is a ratchet and not zero.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { recordScJunction2Drive } from "../../../traces/scJunctions2";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { compileScenario } from "../compile";
import { SC_JUNCTION_BLIND } from "../templates-junctions2";
import type { ScenarioLevel } from "../types";

const REPO = path.resolve(process.cwd(), "..");
const DISTRICT: unknown = JSON.parse(
  readFileSync(path.join(REPO, "content", "world", "tj-occluded-v1.json"), "utf-8"),
) as unknown;

/** The seed sweep w21/w22/w23 measured on, fixed so the numbers are comparable. */
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

/**
 * Today's measurement, per rung. A ratchet: lower it, never raise it.
 *
 * W25 lowered it from 3/3/1/1/0. `worldRuntime` §4b no longer arms the
 * right-hand-rule conviction clock against a conflict that is BORN while the
 * student is already inside the junction core, when he entered it at the yield
 * floor with the way clear — measured on the two seeds that carried it (6 and
 * 7: clear at the y = −17.5 entry, conflict first visible at y = −14.2 / −10.8,
 * billed at y = −10.2 / −6.9, mid-turn). Seed 13 is NOT that shape and still
 * convicts: its car appears 0.7 s after he releases the brake, while he is
 * still outside the core at 5 км/ч and stopping is still available to him.
 */
const MAX_CONVICTED_SEEDS: Record<number, number> = { 1: 1, 2: 1, 3: 0, 4: 0, 5: 0 };

/** The band the same sweep sat in BEFORE wave 20's arrival clauses. A run that
 *  reaches it again is the regression this file exists to catch. */
const PRE_REPAIR_CONVICTED = 10;

const RUNGS = SC_JUNCTION_BLIND.levels.map((l) => l.level as ScenarioLevel);

interface SeedOutcome {
  seed: number;
  violations: string[];
  passed: boolean;
}

/** One drive of a committed tape through the production session. */
function replay(
  level: ScenarioLevel,
  name: Parameters<typeof recordScJunction2Drive>[2],
  seed: number,
  vehicleCount: number,
): SeedOutcome {
  const lesson = compileScenario(SC_JUNCTION_BLIND, level);
  let session = createLessonSession(lesson);
  const drive = recordScJunction2Drive(DISTRICT, "sc-junction-blind", name, {
    seed,
    vehicleCount,
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  return {
    seed,
    violations: drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code as string),
    passed: buildLessonResult(session).passed,
  };
}

/** The count the RUNG compiles to — not the recorder's default 0. */
function compiledVehicleCount(level: ScenarioLevel): number {
  return compileScenario(SC_JUNCTION_BLIND, level).traffic?.vehicleCount ?? 0;
}

describe("the rung a student plays really does compile to a live street", () => {
  it("every rung carries ambient bodies, because the template authors no traffic of its own", () => {
    expect(SC_JUNCTION_BLIND.traffic).toBeUndefined();
    for (const level of RUNGS) {
      expect(compiledVehicleCount(level), `L${level} compiled to an empty street`).toBeGreaterThan(
        0,
      );
    }
  });
});

describe("the committed shadow, driven at the rung's compiled count", () => {
  for (const level of RUNGS) {
    it(`L${level} survives the sweep within the ratchet`, () => {
      const n = compiledVehicleCount(level);
      const convicted = SEEDS.map((seed) => replay(level, "shadow-correct", seed, n)).filter(
        (o) => o.violations.length > 0 || !o.passed,
      );
      const cap = MAX_CONVICTED_SEEDS[level] ?? 0;
      expect(
        convicted.length,
        `L${level} n=${n}: the model line was convicted on ${convicted.length} of ${SEEDS.length} seeds ` +
          `(${convicted.map((o) => `s${o.seed}:${o.violations.join("|") || "nopass"}`).join(", ")}); ` +
          `the ratchet is ${cap}`,
      ).toBeLessThanOrEqual(cap);
      // …and the pre-repair band is named separately, so a wholesale regression
      // reads as one rather than as "the ratchet slipped by one".
      expect(convicted.length).toBeLessThan(PRE_REPAIR_CONVICTED);
      // Whatever does convict is the right-hand-rule charge and nothing else —
      // the tape never leaves the road, never touches anything, never speeds.
      for (const o of convicted) {
        expect(new Set(o.violations), `L${level} s${o.seed}`).toEqual(new Set(["FAILED_TO_YIELD"]));
      }
    });
  }

  // L1/L3/L5 rather than all five: those are the rungs w21-w23 measured, and
  // §2a of `pk-junctions2-sweep161-truth.test.ts` already drives all five at 0
  // on the house seed. This is the SWEEP at 0, which is the part that makes
  // "whatever convicts above is ambient" airtight rather than argued.
  it("…and with the ambient bodies gone the same sweep is clean", () => {
    for (const level of [1, 3, 5] as ScenarioLevel[]) {
      const convicted = SEEDS.map((seed) => replay(level, "shadow-correct", seed, 0)).filter(
        (o) => o.violations.length > 0 || !o.passed,
      );
      expect(
        convicted.map((o) => `L${level} s${o.seed}`),
        "the AUTHORED encounter alone must never convict the model line",
      ).toEqual([]);
    }
  });
});

describe("and the bar cannot be cleared by grading less", () => {
  for (const level of [1, 3, 5] as ScenarioLevel[]) {
    it(`L${level}: the two mistake tapes stay convicted at the same compiled count`, () => {
      const n = compiledVehicleCount(level);
      const barge = replay(level, "mistake-barge", 7, n);
      expect(barge.violations).toContain("FAILED_TO_YIELD");
      expect(barge.passed).toBe(false);

      const noLook = replay(level, "mistake-no-look", 7, n);
      expect(noLook.violations).toContain("COLLISION");
      expect(noLook.passed).toBe(false);
    });
  }
});
