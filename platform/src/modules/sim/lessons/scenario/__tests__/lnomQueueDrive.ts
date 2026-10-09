/**
 * Test support for ln-obstacle-meeting-briefed-queue.test.ts — one careful
 * sc-ln-obstacle-meeting drive, replayed through the LIVE rung chain
 * (liveChainReplay: LessonScene's stack, the compiled rung, its seed), with
 * the oncoming lane sampled at every graded grid point.
 *
 * THE DRIVE. The shadow's own approach (own lane to y = 130 at the shadow's
 * speeds, stop), a wait of `pauseSec` at rest, then ONE look (left glance +
 * left indicator) and the shadow's own arc round the parked row at 12 km/h,
 * home, stop. Open loop after the look: it never looks again — the drive the
 * briefing describes («Чак когато насрещната лента е празна докрай: ляв мигач,
 * оглед и една спокойна дъга»), taken by a student who believed it.
 */
import type { StagedEventSpec } from "../../../contracts";
import { lessonSeed } from "../../../orchestrator/director";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import { compileScenario } from "../compile";
import { SC_LN_OBSTACLE_MEETING } from "../templates-lanes2";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

const X_OWN = 4.06;
const X_ONC = -4.06;
/** The road the oncoming lane is on (ov-narrow-v1: nm-n-start y 0 → nm-n-end y 240). */
const ROAD_Y0 = 0;
const ROAD_Y1 = 240;
/** «Over the axis»: the centre-line band is |x| < 0.81 (nm-district.test.ts) —
 *  a centre below +0.8 has put the car's nose into the oncoming half. */
export const COMMIT_X = 0.8;
/** A re-entry is a jump BACK up the road; a car driving its lane moves ≤ 0.2 m
 *  per grid point. */
const REENTRY_JUMP_M = 20;

export function lnomCarefulScript(pauseSec: number, approachKmh = 38): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 112]], targetKmh: approachKmh, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_OWN, 112], [X_OWN, 130]], targetKmh: 12 },
      { kind: "pause", sec: pauseSec, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        points: [
          [X_OWN, 130],
          [2, 138],
          [X_ONC, 146],
          [X_ONC, 166],
          [2, 176],
          [X_OWN, 186],
        ],
        targetKmh: 12,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 186], [X_OWN, 215]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

/** One oncoming car's appearance on the road ahead of the student. */
export interface OncomingArrival {
  /** Published vehicle-state id. */
  stateId: number;
  /** Session time it first stood on the road AHEAD of the student, southbound
   *  (or re-entered there), s. */
  t: number;
  /** Where it appeared. */
  y: number;
  /** The student at that instant. */
  player: { x: number; y: number; speedKmh: number };
  /** True when this is the same body coming round again (a re-entry jump). */
  reentry: boolean;
}

export interface LnomDriveOutcome {
  level: ScenarioLevel;
  pauseSec: number;
  replay: LiveReplayOutcome;
  /** The student came to rest in his own lane at the wait (first such point), s. */
  stoppedAt: number;
  /** Every appearance of an oncoming car on the road ahead, in order. */
  arrivals: OncomingArrival[];
  /** The lane is EMPTY: the first point after the stop at which every car
   *  that has appeared so far has gone by him and none stands ahead, s. */
  laneEmptyAt: number | null;
  /** He moved off (first point after the wait above 1 km/h), s. */
  movedOffAt: number | null;
  /** His centre crossed onto the axis (x < COMMIT_X), s. */
  committedAt: number | null;
  /** Closest any oncoming car stood AHEAD of him in his path while he was in
   *  the oncoming half (x < COMMIT_X), m centre to centre (Infinity: none). */
  minAheadWhileCommittedM: number;
}

export function driveLnomCareful(
  level: ScenarioLevel,
  pauseSec: number,
  approachKmh = 38,
  /** The template to compile — the shipped one unless a control swaps it. */
  spec: ScenarioSpec = SC_LN_OBSTACLE_MEETING,
): LnomDriveOutcome {
  const lesson = compileScenario(spec, level);
  const env = lesson.environment ?? {};
  const raw = loadDistrict(SC_LN_OBSTACLE_MEETING.map.districtId);
  const drive = recordScriptedDrive(raw, lnomCarefulScript(pauseSec, approachKmh), {
    scenarioId: SC_LN_OBSTACLE_MEETING.id,
    kind: "mistake",
    seed: lessonSeed(lesson.id),
    stagedEvents: [...(lesson.stagedEvents ?? [])] as StagedEventSpec[],
    vehicleCount: lesson.traffic?.vehicleCount ?? 0,
    pedestrianCount: lesson.traffic?.pedestrianCount ?? 0,
    isNight: env.timeOfDay === "night",
    collisionMinKmh: 0,
  });

  const arrivals: OncomingArrival[] = [];
  const lastY = new Map<number, number>();
  const aheadNow = new Set<number>();
  const arrivalsAheadLast = new Set<number>();
  let stoppedAt = -1;
  let laneEmptyAt: number | null = null;
  let movedOffAt: number | null = null;
  let committedAt: number | null = null;
  let minAheadWhileCommittedM = Infinity;

  const replay = liveChainReplay({
    lesson,
    districtRaw: raw,
    trace: drive.trace,
    holdAfterSec: 2,
    afterApply: (ctx) => {
      const px = ctx.tick.position.x;
      const py = ctx.tick.position.y;
      const v = Math.abs(ctx.tick.speedKmh);
      const t = ctx.t;
      if (stoppedAt < 0 && py > 125 && v < 0.5) stoppedAt = t;
      if (stoppedAt >= 0 && movedOffAt === null && t > stoppedAt + pauseSec * 0.5 && v > 1) movedOffAt = t;
      if (movedOffAt !== null && committedAt === null && px < COMMIT_X) committedAt = t;
      aheadNow.clear();
      for (const car of ctx.traffic.vehicles) {
        const southbound = car.dirY < -0.5;
        const onRoad = car.y >= ROAD_Y0 && car.y <= ROAD_Y1;
        const prev = lastY.get(car.id);
        const jumped = prev !== undefined && car.y - prev > REENTRY_JUMP_M;
        lastY.set(car.id, car.y);
        if (!southbound || !onRoad || car.y <= py) continue;
        aheadNow.add(car.id);
        const wasAhead = arrivalsAheadLast.has(car.id);
        if (!wasAhead || jumped) {
          arrivals.push({
            stateId: car.id,
            t,
            y: car.y,
            player: { x: px, y: py, speedKmh: v },
            reentry: jumped || arrivals.some((a) => a.stateId === car.id),
          });
        }
        if (px < COMMIT_X && Math.abs(car.x - px) < 2.6) {
          minAheadWhileCommittedM = Math.min(minAheadWhileCommittedM, car.y - py);
        }
      }
      arrivalsAheadLast.clear();
      for (const id of aheadNow) arrivalsAheadLast.add(id);
      if (stoppedAt >= 0 && laneEmptyAt === null && arrivals.length > 0 && aheadNow.size === 0) {
        laneEmptyAt = t;
      }
    },
  });
  return {
    level,
    pauseSec,
    replay,
    stoppedAt,
    arrivals,
    laneEmptyAt,
    movedOffAt,
    committedAt,
    minAheadWhileCommittedM,
  };
}
