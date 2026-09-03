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
});
