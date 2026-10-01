/**
 * THE ЛЕПКА'S PASS IS GUARDED; ITS GLUED POSE KEEPS ITS EXEMPTION
 * (sc-merge-lane-end:0487bcec, 2026-09-29).
 *
 * `RearTailgaterRunner` stages its actor `playerGuard: false` so the glued pose
 * may sit sub-6 m behind the student. Until this repair that exemption covered
 * the PASS too — `cruise passSpeedMps`, a fixed speed with no gap law — and a
 * pass whose lane the student was in drove through him. The repair has two
 * halves and this file pins each one on the production runner + the production
 * staged-traffic layer (`createTrafficSystem` on committed districts, ambient
 * zeroed), with only the student synthetic:
 *
 *   A. STAGED LAYER — `passGuard`: the player guard measured in the lane the
 *      actor is heading TO. Armed, it stops short of a student in that lane;
 *      it does NOT brake an overtaker going round a student in his own lane;
 *      and `reset` disarms it (a retry's glued pose is exempt again).
 *   B. RUNNER, passShiftM ≠ 0 — the overtaker's choreography is unchanged for
 *      a student who stays in his lane, and a student who moves INTO the lane
 *      the pass is heading for is not driven into.
 *   C. RUNNER, passShiftM 0 — while the student is ahead in the actor's lane
 *      the pass keeps STATION at followBehindM (the glued law, guard off), and
 *      resumes the pass — and resolves — the moment he leaves that lane.
 *   D. RUNNER, passShiftM 0 — a student who merges in BEHIND the passing car
 *      is not brake-checked by it (the degrade is for a student AHEAD only).
 *
 * WATCHED RED ON THE PRE-REPAIR RUNNER: A1, B2, C1, C2 (the pass drives through
 * the student, and C2 "resolves" by driving through him before he leaves).
 * A2, A3, B1 and D pin the other direction — what the repair
 * must not change or break — and are green on both.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RearTailgaterSpec, StagedEventSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import { actorObb, isContact, obbSeparationM, playerObb, PLAYER_HALF_WIDTH_M } from "../../collision";
import { createTrafficSystem } from "../../traffic/system";
import type { StagedCommand, StagedVehicleSpec, TrafficDistrict, TrafficSystem } from "../../traffic/types";
import { RearTailgaterRunner } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";
import { SC_FOLLOW_TAILGATER } from "../../lessons/scenario/templates-following";
import { SC_LN_DECISIVE_CHANGE } from "../../lessons/scenario/templates-lanes3";
import { SC_MERGE_LANE_END } from "../../lessons/scenario/templates-merging";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { LANE_WIDTH_M } from "../../world";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const DT = 1 / 30;

function district(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

function tailgaterOf(spec: { staged?: readonly unknown[] }, id: string): RearTailgaterSpec {
  const s = (spec.staged ?? []).find(
    (x): x is RearTailgaterSpec => (x as RearTailgaterSpec).kind === "rearTailgater" && (x as RearTailgaterSpec).id === id,
  );
  if (!s) throw new Error(`${id} is not staged any more`);
  return s;
}

/** ln-v1 lanes (meta.scenario, re-pinned — templates-lanes3.ts). */
const LN_RIGHT = 12.19;
const LN_LEFT = 4.06;
const LN_SPAWN_Y = 15;
/** ln-merge-v1 lanes (templates-merging.ts). */
const LNM_ENDING = 4.06;
const LNM_THROUGH = -4.06;
const LNM_SPAWN_Y = 12;

interface Frame {
  t: number;
  px: number;
  py: number;
  ax: number;
  ay: number;
  aSpeed: number;
  aLat: number;
  aIndicator: string;
  /** Actor centre behind the student along +y (the road's direction), m. */
  behindM: number;
}

interface Run {
  frames: Frame[];
  contactStarts: number[];
  resolvedAt: number | null;
}

/**
 * A kinematic student at a steady pace, northbound, whose lane is chosen per
 * frame by `laneX(ctx)`; a lane change glides one lane pitch in 2 s (one smooth
 * movement), never teleports.
 */
function drive(opts: {
  districtId: string;
  spec: RearTailgaterSpec;
  startX: number;
  startY: number;
  kmh: number;
  seconds: number;
  laneX: (ctx: { t: number; py: number; actor: { x: number; y: number; speedMps: number; indicator?: string } | null }) => number;
}): Run {
  const tr = createTrafficSystem(district(opts.districtId), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const runner = new RearTailgaterRunner(opts.spec);
  runner.stage(tr, () => 0.5, true); // zero jitter: every run replays bit-identically
  const v = opts.kmh / 3.6;
  let px = opts.startX;
  let py = opts.startY;
  let t = 0;
  let touching = false;
  const out: SimTickEvent[] = [];
  const res: Run = { frames: [], contactStarts: [], resolvedAt: null };
  for (let i = 0; i < Math.round(opts.seconds / DT); i++) {
    t += DT;
    py += v * DT;
    const a0 = tr.staged(opts.spec.id);
    const want = opts.laneX({ t, py, actor: a0 ? { x: a0.x, y: a0.y, speedMps: a0.speedMps, indicator: a0.indicator } : null });
    const glide = (8.13 / 2) * DT;
    const nx = Math.abs(want - px) <= glide ? want : px + Math.sign(want - px) * glide;
    const headingDeg = (Math.atan2(nx - px, v * DT) * 180) / Math.PI;
    px = nx;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: px, y: py },
      playerSpeedKmh: opts.kmh,
      playerHeadingDeg: headingDeg,
    });
    const input: DirectorInput = {
      tSec: t,
      dtSec: DT,
      x: px,
      y: py,
      speedKmh: opts.kmh,
      headingDeg,
      brakePedal: 0,
      tickEvents: [],
    };
    const o = runner.step(tr, input, out);
    if (o && res.resolvedAt === null) res.resolvedAt = t;
    const a = tr.staged(opts.spec.id);
    if (!a) continue;
    const now = isContact(obbSeparationM(playerObb(px, py, headingDeg), actorObb(a, opts.spec.actor.profile)));
    if (now && !touching) res.contactStarts.push(Math.round(t * 100) / 100);
    touching = now;
    res.frames.push({
      t,
      px,
      py,
      ax: a.x,
      ay: a.y,
      aSpeed: a.speedMps,
      aLat: a.lateralOffsetM ?? 0,
      aIndicator: a.indicator ?? "off",
      behindM: py - a.y,
    });
  }
  return res;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// ---------------------------------------------------------------------------
// A. The staged layer's pass guard
// ---------------------------------------------------------------------------

/** A bare unguarded actor on ln-v1's LEFT lane — the лепка's staging, minus the runner. */
const BARE: StagedVehicleSpec = {
  kind: "vehicle",
  id: "pg-bare",
  pathNodes: ["ln-n-start", "ln-n-end"],
  hold: { nodeIndex: 0, offsetM: 0 },
  cruiseSpeedMps: 12,
  extraRightOffsetM: LN_LEFT - LN_RIGHT,
  accelMps2: 3.5,
  decelMps2: 12,
  playerGuard: false,
};

/** Closest centre approach of the bare actor, cruising at 12 m/s, to a student
 *  STANDING at (standX, 60). */
function bareApproach(tr: TrafficSystem, standX: number, seconds = 12): number {
  let closest = Infinity;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: standX, y: 60 },
      playerSpeedKmh: 0,
      playerHeadingDeg: 0,
    });
    const a = tr.staged(BARE.id)!;
    closest = Math.min(closest, Math.hypot(a.x - standX, a.y - 60));
  }
  return closest;
}

describe("A — StagedCommand passGuard (traffic/staged.ts)", () => {
  it("A1 armed, it stops the unguarded actor short of a student standing in its lane", () => {
    const tr = createTrafficSystem(district("ln-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    tr.stage(BARE);
    tr.stagedCommand(BARE.id, { type: "passGuard", on: true });
    tr.stagedCommand(BARE.id, { type: "cruise" });
    // The guard aims 6 m short of his centre (GUARD_STOP_SHORT_M): a body
    // length of air, never a touch.
    expect(bareApproach(tr, LN_LEFT)).toBeGreaterThan(5);
  });

  it("A2 it guards the lane the actor is GOING TO: a student in the lane it glides out of is not braked for", () => {
    const tr = createTrafficSystem(district("ln-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    tr.stage(BARE);
    tr.stagedCommand(BARE.id, { type: "passGuard", on: true });
    tr.stagedCommand(BARE.id, { type: "cruise" });
    // Shift RIGHT one lane immediately — the student stands in the LEFT lane,
    // the lane the actor is leaving, so the pass goes round him.
    tr.stagedCommand(BARE.id, { type: "laneShift", toOffsetM: LN_RIGHT - LN_LEFT, rampSec: 1.5 });
    let minSpeedAfterLaunch = Infinity;
    for (let i = 0; i < Math.round(10 / DT); i++) {
      tr.update(DT, {
        signalPhase: () => "green",
        playerPos: { x: LN_LEFT, y: 20 },
        playerSpeedKmh: 0,
        playerHeadingDeg: 0,
      });
      const a = tr.staged(BARE.id)!;
      if (a.speedMps > 1) minSpeedAfterLaunch = Math.min(minSpeedAfterLaunch, a.speedMps);
      if (a.y > 60) break;
    }
    // Launched and never braked: had the guard read the CURRENT lane it would
    // have held the actor 6 m short of him in the lane it was leaving.
    expect(tr.staged(BARE.id)!.y).toBeGreaterThan(60);
    expect(minSpeedAfterLaunch).toBeGreaterThan(1);
  });

  it("A3 reset disarms it — a retry's glued pose is exempt again", () => {
    const tr = createTrafficSystem(district("ln-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    tr.stage(BARE);
    tr.stagedCommand(BARE.id, { type: "passGuard", on: true });
    tr.stagedCommand(BARE.id, { type: "reset" });
    tr.stagedCommand(BARE.id, { type: "cruise" });
    // Disarmed = the spec's own playerGuard:false, i.e. the historical
    // behaviour: nothing holds it off him (it passes his centre).
    expect(bareApproach(tr, LN_LEFT)).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// B. passShiftM ≠ 0 — sc-follow-tailgater's лепка (pass one lane LEFT)
// ---------------------------------------------------------------------------

describe("B — an overtaker (passShiftM ≠ 0): sc-follow-tailgater", () => {
  const FTG = tailgaterOf(SC_FOLLOW_TAILGATER, "sc-ftg-tail");

  it("census: it still passes one lane over", () => {
    expect(FTG.passShiftM).toBeLessThan(0);
  });

  it("B1 a student who keeps his lane: the pass launches without braking, goes round him, and resolves", () => {
    const r = drive({
      districtId: "ln-v1",
      spec: FTG,
      startX: LN_RIGHT,
      startY: LN_SPAWN_Y,
      kmh: 30,
      seconds: 60,
      laneX: () => LN_RIGHT,
    });
    expect(r.contactStarts).toEqual([]);
    expect(r.resolvedAt, "the overtake never completed").not.toBeNull();
    // THE CHOREOGRAPHY IS THE PRE-REPAIR ONE: the pass launches at the
    // tailgater's full acceleration (3.5 m/s² ⇒ ~0.117 m/s per frame) on the
    // very update the cruise command lands — which is also the first frame of
    // the glide — and keeps accelerating every frame until it reaches its pass
    // speed. Measured from the LAST frame BEFORE the glide, because that update
    // is where a guard reading the actor's CURRENT lane would bite (the student
    // is dead ahead at followBehindM, and from the next frame on the published
    // heading already tilts into the glide), and where a station-keeping pass
    // would hold the student's speed instead of accelerating.
    const firstGlide = r.frames.findIndex((f) => Math.abs(f.aLat) > 0.01);
    expect(firstGlide).toBeGreaterThan(0);
    const launch = r.frames.slice(firstGlide - 1).filter((f) => f.t <= r.resolvedAt!);
    const reachesPace = launch.findIndex((f) => f.aSpeed >= FTG.passSpeedMps - 0.2);
    expect(reachesPace, "the overtaker never reached its pass speed").toBeGreaterThan(10);
    for (let i = 1; i <= reachesPace; i++) {
      expect(
        launch[i].aSpeed - launch[i - 1].aSpeed,
        `the overtaker did not accelerate at t = ${launch[i].t.toFixed(2)} (${launch[i - 1].aSpeed.toFixed(3)} → ${launch[i].aSpeed.toFixed(3)} m/s)`,
      ).toBeGreaterThan(0.05);
    }
    for (let i = reachesPace + 1; i < launch.length; i++) {
      expect(launch[i].aSpeed, `the overtaker braked at t = ${launch[i].t.toFixed(2)}`).toBeGreaterThanOrEqual(launch[i - 1].aSpeed - 1e-9);
    }
    expect(Math.min(...launch.map((f) => f.aLat))).toBeCloseTo(FTG.passShiftM, 1);
  });

  it("B2 a student who moves INTO the lane the pass is heading for is not driven into", () => {
    const r = drive({
      districtId: "ln-v1",
      spec: FTG,
      startX: LN_RIGHT,
      startY: LN_SPAWN_Y,
      kmh: 30,
      seconds: 60,
      // The moment the лепка's blinker comes on (INDICATOR_LEAD_SEC before the
      // pass) he moves left himself — into the lane it is about to pass in.
      laneX: (() => {
        let moved = false;
        return ({ actor }) => {
          if (actor && actor.indicator === "left") moved = true;
          return moved ? LN_LEFT : LN_RIGHT;
        };
      })(),
    });
    expect(r.frames.some((f) => f.aIndicator === "left"), "the pass never began").toBe(true);
    expect(r.contactStarts, `the pass drove into him at t = ${r.contactStarts.join(", ")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C. passShiftM 0 — sc-ln-decisive-change's target car (stays in the LEFT lane)
// ---------------------------------------------------------------------------

describe("C — a pass in its own lane (passShiftM 0): sc-ln-decisive-change", () => {
  const LNDC = tailgaterOf(SC_LN_DECISIVE_CHANGE, "sc-lndc-target");
  /** He changes back to the right lane here, s. */
  const LEAVE_AT = 25;

  const r = drive({
    districtId: "ln-v1",
    spec: LNDC,
    startX: LN_LEFT, // IN the target car's lane from the start
    startY: LN_SPAWN_Y,
    kmh: 30,
    seconds: 45,
    laneX: ({ t }) => (t < LEAVE_AT ? LN_LEFT : LN_RIGHT),
  });

  it("census: its pass stays in its own lane", () => {
    expect(LNDC.passShiftM).toBe(0);
  });

  it("C1 while he is ahead in its lane it keeps STATION at followBehindM — never through him", () => {
    expect(r.contactStarts, `contact at t = ${r.contactStarts.join(", ")}`).toEqual([]);
    // The window after the glue + pressure (release ≈ 0.6 s, glued by ~8 s,
    // pass due ~3 s later) and before he leaves. followBehindM is jitter-free
    // at rng 0.5, so the glued law's fixed point is followBehindM exactly; the
    // guard's own fixed point (6 + v/0.8 ≈ 16.4 m at 30 км/ч) is what an armed
    // guard or a cruising pass would sit at instead.
    const station = r.frames.filter((f) => f.t > 16 && f.t < LEAVE_AT - 0.5).map((f) => f.behindM);
    expect(station.length).toBeGreaterThan(100);
    expect(Math.abs(median(station) - LNDC.followBehindM)).toBeLessThan(1.0);
    expect(Math.min(...station)).toBeGreaterThan(LNDC.followBehindM - 1.5);
  });

  it("C2 …and the moment he leaves its lane the pass resumes and resolves", () => {
    expect(r.resolvedAt, "the pass never resumed after he left the lane").not.toBeNull();
    expect(r.resolvedAt!).toBeGreaterThan(LEAVE_AT);
    const after = r.frames.filter((f) => f.t > LEAVE_AT + 2.5);
    expect(Math.max(...after.map((f) => f.aSpeed))).toBeCloseTo(LNDC.passSpeedMps, 1);
  });
});

// ---------------------------------------------------------------------------
// D. passShiftM 0 — the student merges in BEHIND the passing car
// ---------------------------------------------------------------------------

describe("D — sc-merge-lane-end: merging in behind the passing лепка is not answered with a brake", () => {
  const LNM = tailgaterOf(SC_MERGE_LANE_END, "sc-mle-through-car");

  it("D1 the pass carries on at its own pace, resolves, and never touches him", () => {
    let mergeFrom: number | null = null;
    const r = drive({
      districtId: "ln-merge-v1",
      spec: LNM,
      startX: LNM_ENDING,
      startY: LNM_SPAWN_Y,
      kmh: 30,
      seconds: 40,
      // Stay in the dying lane until the лепка's centre is 8 m past his, then
      // merge in behind it — before its pass has resolved (passAheadM 24).
      laneX: ({ t, py, actor }) => {
        if (mergeFrom === null && actor && actor.y - py >= 8) mergeFrom = t;
        return mergeFrom === null ? LNM_ENDING : LNM_THROUGH;
      },
    });
    expect(mergeFrom, "the лепка never got past him to merge behind").not.toBeNull();
    expect(r.resolvedAt).not.toBeNull();
    expect(r.resolvedAt!, "the pass had resolved before he merged — D measures nothing").toBeGreaterThan(mergeFrom!);
    expect(r.contactStarts).toEqual([]);
    const during = r.frames.filter((f) => f.t >= mergeFrom! && f.t <= r.resolvedAt!);
    for (let i = 1; i < during.length; i++) {
      expect(during[i].aSpeed, `the лепка braked in front of him at t = ${during[i].t.toFixed(2)}`).toBeGreaterThanOrEqual(during[i - 1].aSpeed - 1e-9);
    }
  });
});

// ---------------------------------------------------------------------------
// ROUND 2 (verifier F1/F2/F3): „in the lane" is the lane the product BUILT
// ---------------------------------------------------------------------------
//
// Round 1 measured „he is in my lane" as a fixed 3 m from the actor's line, in
// both the staged pass guard and the runner's station law. The through lane on
// ln-merge-v1 is 8.125 m wide, so a student riding 3.2 m off its centre —
// inside it — was overtaken inside his own lane, and one half-way through an
// early merge was struck (verifier V5/V17/V18). And nothing pinned either
// boundary: moving the runner's width to 1.0 m (N5) or its „ahead" to > 8 m
// (N6) changed contact and billing and every test stayed green.
//
// Every boundary below is stated against the WORLD, never against a constant
// in the code under test: the lane line is read off the committed district,
// the actor's line off the live staged actor, the student's half-width off the
// rapier chassis (sim/collision PLAYER_HALF_WIDTH_M). „In the lane" = some of
// his body is over the lane line.

/** ln-merge-v1 is ONE oneway 2-lane edge; the line between its two lanes is
 *  the edge's own centreline. */
function lnMergeLaneLineX(): number {
  const e = district("ln-merge-v1").roads.edges;
  expect(e.length).toBe(1);
  expect(e[0].lanes).toBe(2);
  expect(e[0].oneway).toBe(true);
  return e[0].geometry[0][0];
}

/** Where the bare pass-guarded actor (BARE, 12 m/s) ends up after 12 s against
 *  a student STANDING at (standX, 60), and whether it ever braked once moving. */
function bareAgainst(tr: TrafficSystem, id: string, standX: number): { finalY: number; braked: boolean } {
  let braked = false;
  let last = 0;
  for (let i = 0; i < Math.round(12 / DT); i++) {
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: standX, y: 60 },
      playerSpeedKmh: 0,
      playerHeadingDeg: 0,
    });
    const a = tr.staged(id)!;
    if (a.speedMps < last - 1e-9 && last > 1) braked = true;
    last = a.speedMps;
  }
  return { finalY: tr.staged(id)!.y, braked };
}

/** ln-v1 is ONE two-way 4-lane edge on x = 0; its northbound lanes are the
 *  two right of it, and the line between them is one drawn lane right of the
 *  centreline. Read off the district, not re-typed. */
function lnV1NorthLaneLineX(laneWidthM: number): number {
  const e = district("ln-v1").roads.edges;
  expect(e.length).toBe(1);
  expect(e[0].lanes).toBe(4);
  expect(e[0].oneway).toBe(false);
  return e[0].geometry[0][0] + laneWidthM;
}

describe("A (round 2) — the pass guard brakes for his CENTRE in the lane the pass is heading for", () => {
  /** A pass-guarded bare actor on ln-v1's left northbound lane (a system built
   *  with `laneWidthM`), cruising; the student stands `fromLine` m right of
   *  the drawn line between the northbound lanes (negative = over it, INTO
   *  the actor's lane). */
  function guardRun(fromLine: number, laneWidthM = LANE_WIDTH_M) {
    const tr = createTrafficSystem(district("ln-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0, laneWidthM });
    // One drawn lane LEFT of the graph's curb lane, whatever width it was drawn.
    const spec: StagedVehicleSpec = { ...BARE, id: `pg-bare-${laneWidthM}`, extraRightOffsetM: -laneWidthM };
    const view = tr.stage(spec)!;
    const line = lnV1NorthLaneLineX(laneWidthM);
    expect(Math.abs(line - view.x - laneWidthM / 2)).toBeLessThan(0.02); // it rides its lane's centre
    tr.stagedCommand(spec.id, { type: "passGuard", on: true });
    tr.stagedCommand(spec.id, { type: "cruise" });
    return bareAgainst(tr, spec.id, line + fromLine);
  }

  it("A4 his centre 5 cm over the line into the lane the pass is heading for: it brakes and stops short of him", () => {
    const r = guardRun(-0.05);
    expect(r.braked, "the pass guard did not see a student whose centre is in its lane").toBe(true);
    expect(r.finalY, "it drew level with him").toBeLessThan(60 - 5);
  });

  it("A5 his centre 5 cm short of the line (his body brushing it): it is not braked for him and drives on past", () => {
    const r = guardRun(+0.05);
    expect(r.braked, "the pass guard braked for a student whose centre is in the next lane").toBe(false);
    expect(r.finalY).toBeGreaterThan(60 + 10);
  });

  it("A6 the lane is the one the traffic system BUILT: in a system of 7 m lanes the line moves, and the guard with it", () => {
    // 7 m, not 6: half of 6 is round 1's fixed 3 m, which would pass this by luck.
    const r = guardRun(+0.05, 7);
    expect(r.braked, "the guard measured a lane the system did not build").toBe(false);
    expect(r.finalY).toBeGreaterThan(60 + 10);
    expect(guardRun(-0.05, 7).braked, "the guard missed a student in the lane the system built").toBe(true);
  });

  it("A8 (round 3) the corridor is the WHOLE lane it is gliding into, from the first frame of the glide — a student in its far half is braked for too", () => {
    // Round 2's verifier V3 halved the shift the corridor is centred on
    // (latTarget − lat) and nothing noticed: during the glide the corridor then
    // sat on the lane LINE, and a student standing in the far half of the lane
    // the actor was gliding into was invisible until the glide was over. Here
    // the actor starts from rest and glides right into ln-v1's curb lane, where
    // the student stands 2 m past its centre, 8.5 m ahead of it — close enough
    // that the guard's approach profile ((8.5 − 6) × 0.8 = 2 m/s) binds before
    // the glide is half done.
    const tr = createTrafficSystem(district("ln-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    const view = tr.stage(BARE)!;
    const standX = LN_RIGHT + 2;
    const standY = view.y + 8.5;
    tr.stagedCommand(BARE.id, { type: "passGuard", on: true });
    tr.stagedCommand(BARE.id, { type: "cruise" });
    tr.stagedCommand(BARE.id, { type: "laneShift", toOffsetM: LN_RIGHT - LN_LEFT, rampSec: 1.5 });
    let closest = Infinity;
    let peakDuringGlide = 0;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      tr.update(DT, { signalPhase: () => "green", playerPos: { x: standX, y: standY }, playerSpeedKmh: 0, playerHeadingDeg: 0 });
      const a = tr.staged(BARE.id)!;
      closest = Math.min(closest, standY - a.y);
      if (i * DT < 1.5) peakDuringGlide = Math.max(peakDuringGlide, a.speedMps);
    }
    // braked for him from the start: never above the guard's approach profile
    // for a student 8.5 m ahead, and it stops short of him
    expect(peakDuringGlide, "it ran up to speed during the glide as if the lane were empty").toBeLessThanOrEqual((8.5 - 6) * 0.8 + 0.1);
    expect(closest, "it drew within a body length of him").toBeGreaterThan(5.5);
  });

  it("A7 every staged vehicle publishes the lane width of the system that built its lanes", () => {
    for (const w of [LANE_WIDTH_M, 6]) {
      const tr = createTrafficSystem(district("ln-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0, laneWidthM: w });
      expect(tr.stage({ ...BARE, id: `pg-w-${w}` })!.laneWidthM).toBe(w);
    }
  });
});

interface Probe {
  /** Student ahead of the actor along its heading on the frame he stepped in, m. */
  aheadAtStep: number | null;
  /** Commands the runner issued on the step frame and after it. */
  afterStep: StagedCommand[];
  contactStarts: number[];
  followBehindM: number;
  /** The car's top speed on the step frame and after it, m/s. */
  maxActorSpeedAfterStep: number;
}

/**
 * sc-merge-lane-end's лепка on the production runner + staged layer. The
 * student holds 30 км/ч in the dying lane (a lane pitch off the car's line)
 * until the pass is running and the car's centre has closed to `stepAheadM`
 * behind his; on that frame he is placed `lateralM` off the car's line and
 * stays there. A runner-level probe of ONE decision, so the lateral step is a
 * placement, not a steer.
 */
function stationProbe(
  stepAheadM: number,
  lateralM: number,
  opts: { stripLaneWidth?: boolean; laneWidthM?: number; afterStepKmh?: number } = {},
): Probe {
  const LNM = tailgaterOf(SC_MERGE_LANE_END, "sc-mle-through-car");
  const tr = createTrafficSystem(district("ln-merge-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const log: StagedCommand[] = [];
  const port: StagedTrafficPort = {
    stage: (spec) => tr.stage(spec),
    stagedCommand: (id, cmd) => {
      log.push(cmd);
      tr.stagedCommand(id, cmd);
    },
    staged: (id) => {
      const v = tr.staged(id);
      if (!v) return v;
      if (opts.laneWidthM !== undefined) return { ...v, laneWidthM: opts.laneWidthM };
      if (!opts.stripLaneWidth) return v;
      const { laneWidthM: _drop, ...rest } = v;
      return rest;
    },
  };
  const runner = new RearTailgaterRunner(LNM);
  runner.stage(port, () => 0.5, true);
  let kmh = 30;
  let px = LNM_ENDING;
  let py = LNM_SPAWN_Y;
  let t = 0;
  let touching = false;
  let stepped = false;
  let stepLogAt = -1;
  const out: SimTickEvent[] = [];
  const res: Probe = { aheadAtStep: null, afterStep: [], contactStarts: [], followBehindM: LNM.followBehindM, maxActorSpeedAfterStep: 0 };
  for (let i = 0; i < Math.round(40 / DT); i++) {
    t += DT;
    py += (kmh / 3.6) * DT;
    const a0 = tr.staged(LNM.id)!;
    const passRunning = log.some((c) => c.type === "cruise");
    if (!stepped && passRunning && py - a0.y <= stepAheadM + 0.25) {
      stepped = true;
      px = a0.x + lateralM;
      stepLogAt = log.length;
      if (opts.afterStepKmh !== undefined) kmh = opts.afterStepKmh;
    }
    tr.update(DT, { signalPhase: () => "green", playerPos: { x: px, y: py }, playerSpeedKmh: kmh, playerHeadingDeg: 0 });
    const a = tr.staged(LNM.id)!;
    if (stepped && res.aheadAtStep === null) res.aheadAtStep = (px - a.x) * a.dirX + (py - a.y) * a.dirY;
    if (stepped) res.maxActorSpeedAfterStep = Math.max(res.maxActorSpeedAfterStep, a.speedMps);
    runner.step(port, { tSec: t, dtSec: DT, x: px, y: py, speedKmh: kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] }, out);
    const now = isContact(obbSeparationM(playerObb(px, py, 0), actorObb(a, LNM.actor.profile)));
    if (now && !touching) res.contactStarts.push(Math.round(t * 100) / 100);
    touching = now;
  }
  if (stepLogAt >= 0) res.afterStep = log.slice(stepLogAt);
  return res;
}

const isStation = (cmds: StagedCommand[], followBehindM: number): boolean =>
  cmds.some((c) => c.type === "matchPlayer" && Math.abs(c.gapM + followBehindM) < 1e-9) &&
  cmds.some((c) => c.type === "passGuard" && c.on === false);

describe("E — RearTailgaterRunner's station law: IN its lane = his body over the drawn lane, AHEAD = his centre in front of the car's", () => {
  const LNM = tailgaterOf(SC_MERGE_LANE_END, "sc-mle-through-car");
  // The lane geometry the product built, measured: the lane line from the
  // district, the car's line from the live actor, his half-width from the
  // chassis collider.
  const probeTr = createTrafficSystem(district("ln-merge-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const view = probeTr.stage({
    kind: "vehicle",
    id: "probe-line",
    pathNodes: LNM.actor.pathNodes,
    hold: LNM.actor.hold,
    cruiseSpeedMps: LNM.actor.cruiseSpeedMps,
    extraRightOffsetM: LNM.actor.extraRightOffsetM,
  })!;
  const halfLane = Math.abs(lnMergeLaneLineX() - view.x);
  /** His centre this far off the car's line puts his body edge exactly ON the lane line. */
  const onTheLine = halfLane + PLAYER_HALF_WIDTH_M;
  /** Well inside the lane on any reading (his whole body in it), yet clear of the
   *  car's body while abreast — isolates the AHEAD boundary from the corridor. */
  const deepInLane = 2.5;

  it("the published lane width IS the drawn lane (half of it = the car's line to the lane line, ±2 cm: the template authors ±4.06 for ±4.0625)", () => {
    expect(view.laneWidthM, "the staged actor publishes no lane width").toBe(LANE_WIDTH_M);
    expect(Math.abs(view.laneWidthM! / 2 - halfLane)).toBeLessThan(0.02);
  });

  it("E1 his body 5 cm over the lane line, 4 m ahead of the car's centre: the pass keeps STATION at followBehindM (guard off)", () => {
    const p = stationProbe(4, onTheLine - 0.05);
    expect(p.aheadAtStep).not.toBeNull();
    expect(p.aheadAtStep!).toBeGreaterThan(0);
    expect(isStation(p.afterStep.slice(0, 2), p.followBehindM), JSON.stringify(p.afterStep.slice(0, 4))).toBe(true);
    expect(p.contactStarts).toEqual([]);
  });

  it("E2 his body 5 cm short of the lane line: he is not in its lane and the pass carries on (no station)", () => {
    const p = stationProbe(4, onTheLine + 0.05);
    expect(p.aheadAtStep!).toBeGreaterThan(0);
    expect(p.afterStep.filter((c) => c.type === "matchPlayer"), JSON.stringify(p.afterStep.slice(0, 4))).toEqual([]);
    expect(p.contactStarts).toEqual([]);
  });

  for (const ahead of [0.5, 2, 4, 6, 8]) {
    it(`E3 AHEAD is his centre in front of the car's: in its lane ${ahead} m ahead → station on that frame`, () => {
      const p = stationProbe(ahead, deepInLane);
      expect(p.aheadAtStep!).toBeGreaterThan(0);
      expect(p.aheadAtStep!).toBeLessThanOrEqual(ahead);
      expect(isStation(p.afterStep.slice(0, 2), p.followBehindM), JSON.stringify(p.afterStep.slice(0, 4))).toBe(true);
    });
  }

  it("E4 …and not once the car's centre is past his: in its lane 0.5 m BEHIND the car's centre → the pass carries on", () => {
    const p = stationProbe(-0.5, deepInLane);
    expect(p.aheadAtStep!).toBeLessThan(0);
    expect(p.afterStep.filter((c) => c.type === "matchPlayer"), JSON.stringify(p.afterStep.slice(0, 4))).toEqual([]);
  });

  it("E6 the lane is the one the traffic layer PUBLISHES: told its lane is 2 m wide, 2.5 m off its line is out of it (no station)", () => {
    const p = stationProbe(4, deepInLane, { laneWidthM: 2 });
    expect(p.aheadAtStep!).toBeGreaterThan(0);
    expect(p.afterStep.filter((c) => c.type === "matchPlayer")).toEqual([]);
  });

  it("E5 a port whose view publishes no lane width: the runner does not guess a lane (no station)", () => {
    const p = stationProbe(4, deepInLane, { stripLaneWidth: true });
    expect(p.aheadAtStep!).toBeGreaterThan(0);
    expect(p.afterStep.filter((c) => c.type === "matchPlayer")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ROUND 2, RESUMED — the four mutants round 1's verifier called neutral (N7,
// N14, N15, N16) and the one round 2 left standing (C9b) were re-derived.
// Three change what the car does and are pinned below; N15 and C9b change no
// frame (a dead store, and a NaN comparison tsc refuses) — the argument is in
// the round-2 report.
// ---------------------------------------------------------------------------

/**
 * sc-merge-lane-end's лепка, a station episode, and then the frame the
 * director cannot see yet. The student steps into the car's lane 4 m ahead of
 * its centre (station, guard off), leaves it again a second later (the pass
 * resumes), is overtaken in the dying lane, and — once the car's centre is
 * `behindAtReturnM` past his — is placed back INSIDE its lane beside it and
 * accelerates to `overtakeKmh`, drawing ahead of it inside the car's lane.
 * The director steps AFTER traffic (orchestrator/index.ts: traffic.update,
 * then director.step), so on the traffic frame his centre first crosses in
 * front of the car's the runner is still in the cruise it chose on the frame
 * before: only the pass guard can see him on that frame.
 */
function returnProbe(overtakeKmh = 72, behindAtReturnM = 3) {
  const LNM = tailgaterOf(SC_MERGE_LANE_END, "sc-mle-through-car");
  const tr = createTrafficSystem(district("ln-merge-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const log: { t: number; cmd: StagedCommand }[] = [];
  let t = 0;
  const port: StagedTrafficPort = {
    stage: (spec) => tr.stage(spec),
    stagedCommand: (id, cmd) => {
      log.push({ t, cmd });
      tr.stagedCommand(id, cmd);
    },
    staged: (id) => tr.staged(id),
  };
  const runner = new RearTailgaterRunner(LNM);
  runner.stage(port, () => 0.5, true);
  let kmh = 30;
  let px = LNM_ENDING;
  let py = LNM_SPAWN_Y;
  let phase: "approach" | "station" | "out" | "beside" = "approach";
  let stationAt = -1;
  let outAt = -1;
  let touching = false;
  const contactStarts: number[] = [];
  let crossing: { before: number; after: number; along: number } | null = null;
  const out: SimTickEvent[] = [];
  for (let i = 0; i < Math.round(60 / DT); i++) {
    t += DT;
    py += (kmh / 3.6) * DT;
    const a0 = tr.staged(LNM.id)!;
    const firstCruise = log.findIndex((c) => c.cmd.type === "cruise");
    if (phase === "approach" && firstCruise >= 0 && py - a0.y <= 4.25) {
      phase = "station";
      px = a0.x + 2.5;
    } else if (phase === "station" && stationAt >= 0 && t - stationAt >= 1) {
      phase = "out";
      outAt = t;
      px = LNM_ENDING;
    } else if (phase === "out" && a0.y - py >= behindAtReturnM) {
      phase = "beside";
      px = a0.x + 2.5;
      kmh = overtakeKmh;
    }
    // The guard's own reading of this frame: the car's pose before it moves,
    // his pose now. (Read off the view NOW — it is one live object the update
    // rewrites in place.)
    const along = (px - a0.x) * a0.dirX + (py - a0.y) * a0.dirY;
    const speedBefore = a0.speedMps;
    tr.update(DT, { signalPhase: () => "green", playerPos: { x: px, y: py }, playerSpeedKmh: kmh, playerHeadingDeg: 0 });
    const a = tr.staged(LNM.id)!;
    if (phase === "beside" && crossing === null && along > 0) crossing = { before: speedBefore, after: a.speedMps, along };
    runner.step(port, { tSec: t, dtSec: DT, x: px, y: py, speedKmh: kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] }, out);
    if (phase === "station" && stationAt < 0 && firstCruise >= 0 && isStation(log.slice(firstCruise + 1).map((c) => c.cmd), LNM.followBehindM)) {
      stationAt = t;
    }
    const now = isContact(obbSeparationM(playerObb(px, py, 0), actorObb(a, LNM.actor.profile)));
    if (now && !touching) contactStarts.push(Math.round(t * 100) / 100);
    touching = now;
  }
  return { log, stationAt, outAt, crossing, contactStarts };
}

describe("F — round 2, resumed: the survivors that change what the car does", () => {
  const LNM = tailgaterOf(SC_MERGE_LANE_END, "sc-mle-through-car");
  const probeTr = createTrafficSystem(district("ln-merge-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const view = probeTr.stage({
    kind: "vehicle",
    id: "probe-line-f",
    pathNodes: LNM.actor.pathNodes,
    hold: LNM.actor.hold,
    cruiseSpeedMps: LNM.actor.cruiseSpeedMps,
    extraRightOffsetM: LNM.actor.extraRightOffsetM,
  })!;
  const halfLane = Math.abs(lnMergeLaneLineX() - view.x);
  /** His centre this far off the car's line puts his body edge exactly on the lane's edge. */
  const onTheLine = halfLane + PLAYER_HALF_WIDTH_M;

  it("the lane has two sides of equal reach: the carriageway's far edge is as far from the car's line as the lane line (±2 cm)", () => {
    const e = district("ln-merge-v1").roads.edges[0];
    const farEdgeX = e.geometry[0][0] - (e.lanes / 2) * view.laneWidthM!; // one drawn lane beyond the lane line
    expect(Math.abs(view.x - farEdgeX - halfLane)).toBeLessThan(0.02);
  });

  // N7 (|lateral| → signed lateral) kept every E test green because every one
  // of them places him on the dying-lane side. A student on the car's other
  // side is in its lane by the same measure, and out of it by the same measure.
  it("F1 the far side, his body 5 cm over his lane's outer edge into it: STATION, exactly as on the lane-line side", () => {
    const p = stationProbe(4, -(onTheLine - 0.05));
    expect(p.aheadAtStep!).toBeGreaterThan(0);
    expect(isStation(p.afterStep.slice(0, 2), p.followBehindM), JSON.stringify(p.afterStep.slice(0, 4))).toBe(true);
    expect(p.contactStarts).toEqual([]);
  });

  it("F2 the far side, his body 5 cm clear of the lane: not in its lane — the pass carries on (no station)", () => {
    const p = stationProbe(4, -(onTheLine + 0.05));
    expect(p.aheadAtStep!).toBeGreaterThan(0);
    expect(p.afterStep.filter((c) => c.type === "matchPlayer"), JSON.stringify(p.afterStep.slice(0, 4))).toEqual([]);
    expect(p.contactStarts).toEqual([]);
  });

  // N14 (the station's cap → 40 m/s) stayed green because every E probe holds
  // 30 км/ч, far under the cap. The station IS the glued pose — same law, same
  // authored ceiling — so a student who pulls away inside its lane is not
  // chased past the speed the lesson author capped the лепка at.
  it("F3 station keeps the glued pose's authored ceiling: a student pulling away at 72 км/ч in its lane is not chased past maxMatchSpeedMps", () => {
    expect(72 / 3.6).toBeGreaterThan(LNM.maxMatchSpeedMps); // above the cap, or F3 measures nothing
    const p = stationProbe(4, 2.5, { afterStepKmh: 72 });
    expect(isStation(p.afterStep.slice(0, 2), p.followBehindM)).toBe(true);
    const station = p.afterStep.find((c) => c.type === "matchPlayer");
    expect(station && station.type === "matchPlayer" ? station.maxSpeedMps : NaN).toBe(LNM.maxMatchSpeedMps);
    expect(p.maxActorSpeedAfterStep).toBeLessThanOrEqual(LNM.maxMatchSpeedMps + 1e-9);
    expect(p.maxActorSpeedAfterStep, "the car never had to follow — F3 measures nothing").toBeGreaterThan(LNM.passSpeedMps + 0.5);
    expect(p.contactStarts).toEqual([]);
  });

  // N16 (re-arm the pass guard only on the FIRST cruise) stayed green because
  // the runner's corridor contains the guard's — but the runner decides one
  // traffic frame late. After a station episode the resumed pass must be
  // guarded again, or the frame he draws ahead of the car inside its lane is
  // driven at the pass speed.
  it("F4 every return to the pass re-arms its guard: on the traffic frame his centre crosses ahead of the car's inside its lane, the car is already braking", () => {
    const r = returnProbe();
    expect(r.stationAt, "no station episode — F4 measures nothing").toBeGreaterThan(0);
    expect(r.outAt).toBeGreaterThan(r.stationAt);
    const resumed = r.log.filter((c) => c.t >= r.outAt);
    const cruiseIdx = resumed.findIndex((c) => c.cmd.type === "cruise");
    expect(cruiseIdx, "the pass never resumed when he left its lane").toBeGreaterThanOrEqual(0);
    expect(
      resumed.slice(0, cruiseIdx + 1).some((c) => c.cmd.type === "passGuard" && c.cmd.on === true),
      "the pass resumed without re-arming its guard",
    ).toBe(true);
    expect(r.crossing, "he never drew ahead of the car inside its lane").not.toBeNull();
    expect(r.crossing!.before).toBeCloseTo(LNM.passSpeedMps, 1); // it was cruising the pass
    expect(r.crossing!.after, "the car drove on at the pass speed on the frame he drew ahead of it").toBeLessThan(r.crossing!.before - 0.05);
    expect(r.contactStarts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CENSUS — every RearTailgaterSpec the catalogue stages, and the geometric
// premise the corridor rests on: the line the pass drives (its path plus the
// pass shift) is a DRAWN LANE CENTRE, so a corridor centred on it is that lane.
// ---------------------------------------------------------------------------

describe("census — 13 tailgater actors in 12 lessons; every pass drives a lane centre", () => {
  const found: { lesson: string; spec: RearTailgaterSpec }[] = [];
  for (const t of SCENARIO_TEMPLATES) {
    const all: StagedEventSpec[] = [...((t.staged ?? []) as StagedEventSpec[])];
    for (const l of t.levels ?? []) all.push(...((l.stagedAdd ?? []) as StagedEventSpec[]));
    for (const s of all) if (s.kind === "rearTailgater") found.push({ lesson: t.id, spec: s });
  }

  it("13 actors in 12 lessons (the round-1 census)", () => {
    expect(found.length).toBe(13);
    expect(new Set(found.map((f) => f.lesson)).size).toBe(12);
  });

  it("each pass drives a drawn lane centre: extraRightOffsetM + passShiftM is a whole number of lanes (±2 cm)", () => {
    const W = LANE_WIDTH_M;
    for (const { lesson, spec } of found) {
      const shift = (spec.actor.extraRightOffsetM ?? 0) + spec.passShiftM;
      const k = Math.round(shift / W);
      expect(Math.abs(shift - k * W), `${lesson}/${spec.id}: its pass line is ${shift.toFixed(3)} m off the graph lane`).toBeLessThan(0.02);
    }
  });
});

// ---------------------------------------------------------------------------
// ROUND 4 (round-3 verifier F1) — the station law brakes at the AUTHORED
// force. W13 (station capped at 6 m/s²) survived every test of round 3 while
// it put fifteen more students into a terminating COLLISION after their
// cut-ins; the census (merge-census O7) now kills it by its contacts. This pins
// the mechanism itself: a car keeping station for a student who has stopped
// right in front of it sheds speed at the decel the runner stages it with
// (12 m/s², «decel must be ≥ the hero's max brake»), every frame until it is
// down to its target — not at 6, not at 9.
// ---------------------------------------------------------------------------

describe("ROUND 4 — station brakes at the authored 12 m/s²", () => {
  it("staged at 12, commanded to keep station 14 m behind a student standing 6 m ahead in its lane, it loses 12·dt of speed per frame until it stops", () => {
    const LNM = tailgaterOf(SC_MERGE_LANE_END, "sc-mle-through-car");
    const tr = createTrafficSystem(district("ln-merge-v1"), { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    const staged: StagedVehicleSpec[] = [];
    const port: StagedTrafficPort = {
      stage: (spec) => {
        if (spec.kind === "vehicle") staged.push(spec);
        return tr.stage(spec);
      },
      stagedCommand: (id, cmd) => tr.stagedCommand(id, cmd),
      staged: (id) => tr.staged(id),
    };
    new RearTailgaterRunner(LNM).stage(port, () => 0.5, true);
    expect(staged[0].decelMps2).toBe(12);
    // bring it up to 50 км/ч with the student far ahead in the OTHER lane
    tr.stagedCommand(LNM.id, { type: "cruise", speedMps: 13.9 });
    let py = 200;
    for (let i = 0; i < 30 * 12; i++) {
      tr.update(DT, { signalPhase: () => "green", playerPos: { x: LNM_ENDING, y: py }, playerSpeedKmh: 0, playerHeadingDeg: 0 });
      if (tr.staged(LNM.id)!.speedMps >= 13.89) break;
    }
    const a0 = tr.staged(LNM.id)!;
    expect(a0.speedMps).toBeGreaterThan(13.8);
    // the student stands 6 m ahead of its centre, in its lane; station
    py = a0.y + 6;
    tr.stagedCommand(LNM.id, { type: "matchPlayer", gapM: -LNM.followBehindM, maxSpeedMps: LNM.maxMatchSpeedMps });
    const speeds: number[] = [a0.speedMps];
    for (let i = 0; i < 45; i++) {
      tr.update(DT, { signalPhase: () => "green", playerPos: { x: LNM_THROUGH, y: py }, playerSpeedKmh: 0, playerHeadingDeg: 0 });
      speeds.push(tr.staged(LNM.id)!.speedMps);
    }
    const drops = speeds.slice(1).map((v, i) => speeds[i] - v).filter((d, i) => speeds[i] > 0.5);
    expect(drops.length).toBeGreaterThan(20);
    for (const d of drops) expect(d / DT).toBeCloseTo(12, 6);
  });
});
