/**
 * SWEEP 161 — „TWO LESSONS CONVICT NOTHING AT ALL": sc-sig-controller-postures,
 * and the clock that acquits everybody.
 *
 * THE FINDING, in the audit's words: «The wrong drive passes the traffic
 * controller at 59 км/ч ignoring the posture entirely and collects 0
 * наказателни точки and 0 mistakes on both platforms. The one behaviour the
 * lesson exists to punish — driving past a regulating officer without reading
 * him — is not graded at all.» The careful leg of the same sweep gets ИЗДЪРЖАН
 * 0 т. and three stars. One verdict for two opposite drives.
 *
 * THE CAUSE IS NOT THE MAP, THE RULE, THE ACTOR OR THE LIMIT — all four are
 * armed and provably work. It is WHEN the officer's timetable is counted from.
 * `ScenarioDirectorImpl` stages every runner in its constructor, so
 * `setSignalClusterController` is posted at SCENE MOUNT, and the clock
 * `controllerPermission` compares `flipAtSec` against advances on every
 * unpaused frame from then on — through the arrival card, the briefing, the
 * touch hint and the 51-second L1 demonstration that auto-plays before the
 * student touches the throttle. The sweep's own desktop frames time that dead
 * stretch at 36 s (the ghost demo transport reads 0:37 / 0:51 in `04-t001s.png`
 * of both pc-right and pc-wrong); `flipAtSec` is 30. The single authored flip
 * has therefore already fired, the halt has moved to the OTHER axis for the
 * rest of the session, and every crossing the student will ever make carries
 * controller "proceed". CONTROLLER_SIGNAL_VIOLATED — the only code this
 * template can produce — is unreachable, so the drill cannot fail anybody and
 * cannot honestly pass anybody either.
 *
 * The phone frames say the same thing without a stopwatch:
 * `mobile-right/04-t002s.png` already paints the SIDE-PROFILE bubble
 * («МИНАВАШ ТИ»), which TrafficLayer picks off `fig.halted` — the flip had
 * fired by the student's second metre, in a drill whose instruction 3 asserts
 * the officer is chest-on.
 *
 * WHAT EACH SECTION IS FOR:
 *   §1 THE DEFECT, REPRODUCED THROUGH THE PRODUCTION STACK. Same drive, two
 *      dead times, opposite verdicts — so the verdict is a fact about the
 *      briefing's length, not about the driving. This is the section that must
 *      be INVERTED (not deleted) when the runner fix lands: the whole point of
 *      the fix is that 36 s of briefing stops changing the grade.
 *   §2 THE CURE, PROVED IN BOTH DIRECTIONS AT FOUR DEAD TIMES. The schedule is
 *      handed to the recorder REBASED onto the drive start — arithmetically
 *      what `input.tSec + spec.flipAtSec` computes inside the runner — and the
 *      reckless drive is convicted at every dead time while the careful drive
 *      still passes at every dead time. No engine file is touched to prove it:
 *      the rebase is expressed in the authored `TrafficControllerSpec` the
 *      recorder already accepts.
 *   §3 WHY THE CURE CANNOT BE A BIGGER CONSTANT. Measured, not argued.
 *
 * THE FIX ITSELF IS ONE LATCH IN A FILE THIS LANE DOES NOT OWN
 * (orchestrator/runners.ts, TrafficControllerRunner): stop posting `flipAtSec`
 * in `stage()`; post the halt alone, and on the first `step()` frame the player
 * is genuinely under way, re-post the schedule with `flipAtSec =
 * input.tSec + spec.flipAtSec`. The committed traces start driving at t ≈ 0, so
 * the rebase lands on the authored 30 and every §5/§9 gate keeps its exact
 * codes and times.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TrafficControllerSpec } from "../../../contracts";
import type { SimTickEvent } from "../../../rules";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { compileScenario } from "../compile";
import {
  SC_SIG_CONTROLLER_POSTURES,
  SC_SIG_CONTROLLER_POSTURES_EVENT,
} from "../templates-signals2";
import type { ScenarioLevel } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const sxDistrict = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "sx-v1.json"), "utf-8"),
) as unknown;

/** Drawn northbound lane centre of sx-v1's ns road, m (battery sx-district). */
const LANE = 4.0625;
/** South spawn, m — 77.3 m short of the 27.725 m stop line. */
const SPAWN_Y = -105;
/** Rest pose short of the stop line (the shipped shadow's own hold). */
const HOLD_Y = -31;

/**
 * The dead stretch between scene mount and the student's first metre, s —
 * MEASURED off sweep 161's desktop frames, not assumed: the ghost demo's
 * transport reads 0:37 / 0:51 in `04-t001s.png` of BOTH
 * sc-sig-controller-postures/pc-right and /pc-wrong.
 */
const MEASURED_PRE_DRIVE_SEC = 36;

/** Dead times the cure must survive: a student who skips everything, one who
 *  sits through part of the demo, the measured sweep, and one who reads. */
const DEAD_TIMES_SEC = [0, 12, MEASURED_PRE_DRIVE_SEC, 60] as const;

/** The sweep's reckless leg: full throttle, straight north, no reading. */
const RECKLESS_KMH = 59;

type LineCrossing = Extract<SimTickEvent, { kind: "stopLineCrossed" }>;

interface DriveOutcome {
  /** Every trafficLight stop-line crossing the runtime emitted, with its time. */
  crossings: Array<{ tSec: number; controller?: "halt" | "proceed"; lamp?: string }>;
  /** Codes the LESSON SESSION billed (not the recorder's own grader). */
  sessionCodes: string[];
  score: number;
  passed: boolean;
  objectivesDone: boolean[];
}

/** A pre-drive that burns world clock exactly as the briefing does: the car
 *  sits at the spawn on the brake while `runtime.update(dt)` keeps running. */
function deadTime(sec: number): DriveScript["steps"] {
  return sec > 0 ? [{ kind: "pause", sec, brake: true }] : [];
}

/** The audit's wrong leg: 59 км/ч from the spawn, straight through the box. */
function recklessScript(preDriveSec: number): DriveScript {
  return {
    steps: [
      ...deadTime(preDriveSec),
      {
        kind: "drive",
        points: [
          [LANE, SPAWN_Y],
          [LANE, 60],
        ],
        targetKmh: RECKLESS_KMH,
      },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/**
 * The audit's right leg, in the shape the drill asks for: a slow approach, a
 * real stop short of the paint, a wait long enough to outlast the authored
 * 30 s posture hold, then a decisive crossing. Authored here rather than
 * imported from traces/scSigControllerPostures.ts on purpose — the committed
 * shadow's wait is tuned to a flip that fires at t = 30 of the SESSION, and
 * this battery's whole subject is what happens when that is no longer when the
 * student arrives.
 */
function carefulScript(preDriveSec: number): DriveScript {
  return {
    steps: [
      ...deadTime(preDriveSec),
      {
        kind: "drive",
        points: [
          [LANE, SPAWN_Y],
          [LANE, -38],
        ],
        targetKmh: 22,
      },
      {
        kind: "drive",
        points: [
          [LANE, -38],
          [LANE, HOLD_Y],
        ],
        targetKmh: 8,
      },
      { kind: "pause", sec: 20, brake: true },
      {
        kind: "drive",
        points: [
          [LANE, HOLD_Y],
          [LANE, 0],
          [LANE, 30],
          [LANE, 48],
        ],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

/**
 * The rebased schedule: the flip counted from the moment the drive starts
 * instead of from scene mount — arithmetically identical to what
 * `input.tSec + spec.flipAtSec` yields inside the runner on the first moving
 * frame. Nothing else about the spec moves, so anything this changes is the
 * clock and only the clock.
 */
function rebased(preDriveSec: number): TrafficControllerSpec {
  return {
    ...SC_SIG_CONTROLLER_POSTURES_EVENT,
    flipAtSec: SC_SIG_CONTROLLER_POSTURES_EVENT.flipAtSec! + preDriveSec,
  };
}

/** Drive a script through the FULL production pipeline the live app runs:
 *  compileScenario → recordScriptedDrive (runtime + director + staged runner)
 *  → createLessonSession/applyTick on every tick → buildLessonResult. */
function drive(
  script: DriveScript,
  staged: TrafficControllerSpec,
  level: ScenarioLevel = 1,
): DriveOutcome {
  const lesson = compileScenario(SC_SIG_CONTROLLER_POSTURES, level);
  let session = createLessonSession(lesson);
  const crossings: DriveOutcome["crossings"] = [];
  recordScriptedDrive(sxDistrict, script, {
    scenarioId: SC_SIG_CONTROLLER_POSTURES.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: [staged],
    collisionMinKmh: 0,
    onTick: (tick) => {
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") {
          const line = e as LineCrossing;
          crossings.push({ tSec: tick.t, controller: line.controller, lamp: line.lightState });
        }
      }
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  return {
    crossings,
    sessionCodes: session.events
      .filter((e) => e.kind === "violation")
      .map((e) => (e as { code: string }).code),
    score: result.score,
    passed: result.passed,
    objectivesDone: result.objectives.map((o) => o.done),
  };
}

// ---------------------------------------------------------------------------
// §1 — THE DEFECT: the verdict is decided by the briefing's length
// ---------------------------------------------------------------------------

describe("§1 sc-sig-controller-postures — the acquittal is the clock's, not the driver's", () => {
  const shipped = SC_SIG_CONTROLLER_POSTURES_EVENT;

  it("the mechanic itself works: with no dead time the 59 км/ч drive is convicted 10 т.", () => {
    const out = drive(recklessScript(0), shipped);
    expect(out.crossings).toHaveLength(1);
    expect(out.crossings[0].controller).toBe("halt");
    expect(out.crossings[0].tSec).toBeLessThan(shipped.flipAtSec!);
    // Опасна грешка, graded on the spot — the code the template authors.
    expect(out.sessionCodes).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
    expect(out.score).toBe(10);
    expect(out.passed).toBe(false);
  });

  it("THE FINDING: with the measured 36 s of briefing the SAME drive bills nothing", () => {
    const out = drive(recklessScript(MEASURED_PRE_DRIVE_SEC), shipped);
    expect(out.crossings).toHaveLength(1);
    // The single authored flip fired while the demonstration was playing, so
    // the halt now sits on the cross axis and this approach is permitted.
    expect(out.crossings[0].controller).toBe("proceed");
    expect(out.crossings[0].tSec).toBeGreaterThan(shipped.flipAtSec!);
    // …and the officer's permission OUTRANKS the lamp, which the runtime is
    // reporting as red at that instant — so a 59 км/ч run over a red light in
    // front of a регулировчик is innocent on every axis the lesson has.
    expect(out.crossings[0].lamp).toBe("red");
    expect(out.sessionCodes).toEqual([]);
    // «0 наказателни точки · mistakes=0 · top 59 км/ч», reproduced headlessly.
    expect(out.score).toBe(0);
  });

  it("…and it is not a rung effect: L3 acquits the same drive on the same clock", () => {
    expect(drive(recklessScript(MEASURED_PRE_DRIVE_SEC), shipped, 3).sessionCodes).toEqual([]);
    expect(drive(recklessScript(0), shipped, 3).sessionCodes).toEqual([
      "CONTROLLER_SIGNAL_VIOLATED",
    ]);
  });

  it("the careful drive gets the same permission — so the pass is as hollow as the acquittal", () => {
    const careful = drive(carefulScript(MEASURED_PRE_DRIVE_SEC), shipped);
    const reckless = drive(recklessScript(MEASURED_PRE_DRIVE_SEC), shipped);
    expect(careful.crossings[0].controller).toBe("proceed");
    expect(reckless.crossings[0].controller).toBe("proceed");
    // Two opposite drives, one verdict: nobody read anything and nobody was
    // measured reading anything.
    expect(careful.sessionCodes).toEqual(reckless.sessionCodes);
  });
});

// ---------------------------------------------------------------------------
// §2 — THE CURE: the flip counted from the drive, proved in both directions
// ---------------------------------------------------------------------------

describe("§2 the flip rebased onto the drive start — convicts the reckless, passes the careful", () => {
  for (const dead of DEAD_TIMES_SEC) {
    it(`dead time ${dead} s: the 59 км/ч drive IS convicted (10 т., опасна)`, () => {
      const out = drive(recklessScript(dead), rebased(dead));
      expect(out.crossings).toHaveLength(1);
      expect(out.crossings[0].controller).toBe("halt");
      expect(out.sessionCodes).toEqual(["CONTROLLER_SIGNAL_VIOLATED"]);
      expect(out.score).toBe(10);
      expect(out.passed).toBe(false);
    });

    it(`dead time ${dead} s: the careful drive still passes, with ZERO violations`, () => {
      const out = drive(carefulScript(dead), rebased(dead));
      expect(out.crossings).toHaveLength(1);
      // It read the „стоп" posture, waited it out, and crossed on the profile.
      expect(out.crossings[0].controller).toBe("proceed");
      expect(out.sessionCodes).toEqual([]);
      expect(out.score).toBe(0);
      expect(out.objectivesDone).toEqual([true, true]);
      expect(out.passed).toBe(true);
    });
  }

  it("the cure changes the clock and nothing else: at dead time 0 it IS the shipped spec", () => {
    expect(rebased(0)).toEqual(SC_SIG_CONTROLLER_POSTURES_EVENT);
  });
});

// ---------------------------------------------------------------------------
// §3 — WHY IT CANNOT BE A BIGGER CONSTANT
// ---------------------------------------------------------------------------

describe("§3 no authored flipAtSec survives the spread of dead times", () => {
  /** When the reckless drive reaches the paint, and when the careful drive is
   *  standing at it, for a given dead time — measured, not modelled. */
  function crossingSec(dead: number): { reckless: number; careful: number } {
    return {
      reckless: drive(recklessScript(dead), rebased(dead)).crossings[0].tSec,
      careful: drive(carefulScript(dead), rebased(dead)).crossings[0].tSec,
    };
  }

  it("a constant that convicts the slowest start makes the fastest start wait ~50 s", () => {
    const fast = crossingSec(0);
    const slow = crossingSec(60);
    // To convict the reckless drive of a student who lingered 60 s, the flip
    // must land after his crossing…
    const needed = slow.reckless;
    expect(needed).toBeGreaterThan(60);
    // …and a student who skipped everything is standing at the line long
    // before that, so the same constant bills him a dead wait of ~50 s at a
    // junction where nothing is happening. The careful drive's own crossing at
    // dead time 0 is the yardstick: the constant is nearly a minute past it.
    const deadWaitSec = needed - fast.careful;
    expect(deadWaitSec).toBeGreaterThan(25);
    // The shipped constant sits at the opposite end and convicts nobody who
    // took longer than it to start.
    expect(SC_SIG_CONTROLLER_POSTURES_EVENT.flipAtSec!).toBeLessThan(
      MEASURED_PRE_DRIVE_SEC,
    );
  });

  it("the reckless crossing tracks the dead time one-for-one — that is the whole bug", () => {
    const a = crossingSec(0).reckless;
    const b = crossingSec(60).reckless;
    // Same driving, 60 s later: the schedule cannot tell the two apart, which
    // is why a constant cannot be authored to separate them.
    expect(b - a).toBeGreaterThan(59);
    expect(b - a).toBeLessThan(61);
  });
});
