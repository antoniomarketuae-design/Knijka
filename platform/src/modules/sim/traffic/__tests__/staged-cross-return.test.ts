/**
 * FR-B5-CROSS (2026-08-23) — A PRIORITY ROAD HAS TO KEEP HAVING PRIORITY
 * TRAFFIC ON IT.
 *
 * WHAT WAS FOUND BY LOOKING. Three open criticals, all routed at `staged.ts`,
 * all one sentence: *"the lesson's own event never happens"*.
 *
 *   sc-jx-giveway-b1        c335a08f  „The correct drive spent 180 s of a 205 s
 *      lesson in lawful waits at the give-way line and at t108s the HUD is
 *      still showing ЗАДАЧА 1/3. The priority stream on the main road never
 *      clears." — frame `sweep161/sc-jx-giveway-b1/pc-right/04-t108s.png`
 *   sc-ed-d2-priority-run   76d2e929  „A priority lesson with ZERO moving
 *      traffic … the right drive burned 90 s of lawful waits standing still for
 *      a car that never comes."
 *   sc-merge-accel-lane     ff1e4ca5  „the carriageway is empty to the horizon
 *      in both directions."
 *
 * FR-B5-EXIT and FR-B5-RETURN (staged.ts, 2026-08-18) answered the third and
 * left the first two open, for a reason that is arithmetic rather than
 * judgement — see the FR-B5-CROSS block in staged.ts. Driven at level 1 through
 * the production stack, `compileScenario` + `createTrafficSystem` +
 * `createScenarioDirector`, the way each drill's own instructions read:
 *
 *   sc-jxgb-conflict  ONE crossing of the junction it is staged at, then at
 *                     rest at (−190.0, 154.1) from t = 60 s to the 210 s cap;
 *   sc-edpr-right     ONE crossing, then at rest at (−658, 41) from t ≈ 170 s.
 *
 * §1 is those two drives. §2 is the mechanism on a bare synthetic geometry, in
 * the four directions the repair could be wrong in. §3 is the price: a second
 * car on the road the student is about to cross must never be the one that
 * hits him, and must not become a car that tucks in behind him instead of
 * passing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileScenario } from "../../lessons/scenario/compile";
import { SC_ED_D2_PRIORITY_RUN } from "../../lessons/scenario/templates-exam";
import { SC_JX_GIVEWAY_B1 } from "../../lessons/scenario/templates-junctions";
import { createScenarioDirector, lessonSeed } from "../../orchestrator";
import { loadDistrict } from "../../world/referents";
import {
  STAGED_STATE_ID_BASE,
  applyStagedCommand,
  buildStagedVehiclePolylinePath,
  createStagedVehicle,
  updateStagedVehicle,
  type StagedEnv,
  type StagedVehicleAgent,
} from "../staged";
import { createTrafficSystem } from "../system";
import type { StagedVehicleSpec, TrafficDistrict } from "../types";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// §1 — the two drills, driven the way their own instructions read
// ---------------------------------------------------------------------------

/** Drawn northbound lane centre of jxg-giveway-v1 (the student's own lane). */
const JXG_LANE_X = 4.0625;
/** The mouth-2 Б1 line is at y = 122.275; the drill stops just short of it. */
const JXG_YIELD_Y = 118;
const LESSON_SEC = 210;

interface GiveWayRun {
  /** Times the priority car crossed the mouth-2 junction box west-bound. */
  crossings: number;
  /** Metres it covered over the LAST minute of the lesson. */
  metresLate: number;
}

/**
 * „Тръгни по второстепенната улица на север … спираш преди линията и я
 * пропускаш изцяло" — roll up the tertiary street, stop short of the mouth-2
 * Б1 line, and wait, which is what the audited drive did for 180 s.
 */
function driveTheGiveWayDrill(): GiveWayRun {
  const lesson = compileScenario(SC_JX_GIVEWAY_B1, 1);
  const traffic = createTrafficSystem(
    loadDistrict("jxg-giveway-v1") as TrafficDistrict,
    {
      anchor: { x: JXG_LANE_X, y: -115 },
      anchorRadiusM: lesson.traffic?.anchorRadiusM ?? 400,
      vehicleCount: lesson.traffic?.vehicleCount ?? 0,
      pedestrianCount: 0,
    },
  );
  const director = createScenarioDirector(lesson.stagedEvents ?? [], traffic, {
    seed: lessonSeed(lesson.id),
  });

  let t = 0;
  let py = -115;
  let rolling = true;
  const out: GiveWayRun = { crossings: 0, metresLate: 0 };
  // The car comes from the student's RIGHT (east) and leaves west, so one
  // crossing is one east→west sign change of its x through the junction node.
  let wasEast = true;
  let last: { x: number; y: number } | null = null;
  while (t <= LESSON_SEC) {
    let pv = 0;
    if (rolling) {
      pv = 22 / 3.6;
      py += pv * DT;
      if (py >= JXG_YIELD_Y) {
        py = JXG_YIELD_Y;
        rolling = false;
      }
    }
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: JXG_LANE_X, y: py },
      playerSpeedKmh: pv * 3.6,
      playerHeadingDeg: 0,
    });
    director.step({
      tSec: t,
      dtSec: DT,
      x: JXG_LANE_X,
      y: py,
      speedKmh: pv * 3.6,
      headingDeg: 0,
      brakePedal: rolling ? 0 : 1,
      tickEvents: [],
    });
    const car = traffic.staged("sc-jxgb-conflict");
    if (car) {
      const east = car.x > 0;
      if (wasEast && !east) out.crossings++;
      wasEast = east;
      if (t >= LESSON_SEC - 60) {
        if (last) {
          const step = Math.hypot(car.x - last.x, car.y - last.y);
          // The re-entry itself is a jump back onto the path, not travel — a
          // metric that scores teleports is not a metric. 0.033 s ⇒ 5 m is
          // 540 км/ч, which no body here can do.
          if (step < 5) out.metresLate += step;
        }
        last = { x: car.x, y: car.y };
      }
    }
    t += DT;
  }
  return out;
}

describe("FR-B5-CROSS — sc-jx-giveway-b1: the priority boulevard keeps producing cars", () => {
  it("the car the drill tells the student to wait for comes round more than once", () => {
    const r = driveTheGiveWayDrill();
    // MEASURED before the repair: crossings = 1 and metresLate = 0.0 — the
    // actor came to rest at (−190.0, 154.1) at t = 60 s and stood there for
    // the last 150 s of the lesson, which is the frame the finding cites.
    // After: 6 crossings and a boulevard that never goes quiet.
    //
    // The floor is THREE, and it is chosen so nothing but a real return can
    // clear it: the orchestrator scripts exactly one crossing per drill (the
    // runner resolves on `actor.finished`), so 2 would already be proof and
    // 3 leaves room for the arrival sync to re-hold once without making this
    // flap. It is also half of what the repair actually produces.
    expect(
      r.crossings,
      `the priority car crossed the junction ${r.crossings}× in ${LESSON_SEC} s`,
    ).toBeGreaterThanOrEqual(3);
    // …and it is MOVING in the last minute, not merely displaced earlier. One
    // length of its own 240 m path across a 60 s window.
    expect(
      r.metresLate,
      `the priority car covered ${r.metresLate.toFixed(1)} m over the lesson's last minute`,
    ).toBeGreaterThan(240);
  }, 300000);
});

interface TraceSample {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
}

/**
 * sc-ed-d2-priority-run has no straight line to drive: it is a cut of real
 * Лозенец. So the student is the product's OWN correct drive — the committed
 * shadow recording — and then he stops where it stops, which is what the audit
 * bot did too (its drive ended standing still, „forced end at 210 s").
 */
function driveTheD2Segment(): number {
  const trace = JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "..",
        "content/traces/sc-ed-d2-priority-run/shadow-correct.trace.json",
      ),
      "utf8",
    ),
  ) as { samples: TraceSample[] };
  const samples = trace.samples;
  const lesson = compileScenario(SC_ED_D2_PRIORITY_RUN, 1);
  const traffic = createTrafficSystem(
    loadDistrict("d2-v1") as TrafficDistrict,
    {
      anchor: { x: samples[0].x, y: samples[0].y },
      anchorRadiusM: lesson.traffic?.anchorRadiusM ?? 400,
      vehicleCount: lesson.traffic?.vehicleCount ?? 0,
      pedestrianCount: 0,
    },
  );
  const director = createScenarioDirector(lesson.stagedEvents ?? [], traffic, {
    seed: lessonSeed(lesson.id),
  });

  let t = 0;
  let i = 0;
  let metres = 0;
  let last: { x: number; y: number } | null = null;
  // The window opens after the scripted encounter has run: `sc-edpr-right`
  // crosses at t ≈ 130…160 s on this drive and came to rest at t ≈ 170 s.
  const FROM = 175;
  const TO = 250;
  while (t <= TO) {
    while (i < samples.length - 1 && samples[i + 1].tSec <= t) i++;
    const p = samples[i];
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: p.x, y: p.y },
      playerSpeedKmh: p.speedKmh,
      playerHeadingDeg: p.headingDeg,
    });
    director.step({
      tSec: t,
      dtSec: DT,
      x: p.x,
      y: p.y,
      speedKmh: p.speedKmh,
      headingDeg: p.headingDeg,
      brakePedal: p.speedKmh < 1 ? 1 : 0,
      tickEvents: [],
    });
    const car = traffic.staged("sc-edpr-right");
    if (car && t >= FROM) {
      if (last) {
        const step = Math.hypot(car.x - last.x, car.y - last.y);
        if (step < 5) metres += step;
      }
      last = { x: car.x, y: car.y };
    }
    t += DT;
  }
  return metres;
}

describe("FR-B5-CROSS — sc-ed-d2-priority-run: the car from the right keeps coming", () => {
  it("the equal junction's priority car is still driving after the segment is over", () => {
    const metres = driveTheD2Segment();
    // MEASURED before the repair: 0.0 m. `sc-edpr-right` stopped at
    // (−658, 41) and never moved again — 29 CENTIMETRES was the whole margin
    // (its clearance measured from the authored hold topped out at 69.71 m
    // against the 70 m bar). 200 m across a 75 s window is a car driving, and
    // is a quarter of what the repair produces.
    expect(
      metres,
      `sc-edpr-right covered ${metres.toFixed(1)} m after the scripted crossing`,
    ).toBeGreaterThan(200);
  }, 300000);
});

// ---------------------------------------------------------------------------
// §2 — the mechanism, on bare geometry, in the four directions it could be
//      wrong. Nothing moves here but the thing under test.
// ---------------------------------------------------------------------------

/** The give-way boulevard's shape and numbers: 240 m of straight road with the
 *  authored hold 75 m along it, which is what `sc-jxgb-conflict` is. */
const BOULEVARD: readonly { x: number; y: number }[] = [
  { x: 120, y: 0 },
  { x: -120, y: 0 },
];
const BOULEVARD_HOLD_M = 75;
/** How much nearer the path start than the authored hold a re-entry has to be
 *  for „it came back at arc 0" to be unambiguous. The two are 75 m apart. */
const RETURN_MARGIN_M = 30;
/** A path that comes back alongside its own start — 100 m out, 20 m across,
 *  100 m back — so „far along the path" and „far away on the map" come apart. */
const HOOK: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: -20 },
  { x: 0, y: -20 },
];

function env(over: Partial<StagedEnv> = {}): StagedEnv {
  return {
    hasPlayer: false,
    playerX: 0,
    playerY: 0,
    playerSpeedMps: 0,
    crossingCounts: new Map(),
    ambient: [],
    ...over,
  };
}

/**
 * A ROAD-GRAPH actor (no `railPath` — that is the one-shot-hazard discriminator
 * and would refuse every return) on an authored polyline, so the geometry under
 * test is exactly the geometry written here.
 */
function probe(
  points: readonly { x: number; y: number }[],
  holdOffsetM: number,
): StagedVehicleAgent {
  const path = buildStagedVehiclePolylinePath(points)!;
  const spec: StagedVehicleSpec = {
    kind: "vehicle",
    id: "cross-probe",
    pathNodes: [],
    hold: { nodeIndex: 0, offsetM: holdOffsetM },
    cruiseSpeedMps: 11.5,
  };
  return createStagedVehicle(spec, path, 1000);
}

/**
 * Run one actor to the end of its path and past it, under `cruise`, recording
 * the pose it is published at on the frame each return happens — which is the
 * only frame that says WHERE it came back, and the thing §2 is about.
 */
function runOut(
  agent: StagedVehicleAgent,
  e: StagedEnv,
  seconds = 120,
): Array<{ x: number; y: number }> {
  applyStagedCommand(agent, { type: "cruise" }, e);
  const poses: Array<{ x: number; y: number }> = [];
  let seen = agent.returns;
  for (let i = 0; i < seconds * 60; i++) {
    updateStagedVehicle(agent, DT, e);
    if (agent.returns > seen) {
      seen = agent.returns;
      poses.push({ x: agent.state.x, y: agent.state.y });
    }
  }
  return poses;
}

describe("FR-B5-CROSS — where a retired actor is allowed back", () => {
  it("a CROSSING actor falls back to the far end of its own road", () => {
    // The student at the give-way drill's own geometry, to the metre: his
    // projection lands 115.94 m along the boulevard and he is 36.06 m off it.
    const a = probe(BOULEVARD, BOULEVARD_HOLD_M);
    const e = env({ hasPlayer: true, playerX: 120 - 115.94, playerY: 36.06 });
    const poses = runOut(a, e);
    // The pre-repair rule measured the clearance from the AUTHORED HOLD:
    // 115.94 − 75 = 40.94 m against a 70 m bar, which is a ceiling and not a
    // pose — it is 40.94 wherever on his own road the student stands. So this
    // was 0 before, and it is the whole finding.
    expect(a.returns, "the crossing actor never came back").toBeGreaterThan(0);
    // …and it came back AT ARC 0, the far end of the boulevard — 121.4 m from
    // him — not at the hold, which is 54.6 m away and is exactly where this
    // drill's own instruction 2 tells him to look.
    for (const p of poses) {
      expect(
        Math.hypot(p.x - 120, p.y),
        `re-entered at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), not at the path start`,
      ).toBeLessThan(BOULEVARD_HOLD_M - RETURN_MARGIN_M);
      expect(
        Math.hypot(p.x - e.playerX, p.y - e.playerY),
      ).toBeGreaterThanOrEqual(70);
    }
  });

  it("a SAME-ROAD actor is never offered that fallback", () => {
    // Identical actor, identical arc, the ONLY difference being that the
    // student is one lane pitch off the path instead of a carriageway — which
    // is how every same-road actor in the catalogue is authored. He is not past
    // the hold, so the answer must be „not yet" and must NOT become „then come
    // in at the far end": a stream re-entering that way collapses its own
    // authored column into one clump.
    const a = probe(BOULEVARD, BOULEVARD_HOLD_M);
    const e = env({ hasPlayer: true, playerX: 120 - 115.94, playerY: 8.13 });
    runOut(a, e);
    expect(
      a.returns,
      "an actor on the student's own road took the crossing fallback",
    ).toBe(0);
  });

  it("the straight-line floor refuses a pose the path says is far and the map says is near", () => {
    // A path that comes back alongside its own start: 100 m out, 20 m across,
    // 100 m back, so its end is 20 m from arc 0. The student stands 12 m clear
    // of that end — clear enough that neither the player guard nor the
    // retirement clamp touches the actor, so it genuinely finishes and
    // genuinely retires. He then projects 220 m ALONG the path and stands
    // THIRTY-TWO METRES from arc 0. The along-path test alone says „he is
    // 220 m past you, come in"; the floor says no, and the floor is right —
    // the pose is in his lap.
    const a = probe(HOOK, 0);
    const e = env({ hasPlayer: true, playerX: 0, playerY: -32 });
    runOut(a, e);
    expect(
      a.returns,
      "re-entered 32 m from the student because the path said 220",
    ).toBe(0);
    // …and the 0 above means „held back", not „never got there": with no return
    // to un-latch it, an actor that ran its path is still `finished` at the end.
    expect(a.finished, "the actor never ran out of path at all").toBe(true);
  });

  it("…and the same actor does come back once he is genuinely clear of it", () => {
    // The control for the test above: the same path, the same arc, the student
    // moved along his own kerb until arc 0 is more than the clearance away.
    // Without this the 0 above could be „this geometry never returns at all".
    const a = probe(HOOK, 0);
    const e = env({ hasPlayer: true, playerX: 0, playerY: -80 });
    runOut(a, e);
    expect(a.returns).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// §3 — the price of a second car, in both directions
// ---------------------------------------------------------------------------

describe("FR-B5-CROSS — the car that comes back is not the one that hits him", () => {
  it("a returning actor brakes for a student crossing its road, at every phase", () => {
    // ONE OFFSET WOULD PROVE NOTHING. The actor takes 3.56 s to run from its
    // hold to the crossing point, and a student who sets off a couple of
    // seconds either side of that simply misses it — a single lucky phase is
    // a test that passes on a car driving through an empty junction. So the
    // whole window is swept, one metre at a time, and the WORST is the answer.
    const a = probe(BOULEVARD, BOULEVARD_HOLD_M);
    // Park him far off the west end so the first run completes and the actor
    // comes back round; then he becomes the student crossing at the junction.
    const e = env({ hasPlayer: true, playerX: -200, playerY: 100 });
    runOut(a, e);
    expect(a.returns, "setup: the actor has to have come back").toBeGreaterThan(
      0,
    );

    let worst = Infinity;
    let worstAt = 0;
    for (let y0 = -40; y0 <= -5; y0 += 1) {
      // `reset` puts the actor back on its authored hold at a standstill —
      // the orchestrator's own re-arm — so every phase starts from the same
      // pose and the ONLY variable is where the student is when it sets off.
      // It leaves `returns` alone, which is what keeps the guard armed.
      applyStagedCommand(a, { type: "reset" }, e);
      let py = y0;
      e.playerX = 4.0625;
      e.playerY = py;
      e.playerSpeedMps = 16 / 3.6;
      applyStagedCommand(a, { type: "cruise" }, e);
      // He crosses the boulevard at x = 4.06 — the give-way drill's own lane —
      // driving north at 16 км/ч, the pace that drill's exit leg is driven at.
      let closest = Infinity;
      for (let i = 0; i < 30 * 60 && py <= 60; i++) {
        py += (16 / 3.6) * DT;
        e.playerY = py;
        updateStagedVehicle(a, DT, e);
        closest = Math.min(
          closest,
          Math.hypot(a.state.x - 4.0625, a.state.y - py),
        );
      }
      if (closest < worst) {
        worst = closest;
        worstAt = y0;
      }
    }
    // MEASURED across the sweep, worst phase reported:
    //
    //   no crossing guard at all      0.57 m  — a 10-point contact
    //   guard, 16 m lateral window    1.18 m  — worse than useless: it braked
    //                                           too late and came to rest 5.2 m
    //                                           from the lane centre, which is
    //                                           the student driving into a
    //                                           STANDING car, doc 87 item 4
    //   guard, CROSS_WATCH_M = 25 m   6.13 m
    //
    // The bar is one bumper-to-bumper length: `b5-junction-mouth-clear` calls
    // anything under 4.1 m a contact on this very map, and the guard aims to
    // stop GUARD_STOP_SHORT_M = 6 m short of him along its own arc.
    expect(
      worst,
      `worst closest approach ${worst.toFixed(2)} m, from a start at y = ${worstAt}`,
    ).toBeGreaterThan(4.1);
  });

  it("…and it does not tuck in behind a student driving alongside it instead of passing", () => {
    // The other direction, and the one that cost three suites when the guard
    // was written without it: `sc-lndc-target` covered 231 m of a 150 s window
    // instead of 2,093 because the returning actor caught the crawling student
    // and then FOLLOWED him at 6 m for the rest of the lesson. A car one lane
    // over is not in your way, and braking for it is not caution.
    const straight = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
    ];
    const a = probe(straight, 0);
    let px = 100;
    const e = env({
      hasPlayer: true,
      playerX: px,
      playerY: 8.13,
      playerSpeedMps: 3,
    });
    applyStagedCommand(a, { type: "cruise" }, e);
    let bestLead = -Infinity;
    for (let i = 0; i < 300 * 60; i++) {
      px += 3 * DT;
      e.playerX = px;
      updateStagedVehicle(a, DT, e);
      if (a.returns > 0 && !a.finished)
        bestLead = Math.max(bestLead, a.state.x - px);
    }
    expect(a.returns, "setup: the actor has to have come back").toBeGreaterThan(
      0,
    );
    // 20 m clear of him, ON ITS SECOND RUN. A follower pinned by the guard
    // parks 6 m BEHIND, so this is negative for it by ~26 m.
    expect(
      bestLead,
      `the returning actor got ${bestLead.toFixed(1)} m past the student at best`,
    ).toBeGreaterThan(20);
  });
});
// ---------------------------------------------------------------------------
// §4 — the price again, at the pace a LEARNER actually crosses at (verifier,
//      2026-08-23). §3 sweeps the phase but drives one speed, 16 км/ч, and
//      `CROSS_WATCH_M` is a window in METRES OFF THE PATH — which is a window
//      in SECONDS only for the speed it was fitted to. At 5–8 км/ч the student
//      is still outside a 25 m window when the actor's own 16 m arc window
//      opens, so the guard engaged at ahead ≈ 7 m and the actor braked to rest
//      AT the crossing point (x = 4.28 against a lane centre of 4.0625) and
//      held there while he crawled into it — doc 87 item 4, manufactured by
//      the guard written to prevent it.
//
//      This is the real map through the production stack, and it is scoped to
//      STAGED bodies on purpose: `jxg-giveway-v1` carries pre-existing AMBIENT
//      contacts at 5–6 км/ч (ids 0 and 2, at y ≈ 153–154) that are identical
//      with this whole lane reverted, and they are not this file's to close.
// ---------------------------------------------------------------------------

/** Roll to the Б1 line, wait, cross at `crossKmh`, optionally stall at
 *  `stallY` in the junction box — and report the closest any STAGED body ever
 *  came to the student once he was under way. */
function closestStagedApproach(
  waitSec: number,
  crossKmh: number,
  stallY: number,
): { d: number; id: number; playerY: number; tSec: number } {
  const lesson = compileScenario(SC_JX_GIVEWAY_B1, 1);
  const traffic = createTrafficSystem(
    loadDistrict("jxg-giveway-v1") as TrafficDistrict,
    {
      anchor: { x: JXG_LANE_X, y: -115 },
      anchorRadiusM: lesson.traffic?.anchorRadiusM ?? 400,
      vehicleCount: 4,
      pedestrianCount: 0,
    },
  );
  const director = createScenarioDirector(lesson.stagedEvents ?? [], traffic, {
    seed: lessonSeed(lesson.id),
  });
  let t = 0;
  let py = -115;
  let pv = 0;
  let holdUntil = 0;
  let phase: 0 | 1 | 2 | 3 = 0;
  let worst = { d: Infinity, id: -1, playerY: 0, tSec: 0 };
  while (t <= LESSON_SEC) {
    if (phase === 0) {
      pv = 22 / 3.6;
      py += pv * DT;
      if (py >= JXG_YIELD_Y) {
        py = JXG_YIELD_Y;
        phase = 1;
        holdUntil = t + waitSec;
      }
    } else if (phase === 1) {
      pv = 0;
      if (t >= holdUntil) phase = 2;
    } else if (phase === 2) {
      pv = crossKmh / 3.6;
      py += pv * DT;
      if (py >= stallY) {
        py = stallY;
        phase = 3;
      }
    } else {
      pv = 0;
    }
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: JXG_LANE_X, y: py },
      playerSpeedKmh: pv * 3.6,
      playerHeadingDeg: 0,
    });
    director.step({
      tSec: t,
      dtSec: DT,
      x: JXG_LANE_X,
      y: py,
      speedKmh: pv * 3.6,
      headingDeg: 0,
      brakePedal: pv === 0 ? 1 : 0,
      tickEvents: [],
    });
    if (phase >= 2) {
      for (const v of traffic.vehicles) {
        if (v.id < STAGED_STATE_ID_BASE) continue; // ambient debt, not this lane
        const d = Math.hypot(v.x - JXG_LANE_X, v.y - py);
        if (d < worst.d) worst = { d, id: v.id, playerY: py, tSec: t };
      }
    }
    t += DT;
  }
  return worst;
}

describe("FR-B5-CROSS — the returning car at a learner's crossing pace", () => {
  // 16 км/ч is §3's speed and was clear before this test existed; the rest are
  // the paces that were never driven. `b5-junction-mouth-clear` drives this
  // same drill at 16 км/ч, so this is the missing axis, not a duplicate.
  for (const crossKmh of [16, 10, 8, 6, 5]) {
    for (const wait of [15, 25, 40]) {
      it(
        `crosses at ${crossKmh} км/ч after a ${wait} s wait without being touched`,
        () => {
          const w = closestStagedApproach(wait, crossKmh, 250);
          // MEASURED at CROSS_WATCH_M = 25: 8 км/ч after a 25 s wait produced a
          // 0.85 m contact with staged id 1000 at y = 150.07, t = 77.6 s. At 60
          // the same drive keeps 6.00 m. The bar is one bumper-to-bumper
          // length, the 4.1 m `b5-junction-mouth-clear` calls a contact here.
          expect(
            w.d,
            `staged id ${w.id} came ${w.d.toFixed(2)} m from him at y=${w.playerY.toFixed(2)}, t=${w.tSec.toFixed(1)} s`,
          ).toBeGreaterThan(4.1);
        },
        120000,
      );
    }
  }

  it("…and does not run down a student who STALLS in the junction box", () => {
    // The other half of the same defect: he creeps out and stops. MEASURED at
    // CROSS_WATCH_M = 25, stalling at y = 156 after a 25 s wait: staged id 1000
    // at 0.85 m. Neither this nor the rows above exist with FR-B5-RETURN alone
    // — the actor never came back — so both were made by this repair.
    let worst = { d: Infinity, id: -1, playerY: 0, tSec: 0 };
    for (const wait of [15, 25, 40]) {
      for (const stallY of [148, 152, 156]) {
        const w = closestStagedApproach(wait, 8, stallY);
        if (w.d < worst.d) worst = w;
      }
    }
    expect(
      worst.d,
      `staged id ${worst.id} came ${worst.d.toFixed(2)} m from a stalled student at y=${worst.playerY.toFixed(2)}`,
    ).toBeGreaterThan(4.1);
  }, 300000);
});
