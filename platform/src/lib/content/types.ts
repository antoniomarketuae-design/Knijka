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

export interface QuestionOption {
  id: string;
  textBg: string;
  correct: boolean;
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
  media: { type: "image" | "video"; ref: string } | null;
  status: ContentStatus;
}

export interface Sign {
  id: string; // "sign-" prefix
  code: string; // official code, e.g. "Б2"
  group: string; // А | Б | В | Г | Д | Е (Ж, Т later)
  nameBg: string;
  meaningBg: string;
  svgFile: string;
  lawRefs: LawRef[];
  status: ContentStatus;
}
