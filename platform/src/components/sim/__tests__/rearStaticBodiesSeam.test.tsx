/**
 * =============================================================================
 * O62 — THE SEAM. Not the recipe, not the receiver: the DELIVERY.
 *
 * `__tests__/rearStaticBodies.test.ts` beside this file proves two things and
 * neither of them is the one that broke. It proves `rearStaticBodiesFrom`
 * builds the right boxes (the RECIPE) and that a traffic system handed those
 * boxes reports the van (the RECEIVER) — and it hands them over ITSELF, with
 * its own `traffic.setRearStaticBodies(bodies)` call inside its `replay()`
 * helper. The one thing neither half touches is whether the SCENE ever makes
 * that call.
 *
 * MEASURED 2026-08-20 by an adversarial refuter, and reproduced before a line
 * of this file was written: delete BOTH call sites from `LessonScene.tsx` — the
 * mount effect and the `traffic.setRearStaticBodies(...)` line inside
 * `handleObstacleFootprints` — and 11,696 tests stay GREEN, that file included.
 * Nothing in the repo renders `LessonScene`, so the wiring was invisible to the
 * entire suite. On `sc-park-van`'s three shipped drives the rear channel falls
 * from 242 finite reads to 141 (73→44 on shadow-correct, 169→97 on
 * mistake-early-turn, 0→0 on mistake-blind-reverse) and the panel van the
 * student is reversing toward stops being the body the badge reports.
 *
 * ── WHY NOT A SOURCE-TEXT ASSERTION ─────────────────────────────────────────
 *
 * Because a substring catches DELETION and not NEUTRALISATION. This audit has
 * already answered one finding with `advisorOn: true` — a required field pinned
 * to a constant, which satisfies `tsc` and satisfies every grep — and it found
 * eight tests asserting against comment-stripped SOURCE TEXT whose code could
 * be killed with 867 tests still green. `traffic.setRearStaticBodies([])` on
 * the same line, or a `handleObstacleFootprints` replaced by `() => {}` with
 * the original body left in the file under another name, walks past any regex
 * anyone would write here. The instrument has to RUN the component.
 *
 * ── HOW ─────────────────────────────────────────────────────────────────────
 *
 * `ReadyScene` — the half of `LessonScene.tsx` that holds both publishers — is
 * mounted through `modules/sim/hud/__tests__/hookHarness`, the harness this
 * project already uses to run `TouchControls`, `SessionEndScreen` and
 * `useFoldLines` with no DOM (vitest runs `environment: "node"` and there is no
 * jsdom in the tree). Its effects really run. Its element tree is really
 * walked, and the footprint callback is picked out of that tree by COMPONENT
 * IDENTITY — `type === ScenarioObstacles`, the imported reference — so neither
 * a renamed component nor a decoy prop can satisfy it.
 *
 * Everything the scene is fed comes from the shipped recipe
 * (`buildLessonWorldCore` over the committed district document) and every
 * number is read back off the shipped traces through the shipped
 * `traffic.rearGapMeters`. Nothing here is hand-built: the finding is about
 * what the product mounts for a student, so the test has to ask the product.
 *
 * ── THE MUTATIONS THAT PROVE EACH ASSERTION, all five RUN 2026-08-20 ────────
 *
 * Every line below is an observed run of this file plus its sibling, not a
 * prediction. The sibling `rearStaticBodies.test.ts` is 13 of the 21 tests and
 * stays GREEN through all five, which is the whole finding restated.
 *
 *   M1 · DELETE the mount effect
 *        4 red. §1 both drives (44 vs 73, 97 vs 169) and §3 (66 vs 0). §2's
 *        „real extents" case reddens too, but on its FIRST line — the
 *        precondition that states the mount-effect answer before firing the
 *        callback — not on its own 103. §2's phantom case stays green and is
 *        right to: with the mount dead, the callback republished the scene's
 *        four bodies by itself, which is exactly what it is there for.
 *   M2 · DELETE `traffic.setRearStaticBodies(…)` from `handleObstacleFootprints`
 *        1 red, and it is §2's own number: 73 vs 103. §1 and §3 green — they
 *        are the mount effect's. The badge is back on the fleet-profile guess
 *        while the real rig is 0.62 m longer.
 *   M3 · NEUTRALISE the mount publish → `traffic.setRearStaticBodies([])`
 *        3 red (0 vs 73, 0 vs 169, 0 vs 73). The mutation a substring cannot
 *        see: the call, the receiver and the identifier all still there. §3
 *        stays green and must — for a lesson that mounts nothing, `[]` IS the
 *        right answer, and a test that reddened here would be demanding a
 *        warning about bodies that are not in the world.
 *   M4 · NEUTRALISE the callback: build the bodies, do not deliver them
 *        1 red, §2 only (73 vs 103). The `() => {}`-with-the-body-left-behind
 *        shape that took twelve source-text tests in this repo.
 *   M5 · make `rearStaticBodiesFrom` emit a body for an UNMATCHED footprint
 *        index (the false-warning direction)
 *        1 red, and only in §2's phantom case: 350 vs 73 finite reads. All 13
 *        of the sibling's tests stay green, so that assertion is the only one
 *        in the repo standing between a stray footprint and 277 invented
 *        warnings on one drive.
 *
 * Each mutation reddens the section that owns it and leaves the others alone,
 * which is what says the two publishers are measured separately rather than one
 * covering for the other.
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReadyScene } from "../LessonScene";
import { ScenarioObstacles, type ObstacleColliderFootprint } from "../ScenarioObstacles";
import { collectProps, mountHook } from "@/modules/sim/hud/__tests__/hookHarness";
import { buildLessonWorldCore } from "@/modules/sim/scene/lessonWorldRecipe";
import { buildMinimapPolylines } from "@/modules/sim/scene/lessonMinimap";
import { createTrafficSystem, type TrafficDistrict } from "@/modules/sim/traffic";
import { compileScenario, SCENARIO_TEMPLATES } from "@/modules/sim/lessons/scenario";
import { lessonDistrictId } from "@/modules/sim/contracts";
import { LESSONS, type LessonSpec } from "@/modules/sim/lessons";

// ---------------------------------------------------------------------------
// Fixtures — the shipped district documents, the shipped template table and the
// shipped recorded drives.
// ---------------------------------------------------------------------------

function repoRoot(): string {
  for (const root of [process.cwd(), path.resolve(process.cwd(), "..")]) {
    if (fs.existsSync(path.join(root, "content", "world"))) return root;
  }
  throw new Error("content/world not found from " + process.cwd());
}

function districtDoc(id: string): TrafficDistrict {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot(), "content", "world", `${id}.json`), "utf8"),
  ) as TrafficDistrict;
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

function compiled(templateId: string): LessonSpec {
  const spec = SCENARIO_TEMPLATES.find((t) => t.id === templateId);
  expect(spec, `${templateId} is a shipped template`).toBeDefined();
  return compileScenario(spec!, 1);
}

/**
 * Everything `LessonScene`'s loader hands `ReadyScene`, built by the SHIPPED
 * recipe over the SHIPPED district document — the same `buildLessonWorldCore`
 * call the loader makes and the same `createTrafficSystem` construction.
 *
 * Ambient traffic is zero deliberately. `rearGapMeters` takes the MIN of the
 * moving agents and the static bodies, so a seeded ambient car wandering into
 * the rear corridor would move these numbers for reasons that have nothing to
 * do with the seam under test. With no agents, every finite read below is a
 * static body and therefore a statement about what this scene published.
 */
function scene(lesson: LessonSpec, districtId: string) {
  const raw: unknown = districtDoc(districtId);
  const core = buildLessonWorldCore(lesson, raw);
  const traffic = createTrafficSystem(raw as Parameters<typeof createTrafficSystem>[0], {
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const props: Parameters<typeof ReadyScene>[0] = {
    lesson,
    quality: "low",
    paused: false,
    driveLocked: false,
    preDriveHighlightStepId: null,
    activeObjectiveIndex: 0,
    onTick: () => {},
    onPreDriveStep: () => {},
    onBlockedDriveAttempt: () => {},
    onMinimapFrame: () => {},
    built: {
      runtime: core.runtime,
      geometry: core.geometry,
      district: core.district,
      traffic,
      director: null,
      minimapPolylines: buildMinimapPolylines(core.district),
      spawnPoints: core.spawnPoints,
      ghostDemoRaw: null,
      scenarioObstacles: core.scenarioObstacles,
      parkedClearZones: core.parkedClearZones,
      gripPatches: core.gripPatches,
      shadowTrace: null,
      lessonMaxLegalKmh: undefined,
      lessonRequiredKmh: undefined,
    },
    menuPaused: false,
    setMenuPaused: () => {},
    physicsPaused: false,
    onMinimap: () => {},
    onTickCb: () => {},
  };
  return { core, traffic, props };
}

/** Mount `ReadyScene` for real and hand back the traffic system it published to. */
function mountScene(lesson: LessonSpec, districtId: string) {
  const { core, traffic, props } = scene(lesson, districtId);
  const mounted = mountHook(() => ReadyScene(props));
  // Picked out of the RENDERED TREE by component identity. `collectProps` walks
  // the elements the render actually returned, so this is the prop the scene
  // really passes — not a string that happens to appear in the file.
  const obstacleProps = collectProps(mounted.value, (_props, type) => type === ScenarioObstacles);
  return { core, traffic, mounted, obstacleProps };
}

/** Poll `rearGapMeters` down a recorded drive, exactly as the badge does. */
function replay(traffic: ReturnType<typeof createTrafficSystem>, samples: readonly TraceSample[]) {
  let finite = 0;
  let min = Infinity;
  for (const s of samples) {
    const gapM = traffic.rearGapMeters(s.x, s.y, s.headingDeg);
    if (!Number.isFinite(gapM)) continue;
    finite++;
    if (gapM < min) min = gapM;
  }
  return { finite, min };
}

/**
 * What a traffic system reports with NOBODY having published to it — the
 * district's own occupied bays, i.e. exactly what a deleted seam falls back to.
 * Every §1 number is a delta against this.
 */
function districtOnly(districtId: string, samples: readonly TraceSample[]) {
  return replay(
    createTrafficSystem(districtDoc(districtId) as Parameters<typeof createTrafficSystem>[0], {
      vehicleCount: 0,
      pedestrianCount: 0,
    }),
    samples,
  );
}

// ---------------------------------------------------------------------------

describe("§1 the mount effect really publishes — measured through the scene", () => {
  const DISTRICT_ID = "lot-van-v1";

  it("SELF-CHECK: the district-only channel is the 141-read state the refuter restored", () => {
    // Without this the deltas below are statements about nothing. These are the
    // numbers a deleted seam produces, asserted here so that a re-recorded
    // trace or a changed district fails THIS line rather than quietly turning
    // every delta below into a measurement of air.
    expect(districtOnly(DISTRICT_ID, trace("sc-park-van", "shadow-correct")).finite).toBe(44);
    expect(districtOnly(DISTRICT_ID, trace("sc-park-van", "mistake-early-turn")).finite).toBe(97);
    expect(districtOnly(DISTRICT_ID, trace("sc-park-van", "mistake-blind-reverse")).finite).toBe(0);
  });

  it("the correct drive: 44 reads of the wrong car become 73 reads with the van in them", () => {
    const lesson = compiled("sc-park-van");
    expect(lessonDistrictId(lesson)).toBe(DISTRICT_ID);
    const { mounted, traffic, core } = mountScene(lesson, DISTRICT_ID);
    // The lesson really does mount four bodies (3 occupied bays + the held
    // van) — if it ever stopped, the counts would be about a different world.
    expect(core.scenarioObstacles).toHaveLength(4);
    const after = replay(traffic, trace("sc-park-van", "shadow-correct"));
    mounted.unmount();
    expect(after.finite).toBe(73);
    // 0.40 m, and it is the VAN. The district-only channel's closest read on
    // this drive is 3.56 m — a neighbouring bay car — while the body the
    // student is reversing at sits 0.40 m behind. A badge saying „3 m" to
    // someone 0.4 m from a panel van is not silent, it is confidently wrong by
    // a factor of nine, and the student keeps going.
    expect(after.min).toBeCloseTo(0.401, 2);
    expect(districtOnly(DISTRICT_ID, trace("sc-park-van", "shadow-correct")).min).toBeCloseTo(
      3.561,
      2,
    );
  });

  it("the wrong drive: 97 → 169 reads, and the student reaches the van (0 m)", () => {
    const { mounted, traffic } = mountScene(compiled("sc-park-van"), DISTRICT_ID);
    const after = replay(traffic, trace("sc-park-van", "mistake-early-turn"));
    mounted.unmount();
    expect(after.finite).toBe(169);
    expect(after.min).toBe(0);
  });

  it("BOTH DIRECTIONS: the drive whose hazard is a PEDESTRIAN stays silent after mounting", () => {
    // A false warning is the same crime as a missing one pointing the other
    // way. `mistake-blind-reverse` is graded on a pedestrian behind the car; a
    // rear cue that started speaking here would be furniture, and it would be
    // covering the instrument that should be speaking.
    const { mounted, traffic } = mountScene(compiled("sc-park-van"), DISTRICT_ID);
    const after = replay(traffic, trace("sc-park-van", "mistake-blind-reverse"));
    mounted.unmount();
    expect(after.finite).toBe(0);
  });
});

describe("§2 the footprint callback really publishes — taken off the rendered tree", () => {
  const DISTRICT_ID = "lot-van-v1";

  it("the scene passes ONE `onColliderFootprints`, and it names the scene's own list", () => {
    const { mounted, obstacleProps, core } = mountScene(compiled("sc-park-van"), DISTRICT_ID);
    mounted.unmount();
    // Exactly one — a second publisher would be two callers racing to replace
    // the same array, which is the „one body, two arrays, two answers" defect
    // `collision/bodies.ts` already records twice.
    expect(obstacleProps).toHaveLength(1);
    expect(typeof obstacleProps[0].onColliderFootprints).toBe("function");
    // …and the obstacle list the renderer measures is IDENTICALLY the array the
    // rear bodies were built from. `ObstacleColliderFootprint.index` counts over
    // the vehicle-filtered view of this exact array on both sides, so if the
    // scene ever handed the renderer a different list, a published footprint
    // would land on the wrong car — silently, and only on some lessons.
    expect(obstacleProps[0].obstacles).toBe(core.scenarioObstacles);
  });

  it("firing it with the van's REAL extents moves the badge from 0.401 m to 0.271 m", () => {
    const { mounted, traffic, obstacleProps, core } = mountScene(
      compiled("sc-park-van"),
      DISTRICT_ID,
    );
    const samples = trace("sc-park-van", "shadow-correct");
    // State the mount-effect answer first, so the delta below is unambiguously
    // the CALLBACK's and cannot be inherited from §1.
    expect(replay(traffic, samples).finite).toBe(73);

    // The van's index in the vehicle-filtered list, resolved FROM the recipe
    // rather than written down: a hard-coded 3 would keep passing if the recipe
    // ever ordered the held scenery ahead of the bays.
    const vanIndex = core.scenarioObstacles
      .filter((o) => o.kind === "vehicle")
      .findIndex((o) => o.y === -2.7);
    expect(vanIndex).toBeGreaterThanOrEqual(0);

    // halfLength 2.67 is the RECORDED figure `hittableObstacleBodies`' header
    // carries for `kargo_v` against a hatchback's 2.05 — the 0.62 m the fleet
    // profile guesses away. halfWidth 1.05 is simply a second, distinct value,
    // asserting that the override reaches both axes; it is not a measurement.
    const publish = obstacleProps[0].onColliderFootprints as (
      f: readonly ObstacleColliderFootprint[],
    ) => void;
    publish([{ index: vanIndex, halfLengthM: 2.67, halfWidthM: 1.05 }]);

    const after = replay(traffic, samples);
    mounted.unmount();
    // The rig is longer than the guess, so the same drive is inside the cue's
    // corridor for longer: 30 more warned samples, closest read 13 cm tighter.
    expect(after.finite).toBe(103);
    expect(after.min).toBeCloseTo(0.271, 2);
  });

  it("a footprint for a body that is not there changes nothing — no phantom", () => {
    // The false-warning direction for this publisher. An index past the end of
    // the vehicle-filtered list must be ignored, not appended: a footprint is a
    // correction to a body the recipe already placed, never a new body.
    const { mounted, traffic, obstacleProps } = mountScene(compiled("sc-park-van"), DISTRICT_ID);
    const samples = trace("sc-park-van", "shadow-correct");
    const publish = obstacleProps[0].onColliderFootprints as (
      f: readonly ObstacleColliderFootprint[],
    ) => void;
    publish([{ index: 99, halfLengthM: 9, halfWidthM: 9 }]);
    const after = replay(traffic, samples);
    mounted.unmount();
    expect(after.finite).toBe(73);
    expect(after.min).toBeCloseTo(0.401, 2);
  });
});

describe("§3 the lesson that mounts NOTHING — where the callback cannot be the publisher", () => {
  it("no ScenarioObstacles in the tree at all, and the district's 66 warnings become 0", () => {
    // `buildLessonWorldCore` builds obstacles only for a SCENARIO lesson id, so
    // a hand-authored lesson on a bay-carrying district shows PAINTED bays with
    // no cars in them. The traffic system's district-seeded default would warn
    // about bodies that are not there; the honest answer is an empty publish,
    // and the mount effect is the only thing that can make it — `ScenarioObstacles`
    // is not rendered at all when the list is empty, which this reads off the
    // tree rather than assuming.
    //
    // THE LESSON IS CONSTRUCTED, AND SAYING SO IS THE POINT. Measured
    // 2026-08-20: NONE of the 8 lessons in `lessons/specs.LESSONS` loads a
    // bay-carrying district today, so this hazard is one authoring decision
    // away rather than live in a shipped lesson — which is the argument for a
    // guard, not for a bug report. Only the ID is changed here; the world is
    // then built by the REAL recipe from that id, which answers with 0
    // obstacles (asserted below) exactly as it would for any hand-authored
    // lesson pointed at this district.
    //
    // THIS NEXT LINE IS A TRIPWIRE, AND GOING RED IS ITS JOB. If a
    // hand-authored lesson ever DOES load a `lot-*` district, the hazard stops
    // being hypothetical and this section must be rewritten to mount THAT
    // lesson instead of a constructed one — because at that point a real
    // student is one deleted effect away from a badge warning about painted
    // bays. Do not delete the tripwire to make it green; swap the fixture.
    const bayDistricts = LESSONS.map((l) => lessonDistrictId(l)).filter((d) =>
      d.startsWith("lot-"),
    );
    expect(
      bayDistricts,
      "a hand-authored lesson now loads a bay-carrying district — mount IT below, " +
        "not the constructed id, and update the comment above",
    ).toEqual([]);

    const authored: LessonSpec = { ...compiled("sc-park-narrow"), id: "l7-park-authored" };
    const { mounted, traffic, obstacleProps, core } = mountScene(authored, "lot-narrow-v1");
    expect(core.scenarioObstacles).toHaveLength(0);
    const samples = trace("sc-park-narrow", "shadow-correct");
    const after = replay(traffic, samples);
    mounted.unmount();

    // Nothing rendered, therefore nothing to publish a footprint: the mount
    // effect is the whole seam on this lesson.
    expect(obstacleProps).toHaveLength(0);
    // …and what the district would have said on its own.
    expect(districtOnly("lot-narrow-v1", samples).finite).toBe(66);
    expect(after.finite).toBe(0);
  });
});
