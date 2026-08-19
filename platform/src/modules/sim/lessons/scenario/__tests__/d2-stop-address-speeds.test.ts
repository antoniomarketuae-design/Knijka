/**
 * FOUR SPEEDS ON ONE SCREEN — `sc-ed-d2-stop-address`.
 *
 * sweep161, `sc-ed-d2-stop-address/pc-right/04-t129s.png`: *„Four different
 * speed numbers are on screen at once and the student cannot tell which is
 * graded: the instruction panel says take a calm 45 км/ч, the task toast says
 * hold under 37 км/ч, the world sign says 50, and the mode strip says ≤80 on a
 * street the instructions call residential."*
 *
 * Two of those four belong to this template and this file holds both.
 *
 * THE 37 IS ALREADY GONE, and not by this lane's hand: the authored-cap wave
 * gave `advisor.ts` the template's own `maxSpeedKmh` from before the ladder's
 * grace, so the card speaks 32 on every rung instead of the grader's tolerance.
 * That is pinned below anyway, because this drill is the one the frame was shot
 * on and a regression here would restore the photographed defect exactly.
 *
 * THE 45 IS THE HALF THAT WAS LEFT. It is not a rival to the 32 — one is the
 * middle of the block and the other is the approach — but nothing on any
 * surface said so, and the sharp end is measured in the non-vacuity test
 * below: EVERY number in this drill's briefing is ABOVE the gate the drill
 * grades. A student who obeys the strictest figure he has been told still
 * fails the objective. That is requirement zero's bare verdict (doc 64 THEO-4)
 * and it is the founder's own roundabout complaint pointing the other way, so
 * the briefing now names which number is graded and where he reads it.
 *
 * WHY THE POINTER AND NOT THE NUMERAL. The approach figure is generated per
 * rung off `sc-edsa-planned-approach`; a numeral written into the briefing
 * would be a second copy of it, free to drift, on the one drill whose entire
 * finding is numbers that disagree. So the copy points at the authoritative
 * surface instead of duplicating it — and the last test here fails if someone
 * later „helpfully" hard-codes one.
 */
import { describe, expect, it } from "vitest";
import { advisorPromptForObjective } from "../../advisor";
import { AUTHORED_MAX_SPEED_PARAM_KEY, compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";

const LESSON = "sc-ed-d2-stop-address";
const APPROACH = "sc-edsa-planned-approach";

const KMH = (s: string): number[] =>
  [...s.matchAll(/(\d+(?:[.,]\d+)?)\s*км\/ч/g)].map((m) => Number(m[1].replace(",", ".")));

const spec = () => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === LESSON);
  if (s === undefined) throw new Error(`${LESSON} is not in the catalogue`);
  return s;
};

/** The approach card exactly as the session builds it, per rung. */
function approachCards(): {
  level: ScenarioLevel;
  gate: number;
  authored: number | undefined;
  spoken: number | undefined;
  briefNums: number[];
  brief: string;
}[] {
  return spec().levels.map((rung) => {
    const lesson = compileScenario(spec(), rung.level as ScenarioLevel);
    const o = lesson.objectives.find((x) => x.id === APPROACH);
    if (o === undefined) throw new Error(`${APPROACH} vanished at L${rung.level}`);
    const params = o.params as Record<string, unknown>;
    const rawAuthored = params[AUTHORED_MAX_SPEED_PARAM_KEY];
    const authored = typeof rawAuthored === "number" ? rawAuthored : undefined;
    const textBg = advisorPromptForObjective(
      o.titleBg,
      { kind: "reachZone", ...(o.params as object) } as never,
      undefined,
      lesson.postedLimitKmh,
      authored,
    ).textBg;
    const brief = (lesson.briefingBg ?? []).map((s) => s.textBg).join(" | ");
    return {
      level: rung.level as ScenarioLevel,
      gate: params.maxSpeedKmh as number,
      authored,
      spoken: textBg.includes("дръж под") ? KMH(textBg).at(-1) : undefined,
      briefNums: KMH(brief),
      brief,
    };
  });
}

describe("the number the approach is graded on", () => {
  it("the card speaks the AUTHOR'S cap, never the ladder's tolerance", () => {
    for (const c of approachCards()) {
      expect(c.authored, `L${c.level}: the authored cap is not carried`).toBe(32);
      expect(c.spoken, `L${c.level}: the card is silent about a gate it enforces`).toBe(32);
      // The photographed defect, named so a regression is unmistakable.
      // On L1/L2 the ladder widened the gate to 37 / 34.5; the card must not
      // be quoting either. On L3/L4 gate and authored coincide at 32.
      if (c.gate !== c.authored) {
        expect(c.spoken, `L${c.level}: the grader's tolerance is speaking again`).not.toBe(c.gate);
      }
    }
  });

  it("and can never coach the student into failing the gate", () => {
    // The other direction. A card saying „под 5" everywhere would satisfy the
    // test above perfectly and be useless; a card above the gate is the crime.
    for (const c of approachCards()) {
      expect(c.spoken!, `L${c.level}: spoken ${c.spoken} over a gate of ${c.gate}`).toBeLessThanOrEqual(c.gate);
      expect(Number.isInteger(c.spoken!), `L${c.level}: a speedometer cannot show ${c.spoken}`).toBe(true);
    }
  });
});

describe("the briefing tells him WHICH number that is", () => {
  it("NON-VACUITY: every speed in this briefing is ABOVE the gate", () => {
    // The measurement that makes the pointer load-bearing rather than polite.
    // If this ever goes green-by-accident — because someone put a low number in
    // the briefing — the pointer is no longer the only thing standing between
    // the student and an unstated threshold, and this file must be re-reasoned
    // rather than deleted.
    for (const c of approachCards()) {
      expect(c.briefNums.length, `L${c.level}: briefing states no speed at all`).toBeGreaterThan(0);
      expect(
        Math.min(...c.briefNums),
        `L${c.level}: briefing's strictest figure ${Math.min(...c.briefNums)} vs gate ${c.gate}`,
      ).toBeGreaterThan(c.gate);
    }
  });

  it("so it points at the surface that does state it, and disowns the cruise figure", () => {
    for (const c of approachCards()) {
      expect(c.brief, `L${c.level}: nothing points at the graded number`).toMatch(
        /задачата на екрана/,
      );
      expect(c.brief, `L${c.level}: the graded number is not identified as such`).toMatch(
        /по което те оценяват/,
      );
      // And the cruise figure is scoped to where it applies, instead of reading
      // as the speed for the whole drill.
      expect(c.brief, `L${c.level}: 45 км/ч is still unscoped`).toMatch(/СРЕДАТА на блока/);
    }
  });

  it("the pointer stays a POINTER — no hard-coded copy of the approach figure", () => {
    // A numeral equal to the gate or the authored cap in the briefing would be
    // a second source of truth for the one number this drill must not have two
    // of. 45 is the only figure the briefing spells with a unit — „ограничението
    // е 50" carries no „км/ч", which is also why the advisor censuses see one
    // number here and not two.
    for (const c of approachCards()) {
      expect(new Set(c.briefNums), `L${c.level}`).toEqual(new Set([45]));
      expect(c.briefNums, `L${c.level}: the approach figure is duplicated in prose`).not.toContain(
        c.authored,
      );
    }
  });
});
