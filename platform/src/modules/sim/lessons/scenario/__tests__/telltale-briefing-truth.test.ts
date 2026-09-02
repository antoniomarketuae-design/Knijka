import { readFileSync } from "node:fs";
import path from "node:path";
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

/** Lamps a briefing may name, and the Bulgarian a student would read for each.
 *
 *  `checkEngine` joined on 2026-09-02 with the second lamp channel
 *  (sc-vp-telltale-red:775b58cc): the cluster's amber check-engine lamp is what
 *  a staged `lamp: "checkEngine"` now lights, and the word a Bulgarian student
 *  reads for it is the COLOUR — «жълта лампа» — because the colour is the
 *  protocol this family teaches. The gate is unchanged in shape: a lamp with no
 *  entry here still fails loudly. */
const LAMP_WORDS: Record<string, RegExp> = {
  temperature: /температура/i,
  checkEngine: /жълт/i,
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

  // -------------------------------------------------------------------------
  // …AND NOT IN THE DEMO CAPTION EITHER — the surface the briefing rule above
  // pushed the defect onto instead of closing it.
  // -------------------------------------------------------------------------

  /**
   * THE ROW CAME BACK ON THE OTHER SCREEN. This gate landed with the briefing
   * repair for `sc-hz-breakdown-pulloff:f71c775a`, and step 2 has said
   * «температура» ever since. The row was still STILL on the 2026-08-24 sweep,
   * and the reason is in the run log rather than in the spec:
   * `.audit-frames/w10-1/frames/sc-hz-breakdown-pulloff__pc-wrong/run.log`
   * lines 378, 514 and 649 carry «Червената лампа за НАЛЯГАНЕ НА МАСЛОТО
   * светна — двигателят отказва» across the windscreen, twelve times in one
   * drive, while the red banner in the same frames fires температура forty
   * times. The claim had simply moved from the panel into the demonstration
   * caption, which is a `kind: "annotation"` step baked into the committed
   * `content/traces/<lesson>/*.trace.json`.
   *
   * It is read from the COMMITTED FILE, not from `traces/scHz*.ts`, because the
   * file is what the browser plays: a script edited without a re-record would
   * otherwise pass a gate on copy nobody sees. Same reader, same reasoning, as
   * the `captionCopy` extension in `conditions-sweep161-truth.test.ts` — where
   * four more lessons had done the identical thing.
   */
  const REPO_ROOT = path.join(process.cwd(), "..");

  // READ ONCE, EAGERLY, IN THE DESCRIBE BODY — the same shape as its twin in
  // `lane-world-claims.test.ts`, and for the same measured reason. A lazy memo
  // removes the repeat reads and leaves the COLD pass inside the first `it`,
  // which on 2026-08-25 was still enough to trip `Test timed out in 5000ms` on
  // that twin (10.7 s elapsed, five lanes sharing a 7200 rpm spindle). A
  // describe callback runs at COLLECTION, where `testTimeout` does not reach,
  // so the read is paid once there and every `it` below is a pure lookup.
  // Traces are static for the lifetime of a suite.
  const tracePathsOf = (s: ScenarioSpec): readonly string[] => [
    ...(s.shadow ? [s.shadow.path] : []),
    ...(s.mistakes ?? []).flatMap((m) => (m.traceRef ? [m.traceRef.path] : [])),
  ];
  const readCaptions = (rel: string): readonly string[] => {
    const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf-8")) as {
      events?: Array<{ kind?: string; textBg?: string }>;
    };
    return (raw.events ?? [])
      .filter((e) => e.kind === "annotation" && typeof e.textBg === "string")
      .map((e) => e.textBg as string);
  };
  const CAPTIONS = new Map<string, readonly string[]>(
    [...new Set(withTelltale.flatMap((s) => tracePathsOf(s)))].map((rel) => [
      rel,
      readCaptions(rel),
    ]),
  );

  function captionsOf(s: ScenarioSpec): string[] {
    // The fallback reads rather than returning nothing: a spec outside
    // `withTelltale` must not be reported as „no captions", which is the
    // vacuous-pass the first `it` below is here to refuse.
    return tracePathsOf(s).flatMap((rel) => [...(CAPTIONS.get(rel) ?? readCaptions(rel))]);
  }

  it("the caption sweep reaches real captions — an empty reader would pass everything", () => {
    const captions = withTelltale.flatMap(captionsOf);
    expect(captions.length).toBeGreaterThan(0);
    // The instrument, checked against its own subject: the lesson this rule was
    // written for must be in the sweep and must be speaking.
    const bp = withTelltale.find((s) => s.id === "sc-hz-breakdown-pulloff");
    expect(bp, "sc-hz-breakdown-pulloff no longer stages a telltale").toBeDefined();
    expect(captionsOf(bp!).length).toBeGreaterThan(0);
  });

  it("no demonstration caption names a lamp the product cannot light", () => {
    const offenders: string[] = [];
    for (const s of withTelltale) {
      for (const caption of captionsOf(s)) {
        for (const u of UNSTAGEABLE) {
          if (u.re.test(caption)) {
            offenders.push(`${s.id} caption promises ${u.what}: «${caption.slice(0, 80)}…»`);
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the caption rule has teeth — the line that shipped is caught", () => {
    // Verbatim off `content/traces/sc-hz-breakdown-pulloff/shadow-correct
    // .trace.json` at 151bd19, and off the run log named above.
    const SHIPPED =
      "Червената лампа за налягане на маслото светна — двигателят отказва. Без паника: огледало, десен мигач и плавно излизане вдясно.";
    expect(UNSTAGEABLE.some((u) => u.re.test(SHIPPED))).toBe(true);
    // …and it is not in any caption the product ships any more.
    expect(withTelltale.flatMap(captionsOf)).not.toContain(SHIPPED);
    // Nor is the rule a ban on the word „лампа": the replacement passes.
    const FIXED =
      "Червената лампа за температура на двигателя светна — червено значи спри безопасно сега. Без паника: огледало, десен мигач и плавно излизане вдясно.";
    expect(UNSTAGEABLE.some((u) => u.re.test(FIXED))).toBe(false);
    expect(withTelltale.flatMap(captionsOf)).toContain(FIXED);
  });
});
