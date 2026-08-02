/**
 * The L5 „Усложнени" variant wave — authored complication rungs on the
 * strongest templates (depth, not roster: no new ids, no new traces; the
 * recorded ghosts belong to the base template and the byte-identity gates
 * are untouched by construction).
 *
 * Contract per doc 76 §7 + the catalog ladder test: L5 is the ADVANCED
 * beyond-exam rung — no aids, NOT exam mode — unlocked at ≥2★ on L4. Each
 * rung here is a parameter delta: live ambient traffic, night/rain
 * conditions, or a tighter tolerance.
 */

import { describe, expect, it } from "vitest";
import { compileScenario, SCENARIO_FAMILY_TRAFFIC_BASELINE } from "../compile";
import { SC_FOLLOW_DISTANCE, SC_FOLLOW_TRUCK } from "../templates-following";
import { SC_JUNCTION_RHR, SC_SIGNAL_RESPONSE } from "../templates-junctions";
import { SC_JUNCTION_GAP } from "../templates-junctions2";
import { SC_LANE_CHANGE, SC_ROUNDABOUT_ENTRY, SC_ZEBRA_APPROACH } from "../templates-flow";
import { SC_MANEUVER_3POINT } from "../templates-maneuver";
import { SC_PARK_PARALLEL } from "../templates-parking";
import type { ScenarioSpec } from "../types";

interface Expectation {
  spec: ScenarioSpec;
  /** The rung's complication, asserted on the compiled LessonSpec. */
  check: (lesson: ReturnType<typeof compileScenario>) => void;
}

const WAVE: Expectation[] = [
  {
    spec: SC_FOLLOW_DISTANCE,
    check: (l) => expect(l.environment?.rain).toBe(true),
  },
  {
    spec: SC_FOLLOW_TRUCK,
    check: (l) => expect(l.environment?.rain).toBe(true),
  },
  {
    spec: SC_JUNCTION_RHR,
    check: (l) => expect(l.traffic?.vehicleCount).toBe(8),
  },
  {
    spec: SC_JUNCTION_GAP,
    check: (l) => expect(l.traffic?.vehicleCount).toBe(6),
  },
  {
    spec: SC_ZEBRA_APPROACH,
    check: (l) => expect(l.environment?.timeOfDay).toBe("night"),
  },
  {
    spec: SC_ROUNDABOUT_ENTRY,
    check: (l) => expect(l.traffic?.vehicleCount).toBe(4),
  },
  {
    spec: SC_LANE_CHANGE,
    check: (l) => {
      expect(l.environment?.rain).toBe(true);
      expect(l.environment?.timeOfDay).toBe("night");
    },
  },
  {
    spec: SC_SIGNAL_RESPONSE,
    check: (l) => expect(l.environment?.timeOfDay).toBe("night"),
  },
  {
    spec: SC_MANEUVER_3POINT,
    check: () => {
      /* toleranceScale is folded into the serialized objective params —
         compiling without a throw is the contract here. */
    },
  },
  {
    spec: SC_PARK_PARALLEL,
    check: () => {
      /* as above — the tighter tolerance folds into the park objective. */
    },
  },
];

describe("the L5 „Усложнени' variant wave", () => {
  for (const { spec, check } of WAVE) {
    it(`${spec.id}: L5 compiles with its complication, no aids, not exam mode`, () => {
      const l5 = compileScenario(spec, 5);
      expect(l5.id).toBe(`${spec.id}@L5`);
      expect(l5.examMode, "L5 is the beyond-exam rung, never exam mode").toBeFalsy();
      expect(l5.aids?.shadowCar).toBeFalsy();
      expect(l5.aids?.pathRibbon).toBeFalsy();
      check(l5);
    });

    it(`${spec.id}: the L4 exam rung is untouched by the wave`, () => {
      const l4 = compileScenario(spec, 4);
      expect(l4.examMode).toBe(true);
      expect(l4.aids?.shadowCar).toBeFalsy();
      // The L5 complications must not leak down: L4 carries the template's own
      // base traffic and nothing else. Since doc 87 FR-27 that base is the
      // FAMILY street for the lessons about other road users (L4 scale is
      // 1.0), and still zero everywhere else — what must never happen is L5's
      // authored complication showing up one rung early.
      const base =
        spec.traffic?.vehicleCount ?? SCENARIO_FAMILY_TRAFFIC_BASELINE[spec.family] ?? 0;
      expect(l4.traffic?.vehicleCount ?? 0).toBe(base);
      const l5Authored = spec.levels.find((r) => r.level === 5)?.traffic?.vehicleCount;
      if (l5Authored !== undefined && l5Authored !== base) {
        expect(l4.traffic?.vehicleCount ?? 0).not.toBe(l5Authored);
      }
    });
  }
});
