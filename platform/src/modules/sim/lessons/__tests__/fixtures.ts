/**
 * Test fixtures for the lessons subsystem: a stub WorldRuntime implementing
 * the contracts.ts interface (the real runtime is built in parallel — tests
 * must never depend on it), SimTick builders and an in-memory session store.
 */

import type { SignalPhase, VehicleSample, WorldRuntime } from "../../contracts";
import type { SimTick, SimTickEvent } from "../../rules";
import type {
  SaveSimSessionInput,
  SimSessionListRow,
  SimSessionStore,
} from "../store";

// ---------------------------------------------------------------------------
// Stub WorldRuntime — flat world, everything legal defaults
// ---------------------------------------------------------------------------

export interface StubWorldOptions {
  speedLimitKmh?: number;
  signalPhases?: Record<string, SignalPhase>;
}

/** Minimal honest WorldRuntime: constant limit, no lanes, optional signals. */
export function createStubWorldRuntime(opts: StubWorldOptions = {}): WorldRuntime {
  const limit = opts.speedLimitKmh ?? 50;
  const phases = opts.signalPhases ?? {};
  return {
    update(): void {
      // Static world: nothing advances.
    },
    sample(v: VehicleSample, tSec: number, isNight: boolean): SimTick {
      return makeTick({
        t: tSec,
        speedKmh: v.speedKmh,
        maxSpeedKmh: limit,
        position: { ...v.position },
        headingDeg: v.headingDeg,
        indicator: v.indicator,
        headlights: v.headlights,
        seatbeltOn: v.seatbeltOn,
        handbrakeOn: v.handbrakeOn,
        gear: v.gear,
        isNight,
      });
    },
    signalPhase(signalNodeId: string): SignalPhase {
      return phases[signalNodeId] ?? "green";
    },
    speedLimitAt(): number {
      return limit;
    },
    locate() {
      return { edgeId: null, laneId: 0, laneOffsetM: 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// Tick builders
// ---------------------------------------------------------------------------

/** A legal, belted, moving-forward frame; override what the test cares about. */
export function makeTick(overrides: Partial<SimTick> = {}): SimTick {
  return {
    t: 0,
    speedKmh: 0,
    maxSpeedKmh: 50,
    position: { x: 0, y: 0 },
    headingDeg: 0,
    laneOffsetM: 0,
    laneId: 0,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    events: [],
    ...overrides,
  };
}

/** Shorthand for a tick carrying discrete world events. */
export function tickWithEvents(
  t: number,
  events: SimTickEvent[],
  overrides: Partial<SimTick> = {},
): SimTick {
  return makeTick({ t, events, ...overrides });
}

// ---------------------------------------------------------------------------
// In-memory SimSessionStore
// ---------------------------------------------------------------------------

export interface FakeSimSessionStore extends SimSessionStore {
  rows: Array<{ id: string; userId: string; input: SaveSimSessionInput }>;
}

export function createFakeSimSessionStore(): FakeSimSessionStore {
  const rows: FakeSimSessionStore["rows"] = [];
  return {
    rows,
    async saveSession(userId, input) {
      const id = `sess-${rows.length + 1}`;
      rows.push({ id, userId, input });
      return { id };
    },
    async listSessions(userId): Promise<SimSessionListRow[]> {
      return rows
        .filter((r) => r.userId === userId)
        .map((r) => ({
          id: r.id,
          lessonId: r.input.lessonId,
          finishedAt: r.input.finishedAt,
          score: r.input.score,
          passed: r.input.events.passed,
          rubricStars: r.input.events.rubricStars ?? null,
        }))
        .reverse();
    },
    async listRecentSessions(userId, limit) {
      return rows
        .filter((r) => r.userId === userId)
        .map((r) => ({
          id: r.id,
          lessonId: r.input.lessonId,
          startedAt: r.input.startedAt,
          finishedAt: r.input.finishedAt,
          score: r.input.score,
          debrief: r.input.debrief,
          events: r.input.events,
        }))
        .reverse()
        .slice(0, limit);
    },
  };
}
