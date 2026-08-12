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
  DisqualificationPenalty,
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
  PenaltyConduct,
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

/**
 * THE UNIQUENESS GUARD THE REGISTER DID NOT HAVE.
 *
 * `PenaltyBankSchema` refuses a duplicate penalty id and `LawActSchema` refuses
 * a duplicate unit ref — measured, both fire. This file had the same shape of
 * lookup with no guard at all: `getSource(id)` is a `.find()`, so two rows
 * sharing an id means the first wins, the second is unreachable, and nothing
 * says so. It is the worse half of the pair, because a source row is WHICH FILE
 * A QUOTE CAME FROM: its sha256, its byte count, its ДВ version. Shadow the
 * ЗДвП row with a second one and every citation in the bank keeps loading while
 * the provenance printed under it belongs to a different document.
 *
 * `actId` is guarded too, for full-text sources: `build()` matches an act to
 * its source by id and asks only that the source be full-text, so two full-text
 * rows claiming to be the text of one act is two answers to „which file is
 * ЗДвП?". Measured on the shipped register before writing this: 34 sources, 34
 * distinct ids, 8 non-null actIds, 8 distinct — the guard changes nothing today
 * and refuses the day it would matter.
 */
export const LawSourceRegisterSchema = z
  .strictObject({
    version: z.number().int().positive(),
    retrievedAt: z.string().regex(ISO_DATE, "retrievedAt must be an ISO date"),
    registerUrl: z.string().url(),
    sources: z.array(LawSourceSchema).min(1),
  })
  .check((ctx) => {
    const seenId = new Set<string>();
    const actOwner = new Map<string, string>();
    ctx.value.sources.forEach((s, i) => {
      if (seenId.has(s.id)) {
        ctx.issues.push({
          code: "custom",
          message: `duplicate source id "${s.id}" — getSource() takes the first, so the second row is unreachable and the provenance shown under a quote could be the wrong file`,
          input: ctx.value,
          path: ["sources", i, "id"],
        });
      }
      seenId.add(s.id);
      if (s.coverage !== "full-text" || s.actId === null) return;
      const prior = actOwner.get(s.actId);
      if (prior !== undefined) {
        ctx.issues.push({
          code: "custom",
          message: `sources "${prior}" and "${s.id}" both claim to be the full text of act "${s.actId}" — an act has one file, one sha256 and one ДВ version`,
          input: ctx.value,
          path: ["sources", i, "actId"],
        });
      } else {
        actOwner.set(s.actId, s.id);
      }
    });
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
  // Checked for real in corpus.ts, where the act text is available: it must
  // occur in the cited unit AND inside the quotes. Here we only refuse a phrase
  // too short to identify anything — „скорост" would match half the statute.
  offencePhraseBg: z.string().min(12, "an offence phrase must be specific enough to identify one offence").optional(),
});

/**
 * The row's declaration of what it prices. Everything with teeth is in
 * corpus.ts, where the act text is available — the anchors must be findable in
 * the act, the statement must satisfy them, and every offence phrase on the row
 * must satisfy them too. Here we only refuse the shapes that would make that
 * check vacuous:
 *
 *  - an EMPTY anchor set, which every phrase satisfies;
 *  - a group of nothing but two-letter fragments. „Б2" is a legitimate
 *    alternative — it identifies one sign — but a group in which NOTHING is
 *    longer than three characters is a group that matches by accident, so at
 *    least one alternative must be substantial.
 */
export const PenaltyConductSchema = z
  .strictObject({
    statementBg: z.string().min(20, "the conduct statement must be a sentence a reviewer can judge"),
    anchorsBg: z
      .array(z.array(z.string().min(2)).min(1, "an anchor group needs at least one alternative"))
      .min(1, "a conduct with no anchors is satisfied by every sentence, including the wrong one"),
  })
  .check((ctx) => {
    ctx.value.anchorsBg.forEach((group, i) => {
      if (!group.some((a) => a.trim().length >= 4)) {
        ctx.issues.push({
          code: "custom",
          message: `anchor group ${i} has no alternative longer than three characters — a group that short matches by accident`,
          input: ctx.value,
          path: ["anchorsBg", i],
        });
      }
      const seen = new Set<string>();
      for (const a of group) {
        if (seen.has(a)) {
          ctx.issues.push({
            code: "custom",
            message: `anchor group ${i} repeats "${a}"`,
            input: ctx.value,
            path: ["anchorsBg", i],
          });
        }
        seen.add(a);
      }
    });
  });

export const FigureStatusSchema = z.enum(["grounded", "not-listed", "unknown"]);
export const FineInstrumentSchema = z.enum(["фиш", "електронен фиш", "акт"]);

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
    instrument: FineInstrumentSchema.nullable(),
    instrumentSource: PenaltyCitationSchema.nullable(),
    source: PenaltyCitationSchema,
    noteBg: z.string().min(1).nullable(),
  })
  .check((ctx) => {
    for (const message of figureProblems(ctx.value.status, ctx.value.amountBgn, "amountBgn")) {
      ctx.issues.push({ code: "custom", message, input: ctx.value, path: ["amountBgn"] });
    }
    // An instrument is a claim about the law, so it needs the rule that permits
    // it — and naming a rule while claiming no instrument is a dangling cite.
    if ((ctx.value.instrument === null) !== (ctx.value.instrumentSource === null)) {
      ctx.issues.push({
        code: "custom",
        message:
          "instrument and instrumentSource must be null together — an instrument without the rule that permits it is an assertion from memory, which is the thing ADR-002 forbids",
        input: ctx.value,
        path: ["instrumentSource"],
      });
    }
  });

/**
 * Лишаване от право. Same status⇄value coupling as the three figure systems,
 * plus one of its own: a grounded ban must quote its duration in the act's own
 * words, and `durationBg` must be a substring of the quote (checked at load in
 * corpus.ts, where the act text is available).
 */
export const DisqualificationPenaltySchema = z
  .strictObject({
    system: z.literal("disqualification"),
    status: FigureStatusSchema,
    months: z.number().int().nonnegative().nullable(),
    durationBg: z.string().min(1).nullable(),
    source: PenaltyCitationSchema,
    noteBg: z.string().min(1).nullable(),
  })
  .check((ctx) => {
    const v = ctx.value;
    for (const message of figureProblems(v.status, v.months, "months")) {
      ctx.issues.push({ code: "custom", message, input: v, path: ["months"] });
    }
    if (v.status === "grounded" && v.durationBg === null) {
      ctx.issues.push({
        code: "custom",
        message:
          'a grounded лишаване must carry durationBg — the act\'s own words for the period ("6 месеца", "два месеца"), because rendering the number ourselves is paraphrase',
        input: v,
        path: ["durationBg"],
      });
    }
    if (v.status !== "grounded" && v.durationBg !== null) {
      ctx.issues.push({
        code: "custom",
        message: `status "${v.status}" claims no period is established, so durationBg must be null`,
        input: v,
        path: ["durationBg"],
      });
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

export const PenaltyEntrySchema = z
  .strictObject({
    id: z.string().regex(/^pen-[a-z0-9-]+$/, 'penalty id must be kebab-case with "pen-" prefix'),
    titleBg: z.string().min(1),
    summaryBg: z.string().min(1),
    conduct: PenaltyConductSchema,
    fine: FinePenaltySchema,
    controlPoints: ControlPointsPenaltySchema,
    disqualification: DisqualificationPenaltySchema,
    examPoints: ExamPointsPenaltySchema.nullable(),
    lawRefs: z.array(LawRefSchema).min(1, "every penalty must cite at least one lawRef"),
    status: ContentStatusSchema,
  })
  .check((ctx) => {
    /**
     * THE INSTRUMENT IS DERIVED, NOT CHOSEN — and this is the whole reason
     * `disqualification` exists as a field.
     *
     * Three of the first six entries carried `instrument: "акт"` on the
     * inference „контролни точки се отнемат само с наказателно постановление,
     * значи по акт". ДВ, бр. 64 от 2025 г. ended that inference: a фиш now
     * carries контролни точки itself (чл. 186, ал. 1) and so does an електронен
     * фиш (чл. 189, ал. 5, т. 8), and Наредба № Iз-2539 чл. 2, ал. 6 names all
     * three as bases for deduction. The one test the statute actually states is
     * whether ЛИШАВАНЕ ОТ ПРАВО is provided:
     *
     *   чл. 186, ал. 1 — „За административни нарушения, за които НЕ Е
     *     ПРЕДВИДЕНО наказание лишаване от право да управлява моторно превозно
     *     средство, може да бъде наложена с фиш глоба…"
     *   чл. 189, ал. 4 — the identical condition for an електронен фиш.
     *
     * So the ban fixes the instrument, and an entry that has not established
     * the ban may not name one. Nothing below is a style rule: each branch is a
     * sentence in the act.
     */
    const { fine, disqualification: ban } = ctx.value;
    const push = (message: string): void => {
      ctx.issues.push({ code: "custom", message, input: ctx.value, path: ["fine", "instrument"] });
    };
    if (ban.status === "grounded" && fine.instrument !== "акт") {
      push(
        `лишаване от право is provided (${ban.durationBg ?? "?"}), so ЗДвП чл. 186, ал. 1 and чл. 189, ал. 4 both bar a фиш — instrument must be "акт", not "${fine.instrument}"`,
      );
    }
    if (ban.status === "not-listed" && fine.instrument !== "фиш" && fine.instrument !== "електронен фиш") {
      push(
        `no лишаване is provided for this offence, so ЗДвП чл. 186, ал. 1 permits a фиш — instrument must be "фиш" or "електронен фиш", not "${fine.instrument}". (An акт is still drawn up if the driver disputes it, чл. 186, ал. 2 — that belongs in noteBg, not here: it is a fact about the driver, not about the offence.)`,
      );
    }
    if (ban.status === "unknown" && fine.instrument !== null) {
      push(
        'whether лишаване is provided has not been established, so no instrument may be claimed — instrument must be null, the same ruling that forbids a guessed number',
      );
    }
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
  Assert<Equals<z.infer<typeof PenaltyConductSchema>, PenaltyConduct>>,
  Assert<Equals<z.infer<typeof FigureStatusSchema>, FigureStatus>>,
  Assert<Equals<z.infer<typeof FineInstrumentSchema>, FineInstrument>>,
  Assert<Equals<z.infer<typeof FinePenaltySchema>, FinePenalty>>,
  Assert<Equals<z.infer<typeof ControlPointsPenaltySchema>, ControlPointsPenalty>>,
  Assert<Equals<z.infer<typeof DisqualificationPenaltySchema>, DisqualificationPenalty>>,
  Assert<Equals<z.infer<typeof ExamPointsPenaltySchema>, ExamPointsPenalty>>,
  Assert<Equals<z.infer<typeof PenaltyEntrySchema>, PenaltyEntry>>,
  Assert<Equals<z.infer<typeof PenaltyBankSchema>, PenaltyBank>>,
];
