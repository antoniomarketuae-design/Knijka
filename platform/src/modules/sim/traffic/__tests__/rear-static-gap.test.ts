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
 * FIVE THINGS ARE PROVED HERE, and the ones that keep it honest are the
 * refusals — a cue that fires always is wallpaper, and wallpaper is the same
 * crime pointing the other way:
 *
 *   1. reversing toward a PARKED bay occupant warns;
 *   2. reversing toward a MOVING vehicle STILL warns — no array was traded for
 *      the other, and the reported number is the nearer of the two;
 *   3. a student who is NOT close to anything is NOT warned: silent on the pose
 *      the correct drive finishes on, and silent for all 722 poses of driving
 *      the lane past the 37 legally parked cars of vu-door-v1 + pk-double-v1;
 *   4. the warning arrives with time to act, and the number is stated;
 *   5. O61 — when it speaks it can say the one thing that matters: RED reaches
 *      a parking manoeuvre, and still refuses to fire on a car standing still
 *      or reversing with metres of air behind it.
 *
 * BLOCK 2 WAS INERT UNTIL 2026-08-20 AND IS WHY THIS PARAGRAPH EXISTS. It
 * asserted the composition of two channels on a system built with
 * `vehicleCount: 0`, against a „chaser" that was a local literal rather than a
 * body in the system: mutating `rearGapMeters` to `return parked;` — deleting
 * the moving channel this file is named for — left it 22 of 22 green. It now
 * stages a real actor on the lot's own approach road, so both channels are
 * live, and each is pinned by a pose the other cannot produce. The general
 * lesson is written at the block: an assertion whose expected value is
 * RECOMPUTED from the same inputs guards nothing, and `expect(combined).toBe(
 * Math.min(moving, parked))` was that, one line under its own definition.
 *
 * THE REPLAY IS A PROBE, SO IT CARRIES A POSITIVE CONTROL. Every „0 defects"
 * instrument in this project failed in the reassuring direction, so before this
 * file is allowed to assert a lead time it first requires the WRONG drive to
 * actually contain the contact its own debrief describes (bodies overlapping,
 * `obbSeparationM < 0`) and the CORRECT drive to contain none. A trace that
 * quietly stopped clipping the neighbour would make every timing assertion
 * below an assertion about nothing, and it goes red instead. Block 5's census
 * carries the same thing in its own shape: it asserts its population (36,367
 * samples over all 51 drives) and that the trace directory holds no parking
 * lesson its map does not name, BEFORE it is allowed to report any zero.
 *
 * O62 — the held scenery this district source still cannot see (the panel van
 * of `sc-park-van`) — is closed one layer up, where the scene knows what it
 * mounted: `components/sim/__tests__/rearStaticBodies.test.ts`.
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { obbSeparationM, playerObb, type Obb2D } from "../../collision";
import {
  REAR_CUE_DANGER_M,
  REAR_CUE_EXIT_M,
  REAR_CUE_MOVING_KMH,
  REAR_CUE_REVERSING_KMH,
  rearCueClosing,
  rearCueLabelBg,
  stepRearCue,
} from "../../hud/rearProximity";
import {
  createTrafficSystem,
  occupiedBayBodies,
  rearGapFor,
  REAR_STATIC_REACH_M,
  rearStaticGapFor,
} from "../system";
import {
  type StagedVehicleSpec,
  type TrafficDistrict,
  type TrafficUpdateContext,
} from "../types";

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

/**
 * THE WHOLE PARKING FAMILY, lesson → the district its template loads.
 *
 * Hardcoded rather than read out of `lessons/scenario` on purpose: a traffic
 * test importing the lesson compiler inverts the module direction (doc
 * architecture/05), and the two names here are the same pair the drives were
 * recorded against. `driveNames` below then walks the shipped trace directory,
 * so a NEW drive is picked up automatically — and the coverage assertion in
 * block 5 fails if a new lesson directory appears that this map does not name,
 * which is the half a hardcoded list normally gets wrong.
 */
const PARKING_FAMILY: readonly (readonly [string, string])[] = [
  ["sc-park-45", "lot-45-v1"],
  ["sc-park-45-rev", "lot-45rev-v1"],
  ["sc-park-bay-exit-rev", "lot-perp-v1"],
  ["sc-park-double", "lot-double-v1"],
  ["sc-park-gap-long", "lot-gap-long-v1"],
  ["sc-park-gap-short", "lot-gap-short-v1"],
  ["sc-park-judge", "lot-gap-judge-v1"],
  ["sc-park-left", "lot-left-v1"],
  ["sc-park-narrow", "lot-narrow-v1"],
  ["sc-park-night", "lot-night-v1"],
  ["sc-park-parallel", "lot-par-v1"],
  ["sc-park-parallel-exit", "lot-par-v1"],
  ["sc-park-perp-forward", "lot-perp-v1"],
  ["sc-park-perp-rev", "lot-perp-v1"],
  ["sc-park-van", "lot-van-v1"],
  ["sc-park-wall", "lot-wall-v1"],
  ["sc-park-zebra", "lot-zebra-v1"],
];

/**
 * A drive's samples with NO per-drive floor.
 *
 * `trace()` above asserts >100 samples, which is a positive control for the
 * handful of drives this file names one at a time. The census in block 5 reads
 * all 51, and some are legitimately short — `sc-park-bay-exit-rev/
 * mistake-blind-reverse` is 97 samples and `sc-park-parallel-exit`'s runs are
 * 155–353. Its positive control is the corpus total instead.
 */
function traceSamples(lessonId: string, name: string): TraceSample[] {
  const file = path.join(repoRoot(), "content", "traces", lessonId, `${name}.trace.json`);
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { samples: TraceSample[] }).samples;
}

/** Every committed drive of one lesson, by name. */
function driveNames(lessonId: string): string[] {
  const dir = path.join(repoRoot(), "content", "traces", lessonId);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".trace.json"))
    .map((f) => f.replace(".trace.json", ""));
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
    // O61, CLOSED: this used to be amber. 0.12 m from a parked car showed the
    // student the same colour as „something is back there somewhere", because
    // the red band was gated on |speed| >= 5 km/h and a parking manoeuvre runs
    // at 2–4 by definition. Block 5 is where that is pinned in both directions.
    expect(cue!.level).toBe("danger");
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

  // ── THIS BLOCK USED TO BE INERT, AND THE TELL WAS THE ASSERTION ──────────
  //
  // It read `expect(traffic.rearGapMeters(…)).toBe(parked)` against a system
  // built with `vehicleCount: 0` on a lot that seeds no ambient traffic. The
  // „chaser" was a local literal handed to a standalone `rearGapFor`; it was
  // never IN the system, so the moving channel was never exercised through the
  // real method and the composition was asserted against a constant. Beside it,
  // `expect(combined).toBe(Math.min(moving, parked))` compared a value with its
  // own definition one line above.
  //
  // MEASURED: mutate `rearGapMeters` to `return parked;` — deleting the moving
  // channel outright, the exact failure this block is named for — and the file
  // stayed 22 of 22 green.
  //
  // The repair is a system that CONTAINS a moving vehicle. `lot-narrow-v1`
  // carries a real approach road (`lot-e-approach`, residential, lot-n-start →
  // lot-n-gate) even though its aisle is `service` and therefore outside the
  // lane graph, so a staged actor can be put on it and driven. Every number
  // below is then an answer from the shipped method, and each of the two
  // channels is pinned by a pose the other cannot produce.

  /** A real staged car on the lot's own approach lane, held 40 m along it. */
  const CHASER: StagedVehicleSpec = {
    kind: "vehicle",
    id: "chaser",
    pathNodes: ["lot-n-start", "lot-n-gate"],
    hold: { nodeIndex: 0, offsetM: 40 },
    cruiseSpeedMps: 8,
  };
  const CTX: TrafficUpdateContext = { signalPhase: () => "green", playerPos: null };

  function lotWithChaser() {
    const raw = district("lot-narrow-v1");
    const traffic = createTrafficSystem(raw, {
      seed: 1,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    const view = traffic.stage(CHASER);
    expect(view, "the lot's approach lane must resolve a staged path").not.toBeNull();
    // THE POINT OF THE REPAIR: the car is IN the system now.
    expect(traffic.vehicles).toHaveLength(1);
    return { raw, traffic, view: view! };
  }

  it("the system CONTAINS a moving vehicle, and rearGapMeters answers about it", () => {
    const { raw, traffic, view } = lotWithChaser();
    // Held at y = −80 on the northbound approach lane (x = 4.0625).
    expect(view.x).toBeCloseTo(4.0625, 4);
    expect(view.y).toBeCloseTo(-80, 4);
    // Player 20 m up the lane. Nothing static is within reach here — the bays
    // are 75 m north — so this pose can ONLY be answered by the moving channel.
    const px = 4.0625;
    const py = -60;
    expect(rearStaticGapFor(occupiedBayBodies(raw), px, py, 0)).toBe(Infinity);
    // 20 m of centres − 4.1 m of bumpers.
    expect(traffic.rearGapMeters(px, py, 0)).toBeCloseTo(15.9, 4);

    // …and it is genuinely a MOVING answer: let the car cruise and the reported
    // gap closes through the shipped method, second by second. MEASURED.
    traffic.stagedCommand("chaser", { type: "cruise" });
    const seq: number[] = [];
    for (let sec = 0; sec < 4; sec++) {
      for (let f = 0; f < 60; f++) traffic.update(1 / 60, CTX);
      seq.push(traffic.rearGapMeters(px, py, 0));
    }
    expect(view.speedMps).toBeCloseTo(8, 3); // it really did accelerate
    expect(seq[0]).toBeCloseTo(14.58, 1);
    expect(seq[1]).toBeCloseTo(10.66, 1);
    expect(seq[2]).toBeCloseTo(4.14, 1);
    expect(seq[3]).toBe(0);
    // Monotone, so this cannot pass on a frozen or a random number.
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThan(seq[i - 1]);
  });

  it("BOTH channels finite at once, and the nearer body is the one reported", () => {
    // The composition, on poses where neither channel is Infinity — so `min`
    // is a real choice rather than a fallback. Player on the lane heading
    // north, bay row behind, chaser 90-odd metres back down the approach.
    const { traffic } = lotWithChaser();
    const px = 4.0625;
    for (const [py, moving, combined] of [
      [12, 87.9, 4.06],
      [10, 85.9, 2.06],
      [8, 83.9, 0.06],
    ] as const) {
      const m = rearGapFor(traffic.vehicles, px, py, 0);
      expect(m, `moving channel at y=${py}`).toBeCloseTo(moving, 2);
      expect(Number.isFinite(m)).toBe(true);
      expect(traffic.rearGapMeters(px, py, 0), `reported at y=${py}`).toBeCloseTo(combined, 2);
      // The reported number is the PARKED one and it is twenty times nearer —
      // so `return moving` cannot survive this, and neither can an average.
      expect(traffic.rearGapMeters(px, py, 0)).toBeLessThan(m / 10);
    }
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

// ---------------------------------------------------------------------------
// O61 — THE RED BAND CAN REACH A PARKING MANOEUVRE.
//
// Blocks 1–4 are about WHETHER the badge speaks. This one is about what it
// says when it does, and it was the sharper half of what O59 left open. The
// severity ramp gated red on `Math.abs(speedKmh) >= REAR_CUE_MOVING_KMH` (5),
// defended as „a car parked on your bumper at a light is normal city life".
// True of a queue; false of a bay you are reversing INTO at 2–4 km/h. Measured
// on the same drive block 1 uses: 739 samples of no badge, 66 of amber,
// **0 of red**, with a bottom of 0.116 m — twelve centimetres from a parked
// car, in the same colour as „something is back there somewhere".
//
// THE FIX SPLIT ONE NUMBER INTO TWO QUESTIONS: distance decides the band
// (REAR_CUE_DANGER_M, unchanged), and `rearCueClosing` decides whether red is
// relevant. Everything below is the both-directions proof — the corpus figures
// are here rather than in the hud unit test because only this file already
// holds the shipped traces AND the shipped source.
// ---------------------------------------------------------------------------

describe("5 · RED MEANS „CLOSING ON SOMETHING CLOSE“ — both halves", () => {
  it("slow reverse toward a parked car at close range is RED", () => {
    // The exact pose block 1 measures: 0.116 m at −3.828 km/h.
    const r = replay("lot-narrow-v1", trace("sc-park-narrow", "shadow-correct"));
    expect(r.min.gapM).toBeCloseTo(0.116, 2);
    expect(stepRearCue(null, r.min.gapM, -3.828)!.level).toBe("danger");
    // …and it is the SIGN that does it, not the magnitude: the same 0.116 m at
    // the same speed FORWARDS is not red, because the gap is not closing.
    expect(stepRearCue(null, r.min.gapM, 3.828)!.level).toBe("warn");
  });

  it("slow reverse with metres of clear air is NOT red — the false-refusal direction", () => {
    // A badge that is always red is wallpaper, and wallpaper is the same crime
    // pointing the other way. REAR_CUE_DANGER_M still decides the band.
    for (const gapM of [4, 5.5, 7.9]) {
      expect(stepRearCue(null, gapM, -3.0)!.level, `${gapM} m in reverse`).toBe("warn");
    }
    expect(stepRearCue(null, 9, -3.0)!.level).toBe("info");
    expect(stepRearCue(null, 14, -3.0)!.level).toBe("info");
  });

  it("standing still with a wall on the bumper is still NOT red — the gate's own job", () => {
    // This is what the |speed| gate was written for and it must survive.
    // `speedKmh` is a live rapier velocity, so a car at rest dithers around
    // zero; the band is −0.8 km/h, the same number the cockpit's gear readout
    // uses to display „R".
    expect(stepRearCue(null, 0.3, 0)!.level).toBe("warn");
    expect(stepRearCue(null, 0.3, -0.4)!.level).toBe("warn"); // dither, not reverse
    expect(stepRearCue(null, 0.3, -0.8)!.level).toBe("warn"); // exactly at the band
    expect(stepRearCue(null, 0.3, 2)!.level).toBe("warn"); // creeping FORWARD in a queue
    // …and one tick past it, the car is in reverse and the answer changes.
    expect(stepRearCue(null, 0.3, -0.81)!.level).toBe("danger");
  });

  it("a car approaching from behind at speed still warns — no channel traded away", () => {
    // The original gate, unchanged, on the original case: tailgated at road
    // speed. Both halves of `rearCueClosing` are live.
    expect(rearCueClosing(30)).toBe(true);
    expect(rearCueClosing(-30)).toBe(true);
    expect(rearCueClosing(0)).toBe(false);
    expect(stepRearCue(null, 2.0, 30)!.level).toBe("danger");
    expect(stepRearCue(null, 6.0, 30)!.level).toBe("warn"); // distance still rules
  });

  it("THE CORPUS: what actually changed across all 51 recorded parking drives", () => {
    // Replayed through the SHIPPED source and the SHIPPED cue. The two zeroes
    // are the load-bearing rows — they are the claims that could have gone
    // wrong in the reassuring direction, so they are asserted exactly.
    let samples = 0;
    let badgeUp = 0;
    let red = 0;
    let redWhileNeither = 0;
    let slowReverseClearAir = 0;
    let slowReverseClearAirRed = 0;
    for (const [lessonId, districtId] of PARKING_FAMILY) {
      const traffic = createTrafficSystem(district(districtId), {
        vehicleCount: 0,
        pedestrianCount: 0,
      });
      for (const name of driveNames(lessonId)) {
        for (const s of traceSamples(lessonId, name)) {
          samples++;
          const gapM = traffic.rearGapMeters(s.x, s.y, s.headingDeg);
          const cue = stepRearCue(null, gapM, s.speedKmh);
          if (cue === null) continue;
          badgeUp++;
          const reversing = s.speedKmh < REAR_CUE_REVERSING_KMH;
          const slowReverse = reversing && s.speedKmh > -REAR_CUE_MOVING_KMH;
          if (slowReverse && gapM >= REAR_CUE_DANGER_M) slowReverseClearAir++;
          if (cue.level !== "danger") continue;
          red++;
          if (!reversing && Math.abs(s.speedKmh) < REAR_CUE_MOVING_KMH) redWhileNeither++;
          if (slowReverse && gapM >= REAR_CUE_DANGER_M) slowReverseClearAirRed++;
        }
      }
    }
    // POSITIVE CONTROL FIRST — a corpus walk that quietly stopped finding
    // traces would report every zero below and look like a clean bill. And a
    // parking lesson added later must not be able to sit outside the census.
    const onDisk = fs
      .readdirSync(path.join(repoRoot(), "content", "traces"))
      .filter((d) => d.startsWith("sc-park-"))
      .sort();
    expect(onDisk).toEqual(PARKING_FAMILY.map(([id]) => id).slice().sort());
    // 36 367 → 36 375 on 2026-09-01: `sc-park-parallel-exit`'s shadow gained
    // ONE authored beat — a 0.4 s `pause` between the mirror and the shoulder
    // check at the move-off, which the recorder needs because it carries a
    // single pending glance sample and two glance steps drained back to back
    // land only the last one. 0.4 s at the recorder's 20 Hz is exactly the 8
    // samples this census gained; nothing else in the corpus moved. The
    // recording changed because the DRILL changed: `MirrorGlanceKind` grew
    // `"shoulder"`, so „Огледало и през ЛЯВО РАМО преди изнасянето" is now
    // performed instead of being mimed with the interior mirror.
    expect(samples).toBe(36375);
    // …and the badge is up for all eight of them (4 350 → 4 358): the beat is
    // a braked pause in the parallel slot with the car behind still inside the
    // cue's range, so the badge state does not change — only its duration.
    expect(badgeUp).toBe(4358);
    // MEASURED: red went 82 → 2,296 frames, all of them reversing inside 4 m.
    // UNCHANGED by the eight new samples, and that is the check on the story
    // above rather than a coincidence: those samples are `speedKmh: 0` under a
    // held brake, and `danger` requires `rearCueClosing(speedKmh)`.
    expect(red).toBe(2296);
    // The two that must be zero, and they are the whole honesty argument.
    //
    // A REFUTER CALLED BOTH OF THESE TAUTOLOGIES AND THE MEASUREMENT SAYS
    // OTHERWISE — recorded here because the argument is genuinely tempting and
    // will be made again. It reads: `danger` requires `gapM < REAR_CUE_DANGER_M`,
    // so `danger && gapM >= REAR_CUE_DANGER_M` is `count(x < 4 && x >= 4)`; and
    // `danger` implies `rearCueClosing(v)`, so the `redWhileNeither` predicate is
    // its own negation.
    //
    // Both halves are true ONLY WHILE `stepRearCue` IS CORRECT, and that is the
    // thing under test. `cue.level` here comes from the shipped function; the
    // gap and the speed are classified independently from the trace. Change the
    // function and the counters go non-zero. Measured 2026-08-20, mutating
    // `hud/rearProximity.ts` and running this file alone:
    //
    //   danger no longer requires gapM < REAR_CUE_DANGER_M  → 3 blocks RED,
    //       including this census, on "red while neither reversing nor at
    //       traffic speed"
    //   danger no longer requires rearCueClosing(speedKmh)  → 3 blocks RED,
    //       including this census
    //
    // A self-contradictory predicate over an INDEPENDENT classifier is not a
    // tautology; it is the shape of every conservation check. What would make it
    // one is re-deriving `danger` here from the same constants instead of
    // reading it off the function — which is what the file must never start
    // doing, and is why `stepRearCue` is called rather than reimplemented.
    expect(redWhileNeither, "red while neither reversing nor at traffic speed").toBe(0);
    expect(slowReverseClearAir, "the false-refusal population must be non-empty").toBe(571);
    expect(slowReverseClearAirRed, "slow reverse with 4 m+ of air must never be red").toBe(0);
  });
});
