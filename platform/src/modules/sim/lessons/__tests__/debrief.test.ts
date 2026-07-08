import { describe, expect, it } from "vitest";
import { makeCommendation, makeViolation, type ScorableEvent } from "../../rules";
import { buildDebrief } from "../debrief";
import {
  abortSession,
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
} from "../engine";
import { lessonById } from "../specs";
import type { LessonResult } from "../types";
import { makeTick } from "./fixtures";

const l0 = lessonById("l0-free-drive")!;

/** Run a free-drive session that "experienced" the given events, then fold. */
function resultWithEvents(events: ScorableEvent[], opts: { aborted?: boolean } = {}): LessonResult {
  let s = createLessonSession(l0);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = { ...s, events: [...s.events, ...events] };
  s = opts.aborted ? abortSession(s, 99) : finishSession(s, 99);
  return buildLessonResult(s);
}

describe("buildDebrief", () => {
  it("celebrates a clean passed session", () => {
    const result = resultWithEvents([]);
    const d = buildDebrief(l0, result);
    expect(d.text).toContain("издържан");
    expect(d.text).toContain("чисто каране");
    expect(d.conceptIds).toEqual([]);
  });

  it("lists commendations under 'what went well'", () => {
    const result = resultWithEvents([
      makeCommendation("FULL_STOP_AT_STOP_SIGN", 10),
      makeCommendation("FULL_STOP_AT_STOP_SIGN", 20),
      makeCommendation("PEDESTRIAN_YIELDED", 30),
    ]);
    const d = buildDebrief(l0, result);
    expect(d.text).toContain("Какво се получи добре:");
    expect(d.text).toContain("Правилно спиране на знак Б2 ×2");
    expect(d.text).toContain("Правилно пропускане на пешеходец");
  });

  it("orders mistakes dangerous-first, cites law refs, links concepts", () => {
    const result = resultWithEvents([
      makeViolation("HANDBRAKE_LEFT_ON", 5), // второстепенна, 1 т.
      makeViolation("RED_LIGHT_CROSSED", 10), // опасна, 10 т.
      makeViolation("TURN_WITHOUT_INDICATOR", 15), // основна, 3 т.
    ]);
    const d = buildDebrief(l0, result);

    expect(d.text).toContain("не е издържан");
    expect(d.text).toContain("допусната е опасна грешка");

    const red = d.text.indexOf("Преминаване на червен сигнал");
    const indicator = d.text.indexOf("Завиване без мигач");
    const handbrake = d.text.indexOf("Движение с вдигната ръчна спирачка");
    expect(red).toBeGreaterThan(-1);
    expect(red).toBeLessThan(indicator);
    expect(indicator).toBeLessThan(handbrake);

    expect(d.text).toContain("ППЗДвП чл. 31");
    expect(d.text).toContain("Какво да упражниш");
    // Concept ids in order of first mistake occurrence.
    expect(d.conceptIds).toEqual([
      "c-vehicle-controls",
      "c-traffic-light-signals",
      "c-driver-signals",
    ]);
  });

  it("groups repeated violations with a count and total points", () => {
    const result = resultWithEvents([
      makeViolation("SPEEDING_OVER_LIMIT", 5),
      makeViolation("SPEEDING_OVER_LIMIT", 25),
    ]);
    const d = buildDebrief(l0, result);
    expect(d.text).toContain("Превишена скорост ×2");
    expect(d.text).toContain("2 т.");
  });

  it("mentions the collision termination explicitly", () => {
    const result = resultWithEvents([makeViolation("COLLISION", 3)]);
    const d = buildDebrief(l0, result);
    expect(d.text).toContain("прекратява изпита");
  });

  it("handles aborted sessions gently", () => {
    const result = resultWithEvents([], { aborted: true });
    const d = buildDebrief(l0, result);
    expect(d.text).toContain("Прекъсна урока");
    expect(result.passed).toBe(false);
  });

  it("reports the micro-quiz tally and ties it to theory readiness", () => {
    const result = resultWithEvents([]);
    const d = buildDebrief(l0, result, { microQuiz: { total: 4, correct: 3 } });
    expect(d.text).toContain("Теория в движение:");
    expect(d.text).toContain("вярно на 3 от 4 въпроса");
    expect(d.text).toContain("същата готовност");
  });

  it("omits the micro-quiz section when no quizzes were shown", () => {
    const d = buildDebrief(l0, resultWithEvents([]), { microQuiz: { total: 0, correct: 0 } });
    expect(d.text).not.toContain("Теория в движение");
  });

  it("celebrates beating the prior best score", () => {
    const result = resultWithEvents([makeViolation("HANDBRAKE_LEFT_ON", 5)]); // 1 pt
    const d = buildDebrief(l0, result, { priorBestScore: 4 });
    expect(d.text).toContain("Личен напредък");
    expect(d.text).toContain("1 т. срещу най-добрите ти 4 т.");
  });

  it("notes a matched or worse score encouragingly, and skips it on first attempt", () => {
    const worse = buildDebrief(l0, resultWithEvents([makeViolation("RED_LIGHT_CROSSED", 5)]), {
      priorBestScore: 2,
    });
    expect(worse.text).toContain("остава 2 т.");

    const first = buildDebrief(l0, resultWithEvents([]), { priorBestScore: null });
    expect(first.text).not.toContain("напредък");
    expect(first.text).not.toContain("резултат за този урок");
  });

  it("names the concept behind the most severe mistake as the focus", () => {
    const result = resultWithEvents([
      makeViolation("HANDBRAKE_LEFT_ON", 5), // второстепенна → c-vehicle-controls
      makeViolation("RED_LIGHT_CROSSED", 10), // опасна → c-traffic-light-signals (focus)
    ]);
    const d = buildDebrief(l0, result, {
      conceptTitles: {
        "c-traffic-light-signals": "Светофари",
        "c-vehicle-controls": "Управление на автомобила",
      },
    });
    expect(d.text).toContain("започни от „Светофари“");
    expect(d.text).toContain("най-тежката ти грешка");
  });

  it("flags an unfinished route on an otherwise clean drive", () => {
    const l2 = lessonById("l2-intersections")!;
    let s = createLessonSession(l2);
    s = applyTick(s, makeTick({ t: 1 })).state;
    const result = buildLessonResult(finishSession(s, 30));

    expect(result.completedAll).toBe(false);
    const d = buildDebrief(l2, result);
    expect(d.text).toContain("не е завършен");
    expect(d.text).toContain("завърши всички задачи");
  });
});
