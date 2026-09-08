/**
 * A CREDIT MUST NAME AN ACTION THE DRIVER TOOK — the gate for `haltVoided`
 * (w29, 2026-09-08).
 *
 * ── THE SHARED CAUSE ───────────────────────────────────────────────────────
 *
 * `stepObjective` is a pure function of `(params, prevEvalState, tick, ctx)`,
 * and a `SimTick` carries position, speed, heading, lane offset, gear, lamps,
 * belt and handbrake — no brake channel, no deceleration channel, no „this is
 * the last frame" channel. So every arrival predicate in `objectives.ts` is a
 * point-sample of a scalar or a read of somebody else's ledger, and on a HALT
 * cap (`maxSpeedKmh <= REACH_ZONE_HALT_CAP_KMH`) the whole graded act reduces
 * to `speedKmh <= cap` read at the mark. 0 км/ч satisfies every cap in the
 * catalogue. NOTHING ASKED WHY THE NUMBER WAS SMALL.
 *
 * The file had thought hard about the opposite error and says so three times —
 * „POSITION IS SWEPT; SPEED IS NOT … letting it satisfy the speed cap would
 * credit «I slowed down at the mark» to a car that slid through the mark at 30
 * and came to rest five metres past it" — and `approachBlown` defends that
 * direction. It refuses to arm on halt caps for a measured reason (the first
 * cut broke 166 correct drives: „on «Спри точно на маркираната позиция»
 * ARRIVING IN MOTION IS THE ACT"). The reciprocal — arriving AT REST was not an
 * act — was never defended, and the three guards that do defend provenance
 * (`posedAtSec`, `everOutside`, `freshApproach`) are all FIRST-frame guards.
 * „A drive that has not begun cannot end" had no counterpart reading „a rest
 * that ends the drive did not perform it".
 *
 * ── THE DRIVE THIS FILE MEASURES ───────────────────────────────────────────
 *
 * THE CRASH THAT COUNTS AS A STOP. `sc-hz-brake-dont-swerve`'s stop mark is
 * y 184 r 4 and the debris centre is y 190, so a car that plows into the debris
 * rests with its centre INSIDE the disc — and a rest is exactly what the rule
 * engine's `lastQualifyingStopAt` measures (≤ `fullStopMaxSpeedKmh` held ≥
 * `fullStopMinDurationSec`, with no author), which is the fact the w28
 * `requireFullStop` demand imports. So «пълна спирачка» was satisfied BY THE
 * IMPACT: «✓ Спри преди препятствието — с пълна спирачка» printed above «Удар в
 * неподвижно препятствие −10» on one protocol.
 *
 * ── AND THE ARM THAT WAS WITHDRAWN, kept here as a row rather than deleted ──
 *
 * A second reason — „the car went through this halt gate and left it behind
 * having never once been slow here, so a rest that drifts back onto it later
 * cannot re-issue the certificate" — was built and measured RED against
 * `terminal-departure.test.ts`'s committed return drive (out 200 m through the
 * terminal gate at 40 км/ч, back, onto the mark under the 6 км/ч cap, both
 * objectives done). §3 below re-drives that shape on this file's own gate so
 * the boundary is stated where the mechanism is: a student who overshoots a
 * stop mark, comes back and stops on it HAS stopped on it, and „he got there
 * late" is not „he never got there".
 *
 * ── WHAT WOULD MAKE THESE GO GREEN FALSELY ─────────────────────────────────
 *
 * §1 carries its COUNTERFACTUAL: the identical frames with no pin on the
 * context are still CREDITED, which is both the „unknown is never a refusal"
 * promise and the proof that the refused drive really was a certificate before.
 * §4 is the other direction — the committed correct drives — and a repair that
 * refuses one of those is not a repair.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import {
  REACH_ZONE_HALT_CAP_KMH,
  createEvalState,
  parseObjectiveParams,
  stepObjective,
} from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ObjectiveContext } from "../objectives";
import type { ObjectiveEvalState, ObjectiveParams } from "../types";
import type { ScenarioLevel } from "../scenario/types";
import { makeTick } from "./fixtures";
import { recordScVpTelltaleRedDrive } from "../../traces/scVpTelltaleRed";
import { recordScHzBrakeDontSwerveDrive } from "../../traces/scHzBrakeDontSwerve";
import { recordScHzEmergencyStopDrive } from "../../traces/scHzEmergencyStop";
import { recordScRxUnguardedDrive } from "../../traces/scRxUnguarded";
import { recordScEdD2PriorityRunDrive } from "../../traces/scEdD2PriorityRun";
import { recordScCrossingWhiteCaneDrive } from "../../traces/scCrossingWhiteCane";
import { recordScMergeFromPropertyDrive } from "../../traces/scMergeFromProperty";
import { recordScPkSmoothStopDrive } from "../../traces/scPkSmoothStop";
import { recordScParkBayExitRevDrive } from "../../traces/scParkBayExitRev";
import { recordScParkParallelExitDrive } from "../../traces/scParkParallelExit";

const REPO_ROOT = path.resolve(process.cwd(), "..");

/** The gate this file drives against: `sc-hzbds-stop`, x 4.06, y 184, r 4,
 *  cap 6 — a bare halt gate, no lamp/gear/kerbward demand to confound the
 *  measurement, and the one whose own drill is „stop, do not swerve". */
function hzbdsStop(level: number): ObjectiveParams {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-hz-brake-dont-swerve")!;
  const gate = compileScenario(spec, level as ScenarioLevel).objectives.find((o) => o.id === "sc-hzbds-stop")!;
  return parseObjectiveParams(gate);
}

/** A tick on the drill's own lane axis (+y through x = 4.06). */
const at = (y: number, speedKmh: number, t: number): SimTick =>
  makeTick({ t, position: { x: 4.06, y }, speedKmh });

/**
 * The context the engine builds, with only the one fact under test varied. The
 * two required members are empty exactly as they are on a drill that stages no
 * encounter and meets no red — every other witness stays „unknown", which is
 * the polarity this file's repair is held to.
 */
const ctxOf = (restIsCrashPinned?: boolean, qualifyingStopCurrent?: boolean): ObjectiveContext => ({
  stagedOutcomes: [],
  redsMetInRun: 0,
  ...(restIsCrashPinned === true ? { restIsCrashPinned: true } : {}),
  ...(qualifyingStopCurrent === undefined ? {} : { qualifyingStopCurrent }),
});

/**
 * Step a tick stream exactly as `lessons/engine.ts` does — it never re-steps a
 * completed objective.
 */
function run(params: ObjectiveParams, ticks: SimTick[], ctx?: ObjectiveContext) {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let doneAt = -1;
  for (let i = 0; i < ticks.length && !done; i++) {
    const r = stepObjective(params, evalState, ticks[i], ctx);
    evalState = r.evalState;
    done = r.done;
    if (done) doneAt = i;
  }
  return { done, doneAt, evalState };
}

// ---------------------------------------------------------------------------
// 1 · THE CRASH REST — the wheels stopped; the driver did not stop them
// ---------------------------------------------------------------------------

describe("a standstill the car crashed into is not a stop", () => {
  /**
   * The drive, frame by frame, with the pin held exactly where the engine holds
   * it: the car cruises into the debris in its own lane at 45 км/ч (nothing
   * pinned — it is moving), and every motionless frame afterwards is the
   * crash's. `pinned` is passed per frame rather than for the whole run so the
   * stream is the one the engine actually produces.
   */
  const CRASH: ReadonlyArray<{ tick: SimTick; pinned: boolean }> = [
    { tick: at(150, 45, 0), pinned: false },
    { tick: at(178, 45, 2.2), pinned: false },
    { tick: at(186, 45, 2.9), pinned: false }, // the impact, still at speed
    { tick: at(186, 0, 3.4), pinned: true }, // dead stop where he hit it
    { tick: at(186, 0, 3.9), pinned: true },
    { tick: at(186, 0, 4.9), pinned: true },
  ];

  function drive(pins: boolean) {
    const params = hzbdsStop(3);
    let evalState: ObjectiveEvalState = createEvalState(params);
    let done = false;
    for (const f of CRASH) {
      if (done) break;
      const r = stepObjective(params, evalState, f.tick, ctxOf(pins && f.pinned));
      evalState = r.evalState;
      done = r.done;
    }
    return { done, evalState };
  }

  it("REFUSES while the car sits in its own crash, and names the reason", () => {
    const r = drive(true);
    expect(r.done).toBe(false);
    expect(r.evalState.type === "reachZone" && r.evalState.haltVoided).toBe("impact");
  });

  it("…and the counterfactual: the same frames with no pin are CREDITED", () => {
    // Two things at once. (a) Unknown is never a refusal — every fixture, rig
    // and hand-built replay omits the fact and behaves exactly as shipped.
    // (b) The refused drive above really was a certificate: nothing but the
    // pin distinguishes these two runs, and this one earns the tick.
    expect(drive(false).done).toBe(true);
  });

  it("does not fire on the correct drive — braking to rest ON the mark ticks", () => {
    // The B4/B5 rescue, which is the constraint that outranks the repair: a car
    // that arrives in motion and comes to rest at the mark IS performing the
    // act, and no pin is held on a drive that hit nothing.
    const r = run(hzbdsStop(3), [
      at(120, 45, 0),
      at(150, 45, 2.4),
      at(170, 30, 4.4),
      at(180, 12, 5.4),
      at(183, 3, 6.0),
      at(184, 0, 6.6),
      at(184, 0, 7.6),
    ]);
    expect(r.done).toBe(true);
    expect(r.evalState.type === "reachZone" && r.evalState.haltVoided).toBeUndefined();
  });

  it("KEEPS a tick already earned — a crash AFTER the stop cannot take it back", () => {
    // The other direction, driven end to end because that is where the claim
    // lives: he brakes to a full stop ON the mark (the drill's own act), the
    // tick is issued, and only then does he creep forward into the debris. The
    // task he performed stays performed — `lessons/engine.ts` never re-steps a
    // completed objective and `st.capMet` suppresses the void in any case — and
    // the collision is the rule engine's to bill, which it does at −10.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-hz-brake-dont-swerve")!;
    let session = createLessonSession(compileScenario(spec, 3));
    const feed = (tick: SimTick) => {
      session = applyTick(session, tick).state;
    };
    for (let i = 0; i <= 24; i++) feed(at(60 + i * 5, 45, i * 0.4));
    feed(at(182, 12, 10)); // braking onto the mark
    for (let i = 1; i <= 20; i++) feed(at(184, 0, 10 + i * 0.1)); // the full stop
    const done = session.objectives.find((o) => o.spec.id === "sc-hzbds-stop")!.status;
    expect(done, "the act, performed").toBe("done");
    feed(
      makeTick({
        t: 13,
        position: { x: 4.06, y: 190 },
        speedKmh: 8,
        events: [{ kind: "collision", withWhat: "staticObject" }],
      }),
    );
    for (let i = 1; i <= 20; i++) feed(at(190, 0, 13 + i * 0.1));
    expect(session.objectives.find((o) => o.spec.id === "sc-hzbds-stop")!.status).toBe("done");
    // …and the strongest form of „cannot take it back" is the one this drive
    // demonstrates by accident: the last task completing ARMS THE RUN-OUT, so
    // the drive is already over by the time the crash frames arrive and the
    // objective loop is not running at all. `st.capMet` is the belt; this is
    // the braces.
    expect(session.phase).toBe("completed");
  });

  it("REAR-ENDED WHILE STOPPED still ticks — the crash is not his standstill", () => {
    // The false refusal this repair had to be shaped around, and the reason
    // `stopOk` does NOT restate the veto (`stepReachZone` carries the argument).
    // He comes to rest ON the mark — the contract latches on that first
    // motionless frame — and is hit from behind before his 0.5 s of dwell has
    // made a qualifying stop. The pin arms; the tick is still his the moment
    // the rule engine reports the stop, because `st.capMet` suppresses the void
    // and nothing else consults the pin.
    const params = hzbdsStop(3);
    let evalState: ObjectiveEvalState = createEvalState(params);
    const feed = (tick: SimTick, ctx: ObjectiveContext) => {
      const r = stepObjective(params, evalState, tick, ctx);
      evalState = r.evalState;
      return r;
    };
    expect(feed(at(170, 20, 0), ctxOf(false, false)).done).toBe(false);
    expect(feed(at(182, 4, 1.4), ctxOf(false, false)).done, "slow, not yet stopped").toBe(false);
    expect(feed(at(184, 0, 2.0), ctxOf(false, false)).done, "stopped, dwell unfinished").toBe(false);
    expect(evalState.type === "reachZone" && evalState.capMet, "the contract is his").toBe(true);
    // …and now somebody drives into the back of him.
    expect(feed(at(184, 0, 2.4), ctxOf(true, false)).done).toBe(false);
    expect(
      evalState.type === "reachZone" && evalState.haltVoided,
      "a contract already met is never voided",
    ).toBeUndefined();
    expect(feed(at(184, 0, 2.6), ctxOf(true, true)).done, "the stop he made counts").toBe(true);
  });

  it("SELF-CORRECTION IS NOT PUNISHED — a fresh approach clears the void", () => {
    // Crash on the mark, drive off it, come at it again down the same road and
    // stop. `freshApproach` clears `haltVoided` exactly as it clears
    // `approachCap`: the escape hatch this file has always documented.
    let evalState: ObjectiveEvalState = createEvalState(hzbdsStop(3));
    const feed = (tick: SimTick, pinned: boolean) => {
      const r = stepObjective(hzbdsStop(3), evalState, tick, ctxOf(pinned));
      evalState = r.evalState;
      return r;
    };
    feed(at(150, 45, 0), false);
    feed(at(186, 45, 2.9), false); // hit it at speed — never slow on the mark
    expect(feed(at(186, 0, 3.5), true).done, "voided by the impact").toBe(false);
    expect(evalState.type === "reachZone" && evalState.haltVoided).toBe("impact");
    feed(at(160, 20, 8), false); // drove off the wreck, back down the approach
    feed(at(174, 12, 9.4), false); // re-entering the ring the way he came
    feed(at(182, 3, 10.4), false);
    expect(feed(at(184, 0, 11), false).done, "he performed the act on the second try").toBe(true);
  });

  it("leaves FLOW caps alone — a standstill can be lawful where one is asked", () => {
    // `sc-hzbds-approach` is the same drill's flow gate (r 12, cap 52). The
    // repair must not reach it: on a flow cap the banner asks the car to BE
    // somewhere at a speed, and a queue, a give-way or a lawful wait are all
    // standstills that satisfy it honestly.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-hz-brake-dont-swerve")!;
    const flow = parseObjectiveParams(
      compileScenario(spec, 3).objectives.find((o) => o.id === "sc-hzbds-approach")!,
    );
    expect(
      flow.kind === "reachZone" &&
        flow.maxSpeedKmh !== undefined &&
        flow.maxSpeedKmh > REACH_ZONE_HALT_CAP_KMH,
    ).toBe(true);
    const r = run(flow, [at(60, 40, 0), at(105, 0, 4), at(105, 0, 5)], ctxOf(true));
    expect(r.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2 · IT IS NOT A DEAD PREDICATE — the pin the engine keeps reaches the gate
// ---------------------------------------------------------------------------

describe("the fact is driven, not injected", () => {
  const spec = () => SCENARIO_TEMPLATES.find((s) => s.id === "sc-hz-brake-dont-swerve")!;

  /** Flow gate, debris impact inside the stop disc, then four seconds of the
   *  standstill the CRASH PIN holds (`finish.ts CRASH_PIN_STUCK_S` = 10 s;
   *  `fullStopMinDurationSec` needs 0.5 s to call it a full stop). */
  function crashDrive() {
    let session = createLessonSession(compileScenario(spec(), 3));
    const said: string[] = [];
    const feed = (tick: SimTick) => {
      const step = applyTick(session, tick);
      session = step.state;
      for (const e of step.hudEvents) if (e.kind === "lesson") said.push(e.titleBg ?? "");
    };
    for (let i = 0; i <= 24; i++) feed(at(60 + i * 5, 45, i * 0.4));
    feed(
      makeTick({
        t: 10,
        position: { x: 4.06, y: 186 },
        speedKmh: 30,
        events: [{ kind: "collision", withWhat: "staticObject" }],
      }),
    );
    for (let i = 1; i <= 40; i++) feed(at(186, 0, 10 + i * 0.1));
    return { session, said };
  }

  it("END TO END through applyTick — the gate is refused, the pin is why", () => {
    // A dead predicate is the failure mode this codebase files against itself,
    // so the fact is driven through `applyTick` — the entry point
    // `LessonPlayShell.tsx` itself calls — rather than injected.
    const { session } = crashDrive();
    expect(session.crashPin, "a terminating collision armed the pin").toBeDefined();
    expect(session.crashPin?.stillSinceSec, "and the pin is holding this rest").not.toBeNull();
    expect(session.events.map((e) => e.code)).toContain("COLLISION");
    const gate = session.objectives.find((o) => o.spec.id === "sc-hzbds-stop")!;
    expect(gate.status, "«Спри преди препятствието — с пълна спирачка»").not.toBe("done");
    const st = session.evalStates[session.objectives.indexOf(gate)];
    expect(st.type === "reachZone" && st.haltVoided).toBe("impact");
  });

  it("SPEAKS (THEO-4) — a withheld tick owes the student a sentence", () => {
    // Doc 64 THEO-4, founder-ratified: never a bare correct/wrong verdict. This
    // refusal is the first in the evaluator that can withdraw a tick a student
    // used to get, and without a card he would see the car standing exactly on
    // the green circle and a task that never ticks.
    const { said } = crashDrive();
    expect(said).toContain("Колата спря от удара, а не от спирачката");
  });

  it("THE RACE IS CLOSED — the first motionless frame is already covered", () => {
    // Measured, and the reason `lessons/engine.ts` reads the pin's ARMING from
    // `prev` and the standstill from the tick in hand: a bare halt cap needs no
    // dwell, so `capMet` latches on the FIRST motionless frame after the impact
    // — which is exactly the frame `crashPin.stillSinceSec` has not been
    // written on yet. Reading `stillSinceSec` whole let the shipped evaluator
    // bank `capMet: true` at t = 10.1 with the pin armed at t = 10.0.
    let session = createLessonSession(compileScenario(spec(), 3));
    const feed = (tick: SimTick) => {
      session = applyTick(session, tick).state;
    };
    for (let i = 0; i <= 24; i++) feed(at(60 + i * 5, 45, i * 0.4));
    feed(
      makeTick({
        t: 10,
        position: { x: 4.06, y: 186 },
        speedKmh: 30,
        events: [{ kind: "collision", withWhat: "staticObject" }],
      }),
    );
    feed(at(186, 0, 10.1)); // ONE motionless frame — `stillSinceSec` is set here
    const gate = session.objectives.find((o) => o.spec.id === "sc-hzbds-stop")!;
    const st = session.evalStates[session.objectives.indexOf(gate)];
    expect(st.type === "reachZone" && st.capMet, "not banked on the first rest frame").toBe(false);
    expect(st.type === "reachZone" && st.haltVoided).toBe("impact");
  });
});

// ---------------------------------------------------------------------------
// 3 · THE BOUNDARY — what this repair deliberately does NOT refuse
// ---------------------------------------------------------------------------

describe("a late arrival is not a missing one", () => {
  it("the overshoot-and-RETURN drive still completes", () => {
    // The shape `terminal-departure.test.ts` pins end-to-end („out 200 m, back,
    // done at ≈ 94.5 s"), re-driven here on this file's own gate because it is
    // the exhibit that refuted a second `haltVoided` reason. Through the mark
    // at 45 in a 6, on for 40 m, then back down onto it and stopped. He stopped
    // on the mark. He is credited.
    const r = run(hzbdsStop(3), [
      at(150, 45, 0),
      at(186, 45, 2.9), // through the disc, far over the cap
      at(220, 40, 5.6), // well past the ring (r 4 + REACH_ZONE_GRACE_M)
      at(200, 20, 8.0), // coming back
      at(188, 6, 9.4),
      at(184, 0, 10.4),
      at(184, 0, 11.4),
    ]);
    expect(r.done, "a late arrival is still an arrival").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 · A FALSE REFUSAL IS AS BAD AS A FALSE CERTIFICATE
// ---------------------------------------------------------------------------

type Rec = (d: unknown, n: string, e: { onTick: (t: unknown) => void }) => unknown;

/**
 * Every drill with a committed `shadow-correct` that carries a HALT-capped
 * reachZone: the seven «напълно» census members (the population `requireFullStop`
 * was derived onto in w28) plus the three drills whose own shape is closest to
 * the repair's failure mode — a smooth-stop drill, and the two EXIT drills that
 * spawn INSIDE their own grace capsule (the drives that forced `everOutside`).
 */
const SHADOWS: ReadonlyArray<{ specId: string; rec: Rec }> = [
  { specId: "sc-rx-unguarded", rec: recordScRxUnguardedDrive as Rec },
  { specId: "sc-merge-from-property", rec: recordScMergeFromPropertyDrive as Rec },
  { specId: "sc-ed-d2-priority-run", rec: recordScEdD2PriorityRunDrive as Rec },
  { specId: "sc-vp-telltale-red", rec: recordScVpTelltaleRedDrive as Rec },
  { specId: "sc-crossing-white-cane", rec: recordScCrossingWhiteCaneDrive as Rec },
  { specId: "sc-hz-emergency-stop", rec: recordScHzEmergencyStopDrive as Rec },
  { specId: "sc-hz-brake-dont-swerve", rec: recordScHzBrakeDontSwerveDrive as Rec },
  { specId: "sc-pk-smooth-stop", rec: recordScPkSmoothStopDrive as Rec },
  { specId: "sc-park-bay-exit-rev", rec: recordScParkBayExitRevDrive as Rec },
  { specId: "sc-park-parallel-exit", rec: recordScParkParallelExitDrive as Rec },
];

function district(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

describe("no committed correct drive loses a tick, and none is voided", () => {
  for (const { specId, rec } of SHADOWS) {
    for (const level of [1, 3, 5]) {
      it(`${specId} shadow-correct @L${level}`, () => {
        const spec = SCENARIO_TEMPLATES.find((s) => s.id === specId)!;
        const compiled = compileScenario(spec, level as ScenarioLevel);
        // The halt-capped gates this drill actually ships at this rung — the
        // population the repair can reach.
        const halt = new Set(
          compiled.objectives
            .filter((o) => {
              const p = parseObjectiveParams(o);
              return (
                p.kind === "reachZone" &&
                p.maxSpeedKmh !== undefined &&
                p.maxSpeedKmh <= REACH_ZONE_HALT_CAP_KMH
              );
            })
            .map((o) => o.id),
        );
        expect(halt.size, `${specId} must carry a halt gate for this row to mean anything`)
          .toBeGreaterThan(0);
        let session = createLessonSession(compiled);
        rec(district((spec as unknown as { map: { districtId: string } }).map.districtId), "shadow-correct", {
          onTick: (t) => {
            session = applyTick(session, t as never).state;
          },
        });
        for (const [i, o] of session.objectives.entries()) {
          if (halt.has(o.spec.id)) {
            expect(o.status, `${specId}@L${level} «${o.spec.titleBg}»`).toBe("done");
          }
          const st = session.evalStates[i];
          expect(
            st.type === "reachZone" ? st.haltVoided : undefined,
            `${specId}@L${level} ${o.spec.id} must not be voided on a correct drive`,
          ).toBeUndefined();
        }
      });
    }
  }
});
