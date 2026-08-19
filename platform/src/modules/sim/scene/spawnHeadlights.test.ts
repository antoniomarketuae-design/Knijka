/**
 * L10 (engine half) — the hand-over lamp state must not falsify the lesson's
 * own lamp sentence, in EITHER direction.
 *
 * `rules/engine.ts` arms HEADLIGHTS_OFF_AT_NIGHT (**основна**) and
 * HEADLIGHTS_OFF_IN_RAIN with no config gate, while the cabin used to
 * initialise `headlights: "off"` unconditionally and LessonScene spawns most
 * scenarios `vehicleStart: "ready"` without touching the lamps. Every
 * night/rain/fog rung therefore began in violation, before the student had
 * touched a control. That was the FALSE FAILURE, and doc 86 L10 fixed it by
 * handing the car over lit.
 *
 * THE OTHER DIRECTION, and why this file was rewritten (sweep 161,
 * `sc-park-night/mobile-right/01-arrival.png` — 0 км/ч, no input yet, a full
 * dipped-beam cone already on the asphalt). L10's exception list was three
 * literal template ids. `sc-park-night` orders «Включи късите светлини ПРЕДИ
 * да тръгнеш» in briefing step 1 and authors a `mistake-no-lights` variant
 * citing HEADLIGHTS_OFF_AT_NIGHT — and it was not one of the three, so its
 * headline act arrived already performed. A green tick for an act nothing
 * measured is the same crime as the false failure, pointing the other way.
 *
 * WHY THE OLD VERSION OF THIS FILE COULD NOT SEE IT. It read
 * HEADLIGHT_DRILL_TEMPLATE_IDS, EXCLUDED that set from its offender scan, and
 * then iterated the same set to check the members started dark. Expectation
 * and implementation came from one constant, so a MISSING member was
 * unrepresentable — the suite was green for seven rounds with the defect in
 * the frame. The partition below is therefore pinned BY NAME from the authored
 * Bulgarian, read by eye, and the derivation must reproduce it exactly; the
 * two are independent, so drift in either fails and says which template moved.
 *
 * This file sweeps the real compiled catalog (154 templates × their authored
 * rungs) rather than a fixture, so the counts stay measured numbers.
 */

import { describe, expect, it } from "vitest";
import { compileScenario, SCENARIO_TEMPLATES } from "../lessons/scenario";
import type { ScenarioLevel } from "../lessons/scenario";
import {
  briefingOrdersLampsOn,
  headlightDrillTemplateIds,
  initialHeadlightsFor,
  isHeadlightDrillLesson,
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
/** The population the hand-over decision actually applies to. */
const handedOver = (r: Rung) => needsLights(r) && r.vehicleStart === "ready" && !r.preDrive;

const resolve = (r: Rung) =>
  initialHeadlightsFor({
    vehicleStart: r.vehicleStart,
    night: r.night,
    rain: r.rain,
    fog: r.fog,
    preDrive: r.preDrive,
    lessonId: r.lessonId,
  });

const stepsOf = (templateId: string) =>
  SCENARIO_TEMPLATES.find((s) => s.id === templateId)!.instructionsBg.map((s) => s.textBg);

// ---------------------------------------------------------------------------
// THE PARTITION, read off the authored Bulgarian by eye — NOT computed here.
// Each entry carries the imperative that decides it, so a reviewer can check
// the claim against the template without running anything.
// ---------------------------------------------------------------------------

/** ORDER — the briefing tells the student to make the act. Car starts DARK. */
const ORDERS_LAMPS_ON: ReadonlyArray<readonly [string, string]> = [
  ["sc-ac-aquaplane", "Включи късите светлини"],
  ["sc-ac-fog", "Включи късите светлини и фаровете за мъгла"],
  ["sc-ac-night-lights", "Включи късите светлини още със запалването"],
  ["sc-ac-night-overdrive", "Включи късите светлини"],
  ["sc-ac-rain-lights", "Включи късите светлини"],
  ["sc-ac-snow", "Включи късите светлини и потегли меко"],
  ["sc-ac-truck-spray", "Включи късите светлини преди да потеглиш"],
  ["sc-ac-wet-braking", "Включи късите светлини и потегли"],
  ["sc-follow-rain-gap", "Включи късите светлини РЪЧНО"],
  ["sc-park-judge", "Включи късите светлини още ПРЕДИ огледа"],
  ["sc-park-night", "Включи късите светлини ПРЕДИ да тръгнеш"],
  ["sc-sign-warning", "Включи къси светлини"],
];

/** VERIFY — the briefing asserts the lamps ARE on and asks for a check. Car
 *  must start LIT or the sentence is a false claim about the cockpit, which is
 *  the original L10 defect. These are the templates the L10 wave converted. */
const VERIFIES_LAMPS_ON: readonly string[] = [
  "sc-crossing-rain-sprint",
  "sc-ln-obstacle-meeting",
  "sc-pe-night-unlit",
  "sc-pe-parked-row-scan",
];

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

  // -- the partition itself ---------------------------------------------------

  it("the eye-read ORDER list and the derivation agree, member for member", () => {
    // The whole point of the rewrite: two independent sources for one set. If
    // a template's Bulgarian is edited into or out of the imperative, exactly
    // one side moves and this names it.
    const derived = [...headlightDrillTemplateIds()].sort();
    expect(derived).toEqual(ORDERS_LAMPS_ON.map(([id]) => id).slice().sort());
  });

  it("every ORDER template really does carry that imperative, unhedged", () => {
    for (const [templateId, imperative] of ORDERS_LAMPS_ON) {
      const steps = stepsOf(templateId);
      expect(
        steps.some((s) => s.includes(imperative)),
        `${templateId} no longer contains «${imperative}» — re-read the briefing before editing the pin`,
      ).toBe(true);
    }
  });

  it("a VERIFY template is NOT a drill — its car must arrive already lit", () => {
    for (const templateId of VERIFIES_LAMPS_ON) {
      const steps = stepsOf(templateId);
      expect(
        steps.some((s) => /провери/iu.test(s)),
        `${templateId} no longer asks the student to CHECK the lamps`,
      ).toBe(true);
      expect(isHeadlightDrillLesson(templateId), templateId).toBe(false);
      for (const r of RUNGS.filter((x) => x.templateId === templateId && handedOver(x))) {
        expect(resolve(r), `${r.lessonId} asserts the lamps are on`).toBe("low");
      }
    }
  });

  // -- the invariant, both directions ----------------------------------------

  // NOTE ON WHAT CLASSIFIES A RUNG BELOW. Both directions are keyed on the
  // EYE-READ list, never on `isHeadlightDrillLesson`. Filtering by the
  // predicate and then asserting the value the predicate produced is the exact
  // tautology that hid this defect for seven rounds: both sides move together,
  // so no change to the rule can ever fail it. Verified by mutation — dropping
  // the hedge guard in cabin.ts turns 42 templates into "orders" and these go
  // red naming them.
  const ORDER_IDS = new Set(ORDERS_LAMPS_ON.map(([id]) => id));

  it("FALSE FAILURE: a lesson that never orders the act hands the car over lit", () => {
    // doc 86 L10's original direction — no student may collect основна
    // HEADLIGHTS_OFF_AT_NIGHT for an omission nothing ever asked him to avoid.
    const offenders = RUNGS.filter(
      (r) => handedOver(r) && !ORDER_IDS.has(r.templateId) && resolve(r) !== "low",
    );
    expect(
      offenders.map((r) => `${r.lessonId} (night=${r.night} rain=${r.rain} fog=${r.fog})`),
    ).toEqual([]);
    // …and the population is real, not an empty set passing vacuously.
    expect(
      RUNGS.filter((r) => handedOver(r) && !ORDER_IDS.has(r.templateId)).length,
    ).toBeGreaterThanOrEqual(30);
  });

  it("FALSE CERTIFICATE: a lesson that DOES order the act hands the car over dark", () => {
    // The sweep-161 direction. If the order is pre-performed the act cannot be
    // done, cannot be failed, and the template's own mistake variant has
    // nothing left to demonstrate.
    const offenders = RUNGS.filter(
      (r) => handedOver(r) && ORDER_IDS.has(r.templateId) && resolve(r) !== "off",
    );
    expect(offenders.map((r) => r.lessonId)).toEqual([]);
    expect(
      RUNGS.filter((r) => handedOver(r) && ORDER_IDS.has(r.templateId)).length,
    ).toBeGreaterThanOrEqual(30);
  });

  it("sc-park-night: the act the frame showed already done is the student's again", () => {
    // `.audit-frames/sweep161/sc-park-night/mobile-right/01-arrival.png` —
    // 0 км/ч, before any input, dipped beams already lighting the asphalt,
    // under an instruction ordering the student to switch them on.
    const rungs = RUNGS.filter((r) => r.templateId === "sc-park-night" && handedOver(r));
    expect(rungs.length, "sc-park-night has no ready night rung").toBeGreaterThanOrEqual(4);
    for (const r of rungs) expect(resolve(r), r.lessonId).toBe("off");
  });

  it("sc-park-night's authored mistake-no-lights variant is reachable again", () => {
    // The template demonstrates HEADLIGHTS_OFF_AT_NIGHT as a fault a student
    // can commit here. A car handed over lit leaves that demo undemonstrable.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-park-night")!;
    const lampMistake = spec.mistakes?.find((m) =>
      (m.codeRefs ?? []).includes("HEADLIGHTS_OFF_AT_NIGHT"),
    );
    expect(lampMistake, "sc-park-night no longer authors a lamp mistake").toBeDefined();
    for (const r of RUNGS.filter((r) => r.templateId === "sc-park-night" && handedOver(r))) {
      expect(resolve(r), `${r.lessonId} starts lit — the fault cannot be committed`).toBe("off");
    }
  });

  // -- the pure predicate, proven by mutation --------------------------------

  describe("briefingOrdersLampsOn reads the VERB, not the topic", () => {
    const REAL = "Включи късите светлини ПРЕДИ да тръгнеш — тъмно е и редът не е осветен.";

    it("the real sc-park-night step 1 is an order", () => {
      expect(briefingOrdersLampsOn([REAL])).toBe(true);
    });

    it("MUTATION — the same sentence in the VERIFY convention is not an order", () => {
      // The one edit that must flip it: swap the imperative for the check.
      // If this still returned true the predicate would be matching „lamps are
      // mentioned", and every VERIFY lesson would be handed over dark — the
      // L10 false failure, restored wholesale.
      expect(
        briefingOrdersLampsOn(["Провери, че късите светлини са включени, ПРЕДИ да потеглиш."]),
      ).toBe(false);
    });

    it("MUTATION — a conditional hedge is not an order", () => {
      // 42 templates hedge like this on their L5 night/rain rung. Reading them
      // as orders would hand 42 lessons over dark.
      expect(
        briefingOrdersLampsOn([
          "Влез в паркинга по алеята и карай бавно. Ако е тъмно, включи късите светлини: линиите са единственият ти ориентир.",
        ]),
      ).toBe(false);
      expect(briefingOrdersLampsOn(["Вали ли, включи първо късите светлини (чл. 70)."])).toBe(
        false,
      );
      expect(briefingOrdersLampsOn(["По тъмно или в дъжд включи първо късите светлини."])).toBe(
        false,
      );
    });

    it("MUTATION — the hedge binds to its own clause, not the whole step", () => {
      // «Включи къси светлини — в дъжд са задължителни» (sc-sign-warning) IS an
      // order whose second clause happens to contain a hedge word. Reading the
      // step as one string would drop sc-sign-warning out of the drill set.
      expect(briefingOrdersLampsOn(["Включи къси светлини — в дъжд са задължителни."])).toBe(true);
    });

    it("MUTATION — the HAZARD switch is a different switch", () => {
      expect(
        briefingOrdersLampsOn([
          "Включи аварийни светлини, обезопаси мястото и остани — бягството е тежко нарушение.",
        ]),
      ).toBe(false);
    });

    it("MUTATION — «включително» is not «включи»", () => {
      expect(briefingOrdersLampsOn(["Всичко включително светлините е проверено."])).toBe(false);
    });

    it("MUTATION — a Cyrillic word boundary is not an ASCII one", () => {
      // The first cut of this predicate used /\bвключи\b/. `\b` is defined on
      // ASCII \w, Cyrillic letters are not \w, so it matched NOTHING and the
      // catalogue scan came back empty — i.e. „no lesson is a lamp drill",
      // which is exactly the reassuring direction. A leading-position and a
      // mid-sentence occurrence must both be found.
      expect(briefingOrdersLampsOn(["Включи късите светлини."])).toBe(true);
      expect(briefingOrdersLampsOn(["Първо включи късите светлини."])).toBe(true);
    });

    it("no lamp noun at all is not an order", () => {
      expect(briefingOrdersLampsOn(["Включи на задна и се огледай през рамо."])).toBe(false);
      expect(briefingOrdersLampsOn([])).toBe(false);
    });
  });

  // -- the three exclusions that predate this lane ---------------------------

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

  it("an unknown lesson id is not a drill — the doc-86 default still applies", () => {
    expect(isHeadlightDrillLesson("l-first-drive")).toBe(false);
    expect(
      initialHeadlightsFor({
        vehicleStart: "ready",
        night: true,
        rain: false,
        fog: false,
        preDrive: false,
        lessonId: "l-some-curriculum-lesson",
      }),
    ).toBe("low");
  });

  it("the lampDrill override still exercises the rule without the catalogue", () => {
    const base = {
      vehicleStart: "ready" as const,
      night: true,
      rain: false,
      fog: false,
      preDrive: false,
      lessonId: "whatever",
    };
    expect(initialHeadlightsFor({ ...base, lampDrill: true })).toBe("off");
    expect(initialHeadlightsFor({ ...base, lampDrill: false })).toBe("low");
  });

  it("templateIdOfLessonId strips the rung suffix", () => {
    expect(templateIdOfLessonId("sc-ac-fog@L3")).toBe("sc-ac-fog");
    expect(templateIdOfLessonId("l-first-drive")).toBe("l-first-drive");
  });
});
