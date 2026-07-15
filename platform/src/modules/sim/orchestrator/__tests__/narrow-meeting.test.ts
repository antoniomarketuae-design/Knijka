/**
 * N1 integration — narrowMeeting against the REAL district (doc 72 OV-14,
 * „разминаване в тясна улица"). Site: the 352 m two-way residential east arm
 * e519275131.0 (n179974491 → n417233856), mid-block — far from both end
 * junctions, so no signal/priority machinery interferes.
 *
 * A parked row (staged held props) blocks one lane through the section
 * s ∈ [150, 195] (edge arc from the west end); the oncoming actor transits
 * westbound timed to meet the player. ЗДвП narrow-passage priority: the side
 * WITH the obstruction yields — barging grades FAILED_TO_YIELD
 * ("narrow-meeting"), waiting at the widening earns YIELDED_TO_PRIORITY.
 */

import { describe, expect, it } from "vitest";
import type { NarrowMeetingSpec } from "../../contracts";
import {
  commendationCodes,
  DT,
  loadRawDistrict,
  makeStack,
  PolyDriver,
  stepFrame,
  violationCodes,
} from "./helpers";

const EDGE = "e519275131.0";
/** Scaled lane-center offset for the right lane of a 2-lane two-way edge. */
const LANE_OFFSET = 4.0625;
const SECTION_FROM = 150;
const SECTION_TO = 195;

function edgeGeometry(edgeId: string): Array<[number, number]> {
  const raw = loadRawDistrict();
  const edge = raw.roads.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error(`edge ${edgeId} not in district`);
  return edge.geometry.map((p) => [p[0], p[1]]);
}

/** Point + forward unit tangent at arclength s of a polyline. */
function pointAlong(
  geometry: Array<[number, number]>,
  s: number,
): { x: number; y: number; tx: number; ty: number } {
  let acc = 0;
  for (let i = 0; i < geometry.length - 1; i++) {
    const [ax, ay] = geometry[i];
    const [bx, by] = geometry[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (s <= acc + len || i === geometry.length - 2) {
      const t = len > 0 ? Math.min(1, Math.max(0, (s - acc) / len)) : 0;
      return {
        x: ax + t * (bx - ax),
        y: ay + t * (by - ay),
        tx: len > 0 ? (bx - ax) / len : 0,
        ty: len > 0 ? (by - ay) / len : 1,
      };
    }
    acc += len;
  }
  const [x, y] = geometry[geometry.length - 1];
  return { x, y, tx: 0, ty: 1 };
}

/**
 * Sample poses along the edge with a PER-ARC lateral offset (right of travel
 * positive) — builds the swing around the parked row.
 */
function offsetSampled(
  fromS: number,
  toS: number,
  stepM: number,
  offsetAt: (s: number) => number,
): Array<[number, number]> {
  const geom = edgeGeometry(EDGE);
  const out: Array<[number, number]> = [];
  for (let s = fromS; s <= toS; s += stepM) {
    const p = pointAlong(geom, s);
    const off = offsetAt(s);
    // Right of travel (x east, y north): (ty, -tx).
    out.push([p.x + p.ty * off, p.y - p.tx * off]);
  }
  return out;
}

/** Own lane outside the section, oncoming lane through it (the squeeze). */
function swingOffset(s: number): number {
  const a = 134;
  const b = 144;
  const c = 198;
  const d = 208;
  if (s < a || s > d) return LANE_OFFSET;
  if (s < b) return LANE_OFFSET - 2 * LANE_OFFSET * ((s - a) / (b - a));
  if (s <= c) return -LANE_OFFSET;
  return -LANE_OFFSET + 2 * LANE_OFFSET * ((s - c) / (d - c));
}

function narrowSpec(side: "player" | "oncoming"): NarrowMeetingSpec {
  const geom = edgeGeometry(EDGE);
  const start = pointAlong(geom, SECTION_FROM);
  const end = pointAlong(geom, SECTION_TO);
  return {
    id: "t-narrow",
    kind: "narrowMeeting",
    sectionStart: { x: start.x, y: start.y },
    sectionEnd: { x: end.x, y: end.y },
    obstructionSide: side,
    actor: {
      pathNodes: ["n417233856", "n179974491"],
      hold: { nodeIndex: 0, offsetM: 60 },
      cruiseSpeedMps: 7,
    },
    // The actor's entrance = sectionEnd, at path arc ≈ 352 − 195.
    actorEntry: { nodeIndex: 0, offsetM: 157 },
    armDistM: 70,
    transitSpeedMps: 6.5,
    props:
      side === "player"
        ? [
            // Parked row in the PLAYER's (eastbound) lane.
            { pathNodes: ["n179974491", "n417233856"], hold: { nodeIndex: 0, offsetM: 158 } },
            { pathNodes: ["n179974491", "n417233856"], hold: { nodeIndex: 0, offsetM: 170 } },
          ]
        : [
            // Obstruction on the ONCOMING side (westbound lane).
            { pathNodes: ["n417233856", "n179974491"], hold: { nodeIndex: 0, offsetM: 182 } },
          ],
  };
}

const START_EDGE_S = 95; // 55 m before the section entrance

describe("narrowMeeting (integration)", () => {
  it("barging into the oncoming's priority grades FAILED_TO_YIELD (narrow-meeting)", () => {
    const stack = makeStack([narrowSpec("player")]);
    const path = offsetSampled(START_EDGE_S, 280, 3, swingOffset);
    const driver = new PolyDriver(path, 0);
    for (let i = 0; i < 90 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 5.5), { indicator: "left" });
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.eventId).toBe("t-narrow");
    expect(outcome.success).toBe(false);
    expect(["violation", "collision"]).toContain(outcome.detail);
    const failed = stack.ruleEvents.find(
      (e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD",
    );
    expect(failed).toBeDefined();
    expect(failed && "detail" in failed ? failed.detail : "").toBe("narrow-meeting");
  });

  it("waiting at the widening while the oncoming transits earns the commendation", () => {
    const stack = makeStack([narrowSpec("player")]);
    const path = offsetSampled(START_EDGE_S, 280, 3, swingOffset);
    const driver = new PolyDriver(path, 0);
    const waitArc = 134 - START_EDGE_S; // just before the swing, own lane
    for (let i = 0; i < 150 * 30 && stack.outcomes.length === 0; i++) {
      const view = stack.traffic.staged("t-narrow")!;
      // Cleared once the actor is past the player-side entrance (its path
      // arc beyond 352 − 150, plus margin).
      const cleared = view.s > 352 - SECTION_FROM + 10;
      const target = driver.s >= waitArc && !cleared ? 0 : driver.s >= waitArc ? 3.5 : 5.5;
      stepFrame(stack, driver.advance(DT, target), { indicator: "left" });
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "yielded" });
    expect(commendationCodes(stack.ruleEvents)).toContain("YIELDED_TO_PRIORITY");
    expect(violationCodes(stack.ruleEvents)).not.toContain("FAILED_TO_YIELD");
    expect(violationCodes(stack.ruleEvents)).not.toContain("COLLISION");
  });

  it("innocent: with the obstruction on the ONCOMING side, proceeding on priority is clean", () => {
    const stack = makeStack([narrowSpec("oncoming")]);
    // Own lane the whole way — the westbound lane is the blocked one.
    const path = offsetSampled(START_EDGE_S, 280, 3, () => LANE_OFFSET);
    const driver = new PolyDriver(path, 0);
    for (let i = 0; i < 90 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 8.3));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "clear" });
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
    // The yielding actor held at its entrance while the player passed.
    const view = stack.traffic.staged("t-narrow")!;
    expect(view.s).toBeGreaterThan(60); // it did transit toward the section
  });

  it("same seed + same driving = identical outcomes (deterministic staging)", () => {
    const runOnce = () => {
      const stack = makeStack([narrowSpec("player")]);
      const path = offsetSampled(START_EDGE_S, 280, 3, swingOffset);
      const driver = new PolyDriver(path, 0);
      for (let i = 0; i < 90 * 30 && stack.outcomes.length === 0; i++) {
        stepFrame(stack, driver.advance(DT, 5.5), { indicator: "left" });
        if (driver.s >= driver.length) break;
      }
      return stack;
    };
    const a = runOnce();
    const b = runOnce();
    expect(a.outcomes).toEqual(b.outcomes);
    expect(violationCodes(a.ruleEvents)).toEqual(violationCodes(b.ruleEvents));
  });
});
