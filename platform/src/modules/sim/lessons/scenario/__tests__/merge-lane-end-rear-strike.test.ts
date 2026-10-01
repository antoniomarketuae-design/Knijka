/**
 * sc-merge-lane-end:0487bcec [critical] — THE STUDENT WHO MERGED EARLY WAS
 * RAMMED FROM BEHIND AND BILLED FOR IT.
 *
 * Filed from the w66 re-drive of 9792cd4, and the same object in the same phase
 * on w47, w52 and w61 (.audit-frames/w66-landing-pc/frames/
 * sc-merge-lane-end__pc-right/04-t018s.png): the student merges early into the
 * EMPTY through lane — instruction 2 («Забележи края на лентата РАНО…») tells
 * him to — and coasts on at ~28.5 км/ч. The staged лепка behind him
 * (`sc-mle-through-car`, a RearTailgaterSpec with passShiftM 0) finishes its
 * pressure window and runs its «pass» at the posted 50 IN HIS LANE: first
 * impulse at y 88.8 in laneId 1 (+24.8 км/ч in one tick on a coasting car),
 * then shoves to 52, 61 and 77 км/ч and into the railing. The sheet reads
 * «Удар в друго превозно средство» −10, НЕИЗДЪРЖАН, with the FORWARD-collision
 * explanation («…колкото ти е трябвал, за да спреш»).
 *
 * THE CAUSE, re-derived from source: `RearTailgaterRunner.stage` stages the
 * actor `playerGuard: false` for its whole life (the flag exists so the GLUED
 * pose may sit sub-6 m behind him), and the pass is `cruise passSpeedMps` +
 * `laneShift passShiftM` — with passShiftM 0 that is a car driven at 50 км/ч
 * through the body in front of it. The live rapier channel then bills the
 * contact to the student: the tailgater is not in the sentinel's cast (empty
 * `contactCast`, by policy), so the report arrives anonymous, `withWhat:
 * "vehicle"`, and `collisionMinKmh` is 0 on every scenario lesson.
 *
 * WHAT IS REAL HERE. The committed ln-merge-v1 district through the production
 * `createWorldRuntime` + `createTrafficSystem` + `createScenarioDirector` with
 * the lesson's OWN compiled `stagedEvents` (compileScenario, L1), and the
 * production rule engine folding every tick. Only two things are modelled, and
 * each is modelled the way the product does it:
 *
 *   · the STUDENT — a kinematic car with the live hero's ramp (1.95 m/s²) that
 *     merges early, finishing the lane change where the product's green ribbon
 *     reaches the through lane (y ≈ 54), then holds a steady pace;
 *   · the PHYSICS CONTACT — rapier's `onCollisionEnter` fires when the two
 *     colliders start touching. The staged shell's collider IS `actorObb(pose,
 *     profile)` (NpcColliders sizes it through that call) and the hero's is
 *     `playerObb`; on the rising edge of `isContact` this pushes exactly what
 *     `LessonScene.handleCollision` pushes for a body outside the cast —
 *     `runtime.pushCollision("vehicle")` — before the frame's `sample()`, as the
 *     physics step does. The rig's gate is `impactKmh >= collisionMinKmh`,
 *     which is 0 on scenario lessons, so every touch is a report.
 *
 * THE TWIN. sc-merge-roadworks-shift stages the same runner the same way
 * (`sc-mrs-through-car`, passShiftM 0, the same ±4.06 lanes, spawn y 12) and
 * its own doc measures the same interpenetration for early merges, so it is
 * driven here too, at the overlapping cells of that grid.
 *
 * NOT VACUOUS: §0 requires the лепка to have been RELEASED and to have come up
 * behind the student in HIS lane — the exposure the finding is about. Delete
 * the actor, or stop it releasing, and §0 fails before §1/§2 can pass.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../../rules";
import { createScenarioDirector } from "../../../orchestrator/director";
import { actorObb, isContact, obbSeparationM, playerObb } from "../../../collision";
import type { RearTailgaterSpec, StagedEventSpec } from "../../../contracts";
import { compileScenario } from "../compile";
import type { ScenarioSpec } from "../types";
import { SC_MERGE_LANE_END, SC_MERGE_ROADWORKS_SHIFT } from "../templates-merging";

const REPO_ROOT = join(process.cwd(), "..");

const DT = 1 / 30;
/** Lane centres (laneId 0 dies / is coned off, laneId 1 survives), identical
 *  on ln-merge-v1 and hz-roadworks-v1 — re-pinned here, the battery convention
 *  (merging-route-vs-staged.test.ts), and asserted by the census guard below. */
const X_ENDING = 4.06;
const X_THROUGH = -4.06;
const SPAWN_Y = 12;
/** The product's ribbon reaches the through lane by y ≈ 54 (w66 road record). */
const RIBBON_MERGED_Y = 54;
const MERGE_RAMP_SEC = 2;
/** One car length of centres — the sketch's floor for „never in his boot". */
const BODY_LENGTH_FLOOR_M = 5;

/** The lesson under test, compiled exactly as the product compiles it (L1). */
interface Subject {
  spec: ScenarioSpec;
  raw: TrafficDistrict;
  staged: StagedEventSpec[];
  car: RearTailgaterSpec;
}
function subject(spec: ScenarioSpec): Subject {
  const staged = (compileScenario(spec, 1).stagedEvents ?? []) as StagedEventSpec[];
  return {
    spec,
    raw: JSON.parse(
      readFileSync(join(REPO_ROOT, "content", "world", `${spec.map.districtId}.json`), "utf-8"),
    ) as TrafficDistrict,
    staged,
    car: staged.find((s): s is RearTailgaterSpec => s.kind === "rearTailgater")!,
  };
}

interface Drive {
  /** Rising edges of a collider overlap with the лепка (rapier's enter). */
  contactStarts: { tSec: number; playerY: number; actorBehind: boolean }[];
  /** Every COLLISION the rule engine billed to the student. */
  collisionBills: RuleEvent[];
  /** Tightest centre separation to the лепка while the student was in the through lane. */
  minSepInLaneM: number;
  /** Tightest OBB separation to the лепка over the drive. */
  minObbSepM: number;
  /** Did the лепка ever sit behind him, in his lane, within its glued reach? */
  gluedBehindInLane: boolean;
  finalY: number;
}

function drive(sub: Subject, kmh: number, mergedAtY: number, endY = 272): Drive {
  const THROUGH_CAR = sub.car;
  const runtime = createWorldRuntime(sub.raw);
  const traffic = createTrafficSystem(sub.raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const director = createScenarioDirector(sub.staged, traffic, { seed: 7, signals: runtime });
  let rules = createRuleEngine();
  const res: Drive = {
    contactStarts: [],
    collisionBills: [],
    minSepInLaneM: Infinity,
    minObbSepM: Infinity,
    gluedBehindInLane: false,
    finalY: SPAWN_Y,
  };
  let t = 0;
  let x = X_ENDING;
  let y = SPAWN_Y;
  let v = 0;
  let merging = false;
  let mergeStart = 0;
  let wasTouching = false;
  const target = kmh / 3.6;
  for (let i = 0; i < 120 * 30 && y < endY; i++) {
    t += DT;
    if (v < target) v = Math.min(target, v + 1.95 * DT);
    const dy = v * DT;
    y += dy;
    if (!merging && y >= mergedAtY - v * MERGE_RAMP_SEC) {
      merging = true;
      mergeStart = t;
    }
    const frac = merging ? Math.min(1, (t - mergeStart) / MERGE_RAMP_SEC) : 0;
    const nx = X_ENDING + (X_THROUGH - X_ENDING) * frac;
    const headingDeg = dy > 1e-6 ? (Math.atan2(nx - x, dy) * 180) / Math.PI : 0;
    x = nx;

    runtime.update(DT);
    traffic.update(DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x, y },
      playerSpeedKmh: v * 3.6,
      playerHeadingDeg: headingDeg,
    });

    // The physics contact, as rapier reports it: onCollisionEnter on the
    // rising edge of the two colliders touching.
    const a = traffic.staged(THROUGH_CAR.id);
    let touching = false;
    if (a) {
      const sep = obbSeparationM(playerObb(x, y, headingDeg), actorObb(a, THROUGH_CAR.actor.profile));
      res.minObbSepM = Math.min(res.minObbSepM, sep);
      touching = isContact(sep);
      const inThroughLane = Math.abs(x - X_THROUGH) < 1.0;
      const behindM = y - a.y;
      if (inThroughLane) {
        res.minSepInLaneM = Math.min(res.minSepInLaneM, Math.hypot(a.x - x, a.y - y));
        if (
          Math.abs(a.x - X_THROUGH) < 1.0 &&
          behindM > 0 &&
          behindM <= THROUGH_CAR.followBehindM + 4
        ) {
          res.gluedBehindInLane = true;
        }
      }
      if (touching && !wasTouching) {
        res.contactStarts.push({ tSec: Math.round(t * 100) / 100, playerY: Math.round(y * 10) / 10, actorBehind: behindM > 0 });
        // LessonScene.handleCollision for a body outside the sentinel's cast:
        // anonymous, withWhat "vehicle" (the tailgater's cast is empty).
        runtime.pushCollision("vehicle");
      }
    }
    wasTouching = touching;

    const tick = runtime.sample(
      {
        position: { x, y },
        headingDeg,
        speedKmh: v * 3.6,
        indicator: "off",
        headlights: "off",
        seatbeltOn: true,
        handbrakeOn: false,
        gear: 3,
        mirrorGlance: null,
      },
      t,
      false,
      false,
      Infinity,
    );
    const staged = director.step({
      tSec: t,
      dtSec: DT,
      x,
      y,
      speedKmh: v * 3.6,
      headingDeg,
      brakePedal: 0,
      tickEvents: tick.events,
    });
    if (staged.events.length > 0) tick.events.push(...staged.events);
    const { state, events } = reduceTick(rules, tick);
    rules = state;
    for (const e of events) {
      if (e.kind === "violation" && e.code === "COLLISION") res.collisionBills.push(e);
    }
    res.finalY = y;
  }
  return res;
}

/**
 * Both lessons that stage a through-lane лепка whose pass stays in its own lane
 * (passShiftM 0) on a two-lane road where the student's lane goes away. The
 * roadworks row is the SWEEP 161 „the correct drive collides" twin of the
 * filed row — same runner, same geometry, same early merge the card praises.
 */
const SUBJECTS: ReadonlyArray<{ sub: Subject; carId: string; cases: ReadonlyArray<{ kmh: number; mergedAtY: number }> }> = [
  {
    sub: subject(SC_MERGE_LANE_END),
    carId: "sc-mle-through-car",
    // The finding's own drive (≈30, coasting 28.5) plus the band either side
    // of it that SWEEP 161's grid shows overlapping (20 and 40 км/ч, early).
    cases: [
      { kmh: 28.5, mergedAtY: RIBBON_MERGED_Y },
      { kmh: 30, mergedAtY: RIBBON_MERGED_Y },
      { kmh: 20, mergedAtY: RIBBON_MERGED_Y },
      { kmh: 40, mergedAtY: RIBBON_MERGED_Y },
      { kmh: 30, mergedAtY: 100 },
      { kmh: 40, mergedAtY: 140 },
    ],
  },
  {
    sub: subject(SC_MERGE_ROADWORKS_SHIFT),
    carId: "sc-mrs-through-car",
    // The overlapping cells of templates-merging.ts's hz-roadworks grid.
    cases: [
      { kmh: 30, mergedAtY: 40 },
      { kmh: 30, mergedAtY: 120 },
      { kmh: 20, mergedAtY: 80 },
      { kmh: 12, mergedAtY: 40 },
    ],
  },
];

for (const { sub, carId, cases } of SUBJECTS) {
  describe(`${sub.spec.id} (0487bcec) — the лепка never rear-ends a student who merged early`, () => {
    it("the lesson still stages the лепка in the through lane, passing in its own lane (census guard)", () => {
      expect(sub.car?.id).toBe(carId);
      expect(sub.car.passShiftM).toBe(0);
      expect(sub.car.actor.extraRightOffsetM).toBeCloseTo(X_THROUGH - X_ENDING, 2);
    });

    for (const c of cases) {
      describe(`merged by y = ${c.mergedAtY}, holding ${c.kmh} км/ч in the through lane`, () => {
        const r = drive(sub, c.kmh, c.mergedAtY);

        it("§0 the exposure is real: the лепка came up behind him in HIS lane", () => {
          expect(r.finalY, "the drive never reached the finish").toBeGreaterThan(260);
          expect(
            r.gluedBehindInLane,
            "the лепка never sat behind the student in the through lane — §1/§2 would pass vacuously",
          ).toBe(true);
        });

        it("§1 its body never touches his, and it keeps a car length of centres", () => {
          expect(
            r.contactStarts,
            `the лепка's collider touched the student's ${r.contactStarts.length} time(s): ` +
              JSON.stringify(r.contactStarts.slice(0, 4)),
          ).toEqual([]);
          expect(r.minObbSepM).toBeGreaterThan(0);
          expect(r.minSepInLaneM).toBeGreaterThanOrEqual(BODY_LENGTH_FLOOR_M);
        });

        it("§2 no «Удар в друго превозно средство» is billed to the student", () => {
          expect(
            r.collisionBills.map((e) => ({ code: e.kind === "violation" ? e.code : e.kind, t: (e as { t?: number }).t })),
          ).toEqual([]);
        });
      });
    }
  });
}
