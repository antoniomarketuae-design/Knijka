/**
 * sc-ac-ice — THE DRILL THAT ORDERS A CRAWL MAY NOT FINE THE CRAWL.
 *
 * `sc-ac-ice:90f0d390` (filed 2026-09-14 off w45 `sc-ac-ice__pc-right`
 * 08-debrief-p5/p6): «Намали до пълзене ПРЕДИ леда» credited at 1:48, then
 * «Движение с необосновано ниска скорост −1 · ВТОРОСТЕПЕННА ГРЕШКА» at 3:13 on
 * the same sheet, the card justifying it with «нямаше … лоши условия».
 *
 * The repair is a per-lesson switch (`ruleConfig.townCrawlEnabled: false` on the
 * template). What this pins:
 *   1. every rung of the COMPILED lesson carries it — the path
 *      `lessons/engine.ts` hands to `createRuleEngine`;
 *   2. it is on the TEMPLATE, so no rung differs from another and `compile.ts`
 *      does not invent «Оценява се по-строго» for a rung that grades nothing
 *      stricter;
 *   3. the switch is scoped: an ordinary town lesson keeps the detector on, so
 *      this is not the dead-predicate class (the fault shipping OFF everywhere).
 */
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SC_AC_ICE } from "../templates-conditions";
import { SC_JUNCTION_RHR } from "../templates-junctions";
import { DEFAULT_RULE_CONFIG } from "../../../rules/types";

const LEVELS = SC_AC_ICE.levels.map((l) => l.level);

describe("sc-ac-ice keeps the crawl it orders out of the grade", () => {
  it.each(LEVELS)("L%i compiles with the town-crawl detector OFF", (level) => {
    const lesson = compileScenario(SC_AC_ICE, level);
    expect(lesson.ruleConfig?.townCrawlEnabled).toBe(false);
  });

  it("sets it on the template, not on any rung — so no rung reads as «Оценява се по-строго»", () => {
    expect(SC_AC_ICE.ruleConfig?.townCrawlEnabled).toBe(false);
    for (const rung of SC_AC_ICE.levels) {
      expect((rung as { ruleConfig?: unknown }).ruleConfig).toBeUndefined();
    }
  });

  it("does not switch the detector off anywhere else — an ordinary town drill still grades a causeless crawl", () => {
    expect(DEFAULT_RULE_CONFIG.townCrawlEnabled).toBe(true);
    const other = compileScenario(SC_JUNCTION_RHR, 1);
    expect(other.ruleConfig?.townCrawlEnabled).not.toBe(false);
  });
});
