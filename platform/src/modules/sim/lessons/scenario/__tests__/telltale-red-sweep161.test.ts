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
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
  debriefText: string;
}

function driveThroughSession(script: DriveScript): Outcome {
  const lesson = compileScenario(SC_VP_TELLTALE_RED, 1);
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

describe("sc-vp-telltale-red · the ignored red lamp reaches the изпитен лист", () => {
  const out = driveThroughSession(DRIVE_ON);

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

  it("…and the SESSION charges it — the half the frame photographed as empty", () => {
    // The frame's whole complaint: the runner saw it, the sheet never did.
    expect(out.billed.map((e) => e.code)).toEqual(["WARNING_LAMP_IGNORED"]);
    // It is the RE-GRADE that lands, not the first bill — the first encounter
    // is still the founder-ratified free mini-lesson, and it is still shown.
    const lamp = out.engine.filter((e) => e.code === "WARNING_LAMP_IGNORED");
    expect(out.billed[0]!.t).toBeCloseTo(lamp[1]!.t, 5);
    expect((out.result.coachedMistakes ?? []).map((c) => c.code)).toEqual([
      "WARNING_LAMP_IGNORED",
    ]);
  });

  it("the Наредба № 38 sheet reads ONE основна, three наказателни точки", () => {
    const s = out.result.summary.score;
    expect(s.osnovniCount).toBe(1);
    expect(s.osnovniPoints).toBe(3);
    expect(s.opasniCount).toBe(0);
    expect(s.vtorostepenniCount).toBe(0);
    expect(s.totalPoints).toBe(3);
    expect(out.result.passed).toBe(false);
  });

  it("the debrief names the fault, prices it and cites the duty (never a bare verdict)", () => {
    expect(out.debriefText).toContain("Продължаване с червена контролна лампа");
    expect(out.debriefText).toContain("основна, 3 наказателни т.");
    // Requirement-zero (doc 64 THEO-4) — the rule, retrieved and cited, and the
    // corrective act beside it.
    expect(out.debriefText).toContain("ЗДвП чл. 101, ал. 1");
    expect(out.debriefText).toContain("спиране плътно вдясно");
    // The promise that could never be kept must not be the last word on the
    // offence any more: it is charged on this very drive.
    expect(out.debriefText).not.toContain("чисто каране без нито едно нарушение");
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
