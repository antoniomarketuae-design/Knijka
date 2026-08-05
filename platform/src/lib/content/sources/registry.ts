/**
 * Non-statutory source registry loader + retrieval (server-only).
 *
 * The counterpart of lib/content/law/corpus.ts, for the citations that are not
 * law. Reads every register at first use, validates it, and hands back the
 * verbatim quote a claim rests on — or an explicit MISS with the reason.
 *
 * WHY THIS HAD TO SHIP WITH THE SCHEMA CHANGE. Adding `sourceRefs` to the
 * question shape without teaching the resolver about it would have shown an
 * honest but useless MISS on every first-aid row in the review console, which
 * is exactly the state the schema change is meant to end. A citation shape and
 * the thing that resolves it move together or not at all.
 *
 * ADR-002 applies here identically to law: nothing in this file may produce a
 * figure, a depth or a rate that is not read out of a register file.
 */
import fs from "node:fs";
import path from "node:path";
import { ClaimRegisterFileSchema, SourceRegisterFileSchema } from "./schemas";
import type { RegisteredSource, SourceClaim, SourceLookup } from "./types";
import type { SourceRef } from "../types";

if (typeof window !== "undefined") {
  throw new Error(
    "lib/content/sources/registry is server-only — import it from server code, never from client components",
  );
}

/**
 * The registers, and where each one lives relative to `content/`.
 *
 * Deliberately a list and not a directory scan: a register is a deliberate
 * editorial decision about what may be cited, not whatever JSON happens to be
 * on disk. Source ids are globally unique across all of them, so a `sourceRef`
 * names only the id — adding a register never changes a question row.
 */
export const REGISTERS = [
  { id: "medical", dir: "medical" },
  { id: "general", dir: "sources" },
] as const;

export type RegisterId = (typeof REGISTERS)[number]["id"];

export interface SourceRegistry {
  sources: ReadonlyMap<string, RegisteredSource>;
  claims: ReadonlyMap<string, SourceClaim>;
  /** Registers that are simply absent — not an error; a checkout may not have
   *  ingested one yet, and a MISS with a reason beats a crash at page load. */
  missingRegisters: readonly string[];
}

function contentDir(): string {
  const candidates = [
    path.join(process.cwd(), "content"),
    path.resolve(process.cwd(), "..", "content"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "topics.json"))) return dir;
  }
  throw new Error(
    `content/ not found (cwd: ${process.cwd()}). Looked in: ${candidates.join(", ")}`,
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

let cached: SourceRegistry | null = null;

/** Test seam — the law corpus has the same one, for the same reason. */
export function resetSourceRegistry(): void {
  cached = null;
}

export function getSourceRegistry(): SourceRegistry {
  if (cached) return cached;

  const root = contentDir();
  const sources = new Map<string, RegisteredSource>();
  const claims = new Map<string, SourceClaim>();
  const missingRegisters: string[] = [];

  for (const register of REGISTERS) {
    const dir = path.join(root, register.dir);
    const sourcesFile = path.join(dir, "sources.json");
    if (!fs.existsSync(sourcesFile)) {
      missingRegisters.push(register.id);
      continue;
    }

    const file = parseOrThrow<{ sources: Omit<RegisteredSource, "register">[] }>(
      SourceRegisterFileSchema,
      readJson(sourcesFile),
      `content/${register.dir}/sources.json`,
    );
    for (const row of file.sources) {
      // Ids are globally unique BY CONTRACT (see REGISTERS above), so a
      // collision is a real authoring bug and must not be resolved silently by
      // last-writer-wins — that would make a citation point at a source nobody
      // intended.
      if (sources.has(row.id)) {
        throw new Error(
          `duplicate source id "${row.id}" — it is in register "${sources.get(row.id)?.register}" and again in "${register.id}". Source ids are globally unique.`,
        );
      }
      sources.set(row.id, { ...row, register: register.id });
    }

    const claimsFile = path.join(dir, "claims.json");
    if (!fs.existsSync(claimsFile)) continue;
    const claimFile = parseOrThrow<{ claims: Omit<SourceClaim, "register">[] }>(
      ClaimRegisterFileSchema,
      readJson(claimsFile),
      `content/${register.dir}/claims.json`,
    );
    for (const row of claimFile.claims) {
      if (claims.has(row.id)) {
        throw new Error(
          `duplicate claim id "${row.id}" across registers — claim ids are globally unique.`,
        );
      }
      claims.set(row.id, { ...row, register: register.id });
    }
  }

  cached = { sources, claims, missingRegisters };
  return cached;
}

export function getRegisteredSource(sourceId: string): RegisteredSource | undefined {
  return getSourceRegistry().sources.get(sourceId);
}

export function getSourceClaim(claimId: string): SourceClaim | undefined {
  return getSourceRegistry().claims.get(claimId);
}

/** "НСИ — Пътнотранспортни произшествия … 2023 (издание 2024 г., данни за 2023 г.)" */
export function formatSourceCitation(source: RegisteredSource): string {
  const title = source.titleBg?.trim() || source.titleEn?.trim() || source.id;
  const head = source.publisherBg.trim() ? `${source.publisherBg} — ${title}` : title;
  return source.editionBg.trim() ? `${head} (${source.editionBg})` : head;
}

/**
 * THE retrieval call for a non-statutory citation. Resolve a `sourceRef`
 * exactly as it is written on a question row. Never throws for a miss and never
 * substitutes a nearby source.
 *
 * A `claimId` that names a claim which does NOT list this source among its
 * quotes is a miss, not a partial hit: silently showing a quote from a
 * different source than the row cites is the whole failure mode again.
 */
export function resolveSourceRef(ref: SourceRef): SourceLookup {
  const sourceId = ref.sourceId.trim();
  const claimId = ref.claimId?.trim() ?? null;
  const source = getRegisteredSource(sourceId);
  if (!source) {
    return { found: false, reason: "source-not-in-registers", queriedSourceId: sourceId, queriedClaimId: claimId };
  }
  if (claimId === null) {
    return { found: true, source, claim: null, citationBg: formatSourceCitation(source) };
  }
  const claim = getSourceClaim(claimId);
  if (claim === undefined) {
    return { found: false, reason: "claim-not-found", queriedSourceId: sourceId, queriedClaimId: claimId };
  }
  const quotes = [...(claim.authoritative ? [claim.authoritative] : []), ...claim.corroborating];
  // A claim with NO quotes at all is an `ungrounded-*` claim, and that is
  // information the reviewer needs on screen, not a miss to be hidden. A claim
  // that HAS quotes but none from the cited source is a different thing — the
  // row points at the wrong source, and showing a sibling's sentence under it
  // would be the decorative citation one level down.
  if (quotes.length > 0 && !quotes.some((q) => q.sourceId === sourceId)) {
    return { found: false, reason: "claim-not-found", queriedSourceId: sourceId, queriedClaimId: claimId };
  }
  return { found: true, source, claim, citationBg: formatSourceCitation(source) };
}

/**
 * The quote this ref actually grounds: the claim's quote FROM THE CITED SOURCE,
 * preferring the authoritative one. Returns null when the ref named no claim.
 */
export function quoteForSourceRef(ref: SourceRef): string | null {
  const lookup = resolveSourceRef(ref);
  if (!lookup.found || lookup.claim === null) return null;
  const { claim } = lookup;
  if (claim.authoritative?.sourceId === lookup.source.id) return claim.authoritative.quoteBg;
  return claim.corroborating.find((q) => q.sourceId === lookup.source.id)?.quoteBg ?? null;
}

/** Every claim that grounds a given question id — the bridge from a row. */
export function claimsForQuestion(questionId: string): SourceClaim[] {
  return [...getSourceRegistry().claims.values()].filter((c) =>
    c.questionIds.includes(questionId),
  );
}
