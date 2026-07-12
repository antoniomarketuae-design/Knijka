/**
 * B3 multi-map seam + ПОЛИГОН lesson validation (map program doc 74, wave 1).
 *
 * Three layers:
 *  1. SEAM REGRESSION — every shipped playable spec's districtId resolves to
 *     a real JSON in platform/public/world (byte-identical to content/world,
 *     the publish step), the curriculum + exam stay pinned to district-v1,
 *     полигон entries to poligon-v1, and every spawn pointId resolves in the
 *     lesson's OWN district file.
 *  2. PER-MAP SAFETY — bay paint isolation (city bays never default onto the
 *     полигон and vice versa; doc 74 §5.4), tiny полигон traffic (§5.5),
 *     polygon data pinned against the real poligon-v1.json runtime.
 *  3. FULL ENGINE RUN on l8-poligon — createLessonSession → pre-drive
 *     (practice mode) → simulated ticks completing the circuit drive, the
 *     reverse bay park and the smooth stop → completed + passed.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISTRICT_ID,
  DEFAULT_LESSON_TRAFFIC,
  lessonDistrictId,
  PERCEPTUAL_ROAD_SCALE,
  type LessonSpec,
} from "../../contracts";
import { PRE_DRIVE_STEP_ORDER } from "../../procedures";
import { createWorldRuntime } from "../../runtime";
import type { SimTick } from "../../rules";
import {
  applyPreDriveStep,
  applyTick,
  buildLessonResult,
  createLessonSession,
} from "../engine";
import { EXAM_BANK_PARKING_BAYS } from "../examBankData";
import { parseObjectiveParams } from "../objectives";
import { isExamUnlocked } from "../progression";
import {
  EXAM_LESSON,
  LESSON_PARKING_BAYS,
  LESSONS,
  POLIGON_LESSONS,
  lessonById,
  lessonParkingBaysFor,
} from "../specs";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

// ---------------------------------------------------------------------------
// World-file access (vitest cwd is platform/, but stay path-defensive the
// same way the poligon-district world test does)
// ---------------------------------------------------------------------------

function firstExisting(candidates: string[]): string {
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  throw new Error(`none of these files exist: ${candidates.join(", ")}`);
}

function publicWorldPath(districtId: string): string {
  return firstExisting([
    path.join(process.cwd(), "public", "world", `${districtId}.json`),
    path.join(process.cwd(), "platform", "public", "world", `${districtId}.json`),
  ]);
}

function contentWorldPath(districtId: string): string {
  return firstExisting([
    path.join(process.cwd(), "content", "world", `${districtId}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${districtId}.json`),
  ]);
}

function loadPublicWorld(districtId: string): {
  spawnPoints: Array<{ id: string; x: number; y: number; heading: number }>;
} {
  return JSON.parse(fs.readFileSync(publicWorldPath(districtId), "utf8"));
}

const ALL_PLAYABLE: readonly LessonSpec[] = [...LESSONS, ...POLIGON_LESSONS, EXAM_LESSON];
const l8 = lessonById("l8-poligon")!;
const l0p = lessonById("l0p-poligon-free")!;

// ---------------------------------------------------------------------------
// 1. Seam regression
// ---------------------------------------------------------------------------

describe("multi-map seam — shipped specs resolve to real worlds", () => {
  it("EVERY playable spec's districtId has a JSON in public/world (the fetch target)", () => {
    for (const lesson of ALL_PLAYABLE) {
      const districtId = lessonDistrictId(lesson);
      expect(
        fs.existsSync(publicWorldPath(districtId)),
        `${lesson.id} → /world/${districtId}.json`,
      ).toBe(true);
    }
  });

  it("the public copy of every referenced world is byte-identical to content/world (publish step)", () => {
    const districtIds = [...new Set(ALL_PLAYABLE.map(lessonDistrictId))];
    expect(districtIds.sort()).toEqual(["district-v1", "poligon-v1"]);
    for (const id of districtIds) {
      const pub = fs.readFileSync(publicWorldPath(id));
      const src = fs.readFileSync(contentWorldPath(id));
      expect(Buffer.compare(pub, src), `${id}.json public vs content`).toBe(0);
    }
  });

  it("district-v1 lessons still load their map: the whole curriculum AND the exam stay pinned", () => {
    for (const lesson of LESSONS) {
      expect(lessonDistrictId(lesson), lesson.id).toBe(DEFAULT_DISTRICT_ID);
    }
    // The A13 exam pins the city — its route, staged events and bay are
    // district-v1 coordinates (exam-spec.test.ts verifies the geometry).
    expect(lessonDistrictId(EXAM_LESSON)).toBe(DEFAULT_DISTRICT_ID);
    for (const lesson of POLIGON_LESSONS) {
      expect(lessonDistrictId(lesson), lesson.id).toBe("poligon-v1");
    }
  });

  it("every spawn pointId resolves in the lesson's OWN district file", () => {
    for (const lesson of ALL_PLAYABLE) {
      if (!lesson.spawn.pointId) continue;
      const world = loadPublicWorld(lessonDistrictId(lesson));
      const ids = world.spawnPoints.map((s) => s.id);
      expect(ids, `${lesson.id} spawn ${lesson.spawn.pointId}`).toContain(lesson.spawn.pointId);
    }
  });

  it("полигон entries stay OUT of the linear curriculum but resolve via lessonById (wire path)", () => {
    const curriculumIds = new Set(LESSONS.map((l) => l.id));
    for (const lesson of POLIGON_LESSONS) {
      expect(curriculumIds.has(lesson.id)).toBe(false);
      expect(lessonById(lesson.id)).toBe(lesson);
    }
    // Ids unique across every playable spec (wire/grading key space).
    expect(new Set(ALL_PLAYABLE.map((l) => l.id)).size).toBe(ALL_PLAYABLE.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Per-map safety: bay paint, traffic sizing, poligon-v1 data pinning
// ---------------------------------------------------------------------------

describe("per-map bay paint isolation (doc 74 §5.4)", () => {
  it("the builder default (LESSON_PARKING_BAYS) carries ONLY city bays — no полигон leak", () => {
    const l7 = lessonById("l7-parking")!;
    expect(LESSON_PARKING_BAYS).toEqual([l7.parkingBay]);
    expect(LESSON_PARKING_BAYS).not.toContain(l8.parkingBay);
  });

  it("per-district paint sets are disjoint and complete", () => {
    const l7 = lessonById("l7-parking")!;
    // B1b: the city set = curriculum bays + the exam bank's authored bays
    // (painted always, like L7's, so a drawn variant never grades against an
    // invisible rect). The полигон must see NEITHER.
    expect(lessonParkingBaysFor(DEFAULT_DISTRICT_ID)).toEqual([
      l7.parkingBay,
      ...EXAM_BANK_PARKING_BAYS,
    ]);
    expect(lessonParkingBaysFor("poligon-v1")).toEqual([l8.parkingBay]);
    expect(lessonParkingBaysFor("no-such-district")).toEqual([]);
  });
});

describe("полигон traffic sizing (doc 74 §5.5)", () => {
  it("полигон lessons run a couple of agents, not a boulevard", () => {
    for (const lesson of POLIGON_LESSONS) {
      expect(lesson.traffic?.vehicleCount, lesson.id).toBeLessThanOrEqual(4);
      expect(lesson.traffic?.pedestrianCount, lesson.id).toBeLessThanOrEqual(4);
    }
  });

  it("the fallback keeps the pre-seam city values (no behavior change for old specs)", () => {
    expect(DEFAULT_LESSON_TRAFFIC).toEqual({
      vehicleCount: 26,
      pedestrianCount: 20,
      anchorRadiusM: 280,
    });
    // No curriculum lesson overrides traffic — they all ride the default.
    for (const lesson of LESSONS) {
      expect(lesson.traffic, lesson.id).toBeUndefined();
    }
  });
});

describe("l8 data pins to the real poligon-v1.json", () => {
  const raw = () => JSON.parse(fs.readFileSync(publicWorldPath("poligon-v1"), "utf8"));

  it("every objective parses under the hardened evaluators", () => {
    for (const lesson of POLIGON_LESSONS) {
      for (const objective of lesson.objectives) {
        expect(() => parseObjectiveParams(objective), objective.id).not.toThrow();
      }
    }
  });

  it("the graded bay IS the painted bay (single source, the L7 pattern)", () => {
    const park = l8.objectives.find((o) => o.id === "l8-park")!;
    const params = parseObjectiveParams(park);
    if (params.kind !== "completeManeuver" || params.maneuver !== "parkInBay") {
      throw new Error("expected the parkInBay maneuver");
    }
    expect(params.bay).toEqual(l8.parkingBay);
  });

  it("the bay stays inside the scaled apron carriageway", () => {
    // pg-e-apron-bays: centerline x = 95, 2 service lanes → scaled half-width
    // = 3.25 × PERCEPTUAL_ROAD_SCALE. Bay center offset + half-width must fit.
    const halfWidthM = 3.25 * PERCEPTUAL_ROAD_SCALE;
    const bay = l8.parkingBay!;
    expect(Math.abs(bay.x - 95) + bay.widthM / 2).toBeLessThanOrEqual(halfWidthM);
  });

  it("the runtime locates the bay on the apron in the 20 km/h zone and the spawn on its edge", () => {
    const runtime = createWorldRuntime(raw());
    const bay = l8.parkingBay!;
    expect(runtime.locate({ x: bay.x, y: bay.y }).edgeId).toBe("pg-e-apron-bays");
    expect(runtime.speedLimitAt({ x: bay.x, y: bay.y })).toBe(20);
    // Both полигон specs spawn at pg-spawn-1 on the старт-стоп straight.
    const spawn = raw().spawnPoints.find(
      (s: { id: string }) => s.id === l8.spawn.pointId,
    ) as { x: number; y: number };
    expect(runtime.locate({ x: spawn.x, y: spawn.y }).edgeId).toBe("pg-e-s3");
  });

  it("l0p is a true sandbox: no objectives, ready to roll, always unlocked", () => {
    expect(l0p.objectives).toEqual([]);
    expect(l0p.vehicleStart).toBe("ready");
    expect(l0p.unlockAfterLessonId).toBeUndefined();
    expect(isExamUnlocked(l0p, [])).toBe(true);
  });
});

describe("полигон unlock gates (the exam-card pattern)", () => {
  it("l8 is locked for a brand-new student and unlocks once L1 is PASSED", () => {
    expect(l8.unlockAfterLessonId).toBe("l1-preparation");
    expect(isExamUnlocked(l8, [])).toBe(false);
    expect(
      isExamUnlocked(l8, [{ lessonId: "l1-preparation", passed: false, score: 9 }]),
    ).toBe(false);
    expect(
      isExamUnlocked(l8, [{ lessonId: "l1-preparation", passed: true, score: 2 }]),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Full lesson-engine run on l8 — pre-drive → circuit → bay park → stop
// ---------------------------------------------------------------------------

describe("full engine run on l8-poligon", () => {
  const DT = 0.5;

  /** Points spaced ≤ stepM along a waypoint polyline (excludes the start). */
  function* walk(waypoints: Array<[number, number]>, stepM: number) {
    for (let i = 1; i < waypoints.length; i++) {
      const [ax, ay] = waypoints[i - 1];
      const [bx, by] = waypoints[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / stepM));
      for (let k = 1; k <= n; k++) {
        yield [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n] as [number, number];
      }
    }
  }

  it("completes every objective and passes", () => {
    let s: LessonSessionState = createLessonSession(l8);
    expect(s.phase).toBe("preDrive");
    expect(s.preDrive).not.toBeNull();

    // Pre-drive (practice mode): perform the full canonical procedure — the
    // 13 real steps end in move-off, which flips the session to driving.
    let t = 0;
    for (const stepId of PRE_DRIVE_STEP_ORDER) {
      s = applyPreDriveStep(s, stepId, ++t).state;
    }
    expect(s.phase).toBe("driving");
    expect(s.objectives[0].status).toBe("active");
    // A clean canonical procedure scores nothing.
    expect(s.events.filter((e) => e.kind === "violation")).toEqual([]);

    const tick = (over: Partial<SimTick>) => {
      t += DT;
      s = applyTick(s, makeTick({ t, headingDeg: 90, gear: 1, ...over })).state;
    };

    // -- l8-circuit: ~1 km around the perimeter + spine + into the apron
    //    mouth, ticked every ≤8 m at a legal 25 km/h (circuit limit is 30).
    const route: Array<[number, number]> = [
      [20, -130], // pg-spawn-1
      [170, -130], // старт-стоп права, east
      [190, -110], // SE corner arc
      [190, 110], // източна права, north
      [170, 130], // NE corner arc
      [0, 130], // северна права, west
      [0, 0], // централна алея, south through the 4-way
      [0, -130], // back to the south straight
      [95, -130], // east to the apron mouth (pg-n-p1)
      [95, -85], // north up the „Коридор за паркиране" (20 km/h)
    ];
    for (const [x, y] of walk(route, 8)) {
      const onApron = x > 90 && y > -130 + 1e-9 && Math.abs(x - 95) < 6;
      tick({
        position: { x, y },
        speedKmh: onApron ? 15 : 25,
        maxSpeedKmh: onApron ? 20 : 30,
      });
    }
    expect(s.objectives[0].status).toBe("done"); // 400 m accumulated long ago
    expect(s.objectives[1].status).toBe("active");

    // -- l8-park: reverse into the bay (98.5, −70, axis east), then hold.
    //    Reverse credit accrues inside the 15 m maneuver zone; entering the
    //    rect opens attempt 1; 1.5 s at rest, centered + aligned → done.
    const reversePath: Array<[number, number]> = [
      [96, -80],
      [97, -77],
      [98, -74],
      [98.5, -71.4],
      [98.5, -70],
    ];
    for (const [x, y] of reversePath) {
      tick({ position: { x, y }, speedKmh: 5, maxSpeedKmh: 20, gear: -1 });
    }
    for (let i = 0; i < 5; i++) {
      tick({ position: { x: 98.5, y: -70 }, speedKmh: 0, maxSpeedKmh: 20, gear: -1 });
    }
    expect(s.objectives[1].status).toBe("done");
    const parkDetail = s.objectives[1].detail;
    expect(parkDetail?.kind).toBe("parkInBay");
    if (parkDetail?.kind === "parkInBay") {
      expect(parkDetail.attempts).toBe(1);
      expect(parkDetail.inBay).toBe(true);
      expect(parkDetail.alignment).toBe("centered");
    }
    expect(s.objectives[2].status).toBe("active");

    // -- l8-smooth-stop: pull out, arm the attempt at ≥15 km/h, then brake
    //    gently (2.2 m/s² < the 3.5 limit) to a full stop on the apron.
    const accel: Array<[number, number, number]> = [
      [97.5, -69.5, 6],
      [99, -69, 12],
      [101, -68.5, 16],
    ];
    for (const [x, y, v] of accel) {
      tick({ position: { x, y }, speedKmh: v, maxSpeedKmh: 20 });
    }
    for (const v of [12, 8, 4, 0]) {
      tick({ position: { x: 101.5, y: -68 }, speedKmh: v, maxSpeedKmh: 20 });
    }
    expect(s.objectives[2].status).toBe("done");
    expect(s.phase).toBe("completed");

    const result = buildLessonResult(s);
    expect(result.completedAll).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(0);
    // Objectives completed strictly in order.
    const doneTimes = result.objectives.map((o) => o.completedAtSec!);
    expect(doneTimes[0]).toBeLessThan(doneTimes[1]);
    expect(doneTimes[1]).toBeLessThan(doneTimes[2]);
  });
});
