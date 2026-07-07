/**
 * Zod v4 schemas mirroring src/lib/content/types.ts (the typed contract of
 * content/SCHEMA.md) exactly — see the compile-time assertions at the bottom,
 * which fail `tsc` if the inferred types ever drift from the interfaces.
 *
 * On top of the structural mirror, cross-field refinements enforce:
 *  - "single" questions have exactly 1 correct option
 *  - "multi" questions have >= 2 correct options
 *  - points ∈ {1, 2, 3} (also encoded in the type)
 *  - option ids are unique within a question
 */
import { z } from "zod";
import type {
  Concept,
  ContentStatus,
  LawRef,
  Question,
  QuestionOption,
  Sign,
  Topic,
} from "./types";

/** Values that appear more than once, in first-seen order. */
function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) (seen.has(value) ? dupes : seen).add(value);
  return [...dupes];
}

export const ContentStatusSchema = z.enum(["draft", "needs-review", "approved"]);

export const LawRefSchema = z.strictObject({
  act: z.string().min(1, "lawRef.act must not be empty"),
  ref: z.string().min(1, "lawRef.ref must not be empty"),
});

const KEBAB_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const TopicSchema = z.strictObject({
  id: z.string().regex(/^t-[a-z0-9-]+$/, 'topic id must be kebab-case with "t-" prefix'),
  order: z.number().int().positive("topic order must be a positive integer"),
  slug: z.string().regex(KEBAB_SLUG, "topic slug must be kebab-case"),
  titleBg: z.string().min(1),
  titleEn: z.string().min(1),
  descriptionBg: z.string().min(1),
});

export const ConceptSchema = z
  .strictObject({
    id: z.string().regex(/^c-[a-z0-9-]+$/, 'concept id must be kebab-case with "c-" prefix'),
    topicId: z.string().min(1),
    titleBg: z.string().min(1),
    titleEn: z.string().min(1),
    summaryBg: z.string().min(1),
    dependsOn: z.array(z.string().min(1)),
    lawRefs: z.array(LawRefSchema).min(1, "every concept must cite at least one lawRef"),
    difficulty: z.literal([1, 2, 3]),
  })
  .check((ctx) => {
    const dupes = duplicates(ctx.value.dependsOn);
    if (dupes.length > 0) {
      ctx.issues.push({
        code: "custom",
        message: `dependsOn contains duplicate ids: ${dupes.join(", ")}`,
        input: ctx.value,
        path: ["dependsOn"],
      });
    }
  });

export const QuestionOptionSchema = z.strictObject({
  id: z.string().min(1, "option id must not be empty"),
  textBg: z.string().min(1),
  correct: z.boolean(),
});

export const QuestionSchema = z
  .strictObject({
    id: z.string().min(1, "question id must not be empty"),
    conceptIds: z.array(z.string().min(1)).min(1, "question must reference at least one concept"),
    type: z.enum(["single", "multi"]),
    points: z.literal([1, 2, 3]),
    textBg: z.string().min(1),
    options: z.array(QuestionOptionSchema).min(2, "question must offer at least 2 options"),
    explanationBg: z.string().min(1),
    lawRefs: z.array(LawRefSchema).min(1, "every question must cite at least one lawRef"),
    media: z
      .strictObject({
        type: z.enum(["image", "video"]),
        ref: z.string().min(1),
      })
      .nullable(),
    status: ContentStatusSchema,
  })
  .check((ctx) => {
    const q = ctx.value;

    const correctCount = q.options.filter((o) => o.correct).length;
    if (q.type === "single" && correctCount !== 1) {
      ctx.issues.push({
        code: "custom",
        message: `"single" question must have exactly 1 correct option, found ${correctCount}`,
        input: q,
        path: ["options"],
      });
    }
    if (q.type === "multi" && correctCount < 2) {
      ctx.issues.push({
        code: "custom",
        message: `"multi" question must have at least 2 correct options, found ${correctCount}`,
        input: q,
        path: ["options"],
      });
    }

    const optionDupes = duplicates(q.options.map((o) => o.id));
    if (optionDupes.length > 0) {
      ctx.issues.push({
        code: "custom",
        message: `option ids must be unique within a question, duplicated: ${optionDupes.join(", ")}`,
        input: q,
        path: ["options"],
      });
    }

    const conceptDupes = duplicates(q.conceptIds);
    if (conceptDupes.length > 0) {
      ctx.issues.push({
        code: "custom",
        message: `conceptIds contains duplicate ids: ${conceptDupes.join(", ")}`,
        input: q,
        path: ["conceptIds"],
      });
    }
  });

export const SignSchema = z.strictObject({
  id: z.string().regex(/^sign-[a-z0-9-]+$/, 'sign id must be kebab-case with "sign-" prefix'),
  code: z.string().min(1),
  group: z.string().min(1),
  nameBg: z.string().min(1),
  meaningBg: z.string().min(1),
  svgFile: z.string().min(1),
  lawRefs: z.array(LawRefSchema),
  status: ContentStatusSchema,
});

/** File-level schemas: every content file is a JSON array of one entity type. */
export const TopicsFileSchema = z.array(TopicSchema);
export const ConceptsFileSchema = z.array(ConceptSchema);
export const QuestionsFileSchema = z.array(QuestionSchema);
export const SignsFileSchema = z.array(SignSchema);

/* ------------------------------------------------------------------------ *
 * Compile-time lockstep guard: if a schema's inferred type is not exactly
 * identical to its interface in types.ts, this file stops typechecking.
 * ------------------------------------------------------------------------ */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

export type SchemasMirrorTypes = [
  Assert<Equals<z.infer<typeof ContentStatusSchema>, ContentStatus>>,
  Assert<Equals<z.infer<typeof LawRefSchema>, LawRef>>,
  Assert<Equals<z.infer<typeof TopicSchema>, Topic>>,
  Assert<Equals<z.infer<typeof ConceptSchema>, Concept>>,
  Assert<Equals<z.infer<typeof QuestionOptionSchema>, QuestionOption>>,
  Assert<Equals<z.infer<typeof QuestionSchema>, Question>>,
  Assert<Equals<z.infer<typeof SignSchema>, Sign>>,
];
