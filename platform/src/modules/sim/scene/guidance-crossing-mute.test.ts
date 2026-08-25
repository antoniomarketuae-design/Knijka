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
// The mount reader — a test helper, and the only one in the tree that reads a
// JSX call site as a tree rather than as text. See its own header.
import { jsxPropsOf } from "../../../components/sim/lesson-ui/__tests__/callSiteShape";

/**
 * ── THE SHADER PINS RUN ON CODE, NOT ON THE PARAGRAPH ABOVE IT ─────────────
 * MEASURED on this tree, 2026-08-25, before this helper existed. The two
 * shader cases below read the component sources with `readFileSync` and match
 * raw text, and a GLSL line comment is raw text. Commenting the alpha line out
 * and writing the unmuted one under it —
 *
 *     // float a = uOpacity * edge * mute * (0.4 + 0.6 * dash);
 *     float a = uOpacity * edge * (0.4 + 0.6 * dash);
 *
 * — puts the demonstration ribbon back over the zebra bars on every rung and
 * left this file at **9 passed / 9**. A pin that a commented-out line satisfies
 * is not guarding the shader, it is guarding the prose describing the shader.
 *
 * Same remedy and same wording as `lesson-ui/briefingOverflow.test.tsx`, which
 * hit the mirror image of this („a source assertion that cannot tell code from
 * the paragraph describing it is not a guard, it is a ban on writing the reason
 * down"): every assertion below runs on the source with its comments removed.
 * Both spellings are stripped, because GLSL inside a `/* glsl *\/` template
 * literal takes `//` and `/* … *\/` exactly as TypeScript does — the mutation
 * above used the first and `uOpacity * edge /* mute *\/ *` uses the second.
 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

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
    // None of these strings exists on the pre-2026-08-16 file. Comments out —
    // see `stripComments`: this case had the same hole its ShadowCar twin was
    // measured to have, and it is one call to close.
    const src = stripComments(
      fs.readFileSync(
        path.resolve(__dirname, "../../../components/sim/RouteGuidance.tsx"),
        "utf8",
      ),
    );
    expect(src).toMatch(/uniform vec2 uMute\[/);
    // alpha is multiplied by the mute term — not merely declared.
    expect(src).toMatch(/float a = uOpacity \*[^;]*\bmute\b/);
    expect(src).toContain("crossingMuteSpans(route, district)");
    expect(src).toContain("uniforms.uMute");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THERE ARE TWO RIBBONS ON THAT ASPHALT, AND ONLY ONE OF THEM WAS MUTED.
 * `sc-crossing-dart:f0bf371d`, w10-3, round 11.
 *
 * THE FRAME: `.audit-frames/w10-3/frames/sc-crossing-dart__mobile-right/
 * 06-waited.png` — the student stopped at the marked crossing on pe-dart-v1, a
 * glowing BLUE dashed ribbon running unbroken over the zebra bars to the shadow
 * car beyond.
 *
 * THE ROW WAS FILED AGAINST THIS FILE and this file was already right. Driven
 * below on the SHIPPED pe-dart-v1 with the component's own look-ahead: the
 * guidance route returns a quiet span at [65.9, 73.9] m for the crossing at
 * (0, 80). The blue one is `components/sim/ShadowCar.tsx` — `KIND_TINT.shadow`
 * = #3f8cff, the L1 „Пълна помощ" demonstration path — and `TRACE_RIBBON_FRAG`
 * carried no mute term at all. It could not have: `crossingMuteSpans` said
 * `DerivedRoute` while that path is a `tracePathForRibbon` polyline, so the
 * question was untypeable rather than unanswered. The parameter is
 * `ArcSampledPath` now, which is what the body only ever read.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("the DEMONSTRATION ribbon is the second one over the same zebra", () => {
  /** The shipped map `sc-crossing-dart` runs on — read, not retyped, so a
   *  re-authored crossing fails here rather than on a phone. */
  const dart = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../../../content/world/pe-dart-v1.json"), "utf8"),
  ) as RouteDistrictLike;

  /** A trace-shaped path: `tracePathForRibbon`'s exact return shape plus the
   *  `totalLen` `ShadowCar` derives from `arc[count-1]`. Straight up the right
   *  lane from y = 10 to y = 130, i.e. through the crossing at y = 80. */
  function demoPathUpTheStreet() {
    const count = 49;
    const pts = new Float32Array(count * 2);
    const arc = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pts[i * 2] = 4.06;
      pts[i * 2 + 1] = 10 + i * 2.5;
      arc[i] = i * 2.5;
    }
    return { pts, arc, count, totalLen: arc[count - 1] };
  }

  it("the shipped map really does put a marked crossing under both ribbons", () => {
    expect(dart.crossings?.map((c) => ({ x: c.x, y: c.y, kind: c.kind }))).toEqual([
      { x: 0, y: 80, kind: "marked" },
    ]);
  });

  it("the mute answers a trace path, not only a derived route", () => {
    const spans = crossingMuteSpans(demoPathUpTheStreet(), dart);
    // y = 80 is 70 m along a path that starts at y = 10, ±CROSSING_MUTE_HALF_M.
    expect(spans).toHaveLength(1);
    expect(spans[0]![0]).toBeCloseTo(70 - CROSSING_MUTE_HALF_M, 5);
    expect(spans[0]![1]).toBeCloseTo(70 + CROSSING_MUTE_HALF_M, 5);
  });

  it("…and it is the SAME zebra the guidance ribbon already goes quiet over", () => {
    // Both ribbons, one crossing, one answer — the property the row is really
    // about. If these two ever disagree the student sees a gap in one line and
    // paint washed out under the other, in the same 8 m of road.
    const graph = buildRouteGraph(dart);
    const route = deriveGuidanceRoute(
      graph,
      { x: 4.06, y: 10, headingDeg: 0 },
      // deriveGuidanceRoute takes a RouteTarget — { kind, x, y, shape? } — not a
      // resolved GuidancePointGoal. marker/affordance/acceptRadiusM/labelBg are
      // what the RESOLVER produces, so passing them here is TS2353. Vitest does
      // not typecheck, so this new file was green while tsc was red.
      { kind: "point", x: 4.06, y: 118, shape: { kind: "zone", radiusM: 17 } },
      { lookahead: [] },
    );
    const guidance = crossingMuteSpans(route, dart);
    const demo = crossingMuteSpans(demoPathUpTheStreet(), dart);
    expect(guidance).toHaveLength(1);
    expect(guidance[0]![0]).toBeCloseTo(demo[0]![0], 0);
    expect(guidance[0]![1]).toBeCloseTo(demo[0]![1], 0);
  });

  it("ShadowCar mutes its ribbon over them and writes the uniform", () => {
    // Same reading as the RouteGuidance case above, and for the same reason:
    // there is no r3f harness here, and a shader that declares a uniform it
    // never spends is the exact state that was photographed. AND ON CODE ONLY:
    // the raw-text version of this case passed 9/9 with the alpha line
    // commented out and an unmuted one under it — see `stripComments`.
    const src = stripComments(
      fs.readFileSync(
        path.resolve(__dirname, "../../../components/sim/ShadowCar.tsx"),
        "utf8",
      ),
    );
    expect(src).toMatch(/uniform vec2 uMute\[/);
    expect(src).toMatch(/float a = uOpacity \*[^;]*\bmute\b/);
    expect(src).toContain("crossingMuteSpans(");
    expect(src).toContain("uniforms.uMute");
    // The sentinel and the ramp are the PUBLISHED ones. A local copy of either
    // is how two surfaces that must agree stop agreeing.
    expect(src).toMatch(/import \{[\s\S]*?MUTE_UNUSED_S[\s\S]*?\} from "@\/modules\/sim\/scene\/guidanceRoute"/);
    expect(src).not.toMatch(/const MUTE_UNUSED_S/);
    expect(src).not.toMatch(/const MUTE_EDGE_M/);
  });

  it("DOES ANYTHING RENDER IT — both LessonScene mounts hand the ribbon a district", () => {
    // A prop is an argument list with angle brackets: `district={undefined &&
    // district}` type-checks, blanks the mute on every rung, and contains the
    // substring a `toContain` would look for. So the mounts are read as trees.
    const scene = fs.readFileSync(
      path.resolve(__dirname, "../../../components/sim/LessonScene.tsx"),
      "utf8",
    );
    const mounts = jsxPropsOf(scene, "ShadowCar");
    expect(mounts.length).toBeGreaterThanOrEqual(2);
    for (const props of mounts) expect(props.district).toBe("district");
  });
});
