import { describe, expect, it } from "vitest";
import {
  VIOLATIONS,
  makeCommendation,
  makeViolation,
  roadConsequenceFor,
  type ScorableEvent,
  type ViolationCode,
} from "../../rules";
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

    expect(d.text).toContain("ППЗДвП светлинни сигнали за регулиране на движението");
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
    // WAS `toContain("2 т.")`. A bare „т." is the defect this wave exists to
    // remove: in Bulgarian, unqualified „точки" means КОНТРОЛНИ точки — the
    // licence — and the founder read his lesson score as exactly that. The
    // unit now rides on the number wherever the debrief prints one.
    expect(d.text).toContain("2 наказателни т. по изпитния лист");
  });

  it("never prints a bare „N т.“ — the unit rides on every number", () => {
    const result = resultWithEvents([
      makeViolation("SPEEDING_DANGEROUS", 4),
      makeViolation("HANDBRAKE_LEFT_ON", 9),
    ]);
    // priorBestScore exercises the improvement line too — it printed „1 т.
    // срещу най-добрите ти 4 т." and was the last bare pair in the file.
    const d = buildDebrief(l0, result, { priorBestScore: 3 });
    // „10 т." / „1 т." with nothing after it. „10 наказателни т." is fine.
    const bare = d.text.match(/\d+(?:[.,]\d+)?\s+т\.(?!\s*по)/g) ?? [];
    expect(bare, `bare point figures: ${bare.join(", ")}`).toEqual([]);
    expect(d.text).toContain("НЕ са контролни точки");
  });

  it("says what happens on the street, not only what it costs on the exam", () => {
    // THEO-4: a real instructor says both halves. The exam mark is Наредба
    // № 38's; the глоба, the instrument and the контролни точки are the road's,
    // and they are shown separately and cited separately.
    const result = resultWithEvents([makeViolation("RED_LIGHT_CROSSED", 7)]);
    const d = buildDebrief(l0, result);
    expect(d.text).toContain("10 наказателни т. по изпитния лист");
    expect(d.text).toContain("Наредба № 38 приложение № 5, т. 10, б. „в“");
    expect(d.text).toContain("На пътя");
    expect(d.text).toContain("76,69 €"); // 150 лв. at the fixed 1.95583
    expect(d.text).toContain("10 контролни точки");
    expect(d.text).toContain("ЗДвП чл. 183, ал. 5, т. 1");
    // With the edition named — the debrief chip and the fault-card chip are the
    // same string, and it has to survive a student following it.
    expect(d.text).toContain("Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.), чл. 6, ал. 1, т. 20");
  });

  it("shows the rule and no number where nothing has been retrieved", () => {
    // The founder's standing ruling, asserted: an honest blank beats a guess.
    // The CODE is looked up rather than hard-coded — road penalties are being
    // retrieved incrementally, so naming one here would make this test go red
    // the day somebody grounds it, which is the opposite of what it guards.
    const blank = (Object.keys(VIOLATIONS) as ViolationCode[]).find(
      (c) => roadConsequenceFor(c).kind === "unknown",
    );
    if (blank === undefined) return; // every code grounded — nothing left to guard
    const d = buildDebrief(l0, resultWithEvents([makeViolation(blank, 6)]));
    expect(d.text).toContain("още не е извлечена дословно от закона");
    expect(d.text).not.toMatch(/\d+\s*€/);
    expect(d.text).not.toMatch(/\d+\s*лв\./);
  });

  it("mentions the collision termination explicitly — and cites BOTH provisions", () => {
    // The founder asked twice whether a points figure was real. The first time
    // the number was a money penalty wearing „т."; the second time (a ПТП, 10)
    // the number was right and the SENTENCE was bare — an exam „прекратен"
    // with no article behind it. The two halves of a collision come from two
    // different places in Наредба № 38 and the debrief now says which is which.
    const result = resultWithEvents([makeViolation("COLLISION", 3)]);
    const d = buildDebrief(l0, result);
    expect(d.text).toContain("прекратява");
    // The MARK — приложение № 5, т. 10, б. „в“, and it is ONE fault's price.
    expect(d.text).toContain("приложение № 5, т. 10, б. „в“");
    expect(d.text).toContain("ЕДНА опасна грешка");
    // The ENDING — a different article, quoted rather than asserted.
    expect(d.text).toContain("чл. 48, ал. 3");
    // And the scale, because „10" beside a driving simulator reads as the licence.
    expect(d.text).toContain("НЕ са контролни точки");
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
    expect(d.text).toContain("1 наказателна т. по изпитния лист срещу най-добрите ти 4");
  });

  it("notes a matched or worse score encouragingly, and skips it on first attempt", () => {
    const worse = buildDebrief(l0, resultWithEvents([makeViolation("RED_LIGHT_CROSSED", 5)]), {
      priorBestScore: 2,
    });
    expect(worse.text).toContain("остава 2 наказателни т. по изпитния лист");

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
