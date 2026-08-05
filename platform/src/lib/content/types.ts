/**
 * Typed mirror of content/SCHEMA.md — the contract between the content
 * files (JSON in /content) and platform code. Keep in lockstep with SCHEMA.md.
 */

/**
 * Where an item sits in the AUTHORING pipeline. Two of these values are set by
 * machines and one is set by a person, and conflating them is what let 1,005
 * questions ship carrying `approved` because a generator wrote it — including
 * all nine that are literally unanswerable (docs/education/90 §1).
 *
 *   draft            being written; incomplete on purpose
 *   machine-checked  generated and passing every automated check — NO HUMAN
 *                    HAS READ IT. This is what a generator is allowed to write.
 *   needs-review     a person or an audit named a specific problem
 *   approved         a person cleared it — and the CLAIM is only worth anything
 *                    when content/review/approvals.json carries their signature
 *                    over the row's content hash (modules/content-admin).
 *
 * The row's status alone never proves a human did anything. See content/SCHEMA.md.
 */
export type ContentStatus = "draft" | "machine-checked" | "needs-review" | "approved";

export interface LawRef {
  act: string; // e.g. "ЗДвП", "Наредба РД-02-21-1/2023"
  ref: string; // e.g. "чл. 47" ("?" suffix = unverified)
}

/**
 * A citation to something that is NOT a statute, and the answer to the schema
 * defect that produced the decorative citation (docs/education/90 §12 item 8,
 * §14 item N).
 *
 * WHY THIS EXISTS. `lawRefs` used to be `.min(1)` on every question, so a row
 * was COMPELLED to name an act even when no act governs what it asks. Twenty-
 * nine first-aid questions duly cited „ЗДвП чл. 123" — the duty to stop and
 * assist — under claims about compression depth and tourniquets. The citation
 * was not sloppy; it was the only thing the schema would accept. A compression
 * depth is settled by a clinical guideline, and the number of casualties in a
 * statistic is settled by a statistical methodology; neither has an article
 * number, and pretending otherwise is how a student is pointed at a text that
 * cannot answer the question they just got wrong.
 *
 * `sourceId` resolves in the non-statutory source registers
 * (content/medical/, content/sources/ — see lib/content/sources), each of which
 * pins its sources by URL, byte count and sha256 exactly as content/law does.
 * A row may carry `lawRefs`, `sourceRefs`, or both; it must carry at least one
 * citation of SOME kind, which is the part of the old rule worth keeping.
 */
export interface SourceRef {
  /** Register id of the source, e.g. "src-erc-2025-layperson". Must resolve. */
  sourceId: string;
  /** Where inside that source, in the source's own terms — no article numbers
   *  are invented: "Adult BLS — Chest compressions", "Методологични бележки". */
  ref: string;
  /** Optional claim id in the register's claims.json — the machine-checked
   *  verbatim quote that grounds this row. Lets the review console show the
   *  sentence rather than only the source's name. */
  claimId?: string;
}

export interface Topic {
  id: string; // "t-" prefix
  order: number;
  slug: string;
  titleBg: string;
  titleEn: string;
  descriptionBg: string;
}

export interface Concept {
  id: string; // "c-" prefix
  topicId: string;
  titleBg: string;
  titleEn: string;
  summaryBg: string;
  dependsOn: string[];
  lawRefs: LawRef[];
  difficulty: 1 | 2 | 3;
}

/**
 * A named sub-group of a topic's concepts — a finer study chunk than the 16
 * topics, purely a PRESENTATION/navigation layer (docs/architecture/05). The
 * learning engine (mastery, SM-2, gating, readiness) keys on concepts, never
 * on sections. Every concept belongs to exactly one section; a section groups
 * concepts from a single parent topic (`topicId`).
 */
export interface Section {
  id: string; // "s-" prefix
  topicId: string; // parent topic; all conceptIds must belong to it
  titleBg: string;
  conceptIds: string[]; // >= 1, all within topicId, globally partition-exclusive
}

// ---------------------------------------------------------------------------
// Question media (THEO-1, doc 64) — DATA-DRIVEN kinds only: no binary assets,
// everything renders client-side from data this repo owns.
// ---------------------------------------------------------------------------

/**
 * The project's OWN sign artwork: `signRef` is an official sign CODE from
 * signs/signs.json (e.g. "В24") — validated to resolve at content load.
 */
export interface SignMediaRef {
  kind: "sign";
  signRef: string;
}

/** Viewport of a scene still: a square window `zoomM` meters wide centered
 *  on (x, y) in the district's world coordinates (x east, y north). */
export interface SceneStillFocus {
  x: number;
  y: number;
  zoomM: number;
}

export type SceneStillPoseKind = "car" | "truck" | "bus" | "tram" | "bike" | "ped";

/** One actor drawn on the still. headingDeg: 0 = north, clockwise (the sim
 *  trace convention). All positions must sit inside the focus window. */
export interface SceneStillPose {
  kind: SceneStillPoseKind;
  x: number;
  y: number;
  headingDeg: number;
  /** "ego" = the learner's own car (rendered highlighted). */
  variant?: "ego";
}

/**
 * Attention mark on a scene still:
 *  - danger  = conflict point (red ring),
 *  - target  = look-here / drive-here (green sweep arrow to the spot),
 *  - proceed = "you have priority — go" (green forward arrow ahead of the ego),
 *  - yield    = "you must give way here" (red give-way bar across the road ahead
 *               of the ego, perpendicular to its heading).
 * `proceed`/`yield` are oriented by the ego pose's heading; (x, y) is the on-road
 * anchor a couple metres ahead of the ego.
 */
export interface SceneStillMark {
  kind: "danger" | "target" | "proceed" | "yield";
  x: number;
  y: number;
}

/**
 * A static top-down scene rendered from a committed district map
 * (platform/public/world/<districtId>.json) — the mistake-replay drawing
 * machinery without animation. districtId is validated to exist at load.
 */
export interface SceneStillMedia {
  kind: "sceneStill";
  districtId: string;
  focus: SceneStillFocus;
  poses: SceneStillPose[];
  marks?: SceneStillMark[];
}

export type QuestionMedia =
  | { type: "image" | "video"; ref: string } // legacy placeholder shape (unused)
  | SignMediaRef
  | SceneStillMedia;

export interface QuestionOption {
  id: string;
  textBg: string; // for sign-face options this is the accessible label
  correct: boolean;
  /** Sign-identification questions: the option IS a sign face. */
  media?: SignMediaRef;
  /**
   * Requirement-zero at its deepest (doc 64 THEO-4): the rationale for THIS
   * option, not for the question. On a distractor it says why the option is
   * wrong; on a correct option of a "multi" it says why the option was
   * required — the case where a student picks 2 of 3 correct answers, scores
   * zero and, with only the question-level `explanationBg`, is never told
   * which one was missed.
   *
   * Optional: authoring lands progressively (3-point questions first), and
   * the why-panel falls back to `explanationBg` wherever it is absent.
   */
  whyWrongBg?: string;
}

export interface Question {
  id: string;
  conceptIds: string[];
  type: "single" | "multi";
  points: 1 | 2 | 3; // official weighting (docs/education/32)
  textBg: string;
  options: QuestionOption[];
  explanationBg: string;
  lawRefs: LawRef[];
  /**
   * Non-statutory grounding (clinical guideline, statistical methodology, …).
   * OPTIONAL and additive: every row that existed before this field validates
   * unchanged, and a re-serialisation never introduces the key. The rule the
   * schema now enforces is `lawRefs.length + sourceRefs.length >= 1` — cite
   * something, but only cite a statute when a statute is what settles it.
   */
  sourceRefs?: SourceRef[];
  media: QuestionMedia | null;
  status: ContentStatus;
}

export interface Sign {
  id: string; // "sign-" prefix
  code: string; // official code, e.g. "Б2"
  group: string; // А | Б | В | Г | Д | Е | Ж | Т (markings later)
  nameBg: string;
  meaningBg: string;
  svgFile: string;
  lawRefs: LawRef[];
  status: ContentStatus;
}
