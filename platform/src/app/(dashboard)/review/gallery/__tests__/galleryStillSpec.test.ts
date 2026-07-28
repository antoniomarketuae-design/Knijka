import { describe, expect, it } from "vitest";
import {
  DEFAULT_STILL_ZOOM_M,
  scenarioStillSpec,
  shadowSampleIndex,
  stillKeyForQuestion,
  stillKeyForScenario,
  stillZoomFor,
  type StillTraceSample,
} from "../galleryStillSpec";

/** A straight northbound drive, one sample every second. */
function drive(n: number): StillTraceSample[] {
  return Array.from({ length: n }, (_, i) => ({
    tSec: i,
    x: 0,
    y: i * 10,
    headingDeg: 0,
  }));
}

describe("shadowSampleIndex", () => {
  it("freezes on the MIDDLE annotation beat when the trace has them", () => {
    // Beats at 4 s / 8 s / 12 s → the middle one is 8 s → sample index 8.
    expect(shadowSampleIndex(drive(21), [0, 4, 8, 12])).toBe(8);
  });

  it("ignores the opening line at t=0 and any beat at/after the end", () => {
    // Only 6 s survives the filter, so it is its own middle.
    expect(shadowSampleIndex(drive(11), [0, 0.2, 6, 10, 40])).toBe(6);
  });

  it("falls back to the fixed fraction when no beat is usable", () => {
    // 21 samples → last index 20 → round(20 * 0.45) = 9.
    expect(shadowSampleIndex(drive(21), [])).toBe(9);
    expect(shadowSampleIndex(drive(21), null)).toBe(9);
  });

  it("picks the closest sample when the beat falls between two", () => {
    expect(shadowSampleIndex(drive(21), [7.4])).toBe(7);
    expect(shadowSampleIndex(drive(21), [7.6])).toBe(8);
  });
});

describe("stillZoomFor", () => {
  it("sizes the window per archetype — a bay is not a motorway", () => {
    expect(stillZoomFor("parking-lot")).toBeLessThan(stillZoomFor("motorway-segment"));
  });

  it("falls back for an archetype it does not know", () => {
    expect(stillZoomFor("something-new")).toBe(DEFAULT_STILL_ZOOM_M);
  });
});

describe("scenarioStillSpec", () => {
  const base = {
    templateId: "sc-test",
    districtId: "d-v1",
    archetype: "x-junction",
    start: {},
  };

  it("prefers the recorded shadow drive and marks the ego", () => {
    const r = scenarioStillSpec({ ...base, shadowSamples: drive(21), shadowAnnotationsSec: [8] });
    expect(r.source).toBe("shadow-trace");
    expect(r.gap).toBeNull();
    expect(r.spec?.poses).toEqual([
      { kind: "car", x: 0, y: 80, headingDeg: 0, variant: "ego" },
    ]);
  });

  it("pushes the focus AHEAD of the car along its heading", () => {
    const r = scenarioStillSpec({ ...base, shadowSamples: drive(21), shadowAnnotationsSec: [8] });
    // heading 0 = north (+y); look-ahead is 18% of the 52 m x-junction window.
    expect(r.spec?.focus.zoomM).toBe(52);
    expect(r.spec?.focus.x).toBeCloseTo(0, 5);
    expect(r.spec?.focus.y).toBeCloseTo(80 + 52 * 0.18, 1);
  });

  it("aims the look-ahead east when the car heads east", () => {
    const r = scenarioStillSpec({
      ...base,
      shadowSamples: [{ tSec: 0, x: 10, y: 10, headingDeg: 90 }],
    });
    expect(r.spec?.focus.x).toBeCloseTo(10 + 52 * 0.18, 1);
    expect(r.spec?.focus.y).toBeCloseTo(10, 5);
  });

  it("falls back to the template's explicit start pose", () => {
    const r = scenarioStillSpec({
      ...base,
      start: { position: { x: 3, y: -4 }, headingDeg: 180 },
      shadowSamples: null,
    });
    expect(r.source).toBe("start-position");
    expect(r.spec?.poses[0]).toMatchObject({ x: 3, y: -4, headingDeg: 180, variant: "ego" });
  });

  it("falls back to the named district spawn point", () => {
    const r = scenarioStillSpec({
      ...base,
      start: { spawnPointId: "sp-a" },
      spawnPoints: [{ id: "sp-a", x: 7, y: 8, heading: 270 }],
      shadowSamples: null,
    });
    expect(r.source).toBe("spawn-point");
    expect(r.spec?.poses[0]).toMatchObject({ x: 7, y: 8, headingDeg: 270 });
  });

  it("reports a GAP rather than inventing a pose", () => {
    const r = scenarioStillSpec({ ...base, start: { spawnPointId: "missing" }, spawnPoints: [] });
    expect(r.spec).toBeNull();
    expect(r.gap).toBe("no-pose");
    expect(r.source).toBeNull();
  });

  it("carries the district through unchanged", () => {
    const r = scenarioStillSpec({ ...base, shadowSamples: drive(3) });
    expect(r.spec?.districtId).toBe("d-v1");
    expect(r.spec?.kind).toBe("sceneStill");
  });
});

describe("still keys", () => {
  it("namespaces scenarios and questions apart", () => {
    expect(stillKeyForScenario("sc-a")).toBe("sc__sc-a");
    expect(stillKeyForQuestion("q-a")).toBe("q__q-a");
    expect(stillKeyForScenario("x")).not.toBe(stillKeyForQuestion("x"));
  });
});

describe("scenarioStillSpec — parking bays", () => {
  const bays = [
    { x: 6, y: -6.5, headingDeg: 0, occupied: true, isTarget: false },
    { x: 6, y: 0, headingDeg: 0, occupied: false, isTarget: true },
    { x: 6, y: 6.5, headingDeg: 0, occupied: true, isTarget: false },
  ];
  const input = {
    templateId: "sc-park",
    districtId: "lot-v1",
    archetype: "parking-lot",
    start: {},
    parkingBays: bays,
    shadowSamples: [{ tSec: 0, x: 3, y: 6, headingDeg: 0 }],
  };

  it("places a car in every OCCUPIED bay (the drill's reference frame)", () => {
    const r = scenarioStillSpec(input);
    expect(r.spec?.poses).toHaveLength(3); // ego + two neighbours
    expect(r.spec?.poses.filter((p) => p.variant === "ego")).toHaveLength(1);
    expect(r.spec?.poses.slice(1)).toEqual([
      { kind: "car", x: 6, y: -6.5, headingDeg: 0 },
      { kind: "car", x: 6, y: 6.5, headingDeg: 0 },
    ]);
  });

  it("points a target mark at the free bay", () => {
    expect(scenarioStillSpec(input).spec?.marks).toEqual([{ kind: "target", x: 6, y: 0 }]);
  });

  it("frames the span between the car and the slot, not just ahead", () => {
    const f = scenarioStillSpec(input).spec!.focus;
    expect(f.x).toBeCloseTo(4.5, 5); // midpoint of x 3 and 6
    expect(f.y).toBeCloseTo(3, 5); // midpoint of y 6 and 0
  });

  it("leaves marks off entirely when the district has no target bay", () => {
    const r = scenarioStillSpec({ ...input, parkingBays: [] });
    expect(r.spec?.marks).toBeUndefined();
    expect(r.spec?.poses).toHaveLength(1);
  });
});
