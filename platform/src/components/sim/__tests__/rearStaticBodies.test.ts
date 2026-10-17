/**
 * =============================================================================
 * O62 — THE REAR CUE SEES WHAT THE SCENE ACTUALLY MOUNTED.
 *
 * O59 (`traffic/__tests__/rear-static-gap.test.ts`) gave the rear-proximity
 * badge the district's occupied parking bays, which is why it stopped being
 * dark for the whole parking family. It left a second class of body out, and
 * the omission is invisible from inside the traffic module because the bodies
 * are not in the district at all: HELD SCENERY is added by lesson id in
 * `scene/scenarioSceneryProps.heldSceneryFor`, joins the occupied bays in
 * `buildLessonWorldCore`'s `scenarioObstacles`, and is mounted with a real
 * collider by `components/sim/ScenarioObstacles`. It is a body the student can
 * hit; it was not a body the cue could see.
 *
 * MEASURED BEFORE ANY OF THIS WAS WRITTEN, on `sc-park-van` — the drill whose
 * whole subject is reversing into a bay beside a tall panel van — by replaying
 * its three committed traces through the shipped `rearGapMeters`:
 *
 *   shadow-correct       44 of 832 samples warned, closest read 3.56 m
 *   mistake-early-turn   97 of 844 samples warned, closest read 0.59 m
 *
 * Neither number is about the van. Both are the neighbouring BAY cars, and the
 * body the student is actually reversing at — 0.40 m away on the correct drive,
 * touching on the wrong one — was reported as 3.56 m of clear air. The badge
 * was not silent here; it was confidently wrong by a factor of nine, which is
 * worse, because a student reads „3 m" and keeps going.
 *
 * §1 is the builder, §2 is the end-to-end replay through the SHIPPED recipe,
 * §3 is the refusal that keeps it honest (what is deliberately not fed), and
 * §4 is the routed half — including a filed premise this file measured and
 * found false.
 *
 * WHAT THIS FILE CANNOT SEE, AND WHERE IT IS SEEN INSTEAD (added 2026-08-20).
 * Every §2/§3/§4 number below is produced by `replay()`, which calls
 * `traffic.setRearStaticBodies(bodies)` ITSELF. So this file exercises the
 * RECIPE and the RECEIVER and never the DELIVERY — and a refuter proved the
 * cost: with BOTH publishers deleted from `LessonScene.tsx`, every test here
 * still passes, along with the other 11,696. `rearStaticBodiesSeam.test.tsx`
 * beside this one closes that by mounting the real component and reading the
 * publication off the rendered tree; it goes red for five separate mutations
 * that leave this file green. Numbers below and numbers there are the same
 * measurements from the two ends of one wire, and they must be kept equal.
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rearStaticBodiesFrom } from "../LessonScene";
import type { ObstacleColliderFootprint } from "../ScenarioObstacles";
import { obbSeparationM, playerObb } from "@/modules/sim/collision";
import { buildLessonWorldCore } from "@/modules/sim/scene/lessonWorldRecipe";
import { heldSceneryFor } from "@/modules/sim/scene/scenarioSceneryProps";
import type { ScenarioObstacleSpec } from "@/modules/sim/scene/obstacleSpec";
import { compileScenario, SCENARIO_TEMPLATES } from "@/modules/sim/lessons/scenario";
import type { ScenarioLevel } from "@/modules/sim/lessons/scenario";
import { lessonDistrictId } from "@/modules/sim/contracts";
import type { LessonSpec } from "@/modules/sim/lessons";
import { createTrafficSystem, type TrafficDistrict } from "@/modules/sim/traffic";
import { stepRearCue, rearCueLabelBg } from "@/modules/sim/hud";

// ---------------------------------------------------------------------------
// Fixtures — the SHIPPED district documents, the SHIPPED template table and
// the SHIPPED recorded drives. Nothing here is hand-built: the finding is
// about what the product mounts for a student, so the test has to ask the
// product.
// ---------------------------------------------------------------------------

function repoRoot(): string {
  for (const root of [process.cwd(), path.resolve(process.cwd(), "..")]) {
    if (fs.existsSync(path.join(root, "content", "world"))) return root;
  }
  throw new Error("content/world not found from " + process.cwd());
}

function districtDoc(id: string): TrafficDistrict {
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
 * The obstacle list LessonScene really holds, from the real recipe.
 *
 * NOT a re-implementation of the two lines in `buildLessonWorldCore` that
 * concatenate the occupied bays and `heldSceneryFor`. Re-implementing them
 * would make every number below a statement about this file rather than about
 * the product — the exact shape of the eight assertions this audit found
 * checking comment-stripped source text.
 */
function compiled(templateId: string, level: ScenarioLevel = 1): LessonSpec {
  const spec = SCENARIO_TEMPLATES.find((t) => t.id === templateId);
  expect(spec, `${templateId} is a shipped template`).toBeDefined();
  return compileScenario(spec!, level);
}

function sceneObstacles(templateId: string, level: ScenarioLevel = 1): ScenarioObstacleSpec[] {
  const lesson = compiled(templateId, level);
  return buildLessonWorldCore(lesson, districtDoc(lessonDistrictId(lesson))).scenarioObstacles;
}

/** The district id a compiled scenario lesson loads. */
function districtOf(templateId: string, level: ScenarioLevel = 1): string {
  return lessonDistrictId(compiled(templateId, level));
}

/** Replay a drive through a system whose rear bodies are `bodies`. */
function replay(districtId: string, samples: readonly TraceSample[], bodies?: ReturnType<typeof rearStaticBodiesFrom>) {
  const traffic = createTrafficSystem(districtDoc(districtId), {
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  if (bodies !== undefined) traffic.setRearStaticBodies(bodies);
  let finite = 0;
  let min = Infinity;
  let first: { tSec: number; gapM: number; speedKmh: number } | null = null;
  for (const s of samples) {
    const gapM = traffic.rearGapMeters(s.x, s.y, s.headingDeg);
    if (!Number.isFinite(gapM)) continue;
    finite++;
    if (first === null) first = { tSec: s.tSec, gapM, speedKmh: s.speedKmh };
    if (gapM < min) min = gapM;
  }
  return { finite, min, first };
}

// ---------------------------------------------------------------------------

describe("§1 rearStaticBodiesFrom — the builder", () => {
  const VAN: ScenarioObstacleSpec = {
    kind: "vehicle",
    x: 5.03,
    y: -2.7,
    headingDeg: 90,
    model: "kargo_v",
    seed: 41,
  };

  it("boxes a vehicle on its parked heading, with the fleet profile when no rig has reported", () => {
    const [box] = rearStaticBodiesFrom([VAN]);
    expect(box).toBeDefined();
    expect(box.x).toBe(5.03);
    expect(box.y).toBe(-2.7);
    // headingDeg 90 = east; actorObb takes a travel DIRECTION, and a parked
    // car's "direction" is the heading it stands on.
    expect(box.headingDeg).toBeCloseTo(90, 6);
    expect(box.halfLengthM).toBeCloseTo(2.05, 3);
    expect(box.halfWidthM).toBeCloseTo(0.92, 3);
  });

  it("a published footprint REPLACES the fleet box — and for this van that is 0.62 m", () => {
    // The halfLength is the RECORDED one: `hittableObstacleBodies`' own header
    // states that `kargo_v` measures 2.67 against a hatchback's 2.05. The
    // halfWidth here is simply a second, distinct value — this asserts that the
    // override reaches BOTH axes, and it is not claimed to be a measurement.
    // 0.62 m of length is not rounding: it is the difference between the badge
    // saying 0.4 m and saying 1.0 m to someone reversing at walking pace.
    const fp: ObstacleColliderFootprint[] = [{ index: 0, halfLengthM: 2.67, halfWidthM: 1.05 }];
    const [box] = rearStaticBodiesFrom([VAN], fp);
    expect(box.halfLengthM).toBe(2.67);
    expect(box.halfWidthM).toBe(1.05);
    // …and the pose is untouched by the footprint.
    expect(box.x).toBe(5.03);
  });

  it("a `visual` placement mounts no body but still CONSUMES its index", () => {
    // ObstacleColliderFootprint indexes the VEHICLE-FILTERED list and counts
    // visual placements without publishing them. If this function skipped them
    // before incrementing, footprint 1 would be applied to the wrong car —
    // silently, and only on lessons that carry visual dressing.
    const ghost: ScenarioObstacleSpec = { ...VAN, x: 0, y: 0, visual: true };
    const bodies = rearStaticBodiesFrom(
      [ghost, VAN],
      [{ index: 1, halfLengthM: 3.75, halfWidthM: 1.2 }],
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0].x).toBe(5.03);
    expect(bodies[0].halfLengthM).toBe(3.75);
    // The mutation this pins: drop `const i = index++` above the visual skip
    // and the footprint lands on nothing, leaving the van at 2.05.
    expect(bodies[0].halfLengthM).not.toBeCloseTo(2.05, 2);
  });

  it("an empty list is an empty answer — no phantom body from a lesson that mounts none", () => {
    expect(rearStaticBodiesFrom([])).toEqual([]);
  });
});

describe("§2 sc-park-van — the body the student is reversing at", () => {
  const DISTRICT_ID = "lot-van-v1";
  const OBSTACLES = sceneObstacles("sc-park-van");

  it("POSITIVE CONTROL: the recipe really does mount the van, and the drive really reaches it", () => {
    // Without this the deltas below are statements about nothing. The lesson's
    // held dressing is one `kargo_v` at (5.03, −2.7) — `scenarioSceneryProps`
    // names it in its own comment as a normal 0.79 m neighbour.
    expect(districtOf("sc-park-van")).toBe(DISTRICT_ID);
    const held = heldSceneryFor("sc-park-van@L1", districtDoc(DISTRICT_ID));
    expect(held).toHaveLength(1);
    expect(held[0].kind).toBe("vehicle");
    // 3 occupied bays + the held van.
    expect(OBSTACLES).toHaveLength(4);
    const bodies = rearStaticBodiesFrom(OBSTACLES);
    expect(bodies).toHaveLength(4);
    // The correct drive passes within 0.64 m of the van's body (as the fleet
    // box stands it); the wrong one touches the van itself. If a re-recorded
    // trace ever stopped doing that, every number below would be measuring air.
    // RE-MEASURED 2026-10-11 (catalogue-demo-curvature:dae908c7): the lesson's
    // demos were re-authored as drives the product car can perform — the 90°
    // swing on its own 4.6 m circle from 2 m off the row, and a mistake demo
    // that STOPS on the van instead of driving 2.3 m into it. The numbers below
    // are those drives'; what each one proves is unchanged.
    const vanBox = bodies.find((b) => b.y === -2.7)!;
    let closestCorrect = Infinity;
    for (const s of trace("sc-park-van", "shadow-correct")) {
      const d = obbSeparationM(playerObb(s.x, s.y, s.headingDeg), vanBox);
      if (d < closestCorrect) closestCorrect = d;
    }
    expect(closestCorrect).toBeCloseTo(0.64, 1);
    expect(closestCorrect).toBeGreaterThan(0); // correct drive does NOT touch
  });

  it("the badge was reporting 3.60 m of air with the van 0.64 m behind", () => {
    const samples = trace("sc-park-van", "shadow-correct");
    const before = replay(DISTRICT_ID, samples);
    const after = replay(DISTRICT_ID, samples, rearStaticBodiesFrom(OBSTACLES));
    // The district-only channel: 94 reads, none of them the van.
    expect(before.finite).toBe(94);
    expect(before.min).toBeCloseTo(3.596, 2);
    // With the scene's own bodies: the van is nearer, and it is nearer early.
    expect(after.finite).toBe(148);
    expect(after.min).toBeCloseTo(0.641, 2);
    expect(after.first!.tSec).toBeCloseTo(37.85, 1);
    expect(after.first!.speedKmh).toBeLessThan(0); // reversing, not on approach
  });

  it("…and on the WRONG drive the student reaches it: 2.31 m → 0.48 m on the fleet box, 0.00 m on the van's own", () => {
    const samples = trace("sc-park-van", "mistake-early-turn");
    const before = replay(DISTRICT_ID, samples);
    const after = replay(DISTRICT_ID, samples, rearStaticBodiesFrom(OBSTACLES));
    // The same 74 poses read a body either way; WHICH body is the difference:
    // the bay car 2.31 m off, or the van the tail is about to meet.
    expect(before.finite).toBe(74);
    expect(before.min).toBeCloseTo(2.309, 2);
    expect(after.finite).toBe(74);
    expect(after.min).toBeCloseTo(0.479, 2);
    expect(after.first!.speedKmh).toBeLessThan(0);
    // The re-recorded demo comes to rest ON the van (0.12 m into the 2.65 m
    // body the gate stands there, 0.18 m into the van's own) instead of 2.3 m
    // inside it — so the 2.05 m fleet box still shows half a metre of air, and it is the van's OWN
    // footprint (§1: half-length 2.67, the 0.62 m the box is short) that reads
    // the contact. That is the footprint channel doing its job, on this drive.
    const real = replay(
      DISTRICT_ID,
      samples,
      rearStaticBodiesFrom(OBSTACLES, [{ index: 3, halfLengthM: 2.67, halfWidthM: 1.05 }]),
    );
    expect(real.finite).toBe(74);
    expect(real.min).toBe(0);
  });

  it("what the STUDENT sees at the closest point of the CORRECT drive", () => {
    // Credit is read off what reaches the glass. 0.64 m while reversing at
    // −2.376 km/h is inside REAR_CUE_DANGER_M and the gap is closing, so this
    // is the O61 band as well: red, and the number is honest.
    const cue = stepRearCue(null, 0.6408, -2.376);
    expect(cue).not.toBeNull();
    expect(cue!.level).toBe("danger");
    expect(rearCueLabelBg(cue!)).toBe("Кола отзад · 1 м");
    // …and what it USED to say, from the same drive, before this wiring: the
    // bay car three and a half metres away, in amber-adjacent calm.
    expect(rearCueLabelBg(stepRearCue(null, 3.596, -2.376)!)).toBe("Кола отзад · 4 м");
  });

  it("a drive whose hazard is NOT a static body stays silent, before and after", () => {
    // `mistake-blind-reverse` is graded on a PEDESTRIAN behind the car. A cue
    // that started firing here would be furniture, and it would be covering
    // the instrument that should be speaking.
    const samples = trace("sc-park-van", "mistake-blind-reverse");
    expect(replay(DISTRICT_ID, samples).finite).toBe(0);
    expect(replay(DISTRICT_ID, samples, rearStaticBodiesFrom(OBSTACLES)).finite).toBe(0);
  });
});

describe("§3 the replacement is LOSSLESS where there is nothing held", () => {
  it("sc-park-narrow reads identically through the scene's bodies and the district's", () => {
    // `setRearStaticBodies` REPLACES rather than appends, so O59's answer has
    // to survive the swap on a lesson with no held vehicles. It does, to the
    // last centimetre — both paths box the same four bay occupants with the
    // same `actorObb`. If they ever diverge, one of them is a second source of
    // truth for one body, which is the defect `collision/bodies.ts` records.
    const samples = trace("sc-park-narrow", "shadow-correct");
    const before = replay("lot-narrow-v1", samples);
    const after = replay("lot-narrow-v1", samples, rearStaticBodiesFrom(sceneObstacles("sc-park-narrow")));
    expect(before.finite).toBe(66);
    expect(after.finite).toBe(before.finite);
    expect(after.min).toBeCloseTo(before.min, 9);
    expect(after.min).toBeCloseTo(0.1157, 3);
  });

  it("a lesson that mounts NOTHING publishes nothing — the painted-bay phantom", () => {
    // `buildLessonWorldCore` builds obstacles only for a SCENARIO lesson id, so
    // a hand-authored lesson on a bay-carrying district shows painted bays with
    // no cars in them. The district-derived default would have warned about
    // bodies that are not there; an empty publish is the honest answer, and
    // LessonScene publishes on mount precisely so this case is reached.
    const samples = trace("sc-park-narrow", "shadow-correct");
    const empty = replay("lot-narrow-v1", samples, rearStaticBodiesFrom([]));
    expect(empty.finite).toBe(0);
    expect(empty.min).toBe(Infinity);
  });
});

describe("§4 what is NOT fed, and one filed premise that is false", () => {
  it("the garage wall is excluded, because the badge can only say „Кола отзад“", () => {
    // One wall exists in the whole product: `sc-park-wall`'s garage end wall.
    // It mounts an exact cuboid collider and it is a body a student can hit —
    // but this badge's only sentence names a CAR, and „Кола отзад · 1 м" about
    // a concrete wall is the badge stating something false, which is the
    // failure the whole channel exists to avoid. Feeding it needs a gap query
    // carrying the body KIND plus a second, human-signed Bulgarian string;
    // those must land together.
    const obstacles = sceneObstacles("sc-park-wall");
    expect(obstacles.some((o) => o.kind === "wall")).toBe(true);
    const bodies = rearStaticBodiesFrom(obstacles);
    // 4 occupied bays, 0 walls.
    expect(bodies).toHaveLength(obstacles.filter((o) => o.kind === "vehicle").length);
    expect(bodies).toHaveLength(4);
  });

  it("REFUTED: „mistake-into-wall is silent for the entire drive“ is true and means nothing", () => {
    // THE FINDING AS FILED: the lesson is literally called „into the wall" and
    // the cue says nothing for the whole drive — 0 finite reads of 681 samples
    // (651 since the drive was re-authored on the car's own circle, 2026-10-11,
    // and 652 since round 2 stops it ON its contact point instead of 5 cm
    // short of it: catalogue-demo-curvature:dae908c7).
    // The count is exact and reproduced below. The inference drawn from it is
    // false, and the trace says so in three independent ways.
    const samples = trace("sc-park-wall", "mistake-into-wall");
    expect(samples).toHaveLength(652);

    // ONE. The drive NEVER REVERSES. Not „reverses slowly", not „reverses
    // below the gate" — there is not one negative sample in it. The whole
    // manoeuvre is forward, and it ends stopped against the wall.
    expect(samples.filter((s) => s.speedKmh < 0)).toHaveLength(0);
    expect(Math.max(...samples.map((s) => s.speedKmh))).toBeCloseTo(17.82, 1);

    // TWO. The wall is IN FRONT at the contact. The last moving sample is
    // +2.4 км/ч at t = 30.95 s, and at the final pose the car's NOSE (2.02 m
    // ahead of its centre, along its own heading) is 0.02 m past the wall's
    // south face (the wall is 0.4 m thick about y = 8.6, so its face is 8.4)
    // and inside its 6 m length. The lesson's closing annotation says the same
    // thing in Bulgarian: «Предницата опря в стената в края на реда» — the
    // FRONT touched the wall. (The old demo drove 0.4 m THROUGH the wall and
    // this check measured against its centre line; the re-authored one stops
    // on its face.)
    const last = samples[samples.length - 1];
    expect(last.speedKmh).toBe(0); // stopped ON the wall
    const rad = (last.headingDeg * Math.PI) / 180;
    const noseX = last.x + 2.02 * Math.sin(rad);
    const noseY = last.y + 2.02 * Math.cos(rad);
    expect(noseY - 8.4).toBeCloseTo(0.02, 1);
    expect(Math.abs(noseY - 8.4)).toBeLessThan(0.15); // i.e. touching, at the nose
    expect(noseX).toBeGreaterThan(5.03 - 3);
    expect(noseX).toBeLessThan(5.03 + 3);

    // THREE. Wiring the wall in would not change this drive by one sample:
    // it is never in the rear corridor at any pose of any of the lesson's
    // three recorded drives. A rear-proximity badge that spoke here would be
    // reporting a body the student is driving INTO nose-first, and that is the
    // false-warning direction rather than the missing-warning one.
    const withWall = [
      ...rearStaticBodiesFrom(sceneObstacles("sc-park-wall")),
      { x: 5.03, y: 8.6, headingDeg: 90, halfLengthM: 3, halfWidthM: 0.2 },
    ];
    for (const name of ["mistake-into-wall", "shadow-correct", "mistake-clip-neighbour"]) {
      const drive = trace("sc-park-wall", name);
      const withoutWall = replay("lot-wall-v1", drive, rearStaticBodiesFrom(sceneObstacles("sc-park-wall")));
      const wall = replay("lot-wall-v1", drive, withWall);
      expect(wall.finite, `${name}: the wall adds nothing behind`).toBe(withoutWall.finite);
    }
    expect(
      replay("lot-wall-v1", samples, rearStaticBodiesFrom(sceneObstacles("sc-park-wall"))).finite,
    ).toBe(0);
  });
});
