/**
 * Wave-9 bot-completion proofs (doc 76 §10; the s-batch2 / s-w8 mold) — each
 * NEW wave-9 template driven through the FULL production pipeline:
 *
 *   compileScenario(L3) → createLessonSession → recordSc*Drive's onTick feeds
 *   applyTick every production frame → session completes → wire serialization →
 *   gradeFinishWire RECOMPILES from the id and regrades → scoreRubric.
 *
 * NOTE for the integration pass: the gradeFinishWire round-trip resolves the
 * lesson id through the templates.ts registry (scenarioById → SCENARIO_TEMPLATES).
 * A block whose family file is NEW this wave goes green only once the main
 * session spreads it in; a block whose family file was ALREADY spread (e.g.
 * cockpit2) resolves as soon as its export lands in the family array.
 *
 *   - sc-vp-telltale-red: the shadow drives ON past the amber cue and rests in
 *     the RED curb-side stop zone → both objectives done, "yielded", 3★; the
 *     ignore reflex coasts into the roadside → COLLISION inside a LIVE session,
 *     not passed → 1★.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScVpTelltaleRedDrive } from "../../../traces/scVpTelltaleRed";
import { recordScHzBreakdownPulloffDrive } from "../../../traces/scHzBreakdownPulloff";
import { recordScSpWetLimitPlateDrive } from "../../../traces/scSpWetLimitPlate";
import { recordScAcWindTruckPassDrive } from "../../../traces/scAcWindTruckPass";
import { recordScPeParkedRowScanDrive } from "../../../traces/scPeParkedRowScan";
import { recordScEdPoligonChainDrive } from "../../../traces/scEdPoligonChain";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_VP_TELLTALE_RED } from "../templates-cockpit2";
import { SC_HZ_BREAKDOWN_PULLOFF } from "../templates-hazards2";
import { SC_SP_WET_LIMIT_PLATE } from "../templates-speed2";
import { SC_AC_WIND_TRUCK_PASS } from "../templates-conditions2";
import { SC_PE_PARKED_ROW_SCAN } from "../templates-pe2";
import { SC_ED_POLIGON_CHAIN } from "../templates-exam";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

// ---------------------------------------------------------------------------
// sc-vp-telltale-red — the red/amber cockpit TRIAGE on ln-v1
// ---------------------------------------------------------------------------

describe("wave-9 bot completion — sc-vp-telltale-red at L3", () => {
  const lesson = compileScenario(SC_VP_TELLTALE_RED, 3);
  let session = createLessonSession(lesson);
  recordScVpTelltaleRedDrive(loadDistrict("ln-v1"), "shadow-correct", {
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
    const amber = result.objectives.find((o) => o.id === "sc-vptr-amber")!;
    const redStop = result.objectives.find((o) => o.id === "sc-vptr-red-stop")!;
    expect(amber.done).toBe(true);
    expect(redStop.done).toBe(true);
    expect(scoreRubric(result, SC_VP_TELLTALE_RED.rubric!).stars).toBe(3);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-vp-telltale-red@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-vp-telltale-red@L3"));
    expect(graded.result.passed).toBe(true);
  });

  it("counter-proof: driving on with the red lamp grades COLLISION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_VP_TELLTALE_RED, 3));
    recordScVpTelltaleRedDrive(loadDistrict("ln-v1"), "mistake-drive-on", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_VP_TELLTALE_RED.rubric!).stars).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sc-hz-breakdown-pulloff — the motorway breakdown pull-off on mw-v1 (PK-10;
//   ЗДвП чл. 58, т. 3). The shadow signals, eases across to the emergency lane
//   in one continuous braking diagonal and rests hard right — both objectives
//   done, zero violations, "yielded", 3★. The two mistakes grade their own
//   codes in a LIVE session: riding the emergency lane (EMERGENCY_LANE_DRIVING)
//   and slamming to a stop in the travel lane (HARSH_BRAKING_NO_CAUSE).
// ---------------------------------------------------------------------------

describe("wave-9 bot completion — sc-hz-breakdown-pulloff at L3", () => {
  const lesson = compileScenario(SC_HZ_BREAKDOWN_PULLOFF, 3);
  let session = createLessonSession(lesson);
  const drive = recordScHzBreakdownPulloffDrive(loadDistrict("mw-v1"), "shadow-correct", {
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
    const approach = result.objectives.find((o) => o.id === "sc-hzbp-approach")!;
    const stop = result.objectives.find((o) => o.id === "sc-hzbp-stop")!;
    expect(approach.done).toBe(true);
    expect(stop.done).toBe(true);
    expect(scoreRubric(result, SC_HZ_BREAKDOWN_PULLOFF.rubric!).stars).toBe(3);
  });

  it("the staged telltale resolves 'yielded' — the lamp was read and the pull-off completed", () => {
    const staged = drive.outcomes.find((o) => o.eventId === "sc-hzbp-lamp")!;
    expect(staged.success).toBe(true);
    expect(staged.detail).toBe("yielded");
  });

  it("stages ONLY the telltale and opts into NOTHING — the pull-off grades clean on the live map", () => {
    expect((lesson.stagedEvents ?? []).map((e) => e.kind)).toEqual(["telltaleStimulus"]);
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("compiles at every authored rung; L4 is the exam cold start; L5 is the night rung", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_HZ_BREAKDOWN_PULLOFF, level).id).toBe(`sc-hz-breakdown-pulloff@L${level}`);
    }
    expect(compileScenario(SC_HZ_BREAKDOWN_PULLOFF, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_HZ_BREAKDOWN_PULLOFF, 4).examMode).toBe(true);
    expect(SC_HZ_BREAKDOWN_PULLOFF.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    expect(compileScenario(SC_HZ_BREAKDOWN_PULLOFF, 5).environment?.timeOfDay).toBe("night");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-hz-breakdown-pulloff@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-hz-breakdown-pulloff@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sc-sp-wet-limit-plate — the conditional „при мокра настилка" plate on
//   sp-rain-v1 (REUSED). The shadow holds the ~38 wet ceiling the whole street
//   (zero violations, 3★). Both mistakes are второстепенни, so at L3 they COACH
//   rather than fail; the honest counter-proof is that each surfaces its EXACT
//   code and forfeits the CLEAN_DRIVING positive (the s3-sp mold). The lesson
//   itself is the dry↔wet ALTERNATION: L1–L2 dry-tuned, L3–L5 real wet grip.
// ---------------------------------------------------------------------------

describe("wave-9 bot completion — sc-sp-wet-limit-plate at L3", () => {
  const lesson = compileScenario(SC_SP_WET_LIMIT_PLATE, 3);
  let session = createLessonSession(lesson);
  recordScSpWetLimitPlateDrive(loadDistrict("sp-rain-v1"), "shadow-correct", {
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
    expect(result.objectives.every((o) => o.done)).toBe(true);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_SP_WET_LIMIT_PLATE.rubric!).stars).toBe(3);
  });

  it("alternates the ladder dry↔wet: L1–L2 dry-tuned, L3–L5 real wet grip; opts into nothing else", () => {
    // The whole lesson is the CONTRAST: the base rungs run the street DRY (the
    // plate sleeps, the full 50 is lawful), the wet rungs flip on physics.wetGrip
    // (ADR-006 stage 4a) so the „при мокра настилка" ceiling binds against real
    // reduced grip. No staged actors, no ruleConfig (both speed detectors are
    // default-on and read only tick.maxSpeedKmh + tick.rain).
    expect(lesson.stagedEvents ?? []).toEqual([]);
    expect(lesson.ruleConfig).toBeUndefined();
    for (const level of [1, 2] as const) {
      const l = compileScenario(SC_SP_WET_LIMIT_PLATE, level);
      expect(l.physics, `L${level} dry`).toBeUndefined();
      expect(l.environment?.rain, `L${level} dry`).not.toBe(true);
    }
    for (const level of [3, 4, 5] as const) {
      const l = compileScenario(SC_SP_WET_LIMIT_PLATE, level);
      expect(l.physics, `L${level} wet`).toEqual({ wetGrip: true });
      expect(l.environment?.rain, `L${level} wet`).toBe(true);
    }
    expect(SC_SP_WET_LIMIT_PLATE.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    // L4 is the exam cold start; L5 adds night over the wet.
    expect(compileScenario(SC_SP_WET_LIMIT_PLATE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_SP_WET_LIMIT_PLATE, 4).examMode).toBe(true);
    expect(compileScenario(SC_SP_WET_LIMIT_PLATE, 5).environment?.timeOfDay).toBe("night");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-sp-wet-limit-plate@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-sp-wet-limit-plate@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  /** Drive a demo through a LIVE L3 session and return the recorder's own
   *  deterministic grading (drive.ruleEvents — what the trace gate asserts).
   *  Both mistakes are второстепенни: at L3 a first occurrence is teach-first
   *  (coached, not scored), so the honest claim is that the code SURFACES and
   *  the CLEAN_DRIVING positive is forfeit — never that the drill fails. */
  const driveDemo = (name: Parameters<typeof recordScSpWetLimitPlateDrive>[1]) => {
    let s = createLessonSession(compileScenario(SC_SP_WET_LIMIT_PLATE, 3));
    const drive = recordScSpWetLimitPlateDrive(loadDistrict("sp-rain-v1"), name, {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    return {
      codes: drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code),
      commends: drive.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code),
    };
  };

  it("counter-proof: dry speed under the wet plate surfaces SPEED_TOO_FAST_FOR_CONDITIONS, no CLEAN_DRIVING", () => {
    const { codes, commends } = driveDemo("mistake-dry-speed-in-wet");
    expect(codes).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(commends).not.toContain("CLEAN_DRIVING");
  });

  it("counter-proof: the over-limit drive in the wet surfaces SPEEDING_OVER_LIMIT, no CLEAN_DRIVING", () => {
    const { codes, commends } = driveDemo("mistake-over-limit-in-wet");
    expect(codes).toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
    expect(commends).not.toContain("CLEAN_DRIVING");
  });
});

// ---------------------------------------------------------------------------
// sc-ac-wind-truck-pass — the crosswind OVERTAKING beat on mw-v1 (REUSED, AC-12).
//   The shadow declares a slow overtake (SAFE_LANE_CHANGE each way), meets the
//   cab-line gust with a small steady correction and returns — both objectives
//   done, zero violations, 3★. The clip demo grades COLLISION in a LIVE session
//   (thrown against the trailer), the blown-out demo surfaces POOR_LANE_KEEPING.
// ---------------------------------------------------------------------------

describe("wave-9 bot completion — sc-ac-wind-truck-pass at L3", () => {
  const lesson = compileScenario(SC_AC_WIND_TRUCK_PASS, 3);
  let session = createLessonSession(lesson);
  recordScAcWindTruckPassDrive(loadDistrict("mw-v1"), "shadow-correct", {
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
    const pass = result.objectives.find((o) => o.id === "sc-acw-pass")!;
    const finish = result.objectives.find((o) => o.id === "sc-acw-finish")!;
    expect(pass.done).toBe(true);
    expect(finish.done).toBe(true);
    expect(scoreRubric(result, SC_AC_WIND_TRUCK_PASS.rubric!).stars).toBe(3);
  });

  it("compiles the wind physics at every rung; L5 adds rain + wet grip over the wind", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_AC_WIND_TRUCK_PASS, level).physics, `L${level}`).toEqual({ crosswind: true });
    }
    // L5 MERGES per key: the template's crosswind + the rung's wet grip.
    const l5 = compileScenario(SC_AC_WIND_TRUCK_PASS, 5);
    expect(l5.physics).toEqual({ crosswind: true, wetGrip: true });
    expect(l5.environment?.rain).toBe(true);
    expect(compileScenario(SC_AC_WIND_TRUCK_PASS, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_AC_WIND_TRUCK_PASS, 4).examMode).toBe(true);
    expect(SC_AC_WIND_TRUCK_PASS.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ac-wind-truck-pass@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ac-wind-truck-pass@L3"));
    expect(graded.lesson.physics).toEqual({ crosswind: true }); // the slice survives the wire
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the gust clip grades COLLISION in a live session, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_AC_WIND_TRUCK_PASS, 3));
    recordScAcWindTruckPassDrive(loadDistrict("mw-v1"), "mistake-clip-truck", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_AC_WIND_TRUCK_PASS.rubric!).stars).toBe(1);
  });

  it("counter-proof: loose hands at the cab line surface POOR_LANE_KEEPING", () => {
    const drive = recordScAcWindTruckPassDrive(loadDistrict("mw-v1"), "mistake-blown-out");
    const codes = drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("CENTER_LINE_TOUCHED"); // ONEWAY carriageway
  });
});

// ---------------------------------------------------------------------------
// sc-pe-parked-row-scan — the SUSTAINED parked-row scan on pe-child-v1 (REUSED,
//   PE-04). The shadow rides the whole row ~28 (under the 30 crossing cap) half
//   a metre off the cars, stops for the late dart and clears the zebra — every
//   objective done, zero violations, 3★. Both mistakes grade in a LIVE session:
//   „50 покрай редицата" (SPEEDING_OVER_LIMIT + the strike COLLISION) and
//   „плътно покрай колите" (COLLISION), each terminating → not passed → 1★.
// ---------------------------------------------------------------------------

describe("wave-9 bot completion — sc-pe-parked-row-scan at L3", () => {
  const lesson = compileScenario(SC_PE_PARKED_ROW_SCAN, 3);
  let session = createLessonSession(lesson);
  recordScPeParkedRowScanDrive(loadDistrict("pe-child-v1"), "shadow-correct", {
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
    expect(result.objectives.every((o) => o.done)).toBe(true);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    const row = result.objectives.find((o) => o.id === "sc-prs-row")!;
    const clear = result.objectives.find((o) => o.id === "sc-prs-clear")!;
    expect(row.done).toBe(true);
    expect(clear.done).toBe(true);
    expect(scoreRubric(result, SC_PE_PARKED_ROW_SCAN.rubric!).stars).toBe(3);
  });

  it("compiles every rung; L4 is the exam cold start; L5 adds night + the second dart", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_PE_PARKED_ROW_SCAN, level).id).toBe(`sc-pe-parked-row-scan@L${level}`);
    }
    expect(compileScenario(SC_PE_PARKED_ROW_SCAN, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_PE_PARKED_ROW_SCAN, 4).examMode).toBe(true);
    expect(SC_PE_PARKED_ROW_SCAN.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    // L5 „dusk" renders as night; the second dart composes with the base child.
    expect(compileScenario(SC_PE_PARKED_ROW_SCAN, 5).environment?.timeOfDay).toBe("night");
    expect((compileScenario(SC_PE_PARKED_ROW_SCAN, 5).stagedEvents ?? []).map((e) => e.id)).toEqual([
      "sc-prs-child",
      "sc-prs-child2",
    ]);
    // Base rungs carry ONLY the single dart.
    expect((compileScenario(SC_PE_PARKED_ROW_SCAN, 3).stagedEvents ?? []).map((e) => e.id)).toEqual(["sc-prs-child"]);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    // Integration-gated: scenarioLessonById resolves through the templates.ts
    // registry, so this goes green once SCENARIO_TEMPLATES_PE3 (templates-pe3.ts)
    // is spread into SCENARIO_TEMPLATES (the main session owns that edit — see
    // the file header).
    const graded = gradeFinishWire({
      lessonId: "sc-pe-parked-row-scan@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-pe-parked-row-scan@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: „50 покрай редицата“ grades SPEEDING_OVER_LIMIT + COLLISION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_PE_PARKED_ROW_SCAN, 3));
    const drive = recordScPeParkedRowScanDrive(loadDistrict("pe-child-v1"), "mistake-fast-row", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("SPEEDING_OVER_LIMIT");
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_PE_PARKED_ROW_SCAN.rubric!).stars).toBe(1);
  });

  it("counter-proof: hugging the row grades COLLISION only, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_PE_PARKED_ROW_SCAN, 3));
    const drive = recordScPeParkedRowScanDrive(loadDistrict("pe-child-v1"), "mistake-hug-row", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    const codes = drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toEqual(["COLLISION"]);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_PE_PARKED_ROW_SCAN.rubric!).stars).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sc-ed-poligon-chain — the площадкова capstone: three maneuvers on one route
// ---------------------------------------------------------------------------

describe("wave-9 bot completion — sc-ed-poligon-chain at L3", () => {
  const lesson = compileScenario(SC_ED_POLIGON_CHAIN, 3);
  let session = createLessonSession(lesson);
  recordScEdPoligonChainDrive(loadDistrict("poligon-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes the whole chain: all five objectives done, zero violations, one bay attempt, 3-mv turn", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    const park = result.objectives.find((o) => o.id === "sc-pgc-park")!;
    expect(park.done).toBe(true);
    expect(park.detail?.kind === "parkInBay" && park.detail.attempts).toBe(1);
    const turn = result.objectives.find((o) => o.id === "sc-pgc-turn")!;
    expect(turn.done).toBe(true);
    expect(turn.detail?.kind === "threePointTurn" && turn.detail.movements).toBe(3);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ed-poligon-chain@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ed-poligon-chain@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("scores 3★ on economy (the one-attempt bay park)", () => {
    const rubric = scoreRubric(result, SC_ED_POLIGON_CHAIN.rubric!);
    expect(rubric.stars).toBe(3);
    const economy = rubric.breakdownBg.find((l) => l.id === "economy")!;
    expect(economy.measured).toBe(true);
    expect(economy.points).toBe(2);
  });

  it("counter-proof: a too-wide bay reverse clips a cone → COLLISION inside a LIVE session, 1★", () => {
    let s = createLessonSession(compileScenario(SC_ED_POLIGON_CHAIN, 3));
    recordScEdPoligonChainDrive(loadDistrict("poligon-v1"), "mistake-cone", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_ED_POLIGON_CHAIN.rubric!).stars).toBe(1);
  });

  it("counter-proof: a stall at the maneuver grades ENGINE_STALLED (teach-first) in a LIVE session", () => {
    let s = createLessonSession(compileScenario(SC_ED_POLIGON_CHAIN, 3));
    // A FIRST-encounter stall surfaces as a teach-first mini-lesson (teachMoments),
    // not a scored HUD violation (the scVpStall precedent) — collect both channels.
    const liveReactionCodes: string[] = [];
    recordScEdPoligonChainDrive(loadDistrict("poligon-v1"), "mistake-stall", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) liveReactionCodes.push(m.code);
      },
    });
    for (const e of s.events) if (e.kind === "violation") liveReactionCodes.push(e.code);
    const r = buildLessonResult(s);
    expect(liveReactionCodes).toContain("ENGINE_STALLED");
    expect(liveReactionCodes).not.toContain("COLLISION");
    expect(liveReactionCodes).not.toContain("MOVE_OFF_WITHOUT_OBSERVATION");
    expect(r.passed).toBe(false);
  });
});
