/**
 * THE ANTI-THEATRE GATE — „what does this rung ADD?", asked of the compiler.
 *
 * The wave this file was written in caught the project certifying itself:
 * eighteen scenarios closed a graded lights fault by writing Bulgarian into
 * `ScenarioSpec.instructionsBg` — a field `compileScenario` dropped, no `.tsx`
 * read, and `world/referents.ts` consulted as PROOF the duty had been stated.
 * The fix and the gate read the same unrendered string, so the gate went green
 * while the student was still told nothing.
 *
 * Every assertion below therefore reads `compileScenario`'s OUTPUT — the same
 * object `createLessonSession` runs and `LessonPlayShell` renders — and never
 * the authored spec. `LevelComplication.adds` is a CLAIM; the compiled
 * difference between two rungs is the EVIDENCE; a claim without evidence fails
 * here, and no amount of writing anywhere can satisfy it.
 *
 * The four rules:
 *  1. NO THEATRE      — every `adds` token is a real compiled difference from
 *                       the next lower authored rung.
 *  2. NO SILENT TAX   — a rung that adds something announces it, in the field
 *                       that is rendered, as the step the student cannot skip.
 *  3. NO DARK DUTY    — a rung whose environment sets night/rain/fog names
 *                       светлини/фарове in that same rendered string (the L10
 *                       predicate of world/referents.ts, pre-checked locally so
 *                       the failure names the template instead of a census).
 *  4. NO PUNISHMENT   — a complication rung never makes a lesson harder to
 *                       FINISH: gates, caps and objective ids are untouched.
 */

import { describe, expect, it } from "vitest";
import {
  compileScenario,
  complicationBriefingText,
  resolveScenarioComplication,
  resolveScenarioRubric,
  EXAM_PROTOCOL_COMPLICATION,
} from "../compile";
import { l5Fog, l5Night, l5Wet } from "../complications";
import { SCENARIO_TEMPLATES, SC_PARK_PERP_REV } from "../templates";
import { validateScenarioSpec } from "../validate";
import type { LessonSpec } from "../../../contracts";
import type { RungAddition, ScenarioLevel, ScenarioSpec } from "../types";

const LIGHTS_COPY = /светлин|фаров/i;

/**
 * The negative control for `validateScenarioSpec`'s citation check: a string
 * that is deliberately NOT a citation. A NAMED CONSTANT rather than a literal
 * at the `lawRef:` site, because `modules/sim/__tests__/law-citations.test.ts`
 * scans the literals at those sites and resolves them against `content/law` —
 * a specimen that exists here to be rejected would read there as a defect.
 * One use, one name, and the name says what it is.
 */
const NOT_A_CITATION = "the highway code";

/** Every rung of every template, paired with the authored rung BELOW it. */
function rungPairs(spec: ScenarioSpec): Array<{ level: ScenarioLevel; below: ScenarioLevel }> {
  const out: Array<{ level: ScenarioLevel; below: ScenarioLevel }> = [];
  for (let i = 1; i < spec.levels.length; i += 1) {
    out.push({ level: spec.levels[i].level, below: spec.levels[i - 1].level });
  }
  return out;
}

const physicsFlags = (l: LessonSpec) =>
  new Set(Object.entries(l.physics ?? {}).filter(([, v]) => v === true).map(([k]) => k));
const environmentKeys = (l: LessonSpec) =>
  new Set(Object.entries(l.environment ?? {}).filter(([, v]) => v !== undefined && v !== false).map(([k]) => k));

/**
 * THE EVIDENCE — what actually changed between two COMPILED lessons.
 *
 * Deliberately one-directional: only differences that make the higher rung
 * carry MORE than the lower one count. A rung that removes the shadow car is
 * not an addition, and „the ladder can only ever remove aids" is the defect,
 * not the fix.
 */
function measuredAdditions(spec: ScenarioSpec, level: ScenarioLevel, below: ScenarioLevel): Set<RungAddition> {
  const hi = compileScenario(spec, level);
  const lo = compileScenario(spec, below);
  const found = new Set<RungAddition>();

  if (
    (hi.traffic?.vehicleCount ?? 0) > (lo.traffic?.vehicleCount ?? 0) ||
    (hi.traffic?.pedestrianCount ?? 0) > (lo.traffic?.pedestrianCount ?? 0)
  ) {
    found.add("traffic");
  }
  const envHi = environmentKeys(hi);
  const envLo = environmentKeys(lo);
  if ([...envHi].some((k) => !envLo.has(k))) found.add("weather");
  const phHi = physicsFlags(hi);
  const phLo = physicsFlags(lo);
  if ([...phHi].some((k) => !phLo.has(k))) found.add("grip");
  if ((hi.stagedEvents?.length ?? 0) > (lo.stagedEvents?.length ?? 0)) found.add("actor");
  if (JSON.stringify(hi.ruleConfig ?? null) !== JSON.stringify(lo.ruleConfig ?? null)) found.add("rules");
  if ((hi.examMode === true && lo.examMode !== true) || (hi.vehicleStart === "cold" && lo.vehicleStart !== "cold")) {
    found.add("protocol");
  }

  // Rubric: a MEASURED component added, or an existing one tightened. Par time
  // is excluded on purpose — doc 76 §6 makes it informational, and a ladder
  // built out of a line of text is the ladder the founder already rejected.
  const rHi = resolveScenarioRubric(spec, level);
  const rLo = resolveScenarioRubric(spec, below);
  const measured = (r: ReturnType<typeof resolveScenarioRubric>) =>
    JSON.stringify({ p: r?.placement ?? null, e: r?.economy ?? null, o: r?.observation ?? null });
  if (measured(rHi) !== measured(rLo)) {
    const added = (rHi?.placement && !rLo?.placement) || (rHi?.economy && !rLo?.economy) || (rHi?.observation && !rLo?.observation);
    const tightened =
      rHi?.economy !== undefined &&
      rLo?.economy !== undefined &&
      (rHi.economy.attemptsFor3Stars < rLo.economy.attemptsFor3Stars ||
        rHi.economy.attemptsFor2Stars < rLo.economy.attemptsFor2Stars);
    if (added || tightened) found.add("rubric");
  }
  return found;
}

// ---------------------------------------------------------------------------
// 1. NO THEATRE
// ---------------------------------------------------------------------------

describe("a complication must be REAL — checked against the compiled lesson", () => {
  it("every declared addition is a difference the compiler actually produced", () => {
    const theatre: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const { level, below } of rungPairs(spec)) {
        const c = resolveScenarioComplication(spec, level);
        if (!c) continue;
        const real = measuredAdditions(spec, level, below);
        for (const claim of c.adds) {
          if (!real.has(claim)) {
            theatre.push(
              `${spec.id}@L${level} claims "${claim}" over L${below}, but the compiled lessons differ only in [${[...real].join(", ") || "nothing"}]`,
            );
          }
        }
      }
    }
    expect(theatre, theatre.join("\n")).toEqual([]);
  });

  it("a rung that adds nothing may not claim a complication", () => {
    const empty: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const { level, below } of rungPairs(spec)) {
        if (!resolveScenarioComplication(spec, level)) continue;
        if (measuredAdditions(spec, level, below).size === 0) {
          empty.push(`${spec.id}@L${level} announces a complication it does not have`);
        }
      }
    }
    expect(empty, empty.join("\n")).toEqual([]);
  });

  it("the check has teeth: a fabricated claim fails", () => {
    const s = JSON.parse(JSON.stringify(SC_PARK_PERP_REV)) as ScenarioSpec;
    const l5 = s.levels.find((l) => l.level === 5)!;
    l5.conditions = undefined;
    l5.physics = undefined;
    l5.traffic = undefined;
    l5.stagedAdd = undefined;
    l5.rubric = undefined;
    l5.ruleConfig = undefined;
    l5.complication = {
      adds: ["grip"],
      titleBg: "Мокър паваж",
      coachBg: "Настилката е мокра и спирачният път расте — карай по-бавно и с двойна дистанция.",
    };
    expect(measuredAdditions(s, 5, 4).has("grip")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. NO SILENT TAX — it is announced where the student reads it
// ---------------------------------------------------------------------------

describe("the complication is DELIVERED, not stored", () => {
  it("is briefing step 1 of its rung, in the field LessonPlayShell renders", () => {
    const missing: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const c = resolveScenarioComplication(spec, rung.level);
        if (!c) continue;
        const brief = compileScenario(spec, rung.level).briefingBg ?? [];
        const first = brief[0];
        if (!first || first.textBg !== complicationBriefingText(rung.level, c)) {
          missing.push(`${spec.id}@L${rung.level}: briefing step 1 is not the complication`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("never swallows the drill's own numbered steps — they follow, renumbered 1..n", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level);
        const brief = lesson.briefingBg!;
        const extra = resolveScenarioComplication(spec, rung.level) ? 1 : 0;
        expect(brief.length, `${spec.id}@L${rung.level}`).toBe(spec.instructionsBg.length + extra);
        expect(brief.map((s) => s.n), `${spec.id}@L${rung.level}`).toEqual(
          brief.map((_, i) => i + 1),
        );
        expect(brief.slice(extra).map((s) => s.textBg), `${spec.id}@L${rung.level}`).toEqual(
          spec.instructionsBg.map((s) => s.textBg),
        );
      }
    }
  });

  it("every rung that ADDS something announces it (no unexplained difficulty)", () => {
    const silent: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const { level, below } of rungPairs(spec)) {
        const real = measuredAdditions(spec, level, below);
        if (real.size === 0) continue;
        if (!resolveScenarioComplication(spec, level)) {
          silent.push(`${spec.id}@L${level} adds [${[...real].join(", ")}] over L${below} and says nothing`);
        }
      }
    }
    expect(silent, `${silent.length} unexplained rungs:\n${silent.join("\n")}`).toEqual([]);
  });

  it("the exam rung explains the exam — on every template that has one", () => {
    let examRungs = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      for (const { level } of rungPairs(spec)) {
        if (compileScenario(spec, level).examMode !== true) continue;
        examRungs += 1;
        const c = resolveScenarioComplication(spec, level)!;
        expect(c, `${spec.id}@L${level}`).toBeTruthy();
        expect(c.adds, `${spec.id}@L${level}`).toContain("protocol");
      }
    }
    // Every shipped template authors L4; none of them explained it before.
    expect(examRungs).toBeGreaterThanOrEqual(160);
    expect(EXAM_PROTOCOL_COMPLICATION.lawRef).toMatch(/Наредба/);
  });
});

// ---------------------------------------------------------------------------
// 3. NO DARK DUTY — the L10 predicate, pre-checked locally
// ---------------------------------------------------------------------------

describe("a lamp duty is stated in the same breath it becomes gradeable", () => {
  it("every rung whose environment is night/rain/fog names светлини/фарове in its briefing", () => {
    const dark: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level);
        const env = lesson.environment;
        if (!env || !(env.timeOfDay === "night" || env.rain || env.fog)) continue;
        if (!(lesson.briefingBg ?? []).some((s) => LIGHTS_COPY.test(s.textBg))) {
          dark.push(`${spec.id}@L${rung.level}: ${JSON.stringify(env)} with no lights copy in the RENDERED briefing`);
        }
      }
    }
    expect(dark, `${dark.length} rung(s) grade a lamp duty nothing states:\n${dark.join("\n")}`).toEqual([]);
  });

  it("the kit's own weather recipes carry the lamp sentence", () => {
    for (const make of [l5Wet, l5Night, l5Fog]) {
      const rung = make();
      expect(rung.complication!.coachBg, rung.complication!.titleBg).toMatch(LIGHTS_COPY);
      expect(rung.complication!.lawRef, rung.complication!.titleBg).toMatch(/чл\. 70/);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. NO PUNISHMENT — harder to drive well, never harder to finish
// ---------------------------------------------------------------------------

describe("a complication never makes a lesson harder to FINISH", () => {
  /**
   * The complication FIELD is inert everywhere except the briefing. Stripping
   * it from a clone must leave a byte-identical lesson apart from
   * `briefingBg` — which is the exact shape of „it explains, it does not
   * punish". (The rung's own delta — the rain, the extra car — stays on the
   * clone; what is being pinned here is that the EXPLANATION costs nothing.)
   */
  it("changes nothing about the lesson except the briefing that explains it", () => {
    const leaked: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        if (!rung.complication) continue;
        const bare = JSON.parse(JSON.stringify(spec)) as ScenarioSpec;
        delete bare.levels.find((l) => l.level === rung.level)!.complication;
        const withIt = compileScenario(spec, rung.level) as unknown as Record<string, unknown>;
        const without = compileScenario(bare, rung.level) as unknown as Record<string, unknown>;
        for (const k of new Set([...Object.keys(withIt), ...Object.keys(without)])) {
          if (k === "briefingBg") continue;
          if (JSON.stringify(withIt[k]) !== JSON.stringify(without[k])) {
            leaked.push(`${spec.id}@L${rung.level}: complication changed lesson.${k}`);
          }
        }
      }
    }
    expect(leaked, leaked.join("\n")).toEqual([]);
  });

  /**
   * And the rung it rides on still obeys the §7 widen-only rule: a waypoint
   * radius or speed cap the student must hit is never SMALLER than the
   * template authored (doc 86 B3/B5 — a harder rung must be harder to drive
   * well, never harder to finish). level-seam.test.ts pins this for every
   * rung; it is re-checked here for complication rungs specifically, because
   * this is the lane that adds them.
   */
  it("never shrinks a gate the template authored", () => {
    const broken: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        if (!resolveScenarioComplication(spec, rung.level)) continue;
        const built = compileScenario(spec, rung.level);
        expect(built.objectives.map((o) => o.id), `${spec.id}@L${rung.level}`).toEqual(
          spec.success.map((o) => o.id),
        );
        spec.success.forEach((o, i) => {
          if (o.params.kind !== "reachZone" && o.params.kind !== "passSignal") return;
          const b = built.objectives[i].params;
          if ((b.radiusM as number) < o.params.radiusM - 1e-9) {
            broken.push(`${spec.id}@L${rung.level} ${o.id}: radius ${o.params.radiusM} → ${b.radiusM as number}`);
          }
          if (o.params.kind === "reachZone" && o.params.maxSpeedKmh !== undefined) {
            if (((b.maxSpeedKmh as number) ?? 0) < o.params.maxSpeedKmh - 1e-9) {
              broken.push(`${spec.id}@L${rung.level} ${o.id}: cap ${o.params.maxSpeedKmh} → ${b.maxSpeedKmh as number}`);
            }
          }
        });
      }
    }
    expect(broken, broken.join("\n")).toEqual([]);
  });

  it("every complication rung still compiles into a runnable lesson", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        if (!resolveScenarioComplication(spec, rung.level)) continue;
        const lesson = compileScenario(spec, rung.level);
        expect(lesson.objectives.length, `${spec.id}@L${rung.level}`).toBeGreaterThan(0);
        expect(lesson.world?.districtId, `${spec.id}@L${rung.level}`).toBe(spec.map.districtId);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Validation shape + THEO-4 floor
// ---------------------------------------------------------------------------

describe("validateScenarioSpec refuses copy that could not teach", () => {
  const clone = () => JSON.parse(JSON.stringify(SC_PARK_PERP_REV)) as ScenarioSpec;

  it("rejects a bare verdict instead of an explanation (THEO-4)", () => {
    const s = clone();
    s.levels[4].complication = { adds: ["grip"], titleBg: "Трудно", coachBg: "По-трудно е." };
    expect(validateScenarioSpec(s).join("\n")).toMatch(/coachBg must be a real Bulgarian instruction/);
  });

  it("rejects an empty claim and an unknown addition", () => {
    const s = clone();
    s.levels[4].complication = { adds: [], titleBg: "Нещо", coachBg: "А".repeat(60) };
    expect(validateScenarioSpec(s).join("\n")).toMatch(/adds must name at least one addition/);
    s.levels[4].complication = {
      adds: ["kittens" as RungAddition],
      titleBg: "Нещо",
      coachBg: "Тук описваме какво точно се променя и какво прави шофьорът с това.",
    };
    expect(validateScenarioSpec(s).join("\n")).toMatch(/is not one of traffic, weather/);
  });

  it("rejects a citation that is not ЗДвП / ППЗДвП / Наредба (ADR-002 retrieval)", () => {
    const s = clone();
    s.levels[4].complication = {
      adds: ["grip"],
      titleBg: "Мокър паваж",
      coachBg: "Тук описваме какво точно се променя и какво прави шофьорът с това.",
      lawRef: NOT_A_CITATION,
    };
    expect(validateScenarioSpec(s).join("\n")).toMatch(/must cite ЗДвП/);
  });

  it("refuses a complication on the template's lowest rung", () => {
    const s = clone();
    s.levels[0].complication = {
      adds: ["grip"],
      titleBg: "Мокър паваж",
      coachBg: "Тук описваме какво точно се променя и какво прави шофьорът с това.",
    };
    expect(validateScenarioSpec(s).join("\n")).toMatch(/LOWEST rung/);
  });

  it("every shipped complication passes the shape gate", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      const errs = validateScenarioSpec(spec).filter((e) => e.includes("complication"));
      expect(errs, `${spec.id}: ${errs.join("; ")}`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// The census — what the ladder can now add, counted
// ---------------------------------------------------------------------------

describe("the ladder above L3 has something to add — counted", () => {
  it("reports the coverage and holds the ratchet", () => {
    let rungs = 0;
    let withComplication = 0;
    let authored = 0;
    const l5 = new Set<string>();
    const byFamilyBare = new Map<string, number>();
    for (const spec of SCENARIO_TEMPLATES) {
      rungs += spec.levels.length;
      for (const rung of spec.levels) {
        if (resolveScenarioComplication(spec, rung.level)) withComplication += 1;
        if (rung.complication) authored += 1;
      }
      if (spec.levels.some((l) => l.level === 5)) l5.add(spec.id);
      else byFamilyBare.set(spec.family, (byFamilyBare.get(spec.family) ?? 0) + 1);
    }
    // MEASURED 2026-08-02.
    //   before this lane: 738 rungs · 0 explained · 75 of 167 templates with an
    //                     L5 at all · 115 rungs that added something silently
    //   after:            808 rungs · 347 explained · 145 of 167 with an L5 ·
    //                     0 silent (the invariant above now holds by
    //                     construction, and the test above proves it)
    // Floors, not targets: they may only be raised. Every unit is a rung a
    // student can now be told the reason for.
    //
    // ── 347 → 327, ON PURPOSE, 2026-08-03. Read this before raising it back. ──
    // The junction/signals ambient baseline now sits on a measured FLOOR (see
    // SCENARIO_FAMILY_TRAFFIC_FLOOR): those two families used to compile
    // 2/3/4/4/6 cars and now compile 4/4/5/5/6, because at 2 cars the crossing
    // arm the drill grades carried a moving car for 0–32% of the minute — the
    // founder's B23/B28/B36/B38, „the priority road is empty while the
    // instructor names a car". Collapsing the bottom of that ladder costs
    // EXACTLY the L1→L2 traffic rise on ~20 rungs, and those 20 rungs are the
    // whole difference between 347 and 327.
    //
    // The trade, stated plainly: 20 rungs lose a DERIVED sentence about the
    // street getting busier; every rung of those two families gains a street
    // with something on it to yield to. A sentence promising traffic on an
    // empty road is worse than no sentence. The L4→L5 rise — the one the
    // authored «По-натоварена улица» copy depends on — is unaffected and is
    // pinned by its own assertion below.
    expect(rungs).toBeGreaterThanOrEqual(808);
    expect(withComplication).toBeGreaterThanOrEqual(327);
    expect(authored).toBeGreaterThanOrEqual(70);
    expect(l5.size).toBeGreaterThanOrEqual(145);
    // The 22 templates still without an L5 each carry a REVIEWED reason not to
    // — a bot-completion or trace test pins their four-rung ladder, or the
    // template says „No L5 by design" — except the five `templates-reels.ts`
    // clip drills, which stop at L3 by construction. Listed in the lane report;
    // if this number falls, one of those reasons was retired, and this line
    // should fall with it rather than be relaxed.
    expect(SCENARIO_TEMPLATES.length - l5.size).toBeLessThanOrEqual(22);
  });
});
