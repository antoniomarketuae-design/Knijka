/**
 * Test support — watch the STAGED CARS of a recorded demo.
 *
 * `recordScriptedDrive` hands back the ego's trace, the rule events and the
 * staged outcomes, but never where the staged cars were or how fast they were
 * going. The roundabout demos' central claim since the founder ruling of
 * 2026-10-05 («bill forced braking») is a claim ABOUT those cars: the barge
 * „really cuts someone off" — a circulating car HAS TO BRAKE because of it.
 *
 * So the demo is replayed with a PARALLEL production stack (same modules, same
 * seed, same staged specs), fed the recorder's own per-frame ego pose through
 * `onTick`. The ego's motion is authored and never reacts to traffic, so that
 * pose stream is ground truth and the staged cars here are the ones the
 * recording was graded against. A second parallel stack is told nothing about
 * the ego at all: its cars do what they would have done had he not been there,
 * which is the only honest meaning of «because of him».
 *
 * (The sc-rb-busy-gap gate grew its own twin first — `replayWithActors` — for
 * positions only; this is the same idea with speeds and the no-ego world.)
 */

import type { StagedEventSpec } from "../../contracts";
import { createScenarioDirector } from "../../orchestrator";
import type { SimTick } from "../../rules";
import { createWorldRuntime } from "../../runtime";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict } from "../../traffic/types";

export interface StagedCarFrame {
  x: number;
  y: number;
  /** Published speed with the ego in the world, m/s. */
  speedMps: number;
  /** Published speed on the same frame of the world that never saw him, m/s. */
  aloneMps: number;
  /** Centre-to-centre distance to the ego, m. */
  distM: number;
}

export interface StagedFrame {
  tSec: number;
  px: number;
  py: number;
  pHeadingDeg: number;
  pSpeedKmh: number;
  cars: Record<string, StagedCarFrame>;
}

/**
 * Replay a recorded demo and return one frame per recorder tick with every
 * listed staged car in it. `record` is the lesson's own recording entry
 * (`recordSc…Drive(district, name, { onTick })`).
 */
export function replayWithStagedCars(
  districtRaw: unknown,
  staged: readonly StagedEventSpec[],
  ids: readonly string[],
  record: (onTick: (tick: SimTick) => void) => unknown,
): StagedFrame[] {
  const dt = 1 / 60;
  const build = () => {
    const runtime = createWorldRuntime(districtRaw);
    const traffic = createTrafficSystem(districtRaw as TrafficDistrict, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    const director = createScenarioDirector([...staged], traffic, { seed: 7, signals: runtime });
    return { runtime, traffic, director };
  };
  const withHim = build();
  const alone = build();
  const frames: StagedFrame[] = [];
  record((tick) => {
    for (const [w, seesHim] of [[withHim, true], [alone, false]] as const) {
      w.runtime.update(dt);
      w.traffic.update(
        dt,
        seesHim
          ? {
              signalPhase: (id) => w.runtime.signalPhase(id),
              playerPos: { x: tick.position.x, y: tick.position.y },
              playerSpeedKmh: tick.speedKmh,
              playerHeadingDeg: tick.headingDeg,
            }
          : { signalPhase: (id) => w.runtime.signalPhase(id), playerPos: null },
      );
      w.director.step({
        tSec: tick.t,
        dtSec: dt,
        x: tick.position.x,
        y: tick.position.y,
        speedKmh: tick.speedKmh,
        headingDeg: tick.headingDeg,
        brakePedal: 0,
        // The runner arms, syncs and locks on the ego's pose alone; the world
        // that never saw him gets no grading events either.
        tickEvents: seesHim ? tick.events : [],
      });
    }
    const cars: Record<string, StagedCarFrame> = {};
    for (const id of ids) {
      const a = withHim.traffic.staged(id);
      const b = alone.traffic.staged(id);
      if (!a || !b) continue;
      cars[id] = {
        x: a.x,
        y: a.y,
        speedMps: a.speedMps,
        aloneMps: b.speedMps,
        distM: Math.hypot(a.x - tick.position.x, a.y - tick.position.y),
      };
    }
    frames.push({
      tSec: tick.t,
      px: tick.position.x,
      py: tick.position.y,
      pHeadingDeg: tick.headingDeg,
      pSpeedKmh: tick.speedKmh,
      cars,
    });
  });
  return frames;
}

/**
 * The first frame time at which the NOSE of the ego (centre + half the chassis
 * along the heading) is within `ringEdgeM` of the ring centre — where a
 * roundabout entry begins. rb-mini / rb-ped: 18 + 8.125 / 2 = 22.0625.
 */
export function noseOnRingAtSec(
  frames: readonly StagedFrame[],
  ringEdgeM: number,
  centre: { x: number; y: number } = { x: 0, y: 0 },
  halfLengthM = 2.02,
): number | null {
  for (const f of frames) {
    const rad = (f.pHeadingDeg * Math.PI) / 180;
    const nx = f.px + Math.sin(rad) * halfLengthM - centre.x;
    const ny = f.py + Math.cos(rad) * halfLengthM - centre.y;
    if (Math.hypot(nx, ny) <= ringEdgeM) return f.tSec;
  }
  return null;
}

/** What one staged car went through over a stretch of frames. */
export interface CarStory {
  /** Speed it lost that its no-ego twin did not lose on the same frame, m/s. */
  lostToHimMps: number;
  /** Its slowest speed, and the no-ego twin's slowest, m/s. */
  minMps: number;
  aloneMinMps: number;
  /** First frame time by which it had lost `forcedMps` to him, or null. */
  forcedAtSec: number | null;
  /** Its closest approach to the ego, m. */
  nearestM: number;
}

export function carStory(
  frames: readonly StagedFrame[],
  id: string,
  opts: { fromSec?: number; toSec?: number; forcedMps?: number } = {},
): CarStory {
  const forcedMps = opts.forcedMps ?? 0.3;
  const story: CarStory = { lostToHimMps: 0, minMps: Infinity, aloneMinMps: Infinity, forcedAtSec: null, nearestM: Infinity };
  let prev: StagedCarFrame | null = null;
  for (const f of frames) {
    const c = f.cars[id];
    if (!c) continue;
    const inside = f.tSec >= (opts.fromSec ?? -Infinity) && f.tSec <= (opts.toSec ?? Infinity);
    if (inside) {
      if (prev) {
        story.lostToHimMps += Math.max(
          0,
          Math.max(0, prev.speedMps - c.speedMps) - Math.max(0, prev.aloneMps - c.aloneMps),
        );
        if (story.forcedAtSec === null && story.lostToHimMps >= forcedMps) story.forcedAtSec = f.tSec;
      }
      if (c.speedMps < story.minMps) story.minMps = c.speedMps;
      if (c.aloneMps < story.aloneMinMps) story.aloneMinMps = c.aloneMps;
      if (c.distM < story.nearestM) story.nearestM = c.distM;
    }
    prev = c;
  }
  return story;
}
