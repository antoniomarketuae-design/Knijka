import { afterEach, describe, expect, it } from "vitest";
import { makeViolation } from "../../rules";
import { buildDebrief } from "../debrief";
import {
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
} from "../engine";
import { computeProgression } from "../progression";
import { lessonById, LESSONS } from "../specs";
import {
  getSimSessionStore,
  parseSimSessionEvents,
  setSimSessionStore,
  type SimSessionEventsJson,
} from "../store";
import { createFakeSimSessionStore } from "./fixtures";
import { makeTick } from "./fixtures";

afterEach(() => setSimSessionStore(null));

/** End-to-end client flow: run a session, fold it, persist it, list it. */
async function persistOneSession(userId: string) {
  const lesson = lessonById("l0-free-drive")!;
  let s = createLessonSession(lesson);
  s = applyTick(s, makeTick({ t: 1, speedKmh: 40 })).state;
  s = { ...s, events: [...s.events, makeViolation("HANDBRAKE_LEFT_ON", 2)] };
  s = finishSession(s, 30);

  const result = buildLessonResult(s);
  const debrief = buildDebrief(lesson, result);
  const events: SimSessionEventsJson = {
    version: 1,
    passed: result.passed,
    aborted: result.aborted,
    terminated: result.summary.terminated,
    completedAll: result.completedAll,
    ruleEvents: s.events,
    objectives: result.objectives,
  };

  const { id } = await getSimSessionStore().saveSession(userId, {
    lessonId: lesson.id,
    startedAt: new Date("2026-07-07T10:00:00Z"),
    finishedAt: new Date("2026-07-07T10:05:00Z"),
    score: result.score,
    events,
    debrief: debrief.text,
  });
  return { id, result };
}

describe("SimSession persistence (fake store)", () => {
  it("saves the finished session and lists it with the parsed verdict", async () => {
    const fake = createFakeSimSessionStore();
    setSimSessionStore(fake);

    const { id, result } = await persistOneSession("user-1");
    expect(id).toBe("sess-1");
    expect(result.passed).toBe(true); // 1 second-degree point ≤ 9
    expect(result.score).toBe(1);

    const rows = await getSimSessionStore().listSessions("user-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      lessonId: "l0-free-drive",
      score: 1,
      passed: true,
    });

    // Full payload round-trips through the store untouched.
    expect(fake.rows[0].input.events.ruleEvents[0]).toMatchObject({
      code: "HANDBRAKE_LEFT_ON",
    });
    expect(fake.rows[0].input.debrief).toContain("издържан");
  });

  it("feeds progression from listed sessions", async () => {
    setSimSessionStore(createFakeSimSessionStore());
    await persistOneSession("user-1");

    const rows = await getSimSessionStore().listSessions("user-1");
    const entries = computeProgression(
      LESSONS,
      rows.filter((r) => r.score !== null).map((r) => ({
        lessonId: r.lessonId,
        passed: r.passed,
        score: r.score as number,
      })),
    );
    expect(entries.find((e) => e.lesson.id === "l1-preparation")?.unlocked).toBe(true);
  });

  it("scopes sessions per user", async () => {
    setSimSessionStore(createFakeSimSessionStore());
    await persistOneSession("user-1");
    expect(await getSimSessionStore().listSessions("user-2")).toHaveLength(0);
  });
});

describe("parseSimSessionEvents (defensive Json parse)", () => {
  const valid: SimSessionEventsJson = {
    version: 1,
    passed: true,
    aborted: false,
    terminated: false,
    completedAll: true,
    ruleEvents: [],
    objectives: [],
  };

  it("round-trips a valid payload (including JSON serialization)", () => {
    const parsed = parseSimSessionEvents(JSON.parse(JSON.stringify(valid)));
    expect(parsed).toEqual(valid);
  });

  it("rejects foreign or corrupt payloads", () => {
    expect(parseSimSessionEvents(null)).toBeNull();
    expect(parseSimSessionEvents("passed")).toBeNull();
    expect(parseSimSessionEvents({})).toBeNull();
    expect(parseSimSessionEvents({ ...valid, version: 2 })).toBeNull();
    expect(parseSimSessionEvents({ ...valid, passed: "yes" })).toBeNull();
    expect(parseSimSessionEvents({ ...valid, ruleEvents: "none" })).toBeNull();
  });
});
