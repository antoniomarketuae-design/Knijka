import { describe, expect, it } from "vitest";
import { makeCommendation, makeViolation } from "../../rules";
import { lessonById } from "../specs";
import {
  gradeFinishWire,
  parseFinishLessonWire,
  rebuildRuleEvents,
  reconcileObjectiveOutcomes,
  serializeRuleEvents,
} from "../wire";

describe("rule-event wire round-trip", () => {
  it("serializes to compact refs and rebuilds canonical events", () => {
    const original = [
      makeViolation("RED_LIGHT_CROSSED", 4.2),
      makeViolation("COLLISION", 9, { detail: "vehicle" }),
      makeCommendation("SAFE_LANE_CHANGE", 12),
    ];
    const wire = serializeRuleEvents(original);
    expect(wire).toEqual([
      { kind: "violation", code: "RED_LIGHT_CROSSED", t: 4.2 },
      { kind: "violation", code: "COLLISION", t: 9, detail: "vehicle" },
      { kind: "commendation", code: "SAFE_LANE_CHANGE", t: 12 },
    ]);

    const rebuilt = rebuildRuleEvents(wire);
    expect(rebuilt).toEqual(original);
  });

  it("restores the pre-drive per-step titles from detail", () => {
    const rebuilt = rebuildRuleEvents([
      { kind: "violation", code: "PREDRIVE_STEP_SKIPPED", t: 1, detail: "adjust-mirrors" },
      { kind: "violation", code: "PREDRIVE_WRONG_ORDER", t: 2, detail: "start-engine" },
    ]);
    expect(rebuilt?.[0].titleBg).toBe("Пропусната стъпка: настройка на огледалата");
    expect(rebuilt?.[1].titleBg).toBe("Нарушен ред: запалване на двигателя");
  });

  it("rejects unknown codes — points can never be invented client-side", () => {
    expect(rebuildRuleEvents([{ kind: "violation", code: "MADE_UP", t: 1 }])).toBeNull();
    expect(rebuildRuleEvents([{ kind: "commendation", code: "COLLISION", t: 1 }])).toBeNull();
  });
});

describe("parseFinishLessonWire", () => {
  const valid = {
    lessonId: "l0-free-drive",
    startedAtMs: 1000,
    finishedAtMs: 61000,
    aborted: false,
    ruleEvents: [{ kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 3 }],
    objectives: [],
  };

  it("accepts a well-formed payload", () => {
    expect(parseFinishLessonWire(valid)).toMatchObject({ lessonId: "l0-free-drive" });
  });

  it("rejects malformed payloads", () => {
    expect(parseFinishLessonWire(null)).toBeNull();
    expect(parseFinishLessonWire({ ...valid, finishedAtMs: 0 })).toBeNull(); // ends before start
    expect(parseFinishLessonWire({ ...valid, aborted: "no" })).toBeNull();
    expect(parseFinishLessonWire({ ...valid, ruleEvents: [{ kind: "violation" }] })).toBeNull();
    expect(
      parseFinishLessonWire({ ...valid, ruleEvents: [{ kind: "violation", code: "X", t: -1 }] }),
    ).toBeNull();
    expect(
      parseFinishLessonWire({ ...valid, finishedAtMs: valid.startedAtMs + 5 * 60 * 60 * 1000 }),
    ).toBeNull(); // absurd duration
  });

  it("accepts and normalizes an optional micro-quiz tally", () => {
    const parsed = parseFinishLessonWire({ ...valid, microQuiz: { total: 4, correct: 3 } });
    expect(parsed?.microQuiz).toEqual({ total: 4, correct: 3 });
    // Absent tally is fine (older/quiet sessions).
    expect(parseFinishLessonWire(valid)?.microQuiz).toBeUndefined();
  });

  it("rejects an impossible micro-quiz tally", () => {
    expect(parseFinishLessonWire({ ...valid, microQuiz: { total: 2, correct: 3 } })).toBeNull();
    expect(parseFinishLessonWire({ ...valid, microQuiz: { total: -1, correct: 0 } })).toBeNull();
    expect(parseFinishLessonWire({ ...valid, microQuiz: { total: 999, correct: 1 } })).toBeNull();
    expect(parseFinishLessonWire({ ...valid, microQuiz: { total: "x", correct: 0 } })).toBeNull();
  });
});

describe("reconcileObjectiveOutcomes", () => {
  const l2 = lessonById("l2-intersections")!;

  it("normalizes to spec order and fills missing objectives as not done", () => {
    const out = reconcileObjectiveOutcomes(l2, [
      { id: "l2-signal-1", done: true, completedAtSec: 44 },
    ]);
    expect(out?.map((o) => [o.id, o.done])).toEqual([
      ["l2-stop-sign", false],
      ["l2-signal-1", true],
      ["l2-signal-2", false],
    ]);
    expect(out?.[1].completedAtSec).toBe(44);
    expect(out?.[1].titleBg).toBe("Премини първото кръстовище със светофар");
  });

  it("rejects unknown or duplicate objective ids", () => {
    expect(reconcileObjectiveOutcomes(l2, [{ id: "nope", done: true, completedAtSec: 1 }])).toBeNull();
    expect(
      reconcileObjectiveOutcomes(l2, [
        { id: "l2-signal-1", done: true, completedAtSec: 1 },
        { id: "l2-signal-1", done: true, completedAtSec: 2 },
      ]),
    ).toBeNull();
  });
});

describe("gradeFinishWire (server-side grading pipeline)", () => {
  const l1 = lessonById("l1-preparation")!;
  const base = {
    lessonId: l1.id,
    startedAtMs: 0,
    finishedAtMs: 120_000,
    aborted: false,
    ruleEvents: [] as unknown[],
    objectives: l1.objectives.map((o) => ({ id: o.id, done: true, completedAtSec: 60 })),
  };

  it("passes a clean, fully completed session", () => {
    const graded = gradeFinishWire(base);
    if (graded.status !== "ok") throw new Error(`expected ok, got ${graded.status}`);
    expect(graded.result.passed).toBe(true);
    expect(graded.result.score).toBe(0);
    expect(graded.result.durationSec).toBe(120);
  });

  it("recomputes the verdict from canonical points — client cannot lower them", () => {
    const graded = gradeFinishWire({
      ...base,
      // Client "claims" these are harmless; catalog says опасна, 10 т.
      ruleEvents: [{ kind: "violation", code: "RED_LIGHT_CROSSED", t: 5, points: 0 }],
    });
    if (graded.status !== "ok") throw new Error(`expected ok, got ${graded.status}`);
    expect(graded.result.score).toBe(10);
    expect(graded.result.passed).toBe(false);
    expect(graded.events[0]).toMatchObject({ points: 10, severityClass: "opasna" });
  });

  it("an aborted or route-incomplete session never passes", () => {
    const aborted = gradeFinishWire({ ...base, aborted: true });
    if (aborted.status !== "ok") throw new Error("expected ok");
    expect(aborted.result.passed).toBe(false);

    const incomplete = gradeFinishWire({
      ...base,
      objectives: [{ id: l1.objectives[0].id, done: true, completedAtSec: 10 }],
    });
    if (incomplete.status !== "ok") throw new Error("expected ok");
    expect(incomplete.result.completedAll).toBe(false);
    expect(incomplete.result.passed).toBe(false);
  });

  it("rejects unknown lessons and malformed payloads", () => {
    expect(gradeFinishWire({ ...base, lessonId: "l99-nope" }).status).toBe("unknown-lesson");
    expect(gradeFinishWire(null).status).toBe("invalid");
    expect(
      gradeFinishWire({ ...base, ruleEvents: [{ kind: "violation", code: "FAKE", t: 1 }] }).status,
    ).toBe("invalid");
    expect(
      gradeFinishWire({ ...base, objectives: [{ id: "foreign", done: true, completedAtSec: 1 }] })
        .status,
    ).toBe("invalid");
  });
});

describe("lesson specs sanity", () => {
  it("every objective of every lesson parses against its evaluator", async () => {
    const { LESSONS } = await import("../specs");
    const { parseObjectiveParams } = await import("../objectives");
    for (const lesson of LESSONS) {
      for (const objective of lesson.objectives) {
        expect(() => parseObjectiveParams(objective)).not.toThrow();
      }
    }
  });

  it("ids and orders are unique and the curriculum is contiguous", async () => {
    const { LESSONS } = await import("../specs");
    const ids = new Set(LESSONS.map((l) => l.id));
    expect(ids.size).toBe(LESSONS.length);
    // Orders are contiguous 0..n-1 (curriculum has no gaps).
    const orders = [...LESSONS].map((l) => l.order).sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, i) => i));
    // Every lesson spawns at a real district spawn point.
    for (const lesson of LESSONS) {
      expect(lesson.spawn.pointId).toMatch(/^spawn-[1-6]$/);
    }
  });
});
