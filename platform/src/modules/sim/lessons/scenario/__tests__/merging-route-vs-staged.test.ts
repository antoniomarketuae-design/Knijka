/**
 * SWEEP 161 · the MERGING family — DOES THE ROUTE THE PRODUCT DRAWS PUT THE
 * STUDENT INSIDE THE CAR THE LESSON STAGED?
 *
 * Two lessons in this file route a student to a waypoint while a staged body is
 * moving through the same lane, and in both the audit photographed the wrong
 * answer:
 *
 *   sc-merge-lane-end — the steered re-drive (.audit-frames/rebase/frames/
 *     sc-merge-lane-end__pc-right, TRACKING: TRACKED, ribbon 85 %, straightness
 *     0.995) completed BOTH route objectives — «Влей се в оставащата лента» 1:27
 *     and «Продължи…» 1:42 — and still failed the exam sheet: «Удар в друго
 *     превозно средство» −10 at 0:53, with two near misses logged at 0.0 m
 *     (0:53 and 1:01). Route green, sheet НЕИЗДЪРЖАН, 13 наказателни точки.
 *
 *   sc-merge-bus-pullout — the file's own open row: «sc-mgb-ease is a plain
 *     reachZone and ticks green for a driver the bus never pulled out in front
 *     of». The tick is the whole чл. 67 contract; if it can be earned before
 *     the rig has moved, the drill grades a promise instead of an event.
 *
 * THE STACK IS REAL, the encounter-battery mold (merging-sweep161-bus-pullout
 * .test.ts verbatim): the committed content/world district through
 * `createTrafficSystem` with ambient zeroed, and the PRODUCTION runners. Only
 * the player is synthetic, because "a student who did what instruction 4 says"
 * is not a thing a recording can prove about every pace.
 *
 * WHAT EACH SUITE WOULD MISS IF IT WERE DECORATION IS NAMED ON THE SUITE, with
 * the mutation that reddens it. Every threshold below was measured first and
 * the measurement is written next to it.
 *
 * THE MUTATION LEDGER — every one of these was RUN, not reasoned about, on
 * 2026-08-23, against templates-merging.ts, and the template was restored to a
 * byte-identical state afterwards (18 green before and after):
 *
 *   sc-mle-merge y 236 → 60 ............................. 5 red
 *   passSpeedMps 13.9 → 16 (above the posted 50) ........ 1 red
 *   passSpeedMps 13.9 → 22 (parks the rig on the finish) . 3 red
 *   sc-mgb-ease y 168 → 150 ............................. 7 red
 *   cutRampSec 2.5 → 8 .................................. 5 red
 *   staged: [LNM_THROUGH_CAR] → [] (fix by deletion) ..... 8 red
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CutInLeadCarSpec, RearTailgaterSpec } from "../../../contracts";
import type { SimTickEvent } from "../../../rules";
import { CutInLeadCarRunner, RearTailgaterRunner } from "../../../orchestrator/runners";
import type { DirectorInput } from "../../../orchestrator/types";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { SC_MERGE_BUS_PULLOUT, SC_MERGE_LANE_END } from "../templates-merging";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const DT = 1 / 30;

function district(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

/** Read a reachZone objective's authored geometry off the spec, not a copy —
 *  so moving the waypoint in templates-merging.ts moves this test's subject
 *  with it, and a waypoint moved into a staged body reddens the suite. */
function zone(spec: typeof SC_MERGE_LANE_END, id: string): { x: number; y: number; radiusM: number } {
  const o = spec.success.find((s) => s.id === id);
  if (!o || o.params.kind !== "reachZone") throw new Error(`${id} is not a reachZone`);
  return { x: o.params.x, y: o.params.y, radiusM: o.params.radiusM };
}

// ---------------------------------------------------------------------------
// 1. sc-merge-lane-end — the лепка in the through lane, and instruction 4
// ---------------------------------------------------------------------------

/** ln-merge-v1 meta.scenario — re-pinned here rather than imported (the
 *  battery convention: a shared constant that drifts drifts BOTH sides). */
const LNM_DISTRICT = "ln-merge-v1";
const LNM_X_ENDING = 4.06; // laneId 0 — the lane that dies
const LNM_X_THROUGH = -4.06; // laneId 1 — the лепка's lane, and the target
const LNM_SPAWN_Y = 12; // lnm-spawn-ending-lane
const LNM_END_Y = 280;
/** One drawn lane pitch on this map, m: two lane centres 8.12 m apart. */
const LNM_LANE_PITCH_M = 8.12;
/** The lane change the taught drive makes, s — one smooth movement
 *  (instruction 5 «с едно плавно движение»), not a twitch and not a drift. */
const MERGE_RAMP_SEC = 2;

const LNM_CAR = (SC_MERGE_LANE_END.staged ?? []).find(
  (s): s is RearTailgaterSpec => s.kind === "rearTailgater",
)!;

interface LnmProbe {
  /** Tightest CENTRE separation to the лепка over the whole drive, m. */
  closestM: number;
  /** Player y at that moment. */
  closestAtY: number;
  /** Player y when the runner first saw the actor `passAheadM` clear; null =
   *  the pass never completed on this drive. */
  passedAtY: number | null;
  /** Did the drive actually perform instruction 4's lift? */
  lifted: boolean;
}

/**
 * Drive the dying lane north from the authored spawn at `kmh`.
 *
 * `lift` = instruction 4, performed: «Ако колата до теб е почти наравно —
 * отпусни газта и я пусни да мине.» The ease is the template's OWN `easeKmh`
 * doubled, held until the runner reports the actor clear.
 *
 * HONEST ABOUT WHEN IT FIRES (verifier, 2026-08-23 — this doc used to say
 * „while the actor is roughly abreast" and that is not what the window does):
 * the лепка holds dormant at arc 8, i.e. FOUR METRES BEHIND the y = 12 spawn,
 * so `aheadM` is already inside (−20, 6) on tick 1 and the ease fires at
 * y ≈ 12.1–12.5 at every pace — before the actor has even been released. The
 * window is deliberately left wide, because the narrow version cannot be
 * driven: with a true ±6 m abreast cue the rows are unchanged at 12/20/30/40
 * км/ч, but at 50 the lift NEVER FIRES — the лепка glues at `followBehindM` 14
 * and `passSpeedMps` equals the player's own posted speed, so it never closes
 * to abreast and a limit-holding student gets no cue to respond to at all.
 * Read the 50 км/ч rows below as „eased from the start line", not as
 * „responded to instruction 4", and see templates-merging.ts's SCOPE RESTORED
 * paragraph for what that costs the conclusion.
 *
 * The lane change is then timed so the 2 s movement FINISHES on the drill's own
 * merge waypoint — which is what "drove the route the product drew" means. A
 * ramp that merely STARTS there leaves the car mid-lane at the gate and would
 * be measuring a different drive.
 */
function driveLaneEnd(kmh: number, lift: boolean, mergeCompleteAtY: number): LnmProbe {
  const tr = createTrafficSystem(district(LNM_DISTRICT), {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new RearTailgaterRunner(LNM_CAR);
  // Fixed jitter draw: every probe replays bit-identically (battery convention).
  runner.stage(tr, () => 0.5, true);

  let py = LNM_SPAWN_Y;
  let t = 0;
  let v = kmh;
  let merging = false;
  let mergeStartSec = 0;
  let lifted = false;
  let passedAtY: number | null = null;
  let closestM = Infinity;
  let closestAtY = NaN;
  const out: SimTickEvent[] = [];

  for (let i = 0; i < 220 * 30; i++) {
    t += DT;
    py += (v / 3.6) * DT;

    const before = tr.staged(LNM_CAR.id);
    if (before) {
      const aheadM = before.y - py;
      // Abreast: nose-to-nose ±, the moment instruction 4 describes.
      if (lift && !lifted && aheadM > -20 && aheadM < 6) {
        v = Math.max(8, kmh - LNM_CAR.easeKmh * 2);
        lifted = true;
      }
      if (passedAtY === null && aheadM >= LNM_CAR.passAheadM) {
        passedAtY = py;
        if (lifted) v = kmh; // …and back up to the flow, instruction 6
      }
    }

    const rampM = (v / 3.6) * MERGE_RAMP_SEC;
    if (!merging && py >= mergeCompleteAtY - rampM) {
      merging = true;
      mergeStartSec = t;
    }
    const frac = merging ? Math.min(1, (t - mergeStartSec) / MERGE_RAMP_SEC) : 0;
    const px = LNM_X_ENDING + (LNM_X_THROUGH - LNM_X_ENDING) * frac;

    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: px, y: py },
      playerSpeedKmh: v,
      playerHeadingDeg: 0,
    });
    const input: DirectorInput = {
      tSec: t,
      dtSec: DT,
      x: px,
      y: py,
      speedKmh: v,
      headingDeg: 0,
      brakePedal: 0,
      tickEvents: [],
    };
    runner.step(tr, input, out);

    const after = tr.staged(LNM_CAR.id);
    if (after) {
      const d = Math.hypot(after.x - px, after.y - py);
      if (d < closestM) {
        closestM = d;
        closestAtY = py;
      }
    }
    if (py > LNM_END_Y) break;
  }
  return { closestM, closestAtY, passedAtY, lifted };
}

describe("sc-merge-lane-end — the taught drive is never inside the лепка", () => {
  /**
   * The band is the road's own: 12 км/ч is the audit harness's cruise, 50 is the
   * posted limit and the лепка's own cruise, and instruction 4 asks the student
   * to sit somewhere between them («изравни темпото си с потока»).
   */
  const TAUGHT_BAND_KMH = [12, 20, 30, 40, 50] as const;

  /**
   * MEASURED, on the committed ln-merge-v1 through the production runner: the
   * lifted drive's tightest centre separation is 8.12 m — one exact lane pitch,
   * i.e. the лепка passed ALONGSIDE — at every one of the five paces. The floor
   * is set at 6.0 rather than 8.12 because the number this suite defends is
   * "the two bodies were never in the same lane", not the third decimal of a
   * geometry that a future ramp shape may legitimately move by a few tenths.
   *
   * A car is ~1.8 m wide, so 6 m of centres is over 4 m of clear air. The
   * failures this catches are interpenetrations: the SAME drive without the
   * lift closes to 1.53 m at 40 км/ч (y = 234, on the gate itself), and moving
   * the waypoint into the pass window produces 0.03–0.11 m.
   */
  const CLEAR_LANE_FLOOR_M = 6.0;

  it("the template still stages the лепка in the THROUGH lane (census guard)", () => {
    // Without this the suite below could pass vacuously off a deleted actor —
    // "nothing hit him" is trivially true when there is nothing there. This is
    // the fix-by-deletion tripwire the whole file is judged against.
    expect(LNM_CAR.id).toBe("sc-mle-through-car");
    expect(LNM_CAR.actor.extraRightOffsetM).toBeCloseTo(-(LNM_X_ENDING - LNM_X_THROUGH), 3);
    expect(LNM_CAR.passShiftM).toBe(0); // its own lane is the surviving one
    const tr = createTrafficSystem(district(LNM_DISTRICT), {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    new RearTailgaterRunner(LNM_CAR).stage(tr, () => 0.5, true);
    expect(tr.staged(LNM_CAR.id), "the лепка did not stage at all").toBeTruthy();
  });

  for (const kmh of TAUGHT_BAND_KMH) {
    it(`at ${kmh} км/ч the drive that obeys instruction 4 keeps a whole lane from it`, () => {
      const gate = zone(SC_MERGE_LANE_END, "sc-mle-merge");
      const r = driveLaneEnd(kmh, true, gate.y);
      expect(r.lifted, `the drive never got the chance to lift at ${kmh} км/ч`).toBe(true);
      expect(
        r.closestM,
        `at ${kmh} км/ч a student who lifted, let the лепка past and then merged so the ` +
          `movement finished on «${SC_MERGE_LANE_END.success[0].titleBg}» (y = ${gate.y}) came within ` +
          `${r.closestM.toFixed(2)} m of centres at y = ${r.closestAtY.toFixed(0)}. ` +
          `The лепка is staged playerGuard:false with an empty contactCast, so a separation under a ` +
          `car's width is a body driven through, billed by the physics shell as «Удар в друго ` +
          `превозно средство» — 10 изпитни т. and the exam terminated.`,
      ).toBeGreaterThanOrEqual(CLEAR_LANE_FLOOR_M);
    });
  }

  /**
   * THE ASSERTION WITH TEETH — and the reason the suite above is not just
   * "nothing bad happened".
   *
   * Instruction 4 is not advice, it is the only way this encounter ever ends:
   * `passSpeedMps` is 13.9 m/s, which IS the posted 50, so against a student who
   * holds the limit the closing speed is zero and the лепка can never reach its
   * `passAheadM`. It rides beside him for the rest of the road. That is what
   * makes «отпусни газта и я пусни да мине» a manoeuvre rather than a courtesy,
   * and it is the fact the route note in templates-merging.ts hangs on.
   *
   * MUTATION: raise `passSpeedMps` toward `maxMatchSpeedMps` (16) in
   * templates-merging.ts and this goes red — the лепка then gets by a
   * limit-holding driver on its own, instruction 4 stops being load-bearing,
   * and the drill's second mistake card («Изтласкване») loses its cause. The
   * suite above stays green through that mutation, which is why both exist.
   */
  it("the лепка CANNOT get past a student who never lifts — that is instruction 4's teeth", () => {
    const gate = zone(SC_MERGE_LANE_END, "sc-mle-merge");
    // The STRUCTURAL half, first, because the behavioural half below can be
    // satisfied by accident of road length: a pass authored ABOVE the posted
    // limit gets by a lawful driver on its own and instruction 4 stops meaning
    // anything. `passSpeedMps` 13.9 m/s IS the map's own 50.
    const postedKmh = (SC_MERGE_LANE_END.map.params as { maxspeedKmh: number }).maxspeedKmh;
    // 0.05 m/s of slack is the rounding the authored 13.9 carries against
    // 50 / 3.6 = 13.888…; it is not room for a faster car.
    expect(
      LNM_CAR.passSpeedMps,
      `the лепка passes at ${(LNM_CAR.passSpeedMps * 3.6).toFixed(1)} км/ч on a street posted ` +
        `${postedKmh} — above the limit it overtakes a student who is doing nothing wrong, and the ` +
        `drill's «отпусни газта и я пусни да мине» becomes a courtesy instead of the manoeuvre.`,
    ).toBeLessThanOrEqual(postedKmh / 3.6 + 0.05);
    const stubborn = driveLaneEnd(50, false, gate.y);
    expect(
      stubborn.passedAtY,
      `the лепка completed its pass at y = ${stubborn.passedAtY} against a driver who held the ` +
        `posted 50 and never eased. passSpeedMps is ${LNM_CAR.passSpeedMps} m/s ` +
        `(${(LNM_CAR.passSpeedMps * 3.6).toFixed(0)} км/ч) — if that is above the limit the student ` +
        `is entitled to hold, instruction 4 is decoration.`,
    ).toBeNull();
    // …and the drill's own ease is enough to end it: the SAME pace, lifted.
    const obedient = driveLaneEnd(50, true, gate.y);
    expect(
      obedient.passedAtY,
      `the lift did not resolve the encounter at 50 км/ч — easeKmh is ${LNM_CAR.easeKmh}`,
    ).not.toBeNull();
    expect(obedient.passedAtY!).toBeLessThan(gate.y);
  });

  /**
   * THE WAYPOINT'S OWN METRE IS LOAD-BEARING. `sc-mle-merge` sits at y = 236,
   * 4 m short of the taper's end — late enough that the лепка's pass is behind
   * the student on every lifted drive.
   *
   * MUTATION: move `sc-mle-merge`'s y in templates-merging.ts down into the
   * pass window (60 is the audit's own row) and this goes red at 12 км/ч with a
   * separation of ~1.9 m, because the gate then sends the student into the lane
   * while the лепка is still coming up it. The number is READ off the spec, so
   * the mutation moves the subject and cannot move the goalpost with it.
   */
  it("the merge waypoint sits past the taper's start, not inside the pass window", () => {
    const gate = zone(SC_MERGE_LANE_END, "sc-mle-merge");
    expect(gate.x).toBeCloseTo(LNM_X_THROUGH, 2);
    expect(gate.y, "the merge gate moved out of the taper").toBeGreaterThan(180);
    expect(gate.y).toBeLessThan(240);
    // Radius under half a lane pitch: satisfiable only from the through lane.
    expect(gate.radiusM).toBeLessThan(LNM_LANE_PITCH_M / 2);
  });

  /**
   * THE RUN-OUT, which is where a staged body goes to stand still. A
   * path-locked actor stops at the end of its polyline and stays there, in the
   * through lane, and `sc-mle-finish` sends the student up that same lane to
   * y = 270 on a 280 m road. Nothing else in the suite would notice a лепка
   * parked on the finish waypoint, because every measurement above ends at the
   * merge.
   *
   * MEASURED at the authored numbers: the lifted drive's tightest separation on
   * the whole run-out is a full lane pitch at both ends of the band — the
   * actor's pass leaves it far enough up the road that the student never closes
   * on it before y = 270.
   *
   * MUTATION: `passSpeedMps` 22 parks the rig at the path end early enough for a
   * 12 км/ч student to catch it, and this goes red at 0.08 m of centres.
   */
  it("nothing is parked on the finish waypoint at the end of the run-out", () => {
    const finish = zone(SC_MERGE_LANE_END, "sc-mle-finish");
    expect(finish.x).toBeCloseTo(LNM_X_THROUGH, 2);
    // VERIFIER 2026-08-23: `finish.y` was read here and then used ONLY inside a
    // failure message, never in an assertion — so moving it to 200, into the
    // pass window and BEFORE the merge gate that is supposed to precede it,
    // left all 18 tests green. The drive below always runs to y > 280 whatever
    // the waypoint says, so nothing else in the suite can see the move. Pin the
    // order the objectives actually advance in: merge out of the dying lane
    // FIRST, then continue to the end of the stretch.
    const mergeGate = zone(SC_MERGE_LANE_END, "sc-mle-merge");
    expect(
      finish.y,
      `«${SC_MERGE_LANE_END.success[1].titleBg}» sits at y = ${finish.y}, at or before the merge ` +
        `gate at y = ${mergeGate.y}. Objectives advance sequentially, so the student would be sent ` +
        `up the through lane before he has been told to join it — through the лепка's pass window.`,
    ).toBeGreaterThan(mergeGate.y);
    expect(finish.y, "the finish waypoint left the run-out").toBeGreaterThan(LNM_END_Y - 20);
    for (const kmh of [12, 50]) {
      const r = driveLaneEnd(kmh, true, zone(SC_MERGE_LANE_END, "sc-mle-merge").y);
      expect(
        r.closestM,
        `at ${kmh} км/ч the drive that merged correctly still came within ${r.closestM.toFixed(2)} m ` +
          `of the лепка at y = ${r.closestAtY.toFixed(0)}, on the way to «${finish.y} m» — a staged ` +
          `body standing on the finish waypoint is a collision the student cannot avoid.`,
      ).toBeGreaterThanOrEqual(CLEAR_LANE_FLOOR_M);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. sc-merge-bus-pullout — is the чл. 67 tick earned AFTER the event?
// ---------------------------------------------------------------------------

const MGB_DISTRICT = "mg-busstop-v1";
const MGB_X_GENERAL = 4.0625; // the player's lane for his whole drive
const MGB_SPAWN_Y = 15; // mgb-spawn-start
const MGB_LANE_PITCH_M = 8.125;
const MGB_BUS = (SC_MERGE_BUS_PULLOUT.staged ?? []).find(
  (s): s is CutInLeadCarSpec => s.kind === "cutInLeadCar",
)!;

/** Player y at the moment the rig has crossed a FULL lane into his own. */
function busInLaneAtPlayerY(kmh: number): number | null {
  const tr = createTrafficSystem(district(MGB_DISTRICT), {
    seed: 7,
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const runner = new CutInLeadCarRunner(MGB_BUS);
  runner.stage(tr, () => 0.5, true);
  let py = MGB_SPAWN_Y;
  let t = 0;
  const out: SimTickEvent[] = [];
  for (let i = 0; i < 220 * 30; i++) {
    t += DT;
    py += (kmh / 3.6) * DT;
    tr.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: MGB_X_GENERAL, y: py },
      playerSpeedKmh: kmh,
      playerHeadingDeg: 0,
    });
    runner.step(
      tr,
      { tSec: t, dtSec: DT, x: MGB_X_GENERAL, y: py, speedKmh: kmh, headingDeg: 0, brakePedal: 0, tickEvents: [] },
      out,
    );
    const a = tr.staged(MGB_BUS.id);
    if (a && Math.abs(a.lateralOffsetM ?? 0) >= MGB_LANE_PITCH_M - 0.15) return py;
    if (py > 395) break;
  }
  return null;
}

describe("sc-merge-bus-pullout — «намали» is ticked after the pull-out, never before", () => {
  /**
   * THE ROW THIS CLOSES is the template's own, filed against itself: «sc-mgb-ease
   * is a plain reachZone and ticks green for a driver the bus never pulled out
   * in front of.» No objective kind in lessons/objectives.ts can consume a
   * staged outcome (only completeManeuver:emergencyStop takes a stagedEventId),
   * so the tick cannot be made conditional on the event — which leaves GEOMETRY
   * as the only honest guarantee: the gate's disc has to start after the metre
   * at which the rig is fully in the player's lane, at every pace the drill
   * permits. That is a checkable fact, and until now nothing checked it.
   *
   * MEASURED (player y at which the rig has crossed a whole lane):
   *    5 км/ч 145.4 · 8 147.4 · 12 150.1 · 15 152.2 · 18 154.2 · 25 158.8 · 30 161.9
   * The gate's near edge is y = 168 − 5 = 163, so the tightest margin in the
   * whole band is 1.1 m, at the 30 км/ч ceiling the gate's own cap allows.
   *
   * MUTATION: pull `sc-mgb-ease`'s y back toward the bay (150) or stretch
   * `cutRampSec` (2.5 → 8) in templates-merging.ts and this goes red — the tick
   * would then be reachable while the bus is still inside the бус лента, which
   * is the defect the row describes.
   */
  const BAND_KMH = [5, 8, 12, 15, 18, 25, 30] as const;

  it("the template still stages the bus with its lane-crossing glide (census guard)", () => {
    expect(MGB_BUS.id).toBe("sc-mgb-bus");
    expect(MGB_BUS.cutShiftM).toBe(-MGB_LANE_PITCH_M);
  });

  for (const kmh of BAND_KMH) {
    it(`at ${kmh} км/ч the rig is fully in the lane before the «намали» disc opens`, () => {
      const gate = zone(SC_MERGE_BUS_PULLOUT, "sc-mgb-ease");
      const nearEdgeY = gate.y - gate.radiusM;
      const inLaneY = busInLaneAtPlayerY(kmh);
      expect(inLaneY, `the bus never crossed into the player's lane at ${kmh} км/ч`).not.toBeNull();
      expect(
        inLaneY!,
        `at ${kmh} км/ч the bus was still crossing at y = ${inLaneY?.toFixed(1)} while the ` +
          `«${SC_MERGE_BUS_PULLOUT.success[0].titleBg}» disc already opens at y = ${nearEdgeY}. ` +
          `The tick would then be earned for slowing down near an empty стоянка, which is the ` +
          `чл. 67 contract graded against a promise instead of an event.`,
      ).toBeLessThan(nearEdgeY);
    });
  }

  it("…and the gate is still pinned to the general lane at a real «намали» pace", () => {
    // The other half of the contract, so a fix that widened the disc until the
    // assertion above passed would be caught: the cap IS «намали и при
    // необходимост спри» in numbers, and the radius keeps it off the бус лента.
    const o = SC_MERGE_BUS_PULLOUT.success.find((s) => s.id === "sc-mgb-ease")!;
    if (o.params.kind !== "reachZone") throw new Error("sc-mgb-ease is not a reachZone");
    expect(o.params.maxSpeedKmh).toBeLessThanOrEqual(30);
    expect(o.params.radiusM).toBeLessThan(MGB_LANE_PITCH_M);
    expect(o.params.x).toBeCloseTo(MGB_X_GENERAL, 3);
  });
});
