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
  QuestionMedia,
  QuestionOption,
  SceneStillMedia,
  Section,
  Sign,
  SignMediaRef,
  Topic,
} from "./types";

/** Values that appear more than once, in first-seen order. */
function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) (seen.has(value) ? dupes : seen).add(value);
  return [...dupes];
}

/**
 * Machine tiers and the human tier, kept apart on purpose — `machine-checked`
 * is the honest thing a generator may write; `approved` is a person's word and
 * needs a signature in content/review/approvals.json to mean anything.
 */
export const ContentStatusSchema = z.enum([
  "draft",
  "machine-checked",
  "needs-review",
  "approved",
]);

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

// ---------------------------------------------------------------------------
// Question media (THEO-1) — data-driven kinds; numeric limits mirrored in
// scripts/validate-content.mjs (keep in lockstep).
// ---------------------------------------------------------------------------

/** zoomM window limits, meters: tighter than a parking stall is unreadable,
 *  wider than half a district is not a "still". */
export const SCENE_ZOOM_MIN_M = 6;
export const SCENE_ZOOM_MAX_M = 500;
export const SCENE_MAX_POSES = 12;
export const SCENE_MAX_MARKS = 8;

const finite = () => z.number().finite();

export const SignMediaRefSchema = z.strictObject({
  kind: z.literal("sign"),
  signRef: z.string().min(1, "signRef must be an official sign code, e.g. \"В24\""),
});

export const SceneStillPoseSchema = z.strictObject({
  kind: z.enum(["car", "truck", "bus", "tram", "bike", "ped"]),
  x: finite(),
  y: finite(),
  headingDeg: finite().min(-360).max(360),
  variant: z.literal("ego").optional(),
});

export const SceneStillMarkSchema = z.strictObject({
  kind: z.enum(["danger", "target", "proceed", "yield"]),
  x: finite(),
  y: finite(),
});

export const SceneStillMediaSchema = z.strictObject({
  kind: z.literal("sceneStill"),
  // Charset-locked: the id lands in a fetch URL (/world/<id>.json).
  districtId: z.string().regex(KEBAB_SLUG, "districtId must be kebab-case"),
  focus: z.strictObject({
    x: finite(),
    y: finite(),
    zoomM: finite().min(SCENE_ZOOM_MIN_M).max(SCENE_ZOOM_MAX_M),
  }),
  poses: z.array(SceneStillPoseSchema).max(SCENE_MAX_POSES),
  marks: z.array(SceneStillMarkSchema).max(SCENE_MAX_MARKS).optional(),
});

/**
 * Everything drawn must sit inside the focus window (zoomM × zoomM square
 * centered on focus) — an out-of-frame pose is authoring garbage. Runs as a
 * QUESTION-level check (after the media union resolves) so the message stays
 * crisp instead of a generic union failure.
 */
function sceneWindowIssues(scene: SceneStillMedia): { message: string; path: (string | number)[] }[] {
  const half = scene.focus.zoomM / 2;
  const outside = (x: number, y: number) =>
    Math.abs(x - scene.focus.x) > half || Math.abs(y - scene.focus.y) > half;
  const issues: { message: string; path: (string | number)[] }[] = [];
  scene.poses.forEach((pose, i) => {
    if (outside(pose.x, pose.y)) {
      issues.push({
        message: `poses[${i}] at (${pose.x}, ${pose.y}) is outside the focus window (±${half} m around the focus)`,
        path: ["media", "poses", i],
      });
    }
  });
  (scene.marks ?? []).forEach((mark, i) => {
    if (outside(mark.x, mark.y)) {
      issues.push({
        message: `marks[${i}] at (${mark.x}, ${mark.y}) is outside the focus window (±${half} m around the focus)`,
        path: ["media", "marks", i],
      });
    }
  });
  return issues;
}

/** Legacy binary-ref shape kept for contract compatibility (no bank item uses
 *  it; the data-driven kinds above are the THEO-1 way). */
const LegacyMediaSchema = z.strictObject({
  type: z.enum(["image", "video"]),
  ref: z.string().min(1),
});

export const QuestionMediaSchema = z.union([
  LegacyMediaSchema,
  SignMediaRefSchema,
  SceneStillMediaSchema,
]);

export const QuestionOptionSchema = z.strictObject({
  id: z.string().min(1, "option id must not be empty"),
  textBg: z.string().min(1),
  correct: z.boolean(),
  media: SignMediaRefSchema.optional(),
  // Per-option rationale (doc 64 THEO-4). Optional while authoring catches up,
  // but present-and-blank is authoring garbage, so min(1) when it is there.
  whyWrongBg: z.string().min(1, "whyWrongBg must not be empty when present").optional(),
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
    media: QuestionMediaSchema.nullable(),
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

    if (q.media !== null && "kind" in q.media && q.media.kind === "sceneStill") {
      for (const issue of sceneWindowIssues(q.media)) {
        ctx.issues.push({ code: "custom", message: issue.message, input: q, path: issue.path });
      }
    }
  });

export const SectionSchema = z
  .strictObject({
    id: z.string().regex(/^s-[a-z0-9-]+$/, 'section id must be kebab-case with "s-" prefix'),
    topicId: z.string().min(1),
    titleBg: z.string().min(1),
    conceptIds: z
      .array(z.string().min(1))
      .min(1, "section must reference at least one concept"),
  })
  .check((ctx) => {
    const dupes = duplicates(ctx.value.conceptIds);
    if (dupes.length > 0) {
      ctx.issues.push({
        code: "custom",
        message: `conceptIds contains duplicate ids: ${dupes.join(", ")}`,
        input: ctx.value,
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
export const SectionsFileSchema = z.array(SectionSchema);
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
  Assert<Equals<z.infer<typeof SignMediaRefSchema>, SignMediaRef>>,
  Assert<Equals<z.infer<typeof SceneStillMediaSchema>, SceneStillMedia>>,
  Assert<Equals<z.infer<typeof QuestionMediaSchema>, QuestionMedia>>,
  Assert<Equals<z.infer<typeof QuestionOptionSchema>, QuestionOption>>,
  Assert<Equals<z.infer<typeof QuestionSchema>, Question>>,
  Assert<Equals<z.infer<typeof SectionSchema>, Section>>,
  Assert<Equals<z.infer<typeof SignSchema>, Sign>>,
];
