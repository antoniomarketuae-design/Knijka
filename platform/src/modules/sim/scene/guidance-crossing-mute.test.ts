/**
 * THE GUIDANCE RIBBON DOES NOT PAINT OVER A ZEBRA.
 *
 * THE FRAME, and it is not a matter of taste. `scratchpad/lessons/
 * sc-zebra-approach/landscape-13-phase-stopped-before-zebra.png`, cropped
 * [200, 380 1100×420] × 2: the student is stopped at the crossing on
 * `sc-zebra-approach`, the advisor card says «Изчакай човекът да освободи
 * платното», and the teal guidance ribbon runs over the crossing with its
 * chevrons pointing forward. The founder read that as a contradiction on the
 * glass. It is — but the crop shows the narrower, harder fact underneath it:
 *
 *   RIBBON_FRAG blends ADDITIVELY at RIBBON_Y = 0.045 and the zebra's bars are
 *   painted at MARKING_Y = 0.032, so where the two meet the white bars are
 *   washed teal and their edges stop reading.
 *
 * `sc-zebra-approach` exists to teach „видиш ли пешеходната пътека, вдигни
 * крака от газта" — and the HUD was drawing over the thing it is teaching the
 * student to see. Same class as register B24/B27, different surface.
 *
 * The route, the acceptance radii and every graded zone are untouched. What
 * changes is 8 m of drawing.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CROSSING_MUTE_HALF_M,
  CROSSING_MUTE_MAX_SPANS,
  buildRouteGraph,
  crossingMuteSpans,
  deriveGuidanceRoute,
  nearestArcOnRoute,
  type RouteDistrictLike,
} from "./guidanceRoute";

/** `zb-v1` is the map `sc-zebra-approach` runs on: one 220 m residential
 *  street, two MARKED crossings at y = 90 and y = 160. Written out here rather
 *  than read from disk so the geometry under test is visible in the test. */
const ZB: RouteDistrictLike = {
  roads: {
    nodes: [
      { id: "zb-n-start", x: 0, y: 0 },
      { id: "zb-n-end", x: 0, y: 220 },
    ],
    edges: [
      {
        id: "zb-e-street",
        from: "zb-n-start",
        to: "zb-n-end",
        class: "residential",
        lanes: 2,
        oneway: false,
        geometry: [
          [0, 0],
          [0, 220],
        ],
      } as unknown as RouteDistrictLike["roads"]["edges"][number],
    ],
  },
  crossings: [
    { id: "zb-x-1", x: 0, y: 90, kind: "marked" },
    { id: "zb-x-2", x: 0, y: 160, kind: "marked" },
  ] as never,
};

function routeUpTheStreet() {
  const graph = buildRouteGraph(ZB);
  return deriveGuidanceRoute(
    graph,
    { x: 0, y: 5, headingDeg: 0 },
    { kind: "ahead", meters: 200 },
    { lookahead: [] },
  );
}

describe("crossingMuteSpans", () => {
  it("puts a quiet span over BOTH marked crossings on the route", () => {
    const route = routeUpTheStreet();
    expect(route).not.toBeNull();
    const spans = crossingMuteSpans(route, ZB);
    expect(spans).toHaveLength(2);

    // Each span must actually contain the arclength the crossing sits at —
    // this is the assertion that would red if the span were computed off the
    // wrong measure (route arclength vs district y) or off by the lane offset.
    for (const c of [
      { x: 0, y: 90 },
      { x: 0, y: 160 },
    ]) {
      const s = nearestArcOnRoute(route!, c.x, c.y);
      const covering = spans.filter(([a, b]) => s >= a && s <= b);
      expect(covering, `no quiet span over the crossing at y=${c.y}`).toHaveLength(1);
      // …and it is the width of the bars plus clearance, not a token notch.
      const [a, b] = covering[0]!;
      expect(b - a).toBeCloseTo(2 * CROSSING_MUTE_HALF_M, 6);
    }
    // Sorted, so the consumer can write them straight into a fixed uniform.
    expect(spans[0]![0]).toBeLessThan(spans[1]![0]);
  });

  it("leaves the ribbon alone where there is no painted crossing", () => {
    const route = routeUpTheStreet();
    // No crossings at all.
    expect(crossingMuteSpans(route, { roads: ZB.roads })).toEqual([]);
    // An UNMARKED crossing paints no bars, so there is nothing to protect and
    // a gap in the ribbon there would be a gap with no cause.
    expect(
      crossingMuteSpans(route, {
        roads: ZB.roads,
        crossings: [{ id: "u", x: 0, y: 90, kind: "unmarked" }] as never,
      }),
    ).toEqual([]);
    // A crossing on the parallel street is not on this route.
    expect(
      crossingMuteSpans(route, {
        roads: ZB.roads,
        crossings: [{ id: "far", x: 60, y: 90, kind: "marked" }] as never,
      }),
    ).toEqual([]);
    expect(crossingMuteSpans(null, ZB)).toEqual([]);
  });

  it("never returns more spans than the shader carries", () => {
    const route = routeUpTheStreet();
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      x: 0,
      y: 20 + i * 15,
      kind: "marked",
    }));
    const spans = crossingMuteSpans(route, { roads: ZB.roads, crossings: many as never });
    expect(spans.length).toBeLessThanOrEqual(CROSSING_MUTE_MAX_SPANS);
  });
});

describe("the ribbon shader consumes the spans", () => {
  it("RouteGuidance mutes the ribbon over them and writes the uniform", () => {
    // The spans can be perfect while the shader ignores them — which is the
    // state the founder photographed. There is no r3f render harness in this
    // suite, so the wiring is read: the fragment shader must carry the uMute
    // array and fold it into alpha, and the layout effect must fill it.
    // None of these strings exists on the pre-2026-08-16 file.
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../components/sim/RouteGuidance.tsx"),
      "utf8",
    );
    expect(src).toMatch(/uniform vec2 uMute\[/);
    // alpha is multiplied by the mute term — not merely declared.
    expect(src).toMatch(/float a = uOpacity \*[^;]*\bmute\b/);
    expect(src).toContain("crossingMuteSpans(route, district)");
    expect(src).toContain("uniforms.uMute");
  });
});
