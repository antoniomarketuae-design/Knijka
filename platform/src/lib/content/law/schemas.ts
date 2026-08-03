/**
 * Zod v4 schemas mirroring law/types.ts. Compile-time lockstep assertions at
 * the bottom fail `tsc` if a schema drifts from its interface.
 *
 * Beyond the structural mirror, the refinements encode the two rules the whole
 * source layer exists for:
 *
 *  1. Every figure carries a citation — the citation field is not optional.
 *  2. A figure with status "unknown" MUST carry a null value. That is the
 *     founder's ruling made unrepresentable-if-violated: you cannot store a
 *     guessed number, because the only way to store a number is to claim it is
 *     grounded, and the loader then checks the quote against the corpus.
 */
import { z } from "zod";
import type {
  ControlPointsPenalty,
  ExamPointsPenalty,
  FigureStatus,
  FineInstrument,
  FinePenalty,
  LawAct,
  LawSource,
  LawSourceRegister,
  LawUnit,
  PenaltyBank,
  PenaltyCitation,
  PenaltyEntry,
  SourceCoverage,
} from "./types";
import { LawRefSchema } from "../schemas";
import { ContentStatusSchema } from "../schemas";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACT_ID = /^[a-z0-9-]+$/;

export const SourceCoverageSchema = z.enum(["full-text", "index-only"]);

export const LawSourceSchema = z
  .strictObject({
    id: z.string().regex(/^src-[a-z0-9-]+$/, 'source id must be kebab-case with "src-" prefix'),
    actId: z.string().regex(ACT_ID).nullable(),
    titleBg: z.string().min(1),
    kind: z.string().min(1),
    publisherBg: z.string().min(1),
    url: z.string().url(),
    format: z.string().min(1),
    bytes: z.number().int().positive().nullable(),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex chars")
      .nullable(),
    versionBg: z.string().min(1).nullable(),
    coverage: SourceCoverageSchema,
    extraction: z.string().min(1).nullable(),
    httpStatus: z.number().int().min(0).max(599),
  })
  .check((ctx) => {
    const s = ctx.value;
    // A source we claim to hold the text of must be pinned to an exact file.
    if (s.coverage === "full-text" && (s.sha256 === null || s.bytes === null || s.actId === null)) {
      ctx.issues.push({
        code: "custom",
        message: `full-text source "${s.id}" must carry actId, bytes and sha256 — otherwise nobody can tell which file the quotes came from`,
        input: s,
        path: ["coverage"],
      });
    }
  });

export const LawSourceRegisterSchema = z.strictObject({
  version: z.number().int().positive(),
  retrievedAt: z.string().regex(ISO_DATE, "retrievedAt must be an ISO date"),
  registerUrl: z.string().url(),
  sources: z.array(LawSourceSchema).min(1),
});

export const LawUnitSchema = z.strictObject({
  ref: z.string().min(1),
  number: z.number().int().positive().nullable(),
  suffixBg: z.string().min(1).nullable(),
  contextBg: z.string().min(1).nullable(),
  textBg: z.string().min(1),
});

export const LawActSchema = z
  .strictObject({
    actId: z.string().regex(ACT_ID),
    abbrBg: z.string().min(1),
    titleBg: z.string().min(1),
    promulgationBg: z.string().min(1),
    consolidatedThroughBg: z.string().min(1).nullable(),
    sourceId: z.string().min(1),
    units: z.array(LawUnitSchema).min(1),
  })
  .check((ctx) => {
    const seen = new Set<string>();
    ctx.value.units.forEach((u, i) => {
      if (seen.has(u.ref)) {
        ctx.issues.push({
          code: "custom",
          message: `duplicate unit ref "${u.ref}" — a citation must address exactly one unit`,
          input: ctx.value,
          path: ["units", i, "ref"],
        });
      }
      seen.add(u.ref);
    });
  });

export const PenaltyCitationSchema = z.strictObject({
  actId: z.string().regex(ACT_ID),
  ref: z.string().min(1),
  paragraphRef: z.string().min(1).optional(),
  pointRef: z.string().min(1).optional(),
  quoteBg: z.string().min(8, "a citation quote must be long enough to be checkable"),
  contextQuoteBg: z.string().min(8).optional(),
});

export const FigureStatusSchema = z.enum(["grounded", "not-listed", "unknown"]);
export const FineInstrumentSchema = z.enum(["фиш", "акт"]);

/**
 * status ⇄ value coupling, shared by all three systems. Pure: returns the
 * problems so each schema can push them with its own ctx (zod's payload type
 * is schema-specific, so a shared helper must not touch it directly).
 */
function figureProblems(status: FigureStatus, value: number | null, field: string): string[] {
  const problems: string[] = [];
  if (status === "unknown" && value !== null) {
    problems.push(
      `status "unknown" must carry a null ${field} — an ungrounded figure shows the rule and the article with NO NUMBER`,
    );
  }
  if (status !== "unknown" && value === null) {
    problems.push(`status "${status}" claims the figure is known, so ${field} must not be null`);
  }
  if (status === "not-listed" && value !== 0) {
    problems.push(
      `status "not-listed" means the offence is absent from an exhaustive list, so ${field} must be 0`,
    );
  }
  return problems;
}

export const FinePenaltySchema = z
  .strictObject({
    system: z.literal("fine"),
    status: FigureStatusSchema,
    amountBgn: z.number().nonnegative().nullable(),
    instrument: FineInstrumentSchema,
    instrumentSource: PenaltyCitationSchema,
    source: PenaltyCitationSchema,
    noteBg: z.string().min(1).nullable(),
  })
  .check((ctx) => {
    for (const message of figureProblems(ctx.value.status, ctx.value.amountBgn, "amountBgn")) {
      ctx.issues.push({ code: "custom", message, input: ctx.value, path: ["amountBgn"] });
    }
  });

export const ControlPointsPenaltySchema = z
  .strictObject({
    system: z.literal("controlPoints"),
    status: FigureStatusSchema,
    points: z.number().int().nonnegative().nullable(),
    source: PenaltyCitationSchema,
    noteBg: z.string().min(1).nullable(),
  })
  .check((ctx) => {
    for (const message of figureProblems(ctx.value.status, ctx.value.points, "points")) {
      ctx.issues.push({ code: "custom", message, input: ctx.value, path: ["points"] });
    }
  });

export const ExamPointsPenaltySchema = z
  .strictObject({
    system: z.literal("examPoints"),
    status: FigureStatusSchema,
    points: z.number().int().nonnegative().nullable(),
    errorClassBg: z.string().min(1).nullable(),
    source: PenaltyCitationSchema,
    noteBg: z.string().min(1).nullable(),
  })
  .check((ctx) => {
    for (const message of figureProblems(ctx.value.status, ctx.value.points, "points")) {
      ctx.issues.push({ code: "custom", message, input: ctx.value, path: ["points"] });
    }
  });

export const PenaltyEntrySchema = z.strictObject({
  id: z.string().regex(/^pen-[a-z0-9-]+$/, 'penalty id must be kebab-case with "pen-" prefix'),
  titleBg: z.string().min(1),
  summaryBg: z.string().min(1),
  fine: FinePenaltySchema,
  controlPoints: ControlPointsPenaltySchema,
  examPoints: ExamPointsPenaltySchema.nullable(),
  lawRefs: z.array(LawRefSchema).min(1, "every penalty must cite at least one lawRef"),
  status: ContentStatusSchema,
});

export const PenaltyBankSchema = z
  .strictObject({
    version: z.number().int().positive(),
    penalties: z.array(PenaltyEntrySchema).min(1),
  })
  .check((ctx) => {
    const seen = new Set<string>();
    ctx.value.penalties.forEach((p, i) => {
      if (seen.has(p.id)) {
        ctx.issues.push({
          code: "custom",
          message: `duplicate penalty id "${p.id}"`,
          input: ctx.value,
          path: ["penalties", i, "id"],
        });
      }
      seen.add(p.id);
    });
  });

/* ------------------------------------------------------------------------ *
 * Compile-time lockstep guard (same device as lib/content/schemas.ts).
 * ------------------------------------------------------------------------ */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type LawSchemasMirrorTypes = [
  Assert<Equals<z.infer<typeof SourceCoverageSchema>, SourceCoverage>>,
  Assert<Equals<z.infer<typeof LawSourceSchema>, LawSource>>,
  Assert<Equals<z.infer<typeof LawSourceRegisterSchema>, LawSourceRegister>>,
  Assert<Equals<z.infer<typeof LawUnitSchema>, LawUnit>>,
  Assert<Equals<z.infer<typeof LawActSchema>, LawAct>>,
  Assert<Equals<z.infer<typeof PenaltyCitationSchema>, PenaltyCitation>>,
  Assert<Equals<z.infer<typeof FigureStatusSchema>, FigureStatus>>,
  Assert<Equals<z.infer<typeof FineInstrumentSchema>, FineInstrument>>,
  Assert<Equals<z.infer<typeof FinePenaltySchema>, FinePenalty>>,
  Assert<Equals<z.infer<typeof ControlPointsPenaltySchema>, ControlPointsPenalty>>,
  Assert<Equals<z.infer<typeof ExamPointsPenaltySchema>, ExamPointsPenalty>>,
  Assert<Equals<z.infer<typeof PenaltyEntrySchema>, PenaltyEntry>>,
  Assert<Equals<z.infer<typeof PenaltyBankSchema>, PenaltyBank>>,
];
