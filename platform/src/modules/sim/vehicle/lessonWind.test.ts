// What a lesson's authored `physics` becomes on the car — ONE mapping, and the
// proof that the product and its test harness are both on it
// (sc-ac-crosswind:a9db1738, round-1 verifier V-08).
//
// THE DEFECT THIS GATE EXISTS FOR was not a wrong number. It was the same
// number written in three places: `LessonScene` mapped `physics.crosswind` to
// −CROSSWIND_BRIDGE_N, a −CROSSWIND_GUST_AMPLITUDE_N sine and its period;
// `VehicleRig` packed those into `VehicleSimOptions`; and the live-lane harness
// (`scenario/__tests__/liveWindDrive.ts`) retyped BOTH steps and called the
// result „the product's own car". A sign flipped in the scene would have left
// every live-lane test green on a car the product no longer builds.
//
// So this file pins three things:
//   1. the mapping itself — sign, amplitude, period, the grip MIN, and the
//      calm identity;
//   2. that `crosswindForceAtN` IS the force the live `VehicleSim` reads
//      (`windLateralNow`) on its own clock, frame for frame;
//   3. THE ROUTING — read off the real sources, and proven able to fail: the
//      scene and the rig call the shared functions and carry no inline copy,
//      the harness and the trace scripts call the same ones.

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";

import { crosswindForceAtN, lessonRigPhysics, rigSimOptions } from "./lessonWind";
import * as T from "./tuning";
import { createHeadlessChassis, IDLE_INPUT, VehicleSim } from "./VehicleSim";

beforeAll(async () => {
  await RAPIER.init();
});

// ---------------------------------------------------------------------------
// 1. The mapping
// ---------------------------------------------------------------------------

describe("lessonRigPhysics — the authored physics, as the scene hands it to the rig", () => {
  it("no authored physics is the calm, dry car — and its sim options carry no gust key at all", () => {
    for (const physics of [undefined, {}, { crosswind: false }, { wetGrip: false, snowGrip: false }]) {
      const rig = lessonRigPhysics(physics);
      expect(rig).toEqual({ gripFactor: 1, windLateralN: 0, windGustAmplitudeN: 0, windGustPeriodSec: 0 });
      // Field for field what `VehicleRig` built inline before this module.
      expect(rigSimOptions(rig)).toEqual({ gripFactor: 1, windLateralN: 0 });
      expect("windGust" in rigSimOptions(rig)).toBe(false);
    }
  });

  it("THE SIGN IS THE LESSON — the wind blows WEST (negative world X), and the gust deepens it, never opposes it", () => {
    const rig = lessonRigPhysics({ crosswind: true });
    expect(rig.windLateralN).toBe(-T.CROSSWIND_BRIDGE_N);
    expect(rig.windGustAmplitudeN).toBe(-T.CROSSWIND_GUST_AMPLITUDE_N);
    expect(rig.windGustPeriodSec).toBe(T.CROSSWIND_GUST_PERIOD_SEC);
    expect(rig.gripFactor).toBe(1); // wind is force, never friction
    // Same sign: at the gust's peak (a quarter period in) the push is the
    // base PLUS the amplitude, both westward.
    const peak = crosswindForceAtN(
      rig.windLateralN,
      rig.windGustAmplitudeN,
      rig.windGustPeriodSec,
      rig.windGustPeriodSec / 4,
    );
    expect(peak).toBeCloseTo(-(T.CROSSWIND_BRIDGE_N + T.CROSSWIND_GUST_AMPLITUDE_N), 9);
    const lull = crosswindForceAtN(
      rig.windLateralN,
      rig.windGustAmplitudeN,
      rig.windGustPeriodSec,
      (3 * rig.windGustPeriodSec) / 4,
    );
    expect(lull).toBeCloseTo(-(T.CROSSWIND_BRIDGE_N - T.CROSSWIND_GUST_AMPLITUDE_N), 9);
    // …and never eastward at any phase.
    for (let t = 0; t < 2 * rig.windGustPeriodSec; t += 0.05) {
      expect(crosswindForceAtN(rig.windLateralN, rig.windGustAmplitudeN, rig.windGustPeriodSec, t)).toBeLessThan(0);
    }
  });

  it("the sim options for a wind lesson are the three numbers, packed — gust present with amplitude AND period", () => {
    expect(rigSimOptions(lessonRigPhysics({ crosswind: true }))).toEqual({
      gripFactor: 1,
      windLateralN: -T.CROSSWIND_BRIDGE_N,
      windGust: { periodSec: T.CROSSWIND_GUST_PERIOD_SEC, amplitudeN: -T.CROSSWIND_GUST_AMPLITUDE_N },
    });
    // The rig's own rule: no amplitude, or no period, is no gust object.
    expect(
      "windGust" in rigSimOptions({ gripFactor: 1, windLateralN: -1200, windGustAmplitudeN: 0, windGustPeriodSec: 5 }),
    ).toBe(false);
    expect(
      "windGust" in rigSimOptions({ gripFactor: 1, windLateralN: -1200, windGustAmplitudeN: -500, windGustPeriodSec: 0 }),
    ).toBe(false);
  });

  it("grip is the MOST RESTRICTIVE authored factor, and composes with the wind (the truck lesson's L5)", () => {
    expect(lessonRigPhysics({ wetGrip: true }).gripFactor).toBe(T.WET_GRIP_FACTOR);
    expect(lessonRigPhysics({ snowGrip: true }).gripFactor).toBe(T.SNOW_GRIP_FACTOR);
    expect(lessonRigPhysics({ wetGrip: true, snowGrip: true }).gripFactor).toBe(
      Math.min(T.WET_GRIP_FACTOR, T.SNOW_GRIP_FACTOR),
    );
    const l5 = lessonRigPhysics({ crosswind: true, wetGrip: true });
    expect(l5.gripFactor).toBe(T.WET_GRIP_FACTOR);
    expect(l5.windLateralN).toBe(-T.CROSSWIND_BRIDGE_N);
  });
});

// ---------------------------------------------------------------------------
// 2. One number — the function IS the live car's wind
// ---------------------------------------------------------------------------

describe("crosswindForceAtN — the force the live VehicleSim is pushed with, on its own clock", () => {
  it("frame for frame over two gust periods: windLateralNow === crosswindForceAtN(…, steps · FIXED_DT)", () => {
    const rig = lessonRigPhysics({ crosswind: true });
    const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
    world.timestep = T.FIXED_DT;
    world.createCollider(RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1));
    const body = createHeadlessChassis(RAPIER, world);
    const sim = new VehicleSim(world, body, T.SPAWN, rigSimOptions(rig));
    sim.reset();
    // The clock is advanced by FIXED_DT per step by repeated addition; replay
    // the same additions so the comparison is exact, not approximate.
    let clock = 0;
    const steps = Math.round((2 * T.CROSSWIND_GUST_PERIOD_SEC) / T.FIXED_DT);
    for (let i = 0; i < steps; i++) {
      sim.update(IDLE_INPUT, T.FIXED_DT);
      world.step();
      clock += T.FIXED_DT;
      expect(sim.windLateralNow).toBe(
        crosswindForceAtN(rig.windLateralN, rig.windGustAmplitudeN, rig.windGustPeriodSec, clock),
      );
    }
    sim.dispose();
    world.free();
  });

  it("is the constant term alone without a gust, and exactly 0 for a calm lesson", () => {
    expect(crosswindForceAtN(-1200, 0, 0, 3.7)).toBe(-1200);
    expect(crosswindForceAtN(0, 0, 0, 3.7)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. THE ROUTING — the product and the harness are on the shared functions
// ---------------------------------------------------------------------------

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const SCENE_SRC = read("../../../components/sim/LessonScene.tsx");
const RIG_SRC = read("../../../components/sim/VehicleRig.tsx");
const HARNESS_SRC = read("../lessons/scenario/__tests__/liveWindDrive.ts");
const SIM_SRC = read("./VehicleSim.ts");
const CROSSWIND_TRACES_SRC = read("../traces/scAcCrosswind.ts");
const TRUCK_TRACES_SRC = read("../traces/scAcWindTruckPass.ts");

/** Source with comments removed, so a NOTE about the old inline code cannot
 *  satisfy or trip a guard that is about the code. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const sceneMapsThroughTheSharedFunction = (src: string) =>
  /const rigPhysics = useMemo\(\(\) => lessonRigPhysics\(lesson\.physics\), \[lesson\.physics\]\);/.test(src) &&
  /gripFactor=\{rigPhysics\.gripFactor\}/.test(src) &&
  /windLateralN=\{rigPhysics\.windLateralN\}/.test(src) &&
  /windGustAmplitudeN=\{rigPhysics\.windGustAmplitudeN\}/.test(src) &&
  /windGustPeriodSec=\{rigPhysics\.windGustPeriodSec\}/.test(src);
/** The inline arithmetic the shared function replaced — a NEGATED wind constant
 *  (the sign is the mapping; the gust gauge's `BRIDGE − AMPLITUDE` envelope is
 *  a subtraction and is not it) or a grip ternary on the authored flag. Any of
 *  it, anywhere in code, is a second copy of the mapping. */
const hasInlineWindMapping = (src: string) =>
  /[?:({=,]\s*-\s*CROSSWIND_(?:BRIDGE_N|GUST_AMPLITUDE_N)|physics\?\.crosswind\s*\?\s*CROSSWIND_GUST_PERIOD_SEC|physics\?\.(wetGrip|snowGrip)\s*\?/.test(
    code(src),
  );
const rigPacksThroughTheSharedFunction = (src: string) =>
  /new VehicleSim\([\s\S]{0,1600}?\.\.\.rigSimOptions\(\{ gripFactor, windLateralN, windGustAmplitudeN, windGustPeriodSec \}\)/.test(
    src,
  ) && !/windGust:\s*\{/.test(code(src));
const harnessBuildsTheProductCar = (src: string) =>
  /export function productSimOptions\(lesson: LessonSpec\): VehicleSimOptions \{[\s\S]{0,200}?return rigSimOptions\(lessonRigPhysics\(lesson\.physics\)\);/.test(
    src,
  );

// THE LEE'S ROUTING (sc-ac-wind-truck-pass:ff1d4290 round 2, the round-1
// verifier's F-02). Read off the real sources, like the wind's above, and
// proven able to fail below: the scene BUILDS the lesson's shelter function
// with the scene module's own factory, off the live traffic port, and HANDS it
// to the rig; the rig keeps it in a ref and, inside its physics callback and
// BEFORE `sim.update` reads the wind, calls the vehicle module's own step
// (`stepRigWindShelter`, executed in windShelter.test.ts) with the sim, that
// function and the chassis' translation; the harness calls the same step.
const sceneBuildsTheLee = (src: string) =>
  /const windShelterAt = useMemo\(\s*\(\) => createLessonWindShelter\(lesson, \(actorId\) => traffic\.staged\(actorId\)\),\s*\[lesson, traffic\],\s*\);/.test(
    code(src),
  );
const sceneHandsTheLeeToTheRig = (src: string) => {
  const rig = /<VehicleRig\b[\s\S]*?\/>/.exec(code(src));
  return rig !== null && /\bwindShelterAt=\{windShelterAt\}/.test(rig[0]);
};
/**
 * ROUND 3 (the round-2 verifier's F2-03(a)): the rig kept the prop in a ref
 * copied by an effect, and that effect given `[]` kept the first lesson's lee
 * for the life of the rig with every test green. The rig now holds the lee in
 * `createRigWindShelter()` (executed in windShelter.test.ts) and FOLLOWS the
 * prop as a bare statement of its render — right after creating it, inside no
 * hook — so there is no dependency list to get wrong; the physics callback
 * calls its `step` before `sim.update`.
 */
const rigStepsTheLeeBeforeTheWindIsRead = (src: string) => {
  const c = code(src);
  const from = c.indexOf("useBeforePhysicsStep(() => {");
  if (from < 0) return false;
  const body = c.slice(from);
  const step = body.indexOf("windShelter.step(sim, bodyRef.current?.translation());");
  const update = body.indexOf("sim.update(");
  return (
    step >= 0 &&
    update > step &&
    /const windShelter = useMemo\(createRigWindShelter, \[\]\);\s*windShelter\.follow\(windShelterAt\);/.test(c) &&
    c.split("windShelter.follow(").length - 1 === 1 &&
    c.split("windShelter.step(").length - 1 === 1 &&
    // …and it is the ONLY place the rig touches the sim's shelter: no inline
    // copy of the step, with or without the call that matters.
    !/setWindShelterFactor/.test(c) &&
    !/stepRigWindShelter\(/.test(c)
  );
};
const harnessStepsTheLeeWithTheRigsFunction = (src: string) =>
  /const rigLee = createRigWindShelter\(\);\s*rigLee\.follow\(shelterAt\);/.test(code(src)) &&
  /rigLee\.step\(sim, st\.position\);[\s\S]{0,400}?sim\.update\(shaped, FIXED_DT, READY_DRIVELINE\);/.test(code(src)) &&
  !/setWindShelterFactor/.test(code(src));

describe("routing: the LEE reaches the live car — scene → rig → sim, before every physics step", () => {
  it("LessonScene builds the lesson's shelter function off the live traffic port and passes it to VehicleRig", () => {
    expect(sceneBuildsTheLee(SCENE_SRC)).toBe(true);
    expect(sceneHandsTheLeeToTheRig(SCENE_SRC)).toBe(true);
  });

  it("VehicleRig holds the lee in createRigWindShelter, follows the prop on every render, and steps it into the sim inside its physics callback, before sim.update — and nowhere else", () => {
    expect(rigStepsTheLeeBeforeTheWindIsRead(RIG_SRC)).toBe(true);
  });

  it("the live-lane harness steps the lee with the SAME function, so every live-car test runs the rig's own code", () => {
    expect(harnessStepsTheLeeWithTheRigsFunction(HARNESS_SRC)).toBe(true);
  });

  it("each guard can fail — the round-1 verifier's two surviving mutants, and three more, put into the REAL sources turn it red", () => {
    // V5: the scene passes no shelter function.
    const v5 = SCENE_SRC.replace("windShelterAt={windShelterAt}", "windShelterAt={null}");
    expect(v5).not.toBe(SCENE_SRC);
    expect(sceneHandsTheLeeToTheRig(v5)).toBe(false);
    // …or builds none.
    const noBuild = SCENE_SRC.replace(
      "() => createLessonWindShelter(lesson, (actorId) => traffic.staged(actorId)),",
      "() => null,",
    );
    expect(noBuild).not.toBe(SCENE_SRC);
    expect(sceneBuildsTheLee(noBuild)).toBe(false);
    // V4: the rig works the factor out and never hands it to the sim.
    const call = "windShelter.step(sim, bodyRef.current?.translation());";
    expect(RIG_SRC).toContain(call);
    const v4 = RIG_SRC.replace(
      call,
      "{ const t = bodyRef.current?.translation(); if (t && windShelterAt) windShelterAt(t.x, -t.z); }",
    );
    expect(rigStepsTheLeeBeforeTheWindIsRead(v4)).toBe(false);
    // The step moved AFTER the update that reads the wind (a frame late).
    const late = RIG_SRC.replace(call, "").replace(
      "sim.update(shaped, FIXED_DT, driveline);",
      "sim.update(shaped, FIXED_DT, driveline);\n    " + call,
    );
    expect(late).not.toBe(RIG_SRC);
    expect(late).toContain(call);
    expect(rigStepsTheLeeBeforeTheWindIsRead(late)).toBe(false);
    // The prop dropped on the floor: the held lee never follows it.
    const follow = "windShelter.follow(windShelterAt);";
    const deaf = RIG_SRC.replace(follow, "");
    expect(deaf).not.toBe(RIG_SRC);
    expect(rigStepsTheLeeBeforeTheWindIsRead(deaf)).toBe(false);
    // F2-03(a): it follows the prop only ONCE — the round-2 verifier's
    // surviving mutant, in the shape the rig now has (an effect given `[]`).
    const once = RIG_SRC.replace(follow, "useEffect(() => {\n    windShelter.follow(windShelterAt);\n  }, []);");
    expect(once).not.toBe(RIG_SRC);
    expect(rigStepsTheLeeBeforeTheWindIsRead(once)).toBe(false);
    // …or follows it from a memo keyed on nothing.
    const memo = RIG_SRC.replace(follow, "useMemo(() => windShelter.follow(windShelterAt), []);");
    expect(rigStepsTheLeeBeforeTheWindIsRead(memo)).toBe(false);
    // A comment that only TALKS about the call does not satisfy the guard.
    const onlyAComment = RIG_SRC.replace(call, "// " + call);
    expect(rigStepsTheLeeBeforeTheWindIsRead(onlyAComment)).toBe(false);
    // The harness with its own copy of the three lines again.
    const copy = HARNESS_SRC.replace(
      "rigLee.step(sim, st.position);",
      "if (shelterAt !== null) sim.setWindShelterFactor(shelterAt(x, y));",
    );
    expect(copy).not.toBe(HARNESS_SRC);
    expect(harnessStepsTheLeeWithTheRigsFunction(copy)).toBe(false);
  });
});

describe("routing: the scene, the rig, the harness and the demos share ONE wind mapping", () => {
  it("LessonScene derives the rig's physics from lessonRigPhysics(lesson.physics) and passes exactly those four props", () => {
    expect(sceneMapsThroughTheSharedFunction(SCENE_SRC)).toBe(true);
    expect(hasInlineWindMapping(SCENE_SRC)).toBe(false);
  });

  it("VehicleRig packs them with rigSimOptions and builds no gust object of its own", () => {
    expect(rigPacksThroughTheSharedFunction(RIG_SRC)).toBe(true);
    expect(hasInlineWindMapping(RIG_SRC)).toBe(false);
  });

  it("the live-lane harness builds its car with the SAME two calls — and types no wind number itself", () => {
    expect(harnessBuildsTheProductCar(HARNESS_SRC)).toBe(true);
    expect(hasInlineWindMapping(HARNESS_SRC)).toBe(false);
    expect(/CROSSWIND_(BRIDGE_N|GUST_AMPLITUDE_N|GUST_PERIOD_SEC)|WET_GRIP_FACTOR|SNOW_GRIP_FACTOR/.test(code(HARNESS_SRC))).toBe(false);
  });

  it("VehicleSim's gust is crosswindForceAtN on its own clock — the sine is written once", () => {
    // Since the restage of sc-ac-wind-truck-pass (ff1d4290) the open force is
    // named and then multiplied by the lee — still ONE call, on the sim's own
    // clock, and still the only place the wind's number is made.
    expect(
      /private currentWindN\(\): number \{[\s\S]{0,400}?const openN = crosswindForceAtN\(\s*this\.windLateralN,\s*this\.windGustAmplitudeN,\s*this\.windGustPeriodSec,\s*this\.windClockSec,\s*\);/.test(
        SIM_SRC,
      ),
    ).toBe(true);
    expect(code(SIM_SRC).split("crosswindForceAtN(").length - 1).toBe(1);
    // THE LEE MULTIPLIES THAT ONE NUMBER, in that one method, and a sim nobody
    // ever fed a shelter returns the open force untouched (no multiplication).
    expect(code(SIM_SRC)).toContain("return this.windShelter === null ? openN : openN * this.windShelter;");
    // …and it is touched nowhere else: the restart, that multiplication, the
    // setter and the read-out.
    expect(code(SIM_SRC).split("this.windShelter").length - 1).toBe(6);
    expect(/Math\.sin\(/.test(code(SIM_SRC))).toBe(false);
  });

  it("both correct demos take their held wheel from the lesson's own physics through the same function", () => {
    expect(CROSSWIND_TRACES_SRC).toContain(
      '...(kind === "shadow" ? { heldWheel: lessonRigPhysics(SC_AC_CROSSWIND.physics) } : {}),',
    );
    // The motorway sibling's wind has a lee (ff1d4290): the same mapping, plus
    // the lesson slice the scene's own shelter function reads.
    expect(TRUCK_TRACES_SRC).toContain("...lessonRigPhysics(SC_AC_WIND_TRUCK_PASS.physics),");
    expect(TRUCK_TRACES_SRC).toContain("physics: SC_AC_WIND_TRUCK_PASS.physics,");
    expect(TRUCK_TRACES_SRC).toContain("stagedEvents: [...(SC_AC_WIND_TRUCK_PASS.staged ?? [])] as StagedEventSpec[],");
    // Round 2 (F-04): the «рязка корекция» demo's wheel channel is the same
    // computation on its own path — so it opts in beside the shadow, and the
    // blown-out demo (a loose hand is its story) still does not.
    expect(
      /kind === "shadow" \|\| name === "mistake-clip-truck"\s*\?\s*\{\s*heldWheel: \{/.test(TRUCK_TRACES_SRC),
    ).toBe(true);
    expect(TRUCK_TRACES_SRC).not.toContain('"mistake-blown-out"\n      ? {');
  });

  it("each guard can fail — an inline copy put back into the REAL source turns it red", () => {
    const sceneWithACopy = SCENE_SRC.replace(
      "windLateralN={rigPhysics.windLateralN}",
      "windLateralN={lesson.physics?.crosswind ? -CROSSWIND_BRIDGE_N : 0}",
    );
    expect(sceneWithACopy).not.toBe(SCENE_SRC);
    expect(sceneMapsThroughTheSharedFunction(sceneWithACopy)).toBe(false);
    expect(hasInlineWindMapping(sceneWithACopy)).toBe(true);
    // A flipped sign smuggled past the function is caught as a copy too.
    expect(hasInlineWindMapping(SCENE_SRC.replace("gripFactor={rigPhysics.gripFactor}", "gripFactor={lesson.physics?.wetGrip ? 0.7 : 1}"))).toBe(true);

    const rigWithACopy = RIG_SRC.replace(
      "...rigSimOptions({ gripFactor, windLateralN, windGustAmplitudeN, windGustPeriodSec }),",
      "gripFactor, windLateralN, windGust: { periodSec: windGustPeriodSec, amplitudeN: windGustAmplitudeN },",
    );
    expect(rigWithACopy).not.toBe(RIG_SRC);
    expect(rigPacksThroughTheSharedFunction(rigWithACopy)).toBe(false);

    const harnessWithACopy = HARNESS_SRC.replace(
      "return rigSimOptions(lessonRigPhysics(lesson.physics));",
      "return { gripFactor: 1, windLateralN: lesson.physics?.crosswind ? -CROSSWIND_BRIDGE_N : 0 };",
    );
    expect(harnessWithACopy).not.toBe(HARNESS_SRC);
    expect(harnessBuildsTheProductCar(harnessWithACopy)).toBe(false);
    expect(hasInlineWindMapping(harnessWithACopy)).toBe(true);
  });
});
