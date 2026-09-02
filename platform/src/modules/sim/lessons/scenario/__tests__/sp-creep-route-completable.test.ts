/**
 * IS THE ROUTE LONGER THAN THE LESSON ALLOWS? — sc-speed-creep, answered by
 * driving it at the pace the lesson itself teaches.
 *
 * Finding sc-speed-creep:b8a3ba68 (critical) says: „A student who obeys the
 * 30-zone can never reach «Стигни края на зоната» — the route is longer than
 * the lesson's own time allows at the speed the lesson demands", cited to
 * .audit-frames/sweep161/sc-speed-creep/mobile-right/08-debrief.png, and
 * reproduced on the steered re-drive
 * (.audit-frames/proof/frames/sc-speed-creep__{pc,mobile}-right/: НЕЗАВЪРШЕН,
 * objective 1 of 3 ticked at 2:33, «Ориентировъчно време — 259 с при ориентир
 * 90 с»).
 *
 * THE SYMPTOM IS REAL AND THE STATED CAUSE IS NOT, and the difference matters
 * because the obvious repair — shorten the road, or lift the 30-zone caps so a
 * crawl finishes sooner — would trade a real lesson for a harness constant.
 * The 210 s those drives ran out of is `DRIVE_BUDGET_MS` in
 * tools/mobile/lesson-audit.mjs, not anything the product imposes: the lesson
 * has no cutoff at all and prints its par time as guidance («спокойно,
 * точността е преди скоростта»). And the audit bot's `right` mode is a
 * scenario-independent CAUTIOUS-DRIVER law — CRUISE_KMH 12, roll ~15 m, then a
 * full 3 s standstill — which covered 225 m of this 680 m road in 162 s, a
 * mean of 1.39 m/s.
 *
 * SO THIS FILE ASKS THE QUESTION THE FINDING ASKS, of the product rather than
 * of the instrument: drive the production stack at the envelope the briefing
 * teaches — «спокойни 46–48» on the posted-50 approach, «26–28 км/ч» in the
 * zone 30, lifting early enough to cross the sign already under the cap — and
 * see whether the three objectives tick inside the lesson's own par time.
 *
 * It is not a re-statement of the shadow gate next door. `s3-sp-bot-completion`
 * replays the AUTHORED script, and an authored demo arrives exactly when its
 * author meant it to; this drives a law written from the INSTRUCTION TEXT, so
 * it is the student's arithmetic that is on trial.
 *
 * WHAT IT GUARDS. Lengthen `approachM`/`zoneM`, move an objective further out,
 * or lower a `maxSpeedKmh` cap under the pace the copy teaches, and the drive
 * stops fitting: watched red by pushing the last objective from y = 650 to
 * y = 1000 (objective 3 never done, 3 of 3 → 2 of 3) and by dropping the zone
 * cap to 20 км/ч (violations arrive and the taught 27 км/ч stops satisfying
 * it). Every number below is READ OFF THE SPEC, so it moves when the spec
 * moves instead of pinning a copy of it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine } from "../../../rules";
import { createScenarioDirector } from "../../../orchestrator/director";
import { DT, stepFrame, type Stack } from "../../../orchestrator/__tests__/helpers";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import type { LessonSessionState } from "../../types";
import { compileScenario } from "../compile";
import { SC_SPEED_CREEP } from "../templates-sp";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const REPO_ROOT = join(process.cwd(), "..");
const RAW = JSON.parse(
  readFileSync(
    join(REPO_ROOT, "content", "world", `${SC_SPEED_CREEP.map.districtId}.json`),
    "utf-8",
  ),
) as TrafficDistrict & {
  meta?: { scenario?: { laneCenterRightM?: number; transitionY?: number } };
  spawnPoints?: { id: string; x: number; y: number }[];
};

const LANE_X = RAW.meta!.scenario!.laneCenterRightM!;
const TRANSITION_Y = RAW.meta!.scenario!.transitionY!;
const SPAWN = RAW.spawnPoints!.find((s) => s.id === SC_SPEED_CREEP.start.spawnPointId)!;

/** The three graded gates, read off the spec (id, where, and the cap). */
const GATES = SC_SPEED_CREEP.success.map((o) => {
  if (o.params.kind !== "reachZone") throw new Error(`${o.id} is not a reachZone`);
  return { id: o.id, x: o.params.x, y: o.params.y, capKmh: o.params.maxSpeedKmh ?? Infinity };
});
const LAST_GATE_Y = Math.max(...GATES.map((g) => g.y));
const PAR_TIME_SEC = SC_SPEED_CREEP.rubric!.parTimeSec!;

/**
 * THE PACE THE COPY TEACHES, not the pace the recorder scripted.
 *   instruction 1 «Установи спокойни 46–48 и ги ЗАДРЪЖ» (posted 50);
 *   instruction 3 «Вдигни газта отрано и влез в зоната вече под 30»;
 *   instruction 4 «В зоната дръж 26–28 км/ч».
 */
const APPROACH_KMH = 47;
const ZONE_KMH = 27;
/** Lift off this far before the sign — «отрано», and enough room at the live
 *  car's own brake to be under the cap when the sign passes. */
const LIFT_LEAD_M = 60;

function makeStack(): Stack {
  const runtime = createWorldRuntime(RAW);
  const traffic = createTrafficSystem(RAW, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r, s) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r, s),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  return {
    runtime,
    traffic,
    director: createScenarioDirector(
      [...(SC_SPEED_CREEP.staged ?? [])],
      traffic,
      { seed: 7, signals: runtime },
    ),
    rules: createRuleEngine(),
    ruleEvents: [],
    ticks: [],
    outcomes: [],
    t: 0,
  };
}

interface Run {
  session: LessonSessionState;
  drivingSec: number;
  maxKmh: number;
  maxZoneKmh: number;
  finalY: number;
}

/** Drive the taught envelope up the lane, feeding every production tick into
 *  the live lesson session exactly as LessonPlayShell does. */
function driveTheTaughtPace(
  opts: {
    lastGateY?: number;
    zoneKmh?: number;
    level?: ScenarioLevel;
    spec?: ScenarioSpec;
  } = {},
  budgetSec = 210,
): Run {
  const spec = opts.spec ?? SC_SPEED_CREEP;
  const lastGateY =
    opts.lastGateY ??
    Math.max(
      ...spec.success.map((o) => (o.params.kind === "reachZone" ? o.params.y : 0)),
    );
  const zoneKmh = opts.zoneKmh ?? ZONE_KMH;
  const stack = makeStack();
  let session = createLessonSession(compileScenario(spec, opts.level ?? 1));
  let y = SPAWN.y;
  let v = 0;
  let maxKmh = 0;
  let maxZoneKmh = 0;
  let drivingSec = 0;
  for (let i = 0; i < Math.round(budgetSec / DT); i++) {
    const targetKmh = y >= TRANSITION_Y - LIFT_LEAD_M ? zoneKmh : APPROACH_KMH;
    const target = targetKmh / 3.6;
    // The LIVE hero's ramp (1.95 m/s², read off the deployed build's own speed
    // probe) and an ordinary lift-and-brake, not the recorder's fixed 2.2.
    if (v < target) v = Math.min(target, v + 1.95 * DT);
    else v = Math.max(target, v - 1.5 * DT);
    y += v * DT;
    drivingSec += DT;
    const kmh = v * 3.6;
    maxKmh = Math.max(maxKmh, kmh);
    if (y >= TRANSITION_Y) maxZoneKmh = Math.max(maxZoneKmh, kmh);
    const tick = stepFrame(stack, {
      x: LANE_X,
      y,
      headingDeg: 0,
      speedKmh: kmh,
      brakePedal: v > target ? 1 : 0,
    });
    session = applyTick(session, tick).state;
    if (y >= lastGateY + 5) break;
  }
  return { session, drivingSec, maxKmh, maxZoneKmh, finalY: y };
}

describe("sc-speed-creep — the route IS completable at the pace the lesson teaches", () => {
  const run = driveTheTaughtPace();
  const result = buildLessonResult(run.session);

  it("all three objectives tick — including «Стигни края на зоната»", () => {
    expect(result.objectives.map((o) => `${o.id}:${o.done}`)).toEqual(
      GATES.map((g) => `${g.id}:true`),
    );
    expect(result.completedAll).toBe(true);
  });

  it("…inside the lesson's own par time, with room to spare", () => {
    expect(run.drivingSec).toBeLessThanOrEqual(PAR_TIME_SEC);
    // Not merely „under": the 680 m of route costs ~70 s of the 90 s par, so
    // the fit is comfortable rather than knife-edge. Push either segment out
    // and this is the assertion that notices before the objective one does.
    expect(run.drivingSec).toBeLessThan(PAR_TIME_SEC * 0.9);
  });

  it("and the drive that fits is a LEGAL one — no violation, both caps obeyed", () => {
    expect(run.session.events.filter((e) => e.kind === "violation")).toEqual([]);
    expect(run.maxKmh).toBeLessThan(50); // never touches the posted approach cap
    expect(run.maxZoneKmh).toBeLessThan(30); // …nor the zone's
    expect(result.passed).toBe(true);
  });

  it("the arithmetic, stated: 400 m at 47 + 280 m at 27 is ~68 s against a 90 s par", () => {
    // Read off the spec so it moves with it — this is the sum the finding says
    // cannot be made, printed rather than asserted from memory.
    const approachM = TRANSITION_Y - SPAWN.y;
    const zoneM = LAST_GATE_Y - TRANSITION_Y;
    const idealSec = approachM / (APPROACH_KMH / 3.6) + zoneM / (ZONE_KMH / 3.6);
    expect(idealSec).toBeLessThan(PAR_TIME_SEC);
    // …and the measured drive is within a launch-ramp of the ideal.
    expect(run.drivingSec - idealSec).toBeLessThan(12);
  });
});

describe("the guard: the fit is a fact about THIS route and THESE caps", () => {
  /** The shipped template with its LAST gate pushed further down the street. */
  const stretchedSpec: ScenarioSpec = {
    ...SC_SPEED_CREEP,
    success: SC_SPEED_CREEP.success.map((o) =>
      o.id === "sc-crp-finish" && o.params.kind === "reachZone"
        ? { ...o, params: { ...o.params, y: o.params.y + 350 } }
        : o,
    ),
  };

  it("push the last gate 350 m further out and the same drive no longer completes", () => {
    // The finding's own claim, made true on purpose: a route the taught pace
    // cannot cover inside the par time fails, so „it fits" above is a
    // measurement and not a tautology. The MUTATION IS THE OBJECTIVE, not the
    // loop bound — moving the stop condition alone would have left the real
    // gates where they are and passed for the wrong reason (it did, once).
    const stretched = driveTheTaughtPace({ spec: stretchedSpec }, PAR_TIME_SEC);
    const stretchedResult = buildLessonResult(stretched.session);
    expect(stretchedResult.completedAll).toBe(false);
    expect(stretchedResult.objectives.filter((o) => o.done).length).toBe(GATES.length - 1);
    expect(stretchedResult.objectives.find((o) => o.id === "sc-crp-finish")!.done).toBe(false);
  });

  it("the zone gate really does bind: 37 км/ч through it fails it at L3", () => {
    // The creeper's own speed (this lesson's mistake demo „Пълзене в зоната 30"
    // — 37 км/ч) put through the same live session: the gate the lesson calls
    // «Мини зоната 30 под 30 км/ч» must refuse it, or the cap is decoration.
    //
    // AT L3, because that is where the authored 33 IS the gate:
    // DEFAULT_LEVEL_TOLERANCE is flat 1.0 from L3 up, and at L1 the ladder adds
    // SPEED_CAP_GRACE_KMH_PER_TOLERANCE × (1.5 − 1) = 5 км/ч, so the compiled
    // L1 gate is 38 — inside a posted 30. That widening is exactly the sweep161
    // finding «ЗАДАЧА 2/3 says дръж под 38 км/ч inside a posted 30 zone»,
    // routed to lessons/advisor.ts, and it is NOT what this file is about; the
    // clamp that would stop it (`widenSpeedCap`'s postedLimitKmh) reads
    // `map.params.maxspeedKmh`, which a two-segment street cannot have one of.
    // Measured here so the number in that routing has a witness.
    const creeper = driveTheTaughtPace({ zoneKmh: 37, level: 3 });
    const creeperResult = buildLessonResult(creeper.session);
    expect(creeperResult.objectives.find((o) => o.id === "sc-crp-zone")!.done).toBe(false);
    expect(
      creeper.session.events.some(
        (e) => e.kind === "violation" && e.code === "SPEEDING_OVER_LIMIT",
      ),
    ).toBe(true);
  });

  it("and the taught pace still completes at L3, where nothing is forgiven", () => {
    const strict = driveTheTaughtPace({ level: 3 });
    const strictResult = buildLessonResult(strict.session);
    expect(strictResult.completedAll).toBe(true);
    expect(strict.drivingSec).toBeLessThanOrEqual(PAR_TIME_SEC);
    expect(strict.session.events.filter((e) => e.kind === "violation")).toEqual([]);
  });
});
