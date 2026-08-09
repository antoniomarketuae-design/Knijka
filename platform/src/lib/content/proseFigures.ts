/**
 * THE PROSE GATE — every numeral a student reads, accounted for.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS
 * ===========================================================================
 * The citation freeze cannot see inside a sentence. It pins the `lawRefs` of a
 * row and the `quoteBg` of a figure, and it is thorough about both — but the
 * paragraph NEXT to the figure is free text, and free text is where the numbers
 * a student actually reads have been living:
 *
 *   „…±3 km/h до 100 km/h, ±3 % над 100 km/h) — затова 78 км/ч на път с 50 се
 *    разглежда като 75, тоест превишаване с 25."
 *   „100 лв. по фиксирания курс 1,95583 лв. за евро са 51,13 EUR…"
 *   „…тоест 70 лв. = 35,79 EUR, ако платиш в 14 дни."
 *
 * Every one of those was hand-verified and every one is right. NOTHING KEPT
 * THEM RIGHT. The same shape already shipped as a defect twice: 137 question
 * rows name an article number inside student-facing prose where no citation pin
 * reaches, and a fabricated „50 метра" for railway crossings shipped marked
 * approved because nothing checked the sentence it sat in.
 *
 * ===========================================================================
 * THE RULE, AND WHY THE DEFAULT IS REFUSAL
 * ===========================================================================
 * A checker that hunts for known-bad patterns only ever finds the patterns
 * somebody already thought of. This one inverts that: EVERY digit-run in a
 * student-facing sentence is a claim about the world until it is accounted for,
 * and there are exactly four ways to account for one.
 *
 *   LOCATOR    it is a citation coordinate, not a claim — „чл. 183", „ал. 4",
 *              „т. 12 – 14", „ДВ, бр. 49 от 2026 г.", „Наредба № Iз-2539".
 *              Nobody reads those as facts about driving, and the article
 *              numbers among them are already gated (`law-citations.test.ts`).
 *   QUOTED     „<number> <unit>" occurs verbatim in a source the record itself
 *              cites. This is the strong one and the one to aim for.
 *   DERIVED    the caller declares it as computed from inputs that are
 *              themselves accounted for, and states the arithmetic. The gate
 *              RE-RUNS the arithmetic; it does not take the claim on trust.
 *   STIPULATED the caller declares it a premise of a worked example („да
 *              речем, камерата отчита 78 км/ч") with a reason. Not a claim
 *              about the law, so no source can ground it — but it has to be
 *              declared, which is what stops one being introduced by accident.
 *
 * Anything else is REFUSED, and the founder's standing ruling is what to do
 * about a refusal: show the rule and the article WITH NO NUMBER.
 *
 * ===========================================================================
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ===========================================================================
 * It does not read the filesystem and it does not know what an act is. It is
 * handed text and a bag of evidence strings, so the same classifier runs over
 * the server-only law corpus, over client-side `modules/sim` prose, and over
 * the medical claim bank — three callers that could never share a loader. The
 * callers decide what counts as evidence for their own records; this decides
 * whether a number is covered by it.
 *
 * It also does not scan code comments or English design notes. Those are
 * PROVENANCE — they record which article a rule came from so the next person
 * can check it — and the ruling is about what reaches a 17-year-old.
 */

import { stripStaffAnnotations } from "./sanitize";

// ---------------------------------------------------------------------------
// Normalisation — the same one the law loader compares citations with
// ---------------------------------------------------------------------------

/**
 * Soft hyphens, non-breaking spaces and dash flavours are extraction artifacts
 * of the .docx/.pdf the acts came out of. WORDS and DIGITS are not. Kept
 * byte-identical to `law/corpus.ts normaliseForMatch` on purpose: two
 * normalisers that are supposed to agree are how a mismatch hides.
 */
export function normaliseForMatch(text: string): string {
  return text
    .replace(/­/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Matching is case-insensitive: „ЛВ." and „лв." are the same unit. */
function fold(text: string): string {
  return normaliseForMatch(text).toLowerCase();
}

// ---------------------------------------------------------------------------
// Locators — the citation coordinates that are not claims
// ---------------------------------------------------------------------------

/**
 * `\b` IS ASCII-ONLY IN JAVASCRIPT and therefore useless against Cyrillic —
 * `/\bчл\./` does not match „ ... чл. 25", it fails silently. That trap has
 * already cost this repo one undercounting scan, so every boundary here is
 * written out as an explicit negative lookaround.
 */
const NOT_WORD_BEFORE = "(?<![А-Яа-яЁёA-Za-z0-9])";
const NOT_WORD_AFTER = "(?![А-Яа-яЁёA-Za-z0-9])";

/**
 * A citation coordinate is a MARKER followed by a RUN of numbers: „т. 1, 3,
 * 12 – 14 и 16" is one locator, not five claims. The run continues only while
 * a list connector is IMMEDIATELY followed by another number, so it stops dead
 * at „т. 5 — „за превишаване над 40 km/h…" and lets the 40 through as a claim.
 */
const LOCATOR_MARKER =
  "(?:[чЧ]л|[аА]л|[аА]лине[яи]|[тТ]|[бБ]р|[бБ]|[бБ]укв[аи]|[пП]риложение|[пП]рил|§|№)";
const NUMBER_IN_RUN = "\\d+(?:[а-я]|[a-z])?";
const RUN_TAIL = `(?:\\s*(?:,|и|или|–|—|-|до)\\s*${NUMBER_IN_RUN})*`;

/**
 * Ordered because they overlap. An ISO date must be consumed before its year
 * looks like a year; a `№` designator (`№ Iз-2539`, `№ 8121з-532`) before its
 * digits look like a figure.
 *
 * NAMED, because a report that says „masked by rule 4" helps nobody and
 * because these names are what the negative-control tests assert on.
 */
export const LOCATOR_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  // 2026-08-04
  ["iso-date", /\d{4}-\d{2}-\d{2}/g],
  // 24.02.2026 г. · 7.09.2025
  ["dotted-date", /\d{1,2}\.\d{1,2}\.\d{4}(?:\s*г\.)?/g],
  // bchk_page5.txt:39, 44, 46, 47
  ["file-line", /[A-Za-z0-9_]+\.(?:txt|json|jsonl|ts|tsx|md|pdf|docx?|csv)(?::\d+(?:\s*,\s*\d+)*)?/g],
  // q-ptp-063 · src-erc-2025-layperson · pen-speeding-urban-21-30
  ["slug-id", /[a-z]+(?:-[a-z0-9]+){2,}/g],
  // № 38 · № Iз-2539 · № 8121з-532 · № РД-02-21-1/23.11.2023
  ["designator-after-no", /№\s*[^\s,;:()„“"']+/g],
  // Iз-2539 and РД-02-21-1 written without the №
  ["act-code", new RegExp(`${NOT_WORD_BEFORE}[A-Za-zА-Яа-яIіІ]{1,4}[зЗ]?-\\d+(?:[-/]\\d+)*${NOT_WORD_AFTER}`, "g")],
  // ERC 2025 · ДВ, бр. 55 от 2026 г. — a four-digit year is never a figure here
  ["year", new RegExp(`${NOT_WORD_BEFORE}(?:19|20)\\d{2}(?:\\s*г\\.)?${NOT_WORD_AFTER}`, "g")],
  // Знак Б2 · В24 · А1 · Т17. A road-sign code is a NAME that happens to end in
  // a digit, and the founder's own review is full of them. Without this rule
  // „знак Б2" reads as the claim „2" and every sign in the product is a finding.
  ["sign-code", new RegExp(`${NOT_WORD_BEFORE}[А-Я]\\d{1,2}[а-я]?(?![\\d])`, "g")],
  // „(6) (Нова - ДВ,“ — an alinea marker inside a verbatim act excerpt.
  ["paren-alinea", /\(\d{1,3}[а-я]?\)/g],
  // чл. 6, ал. 1, т. 1, 3, 12 – 14 и 16
  [
    "citation-run",
    new RegExp(`${NOT_WORD_BEFORE}${LOCATOR_MARKER}\\.?\\s*№?\\s*${NUMBER_IN_RUN}${RUN_TAIL}`, "g"),
  ],
];

interface Span {
  start: number;
  end: number;
  pattern: string;
}

/** Every locator span in the text, non-overlapping, earliest rule wins. */
export function locatorSpans(text: string): Span[] {
  const spans: Span[] = [];
  const taken = new Array<boolean>(text.length).fill(false);
  for (const [name, re] of LOCATOR_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      let overlaps = false;
      for (let i = start; i < end; i += 1) if (taken[i]) overlaps = true;
      if (overlaps) continue;
      for (let i = start; i < end; i += 1) taken[i] = true;
      spans.push({ start, end, pattern: name });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Units — what turns a number into a claim about the world
// ---------------------------------------------------------------------------

/**
 * Unit spellings, longest first so „контролни точки" wins over „точки". Each
 * entry maps a written form onto a canonical key; the key's whole variant set
 * is then tried against the evidence, because the NUMBER is fixed while the
 * unit's spelling drifts between a Bulgarian statute („км/ч"), a European
 * guideline („cm") and our own copy („см").
 */
const UNIT_TABLE: ReadonlyArray<readonly [string, string]> = [
  ["контролни точки", "control-points"],
  ["контролна точка", "control-points"],
  ["наказателни точки", "exam-points"],
  ["наказателна точка", "exam-points"],
  ["изпитни точки", "exam-points"],
  ["изпитна точка", "exam-points"],
  ["точки", "points"],
  ["точка", "points"],
  ["т.", "points"],
  ["лв.", "bgn"],
  ["лв", "bgn"],
  ["евро", "eur"],
  ["EUR", "eur"],
  ["eur", "eur"],
  ["€", "eur"],
  ["km/h", "kmh"],
  ["км/ч", "kmh"],
  ["km/ч", "kmh"],
  ["кm/h", "kmh"],
  ["на сто", "percent"],
  ["%", "percent"],
  ["на хиляда", "promille"],
  ["промила", "promille"],
  ["промил", "promille"],
  ["‰", "promille"],
  ["сантиметра", "cm"],
  ["см", "cm"],
  ["cm", "cm"],
  ["метра", "m"],
  ["метър", "m"],
  ["м.", "m"],
  ["м", "m"],
  ["километра", "km"],
  ["месеца", "months"],
  ["месец", "months"],
  ["години", "years"],
  ["година", "years"],
  ["дневен", "days"],
  ["дневния", "days"],
  ["дневно", "days"],
  ["дни", "days"],
  ["ден", "days"],
  ["часа", "hours"],
  ["час", "hours"],
  ["секунди", "seconds"],
  ["секунда", "seconds"],
  ["минута", "per-minute"],
  ["в минута", "per-minute"],
];

/** Every spelling of a canonical unit — what the evidence is searched for. */
function variantsOf(canonical: string): string[] {
  return UNIT_TABLE.filter(([, key]) => key === canonical).map(([written]) => written);
}

/**
 * Case-insensitive on purpose: the copy shouts („10 НАКАЗАТЕЛНИ точки") exactly
 * where the point is being emphasised, which is the copy most worth checking.
 */
const UNIT_RE = new RegExp(
  `^[\\s-]*(${UNIT_TABLE.map(([w]) => w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})${NOT_WORD_AFTER}`,
  "i",
);

/** Which canonical unit a written spelling belongs to, case-insensitively. */
function canonicalUnit(written: string): string | null {
  const lower = written.toLowerCase();
  return UNIT_TABLE.find(([w]) => w.toLowerCase() === lower)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

export interface ProseNumeral {
  /** The numeral exactly as written, sign included: „100", „1,95583", „±3". */
  raw: string;
  /** Digits only, decimal comma folded to a point: „1.95583". Never displayed. */
  value: number;
  index: number;
  /** Canonical unit key, or null when the number stands bare in the sentence. */
  unit: string | null;
  /** The unit exactly as the prose wrote it, for the failure message. */
  unitBg: string | null;
  /**
   * When this numeral opens a range („11" in „11 – 20 km/h"), the other end.
   * Statutes word a band as one phrase — „за превишаване от 11 до 20 km/h" —
   * so the only verbatim match available is the whole band, not its endpoint.
   */
  rangeEndBg: string | null;
  /** ±22 characters either side — a refusal has to be findable by eye. */
  contextBg: string;
}

/** „100" · „1,95583" · „±3" · „5–6" (a range is scanned as its two endpoints). */
const NUMERAL_RE = /[±+]?\d+(?:[.,]\d+)?/g;

/**
 * Only these may sit between two numerals for the pair to count as ONE run
 * sharing ONE unit: „5–6 см", „18/21/26 контролни точки", „над 40 и над 50
 * km/h", „от 11 до 20 km/h", „над 0,5 до 0,8 на хиляда".
 *
 * Written as an exhaustive list rather than „any short gap" because the gap is
 * what decides whether a number inherits a unit, and inheriting one wrongly
 * turns a refusal into a pass. „75, тоест превишаване с 25" is NOT a run: the
 * connector is followed by a word, so both numbers stay bare and both are
 * judged on their own.
 */
const RUN_JOIN_RE = /^\s*(?:[–—/:-]|и|или|,|до|\+)\s*(?:над|до|от|под|поне|около)?\s*$/;

/**
 * Every numeral in the text that is NOT a citation coordinate, with the unit
 * that governs it.
 *
 * TWO PASSES, because the unit of a run is written once at the END of it. A
 * source states „5 cm" and „6 cm" and never „5–6 см" as we wrote it, so both
 * endpoints have to carry the unit or the strong check degrades to a digit
 * hunt for exactly the figures most likely to be a range.
 */
export function scanProseNumerals(text: string): ProseNumeral[] {
  const spans = locatorSpans(text);
  const inLocator = (i: number): boolean => spans.some((s) => i >= s.start && i < s.end);

  const out: ProseNumeral[] = [];
  NUMERAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUMERAL_RE.exec(text)) !== null) {
    if (inLocator(m.index)) continue;
    const raw = m[0];
    const unitMatch = UNIT_RE.exec(text.slice(m.index + raw.length));
    const written = unitMatch ? unitMatch[1] : null;
    out.push({
      raw,
      value: Number(raw.replace(/^[±+]/, "").replace(",", ".")),
      index: m.index,
      unit: written === null ? null : canonicalUnit(written),
      unitBg: written,
      rangeEndBg: null,
      contextBg: normaliseForMatch(
        text.slice(Math.max(0, m.index - 22), Math.min(text.length, m.index + raw.length + 26)),
      ),
    });
  }

  // Right to left, so a unit propagates back along a whole chain („18/21/26").
  for (let i = out.length - 2; i >= 0; i -= 1) {
    const here = out[i];
    const next = out[i + 1];
    if (here.unit !== null || next.unit === null) continue;
    if (RUN_JOIN_RE.test(text.slice(here.index + here.raw.length, next.index))) {
      out[i] = { ...here, unit: next.unit, unitBg: next.unitBg, rangeEndBg: next.raw };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inline citations — the sentence naming its own source
// ---------------------------------------------------------------------------

/**
 * „…срещу 80 на сто в 7 дни по обикновения (чл. 186, ал. 7)" cites its source
 * INSIDE the sentence, and that is a real citation: `law-citations.test.ts`
 * already refuses an inline article number that does not resolve. So a caller
 * can widen a record's evidence with the units its own prose names, and the
 * figure is then held to the same verbatim standard as a pinned quote.
 *
 * Returns the act name and the unit ref as written; resolving them is the
 * caller's job, because this file may not touch the corpus loader.
 */
export function inlineCitations(text: string): Array<{ actBg: string; refBg: string }> {
  const ACT = String.raw`(?:ППЗДвП|ЗДвП|НСИПМК|Наредба(?:та)?(?:\s*№\s*[^\s,;)"„“]+)?(?:\s+за\s+[а-яА-Я\s]+?)??)`;
  const CHL = String.raw`(?:чл\.\s*\d+[а-я]?)`;
  const out: Array<{ actBg: string; refBg: string }> = [];
  // „ЗДвП чл. 186" — the act, then the article.
  const forward = new RegExp(`(${ACT})\\s*,?\\s*(${CHL})`, "g");
  // „чл. 425 от Наредбата за средствата за измерване" — the other order, which
  // Bulgarian legal prose uses just as often and which a forward-only reader
  // sees as an article belonging to whatever act was named before it.
  const backward = new RegExp(`(${CHL})\\s+от\\s+(${ACT}(?:\\s+за\\s+[а-я\\s]+)?)`, "g");
  let m: RegExpExecArray | null;
  while ((m = forward.exec(text)) !== null) out.push({ actBg: strip(m[1]), refBg: m[2].trim() });
  while ((m = backward.exec(text)) !== null) out.push({ actBg: strip(m[2]), refBg: m[1].trim() });
  return out;
}

/**
 * Bulgarian attaches the definite article to the noun — „Наредбата за
 * средствата за измерване" is the same act as „Наредба за средствата за
 * измерване", and the corpus's alias table only knows the second spelling.
 * Stripped here rather than loosened there: the alias table is what decides
 * which of the TWO Наредба № Iз-2539 texts a citation means, and it should
 * stay as literal as possible.
 */
function strip(actBg: string): string {
  return actBg.trim().replace(/^Наредбата/, "Наредба").replace(/^Закона|^Законът/, "Закон");
}

// ---------------------------------------------------------------------------
// Accounting for what was found
// ---------------------------------------------------------------------------

/**
 * The arithmetic a derived figure is allowed to be. A CLOSED set on purpose:
 * an open expression language would let „the number is whatever this formula
 * says" back in through the front door, and the formula is exactly what nobody
 * would re-check. Four operations cover every conversion this product does.
 */
export const DERIVATION_OPS = {
  /** Money: a лв. figure at the irrevocably fixed rate, rounded to the cent. */
  "divide-round-2": (a: number, b: number): number => Math.round((a / b) * 100) / 100,
  /** The early-payment discounts: 80 на сто of a фиш, 70 на сто of an е-фиш. */
  "percent-of": (a: number, b: number): number => Math.round(a * b) / 100,
  /** The camera tolerance, and the excess left after it: 78 − 3, then 75 − 50. */
  minus: (a: number, b: number): number => a - b,
  plus: (a: number, b: number): number => a + b,
} as const;

export type DerivationOp = keyof typeof DERIVATION_OPS;

/**
 * A number the record declares as COMPUTED. The gate re-runs the arithmetic
 * AND requires every input to be accounted for in its own right, so a
 * derivation cannot launder an invented operand into a published figure.
 */
export interface DerivedFigure {
  /** As it appears in the prose: „51,13". */
  valueBg: string;
  op: DerivationOp;
  /** The operands, exactly as they appear in the prose: ["100", "1,95583"]. */
  inputsBg: readonly [string, string];
  /** Shown in the report so a human can audit the derivation itself. */
  howBg: string;
}

/**
 * A number no source can ground and no arithmetic produces, declared out loud.
 *
 *   "stipulated" — a premise of a worked example („камерата отчита 78 км/ч в
 *                  зона на 50"). It is not a claim about the law at all, so
 *                  demanding a citation for it would be a category error —
 *                  but it has to be DECLARED, which is what stops one being
 *                  introduced by accident and read as law.
 *   "constant"   — a fixed value that exists outside the law corpus, e.g. the
 *                  irrevocably fixed 1,95583 лв./EUR. Every one is listed in
 *                  the report and pinned by a test, so adding one is a
 *                  deliberate, reviewed act rather than an edit.
 */
export interface DeclaredFigure {
  valueBg: string;
  whyBg: string;
}

export interface ProseEvidence {
  /** Verbatim source text the record cites: quotes, and the units they sit in. */
  quotes: readonly string[];
  derived?: readonly DerivedFigure[];
  stipulated?: readonly DeclaredFigure[];
  constants?: readonly DeclaredFigure[];
}

export type NumeralVerdict =
  | { kind: "quoted"; matched: string }
  | { kind: "derived"; howBg: string }
  | { kind: "stipulated"; whyBg: string }
  | { kind: "constant"; whyBg: string }
  | { kind: "digits-only" }
  | { kind: "refused"; why: string };

/** „100" and „100.0" and „100,00" are the same number written three ways. */
function toNumber(a: string): number {
  return Number(a.replace(/^[±+]/, "").replace(",", "."));
}
function sameNumber(a: string, b: number): boolean {
  const n = toNumber(a);
  return Number.isFinite(n) && Math.abs(n - b) < 1e-9;
}

/**
 * A needle must match a WHOLE number. „10 лв." is a substring of „110 лв." and
 * „510 лв.", so a plain `includes` grounds a figure on a neighbouring one —
 * the exact false pass that would make this gate worse than useless.
 */
function containsFigure(haystack: string, digits: string, tailBg: string): boolean {
  const number = digits.replace(/[.,]/g, "[.,]");
  const tail = tailBg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`(?<![\\d.,])${number}${tail}`).test(haystack);
}

/** The same whole-number boundary, with nothing required after it. */
function containsBareNumber(haystack: string, digits: string): boolean {
  return new RegExp(`(?<![\\d.,])${digits.replace(/[.,]/g, "[.,]")}(?![\\d])`).test(haystack);
}

/**
 * The ways a number is accounted for, tried STRONGEST FIRST.
 *
 * Quoted before declared, deliberately: „70 на сто" is in ЗДвП чл. 189, ал. 5г
 * and „70 лв." is a computed discount, and both are the number 70. Checking
 * the corpus first means the one the law states is grounded on the law, and
 * only the genuinely computed one spends the declaration.
 */
export function classifyNumeral(n: ProseNumeral, evidence: ProseEvidence): NumeralVerdict {
  const haystacks = evidence.quotes.map(fold);
  const digits = n.raw.replace(/^[±+]/, "");

  // STRONG: the number AND its unit, together, in a source the record cites.
  if (n.unit !== null) {
    for (const variant of variantsOf(n.unit)) {
      // Only the JOIN between number and unit varies („100 лв.", „100лв.",
      // „14-дневен срок"). The number does not, and neither does the unit's
      // meaning — that is what makes this a check and not a similarity score.
      for (const join of [" ", "", "-"]) {
        if (haystacks.some((h) => containsFigure(h, digits, `${join}${fold(variant)}`))) {
          return { kind: "quoted", matched: `${digits}${join}${variant}` };
        }
      }
      // A band is worded as one phrase in the act — „от 11 до 20 km/h" — so an
      // endpoint on its own is not in the text and never will be.
      if (n.rangeEndBg !== null) {
        const end = n.rangeEndBg.replace(/^[±+]/, "");
        for (const mid of [" до ", " - ", "-", " и "]) {
          if (haystacks.some((h) => containsFigure(h, digits, `${mid}${end} ${fold(variant)}`))) {
            return { kind: "quoted", matched: `${digits}${mid}${end} ${variant}` };
          }
        }
      }
    }
  }

  for (const d of evidence.derived ?? []) {
    if (!sameNumber(d.valueBg, n.value)) continue;
    const got = DERIVATION_OPS[d.op](toNumber(d.inputsBg[0]), toNumber(d.inputsBg[1]));
    if (Math.abs(got - n.value) < 1e-6) return { kind: "derived", howBg: d.howBg };
    return {
      kind: "refused",
      why: `declared derived (${d.howBg}) but ${d.op}(${d.inputsBg.join(", ")}) = ${got}, not ${n.raw}`,
    };
  }
  for (const s of evidence.stipulated ?? []) {
    if (sameNumber(s.valueBg, n.value)) return { kind: "stipulated", whyBg: s.whyBg };
  }
  for (const c of evidence.constants ?? []) {
    if (sameNumber(c.valueBg, n.value)) return { kind: "constant", whyBg: c.whyBg };
  }

  // WEAK: the digits occur as a standalone number somewhere in the evidence.
  // Its own verdict rather than a pass, because „50" in „над 50 km/h" does not
  // ground „50" in „зона на 50 лв." — the digits agree and the claim does not.
  if (haystacks.some((h) => containsBareNumber(h, digits))) return { kind: "digits-only" };

  return {
    kind: "refused",
    why:
      n.unit === null
        ? `„${n.raw}" is in no source this record cites, and is not declared derived or stipulated`
        : `„${n.raw} ${n.unitBg}" is in no source this record cites`,
  };
}

export interface ProseProblem {
  /** Which record and field the sentence came from. */
  where: string;
  numeral: string;
  unitBg: string | null;
  contextBg: string;
  verdict: NumeralVerdict;
}

export interface ProseReport {
  problems: ProseProblem[];
  /** Every numeral seen, by verdict — the probe assertion reads this. */
  counts: Record<NumeralVerdict["kind"] | "locator", number>;
  /** Numerals grounded only by their digits. The honest half of the report. */
  weak: ProseProblem[];
}

const EMPTY_COUNTS = (): ProseReport["counts"] => ({
  locator: 0,
  quoted: 0,
  derived: 0,
  stipulated: 0,
  constant: 0,
  "digits-only": 0,
  refused: 0,
});

/**
 * Run the gate over one field.
 *
 * `strict` decides whether a digits-only grounding is a failure. It is off by
 * default because the honest state of most prose is „the digits are in the
 * cited article and the unit is not spelled the same way", and a gate that
 * fails on day one is a gate somebody deletes. Every weak row is REPORTED, so
 * the number is a debt with a name rather than an unknown.
 */
export function verifyProse(
  where: string,
  rawText: string,
  evidence: ProseEvidence,
  opts: { strict?: boolean } = {},
): ProseReport {
  /**
   * THE GATE READS WHAT THE STUDENT READS. `sanitizeContentTree` strips
   * `[REVIEW: одит 90 §6.4 …]` staff notes at the loader boundary, and 151
   * question rows carry one. Scanning the raw JSON instead would report „90"
   * and „6.4" as ungrounded figures in every one of them — a checker drowning
   * its real findings in text no learner will ever see.
   */
  const text = stripStaffAnnotations(rawText);
  const numerals = scanProseNumerals(text);
  const problems: ProseProblem[] = [];
  const weak: ProseProblem[] = [];
  const counts = EMPTY_COUNTS();
  counts.locator = locatorSpans(text).length;

  const verdicts = numerals.map((n) => ({ n, verdict: classifyNumeral(n, evidence) }));

  /**
   * THE CLOSURE. A derivation is only as grounded as its operands, so every
   * input has to appear in the SAME sentence and be accounted for there too.
   * Without this, „51,13 = 100 ÷ 1,95583" would ground 51,13 on two numbers
   * nobody ever checked — which is how an invented figure acquires a formula
   * and stops looking invented.
   */
  const accountedValues = new Set(
    verdicts
      .filter((v) => v.verdict.kind !== "refused" && v.verdict.kind !== "digits-only")
      .map((v) => v.n.value),
  );
  for (const { n, verdict } of verdicts) {
    if (verdict.kind !== "derived") continue;
    const declared = (evidence.derived ?? []).find((d) => sameNumber(d.valueBg, n.value));
    for (const input of declared?.inputsBg ?? []) {
      if (!accountedValues.has(toNumber(input))) {
        problems.push({
          where,
          numeral: n.raw,
          unitBg: n.unitBg,
          contextBg: n.contextBg,
          verdict: {
            kind: "refused",
            why: `derived from „${input}", which is not itself accounted for in this sentence`,
          },
        });
      }
    }
  }

  for (const { n, verdict } of verdicts) {
    counts[verdict.kind] += 1;
    const row: ProseProblem = {
      where,
      numeral: n.raw,
      unitBg: n.unitBg,
      contextBg: n.contextBg,
      verdict,
    };
    if (verdict.kind === "refused") problems.push(row);
    else if (verdict.kind === "digits-only") {
      weak.push(row);
      if (opts.strict === true) problems.push(row);
    }
  }
  return { problems, counts, weak };
}

/** One line per problem, in the shape the failing gates print. */
export function formatProblems(problems: readonly ProseProblem[]): string {
  return problems
    .map(
      (p) =>
        `  ${p.where}: „${p.numeral}${p.unitBg === null ? "" : ` ${p.unitBg}`}"\n` +
        `      …${p.contextBg}…\n` +
        `      -> ${p.verdict.kind === "refused" ? p.verdict.why : "grounded only by its digits"}`,
    )
    .join("\n");
}
