/**
 * Typed contract of the NON-STATUTORY source registers
 * (content/medical/, content/sources/ — see their READMEs).
 *
 * A statute and a guideline are not the same kind of object, and pretending
 * they are is what produced the decorative citation this module exists to
 * retire. The differences that forced a separate shape:
 *
 *   LawAct assumes            a register source gives
 *   ─────────────────────     ────────────────────────────────────────────
 *   units addressed „чл. N"   topic sections and bullets, with no numbering
 *   authority = in force      authority = current EDITION (ERC 2025 > 2021)
 *   one internally            several bodies that can and do DISAGREE about
 *     consistent text           the same claim — hence `conflicts[]`
 *   stable bytes              HTML pages carrying per-request tokens, hence
 *                               both rawSha256 and textSha256
 */

/** Where a source sits in the hierarchy of what may be cited. Deliberately an
 *  open string: the registers are built by independent tools and a closed
 *  union here would be a lockstep trap. Known values today —
 *  `binding-bg` (a Bulgarian normative act), `official-methodology`,
 *  `current-consensus`, `national-adaptation`, `superseded`,
 *  `not-a-grounding-source`. */
export type SourceAuthority = string;

export interface RegisteredSource {
  id: string; // "src-…", globally unique across every register
  kind: string; // "clinical-guideline" | "bg-statistics" | …
  authority: SourceAuthority;
  /** Null when the source has no Bulgarian title (ERC/RCUK carry `titleEn`). */
  titleBg: string | null;
  titleEn: string | null;
  publisherBg: string;
  editionBg: string;
  url: string;
  format: string;
  httpStatus: number;
  rawBytes: number;
  rawSha256: string;
  /** OBSERVED on a second fetch, never assumed. lex.bg and some CDN pages
   *  return the same byte count with a different hash (per-request tokens),
   *  which is why textSha256 exists and is what the gates use. */
  rawHashStable: boolean;
  textBytes: number;
  textSha256: string;
  extraction: string;
  coversBg: string;
  supersedesId: string | null;
  noteBg: string | null;
  /** Which register file this row came from — filled in by the loader. */
  register: string;
}

/** One quote, cut from a fetched source by a locator that throws on a miss. */
export interface SourceQuote {
  /**
   * Usually a register id (`src-…`). May also be `law:<actId>` — a claim is
   * allowed to be grounded in the STATUTE corpus (`med-legal-duty` quotes ЗДвП
   * чл. 123 that way), and forcing statutes to be re-registered here would mean
   * two copies of the same text with two ways to drift apart.
   */
  sourceId: string;
  quoteBg: string;
  /** Line in the extracted text, or null when the quote came from the law
   *  corpus, which is addressed by article rather than by line. */
  lineNo: number | null;
}

/**
 * A recorded disagreement between sources.
 *
 * Either a plain sentence, or — better, and what the medical register emits —
 * the OTHER source's verbatim words plus what the disagreement actually is. A
 * reviewer choosing between ERC 2025 and what БЧК teaches needs to read both,
 * not a summary of both.
 */
export type SourceConflict =
  | string
  | {
      sourceId: string;
      quoteBg: string;
      lineNo: number | null;
      natureBg: string;
    };

/** One line of prose for a conflict, whichever shape it arrived in. */
export function describeConflict(conflict: SourceConflict): string {
  if (typeof conflict === "string") return conflict;
  return `${conflict.natureBg} — „${conflict.quoteBg}“`;
}

/**
 * A claim the content rests on, with its grounding and — the part a statute
 * never needs — the places its sources contradict each other.
 */
export interface SourceClaim {
  id: string;
  topicBg: string;
  conceptIds: string[];
  questionIds: string[];
  figureBg: string | null;
  /**
   * The sentence that actually STATES the figure — which is often not the
   * sentence that states the rule. The medical builder found two claims where
   * the number lived a paragraph away from its headline recommendation, so the
   * gate ("a figure must appear in its own quote") runs against this field, not
   * against `authoritative`. Null when the claim carries no figure.
   */
  figureQuote: SourceQuote | null;
  /**
   * NULL is a real, load-bearing answer here, and the reason this is not a
   * statute shape: two medical claims (`med-extrication-technique`,
   * `med-helmet-removal`) have NO reachable source at all. Recording that
   * honestly — rather than attaching the nearest plausible quote — is the whole
   * point. Read `statusBg` (`ungrounded-*`) alongside it.
   */
  authoritative: SourceQuote | null;
  corroborating: SourceQuote[];
  /** Recorded, never silently resolved. A student is owed the disagreement. */
  conflicts: SourceConflict[];
  statusBg: string;
  noteBg: string | null;
  register: string;
}

export type SourceLookupFailure =
  | "source-not-in-registers" // no register carries that id
  | "claim-not-found"; // the source is loaded, but it has no such claim

/** What a retrieval call returns. Never throws for a miss — it says why. */
export type SourceLookup =
  | {
      found: true;
      source: RegisteredSource;
      /** Present only when the ref named a `claimId` that resolved. */
      claim: SourceClaim | null;
      /** "НСИ, Методологични бележки (издание 2024 г., данни за 2023 г.)" */
      citationBg: string;
    }
  | {
      found: false;
      reason: SourceLookupFailure;
      queriedSourceId: string;
      queriedClaimId: string | null;
    };
