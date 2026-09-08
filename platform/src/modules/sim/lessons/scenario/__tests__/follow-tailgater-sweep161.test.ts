/**
 * sc-follow-tailgater — THE AUDIT'S WRONG LEG, DRIVEN THROUGH THE SESSION AND
 * THE DEBRIEF (`sc-follow-tailgater:63c0c28c`, critical, filed against
 * `rules/engine.ts` off `.audit-frames/sweep161/sc-follow-tailgater/pc-wrong/
 * 08-debrief.png`, 2026-08-17).
 *
 * WHAT THE FRAME SAID: «0 наказателни точки · Опасни 0 · Основни 0 ·
 * Второстепенни 0 · НЕИЗДЪРЖАН», the verdict resting on nothing but «Не всички
 * задачи от маршрута бяха изпълнени», under «Какво се получи добре: чисто
 * каране без нито едно нарушение — задръж това ниво» — over a drive whose own
 * `run.log` reads «top 59 км/ч · 0 full stops» on a boulevard posted 50
 * (`content/world/ln-v1.json`, `ln-e-road` maxspeed 50).
 *
 * WHY IT WAS SILENT, AND IT WAS NEVER THE BANDS. `speedingBands` puts
 * второстепенна at 55 here, so a held 59 qualified from the first drive beat and
 * `reduceTick` DID raise SPEEDING_OVER_LIMIT. It raised it ONCE: the code is
 * второстепенна, the founder-ratified teach-first ruling hands a first encounter
 * to the student as a free mini-lesson (`scenarios/policy.ts` + `coach.ts`), and
 * the only second bill available was `speedingRepeatSec` = 20 s — longer than
 * the gradeable window of this lesson. One bill, spent on the card, nothing on
 * the sheet.
 *
 * THE REPAIR IS NOT IN THIS FILE AND IS NOT THIS LANE'S. `rules/engine.ts`
 * SPEED_REGRADE_SEC (introduced by c317a68, 2026-08-27 — ten days AFTER this
 * frame; reset semantics tightened by 0258c01) bills a continuing overspeed a
 * second time six driving seconds after the first, marked `regrade: true`, and
 * `lessons/engine.ts` charges it exactly where the first bill was never charged.
 * The sibling lane's `signals-sweep161.test.ts` names this drill as one of the
 * five legs that should move and says so honestly: „that is an inference off
 * timestamps, not an attestation; the drive settles it." THIS FILE IS THAT
 * DRIVE — and on `sc-signal-hesitation` the inference was WRONG (its route runs
 * out at 12.6 s, before the re-grade at 14.9 s), so the question genuinely had
 * to be asked of each lesson separately rather than answered once.
 *
 * MEASURED HERE, through compileScenario(L1) → createLessonSession → applyTick
 * on every production frame → buildLessonResult → buildDebrief, i.e. the same
 * chain `LessonPlayShell.tsx` and `app/(dashboard)/simulator/actions.ts` run:
 *
 *   engine   SPEEDING_OVER_LIMIT @ 8,93 s  ·  SPEEDING_OVER_LIMIT @ 14,93 s (regrade)
 *   session  SPEEDING_OVER_LIMIT @ 14,93 s
 *   sheet    Второстепенни 1 · Общо 1 наказателна точка
 *   debrief  «Превишена скорост — второстепенна, 1 наказателна т.»
 *
 * WHY THE OTHER TWO LEGS ARE HERE. The row also says the лесson's two authored
 * mistakes „produced no fault at all", so both are driven through the same
 * chain rather than through the recorder alone — which is the gap
 * `s3-fo2-bot-completion.test.ts` leaves open: it asserts against
 * `drive.ruleEvents` (what the reducer saw) and never against `session.events`
 * (what the sheet was told), and those two lists are exactly what the frame
 * shows diverging. The brake-check's HARSH_BRAKING_NO_CAUSE is основна and its
 * first encounter is STILL uncharged — that is the teach-first ruling, not a
 * defect, and a single act has no „continuing breach" for a re-grade to reach —
 * so what is pinned there is that the student is TOLD, by name, instead of
 * being handed the frame's unqualified «чисто каране без нито едно нарушение».
 *
 * A12 — the shadow is driven too. A pin that only demanded a conviction could
 * be satisfied by convicting everybody; the correct drive must still leave the
 * sheet empty and both route tasks ticked.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import {
  recordScFollowTailgaterDrive,
  scFollowTailgaterShadowScript,
} from "../../../traces/scFollowTailgater";
import { buildDebrief } from "../../debrief";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import type { LessonResult, LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { SC_FOLLOW_TAILGATER } from "../templates-following";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

/** ln-v1's northbound right-lane centre — the spawn's own x. */
const RIGHT = 12.19;
/** `rules/engine.ts SPEED_REGRADE_SEC` — restated, not imported (module-private). */
const SPEED_REGRADE_SEC = 6;

function district(): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));
}

interface Outcome {
  session: LessonSessionState;
  result: LessonResult;
  /** Codes the reducer raised, with the second and whether it was the re-grade. */
  engine: Array<{ code: string; t: number; regrade: boolean }>;
  /** Codes the SESSION billed — what the изпитен лист and the debrief read. */
  billed: Array<{ code: string; t: number }>;
  /** The last second the drive produced a frame for. */
  driveEndSec: number;
  debriefText: string;
}

function driveThroughSession(script: DriveScript): Outcome {
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, 1);
  let session = createLessonSession(lesson);
  let lastTickSec = 0;
  const drive = recordScriptedDrive(district(), script, {
    scenarioId: SC_FOLLOW_TAILGATER.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: (SC_FOLLOW_TAILGATER.staged ?? []) as never,
    collisionMinKmh: 0,
    onTick: (tick) => {
      lastTickSec = tick.t;
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  return {
    session,
    result,
    driveEndSec: lastTickSec,
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
 * THE AUDIT'S OWN WRONG LEG (`tools/mobile/lesson-audit.mjs`: „`wrong` is one
 * act: hold the throttle and never touch the brake"), at the 59 км/ч the drive
 * mode leaves it at. It stops short of the front lead's catch-up point (~y 333
 * on this staging) so the reckless drive is graded on its SPEED and not on a
 * kinematic rear-end the recorder does not model — the fault the row is about.
 */
const RECKLESS: DriveScript = {
  steps: [
    { kind: "drive", points: [[RIGHT, 15], [RIGHT, 300]], targetKmh: 59 },
    { kind: "pause", sec: 1, brake: true },
  ],
};

describe("sc-follow-tailgater · the audit's wrong leg reaches the изпитен лист", () => {
  const out = driveThroughSession(RECKLESS);

  it("the reducer bills the 59-in-a-50 TWICE: the teach bill, then the re-grade", () => {
    const speeding = out.engine.filter((e) => e.code === "SPEEDING_OVER_LIMIT");
    expect(speeding.map((e) => e.regrade)).toEqual([false, true]);
    // The gap IS the constant: six driving seconds after the card the student
    // dismissed. Shortening it turns a re-grade into grade-on-sight, which is
    // the founder-ratified teach-first ruling and not this file's to move.
    expect(speeding[1]!.t - speeding[0]!.t).toBeCloseTo(SPEED_REGRADE_SEC, 1);
    expect(out.engine.some((e) => e.code === "SPEEDING_DANGEROUS")).toBe(false);
  });

  it("…and the SESSION charges it — the half the frame photographed as empty", () => {
    // The frame's whole complaint: the reducer saw it, the sheet never did.
    expect(out.billed.map((e) => e.code)).toEqual(["SPEEDING_OVER_LIMIT"]);
    // It is the re-grade that lands, not the first bill — the first is still
    // the free mini-lesson.
    const speeding = out.engine.filter((e) => e.code === "SPEEDING_OVER_LIMIT");
    expect(out.billed[0]!.t).toBeCloseTo(speeding[1]!.t, 5);
    // …AND NOTHING ELSE COULD HAVE BILLED IT. `speedingRepeatSec` is 20 s and
    // this drive is shorter than that, which is the whole reason the frame was
    // empty. So this charge exists because of the re-grade or not at all —
    // the assertion above is directional, not a coincidence of cadence.
    expect(out.driveEndSec).toBeLessThan(speeding[0]!.t + 20);
  });

  it("…INSIDE the drive, not after it — the clause that made the sibling leg free", () => {
    // `sc-signal-hesitation` emits the SAME re-grade at 14,9 s and its route
    // runs out at 12,6 s, so nothing ever reaches its sheet: a drill whose
    // whole gradeable window after the card is under six seconds is still
    // free. That is a fact about each drill separately, so it is measured here
    // rather than inherited — this leg's re-grade lands with seconds to spare
    // and the session was still grading, which is why `billed` carries it.
    const regrade = out.engine.find((e) => e.code === "SPEEDING_OVER_LIMIT" && e.regrade)!;
    expect(out.driveEndSec).toBeGreaterThan(regrade.t + 1);
    expect(out.session.endedAtSec === null || out.session.endedAtSec > regrade.t).toBe(true);
  });

  it("the Наредба № 38 sheet reads ONE второстепенна, one наказателна точка", () => {
    const s = out.result.summary.score;
    expect(s.vtorostepenniCount).toBe(1);
    expect(s.vtorostepenniPoints).toBe(1);
    expect(s.osnovniCount).toBe(0);
    expect(s.opasniCount).toBe(0);
    expect(s.totalPoints).toBe(1);
  });

  it("the debrief names the fault and prices it, instead of praising a clean sheet", () => {
    expect(out.debriefText).toContain("Превишена скорост");
    expect(out.debriefText).toContain("второстепенна, 1 наказателна т.");
    // Requirement-zero (doc 64 THEO-4): the measured numbers, not a verdict.
    expect(out.debriefText).toContain("при ограничение 50 km/h");
    expect(out.debriefText).not.toContain("чисто каране");
  });
});

describe("sc-follow-tailgater · the authored brake-check is TOLD, by name", () => {
  // The committed „Спирачен удар „за урок“" demo, driven live through the
  // session rather than read off its trace file.
  const brake = (() => {
    const lesson = compileScenario(SC_FOLLOW_TAILGATER, 1);
    let session = createLessonSession(lesson);
    const drive = recordScFollowTailgaterDrive(district(), "mistake-brake-check", {
      onTick: (tick) => {
        session = applyTick(session, tick).state;
      },
    });
    const result = buildLessonResult(session);
    return {
      engine: drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code),
      billed: session.events.filter((e) => e.kind === "violation").map((e) => (e as { code: string }).code),
      coached: (result.coachedMistakes ?? []).map((c) => c.code),
      objectives: result.objectives.map((o) => [o.id, o.done] as const),
      passed: result.passed,
      text: buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text,
    };
  })();

  it("the reducer convicts the phantom slam (the rear car is not a forward cause)", () => {
    expect(brake.engine).toContain("HARSH_BRAKING_NO_CAUSE");
  });

  it("a FIRST encounter is taught and not charged — the teach-first ruling, stated", () => {
    // Not a defect and not silently accepted: основна, first encounter, a
    // single ACT with no continuing breach for a re-grade to reach. The
    // debrief has to say so out loud, which is the next assertion.
    expect(brake.billed).toEqual([]);
    expect(brake.coached).toContain("HARSH_BRAKING_NO_CAUSE");
  });

  /**
   * THE OTHER HALF THE FRAME PHOTOGRAPHED, AND THE ONE STILL OPEN AT w26
   * (`requireBrakingClean` — lessons/types.ts carries the design note).
   *
   * The row says the лесson's authored brake check „produced no fault at all".
   * The teach-first ruling answers the SHEET half of that and is not a defect
   * (the assertion above). It says nothing about the CERTIFICATE, and measured
   * before this repair the certificate was worse than empty: «✓ Успокой
   * темпото», «✓ Стигни края на отсечката», «Урокът е издържан» — awarded to the
   * drive that performed the one act instructions 3 and 6 forbid, and awarded
   * BECAUSE of it, since a car stamped to a standstill reads better against a
   * 36 км/ч cap than one easing off. The demo of the mistake certified itself.
   */
  it("…and the calm-pace certificate is WITHHELD: a brake check is not a calmed pace", () => {
    expect(brake.objectives).toEqual([
      ["sc-ftg-ease", false],
      ["sc-ftg-finish", false],
    ]);
    expect(brake.passed).toBe(false);
    // The refusal is not a trap: the route is unfinished, so the debrief says
    // WHICH tasks are open rather than printing a green verdict over a slam.
    expect(brake.text).toContain("не е завършен");
    expect(brake.text).toContain("«Успокой темпото»");
    expect(brake.text).not.toContain("е издържан");
  });

  it("…so the debrief prints it under «Учебни моменти», never as a clean drive", () => {
    expect(brake.text).toContain("Учебни моменти (не влизат в точките)");
    expect(brake.text).toContain("Рязко спиране без причина");
    expect(brake.text).toContain("При повторение вече влиза в изпитния лист");
    // The frame's exact sentence, and it must never come back unqualified.
    expect(brake.text).not.toContain("чисто каране без нито едно нарушение — задръж това ниво");
  });
});

describe("sc-follow-tailgater · A12: the correct drive is still acquitted", () => {
  const out = driveThroughSession(scFollowTailgaterShadowScript());

  it("the taught response bills nothing and ticks both route tasks", () => {
    expect(out.engine).toEqual([]);
    expect(out.billed).toEqual([]);
    expect(out.result.summary.score.totalPoints).toBe(0);
    expect(out.result.objectives.map((o) => o.done)).toEqual([true, true]);
  });

  /**
   * THE FALSE-REFUSAL CHECK FOR `requireBrakingClean`, and it is not a
   * restatement of the assertion above: the shadow brakes to a standstill TWICE
   * (`scFollowTailgaterShadowScript` — a 1,5 s braked pause at the finish, and
   * the deceleration from 42 to 28 км/ч mid-street), so if the new demand read
   * raw deceleration instead of the conviction it would refuse the drive the
   * drill exists to teach. It reads the conviction, and there is none.
   */
  it("…and the new brake demand refuses nothing on it — no conviction, no refusal", () => {
    expect(out.engine.some((e) => e.code === "HARSH_BRAKING_NO_CAUSE")).toBe(false);
    // The stop arm of the same demand, on the same shadow and for the same
    // reason: the halts are short and the road ahead is open, so the reducer
    // convicts nothing and the demand has nothing to read.
    expect(out.engine.some((e) => e.code === "STOPPED_WITHOUT_CAUSE")).toBe(false);
    expect((out.result.coachedMistakes ?? []).map((c) => c.code)).toEqual([]);
    expect(out.result.passed).toBe(true);
  });
});

/**
 * THE OTHER HALF OF «THE WRONG DRIVE ESCAPES ENTIRELY», RE-PHOTOGRAPHED AT HEAD
 * (`sc-follow-tailgater:63c0c28c`, the same row, w28).
 *
 * The speeding half above is repaired and the frames prove it. The row's own
 * headline — «0 наказателни точки, 0 опасни, 0 основни, 0 второстепенни» — was
 * NOT, and w27 re-drove the wrong leg at `85495fd` to say so:
 * `.audit-frames/w27/frames/sc-follow-tailgater__pc-wrong` reads «top 58 км/ч ·
 * 3 full stops», «WRONG-LEG RESTS: 3 careless full stops, each held 8s
 * (FLAT_REST_EVERY_M = 45 m)» — and «ИЗДЪРЖАН · 0 наказателни точки · 3 от 3
 * звезди» under «★ ✓ Чисто и спокойно каране».
 *
 * THE SPEEDING SILENCE THERE IS THE DRIVER, NOT THE CODE, and it is stated so it
 * cannot be mistaken for a defect: that leg rests every 45 m, so it crosses the
 * graced 55 only in the last fraction of each 45 m sprint and never holds it for
 * `speedingMinorSustainSec`. The bill above fires on a HELD 59 and this drive
 * never held one.
 *
 * THE STANDSTILL IS THE PRODUCT. On the one drill whose instructions 3, 4 and 6
 * say the answer to a лепка is the throttle and never the brake, coming to a
 * dead stop in the live lane with a car five metres off the bumper was the one
 * act nothing graded — because `STOPPED_WITHOUT_CAUSE` ships disarmed and,
 * armed, could not have fired anyway: its reason list inherits the CRAWL's lead
 * arm, which acquits at ANY distance, and this drill stages a constant cruiser
 * in the player's own lane for the first 94 s of every drive. Both halves are
 * repaired — `ruleConfig` here, `leadQueueAhead` in rules/engine.ts — and the
 * boundary that moved is pinned in `rules/__tests__/needless-stop.test.ts`.
 */
const CARELESS_RESTS: DriveScript = {
  steps: (() => {
    const steps: DriveScript["steps"] = [];
    for (let y = 15; y < 345; y += 45) {
      steps.push({ kind: "drive", points: [[RIGHT, y], [RIGHT, Math.min(y + 45, 345)]], targetKmh: 58 });
      steps.push({ kind: "pause", sec: 8, brake: true });
    }
    return steps;
  })(),
};

/** The same route driven with rests too short to be a parked car. */
const BRIEF_RESTS: DriveScript = {
  steps: (() => {
    const steps: DriveScript["steps"] = [];
    for (let y = 15; y < 345; y += 45) {
      steps.push({ kind: "drive", points: [[RIGHT, y], [RIGHT, Math.min(y + 45, 345)]], targetKmh: 58 });
      steps.push({ kind: "pause", sec: 3, brake: true });
    }
    return steps;
  })(),
};

describe("sc-follow-tailgater · the careless rest reaches the изпитен лист", () => {
  it("the drill ARMS the code, at every rung — it ships disarmed everywhere else", () => {
    expect(SC_FOLLOW_TAILGATER.ruleConfig?.needlessStopEnabled).toBe(true);
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(compileScenario(SC_FOLLOW_TAILGATER, level).ruleConfig?.needlessStopEnabled, `L${level}`).toBe(true);
    }
  });

  const out = driveThroughSession(CARELESS_RESTS);

  it("the FIRST rest is the free mini-lesson, and the ones after it are charged", () => {
    // Teach-first is untouched: one card, then the sheet. Each rest is its own
    // act (`needlessStopReset` re-arms on driving off), which is why repeats bill
    // where one continuing overspeed needed the re-grade.
    expect((out.result.coachedMistakes ?? []).map((c) => c.code)).toEqual(["STOPPED_WITHOUT_CAUSE"]);
    expect(out.billed.map((e) => e.code)).toContain("STOPPED_WITHOUT_CAUSE");
    expect(out.billed.length).toBeGreaterThan(1);
    const coachedAt = (out.result.coachedMistakes ?? [])[0]!.t;
    expect(out.billed[0]!.t).toBeGreaterThan(coachedAt);
  });

  it("…so the sheet is no longer «0 наказателни точки» on the leg the row named", () => {
    const s = out.result.summary.score;
    expect(s.vtorostepenniCount).toBeGreaterThan(0);
    expect(s.totalPoints).toBe(s.vtorostepenniCount);
    expect(s.opasniCount).toBe(0);
  });

  it("…and the debrief names it, prices it and cites the duty (never a bare verdict)", () => {
    expect(out.debriefText).toContain("Спиране без причина");
    expect(out.debriefText).toContain("ЗДвП чл. 24, ал. 2");
    // The frame's own sentence about this drive, and it must not survive.
    expect(out.debriefText).not.toContain("чисто каране без нито едно нарушение");
  });

  /**
   * THE CERTIFICATE HALF, AND IT OUTLIVED THE SHEET HALF BY A WHOLE WAVE.
   *
   * Wave 25 armed `STOPPED_WITHOUT_CAUSE` here and taught the reducer's lead
   * exemption the difference between a queue and a cruiser leaving, so this leg
   * стопped escaping the изпитен лист — and w28 re-drove it at `6363677` to say
   * so: «2 наказателни точки», two named второстепенни
   * (`.audit-frames/w28/frames/sc-follow-tailgater__pc-wrong`). The SAME frame
   * also reads «ИЗДЪРЖАН · ✓ Успокой темпото 1:09 · ✓ Стигни края на отсечката».
   *
   * Measured here at `e08d917` before this repair: scored
   * `[STOPPED_WITHOUT_CAUSE ×5]`, 5 наказателни точки — and both route tasks ✓,
   * `passed: true`, «Урокът е издържан». The drill whose instructions 3, 4 and 6
   * say the answer to a лепка is the throttle and never the brake was
   * certifying «успокой темпото» to a driver who calmed it by standing dead in a
   * live lane with the лепка five metres off the bumper, FIVE times.
   *
   * `requireBrakingClean` existed and did not reach it: it read only
   * `HARSH_BRAKING_NO_CAUSE`. Its own design note argues that a speed cap reads
   * BETTER on a car stamped to a standstill than on one easing off — which is
   * exactly what a dead stop is, at the intensity the cap rewards most. So the
   * demand now reads both convictions (lessons/objectives.ts
   * `brakingCleanHonoured`, fed by `lessons/engine.ts stoppedWithoutCauseInRun`).
   */
  it("…and the «Успокой темпото» certificate is WITHHELD from the leg it convicted", () => {
    expect(out.result.objectives.map((o) => [o.id, o.done] as const)).toEqual([
      ["sc-ftg-ease", false],
      ["sc-ftg-finish", false],
    ]);
    expect(out.result.passed).toBe(false);
    // The refusal is not a trap and not a bare verdict: the debrief says the
    // lesson is unfinished and names the task that is still open, beside the
    // priced row and its чл. 24, ал. 2 asserted two tests up.
    expect(out.debriefText).toContain("не е завършен");
    expect(out.debriefText).toContain("«Успокой темпото»");
    expect(out.debriefText).not.toContain("е издържан");
  });

  it("…and the sheet is UNCHANGED by the refusal — the drive still grades to the end", () => {
    // A withheld tick must not shorten the gradeable window and quietly take
    // convictions off the лист with it: five rests, five bills, same as before.
    expect(out.billed.filter((e) => e.code === "STOPPED_WITHOUT_CAUSE").length).toBe(5);
  });

  it("A12 — a brief halt is not a parked car: the same route, shorter rests, acquitted", () => {
    const brief = driveThroughSession(BRIEF_RESTS);
    expect(brief.billed).toEqual([]);
    expect((brief.result.coachedMistakes ?? []).map((c) => c.code)).toEqual([]);
    expect(brief.result.summary.score.totalPoints).toBe(0);
    // …AND THE WIDENED DEMAND REFUSES NOTHING ON IT. Same route, same eight
    // halts, rests of 3 s instead of 8 s: no conviction, so no refusal. This is
    // the false-refusal check for the stop arm, and it is the one that matters —
    // the arm reads a conviction, never a speed sample, so the boundary that
    // decides the tick is `needlessStopSustainSec` and nothing else.
    expect(brief.result.objectives.map((o) => o.done)).toEqual([true, true]);
    expect(brief.result.passed).toBe(true);
  });
});
