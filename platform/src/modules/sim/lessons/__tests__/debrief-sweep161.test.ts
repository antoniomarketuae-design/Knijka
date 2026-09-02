/**
 * THE DEBRIEF MUST NAME WHAT IT GRADED — sweep 161 (2026-08-17), in assertions.
 *
 * Three sentences below were photographed on staging before they were written,
 * each one a case where `lessons/debrief.ts` described a drive it had itself
 * scored differently. Frames and harness logs live under
 * `.audit-frames/sweep161/<scenario>/<platform>-<mode>/`; the scenario id is
 * named in every test so the row can be re-driven.
 *
 * EACH CASE IS A PAIR, like `debrief-truthfulness.test.ts` and for the same
 * reason: a check that only asserts the new sentence appears would also pass a
 * version that printed it unconditionally, and a false accusation is the same
 * crime as a false acquittal pointing the other way. So every case also drives
 * the run that must NOT get the new line.
 */
import { describe, expect, it } from "vitest";
import { makeViolation, VIOLATIONS, type ScorableEvent } from "../../rules";
import { buildDebrief } from "../debrief";
import { applyTick, buildLessonResult, createLessonSession, finishSession } from "../engine";
import { lessonById } from "../specs";
import type { LessonResult } from "../types";
import { makeTick } from "./fixtures";

const l0 = lessonById("l0-free-drive")!;
/** Two objectives, neither reachable from a single stationary tick. */
const l2 = lessonById("l2-intersections")!;

/** Free drive that "experienced" the given events, then folds. Route complete. */
function resultWithEvents(events: ScorableEvent[]): LessonResult {
  let s = createLessonSession(l0);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = { ...s, events: [...s.events, ...events] };
  return buildLessonResult(finishSession(s, 99));
}

/** A route lesson ended without driving it — every objective still open. */
function unfinishedResult(events: ScorableEvent[] = []): LessonResult {
  let s = createLessonSession(l2);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = { ...s, events: [...s.events, ...events] };
  return buildLessonResult(finishSession(s, 30));
}

describe("debrief — the unfinished route is not the only charge (sc-signal-flashing · mobile · right)", () => {
  /**
   * MEASURED: four collisions, 4 × опасна = 40 изпитни т., НЕИЗДЪРЖАН, one task
   * left open — and the whole verdict read «не е завършен — остана неизпълнена
   * задача от маршрута. Резултатът се брои, но за успешен урок мини целия
   * маршрут.» The official criteria lived inside the branch a run reaches only
   * when its route IS finished, so forty points and four dangerous errors were
   * never named and the advice given would not have passed the drive.
   * `sc-rx-guarded` · pc · wrong is the same shape at one опасна and 10 т.
   *
   * Fails on the old file, which printed neither clause.
   */
  it("names the опасна and the total when the sheet failed as well as the route", () => {
    const d = buildDebrief(l2, unfinishedResult([makeViolation("FAILED_TO_YIELD", 12)]));
    expect(d.text).toContain("не е завършен");
    expect(d.text).toContain("допусната е опасна грешка");
    expect(d.text).toContain("10 наказателни точки от изпитния лист (допустими 9)");
    expect(d.text).toContain("нямаше да е издържан и с изминат докрай маршрут");
  });

  /**
   * THE OTHER DIRECTION, and it is the whole reason the clause is gated on the
   * criteria rather than on `!passed`: an unfinished route with a spotless
   * sheet must keep the encouraging sentence it always had, and must NOT be
   * told it broke a rule it did not break.
   */
  it("leaves a clean-sheet unfinished run with the route sentence alone", () => {
    const d = buildDebrief(l2, unfinishedResult([]));
    expect(d.text).toContain("Резултатът се брои, но за успешен урок мини целия маршрут.");
    expect(d.text).not.toContain("маршрутът не е единствената причина");
    expect(d.text).not.toContain("нямаше да е издържан и с изминат докрай маршрут");
  });

  /**
   * The same direction one point in: a второстепенна is a real fault and still
   * inside the 9 the sheet allows, so the route remains the only thing that
   * failed this run. A version that fired on „any mistake" passes the test
   * above and fails here.
   */
  it("does not accuse a run whose only fault is under the allowed nine", () => {
    const d = buildDebrief(l2, unfinishedResult([makeViolation("HANDBRAKE_LEFT_ON", 12)]));
    expect(d.text).toContain("Резултатът се брои, но за успешен урок мини целия маршрут.");
    expect(d.text).not.toContain("нямаше да е издържан и с изминат докрай маршрут");
  });
});

describe("debrief — every task ticked and a red verdict (sc-zebra-approach · mobile · right)", () => {
  /**
   * MEASURED: the route sheet carried «✓ Приближи пътеката с готовност за
   * спиране 0:41» and «✓ Премини пътеката, след като е свободна 1:25», both
   * green, over a red НЕИЗДЪРЖАН — and no sentence anywhere said how the two go
   * together. `passed` is an AND; the verdict names the half that failed and
   * cannot name the half that held.
   *
   * The fixture drives l2's objectives to done by hand, which is what the frame
   * showed. Fails on the old file, which printed no such line.
   */
  it("says the route half was met when only the sheet failed", () => {
    const base = unfinishedResult([makeViolation("FAILED_TO_YIELD", 12)]);
    const done: LessonResult = {
      ...base,
      objectives: base.objectives.map((o) => ({ ...o, done: true })),
      completedAll: true,
    };
    const d = buildDebrief(l2, done);
    expect(d.text).toContain("не е издържан по официалните критерии");
    expect(d.text).toContain("Задачите от маршрута са изпълнени");
    expect(d.text).toContain("не пада заради маршрута, а заради изпитния лист");
  });

  /**
   * THE OTHER DIRECTION, twice. A PASSED run has no red verdict to reconcile,
   * and a lesson with NO tasks is only vacuously complete — crediting a free
   * drive for „completing the route" is a tick handed out for nothing, which is
   * the same crime as withholding one that was earned.
   */
  it("credits no route on a passed run, and none on a lesson with no tasks", () => {
    expect(buildDebrief(l0, resultWithEvents([])).text).not.toContain(
      "Задачите от маршрута са изпълнени",
    );
    const freeDriveFail = resultWithEvents([makeViolation("FAILED_TO_YIELD", 12)]);
    expect(freeDriveFail.objectives).toHaveLength(0);
    expect(freeDriveFail.passed).toBe(false);
    expect(buildDebrief(l0, freeDriveFail).text).not.toContain(
      "Задачите от маршрута са изпълнени",
    );
  });
});

describe("debrief — „ЕДНА опасна грешка: 10 изпитни т.“ against a bigger total (sc-pk-driveway · pc · right)", () => {
  /**
   * MEASURED: «Настъпи сблъсък. Това е ЕДНА опасна грешка: 10 изпитни т. …»
   * printed under a „20 наказателни точки" headline and above a row reading
   * „Опасни грешки (по 10 изпитни т.) 2 20". The ruled copy is right about the
   * collision and reads as the account of the total, where it says ten and the
   * total says twenty. The fixture is that frame: one опасна before the
   * collision closes the ledger, both scored.
   *
   * Fails on the old file, which printed the ruled paragraph and stopped.
   */
  it("reconciles the collision's ten with the drive's dangerous total", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([makeViolation("FAILED_TO_YIELD", 20), makeViolation("COLLISION", 66)]),
    );
    expect(d.text).toContain("Това е ЕДНА опасна грешка");
    expect(d.text).toContain("Опасните грешки в този урок обаче са 2, не една");
    expect(d.text).toContain("по 10 изпитни т. правят 20 изпитни т.");
  });

  /**
   * THE OTHER DIRECTION: when the collision IS the whole dangerous account the
   * sentence would only restate the number it has just given, so it stays off.
   */
  it("stays silent when the collision is the only опасна", () => {
    const d = buildDebrief(l0, resultWithEvents([makeViolation("COLLISION", 66)]));
    expect(d.text).toContain("Това е ЕДНА опасна грешка");
    expect(d.text).not.toContain("не една");
  });
});

describe("debrief — „Учебни моменти (не влизат в точките)“ may not list a scored fault", () => {
  /**
   * `lessons/engine.ts` pushes to `teachMoments` from BOTH arms of `coachStep`
   * — the teach arm, and a SCORED violation whenever S1 `pauseOnError` is on —
   * and `TeachMoment` carries no flag telling the two apart. So the moment the
   * channel is wired (see the report on `simulator/actions.ts`), a fault that
   * cost 10 изпитни т. would be filed under a heading saying it cost nothing,
   * two lines under the mistakes block that charges it.
   *
   * Fails on the old file, which listed whatever it was handed.
   */
  it("drops a coached code the exam sheet actually charged", () => {
    const d = buildDebrief(l0, resultWithEvents([makeViolation("SPEEDING_OVER_LIMIT", 30)]), {
      coachedMistakes: [{ code: "SPEEDING_OVER_LIMIT", titleBg: "Превишена скорост" }],
    });
    expect(d.text).toContain("Превишена скорост"); // as a charged mistake
    expect(d.text).not.toContain("Учебни моменти");
  });

  /**
   * THE OTHER DIRECTION, and the one the section exists for: the taught act
   * that never reached the ledger is still named, on a drive convicted of
   * something else entirely. A filter that dropped everything passes the test
   * above and fails here.
   */
  it("keeps a coached code the sheet never charged", () => {
    const d = buildDebrief(l0, resultWithEvents([makeViolation("HANDBRAKE_LEFT_ON", 12)]), {
      coachedMistakes: [{ code: "SPEEDING_OVER_LIMIT", titleBg: "Превишена скорост" }],
    });
    expect(d.text).toContain("Учебни моменти (не влизат в точките):");
    expect(d.text).toContain("• Превишена скорост");
  });
});

describe("debrief — the verdict names the опасна it failed for (sc-rx-guarded · pc · wrong)", () => {
  /**
   * MEASURED: everything above the fold read «Не всички задачи от маршрута бяха
   * изпълнени», «допусната е опасна грешка — директно неиздържан», «повече от 9
   * наказателни точки от изпитния лист» and a 1/0/0 table. «Нарушение на
   * правилата за жп прелез» was named once in the whole document, in the
   * mistakes block, two cards below the fold — so the student was shown a
   * verdict and a number with no offence attached to either.
   *
   * Fails on the old file, whose clause was the literal „допусната е опасна
   * грешка" and stopped there.
   */
  it("names the act in the criteria clause, not only in the mistakes block", () => {
    const d = buildDebrief(l2, unfinishedResult([makeViolation("FAILED_TO_YIELD", 12)]));
    // The title is read off the catalogue rather than retyped: this test's
    // subject is „the criteria clause NAMES the act", not which words the act
    // is named with — and the literal spelling went stale on 2026-09-02 when
    // `FAILED_TO_YIELD.titleBg` was shortened so the phone peek could finish
    // it (sc-merge-from-property:6715b581; the reasoning is on the row).
    expect(d.text).toContain(
      `допусната е опасна грешка: «${VIOLATIONS.FAILED_TO_YIELD.titleBg}»`,
    );
  });

  /**
   * THE ORDERING IS НАРЕДБА № 38's, NOT THE CLOCK'S. FAILED_TO_YIELD and
   * COLLISION are both опасни and both cost 10; only the second ends the exam
   * (чл. 48, ал. 3), so only the second may be called „най-тежката" — which is
   * `rules/gravest.ts`'s whole subject. A version that reached for
   * `mistakes[0]` passes the test above and fails here, because the yield fault
   * is the earlier event.
   */
  it("picks the gravest by the act's ranking when more than one опасна is on the sheet", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([makeViolation("FAILED_TO_YIELD", 20), makeViolation("COLLISION", 66)]),
    );
    expect(d.text).toContain(
      "допуснати са 2 опасни грешки, най-тежката «Пътнотранспортно произшествие»",
    );
    expect(d.text).not.toContain("допусната е опасна грешка:");
  });

  /**
   * THE OTHER DIRECTION, and the reason the clause is gated on `hasDangerous`
   * rather than on „!passed": a sheet that fails on POINTS has no опасна to
   * name, and a verdict that invents one is the same crime pointing the other
   * way. Four основни are 12 т. — over the nine т. 11 allows and over the six
   * it allows from основни — with nothing dangerous anywhere.
   */
  it("names no act, and no опасна, when the sheet failed on points alone", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([
        makeViolation("TURN_WITHOUT_INDICATOR", 10),
        makeViolation("TURN_WITHOUT_INDICATOR", 20),
        makeViolation("TURN_WITHOUT_INDICATOR", 30),
        makeViolation("TURN_WITHOUT_INDICATOR", 40),
      ]),
    );
    const verdict = d.text.split("\n")[0];
    expect(verdict).toContain("не е издържан по официалните критерии");
    expect(verdict).toContain("12 наказателни точки от изпитния лист (допустими 9)");
    expect(verdict).not.toContain("опасна");
  });
});

describe("debrief — the unit rides on EVERY number (sc-signal-flashing · mobile · right)", () => {
  /**
   * MEASURED, in the debrief printed under four collisions: «Най-добрият ти
   * резултат за този урок остава 0 наказателни т. по изпитния лист; този път
   * допусна повече (40).» A bare „(40)" one sentence before the paragraph that
   * exists to explain that these are NOT контролни точки — the founder's own
   * misreading, reproduced by the one function in the file whose figures did
   * not go through `pts`.
   *
   * Fails on the old file, which printed the naked integer.
   */
  it("puts the unit on the «допусна повече» figure", () => {
    const d = buildDebrief(l0, resultWithEvents([makeViolation("RED_LIGHT_CROSSED", 5)]), {
      priorBestScore: 2,
    });
    expect(d.text).toContain("този път допусна повече (10 наказателни т.)");
  });

  /**
   * The same hole in the sentence that goes the other way — „срещу най-добрите
   * ти 4 досега". Fails on the old file for the same reason.
   */
  it("puts the unit on the personal best it is compared against", () => {
    const d = buildDebrief(l0, resultWithEvents([makeViolation("HANDBRAKE_LEFT_ON", 5)]), {
      priorBestScore: 4,
    });
    expect(d.text).toContain("срещу най-добрите ти 4 наказателни т. досега");
  });

  /**
   * THE OTHER DIRECTION — the numbers must still be the drive's own, and the
   * three branches must still be three. A fix that unit-stamped the figures by
   * dropping them, or that collapsed „по-добре / изравнено / по-зле" into one
   * sentence, passes both tests above and fails here. The regex is the general
   * form of the defect: a parenthesised bare figure anywhere in the improvement
   * line, which is exactly what the frame showed.
   */
  it("keeps all three verdicts distinct and leaves no bare parenthesised figure", () => {
    const better = buildDebrief(l0, resultWithEvents([makeViolation("HANDBRAKE_LEFT_ON", 5)]), {
      priorBestScore: 4,
    }).text;
    const equal = buildDebrief(l0, resultWithEvents([makeViolation("RED_LIGHT_CROSSED", 5)]), {
      priorBestScore: 10,
    }).text;
    const worse = buildDebrief(l0, resultWithEvents([makeViolation("RED_LIGHT_CROSSED", 5)]), {
      priorBestScore: 2,
    }).text;

    expect(better).toContain("Личен напредък: 1 наказателна т. по изпитния лист");
    expect(equal).toContain("Изравни най-добрия си резултат за този урок (10 наказателни т.");
    expect(worse).toContain("остава 2 наказателни т. по изпитния лист");

    for (const [name, text] of [
      ["better", better],
      ["equal", equal],
      ["worse", worse],
    ] as const) {
      const line = text.split("\n").find((l) => /най-добри|личен напредък|изравни/i.test(l));
      expect(line, `${name}: no improvement line at all`).toBeDefined();
      expect(line, `${name}: bare parenthesised figure in „${line}“`).not.toMatch(
        /\(\d+(?:[.,]\d+)?\)/,
      );
    }
  });
});
