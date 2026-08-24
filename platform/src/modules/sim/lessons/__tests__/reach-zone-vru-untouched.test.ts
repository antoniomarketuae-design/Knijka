/**
 * THE WAITED-FOR PERSON WAS NOT RUN OVER — `requireVruUntouched`, the fourth
 * ReachZoneWitnessDemand (objectives.ts, 2026-08-24).
 *
 * THE FRAME THIS FILE IS CUT FROM (sc-hz-emergency-stop:5b697845, proof2
 * mobile-right, TRACKED 98% — the product, not the harness): one debrief that
 * reads «✓ Спри преди детето — с пълна спирачка, в лентата 1:40», «Удар в
 * пешеходец −10 изпитни т. ОПАСНА ГРЕШКА … в 1:48», and «✓ Изчакай детето и
 * продължи до края на отсечката 2:14». The student is told he waited for the
 * child, twenty-six seconds after the car ran her over, in the same document
 * that convicts the strike. `sc-hzes-finish` was a bare disc at (4.06, 220):
 * arrival was the whole certificate.
 *
 * THE CHANNEL WAS ONE PARAMETER AWAY, not absent: the child is a staged
 * encounter, her runner resolves `detail: "collision"` on contact
 * (orchestrator/runners.ts), the shell folds it into the session
 * (`LessonPlayShell.tsx` → `applyStagedOutcome`), and `stepObjective` has
 * been handed those outcomes on every frame since A10. Only the forwarding
 * into `stepReachZone` was missing — the same shape as the lamp-claim closure
 * this suite's sibling documents (`stop-claim-gates.test.ts`, LAMP_CLAIM).
 *
 * BOTH DIRECTIONS ARE ASSERTED off the same tick stream with one context
 * field changed, exactly like `reach-zone-witness.test.ts`: the drive whose
 * own record says the child was struck is REFUSED the tick, and the clean
 * drive, the never-released crawl, and the redeemed re-run are all CREDITED.
 * The single-field flip is the mutation: drop the `vruOk` conjunct (or the
 * ctx forwarding) in `stepReachZone` and the „refused" halves go green.
 */

import { describe, expect, it } from "vitest";
import type { LessonObjective, StagedEventOutcome } from "../../contracts";
import type { SimTick } from "../../rules";
import {
  createEvalState,
  deriveVruWaitDemand,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
  type WitnessedReachZoneParams,
} from "../objectives";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

function parsed(titleBg: string, params: Record<string, unknown>): WitnessedReachZoneParams {
  const objective: LessonObjective = { id: "o1", titleBg, kind: "reachZone", params };
  return parseObjectiveParams(objective) as WitnessedReachZoneParams;
}

/** Run a tick stream through one objective under a fixed session context. */
function run(
  params: ObjectiveParams,
  ticks: SimTick[],
  ctx: ObjectiveContext,
): { done: boolean; atT: number | null; lastProgress: number } {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let lastProgress = 0;
  for (const tick of ticks) {
    const r = stepObjective(params, evalState, tick, ctx);
    evalState = r.evalState;
    lastProgress = r.progress;
    if (r.done) return { done: true, atT: tick.t, lastProgress };
  }
  return { done: false, atT: null, lastProgress };
}

/** A straight northbound drive through the finish disc at (4.06, 220). */
function driveToFinish(): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  for (let y = 195; y <= 228; y += 1) {
    out.push(makeTick({ t, speedKmh: 20, position: { x: 4.06, y } }));
    t += 1;
  }
  return out;
}

function dartOutcome(detail: StagedEventOutcome["detail"], tSec: number): StagedEventOutcome {
  return {
    eventId: "sc-hzes-child",
    kind: "pedestrianDartOut",
    success: detail === "clear" || detail === "yielded",
    detail,
    tSec,
  };
}

function ctxOf(...outcomes: StagedEventOutcome[]): ObjectiveContext {
  return { stagedOutcomes: outcomes, redsMetInRun: 0 };
}

/** The authored gate, parsed exactly as the engine parses it. */
function hzesFinishParams(): WitnessedReachZoneParams {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-hz-emergency-stop")!;
  const o = spec.success.find((x) => x.id === "sc-hzes-finish")!;
  return parseObjectiveParams({
    id: o.id,
    titleBg: o.titleBg,
    kind: "reachZone",
    params: o.params as unknown as Record<string, unknown>,
  }) as WitnessedReachZoneParams;
}

// ---------------------------------------------------------------------------
// 1 · The matcher, both directions — the instrument before the measurement
// ---------------------------------------------------------------------------

describe("the banner's own words decide the demand — «изчакай» + a person on foot", () => {
  it("matches the one shipped claim and none of its ten «изчакай» siblings", () => {
    // The census (2026-08-24): eleven shipped titles carry the imperative;
    // exactly one pairs it with a person on foot. Every string below is the
    // shipped titleBg, so a matcher that quietly widened or narrowed fails
    // here before it can mis-bind a gate in the census test below.
    expect(deriveVruWaitDemand("Изчакай детето и продължи до края на отсечката")).toBe(true);
    expect(deriveVruWaitDemand("Изчакай червения сигнал и премини на зелено")).toBe(false);
    expect(deriveVruWaitDemand("Изчакай червеното пред линията и премини светофара")).toBe(false);
    expect(deriveVruWaitDemand("Спри и изчакай на разширението (под 6 км/ч)")).toBe(false);
    expect(deriveVruWaitDemand("Изчакай зад стоп-линията пред бариерата")).toBe(false);
    expect(deriveVruWaitDemand("Изчакай пътеката да се освободи")).toBe(false);
    expect(deriveVruWaitDemand("Изчакай зад бавната кола, докато насрещните минат")).toBe(false);
    expect(deriveVruWaitDemand("Изчакай зад камиона през целия сляп завой")).toBe(false);
    expect(
      deriveVruWaitDemand("Изчакай колата в съседната лента, вместо да се хвърлиш пред нея"),
    ).toBe(false);
    expect(deriveVruWaitDemand("Изчакай моториста, вместо да се престроиш пред него")).toBe(false);
  });

  it("«Спри преди детето» does NOT match — that certificate was true when issued", () => {
    // On the very frame this fix is cut from, the stop tick at 1:40 preceded
    // the strike at 1:48: the car DID stop before her. Binding the stop gate
    // would refuse a performed manoeuvre, which is the founder's worst failure.
    expect(deriveVruWaitDemand("Спри преди детето — с пълна спирачка, в лентата")).toBe(false);
  });

  it("an authored param OVERRIDES the banner, and a malformed one is loud", () => {
    const p = parsed("Стигни края на отсечката", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 10,
      requireVruUntouched: true,
    });
    expect(p.requireVruUntouched).toBe(true);
    expect(() =>
      parsed("Стигни края на отсечката", {
        kind: "reachZone",
        x: 0,
        y: 0,
        radiusM: 10,
        requireVruUntouched: false,
      }),
    ).toThrow(/requireVruUntouched/);
  });
});

// ---------------------------------------------------------------------------
// 2 · The census — exactly one gate in the whole catalogue acquires the demand
// ---------------------------------------------------------------------------

describe("the catalogue census", () => {
  it("binds sc-hzes-finish and nothing else", () => {
    const bound: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const o of spec.success) {
        const p = o.params as { kind?: string };
        if (p.kind !== "reachZone") continue;
        const out = parseObjectiveParams({
          id: o.id,
          titleBg: o.titleBg,
          kind: "reachZone",
          params: o.params as unknown as Record<string, unknown>,
        }) as WitnessedReachZoneParams;
        if (out.requireVruUntouched === true) bound.push(`${spec.id}/${o.id}`);
      }
    }
    // One row, by name — an over-wide matcher shows up here as a second entry
    // (a demand the dart channel cannot spend would brick that lesson), and a
    // dead matcher shows up as an empty list.
    expect(bound).toEqual(["sc-hz-emergency-stop/sc-hzes-finish"]);
  });
});

// ---------------------------------------------------------------------------
// 3 · The measurement, both directions, on the authored gate
// ---------------------------------------------------------------------------

describe("«Изчакай детето…» is refused on the drive that struck her, and only there", () => {
  const params = hzesFinishParams();

  it("the authored gate carries the demand", () => {
    expect(params.requireVruUntouched).toBe(true);
  });

  it("REFUSED: the run whose own dart record reads collision never ticks", () => {
    // The frame's shape: strike folded in at t=108, arrival at the finish disc
    // afterwards. Old behaviour (no ctx in stepReachZone) ticks on arrival —
    // this is the assertion that fails under the mutation.
    const r = run(params, driveToFinish(), ctxOf(dartOutcome("collision", 108)));
    expect(r.done).toBe(false);
    // The banner is not inert while refused: the place half is acknowledged
    // (progress 0.5), the certificate is what is withheld.
    expect(r.lastProgress).toBe(0.5);
  });

  it("CREDITED: the clean resolution keeps its tick exactly as shipped", () => {
    const clear = run(params, driveToFinish(), ctxOf(dartOutcome("clear", 95)));
    expect(clear.done).toBe(true);
    const yielded = run(params, driveToFinish(), ctxOf(dartOutcome("yielded", 95)));
    expect(yielded.done).toBe(true);
  });

  it("CREDITED: no outcome at all — the never-released crawl is unchanged", () => {
    // A drive below minTriggerSpeedKmh never releases the child; unmeasured
    // must not become a refusal (the notEncountered debrief line owns that
    // case). This is also every certifying RIGHT-mode crawl in the corpus.
    const r = run(params, driveToFinish(), ctxOf());
    expect(r.done).toBe(true);
  });

  it("CREDITED: a later clean encounter redeems the run — self-correction is never punished", () => {
    const r = run(
      params,
      driveToFinish(),
      ctxOf(dartOutcome("collision", 60), dartOutcome("clear", 140)),
    );
    expect(r.done).toBe(true);
  });

  it("the demand does not leak: a claimless gate ticks over the same collision", () => {
    const plain = parsed("Стигни края на отсечката", {
      kind: "reachZone",
      x: 4.06,
      y: 220,
      radiusM: 10,
    });
    expect(plain.requireVruUntouched).toBeUndefined();
    const r = run(plain, driveToFinish(), ctxOf(dartOutcome("collision", 108)));
    expect(r.done).toBe(true);
  });
});
