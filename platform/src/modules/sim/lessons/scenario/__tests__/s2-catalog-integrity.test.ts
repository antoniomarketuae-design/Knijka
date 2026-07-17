/**
 * S2 revision — catalog integrity across the whole Studio ladder. Beyond the
 * per-template gates: every registered template must compile at EVERY authored
 * level, expose loadable trace refs, and carry a well-formed spec (Bulgarian
 * copy, cited archetypes, an objective set the compiler accepts).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import { compileScenario } from "../compile";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

describe("S2 catalog integrity", () => {
  it("registers the full S1+S2+S3+S4+unit-2+breadth+signals+maneuver+hazards+final-harvest+cap-2+FO-06+VU-09+stage-1c+stage-1d+stage-2a+stage-2b+stage-3a+stage-3b+stage-4a+FO-pair+fog+curve+motorway+N11-telltale+OV-corridor+snow+N8-vru+OV-return+AC-12-crosswind+surface-patch+w1+w2+w3+w4+w5+w6+w7+w8+w9+reissue wave (149 templates across the families)", () => {
    const ids = SCENARIO_TEMPLATES.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        "sc-park-perp-rev",
        "sc-maneuver-3point",
        "sc-maneuver-uturn",
        "sc-speed-transition",
        "sc-hazard-obstacle",
        "sc-park-parallel",
        "sc-park-45",
        "sc-park-narrow",
        "sc-junction-rhr",
        "sc-junction-stop",
        "sc-signal-response",
        "sc-turn-left-oncoming",
        "sc-junction-scan",
        "sc-junction-gap",
        "sc-junction-blind",
        "sc-junction-left",
        "sc-signal-dead",
        "sc-signal-flashing",
        "sc-zebra-approach",
        "sc-roundabout-entry",
        "sc-lane-change",
        "sc-crossing-let-pass",
        "sc-crossing-slow-crosser",
        "sc-crossing-rain-sprint",
        "sc-crossing-dart",
        "sc-crossing-bus-shadow",
        "sc-crossing-child-ball",
        "sc-crossing-white-cane",
        "sc-pe-jaywalker",
        "sc-speed-creep",
        "sc-speed-dangerous",
        "sc-speed-rain",
        "sc-speed-zone",
        "sc-follow-distance",
        "sc-follow-brake",
        "sc-follow-standstill",
        "sc-follow-rain-gap",
        "sc-follow-truck",
        "sc-follow-cutin",
        "sc-follow-tailgater",
        "sc-ov-keep-right",
        "sc-ov-lane-keeping",
        "sc-ov-oneway",
        "sc-ov-crossing-overtake",
        "sc-ov-narrow",
        "sc-vu-cyclist-hook",
        "sc-vu-emergency",
        "sc-vu-emergency-junction",
        "sc-vu-pass-clearance",
        "sc-vu-door-zone",
        "sc-vp-police-stop",
        "sc-vp-telltale",
        "sc-pk-smooth-stop",
        "sc-vp-readiness",
        "sc-ac-night-lights",
        "sc-ac-rain-lights",
        "sc-ac-highbeam-lead",
        "sc-ac-wet-braking",
        "sc-ac-fog",
        "sc-ac-snow",
        "sc-ac-crosswind",
        "sc-ac-aquaplane",
        "sc-ac-ice",
        "sc-pk-move-off",
        "sc-pk-driveway",
        "sc-signal-hesitation",
        "sc-signal-controller",
        "sc-signal-redyellow",
        "sc-vp-stall",
        "sc-sp-harsh-brake",
        "sc-sp-curve",
        "sc-ov-ban-overtake",
        "sc-pk-ban-stop",
        "sc-ov-solid-line",
        "sc-ov-bus-lane",
        "sc-rx-unguarded",
        "sc-rx-guarded",
        "sc-rx-tram-left",
        "sc-rx-tram-island",
        "sc-rx-barrier-drop",
        "sc-sp-eco-coast",
        "sc-mw-discipline",
        "sc-mw-emergency-lane",
        "sc-ov-oncoming-gap",
        "sc-ov-abort",
        "sc-ov-return-gap",
        // Wave 1.
        "sc-jx-equal-left",
        "sc-sig-flash-amber-ped",
        "sc-pk-crossing-ban",
        "sc-ln-turn-lane-arrows",
        "sc-pe-school-patrol",
        "sc-rb-exit-signal",
        "sc-merge-accel-lane",
        "sc-ed-d2-city-run",
        // Wave 2.
        "sc-merge-lane-end",
        "sc-ov-night-gap",
        "sc-pk-busstop-ban",
        "sc-rb-circulate-priority",
        "sc-vu-blindspot-moto",
        "sc-rx-queue-clear",
        "sc-ac-night-overdrive",
        "sc-sp-limit-end",
        // Wave 3.
        "sc-merge-roadworks-shift",
        "sc-ov-being-overtaken",
        "sc-pk-stop-vs-park",
        "sc-rb-busy-gap",
        "sc-jx-priority-confidence",
        "sc-sig-green-wave",
        "sc-hz-emergency-stop",
        "sc-fo-brakelight-chain",
        // Wave 4.
        "sc-merge-bus-pullout",
        "sc-ov-crest-curve",
        "sc-pk-double-park",
        "sc-rb-lane-choice",
        "sc-pe-night-unlit",
        "sc-vu-cyclist-group",
        "sc-ed-d2-priority-run",
        "sc-vp-handbrake",
        // Wave 5. Six of the wave's seven items landed; sc-rx-barrier-drop is
        // deliberately absent — its barrier-drop director is unbuilt and the
        // fixed-clock fallback collapses into the shipped sc-rx-guarded, so
        // nothing was authored for it (see the wave notes).
        "sc-merge-from-property",
        "sc-ov-solid-return",
        "sc-park-bay-exit-rev",
        "sc-jx-blocked-exit",
        "sc-ac-truck-spray",
        "sc-mw-min-speed",
        // Wave 6 — all seven items landed.
        "sc-merge-motorway-exit",
        "sc-ln-boulevard-discipline",
        "sc-mv-uturn-ban",
        "sc-rb-ped-exit",
        "sc-sig-controller-live",
        "sc-hz-brake-dont-swerve",
        "sc-ed-d2-stop-address",
        // Wave 7. Five of the wave's seven items landed; sc-jx-giveway-b1 and
        // sc-sp-eco-coast are deliberately absent — the first needs a Б1/
        // give-way adjudicator the engine does not have (its correct rolling
        // yield grades STOP_SIGN_NO_FULL_STOP today), the second asks for
        // HARSH_BRAKING_NO_CAUSE at a red light, where the red is itself a
        // braking cause. Neither was authored (see the wave notes).
        "sc-ln-obstacle-meeting",
        "sc-pk-rail-ban",
        "sc-pe-zone-living",
        "sc-vu-child-cyclist",
        "sc-ac-bridge-ice",
        // Wave 8 — all seven items landed. sc-ln-decisive-change opens the
        // wave's one new family (lanes3); the other six extend a family file
        // already registered above.
        "sc-ln-decisive-change",
        "sc-sig-controller-postures",
        "sc-vu-bikelane-turn",
        "sc-rx-tram-stop-doors",
        "sc-hz-accident-scene",
        "sc-fo-motorway-gap",
        "sc-ed-reverse-line",
        // Wave 9 — all six items landed on reused districts (pe-child-v1,
        // mw-v1, sp-rain-v1, ln-v1, poligon-v1), each appended to a family
        // file already spread in templates.ts. sc-sp-wet-limit-plate shipped
        // the brief's documented wet-only fallback (the posted-limit swap +
        // curve-advisory primary needs a new sp-* district + a ScenarioSpec
        // speed-span field — see the wave notes).
        "sc-pe-parked-row-scan",
        "sc-ac-wind-truck-pass",
        "sc-sp-wet-limit-plate",
        "sc-vp-telltale-red",
        "sc-hz-breakdown-pulloff",
        "sc-ed-poligon-chain",
      ].sort(),
    );
  });

  it("every template has unique ids, Bulgarian copy, cited archetypes and ≥ 2 mistake demos", () => {
    const seen = new Set<string>();
    for (const spec of SCENARIO_TEMPLATES) {
      expect(seen.has(spec.id), `duplicate ${spec.id}`).toBe(false);
      seen.add(spec.id);
      expect(spec.titleBg, spec.id).toMatch(/[Ѐ-ӿ]/);
      expect(spec.objectiveBg, spec.id).toMatch(/[Ѐ-ӿ]/);
      expect(spec.archetypeIds.length, spec.id).toBeGreaterThanOrEqual(1);
      expect(spec.mistakes.length, spec.id).toBeGreaterThanOrEqual(2);
      expect(spec.instructionsBg.length, spec.id).toBeGreaterThanOrEqual(4);
      expect(spec.teach.lawRef, spec.id).toBeTruthy();
    }
  });

  it("every template compiles at EVERY authored level into a valid LessonSpec", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      for (const level of spec.levels) {
        const lesson = compileScenario(spec, level.level);
        expect(lesson.id, `${spec.id}@L${level.level}`).toBe(`${spec.id}@L${level.level}`);
        expect(lesson.objectives.length, `${spec.id}@L${level.level}`).toBeGreaterThan(0);
      }
    }
  });

  it("the difficulty ladder is real: L1 guides (shadow car), the exam rung strips aids", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      const levels = spec.levels.map((l) => l.level);
      if (levels.includes(1)) {
        const l1 = compileScenario(spec, 1);
        expect(l1.aids?.shadowCar, `${spec.id}@L1 should show the shadow car`).toBe(true);
        expect(l1.examMode, `${spec.id}@L1 is not an exam`).toBeFalsy();
      }
      // L4 is the exam rung (examMode default); L5, where authored, is the
      // ADVANCED beyond-exam rung (harder conditions), not exam mode.
      if (levels.includes(4)) {
        const exam = compileScenario(spec, 4);
        expect(exam.examMode, `${spec.id}@L4 should be exam mode`).toBe(true);
        expect(exam.aids?.shadowCar, `${spec.id}@L4 must not show the shadow`).toBeFalsy();
        expect(exam.aids?.pathRibbon, `${spec.id}@L4 must not show the ribbon`).toBeFalsy();
      }
    }
  });

  it("every shadow + mistake trace ref points at a committed, parseable file", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      const refs = [spec.shadow, ...spec.mistakes.map((m) => m.traceRef)];
      for (const ref of refs) {
        expect(ref.pending, `${spec.id} ${ref.path}`).not.toBe(true);
        const file = path.join(REPO_ROOT, ref.path);
        expect(existsSync(file), `${ref.path} missing`).toBe(true);
        const publicFile = path.join(REPO_ROOT, "platform", "public", ref.path.replace(/^content\//, ""));
        expect(existsSync(publicFile), `public copy of ${ref.path} missing`).toBe(true);
        const parsed = JSON.parse(readFileSync(file, "utf-8"));
        expect(parsed.meta?.scenarioId, ref.path).toBe(spec.id);
      }
    }
  });
});
