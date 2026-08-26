/**
 * THE ARM WAS UP WHEN THE CAR WENT OVER THE RAILS — `requireRailClear`, the
 * sixth ReachZoneWitnessDemand (sc-rx-guarded:deb92207, wave 2).
 *
 * THE DEBT, NAMED BY THREE FILES AND PAID HERE. `templates-rail.ts` at
 * `sc-rxg-finish`: *„this disc CAN be taught to refuse while the arm is down —
 * and until it is, this drill's own two ❌ demos still complete it at 33.4 s and
 * 46.9 s on drives convicted of entering barred. OWNER: `lessons/objectives.ts`
 * (a `requireRailClear` demand reading `tick.railBarred`)."* `traces/
 * scRxGuarded.ts` routes the same clause («the routed owner is templates-rail
 * .ts's own note at the `sc-rxg-finish` disc»), and `rail-cross-when-clear
 * .test.ts` §5 states what it deliberately could not do («it does not make the
 * guarded finish disc refuse a barred entry … the demand that would spend it
 * lives in `lessons/objectives.ts`, which this lane does not own»).
 *
 * WHAT WAS ACTUALLY WRONG. «Стигни края на отсечката отвъд прелеза» is a disc
 * at (4.06, 285) r 6 — about 130 m PAST the crossing — and a disc proves
 * arrival. So the drive that blasted the lowered boom at 30 км/ч and the drive
 * that politely stopped and then crept under it both collected the drill's
 * final certificate, in the same protocol that bills them the 10-point
 * terminating опасна «Влизане на прелез при спусната бариера».
 *
 * WHY THE DEMAND IS A MOMENT AND NOT A STATE AT THE MARK. The arm is on a 90 s
 * cycle inside a 95 s par time, so it comes back down while a perfectly correct
 * student is still driving the last 130 m. Asking „is the arm up now, at the
 * end of the road" would refuse him for a crossing he already made properly —
 * a false refusal, which this programme ranks with a false certificate. What is
 * graded is the crossing, at the crossing: earned on a frame with
 * `railCrossing === "on"` and the arm up, spent on a frame on the band with it
 * down, carried by `capMet` in between — `requireControllerProceed`'s shape
 * exactly.
 *
 * MEASURED ON THE COMMITTED RECORDINGS, THROUGH `applyTick`. §2 and §3 drive
 * all six authored recordings of the two guarded drills through the production
 * session — the same entry point `LessonPlayShell.tsx` calls — because a gate
 * asserted only against hand-built ticks is a gate that has never met the
 * world's own timetable. The mutation is one conjunct: drop `railHere ===
 * "clear"` from `contractEarned` in `stepReachZone` and every REFUSED case here
 * goes green.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import {
  recordScRxBarrierDropDrive,
  type ScRxBarrierDropTraceName,
} from "../../traces/scRxBarrierDrop";
import { recordScRxGuardedDrive, type ScRxGuardedTraceName } from "../../traces/scRxGuarded";
import { applyTick, createLessonSession } from "../engine";
import { parseObjectiveParams, type WitnessedReachZoneParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { SC_RX_BARRIER_DROP, SC_RX_GUARDED, SC_RX_UNGUARDED } from "../scenario/templates-rail";
import type { LessonSessionState } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function district(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

const RX_GUARDED = district("rx-guarded-v1");
const RX_DROP = district("rx-drop-v1");

/** Did the drive bill the barred-entry опасна the demand exists to disown? */
function billedBarredEntry(session: LessonSessionState): boolean {
  return session.events.some(
    (e) =>
      e.kind === "violation" &&
      e.code === "RAIL_CROSSING_VIOLATION" &&
      e.detail === "entered-barred",
  );
}

function objectiveDone(session: LessonSessionState, id: string): boolean {
  const row = session.objectives.find((o) => o.spec.id === id);
  expect(row, `${id} is not in this session's chain`).toBeDefined();
  return row!.status === "done";
}

// ---------------------------------------------------------------------------
// 1 · The parse — authored only, loud when malformed, refused where it cannot
//     share a latch
// ---------------------------------------------------------------------------

function parsed(params: Record<string, unknown>): WitnessedReachZoneParams {
  const objective: LessonObjective = {
    id: "o1",
    titleBg: "Стигни края на отсечката отвъд прелеза",
    kind: "reachZone",
    params,
  };
  return parseObjectiveParams(objective) as WitnessedReachZoneParams;
}

describe("the rail demand is written, never inferred, and never shares a latch", () => {
  it("an authored `true` binds it", () => {
    expect(parsed({ kind: "reachZone", x: 4.06, y: 285, radiusM: 6, requireRailClear: true })
      .requireRailClear).toBe(true);
  });

  it("any other value is a loud spec error", () => {
    for (const bad of [false, "yes", 1, null]) {
      expect(() =>
        parsed({ kind: "reachZone", x: 4.06, y: 285, radiusM: 6, requireRailClear: bad }),
      ).toThrow(/requireRailClear/);
    }
  });

  it("NO TITLE MAY CONJURE IT — a banner alone leaves the disc exactly as shipped", () => {
    // 1,718 catalogue gates sit on districts with no track band at all; a
    // title-derived rail demand would be unspendable on every one of them, and
    // an unspendable demand is a lesson nobody can finish.
    expect(parsed({ kind: "reachZone", x: 4.06, y: 285, radiusM: 6 }).requireRailClear)
      .toBeUndefined();
  });

  it("it composes with the at-mark demands, because it never rides their latch", () => {
    // The opposite of `requireControllerProceed`, and the difference is the
    // whole design: this demand is a per-frame read of a session-monotone
    // ledger fact, so it is outside `capMet` and cannot collide with a cap, a
    // lamp or a gear demand on a single frame. Asserted rather than assumed —
    // if a later round moves it INTO the latch, this is where that shows up.
    const both = parsed({
      kind: "reachZone",
      x: 4.06,
      y: 285,
      radiusM: 6,
      maxSpeedKmh: 6,
      requireRailClear: true,
    });
    expect(both.requireRailClear).toBe(true);
    expect(both.maxSpeedKmh).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 2 · The census — the two guarded finish discs and nothing else
// ---------------------------------------------------------------------------

describe("the catalogue census", () => {
  it("binds exactly the two discs whose district ships a barrier timetable", () => {
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
        if (out.requireRailClear === true) bound.push(`${spec.id}/${o.id}`);
      }
    }
    expect(bound.sort()).toEqual([
      "sc-rx-barrier-drop/sc-rxd-finish",
      "sc-rx-guarded/sc-rxg-finish",
    ]);
  });

  it("the UNGUARDED drill is deliberately untouched — it has no arm to read", () => {
    // rx-unguarded-v1 carries no barrier, so `railBarred` is never set there and
    // the demand could only ever be earned or never spent by accident. Its duty
    // is the full stop, which `sc-rxu-finish` never claimed and the rule engine
    // grades as "no-stop".
    const finish = SC_RX_UNGUARDED.success.find((o) => o.id === "sc-rxu-finish")!;
    expect((finish.params as { requireRailClear?: true }).requireRailClear).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3 · sc-rx-guarded — the drill the row was filed on, on its own recordings
// ---------------------------------------------------------------------------

describe("sc-rx-guarded: the finish disc no longer certifies a barred crossing", () => {
  function drive(name: ScRxGuardedTraceName, level: 1 | 3 = 1): LessonSessionState {
    const lesson = compileScenario(SC_RX_GUARDED, level);
    let session = createLessonSession(lesson);
    recordScRxGuardedDrive(RX_GUARDED, name, {
      onTick: (tick) => {
        session = applyTick(session, tick).state;
      },
    });
    return session;
  }


  it("POSITIVE CONTROL: the shadow waits out the arm and still completes", () => {
    // The whole gate rests on this. If the correct drive stopped completing,
    // the demand would be a brick rather than a repair — the founder's worst
    // failure — and every refusal below would be meaningless.
    const s = drive("shadow-correct");
    expect(billedBarredEntry(s), "the shadow must not be billed at all").toBe(false);
    expect(objectiveDone(s, "sc-rxg-finish")).toBe(true);
  });

  it("REFUSED: «Навлизане при спуснати бариери» — the 30 км/ч blast-through", () => {
    const s = drive("mistake-run-barrier");
    expect(billedBarredEntry(s), "the demo must still be convicted").toBe(true);
    expect(objectiveDone(s, "sc-rxg-finish")).toBe(false);
  });

  it("REFUSED: «Промъкване покрай бариерата» — the polite stop, then the creep", () => {
    const s = drive("mistake-creep-barred");
    expect(billedBarredEntry(s)).toBe(true);
    expect(objectiveDone(s, "sc-rxg-finish")).toBe(false);
  });

  it("the WAIT rung keeps the answer it shipped with on all three", () => {
    // `sc-rxg-wait` carries a halt cap and no rail demand, so nothing about it
    // may move — and the answers it gives are not uniform, which is why they
    // are listed by name rather than asserted as „all true". The shadow and the
    // creep both come to a standstill at the line and bank it; the 30 км/ч
    // blast-through never stops and never has. A gate that started refusing the
    // shadow's wait, or that started granting the blast-through's, would mean
    // the crossing demand had leaked up the chain.
    const expected: Record<ScRxGuardedTraceName, boolean> = {
      "shadow-correct": true,
      "mistake-run-barrier": false,
      "mistake-creep-barred": true,
    };
    for (const [name, want] of Object.entries(expected) as [ScRxGuardedTraceName, boolean][]) {
      expect(objectiveDone(drive(name), "sc-rxg-wait"), name).toBe(want);
    }
  });

  it("the same answers at L3 — the aid ladder widens radii, not the demand", () => {
    expect(objectiveDone(drive("shadow-correct", 3), "sc-rxg-finish")).toBe(true);
    expect(objectiveDone(drive("mistake-creep-barred", 3), "sc-rxg-finish")).toBe(false);
  });

  it("A REFUSAL IS NOT A TRAP: the barred crossing still reaches its own debrief", () => {
    // `sc-rxg-finish` is the LAST objective, so the refusal would strand the
    // session without `railBarredVoidsObjective` — and the student would reach
    // the чл. 52 protocol that teaches him the fault only by quitting, which
    // costs the attempt its XP and its calibration.
    const s = drive("mistake-creep-barred");
    expect(objectiveDone(s, "sc-rxg-finish"), "the certificate must stay refused").toBe(false);
    expect(s.phase, "the drive must still be able to end").toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// 4 · sc-rx-barrier-drop — the same unpaid half, measured on its own drives
// ---------------------------------------------------------------------------

describe("sc-rx-barrier-drop: the race under the descending arm loses its tick", () => {
  function drive(name: ScRxBarrierDropTraceName): LessonSessionState {
    const lesson = compileScenario(SC_RX_BARRIER_DROP, 1);
    let session = createLessonSession(lesson);
    recordScRxBarrierDropDrive(RX_DROP, name, {
      onTick: (tick) => {
        session = applyTick(session, tick).state;
      },
    });
    return session;
  }

  it("POSITIVE CONTROL: the shadow still completes", () => {
    const s = drive("shadow-correct");
    expect(billedBarredEntry(s)).toBe(false);
    expect(objectiveDone(s, "sc-rxd-finish")).toBe(true);
  });

  it("REFUSED: «mistake-dive-barrier» — billed entered-barred, tick withdrawn", () => {
    // templates-rail.ts measured this one completing the disc at t = 42.1 s
    // „while the barrier is still down ([20, 60)) and has never lifted".
    const s = drive("mistake-dive-barrier");
    expect(billedBarredEntry(s)).toBe(true);
    expect(objectiveDone(s, "sc-rxd-finish")).toBe(false);
  });

  it("A DEMO THIS DEMAND DOES NOT OWN KEEPS ITS ANSWER — «mistake-stop-on-track»", () => {
    // Resting on the rails is a different act with a different grader
    // ("stopped-on-track"). Whether that drive completes the disc is not this
    // demand's business, and the assertion is written to record which answer
    // the gate gives rather than to make the gate give one: what matters is
    // that the demand did not silently absorb a second offence.
    const s = drive("mistake-stop-on-track");
    expect(
      s.events.some(
        (e) =>
          e.kind === "violation" &&
          e.code === "RAIL_CROSSING_VIOLATION" &&
          e.detail === "stopped-on-track",
      ),
    ).toBe(true);
    expect(billedBarredEntry(s), "this demo is not a barred entry").toBe(false);
  });
});
