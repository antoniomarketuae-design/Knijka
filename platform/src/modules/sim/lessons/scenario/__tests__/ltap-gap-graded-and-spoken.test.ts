/**
 * THE INTERVAL THE BRIEFING COUNTS IN — `sc-turn-left-oncoming:7974670c`
 * (critical), frame `.audit-frames/sweep161/sc-turn-left-oncoming/pc-right/
 * 04-t043s.png`: *„the skill the briefing names — judging an oncoming gap in
 * seconds — is never exercised."*
 *
 * WHAT WAS TRUE OF THE TREE WHEN THIS WAS FILED, and both halves were:
 *
 *  1. THE GATES GRADED NEITHER HALF OF IT. The drill's two success objectives
 *     were «Приближи светофара…» (a place at 40 км/ч) and «Завърши левия завой
 *     и излез от кръстовището на юг» (a place 50 m down the south arm). A
 *     student who cut across the 1.4 s car and collected a −10 «Непропускане»
 *     still ticked BOTH — the same contradiction `requireYieldClean` was built
 *     for on `sc-signal-flashing`, on the one drill in the catalogue whose
 *     whole subject is the oncoming interval.
 *  2. THE SECONDS WERE MEASURED TWICE AND SPOKEN NOWHERE. The runtime's N1
 *     tracker publishes `prioritySituation.gapSec` and
 *     `OncomingLeftTurnRunner` publishes `StagedEventOutcome.acceptedGapSec` —
 *     whose own contract promises „< 3 s lets the scenario rubric coach it".
 *     Neither had a single consumer outside the tests. So the ≤ 2 s cut got a
 *     card, and the 2–4 s turn — legal, under the four-second norm every
 *     surface of this drill teaches, and the exact band the lesson exists to
 *     move — got silence. So did the student who judged it well.
 *
 * §1 crosses the boundary this programme keeps losing repairs to: a term the
 * evaluator reads is still dead until `scenario/params.ts` names it, so the
 * keys are read off the COMPILED rung, not off the template.
 * §2 drives `applyTick` — the entry point `LessonPlayShell` itself calls — with
 * the adjudicator's own event, so `rules/engine.ts` bills the fault for itself.
 * §3 takes the printed sentence out of `objectiveDetailText`, the function
 * `SessionEndScreen.tsx:1485` renders under the objective row.
 *
 * THE MUTATIONS THAT MUST TURN THESE RED: drop `reportOncomingGapSec` from the
 * whitelist in `scenario/params.ts`; drop the detail from `stepReachZone`'s
 * return; put the old placeless banner back on `sc-ltap-turn`.
 */

import { describe, expect, it } from "vitest";
import type { LessonSpec, StagedEventOutcome } from "../../../contracts";
import type { SimTick } from "../../../rules";
import { objectiveDetailText } from "../../../hud/SessionEndScreen";
import { applyStagedOutcome, applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { parseObjectiveParams, type WitnessedReachZoneParams } from "../../objectives";
import type { LessonSessionState } from "../../types";
import { makeTick } from "../../__tests__/fixtures";
import { compileScenario } from "../compile";
import { SC_TURN_LEFT_ONCOMING } from "../templates-junctions";

const TURN_ID = "sc-ltap-turn";
const APPROACH_ID = "sc-ltap-approach";

/** The L3 rung as a student actually receives it — through `compileScenario`. */
const LESSON_L3 = compileScenario(SC_TURN_LEFT_ONCOMING, 3);

function compiledParams(objectiveId: string): WitnessedReachZoneParams {
  const o = LESSON_L3.objectives.find((x) => x.id === objectiveId);
  if (o === undefined) throw new Error(`no compiled objective ${objectiveId}`);
  return parseObjectiveParams(o) as WitnessedReachZoneParams;
}

// ---------------------------------------------------------------------------
// 1 · The compiled rung — the whitelist boundary, not the template
// ---------------------------------------------------------------------------

describe("§1 the terms survive compileScenario and reach the session", () => {
  it("the turn gate carries the yield demand its banner now promises", () => {
    // Derived from the sentence by the shipped matcher, not authored — the same
    // path `sc-jscan-exit` and `sc-sflash-cross` acquire it by.
    expect(compiledParams(TURN_ID).requireYieldClean).toBe("traffic");
    // …and the banner really does say it, so the certificate and the sentence
    // cannot drift apart in a later copy pass.
    const o = LESSON_L3.objectives.find((x) => x.id === TURN_ID)!;
    expect(o.titleBg).toContain("пропуснеш");
    expect(o.titleBg).toContain("насрещните");
  });

  it("the turn gate carries the four-second norm it reports against", () => {
    // 4 is the drill's OWN published figure — instruction 5, `objectiveBg` and
    // `teach.whyBg` all print it. Asserted against those strings rather than
    // against a constant, so a copy pass that softened the norm in words would
    // fail here instead of leaving the debrief quoting a standard the student
    // was never given.
    expect(compiledParams(TURN_ID).reportOncomingGapSec).toBe(4);
    const briefing = SC_TURN_LEFT_ONCOMING.instructionsBg.map((s) => s.textBg).join(" ");
    expect(briefing).toContain("4 секунди");
    expect(SC_TURN_LEFT_ONCOMING.teach.whyBg).toContain("4 секунди");
  });

  it("it is still a bare disc — this repair adds terms, it does not move a mark", () => {
    const p = compiledParams(TURN_ID);
    expect(p.x).toBe(-4.06);
    expect(p.y).toBe(-50);
    expect(p.maxSpeedKmh).toBeUndefined();
    // The approach gate makes no yield claim and acquires no demand: the window
    // this drill refuses inside opens where that gate closes.
    expect(compiledParams(APPROACH_ID).requireYieldClean).toBeUndefined();
    expect(compiledParams(APPROACH_ID).reportOncomingGapSec).toBeUndefined();
  });

  it("the conflict the banner names is really staged, and the demo bills its code", () => {
    // The two halves that make the claim REDEEMABLE (junctions-title-truth.ts):
    // a demand on a drill that stages nothing can never be refused, and a
    // refusal no drive can trip is the dead predicate wearing a repair's coat.
    expect((SC_TURN_LEFT_ONCOMING.staged ?? []).map((e) => e.id)).toContain("sc-ltap-tight");
    expect(
      SC_TURN_LEFT_ONCOMING.mistakes.some((m) => m.codeRefs.includes("FAILED_TO_YIELD")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2 · The live path — applyTick, the reducer LessonPlayShell drives
// ---------------------------------------------------------------------------

/** The two compiled gates on a spec with no pre-drive choreography, so the tick
 *  stream is the only variable. */
function turnLesson(): LessonSpec {
  return {
    id: "t-ltap-gap",
    order: 99,
    titleBg: "Тест ляв завой срещу насрещно",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 105, y: 4.06 }, headingDeg: 270 },
    preDrive: false,
    objectives: [
      LESSON_L3.objectives.find((o) => o.id === APPROACH_ID)!,
      LESSON_L3.objectives.find((o) => o.id === TURN_ID)!,
    ],
  };
}

/** One oncoming-left-turn resolution as the orchestrator hands it to the shell
 *  (`LessonScene.onStagedOutcome` → `applyStagedOutcome`). */
function ltapOutcome(eventId: string, acceptedGapSec: number | undefined): StagedEventOutcome {
  return {
    eventId,
    kind: "oncomingLeftTurn",
    success: acceptedGapSec === undefined || acceptedGapSec >= 4,
    detail: "clear",
    tSec: 40,
    ...(acceptedGapSec !== undefined ? { acceptedGapSec } : {}),
  };
}

/**
 * The east→west approach, the left turn, and the run south — the drill's own
 * route. `failAtY`, when given, reports the priority conflict the runtime's N1
 * adjudicator reports at that point of the southbound leg, so the rule engine
 * bills FAILED_TO_YIELD itself. `outcomes` are applied before the turn leg,
 * which is where the encounter resolves in a real drive.
 */
function driveTurn(
  failAtY: number | null,
  outcomes: readonly StagedEventOutcome[] = [],
): LessonSessionState {
  let s = createLessonSession(turnLesson());
  let t = 0;
  const step = (tick: SimTick): void => {
    s = applyTick(s, tick).state;
    t += 1;
  };
  for (let x = 105; x >= 0; x -= 1) {
    step(makeTick({ t, speedKmh: 20, position: { x, y: 4.06 } }));
  }
  for (const o of outcomes) s = applyStagedOutcome(s, o);
  for (let y = 4; y >= -60; y -= 1) {
    const conflictHere = failAtY !== null && y === failAtY;
    step(
      makeTick({
        t,
        speedKmh: 20,
        position: { x: -4.06, y },
        ...(conflictHere
          ? {
              events: [
                {
                  kind: "prioritySituation" as const,
                  situation: "left-turn-oncoming",
                  violated: true,
                },
              ],
            }
          : {}),
      }),
    );
  }
  return s;
}

describe("§2 the live path grades the interval instead of only the geography", () => {
  it("CLEAN: both tasks tick and the session completes, exactly as shipped", () => {
    const r = buildLessonResult(driveTurn(null));
    expect(r.objectives.map((o) => o.done)).toEqual([true, true]);
    expect(r.completedAll).toBe(true);
  });

  it("REFUSED: the drive billed for cutting the gap loses the turn's tick", () => {
    // This is the whole finding in one assertion. Before the repair this drive
    // ticked ✓✓ under a −10 «Непропускане на пътно превозно средство с
    // предимство» on the same sheet.
    const s = driveTurn(-10);
    const r = buildLessonResult(s);
    expect(r.summary.mistakes.some((m) => m.code === "FAILED_TO_YIELD")).toBe(true);
    expect(r.objectives[0].done).toBe(true);
    expect(r.objectives[1].done).toBe(false);
    expect(r.completedAll).toBe(false);
  });

  it("AND STILL ENDS: the withheld terminal gate does not strand the drive", () => {
    // `sc-ltap-turn` is 2 of 2, so without `yieldFailedVoidsObjective` in the
    // finish gate the student could reach the −10 card that teaches him чл. 37
    // only by quitting and forfeiting the attempt.
    const s = driveTurn(-10);
    expect(s.phase).toBe("completed");
    expect(buildLessonResult(s).passed).toBe(false);
  });

  it("the tightest gap of the encounter reaches the objective row", () => {
    // Two oncoming actors are staged (tight + follow) and both watch the same
    // commit. The gap that decides whether the manoeuvre was safe is the
    // NEAREST one.
    const r = buildLessonResult(
      driveTurn(null, [ltapOutcome("sc-ltap-follow", 6.2), ltapOutcome("sc-ltap-tight", 1.6)]),
    );
    expect(r.objectives[1].detail).toEqual({
      kind: "oncomingGap",
      acceptedGapSec: 1.6,
      normSec: 4,
    });
  });

  it("a resolution with no inbound car reports null, not silence", () => {
    // He waited them all out — the honest reading, and a different sentence
    // from „nothing was measured".
    const r = buildLessonResult(driveTurn(null, [ltapOutcome("sc-ltap-tight", undefined)]));
    expect(r.objectives[1].detail).toEqual({
      kind: "oncomingGap",
      acceptedGapSec: null,
      normSec: 4,
    });
  });

  it("no encounter resolved ⇒ no detail at all, and the approach never carries one", () => {
    // Every fixture, rig and replay lands here, which is why they stay
    // bit-identical. Unknown says nothing rather than guessing.
    const r = buildLessonResult(driveTurn(null));
    expect(r.objectives[1].detail).toBeUndefined();
    expect(r.objectives[0].detail).toBeUndefined();
  });

  it("the report is not a demand: a tight gap alone never withholds the tick", () => {
    // Only the graded −10 refuses. A 1.6 s turn the runtime did not convict
    // (it convicts at ≤ 2 s, but only on its own reading of the world) still
    // completes the route — the row states the seconds, it does not re-judge
    // them.
    const r = buildLessonResult(driveTurn(null, [ltapOutcome("sc-ltap-tight", 1.6)]));
    expect(r.objectives[1].done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3 · The sentence the student actually reads
// ---------------------------------------------------------------------------

describe("§3 the debrief row says the number and what it is for (THEO-4)", () => {
  const line = (acceptedGapSec: number | null): string =>
    objectiveDetailText({ kind: "oncomingGap", acceptedGapSec, normSec: 4 }) ?? "";

  it("under the norm: the figure, the norm, and WHY four seconds", () => {
    const text = line(1.6);
    expect(text).toContain("1.6");
    expect(text).toContain("4");
    // Never a bare verdict: the reason the norm is four is on the same line.
    expect(text).toContain("2–3");
    expect(text.toLowerCase()).toContain("насрещната лента");
  });

  it("at or over the norm: the student who judged it well is told so", () => {
    // The half no surface said at all before — a correct gap judgment was
    // indistinguishable from having met no car.
    const text = line(6.2);
    expect(text).toContain("6.2");
    expect(text).toContain("над нормата");
    expect(line(4)).toContain("над нормата");
  });

  it("nothing inbound: it says that, and does not print a phantom interval", () => {
    const text = line(null);
    expect(text).toContain("нямаше насрещен");
    expect(text).not.toMatch(/\d+[.,]\d/);
  });
});
