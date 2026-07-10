/**
 * A15 — session feedback v2:
 *  - corrective-action completeness: EVERY ViolationCode ships an authored
 *    Bulgarian `correctiveBg` (the type already forces the field; this sweep
 *    guards against placeholder/empty copy),
 *  - position threading: applyTick records WHERE each scored event happened,
 *    buildLessonResult + the wire carry it additively,
 *  - near-miss channel: applyNearMiss → result → wire → store payload.
 */

import { describe, expect, it } from "vitest";
import type { LessonSpec, NearMissEvent } from "../../contracts";
import { COMMENDATIONS, VIOLATIONS, makeViolation } from "../../rules";
import { buildDebrief } from "../debrief";
import {
  applyNearMiss,
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
} from "../engine";
import { parseSimSessionEvents, type SimSessionEventsJson } from "../store";
import {
  gradeFinishWire,
  parseFinishLessonWire,
  serializeNearMisses,
  serializeRuleEvents,
} from "../wire";
import { makeTick, tickWithEvents } from "./fixtures";

const microLesson: LessonSpec = {
  id: "t-micro-a15",
  order: 99,
  titleBg: "Микроурок А15",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 90 },
  preDrive: false,
  objectives: [],
};

const nearMiss = (over: Partial<NearMissEvent> = {}): NearMissEvent => ({
  tSec: 12,
  kind: "pedestrian",
  npcId: 7,
  clearanceM: 0.4,
  relSpeedMps: 6.5,
  ...over,
});

// ---------------------------------------------------------------------------
// Corrective-action copy — completeness sweep
// ---------------------------------------------------------------------------

describe("A15 corrective-action map (catalog correctiveBg)", () => {
  it("every violation code has substantive Bulgarian corrective copy", () => {
    for (const [code, spec] of Object.entries(VIOLATIONS)) {
      expect(spec.correctiveBg, `correctiveBg missing for ${code}`).toBeTruthy();
      // Substantive: an instruction, not a stub — and actually in Bulgarian.
      expect(spec.correctiveBg.length, `correctiveBg too short for ${code}`).toBeGreaterThan(30);
      expect(spec.correctiveBg, `correctiveBg not Cyrillic for ${code}`).toMatch(/[а-яА-Я]/);
      // The corrective must not just repeat the explanation.
      expect(spec.correctiveBg).not.toBe(spec.explanationBg);
    }
  });

  it("the debrief weaves the corrective line under each mistake group", () => {
    let s = createLessonSession(microLesson);
    s = applyTick(
      s,
      tickWithEvents(1, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        speedKmh: 30,
      }),
    ).state;
    const result = buildLessonResult(finishSession(s, 2));
    const { text } = buildDebrief(microLesson, result);
    expect(text).toContain("Правилното действие:");
    expect(text).toContain(VIOLATIONS.RED_LIGHT_CROSSED.correctiveBg);
  });
});

// ---------------------------------------------------------------------------
// Position threading (engine → result)
// ---------------------------------------------------------------------------

describe("A15 event positions (applyTick → result)", () => {
  it("records the tick position for every scored event, paired by (kind, code, t)", () => {
    let s = createLessonSession(microLesson);
    s = applyTick(
      s,
      tickWithEvents(3, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        speedKmh: 30,
        position: { x: 120, y: -45 },
      }),
    ).state;

    expect(s.events).toHaveLength(1);
    expect(s.eventPositions).toHaveLength(1);
    const rec = (s.eventPositions ?? [])[0];
    expect(rec).toEqual({
      kind: "violation",
      code: "RED_LIGHT_CROSSED",
      t: s.events[0].t,
      x: 120,
      y: -45,
    });

    const result = buildLessonResult(finishSession(s, 4));
    expect(result.eventPositions).toEqual(s.eventPositions);
  });

  it("does not grow the channel on clean ticks", () => {
    let s = createLessonSession(microLesson);
    s = applyTick(s, makeTick({ t: 1, speedKmh: 40, position: { x: 5, y: 5 } })).state;
    expect(s.eventPositions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Near-miss channel (applyNearMiss → result)
// ---------------------------------------------------------------------------

describe("A15 near misses (applyNearMiss → result)", () => {
  it("records the stat with the player position; null position keeps the stat", () => {
    let s = createLessonSession(microLesson);
    s = applyNearMiss(s, nearMiss(), { x: 30, y: 40 });
    s = applyNearMiss(s, nearMiss({ tSec: 20, kind: "vehicle", clearanceM: 0.8 }), null);

    expect(s.nearMisses).toHaveLength(2);
    expect(s.nearMisses?.[0]).toMatchObject({ kind: "pedestrian", x: 30, y: 40 });
    expect(s.nearMisses?.[1]).toMatchObject({ kind: "vehicle", x: null, y: null });

    const result = buildLessonResult(finishSession(s, 30));
    expect(result.nearMisses).toEqual(s.nearMisses);
    // Never graded: the official summary sees zero events.
    expect(result.score).toBe(0);
    expect(result.summary.mistakes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Wire — positions + near misses, additive and validated
// ---------------------------------------------------------------------------

describe("A15 wire (serialize → parse → grade)", () => {
  it("serializeRuleEvents attaches positions by (kind, code, t), consumed once", () => {
    const events = [
      makeViolation("SPEEDING_OVER_LIMIT", 5),
      makeViolation("SPEEDING_OVER_LIMIT", 9),
    ];
    const wire = serializeRuleEvents(events, [], [
      { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 5, x: 1, y: 2 },
      { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 9, x: 3, y: 4 },
    ]);
    expect(wire[0]).toMatchObject({ t: 5, x: 1, y: 2 });
    expect(wire[1]).toMatchObject({ t: 9, x: 3, y: 4 });

    // No positions recorded (e.g. pre-drive events) → no coordinates on the wire.
    const bare = serializeRuleEvents(events);
    expect(bare[0].x).toBeUndefined();
    expect(bare[0].y).toBeUndefined();
  });

  it("parse keeps valid positions, drops half-pairs/absurd values, never rejects on them", () => {
    const base = {
      lessonId: "l0-free-drive",
      startedAtMs: 1_000,
      finishedAtMs: 61_000,
      aborted: false,
      objectives: [],
    };
    const parsed = parseFinishLessonWire({
      ...base,
      ruleEvents: [
        { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 5, x: 10, y: 20 },
        { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 9, x: 10 }, // half-pair
        { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 12, x: 1e9, y: 0 }, // absurd
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.ruleEvents[0]).toMatchObject({ x: 10, y: 20 });
    expect(parsed?.ruleEvents[1].x).toBeUndefined();
    expect(parsed?.ruleEvents[2].x).toBeUndefined();
  });

  it("parses valid near misses and rejects malformed lists", () => {
    const base = {
      lessonId: "l0-free-drive",
      startedAtMs: 1_000,
      finishedAtMs: 61_000,
      aborted: false,
      ruleEvents: [],
      objectives: [],
    };
    const ok = parseFinishLessonWire({
      ...base,
      nearMisses: [
        { tSec: 12, kind: "pedestrian", clearanceM: 0.4, relSpeedMps: 6.5, x: 30, y: 40 },
      ],
    });
    expect(ok?.nearMisses).toHaveLength(1);
    expect(ok?.nearMisses?.[0]).toMatchObject({ kind: "pedestrian", x: 30, y: 40 });

    // Absent stays absent (older clients).
    expect(parseFinishLessonWire(base)?.nearMisses).toBeUndefined();

    // Present-but-malformed is not our payload.
    for (const bad of [
      [{ tSec: 12, kind: "tank", clearanceM: 0.4, relSpeedMps: 6 }],
      [{ tSec: -1, kind: "vehicle", clearanceM: 0.4, relSpeedMps: 6 }],
      [{ tSec: 12, kind: "vehicle", clearanceM: -0.1, relSpeedMps: 6 }],
      [{ tSec: 12, kind: "vehicle", clearanceM: 0.4, relSpeedMps: 1e6 }],
      "nope",
    ]) {
      expect(parseFinishLessonWire({ ...base, nearMisses: bad })).toBeNull();
    }
  });

  it("gradeFinishWire passes positions + near misses through without touching the grade", () => {
    const session = (nearMisses?: unknown) => ({
      lessonId: "l0-free-drive",
      startedAtMs: 1_000,
      finishedAtMs: 61_000,
      aborted: false,
      ruleEvents: [
        { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 5, x: 10, y: 20 },
      ],
      objectives: [],
      ...(nearMisses !== undefined ? { nearMisses } : {}),
    });
    const withStats = gradeFinishWire(
      session([{ tSec: 12, kind: "cyclist", clearanceM: 0.3, relSpeedMps: 4 }]),
    );
    const without = gradeFinishWire(session());
    if (withStats.status !== "ok" || without.status !== "ok") {
      throw new Error("expected ok grades");
    }
    expect(withStats.wire.nearMisses).toHaveLength(1);
    // Identical official outcome either way — the A15 channels never score.
    expect(withStats.result.score).toBe(without.result.score);
    expect(withStats.result.passed).toBe(without.result.passed);
  });

  it("serializeNearMisses maps the session stat and omits null positions", () => {
    const wire = serializeNearMisses([
      { tSec: 1, kind: "vehicle", clearanceM: 0.5, relSpeedMps: 3, x: 7, y: 8 },
      { tSec: 2, kind: "cyclist", clearanceM: 0.2, relSpeedMps: 5, x: null, y: null },
    ]);
    expect(wire[0]).toMatchObject({ x: 7, y: 8 });
    expect(wire[1].x).toBeUndefined();
    expect(wire[1].y).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Store payload — additive fields survive the defensive parse
// ---------------------------------------------------------------------------

describe("A15 store payload (parseSimSessionEvents)", () => {
  const payload: SimSessionEventsJson = {
    version: 1,
    passed: true,
    aborted: false,
    terminated: false,
    completedAll: true,
    ruleEvents: [],
    objectives: [],
    effectiveScore: 4.5,
    eventPositions: [{ kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 5, x: 1, y: 2 }],
    nearMisses: [
      { tSec: 12, kind: "pedestrian", clearanceM: 0.4, relSpeedMps: 6.5, x: 30, y: 40 },
    ],
  };

  it("round-trips the A15 fields", () => {
    const parsed = parseSimSessionEvents(JSON.parse(JSON.stringify(payload)));
    expect(parsed?.effectiveScore).toBe(4.5);
    expect(parsed?.eventPositions).toHaveLength(1);
    expect(parsed?.nearMisses).toHaveLength(1);
  });

  it("pre-A15 rows parse with the fields absent (unknown, not defaulted)", () => {
    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(payload));
    delete legacy.effectiveScore;
    delete legacy.eventPositions;
    delete legacy.nearMisses;
    const parsed = parseSimSessionEvents(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed?.effectiveScore).toBeUndefined();
    expect(parsed?.eventPositions).toBeUndefined();
    expect(parsed?.nearMisses).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sanity: commendation catalog untouched by A15 (no correctiveBg there)
// ---------------------------------------------------------------------------

describe("commendation catalog", () => {
  it("still authors title + explanation for every code", () => {
    for (const [code, spec] of Object.entries(COMMENDATIONS)) {
      expect(spec.titleBg, code).toBeTruthy();
      expect(spec.explanationBg, code).toBeTruthy();
    }
  });
});
