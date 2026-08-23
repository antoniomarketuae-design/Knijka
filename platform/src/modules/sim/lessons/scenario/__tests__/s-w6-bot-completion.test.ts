/**
 * Wave-6 bot-completion proofs (doc 76 §10; the s-batch2 / s-w1..s-w5 mold) —
 * each NEW template of the wave driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization →
 *   gradeFinishWire RECOMPILES from the id and regrades → scoreRubric.
 *
 * One describe block per template; the wave's agents APPEND to this file (add
 * an import + a block, never edit a neighbour's).
 *
 * NOTE for the integration pass: the gradeFinishWire round-trip resolves the
 * lesson id through the templates.ts registry, so each block's wire test goes
 * green only once that template's family file is spread into SCENARIO_TEMPLATES
 * (the main session owns that edit).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScEdD2StopAddressDrive } from "../../../traces/scEdD2StopAddress";
import { recordScHzBrakeDontSwerveDrive } from "../../../traces/scHzBrakeDontSwerve";
import { recordScLnBoulevardDisciplineDrive } from "../../../traces/scLnBoulevardDiscipline";
import { recordScMergeMotorwayExitDrive } from "../../../traces/scMergeMotorwayExit";
import { recordScMvUturnBanDrive } from "../../../traces/scMvUturnBan";
import { recordScRbPedExitDrive } from "../../../traces/scRbPedExit";
import { recordScSigControllerLiveDrive } from "../../../traces/scSigControllerLive";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_ED_D2_STOP_ADDRESS } from "../templates-exam";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../templates-hazards2";
import { SC_LN_BOULEVARD_DISCIPLINE } from "../templates-lanes2";
import { SC_MERGE_MOTORWAY_EXIT } from "../templates-merging2";
import { SC_MV_UTURN_BAN } from "../templates-parking2";
import { SC_RB_PED_EXIT } from "../templates-roundabout2";
import { SC_SIG_CONTROLLER_LIVE } from "../templates-signals2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

// ---------------------------------------------------------------------------
// sc-sig-controller-live — the drill is won by CROSSING A RED: the officer's
//                          permission is the signal, and the lamp is scenery
//                          (ЗДвП чл. 7, from the side drivers refuse)
// ---------------------------------------------------------------------------

describe("wave-6 bot completion — sc-sig-controller-live at L3", () => {
  const lesson = compileScenario(SC_SIG_CONTROLLER_LIVE, 3);
  let session = createLessonSession(lesson);
  recordScSigControllerLiveDrive(loadDistrict("sx-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_SIG_CONTROLLER_LIVE.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the run is passed BECAUSE it crossed a red", () => {
    // The trace gate proves the recorder's own engine acquits the red crossing;
    // this proves the student-facing session agrees — and that the drill's
    // central claim is not narration but the completion condition. sc-sctl-cross
    // carries requireRedMet, so the ONLY way this sheet reads „passed, 3★" is a
    // crossing the lamp forbade and the officer allowed.
    const cross = result.objectives.find((o) => o.id === "sc-sctl-cross")!;
    expect(cross.done).toBe(true);
    expect(cross.detail).toMatchObject({ kind: "passSignal", redMetHere: true });
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("RED_LIGHT_CROSSED");
    expect(codes).not.toContain("CONTROLLER_SIGNAL_VIOLATED");
  });

  it("carries the officer into the live lesson — the authority is staged, not narrated", () => {
    // Drop him and the student meets a plain red light on an ordinary X: the
    // cluster reverts to mode "live", the crossing carries no permission, and
    // the drill inverts into „run a red light" — the single most dangerous
    // possible failure of this template. The timetable dials are the lesson.
    const officer = (lesson.stagedEvents ?? []).find((s) => s.id === "sc-sctl-officer");
    expect(officer).toBeDefined();
    expect(officer!.kind).toBe("trafficController");
    if (officer!.kind !== "trafficController") return;
    // The INVERSION against sc-signal-controller (haltedGroup "ns", flip 30):
    // this officer halts the CROSS axis first, so the player is permitted from
    // t = 0 and halted from t = 26 — the drill's whole difference.
    expect(officer!.haltedGroup).toBe("ew");
    expect(officer!.flipAtSec).toBe(26);
    expect(officer!.signalOffsetSec).toBe(23);
    // Graded on SHIPPED rules alone: no dial is opted in anywhere. чл. 7 lives
    // in the reducer's stopLineCrossed handler, default-on for everyone.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
    // NO signalPlan: an approach-relative rebase would desync the pinned lamp
    // window from the SESSION-time permission flip and dissolve the lesson.
    expect(lesson.signalPlan).toBeUndefined();
  });

  it("the drill runs in the taught order: read the officer, cross, exit", () => {
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-sctl-read", "sc-sctl-cross", "sc-sctl-exit"]) {
      expect(at(id).done, id).toBe(true);
    }
    // The order IS the teaching, and objectives advance sequentially: the
    // slow-approach gate (maxSpeedKmh 20, 6 m short of the paint) has to be
    // cleared before the crossing counts — a driver who read the officer at
    // 40 km/h did not read him.
    expect(at("sc-sctl-read").completedAtSec!).toBeLessThan(at("sc-sctl-cross").completedAtSec!);
    expect(at("sc-sctl-cross").completedAtSec!).toBeLessThan(at("sc-sctl-exit").completedAtSec!);
  });

  it("the LIVE session bills no phantom for waiting-free obedience", () => {
    // Where a sloppy tune would surface: the car rolls over a stop line whose
    // lamp is red at 22 km/h, having slowed to 12 six metres before it. Every
    // signal detector is watching, and the surfaced state is „red" the whole
    // approach — so a missing permission ANYWHERE in the chain lands here.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "RED_LIGHT_CROSSED",
      "RED_YELLOW_CROSSED",
      "YELLOW_LIGHT_NOT_STOPPED",
      "STOP_LINE_OVERSHOOT",
      "HESITATION_AT_GREEN",
      "HARSH_BRAKING_NO_CAUSE",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-sig-controller-live@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-sig-controller-live@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: waiting for green is SCORED 10 (опасна, never a modal) — and the чл. 7 crossing is NOT certified", () => {
    // CONTROLLER_SIGNAL_VIOLATED is опасна, so it is SCORED with a
    // non-blocking toast rather than pausing into a teach card — a dangerous
    // code must never pop a modal mid-junction. So it lands on session.events
    // and the A9 teach channel stays empty.
    //
    // ── THIS ASSERTION USED TO READ `completedAll === true`, 2026-08-17 ──────
    // Its argument was that the student drove the route faultlessly and failed
    // only on authority, so „a drill that failed him on geometry instead would
    // let a student believe чл. 7 is about where the car went". The staging
    // sweep showed what that produced on the actual screen:
    //
    //   ✓ «Премини стоп-линията ПО РАЗРЕШЕНИЕ НА РЕГУЛИРОВЧИКА — въпреки
    //      червената лампа» 1:27 · «Изчака червения сигнал и потегли на зелено»
    //   ✗ «Неизпълнение на сигнала на регулировчика −10 · ОПАСНА ГРЕШКА»
    //
    // The tick is not geometry — the objective's own title certifies a
    // PERMISSION, and this student had none; the subtitle then narrates a wait
    // that никога did not happen. templates-signals2.ts calls `requireRedMet`
    // here „the drill's thesis made gradable" and promises in writing that
    // „ignore the officer and drive through on your own authority and you
    // complete nothing"; the evaluator was reading the LAMP and handing the
    // certificate to the very drive this file records as the mistake demo.
    //
    // So the counter-proof is now the sharper one: he fails, he is scored, he
    // is told which authority he broke — and the sheet does not also hand him a
    // green tick saying he crossed by the officer's leave. Everything else here
    // is unchanged, including the single code and the one star.
    let s = createLessonSession(compileScenario(SC_SIG_CONTROLLER_LIVE, 3));
    const taught: string[] = [];
    recordScSigControllerLiveDrive(loadDistrict("sx-v1"), "mistake-wait-for-green", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual([]);
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual([
      "CONTROLLER_SIGNAL_VIOLATED",
    ]);
    expect(r.completedAll).toBe(false);
    // …and it is the CROSSING gate that refuses, by name — not the approach and
    // not the exit. A student who is told „не изпълни задачата" must be able to
    // point at which one, and it must be the one about the officer.
    const byId = new Map(r.objectives.map((o) => [o.id, o.done]));
    expect(byId.get("sc-sctl-read")).toBe(true);
    expect(byId.get("sc-sctl-cross")).toBe(false);
    expect(r.score).toBe(10);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_SIG_CONTROLLER_LIVE.rubric!).stars).toBe(1);
  });

  it("counter-proof: refusing the wave then creeping over on RED is still the OFFICER's code", () => {
    // The mirror of the demo above, and the reason both exist. This driver
    // crossed a red light — under any other template that is RED_LIGHT_CROSSED.
    // Here the permission has replaced the lamp grading in BOTH directions, so
    // his sheet names the officer and never mentions the lamp. If the two codes
    // ever co-occurred, the card would teach „не минавай на червено" — the exact
    // reflex this template exists to override.
    let s = createLessonSession(compileScenario(SC_SIG_CONTROLLER_LIVE, 3));
    recordScSigControllerLiveDrive(loadDistrict("sx-v1"), "mistake-refuse-then-creep", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    expect(codes).not.toContain("RED_LIGHT_CROSSED");
    expect(r.passed).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start and the officer rides them all", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_SIG_CONTROLLER_LIVE, level).id).toBe(
        `sc-sig-controller-live@L${level}`,
      );
    }
    expect(compileScenario(SC_SIG_CONTROLLER_LIVE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_SIG_CONTROLLER_LIVE, 4).examMode).toBe(true);
    // No L5 by design (the backlog's own rung list): the difficulty axis here is
    // the CLOCK, and rain/night would only add a grip-and-visibility story the
    // dry-tuned ghost cannot honour (ADR-006 stage 4a).
    expect(SC_SIG_CONTROLLER_LIVE.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    // The officer is the drill's spine, not an L5 complication — without him
    // every rung would teach „run the red light".
    for (const level of [1, 2, 3, 4] as const) {
      expect(
        compileScenario(SC_SIG_CONTROLLER_LIVE, level).stagedEvents?.map((e) => e.kind),
        `L${level}`,
      ).toEqual(["trafficController"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-rb-ped-exit — the roundabout exit is a RIGHT TURN INTO A STREET, and that
//                  street's zebra carries чл. 119 (ЗДвП чл. 50, ал. 1 + чл. 119, ал. 1).
//                  The drill is won in a 7.94 m pocket between ring and paint.
// ---------------------------------------------------------------------------

describe("wave-6 bot completion — sc-rb-ped-exit at L3", () => {
  const lesson = compileScenario(SC_RB_PED_EXIT, 3);
  let session = createLessonSession(lesson);
  recordScRbPedExitDrive(loadDistrict("rb-ped-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_RB_PED_EXIT.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the run is passed BECAUSE it stopped in the pocket", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this
    // proves the student-facing session agrees, and that the pocket is a GATE
    // rather than narration. sc-rbp-pocket is a reachZone centred on the
    // pocket's middle (4.06, 26) with an authored radiusM of 2.4 (it read 3.6
    // when this comment was written; sweep 161 retuned it so the L1 ladder's
    // ×1.5 lands back on 3.6 instead of spilling to 5.4 — see the row in
    // templates-roundabout2.ts) plus acceptBeforeMarkM −4 and maxSpeedKmh 6 —
    // it cannot
    // be satisfied from inside the ring band NOR from beyond the zebra, so the
    // only way this sheet reads „passed, 3★" is a car that actually stopped
    // between the circulatory carriageway and the paint.
    const pocket = result.objectives.find((o) => o.id === "sc-rbp-pocket")!;
    expect(pocket.done).toBe(true);
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("PEDESTRIAN_NOT_YIELDED");
    expect(codes).not.toContain("FAILED_TO_YIELD");
  });

  it("the drill runs in the taught order: pass the first exit, stop in the pocket, then leave", () => {
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-rbp-past-east", "sc-rbp-pocket", "sc-rbp-exit"]) {
      expect(at(id).done, id).toBe(true);
    }
    // The order IS the teaching: you cannot reach the pocket before passing the
    // first exit, and the roundabout traversal only closes once you are OUT —
    // past the crossing you waited at.
    expect(at("sc-rbp-past-east").completedAtSec!).toBeLessThan(at("sc-rbp-pocket").completedAtSec!);
    expect(at("sc-rbp-pocket").completedAtSec!).toBeLessThan(at("sc-rbp-exit").completedAtSec!);
  });

  it("carries BOTH staged actors into the live lesson — the attention tax and the person", () => {
    // Either one alone is a different, easier drill: without the circulating car
    // the crosser is trivially obvious (no attention tunnel — the whole RB-05
    // archetype); without the crosser this is just sc-rb-exit-signal again.
    const staged = lesson.stagedEvents ?? [];
    expect(staged.map((s) => s.kind).sort()).toEqual(["pedestrianDartOut", "roundaboutEntry"]);
    const crosser = staged.find((s) => s.id === "sc-rbp-crosser");
    expect(crosser).toBeDefined();
    if (crosser!.kind !== "pedestrianDartOut") return;
    // The zebra she walks is the district's declared primary crossing, and the
    // release dial is the one the ring geometry forces (see the template note).
    expect(crosser!.crossingId).toBe("rbp-x-n");
    expect(crosser!.crossing).toEqual({ x: 0, y: 30 });
    expect(crosser!.triggerDistM).toBe(30);
    // Graded on SHIPPED rules alone: no dial is opted in anywhere. чл. 119 lives
    // in the reducer's crossingPassed handler, default-on for everyone.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the pocket stop itself", () => {
    // Where a sloppy tune would surface: the car brakes from ring pace to a dead
    // stop a few metres off a junction, sits still ~9 s, then pulls away across
    // a crossing. Every stop-shaped detector is watching.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "HARSH_BRAKING_NO_CAUSE",
      "HESITATION_AT_GREEN",
      "PEDESTRIAN_CROSSING_TOO_FAST",
      "TURN_WITHOUT_INDICATOR",
      "POOR_LANE_KEEPING",
      "COLLISION",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  it("counter-proof: the signalled exit driven over the occupied zebra is SCORED — on a sheet that otherwise looks perfect", () => {
    // The template's sharpest claim: this student yielded at entry, circulated
    // cleanly and signalled the exit correctly — every „roundabout" box ticked.
    // He still fails, because the exit is a turn into a street and someone was
    // on its crossing. A drill that failed him on ring form instead would let a
    // student believe RB-05 is about the ring.
    let s = createLessonSession(compileScenario(SC_RB_PED_EXIT, 3));
    recordScRbPedExitDrive(loadDistrict("rb-ped-v1"), "mistake-exit-through-ped", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toEqual(["PEDESTRIAN_NOT_YIELDED"]);
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR"); // the lever WAS used
    expect(r.passed).toBe(false);
    // The pocket gate is what he skipped: he drove through it at ring pace.
    expect(r.objectives.find((o) => o.id === "sc-rbp-pocket")!.done).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 adds rain + a second, RUNNING crosser", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_RB_PED_EXIT, level).id).toBe(`sc-rb-ped-exit@L${level}`);
    }
    expect(compileScenario(SC_RB_PED_EXIT, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_RB_PED_EXIT, 4).examMode).toBe(true);
    expect(SC_RB_PED_EXIT.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    // Both staged actors ride every rung — they are the drill, not decoration.
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_RB_PED_EXIT, level).stagedEvents, `L${level}`).toHaveLength(2);
    }
    // L5: rain + a THIRD actor — a second person on the SAME zebra who runs.
    // LevelSpec offers stagedAdd only (no replace), and traffic/system.ts counts
    // occupancy per crossing, so the paint reads OCCUPIED until the LAST of them
    // is clear: the driver who waits for the one he saw and then moves off into
    // the one he did not is the exact real-world killing at crossings.
    const l5 = compileScenario(SC_RB_PED_EXIT, 5);
    expect(l5.environment?.rain).toBe(true);
    expect(l5.stagedEvents).toHaveLength(3);
    const sprint = (l5.stagedEvents ?? []).find((s) => s.id === "sc-rbp-crosser-sprint");
    expect(sprint).toBeDefined();
    if (sprint!.kind !== "pedestrianDartOut") return;
    expect(sprint!.crossingId).toBe("rbp-x-n"); // the same paint as the walker
    expect(sprint!.speedMps).toBeGreaterThan(2);
    // Physics stays DRY at L5 (ADR-006 opt-in): the ghost envelope is dry-tuned.
    expect(l5.physics).toBeUndefined();
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-rb-ped-exit@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-rb-ped-exit@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-ln-boulevard-discipline — the drill is won by COMING BACK: чл. 15 is not
//                              „stay right", it is „go left for a reason and
//                              return", and only a map with a slow car in the
//                              curb lane can ask the second half of that
// ---------------------------------------------------------------------------

describe("wave-6 bot completion — sc-ln-boulevard-discipline at L3", () => {
  const lesson = compileScenario(SC_LN_BOULEVARD_DISCIPLINE, 3);
  let session = createLessonSession(lesson);
  recordScLnBoulevardDisciplineDrive(loadDistrict("wb-boulevard-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_LN_BOULEVARD_DISCIPLINE.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the sheet is passed BECAUSE the car left AND returned", () => {
    // The three gates are one sentence of чл. 15 each, and they are lane-
    // EXCLUSIVE by construction (radius 4 < the 8.125 m lane pitch), so none of
    // them can be satisfied by narration. Right → left → right, in that order:
    // a driver who never used lane 1 misses the middle gate; a driver who never
    // came home misses the last one. That ordering IS the лентова дисциплина.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-lnbd-right", "sc-lnbd-pass", "sc-lnbd-home"]) {
      expect(at(id).done, id).toBe(true);
    }
    expect(at("sc-lnbd-right").completedAtSec!).toBeLessThan(at("sc-lnbd-pass").completedAtSec!);
    expect(at("sc-lnbd-pass").completedAtSec!).toBeLessThan(at("sc-lnbd-home").completedAtSec!);
  });

  it("carries the crawler into the live lesson — the reason for lane 1 is staged, not narrated", () => {
    // Drop it and the student meets an empty boulevard: there is nothing to
    // overtake, the middle gate becomes „drive in the left lane for no reason"
    // — the exact habit this template convicts — and the drill inverts into its
    // own mistake demo. The slow car IS the lesson's premise.
    const crawler = (lesson.stagedEvents ?? []).find((s) => s.id === "sc-lnbd-crawler");
    expect(crawler).toBeDefined();
    // The house mold for deterministic slow traffic (its slam tier is authored
    // out of reach — see the template header); NOT a braking drill.
    expect(crawler!.kind).toBe("brakingLeadCar");
    // Graded on SHIPPED rules alone: чл. 15 lives in the keep-right detector,
    // default-on for everyone, and the ghosts are dry-tuned (ADR-006 stage 4a).
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the legitimate pass", () => {
    // Where a sloppy tune would surface. Every detector this drill can anger is
    // watching the same 20 seconds: the car spends ~7 s in laneId 1 (the
    // keep-right clock runs the moment the left signal cancels), crosses the
    // lane boundary twice at ~38 km/h, and closes on a 20 km/h crawler in its
    // own lane on the way in. An honest overtake must cost NOTHING.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "NOT_KEEPING_RIGHT",
      "LANE_CHANGE_WITHOUT_INDICATOR",
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
      "POOR_LANE_KEEPING",
      "CENTER_LINE_TOUCHED",
      "FOLLOWING_TOO_CLOSE",
      "SPEEDING_OVER_LIMIT",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ln-boulevard-discipline@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ln-boulevard-discipline@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the left-lane hog TEACHES чл. 15 — and reaches no homecoming gate", () => {
    // The template's sharpest claim, made checkable on the student path. This
    // driver's pull-out is the shadow's, verbatim: mirror, signal, glide — so he
    // earns the SAME SAFE_LANE_CHANGE commendation and even clears the middle
    // gate. The route was never the problem; the STAY was. NOT_KEEPING_RIGHT is
    // второстепенна, so the first encounter PAUSES with a card instead of merely
    // docking points (teach-first, doc 76 §0), and the sheet still fails on the
    // gate he never reached — the homecoming.
    let s = createLessonSession(compileScenario(SC_LN_BOULEVARD_DISCIPLINE, 3));
    const taught: string[] = [];
    recordScLnBoulevardDisciplineDrive(loadDistrict("wb-boulevard-v1"), "mistake-left-lane-hog", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toContain("NOT_KEEPING_RIGHT");
    expect(r.objectives.find((o) => o.id === "sc-lnbd-home")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: the weave TEACHES the indicator — and completes NOTHING either", () => {
    // The mirror image of the demo above, and the reason both exist. This driver
    // never hogs anything — he is in the right lane about as often as the shadow
    // is — and he is still wrong, because a lane you do not announce and do not
    // hold is not a lane you are in. The §9 exact-code assert lives on the trace
    // gate; here the point is that no gate forgives him either: he wanders
    // through both lane centres without ever settling, and never comes home.
    let s = createLessonSession(compileScenario(SC_LN_BOULEVARD_DISCIPLINE, 3));
    const taught: string[] = [];
    recordScLnBoulevardDisciplineDrive(loadDistrict("wb-boulevard-v1"), "mistake-weaving", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(r.objectives.find((o) => o.id === "sc-lnbd-home")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start and the crawler rides them all", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_LN_BOULEVARD_DISCIPLINE, level).id).toBe(
        `sc-ln-boulevard-discipline@L${level}`,
      );
    }
    expect(compileScenario(SC_LN_BOULEVARD_DISCIPLINE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_LN_BOULEVARD_DISCIPLINE, 4).examMode).toBe(true);
    // No L5 by design (the backlog's own rung list): this boulevard is 200 m of
    // dry urban asphalt and the difficulty axis is DISCIPLINE, not grip — rain
    // or night would add a story the dry-tuned ghosts cannot honour.
    expect(SC_LN_BOULEVARD_DISCIPLINE.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    for (const level of [1, 2, 3, 4] as const) {
      expect(
        compileScenario(SC_LN_BOULEVARD_DISCIPLINE, level).stagedEvents?.map((e) => e.kind),
        `L${level}`,
      ).toEqual(["brakingLeadCar"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-hz-brake-dont-swerve — the drill is won by NOT STEERING: the metre of
//                           tarmac the reflex reaches for is already occupied,
//                           and the driver does not know it because he never
//                           looked (ЗДвП чл. 20 + чл. 25). Stopping is not the
//                           claim; stopping WHERE YOU WERE is.
// ---------------------------------------------------------------------------

describe("wave-6 bot completion — sc-hz-brake-dont-swerve at L3", () => {
  const lesson = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 3);
  let session = createLessonSession(lesson);
  recordScHzBrakeDontSwerveDrive(loadDistrict("hz-debris-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: both objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_HZ_BRAKE_DONT_SWERVE.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the gate is LANE-EXCLUSIVE, so it cannot be passed by swerving", () => {
    // The trace gate proves the recorder's engine sees a clean drive; this
    // proves the student-facing session agrees — and that „в лентата" is a GATE
    // rather than narration. sc-hzbds-stop is a reachZone on the PLAYER's lane
    // centre with radiusM 4 — less than half the 8.125 m lane pitch — and
    // maxSpeedKmh 6. So it is unsatisfiable from the escort's lane AND
    // unsatisfiable in motion: the only way this sheet reads „passed, 3★" is a
    // car that came to a real stop in the lane it started in. A driver who
    // dodged the debris perfectly and stopped over there fails this drill, which
    // is exactly the лекция.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    expect(at("sc-hzbds-stop").done).toBe(true);
    expect(at("sc-hzbds-approach").done).toBe(true);
    // The order IS the teaching: the lawful approach gate (maxSpeedKmh 52) has
    // to be cleared before the stop counts — a stop from a crawl teaches nothing.
    expect(at("sc-hzbds-approach").completedAtSec!).toBeLessThan(at("sc-hzbds-stop").completedAtSec!);
  });

  it("carries the escort into the live lesson — the reason not to steer is staged, not narrated", () => {
    // Drop it and the student meets debris on an empty two-lane street: the
    // swerve becomes the CORRECT answer (it is faster and it works), and the
    // drill inverts into teaching the exact reflex it exists to kill. The car
    // abreast IS the lesson's premise.
    const escort = (lesson.stagedEvents ?? []).find((s) => s.id === "sc-hzbds-escort");
    expect(escort).toBeDefined();
    expect(escort!.kind).toBe("cutInLeadCar");
    if (escort!.kind !== "cutInLeadCar") return;
    // The two dials that make a cut-in actor an ESCORT instead of a cutter —
    // if either drifts, the drill becomes a different (already shipped) lesson:
    //  - it rides the NEIGHBOURING lane (one full pitch left of the player);
    //  - cutShiftM ZERO: it NEVER enters the player's lane. A non-zero shift
    //    would turn this into sc-follow-cutin with debris in it.
    expect(escort!.actor.extraRightOffsetM).toBeCloseTo(-8.125, 3);
    expect(escort!.cutShiftM).toBe(0);
    // Pinned abreast — the whole point is that it is beside your door, not ahead.
    expect(escort!.paceAheadM).toBeLessThanOrEqual(2);
  });

  it("the ruleConfig override REACHES the live lesson — the student is graded like the ghost", () => {
    // THE correctness assertion of this template. The override is not a
    // convenience: hz-debris-v1 has no crossing, no junction and no stop line,
    // and the escort sits 8.125 m off the driving line — outside leadGapFor's
    // 4 m corridor — so the engine's harsh-brake cause ledger is EMPTY by
    // construction and a full-force stop reads as „рязко спиране без причина".
    // The trace gate proves the RECORDER's grader is disarmed; without this
    // propagation the LIVE student would be billed 10 points (основна) for
    // doing exactly what instruction 4 orders. compileScenario must carry it.
    expect(lesson.ruleConfig).toEqual({ harshBrakeDecelMps2: 25 });
    // …and nothing else is opted in: the lane-change and contact channels that
    // grade both mistake demos stay entirely stock.
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the taught stop itself", () => {
    // Where a sloppy tune would surface: the car goes from the posted 50 to a
    // dead stop at ~9 m/s² in 24 m and then sits still for ~6 s, on a street
    // with nothing on it to justify any of that. Every stop-shaped detector is
    // watching, and the drill ORDERS the behaviour they hunt.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "HARSH_BRAKING_NO_CAUSE",
      "POOR_LANE_KEEPING",
      "NOT_KEEPING_RIGHT",
      "LANE_CHANGE_WITHOUT_INDICATOR",
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
      "SPEEDING_OVER_LIMIT",
      "COLLISION",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  it("counter-proof: the blind swerve TEACHES the mirror — and never reaches the in-lane gate", () => {
    // The template's sharpest claim, made checkable on the student path. This
    // driver MISSED THE DEBRIS — his avoidance worked perfectly, which is why
    // the reflex is so seductive — and he still fails, because the lane he took
    // was not his and he never looked to find out. The route was never the
    // problem; the LOOK was. LANE_CHANGE_WITHOUT_MIRROR_CHECK is основна, so
    // the first encounter pauses with a teach card (teach-first, doc 76 §0)
    // while the опасна COLLISION is scored on the sheet.
    let s = createLessonSession(compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 3));
    const taught: string[] = [];
    recordScHzBrakeDontSwerveDrive(loadDistrict("hz-debris-v1"), "mistake-blind-swerve", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    // The in-lane stop gate is what he skipped — he stopped, but in lane 1.
    expect(r.objectives.find((o) => o.id === "sc-hzbds-stop")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: the late brake fails on the SAME gate, by the opposite fault", () => {
    // The mirror image, and the reason both demos exist. This driver did
    // everything the card asks about the WHEEL — dead-straight line, own lane,
    // lawful speed — and still fails, because the foot was late. Together the
    // two demos fence the lesson in from both sides: the wheel is not the
    // answer, AND the pedal is only an answer if it moves NOW.
    let s = createLessonSession(compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 3));
    recordScHzBrakeDontSwerveDrive(loadDistrict("hz-debris-v1"), "mistake-late-brake", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("COLLISION");
    // He never left his lane — the fault is timing alone, and the sheet says so.
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(r.objectives.find((o) => o.id === "sc-hzbds-stop")!.done).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 adds rain (and stays DRY underfoot)", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level).id).toBe(
        `sc-hz-brake-dont-swerve@L${level}`,
      );
    }
    expect(compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 4).examMode).toBe(true);
    expect(SC_HZ_BRAKE_DONT_SWERVE.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    const l5 = compileScenario(SC_HZ_BRAKE_DONT_SWERVE, 5);
    expect(l5.environment?.rain).toBe(true);
    // Physics stays DRY at L5 (ADR-006 stage 4a — `physics` is template-wide, so
    // opting in would run L1–L4 wet against a dry-tuned ghost). On THIS drill
    // that is not cosmetic: gen_hz_debris.mjs sizes the map so a 10.68 m DRY
    // stop fits the 30 m reveal window, and a wet envelope would put the shadow
    // into the debris. The rung is rain you can SEE, not grip you can feel.
    expect(l5.physics).toBeUndefined();
    // The escort rides every rung — it is the drill's premise, not a garnish.
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(
        compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level).stagedEvents?.map((e) => e.kind),
        `L${level}`,
      ).toEqual(["cutInLeadCar"]);
    }
    // …and the override rides every rung too: a rung that lost it would bill
    // the taught behaviour.
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level).ruleConfig, `L${level}`).toEqual({
        harshBrakeDecelMps2: 25,
      });
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-hz-brake-dont-swerve@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-hz-brake-dont-swerve@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-merge-motorway-exit — the drill is won by WHERE the speed falls: the
//                          лента за намаляване is entered WITH the flow and the
//                          whole 130 → 60 happens inside it. Braking earlier
//                          hurts the car behind you; braking later hurts you in
//                          the bend (ЗДвП чл. 55 + чл. 58 + чл. 20, ал. 2).
// ---------------------------------------------------------------------------

describe("wave-6 bot completion — sc-merge-motorway-exit at L3", () => {
  const lesson = compileScenario(SC_MERGE_MOTORWAY_EXIT, 3);
  let session = createLessonSession(lesson);
  recordScMergeMotorwayExitDrive(loadDistrict("mw-exit-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_MERGE_MOTORWAY_EXIT.rubric!).stars).toBe(3);
  });

  it("THE POINT, on the STUDENT path: the gates are LANE-EXCLUSIVE, so the exit cannot be narrated", () => {
    // Each gate is one sentence of чл. 55, and radius 4 < the 8.125 m lane
    // pitch makes every one of them unsatisfiable from a neighbouring lane:
    // sc-mwx-keep-right can only be reached from the travel lane deep on the
    // approach (престрояване НАВРЕМЕ), sc-mwx-decel-lane only from the curb
    // lane 60 m short of the gore (a driver who never moved over misses it),
    // and sc-mwx-ramp only from the ramp's own tail. Right → deceleration lane
    // → ramp, in that order: that ordering IS the изход.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-mwx-keep-right", "sc-mwx-decel-lane", "sc-mwx-ramp"]) {
      expect(at(id).done, id).toBe(true);
    }
    expect(at("sc-mwx-keep-right").completedAtSec!).toBeLessThan(at("sc-mwx-decel-lane").completedAtSec!);
    expect(at("sc-mwx-decel-lane").completedAtSec!).toBeLessThan(at("sc-mwx-ramp").completedAtSec!);
  });

  it("carries the rear car into the live lesson — the reason not to brake early is staged, not narrated", () => {
    // Drop it and the student meets an empty motorway: a slam at 130 with
    // nothing behind reads as harmless, the основна demo becomes a curiosity,
    // and the drill loses the half of чл. 55 that is about someone else. The
    // car ~31 m off your bumper at 130 IS the lesson's premise.
    const rear = (lesson.stagedEvents ?? []).find((s) => s.id === "sc-mwx-rear-car");
    expect(rear).toBeDefined();
    expect(rear!.kind).toBe("rearTailgater");
    if (rear!.kind !== "rearTailgater") return;
    // It rides the player's OWN travel lane (one pitch left of the graph's
    // curb-lane path) — behind you, not beside you — and passes on the LEFT,
    // never through you.
    expect(rear!.actor.extraRightOffsetM).toBeCloseTo(-8.13, 3);
    expect(rear!.passShiftM).toBeCloseTo(-8.125, 3);
    // Graded on SHIPPED rules alone: no dial is opted in anywhere. The exit's
    // two faults live in the harsh-brake ledger and the curveAdvisory span —
    // both default-on for everyone, both fed by the map's own data.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the LIVE session bills no phantom for the taught deceleration itself", () => {
    // Where a sloppy tune would surface: the car sheds 130 → 60 at ~4,6 m/s²
    // in the CURB lane of a motorway, having crossed into it at full flow
    // speed, and then holds 60 on a връзка. Every motorway detector is
    // watching, and the drill ORDERS all three behaviours.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    for (const c of [
      "EMERGENCY_LANE_DRIVING",
      "NOT_KEEPING_RIGHT",
      "DRIVING_TOO_SLOW_FOR_MOTORWAY",
      "HARSH_BRAKING_NO_CAUSE",
      "SPEED_TOO_FAST_FOR_CURVE",
      "LANE_CHANGE_WITHOUT_INDICATOR",
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
      "POOR_LANE_KEEPING",
      "SPEEDING_OVER_LIMIT",
    ]) {
      expect(codes).not.toContain(c);
    }
  });

  /** Replay a demo through a LIVE session at one rung, splitting the coach's
   *  two channels: what it TAUGHT (first-encounter pause card) vs what it
   *  SCORED (session.events → the sheet). */
  const replay = (name: Parameters<typeof recordScMergeMotorwayExitDrive>[1], level: 3 | 4) => {
    let s = createLessonSession(compileScenario(SC_MERGE_MOTORWAY_EXIT, level));
    const taught: string[] = [];
    recordScMergeMotorwayExitDrive(loadDistrict("mw-exit-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const result_ = buildLessonResult(s);
    return { taught, scored: s.events.filter((e) => e.kind === "violation").map((e) => e.code), r: result_ };
  };

  it("counter-proof: the slam on the carriageway TEACHES at L3 and is SCORED at L4 — on a sheet that COMPLETES either way", () => {
    // The template's sharpest claim. This student took the exit correctly in
    // every geometric sense — right lane, deceleration lane, ramp at 60, all
    // three gates green — and he is still wrong, because he put the braking in
    // the wrong PLACE. A drill that failed him on the ROUTE instead would let a
    // student believe чл. 55 is about where the car went; this one has to fail
    // him on the sheet while the route stays perfect, or it teaches nothing.
    const l3 = replay("mistake-brake-on-carriageway", 3);
    // HARSH_BRAKING_NO_CAUSE is основна: the FIRST encounter pauses with a card
    // and costs no points (teach-first, doc 76 §0) — so the L3 sheet is clean
    // and the lesson is delivered by the card, not by the score.
    expect(l3.taught).toContain("HARSH_BRAKING_NO_CAUSE");
    expect(l3.scored).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(l3.r.score).toBe(0);
    expect(l3.r.completedAll).toBe(true); // the route was never the problem
    // …and at the EXAM rung the coach stops teaching and starts billing the
    // identical drive. Both halves of teach-first-then-grade on one recording.
    const l4 = replay("mistake-brake-on-carriageway", 4);
    expect(l4.taught).toEqual([]);
    expect(l4.scored.filter((c) => c === "HARSH_BRAKING_NO_CAUSE")).toHaveLength(1);
    expect(l4.scored).not.toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(l4.r.completedAll).toBe(true);
    // The OFFICIAL truth, not a wish: one основна is 3 of the 9-point budget
    // (Наредба-38, rules/scoring.ts) — this sheet is still PASSED. The rubric
    // is where the cost lands: any penalty point caps quality at 2★. A drill
    // that claimed a single early brake fails the exam would be teaching the
    // student a law that does not exist.
    expect(l4.r.score).toBe(3);
    expect(l4.r.passed).toBe(true);
    expect(scoreRubric(l4.r, SC_MERGE_MOTORWAY_EXIT.rubric!).stars).toBeLessThanOrEqual(2);
  });

  it("counter-proof: braking only at the gore fails by the OPPOSITE fault, on the same clean route", () => {
    // The mirror image, and the reason both demos exist. This driver never
    // touched the carriageway's peace — nobody behind him ever saw a brake
    // light early — and he is still wrong, because the 280 m he was given went
    // by unused and the bend collected the difference. Together the two demos
    // fence the lesson in from both sides: too early costs the car behind you,
    // too late costs you.
    const l3 = replay("mistake-ramp-too-fast", 3);
    expect(l3.taught).toContain("SPEED_TOO_FAST_FOR_CURVE");
    expect(l3.scored).not.toContain("SPEED_TOO_FAST_FOR_CURVE"); // основна, first encounter
    expect(l3.r.score).toBe(0);
    expect(l3.r.completedAll).toBe(true);
    const l4 = replay("mistake-ramp-too-fast", 4);
    expect(l4.scored.filter((c) => c === "SPEED_TOO_FAST_FOR_CURVE")).toHaveLength(1);
    // 85 stays at/under the ramp's own 90: the връзка's LIMIT never bills, only
    // the advisory does — which is the exit's actual legal shape (чл. 20, ал. 2).
    expect(l4.scored).not.toContain("SPEEDING_OVER_LIMIT");
    expect(l4.scored).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(l4.r.completedAll).toBe(true);
    expect(l4.r.score).toBe(3); // основна — the same 3 points as its mirror demo
    expect(scoreRubric(l4.r, SC_MERGE_MOTORWAY_EXIT.rubric!).stars).toBeLessThanOrEqual(2);
  });

  it("compiles at every authored rung; L4 is the exam cold start and the rear car rides them all", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_MERGE_MOTORWAY_EXIT, level).id).toBe(
        `sc-merge-motorway-exit@L${level}`,
      );
    }
    expect(compileScenario(SC_MERGE_MOTORWAY_EXIT, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_MERGE_MOTORWAY_EXIT, 4).examMode).toBe(true);
    // No L5 by design (the backlog's own rung list): the difficulty axis here is
    // WHERE the speed falls, and a wet rung would need the ADR-006 stage-4a
    // physics opt-in the dry-tuned ghost cannot honour — on this map that is not
    // cosmetic, since gen_mw_exit.mjs sizes the deceleration lane around a DRY
    // 130 → 60 shed and a wet envelope would put the shadow into the bend hot.
    expect(SC_MERGE_MOTORWAY_EXIT.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    for (const level of [1, 2, 3, 4] as const) {
      expect(
        compileScenario(SC_MERGE_MOTORWAY_EXIT, level).stagedEvents?.map((e) => e.kind),
        `L${level}`,
      ).toEqual(["rearTailgater"]);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-merge-motorway-exit@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-merge-motorway-exit@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-mv-uturn-ban — the maneuver was never the problem: the SAME single-arc
//                   U-turn the OV-17 drill already teaches, graded on WHERE and
//                   WHEN it is performed (ЗДвП чл. 38, М1, В23)
// ---------------------------------------------------------------------------

/** The threePointTurn ObjectiveDetail of sc-mv-uturn-ban's turn gate. */
function mvuTurnDetail(result: ReturnType<typeof buildLessonResult>): {
  entered: boolean;
  reversals: number;
  movements: number;
} {
  const d = result.objectives.find((o) => o.id === "sc-mvu-turn")!.detail;
  if (!d || d.kind !== "threePointTurn") {
    throw new Error("sc-mvu-turn published no threePointTurn detail");
  }
  return d;
}

describe("wave-6 bot completion — sc-mv-uturn-ban at L3", () => {
  const lesson = compileScenario(SC_MV_UTURN_BAN, 3);
  let session = createLessonSession(lesson);
  recordScMvUturnBanDrive(loadDistrict("mv-uturn-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: both gates done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_MV_UTURN_BAN.rubric!).stars).toBe(3);
  });

  it("carries the oncoming stream into the live lesson, staged in the INNER lane", () => {
    // Drop the stream and „изчакай потока" is a claim about an empty road — the
    // student would win the drill by driving to the opening and turning straight
    // away, which is exactly mistake-into-stream. And the LANE is a dial, not
    // decoration: the JU-10 tracker measures its gap from the junction node, so a
    // car in the graph's default CURB lane (x = −12.19) carries a permanent
    // lateral term and its gapSec floors at 2·12.19/8 = 3.05 s — above the 2.0 s
    // convict bar at every distance and every speed. In the inner lane the floor
    // is 1.02 s. Without this offset the drill's тежка грешка cannot be graded at
    // all, so it must survive compilation. (Pinned end-to-end in
    // world/__tests__/mv-uturn-districts.test.ts.)
    const stream = (lesson.stagedEvents ?? []).find((s) => s.id === "sc-mvu-stream");
    expect(stream).toBeDefined();
    expect(stream!.kind).toBe("oncomingStream");
    if (stream!.kind !== "oncomingStream") return;
    expect(stream!.actor.extraRightOffsetM).toBe(-8.125);
    expect(stream!.count).toBe(3);
    // No ruleConfig and no physics by design: чл. 38 is graded here by SHIPPED
    // detectors over district data (the authored М1 span + a real junction node).
    // A lesson that quietly grew a dial would fail here.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the drill runs in the taught order: PASS the ban, then turn where it is allowed", () => {
    // The order IS the lesson, and it is enforced rather than observed
    // (objectives advance sequentially, lessons/engine.ts). sc-mvu-pass-ban sits
    // on the inner-lane centre at y = 250 — 30 m PAST the М1 span and 120 m past
    // the temptation — so a driver who turned at y = 130 never reaches it, and
    // the turn gate behind it never arms. „Обърнах по-рано" completes NOTHING.
    const pass = result.objectives.find((o) => o.id === "sc-mvu-pass-ban")!;
    const turn = result.objectives.find((o) => o.id === "sc-mvu-turn")!;
    expect(pass.done).toBe(true);
    expect(turn.done).toBe(true);
    expect(pass.completedAtSec!).toBeLessThan(turn.completedAtSec!);
  });

  it("the turn is ONE movement — the wide-boulevard contract, unchanged from OV-17", () => {
    // The template reuses the shipped threePointTurn evaluator wholesale: this
    // drill adds a decision, it does not fork the maneuver. A 32.5 m carriageway
    // reverses direction in a single forward arc, so the economy channel reads
    // movements = 1 and the rubric's attemptsFor3Stars = 1 is earned, not tuned.
    expect(mvuTurnDetail(result).entered).toBe(true);
    expect(mvuTurnDetail(result).reversals).toBe(0);
    expect(mvuTurnDetail(result).movements).toBe(1);
  });

  it("the LIVE session agrees the patient, lawful drive is innocent — no phantom bill", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. This is exactly where a sloppy tune surfaces:
    // the drive spends 180 m alongside an М1 span, changes lanes on a 2+2 (whose
    // banks RENUMBER under the car through the arc), sits still for 14 s at a
    // junction with traffic streaming past, and then sweeps both oncoming lanes.
    // Every one of those is a shape some detector could misread.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("CROSSED_SOLID_LINE");
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    const commended = session.events.filter((e) => e.kind === "commendation").map((e) => e.code);
    expect(commended).toContain("YIELDED_TO_PRIORITY");
    expect(commended).toContain("SAFE_LANE_CHANGE");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-mv-uturn-ban@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-mv-uturn-ban@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the turn at the tempting spot TEACHES основна and reaches NO gate", () => {
    // RE-BASELINED 2026-08-09 (Наредба № 38 grounding pass). This used to read
    // „SCORED 10". CROSSED_SOLID_LINE charged опасна under б. „в", a CLOSED
    // enumeration of six cases none of which covers it — see
    // `rules/n38.ts` → N38_BASIS.CROSSED_SOLID_LINE. It is основна (3) now, so
    // the first encounter TEACHES with a card instead of docking.
    //
    // For THIS drill the change costs nothing at all, and the assertions below
    // are why: the U-turn at the tempting spot completes NOTHING, so the sheet
    // reads НЕИЗДЪРЖАН and 1★ on the objectives alone. The points were never
    // what taught this lesson.
    let s = createLessonSession(compileScenario(SC_MV_UTURN_BAN, 3));
    const taught: string[] = [];
    recordScMvUturnBanDrive(loadDistrict("mv-uturn-v1"), "mistake-cross-solid", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // Taught, not docked. A TAUGHT violation stays off `session.events` (the
    // card carries the teaching instead of the sheet) — the shipped A12 shape
    // for основни, which this code now joins.
    expect(taught).toEqual(["CROSSED_SOLID_LINE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
    // …and the objectives say the same thing the code does, independently: this
    // driver turned at y = 130 and never came within 6 m of the gate at y = 250,
    // so he completes NOTHING. The sheet still credits the mirror-and-indicator
    // lane change he DID do right, which is the card's whole point: the maneuver
    // was textbook, the place was not.
    expect(r.objectives.every((o) => !o.done)).toBe(true);
    expect(r.completedAll).toBe(false);
    expect(
      s.events.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE"),
    ).toBe(true);
    expect(scoreRubric(r, SC_MV_UTURN_BAN.rubric!).stars).toBe(1);
  });

  it("counter-proof: the turn at the LAWFUL gap fails too — on one decision, not one metre", () => {
    // The pair's whole point, made checkable on the student path. This driver
    // read the road correctly: he passed the ban, indicated, took the inner lane,
    // reached the opening and even let two cars go. He is in the right place
    // doing the right maneuver — and he is convicted, because чл. 38 has a second
    // half. If this demo also billed CROSSED_SOLID_LINE the two cards would name
    // the same fault and the „кога" would never be taught at all.
    let s = createLessonSession(compileScenario(SC_MV_UTURN_BAN, 3));
    const taught: string[] = [];
    recordScMvUturnBanDrive(loadDistrict("mv-uturn-v1"), "mistake-into-stream", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual([]); // опасна + terminating → scored, never a modal
    const codes = [...new Set(s.events.filter((e) => e.kind === "violation").map((e) => e.code))].sort();
    expect(codes).toEqual(["COLLISION", "FAILED_TO_YIELD"]);
    expect(r.passed).toBe(false);
    // The place WAS right, and the gates prove it independently of the codes:
    // this driver clears the pass-the-ban gate the solid-line demo never reaches
    // — and then loses the run anyway. That asymmetry IS the teaching.
    expect(r.objectives.find((o) => o.id === "sc-mvu-pass-ban")!.done).toBe(true);
    expect(r.objectives.find((o) => o.id === "sc-mvu-turn")!.done).toBe(false);
    expect(scoreRubric(r, SC_MV_UTURN_BAN.rubric!).stars).toBe(1);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 doubles the stream", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_MV_UTURN_BAN, level).id).toBe(`sc-mv-uturn-ban@L${level}`);
    }
    expect(compileScenario(SC_MV_UTURN_BAN, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_MV_UTURN_BAN, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_MV_UTURN_BAN, 5);
    expect(l5.examMode).toBeFalsy();
    // The backlog's own L5 dial is DENSER oncoming, not weather: a second stream
    // interleaved 20 m behind each car of the first, so arrivals fall every
    // ~2.5 s instead of every 5 and the hole the L3 driver turned into no longer
    // exists. No rain and no grip dial — this ghost is dry-tuned (ADR-006 4a),
    // and the L5 delta here is PATIENCE.
    expect(l5.environment?.rain).toBeFalsy();
    expect(l5.physics).toBeUndefined();
    expect((l5.stagedEvents ?? []).map((s) => s.id)).toEqual(["sc-mvu-stream", "sc-mvu-stream-2"]);
    // The stream rides EVERY rung — without it the beginner would learn that a
    // legal opening is an empty one.
    for (const level of [1, 3, 4] as const) {
      const l = compileScenario(SC_MV_UTURN_BAN, level);
      expect(l.stagedEvents?.map((e) => e.kind), `L${level}`).toEqual(["oncomingStream"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-ed-d2-stop-address — the Наредба-38 command „Спрете на удобно място" as a
//                         drill: the оглед before the wheels turn (config-gated
//                         PK-05) + a stop you PLAN rather than dive at
// ---------------------------------------------------------------------------

describe("wave-6 bot completion — sc-ed-d2-stop-address at L3", () => {
  const lesson = compileScenario(SC_ED_D2_STOP_ADDRESS, 3);
  let session = createLessonSession(lesson);
  /** The LAST production frame the session saw — the rest at the curb. */
  let lastFrame = { speedKmh: 0, x: 0, y: 0 };
  recordScEdD2StopAddressDrive(loadDistrict("d2-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
      lastFrame = { speedKmh: tick.speedKmh, x: tick.position.x, y: tick.position.y };
    },
  });
  const result = buildLessonResult(session);

  it("completes: all three objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_ED_D2_STOP_ADDRESS.rubric!).stars).toBe(3);
  });

  it("THE CONFIG IS THE DRILL: the live session grades the move-off the student makes", () => {
    // moveOffObservationEnabled ships OFF (rules/types.ts — the A12
    // whole-commute pulls away from rest unglanced, so a default-on grade would
    // flag every innocent drive). Without this propagation the shadow's opening
    // glances would be decoration and „потеглих, без да погледна" an ungraded
    // pass — the trace gate would still be green and the lesson would teach
    // nothing. So assert the propagation itself, not just the outcome.
    expect(lesson.ruleConfig?.moveOffObservationEnabled).toBe(true);
    // …and nothing else is dialled: no physics, no signal plan, no staged actor.
    // The block's EMPTINESS is what makes both faults gradeable (exam-districts
    // battery: Незабравка carries no crossing, stop line or signal).
    expect(lesson.physics).toBeUndefined();
    expect(lesson.signalPlan).toBeUndefined();
    expect(lesson.stagedEvents ?? []).toEqual([]);
  });

  it("the site-selection gate is met AT REST — the drill's honest grading seam", () => {
    // d2-v1 carries no `zones` layer, so ILLEGAL_STOP_IN_BAN_ZONE is
    // structurally unreachable in Лозенец (template HONEST LIMIT 1) and site
    // selection is carried by sc-edsa-legal-stop, a maxSpeedKmh: 3 reachZone.
    // A gate is only a grader if it can FAIL: prove it completes because the car
    // actually came to rest there, and that the ease-down gate ahead of it
    // completed first — the „плавно" half of the same claim.
    const stop = result.objectives.find((o) => o.id === "sc-edsa-legal-stop")!;
    const approach = result.objectives.find((o) => o.id === "sc-edsa-planned-approach")!;
    const moveOff = result.objectives.find((o) => o.id === "sc-edsa-moveoff")!;
    expect(moveOff.done && approach.done && stop.done).toBe(true);
    expect(approach.completedAtSec!).toBeLessThan(stop.completedAtSec!);
    expect(moveOff.completedAtSec!).toBeLessThan(approach.completedAtSec!);
    expect(lastFrame.speedKmh).toBeLessThan(1);
    expect(Math.hypot(lastFrame.x - 173.85, lastFrame.y + 313.6)).toBeLessThan(12);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ed-d2-stop-address@L3",
      startedAtMs: 1_000,
      finishedAtMs: 1_000 + Math.round(result.durationSec * 1000),
      aborted: false,
      ruleEvents: serializeRuleEvents(session.events),
      objectives: result.objectives.map((o) => ({
        id: o.id,
        done: o.done,
        completedAtSec: o.completedAtSec,
        ...(o.detail !== undefined ? { detail: o.detail } : {}),
      })),
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ed-d2-stop-address@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: potegljane без оглед is TAUGHT (основна → teach card), and the run still completes", () => {
    // MOVE_OFF_WITHOUT_OBSERVATION is основна and non-terminating, so a
    // first-encounter fault surfaces as a TEACH MOMENT rather than a scored
    // session event (the A9 channel). That asymmetry is the whole reason the
    // config gate is worth propagating: this student drives the rest of the
    // drill flawlessly — plans the stop, lands on the legal stretch, completes
    // every gate — and is still stopped and taught the one thing he skipped.
    let s = createLessonSession(compileScenario(SC_ED_D2_STOP_ADDRESS, 3));
    const taught: string[] = [];
    recordScEdD2StopAddressDrive(loadDistrict("d2-v1"), "mistake-no-observation", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual(["MOVE_OFF_WITHOUT_OBSERVATION"]);
    expect(r.completedAll).toBe(true);
    expect(scoreRubric(r, SC_ED_D2_STOP_ADDRESS.rubric!).stars).toBeGreaterThanOrEqual(1);
  });

  it("counter-proof: the dive for the first gap loses the drill on the GATES, not just the code", () => {
    // The card's claim in one sheet: a place you must stamp on the brakes for is
    // not „удобно". HARSH_BRAKING_NO_CAUSE grades the stamp; the gates grade the
    // place — this driver never reaches the ease-down gate slowly (he is doing
    // 45 when he passes it) and never rests on the legal stretch at all. Two
    // independent channels, one lesson.
    let s = createLessonSession(compileScenario(SC_ED_D2_STOP_ADDRESS, 3));
    const taught: string[] = [];
    recordScEdD2StopAddressDrive(loadDistrict("d2-v1"), "mistake-first-spot-dive", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual(["HARSH_BRAKING_NO_CAUSE"]);
    expect(r.objectives.find((o) => o.id === "sc-edsa-moveoff")!.done).toBe(true);
    expect(r.objectives.find((o) => o.id === "sc-edsa-planned-approach")!.done).toBe(false);
    expect(r.objectives.find((o) => o.id === "sc-edsa-legal-stop")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam cold start and there is no L5", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_ED_D2_STOP_ADDRESS, level).id).toBe(
        `sc-ed-d2-stop-address@L${level}`,
      );
    }
    expect(compileScenario(SC_ED_D2_STOP_ADDRESS, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_ED_D2_STOP_ADDRESS, 4).examMode).toBe(true);
    // The config rides EVERY rung — a beginner who is not graded on the оглед
    // learns that the оглед is optional.
    for (const level of [1, 2, 3, 4] as const) {
      expect(
        compileScenario(SC_ED_D2_STOP_ADDRESS, level).ruleConfig?.moveOffObservationEnabled,
        `L${level}`,
      ).toBe(true);
    }
    // No L5: compileScenario refuses a rung the template omits (types.ts).
    expect(() => compileScenario(SC_ED_D2_STOP_ADDRESS, 5)).toThrow();
  });
});
