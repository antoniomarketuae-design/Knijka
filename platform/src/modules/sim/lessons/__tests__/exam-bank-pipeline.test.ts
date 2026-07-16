/**
 * B1b — full-pipeline spot check of the exam bank, through the PRODUCTION
 * stack (same harness as orchestrator/__tests__/exam-events.test.ts):
 * runtime + traffic + director over the real district-v1.json.
 *
 *  1. Every encounter SITE stages on the lane graph: per shell, a synthetic
 *     max-tier list of all its slots is staged at once — createRunner /
 *     traffic.stage throw on unresolvable paths, so a data bug in ANY of the
 *     new sites (B3–B6, P3e/P3w, P5, R2, C4, C9w, ambers) fails here first.
 *  2. Thirty drawn variants (seeds 1–30 — deterministic, spread over all
 *     nine shells) stage their generated stagedEvents exactly as the
 *     LessonScene would.
 *  3. Scripted guilty drives on two sampled variants grade the expected
 *     codes through the EXISTING rule engine, and the official exam
 *     termination fold trips on them (lessons/exam.ts).
 */

import { describe, expect, it } from "vitest";
import { examTerminationFor } from "../exam";
import {
  drawExamVariantId,
  examShellAssignmentCount,
  examVariantDistinctnessKey,
  generateExamVariant,
} from "../examBank";
import { EXAM_SHELLS } from "../examBankData";
import type { StagedEventSpec } from "../../contracts";
import {
  DT,
  loadRawDistrict,
  makeStack,
  offsetRight,
  PolyDriver,
  stepFrame,
  violationCodes,
} from "../../orchestrator/__tests__/helpers";

function edgeGeometry(edgeId: string): Array<[number, number]> {
  const raw = loadRawDistrict() as unknown as {
    roads: { edges: Array<{ id: string; geometry: Array<[number, number]> }> };
  };
  const edge = raw.roads.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error(`edge ${edgeId} not in district`);
  return edge.geometry.map((p) => [p[0], p[1]]);
}

/** Scaled right-lane offset of a 2-lane two-way street (helpers convention). */
const LANE_OFFSET = 4.0625;

/** First variant of (shell, condition) whose distinctness key matches. */
function findVariant(
  shellCode: string,
  condCode: string,
  includes: string[],
  excludes: string[] = [],
): string {
  const count = examShellAssignmentCount(shellCode);
  for (let i = 0; i < count; i++) {
    const id = `EX-${shellCode}-${condCode}-${String(i).padStart(4, "0")}`;
    const key = examVariantDistinctnessKey(id);
    if (includes.every((s) => key.includes(s)) && !excludes.some((s) => key.includes(s))) {
      return id;
    }
  }
  throw new Error(`no ${shellCode}/${condCode} variant with ${includes.join(" + ")}`);
}

describe("every encounter site stages on the real lane graph", () => {
  for (const shell of EXAM_SHELLS) {
    it(`shell ${shell.code}: all slots stage dormant at max tier`, () => {
      const events: StagedEventSpec[] = shell.slots.map((slot) => {
        const top = slot.options[slot.options.length - 1];
        return top.build!(slot.id);
      });
      const stack = makeStack(events); // throws on any unstageable path
      expect(stack.director.snapshot()).toHaveLength(events.length);
      for (const ev of events) {
        if (ev.kind === "pedestrianDartOut" || ev.kind === "amberDilemma") continue;
        expect(stack.traffic.staged(ev.id), `${ev.id}: staged actor missing`).toBeDefined();
      }
    });
  }
});

describe("thirty drawn variants stage like a session", () => {
  const ids = Array.from({ length: 30 }, (_, i) => drawExamVariantId(i + 1));

  it(`the deterministic draw covers all nine shells (${ids.join(", ")})`, () => {
    expect(new Set(ids.map((id) => id.split("-")[1])).size).toBe(EXAM_SHELLS.length);
  });

  for (const id of ids) {
    it(`${id}: generated staged events stage dormant`, () => {
      const spec = generateExamVariant(id);
      const events = spec.stagedEvents ?? [];
      // The опасна budget caps TERMINAL encounters at 2–3; a committed-tier
      // amber (non-terminal) may ride along as a fourth staged event.
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.length).toBeLessThanOrEqual(4);
      const stack = makeStack([...events]);
      expect(stack.director.snapshot()).toHaveLength(events.length);
    });
  }
});

describe("scripted guilty drives grade through the existing pipeline", () => {
  it("amber variant (shell C): carrying speed through the pinned flip → red entry → exam terminates", () => {
    const id = findVariant("C", "D1", ["A3-stanoev-west=stoppable"]);
    const spec = generateExamVariant(id);
    const stack = makeStack([...(spec.stagedEvents ?? [])]);
    // Westbound along „Трайко Станоев" toward n179974491 at ~40 km/h — the
    // B1a amber-suite recipe: the flip is pinned so a comfortable stop
    // existed; carrying on lands on red.
    const path = offsetRight(
      [...edgeGeometry("e519275131.0")].reverse() as Array<[number, number]>,
      LANE_OFFSET,
    );
    const driver = new PolyDriver(path, 120, 11.1);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 11.1));
      if (driver.s >= driver.length) break;
    }
    const amber = stack.outcomes.find((o) => o.kind === "amberDilemma");
    expect(amber).toBeDefined();
    expect(amber!.success).toBe(false);
    const codes = violationCodes(stack.ruleEvents);
    expect(
      codes.some((c) => c === "RED_LIGHT_CROSSED" || c === "RED_YELLOW_CROSSED"),
      codes.join(","),
    ).toBe(true);
    // A13 termination fold: the red entry is an опасна — exam over, on the
    // same pure fold the server rederives.
    const termination = examTerminationFor(stack.ruleEvents);
    expect(termination).not.toBeNull();
    expect(termination!.reason).toBe("dangerous-mistake");
  });

  it("dart variant (shell A): hot, non-yielding approach → pedestrian grading + termination", () => {
    // A sprint dart at the „Баку" crossing, with the cyclist slot EMPTY so
    // the westbound drive exercises exactly the encounter under test.
    const id = findVariant("A", "D1", ["C1-baku-west=sprint", "V1-borovski-t=none"]);
    const spec = generateExamVariant(id);
    const stack = makeStack([...(spec.stagedEvents ?? [])]);
    const path = offsetRight(
      [...edgeGeometry("e35467616.0"), [52, -386.5] as [number, number]],
      LANE_OFFSET,
    );
    const driver = new PolyDriver(path, 0);
    for (let i = 0; i < 60 * 30; i++) {
      stepFrame(stack, driver.advance(DT, 12.5)); // ~45 km/h, never brakes
      if (stack.outcomes.some((o) => o.kind === "pedestrianDartOut")) break;
      if (driver.s >= driver.length) break;
    }
    const dart = stack.outcomes.find((o) => o.kind === "pedestrianDartOut");
    expect(dart).toBeDefined();
    expect(dart!.success).toBe(false);
    const codes = violationCodes(stack.ruleEvents);
    expect(
      codes.some((c) =>
        ["PEDESTRIAN_NOT_YIELDED", "PEDESTRIAN_CROSSING_TOO_FAST", "COLLISION"].includes(c),
      ),
      codes.join(","),
    ).toBe(true);
    const termination = examTerminationFor(stack.ruleEvents);
    expect(termination).not.toBeNull();
  });
});
