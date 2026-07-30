/**
 * L10 (engine half) — the car must not be handed over dark into the dark.
 *
 * `rules/engine.ts` arms HEADLIGHTS_OFF_AT_NIGHT (**основна**) and
 * HEADLIGHTS_OFF_IN_RAIN with no config gate, while the cabin used to
 * initialise `headlights: "off"` unconditionally and LessonScene spawns most
 * scenarios `vehicleStart: "ready"` without touching the lamps. Every
 * night/rain/fog rung therefore began in violation, before the student had
 * touched a control — and `sc-ac-night-overdrive` instruction 1 additionally
 * ASSERTS «Късите светлини са включени», a false statement about the cockpit.
 *
 * This file sweeps the real compiled catalog (154 templates × their authored
 * rungs) rather than a fixture, so the count in the doc-86 ledger is a measured
 * number here and stays measured.
 */

import { describe, expect, it } from "vitest";
import { compileScenario, SCENARIO_TEMPLATES } from "../lessons/scenario";
import type { ScenarioLevel } from "../lessons/scenario";
import {
  HEADLIGHT_DRILL_TEMPLATE_IDS,
  initialHeadlightsFor,
  templateIdOfLessonId,
} from "./cabin";

interface Rung {
  templateId: string;
  lessonId: string;
  level: number;
  night: boolean;
  rain: boolean;
  fog: boolean;
  vehicleStart: "cold" | "ready";
  preDrive: boolean;
}

const RUNGS: Rung[] = SCENARIO_TEMPLATES.flatMap((spec) =>
  spec.levels.map((l) => {
    const lesson = compileScenario(spec, l.level as ScenarioLevel);
    return {
      templateId: spec.id,
      lessonId: lesson.id,
      level: l.level,
      night: lesson.environment?.timeOfDay === "night",
      rain: lesson.environment?.rain === true,
      fog: lesson.environment?.fog === true,
      vehicleStart: lesson.vehicleStart ?? "cold",
      preDrive: lesson.preDrive,
    };
  }),
);

const needsLights = (r: Rung) => r.night || r.rain || r.fog;

const resolve = (r: Rung) =>
  initialHeadlightsFor({
    vehicleStart: r.vehicleStart,
    night: r.night,
    rain: r.rain,
    fog: r.fog,
    preDrive: r.preDrive,
    lessonId: r.lessonId,
  });

describe("spawn lamp state (doc 86 L10)", () => {
  it("the catalog really does compile a large night/rain/fog population", () => {
    const templates = new Set(RUNGS.filter(needsLights).map((r) => r.templateId));
    // The ledger says 34 of 154 templates. Pinned as a floor so this sweep can
    // never quietly stop finding them; the exact figure is printed on failure.
    expect(
      templates.size,
      `templates with a night/rain/fog rung: ${[...templates].sort().join(", ")}`,
    ).toBeGreaterThanOrEqual(30);
    expect(RUNGS.length).toBeGreaterThan(400);
  });

  it("no ready-start rung is handed over dark into night, rain or fog", () => {
    const offenders = RUNGS.filter(
      (r) =>
        needsLights(r) &&
        r.vehicleStart === "ready" &&
        !r.preDrive &&
        !HEADLIGHT_DRILL_TEMPLATE_IDS.has(r.templateId) &&
        resolve(r) !== "low",
    );
    expect(
      offenders.map((r) => `${r.lessonId} (night=${r.night} rain=${r.rain} fog=${r.fog})`),
    ).toEqual([]);
  });

  it("the three lamp DRILLS still start dark — switching them on is the lesson", () => {
    for (const templateId of HEADLIGHT_DRILL_TEMPLATE_IDS) {
      const rungs = RUNGS.filter((r) => r.templateId === templateId);
      expect(rungs.length, `${templateId} has no compiled rungs`).toBeGreaterThan(0);
      for (const r of rungs) expect(resolve(r), r.lessonId).toBe("off");
    }
  });

  it("sc-ac-night-overdrive's instruction 1 is now TRUE at t = 0", () => {
    const rungs = RUNGS.filter((r) => r.templateId === "sc-ac-night-overdrive");
    expect(rungs.length).toBeGreaterThan(0);
    for (const r of rungs) {
      expect(r.night, r.lessonId).toBe(true);
      // …except on a cold-start exam rung, where performing the pre-drive IS
      // the assessment and the copy's claim is the student's own job.
      if (r.vehicleStart === "ready") expect(resolve(r), r.lessonId).toBe("low");
    }
  });

  it("a dry daytime lesson is untouched — the lamps stay off", () => {
    const dry = RUNGS.filter((r) => !needsLights(r));
    expect(dry.length).toBeGreaterThan(0);
    for (const r of dry) expect(resolve(r), r.lessonId).toBe("off");
  });

  it("a cold start is a pre-drive: the lamps are the student's to switch on", () => {
    for (const r of RUNGS.filter((r) => needsLights(r) && r.vehicleStart === "cold")) {
      expect(resolve(r), r.lessonId).toBe("off");
    }
  });

  it("a lesson that RUNS the 13-step pre-drive never has its graded step pre-satisfied", () => {
    expect(
      initialHeadlightsFor({
        vehicleStart: "ready",
        night: true,
        rain: false,
        fog: false,
        preDrive: true,
        lessonId: "l-first-drive",
      }),
    ).toBe("off");
  });

  it("templateIdOfLessonId strips the rung suffix", () => {
    expect(templateIdOfLessonId("sc-ac-fog@L3")).toBe("sc-ac-fog");
    expect(templateIdOfLessonId("l-first-drive")).toBe("l-first-drive");
  });
});
