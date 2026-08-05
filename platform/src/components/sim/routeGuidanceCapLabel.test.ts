/**
 * B58 — THE PRINTED GATE LABEL MAY NOT EXCEED THE SIGN.
 *
 * The gate bar drawn across the lane is not a debug read-out: it carries an
 * instruction in the instructor's voice — «Карай дотук / не по-бързо от N
 * км/ч» — and the founder found it reading **57 on a street posted 50**, inside
 * «Превишаване над +10 км/ч», the one drill whose whole subject is that 51–60
 * км/ч in a 50 zone is a scored fault. „A student who obeys the number the
 * world shows him commits the mistake the world is grading."
 *
 * Half of that number was the difficulty ladder and is fixed at source
 * (`scenario/params.ts`; pinned by `b58-gate-never-over-posted.test.ts`). The
 * other half is authored: **113 compiled gates across 20 templates carry a cap
 * their own street's limit does not allow** (55 on a 50, 92 on a 90, 33 on a
 * 30, 52 on a 50). Those numbers are GRADING slack — a beginner's speedometer,
 * the rule engine's own `speedingGraceMaxKmh` — and re-authoring 113 graded
 * gates plus their committed traces is a decision, not a bug fix. What is not
 * defensible is printing them. So the gate keeps grading what it graded, and
 * the sentence on the glass is clamped to the law.
 *
 * This file pins that clamp and the geometry lookup under it.
 */

import { describe, expect, it } from "vitest";
import { capLineBg, postedLimitAt } from "./RouteGuidance";
import type { GuidancePointGoal } from "@/modules/sim/scene/guidanceRoute";

const goal = (over: Partial<GuidancePointGoal> = {}): GuidancePointGoal => ({
  kind: "point",
  x: 4.06,
  y: 200,
  marker: true,
  affordance: "through",
  shape: { kind: "gate", halfWidthM: 4, dirX: 0, dirY: 1 },
  acceptRadiusM: 6,
  labelBg: "Карай дотук",
  ...over,
});

/** ov-keepright-v1's shape: one 360 m northbound edge on x = 0, posted 50. */
const oneStreet = {
  roads: {
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 0, y: 360 },
    ],
    edges: [
      {
        id: "ov-kr-road",
        from: "a",
        to: "b",
        oneway: false,
        maxspeed: 50,
        geometry: [
          [0, 0],
          [0, 360],
        ] as [number, number][],
      },
    ],
  },
};

/** A 50 → 30 transition street: two edges end to end, different limits. */
const transition = {
  roads: {
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 0, y: 200 },
      { id: "c", x: 0, y: 400 },
    ],
    edges: [
      {
        id: "fast",
        from: "a",
        to: "b",
        oneway: false,
        maxspeed: 50,
        geometry: [
          [0, 0],
          [0, 200],
        ] as [number, number][],
      },
      {
        id: "slow",
        from: "b",
        to: "c",
        oneway: false,
        maxspeed: 30,
        geometry: [
          [0, 200],
          [0, 400],
        ] as [number, number][],
      },
    ],
  },
};

describe("B58 — the gate label is clamped to the posted limit", () => {
  it("HIS FRAME: a 52 cap on a street posted 50 prints 50, never 52 and never 57", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 52 }), 50)).toBe("не по-бързо от 50 км/ч");
    expect(capLineBg(goal({ maxSpeedKmh: 57 }), 50)).toBe("не по-бързо от 50 км/ч");
  });

  it("a cap already under the sign prints itself — the clamp only ever removes a lie", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 20 }), 50)).toBe("не по-бързо от 20 км/ч");
    expect(capLineBg(goal({ maxSpeedKmh: 45 }), 50)).toBe("не по-бързо от 45 км/ч");
  });

  it("a HALT demand is never clamped — «спри» must not become a speed limit", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 5, affordance: "halt" }), 50)).toBe("спри — под 5 км/ч");
  });

  it("no posted limit in hand ⇒ byte-identical to the shipped label", () => {
    expect(capLineBg(goal({ maxSpeedKmh: 57 }))).toBe("не по-бързо от 57 км/ч");
    expect(capLineBg(goal({}))).toBe("");
  });

  it("reads the limit off the nearest carriageway edge", () => {
    expect(postedLimitAt(oneStreet, 4.06, 200)).toBe(50);
    expect(postedLimitAt(oneStreet, -30, 12)).toBe(50);
  });

  it("a 50→30 transition clamps each gate to the zone it stands in, not the map's headline", () => {
    expect(postedLimitAt(transition, 4.06, 100)).toBe(50);
    expect(postedLimitAt(transition, 4.06, 330)).toBe(30);
    expect(capLineBg(goal({ maxSpeedKmh: 33 }), postedLimitAt(transition, 4.06, 330))).toBe(
      "не по-бързо от 30 км/ч",
    );
  });

  it("a district that declares no limit leaves the label exactly as authored", () => {
    const noLimit = {
      roads: {
        nodes: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 0, y: 100 },
        ],
        edges: [
          {
            id: "e",
            from: "a",
            to: "b",
            oneway: false,
            geometry: [
              [0, 0],
              [0, 100],
            ] as [number, number][],
          },
        ],
      },
    };
    expect(postedLimitAt(noLimit, 0, 50)).toBeUndefined();
    expect(capLineBg(goal({ maxSpeedKmh: 57 }), postedLimitAt(noLimit, 0, 50))).toBe(
      "не по-бързо от 57 км/ч",
    );
  });
});
