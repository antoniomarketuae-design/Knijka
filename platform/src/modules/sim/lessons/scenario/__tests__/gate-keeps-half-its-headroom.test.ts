/**
 * THE LADDER MAY NOT WALK A GATE INTO THE LAW ITSELF — w10-4, 2026-08-25
 * (sc-hazard-obstacle:b103ec20 critical, sc-ac-highbeam-lead:5b87547e critical).
 *
 * B58 (the file next door) stopped the difficulty ladder printing a cap ABOVE
 * the sign, and stated its remaining licence out loud: „It may still widen up
 * TO the limit." Six compiled gates were sitting exactly there, and a gate
 * standing on the posted limit demands precisely what the law already demands
 * — nothing at all. Measured through `compileScenario` over all 167 templates
 * × every rung, BEFORE the clamp in `params.ts widenSpeedCap`:
 *
 *   sc-ac-highbeam-lead   L1    sc-ahl-follow     authored 45 · posted 50 · 50
 *   sc-hazard-obstacle    L1    sc-obs-approach   authored 46 · posted 50 · 50
 *   sc-vu-blindspot-moto  L1    sc-vubs-let-pass  authored 45 · posted 50 · 50
 *   sc-ln-decisive-change L1,L2 sc-lndc-wait      authored 48 · posted 50 · 50
 *   sc-sign-warning       L1    reach-end         authored 45 · posted 50 · 50
 *
 * THE FRAME. `.audit-frames/w10-4/frames/sc-hazard-obstacle__pc-wrong/
 * 08-debrief-p3.png` — «✓ Приближи обекта с контролирана скорост 0:32 · ✓
 * Задмини обекта и продължи напред 0:39 · ✓ Стигни края на отсечката 0:42»,
 * ★★★, 0 наказателни точки от изпитния лист — on the run whose own `run.log`
 * reads „14 · 56 · 59 км/ч" past a stalled car on a street posted 50. On НИВО 1
 * — the one rung where the gate bar in the world is the only thing telling a
 * beginner what «контролирана» means — «контролирана скорост» had been compiled
 * into „the legal maximum".
 *
 * THE INVARIANT: the aided rung's grace may spend at most HALF the headroom the
 * template left between its own cap and the sign, FLOORED TO A WHOLE KM/H.
 * Half remains, always, so the gate keeps demanding something the law does not.
 * Where the author left plenty (58 under a 90 sign, 130 under 140) the half
 * exceeds the grace and nothing moves — which is why this is six rows out of
 * 953 capped gates and not a re-authoring of the catalogue.
 *
 * AND THE FLOOR IS NOT TIDINESS. The first cut of this clamp put three L1 gates
 * on 47.5 while `RouteGuidance.capLineBg` paints `Math.round(min(cap, posted))`
 * across the lane — «не по-бързо от 48 км/ч» over a gate that grades 47.5, i.e.
 * B58's own defect one decimal place inward. See „THE NUMBER PAINTED ACROSS THE
 * LANE" below, which censuses that class over the whole catalogue and shows it
 * SHRINKING (103 → 99), not growing.
 *
 * THE DIRECTION THAT MATTERS MORE THAN THE INVARIANT. Narrowing forgiveness is
 * not tightening a gate: the clamp is floored at `maxSpeedKmh`, so every aided
 * rung still grades at or above the number the template authored and L3 grades.
 * A drive the author's own gate would pass, passes on every rung below it. That
 * is asserted here, over the whole catalogue, rather than argued.
 */

import { describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES } from "../templates";
import { compileScenario } from "../compile";
import { serializeObjectiveParams } from "../params";
import type { ScenarioLevel } from "../types";

interface Row {
  scenario: string;
  level: number;
  objective: string;
  authored: number;
  compiled: number;
  posted: number | undefined;
}

function survey(): Row[] {
  const rows: Row[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    const postedRaw = spec.map.params["maxspeedKmh"];
    const posted =
      typeof postedRaw === "number" && Number.isFinite(postedRaw) ? postedRaw : undefined;
    for (const rung of spec.levels) {
      const level = rung.level as ScenarioLevel;
      const lesson = compileScenario(spec, level);
      for (const o of lesson.objectives) {
        if (o.kind !== "reachZone") continue;
        const compiled = (o.params as { maxSpeedKmh?: number }).maxSpeedKmh;
        if (compiled === undefined) continue;
        const authored = (
          spec.success.find((s) => s.id === o.id)?.params as { maxSpeedKmh?: number } | undefined
        )?.maxSpeedKmh;
        if (authored === undefined) continue;
        rows.push({ scenario: spec.id, level, objective: o.id, authored, compiled, posted });
      }
    }
  }
  return rows;
}

describe("a widened gate keeps half the headroom its author left under the sign", () => {
  const rows = survey();

  it("surveys the whole capped population (guards against a vacuous pass)", () => {
    // The census that made this a class: 953 capped reachZone gates across all
    // rungs of all 167 templates. A survey that shrank would pass this file by
    // inspecting less.
    expect(rows.length).toBeGreaterThan(900);
  });

  it("no gate is compiled onto the sign that its author authored below", () => {
    const onTheSign = rows.filter(
      (r) => r.posted !== undefined && r.authored < r.posted && r.compiled >= r.posted,
    );
    expect(
      onTheSign.map(
        (r) =>
          `${r.scenario} L${r.level} ${r.objective}: authored ${r.authored}, posted ${r.posted}, compiled ${r.compiled}`,
      ),
    ).toEqual([]);
  });

  it("the six rows that were on the sign now stand under it, by name", () => {
    // Named rather than counted: a future re-widening has to come here and say
    // so, instead of quietly re-inflating one row inside an aggregate.
    const at = (scenario: string, level: number, objective: string) =>
      rows.find((r) => r.scenario === scenario && r.level === level && r.objective === objective);
    const expected: [string, number, string, number][] = [
      ["sc-ac-highbeam-lead", 1, "sc-ahl-follow", 47],
      ["sc-hazard-obstacle", 1, "sc-obs-approach", 48],
      ["sc-vu-blindspot-moto", 1, "sc-vubs-let-pass", 47],
      ["sc-ln-decisive-change", 1, "sc-lndc-wait", 49],
      ["sc-ln-decisive-change", 2, "sc-lndc-wait", 49],
      ["sc-sign-warning", 1, "reach-end", 47],
    ];
    for (const [scenario, level, objective, compiled] of expected) {
      const row = at(scenario, level, objective);
      expect(row, `${scenario} L${level} ${objective} missing from the survey`).toBeDefined();
      expect(row!.posted).toBe(50);
      expect(row!.compiled).toBe(compiled);
      expect(row!.compiled).toBeLessThan(row!.posted!);
      expect(row!.compiled).toBeGreaterThan(row!.authored);
    }
  });

  it("AND THE NUMBER PAINTED ACROSS THE LANE IS THE NUMBER GRADED", () => {
    // THE HALF THE FIRST CUT OF THIS CLAMP GOT WRONG, and it is B58's own
    // defect one decimal place inward. `RouteGuidance.capLineBg` paints
    // «не по-бързо от N км/ч» on the gate bar with `Math.round(min(cap,
    // posted))`; `objectives.ts` grades `speedKmh <= cap` with no slack on
    // `contractEarned`. A cap of 47.5 therefore paints 48 across the lane and
    // fails the student who drives the 48 it painted — the founder's B58
    // sentence exactly: „a student who obeys the number the world shows him
    // commits the mistake the world is grading."
    //
    // So the clamp floors the half-headroom to a whole km/h and the class
    // SHRANK rather than grew: measured over all 953 capped gates through
    // `compileScenario`, cards whose painted integer exceeds their graded cap
    // went 103 → 99. The 99 that remain are the L2 rung's own 2.5 km/h of
    // grace landing on a .5 (authored 30 → 32.5 → painted 33), which is a
    // different repair in a different file and is NOT this lane's.
    //
    // A CENSUS, NOT A LIMIT: it may only ever go DOWN. If it drops, re-measure
    // and restate it here; if it rises, something started painting above its
    // own gate again.
    const painted = rows.filter((r) => {
      const shown = r.posted === undefined ? r.compiled : Math.min(r.compiled, r.posted);
      return Math.round(shown) > r.compiled;
    });
    expect(painted.length).toBe(99);
    // None of the six this clamp moved is among them — that is the point.
    expect(
      painted
        .filter((r) => r.posted === 50 && r.compiled > 45 && r.compiled < 50)
        .map((r) => `${r.scenario} L${r.level} ${r.objective}: graded ${r.compiled}`),
    ).toEqual([]);
  });

  it("NO aided rung is stricter than the cap its own template authored", () => {
    // The false-refusal direction, and the reason this clamp is safe: it only
    // ever narrows FORGIVENESS. A drive that earns the tick on the author's own
    // gate (L3+) earns it on every rung below.
    const stricter = rows.filter((r) => r.compiled < r.authored);
    expect(
      stricter.map((r) => `${r.scenario} L${r.level} ${r.objective}: ${r.compiled} < ${r.authored}`),
    ).toEqual([]);
  });

  it("the ladder STILL forgives where the author left room", () => {
    // Non-vacuity in the other direction: a clamp that turned the grace off
    // wholesale would satisfy every prohibition above and destroy the beginner
    // rung. Both halves are pinned so neither can be „fixed" alone.
    const widened = rows.filter((r) => r.level === 1 && r.compiled > r.authored);
    expect(widened.length).toBeGreaterThan(50);
    // …and the full grace still lands where half the headroom is bigger than it.
    const aquaplane = rows.find(
      (r) => r.scenario === "sc-ac-aquaplane" && r.level === 1 && r.objective === "sc-acq-before",
    );
    expect(aquaplane?.authored).toBe(58);
    expect(aquaplane?.compiled).toBe(63); // 58 + the whole 5, under a 90 sign
  });

  it("a template that authored ITS OWN cap at or above the sign is untouched", () => {
    // The escape hatch, and the reason B58's own two pinned rows do not move:
    // authored ≥ posted leaves no headroom to halve, so the pre-existing
    // WIDEN-ONLY floor returns the authored number exactly as it always did.
    const dangerous = rows.filter((r) => r.scenario === "sc-speed-dangerous" && r.level === 1);
    expect(dangerous.length).toBe(2);
    for (const r of dangerous) {
      expect(r.posted).toBe(50);
      expect(r.authored).toBe(52);
      expect(r.compiled).toBe(52);
    }
  });

  it("the arithmetic, at the one function the catalogue is compiled through", () => {
    const p = { kind: "reachZone", x: 0, y: 0, radiusM: 6, maxSpeedKmh: 46 } as const;
    // Half of 4 km/h of headroom is 2 — the grace of 5 does not fit.
    expect(serializeObjectiveParams(p, 1.5, 5, 50).params.maxSpeedKmh).toBe(48);
    // 20 km/h of headroom: half is 10, the grace of 5 fits whole and nothing
    // about the shipped ladder changes.
    expect(serializeObjectiveParams({ ...p, maxSpeedKmh: 30 }, 1.5, 5, 50).params.maxSpeedKmh).toBe(
      35,
    );
    // No sign in hand (validate.ts's single-objective round-trip) — bit-identical
    // to shipped, because there is no headroom to measure against.
    expect(serializeObjectiveParams(p, 1.5).params.maxSpeedKmh).toBe(51);
    // Authored ABOVE the sign: WIDEN-ONLY floor, untouched.
    expect(serializeObjectiveParams({ ...p, maxSpeedKmh: 52 }, 1.5, 5, 50).params.maxSpeedKmh).toBe(
      52,
    );
    // Authored ON the sign: no headroom, no widening.
    expect(serializeObjectiveParams({ ...p, maxSpeedKmh: 50 }, 1.5, 5, 50).params.maxSpeedKmh).toBe(
      50,
    );
    // A halt demand is never touched by any of this, at any rung.
    expect(serializeObjectiveParams({ ...p, maxSpeedKmh: 5 }, 1.5, 5, 50).params.maxSpeedKmh).toBe(
      5,
    );
    // Tolerance 1 (the unaided rungs): the grace is zero and the clamp is
    // unreachable — the author's own number, exactly.
    expect(serializeObjectiveParams(p, 1, 5, 50).params.maxSpeedKmh).toBe(46);
  });
});
