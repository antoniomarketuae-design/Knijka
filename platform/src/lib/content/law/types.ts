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
 *                        10 = опасна грешка, and above 9 the exam is failed.
 *   2. контролни точки — licence points off a budget of 39 (26 for a new
 *                        driver), taken only for the offences exhaustively
 *                        listed in Наредба № Iз-2539 чл. 6, ал. 1.
 *   3. глоба            — money, in BGN.
 *
 * They are different units on different scales issued by different people, so
 * `PenaltyEntry` keeps them in separate fields that can never be added together
 * by accident.
 *
 * A FOURTH consequence sits alongside them and is not a number of anything:
 *
 *   4. лишаване от право да управлява — months without the licence.
 *
 * It has its own field because it is the pivot of the whole bank. ЗДвП чл. 186,
 * ал. 1 permits a ФИШ only "за административни нарушения, за които не е
 * предвидено наказание лишаване от право да управлява моторно превозно
 * средство", and чл. 189, ал. 4 says the same of an ЕЛЕКТРОНЕН ФИШ. So the ban
 * decides the instrument, and `instrument` is derived from `disqualification`
 * rather than chosen — see the coupling enforced in law/schemas.ts.
 *
 * WHAT THIS REPLACED, because it is the mistake most likely to come back.
 * Until ДВ, бр. 64 от 2025 г. a фиш could not be used for an offence that cost
 * контролни точки, so "does it take точки?" and "фиш or акт?" had the same
 * answer and people reasoned from either to the other. That amendment added
 * „за броя контролни точки, които се отнемат" to the data a фиш must carry
 * (чл. 186, ал. 1, в сила от 7.09.2025 г.) and struck the same restriction out
 * of чл. 189, ал. 4 (в сила от 7.05.2026 г.); Наредба № Iз-2539 чл. 2, ал. 6
 * (изм. ДВ, бр. 49 от 2026 г.) now names наказателно постановление, фиш AND
 * електронен фиш as bases for deduction. THE INSTRUMENT NO LONGER FOLLOWS FROM
 * THE POINTS. It follows from the ban, and from nothing else.
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
  /**
   * THE ACT'S OWN WORDS FOR *WHICH OFFENCE* THIS FIGURE IS THE PRICE OF, and
   * the field that closes the hole every other check here was blind to.
   *
   * Quoting the law verbatim proves the SENTENCE exists. It does not prove the
   * sentence is about the reader's offence — and that is where the bank went
   * wrong. Наредба № 38, приложение № 5, т. 10, б. „в" states „10 наказателни
   * точки" once, in a header, and then lists six different offences under it.
   * All six penalties with an examPoints figure carried the header plus the
   * FIRST indent, so five of them priced speeding, a missed Б2 and a missed
   * pedestrian crossing with the sentence about a traffic light. Both existing
   * checks passed: the quote was in the act, and it did contain „10".
   *
   * So a grounded figure now also states the offence, and `verifyCitations`
   * requires that phrase to occur BOTH in the cited unit (so it is the act's
   * wording, not ours) AND inside the quotes the student is actually shown (so
   * the quotes cannot be about something else). Required on every grounded
   * figure; meaningless, and therefore optional, on "not-listed" — where the
   * whole point is that the offence is ABSENT from the cited list.
   */
  offencePhraseBg?: string;
}

/**
 * WHAT THE ROW IS PRICING — declared once, per row, OUTSIDE every citation.
 *
 * `PenaltyCitation.offencePhraseBg` closed one hole and left the bigger one
 * open, and the reason is worth stating exactly, because it is the shape of
 * almost every check that looks stronger than it is: THE PHRASE WAS VERIFIED
 * AGAINST THE CITATION'S OWN QUOTES. „Is this sentence about the offence this
 * citation claims to be about?" is a question a citation can always answer yes
 * to — write the traffic-light indent into `contextQuoteBg`, write the same
 * words into `offencePhraseBg`, and the citation is internally perfect while
 * pricing conduct the row has nothing to do with. Measured, not argued: giving
 * pen-speeding-urban-21-30 the светофар case that way returned zero problems.
 *
 * Nothing inside the citation can close that, because the attacker writes the
 * whole citation. The comparison has to be against something the citation does
 * not own — so the ROW declares its conduct, and every figure's offence phrase
 * is checked against THAT.
 *
 * TWO HALVES, both load-bearing:
 *
 *  - `statementBg` is for the human reviewing the bank. It is the sentence that
 *    makes „these anchors are honest" a judgement someone can actually make.
 *  - `anchorsBg` is the machine's half. Groups are AND-ed, alternatives inside
 *    a group OR-ed, because ONE conduct is written three ways by three acts:
 *    ЗДвП says „за превишаване от 21 до 30 km/h", Наредба № Iз-2539 says „за
 *    неосигуряване на предимство при преминаване през пешеходна пътека", and
 *    Наредба № 38 says „когато изпитваният превиши…". The intersection of an
 *    offence's three wordings is a set of alternatives, not one string.
 *
 * The declaration is not free prose either — `verifyCitations` requires every
 * group to be findable in the act the row's own `lawRefs` name, requires the
 * statement to satisfy its own anchors, and refuses an alternative that none of
 * the row's phrases needs. A widened anchor is how this check would rot, so
 * widening one is what the loader refuses.
 */
export interface PenaltyConduct {
  /** One sentence naming the conduct, in our words. Must satisfy `anchorsBg`. */
  statementBg: string;
  /**
   * AND-of-OR, in the ACTS' words. `[["превишаване","превиши"],["от 21 до 30"]]`
   * reads: every offence phrase on this row must say превишаване-or-превиши AND
   * must say от 21 до 30. Matched case-insensitively over `normaliseForMatch`
   * text — the verbatim checks stay case-sensitive, this one is a test of what
   * a sentence is ABOUT.
   */
  anchorsBg: string[][];
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

/**
 * The instrument the money arrives on. Three, not two — and the difference is
 * not cosmetic. A ФИШ is written by an officer who is standing there (ЗДвП
 * чл. 186, ал. 1; 80 % if paid within 7 days, ал. 7). An ЕЛЕКТРОНЕН ФИШ is
 * issued from a camera record with no officer and no driver present (чл. 189,
 * ал. 4; 70 % within 14 days, ал. 5г) and lands on the vehicle's owner. An АКТ
 * (АУАН) starts the long road to a наказателно постановление, and it is the
 * only one of the three that can carry лишаване от право.
 */
export type FineInstrument = "фиш" | "електронен фиш" | "акт";

/** Money. */
export interface FinePenalty {
  system: "fine";
  status: FigureStatus;
  /** BGN; null when status is "unknown". */
  amountBgn: number | null;
  /**
   * DERIVED from `PenaltyEntry.disqualification`, never chosen — schemas.ts
   * refuses any other combination:
   *
   *   ban "grounded"    → "акт" (чл. 186, ал. 1 and чл. 189, ал. 4 both bar a
   *                       фиш where лишаване is provided)
   *   ban "not-listed"  → "фиш" or "електронен фиш"
   *   ban "unknown"     → null — we have not read the provision, so we make no
   *                       claim, exactly as with an ungrounded number
   */
  instrument: FineInstrument | null;
  /** The rule that permits that instrument (ЗДвП чл. 186 / чл. 189). Null iff `instrument` is null. */
  instrumentSource: PenaltyCitation | null;
  source: PenaltyCitation;
  noteBg: string | null;
}

/**
 * Licence points, off a budget of 39 (26 for a new driver). Since ДВ, бр. 49 от
 * 2026 г. they are deducted on any of three instruments that has entered into
 * force — наказателно постановление, фиш or електронен фиш (Наредба № Iз-2539
 * чл. 2, ал. 6) — so this figure says NOTHING about which one arrives. The
 * offence decides the points; the ban decides the instrument.
 */
export interface ControlPointsPenalty {
  system: "controlPoints";
  status: FigureStatus;
  points: number | null;
  source: PenaltyCitation;
  noteBg: string | null;
}

/**
 * Months without the licence. Not a point system and not money — the reason it
 * is here is that it is the ONLY thing that decides `FinePenalty.instrument`.
 *
 * "not-listed" is the load-bearing status: it means we read the sanction
 * provision, it states its penalty exhaustively, and лишаване is not in it —
 * which is what makes a фиш lawful. It is proof of an absence, not a missing
 * value, so `months` is 0 and the citation is the provision that would have
 * carried the ban.
 */
export interface DisqualificationPenalty {
  system: "disqualification";
  status: FigureStatus;
  /** 0 when "not-listed", null when "unknown". */
  months: number | null;
  /**
   * The duration EXACTLY as the act writes it — „6 месеца", „два месеца",
   * „три години". Verified at load to occur inside `source.quoteBg`, because
   * Bulgarian statutes mix digits and words and a rendered number would be our
   * wording rather than the law's. Null unless "grounded".
   */
  durationBg: string | null;
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
  /**
   * The conduct all four figures below are the price of — the row's own answer
   * to „what is this?", against which each citation is checked. See
   * `PenaltyConduct`: without it, a citation could only be checked against
   * itself.
   */
  conduct: PenaltyConduct;
  fine: FinePenalty;
  controlPoints: ControlPointsPenalty;
  /** Months without the licence — and the fact that fixes `fine.instrument`. */
  disqualification: DisqualificationPenalty;
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
