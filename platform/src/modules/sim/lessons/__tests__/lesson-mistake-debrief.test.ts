/**
 * T7 — THE DEBRIEF OF A LESSON THE PRODUCT REFUSED (ADR-009, doc 92 §5.6).
 *
 * ADR-009 (founder Ruling A, 2026-09-17) adds a FOURTH outcome to a file that
 * was exhaustive about three: a practice lesson whose own mistake was committed
 * is not taken, even the first time, and the изпитен лист takes no points for
 * it. This suite is the pair of that ruling — every new sentence under its own
 * guard, and every OLD sentence still byte-identical on a drive with no hit.
 *
 * WHAT WAS MEASURED BEFORE IT WAS WRITTEN, over all 2,434 authored tape×rung
 * drives on this tree through `tools/audit/inprocess-drive.mjs`'s chain
 * (`createLessonSession` → `applyTick` → `buildLessonResult` → `buildDebrief`,
 * i.e. what `app/(dashboard)/simulator/actions.ts` runs):
 *
 *   654 hit drives, and of them
 *   381  printed «Какво се получи добре: чисто каране по изпитния лист — нито
 *        едно нарушение не влезе в точките.» — praise, on a drive the product
 *        had just refused for the act the lesson exists to teach;
 *   133  printed «не е издържан по официалните критерии: .» — the criteria
 *        headline with an EMPTY list, a colon and a full stop as the reason;
 *   519  printed «По изпитния лист нямаш нито една наказателна точка (0 при
 *        допустими 9) — оценката е за незавършения маршрут…», which denies the
 *        driving on the one verdict the driving caused (re-measured 2026-09-18:
 *        all 519 took that block's RESERVATIONS arm — a hit drive always has a
 *        coached teach moment, so the shorter «…, не за карането» form printed
 *        on none of them, and 124 of the 519 had finished the route the
 *        sentence blamed);
 *   531  returned an EMPTY `conceptIds`, so the theory offered after a
 *        not-taken lesson was about anything but the reason it was not taken.
 *
 * All four are 0 after this change, and 0 of the 1,780 hit-free drives changed
 * by a single byte. The counts are in the lane report; this file is what stops
 * them coming back.
 *
 * EACH TEST IS A PAIR, the discipline this directory's `debrief-truthfulness.
 * test.ts` states: a check that only asserts the new sentence appears would
 * also pass a version printing it unconditionally.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SEVERITY_POINTS,
  VIOLATIONS,
  makeCommendation,
  makeViolation,
  pointsLabelBg,
  type ScorableEvent,
} from "../../rules";
import { recordScVuPassDrive } from "../../traces/scVuPass";
import { buildDebrief, commendationRiderBg, commendationRiderFlags } from "../debrief";
import {
  abortSession,
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
} from "../engine";
import { compileScenario } from "../scenario/compile";
import { scenarioById } from "../scenario/templates";
import type { CoachedMistake, LessonResult } from "../types";
import { makeTick } from "./fixtures";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function district(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

/** One compiled rung — the only lesson shape that carries `lessonMistakeTargets`. */
function lessonAt(id: string, level: 1 | 2 | 3 | 4 | 5) {
  const spec = scenarioById(id);
  if (spec === undefined) throw new Error(`no scenario template "${id}"`);
  return compileScenario(spec, level);
}

/**
 * A SESSION THAT EXPERIENCED THE GIVEN RECORDS, folded by the real engine.
 *
 * One static tick (nothing is raised by it — asserted below) then the records
 * are placed on the state exactly where `applyTick` would have put them, and
 * `buildLessonResult` folds the verdict through `lessonMistake.ts
 * foldLessonMistakes`. So the `lessonMistakes` this suite renders are the
 * ENGINE's, not a literal typed into a test: a fold that stopped running would
 * take most of this file red.
 *
 * `coached` is the withheld half (a target's first occurrence is always taught
 * and always free) and `events` is the изпитен лист. A repeat is BOTH.
 */
function drive(
  lesson: ReturnType<typeof lessonAt>,
  opts: { events?: ScorableEvent[]; coached?: CoachedMistake[]; aborted?: boolean } = {},
): LessonResult {
  let s = createLessonSession(lesson);
  s = applyTick(s, makeTick({ t: 1 })).state;
  s = {
    ...s,
    events: [...s.events, ...(opts.events ?? [])],
    coachedMistakes: [...(s.coachedMistakes ?? []), ...(opts.coached ?? [])],
  };
  s = opts.aborted ? abortSession(s, 99) : finishSession(s, 99);
  return buildLessonResult(s);
}

/**
 * THE SAME REAL RESULT WITH ITS ROUTE HALF TICKED.
 *
 * A scenario's objectives need the manoeuvre driven, and 133 of the measured
 * hit drives are exactly «route complete, sheet clean, lesson refused» — the
 * shape that printed «критерии: .». `recordScVuPassDrive` below reaches it for
 * real on one lesson; for the others the ROUTE half alone is overridden on an
 * otherwise untouched engine result, because `buildDebrief`'s contract is
 * `(lesson, result, context)` and the two halves of `passed` are independent
 * inputs to it. Summary, score, escalations and `lessonMistakes` stay the
 * engine's own.
 */
function withRouteDone(result: LessonResult): LessonResult {
  return {
    ...result,
    completedAll: true,
    objectives: result.objectives.map((o) => ({ ...o, done: true })),
  };
}

const CYCLIST_SQUEEZE: CoachedMistake = {
  code: "VULNERABLE_PASS_TOO_CLOSE",
  titleBg: VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg,
  t: 20.9,
  detail: "vulnerable-pass",
};

// ---------------------------------------------------------------------------
// 0. The live wiring: the engine folds it, this file reads it
// ---------------------------------------------------------------------------

describe("ADR-009 · the debrief reads the verdict the ENGINE folded", () => {
  /**
   * The spec's own worked example (doc 92 §5.3, §10 row 1), driven through the
   * production chain: the committed `mistake-squeeze` tape against the real
   * vu-pass-v1 document, every tick through `applyTick`, then
   * `buildLessonResult` and `buildDebrief` — the same four calls
   * `app/(dashboard)/simulator/actions.ts` and `LessonPlayShell.tsx` make.
   *
   * It is the 133-drive shape: the route is completed, the изпитен лист is
   * empty, and the lesson is refused for the pass at half a metre.
   */
  const squeeze = (() => {
    const lesson = lessonAt("sc-vu-pass-clearance", 3);
    let session = createLessonSession(lesson);
    recordScVuPassDrive(district("vu-pass-v1"), "mistake-squeeze", {
      onTick: (tick) => {
        session = applyTick(session, tick).state;
      },
    });
    const result = buildLessonResult(session);
    return { lesson, result, out: buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }) };
  })();

  it("the driven tape really reaches the refused-but-clean state", () => {
    expect(squeeze.result.lessonMistakes?.map((h) => h.code)).toEqual([
      "VULNERABLE_PASS_TOO_CLOSE",
    ]);
    expect(squeeze.result.lessonMistakes?.[0]?.charged).toBe(false);
    expect(squeeze.result.summary.passed).toBe(true);
    expect(squeeze.result.summary.score.totalPoints).toBe(0);
    expect(squeeze.result.completedAll).toBe(true);
    expect(squeeze.result.aborted).toBe(false);
    expect(squeeze.result.passed).toBe(false);
  });

  it("…and the debrief names it, refuses the lesson and prices nothing", () => {
    const t = squeeze.out.text;
    expect(t).toContain("“ не е взет: допусна „Тясно изпреварване на велосипедист“");
    expect(t).toContain("0 наказателни точки при допустими 9");
    expect(t).toContain("упражнение се зачита само когато собствената му грешка не се случи нито веднъж");
    // The two sentences the old file printed on this very drive.
    expect(t).not.toContain("по официалните критерии: .");
    expect(t).not.toContain("оценката е за незавършения маршрут");
  });

  /** The other direction, on the same lesson and the same recorder. */
  const shadow = (() => {
    const lesson = lessonAt("sc-vu-pass-clearance", 3);
    let session = createLessonSession(lesson);
    recordScVuPassDrive(district("vu-pass-v1"), "shadow-correct", {
      onTick: (tick) => {
        session = applyTick(session, tick).state;
      },
    });
    const result = buildLessonResult(session);
    return { lesson, result, out: buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }) };
  })();

  it("the correct drive of the SAME lesson carries no hit and none of the new copy", () => {
    expect(shadow.result.lessonMistakes).toBeUndefined();
    expect(shadow.result.passed).toBe(true);
    const t = shadow.out.text;
    expect(t).toContain("е издържан");
    for (const marker of [
      "не е взет",
      "Отделно от изпитния лист",
      "Грешката на този урок",
      "Грешките на този урок",
      "При повторение вече влиза и в изпитния лист.",
      "повтори урока и този път без",
    ]) {
      expect(t, marker).not.toContain(marker);
    }
  });
});

// ---------------------------------------------------------------------------
// 1. The headline (§5.6.1) and the failed-sheet sentence (§5.6.2)
// ---------------------------------------------------------------------------

describe("ADR-009 · the headline", () => {
  const lesson = lessonAt("sc-vu-pass-clearance", 3);

  it("a clean sheet and a finished route read «не е взет», with the rule stated", () => {
    const out = buildDebrief(
      lesson,
      withRouteDone(drive(lesson, { coached: [CYCLIST_SQUEEZE] })),
      {},
    );
    const head = out.text.split("\n")[0];
    expect(head).toContain("не е взет: допусна „Тясно изпреварване на велосипедист“");
    expect(head).toContain("точно грешката, която този урок учи");
    expect(head).toContain("По изпитния лист карането е в допустимото (0 наказателни точки при допустими 9)");
    expect(head).toContain("и там нищо не се променя");
    // No route clause when there is no open task — the phrase belongs to the
    // unfinished arm alone.
    expect(head).not.toContain("Маршрутът:");
  });

  it("an unfinished route keeps its open tasks, as a second fact and not as the reason", () => {
    const result = drive(lesson, { coached: [CYCLIST_SQUEEZE] });
    expect(result.completedAll).toBe(false);
    const t = buildDebrief(lesson, result, {}).text;
    expect(t).toContain("не е взет: допусна");
    expect(t).toContain("Маршрутът: останаха неизпълнени задачите");
    expect(t).toContain("«Прибери се в лентата и продължи по улицата»");
    // The old headline claimed the ROUTE was the verdict's cause.
    expect(t).not.toContain("не е завършен — останаха");
    expect(t).not.toContain("за успешен урок мини целия маршрут");
  });

  it("two hits agree in the plural, and the names come from the catalogue", () => {
    const twoHitLesson = lessonAt("sc-vu-cyclist-group", 3);
    const out = buildDebrief(
      twoHitLesson,
      drive(twoHitLesson, {
        coached: [
          { code: "FOLLOWING_TOO_CLOSE", titleBg: VIOLATIONS.FOLLOWING_TOO_CLOSE.titleBg, t: 8 },
          { ...CYCLIST_SQUEEZE, t: 14 },
        ],
      }),
      {},
    );
    expect(out.text).toContain(
      `допусна „${VIOLATIONS.FOLLOWING_TOO_CLOSE.titleBg}“ и „${VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg}“`,
    );
    expect(out.text).toContain("точно грешките, които този урок учи");
    expect(out.text).toContain("Грешките на този урок (при първа поява");
  });

  it("a FAILED sheet keeps Наредба № 38's verdict and gains the lesson's own", () => {
    const result = drive(lesson, {
      coached: [CYCLIST_SQUEEZE],
      events: [makeViolation("COLLISION", 30, { detail: "vehicle" })],
    });
    expect(result.summary.passed).toBe(false);
    const t = buildDebrief(lesson, result, {}).text;
    // Untouched: the sheet really did fail, and the criteria are named.
    expect(t).toContain("допусната е опасна грешка");
    expect(t).not.toContain("не е взет: допусна");
    // …and the second verdict, which the criteria sentence cannot state.
    expect(t).toContain(
      "Отделно от изпитния лист: „Тясно изпреварване на велосипедист“ е грешката, която този урок учи — и сама по себе си тя не позволява урокът да се зачете.",
    );
  });

  it("…and a failed sheet with NO hit says nothing about a lesson rule", () => {
    const t = buildDebrief(
      lesson,
      drive(lesson, { events: [makeViolation("COLLISION", 30, { detail: "vehicle" })] }),
      {},
    ).text;
    expect(t).toContain("допусната е опасна грешка");
    expect(t).not.toContain("Отделно от изпитния лист");
  });

  /**
   * The abort arm, doc 92 §5.6.3 (critic gap 9). NOT reachable from any
   * authored tape — the lane-D census found 654 hit drives and zero aborted,
   * because a tape drives to its end or runs out and never presses „Прекрати
   * урока" — so this is the only place it is exercised.
   */
  it("an interrupted run with a hit is not told the route was the problem", () => {
    const t = buildDebrief(
      lesson,
      drive(lesson, { coached: [CYCLIST_SQUEEZE], aborted: true }),
      {},
    ).text;
    expect(t).toContain("Прекъсна урока");
    expect(t).toContain("Урокът и без прекъсването нямаше да се зачете: допусна");
    expect(t).toContain("този път без нея");
    expect(t).not.toContain("Нищо страшно — запазихме наблюденията дотук");
  });

  it("…and an interrupted run WITHOUT a hit is still met with «Нищо страшно»", () => {
    const t = buildDebrief(lesson, drive(lesson, { aborted: true }), {}).text;
    expect(t).toContain("Нищо страшно — запазихме наблюденията дотук, а маршрутът те чака отново.");
    expect(t).not.toContain("Урокът и без прекъсването");
  });

  it("an interrupted run with a hit AND a broken sheet says both", () => {
    const t = buildDebrief(
      lesson,
      drive(lesson, {
        coached: [CYCLIST_SQUEEZE],
        aborted: true,
        events: [makeViolation("COLLISION", 30, { detail: "vehicle" })],
      }),
      {},
    ).text;
    expect(t).toContain("прекъсването не изтрива изпитния лист");
    expect(t).toContain("Отделно от изпитния лист:");
  });
});

// ---------------------------------------------------------------------------
// 2. The praise that had to stop (§5.6.6) and the route credit (§5.6.5)
// ---------------------------------------------------------------------------

describe("ADR-009 · the debrief stops congratulating a drive it just refused", () => {
  const lesson = lessonAt("sc-vu-pass-clearance", 3);
  const PRAISE = "чисто каране по изпитния лист — нито едно нарушение не влезе в точките";

  it("the sheet-scoped praise is withheld on a hit drive (381 → 0)", () => {
    const t = buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE] }), {}).text;
    expect(t).not.toContain(PRAISE);
    expect(t).not.toContain("Какво се получи добре: чисто каране");
    expect(t).not.toContain("задръж това ниво");
  });

  it("…and the SAME lesson with the same coached row demoted to an incidental code keeps it", () => {
    // HARSH_BRAKING_NO_CAUSE is not a target of this lesson, so the drive is
    // not refused and the praise is exactly today's sentence. This is the pair:
    // the withholding must key on the HIT, never on „any coached row".
    const result = drive(lesson, {
      coached: [{ code: "HARSH_BRAKING_NO_CAUSE", titleBg: VIOLATIONS.HARSH_BRAKING_NO_CAUSE.titleBg, t: 12 }],
    });
    expect(result.lessonMistakes).toBeUndefined();
    expect(buildDebrief(lesson, result, {}).text).toContain(PRAISE);
  });

  it("the route credit names the real cause when the sheet is clean", () => {
    const t = buildDebrief(
      lesson,
      withRouteDone(drive(lesson, { coached: [CYCLIST_SQUEEZE] })),
      {},
    ).text;
    expect(t).toContain(
      "Задачите от маршрута са изпълнени — този урок не пада заради маршрута, а заради грешката, която учи (по-горе).",
    );
    expect(t).not.toContain("а заради изпитния лист по-горе");
  });

  it("…and still names the sheet when the sheet is what fell", () => {
    const t = buildDebrief(
      lesson,
      withRouteDone(
        drive(lesson, {
          coached: [CYCLIST_SQUEEZE],
          events: [makeViolation("COLLISION", 30, { detail: "vehicle" })],
        }),
      ),
      {},
    ).text;
    expect(t).toContain("а заради изпитния лист по-горе");
    expect(t).not.toContain("а заради грешката, която учи (по-горе)");
  });

  it("the «чист лист» explanation is withheld, not reworded, on a hit drive", () => {
    const t = buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE] }), {}).text;
    expect(t).not.toContain("нямаш нито една наказателна точка (0 при допустими 9)");
    expect(t).not.toContain("не за карането");
  });

  it("…and a hit-free unfinished drive still gets it word for word", () => {
    const t = buildDebrief(lesson, drive(lesson), {}).text;
    expect(t).toContain(
      "По изпитния лист нямаш нито една наказателна точка (0 при допустими 9) — оценката е за незавършения маршрут, не за карането.",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. The reason, retrieved (§5.6.8) — THEO-4 and ADR-002
// ---------------------------------------------------------------------------

describe("ADR-009 · «Грешката на този урок» explains itself from the catalogue", () => {
  const lesson = lessonAt("sc-vu-pass-clearance", 3);

  it("prints the act, why it matters, the correct action and the article", () => {
    const t = buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE] }), {}).text;
    // Every string is compared to what the CATALOGUE holds, not to a literal:
    // a test quoting the sentence would pass on a file that authored its own.
    const event = makeViolation("VULNERABLE_PASS_TOO_CLOSE", 20.9, { detail: "vulnerable-pass" });
    expect(t).toContain(
      "Грешката на този урок (при първа поява не влиза в наказателните точки, но урокът не се зачита):",
    );
    expect(t).toContain(`• ${event.titleBg}`);
    expect(t).toContain(`  → Защо: ${event.explanationBg}`);
    expect(t).toContain(
      `  → Правилното действие: ${VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.correctiveBg}`,
    );
    expect(t).toContain(`  → Правило: ${event.lawRef}`);
    expect(t).toContain("При повторение вече влиза и в изпитния лист.");
  });

  it("…and never under a heading that prices it at nothing", () => {
    const t = buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE] }), {}).text;
    expect(t).not.toContain("Учебни моменти (не влизат в точките)");
    expect(t).not.toContain("Първата среща не се наказва");
  });

  it("an INCIDENTAL coached row keeps «Учебни моменти» with its text unchanged", () => {
    const result = drive(lesson, {
      coached: [
        CYCLIST_SQUEEZE,
        { code: "HARSH_BRAKING_NO_CAUSE", titleBg: VIOLATIONS.HARSH_BRAKING_NO_CAUSE.titleBg, t: 30 },
      ],
    });
    // The incidental half of the section comes from the CONTEXT channel, which
    // is what both live callers supply off the result.
    const t = buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text;
    expect(t).toContain("Грешката на този урок (при първа поява");
    expect(t).toContain("Учебни моменти (не влизат в точките):");
    expect(t).toContain(`• ${VIOLATIONS.HARSH_BRAKING_NO_CAUSE.titleBg}`);
    expect(t).toContain(
      "Първата среща не се наказва — точно затова я показахме. При повторение вече влиза в изпитния лист, така че не я подминавай.",
    );
    // The hit is in its own block and is NOT repeated under the other heading.
    // Scoped to that section alone — the practice line at the foot of the card
    // names the act again on purpose.
    const teachAt = t.indexOf("Учебни моменти (не влизат в точките):");
    const teachEnd = t.indexOf("Първата среща не се наказва", teachAt);
    expect(teachAt).toBeGreaterThan(-1);
    expect(teachEnd).toBeGreaterThan(teachAt);
    expect(t.slice(teachAt, teachEnd)).not.toContain(
      VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg,
    );
    // …and the hit's own block really is above it.
    expect(t.indexOf("Грешката на този урок (при първа поява")).toBeLessThan(teachAt);
  });

  /**
   * THE ACT, NOT THE POOL. `ILLEGAL_STOP_IN_BAN_ZONE` grades five different
   * acts and the catalogue authors copy for each (`rules/catalog.ts
   * PER_ACT_COPY`); the fold stamps the act-aware title and
   * `lessonMistakeCopy` retrieves the act's explanation. A block that read the
   * pooled row would tell a student who parked alongside a parked car about a
   * bus stop.
   */
  it("uses the ACT's own catalogue copy when the code grades more than one", () => {
    const banLesson = lessonAt("sc-pk-busstop-ban", 3);
    const result = drive(banLesson, {
      coached: [
        {
          code: "ILLEGAL_STOP_IN_BAN_ZONE",
          titleBg: VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.titleBg,
          t: 18,
          detail: "law-alongside",
        },
      ],
    });
    const act = makeViolation("ILLEGAL_STOP_IN_BAN_ZONE", 18, { detail: "law-alongside" });
    expect(act.titleBg).not.toBe(VIOLATIONS.ILLEGAL_STOP_IN_BAN_ZONE.titleBg);
    const t = buildDebrief(banLesson, result, {}).text;
    expect(t).toContain(`• ${act.titleBg}`);
    expect(t).toContain(`  → Защо: ${act.explanationBg}`);
    expect(t).toContain(`не е взет: допусна „${act.titleBg}“`);
  });

  /**
   * THE BLOCK IS NOT HOSTAGE TO AN OPTIONAL FIELD.
   *
   * `DebriefContext.coachedMistakes` is optional, and its own header records
   * that it «existed, was documented, was filtered, was tested — and NO live
   * caller fed it» for a whole wave. A reason block keyed on it would print
   * «не е взет» with nothing under it the day a caller forgot, which is the
   * bare verdict THEO-4 calls a defect. The hits are on the RESULT.
   */
  it("still explains itself when the caller supplies no coached channel at all", () => {
    const result = drive(lesson, { coached: [CYCLIST_SQUEEZE] });
    const withChannel = buildDebrief(lesson, result, {
      coachedMistakes: result.coachedMistakes,
    }).text;
    const without = buildDebrief(lesson, result, {}).text;
    expect(without).toContain("Грешката на този урок (при първа поява");
    expect(without).toContain(`  → Правило: ${VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.lawRef}`);
    // With only the hit and no incidental row, the two are the same text.
    expect(without).toBe(withChannel);
  });

  /**
   * A stored drive can name a code a later catalogue no longer carries. The
   * row degrades to its title rather than to a blank bullet — a bare verdict
   * with nothing to learn from is the one thing THEO-4 forbids — and nothing
   * throws.
   */
  it("an uncatalogued code degrades to its bare title and never to a blank bullet", () => {
    const t = buildDebrief(
      lessonAt("sc-vu-pass-clearance", 3),
      {
        ...drive(lessonAt("sc-vu-pass-clearance", 3), { coached: [CYCLIST_SQUEEZE] }),
        lessonMistakes: [
          { code: "A_CODE_FROM_THE_FUTURE", t: 5, charged: false, titleBg: "Непозната грешка" },
        ],
      },
      {},
    ).text;
    expect(t).toContain("• Непозната грешка");
    expect(t).not.toContain("• \n");
    expect(t).toContain("повтори урока и този път без „Непозната грешка“.");
  });
});

// ---------------------------------------------------------------------------
// 4. A repeat is graded as today (founder answer F1)
// ---------------------------------------------------------------------------

describe("ADR-009 · a repeat keeps its points", () => {
  const lesson = lessonAt("sc-vu-pass-clearance", 3);
  /** Taught at 20.9 s, committed again at 40 s — the second one is charged. */
  const result = drive(lesson, {
    coached: [CYCLIST_SQUEEZE],
    events: [makeViolation("VULNERABLE_PASS_TOO_CLOSE", 40, { detail: "vulnerable-pass" })],
  });

  it("the fold records the repeat as charged", () => {
    expect(result.lessonMistakes?.[0]?.charged).toBe(true);
    expect(result.summary.score.totalPoints).toBeGreaterThan(0);
  });

  it("…and the debrief still prices it, on the sheet, where it was charged", () => {
    const t = buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text;
    expect(t).toContain("Най-важните грешки");
    // The priced row, with the scale named and the article cited — the mistakes
    // block's own rendering, unchanged by this ADR.
    expect(t).toContain(
      `• ${VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg} — основна, ` +
        `${pointsLabelBg(SEVERITY_POINTS.osnovna, "наказателна", "наказателни")} по изпитния лист`,
    );
    expect(t).toContain(VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.lawRef);
    // The lesson verdict is still stated, and the free-first heading is not.
    expect(t).toContain("не е взет: допусна");
    expect(t).not.toContain("Грешката на този урок (при първа поява");
  });

  /**
   * WHAT A CHARGED HIT LOSES TO THE DISPLAY CAP, AND WHAT CARRIES IT INSTEAD.
   *
   * `MAX_MISTAKE_LINES` is 4 and an основна hit sorts behind four опасни, so on
   * a five-fault drive the charged hit's row is cut — and `withheldHits` skips
   * it below, because it IS on the sheet. That was proposed as a second
   * `selectShownGroups` exemption (lane D verdict N-1) and refused: the row's
   * «Защо» and its article go, but the ACT and its corrective do not, because
   * this is the exact state §5.6.10's full form exists for. Asserted rather
   * than argued, so the day someone exempts the row this case says what it was
   * protecting. Reaches 0 of the 2,434 authored drives (max 2 charged groups);
   * an ordinary bad drive with five distinct faults reaches it.
   */
  it("a cut charged hit still gets its act and its corrective, from the practice line", () => {
    const heavier = ["SPEEDING_DANGEROUS", "RED_LIGHT_CROSSED", "WRONG_WAY", "FAILED_TO_YIELD"];
    const crowded = drive(lesson, {
      coached: [CYCLIST_SQUEEZE],
      events: [
        makeViolation("VULNERABLE_PASS_TOO_CLOSE", 40, { detail: "vulnerable-pass" }),
        ...heavier.map((code, i) => makeViolation(code as "RED_LIGHT_CROSSED", 50 + i)),
      ],
    });
    expect(crowded.lessonMistakes?.[0]?.charged).toBe(true);
    const t = buildDebrief(lesson, crowded, { coachedMistakes: crowded.coachedMistakes }).text;
    // Five groups, four slots: the overflow line proves the cut really ran, and
    // the block no longer carries this act at all.
    expect(t).toContain("…и още");
    expect(t).not.toContain(`• ${VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg} — основна,`);
    // …and the foot of the card names it and says what to do instead.
    expect(t).toContain(
      `Какво да упражниш: повтори урока без „${VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg}“ — ` +
        `${VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.correctiveBg}`,
    );
    // The exemption that IS there is untouched: a terminating fault survives the
    // same crowd.
    const withCrash = drive(lesson, {
      coached: [CYCLIST_SQUEEZE],
      events: [
        makeViolation("COLLISION", 60),
        ...heavier.map((code, i) => makeViolation(code as "RED_LIGHT_CROSSED", 50 + i)),
      ],
    });
    expect(
      buildDebrief(lesson, withCrash, { coachedMistakes: withCrash.coachedMistakes }).text,
    ).toContain(`• ${VIOLATIONS.COLLISION.titleBg}`);
  });
});

// ---------------------------------------------------------------------------
// 5. The theory link (§5.6.9, §5.6.10)
// ---------------------------------------------------------------------------

describe("ADR-009 · the theory offered is the theory for the act that cost the lesson", () => {
  const lesson = lessonAt("sc-vu-pass-clearance", 3);

  it("the hit's concept leads `conceptIds`, ahead of the sheet's", () => {
    const out = buildDebrief(
      lesson,
      drive(lesson, {
        coached: [CYCLIST_SQUEEZE],
        events: [makeViolation("RED_LIGHT_CROSSED", 50)],
      }),
      {},
    );
    expect(out.conceptIds[0]).toBe(VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.conceptId);
    expect(out.conceptIds).toContain(VIOLATIONS.RED_LIGHT_CROSSED.conceptId);
    // De-duplicated: the same concept is never offered twice.
    expect(new Set(out.conceptIds).size).toBe(out.conceptIds.length);
  });

  it("with a title resolved, the line is the theory topic AND the act to repeat without", () => {
    const conceptId = VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.conceptId;
    if (conceptId === undefined) throw new Error("fixture assumes this code has a concept");
    const t = buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE] }), {
      conceptTitles: { [conceptId]: "Велосипедисти" },
    }).text;
    expect(t).toContain(
      "Какво да упражниш: започни от „Велосипедисти“ — темата зад грешката, която този урок учи.",
    );
    expect(t).toContain("повтори урока без „Тясно изпреварване на велосипедист“");
    // Never the sheet's sentence, which claims a heaviest mistake this drive
    // does not have.
    expect(t).not.toContain("темата зад най-тежката ти грешка");
  });

  /**
   * ONE SENTENCE, ONE MISTAKE — the four drives that paired a topic with
   * somebody else's act.
   *
   * `lessonMistakeConceptIds` skips the three concept-less codes, so a two-hit
   * drive whose FIRST hit is one of them resolved its topic from the SECOND
   * while the clause «повтори урока без „…“» still named the first. MEASURED
   * 2026-09-18 on the real chain over all 2,434 authored drives: 566 print this
   * sentence, and `sc-vu-cyclist-group/mistake-cut-in` @L1/L2/L3/L5 offered
   * „Велосипедисти" (the topic behind the withheld VULNERABLE_PASS_TOO_CLOSE)
   * and told the student to repeat without „Несъобразена дистанция"
   * (FOLLOWING_TOO_CLOSE, which carries no topic at all).
   *
   * The lesson and both codes here are the real ones — `lessonMistakeTargets`
   * of `sc-vu-cyclist-group` derives both from its own ❌ demos — so this case
   * dies if the derivation stops carrying either.
   */
  it("the topic and the act it names are the SAME hit, on a two-hit drive", () => {
    const cyclistGroup = lessonAt("sc-vu-cyclist-group", 3);
    const conceptId = VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.conceptId;
    if (conceptId === undefined) throw new Error("fixture assumes this code has a concept");
    expect(VIOLATIONS.FOLLOWING_TOO_CLOSE.conceptId).toBeUndefined();
    const result = drive(cyclistGroup, {
      coached: [
        { code: "FOLLOWING_TOO_CLOSE", titleBg: VIOLATIONS.FOLLOWING_TOO_CLOSE.titleBg, t: 12 },
        CYCLIST_SQUEEZE,
      ],
    });
    // The engine's own fold, in the order the student met them: the
    // concept-less code is FIRST, which is the whole shape of the defect.
    expect(result.lessonMistakes?.map((h) => h.code)).toEqual([
      "FOLLOWING_TOO_CLOSE",
      "VULNERABLE_PASS_TOO_CLOSE",
    ]);
    const t = buildDebrief(cyclistGroup, result, {
      conceptTitles: { [conceptId]: "Велосипедисти" },
    }).text;
    expect(t).toContain(
      "Какво да упражниш: започни от „Велосипедисти“ — темата зад грешката, която този урок " +
        "учи. Отвори я в раздел „Теория“, после повтори урока без " +
        "„Тясно изпреварване на велосипедист“.",
    );
    // The act the topic is NOT behind is not the one the sentence sends him to
    // repeat without. It is still explained, in «Грешките на този урок» above.
    expect(t).not.toContain(
      `повтори урока без „${VIOLATIONS.FOLLOWING_TOO_CLOSE.titleBg}“`,
    );
    expect(t).toContain(VIOLATIONS.FOLLOWING_TOO_CLOSE.titleBg);
  });

  it("with no title resolved, the act is still named", () => {
    const t = buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE] }), {}).text;
    expect(t).toContain(
      "Какво да упражниш: повтори урока и този път без „Тясно изпреварване на велосипедист“.",
    );
  });

  /**
   * THREE OF THE 58 CATALOGUE CODES AUTHOR NO CONCEPT — FOLLOWING_TOO_CLOSE,
   * NOT_KEEPING_RIGHT, POOR_LANE_KEEPING — and ALL THREE are targets, of 7, 4
   * and 11 lessons respectively (re-counted 2026-09-18 from
   * `lesson-mistake-targets.fixture.json` `counts.codeFrequencyByLesson`; this
   * comment and `debrief.ts`'s used to say «two» and disagree on which two).
   * So the absent branch is
   * a live one: measured, 76 of the 654 hit drives return an empty `conceptIds`
   * after this change. The debrief must be honest about it rather than link a
   * topic that does not exist.
   */
  it("a hit whose code has no theory topic is said plainly, with no dead link", () => {
    expect(VIOLATIONS.FOLLOWING_TOO_CLOSE.conceptId).toBeUndefined();
    const followLesson = lessonAt("sc-follow-distance", 3);
    const out = buildDebrief(
      followLesson,
      drive(followLesson, {
        coached: [
          { code: "FOLLOWING_TOO_CLOSE", titleBg: VIOLATIONS.FOLLOWING_TOO_CLOSE.titleBg, t: 9 },
        ],
      }),
      // A title map that would resolve if anything asked it to.
      { conceptTitles: { "c-cyclists": "Велосипедисти" } },
    );
    expect(out.conceptIds).toEqual([]);
    expect(out.text).toContain(
      `Какво да упражниш: повтори урока и този път без „${VIOLATIONS.FOLLOWING_TOO_CLOSE.titleBg}“.`,
    );
    expect(out.text).not.toContain("раздел „Теория“");
  });

  it("…and a hit-free drive's `conceptIds` are the summary's, element for element", () => {
    const result = drive(lesson, { events: [makeViolation("RED_LIGHT_CROSSED", 50)] });
    expect(buildDebrief(lesson, result, {}).conceptIds).toEqual(result.summary.conceptIds);
  });

  /**
   * §5.6.10's FULL form — the corrective in the «Какво да упражниш» line — and
   * it is reachable only when nothing else on the page has given the action.
   * Measured 0 of 2,434 authored drives, so this is the only place it runs:
   * four опасни ahead of the target (the block sorts dangerous first) fill all
   * four of `MAX_MISTAKE_LINES`, so the основна target's row is cut and its
   * corrective is nowhere above.
   */
  it("gives the corrective in the practice line when no block above printed it", () => {
    const result = drive(lesson, {
      events: [
        makeViolation("RED_LIGHT_CROSSED", 10),
        makeViolation("FAILED_TO_YIELD", 12),
        makeViolation("PEDESTRIAN_NOT_YIELDED", 14),
        makeViolation("RAIL_CROSSING_VIOLATION", 16),
        makeViolation("VULNERABLE_PASS_TOO_CLOSE", 18, { detail: "vulnerable-pass" }),
      ],
    });
    expect(result.lessonMistakes?.map((h) => h.code)).toEqual(["VULNERABLE_PASS_TOO_CLOSE"]);
    const t = buildDebrief(lesson, result, {}).text;
    // The mistakes block cut it, so nothing above gave the action…
    const shownCorrectives = t.split("  → Правилното действие: ").slice(1);
    expect(shownCorrectives.some((s) => s.startsWith(VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.correctiveBg))).toBe(false);
    // …and the practice line supplies it.
    expect(t).toContain(
      `Какво да упражниш: повтори урока без „${VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.titleBg}“ — ${VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.correctiveBg}`,
    );
  });

  /** …and the corrective is never printed twice on one card (measured 0). */
  it("never repeats one corrective in two places", () => {
    const t = buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE] }), {}).text;
    const corrective = VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.correctiveBg;
    expect(t.split(corrective).length - 1).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. The riders (§5.6.7, critic gap 5) — and M13
// ---------------------------------------------------------------------------

describe("ADR-009 · praise a refused drive earned is qualified, not deleted", () => {
  const lesson = lessonAt("sc-vu-pass-clearance", 3);

  it("CLEAN_DRIVING is scoped by the hit, with the sheet empty", () => {
    const result = drive(lesson, {
      coached: [CYCLIST_SQUEEZE],
      events: [makeCommendation("CLEAN_DRIVING", 12)],
    });
    expect(result.summary.mistakes).toEqual([]);
    const t = buildDebrief(lesson, result, {}).text;
    expect(t).toContain("• Чисто и спокойно каране — но само на отделни отсечки");
    expect(t).toContain("в същия урок се случи грешката, която той учи");
    // The sheet-flavoured wording would be false here: nothing is marked on it.
    expect(t).not.toContain("в същия урок има и отбелязани грешки");
  });

  it("…and with a scored fault instead of a hit it still reads the sheet's way", () => {
    const result = drive(lesson, {
      events: [makeCommendation("CLEAN_DRIVING", 12), makeViolation("HANDBRAKE_LEFT_ON", 20)],
    });
    const t = buildDebrief(lesson, result, {}).text;
    expect(t).toContain("в същия урок има и отбелязани грешки");
    expect(t).not.toContain("се случи грешката, която той учи");
  });

  it("praise for the very skill the hit convicted is qualified", () => {
    const result = drive(lesson, {
      coached: [CYCLIST_SQUEEZE],
      // Same conceptId as VULNERABLE_PASS_TOO_CLOSE (c-cyclists).
      events: [makeCommendation("YIELDED_TO_PRIORITY", 8, "vulnerable-pass")],
    });
    const t = buildDebrief(lesson, result, {}).text;
    expect(t).toContain("Правилно разминаване с велосипедист — но не всеки път");
    expect(t).toContain("когато го правиш ВСЕКИ път");
  });

  it("…and praise for a DIFFERENT skill is left alone on the same hit drive", () => {
    const result = drive(lesson, {
      coached: [CYCLIST_SQUEEZE],
      events: [makeCommendation("FULL_STOP_AT_STOP_SIGN", 8)],
    });
    const t = buildDebrief(lesson, result, {}).text;
    expect(t).toContain("• Правилно спиране на знак Б2");
    expect(t).not.toContain("но не всеки път");
  });

  /**
   * M13 — «rider flags ignore `lessonMistakes`». The flags default to an empty
   * hit list so every pre-ADR caller compiles; that default is also exactly the
   * mutation, so it can be applied here instead of to the file, and both
   * questions are shown to depend on the argument.
   */
  it("M13 · dropping the hits from the flags is what the old file did, and it reds", () => {
    const result = drive(lesson, {
      coached: [CYCLIST_SQUEEZE],
      events: [
        makeCommendation("CLEAN_DRIVING", 12),
        makeCommendation("YIELDED_TO_PRIORITY", 8, "vulnerable-pass"),
      ],
    });
    const hits = result.lessonMistakes ?? [];
    expect(hits.length).toBe(1);
    const clean = { code: "CLEAN_DRIVING" };
    const cyclist = { code: "YIELDED_TO_PRIORITY", conceptId: "c-cyclists" };

    // With the hits: both riders fire.
    expect(commendationRiderFlags(result.summary, clean, hits).unclean).toBe(true);
    expect(commendationRiderFlags(result.summary, cyclist, hits).contradicted).toBe(true);
    expect(
      commendationRiderBg(result.summary, commendationRiderFlags(result.summary, clean, hits), hits),
    ).toContain("се случи грешката, която той учи");

    // Without them — the mutation — the drive is certified clean.
    expect(commendationRiderFlags(result.summary, clean).unclean).toBe(false);
    expect(commendationRiderFlags(result.summary, cyclist).contradicted).toBe(false);
    expect(
      commendationRiderBg(result.summary, commendationRiderFlags(result.summary, clean)),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Vocabulary over every line this ADR added — and M10
// ---------------------------------------------------------------------------

/**
 * NO BARE POINTS IN THE NEW COPY — the guard `rules/__tests__/point-scales.
 * test.ts` cannot reach, because `lessons/debrief.ts` is in none of its
 * GUARDED_DIRS (doc 92 §1 item 7).
 *
 * The founder drove the simulator, met a card reading „−10 т." and read it as
 * his DRIVING LICENCE being docked. Unqualified „точки" means КОНТРОЛНИ точки
 * to a Bulgarian, and „т." names nothing at all — so every mention of points in
 * ADR-009's sentences has to name its scale.
 *
 * SCANS THE RENDERED TEXT, not the source, and only the lines this ADR added:
 * the source carries a long history in comments and quotes the defect on
 * purpose, and what a student reads is the thing under test. The checker is
 * proved by M10 below — a synthetic bare-points line must come back as a hit,
 * or the scan is the fifth green-and-blind check this repo has shipped.
 *
 * WHY THE WORD BOUNDARY IS SPELLED OUT: JavaScript's `\b` is ASCII-only, so
 * `/\bточки\b/` can NEVER match Cyrillic — the exact trap doc 92 records
 * against an earlier draft of this very assertion. The boundary is tested with
 * `\p{L}`.
 */
const LETTER = /\p{L}/u;
/** „наказателни точки", „изпитни точки", „контролни точки", „нак. точки". */
const QUALIFIED_BEFORE = /(наказателн|изпитн|контролн|нак\.)\p{L}*\s*$/u;
/** „точки от изпитния лист", „точки по теорията", „точки за изпълнение". */
const QUALIFIED_AFTER = /^\s*(от\s+изпитния\s+лист|по\s+теорията|за\s+изпълнение|от\s+правилни\s+отговори)/u;

function barePointsIn(lines: readonly string[]): string[] {
  const bad: string[] = [];
  for (const line of lines) {
    // The abbreviation.
    for (const m of line.matchAll(/т\./gu)) {
      const at = m.index ?? 0;
      if (at > 0 && LETTER.test(line[at - 1])) continue; // „резултат.", not a unit
      if (/^т\.\s*\d/u.test(line.slice(at))) continue; // „т. 10" — a statute item
      if (/и\s*т\.\s*н\./u.test(line.slice(Math.max(0, at - 4), at + 6))) continue; // „и т.н."
      if (QUALIFIED_BEFORE.test(line.slice(0, at))) continue;
      bad.push(line);
    }
    // …and the same defect spelled out.
    for (const m of line.matchAll(/точк\p{L}*/gu)) {
      const at = m.index ?? 0;
      if (at > 0 && LETTER.test(line[at - 1])) continue;
      if (QUALIFIED_BEFORE.test(line.slice(0, at))) continue;
      if (QUALIFIED_AFTER.test(line.slice(at + m[0].length))) continue;
      bad.push(line);
    }
  }
  return bad;
}

describe("ADR-009 · every added line names the scale its points are on", () => {
  const lesson = lessonAt("sc-vu-pass-clearance", 3);
  /** The markers of the lines this ADR introduced, in the rendered text. */
  const ADDED = [
    "не е взет: допусна",
    "Отделно от изпитния лист:",
    "Урокът и без прекъсването",
    "Грешката на този урок (при първа поява",
    "Грешките на този урок (при първа поява",
    "При повторение вече влиза и в изпитния лист.",
    "а заради грешката, която учи (по-горе)",
    "се случи грешката, която той учи",
    "повтори урока и този път без",
    "повтори урока без „",
    "темата зад грешката, която този урок учи",
  ];

  function addedLines(text: string): string[] {
    return text.split("\n").filter((l) => ADDED.some((m) => l.includes(m)));
  }

  it("the new sentences carry no bare „т.“ and no unqualified „точки“", () => {
    const texts = [
      buildDebrief(lesson, withRouteDone(drive(lesson, { coached: [CYCLIST_SQUEEZE] })), {}).text,
      buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE] }), {}).text,
      buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE], aborted: true }), {}).text,
      buildDebrief(
        lesson,
        drive(lesson, {
          coached: [CYCLIST_SQUEEZE],
          events: [makeViolation("COLLISION", 30, { detail: "vehicle" }), makeCommendation("CLEAN_DRIVING", 8)],
        }),
        {},
      ).text,
      buildDebrief(lesson, drive(lesson, { coached: [CYCLIST_SQUEEZE] }), {
        conceptTitles: { "c-cyclists": "Велосипедисти" },
      }).text,
    ];
    const scanned = texts.flatMap(addedLines);
    // The scan has to have something to scan — a zero-line pass is the blind
    // shape this file exists to refuse.
    expect(scanned.length).toBeGreaterThanOrEqual(ADDED.length - 2);
    expect(barePointsIn(scanned)).toEqual([]);
  });

  it("M10 · the same scan reports a bare-points line, so it is not blind", () => {
    expect(
      barePointsIn(["Урокът „X“ не е взет: допусна „Y“ — това струва −10 т. следващия път."]),
    ).toHaveLength(1);
    expect(barePointsIn(["Отделно от изпитния лист: изгуби 3 точки."])).toHaveLength(1);
    // …and the qualified forms the product actually writes are accepted.
    expect(
      barePointsIn([
        "По изпитния лист карането е в допустимото (0 наказателни точки при допустими 9).",
        "При повторение вече влиза и в изпитния лист.",
        "Правило: ЗДвП чл. 42, ал. 2, т. 1",
      ]),
    ).toEqual([]);
  });
});
