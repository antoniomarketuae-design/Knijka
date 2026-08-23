/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ENCOUNTER MUST EXIST FOR THE DRIVER WHO DOES NOT SLOW DOWN.
 *
 * WHICH FINDINGS THIS ANSWERS, and — as important — which it does not.
 *
 *   sc-signal-dead:e7a06d68        critical · works=NO rightCredited=NO
 *                                  wrongConvicted=NO. Its first two signals are
 *                                  REFUTED by a properly steered re-drive (see
 *                                  the note at the bottom); its third is the
 *                                  defect this file repairs.
 *   the sc-signal-flashing SUMMARY row (chunk-18, critical) — „the correct
 *                                  drive collects 40 penalty points and the
 *                                  deliberately-wrong drive collects zero and a
 *                                  compliment". The second half, repaired here.
 *   sc-signal-hesitation:3c0ff44f  critical · NOT REPAIRED HERE, and cannot be:
 *                                  its junction is a LIVE GREEN, so nothing has
 *                                  priority to cross the student and staging a
 *                                  conflict there would teach a falsehood. Its
 *                                  acquittal is the coach's „второстепенна warns
 *                                  once" (signals-sweep161.test.ts §3 pins it).
 *
 * THE RECORD, quoted from
 * `.audit-frames/sweep161/sc-signal-flashing/mobile-wrong/audit.log` (the
 * MACHINE SUMMARY, not the viewport shot beside it):
 *
 *     drive: top 59 км/ч · 0 full stops
 *     VERDICT: НЕИЗДЪРЖАН · SCORE: 0 наказателни точки
 *     MISTAKES (0): (none convicted)
 *     INSTRUCTOR DEBRIEF >>> „Какво се получи добре: чисто каране без нито
 *     едно нарушение — задръж това ниво."
 *
 * A student held the throttle at 59 км/ч through a flashing amber whose entire
 * subject is «пропусни идващия отдясно», never stopped once, and was told to
 * keep it up. THEO-4 forbids a bare verdict; this was worse than bare — it was
 * praise. `sc-signal-dead`'s wrong legs are the same hole wearing a different
 * result: 20 т., but both tens are «Пътнотранспортно произшествие» and the
 * give-way code the drill exists to teach is absent from every leg.
 *
 * THE CAUSE WAS NOT THE COACH AND NOT THE DEBRIEF. Measured through the
 * production recorder + a real lesson session (the same pipeline
 * `signals-sweep161.test.ts` §3 uses), sweeping ONLY the approach speed against
 * the single staged car this file used to ship:
 *
 *     approach   sc-signal-flashing      sc-signal-dead
 *      59 км/ч   nothing resolves        nothing resolves
 *      40 км/ч   nothing resolves        „clear"
 *      20 км/ч   FAILED_TO_YIELD         FAILED_TO_YIELD + COLLISION
 *
 * The conflict was choreographed to the 20–22 км/ч of the committed demos and
 * was simply absent at every faster pace, so the barge had nothing to be
 * convicted of. `SC_SIGNAL_DEAD_CONFLICT_2` / `SC_SIGNAL_FLASHING_CONFLICT_2`
 * are the repair: a second car from the right, held 46 m out — inside the
 * window bounded below by its own 27.73 m stop line and above by ≈ 48 m, past
 * which the hole reopens.
 *
 * WHAT THIS FILE PINS, and why each half is here:
 *
 *  §1 THE CONVICTION. The barge is billed FAILED_TO_YIELD by the LESSON
 *     SESSION (not merely seen by the engine — §3 of the sweep battery is the
 *     standing reminder that those two lists differ), at the pace the frames
 *     photographed and at the posted limit.
 *  §2 WHAT IT MUST NOT COST. The careful drive — stop short of the paint, wait,
 *     go — keeps zero violations, zero points, both objectives AND the
 *     «Правилно отстъпено предимство» commendation, at three wait lengths
 *     including the committed shadow's own 8 s. This half is not decoration:
 *     every alternative repair measured (armDistM 70→105, hold −95→−50 or
 *     nearer) bought §1 by DELETING this commendation, and a fix that takes the
 *     correct student's praise away is not a fix.
 *  §3 THE DEMOS ARE UNTOUCHED. The second car lives on the rungs, never in
 *     `staged`, so the six committed traces are not re-cut. Moving it into
 *     `staged` „for tidiness" would stale them silently; this row refuses.
 *  §4 THE POSE IS LAWFUL. Staged through the production TrafficSystem: the car
 *     stands ON its own arm, BEHIND its own painted stop line, in the
 *     westbound lane centre — not parked in the junction mouth.
 *
 * MUTATION RECORD (each one run, each one red where it says):
 *   hold −46 → −95 (i.e. „just reuse the lead car's number"):  §1 red on both.
 *   hold −46 → −50:                                            §1 red on dead.
 *   dropping `stagedAdd` from any rung:                        §1 red on that rung.
 *   hold −46 → −20 (inside the junction mouth):                §4 red.
 *
 * AND WHY §1 READS `session.events` AND NOT THE ENGINE'S OWN LOG. On the
 * unfixed file the two lists disagreed: the engine already carried
 * SPEEDING_OVER_LIMIT for the 59 км/ч flashing barge while `session.events` —
 * the list `buildLessonResult` scores and the debrief prints — was EMPTY. Any
 * assertion of the „something fired" shape would have been satisfied by that
 * speeding episode and would have called the defect fixed. The billed list is
 * the one the student's card is made of, so it is the one pinned here.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PriorityFromRightSpec } from "../../../contracts";
import { createTrafficSystem, DEFAULT_TRAFFIC_CONFIG } from "../../../traffic";
import type { TrafficDistrict } from "../../../traffic/types";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { compileScenario } from "../compile";
import {
  SC_SIGNAL_DEAD,
  SC_SIGNAL_DEAD_CONFLICT_2,
  SC_SIGNAL_FLASHING,
  SC_SIGNAL_FLASHING_CONFLICT_2,
} from "../templates-signals";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

/** Drawn lane-centre offset on every sx* district, m (battery sx-district). */
const LANE = 4.0625;
/** South spawn y on every sx* district, m. */
const SPAWN_Y = -105;

interface SxDistrict extends TrafficDistrict {
  meta: { scenario: { derived: { stopLineFromNodeM: number } } } & TrafficDistrict["meta"];
  spawnPoints: ReadonlyArray<{ id: string; x: number; y: number }>;
}

function district(id: string): SxDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as SxDistrict;
}

interface DriveOutcome {
  /** Codes the LESSON SESSION billed — what the score and the debrief read. */
  sessionCodes: string[];
  /** Commendations the rule engine credited over the drive. */
  commendations: string[];
  score: number;
  objectivesDone: boolean[];
  /** One entry per staged event that resolved, in resolution order. */
  stagedOutcomes: string[];
}

/**
 * One drive at one RUNG, through the production stack: `compileScenario` (which
 * is what folds `stagedAdd` in), the scripted recorder with the compiled rung's
 * own staged set, and a real lesson session fed every frame.
 */
function drive(spec: ScenarioSpec, level: ScenarioLevel, script: DriveScript): DriveOutcome {
  const lesson = compileScenario(spec, level);
  let session = createLessonSession(lesson);
  const rec = recordScriptedDrive(district(spec.map.districtId), script, {
    scenarioId: spec.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as never,
    ...(spec.signalModes !== undefined ? { signalModes: spec.signalModes } : {}),
    collisionMinKmh: 0,
    onTick: (tick) => {
      session = applyTick(session, tick).state;
    },
  });
  const result = buildLessonResult(session);
  return {
    sessionCodes: session.events
      .filter((e) => e.kind === "violation")
      .map((e) => (e as { code: string }).code),
    commendations: rec.ruleEvents.filter((e) => e.kind === "commendation").map((e) => e.code),
    score: result.score,
    objectivesDone: result.objectives.map((o) => o.done),
    stagedOutcomes: rec.outcomes.map((o) => o.detail),
  };
}

/** The audit's wrong leg: hold the throttle, never touch the brake. */
function bargeScript(exit: ReadonlyArray<readonly [number, number]>, kmh: number): DriveScript {
  return {
    steps: [
      {
        kind: "drive",
        points: [[LANE, SPAWN_Y], ...exit.map((p) => [p[0], p[1]] as [number, number])],
        targetKmh: kmh,
      },
      { kind: "pause", sec: 1, brake: true },
    ],
  };
}

/** The drive the drill is written for: slow, stop SHORT of the paint, wait, go. */
function carefulScript(
  exit: ReadonlyArray<readonly [number, number]>,
  waitSec: number,
): DriveScript {
  return {
    steps: [
      { kind: "drive", points: [[LANE, SPAWN_Y], [LANE, -45]], targetKmh: 26 },
      { kind: "drive", points: [[LANE, -45], [LANE, -29.5]], targetKmh: 10 },
      { kind: "pause", sec: waitSec, brake: true },
      {
        kind: "drive",
        points: [[LANE, -29.5], ...exit.map((p) => [p[0], p[1]] as [number, number])],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

/** The left turn out to the west arm (sc-signal-dead's authored maneuver). */
const DEAD_EXIT = [[LANE, -8], [-8, LANE], [-30, LANE], [-52, LANE]] as const;
/** Straight through and up the north arm (sc-signal-flashing's). */
const FLASH_EXIT = [[LANE, 60]] as const;

const DRILLS = [
  {
    spec: SC_SIGNAL_DEAD,
    second: SC_SIGNAL_DEAD_CONFLICT_2,
    exit: DEAD_EXIT,
    /** The pace the sweep photographed, and the street's posted limit. */
    bargeKmh: [59, 50] as const,
  },
  {
    spec: SC_SIGNAL_FLASHING,
    second: SC_SIGNAL_FLASHING_CONFLICT_2,
    exit: FLASH_EXIT,
    bargeKmh: [59, 50] as const,
  },
] as const;

// ---------------------------------------------------------------------------
// §1 — the barge is CONVICTED, at the rung a beginner actually plays
// ---------------------------------------------------------------------------

describe("§1 a drive that never slows is billed for the car it cut in front of", () => {
  for (const { spec, exit, bargeKmh } of DRILLS) {
    for (const kmh of bargeKmh) {
      for (const level of [1, 3] as const) {
        it(`${spec.id} L${level}: ${kmh} км/ч through the box bills FAILED_TO_YIELD`, () => {
          const out = drive(spec, level, bargeScript(exit, kmh));
          // THE LAW. Not „the engine noticed" — BILLED: `session.events` is the
          // list `buildLessonResult` scores and the debrief prints, and the
          // whole finding is that it was empty. A pin on the engine's own log
          // would already be green on the broken file.
          expect(out.sessionCodes, `${spec.id} L${level} @${kmh}`).toContain("FAILED_TO_YIELD");
          // …and it costs the official 10 т. of an опасна грешка, so the card
          // the student reads cannot say «0 наказателни точки» any more.
          expect(out.score).toBeGreaterThanOrEqual(10);
        });
      }
    }
  }
});

describe("§1b …and on the leg the sweep actually photographed", () => {
  // `lesson-audit.mjs` could not steer, so on `sc-signal-dead` — the one drill
  // in this family that TURNS — every filed frame is of a car that went
  // STRAIGHT through the box and up the north arm. The give-way adjudication
  // happens at the node and does not care which way the player leaves it, but
  // the finding was filed off this leg, so this leg is pinned. Measured on the
  // unfixed file: session codes [], score 0, no staged outcome at all.
  for (const kmh of [59, 50] as const) {
    it(`sc-signal-dead: ${kmh} км/ч STRAIGHT through the box bills FAILED_TO_YIELD`, () => {
      const out = drive(SC_SIGNAL_DEAD, 1, bargeScript([[LANE, 60]], kmh));
      expect(out.sessionCodes, `straight @${kmh}`).toContain("FAILED_TO_YIELD");
      expect(out.score).toBeGreaterThanOrEqual(10);
    });
  }
});

// ---------------------------------------------------------------------------
// §2 — and it costs the careful student NOTHING
// ---------------------------------------------------------------------------

describe("§2 the drive the drill is written for keeps everything it earned", () => {
  for (const { spec, exit } of DRILLS) {
    // 8 s is the committed shadow's own pause (traces/scSignals.ts); 4 and 12
    // bracket it, so the row is not tuned to one wait.
    for (const waitSec of [4, 8, 12]) {
      it(`${spec.id}: stop short of the paint, wait ${waitSec} s, go — clean and commended`, () => {
        const out = drive(spec, 1, carefulScript(exit, waitSec));
        expect(out.sessionCodes, `${spec.id} wait ${waitSec}`).toEqual([]);
        expect(out.score).toBe(0);
        expect(out.objectivesDone).toEqual([true, true]);
        // THE ROW THAT REFUSES THE CHEAP FIX. Every variant that convicted the
        // barge by moving the SHIPPED car (armDistM 105, hold −50 or nearer)
        // measured green on the three lines above and red on this one: the
        // runtime's right-hand-rule tracker stopped seeing the conflict the
        // student stopped for, so «Правилно отстъпено предимство» vanished from
        // his debrief. Round 1 of this programme closed a rule „forever" and
        // deleted a commendation exactly this way.
        expect(out.commendations, `${spec.id} wait ${waitSec}`).toContain("YIELDED_TO_PRIORITY");
        // Two cars waited for, not one — the encounter the second car adds is
        // resolved as a yield, not merely ignored.
        expect(out.stagedOutcomes).toEqual(["yielded", "yielded"]);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// §3 — the six committed demonstrations are NOT re-cut
// ---------------------------------------------------------------------------

describe("§3 the second car rides the rungs, never the recording set", () => {
  for (const { spec, second } of DRILLS) {
    it(`${spec.id}: staged[] still holds exactly the one car the traces were cut from`, () => {
      // traces/scSignals.ts reads `spec.staged` DIRECTLY
      // (`stagedEvents: [...(SC_SIGNAL_DEAD.staged ?? [])]`), so anything added
      // here re-cuts shadow-correct, mistake-barge and mistake-cut and stales
      // the byte-identity gate in sc-signals-traces.test.ts.
      expect(spec.staged).toHaveLength(1);
      expect((spec.staged![0] as PriorityFromRightSpec).id).not.toBe(second.id);
    });

    it(`${spec.id}: every rung 1..5 compiles WITH the second car`, () => {
      for (const level of [1, 2, 3, 4, 5] as const) {
        const ids = (compileScenario(spec, level).stagedEvents ?? []).map((s) => s.id);
        expect(ids, `${spec.id} L${level}`).toContain(second.id);
        expect(ids, `${spec.id} L${level}`).toContain(spec.staged![0].id);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// §4 — the pose is a car on the road, behind its own paint
// ---------------------------------------------------------------------------

/** Stage one actor through the production TrafficSystem (the sweep's own rig). */
function stageActor(districtId: string, spec: PriorityFromRightSpec) {
  const d = district(districtId);
  const sys = createTrafficSystem(d, {
    ...DEFAULT_TRAFFIC_CONFIG,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const view = sys.stage({
    kind: "vehicle",
    id: spec.id,
    pathNodes: [...spec.actor.pathNodes],
    hold: { ...spec.actor.hold },
    cruiseSpeedMps: spec.actor.cruiseSpeedMps,
    playerGuard: true,
  });
  if (!view) throw new Error(`${spec.id}: failed to stage`);
  const nodeArcM = view.nodeS[spec.junctionNodeIndex];
  return {
    arcM: view.s,
    carDistM: nodeArcM - view.s,
    x: view.x,
    y: view.y,
    stopLineM: d.meta.scenario.derived.stopLineFromNodeM,
  };
}

describe("§4 the second car stands on its own arm, behind its own stop line", () => {
  for (const { spec, second } of DRILLS) {
    it(`${second.id} on ${spec.map.districtId}: lawful hold pose`, () => {
      const at = stageActor(spec.map.districtId, second);
      // Reached by arithmetic, not by `clampArc` swallowing an over-long ask —
      // the exact silent failure §1 of signals-sweep161 exists to catch.
      expect(at.arcM, `${second.id} hold arc`).toBeGreaterThan(0);
      expect(at.carDistM, `${second.id} carDist`).toBeCloseTo(-second.actor.hold.offsetM, 1);
      // BEHIND THE PAINT. A hold inside its own stop line is a car parked in the
      // junction mouth, and it would convict the barge for the wrong reason.
      expect(at.carDistM, `${second.id} vs paint`).toBeGreaterThan(at.stopLineM);
      // …and short of the lead car, so the two never occupy one pose.
      const lead = spec.staged![0] as PriorityFromRightSpec;
      expect(at.carDistM).toBeLessThan(-lead.actor.hold.offsetM);
      // Westbound lane centre of the east arm, like its lead car.
      expect(at.y, `${second.id} hold y`).toBeCloseTo(LANE, 2);
    });
  }
});

// ---------------------------------------------------------------------------
// §5 — THE PATIENT STUDENT'S BAND, and the cliff above it that this car moved
// ---------------------------------------------------------------------------

/**
 * ADDED BY THE VERIFIER OF THIS REPAIR, because §2 pins three wait lengths and
 * the second car moved a boundary that lies between them and infinity.
 *
 * WHAT I MEASURED. Same production pipeline as §2 (compileScenario → recorder →
 * lesson session), same careful script — approach 26, stop at −29.5 short of
 * the 27.73 m paint, wait `w`, leave at 18 — sweeping `w` over 2…30 s, on the
 * file BEFORE this repair and after it. „ok" = zero billed violations, both
 * objectives, and YIELDED_TO_PRIORITY still credited:
 *
 *     drill                first w that is NOT ok
 *                          before this repair    after
 *     sc-signal-dead              29 s            28 s
 *     sc-signal-flashing          19 s            14 s
 *
 * So a patient student who waits long enough is billed FAILED_TO_YIELD (10 т.)
 * and loses his commendation — with BOTH staged encounters recorded as
 * `yielded` in the very same drive. That pathology is NOT this repair's: it is
 * `traffic/staged.ts` FR-B5-RETURN, which drives a finished staged actor
 * EXIT_CLEAR_M off the end of its path and then `rewindTo`s it back onto the
 * arm — so the car he already waited for re-approaches from the right and the
 * runtime's right-hand-rule tracker convicts him for it a second time. Two
 * cars re-enter twice as often as one, which is why the flashing cliff came
 * down five seconds.
 *
 * WHY THIS ROW IS A FLOOR AND NOT A PIN ON THE CLIFF. Pinning „the cliff is at
 * 14" would go red the day someone fixes it, which is the wrong direction. This
 * asserts only the band a real student uses — every wait from 2 s to 12 s, the
 * longest of which is already four seconds past the committed shadow's own
 * 8 s pause — so a future edit that pushes the re-entry conviction DOWN into
 * ordinary waiting goes red, and one that pushes it up or away stays green.
 *
 * The durable repair is in the runner, not here: a staged actor whose encounter
 * the director has already resolved must stop counting as an unresolved
 * right-hand conflict when it comes back round.
 */
describe("§5 waiting LONGER than the drill needs is never itself a fault", () => {
  for (const { spec, exit } of DRILLS) {
    for (let waitSec = 2; waitSec <= 12; waitSec++) {
      it(`${spec.id}: wait ${waitSec} s at the paint — clean, both objectives, commended`, () => {
        const out = drive(spec, 1, carefulScript(exit, waitSec));
        expect(out.sessionCodes, `${spec.id} wait ${waitSec}`).toEqual([]);
        expect(out.score).toBe(0);
        expect(out.objectivesDone).toEqual([true, true]);
        expect(out.commendations, `${spec.id} wait ${waitSec}`).toContain("YIELDED_TO_PRIORITY");
      });
    }
  }
});
