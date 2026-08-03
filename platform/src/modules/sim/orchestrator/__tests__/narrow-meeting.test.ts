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
import type { SimTickEvent } from "../../rules";
import type { StagedActorSpec, StagedActorView, StagedCommand } from "../../traffic/types";
import { NarrowMeetingRunner } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";
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

// ---------------------------------------------------------------------------
// B80 fixture — the runner alone on a straight synthetic section, so the three
// under-detection guards can be driven frame by frame instead of hoped for.
// The geometry mirrors the SHIPPED sc-ovn-meeting (templates-lanes.ts): section
// y ∈ [110, 145] on x = 0, own lane x = +4.06, oncoming lane x = −4.06, the
// actor southbound on a 240 m path so its world y is 240 − s and its section
// entrance is arc 95 (= y 145).
// ---------------------------------------------------------------------------

const SYNTH_SPEC: NarrowMeetingSpec = {
  id: "b80-synth",
  kind: "narrowMeeting",
  sectionStart: { x: 0, y: 110 },
  sectionEnd: { x: 0, y: 145 },
  obstructionSide: "player",
  actor: {
    pathNodes: ["s-end", "s-start"],
    hold: { nodeIndex: 0, offsetM: 40 },
    cruiseSpeedMps: 6,
  },
  actorEntry: { nodeIndex: 0, offsetM: 95 },
  armDistM: 70,
  transitSpeedMps: 6,
};

/** Minimal StagedTrafficPort with one hand-driven actor view. */
class SynthPort implements StagedTrafficPort {
  readonly view: StagedActorView = {
    id: SYNTH_SPEC.id,
    kind: "vehicle",
    x: -4.06,
    y: 200,
    dirX: 0,
    dirY: -1,
    speedMps: 0,
    s: 40,
    pathLengthM: 240,
    nodeS: [0, 240],
    finished: false,
  } as StagedActorView;

  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view;
  }
  stagedCommand(_id: string, _command: StagedCommand): void {}
  staged(_id: string): StagedActorView | null {
    return this.view;
  }
  /** Place the oncoming: world pose + path arc + speed. */
  set(p: { x: number; y: number; s: number; speedMps: number }): void {
    Object.assign(this.view, p);
  }
}

/** Northbound player frame. */
function synthFrame(t: number, x: number, y: number, speedKmh: number): DirectorInput {
  return { tSec: t, dtSec: DT, x, y, speedKmh, headingDeg: 0, brakePedal: 0, tickEvents: [] };
}

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

  it("B80: a barge that ends in CONTACT names the RULE too, not only the crash", () => {
    // Register doc 87 row B80. The end-of-lesson ledger the founder posted read
    // «Опасни грешки 2», both entries «Пътнотранспортно произшествие», and no
    // priority entry anywhere: `resolve()` retires the runner, so a barge whose
    // contact beat the NM_SUSTAIN_SEC window emitted a collision and nothing
    // else. He was told he crashed; he was never told he took priority that was
    // not his — which is the only sentence that teaches the rule (THEO-4).
    const r = new NarrowMeetingRunner(SYNTH_SPEC);
    const port = new SynthPort();
    r.stage(port, () => 0.5, true);

    // 1) At the section mouth in the own lane → the runner triggers.
    port.set({ x: -4.06, y: 150, s: 90, speedMps: 6 });
    r.step(port, synthFrame(1, 4.06, 104, 20), []);
    expect(r.phase).toBe("triggered");
    // 2) A live conflict frame, so the encounter is genuinely visible.
    port.set({ x: -4.06, y: 140, s: 100, speedMps: 6 });
    r.step(port, synthFrame(1.2, 4.06, 112, 20), []);
    // 3) …then the head-on, inside the стеснение, on the oncoming's side.
    port.set({ x: -4.06, y: 122, s: 118, speedMps: 6 });
    const out: SimTickEvent[] = [];
    const outcome = r.step(port, synthFrame(1.4, -4.06, 120, 20), out);

    expect(outcome?.detail).toBe("collision");
    expect(out).toContainEqual({ kind: "collision", withWhat: "vehicle" });
    expect(out).toContainEqual({
      kind: "prioritySituation",
      situation: "narrow-meeting",
      violated: true,
    });
    // The rule comes FIRST — the law broken, then its consequence.
    expect(out[0]).toMatchObject({ kind: "prioritySituation" });
  });

  it("B80: the meeting is not OVER while the oncoming is still ahead of the player", () => {
    // `actorCleared` used to include `actorAlong < -4` — „it left the
    // стеснение" — which retires the runner while the oncoming is still north
    // of a player who has not reached the section yet. Everything after that
    // frame is ungradable.
    const r = new NarrowMeetingRunner(SYNTH_SPEC);
    const port = new SynthPort();
    r.stage(port, () => 0.5, true);
    port.set({ x: -4.06, y: 150, s: 90, speedMps: 6 });
    r.step(port, synthFrame(1, 4.06, 104, 20), []);
    // Oncoming 6 m SOUTH of the section — comfortably past the old „cleared"
    // line, so this pins the defect instead of sitting exactly on it (at y=106
    // `actorAlong` is −4 and `< -4` is false, which is why the first version of
    // this test passed against the unfixed runner). It is still 4 m NORTH of
    // the player and closing: nothing is over.
    port.set({ x: -4.06, y: 104, s: 136, speedMps: 6 });
    const out: SimTickEvent[] = [];
    expect(r.step(port, synthFrame(1.5, 4.06, 100, 8), out)).toBeNull();
    expect(r.phase).toBe("triggered");
    expect(out).toHaveLength(0);
  });

  it("B80: yield credit is earned AT the widening, not 30 m up the approach", () => {
    // An obedient student crawling the approach latched `sawWait` far from the
    // стеснение and was resolved „yielded" + commended — then drove the whole
    // narrowing on the wrong side with the runner already retired.
    const r = new NarrowMeetingRunner(SYNTH_SPEC);
    const port = new SynthPort();
    r.stage(port, () => 0.5, true);
    port.set({ x: -4.06, y: 150, s: 90, speedMps: 6 });
    r.step(port, synthFrame(1, 4.06, 104, 20), []);
    // Crawling at 5 km/h in his own lane, 30 m short of the section…
    for (let i = 0; i < 10; i++) {
      port.set({ x: -4.06, y: 140 - i, s: 100 + i, speedMps: 6 });
      r.step(port, synthFrame(2 + i * 0.1, 4.06, 80, 5), []);
    }
    // …and the oncoming finally passes him.
    port.set({ x: -4.06, y: 70, s: 170, speedMps: 6 });
    const out: SimTickEvent[] = [];
    const outcome = r.step(port, synthFrame(4, 4.06, 80, 5), out);
    expect(outcome).not.toBeNull();
    expect(outcome!.detail).toBe("clear");
    expect(outcome!.success).toBe(true);
    expect(out).toHaveLength(0); // no YIELDED_TO_PRIORITY he never earned
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
