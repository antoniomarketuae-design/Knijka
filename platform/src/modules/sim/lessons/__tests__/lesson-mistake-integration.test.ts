/**
 * ADR-009 I1 — THE TWO ASSERTIONS THE SPEC MOVED OUT OF LANE C, AND ONE DRIVE
 * ON WHICH EVERY SURFACE HAS TO AGREE (doc 92 §8.4 I1, critic gap 11).
 *
 * WHY THIS FILE EXISTS AT ALL. Lane C's `lesson-mistake-verdict.test.ts` says
 * so in its own header: «NO STAR ASSERTIONS LIVE HERE (spec §8.1 T2) … a drive
 * that fails ADR-009 can currently still show 3★, which is lane E's to close».
 * Lane E then closed it in `scenario/__tests__/rubric.test.ts` — on HAND-BUILT
 * `LessonResult`s. Both halves are right and neither of them drives anything:
 * the star cap is pinned against a literal, and the verdict is pinned without
 * the stars. Between two green suites sat the question founder Ruling A is
 * actually about — what a student who commits the lesson's own mistake is
 * TOLD, by every surface at once — and nothing drove a tape end to end to ask
 * it. This programme has measured that shape 51 times in 82 repairs: a
 * predicate that is true and that nothing live reaches.
 *
 * SO EVERYTHING HERE IS DRIVEN. `compileScenario → createLessonSession →
 * applyTick → buildLessonResult`, on the committed recordings the product
 * ships, through the same entry points `LessonPlayShell.tsx` and
 * `finishLessonAction` call. No fixture, no hand-built result, no mock. Where a
 * number is asserted it is the number the chain produced on this tree; the
 * acceptance census (`tools/audit/lesson-mistake-census.mjs`, 2,434 drives,
 * two runs to one digest) is where each of them was first read off.
 *
 * WHAT IT MAY NOT BE CITED FOR. Nothing here is painted. `sessionVerdict`,
 * `lessonMistakeReasonsBg` and `lessonMistakeVerdictNoteBg` are called as
 * functions; that their output reached a phone, fitted it or was legible is
 * lane P's photographs and no assertion below speaks to it.
 *
 * MUTATION-TESTED, each mutation applied to a scratch copy of the tree (never
 * to the worktree) and each measured, 2026-09-18 — the counts below are what
 * the runner printed, not what was expected of it:
 *   · M1 (doc 92 §8.5) — stop `compile.ts` spreading `lessonMistakeTargets`
 *     onto the compiled lesson: **8 of 12 fail**, and the 4 that stay green are
 *     this file's own controls, which is what a control is for;
 *   · the star floor — remove the `lessonMistakes` clause from `rubric.ts`'s
 *     cap (`:875`): **6 fail** — every star assertion, including §3 and §4 —
 *     while §2's two verdict tests stay green;
 *   · the fourth verdict — drop the `lessonMistake` arm from `sessionVerdict`:
 *     **4 fail** (§2's two, §3 and §4), while §1's four star tests stay green.
 * The last two are the split this file was written to close: each of the two
 * halves has a mutation the OTHER half cannot see, and §3 and §4 are the only
 * tests that red on both.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  SESSION_VERDICT_LABEL_BG,
  lessonMistakeReasonsBg,
  lessonMistakeVerdictNoteBg,
  sessionVerdict,
} from "../../hud/SessionEndScreen";
import { recordScLaneChangeDrive, type ScLaneChangeTraceName } from "../../traces/scLaneChange";
import { recordScPkBusstopBanDrive, type ScPkBusstopBanTraceName } from "../../traces/scPkBusstopBan";
import { recordScVuPassDrive, type ScVuPassTraceName } from "../../traces/scVuPass";
import { buildDebrief } from "../debrief";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { lessonMistakeConceptIds } from "../lessonMistake";
import { compileScenario } from "../scenario/compile";
import { scoreRubric } from "../scenario/rubric";
import { SC_LANE_CHANGE } from "../scenario/templates-flow";
import { SC_PK_BUSSTOP_BAN } from "../scenario/templates-parking2";
import { SC_VU_PASS_CLEARANCE } from "../scenario/templates-vru";
import type { ScenarioLevel, ScenarioSpec } from "../scenario/types";
import type { LessonResult, LessonSessionState } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const district = (id: string): unknown =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));

const VU_PASS = district("vu-pass-v1");
const BUSSTOP = district("pk-busstop-v1");
const LANE = district("ln-v1");

/** The practice rungs. L4 is `examMode` by `compile.ts rungExamMode` — the control. */
const PRACTICE: ScenarioLevel[] = [1, 2, 3, 5];

function play(
  spec: ScenarioSpec,
  level: ScenarioLevel,
  record: (onTick: (tick: Parameters<typeof applyTick>[1]) => void) => void,
): LessonResult {
  let session: LessonSessionState = createLessonSession(compileScenario(spec, level));
  record((tick) => {
    session = applyTick(session, tick).state;
  });
  return buildLessonResult(session);
}

const squeeze = (level: ScenarioLevel, name: ScVuPassTraceName = "mistake-squeeze"): LessonResult =>
  play(SC_VU_PASS_CLEARANCE, level, (onTick) => {
    recordScVuPassDrive(VU_PASS, name, { onTick });
  });

const busstop = (level: ScenarioLevel, name: ScPkBusstopBanTraceName): LessonResult =>
  play(SC_PK_BUSSTOP_BAN, level, (onTick) => {
    recordScPkBusstopBanDrive(BUSSTOP, name, { onTick });
  });

const laneChange = (level: ScenarioLevel, name: ScLaneChangeTraceName): LessonResult =>
  play(SC_LANE_CHANGE, level, (onTick) => {
    recordScLaneChangeDrive(LANE, name, { onTick });
  });

/**
 * The stars the result screen would show — and a LOUD refusal rather than a
 * skip when the template stops authoring a rubric. `scoreRubric` is only
 * reachable through `spec.rubric`, so a template that loses it would quietly
 * turn every star assertion below into a no-op.
 */
function starsOf(spec: ScenarioSpec, result: LessonResult): number {
  const rubric = spec.rubric;
  if (rubric === undefined) throw new Error(`${spec.id} authors no rubric — the star cap is unmeasurable here`);
  return scoreRubric(result, rubric).stars;
}

describe("ADR-009 I1 — the star cap, the verdict, and one drive where they meet", () => {
  // -------------------------------------------------------------------------
  // §1 THE STAR CAP, DRIVEN (doc 92 §5.7, §8.4 I1 first bullet)
  //
  // «взето» is two stars or more (`progress.ts:333`), so a refused lesson that
  // shows two or three has told the catalogue the opposite of the verdict on
  // the card above it.
  // -------------------------------------------------------------------------
  it.each(PRACTICE)("the squeeze is one star at L%i", (level) => {
    expect(starsOf(SC_VU_PASS_CLEARANCE, squeeze(level))).toBe(1);
  });

  it("…and TWO at L4, because the exam rung is untouched by Ruling A", () => {
    // Not a lower number on a better drive: the L4 sheet books the official 3
    // наказателни точки for the same act, and `score > 0` is what holds it at
    // two. The ADR is invisible here — no hit, no cap, the pre-ADR-009 number.
    const exam = squeeze(4);
    expect(exam.lessonMistakes ?? []).toEqual([]);
    expect(starsOf(SC_VU_PASS_CLEARANCE, exam)).toBe(2);
  });

  it("THE CONTROL: the correct drive still reads three stars at every rung", () => {
    // A cap that fired on every drive would pass §1 and mean nothing.
    for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
      expect(starsOf(SC_VU_PASS_CLEARANCE, squeeze(level, "shadow-correct"))).toBe(3);
    }
  });

  // -------------------------------------------------------------------------
  // §2 THE SESSION VERDICT, DRIVEN (doc 92 §5.1, §8.4 I1 second bullet)
  // -------------------------------------------------------------------------
  it("the squeeze at L3 is «Не е взет», and the same tape at L4 is «Издържан»", () => {
    expect(sessionVerdict(squeeze(3))).toBe("lessonMistake");
    expect(SESSION_VERDICT_LABEL_BG[sessionVerdict(squeeze(3))]).toBe("Не е взет");
    expect(sessionVerdict(squeeze(4))).toBe("passed");
  });

  it("stopping inside the bus-stop zone at L1 is «Не е взет» — on a route left unfinished", () => {
    // This is the second of the spec's two named drives and it is the harder
    // one: the route is NOT complete, so before ADR-009 the fourth arm did not
    // exist and this drive read «Незавършен» — «стигни до края», which is the
    // one instruction that would not have earned him the lesson. L4 still does,
    // and that is the control: the word moved because of the hit, not because
    // of the route.
    const pocket = busstop(1, "mistake-stop-on-pocket");
    expect(pocket.completedAll).toBe(false);
    expect((pocket.lessonMistakes ?? []).map((h) => h.code)).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
    expect(sessionVerdict(pocket)).toBe("lessonMistake");

    const exam = busstop(4, "mistake-stop-on-pocket");
    expect(exam.lessonMistakes ?? []).toEqual([]);
    expect(sessionVerdict(exam)).toBe("unfinished");
  });

  it("THE CONTROL: the correct bus-stop drive is «Издържан» at L1", () => {
    expect(sessionVerdict(busstop(1, "shadow-correct"))).toBe("passed");
  });

  // -------------------------------------------------------------------------
  // §3 THE PROBE DRIVE AT ONE STAR (doc 92 §8.4 I1 third bullet)
  //
  // The spec's own probe is a scratchpad script (`probe-ftg-late-brakecheck.
  // json`, doc 92 §7 lane C: «lane C inlines the probe script») that was NOT
  // inlined anywhere in this tree — measured by search before this file was
  // written. Its claim, though, is not about that one script: it is that a
  // drive which finishes its route with a SPOTLESS изпитен лист and reads
  // ИЗДЪРЖАН ★★★ today is refused and capped tomorrow. A committed recording
  // of exactly that shape is better evidence than an uncommitted script, and
  // the census names 108 of them; this is one.
  // -------------------------------------------------------------------------
  it("a clean-sheet, route-complete drive that was ИЗДЪРЖАН ★★★ is now «Не е взет» ★, and costs no points", () => {
    const refused = laneChange(3, "mistake-no-indicator");
    expect(refused.completedAll).toBe(true);
    // The изпитен лист did not move — founder Ruling A's «NO exam points for
    // that first occurrence», read off the sheet rather than asserted about it.
    expect(refused.summary.score.totalPoints).toBe(0);
    expect(refused.summary.passed).toBe(true);
    expect((refused.lessonMistakes ?? []).map((h) => [h.code, h.charged])).toEqual([
      ["LANE_CHANGE_WITHOUT_INDICATOR", false],
    ]);
    expect(sessionVerdict(refused)).toBe("lessonMistake");
    expect(starsOf(SC_LANE_CHANGE, refused)).toBe(1);

    // …and the same lesson's correct drive keeps the ★★★ it always had. The
    // 3★ half of the claim is measured, not remembered.
    const correct = laneChange(3, "shadow-correct");
    expect(sessionVerdict(correct)).toBe("passed");
    expect(starsOf(SC_LANE_CHANGE, correct)).toBe(3);
  });

  // -------------------------------------------------------------------------
  // §4 ONE DRIVE, AND EVERY SURFACE SAYING THE SAME THING ABOUT IT
  //
  // THEO-4 (doc 64, founder-ratified) is not «print a reason somewhere»: a
  // product that announces one verdict on the pill, another in the prose and a
  // third in the stars has made its explanation unbelievable. So the four are
  // read off ONE driven result and compared to each other.
  // -------------------------------------------------------------------------
  it("the verdict, the stars, the reason block and the debrief agree on the squeeze @L3", () => {
    const result = squeeze(3);
    const hits = result.lessonMistakes ?? [];
    expect(hits).toHaveLength(1);

    // (a) the verdict, and its word
    expect(sessionVerdict(result)).toBe("lessonMistake");
    expect(SESSION_VERDICT_LABEL_BG.lessonMistake).toBe("Не е взет");

    // (b) the stars
    expect(starsOf(SC_VU_PASS_CLEARANCE, result)).toBe(1);

    // (c) the reason block — one row, the hit's own code, with the four things
    // the pill owes the student. Every one of them RETRIEVED (ADR-002): this
    // asserts they are non-empty and that they are the catalogue's, never what
    // they should say.
    const reasons = lessonMistakeReasonsBg(result);
    expect(reasons.map((r) => r.code)).toEqual([hits[0].code]);
    expect(reasons[0].titleBg).toBe(hits[0].titleBg);
    expect(reasons[0].explanationBg.length).toBeGreaterThan(0);
    expect(reasons[0].correctiveBg.length).toBeGreaterThan(0);
    expect(reasons[0].lawRef.length).toBeGreaterThan(0);
    // The first occurrence's stake, not the repeat's: this drive's hit is
    // uncharged, and saying «повторението ѝ влезе в изпитния лист» here would
    // be the false stake sentence the live teach card used to print.
    expect(hits[0].charged).toBe(false);
    expect(reasons[0].stakeBg).toContain("При първа поява");
    expect(reasons[0].stakeBg).not.toContain("повторението");

    // (d) the note under the pill — it must name the same act, point at the
    // heading the block actually renders, and say why the word is not
    // «Неиздържан».
    const note = lessonMistakeVerdictNoteBg(result);
    expect(note).not.toBeNull();
    expect(note).toContain(reasons[0].titleBg);
    expect(note).toContain("„Грешката на този урок“");
    expect(note).toContain("не пише „Неиздържан“");

    // (e) the debrief prose — the same verdict, the same act, the same rule.
    const debrief = buildDebrief(compileScenario(SC_VU_PASS_CLEARANCE, 3), result, {
      coachedMistakes: result.coachedMistakes,
    });
    expect(debrief.text).toContain("не е взет");
    expect(debrief.text).toContain(reasons[0].titleBg);
    expect(debrief.text).toContain(reasons[0].correctiveBg);
    expect(debrief.text).toContain(reasons[0].lawRef);
    // …and the theory it points at leads with the hit's own concept (doc 92
    // §5.6.9): the one concept the student needs is the one the charged ledger
    // could not supply, because a first occurrence is never charged.
    expect(debrief.conceptIds[0]).toBe(lessonMistakeConceptIds(hits)[0]);

    // (f) the sheet, last, because it is what makes the other five surprising:
    // nothing was charged, and the lesson is still not taken.
    expect(result.summary.passed).toBe(true);
    expect(result.summary.score.totalPoints).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("THE CONTROL: on the correct drive not one of those surfaces speaks", () => {
    const result = squeeze(3, "shadow-correct");
    expect(result.lessonMistakes ?? []).toEqual([]);
    expect(sessionVerdict(result)).toBe("passed");
    expect(lessonMistakeReasonsBg(result)).toEqual([]);
    expect(lessonMistakeVerdictNoteBg(result)).toBeNull();
    expect(
      buildDebrief(compileScenario(SC_VU_PASS_CLEARANCE, 3), result, {
        coachedMistakes: result.coachedMistakes,
      }).text,
    ).not.toContain("не е взет");
  });
});
