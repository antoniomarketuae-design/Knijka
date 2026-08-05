/**
 * B58 — THE WORLD MAY NOT INSTRUCT THE FAULT IT IS ABOUT TO BILL.
 *
 * The founder's finding, on «Превишаване над +10 км/ч» (catalog 34): the
 * in-world gate bar across the lane read **«Карай дотук — не по-бързо от
 * 57 км/ч» on a street posted 50**, in the one drill whose entire subject is
 * that 51–60 км/ч in a 50 zone is a scored fault. His sentence for the class:
 * „a student who obeys the number the world shows him commits the mistake the
 * world is grading."
 *
 * The 57 was GENERATED, not authored: `scenario/params.ts` widenSpeedCap adds
 * SPEED_CAP_GRACE_KMH_PER_TOLERANCE × (tolerance − 1) km/h to every capped
 * waypoint on the aided rungs, and 52 + 5 = 57. The census taken when this row
 * was worked said it was a class, not an instance — **126** compiled reachZone
 * gates carried a cap above their district's posted limit, and **94 of them
 * were the ladder's doing**, including the motorway (authored 140 = posted 140,
 * L1 bar 145).
 *
 * THE INVARIANT THIS FILE PINS: the difficulty ladder may never lift a gate's
 * speed cap above the street's posted limit. It may still widen up TO the
 * limit, and it never tightens below what the template authored (the WIDEN-ONLY
 * rule in params.ts) — so a template that deliberately authored slack above its
 * own limit keeps exactly the graded cap it always had. What it may not do is
 * add more on top and print the result on the glass.
 *
 * The other half of the fix — the printed LABEL clamped to the sign even where
 * the AUTHORED cap sits above it — lives in `components/sim/RouteGuidance.tsx`
 * (`postedLimitAt` / `capLineBg`) and is pinned by its own test.
 */

import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import { compileScenario } from "../compile";
import { serializeObjectiveParams } from "../params";
import type { ScenarioLevel } from "../types";
import { advisorPromptForObjective } from "../../advisor";

interface Row {
  scenario: string;
  level: number;
  objective: string;
  authored: number;
  compiled: number;
  posted: number;
}

function survey(): Row[] {
  const rows: Row[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    const postedRaw = spec.map.params["maxspeedKmh"];
    if (typeof postedRaw !== "number" || !Number.isFinite(postedRaw)) continue;
    for (const rung of spec.levels) {
      const level = rung.level as ScenarioLevel;
      const lesson = compileScenario(spec, level);
      for (const o of lesson.objectives) {
        if (o.kind !== "reachZone") continue;
        const compiled = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
        if (compiled === undefined) continue;
        const src = spec.success.find((s) => s.id === o.id)?.params as
          | { maxSpeedKmh?: number }
          | undefined;
        const authored = src?.maxSpeedKmh;
        if (authored === undefined) continue;
        rows.push({
          scenario: spec.id,
          level,
          objective: o.id,
          authored,
          compiled,
          posted: postedRaw,
        });
      }
    }
  }
  return rows;
}

describe("B58 — a gate's speed cap never exceeds the posted limit by the ladder's doing", () => {
  const rows = survey();

  it("surveys a meaningful slice of the catalog (guards against a vacuous pass)", () => {
    expect(rows.length).toBeGreaterThan(100);
  });

  it("no compiled cap anywhere exceeds max(authored, posted)", () => {
    const bad = rows.filter((r) => r.compiled > Math.max(r.authored, r.posted));
    expect(
      bad.map(
        (r) =>
          `${r.scenario} L${r.level} ${r.objective}: authored ${r.authored}, posted ${r.posted}, compiled ${r.compiled}`,
      ),
    ).toEqual([]);
  });

  it("the founder's own gate: sc-speed-dangerous L1 compiles 52, not 57, on a street posted 50", () => {
    const l1 = rows.filter((r) => r.scenario === "sc-speed-dangerous" && r.level === 1);
    expect(l1.length).toBe(2); // sc-dng-hold + sc-dng-finish
    for (const r of l1) {
      expect(r.posted).toBe(50);
      expect(r.authored).toBe(52);
      expect(r.compiled).toBe(52);
    }
  });

  it("the motorway gate stops reading 145 on a road posted 140", () => {
    const l1 = rows.filter((r) => r.scenario === "sc-mw-discipline" && r.level === 1);
    expect(l1.length).toBeGreaterThan(0);
    for (const r of l1) expect(r.compiled).toBeLessThanOrEqual(r.posted);
  });

  it("the ladder STILL widens where the widened cap stays under the sign", () => {
    // Non-vacuity: the fix must not have turned the grace off wholesale. A
    // capped gate authored well below its limit still gains the full L1 grace.
    const widened = rows.filter((r) => r.level === 1 && r.compiled > r.authored);
    expect(widened.length).toBeGreaterThan(0);
    for (const r of widened) expect(r.compiled).toBeLessThanOrEqual(r.posted);
  });

  it("a caller with no map in hand (validate.ts's round-trip) behaves exactly as before", () => {
    const p = { kind: "reachZone", x: 0, y: 0, radiusM: 6, maxSpeedKmh: 52 } as const;
    expect(serializeObjectiveParams(p, 1.5).params.maxSpeedKmh).toBe(57);
    expect(serializeObjectiveParams(p, 1.5, 5, 50).params.maxSpeedKmh).toBe(52);
    // WIDEN-ONLY holds: an authored cap ABOVE its own posted limit is never
    // tightened by this clamp — that would be re-authoring, not de-inflating.
    expect(serializeObjectiveParams(p, 1.0, 5, 50).params.maxSpeedKmh).toBe(52);
    expect(serializeObjectiveParams({ ...p, maxSpeedKmh: 30 }, 1.5, 5, 50).params.maxSpeedKmh).toBe(35);
    // A halt demand is untouched at every rung, with or without a limit.
    expect(serializeObjectiveParams({ ...p, maxSpeedKmh: 5 }, 1.5, 5, 50).params.maxSpeedKmh).toBe(5);
  });
});

/**
 * THE THIRD CHANNEL. Photographing the fixed gate bar («не по-бързо от 50 км/ч»
 * on a street posted 50) put the ADVISOR card in the same frame, and it still
 * read the raw compiled cap: «Задръж под 50, докато потокът те подминава —
 * дръж под 52 км/ч». One sentence contradicting itself, in the instructor's
 * voice, in the drill that grades going over 50. The gate keeps grading 52 (the
 * authored number, untouched); the card is clamped to the sign.
 */
describe("B58 — the advisor card never says a number the sign forbids", () => {
  it("the founder's own card: «Задръж под 50 …» no longer ends in „дръж под 52 км/ч“", () => {
    const lesson = compileScenario(
      SCENARIO_TEMPLATES.find((s) => s.id === "sc-speed-dangerous")!,
      1,
    );
    expect(lesson.postedLimitKmh).toBe(50);
    const first = lesson.objectives[0]!;
    expect((first.params as { maxSpeedKmh?: number }).maxSpeedKmh).toBe(52); // graded, unchanged
    const p = advisorPromptForObjective(
      first.titleBg,
      { kind: "reachZone", x: 0, y: 0, radiusM: 9, maxSpeedKmh: 52 },
      undefined,
      lesson.postedLimitKmh,
    );
    expect(p.textBg).toBe("Задръж под 50, докато потокът те подминава — дръж под 50 км/ч");
    expect(p.textBg).not.toContain("52");
  });

  it("no compiled lesson's advisor card prints a cap above its own posted limit", () => {
    const bad: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      for (const rung of spec.levels) {
        const lesson = compileScenario(spec, rung.level as ScenarioLevel);
        const posted = lesson.postedLimitKmh;
        if (posted === undefined) continue;
        for (const o of lesson.objectives) {
          if (o.kind !== "reachZone") continue;
          const cap = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
          if (cap === undefined || cap <= 8) continue;
          const text = advisorPromptForObjective(
            o.titleBg,
            { kind: "reachZone", x: 0, y: 0, radiusM: 1, maxSpeedKmh: cap },
            undefined,
            posted,
          ).textBg;
          const printed = Number(/дръж под (\d+(?:\.\d+)?) км\/ч$/.exec(text)?.[1]);
          if (!(printed <= posted)) bad.push(`${lesson.id} ${o.id}: printed ${printed} > posted ${posted}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("without a posted limit — curriculum, exam bank, any test double — the card is byte-identical", () => {
    const params = { kind: "reachZone", x: 0, y: 0, radiusM: 9, maxSpeedKmh: 52 } as const;
    expect(advisorPromptForObjective("Стигни зоната", params).textBg).toBe(
      "Стигни зоната — дръж под 52 км/ч",
    );
    // …and a HALT demand is never turned into a limit by the clamp.
    expect(
      advisorPromptForObjective("Спри тук", { ...params, maxSpeedKmh: 5 }, undefined, 50).textBg,
    ).toBe("Спри тук — дръж под 5 км/ч");
  });
});
