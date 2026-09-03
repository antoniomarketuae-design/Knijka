/**
 * sc-merge-accel-lane:09e6d6f4 (critical) — „AT ARRIVAL THE WORLD IS A PLAIN
 * TWO-LANE STRIP THROUGH OPEN GRASS FIELDS — NO RAMP AND NO ACCELERATION LANE
 * — while the briefing says «Потегли по рампата и набирай скорост още по нея»."
 *
 * MOST OF THAT ROW IS REFUTED BY THE MAP, and the refutation is pinned in
 * `world/__tests__/mw-district.test.ts` and `world/__tests__/merge-districts
 * .test.ts` rather than re-derived here: `mwe-e-ramp` is a 143.6 m one-way link
 * the student spawns 20 m up and which has carried a Д5 «Начало на
 * автомагистрала» since wave 21; `mwe-e-nb-accel` is the 200 m curb lane that
 * carries no `emergencyLane` span, so `markings.ts` opens the wide М2 seam for
 * exactly those metres between two continuous ones; and the 6 m median carries
 * 156 panels of ограничителна система since wave 8.
 *
 * WHAT WAS TRUE IS THAT NOTHING MOVED. And the dial that exists for precisely
 * that — `ScenarioSpec.traffic`, the product's answer to „the empty world"
 * (doc 86 L12) — is DEAD on this map, measured through the production
 * `createTrafficSystem`: **0 ambient vehicles at vehicleCount 0, 2, 4, 6, 8 and
 * 12 alike**, because `buildLaneGraph` reports `loopLanes` = 1 of 5 lanes (five
 * one-way dead-end strips have no strongly connected component to close a loop
 * through) and `buildRoutes` therefore returns nothing. Authoring a count here
 * would have shipped a number no consumer reads — the dead-predicate failure
 * this project has paid for 51 times. So the flow is STAGED, and this file is
 * the gate on it: `MWE_ONCOMING_FLOW`, six cars on `mwe-e-sb`.
 *
 * THE STACK IS REAL (the merging-route-vs-staged mold): the committed
 * content/world district through `createTrafficSystem` with ambient zeroed, and
 * the PRODUCTION `OncomingStreamRunner`. Only the player is synthetic.
 *
 * WHAT EACH SUITE WOULD MISS IF IT WERE DECORATION:
 *  · deleting `MWE_ONCOMING_FLOW` from `SC_MERGE_ACCEL_LANE.staged` — every
 *    test below reads the spec off the template, so the file cannot resolve it;
 *  · moving the column onto the аварийна лента (drop `extraRightOffsetM`) —
 *    suite 2 reddens, and it must, because this drill's own instruction 6 is
 *    «вдясно вече е аварийната лента — там не се кара»;
 *  · putting it back behind the driver (`hold.offsetM` deep) — suite 3;
 *  · letting it grade something (`playerGuard`, a contact) — suite 4.
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
import { buildLaneGraph } from "../../../traffic/graph";
import type { TrafficDistrict } from "../../../traffic/types";
import { SC_MERGE_ACCEL_LANE } from "../templates-merging";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const DT = 1 / 30;

/** mw-entry-v1 meta.scenario — re-pinned here, the battery convention. */
const DISTRICT_ID = "mw-entry-v1";
/** The southbound carriageway centreline = its laneId 1, the right travel lane. */
const SB_CENTRE_X = -30.37;
/** One lane pitch (LANE_WIDTH_M at the 2.5× perceptual road scale). */
const LANE_PITCH_M = 8.125;
/** The ramp spawn pose (`mwe-spawn-ramp`), the pose the row was filed on. */
const SPAWN = { x: 35.56, y: 139.5, headingDeg: 347.18 };

function district(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

/** The staged column, read off the template so a deletion cannot go unnoticed. */
function stream(): OncomingStreamSpec {
  const found = (SC_MERGE_ACCEL_LANE.staged ?? []).find((s) => s.kind === "oncomingStream");
  if (!found) {
    throw new Error(
      "SC_MERGE_ACCEL_LANE stages no oncomingStream — the магистрала is empty again " +
        "(sc-merge-accel-lane:09e6d6f4)",
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
  const runner = new OncomingStreamRunner(stream());
  // Fixed jitter draw: every probe replays bit-identically (battery convention).
  runner.stage(tr, () => 0.5, true);
  return { tr, runner };
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
// 1. The dial that could not have done this — the measurement behind the actor
// ---------------------------------------------------------------------------

describe("mw-entry-v1 — why the flow had to be staged", () => {
  it("carries no ambient vehicle at ANY count: its one-way strips close no loop", () => {
    const d = district(DISTRICT_ID);
    for (const vehicleCount of [2, 4, 6, 8, 12]) {
      const tr = createTrafficSystem(d, { seed: 7, vehicleCount, pedestrianCount: 0 });
      expect(
        tr.stats.vehicleCount,
        `vehicleCount ${vehicleCount} put cars on mw-entry-v1 — the ambient dial is ALIVE here ` +
          "now, so the staged column may be reconsidered (and this test rewritten)",
      ).toBe(0);
    }
  });

  it("…and the reason is in the lane graph, not in the count", () => {
    const g = buildLaneGraph(district(DISTRICT_ID), {
      laneWidthM: LANE_PITCH_M,
      excludedRoadClasses: [],
      crossingSignalRadiusM: 40,
    });
    // Five one-way edges ⇒ five directed lanes, and the largest strongly
    // connected component is a single lane: `buildRoutes` can close no loop.
    expect(g.lanes.length).toBe(5);
    expect(g.loopLanes.size).toBeLessThan(2);
  });
});

// ---------------------------------------------------------------------------
// 2. The column is on a lane a car may lawfully use
// ---------------------------------------------------------------------------

describe("MWE_ONCOMING_FLOW — six cars, and every one of them in a travel lane", () => {
  it("stages the whole column on the southbound RIGHT TRAVEL lane, never the аварийна", () => {
    const { tr } = armed();
    const spec = stream();
    expect(spec.count).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < spec.count; i++) {
      const car = tr.staged(`${spec.id}-${i}`);
      expect(car, `car ${i} did not stage`).toBeTruthy();
      // laneId 1 sits ON the centreline; laneId 0 (the аварийна лента, zone
      // `mwe-z-emerg-sb`, the whole 960 m) is one pitch further out at −38.5,
      // and laneId 2 (the overtaking lane) one pitch in at −22.2. Half a pitch
      // of tolerance therefore separates all three.
      expect(
        Math.abs(car!.x - SB_CENTRE_X),
        `car ${i} at x=${car!.x.toFixed(2)} is not in the southbound right travel lane`,
      ).toBeLessThan(LANE_PITCH_M / 2);
    }
  });

  it("is spaced as a column and not a clump: a real headway between every pair", () => {
    const { tr } = armed();
    const spec = stream();
    const ys: number[] = [];
    for (let i = 0; i < spec.count; i++) ys.push(tr.staged(`${spec.id}-${i}`)!.y);
    ys.sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      // The stream-collapse failure this file's sibling MFP_STREAM documents is
      // several bodies staged in the SAME metre, which renders as one car.
      expect(ys[i] - ys[i - 1], `cars ${i - 1} and ${i} are ${ys[i] - ys[i - 1]} m apart`)
        .toBeGreaterThan(60);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. THE ROW ITSELF — is it in the windscreen at arrival, and does it move?
// ---------------------------------------------------------------------------

describe("the arrival frame the row was filed on", () => {
  it("puts at least four cars AHEAD of the ramp spawn and inside ±20° of the eye line", () => {
    const { tr } = armed();
    const spec = stream();
    let inFrame = 0;
    for (let i = 0; i < spec.count; i++) {
      const car = tr.staged(`${spec.id}-${i}`)!;
      const eye = inEye(car.x, car.y);
      // ±20° is deliberately inside any plausible horizontal field of view, so
      // this asserts „in front of the driver", not „the camera renders it".
      if (eye.forwardM > 20 && Math.abs(eye.offAxisDeg) <= 20) inFrame++;
    }
    expect(
      inFrame,
      "the column is not where the student is looking at arrival — which is the whole finding",
    ).toBeGreaterThanOrEqual(4);
  });

  it("is already RELEASED and travelling before the student touches anything", () => {
    const { tr, runner } = armed();
    const spec = stream();
    const startY = tr.staged(`${spec.id}-0`)!.y;
    let travelled = 0;
    let t = 0;
    for (let i = 0; i < 20 * 30; i++) {
      t += DT;
      tr.update(DT, {
        signalPhase: () => "green",
        playerPos: { x: SPAWN.x, y: SPAWN.y },
        playerSpeedKmh: 0,
        playerHeadingDeg: SPAWN.headingDeg,
      });
      runner.step(tr, playerInput(SPAWN.x, SPAWN.y, 0, t), []);
      // MEASURED AS THE FURTHEST IT GOT, not as its final pose, and the
      // difference is the actor's own behaviour rather than a nicety: the head
      // runs its 260 m of remaining path out in ~15 s, latches `finished` and
      // RE-ENTERS at its hold (staged.ts FR-B5-RETURN). Reading the last frame
      // would have measured the re-entry and reported the road dead — which is
      // exactly backwards, because the recycle is why the магистрала stays
      // alive for the whole 55 s par time and not only for the first lap.
      travelled = Math.max(travelled, startY - tr.staged(`${spec.id}-0`)!.y);
    }
    // Southbound = decreasing y. A stationary student must not freeze the road:
    // `releaseKmh` 0 is what makes the arrival frame a живо платно.
    expect(
      travelled,
      "the column never left its hold while the student sat still — the road is dead again",
    ).toBeGreaterThan(200);
  });

  it("recycles, so the road is still alive at the end of the drive", () => {
    const { tr, runner } = armed();
    const spec = stream();
    let t = 0;
    let aliveFrames = 0;
    const FRAMES = 60 * 30;
    for (let i = 0; i < FRAMES; i++) {
      t += DT;
      // The student drives his own bank at a steady 90 км/ч; what is measured
      // is only whether SOMETHING is moving on the one across the median.
      const py = SPAWN.y + 25 * t;
      tr.update(DT, {
        signalPhase: () => "green",
        playerPos: { x: 0, y: py },
        playerSpeedKmh: 90,
        playerHeadingDeg: 0,
      });
      runner.step(tr, playerInput(0, py, 90, t), []);
      for (let k = 0; k < spec.count; k++) {
        const car = tr.staged(`${spec.id}-${k}`);
        if (car && !car.finished && car.speedMps > 5 && Math.abs(car.y - py) < 400) {
          aliveFrames++;
          break;
        }
      }
    }
    // The floor is deliberately far below the measured value: this reports a
    // regression, not the weather.
    expect(
      (aliveFrames / FRAMES) * 100,
      "the насрещно платно was empty for most of the drive",
    ).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------------------
// 4. …and it grades NOTHING (doc 72 FO-07), on the taught drive
// ---------------------------------------------------------------------------

function playerInput(x: number, y: number, speedKmh: number, tSec: number): DirectorInput {
  return {
    x,
    y,
    headingDeg: 0,
    speedKmh,
    dtSec: DT,
    tSec,
  } as unknown as DirectorInput;
}

describe("learn-only, and out of reach", () => {
  it("emits ZERO SimTick events and stays a carriageway away over the whole taught drive", () => {
    const { tr, runner } = armed();
    const spec = stream();
    const out: SimTickEvent[] = [];
    // The taught drive, as geometry: up the ramp to the nose, 180 m of
    // acceleration lane, the merge before the taper, then the mainline.
    const path: Array<[number, number]> = [
      [SPAWN.x, SPAWN.y],
      [8.13, 260],
      [8.13, 440],
      [0, 480],
      [0, 930],
    ];
    let leg = 0;
    let px = path[0][0];
    let py = path[0][1];
    const speedMps = 25;
    let t = 0;
    let closestM = Infinity;
    for (let i = 0; i < 90 * 30 && leg < path.length - 1; i++) {
      t += DT;
      const [tx, ty] = path[leg + 1];
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
      runner.step(tr, playerInput(px, py, speedMps * 3.6, t), out);
      for (let k = 0; k < spec.count; k++) {
        const car = tr.staged(`${spec.id}-${k}`);
        if (!car || car.finished) continue;
        closestM = Math.min(closestM, Math.hypot(car.x - px, car.y - py));
      }
    }
    expect(out, "the oncoming column graded something — FO-07 says it may not").toEqual([]);
    // The median is 6 m of ground the barrier now closes; the two carriageway
    // centrelines are 30.37 m apart and the player never leaves his own bank,
    // so a lane-and-a-half of clearance is the least this can ever measure.
    expect(
      closestM,
      `the column came within ${closestM.toFixed(1)} m of the student's own path`,
    ).toBeGreaterThan(2 * LANE_PITCH_M);
  });

  it("resolves without ever claiming the student failed anything", () => {
    const { tr, runner } = armed();
    let t = 0;
    let outcome: ReturnType<OncomingStreamRunner["step"]> = null;
    for (let i = 0; i < 120 * 30 && outcome === null; i++) {
      t += DT;
      const py = 139.5 + 25 * t;
      tr.update(DT, {
        signalPhase: () => "green",
        playerPos: { x: 0, y: py },
        playerSpeedKmh: 90,
        playerHeadingDeg: 0,
      });
      outcome = runner.step(tr, playerInput(0, py, 90, t), []);
    }
    expect(outcome, "the stream never resolved on a full-length drive").not.toBeNull();
    expect(outcome!.detail).not.toBe("violation");
    expect(outcome!.detail).not.toBe("collision");
  });
});
