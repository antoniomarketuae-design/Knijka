/**
 * The law source layer (ADR-002).
 *
 * The AI must NEVER free-recall Bulgarian law. Everything a student is shown —
 * an article, a fine, a number of points — is RETRIEVED from the corpus stored
 * under content/law and cited back to the document it came from.
 *
 * That corpus exists because ONE number was doing the work of THREE systems:
 *
 *   1. изпитни точки   — the practical-exam marking scheme (Наредба № 38,
 *                        приложение № 5). What the examiner writes down.
 *   2. контролни точки — licence points, taken only by a наказателно
 *                        постановление that has entered into force
 *                        (ЗДвП чл. 157 + Наредба № Iз-2539).
 *   3. глоба            — money. A ФИШ is issued on the spot; an АКТ leads to a
 *                        наказателно постановление, which is the only
 *                        instrument that can also take контролни точки.
 *
 * They are different units on different scales issued by different people, so
 * `PenaltyEntry` keeps them in three separate fields that can never be added
 * together by accident.
 */

import type { ContentStatus, LawRef } from "../types";

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Whether we hold the document's text, or only know where it lives. */
export type SourceCoverage = "full-text" | "index-only";

/** One fetched (or catalogued) legal document. */
export interface LawSource {
  id: string; // "src-" prefix
  /** Set when this source produced an act in content/law/acts. */
  actId: string | null;
  titleBg: string;
  kind: string; // zakon | naredba | pravilnik | strategia | …
  publisherBg: string;
  url: string;
  format: string; // docx | pdf | doc
  /** Bytes / sha256 of the exact file fetched — null for index-only entries. */
  bytes: number | null;
  sha256: string | null;
  /** e.g. "консолидиран текст, изм. ДВ, бр. 55 от 16.06.2026 г." */
  versionBg: string | null;
  coverage: SourceCoverage;
  /** How the text was lifted out of the file (null for index-only). */
  extraction: string | null;
  /** HTTP status observed when the register was built. 200 = the link is live. */
  httpStatus: number;
}

export interface LawSourceRegister {
  version: number;
  /** ISO date the register was built and every URL re-checked. */
  retrievedAt: string;
  registerUrl: string;
  sources: LawSource[];
}

// ---------------------------------------------------------------------------
// Acts and their addressable units
// ---------------------------------------------------------------------------

/**
 * One citable unit — an article ("чл. 183"), a ДР paragraph ("§ 6") or an annex
 * ("приложение № 5"); the `ref` says which. `textBg` is VERBATIM: the exact
 * text extracted from the stored document, including its amendment notes.
 * Nothing here is paraphrased.
 */
export interface LawUnit {
  ref: string; // canonical, lowercase: "чл. 183", "чл. 167а1", "§ 6", "приложение № 5"
  /** Article number; null for annexes. */
  number: number | null;
  suffixBg: string | null; // "а" in "чл. 183а"
  /** "Глава седма · АДМИНИСТРАТИВНОНАКАЗАТЕЛНА ОТГОВОРНОСТ · Раздел I" */
  contextBg: string | null;
  textBg: string;
}

export interface LawAct {
  actId: string;
  abbrBg: string; // "ЗДвП"
  titleBg: string;
  promulgationBg: string;
  /** The amendment this text is consolidated through, when the file states it. */
  consolidatedThroughBg: string | null;
  sourceId: string;
  units: LawUnit[];
}

// ---------------------------------------------------------------------------
// Penalties — three systems, kept apart
// ---------------------------------------------------------------------------

/**
 * A pointer INTO the corpus plus the verbatim words the figure rests on.
 * Required on every figure: no citation, no figure.
 */
export interface PenaltyCitation {
  actId: string;
  ref: string; // "чл. 183"
  paragraphRef?: string; // "ал. 4"
  pointRef?: string; // "т. 14", 'т. 1, б. "а"'
  /**
   * Verbatim excerpt that STATES THE FIGURE — verified at load to occur in the
   * cited unit, and (for a grounded numeric figure) to contain the number
   * itself. A quote that does not contain the number does not ground it.
   */
  quoteBg: string;
  /**
   * Second verbatim excerpt from the SAME unit, naming the offence. Bulgarian
   * penalty articles put the amount in the alinea's opening sentence and the
   * behaviour in a numbered point below it, so grounding the figure and naming
   * the offence usually needs two non-contiguous quotes. Also verified.
   */
  contextQuoteBg?: string;
}

/**
 * How well the number is grounded. The founder's ruling lives here:
 *
 *  - "grounded"   — the figure is written in the cited text. Show it.
 *  - "not-listed" — the offence is deliberately absent from an exhaustive list
 *                   (e.g. чл. 6 от Наредба № Iз-2539), so the figure is 0 and
 *                   the citation is the LIST. Show the 0 and say why.
 *  - "unknown"    — we do not have it. The value is null and the UI shows the
 *                   rule and the article WITH NO NUMBER. Never a guess.
 */
export type FigureStatus = "grounded" | "not-listed" | "unknown";

/** The instrument the money arrives on. */
export type FineInstrument = "фиш" | "акт";

/** Money. */
export interface FinePenalty {
  system: "fine";
  status: FigureStatus;
  /** BGN; null when status is "unknown". */
  amountBgn: number | null;
  instrument: FineInstrument;
  /** The rule that decides фиш vs акт (ЗДвП чл. 186 / чл. 189). */
  instrumentSource: PenaltyCitation;
  source: PenaltyCitation;
  noteBg: string | null;
}

/** Licence points — taken by наказателно постановление, never by a фиш alone. */
export interface ControlPointsPenalty {
  system: "controlPoints";
  status: FigureStatus;
  points: number | null;
  source: PenaltyCitation;
  noteBg: string | null;
}

/** Examiner marking — a different scale entirely (Наредба № 38, прил. № 5). */
export interface ExamPointsPenalty {
  system: "examPoints";
  status: FigureStatus;
  points: number | null;
  /** "основна" | "второстепенна" | "опасна" — null when unknown. */
  errorClassBg: string | null;
  source: PenaltyCitation;
  noteBg: string | null;
}

export interface PenaltyEntry {
  id: string; // "pen-" prefix
  titleBg: string;
  summaryBg: string;
  fine: FinePenalty;
  controlPoints: ControlPointsPenalty;
  /** null when the behaviour is not an exam error at all (e.g. drink-driving). */
  examPoints: ExamPointsPenalty | null;
  lawRefs: LawRef[];
  status: ContentStatus;
}

export interface PenaltyBank {
  version: number;
  penalties: PenaltyEntry[];
}

// ---------------------------------------------------------------------------
// Retrieval results
// ---------------------------------------------------------------------------

export type LawLookupFailure =
  | "act-not-in-corpus" // we have no full text for that act
  | "unit-not-found"; // the act is loaded but has no such article

/** What a retrieval call returns. Never throws for a miss — it says why. */
export type LawLookup =
  | {
      found: true;
      act: LawAct;
      unit: LawUnit;
      /** "ЗДвП, чл. 183 (консолидиран текст, изм. ДВ, бр. 55 от 16.06.2026 г.)" */
      citationBg: string;
      source: LawSource | undefined;
    }
  | { found: false; reason: LawLookupFailure; queriedActId: string | null; queriedRef: string };
