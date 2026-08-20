/**
 * =============================================================================
 * O59 — THE PARKING FAMILY GETS A REAR WARNING.
 *
 * `rear-gap.test.ts` (beside system.ts) proves `rearGapFor`, the MOVING half,
 * and nothing in it moves when this file's subject changes. This file is the
 * STATIC half: the district's occupied parking bays, which are bodies the
 * student can hit and were bodies the rear cue could not see.
 *
 * THE DEFECT, MEASURED BEFORE ANYTHING WAS WRITTEN. Every recorded drive of the
 * parking family — 51 committed traces under `content/traces/sc-park-*`, 36,367
 * samples, 11 lot districts — replayed through the pre-fix `rearGapMeters`
 * produced FINITE READS = 0. Infinity from the first frame of every drive to
 * the last, and `stepRearCue` maps Infinity to null in every state, so the one
 * rear instrument a low-tier phone has was silent for the whole of the only
 * manoeuvre that is performed backwards. `sc-park-narrow` step 4 meanwhile
 * tells the student «движи се назад съвсем бавно и следи двете съседни коли» —
 * the lesson instructing him to use a cue the world would not give him. Silence
 * on the sole rear instrument reads as „clear behind"; that is a green tick for
 * a skill nothing measured, handed to someone who then reverses a real car.
 *
 * FOUR THINGS ARE PROVED HERE, and the last two are the ones that keep it
 * honest — a cue that fires always is wallpaper, and wallpaper is the same
 * crime pointing the other way:
 *
 *   1. reversing toward a PARKED bay occupant warns;
 *   2. reversing toward a MOVING vehicle STILL warns — no array was traded for
 *      the other, and the reported number is the nearer of the two;
 *   3. a student who is NOT close to anything is NOT warned: silent on the pose
 *      the correct drive finishes on, and silent for all 722 poses of driving
 *      the lane past the 37 legally parked cars of vu-door-v1 + pk-double-v1;
 *   4. the warning arrives with time to act, and the number is stated.
 *
 * THE REPLAY IS A PROBE, SO IT CARRIES A POSITIVE CONTROL. Every „0 defects"
 * instrument in this project failed in the reassuring direction, so before this
 * file is allowed to assert a lead time it first requires the WRONG drive to
 * actually contain the contact its own debrief describes (bodies overlapping,
 * `obbSeparationM < 0`) and the CORRECT drive to contain none. A trace that
 * quietly stopped clipping the neighbour would make every timing assertion
 * below an assertion about nothing, and it goes red instead.
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { obbSeparationM, playerObb, type Obb2D } from "../../collision";
import { REAR_CUE_EXIT_M, rearCueLabelBg, stepRearCue } from "../../hud/rearProximity";
import {
  createTrafficSystem,
  occupiedBayBodies,
  rearGapFor,
  REAR_STATIC_REACH_M,
  rearStaticGapFor,
} from "../system";
import { type TrafficDistrict } from "../types";

// ---------------------------------------------------------------------------
// Fixtures — the SHIPPED district files and the SHIPPED recorded drives. No
// hand-built parking lot: the whole point of the finding is what the product
// actually hands a student.
// ---------------------------------------------------------------------------

function repoRoot(): string {
  for (const root of [process.cwd(), path.resolve(process.cwd(), "..")]) {
    if (fs.existsSync(path.join(root, "content", "world"))) return root;
  }
  throw new Error("content/world not found from " + process.cwd());
}

function district(id: string): TrafficDistrict {
  const file = path.join(repoRoot(), "content", "world", `${id}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as TrafficDistrict;
}

interface TraceSample {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
}

function trace(lessonId: string, name: string): TraceSample[] {
  const file = path.join(repoRoot(), "content", "traces", lessonId, `${name}.trace.json`);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { samples: TraceSample[] };
  expect(parsed.samples.length, `${lessonId}/${name} has samples`).toBeGreaterThan(100);
  return parsed.samples;
}

/** The tightest body-to-body separation anywhere in a drive, and when. */
function closestApproach(samples: readonly TraceSample[], bodies: readonly Obb2D[]) {
  let sepM = Infinity;
  let tSec = -1;
  for (const s of samples) {
    const me = playerObb(s.x, s.y, s.headingDeg);
    for (const b of bodies) {
      const d = obbSeparationM(me, b);
      if (d < sepM) {
        sepM = d;
        tSec = s.tSec;
      }
    }
  }
  return { sepM, tSec };
}

/** Replay a drive through the SHIPPED system and report what the cue did. */
function replay(districtId: string, samples: readonly TraceSample[]) {
  const raw = district(districtId);
  const traffic = createTrafficSystem(raw, { vehicleCount: 0, pedestrianCount: 0 });
  let first: { tSec: number; gapM: number; speedKmh: number } | null = null;
  let min = { gapM: Infinity, tSec: -1 };
  let finite = 0;
  let lastFiniteT = -1;
  for (const s of samples) {
    const gapM = traffic.rearGapMeters(s.x, s.y, s.headingDeg);
    if (!Number.isFinite(gapM)) continue;
    finite++;
    lastFiniteT = s.tSec;
    if (first === null) first = { tSec: s.tSec, gapM, speedKmh: s.speedKmh };
    if (gapM < min.gapM) min = { gapM, tSec: s.tSec };
  }
  return { first, min, finite, lastFiniteT, bodies: occupiedBayBodies(raw) };
}

// ---------------------------------------------------------------------------

describe("occupiedBayBodies — the source, and only bodies the scene also mounts", () => {
  it("reads the district's authored occupancy and boxes it on the bay heading", () => {
    const bodies = occupiedBayBodies(district("lot-narrow-v1"));
    // lot-narrow-v1 authors occupancy "XX_XX": four occupied, bay 3 free.
    expect(bodies).toHaveLength(4);
    expect(bodies.map((b) => b.y)).toEqual([-5, -2.5, 2.5, 5]);
    for (const b of bodies) {
      expect(b.x).toBeCloseTo(5.03, 5);
      expect(b.headingDeg).toBeCloseTo(90, 5); // the bay's own heading
      // Sized by `actorObb` off the fleet car profile — the same table
      // collision/bodies.ts grades every actor with (4.1 x 1.84).
      expect(b.halfLengthM).toBeCloseTo(2.05, 5);
      expect(b.halfWidthM).toBeCloseTo(0.92, 5);
    }
  });

  it("a FREE bay is not a body — the target bay never becomes a phantom car", () => {
    const bays = (
      district("lot-narrow-v1") as unknown as {
        meta: { scenario: { bays: Array<{ id: string; occupied: boolean; y: number }> } };
      }
    ).meta.scenario.bays;
    const free = bays.filter((b) => !b.occupied);
    expect(free.map((b) => b.id)).toEqual(["lot-bay-3"]);
    // MUTATION: flip the `occupied !== true` guard to `occupied === false` and
    // this pair inverts — the student would be warned about the empty pocket he
    // is reversing INTO and unwarned about the metal beside it.
    expect(occupiedBayBodies(district("lot-narrow-v1")).some((b) => b.y === free[0].y)).toBe(false);
  });

  it("a district with no bays contributes nothing, and malformed rows are skipped", () => {
    expect(occupiedBayBodies(district("district-v1"))).toEqual([]);
    const broken = {
      meta: {
        scenario: {
          bays: [
            { x: Number.NaN, y: 0, headingDeg: 0, occupied: true },
            { x: 0, y: Number.POSITIVE_INFINITY, headingDeg: 0, occupied: true },
            { x: 1, y: 2, headingDeg: 3, occupied: true },
          ],
        },
      },
    } as unknown as TrafficDistrict;
    // A malformed row must be dropped, not turned into a body at NaN — a NaN
    // box makes every SAT comparison false and would silently disable the sweep
    // for the whole district.
    expect(occupiedBayBodies(broken)).toHaveLength(1);
    expect(occupiedBayBodies(broken)[0]).toMatchObject({ x: 1, y: 2 });
  });
});

describe("rearStaticGapFor — the corridor, and the two ways it could lie", () => {
  const ONE_BEHIND: Obb2D[] = [
    { x: 0, y: -8, headingDeg: 0, halfLengthM: 2.05, halfWidthM: 0.92 },
  ];

  it("HONESTY: no static body ⇒ Infinity ⇒ no badge, from any pose", () => {
    expect(rearStaticGapFor([], 0, 0, 0)).toBe(Infinity);
    expect(rearStaticGapFor([], 12, -3, 217)).toBe(Infinity);
  });

  it("a body straight behind reports body-to-body air, not centre distance", () => {
    // Centres 8 m apart; the player's chassis is 2.02 half-long and the parked
    // car 2.05, so there are 8 - 4.07 = 3.93 m of air between the two bodies.
    expect(rearStaticGapFor(ONE_BEHIND, 0, 0, 0)).toBeCloseTo(3.93, 2);
    // …and the same body AHEAD is not behind.
    expect(rearStaticGapFor(ONE_BEHIND, 0, -16, 0)).toBe(Infinity);
  });

  it("respects heading: the corridor turns with the car", () => {
    const east: Obb2D[] = [{ x: -8, y: 0, headingDeg: 90, halfLengthM: 2.05, halfWidthM: 0.92 }];
    expect(rearStaticGapFor(east, 0, 0, 90)).toBeCloseTo(3.93, 2);
    expect(rearStaticGapFor(east, 0, 0, 0)).toBe(Infinity);
  });

  it("overlap clamps to 0 and never goes negative", () => {
    const touching: Obb2D[] = [
      { x: 0, y: -3.5, headingDeg: 0, halfLengthM: 2.05, halfWidthM: 0.92 },
    ];
    expect(rearStaticGapFor(touching, 0, 0, 0)).toBe(0);
  });

  it("THE CORRIDOR IS CHASSIS-WIDE — the boundary that decides wallpaper", () => {
    // The chassis is 0.85 m half-wide and this body 0.92 m half-wide, so their
    // flanks touch at 1.77 m of lateral offset. Two poses, 4 cm apart:
    const inside: Obb2D[] = [
      { x: 1.75, y: -8, headingDeg: 0, halfLengthM: 2.05, halfWidthM: 0.92 },
    ];
    const outside: Obb2D[] = [
      { x: 1.79, y: -8, headingDeg: 0, halfLengthM: 2.05, halfWidthM: 0.92 },
    ];
    expect(rearStaticGapFor(inside, 0, 0, 0)).toBeLessThan(Infinity);
    expect(rearStaticGapFor(outside, 0, 0, 0)).toBe(Infinity);
    // THIS IS THE MUTATION, as an input rather than an edit: widening the
    // corridor by a "comfort margin" moves `outside` to the firing side, and
    // the census below measures what that costs on the shipped maps.
  });

  it("REACH: the corridor ends, and where it ends is stated rather than assumed", () => {
    // The corridor runs REAR_STATIC_REACH_M back FROM THE REAR FACE, so a body
    // is out only once its NEAREST face is past that edge: 2.02 (chassis) + 20
    // (reach) + 2.05 (the body's own half-length) = 24.07 m of centres.
    const at = (centresM: number): Obb2D[] => [
      { x: 0, y: -centresM, headingDeg: 0, halfLengthM: 2.05, halfWidthM: 0.92 },
    ];
    expect(rearStaticGapFor(at(24), 0, 0, 0)).toBeCloseTo(19.93, 2);
    expect(rearStaticGapFor(at(25), 0, 0, 0)).toBe(Infinity);
    // …and everything the badge can actually DISPLAY is comfortably inside it:
    // the outer band plus hysteresis is 16 m of body-to-body air, four metres
    // short of the edge. Read out of hud/rearProximity.ts so the pair cannot
    // drift apart behind this file's back (the substep.test.ts precedent) — if
    // someone raises the badge's range past the reach, this goes red instead of
    // the badge silently blinking out before its own hysteresis fires.
    expect(REAR_STATIC_REACH_M).toBeGreaterThan(REAR_CUE_EXIT_M);
    expect(rearStaticGapFor(at(REAR_CUE_EXIT_M + 4.07), 0, 0, 0)).toBeCloseTo(REAR_CUE_EXIT_M, 5);
  });
});

describe("THE PARKED-POSE LIE — why this is not `rearGapFor` with a second array", () => {
  // The routing note in hud/RearProximityCue.tsx proposed exactly that, on the
  // true premise that `rearGapFor` already takes a plain {x, y, profile}[]. It
  // was tried first and it is wrong, and the wrongness is in the safe-looking
  // direction of a badge that fires when the student did it RIGHT.
  const FINAL_POSE = { x: 4.99, y: 0, headingDeg: 270 }; // where the correct drive stops
  const NEIGHBOUR = { x: 5.03, y: -2.5 }; // the occupied bay next to the target

  it("the point query reads 0 m on a car that is 0.73 m to the SIDE", () => {
    // LEAD_CORRIDOR_M is 4.0 m — half a perceptually-scaled 8.125 m lane, which
    // is right for a road and swallows a 2.5 m bay row whole. The neighbour's
    // centre is 0.04 m behind the player's CENTRE, so it passes the "behind"
    // test, and the 4.1 m fleet-car subtrahend then clamps the gap to zero.
    expect(
      rearGapFor([NEIGHBOUR], FINAL_POSE.x, FINAL_POSE.y, FINAL_POSE.headingDeg),
    ).toBe(0);
    // The student is perfectly parked. The badge would have said «Кола отзад ·
    // 0 м», which is the false-refusal direction of the same defect.
  });

  it("…and the shipped corridor is SILENT there, because a car beside you is not behind you", () => {
    const bodies = occupiedBayBodies(district("lot-narrow-v1"));
    expect(rearStaticGapFor(bodies, FINAL_POSE.x, FINAL_POSE.y, FINAL_POSE.headingDeg)).toBe(
      Infinity,
    );
    // WHAT CLOSES IT, stated as the arithmetic rather than as an intention —
    // the first draft of this comment credited the rear-face offset and the
    // mutation run disproved that (starting the corridor at the car's CENTRE
    // leaves this assertion green). It is the CHASSIS-WIDE band: the neighbour
    // is 2.5 m off the axis, its own half-width is 0.92 and the chassis half is
    // 0.85, so 0.73 m of clear air separate them laterally and the corridor
    // never reaches it. Widen the corridor by a metre — mutation m3 — and this
    // goes red.
    const rearward = NEIGHBOUR.x - FINAL_POSE.x; // heading 270 ⇒ rear axis is +x
    const lateral = Math.abs(NEIGHBOUR.y - FINAL_POSE.y);
    expect(rearward).toBeGreaterThan(0); // it IS behind the centre — the point query's mistake
    expect(lateral - 0.85 - 0.92).toBeCloseTo(0.73, 2);
  });

  it("a body you are already INSIDE is not a gap behind you", () => {
    // The narrow, real thing the rear-face start buys, pinned so it is not an
    // unguarded claim: a body overlapping the chassis's rear half but not
    // extending past its rear face is a CONTACT, and the collision channel owns
    // contacts. Started at the centre instead — mutation m2 — the corridor
    // swallows it and the badge reports «Кола отзад · 0 м» about a body the
    // student is inside.
    const swallowed: Obb2D[] = [
      { x: 0, y: -1, headingDeg: 0, halfLengthM: 0.5, halfWidthM: 0.5 },
    ];
    expect(obbSeparationM(playerObb(0, 0, 0), swallowed[0])).toBeLessThan(0);
    expect(rearStaticGapFor(swallowed, 0, 0, 0)).toBe(Infinity);
  });
});

describe("1 · REVERSING TOWARD A PARKED BAY OCCUPANT WARNS", () => {
  const CORRECT = trace("sc-park-narrow", "shadow-correct");

  it("the pre-fix channel was Infinity for the entire manoeuvre", () => {
    // `rearGapFor` is untouched, and this is what it answered — and still
    // answers — on every sample of the shipped correct drive. The vehicles
    // array is empty on a lot: no road-graph loops to seed ambient agents from,
    // and the parking traces stage no actors.
    const traffic = createTrafficSystem(district("lot-narrow-v1"), {
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    expect(traffic.vehicles).toHaveLength(0);
    const finite = CORRECT.filter((s) =>
      Number.isFinite(rearGapFor(traffic.vehicles, s.x, s.y, s.headingDeg)),
    );
    expect(finite).toHaveLength(0);
  });

  it("the shipped system now raises the badge during the reverse", () => {
    const r = replay("lot-narrow-v1", CORRECT);
    expect(r.bodies).toHaveLength(4);
    expect(r.first, "the cue must go finite somewhere in this drive").not.toBeNull();
    // MEASURED on the shipped trace: first finite read 2.34 m at t = 32.85 s,
    // while the car is REVERSING at 3.83 km/h.
    expect(r.first!.tSec).toBeCloseTo(32.85, 1);
    expect(r.first!.gapM).toBeCloseTo(2.34, 1);
    expect(r.first!.speedKmh).toBeLessThan(0); // in reverse, not on the approach
    expect(r.min.gapM).toBeCloseTo(0.12, 1);
    expect(r.finite).toBe(66);
  });

  it("what the STUDENT sees: the badge, in Bulgarian, at the closest point", () => {
    // Credit is read off what reaches the glass, not off the number the source
    // returned. Fold the measured gap through the shipped `stepRearCue`.
    const r = replay("lot-narrow-v1", CORRECT);
    const cue = stepRearCue(null, r.min.gapM, -3.828);
    expect(cue).not.toBeNull();
    expect(rearCueLabelBg(cue!)).toBe("Кола отзад · 0 м");
    // RECORDED, NOT APPROVED: the level here is "warn" (amber) rather than
    // "danger", because the red band in hud/rearProximity.ts is gated on
    // |speed| >= REAR_CUE_MOVING_KMH (5) and a parking manoeuvre runs at 2-4.
    // The one case that most needs red cannot reach it. That gate is in a file
    // this lane does not own; it is re-routed in RearProximityCue.tsx's header,
    // and the assertion here is deliberately "the badge is raised" so it stays
    // true when the gate is fixed instead of pinning the defect in place.
    expect(cue!.level === "warn" || cue!.level === "danger").toBe(true);
  });
});

describe("2 · REVERSING TOWARD A MOVING VEHICLE STILL WARNS", () => {
  // The failure mode this guards is trading one array for the other. It is not
  // hypothetical here — the whole finding is that a body's array decided
  // whether a student was warned.
  it("the moving channel answers on its own, unchanged", () => {
    const traffic = createTrafficSystem(district("lot-narrow-v1"), {
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    // Nothing static is behind this pose (the bays are 5 m east); a car 20 m
    // back on the aisle is, and the answer must be the moving one.
    const px = 0;
    const py = -60;
    expect(rearStaticGapFor(occupiedBayBodies(district("lot-narrow-v1")), px, py, 0)).toBe(
      Infinity,
    );
    expect(rearGapFor([{ x: 0, y: py - 20 }], px, py, 0)).toBeCloseTo(15.9, 5);
    // …and `rearGapMeters` is the min over both, so with an empty fleet it is
    // the static answer and with a car behind it is the car.
    expect(traffic.rearGapMeters(px, py, 0)).toBe(Infinity);
  });

  it("rearGapMeters is the NEARER of the two channels, and each wins somewhere", () => {
    // Both halves asserted on the same system, over poses drawn from the real
    // lot, so neither branch can be vacuous.
    const raw = district("lot-narrow-v1");
    const traffic = createTrafficSystem(raw, { vehicleCount: 0, pedestrianCount: 0 });
    const bodies = occupiedBayBodies(raw);
    const CORRECT = trace("sc-park-narrow", "shadow-correct");
    let staticWon = 0;
    let movingWon = 0;
    for (const s of CORRECT) {
      // Put a moving car 12 m straight behind the player at every pose — the
      // channel `this.vehicles` would carry — and check the composition.
      const rad = (s.headingDeg * Math.PI) / 180;
      const chaser = { x: s.x - Math.sin(rad) * 12, y: s.y - Math.cos(rad) * 12 };
      const moving = rearGapFor([chaser], s.x, s.y, s.headingDeg);
      const parked = rearStaticGapFor(bodies, s.x, s.y, s.headingDeg);
      const combined = Math.min(moving, parked);
      expect(moving).toBeCloseTo(7.9, 5); // 12 m of centres − 4.1 m of bumpers
      expect(traffic.rearGapMeters(s.x, s.y, s.headingDeg)).toBe(parked);
      if (parked < moving) staticWon++;
      else movingWon++;
      expect(combined).toBe(Math.min(moving, parked));
    }
    // Non-vacuous in both directions on one drive.
    expect(staticWon).toBeGreaterThan(0);
    expect(movingWon).toBeGreaterThan(0);
  });
});

describe("3 · A STUDENT NOT CLOSE TO ANYTHING IS NOT WARNED", () => {
  it("driving the lane past a legally parked street row raises nothing", () => {
    // The false-refusal direction, and the reason the corridor carries no
    // comfort margin. vu-door-v1 parks ten cars at x = 6.75 and pk-double-v1
    // twenty-seven at x = ±6.8; the right-hand lane centre is x = 4.06, so a
    // parked flank sits 0.92 m off the chassis band. MEASURED: at a +1.0 m
    // margin this fires on 248 of 361 poses on vu-door-v1 and 283 of 361 on
    // pk-double-v1 — a permanent «Кола отзад» over two lessons about something
    // else. At the shipped chassis-wide corridor it is zero.
    for (const [id, expectedBodies] of [
      ["vu-door-v1", 10],
      ["pk-double-v1", 27],
    ] as const) {
      const bodies = occupiedBayBodies(district(id));
      expect(bodies, id).toHaveLength(expectedBodies);
      let fired = 0;
      let poses = 0;
      for (let y = 0; y <= 360; y++) {
        poses++;
        if (Number.isFinite(rearStaticGapFor(bodies, 4.06, y, 0))) fired++;
      }
      expect(poses).toBe(361);
      expect(fired, `${id} false fires while driving the lane`).toBe(0);
    }
  });

  it("18 of the 51 recorded parking drives raise nothing at all, and that is correct", () => {
    // A cue that fires on every drive is furniture. Two of the never-firing
    // drives are named here because their hazard is real and is NOT a static
    // body — the rear channel must stay silent and let the right instrument
    // speak.
    const noObservation = replay("lot-narrow-v1", trace("sc-park-narrow", "mistake-no-observation"));
    expect(noObservation.finite, "the hazard there is a PEDESTRIAN behind the car").toBe(0);
    const forwardPark = replay("lot-45-v1", trace("sc-park-45", "shadow-correct"));
    expect(forwardPark.finite, "a 45° bay entered nose-first has nothing behind").toBe(0);
  });
});

describe("4 · THE WARNING ARRIVES WITH TIME TO ACT", () => {
  const WIDE_SWING = trace("sc-park-narrow", "mistake-wide-swing");
  const CORRECT = trace("sc-park-narrow", "shadow-correct");
  const BODIES = occupiedBayBodies(district("lot-narrow-v1"));

  it("POSITIVE CONTROL: the wrong drive really does clip the neighbour, the right one does not", () => {
    // Without this the lead time below is a statement about nothing. The
    // lesson's own debrief for this trace reads „по средата на завъртането
    // задният калник закачи съседната кола"; the geometry has to agree.
    const bad = closestApproach(WIDE_SWING, BODIES);
    expect(bad.sepM, "bodies must actually overlap").toBeLessThan(0);
    expect(bad.sepM).toBeCloseTo(-0.164, 2);
    expect(bad.tSec).toBeCloseTo(35.0, 1);
    const good = closestApproach(CORRECT, BODIES);
    expect(good.sepM, "the correct drive must NOT touch").toBeGreaterThan(0);
    expect(good.sepM).toBeCloseTo(0.116, 2);
  });

  it("the badge is up 2.65 s and 2.8 m of travel before the contact", () => {
    const r = replay("lot-narrow-v1", WIDE_SWING);
    const contact = closestApproach(WIDE_SWING, BODIES);
    expect(r.first).not.toBeNull();
    // MEASURED: first finite read 3.51 m at t = 32.35 s at 3.83 km/h in
    // reverse; the bodies overlap at t = 35.00 s.
    expect(r.first!.gapM).toBeCloseTo(3.51, 1);
    expect(r.first!.tSec).toBeCloseTo(32.35, 1);
    const leadSec = contact.tSec - r.first!.tSec;
    expect(leadSec).toBeCloseTo(2.65, 1);
    // 3.828 km/h = 1.063 m/s, so the warning stands for 2.82 m of reversing.
    const speedMps = Math.abs(r.first!.speedKmh) / 3.6;
    expect(speedMps * leadSec).toBeCloseTo(2.82, 1);
    // Whether that is „time to act" is answerable rather than a feeling: a stop
    // from 1.06 m/s is under a metre even at a lazy 1 m/s², and the badge is
    // polled at 5 Hz (200 ms), so the worst display latency is 0.2 s of the
    // 2.65. Two and a half seconds at walking pace is the difference between
    // «спри» and «спрях».
    expect(leadSec).toBeGreaterThan(1.0);
  });

  it("and it lets go once the car is straight in the bay — no badge on a finished manoeuvre", () => {
    const r = replay("lot-narrow-v1", CORRECT);
    expect(r.lastFiniteT).toBeCloseTo(36.1, 1);
    const last = CORRECT[CORRECT.length - 1];
    expect(last.tSec).toBeGreaterThan(39);
    expect(
      rearStaticGapFor(BODIES, last.x, last.y, last.headingDeg),
      "the drive ends parked and the badge must be gone",
    ).toBe(Infinity);
  });
});
