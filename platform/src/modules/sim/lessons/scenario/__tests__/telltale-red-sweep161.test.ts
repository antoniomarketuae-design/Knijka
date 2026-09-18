/**
 * sc-vp-telltale-red — THE RED LAMP THAT WAS IGNORED, DRIVEN THROUGH THE
 * SESSION AND THE DEBRIEF (`sc-vp-telltale-red:c172d48b`, major, filed against
 * `rules/engine.ts` off `.audit-frames/sweep161/sc-vp-telltale-red/pc-wrong/
 * 08-debrief.png`, 2026-08-17).
 *
 * WHAT THE FRAME SAID: «SCORE: 20 наказателни точки», and both rows are
 * «Пътнотранспортно произшествие». Not one names the lamp. The row's sentence
 * is the whole case — „the wrong lane is convicted for a collision, not for
 * mis-triaging the lamp colour; a student who treats a red lamp as a yellow one
 * and keeps driving WITHOUT CRASHING would be recorded as faultless".
 *
 * HALF OF IT WAS REPAIRED AT `b8b1ce4` (wave 20, 2026-09-02): the telltale
 * runner's drive-on branch now emits `prioritySituation "warning-lamp"
 * violated`, `rules/engine.ts` grades it `WARNING_LAMP_IGNORED` (основна, 3 т.,
 * ЗДвП чл. 101, ал. 1 — retrieved, `catalog.ts` carries the recital), and
 * `orchestrator/__tests__/telltale-stimulus.test.ts` pins the emitter.
 *
 * THE OTHER HALF WAS NOT, and it is the half the row's own words are about.
 * Measured at HEAD through this exact chain, on a drive that ignores the lamp
 * and does not crash (`tools/audit/inprocess-drive.mjs`, the 55 км/ч full-route
 * script):
 *
 *   reducer  WARNING_LAMP_IGNORED @ 20,5 s — fired, exactly as designed
 *   sheet    опасни 0/0 · основни 0/0 · второстепенни 0/0 · Общо 0
 *   debrief  the code under «Учебни моменти (не влизат в точките)»
 *
 * Faultless on the изпитен лист, verbatim. WHY: основна is teach-first, the
 * telltale runner resolves EXACTLY ONCE PER DRIVE, and `prior` is counted per
 * topic per DRIVE (`scenarios/coach.ts` — „one free lesson per topic"). So the
 * only bill this duty can ever produce is spent on the card, on every attempt,
 * for ever — while the debrief prints «При повторение вече влиза в изпитния
 * лист» over a drive that can have no повторение. That is verbatim
 * `STANDING_DUTY_REGRADE_SEC`'s defect and it takes the family's answer:
 * `WARNING_LAMP_REGRADE_SEC` (rules/engine.ts) bills the CONTINUING drive-on
 * once more, marked `regrade`, six accrued seconds after the card.
 *
 * TEACH-FIRST IS UNTOUCHED, and that is deliberate: w37 declined the founder
 * question („a red warning lamp may be the one case where a first-offence
 * amnesty is wrong on safety grounds") and carving an exception out of a
 * ratified policy is a ruling, not an edit. The first encounter is still free,
 * still a card, still worth zero. What changes is that the escalation the card
 * PROMISES becomes reachable.
 *
 * A12 — THE OTHER DIRECTION IS DRIVEN TOO, twice. The compliant pull-over must
 * still be acquitted and certified, and the student who BEGINS to ease off
 * after the card must never meet the second bill: a calm 1,5 m/s² stop from the
 * posted 50 takes over nine seconds, so a clock that only asked „is he still
 * moving" would convict the driver doing what `correctiveBg` asks and leave the
 * panic slam as the only escape. The drop test is pinned from the runner side
 * in `orchestrator/__tests__/telltale-stimulus.test.ts`; what is pinned HERE is
 * the sheet at the end of the whole chain.
 *
 * ═══ WHAT ADR-009 CHANGED, 2026-09-18 (founder Ruling A; ADR-009 in
 * docs/architecture/07, spec doc 92 §3.4b b and §8.3) ═══
 *
 * `sc-vp-telltale-red`'s derived `lessonMistakeTargets` at every practice rung
 * is `[HARSH_BRAKING_NO_CAUSE, WARNING_LAMP_IGNORED]` — its two ❌ demos' own
 * codes, «Паническо спиране в активната лента» and «Каране нататък с червената
 * лампа». So the drive-on below IS the mistake this lesson exists to teach, and
 * the ruling forbids the points its re-bill was reaching for: «NO exam points
 * are taken for that first occurrence». `WARNING_LAMP_REGRADE_SEC` still fires
 * in the reducer — measured, first case below — and `lessons/engine.ts`'s
 * regrade guard now drops it before the session bills it.
 *
 * SO THE SHEET GOES 3 т. → 0 т. ON THIS DRIVE, and the row's own sentence is
 * answered by something else instead: the lesson reads «Не е взет», with the
 * act named. That is the founder's ruling and not a regression to the state
 * `c172d48b` was filed about — but the two claims are not the same claim, so
 * every number the row was closed on is kept under measurement by a STRIP
 * CONTROL: the identical drive against a copy of the compiled lesson with only
 * `lessonMistakeTargets` removed. There the re-grade still reaches the session,
 * still lands at the second bill's second, and the debrief still prints the
 * price and the citation. If the escalation itself ever broke, the control reds
 * while the ADR-009 case stays green — and a pair that can only ever agree is
 * not a measurement.
 *
 * WHAT THE DEBRIEF NOW SAYS, AND WHY THAT PARAGRAPH WAS REWRITTEN ONCE. When
 * these cases were first rewritten against lane C alone, this block reported
 * two defects in `lessons/debrief.ts`: the uncharged hit landed under «Учебни
 * моменти (не влизат в точките)» with «При повторение вече влиза в изпитния
 * лист» as the last word on it, and it carried no article at all — «ЗДвП чл.
 * 101, ал. 1» was in the charged branch only. Doc 92 §5.6's reason block (lane
 * D) landed while these cases were being mutation-tested, and RE-MEASURING
 * closed both: the block is now «Грешката на този урок (при първа поява не
 * влиза в наказателните точки, но урокът не се зачита)», it carries «→ Защо»,
 * «→ Правилното действие» and «→ Правило: ЗДвП чл. 101, ал. 1», and the repeat
 * sentence is «При повторение вече влиза и в изпитния лист», which is founder
 * answer F1 and true. So the citation assertion is back where it belongs — on
 * the drive the student actually makes — and only the PRICE assertion («основна,
 * 3 наказателни т.») stayed on the control, because on this drive no price is
 * taken. The sentences themselves are lane D's to pin (doc 92 §8.4 T7); what is
 * pinned here is the THEO-4 minimum for this row: the act, what to do instead,
 * and the rule it comes from.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../../contracts";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { scVpTelltaleRedShadowScript } from "../../../traces/scVpTelltaleRed";
import { buildDebrief } from "../../debrief";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { SC_VP_TELLTALE_RED } from "../templates-cockpit2";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

/** ln-v1's northbound right-lane centre — the template pins it by value. */
const RIGHT = 12.19;
/** `rules/engine.ts WARNING_LAMP_REGRADE_SEC` — restated, not imported
 *  (module-private, exactly as the sibling sweep161 files restate theirs). */
const WARNING_LAMP_REGRADE_SEC = 6;

function district(): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));
}

interface Outcome {
  result: LessonResult;
  session: LessonSessionState;
  /** Codes the reducer raised, with the second and whether it was the re-grade. */
  engine: Array<{ code: string; t: number; regrade: boolean }>;
  /** Codes the SESSION billed — what the изпитен лист and the debrief read. */
  billed: Array<{ code: string; t: number }>;
  /** ADR-009: the hits `foldLessonMistakes` read off both records. */
  lessonMistakes: Array<{ code: string; charged: boolean }>;
  debriefText: string;
}

/**
 * ADR-009's OWN CONTROL. `lessonMistakeTargets` is the one field the ruling
 * reads (`lessons/lessonMistake.ts lessonMistakeTargetCodes`), so deleting it
 * from a COPY of the compiled lesson reproduces the pre-ADR-009 product exactly
 * — and nothing else about the drive moves, which is what makes the pair of
 * answers attributable to the ruling and to nothing else. Same pattern, same
 * reason, as `lessons/__tests__/busstop-ban-fail-path.test.ts` §3's.
 */
const stripLessonMistakeTargets = (lesson: LessonSpec): LessonSpec => {
  const copy = { ...lesson };
  delete (copy as { lessonMistakeTargets?: unknown }).lessonMistakeTargets;
  return copy;
};

function driveThroughSession(
  script: DriveScript,
  tweak?: (lesson: LessonSpec) => LessonSpec,
): Outcome {
  const compiled = compileScenario(SC_VP_TELLTALE_RED, 1);
  const lesson = tweak === undefined ? compiled : tweak(compiled);
  let session = createLessonSession(lesson);
  const drive = recordScriptedDrive(district(), script, {
    scenarioId: SC_VP_TELLTALE_RED.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: (SC_VP_TELLTALE_RED.staged ?? []) as never,
    collisionMinKmh: 0,
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  return {
    session,
    result,
    engine: drive.ruleEvents
      .filter((e) => e.kind === "violation")
      .map((e) => ({ code: e.code, t: e.t, regrade: e.regrade === true })),
    billed: session.events
      .filter((e) => e.kind === "violation")
      .map((e) => ({ code: (e as { code: string }).code, t: (e as { t: number }).t })),
    lessonMistakes: (result.lessonMistakes ?? []).map((h) => ({
      code: h.code,
      charged: h.charged,
    })),
    debriefText: buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text,
  };
}

/**
 * THE ROW'S OWN DRIVE: past the red lamp at y = 175 and on down ln-v1 at a
 * lawful 45 км/ч — under the posted 50, so SPEEDING can never join in and the
 * sheet below is the LAMP's price and nothing else, and never braking, so
 * nothing else on the route can be hit either. „Keeps driving without
 * crashing", exactly as filed.
 */
const DRIVE_ON: DriveScript = {
  steps: [{ kind: "drive", points: [[RIGHT, 15], [RIGHT, 392]], targetKmh: 45 }],
};

describe("sc-vp-telltale-red · the ignored red lamp is charged to the LESSON", () => {
  const out = driveThroughSession(DRIVE_ON);
  /** The same drive, pre-ADR-009 — see `stripLessonMistakeTargets`. */
  const control = driveThroughSession(DRIVE_ON, stripLessonMistakeTargets);

  it("this lesson's own mistakes are the two demos' codes — the ruling's premise", () => {
    // Asserted rather than inherited from a report: if the derivation ever
    // stops naming WARNING_LAMP_IGNORED, every ADR-009 case below would go on
    // passing for the pre-ADR-009 reason and measure nothing.
    expect(
      (compileScenario(SC_VP_TELLTALE_RED, 1).lessonMistakeTargets ?? [])
        .map((t) => t.code)
        .sort(),
    ).toEqual(["HARSH_BRAKING_NO_CAUSE", "WARNING_LAMP_IGNORED"]);
  });

  it("the reducer bills the drive-on TWICE: the teach bill, then the re-grade", () => {
    const lamp = out.engine.filter((e) => e.code === "WARNING_LAMP_IGNORED");
    expect(lamp.map((e) => e.regrade)).toEqual([false, true]);
    // The gap IS the constant: six accrued seconds of driving on WITHOUT
    // beginning to slow, after the card the student dismissed.
    expect(lamp[1]!.t - lamp[0]!.t).toBeCloseTo(WARNING_LAMP_REGRADE_SEC, 1);
    // And nothing else was convicted, so the sheet below cannot be some other
    // fault wearing this row's name.
    expect(out.engine.every((e) => e.code === "WARNING_LAMP_IGNORED")).toBe(true);
  });

  /**
   * WHERE THIS CASE USED TO END — `billed === [WARNING_LAMP_IGNORED]`, the
   * half the frame photographed as empty — AND WHY IT MOVED.
   *
   * ADR-009 forbids the charge this re-bill was reaching for on the mistake the
   * lesson exists to teach, so the session drops it and the изпитен лист is
   * empty again. What the re-bill protected — a drive reaching its debrief
   * looking faultless — is now carried by the VERDICT instead, and that is what
   * this case pins: the drive-on is still recorded, still explained, and now
   * costs the whole lesson rather than three точки. The charge itself is
   * measured one case down, on the control.
   */
  it("…and the SESSION withholds the charge, and records the hit instead", () => {
    expect(out.billed).toEqual([]);
    // The live consumer of the record: `buildLessonResult` folds it once
    // (`foldLessonMistakes`), `gradeFinishWire` folds the SAME call over the
    // same two records on the server, and the end screen's verdict, the reason
    // block and the history row all read this field.
    expect(out.lessonMistakes).toEqual([
      { code: "WARNING_LAMP_IGNORED", charged: false },
    ]);
    // `charged: false` is the ruling's «no exam points the first time», and the
    // hit is stamped at the TEACH bill's second — the moment the student was
    // actually told. It is NOT a contrast with the dropped re-bill's second:
    // the fold reads the coached and charged RECORDS, and this drive puts
    // exactly one occurrence on them (asserted three lines down), so earliest
    // and latest are the same number here. The earliest-of-several rule is
    // pinned where several exist — `lessons/__tests__/lessonMistake.test.ts`'s
    // two-occurrence fold case.
    const lamp = out.engine.filter((e) => e.code === "WARNING_LAMP_IGNORED");
    expect(out.result.lessonMistakes?.[0]?.t).toBeCloseTo(lamp[0]!.t, 5);
    // The founder-ratified free mini-lesson is untouched: still shown, still
    // first, and now the only record of the act.
    expect((out.result.coachedMistakes ?? []).map((c) => c.code)).toEqual([
      "WARNING_LAMP_IGNORED",
    ]);
  });

  it("…and it is ADR-009 dropping it: strip the targets and the re-grade bills", () => {
    // THE CONTROL — the frame's own repair, still measured end to end.
    expect(control.billed.map((e) => e.code)).toEqual(["WARNING_LAMP_IGNORED"]);
    // It is the RE-GRADE that lands, not the first bill — the first encounter
    // is still the founder-ratified free mini-lesson, and it is still shown.
    const lamp = control.engine.filter((e) => e.code === "WARNING_LAMP_IGNORED");
    expect(control.billed[0]!.t).toBeCloseTo(lamp[1]!.t, 5);
    expect((control.result.coachedMistakes ?? []).map((c) => c.code)).toEqual([
      "WARNING_LAMP_IGNORED",
    ]);
    // With no targets there is no hit: nothing about this drive is ADR-009's.
    expect(control.lessonMistakes).toEqual([]);
  });

  it("the Наредба № 38 sheet takes NOTHING for the first ignored lamp", () => {
    const s = out.result.summary.score;
    expect(s.osnovniCount).toBe(0);
    expect(s.osnovniPoints).toBe(0);
    expect(s.opasniCount).toBe(0);
    expect(s.vtorostepenniCount).toBe(0);
    expect(s.totalPoints).toBe(0);
    // Still not passed — but NOT only because of ADR-009, so this line is not
    // the ruling's discriminator and must not be read as one: the drive-on
    // never stops, so «Спри напълно вдясно при червената лампа» is unticked and
    // `completedAll` is false on the control too. `lessonMistakes` above is the
    // line that flips with the targets; the ruling's effect on a COMPLETED
    // route is pinned in `lessons/__tests__/lesson-mistake-verdict.test.ts` §1
    // read with its §5, where stripping the targets makes the SAME drive pass.
    // (This used to cite `busstop-ban-fail-path.test.ts` §1; measured
    // 2026-09-18, that section's drives run `completedAll: false` too.)
    expect(out.result.passed).toBe(false);
    expect(out.result.completedAll).toBe(false);
    expect(control.result.completedAll).toBe(false);
  });

  it("…and the sheet underneath is unchanged: ONE основна, three наказателни точки", () => {
    const s = control.result.summary.score;
    expect(s.osnovniCount).toBe(1);
    expect(s.osnovniPoints).toBe(3);
    expect(s.opasniCount).toBe(0);
    expect(s.vtorostepenniCount).toBe(0);
    expect(s.totalPoints).toBe(3);
    expect(control.result.passed).toBe(false);
  });

  it("the debrief names the fault, cites the duty and says what to do instead", () => {
    // THEO-4 / requirement-zero, on the arm the student actually gets: the act,
    // retrieved from the catalogue, the rule it comes from, and the corrective
    // beside it. Not one of these strings is authored here or there — they are
    // `VIOLATIONS[code].titleBg`, `.lawRef` and `.correctiveBg` (ADR-002).
    expect(out.debriefText).toContain("Продължаване с червена контролна лампа");
    expect(out.debriefText).toContain("ЗДвП чл. 101, ал. 1");
    expect(out.debriefText).toContain("спиране плътно вдясно");
    // The old praise is still refused — a shown mistake is not a clean drive.
    expect(out.debriefText).not.toContain("чисто каране без нито едно нарушение");
    // THE PRICE IS THE ONE CLAIM THAT MOVED, and it moved to the control below:
    // «основна, 3 наказателни т.» is a statement about the изпитен лист, and
    // Ruling A takes nothing from it for this first occurrence. Asserting it
    // here would be asserting the ruling had not happened.
    expect(out.debriefText).not.toContain("основна, 3 наказателни т.");
  });

  it("…and the priced, cited row is still measured where a charge exists", () => {
    expect(control.debriefText).toContain("Продължаване с червена контролна лампа");
    expect(control.debriefText).toContain("основна, 3 наказателни т.");
    // Requirement-zero (doc 64 THEO-4) — the rule, retrieved and cited, and the
    // corrective act beside it.
    expect(control.debriefText).toContain("ЗДвП чл. 101, ал. 1");
    expect(control.debriefText).toContain("спиране плътно вдясно");
    expect(control.debriefText).not.toContain("чисто каране без нито едно нарушение");
  });
});

describe("sc-vp-telltale-red · A12: the compliant pull-over is still acquitted", () => {
  const out = driveThroughSession(scVpTelltaleRedShadowScript());

  it("the taught response bills nothing, ticks both tasks and passes", () => {
    expect(out.engine).toEqual([]);
    expect(out.billed).toEqual([]);
    expect((out.result.coachedMistakes ?? []).map((c) => c.code)).toEqual([]);
    expect(out.result.summary.score.totalPoints).toBe(0);
    expect(out.result.objectives.map((o) => o.done)).toEqual([true, true]);
    // ADR-009's OTHER DIRECTION, and the one that matters most on a lesson
    // whose own mistake is armed: the ruling refuses NOTHING here, so «взет» is
    // still reachable by doing the thing the card asks for. A lesson that could
    // not be passed would be the same defect with the sign flipped.
    expect(out.lessonMistakes).toEqual([]);
    expect(out.result.lessonMistakes).toBeUndefined();
    expect(out.result.passed).toBe(true);
  });

  it("…and the re-grade cannot even arm on it — the runner never billed", () => {
    // The arm is the ignore bill and nothing else, so a drive that resolved
    // «yielded» carries no latch for the six-second clock to run on. This is
    // the structural half of the false-conviction guard: the drop test in
    // `orchestrator/__tests__/telltale-stimulus.test.ts` protects the student
    // who ignored the lamp and then started to slow; this protects everyone who
    // never ignored it at all.
    expect(out.engine.some((e) => e.regrade)).toBe(false);
  });
});
