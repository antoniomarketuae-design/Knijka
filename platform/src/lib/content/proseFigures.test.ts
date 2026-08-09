/**
 * THE CHECKER, UNDER TEST.
 *
 * A gate that cannot fail has not passed. Every rule in `proseFigures.ts` is
 * driven here with a string that must be REFUSED as well as one that must be
 * accepted, because the failure mode of a scanner is silence: the regex stops
 * matching, every file comes back clean, and the report says the prose is fine.
 *
 * The specimens are real. „50 метра“ is the fabricated railway-crossing figure
 * that shipped marked approved; the euro conversions and the camera-tolerance
 * chain are the sentences this wave was opened to make checkable.
 */
import { describe, expect, it } from "vitest";
import {
  classifyNumeral,
  inlineCitations,
  locatorSpans,
  scanProseNumerals,
  verifyProse,
  type ProseEvidence,
} from "./proseFigures";

const only = (text: string): ReturnType<typeof scanProseNumerals> => scanProseNumerals(text);
const raws = (text: string): string[] => only(text).map((n) => n.raw);
const patterns = (text: string): string[] => [...new Set(locatorSpans(text).map((s) => s.pattern))];

// ---------------------------------------------------------------------------
// 1. Locators — the numbers that are coordinates, not claims
// ---------------------------------------------------------------------------

describe("a citation coordinate is not a claim about the world", () => {
  it("swallows an article/alinea/point chain whole, including its list", () => {
    expect(raws("чл. 6, ал. 1, т. 1, 3, 12 – 14 и 16, както и ал. 2")).toEqual([]);
    expect(patterns("чл. 6, ал. 1")).toContain("citation-run");
  });

  it("reads the capitalised and spelled-out forms too", () => {
    // „Чл. 183“ opens a sentence and „Алинея 4“ is the same coordinate in words.
    // Both used to read as the bare claims „183“ and „4“.
    expect(raws("Чл. 183 не предвижда това. Алинея 4 изчерпва наказанието.")).toEqual([]);
  });

  it("does not swallow the figure that follows the coordinate", () => {
    // THE RULE THAT EARNS ITS KEEP: the run stops at the first non-number, so
    // „т. 5 — …600 лв.“ leaves the 600 exposed to the check.
    const found = only("чл. 182, ал. 1, т. 5 - с глоба 600 лв. и два месеца");
    expect(found.map((n) => n.raw)).toEqual(["600"]);
    expect(found[0].unitBg).toBe("лв.");
  });

  it("knows a road-sign code is a name, not a number", () => {
    // „знак Б2“ would otherwise be the claim „2“ on every sign in the product.
    expect(raws("Не спира на знак Б2 „Спри!“, нито на В24 или А1")).toEqual([]);
  });

  it("knows a year, a date, an act designator and a slug id", () => {
    expect(
      raws("ДВ, бр. 49 от 29.05.2026 г.; Наредба № Iз-2539; ERC 2025; q-ptp-063; към 2026-08-04"),
    ).toEqual([]);
  });

  it("knows an alinea marker inside a verbatim excerpt", () => {
    expect(raws("…се дължи в пълен размер. (6) (Нова - ДВ,")).toEqual([]);
  });

  it("NEGATIVE CONTROL: a real figure is never mistaken for a coordinate", () => {
    // If the masking ever grows greedy, this is the assertion that catches it.
    expect(raws("глоба 100 лв. и 10 контролни точки")).toEqual(["100", "10"]);
    expect(raws("превишаване над 40 km/h")).toEqual(["40"]);
  });
});

// ---------------------------------------------------------------------------
// 2. Units — what turns a number into a claim
// ---------------------------------------------------------------------------

describe("a number is read together with the unit that governs it", () => {
  it("attaches the unit that follows", () => {
    const [n] = only("с глоба 100 лв.");
    expect([n.raw, n.unitBg]).toEqual(["100", "лв."]);
  });

  it("hands a run's unit back to every member of it", () => {
    // The act writes the unit once, at the end: „18/21/26 контролни точки“.
    expect(only("(18/21/26 контролни точки)").map((n) => n.unit)).toEqual([
      "control-points",
      "control-points",
      "control-points",
    ]);
    expect(only("5–6 см").map((n) => n.unit)).toEqual(["cm", "cm"]);
    expect(only("над 40 и над 50 km/h").map((n) => n.unit)).toEqual(["kmh", "kmh"]);
  });

  it("NEGATIVE CONTROL: a connector followed by a WORD is not a run", () => {
    // „75, тоест превишаване с 25“ — two independent claims. If this ever
    // became a run, 75 would inherit a unit it does not have and the two
    // numbers would stop being judged separately.
    const found = only("разглежда се като 75, тоест превишаване с 25");
    expect(found.map((n) => n.unit)).toEqual([null, null]);
  });

  it("reads a shouted unit — the copy shouts exactly where it matters", () => {
    expect(only("дава 10 НАКАЗАТЕЛНИ точки").map((n) => n.unit)).toEqual(["exam-points"]);
  });
});

// ---------------------------------------------------------------------------
// 3. Grounding
// ---------------------------------------------------------------------------

const ZDVP_182 = "за превишаване от 21 до 30 km/h - с глоба 100 лв.; за превишаване над 40 km/h - с глоба 600 лв. и два месеца лишаване от право да управлява моторно превозно средство;";

describe("a figure is grounded only when its own unit is in the evidence too", () => {
  const evidence: ProseEvidence = { quotes: [ZDVP_182] };

  it("accepts a number and unit that occur together", () => {
    const [n] = only("глобата е 100 лв.");
    expect(classifyNumeral(n, evidence)).toEqual({ kind: "quoted", matched: "100 лв." });
  });

  it("accepts a band worded as one phrase, from either endpoint", () => {
    const [low] = only("превишаване с 21 – 30 km/h");
    expect(classifyNumeral(low, evidence).kind).toBe("quoted");
  });

  it("REFUSES a fabricated figure — the „50 метра“ shape that shipped", () => {
    const [n] = only("спри поне 50 метра преди прелеза");
    const verdict = classifyNumeral(n, evidence);
    expect(verdict.kind).toBe("refused");
    if (verdict.kind === "refused") expect(verdict.why).toContain("50 метра");
  });

  it("REFUSES a right number wearing the wrong unit", () => {
    // 100 is in the evidence — as лв. „100 метра“ is not, and must not pass.
    expect(classifyNumeral(only("на 100 метра")[0], evidence).kind).not.toBe("quoted");
  });

  it("does not let a neighbouring number ground this one", () => {
    // „10 лв.“ is a substring of „100 лв.“ and „600 лв.“. A plain `includes`
    // grounds it; a whole-number boundary does not.
    expect(classifyNumeral(only("глоба 10 лв.")[0], evidence).kind).not.toBe("quoted");
    expect(classifyNumeral(only("глоба 60 лв.")[0], evidence).kind).not.toBe("quoted");
  });

  it("marks a digits-only hit as weak rather than passing it", () => {
    // 30 is in „от 21 до 30 km/h“ and says nothing about a number of months.
    const verdict = classifyNumeral(only("30 месеца")[0], evidence);
    expect(verdict.kind).toBe("digits-only");
  });
});

// ---------------------------------------------------------------------------
// 4. Declared figures — derived, stipulated, constant
// ---------------------------------------------------------------------------

describe("a number the corpus cannot supply has to be declared, and is re-checked", () => {
  const base = { quotes: [ZDVP_182] };

  it("re-runs the arithmetic instead of believing the label", () => {
    const evidence: ProseEvidence = {
      ...base,
      constants: [{ valueBg: "1,95583", whyBg: "фиксиран курс" }],
      derived: [
        { valueBg: "51,13", op: "divide-round-2", inputsBg: ["100", "1,95583"], howBg: "100 ÷ 1,95583" },
      ],
    };
    const report = verifyProse("t", "100 лв. по курса 1,95583 лв. за евро са 51,13 EUR", evidence);
    expect(report.problems).toEqual([]);
    expect(report.counts.derived).toBe(1);
    expect(report.counts.constant).toBe(1);
  });

  it("REFUSES a derivation whose arithmetic does not come out", () => {
    const evidence: ProseEvidence = {
      ...base,
      constants: [{ valueBg: "1,95583", whyBg: "фиксиран курс" }],
      derived: [
        { valueBg: "61,13", op: "divide-round-2", inputsBg: ["100", "1,95583"], howBg: "100 ÷ 1,95583" },
      ],
    };
    const report = verifyProse("t", "100 лв. по курса 1,95583 лв. са 61,13 EUR", evidence);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0].verdict.kind).toBe("refused");
  });

  it("REFUSES a derivation whose operand is itself unaccounted for", () => {
    // THE CLOSURE. Without it, „51,13 = 100 ÷ 1,95583“ grounds the answer on a
    // divisor nobody ever checked — which is how an invented figure acquires a
    // formula and stops looking invented.
    const evidence: ProseEvidence = {
      ...base,
      derived: [
        { valueBg: "51,13", op: "divide-round-2", inputsBg: ["100", "1,95583"], howBg: "100 ÷ 1,95583" },
      ],
    };
    const report = verifyProse("t", "100 лв. по курса 1,95583 лв. за евро са 51,13 EUR", evidence);
    const whys = report.problems.map((p) =>
      p.verdict.kind === "refused" ? p.verdict.why : "",
    );
    expect(whys.some((w) => w.includes("not itself accounted for"))).toBe(true);
  });

  it("takes a worked example's premise as declared, not as law", () => {
    const evidence: ProseEvidence = {
      quotes: ["± 3 km/h за скорости до 100 km/h"],
      stipulated: [
        { valueBg: "78", whyBg: "условие на примера" },
        { valueBg: "50", whyBg: "условие на примера" },
      ],
      derived: [
        { valueBg: "75", op: "minus", inputsBg: ["78", "3"], howBg: "78 − 3" },
        { valueBg: "25", op: "minus", inputsBg: ["75", "50"], howBg: "75 − 50" },
      ],
    };
    const report = verifyProse(
      "t",
      "±3 km/h до 100 km/h, затова 78 км/ч на път с 50 се разглежда като 75, тоест превишаване с 25.",
      evidence,
    );
    expect(report.problems).toEqual([]);
    expect(report.counts.stipulated).toBe(2);
    expect(report.counts.derived).toBe(2);
  });

  it("an undeclared number in the same sentence is still refused", () => {
    const report = verifyProse("t", "78 км/ч се разглежда като 75", { quotes: [ZDVP_182] });
    expect(report.problems.map((p) => p.numeral)).toEqual(["78", "75"]);
  });
});

// ---------------------------------------------------------------------------
// 5. The sentence that cites itself
// ---------------------------------------------------------------------------

describe("inline citations are found in both word orders", () => {
  it("act first", () => {
    expect(inlineCitations("по ЗДвП чл. 186, ал. 1 глобата може…")).toEqual([
      { actBg: "ЗДвП", refBg: "чл. 186" },
    ]);
  });

  it("article first, with the definite article on the act", () => {
    // „чл. 425 от Наредбата за средствата за измерване“ — the order Bulgarian
    // legal prose uses just as often, and the one a forward-only reader
    // silently attributes to whatever act was named before it.
    const found = inlineCitations("препраща към чл. 425 от Наредбата за средствата за измерване");
    expect(found).toHaveLength(1);
    expect(found[0].refBg).toBe("чл. 425");
    expect(found[0].actBg.startsWith("Наредба за средствата")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. The gate reads what the student reads
// ---------------------------------------------------------------------------

describe("staff annotations are stripped before the scan, as they are before render", () => {
  it("does not report a figure that only exists inside a [REVIEW: …] note", () => {
    // 151 question rows carry one. Scanning the raw JSON reports „90“ and
    // „6.4“ in every one of them and buries the real findings.
    const report = verifyProse("t", "[REVIEW: одит 90 §6.4 — виж 12 метра] Спри на знак Б2.", {
      quotes: [],
    });
    expect(report.problems).toEqual([]);
  });
});
