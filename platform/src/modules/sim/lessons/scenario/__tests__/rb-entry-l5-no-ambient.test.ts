/**
 * sc-roundabout-entry:60592587 [major] — «L5 ambient traffic against the
 * roundabout family design; the correct demo collides there».
 *
 * THE DEFECT. `templates-flow.ts` authored `{ level: 5, traffic: { vehicleCount:
 * 4 } }` on 2026-07-16 (179b1f2, «real movement around the staged encounter»),
 * before anyone measured a mini ring with traffic on it. On 2026-08-02 it WAS
 * measured, and compile.ts wrote the result down as the family rule («WHY THE
 * ROUNDABOUT FAMILY IS DELIBERATELY ZERO»: on rb-mini-v1 two ambient cars spend
 * 68–75% of their time stopped at 5–7 km/h — the ring gridlocks; it stays 0
 * until the mini-ring reservation logic is fixed). The rung-level count is the
 * author's word and the compiler never clamps it, so the older, unmeasured
 * number outlived the measurement that refuted it: the one rung of the family
 * that still compiles ambient cars onto rb-mini-v1. Through the live chain the
 * lesson's own careful drive then hits the staged circulator and an ambient car.
 *
 * Every other roundabout-family L5 adds its difficulty the way the family can
 * carry it — rain plus (except this one) an extra STAGED car — and none adds an
 * ambient fleet. So sc-roundabout-entry's L5 does the same: 0 ambient (the
 * family rule) and rain (the family's L5 delta), told to the student by the
 * ladder's stored rain line.
 *
 * THE BAR. The authored shadow-correct drive, replayed through the live chain at
 * L5 (liveChainReplay: the rung's compiled traffic with LessonScene's options,
 * the director at the live seed, the session engine, the result), passes with
 * 0 т., no COLLISION and no ambient overlap — and every roundabout-family rung
 * compiles the family's ambient count, 0.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import { initialHeadlightsFor } from "../../../scene/cabin";
import { recordScriptedDrive } from "../../../traces/recorder";
import { scRoundaboutEntryShadowScript } from "../../../traces/scRoundaboutEntry";
import { compileScenario, resolveScenarioComplication, SCENARIO_FAMILY_TRAFFIC_BASELINE } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_ROUNDABOUT_ENTRY } from "../templates-flow";
import { liveChainReplay } from "./liveChainReplay";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const RAW: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", `${SC_ROUNDABOUT_ENTRY.map.districtId}.json`), "utf-8"),
);

function liveShadow(level: 1 | 2 | 3 | 4 | 5, lampsOverride?: "off") {
  const lesson = compileScenario(SC_ROUNDABOUT_ENTRY, level);
  const rec = recordScriptedDrive(RAW, scRoundaboutEntryShadowScript(), {
    scenarioId: SC_ROUNDABOUT_ENTRY.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
    collisionMinKmh: 0,
  });
  // liveChainReplay samples a dry, unlit day (`sample(…, isNight false, rain
  // false)`, headlights "off"). LessonScene does not: RuntimeDriver passes the
  // compiled `environment.rain` into runtime.sample, and the cabin hands the car
  // over with the lamps `initialHeadlightsFor` decides (a "ready" rain rung
  // whose own briefing does not order the switch → dipped). A rain rung judged
  // on a dry tick would hide the rain speed factor and the lamp duty, so the
  // tick carries both, exactly as the product would — the careful drive keeps
  // the lamps it was handed.
  const raining = lesson.environment?.rain === true;
  const lamps = lampsOverride ?? initialHeadlightsFor({
    // LessonScene.tsx's own derivation of the hand-over state.
    vehicleStart: lesson.vehicleStart ?? (lesson.preDrive ? "cold" : "ready"),
    night: lesson.environment?.timeOfDay === "night",
    rain: raining,
    fog: lesson.environment?.fog === true,
    preDrive: lesson.preDrive,
    lessonId: lesson.id,
  });
  const out = liveChainReplay({
    lesson,
    districtRaw: RAW,
    trace: rec.trace,
    holdAfterSec: 3,
    beforeApply: ({ tick }) => {
      tick.rain = raining;
      tick.headlights = lamps;
    },
  });
  return { ...out, raining, lamps };
}

describe("sc-roundabout-entry:60592587 — L5 agrees with the roundabout family: no ambient fleet on the mini ring", () => {
  it("the careful drive at L5, through the live chain: passed, 0 т., both tasks, no COLLISION, no ambient overlap", () => {
    const out = liveShadow(5);
    expect(out.violationCodes).not.toContain("COLLISION");
    expect(out.ambientContacts).toEqual([]);
    expect(out.violationCodes).toEqual([]);
    expect(out.result.score).toBe(0);
    expect(out.result.passed).toBe(true);
    expect(out.result.objectives.filter((o) => o.done).map((o) => o.id)).toEqual(["sc-rb-approach", "sc-rb-ring"]);
    // The staged circulator is still there and is yielded to (the drill is intact).
    expect(out.outcomes.map((o) => `${o.eventId}:${o.detail}`)).toEqual(
      (out.lesson.stagedEvents ?? []).map((s) => `${(s as StagedEventSpec).id}:yielded`),
    );
    expect(out.lesson.traffic?.vehicleCount ?? 0).toBe(0);
    // …and it was judged in the rain, with the lamps the car was handed.
    expect(out.raining).toBe(true);
    expect(out.lamps).toBe("low");
  });

  it("CONTROL: the rain on that tick is live — the same drive with the lamps off is billed HEADLIGHTS_OFF_IN_RAIN", () => {
    const out = liveShadow(5, "off");
    expect(out.violationCodes).toContain("HEADLIGHTS_OFF_IN_RAIN");
    expect(out.violationCodes).not.toContain("COLLISION");
  });

  it("L5 still ADDS over L4 (FR-13), the family's way — rain, announced by the ladder's stored line — and never a busier street", () => {
    const l5 = compileScenario(SC_ROUNDABOUT_ENTRY, 5);
    expect(l5.environment?.rain).toBe(true);
    const c = resolveScenarioComplication(SC_ROUNDABOUT_ENTRY, 5);
    expect(c?.adds).toContain("weather");
    expect(c?.adds).not.toContain("traffic");
    expect(l5.briefingBg?.[0]?.textBg ?? "").not.toMatch(/по-натоварена|не е празна/);
    expect(l5.briefingBg?.[0]?.textBg ?? "").toMatch(/вали/);
  });

  it("CENSUS: every roundabout-family rung compiles the family's ambient count (0 — compile.ts «deliberately zero»)", () => {
    expect(SCENARIO_FAMILY_TRAFFIC_BASELINE.roundabout).toBeUndefined();
    const family = SCENARIO_TEMPLATES.filter((s) => s.family === "roundabout");
    expect(family.length).toBeGreaterThanOrEqual(6);
    const bad: string[] = [];
    for (const spec of family) {
      for (const rung of spec.levels) {
        const n = compileScenario(spec, rung.level).traffic?.vehicleCount ?? 0;
        if (n !== 0) bad.push(`${spec.id}@L${rung.level}=${n}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
