/**
 * Zod schemas for the non-statutory source registers.
 *
 * NOT `strictObject`, on purpose, and this is the one place in the content
 * layer where that is the right call: the register files are emitted by
 * INDEPENDENT builders (content/medical/tools, content/sources/tools) that
 * legitimately carry extra domain fields — `naredba24TopicBg` means something
 * in the medical register and nothing anywhere else. A strict schema here would
 * force every register to grow every other register's vocabulary, which is the
 * lockstep trap in reverse. What IS enforced is that every field this code
 * reads is present and of the right type.
 */
import { z } from "zod";

const SHA256 = /^[0-9a-f]{64}$/;

export const RegisteredSourceSchema = z.object({
  id: z.string().regex(/^src-[a-z0-9-]+$/, 'source id must be kebab-case with "src-" prefix'),
  kind: z.string().min(1),
  authority: z.string().min(1),
  titleBg: z.string().nullable().default(null),
  titleEn: z.string().nullable().default(null),
  publisherBg: z.string().min(1),
  editionBg: z.string(),
  url: z.string().url("a source must be re-fetchable — url is not optional"),
  format: z.string().min(1),
  httpStatus: z.number().int(),
  rawBytes: z.number().int().nonnegative(),
  rawSha256: z.string().regex(SHA256),
  rawHashStable: z.boolean(),
  textBytes: z.number().int().nonnegative(),
  textSha256: z.string().regex(SHA256),
  extraction: z.string().min(1),
  coversBg: z.string(),
  supersedesId: z.string().nullable().default(null),
  noteBg: z.string().nullable().default(null),
});

export const SourceQuoteSchema = z.object({
  // `src-…` for a register source, or `law:<actId>` when a claim is grounded in
  // the statute corpus instead — see the SourceQuote doc comment.
  sourceId: z.string().min(1),
  // Long enough to be checkable — the same floor content/law puts on a penalty
  // citation. A three-word "quote" proves nothing.
  quoteBg: z.string().min(8, "a quote must be long enough to be checkable"),
  lineNo: z.number().int().positive().nullable().default(null),
});

/** A plain sentence, or the other source's own words plus what differs. */
export const SourceConflictSchema = z.union([
  z.string().min(1),
  z.object({
    sourceId: z.string().min(1),
    quoteBg: z.string().min(8),
    lineNo: z.number().int().positive().nullable().default(null),
    natureBg: z.string().min(1),
  }),
]);

export const SourceClaimSchema = z.object({
  id: z.string().min(1),
  topicBg: z.string().min(1),
  conceptIds: z.array(z.string().min(1)),
  questionIds: z.array(z.string().min(1)),
  figureBg: z.string().nullable().default(null),
  figureQuote: SourceQuoteSchema.nullable().default(null),
  // Nullable on purpose — see the doc comment on SourceClaim.authoritative. A
  // claim with no reachable source must be expressible, or the register would
  // quietly pressure whoever fills it in to attach something close enough.
  authoritative: SourceQuoteSchema.nullable().default(null),
  corroborating: z.array(SourceQuoteSchema).default([]),
  conflicts: z.array(SourceConflictSchema).default([]),
  statusBg: z.string().min(1),
  noteBg: z.string().nullable().default(null),
});

export const SourceRegisterFileSchema = z.object({
  version: z.number().int().positive(),
  retrievedAt: z.string().min(1),
  sources: z.array(RegisteredSourceSchema),
});

export const ClaimRegisterFileSchema = z.object({
  version: z.number().int().positive(),
  retrievedAt: z.string().min(1),
  claims: z.array(SourceClaimSchema),
});
