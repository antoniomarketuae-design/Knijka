/**
 * FR-B5-VAN / FR-B5-DEADLOCK / FR-B5-FREEZE (doc 87, the 2026-08-05 gate's
 * open list, item 4) — „A stationary van stands in the student's own lane in
 * the mouth of `jxg-giveway-v1`'s second junction."
 *
 * WHAT WAS FOUND BY DRIVING. Driving the drill CORRECTLY — stop at the Б1 line,
 * wait, then „щом пътят е чист, потегляш" — ended in a 10-point COLLISION at
 * y = 146.00 with a body parked in the junction box, and the lesson could not
 * be finished. Reproduced headlessly here, and it was THREE separate mechanisms
 * standing in the same place:
 *
 *  1. THE ЛЕПКА'S PATH ENDED AT THE JUNCTION. `SC_JX_GIVEWAY_TAILGATER` ran
 *     `jxg-n-s → jxg-n-j1 → jxg-n-j2`, and a staged actor that runs out of path
 *     stops on the last metre of it forever. Measured at five wait lengths:
 *     rest at (−4.06, 150.00) — the centre of mouth 2 — from t ≈ 27 s to the end
 *     of a 200 s run, every time.
 *  2. THE JUNCTION RESERVATION DEADLOCKED. A stopped ambient agent that held
 *     `jxg-n-j2` renewed the slot every frame without ever entering the box, so
 *     every other agent was denied and stopped too. With the player parked at
 *     the Б1 line — what instruction 4 orders — all six bodies were motionless
 *     by t = 71.7 s and none moved again.
 *  3. TWO BODIES 3 m APART FROZE EACH OTHER. The omnidirectional anti-overlap
 *     clamps measured „is anything within `sep` of my NEXT pose" from ANY
 *     angle, including behind — so a leader would not advance because its
 *     follower was inside the radius and vice versa. That pair came to rest ON
 *     the node (ambient at (−0.10, 154.06), the staged priority car at
 *     (2.88, 154.06)) and stayed 180 s: 1.18 m off the student's lane centre.
 *
 * The assertions below are the drive, not the mechanism: whatever the traffic
 * system does internally, nothing may stand still on the line the student is
 * told to drive, and nothing may touch him while he drives it correctly.
 */

import { describe, expect, it } from "vitest";

import { compileScenario } from "../../lessons/scenario/compile";
import {
  SC_JX_GIVEWAY_B1,
  SC_JX_GIVEWAY_TAILGATER,
} from "../../lessons/scenario/templates-junctions";
import { createScenarioDirector, lessonSeed } from "../../orchestrator";
import { loadDistrict } from "../../world/referents";
import { createTrafficSystem } from "../system";
import type { TrafficDistrict } from "../types";

/** Drawn northbound lane centre of jxg-giveway-v1 (the student's own lane). */
const LANE_X = 4.0625;
/** The mouth-2 Б1 line is at y = 122.275; the drill stops just short of it. */
const YIELD_Y = 118;
/** The last objective (`sc-jxgb-exit`) sits at y = 178. */
const EXIT_Y = 190;
const DT = 1 / 60;

interface DriveResult {
  /** Longest standstill (s) of any body ON the driven line, with its pose. */
  worstBlocker: { id: number; x: number; y: number; sec: number } | null;
  /** First bumper-range contact with any body while under way, if any. */
  contact: { id: number; playerY: number; tSec: number } | null;
  tailgaterRest: { x: number; y: number };
}

/**
 * Drive the drill the way its own instructions read: cruise up the tertiary
 * street, stop short of the mouth-2 Б1 line, wait `waitSec` for the priority
 * car, then cross and continue north to the exit.
 */
function driveTheDrill(waitSec: number, level: 1 | 3 | 5, ambient: number): DriveResult {
  const raw = loadDistrict("jxg-giveway-v1") as unknown;
  const lesson = compileScenario(SC_JX_GIVEWAY_B1, level);
  // The LIVE wiring (LessonScene): default seed, spawn anchor, compiled counts.
  const traffic = createTrafficSystem(raw as TrafficDistrict, {
    anchor: { x: LANE_X, y: -115 },
    anchorRadiusM: lesson.traffic?.anchorRadiusM ?? 400,
    vehicleCount: ambient,
    pedestrianCount: 0,
  });
  const director = createScenarioDirector(lesson.stagedEvents ?? [], traffic, {
    seed: lessonSeed(lesson.id),
  });

  let t = 0;
  let py = -115;
  let pv = 0;
  let holdUntil = 0;
  let phase: 0 | 1 | 2 | 3 = 0;
  const stillSince = new Map<number, number>();
  const worst = new Map<number, { x: number; y: number; sec: number }>();
  let contact: DriveResult["contact"] = null;

  while (t <= 200) {
    if (phase === 0) {
      pv = 22 / 3.6;
      py += pv * DT;
      if (py >= YIELD_Y) {
        py = YIELD_Y;
        phase = 1;
        holdUntil = t + waitSec;
      }
    } else if (phase === 1) {
      pv = 0;
      if (t >= holdUntil) phase = 2;
    } else if (phase === 2) {
      pv = 16 / 3.6;
      py += pv * DT;
      if (py >= EXIT_Y) {
        py = EXIT_Y;
        phase = 3;
      }
    } else {
      pv = 0;
    }

    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: LANE_X, y: py },
      playerSpeedKmh: pv * 3.6,
      playerHeadingDeg: 0,
    });
    director.step({
      tSec: t,
      dtSec: DT,
      x: LANE_X,
      y: py,
      speedKmh: pv * 3.6,
      headingDeg: 0,
      brakePedal: phase === 1 ? 1 : 0,
      tickEvents: [],
    });

    for (const v of traffic.vehicles) {
      // "On the driven line" = inside the corridor the student's car sweeps
      // AND still ahead of him, up to the exit. A body behind him is a car
      // queueing behind a stopped car, which is correct driving and not an
      // obstacle — the harness parks the player at the exit forever, so one
      // always accumulates there.
      const onLine = Math.abs(v.x - LANE_X) < 3.5 && v.y > py + 2 && v.y < EXIT_Y;
      if (v.speedMps < 0.2 && onLine) {
        if (!stillSince.has(v.id)) stillSince.set(v.id, t);
        const sec = t - stillSince.get(v.id)!;
        const w = worst.get(v.id);
        if (!w || sec > w.sec) worst.set(v.id, { x: v.x, y: v.y, sec });
      } else {
        stillSince.delete(v.id);
      }
      // Bumper-range contact while the drive is under way.
      if (contact === null && phase >= 1 && Math.hypot(v.x - LANE_X, v.y - py) < 4.1) {
        contact = { id: v.id, playerY: py, tSec: t };
      }
    }
    t += DT;
  }

  let worstBlocker: DriveResult["worstBlocker"] = null;
  for (const [id, w] of worst) {
    if (!worstBlocker || w.sec > worstBlocker.sec) worstBlocker = { id, ...w };
  }
  const tail = traffic.vehicles.find((v) => v.id === 1001)!;
  return { worstBlocker, contact, tailgaterRest: { x: tail.x, y: tail.y } };
}

describe("doc 87 item 4 — nothing stands in the mouth of jxg-giveway-v1's second junction", () => {
  // Eleven drives: the wait length is the variable the founder's run differed
  // by, and the failure used to depend on it (his correct drive hit a body; a
  // faster one did not). Rungs 1/3/5 carry 4/5/8 ambient cars.
  const CASES: Array<{ wait: number; level: 1 | 3 | 5; ambient: number }> = [
    { wait: 0, level: 1, ambient: 4 },
    { wait: 9, level: 1, ambient: 4 },
    { wait: 15, level: 1, ambient: 4 },
    { wait: 25, level: 1, ambient: 4 },
    { wait: 40, level: 1, ambient: 4 },
    { wait: 0, level: 3, ambient: 5 },
    { wait: 15, level: 3, ambient: 5 },
    { wait: 40, level: 3, ambient: 5 },
    { wait: 0, level: 5, ambient: 8 },
    { wait: 15, level: 5, ambient: 8 },
    { wait: 40, level: 5, ambient: 8 },
  ];

  for (const c of CASES) {
    it(
      `L${c.level}, ${c.wait} s at the Б1 line: the correct drive touches nothing`,
      () => {
        const r = driveTheDrill(c.wait, c.level, c.ambient);
        // Before the fix this reported `CONTACT id1000 playerY=150.15` at L3 —
        // the staged priority car frozen at (2.88, 154.06), 1.18 m off the
        // lane centre, on a drive that did everything the lesson asked.
        expect(
          r.contact,
          r.contact
            ? `hit vehicle ${r.contact.id} at player y=${r.contact.playerY.toFixed(2)}`
            : "",
        ).toBeNull();
      },
      60000,
    );
  }

  it(
    "no body stands still for a quarter-minute anywhere on the driven line",
    () => {
      // The obstacle is defined by DURATION, not by identity: a car that pauses
      // in traffic is a road; a car that has not moved in fifteen seconds in
      // the lane you are told to drive is a wall. Measured before the fix:
      // 180.2 s at (2.9, 154.1) — the junction box itself.
      for (const c of CASES) {
        const r = driveTheDrill(c.wait, c.level, c.ambient);
        const w = r.worstBlocker;
        expect(
          w === null || w.sec < 15,
          w
            ? `L${c.level}/${c.wait}s: id${w.id} stood ${w.sec.toFixed(1)} s at (${w.x.toFixed(2)}, ${w.y.toFixed(2)})`
            : "",
        ).toBe(true);
      }
    },
    300000,
  );

  it("the лепка's path runs PAST the second junction instead of ending in it", () => {
    // The authored half of the same defect: a staged actor stops on the last
    // metre of its path and never moves again, and that metre used to be the
    // node at (0, 150). The path now continues to the north arm's far end.
    expect(SC_JX_GIVEWAY_TAILGATER.actor.pathNodes).toEqual([
      "jxg-n-s",
      "jxg-n-j1",
      "jxg-n-j2",
      "jxg-n-n",
    ]);
    // …and it must actually resolve on this district's lane graph, or the
    // runner throws at stage time.
    const lesson = compileScenario(SC_JX_GIVEWAY_B1, 1);
    const traffic = createTrafficSystem(loadDistrict("jxg-giveway-v1") as TrafficDistrict, {
      anchor: { x: LANE_X, y: -115 },
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    expect(() =>
      createScenarioDirector(lesson.stagedEvents ?? [], traffic, { seed: lessonSeed(lesson.id) }),
    ).not.toThrow();
    const tail = traffic.staged(SC_JX_GIVEWAY_TAILGATER.id);
    expect(tail).not.toBeNull();
    // jxg-n-n is 90 m north of the junction — well past `sc-jxgb-exit` (y=178).
    expect(tail!.pathLengthM).toBeGreaterThan(300);
  }, 60000);

  it(
    "a stopped agent gives its junction slot back instead of locking the crossing",
    () => {
      // The deadlock, isolated: park the player ON the Б1 line for two minutes
      // (the taught behaviour) and let the ambient fleet meet the junction he
      // is blocking. Before the fix the slot read `holder 3, renewed 240.0` for
      // the whole run and every body was frozen; now the fleet keeps moving.
      const raw = loadDistrict("jxg-giveway-v1") as unknown;
      const traffic = createTrafficSystem(raw as TrafficDistrict, {
        anchor: { x: LANE_X, y: -115 },
        vehicleCount: 4,
        pedestrianCount: 0,
      });
      let t = 0;
      const stillSince = new Map<number, number>();
      const worstSec = new Map<number, number>();
      while (t <= 240) {
        traffic.update(DT, {
          signalPhase: () => "green",
          playerPos: { x: LANE_X, y: YIELD_Y },
          playerSpeedKmh: 0,
          playerHeadingDeg: 0,
        });
        for (const v of traffic.vehicles) {
          if (v.speedMps < 0.2) {
            if (!stillSince.has(v.id)) stillSince.set(v.id, t);
            const sec = t - stillSince.get(v.id)!;
            if (sec > (worstSec.get(v.id) ?? 0)) worstSec.set(v.id, sec);
          } else {
            stillSince.delete(v.id);
          }
        }
        t += DT;
      }
      // Two of the four legitimately queue behind the parked player and stay
      // there — you cannot drive through a stopped car. The rest must circulate:
      // before the fix ALL of them froze, which is what a locked junction looks
      // like from the seat.
      const frozen = [...worstSec.values()].filter((sec) => sec > 60).length;
      expect(frozen, `frozen bodies: ${JSON.stringify([...worstSec])}`).toBeLessThanOrEqual(2);
    },
    120000,
  );
});
