/**
 * =============================================================================
 * THE HANDBRAKE SEAM — RUN THE BINDING, DO NOT SPELL IT.
 * =============================================================================
 *
 * `modules/sim/scene/spawnParkingBrake.test.ts` proves two things beside each
 * other: that `initialParkingBrakeOnFor` arms exactly the two templates whose
 * briefing orders the release, and that `CabinControls` given `true` really
 * pulls the lever without forging a `parkingBrakeChanged`. What it could not
 * prove is the SEAM between them — that `LessonScene` passes the one to the
 * other — because nothing in the repo rendered `LessonScene`, so the only
 * instrument left was a scan of its source text.
 *
 * AN ADVERSARIAL VERIFIER WALKED PAST THAT SCAN. The gate required the argument
 * to open its own line, which defeats a rename (`XX_initialParkingBrakeOnFor(`)
 * and a prefix switch (`false && initialParkingBrakeOnFor(`). It does not
 * defeat the SUFFIX form. Applied at the call site, 2026-08-25:
 *
 *     initialParkingBrakeOnFor({
 *       vehicleStart,
 *       preDrive: lesson.preDrive,
 *       lessonId: lesson.id,
 *     }) && false,
 *
 * — all 13 tests GREEN, the handbrake never pulled, the lamp never lit. It
 * typechecks perfectly, because the parameter is a `boolean`: unlike the demo
 * deck's clock gate (anchored to a `useRef` initialiser, where a boolean
 * neutralisation would not compile), this one is genuinely walk-past-able. That
 * is `LessonScene.tsx:1170`'s own warning — a substring catches DELETION and
 * not NEUTRALISATION — collected a second time, on the file that wrote it.
 *
 * SO THE BINDING IS MEASURED BY MOUNTING THE SCENE. `rearStaticBodiesSeam`
 * beside this file established both the technique and the reason for it; this
 * is the same harness, the same shipped world recipe and the same shipped
 * template table, reading the CabinControls the component's own effect
 * constructed — picked out of the hook slots by `instanceof`, not by name and
 * not by source text. Both mutations above turn it red, and so does commenting
 * the argument out, because none of them ends with a pulled lever.
 *
 * A CONTROL RUNS BESIDE IT. `sc-pk-move-off` sits on the SAME district
 * (vp-ready-v1, the 360 m 1+1 cockpit street) and is not a brake drill, so it
 * must mount with the lever DOWN. Without it a mount that pulled the brake
 * unconditionally — or a rule stuck at `true` — would read as a pass.
 * =============================================================================
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReadyScene } from "../LessonScene";
import { mountHook } from "@/modules/sim/hud/__tests__/hookHarness";
import { buildLessonWorldCore } from "@/modules/sim/scene/lessonWorldRecipe";
import { buildMinimapPolylines } from "@/modules/sim/scene/lessonMinimap";
import { createTrafficSystem, type TrafficDistrict } from "@/modules/sim/traffic";
import { compileScenario, SCENARIO_TEMPLATES } from "@/modules/sim/lessons/scenario";
import { lessonDistrictId } from "@/modules/sim/contracts";
import { CabinControls } from "@/modules/sim/scene/cabin";
import { stuckStartReason } from "@/modules/sim/engine";
import type { LessonSpec } from "@/modules/sim/lessons";

/** The 360 m straight cockpit street that hosts both lessons below. */
const DISTRICT_ID = "vp-ready-v1";

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

function compiled(templateId: string): LessonSpec {
  const spec = SCENARIO_TEMPLATES.find((t) => t.id === templateId);
  expect(spec, `${templateId} is a shipped template`).toBeDefined();
  return compileScenario(spec!, 1);
}

/**
 * Everything `LessonScene`'s loader hands `ReadyScene`, built by the SHIPPED
 * recipe over the SHIPPED district document — copied from `rearStaticBodiesSeam`
 * rather than re-derived, so the two seams are mounted the same way. Ambient
 * traffic is zero: nothing here reads it, and a seeded car is one more thing
 * that could throw inside an effect this test is not about.
 */
function mountScene(lesson: LessonSpec) {
  const raw: unknown = districtDoc(DISTRICT_ID);
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
  } as Parameters<typeof ReadyScene>[0];
  return mountHook(() => ReadyScene(props));
}

/**
 * The `CabinControls` this mount's own effect constructed, found by IDENTITY.
 * `cabinRef` is a `useRef`, so it is one of the harness's slots; nothing here
 * knows the ref's name, its position, or a line of the file it lives in.
 */
function mountedCabin(mounted: ReturnType<typeof mountScene>): CabinControls {
  const found = mounted.slots
    .map((s) => s.v)
    .filter((v): v is { current: unknown } => typeof v === "object" && v !== null && "current" in v)
    .map((ref) => ref.current)
    .filter((c): c is CabinControls => c instanceof CabinControls);
  // Zero is the failure this whole file exists for: the effect ran and no
  // cabin came out of it, which is what a deleted or neutralised binding looks
  // like from here. Loud, and never a quiet pass on nothing.
  expect(found, "the mount constructed exactly one CabinControls").toHaveLength(1);
  return found[0]!;
}

describe("the hand-over lever, measured through the mounted scene", () => {
  it("sc-vp-handbrake arrives with the parking brake PULLED", () => {
    const lesson = compiled("sc-vp-handbrake");
    // If the drill ever moves district these numbers are about another world.
    expect(lessonDistrictId(lesson)).toBe(DISTRICT_ID);
    expect(lesson.vehicleStart ?? "ready").toBe("ready");
    const mounted = mountScene(lesson);
    try {
      const cabin = mountedCabin(mounted);
      expect(cabin.driveline.parkingBrakeOn).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it("…and sc-pk-move-off, on the same street, arrives with it DOWN", () => {
    const lesson = compiled("sc-pk-move-off");
    expect(lessonDistrictId(lesson)).toBe(DISTRICT_ID);
    const mounted = mountScene(lesson);
    try {
      expect(mountedCabin(mounted).driveline.parkingBrakeOn).toBe(false);
    } finally {
      mounted.unmount();
    }
  });

  /**
   * THE COST, MEASURED — and the reason this test sits in the same file.
   *
   * `PARKING_BRAKE_FORCE_N` immobilises the car: eight seconds of full throttle
   * against the lever reached 0.32 км/ч on the drive rig (the measurement is on
   * `engine/stuckStart.ts`'s standstill constant), while `HANDBRAKE_LEFT_ON`
   * needs `speed > movingSpeedKmh` = 5 км/ч. So on the lesson TITLED „Потегляне
   * с вдигната ръчна" the named fault cannot be booked from a standstill.
   *
   * That is true at HEAD as well — the force model closes that path, not this
   * repair, and at HEAD the lever was DOWN at spawn so there was nothing to
   * leave on either. What changes is what the student is told: with the lever
   * pulled, a floored throttle at a standstill resolves to `parkingBrake`,
   * which `LessonPlayShell.handleStuckStart` prints as «Ръчната спирачка е
   * вдигната — колата е задържана». Under doc 64 THEO-4 a silently refused
   * input is a bare verdict, so a hand-over that immobilises the car may only
   * ship WITH this channel armed — and that is what this pins.
   *
   * `sc-vp-handbrake:1f2f7463` («driving away on the handbrake costs the
   * student nothing») STAYS OPEN: this is an explanation, not a conviction.
   */
  it("a pulled lever is never a SILENT refusal — the stuck-start channel names it", () => {
    const lesson = compiled("sc-vp-handbrake");
    const mounted = mountScene(lesson);
    try {
      const cabin = mountedCabin(mounted);
      expect(stuckStartReason(cabin.driveline.physicsInput, false)).toBe("parkingBrake");
    } finally {
      mounted.unmount();
    }
  });
});
