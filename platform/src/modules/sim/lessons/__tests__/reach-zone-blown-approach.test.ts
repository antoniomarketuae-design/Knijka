/**
 * ROUND 11 (2026-08-26) — THE APPROACH THAT WAS ALREADY THROWN AWAY.
 *
 * `capMet` could be re-earned on ANY later frame the car sat at the mark at or
 * under the cap. That rule exists for a student who arrives a shade fast and
 * brakes while still on the mark (doc 86 B4/B5, the founder's own rescue), and
 * nothing in it asked whether the car was still APPROACHING — so the same
 * re-earn was available to a car that had already gone THROUGH the mark at
 * twice the cap and then slowed, rolled back, or simply came to rest in the
 * disc.
 *
 * FOUR SHIPPED DRILLS, filed on the sweep as the objectives-never-ticked lane,
 * every one an authored cap and a green tick printed SECONDS AFTER the leg's
 * own `run.log` samples put the car far over that cap at the gate:
 *
 *   drill / gate                        cap  at the mark  ✓ at   run top
 *   sc-ac-highbeam-lead/sc-ahl-follow    45     ~59        0:37     59
 *   sc-crossing-bus-shadow/sc-bsh-approach 30   ~58        0:33     58
 *   sc-crossing-white-cane/sc-wcn-approach 40   ~50        0:29     59
 *   sc-hazard-obstacle/sc-obs-approach    46     ~57        0:32     59
 *
 * `.audit-frames/w10-4/frames/sc-crossing-bus-shadow__pc-wrong/08-debrief-p4
 * .png` is the class in one photograph: «✓ Приближи камиона и пътеката с
 * готовност за спиране 0:33» directly above «Грешки (6)», which contains
 * «Твърде бързо приближаване към пешеходна пътека −10 изпитни т. ОПАСНА
 * ГРЕШКА» and «Удар в пешеходец».
 *
 * Every assertion below is red on the code as it stood at 4a86478. Each block
 * carries its counter-direction: the B4/B5 rescues this must not undo, because
 * a false failure and a false pass are the same crime.
 */

import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import { REACH_ZONE_CAP_SLACK_KMH, createEvalState, parseObjectiveParams, stepObjective } from "../objectives";
import type { ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

function parsed(titleBg: string, params: Record<string, unknown>): ObjectiveParams {
  return parseObjectiveParams({ id: "o1", titleBg, kind: "reachZone", params });
}

/**
 * Step one objective through a tick sequence, stopping at the first completed
 * frame exactly as `lessons/engine.ts` does (it never re-steps a completed
 * objective). Returns the frame index the tick was issued on, or −1.
 */
function run(params: ObjectiveParams, ticks: ReturnType<typeof makeTick>[]) {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let doneAt = -1;
  for (let i = 0; i < ticks.length && !done; i++) {
    const r = stepObjective(params, evalState, ticks[i]);
    evalState = r.evalState;
    done = r.done;
    if (done) doneAt = i;
  }
  return { done, doneAt, evalState };
}

/** `sc-crossing-bus-shadow`'s own gate: r10 at (4.06, 76), capped at 30. */
const BSH = { x: 4.06, y: 76, radiusM: 10, maxSpeedKmh: 30 };
const BSH_TITLE = "Приближи камиона и пътеката с готовност за спиране";
/** Ticks up the approach axis (+y) in the right-lane centre. */
const at = (y: number, speedKmh: number, t: number) =>
  makeTick({ t, position: { x: 4.06, y }, speedKmh });

describe("a blown approach cannot be re-earned beside the mark", () => {
  it("REFUSES the drive that rolls back to the mark after blasting through it", () => {
    // The car sweeps the disc at 58 in a 30 zone, carries on, then drifts back
    // in and comes to rest ON the mark. Shipped code issued the certificate on
    // the at-rest frame.
    const r = run(parsed(BSH_TITLE, BSH), [
      at(0, 14, 0),
      at(30, 45, 2),
      at(62, 58, 4),
      at(80, 58, 5), // through the disc at nearly twice the cap
      at(110, 40, 7),
      at(84, 10, 12), // back inside the disc, slow now
      at(78, 0, 14), // at rest on the mark
    ]);
    expect(r.done).toBe(false);
    expect(r.evalState.type === "reachZone" && r.evalState.reached).toBe(true);
    expect(r.evalState.type === "reachZone" && r.evalState.approachCap === "blown").toBe(true);
  });

  it("REFUSES the drive that decelerates INSIDE the disc after blasting through it", () => {
    // The throttle-flat shape the sweep's «wrong» legs drive: through the mark
    // at 58, braking only afterwards, stopped at 86. Shipped code ticked it at
    // the frame the speed fell to the cap, ten metres past the mark.
    const r = run(parsed(BSH_TITLE, BSH), [
      at(0, 14, 0),
      at(40, 55, 2),
      at(70, 58, 4), // still SHORT of the mark — the approach can still be saved
      at(80, 52, 5), // past the mark, still 22 over the cap: blown
      at(86, 20, 7), // under the cap now, but there is no approach left
      at(86, 0, 9),
    ]);
    expect(r.done).toBe(false);
  });

  it("REFUSES the drive that banks the cap in the ring and then JUMPS the mark", () => {
    // „A WAYPOINT IS CROSSED, NOT SAMPLED" cuts both ways: one 0.5 s tick at
    // 58 км/ч covers 8 m against a 15 m capsule, so a car can bank the cap from
    // below on the way up and then have NO frame in which it is both on the
    // approach side and over the cap. Nothing spent the latch; the swept face
    // now does.
    const r = run(parsed(BSH_TITLE, BSH), [
      at(0, 14, 0),
      at(64, 28, 4), // 12 m short, inside the ring, under the cap — banks it
      at(95, 58, 6), // one tick later: 19 m PAST the mark, at 58
    ]);
    expect(r.done).toBe(false);
  });

  /**
   * THE FOUR FILED DRILLS, at the engine's own cadence rather than at the
   * sweep's screenshot cadence. `PHYSICS_MAX_FRAME_DT = 0.5`, so the evaluator
   * sees a sample every ≤ 0.5 s of sim time however slow the device is; the
   * `run.log` samples that gave the speeds below are five seconds apart and are
   * the SOURCE of the numbers, not the sampling.
   *
   * Each row replays the shape all four share: accelerate from rest (under the
   * cap the whole way, but far outside the gate's ring, so nothing banks),
   * cross the mark far over it, then fall well under it afterwards — which is
   * when every one of these drills printed its green tick.
   */
  it("refuses all four drills this lane was filed on, at engine tick cadence", () => {
    const DRILLS: ReadonlyArray<{
      id: string;
      cap: number;
      markY: number;
      radiusM: number;
      throughKmh: number;
    }> = [
      { id: "sc-ac-highbeam-lead/sc-ahl-follow", cap: 45, markY: 180, radiusM: 10, throughKmh: 59 },
      { id: "sc-crossing-bus-shadow/sc-bsh-approach", cap: 30, markY: 76, radiusM: 10, throughKmh: 58 },
      { id: "sc-crossing-white-cane/sc-wcn-approach", cap: 40, markY: 62, radiusM: 10, throughKmh: 50 },
      { id: "sc-hazard-obstacle/sc-obs-approach", cap: 46, markY: 60, radiusM: 12, throughKmh: 57 },
    ];
    const credited: string[] = [];
    for (const d of DRILLS) {
      const gate = parsed(BSH_TITLE, {
        x: 4.06,
        y: d.markY,
        radiusM: d.radiusM,
        maxSpeedKmh: d.cap,
      });
      // 0.5 s ticks: position integrated from the speed, so the sampling is the
      // engine's and not the fixture's.
      const ticks: ReturnType<typeof makeTick>[] = [];
      let y = 0;
      let t = 0;
      // Up to the gate: already at the through-speed by the time the ring
      // starts, which is what every one of the four `run.log`s records.
      while (y < d.markY + d.radiusM + 30) {
        ticks.push(at(y, d.throughKmh, t));
        y += (d.throughKmh / 3.6) * 0.5;
        t += 0.5;
      }
      // …and then the slow tail the tick was actually printed on: rolling back
      // to a stop on the mark.
      for (let k = 0; k < 12; k++) {
        y -= 4;
        t += 0.5;
        ticks.push(at(Math.max(y, d.markY), k < 8 ? 15 : 0, t));
      }
      const r = run(gate, ticks);
      if (r.done) credited.push(`${d.id}: cap ${d.cap}, through at ${d.throughKmh} км/ч, still ticked`);
    }
    expect(credited).toEqual([]);
  });

  it("STILL REFUSES the drive that never comes back (unchanged)", () => {
    const r = run(parsed(BSH_TITLE, BSH), [
      at(0, 14, 0),
      at(30, 45, 2),
      at(62, 58, 4),
      at(80, 58, 5),
      at(110, 40, 7),
      at(150, 0, 11),
    ]);
    expect(r.done).toBe(false);
  });
});

describe("the counter-direction: the rescues this must not undo", () => {
  it("CREDITS the B4 drive — braked to the cap on the approach, a shade over at the mark", () => {
    // Doc 86 B4: the taught behaviour is slowing down BEFORE the hazard, and
    // drifting a shade above the cap as the mark passes must not read as
    // failure. `REACH_ZONE_CAP_SLACK_KMH` is the shade, and „blown" is defined
    // outside it, so this drive is bit-identical to shipped.
    const r = run(parsed(BSH_TITLE, BSH), [
      at(0, 20, 0),
      at(50, 34, 2), // still outside the ring
      at(64, 28, 3), // braked to the cap inside the capsule, 12 m short
      at(76, 30 + REACH_ZONE_CAP_SLACK_KMH - 2, 4), // a shade over, ON the mark
      at(88, 30 + REACH_ZONE_CAP_SLACK_KMH - 2, 5),
    ]);
    expect(r.done).toBe(true);
  });

  it("CREDITS the self-correction: arrives over the cap, brakes while still on the mark", () => {
    // Within the slack band the approach is not blown, so the anti-trap re-earn
    // this file has always documented still fires on the next frame.
    const r = run(parsed(BSH_TITLE, BSH), [
      at(0, 20, 0),
      at(68, 30 + REACH_ZONE_CAP_SLACK_KMH - 1, 3), // in the disc, 4 over
      at(74, 24, 4), // braked while still on the mark
    ]);
    expect(r.done).toBe(true);
  });

  it("CREDITS the B5 drive — stopped SHORT of a halt mark", () => {
    // Doc 86 B5, the founder's own case: a halt gate satisfied by coming to
    // rest in the approach capsule, four metres short of the mark. Never within
    // the slack of its own cap while moving, so `approachCap` never reads „blown".
    const HALT = { x: 4.06, y: 76, radiusM: 4, maxSpeedKmh: 6 };
    const r = run(parsed("Спри на маркировката", HALT), [
      at(0, 20, 0),
      at(50, 14, 2),
      at(66, 5, 4), // inside the capsule, under the halt cap
      at(68, 0, 5), // at rest, eight metres short
    ]);
    expect(r.done).toBe(true);
  });

  it("CREDITS a FRESH approach after a blown one — the escape hatch is real", () => {
    // Overshoot, leave the ring back down the road, come at the mark again from
    // the same side. The clear rides the very edge that re-latches the approach
    // axis, so the two can never disagree about what „coming at it again" is.
    const r = run(parsed(BSH_TITLE, BSH), [
      at(0, 14, 0),
      at(70, 58, 3), // blown: through the disc at 58
      at(95, 20, 5),
      at(40, 12, 9), // reversed/turned back well outside the ring
      at(20, 10, 11), // …far enough south that the re-entry is a real approach
      at(58, 20, 13), // fresh ring entry, from the SAME side
      at(74, 22, 14), // at the mark, under the cap
    ]);
    expect(r.done).toBe(true);
  });

  it("does NOT credit a drift-back from the FAR side as a fresh approach (B18/FR-24)", () => {
    // The same dot ≤ 0 guard that refuses to re-latch the axis refuses to clear
    // the blown flag: coming back the other way is not an approach, it is the
    // far side of the mark.
    const r = run(parsed(BSH_TITLE, BSH), [
      at(0, 14, 0),
      at(70, 58, 3),
      at(82, 55, 4), // past the mark at 55: blown
      at(120, 40, 6), // well outside the ring
      at(86, 20, 9), // re-enters the ring from the NORTH
      at(76, 4, 11), // on the mark, under the cap
    ]);
    expect(r.done).toBe(false);
  });

  it("leaves an UNCAPPED zone bit-identical — a place is a place", () => {
    const OPEN = { x: 4.06, y: 76, radiusM: 12 };
    const r = run(parsed("Стигни края на отсечката", OPEN), [
      at(0, 14, 0),
      at(70, 120, 2),
    ]);
    expect(r.done).toBe(true);
  });
});
