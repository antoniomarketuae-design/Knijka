/**
 * WHAT ENDS AN ENCOUNTER (2026-08-10, register row B83).
 *
 * The rule engine turns a stream of contact reports into a count of accidents:
 * an encounter opens on the first report and closes after
 * `collisionSeparationSec` (1.2 s) in which nothing was reported at all,
 * «because the bodies have come apart». THAT PREMISE WAS FALSE. The
 * orchestrator's sentinel gated its report on closing speed in the same
 * condition as the geometry, so the stream also went quiet WHEN THE DRIVER
 * SIMPLY STOPPED — which is exactly what a shaken student does after hitting
 * something.
 *
 * DRIVEN, on the shipped `sc-follow-brake`, through the production stack
 * (createWorldRuntime + createTrafficSystem + the scenario director + the rule
 * engine): nose into the standing lead, hold the brake, then ease forward
 * 0.6 m WHILE THE TWO BODIES ARE STILL INSIDE EACH OTHER. Measured before the
 * repair, one nose-in and one creep, dwell = the seconds held at a standstill:
 *
 *     0.500 s → 1 «Пътнотранспортно произшествие»
 *     0.800 s → 1
 *     0.917 s → 1        ← the last innocent rung
 *     0.933 s → 2        ← ONE FRAME later (16.7 ms)
 *     1.000 s → 2
 *     2.500 s → 2        20 наказателни точки for one crash in which the cars
 *                        never came apart.
 *
 * The boundary sat exactly on `collisionSeparationSec`, measured on the
 * SILENCE and not on the bodies. The repair moves the nudge floor to the only
 * question it answers — «is this touch a crash or a bumper kiss», which is a
 * question about the START of an encounter — and lets the geometry, which is
 * the only thing here that can answer it, close the encounter.
 *
 * These four cases are the whole contract, and each is driven, never asserted
 * from a hand-built event list:
 *   1. sustained contact                    → ONE accident
 *   2. stop, then creep forward, still touching → ONE accident
 *   3. genuine separation, then a second hit    → TWO accidents
 *   4. a clean pass                             → none
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  actorObb,
  obbSeparationM,
  playerObb,
  PLAYER_HALF_LENGTH_M,
  PLAYER_HALF_WIDTH_M,
} from "../../collision";
import type { BrakingLeadCarSpec, StagedEventSpec } from "../../contracts";
import { SC_FOLLOW_BRAKE } from "../../lessons/scenario/templates-following";
import {
  createRuleEngine,
  DEFAULT_RULE_CONFIG,
  reduceTick,
  type RuleEngineState,
  type RuleEvent,
  type SimTick,
} from "../../rules";
import type { StagedActorSpec, StagedActorView, StagedCommand } from "../../traffic/types";
import { vehicleHalfLengthM, vehicleHalfWidthM } from "../../traffic/types";
import { recordScriptedDrive, type DriveScript } from "../../traces/recorder";
import { createScenarioDirector } from "../director";
import type { DirectorInput, StagedTrafficPort } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const FO_BRAKE = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "fo-brake-v1.json"), "utf-8"),
) as unknown;

/** fo-brake-v1 northbound lane centre — the lane the lead brakes in. */
const LANE_X = 4.06;
/** The sentinel's own frame rate on this harness (recorder SCRIPT_DT). */
const SCRIPT_HZ = 60;
/** The encounter window the rule engine closes on, seconds. */
const SEPARATION_SEC = DEFAULT_RULE_CONFIG.collisionSeparationSec;
/** BrakingLeadCarRunner's nudge floor, km/h (player speed alone is "closing"). */
const LEAD_NUDGE_FLOOR_KMH = 2;

// ---------------------------------------------------------------------------
// A. THE FOUNDER'S SHAPE, DRIVEN ON THE SHIPPED DRILL
// ---------------------------------------------------------------------------

interface DrivenRun {
  /** Session time of every frame the sentinel reported contact. */
  readonly reports: readonly number[];
  /** …of those, the frames whose speed cleared the nudge floor. This is
   *  EXACTLY the stream the pre-B83 sentinel emitted (same geometry, plus the
   *  floor test), so the defect can be re-derived from measured data instead
   *  of being quoted. */
  readonly reportsAboveFloor: readonly number[];
  readonly violations: readonly string[];
  readonly collisions: number;
}

function driveFoBrake(script: DriveScript): DrivenRun {
  const reports: number[] = [];
  const reportsAboveFloor: number[] = [];
  const rec = recordScriptedDrive(FO_BRAKE, script, {
    scenarioId: "sc-follow-brake",
    kind: "mistake",
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_BRAKE.staged ?? [])] as StagedEventSpec[],
    onTick: (t) => {
      for (const e of t.events) {
        if (e.kind !== "collision") continue;
        reports.push(t.t);
        if (Math.abs(t.speedKmh) > LEAD_NUDGE_FLOOR_KMH) reportsAboveFloor.push(t.t);
      }
    },
  });
  const violations = rec.ruleEvents
    .filter((e) => e.kind === "violation")
    .map((e) => (e as { code: string }).code);
  return {
    reports,
    reportsAboveFloor,
    violations,
    collisions: violations.filter((c) => c === "COLLISION").length,
  };
}

/** The rule engine's own latch, applied to an arbitrary report stream — used
 *  ONLY to re-derive what the pre-repair stream would have been billed. */
function accidentsIn(stream: readonly number[]): number {
  let n = 0;
  let last: number | null = null;
  for (const t of stream) {
    if (last === null || t - last > SEPARATION_SEC) n++;
    last = t;
  }
  return n;
}

/** Longest silence inside a report stream, seconds (0 for < 2 reports). */
function widestSilence(stream: readonly number[]): number {
  let w = 0;
  for (let i = 1; i < stream.length; i++) w = Math.max(w, stream[i] - stream[i - 1]);
  return w;
}

/** Approach, nose into the standing lead, hold `dwellSec`, ease forward 0.6 m. */
function noseInDwellCreep(dwellSec: number): DriveScript {
  const NOSE_Y = 234;
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 120], [LANE_X, 205]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[LANE_X, 205], [LANE_X, NOSE_Y]], targetKmh: 25, stopAtEnd: true },
      { kind: "pause", sec: dwellSec, brake: true },
      { kind: "drive", points: [[LANE_X, NOSE_Y], [LANE_X, NOSE_Y + 0.6]], targetKmh: 8, stopAtEnd: true },
      { kind: "pause", sec: 2, brake: true },
    ],
  };
}

/** The rungs the defect was found on; 2.5 s is the last dwell at which the
 *  staged lead has not yet resumed, so the bodies are provably still together
 *  at every one of them. */
const DWELL_RUNGS = [0.5, 0.8, 0.9, 0.917, 0.933, 1.0, 1.15, 1.2, 1.217, 1.5, 2.0, 2.5];

describe("B83 — an encounter closes on separation, not on silence", () => {
  it("case 2: stop then creep, still touching, is ONE accident at every dwell", () => {
    for (const dwell of DWELL_RUNGS) {
      const run = driveFoBrake(noseInDwellCreep(dwell));
      // The premise, measured: the report stream is UNBROKEN, which is the
      // sentinel saying the two bodies were never apart for a single frame.
      expect(run.reports.length, `dwell ${dwell}: contact must be reported`).toBeGreaterThan(10);
      expect(
        widestSilence(run.reports),
        `dwell ${dwell}: the bodies never came apart, so the stream must not break`,
      ).toBeLessThanOrEqual(2 / SCRIPT_HZ);
      expect(run.collisions, `dwell ${dwell}: one crash is one accident`).toBe(1);
    }
  });

  it("the boundary is GONE, not moved — the old stream would still bill twice", () => {
    // Re-derived from the SAME measured drive: the pre-repair sentinel emitted
    // this drive's contact frames minus the ones below the nudge floor. Past
    // the boundary that stream carries more than `collisionSeparationSec` of
    // silence produced by a stationary car still embedded in another one.
    const low = driveFoBrake(noseInDwellCreep(0.8));
    const high = driveFoBrake(noseInDwellCreep(1.5));
    expect(accidentsIn(low.reportsAboveFloor)).toBe(1);
    expect(accidentsIn(high.reportsAboveFloor)).toBe(2); // ← the defect
    expect(widestSilence(high.reportsAboveFloor)).toBeGreaterThan(SEPARATION_SEC);
    // …and the stream the engine actually receives now carries no silence at
    // all, at either rung, so there is no boundary left to sit on.
    expect(low.collisions).toBe(1);
    expect(high.collisions).toBe(1);
    expect(widestSilence(high.reports)).toBeLessThanOrEqual(2 / SCRIPT_HZ);
  });

  it("case 1: sustained contact — pushing on through the lead is ONE accident", () => {
    const run = driveFoBrake({
      steps: [
        { kind: "glance", mirror: "rear" },
        { kind: "drive", points: [[LANE_X, 15], [LANE_X, 120], [LANE_X, 205]], targetKmh: 40, stopAtEnd: false },
        // straight through the standing lead and out the far side, never stopping
        { kind: "drive", points: [[LANE_X, 205], [LANE_X, 245]], targetKmh: 12, stopAtEnd: true },
        { kind: "pause", sec: 1.5, brake: true },
      ],
    });
    expect(run.reports.length).toBeGreaterThan(60); // a full second of overlap+
    expect(run.collisions).toBe(1);
  });

  it("case 4: the founder's lawful pass beside the standing lead grades NOTHING", () => {
    // 1.2925 m of measured daylight — the B82 case, re-driven here so all four
    // outcomes of one contract live in one file.
    const passX = 1.0;
    const run = driveFoBrake({
      steps: [
        { kind: "glance", mirror: "rear" },
        { kind: "drive", points: [[LANE_X, 15], [LANE_X, 120], [LANE_X, 200]], targetKmh: 40, stopAtEnd: false },
        { kind: "indicator", setting: "left" },
        { kind: "glance", mirror: "left" },
        { kind: "drive", points: [[LANE_X, 200], [passX, 216]], targetKmh: 18, stopAtEnd: false },
        { kind: "drive", points: [[passX, 216], [passX, 246]], targetKmh: 14, stopAtEnd: false },
        { kind: "indicator", setting: "right" },
        { kind: "glance", mirror: "right" },
        { kind: "drive", points: [[passX, 246], [LANE_X, 262]], targetKmh: 18, stopAtEnd: false },
        { kind: "indicator", setting: "off" },
        { kind: "drive", points: [[LANE_X, 262], [LANE_X, 330]], targetKmh: 30 },
        { kind: "pause", sec: 1.5, brake: true },
      ],
    });
    expect(run.reports).toEqual([]);
    expect(run.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B. THE SAME CONTRACT AT THE SENTINEL, WITH THE SEPARATION STATED
// ---------------------------------------------------------------------------

/**
 * Part A drives the real drill, which is what found the defect; it cannot,
 * however, put a MEASURED number on «the bodies are apart», because the staged
 * lead's pose is inside the traffic system. Here the actor's pose is the
 * test's own, so every claim about separation is an assertion rather than an
 * inference — including the one Part A cannot drive at all, a genuine
 * hit → reverse clear → hit again, which needs the struck car to stay put.
 */

const SYNTH_LEAD: BrakingLeadCarSpec = {
  id: "t-b83-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["a", "b"],
    hold: { nodeIndex: 0, offsetM: 0 },
    cruiseSpeedMps: 0,
    colorIndex: 1,
  },
  followGapM: 20,
  maxMatchSpeedMps: 12,
  slamAt: { x: 0, y: 100 },
  slamRadiusM: 3,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 5,
  proximityFallbackM: 0.5,
  triggersHazard: false,
  resumeAfterSec: 999, // it is a WALL for this test: it never drives away
};

/** The struck car stands at (0, 100) facing north and never moves. */
const ACTOR_Y = 100;

class WallPort implements StagedTrafficPort {
  readonly view: StagedActorView = {
    id: SYNTH_LEAD.id,
    kind: "vehicle",
    x: 0,
    y: ACTOR_Y,
    dirX: 0,
    dirY: 1,
    speedMps: 0,
    s: 0,
    pathLengthM: 400,
    nodeS: [0, 400],
    finished: false,
  } as StagedActorView;

  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view;
  }
  stagedCommand(_id: string, _command: StagedCommand): void {}
  staged(_id: string): StagedActorView | null {
    return this.view;
  }
}

/** Nose-to-tail touching distance between the two centres, m. */
const NOSE_TOUCH_M = PLAYER_HALF_LENGTH_M + vehicleHalfLengthM("car");
/** Flank-to-flank touching distance between the two centres, m. */
const FLANK_TOUCH_M = PLAYER_HALF_WIDTH_M + vehicleHalfWidthM("car");

/** Signed separation between the player at (x, y) and the standing car, m. */
function separationAt(x: number, y: number): number {
  return obbSeparationM(
    playerObb(x, y, 0),
    actorObb({ x: 0, y: ACTOR_Y, dirX: 0, dirY: 1 }),
  );
}

const SYNTH_DT = 1 / 30;

interface SynthResult {
  readonly reports: readonly number[];
  readonly accidents: number;
  readonly minSeparationM: number;
  readonly maxSeparationAfterFirstContactM: number;
}

/** Fold a pose script through director → rule engine, exactly as a frame does. */
function runSynth(poses: ReadonlyArray<{ x: number; y: number; speedKmh: number }>): SynthResult {
  const port = new WallPort();
  const dir = createScenarioDirector([SYNTH_LEAD], port, { seed: 3 });
  let rules: RuleEngineState = createRuleEngine();
  const events: RuleEvent[] = [];
  const reports: number[] = [];
  let minSep = Number.POSITIVE_INFINITY;
  let maxSepAfter = Number.NEGATIVE_INFINITY;
  let sawContact = false;
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i];
    const t = (i + 1) * SYNTH_DT;
    const input: DirectorInput = {
      tSec: t,
      dtSec: SYNTH_DT,
      x: p.x,
      y: p.y,
      speedKmh: p.speedKmh,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [],
    };
    const step = dir.step(input);
    const sep = separationAt(p.x, p.y);
    minSep = Math.min(minSep, sep);
    if (step.events.some((e) => e.kind === "collision")) {
      reports.push(t);
      sawContact = true;
    }
    if (sawContact) maxSepAfter = Math.max(maxSepAfter, sep);
    const frame: SimTick = {
      t,
      speedKmh: p.speedKmh,
      maxSpeedKmh: 50,
      position: { x: p.x, y: p.y },
      headingDeg: 0,
      laneOffsetM: 0,
      laneId: 0,
      indicator: "off",
      headlights: "low",
      seatbeltOn: true,
      handbrakeOn: false,
      gear: 1,
      isNight: false,
      events: step.events,
    };
    const r = reduceTick(rules, frame);
    rules = r.state;
    events.push(...r.events);
  }
  return {
    reports,
    accidents: events.filter((e) => e.kind === "violation" && e.code === "COLLISION").length,
    minSeparationM: minSep,
    maxSeparationAfterFirstContactM: maxSepAfter,
  };
}

/** Frames that walk y from `fromY` to `toY` at `kmh`, then the pose held. */
function leg(
  fromY: number,
  toY: number,
  kmh: number,
  x = 0,
): Array<{ x: number; y: number; speedKmh: number }> {
  const out: Array<{ x: number; y: number; speedKmh: number }> = [];
  const stepM = (kmh / 3.6) * SYNTH_DT;
  const dir = Math.sign(toY - fromY);
  if (stepM <= 0 || dir === 0) return out;
  for (let y = fromY + dir * stepM; dir > 0 ? y <= toY : y >= toY; y += dir * stepM) {
    out.push({ x, y, speedKmh: kmh });
  }
  return out;
}

/** `sec` seconds of standing perfectly still at (x, y). */
function still(x: number, y: number, sec: number): Array<{ x: number; y: number; speedKmh: number }> {
  const out: Array<{ x: number; y: number; speedKmh: number }> = [];
  for (let i = 0; i < Math.round(sec / SYNTH_DT); i++) out.push({ x, y, speedKmh: 0 });
  return out;
}

/** Deep enough to be unambiguous overlap, shallow enough to still be a car. */
const EMBEDDED_Y = ACTOR_Y - NOSE_TOUCH_M + 0.8;
/** Far enough back that the exact geometry reports real daylight. */
const CLEAR_Y = ACTOR_Y - NOSE_TOUCH_M - 2;

describe("B83 — what the geometry says, said out loud", () => {
  it("the two poses this file argues from are what they claim to be", () => {
    expect(separationAt(0, EMBEDDED_Y)).toBeCloseTo(-0.8, 9);
    expect(separationAt(0, CLEAR_Y)).toBeCloseTo(2, 9);
    expect(NOSE_TOUCH_M).toBeCloseTo(4.07, 9);
    expect(FLANK_TOUCH_M).toBeCloseTo(1.77, 9);
  });

  it("case 1: four seconds embedded in a standing car is ONE accident", () => {
    const r = runSynth([
      ...leg(ACTOR_Y - 12, EMBEDDED_Y, 25),
      ...still(0, EMBEDDED_Y, 4),
    ]);
    expect(r.maxSeparationAfterFirstContactM).toBeLessThan(0); // never apart
    expect(r.reports.length).toBeGreaterThan(110); // ≈ 4 s at 30 Hz
    expect(widestSilence(r.reports)).toBeCloseTo(SYNTH_DT, 6); // unbroken
    expect(r.accidents).toBe(1);
  });

  it("case 2: stop for three seconds, then ease forward — still ONE accident", () => {
    const r = runSynth([
      ...leg(ACTOR_Y - 12, EMBEDDED_Y, 25),
      ...still(0, EMBEDDED_Y, 3),
      ...leg(EMBEDDED_Y, EMBEDDED_Y + 0.6, 6),
      ...still(0, EMBEDDED_Y + 0.6, 1),
    ]);
    expect(r.maxSeparationAfterFirstContactM).toBeLessThan(0);
    // Three seconds is two and a half times the encounter window; before the
    // repair this stream had a 3 s hole in it and the creep bought a second
    // «Пътнотранспортно произшествие» and ten more наказателни точки.
    expect(widestSilence(r.reports)).toBeCloseTo(SYNTH_DT, 6);
    expect(r.accidents).toBe(1);
  });

  it("case 3: hit, back out into real daylight, hit again — TWO accidents", () => {
    const r = runSynth([
      ...leg(ACTOR_Y - 12, EMBEDDED_Y, 25),
      ...leg(EMBEDDED_Y, CLEAR_Y, 10),
      ...still(0, CLEAR_Y, 2), // > collisionSeparationSec, genuinely apart
      ...leg(CLEAR_Y, EMBEDDED_Y, 20),
      ...still(0, EMBEDDED_Y, 0.5),
    ]);
    expect(r.maxSeparationAfterFirstContactM).toBeGreaterThan(1.5); // real air
    expect(widestSilence(r.reports)).toBeGreaterThan(SEPARATION_SEC);
    expect(r.accidents).toBe(2);
  });

  it("case 4: a lawful pass with 1.2925 m of daylight reports nothing", () => {
    const passX = -(FLANK_TOUCH_M + 1.2925);
    expect(separationAt(passX, ACTOR_Y)).toBeCloseTo(1.2925, 9);
    const r = runSynth(leg(ACTOR_Y - 20, ACTOR_Y + 20, 30, passX));
    expect(r.reports).toEqual([]);
    expect(r.accidents).toBe(0);
    expect(r.minSeparationM).toBeCloseTo(1.2925, 6);
  });

  it("the nudge floor still decides whether a touch OPENS anything", () => {
    // A 1.5 km/h bumper kiss is under BrakingLeadCarRunner's 2 km/h floor: it
    // opens no encounter and is never reported, however long it is held. The
    // repair moved that test, it did not delete it.
    const r = runSynth([
      ...leg(ACTOR_Y - NOSE_TOUCH_M - 0.4, EMBEDDED_Y, 1.5),
      ...still(0, EMBEDDED_Y, 2),
    ]);
    expect(r.minSeparationM).toBeLessThan(0); // the bodies really do overlap
    expect(r.reports).toEqual([]);
    expect(r.accidents).toBe(0);
  });
});
