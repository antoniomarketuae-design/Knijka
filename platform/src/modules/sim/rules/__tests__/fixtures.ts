import { createRuleEngine, reduceTick, type RuleEngineState } from "../engine";
import type { RuleEngineConfig, RuleEvent, SimTick } from "../types";

/** A neutral, legal frame: belted, handbrake off, lights low, standing still. */
export function tick(t: number, over: Partial<SimTick> = {}): SimTick {
  return {
    t,
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
    ...over,
  };
}

/** Fold a sequence of ticks through the reducer, collecting all events. */
export function drive(
  ticks: SimTick[],
  config?: Partial<RuleEngineConfig>,
  initial?: RuleEngineState,
): { state: RuleEngineState; events: RuleEvent[] } {
  let state = initial ?? createRuleEngine(config);
  const events: RuleEvent[] = [];
  for (const frame of ticks) {
    const r = reduceTick(state, frame);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

export function codes(events: RuleEvent[]): string[] {
  return events.map((e) => e.code);
}

/** Ticks every second from t0..t1 inclusive with the same overrides. */
export function cruise(t0: number, t1: number, over: Partial<SimTick> = {}): SimTick[] {
  const out: SimTick[] = [];
  for (let t = t0; t <= t1; t += 1) out.push(tick(t, over));
  return out;
}
