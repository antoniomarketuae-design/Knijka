/**
 * The AC-12 wind-drift layer — `sc-ac-wind-truck-pass:6a076479`, major: „No
 * crosswind is depicted anywhere — no gust, no dust, no spray, no sway on the
 * trailer, nothing moving in the grass — in a lesson whose whole subject is the
 * gust you take when you clear the truck's lee."
 *
 * Same shape as `world/__tests__/windSway.test.ts`, and for the same two
 * reasons.
 *
 *  1. THE SCALE IS THE PHYSICS'. `WIND_DRIFT_REFERENCE_N` is written in
 *     `windDrift.ts` as a literal so `sim/environment` takes no dependency on
 *     `sim/vehicle` — which means a retune of the newtons in `tuning.ts` could
 *     silently leave the air blowing at the wrong speed. The equality is
 *     asserted here against the REAL constants, so a retune turns this red.
 *
 *  2. THE ROUTING. A look-up table nobody reads draws nothing, and this audit's
 *     measured failure mode is a repair that ships a predicate with no live
 *     consumer (51 of 82 in one sample). The second half reads the REAL
 *     `SimEnvironment.tsx` and `LessonScene.tsx` sources and proves the layer
 *     is mounted, gated on the authored `physics.crosswind`, and fed from the
 *     sim's own wind term — each check re-run against a mutated copy of the
 *     same source with its leg cut out, so a green here cannot be vacuous.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  windDriftLook,
  WIND_DRIFT_MAX_OPACITY,
  WIND_DRIFT_OPACITY_FLOOR,
  WIND_DRIFT_REFERENCE_N,
  WIND_DRIFT_SPEED_AT_REFERENCE_MPS,
} from "../windDrift";
import {
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
} from "../../vehicle/tuning";
import { QUALITY_PRESETS } from "../quality";

describe("windDriftLook — the force is the picture", () => {
  it("scales to the PEAK of the shipped crosswind, not to a number of its own", () => {
    expect(WIND_DRIFT_REFERENCE_N).toBe(CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N);
  });

  it("draws nothing at all when the lesson authors no wind", () => {
    const calm = windDriftLook(0);
    expect(calm.opacity).toBe(0);
    expect(calm.speedMps).toBe(0);
    expect(calm.streakM).toBe(0);
    expect(calm.strength).toBe(0);
  });

  it("blows the way the chassis is pushed", () => {
    // The shipped lessons pass a NEGATIVE force (world −X = west), so the air
    // must travel west too — a mote field drifting the other way would teach a
    // student to brace against the wrong side.
    expect(windDriftLook(-CROSSWIND_BRIDGE_N).speedMps).toBeLessThan(0);
    expect(windDriftLook(CROSSWIND_BRIDGE_N).speedMps).toBeGreaterThan(0);
    // Magnitude is direction-independent.
    expect(windDriftLook(-800).opacity).toBeCloseTo(windDriftLook(800).opacity, 12);
  });

  it("derives the air speed by the force's own square law", () => {
    // tuning.ts grounds CROSSWIND_BRIDGE_N on a ~18 m/s gust through
    // F = Cs·A·½ρv², so v ∝ √F and the base force must land back on ~18 m/s.
    const atBase = Math.abs(windDriftLook(-CROSSWIND_BRIDGE_N).speedMps);
    expect(atBase).toBeGreaterThan(17);
    expect(atBase).toBeLessThan(19);
    expect(Math.abs(windDriftLook(-WIND_DRIFT_REFERENCE_N).speedMps)).toBeCloseTo(
      WIND_DRIFT_SPEED_AT_REFERENCE_MPS,
      6,
    );
    // Four times the force is twice the air speed — the law, not a ratio that
    // happens to hold at one point.
    expect(Math.abs(windDriftLook(-1600).speedMps)).toBeCloseTo(
      2 * Math.abs(windDriftLook(-400).speedMps),
      6,
    );
  });

  it("BREATHES between the shipped lull and peak instead of reading as a constant lean", () => {
    // The gust runs the total force between 1200−500 and 1200+500 N.
    const lull = windDriftLook(-(CROSSWIND_BRIDGE_N - CROSSWIND_GUST_AMPLITUDE_N));
    const peak = windDriftLook(-(CROSSWIND_BRIDGE_N + CROSSWIND_GUST_AMPLITUDE_N));
    expect(peak.opacity).toBeGreaterThan(lull.opacity);
    expect(Math.abs(peak.speedMps)).toBeGreaterThan(Math.abs(lull.speedMps));
    expect(peak.streakM).toBeGreaterThan(lull.streakM);
    // …and the lull must not empty the air, or the cue disappears exactly when
    // the lesson wants the student to feel it slacken (AC-12's „отпусни
    // корекцията плавно, щом поривът отслабне").
    expect(lull.opacity).toBeGreaterThan(WIND_DRIFT_MAX_OPACITY * WIND_DRIFT_OPACITY_FLOOR);
    // A rhythm, not a strobe: under 2× between lull and peak.
    expect(peak.opacity / lull.opacity).toBeLessThan(2);
  });

  it("never over-draws past the peak — a future stronger wind thickens the air, it does not flood it", () => {
    const peak = windDriftLook(-WIND_DRIFT_REFERENCE_N);
    const absurd = windDriftLook(-100000);
    expect(absurd.strength).toBe(1);
    expect(absurd.opacity).toBe(peak.opacity);
    expect(absurd.opacity).toBeLessThanOrEqual(WIND_DRIFT_MAX_OPACITY);
  });

  it("every quality tier can show the wind — a phone is not shown a still motorway", () => {
    // The rainParticles weather-floor ruling (register B71) applied to AC-12:
    // a lesson whose entire subject is the gust may not render windless at any
    // tier the product ships.
    for (const level of ["low", "med", "high"] as const) {
      expect(QUALITY_PRESETS[level].windParticles).toBeGreaterThan(0);
    }
    expect(QUALITY_PRESETS.low.windParticles).toBeLessThanOrEqual(
      QUALITY_PRESETS.med.windParticles,
    );
    expect(QUALITY_PRESETS.med.windParticles).toBeLessThanOrEqual(
      QUALITY_PRESETS.high.windParticles,
    );
    // Sparse chaff, not a rain curtain — the road paint stays legible.
    expect(QUALITY_PRESETS.high.windParticles).toBeLessThan(QUALITY_PRESETS.high.rainParticles);
  });
});

// ---------------------------------------------------------------------------
// THE ROUTING GUARD — the half that stops this being a dead predicate.
// ---------------------------------------------------------------------------

const ENV_SRC = readFileSync(path.resolve(__dirname, "../SimEnvironment.tsx"), "utf8");
const LAYER_SRC = readFileSync(path.resolve(__dirname, "../WindDust.tsx"), "utf8");
const SCENE_SRC = readFileSync(
  path.resolve(__dirname, "../../../../components/sim/LessonScene.tsx"),
  "utf8",
);

const envMountsLayer = (src: string) =>
  /readWindLateralN !== undefined && qp\.windParticles > 0 && \([\s\S]{0,400}?<WindDust/.test(src);
const layerReadsForceEveryFrame = (src: string) =>
  /useFrame\(\([\s\S]{0,2000}?windDriftLook\(readLateralN\(\)\)/.test(src);
const sceneFeedsTheSim = (src: string) =>
  /const readWindLateralN = useCallback\(\(\) => simRef\.current\?\.windLateralNow \?\? 0, \[\]\)/.test(
    src,
  );
const sceneGatesOnAuthoredPhysics = (src: string) =>
  /readWindLateralN=\{lesson\.physics\?\.crosswind \? readWindLateralN : undefined\}/.test(src);

describe("routing: the air reaches the student, and the sim is what moves it", () => {
  it("SimEnvironment mounts the layer, gated on a reader and on the tier's budget", () => {
    expect(ENV_SRC).toContain('import { WindDust } from "./WindDust";');
    expect(envMountsLayer(ENV_SRC)).toBe(true);
    // Mounted beside the other two weather particle systems, so a future
    // reorganisation of the atmosphere block moves all three together.
    expect(ENV_SRC).toContain("<SnowFlakes");
    expect(ENV_SRC).toContain("<RainStreaks");
  });

  it("the layer re-reads the LIVE force every frame — not once at mount", () => {
    expect(layerReadsForceEveryFrame(LAYER_SRC)).toBe(true);
    // Scrolled by accumulated distance, not `time × speed`: the gust speed
    // changes every frame and the product would teleport the whole field.
    expect(LAYER_SRC).toContain("driftM.current += look.speedMps * dt;");
    expect(LAYER_SRC).toContain("u.uDrift.value = driftM.current;");
  });

  it("LessonScene feeds it the sim's own wind term, on the authored opt-in only", () => {
    expect(sceneFeedsTheSim(SCENE_SRC)).toBe(true);
    expect(sceneGatesOnAuthoredPhysics(SCENE_SRC)).toBe(true);
    // The SAME field that arms the force on the chassis, so the picture cannot
    // be mounted on a lesson the wind is not actually blowing on.
    expect(SCENE_SRC).toContain("windLateralN={lesson.physics?.crosswind ? -CROSSWIND_BRIDGE_N");
  });

  it("cutting any leg out of the REAL source turns the guard red", () => {
    expect(envMountsLayer(ENV_SRC.replace(/<WindDust/, "<NoDrift"))).toBe(false);
    expect(
      envMountsLayer(ENV_SRC.replace(/readWindLateralN !== undefined/, "false")),
    ).toBe(false);
    expect(
      layerReadsForceEveryFrame(LAYER_SRC.replace(/windDriftLook\(readLateralN\(\)\)/, "0")),
    ).toBe(false);
    // A read outside a per-frame loop is dead: the air would freeze at whatever
    // the sim happened to read on mount (which is 0 — the sim is not built yet).
    expect(layerReadsForceEveryFrame(LAYER_SRC.replace(/useFrame\(/g, "useEffect("))).toBe(false);
    expect(
      sceneFeedsTheSim(SCENE_SRC.replace(/simRef\.current\?\.windLateralNow \?\? 0/, "0")),
    ).toBe(false);
    expect(
      sceneGatesOnAuthoredPhysics(
        SCENE_SRC.replace(
          /readWindLateralN=\{lesson\.physics\?\.crosswind \? readWindLateralN : undefined\}/,
          "readWindLateralN={readWindLateralN}",
        ),
      ),
    ).toBe(false);
  });
});
