/**
 * Top-down coverage — the founder's 2026-07-17 ruling as a standing gate.
 *
 * Live report from a drive: „Тясно гнездо · Ниво 2 — Частична помощ" offered no
 * G view, and a reverse-park is impossible to read without it. Root cause was
 * DATA, not plumbing: DEFAULT_LEVEL_AIDS granted topdownAllowed on L1 only, so
 * L2..L5 compiled without it and LessonScene dropped G from the C cycle.
 *
 * This walks the WHOLE live catalog — every template, every AUTHORED rung — and
 * asserts the compiled lesson grants top-down, unless that rung explicitly opts
 * out (aids: { topdownAllowed: false }). It deliberately pins no template count:
 * the assembly line appends to SCENARIO_TEMPLATES continuously, so the walk
 * covers whatever is authored at run time and grows with the catalog.
 *
 * Top-down is a POV, not an aid (doc 76 §7/§12) — it never leaks an answer, and
 * every one of the exam-bank practical variants already granted it.
 */
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel, ScenarioSpec } from "../types";

/** A rung opts out only by AUTHORING the flag false — absent ≠ opt-out. */
function optsOut(spec: ScenarioSpec, level: ScenarioLevel): boolean {
  return spec.levels.find((l) => l.level === level)?.aids?.topdownAllowed === false;
}

describe("top-down coverage — every scenario, every topic, every exam", () => {
  it("the live catalog is non-empty (a vacuous walk would pass silently)", () => {
    expect(SCENARIO_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("grants top-down on EVERY authored rung of EVERY template", () => {
    const denied: string[] = [];
    let rungs = 0;

    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        if (optsOut(spec, rung.level)) continue; // honest escape hatch
        rungs++;
        const lesson = compileScenario(spec, rung.level);
        if (lesson.aids?.topdownAllowed !== true) denied.push(`${spec.id}@L${rung.level}`);
      }
    }

    // Name the offenders: a bare `false` would send the next reader hunting.
    expect(denied, `rungs without top-down (of ${rungs} walked)`).toEqual([]);
    expect(rungs).toBeGreaterThan(0);
  });

  it("covers L2..L5 rungs specifically (the reported bug lived past L1)", () => {
    const byLevel = new Map<ScenarioLevel, number>();
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        if (compileScenario(spec, rung.level).aids?.topdownAllowed === true) {
          byLevel.set(rung.level, (byLevel.get(rung.level) ?? 0) + 1);
        }
      }
    }
    // The catalog authors L1..L4 broadly and L5 on the complication packs; every
    // level the catalog authors at all must appear with a non-zero grant count.
    const authored = new Set<ScenarioLevel>(
      SCENARIO_TEMPLATES.flatMap((s) => s.levels.map((l) => l.level)),
    );
    for (const level of authored) expect(byLevel.get(level) ?? 0).toBeGreaterThan(0);
    // The founder's exact repro: L2 („Частична помощ") must be covered.
    expect(authored.has(2)).toBe(true);
    expect(byLevel.get(2) ?? 0).toBeGreaterThan(0);
  });

  it("the escape hatch still bites: a rung authoring false really loses G", () => {
    const base = SCENARIO_TEMPLATES[0];
    const spec = JSON.parse(JSON.stringify(base)) as ScenarioSpec;
    const level = spec.levels[0].level;
    spec.levels[0].aids = { ...(spec.levels[0].aids ?? {}), topdownAllowed: false };
    expect(compileScenario(spec, level).aids?.topdownAllowed).toBeUndefined();
    // …and the untouched original still grants it (the delta is the flag alone).
    expect(compileScenario(base, level).aids?.topdownAllowed).toBe(true);
  });
});
