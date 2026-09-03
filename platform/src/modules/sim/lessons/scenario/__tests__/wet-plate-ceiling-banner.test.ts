/**
 * `sc-sp-wet-limit-plate:d9fd3821` (critical) — «ЗАДЪРЖАЛ ТАВАНА» IS A CLAIM
 * ABOUT A STRETCH, AND THE GATE NOW MAKES IT.
 *
 * THE FILED PROTOCOL, `w13/frames/sc-sp-wet-limit-plate__pc-wrong`:
 *
 *   Задачи   ✓ Стигни края на отсечката, задържал тавана от настилката
 *   Грешки   ✗ Превишена скорост — измерено 58,9 км/ч при ограничение 50 км/ч
 *            verdict ИЗДЪРЖАН
 *
 * `sc-swp-finish` was a bare disc. `requireLawfulSpeed` (derived from «тавана»
 * since b211041) answers «законен ли си ТУК» and structurally cannot answer
 * «задържа ли го дотук» — a speed is read at the tick's own position, never over
 * a segment — so at HEAD the drill's OWN committed ❌ demonstrations still
 * collected the certificate: `mistake-over-limit-in-wet` holds 56,9 км/ч for
 * ~230 m of a 320 m street and brakes to rest on the disc, and
 * `mistake-dry-speed-in-wet` runs 49,9 км/ч in the rain — lawful by the sign,
 * over what the surface leaves, which is the exact mistake the plate exists to
 * teach. `requireSpeedClean` is the stretch-shaped half.
 *
 * WHAT THIS FILE HOLDS, in the order the repair can regress:
 *   1. the key SURVIVES `compileScenario` — the whitelist in `scenario/params.ts`
 *      is where two earlier witness terms died as dead predicates, and this one
 *      did too until that line was written;
 *   2. a CORRECT drive is never refused, at any of the five rungs;
 *   3. the two ❌ drives lose the certificate, at any of the five rungs;
 *   4. …and the drive still ENDS, so the student reaches the protocol that
 *      teaches him instead of having to quit (`speedFaultVoidsObjective`);
 *   5. the refusal is never his first news of the fault — the same session
 *      carries the conviction, scored or coached (THEO-4);
 *   6. no OTHER gate in the catalogue acquires the term (it is authored-only);
 *   7. the wet rungs are driven, which is the row's second, separately-open
 *      half: «no leg of levels 3–5 has ever been driven».
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScSpWetLimitPlateDrive } from "../../../traces/scSpWetLimitPlate";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { parseObjectiveParams, type WitnessedReachZoneParams } from "../../objectives";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_SP_WET_LIMIT_PLATE } from "../templates-speed2";
import type { ScenarioLevel } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const DISTRICT: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "sp-rain-v1.json"), "utf-8"),
) as unknown;

const RUNGS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

type Demo = Parameters<typeof recordScSpWetLimitPlateDrive>[1];

/** One demo driven through the FULL production pipeline at one rung. */
function drive(name: Demo, level: ScenarioLevel) {
  let session = createLessonSession(compileScenario(SC_SP_WET_LIMIT_PLATE, level));
  recordScSpWetLimitPlateDrive(DISTRICT, name, {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  const finish = result.objectives.find((o) => o.id === "sc-swp-finish")!;
  return {
    phase: session.phase,
    finishDone: finish.done,
    passed: result.passed,
    scoredCodes: session.events
      .filter((e): e is Extract<typeof e, { kind: "violation" }> => e.kind === "violation")
      .map((e) => e.code as string),
    coachedCodes: (session.coachedMistakes ?? []).map((m) => m.code),
  };
}

const CEILING_CODES = ["SPEEDING_OVER_LIMIT", "SPEEDING_DANGEROUS", "SPEED_TOO_FAST_FOR_CONDITIONS"];

describe("sc-sp-wet-limit-plate — the finish banner may not certify a ceiling the sheet says was blown", () => {
  it("1. the demand survives compileScenario at every rung (the dead-predicate line)", () => {
    for (const level of RUNGS) {
      const lesson = compileScenario(SC_SP_WET_LIMIT_PLATE, level);
      const finish = lesson.objectives.find((o) => o.id === "sc-swp-finish")!;
      const parsed = parseObjectiveParams(finish) as WitnessedReachZoneParams;
      expect(parsed.requireSpeedClean, `L${level} compiled`).toBe(true);
      // The at-mark half stays beside it — the two are the frame-shaped and the
      // stretch-shaped reading of one banner, and neither replaces the other.
      expect(parsed.requireLawfulSpeed, `L${level} at-mark half`).toBe(true);
    }
  });

  it("2. the correct drive keeps its certificate at every rung — a repair may not refuse a lawful drive", () => {
    for (const level of RUNGS) {
      const r = drive("shadow-correct", level);
      expect(r.finishDone, `L${level} shadow finish`).toBe(true);
      expect(r.passed, `L${level} shadow passed`).toBe(true);
      expect(r.scoredCodes, `L${level} shadow clean`).toEqual([]);
      expect(r.coachedCodes, `L${level} shadow uncoached`).toEqual([]);
    }
  });

  it("3. the dry speed under the wet plate no longer collects «задържал тавана»", () => {
    // 49,9 км/ч in the rain: lawful by the В26, over what the surface leaves.
    // The gate that grades the SIGN is honestly silent here, which is why the
    // banner needed the second reading.
    for (const level of RUNGS) {
      const r = drive("mistake-dry-speed-in-wet", level);
      expect(r.finishDone, `L${level} finish refused`).toBe(false);
      expect(
        [...r.scoredCodes, ...r.coachedCodes],
        `L${level} conviction on the sheet`,
      ).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    }
  });

  it("3b. the over-limit drive in the rain no longer collects it either", () => {
    for (const level of RUNGS) {
      const r = drive("mistake-over-limit-in-wet", level);
      expect(r.finishDone, `L${level} finish refused`).toBe(false);
      expect([...r.scoredCodes, ...r.coachedCodes], `L${level} conviction`).toContain(
        "SPEEDING_OVER_LIMIT",
      );
    }
  });

  it("4. …and the refused drive still ENDS, so the protocol is reachable without quitting", () => {
    // `speedFaultVoidsObjective`: `sc-swp-finish` is 2 of 2, so without the
    // strand-cutting arm the repair would have swapped a false certificate for a
    // drive that cannot end — `yieldFailedVoidsObjective`'s recorded lesson.
    for (const name of ["mistake-dry-speed-in-wet", "mistake-over-limit-in-wet"] as const) {
      for (const level of RUNGS) {
        const r = drive(name, level);
        expect(r.phase, `${name} L${level} ends by itself`).toBe("completed");
        expect(r.passed, `${name} L${level} finished-and-failed`).toBe(false);
      }
    }
  });

  it("5. the refusal is never the student's first news of the fault (THEO-4)", () => {
    // A withheld tick may only ever REMOVE a contradiction from a protocol that
    // already explains itself. Both codes ship `explanationBg`, `correctiveBg`
    // and a ЗДвП citation in rules/catalog.ts (чл. 21, ал. 1 / чл. 20, ал. 2);
    // what this asserts is that one of them is on the sheet the student reads,
    // on every refused rung, in one channel or the other.
    for (const name of ["mistake-dry-speed-in-wet", "mistake-over-limit-in-wet"] as const) {
      for (const level of RUNGS) {
        const r = drive(name, level);
        const spoken = [...r.scoredCodes, ...r.coachedCodes];
        expect(
          spoken.some((c) => CEILING_CODES.includes(c)),
          `${name} L${level} spoken to the student`,
        ).toBe(true);
      }
    }
  });

  it("6. it is authored-only: exactly one gate in the whole catalogue carries it", () => {
    // The /таван/ census `requireLawfulSpeed` published returns EIGHT gates
    // across eight drills. A title fallthrough would have handed a
    // certificate-voiding term to seven templates nobody measured, so the key is
    // written where it is meant and this row is what keeps it that way.
    const carriers: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      // Only the rungs the template authors — not every drill ships five.
      for (const { level } of spec.levels) {
        for (const objective of compileScenario(spec, level).objectives) {
          const p = parseObjectiveParams(objective) as WitnessedReachZoneParams;
          if (p.requireSpeedClean === true) carriers.push(`${spec.id}/${objective.id}`);
        }
      }
    }
    expect([...new Set(carriers)]).toEqual(["sc-sp-wet-limit-plate/sc-swp-finish"]);
  });

  it("7. the WET rungs are driven, not assumed: L3–L5 run rain + wetGrip and grade the plate", () => {
    // The row's second, separately-open half — „no leg of levels 3-5 has ever
    // been driven, so whether the WET rungs grade correctly is unmeasured".
    // Every assertion above already sweeps all five; this one names the contrast
    // the template exists for, so a rung silently losing its weather fails here.
    for (const level of [1, 2] as const) {
      const l = compileScenario(SC_SP_WET_LIMIT_PLATE, level);
      expect(l.physics, `L${level} dry`).toBeUndefined();
      expect(l.environment?.rain, `L${level} dry`).not.toBe(true);
    }
    for (const level of [3, 4, 5] as const) {
      const l = compileScenario(SC_SP_WET_LIMIT_PLATE, level);
      expect(l.physics, `L${level} wet`).toEqual({ wetGrip: true });
      expect(l.environment?.rain, `L${level} wet`).toBe(true);
      // …and the wet ceiling actually grades on that rung: the 49,9 км/ч drive
      // is convicted under чл. 20, ал. 2 while the В26 stays silent.
      const r = drive("mistake-dry-speed-in-wet", level);
      const spoken = [...r.scoredCodes, ...r.coachedCodes];
      expect(spoken, `L${level} conditions code`).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
      expect(spoken, `L${level} sign silent`).not.toContain("SPEEDING_OVER_LIMIT");
    }
    expect(compileScenario(SC_SP_WET_LIMIT_PLATE, 5).environment?.timeOfDay).toBe("night");
  });
});
