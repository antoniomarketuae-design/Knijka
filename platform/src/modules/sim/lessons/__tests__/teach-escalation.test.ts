/**
 * A9 — teach moment = pause + card, and repeat-penalty escalation.
 *
 * Engine side of doc 68 row A9 (restoring doc 65 §5 / audit D6+D7):
 *  - a FIRST teachable encounter emits a TeachMoment (the shell pauses on it)
 *    instead of a drive-by toast, exactly once per scenario;
 *  - pauses are rate-limited: same-tick clusters merge (all emit → one pause),
 *    later moments inside TEACH_PAUSE_MIN_GAP_S downgrade to the lesson toast;
 *  - опасна/terminating mistakes never pause (safety floor keeps the toast);
 *  - graded repeats carry ×1.5/×2.0 into the EFFECTIVE training score while
 *    the official base points/verdict stay untouched — on the client fold and
 *    through the wire (server grading path).
 */

import { describe, expect, it } from "vitest";
import { makeViolation } from "../../rules";
import type { HudEvent, LessonSpec } from "../../contracts";
import { applyEscalations } from "../escalation";
import { buildDebrief } from "../debrief";
import {
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
  TEACH_PAUSE_MIN_GAP_S,
} from "../engine";
import { gradeFinishWire, parseFinishLessonWire, serializeRuleEvents } from "../wire";
import type { LessonSessionState, TeachMoment } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

const lesson: LessonSpec = {
  id: "t-teach",
  order: 99,
  titleBg: "Тест урок",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [],
};

/** Collector: run ticks, gather hud events + teach moments. */
function run(
  state: LessonSessionState,
  ticks: Parameters<typeof applyTick>[1][],
): { state: LessonSessionState; hud: HudEvent[]; taught: TeachMoment[] } {
  let s = state;
  const hud: HudEvent[] = [];
  const taught: TeachMoment[] = [];
  for (const tick of ticks) {
    const r = applyTick(s, tick);
    s = r.state;
    hud.push(...r.hudEvents);
    taught.push(...(r.teachMoments ?? []));
  }
  return { state: s, hud, taught };
}

/** One minor-speeding episode: 56 km/h in a 50 zone (fires at t0+2), then reset. */
function speedingEpisode(t0: number) {
  return [
    makeTick({ t: t0, speedKmh: 56 }),
    makeTick({ t: t0 + 1, speedKmh: 56 }),
    makeTick({ t: t0 + 2, speedKmh: 56 }),
    makeTick({ t: t0 + 3, speedKmh: 40 }), // back under the limit → episode re-arms
  ];
}

describe("teach moment emission (A9)", () => {
  it("emits exactly one teachMoment per scenario first-encounter, no toast, nothing scored", () => {
    const r1 = run(createLessonSession(lesson), speedingEpisode(0));
    expect(r1.taught).toHaveLength(1);
    expect(r1.taught[0]).toMatchObject({
      code: "SPEEDING_OVER_LIMIT",
      scenarioId: "ev-speed-limit",
      severity: "vtorostepenna",
      points: 1,
      t: 2,
    });
    // The pause card replaces the drive-by toast for the taught encounter.
    expect(r1.hud.filter((e) => e.kind === "lesson")).toHaveLength(0);
    expect(r1.hud.filter((e) => e.kind === "violation")).toHaveLength(0);
    expect(r1.state.events).toHaveLength(0);

    // Repeat of the SAME scenario → graded toast, never a second teach moment.
    const r2 = run(r1.state, speedingEpisode(TEACH_PAUSE_MIN_GAP_S + 5));
    expect(r2.taught).toHaveLength(0);
    expect(r2.hud.some((e) => e.kind === "violation")).toBe(true);
    expect(r2.state.events).toHaveLength(1);
  });

  it("never pauses for опасна — the safety floor keeps the non-blocking toast", () => {
    const r = run(createLessonSession(lesson), [
      tickWithEvents(1, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        speedKmh: 30,
      }),
    ]);
    expect(r.taught).toHaveLength(0);
    expect(r.hud.some((e) => e.kind === "violation" && e.severity === "opasna")).toBe(true);
  });
});

describe("teach-pause rate limit (queue and merge)", () => {
  it("same-tick cluster: every first-encounter moment emits (the shell merges them into one pause)", () => {
    // Baseline tick establishes laneId 0, then one tick carries BOTH a turn
    // without indicator (ev-signaling-discipline) and a lane change without
    // indicator/mirror (ev-lane-change ×2 — the 2nd same-scenario hit grades).
    const r = run(createLessonSession(lesson), [
      makeTick({ t: 0, speedKmh: 30, laneId: 0 }),
      tickWithEvents(1, [{ kind: "turnStarted", direction: "left" }], {
        speedKmh: 30,
        laneId: 1,
      }),
    ]);
    expect(r.taught).toHaveLength(2);
    expect(new Set(r.taught.map((m) => m.code))).toEqual(
      new Set(["TURN_WITHOUT_INDICATOR", "LANE_CHANGE_WITHOUT_INDICATOR"]),
    );
    // Same scenario, same tick: the second ev-lane-change hit is already a
    // repeat → graded, not taught.
    expect(
      r.hud.some((e) => e.kind === "violation" && e.titleBg.length > 0),
    ).toBe(true);
    expect(r.state.events.map((e) => e.code)).toEqual(["LANE_CHANGE_WITHOUT_MIRROR_CHECK"]);
  });

  it("inside the min-gap window a new first encounter downgrades to the lesson toast", () => {
    // t=1: teach pause for the turn scenario.
    const r1 = run(createLessonSession(lesson), [
      tickWithEvents(1, [{ kind: "turnStarted", direction: "left" }], { speedKmh: 30 }),
    ]);
    expect(r1.taught).toHaveLength(1);

    // t=5 (< 1 + TEACH_PAUSE_MIN_GAP_S): another scenario's first encounter →
    // toast, no second pause.
    const r2 = run(r1.state, [
      makeTick({ t: 4, speedKmh: 30, laneId: 0 }),
      makeTick({ t: 5, speedKmh: 30, laneId: 1 }),
    ]);
    expect(r2.taught).toHaveLength(0);
    expect(r2.hud.some((e) => e.kind === "lesson")).toBe(true);

    // Past the window → the next first encounter pauses again.
    const t3 = 1 + TEACH_PAUSE_MIN_GAP_S + 10;
    const r3 = run(r2.state, [
      makeTick({ t: t3, speedKmh: 30, laneId: 1, handbrakeOn: true }),
      makeTick({ t: t3 + 2, speedKmh: 30, laneId: 1, handbrakeOn: true }),
    ]);
    expect(r3.taught).toHaveLength(1);
    expect(r3.taught[0].code).toBe("HANDBRAKE_LEFT_ON");
    expect(r3.taught[0].scenarioId).toBeNull(); // unmapped → keyed by its own code
  });
});

describe("repeat-penalty escalation lands in effective points", () => {
  it("×1.0 → ×1.5 → ×2.0 across graded repeats; official score untouched", () => {
    let s = createLessonSession(lesson);
    // Ep1 teaches; Ep2 grades ×1.0; Ep3 ×1.5; Ep4 ×2.0. Episodes are spread
    // apart only for realism — escalation is per-encounter, not time-based.
    for (const t0 of [0, 20, 40, 60]) {
      s = run(s, speedingEpisode(t0)).state;
    }

    expect(s.penaltyEscalations).toEqual([
      { code: "SPEEDING_OVER_LIMIT", t: 42, multiplier: 1.5 },
      { code: "SPEEDING_OVER_LIMIT", t: 62, multiplier: 2 },
    ]);

    const result = buildLessonResult(finishSession(s, 70));
    expect(result.score).toBe(3); // official: 3 × 1 т. (Наредба № 38 stays law)
    expect(result.effectiveScore).toBe(4.5); // training: 1 + 1.5 + 2
    expect(result.escalations).toHaveLength(2);
    expect(result.escalations[0]).toMatchObject({
      code: "SPEEDING_OVER_LIMIT",
      basePoints: 1,
      multiplier: 1.5,
      effectivePoints: 1.5,
    });
    // The official verdict math never reads the effective score.
    expect(result.summary.score.totalPoints).toBe(3);

    // Debrief names the repeat and keeps both scores visible.
    const debrief = buildDebrief(lesson, result).text;
    expect(debrief).toContain("повторна грешка ×2");
    // The unit is on both numbers now — a bare „т." reads as контролни точки
    // (the licence) to a Bulgarian, which is the misreading this wave closes.
    expect(debrief).toContain("Тренировъчен резултат: 4.5 наказателни т.");
    expect(debrief).toContain("остава 3 наказателни т.");
  });

  it("always-grade (опасна) escalates from its second encounter", () => {
    const redLight = (t: number) =>
      tickWithEvents(t, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        speedKmh: 30,
      });
    const r = run(createLessonSession(lesson), [redLight(1), redLight(5)]);
    expect(r.taught).toHaveLength(0);
    expect(r.state.penaltyEscalations).toEqual([
      { code: "RED_LIGHT_CROSSED", t: 5, multiplier: 1.5 },
    ]);

    const result = buildLessonResult(finishSession(r.state, 10));
    expect(result.score).toBe(20);
    expect(result.effectiveScore).toBe(25); // 10 + 10 × 1.5
  });

  it("applyEscalations consumes each record once and ignores unmatched ones", () => {
    const mistakes = [makeViolation("SPEEDING_OVER_LIMIT", 5), makeViolation("SPEEDING_OVER_LIMIT", 9)];
    const { effectiveTotalPoints, escalated } = applyEscalations(mistakes, [
      { code: "SPEEDING_OVER_LIMIT", t: 9, multiplier: 1.5 },
      { code: "SPEEDING_OVER_LIMIT", t: 99, multiplier: 2 }, // no such event
    ]);
    expect(effectiveTotalPoints).toBe(2.5);
    expect(escalated).toHaveLength(1);
    expect(escalated[0].t).toBe(9);
  });
});

describe("escalation over the wire (server grading path)", () => {
  const baseWire = {
    lessonId: "l0-free-drive",
    startedAtMs: 1_000,
    finishedAtMs: 61_000,
    aborted: false,
    objectives: [],
  };

  it("serializes multipliers onto the right events and the server applies them to the effective score only", () => {
    const events = [
      makeViolation("SPEEDING_OVER_LIMIT", 7),
      makeViolation("SPEEDING_OVER_LIMIT", 12),
      makeViolation("SPEEDING_OVER_LIMIT", 17),
    ];
    const ruleEvents = serializeRuleEvents(events, [
      { code: "SPEEDING_OVER_LIMIT", t: 12, multiplier: 1.5 },
      { code: "SPEEDING_OVER_LIMIT", t: 17, multiplier: 2 },
    ]);
    expect(ruleEvents).toEqual([
      { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 7 },
      { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 12, penaltyMultiplier: 1.5 },
      { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 17, penaltyMultiplier: 2 },
    ]);

    const graded = gradeFinishWire({ ...baseWire, ruleEvents });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.score).toBe(3); // official, catalog-rebuilt
    expect(graded.result.effectiveScore).toBe(4.5);
    expect(graded.result.escalations).toHaveLength(2);
    expect(graded.result.passed).toBe(true); // 3 т. ≤ 9 — escalation never flips the verdict
  });

  it("rejects multipliers outside the coach's ladder and on non-violations", () => {
    const tampered = [
      { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 3, penaltyMultiplier: 3 },
    ];
    expect(parseFinishLessonWire({ ...baseWire, ruleEvents: tampered })).toBeNull();
    expect(gradeFinishWire({ ...baseWire, ruleEvents: tampered }).status).toBe("invalid");

    expect(
      parseFinishLessonWire({
        ...baseWire,
        ruleEvents: [
          { kind: "commendation", code: "CLEAN_DRIVING", t: 3, penaltyMultiplier: 1.5 },
        ],
      }),
    ).toBeNull();
  });
});
