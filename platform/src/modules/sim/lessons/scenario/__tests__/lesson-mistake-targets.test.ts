/**
 * ADR-009 DERIVATION GUARDS — T8a–T8e (doc 92 §8.2, founder Ruling A 2026-09-17).
 *
 * `LessonSpec.lessonMistakeTargets` decides which acts cost a student the whole
 * lesson. Nothing in the product asks a human whether a target is right, and by
 * design nothing can: the set is DERIVED from the templates, so the only way it
 * goes wrong is silently — a co-fault added to a demo's `codeRefs` for an
 * unrelated reason becomes a pass-costing target in the same commit, and the
 * diff that does it does not mention ADR-009 anywhere. That is the whole reason
 * these five guards exist (doc 92 §1 fix 9).
 *
 *   T8a  the full table, pinned as a fixture, with the counts doc 92 §2.2 states
 *   T8b  every authored ruleConfig key classified BY VALUE, never by its name
 *   T8c  the three incidental markers and their four codes, exactly
 *   T8d  every `require*Clean` objective demand's codes are already targets
 *   T8e  every target code resolves to `teach-first-then-grade`
 *
 * REGENERATING THE FIXTURE (T8a) — `RECORD_LESSON_MISTAKE_TARGETS=1` in the env,
 * the `RECORD_TRACES=1` precedent this repository already uses for its recorded
 * drives. The generator is this test's own reader, so the fixture cannot drift
 * from what the assertion compares against; there is no second script to keep in
 * step. Re-record DELIBERATELY: a green run after a re-record proves nothing
 * except that the file was rewritten, which is why the diff belongs in the PR.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { LessonMistakeTarget } from "../../../contracts";
import { MAX_LESSON_MISTAKE_TARGETS } from "../../lessonMistake";
import { VIOLATIONS } from "../../../rules/catalog";
import {
  DETECTOR_OPT_IN_CODES,
  NON_ARMING_RULE_CONFIG_KEYS,
  armsDetector,
} from "../../../rules/detectorOptIns";
import { DEFAULT_RULE_CONFIG, type RuleEngineConfig } from "../../../rules/types";
import { getScenarioEvent } from "../../../scenarios/events";
import { scenarioForCode } from "../../../scenarios/mapping";
import { policyForViolation } from "../../../scenarios/policy";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel, ScenarioObjectiveSpec, ScenarioSpec } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_FILE = path.join(HERE, "lesson-mistake-targets.fixture.json");
const LEVELS: ScenarioLevel[] = [1, 2, 3, 4, 5];

interface Fixture {
  generatedBy: string;
  counts: Record<string, unknown>;
  rungs: Record<string, LessonMistakeTarget[] | null>;
}

// ---------------------------------------------------------------------------
// The live table: every template × every AUTHORED rung, straight off the real
// compiler. Not a re-derivation — `compileScenario` is what ships, and a guard
// that re-implemented the rule would agree with itself while the product drifted.
// ---------------------------------------------------------------------------

interface Rung {
  key: string;
  lesson: string;
  level: ScenarioLevel;
  examMode: boolean;
  targets: LessonMistakeTarget[] | null;
}

function liveRungs(): Rung[] {
  const out: Rung[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const level of LEVELS) {
      let lesson;
      try {
        lesson = compileScenario(spec, level);
      } catch {
        continue; // the template does not author this rung — compile.ts's own rule
      }
      out.push({
        key: `${spec.id}@L${level}`,
        lesson: spec.id,
        level,
        examMode: lesson.examMode === true,
        targets: lesson.lessonMistakeTargets === undefined ? null : [...lesson.lessonMistakeTargets],
      });
    }
  }
  return out;
}

const RUNGS = liveRungs();
const PRACTICE = RUNGS.filter((r) => !r.examMode);
const EXAM = RUNGS.filter((r) => r.examMode);

function countsOf(rungs: Rung[]): Record<string, unknown> {
  const hist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const lessonsWithTargets = new Set<string>();
  const codeLessons = new Map<string, Set<string>>();
  for (const r of rungs.filter((x) => !x.examMode)) {
    const n = r.targets?.length ?? 0;
    hist[n] = (hist[n] ?? 0) + 1;
    if (n > 0) lessonsWithTargets.add(r.lesson);
    for (const t of r.targets ?? []) {
      let set = codeLessons.get(t.code);
      if (set === undefined) codeLessons.set(t.code, (set = new Set()));
      set.add(r.lesson);
    }
  }
  const templates = new Set(rungs.map((r) => r.lesson));
  return {
    templates: templates.size,
    lessonsWithTargets: lessonsWithTargets.size,
    lessonsEmpty: templates.size - lessonsWithTargets.size,
    practiceRungs: rungs.filter((r) => !r.examMode).length,
    examRungs: rungs.filter((r) => r.examMode).length,
    examRungsWithTargets: rungs.filter((r) => r.examMode && r.targets !== null).length,
    practiceSizeHistogram: hist,
    distinctTargetCodes: codeLessons.size,
    codeFrequencyByLesson: Object.fromEntries(
      [...codeLessons.entries()]
        .map(([c, s]) => [c, s.size] as const)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
    ),
  };
}

// ---------------------------------------------------------------------------
// T8a — THE FULL TABLE
// ---------------------------------------------------------------------------

describe("T8a — the derived target table is pinned", () => {
  const live: Fixture["rungs"] = Object.fromEntries(RUNGS.map((r) => [r.key, r.targets]));
  const counts = countsOf(RUNGS);

  if (process.env.RECORD_LESSON_MISTAKE_TARGETS === "1") {
    fs.writeFileSync(
      FIXTURE_FILE,
      JSON.stringify(
        {
          generatedBy:
            "RECORD_LESSON_MISTAKE_TARGETS=1 npx vitest run " +
            "src/modules/sim/lessons/scenario/__tests__/lesson-mistake-targets.test.ts — " +
            "the real compileScenario over every template x every authored rung (ADR-009, doc 92 §8.2 T8a)",
          counts,
          rungs: live,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  }

  const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8")) as Fixture;

  it("every rung's target list equals the committed fixture", () => {
    const liveKeys = Object.keys(live).sort();
    const fixKeys = Object.keys(fixture.rungs).sort();
    expect(liveKeys, "the set of compiled rungs changed — a template gained or lost a level").toEqual(fixKeys);

    const drift: string[] = [];
    for (const key of liveKeys) {
      const a = JSON.stringify(live[key]);
      const b = JSON.stringify(fixture.rungs[key]);
      if (a !== b) drift.push(`  ${key}\n      now: ${a}\n      was: ${b}`);
    }
    expect(
      drift,
      drift.length === 0
        ? ""
        : `ADR-009: ${drift.length} rung(s) changed which mistakes cost the lesson.\n` +
          drift.join("\n") +
          "\n\nTWO REMEDIES, and they are not interchangeable:\n" +
          "  (1) the change is RIGHT — the template really does now teach this act. Re-record the fixture with " +
          "RECORD_LESSON_MISTAKE_TARGETS=1 and put the diff in the PR, so a human reads the new pass-costing code.\n" +
          "  (2) the change is a SIDE EFFECT — the code was added to a demo's codeRefs for another reason and is " +
          "not the act the lesson teaches. Add it to that demo's incidentalCodeRefs with the sentence from the " +
          "template's own source that justifies it (doc 92 §2.3 R2), and leave this fixture alone.",
    ).toEqual([]);
  });

  it("the counts are the ones doc 92 §2.2 measured", () => {
    // Stated as literals rather than read off the fixture: the fixture is
    // re-recordable, and a count that re-recorded with it would agree with
    // whatever happened. These five are the design's published numbers.
    expect(counts.templates).toBe(167);
    expect(counts.lessonsWithTargets).toBe(105);
    expect(counts.lessonsEmpty).toBe(62);
    expect(counts.practiceRungs).toBe(646);
    expect(counts.examRungs).toBe(162);
    expect(counts.practiceSizeHistogram).toEqual({ 0: 243, 1: 260, 2: 120, 3: 19, 4: 4 });
    expect(counts.distinctTargetCodes).toBe(38);
  });

  it("no exam rung carries the field (founder Ruling A: exam mode is unchanged)", () => {
    const offenders = EXAM.filter((r) => r.targets !== null).map((r) => r.key);
    expect(offenders, "an exam rung acquired ADR-009 targets — the practical-exam verdict must be untouched").toEqual(
      [],
    );
    expect(EXAM.length).toBe(162);
  });

  it("no lesson's target set differs between its own practice rungs", () => {
    const byLesson = new Map<string, Set<string>>();
    for (const r of PRACTICE) {
      let sigs = byLesson.get(r.lesson);
      if (sigs === undefined) byLesson.set(r.lesson, (sigs = new Set()));
      sigs.add(JSON.stringify(r.targets));
    }
    const varying = [...byLesson.entries()].filter(([, s]) => s.size > 1).map(([l]) => l);
    // Not a rule the derivation enforces — it reads the MERGED ruleConfig, so a
    // rung that armed a detector its template did not WOULD differ, legitimately.
    // It is pinned because it is a measurement (doc 92 §2.2) that every surface
    // quietly relies on when it says «this lesson's mistakes» without a rung.
    expect(varying, "a rung now arms a detector its siblings do not — check every surface that names the set without a rung").toEqual([]);
  });

  it("no rung is at or over the cap, so the cap has headroom", () => {
    const worst = Math.max(...PRACTICE.map((r) => r.targets?.length ?? 0));
    expect(worst).toBe(4);
    expect(worst).toBeLessThan(MAX_LESSON_MISTAKE_TARGETS);
  });
});

// ---------------------------------------------------------------------------
// T8b — CLASSIFY EVERY AUTHORED ruleConfig KEY, BY VALUE
// ---------------------------------------------------------------------------

function authoredRuleConfigKeys(): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  const add = (k: string, where: string) => {
    const list = uses.get(k) ?? [];
    list.push(where);
    uses.set(k, list);
  };
  for (const spec of SCENARIO_TEMPLATES) {
    for (const [k, v] of Object.entries(spec.ruleConfig ?? {})) add(k, `${spec.id}=${JSON.stringify(v)}`);
    for (const rung of spec.levels ?? []) {
      for (const [k, v] of Object.entries(rung.ruleConfig ?? {})) add(k, `${spec.id}@L${rung.level}=${JSON.stringify(v)}`);
    }
  }
  return uses;
}

describe("T8b — a ruleConfig key is classified by its VALUE, never by its name", () => {
  it("every key whose DEFAULT_RULE_CONFIG value is false has a DETECTOR_OPT_IN_CODES row", () => {
    const defaultFalse = Object.entries(DEFAULT_RULE_CONFIG)
      .filter(([, v]) => v === false)
      .map(([k]) => k)
      .sort();
    const unmapped = defaultFalse.filter((k) => !(k in DETECTOR_OPT_IN_CODES));
    expect(
      unmapped,
      `a detector ships OFF and nothing says which codes it arms, so a template that turns it on gets no ` +
        `ADR-009 target for the fault it exists to teach. Add a row to rules/detectorOptIns.ts: ${unmapped.join(", ")}`,
    ).toEqual([]);
    expect(defaultFalse).toEqual([
      "followRainAwareEnabled",
      "handbrakeMoveOffEnabled",
      "junctionScanObservationEnabled",
      "leadClosingEnabled",
      "moveOffObservationEnabled",
      "needlessStopEnabled",
      "turnObservationEnabled",
    ]);
  });

  it("every DETECTOR_OPT_IN_CODES key really does default to false, and every code is catalogued", () => {
    const wrongDefault: string[] = [];
    const uncatalogued: string[] = [];
    for (const [key, codes] of Object.entries(DETECTOR_OPT_IN_CODES)) {
      if (DEFAULT_RULE_CONFIG[key as keyof RuleEngineConfig] !== false) {
        wrongDefault.push(`${key} (default ${JSON.stringify(DEFAULT_RULE_CONFIG[key as keyof RuleEngineConfig])})`);
      }
      for (const code of codes ?? []) {
        if (!(code in VIOLATIONS)) uncatalogued.push(`${key} -> ${code}`);
      }
    }
    expect(wrongDefault, "a row here claims to ARM a detector that is already on — see townCrawlEnabled").toEqual([]);
    // The type already says ViolationCode. A type is not a runtime check, and
    // this repository has shipped three source scanners that were green and blind.
    expect(uncatalogued, "a target code that is not in the catalogue can never match a graded event").toEqual([]);
  });

  it("NON_ARMING_RULE_CONFIG_KEYS holds only keys that do NOT default to false", () => {
    const wrong = [...NON_ARMING_RULE_CONFIG_KEYS].filter(
      (k) => DEFAULT_RULE_CONFIG[k] === false || k in DETECTOR_OPT_IN_CODES,
    );
    expect(wrong, "a key cannot be both arming and non-arming").toEqual([]);
  });

  it("every ruleConfig key any template authors is classified — an unknown key fails", () => {
    const authored = authoredRuleConfigKeys();
    const unclassified = [...authored.keys()]
      .filter((k) => !(k in DETECTOR_OPT_IN_CODES) && !NON_ARMING_RULE_CONFIG_KEYS.has(k as keyof RuleEngineConfig))
      .sort();
    expect(
      unclassified,
      `a template authors a ruleConfig key ADR-009 has never been told about: ` +
        unclassified.map((k) => `${k} (default ${JSON.stringify(DEFAULT_RULE_CONFIG[k as keyof RuleEngineConfig])}, ` +
          `used by ${(authored.get(k) ?? []).join(", ")})`).join("; ") +
        `. Decide by its DEFAULT value: false means it ARMS a detector — add it to DETECTOR_OPT_IN_CODES with the ` +
        `codes it puts in play; anything else TUNES or DISARMS one — add it to NON_ARMING_RULE_CONFIG_KEYS. ` +
        `Do not decide by how it is spelled.`,
    ).toEqual([]);
    // The 11 keys the 167 templates actually author (doc 92 §3.3 meta.ruleConfigKeysAuthored).
    expect([...authored.keys()].sort()).toEqual([
      "conditionSpeedNightFactor",
      "followMinSpeedKmh",
      "followRainAwareEnabled",
      "handbrakeMoveOffEnabled",
      "harshBrakeDecelMps2",
      "hesitationClearGapM",
      "junctionScanObservationEnabled",
      "leadClosingEnabled",
      "moveOffObservationEnabled",
      "needlessStopEnabled",
      "townCrawlEnabled",
    ]);
  });

  it("the naming convention the derived design used would get townCrawlEnabled backwards", () => {
    // THE REFUTATION, kept executable (doc 92 §1 fix 8). `townCrawlEnabled` is
    // spelled exactly like the seven arming keys and ships ON; `sc-ac-ice` writes
    // `false` to DISARM it. A suffix rule would have read that as arming one and
    // hung «the lesson is not taken» on a detector the template switched off.
    expect(DEFAULT_RULE_CONFIG.townCrawlEnabled).toBe(true);
    expect(NON_ARMING_RULE_CONFIG_KEYS.has("townCrawlEnabled")).toBe(true);
    expect(armsDetector("townCrawlEnabled", true)).toBe(false);
    expect(armsDetector("townCrawlEnabled", false)).toBe(false);
    // …and the positive control, so this is not a test that only ever says "no".
    expect(armsDetector("needlessStopEnabled", true)).toBe(true);
    expect(armsDetector("needlessStopEnabled", false)).toBe(false);
    expect(armsDetector("needlessStopEnabled", undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T8c — THE THREE MARKERS
// ---------------------------------------------------------------------------

describe("T8c — incidentalCodeRefs is exactly three demos and four codes", () => {
  const authored: Record<string, string[]> = {};
  for (const spec of SCENARIO_TEMPLATES) {
    for (const demo of spec.mistakes ?? []) {
      if (demo.incidentalCodeRefs === undefined) continue;
      const tape = (demo.traceRef.path.split("/").pop() ?? "").replace(/\.trace\.json$/, "");
      authored[`${spec.id}/${tape}`] = [...demo.incidentalCodeRefs];
    }
  }

  it("the markers are the three doc 92 §2.3 R2 names, and no others", () => {
    expect(
      authored,
      "a marker was added or removed. Each one is a decision that a code the author put on a mistake demo does " +
        "NOT cost the lesson, and doc 92 §2.3 R2 admits it only where the template's own source says the code is " +
        "a side effect. Add the sentence that justifies it beside the field, then update this pin.",
    ).toEqual({
      "sc-vp-police-stop/mistake-drive-past": ["NOT_KEEPING_RIGHT"],
      "sc-vp-telltale/mistake-ignore": ["SPEEDING_OVER_LIMIT"],
      "sc-ln-turn-lane-arrows/mistake-left-from-through": ["TURN_WITHOUT_INDICATOR", "POOR_LANE_KEEPING"],
    });
    expect(Object.values(authored).flat()).toHaveLength(4);
  });

  it("each marked code is really gone from its lesson's targets, and the act beside it is not", () => {
    const targetsOf = (lesson: string) =>
      (PRACTICE.find((r) => r.lesson === lesson)?.targets ?? []).map((t) => t.code);
    // The wiring, not just the data: a marker that failed to reach the
    // derivation would leave this pin green and the product unchanged.
    // HARSH_BRAKING_NO_CAUSE stays, and stays on purpose: it is the second
    // demo's own act («Паника в лентата»), the R3 stand-in doc 92 §2.2 lists for
    // this lesson. A marker removes ONE code from ONE demo, never a code from
    // the lesson.
    expect(targetsOf("sc-vp-police-stop")).toEqual(["HARSH_BRAKING_NO_CAUSE", "POLICE_STOP_SIGNAL_IGNORED"]);
    expect(targetsOf("sc-vp-telltale")).toEqual(["HARSH_BRAKING_NO_CAUSE", "WARNING_LAMP_IGNORED"]);
    expect(targetsOf("sc-ln-turn-lane-arrows")).toEqual([
      "LANE_CHANGE_WITHOUT_INDICATOR",
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
      "WRONG_LANE_FOR_DIRECTION",
    ]);
  });

  it("the marked codes are still real codes on their demos (never a way to smuggle a typo)", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      for (const demo of spec.mistakes ?? []) {
        for (const code of demo.incidentalCodeRefs ?? []) {
          expect(demo.codeRefs, `${spec.id}: incidental "${code}" is not on the demo`).toContain(code);
          expect(code in VIOLATIONS, `${spec.id}: incidental "${code}" is not a catalogue code`).toBe(true);
        }
        expect(
          (demo.incidentalCodeRefs ?? []).length,
          `${spec.id}: a demo cannot be entirely incidental`,
        ).toBeLessThan(demo.codeRefs.length);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// T8d — OBJECTIVE DEMANDS ARE ALREADY COVERED
// ---------------------------------------------------------------------------

/**
 * Every `require*` key a scenario objective can author, and the catalogue codes
 * it actually consults — read out of `lessons/objectives.ts`, not guessed:
 *
 *   requireRestClean      restCleanHonoured        banZone -> ILLEGAL_STOP_IN_BAN_ZONE,
 *                                                  railBand -> RAIL_CROSSING_VIOLATION
 *   requireSolidLineClean solidLineCleanHonoured   crossedSolidLineInRun
 *   requireBrakingClean   brakingCleanHonoured     harshBrakeNoCauseInRun + stoppedWithoutCauseInRun
 *   requireGreenStartClean greenStartCleanHonoured hesitatedAtGreenInRun
 *   requireSpeedClean     speedCleanHonoured       overTheCeilingInRun = SPEED_FAULT_CODES
 *                                                  (engine.ts:1219-1223)
 *
 * `null` means the demand is not about a violation code at all — it reads a
 * positive fact or a staged outcome — and is listed so that "absent from this
 * table" can only ever mean "nobody has looked at it", which is what makes the
 * unknown-key arm of this test bite.
 */
const DEMAND_CODES: Record<string, readonly string[] | null> = {
  requireBrakingClean: ["HARSH_BRAKING_NO_CAUSE", "STOPPED_WITHOUT_CAUSE"],
  requireGreenStartClean: ["HESITATION_AT_GREEN"],
  requireSolidLineClean: ["CROSSED_SOLID_LINE"],
  requireSpeedClean: ["SPEEDING_OVER_LIMIT", "SPEEDING_DANGEROUS", "SPEED_TOO_FAST_FOR_CONDITIONS"],
  requireRestClean: null, // value-dependent, resolved below
  requireFullStop: null, // qualifyingStopCurrent — a positive engine fact, no code
  requireNoContact: null, // a staged contact outcome, not a catalogue conviction
  requireRailClear: null, // the rail band's own staged outcome
  requireRedMet: null, // which signal phase the approach met
  requireKerbwardM: null, // a distance to the kerb
};

const REST_CLEAN_CODES: Record<string, string> = {
  banZone: "ILLEGAL_STOP_IN_BAN_ZONE",
  railBand: "RAIL_CROSSING_VIOLATION",
};

function objectivesOf(spec: ScenarioSpec): ScenarioObjectiveSpec[] {
  const out: ScenarioObjectiveSpec[] = [...(spec.success ?? [])];
  for (const rung of spec.levels ?? []) {
    const r = rung as unknown as Record<string, ScenarioObjectiveSpec[] | undefined>;
    for (const field of ["success", "successAdd", "successOverride"]) {
      for (const o of r[field] ?? []) out.push(o);
    }
  }
  return out;
}

describe("T8d — every objective demand's codes are already ADR-009 targets", () => {
  const demandsByLesson = new Map<string, Map<string, Set<string>>>(); // lesson -> key -> values
  const unknownKeys = new Set<string>();

  for (const spec of SCENARIO_TEMPLATES) {
    for (const o of objectivesOf(spec)) {
      for (const [k, v] of Object.entries((o.params ?? {}) as unknown as Record<string, unknown>)) {
        if (!k.startsWith("require")) continue;
        if (!(k in DEMAND_CODES)) {
          unknownKeys.add(`${k} (on ${spec.id}.${o.id})`);
          continue;
        }
        let byKey = demandsByLesson.get(spec.id);
        if (byKey === undefined) demandsByLesson.set(spec.id, (byKey = new Map()));
        let vals = byKey.get(k);
        if (vals === undefined) byKey.set(k, (vals = new Set()));
        vals.add(String(v));
      }
    }
  }

  it("an unknown require* demand key fails", () => {
    expect(
      [...unknownKeys].sort(),
      "a new objective demand can gate a lesson on a violation code ADR-009 has never heard of. Add it to " +
        "DEMAND_CODES with the codes its honoured-helper in lessons/objectives.ts actually reads, or with null " +
        "and the reason it reads no code at all.",
    ).toEqual([]);
    // The ten keys today's 167 templates author. A shrinking list is as
    // interesting as a growing one: it means a demand stopped being authored.
    const seen = new Set<string>();
    for (const byKey of demandsByLesson.values()) for (const k of byKey.keys()) seen.add(k);
    expect([...seen].sort()).toEqual([
      "requireBrakingClean",
      "requireFullStop",
      "requireGreenStartClean",
      "requireKerbwardM",
      "requireNoContact",
      "requireRailClear",
      "requireRedMet",
      "requireRestClean",
      "requireSolidLineClean",
      "requireSpeedClean",
    ]);
  });

  it("every coachable code a demand gates on is a target of the same lesson", () => {
    const missing: string[] = [];
    const excludedBySeverity = new Set<string>();
    for (const [lesson, byKey] of demandsByLesson) {
      const targets = new Set((PRACTICE.find((r) => r.lesson === lesson)?.targets ?? []).map((t) => t.code));
      for (const [key, values] of byKey) {
        let codes: string[];
        if (key === "requireRestClean") {
          codes = [...values].map((v) => REST_CLEAN_CODES[v] ?? `UNKNOWN_REST_DEMAND:${v}`);
        } else {
          codes = [...(DEMAND_CODES[key] ?? [])];
        }
        for (const code of codes) {
          const v = VIOLATIONS[code as keyof typeof VIOLATIONS];
          expect(v, `${lesson}.${key} names "${code}", which is not a catalogue code`).toBeDefined();
          // ADR-009 filters опасна and terminating codes ON PURPOSE (doc 92 §2.1):
          // they are billed on first sight already, so there is nothing for the
          // ruling to change. SPEEDING_DANGEROUS and RAIL_CROSSING_VIOLATION are
          // the two that reach here, and the spec names the first explicitly.
          if (v.severityClass === "opasna" || v.terminateSession === true) {
            excludedBySeverity.add(code);
            continue;
          }
          if (!targets.has(code)) missing.push(`${lesson}.${key} -> ${code}`);
        }
      }
    }
    expect(
      missing,
      "an objective REFUSES its banner for a code that does not cost the lesson. The student is told he failed " +
        "the task and told the lesson counts — two sentences about one act that disagree (doc 92 §2.1: " +
        "demandNotCovered must stay 0).",
    ).toEqual([]);
    // Pinned so the exemption cannot quietly grow into a place to park a code.
    expect([...excludedBySeverity].sort()).toEqual(["RAIL_CROSSING_VIOLATION", "SPEEDING_DANGEROUS"]);
  });
});

// ---------------------------------------------------------------------------
// T8e — EVERY TARGET IS A TEACH-FIRST CODE
// ---------------------------------------------------------------------------

describe("T8e — every target code resolves to teach-first-then-grade", () => {
  it("38 of 38, through the real policy resolution", () => {
    const codes = new Set<string>();
    for (const r of PRACTICE) for (const t of r.targets ?? []) codes.add(t.code);
    expect(codes.size).toBe(38);

    const wrong: string[] = [];
    for (const code of [...codes].sort()) {
      const v = VIOLATIONS[code as keyof typeof VIOLATIONS];
      // The same three steps `scenarios/coach.ts coachStep` takes (:230, :269,
      // :283-285) and `resolveEncounter` finishes (policy.ts:101). Written out
      // rather than driven through coachStep so the failure names the step.
      const scenarioId = scenarioForCode(code) ?? undefined;
      const mapped = scenarioId === undefined ? undefined : getScenarioEvent(scenarioId)?.policyDefault;
      const effective =
        policyForViolation(v.severityClass, v.terminateSession === true, mapped) ?? mapped ?? "teach-first-then-grade";
      if (effective !== "teach-first-then-grade") {
        wrong.push(`${code} (${v.severityClass}${scenarioId ? ` via ${scenarioId}` : ""}) -> ${effective}`);
      }
    }
    expect(
      wrong,
      "Ruling A cannot hold for this code: decide before shipping. ADR-009 §3.4b says a target's FIRST " +
        "occurrence is always taught — free, with a card. A code that resolves to always-grade is billed on " +
        "first sight instead, so the card the ruling promises never appears; one that resolves to learn-only is " +
        "never graded at all, so the lesson would be lost for an act the engine treats as illustrative. Either " +
        "mark it incidental on its demo, or change its mapping deliberately.\n  " + wrong.join("\n  "),
    ).toEqual([]);
  });

  it("no target is опасна or session-terminating (the filter that makes the line above complete)", () => {
    const bad: string[] = [];
    for (const r of PRACTICE) {
      for (const t of r.targets ?? []) {
        const v = VIOLATIONS[t.code as keyof typeof VIOLATIONS];
        if (v.severityClass === "opasna" || v.terminateSession === true) bad.push(`${r.key} -> ${t.code}`);
      }
    }
    expect(bad, "a consequence is not the act the lesson teaches — see lessonMistakeTargets.ts").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The cap and the uncatalogued-code refusal — the two arms of the derivation
// that today's content cannot reach, driven directly.
// ---------------------------------------------------------------------------

describe("the derivation refuses rather than truncates", () => {
  it("more than MAX_LESSON_MISTAKE_TARGETS targets is a compile error", async () => {
    const { deriveLessonMistakeTargets } = await import("../lessonMistakeTargets");
    const codes = [
      "SPEEDING_OVER_LIMIT",
      "POOR_LANE_KEEPING",
      "HARSH_BRAKING_NO_CAUSE",
      "NOT_KEEPING_RIGHT",
      "CENTER_LINE_TOUCHED",
      "STOP_LINE_OVERSHOOT",
      "HESITATION_AT_GREEN",
      "ENGINE_STALLED",
      "HANDBRAKE_LEFT_ON",
    ];
    expect(codes.length).toBeGreaterThan(MAX_LESSON_MISTAKE_TARGETS);
    const spec = {
      id: "sc-synthetic-cap",
      mistakes: [{ traceRef: { path: "x.trace.json" }, titleBg: "t", whatWentWrongBg: "w", codeRefs: codes }],
    } as unknown as ScenarioSpec;
    expect(() => deriveLessonMistakeTargets(spec, 3, {}, false)).toThrow(/MAX_LESSON_MISTAKE_TARGETS/);
    // …and one fewer compiles, so the test is measuring the cap and not the fixture.
    const ok = {
      ...spec,
      mistakes: [{ ...spec.mistakes[0], codeRefs: codes.slice(0, MAX_LESSON_MISTAKE_TARGETS) }],
    } as unknown as ScenarioSpec;
    expect(deriveLessonMistakeTargets(ok, 3, {}, false)).toHaveLength(MAX_LESSON_MISTAKE_TARGETS);
  });

  it("an uncatalogued code is refused, not silently carried", async () => {
    const { deriveLessonMistakeTargets } = await import("../lessonMistakeTargets");
    // The exact failure doc 92 addendum 1 item 3 measured: one transposed pair
    // of letters, and ADR-009 is stripped from the rung with nothing to see.
    const spec = {
      id: "sc-synthetic-typo",
      mistakes: [
        {
          traceRef: { path: "x.trace.json" },
          titleBg: "t",
          whatWentWrongBg: "w",
          codeRefs: ["HARSH_BRAKIGN_NO_CAUSE"],
        },
      ],
    } as unknown as ScenarioSpec;
    expect(() => deriveLessonMistakeTargets(spec, 3, {}, false)).toThrow(/HARSH_BRAKIGN_NO_CAUSE/);
  });

  it("a THEO-3 sandbox carries no field — the mistake IS its assignment", () => {
    // The `delete lesson.lessonMistakeTargets` in compileScenario's
    // mistakeExperience block. Without this case that line has no reader, and a
    // dead line in a rollback path is how a sandbox ends up telling the student
    // to commit a mistake and then refusing him the lesson for obeying.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-follow-tailgater")!;
    const normal = compileScenario(spec, 3);
    expect(normal.lessonMistakeTargets?.length).toBeGreaterThan(0);
    const sandbox = compileScenario(spec, 3, { mistakeExperience: { mistakeIndex: 0 } });
    expect(sandbox.mistakeExperience).toBeDefined();
    expect(sandbox.lessonMistakeTargets).toBeUndefined();
    expect("lessonMistakeTargets" in sandbox).toBe(false);
    // Every template's every sandbox, not just the one with the richest demos.
    for (const s of SCENARIO_TEMPLATES) {
      for (let i = 0; i < s.mistakes.length; i++) {
        const lesson = compileScenario(s, s.levels[0].level, { mistakeExperience: { mistakeIndex: i } });
        expect(lesson.lessonMistakeTargets, `${s.id} sandbox ${i}`).toBeUndefined();
      }
    }
  });

  it("an exam rung derives nothing even when its demos are full of coachable codes", async () => {
    const { deriveLessonMistakeTargets } = await import("../lessonMistakeTargets");
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-follow-tailgater")!;
    expect(deriveLessonMistakeTargets(spec, 4, { needlessStopEnabled: true }, true)).toEqual([]);
    expect(deriveLessonMistakeTargets(spec, 4, { needlessStopEnabled: true }, false).length).toBeGreaterThan(0);
  });
});
