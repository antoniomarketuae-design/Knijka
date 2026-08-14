/**
 * TITLE-TRUTH WAVE — the JUNCTIONS group (templates-junctions.ts,
 * templates-junctions2.ts).
 *
 * `lane9-junctions-signals-truth.test.ts` already carries D3, „an objective
 * title may not promise what its gate cannot see", for `passSignal` and lamp
 * states. This file is the same law for the other half of the family: a
 * `reachZone` title may not certify another road-user's PRIORITY.
 *
 * WHY IT CANNOT: `stepReachZone(params, prev, tick)` (objectives.ts) is handed
 * one SimTick, and a SimTick carries no other actor's priority and no yield
 * outcome (rules/types.ts) — and, unlike `stepPassSignal`, no ObjectiveContext
 * either, so the staged runner's own verdict is out of reach as well. A disc
 * on the exit arm therefore ticks off the barge-through and the patient wait on
 * exactly the same frame. That is measured below, not argued: `a plain exit
 * gate completes for a drive that never yielded`.
 *
 * THESE ASSERTIONS FAIL ON THE TITLES SHIPPED BEFORE THIS WAVE:
 *   sc-jrhr-cross   «Премини кръстовището наляво, СЛЕД КАТО ПРОПУСНЕШ идващия отдясно»
 *   sc-ltap-turn    «Завърши левия завой на юг, ПРОПУСНАЛ насрещните»
 *   sc-jblind-cross «Премини наляво, СЛЕД КАТО ПРОПУСНЕШ идващия отдясно»
 *   sc-jstop-exit · sc-jscan-exit · sc-jgap-exit · sc-jleft-exit
 *                   «Завий на… и продължи ПО ПЪТЯ С ПРЕДИМСТВО»
 * The duties themselves are untouched and still graded — by the right-hand-rule
 * tracker, the left-turn tracker and the stop-line give-way check
 * (FAILED_TO_YIELD on every mistake demo in both files), by the Б2 passSignal
 * rows, and by the config-gated JUNCTION_SCAN_INCOMPLETE detector. What died is
 * the certificate, not the duty; params are byte-identical, so no drive that
 * passed yesterday fails today.
 *
 * SCOPE, stated so its silence is deliberate:
 *   · The two files this group owns. The same-shape rows in sibling lanes of
 *     this wave — templates-junctions3.ts `sc-jxeq-cross`, templates-signals.ts
 *     `sc-sdead-cross` / `sc-sflash-cross` — are NOT walked yet: widen `GROUP`
 *     to the LANE9 roster the moment those land and this guard covers the whole
 *     family unchanged.
 *   · The YIELD class only. `sc-jxgb-roll` («Премини първия Б1 след оглед, без
 *     излишно спиране») still claims a SCAN and the absence of a stop on a
 *     plain disc; it was not in this group's adjudicated set, so it is reported
 *     to the lead rather than silently rewritten here.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyTick, createLessonSession } from "../../engine";
import { REACH_ZONE_HALT_CAP_KMH, parseObjectiveParams } from "../../objectives";
import { makeTick } from "../../__tests__/fixtures";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES_JUNCTIONS } from "../templates-junctions";
import { SCENARIO_TEMPLATES_JUNCTIONS2 } from "../templates-junctions2";
import type { ScenarioSpec } from "../types";

const GROUP: readonly ScenarioSpec[] = [
  ...SCENARIO_TEMPLATES_JUNCTIONS,
  ...SCENARIO_TEMPLATES_JUNCTIONS2,
];

/**
 * Words that put ANOTHER road-user's priority in the sentence: пропусни /
 * пропуснеш / пропуснал, предимство / предимството. Substring matches on
 * purpose — Cyrillic has no `\b` in a JS regex without the `u` dance, and the
 * stems are unambiguous.
 */
const YIELD_CLAIM = /пропусн|предимств/i;

/**
 * A full-stop imperative — «Спри …», «пълно спиране». Deliberately NOT matched
 * by «без излишно спиране» (sc-jxgb-roll), which claims the opposite.
 */
const claimsHalt = (titleBg: string): boolean => {
  const t = titleBg.toLowerCase();
  return /(^|[\s„(])спри[\s,.]/.test(t) || t.includes("пълно спиране");
};

// ---------------------------------------------------------------------------
// The law
// ---------------------------------------------------------------------------

describe("a reachZone title may not certify a yield its tick cannot see", () => {
  for (const scenario of GROUP) {
    for (const objective of scenario.success) {
      const p = objective.params;
      if (p.kind !== "reachZone") continue;
      // A zone that carries a constraint makes a different promise: it says
      // something the evaluator really reads (a cap, a stop-line cut). Those
      // are audited by the interlock below instead of exempted quietly.
      if (p.maxSpeedKmh !== undefined || p.acceptBeforeMarkM !== undefined) continue;
      it(`${scenario.id} / ${objective.id}`, () => {
        expect(
          YIELD_CLAIM.test(objective.titleBg),
          `${objective.id}: „${objective.titleBg}" certifies another road-user's priority, ` +
            `but its gate is a plain disc at (${p.x}, ${p.y}) r${p.radiusM}: reaching it proves ` +
            `the manoeuvre and the compass arm, nothing else. Name those instead and leave the ` +
            `yield to the tracker that measures it.`,
        ).toBe(false);
      });
    }
  }
});

describe("the one yield-titled zone left standing keeps the gate that stands in for the wait", () => {
  /**
   * `sc-jxgb-yield` («Пропусни колата с предимство на второто кръстовище») is
   * the single exception, and it earns it: a ≤ 6 km/h crawl demand inside a
   * band cut off at the Б1 paint is the observable half of giving way — you
   * cannot be at rest before the line and barge through it on the same drive.
   * The exemption is the CAP, not the id: strip either param and the guard
   * above convicts the title on the next run.
   */
  it("sc-jxgb-yield", () => {
    const scenario = GROUP.find((s) => s.id === "sc-jx-giveway-b1")!;
    const objective = scenario.success.find((o) => o.id === "sc-jxgb-yield")!;
    expect(YIELD_CLAIM.test(objective.titleBg)).toBe(true);
    expect(objective.params.kind).toBe("reachZone");
    if (objective.params.kind !== "reachZone") return;
    expect(objective.params.maxSpeedKmh).toBeLessThanOrEqual(REACH_ZONE_HALT_CAP_KMH);
    expect(objective.params.acceptBeforeMarkM).toBeDefined();
  });
});

describe("a reachZone that says «спри» carries a halt demand", () => {
  /**
   * The companion law (the stop convention): a full-stop claim IS expressible —
   * `maxSpeedKmh ≤ REACH_ZONE_HALT_CAP_KMH` makes the zone a halt demand, which
   * unlocks the approach capsule and is never widened by the L1/L2 ladder
   * (`scenario/params.ts widenSpeedCap`). So where the sentence says „stop", the
   * gate must too. No row in this group claims a halt today; the matcher is
   * pinned so the rule is not vacuous while it waits.
   */
  it("the matcher reads «спри» as a demand and «без излишно спиране» as its opposite", () => {
    expect(claimsHalt("Спри напълно на стоп-линията на знак Б2")).toBe(true);
    expect(claimsHalt("Премини първия Б1 след оглед, без излишно спиране")).toBe(false);
  });

  for (const scenario of GROUP) {
    for (const objective of scenario.success) {
      if (objective.params.kind !== "reachZone") continue;
      if (!claimsHalt(objective.titleBg)) continue;
      it(`${scenario.id} / ${objective.id}`, () => {
        if (objective.params.kind !== "reachZone") return;
        const cap = objective.params.maxSpeedKmh;
        expect(
          cap !== undefined && cap <= REACH_ZONE_HALT_CAP_KMH,
          `${objective.id}: „${objective.titleBg}" demands a full stop but its zone has ` +
            `${cap === undefined ? "no speed cap at all" : `a cap of ${cap} km/h`} — a roll ` +
            `through it collects the tick.`,
        ).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Why remedy B and not A: the measurement behind the whole rewrite
// ---------------------------------------------------------------------------

/** district/spawn-id → pose, read from the committed world file (the same
 *  resolution LessonScene.spawnPose performs at runtime). */
const spawnPose = (districtId: string, pointId: string): { x: number; y: number } => {
  const f = path.join(process.cwd(), "..", "content", "world", `${districtId}.json`);
  const d = JSON.parse(fs.readFileSync(f, "utf8")) as {
    spawnPoints?: Array<{ id: string; x: number; y: number }>;
  };
  const sp = (d.spawnPoints ?? []).find((s) => s.id === pointId);
  if (!sp) throw new Error(`${districtId} has no spawn ${pointId}`);
  return { x: sp.x, y: sp.y };
};

describe("a plain exit gate completes for a drive that never yielded", () => {
  /**
   * The reason the yield clause could not simply be MADE true. sc-junction-rhr
   * is driven straight through its uncontrolled T at a steady pace: no wait, no
   * gap, no staged outcome ever applied — the barge the lesson exists to
   * punish. Every objective still goes green. The rule engine is what convicts
   * that drive (FAILED_TO_YIELD, mistake-barge); the disc cannot tell it from
   * the correct one, so its title must not claim to.
   */
  it("sc-junction-rhr @L3", () => {
    const spec = GROUP.find((s) => s.id === "sc-junction-rhr")!;
    const lesson = compileScenario(spec, 3);
    const spawn = spawnPose(spec.map.districtId, spec.start.spawnPointId!);

    let s = createLessonSession(lesson);
    // Frame zero at the real spawn: latches `everOutside` so nothing is
    // conceded for standing still (doc 87 B3/B10/B11).
    s = applyTick(s, makeTick({ t: 0, position: spawn, speedKmh: 0 })).state;

    lesson.objectives.forEach((o, i) => {
      const p = parseObjectiveParams(o);
      expect(p.kind, `${o.id} is expected to be a reachZone in this drill`).toBe("reachZone");
      if (p.kind !== "reachZone") return;
      // Obey the cap where there is one; otherwise roll through the box.
      const speedKmh = p.maxSpeedKmh !== undefined ? Math.max(0, p.maxSpeedKmh - 5) : 25;
      s = applyTick(s, makeTick({ t: (i + 1) * 4, position: { x: p.x, y: p.y }, speedKmh })).state;
    });

    expect(s.objectives.map((o) => [o.spec.id, o.status])).toEqual(
      lesson.objectives.map((o) => [o.id, "done"]),
    );
    expect(s.phase).toBe("completed");
  });
});
