/**
 * THE GROUNDING PIN FOR THE THREE-SYSTEM MODEL.
 *
 * `consequences.ts` prints money, контролни точки and лишаване от право at a
 * seventeen-year-old. Every one of those figures is a sentence out of a statute
 * this repo holds, and this file is what makes that true rather than claimed:
 * it re-cuts EVERY quote out of `content/law/acts/*.json` on every run and
 * fails on a single changed word. Re-ingest an act after an amendment and the
 * suite goes red at the exact provision that moved.
 *
 * It also checks the three things a quote alone cannot:
 *
 *  1. THE NUMBER IS IN ITS OWN SENTENCE. A fine of 100 лв. cited with a quote
 *     that never says „100 лв." is exactly the failure ADR-002 exists to stop
 *     (this is the same rule `lib/content/law/corpus.ts verifyCitations`
 *     enforces on the penalty bank — restated here because `modules/sim` is
 *     client code and cannot import the server-only loader).
 *  2. THE ARITHMETIC. Bulgaria is in the eurozone and the acts still say лв.,
 *     so every displayed euro amount is a conversion — recomputed here from the
 *     fixed rate, including the founder's own ticket (100 лв. → 51,13 €).
 *  3. THE HONEST BLANK IS ACTUALLY BLANK. The fallback a code with no retrieved
 *     penalty gets must contain no лв., no €, and no точки count — the founder's
 *     standing ruling, asserted rather than trusted.
 *
 * NEGATIVE CONTROLS ARE INCLUDED. A checker that cannot fail has not passed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../catalog";
import {
  BGN_PER_EUR,
  CONTROL_POINTS_BUDGET,
  EXAM_VS_CONTROL_POINTS_BG,
  ROAD_CONSEQUENCES,
  UNKNOWN_ROAD,
  allLawQuotes,
  eurCentsFromBgn,
  examMarkFor,
  formatEur,
  instrumentsForBan,
  roadConsequenceFor,
  type ControlPointsFigure,
  type FineFigure,
  type LawQuote,
  type RoadConsequence,
} from "../consequences";
import { N38_CLAUSE_CLASS } from "../n38";
import { SEVERITY_POINTS, type ViolationCode } from "../types";

// ---------------------------------------------------------------------------
// The acts, straight off disk
// ---------------------------------------------------------------------------

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");

interface Act {
  actId: string;
  units: Array<{ ref: string; textBg: string }>;
}

/**
 * Whitespace, soft hyphens and dash flavours are extraction artifacts of the
 * .docx/.pdf/.html the acts came out of; WORDS are not. Same normalisation the
 * law loader applies before it compares a citation to a statute.
 */
const norm = (s: string): string =>
  s
    .replace(/­/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const actCache = new Map<string, Act>();
function act(file: string): Act {
  const hit = actCache.get(file);
  if (hit) return hit;
  const parsed = JSON.parse(
    readFileSync(path.join(repoRoot, "content/law/acts", file), "utf-8"),
  ) as Act;
  actCache.set(file, parsed);
  return parsed;
}

function unitText(q: LawQuote): string | null {
  const u = act(q.actFile).units.find((x) => x.ref === q.unitRef);
  return u ? norm(u.textBg) : null;
}

const QUOTES = allLawQuotes();

/**
 * `RoadConsequence` has four shapes and only two of them carry figures. These
 * two narrowers keep every assertion below honest about that instead of each
 * one re-deriving it (and quietly skipping a shape when a fifth is added).
 */
function finesOf(road: RoadConsequence): FineFigure[] {
  if (road.kind === "single") return [road.fine];
  if (road.kind === "ladder") return road.tiers.map((t) => t.fine);
  return [];
}

function controlPointsOf(road: RoadConsequence): ControlPointsFigure[] {
  if (road.kind === "single") return [road.controlPoints];
  if (road.kind === "ladder") return road.tiers.map((t) => t.controlPoints);
  return [];
}

// ---------------------------------------------------------------------------
// 1. Every quote is really in the act it names
// ---------------------------------------------------------------------------

describe("every figure is a sentence out of an act this repo holds", () => {
  it("the probe sees something (a scan that matches nothing passes everything)", () => {
    expect(QUOTES.length).toBeGreaterThan(15);
    // The two acts the model draws on, both reached.
    const files = new Set(QUOTES.map((q) => q.actFile));
    expect(files.has("zdvp.json")).toBe(true);
    expect(files.has("naredba-iz-2539-consolidated-dv49-2026.json")).toBe(true);
    // And the 28.01.2025 photograph is NOT one of them any more. It used to
    // hold five of these quotes, including the citation behind every „0
    // контролни точки" — a claim that the offence is absent from an exhaustive
    // list, proved against a copy whose чл. 6 has a PDF page footer sitting
    // mid-sentence in т. 3. See `citation-version.test.ts` for the general rule.
    expect(files.has("naredba-iz-2539.json")).toBe(false);
  });

  it("re-cuts verbatim from content/law/acts", () => {
    const misses: string[] = [];
    for (const q of QUOTES) {
      const text = unitText(q);
      if (text === null) {
        misses.push(`${q.actFile} has no unit "${q.unitRef}" (${q.citationBg})`);
        continue;
      }
      if (!text.includes(norm(q.quoteBg))) {
        misses.push(`${q.citationBg} — NOT in ${q.actFile} ${q.unitRef}: "${q.quoteBg.slice(0, 80)}…"`);
      }
    }
    expect(misses, misses.join("\n")).toEqual([]);
  });

  it("the re-cut can fail — negative control", () => {
    const fake: LawQuote = {
      actFile: "zdvp.json",
      unitRef: "чл. 182",
      citationBg: "ЗДвП чл. 182 (измислена)",
      quoteBg: "за превишаване от 41 до 50 km/h - с глоба 250 лв.;",
    };
    // ал. 1 has NO 41–50 band; this sentence exists nowhere in the article.
    expect(unitText(fake)?.includes(norm(fake.quoteBg))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Every number is inside its own sentence
// ---------------------------------------------------------------------------

describe("a figure is grounded only when its own quote states it", () => {
  it("every глоба's лв. amount is written in the sentence it cites", () => {
    const bad: string[] = [];
    for (const [code, road] of Object.entries(ROAD_CONSEQUENCES)) {
      if (road === undefined) continue;
      for (const f of finesOf(road)) {
        if (!norm(f.source.quoteBg).includes(`${f.amountBgn} лв.`)) {
          bad.push(`${code}: quote does not say "${f.amountBgn} лв." — ${f.source.citationBg}`);
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("every grounded контролни точки figure is written in the sentence it cites", () => {
    const bad: string[] = [];
    for (const [code, road] of Object.entries(ROAD_CONSEQUENCES)) {
      if (road === undefined || road.kind === "unknown") continue;
      for (const cp of controlPointsOf(road)) {
        if (cp.status === "grounded") {
          if (cp.points === null) bad.push(`${code}: grounded but points is null`);
          else if (!norm(cp.source.quoteBg).includes(`${cp.points} контролни точки`)) {
            bad.push(`${code}: quote does not say "${cp.points} контролни точки" — ${cp.source.citationBg}`);
          }
        } else if (cp.status === "not-listed") {
          // A 0 is a FINDING: the citation must be the exhaustive list itself,
          // and — because the finding is that something is ABSENT from it — the
          // edition must be named, so the student checks the complete text and
          // not the 2025 photograph with a vendor page footer inside чл. 6.
          expect(cp.points).toBe(0);
          expect(cp.source.citationBg).toBe("Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.), чл. 6, ал. 1");
          expect(cp.source.actFile).toBe("naredba-iz-2539-consolidated-dv49-2026.json");
          expect(norm(cp.source.quoteBg)).toContain("отнемат контролни точки, както следва:");
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("every лишаване fragment is written in the same sentence as its глоба", () => {
    for (const road of Object.values(ROAD_CONSEQUENCES)) {
      if (road === undefined || road.kind === "unknown") continue;
      for (const f of finesOf(road)) {
        if (f.banBg !== null) expect(norm(f.source.quoteBg)).toContain(norm(f.banBg));
      }
    }
  });

  it("the licence budget is parsed out of the наредба, not typed", () => {
    const max = /Максималният размер на контролните точки .* е (\d+)\.$/.exec(
      norm(CONTROL_POINTS_BUDGET.max.quoteBg),
    );
    const fresh = /получава (\d+) контролни точки/.exec(norm(CONTROL_POINTS_BUDGET.newDriver.quoteBg));
    expect(Number(max?.[1])).toBe(CONTROL_POINTS_BUDGET.maxPoints);
    expect(Number(fresh?.[1])).toBe(CONTROL_POINTS_BUDGET.newDriverPoints);
    // And the disambiguation copy quotes those same two numbers.
    expect(EXAM_VS_CONTROL_POINTS_BG).toContain(String(CONTROL_POINTS_BUDGET.maxPoints));
    expect(EXAM_VS_CONTROL_POINTS_BG).toContain(String(CONTROL_POINTS_BUDGET.newDriverPoints));
  });
});

// ---------------------------------------------------------------------------
// 3. The money arithmetic
// ---------------------------------------------------------------------------

describe("лв. in the statute, € on the screen", () => {
  it("uses the irrevocably fixed rate", () => {
    expect(BGN_PER_EUR).toBe(1.95583);
  });

  it("reconciles the founder's own електронен фиш: 100 лв. = 51,13 €", () => {
    expect(eurCentsFromBgn(100)).toBe(5113);
    expect(formatEur(eurCentsFromBgn(100))).toBe("51,13 €");
  });

  it("every displayed € amount is the conversion of the act's own лв. figure", () => {
    for (const road of Object.values(ROAD_CONSEQUENCES)) {
      if (road === undefined || road.kind === "unknown") continue;
      for (const f of finesOf(road)) {
        expect(f.eurCents).toBe(Math.round((f.amountBgn * 100) / 1.95583));
      }
    }
  });

  it("formats with a Bulgarian decimal comma and pads the cents", () => {
    expect(formatEur(1023)).toBe("10,23 €");
    expect(formatEur(2556)).toBe("25,56 €");
    expect(formatEur(700)).toBe("7,00 €");
  });
});

// ---------------------------------------------------------------------------
// 4. The instrument rule
// ---------------------------------------------------------------------------

describe("the instrument follows the ban, and only the ban", () => {
  it("no ban → фиш (and електронен фиш if a camera caught it); ban → акт only", () => {
    expect(instrumentsForBan(null)).toEqual(["фиш", "електронен фиш"]);
    expect(instrumentsForBan("два месеца лишаване от право да управлява моторно превозно средство")).toEqual(["акт"]);
  });

  it("every entry's instruments are the ones its own ban field implies", () => {
    for (const road of Object.values(ROAD_CONSEQUENCES)) {
      if (road === undefined || road.kind === "unknown") continue;
      for (const f of finesOf(road)) expect(f.instruments).toEqual(instrumentsForBan(f.banBg));
    }
  });

  it("in the speeding ladder the point-carrying rungs are EXACTLY the ban-carrying rungs", () => {
    // The finding the research lane surfaced, pinned so it cannot rot: ДВ бр.
    // 64/2025 lets a фиш carry контролни точки now, but it has no bite on
    // speeding — every rung that takes точки also takes the licence, and
    // лишаване forecloses both фиш (чл. 186, ал. 1) and електронен фиш
    // (чл. 189, ал. 4). So 18 точки can still only arrive by наказателно
    // постановление — same outcome as the old rule, entirely different reason.
    const ladder = ROAD_CONSEQUENCES.SPEEDING_DANGEROUS;
    expect(ladder?.kind).toBe("ladder");
    if (ladder?.kind !== "ladder") return;
    const withPoints = ladder.tiers.filter((t) => (t.controlPoints.points ?? 0) > 0).map((t) => t.bandBg);
    const withBan = ladder.tiers.filter((t) => t.fine.banBg !== null).map((t) => t.bandBg);
    expect(withPoints).toEqual(withBan);
    expect(withPoints).toEqual(["над 40 km/h", "над 50 km/h"]);
    for (const t of ladder.tiers) {
      if (t.fine.banBg !== null) expect(t.fine.instruments).toEqual(["акт"]);
    }
  });

  it("the ladder is the act's own six rungs, with no invented 41–50 row", () => {
    const ladder = ROAD_CONSEQUENCES.SPEEDING_DANGEROUS;
    if (ladder?.kind !== "ladder") throw new Error("speeding must be a ladder");
    expect(ladder.tiers.map((t) => t.bandBg)).toEqual([
      "с 10 km/h",
      "от 11 до 20 km/h",
      "от 21 до 30 km/h",
      "от 31 до 40 km/h",
      "над 40 km/h",
      "над 50 km/h",
    ]);
    // ал. 1 and ал. 2 are DIFFERENT ladders; the label must carry which one.
    expect(ladder.scopeBg).toContain("в населено място");
    expect(ladder.footnoteBg).toContain("Извън населено място");
  });
});

// ---------------------------------------------------------------------------
// 5. The honest blank
// ---------------------------------------------------------------------------

describe("where we do not know, there is no number", () => {
  it("a code with no retrieved penalty falls through to the blank", () => {
    // ENGINE_STALLED is a real code with a real exam mark and no road penalty
    // anyone has retrieved. It must NOT acquire one by accident.
    expect(ROAD_CONSEQUENCES.ENGINE_STALLED).toBeUndefined();
    expect(roadConsequenceFor("ENGINE_STALLED")).toBe(UNKNOWN_ROAD);
    expect(roadConsequenceFor("ENGINE_STALLED").kind).toBe("unknown");
  });

  it("the blank carries the rule and the article — and no figure", () => {
    if (UNKNOWN_ROAD.kind !== "unknown") throw new Error("UNKNOWN_ROAD must be kind unknown");
    const t = UNKNOWN_ROAD.ruleBg;
    expect(t).toContain("чл. 186, ал. 1");
    expect(t).toContain("чл. 189, ал. 4");
    expect(t).toContain("чл. 6, ал. 1");
    // No money, no точки count, anywhere in it.
    expect(t).not.toMatch(/\d+\s*лв\./);
    expect(t).not.toMatch(/\d+\s*€/);
    expect(t).not.toMatch(/\d+\s*(контролни|наказателни)\s+точки/);
  });

  it("the grounded set is small and deliberate", () => {
    // Each entry claims THIS detector's act is THAT article's offence. Adding
    // one is a retrieval, not an edit — so the count is pinned.
    expect(Object.keys(ROAD_CONSEQUENCES).sort()).toEqual([
      "PEDESTRIAN_NOT_YIELDED",
      "RED_LIGHT_CROSSED",
      "SPEEDING_DANGEROUS",
      "SPEEDING_OVER_LIMIT",
      "STOP_SIGN_NO_FULL_STOP",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5b. The catalogue's authored road prose, held to the same standard
// ---------------------------------------------------------------------------

/**
 * `ViolationSpec.realWorldBg` / `realWorldRefs` are the parallel lane's shape
 * for the same wave, and `roadConsequenceFor` now serves them where this file
 * has no structured entry. They arrive with a HOLE nobody had closed:
 * `modules/sim/__tests__/law-citations.test.ts` scans the `lawRef` field and
 * any field whose NAME ends in `Bg`, so it reads the prose — but
 * `realWorldRefs` is an ARRAY of citation strings and matches neither pattern.
 * Article numbers in it are checked by nothing at all.
 *
 * (Written without the literal field-and-string pattern on purpose: that
 * scanner is a regex over raw source and reads comments too, so spelling the
 * pattern out here would make this comment look like a citation site.)
 *
 * These two tests close that, and go one further: a лв. amount or a контролни
 * точки count written into the prose must actually occur in an act the row's
 * own refs name. Prose is exactly where an invented figure hides — „50 метра"
 * for railway crossings shipped inside a sentence, not inside a citation.
 */
const ACT_FILE_BY_NAME: ReadonlyArray<readonly [RegExp, string]> = [
  [/^ЗДвП$/, "zdvp.json"],
  [/^Наредба\s*№?\s*38$/, "naredba-38.json"],
  // Same ruling as `lib/content/law/corpus.ts ACT_ALIASES`: a name that does
  // not say which edition means the text IN FORCE. Authored prose has no
  // business citing the 2025 photograph, so this table has no row for it.
  [/наредба.*[iіи]з[\s-]*2539/i, "naredba-iz-2539-consolidated-dv49-2026.json"],
];

/** „ЗДвП чл. 182, ал. 1" → the unit text, or null with a reason. */
function resolveRef(ref: string): { text: string } | { skip: true } | { fail: string } {
  const m = /^(.*?)\s*(чл\.\s*\d+[а-я]?|приложение\s*№\s*\d+|§\s*\d+)/.exec(ref.trim());
  if (m === null) return { skip: true }; // names no unit number — allowed
  const actName = m[1].trim();
  const file = ACT_FILE_BY_NAME.find(([re]) => re.test(actName))?.[1];
  if (file === undefined) {
    return { fail: `„${ref}" names ${m[2]} of „${actName}" — an act content/law/acts does not hold` };
  }
  const unitRef = m[2].replace(/\s+/g, " ").toLowerCase().replace(/^чл\./, "чл.");
  const unit = act(file).units.find((u) => u.ref === unitRef);
  return unit === undefined ? { fail: `„${ref}" — ${file} has no unit "${unitRef}"` } : { text: norm(unit.textBg) };
}

describe("the catalogue's authored road sentences are retrieved too", () => {
  const authored = (Object.keys(VIOLATIONS) as ViolationCode[])
    .map((code) => ({ code, spec: VIOLATIONS[code] }))
    .filter((x) => typeof x.spec.realWorldBg === "string" && x.spec.realWorldBg.length > 0);

  it("the probe sees them (this test is worthless if the field is empty)", () => {
    expect(authored.length).toBeGreaterThan(5);
  });

  it("every realWorldRefs entry names an act we hold, or names no number at all", () => {
    const bad: string[] = [];
    for (const { code, spec } of authored) {
      for (const ref of spec.realWorldRefs ?? []) {
        const r = resolveRef(ref);
        if ("fail" in r) bad.push(`${code}: ${r.fail}`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("every лв. and контролни точки figure in the prose is in one of its own cited units", () => {
    const bad: string[] = [];
    for (const { code, spec } of authored) {
      const texts: string[] = [];
      for (const ref of spec.realWorldRefs ?? []) {
        const r = resolveRef(ref);
        if ("text" in r) texts.push(r.text);
      }
      const prose = norm(spec.realWorldBg as string);
      const figures = [...prose.matchAll(/(\d+)\s+(лв\.|контролни точки)/g)].map((m) => `${m[1]} ${m[2]}`);
      for (const fig of new Set(figures)) {
        if (!texts.some((t) => t.includes(fig))) {
          bad.push(
            `${code}: prose says "${fig}" but no unit in realWorldRefs ` +
              `[${(spec.realWorldRefs ?? []).join(", ")}] contains it`,
          );
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. The exam mark keeps saying what it always said — now with a label
// ---------------------------------------------------------------------------

describe("the exam mark is Наредба № 38's, unchanged and now named", () => {
  const codes = Object.keys(VIOLATIONS) as ViolationCode[];

  it("covers every violation code", () => {
    expect(codes.length).toBeGreaterThan(40);
    for (const code of codes) expect(() => examMarkFor(code)).not.toThrow();
  });

  it("the points and the class still agree with the catalogue and the act", () => {
    for (const code of codes) {
      const mark = examMarkFor(code);
      expect(mark.points).toBe(VIOLATIONS[code].points);
      expect(mark.points).toBe(SEVERITY_POINTS[mark.severityClass]);
      // The clause the code is charged under must carry the class it was given.
      expect(N38_CLAUSE_CLASS[mark.clause]).toBe(mark.severityClass);
    }
  });

  it("the number shown is the number written in the clause it cites", () => {
    for (const code of codes) {
      const mark = examMarkFor(code);
      expect(mark.clauseQuoteBg).toContain(String(mark.points));
      expect(mark.clauseQuoteBg).toContain("наказателн");
      expect(mark.citationBg).toContain("Наредба № 38");
      expect(mark.citationBg).toContain(`б. „${mark.clause}“`);
    }
  });

  it("a 10-point charge names which of the six enumerated cases it falls under", () => {
    for (const code of codes) {
      const mark = examMarkFor(code);
      if (mark.points === 10) {
        expect(mark.clause).toBe("в");
        expect(mark.opasnaCase).not.toBeNull();
        expect(mark.caseQuoteBg).not.toBeNull();
      } else {
        expect(mark.caseQuoteBg).toBeNull();
      }
    }
  });

  it("the founder's fault reads as the exam sheet, not as his licence", () => {
    const mark = examMarkFor("SPEEDING_DANGEROUS");
    expect(mark.points).toBe(10);
    expect(mark.classBg).toBe("опасна");
    expect(mark.opasnaCase).toBe("speeding");
    expect(mark.caseQuoteBg).toContain("превиши максимално допустимата скорост за движение с повече от 10 km/h");
    expect(mark.passRuleBg).toContain("не повече от 9 наказателни точки");
    // And the disambiguation says the thing he got wrong, out loud.
    expect(EXAM_VS_CONTROL_POINTS_BG).toContain("НЕ са контролни точки");
  });
});
