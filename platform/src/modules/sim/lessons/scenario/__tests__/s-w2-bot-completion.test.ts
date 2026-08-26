/**
 * Wave-2 bot-completion proofs (doc 76 §10; the s-batch2 / s-w1 mold) — each
 * NEW template of the wave driven through the FULL production pipeline:
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
import { recordScAcNightOverdriveDrive } from "../../../traces/scAcNightOverdrive";
import { recordScMergeLaneEndDrive } from "../../../traces/scMergeLaneEnd";
import { recordScOvNightGapDrive } from "../../../traces/scOvNightGap";
import { recordScPkBusstopBanDrive } from "../../../traces/scPkBusstopBan";
import { recordScRbCirculatePriorityDrive } from "../../../traces/scRbCirculatePriority";
import { recordScRxQueueClearDrive } from "../../../traces/scRxQueueClear";
import { recordScSpLimitEndDrive } from "../../../traces/scSpLimitEnd";
import { recordScVuBlindspotMotoDrive } from "../../../traces/scVuBlindspotMoto";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_AC_NIGHT_OVERDRIVE } from "../templates-conditions2";
import { SC_OV_NIGHT_GAP } from "../templates-lanes2";
import { SC_MERGE_LANE_END } from "../templates-merging";
import { SC_PK_BUSSTOP_BAN } from "../templates-parking2";
import { SC_RX_QUEUE_CLEAR } from "../templates-rail2";
import { SC_RB_CIRCULATE_PRIORITY } from "../templates-roundabout";
import { SC_SP_LIMIT_END } from "../templates-speed2";
import { SC_VU_BLINDSPOT_MOTO } from "../templates-vru2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

// ---------------------------------------------------------------------------
// sc-ov-night-gap — the night corridor: refuse the headlights, keep the beams
//                   dipped behind the lead
// ---------------------------------------------------------------------------

describe("wave-2 bot completion — sc-ov-night-gap at L3", () => {
  const lesson = compileScenario(SC_OV_NIGHT_GAP, 3);
  let session = createLessonSession(lesson);
  recordScOvNightGapDrive(loadDistrict("ov-oncoming-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_OV_NIGHT_GAP.rubric!).stars).toBe(3);
  });

  it("the drill is won by the WAIT: the patience gate, then the pass", () => {
    // Radius 4 m < the 8.125 m lane pitch and maxSpeedKmh 45 — the gate is
    // satisfiable ONLY from the own-lane center, at follow speed, while the
    // trap car is still inbound. „Изчаках фаровете" IS the objective.
    const wait = result.objectives.find((o) => o.id === "sc-ovn-wait")!;
    const finish = result.objectives.find((o) => o.id === "sc-ovn-finish")!;
    expect(wait.done).toBe(true);
    expect(finish.done).toBe(true);
    // Waited FIRST, passed after — proof it refused the window, not raced it.
    expect(wait.completedAtSec!).toBeLessThan(finish.completedAtSec!);
  });

  it("the LIVE session runs DARK and takes neither night duty (the template's premise)", () => {
    expect(lesson.environment?.timeOfDay).toBe("night");
    for (const code of ["HIGH_BEAM_NOT_DIPPED", "HEADLIGHTS_OFF_AT_NIGHT", "SPEED_TOO_FAST_FOR_CONDITIONS"]) {
      expect(session.events.some((e) => e.kind === "violation" && e.code === code), code).toBe(false);
    }
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ov-night-gap@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ov-night-gap@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: taking the „далечни фарове“ window grades OVERTAKE_INSUFFICIENT_GAP, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_OV_NIGHT_GAP, 3));
    recordScOvNightGapDrive(loadDistrict("ov-oncoming-v1"), "mistake-far-headlights", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // OVERTAKE_INSUFFICIENT_GAP is an ОПАСНА (10-point) fault — it is docked on
    // the first encounter, never softened to a teach card (engine.ts: a safety
    // event must not pop a modal mid-drive, and must not be forgiven).
    expect(s.events.some((e) => e.kind === "violation" && e.code === "OVERTAKE_INSUFFICIENT_GAP")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_OV_NIGHT_GAP.rubric!).stars).toBe(1);
  });

  it("counter-proof: following the lead on high beams TEACHES HIGH_BEAM_NOT_DIPPED", () => {
    let s = createLessonSession(compileScenario(SC_OV_NIGHT_GAP, 3));
    const taught: string[] = [];
    recordScOvNightGapDrive(loadDistrict("ov-oncoming-v1"), "mistake-high-beams", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    // HIGH_BEAM_NOT_DIPPED is a teachable второстепенна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught чл. 74, not merely docked. The §9
    // code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-ov-night-gap-traces.
    expect(taught).toEqual(["HIGH_BEAM_NOT_DIPPED"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("counter-proof: the beam demo never overtakes, so it cannot pass the drill", () => {
    // The two mistakes are two different lessons: the beam demo simply follows
    // the lead the whole way. It takes the чл. 74 card and still fails — the
    // corridor gate is unreachable from behind the crawler.
    let s = createLessonSession(compileScenario(SC_OV_NIGHT_GAP, 3));
    recordScOvNightGapDrive(loadDistrict("ov-oncoming-v1"), "mistake-high-beams", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(r.objectives.find((o) => o.id === "sc-ovn-finish")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("compiles at every authored rung; L5 adds drizzle over the night WITHOUT touching physics", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_OV_NIGHT_GAP, level).id).toBe(`sc-ov-night-gap@L${level}`);
    }
    expect(compileScenario(SC_OV_NIGHT_GAP, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_OV_NIGHT_GAP, 4).examMode).toBe(true);
    // Night rides EVERY rung (the template-level condition), including L5 —
    // compileScenario spreads the rung over the template, so the rain override
    // adds weather without dropping the dark.
    for (const level of [1, 3, 5] as const) {
      expect(compileScenario(SC_OV_NIGHT_GAP, level).environment?.timeOfDay, `L${level}`).toBe("night");
    }
    const l5 = compileScenario(SC_OV_NIGHT_GAP, 5);
    expect(l5.environment?.rain).toBe(true);
    // ADR-006 stage 4a: the drizzle renders and grades the conditions envelope —
    // it never silently reduces the live car's grip (this template's ghost
    // envelope is dry-tuned).
    expect(l5.physics).toBeUndefined();
    // Both staged actors ride every rung: the crawler to pass and the headlights
    // to refuse ARE the drill.
    expect(l5.stagedEvents?.map((e) => e.kind)).toEqual(["brakingLeadCar", "oncomingStream"]);
  });
});

// ---------------------------------------------------------------------------
// sc-pk-busstop-ban — the spirka is bigger than the shelter (чл. 98, ал. 1)
// ---------------------------------------------------------------------------

describe("wave-2 bot completion — sc-pk-busstop-ban at L3", () => {
  const lesson = compileScenario(SC_PK_BUSSTOP_BAN, 3);
  let session = createLessonSession(lesson);
  recordScPkBusstopBanDrive(loadDistrict("pk-busstop-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_PK_BUSSTOP_BAN.rubric!).stars).toBe(3);
  });

  it("the drill is won by WHERE it rests: the legal bay, 40 m past the stop zone", () => {
    // The transit gate proves it rode the whole zone out…
    expect(result.objectives.find((o) => o.id === "sc-pkbs-past-zone")!.done).toBe(true);
    // …and the low-speed mark objective (y = 250) is the lawful rest itself:
    // beyond the pocket span, which ends at y = 210.
    const stop = result.objectives.find((o) => o.id === "sc-pkbs-legal-stop")!;
    expect(stop.done).toBe(true);
    // In order — the bay is reached by driving past the spirka, not before it.
    expect(
      result.objectives.find((o) => o.id === "sc-pkbs-past-zone")!.completedAtSec!,
    ).toBeLessThan(stop.completedAtSec!);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-pk-busstop-ban@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-pk-busstop-ban@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  /** Drive one authored demo through a LIVE session, collecting the A9
   *  teach-moment channel alongside the session's own events. */
  const liveDemo = (name: "mistake-stop-on-pocket" | "mistake-stop-on-marking") => {
    let s = createLessonSession(compileScenario(SC_PK_BUSSTOP_BAN, 3));
    const taught: string[] = [];
    recordScPkBusstopBanDrive(loadDistrict("pk-busstop-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return { session: s, taught, result: buildLessonResult(s) };
  };

  for (const [name, whereBg] of [
    ["mistake-stop-on-pocket", "в ДЖОБА на спирката"],
    ["mistake-stop-on-marking", "върху ЗИГЗАГА преди спирката"],
  ] as const) {
    it(`counter-proof: the rest ${whereBg} TEACHES ILLEGAL_STOP_IN_BAN_ZONE (first encounter)`, () => {
      const { session: s, taught } = liveDemo(name);
      // ILLEGAL_STOP_IN_BAN_ZONE is a teachable основна fault, so its FIRST
      // encounter lands on the A9 teach-moment channel (pause + card), not on
      // session.events — the student is taught the rule, not merely docked.
      // Exactly once, and nothing else fires: the stop zone is the only trap.
      expect(taught).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
      expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    });
  }

  it("the two demos are the SAME fault taught from the two halves of ONE stop zone", () => {
    // Different spans (pkbs-z-stop-marking / pkbs-z-stop-pocket), one rule, one
    // card — the map's proof that „преди спирката" is still the spirka.
    expect(liveDemo("mistake-stop-on-pocket").taught).toEqual(
      liveDemo("mistake-stop-on-marking").taught,
    );
  });

  it("teach-first, not punish: having been taught, the recovered drive still completes", () => {
    // Both demos stop illegally, get the card, drive on and park at the legal
    // bay — so they complete and pass with a clean sheet. That is the design
    // (doc 76 §0: mistakes are DEMONSTRATED, never scored), and it is why the
    // §9 code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-pk-busstop-ban-traces.
    const { result: r } = liveDemo("mistake-stop-on-pocket");
    expect(r.completedAll).toBe(true);
    expect(r.score).toBe(0);
  });

  it("compiles at every authored rung; L4 is the exam rung, and no rung touches physics", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_PK_BUSSTOP_BAN, level).id).toBe(`sc-pk-busstop-ban@L${level}`);
    }
    expect(compileScenario(SC_PK_BUSSTOP_BAN, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_PK_BUSSTOP_BAN, 4).examMode).toBe(true);
    // L5 is deliberately NOT authored: the fault is a DECISION, not a
    // condition — rain and night would decorate it without teaching it.
    expect(() => compileScenario(SC_PK_BUSSTOP_BAN, 5)).toThrow();
    // No staged actor on any rung: a bus in the pocket would make every rest
    // behind it queue-innocent, which is exactly the drill's blind spot.
    for (const level of [1, 3, 4] as const) {
      expect(compileScenario(SC_PK_BUSSTOP_BAN, level).stagedEvents ?? [], `L${level}`).toEqual([]);
    }
    expect(compileScenario(SC_PK_BUSSTOP_BAN, 3).physics).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sc-vu-blindspot-moto — the filtering rider lives where you are going (VU-07)
// ---------------------------------------------------------------------------

describe("wave-2 bot completion — sc-vu-blindspot-moto at L3", () => {
  const lesson = compileScenario(SC_VU_BLINDSPOT_MOTO, 3);
  let session = createLessonSession(lesson);
  recordScVuBlindspotMotoDrive(loadDistrict("ln-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_VU_BLINDSPOT_MOTO.rubric!).stars).toBe(3);
  });

  it("the drill is won by the WAIT: hold the lane while the rider filters, THEN move", () => {
    // Radius 4 m < the 8.125 m lane pitch, so each gate is satisfiable from ONE
    // lane only. „Изчакай моториста" is the objective, not narration: a driver
    // who moved left early is at x ≈ 4.06 at y = 200 and misses the first gate
    // outright.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    expect(at("sc-vubs-let-pass").done).toBe(true);
    expect(at("sc-vubs-changed").done).toBe(true);
    expect(at("sc-vubs-finish").done).toBe(true);
    // In route order — held the right lane first, changed after.
    expect(at("sc-vubs-let-pass").completedAtSec!).toBeLessThan(at("sc-vubs-changed").completedAtSec!);
    expect(at("sc-vubs-changed").completedAtSec!).toBeLessThan(at("sc-vubs-finish").completedAtSec!);
  });

  it("the LIVE session earns SAFE_LANE_CHANGE — the taught act, not just the absence of faults", () => {
    expect(
      session.events.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE"),
    ).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-vu-blindspot-moto@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-vu-blindspot-moto@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the mirror-only change grades MIRROR_CHECK + COLLISION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_VU_BLINDSPOT_MOTO, 3));
    recordScVuBlindspotMotoDrive(loadDistrict("ln-v1"), "mistake-mirror-only", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // COLLISION is an опасна (terminating) fault — it scores immediately rather
    // than landing on the teach-moment channel.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    // …and the drill's own gate bites too: it moved left at y ≈ 161, so it was
    // never in the right lane at y = 200 to let the rider through.
    expect(r.objectives.find((o) => o.id === "sc-vubs-let-pass")!.done).toBe(false);
    expect(r.passed).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(scoreRubric(r, SC_VU_BLINDSPOT_MOTO.rubric!).stars).toBe(1);
  });

  it("counter-proof: the unsignalled change TEACHES LANE_CHANGE_WITHOUT_INDICATOR", () => {
    let s = createLessonSession(compileScenario(SC_VU_BLINDSPOT_MOTO, 3));
    const taught: string[] = [];
    recordScVuBlindspotMotoDrive(loadDistrict("ln-v1"), "mistake-no-indicator", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    // LANE_CHANGE_WITHOUT_INDICATOR is a teachable основна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught чл. 25, not merely docked. The §9
    // code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-vu-blindspot-moto-traces.
    expect(taught).toEqual(["LANE_CHANGE_WITHOUT_INDICATOR"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("teach-first, not punish: the seen-but-unsignalled rider still lets the drill complete", () => {
    // This demo waits the rider out correctly and only omits the indicator, so
    // it takes the card, reaches every gate and completes with a clean sheet —
    // doc 76 §0: mistakes are DEMONSTRATED, never scored.
    let s = createLessonSession(compileScenario(SC_VU_BLINDSPOT_MOTO, 3));
    recordScVuBlindspotMotoDrive(loadDistrict("ln-v1"), "mistake-no-indicator", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(r.completedAll).toBe(true);
    expect(r.score).toBe(0);
    // …but it never earns the commendation: the ritual was incomplete.
    expect(s.events.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE")).toBe(false);
  });

  it("the rider never grades: it is pressure scenery, the CHECK is the duty (A12)", () => {
    // The rearTailgater runner emits ZERO SimTick events by contract, so no code
    // in any session can originate from the rider itself. That is exactly why
    // the template is honest: the mirror-only demo's COLLISION is an AUTHORED
    // beat depicting geometry the trace gate independently proves (the rider is
    // still alongside at the wheel-over), never a silent detector.
    expect(lesson.stagedEvents?.map((e) => e.kind)).toEqual(["rearTailgater"]);
  });

  it("compiles at every authored rung; L5 adds rain WITHOUT touching the dry-tuned physics envelope", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_VU_BLINDSPOT_MOTO, level).id).toBe(`sc-vu-blindspot-moto@L${level}`);
    }
    expect(compileScenario(SC_VU_BLINDSPOT_MOTO, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_VU_BLINDSPOT_MOTO, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_VU_BLINDSPOT_MOTO, 5);
    expect(l5.environment?.rain).toBe(true);
    // ADR-006 stage 4a: rain renders and grades the conditions envelope — it
    // never silently reduces the live car's grip (this template's ghost
    // envelope is dry-tuned; the taught delta is visibility, not braking).
    expect(l5.physics).toBeUndefined();
    // The rider rides every rung — there is always someone in the blind spot.
    expect(l5.stagedEvents?.map((e) => e.kind)).toEqual(["rearTailgater"]);
  });
});

// ---------------------------------------------------------------------------
// sc-rx-queue-clear — the RX-03 queue trap: an open barrier is permission to
//                     CROSS, never permission to enter without an exit
// ---------------------------------------------------------------------------

describe("wave-2 bot completion — sc-rx-queue-clear at L3", () => {
  const lesson = compileScenario(SC_RX_QUEUE_CLEAR, 3);
  let session = createLessonSession(lesson);
  recordScRxQueueClearDrive(loadDistrict("rx-guarded-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_RX_QUEUE_CLEAR.rubric!).stars).toBe(3);
  });

  it("the drill is won by the WAIT, and the gates say so in order", () => {
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    // The hold gate has teeth: maxSpeedKmh 5 at the stop line — rolling onto
    // the band behind the queue can never satisfy „спри пред релсите".
    expect(at("sc-rxq-hold").done).toBe(true);
    // The cross gate sits 12 m past the tail's rest pose, so it is reachable
    // ONLY after the queue has actually rolled — „свободен изход", made graded.
    expect(at("sc-rxq-cross").done).toBe(true);
    expect(at("sc-rxq-finish").done).toBe(true);
    expect(at("sc-rxq-hold").completedAtSec!).toBeLessThan(at("sc-rxq-cross").completedAtSec!);
    expect(at("sc-rxq-cross").completedAtSec!).toBeLessThan(at("sc-rxq-finish").completedAtSec!);
    // And the wait was real: ~30 s pass between reaching the line and clearing
    // the crossing — the barrier lift alone (t = 40) was never the green light.
    expect(at("sc-rxq-cross").completedAtSec! - at("sc-rxq-hold").completedAtSec!).toBeGreaterThan(30);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-rx-queue-clear@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-rx-queue-clear@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: freezing on the rails grades RAIL_CROSSING_VIOLATION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_RX_QUEUE_CLEAR, 3));
    recordScRxQueueClearDrive(loadDistrict("rx-guarded-v1"), "mistake-stop-on-rails", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // RAIL_CROSSING_VIOLATION is опасна (10 points) — it is SCORED on first
    // encounter rather than softened onto the teach-moment channel.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_RX_QUEUE_CLEAR.rubric!).stars).toBe(1);
    // The bite is that the car DID everything else right — it even waited out
    // the barrier — which is the whole teach: the lift is not the exit.
    expect(r.objectives.find((o) => o.id === "sc-rxq-hold")!.done).toBe(true);
  });

  it("counter-proof: the bumper kiss TEACHES STANDSTILL_GAP_TOO_CLOSE and never reaches the exit gate", () => {
    let s = createLessonSession(compileScenario(SC_RX_QUEUE_CLEAR, 3));
    const taught: string[] = [];
    recordScRxQueueClearDrive(loadDistrict("rx-guarded-v1"), "mistake-bumper-kiss", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // STANDSTILL_GAP_TOO_CLOSE is a teachable второстепенна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught the rule, not merely docked. The
    // §9 code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-rx-queue-clear-traces.
    expect(taught).toEqual(["STANDSTILL_GAP_TOO_CLOSE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    // …and the drill still cannot be passed by gluing to the tail: the car
    // parked itself 12 m short of the exit gate and never got out of the queue.
    expect(r.objectives.find((o) => o.id === "sc-rxq-cross")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("the queue is the trap, not the train: the tail rides every rung, and L5 adds NIGHT only", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_RX_QUEUE_CLEAR, level).id).toBe(`sc-rx-queue-clear@L${level}`);
    }
    expect(compileScenario(SC_RX_QUEUE_CLEAR, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_RX_QUEUE_CLEAR, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_RX_QUEUE_CLEAR, 5);
    expect(l5.environment?.timeOfDay).toBe("night");
    // ADR-006 stage 4a: the authored ghost envelope is dry-tuned, so no rung
    // silently reduces the live car's grip.
    expect(l5.physics).toBeUndefined();
    // ONE staged actor on every rung — the halted queue tail IS the drill.
    for (const level of [1, 3, 5] as const) {
      expect(compileScenario(SC_RX_QUEUE_CLEAR, level).stagedEvents?.map((e) => e.kind)).toEqual([
        "brakingLeadCar",
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-rb-circulate-priority — the inverse of the entry drill: on the ring the
//                            priority is YOURS, and the cars at the mouths are
//                            waiting for you (ЗДвП чл. 50, ал. 1)
// ---------------------------------------------------------------------------

describe("wave-2 bot completion — sc-rb-circulate-priority at L3", () => {
  const lesson = compileScenario(SC_RB_CIRCULATE_PRIORITY, 3);
  let session = createLessonSession(lesson);
  recordScRbCirculatePriorityDrive(loadDistrict("rb-mini-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_RB_CIRCULATE_PRIORITY.rubric!).stars).toBe(3);
  });

  it("the drill is won by NOT stopping: past the east mouth, then out the north exit", () => {
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    // The reachZone sits ON the ring centerline at the east mouth (18, 0), r = 6
    // — satisfiable only from the ring itself, at ring pace, mid-circulation.
    expect(at("sc-rbc-past-east").done).toBe(true);
    expect(at("sc-rbc-exit").done).toBe(true);
    // In route order: rode past the first spoke, THEN took the second.
    expect(at("sc-rbc-past-east").completedAtSec!).toBeLessThan(at("sc-rbc-exit").completedAtSec!);
  });

  it("the roundabout traversal is SIGNALLED — the A10 exit-window contract", () => {
    const exit = result.objectives.find((o) => o.id === "sc-rbc-exit")!;
    expect(exit.detail?.kind).toBe("roundabout");
    expect(exit.detail?.kind === "roundabout" && exit.detail.entered).toBe(true);
    expect(exit.detail?.kind === "roundabout" && exit.detail.exitSignaled).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-rb-circulate-priority@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-rb-circulate-priority@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
    const exit = graded.result.objectives.find((o) => o.id === "sc-rbc-exit")!;
    expect(exit.detail?.kind === "roundabout" && exit.detail.exitSignaled).toBe(true);
  });

  /** Drive one authored demo through a LIVE session, collecting the A9
   *  teach-moment channel alongside the session's own events. */
  const liveDemo = (name: "mistake-panic-brake" | "mistake-wandering-line") => {
    let s = createLessonSession(compileScenario(SC_RB_CIRCULATE_PRIORITY, 3));
    const taught: string[] = [];
    recordScRbCirculatePriorityDrive(loadDistrict("rb-mini-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return { session: s, taught, result: buildLessonResult(s) };
  };

  it("counter-proof: the panic stop TEACHES HARSH_BRAKING_NO_CAUSE (first encounter)", () => {
    const { session: s, taught } = liveDemo("mistake-panic-brake");
    // HARSH_BRAKING_NO_CAUSE is a teachable основна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught why a standing car at a mouth
    // claims nothing, not merely docked. The §9 code assert lives on the trace
    // gate, where the recorder's own engine grades every encounter:
    // traces/__tests__/sc-rb-circulate-priority-traces.
    expect(taught).toEqual(["HARSH_BRAKING_NO_CAUSE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("counter-proof: the wandering ring line TEACHES POOR_LANE_KEEPING", () => {
    const { session: s, taught } = liveDemo("mistake-wandering-line");
    expect(taught).toEqual(["POOR_LANE_KEEPING"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("teach-first, not punish: both demos take their card and still complete the drill", () => {
    // Each demo carries exactly ONE fault and drives the rest of the route
    // correctly — so it is taught, then completes with a clean sheet. That is
    // the design (doc 76 §0: mistakes are DEMONSTRATED, never scored).
    for (const name of ["mistake-panic-brake", "mistake-wandering-line"] as const) {
      const { result: r } = liveDemo(name);
      expect(r.completedAll, name).toBe(true);
      expect(r.score, name).toBe(0);
    }
  });

  it("the waiting car never grades: it stands at its mouth as scenery, the JUDGMENT is the duty", () => {
    // The PriorityFromRightRunner holds this actor with `cruise speedMps: 0`
    // for the whole drill and never reaches its triggered phase, so no code in
    // any session can originate from it. The template is honest about that: the
    // graded faults are the driver's own brake and the driver's own line — the
    // car is only the temptation. The trace gate proves it never moves.
    expect(lesson.stagedEvents?.map((e) => e.kind)).toEqual(["priorityFromRight"]);
  });

  it("compiles at every authored rung; L4 is the exam rung, and no rung touches physics", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_RB_CIRCULATE_PRIORITY, level).id).toBe(
        `sc-rb-circulate-priority@L${level}`,
      );
    }
    expect(compileScenario(SC_RB_CIRCULATE_PRIORITY, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_RB_CIRCULATE_PRIORITY, 4).examMode).toBe(true);
    // L5 is deliberately NOT authored. The ring pace this drill teaches is
    // already pinned to the turn detector's ceiling on an R = 18 ring (12 km/h;
    // see the trace script's header), so a harder rung has no room to move the
    // thing being taught — rain would only decorate a judgment fault. The
    // roundabout family's L5 lives on sc-rb-exit-signal, which has the arc for it.
    expect(() => compileScenario(SC_RB_CIRCULATE_PRIORITY, 5)).toThrow();
    // ADR-006 stage 4a: the authored ghost envelope is dry-tuned, so no rung
    // silently reduces the live car's grip.
    for (const level of [1, 3, 4] as const) {
      expect(compileScenario(SC_RB_CIRCULATE_PRIORITY, level).physics, `L${level}`).toBeUndefined();
      // The waiting car rides every rung — without it there is no temptation.
      expect(compileScenario(SC_RB_CIRCULATE_PRIORITY, level).stagedEvents?.map((e) => e.kind)).toEqual([
        "priorityFromRight",
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-ac-night-overdrive — the beam is the limit, not the sign (SP-07 + AC-01)
// ---------------------------------------------------------------------------

describe("wave-2 bot completion — sc-ac-night-overdrive at L3", () => {
  const lesson = compileScenario(SC_AC_NIGHT_OVERDRIVE, 3);
  let session = createLessonSession(lesson);
  recordScAcNightOverdriveDrive(loadDistrict("ov-oncoming-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_AC_NIGHT_OVERDRIVE.rubric!).stars).toBe(3);
  });

  it("the drill is won by the SPEED it arrives with: adapted first, then the stop", () => {
    // The 58 km/h cap on the transit gate IS the authored night envelope: a car
    // carrying the lawful 90 through the dark cannot satisfy it at all, and is
    // still doing ~62 km/h at the trailer, far outside the 6 km/h stop mark.
    const adapted = result.objectives.find((o) => o.id === "sc-acno-adapted")!;
    const mark = result.objectives.find((o) => o.id === "sc-acno-mark")!;
    expect(adapted.done).toBe(true);
    expect(mark.done).toBe(true);
    expect(adapted.completedAtSec!).toBeLessThan(mark.completedAtSec!);
  });

  it("the LIVE session runs DARK and carries the per-drill night envelope", () => {
    expect(lesson.environment?.timeOfDay).toBe("night");
    // The authored unlit-segment factor reaches the student's own attempt —
    // without it the engine default (1) would grade a blind 90 as flawless.
    expect(lesson.ruleConfig?.conditionSpeedNightFactor).toBe(0.65);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ac-night-overdrive@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ac-night-overdrive@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the posted-limit 90 grades COLLISION in the dark, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_AC_NIGHT_OVERDRIVE, 3));
    recordScAcNightOverdriveDrive(loadDistrict("ov-oncoming-v1"), "mistake-posted-limit", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // COLLISION is an опасна (terminating) fault — it scores immediately rather
    // than landing on the teach-moment channel.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    // …and the drill's own gate bites too: it was doing 90 at the transit zone.
    expect(r.objectives.find((o) => o.id === "sc-acno-adapted")!.done).toBe(false);
    expect(r.passed).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(scoreRubric(r, SC_AC_NIGHT_OVERDRIVE.rubric!).stars).toBe(1);
  });

  it("counter-proof: the dark drive TEACHES HEADLIGHTS_OFF_AT_NIGHT, then GRADES it once", () => {
    let s = createLessonSession(compileScenario(SC_AC_NIGHT_OVERDRIVE, 3));
    const taught: string[] = [];
    recordScAcNightOverdriveDrive(loadDistrict("ov-oncoming-v1"), "mistake-lights-off", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    // HEADLIGHTS_OFF_AT_NIGHT is a teachable основна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught чл. 70, not merely docked. The §9
    // code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-ac-night-overdrive-traces.
    //
    // AND THE SECOND HALF, ADDED 2026-08-26 (`rules/engine.ts
    // STANDING_DUTY_REGRADE_SEC`) — the line it replaces asserted that a drive
    // which ran the WHOLE night section dark books no violation at all, ever.
    // That is the finding: `sc-ac-night-lights / pc-wrong` reached its debrief
    // on «Опасни 0 · Основни 0 · Второстепенни 0» under «Какво се получи
    // добре: чисто каране по изпитния лист», having driven the entire night
    // section unlit. The free mini-lesson forgives a first MISTAKE, not a
    // lesson-long omission; the lamps still teach first, and are then graded
    // ONCE, ten driving seconds later (`STANDING_DUTY_MAX_BILLS` = 2 bills per
    // episode, so the debrief can never grow a rattle of lamp rows either).
    expect(taught).toEqual(["HEADLIGHTS_OFF_AT_NIGHT"]);
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual([
      "HEADLIGHTS_OFF_AT_NIGHT",
    ]);
  });

  it("the trailer never grades the live student: it is a RECORDER rect (the wet-braking mold)", () => {
    // No staged actor on any rung — a lead car's tail lights would MARK the
    // hazard and delete the lesson. The live student's graded skill is the
    // adapted approach + the stop mark; the ghosts carry the consequence.
    expect(lesson.stagedEvents ?? []).toEqual([]);
  });

  it("compiles at every authored rung; L5 rains over the night without re-tuning the envelope", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_AC_NIGHT_OVERDRIVE, level).id).toBe(`sc-ac-night-overdrive@L${level}`);
    }
    expect(compileScenario(SC_AC_NIGHT_OVERDRIVE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_AC_NIGHT_OVERDRIVE, 4).examMode).toBe(true);
    // Night rides EVERY rung (the template-level condition): compileScenario
    // spreads the rung over the template, so L5's rain adds weather without
    // dropping the dark that IS the drill.
    for (const level of [1, 3, 5] as const) {
      expect(compileScenario(SC_AC_NIGHT_OVERDRIVE, level).environment?.timeOfDay, `L${level}`).toBe("night");
    }
    const l5 = compileScenario(SC_AC_NIGHT_OVERDRIVE, 5);
    expect(l5.environment?.rain).toBe(true);
    // The engine composes condition factors by MIN, so the rain factor (0.85)
    // never loosens the stricter authored night factor (0.65) — the envelope is
    // 58.5 on every rung and the ghosts stay in tune.
    expect(l5.ruleConfig?.conditionSpeedNightFactor).toBe(0.65);
    // ADR-006 stage 4a: the rain renders and grades the conditions envelope — it
    // never silently reduces the live car's grip (this template's ghost envelope
    // is dry-tuned; per-RUNG physics has no seam today — see the wave report).
    expect(l5.physics).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sc-sp-limit-end — a В26 dies at its endpoint, not where the driver decides
//                   (ЗДвП чл. 21; Наредба № РД-02-21-1/2023)
// ---------------------------------------------------------------------------

describe("wave-2 bot completion — sc-sp-limit-end at L3", () => {
  const lesson = compileScenario(SC_SP_LIMIT_END, 3);
  let session = createLessonSession(lesson);
  recordScSpLimitEndDrive(loadDistrict("sp-signs-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_SP_LIMIT_END.rubric!).stars).toBe(3);
  });

  it("the drill is won TWICE: the limit held to the junction, then to the plate", () => {
    // Each gate sits 30 m short of one endpoint, capped at 43 km/h — just under
    // the graced 44. They are satisfiable ONLY by a driver still doing 40 at the
    // last metre of the span. Holding to BOTH is the whole lesson: one endpoint
    // is a junction, the other a sign, and neither is „about here".
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    expect(at("sc-sple-hold-to-junction").done).toBe(true);
    expect(at("sc-sple-hold-to-sign").done).toBe(true);
    expect(at("sc-sple-finish").done).toBe(true);
    // In route order — junction endpoint first, plate endpoint second.
    expect(at("sc-sple-hold-to-junction").completedAtSec!).toBeLessThan(at("sc-sple-hold-to-sign").completedAtSec!);
    expect(at("sc-sple-hold-to-sign").completedAtSec!).toBeLessThan(at("sc-sple-finish").completedAtSec!);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-sp-limit-end@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-sp-limit-end@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: accelerating 200 m early TEACHES SPEEDING_OVER_LIMIT, and misses the junction gate", () => {
    let s = createLessonSession(compileScenario(SC_SP_LIMIT_END, 3));
    const taught: string[] = [];
    recordScSpLimitEndDrive(loadDistrict("sp-signs-v1"), "mistake-early-accel", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // SPEEDING_OVER_LIMIT is a teachable второстепенна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught the scope rule, not merely docked.
    // The §9 code assert lives on the trace gate, where the recorder's own
    // engine grades every encounter: traces/__tests__/sc-sp-limit-end-traces.
    expect(taught).toEqual(["SPEEDING_OVER_LIMIT"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    // …and the drill's own gate bites independently of the detector: it was
    // doing ~48 at y = 310, so it was never „still in the zone at 40" there.
    expect(r.objectives.find((o) => o.id === "sc-sple-hold-to-junction")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    // The second gate stays unreached too — objectives are a SEQUENTIAL chain
    // (engine.ts advances currentIndex only on completion), so missing the
    // junction endpoint ends the run's scoring there. That this demo actually
    // drives span 2 clean — i.e. it breaks ONE endpoint's rule, not both — is
    // proven where the recorder's own engine grades every metre:
    // traces/__tests__/sc-sp-limit-end-traces („each demo breaks ONE endpoint").
    expect(r.objectives.find((o) => o.id === "sc-sple-hold-to-sign")!.done).toBe(false);
  });

  it("counter-proof: the big overspeed grades SPEEDING_DANGEROUS on the spot, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_SP_LIMIT_END, 3));
    recordScSpLimitEndDrive(loadDistrict("sp-signs-v1"), "mistake-big-overspeed", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // SPEEDING_DANGEROUS is an ОПАСНА fault — docked on the first encounter,
    // never softened to a teach card (доc 32: > +10 км/ч terminates the exam).
    expect(s.events.some((e) => e.kind === "violation" && e.code === "SPEEDING_DANGEROUS")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_SP_LIMIT_END.rubric!).stars).toBe(1);
    // Mirror image of the other demo: it held span 1 to the junction and threw
    // away span 2 — the two demos fail opposite endpoints.
    expect(r.objectives.find((o) => o.id === "sc-sple-hold-to-junction")!.done).toBe(true);
    expect(r.objectives.find((o) => o.id === "sc-sple-hold-to-sign")!.done).toBe(false);
  });

  it("compiles at every authored rung; L4 is the exam rung, and nothing is staged or physics-tuned", () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(SC_SP_LIMIT_END, level).id).toBe(`sc-sp-limit-end@L${level}`);
    }
    expect(compileScenario(SC_SP_LIMIT_END, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_SP_LIMIT_END, 4).examMode).toBe(true);
    // L5 is deliberately NOT authored: the fault is a READING of the signs, not
    // a condition — rain or night would decorate the scope rule without
    // teaching it (the sc-pk-busstop-ban precedent).
    expect(() => compileScenario(SC_SP_LIMIT_END, 5)).toThrow();
    // No staged actor on any rung: the empty street is the point — the ONLY
    // gradable fault is the driver's own speed against the segment-local limit.
    for (const level of [1, 3, 4] as const) {
      expect(compileScenario(SC_SP_LIMIT_END, level).stagedEvents ?? [], `L${level}`).toEqual([]);
    }
    expect(compileScenario(SC_SP_LIMIT_END, 3).physics).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sc-merge-lane-end — the zipper at a lane drop: YOUR lane ends, so YOU give
//                     way (OV-16 + чл. 25)
// ---------------------------------------------------------------------------

describe("wave-2 bot completion — sc-merge-lane-end at L3", () => {
  const lesson = compileScenario(SC_MERGE_LANE_END, 3);
  let session = createLessonSession(lesson);
  recordScMergeLaneEndDrive(loadDistrict("ln-merge-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_MERGE_LANE_END.rubric!).stars).toBe(3);
  });

  it("the drill is won by GETTING OUT of the dying lane: the gate is unreachable from it", () => {
    // Radius 3.5 m < half the 8.125 m lane pitch, pinned on the survivor lane
    // 4 m short of the taper's end — a car still riding the ending lane at
    // y = 236 is a full lane pitch away and misses it outright. That gate IS
    // „влях ли се" (no lane-drop world zone exists — see gen_ln_merge.mjs).
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    expect(at("sc-mle-merge").done).toBe(true);
    expect(at("sc-mle-finish").done).toBe(true);
    // In route order — merged first, ran the survivor lane out after.
    expect(at("sc-mle-merge").completedAtSec!).toBeLessThan(at("sc-mle-finish").completedAtSec!);
  });

  it("the LIVE session earns SAFE_LANE_CHANGE — the taught act, not just the absence of faults", () => {
    expect(
      session.events.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE"),
    ).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-merge-lane-end@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-merge-lane-end@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the blind merge grades MIRROR_CHECK + COLLISION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_MERGE_LANE_END, 3));
    recordScMergeLaneEndDrive(loadDistrict("ln-merge-v1"), "mistake-push-out", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // COLLISION is an опасна (terminating) fault — it scores immediately rather
    // than landing on the teach-moment channel.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_MERGE_LANE_END.rubric!).stars).toBe(1);
  });

  it("counter-proof: the silent last-metre merge TEACHES LANE_CHANGE_WITHOUT_INDICATOR", () => {
    let s = createLessonSession(compileScenario(SC_MERGE_LANE_END, 3));
    const taught: string[] = [];
    recordScMergeLaneEndDrive(loadDistrict("ln-merge-v1"), "mistake-no-indicator", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    // LANE_CHANGE_WITHOUT_INDICATOR is a teachable основна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught чл. 25, not merely docked. The §9
    // code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-merge-lane-end-traces.
    expect(taught).toEqual(["LANE_CHANGE_WITHOUT_INDICATOR"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("teach-first, not punish: the unsignalled merge still gets out of the lane and completes", () => {
    // This demo checks its mirror and merges — late and silently, but it does
    // merge — so it takes the card, clears both gates and completes with a
    // clean sheet (doc 76 §0: mistakes are DEMONSTRATED, never scored).
    let s = createLessonSession(compileScenario(SC_MERGE_LANE_END, 3));
    recordScMergeLaneEndDrive(loadDistrict("ln-merge-v1"), "mistake-no-indicator", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(r.completedAll).toBe(true);
    expect(r.score).toBe(0);
    // …but it never earns the commendation: the ritual was incomplete.
    expect(s.events.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE")).toBe(false);
  });

  it("THE MAP'S SIZING LAW reaches the LIVE session: the merged driver is never docked for keeping left", () => {
    // On a span-less 2-lane one-way the engine computes rightmostRequiredLane
    // = 0, so the correctly-merged driver in laneId 1 is a keep-right candidate
    // — the doc-72 OV-16 lane-drop zone that would exempt him does not exist.
    // The map answers structurally (gen_ln_merge.mjs asserts the budget at
    // build time); this proves the answer survives the production pipeline.
    expect(session.events.some((e) => e.kind === "violation" && e.code === "NOT_KEEPING_RIGHT")).toBe(false);
  });

  it("the through-lane car never grades: it is pressure scenery, the CHECK is the duty (A12)", () => {
    // The rearTailgater runner emits ZERO SimTick events by contract, so no code
    // in any session can originate from the car you must not cut off. That is
    // why the template is honest: the blind demo's COLLISION is an AUTHORED
    // beat depicting geometry the trace gate independently proves (the wheel
    // goes over with no glance behind it), never a silent detector.
    expect(lesson.stagedEvents?.map((e) => e.kind)).toEqual(["rearTailgater"]);
  });

  it("compiles at every authored rung; L5 adds a SECOND through-lane car, and no rung touches physics", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_MERGE_LANE_END, level).id).toBe(`sc-merge-lane-end@L${level}`);
    }
    expect(compileScenario(SC_MERGE_LANE_END, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_MERGE_LANE_END, 4).examMode).toBe(true);
    // L5 = denser pressure in the lane you must join: the пролука has to be
    // CHOSEN, not just taken. Both cars are learn-only scenery.
    const l5 = compileScenario(SC_MERGE_LANE_END, 5);
    expect(l5.stagedEvents?.map((e) => e.kind)).toEqual(["rearTailgater", "rearTailgater"]);
    expect(l5.stagedEvents?.map((e) => e.id)).toEqual(["sc-mle-through-car", "sc-mle-through-car-2"]);
    // ADR-006 stage 4a: the authored ghost envelope is dry-tuned, so no rung
    // silently reduces the live car's grip.
    for (const level of [1, 3, 4, 5] as const) {
      expect(compileScenario(SC_MERGE_LANE_END, level).physics, `L${level}`).toBeUndefined();
    }
    // The first car rides every rung — without it there is no пролука to judge.
    for (const level of [1, 3, 4] as const) {
      expect(compileScenario(SC_MERGE_LANE_END, level).stagedEvents?.map((e) => e.kind)).toEqual([
        "rearTailgater",
      ]);
    }
  });
});
