/**
 * Shared fixtures for the A8 orchestrator tests — the integration suites run
 * the REAL production stack: content/world/district-v1.json through
 * createWorldRuntime + createTrafficSystem (ambient counts zeroed so staged
 * actors are the only other road users) + the scenario director, with the
 * rule engine folding every tick exactly like LessonPlayShell does.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { StagedEventSpec } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import {
  createRuleEngine,
  reduceTick,
  type RuleEngineState,
  type RuleEvent,
  type SimTick,
} from "../../rules";
import { createTrafficSystem } from "../../traffic/system";
import type { TrafficDistrict, TrafficSystem } from "../../traffic/types";
import { createScenarioDirector } from "../director";
import type { ScenarioDirector } from "../types";
import type { StagedEventOutcome } from "../../contracts";

let rawCache: TrafficDistrict | null = null;

/** Raw district JSON (satisfies both the runtime parser and traffic types). */
export function loadRawDistrict(): TrafficDistrict {
  if (!rawCache) {
    const path = fileURLToPath(
      new URL("../../../../../../content/world/district-v1.json", import.meta.url),
    );
    rawCache = JSON.parse(readFileSync(path, "utf8")) as TrafficDistrict;
  }
  return rawCache;
}

export interface Stack {
  runtime: DistrictWorldRuntime;
  traffic: TrafficSystem;
  director: ScenarioDirector;
  rules: RuleEngineState;
  ruleEvents: RuleEvent[];
  ticks: SimTick[];
  outcomes: StagedEventOutcome[];
  t: number;
}

/** Production wiring: runtime queries onto the traffic system + director.
 * B1a N2: the runtime doubles as the director's SignalDirectorPort (phase
 * pinning), exactly as LessonScene wires it; `signalOffsets` mirrors the
 * staged-exam session-start pinning option. */
export function makeStack(
  events: StagedEventSpec[],
  seed = 7,
  opts: { signalOffsets?: Readonly<Record<string, number>> } = {},
): Stack {
  const raw = loadRawDistrict();
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, {
    seed,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r, s) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r, s),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  const director = createScenarioDirector(events, traffic, {
    seed,
    signals: runtime,
    ...(opts.signalOffsets !== undefined ? { signalOffsets: opts.signalOffsets } : {}),
  });
  return {
    runtime,
    traffic,
    director,
    rules: createRuleEngine(),
    ruleEvents: [],
    ticks: [],
    outcomes: [],
    t: 0,
  };
}

export const DT = 1 / 30;

export interface PlayerFrame {
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
  brakePedal: number;
}

/** Optional per-frame vehicle/environment state for stepFrame (C1 revision:
 * the innocent-bot harness needs indicators, lights, night/rain and the
 * production leadGap wiring; defaults preserve the original behaviour). */
export interface FrameOpts {
  indicator?: "off" | "left" | "right";
  headlights?: "off" | "low" | "high";
  gear?: number;
  mirrorGlance?: "left" | "right" | "rear" | null;
  isNight?: boolean;
  rain?: boolean;
  /** Pass the production wiring: traffic.leadGapMeters(...) each frame. */
  leadGapM?: number;
}

/** One production-ordered frame: runtime → traffic → sample → director → rules. */
export function stepFrame(stack: Stack, p: PlayerFrame, opts: FrameOpts = {}): SimTick {
  stack.t += DT;
  stack.runtime.update(DT);
  stack.traffic.update(DT, {
    signalPhase: (id) => stack.runtime.signalPhase(id),
    playerPos: { x: p.x, y: p.y },
    playerSpeedKmh: p.speedKmh,
    playerHeadingDeg: p.headingDeg,
  });
  const tick = stack.runtime.sample(
    {
      position: { x: p.x, y: p.y },
      headingDeg: p.headingDeg,
      speedKmh: p.speedKmh,
      indicator: opts.indicator ?? "off",
      headlights: opts.headlights ?? "off",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: opts.gear ?? 1,
      mirrorGlance: opts.mirrorGlance ?? null,
    },
    stack.t,
    opts.isNight ?? false,
    opts.rain ?? false,
    opts.leadGapM ?? Infinity,
  );
  const staged = stack.director.step({
    tSec: stack.t,
    dtSec: DT,
    x: p.x,
    y: p.y,
    speedKmh: p.speedKmh,
    headingDeg: p.headingDeg,
    brakePedal: p.brakePedal,
    tickEvents: tick.events,
  });
  for (const e of staged.events) tick.events.push(e);
  stack.outcomes.push(...staged.outcomes);
  const { state, events } = reduceTick(stack.rules, tick);
  stack.rules = state;
  stack.ruleEvents.push(...events);
  stack.ticks.push(tick);
  return tick;
}

// ---------------------------------------------------------------------------
// Kinematic pose driver along an authored polyline (accel/brake-limited).
// ---------------------------------------------------------------------------

export class PolyDriver {
  private readonly px: number[] = [];
  private readonly py: number[] = [];
  private readonly cum: number[] = [0];
  s: number;
  speedMps: number;
  readonly length: number;

  constructor(points: ReadonlyArray<readonly [number, number]>, s0 = 0, v0 = 0) {
    for (const [x, y] of points) {
      this.px.push(x);
      this.py.push(y);
    }
    for (let i = 1; i < this.px.length; i++) {
      this.cum.push(
        this.cum[i - 1] + Math.hypot(this.px[i] - this.px[i - 1], this.py[i] - this.py[i - 1]),
      );
    }
    this.length = this.cum[this.cum.length - 1];
    this.s = s0;
    this.speedMps = v0;
  }

  /** Advance toward `targetMps` (accel 3 / decel 7 m/s²) and return the pose. */
  advance(dt: number, targetMps: number, accel = 3, decel = 7): PlayerFrame & { sNow: number } {
    if (this.speedMps < targetMps) this.speedMps = Math.min(targetMps, this.speedMps + accel * dt);
    else if (this.speedMps > targetMps) this.speedMps = Math.max(targetMps, this.speedMps - decel * dt);
    this.s = Math.min(this.length, this.s + this.speedMps * dt);
    return this.poseAt(this.s);
  }

  /** Move BACKWARD along the polyline (retreat), keeping the forward heading. */
  retreat(dt: number, speedMps: number): PlayerFrame & { sNow: number } {
    this.speedMps = 0;
    this.s = Math.max(0, this.s - speedMps * dt);
    return this.poseAt(this.s);
  }

  poseAt(s: number): PlayerFrame & { sNow: number } {
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] < s) i++;
    const segLen = this.cum[i + 1] - this.cum[i];
    const t = segLen > 0 ? (s - this.cum[i]) / segLen : 0;
    const x = this.px[i] + (this.px[i + 1] - this.px[i]) * t;
    const y = this.py[i] + (this.py[i + 1] - this.py[i]) * t;
    const dx = this.px[i + 1] - this.px[i];
    const dy = this.py[i + 1] - this.py[i];
    return {
      x,
      y,
      sNow: s,
      headingDeg: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360,
      speedKmh: this.speedMps * 3.6,
      brakePedal: 0,
    };
  }

  /** Arc position of the closest polyline point to (x, y) — landmark lookup. */
  arcOf(x: number, y: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.px.length - 1; i++) {
      const ax = this.px[i];
      const ay = this.py[i];
      const bx = this.px[i + 1];
      const by = this.py[i + 1];
      const abx = bx - ax;
      const aby = by - ay;
      const len2 = abx * abx + aby * aby;
      let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + abx * t;
      const qy = ay + aby * t;
      const d = Math.hypot(x - qx, y - qy);
      if (d < bestD) {
        bestD = d;
        best = this.cum[i] + Math.sqrt(len2) * t;
      }
    }
    return best;
  }
}

/** Offset an edge-geometry polyline to the right of travel (lane bank). */
export function offsetRight(
  points: ReadonlyArray<readonly [number, number]>,
  offsetM: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    let dx: number;
    let dy: number;
    if (i === 0) {
      dx = points[1][0] - points[0][0];
      dy = points[1][1] - points[0][1];
    } else if (i === n - 1) {
      dx = points[n - 1][0] - points[n - 2][0];
      dy = points[n - 1][1] - points[n - 2][1];
    } else {
      dx = points[i + 1][0] - points[i - 1][0];
      dy = points[i + 1][1] - points[i - 1][1];
    }
    const len = Math.hypot(dx, dy) || 1;
    // Right of travel (x east, y north): (dy, -dx) normalized.
    out.push([points[i][0] + (dy / len) * offsetM, points[i][1] - (dx / len) * offsetM]);
  }
  return out;
}

export function violationCodes(events: readonly RuleEvent[]): string[] {
  return events.filter((e) => e.kind === "violation").map((e) => e.code);
}

export function commendationCodes(events: readonly RuleEvent[]): string[] {
  return events.filter((e) => e.kind === "commendation").map((e) => e.code);
}
