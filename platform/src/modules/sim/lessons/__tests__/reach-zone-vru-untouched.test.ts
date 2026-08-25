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
import type { LessonObjective, LessonSpec, StagedEventOutcome } from "../../contracts";
import type { SimTick } from "../../rules";
import { applyStagedOutcome, applyTick, createLessonSession } from "../engine";
import {
  createEvalState,
  deriveVruWaitDemand,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
  type WitnessedReachZoneParams,
} from "../objectives";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState, ObjectiveEvalState, ObjectiveParams } from "../types";
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

  /**
   * ⚠ THE DART CHANNEL ALONE, AND THAT QUALIFIER IS THE WHOLE TEST (2026-08-25).
   *
   * This case used to be called „a later clean encounter redeems the run —
   * self-correction is never punished", and asserted as a statement about
   * DRIVES. It is not one. It hand-builds an `ObjectiveContext` with the staged
   * channel only; in a real drive the two channels fire together — the runner
   * resolves the dart while `rules/engine.ts` bills the contact and stamps
   * `detail: "pedestrian"` — so `struckAPersonInRun` latches on the same frame
   * and the re-latch below can never be reached. Measured through `applyTick`
   * in §4's „a later clean dart does NOT redeem a struck person".
   *
   * So the re-latch is pinned for what it is: the behaviour of ONE channel,
   * which still owns every outcome that carries no graded contact. The file
   * used to assert this and §4's refusal as though both described production.
   * One of the two had to stop; this is the one that was over-claiming.
   */
  it("the DART record alone re-latches on a later clean encounter", () => {
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

// ---------------------------------------------------------------------------
// 4 · THE ARM THE DART RECORD COULD NOT REACH — a struck person, round 10
// ---------------------------------------------------------------------------

/**
 * THE FRAME: `w10-1/frames/sc-hz-emergency-stop/pc-right/08-debrief-p4.png` and
 * its `_audit-debrief.json`, on the 376-drive steered sweep at ae4a499 — i.e.
 * WITH everything above already shipped. «✓ Изчакай детето и продължи до края на
 * отсечката 2:24», in a protocol whose one fault is «Удар в пешеходец −10
 * изпитни т. ОПАСНА ГРЕШКА» and whose own citation reads „Тази грешка спира
 * самия изпит … при допускане на ПТП" (Наредба № 38, чл. 48, ал. 3).
 *
 * WHY THE GATE ABOVE LET IT THROUGH, and it is the arm §3 asserts as a CREDIT:
 * „no outcome at all — the never-released crawl is unchanged". The dart is
 * released only at ~30 m out AND at least `minTriggerSpeedKmh` (25 for
 * `SC_HZ_EMERGENCY_STOP_DART`); a drive that never reaches that speed never
 * arms the encounter, so `stagedOutcomes` holds nothing of this kind — while
 * the child is standing on the kerb where the car then reaches her. „The
 * encounter did not happen" and „she was hit before it could" arrive at that
 * loop as the same state, and they are opposite answers.
 *
 * So the CONTACT is consulted too, from the other grader: `tick.events` carries
 * `{kind:"collision", withWhat}`, `rules/engine.ts` bills it per struck body,
 * and `lessons/engine.ts` folds „did this drive ever strike a person" into the
 * context. The tests below are ENGINE-LEVEL on purpose — the whole lesson of
 * this programme is that a gate nothing routes to is not a repair, so they
 * drive `applyTick`, the entry point `LessonPlayShell` itself calls.
 */

describe("a struck person refuses the wait certificate, whatever the dart record says", () => {
  const waitLesson: LessonSpec = {
    id: "t-vru-wait",
    order: 99,
    titleBg: "Тест изчакване",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 4.06, y: 195 }, headingDeg: 0 },
    preDrive: false,
    objectives: [
      {
        id: "t-wait",
        titleBg: "Изчакай детето и продължи до края на отсечката",
        kind: "reachZone",
        params: { x: 4.06, y: 220, radiusM: 10 },
      },
    ],
  };

  /** Drive the finish disc through the real engine, optionally striking a body
   *  on the first frame — before the disc, exactly as the frame's order was. */
  function driveThroughEngine(
    lesson: LessonSpec,
    struck?: "pedestrian" | "cyclist" | "vehicle",
  ): LessonSessionState {
    let s = createLessonSession(lesson);
    let first = true;
    for (const frame of driveToFinish()) {
      const withStrike =
        first && struck !== undefined
          ? makeTick({ ...frame, events: [{ kind: "collision", withWhat: struck }] })
          : frame;
      first = false;
      s = applyTick(s, withStrike).state;
    }
    return s;
  }

  it("POSITIVE CONTROL: the clean drive still completes end-to-end", () => {
    // Without this the refusals below would be asserting that a broken harness
    // never ticks anything — the shape of false pass this file already refuses
    // once, in its own census test.
    expect(driveThroughEngine(waitLesson).objectives[0].status).toBe("done");
  });

  it("REFUSED: the child is struck and no dart ever resolved — the w10-1 frame", () => {
    const s = driveThroughEngine(waitLesson, "pedestrian");
    expect(s.objectives[0].status).toBe("active");
    // The strike really was graded, so the refusal rests on a fault the same
    // debrief prints rather than on a silent state.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
  });

  it("REFUSED: a cyclist counts — the same unarmoured body, чл. 42 / чл. 119", () => {
    expect(driveThroughEngine(waitLesson, "cyclist").objectives[0].status).toBe("active");
  });

  it("CREDITED: a struck VEHICLE says nothing about letting a person through", () => {
    // The demand may not become „any contact fails any wait gate": a car-to-car
    // impact is the rule engine's to grade and it is graded — but this banner
    // is a claim about a person, and widening it would refuse a drive for a
    // fault the certificate never spoke about.
    const s = driveThroughEngine(waitLesson, "vehicle");
    expect(s.objectives[0].status).toBe("done");
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
  });

  it("the demand still does not leak: a claimless gate ticks over the same strike", () => {
    const plainLesson: LessonSpec = {
      ...waitLesson,
      objectives: [
        {
          id: "t-plain",
          titleBg: "Стигни края на отсечката",
          kind: "reachZone",
          params: { x: 4.06, y: 220, radiusM: 10 },
        },
      ],
    };
    expect(driveThroughEngine(plainLesson, "pedestrian").objectives[0].status).toBe("done");
  });

  it("a later clean dart does NOT redeem a struck person — §3's re-latch is one channel", () => {
    // §3 pins the staged channel's re-latch and says in its own header that it
    // is a statement about that channel and not about drives. This is the
    // drive, through `applyTick`: both channels fire, and the contact wins.
    let s = createLessonSession(waitLesson);
    let first = true;
    for (const frame of driveToFinish()) {
      const withStrike = first
        ? makeTick({ ...frame, events: [{ kind: "collision", withWhat: "pedestrian" }] })
        : frame;
      if (first) {
        s = applyTick(s, withStrike).state;
        // …and the runner resolves the very next encounter cleanly, which is
        // the exact input §3 credits.
        s = applyStagedOutcome(s, dartOutcome("clear", 5));
        first = false;
        continue;
      }
      s = applyTick(s, frame).state;
    }
    expect(s.objectives[0].status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// 5 · A REFUSAL MAY NOT DOUBLE AS A TRAP — the drive still has to END
// ---------------------------------------------------------------------------

/**
 * THE COST OF §4, FOUND BY THE ADVERSARIAL PASS AND FIXED HERE (2026-08-25).
 *
 * `struckAPersonInRun` is session-monotone, so a `requireVruUntouched` gate that
 * has seen a strike can never complete — and on `sc-hz-emergency-stop` that gate
 * (`sc-hzes-finish`) is the LAST of three. A chain that cannot advance never
 * reaches `currentIndex >= objectives.length`, the run-out is never armed, and
 * the session never leaves `phase: "driving"`. Measured before the fix, same
 * tick stream, one collision the only difference: CLEAN → `completed`, STRUCK →
 * still `driving` sixty ticks later.
 *
 * That is worse than the defect §4 closes. The −10 «Удар в пешеходец» card, its
 * чл. 48, ал. 3 citation and its corrective are the entire teaching payload of
 * that lesson, and they live in the DEBRIEF — reachable only when the session
 * ends. A student who ran the child over would have had to quit to see why,
 * and quitting sets `aborted`, which costs the attempt its XP and its
 * calibration.
 *
 * So `lessons/engine.ts` lets gate 1 (the stalled-chain finish, finish.ts
 * `routeFinishZone`) arm on the terminal objective when — and only when — that
 * objective is unearnable for the rest of the run. The reason it is normally
 * withheld there is that a correct final approach would satisfy it; when no
 * correct approach exists any more, that reason is gone and this is precisely
 * the case gate 1 was built for. NOTHING IS GRADED BY IT: the objective keeps
 * its honest `active` status below, so the certificate is still refused and
 * `buildLessonResult` still reports finished-and-failed. Only the strand goes.
 *
 * Two objectives, because `routeFinishZone` returns null for a route with fewer
 * than two — one waypoint is not a route.
 */
describe("the refused drive still reaches its own debrief", () => {
  const twoStopLesson: LessonSpec = {
    id: "t-vru-wait-2",
    order: 99,
    titleBg: "Тест изчакване с две задачи",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 4.06, y: 175 }, headingDeg: 0 },
    preDrive: false,
    objectives: [
      {
        id: "t-first",
        titleBg: "Стигни първия ориентир",
        kind: "reachZone",
        params: { x: 4.06, y: 190, radiusM: 8 },
      },
      {
        id: "t-wait",
        titleBg: "Изчакай детето и продължи до края на отсечката",
        kind: "reachZone",
        params: { x: 4.06, y: 220, radiusM: 10 },
      },
    ],
  };

  /** North up the lane to the finish disc, then held inside it — MOVING, so
   *  only the presence gate can answer. Gate 2 needs a full standstill and the
   *  crash pin needs one too; neither may be what ends this drive. */
  function driveAndDwell(struck: boolean): LessonSessionState {
    let s = createLessonSession(twoStopLesson);
    let t = 0;
    for (let y = 175; y <= 220; y += 1) {
      const events = struck && t === 0 ? [{ kind: "collision" as const, withWhat: "pedestrian" as const }] : [];
      s = applyTick(s, makeTick({ t, speedKmh: 20, position: { x: 4.06, y }, events })).state;
      t += 1;
    }
    for (let i = 0; i < 5; i++) {
      s = applyTick(s, makeTick({ t, speedKmh: 20, position: { x: 4.06, y: 220 } })).state;
      t += 1;
    }
    return s;
  }

  it("POSITIVE CONTROL: the clean drive completes through the objective chain", () => {
    const s = driveAndDwell(false);
    expect(s.objectives[1].status).toBe("done");
    expect(s.phase).toBe("completed");
  });

  it("the struck drive is refused the certificate AND still ends", () => {
    const s = driveAndDwell(true);
    // Refused — §4's whole point, unchanged.
    expect(s.objectives[1].status).toBe("active");
    // …and not stranded: the drive ends, so the debrief that convicts him —
    // and teaches him — actually opens.
    expect(s.phase).toBe("completed");
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
  });

  it("the escape is not a blanket one: a claimless terminal gate is untouched", () => {
    // The engine may only open gate 1 on the terminal objective for a gate that
    // can no longer be earned. A lesson whose last task carries no wait claim
    // still completes it normally over the same strike — if this ever reports
    // `active`, the condition has widened into refusing drives it never spoke
    // about.
    const plain: LessonSpec = {
      ...twoStopLesson,
      objectives: [
        twoStopLesson.objectives[0],
        { ...twoStopLesson.objectives[1], titleBg: "Стигни края на отсечката" },
      ],
    };
    let s = createLessonSession(plain);
    let t = 0;
    for (let y = 175; y <= 220; y += 1) {
      const events = t === 0 ? [{ kind: "collision" as const, withWhat: "pedestrian" as const }] : [];
      s = applyTick(s, makeTick({ t, speedKmh: 20, position: { x: 4.06, y }, events })).state;
      t += 1;
    }
    expect(s.objectives[1].status).toBe("done");
  });
});
