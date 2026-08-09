/**
 * THE RUNG, DERIVED — the pin on the function the product did not have.
 *
 * ===========================================================================
 * WHAT WAS BROKEN
 * ===========================================================================
 * `content/law/penalties.json` held `pen-speeding-urban-21-30`: a hand-authored
 * row written for exactly one set of numbers — the founder's own ticket, 78 in
 * a 50. It reconciled. Nothing else did, because NO FUNCTION ANYWHERE took
 * (measured, limit) and returned a rung. A student caught at 96 in a 50 got
 * ЗДвП чл. 182's whole table and no row, and the moment he tried a second speed
 * the answer disappeared.
 *
 * `deriveSpeedingBand` is that function, and this file is what makes it a
 * derivation rather than a second hand-authored table:
 *
 *  1. THE TOLERANCE IS NOT A FLAT 3. НСИПМК чл. 425, ал. 1, т. 2 gives ± 3 km/h
 *     up to 100 km/h and ± 3 % above, so at 140 it is 4,2. A hard-coded 3 is
 *     the folk version of the very rule this wave exists to correct, so the
 *     branch is tested on both sides of 100 and the two constants are asserted
 *     to have been PARSED out of the quote rather than typed beside it.
 *  2. THE LADDER HAS NO HOLES. Every whole km/h from 1 to 200 is walked through
 *     all three alineas; each must land on exactly one rung. That is the check
 *     that catches ал. 1's shape — „над 40" and „над 50" with no 41–50 row
 *     between them — being read as an overlap or as a gap.
 *  3. THE FIGURES ARE STILL THE ACT'S. Every rung of all three ladders is
 *     re-cut from `content/law/acts/zdvp.json`, and — because ал. 1, ал. 2 and
 *     ал. 3 open with the SAME two sentences — from the RIGHT ALINEA of it.
 *     A quote alone cannot tell those three apart; this does.
 *  4. THE FOUNDER'S OWN TICKET still reconciles: 78 measured in a 50 → 75 → 25
 *     over → чл. 182, ал. 1, т. 3 → 100 лв. → 51,13 €, електронен фиш, zero
 *     контролни точки. Money, not licence points.
 *
 * NEGATIVE CONTROLS ARE INCLUDED. A checker that cannot fail has not passed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXCESS_ROUNDING_NOTE_BG,
  ROAD_CONSEQUENCES,
  SPEEDING_LADDERS,
  TOLERANCE,
  TOLERANCE_DELEGATION,
  TOLERANCE_SIZE,
  TOLERANCE_SUBTRACTION,
  deriveSpeedingBand,
  deviceToleranceKmh,
  encodeSpeedMeasurement,
  eurCentsFromBgn,
  formatEur,
  formatKmh,
  parseSpeedMeasurement,
  type SpeedingScope,
} from "../consequences";

// ---------------------------------------------------------------------------
// The act, straight off disk — same normalisation the law loader applies
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");

const norm = (s: string): string =>
  s
    .replace(/­/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

function unitText(file: string, ref: string): string {
  const parsed = JSON.parse(
    readFileSync(path.join(repoRoot, "content/law/acts", file), "utf-8"),
  ) as { units: Array<{ ref: string; textBg: string }> };
  const unit = parsed.units.find((u) => u.ref === ref);
  if (unit === undefined) throw new Error(`${file} has no unit "${ref}"`);
  return unit.textBg;
}

/**
 * чл. 182 split into its alineas, so a rung's quote can be checked against the
 * ONE it claims to come from. ал. 1, ал. 2 and ал. 3 all contain „за
 * превишаване с 10 km/h - с глоба 20 лв.;" verbatim — an article-wide
 * `includes` would bless a quote filed under the wrong alinea, which is exactly
 * the mistake that turns a 300 лв. rung into a 400 лв. one.
 */
function alineasOf182(): Record<string, string> {
  const lines = unitText("zdvp.json", "чл. 182").split("\n");
  const out: Record<string, string> = {};
  let current: string | null = null;
  for (const line of lines) {
    const head = /^(?:Чл\. 182\..*?)?\((\d+а?)\)/.exec(line);
    if (head !== null) current = `ал. ${head[1]}`;
    if (current !== null) out[current] = `${out[current] ?? ""}\n${line}`;
  }
  return out;
}

const ALINEAS = alineasOf182();
const SCOPE_ALINEA: Record<SpeedingScope, string> = {
  urban: "ал. 1",
  outsideUrban: "ал. 2",
  publicOrDangerous: "ал. 3",
};

// ---------------------------------------------------------------------------
// 1. The tolerance — a chain of three, and it is not a flat 3
// ---------------------------------------------------------------------------

describe("the device tolerance is read out of the наредба, not remembered", () => {
  it("the three figures are parsed from the quote itself", () => {
    // If someone types the numbers in beside the quote they can drift apart.
    // These come out of `TOLERANCE_SIZE.quoteBg` at module load.
    expect(TOLERANCE).toEqual({ flatKmh: 3, upToKmh: 100, percent: 3 });
    expect(TOLERANCE_SIZE.quoteBg).toContain(`± ${TOLERANCE.flatKmh} km/h`);
    expect(TOLERANCE_SIZE.quoteBg).toContain(`до ${TOLERANCE.upToKmh} km/h`);
    expect(TOLERANCE_SIZE.quoteBg).toContain(`± ${TOLERANCE.percent} %`);
  });

  it("the whole delegation chain is quoted, all three links", () => {
    expect(TOLERANCE_DELEGATION.citationBg).toBe("ЗДвП чл. 165, ал. 3");
    expect(TOLERANCE_DELEGATION.quoteBg).toContain("се определят с наредба на министъра на вътрешните работи");
    expect(TOLERANCE_SUBTRACTION.citationBg).toBe("Наредба № 8121з-532, чл. 16, ал. 5");
    expect(TOLERANCE_SUBTRACTION.quoteBg).toContain("се приспада максимално допустимата грешка");
    // …and the middle link names the last one by article, which is the whole
    // reason the figure is two documents away from the ЗДвП.
    expect(TOLERANCE_SUBTRACTION.quoteBg).toContain("чл. 425");
    expect(TOLERANCE_SIZE.citationBg).toContain("чл. 425, ал. 1, т. 2");
  });

  it("all three quotes re-cut verbatim from content/law/acts", () => {
    for (const q of [TOLERANCE_DELEGATION, TOLERANCE_SUBTRACTION, TOLERANCE_SIZE]) {
      expect(norm(unitText(q.actFile, q.unitRef)), q.citationBg).toContain(norm(q.quoteBg));
    }
  });

  it("BELOW and AT 100 km/h it is the flat 3", () => {
    expect(deviceToleranceKmh(50).kmh).toBe(3);
    expect(deviceToleranceKmh(78).kmh).toBe(3);
    expect(deviceToleranceKmh(100).kmh).toBe(3);
    expect(deviceToleranceKmh(100).branch).toBe("flat");
  });

  it("ABOVE 100 km/h it is 3 % of the measured value — 4,2 at 140", () => {
    // The single number this whole lane exists for. „3" here would be the folk
    // version, and it is wrong by 40 %.
    const t = deviceToleranceKmh(140);
    expect(t.branch).toBe("percent");
    expect(t.kmh).toBeCloseTo(4.2, 6);
    expect(formatKmh(t.kmh)).toBe("4,2");
    expect(deviceToleranceKmh(120).kmh).toBeCloseTo(3.6, 6);
    expect(deviceToleranceKmh(200).kmh).toBeCloseTo(6, 6);
    // …and the branch flips the moment 100 is passed, not at 101.
    expect(deviceToleranceKmh(100.5).branch).toBe("percent");
    expect(deviceToleranceKmh(100.5).kmh).toBeGreaterThan(3);
  });

  it("the label carries the RULE, not only the number", () => {
    expect(deviceToleranceKmh(78).labelBg).toContain("за скорости до 100 km/h");
    expect(deviceToleranceKmh(140).labelBg).toContain("% от измерената стойност");
    expect(deviceToleranceKmh(140).labelBg).toContain("4,2 km/h");
  });

  it("refuses nonsense rather than inventing a tolerance for it", () => {
    expect(() => deviceToleranceKmh(Number.NaN)).toThrow(RangeError);
    expect(() => deviceToleranceKmh(-1)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// 2. The ladders are the act's own, from the right alinea
// ---------------------------------------------------------------------------

describe("all three ladders are cut from ЗДвП чл. 182, alinea by alinea", () => {
  it("each scope has the act's six rungs", () => {
    for (const scope of Object.keys(SPEEDING_LADDERS) as SpeedingScope[]) {
      expect(SPEEDING_LADDERS[scope], scope).toHaveLength(6);
    }
  });

  it("every rung's sentence is in the alinea it names — not merely in the article", () => {
    const bad: string[] = [];
    for (const scope of Object.keys(SPEEDING_LADDERS) as SpeedingScope[]) {
      const alinea = SCOPE_ALINEA[scope];
      for (const tier of SPEEDING_LADDERS[scope]) {
        if (!tier.pointRefBg.includes(alinea)) {
          bad.push(`${scope}/${tier.bandBg}: citation "${tier.pointRefBg}" does not name ${alinea}`);
          continue;
        }
        if (!norm(ALINEAS[alinea] ?? "").includes(norm(tier.fine.source.quoteBg))) {
          bad.push(`${scope}/${tier.bandBg}: sentence is not inside чл. 182, ${alinea}`);
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("the alinea splitter really splits (a probe that matched everything would pass anything)", () => {
    expect(Object.keys(ALINEAS)).toEqual(
      expect.arrayContaining(["ал. 1", "ал. 2", "ал. 3", "ал. 3а"]),
    );
    // The 41–50 row exists outside town and does NOT exist in it.
    expect(norm(ALINEAS["ал. 2"])).toContain("за превишаване от 41 до 50 km/h - с глоба 400 лв.");
    expect(norm(ALINEAS["ал. 1"])).not.toContain("за превишаване от 41 до 50 km/h");
    // …and ал. 3's 21–30 rung is 150, not ал. 1's 100 — the alineas differ.
    expect(norm(ALINEAS["ал. 3"])).toContain("от 21 до 30 km/h - с глоба 150 лв.");
    expect(norm(ALINEAS["ал. 1"])).toContain("от 21 до 30 km/h - с глоба 100 лв.");
  });

  it("every глоба is the лв. figure written in its own rung's sentence", () => {
    const bad: string[] = [];
    for (const scope of Object.keys(SPEEDING_LADDERS) as SpeedingScope[]) {
      for (const tier of SPEEDING_LADDERS[scope]) {
        if (!norm(tier.fine.source.quoteBg).includes(`${tier.fine.amountBgn} лв.`)) {
          bad.push(`${scope}/${tier.bandBg}: quote does not say "${tier.fine.amountBgn} лв."`);
        }
        expect(tier.fine.eurCents, `${scope}/${tier.bandBg}`).toBe(eurCentsFromBgn(tier.fine.amountBgn));
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("контролни точки fall on the top rungs only, and т. 12 names them", () => {
    // ал. 1: т. 5 AND т. 6 (ДВ, бр. 49 от 2026 г. widened it). ал. 2 and ал. 3:
    // т. 6 alone. That asymmetry is the наредба's, not ours.
    const pointed = (scope: SpeedingScope): string[] =>
      SPEEDING_LADDERS[scope].filter((t) => (t.controlPoints.points ?? 0) > 0).map((t) => t.pointRefBg);
    expect(pointed("urban")).toEqual(["ЗДвП чл. 182, ал. 1, т. 5", "ЗДвП чл. 182, ал. 1, т. 6"]);
    expect(pointed("outsideUrban")).toEqual(["ЗДвП чл. 182, ал. 2, т. 6"]);
    expect(pointed("publicOrDangerous")).toEqual(["ЗДвП чл. 182, ал. 3, т. 6"]);
    // …and т. 12 names each of those rungs in its own compressed wording.
    const NAMED_IN_T12: Record<SpeedingScope, string> = {
      urban: "чл. 182, ал. 1, т. 5 и 6",
      outsideUrban: "ал. 2, т. 6",
      publicOrDangerous: "ал. 3, т. 6",
    };
    for (const scope of Object.keys(SPEEDING_LADDERS) as SpeedingScope[]) {
      for (const tier of SPEEDING_LADDERS[scope]) {
        if ((tier.controlPoints.points ?? 0) > 0) {
          expect(tier.controlPoints.points).toBe(18);
          const q = norm(tier.controlPoints.source.quoteBg);
          expect(q).toContain("18 контролни точки");
          expect(q, `${scope}/${tier.pointRefBg}`).toContain(NAMED_IN_T12[scope]);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The bands cover every speed exactly once
// ---------------------------------------------------------------------------

describe("every whole km/h over the limit lands on exactly one rung", () => {
  it("no gaps and no overlaps, 1..200, in all three alineas", () => {
    const bad: string[] = [];
    for (const scope of Object.keys(SPEEDING_LADDERS) as SpeedingScope[]) {
      for (let over = 1; over <= 200; over += 1) {
        const hits = SPEEDING_LADDERS[scope].filter(
          (t) => over >= t.minOverKmh && (t.maxOverKmh === null || over <= t.maxOverKmh),
        );
        if (hits.length !== 1) bad.push(`${scope}: ${over} km/h over matches ${hits.length} rungs`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("ал. 1's missing 41–50 row is т. 5, and 51 upward is т. 6", () => {
    // The structural caveat that looks like a gap and is not.
    //
    // The limit is 30, not 50, ON PURPOSE: at a 50 limit the „51 over" probe
    // measures 104 km/h, the 3 % limb takes over, the deduction becomes 3,12
    // and the excess lands back on т. 5. That is the derivation being RIGHT,
    // but it is not what this test is about — so the probe stays under 100.
    const at = (over: number): string =>
      deriveSpeedingBand({ measuredKmh: 30 + 3 + over, limitKmh: 30, scope: "urban" }).tier?.pointRefBg ?? "—";
    expect(at(40)).toBe("ЗДвП чл. 182, ал. 1, т. 4");
    expect(at(41)).toBe("ЗДвП чл. 182, ал. 1, т. 5");
    expect(at(50)).toBe("ЗДвП чл. 182, ал. 1, т. 5");
    expect(at(51)).toBe("ЗДвП чл. 182, ал. 1, т. 6");
  });

  it("the band boundaries in this file are the ones the act words", () => {
    // Negative control on the bounds themselves: a rung whose numbers do not
    // match its own wording would sail through every test above.
    for (const scope of Object.keys(SPEEDING_LADDERS) as SpeedingScope[]) {
      for (const tier of SPEEDING_LADDERS[scope]) {
        const ranged = /^от (\d+) до (\d+) km\/h$/.exec(tier.bandBg);
        const over = /^над (\d+) km\/h$/.exec(tier.bandBg);
        if (ranged !== null) {
          expect([tier.minOverKmh, tier.maxOverKmh], tier.pointRefBg).toEqual([
            Number(ranged[1]),
            Number(ranged[2]),
          ]);
        } else if (over !== null) {
          expect(tier.minOverKmh, tier.pointRefBg).toBe(Number(over[1]) + 1);
        } else {
          expect(tier.bandBg, tier.pointRefBg).toBe("с 10 km/h");
          expect([tier.minOverKmh, tier.maxOverKmh]).toEqual([1, 10]);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. The worked cases — including the one the founder actually paid
// ---------------------------------------------------------------------------

describe("(measured, limit, scope) → the rung", () => {
  it("THE FOUNDER'S OWN ТICKET: 78 in a 50 is money, not licence points", () => {
    const b = deriveSpeedingBand({ measuredKmh: 78, limitKmh: 50, scope: "urban" });
    expect(b.tolerance.kmh).toBe(3);
    expect(b.chargedKmh).toBe(75);
    expect(b.excessWholeKmh).toBe(25);
    expect(b.tier?.pointRefBg).toBe("ЗДвП чл. 182, ал. 1, т. 3");
    expect(b.tier?.bandBg).toBe("от 21 до 30 km/h");
    expect(b.totalBgn).toBe(100);
    expect(formatEur(b.totalEurCents ?? 0)).toBe("51,13 €"); // the amount on his фиш
    expect(b.tier?.controlPoints.status).toBe("not-listed");
    expect(b.tier?.controlPoints.points).toBe(0);
    expect(b.tier?.fine.banBg).toBeNull();
    expect(b.instruments).toEqual(["фиш", "електронен фиш"]);
    expect(b.escalation).toBeNull();
  });

  it("THE CASE THAT USED TO GET THE WHOLE TABLE: 96 in a 50", () => {
    // 96 − 3 = 93, i.e. 43 over → ал. 1, т. 5 „над 40": 600 лв., two months, 18
    // контролни точки, and a фиш is foreclosed because there is a ban.
    const b = deriveSpeedingBand({ measuredKmh: 96, limitKmh: 50, scope: "urban" });
    expect(b.excessWholeKmh).toBe(43);
    expect(b.tier?.pointRefBg).toBe("ЗДвП чл. 182, ал. 1, т. 5");
    expect(b.totalBgn).toBe(600);
    expect(b.tier?.controlPoints.points).toBe(18);
    expect(b.tier?.fine.banBg).toBe("два месеца лишаване от право да управлява моторно превозно средство");
    expect(b.instruments).toEqual(["акт"]);
    expect(b.verdictBg).toContain("АУАН → наказателно постановление");
  });

  it("A MOTORWAY SPEED: 140 measured on a 90 road, where the tolerance is 4,2", () => {
    const b = deriveSpeedingBand({ measuredKmh: 140, limitKmh: 90, scope: "outsideUrban" });
    expect(b.tolerance.branch).toBe("percent");
    expect(b.tolerance.kmh).toBeCloseTo(4.2, 6);
    expect(b.chargedKmh).toBeCloseTo(135.8, 6);
    expect(b.excessKmh).toBeCloseTo(45.8, 6);
    expect(b.excessWholeKmh).toBe(45); // stepped DOWN, in the driver's favour
    expect(b.tier?.pointRefBg).toBe("ЗДвП чл. 182, ал. 2, т. 5");
    expect(b.totalBgn).toBe(400);
    expect(b.tier?.controlPoints.points).toBe(0);
    // A flat-3 tolerance would have made it 47 over — same rung here, so the
    // rung is not the proof. The ARITHMETIC on the card is.
    expect(b.arithmeticBg).toContain("4,2 km/h");
    expect(b.arithmeticBg).not.toContain("минус максимално допустимата грешка на уреда 3 km/h");
  });

  it("the 3 % branch can change the RUNG, not only the sentence", () => {
    // 141 on a 90: flat 3 → 48 over (т. 5, 400 лв.); the real 4,23 → 46,77 →
    // 46 over, still т. 5. Pick the case where it crosses: 145 on a 94.
    const flatWouldBe = 145 - 3 - 94; // 48 → т. 5
    const real = deriveSpeedingBand({ measuredKmh: 145, limitKmh: 94, scope: "outsideUrban" });
    expect(flatWouldBe).toBe(48);
    expect(real.tolerance.kmh).toBeCloseTo(4.35, 6);
    expect(real.excessWholeKmh).toBe(46);
    // and one that really does move a rung: 105 measured, limit 50.
    const a = deriveSpeedingBand({ measuredKmh: 105, limitKmh: 50, scope: "urban" });
    expect(a.tolerance.kmh).toBeCloseTo(3.15, 6);
    expect(a.excessWholeKmh).toBe(51);
    expect(a.tier?.pointRefBg).toBe("ЗДвП чл. 182, ал. 1, т. 6");
  });

  it("т. 6's escalator is applied from the act's own words, not from a table", () => {
    // 111 measured in a 50. Above 100, so the deduction is 3 % = 3,33 (a flat
    // 3 would have said 58 over) → 107,67 → 57 over → т. 6: 700 лв. base, and
    // „за всеки следващи 5 km/h превишаване над 50 km/h глобата се увеличава с
    // 50 лв." gives one full step → 750 лв.
    const b = deriveSpeedingBand({ measuredKmh: 111, limitKmh: 50, scope: "urban" });
    expect(b.tolerance.branch).toBe("percent");
    expect(b.tolerance.kmh).toBeCloseTo(3.33, 6);
    expect(b.excessWholeKmh).toBe(57);
    expect(b.tier?.pointRefBg).toBe("ЗДвП чл. 182, ал. 1, т. 6");
    expect(b.escalation?.steps).toBe(1);
    expect(b.escalation?.addedBgn).toBe(50);
    expect(b.totalBgn).toBe(750);
    expect(b.totalEurCents).toBe(eurCentsFromBgn(750));
    // 51–54 over is inside т. 6 but has not completed a 5 km/h step yet.
    const justOver = deriveSpeedingBand({ measuredKmh: 105, limitKmh: 50, scope: "urban" });
    expect(justOver.escalation).toBeNull();
    expect(justOver.totalBgn).toBe(700);
    // and ал. 3's т. 6 escalates too, despite the act's Cyrillic „кm/h" typo.
    const bus = deriveSpeedingBand({ measuredKmh: 158, limitKmh: 90, scope: "publicOrDangerous" });
    expect(bus.excessWholeKmh).toBe(63);
    expect(bus.escalation?.steps).toBe(2);
    expect(bus.totalBgn).toBe(1100);
  });

  it("the same numbers cost different money in a different alinea", () => {
    // 35 over: 400 лв. in town (ал. 1, т. 4), 300 лв. outside (ал. 2, т. 4),
    // 500 лв. for a bus (ал. 3, т. 4). Guessing the scope is guessing the fine
    // — which is why the scope is a required input and never defaulted.
    const at = (scope: SpeedingScope): number | null =>
      deriveSpeedingBand({ measuredKmh: 88, limitKmh: 50, scope }).totalBgn;
    expect(at("urban")).toBe(400);
    expect(at("outsideUrban")).toBe(300);
    expect(at("publicOrDangerous")).toBe(500);
  });

  it("when the tolerance swallows the excess there is NO rung and no number", () => {
    // 52 measured in a 50 → 49 → below the limit. The answer is „no offence",
    // which is a finding, not a gap: the card must not fall back to the table.
    const b = deriveSpeedingBand({ measuredKmh: 52, limitKmh: 50, scope: "urban" });
    expect(b.tier).toBeNull();
    expect(b.totalBgn).toBeNull();
    expect(b.totalEurCents).toBeNull();
    expect(b.instruments).toBeNull();
    expect(b.verdictBg).toContain("няма превишаване");
    expect(b.verdictBg).not.toMatch(/\d+\s*лв\./);
    expect(b.verdictBg).not.toMatch(/\d+\s*€/);
    // …and it says the deduction is a road rule, not an exam allowance.
    expect(b.verdictBg).toContain("не е част от оценката на урока");
    // 53,x in a 50 is still nothing; 54 is the first km/h that bites.
    expect(deriveSpeedingBand({ measuredKmh: 53.9, limitKmh: 50, scope: "urban" }).tier).toBeNull();
    expect(deriveSpeedingBand({ measuredKmh: 54, limitKmh: 50, scope: "urban" }).tier?.pointRefBg).toBe(
      "ЗДвП чл. 182, ал. 1, т. 1",
    );
  });

  it("the student-facing lines carry the arithmetic, the rule and the verdict", () => {
    const b = deriveSpeedingBand({ measuredKmh: 78, limitKmh: 50, scope: "urban" });
    expect(b.linesBg).toEqual([b.arithmeticBg, b.toleranceBg, b.verdictBg]);
    expect(b.arithmeticBg).toContain("Измерено 78 km/h при ограничение 50 km/h");
    expect(b.arithmeticBg).toContain("75 km/h");
    expect(b.arithmeticBg).toContain("превишаване с 25 km/h");
    // The tolerance line quotes the наредба and names all three articles.
    expect(b.toleranceBg).toContain(TOLERANCE_SIZE.quoteBg);
    expect(b.toleranceBg).toContain("чл. 425, ал. 1, т. 2");
    expect(b.toleranceBg).toContain("Наредба № 8121з-532, чл. 16, ал. 5");
    expect(b.toleranceBg).toContain("ЗДвП чл. 165, ал. 3");
    expect(b.toleranceBg).toContain("не позволени километри");
    // And the rounding direction is declared as OURS, not as the law's.
    expect(EXCESS_ROUNDING_NOTE_BG).toContain("законът не казва как се закръглява");
  });

  it("refuses impossible inputs instead of returning a rung for them", () => {
    expect(() => deriveSpeedingBand({ measuredKmh: Number.NaN, limitKmh: 50, scope: "urban" })).toThrow(RangeError);
    expect(() => deriveSpeedingBand({ measuredKmh: 60, limitKmh: 0, scope: "urban" })).toThrow(RangeError);
    expect(() => deriveSpeedingBand({ measuredKmh: 60, limitKmh: -50, scope: "urban" })).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// 5. The two numbers survive the trip from the reducer to the card
// ---------------------------------------------------------------------------

describe("the measurement rides on the event that used to carry nothing", () => {
  it("round-trips through the detail string", () => {
    expect(parseSpeedMeasurement(encodeSpeedMeasurement(63.42, 50))).toEqual({
      measuredKmh: 63.4,
      limitKmh: 50,
    });
    expect(parseSpeedMeasurement(encodeSpeedMeasurement(140, 90))).toEqual({
      measuredKmh: 140,
      limitKmh: 90,
    });
  });

  it("fits the wire cap (lessons/wire.ts drops a detail longer than 64)", () => {
    expect(encodeSpeedMeasurement(999.9, 140).length).toBeLessThanOrEqual(64);
  });

  it("cannot be confused with the other things that ride in detail", () => {
    // Pre-drive step ids, „give-way", „no-stop", „vehicle" — every existing
    // detail value must parse to null, or `rebuildRuleEvents` would start
    // deriving speeds from a skipped seatbelt check.
    for (const other of ["give-way", "emergency", "vehicle", "no-stop", "entered-barred", "seatbelt", ""]) {
      expect(parseSpeedMeasurement(other), other).toBeNull();
    }
    expect(parseSpeedMeasurement(undefined)).toBeNull();
    expect(parseSpeedMeasurement("v50/l0")).toBeNull();
    expect(parseSpeedMeasurement("vabc/l50")).toBeNull();
  });

  it("the ladder codes are exactly the codes the reducer tags", () => {
    // If a third speeding code appears, it needs the tag too — this is the
    // reminder, pinned where the derivation lives.
    const ladders = Object.entries(ROAD_CONSEQUENCES)
      .filter(([, r]) => r?.kind === "ladder")
      .map(([code]) => code)
      .sort();
    expect(ladders).toEqual(["SPEEDING_DANGEROUS", "SPEEDING_OVER_LIMIT"]);
  });
});
