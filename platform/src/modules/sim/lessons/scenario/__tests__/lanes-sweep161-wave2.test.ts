/**
 * SWEEP 161, SECOND PASS OVER templates-lanes.ts — the two rows the first pass
 * repaired only half of, and the receipt that refutes the rest.
 *
 * Twelve BROKEN findings were filed against this file from the 2026-08-16
 * device sweep. `sweep161-lane-claim-gates.test.ts` (the first pass) closed
 * seven of them by sizing lane-claiming radii and by putting the word
 * «изпревари» on a gate in the lane the manoeuvre uses. This file carries what
 * that pass left:
 *
 *   §1 sc-mwe-pass — THE MARK, not the radius. The first pass narrowed the disc
 *      so a car RIDING the shoulder past the mark is refused, and left the mark
 *      standing fifty metres beyond the stalled car. So the evasion the finding
 *      actually names — undertake the breakdown down the emergency lane and
 *      merge back before the mark — still collected «Подмини авариралата кола в
 *      лентата за движение» on every rung. Measured here in both directions.
 *
 *   §2 sc-ovbus-finish — THE LANE CLAIM THE CENSUS NET MISSES. §5 of
 *      objective-title-truth-lanes-following2-rail2 matches «дясната лента»;
 *      this row says «вдясно», so it was never on the backlog and never
 *      counted. Its L1 disc reached 3.44 m into the GENERAL lane — the lane the
 *      task asks the student to leave.
 *
 *   §3 THE REFUTATION, with receipts. Four of the twelve findings say a lesson
 *      of this file „cannot be passed" / „has no reachable success state"
 *      (sc-ov-narrow, sc-ov-bus-lane, sc-ov-oneway, sc-mw-emergency-lane). They
 *      are read off a sweep whose careful-driver control law has NO STEERING
 *      CHANNEL at all (tools/mobile/lesson-audit.mjs — throttle and brake only,
 *      «right» is a creep-and-stop speed loop), so on any lesson whose drill IS
 *      a lane change or a turn it can only ever fail. §3 replays each lesson's
 *      OWN committed shadow through the production evaluator and pins that
 *      every success row completes at every rung — the thing the sweep could
 *      not do, done once and kept.
 *
 * Every §1/§2 case carries both halves. A radius or a mark that only ever
 * refuses is the same crime as one that only ever passes, facing the other way.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvalState, parseObjectiveParams, stepObjective } from "../../objectives";
import type { ObjectiveParams, ReachZoneParams } from "../../types";
import { makeTick } from "../../__tests__/fixtures";
import type { ScenarioTrace } from "../../../traces/types";
import { compileScenario } from "../compile";
import {
  SC_MW_EMERGENCY_LANE,
  SC_OV_ABORT,
  SC_OV_BAN_OVERTAKE,
  SC_OV_BUS_LANE,
  SC_OV_NARROW,
  SC_OV_ONCOMING_GAP,
  SC_OV_ONEWAY,
  SC_OV_RETURN_GAP,
} from "../templates-lanes";
import type { ScenarioLevel, ScenarioSpec } from "../types";

/** The lane pitch of every district in this file; a disc on a lane centre
 *  leaves that lane at half of it. */
const LANE_HALF_PITCH_M = 8.125 / 2;

function readTrace(path: string): ScenarioTrace {
  return JSON.parse(readFileSync(join(process.cwd(), "..", path), "utf8")) as ScenarioTrace;
}

/** Replay a committed recording through the SHIPPED evaluator exactly as a
 *  session would: fresh eval state, one tick per sample, monotonic latch. */
function replay(params: ObjectiveParams, trace: ScenarioTrace): boolean {
  let state = createEvalState(params);
  let done = false;
  for (const s of trace.samples) {
    const r = stepObjective(
      params,
      state,
      makeTick({
        t: s.tSec,
        speedKmh: s.speedKmh,
        position: { x: s.x, y: s.y },
        headingDeg: s.headingDeg,
        gear: s.gear,
        indicator: s.indicator,
      }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

type Sample = { t: number; x: number; y: number; speedKmh: number };

/** A drive through waypoints at a constant speed, sampled every 0.4 m — denser
 *  than the smallest disc here, so nothing below leans on `stepReachZone`'s
 *  segment sweep to find the zone. */
function pathDrive(points: ReadonlyArray<readonly [number, number]>, speedKmh: number): Sample[] {
  const out: Sample[] = [];
  let t = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.4));
    for (let k = 0; k <= steps; k++) {
      out.push({ t, x: x0 + ((x1 - x0) * k) / steps, y: y0 + ((y1 - y0) * k) / steps, speedKmh });
      t += 0.05;
    }
  }
  return out;
}

const straightDrive = (x: number, fromY: number, toY: number, speedKmh: number): Sample[] =>
  pathDrive(
    [
      [x, fromY],
      [x, toY],
    ],
    speedKmh,
  );

function completesOn(params: ReachZoneParams, drive: readonly Sample[]): boolean {
  let state = createEvalState(params);
  let done = false;
  for (const s of drive) {
    const r = stepObjective(
      params,
      state,
      makeTick({ t: s.t, speedKmh: s.speedKmh, position: { x: s.x, y: s.y } }),
    );
    state = r.evalState;
    done = done || r.done;
  }
  return done;
}

/** The SHIPPED params of one row at one rung — what the student is graded
 *  against, never the authored number (the ladder widens it). */
function compiledZone(spec: ScenarioSpec, objectiveId: string, level: ScenarioLevel): ReachZoneParams {
  const obj = compileScenario(spec, level).objectives.find((o) => o.id === objectiveId);
  expect(obj, `${spec.id}/${objectiveId} at L${level}`).toBeDefined();
  const p = parseObjectiveParams(obj!);
  expect(p.kind).toBe("reachZone");
  return p as ReachZoneParams;
}

const rungs = (spec: ScenarioSpec) => spec.levels.map((l) => l.level);
const shadowOf = (spec: ScenarioSpec) => readTrace(spec.shadow.path);
const demoTrace = (spec: ScenarioSpec, basename: string) => {
  const m = spec.mistakes.find((x) => x.traceRef.path.endsWith(`${basename}.trace.json`));
  expect(m, `${spec.id} lost its ${basename} demo`).toBeDefined();
  return readTrace(m!.traceRef.path);
};

// ---------------------------------------------------------------------------
// §1 sc-mwe-pass — the lane is measured WHERE THE PASS HAPPENS
// ---------------------------------------------------------------------------

/**
 * mw-v1 lateral truth (meta.scenario): overtaking −8.12 · cruise 0 ·
 * EMERGENCY +8.13. The breakdown stands in the emergency lane at y = 780.
 */
const MW_X_CRUISE = 0;
const MW_X_EMERG = 8.13;
const MW_BREAKDOWN_Y = 780;
const MW_OLD_MARK_Y = 830;

/**
 * THE DRIVE THE FINDING NAMES, and the one no committed recording performs:
 * pull onto the shoulder before the stalled car, ride past it there, and be
 * tidily back in the cruise lane well before the old mark. Both counter-demos
 * leave the shoulder at y ≈ 660 / 690 — a hundred metres SHORT of the
 * breakdown — so neither of them ever exercised this, which is exactly why the
 * gate could sit fifty metres out for four waves without a test noticing.
 */
const UNDERTAKE_AND_MERGE = pathDrive(
  [
    [MW_X_CRUISE, 690],
    [MW_X_EMERG, 735],
    [MW_X_EMERG, 800],
    [MW_X_CRUISE, 820],
    [MW_X_CRUISE, 900],
  ],
  100,
);
/** The undertake that never comes back — what the first pass already refused. */
const SHOULDER_HOLD = straightDrive(MW_X_EMERG, 750, 900, 100);
/** The sweep's reckless run: one lane, never lifted, 139 км/ч past a stalled
 *  car with people around it. Refused by the cap the first pass added. */
const FLAT_OUT = straightDrive(MW_X_CRUISE, 700, 900, 139);
/** And the drive the lesson is asking for. */
const LAWFUL_CRUISE_PASS = straightDrive(MW_X_CRUISE, 700, 900, 100);

describe("§1 sc-mwe-pass — «Подмини авариралата кола в лентата за движение»", () => {
  it("FAILS ON THE OLD BEHAVIOUR: the mark 50 m past the car credited the shoulder undertake", () => {
    // The shipped radius, the shipped cap — only the mark restored to y = 830.
    // Every rung credited a drive whose whole content is the forbidden act.
    for (const level of rungs(SC_MW_EMERGENCY_LANE)) {
      const shipped = compiledZone(SC_MW_EMERGENCY_LANE, "sc-mwe-pass", level);
      expect(
        completesOn({ ...shipped, y: MW_OLD_MARK_Y }, UNDERTAKE_AND_MERGE),
        `old mark L${level}`,
      ).toBe(true);
    }
  });

  it("and the shipped mark refuses it on every rung", () => {
    for (const level of rungs(SC_MW_EMERGENCY_LANE)) {
      expect(
        completesOn(compiledZone(SC_MW_EMERGENCY_LANE, "sc-mwe-pass", level), UNDERTAKE_AND_MERGE),
        `L${level}`,
      ).toBe(false);
    }
  });

  it("THE OPPOSITE DIRECTION: the shadow, both counter-demos and a plain lawful pass all complete", () => {
    // A mark that moved onto the car must not start refusing the drive the
    // lesson asks for. The two demos are here on purpose: they are lawfully in
    // the cruise lane BESIDE the breakdown (their fault is the shoulder run a
    // hundred metres earlier, billed by EMERGENCY_LANE_DRIVING on its own
    // channel), so a repair that refused them would be a false negative
    // dressed as a cure.
    const shadow = shadowOf(SC_MW_EMERGENCY_LANE);
    for (const level of rungs(SC_MW_EMERGENCY_LANE)) {
      const p = compiledZone(SC_MW_EMERGENCY_LANE, "sc-mwe-pass", level);
      expect(replay(p, shadow), `shadow L${level}`).toBe(true);
      expect(completesOn(p, LAWFUL_CRUISE_PASS), `lawful 100 км/ч L${level}`).toBe(true);
      for (const demo of ["mistake-undertake", "mistake-shoulder-cruise"]) {
        expect(replay(p, demoTrace(SC_MW_EMERGENCY_LANE, demo)), `${demo} L${level}`).toBe(true);
      }
    }
    for (const m of SC_MW_EMERGENCY_LANE.mistakes) {
      expect(m.codeRefs).toContain("EMERGENCY_LANE_DRIVING");
    }
  });

  it("…and nothing the first pass refused came back: the shoulder hold and the 139 км/ч blast stay out", () => {
    for (const level of rungs(SC_MW_EMERGENCY_LANE)) {
      const p = compiledZone(SC_MW_EMERGENCY_LANE, "sc-mwe-pass", level);
      expect(completesOn(p, SHOULDER_HOLD), `shoulder L${level}`).toBe(false);
      expect(completesOn(p, FLAT_OUT), `139 км/ч L${level}`).toBe(false);
      expect(p.radiusM, `L${level}`).toBeLessThanOrEqual(LANE_HALF_PITCH_M);
    }
    expect(SC_MW_EMERGENCY_LANE.success.find((o) => o.id === "sc-mwe-pass")!.titleBg).toContain(
      "110 км/ч",
    );
  });

  it("the mark IS the stalled car's own coordinate, so the two cannot drift apart again", () => {
    // mw-n-nb-start → mw-n-nb-end runs (0,0) → (0,1000), so the actor's hold
    // arc metre IS a district y. Read from the staged spec rather than retyped:
    // move the breakdown and this row moves with it, or this test goes red.
    const breakdown = SC_MW_EMERGENCY_LANE.staged?.find((s) => s.id === "sc-mwe-breakdown");
    expect(breakdown, "sc-mw-emergency-lane lost its staged breakdown").toBeDefined();
    expect(breakdown!.kind).toBe("brakingLeadCar");
    if (breakdown!.kind !== "brakingLeadCar") return;
    const heldAtM = breakdown!.actor.hold?.offsetM;
    expect(heldAtM).toBe(MW_BREAKDOWN_Y);
    const authored = SC_MW_EMERGENCY_LANE.success.find((o) => o.id === "sc-mwe-pass")!.params;
    expect(authored.kind).toBe("reachZone");
    if (authored.kind !== "reachZone") return;
    expect(authored.y).toBe(heldAtM);
    expect(authored.x).toBe(MW_X_CRUISE);
  });
});

// ---------------------------------------------------------------------------
// §2 sc-ovbus-finish — «вдясно» is a lane claim too
// ---------------------------------------------------------------------------

/** ov-bus-v1 (meta.scenario): general (left) 4.06 · BUS/right 12.19; the paint
 *  between them is at 8.125. */
const BUS_X_GENERAL = 4.06;
const BUS_X_RIGHT = 12.19;

/** Where a car sits when it has NOT tucked back — anywhere in the general lane,
 *  including hard against the paint. All four were credited at some rung. */
const GENERAL_LANE_POSES = [4.06, 5.0, 6.0, 7.0, 8.0] as const;

describe("§2 sc-ovbus-finish — «Прибери се вдясно след края на бус лентата»", () => {
  it("FAILS ON THE OLD BEHAVIOUR: the L1 disc credited a car that stayed in the general lane", () => {
    // As shipped before this change: mark (12.19, 470), authored r5, L1 ×1.5.
    const asShipped: ReachZoneParams = { kind: "reachZone", x: BUS_X_RIGHT, y: 470, radiusM: 7.5 };
    for (const x of [5.0, 6.0, 7.0, 8.0]) {
      expect(completesOn(asShipped, straightDrive(x, 430, 520, 45)), `L1 x=${x}`).toBe(true);
    }
    // …and it was not only the aided rung: L3's own r5 still reached x = 7.19.
    expect(
      completesOn({ ...asShipped, radiusM: 5 }, straightDrive(8.0, 430, 520, 45)),
      "L3 x=8.0",
    ).toBe(true);
  });

  it("and the shipped gate refuses every general-lane pose on every rung", () => {
    for (const level of rungs(SC_OV_BUS_LANE)) {
      const p = compiledZone(SC_OV_BUS_LANE, "sc-ovbus-finish", level);
      for (const x of GENERAL_LANE_POSES) {
        expect(completesOn(p, straightDrive(x, 430, 520, 45)), `L${level} x=${x}`).toBe(false);
      }
    }
  });

  it("THE OPPOSITE DIRECTION: the shadow completes it, and the aided rung covers the whole right lane", () => {
    // The claim is „вдясно", not „on this exact line". At L1 — the rung
    // beginners are given, and the one the ladder makes widest — the disc has
    // to cover the lane end to end or the cure is a false refusal wearing the
    // cure's clothes. At L3 it is 5.4 m inside an 8.125 m lane, which is the
    // same tolerance every other lane-true row of this file carries (they are
    // all LANE_TRUE_RADIUS_M) and the shadow sits 0.05 m off the centre.
    const shadow = shadowOf(SC_OV_BUS_LANE);
    for (const level of rungs(SC_OV_BUS_LANE)) {
      const p = compiledZone(SC_OV_BUS_LANE, "sc-ovbus-finish", level);
      expect(replay(p, shadow), `shadow L${level}`).toBe(true);
      expect(p.radiusM, `L${level}`).toBeLessThanOrEqual(LANE_HALF_PITCH_M);
    }
    const aided = compiledZone(SC_OV_BUS_LANE, "sc-ovbus-finish", 1);
    for (const x of [8.2, 10.5, BUS_X_RIGHT, 14.0, 16.1]) {
      expect(completesOn(aided, straightDrive(x, 430, 520, 45)), `L1 x=${x}`).toBe(true);
    }
    const tightest = compiledZone(SC_OV_BUS_LANE, "sc-ovbus-finish", 3);
    for (const x of [10.0, BUS_X_RIGHT, 14.5]) {
      expect(completesOn(tightest, straightDrive(x, 430, 520, 45)), `L3 x=${x}`).toBe(true);
    }
  });

  it("the mark stays well past the end of the BUS span, so the sentence still reads true", () => {
    // ov-bus-v1 meta.scenario banZone is [90, 330]; the widest compiled disc
    // must clear its end or «след края на бус лентата» would be creditable
    // inside the span it names.
    const widest = Math.max(
      ...rungs(SC_OV_BUS_LANE).map((l) => compiledZone(SC_OV_BUS_LANE, "sc-ovbus-finish", l).radiusM),
    );
    const p = compiledZone(SC_OV_BUS_LANE, "sc-ovbus-finish", 3);
    expect(p.y - widest).toBeGreaterThan(330);
  });
});

// ---------------------------------------------------------------------------
// §3 „CANNOT BE PASSED" — refuted on the templates' own recordings
// ---------------------------------------------------------------------------

/**
 * The eight lessons of this file the sweep filed BROKEN findings against. Four
 * of those findings claim the lesson has no reachable success state; the sweep
 * driver that produced them holds a 12 км/ч creep-and-stop speed loop and never
 * touches the steering, so on sc-ov-oneway (a T-junction whose drill is
 * CHOOSING the turn), sc-ov-narrow (a parked row that must be driven around),
 * sc-ov-bus-lane (a lane change) and the 2600 m motorway it could not have
 * finished whatever the templates said.
 *
 * This is the measurement it could not make. Not decoration: it is the row that
 * goes red the moment a gate is authored where the drill's own demonstration
 * cannot reach it — which is precisely how a lesson becomes uncompletable.
 */
const AUDITED: ReadonlyArray<ScenarioSpec> = [
  SC_OV_ONEWAY,
  SC_OV_NARROW,
  SC_OV_BAN_OVERTAKE,
  SC_OV_BUS_LANE,
  SC_MW_EMERGENCY_LANE,
  SC_OV_ONCOMING_GAP,
  SC_OV_ABORT,
  SC_OV_RETURN_GAP,
];

describe("§3 every audited lesson is completable — its own shadow finishes every row, at every rung", () => {
  for (const spec of AUDITED) {
    it(`${spec.id}: the committed shadow completes all ${spec.success.length} success rows on every rung`, () => {
      const shadow = shadowOf(spec);
      expect(spec.success.length).toBeGreaterThan(0);
      for (const level of rungs(spec)) {
        const compiled = compileScenario(spec, level).objectives;
        expect(compiled.map((o) => o.id)).toEqual(spec.success.map((o) => o.id));
        for (const o of compiled) {
          expect(replay(parseObjectiveParams(o), shadow), `${spec.id}/${o.id} L${level}`).toBe(true);
        }
      }
    });
  }

  it("and the harness's own drive is the reason it saw otherwise — these drills are LATERAL", () => {
    // Stated as an assertion about the TEMPLATES rather than about the harness,
    // because that is what this file can see: each row below sits a full lane
    // pitch or more off the lane the student spawns in, so no drive that never
    // steers can reach it — whatever the templates say. If a future edit
    // flattens one of these into a straight-ahead drill, this goes red and the
    // sweep's „unpassable" verdicts must be re-read rather than re-explained.
    //
    // The spawn-lane x of each is the district truth the template already pins
    // by value (the L7 copy convention): ov-oneway approach 4.06 · ov-bus right
    // 12.19 · ov-oncoming own 4.06 · ov-ban right 12.19.
    const lateralDrills: ReadonlyArray<readonly [ScenarioSpec, string, number, number]> = [
      [SC_OV_ONEWAY, "sc-ovow-entry", 4.06, 50], // the legal entry is 56 m EAST
      [SC_OV_BUS_LANE, "sc-ovbus-general", 12.19, 8],
      [SC_OV_ONCOMING_GAP, "sc-ovg-pass", 4.06, 8],
      [SC_OV_ABORT, "sc-ova-pullout", 4.06, 8],
      [SC_OV_RETURN_GAP, "sc-ovr-pass", 4.06, 8],
      [SC_OV_BAN_OVERTAKE, "sc-ovb-pass", 12.19, 8],
    ];
    for (const [spec, objectiveId, spawnLaneX, minOffsetM] of lateralDrills) {
      const p = compiledZone(spec, objectiveId, 1);
      expect(
        Math.abs(p.x - spawnLaneX),
        `${spec.id}/${objectiveId} no longer demands a lateral move`,
      ).toBeGreaterThanOrEqual(minOffsetM);
    }
    // sc-ov-narrow is the seventh and is not a lane-x case: the parked row
    // stands IN the player's lane over y ∈ [110, 145] (NARROW_MEETING props),
    // so passing it is a swerve into the oncoming half and back. The drill is
    // pinned by the staged event rather than by a coordinate.
    const meeting = SC_OV_NARROW.staged?.find((s) => s.kind === "narrowMeeting");
    expect(meeting, "sc-ov-narrow lost its narrow meeting").toBeDefined();
    if (meeting?.kind !== "narrowMeeting") return;
    expect(meeting.obstructionSide).toBe("player");
    expect(meeting.props?.length ?? 0).toBeGreaterThan(0);
  });
});
