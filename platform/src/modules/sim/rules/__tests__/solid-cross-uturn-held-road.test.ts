/**
 * R7-1 — A TURN-ROUND BEGUN WHERE THE AXIS IS BROKEN KEEPS ITS ROAD
 * (sc-mv-uturn-ban:e98407b1 clause 4b), at the rule layer.
 *
 * The live-rung witness (`lessons/scenario/__tests__/mv-uturn-ban-edge-
 * handoff-praise.test.ts`) drives the rig's two lost drives and instruction 4's
 * stop at the 280th metre through the lesson chain. This file pins the reducer
 * itself, on frames built by hand the way the world runtime publishes them
 * (the frame builder of `solid-cross-uturn-act.test.ts`, restated):
 *
 *   §1 a turn-round begun on the DASHES and handed to ANOTHER road (a side
 *      street, bearing 90°) 100° round is confirmed there, at the place it
 *      began: `uTurnPlaceRecord` {1, 0}; nothing billed, nothing named;
 *   §2 …also when the swing pauses at the handoff for longer than it takes to
 *      end (2 m) and resumes within 6.5 m — the same swing (R6-5);
 *   §3 the same turn-round begun on the SOLID span is dropped by the other
 *      road exactly as R6-1 ruled: one bill, no name, record {0, 0};
 *   §4 a quarter turn into the side street (the swing ends there) is let go:
 *      the side street sees the car for the first time once the swing can no
 *      longer resume, and nothing is recorded;
 *   §5 another EDGE OF THE SAME ROAD is not held: frame by frame the tracker is
 *      the one-edge tracker (R6-1 carries everything there).
 *
 * R7-2 — THE APPROACH (round 2, verifier F1: the side street takes the tick
 * while the nose is still 30–43° round, before any excursion is open):
 *
 *   §6 a creep at 35° across the dashes handed to the side street, then round:
 *      confirmed, {1, 0}; held while along the road, let go once confirmed;
 *   §7 the one confirmation, frame by frame: the record of a turn-round handed
 *      to the side street (at 35° or at 100°) is, on every frame, the record of
 *      the same turn-round kept on the road — same frame, same place;
 *   §8 a swing begun on the SOLID span and carried past the handoff is still
 *      begun there: the side street drops it, nothing recorded;
 *   §9 a held frame passes no axis: confirmed on the side street and back on
 *      the half it left, in the solid span, the car has crossed nothing;
 *   §10 what is NOT held: a road that never had the car along it (a), a last
 *      station on the SOLID span (b), a fork the nose is along together with
 *      the road — the fork's own tracker bills its own solid axis (c), an
 *      UNPLACED turn-round (d), and an excursion whose swing has ended for
 *      good, as an approach or otherwise (e).
 */

import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick, type RuleEngineState } from "../engine";
import { uTurnPlaceRecord } from "../index";
import type { RuleEngineConfig, RuleEvent, SimTick } from "../types";
import { tick } from "./fixtures";

const ARMED = { solidCrossUTurnEnabled: true } as Partial<RuleEngineConfig>;

interface F {
  /** The bank the centre is on: +1 = the one it started on, −1 = the far one. */
  bank: 1 | -1;
  /** The nose against the ORIGINAL road's direction, degrees (negative = turned left). */
  nose: number;
  /** The axis is solid here (default true). */
  solid?: boolean;
  kmh?: number;
  edge?: string;
  /** The bearing of the road the car is fixed to, against the original road's (90 = a side street). */
  bearing?: number;
}

function wrap180(d: number): number {
  let x = d;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x;
}

function frame(t: number, f: F): SimTick {
  const deg = wrap180(f.nose - (f.bearing ?? 0));
  const headingSign = Math.abs(deg) <= 90 ? 1 : -1;
  return tick(t, {
    speedKmh: f.kmh ?? 9,
    oneway: false,
    headingDeg: (wrap180(f.nose) + 360) % 360,
    gear: 1,
    laneOffsetM: 0,
    ...((f.solid ?? true) ? { solidCenterLine: true } : {}),
    ...(headingSign !== f.bank ? { opposingBank: true } : {}),
    edgeAlignment: {
      deg,
      wrongWayArmed: false,
      edgeId: f.edge ?? "e-road",
      offCarriageway: false,
      travelDir: f.bank,
      roundabout: false,
    },
  });
}

const HZ = 20;
function play(segments: Array<{ sec: number; at: (u: number) => F }>): SimTick[] {
  const out: SimTick[] = [];
  let i = 0;
  for (const seg of segments) {
    const n = Math.round(seg.sec * HZ);
    for (let k = 0; k < n; k++) out.push(frame(i++ / HZ, seg.at(k / n)));
  }
  return out;
}
const hold = (sec: number, f: F) => ({ sec, at: () => f });
/** A turn to the left at `rate` °/s from `fromDeg` to `toDeg` round; the centre passes to the far bank `crossAtDeg` round. */
function turn(o: { fromDeg?: number; toDeg: number; crossAtDeg: number; rate?: number; over?: Partial<F> }) {
  const from = o.fromDeg ?? 0;
  const rate = o.rate ?? 15;
  return {
    sec: (o.toDeg - from) / rate,
    at: (u: number): F => {
      const round = from + (o.toDeg - from) * u;
      return { bank: round >= o.crossAtDeg ? -1 : 1, nose: -round, ...o.over };
    },
  };
}

function run(ticks: SimTick[]): { state: RuleEngineState; events: RuleEvent[]; amendments: unknown[]; states: RuleEngineState[] } {
  let state = createRuleEngine(ARMED);
  const events: RuleEvent[] = [];
  const amendments: unknown[] = [];
  const states: RuleEngineState[] = [];
  for (const f of ticks) {
    const r = reduceTick(state, f) as ReturnType<typeof reduceTick> & { amendments?: unknown[] };
    state = r.state;
    states.push(state);
    events.push(...r.events);
    amendments.push(...(r.amendments ?? []));
  }
  return { state, events, amendments, states };
}
const crossings = (events: RuleEvent[]) => events.filter((e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE");
const tracker = (st: RuleEngineState) => (st as unknown as { solidCrossTurn: Record<string, unknown> }).solidCrossTurn;

const DASHES: Partial<F> = { solid: false };
const SIDE: Partial<F> = { edge: "e-side", bearing: 90, solid: false };
const STRAIGHT_DASHES = hold(2, { bank: 1, nose: 0, solid: false });

describe("R7-1 — a turn-round begun where the axis is broken keeps its road", () => {
  it("§1 handed to a side street 100° round, it is confirmed there at the place it began: {1, 0}, nothing billed or named", () => {
    const ticks = play([
      STRAIGHT_DASHES,
      turn({ toDeg: 100, crossAtDeg: 60, over: DASHES }),
      turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60, over: SIDE }),
      hold(3, { bank: -1, nose: 180, kmh: 0, ...SIDE }),
    ]);
    const r = run(ticks);
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
    expect(crossings(r.events)).toEqual([]);
    expect(r.amendments).toEqual([]);
    // …and the side street sees the car for the first time once the turn-round is over.
    expect(tracker(r.state).edgeId).toBe("e-side");
  });

  it("§2 …and when its swing pauses at the handoff past its 2 m end and resumes within 6.5 m (R6-5: the same swing)", () => {
    const ticks = play([
      STRAIGHT_DASHES,
      turn({ toDeg: 100, crossAtDeg: 60, over: DASHES }),
      // 3.75 m straight on the side street at 100° round (9 km/h × 1.5 s), then on round.
      hold(1.5, { bank: -1, nose: -100, ...SIDE }),
      turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60, over: SIDE }),
      hold(3, { bank: -1, nose: 180, kmh: 0, ...SIDE }),
    ]);
    const r = run(ticks);
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
    expect(crossings(r.events)).toEqual([]);
  });

  it("§3 the same turn-round begun on the SOLID span is dropped by the side street as R6-1 ruled: one bill, no name, nothing recorded", () => {
    const ticks = play([
      hold(2, { bank: 1, nose: 0 }),
      turn({ toDeg: 100, crossAtDeg: 60 }),
      turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60, over: { edge: "e-side", bearing: 90 } }),
      hold(3, { bank: -1, nose: 180, kmh: 25, edge: "e-side", bearing: 90 }),
    ]);
    const r = run(ticks);
    expect(crossings(r.events)).toHaveLength(1);
    expect(r.amendments).toEqual([]);
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 0, elsewhere: 0 });
  });

  it("§4 a quarter turn INTO the side street is let go once its swing can no longer resume: the side street's own tracker, nothing recorded", () => {
    const ticks = play([
      STRAIGHT_DASHES,
      turn({ toDeg: 70, crossAtDeg: 200, over: DASHES }),
      turn({ fromDeg: 70, toDeg: 90, crossAtDeg: 200, over: SIDE }),
      // Along the side street: 2 m to end the swing, 6.5 m more and it can no longer resume.
      hold(5, { bank: 1, nose: -90, kmh: 20, ...SIDE }),
    ]);
    const r = run(ticks);
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 0, elsewhere: 0 });
    expect(crossings(r.events)).toEqual([]);
    expect(tracker(r.state).edgeId).toBe("e-side");
    // While the swing was still going the boulevard kept it (the hold is real, and it ends).
    const handoff = ticks.findIndex((k) => k.edgeAlignment?.edgeId === "e-side");
    expect(tracker(r.states[handoff]).edgeId).toBe("e-road");
  });

  it("§5 another EDGE OF THE SAME ROAD is not held: frame by frame the tracker is the one-edge tracker", () => {
    const segs = (next: Partial<F>) => [
      STRAIGHT_DASHES,
      turn({ toDeg: 100, crossAtDeg: 60, over: DASHES }),
      turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60, over: { ...DASHES, ...next } }),
      hold(3, { bank: -1, nose: 180, kmh: 0, ...DASHES, ...next }),
    ];
    const one = run(play(segs({})));
    const two = run(play(segs({ edge: "e-next" })));
    expect(one.states).toHaveLength(two.states.length);
    for (let i = 0; i < one.states.length; i++) {
      const { edgeId: _a, ...a } = tracker(one.states[i]);
      const { edgeId: _b, ...b } = tracker(two.states[i]);
      void _a;
      void _b;
      expect(b, `frame ${i}`).toEqual(a);
    }
    expect(uTurnPlaceRecord(two.state)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
  });
});

/** Run frame by frame, the edge of each frame chosen from the state the previous one left. */
function runAdaptive(
  path: F[],
  pick: (f: F, prev: RuleEngineState) => F,
): { state: RuleEngineState; events: RuleEvent[]; states: RuleEngineState[]; ticks: SimTick[] } {
  let state = createRuleEngine(ARMED);
  const events: RuleEvent[] = [];
  const states: RuleEngineState[] = [];
  const ticks: SimTick[] = [];
  path.forEach((f, i) => {
    const k = frame(i / HZ, pick(f, state));
    const r = reduceTick(state, k);
    state = r.state;
    states.push(state);
    ticks.push(k);
    events.push(...r.events);
  });
  return { state, events, states, ticks };
}
function poses(segments: Array<{ sec: number; at: (u: number) => F }>): F[] {
  const out: F[] = [];
  for (const seg of segments) {
    const n = Math.round(seg.sec * HZ);
    for (let k = 0; k < n; k++) out.push(seg.at(k / n));
  }
  return out;
}
const records = (states: RuleEngineState[]) => states.map((st) => uTurnPlaceRecord(st));
const NO_CROSS = 1000;
const ticksOf = (path: F[]) => path.map((f, i) => frame(i / HZ, f));

describe("R7-2 — …and so does the APPROACH to one: the side street takes the tick before the nose leaves the 45° band", () => {
  /**
   * On the dashes: a bend to 35° (2.33 s), a creep at 35° (2 s), round to 180° (9.67 s), stand (3 s).
   * Every frame from `sideAtSec` on is on the side street: 5.33 s = 1 s into the creep (35° round),
   * 10.67 s = 100° round, Infinity = never.
   */
  const creep = (sideAtSec: number): F[] =>
    poses([
      hold(2, { bank: 1, nose: 0, ...DASHES }),
      turn({ toDeg: 35, crossAtDeg: NO_CROSS, over: DASHES }),
      hold(2, { bank: 1, nose: -35, ...DASHES }),
      turn({ fromDeg: 35, toDeg: 180, crossAtDeg: NO_CROSS, over: DASHES }),
      hold(3, { bank: 1, nose: 180, kmh: 0, ...DASHES }),
    ]).map((f, i) => (i / HZ >= sideAtSec ? { ...f, ...SIDE } : f));

  it("§6 a creep at 35° handed to the side street, then round: confirmed, {1, 0}, nothing billed; held along the road, let go once confirmed", () => {
    const path = creep(5.33);
    const ticks = ticksOf(path);
    const r = run(ticks);
    const handoff = ticks.findIndex((k) => k.edgeAlignment?.edgeId === "e-side");
    expect(handoff).toBeGreaterThan(0);
    expect(Math.abs(path[handoff].nose)).toBe(35);
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
    expect(crossings(r.events)).toEqual([]);
    expect(r.amendments).toEqual([]);
    // Held on the approach (the road keeps the car while it is along it)…
    expect(tracker(r.states[handoff]).edgeId).toBe("e-road");
    // …and let go once the turn-round is confirmed: the side street sees the car for the first time.
    expect(tracker(r.state).edgeId).toBe("e-side");
  });

  it("§7 the one confirmation: frame by frame the record is that of the same turn-round kept on the road (handoff at 35° and at 100° round)", () => {
    const onRoad = run(ticksOf(creep(Number.POSITIVE_INFINITY)));
    expect(uTurnPlaceRecord(onRoad.state)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
    for (const sideAtSec of [5.33, 10.67]) {
      const ticks = ticksOf(creep(sideAtSec));
      const held = run(ticks);
      const handoff = ticks.findIndex((k) => k.edgeAlignment?.edgeId === "e-side");
      expect(tracker(held.states[handoff]).edgeId).toBe("e-road");
      expect(records(held.states), `handoff at ${sideAtSec} s`).toEqual(records(onRoad.states));
    }
  });

  it("§8 a swing begun on the SOLID span and carried past the handoff is still begun there: the side street drops it, nothing recorded", () => {
    const path = poses([
      hold(2, { bank: 1, nose: 0 }), // the solid span
      turn({ toDeg: 10, crossAtDeg: NO_CROSS }), // the swing begins over the solid axis…
      turn({ fromDeg: 10, toDeg: 40, crossAtDeg: NO_CROSS, over: DASHES }), // …and goes on over the dashes
      turn({ fromDeg: 40, toDeg: 180, crossAtDeg: NO_CROSS, over: SIDE }), // the side street has it 40° round
      hold(3, { bank: 1, nose: 180, kmh: 0, ...SIDE }),
    ]);
    // Kept on the road, the same drive is a turn-round begun on the solid span.
    const onRoad = run(ticksOf(path.map((f) => (f.edge === "e-side" ? { ...f, edge: "e-road", bearing: 0 } : f))));
    expect(uTurnPlaceRecord(onRoad.state)).toEqual({ atBrokenAxis: 0, elsewhere: 1 });
    // Handed to the side street before the nose left the band, it is never counted as begun on the dashes.
    const ticks = ticksOf(path);
    const r = run(ticks);
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 0, elsewhere: 0 });
    expect(crossings(r.events)).toEqual([]);
    const handoff = ticks.findIndex((k) => k.edgeAlignment?.edgeId === "e-side");
    expect(tracker(r.states[handoff]).edgeId).toBe("e-road");
    expect(tracker(r.state).edgeId).toBe("e-side");
  });

  it("§9 a held frame passes no axis: confirmed on the side street, back at once on the half it left in the solid span — nothing crossed, nothing billed", () => {
    const path = poses([
      hold(2, { bank: 1, nose: 0, ...DASHES }),
      turn({ toDeg: 35, crossAtDeg: NO_CROSS, over: DASHES }),
      turn({ fromDeg: 35, toDeg: 180, crossAtDeg: NO_CROSS, over: DASHES }),
      hold(4, { bank: 1, nose: 180 }),
    ]);
    // On the side street from 35° round until the turn-round is confirmed; from the next frame on, on the
    // road again, on the half it left, inside the solid span.
    const r = runAdaptive(path, (f, prev) => {
      if (uTurnPlaceRecord(prev).atBrokenAxis === 1) return { ...f, edge: "e-road", bearing: 0, solid: true, bank: 1 };
      return Math.abs(f.nose) >= 35 ? { ...f, ...SIDE } : f;
    });
    const confirmedAt = r.states.findIndex((st) => uTurnPlaceRecord(st).atBrokenAxis === 1);
    expect(confirmedAt).toBeGreaterThan(0);
    // It was confirmed on a held frame on the side street…
    expect(r.ticks[confirmedAt].edgeAlignment?.edgeId).toBe("e-side");
    expect(tracker(r.states[confirmedAt]).edgeId).toBe("e-road");
    // …and the next frame is the road's.
    expect(r.ticks[confirmedAt + 1].edgeAlignment?.edgeId).toBe("e-road");
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 1, elsewhere: 0 });
    // Over two seconds on the half it left, in the solid span, nose south: the centre has crossed no axis.
    expect(r.ticks.length - confirmedAt).toBeGreaterThan(2 * HZ);
    expect(crossings(r.events)).toEqual([]);
  });

  it("§10a a road that never had the car ALONG it holds nothing: the side street has it at once", () => {
    const ticks = ticksOf(
      poses([
        hold(2, { bank: 1, nose: -90, ...DASHES }), // square across the road from the first frame
        hold(2, { bank: 1, nose: -90, ...SIDE }),
      ]),
    );
    const r = run(ticks);
    const handoff = ticks.findIndex((k) => k.edgeAlignment?.edgeId === "e-side");
    expect(tracker(r.states[handoff - 1]).dir).toBe(0);
    expect(tracker(r.states[handoff]).edgeId).toBe("e-side");
  });

  it("§10b a last station on the SOLID span is not held: the side street sees the car for the first time (R6-1)", () => {
    const ticks = ticksOf(
      poses([
        hold(2, { bank: 1, nose: 0 }), // the solid span
        hold(1, { bank: 1, nose: -20 }),
        turn({ fromDeg: 20, toDeg: 180, crossAtDeg: NO_CROSS, over: SIDE }),
        hold(3, { bank: 1, nose: 180, kmh: 0, ...SIDE }),
      ]),
    );
    const r = run(ticks);
    const handoff = ticks.findIndex((k) => k.edgeAlignment?.edgeId === "e-side");
    expect(tracker(r.states[handoff]).edgeId).toBe("e-side");
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 0, elsewhere: 0 });
  });

  it("§10d an UNPLACED turn-round (begun where the road had no fix on the car) is never held: the side street drops it (R6-1)", () => {
    const noFix = (k: SimTick): SimTick => ({ ...k, edgeAlignment: { ...k.edgeAlignment!, deg: null, edgeId: null } });
    const path = poses([
      hold(2, { bank: 1, nose: 0, ...DASHES }),
      hold(1, { bank: 1, nose: 0, ...DASHES, edge: "no-fix" }),
      turn({ toDeg: 100, crossAtDeg: NO_CROSS, over: { ...DASHES, edge: "no-fix" } }),
      turn({ fromDeg: 100, toDeg: 180, crossAtDeg: NO_CROSS, over: SIDE }),
      hold(3, { bank: 1, nose: 180, kmh: 0, ...SIDE }),
    ]);
    const ticks = ticksOf(path).map((k) => (k.edgeAlignment?.edgeId === "no-fix" ? noFix(k) : k));
    const r = run(ticks);
    const handoff = ticks.findIndex((k) => k.edgeAlignment?.edgeId === "e-side");
    // The premise: an excursion was open, unplaced, when the side street took the tick.
    expect(tracker(r.states[handoff - 1]).turning).toBe(true);
    expect(tracker(r.states[handoff - 1]).turnPlace).toBeNull();
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 0, elsewhere: 0 });
    expect(tracker(r.states[handoff]).edgeId).toBe("e-side");
  });

  it("§10e an excursion whose swing has ENDED is not held, as an approach or otherwise: the side street has the car, nothing recorded", () => {
    const path = poses([
      STRAIGHT_DASHES,
      turn({ toDeg: 90, crossAtDeg: NO_CROSS, over: DASHES }), // a quarter turn left, still on the road's edge…
      hold(4, { bank: 1, nose: -90, ...DASHES }), // …straight on for 10 m: the swing ends, and can no longer resume
      hold(2, { bank: 1, nose: -90, ...SIDE }), // the side street has it
      turn({ fromDeg: 90, toDeg: 180, crossAtDeg: NO_CROSS, over: SIDE }), // round to nose south on the side street
      hold(3, { bank: 1, nose: 180, kmh: 0, ...SIDE }),
    ]);
    const ticks = ticksOf(path);
    const r = run(ticks);
    const handoff = ticks.findIndex((k) => k.edgeAlignment?.edgeId === "e-side");
    // The premise: an excursion begun on the dashes was open, its swing over for good, when the side street took the tick.
    expect(tracker(r.states[handoff - 1]).turning).toBe(true);
    expect(tracker(r.states[handoff - 1]).turnPlace).toBe(false);
    expect(tracker(r.states[handoff - 1]).swSense).toBe(0);
    expect(uTurnPlaceRecord(r.state)).toEqual({ atBrokenAxis: 0, elsewhere: 0 });
    expect(tracker(r.states[handoff]).edgeId).toBe("e-side");
  });

  it("§10c a fork the nose is along TOGETHER with the road is the fork's: its own tracker bills a crossing of its solid axis", () => {
    const FORK: Partial<F> = { edge: "e-fork", bearing: -30, solid: true };
    const ticks = ticksOf(
      poses([
        hold(2, { bank: 1, nose: 0, ...DASHES }),
        turn({ toDeg: 25, crossAtDeg: NO_CROSS, over: DASHES }),
        hold(1, { bank: 1, nose: -28, ...FORK }), // on the fork: 2° off it, 28° off the road
        hold(2, { bank: -1, nose: -32, ...FORK }), // the centre over the fork's solid axis for 2 s
      ]),
    );
    const r = run(ticks);
    expect(crossings(r.events)).toHaveLength(1);
    const handoff = ticks.findIndex((k) => k.edgeAlignment?.edgeId === "e-fork");
    expect(tracker(r.states[handoff]).edgeId).toBe("e-fork");
  });
});
