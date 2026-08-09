/**
 * THE PROSE GATE, WIRED TO THE CORPUS.
 *
 * `lib/content/proseFigures.ts` decides whether a number is accounted for.
 * This file decides WHAT MAY ACCOUNT FOR IT — it assembles, for one record,
 * the set of verbatim source text that record is entitled to lean on, and it
 * holds the ledger of numbers the corpus cannot supply at all.
 *
 * Split in two on purpose: the classifier must stay pure so it can run in the
 * browser bundle and over the medical claim bank, while evidence assembly
 * needs `node:fs` and the act loader.
 *
 * ===========================================================================
 * WHAT COUNTS AS EVIDENCE FOR A RECORD, AND WHY EACH TIER IS ALLOWED
 * ===========================================================================
 *  1. PINNED QUOTES — `PenaltyCitation.quoteBg` / `contextQuoteBg`. Already
 *     re-cut from the statute on every load by `verifyCitations`, so a figure
 *     grounded here is grounded on text the corpus has proved it holds.
 *  2. THE CITED UNIT'S FULL TEXT. A note explains the article the figure sits
 *     in; the article's other sentences are the same retrieval, one paragraph
 *     wider. („100 лв." is in the alinea's opening sentence, the offence is in
 *     a numbered point below it — the quote pair already works this way.)
 *  3. UNITS THE SENTENCE CITES ITSELF. „…срещу 80 на сто в 7 дни по
 *     обикновения (чл. 186, ал. 7)" IS a citation, and `law-citations.test.ts`
 *     already refuses an inline article number that does not resolve. A bare
 *     „чл. N" with no act beside it resolves against the acts the record
 *     already cites — a penalty note's bare article is that penalty's act.
 *
 * THE LIMIT, STATED UP FRONT: this proves the figure occurs in an article the
 * record points at. It does NOT prove the sentence around it is a fair reading
 * of that article. „150 лв." in a note about the wrong offence would pass.
 * What the gate kills is the number that exists nowhere — which is the defect
 * that actually shipped („50 метра" for railway crossings, marked approved).
 */
import {
  actIdForActName,
  getAct,
  normaliseUnitRef,
  resolveLawRef,
} from "./corpus";
import type { PenaltyCitation, PenaltyEntry } from "./types";
import type { LawRef } from "../types";
import {
  inlineCitations,
  scanProseNumerals,
  verifyProse,
  type DeclaredFigure,
  type DerivedFigure,
  type ProseEvidence,
  type ProseProblem,
  type ProseReport,
} from "../proseFigures";

// ---------------------------------------------------------------------------
// Evidence assembly
// ---------------------------------------------------------------------------

/** The full text of a unit, or null when the corpus does not hold it. */
function unitText(actId: string, ref: string): string | null {
  const normalised = normaliseUnitRef(ref) ?? ref.trim();
  return getAct(actId)?.units.find((u) => u.ref === normalised)?.textBg ?? null;
}

/** Tiers 1 and 2 for one citation: the pinned quotes plus the unit they cut from. */
export function evidenceForCitation(c: PenaltyCitation): string[] {
  const out = [c.quoteBg];
  if (c.contextQuoteBg !== undefined) out.push(c.contextQuoteBg);
  const text = unitText(c.actId, c.ref);
  if (text !== null) out.push(text);
  return out;
}

/** Every unit a row's `lawRefs` name — the question bank's only pinned evidence. */
export function evidenceForLawRefs(lawRefs: readonly LawRef[]): string[] {
  const out: string[] = [];
  for (const ref of lawRefs) {
    const found = resolveLawRef(ref);
    if (found.found) out.push(found.unit.textBg);
  }
  return out;
}

/**
 * Tier 3. `fallbackActIds` are the acts the record already cites, used only to
 * resolve a bare „чл. N" that names no act — never to invent one: an article
 * that exists in none of them contributes nothing rather than a nearest match.
 */
export function evidenceFromSentence(text: string, fallbackActIds: readonly string[]): string[] {
  const out: string[] = [];
  for (const cite of inlineCitations(text)) {
    const actId = actIdForActName(cite.actBg);
    if (actId === null) continue;
    const unit = unitText(actId, cite.refBg);
    if (unit !== null) out.push(unit);
  }
  for (const m of text.matchAll(/чл\.\s*(\d+[а-я]?)/g)) {
    for (const actId of fallbackActIds) {
      const unit = unitText(actId, `чл. ${m[1]}`);
      if (unit !== null) out.push(unit);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The grounding ledger — every number we assert on our own authority
// ---------------------------------------------------------------------------

/**
 * WHAT THIS LIST IS. Not an allow-list of numbers to ignore. It is the
 * complete, reviewable answer to „which figures in student-facing prose does
 * the law corpus NOT supply, and on what authority do we print them?" — a
 * question nobody could answer before, because the numbers were dissolved in
 * sentences.
 *
 * Three shapes, and the gate treats each differently:
 *  - `constants`  a value that exists outside any act we hold. The gate cannot
 *                 check it; a test PINS the set so adding one is a reviewed act.
 *  - `derived`    arithmetic. The gate RE-RUNS it and requires every operand to
 *                 be accounted for in the same sentence, so a derivation
 *                 cannot launder an invented operand into a published figure.
 *  - `stipulated` a premise of a worked example. Not a claim about the law at
 *                 all — but declared, so one cannot be introduced by accident
 *                 and then read as law.
 *
 * Keyed by `<penaltyId>.<field>.noteBg`. A key whose note no longer contains
 * the number is reported as an ORPHAN rather than failing the suite: these
 * notes are authored in `content/law/tools/build-penalties.mjs` and rewritten
 * by whoever is holding that file, and a stale declaration is a cleanup, not
 * a defect.
 */
export interface NoteDeclarations {
  derived?: readonly DerivedFigure[];
  stipulated?: readonly DeclaredFigure[];
  constants?: readonly DeclaredFigure[];
}

/**
 * The irrevocably fixed conversion rate. Bulgaria adopted the euro on
 * 2026-01-01; the acts still express every глоба in лв., so every euro amount
 * a student sees is a conversion and this is its divisor. It is a Council
 * regulation figure, not a ЗДвП one — no act in `content/law/acts` states it,
 * which is precisely why it has to be declared here instead of hiding inside a
 * sentence. Reconciled against the founder's own електронен фиш: 100 лв. was
 * billed at 51,13 EUR, and `modules/sim/rules/consequences.ts` pins the same
 * constant for the fault card.
 */
export const BGN_PER_EUR_BG = "1,95583";

export const GROUNDING_LEDGER: Readonly<Record<string, NoteDeclarations>> = {
  "pen-speeding-urban-21-30.fine.noteBg": {
    constants: [
      {
        valueBg: BGN_PER_EUR_BG,
        whyBg:
          "Неотменимо фиксираният курс лев/евро. Не е в нито един акт от корпуса — затова е деклариран, а не цитиран. Съгласуван с електронния фиш на основателя: 100 лв. = 51,13 EUR.",
      },
    ],
    derived: [
      {
        valueBg: "51,13",
        op: "divide-round-2",
        inputsBg: ["100", BGN_PER_EUR_BG],
        howBg: "100 лв. ÷ 1,95583 = 51,13 EUR",
      },
      {
        valueBg: "70",
        op: "percent-of",
        inputsBg: ["100", "70"],
        howBg: "70 на сто (ЗДвП чл. 189, ал. 5г) от 100 лв. = 70 лв.",
      },
      {
        valueBg: "35,79",
        op: "divide-round-2",
        inputsBg: ["70", BGN_PER_EUR_BG],
        howBg: "70 лв. ÷ 1,95583 = 35,79 EUR",
      },
      {
        valueBg: "75",
        op: "minus",
        inputsBg: ["78", "3"],
        howBg:
          "78 км/ч минус максимално допустимата грешка ±3 km/h (НСИПМК чл. 425, ал. 1, т. 2) = 75",
      },
      {
        valueBg: "25",
        op: "minus",
        inputsBg: ["75", "50"],
        howBg: "75 минус ограничението 50 = превишаване с 25",
      },
    ],
    stipulated: [
      {
        valueBg: "78",
        whyBg:
          "Условие на примера, не твърдение за закона: точно това е отчела камерата по електронния фиш на основателя.",
      },
      {
        valueBg: "50",
        whyBg: "Условие на примера: ограничението в участъка, в който е заснет.",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

export interface ProseGateRow {
  where: string;
  text: string;
  evidence: ProseEvidence;
}

/** Every note in the penalty bank, with the evidence it is entitled to. */
export function penaltyProseRows(penalties: readonly PenaltyEntry[]): ProseGateRow[] {
  const rows: ProseGateRow[] = [];
  for (const p of penalties) {
    const citations: PenaltyCitation[] = [];
    for (const figure of [p.fine, p.controlPoints, p.disqualification, p.examPoints]) {
      if (figure === null) continue;
      citations.push(figure.source);
      if ("instrumentSource" in figure && figure.instrumentSource !== null) {
        citations.push(figure.instrumentSource);
      }
    }
    const pinned = citations.flatMap(evidenceForCitation);
    const ownActs = [...new Set(citations.map((c) => c.actId))];

    const fields: Array<[string, string | null]> = [
      ["fine", p.fine.noteBg],
      ["controlPoints", p.controlPoints.noteBg],
      ["disqualification", p.disqualification.noteBg],
      ["examPoints", p.examPoints?.noteBg ?? null],
      ["titleBg", p.titleBg],
      ["summaryBg", p.summaryBg],
    ];
    for (const [field, text] of fields) {
      if (text === null || text === "") continue;
      const where =
        field === "titleBg" || field === "summaryBg"
          ? `${p.id}.${field}`
          : `${p.id}.${field}.noteBg`;
      rows.push({
        where,
        text,
        evidence: {
          quotes: [...pinned, ...evidenceFromSentence(text, ownActs)],
          ...(GROUNDING_LEDGER[where] ?? {}),
        },
      });
    }
  }
  return rows;
}

export interface ProseGateResult {
  problems: ProseProblem[];
  weak: ProseProblem[];
  counts: ProseReport["counts"];
  /** Ledger keys that no longer match anything — cleanup, not a defect. */
  orphanDeclarations: string[];
}

export function runProseGate(
  rows: readonly ProseGateRow[],
  opts: { strict?: boolean } = {},
): ProseGateResult {
  const problems: ProseProblem[] = [];
  const weak: ProseProblem[] = [];
  const counts: ProseReport["counts"] = {
    locator: 0,
    quoted: 0,
    derived: 0,
    stipulated: 0,
    constant: 0,
    "digits-only": 0,
    refused: 0,
  };
  for (const row of rows) {
    const report = verifyProse(row.where, row.text, row.evidence, opts);
    problems.push(...report.problems);
    weak.push(...report.weak);
    for (const key of Object.keys(counts) as Array<keyof typeof counts>) {
      counts[key] += report.counts[key];
    }
  }
  // A declaration is orphaned when the sentence it was written for no longer
  // contains that number — the note was rewritten and the ledger did not
  // follow. Reported, never fatal: it is a stale explanation, not a false one.
  const byWhere = new Map(rows.map((r) => [r.where, r]));
  const orphanDeclarations: string[] = [];
  for (const [key, declared] of Object.entries(GROUNDING_LEDGER)) {
    const row = byWhere.get(key);
    if (row === undefined) {
      orphanDeclarations.push(`${key} — no such field in the bank any more`);
      continue;
    }
    const present = new Set(scanProseNumerals(row.text).map((n) => n.value));
    const all = [
      ...(declared.derived ?? []),
      ...(declared.stipulated ?? []),
      ...(declared.constants ?? []),
    ];
    for (const d of all) {
      const value = Number(d.valueBg.replace(",", "."));
      if (!present.has(value)) orphanDeclarations.push(`${key} declares „${d.valueBg}", which the note no longer contains`);
    }
  }
  return { problems, weak, counts, orphanDeclarations };
}
