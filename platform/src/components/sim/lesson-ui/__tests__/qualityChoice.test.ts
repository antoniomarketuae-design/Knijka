/**
 * §I26(c) — THE WORDS THE QUALITY ROW SAYS, AND THE ROOM THEY HAVE TO SAY IT.
 *
 * These are not label tests. Under THEO-4 (founder-ratified: no bare verdicts)
 * a setting that changes the experience without stating what it costs is the
 * same defect as a correct/wrong answer with no explanation, one layer out from
 * the theory module — so „what does this tier trade" is a product requirement,
 * and a product requirement gets a test.
 *
 * The length assertions are the other half. The compact sheet is 240 px wide
 * and the menu it lives in was measured on the deployed build with 3 px of
 * clearance over the indicator arc on iPhone-16 portrait: a trade line that
 * grows from two rendered lines to three costs 12.5 px of menu height and takes
 * a driving control down with it. So the copy has a budget, and the budget is
 * enforced here rather than discovered in a sweep.
 */
import { describe, expect, it } from "vitest";
import {
  nextQualitySelection,
  QUALITY_CYCLE,
  QUALITY_TRADE_MAX_CHARS,
  qualityAriaLabelBg,
  qualityLevelLabelBg,
  qualityTradeBg,
  qualityValueBg,
  type QualitySelection,
} from "../qualityChoice";
import { QUALITY_PRESETS, type QualityPreset } from "../types";

const LEVELS: QualityPreset[] = ["low", "medium", "high"];

describe("the cycle", () => {
  it("offers auto and all three tiers, auto first", () => {
    expect(QUALITY_CYCLE).toEqual(["auto", "low", "medium", "high"]);
  });

  it("comes home to auto — a student can always hand the choice back", () => {
    // Without this the row is a one-way door: one press overrules the
    // auto-quality probe forever with no route back and nothing saying so.
    let sel: QualitySelection = "auto";
    const seen: QualitySelection[] = [];
    for (let i = 0; i < QUALITY_CYCLE.length; i += 1) {
      sel = nextQualitySelection(sel);
      seen.push(sel);
    }
    expect(seen).toEqual(["low", "medium", "high", "auto"]);
  });

  it("covers every tier the scene can actually render", () => {
    for (const p of QUALITY_PRESETS) expect(QUALITY_CYCLE).toContain(p.id);
  });
});

describe("the value word", () => {
  it("names the tier when the student chose one", () => {
    expect(qualityValueBg("low", "low")).toBe("Ниско");
    expect(qualityValueBg("medium", "medium")).toBe("Средно");
    expect(qualityValueBg("high", "high")).toBe("Високо");
  });

  it("names BOTH facts on auto: that nothing was chosen, and what that is right now", () => {
    // „Авто" alone would hide the one thing a student with a stuttering phone
    // is looking for.
    expect(qualityValueBg("auto", "low")).toBe("Авто · Ниско");
    expect(qualityValueBg("auto", "medium")).toBe("Авто · Средно");
  });

  it("uses the same tier words as the select screen's own control", () => {
    for (const p of QUALITY_PRESETS) {
      expect(qualityLevelLabelBg(p.id)).toBe(p.labelBg);
    }
  });
});

describe("the trade line — THEO-4's requirement, applied to a setting", () => {
  it("exists for every selection", () => {
    for (const sel of QUALITY_CYCLE) {
      const line = qualityTradeBg(sel, "low");
      expect(line.length).toBeGreaterThan(20);
      expect(line.endsWith(".")).toBe(true);
    }
  });

  it("names the COST, not only the gain, on every tier that has one", () => {
    // A student who picks «Високо» and drops to 20 fps should have been told
    // that was the trade. „Най-тежко" / „по-натоварващо" is that telling.
    expect(qualityTradeBg("high", "high")).toMatch(/тежк/);
    expect(qualityTradeBg("medium", "medium")).toMatch(/натоварващ/);
    // …and `low`'s "cost" is the honest one in the other direction: it is the
    // smoothest, and what it gives up is the picture.
    expect(qualityTradeBg("low", "low")).toMatch(/плавн/);
    expect(qualityTradeBg("low", "low")).toMatch(/Без сенки/);
  });

  it("says «Високо» is where the resolution comes from — the founder's ruling, in words", () => {
    // `maxDprFor` hands a handset its native devicePixelRatio at `high` and
    // nowhere else. The sentence the student reads has to match the code, or
    // the control is honest about the wrong thing.
    expect(qualityTradeBg("high", "high")).toMatch(/резолюц/);
    expect(qualityTradeBg("medium", "medium")).not.toMatch(/Пълна резолюция/);
  });

  it("tells an auto student who is deciding for them, and what they decided", () => {
    expect(qualityTradeBg("auto", "low")).toMatch(/телефона ти/);
    expect(qualityTradeBg("auto", "low")).toContain("Ниско");
    expect(qualityTradeBg("auto", "high")).toContain("Високо");
  });

  it("fits two rendered lines in the 208 px column — the menu-height budget", () => {
    for (const sel of QUALITY_CYCLE) {
      for (const eff of LEVELS) {
        expect(qualityTradeBg(sel, eff).length).toBeLessThanOrEqual(QUALITY_TRADE_MAX_CHARS);
      }
    }
  });
});

describe("the accessible name", () => {
  it("carries the state AND the trade, so the caption is not an orphan span", () => {
    const label = qualityAriaLabelBg("high", "high");
    expect(label).toContain("Качество");
    expect(label).toContain(qualityValueBg("high", "high"));
    expect(label).toContain(qualityTradeBg("high", "high"));
    expect(label).toMatch(/смениш/);
  });
});
