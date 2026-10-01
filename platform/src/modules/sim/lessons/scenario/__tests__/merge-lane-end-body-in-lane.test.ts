/**
 * sc-merge-lane-end:0487bcec, ROUND 2 — A STUDENT WHOSE BODY IS IN THE THROUGH
 * LANE IS NEVER STRUCK FROM BEHIND BY THE STAGED CAR, AND L5 NO LONGER PARKS A
 * CAR ON THE PATH INSTRUCTION 2 SENDS HIM DOWN.
 *
 * Round 1 (merge-lane-end-rear-strike.test.ts, orchestrator/__tests__/
 * tailgater-pass-guard.test.ts) stopped the лепка's pass from cruising through
 * a student who had merged early. Its adversarial verifier then showed what a
 * FIXED 3 m „is he in my lane" corridor still let through on an 8.125 m lane:
 *
 *   V5   a student riding 3.2 m off the through lane's centre — inside it — was
 *        overtaken inside his own lane at 50 км/ч with 1.43 m of clearance;
 *   V17  a normal zip merge begun 11–18 m ahead of the glued car at matched
 *   V18  speed, crossing at 1–2 m/s, was struck from behind and billed −10: his
 *        centre was inside the lane for 0.5–1 s before the pass counted him;
 *   F7   at L5 the second through car stood STILL at y 44 in the through lane
 *        until the student was 8 m past it — so a student who merged early, as
 *        instruction 2 says, drove into it (1 COLLISION at every pace), and one
 *        careful enough to stop behind it waited for ever.
 *
 * Round 2 measures „in the lane" as the lane the product drew plus his own
 * half-width (sim/collision playerOverLaneReachM, fed by the lane width the
 * traffic system publishes), and holds the L5 car behind the first one.
 *
 * WHAT IS REAL. The committed district through the production
 * createWorldRuntime + createTrafficSystem + createScenarioDirector with the
 * lesson's own compiled stagedEvents, and the production rule engine folding
 * every tick. The student is kinematic (the hero's 1.95 m/s² ramp, a lane
 * change glides at a stated lateral rate), and the physics contact is modelled
 * the way the product reports it: rapier's onCollisionEnter on the rising edge
 * of `isContact(playerObb, actorObb)`, pushed as `runtime.pushCollision
 * ("vehicle")` — what LessonScene.handleCollision pushes for a body outside the
 * sentinel's cast — before the frame's sample().
 *
 * „STRUCK FROM BEHIND" means: a touch from a car that, on the frame his body
 * went over the through lane, was behind him with room to stop (its nose short
 * of his tail by more than it needed to stop from its closing speed at the
 * guard's 8 m/s²), and whose centre is still behind his when it touches. What
 * that leaves out is the student steering across into a car already alongside
 * him, or across its bonnet inside its stopping distance — as in the 12 км/ч
 * roadworks cut at y 60, entered with the car's nose 1.14 m off his tail and
 * closing at 32 км/ч (it needed ~5 m) — which is the lesson's own push-out,
 * whose billing is a founder ruling and is deliberately not decided here. V5,
 * V17 and V18 are held to the stricter bar: NO contact at all.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { LANE_WIDTH_M } from "../../../world";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../../rules";
import { createScenarioDirector } from "../../../orchestrator/director";
import { actorObb, isContact, obbSeparationM, playerObb, PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision";
import type { RearTailgaterSpec, StagedEventSpec } from "../../../contracts";
import { compileScenario } from "../compile";
import type { ScenarioLevel, ScenarioSpec } from "../types";
import { SC_MERGE_LANE_END, SC_MERGE_ROADWORKS_SHIFT } from "../templates-merging";

const REPO_ROOT = join(process.cwd(), "..");
const DT = 1 / 30;
/** Lane centres on ln-merge-v1 and hz-roadworks-v1 (one oneway 2-lane edge on
 *  x = 0, drawn lanes 8.125 m): laneId 0 dies / is coned off, laneId 1 lives. */
const X_ENDING = 4.0625;
const X_THROUGH = -4.0625;
/** A lane change of one pitch in 2 s — the round-1 battery's default. */
const DEFAULT_GLIDE_MPS = 8.125 / 2;
/** The pass guard's brake (traffic/staged.ts HOLD_DECEL_MPS2 — the weaker of the
 *  two brakes the repair uses; the station law's is the tailgater's 12 m/s²). */
const GUARD_BRAKE_MPS2 = 8;

interface CarView {
  id: string;
  x: number;
  y: number;
  speedMps: number;
}
interface Ctl {
  x: number;
  v: number;
  brake?: number;
  glide?: number;
}
type Controller = (s: { t: number; x: number; y: number; v: number; cars: CarView[] }) => Ctl;

interface Contact {
  t: number;
  id: string;
  /** The car's centre is behind his along the road at the touch. */
  carBehind: boolean;
  /** Metres of road between the car's nose and his tail on the frame his body
   *  last went over the through lane (> 0 = the car was wholly behind him when
   *  he entered; ≤ 0 = he steered in beside a car already alongside him). */
  noseToTailAtEntryM: number;
  /** …and the road the car needed to stop from its closing speed on that frame
   *  at the pass guard's own brake (8 m/s², staged.ts HOLD_DECEL_MPS2). */
  stopNeededAtEntryM: number;
  py: number;
  ay: number;
}
interface Drive {
  contacts: Contact[];
  bills: RuleEvent[];
  /** LANE_ENTRY_FORCED_BRAKING (round 4) */
  forced: RuleEvent[];
  outcomes: { id: string; detail: string; t: number }[];
  finalY: number;
  /** Longest standstill, s. */
  maxStandSec: number;
  /** Tightest separation between two STAGED bodies (L5 has two). */
  carCarMinM: number;
  /** Tightest car-centre-minus-his (> 0 = a car drew level or passed) while his
   *  body was over the through lane, per car. */
  levelWhileInLaneM: Record<string, number>;
  /** Did some car come up behind him within its glued reach while he was in the through lane? */
  exposed: boolean;
  spawnY: number;
}

function districtOf(spec: ScenarioSpec): TrafficDistrict {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, "content", "world", `${spec.map.districtId}.json`), "utf-8"),
  ) as TrafficDistrict;
}

function spawnY(spec: ScenarioSpec): number {
  const d = districtOf(spec) as TrafficDistrict & { spawnPoints: { id: string; y: number }[] };
  const sp = d.spawnPoints.find((p) => p.id === spec.start.spawnPointId);
  if (!sp) throw new Error(`${spec.id}: spawn point ${spec.start.spawnPointId} is gone`);
  return sp.y;
}

/** His body is over the through lane: his centre within half a lane + his half-width of its centre. */
function bodyOverThroughLane(x: number, laneWidthM: number, playerHalfWidthM: number): boolean {
  return Math.abs(x - X_THROUGH) < laneWidthM / 2 + playerHalfWidthM;
}

function drive(spec: ScenarioSpec, level: ScenarioLevel, ctl: Controller, seconds = 90, endY = 275): Drive {
  const staged = (compileScenario(spec, level).stagedEvents ?? []) as StagedEventSpec[];
  const cars = staged.filter((s): s is RearTailgaterSpec => s.kind === "rearTailgater");
  const raw = districtOf(spec);
  const runtime = createWorldRuntime(raw);
  const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const director = createScenarioDirector(staged, traffic, { seed: 7, signals: runtime });
  let rules = createRuleEngine();
  const y0 = spawnY(spec);
  const res: Drive = {
    contacts: [],
    bills: [],
    forced: [],
    outcomes: [],
    finalY: y0,
    maxStandSec: 0,
    carCarMinM: Infinity,
    levelWhileInLaneM: {},
    exposed: false,
    spawnY: y0,
  };
  const touching: Record<string, boolean> = {};
  const noseToTailAtEntry: Record<string, number> = {};
  const stopNeededAtEntry: Record<string, number> = {};
  let wasInLane = false;
  let t = 0;
  let x = X_ENDING;
  let y = y0;
  let v = 0;
  let stand = 0;
  for (let i = 0; i < seconds * 30 && y < endY; i++) {
    t += DT;
    const views: CarView[] = [];
    for (const c of cars) {
      const a = traffic.staged(c.id);
      if (a) views.push({ id: c.id, x: a.x, y: a.y, speedMps: a.speedMps });
    }
    const c = ctl({ t, x, y, v, cars: views });
    if (v < c.v) v = Math.min(c.v, v + 1.95 * DT);
    else if (v > c.v) v = Math.max(c.v, v - (c.brake ?? 8) * DT);
    const dy = v * DT;
    const glide = (c.glide ?? DEFAULT_GLIDE_MPS) * DT;
    const nx = Math.abs(c.x - x) <= glide ? c.x : x + Math.sign(c.x - x) * glide;
    const headingDeg = dy > 1e-6 ? (Math.atan2(nx - x, dy) * 180) / Math.PI : 0;
    x = nx;
    y += dy;
    stand = v < 0.1 ? stand + DT : 0;
    res.maxStandSec = Math.max(res.maxStandSec, stand);
    runtime.update(DT);
    traffic.update(DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x, y },
      playerSpeedKmh: v * 3.6,
      playerHeadingDeg: headingDeg,
    });
    // The lane the world builder DREW — measured independently of the code under test.
    const inLane = bodyOverThroughLane(x, LANE_WIDTH_M, PLAYER_HALF_WIDTH_M);
    if (inLane && !wasInLane) {
      for (const car of cars) {
        const a = traffic.staged(car.id);
        if (!a) continue;
        noseToTailAtEntry[car.id] = y - PLAYER_HALF_LENGTH_M - (a.y + actorObb(a, car.actor.profile).halfLengthM);
        const closing = Math.max(0, a.speedMps - v);
        stopNeededAtEntry[car.id] = (closing * closing) / (2 * GUARD_BRAKE_MPS2);
      }
    }
    wasInLane = inLane;
    for (const car of cars) {
      const a = traffic.staged(car.id);
      if (!a) continue;
      const sep = obbSeparationM(playerObb(x, y, headingDeg), actorObb(a, car.actor.profile));
      const now = isContact(sep);
      if (now && !touching[car.id]) {
        res.contacts.push({ t: Math.round(t * 100) / 100, id: car.id, carBehind: a.y < y, noseToTailAtEntryM: Math.round((noseToTailAtEntry[car.id] ?? Infinity) * 100) / 100, stopNeededAtEntryM: Math.round((stopNeededAtEntry[car.id] ?? 0) * 100) / 100, py: Math.round(y * 100) / 100, ay: Math.round(a.y * 100) / 100 });
        runtime.pushCollision("vehicle");
      }
      touching[car.id] = now;
      if (inLane) {
        res.levelWhileInLaneM[car.id] = Math.max(res.levelWhileInLaneM[car.id] ?? -Infinity, a.y - y);
        if (Math.abs(a.x - X_THROUGH) < 1 && y - a.y > 0 && y - a.y <= car.followBehindM + 4) res.exposed = true;
      }
    }
    for (let ci = 0; ci < cars.length; ci++) {
      for (let cj = ci + 1; cj < cars.length; cj++) {
        const a = traffic.staged(cars[ci].id);
        const b = traffic.staged(cars[cj].id);
        if (a && b) res.carCarMinM = Math.min(res.carCarMinM, obbSeparationM(actorObb(a, cars[ci].actor.profile), actorObb(b, cars[cj].actor.profile)));
      }
    }
    const tick = runtime.sample(
      { position: { x, y }, headingDeg, speedKmh: v * 3.6, indicator: "off", headlights: "off", seatbeltOn: true, handbrakeOn: false, gear: 3, mirrorGlance: null },
      t,
      false,
      false,
      Infinity,
    );
    const st = director.step({ tSec: t, dtSec: DT, x, y, speedKmh: v * 3.6, headingDeg, brakePedal: 0, tickEvents: tick.events });
    for (const o of st.outcomes) res.outcomes.push({ id: o.eventId, detail: o.detail, t });
    if (st.events.length > 0) tick.events.push(...st.events);
    const r = reduceTick(rules, tick);
    rules = r.state;
    for (const e of r.events) if (e.kind === "violation" && e.code === "COLLISION") res.bills.push(e);
    for (const e of r.events) if (e.kind === "violation" && e.code === "LANE_ENTRY_FORCED_BRAKING") res.forced.push(e);
    res.finalY = y;
  }
  return res;
}

const kmh = (k: number) => k / 3.6;
/** A touch from a car that was behind him with room to stop — its nose short of
 *  his tail by more than it needed to stop from its closing speed — on the
 *  frame his body went over the through lane, and whose centre is still
 *  behind his when it touches: the rear strike the row is about. A student who
 *  steers in beside a car already alongside him, or across its bonnet inside
 *  its stopping distance, is the push-out — recorded, not asserted, a founder
 *  ruling. */
const struckFromBehind = (d: Drive) =>
  d.contacts.filter((c) => c.carBehind && c.noseToTailAtEntryM > c.stopNeededAtEntryM);

// ---------------------------------------------------------------------------
// F3 — his body in the through lane
// ---------------------------------------------------------------------------

describe("V5 — riding the through lane OFF its centre: the car keeps behind him and never touches him", () => {
  // + = toward the dying lane. At +4.5 his centre is 0.44 m past the lane line
  // and 0.41 m of his body is still over the through lane.
  for (const off of [-4.0, -3.2, -2.5, 2.5, 3.2, 3.6, 4.0, 4.5]) {
    it(`${off > 0 ? "+" : ""}${off} m off the through-lane centre at 30 км/ч`, () => {
      const d = drive(SC_MERGE_LANE_END, 1, ({ y }) => ({ x: y > 20 ? X_THROUGH + off : X_ENDING, v: kmh(30) }));
      expect(d.finalY).toBeGreaterThan(260);
      expect(d.exposed, "the car never came up behind him in his lane — nothing was tested").toBe(true);
      expect(d.contacts).toEqual([]);
      expect(d.bills).toEqual([]);
      // Round 1: at ±3.2 and beyond the pass overtook him INSIDE his lane.
      expect(d.levelWhileInLaneM["sc-mle-through-car"], "the car drew level with him inside his own lane").toBeLessThan(0);
    });
  }
});

/** The verifier's V17 controller: hold the dying lane at `k` км/ч until the
 *  car has been glued 11–18 m behind at matched speed for `hold` s, then merge
 *  AHEAD of it at `glide` m/s lateral. */
function mergeAheadOfGluedCar(k: number, glide: number, hold: number) {
  let gluedSince: number | null = null;
  const st = { cut: false };
  const ctl: Controller = ({ t, y, v, cars }) => {
    const a = cars[0];
    if (!st.cut && a && Math.abs(a.speedMps - v) < 1 && y - a.y > 11 && y - a.y < 18 && y > 30) {
      if (gluedSince === null) gluedSince = t;
    } else if (!st.cut) gluedSince = null;
    if (!st.cut && gluedSince !== null && t - gluedSince >= hold) st.cut = true;
    return { x: st.cut ? X_THROUGH : X_ENDING, v: kmh(k), glide };
  };
  return { ctl, st };
}

describe("V17/V18 — a zip merge begun AHEAD of the glued car at matched speed is never touched", () => {
  it("V18: the four verifier timelines (20/2.0/1.0, 25/2.0/1.0, 30/1.5/1.0, 35/1.0/0)", () => {
    for (const [k, g, h] of [[20, 2.0, 1.0], [25, 2.0, 1.0], [30, 1.5, 1.0], [35, 1.0, 0]] as const) {
      const m = mergeAheadOfGluedCar(k, g, h);
      const d = drive(SC_MERGE_LANE_END, 1, m.ctl);
      expect(m.st.cut, `k${k} g${g} h${h}: never glued, never merged`).toBe(true);
      expect(d.contacts, `k${k} g${g} h${h}`).toEqual([]);
      expect(d.bills, `k${k} g${g} h${h}`).toEqual([]);
    }
  });

  it("V17: 6 paces × 6 lateral rates × 4 holds — zero contacts, zero COLLISION", () => {
    const bad: string[] = [];
    let merged = 0;
    for (const k of [20, 25, 30, 35, 40, 45]) {
      for (const g of [1.0, 1.5, 2.0, 2.5, 3.0, 4.0625]) {
        for (const h of [0, 0.5, 1.0, 1.5]) {
          const m = mergeAheadOfGluedCar(k, g, h);
          const d = drive(SC_MERGE_LANE_END, 1, m.ctl);
          if (m.st.cut) merged++;
          if (d.contacts.length || d.bills.length) bad.push(`k${k} g${g} h${h}: ${JSON.stringify(d.contacts)}`);
        }
      }
    }
    // 108 of the 144 glue-and-merge (at 45 км/ч and some slow glides the car never
    // settles 11–18 m behind at matched speed, so there is no merge to make).
    expect(merged, "most drives never merged — the grid measured nothing").toBeGreaterThanOrEqual(100);
    expect(bad).toEqual([]);
  });
});

describe("lateral-rate sweep — an early merge at any lateral rate is never struck from behind", () => {
  // Both lessons that stage a through-lane лепка passing in its own lane. The
  // merge starts at a fixed y whatever the car is doing, so some drives steer
  // into a car that has ALREADY drawn level — that is the push-out, recorded
  // and not asserted; what is asserted is that no contact ever comes from a
  // car whose centre is behind his.
  for (const spec of [SC_MERGE_LANE_END, SC_MERGE_ROADWORKS_SHIFT]) {
    it(`${spec.id}: 5 paces × 5 merge points × 6 lateral rates`, () => {
      const rear: string[] = [];
      let drives = 0;
      for (const k of [12, 20, 30, 40, 50]) {
        for (const y0 of [20, 40, 60, 90, 130]) {
          for (const g of [0.5, 1, 1.5, 2, 3, 4.0625]) {
            const d = drive(spec, 1, ({ y }) => ({ x: y > y0 ? X_THROUGH : X_ENDING, v: kmh(k), glide: g }));
            drives++;
            expect(d.finalY).toBeGreaterThan(260);
            for (const c of struckFromBehind(d)) rear.push(`k${k} y0 ${y0} g${g}: ${JSON.stringify(c)}`);
          }
        }
      }
      expect(drives).toBe(150);
      expect(rear).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// F7 — L5's second through car
// ---------------------------------------------------------------------------

describe("L5 (F7) — the second through car no longer stands on the early-merge path", () => {
  it("both through cars are held BEHIND the student's spawn", () => {
    const staged = (compileScenario(SC_MERGE_LANE_END, 5).stagedEvents ?? []) as StagedEventSpec[];
    const cars = staged.filter((s): s is RearTailgaterSpec => s.kind === "rearTailgater");
    expect(cars.map((c) => c.id)).toEqual(["sc-mle-through-car", "sc-mle-through-car-2"]);
    const tr = createTrafficSystem(districtOf(SC_MERGE_LANE_END), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    const y0 = spawnY(SC_MERGE_LANE_END);
    for (const c of cars) {
      const v = tr.stage({ kind: "vehicle", id: c.id, pathNodes: c.actor.pathNodes, hold: c.actor.hold, cruiseSpeedMps: 1, extraRightOffsetM: c.actor.extraRightOffsetM })!;
      expect(v.y, `${c.id} stands at y ${v.y.toFixed(1)}, ahead of the spawn at ${y0}`).toBeLessThan(y0);
    }
  });

  for (const k of [20, 30, 40, 50]) {
    it(`an early merge (instruction 2) at ${k} км/ч meets neither car`, () => {
      const d = drive(SC_MERGE_LANE_END, 5, ({ y }) => ({ x: y > 20 ? X_THROUGH : X_ENDING, v: kmh(k) }));
      expect(d.finalY).toBeGreaterThan(260);
      expect(d.contacts).toEqual([]);
      expect(d.bills).toEqual([]);
    });
  }

  it("a careful early merger who stops behind any car standing in the through lane is never left waiting", () => {
    const d = drive(SC_MERGE_LANE_END, 5, ({ y, cars }) => {
      const standingAhead = cars.filter((c) => c.speedMps < 0.5 && c.y > y && Math.abs(c.x - X_THROUGH) < 1);
      const stopY = standingAhead.length ? Math.min(...standingAhead.map((c) => c.y)) - 10 : Infinity;
      return { x: y > 20 ? X_THROUGH : X_ENDING, v: y < stopY - 8 ? kmh(30) : 0, brake: 4 };
    });
    expect(d.maxStandSec, "he stood behind a parked through car").toBeLessThan(1);
    expect(d.finalY).toBeGreaterThan(260);
    expect(d.contacts).toEqual([]);
  });

  for (const k of [20, 30]) {
    it(`what L5 teaches is kept: holding the dying lane at ${k} км/ч, the cars come up as a pair, first car first, never overlap each other, and his merge at y 200 meets neither`, () => {
      // ROUND 4 (F5): car 2 is released later, so the пролука behind car 1 is a
      // real one (instruction 4). Holding the lane to y 200 at 20 км/ч both
      // cars are past him before he moves; at 30 км/ч car 2 is still ~25 m
      // behind him when he merges, which is a lawful merge in front of it — so
      // this asserts the order, the spacing and that nobody is struck or
      // billed, not that car 2 always finishes its pass first.
      const d = drive(SC_MERGE_LANE_END, 5, ({ y }) => ({ x: y > 200 ? X_THROUGH : X_ENDING, v: kmh(k) }));
      expect(d.contacts).toEqual([]);
      expect(d.bills).toEqual([]);
      expect(d.forced).toEqual([]);
      const clear1 = d.outcomes.find((o) => o.id === "sc-mle-through-car" && o.detail === "clear");
      const clear2 = d.outcomes.find((o) => o.id === "sc-mle-through-car-2" && o.detail === "clear");
      expect(clear1, JSON.stringify(d.outcomes)).toBeDefined();
      if (clear2) expect(clear1!.t).toBeLessThan(clear2.t);
      if (k <= 20) expect(clear2, JSON.stringify(d.outcomes)).toBeDefined();
      expect(d.carCarMinM, "the two staged cars drove through each other").toBeGreaterThan(0);
    });
  }
});
