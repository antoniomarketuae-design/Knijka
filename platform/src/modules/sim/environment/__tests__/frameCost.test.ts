/**
 * THE GATE THAT MEASURES THE FRAME.
 *
 * ~50 district tests used to assert `world.stats.drawCallEstimate <= 150`, and
 * one asserted it against `PERF_BUDGETS.low.drawCalls` under the title „keeps
 * every dressed street inside the tier-low draw budget". Every one of them was
 * green, on every district, for months. Then the running product was counted
 * and 37 of 37 districts sampled were over the HARD cap at tier low.
 *
 * The estimate was never capable of answering. This file replaces it with
 * three checks that are:
 *
 *   1. THE ESTIMATE REFUSES. `staticDrawSlots` is a `number` and
 *      `scoreFrameDrawBudget` takes a nominal `MeasuredFrame`, so the old
 *      comparison no longer type-checks; and `measuredFrame()` throws on
 *      anything without instrument / surface / canvas / frame-count
 *      provenance. Both are asserted below.
 *   2. THE CEILING DOMINATES THE MEASUREMENT. `frameDrawCeiling` enumerates
 *      every subsystem that submits a draw. If a new one appears and the
 *      ceiling has no term for it, the next measurement exceeds the ceiling
 *      and this test goes red instead of quietly passing.
 *   3. THE MEASUREMENT IS ON THE RECORD, WITH ITS VERDICT. The table below
 *      states, in the open, which districts FAIL their budget and by how much.
 *      A district that gets worse than its recorded frame fails the ratchet.
 *
 * The numbers in `MEASURED_FRAMES` were counted with a raw
 * WebGL-`draw*`-wrapping counter driven from `/dev/drive-rig`, frames
 * delimited by an rAF chain installed before any page script. Draw and
 * triangle counts are scene-graph properties and transfer between machines.
 * NO FRAME TIME IS RECORDED ANYWHERE HERE and none may be inferred: the rig is
 * headless chromium on ANGLE/SwiftShader.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAFFIC_MESHES,
  MEASURED_FRAMES,
  NotAMeasurementError,
  frameCostTerms,
  frameDrawCeiling,
  measuredFrame,
  scoreFrameDrawBudget,
  type MeasuredFrame,
} from "../frameCost";
import { PERF_BUDGETS } from "../perfBudget";

/**
 * Static slot counts of the measured districts, from `buildWorldGeometry`
 * (`world/__tests__/drawSlots.test.ts` is what keeps these honest). Kept as a
 * literal here rather than rebuilt: this file is about the FRAME, and building
 * six districts to reach a number that is already asserted elsewhere would
 * just make the frame test slow.
 */
const STATIC_SLOTS: Record<string, number> = {
  "pe-cane-v1": 47,
  "d2-v1": 70,
  "ov-crest-v1": 50,
  "hz-roadworks-v1": 54,
  "sp-creep-v1": 45,
  "mw-v1": 36,
};

/**
 * The verdict each measured district currently earns, stated out loud.
 * This is not a target and not an aspiration — it is what the product does.
 * Fixing a row here means re-measuring and editing it DOWN.
 */
const RECORDED_VERDICTS: Record<string, "pass" | "warn" | "fail"> = {
  "pe-cane-v1|low|1": "fail",
  "d2-v1|low|1": "fail",
  "ov-crest-v1|low|1": "fail",
  "hz-roadworks-v1|low|1": "fail",
  "sp-creep-v1|low|1": "fail",
  "mw-v1|low|1": "fail",
  "pe-cane-v1|med|1": "fail",
  "d2-v1|med|1": "fail",
  // THE FIRST ROW IN THIS TABLE THAT PASSES OUTRIGHT, and it only just does:
  // 293.1 draws against a 300 soft budget, after the mirror per-instance cull
  // took the 28.6-draw mirror entry off half its frames. It was 303.4 (`warn`)
  // before. Because a 2 % session-to-session drift decides this verdict, the
  // recorded number is the MEDIAN of three independent sessions (299.1 / 292.1
  // / 293.1) rather than a single window — do not re-record it from one run.
  // It is still the lightest district at the most generous tier.
  "pe-cane-v1|high|1": "pass",
  "pe-cane-v1|low|3": "fail",
  "d2-v1|low|3": "fail",
};

const key = (f: MeasuredFrame) => `${f.district}|${f.tier}|${f.level}`;

describe("a draw budget may only be scored against a measurement", () => {
  it("refuses a frame with no provenance — this is where a static estimate dies", () => {
    // The exact shape of the old mistake: a static count offered as a frame.
    expect(() =>
      measuredFrame({
        district: "pe-cane-v1",
        scenario: "sc-crossing-white-cane",
        tier: "low",
        level: 1,
        drawsPerFrame: 44, // world.stats.staticDrawSlots
        trisPerFrame: 1,
        provenance: { instrument: "", surface: "", canvas: "", measuredAt: "", frames: 0 },
      }),
    ).toThrow(NotAMeasurementError);
  });

  it("refuses a canvas-less or too-short sample", () => {
    const base = {
      district: "d2-v1",
      scenario: "sc-ed-d2-city-run",
      tier: "low" as const,
      level: 1,
      drawsPerFrame: 200,
      trisPerFrame: 900_000,
    };
    const prov = {
      instrument: "raw-gl-counter/playwright",
      surface: "/dev/drive-rig",
      measuredAt: "2026-08-10",
    };
    expect(() => measuredFrame({ ...base, provenance: { ...prov, canvas: "big", frames: 300 } })).toThrow(
      NotAMeasurementError,
    );
    // 12 frames cannot be a median of one-second windows.
    expect(() =>
      measuredFrame({ ...base, provenance: { ...prov, canvas: "1264×619", frames: 12 } }),
    ).toThrow(NotAMeasurementError);
  });

  it("every recorded frame carries the provenance that makes it re-runnable", () => {
    expect(MEASURED_FRAMES.length).toBeGreaterThanOrEqual(11);
    for (const f of MEASURED_FRAMES) {
      expect(f.provenance.instrument, f.district).toBeTruthy();
      expect(f.provenance.surface, f.district).toBe("/dev/drive-rig");
      expect(f.provenance.canvas, f.district).toMatch(/^\d+×\d+$/);
      expect(f.provenance.frames, f.district).toBeGreaterThanOrEqual(250);
      // Re-constructing it through the guard must succeed — the recorded rows
      // are exactly what the guard would accept from a live probe.
      expect(() => measuredFrame(f)).not.toThrow();
    }
  });
});

describe("the ceiling accounts for the whole frame", () => {
  it("dominates every measured frame — a subsystem with no term shows up here", () => {
    for (const f of MEASURED_FRAMES) {
      const slots = STATIC_SLOTS[f.district];
      expect(slots, `no static slot count recorded for ${f.district}`).toBeDefined();
      const ceiling = frameDrawCeiling({
        staticDrawSlots: slots!,
        // Worst case for the 400 m prop grid on the heaviest map in the
        // product; d2-v1 is the only district that meaningfully chunks.
        propChunkSlots: f.district === "d2-v1" ? 60 : 12,
        tier: f.tier,
        level: f.level,
      });
      expect(f.drawsPerFrame, `${key(f)} exceeds the enumerated ceiling`).toBeLessThanOrEqual(
        ceiling,
      );
    }
  });

  it("names the cockpit as the term that breaks the tier-low budget on its own", () => {
    const terms = frameCostTerms({ staticDrawSlots: 0, tier: "low", level: 3 });
    const cockpit = terms.find((t) => t.id === "hero-cockpit")!;
    // 56 measured, against a 70-draw soft budget for the WHOLE frame. This is
    // not a bug to fix in the renderer, it is a budget line to re-derive, and
    // stating it as an assertion is how it stops being forgotten.
    expect(cockpit.draws).toBe(56);
    expect(cockpit.draws / PERF_BUDGETS.low.drawCalls).toBeGreaterThan(0.79);
  });

  it("charges the mirror pass at the cadence MirrorRig actually runs", () => {
    const at = (tier: "low" | "med" | "high") =>
      frameCostTerms({ staticDrawSlots: 40, tier, level: 1, trafficMeshes: DEFAULT_TRAFFIC_MESHES })
        .find((t) => t.id === "mirror-rtt")!.draws;
    // low renders the rear mirror on one frame in four, med on one in two,
    // high rear-every-2 plus a door every 4 — measured at 25.0 / 50.3 / 100 %
    // of frames carrying a mirror region.
    expect(at("med")).toBeGreaterThan(at("low"));
    expect(at("high")).toBeGreaterThan(at("med"));
  });
});

describe("the recorded frames, and what they score", () => {
  it("scores each measured frame and holds it to its recorded verdict", () => {
    for (const f of MEASURED_FRAMES) {
      const recorded = RECORDED_VERDICTS[key(f)];
      expect(recorded, `no recorded verdict for ${key(f)}`).toBeDefined();
      expect(scoreFrameDrawBudget(f).verdict, key(f)).toBe(recorded);
    }
  });

  it("is a ratchet: a district may not draw more than it was measured drawing", () => {
    // The point of committing the numbers. Re-measure, and if a change made a
    // district heavier this fails with the district named. Editing a number
    // upward is a decision someone has to make deliberately.
    for (const f of MEASURED_FRAMES) {
      expect(f.drawsPerFrame, key(f)).toBeGreaterThan(0);
      expect(f.trisPerFrame, key(f)).toBeGreaterThan(0);
    }
    const d2low = MEASURED_FRAMES.find((f) => key(f) === "d2-v1|low|1")!;
    const peLow = MEASURED_FRAMES.find((f) => key(f) === "pe-cane-v1|low|1")!;
    // Both were higher before this row's renderer fixes, measured on the same
    // rig with the fixes backed out: d2-v1 was 249.2 draws / 1,763,150
    // triangles and pe-cane-v1 was 178.9 / 243,495.
    expect(d2low.drawsPerFrame).toBeLessThan(249.2);
    expect(d2low.trisPerFrame).toBeLessThan(1_763_150);
    expect(peLow.drawsPerFrame).toBeLessThan(178.9);
    expect(peLow.trisPerFrame).toBeLessThan(243_495);
    // AND the hero-shell LOD (third pass): the SAME rows were 1,137,300 and
    // 168,311 triangles with the 65,434-triangle `hero_car.glb`. Re-inflating
    // that asset — or re-running `tools/glb/decimate_hero.mjs` at a weaker
    // preset — puts them back over these lines and names the district here.
    expect(d2low.trisPerFrame).toBeLessThan(1_137_300);
    expect(peLow.trisPerFrame).toBeLessThan(168_311);
  });

  it("the cockpit at rung 3 is the negative control, and it did not move", () => {
    // The exterior shell is `visible={!cockpitView}` in HeroCarBody and the
    // ShadowCar ghost only mounts at rung 1, so a cockpit frame at rung 3
    // contains ZERO hero-shell triangles — a live scene census confirmed 0.
    // The hero LOD therefore MUST NOT have changed these two rows, and the fact
    // that it did not is what says the A/B moved the thing it claimed to move
    // rather than something else in the frame.
    const peL3 = MEASURED_FRAMES.find((f) => key(f) === "pe-cane-v1|low|3")!;
    const d2L3 = MEASURED_FRAMES.find((f) => key(f) === "d2-v1|low|3")!;
    // Pre-LOD: 102,649 and 1,070,484. Both re-measured within run-to-run noise.
    expect(Math.abs(peL3.trisPerFrame - 102_649) / 102_649).toBeLessThan(0.01);
    expect(d2L3.trisPerFrame).toBe(1_070_484);
  });

  it("records the rung-1 aid stack as a real cost, not a rounding error", () => {
    const l1 = MEASURED_FRAMES.find((f) => key(f) === "pe-cane-v1|low|1")!;
    const l3 = MEASURED_FRAMES.find((f) => key(f) === "pe-cane-v1|low|3")!;
    // The ShadowCar ghost + path ribbon only mount at level 1
    // (lessons/scenario/compile.ts). A corpus table taken at rung 1 therefore
    // overstates what a student at rung 3 pays.
    expect(l1.drawsPerFrame - l3.drawsPerFrame).toBeGreaterThan(15);
  });
});
