/**
 * ADR-006 stage 1c integration — policeStop against the REAL district (doc 72
 * VP-11 „Спиране по полицейски сигнал", ЗДвП чл. 170). Site: the same 352 m
 * two-way residential east arm the emergency-approach suite uses
 * (e519275131.0), mid-block — far from any junction machinery.
 *
 * The runner is SCENERY + MEASUREMENT ONLY (contracts.ts): it stages the
 * standing officer figure (a staged pedestrian, pose "stopSignal", never
 * walked) and records the outcome — "yielded" for a compliant curb-side rest,
 * "passedWithoutStopping" for driving on — but emits ZERO SimTick events.
 * The A12 battery here proves the hard bias: NEITHER side can ever grade a
 * violation from this runner; the graded duty lives in scenario objectives.
 */

import { describe, expect, it } from "vitest";
import type { PoliceStopSpec } from "../../contracts";
import {
  commendationCodes,
  DT,
  loadRawDistrict,
  makeStack,
  offsetRight,
  PolyDriver,
  stepFrame,
  violationCodes,
} from "./helpers";

const EDGE = "e519275131.0";
/** Scaled lane-center offset for the right lane of a 2-lane two-way edge. */
const LANE_OFFSET = 4.0625;

function edgeGeometry(): Array<[number, number]> {
  const raw = loadRawDistrict();
  const edge = raw.roads.edges.find((e) => e.id === EDGE);
  if (!edge) throw new Error(`edge ${EDGE} not in district`);
  return edge.geometry.map((p) => [p[0], p[1]]);
}

/** Officer on the sidewalk band + halt point at the curb side, both derived
 *  from the SAME edge polyline (arc ~100 m along the block). */
function siteAtArc(arcM: number): { officer: { x: number; y: number }; stop: { x: number; y: number } } {
  const officerPath = offsetRight(edgeGeometry(), LANE_OFFSET + 4.5);
  const stopPath = offsetRight(edgeGeometry(), LANE_OFFSET + 1.6);
  const o = new PolyDriver(officerPath).poseAt(arcM + 4);
  const s = new PolyDriver(stopPath).poseAt(arcM);
  return { officer: { x: o.x, y: o.y }, stop: { x: s.x, y: s.y } };
}

function policeSpec(): PoliceStopSpec {
  const site = siteAtArc(100);
  const dx = site.stop.x - site.officer.x;
  const dy = site.stop.y - site.officer.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    id: "t-police",
    kind: "policeStop",
    officer: site.officer,
    facing: { x: dx / len, y: dy / len }, // toward the roadway
    stop: site.stop,
    stopRadiusM: 3,
    stopSpeedKmh: 4,
    passBeyondM: 25,
  };
}

describe("policeStop (integration)", () => {
  it("stages the standing officer figure: pose 'stopSignal', never walks, at its post", () => {
    const stack = makeStack([policeSpec()]);
    const spec = policeSpec();
    const officer = stack.traffic.pedestrians.find((p) => p.pose === "stopSignal")!;
    expect(officer).toBeDefined();
    expect(officer.x).toBeCloseTo(spec.officer.x, 3);
    expect(officer.y).toBeCloseTo(spec.officer.y, 3);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    const driver = new PolyDriver(path, 20);
    for (let i = 0; i < 10 * 30; i++) stepFrame(stack, driver.advance(DT, 10));
    expect(officer.x).toBeCloseTo(spec.officer.x, 3); // still at the post
    expect(officer.speedMps).toBe(0);
  });

  it("compliant: pulling over and resting at the halt point resolves 'yielded' — zero rule events", () => {
    const spec = policeSpec();
    const stack = makeStack([spec]);
    // Approach on the lane center, then ease onto the curb-side line that
    // passes through the halt point and stand there.
    const pullOver = offsetRight(edgeGeometry(), LANE_OFFSET + 1.6);
    const driver = new PolyDriver(pullOver, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      const target = driver.s >= 95 ? 0 : 9; // brake to rest AT the halt point
      stepFrame(stack, driver.advance(DT, target));
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({
      eventId: "t-police",
      kind: "policeStop",
      success: true,
      detail: "yielded",
    });
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
  });

  it("A12 both ways: ignoring the signal records 'passedWithoutStopping' and grades NOTHING", () => {
    const stack = makeStack([policeSpec()]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    const driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 11)); // ~40 km/h, straight past
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: false, detail: "passedWithoutStopping" });
    // The hard A12 guarantee: the runner emitted NO SimTick vocabulary at all
    // — no violation, no commendation, nothing for the reducer to grade.
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
    expect(commendationCodes(stack.ruleEvents)).toEqual([]);
    for (const tick of stack.ticks) {
      expect(tick.events.filter((e) => e.kind === "prioritySituation" || e.kind === "collision")).toEqual([]);
    }
  });

  it("one adjudication per attempt; reset() re-arms the encounter", () => {
    const spec = policeSpec();
    const stack = makeStack([spec]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    let driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 11));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    // Driving on past the resolution never re-fires.
    for (let i = 0; i < 5 * 30; i++) stepFrame(stack, driver.advance(DT, 11));
    expect(stack.outcomes).toHaveLength(1);
    // Retry: the runner re-arms and adjudicates the fresh attempt.
    stack.director.reset();
    expect(stack.director.snapshot()[0].phase).toBe("armed");
    driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length < 2; i++) {
      stepFrame(stack, driver.advance(DT, 11));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(2);
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
  });

  it("same seed + same driving = identical outcomes (deterministic staging)", () => {
    const runOnce = () => {
      const stack = makeStack([policeSpec()]);
      const pullOver = offsetRight(edgeGeometry(), LANE_OFFSET + 1.6);
      const driver = new PolyDriver(pullOver, 20);
      for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
        const target = driver.s >= 95 ? 0 : 9;
        stepFrame(stack, driver.advance(DT, target));
      }
      return stack;
    };
    const a = runOnce();
    const b = runOnce();
    expect(a.outcomes).toEqual(b.outcomes);
    expect(violationCodes(a.ruleEvents)).toEqual(violationCodes(b.ruleEvents));
  });
});
