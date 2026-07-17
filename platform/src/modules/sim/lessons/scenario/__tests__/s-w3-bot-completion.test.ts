/**
 * Wave-3 bot-completion proofs (doc 76 §10; the s-batch2 / s-w1 / s-w2 mold) —
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
import { recordScFoBrakelightChainDrive } from "../../../traces/scFoBrakelightChain";
import { recordScHzEmergencyStopDrive } from "../../../traces/scHzEmergencyStop";
import { recordScJxPriorityConfidenceDrive } from "../../../traces/scJxPriorityConfidence";
import { recordScMergeRoadworksShiftDrive } from "../../../traces/scMergeRoadworksShift";
import { recordScOvBeingOvertakenDrive } from "../../../traces/scOvBeingOvertaken";
import { recordScPkStopVsParkDrive } from "../../../traces/scPkStopVsPark";
import { recordScRbBusyGapDrive } from "../../../traces/scRbBusyGap";
import { recordScSigGreenWaveDrive } from "../../../traces/scSigGreenWave";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_FO_BRAKELIGHT_CHAIN } from "../templates-following2";
import { SC_HZ_EMERGENCY_STOP } from "../templates-hazards2";
import { SC_JX_PRIORITY_CONFIDENCE } from "../templates-junctions3";
import { SC_OV_BEING_OVERTAKEN } from "../templates-lanes2";
import { SC_MERGE_ROADWORKS_SHIFT } from "../templates-merging";
import { SC_PK_STOP_VS_PARK } from "../templates-parking2";
import { SC_RB_BUSY_GAP } from "../templates-roundabout";
import { SC_SIG_GREEN_WAVE } from "../templates-signals2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

// ---------------------------------------------------------------------------
// sc-pk-stop-vs-park — В27 срещу В28: the drill is won by USING a permission,
//                      not only by avoiding a ban
// ---------------------------------------------------------------------------

describe("wave-3 bot completion — sc-pk-stop-vs-park at L3", () => {
  const lesson = compileScenario(SC_PK_STOP_VS_PARK, 3);
  let session = createLessonSession(lesson);
  recordScPkStopVsParkDrive(loadDistrict("pk-ban2-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_PK_STOP_VS_PARK.rubric!).stars).toBe(3);
  });

  it("the drill is won by the STOP the learner thinks is forbidden, in the right order", () => {
    // sc-pkb2-dropoff has maxSpeedKmh 6 inside a 4 m radius at y = 120 — the
    // middle of the В28 span. It is satisfiable ONLY by actually resting under
    // the plate. „Спрях под знака и не ме глобиха" IS the objective; the other
    // three parking templates all score the opposite reflex.
    const dropoff = result.objectives.find((o) => o.id === "sc-pkb2-dropoff")!;
    const pastBan = result.objectives.find((o) => o.id === "sc-pkb2-past-ban")!;
    const park = result.objectives.find((o) => o.id === "sc-pkb2-legal-park")!;
    expect(dropoff.done).toBe(true);
    expect(pastBan.done).toBe(true);
    expect(park.done).toBe(true);
    // Dropped off FIRST (under В28), cleared В27 second, parked last — proof
    // the bot read both plates in sequence rather than driving to the end.
    expect(dropoff.completedAtSec!).toBeLessThan(pastBan.completedAtSec!);
    expect(pastBan.completedAtSec!).toBeLessThan(park.completedAtSec!);
  });

  it("the LIVE session grades the В28 rest as innocent — the thesis, through the session", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. A В28 span that billed would fail here.
    expect(session.events.some((e) => e.kind === "violation" && e.code === "ILLEGAL_STOP_IN_BAN_ZONE")).toBe(
      false,
    );
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-pk-stop-vs-park@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-pk-stop-vs-park@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: carrying the В28 permission past the seam TEACHES ILLEGAL_STOP_IN_BAN_ZONE", () => {
    let s = createLessonSession(compileScenario(SC_PK_STOP_VS_PARK, 3));
    const taught: string[] = [];
    recordScPkStopVsParkDrive(loadDistrict("pk-ban2-v1"), "mistake-permission-past-seam", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    // ILLEGAL_STOP_IN_BAN_ZONE is a teachable основна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught чл. 98, not merely docked. The §9
    // code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-pk-stop-vs-park-traces.
    expect(taught).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("counter-proof: the „минутка“ demo takes the same card AND skips the В28 drop-off", () => {
    // The two demos are two different lessons, and BOTH lose the same way: a
    // driver who fears the plates never uses the престой В28 grants him, so the
    // first objective is unreachable no matter how the rest of the drive goes.
    // That asymmetry is the template's whole grading claim — the В27 rest is
    // taught, and the missed В28 permission is what actually fails the drill.
    let s = createLessonSession(compileScenario(SC_PK_STOP_VS_PARK, 3));
    const taught: string[] = [];
    recordScPkStopVsParkDrive(loadDistrict("pk-ban2-v1"), "mistake-minute-under-v27", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(r.objectives.find((o) => o.id === "sc-pkb2-dropoff")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-ov-being-overtaken — the drill is won by NOT acting: hold your speed while
//                         someone else's maneuver runs past you
// ---------------------------------------------------------------------------

describe("wave-3 bot completion — sc-ov-being-overtaken at L3", () => {
  const lesson = compileScenario(SC_OV_BEING_OVERTAKEN, 3);
  let session = createLessonSession(lesson);
  recordScOvBeingOvertakenDrive(loadDistrict("ov-oncoming-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_OV_BEING_OVERTAKEN.rubric!).stars).toBe(3);
  });

  it("the speed gate is cleared where the overtaker is ALONGSIDE, before the finish", () => {
    // sc-ovbo-hold carries maxSpeedKmh 75 at y = 380 — the measured alongside
    // point. Passing it is the чл. 42, ал. 2 contract: a driver who answers the
    // pass with throttle is simply never in that zone slowly enough.
    const hold = result.objectives.find((o) => o.id === "sc-ovbo-hold")!;
    const finish = result.objectives.find((o) => o.id === "sc-ovbo-finish")!;
    expect(hold.done).toBe(true);
    expect(finish.done).toBe(true);
    expect(hold.completedAtSec!).toBeLessThan(finish.completedAtSec!);
  });

  it("the LIVE session agrees the lawful response is innocent — no speed or line code", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. Easing off under pressure must never bill.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
    expect(codes).not.toContain("CENTER_LINE_TOUCHED");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ov-being-overtaken@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ov-being-overtaken@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the throttle-up CANNOT satisfy the hold gate — the drill has teeth", () => {
    // The objective is the template's real grading claim (doc 72 OV-10 marks the
    // being-overtaken detector 🔴 NEW — there is no code for „accelerated while
    // overtaken", and the actor emits none). So the gate must be what stops the
    // ego drive: same district, same actors, same route — only the throttle
    // differs, and the drill is lost.
    let s = createLessonSession(compileScenario(SC_OV_BEING_OVERTAKEN, 3));
    recordScOvBeingOvertakenDrive(loadDistrict("ov-oncoming-v1"), "mistake-accelerating", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(r.objectives.find((o) => o.id === "sc-ovbo-hold")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: the left drift keeps its speed but loses the drive to the осева", () => {
    // The mirror image of the demo above: this driver's THROTTLE is faultless,
    // so it clears the speed gate — and still fails, on the line. Two demos,
    // two independent channels, one duty (чл. 42, ал. 2 + чл. 15).
    let s = createLessonSession(compileScenario(SC_OV_BEING_OVERTAKEN, 3));
    const taught: string[] = [];
    recordScOvBeingOvertakenDrive(loadDistrict("ov-oncoming-v1"), "mistake-drifting-left", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(r.objectives.find((o) => o.id === "sc-ovbo-hold")!.done).toBe(true);
    const billed = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect([...billed, ...taught]).toContain("CENTER_LINE_TOUCHED");
  });
});

// ---------------------------------------------------------------------------
// sc-merge-roadworks-shift — временната сигнализация е закон: read the closure
//                            early, merge once, hold the site's own 30
// ---------------------------------------------------------------------------

describe("wave-3 bot completion — sc-merge-roadworks-shift at L3", () => {
  const lesson = compileScenario(SC_MERGE_ROADWORKS_SHIFT, 3);
  let session = createLessonSession(lesson);
  recordScMergeRoadworksShiftDrive(loadDistrict("hz-roadworks-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_MERGE_ROADWORKS_SHIFT.rubric!).stars).toBe(3);
  });

  it("the drill is won TWICE: out of the closed lane in time, then AT the temporary pace", () => {
    // Gate 1 (r = 3.5 < half the 8.125 m lane pitch) is satisfiable only from
    // the open lane, pinned where the taper has all but finished — a car still
    // riding the closed lane at y = 234 misses it outright.
    // Gate 2 adds maxSpeedKmh 33 (the graced 30) ON the open lane mid-site, so
    // „снижи скоростта" and „дръж новата траектория" are ONE objective: a
    // driver who carries the street's 50 into the works cannot satisfy it
    // either, however neatly he merged.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    expect(at("sc-mrs-merged").done).toBe(true);
    expect(at("sc-mrs-works-pace").done).toBe(true);
    expect(at("sc-mrs-finish").done).toBe(true);
    // In route order — merged first, then rode the site, then out.
    expect(at("sc-mrs-merged").completedAtSec!).toBeLessThan(at("sc-mrs-works-pace").completedAtSec!);
    expect(at("sc-mrs-works-pace").completedAtSec!).toBeLessThan(at("sc-mrs-finish").completedAtSec!);
  });

  it("the LIVE session earns SAFE_LANE_CHANGE — the taught act, not just the absence of faults", () => {
    expect(
      session.events.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE"),
    ).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-merge-roadworks-shift@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-merge-roadworks-shift@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  /** Drive one authored demo through a LIVE session, collecting the A9
   *  teach-moment channel alongside the session's own events. */
  const liveDemo = (name: "mistake-no-indicator" | "mistake-squeeze-cones") => {
    let s = createLessonSession(compileScenario(SC_MERGE_ROADWORKS_SHIFT, 3));
    const taught: string[] = [];
    recordScMergeRoadworksShiftDrive(loadDistrict("hz-roadworks-v1"), name, {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    return { session: s, taught, result: buildLessonResult(s) };
  };

  it("counter-proof: the silent last-metre merge TEACHES LANE_CHANGE_WITHOUT_INDICATOR", () => {
    const { session: s, taught } = liveDemo("mistake-no-indicator");
    // LANE_CHANGE_WITHOUT_INDICATOR is a teachable основна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught чл. 25, not merely docked. The §9
    // code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-merge-roadworks-shift-traces.
    expect(taught).toEqual(["LANE_CHANGE_WITHOUT_INDICATOR"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("teach-first, not punish: the seen-but-unsignalled merge still lets the drill complete", () => {
    // This demo looks, merges late and holds the site's 30 correctly — it only
    // omits the indicator. So it takes the card, reaches every gate and
    // completes with a clean sheet (doc 76 §0: mistakes are DEMONSTRATED, never
    // scored)…
    const { session: s, result: r } = liveDemo("mistake-no-indicator");
    expect(r.completedAll).toBe(true);
    expect(r.score).toBe(0);
    // …but it never earns the commendation: the ritual was incomplete.
    expect(s.events.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE")).toBe(false);
  });

  it("counter-proof: the cone squeeze grades COLLISION, misses both duty gates, not passed, 1★", () => {
    const { session: s, result: r } = liveDemo("mistake-squeeze-cones");
    // COLLISION is an опасна (terminating) fault — it scores immediately rather
    // than landing on the teach-moment channel.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    // …and the drill's own gates bite independently of any detector: it was
    // still in the closed lane at y = 234, and it dragged the boundary line
    // ~3.8 m off the open lane's center through the whole site.
    expect(r.objectives.find((o) => o.id === "sc-mrs-merged")!.done).toBe(false);
    expect(r.objectives.find((o) => o.id === "sc-mrs-works-pace")!.done).toBe(false);
    expect(r.passed).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(scoreRubric(r, SC_MERGE_ROADWORKS_SHIFT.rubric!).stars).toBe(1);
  });

  it("HONEST SCOPE: the cone contact above comes from the RECORDER, not from the live scene", () => {
    // Flagged deliberately, so this green test never reads as more than it is
    // (gen_hz_roadworks.mjs's header, gap 1): the cones are recorder obstacle
    // rects, and this proof drives a RECORDED script — so the ticks fed to the
    // session carry the recorder's cone collisions. A live student in
    // LessonScene meets no cone: it derives ScenarioObstacles from occupied
    // parking BAYS alone, and the district's meta.scenario.cones seam is not
    // read yet. What still bites a live student is everything else asserted
    // here — the two objective gates and POOR_LANE_KEEPING — which is exactly
    // why this template's verdict never rests on the contact alone.
    const raw = loadDistrict("hz-roadworks-v1") as { meta: { scenario: { cones: unknown[] } } };
    expect(raw.meta.scenario.cones.length).toBe(10);
  });

  it("the open-lane car never grades: it is pressure scenery, the DECISION is the duty (A12)", () => {
    // The rearTailgater runner emits ZERO SimTick events by contract, so no
    // code in any session can originate from it. Unlike scMergeLaneEnd, this
    // template needs no authored collision beat at all: the cone rects give the
    // wrong drive a real, geometric consequence instead of a narrated one.
    expect(lesson.stagedEvents?.map((e) => e.kind)).toEqual(["rearTailgater"]);
  });

  it("compiles at every authored rung; L5 adds night + rain WITHOUT touching the dry-tuned physics", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_MERGE_ROADWORKS_SHIFT, level).id).toBe(
        `sc-merge-roadworks-shift@L${level}`,
      );
    }
    expect(compileScenario(SC_MERGE_ROADWORKS_SHIFT, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_MERGE_ROADWORKS_SHIFT, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_MERGE_ROADWORKS_SHIFT, 5);
    expect(l5.environment?.rain).toBe(true);
    expect(l5.environment?.timeOfDay).toBe("night");
    // ADR-006 stage 4a: the works under lamps render and grade the conditions
    // envelope — they never silently reduce the live car's grip (this
    // template's ghost envelope is dry-tuned; the taught delta is READING the
    // temporary signalling, not braking distance).
    expect(l5.physics).toBeUndefined();
    // The open-lane car rides every rung — without it the пролука is free and
    // there is nothing to time the merge against.
    for (const level of [1, 3, 5] as const) {
      expect(
        compileScenario(SC_MERGE_ROADWORKS_SHIFT, level).stagedEvents?.map((e) => e.kind),
        `L${level}`,
      ).toEqual(["rearTailgater"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-jx-priority-confidence — предимството е и задължение: the drill is won by
//                             passing a junction and giving the engine NOTHING
//                             to say
// ---------------------------------------------------------------------------

describe("wave-3 bot completion — sc-jx-priority-confidence at L3", () => {
  const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, 3);
  let session = createLessonSession(lesson);
  recordScJxPriorityConfidenceDrive(loadDistrict("tj-stop-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_JX_PRIORITY_CONFIDENCE.rubric!).stars).toBe(3);
  });

  it("clears both gates in route order — approached under the limit, then crossed", () => {
    const approach = result.objectives.find((o) => o.id === "sc-jxpc-approach")!;
    const cross = result.objectives.find((o) => o.id === "sc-jxpc-cross")!;
    expect(approach.done).toBe(true);
    expect(cross.done).toBe(true);
    expect(approach.completedAtSec!).toBeLessThan(cross.completedAtSec!);
  });

  it("THE THESIS, through the live session: the priority driver is billed NOTHING", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. A car waited at the Б2 on this driver's right
    // and a лепка sat on their bumper for the whole drive — and holding a steady
    // 46 km/h through the box is innocent on every channel. If tj-n-c ever
    // flipped to an uncontrolled junction, FAILED_TO_YIELD would land here.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-jx-priority-confidence@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-jx-priority-confidence@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the phantom brake TEACHES HARSH_BRAKING_NO_CAUSE", () => {
    let s = createLessonSession(compileScenario(SC_JX_PRIORITY_CONFIDENCE, 3));
    const taught: string[] = [];
    recordScJxPriorityConfidenceDrive(loadDistrict("tj-stop-v1"), "mistake-phantom-brake", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    // HARSH_BRAKING_NO_CAUSE is a teachable основна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught чл. 20, not merely docked. The §9
    // code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-jx-priority-confidence-traces.
    expect(taught).toEqual(["HARSH_BRAKING_NO_CAUSE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
  });

  it("teach-first, not punish: the panicking driver still finishes the route", () => {
    // This driver's ONLY fault is the stop. He takes the card, then drives on
    // and reaches both gates — so the drill completes with a clean sheet (doc 76
    // §0: mistakes are DEMONSTRATED, never scored). The lesson is the card.
    let s = createLessonSession(compileScenario(SC_JX_PRIORITY_CONFIDENCE, 3));
    recordScJxPriorityConfidenceDrive(loadDistrict("tj-stop-v1"), "mistake-phantom-brake", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(r.completedAll).toBe(true);
    expect(r.score).toBe(0);
  });

  it("counter-proof: blind priority against the L5 нахлуващ grades COLLISION, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_JX_PRIORITY_CONFIDENCE, 3));
    recordScJxPriorityConfidenceDrive(loadDistrict("tj-stop-v1"), "mistake-blind-priority", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // COLLISION is an опасна (terminating) fault — it scores immediately rather
    // than landing on the teach-moment channel. Note the driver did nothing
    // "wrong" by the letter: he was on the priority road, under the limit, in
    // his lane. чл. 20 is the whole difference.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_JX_PRIORITY_CONFIDENCE.rubric!).stars).toBe(1);
  });

  it("the лепка never grades: it is pressure scenery, the DECISION is the duty (A12)", () => {
    // The rearTailgater runner emits ZERO SimTick events by contract, so the
    // phantom brake's conviction can only come from the player's own pedal — a
    // rear car is not a forward cause in the harsh-brake cause ledger. That
    // separation is what makes „не спирай без причина" gradeable at all.
    expect(lesson.stagedEvents?.map((e) => e.kind)).toEqual([
      "priorityFromRight",
      "rearTailgater",
    ]);
  });

  it("compiles at every authored rung; L5 adds the нахлуващ + rain, physics stays dry", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_JX_PRIORITY_CONFIDENCE, level).id).toBe(
        `sc-jx-priority-confidence@L${level}`,
      );
    }
    expect(compileScenario(SC_JX_PRIORITY_CONFIDENCE, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_JX_PRIORITY_CONFIDENCE, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_JX_PRIORITY_CONFIDENCE, 5);
    expect(l5.environment?.rain).toBe(true);
    // ADR-006 stage 4a: rain renders, it never silently reduces the live car's
    // grip — this ghost's envelope is dry-tuned, and the taught L5 delta is
    // READING the creeper early, not braking distance.
    expect(l5.physics).toBeUndefined();
    // The creeper exists ONLY at L5 — that rung is the q-predimstvo-002 case,
    // and the base rungs would stop teaching „не спирай" if it rode them too.
    expect(l5.stagedEvents?.map((e) => e.id)).toEqual([
      "sc-jxpc-waiter",
      "sc-jxpc-tail",
      "sc-jxpc-creeper",
    ]);
    for (const level of [1, 3, 4] as const) {
      expect(
        compileScenario(SC_JX_PRIORITY_CONFIDENCE, level).stagedEvents?.map((e) => e.id),
        `L${level}`,
      ).toEqual(["sc-jxpc-waiter", "sc-jxpc-tail"]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-sig-green-wave — the wave is a property of the MAP: hold 50 and three
//                     lamps open by themselves; sprint and you lose time
// ---------------------------------------------------------------------------

describe("wave-3 bot completion — sc-sig-green-wave at L3", () => {
  const lesson = compileScenario(SC_SIG_GREEN_WAVE, 3);
  let session = createLessonSession(lesson);
  recordScSigGreenWaveDrive(loadDistrict("sig-wave-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_SIG_GREEN_WAVE.rubric!).stars).toBe(3);
  });

  it("the drill is won by SPEED DISCIPLINE: the steady gate falls between the lamps", () => {
    const tl1 = result.objectives.find((o) => o.id === "sc-sgw-tl1")!;
    const steady = result.objectives.find((o) => o.id === "sc-sgw-steady")!;
    const tl3 = result.objectives.find((o) => o.id === "sc-sgw-tl3")!;
    expect([tl1.done, steady.done, tl3.done]).toEqual([true, true, true]);
    // Passed the first lamp, then held the band mid-block, then the third —
    // the route order the instructions describe.
    expect(tl1.completedAtSec!).toBeLessThan(steady.completedAtSec!);
    expect(steady.completedAtSec!).toBeLessThan(tl3.completedAtSec!);
  });

  it("the LIVE session inherits the wave from the district — nothing is pinned", () => {
    // The template authors NO signalPlan on purpose: a one-shot pin would rebase
    // the first cluster alone and shatter its 19 s relationship with the other
    // two. The wave must survive compilation as a property of sig-wave-v1.
    expect(lesson.signalPlan).toBeUndefined();
    expect(lesson.world?.districtId ?? SC_SIG_GREEN_WAVE.map.districtId).toBe("sig-wave-v1");
    expect(SC_SIG_GREEN_WAVE.staged).toEqual([]);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-sig-green-wave@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-sig-green-wave@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the sprint is refused by the OBJECTIVE, not just docked", () => {
    let s = createLessonSession(compileScenario(SC_SIG_GREEN_WAVE, 3));
    recordScSigGreenWaveDrive(loadDistrict("sig-wave-v1"), "mistake-sprint", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // The sprinter physically clears the first lamp on green (so sc-sgw-tl1
    // completes), then hits the mid-block gate at 57.9 km/h — over its
    // maxSpeedKmh 53 — and the run stalls there. Objectives advance
    // SEQUENTIALLY (lessons/engine.ts), so sc-sgw-tl3 never even arms: the
    // sprint does reach the third lamp on the road (the trace gate measures it
    // arriving there 1.5 s LATE), but the drill stopped counting at the band.
    // Speeding is refused by the OBJECTIVE, not merely docked as points.
    expect(r.objectives.find((o) => o.id === "sc-sgw-tl1")!.done).toBe(true);
    expect(r.objectives.find((o) => o.id === "sc-sgw-steady")!.done).toBe(false);
    expect(r.objectives.find((o) => o.id === "sc-sgw-tl3")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: the freeze on green TEACHES HESITATION_AT_GREEN and forfeits the wave", () => {
    let s = createLessonSession(compileScenario(SC_SIG_GREEN_WAVE, 3));
    const taught: string[] = [];
    recordScSigGreenWaveDrive(loadDistrict("sig-wave-v1"), "mistake-sleep-at-green", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // HESITATION_AT_GREEN is a teachable второстепенна fault, so its FIRST
    // encounter lands on the A9 teach-moment channel (pause + card), not on
    // session.events. The §9 code assert lives on the trace gate, where the
    // recorder's own engine grades every encounter.
    expect(taught).toEqual(["HESITATION_AT_GREEN"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    // And the consequence the card claims: the third lamp is never reached.
    expect(r.objectives.find((o) => o.id === "sc-sgw-tl3")!.done).toBe(false);
    expect(r.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-hz-emergency-stop — the drill where the TAUGHT act (a full-force stop) is
//                        the one the engine would otherwise fine
// ---------------------------------------------------------------------------

describe("wave-3 bot completion — sc-hz-emergency-stop at L3", () => {
  const lesson = compileScenario(SC_HZ_EMERGENCY_STOP, 3);
  let session = createLessonSession(lesson);
  recordScHzEmergencyStopDrive(loadDistrict("hz-obstacle-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_HZ_EMERGENCY_STOP.rubric!).stars).toBe(3);
  });

  it("the ruleConfig reaches the LIVE session — the thesis, through the student path", () => {
    // THE claim of this template (see the templates-hazards2 header): on a
    // crossing-less street the engine's harsh-brake cause ledger is structurally
    // blind to a staged dart, so a full-pedal stop — the exact act the lesson
    // orders — would bill 10 points as „рязко спиране без причина". The trace
    // gate proves the recorder's own engine agrees; THIS proves compileScenario
    // carried the override into the student-facing session too. Drop the
    // ruleConfig line and this test goes red, which is the point of it.
    expect(lesson.ruleConfig?.harshBrakeDecelMps2).toBe(25);
    expect(session.events.some((e) => e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE")).toBe(
      false,
    );
  });

  it("the drill is won by STOPPING, in the right order — not by crawling past", () => {
    const approach = result.objectives.find((o) => o.id === "sc-hzes-approach")!;
    const stop = result.objectives.find((o) => o.id === "sc-hzes-stop")!;
    const finish = result.objectives.find((o) => o.id === "sc-hzes-finish")!;
    expect(approach.done).toBe(true);
    expect(stop.done).toBe(true);
    expect(finish.done).toBe(true);
    // Approached at the posted speed, then came to REST short of the child, and
    // only then finished: the stop mark (radius 4 at y = 146, maxSpeedKmh 6) is
    // satisfiable only by actually stopping before her line at y = 150.
    expect(approach.completedAtSec!).toBeLessThan(stop.completedAtSec!);
    expect(stop.completedAtSec!).toBeLessThan(finish.completedAtSec!);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    // RED UNTIL INTEGRATION, by the file header's own note: templates-hazards2
    // is a NEW family file this wave, and gradeFinishWire resolves the id
    // through the templates.ts registry. Goes green the moment the main session
    // spreads SCENARIO_TEMPLATES_HAZARDS2 into SCENARIO_TEMPLATES — kept strict
    // (not tolerant of "unknown-lesson") so it stays a real gate afterwards,
    // exactly like the six sibling blocks in this file.
    const graded = gradeFinishWire({
      lessonId: "sc-hz-emergency-stop@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-hz-emergency-stop@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the late reaction hits the child, is SCORED (not taught), and fails the drill", () => {
    let s = createLessonSession(compileScenario(SC_HZ_EMERGENCY_STOP, 3));
    const taught: string[] = [];
    recordScHzEmergencyStopDrive(loadDistrict("hz-obstacle-v1"), "mistake-late-reaction", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // COLLISION is опасна + terminateSession, and the coach NEVER pauses a
    // modal on a dangerous/terminating code mid-drive (lessons/engine.ts: the
    // student may be mid-evasion; a freeze would teach the wrong reflex). So it
    // is SCORED straight onto session.events at L3 — the teach-card channel
    // stays empty here. The §9 exact-code assert lives on the trace gate:
    // traces/__tests__/sc-hz-emergency-stop-traces.
    expect(taught).toEqual([]);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    // The drill's own verdict: a driver who never stopped never completes it.
    expect(r.objectives.find((o) => o.id === "sc-hzes-stop")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: the swerve trades the stop for a second crash — and still fails the drill", () => {
    // The other half of the card's claim: steering instead of braking does not
    // win the drill either. The yank misses the child but leaves the lane, so
    // the stop mark (on x = 4.06) is unreachable and the curb side collects the
    // car — two faults for the price of avoiding one, on BOTH channels:
    // POOR_LANE_KEEPING is второстепенна, so its first encounter teaches (card),
    // while the COLLISION it ends in is опасна and scores.
    let s = createLessonSession(compileScenario(SC_HZ_EMERGENCY_STOP, 3));
    const taught: string[] = [];
    recordScHzEmergencyStopDrive(loadDistrict("hz-obstacle-v1"), "mistake-swerve", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual(["POOR_LANE_KEEPING"]);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    expect(r.objectives.find((o) => o.id === "sc-hzes-stop")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-rb-busy-gap — чл. 50а read to the end: „пропусни" is not „wait for an empty
//                  ring", and it is not „wait for one car" either
// ---------------------------------------------------------------------------

describe("wave-3 bot completion — sc-rb-busy-gap at L3", () => {
  const lesson = compileScenario(SC_RB_BUSY_GAP, 3);
  let session = createLessonSession(lesson);
  recordScRbBusyGapDrive(loadDistrict("rb-mini-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_RB_BUSY_GAP.rubric!).stars).toBe(3);
  });

  it("the drill is won by the WAIT: the yield-line gate, then the ring, then the exit", () => {
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    // The patience gate has teeth: radius 3 m around (4.06, −26) capped at
    // 6 km/h. Only a car that actually came down to yield speed AT the mouth
    // satisfies it — the barge demo rides through at ~22 km/h and misses it.
    expect(at("sc-rbg-yield-line").done).toBe(true);
    // The reachZone sits ON the ring centerline at the east mouth (18, 0), r = 6
    // — satisfiable only from the ring itself, mid-circulation.
    expect(at("sc-rbg-past-east").done).toBe(true);
    expect(at("sc-rbg-exit").done).toBe(true);
    // In route order: waited, then entered, then took the second spoke.
    expect(at("sc-rbg-yield-line").completedAtSec!).toBeLessThan(at("sc-rbg-past-east").completedAtSec!);
    expect(at("sc-rbg-past-east").completedAtSec!).toBeLessThan(at("sc-rbg-exit").completedAtSec!);
    // And the wait was REAL: > 9 s pass between reaching the line and the ring —
    // the platoon's two cars going by, one after the other.
    expect(
      at("sc-rbg-past-east").completedAtSec! - at("sc-rbg-yield-line").completedAtSec!,
    ).toBeGreaterThan(9);
  });

  it("the LIVE session earns YIELDED_TO_PRIORITY — the taught act, not just the absence of faults", () => {
    // The runtime only emits this when it SAW a circulating conflict and the
    // driver was at yield speed for it. A drive that found an empty ring could
    // not earn it, which is exactly why it is the honest proof of „изчаках".
    expect(session.events.some((e) => e.kind === "commendation" && e.code === "YIELDED_TO_PRIORITY")).toBe(
      true,
    );
  });

  it("the roundabout traversal is SIGNALLED — the A10 exit-window contract", () => {
    const exit = result.objectives.find((o) => o.id === "sc-rbg-exit")!;
    expect(exit.detail?.kind).toBe("roundabout");
    expect(exit.detail?.kind === "roundabout" && exit.detail.entered).toBe(true);
    expect(exit.detail?.kind === "roundabout" && exit.detail.exitSignaled).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-rb-busy-gap@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-rb-busy-gap@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
    const exit = graded.result.objectives.find((o) => o.id === "sc-rbg-exit")!;
    expect(exit.detail?.kind === "roundabout" && exit.detail.exitSignaled).toBe(true);
  });

  it("counter-proof: the barge grades FAILED_TO_YIELD on the spot, misses the wait gate, 1★", () => {
    let s = createLessonSession(compileScenario(SC_RB_BUSY_GAP, 3));
    recordScRbBusyGapDrive(loadDistrict("rb-mini-v1"), "mistake-barge-lead", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // FAILED_TO_YIELD is an ОПАСНА (10-point) fault — docked on the first
    // encounter, never softened to a teach card (engine.ts: a safety event must
    // not pop a modal mid-drive, and must not be forgiven).
    expect(s.events.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")).toBe(true);
    // …and the drill's own gate bites independently of the detector: it was
    // doing ~22 km/h at the yield line, so it was never „waiting" there.
    expect(r.objectives.find((o) => o.id === "sc-rbg-yield-line")!.done).toBe(false);
    expect(r.passed).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(scoreRubric(r, SC_RB_BUSY_GAP.rubric!).stars).toBe(1);
  });

  it("counter-proof: the short-gap entry PASSES the wait gate and still fails — the sharper lesson", () => {
    let s = createLessonSession(compileScenario(SC_RB_BUSY_GAP, 3));
    recordScRbBusyGapDrive(loadDistrict("rb-mini-v1"), "mistake-short-gap", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    // This is the whole point of the template. This driver DID slow down, DID
    // stop at the line, and DID let a car through — so it satisfies the patience
    // gate the barge misses…
    expect(r.objectives.find((o) => o.id === "sc-rbg-yield-line")!.done).toBe(true);
    // …and it still refuses priority and crashes, because „пропусни" was read as
    // „изчакай една кола". Two опасни faults, no teach card for either.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD")).toBe(true);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    // It never reaches the ring gate: the crash ends the drive on the chord.
    expect(r.objectives.find((o) => o.id === "sc-rbg-past-east")!.done).toBe(false);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_RB_BUSY_GAP.rubric!).stars).toBe(1);
  });

  it("neither demo is teachable-first: both faults are опасни, so both are scored", () => {
    // Unlike most drills in the wave, this one has NO teach-moment channel to
    // land on — чл. 50а failures are dangerous faults, and doc 76 §0's
    // teach-first rule does not soften them. The mistakes are DEMONSTRATED by
    // the ghosts; the student's own attempt is docked.
    for (const name of ["mistake-barge-lead", "mistake-short-gap"] as const) {
      let s = createLessonSession(compileScenario(SC_RB_BUSY_GAP, 3));
      const taught: string[] = [];
      recordScRbBusyGapDrive(loadDistrict("rb-mini-v1"), name, {
        onTick: (tick) => {
          const step = applyTick(s, tick);
          s = step.state;
          for (const m of step.teachMoments ?? []) taught.push(m.code);
        },
      });
      expect(taught, name).toEqual([]);
    }
  });

  it("the platoon rides every rung; L5 adds a THIRD car + rain without touching physics", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_RB_BUSY_GAP, level).id).toBe(`sc-rb-busy-gap@L${level}`);
    }
    expect(compileScenario(SC_RB_BUSY_GAP, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_RB_BUSY_GAP, 4).examMode).toBe(true);
    // Both cars of the platoon ride every base rung — one car is a different
    // lesson (that is sc-roundabout-entry), so the pair IS this template.
    for (const level of [1, 3, 4] as const) {
      expect(compileScenario(SC_RB_BUSY_GAP, level).stagedEvents?.map((e) => e.kind), `L${level}`).toEqual([
        "roundaboutEntry",
        "roundaboutEntry",
      ]);
    }
    const l5 = compileScenario(SC_RB_BUSY_GAP, 5);
    expect(l5.environment?.rain).toBe(true);
    expect(l5.stagedEvents?.map((e) => e.kind)).toEqual([
      "roundaboutEntry",
      "roundaboutEntry",
      "roundaboutEntry",
    ]);
    // ADR-006 stage 4a: the rain renders and grades the conditions envelope — it
    // never silently reduces the live car's grip (this template's ghost envelope
    // is dry-tuned; the taught delta is one more car to read, not braking).
    expect(l5.physics).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sc-fo-brakelight-chain — чл. 23 read one car further: the gap buys the metres,
//                          but the SIGHT LINE buys the seconds
// ---------------------------------------------------------------------------

describe("wave-3 bot completion — sc-fo-brakelight-chain at L3", () => {
  const lesson = compileScenario(SC_FO_BRAKELIGHT_CHAIN, 3);
  let session = createLessonSession(lesson);
  recordScFoBrakelightChainDrive(loadDistrict("fo-brake-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_FO_BRAKELIGHT_CHAIN.rubric!).stars).toBe(3);
  });

  it("the drill is won by the STOP the early lift buys, in route order", () => {
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    // sc-fbc-read carries maxSpeedKmh 32 — the pinned ~14.9 m gap is only a
    // 2-second gap at a calm pace, so the zone is unreachable for a driver who
    // holds the same metres at 48 km/h.
    expect(at("sc-fbc-read").done).toBe(true);
    // sc-fbc-stop caps 6 km/h inside r = 14 at y = 222: satisfiable ONLY at
    // rest behind the stopped chain — reached because the lift came on the HEAD
    // car's lights, not on the middle car's.
    expect(at("sc-fbc-stop").done).toBe(true);
    expect(at("sc-fbc-finish").done).toBe(true);
    expect(at("sc-fbc-read").completedAtSec!).toBeLessThan(at("sc-fbc-stop").completedAtSec!);
    expect(at("sc-fbc-stop").completedAtSec!).toBeLessThan(at("sc-fbc-finish").completedAtSec!);
  });

  it("THE THESIS, through the live session: the early lift is innocent on every channel", () => {
    // The recorder's own engine proves the physical half on the trace gate (the
    // head's slam resolves "stoppedInTime" with a 30 m cushion); THIS proves the
    // STUDENT-facing path agrees that getting there costs nothing. A driver who
    // lifts on the SECOND car's brake lights never buys that margin with a slam,
    // so neither the gap channel nor the harsh-brake ledger has anything to say.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(codes).not.toContain("COLLISION");
    // …and the stop was REAL: the 6 km/h cap at y = 222 is unreachable in motion.
    expect(result.objectives.find((o) => o.id === "sc-fbc-stop")!.done).toBe(true);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    // RED UNTIL INTEGRATION, by this file's own header note: templates-following2
    // is a NEW family file this wave, and gradeFinishWire resolves the id through
    // the templates.ts registry. Goes green the moment the main session spreads
    // SCENARIO_TEMPLATES_FOLLOWING2 into SCENARIO_TEMPLATES — kept strict (not
    // tolerant of "unknown-lesson") so it stays a real gate afterwards, exactly
    // like the sibling blocks in this file.
    const graded = gradeFinishWire({
      lessonId: "sc-fo-brakelight-chain@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-fo-brakelight-chain@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the bumper stare TEACHES FOLLOWING_TOO_CLOSE — same metres, guilty speed", () => {
    let s = createLessonSession(compileScenario(SC_FO_BRAKELIGHT_CHAIN, 3));
    const taught: string[] = [];
    recordScFoBrakelightChainDrive(loadDistrict("fo-brake-v1"), "mistake-bumper-stare", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // FOLLOWING_TOO_CLOSE is a teachable основна fault, so its FIRST encounter
    // lands on the A9 teach-moment channel (pause + card), not on session.events
    // — the student is taught чл. 23, not merely docked. The §9 code assert lives
    // on the trace gate, where the recorder's own engine grades every encounter:
    // traces/__tests__/sc-fo-brakelight-chain-traces.
    expect(taught).toEqual(["FOLLOWING_TOO_CLOSE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    // The gap is PINNED by the actor — this driver holds the SAME metres the
    // shadow does. Only the speed differs, which is exactly чл. 23's point: the
    // distance is measured in seconds. So the calm-pace gate is what refuses it.
    expect(r.objectives.find((o) => o.id === "sc-fbc-read")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
  });

  it("counter-proof: the late brake grades COLLISION, misses the stop gate, not passed, 1★", () => {
    let s = createLessonSession(compileScenario(SC_FO_BRAKELIGHT_CHAIN, 3));
    const taught: string[] = [];
    recordScFoBrakelightChainDrive(loadDistrict("fo-brake-v1"), "mistake-late-brake", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // COLLISION is опасна + terminateSession — scored straight onto the session,
    // never softened to a card.
    expect(taught).toEqual([]);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    // THE HONEST POINT of this demo: the GAP DETECTOR never speaks. He holds the
    // same pinned metres as the shadow at a legal 38 km/h — ~1.4 s, worse than
    // the shadow's ~2.1 s but still above the 1.26 s fire threshold. чл. 23 is
    // silent, and he crashes anyway, because the fault is the sight line.
    expect(s.events.some((e) => e.kind === "violation" && e.code === "FOLLOWING_TOO_CLOSE")).toBe(false);
    expect(taught).not.toContain("FOLLOWING_TOO_CLOSE");
    // So the drill's own gates are what refuse him — twice, on the two halves of
    // the taught act: the calm pace that makes 2 seconds out of these metres…
    expect(r.objectives.find((o) => o.id === "sc-fbc-read")!.done).toBe(false);
    // …and the stop that only an early lift can reach.
    expect(r.objectives.find((o) => o.id === "sc-fbc-stop")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_FO_BRAKELIGHT_CHAIN.rubric!).stars).toBe(1);
  });

  it("the chain is a CHAIN: two cars, own lane, head beyond middle, on every rung", () => {
    // The template's one structural claim. If the head ever paced nearer than
    // the middle car, the runtime's leadGap query (nearest vehicle in the
    // corridor) would read the head instead and the drill would quietly become
    // sc-follow-brake with an extra prop.
    for (const level of [1, 3, 5] as const) {
      expect(
        compileScenario(SC_FO_BRAKELIGHT_CHAIN, level).stagedEvents?.map((e) => e.id),
        `L${level}`,
      ).toEqual(["sc-fbc-mid", "sc-fbc-head"]);
    }
    expect(lesson.stagedEvents?.map((e) => e.kind)).toEqual(["cutInLeadCar", "brakingLeadCar"]);
  });

  it("compiles at every authored rung; L5 adds rain WITHOUT touching the dry-tuned physics", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_FO_BRAKELIGHT_CHAIN, level).id).toBe(
        `sc-fo-brakelight-chain@L${level}`,
      );
    }
    expect(compileScenario(SC_FO_BRAKELIGHT_CHAIN, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_FO_BRAKELIGHT_CHAIN, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_FO_BRAKELIGHT_CHAIN, 5);
    expect(l5.environment?.rain).toBe(true);
    // ADR-006 stage 4a: rain renders and grades the conditions envelope — it
    // never silently reduces the live car's grip (this ghost's envelope is
    // dry-tuned; the taught L5 delta is the same chain with longer stopping).
    expect(l5.physics).toBeUndefined();
    // No ruleConfig: the wet 3-second detector (followRainAwareEnabled) stays
    // OFF here on purpose — see the templates-following2 header. It is a
    // TEMPLATE-wide switch (LevelSpec carries no per-rung ruleConfig), and the
    // pinned ~14.9 m gap this drill is built on sits INSIDE its fire band at the
    // shadow's own pace — arming it would convict a student for copying the
    // shadow. sc-follow-rain-gap is the drill that owns that detector.
    expect(l5.ruleConfig?.followRainAwareEnabled).toBeUndefined();
  });
});
