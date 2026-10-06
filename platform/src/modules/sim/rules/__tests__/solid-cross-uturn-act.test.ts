/**
 * CROSSED_SOLID_LINE — THE U-TURN ACT (sc-mv-uturn-ban:6d60c160, major: «the
 * debrief explains overtaking after a U-turn»), ROUND 2: decided from the ROAD.
 *
 * THE DEFECT. A student turns the car round across a solid осева and the
 * product bills CROSSED_SOLID_LINE — correctly — and then tells him «остани в
 * своята лента, дори предният да пълзи. Изпреварвай или заобикаляй чак където
 * линията стане прекъсната». There was no car in front and he was not
 * overtaking. The pooled row could only speak for one act because the code had
 * only one, and `correctiveBg` had no per-event channel at all: every surface
 * read it BY CODE.
 *
 * WHY ROUND 1 WAS REFUTED. It named the act when the car's own heading had
 * swung ≥ 45° left inside 10 s of movement. A whole U-turn begun beside the
 * axis is only 34° round when the bill lands (kept the overtaking advice); a
 * lawful U-turn at the gap followed seconds later by a 14.7° drift was titled
 * «Обратен завой»; and a U-turn from the outer lane was not billed at all.
 *
 * WHAT IS PINNED HERE, at the rule layer (the live-rung witness
 * `lessons/scenario/__tests__/mv-uturn-ban-road-referenced-act.test.ts` drives
 * the same acts through the lesson chain):
 *  1. «this crossing is a U-turn» is a fact about the car's relation to the
 *     ROAD — it travelled with one bank, crossed the axis where it is solid,
 *     and now travels with the other bank (`SimTick.edgeAlignment`) — and
 *     never about how far the nose swung, how recently, how fast or from where;
 *  2. the plain bill is not delayed and not doubled: it goes out pooled, and
 *     the completed reversal NAMES it (`ReduceResult.amendments`);
 *  3. a crossing the plain detector cannot see is billed by position, and a
 *     reversal nothing billed is the bill;
 *  4. it is OFF unless a lesson authors the key, and then `edgeAlignment` is
 *     not read and the reducer's state and output are what they were;
 *  5. the act's copy names the U-turn in title, explanation AND corrective, and
 *     claims only what the evidence measures;
 *  6. `violationCorrectiveBg` is act-then-pool, and `applyActAmendments`
 *     re-labels a row without re-pricing it;
 *  7. the grading did not move: основна, 3 т.
 *
 * ROUND 3 (§1d, §2b, and the three round-2 pins it had to move) — what the
 * CENTRE and the NOSE could not say is read off the BODY's position
 * (`EdgeAlignment.axisClearM`) and off the bank the car was travelling with:
 *  8. a straddle that then turns round is the U-turn (verifier W1) — and, since
 *     round 4, so is every other run along the far half that ends in a turn
 *     round inside the span (item 12);
 *  9. in an armed lesson nothing bills a crossing while the centre is on the
 *     bank the car last travelled with (W2);
 * 10. «изцяло» is printed only when the whole body is across; a bill on a
 *     straddle frame carries the act `astride` — the crossing's own title and
 *     corrective, and a reason that says what was measured (W3).
 *
 * ROUND 4 (the «R4-1» and «X3» tests of §1d, §1b′, and the round-2/3 pull-out
 * pins it flipped) —
 * integrator rulings R4-1 and R4-2 after the round-3 verifier's X1:
 * 11. THE PLACE: a reversal is the U-turn only if the turn-round was MADE where
 *     the axis is solid — the road's record under the car on the first frame
 *     the car, across the axis, is no longer travelling the reference way
 *     (nose > 45° off it); a reversal made over the dashes is a lawful turn,
 *     billed by nothing, renaming nothing, however long the car had been
 *     across since the span;
 * 12. THE PULL-OUT DECIDES NOTHING: any reversal made inside the span by a car
 *     across or astride the solid axis is named, whatever came before it; the
 *     5 m / 10° carve-out is gone;
 * 13. the round-3 verifier's three surviving mutants on reachable inputs (X3:
 *     v4, v7, v8) each have a pin that reddens on an assertion;
 * 14. PAST THE KERB the turn station is still followed, and never held: where
 *     the road has a fix on the car the run begins, continues and breaks out
 *     there as on the carriageway; with no fix on this road the turn-round is
 *     unplaced and names nothing (the «R4-1 past the kerb» tests).
 * 15. ROUND 5, ONE DEFINITION OF THE ACT (§1f, and the re-based pins of §1,
 *     §1b′ and §1e): a turn-round is an event of the heading against the road;
 *     its place is where it BEGINS; it names a crossing made before or during
 *     it and never one made after it; a confirmed turn-round closes the
 *     manoeuvre, so nothing earlier is renamed; a place measured on the road
 *     is kept where the road has no fix.
 *
 * ADR-002: the corrective's rule is retrieved, not recalled — ЗДвП чл. 38,
 * ал. 1 («Завиването в обратна посока се извършва наляво от най-лявата пътна
 * лента по посока на движението») and ал. 2 («…водачът пропуска насрещно
 * движещите се пътни превозни средства»), content/law/acts/zdvp.json; the sign
 * name from content/signs/signs.json `sign-v23`. §4 checks both against the
 * bank on every run.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRuleEngine, reduceTick, type RuleEngineState } from "../engine";
import * as rules from "../index";
import {
  DEFAULT_RULE_CONFIG,
  type RuleEngineConfig,
  type RuleEvent,
  type SimTick,
  type ViolationEvent,
} from "../types";
import { tick } from "./fixtures";

/** The act selector the engine stamps — spelled as a literal on purpose: this
 *  file must be able to go red on a tree that has no such export. */
const UTURN = "u-turn";
const ARMED = { solidCrossUTurnEnabled: true } as Partial<RuleEngineConfig>;

const ASTRIDE = "astride";
/** Round 6 (R6-3): the same two reasons for a car entering the half that runs its own way. */
const OWN_WAY = "own-way";
const ASTRIDE_OWN_WAY = "astride-own-way";
const POOLED_TITLE = "Пресичане на непрекъсната осева линия";
const OVERTAKING_ADVICE = /Изпреварвай или заобикаляй/u;

// ---------------------------------------------------------------------------
// frames as the world runtime publishes them, built by hand
// ---------------------------------------------------------------------------

/** One frame of a car on a two-way road whose geometry runs the car's ORIGINAL way. */
interface F {
  /** The bank the centre is on: +1 = the one it started on, −1 = the far one. */
  bank: 1 | -1;
  /** The nose against the road's own direction, degrees: 0 = the original way,
   *  NEGATIVE = turned to the LEFT, ±180 = facing back. */
  nose: number;
  /** The axis is solid here (default true). */
  solid?: boolean;
  kmh?: number;
  gear?: number;
  /** Past the kerb (`EdgeAlignment.offCarriageway`). */
  off?: boolean;
  edge?: string;
  /**
   * The bearing of the road the car is fixed to, against the ORIGINAL road's
   * (default 0: the same axis — which since round 6 makes another `edge` at
   * bearing 0 ANOTHER EDGE OF THE SAME ROAD; 180 is the same axis authored the
   * other way round; 90 is a side street, another road). `nose` is always
   * the heading against the original road; the record's `deg` is the nose
   * against the road the car is fixed to, as the runtime publishes it.
   */
  bearing?: number;
  laneOffsetM?: number;
  /** A tick with no `edgeAlignment` at all (not from the runtime). */
  noRecord?: boolean;
  /** The runtime's «no-edge-fix» record: no road places the car (`deg` and `edgeId` null). */
  noFix?: boolean;
  /**
   * `EdgeAlignment.axisClearM` — how far the BODY is from the axis on the bank
   * the centre is on: ≥ 0 = the whole body is on that bank, < 0 = astride the
   * axis. Omitted = the record carries no such member (the body unmeasured).
   */
  clear?: number;
}

function wrap180(d: number): number {
  let x = d;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x;
}

function frame(t: number, f: F): SimTick {
  const deg = wrap180(f.nose - (f.bearing ?? 0));
  // worldRuntime: opposingBank ⇔ the heading's sense along the edge differs
  // from the occupied bank's; set only when true.
  const headingSign = Math.abs(deg) <= 90 ? 1 : -1;
  return tick(t, {
    speedKmh: f.kmh ?? 9,
    oneway: false,
    headingDeg: (wrap180(f.nose) + 360) % 360,
    gear: f.gear ?? 1,
    laneOffsetM: f.laneOffsetM ?? 0,
    ...((f.solid ?? true) ? { solidCenterLine: true } : {}),
    ...(headingSign !== f.bank ? { opposingBank: true } : {}),
    ...(f.noRecord
      ? {}
      : f.noFix
        ? { edgeAlignment: { deg: null, reason: "no-edge-fix" as const, wrongWayArmed: false, edgeId: null, offCarriageway: true } }
        : {
            edgeAlignment: {
              deg,
              wrongWayArmed: false,
              edgeId: f.edge ?? "e-road",
              offCarriageway: f.off ?? false,
              travelDir: f.bank,
              roundabout: false,
              ...(f.clear !== undefined ? { axisClearM: f.clear } : {}),
            },
          }),
  });
}

const HZ = 20;
/** Segments played end to end at 20 Hz; `at(u)` gets u ∈ [0, 1) along the segment. */
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

/**
 * A turn to the left at `rate` °/s from `fromDeg` to `toDeg` round; the centre
 * passes to the far bank when the nose is `crossAtDeg` round.
 */
function turn(o: {
  fromDeg?: number;
  toDeg: number;
  crossAtDeg: number;
  rate?: number;
  over?: Partial<F>;
  /** Override per frame, given how far round the nose is. */
  each?: (roundDeg: number) => Partial<F>;
}) {
  const from = o.fromDeg ?? 0;
  const rate = o.rate ?? 15;
  return {
    sec: (o.toDeg - from) / rate,
    at: (u: number): F => {
      const round = from + (o.toDeg - from) * u;
      return { bank: round >= o.crossAtDeg ? -1 : 1, nose: -round, ...o.over, ...o.each?.(round) };
    },
  };
}

interface Run {
  state: RuleEngineState;
  events: RuleEvent[];
  crossings: ViolationEvent[];
  amendments: Array<{ code: string; billT: number; detail: string; t: number }>;
  /** A frame's result carried an `amendments` member at all. */
  sawAmendmentsField: boolean;
  frames: Array<{ state: RuleEngineState; events: RuleEvent[] }>;
}

function run(ticks: SimTick[], config?: Partial<RuleEngineConfig>): Run {
  let state = createRuleEngine(config);
  const events: RuleEvent[] = [];
  const amendments: Run["amendments"] = [];
  const frames: Run["frames"] = [];
  let sawAmendmentsField = false;
  for (const f of ticks) {
    const r = reduceTick(state, f) as ReturnType<typeof reduceTick> & { amendments?: Run["amendments"] };
    state = r.state;
    events.push(...r.events);
    frames.push({ state: r.state, events: r.events });
    if ("amendments" in r) {
      sawAmendmentsField = true;
      amendments.push(...(r.amendments ?? []));
    }
  }
  return {
    state,
    events,
    crossings: events.filter(
      (e): e is ViolationEvent => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE",
    ),
    amendments,
    sawAmendmentsField,
    frames,
  };
}

/** How far round the nose was on the frame at session time `t`. */
function roundAt(ticks: SimTick[], t: number): number {
  const f = ticks.reduce((b, k) => (Math.abs(k.t - t) < Math.abs(b.t - t) ? k : b));
  return Math.abs(wrap180(f.headingDeg));
}

const STRAIGHT = hold(2, { bank: 1, nose: 0 });
const AWAY = hold(3, { bank: -1, nose: 180, kmh: 25 });

/** The lesson's own banned arc as the reducer sees it: across at 60° round. */
const demoUTurn = (): SimTick[] => play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 60 }), AWAY]);

/** A shallow drift over the line and back: never more than 15° off the road. */
function drift(over: Partial<F> = {}): Array<{ sec: number; at: (u: number) => F }> {
  return [
    hold(1, { bank: 1, nose: -15, kmh: 30, ...over }),
    hold(2, { bank: -1, nose: -15, kmh: 30, ...over }),
    hold(1, { bank: -1, nose: 15, kmh: 30, ...over }),
    hold(2, { bank: 1, nose: 15, kmh: 30, ...over }),
    hold(2, { bank: 1, nose: 0, kmh: 30, ...over }),
  ];
}

describe("§1 «this crossing is a U-turn» is decided from the road: the bank it left, the solid axis it crossed, the bank it now travels with", () => {
  it("the whole turn → ONE основна (3), billed POOLED where the plain detector always billed it, and NAMED when the reversal completes", () => {
    const ticks = demoUTurn();
    const r = run(ticks, ARMED);
    expect(r.crossings).toHaveLength(1);
    const bill = r.crossings[0];
    // The bill is the plain one, on the plain frame: centre across for 0.6 s …
    expect(bill).toEqual(rules.makeViolation("CROSSED_SOLID_LINE", bill.t));
    expect(bill.detail).toBeUndefined();
    expect(bill.severityClass).toBe("osnovna");
    expect(bill.points).toBe(3);
    expect(roundAt(ticks, bill.t)).toBeGreaterThan(60);
    expect(roundAt(ticks, bill.t)).toBeLessThan(75);
    // … and it is named once: when the car has travelled WITH the far bank
    // (≥ 135° round) for the sustain.
    expect(r.amendments).toEqual([
      { code: "CROSSED_SOLID_LINE", billT: bill.t, detail: UTURN, t: expect.any(Number) },
    ]);
    const namedAt = r.amendments[0].t;
    expect(namedAt).toBeGreaterThan(bill.t);
    expect(roundAt(ticks, namedAt)).toBeGreaterThanOrEqual(135 + 0.6 * 15 - 1);
    expect(roundAt(ticks, namedAt)).toBeLessThan(135 + 0.6 * 15 + 2);
  });

  it("V1 — begun beside the axis: the bill lands with the nose only ~34° round, and the turn is named all the same", () => {
    // 6 км/ч on the demo radius turns at 11.75 °/s; from 0.9 m off the axis the
    // centre crosses 27° round.
    const ticks = play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 27, rate: 11.75, over: { kmh: 6 } }), AWAY]);
    const r = run(ticks, ARMED);
    expect(r.crossings).toHaveLength(1);
    expect(roundAt(ticks, r.crossings[0].t)).toBeLessThan(45);
    expect(r.amendments.map((a) => [a.billT, a.detail])).toEqual([[r.crossings[0].t, UTURN]]);
  });

  it("radius, speed and how long it took do not enter into it: fast, slow, and with a 30 s stop square across the road", () => {
    for (const [rate, kmh] of [
      [40, 20],
      [15, 9],
      [4, 6],
    ] as const) {
      const r = run(play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 50, rate, over: { kmh } }), AWAY]), ARMED);
      expect(r.crossings, `${rate} °/s`).toHaveLength(1);
      expect(r.amendments.map((a) => a.detail), `${rate} °/s`).toEqual([UTURN]);
    }
    const stopped = run(
      play([
        STRAIGHT,
        turn({ toDeg: 90, crossAtDeg: 50 }),
        hold(30, { bank: -1, nose: -90, kmh: 0 }),
        turn({ fromDeg: 90, toDeg: 180, crossAtDeg: 50 }),
        AWAY,
      ]),
      ARMED,
    );
    expect(stopped.crossings).toHaveLength(1);
    expect(stopped.amendments.map((a) => a.detail)).toEqual([UTURN]);
  });

  it("A12: a drift over the line and back → billed, and NEVER named", () => {
    const r = run(play([STRAIGHT, ...drift()]), ARMED);
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0].titleBg).toBe(POOLED_TITLE);
    expect(r.amendments).toEqual([]);
    expect(r.sawAmendmentsField).toBe(false);
  });

  it("V2 — a LAWFUL U-turn (over a dashed axis) is not evidence for the drift that follows it seconds later", () => {
    // The turn at the gap: the axis is not solid anywhere in it.
    const lawful = turn({ toDeg: 180, crossAtDeg: 60, over: { solid: false } });
    // Now southbound on the far bank; three seconds on, a 15° drift to HIS left
    // (back over the axis, which is solid here) and home again.
    const south = (bank: 1 | -1, off: number): F => ({ bank, nose: 180 - off, kmh: 35 });
    const ticks = play([
      STRAIGHT,
      lawful,
      hold(3, south(-1, 0)),
      hold(1, south(-1, 15)),
      hold(2, south(1, 15)),
      hold(1, south(1, -15)),
      hold(2, south(-1, -15)),
      hold(2, south(-1, 0)),
    ]);
    const r = run(ticks, ARMED);
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0].detail).toBeUndefined();
    // The lawful turn finished well inside round 1's 10 s look-back.
    const lawfulDoneAt = 2 + 180 / 15;
    expect(r.crossings[0].t - lawfulDoneAt).toBeGreaterThan(3);
    expect(r.crossings[0].t - lawfulDoneAt).toBeLessThan(8);
    expect(r.amendments).toEqual([]);
  });

  it("V2 — a 29° swerve to the right, then an 18° pull-out across and back: 47° of swing, no reversal, no name", () => {
    const r = run(
      play([
        STRAIGHT,
        hold(1, { bank: 1, nose: 29, kmh: 30 }),
        hold(1, { bank: 1, nose: -18, kmh: 30 }),
        hold(2, { bank: -1, nose: -18, kmh: 30 }),
        hold(1, { bank: -1, nose: 18, kmh: 30 }),
        hold(3, { bank: 1, nose: 0, kmh: 30 }),
      ]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(1);
    expect(r.amendments).toEqual([]);
  });

  it("the bar for «travels with the far bank» is 45°: stopped 130° round is not a reversal, 136° round is", () => {
    const stopAt = (deg: number) =>
      run(
        play([STRAIGHT, turn({ toDeg: deg, crossAtDeg: 60 }), hold(10, { bank: -1, nose: -deg, kmh: 0 })]),
        ARMED,
      );
    const short = stopAt(130);
    expect(short.crossings).toHaveLength(1);
    expect(short.amendments).toEqual([]);
    const round = stopAt(136);
    expect(round.crossings).toHaveLength(1);
    expect(round.amendments.map((a) => a.detail)).toEqual([UTURN]);
  });

  it("…and it must be HELD for the crossing detector's own sustain: 0.4 s past the bar and back out is not a reversal", () => {
    const flick = (sec: number) =>
      run(
        play([
          STRAIGHT,
          turn({ toDeg: 120, crossAtDeg: 60 }),
          hold(sec, { bank: -1, nose: -140, kmh: 9 }),
          hold(6, { bank: -1, nose: -120, kmh: 0 }),
        ]),
        ARMED,
      );
    expect(flick(0.4).amendments).toEqual([]);
    expect(flick(0.8).amendments.map((a) => a.detail)).toEqual([UTURN]);
    expect(DEFAULT_RULE_CONFIG.solidLineCrossSustainSec).toBe(0.6);
  });

  it("a crossing that RETURNS is forgotten: back on his own bank, a later turn round on that bank names nothing", () => {
    // Out and back, then (never crossing again) the nose comes right round on
    // his OWN half. Whatever that is, it is not a U-turn across the axis.
    const r = run(
      play([
        STRAIGHT,
        ...drift(),
        hold(3, { bank: 1, nose: -100, kmh: 0 }),
        hold(3, { bank: 1, nose: -170, kmh: 0 }),
      ]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(1);
    expect(r.amendments).toEqual([]);
  });

  it("the axis must be SOLID where the centre crossed: the same turn over a dashed axis bills nothing and names nothing", () => {
    // Nose 95° round at the crossing, so the plain detector («the nose opposes
    // its bank») is silent too and only the crossing itself is in question.
    const over = (solidAtCrossing: boolean) =>
      run(
        play([
          STRAIGHT,
          turn({
            toDeg: 180,
            crossAtDeg: 95,
            each: (round) => ({ solid: solidAtCrossing || round < 90 || round > 100 }),
          }),
          AWAY,
        ]),
        ARMED,
      );
    const dashed = over(false);
    expect(dashed.crossings).toEqual([]);
    expect(dashed.amendments).toEqual([]);
    const solid = over(true);
    expect(solid.crossings).toHaveLength(1);
    expect(solid.amendments.map((a) => a.detail)).toEqual([UTURN]);
  });

  it("R4-2 (round 4) — a PULL-OUT, then a turn round over there, inside the span, is the U-turn: however far it ran along the far half, wholly across, pointing the original way", () => {
    // 30 км/ч = 8.33 m/s, 0.4167 m a frame: 0.72 s ≈ 6 m, 0.36 s ≈ 3 m, 4.8 s =
    // 40 m. The body is wholly across (1.2 m clear of the axis) for the whole
    // run. Rounds 2 and 3 decided «a pull-out» at 5 m within 10° and left the
    // crossing un-named — with the overtaking advice — for a student who had
    // turned round where it is forbidden.
    const pullOut = (sec: number, noseOff: number) =>
      run(
        play([
          STRAIGHT,
          hold(0.5, { bank: 1, nose: -17, kmh: 30 }),
          hold(0.5, { bank: -1, nose: -17, kmh: 30, clear: 0.4 }),
          hold(sec, { bank: -1, nose: -noseOff, kmh: 30, clear: 1.2 }),
          turn({ fromDeg: 17, toDeg: 180, crossAtDeg: 0, rate: 30, over: { clear: 1.2 } }),
          AWAY,
        ]),
        ARMED,
      );
    for (const [sec, noseOff] of [
      [0.36, 0],
      [0.55, 0],
      [0.65, 0],
      [0.72, 0],
      [4.8, 0],
      [0.72, 8],
      [0.72, -8],
      [0.72, 12],
      [0.72, -12],
    ] as const) {
      const r = pullOut(sec, noseOff);
      expect(r.crossings, `${sec} s, ${noseOff}°`).toHaveLength(1);
      // The bill went out at the crossing, on the crossing's own title …
      expect(r.crossings[0].titleBg, `${sec} s, ${noseOff}°`).toBe(POOLED_TITLE);
      // … and the turn made over there names it.
      expect(r.amendments.map((a) => [a.billT, a.detail]), `${sec} s, ${noseOff}°`).toEqual([[r.crossings[0].t, UTURN]]);
    }
    // And the pull-out that does NOT turn round keeps the crossing: 40 m up the
    // far half and home again.
    const home = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -17, kmh: 30 }),
        hold(0.5, { bank: -1, nose: -17, kmh: 30, clear: 0.4 }),
        hold(4.8, { bank: -1, nose: 0, kmh: 30, clear: 1.2 }),
        hold(0.5, { bank: -1, nose: 17, kmh: 30, clear: 0.4 }),
        hold(2, { bank: 1, nose: 0, kmh: 30 }),
      ]),
      ARMED,
    );
    expect(home.crossings).toHaveLength(1);
    expect(home.amendments).toEqual([]);
  });

  it("another ROAD drops the reference: an angle against a different edge's geometry completes nothing here", () => {
    const r = run(
      play([
        STRAIGHT,
        turn({ toDeg: 100, crossAtDeg: 60 }),
        turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60, over: { edge: "e-other", bearing: 90 } }),
        hold(3, { bank: -1, nose: 180, kmh: 25, edge: "e-other", bearing: 90 }),
      ]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(1);
    expect(r.amendments).toEqual([]);
  });

  it("R6-1 — another EDGE OF THE SAME ROAD drops nothing: the same turn, handed to the road's next edge 100° round (the same bearing under the car), completes and names its crossing exactly as on one edge; and so does the same axis authored the other way round", () => {
    const named = (r: Run) => r.amendments.map((a) => [a.billT, a.detail]);
    const oneEdge = run(play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 60 }), AWAY]), ARMED);
    expect(named(oneEdge)).toHaveLength(1);
    for (const next of [{ edge: "e-next" }, { edge: "e-next", bearing: 180 }] as Array<Partial<F>>) {
      // On an edge authored the other way round the runtime numbers the halves the other way too.
      const bankOn = (b: 1 | -1): 1 | -1 => (next.bearing === 180 ? (b === 1 ? -1 : 1) : b);
      const r = run(
        play([
          STRAIGHT,
          turn({ toDeg: 100, crossAtDeg: 60 }),
          turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60, over: next, each: () => ({ bank: bankOn(-1) }) }),
          hold(3, { bank: bankOn(-1), nose: 180, kmh: 25, ...next }),
        ]),
        ARMED,
      );
      expect(r.crossings.map((c) => c.t)).toEqual(oneEdge.crossings.map((c) => c.t));
      expect(named(r)).toEqual(named(oneEdge));
    }
  });

  it("frames it cannot measure HOLD: a turn that mounts the verge half-way round (offCarriageway) is still the turn", () => {
    const r = run(
      play([
        STRAIGHT,
        turn({ toDeg: 180, crossAtDeg: 60, each: (round) => ({ off: round > 100 && round < 150 }) }),
        AWAY,
      ]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(1);
    expect(r.amendments.map((a) => a.detail)).toEqual([UTURN]);
  });

  it("R5-1 — a turn-round is an event of the HEADING: a car that crosses, leaves the carriageway and turns round on the verge — still fixed to this road — has turned round out there, and the crossing's bill is named there (rounds 2–4 waited for it to be «on the far bank» again); with NO fix on the road nothing is confirmed until the road sees it again", () => {
    const onTheVerge = run(
      play([
        STRAIGHT,
        turn({ toDeg: 100, crossAtDeg: 60 }),
        turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60, over: { off: true } }),
        hold(8, { bank: -1, nose: 180, kmh: 0, off: true }),
      ]),
      ARMED,
    );
    expect(onTheVerge.crossings).toHaveLength(1);
    expect(onTheVerge.amendments.map((a) => [a.billT, a.detail])).toEqual([[onTheVerge.crossings[0].t, UTURN]]);
    // The frame it is named on is past the kerb: 0.6 s after the nose is 135° round.
    const namedAt = onTheVerge.amendments[0].t;
    expect(roundAt(play([STRAIGHT, turn({ toDeg: 100, crossAtDeg: 60 }), turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60 })]), namedAt)).toBeGreaterThanOrEqual(135);
    // Out of the road's reach altogether: nothing is confirmed out there, however long he stands …
    const unseen = run(
      play([
        STRAIGHT,
        turn({ toDeg: 100, crossAtDeg: 60 }),
        turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60, over: { noFix: true } }),
        hold(8, { bank: -1, nose: 180, kmh: 0, noFix: true }),
      ]),
      ARMED,
    );
    expect(unseen.crossings).toHaveLength(1);
    expect(unseen.amendments).toEqual([]);
    // … and it is, on the first frame the road has him again.
    const backOn = run(
      play([
        STRAIGHT,
        turn({ toDeg: 100, crossAtDeg: 60 }),
        turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 60, over: { noFix: true } }),
        hold(2, { bank: -1, nose: 180, kmh: 10, noFix: true }),
        hold(3, { bank: -1, nose: 180, kmh: 20 }),
      ]),
      ARMED,
    );
    expect(backOn.amendments.map((a) => a.detail)).toEqual([UTURN]);
    const firstBack = (2 + 100 / 15 + 80 / 15 + 2) ;
    expect(Math.abs(backOn.amendments[0].t - firstBack)).toBeLessThan(0.11);
  });

  it("no road record, no name: ticks that carry no edgeAlignment bill exactly as before and are never called a U-turn", () => {
    const bare = demoUTurn().map((t) => {
      const copy = { ...t };
      delete copy.edgeAlignment;
      return copy;
    });
    const r = run(bare, ARMED);
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0].detail).toBeUndefined();
    expect(r.amendments).toEqual([]);
    // …and one bill does not silence the next: two separate drifts on such
    // ticks are two bills, armed or not (the plain detector's own excursions).
    const twoDrifts = play([STRAIGHT, ...drift(), ...drift()]).map((t) => {
      const copy = { ...t };
      delete copy.edgeAlignment;
      return copy;
    });
    expect(run(twoDrifts).crossings).toHaveLength(2);
    expect(run(twoDrifts, ARMED).crossings).toHaveLength(2);
    expect(run(play([STRAIGHT, ...drift(), ...drift()]), ARMED).crossings).toHaveLength(2);
  });

  it("two U-turns are two acts: two bills, each named for itself", () => {
    const back = {
      sec: 180 / 15,
      at: (u: number): F => {
        const round = 180 * u;
        return { bank: round >= 60 ? 1 : -1, nose: -(180 + round) };
      },
    };
    const r = run(
      play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 60 }), hold(3, { bank: -1, nose: 180, kmh: 25 }), back, hold(3, { bank: 1, nose: 0, kmh: 25 })]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(2);
    expect(r.amendments.map((a) => [a.billT, a.detail])).toEqual([
      [r.crossings[0].t, UTURN],
      [r.crossings[1].t, UTURN],
    ]);
  });
});

describe("§1b a crossing the plain detector cannot see is billed here — once", () => {
  it("V5 — the natural arc from the outer lane (already 95° round at the axis): UNBILLED with the key off, billed at the crossing with it on", () => {
    const ticks = play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 95 }), AWAY]);
    // The plain detector's condition never holds for its sustain on this drive.
    expect(run(ticks).crossings).toEqual([]);
    const r = run(ticks, ARMED);
    expect(r.crossings).toHaveLength(1);
    const bill = r.crossings[0];
    // The crossing, pooled, 0.6 s after the centre passed the axis …
    expect(bill).toEqual(rules.makeViolation("CROSSED_SOLID_LINE", bill.t));
    const crossedAt = 2 + 95 / 15;
    expect(bill.t - crossedAt).toBeGreaterThan(0.55);
    expect(bill.t - crossedAt).toBeLessThan(0.7);
    // … and the same bill, named when the car has turned round.
    expect(r.amendments.map((a) => [a.billT, a.detail])).toEqual([[bill.t, UTURN]]);
  });

  it("at 4 км/ч (under the plain detector's moving floor) the turn is billed and named too", () => {
    const ticks = play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 60, over: { kmh: 4 } }), AWAY]);
    expect(run(ticks).crossings).toEqual([]);
    const r = run(ticks, ARMED);
    expect(r.crossings).toHaveLength(1);
    expect(r.amendments.map((a) => a.detail)).toEqual([UTURN]);
  });

  it("…and a crossing square across the road that never turns round is a CROSSING: billed pooled, not named", () => {
    const r = run(
      play([STRAIGHT, turn({ toDeg: 120, crossAtDeg: 95 }), hold(8, { bank: -1, nose: -120, kmh: 0 })]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0].detail).toBeUndefined();
    expect(r.amendments).toEqual([]);
  });

  it("ONE excursion, ONE bill — and NOT before the crossing (round 3, W2): with the nose opposing his OWN bank from 90° round and the centre crossing at 110°, the bill is the crossing's, 0.6 s after the centre is across, and it is the one named", () => {
    const ticks = play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 110 }), AWAY]);
    const crossedAt = 2 + 110 / 15;
    // The shipped detector («the nose opposes its bank», key off) bills this
    // drive BEFORE the centre has crossed — 99° round, on the car's own half.
    const shipped = run(ticks);
    expect(shipped.crossings).toHaveLength(1);
    expect(shipped.crossings[0].t).toBeLessThan(crossedAt);
    expect(roundAt(ticks, shipped.crossings[0].t)).toBeLessThan(110);
    // Armed: one bill still, and it waits for the centre.
    const r = run(ticks, ARMED);
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0].t - crossedAt).toBeGreaterThan(0.55);
    expect(r.crossings[0].t - crossedAt).toBeLessThan(0.7);
    expect(r.amendments.map((a) => [a.billT, a.detail])).toEqual([[r.crossings[0].t, UTURN]]);
  });

  it("ONE excursion, ONE bill, the other way about: billed by POSITION first (95° round at the axis), and when the nose then swings back to oppose the far bank the plain detector adds nothing", () => {
    const ticks = play([
      STRAIGHT,
      turn({ toDeg: 110, crossAtDeg: 95 }),
      hold(1, { bank: -1, nose: -110, kmh: 0 }),
      // He thinks better of it and steers back towards the way he came, still
      // on the far half: nose 60° round, moving — the plain detector's condition.
      hold(2, { bank: -1, nose: -60, kmh: 9 }),
      hold(3, { bank: -1, nose: -60, kmh: 0 }),
    ]);
    const r = run(ticks, ARMED);
    expect(r.crossings).toHaveLength(1);
    expect(roundAt(ticks, r.crossings[0].t)).toBeGreaterThan(95);
    expect(r.amendments).toEqual([]);
  });

  it("a crossing made in REVERSE gear is billed by nothing (A12: backing across the markings) — so the completed reversal IS the bill, with the act", () => {
    // Nose swung RIGHT to 100°, then backed across the axis tail first, the
    // nose coming round to face the other way.
    const r = run(
      play([
        STRAIGHT,
        hold(0.3, { bank: 1, nose: 100, kmh: 7 }),
        hold(1, { bank: 1, nose: 100, kmh: 0 }),
        hold(1.5, { bank: 1, nose: 100, kmh: 6, gear: -1 }),
        hold(1, { bank: -1, nose: 120, kmh: 6, gear: -1 }),
        hold(1, { bank: -1, nose: 150, kmh: 6, gear: -1 }),
        hold(2, { bank: -1, nose: 180, kmh: 6, gear: -1 }),
        AWAY,
      ]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0]).toEqual(rules.makeViolation("CROSSED_SOLID_LINE", r.crossings[0].t, { detail: UTURN }));
    expect(r.amendments).toEqual([]);
    // Billed only once the car faces the other way on the far half.
    expect(r.crossings[0].t).toBeGreaterThan(2 + 0.3 + 1 + 1.5 + 1 + 0.5);
  });
});

describe("§1b′ (round 4) the unbilled reversal is the U-turn's bill wherever the turn-round was made over a solid axis — and no bill at all where it was made over the dashes", () => {
  /** Backed across the axis, `sec` seconds up the far half still pointing the original way, then turned round — all in reverse gear. */
  const backedAcross = (sec: number, turnOver: Partial<F> = {}) =>
    run(
      play([
        STRAIGHT,
        hold(1, { bank: 1, nose: 0, kmh: 6, gear: -1 }),
        // 6 км/ч = 1.67 m/s: 3.6 s ≈ 6 m on the far half, 1.2 s ≈ 2 m.
        hold(sec, { bank: -1, nose: 0, kmh: 6, gear: -1, clear: 1 }),
        // The last half-second along the road, where the turn-round BEGINS (round 5: its place).
        hold(0.5, { bank: -1, nose: 0, kmh: 6, gear: -1, clear: 1, ...turnOver }),
        hold(1, { bank: -1, nose: -90, kmh: 6, gear: -1, clear: 1, ...turnOver }),
        hold(3, { bank: -1, nose: 180, kmh: 6, gear: -1, clear: 1, ...turnOver }),
      ]),
      ARMED,
    );

  it("R4-2 — 6 m up the far half first, or 2 m: ONE bill, on the frame the reversal completes, and it is the U-turn's (rounds 2–3 billed the 6 m one as a plain crossing: «a pull-out»)", () => {
    for (const sec of [3.6, 1.2]) {
      const r = backedAcross(sec);
      expect(r.crossings.map((c) => c.detail), `${sec} s`).toEqual([UTURN]);
      expect(r.crossings, `${sec} s`).toEqual([rules.makeViolation("CROSSED_SOLID_LINE", r.crossings[0].t, { detail: UTURN })]);
      expect(r.amendments, `${sec} s`).toEqual([]);
    }
    // The bill's act does not follow the body: astride on the bill frame, it is still the U-turn.
    const astride = run(
      play([
        STRAIGHT,
        hold(1, { bank: 1, nose: 0, kmh: 6, gear: -1 }),
        hold(3.6, { bank: -1, nose: 0, kmh: 6, gear: -1, clear: 1 }),
        hold(1, { bank: -1, nose: -90, kmh: 6, gear: -1, clear: 1 }),
        hold(3, { bank: -1, nose: 180, kmh: 6, gear: -1, clear: -0.3 }),
      ]),
      ARMED,
    );
    expect(astride.crossings.map((c) => c.detail)).toEqual([UTURN]);
  });

  it("R4-1 — the same manoeuvre with the turn-round BEGUN where the axis is DASHED: nothing billed the reverse crossing (A12), and the lawful turn is billed by nothing", () => {
    const r = backedAcross(3.6, { solid: false });
    expect(r.crossings).toEqual([]);
    expect(r.amendments).toEqual([]);
    expect(r.sawAmendmentsField).toBe(false);
    // The turn still ENDED the manoeuvre: the far bank is the reference now.
    const turnState = (r.state as unknown as { solidCrossTurn: { bank: number; crossedSolidAt: number | null; billedAt: number | null } }).solidCrossTurn;
    expect([turnState.bank, turnState.crossedSolidAt, turnState.billedAt]).toEqual([-1, null, null]);
  });
});

describe("§1c OFF unless a lesson arms it — and then the reducer is exactly what it was", () => {
  it("the key defaults to false and is an ARMING key for CROSSED_SOLID_LINE", () => {
    expect((DEFAULT_RULE_CONFIG as unknown as Record<string, unknown>).solidCrossUTurnEnabled).toBe(false);
    expect((DEFAULT_RULE_CONFIG as unknown as Record<string, unknown>).solidCrossUTurnActDeg).toBeUndefined();
  });

  it("the very same U-turn on any other lesson: one pooled bill, no amendments member on any frame, no state kept", () => {
    const ticks = demoUTurn();
    const r = run(ticks);
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0]).toEqual(rules.makeViolation("CROSSED_SOLID_LINE", r.crossings[0].t));
    expect(r.sawAmendmentsField).toBe(false);
    const idle = createRuleEngine() as unknown as { solidCrossTurn?: unknown };
    expect((r.state as unknown as { solidCrossTurn?: unknown }).solidCrossTurn).toEqual(idle.solidCrossTurn);
  });

  it("…and with the key off `edgeAlignment` is not read: stripping it, or lying about it, changes not one event and not one byte of state", () => {
    const ticks = [...demoUTurn(), ...play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 95 }), AWAY]).map((t) => ({ ...t, t: t.t + 40 }))];
    const stripped = ticks.map((t) => {
      const copy = { ...t };
      delete copy.edgeAlignment;
      return copy;
    });
    const lied = ticks.map((t) => ({
      ...t,
      edgeAlignment: { ...t.edgeAlignment!, deg: 0, travelDir: (t.edgeAlignment!.travelDir === 1 ? -1 : 1) as 1 | -1, edgeId: "e-lie", offCarriageway: true, axisClearM: -3 },
    }));
    const base = run(ticks).frames;
    expect(run(stripped).frames).toEqual(base);
    expect(run(lied).frames).toEqual(base);
  });

  it("with the key ON it IS read — the same lie changes the outcome (so the test above is not vacuous)", () => {
    const ticks = demoUTurn();
    const lied = ticks.map((t) => ({ ...t, edgeAlignment: { ...t.edgeAlignment!, deg: 0, travelDir: 1 as const } }));
    expect(run(ticks, ARMED).amendments).toHaveLength(1);
    expect(run(lied, ARMED).amendments).toHaveLength(0);
  });

  it("…and so is the body's distance from the axis (round 3): a lie about `axisClearM` ALONE changes the bill's reason with the key on, and nothing with it off", () => {
    const ticks = demoUTurn().map((t) => ({ ...t, edgeAlignment: { ...t.edgeAlignment!, axisClearM: 2 } }));
    const lied = ticks.map((t) => ({ ...t, edgeAlignment: { ...t.edgeAlignment!, axisClearM: -2 } }));
    expect(run(ticks, ARMED).crossings.map((c) => c.detail)).toEqual([undefined]);
    expect(run(lied, ARMED).crossings.map((c) => c.detail)).toEqual([ASTRIDE]);
    expect(run(lied).frames).toEqual(run(ticks).frames);
  });
});

describe("§1d (round 3) the BODY's position on the road decides three things the centre and the nose could not", () => {
  // --- W1: a straddle is not a pull-out ---------------------------------------
  /** Ease over, `sec` seconds along the far half nose the original way with the body `clear` of the axis, then round. */
  const easeOverThenRound = (sec: number, clear: number | undefined) =>
    run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(sec, { bank: -1, nose: -6, kmh: 30, ...(clear !== undefined ? { clear } : {}) }),
        turn({ fromDeg: 6, toDeg: 180, crossAtDeg: 0, rate: 30, over: clear !== undefined ? { clear } : {} }),
        AWAY,
      ]),
      ARMED,
    );

  it("W1 — 10 m along the far half with the body ASTRIDE the axis (the centre 0.4 m over), then a turn round → the U-turn, named; and (round 4, R4-2) so is the same run with the whole body across — where the body is no longer decides the NAME", () => {
    // 30 км/ч for 1.2 s = 10 m, inside round 3's 10° band all the way.
    for (const clear of [-0.45, -0.01, 0, 0.3, 2.5, undefined]) {
      const r = easeOverThenRound(1.2, clear);
      expect(r.crossings, String(clear)).toHaveLength(1);
      expect(r.amendments.map((a) => [a.billT, a.detail]), String(clear)).toEqual([[r.crossings[0].t, UTURN]]);
    }
    // What the body still decides is the REASON the bill went out on (W3).
    expect(easeOverThenRound(1.2, -0.45).crossings[0].detail).toBe(ASTRIDE);
    expect(easeOverThenRound(1.2, 0.3).crossings[0].detail).toBeUndefined();
  });

  it("W1 — any mix of metres astride and metres wholly across, then round → named (round 3 drew a line at 5 m across)", () => {
    const mixed = (acrossSec: number) =>
      run(
        play([
          STRAIGHT,
          hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
          hold(0.48, { bank: -1, nose: -6, kmh: 30, clear: -0.5 }),
          hold(acrossSec, { bank: -1, nose: -6, kmh: 30, clear: 0.5 }),
          turn({ fromDeg: 6, toDeg: 180, crossAtDeg: 0, rate: 30, over: { clear: 0.5 } }),
          AWAY,
        ]),
        ARMED,
      );
    expect(mixed(0.48).amendments.map((a) => a.detail)).toEqual([UTURN]);
    expect(mixed(0.72).amendments.map((a) => a.detail)).toEqual([UTURN]);
    expect(mixed(6).amendments.map((a) => a.detail)).toEqual([UTURN]);
  });

  it("W1 — an EARLIER crossing that came home is its own act: out 3 m and home, out 3 m again and round → two bills, and only the second is named", () => {
    const out3 = [
      hold(0.5, { bank: 1, nose: -17, kmh: 30 }),
      hold(0.36, { bank: -1, nose: 0, kmh: 30, clear: 1 }),
    ];
    const r = run(
      play([
        STRAIGHT,
        ...out3,
        hold(0.3, { bank: -1, nose: 17, kmh: 30, clear: 1 }),
        hold(2, { bank: 1, nose: 0, kmh: 30 }),
        ...out3,
        turn({ fromDeg: 17, toDeg: 180, crossAtDeg: 0, rate: 30, over: { clear: 1 } }),
        AWAY,
      ]),
      ARMED,
    );
    // Two crossings, two bills; the amendment is addressed to the second — the
    // crossing the car was still on the far side of when it turned round.
    expect(r.crossings).toHaveLength(2);
    expect(r.amendments.map((a) => [a.billT, a.detail])).toEqual([[r.crossings[1].t, UTURN]]);
  });

  // --- ROUND 4, R4-1: WHERE THE TURN-ROUND IS MADE ---------------------------------
  //
  // THE TURN STATION is the first frame of the turn-round: the last unbroken run
  // of frames, ending at the completed reversal, on which the centre is on the
  // far bank AND the nose is more than 45° off the reference direction. The
  // reversal is the U-turn only if the road's own record says the axis is solid
  // THERE (`tick.solidCenterLine` on that frame).

  /**
   * Eases over the SOLID axis and runs 2 s along the far half (astride, 30 км/ч),
   * then turns round at 15 °/s; `solidAt(round)` says where the axis is solid
   * during the turn, by how far round the nose is. 0.75° a frame, so the frames
   * either side of the bar are 45.0° (still WITH the reference direction) and
   * 45.75° (the first frame of the turn-round).
   */
  const acrossThenTurn = (solidAt: (round: number) => boolean, clear = -0.4) =>
    run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(1.5, { bank: -1, nose: -6, kmh: 30, clear }),
        // The last half-second along the road — `solidAt(0)` is the axis where the turn-round BEGINS.
        hold(0.5, { bank: -1, nose: -6, kmh: 30, clear, solid: solidAt(0) }),
        turn({ fromDeg: 6, toDeg: 180, crossAtDeg: 0, over: { clear }, each: (round) => ({ solid: solidAt(round) }) }),
        hold(3, { bank: -1, nose: 180, kmh: 25, solid: false }),
      ]),
      ARMED,
    );
  const named = (r: Run) => r.amendments.map((a) => [a.billT, a.detail]);

  it("R4-1 — X1 at the rule layer: over the solid axis inside the span, held across, and the turn-round made where the axis is DASHED → the crossing's bill stands as it went out, and the lawful turn names nothing and bills nothing", () => {
    for (const clear of [-0.8, -0.05, 1.5]) {
      const r = acrossThenTurn(() => false, clear);
      expect(r.crossings, String(clear)).toHaveLength(1);
      expect(r.crossings[0].titleBg).toBe(POOLED_TITLE);
      expect(r.crossings[0].detail).toBe(clear < 0 ? ASTRIDE : undefined);
      expect(r.amendments, String(clear)).toEqual([]);
      expect(r.sawAmendmentsField).toBe(false);
    }
    // The same drive with the axis solid all the way round is the U-turn.
    const inSpan = acrossThenTurn(() => true);
    expect(named(inSpan)).toEqual([[inSpan.crossings[0].t, UTURN]]);
  });

  it("R5-1 — THE PLACE IS WHERE THE TURN-ROUND BEGINS: the last frame before the swing that carries the nose out of the band is seen to advance (here the nose is still within a degree of where it was: under 10° round) — the axis dashed there and SOLID for all the rest of the turn (45° round, square to the road, the reversal) is not the U-turn; solid there and DASHED from 10° round on is (round 4 read the frame the nose passed 45°: solid up to 44° round was «lawful» — verifier Y5)", () => {
    const begunOverDashes = acrossThenTurn((round) => round > 10);
    expect(begunOverDashes.crossings).toHaveLength(1);
    expect(named(begunOverDashes)).toEqual([]);
    const begunOverSolid = acrossThenTurn((round) => round <= 10);
    expect(named(begunOverSolid)).toEqual([[begunOverSolid.crossings[0].t, UTURN]]);
    // Round 4's own two sides of 45° are the same side now: both began over the solid axis.
    for (const upTo of [44, 47]) {
      const r = acrossThenTurn((round) => round <= upTo);
      expect(named(r), String(upTo)).toEqual([[r.crossings[0].t, UTURN]]);
    }
  });

  it("R4-1 — it is the station where the turn is MADE, not any later frame of it: solid at the station and dashed for all the rest of the turn (square to the road, the reversal, the frame it completes on) → the U-turn; dashed at the station and SOLID for all the rest → lawful", () => {
    const begunInSpan = acrossThenTurn((round) => round <= 50);
    expect(named(begunInSpan)).toEqual([[begunInSpan.crossings[0].t, UTURN]]);
    const begunPastIt = acrossThenTurn((round) => round > 50);
    expect(begunPastIt.crossings).toHaveLength(1);
    expect(named(begunPastIt)).toEqual([]);
  });

  it("R5-2 (iii) — the place is NOT the crossing: on an arc from the outer lane begun over the DASHES whose centre goes over where the axis is solid (95° round) the crossing is billed, and it keeps the crossing's copy (round 4 placed the turn at the crossing and named it); the same arc begun over the solid axis is the U-turn", () => {
    const begunOverDashes = run(play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 95, each: (round) => ({ solid: round >= 90 }) }), AWAY]), ARMED);
    expect(begunOverDashes.crossings).toHaveLength(1);
    expect(begunOverDashes.crossings[0].titleBg).toBe(POOLED_TITLE);
    expect(named(begunOverDashes)).toEqual([]);
    // Begun over the solid axis, dashed for 5°–89° round on his own half, solid again where the centre goes over.
    const begunOverSolid = run(
      play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 95, each: (round) => ({ solid: round < 5 || round >= 90 }) }), AWAY]),
      ARMED,
    );
    expect(begunOverSolid.crossings).toHaveLength(1);
    expect(named(begunOverSolid)).toEqual([[begunOverSolid.crossings[0].t, UTURN]]);
  });

  it("R4-1 — and NOT the station of the bill or of the crossing: both inside the span (they are, on every drive above) decide nothing; and a crossing whose bill lands over the dashes is still named when the turn is made over a solid axis", () => {
    // The centre crosses the solid axis 0.3 s before the dashes begin, so the
    // position bill (0.6 s) lands where the axis is DASHED; further on the axis
    // is solid again, and there the car turns round.
    const r = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(0.3, { bank: -1, nose: -6, kmh: 30, clear: -0.4 }),
        hold(1.7, { bank: -1, nose: -6, kmh: 30, clear: -0.4, solid: false }),
        turn({ fromDeg: 6, toDeg: 180, crossAtDeg: 0, over: { clear: -0.4 } }),
        AWAY,
      ]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(1);
    const billFrame = r.frames.findIndex((f) => f.events.some((e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE"));
    expect(billFrame).toBeGreaterThan((2 + 0.5 + 0.3) * HZ);
    expect(named(r)).toEqual([[r.crossings[0].t, UTURN]]);
  });

  it("R4-1 — the run must be UNBROKEN: 60° round over the solid axis, then steered back to travel along the road again, on to the dashes, and round THERE → lawful; the mirror (a false start over the dashes, the turn made over the solid axis) → the U-turn", () => {
    const falseStartThenTurn = (firstSolid: boolean, thenSolid: boolean) =>
      run(
        play([
          STRAIGHT,
          hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
          hold(1, { bank: -1, nose: -6, kmh: 30, clear: -0.4 }),
          // A false start: the nose 60° round on the far half, then back to 20°.
          turn({ fromDeg: 6, toDeg: 60, crossAtDeg: 0, over: { clear: -0.4, solid: firstSolid } }),
          hold(1, { bank: -1, nose: -60, kmh: 0, clear: -0.4, solid: firstSolid }),
          hold(2, { bank: -1, nose: -20, kmh: 20, clear: -0.4, solid: firstSolid }),
          // Along the road again, then the turn itself.
          hold(2, { bank: -1, nose: -5, kmh: 20, clear: -0.4, solid: thenSolid }),
          turn({ fromDeg: 5, toDeg: 180, crossAtDeg: 0, over: { clear: -0.4, solid: thenSolid } }),
          hold(3, { bank: -1, nose: 180, kmh: 25, solid: thenSolid }),
        ]),
        ARMED,
      );
    const lawful = falseStartThenTurn(true, false);
    expect(lawful.crossings).toHaveLength(1);
    expect(named(lawful)).toEqual([]);
    const banned = falseStartThenTurn(false, true);
    // (the centre crossed over the SOLID axis on both: the first second on the far half)
    expect(named(banned)).toEqual([[banned.crossings[0].t, UTURN]]);
  });

  it("R4-1 — and it does not outlive the excursion: a turn begun over the solid axis and ABANDONED (60° round, then home to his own half), then — a new crossing — over the solid axis again, held across to the dashes and round there → two crossing bills, neither named", () => {
    const r = run(
      play([
        STRAIGHT,
        // Across at 50° round, on to 60°, and back home: the first excursion.
        turn({ toDeg: 60, crossAtDeg: 50, over: { clear: -0.4 } }),
        hold(1, { bank: -1, nose: -60, kmh: 0, clear: -0.4 }),
        hold(1, { bank: -1, nose: 30, kmh: 9, clear: -0.4 }),
        hold(2, { bank: 1, nose: 0, kmh: 20 }),
        // The second: eased over where the axis is solid, held across to where it is dashed, and round there.
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: -0.4 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: -0.4, solid: false }),
        turn({ fromDeg: 6, toDeg: 180, crossAtDeg: 0, over: { clear: -0.4, solid: false } }),
        hold(3, { bank: -1, nose: 180, kmh: 25, solid: false }),
      ]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(2);
    expect(r.amendments).toEqual([]);
  });

  it("R4-1 — …in either direction: a false start over the DASHES (across 50° round, then BACKED home with the nose still 60° round), on into the span, and the turn itself with the centre crossing 60° round where the axis is solid → the U-turn (a station left over from the false start would have called it lawful)", () => {
    const r = run(
      play([
        STRAIGHT,
        turn({ toDeg: 60, crossAtDeg: 50, over: { solid: false } }),
        hold(1, { bank: -1, nose: -60, kmh: 0, solid: false }),
        hold(1, { bank: 1, nose: -60, kmh: 5, gear: -1, solid: false }),
        hold(2, { bank: 1, nose: 0, kmh: 20 }),
        turn({ toDeg: 180, crossAtDeg: 60 }),
        AWAY,
      ]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(1);
    expect(named(r)).toEqual([[r.crossings[0].t, UTURN]]);
  });

  // --- PAST THE KERB: the run is followed where the road still places the car, and unplaced where it does not ---

  /**
   * Eased over the solid axis and wholly across; `verge(round)` says what the
   * frame is while the nose goes from 6° to 180° round at 15 °/s — past the
   * kerb, with no fix, where the axis is solid.
   */
  const turnVia = (verge: (round: number) => Partial<F>, after: Partial<F> = {}) =>
    run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(1, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
        turn({ fromDeg: 6, toDeg: 180, crossAtDeg: 0, each: (round) => ({ clear: 2, ...verge(round) }) }),
        hold(3, { bank: -1, nose: 180, kmh: 25, ...after }),
      ]),
      ARMED,
    );

  it("R5-3 past the kerb — a turn-round BEGUN ON THE VERGE is placed there, off the same record: over the kerb while still along the road, solid out there and dashed where he comes back on → the U-turn; dashed out there and SOLID where he comes back on → not (round 4's first cut read the frame he came back on)", () => {
    // Past the kerb from the last half-second of the approach to 100° round.
    const turnBegunOnTheVerge = (solidOutThere: boolean) =>
      run(
        play([
          STRAIGHT,
          hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
          hold(1, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
          hold(0.5, { bank: -1, nose: -6, kmh: 30, off: true, solid: solidOutThere }),
          turn({ fromDeg: 6, toDeg: 180, crossAtDeg: 0, each: (round) => (round < 100 ? { off: true, solid: solidOutThere } : { clear: 2, solid: !solidOutThere }) }),
          hold(3, { bank: -1, nose: 180, kmh: 25, solid: !solidOutThere }),
        ]),
        ARMED,
      );
    const solidOnTheVerge = turnBegunOnTheVerge(true);
    expect(named(solidOnTheVerge)).toEqual([[solidOnTheVerge.crossings[0].t, UTURN]]);
    const dashedOnTheVerge = turnBegunOnTheVerge(false);
    expect(dashedOnTheVerge.crossings).toHaveLength(1);
    expect(named(dashedOnTheVerge)).toEqual([]);
    // …and a turn BEGUN on the carriageway keeps its place whatever the verge is like (`turnVia`: the approach is over a solid axis).
    for (const verge of [
      (round: number) => ({ off: round > 20 && round < 100, solid: round < 100 }),
      (round: number) => ({ off: round > 20 && round < 100, solid: round <= 20 || round >= 100 }),
      (round: number) => ({ off: round > 20 && round < 100, solid: round <= 10 }),
    ]) {
      const r = turnVia(verge);
      expect(named(r)).toEqual([[r.crossings[0].t, UTURN]]);
    }
  });

  /**
   * A swing over the SOLID axis (60° round, on the carriageway), off over the
   * kerb, the nose `backTo`° round out there for 3 s — on past the end of the
   * solid axis — and the turn-round itself begun on the verge over the dashes;
   * back on at 100° round, and the reversal completes on the carriageway.
   */
  const swingThenVerge = (backTo: number, out: Partial<F> = { off: true }) =>
    run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(1, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
        turn({ fromDeg: 6, toDeg: 60, crossAtDeg: 0, over: { clear: 2 } }),
        hold(0.5, { bank: -1, nose: -60, kmh: 14, clear: 2, off: true }),
        hold(3, { bank: -1, nose: -backTo, kmh: 14, solid: false, ...out }),
        turn({ fromDeg: backTo, toDeg: 100, crossAtDeg: 0, over: { solid: false, ...out } }),
        turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 0, over: { solid: false, clear: 2 } }),
        hold(3, { bank: -1, nose: 180, kmh: 25, solid: false }),
      ]),
      ARMED,
    );

  it("R4-1 past the kerb — the run BREAKS out there too: a 60° swing over the solid axis, off over the kerb, along the verge pointing up the road again, and the turn-round made on the verge past the end of the solid axis → lawful, the crossing's bill stands unnamed (held, the swing's station named it «на това място» — measured through the live chain at L1, L3 and L4)", () => {
    const r = swingThenVerge(5);
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0].titleBg).toBe(POOLED_TITLE);
    expect(named(r)).toEqual([]);
    // Up to the band's edge: 44° off the reference direction is still «along the road» and breaks the run; 46° is not, and does not.
    expect(named(swingThenVerge(44))).toEqual([]);
    const unbroken = swingThenVerge(46);
    expect(named(unbroken)).toEqual([[unbroken.crossings[0].t, UTURN]]);
  });

  it("R5-3 — NO FIX at all (out in the field): A PLACE ALREADY MEASURED IS KEPT — the swing begun over the solid axis, out of the road's reach still 60° round, and back on 100° round → the U-turn (round 4 threw the place away: verifier Y2); a turn-round BEGUN out there has no station and names nothing; and one whose nose came back along the road out there has ended", () => {
    const viaTheField = (outThere: F, backOn: Array<{ sec: number; at: (u: number) => F }>) =>
      run(
        play([
          STRAIGHT,
          hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
          hold(1, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
          turn({ fromDeg: 6, toDeg: 60, crossAtDeg: 0, over: { clear: 2 } }),
          hold(3, outThere),
          ...backOn,
          AWAY,
        ]),
        ARMED,
      );
    const round100 = [turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 0, over: { clear: 2 } })];
    // The nose never came back along the road: it is the turn-round that began over the solid axis.
    const heldRound = viaTheField({ bank: -1, nose: -60, kmh: 14, noFix: true }, round100);
    expect(heldRound.crossings).toHaveLength(1);
    expect(named(heldRound)).toEqual([[heldRound.crossings[0].t, UTURN]]);
    // The same frames with the road's fix kept (past the kerb, not out of reach) — the same.
    const placed = viaTheField({ bank: -1, nose: -60, kmh: 14, off: true }, round100);
    expect(named(placed)).toEqual([[placed.crossings[0].t, UTURN]]);
    // The nose BACK ALONG THE ROAD out there (5° round for 3 s): that excursion ended, and the turn-round that
    // followed began where no station is known — unplaced, the crossing keeps its copy (A12).
    const straightenedOutThere = viaTheField({ bank: -1, nose: -5, kmh: 14, noFix: true }, round100);
    expect(straightenedOutThere.crossings).toHaveLength(1);
    expect(named(straightenedOutThere)).toEqual([]);
    // Begun out there: across and along the road (no excursion in progress), out of reach, back on 100° round where the axis is solid.
    const begunOutThere = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(1, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
        hold(3, { bank: -1, nose: -6, kmh: 14, noFix: true }),
        ...round100,
        AWAY,
      ]),
      ARMED,
    );
    expect(begunOutThere.crossings).toHaveLength(1);
    expect(named(begunOutThere)).toEqual([]);
    // …and unplaced only for that excursion: back along the road on a frame the road can place, then round over the solid axis → the U-turn.
    const placedAgain = viaTheField({ bank: -1, nose: -5, kmh: 14, noFix: true }, [
      hold(1, { bank: -1, nose: -6, kmh: 20, clear: 2 }),
      turn({ fromDeg: 6, toDeg: 180, crossAtDeg: 0, over: { clear: 2 } }),
    ]);
    expect(named(placedAgain)).toEqual([[placedAgain.crossings[0].t, UTURN]]);
  });

  it("R5-3 — a fix on SOME OTHER road's verge is no fix on this one — exactly like the field: the nose back along THIS road out there ends the excursion and what follows is unplaced; the nose held round keeps the place it began at", () => {
    const r = swingThenVerge(5, { off: true, edge: "e-other" });
    expect(r.crossings).toHaveLength(1);
    expect(named(r)).toEqual([]);
    const heldRound = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(1, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
        turn({ fromDeg: 6, toDeg: 60, crossAtDeg: 0, over: { clear: 2 } }),
        hold(3, { bank: -1, nose: -60, kmh: 14, off: true, edge: "e-other" }),
        turn({ fromDeg: 100, toDeg: 180, crossAtDeg: 0, over: { clear: 2 } }),
        AWAY,
      ]),
      ARMED,
    );
    expect(heldRound.crossings).toHaveLength(1);
    expect(named(heldRound)).toEqual([[heldRound.crossings[0].t, UTURN]]);
  });

  it("R4-1 past the kerb — «along the road» is the REFERENCE direction, whichever bank that is: southbound after a lawful U-turn, back over the solid axis, a swing, off over the kerb, along the verge pointing SOUTH again, and round out there over the dashes → lawful; the swing held all the way → the U-turn", () => {
    // After the lawful turn the reference is the far bank of the road's own geometry: «along the road» is nose 180.
    const southboundThenVerge = (noseOnTheVerge: number) =>
      run(
        play([
          STRAIGHT,
          turn({ toDeg: 180, crossAtDeg: 60, over: { solid: false } }),
          hold(3, { bank: -1, nose: 180, kmh: 25, solid: false }),
          hold(1, { bank: -1, nose: 180, kmh: 35 }),
          // Back over the SOLID axis, 6° off the way he is going, wholly across; then a swing to 60° off it.
          hold(0.5, { bank: -1, nose: 174, kmh: 30 }),
          hold(1, { bank: 1, nose: 174, kmh: 30, clear: 2 }),
          hold(0.5, { bank: 1, nose: 120, kmh: 14, clear: 2 }),
          hold(0.5, { bank: 1, nose: 120, kmh: 14, off: true }),
          hold(3, { bank: 1, nose: noseOnTheVerge, kmh: 14, off: true, solid: false }),
          // The turn-round on the verge, over the dashes; back on, and away the original way.
          hold(1, { bank: 1, nose: 100, kmh: 8, off: true, solid: false }),
          hold(0.5, { bank: 1, nose: 60, kmh: 8, solid: false, clear: 2 }),
          hold(3, { bank: 1, nose: 0, kmh: 25, solid: false }),
        ]),
        ARMED,
      );
    const lawful = southboundThenVerge(175);
    // (the first turn was over the dashes and billed nothing: the one bill is the crossing back over the solid axis)
    expect(lawful.crossings).toHaveLength(1);
    expect(named(lawful)).toEqual([]);
    const held = southboundThenVerge(120);
    expect(named(held)).toEqual([[held.crossings[0].t, UTURN]]);
  });

  it("R5-3 — off the carriageway the BANK SIDE holds: the reference bank, the crossing, its clocks and its bill are identical across frames past the kerb and frames with no fix — only the heading half moves; and a turn-round is confirmed out there only where the road still has a fix", () => {
    const tracker = (st: RuleEngineState) => (st as unknown as { solidCrossTurn: Record<string, unknown> }).solidCrossTurn;
    const bankSide = (st: RuleEngineState) => {
      const t = tracker(st);
      return { edgeId: t.edgeId, bank: t.bank, prevBank: t.prevBank, crossedSolidAt: t.crossedSolidAt, crossLate: t.crossLate, farSince: t.farSince, reversedSince: t.reversedSince, billedAt: t.billedAt, billLive: t.billLive, named: t.named };
    };
    for (const out of [{ off: true }, { noFix: true }, { off: true, edge: "e-other", bearing: 90 }] as Array<Partial<F>>) {
      // 100° round out there for 2 s: still turning, nothing to confirm.
      const ticks = play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(1, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
        turn({ fromDeg: 6, toDeg: 60, crossAtDeg: 0, over: { clear: 2 } }),
        hold(2, { bank: -1, nose: -100, kmh: 14, ...out }),
      ]);
      const r = run(ticks, ARMED);
      const lastMeasured = r.frames[ticks.length - 2 * HZ - 1].state;
      expect(tracker(lastMeasured).crossedSolidAt).not.toBeNull();
      expect(tracker(lastMeasured).billedAt).not.toBeNull();
      for (const f of r.frames.slice(ticks.length - 2 * HZ)) expect(bankSide(f.state)).toEqual(bankSide(lastMeasured));
      expect(r.crossings).toHaveLength(1);
      expect(r.amendments).toEqual([]);
      // 160° round out there for 2 s: confirmed where the road has a fix on him (past the kerb), and not where it has none.
      const round = run(
        play([
          STRAIGHT,
          hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
          hold(1, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
          turn({ fromDeg: 6, toDeg: 60, crossAtDeg: 0, over: { clear: 2 } }),
          hold(2, { bank: -1, nose: -160, kmh: 14, ...out }),
        ]),
        ARMED,
      );
      expect(round.crossings).toHaveLength(1);
      expect(round.amendments.map((a) => a.detail)).toEqual(out.noFix === true || out.edge !== undefined ? [] : [UTURN]);
      // On his own side — never across — the same frames leave the bank side untouched altogether.
      const home = run(play([STRAIGHT, hold(2, { bank: 1, nose: -120, kmh: 14, ...out })]), ARMED);
      const before = bankSide(home.frames[2 * HZ - 1].state);
      expect(before.bank).toBe(1);
      for (const f of home.frames.slice(2 * HZ)) expect(bankSide(f.state)).toEqual(before);
    }
  });

  it("R4-1 — a lawful reversal still ENDS the manoeuvre: the far bank is the new reference, the old excursion's bill is closed, and what follows is judged afresh — a drift back over the solid axis is a new crossing, never named", () => {
    const south = (bank: 1 | -1, off: number, over: Partial<F> = {}): F => ({ bank, nose: 180 - off, kmh: 35, ...over });
    const r = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: -0.4 }),
        turn({ fromDeg: 6, toDeg: 180, crossAtDeg: 0, over: { clear: -0.4, solid: false } }),
        // Southbound on the far half, never in lane (4 m off its centre) —
        hold(2, south(-1, 0, { laneOffsetM: 4 })),
        // — then a 15° drift back over the axis, solid here, and home.
        hold(1, south(-1, 15, { laneOffsetM: 4 })),
        hold(2, south(1, 15)),
        hold(1, south(1, -15)),
        hold(3, south(-1, 0)),
      ]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(2);
    expect(r.crossings[1].t - r.crossings[0].t).toBeGreaterThan(10);
    expect(r.amendments).toEqual([]);
  });

  // --- ROUND 4: the round-3 verifier's surviving mutants (X3) ------------------------

  it("X3/v4 — a crossing over the DASHES forgets an earlier solid crossing that had come home: crossed solid and back, then over the dashes at a crawl, on into the span on the far half, and round there → no second bill and no name (the centre never crossed the solid axis on THIS excursion)", () => {
    const r = run(
      play([
        STRAIGHT,
        ...drift(),
        // Over the dashes at 4 км/ч (under the plain detector's moving floor),
        // creeping on up the far half to where the axis is solid, and round.
        hold(1, { bank: 1, nose: -15, kmh: 4, solid: false }),
        hold(2, { bank: -1, nose: -15, kmh: 4, solid: false, clear: -0.4 }),
        hold(3, { bank: -1, nose: 0, kmh: 4, clear: -0.4 }),
        turn({ toDeg: 180, crossAtDeg: 0, over: { kmh: 4, clear: -0.4 } }),
        hold(3, { bank: -1, nose: 180, kmh: 4 }),
      ]),
      ARMED,
    );
    // The drift's bill, and nothing else — the turn made over the solid axis
    // belongs to a crossing that was made over the dashes.
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0].t).toBeLessThan(2 + 4);
    expect(r.amendments).toEqual([]);
    const st = (r.state as unknown as { solidCrossTurn: { bank: number; crossedSolidAt: number | null } }).solidCrossTurn;
    expect([st.bank, st.crossedSolidAt]).toEqual([-1, null]);
  });

  it("X3/v7 — the reversal's sustain is UNBROKEN time: 0.4 s with the far bank, out of the band, 0.4 s with it again is 0.8 s in all and not a reversal; the same two spells joined are", () => {
    const wobble = (gapSec: number) =>
      run(
        play([
          STRAIGHT,
          turn({ toDeg: 120, crossAtDeg: 60 }),
          hold(0.4, { bank: -1, nose: -140, kmh: 9 }),
          ...(gapSec > 0 ? [hold(gapSec, { bank: -1, nose: -120, kmh: 9 })] : []),
          hold(0.4, { bank: -1, nose: -140, kmh: 9 }),
          hold(6, { bank: -1, nose: -120, kmh: 0 }),
        ]),
        ARMED,
      );
    expect(wobble(0.3).crossings).toHaveLength(1);
    expect(wobble(0.3).amendments).toEqual([]);
    expect(wobble(0).amendments.map((a) => a.detail)).toEqual([UTURN]);
  });

  it("X3/v8 — a completed reversal CLOSES the excursion's bill even if the car never settles in a lane: a U-turn, and straight away a second one back across — never «in lane» between them — are two acts, two bills, each named for itself", () => {
    // 4 m off the lane's centre on every frame of the drive: the plain
    // detector's «back in lane» never holds, so only the reversal itself can
    // close the first bill.
    const far = { laneOffsetM: 4 };
    const back = {
      sec: 180 / 15,
      at: (u: number): F => {
        const round = 180 * u;
        return { bank: round >= 60 ? 1 : -1, nose: -(180 + round), ...far };
      },
    };
    const r = run(
      play([hold(2, { bank: 1, nose: 0, ...far }), turn({ toDeg: 180, crossAtDeg: 60, over: far }), back, hold(3, { bank: 1, nose: 0, kmh: 25, ...far })]),
      ARMED,
    );
    expect(r.crossings).toHaveLength(2);
    expect(r.amendments.map((a) => [a.billT, a.detail])).toEqual([
      [r.crossings[0].t, UTURN],
      [r.crossings[1].t, UTURN],
    ]);
  });

  // --- W2: nothing bills a crossing the centre has not made ---------------------
  const swingOnOwnHalf = (over: Partial<F> = {}) => [
    STRAIGHT,
    // Round to 110° on his OWN bank, moving, the axis solid: «the nose opposes
    // its bank» holds from 90° on, for seconds.
    turn({ toDeg: 110, crossAtDeg: 999, over }),
    hold(3, { bank: 1, nose: -110, kmh: 9, ...over }),
  ];

  it("W2 — the nose past 90° on the car's OWN bank is not a crossing: nothing is billed while armed (the shipped detector bills it)", () => {
    const ticks = play([...swingOnOwnHalf(), hold(2, { bank: 1, nose: 0, kmh: 9 })]);
    expect(ticks.filter((k) => k.opposingBank === true && k.solidCenterLine === true).length).toBeGreaterThan(60);
    expect(run(ticks).crossings).toHaveLength(1);
    const r = run(ticks, ARMED);
    expect(r.crossings).toEqual([]);
    expect(r.amendments).toEqual([]);
  });

  it("W2 — …not even if he then drives on against his own lane for 10 s: he has crossed nothing (RECORDED, owed to the founder: no other detector bills a turn-round made wholly on the own half either)", () => {
    const r = run(play([...swingOnOwnHalf(), hold(10, { bank: 1, nose: 180, kmh: 20 })]), ARMED);
    expect(r.crossings).toEqual([]);
  });

  it("W2 — frames the tracker cannot measure HOLD the last measured bank: past the kerb with the nose opposing «its bank» is still not a crossing", () => {
    // The centre does not pass the axis from a verge: 3 s past the kerb, nose
    // still opposing, are frames the tracker does not step on — and the bank it
    // last measured stands.
    const ticks = play([...swingOnOwnHalf(), hold(3, { bank: 1, nose: -110, kmh: 9, off: true })]);
    expect(ticks.slice(-60).every((k) => k.opposingBank === true && k.edgeAlignment!.offCarriageway)).toBe(true);
    expect(run(ticks, ARMED).crossings).toEqual([]);
  });

  it("R6-1 — THE ROAD SEES THE CAR FOR THE FIRST TIME on a half its nose opposes: the armed lesson bills NOTHING — the half the centre is on is the reference, and it has crossed nothing anybody saw (round 3 let the shipped detector convict it; the shipped detector, unarmed, still does)", () => {
    // From the first frame: on a bank its nose opposes, moving, the axis solid.
    const ticks = play([hold(3, { bank: -1, nose: 0, kmh: 20, clear: 2 })]);
    expect(run(ticks).crossings).toHaveLength(1);
    const r = run(ticks, ARMED);
    expect(r.crossings).toEqual([]);
    // …and when its centre then does go over the solid axis, THAT is billed — into the half that runs its own way.
    const then = run(play([hold(3, { bank: -1, nose: 0, kmh: 20, clear: 2 }), hold(3, { bank: 1, nose: 0, kmh: 20, clear: 2 })]), ARMED);
    expect(then.crossings.map((c) => [c.detail, Math.abs(c.t - 3.6) < 0.06])).toEqual([[OWN_WAY, true]]);
  });

  it("W2 — …and that holds past the kerb too: unmeasured frames with no reference behind them stand nothing down", () => {
    const ticks = play([hold(3, { bank: -1, nose: 0, kmh: 20, off: true })]);
    expect(run(ticks).crossings).toHaveLength(1);
    expect(run(ticks, ARMED).crossings.map((c) => c.t)).toEqual(run(ticks).crossings.map((c) => c.t));
  });

  it("R6-1 — W2 HOLDS ACROSS THE ROAD'S EDGES, AND ON A ROAD SEEN FOR THE FIRST TIME: on the same half of the road's next edge with the nose against it (he turned round out of the fixture's sight) the armed lesson bills nothing; and on ANOTHER road, first seen on a half its nose opposes, nothing either (round 5 began a fresh tracker with no reference on each, and the shipped detector billed on its usual frame)", () => {
    const sameRoad = play([STRAIGHT, hold(3, { bank: 1, nose: 180, kmh: 20, edge: "e-other" })]);
    expect(run(sameRoad).crossings).toHaveLength(1);
    expect(run(sameRoad, ARMED).crossings).toEqual([]);
    const otherRoad = play([STRAIGHT, hold(3, { bank: 1, nose: -90, kmh: 20, edge: "e-side", bearing: 90 })]);
    expect(otherRoad.slice(-20).every((k) => k.opposingBank === true)).toBe(true);
    expect(run(otherRoad).crossings).toHaveLength(1);
    expect(run(otherRoad, ARMED).crossings).toEqual([]);
  });

  it("W2 — and once the centre IS across, the bill is the same one, on the same frame, as the shipped detector's", () => {
    const ticks = play([STRAIGHT, ...drift({ clear: 1 })]);
    const armed = run(ticks, ARMED);
    expect(armed.crossings).toEqual(run(ticks).crossings);
    expect(armed.crossings).toHaveLength(1);
  });

  // --- W3: the reason says what was measured ------------------------------------
  it("W3 — the bill's reason follows the BODY on the bill frame: astride → the act `astride`; wholly across (0 m clear counts) → the pooled row; not measured → the pooled row", () => {
    const billOf = (clear: number | undefined) => {
      const r = run(play([STRAIGHT, ...drift(clear !== undefined ? { clear } : {})]), ARMED);
      expect(r.crossings).toHaveLength(1);
      return r.crossings[0];
    };
    const astride = billOf(-0.2);
    expect(astride).toEqual(rules.makeViolation("CROSSED_SOLID_LINE", astride.t, { detail: ASTRIDE }));
    expect(astride.explanationBg).not.toMatch(/изцяло/u);
    for (const clear of [0, 0.7, undefined]) {
      const bill = billOf(clear);
      expect(bill, String(clear)).toEqual(rules.makeViolation("CROSSED_SOLID_LINE", bill.t));
      expect(bill.explanationBg).toMatch(/^Пресече изцяло/u);
    }
    // Same frame, same class, same points, whichever reason.
    expect([astride.t, astride.severityClass, astride.points]).toEqual([billOf(0.7).t, "osnovna", 3]);
  });

  it("W3 — the PLAIN detector's own bill chooses its reason the same way (out over the DASHES and on into the span on the oncoming half — no solid crossing, so the position bill is not in play)", () => {
    const at = (clear: number) =>
      run(
        play([STRAIGHT, hold(0.5, { bank: 1, nose: 0, kmh: 20, solid: false }), hold(0.5, { bank: -1, nose: 0, kmh: 20, clear, solid: false }), hold(3, { bank: -1, nose: 0, kmh: 20, clear })]),
        ARMED,
      ).crossings.map((c) => c.detail);
    expect(at(-0.3)).toEqual([ASTRIDE]);
    expect(at(0.3)).toEqual([undefined]);
  });

  it("W3 — the position bill (the plain detector blind: 95° round at the axis) chooses its reason the same way", () => {
    const at = (clear: number) =>
      run(play([STRAIGHT, turn({ toDeg: 120, crossAtDeg: 95, over: { clear } }), hold(8, { bank: -1, nose: -120, kmh: 0, clear })]), ARMED);
    expect(at(-1.4).crossings.map((c) => c.detail)).toEqual([ASTRIDE]);
    expect(at(0.2).crossings.map((c) => c.detail)).toEqual([undefined]);
  });

  it("W3 — a bill that went out on the straddle's reason is still NAMED when the turn completes: the amendment is addressed to it like any other", () => {
    const ticks = play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 60, over: { clear: -1 } }), AWAY]);
    const r = run(ticks, ARMED);
    expect(r.crossings.map((c) => c.detail)).toEqual([ASTRIDE]);
    expect(r.amendments.map((a) => [a.billT, a.detail])).toEqual([[r.crossings[0].t, UTURN]]);
    const named = rules.applyActAmendments(r.crossings, r.amendments as Parameters<typeof rules.applyActAmendments>[1]);
    expect(named).toEqual([rules.makeViolation("CROSSED_SOLID_LINE", r.crossings[0].t, { detail: UTURN })]);
  });
});

describe("§1f (round 5) ONE DEFINITION OF THE ACT — a turn-round is an event of the heading against the road; it names a crossing made before or during it, begun where the axis is solid, and nothing else", () => {
  const named = (r: Run) => r.amendments.map((a) => [a.billT, a.detail]);
  /** A turn to the RIGHT from the far half: the nose from 6° left to `toDeg` right-about, the centre back on its own bank from `homeAtDeg` round. */
  const rightRound = (o: { homeAtDeg: number; over?: Partial<F>; rate?: number }) => ({
    sec: 186 / (o.rate ?? 15),
    at: (u: number): F => {
      const round = 186 * u;
      return { bank: round >= o.homeAtDeg ? 1 : -1, nose: -6 + round, ...o.over };
    },
  });

  it("Y1 — turned round on his OWN half where the axis is dashed, back down it the wrong way, and only then over the solid axis: the crossing is billed as the CROSSING, on the reason the body earned; nothing is named (round 4: «already travelling with the far bank» on the crossing frame → the U-turn)", () => {
    const y1 = (turnOver: Partial<F>) =>
      run(
        play([
          STRAIGHT,
          turn({ toDeg: 180, crossAtDeg: 999, over: turnOver }),
          hold(3, { bank: 1, nose: 180, kmh: 25, ...turnOver }),
          hold(1, { bank: 1, nose: -170, kmh: 25 }),
          hold(3, { bank: -1, nose: -170, kmh: 25, clear: -0.3 }),
          hold(2, { bank: -1, nose: 180, kmh: 25, clear: 2 }),
        ]),
        ARMED,
      );
    const atTheGap = y1({ solid: false });
    // (Round 6, R6-3: he is travelling the other way by then and enters the half that runs his way — the reason does not say «насрещната».)
    expect(atTheGap.crossings.map((c) => [c.detail, c.titleBg])).toEqual([[ASTRIDE_OWN_WAY, POOLED_TITLE]]);
    expect(atTheGap.crossings[0].explanationBg).not.toContain("насрещната половина");
    expect(atTheGap.amendments).toEqual([]);
    expect(atTheGap.sawAmendmentsField).toBe(false);
    // The bill is the position bill, 0.6 s after the centre is over (the plain detector is blind: his nose is WITH that bank).
    const crossedAt = 2 + 12 + 3 + 1;
    expect(Math.abs(atTheGap.crossings[0].t - (crossedAt + 0.6))).toBeLessThan(0.06);
    // R5-2 (ii) does not ask where the turn-round was made: inside the span it is the same crossing.
    const insideTheSpan = y1({});
    expect(insideTheSpan.crossings.map((c) => [c.detail, c.titleBg])).toEqual([[ASTRIDE_OWN_WAY, POOLED_TITLE]]);
    expect(insideTheSpan.amendments).toEqual([]);
    // …and nothing at all is billed while he turns round on his own half, or drives back down it.
    expect(insideTheSpan.crossings[0].t).toBeGreaterThan(crossedAt);
  });

  it("R5-1 — the turn-round COMPLETES when its swing ends: the centre going over 150° round, the nose still swinging, is DURING it → the bill is the U-turn's own; after the lock comes off, 1.5 m straight on and over is still that swing (under 2 m) → the U-turn; 2.5 m → a crossing; and steering BACK the other way ends the swing at once → a crossing", () => {
    // 150° round at the axis: 0.6 s later the bill goes out, already named.
    const during = run(play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 150 }), AWAY]), ARMED);
    expect(during.crossings.map((c) => c.detail)).toEqual([UTURN]);
    expect(during.amendments).toEqual([]);
    expect(Math.abs(during.crossings[0].t - (2 + 10 + 0.6))).toBeLessThan(0.06);
    // Round to 170° on his own half, then straight on at 9 км/ч (2.5 m/s) and over the solid axis.
    const runOut = (sec: number) =>
      run(
        play([
          STRAIGHT,
          turn({ toDeg: 170, crossAtDeg: 999 }),
          hold(sec, { bank: 1, nose: -170 }),
          hold(3, { bank: -1, nose: -170, clear: -0.2 }),
          AWAY,
        ]),
        ARMED,
      );
    expect(runOut(0.6).crossings.map((c) => c.detail)).toEqual([UTURN]);
    expect(runOut(1.0).crossings.map((c) => c.detail)).toEqual([ASTRIDE_OWN_WAY]);
    expect(runOut(1.0).amendments).toEqual([]);
    // Round to 180°, then the nose 10° back the other way at once, and over.
    const steeredBack = run(
      play([
        STRAIGHT,
        turn({ toDeg: 180, crossAtDeg: 999 }),
        hold(0.2, { bank: 1, nose: -170 }),
        hold(3, { bank: -1, nose: -170, clear: -0.2 }),
        AWAY,
      ]),
      ARMED,
    );
    expect(steeredBack.crossings.map((c) => c.detail)).toEqual([ASTRIDE_OWN_WAY]);
    expect(steeredBack.amendments).toEqual([]);
  });

  it("R5-2 (ii) inside the sustain — the nose 140° round on his own half, steered BACK at once (the swing is over) and the centre over the solid axis 0.45 s after the nose came within 45° of the other way, before the 0.6 s are up: the turn-round is confirmed AFTER that crossing, and still does not name it — the crossing was made after its swing had ended", () => {
    const r = run(
      play([
        STRAIGHT,
        turn({ toDeg: 140, crossAtDeg: 999 }),
        hold(0.1, { bank: 1, nose: -137 }),
        hold(3, { bank: -1, nose: -137, clear: -0.2 }),
        AWAY,
      ]),
      ARMED,
    );
    // The crossing is 0.43 s after the nose was 135° round (2 + 9 s), i.e. before the turn-round was confirmed.
    // (R6-3: by the bill, 0.6 s after the crossing, it IS confirmed — he travels the other way and the half runs his way.)
    expect(r.crossings.map((c) => c.detail)).toEqual([ASTRIDE_OWN_WAY]);
    expect(Math.abs(r.crossings[0].t - (2 + 140 / 15 + 0.1 + 0.6))).toBeLessThan(0.06);
    expect(r.crossings[0].t - 0.6).toBeLessThan(2 + 9 + 0.6);
    expect(r.amendments).toEqual([]);
    // The control: the same crossing with the nose still swinging round (no steering back) IS made during the turn-round.
    const stillSwinging = run(play([STRAIGHT, turn({ toDeg: 180, crossAtDeg: 141.5 }), AWAY]), ARMED);
    expect(stillSwinging.crossings.map((c) => c.detail)).toEqual([UTURN]);
  });

  it("the PLAIN detector's own bill is the U-turn's where a turn-round already names the crossing: turned round on his own half, then a second turn-round whose centre goes over the solid axis 150° round — the nose by then opposes the bank it arrives on, which is what that detector fires on, 0.6 s later and first", () => {
    const secondRound = {
      sec: 180 / 15,
      at: (u: number): F => {
        const round = 180 * u;
        return { bank: round >= 150 ? -1 : 1, nose: 180 + round, clear: -0.3 };
      },
    };
    const ticks = play([
      STRAIGHT,
      turn({ toDeg: 180, crossAtDeg: 999 }),
      hold(2, { bank: 1, nose: 180, kmh: 25 }),
      secondRound,
      hold(3, { bank: -1, nose: 0, kmh: 25, clear: 2 }),
    ]);
    // On the frames after the crossing the shipped detector's own condition holds (the nose opposes its bank).
    const crossedAt = 2 + 12 + 2 + 10;
    expect(ticks.filter((k) => k.t >= crossedAt && k.t < crossedAt + 0.6).every((k) => k.opposingBank === true)).toBe(true);
    const r = run(ticks, ARMED);
    // (Round 6, R6-2: he then runs on the original way down the half that runs the other way — once the
    // U-turn's swing has ended that is a NEW crossing, billed once, on the pooled reason: «насрещната» is true.)
    expect(r.crossings.map((c) => c.detail)).toEqual([UTURN, undefined]);
    expect(Math.abs(r.crossings[0].t - (crossedAt + 0.6))).toBeLessThan(0.06);
    expect(r.crossings[1].t).toBeGreaterThan(crossedAt + 2 + 0.6);
    expect(r.amendments).toEqual([]);
  });

  it("R5-1 — a standing car is still mid-swing: 170° round on his own half, a 30 s stop, and on round and over the solid axis → the U-turn (no metres pass while he stands)", () => {
    const r = run(
      play([
        STRAIGHT,
        turn({ toDeg: 170, crossAtDeg: 999 }),
        hold(30, { bank: 1, nose: -170, kmh: 0 }),
        turn({ fromDeg: 170, toDeg: 180, crossAtDeg: 172 }),
        AWAY,
      ]),
      ARMED,
    );
    expect(r.crossings.map((c) => c.detail)).toEqual([UTURN]);
  });

  it("Q6 — NOTHING EARLIER IS RENAMED: a pull-out billed inside the span, held to the dashes, a RIGHT-hand round there onto his own half, back the wrong way and over the solid axis → the first row stays exactly as it went out and the later crossing is a SECOND bill, the crossing's (round 4 renamed the first, 35 s after it was shown)", () => {
    const r = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
        hold(0.5, { bank: -1, nose: -6, kmh: 30, clear: 2, solid: false }),
        rightRound({ homeAtDeg: 100, over: { solid: false } }),
        hold(3, { bank: 1, nose: 180, kmh: 25, solid: false }),
        hold(1, { bank: 1, nose: -170, kmh: 25 }),
        hold(3, { bank: -1, nose: -170, kmh: 25, clear: 2 }),
      ]),
      ARMED,
    );
    // (R6-3: the first was a pull-out into the oncoming half — «насрещната», as shipped; the second is made
    // travelling the other way, into the half that runs his way — the reason without that clause.)
    expect(r.crossings.map((c) => [c.detail, c.titleBg])).toEqual([
      [undefined, POOLED_TITLE],
      [OWN_WAY, POOLED_TITLE],
    ]);
    expect(r.crossings[0].explanationBg).toContain("в насрещната половина на платното");
    expect(r.crossings[1].explanationBg).not.toContain("насрещната половина");
    expect(r.crossings[1].t - r.crossings[0].t).toBeGreaterThan(15);
    expect(r.amendments).toEqual([]);
    expect(r.sawAmendmentsField).toBe(false);
  });

  it("Y4 — pulled out, then a round to the RIGHT back over the solid axis that ENDS ON HIS OWN HALF: the pull-out's bill is named the U-turn when the turn-round is confirmed — on his own bank (rounds 2–4 asked for the far one, and kept the overtaking advice)", () => {
    const r = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
        rightRound({ homeAtDeg: 80 }),
        hold(3, { bank: 1, nose: 180, kmh: 25 }),
      ]),
      ARMED,
    );
    expect(named(r)).toEqual([[r.crossings[0].t, UTURN]]);
    // Named 0.6 s after the nose is 135° round — with the centre back on the bank he set out on.
    const namedAt = r.amendments[0].t;
    expect(Math.abs(namedAt - (2 + 0.5 + 2 + (135 + 6) / 15 + 0.6))).toBeLessThan(0.11);
    // ROUND 6, R6-2 — and he then drives on down that bank against its traffic. Once the U-turn's swing has ended
    // (2 m after the round: 0.3 s at 25 км/ч) home is the half of his NEW direction, and the centre is across the
    // solid axis from it: a new crossing, billed 0.6 s later, once.
    const roundEnds = 2 + 0.5 + 2 + 186 / 15;
    expect(r.crossings.map((c) => c.detail)).toEqual([undefined, undefined]);
    expect(r.crossings[1].t).toBeGreaterThan(roundEnds + 0.6);
    expect(r.crossings[1].t).toBeLessThan(roundEnds + 1.2);
    expect(r.amendments).toHaveLength(1);
    // ONE ACT, ONE BILL: a round that brings the centre back over the axis only at its very end (165° round —
    // after it was confirmed and had named the pull-out's bill) has crossed twice and turned round ONCE.
    const backAtTheEnd = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
        rightRound({ homeAtDeg: 165 }),
        hold(3, { bank: 1, nose: 180, kmh: 25, clear: -0.5 }),
      ]),
      ARMED,
    );
    // …the second crossing, on the same swing, is not billed; the run that follows it on the half against his new
    // direction is (R6-2) — astride, and «насрещната» is true of it.
    expect(named(backAtTheEnd)).toEqual([[backAtTheEnd.crossings[0].t, UTURN]]);
    expect(backAtTheEnd.crossings.map((c) => c.detail)).toEqual([undefined, ASTRIDE]);
    expect(backAtTheEnd.crossings[1].t).toBeGreaterThan(roundEnds + 0.6);
    expect(backAtTheEnd.amendments).toHaveLength(1);
    // The same round begun where the axis is dashed names nothing.
    const overDashes = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
        hold(0.5, { bank: -1, nose: -6, kmh: 30, clear: 2, solid: false }),
        rightRound({ homeAtDeg: 80, over: { solid: false } }),
        hold(3, { bank: 1, nose: 180, kmh: 25, solid: false }),
      ]),
      ARMED,
    );
    expect(overDashes.crossings).toHaveLength(1);
    expect(named(overDashes)).toEqual([]);
  });

  it("R5-2 (ii) — «not back to the bank and direction it came from»: ASTRIDE, a right-hand round whose centre is back on his own bank only 20° round — still the swing that began astride → the straddle's bill is named; but astride, HOME (along the road on his own bank, out of lane so the bill still stands), and then a turn-round on his own half → that crossing was over: nothing is named", () => {
    const stillTheSwing = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: -0.4 }),
        rightRound({ homeAtDeg: 20, over: { laneOffsetM: 4 } }),
        hold(3, { bank: 1, nose: 180, kmh: 25 }),
      ]),
      ARMED,
    );
    // (R6-2: …and the run that follows on that bank, against its traffic, is the new crossing's bill.)
    expect(stillTheSwing.crossings.map((c) => c.detail)).toEqual([ASTRIDE, undefined]);
    expect(named(stillTheSwing)).toEqual([[stillTheSwing.crossings[0].t, UTURN]]);
    const homeFirst = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: -0.4 }),
        hold(0.5, { bank: -1, nose: 6, kmh: 30, clear: -0.4 }),
        hold(2, { bank: 1, nose: 0, kmh: 30, laneOffsetM: 4 }),
        turn({ toDeg: 180, crossAtDeg: 999, over: { laneOffsetM: 4 } }),
        hold(3, { bank: 1, nose: 180, kmh: 25, laneOffsetM: 4 }),
      ]),
      ARMED,
    );
    expect(homeFirst.crossings.map((c) => c.detail)).toEqual([ASTRIDE]);
    expect(homeFirst.amendments).toEqual([]);
  });

  it("ONE ACT, ONE BILL — and a bill is named only by the turn-round of ITS crossing: a straddle that came home OUT OF LANE (its bill still silences another), then a U-turn across the solid axis → the straddle's row is not renamed, and the U-turn is a bill of its own", () => {
    const r = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: -0.4 }),
        hold(0.5, { bank: -1, nose: 6, kmh: 30, clear: -0.4 }),
        hold(2, { bank: 1, nose: 0, kmh: 30, laneOffsetM: 4 }),
        turn({ toDeg: 180, crossAtDeg: 60, over: { laneOffsetM: 4 } }),
        AWAY,
      ]),
      ARMED,
    );
    expect(r.crossings.map((c) => c.detail)).toEqual([ASTRIDE, UTURN]);
    expect(r.amendments).toEqual([]);
    // The control: a wobble home off-lane and over again with NO turn-round is still one excursion, one bill.
    const wobble = run(
      play([
        STRAIGHT,
        hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
        hold(2, { bank: -1, nose: -6, kmh: 30, clear: -0.4 }),
        hold(0.5, { bank: -1, nose: 6, kmh: 30, clear: -0.4 }),
        hold(2, { bank: 1, nose: 0, kmh: 30, laneOffsetM: 4 }),
        hold(0.5, { bank: 1, nose: -6, kmh: 30, laneOffsetM: 4 }),
        hold(3, { bank: -1, nose: -6, kmh: 30, clear: -0.4 }),
      ]),
      ARMED,
    );
    expect(wobble.crossings).toHaveLength(1);
  });

  it("R5-2 (i) asks WHERE the centre crossed, not which way: out over the DASHES before the span, up the oncoming half into it (billed there by the plain detector, as on every lesson), and a round to the right BACK over the SOLID axis → that bill is named the U-turn; the same way back made along the road (no turn-round) names nothing; and a turn-round over there that never comes back over the axis has crossed no solid axis and names nothing", () => {
    const outOverDashes = [
      STRAIGHT,
      hold(0.5, { bank: 1, nose: -6, kmh: 30, solid: false }),
      hold(1, { bank: -1, nose: -6, kmh: 30, clear: 2, solid: false }),
      // into the span, wholly on the oncoming half: the shipped detector's own bill
      hold(2, { bank: -1, nose: 0, kmh: 30, clear: 2 }),
    ];
    const roundBack = run(play([...outOverDashes, rightRound({ homeAtDeg: 80 }), hold(3, { bank: 1, nose: 180, kmh: 25 })]), ARMED);
    // (R6-2: one row for the U-turn, and one for the run that follows on the half against his new direction.)
    expect(roundBack.crossings.map((c) => c.detail)).toEqual([undefined, undefined]);
    expect(named(roundBack)).toEqual([[roundBack.crossings[0].t, UTURN]]);
    const homeAlong = run(
      play([...outOverDashes, hold(0.5, { bank: -1, nose: 6, kmh: 30, clear: 2 }), hold(3, { bank: 1, nose: 0, kmh: 30 }), ...drift()]),
      ARMED,
    );
    expect(homeAlong.crossings.map((c) => c.detail ?? "pooled")).not.toContain(UTURN);
    expect(homeAlong.amendments).toEqual([]);
    const roundOverThere = run(play([...outOverDashes, turn({ toDeg: 180, crossAtDeg: 0, over: { clear: 2 } }), AWAY]), ARMED);
    expect(roundOverThere.crossings).toHaveLength(1);
    expect(roundOverThere.amendments).toEqual([]);
  });

  it("the travel direction has a 90° dead band and the sustain: 100° round for 5 s and back is no turn-round (the excursion is forgotten: a later drift is a drift); 136° round for 0.4 s and back out is none either", () => {
    const square = run(
      play([
        STRAIGHT,
        turn({ toDeg: 100, crossAtDeg: 999 }),
        hold(5, { bank: 1, nose: -100, kmh: 0 }),
        turn({ fromDeg: 100, toDeg: 200, crossAtDeg: 999, each: (round) => ({ nose: -(200 - round) }) }),
        ...drift(),
      ]),
      ARMED,
    );
    expect(square.crossings).toHaveLength(1);
    expect(square.amendments).toEqual([]);
    const tracker = (st: RuleEngineState) => (st as unknown as { solidCrossTurn: { dir: number } }).solidCrossTurn;
    expect(tracker(square.state).dir).toBe(1);
    const brief = run(
      play([
        STRAIGHT,
        turn({ toDeg: 136, crossAtDeg: 999 }),
        hold(0.4, { bank: 1, nose: -136, kmh: 0 }),
        hold(2, { bank: 1, nose: -90, kmh: 0 }),
        hold(2, { bank: 1, nose: 0, kmh: 20 }),
      ]),
      ARMED,
    );
    expect(tracker(brief.state).dir).toBe(1);
    expect(brief.crossings).toEqual([]);
  });
});

describe("§1g (round 6) THE CLOSING ROUND at the rule layer — what the fuzz and the round-5 verifier's surviving mutants asked for", () => {
  const named = (r: Run) => r.amendments.map((a) => [a.billT, a.detail]);
  /** A stretch at 15 °/s to the LEFT from `from`° round to `to`° round; `at(round)` gives the rest of the frame. */
  const round = (from: number, to: number, at: (roundDeg: number) => Omit<F, "nose">) => ({
    sec: Math.abs(to - from) / 15,
    at: (u: number): F => {
      const r = from + (to - from) * u;
      return { nose: -r, ...at(r) };
    },
  });
  /** Out over the DASHES onto the far bank and on into the span on it: the shipped detector's own bill (the recorded class X4). */
  const OUT_OVER_THE_DASHES = [
    STRAIGHT,
    hold(0.5, { bank: 1, nose: 0, kmh: 20, solid: false }),
    hold(0.5, { bank: -1, nose: 0, kmh: 20, clear: 2, solid: false }),
    hold(2, { bank: -1, nose: 0, kmh: 20, clear: 2 }),
  ];

  it("R5-2 (ii) ON THE WAY BACK (the round-5 verifier's mutant m2) — out over the dashes and into the span (billed), a turn-round over there to 140°, steered BACK at once (the swing is over), and the centre back over the SOLID axis 0.43 s after the nose came round, before the turn-round is confirmed → that crossing was made after the swing ended: the bill is NOT named", () => {
    const r = run(
      play([
        ...OUT_OVER_THE_DASHES,
        turn({ toDeg: 140, crossAtDeg: 0, over: { clear: 2 } }),
        hold(0.1, { bank: -1, nose: -137, clear: 2 }),
        hold(3, { bank: 1, nose: -137 }),
      ]),
      ARMED,
    );
    expect(r.crossings.map((c) => c.detail)).toEqual([undefined]);
    expect(r.amendments).toEqual([]);
    // The control: the same way back made while the nose is still swinging round IS the U-turn (decision 5).
    const during = run(play([...OUT_OVER_THE_DASHES, round(0, 140, () => ({ bank: -1, clear: 2 })), round(140, 180, () => ({ bank: 1 })), hold(0.3, { bank: 1, nose: 180 })]), ARMED);
    expect(named(during)).toEqual([[during.crossings[0].t, UTURN]]);
  });

  describe("THE WAY BACK OVER THE SOLID AXIS IN THE TAIL of a turn-round already confirmed (fuzz 607#230, 605#132): a U-turn begun just before the solid line ends is confirmed out over the dashes and over-rotates back over the solid axis on the same swing", () => {
    /** First seen on bank −1 heading the road's way (its reference half); a turn-round there to 150° — confirmed 144° round — begun where the axis is `beginSolid`. */
    const turnedRoundThere = (beginSolid: boolean) => [
      hold(2, { bank: -1, nose: 0, clear: 2 }),
      round(0, 150, (r) => ({ bank: -1, clear: 2, solid: r < 3 ? beginSolid : true })),
    ];
    const outAndBack = (beginSolid: boolean, outSec: number, inTheSpanSec: number) =>
      run(
        play([
          ...turnedRoundThere(beginSolid),
          // out to bank +1 where the axis is DASHED, the nose still swinging round…
          round(150, 150 + outSec * 15, () => ({ bank: 1, clear: -0.3, solid: false })),
          // …into the span on it (the nose opposes that bank: the shipped detector's condition)…
          round(150 + outSec * 15, 150 + (outSec + inTheSpanSec) * 15, () => ({ bank: 1, clear: -0.3 })),
          // …and back over the SOLID axis, the same swing.
          round(150 + (outSec + inTheSpanSec) * 15, 180, () => ({ bank: -1 })),
          hold(3, { bank: -1, nose: 180, kmh: 25, clear: 2 }),
        ]),
        ARMED,
      );
    it("with the span's bill already out → that bill is NAMED on the frame the centre comes back; nothing else is billed (round 5: it stayed a crossing «…изцяло» and the U-turn R5-2 sees was on no row)", () => {
      const r = outAndBack(true, 0.4, 0.8);
      expect(r.crossings.map((c) => c.detail)).toEqual([ASTRIDE]);
      const backAt = 2 + 10 + 0.4 + 0.8;
      expect(named(r)).toEqual([[r.crossings[0].t, UTURN]]);
      expect(Math.abs(r.amendments[0].t - backAt)).toBeLessThan(0.06);
    });
    it("out there over the dashes for the sustain with NO bill (the axis was dashed under it all the way) → the U-turn's own bill, on the frame it comes back over the solid axis", () => {
      const r = run(
        play([
          ...turnedRoundThere(true),
          round(150, 165, () => ({ bank: 1, clear: -0.3, solid: false })),
          round(165, 180, () => ({ bank: -1 })),
          hold(3, { bank: -1, nose: 180, kmh: 25, clear: 2 }),
        ]),
        ARMED,
      );
      expect(r.crossings.map((c) => c.detail)).toEqual([UTURN]);
      expect(Math.abs(r.crossings[0].t - (2 + 10 + 1))).toBeLessThan(0.06);
      expect(r.amendments).toEqual([]);
    });
    it("a graze — out over the dashes and back inside the sustain → nothing", () => {
      const r = run(
        play([
          ...turnedRoundThere(true),
          round(150, 156, () => ({ bank: 1, clear: -0.3, solid: false })),
          round(156, 180, () => ({ bank: -1 })),
          hold(3, { bank: -1, nose: 180, kmh: 25, clear: 2 }),
        ]),
        ARMED,
      );
      expect(r.crossings).toEqual([]);
    });
    it("the same turn-round begun where the axis is DASHED names nothing: the span's bill stays the crossing's, and with no bill there is none", () => {
      const billed = outAndBack(false, 0.4, 0.8);
      expect(billed.crossings).toHaveLength(1);
      expect(billed.amendments).toEqual([]);
      const unbilled = run(
        play([
          ...turnedRoundThere(false),
          round(150, 165, () => ({ bank: 1, clear: -0.3, solid: false })),
          round(165, 180, () => ({ bank: -1 })),
          hold(3, { bank: -1, nose: 180, kmh: 25, clear: 2 }),
        ]),
        ARMED,
      );
      expect(unbilled.crossings.map((c) => c.detail)).not.toContain(UTURN);
      expect(unbilled.amendments).toEqual([]);
    });
    it("ONE ACT, ONE BILL when the span's bill is OLDER than the turn-round: out over the dashes, the span run on the oncoming half (billed), a turn-round over there confirmed 144° round, the way back over the solid axis in its tail → that one bill is named; round 5 closed the manoeuvre at the confirmation and billed the way back as a SECOND row", () => {
      const r = run(
        play([
          ...OUT_OVER_THE_DASHES,
          round(0, 150, () => ({ bank: -1, clear: 2 })),
          round(150, 180, () => ({ bank: 1 })),
          hold(0.3, { bank: 1, nose: 180 }),
        ]),
        ARMED,
      );
      expect(r.crossings).toHaveLength(1);
      expect(named(r)).toEqual([[r.crossings[0].t, UTURN]]);
      // …and if no way back comes, the manoeuvre is closed when the swing ends, as round 5 closed it: nothing is named.
      const stays = run(play([...OUT_OVER_THE_DASHES, round(0, 180, () => ({ bank: -1, clear: 2 })), hold(3, { bank: -1, nose: 180, kmh: 25, clear: 2 })]), ARMED);
      expect(stays.crossings).toHaveLength(1);
      expect(stays.amendments).toEqual([]);
    });
  });

  describe("R6-2 — ONE ACT, ONE BILL ENDS WITH THE SWING: home is the half of the new travel direction", () => {
    /** The U-turn from the own half whose centre goes over 150° round — in the tail: the U-turn's own bill, 0.6 s on. */
    const UTURN_IN_THE_TAIL = [STRAIGHT, round(0, 150, () => ({ bank: 1 })), round(150, 180, () => ({ bank: -1, clear: -0.3 }))];
    it("the SAME SWING over-rotating back over the solid axis is not billed again; the run that follows on the half against the new direction is billed ONCE, the sustain after the swing ENDED — not the sustain after that second crossing", () => {
      const r = run(
        play([
          ...UTURN_IN_THE_TAIL,
          // 13° further round on the same swing; the centre goes back over 11° into it…
          round(180, 193, (deg) => ({ bank: deg >= 191 ? 1 : -1, clear: -0.3 })),
          // …then straight on at 25 км/ч: two metres are 0.29 s.
          hold(4, { bank: 1, nose: -193, kmh: 25, clear: -0.3 }),
        ]),
        ARMED,
      );
      const crossedBackAt = 2 + 12 + 11 / 15;
      const swingEndsAt = 2 + 12 + 13 / 15 + 2 / (25 / 3.6);
      expect(r.crossings.map((c) => c.detail)).toEqual([UTURN, ASTRIDE]);
      expect(Math.abs(r.crossings[0].t - (2 + 10 + 0.6))).toBeLessThan(0.06);
      // Not at «second crossing + 0.6 s» (the shipped detector's own clock, which started inside the swing)…
      expect(r.crossings[1].t).toBeGreaterThan(crossedBackAt + 0.6 + 0.1);
      // …but the sustain after the swing ended.
      expect(Math.abs(r.crossings[1].t - (swingEndsAt + 0.6))).toBeLessThan(0.11);
      expect(r.amendments).toEqual([]);
      // «Насрещната» is true of that run: travelling against the road's way on the half that runs with it.
      expect(r.crossings[1].explanationBg).toContain("в насрещната половина на платното");
    });
    it("…and if he is back on the half of his new direction inside the sustain, nothing more is billed", () => {
      const r = run(
        play([
          ...UTURN_IN_THE_TAIL,
          round(180, 193, (deg) => ({ bank: deg >= 191 ? 1 : -1, clear: -0.3 })),
          hold(0.6, { bank: 1, nose: -193, kmh: 25, clear: -0.3 }),
          hold(3, { bank: -1, nose: 180, kmh: 25, clear: 2 }),
        ]),
        ARMED,
      );
      expect(r.crossings.map((c) => c.detail)).toEqual([UTURN]);
    });
    it("TWO TURN-ROUNDS ARE TWO ACTS: the car goes on round — over the axis again 200° round (the first turn-round's tail: not billed), and the second turn-round completes → its own U-turn bill, on the frame it is confirmed (round 5 billed it at the second crossing, before there was a second turn-round)", () => {
      const r = run(play([...UTURN_IN_THE_TAIL, round(180, 360, (deg) => ({ bank: deg >= 200 ? 1 : -1, clear: -0.3 })), hold(3, { bank: 1, nose: 0, kmh: 25, clear: 2 })]), ARMED);
      expect(r.crossings.map((c) => c.detail)).toEqual([UTURN, UTURN]);
      const secondConfirmedAt = 2 + 315 / 15 + 0.6;
      expect(Math.abs(r.crossings[1].t - secondConfirmedAt)).toBeLessThan(0.11);
      expect(r.amendments).toEqual([]);
    });
    it("THE RUN'S BILL IS A STANDING CROSSING LIKE ANY OTHER (fuzz 601#129): a pull-out, a round to the right back over the solid axis (the U-turn), the run on the half he set out from (billed), and THEN a second turn-round there, begun over the solid axis → that bill is named too (R4-2: any turn-round by a car across the solid axis)", () => {
      const r = run(
        play([
          STRAIGHT,
          hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
          hold(2, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
          // a round to the RIGHT at 15 °/s: the centre home 80° round
          { sec: 186 / 15, at: (u: number): F => ({ bank: 186 * u >= 80 ? 1 : -1, nose: -6 + 186 * u }) },
          hold(3, { bank: 1, nose: 180, kmh: 25 }),
          // and round again, on that half
          { sec: 12, at: (u: number): F => ({ bank: 1, nose: 180 + 180 * u }) },
          hold(3, { bank: 1, nose: 0, kmh: 25 }),
        ]),
        ARMED,
      );
      expect(r.crossings).toHaveLength(2);
      expect(named(r)).toEqual([
        [r.crossings[0].t, UTURN],
        [r.crossings[1].t, UTURN],
      ]);
    });
    it("ACROSS THE **SOLID** AXIS means the centre last passed it where it is solid (fuzz 601#374): the same round whose centre comes back over the DASHES leaves him across no solid line — the span he then runs is the shipped detector's bill (the recorded class X4), and a later turn-round does not name it", () => {
      const r = run(
        play([
          STRAIGHT,
          hold(0.5, { bank: 1, nose: -6, kmh: 30 }),
          hold(2, { bank: -1, nose: -6, kmh: 30, clear: 2 }),
          // the round begins over the solid axis; from 60° round on the axis under the car is dashed, and the centre comes home 80° round
          { sec: 186 / 15, at: (u: number): F => ({ bank: 186 * u >= 80 ? 1 : -1, nose: -6 + 186 * u, solid: 186 * u < 60 }) },
          hold(3, { bank: 1, nose: 180, kmh: 25 }),
          { sec: 12, at: (u: number): F => ({ bank: 1, nose: 180 + 180 * u }) },
          hold(3, { bank: 1, nose: 0, kmh: 25 }),
        ]),
        ARMED,
      );
      expect(r.crossings).toHaveLength(2);
      // Only the pull-out's bill is the U-turn.
      expect(named(r)).toEqual([[r.crossings[0].t, UTURN]]);
    });
  });
});

describe("§2 the act's copy explains the U-turn — title, reason and corrective", () => {
  const act = rules.actCopy("CROSSED_SOLID_LINE", UTURN) as
    | { titleBg: string; explanationBg: string; correctiveBg?: string }
    | null;

  it("the catalogue authors the act", () => {
    expect(act).not.toBeNull();
    expect(act!.titleBg).toMatch(/[Оо]братен завой/u);
    expect(act!.titleBg).toMatch(/непрекъсната осева/u);
    expect(act!.explanationBg).toMatch(/обратен завой/u);
    // What the pooled explanation says about the line is still said.
    expect(act!.explanationBg).toMatch(/непрекъсната линия \(М1\)/u);
  });

  it("the reason claims what the evidence measures — crossed, and turned round — and nothing round 1's evidence used to claim", () => {
    // The act is shown only after the reversal completed, so it may say the
    // car WAS turned round …
    expect(act!.explanationBg).toMatch(/^Пресече непрекъснатата осева линия и зави в обратна посока — това е обратен завой/u);
    // … and it no longer claims a direction of turn, a line of approach or a
    // mere beginning: none of those is measured (a three-point turn reverses in
    // the middle; a turn can be made by backing across).
    expect(act!.explanationBg).not.toMatch(/наляво/u);
    expect(act!.explanationBg).not.toMatch(/напряко/u);
    expect(act!.explanationBg).not.toMatch(/започва/u);
    // No sign is claimed to stand anywhere, and no oncoming car.
    expect(act!.explanationBg).not.toMatch(/В23|знак/u);
    expect(act!.explanationBg).not.toMatch(/насрещн(а|и|ият|ите) (кола|автомобил)/u);
  });

  it("the corrective names the U-turn and where it IS done — and says nothing about overtaking", () => {
    const corrective = act?.correctiveBg ?? "";
    expect(corrective).toMatch(/[Оо]братен завой/u);
    expect(corrective).toMatch(/прекъсната/u);
    expect(corrective).not.toMatch(OVERTAKING_ADVICE);
    expect(corrective).not.toMatch(/предният/u);
  });

  it("makeViolation stamps the act's title and reason on the event, at the pooled class and points", () => {
    const e = rules.makeViolation("CROSSED_SOLID_LINE", 12, { detail: UTURN });
    expect(e.titleBg).toBe(act?.titleBg);
    expect(e.explanationBg).toBe(act?.explanationBg);
    expect(e.severityClass).toBe("osnovna");
    expect(e.points).toBe(3);
    // No new citation was written: the rule that was broken is still the М1.
    expect(e.lawRef).toBe(rules.VIOLATIONS.CROSSED_SOLID_LINE.lawRef);
  });
});

describe("§2b (round 3) the straddle's copy — the crossing's own title and remedy, and a reason that claims what a centre across and a body astride amount to", () => {
  const act = rules.actCopy("CROSSED_SOLID_LINE", ASTRIDE) as
    | { titleBg: string; explanationBg: string; correctiveBg?: string; lawRef?: string; peekBg?: string }
    | null;
  const pooled = rules.VIOLATIONS.CROSSED_SOLID_LINE;
  const POOLED_FIRST = "Пресече изцяло непрекъснатата осева линия и навлезе в насрещната половина на платното.";
  const ASTRIDE_FIRST =
    "Застъпи непрекъснатата осева линия и навлезе с повече от половината автомобил в насрещната половина на платното.";

  it("the catalogue authors the act: the pooled title, and a first sentence without «изцяло»", () => {
    expect(act).not.toBeNull();
    expect(act!.titleBg).toBe(pooled.titleBg);
    expect(pooled.explanationBg.startsWith(POOLED_FIRST)).toBe(true);
    expect(act!.explanationBg.startsWith(ASTRIDE_FIRST)).toBe(true);
    expect(act!.explanationBg).not.toMatch(/изцяло/u);
    // It claims no U-turn, no sign and no oncoming car.
    expect(act!.explanationBg).not.toMatch(/обратен завой|обратна посока|В23|знак/u);
  });

  it("everything after that sentence is the pooled row's, word for word — what the М1 forbids is said once, the same way", () => {
    expect(act!.explanationBg.slice(ASTRIDE_FIRST.length)).toBe(pooled.explanationBg.slice(POOLED_FIRST.length));
  });

  it("it authors NO corrective, citation or peek: the remedy and the rule are the crossing's", () => {
    expect(act!.correctiveBg).toBeUndefined();
    expect(act!.lawRef).toBeUndefined();
    expect(act!.peekBg).toBeUndefined();
    expect(rules.violationCorrectiveBg("CROSSED_SOLID_LINE", ASTRIDE)).toBe(pooled.correctiveBg);
    expect(rules.violationPeekBg("CROSSED_SOLID_LINE", ASTRIDE)).toBe(rules.violationPeekBg("CROSSED_SOLID_LINE", undefined));
    const e = rules.makeViolation("CROSSED_SOLID_LINE", 7, { detail: ASTRIDE });
    expect([e.titleBg, e.explanationBg, e.lawRef, e.severityClass, e.points]).toEqual([
      pooled.titleBg,
      act!.explanationBg,
      pooled.lawRef,
      "osnovna",
      3,
    ]);
  });

  it("ADR-002 — «застъпи» is the bank's own verb for what the М1 forbids: ППЗДвП чл. 63, ал. 2, т. 1, retrieved", () => {
    const REPO = path.resolve(process.cwd(), "..");
    const bank = readFileSync(path.join(REPO, "content", "questions", "signali-i-markirovka.json"), "utf-8");
    expect(bank).toContain(
      "ИЗТОЧНИК ППЗДвП чл. 63, ал. 2, т. 1: „„Единична непрекъсната линия“ - М1. На пътните превозни средства е забранено да я застъпват и пресичат.",
    );
    expect(act!.explanationBg).toMatch(/^Застъпи непрекъснатата осева линия/u);
    expect(act!.explanationBg).toContain("(М1) не се застъпва и не се пресича");
  });

  it("the act is PROVISIONAL — an amendment may still name such a row — and the U-turn is not", () => {
    expect(rules.PROVISIONAL_ACTS).toEqual({ CROSSED_SOLID_LINE: [ASTRIDE, OWN_WAY, ASTRIDE_OWN_WAY] });
    expect(rules.actIsOpen("CROSSED_SOLID_LINE", OWN_WAY)).toBe(true);
    expect(rules.actIsOpen("CROSSED_SOLID_LINE", ASTRIDE_OWN_WAY)).toBe(true);
    expect(rules.actIsOpen("CROSSED_SOLID_LINE", undefined)).toBe(true);
    expect(rules.actIsOpen("CROSSED_SOLID_LINE", ASTRIDE)).toBe(true);
    expect(rules.actIsOpen("CROSSED_SOLID_LINE", UTURN)).toBe(false);
    expect(rules.actIsOpen("WRONG_WAY", ASTRIDE)).toBe(false);
    // Every provisional act is a real act of its code.
    for (const [code, acts] of Object.entries(rules.PROVISIONAL_ACTS)) {
      for (const detail of acts ?? []) expect(rules.actCopy(code as "CROSSED_SOLID_LINE", detail), `${code}|${detail}`).not.toBeNull();
    }
  });
});

describe("§3 violationCorrectiveBg — act first, pooled second, like every other act string", () => {
  const corrective = (rules as unknown as {
    violationCorrectiveBg?: (code: string, detail: string | undefined) => string;
  }).violationCorrectiveBg;

  it("exists, and returns the act's corrective for the U-turn", () => {
    expect(typeof corrective).toBe("function");
    expect(corrective!("CROSSED_SOLID_LINE", UTURN)).toMatch(/[Оо]братен завой/u);
    expect(corrective!("CROSSED_SOLID_LINE", UTURN)).not.toMatch(OVERTAKING_ADVICE);
  });

  it("pools for no detail and for a detail the catalogue does not declare — the overtake keeps its advice", () => {
    const pooled = rules.VIOLATIONS.CROSSED_SOLID_LINE.correctiveBg;
    expect(pooled).toMatch(OVERTAKING_ADVICE); // unchanged: it is right for an overtake
    expect(corrective!("CROSSED_SOLID_LINE", undefined)).toBe(pooled);
    expect(corrective!("CROSSED_SOLID_LINE", "no-such-act")).toBe(pooled);
  });

  it("CENSUS: the U-turn is the ONLY act in the catalogue with its own corrective — no other card moved", () => {
    const withOwn: string[] = [];
    for (const [code, acts] of Object.entries(rules.PER_ACT_COPY)) {
      for (const [detail, copy] of Object.entries(acts ?? {})) {
        const own = (copy as { correctiveBg?: string }).correctiveBg;
        const got = corrective!(code, detail);
        if (own !== undefined) withOwn.push(`${code}|${detail}`);
        else expect(got, `${code}|${detail}`).toBe(rules.VIOLATIONS[code as keyof typeof rules.VIOLATIONS].correctiveBg);
      }
    }
    expect(withOwn).toEqual([`CROSSED_SOLID_LINE|${UTURN}`]);
  });
});

describe("§4 ADR-002 — what the corrective cites is in the bank, as cited", () => {
  const REPO = path.resolve(process.cwd(), "..");
  const corrective =
    (rules.actCopy("CROSSED_SOLID_LINE", UTURN) as { correctiveBg?: string } | null)?.correctiveBg ?? "";

  it("ЗДвП чл. 38, ал. 1 и 2 carry the two duties the corrective states", () => {
    expect(corrective).toMatch(/ЗДвП чл\. 38, ал\. 1 и 2/u);
    const zdvp = JSON.parse(
      readFileSync(path.join(REPO, "content", "law", "acts", "zdvp.json"), "utf-8"),
    ) as { units: { ref: string; textBg: string }[] };
    const art38 = zdvp.units.find((u) => u.ref === "чл. 38")!.textBg;
    // ал. 1 — from the leftmost lane, to the left. (The bank's text carries a
    // stray space, „най- лявата"; the corrective paraphrases, it does not quote.)
    expect(art38).toMatch(/\(1\) Завиването в обратна посока се извършва наляво от най-\s?лявата пътна лента/u);
    expect(corrective).toMatch(/наляво от най-лявата лента/u);
    // …and what the REASON calls the manoeuvre — «зави в обратна посока» — is
    // the article's own name for it, not a coinage.
    expect(art38).toMatch(/Завиването в обратна посока/u);
    expect(rules.actCopy("CROSSED_SOLID_LINE", UTURN)?.explanationBg).toMatch(/зави в обратна посока/u);
    // ал. 2 — the oncoming go first.
    expect(art38).toMatch(/\(2\) При завиване в обратна посока водачът пропуска насрещно движещите се/u);
    expect(corrective).toMatch(/пропуснеш насрещните/u);
  });

  it("the sign it names is the bank's В23, by the bank's own name", () => {
    const signs = JSON.parse(
      readFileSync(path.join(REPO, "content", "signs", "signs.json"), "utf-8"),
    ) as { code: string; nameBg: string }[];
    const v23 = signs.find((s) => s.code === "В23")!;
    expect(v23.nameBg).toBe("Забранено е завиването в обратна посока");
    expect(corrective).toContain(`знак В23 „${v23.nameBg}“`);
  });
});

describe("§5 applyActAmendments — a bill that is already out is re-labelled, never re-priced", () => {
  const apply = (rules as unknown as {
    applyActAmendments?: <E extends { kind: string }>(
      events: readonly E[],
      amendments: ReadonlyArray<{ code: string; billT: number; detail: string }> | undefined,
    ) => readonly E[];
  }).applyActAmendments;
  const pooled = (t: number) => rules.makeViolation("CROSSED_SOLID_LINE", t);
  const praise = { kind: "commendation", code: "CLEAN_DRIVING", t: 3, titleBg: "x", explanationBg: "y" } as const;

  it("the row with that code and time gets the act: detail, title, reason — and keeps its time, class, points and marks", () => {
    expect(typeof apply).toBe("function");
    const billed = { ...pooled(12.5), regrade: true as const };
    const out = apply!([praise, pooled(4), billed], [{ code: "CROSSED_SOLID_LINE", billT: 12.5, detail: UTURN }]);
    const named = rules.makeViolation("CROSSED_SOLID_LINE", 12.5, { detail: UTURN });
    expect(out).toEqual([praise, pooled(4), { ...named, regrade: true }]);
    const row = out[2] as ViolationEvent;
    expect(row.severityClass).toBe("osnovna");
    expect(row.points).toBe(3);
    expect(row.t).toBe(12.5);
  });

  it("nothing to name → THE SAME ARRAY back: no amendments, an empty list, a time that matches no row, a row that already carries an act", () => {
    const ledger = [praise, pooled(4), rules.makeViolation("CROSSED_SOLID_LINE", 9, { detail: UTURN })];
    expect(apply!(ledger, undefined)).toBe(ledger);
    expect(apply!(ledger, [])).toBe(ledger);
    expect(apply!(ledger, [{ code: "CROSSED_SOLID_LINE", billT: 5, detail: UTURN }])).toBe(ledger);
    expect(apply!(ledger, [{ code: "CROSSED_SOLID_LINE", billT: 9, detail: UTURN }])).toBe(ledger);
    expect(apply!(ledger, [{ code: "WRONG_WAY", billT: 4, detail: UTURN }])).toBe(ledger);
  });

  it("(round 3) a row billed on the straddle's reason is OPEN: the same amendment names it, and keeps its time, class, points and marks", () => {
    const astride = { ...rules.makeViolation("CROSSED_SOLID_LINE", 12.5, { detail: ASTRIDE }), regrade: true as const };
    const out = apply!([praise, astride], [{ code: "CROSSED_SOLID_LINE", billT: 12.5, detail: UTURN }]);
    expect(out).toEqual([praise, { ...rules.makeViolation("CROSSED_SOLID_LINE", 12.5, { detail: UTURN }), regrade: true }]);
    // …by its own time only: the straddle billed at another frame is left alone.
    const other = [rules.makeViolation("CROSSED_SOLID_LINE", 3, { detail: ASTRIDE })];
    expect(apply!(other, [{ code: "CROSSED_SOLID_LINE", billT: 12.5, detail: UTURN }])).toBe(other);
  });

  it("the input is not mutated", () => {
    const ledger = [pooled(4)];
    const out = apply!(ledger, [{ code: "CROSSED_SOLID_LINE", billT: 4, detail: UTURN }]);
    expect(out).not.toBe(ledger);
    expect(ledger[0]).toEqual(pooled(4));
    expect((out[0] as ViolationEvent).detail).toBe(UTURN);
  });
});
