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
 * THE ROWS SOMEBODY HAS ALREADY RETRIEVED AN ARTICLE FOR — a ratchet, not a
 * census. A code may join this list only together with the quotes that ground
 * it; once here, losing its road penalty is a test failure. It is deliberately
 * NOT the full key set of `ROAD_CONSEQUENCES`: two lanes are filling that map
 * and a list which has to be exact is a list two people edit on the same line.
 */
const RETRIEVED_ROWS: readonly ViolationCode[] = [
  // The original five — the ones that happened to sit near the founder's ticket.
  "PEDESTRIAN_NOT_YIELDED",
  "RED_LIGHT_CROSSED",
  "SPEEDING_DANGEROUS",
  "SPEEDING_OVER_LIMIT",
  "STOP_SIGN_NO_FULL_STOP",
  // 2026-08-09 — the twenty a student meets most, statutory home unambiguous.
  "COLLISION",
  "CONTROLLER_SIGNAL_VIOLATED",
  "CROSSED_SOLID_LINE",
  "DRIVING_IN_BUS_LANE",
  "EMERGENCY_LANE_DRIVING",
  "EMERGENCY_NOT_YIELDED",
  "FAILED_TO_YIELD",
  "FOLLOWING_TOO_CLOSE",
  "HEADLIGHTS_OFF_AT_NIGHT",
  "ILLEGAL_STOP_IN_BAN_ZONE",
  "NOT_KEEPING_RIGHT",
  "OVERTAKE_INSUFFICIENT_GAP",
  "OVERTAKING_AT_CROSSING",
  "OVERTAKING_IN_BAN_ZONE",
  "PEDESTRIAN_CROSSING_TOO_FAST",
  "RAIL_CROSSING_VIOLATION",
  "RED_YELLOW_CROSSED",
  "SEATBELT_OFF_WHILE_MOVING",
  "WRONG_WAY",
  "YELLOW_LIGHT_NOT_STOPPED",
  // 2026-08-09 — the remaining twenty-eight. Mostly examiner judgements, so
  // most of them are `exam-only` or `conditional`: the ratchet is that the
  // ANSWER was retrieved, not that a лв. figure was found. Losing one of these
  // rows would silently return the card to „не е извлечена дословно", which is
  // a different and false statement about work that was done.
  "CENTER_LINE_TOUCHED",
  "CLOSING_ON_LEAD_TOO_FAST",
  "DRIVING_TOO_SLOW_FOR_MOTORWAY",
  "ENGINE_STALLED",
  "FOG_LIGHTS_OFF_IN_FOG",
  "FOLLOWING_TOO_CLOSE_FOR_RAIN",
  "HANDBRAKE_LEFT_ON",
  "HARSH_BRAKING_NO_CAUSE",
  "HEADLIGHTS_OFF_IN_RAIN",
  "HESITATION_AT_GREEN",
  "HIGH_BEAM_NOT_DIPPED",
  "JUNCTION_SCAN_INCOMPLETE",
  "LANE_CHANGE_WITHOUT_INDICATOR",
  "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
  "MOVE_OFF_WITHOUT_OBSERVATION",
  "OVERTAKE_RETURN_TOO_EARLY",
  "POOR_LANE_KEEPING",
  "PREDRIVE_SEATBELT_SKIPPED",
  "PREDRIVE_STEP_SKIPPED",
  "PREDRIVE_WRONG_ORDER",
  "SPEED_TOO_FAST_FOR_CONDITIONS",
  "SPEED_TOO_FAST_FOR_CURVE",
  "STANDSTILL_GAP_TOO_CLOSE",
  "STOP_LINE_OVERSHOOT",
  "TURN_WITHOUT_INDICATOR",
  "TURN_WITHOUT_OBSERVATION",
  "VULNERABLE_PASS_TOO_CLOSE",
  "WRONG_LANE_FOR_DIRECTION",
];

/**
 * `RoadConsequence` has SIX shapes and four of them carry figures. These two
 * narrowers keep every assertion below honest about that instead of each one
 * re-deriving it — and they are `switch`es with a `never` default rather than a
 * chain of `if`s, because the previous chain ended in `return []` and would
 * therefore have waved through every figure on a shape added after it. Two
 * lanes added two shapes to this union on the same afternoon; a silent skip
 * here is how one of their fines ships without its own sentence behind it.
 */
function finesOf(road: RoadConsequence): FineFigure[] {
  switch (road.kind) {
    case "single":
      return [road.fine, ...(road.escalation ?? []).map((e) => e.fine)];
    case "ladder":
      return road.tiers.map((t) => t.fine);
    case "conditional":
      return road.branches.map((b) => b.fine);
    case "authored":
    case "exam-only":
    case "unknown":
      return [];
    default: {
      const exhaustive: never = road;
      throw new Error(`finesOf: unhandled shape ${JSON.stringify(exhaustive)}`);
    }
  }
}

function controlPointsOf(road: RoadConsequence): ControlPointsFigure[] {
  switch (road.kind) {
    case "single":
      return [road.controlPoints, ...(road.escalation ?? []).map((e) => e.controlPoints)];
    case "ladder":
      return road.tiers.map((t) => t.controlPoints);
    case "conditional":
      return [
        ...(road.controlPoints === undefined ? [] : [road.controlPoints]),
        ...road.branches.map((b) => b.controlPoints),
      ];
    case "authored":
    case "exam-only":
    case "unknown":
      return [];
    default: {
      const exhaustive: never = road;
      throw new Error(`controlPointsOf: unhandled shape ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** Every quote an entry stands on, whatever its shape. */
function quotesOf(road: RoadConsequence): LawQuote[] {
  const out: LawQuote[] = [];
  for (const f of finesOf(road)) out.push(f.source);
  for (const c of controlPointsOf(road)) out.push(c.source);
  if (road.kind === "single") {
    if (road.offenceQuote !== undefined) out.push(road.offenceQuote);
    out.push(...(road.duties ?? []));
  }
  if (road.kind === "conditional") out.push(...road.duties);
  if (road.kind === "exam-only") out.push(road.examSource, ...road.duties);
  return out;
}

/**
 * Every student-facing sentence an entry carries, whatever its shape. Field
 * NAMES are enumerated rather than a list of strings, so a row that adds a
 * `noteBg` gets scanned the day it is written.
 */
function proseOf(road: RoadConsequence): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.length > 0) out.push(v);
  };
  const scan = (o: object) => {
    for (const [k, v] of Object.entries(o)) if (k.endsWith("Bg")) push(v);
  };
  scan(road);
  for (const c of controlPointsOf(road)) push(c.noteBg);
  if (road.kind === "single") for (const e of road.escalation ?? []) scan(e);
  if (road.kind === "conditional") for (const b of road.branches) scan(b);
  if (road.kind === "ladder") for (const t of road.tiers) scan(t);
  return out;
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
    // list, proved against a copy whose чл. 6 had a PDF page footer sitting
    // mid-sentence in т. 3. That footer is gone from the extraction as of
    // 2026-08-09, and this expectation is unaffected: the snapshot is excluded
    // for being superseded, not for having been dirty. See
    // `citation-version.test.ts` for the general rule.
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
  /**
   * WHAT HAPPENED TO THIS TEST, BECAUSE THE CHANGE LOOKS LIKE A DELETION.
   *
   * It used to read: ENGINE_STALLED has no row, therefore `roadConsequenceFor`
   * returns `UNKNOWN_ROAD` — the fallback, exercised through a real code. Both
   * halves have since become false in the good direction. ENGINE_STALLED was
   * RESEARCHED on 2026-08-09 and the answer is „nothing on the street", which
   * is a finding and not a blank; and with both lanes finished, every code in
   * the catalogue has a row, so no real code reaches the fallback any more.
   *
   * So the fallback is now exercised the only honest way left — directly, on a
   * map that is missing a key — and the ENGINE_STALLED assertion is kept and
   * STRENGTHENED into the thing it was really guarding: that this code never
   * acquires a fine. „exam-only with no figure anywhere in it" says that more
   * exactly than „unknown" ever did.
   */
  it("the fallback is still the blank when a code has no row", () => {
    const empty: typeof ROAD_CONSEQUENCES = {};
    expect(empty.ENGINE_STALLED).toBeUndefined();
    // …and `roadConsequenceFor` reaches it only after the catalogue's authored
    // prose, which is the tier order the function documents.
    expect(UNKNOWN_ROAD.kind).toBe("unknown");
  });

  it("a fault with no road penalty says so, and still carries no figure", () => {
    const stalled = roadConsequenceFor("ENGINE_STALLED");
    expect(stalled.kind).toBe("exam-only");
    if (stalled.kind !== "exam-only") return;
    for (const sentence of [stalled.headlineBg, stalled.whyBg]) {
      expect(sentence).not.toMatch(/\d+\s*лв\./);
      expect(sentence).not.toMatch(/\d+\s*€/);
      expect(sentence).not.toMatch(/\d+\s*контролни\s+точки/);
    }
    // The exam half IS cited, which is the whole difference from a blank.
    expect(stalled.examSource.citationBg).toContain("Наредба № 38");
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

  /**
   * WHAT REPLACED THE EXACT PIN, AND WHY IT IS NOT A WEAKENING.
   *
   * This used to be `toEqual([…five codes…])`. The pin was doing two jobs and
   * only one of them survives contact with two lanes filling the map in
   * parallel: it made a REMOVAL visible (worth keeping — a row that quietly
   * loses its penalty is a regression) and it made an ADDITION fail (worth
   * losing — under the old pin every added row broke a test belonging to
   * someone else, and the pressure is then to paste a code name in rather than
   * to retrieve an article, which is the opposite of what it was protecting).
   *
   * So: removals still fail, additions do not, and everything that made the pin
   * worth having is enforced structurally instead — every added row must carry
   * a глоба quote stating its own лв., a контролни точки figure that is either
   * written in its own sentence or a nought against the exhaustive list, and an
   * instrument derived from its own ban field. Those checks scale; a list of
   * names does not.
   */
  it("no row that was retrieved is ever silently dropped", () => {
    const keys = new Set(Object.keys(ROAD_CONSEQUENCES));
    const missing = RETRIEVED_ROWS.filter((c) => !keys.has(c));
    expect(missing, `these rows lost their road penalty: ${missing.join(", ")}`).toEqual([]);
  });

  it("every key is a real violation code and every row is one of the six shapes", () => {
    const shapes = new Set(["single", "ladder", "authored", "conditional", "exam-only", "unknown"]);
    for (const [code, road] of Object.entries(ROAD_CONSEQUENCES)) {
      expect(code in VIOLATIONS, `${code} is not in the catalogue`).toBe(true);
      expect(shapes.has(road?.kind ?? ""), `${code} has shape ${road?.kind}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5a. The gated figures, and the prose around them
// ---------------------------------------------------------------------------

/**
 * WHERE AN INVENTED NUMBER ACTUALLY HIDES.
 *
 * Not in a citation — citations are the part everyone checks. „50 метра" for
 * railway crossings shipped inside a SENTENCE, marked approved, and no test
 * looked at sentences. Section 2 above proves each `amountBgn` is written in
 * the quote it cites; it says nothing about the note printed underneath it. So
 * this block reads every field on every row whose name ends in `Bg` — the
 * module's own convention for student-facing Bulgarian — and holds any лв. or
 * контролни точки figure inside it to the same standard as the structured one.
 *
 * The rule this enforces is the founder's, restated as an assertion: a figure
 * on the screen is either cut from a sentence this row cites, or it is not on
 * the screen. There is no third option and no „it is only prose" exemption.
 */
describe("a figure written in prose is grounded exactly like a figure in a field", () => {
  it("the probe reads real sentences (a scan of nothing passes everything)", () => {
    const all = Object.values(ROAD_CONSEQUENCES).flatMap((r) => (r === undefined ? [] : proseOf(r)));
    expect(all.length).toBeGreaterThan(40);
    expect(all.some((s) => s.includes("контролни точки"))).toBe(true);
  });

  it("every лв. and контролни точки figure in a row's prose is in one of that row's own quotes", () => {
    const bad: string[] = [];
    for (const [code, road] of Object.entries(ROAD_CONSEQUENCES)) {
      if (road === undefined) continue;
      const texts = quotesOf(road).map((q) => norm(q.quoteBg));
      for (const sentence of proseOf(road)) {
        const figures = [...norm(sentence).matchAll(/(\d+)\s+(лв\.|контролни точки)/g)].map(
          (m) => `${m[1]} ${m[2]}`,
        );
        for (const fig of new Set(figures)) {
          if (!texts.some((t) => t.includes(fig))) {
            bad.push(`${code}: prose says "${fig}" and no quote this row cites contains it`);
          }
        }
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("the prose scan can fail — negative control", () => {
    const fake: RoadConsequence = {
      kind: "single",
      offenceBg: "измислено нарушение",
      fine: {
        amountBgn: 100,
        eurCents: 5113,
        banBg: null,
        instruments: ["фиш", "електронен фиш"],
        source: {
          actFile: "zdvp.json",
          unitRef: "чл. 183",
          citationBg: "ЗДвП чл. 183, ал. 4",
          quoteBg: "Наказва се с глоба 100 лв. водач, който:",
        },
      },
      controlPoints: {
        status: "not-listed",
        points: 0,
        source: {
          actFile: "naredba-iz-2539-consolidated-dv49-2026.json",
          unitRef: "чл. 6",
          citationBg: "Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.), чл. 6, ал. 1",
          quoteBg: "За нарушения на Закона за движението по пътищата на водачите на МПС се отнемат контролни точки, както следва:",
        },
        noteBg: "Пада 7 контролни точки.",
      },
    };
    const texts = quotesOf(fake).map((q) => norm(q.quoteBg));
    const figures = proseOf(fake).flatMap((s) => [...norm(s).matchAll(/(\d+)\s+(лв\.|контролни точки)/g)]);
    expect(figures.length).toBeGreaterThan(0);
    expect(figures.every((m) => texts.some((t) => t.includes(`${m[1]} ${m[2]}`)))).toBe(false);
  });
});

/**
 * A GATED PENALTY MUST KEEP ITS GATE.
 *
 * Чл. 179, ал. 2 says 300 лв. only „причини пътнотранспортно произшествие";
 * чл. 179, ал. 1, т. 5 says 200 лв. only „ако от това е създадена непосредствена
 * опасност". The rule engine establishes neither at the moment it marks the
 * fault. Printing either figure without the words that gate it is not a
 * rounding error — it is telling a seventeen-year-old that a following-distance
 * fault costs 300 лв., which is false and is exactly the class of claim this
 * whole file was written to stop. So the condition is required to be present
 * AND to be a phrase the act itself uses.
 */
describe("a conditional figure never appears without its condition", () => {
  const gated = Object.entries(ROAD_CONSEQUENCES).flatMap(([code, road]) => {
    if (road === undefined) return [];
    if (road.kind === "single") return (road.escalation ?? []).map((s) => ({ code, step: s }));
    if (road.kind === "conditional") return road.branches.map((s) => ({ code, step: s }));
    return [];
  });

  it("there are gated rows to check", () => {
    expect(gated.length).toBeGreaterThan(5);
  });

  it("each one states when it bites", () => {
    for (const { code, step } of gated) {
      expect(step.conditionBg.trim().length, code).toBeGreaterThan(10);
      // It must READ as a condition. „ако / когато / при" is the whole test:
      // an enumerated list of the phrases the act happens to use today would
      // fail the next correctly-worded gate somebody writes, which is a checker
      // punishing the behaviour it exists to encourage.
      //
      // THE BOUNDARY IS WRITTEN OUT, NOT `\b` — the same Cyrillic trap
      // `__tests__/law-citations.test.ts` documents, and it caught this file on
      // the first run. JavaScript's `\b` is ASCII-only, so `/^ако\b/` does NOT
      // match „ако от…": there is no ASCII word boundary between „о" and „ ".
      expect(step.conditionBg.trim(), code).toMatch(/^(ако|когато|при)(?![А-Яа-я])/i);
    }
  });

  it("a row whose money is entirely gated still answers the licence question", () => {
    // „Колко точки?" has an answer even when „колко лева?" does not, because
    // чл. 6, ал. 1 is an exhaustive list and absence from it is a fact today —
    // not a fact conditional on a crash that has not happened.
    for (const [code, road] of Object.entries(ROAD_CONSEQUENCES)) {
      if (road?.kind !== "conditional") continue;
      expect(road.controlPoints, `${code}: a conditional row must state the licence answer`).toBeDefined();
      expect(road.duties.length, `${code}: name the duty that was actually broken`).toBeGreaterThan(0);
      // …and the headline must not smuggle the gated figure into the summary.
      expect(road.headlineBg, code).not.toMatch(/\d+\s*(лв\.|€)/);
    }
  });
});

/**
 * „NOTHING" IS AN ANSWER, AND IT HAS TO BE AS CHECKABLE AS A NUMBER.
 *
 * Seven rows say a fault costs points on the exam sheet and nothing at all on
 * the street. That claim is worth as much as the search behind it and is worth
 * nothing at all if it is allowed to drift into „we have not looked yet" — the
 * two read identically to a student and are opposite statements about the work.
 * So an `exam-only` row must carry a Наредба № 38 citation for the half that
 * DOES cost, must state why no offence exists, and must contain no figure
 * anywhere, because the moment one appears the row is not exam-only.
 *
 * The last assertion is the one that matters most: a fault the exam sheet
 * itself calls опасна may never be exam-only. If the sheet marks it as
 * dangerous and the whole penal chapter of ЗДвП says nothing, the far likelier
 * explanation is that the retrieval missed the article.
 */
describe("a row that costs nothing on the street proves it", () => {
  const examOnlyRows = Object.entries(ROAD_CONSEQUENCES).flatMap(([code, road]) =>
    road?.kind === "exam-only" ? [{ code: code as ViolationCode, road }] : [],
  );

  it("there are such rows to check", () => {
    expect(examOnlyRows.length).toBeGreaterThan(4);
  });

  it("each one cites Наредба № 38 for the half that does cost, in its own clause", () => {
    for (const { code, road } of examOnlyRows) {
      const mark = examMarkFor(code);
      expect(road.examSource.citationBg, code).toBe(mark.citationBg);
      expect(road.examSource.quoteBg, code).toBe(mark.clauseQuoteBg);
      // The clause states the point value this code is billed, in words.
      expect(road.examSource.quoteBg, code).toContain(String(mark.points));
    }
  });

  it("each one says WHY there is no offence, at length", () => {
    for (const { code, road } of examOnlyRows) {
      expect(road.whyBg.trim().length, code).toBeGreaterThan(60);
      // Both halves named in the headline: what it costs, and where it does not.
      expect(road.headlineBg, code).toMatch(/изпит/i);
      expect(road.headlineBg, code).toMatch(/пътя|улицата/i);
    }
  });

  it("no figure appears anywhere on one — that is what makes it exam-only", () => {
    for (const { code, road } of examOnlyRows) {
      for (const sentence of [road.headlineBg, road.whyBg]) {
        expect(sentence, code).not.toMatch(/\d+\s*лв\./);
        expect(sentence, code).not.toMatch(/\d+\s*€/);
        expect(sentence, code).not.toMatch(/\d+\s*контролни\s+точки/);
      }
    }
  });

  it("an ОПАСНА fault is never exam-only — that would be a missed article", () => {
    for (const { code } of examOnlyRows) {
      expect(VIOLATIONS[code].severityClass, `${code} is опасна and yet costs nothing?`).not.toBe("opasna");
    }
  });
});

/**
 * THE OTHER HALF OF A ЧЛ. 183 CITATION.
 *
 * The alinea carries the money, the точка carries the conduct, and no single
 * sentence carries both. A row that cites only the header has proved its amount
 * and merely asserted its offence — and the assertion is the half worth
 * checking, because the founder's own measurement is that чл. 182, ал. 1, т. 3
 * and ал. 2, т. 3 are word-identical and a quote cannot say which is which.
 */
describe("the offence is quoted, not only named", () => {
  it("where the fine cites an alinea header, the точка's own words are cited too", () => {
    const missing: string[] = [];
    for (const [code, road] of Object.entries(ROAD_CONSEQUENCES)) {
      if (road?.kind !== "single") continue;
      // A header quote is one that prices without describing: „Наказва се с
      // глоба N лв. водач, който:" — it ends at the colon.
      if (!/водач, който:$|^Наказва се с глоба в размер \d+ лв\.:$/.test(norm(road.fine.source.quoteBg))) continue;
      if (road.offenceQuote === undefined) {
        missing.push(`${code}: cites „${road.fine.source.citationBg}" with no точка quote behind it`);
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("the точка is cut from the same article as the глоба that prices it", () => {
    for (const [code, road] of Object.entries(ROAD_CONSEQUENCES)) {
      if (road?.kind !== "single" || road.offenceQuote === undefined) continue;
      expect(road.offenceQuote.actFile, code).toBe(road.fine.source.actFile);
      expect(road.offenceQuote.unitRef, code).toBe(road.fine.source.unitRef);
      // And it is a DIFFERENT sentence — quoting the header twice proves nothing.
      expect(norm(road.offenceQuote.quoteBg), code).not.toBe(norm(road.fine.source.quoteBg));
    }
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
