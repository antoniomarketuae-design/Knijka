/**
 * EVERY LESSON MUST BE ABLE TO FIND ITS OWN STARTING POINT.
 *
 * THE FRAMES this came from are the four world findings routed to
 * `lessonWorldRecipe.ts`: `sc-junction-left/mobile-right/04-t083s.png` (13
 * км/ч across a bare grey plane, nothing in view at all), `sc-junction-blind/
 * mobile-right/04-t076s.png` (open field where the briefing promises a corner
 * building), `sc-ov-lane-keeping/mobile-right/07b-menu.png` (parked on a slab
 * in an empty field). Their common sentence is „the car is not in the world
 * the lesson was written for", and the ENDING half of that is now O22
 * (`stepOffNetwork`, commit 7404468 — a car off the network gets told so).
 *
 * THIS FILE GUARDS THE ENTRY HALF, which is the one `buildLessonWorldCore`
 * owns. It is the only function in the codebase that holds a `LessonSpec` and
 * its district document at the same time, and the spawn list it returns is
 * built by an unchecked cast with a `?? []` behind it:
 *
 *   const spawnPoints = (raw as { spawnPoints?: SpawnPointLike[] }).spawnPoints ?? [];
 *
 * `spawnPose` (LessonScene.tsx:398) then does
 * `spawnPoints.find(s => s.id === lesson.spawn.pointId)` followed by
 * `p?.x ?? explicit?.x ?? 0`. A `pointId` that is not in the loaded district
 * therefore raises nothing at all: the car is placed at district ORIGIN facing
 * north — the middle of the junction on every scenario junction map — and
 * every objective after that is graded against a route the student never
 * joined. One renamed spawn point in a generator is enough.
 *
 * IT IS LATENT, NOT LIVE, AND THAT IS STATED AS A MEASUREMENT: §1 walks every
 * playable spec and finds 0 unresolved. A census that had quietly stopped
 * finding lessons would report the same 0, so §1 asserts its own population
 * first and §3 shows the check convicting a lesson built to fail it.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLessonWorldCore } from "../lessonWorldRecipe";
import { compileScenario, SCENARIO_TEMPLATES } from "../../lessons/scenario";
import type { ScenarioLevel } from "../../lessons/scenario";
import { EXAM_LESSON, LESSONS, POLIGON_LESSONS } from "../../lessons/specs";
import { lessonDistrictId } from "../../contracts";
import type { LessonSpec } from "../../lessons";

function districtDoc(districtId: string): unknown | null {
  const file = path.resolve(__dirname, `../../../../../public/world/${districtId}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/** Every spec a student can actually open: the curriculum chain, the полигон
 *  cards, the A13 exam, and every scenario template at every authored rung. */
const PLAYABLE: LessonSpec[] = (() => {
  const out: LessonSpec[] = [...LESSONS, ...POLIGON_LESSONS, EXAM_LESSON];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const rung of spec.levels) out.push(compileScenario(spec, rung.level as ScenarioLevel));
  }
  return out;
})();

interface Row {
  lessonId: string;
  districtId: string;
  pointId: string | undefined;
  resolved: boolean;
}

/** One row per lesson, taken from the RECIPE'S OWN OUTPUT rather than from the
 *  raw JSON — the point is that what `buildLessonWorldCore` hands the scene is
 *  what `spawnPose` will search, so anything the recipe drops shows up here. */
const CENSUS: Row[] = (() => {
  const docs = new Map<string, unknown | null>();
  const out: Row[] = [];
  for (const lesson of PLAYABLE) {
    const districtId = lessonDistrictId(lesson);
    if (!docs.has(districtId)) docs.set(districtId, districtDoc(districtId));
    const raw = docs.get(districtId);
    if (raw === null || raw === undefined) {
      out.push({ lessonId: lesson.id, districtId, pointId: lesson.spawn.pointId, resolved: false });
      continue;
    }
    const core = buildLessonWorldCore(lesson, raw);
    const pid = lesson.spawn.pointId;
    out.push({
      lessonId: lesson.id,
      districtId,
      pointId: pid,
      // A lesson may legitimately carry an explicit position instead of an id
      // (three parking families and the d2 city runs do); it is only the
      // NAMED-BUT-ABSENT case that falls through to the origin.
      resolved: pid === undefined ? true : core.spawnPoints.some((s) => s.id === pid),
    });
  }
  return out;
})();

describe("buildLessonWorldCore — the lesson can find its own spawn", () => {
  it("§1 the census is real, and every playable lesson resolves", () => {
    // Positive control BEFORE the conclusion: this programme has shipped four
    // "0 defects" reports that were instrument bugs, every one of them lying
    // in the reassuring direction.
    expect(SCENARIO_TEMPLATES.length).toBeGreaterThanOrEqual(150);
    expect(CENSUS.length, "census collapsed").toBeGreaterThanOrEqual(800);
    expect(CENSUS.some((r) => r.lessonId === "l6-night-driving")).toBe(true);
    expect(CENSUS.filter((r) => r.pointId !== undefined).length).toBeGreaterThan(700);

    const unresolved = CENSUS.filter((r) => !r.resolved);
    expect(
      unresolved.map((r) => `${r.lessonId}: «${r.pointId}» not in ${r.districtId}`),
    ).toEqual([]);
  });

  it("§2 the recipe really passes the district's spawn list through", () => {
    // If it returned [] for everyone, §1 would be a statement about nothing.
    const l1 = LESSONS.find((l) => l.id === "l1-preparation")!;
    const raw = districtDoc(lessonDistrictId(l1))!;
    const core = buildLessonWorldCore(l1, raw);
    expect(core.spawnPoints.length).toBeGreaterThan(1);
    expect(core.spawnPoints.map((s) => s.id)).toContain(l1.spawn.pointId);
  });

  it("§3 the check convicts — a renamed point falls through to the ORIGIN", () => {
    // The mutation the census exists to catch, driven through the production
    // path so the consequence is shown rather than asserted: one lesson, one
    // typo'd pointId, and the recipe answers with a list that does not contain
    // it. `spawnPose` then returns (0, 0) — the middle of the junction.
    const l1 = LESSONS.find((l) => l.id === "l1-preparation")!;
    const raw = districtDoc(lessonDistrictId(l1))!;
    const renamed: LessonSpec = { ...l1, spawn: { ...l1.spawn, pointId: "spawn-1-renamed" } };
    const core = buildLessonWorldCore(renamed, raw);
    const hit = core.spawnPoints.find((s) => s.id === renamed.spawn.pointId);
    expect(hit).toBeUndefined();
    // …and this is exactly what §1 tests for, so the same lesson fails it.
    expect(core.spawnPoints.some((s) => s.id === renamed.spawn.pointId)).toBe(false);
    // The real point still resolves, so the mutation is the pointId and not a
    // recipe that returns nothing for anybody.
    expect(core.spawnPoints.some((s) => s.id === l1.spawn.pointId)).toBe(true);
  });

  it("§4 the `?? []` is unreachable — a document with no spawnPoints[] is REJECTED first", () => {
    // WRITTEN TO PROVE THE OPPOSITE AND IT DID NOT. The half of the hazard
    // that read „or the district simply has no spawn list" is false: the
    // recipe calls `createWorldRuntime(raw)` on line 1, and `parseDistrict`
    // (runtime/district.ts:361) throws `district: missing spawnPoints[]`
    // before the cast below it is ever reached. So the array is guaranteed
    // non-null by the schema and the only live failure mode is §3's — a
    // pointId that names nothing. Pinned here so the narrowing survives: if
    // the schema ever stops requiring the array, this fails and the `?? []`
    // becomes load-bearing again.
    const l1 = LESSONS.find((l) => l.id === "l1-preparation")!;
    const raw = districtDoc(lessonDistrictId(l1))! as Record<string, unknown>;
    const stripped = { ...raw };
    delete stripped.spawnPoints;
    expect(() => buildLessonWorldCore(l1, stripped)).toThrow(/spawnPoints/);
  });
});
