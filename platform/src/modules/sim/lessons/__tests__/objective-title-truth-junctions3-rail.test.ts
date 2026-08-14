/**
 * TITLE TRUTH — the reachZone gates of the junctions3 + rail families
 * (doc 86 D3: „objective titles promise acts the gates do not measure").
 *
 * Three shipped titles issued a certificate for a YIELD:
 *
 *   sc-jxeq-cross  «Завий наляво, след като пропуснеш и десния, и насрещния»
 *   sc-rxtl-turn   «Завърши левия завой на юг, пропуснал трамвая»
 *   sc-rxti-clear  «Премини покрай острова, пропуснал пресичащия пътник»
 *
 * `stepReachZone(params, prev, tick)` is the whole contract those three ran on:
 * ONE SimTick, which carries speed, position, lane, indicator … and nothing at
 * all about another road user's priority or about whether a yield happened.
 * The claim was therefore unprovable by construction — remedy (B): the titles
 * now say only what the disc measures (the manoeuvre plus the compass arm /
 * the segment), and the duty keeps its grader in the rule engine's own
 * right-hand-rule, N1 left-turn and pedestrian-crossing trackers.
 *
 * Both tests below are CLASS guards rather than pins on the three rows, so the
 * next template cannot reintroduce the same certificate quietly:
 *
 *   1. no reachZone row of either family may use duty vocabulary unless its
 *      params carry a constraint the evaluator actually reads — asserted on the
 *      authored template AND on the compiled objective of every authored rung,
 *      because a constraint the ladder or the parser drops is a false
 *      certificate with extra steps;
 *   2. the proof of WHY, and the half that fails on the old titles: for each of
 *      the three rows, the template's OWN recorded non-yielding drive is
 *      replayed through the production evaluator, the gate is shown completing
 *      anyway, the offence is shown still cited on that mistake — and only then
 *      is the title asserted to be silent about the yield.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ScenarioTrace } from "../../traces/types";
import { createEvalState, parseObjectiveParams, stepObjective } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES_JUNCTIONS3 } from "../scenario/templates-junctions3";
import { SCENARIO_TEMPLATES_RAIL } from "../scenario/templates-rail";
import type { ScenarioSpec } from "../scenario/types";
import type { ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

const FAMILY: readonly ScenarioSpec[] = [
  ...SCENARIO_TEMPLATES_JUNCTIONS3,
  ...SCENARIO_TEMPLATES_RAIL,
];

/**
 * The vocabulary that promises a DUTY — letting someone through, coming to a
 * rest, waiting, holding a distance. A reachZone may use these words only when
 * a param backs them: «спри»/«изчакай»/«готовност да пропуснеш» are honest on a
 * capped zone (the cap IS the demand, and a halt cap is never widened by the
 * ladder); a bare «пропуснал X» on an unconstrained disc is the class this
 * guard exists to catch.
 *
 * Substrings, deliberately — JS `\b` is ASCII-only and would misfire on
 * Cyrillic. None of them collides with the honest nouns in these two families
 * («спирка» does not contain «спри»).
 */
const DUTY_CLAIMS: ReadonlyArray<{ marker: string; claimBg: string }> = [
  { marker: "пропусн", claimBg: "пропускане на друг участник" },
  { marker: "спри", claimBg: "пълно спиране" },
  { marker: "изчакай", claimBg: "изчакване на място" },
  { marker: "дистанц", claimBg: "дистанция до предния" },
];

const dutyClaimIn = (titleBg: string) =>
  DUTY_CLAIMS.find((c) => titleBg.toLowerCase().includes(c.marker));

/**
 * Does anything in these params reach the evaluator as a checkable demand?
 * Today that is the speed cap (`maxSpeedKmh`, incl. the ≤ 8 km/h halt demand).
 * `minLeadGapM` is read defensively through an index so this guard already
 * accepts the following-distance constraint the moment it lands — a new
 * provable field must be ADDED here, never worked around.
 */
function provable(params: ObjectiveParams): boolean {
  if (params.kind !== "reachZone") return false;
  if (params.maxSpeedKmh !== undefined) return true;
  const extra = params as unknown as Record<string, unknown>;
  return typeof extra["minLeadGapM"] === "number";
}

describe("junctions3 + rail: a reachZone title may only claim what a param proves", () => {
  it("no authored success row certifies a duty on an unconstrained disc", () => {
    const offenders: string[] = [];
    for (const spec of FAMILY) {
      for (const o of spec.success) {
        if (o.params.kind !== "reachZone") continue;
        const claim = dutyClaimIn(o.titleBg);
        if (!claim || provable(o.params)) continue;
        offenders.push(
          `${spec.id}/${o.id} — «${o.titleBg}» promises ${claim.claimBg}, ` +
            `params ${JSON.stringify(o.params)} prove nothing of the sort`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("and the constraint still reaches the evaluator on every authored rung", () => {
    const offenders: string[] = [];
    for (const spec of FAMILY) {
      for (const rung of spec.levels) {
        for (const obj of compileScenario(spec, rung.level).objectives) {
          const params = parseObjectiveParams(obj);
          if (params.kind !== "reachZone") continue;
          const claim = dutyClaimIn(obj.titleBg);
          if (!claim || provable(params)) continue;
          offenders.push(
            `${spec.id} L${rung.level} ${obj.id} — «${obj.titleBg}» promises ` +
              `${claim.claimBg}, compiled params ${JSON.stringify(params)} do not`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The proof: the gates ARE duty-blind, in the templates' own recordings
// ---------------------------------------------------------------------------

/** The three rows, each with the recorded drive that FAILED the duty its title
 *  used to certify — the same file the template ships as its ❌ demo. */
const DUTY_BLIND: ReadonlyArray<{
  specId: string;
  objectiveId: string;
  /** basename under content/traces/<specId>/ */
  mistakeTrace: string;
  /** the violation the template itself says that drive grades */
  codeRef: string;
  wasBg: string;
}> = [
  {
    specId: "sc-jx-equal-left",
    objectiveId: "sc-jxeq-cross",
    mistakeTrace: "mistake-cut-right.trace.json",
    codeRef: "FAILED_TO_YIELD",
    wasBg: "Завий наляво, след като пропуснеш и десния, и насрещния",
  },
  {
    specId: "sc-rx-tram-left",
    objectiveId: "sc-rxtl-turn",
    mistakeTrace: "mistake-cut-tram.trace.json",
    codeRef: "FAILED_TO_YIELD",
    wasBg: "Завърши левия завой на юг, пропуснал трамвая",
  },
  {
    specId: "sc-rx-tram-island",
    objectiveId: "sc-rxti-clear",
    mistakeTrace: "mistake-squeeze-past.trace.json",
    codeRef: "PEDESTRIAN_NOT_YIELDED",
    wasBg: "Премини покрай острова, пропуснал пресичащия пътник",
  },
];

function readTrace(specId: string, basename: string): ScenarioTrace {
  const file = join(process.cwd(), "..", "content", "traces", specId, basename);
  return JSON.parse(readFileSync(file, "utf8")) as ScenarioTrace;
}

/** Replay a recorded drive through the SHIPPED evaluator, exactly as a session
 *  would: fresh eval state, one tick per sample, monotonic latches. */
function replay(params: ObjectiveParams, trace: ScenarioTrace): boolean {
  let state = createEvalState(params);
  let done = false;
  for (const s of trace.samples) {
    const r = stepObjective(
      params,
      state,
      makeTick({
        t: s.tSec,
        speedKmh: s.speedKmh,
        position: { x: s.x, y: s.y },
        headingDeg: s.headingDeg,
        gear: s.gear,
        indicator: s.indicator,
      }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

describe("the give-way gates cannot see the give-way (which is why the titles changed)", () => {
  for (const row of DUTY_BLIND) {
    const spec = FAMILY.find((s) => s.id === row.specId)!;

    it(`${row.objectiveId}: the recorded drive that did NOT yield still completes it`, () => {
      const objective = spec.success.find((o) => o.id === row.objectiveId)!;
      expect(objective.params.kind).toBe("reachZone");

      // The template still calls this drive a failure of the very duty the old
      // title certified — that is where the duty is graded now, and it must
      // stay there for the retitle to be honest rather than a quiet amnesty.
      const demo = spec.mistakes.find((m) => m.traceRef.path.endsWith(row.mistakeTrace))!;
      expect(demo, `${row.specId} lost its ${row.mistakeTrace} demo`).toBeDefined();
      expect(demo.codeRefs).toContain(row.codeRef);

      // …and the gate ticks for it all the same. Nothing on a SimTick could
      // have told it otherwise.
      expect(replay(objective.params, readTrace(row.specId, row.mistakeTrace))).toBe(true);
    });

    it(`${row.objectiveId}: therefore its title claims no yield`, () => {
      const objective = spec.success.find((o) => o.id === row.objectiveId)!;
      const claim = dutyClaimIn(objective.titleBg);
      expect(
        claim,
        `«${objective.titleBg}» is back to promising ${claim?.claimBg ?? ""} — ` +
          `the drive above completes this gate without doing it (was: «${row.wasBg}»)`,
      ).toBeUndefined();
    });
  }
});
