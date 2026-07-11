/**
 * B1a — amber-dilemma staged event (doc 72 JU-06, capability N2) against the
 * REAL district through the production frame pipeline (runtime → traffic →
 * sample → director → rule engine), like events-integration.test.ts.
 *
 * Stage: the reference signalized junction n179974491 (бул. Св. Климент
 * Охридски × ул. Трайко Станоев), approached along Трайко Станоев
 * (e519275131.0 — a 352 m straight run-up; edge.from IS the junction node).
 * The runner pins the cluster offset at arm so the green→yellow flip lands
 * `flipEtaSec` of travel time before the player's stop line; the EXISTING
 * grading pipeline does the rest:
 *   - carrying speed with flip 4 s out → arrival ~1 s into red → RED_LIGHT_CROSSED
 *   - slow roll with flip 2.5 s out → yellow crossing, stoppable → YELLOW_LIGHT_NOT_STOPPED
 *   - braking on the flip → stopped before the line → outcome "yielded", zero violations
 */

import { describe, expect, it } from "vitest";
import type { AmberDilemmaSpec } from "../../contracts";
import { createWorldRuntime } from "../../runtime";
import {
  DT,
  loadRawDistrict,
  makeStack,
  offsetRight,
  PolyDriver,
  stepFrame,
  violationCodes,
  type Stack,
} from "./helpers";

const JUNCTION_NODE = "n179974491";
const APPROACH_EDGE = "e519275131.0";
/** Scaled lane-center offset for the right lane of the 2-lane two-way edge. */
const LANE_OFFSET = 4.0625;

function junctionPos(): { x: number; y: number } {
  const raw = loadRawDistrict();
  const node = (raw as { roads: { nodes: Array<{ id: string; x: number; y: number }> } }).roads.nodes.find(
    (n) => n.id === JUNCTION_NODE,
  );
  if (!node) throw new Error("junction node missing");
  return { x: node.x, y: node.y };
}

/** Stop-line setback from the junction node on the player's approach, m. */
function lineDistM(): number {
  const rt = createWorldRuntime(loadRawDistrict());
  const line = rt
    .debugStopLines()
    .find((l) => l.id.startsWith(`${APPROACH_EDGE}@`) && l.control === "trafficLight");
  if (!line) throw new Error("no trafficLight line on the approach edge");
  return line.sM; // edge.from = junction ⇒ sM IS the setback
}

function amberSpec(over: Partial<AmberDilemmaSpec> = {}): AmberDilemmaSpec {
  return {
    id: "amber-1",
    kind: "amberDilemma",
    signalNodeId: JUNCTION_NODE,
    junction: junctionPos(),
    armDistM: 120,
    minTriggerSpeedKmh: 10,
    lineDistM: lineDistM(),
    flipEtaSec: 4.0,
    ...over,
  };
}

/** The player's path: along Трайко Станоев toward the junction, right lane. */
function approachPath(): Array<[number, number]> {
  const raw = loadRawDistrict();
  const edge = raw.roads.edges.find((e) => e.id === APPROACH_EDGE);
  if (!edge) throw new Error("approach edge missing");
  const reversed = [...edge.geometry.map((p) => [p[0], p[1]] as [number, number])].reverse();
  return offsetRight(reversed, LANE_OFFSET);
}

function runConstantSpeed(stack: Stack, speedMps: number, maxSec: number): void {
  const driver = new PolyDriver(approachPath(), 120, speedMps);
  for (let i = 0; i < maxSec * 30 && stack.outcomes.length === 0; i++) {
    stepFrame(stack, driver.advance(DT, speedMps));
    if (driver.s >= driver.length) break;
  }
}

describe("amber dilemma (integration, production pipeline)", () => {
  it("carrying 40 km/h through the pinned flip lands on red — RED_LIGHT_CROSSED", () => {
    const stack = makeStack([amberSpec()]);
    runConstantSpeed(stack, 11.1, 60);
    expect(stack.outcomes).toHaveLength(1);
    const outcome = stack.outcomes[0];
    expect(outcome.eventId).toBe("amber-1");
    expect(outcome.success).toBe(false);
    expect(outcome.detail).toBe("violation");
    const codes = violationCodes(stack.ruleEvents);
    expect(codes.some((c) => c === "RED_LIGHT_CROSSED" || c === "RED_YELLOW_CROSSED")).toBe(true);
  });

  it("a slow late-yellow roll-through grades YELLOW_LIGHT_NOT_STOPPED (основна)", () => {
    const stack = makeStack([amberSpec({ id: "amber-slow", flipEtaSec: 2.5 })]);
    runConstantSpeed(stack, 4.17, 120); // ~15 km/h creep-gamble
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0].success).toBe(false);
    expect(stack.outcomes[0].detail).toBe("violation");
    const codes = violationCodes(stack.ruleEvents);
    expect(codes).toContain("YELLOW_LIGHT_NOT_STOPPED");
    expect(codes).not.toContain("RED_LIGHT_CROSSED");
  });

  it("braking on the flip stops before the line — outcome 'yielded', zero violations", () => {
    const stack = makeStack([amberSpec()]);
    const driver = new PolyDriver(approachPath(), 120, 11.1);
    let flipped = false;
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      const pose = driver.advance(DT, flipped ? 0 : 11.1);
      if (!flipped) {
        const phase = stack.runtime.signalPhaseInfo(JUNCTION_NODE, pose.headingDeg).phase;
        if (stack.director.snapshot()[0].phase === "triggered" && phase === "yellow") {
          flipped = true;
        }
      }
      pose.brakePedal = flipped ? 1 : 0;
      stepFrame(stack, pose);
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0].success).toBe(true);
    expect(stack.outcomes[0].detail).toBe("yielded");
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
  });

  it("is deterministic: same seed + same driving = identical grading and outcome", () => {
    const run = () => {
      const stack = makeStack([amberSpec()], 11);
      runConstantSpeed(stack, 11.1, 60);
      return {
        codes: violationCodes(stack.ruleEvents),
        outcome: stack.outcomes.map((o) => ({ detail: o.detail, tSec: o.tSec })),
      };
    };
    const a = run();
    const b = run();
    expect(a.codes.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it("never arms for a below-threshold crawl (the encounter quietly waits)", () => {
    const stack = makeStack([amberSpec({ minTriggerSpeedKmh: 25 })]);
    const driver = new PolyDriver(approachPath(), 200, 4);
    for (let i = 0; i < 10 * 30; i++) {
      stepFrame(stack, driver.advance(DT, 4)); // ~14 km/h, under the 25 threshold
    }
    expect(stack.director.snapshot()[0].phase).toBe("armed");
  });
});

describe("session-start phase pinning (ScenarioDirectorOptions.signalOffsets)", () => {
  it("applies authored offsets at construction, deterministically", () => {
    const phasesOf = (offset: number): string[] => {
      const stack = makeStack([], 7, { signalOffsets: { [JUNCTION_NODE]: offset } });
      const seen: string[] = [];
      for (let i = 0; i < 90; i++) {
        stepFrame(stack, { x: 0, y: 0, headingDeg: 0, speedKmh: 0, brakePedal: 0 });
        seen.push(stack.runtime.signalPhaseInfo(JUNCTION_NODE, 254).phase);
      }
      return seen;
    };
    const a = phasesOf(5);
    const b = phasesOf(5);
    const c = phasesOf(30);
    expect(a).toEqual(b); // pinned = reproducible
    expect(a).not.toEqual(c); // the offset genuinely steers the phase
  });
});
