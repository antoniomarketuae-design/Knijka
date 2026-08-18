/**
 * THE DEBRIEF MAY NOT CONTRADICT ITSELF — the 2026-08-16 catalogue sweep, in
 * assertions.
 *
 * Every case below was photographed on staging before it was written, and every
 * one of them is a sentence THIS file's subject printed about a drive it had
 * already described differently two lines earlier. The frames and the harness
 * logs live under `sweep161/<scenario>/<platform>-<mode>/`; the scenario id is
 * named in each test so the row can be re-driven.
 *
 * EACH TEST IS A PAIR, deliberately. A debrief check that only asserts the new
 * sentence appears would also pass a version that printed it unconditionally —
 * a false conviction and a false acquittal are the same crime pointing opposite
 * ways — so every case also asserts the OTHER direction: the drive that must
 * NOT get the new line still does not.
 */
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
/** Two objectives, neither reachable from a single stationary tick. */
const l2 = lessonById("l2-intersections")!;

/** Free drive that "experienced" the given events, then folds. */
function resultWithEvents(events: ScorableEvent[], opts: { aborted?: boolean } = {}): LessonResult {
  let s = createLessonSession(l0);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = { ...s, events: [...s.events, ...events] };
  s = opts.aborted ? abortSession(s, 99) : finishSession(s, 99);
  return buildLessonResult(s);
}

/** A route lesson ended without driving it — every objective still open. */
function unfinishedResult(events: ScorableEvent[] = []): LessonResult {
  let s = createLessonSession(l2);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = { ...s, events: [...s.events, ...events] };
  return buildLessonResult(finishSession(s, 30));
}

describe("debrief — gravity outranks praise (sc-signal-flashing · mobile · right)", () => {
  /**
   * MEASURED: that drive collided four times (4 × опасна = 40 изпитни т.,
   * НЕИЗДЪРЖАН) and the debrief opened «Какво се получи добре: • Правилно
   * отстъпено предимство» ABOVE «Най-важните грешки…». Fails on the old file,
   * which printed the two blocks in a fixed order.
   */
  it("prints the mistakes above the praise when a dangerous error was convicted", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([
        makeCommendation("YIELDED_TO_PRIORITY", 83),
        makeViolation("COLLISION", 66), // опасна, 10 т.
      ]),
    );
    const praise = d.text.indexOf("Какво се получи добре:");
    const faults = d.text.indexOf("Най-важните грешки");
    expect(praise).toBeGreaterThan(-1);
    expect(faults).toBeGreaterThan(-1);
    expect(faults).toBeLessThan(praise);
  });

  /**
   * THE OTHER DIRECTION, and it is the reason the rule is `hasDangerous` and
   * not „any mistake": a one-point slip is still met with what went right
   * first. A version that simply flipped the order would fail here.
   */
  it("keeps praise first when nothing dangerous was convicted", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([
        makeCommendation("YIELDED_TO_PRIORITY", 83),
        makeViolation("HANDBRAKE_LEFT_ON", 66), // второстепенна, 1 т.
      ]),
    );
    const praise = d.text.indexOf("Какво се получи добре:");
    const faults = d.text.indexOf("Най-важните грешки");
    expect(praise).toBeGreaterThan(-1);
    expect(praise).toBeLessThan(faults);
  });
});

describe("debrief — a commendation the same drive convicts", () => {
  /**
   * Both events carry `c-priority-concept` (rules/catalog.ts), so the drive
   * says „well done for giving way" and „you failed to give way" about the same
   * skill. The old file printed the commendation bare.
   */
  it("riders a commendation whose skill is also among the convicted faults", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([
        makeCommendation("YIELDED_TO_PRIORITY", 20), // c-priority-concept
        makeViolation("FAILED_TO_YIELD", 66), // c-priority-concept
      ]),
    );
    expect(d.text).toContain("Правилно отстъпено предимство — но не всеки път");
    expect(d.text).toContain("когато го правиш ВСЕКИ път");
  });

  it("leaves an uncontradicted commendation alone", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([
        makeCommendation("YIELDED_TO_PRIORITY", 20), // c-priority-concept
        makeViolation("HANDBRAKE_LEFT_ON", 66), // c-vehicle-controls — a different skill
      ]),
    );
    expect(d.text).toContain("• Правилно отстъпено предимство");
    expect(d.text).not.toContain("но не всеки път");
  });

  /**
   * CLEAN_DRIVING has no conceptId on purpose — it is awarded for a measured
   * violation-free STRETCH, which a fault elsewhere does not retract. Guards
   * against „contradicted" degenerating into „any praise beside any fault".
   */
  it("never riders CLEAN_DRIVING, which is scoped to a stretch and not a skill", () => {
    const d = buildDebrief(
      l0,
      resultWithEvents([makeCommendation("CLEAN_DRIVING", 20), makeViolation("FAILED_TO_YIELD", 66)]),
    );
    expect(d.text).toContain("• Чисто и спокойно каране");
    expect(d.text).not.toContain("но не всеки път");
  });
});

describe("debrief — „карането беше чисто“ over a convicted fault (sc-follow-* / sc-ov-keep-right)", () => {
  /**
   * THE HOLE, AND IT IS NOT THEORETICAL. `summary.conceptIds` comes from the
   * mistakes' `conceptId`, and FOLLOWING_TOO_CLOSE / NOT_KEEPING_RIGHT /
   * POOR_LANE_KEEPING carry none — so a drive convicted of exactly those (i.e.
   * the tailgating and keep-right lessons themselves) fell through to the
   * „карането беше чисто" tail. The old file told a convicted tailgater his
   * driving had been clean; this fails on it.
   */
  it("does not call a drive clean when it convicted a concept-less fault", () => {
    const d = buildDebrief(l2, unfinishedResult([makeViolation("FOLLOWING_TOO_CLOSE", 12)]));
    expect(d.text).not.toContain("карането беше чисто");
    expect(d.text).toContain("Какво да упражниш: започни от «Несъобразена дистанция»");
    expect(d.text).toContain("най-тежката ти грешка в този урок");
  });

  it("still says the drive was clean when the sheet really is empty", () => {
    const d = buildDebrief(l2, unfinishedResult([]));
    expect(d.text).toContain("Какво да упражниш: повтори урока и завърши всички задачи");
    expect(d.text).toContain("карането беше чисто по изпитния лист");
  });
});

describe("debrief — teach moments the score is silent about (sc-signal-flashing · mobile · wrong)", () => {
  /**
   * That drive was shown «Превишена скорост» at t = 12 s over a cluster reading
   * 59 км/ч against a 50 badge — a TEACH card, so it never reached
   * `summary.mistakes` — and the debrief then said «чисто каране без нито едно
   * нарушение — задръж това ниво» and «карането беше чисто».
   */
  it("refuses the spotless claim and names the taught act when the channel is supplied", () => {
    const coached = [{ code: "SPEEDING_OVER_LIMIT", titleBg: "Превишена скорост" }];
    const d = buildDebrief(l2, unfinishedResult([]), { coachedMistakes: coached });
    expect(d.text).not.toContain("без нито едно нарушение");
    expect(d.text).not.toContain("задръж това ниво");
    expect(d.text).toContain("Учебни моменти (не влизат в точките):");
    expect(d.text).toContain("• Превишена скорост");
    expect(d.text).toContain("При повторение вече влиза в изпитния лист");
  });

  /**
   * THE OTHER DIRECTION. With no teach moment the praise is unchanged — the
   * channel must not be a blanket suppressor of every clean-drive line.
   */
  it("keeps the clean-drive praise when no teach moment was recorded", () => {
    const d = buildDebrief(l2, unfinishedResult([]), { coachedMistakes: [] });
    expect(d.text).toContain("чисто каране");
    expect(d.text).toContain("задръж това ниво");
    expect(d.text).not.toContain("Учебни моменти");
  });

  /**
   * AND THE CLAIM IS SCOPED EVEN WITH NOTHING SUPPLIED. The old sentence spoke
   * for the whole drive on the evidence of the scored half; it now says which
   * ledger it read. Fails on the old file, whose sentence ended at „нарушение".
   */
  it("scopes the spotless claim to the exam sheet it actually read", () => {
    const d = buildDebrief(l0, resultWithEvents([]));
    expect(d.text).toContain("без нито едно нарушение по изпитния лист");
  });
});

describe("debrief — failed with a spotless sheet (sc-follow-brake, sc-merge-bus-pullout, …)", () => {
  /**
   * `passed` is the AND of the point rule, every task done, and not aborted, so
   * a run reaches НЕИЗДЪРЖАН with «Опасни 0 · Основни 0 · Второстепенни 0 ·
   * Общо (допустими 9) 0». The badge cannot say why; the prose beside it said
   * nothing either. Fails on the old file, which printed no such line.
   */
  it("says the sheet is clean and names what the red verdict is actually for", () => {
    const d = buildDebrief(l2, unfinishedResult([]));
    expect(d.text).toContain("нямаш нито една наказателна точка (0 при допустими 9)");
    expect(d.text).toContain("оценката е за незавършения маршрут, не за карането");
  });

  it("names the interruption instead when the lesson was aborted", () => {
    const d = buildDebrief(l0, resultWithEvents([], { aborted: true }));
    expect(d.text).toContain("оценката е за прекъснатия урок, не за карането");
  });

  /**
   * THE OTHER DIRECTION, twice: a PASSED run has no red verdict to explain, and
   * a run that actually lost points is not told its sheet is clean.
   */
  it("stays silent on a passed run and on a run that really lost points", () => {
    expect(buildDebrief(l0, resultWithEvents([])).text).not.toContain(
      "нямаш нито една наказателна точка",
    );
    expect(
      buildDebrief(l2, unfinishedResult([makeViolation("HANDBRAKE_LEFT_ON", 12)])).text,
    ).not.toContain("нямаш нито една наказателна точка");
  });
});

describe("debrief — the unfinished task has a name (sc-ov-keep-right)", () => {
  /**
   * The verdict ended at „остана неизпълнена задача от маршрута" while the
   * route sheet on the same screen listed the open row by title. Fails on the
   * old file, which never read `result.objectives`.
   */
  it("quotes the objectives that were left open", () => {
    const result = unfinishedResult([]);
    const open = result.objectives.filter((o) => !o.done);
    expect(open.length).toBeGreaterThan(0);
    const d = buildDebrief(l2, result);
    expect(d.text).toContain(`«${open[0].titleBg}»`);
    expect(d.text).toContain("не е завършен");
  });

  /**
   * THE OTHER DIRECTION: a drive that finished its route is never handed a
   * list of "open" tasks — the phrase belongs to the unfinished branch alone.
   */
  it("names no task when the route was completed", () => {
    const d = buildDebrief(l0, resultWithEvents([makeViolation("RED_LIGHT_CROSSED", 5)]));
    expect(d.text).not.toContain("остана неизпълнена");
    expect(d.text).not.toContain("останаха неизпълнени");
  });
});
