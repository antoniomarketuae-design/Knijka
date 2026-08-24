import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import type { TelltaleStimulusSpec } from "../../../contracts";
import type { ScenarioSpec } from "../types";

/**
 * =============================================================================
 * A LESSON MAY NOT NAME A WARNING LAMP THE STUDENT WILL NEVER BE SHOWN
 * — sc-hz-breakdown-pulloff:f71c775a, critical, 2026-08-24.
 * =============================================================================
 *
 * THE DEFECT. `sc-hz-breakdown-pulloff` stages `lamp: "temperature"` and its
 * briefing step 2 said:
 *
 *   «На таблото светва червената лампа за НАЛЯГАНЕ НА МАСЛОТО — двигателят
 *    отказва.»
 *
 * What the student is actually shown, hard-coded at `LessonScene.tsx`'s
 * `data-hud="telltale-cue"`, is:
 *
 *   «Контролна лампа: ТЕМПЕРАТУРА! Спри спокойно вдясно»
 *
 * A different fault, with a different correct response, on the one lesson whose
 * entire subject is reacting to that lamp. The audit's words: „the lesson's own
 * cause and its symptom do not match".
 *
 * WHY THE COPY MOVED AND NOT THE LAMP. The cluster can already draw an oil
 * lamp (`LAMP_KEYS` in cockpit/clusterLayout.ts lists "oil"), but the CHANNEL
 * cannot carry which one: `TelltaleStimulusSpec.lamp` is the single-value union
 * "temperature", `director.telltaleLit` is a BOOLEAN, and `cabinTelltaleRail`
 * maps that one boolean into `tempWarnOn`. Widening it runs through contracts,
 * the runner, LessonScene, the cabin rail and the dev capture scene — five
 * files on the render path, for one lesson. The duty is identical either way
 * (doc 72 §3 VP-06, ЗДвП чл. 20: red = спри безопасно сега), so the honest and
 * cheap repair is to stop promising a lamp that cannot light.
 *
 * THIS GATE IS THE GENERAL FORM, not the instance. It binds every staged
 * telltale to the copy that describes it, so the next lesson to stage one
 * cannot drift the same way — and it goes red the moment the lamp channel is
 * widened without the briefings following, which is the direction the deeper
 * fix will come from.
 */

/** Lamps a briefing may name, and the Bulgarian a student would read for each. */
const LAMP_WORDS: Record<string, RegExp> = {
  temperature: /температура/i,
};

/** Lamps the product cannot stage today. Naming one is the defect above. */
const UNSTAGEABLE: { re: RegExp; what: string }[] = [
  { re: /налягане\s+на\s+маслото|маслен[а-я]*\s+лампа/i, what: "oil pressure" },
  { re: /акумулатор|зарядн[а-я]*\s+лампа/i, what: "battery / charging" },
  { re: /спирачн[а-я]*\s+лампа|ABS/i, what: "brake / ABS" },
];

function telltalesOf(s: ScenarioSpec): TelltaleStimulusSpec[] {
  return (s.staged ?? []).filter(
    (e): e is TelltaleStimulusSpec => e.kind === "telltaleStimulus",
  );
}

const withTelltale = SCENARIO_TEMPLATES.filter((s) => telltalesOf(s).length > 0);

describe("a staged warning lamp and the briefing that describes it", () => {
  it("finds the lessons this gate is about — an empty sweep is a moved registry, not a pass", () => {
    expect(withTelltale.length).toBeGreaterThan(0);
  });

  it("names, in the briefing, the lamp that is actually staged", () => {
    const missing: string[] = [];
    for (const s of withTelltale) {
      const text = s.instructionsBg.map((i) => i.textBg).join(" ");
      for (const t of telltalesOf(s)) {
        const word = LAMP_WORDS[t.lamp];
        // A lamp with no authored word is a lamp this gate has not been taught
        // about — fail loudly rather than skip, or widening the union silently
        // switches the gate off.
        if (!word) {
          missing.push(`${s.id}: staged lamp "${t.lamp}" has no entry in LAMP_WORDS`);
          continue;
        }
        if (!word.test(text)) {
          missing.push(`${s.id}: stages "${t.lamp}" and its briefing never says so`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("never names a lamp the product cannot light", () => {
    const offenders: string[] = [];
    for (const s of withTelltale) {
      for (const step of s.instructionsBg) {
        for (const u of UNSTAGEABLE) {
          if (u.re.test(step.textBg)) {
            offenders.push(`${s.id} step ${step.n} promises ${u.what}: «${step.textBg}»`);
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
