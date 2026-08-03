/**
 * Law corpus loader + retrieval (server-only).
 *
 * Reads content/law at first use, validates every file against law/schemas.ts,
 * then VERIFIES that each penalty citation's quote really occurs in the act
 * text it points at. A citation that has drifted from the law fails the load —
 * that is the whole guarantee: if a figure is in the bank, its words are in the
 * stored statute.
 *
 * ADR-002: nothing in this file may produce a legal figure or an article number
 * that is not read out of content/law.
 */
import fs from "node:fs";
import path from "node:path";
import { LawActSchema, LawSourceRegisterSchema, PenaltyBankSchema } from "./schemas";
import type {
  LawAct,
  LawLookup,
  LawSource,
  LawSourceRegister,
  LawUnit,
  PenaltyBank,
  PenaltyCitation,
  PenaltyEntry,
} from "./types";
import type { LawRef } from "../types";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/content/law/corpus is server-only — import it from server code, never from client components",
  );
}

/** Acts we ship full text for. Adding one means adding its JSON + a source row. */
export const ACT_IDS = ["zdvp", "naredba-iz-2539", "naredba-38"] as const;
export type ActId = (typeof ACT_IDS)[number];

/**
 * How a `LawRef.act` string (as already written across content/) maps onto an
 * actId. Anything not listed resolves to "act-not-in-corpus" — a MISS, never a
 * guess at which act was meant.
 */
const ACT_ALIASES: ReadonlyArray<readonly [RegExp, ActId]> = [
  [/^здвп$/i, "zdvp"],
  [/^закон\s+за\s+движението\s+по\s+пътищата$/i, "zdvp"],
  [/наредба.*\biз[\s-]*2539\b/i, "naredba-iz-2539"],
  [/наредба.*\bіз[\s-]*2539\b/i, "naredba-iz-2539"],
  [/^наредба\s*(№\s*)?38\b/i, "naredba-38"],
  [/^наредба\s*(№\s*)?38\s*\/\s*2004/i, "naredba-38"],
];

export function actIdForActName(actName: string): ActId | null {
  const trimmed = actName.trim();
  for (const [re, id] of ACT_ALIASES) if (re.test(trimmed)) return id;
  return null;
}

/**
 * Normalise a citation string to the corpus's unit ref.
 *   "Чл. 47"            -> "чл. 47"
 *   "чл.47, ал. 1, т. 5"-> "чл. 47"
 *   "чл. 183 ?"         -> "чл. 183"   (the "?" = unverified marker in SCHEMA.md)
 *   "§ 6, т. 30 ДР"     -> "§ 6"       (the ЗДвП definitions paragraph)
 *   "Приложение № 5"    -> "приложение № 5"
 * Returns null when the string is not an article/annex/§ reference at all.
 */
export function normaliseUnitRef(ref: string): string | null {
  const s = ref.trim().replace(/\?+\s*$/, "").trim();
  // The suffix must be a LOWERCASE letter glued to the number and not followed
  // by another letter. Written case-sensitively on purpose: with /i, "§ 6 ДР"
  // read as "§ 6д" and "чл. 6 от ЗДвП" as "чл. 6о" — both silent misses.
  const art = /^(?:чл|Чл|ЧЛ)\.?\s*(\d+)((?:[а-я]\d*)?)(?![а-яА-Я])/.exec(s);
  if (art) return `чл. ${art[1]}${art[2] ?? ""}`;
  const para = /^§\s*(\d+)([а-я]?)(?![а-яА-Я])/.exec(s);
  if (para) return `§ ${para[1]}${para[2] ?? ""}`;
  const annex = /^(?:приложение|Приложение|ПРИЛОЖЕНИЕ)\s*№?\s*(\d+[а-я]?)(?![а-яА-Я])/.exec(s);
  if (annex) return `приложение № ${annex[1]}`;
  return null;
}

/** Soft hyphens and non-breaking spaces survive the .docx; strip for matching. */
export function normaliseForMatch(text: string): string {
  return text
    .replace(/­/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface LawCorpus {
  acts: ReadonlyMap<string, LawAct>;
  sources: LawSourceRegister;
  penalties: readonly PenaltyEntry[];
}

function contentLawDir(): string {
  const candidates = [
    path.join(process.cwd(), "content", "law"),
    path.resolve(process.cwd(), "..", "content", "law"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "sources.json"))) return dir;
  }
  throw new Error(
    `Law corpus not found (cwd: ${process.cwd()}). Looked for sources.json in: ${candidates.join(", ")}`,
  );
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

interface ZodLike {
  safeParse: (v: unknown) => {
    success: boolean;
    data?: unknown;
    error?: { issues?: { path?: PropertyKey[]; message?: string }[] };
  };
}

/** Compact, greppable failure — a 400-issue JSON dump helps nobody. */
function parseOrThrow<T>(schema: ZodLike, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error?.issues ?? [];
    const shown = issues
      .slice(0, 8)
      .map((i) => `  ${(i.path ?? []).join(".") || "(root)"}: ${i.message ?? "invalid"}`)
      .join("\n");
    const more = issues.length > 8 ? `\n  …and ${issues.length - 8} more` : "";
    throw new Error(`${what} failed validation (${issues.length} issue(s)):\n${shown}${more}`);
  }
  return result.data as T;
}

/**
 * The two checks that make a figure grounded rather than asserted:
 *
 *  1. every citation quote occurs verbatim (modulo whitespace / soft hyphens)
 *     in the unit it points at, and
 *  2. a GROUNDED numeric figure's number appears in its own quote. A fine of
 *     100 лв. cited with a quote that never says "100 лв." is exactly the
 *     failure this corpus exists to prevent.
 *
 * Returns human-readable problems, empty when clean.
 */
export function verifyCitations(
  acts: ReadonlyMap<string, LawAct>,
  penalties: readonly PenaltyEntry[],
): string[] {
  const problems: string[] = [];

  const check = (
    penaltyId: string,
    field: string,
    c: PenaltyCitation,
    /** The exact string the quote must contain, when the figure is grounded. */
    mustContain?: string,
  ): void => {
    const act = acts.get(c.actId);
    if (!act) {
      problems.push(`${penaltyId}.${field}: unknown actId "${c.actId}"`);
      return;
    }
    const unit = act.units.find((u) => u.ref === c.ref);
    if (!unit) {
      problems.push(`${penaltyId}.${field}: ${act.abbrBg} has no unit "${c.ref}"`);
      return;
    }
    const haystack = normaliseForMatch(unit.textBg);
    for (const [name, quote] of [
      ["quote", c.quoteBg],
      ["contextQuote", c.contextQuoteBg],
    ] as const) {
      if (quote === undefined) continue;
      if (!haystack.includes(normaliseForMatch(quote))) {
        problems.push(
          `${penaltyId}.${field}: ${name} is NOT in ${act.abbrBg} ${c.ref} — "${quote.slice(0, 70)}…"`,
        );
      }
    }
    if (mustContain !== undefined && !normaliseForMatch(c.quoteBg).includes(normaliseForMatch(mustContain))) {
      problems.push(
        `${penaltyId}.${field}: quote does not state the figure — expected "${mustContain}" in "${c.quoteBg.slice(0, 70)}…"`,
      );
    }
  };

  for (const p of penalties) {
    check(
      p.id,
      "fine.source",
      p.fine.source,
      p.fine.status === "grounded" && p.fine.amountBgn !== null
        ? `${p.fine.amountBgn} лв.`
        : undefined,
    );
    check(p.id, "fine.instrumentSource", p.fine.instrumentSource);
    check(
      p.id,
      "controlPoints.source",
      p.controlPoints.source,
      p.controlPoints.status === "grounded" && p.controlPoints.points !== null
        ? `${p.controlPoints.points} контролни точки`
        : undefined,
    );
    if (p.examPoints) {
      check(
        p.id,
        "examPoints.source",
        p.examPoints.source,
        p.examPoints.status === "grounded" && p.examPoints.points !== null
          ? `${p.examPoints.points} наказателни точки`
          : undefined,
      );
    }
  }
  return problems;
}

function build(): LawCorpus {
  const dir = contentLawDir();

  const sources = parseOrThrow<LawSourceRegister>(
    LawSourceRegisterSchema,
    readJson(path.join(dir, "sources.json")),
    "content/law/sources.json",
  );

  const acts = new Map<string, LawAct>();
  for (const actId of ACT_IDS) {
    const act = parseOrThrow<LawAct>(
      LawActSchema,
      readJson(path.join(dir, "acts", `${actId}.json`)),
      `content/law/acts/${actId}.json`,
    );
    if (act.actId !== actId) {
      throw new Error(`content/law/acts/${actId}.json declares actId "${act.actId}"`);
    }
    if (!sources.sources.some((s) => s.id === act.sourceId && s.coverage === "full-text")) {
      throw new Error(
        `act "${actId}" cites sourceId "${act.sourceId}", which is not a full-text source in sources.json`,
      );
    }
    acts.set(actId, act);
  }

  const bank = parseOrThrow<PenaltyBank>(
    PenaltyBankSchema,
    readJson(path.join(dir, "penalties.json")),
    "content/law/penalties.json",
  );

  const problems = verifyCitations(acts, bank.penalties);
  if (problems.length > 0) {
    throw new Error(
      `content/law/penalties.json cites text that is not in the corpus (ADR-002 violation):\n  ${problems.join("\n  ")}`,
    );
  }

  return { acts, sources, penalties: Object.freeze(bank.penalties) };
}

let cached: LawCorpus | null = null;

export function getLawCorpus(): LawCorpus {
  if (!cached) cached = build();
  return cached;
}

/** Test seam: forget the cache so a fixture directory can be loaded. */
export function resetLawCorpus(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export function getAct(actId: string): LawAct | undefined {
  return getLawCorpus().acts.get(actId);
}

export function getSource(sourceId: string): LawSource | undefined {
  return getLawCorpus().sources.sources.find((s) => s.id === sourceId);
}

/** "ЗДвП, чл. 183, ал. 4, т. 14 (консолидиран текст, изм. ДВ, бр. 55 от 16.06.2026 г.)" */
export function formatCitation(
  act: LawAct,
  ref: string,
  parts: { paragraphRef?: string; pointRef?: string } = {},
): string {
  const head = [act.abbrBg, ref, parts.paragraphRef, parts.pointRef].filter(Boolean).join(", ");
  return act.consolidatedThroughBg ? `${head} (${act.consolidatedThroughBg})` : head;
}

/**
 * THE retrieval call. Ask for an article, get its real text back plus a stable
 * citation — or an explicit miss with the reason. Never throws for a miss and
 * never substitutes a nearby article.
 */
export function getArticle(
  actId: string,
  ref: string,
  parts: { paragraphRef?: string; pointRef?: string } = {},
): LawLookup {
  const act = getAct(actId);
  const normalised = normaliseUnitRef(ref) ?? ref.trim();
  if (!act) {
    return { found: false, reason: "act-not-in-corpus", queriedActId: actId, queriedRef: normalised };
  }
  const unit = act.units.find((u) => u.ref === normalised);
  if (!unit) {
    return { found: false, reason: "unit-not-found", queriedActId: actId, queriedRef: normalised };
  }
  return {
    found: true,
    act,
    unit,
    citationBg: formatCitation(act, unit.ref, parts),
    source: getSource(act.sourceId),
  };
}

/**
 * Resolve a `LawRef` exactly as it is already written across content/ —
 * `{ act: "ЗДвП", ref: "чл. 47" }`. This is what lets a later pass check all
 * 1,089 questions' citations against the statute instead of trusting them.
 */
export function resolveLawRef(lawRef: LawRef): LawLookup {
  const actId = actIdForActName(lawRef.act);
  const normalised = normaliseUnitRef(lawRef.ref) ?? lawRef.ref.trim();
  if (!actId) {
    return { found: false, reason: "act-not-in-corpus", queriedActId: null, queriedRef: normalised };
  }
  return getArticle(actId, normalised);
}

/** Resolve the unit a penalty citation points at (with its verbatim quote). */
export function resolveCitation(c: PenaltyCitation): LawLookup {
  return getArticle(c.actId, c.ref, { paragraphRef: c.paragraphRef, pointRef: c.pointRef });
}

// ---------------------------------------------------------------------------
// Penalties
// ---------------------------------------------------------------------------

export function listPenalties(): readonly PenaltyEntry[] {
  return getLawCorpus().penalties;
}

export function getPenalty(id: string): PenaltyEntry | undefined {
  return getLawCorpus().penalties.find((p) => p.id === id);
}

/** Every penalty whose lawRefs touch this article — the bridge from a question. */
export function penaltiesForArticle(actId: string, ref: string): PenaltyEntry[] {
  const normalised = normaliseUnitRef(ref) ?? ref.trim();
  return getLawCorpus().penalties.filter((p) =>
    [p.fine.source, p.controlPoints.source, ...(p.examPoints ? [p.examPoints.source] : [])].some(
      (c) => c.actId === actId && c.ref === normalised,
    ),
  );
}

/**
 * What a component may show for one figure. The founder's ruling, executable:
 * when the figure is not grounded there is NO number — the caller gets the rule
 * and the article instead, and cannot accidentally render a placeholder digit.
 */
export interface FigureDisplay {
  /** null = show no number at all. */
  valueBg: string | null;
  citationBg: string;
  /** Verbatim words the figure (or its absence) rests on. */
  quoteBg: string;
  /** Verbatim words naming the offence, when the act separates the two. */
  contextQuoteBg: string | null;
  noteBg: string | null;
}

function describe(
  valueBg: string | null,
  citation: PenaltyCitation,
  noteBg: string | null,
): FigureDisplay {
  const lookup = resolveCitation(citation);
  return {
    valueBg,
    citationBg: lookup.found ? lookup.citationBg : `${citation.ref} (извън наличния корпус)`,
    quoteBg: citation.quoteBg,
    contextQuoteBg: citation.contextQuoteBg ?? null,
    noteBg,
  };
}

export function describeFine(p: PenaltyEntry): FigureDisplay {
  return describe(
    p.fine.amountBgn === null ? null : `${p.fine.amountBgn} лв. (${p.fine.instrument})`,
    p.fine.source,
    p.fine.noteBg,
  );
}

export function describeControlPoints(p: PenaltyEntry): FigureDisplay {
  return describe(
    p.controlPoints.points === null ? null : `${p.controlPoints.points} контролни точки`,
    p.controlPoints.source,
    p.controlPoints.noteBg,
  );
}

export function describeExamPoints(p: PenaltyEntry): FigureDisplay | null {
  if (!p.examPoints) return null;
  const cls = p.examPoints.errorClassBg ? ` (${p.examPoints.errorClassBg} грешка)` : "";
  return describe(
    p.examPoints.points === null ? null : `${p.examPoints.points} наказателни точки${cls}`,
    p.examPoints.source,
    p.examPoints.noteBg,
  );
}
