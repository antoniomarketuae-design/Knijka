/**
 * THE YIELD THE BANNER SAYS HAPPENED — `requireYieldClean`, the seventh
 * ReachZoneWitnessDemand (objectives.ts, 2026-08-27).
 *
 * THE FRAME THIS FILE IS CUT FROM (sc-signal-flashing:fe1889f5;
 * `.audit-frames/w11/frames/sc-signal-flashing__mobile-right`, 31 frames,
 * TRACKED 100 %, steered, ended naturally, EVIDENCE complete). One debrief,
 * one screen:
 *
 *   Задачи от маршрута  ✓ Приближи мигащото жълто бавно…             1:04
 *                       ✓ Премини правó напред, СЛЕД КАТО ПРОПУСНЕШ
 *                         идващия отдясно                           1:48
 *   Грешки (2)          ✗ Непропускане на пътно превозно средство с
 *                         предимство −10 изпитни т. ОПАСНА ГРЕШКА в 1:43
 *   Разбор              «…допусната е опасна грешка: „Непропускане на пътно
 *                       превозно средство с предимство“ … ЗАДАЧИТЕ ОТ
 *                       МАРШРУТА СА ИЗПЪЛНЕНИ.»
 *
 * Five seconds apart, and the frames carry the same order with no clock to
 * argue about: at `04-t092s` the −10 card is on the glass with «Задача 2/2 …
 * след като пропуснеш идващия отдясно» still OPEN; at `04-t099s` that task is
 * ticked. `sc-sflash-cross` is `{kind:"reachZone", x:4.06, y:45, radiusM:9}` —
 * a bare disc 45 m north of the junction, so arrival was the whole certificate.
 *
 * THE CHANNEL IS THE LESSON'S OWN: `SC_SIGNAL_FLASHING.mistakes[]` names
 * `FAILED_TO_YIELD` twice as the fault this drill exists to teach. Nothing new
 * observes anything — the gate reads the bill the grader that owns the duty has
 * already written and printed.
 *
 * FOUR SECTIONS, and §4 is the one that matters: the whole lesson of this
 * programme is that a predicate nothing routes to is not a repair, so §4 drives
 * `applyTick` — the entry point `LessonPlayShell.tsx:3575` itself calls — with
 * a real `prioritySituation` tick event, so the rule engine bills the fault for
 * itself. §4 also asserts the drive still ENDS: both gates that acquire this
 * demand are the LAST objective of their drill, and a repair that removes a
 * false certificate by creating a drive that cannot end has repaired nothing.
 *
 * THE MUTATION THAT MUST TURN THESE RED: drop the `yieldOk` conjunct in
 * `stepReachZone`, or the `yieldFaults` / `objectiveActiveSinceSec` forwarding
 * in `lessons/engine.ts`, and every „REFUSED" row below goes green.
 */

import { describe, expect, it } from "vitest";
import type { LessonObjective, LessonSpec } from "../../contracts";
import { VIOLATIONS, type SimTick } from "../../rules";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import {
  createEvalState,
  deriveYieldDemand,
  parseObjectiveParams,
  stepObjective,
  type ObjectiveContext,
  type WitnessedReachZoneParams,
} from "../objectives";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState, ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

const FLASHING = "sc-signal-flashing";

/** The exact ledger rows `requireYieldClean` consults, mirrored from engine.ts. */
const YIELD_CODES = [
  "FAILED_TO_YIELD",
  "EMERGENCY_NOT_YIELDED",
  "PEDESTRIAN_NOT_YIELDED",
] as const;

function parsed(titleBg: string, params: Record<string, unknown>): WitnessedReachZoneParams {
  const objective: LessonObjective = { id: "o1", titleBg, kind: "reachZone", params };
  return parseObjectiveParams(objective) as WitnessedReachZoneParams;
}

/** The shipped objective, read out of the catalogue rather than copied. */
function shipped(specId: string, objectiveId: string): LessonObjective {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === specId);
  if (spec === undefined) throw new Error(`no template ${specId}`);
  const o = spec.success.find((x) => x.id === objectiveId);
  if (o === undefined) throw new Error(`no objective ${objectiveId} on ${specId}`);
  return {
    id: o.id,
    titleBg: o.titleBg,
    kind: "reachZone",
    params: o.params as unknown as Record<string, unknown>,
  };
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

// ---------------------------------------------------------------------------
// 1 · The matcher, both directions — the instrument before the measurement
// ---------------------------------------------------------------------------

describe("the banner's own words decide the demand — «пропусни» is an act, «готовност» is a posture", () => {
  it("matches the seven shipped claims", () => {
    // Every string is a shipped `titleBg`. A matcher that quietly narrowed
    // fails here before it can empty the census in §2.
    //
    // The seventh landed wave 8, 2026-08-28 with `sc-jscan-exit`'s retitle —
    // see the re-baseline note in §2. It is listed here for the same reason as
    // the other six: this test is the teeth, and a census member whose string
    // never reaches the matcher's own test is a member nothing would notice
    // losing.
    expect(
      deriveYieldDemand("Завърши десния завой на изток, след като пропуснеш колата отляво"),
    ).toBe("traffic");
    expect(deriveYieldDemand("Премини правó напред, след като пропуснеш идващия отдясно")).toBe(
      "traffic",
    );
    expect(deriveYieldDemand("Премини наляво, след като пропуснеш идващия отдясно")).toBe(
      "traffic",
    );
    expect(deriveYieldDemand("Пропусни колата с предимство на второто кръстовище")).toBe("traffic");
    expect(deriveYieldDemand("Намали, за да пропуснеш потеглящия автобус")).toBe("traffic");
    expect(deriveYieldDemand("Спри пред тротоара и пропусни пешеходеца")).toBe("pedestrian");
    // «пропусни УЛИЦАТА» is the street you are joining — the traffic ledger.
    // A pooled kind that also read PEDESTRIAN_NOT_YIELDED was cut before it
    // shipped: inside a living zone, whose own objectives 2 and 3 are about
    // people in the carriageway, it would have withdrawn a certificate about
    // joining the street for a fault the banner never spoke about.
    expect(deriveYieldDemand("Пълзи до устието на изхода и пропусни улицата")).toBe("traffic");
  });

  it("…and spares the three that promise only READINESS to yield", () => {
    // The precision `ACTOR_CLAIM` in stop-claim-gates.test.ts states in prose:
    // «готовност» is a state of the driver, and the authored cap is what grades
    // it. Binding these would refuse a certificate for a duty their banner
    // never claimed to have discharged.
    expect(
      deriveYieldDemand("Приближи равнозначното кръстовище с готовност да пропуснеш"),
    ).toBeUndefined();
    expect(deriveYieldDemand("Приближи завоя с готовност да пропуснеш")).toBeUndefined();
    expect(
      deriveYieldDemand("Приближи завоя бавно, готов да пропуснеш и двете посоки"),
    ).toBeUndefined();
  });

  it("…and never fires on the rule engine's own fault titles", () => {
    // «Непропускане …» is the catalogue's name for the FAULT. A lookbehind that
    // stopped working would bind a demand off a violation's copy.
    expect(deriveYieldDemand("Непропускане на пътно превозно средство с предимство")).toBeUndefined();
    expect(deriveYieldDemand("Непропуснат пешеходец в средата на сегмента")).toBeUndefined();
    expect(deriveYieldDemand("Стигни края на отсечката")).toBeUndefined();
  });

  it("an authored param OVERRIDES the banner, and a malformed one is loud", () => {
    const p = parsed("Стигни края на отсечката", {
      kind: "reachZone",
      x: 0,
      y: 0,
      radiusM: 10,
      requireYieldClean: "pedestrian",
    });
    expect(p.requireYieldClean).toBe("pedestrian");
    expect(() =>
      parsed("Стигни края на отсечката", {
        kind: "reachZone",
        x: 0,
        y: 0,
        radiusM: 10,
        requireYieldClean: true,
      }),
    ).toThrow(/requireYieldClean/);
  });
});

// ---------------------------------------------------------------------------
// 2 · The census — which gates in the whole catalogue acquire the demand
// ---------------------------------------------------------------------------

describe("the two vocabularies agree — the instrument before the census", () => {
  it("every code this demand consults is a real, billable catalogue row", () => {
    // `YieldFaultCode` is declared in objectives.ts (so that evaluator keeps its
    // one dependency on rules/) and `lessons/engine.ts` matches it against the
    // real `ViolationCode` union. This is the runtime half of that agreement: a
    // code retired or renamed in the catalogue would leave the gate matching a
    // string nothing can ever bill — the instrument bug this programme has
    // shipped four times, which looks exactly like a working repair.
    for (const code of YIELD_CODES) expect(VIOLATIONS[code], code).toBeDefined();
  });

  it("…and every one of them already fails the sheet on its own", () => {
    // THE SAFETY PROPERTY OF THE WHOLE REPAIR. One опасна is «допусната е
    // опасна грешка — директно неиздържан», so every drive this demand can
    // refuse was already failed before the objective was consulted: the
    // refusal removes a CONTRADICTION between the two halves of one sheet and
    // can never cost a student a pass. If a later reclassification made one of
    // these a 3-point основна, this demand would silently start deciding
    // pass/fail by itself — so it fails here instead.
    for (const code of YIELD_CODES) {
      expect(VIOLATIONS[code].severityClass, code).toBe("opasna");
    }
  });
});

describe("the catalogue census", () => {
  it("binds exactly the seven rows whose banner certifies a yield", () => {
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
        if (out.requireYieldClean !== undefined) {
          bound.push(`${spec.id}/${o.id}:${out.requireYieldClean}`);
        }
      }
    }
    // By name and by kind. An over-wide matcher shows up as an EIGHTH entry, a
    // dead one as an empty list, and a mis-kinded one as a changed suffix —
    // which matters: `pedestrian` on a vehicle claim would consult a ledger row
    // the drill can never bill.
    //
    // ── RE-BASELINED 6 → 7, wave 8, 2026-08-28 (templates-junctions lane) ──
    //
    // WHY THE NEW VALUE IS RIGHT, in one sentence: `sc-jscan-exit`'s BANNER was
    // rewritten this wave to promise a yield in so many words — «Завърши десния
    // завой на изток, СЛЕД КАТО ПРОПУСНЕШ КОЛАТА ОТЛЯВО» (it read «Завърши
    // десния завой и продължи на изток» at HEAD b211041) — so the row is a new
    // census member for the only reason this census accepts one: the sentence
    // the student reads now certifies that another driver was let through, and
    // the gate has to be able to refuse it.
    //
    // THE MATCHER DID NOT MOVE, and that is the half worth checking first: this
    // is a TEMPLATE change, not an instrument change. `deriveYieldDemand` and
    // all three of its regexes (`objectives.ts:1610–1631`) are byte-identical to
    // HEAD — verified with `git diff`, no hunk touches them. So the raise is the
    // shipped matcher correctly reading a new sentence, not a widened matcher
    // sweeping up an old one. `:traffic` is the right kind: the banner names
    // «колата», a vehicle, and the drill's own two demos cite FAILED_TO_YIELD by
    // name in `codeRefs` — the ledger row `traffic` consults.
    //
    // THE CLAIM IS REDEEMABLE, which is what HEAD's own note said it was not.
    // That note withheld «след като колата отляво премине» deliberately, because
    // in 2026-08 «a reachZone tick could witness NOTHING about another road
    // user». `requireYieldClean` landed 2026-08-27 and that reason has expired:
    // the drill stages the conflict it names (`witnessArm.nearLineM 6` holds the
    // car at the line, so arriving late cannot delete the encounter), and the
    // refusal half is now witnessable. The positive half — „he really did wait"
    // — still is not, and this row is no exception to that.
    //
    // AND IT IS NOT A TRAP, which needed checking because `sc-jscan-exit` is 3
    // of 3 — the first census member that is terminal AND whose drill can bill
    // the code. `engine.ts:1585` folds `yieldFailedVoidsObjective` into
    // `terminalUnearnable` BY PARAMS, not by id (read at :1566–1598), so the
    // finish gate arms, the objective keeps its honest `active` status, and the
    // student reaches the −10 «Непропускане на пътно превозно средство с
    // предимство» card instead of having to quit. NOTE for whoever next opens
    // `engine.ts`: the comment there still reads „BOTH gates that carry it" and
    // names sc-sflash-cross / sc-sdead-cross — it is three now, and that comment
    // is stale. Reported; not edited from this file.
    expect(bound.sort()).toEqual(
      [
        "sc-junction-scan/sc-jscan-exit:traffic",
        "sc-jx-giveway-b1/sc-jxgb-yield:traffic",
        "sc-merge-bus-pullout/sc-mgb-ease:traffic",
        "sc-merge-from-property/sc-mfp-walk-yield:pedestrian",
        "sc-pe-zone-living/sc-pzl-exit:traffic",
        "sc-signal-dead/sc-sdead-cross:traffic",
        "sc-signal-flashing/sc-sflash-cross:traffic",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// 3 · The evaluator, both directions, on the authored gate
// ---------------------------------------------------------------------------

/** A straight northbound drive through the cross disc at (4.06, 45). */
function driveThroughCross(): SimTick[] {
  const out: SimTick[] = [];
  let t = 100;
  for (let y = 20; y <= 55; y += 1) {
    out.push(makeTick({ t, speedKmh: 20, position: { x: 4.06, y } }));
    t += 1;
  }
  return out;
}

function ctxWith(over: Partial<ObjectiveContext>): ObjectiveContext {
  return { stagedOutcomes: [], redsMetInRun: 0, ...over };
}

describe("«…след като пропуснеш идващия отдясно» is refused on the drive that did not", () => {
  const params = parseObjectiveParams(
    shipped(FLASHING, "sc-sflash-cross"),
  ) as WitnessedReachZoneParams;

  it("the shipped gate carries the demand and is still a bare disc", () => {
    expect(params.requireYieldClean).toBe("traffic");
    // The disc is deliberately unchanged — this repair adds a term, it does not
    // move a mark. If a later lane caps or shifts it, that is a separate act.
    expect(params.maxSpeedKmh).toBeUndefined();
  });

  it("REFUSED: a FAILED_TO_YIELD billed inside the window withholds the tick", () => {
    const r = run(
      params,
      driveThroughCross(),
      ctxWith({
        objectiveActiveSinceSec: 64,
        yieldFaults: [{ code: "FAILED_TO_YIELD", tSec: 103 }],
      }),
    );
    expect(r.done).toBe(false);
    // Not inert while refused: the place half is acknowledged, the certificate
    // is what is withheld.
    expect(r.lastProgress).toBe(0.5);
  });

  it("CREDITED: the clean drive ticks exactly as shipped", () => {
    const r = run(params, driveThroughCross(), ctxWith({ objectiveActiveSinceSec: 64 }));
    expect(r.done).toBe(true);
  });

  it("CREDITED: a failure billed BEFORE the gate opened is another junction's", () => {
    // The window is the whole reason this demand is not session-monotone.
    // «Пропусни колата с предимство на ВТОРОТО кръстовище» is a drill with two
    // Б1 mouths in a row; a student who barged the first and gave way properly
    // at the second told the truth about the second.
    const r = run(
      params,
      driveThroughCross(),
      ctxWith({
        objectiveActiveSinceSec: 64,
        yieldFaults: [{ code: "FAILED_TO_YIELD", tSec: 41 }],
      }),
    );
    expect(r.done).toBe(true);
  });

  it("CREDITED: unknown is never a refusal — no window, or no ledger", () => {
    // Every fixture, rig and hand-built replay omits these fields, and each of
    // them must behave exactly as shipped.
    expect(
      run(
        params,
        driveThroughCross(),
        ctxWith({ yieldFaults: [{ code: "FAILED_TO_YIELD", tSec: 103 }] }),
      ).done,
    ).toBe(true);
    expect(run(params, driveThroughCross(), ctxWith({ objectiveActiveSinceSec: 0 })).done).toBe(
      true,
    );
  });

  it("the kinds do not leak into each other", () => {
    // A vehicle claim is not falsified by a pedestrian row and vice versa —
    // withdrawing a certificate for something it never claimed is the false
    // refusal this split exists to prevent.
    const vehicleClaim = ctxWith({
      objectiveActiveSinceSec: 64,
      yieldFaults: [{ code: "PEDESTRIAN_NOT_YIELDED", tSec: 103 }],
    });
    expect(run(params, driveThroughCross(), vehicleClaim).done).toBe(true);

    const walk = parsed("Спри пред тротоара и пропусни пешеходеца", {
      kind: "reachZone",
      x: 4.06,
      y: 45,
      radiusM: 9,
    });
    expect(walk.requireYieldClean).toBe("pedestrian");
    expect(
      run(
        walk,
        driveThroughCross(),
        ctxWith({
          objectiveActiveSinceSec: 64,
          yieldFaults: [{ code: "FAILED_TO_YIELD", tSec: 103 }],
        }),
      ).done,
    ).toBe(true);
    expect(
      run(
        walk,
        driveThroughCross(),
        ctxWith({
          objectiveActiveSinceSec: 64,
          yieldFaults: [{ code: "PEDESTRIAN_NOT_YIELDED", tSec: 103 }],
        }),
      ).done,
    ).toBe(false);
  });

  it("EMERGENCY_NOT_YIELDED falsifies a traffic claim too", () => {
    // VU-09 splits the special-regime duty off FAILED_TO_YIELD into its own
    // code. It is the same act as far as a «пропусни» banner is concerned.
    const r = run(
      params,
      driveThroughCross(),
      ctxWith({
        objectiveActiveSinceSec: 64,
        yieldFaults: [{ code: "EMERGENCY_NOT_YIELDED", tSec: 103 }],
      }),
    );
    expect(r.done).toBe(false);
  });

  it("the demand does not leak: a claimless gate ticks over the same fault", () => {
    const plain = parsed("Стигни края на отсечката", {
      kind: "reachZone",
      x: 4.06,
      y: 45,
      radiusM: 9,
    });
    expect(plain.requireYieldClean).toBeUndefined();
    const r = run(
      plain,
      driveThroughCross(),
      ctxWith({
        objectiveActiveSinceSec: 64,
        yieldFaults: [{ code: "FAILED_TO_YIELD", tSec: 103 }],
      }),
    );
    expect(r.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 · ENGINE-LEVEL — the live path, and the ending it must not take away
// ---------------------------------------------------------------------------

/**
 * The two shipped `sc-signal-flashing` gates, on a spec that skips the
 * pre-drive choreography so the tick stream is the only variable. The titles
 * and params come out of `SCENARIO_TEMPLATES`, so a retitle in
 * `templates-signals.ts` reaches this test rather than passing it by.
 */
function flashingLesson(): LessonSpec {
  return {
    id: "t-yield-flashing",
    order: 99,
    titleBg: "Тест мигащо жълто",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 4.06, y: -60 }, headingDeg: 0 },
    preDrive: false,
    objectives: [shipped(FLASHING, "sc-sflash-approach"), shipped(FLASHING, "sc-sflash-cross")],
  };
}

/**
 * The measured drive, reproduced through the real reducer: crawl north under
 * the 25 cap over the approach mark at y = −30, cross the junction, and — when
 * `failAt` is given — report the priority conflict the runtime's adjudicator
 * reports, so `rules/engine.ts` bills FAILED_TO_YIELD itself. No event is
 * fabricated downstream of the grader that owns it.
 */
function driveFlashing(failAtY: number | null): LessonSessionState {
  let s = createLessonSession(flashingLesson());
  let t = 0;
  for (let y = -60; y <= 60; y += 1) {
    const conflictHere = failAtY !== null && y === failAtY;
    const tick = makeTick({
      t,
      speedKmh: 20,
      position: { x: 4.06, y },
      ...(conflictHere
        ? {
            events: [
              { kind: "prioritySituation" as const, situation: "right-hand-rule", violated: true },
            ],
          }
        : {}),
    });
    s = applyTick(s, tick).state;
    t += 1;
  }
  return s;
}

describe("the live path: applyTick withholds the certificate and still lets the drive end", () => {
  it("CLEAN: both tasks tick and the session completes, exactly as shipped", () => {
    const s = driveFlashing(null);
    const r = buildLessonResult(s);
    expect(r.objectives.map((o) => o.done)).toEqual([true, true]);
    expect(r.completedAll).toBe(true);
    expect(s.phase).toBe("completed");
  });

  it("REFUSED: the drive billed for not giving way loses the give-way tick", () => {
    // y = 5 is inside the junction, after the approach mark at y = −30 — the
    // measured order, in which the −10 lands with «Задача 2/2» still open.
    const s = driveFlashing(5);
    const r = buildLessonResult(s);
    expect(r.summary.mistakes.some((m) => m.code === "FAILED_TO_YIELD")).toBe(true);
    expect(r.objectives[0].done).toBe(true);
    expect(r.objectives[1].done).toBe(false);
    // …and with it the sentence the finding quoted from the Разбор: debrief.ts
    // gates «Задачите от маршрута са изпълнени» on exactly this flag, so the
    // instructor stops affirming the yield he has just convicted.
    expect(r.completedAll).toBe(false);
  });

  it("AND STILL ENDS: the withheld terminal gate does not strand the drive", () => {
    // Both gates that acquire this demand are the LAST objective of their
    // drill. Without the `yieldFailedVoidsObjective` arm in the finish gate the
    // chain would never advance and the student could reach the −10 card that
    // teaches him чл. 47/48/50 only by quitting, forfeiting the attempt.
    const s = driveFlashing(5);
    expect(s.phase).toBe("completed");
    // The certificate is still refused — finished, and failed.
    expect(buildLessonResult(s).passed).toBe(false);
  });

  it("the FIRST junction's failure does not cost the SECOND junction's tick", () => {
    // y = −45 is before the approach mark at y = −30, so the fault falls
    // outside the cross gate's window. This is the `sc-jxgb-yield` shape, and
    // it is what stops this repair from becoming a run-wide punishment.
    const s = driveFlashing(-45);
    const r = buildLessonResult(s);
    expect(r.summary.mistakes.some((m) => m.code === "FAILED_TO_YIELD")).toBe(true);
    expect(r.objectives.map((o) => o.done)).toEqual([true, true]);
  });
});
