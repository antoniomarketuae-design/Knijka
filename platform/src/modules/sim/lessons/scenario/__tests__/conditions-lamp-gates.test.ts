/**
 * THE TWO WEATHER GATES THAT CERTIFIED LAMPS THEIR BANNER NEVER NAMED — doc 88
 * O20, opened by an adversarial refuter attacking the previous wave rather than
 * by the sweep's own findings file, and verified here before anything moved.
 *
 * WHAT WAS BROKEN, MEASURED THROUGH THE FULL PRODUCTION PIPELINE (compileScenario
 * → createLessonSession → applyTick on every recorded frame → buildLessonResult)
 * on each template's OWN committed demonstration scripts, 2026-08-19. The
 * „before" column is this file's own `PRE_FIX_TITLES` clone — the shipped banner
 * put back, one string, nothing else — so the numbers are re-measurable rather
 * than remembered:
 *
 *   sc-ac-fog / sc-acf-adapted   «…със съобразена за мъглата скорост»
 *     drive                   cockpit        before          after
 *     shadow-correct          low + fog ON   ✓ 23.92 s       ✓ 23.92 s
 *     mistake-no-fog-lights   low + fog OFF  ✓ 23.93 s ★     ✗ never
 *     shadow, lamps forced off  off + OFF    ✓ 23.92 s       ✗ never
 *   ★ the template's OWN counter-example — the drive it ships to teach against,
 *     titled „Без фарове за мъгла" — collected the tick to the tenth of a
 *     second, `completedAll`, `passed`, in the lesson whose title is „Мъгла" and
 *     whose instruction 1 makes both lamps a precondition of moving off.
 *     (The FOG_LIGHTS_OFF_IN_FOG fault is второстепенна, so at L3 the coach
 *     TEACHES it rather than billing it: score 0, ИЗДЪРЖАН. Nothing on that
 *     screen contradicted the green tick.)
 *
 *   sc-ac-snow / sc-acs-approach  «Приближи със зимна скорост»
 *     shadow-correct            low          ✓ 21.57 s       ✓ 21.57 s
 *     shadow, lamps forced off  off          ✓ 21.57 s       ✗ never
 *
 * AND SNOW IS THE WORSE OF THE TWO, which the frames alone do not show. The rule
 * engine has a lamp detector for rain (`raining && headlights === "off"` →
 * HEADLIGHTS_OFF_IN_RAIN) and one for fog (`foggy && fogLightsOn !== true` →
 * FOG_LIGHTS_OFF_IN_FOG). It has NONE armed by `tick.snow`. So on sc-ac-snow the
 * order «Включи късите светлини» was checked by nothing anywhere in the product:
 * measured above, the lamps-off drive finished `passed`, `completedAll`, score 0,
 * three stars. That missing detector was a rules/engine.ts row, routed rather
 * than closed here — and it HAS since been closed there (`snowNoLights`, same
 * wave): re-measured 2026-09-18, the dark drive is billed «Движение в снеговалеж
 * без светлини», 1 второстепенна т. Every «before» number above is the state
 * this file measured on 2026-08-19 and is still re-derivable through
 * `PRE_FIX_TITLES`; what is no longer true is the present tense of this
 * paragraph, and §2's table says so where it is declared.
 *
 * HOW IT IS FIXED, and why the fix is a BANNER. `objectives.ts` resolves a
 * reachZone's lamp demand from the title when no param states one
 * (`deriveLampDemand`), and the authored alternative is not available from a
 * template: `ScenarioObjectiveSpec.params` is the real `ObjectiveParams` union,
 * `ReachZoneParams` lives in `lessons/types.ts`, and a `requireLamps` key there
 * does not compile. (The routing note that opened this row asked for exactly
 * that key. It was never compilable — which is why a lane inheriting a premise
 * has to re-measure it.) Naming the lamps in the banner is the stronger
 * invariant regardless: the banner is the only thing the student reads while the
 * task sits unticked, so a gate may refuse only for something the banner said.
 *
 * THE OTHER DIRECTION IS PROVED ON REAL DATA, not asserted: the `mistake-no-fog-
 * lights` recording — the same path, the same speeds, the same everything — is
 * CREDITED once its one lamp field is flipped on. A refusal that cannot be
 * lifted by doing the thing right is the founder's own complaint, and it is
 * checked here before the refusal is.
 *
 * WHAT ADR-009 CHANGED HERE, 2026-09-18 (founder Ruling A; ADR-009 in
 * docs/architecture/07, spec doc 92 §8.3). `sc-ac-fog`'s derived
 * `lessonMistakeTargets` at every practice rung is
 * `[FOG_LIGHTS_OFF_IN_FOG, SPEED_TOO_FAST_FOR_CONDITIONS]` — its two ❌ demos'
 * own codes, «Без фарове за мъгла» and «Кара „като на сухо“ в мъглата» — so
 * driving this lesson without the fog lamps is now the mistake THE LESSON
 * EXISTS TO TEACH and the lesson is not taken, whatever the gate does. ONE
 * assertion in this file was superseded by that: the pre-fix control's trailing
 * `passed === true`, which said the shipped banner CERTIFIED an unlit car in
 * fog. It did — and the second half of that sentence is now true for a second
 * reason as well, so the claim is kept where it can still be measured: with the
 * targets stripped, which is the only state in which the certificate this file
 * was written about can still be handed out. Everything else here is the GATE's
 * and is untouched, including every «done» and «completedAll» in the file.
 *
 * `sc-ac-snow` IS NOT RESCUED BY THE RULING and its numbers do not move:
 * its only target is SPEED_TOO_FAST_FOR_CONDITIONS (its one ❌ demo, «Кара
 * „като на сухо“ — 40 в снега»), and the dark drive below keeps the winter
 * speed, so the snow row goes on measuring the gate and nothing else. That is
 * asserted, not assumed — see §3's snow case.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../../contracts";
import type { SimTick } from "../../../rules";
// Deep import, test-only: `lowBeamDuty` is the engine's own precedence and this
// file asserts today's answer beside the filing-era table below.
import { lowBeamDuty } from "../../../rules/engine";
import { recordScAcFogDrive } from "../../../traces/scAcFog";
import { recordScAcSnowDrive } from "../../../traces/scAcSnow";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import { deriveLampDemand, parseObjectiveParams } from "../../objectives";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_CONDITIONS } from "../templates-conditions";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadDistrict(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

const specById = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES_CONDITIONS.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no conditions template ${id}`);
  return s;
};

/** The parsed demand a gate actually carries, through the production parser. */
function resolvedLampDemand(specId: string, objectiveId: string, level: ScenarioLevel): string | undefined {
  const obj = compileScenario(specById(specId), level).objectives.find((o) => o.id === objectiveId);
  if (obj === undefined) throw new Error(`no objective ${objectiveId} at L${level}`);
  return (parseObjectiveParams(obj) as { requireLamps?: string }).requireLamps;
}

type LessonTweak = (lesson: LessonSpec) => LessonSpec;

/**
 * ADR-009's OWN CONTROL. `lessonMistakeTargets` is the one field the ruling
 * reads (`lessons/lessonMistake.ts lessonMistakeTargetCodes`), so deleting it
 * from a COPY of the compiled lesson reproduces the pre-ADR-009 product exactly
 * — and nothing else about the drive moves, which is what makes a pair of
 * answers attributable to the ruling and to nothing else. Same pattern, same
 * reason, as `lessons/__tests__/busstop-ban-fail-path.test.ts` §3's.
 */
const stripLessonMistakeTargets: LessonTweak = (lesson) => {
  const copy = { ...lesson };
  delete (copy as { lessonMistakeTargets?: unknown }).lessonMistakeTargets;
  return copy;
};

/**
 * One recorded drive through the whole lesson pipeline. `mutate` changes ONE
 * cockpit field on every frame and nothing else — the single-field flip that
 * makes these assertions measurements rather than decoration. `tweak` changes
 * ONE field of the compiled lesson, for the same reason.
 */
function driveOutcome(
  spec: ScenarioSpec,
  districtId: string,
  record: (district: unknown, onTick: (t: SimTick) => void) => void,
  mutate?: (t: SimTick) => SimTick,
  tweak?: LessonTweak,
): {
  done: (id: string) => boolean;
  completedAll: boolean;
  passed: boolean;
  /** ADR-009: the codes `foldLessonMistakes` read off both records. */
  lessonMistakes: string[];
  /** What reached the изпитен лист, and what it cost there. */
  scored: string[];
  points: number;
} {
  const compiled = compileScenario(spec, 3);
  let session = createLessonSession(tweak === undefined ? compiled : tweak(compiled));
  record(loadDistrict(districtId), (raw) => {
    session = applyTick(session, mutate ? mutate(raw) : raw).state;
  });
  const result = buildLessonResult(session);
  return {
    done: (id) => result.objectives.find((o) => o.id === id)?.done === true,
    completedAll: result.completedAll,
    passed: result.passed,
    lessonMistakes: (result.lessonMistakes ?? []).map((h) => h.code),
    scored: result.summary.mistakes.map((m) => m.code),
    points: result.summary.score.totalPoints,
  };
}

const lampsOff = (t: SimTick): SimTick => ({ ...t, headlights: "off", fogLightsOn: false });

/** The exact banners that shipped, so the „before" column can be re-measured. */
const PRE_FIX_TITLES: ReadonlyArray<[string, string, string]> = [
  ["sc-ac-fog", "sc-acf-adapted", "Мини контролната зона със съобразена за мъглата скорост"],
  ["sc-ac-snow", "sc-acs-approach", "Приближи със зимна скорост"],
];

function withTitle(specId: string, objectiveId: string, titleBg: string): ScenarioSpec {
  const spec = specById(specId);
  return {
    ...spec,
    success: spec.success.map((o) => (o.id === objectiveId ? { ...o, titleBg } : o)),
  };
}

// ---------------------------------------------------------------------------
// 1 · The instrument, before the measurement
// ---------------------------------------------------------------------------

describe("the demand is resolved from the shipped banner, at every authored rung", () => {
  it("sc-ac-fog/sc-acf-adapted asks for the чл. 74 pair, sc-ac-snow/sc-acs-approach for dipped", () => {
    const fog = specById("sc-ac-fog");
    const snow = specById("sc-ac-snow");
    expect(fog.levels.length).toBeGreaterThanOrEqual(4);
    for (const rung of fog.levels) {
      expect(resolvedLampDemand("sc-ac-fog", "sc-acf-adapted", rung.level), `fog L${rung.level}`).toBe("fog");
    }
    for (const rung of snow.levels) {
      expect(resolvedLampDemand("sc-ac-snow", "sc-acs-approach", rung.level), `snow L${rung.level}`).toBe("low");
    }
  });

  it("…and the SHIPPED banners resolved to nothing — the defect, re-measured", () => {
    // The mutation that makes the row above an assertion: put each old string
    // back and the demand disappears. If this ever starts returning a demand,
    // the „before" column of this file's header is no longer describing the
    // shipped product and every number in it must be re-taken.
    for (const [, , titleBg] of PRE_FIX_TITLES) {
      expect(deriveLampDemand(titleBg), `«${titleBg}»`).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 2 · The law that would have caught it — a lamp ORDER must be graded by
//     something, and a lamp PROMISE must be graded by this gate
// ---------------------------------------------------------------------------

/**
 * Which rule-engine detector each weather armed WHEN THIS ROW WAS FILED
 * (2026-08-19): the rain arm on `raining && !isNight && headlights === "off"`,
 * the fog arm on `foggy && fogLightsOn !== true`, the night arm on
 * HEADLIGHTS_OFF_AT_NIGHT — and nothing at all on `tick.snow`, which is the
 * hole §2 below was written about.
 *
 * ── IT IS NAMED «AT_FILING» BECAUSE THE PRODUCT HAS MOVED, AND A TABLE THAT
 *    DOES NOT SAY SO IS A HAND-MIRRORED COPY OF THE ENGINE PRESENTING A STALE
 *    VALUE AS TODAY'S ANSWER.
 *
 * MEASURED 2026-09-18 on the real chain: `rules/engine.ts` now arms a dedicated
 * snow lamp duty — `snowNoLights = lampDuty === "snow" && tick.headlights ===
 * "off" && moving`, sharing the rain drill's `rainLightsSustainSec` grace — and
 * bills it as HEADLIGHTS_OFF_IN_RAIN with `detail: HEADLIGHTS_CONDITION_SNOW`,
 * which retrieves «Движение в снеговалеж без светлини», второстепенна, 1 т.,
 * ЗДвП чл. 70, ал. 1. The exclusivity is in `lowBeamDuty` (night > rain > snow),
 * asserted live below and pinned in `rules/__tests__/low-beam-duty-one-source.
 * test.ts`.
 *
 * The table is kept, and kept stale on purpose: §2's survey uses it, so the
 * rule it enforces is the FILING-ERA one — every template that ORDERS a lamp
 * must be graded by the gate or by a detector that existed then. That is
 * strictly stronger than grading it against today's engine (the snow lesson
 * would pass the survey either way now), and strictly stronger is the safe
 * direction for a rule whose whole job is to refuse a silent hole.
 */
const WEATHER_LAMP_DETECTOR_AT_FILING: Readonly<Record<string, string | null>> = {
  rain: "HEADLIGHTS_OFF_IN_RAIN",
  fog: "FOG_LIGHTS_OFF_IN_FOG",
  snow: null,
  dry: null,
};

/** «Включи късите светлини…» — the briefing ORDERING a lamp, not mentioning one. */
const LAMP_ORDER = /включи[^.]{0,40}(?:светлини|фарове)/iu;

describe("a lamp the briefing ORDERS is graded by something", () => {
  const ordering = SCENARIO_TEMPLATES_CONDITIONS.filter((s) =>
    s.instructionsBg.some((i) => LAMP_ORDER.test(i.textBg)),
  );

  it("surveys real templates (a sweep over nothing proves nothing)", () => {
    // Six of the nine conditions templates open with «Включи … светлини»; if a
    // refactor drops the survey to a handful, the rule below stops meaning
    // anything. (`sc-ac-highbeam-lead` discusses beams without ORDERING one and
    // is not in this set — its own banner «…с къси светлини» binds it anyway,
    // which is the other half of the invariant, asserted one describe up.)
    expect(ordering.map((s) => s.id).sort()).toEqual([
      "sc-ac-aquaplane",
      "sc-ac-fog",
      "sc-ac-night-lights",
      "sc-ac-rain-lights",
      "sc-ac-snow",
      "sc-ac-wet-braking",
    ]);
  });

  it("every ordered lamp has a grader: a gate demand, or the weather's own detector", () => {
    const unguarded: string[] = [];
    for (const spec of ordering) {
      const weather = spec.conditions?.weather ?? "dry";
      const night = spec.conditions?.night === true;
      const engineGrades = night || WEATHER_LAMP_DETECTOR_AT_FILING[weather] !== null;
      const gateGrades = compileScenario(spec, 3).objectives.some(
        (o) => (parseObjectiveParams(o) as { requireLamps?: string }).requireLamps !== undefined,
      );
      if (!engineGrades && !gateGrades) {
        unguarded.push(
          `${spec.id}: briefing orders a lamp, weather "${weather}" arms no detector, no gate demands one`,
        );
      }
    }
    expect(unguarded).toEqual([]);
  });

  it("the rule has teeth — sc-ac-snow is the row it was written for", () => {
    // MUTATION: snow's own weather armed nothing when this was filed, so strip
    // its gate's demand (by restoring the shipped banner) and the rule must
    // fire. Without this, the rule above would pass for the wrong reason —
    // every other ordering template is covered by a detector and would carry it
    // alone.
    const snow = withTitle("sc-ac-snow", "sc-acs-approach", "Приближи със зимна скорост");
    expect(WEATHER_LAMP_DETECTOR_AT_FILING[snow.conditions?.weather ?? "dry"]).toBeNull();
    // …and THE PRODUCT'S OWN ANSWER TODAY, beside it, so the line above can
    // never be read as current: the engine routes snow to a lamp duty of its
    // own (measured 2026-09-18 — «Движение в снеговалеж без светлини», 1
    // второстепенна т.). If this ever stops being "snow", the table above is
    // no longer merely historical and §2's premise must be re-derived.
    expect(lowBeamDuty({ snow: true })).toBe("snow");
    expect(lowBeamDuty({ snow: true, rain: true })).toBe("rain");
    expect(snow.conditions?.night ?? false).toBe(false);
    const gateGrades = compileScenario(snow, 3).objectives.some(
      (o) => (parseObjectiveParams(o) as { requireLamps?: string }).requireLamps !== undefined,
    );
    expect(gateGrades, "the shipped snow lesson graded its own lamp order nowhere").toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3 · The drives — both directions, on the templates' own recordings
// ---------------------------------------------------------------------------

describe("sc-ac-fog: the gate can now tell the lesson from its own counter-example", () => {
  it("the shadow — fog lamps and dipped beams on — still completes and passes", () => {
    const r = driveOutcome(specById("sc-ac-fog"), "ac-rain-v1", (d, onTick) =>
      recordScAcFogDrive(d, "shadow-correct", { onTick }),
    );
    expect(r.done("sc-acf-adapted")).toBe(true);
    expect(r.completedAll).toBe(true);
    expect(r.passed).toBe(true);
  });

  it("«Без фарове за мъгла» — the shipped demo — no longer collects the tick", () => {
    const r = driveOutcome(specById("sc-ac-fog"), "ac-rain-v1", (d, onTick) =>
      recordScAcFogDrive(d, "mistake-no-fog-lights", { onTick }),
    );
    expect(r.done("sc-acf-adapted")).toBe(false);
    expect(r.passed).toBe(false);
  });

  it("…and the IDENTICAL drive is credited the moment the fog lamps come on", () => {
    // The false-refusal half, on real data: same recording, same path, same
    // speeds, one boolean. If this ever goes red the gate has become a trap.
    const r = driveOutcome(
      specById("sc-ac-fog"),
      "ac-rain-v1",
      (d, onTick) => recordScAcFogDrive(d, "mistake-no-fog-lights", { onTick }),
      (t) => ({ ...t, fogLightsOn: true }),
    );
    expect(r.done("sc-acf-adapted")).toBe(true);
    expect(r.completedAll).toBe(true);
    expect(r.passed).toBe(true);
  });

  it("чл. 74 is a PAIR: dipped beams alone, with the fog lamps off, is refused", () => {
    const r = driveOutcome(
      specById("sc-ac-fog"),
      "ac-rain-v1",
      (d, onTick) => recordScAcFogDrive(d, "shadow-correct", { onTick }),
      (t) => ({ ...t, fogLightsOn: false }),
    );
    expect(r.done("sc-acf-adapted")).toBe(false);
  });

  it("the shadow driven dark fails — and collected every tick on the shipped banner", () => {
    const dark = (spec: ScenarioSpec, tweak?: LessonTweak) =>
      driveOutcome(spec, "ac-rain-v1", (d, onTick) =>
        recordScAcFogDrive(d, "shadow-correct", { onTick }), lampsOff, tweak,
      );
    const now = dark(specById("sc-ac-fog"));
    expect(now.done("sc-acf-adapted")).toBe(false);
    // THE MUTATION, and the whole reason this file exists: restore the one
    // string that shipped and the identical dark drive collects every tick on
    // the route again — the gate stops refusing it, and `completedAll` with it.
    const before = dark(
      withTitle("sc-ac-fog", "sc-acf-adapted", PRE_FIX_TITLES[0]![2]),
    );
    expect(before.done("sc-acf-adapted")).toBe(true);
    expect(before.completedAll).toBe(true);
    /**
     * WHERE THIS CASE USED TO END — `expect(before.passed).toBe(true)`, the
     * ИЗДЪРЖАН the row was filed about — AND WHY IT MOVED (ADR-009, 2026-09-18).
     *
     * Driving `sc-ac-fog` without its fog lamps is the mistake THIS LESSON
     * EXISTS TO TEACH: `FOG_LIGHTS_OFF_IN_FOG` is one of its two derived
     * targets, from its own ❌ demo «Без фарове за мъгла». So the ruling
     * refuses the lesson no matter what the banner says, and the old assertion
     * cannot be true again on any tree that carries ADR-009.
     *
     * THE TWO REFUSALS ARE INDEPENDENT, which is the whole reason this file can
     * go on being the mutation it was written to be: the gate's refusal is
     * about the TICK («done» above), the ruling's is about the VERDICT, and
     * neither is standing in for the other. Both are pinned, in both banner
     * states, so a regression in either is visible on its own.
     */
    expect(now.lessonMistakes).toEqual(["FOG_LIGHTS_OFF_IN_FOG"]);
    expect(before.lessonMistakes).toEqual(["FOG_LIGHTS_OFF_IN_FOG"]);
    expect(before.passed).toBe(false);
    // AND THE CERTIFICATE IS STILL MEASURED, with both refusals lifted at once
    // — the only state in which the shipped product's own answer to an unlit
    // car in fog can still be photographed. If this ever goes red, the „before"
    // column of this file's header has stopped describing anything and every
    // number in it must be re-taken.
    const beforeAdr009 = dark(
      withTitle("sc-ac-fog", "sc-acf-adapted", PRE_FIX_TITLES[0]![2]),
      stripLessonMistakeTargets,
    );
    expect(beforeAdr009.lessonMistakes).toEqual([]);
    expect(beforeAdr009.done("sc-acf-adapted")).toBe(true);
    expect(beforeAdr009.completedAll).toBe(true);
    expect(beforeAdr009.passed).toBe(true);
    // …and the points ADR-009 withholds, on one of doc 92 §9's 147 drives: the
    // второстепенна re-bill that used to settle this episode is dropped, so the
    // изпитен лист goes 1 т. → 0 т. while the card stays.
    expect(beforeAdr009.scored).toEqual(["FOG_LIGHTS_OFF_IN_FOG"]);
    expect(beforeAdr009.points).toBe(1);
    expect(before.scored).toEqual([]);
    expect(before.points).toBe(0);
  });
});

describe("sc-ac-snow: the one lamp duty nothing else in the product grades", () => {
  it("the shadow — dipped beams on — still completes and passes", () => {
    const r = driveOutcome(specById("sc-ac-snow"), "ac-rain-v1", (d, onTick) =>
      recordScAcSnowDrive(d, "shadow-correct", { onTick }),
    );
    expect(r.done("sc-acs-approach")).toBe(true);
    expect(r.completedAll).toBe(true);
    expect(r.passed).toBe(true);
  });

  it("the same drive with the lamps off is refused — and was certified before", () => {
    const dark = (spec: ScenarioSpec) =>
      driveOutcome(
        spec,
        "ac-rain-v1",
        (d, onTick) => recordScAcSnowDrive(d, "shadow-correct", { onTick }),
        (t) => ({ ...t, headlights: "off" }),
      );
    expect(dark(specById("sc-ac-snow")).done("sc-acs-approach")).toBe(false);
    const before = dark(withTitle("sc-ac-snow", "sc-acs-approach", PRE_FIX_TITLES[1]![2]));
    expect(before.done("sc-acs-approach")).toBe(true);
    // The full weight of the row: ИЗДЪРЖАН for an unlit car in a snowstorm.
    expect(before.completedAll).toBe(true);
    expect(before.passed).toBe(true);
    /**
     * AND ADR-009 DOES NOT RESCUE IT, which is asserted here rather than left
     * for a reader to wonder about (2026-09-18). `sc-ac-snow`'s one derived
     * target is `SPEED_TOO_FAST_FOR_CONDITIONS` — its own ❌ demo, «Кара „като
     * на сухо“ — 40 в снега» — and this drive is the shadow at winter speed
     * with one lamp field flipped, so it commits no target and the ruling has
     * nothing to say. The snow row therefore goes on measuring THE GATE, on
     * both sides, exactly as it did before the ADR. Were a future derivation to
     * give snow a lamp target, this line reds and names the reason instead of
     * `passed` above flipping with no explanation attached to it.
     *
     * WHAT IT DOES COST. This comment used to claim «no violation and no card
     * anywhere in the run», which was never measured and is false in both
     * banner states — and was false before ADR-009 too. The dark drive collects
     * HEADLIGHTS_OFF_IN_RAIN: a card AND 1 второстепенна точка, while still
     * reading ИЗДЪРЖАН. That strengthens the row rather than weakening it — the
     * sheet knew something was wrong and the verdict still certified the drive.
     *
     * AND THE CAUSE IS NOT THE TAPE, re-measured 2026-09-18 after a first
     * correction blamed one. All 3,103 ticks of this recording carry `snow:
     * true, rain: false` — `compile.ts` makes the three weathers exclusive, and
     * the tape agrees with its template — so the rain arm cannot fire and the
     * recording owes nothing. The bill comes from a DEDICATED snow duty in
     * `rules/engine.ts` (`snowNoLights`, added 2026-08-19), which reports under
     * the rain CODE with `detail: HEADLIGHTS_CONDITION_SNOW`: measured on this
     * drive as `detail "snow"`, «Движение в снеговалеж без светлини», ЗДвП чл.
     * 70, ал. 1. One switch, one bill, in the student's own weather.
     *
     * So §2's premise above is not a gap between the template and the tape; it
     * is a gap between the table this file mirrors and today's engine, and it
     * is named where that table is declared (`WEATHER_LAMP_DETECTOR_AT_FILING`)
     * rather than reported against anyone. The report filed against
     * `traces/scAcSnow` on the first pass is WITHDRAWN.
     */
    expect(before.lessonMistakes).toEqual([]);
    expect(before.scored).toEqual(["HEADLIGHTS_OFF_IN_RAIN"]);
    expect(before.points).toBe(1);
  });

  it("«къси» means къси: high beams in falling snow are refused, ЗДвП чл. 74", () => {
    // Not a technicality and not a false refusal: the banner names дипped beams,
    // instruction 1 orders them, and high beams bounce off the snow curtain
    // exactly as they do off fog. The student is refused for the thing the
    // sentence in front of him asks for.
    const r = driveOutcome(
      specById("sc-ac-snow"),
      "ac-rain-v1",
      (d, onTick) => recordScAcSnowDrive(d, "shadow-correct", { onTick }),
      (t) => ({ ...t, headlights: "high" }),
    );
    expect(r.done("sc-acs-approach")).toBe(false);
  });

  it("the speed half is untouched — the winter-speed demo still fails on SPEED", () => {
    // The gate gained a demand; it must not have lost one. The dry-habit 40 km/h
    // drive carries correct lamps, so only the cap can be refusing it.
    const r = driveOutcome(specById("sc-ac-snow"), "ac-rain-v1", (d, onTick) =>
      recordScAcSnowDrive(d, "mistake-dry-speed", { onTick }),
    );
    expect(r.done("sc-acs-approach")).toBe(false);
    const withGoodLamps = driveOutcome(
      specById("sc-ac-snow"),
      "ac-rain-v1",
      (d, onTick) => recordScAcSnowDrive(d, "mistake-dry-speed", { onTick }),
      (t) => ({ ...t, headlights: "low" }),
    );
    expect(withGoodLamps.done("sc-acs-approach")).toBe(false);
  });
});
