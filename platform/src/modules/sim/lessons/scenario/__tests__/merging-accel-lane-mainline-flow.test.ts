/**
 * sc-merge-accel-lane:09e6d6f4 (critical), the half the НАСРЕЩНО column cannot
 * reach — „AT ARRIVAL THE WORLD IS A PLAIN TWO-LANE STRIP THROUGH OPEN GRASS
 * FIELDS … while the briefing says «Потегли по рампата и набирай скорост още
 * по нея»."
 *
 * THE ROAD THE DRILL IS ABOUT HAD NO CARS ON IT. `merging-accel-lane-oncoming
 * -flow.test.ts` gates the column on `mwe-e-sb`, which answers „open grass
 * fields" — but that bank is 66 m off the ramp spawn laterally and its nearest
 * body subtends 22.5 px of a 2556 px phone frame. It is horizon, not flow.
 * MEASURED at the arrival pose through the production stack, the northbound
 * carriageway — the one instruction 3 sends him to read («къде е пролуката
 * между колиТЕ по магистралата и с каква скорост идват те») — carried exactly
 * one staged car, `MWE_MAINLINE_CAR`, dormant at (0, 30): 99 m BEHIND the
 * driver, because a rear-approach pace car cannot also be in his windscreen.
 *
 * `MWE_MAINLINE_FLOW` is the repair — the `MWD_FLOW_LEAD` recipe from
 * templates-sp.ts (sc-mw-discipline:3bec2af1, the same finding one lesson over)
 * applied here: bodies in the lane BEYOND the one the student merges into, so
 * they are flow he reads and never traffic he meets.
 *
 * THE FOUR THINGS THAT MAKE IT A REPAIR RATHER THAN A DECORATION, and every one
 * of them measured through the production `createTrafficSystem` +
 * `OncomingStreamRunner` on the committed district:
 *
 *   §1 it is IN THE WINDSCREEN at arrival and inside the radius the lesson
 *      renders traffic at — the failure the first repair of this row shipped;
 *   §2 it rides the OVERTAKING lane, one full pitch beyond the merge target, on
 *      every metre of its path — which is the whole safety argument;
 *   §3 it never closes on the taught drive: a student following the briefing
 *      stays a lane away from it for the whole route;
 *   §4 it grades NOTHING (doc 72 FO-07), which is also why the kind is
 *      `oncomingStream` and not `brakingLeadCar` — a lead carries a slam tier
 *      that can grade, and this drill's trace battery has a LEARN_ONLY set
 *      precisely so no staged actor here ever does.
 *
 * WATCHED RED on the way in, and one of the four is weaker than it reads —
 * recorded here rather than left for a later wave to discover. Re-authoring
 * `extraRightOffsetM` into the CRUISE lane reddens §2, both halves of it, and
 * deleting the actor from `SC_MERGE_ACCEL_LANE.staged` reddens all four
 * (every probe reads the spec off the template by id). But §3 stayed GREEN
 * under that mutation, at both paces: the flow accelerates away northbound, so
 * the only frames on which the taught route is beside it are the ones where the
 * student is still on the ramp or in the acceleration lane — a lane pitch away
 * from the cruise lane by construction. §3 therefore measures that the shipped
 * placement is clear, which is worth knowing; it is NOT the thing that keeps
 * the placement honest. §2 is.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { OncomingStreamSpec } from "../../../contracts";
import { OncomingStreamRunner } from "../../../orchestrator/runners";
import type { DirectorInput } from "../../../orchestrator/types";
import type { SimTickEvent } from "../../../rules";
import { createTrafficSystem } from "../../../traffic/system";
import { SCENARIO_TRAFFIC_DRAW_DISTANCE_M, type TrafficDistrict } from "../../../traffic/types";
import { SC_MERGE_ACCEL_LANE } from "../templates-merging";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const DT = 1 / 30;

const DISTRICT_ID = "mw-entry-v1";
/** mw-entry-v1 meta.scenario — the northbound lane centres. */
const X_CURB = 8.13;
const X_CRUISE = 0;
const X_LEFT = -8.12;
/** One lane pitch (LANE_WIDTH_M at the 2.5× perceptual road scale). */
const LANE_PITCH_M = 8.125;
/** The ramp spawn pose (`mwe-spawn-ramp`), the pose the row was filed on. */
const SPAWN = { x: 35.56, y: 139.5, headingDeg: 347.18 };

function district(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

/** The mainline column, by ID — the template stages two `oncomingStream`s. */
function flow(): OncomingStreamSpec {
  const found = (SC_MERGE_ACCEL_LANE.staged ?? []).find((s) => s.id === "sc-mrg-flow");
  if (!found) {
    throw new Error(
      "SC_MERGE_ACCEL_LANE stages no `sc-mrg-flow` — the магистрала the student is told " +
        "to merge into is empty again (sc-merge-accel-lane:09e6d6f4)",
    );
  }
  return found as OncomingStreamSpec;
}

function armed(): { tr: ReturnType<typeof createTrafficSystem>; runner: OncomingStreamRunner } {
  const tr = createTrafficSystem(district(DISTRICT_ID), {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new OncomingStreamRunner(flow());
  runner.stage(tr, () => 0.5, true);
  return { tr, runner };
}

function playerInput(x: number, y: number, speedKmh: number, tSec: number): DirectorInput {
  return { x, y, headingDeg: 0, speedKmh, dtSec: DT, tSec } as unknown as DirectorInput;
}

/** Where a point sits in the driver's own frame at the ramp spawn. */
function inEye(x: number, y: number): { forwardM: number; offAxisDeg: number } {
  const rad = (SPAWN.headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  const dx = x - SPAWN.x;
  const dy = y - SPAWN.y;
  const forwardM = dx * fx + dy * fy;
  const rightM = dx * fy - dy * fx;
  return { forwardM, offAxisDeg: (Math.atan2(rightM, forwardM) * 180) / Math.PI };
}

// ---------------------------------------------------------------------------
// §1. It is where the student is looking, and the renderer draws it
// ---------------------------------------------------------------------------

describe("MWE_MAINLINE_FLOW — the flow is in the windscreen at arrival", () => {
  it("stands AHEAD of the ramp spawn, inside ±20° of the eye line", () => {
    const { tr } = armed();
    const spec = flow();
    expect(spec.count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < spec.count; i++) {
      const car = tr.staged(`${spec.id}-${i}`);
      expect(car, `car ${i} did not stage`).toBeTruthy();
      const eye = inEye(car!.x, car!.y);
      // `MWE_MAINLINE_CAR` is the counter-example this asserts against: it holds
      // at (0, 30), forwardM ≈ −99, i.e. behind the driver's head.
      expect(eye.forwardM, `car ${i} is ${eye.forwardM.toFixed(0)} m in front`).toBeGreaterThan(50);
      expect(
        Math.abs(eye.offAxisDeg),
        `car ${i} is ${eye.offAxisDeg.toFixed(1)}° off the eye line`,
      ).toBeLessThanOrEqual(20);
    }
  });

  it("…and inside the radius the lesson actually RENDERS traffic at", () => {
    // The failure the FIRST repair of this row shipped: `TrafficLayer` writes a
    // zero-scale matrix past `SCENARIO_TRAFFIC_DRAW_DISTANCE_M`, so a body can
    // be staged, swept, gated and never drawn. Read off the constant, not a
    // literal, so a draw-distance change reddens the authoring.
    const { tr } = armed();
    const spec = flow();
    for (let i = 0; i < spec.count; i++) {
      const car = tr.staged(`${spec.id}-${i}`)!;
      const d = Math.hypot(car.x - SPAWN.x, car.y - SPAWN.y);
      expect(
        d,
        `car ${i} stands ${d.toFixed(0)} m out — past the ${SCENARIO_TRAFFIC_DRAW_DISTANCE_M} m cull`,
      ).toBeLessThanOrEqual(SCENARIO_TRAFFIC_DRAW_DISTANCE_M);
    }
  });

  it("is a пролука and not a clump: an honest motorway headway between them", () => {
    const { tr } = armed();
    const spec = flow();
    const ys: number[] = [];
    for (let i = 0; i < spec.count; i++) ys.push(tr.staged(`${spec.id}-${i}`)!.y);
    ys.sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      // Instruction 3 asks him to find the gap BETWEEN the cars. Two bodies in
      // the same 60 m render as one, and below 2 s of headway the drill would
      // be staging the tailgating it grades elsewhere.
      const gap = ys[i] - ys[i - 1];
      expect(gap, `cars ${i - 1} and ${i} are ${gap.toFixed(0)} m apart`).toBeGreaterThan(
        2 * spec.actor.cruiseSpeedMps,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// §2. The lane — the whole safety argument
// ---------------------------------------------------------------------------

describe("the overtaking lane, and never the one he merges into", () => {
  it("stages every car one full pitch BEYOND the merge target", () => {
    const { tr } = armed();
    const spec = flow();
    for (let i = 0; i < spec.count; i++) {
      const car = tr.staged(`${spec.id}-${i}`)!;
      expect(
        Math.abs(car.x - X_LEFT),
        `car ${i} at x=${car.x.toFixed(2)} is not in the northbound overtaking lane`,
      ).toBeLessThan(LANE_PITCH_M / 2);
      // Said the other way round, because this is the claim that matters: it is
      // not in the acceleration lane and not in the lane he merges into.
      expect(Math.abs(car.x - X_CURB)).toBeGreaterThan(LANE_PITCH_M / 2);
      expect(Math.abs(car.x - X_CRUISE)).toBeGreaterThan(LANE_PITCH_M / 2);
    }
  });

  it("stays in it for the whole run, not only at the hold", () => {
    const { tr, runner } = armed();
    const spec = flow();
    let t = 0;
    let worst = 0;
    for (let i = 0; i < 45 * 30; i++) {
      t += DT;
      tr.update(DT, {
        signalPhase: () => "green",
        playerPos: { x: SPAWN.x, y: SPAWN.y },
        playerSpeedKmh: 0,
        playerHeadingDeg: SPAWN.headingDeg,
      });
      runner.step(tr, playerInput(SPAWN.x, SPAWN.y, 0, t), []);
      for (let k = 0; k < spec.count; k++) {
        const car = tr.staged(`${spec.id}-${k}`);
        if (car && !car.finished) worst = Math.max(worst, Math.abs(car.x - X_LEFT));
      }
    }
    expect(worst, `the column wandered ${worst.toFixed(2)} m off the overtaking lane`).toBeLessThan(
      LANE_PITCH_M / 2,
    );
  });
});

// ---------------------------------------------------------------------------
// §3 + §4. The taught drive never meets it, and it grades nothing
// ---------------------------------------------------------------------------

/** The taught drive as geometry: up the ramp to the nose, the acceleration
 *  lane, the merge before the taper, then the mainline to the finish zone. */
const TAUGHT_ROUTE: ReadonlyArray<readonly [number, number]> = [
  [SPAWN.x, SPAWN.y],
  [X_CURB, 260],
  [X_CURB, 440],
  [X_CRUISE, 480],
  [X_CRUISE, 930],
];

/** Drive the taught route at one pace; report what the flow ever graded and how
 *  close it ever came. */
function driveTaught(speedMps: number): {
  events: SimTickEvent[];
  closestM: number;
  returns: number;
} {
  const { tr, runner } = armed();
  const spec = flow();
  const events: SimTickEvent[] = [];
  let leg = 0;
  let px = TAUGHT_ROUTE[0][0];
  let py = TAUGHT_ROUTE[0][1];
  let t = 0;
  let closestM = Infinity;
  let returns = 0;
  // 400 s of budget, not 60: the SLOW leg below is the audit harness's own
  // `CRUISE_KMH = 12`, which needs ~250 s to walk the 830 m route, and a probe
  // that timed out at the taper would have measured the safe half only.
  for (let i = 0; i < 400 * 30 && leg < TAUGHT_ROUTE.length - 1; i++) {
    t += DT;
    const [tx, ty] = TAUGHT_ROUTE[leg + 1];
    const dx = tx - px;
    const dy = ty - py;
    const d = Math.hypot(dx, dy);
    const step = speedMps * DT;
    if (d <= step) {
      px = tx;
      py = ty;
      leg++;
    } else {
      px += (dx / d) * step;
      py += (dy / d) * step;
    }
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: px, y: py },
      playerSpeedKmh: speedMps * 3.6,
      playerHeadingDeg: 0,
    });
    runner.step(tr, playerInput(px, py, speedMps * 3.6, t), events);
    for (let k = 0; k < spec.count; k++) {
      const car = tr.staged(`${spec.id}-${k}`);
      if (!car) continue;
      returns = Math.max(returns, car.returns ?? 0);
      if (car.finished) continue;
      closestM = Math.min(closestM, Math.hypot(car.x - px, car.y - py));
    }
  }
  return { events, closestM, returns };
}

describe("learn-only, and a lane away from the taught drive", () => {
  // THREE PACES, AND EACH ONE IS A DIFFERENT WAY TO MEET THIS ACTOR.
  //  · 90 is the drill's own taught pace.
  //  · 140 is the map's POSTED limit and the only speed that CLOSES on a 33 m/s
  //    flow — a single-pace probe would have certified the placement on the one
  //    leg that cannot fail.
  //  · 12 is the audit harness's own `CRUISE_KMH` (tools/mobile/lesson-audit
  //    .mjs, quoted in traffic/index.ts), and it is the one that reaches the
  //    RECYCLE. `OncomingStreamRunner` re-enters a finished car at its hold
  //    (staged.ts FR-B5-RETURN) — which on this one-way path is y = 220/340,
  //    i.e. ON the student's own stretch of road rather than 800 m away like
  //    the насрещно column's. A crawling student is the only one still there
  //    when a lap comes round, so he is the one who would find a car
  //    materialising beside him, and the claim in the template's own note that
  //    he does not is measured HERE rather than asserted there.
  for (const kmh of [12, 90, 140]) {
    it(`emits ZERO SimTick events and stays a lane clear at ${kmh} км/ч`, () => {
      const { events, closestM, returns } = driveTaught(kmh / 3.6);
      expect(events, "the mainline flow graded something — FO-07 says it may not").toEqual([]);
      if (kmh === 12) {
        // NON-VACUITY. This leg exists to meet the recycle; if the column never
        // laps inside it the separation below is measured against cars that
        // simply drove off and the probe proves nothing.
        expect(returns, "the crawl leg never reached a recycle — it is not testing one").
          toBeGreaterThan(0);
      }
      // A student who does what the briefing says is never within a lane pitch
      // of these bodies. Below that the actor would be a hazard he has to
      // avoid, on a drill whose graded channel is the mirror check and the
      // causeless slam.
      expect(
        closestM,
        `at ${kmh} км/ч the flow came within ${closestM.toFixed(1)} m of the taught route`,
      ).toBeGreaterThan(LANE_PITCH_M);
    });
  }

  it("resolves without ever claiming the student failed anything", () => {
    const { tr, runner } = armed();
    let t = 0;
    let outcome: ReturnType<OncomingStreamRunner["step"]> = null;
    for (let i = 0; i < 180 * 30 && outcome === null; i++) {
      t += DT;
      const py = SPAWN.y + 25 * t;
      tr.update(DT, {
        signalPhase: () => "green",
        playerPos: { x: X_CRUISE, y: py },
        playerSpeedKmh: 90,
        playerHeadingDeg: 0,
      });
      outcome = runner.step(tr, playerInput(X_CRUISE, py, 90, t), []);
    }
    expect(outcome, "the mainline flow never resolved on a full-length drive").not.toBeNull();
    expect(outcome!.detail).not.toBe("violation");
    expect(outcome!.detail).not.toBe("collision");
  });
});
