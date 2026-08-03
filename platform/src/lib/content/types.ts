/**
 * Typed mirror of content/SCHEMA.md — the contract between the content
 * files (JSON in /content) and platform code. Keep in lockstep with SCHEMA.md.
 */

export type ContentStatus = "draft" | "needs-review" | "approved";

export interface LawRef {
  act: string; // e.g. "ЗДвП", "Наредба РД-02-21-1/2023"
  ref: string; // e.g. "чл. 47" ("?" suffix = unverified)
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
