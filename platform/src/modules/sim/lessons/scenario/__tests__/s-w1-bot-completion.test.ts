/**
 * Wave-1 bot-completion proofs (doc 76 §10; the s-batch2 mold) — each NEW
 * template of the wave driven through the FULL production pipeline:
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
import { recordScEdD2CityRunDrive } from "../../../traces/scEdD2CityRun";
import { recordScJxEqualLeftDrive } from "../../../traces/scJxEqualLeft";
import { recordScLnTurnLaneArrowsDrive } from "../../../traces/scLnTurnLaneArrows";
import { recordScMergeAccelLaneDrive } from "../../../traces/scMergeAccelLane";
import { recordScPeSchoolPatrolDrive } from "../../../traces/scPeSchoolPatrol";
import { recordScPkCrossingBanDrive } from "../../../traces/scPkCrossingBan";
import { recordScRbExitSignalDrive } from "../../../traces/scRbExitSignal";
import { recordScSigFlashAmberPedDrive } from "../../../traces/scSigFlashAmberPed";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_ED_D2_CITY_RUN } from "../templates-exam";
import { SC_JX_EQUAL_LEFT } from "../templates-junctions3";
import { SC_LN_TURN_LANE_ARROWS } from "../templates-lanes2";
import { SC_MERGE_ACCEL_LANE } from "../templates-merging";
import { SC_PE_SCHOOL_PATROL } from "../templates-pe2";
import { SC_PK_CROSSING_BAN } from "../templates-parking2";
import { SC_RB_EXIT_SIGNAL } from "../templates-roundabout";
import { SC_SIG_FLASH_AMBER_PED } from "../templates-signals2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

// ---------------------------------------------------------------------------
// sc-rb-exit-signal — the third (west) exit under a right indicator
// ---------------------------------------------------------------------------

describe("wave-1 bot completion — sc-rb-exit-signal at L3", () => {
  const lesson = compileScenario(SC_RB_EXIT_SIGNAL, 3);
  let session = createLessonSession(lesson);
  recordScRbExitSignalDrive(loadDistrict("rb-mini-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_RB_EXIT_SIGNAL.rubric!).stars).toBe(3);
  });

  it("the roundabout traversal is SIGNALLED — the A10 exit-window contract", () => {
    const exit = result.objectives.find((o) => o.id === "sc-rbx-exit")!;
    expect(exit.done).toBe(true);
    expect(exit.detail?.kind).toBe("roundabout");
    expect(exit.detail?.kind === "roundabout" && exit.detail.entered).toBe(true);
    expect(exit.detail?.kind === "roundabout" && exit.detail.exitSignaled).toBe(true);
    // …and the drill really rode past the first two spokes to get there.
    expect(result.objectives.find((o) => o.id === "sc-rbx-past-spokes")!.done).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-rb-exit-signal@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-rb-exit-signal@L3"));
    expect(graded.result.passed).toBe(true);
    const exit = graded.result.objectives.find((o) => o.id === "sc-rbx-exit")!;
    expect(exit.detail?.kind === "roundabout" && exit.detail.exitSignaled).toBe(true);
  });

  it("counter-proof: the unsignalled exit VOIDS the traversal and teaches TURN_WITHOUT_INDICATOR", () => {
    let s = createLessonSession(compileScenario(SC_RB_EXIT_SIGNAL, 3));
    const taught: string[] = [];
    recordScRbExitSignalDrive(loadDistrict("rb-mini-v1"), "mistake-exit-no-signal", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // TURN_WITHOUT_INDICATOR is a teachable основна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught the rule, not merely docked.
    expect(taught).toContain("TURN_WITHOUT_INDICATOR");
    expect(s.events.some((e) => e.kind === "violation" && e.code === "TURN_WITHOUT_INDICATOR")).toBe(false);
    // The bite is the A10 roundabout evaluator instead: it RESETS a traversal
    // left without the right indicator, so leaving the ring silently does not
    // count as having exited at all — the drill cannot be passed by sneaking out.
    const exit = r.objectives.find((o) => o.id === "sc-rbx-exit")!;
    expect(exit.done).toBe(false);
    expect(exit.detail?.kind === "roundabout" && exit.detail.exitSignaled).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_RB_EXIT_SIGNAL.rubric!).stars).toBe(1);
  });

  it("counter-proof: barging the entry grades FAILED_TO_YIELD, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_RB_EXIT_SIGNAL, 3));
    recordScRbExitSignalDrive(loadDistrict("rb-mini-v1"), "mistake-barge-entry", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_RB_EXIT_SIGNAL.rubric!).stars).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sc-pk-crossing-ban — the LAW-implied чл. 98 bans (zebra + junction corner)
// ---------------------------------------------------------------------------

describe("wave-1 bot completion — sc-pk-crossing-ban at L3", () => {
  const lesson = compileScenario(SC_PK_CROSSING_BAN, 3);
  let session = createLessonSession(lesson);
  recordScPkCrossingBanDrive(loadDistrict("pk-banx-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_PK_CROSSING_BAN.rubric!).stars).toBe(3);
  });

  it("the drill is won by WHERE it rests: the legal bay, past every чл. 98 span", () => {
    // The two transit checkpoints prove it never parked in a ban…
    expect(result.objectives.find((o) => o.id === "sc-pkx-past-junction")!.done).toBe(true);
    expect(result.objectives.find((o) => o.id === "sc-pkx-past-zebra")!.done).toBe(true);
    // …and the low-speed mark objective (y = 300) is the lawful rest itself:
    // beyond the т. 1 zebra span, which ends at y = 262.5.
    const stop = result.objectives.find((o) => o.id === "sc-pkx-legal-stop")!;
    expect(stop.done).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-pk-crossing-ban@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-pk-crossing-ban@L3"));
    expect(graded.result.passed).toBe(true);
  });

  /** Drive one authored demo through a LIVE session, collecting the A9
   *  teach-moment channel alongside the session's own events. */
  const liveDemo = (name: "mistake-stop-before-junction" | "mistake-stop-on-corner") => {
    let s = createLessonSession(compileScenario(SC_PK_CROSSING_BAN, 3));
    const taught: string[] = [];
    recordScPkCrossingBanDrive(loadDistrict("pk-banx-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return { session: s, taught, result: buildLessonResult(s) };
  };

  for (const [name, whereBg] of [
    ["mistake-stop-before-junction", "на метри ПРЕДИ кръстовището"],
    ["mistake-stop-on-corner", "върху ЪГЪЛА след кръстовището"],
  ] as const) {
    it(`counter-proof: the rest ${whereBg} TEACHES ILLEGAL_STOP_IN_BAN_ZONE (first encounter)`, () => {
      const { session: s, taught } = liveDemo(name);
      // ILLEGAL_STOP_IN_BAN_ZONE is a teachable основна fault, so its FIRST
      // encounter lands on the A9 teach-moment channel (pause + card), not on
      // session.events — the student is taught the rule, not merely docked.
      // Exactly once, and nothing else fires: the two spans are the only trap.
      expect(taught).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
      expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    });
  }

  it("the two demos really are the SAME fault taught from the two halves of the чл. 98 т. 2 ban", () => {
    // Different spans (pkx-z-jx-before / pkx-z-jx-after), one rule, one card —
    // the map's proof that the ban runs on BOTH sides of the node.
    expect(liveDemo("mistake-stop-before-junction").taught).toEqual(
      liveDemo("mistake-stop-on-corner").taught,
    );
  });

  it("teach-first, not punish: having been taught, the recovered drive still completes", () => {
    // Both demos stop illegally, get the card, drive on and park at the legal
    // bay — so they complete and pass with a clean sheet. That is the design
    // (doc 76 §0: mistakes are DEMONSTRATED, never scored), and it is why the
    // §9 code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-pk-crossing-ban-traces.
    const { result } = liveDemo("mistake-stop-before-junction");
    expect(result.completedAll).toBe(true);
    expect(result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-sig-flash-amber-ped — the чл. 119 pedestrian duty under a flashing amber
// ---------------------------------------------------------------------------

describe("wave-1 bot completion — sc-sig-flash-amber-ped at L3", () => {
  const lesson = compileScenario(SC_SIG_FLASH_AMBER_PED, 3);
  let session = createLessonSession(lesson);
  recordScSigFlashAmberPedDrive(loadDistrict("pe-jay-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_SIG_FLASH_AMBER_PED.rubric!).stars).toBe(3);
  });

  it("the LIVE session earns PEDESTRIAN_YIELDED — the taught behaviour, not just the absence of faults", () => {
    expect(
      session.events.some((e) => e.kind === "commendation" && e.code === "PEDESTRIAN_YIELDED"),
    ).toBe(true);
    // The flashing-amber dial holds through the live pipeline: a cluster with
    // no phase can grade no signal code, so the crossing chain stands alone.
    for (const code of ["RED_LIGHT_CROSSED", "RED_YELLOW_CROSSED", "YELLOW_LIGHT_NOT_STOPPED"]) {
      expect(session.events.some((e) => e.kind === "violation" && e.code === code)).toBe(false);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-sig-flash-amber-ped@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-sig-flash-amber-ped@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the hot approach grades PEDESTRIAN_CROSSING_TOO_FAST, not passed", () => {
    let s = createLessonSession(compileScenario(SC_SIG_FLASH_AMBER_PED, 3));
    recordScSigFlashAmberPedDrive(loadDistrict("pe-jay-v1"), "mistake-hot-approach", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    // The panic stop that follows is innocent inside the crossing zone.
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(r.passed).toBe(false);
  });

  it("counter-proof: driving over the occupied crossing grades PEDESTRIAN_NOT_YIELDED, not passed", () => {
    let s = createLessonSession(compileScenario(SC_SIG_FLASH_AMBER_PED, 3));
    recordScSigFlashAmberPedDrive(loadDistrict("pe-jay-v1"), "mistake-no-yield", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "PEDESTRIAN_NOT_YIELDED")).toBe(true);
    expect(r.passed).toBe(false);
    expect(
      s.events.some((e) => e.kind === "commendation" && e.code === "PEDESTRIAN_YIELDED"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-ln-turn-lane-arrows — the left-arrow lane, taken early
// ---------------------------------------------------------------------------

describe("wave-1 bot completion — sc-ln-turn-lane-arrows at L3", () => {
  const lesson = compileScenario(SC_LN_TURN_LANE_ARROWS, 3);
  let session = createLessonSession(lesson);
  recordScLnTurnLaneArrowsDrive(loadDistrict("ln-arrows-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_LN_TURN_LANE_ARROWS.rubric!).stars).toBe(3);
  });

  it("the lane gate has teeth: the left-arrow zone is satisfiable only from that lane", () => {
    // Radius 4 m < the 8.125 m lane pitch — the objective IS „заеми лентата,
    // чиято стрелка съответства на посоката ти".
    const gate = result.objectives.find((o) => o.id === "sc-lnta-lane")!;
    expect(gate.done).toBe(true);
    const signal = result.objectives.find((o) => o.id === "sc-lnta-signal")!;
    expect(signal.done).toBe(true);
    expect(signal.detail?.kind).toBe("passSignal");
    expect(result.objectives.find((o) => o.id === "sc-lnta-finish")!.done).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ln-turn-lane-arrows@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ln-turn-lane-arrows@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.objectives.find((o) => o.id === "sc-lnta-lane")!.done).toBe(true);
  });

  it("counter-proof: the left turn out of the „само направо“ lane misses the gate and teaches its faults", () => {
    let s = createLessonSession(compileScenario(SC_LN_TURN_LANE_ARROWS, 3));
    const taught: string[] = [];
    recordScLnTurnLaneArrowsDrive(loadDistrict("ln-arrows-v1"), "mistake-left-from-through", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // The unsignalled turn is a teachable основна fault, so its FIRST encounter
    // lands on the A9 teach-moment channel (pause + card), not on session.events
    // — the student is taught the rule, not merely docked. (The wide exit's
    // POOR_LANE_KEEPING follows ~4 s later, inside TEACH_PAUSE_MIN_GAP_S, so it
    // downgrades to the classic lesson toast; the trace gate is what pins it.)
    expect(taught).toContain("TURN_WITHOUT_INDICATOR");
    expect(s.events.some((e) => e.kind === "violation" && e.code === "TURN_WITHOUT_INDICATOR")).toBe(false);
    // The bite is the lane gate: the through lane never enters the 4 m zone, so
    // the drill cannot be passed by turning left from the wrong arrow lane.
    expect(r.objectives.find((o) => o.id === "sc-lnta-lane")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_LN_TURN_LANE_ARROWS.rubric!).stars).toBe(1);
  });

  it("counter-proof: the late two-lane swerve reaches the lane, but grades the reposition", () => {
    let s = createLessonSession(compileScenario(SC_LN_TURN_LANE_ARROWS, 3));
    const taught: string[] = [];
    recordScLnTurnLaneArrowsDrive(loadDistrict("ln-arrows-v1"), "mistake-late-two-lanes", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // Ending up in the right lane is not the same as taking it right: the
    // swerve crossed both boundaries unannounced and unobserved. Both codes map
    // to the same „ev-lane-change" encounter key, so the FIRST teaches…
    expect(taught).toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    // …and every further fault of that same encounter SCORES — so the drill's
    // gate is reached, but „закъснях, ама стигнах" still costs the pass.
    expect(r.objectives.find((o) => o.id === "sc-lnta-lane")!.done).toBe(true);
    expect(s.events.some((e) => e.kind === "violation")).toBe(true);
    expect(r.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-jx-equal-left — the equal crossroads left turn (two duties, one maneuver)
// ---------------------------------------------------------------------------

describe("wave-1 bot completion — sc-jx-equal-left at L3", () => {
  const lesson = compileScenario(SC_JX_EQUAL_LEFT, 3);
  let session = createLessonSession(lesson);
  recordScJxEqualLeftDrive(loadDistrict("jx-equal-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_JX_EQUAL_LEFT.rubric!).stars).toBe(3);
  });

  it("inside a LIVE session both чл. 37 duties are discharged, not just one", () => {
    // The template's reason to exist: an equal X puts the right-hand-rule
    // tracker AND the N1 left-turn tracker on one node. A drive that collected
    // only one commendation would mean an adjudicator never armed — and the
    // lesson would be teaching half a rule while looking green.
    const yields = session.events.filter(
      (e) => e.kind === "commendation" && e.code === "YIELDED_TO_PRIORITY",
    );
    expect(yields.length).toBe(2);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-jx-equal-left@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-jx-equal-left@L3"));
    expect(graded.result.passed).toBe(true);
  });

  it("counter-proof: barging past the right-hand car grades FAILED_TO_YIELD, not passed", () => {
    let s = createLessonSession(compileScenario(SC_JX_EQUAL_LEFT, 3));
    recordScJxEqualLeftDrive(loadDistrict("jx-equal-v1"), "mistake-cut-right", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // FAILED_TO_YIELD is an опасна (10-point) fault — it scores immediately
    // rather than landing on the teach-moment channel.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")).toBe(true);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: yielding to the right car and THEN cutting the oncoming still fails", () => {
    // The half-right drive is the one worth catching: the student obeyed the
    // rule everyone remembers and still took the second car's priority.
    let s = createLessonSession(compileScenario(SC_JX_EQUAL_LEFT, 3));
    recordScJxEqualLeftDrive(loadDistrict("jx-equal-v1"), "mistake-cut-oncoming", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")).toBe(true);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_JX_EQUAL_LEFT.rubric!).stars).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sc-merge-accel-lane — the motorway entry through the acceleration lane
// ---------------------------------------------------------------------------

describe("wave-1 bot completion — sc-merge-accel-lane at L3", () => {
  const lesson = compileScenario(SC_MERGE_ACCEL_LANE, 3);
  let session = createLessonSession(lesson);
  recordScMergeAccelLaneDrive(loadDistrict("mw-entry-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_MERGE_ACCEL_LANE.rubric!).stars).toBe(3);
  });

  it("the gates have teeth: the acceleration lane, THEN the merge, THEN the finish", () => {
    // Both lane gates use radius 4 m < the 8.125 m lane pitch, so each is
    // satisfiable from ONE lane only: „използвай лентата за ускоряване" and
    // „влей се преди края ѝ" are the objectives, not narration.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    expect(at("sc-mrg-accel").done).toBe(true);
    expect(at("sc-mrg-merge").done).toBe(true);
    expect(at("sc-mrg-finish").done).toBe(true);
    expect(at("sc-mrg-accel").completedAtSec!).toBeLessThan(at("sc-mrg-merge").completedAtSec!);
    expect(at("sc-mrg-merge").completedAtSec!).toBeLessThan(at("sc-mrg-finish").completedAtSec!);
  });

  it("the LIVE session earns SAFE_LANE_CHANGE — the taught act, not just the absence of faults", () => {
    expect(
      session.events.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE"),
    ).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-merge-accel-lane@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-merge-accel-lane@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the causeless stop at the end of the lane grades HARSH_BRAKING_NO_CAUSE in a LIVE session", () => {
    let s = createLessonSession(compileScenario(SC_MERGE_ACCEL_LANE, 3));
    const taught: string[] = [];
    recordScMergeAccelLaneDrive(loadDistrict("mw-entry-v1"), "mistake-stop-at-end", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // HARSH_BRAKING_NO_CAUSE is a teachable основна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card) rather than
    // on session.events — the student is taught the rule, not merely docked.
    // The §9 code assert lives on the trace gate, where the recorder's own
    // engine grades every encounter: traces/__tests__/sc-merge-accel-lane-traces.
    expect([...taught, ...s.events.filter((e) => e.kind === "violation").map((e) => e.code)]).toContain(
      "HARSH_BRAKING_NO_CAUSE",
    );
    // It DID merge afterwards — late, but signalled and mirrored — so the map's
    // own trap never fires and the stop stands alone as the fault.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "EMERGENCY_LANE_DRIVING")).toBe(false);
    expect(r.objectives.find((o) => o.id === "sc-mrg-merge")!.done).toBe(true);
  });

  it("counter-proof: the blind merge grades LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_MERGE_ACCEL_LANE, 3));
    recordScMergeAccelLaneDrive(loadDistrict("mw-entry-v1"), "mistake-blind-merge", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // COLLISION is an опасна (terminating) fault — it scores immediately rather
    // than landing on the teach-moment channel.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(scoreRubric(r, SC_MERGE_ACCEL_LANE.rubric!).stars).toBe(1);
  });

  it("compiles at every authored rung; L5 adds rain WITHOUT touching the dry-tuned physics envelope", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_MERGE_ACCEL_LANE, level).id).toBe(`sc-merge-accel-lane@L${level}`);
    }
    expect(compileScenario(SC_MERGE_ACCEL_LANE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_MERGE_ACCEL_LANE, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_MERGE_ACCEL_LANE, 5);
    expect(l5.environment?.rain).toBe(true);
    // ADR-006 stage 4a: the ghost envelope of this template is dry-tuned, so
    // rain renders and grades the conditions envelope — it never silently
    // reduces the live car's grip.
    expect(l5.physics).toBeUndefined();
    // The staged mainline car rides every rung — there is always a car to merge
    // in front of.
    expect(l5.stagedEvents?.map((e) => e.kind)).toEqual(["rearTailgater"]);
  });
});

// ---------------------------------------------------------------------------
// sc-pe-school-patrol — the зона-30 regime + the чл. 119 duty behind the paddle
// ---------------------------------------------------------------------------

describe("wave-1 bot completion — sc-pe-school-patrol at L3", () => {
  const lesson = compileScenario(SC_PE_SCHOOL_PATROL, 3);
  let session = createLessonSession(lesson);
  recordScPeSchoolPatrolDrive(loadDistrict("pe-school-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_PE_SCHOOL_PATROL.rubric!).stars).toBe(3);
  });

  it("the drill is won by the THREE beats of the lesson: zone speed, the halt, the clear crossing", () => {
    // The зона-30 gate has teeth: maxSpeedKmh 30 at y = 170 — reaching it at
    // boulevard speed does not count as having entered the zone correctly.
    expect(result.objectives.find((o) => o.id === "sc-pesp-zone")!.done).toBe(true);
    // The halt IS the paddle duty (single truth with the warden's stop point).
    expect(result.objectives.find((o) => o.id === "sc-pesp-halt")!.done).toBe(true);
    expect(result.objectives.find((o) => o.id === "sc-pesp-clear")!.done).toBe(true);
  });

  it("the LIVE session earns PEDESTRIAN_YIELDED — the taught behaviour, not just the absence of faults", () => {
    expect(
      session.events.some((e) => e.kind === "commendation" && e.code === "PEDESTRIAN_YIELDED"),
    ).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-pe-school-patrol@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-pe-school-patrol@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: driving past the raised paddle grades PEDESTRIAN_NOT_YIELDED, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_PE_SCHOOL_PATROL, 3));
    recordScPeSchoolPatrolDrive(loadDistrict("pe-school-v1"), "mistake-ignored-paddle", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // PEDESTRIAN_NOT_YIELDED is опасна, so it is SCORED on first encounter —
    // never softened to a teach card (engine.ts: a safety event must not pop a
    // modal mid-drive, and must not be forgiven).
    expect(s.events.some((e) => e.kind === "violation" && e.code === "PEDESTRIAN_NOT_YIELDED")).toBe(true);
    // The halt was never made, so the drill cannot be passed by driving through.
    expect(r.objectives.find((o) => o.id === "sc-pesp-halt")!.done).toBe(false);
    expect(r.passed).toBe(false);
    expect(
      s.events.some((e) => e.kind === "commendation" && e.code === "PEDESTRIAN_YIELDED"),
    ).toBe(false);
    expect(scoreRubric(r, SC_PE_SCHOOL_PATROL.rubric!).stars).toBe(1);
  });

  it("counter-proof: the 38-in-a-30 approach TEACHES SPEEDING_OVER_LIMIT and voids the zone gate", () => {
    let s = createLessonSession(compileScenario(SC_PE_SCHOOL_PATROL, 3));
    const taught: string[] = [];
    recordScPeSchoolPatrolDrive(loadDistrict("pe-school-v1"), "mistake-fast-approach", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // SPEEDING_OVER_LIMIT is a teachable второстепенна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught the rule, not merely docked.
    expect(taught).toEqual(["SPEEDING_OVER_LIMIT"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    // The bite is the зона-30 gate: y = 170 must be reached at ≤ 30, and this
    // drive was doing 38 there — so „влязох в зоната" is not satisfied and the
    // drill cannot be passed by slowing down only once the paddle appears.
    expect(r.objectives.find((o) => o.id === "sc-pesp-zone")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("the paddle never grades: the warden is scenery, the PEOPLE are the duty (A12)", () => {
    // The policeStop runner emits ZERO SimTick events by contract, so no code
    // in the session can originate from the paddle itself. The conviction in
    // the counter-proof above comes from the child group on the zebra — which
    // is exactly why the лesson is honest: the paddle is up BECAUSE they are
    // crossing, and the law that bites is чл. 119, not the paddle.
    const paddleOnly = createLessonSession(compileScenario(SC_PE_SCHOOL_PATROL, 3));
    expect(paddleOnly.lesson.stagedEvents?.map((e) => e.kind)).toEqual([
      "policeStop",
      "pedestrianDartOut",
    ]);
  });

  it("the L5 rung adds rain WITHOUT touching physics (the dry-tuned ghost envelope)", () => {
    const l5 = compileScenario(SC_PE_SCHOOL_PATROL, 5);
    // ScenarioSpec.conditions.weather "rain" compiles to LessonSpec.environment.
    expect(l5.environment?.rain).toBe(true);
    // ADR-006 stage 4a: rain renders and grades the conditions envelope — it
    // never silently reduces the live car's grip (only a template that AUTHORS
    // `physics` gets that, and this one's envelopes are dry-tuned).
    expect(l5.physics).toBeUndefined();
    // Both staged actors ride every rung: the paddle and the group are the drill.
    expect(l5.stagedEvents?.map((e) => e.kind)).toEqual(["policeStop", "pedestrianDartOut"]);
  });
});

// ---------------------------------------------------------------------------
// sc-ed-d2-city-run — the „Лозенец" exam segment on the REAL d2-v1 topology
// ---------------------------------------------------------------------------

describe("wave-1 bot completion — sc-ed-d2-city-run at L3", () => {
  const lesson = compileScenario(SC_ED_D2_CITY_RUN, 3);
  let session = createLessonSession(lesson);
  recordScEdD2CityRunDrive(loadDistrict("d2-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: every objective done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_ED_D2_CITY_RUN.rubric!).stars).toBe(3);
  });

  it("the drill is the WHOLE segment: all four route gates, in order", () => {
    // An exam drill is not one fault dodged — it is ~971 m in which no moment
    // is a rest. The gates are the route; the rule engine is the verdict.
    const ids = ["sc-edcr-signal-1", "sc-edcr-signal-2", "sc-edcr-keep-right", "sc-edcr-finish"];
    const times: number[] = [];
    for (const id of ids) {
      const o = result.objectives.find((x) => x.id === id)!;
      expect(o.done, id).toBe(true);
      expect(o.completedAtSec, id).not.toBeNull();
      times.push(o.completedAtSec!);
    }
    // Completed in route order — proof the bot drove the segment, not teleported.
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // …and it really took an exam-length run (par is 150 s; the shadow ~111 s).
    expect(result.durationSec).toBeGreaterThan(90);
  });

  it("the LIVE session earns PEDESTRIAN_YIELDED and takes no signal code", () => {
    expect(
      session.events.some((e) => e.kind === "commendation" && e.code === "PEDESTRIAN_YIELDED"),
    ).toBe(true);
    // Both stop lines were met lawfully — cluster 2's only because it waited.
    for (const code of ["RED_LIGHT_CROSSED", "RED_YELLOW_CROSSED", "YELLOW_LIGHT_NOT_STOPPED", "HESITATION_AT_GREEN"]) {
      expect(session.events.some((e) => e.kind === "violation" && e.code === code), code).toBe(false);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ed-d2-city-run@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ed-d2-city-run@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: running the red grades RED_LIGHT_CROSSED, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_ED_D2_CITY_RUN, 3));
    recordScEdD2CityRunDrive(loadDistrict("d2-v1"), "mistake-red-light", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // RED_LIGHT_CROSSED is an ОПАСНА fault — it is docked, not merely taught.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "RED_LIGHT_CROSSED")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_ED_D2_CITY_RUN.rubric!).stars).toBe(1);
  });

  it("counter-proof: sweeping the occupied zebra grades PEDESTRIAN_NOT_YIELDED, no commendation", () => {
    let s = createLessonSession(compileScenario(SC_ED_D2_CITY_RUN, 3));
    recordScEdD2CityRunDrive(loadDistrict("d2-v1"), "mistake-no-yield", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "PEDESTRIAN_NOT_YIELDED")).toBe(true);
    expect(r.passed).toBe(false);
    expect(
      s.events.some((e) => e.kind === "commendation" && e.code === "PEDESTRIAN_YIELDED"),
    ).toBe(false);
  });

  it("the L5 rung is the real-district complication: rain + night + LIVE ambient traffic", () => {
    const l5 = compileScenario(SC_ED_D2_CITY_RUN, 5);
    // compileScenario folds ConditionAxis into LessonSpec.environment.
    expect(l5.environment?.rain).toBe(true);
    expect(l5.environment?.timeOfDay).toBe("night");
    expect(l5.traffic?.vehicleCount).toBe(8);
    // NO wetGrip: the authored ghost envelope is dry-tuned (ADR-006 4a).
    expect(l5.physics?.wetGrip).toBeUndefined();
  });
});
