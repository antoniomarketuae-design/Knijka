/**
 * Wave-4 bot-completion proofs (doc 76 §10; the s-batch2 / s-w1 / s-w2 / s-w3
 * mold) — each NEW template of the wave driven through the FULL production
 * pipeline:
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
import { recordScEdD2PriorityRunDrive } from "../../../traces/scEdD2PriorityRun";
import { recordScMergeBusPulloutDrive } from "../../../traces/scMergeBusPullout";
import { recordScOvCrestCurveDrive } from "../../../traces/scOvCrestCurve";
import { recordScPeNightUnlitDrive } from "../../../traces/scPeNightUnlit";
import { recordScPkDoubleParkDrive } from "../../../traces/scPkDoublePark";
import { recordScRbLaneChoiceDrive } from "../../../traces/scRbLaneChoice";
import { recordScVpHandbrakeDrive } from "../../../traces/scVpHandbrake";
import { recordScVuCyclistGroupDrive } from "../../../traces/scVuCyclistGroup";
import { VIOLATIONS } from "../../../rules/catalog";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { compileScenario } from "../compile";
import { scenarioLessonById } from "../resolve";
import { scoreRubric } from "../rubric";
import { SC_VP_HANDBRAKE } from "../templates-cockpit2";
import { SC_ED_D2_PRIORITY_RUN } from "../templates-exam";
import { SC_OV_CREST_CURVE } from "../templates-lanes2";
import { SC_MERGE_BUS_PULLOUT } from "../templates-merging";
import { SC_PK_DOUBLE_PARK } from "../templates-parking2";
import { SC_PE_NIGHT_UNLIT } from "../templates-pe2";
import { SC_RB_LANE_CHOICE } from "../templates-roundabout";
import { SC_VU_CYCLIST_GROUP } from "../templates-vru2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")) as unknown;
}

// ---------------------------------------------------------------------------
// sc-pe-night-unlit — the drill is won BEFORE the pedestrian appears: the speed
//                     you chose in the dark is the whole answer
// ---------------------------------------------------------------------------

describe("wave-4 bot completion — sc-pe-night-unlit at L3", () => {
  const lesson = compileScenario(SC_PE_NIGHT_UNLIT, 3);
  let session = createLessonSession(lesson);
  recordScPeNightUnlitDrive(loadDistrict("pe-dart-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_PE_NIGHT_UNLIT.rubric!).stars).toBe(3);
  });

  it("compiles as a NIGHT lesson — the axis that makes this template not the day dart", () => {
    expect(lesson.environment?.timeOfDay).toBe("night");
    // No ruleConfig by design: the shipped conditionSpeedNightFactor is 1, so
    // the night bills no conditions-speed code here (the template header's A12
    // note — PE-09's unlit envelope is sc-ac-night-overdrive's drill, one
    // district over). A lesson that quietly grew one would fail here.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the readiness gate is cleared BEFORE the halt, and the halt before the clear", () => {
    // sc-pnu-approach carries maxSpeedKmh 30 at y = 68 — the crossing-approach
    // cap, twelve metres out. Passing it is the чл. 20 contract: a driver who
    // waits for the figure to appear before lifting is simply never in that
    // zone slowly enough. The order is the story: ready → stop → proceed.
    const approach = result.objectives.find((o) => o.id === "sc-pnu-approach")!;
    const halt = result.objectives.find((o) => o.id === "sc-pnu-halt")!;
    const clear = result.objectives.find((o) => o.id === "sc-pnu-clear")!;
    expect(approach.done).toBe(true);
    expect(halt.done).toBe(true);
    expect(clear.done).toBe(true);
    expect(approach.completedAtSec!).toBeLessThanOrEqual(halt.completedAtSec!);
    expect(halt.completedAtSec!).toBeLessThan(clear.completedAtSec!);
  });

  it("the LIVE session grades the dark approach as innocent — no phantom codes", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. Braking for a pedestrian who has stepped onto
    // an unlit zebra must never read as a phantom stop (the crossing zone is
    // the detector's own innocence), and lows-on at night must never bill.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
    expect(codes).not.toContain("HEADLIGHTS_OFF_AT_NIGHT");
    expect(codes).not.toContain("PEDESTRIAN_CROSSING_TOO_FAST");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-pe-night-unlit@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-pe-night-unlit@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the city-speed demo is SCORED (never a modal) and never halts", () => {
    // PEDESTRIAN_CROSSING_TOO_FAST + COLLISION are опасна/terminating, so they
    // are SCORED with a non-blocking toast — a safety event must never pop a
    // modal mid-drive (the student may be mid-braking; interrupting the
    // handling would teach the wrong reflex). So they land on session.events
    // and the A9 teach channel stays empty. The §9 code assert lives on the
    // trace gate: traces/__tests__/sc-pe-night-unlit-traces.
    let s = createLessonSession(compileScenario(SC_PE_NIGHT_UNLIT, 3));
    const taught: string[] = [];
    recordScPeNightUnlitDrive(loadDistrict("pe-dart-v1"), "mistake-city-speed", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("PEDESTRIAN_CROSSING_TOO_FAST");
    expect(codes).toContain("COLLISION");
    expect(taught).toEqual([]);
    // The lawful-but-blind driver never stops for her: the halt mark is exactly
    // what a 40 km/h approach cannot reach, and the drill is unwinnable from
    // there — not one of the three objectives lands. That asymmetry IS the
    // template's grading claim: the speed decided the outcome, not the reflex.
    expect(r.objectives.every((o) => !o.done)).toBe(true);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: the dark drive TEACHES the lights fault on the A9 channel", () => {
    // The two demos ride two different channels, and that split is deliberate:
    // HEADLIGHTS_OFF_AT_NIGHT is a teachable основна fault, so its FIRST
    // encounter PAUSES with a card (чл. 70) instead of merely docking points —
    // the student who forgot the lights is taught, not punished.
    let s = createLessonSession(compileScenario(SC_PE_NIGHT_UNLIT, 3));
    const taught: string[] = [];
    recordScPeNightUnlitDrive(loadDistrict("pe-dart-v1"), "mistake-lights-off", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toEqual(["HEADLIGHTS_OFF_AT_NIGHT"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    // It stops outside the 35 m crossing zone: no pedestrian code can attach.
    expect(buildLessonResult(s).completedAll).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-pk-double-park — the ban nobody posted: the drill is won by READING THE
//                     OTHER CARS, and lost by trusting an empty-looking lane
// ---------------------------------------------------------------------------

describe("wave-4 bot completion — sc-pk-double-park at L3", () => {
  const lesson = compileScenario(SC_PK_DOUBLE_PARK, 3);
  let session = createLessonSession(lesson);
  recordScPkDoubleParkDrive(loadDistrict("pk-double-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_PK_DOUBLE_PARK.rubric!).stars).toBe(3);
  });

  it("carries the oncoming stream into the live lesson (the squeeze is staged, not painted)", () => {
    // The actor is what makes the WHY visible: it must survive compilation to
    // the LessonSpec, or the student meets an empty street and the card's
    // „насрещният няма къде да отбие" becomes a claim about nothing.
    expect(lesson.stagedEvents?.some((s) => s.id === "sc-pkd-stream")).toBe(true);
    // No ruleConfig and no physics by design: the ban is authored district data
    // (a noStopping span), so the shipped detector grades it as-is. A lesson
    // that quietly grew a dial would fail here.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the drill is won at the CURB, and only after the whole row is behind", () => {
    // sc-pkd-legal-park carries maxSpeedKmh 6 inside a 4 m radius at (6.8, 290)
    // — the free bay, 80 m past every чл. 98 metre. It is satisfiable ONLY by
    // actually pulling out of the lane and stopping at the curb: „спрях, но в
    // платното" completes nothing. The order is the story: pass first, park second.
    const pastRow = result.objectives.find((o) => o.id === "sc-pkd-past-row")!;
    const park = result.objectives.find((o) => o.id === "sc-pkd-legal-park")!;
    expect(pastRow.done).toBe(true);
    expect(park.done).toBe(true);
    expect(pastRow.completedAtSec!).toBeLessThan(park.completedAtSec!);
  });

  it("the LIVE session agrees the lawful drive is lawful — no phantom чл. 98 bill", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. Driving past 27 parked cars and stopping at a
    // free curb must never read as second-line stopping.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("ILLEGAL_STOP_IN_BAN_ZONE");
    expect(codes).not.toContain("COLLISION");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-pk-double-park@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-pk-double-park@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the second-line rest TEACHES чл. 98 on the A9 channel", () => {
    // ILLEGAL_STOP_IN_BAN_ZONE is a teachable основна fault, so its FIRST
    // encounter PAUSES with a card instead of merely docking points — which is
    // the whole pedagogy here: the student who stopped „за две минути" has never
    // been told that the parked row IS the sign, and a silent -3 would not tell
    // him either. The §9 code assert lives on the trace gate.
    let s = createLessonSession(compileScenario(SC_PK_DOUBLE_PARK, 3));
    const taught: string[] = [];
    recordScPkDoubleParkDrive(loadDistrict("pk-double-v1"), "mistake-second-line", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    // TEACH-FIRST IS ABOUT POINTS, AND IT STILL IS: the sheet charges nothing,
    // and this assert is the one that says so.
    const r = buildLessonResult(s);
    expect(r.score).toBe(0);
    // EXPECTATION CHANGED 2026-08-30 — `completedAll` was `true` here, and it
    // was the objective-title defect (sc-pk-rail-ban:84bce2a3) in this drill's
    // own colours. `sc-pkd-past-row` reads «Подмини цялата паркирана редица,
    // БЕЗ ДА СПИРАШ ДО НЕЯ», and it was a bare disc past the row: the drive that
    // stopped on the second line collected that exact sentence as a ✓ on the
    // same debrief that prints «Учебни моменти (не влизат в точките): •
    // Спиране в забранена зона». One screen, two statements, one of them false.
    // `requireRestClean: "banZone"` (objectives.ts) now makes the credit read
    // what the protocol already told him. Nothing here is re-priced — the card
    // is still free, the score is still 0, and the verdict card badges this run
    // НЕЗАВЪРШЕН rather than НЕИЗДЪРЖАН (SessionEndScreen.tsx: „НЕИЗДЪРЖАН IS A
    // FINDING OF THE ИЗПИТЕН ЛИСТ and of nothing else"). What changed is that
    // the drill stops certifying a discipline the same drive just failed.
    expect(r.completedAll).toBe(false);
  });

  it("counter-proof: the squeeze demo's COLLISION is SCORED, never a modal", () => {
    // COLLISION is terminating, so it is SCORED with a non-blocking toast — a
    // safety event must never pop a modal mid-drive. The чл. 98 rest that CAUSED
    // it still teaches on the A9 channel, so this demo shows the split: the
    // fault is taught, the consequence is scored.
    let s = createLessonSession(compileScenario(SC_PK_DOUBLE_PARK, 3));
    const taught: string[] = [];
    recordScPkDoubleParkDrive(loadDistrict("pk-double-v1"), "mistake-oncoming-squeeze", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(taught).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(codes).toContain("COLLISION");
    expect(buildLessonResult(s).passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-vu-cyclist-group — the column is ONE commitment: five riders, five
//                       verdicts, and a gap that has to fit all of them
// ---------------------------------------------------------------------------

describe("wave-4 bot completion — sc-vu-cyclist-group at L3", () => {
  const lesson = compileScenario(SC_VU_CYCLIST_GROUP, 3);
  let session = createLessonSession(lesson);
  recordScVuCyclistGroupDrive(loadDistrict("vu-pass-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_VU_CYCLIST_GROUP.rubric!).stars).toBe(3);
  });

  it("carries the whole column AND the oncoming car into the live lesson", () => {
    // Six actors must survive compilation: five riders (the thing being graded,
    // once each) and the one oncoming car (the reason you wait). Drop a rider
    // and the drill silently becomes sc-vu-pass-clearance; drop the car and the
    // objective's „изчакай насрещния" becomes a claim about nothing.
    const ids = (lesson.stagedEvents ?? []).map((s) => s.id);
    for (const n of [1, 2, 3, 4, 5]) expect(ids).toContain(`sc-vug-rider-${n}`);
    expect(ids).toContain("sc-vug-oncoming");
    // No ruleConfig and no physics by design: the runtime's vulnerable-pass
    // tracker grades this drill exactly as shipped. A lesson that quietly grew
    // a dial — or the crosswind the backlog asked for, which LevelSpec cannot
    // express per-rung — would fail here.
    expect(lesson.ruleConfig).toBeUndefined();
    expect(lesson.physics).toBeUndefined();
  });

  it("the drill is won WIDE and only ended after the lead rider — in that order", () => {
    // sc-vug-wide sits at (−2.0, 190) with radius 5: it is 6.06 m from the lane
    // center, so it is reachable ONLY from the oncoming bank. „Изпреварих ги, но
    // от моята лента" completes nothing — which is the entire distinction from
    // the live one-rider template. The order is the story: out, past all five,
    // then home.
    const wide = result.objectives.find((o) => o.id === "sc-vug-wide")!;
    const back = result.objectives.find((o) => o.id === "sc-vug-back")!;
    const finish = result.objectives.find((o) => o.id === "sc-vug-finish")!;
    expect(wide.done).toBe(true);
    expect(back.done).toBe(true);
    expect(finish.done).toBe(true);
    expect(wide.completedAtSec!).toBeLessThan(back.completedAtSec!);
    expect(back.completedAtSec!).toBeLessThan(finish.completedAtSec!);
  });

  it("the LIVE session agrees the wide pass is lawful — and commends it FIVE times", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. Riding the oncoming bank for ~20 s past a
    // column must not read as wandering (POOR_LANE_KEEPING), as a phantom
    // overtake against the departed car (OVERTAKE_INSUFFICIENT_GAP), or as
    // tailgating the riders it is giving 7 m of air (FOLLOWING_TOO_CLOSE).
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("OVERTAKE_INSUFFICIENT_GAP");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("VULNERABLE_PASS_TOO_CLOSE");
    // One commendation per rider — the per-rider verdict IS the template.
    const yielded = session.events.filter(
      (e) => e.kind === "commendation" && e.code === "YIELDED_TO_PRIORITY",
    );
    expect(yielded).toHaveLength(5);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-vu-cyclist-group@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-vu-cyclist-group@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the squeeze TEACHES чл. 42 on the A9 channel, once", () => {
    // VULNERABLE_PASS_TOO_CLOSE is a teachable основна fault, so its FIRST
    // encounter PAUSES with a card instead of merely docking points — and that
    // is the pedagogy: the student who wormed past five riders at a metre has
    // never been told what the metre costs. The repeats then SCORE (one bill per
    // rider), which is the group tax made legible. The §9 code assert lives on
    // the trace gate: traces/__tests__/sc-vu-cyclist-group-traces.
    let s = createLessonSession(compileScenario(SC_VU_CYCLIST_GROUP, 3));
    const taught: string[] = [];
    recordScVuCyclistGroupDrive(loadDistrict("vu-pass-v1"), "mistake-narrow", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toEqual(["VULNERABLE_PASS_TOO_CLOSE"]);
    // It never leaves its lane, so the wide gate is unreachable and the drill is
    // unwinnable from the first metre — the fault here is the ROUTE, not a beat.
    expect(buildLessonResult(s).completedAll).toBe(false);
  });

  it("counter-proof: the cut-in teaches ONCE and scores the rest of the cluster", () => {
    // The cut-in's three verdicts land inside ~2.5 s of each other, and that
    // makes this the A9 rate limit's (TEACH_PAUSE_MIN_GAP_S = 15) showcase: the
    // FIRST fault pauses with a card, everything inside the window downgrades to
    // a non-blocking toast. The alternative would be three modals in two
    // seconds, the last of them mid-collision — the shell must never do that.
    // So the card is „несъобразена дистанция" (t ≈ 17.8 — chronologically the
    // fault that opens the sequence: the dive lands the car in a 20 m hole while
    // rider 3 is still ahead of it), and the clearance bill and the contact are
    // scored a beat later. COLLISION is terminating and would never teach
    // regardless. The §9 exact-code assert lives on the trace gate.
    let s = createLessonSession(compileScenario(SC_VU_CYCLIST_GROUP, 3));
    const taught: string[] = [];
    const toasts: string[] = [];
    recordScVuCyclistGroupDrive(loadDistrict("vu-pass-v1"), "mistake-cut-in", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
        // A rate-limited teach downgrades to a kind:"lesson" toast (not
        // kind:"violation" — that channel is for SCORED faults).
        for (const h of step.hudEvents) if (h.kind === "lesson") toasts.push(h.titleBg);
      },
    });
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(taught).toEqual(["FOLLOWING_TOO_CLOSE"]);
    // NO COLLISION since 2026-08-10 (sim/collision): the cut line leaves 0.21 m
    // of air beside rider 3 — the worst pass this street can be driven, and
    // still not a contact. It billed as one only because two POINT actors were
    // compared against a 3 m circle. The demo's remaining two codes are the two
    // acts it actually committed, and its own card now says as much.
    expect(codes).not.toContain("COLLISION");
    // The clearance bill is the interesting one, and it is NOT on session.events:
    // this is the student's FIRST encounter with чл. 42's lateral duty, so the
    // engine's decision is "teach" (first-encounter faults are taught, never
    // punished) — and the rate limit then ate its pause, leaving the non-blocking
    // toast as the surviving channel. So the student is TOLD and not docked,
    // which is the intended pedagogy; the code-truth channel for §9 is the
    // recorder's own grader on the trace gate, where it convicts.
    expect(codes).not.toContain("VULNERABLE_PASS_TOO_CLOSE");
    // The title is read off the catalogue rather than retyped: this assertion's
    // subject is „the toast NAMES the act", not which words the act is named
    // with — and the literal spelling went stale on 2026-09-04 when
    // `VULNERABLE_PASS_TOO_CLOSE.titleBg` was shortened so the phone peek could
    // finish it (sc-merge-from-property:6715b581; the reasoning is on the row
    // and in `rules/__tests__/violation-title-fits-peek.test.ts`).
    expect(toasts).toContain(VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg);
    const r = buildLessonResult(s);
    expect(r.passed).toBe(false);
    // The half-maneuver's arithmetic, and the reason sc-vug-wide sits at y 190
    // rather than at the start of the pass: the gate is placed PAST the column,
    // so it measures the COMMITMENT, not the intention. This driver's wide line
    // was real but ended at y 163 — 27 m short — so it completes NOTHING, the
    // same as the driver who never pulled out at all. That equivalence is the
    // template's whole claim: half an overtake of a group scores like none.
    expect(r.objectives.every((o) => !o.done)).toBe(true);
    expect(r.completedAll).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-merge-bus-pullout — the merging family's inversion: SOMEONE ELSE merges,
//                        and the whole skill is giving them the room (чл. 67)
// ---------------------------------------------------------------------------

describe("wave-4 bot completion — sc-merge-bus-pullout at L3", () => {
  const lesson = compileScenario(SC_MERGE_BUS_PULLOUT, 3);
  let session = createLessonSession(lesson);
  recordScMergeBusPulloutDrive(loadDistrict("mg-busstop-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_MERGE_BUS_PULLOUT.rubric!).stars).toBe(3);
  });

  it("the drill is won by the LIFT, in route order — and that gate is what carries чл. 67", () => {
    // THE claim of this template (see the templates-merging header): doc 72
    // VU-11 marks the bus-yield adjudicator 🔴 NEW — `prioritySituation
    // ("bus-pullout")` is reserved vocabulary and NOT shipped, so NO detector
    // convicts „не пропуснах автобуса". The duty therefore has to live in an
    // objective or it does not exist at all: sc-mgb-ease carries maxSpeedKmh 30
    // inside a 5 m radius on the general lane, right where the rig swings out.
    // A driver who forces past is simply never there slowly enough — proved by
    // the counter-test below.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    expect(at("sc-mgb-ease").done).toBe(true);
    expect(at("sc-mgb-behind-bus").done).toBe(true);
    expect(at("sc-mgb-finish").done).toBe(true);
    // Eased at the pull-out first, then settled behind the bus, then out.
    expect(at("sc-mgb-ease").completedAtSec!).toBeLessThan(at("sc-mgb-behind-bus").completedAtSec!);
    expect(at("sc-mgb-behind-bus").completedAtSec!).toBeLessThan(at("sc-mgb-finish").completedAtSec!);
  });

  it("the LIVE session agrees the lawful response is innocent — no keep-right, bus-lane or slam code", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. The whole map hangs on it: without the
    // full-edge busLane span (gen_mg_busstop.mjs), a 400 m general-lane cruise
    // is ~35 s — nearly three times keepRightSustainSec — and this drill would
    // be fining the student for not driving along the спирка.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("NOT_KEEPING_RIGHT");
    expect(codes).not.toContain("DRIVING_IN_BUS_LANE");
    expect(codes).not.toContain("FOLLOWING_TOO_CLOSE");
    expect(codes).not.toContain("HARSH_BRAKING_NO_CAUSE");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-merge-bus-pullout@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-merge-bus-pullout@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: forcing past grades COLLISION, is SCORED (not taught), and reaches NO gate", () => {
    let s = createLessonSession(compileScenario(SC_MERGE_BUS_PULLOUT, 3));
    const taught: string[] = [];
    recordScMergeBusPulloutDrive(loadDistrict("mg-busstop-v1"), "mistake-force-past", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // COLLISION is опасна + terminating, and the coach NEVER pauses a modal on
    // a dangerous code mid-drive (lessons/engine.ts) — so it is SCORED straight
    // onto session.events at L3 and the teach-card channel stays empty. The §9
    // exact-code assert lives on the trace gate, where the recorder's own engine
    // grades every encounter: traces/__tests__/sc-merge-bus-pullout-traces.
    expect(taught).toEqual([]);
    expect(s.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    // …and the drill's own verdict is independent of the crash: this driver was
    // doing ~48 through the ease gate, so he misses it — and objectives advance
    // SEQUENTIALLY (lessons/engine.ts), so the other two never even arm. The
    // REFUSAL of the duty is what stops the run, not the contact.
    expect(r.objectives.every((o) => !o.done)).toBe(true);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
    expect(scoreRubric(r, SC_MERGE_BUS_PULLOUT.rubric!).stars).toBe(1);
  });

  it("counter-proof: the glue TEACHES FOLLOWING_TOO_CLOSE — after giving way correctly", () => {
    let s = createLessonSession(compileScenario(SC_MERGE_BUS_PULLOUT, 3));
    const taught: string[] = [];
    recordScMergeBusPulloutDrive(loadDistrict("mg-busstop-v1"), "mistake-glue-behind", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    // FOLLOWING_TOO_CLOSE is a teachable основна fault, so its FIRST encounter
    // lands on the A9 teach-moment channel (pause + card), not on
    // session.events — the student is taught чл. 23, not merely docked.
    expect(taught).toEqual(["FOLLOWING_TOO_CLOSE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    // Teach-first, not punish (doc 76 §0): this driver's ONLY fault is the gap.
    // He gave way correctly, so he clears the ease gate, takes the card and
    // finishes the route with a clean sheet. The lesson IS the card.
    expect(r.objectives.find((o) => o.id === "sc-mgb-ease")!.done).toBe(true);
    expect(r.completedAll).toBe(true);
    expect(r.score).toBe(0);
  });

  it("the STAGED RUNNER is the second witness: yielded for the shadow, violation for the glue", () => {
    // Both demos discharge the чл. 67 duty identically and diverge only AFTER
    // it, so the objective gates alone cannot tell them apart. The cut-in
    // runner's outcome channel can: it watches the same gap the reducer bills
    // on and records whether the driver held a stolen cushion. With VU-11's own
    // adjudicator unshipped, this is the closest measurement of „пропусна го —
    // и после?" that exists, and it agrees with both cards.
    const shadow = recordScMergeBusPulloutDrive(loadDistrict("mg-busstop-v1"), "shadow-correct");
    expect(shadow.outcomes.map((o) => [o.kind, o.success, o.detail])).toEqual([
      ["cutInLeadCar", true, "yielded"],
    ]);
    const glue = recordScMergeBusPulloutDrive(loadDistrict("mg-busstop-v1"), "mistake-glue-behind");
    expect(glue.outcomes.map((o) => [o.kind, o.success, o.detail])).toEqual([
      ["cutInLeadCar", false, "violation"],
    ]);
  });

  it("compiles at every authored rung; L5 adds the wet dusk WITHOUT touching the dry-tuned physics", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_MERGE_BUS_PULLOUT, level).id).toBe(`sc-merge-bus-pullout@L${level}`);
    }
    expect(compileScenario(SC_MERGE_BUS_PULLOUT, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_MERGE_BUS_PULLOUT, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_MERGE_BUS_PULLOUT, 5);
    // „Привечер, на мокър път" — the q-uyazvimi-065 frame. HONEST SCOPE:
    // ConditionAxis has no dusk dial, so привечер renders as the night one.
    expect(l5.environment?.rain).toBe(true);
    expect(l5.environment?.timeOfDay).toBe("night");
    // ADR-006 stage 4a: the rain renders and grades the conditions envelope —
    // it never silently reduces the live car's grip. This ghost's envelope is
    // dry-tuned, and the taught L5 delta is SEEING the rig leave, not braking
    // distance.
    expect(l5.physics).toBeUndefined();
    // The bus rides every rung — without it there is no drill at all.
    for (const level of [1, 3, 5] as const) {
      expect(compileScenario(SC_MERGE_BUS_PULLOUT, level).stagedEvents?.map((e) => e.kind), `L${level}`).toEqual([
        "cutInLeadCar",
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// sc-ov-crest-curve — the drill is won at the SIGN: the drive that waits out
//                     the blind bend is the drive that still gets to overtake
// ---------------------------------------------------------------------------

describe("wave-4 bot completion — sc-ov-crest-curve at L3", () => {
  const lesson = compileScenario(SC_OV_CREST_CURVE, 3);
  let session = createLessonSession(lesson);
  recordScOvCrestCurveDrive(loadDistrict("ov-crest-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_OV_CREST_CURVE.rubric!).stars).toBe(3);
  });

  it("the objectives fire in the taught ORDER: wait first, pass second, settle last", () => {
    // The ladder is the lesson, and its sequence is not decoration: чл. 43 does
    // not say „не изпреварвай", it says „не изпреварвай ТУК". A drive that
    // reached the pass gate before the patience gate would be a driver who
    // overtook in the bend and coasted afterwards — the exact anti-pattern.
    const wait = result.objectives.find((o) => o.id === "sc-ovcc-patience")!;
    const pass = result.objectives.find((o) => o.id === "sc-ovcc-pass")!;
    const finish = result.objectives.find((o) => o.id === "sc-ovcc-finish")!;
    expect([wait.done, pass.done, finish.done]).toEqual([true, true, true]);
    expect(wait.completedAtSec!).toBeLessThan(pass.completedAtSec!);
    expect(pass.completedAtSec!).toBeLessThan(finish.completedAtSec!);
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ov-crest-curve@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ov-crest-curve@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the blind pass FAILS the patience gate — and never reaches the rest", () => {
    // The demo that overtakes in the bend is not merely docked a code; it is
    // standing in the wrong place. The patience gate has radius 4 on a road
    // whose lane pitch is 8.125 m, so an excursion cannot satisfy it from the
    // oncoming bank — and the drive ends before the legal straight, so the pass
    // gate is never reached either. „Спечелих време" is measurably false: this
    // driver completes NOTHING.
    let s = createLessonSession(compileScenario(SC_OV_CREST_CURVE, 3));
    const taught: string[] = [];
    recordScOvCrestCurveDrive(loadDistrict("ov-crest-v1"), "mistake-blind-pass", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    // OVERTAKE_INSUFFICIENT_GAP is опасна, so it is SCORED with a non-blocking
    // toast rather than pausing into a teach card — a safety event must never
    // pop a modal mid-drive, because the student may be mid-maneuver on the
    // wrong side of the road and interrupting the handling would teach the worst
    // possible reflex. So it lands on session.events and the A9 teach channel
    // stays empty (the sc-pe-night-unlit ruling, one block up). The §9 code
    // assert lives on the trace gate, where the recorder's own engine grades
    // every encounter: traces/__tests__/sc-ov-crest-curve-traces.
    const codes = s.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("OVERTAKE_INSUFFICIENT_GAP");
    expect(taught).toEqual([]);
    const r = buildLessonResult(s);
    expect(r.objectives.find((o) => o.id === "sc-ovcc-patience")!.done).toBe(false);
    expect(r.objectives.find((o) => o.id === "sc-ovcc-pass")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("counter-proof: the curve-speed demo fails the SAME gate — one objective, both faults", () => {
    // The patience gate carries maxSpeedKmh 46, just above the А1 advisory's
    // grace band. So the driver who keeps his lane but carries 54 into the bend
    // stands exactly where the shadow stood and still completes nothing: being
    // there is not enough, being there SLOW is the objective. One gate, two
    // taught faults — which is why the template needs no third demo.
    let s = createLessonSession(compileScenario(SC_OV_CREST_CURVE, 3));
    const taught: string[] = [];
    recordScOvCrestCurveDrive(loadDistrict("ov-crest-v1"), "mistake-curve-speed", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toContain("SPEED_TOO_FAST_FOR_CURVE");
    const r = buildLessonResult(s);
    expect(r.objectives.find((o) => o.id === "sc-ovcc-patience")!.done).toBe(false);
    expect(r.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-vp-handbrake — the checklist is a CHAIN: the lever, the lamp that confirms
//                   it, and the mirror the lamp makes you forget
// ---------------------------------------------------------------------------

describe("wave-4 bot completion — sc-vp-handbrake at L3", () => {
  const lesson = compileScenario(SC_VP_HANDBRAKE, 3);
  let session = createLessonSession(lesson);
  recordScVpHandbrakeDrive(loadDistrict("vp-ready-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_VP_HANDBRAKE.rubric!).stars).toBe(3);
  });

  it("carries the move-off opt-in into the LIVE lesson — the drill's whole second half", () => {
    // moveOffObservationEnabled ships OFF (the A12 whole-commute pulls away from
    // rest unglanced), so WITHOUT this propagation the student's own blind
    // move-off would grade nothing and the second card would teach a fault the
    // live session cannot see. The recorder passes the same override, so the
    // trace gate and the student path grade identically.
    expect(lesson.ruleConfig?.moveOffObservationEnabled).toBe(true);
    // No physics and no staged actors by design: the street is empty and dry,
    // and the handbrake DRAG is narrative (the recorder is kinematic, not
    // physics — doc 76 trap 3). A lesson that quietly grew a dial fails here.
    expect(lesson.physics).toBeUndefined();
    expect(lesson.stagedEvents ?? []).toEqual([]);
  });

  it("the drill runs the street in order: move off, then finish", () => {
    const moved = result.objectives.find((o) => o.id === "sc-vph-moved")!;
    const finish = result.objectives.find((o) => o.id === "sc-vph-finish")!;
    expect(moved.done).toBe(true);
    expect(finish.done).toBe(true);
    expect(moved.completedAtSec!).toBeLessThan(finish.completedAtSec!);
  });

  it("the LIVE session agrees the correct checklist is clean — no phantom cockpit bill", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. A released handbrake must never bill чл. 20,
    // and a driver who DID glance must never bill чл. 25 — with the move-off
    // detector armed, a sloppy lookback window would false-fire exactly here.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("HANDBRAKE_LEFT_ON");
    expect(codes).not.toContain("MOVE_OFF_WITHOUT_OBSERVATION");
    expect(codes).not.toContain("SEATBELT_OFF_WHILE_MOVING");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-vp-handbrake@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-vp-handbrake@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the raised lever TEACHES чл. 20 once — and, still raised ten seconds later, is GRADED once", () => {
    // HANDBRAKE_LEFT_ON is a teachable второстепенна fault, so its FIRST
    // encounter PAUSES with a card instead of merely docking a point — which is
    // the pedagogy: the student dragging the car has not connected the lamp to
    // the feel, and a silent −1 would not connect them either. The handbrake
    // stays up for the whole drive, so the detector's episode never resets: ONE
    // card, not a rattle of them. The §9 exact-code assert lives on the trace
    // gate: traces/__tests__/sc-vp-handbrake-traces.
    //
    // THE SECOND HALF WAS ADDED 2026-08-26 AND THE ASSERTION IT REPLACES WAS
    // THE DEFECT (`rules/engine.ts STANDING_DUTY_REGRADE_SEC`). This used to
    // read `expect(...violations).toEqual([])` — one teach, no charge, ever —
    // and that is precisely how a whole lesson driven with the lever up, the
    // lamps off or the belt undone reached its debrief on «Опасни 0 · Основни
    // 0 · Второстепенни 0» under «чисто каране по изпитния лист». The free
    // mini-lesson exists to forgive a first MISTAKE; it was forgiving the
    // entire drive, because the reducer billed a standing duty once and never
    // asked again. It now asks exactly once more, ten driving seconds later.
    //
    // The claim this test was written for is UNCHANGED and still pinned: ONE
    // card, not a rattle of them — and now also ONE charge, not a rattle of
    // those (`STANDING_DUTY_MAX_BILLS` = 2 bills per episode, total).
    let s = createLessonSession(compileScenario(SC_VP_HANDBRAKE, 3));
    const taught: string[] = [];
    recordScVpHandbrakeDrive(loadDistrict("vp-ready-v1"), "mistake-handbrake-on", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toEqual(["HANDBRAKE_LEFT_ON"]);
    const billed = s.events.filter((e) => e.kind === "violation");
    expect(billed.map((e) => e.code)).toEqual(["HANDBRAKE_LEFT_ON"]);
    // The drill still COMPLETES: the route was never the problem, the lever was.
    // That asymmetry is the template's claim — this fault is invisible to the
    // objectives and visible only to the cockpit channel, which is exactly why
    // it needs teaching rather than a gate.
    expect(buildLessonResult(s).completedAll).toBe(true);
  });

  it("counter-proof: the skipped last step TEACHES чл. 25 — and ONLY it", () => {
    // The mirror image of the demo above, and the reason both exist: this driver
    // did the handbrake perfectly. If this demo also billed HANDBRAKE_LEFT_ON —
    // or the one above also billed чл. 25 — each card would name two faults and
    // teach neither. One demo, one thing to fix.
    let s = createLessonSession(compileScenario(SC_VP_HANDBRAKE, 3));
    const taught: string[] = [];
    recordScVpHandbrakeDrive(loadDistrict("vp-ready-v1"), "mistake-no-observation", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toEqual(["MOVE_OFF_WITHOUT_OBSERVATION"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(buildLessonResult(s).completedAll).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sc-rb-lane-choice — the two-lane ring: the drill is decided on the APPROACH,
//                     and both objectives are lane gates, not route gates
// ---------------------------------------------------------------------------

describe("wave-4 bot completion — sc-rb-lane-choice at L3", () => {
  const lesson = compileScenario(SC_RB_LANE_CHOICE, 3);
  let session = createLessonSession(lesson);
  recordScRbLaneChoiceDrive(loadDistrict("rb-2lane-v1"), "shadow-correct", {
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
    expect(scoreRubric(result, SC_RB_LANE_CHOICE.rubric!).stars).toBe(3);
  });

  it("the drill is won by the LANE, in the order the lesson teaches it", () => {
    // Both reachZones have radius 3.5 m — under half the 8.125 m lane pitch —
    // so neither is satisfiable from the wrong lane. That is the whole design:
    // no detector reads a painted arrow (doc 72 N3 lane-intent is unbuilt), so
    // the arrow discipline is graded as GEOMETRY (the sc-ln-turn-lane-arrows
    // ruling). sc-rb2-inner-lane sits on the approach, 8 m before the ring's
    // reach; sc-rb2-past-north sits on the INNER ring lane at the north mouth.
    const laneGate = result.objectives.find((o) => o.id === "sc-rb2-inner-lane")!;
    const pastNorth = result.objectives.find((o) => o.id === "sc-rb2-past-north")!;
    const exit = result.objectives.find((o) => o.id === "sc-rb2-exit")!;
    expect(laneGate.done).toBe(true);
    expect(pastNorth.done).toBe(true);
    expect(exit.done).toBe(true);
    // Lane chosen BEFORE the ring, held past the second spoke, exit last — the
    // objective order IS „избери лентата ПРЕДИ кръга и я дръж до изхода си".
    expect(laneGate.completedAtSec!).toBeLessThan(pastNorth.completedAtSec!);
    expect(pastNorth.completedAtSec!).toBeLessThan(exit.completedAtSec!);
  });

  it("round-trips through the finish wire and regrades identically", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-rb-lane-choice@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-rb-lane-choice@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the outer-lane drive FAILS the lane gates while staying legal-ish", () => {
    // The template's sharpest claim, made checkable. Mistake 1 yields correctly
    // at the line and announces its exit — its ONLY billed fault is the wandering
    // line (POOR_LANE_KEEPING; the exact-code assert lives on the trace gate).
    // What it can never do is satisfy the lane gates: it is one full lane away
    // from both. So „грешна лента" is graded by the objectives even though no
    // detector in the engine knows what a painted arrow is.
    let s = createLessonSession(compileScenario(SC_RB_LANE_CHOICE, 3));
    recordScRbLaneChoiceDrive(loadDistrict("rb-2lane-v1"), "mistake-outer-lane-far-exit", {
      onTick: (tick) => {
        s = applyTick(s, tick).state;
      },
    });
    const r = buildLessonResult(s);
    expect(r.objectives.find((o) => o.id === "sc-rb2-inner-lane")!.done).toBe(false);
    expect(r.objectives.find((o) => o.id === "sc-rb2-past-north")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sc-ed-d2-priority-run — the exam chain on real Лозенец: three junctions, three
//                         different priority rules, and no pause between them
// ---------------------------------------------------------------------------

describe("wave-4 bot completion — sc-ed-d2-priority-run at L3", () => {
  const lesson = compileScenario(SC_ED_D2_PRIORITY_RUN, 3);
  let session = createLessonSession(lesson);
  recordScEdD2PriorityRunDrive(loadDistrict("d2-v1"), "shadow-correct", {
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);

  it("completes: all four objectives done, zero violations, passed, 3★", () => {
    expect(session.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    expect(session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(scoreRubric(result, SC_ED_D2_PRIORITY_RUN.rubric!).stars).toBe(3);
  });

  it("carries the JU-23 scan drill into the LIVE lesson — the template's whole point", () => {
    // junctionScanObservationEnabled ships OFF (rules/types.ts: the A12
    // whole-commute crosses a Б2 unglanced and must stay innocent). WITHOUT this
    // propagation the student's own „спрях и потеглих, без да погледна" would
    // grade nothing while the committed trace still shows the fault — the exam
    // drill would quietly become a stop-sign drill. The recorder passes the same
    // override, so the trace gate and the student path grade identically.
    expect(lesson.ruleConfig?.junctionScanObservationEnabled).toBe(true);
    // No physics by design (ADR-006 stage 4a): the ghost envelope is dry-tuned,
    // and L5's rain grades the conditions envelope without touching grip.
    expect(lesson.physics).toBeUndefined();
  });

  it("carries BOTH staged conflicts — one per priority rule", () => {
    // Drop the oncoming and the left turn becomes an empty junction; drop the
    // right-hand car and „равнозначно" is a claim about nothing. Both must
    // survive compilation, in route order.
    expect((lesson.stagedEvents ?? []).map((s) => [s.id, s.kind])).toEqual([
      ["sc-edpr-oncoming", "oncomingLeftTurn"],
      ["sc-edpr-right", "priorityFromRight"],
    ]);
  });

  it("the chain runs in the order the street imposes: Б2 → signal → left turn → equal", () => {
    // The objective order IS the segment: this is an exam-drill, so the claim
    // is endurance of attention across four beats, not any one of them. If a
    // re-tune ever let a later gate land first, the drill would no longer be a
    // chain — fail here rather than ship a shuffled exam.
    const at = (id: string) => result.objectives.find((o) => o.id === id)!;
    for (const id of ["sc-edpr-b2", "sc-edpr-signal", "sc-edpr-leftturn", "sc-edpr-finish"]) {
      expect(at(id).done, id).toBe(true);
    }
    expect(at("sc-edpr-b2").completedAtSec!).toBeLessThan(at("sc-edpr-signal").completedAtSec!);
    expect(at("sc-edpr-signal").completedAtSec!).toBeLessThan(at("sc-edpr-leftturn").completedAtSec!);
    expect(at("sc-edpr-leftturn").completedAtSec!).toBeLessThan(at("sc-edpr-finish").completedAtSec!);
  });

  it("the LIVE session commends the full stop AND the give-way — the two duties, both seen", () => {
    // The recorder's own engine proves this on the trace gate; this proves the
    // STUDENT-facing path agrees. With the scan drill ARMED, a sloppy lookback
    // would false-fire on the very drive that scanned correctly — and a 927 m
    // run over real topology (three lane widths, a 107° right turn at a signal,
    // a lane shift) is exactly where a phantom lane-keeping or turn-signal bill
    // would surface.
    const codes = session.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).not.toContain("JUNCTION_SCAN_INCOMPLETE");
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
    expect(codes).not.toContain("RED_LIGHT_CROSSED");
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("POOR_LANE_KEEPING");
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR");
    const commended = session.events.filter((e) => e.kind === "commendation").map((e) => e.code);
    expect(commended).toContain("FULL_STOP_AT_STOP_SIGN");
    expect(commended).toContain("YIELDED_TO_PRIORITY");
  });

  it("the server regrades identically from the id alone (wire round-trip)", () => {
    const graded = gradeFinishWire({
      lessonId: "sc-ed-d2-priority-run@L3",
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
    expect(graded.lesson).toEqual(scenarioLessonById("sc-ed-d2-priority-run@L3"));
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
  });

  it("counter-proof: the rolling stop is SCORED 10 (опасна, never a modal)", () => {
    // STOP_SIGN_NO_FULL_STOP is опасна + exam-terminating, so it is SCORED with
    // a non-blocking toast rather than pausing into a card — a dangerous code
    // must never pop a modal mid-drive. So it lands on session.events and the A9
    // teach channel stays empty. The §9 exact-code assert lives on the trace
    // gate: traces/__tests__/sc-ed-d2-priority-run-traces.
    let s = createLessonSession(compileScenario(SC_ED_D2_PRIORITY_RUN, 3));
    const taught: string[] = [];
    recordScEdD2PriorityRunDrive(loadDistrict("d2-v1"), "mistake-rolling-stop", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    const r = buildLessonResult(s);
    expect(taught).toEqual([]);
    expect(s.events.filter((e) => e.kind === "violation").map((e) => e.code)).toEqual([
      "STOP_SIGN_NO_FULL_STOP",
    ]);
    expect(r.score).toBe(10);
    expect(r.passed).toBe(false);
    // FLIPPED (title-honesty pass). This assertion used to read `true`, with a
    // comment calling it „the honest reading: the gate measures where the car
    // went". It was the opposite — the gate's own title says «Спри напълно на
    // стоп-линията», and it was handing that certificate to a car recorded
    // rolling the paint at 11.9 km/h. sc-edpr-b2 now carries maxSpeedKmh 3 (a
    // halt demand) on the derived Б2 line, so the rolling demo fails the gate
    // AND takes the code — one act, one verdict, in both channels. The
    // full-stop drives still land it: the partial-scan demo below stops at the
    // same place and completes it, which is why «и огледай» had to leave the
    // title (a reachZone cannot see a glance; JU-23 grades the look).
    expect(r.objectives.find((o) => o.id === "sc-edpr-b2")!.done).toBe(false);
    expect(r.completedAll).toBe(false);
  });

  it("counter-proof: the partial scan TEACHES JU-23 — on a sheet that COMMENDS the stop", () => {
    // The exact inverse of the demo above, and the reason the config-gated
    // detector earns its place: this driver stopped perfectly. JUNCTION_SCAN_
    // INCOMPLETE is a teachable основна fault, so its FIRST encounter PAUSES
    // with a card instead of docking points — which is the entire pedagogy. The
    // student who „спрях, огледах се и потеглих" believes he did it right, and
    // only a card can tell him the second look was never taken. A silent −3
    // would not. Note the sheet: zero violations, and FULL_STOP_AT_STOP_SIGN
    // commended on the very drive being taught a fault.
    let s = createLessonSession(compileScenario(SC_ED_D2_PRIORITY_RUN, 3));
    const taught: string[] = [];
    recordScEdD2PriorityRunDrive(loadDistrict("d2-v1"), "mistake-partial-scan", {
      onTick: (tick) => {
        const step = applyTick(s, tick);
        s = step.state;
        for (const m of step.teachMoments ?? []) taught.push(m.code);
      },
    });
    expect(taught).toEqual(["JUNCTION_SCAN_INCOMPLETE"]);
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(s.events.some((e) => e.kind === "commendation" && e.code === "FULL_STOP_AT_STOP_SIGN")).toBe(
      true,
    );
    // Teach-first, not punish (doc 76 §0): the sheet stays clean at zero.
    expect(buildLessonResult(s).score).toBe(0);
  });

  it("compiles at every authored rung; L4 is the exam cold start, L5 the wet live network", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_ED_D2_PRIORITY_RUN, level).id).toBe(`sc-ed-d2-priority-run@L${level}`);
    }
    expect(compileScenario(SC_ED_D2_PRIORITY_RUN, 4).vehicleStart).toBe("cold");
    expect(compileScenario(SC_ED_D2_PRIORITY_RUN, 4).examMode).toBe(true);
    const l5 = compileScenario(SC_ED_D2_PRIORITY_RUN, 5);
    expect(l5.environment?.rain).toBe(true);
    // ADR-006 stage 4a: the rain grades the conditions envelope, it never
    // silently reduces the live car's grip under a dry-tuned ghost.
    expect(l5.physics).toBeUndefined();
    // The scan drill must survive EVERY rung — it is the template's grading
    // spine, not an L5 complication.
    for (const level of [1, 3, 5] as const) {
      expect(
        compileScenario(SC_ED_D2_PRIORITY_RUN, level).ruleConfig?.junctionScanObservationEnabled,
        `L${level}`,
      ).toBe(true);
    }
  });
});
