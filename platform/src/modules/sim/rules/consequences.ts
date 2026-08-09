/**
 * THE THREE POINT-LIKE SYSTEMS, KEPT APART — and the road consequence the
 * simulator has never told anyone about.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS
 * ===========================================================================
 * The founder drove a lesson, went more than 10 km/h over, and the result
 * screen said „−10 т." with a chip reading „ЗДвП чл. 21". He read it as his
 * LICENCE being docked — and he built the thing. In Bulgarian, unqualified
 * „точки" means КОНТРОЛНИ точки: the 39-point licence budget. Every student
 * will make the same reading.
 *
 * The product has three systems that all count in „точки" or in money, and the
 * result screen named none of them:
 *
 *   1. НАКАЗАТЕЛНИ (ИЗПИТНИ) ТОЧКИ — Наредба № 38, приложение № 5, т. 10.
 *      10 / 3 / 1 per fault, fail above 9. THIS LESSON, this sheet, nothing
 *      else. Erased the moment the lesson ends.
 *   2. КОНТРОЛНИ ТОЧКИ — Наредба № Iз-2539. The licence: 39 max, 26 at first
 *      issue. Taken only by a penalty that has entered into force on the road,
 *      and only for the offences чл. 6, ал. 1 exhaustively lists.
 *   3. ГЛОБА — money, in EUR. Arrives on a фиш, an електронен фиш, or an АУАН
 *      that becomes a наказателно постановление.
 *
 * (A fourth counter exists elsewhere and is deliberately NOT modelled here: the
 * points of the THEORY exam. It never appears on a driving fault card.)
 *
 * The marking itself was never wrong. 10 наказателни точки for exceeding the
 * limit by more than 10 km/h is exactly what приложение № 5, т. 10, б. „в"
 * prescribes. THE LABEL was the defect, and the missing half — what happens on
 * the street — is the half that changes behaviour after the test is passed.
 * THEO-4: a virtual instructor says BOTH.
 *
 * ===========================================================================
 * ADR-002 — HOW EVERY NUMBER IN THIS FILE IS GROUNDED
 * ===========================================================================
 * Nothing here is recalled. Every figure carries a `LawQuote` naming the act
 * FILE under `content/law/acts`, the unit inside it, and the VERBATIM sentence
 * that states the figure. `__tests__/consequences.test.ts` re-cuts every single
 * quote out of those files on every run and fails on a single changed word —
 * the same discipline `n38.ts` is held to.
 *
 * AND WHERE WE DO NOT KNOW, WE SAY SO. `roadConsequenceFor` resolves in three
 * tiers, most specific first: a structured entry here → the catalogue's own
 * authored sentence (`ViolationSpec.realWorldBg`, written by a parallel lane
 * during this same wave) → `{ kind: "unknown" }`, the rule and the article with
 * NO NUMBER. The blank is the DEFAULT rather than the exception:
 * `ROAD_CONSEQUENCES` is a PARTIAL map, so a violation code added tomorrow
 * inherits it instead of somebody's guess. Two shipped defects (an invented
 * „50 метра" for railway crossings, an e-scooter age tier чл. 80а, ал. 3
 * contradicts) are what that default is protecting against.
 *
 * ===========================================================================
 * WHY SPEEDING IS A LADDER AND NOT ONE NUMBER
 * ===========================================================================
 * `SPEEDING_DANGEROUS` fires at „more than 10 km/h over" — one exam fault, but
 * FIVE different road penalties depending on how far over, and different ones
 * again outside a populated area (чл. 182, ал. 2) and for public transport /
 * dangerous goods (ал. 3). The rule engine does not know whether the lesson is
 * in a населено място, so picking one row would be an inference, not a
 * retrieval. The card therefore shows the LAW'S OWN LADDER for населено място,
 * labelled as such, and points at the other two alineas by name. That is what
 * an instructor does: he shows you the table and lets you find your row.
 *
 * A structural caveat worth keeping, because it looks like a gap and is not:
 * ал. 1 has NO explicit 41–50 band — т. 5 reads „над 40" and т. 6 „над 50", so
 * 41–50 in town sits in т. 5. The rows below are the act's own wording; do not
 * invent the missing row.
 *
 * ===========================================================================
 * THE INSTRUMENT NO LONGER DECIDES WHETHER POINTS FALL — THE OFFENCE DOES
 * ===========================================================================
 * Every Bulgarian driving-school textbook still teaches that a фиш cannot take
 * контролни точки. ДВ, бр. 64 от 2025 г. deleted „или отнемане на контролни
 * точки" from чл. 186, ал. 1 (in force 7.09.2025) and from чл. 189, ал. 4 (in
 * force 7.05.2026), and чл. 186, ал. 1 now REQUIRES the фиш to state „за броя
 * контролни точки, които се отнемат". What the instrument still decides is
 * whether a ban is possible: both чл. 186, ал. 1 and чл. 189, ал. 4 are open
 * only to offences for which лишаване от право is NOT provided. So a tier that
 * carries a ban can arrive only as АУАН → наказателно постановление —
 * `instrumentsForBan` is that one rule, written once.
 */

import { N38_BASIS, N38_OPASNA_CASES, N38_OPASNA_HEADER, N38_OSNOVNA_DEF, N38_PASS_RULE, N38_VTOROSTEPENNA_DEF, type N38OpasnaCase } from "./n38";
import { VIOLATIONS } from "./catalog";
import type { SeverityClass, ViolationCode, ViolationPoints } from "./types";

// ---------------------------------------------------------------------------
// Money: the country is in the eurozone, the statutes still say лв.
// ---------------------------------------------------------------------------

/**
 * THE RATE AND THE FORMATTERS NOW LIVE IN `lib/content/money`, and are
 * re-exported here so every existing import keeps working.
 *
 * Why they moved: this file rendered EUR for its five structured codes while
 * the forty AUTHORED road sentences in `catalog.ts` rendered лв., and the law
 * layer's own `describeFine` rendered лв. too — so a student with two faults on
 * one screen was quoted two currencies for the same kind of thing. One rate,
 * one formatter, one policy, imported by both sides. `withEurBg` is the piece
 * that was missing: it puts the euro beside a лв. figure inside authored prose
 * without touching anything inside „…“, because those are the act's own words
 * and rewriting them would turn a quotation into a paraphrase.
 *
 * Corroborated by the founder's own електронен фиш: 100 лв. под чл. 182, ал. 1,
 * т. 3 was billed at exactly 51,13 EUR.
 */
export { BGN_PER_EUR, bgnWithEurBg, eurCentsFromBgn, formatEur, withEurBg } from "@/lib/content/money";
// `export … from` re-exports without creating local bindings, and this file
// does its own arithmetic (`fine`, the т. 6 escalator), so it imports them too.
import { eurCentsFromBgn, formatEur } from "@/lib/content/money";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * How well a figure is grounded — same three-way ruling the law layer uses
 * (`lib/content/law/types.ts`), restated here because `modules/sim` is client
 * code and that module is server-only (node:fs).
 *
 *  - "grounded"   — the number is written in the cited sentence. Show it.
 *  - "not-listed" — the offence is deliberately ABSENT from an exhaustive list,
 *                   so the figure is 0 and the citation is the list itself.
 *                   Show the 0 and say why it is a 0.
 *  - "unknown"    — we do not hold it. No number, ever. Show the rule.
 */
export type FigureStatus = "grounded" | "not-listed" | "unknown";

/** The paper the penalty arrives on. */
export type EnforcementInstrument = "фиш" | "електронен фиш" | "акт";

/** A pointer into `content/law/acts` plus the words the figure rests on. */
export interface LawQuote {
  /** File under content/law/acts — the test re-cuts `quoteBg` out of it. */
  actFile: string;
  /** The unit inside that file, as content/law addresses it („чл. 182"). */
  unitRef: string;
  /** How the citation is written for a student. */
  citationBg: string;
  /** VERBATIM. Whitespace-normalised only. */
  quoteBg: string;
}

export interface ControlPointsFigure {
  status: FigureStatus;
  /** null when status is "unknown" — the UI must render no digit at all. */
  points: number | null;
  source: LawQuote;
  noteBg: string;
}

export interface FineFigure {
  /** Always grounded here: an ungrounded fine is expressed as kind "unknown". */
  amountBgn: number;
  eurCents: number;
  /** The лишаване fragment of the same sentence, verbatim — or null. */
  banBg: string | null;
  instruments: readonly EnforcementInstrument[];
  source: LawQuote;
}

export interface LadderTier {
  /** The band as the act words it: „от 21 до 30 km/h". */
  bandBg: string;
  /** The rung's own address: „ЗДвП чл. 182, ал. 1, т. 3". */
  pointRefBg: string;
  /**
   * The band as a NUMBER, so a measured speed can find its own row instead of
   * the student being handed the table. Inclusive; `maxOverKmh: null` is the
   * open top rung.
   *
   * WHERE THESE BOUNDS COME FROM, since two of them are not written anywhere.
   * Four of the six rungs state their own range („от 21 до 30 km/h"). Two do
   * not: ал. 1, т. 5 reads „над 40" and т. 6 „над 50", with no 41–50 row
   * between them, so т. 5 is read as 41–50 and т. 6 as 51 upwards — the only
   * reading on which the two points neither overlap nor leave a hole, and the
   * one the file has documented since it was written. `__tests__/
   * speed-band.test.ts` walks every whole km/h from 1 to 200 through all three
   * alineas and fails on the first gap or double-hit.
   */
  minOverKmh: number;
  maxOverKmh: number | null;
  fine: FineFigure;
  controlPoints: ControlPointsFigure;
}

/**
 * What the street does about it — kept in a shape that CANNOT be added to the
 * exam mark: different units, different issuer, different day.
 */
export type RoadConsequence =
  | {
      kind: "single";
      /** One line naming the offence as the penalty article frames it. */
      offenceBg: string;
      fine: FineFigure;
      controlPoints: ControlPointsFigure;
    }
  | {
      kind: "ladder";
      offenceBg: string;
      /** Which alinea's ladder this is — the label carries the condition. */
      scopeBg: string;
      tiers: readonly LadderTier[];
      /**
       * Which rungs THIS detector's threshold can actually reach. Not law — a
       * statement about the rule engine — so it is worded as one and kept out
       * of the quoted rows. Without it the card shows a 20 лв. rung under a
       * fault whose own definition is „more than 10 km/h over", which teaches
       * the student the wrong floor.
       */
      appliesBg: string;
      /** The other ladders, named so the student knows this one is not all. */
      footnoteBg: string;
    }
  | {
      /**
       * The catalogue's own authored road sentence (`ViolationSpec.realWorldBg`
       * + `realWorldRefs`). A PARALLEL LANE wrote those on 2026-08-09 while this
       * file was being written — same wave, same brief, two shapes. Rather than
       * ship two competing answers, the structured entries below win where they
       * exist and the authored prose fills in behind them, so nothing a student
       * could have been told is thrown away. `__tests__/consequences.test.ts`
       * holds that prose to the same standard as everything else: every „N лв."
       * and every „N контролни точки" in it must occur in an act named by its
       * own `realWorldRefs`.
       */
      kind: "authored";
      textBg: string;
      refsBg: readonly string[];
    }
  | {
      kind: "unknown";
      /** The rule and the article, WITH NO NUMBER. */
      ruleBg: string;
    };

// ---------------------------------------------------------------------------
// The instrument rule — one place, quoted
// ---------------------------------------------------------------------------

export const INSTRUMENT_RULE_FISH: LawQuote = {
  actFile: "zdvp.json",
  unitRef: "чл. 186",
  citationBg: "ЗДвП чл. 186, ал. 1",
  quoteBg:
    "За административни нарушения, за които не е предвидено наказание лишаване от право да управлява моторно превозно средство, може да бъде наложена с фиш глоба в размера, посочен в административнонаказателната разпоредба за съответното нарушение.",
};

export const INSTRUMENT_RULE_EFISH: LawQuote = {
  actFile: "zdvp.json",
  unitRef: "чл. 189",
  citationBg: "ЗДвП чл. 189, ал. 4",
  quoteBg:
    "За нарушение, установено и заснето с автоматизирано техническо средство или система, за което не е предвидено наказание лишаване от право да се управлява моторно превозно средство",
};

/**
 * ДВ, бр. 64 от 2025 г. — the amendment every textbook is behind on. Quoted so
 * the card can teach the REASON rather than the rule: a фиш now states the
 * контролни точки it takes.
 */
export const INSTRUMENT_RULE_FISH_CARRIES_POINTS: LawQuote = {
  actFile: "zdvp.json",
  unitRef: "чл. 186",
  citationBg: "ЗДвП чл. 186, ал. 1",
  quoteBg: "за броя контролни точки, които се отнемат",
};

/** The фиш early-payment rule — 80 % within 7 days. */
export const FISH_DISCOUNT: LawQuote = {
  actFile: "zdvp.json",
  unitRef: "чл. 186",
  citationBg: "ЗДвП чл. 186, ал. 7",
  quoteBg: "В 7-дневен срок от налагането на глобата с фиш нарушителят може да заплати 80 на сто от размера й.",
};

/** The електронен фиш early-payment rule — 70 % within 14 days. */
export const EFISH_DISCOUNT: LawQuote = {
  actFile: "zdvp.json",
  unitRef: "чл. 189",
  citationBg: "ЗДвП чл. 189, ал. 5г",
  quoteBg:
    "В 14-дневен срок от получаването на електронния фиш собственикът, а когато има вписан в свидетелството за регистрация ползвател на моторното превозно средство - ползвателят, може да заплати 70 на сто от размера на глобата, съответно имуществената санкция.",
};

/**
 * THE ONE DERIVATION in this file, and it is a derivation from quoted text
 * rather than from memory: both чл. 186, ал. 1 (фиш) and чл. 189, ал. 4
 * (електронен фиш) are open only where лишаване от право is NOT provided. So a
 * tier whose own sentence carries a ban is foreclosed to both and can arrive
 * only as an АУАН that becomes a наказателно постановление.
 */
export function instrumentsForBan(banBg: string | null): readonly EnforcementInstrument[] {
  return banBg === null ? (["фиш", "електронен фиш"] as const) : (["акт"] as const);
}

/** Student-facing wording for a set of instruments. */
export function instrumentLabelBg(instruments: readonly EnforcementInstrument[]): string {
  if (instruments.includes("акт")) {
    return "АУАН → наказателно постановление (фиш и електронен фиш са изключени, защото е предвидено лишаване от право)";
  }
  if (instruments.includes("електронен фиш")) {
    return "фиш от контролен орган, а ако е заснето с камера — електронен фиш";
  }
  return "фиш от контролен орган";
}

// ---------------------------------------------------------------------------
// System 2, the licence — the thing „точки" means to a Bulgarian
// ---------------------------------------------------------------------------

/**
 * THE EDITION EVERY НАРЕДБА № Iз-2539 QUOTE BELOW IS CUT FROM.
 *
 * The corpus holds the наредба twice — a photograph taken 28.01.2025 and the
 * text consolidated through ДВ, бр. 49 от 29.05.2026 г. Everything on this card
 * now cites the CONSOLIDATION, and says so in the chip, for two separate
 * reasons.
 *
 * THE FIRST IS THAT THE SNAPSHOT IS NOT THE LAW. It predates изм. ДВ, бр. 22 от
 * 24.02.2026 г. and изм. ДВ, бр. 49 от 29.05.2026 г. One quote below — т. 12,
 * the 18 к.т. speeding rung — exists ONLY in the consolidation, and that is the
 * defect this started from. The other five were measured in both files and are
 * verbatim in both, at the same ал. and the same т.; they moved anyway, because
 * „the words happen not to have changed" is not a reason to send a student to a
 * repealed edition, and it stops being true the day the next ЗИД lands.
 *
 * THE SECOND IS THAT THE SNAPSHOT IS DAMAGED. Its чл. 6, т. 3 is a sentence
 * broken in half („…откаже да му" ⟨footer⟩ „бъде извършена проверка…") by
 * „Източник: Правно-информационни системи „Сиела" / 24/01/2025 г." — a PDF page
 * footer the extraction swallowed — and that footer sits inside 16 of its 40
 * units, presented as statute text. Its чл. 2, ал. 6 is still the repealed
 * restoration rule. So the citation behind „0 контролни точки" was pointing at
 * a copy of the exhaustive list with a vendor watermark in the middle of it.
 * The FINDING is unchanged under the consolidation; the evidence link was the
 * broken part, and a claim is only as checkable as the copy it points at.
 *
 * A bare „Наредба № Iз-2539" now resolves to the consolidation
 * (`lib/content/law/corpus.ts ACT_ALIASES`) and the snapshot is reachable only
 * from a citation that names 2025 — but the chips below still spell the
 * edition out, because the student reads the chip, not the alias table.
 */
const IZ2539 = "naredba-iz-2539-consolidated-dv49-2026.json";
const IZ2539_BG = "Наредба № Iз-2539 (изм. ДВ, бр. 49 от 2026 г.)";

/**
 * The licence budget, so the card can say what the exam mark is NOT. Both
 * figures are cut from the наредба, not from folklore.
 */
export const CONTROL_POINTS_BUDGET = {
  maxPoints: 39,
  newDriverPoints: 26,
  max: {
    actFile: IZ2539,
    unitRef: "чл. 2",
    citationBg: `${IZ2539_BG}, чл. 2, ал. 1`,
    quoteBg:
      "Максималният размер на контролните точки за отчет на извършваните нарушения на Закона за движението по пътищата (ЗДвП) е 39.",
  } satisfies LawQuote,
  newDriver: {
    actFile: IZ2539,
    unitRef: "чл. 2",
    citationBg: `${IZ2539_BG}, чл. 2, ал. 2`,
    quoteBg:
      "При първоначално издаване на свидетелство за управление на моторно превозно средство притежателят му получава 26 контролни точки за отчет на извършваните от него нарушения на ЗДвП.",
  } satisfies LawQuote,
} as const;

/**
 * The exhaustive list — the citation behind every „0 (не е в списъка)".
 *
 * THE MOST-READ CITATION ON THE CARD, and the one that was pointing at the
 * damaged copy. Proving a NEGATIVE („this offence is not in the list") is the
 * only kind of claim that depends on the completeness of the document it cites,
 * which is exactly the claim you must never make against a text with a hole in
 * it. Cut from the consolidation, where чл. 6, ал. 1 enumerates т. 1 … т. 22
 * unbroken.
 */
const CP_LIST_HEADER: LawQuote = {
  actFile: IZ2539,
  unitRef: "чл. 6",
  citationBg: `${IZ2539_BG}, чл. 6, ал. 1`,
  quoteBg:
    "За нарушения на Закона за движението по пътищата на водачите на МПС се отнемат контролни точки, както следва:",
};

/** „Not in the list" is a FINDING, not an absence of research. */
function notListed(noteBg: string): ControlPointsFigure {
  return { status: "not-listed", points: 0, source: CP_LIST_HEADER, noteBg };
}

/**
 * The single most important sentence on the screen: what the number the student
 * is looking at is, and — because this is the reading everyone actually makes —
 * what it is not.
 */
export const EXAM_VS_CONTROL_POINTS_BG =
  "Точките в този урок са НАКАЗАТЕЛНИ (изпитни) точки от листа на практическия изпит по Наредба № 38 — оценка на това каране и нищо друго. Те НЕ са контролни точки: контролните са по книжката (39 максимум, 26 при първоначално издаване, Наредба № Iз-2539) и се отнемат само за нарушение на пътя, изброено в чл. 6, ал. 1 от наредбата.";

// ---------------------------------------------------------------------------
// System 1 — the exam sheet (Наредба № 38, приложение № 5, т. 10)
// ---------------------------------------------------------------------------

export const N38_CLASS_LABEL_BG: Record<SeverityClass, string> = {
  opasna: "опасна",
  osnovna: "основна",
  vtorostepenna: "второстепенна",
};

/** The sentence that STATES the point value, per clause. Verbatim from the act. */
const N38_CLAUSE_QUOTE: Record<"а" | "б" | "в", string> = {
  а: N38_OSNOVNA_DEF,
  б: N38_VTOROSTEPENNA_DEF,
  в: N38_OPASNA_HEADER,
};

export interface ExamMark {
  points: ViolationPoints;
  severityClass: SeverityClass;
  /** „опасна" | „основна" | „второстепенна". */
  classBg: string;
  clause: "а" | "б" | "в";
  opasnaCase: N38OpasnaCase | null;
  /** „Наредба № 38 приложение № 5, т. 10, б. „в“". */
  citationBg: string;
  /** The clause sentence that states the number. */
  clauseQuoteBg: string;
  /** For б. „в" — the enumerated case this act falls under. Verbatim. */
  caseQuoteBg: string | null;
  /** т. 11 — the pass rule, so the number has a scale. */
  passRuleBg: string;
  /** „Наредба № 38 приложение № 5, т. 11". */
  passRuleCitationBg: string;
}

/**
 * The exam mark for a code, assembled from what is already grounded: the
 * catalogue's declared class/points and `n38.ts`'s per-code clause mapping
 * (itself re-derived from the ingested act by
 * `__tests__/naredba-38-classification.test.ts`). No new figure is introduced
 * here — this only puts a LABEL and a CITATION on the number that was already
 * being shown bare.
 */
export function examMarkFor(code: ViolationCode): ExamMark {
  const spec = VIOLATIONS[code];
  const basis = N38_BASIS[code];
  const opasnaCase = basis.opasnaCase ?? null;
  return {
    points: spec.points,
    severityClass: spec.severityClass,
    classBg: N38_CLASS_LABEL_BG[spec.severityClass],
    clause: basis.clause,
    opasnaCase,
    citationBg: `Наредба № 38 приложение № 5, т. 10, б. „${basis.clause}“`,
    clauseQuoteBg: N38_CLAUSE_QUOTE[basis.clause],
    caseQuoteBg: opasnaCase === null ? null : N38_OPASNA_CASES[opasnaCase],
    passRuleBg: N38_PASS_RULE,
    passRuleCitationBg: "Наредба № 38 приложение № 5, т. 11",
  };
}

// ---------------------------------------------------------------------------
// System 3 + 2 — the road, per violation code
// ---------------------------------------------------------------------------

/** Build a grounded fine from the act's own лв. figure. */
function fine(amountBgn: number, banBg: string | null, source: LawQuote): FineFigure {
  return {
    amountBgn,
    eurCents: eurCentsFromBgn(amountBgn),
    banBg,
    instruments: instrumentsForBan(banBg),
    source,
  };
}

/**
 * A ЗДвП чл. 182 rung. `alineaBg` („ал. 1") and `pointBg` („т. 3") make the
 * citation the rung's own address rather than the article's, which matters the
 * moment there are three ladders: ал. 1, ал. 2 and ал. 3 open with the SAME two
 * sentences („за превишаване с 10 km/h - с глоба 20 лв.;") and only diverge at
 * т. 3. A quote alone cannot say which alinea it was cut from.
 */
function speedTier(
  alineaBg: string,
  pointBg: string,
  bandBg: string,
  minOverKmh: number,
  maxOverKmh: number | null,
  amountBgn: number,
  quoteBg: string,
  banBg: string | null,
  controlPoints: ControlPointsFigure,
): LadderTier {
  return {
    bandBg,
    pointRefBg: `ЗДвП чл. 182, ${alineaBg}, ${pointBg}`,
    minOverKmh,
    maxOverKmh,
    fine: fine(amountBgn, banBg, {
      actFile: "zdvp.json",
      unitRef: "чл. 182",
      citationBg: `ЗДвП чл. 182, ${alineaBg}, ${pointBg}`,
      quoteBg,
    }),
    controlPoints,
  };
}

/**
 * 18 контролни точки on the top two rungs.
 *
 * WHICH TEXT THIS IS CUT FROM, AND WHY THE CITATION HAS TO SAY SO.
 * `content/law/acts/naredba-iz-2539.json` is the SARS snapshot of 28.01.2025
 * and its т. 12 reaches only „с над 50 км/час по чл. 182, ал. 1, т. 6". ДВ,
 * бр. 49 от 29.05.2026 г. widened it to reach чл. 182, ал. 1, т. 5 as well
 * (over 40 in town) — so on the „над 40" rung the stale copy and the live law
 * disagree, and the live law is the one a student will meet. The quote below is
 * cut from `naredba-iz-2539-consolidated-dv49-2026.json`.
 *
 * THE CITATION USED TO READ „Наредба № Iз-2539, чл. 6, ал. 1, т. 12" — a BARE
 * name, which `lib/content/law/corpus.ts ACT_ALIASES` then resolved to the 2025
 * SNAPSHOT. So the card showed 18 к.т. on the „над 40" rung and offered a chip
 * that, followed, lands on a sentence covering only „с над 50 км/час" — the
 * product contradicting itself in the one place it was trying to be verifiable.
 * This rung was fixed first, one chip at a time; the rest of the file followed,
 * and then the rule behind it did: a bare name now means the text in force and
 * the snapshot answers only to a citation that names 2025. Saying the edition
 * out loud is still the house style, because the student reads the chip.
 * `__tests__/citation-version.test.ts` requires the chip and `actFile` to name
 * the same edition, in both directions.
 */
const CP_SPEEDING_18: ControlPointsFigure = {
  status: "grounded",
  points: 18,
  source: {
    actFile: IZ2539,
    unitRef: "чл. 6",
    citationBg: `${IZ2539_BG}, чл. 6, ал. 1, т. 12`,
    quoteBg:
      "за превишаване на разрешената скорост по чл. 182, ал. 1, т. 5 и 6, ал. 2, т. 6 и ал. 3, т. 6 от ЗДвП, както и за превишаване на средната скорост за съответния контролиран участък от пътя по чл. 182, ал. 3а с посочените стойности в чл. 182, ал. 1, т. 5 и 6, ал. 2, т. 6 и ал. 3, т. 6 от ЗДвП - 18 контролни точки;",
  },
  noteBg:
    "Отнемат се от книжката, не от урока. Точката е в редакцията ѝ по ДВ, бр. 49 от 2026 г., която я разшири и към превишаване над 40 km/h в населено място.",
};

/**
 * The same 18, on the top rung of the OTHER two ladders. Same sentence, same
 * т. 12 — it names чл. 182, ал. 2, т. 6 and ал. 3, т. 6 explicitly — but the
 * note has to say which rung it landed on or it reads as the town's „над 40".
 */
const CP_SPEEDING_18_TOP: ControlPointsFigure = {
  ...CP_SPEEDING_18,
  noteBg:
    "Отнемат се от книжката, не от урока. Т. 12 сочи поименно и чл. 182, ал. 2, т. 6, и ал. 3, т. 6 — най-горното стъпало и извън населено място, и при обществен превоз на пътници и опасни товари.",
};

const CP_SPEEDING_NONE = notListed(
  "Това стъпало не е сред нарушенията, изброени в чл. 6, ал. 1 — а списъкът е изчерпателен. Затова глоба има, а контролни точки не падат.",
);

/**
 * ЗДвП чл. 182, ал. 1 — превишаване В НАСЕЛЕНО МЯСТО, the act's own six rungs.
 * Note the shape of т. 5 and т. 6: „над 40" and „над 50", with no 41–50 row.
 */
const SPEEDING_LADDER_URBAN: readonly LadderTier[] = [
  speedTier("ал. 1", "т. 1", "с 10 km/h", 1, 10, 20, "за превишаване с 10 km/h - с глоба 20 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 1", "т. 2", "от 11 до 20 km/h", 11, 20, 50, "за превишаване от 11 до 20 km/h - с глоба 50 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 1", "т. 3", "от 21 до 30 km/h", 21, 30, 100, "за превишаване от 21 до 30 km/h - с глоба 100 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 1", "т. 4", "от 31 до 40 km/h", 31, 40, 400, "за превишаване от 31 до 40 km/h - с глоба 400 лв.;", null, CP_SPEEDING_NONE),
  speedTier(
    "ал. 1",
    "т. 5",
    "над 40 km/h",
    41,
    50,
    600,
    "за превишаване над 40 km/h - с глоба 600 лв. и два месеца лишаване от право да управлява моторно превозно средство;",
    "два месеца лишаване от право да управлява моторно превозно средство",
    CP_SPEEDING_18,
  ),
  speedTier(
    "ал. 1",
    "т. 6",
    "над 50 km/h",
    51,
    null,
    700,
    "за превишаване над 50 km/h - с глоба 700 лв. и три месеца лишаване от право да управлява моторно превозно средство, като за всеки следващи 5 km/h превишаване над 50 km/h глобата се увеличава с 50 лв.",
    "три месеца лишаване от право да управлява моторно превозно средство",
    CP_SPEEDING_18,
  ),
];

/** ЗДвП чл. 182, ал. 2 — ИЗВЪН НАСЕЛЕНО МЯСТО. This one HAS its 41–50 row. */
const SPEEDING_LADDER_OUTSIDE: readonly LadderTier[] = [
  speedTier("ал. 2", "т. 1", "с 10 km/h", 1, 10, 20, "за превишаване с 10 km/h - с глоба 20 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 2", "т. 2", "от 11 до 20 km/h", 11, 20, 50, "за превишаване от 11 до 20 km/h - с глоба 50 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 2", "т. 3", "от 21 до 30 km/h", 21, 30, 100, "за превишаване от 21 до 30 km/h - с глоба 100 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 2", "т. 4", "от 31 до 40 km/h", 31, 40, 300, "за превишаване от 31 до 40 km/h - с глоба 300 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 2", "т. 5", "от 41 до 50 km/h", 41, 50, 400, "за превишаване от 41 до 50 km/h - с глоба 400 лв.;", null, CP_SPEEDING_NONE),
  speedTier(
    "ал. 2",
    "т. 6",
    "над 50 km/h",
    51,
    null,
    600,
    "за превишаване над 50 km/h - с глоба 600 лв. и два месеца лишаване от право да управлява моторно превозно средство, като за всеки следващи 5 km/h превишаване над 50 km/h глобата се увеличава с 50 лв.",
    "два месеца лишаване от право да управлява моторно превозно средство",
    CP_SPEEDING_18_TOP,
  ),
];

/**
 * ЗДвП чл. 182, ал. 3 — ОБЩЕСТВЕН ПРЕВОЗ НА ПЪТНИЦИ И ОПАСНИ ТОВАРИ. Applies
 * wherever the vehicle is: ал. 3 says nothing about населено място.
 *
 * The Cyrillic „к" in „всеки следващи 5 кm/h" on т. 6 is the act's own typo, in
 * the Държавен вестник text and therefore in our copy. Quoting it corrected
 * would make the sentence unfindable in the file it claims to come from, and
 * the re-cut test would say so — verbatim means verbatim.
 */
const SPEEDING_LADDER_PUBLIC: readonly LadderTier[] = [
  speedTier("ал. 3", "т. 1", "с 10 km/h", 1, 10, 20, "за превишаване с 10 km/h - с глоба 20 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 3", "т. 2", "от 11 до 20 km/h", 11, 20, 50, "за превишаване от 11 до 20 km/h - с глоба 50 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 3", "т. 3", "от 21 до 30 km/h", 21, 30, 150, "за превишаване от 21 до 30 km/h - с глоба 150 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 3", "т. 4", "от 31 до 40 km/h", 31, 40, 500, "за превишаване от 31 до 40 km/h - с глоба 500 лв.;", null, CP_SPEEDING_NONE),
  speedTier("ал. 3", "т. 5", "от 41 до 50 km/h", 41, 50, 800, "за превишаване от 41 до 50 km/h - с глоба 800 лв.;", null, CP_SPEEDING_NONE),
  speedTier(
    "ал. 3",
    "т. 6",
    "над 50 km/h",
    51,
    null,
    1000,
    "за превишаване над 50 km/h - с глоба 1000 лв. и три месеца лишаване от право да управлява моторно превозно средство, като за всеки следващи 5 кm/h превишаване над 50 km/h глобата се увеличава с 50 лв.",
    "три месеца лишаване от право да управлява моторно превозно средство",
    CP_SPEEDING_18_TOP,
  ),
];

/** Which alinea of ЗДвП чл. 182 governs — the third input to the derivation. */
export type SpeedingScope = "urban" | "outsideUrban" | "publicOrDangerous";

export const SPEEDING_LADDERS: Readonly<Record<SpeedingScope, readonly LadderTier[]>> = {
  urban: SPEEDING_LADDER_URBAN,
  outsideUrban: SPEEDING_LADDER_OUTSIDE,
  publicOrDangerous: SPEEDING_LADDER_PUBLIC,
};

export const SPEEDING_SCOPE_BG: Readonly<Record<SpeedingScope, string>> = {
  urban: "в населено място (ЗДвП чл. 182, ал. 1)",
  outsideUrban: "извън населено място (ЗДвП чл. 182, ал. 2)",
  publicOrDangerous:
    "при обществен превоз на пътници и опасни товари, където и да е (ЗДвП чл. 182, ал. 3)",
};

// ---------------------------------------------------------------------------
// THE TOLERANCE — a chain of three documents, and it is NOT a flat 3
// ---------------------------------------------------------------------------

/**
 * „От отчетената скорост се вадят 3" is the single most confidently repeated
 * piece of folk knowledge in Bulgarian driving. It is REAL — and it is not a 3.
 *
 * The figure lives three documents away from the statute a student is taught to
 * look in, which is exactly why it degrades into a number people just know:
 *
 *   ЗДвП чл. 165, ал. 3         delegates the whole subject to a наредба
 *     └→ Наредба № 8121з-532 чл. 16, ал. 5   ORDERS the subtraction, and
 *        delegates its SIZE onward, by name
 *          └→ НСИПМК чл. 425, ал. 1, т. 2    ± 3 km/h up to 100 km/h,
 *                                            ± 3 % above it
 *
 * So at 140 km/h the deduction is 4,2 km/h, not 3 — and a product that
 * hard-coded the 3 would be shipping the folk version of the very thing it
 * exists to correct. All three units are in `ACT_IDS`
 * (`lib/content/law/corpus.ts`) and all three quotes below are re-cut from
 * `content/law/acts` by `__tests__/consequences.test.ts`.
 */
export const TOLERANCE_DELEGATION: LawQuote = {
  actFile: "zdvp.json",
  unitRef: "чл. 165",
  citationBg: "ЗДвП чл. 165, ал. 3",
  quoteBg:
    "Условията и редът за използване на автоматизирани технически средства и системи за контрол на правилата за движение се определят с наредба на министъра на вътрешните работи.",
};

export const TOLERANCE_SUBTRACTION: LawQuote = {
  actFile: "naredba-8121z-532.json",
  unitRef: "чл. 16",
  citationBg: "Наредба № 8121з-532, чл. 16, ал. 5",
  quoteBg:
    "При съставяне на акт за установяване на административно нарушение за превишена скорост, издаване на наказателно постановление или издаване на електронен фиш за установено нарушение за превишена скорост от измерената от АТСС скорост се приспада максимално допустимата грешка за съответния тип АТСС, посочена в чл. 425 от Наредбата за средствата за измерване, които подлежат на метрологичен контрол (ДВ, бр. 103 от 2024 г.).",
};

export const TOLERANCE_SIZE: LawQuote = {
  actFile: "naredba-sredstva-za-izmervane.json",
  unitRef: "чл. 425",
  citationBg:
    "Наредба за средствата за измерване, които подлежат на метрологичен контрол, чл. 425, ал. 1, т. 2",
  quoteBg:
    "при измерване на скорост при условия на функциониране: ± 3 km/h за скорости до 100 km/h или ± 3 % от измерената стойност за скорости над 100 km/h.",
};

/**
 * The three numbers of т. 2, PARSED OUT OF THE QUOTE rather than typed beside
 * it. Same discipline `consequences.test.ts` already applies to the licence
 * budget, moved into the module itself because this is the figure the wave
 * exists to stop anyone from writing from memory: edit the quote and the values
 * follow it; break the quote and the module refuses to load rather than serve a
 * silently stale 3.
 */
function parseTolerance(quoteBg: string): { flatKmh: number; upToKmh: number; percent: number } {
  const m =
    /±\s*(\d+(?:[.,]\d+)?)\s*km\/h\s+за скорости до\s*(\d+(?:[.,]\d+)?)\s*km\/h\s+или\s*±\s*(\d+(?:[.,]\d+)?)\s*%/.exec(
      quoteBg,
    );
  if (m === null) {
    throw new Error(
      "consequences.ts: НСИПМК чл. 425, ал. 1, т. 2 no longer states the tolerance in the shape this module reads. " +
        "Re-read the article and fix the parse — do NOT type the number in.",
    );
  }
  const num = (s: string): number => Number(s.replace(",", "."));
  return { flatKmh: num(m[1]), upToKmh: num(m[2]), percent: num(m[3]) };
}

export const TOLERANCE = parseTolerance(TOLERANCE_SIZE.quoteBg);

/** „4,2" / „3" — Bulgarian decimal comma, one decimal, no trailing zero. */
export function formatKmh(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
}

export interface DeviceTolerance {
  /** km/h subtracted from the measured speed. */
  kmh: number;
  /** Which limb of т. 2 produced it. */
  branch: "flat" | "percent";
  /** „± 3 km/h (за скорости до 100 km/h)" — the rule, not just the number. */
  labelBg: string;
  delegation: LawQuote;
  subtraction: LawQuote;
  size: LawQuote;
}

/**
 * THE BRANCH. „за скорости до 100 km/h" is read on the MEASURED speed — that is
 * the only speed the уред has when it applies its own error — so 100 exactly
 * takes the flat 3 and 100,1 upward takes the 3 %.
 */
export function deviceToleranceKmh(measuredKmh: number): DeviceTolerance {
  if (!Number.isFinite(measuredKmh) || measuredKmh < 0) {
    throw new RangeError(`deviceToleranceKmh: measuredKmh must be a finite speed, got ${measuredKmh}`);
  }
  const flat = measuredKmh <= TOLERANCE.upToKmh;
  const kmh = flat ? TOLERANCE.flatKmh : (measuredKmh * TOLERANCE.percent) / 100;
  return {
    kmh: Math.round(kmh * 1000) / 1000,
    branch: flat ? "flat" : "percent",
    labelBg: flat
      ? `± ${formatKmh(TOLERANCE.flatKmh)} km/h (за скорости до ${formatKmh(TOLERANCE.upToKmh)} km/h)`
      : `± ${formatKmh(TOLERANCE.percent)} % от измерената стойност (за скорости над ${formatKmh(TOLERANCE.upToKmh)} km/h) = ${formatKmh((measuredKmh * TOLERANCE.percent) / 100)} km/h`,
    delegation: TOLERANCE_DELEGATION,
    subtraction: TOLERANCE_SUBTRACTION,
    size: TOLERANCE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// THE DERIVATION — (measured, limit, scope) → the rung, and everything on it
// ---------------------------------------------------------------------------

/**
 * т. 6's escalator, applied. The base 700 / 600 / 1000 лв. is a retrieved
 * figure; the TOTAL is not written anywhere and is therefore kept in its own
 * shape, so nothing downstream can mistake it for a quoted amount. Both numbers
 * it needs — the 5 km/h step and the 50 лв. — are cut out of the rung's own
 * sentence, including through the act's Cyrillic „кm/h" typo in ал. 3.
 */
export interface FineEscalation {
  /** Whole 5 km/h steps above 50. */
  steps: number;
  addedBgn: number;
  totalBgn: number;
  totalEurCents: number;
  /** The rung's own sentence — the escalator is its last clause. */
  source: LawQuote;
  noteBg: string;
}

function escalationFor(tier: LadderTier, excessWholeKmh: number): FineEscalation | null {
  const quote = tier.fine.source.quoteBg;
  const step = /за всеки следващи (\d+) [кk]m\/h превишаване над (\d+) [кk]m\/h/.exec(quote);
  const add = /глобата се увеличава с (\d+) лв\./.exec(quote);
  if (step === null || add === null) return null;
  const stepKmh = Number(step[1]);
  const overKmh = Number(step[2]);
  const addBgn = Number(add[1]);
  const steps = Math.floor((excessWholeKmh - overKmh) / stepKmh);
  if (steps <= 0) return null;
  const addedBgn = steps * addBgn;
  const totalBgn = tier.fine.amountBgn + addedBgn;
  return {
    steps,
    addedBgn,
    totalBgn,
    totalEurCents: eurCentsFromBgn(totalBgn),
    source: tier.fine.source,
    noteBg:
      `Превишението е ${excessWholeKmh} km/h — ${steps} пъти по ${stepKmh} km/h над ${overKmh}, ` +
      `значи глобата расте с ${addedBgn} лв. над основните ${tier.fine.amountBgn} лв.: ` +
      `${totalBgn} лв. = ${formatEur(eurCentsFromBgn(totalBgn))}.`,
  };
}

export interface SpeedingBandInput {
  /** What the уред read, km/h. */
  measuredKmh: number;
  /** The limit in force at that spot, km/h. */
  limitKmh: number;
  /**
   * Which alinea. REQUIRED and never defaulted: ал. 1 and ал. 2 charge 400 лв.
   * and 300 лв. for the same 35 km/h, so guessing the scope is guessing the
   * penalty. The engine does not know whether a lesson is in a населено място,
   * so the surfaces ask for both answers rather than one invented one.
   */
  scope: SpeedingScope;
}

export interface SpeedingBand extends SpeedingBandInput {
  scopeBg: string;
  tolerance: DeviceTolerance;
  /** measured − tolerance: the speed the penalty is assessed on. */
  chargedKmh: number;
  /** chargedKmh − limit. Exact; may be fractional once the 3 % limb is in. */
  excessKmh: number;
  /** The whole km/h the ladder is read at (see `overKmhWholeNoteBg`). */
  excessWholeKmh: number;
  /**
   * null = the tolerance swallowed the excess. That is an ANSWER, not a gap:
   * there is no rung, and the card says so instead of showing the table.
   */
  tier: LadderTier | null;
  escalation: FineEscalation | null;
  /** Base rung + escalator. null when there is no rung. */
  totalBgn: number | null;
  totalEurCents: number | null;
  instruments: readonly EnforcementInstrument[] | null;
  /** The arithmetic, in one sentence a student can check against his own фиш. */
  arithmeticBg: string;
  /** The tolerance rule with its number and its three articles. */
  toleranceBg: string;
  /** The rung and what it costs — or why there is no rung. */
  verdictBg: string;
  /** All three, in reading order. */
  linesBg: readonly string[];
}

/**
 * A STATEMENT ABOUT THIS PRODUCT, NOT ABOUT THE LAW — worded as one, and kept
 * out of every quoted row. The ladder's bands are whole km/h; the 3 % limb
 * produces fractions (140 − 4,2 = 135,8). No act says how to round that, so we
 * step DOWN to the whole km/h, which can only ever move a student into a
 * cheaper rung, never a dearer one. If the real фиш disagrees it will disagree
 * upward, and the card says which way we erred.
 */
export const EXCESS_ROUNDING_NOTE_BG =
  "Стъпалата на чл. 182 са в цели km/h, а приспадането на 3 % дава дробно число. Тук превишението се закръгля НАДОЛУ до цял km/h — законът не казва как се закръглява, затова избираме посоката в полза на водача. Ако реалният фиш се разминава, ще е с едно стъпало нагоре, не надолу.";

/**
 * (measured, limit, scope) → the rung of ЗДвП чл. 182, with глоба in EUR,
 * контролни точки, лишаване and the instrument the penalty can arrive on.
 *
 * This is the function the product did not have. `pen-speeding-urban-21-30` in
 * `content/law/penalties.json` was hand-authored for the founder's own numbers
 * — 78 in a 50 — so the one case anybody had checked reconciled and every other
 * speed fell off the end of the world. A student caught at 96 in a 50 got the
 * whole table and no row.
 */
export function deriveSpeedingBand(input: SpeedingBandInput): SpeedingBand {
  const { measuredKmh, limitKmh, scope } = input;
  if (!Number.isFinite(measuredKmh) || measuredKmh < 0) {
    throw new RangeError(`deriveSpeedingBand: measuredKmh must be a finite speed, got ${measuredKmh}`);
  }
  if (!Number.isFinite(limitKmh) || limitKmh <= 0) {
    throw new RangeError(`deriveSpeedingBand: limitKmh must be a positive speed, got ${limitKmh}`);
  }

  const tolerance = deviceToleranceKmh(measuredKmh);
  const round3 = (v: number): number => Math.round(v * 1000) / 1000;
  const chargedKmh = round3(measuredKmh - tolerance.kmh);
  const excessKmh = round3(chargedKmh - limitKmh);
  // +1e-9 so a 44,999999999 produced by binary floating point is still a 45.
  const excessWholeKmh = Math.floor(excessKmh + 1e-9);

  const scopeBg = SPEEDING_SCOPE_BG[scope];
  const arithmeticBg =
    `Измерено ${formatKmh(measuredKmh)} km/h при ограничение ${formatKmh(limitKmh)} km/h; ` +
    `минус максимално допустимата грешка на уреда ${formatKmh(tolerance.kmh)} km/h = ` +
    `${formatKmh(chargedKmh)} km/h, тоест превишаване с ${formatKmh(Math.max(excessKmh, 0))} km/h.`;
  const toleranceBg =
    `Грешката на уреда е ${tolerance.labelBg} — „${TOLERANCE_SIZE.quoteBg}“ ` +
    `(${TOLERANCE_SIZE.citationBg}). Приспада се по ${TOLERANCE_SUBTRACTION.citationBg}, ` +
    `наредбата, която ${TOLERANCE_DELEGATION.citationBg} възлага на министъра на вътрешните работи. ` +
    `Това е точност на уреда, не позволени километри.`;

  const tier =
    excessWholeKmh < 1
      ? null
      : (SPEEDING_LADDERS[scope].find(
          (t) => excessWholeKmh >= t.minOverKmh && (t.maxOverKmh === null || excessWholeKmh <= t.maxOverKmh),
        ) ?? null);

  if (tier === null) {
    const verdictBg =
      excessWholeKmh < 1
        ? `След приспадането няма превишаване по чл. 182 — ${formatKmh(chargedKmh)} km/h при ограничение ${formatKmh(limitKmh)} km/h. ` +
          `Приспадането важи за санкцията на пътя (${TOLERANCE_SUBTRACTION.citationBg} говори за акт, наказателно постановление и електронен фиш) и не е част от оценката на урока.`
        : `Стъпало за превишаване с ${excessWholeKmh} km/h ${scopeBg} не е намерено в стълбицата — не се показва число.`;
    return {
      ...input,
      scopeBg,
      tolerance,
      chargedKmh,
      excessKmh,
      excessWholeKmh,
      tier: null,
      escalation: null,
      totalBgn: null,
      totalEurCents: null,
      instruments: null,
      arithmeticBg,
      toleranceBg,
      verdictBg,
      linesBg: [arithmeticBg, toleranceBg, verdictBg],
    };
  }

  const escalation = escalationFor(tier, excessWholeKmh);
  const totalBgn = escalation?.totalBgn ?? tier.fine.amountBgn;
  const totalEurCents = escalation?.totalEurCents ?? tier.fine.eurCents;
  const cp = tier.controlPoints;
  const cpBg =
    cp.status === "grounded" && cp.points !== null
      ? `${cp.points} контролни точки от книжката`
      : cp.status === "not-listed"
        ? "0 контролни точки — това стъпало не е в изчерпателния списък по чл. 6, ал. 1"
        : "контролни точки: не е установено";
  const verdictBg =
    `Стъпалото е „${tier.bandBg}“ ${scopeBg} — ${tier.pointRefBg}: глоба ${formatEur(totalEurCents)} ` +
    `(${totalBgn} лв. по текста на закона)${escalation === null ? "" : ` — ${escalation.addedBgn} лв. от тях по правилото за всеки следващи 5 km/h`}, ` +
    `${cpBg}, ${tier.fine.banBg === null ? "без лишаване от право" : `и ${tier.fine.banBg}`}. ` +
    `Пристига като ${instrumentLabelBg(tier.fine.instruments)}.`;

  return {
    ...input,
    scopeBg,
    tolerance,
    chargedKmh,
    excessKmh,
    excessWholeKmh,
    tier,
    escalation,
    totalBgn,
    totalEurCents,
    instruments: tier.fine.instruments,
    arithmeticBg,
    toleranceBg,
    verdictBg,
    linesBg: [arithmeticBg, toleranceBg, verdictBg],
  };
}

// ---------------------------------------------------------------------------
// Carrying the two numbers out of the tick that convicted
// ---------------------------------------------------------------------------

/**
 * `reduceTick` holds BOTH the speed and `tick.maxSpeedKmh` at the instant it
 * convicts, and used to throw them away — `makeViolation("SPEEDING_DANGEROUS",
 * t)` with no detail. So the card could never say more than „here is the whole
 * table". These two functions are the whole plumbing: the reducer encodes the
 * pair into `ViolationEvent.detail` (a `string`, capped at 64 chars by
 * `lessons/wire.ts`) and any surface decodes it back.
 *
 * Deliberately NOT a JSON blob: it rides through the wire schema, a database
 * column and a trace file, and a compact opaque token is cheaper to validate
 * than a nested object. The shape is „v78.4/l50" — anything else parses to null
 * and the surface falls back to the ladder, exactly as before.
 */
export function encodeSpeedMeasurement(measuredKmh: number, limitKmh: number): string {
  const m = Math.round(measuredKmh * 10) / 10;
  const l = Math.round(limitKmh);
  return `v${m}/l${l}`;
}

export function parseSpeedMeasurement(
  detail: string | undefined,
): { measuredKmh: number; limitKmh: number } | null {
  if (detail === undefined) return null;
  const m = /^v(\d+(?:\.\d+)?)\/l(\d+)$/.exec(detail);
  if (m === null) return null;
  const measuredKmh = Number(m[1]);
  const limitKmh = Number(m[2]);
  if (!Number.isFinite(measuredKmh) || !Number.isFinite(limitKmh) || limitKmh <= 0) return null;
  return { measuredKmh, limitKmh };
}

/**
 * THE BLANK THAT WENT STALE. This footnote used to end „…затова конкретната
 * стойност на тази грешка не се показва тук" — an honest blank when it was
 * written, because Наредба № 8121з-532 and НСИПМК were not in the corpus. They
 * are now (`ACT_IDS`), so withholding the number stopped being honesty and
 * became an out-of-date apology. The number is shown, with its article, and the
 * 140 km/h case is COMPUTED rather than typed so it cannot drift from the rule.
 */
const SPEEDING_LADDER_FOOTNOTE_BG =
  "Това е стълбицата за НАСЕЛЕНО МЯСТО. Извън населено място сумите са други (ЗДвП чл. 182, ал. 2), а за обществен превоз на пътници и опасни товари — трети (ал. 3). На пътя от измерената скорост първо се приспада максимално допустимата грешка на уреда и чак тогава се определя стъпалото: „" +
  TOLERANCE_SIZE.quoteBg +
  "“ (" +
  TOLERANCE_SIZE.citationBg +
  "). Приспадането е разпоредено от " +
  TOLERANCE_SUBTRACTION.citationBg +
  " — наредбата, която " +
  TOLERANCE_DELEGATION.citationBg +
  " възлага на министъра на вътрешните работи. Затова над 100 km/h грешката вече не е 3: при 140 km/h тя е " +
  formatKmh(deviceToleranceKmh(140).kmh) +
  " km/h. Това е точност на уреда, не позволени километри.";

/**
 * THE GROUNDED SET — deliberately small, deliberately checkable.
 *
 * Five codes have a road penalty cut verbatim from an act we hold. Every other
 * code falls through to `UNKNOWN_ROAD`. That ratio is not laziness: each entry
 * here is a claim that THIS detector's act is THAT article's offence, and a
 * wrong mapping is exactly the failure mode ADR-002 exists to stop. Adding a
 * row means retrieving the article and pinning its words in the test.
 */
export const ROAD_CONSEQUENCES: Partial<Record<ViolationCode, RoadConsequence>> = {
  SPEEDING_DANGEROUS: {
    kind: "ladder",
    offenceBg: "превишаване на разрешената максимална скорост",
    scopeBg: "в населено място (ЗДвП чл. 182, ал. 1)",
    tiers: SPEEDING_LADDER_URBAN,
    appliesBg:
      "Тази грешка се дава при превишаване с ПОВЕЧЕ от 10 km/h, така че първото стъпало отпада — на пътя започваш поне от второто.",
    footnoteBg: SPEEDING_LADDER_FOOTNOTE_BG,
  },
  SPEEDING_OVER_LIMIT: {
    kind: "ladder",
    offenceBg: "превишаване на разрешената максимална скорост",
    scopeBg: "в населено място (ЗДвП чл. 182, ал. 1)",
    tiers: SPEEDING_LADDER_URBAN,
    appliesBg:
      "Тази грешка се дава при превишаване В РАМКИТЕ на 10 km/h — първото стъпало. Още 1 km/h отгоре и грешката става опасна, а стълбицата тръгва нагоре.",
    footnoteBg: SPEEDING_LADDER_FOOTNOTE_BG,
  },
  RED_LIGHT_CROSSED: {
    kind: "single",
    offenceBg: "преминаване при сигнал на светофара, който не разрешава преминаването",
    fine: fine(150, null, {
      actFile: "zdvp.json",
      unitRef: "чл. 183",
      citationBg: "ЗДвП чл. 183, ал. 5, т. 1",
      quoteBg: "Наказва се с глоба 150 лв. водач, който:",
    }),
    controlPoints: {
      status: "grounded",
      points: 10,
      source: {
        actFile: IZ2539,
        unitRef: "чл. 6",
        citationBg: `${IZ2539_BG}, чл. 6, ал. 1, т. 20`,
        quoteBg:
          "за преминаване при сигнал на светофара, който не разрешава преминаването (чл. 183, ал. 5, т. 1 от ЗДвП) - 10 контролни точки;",
      },
      noteBg:
        "Отнемат се от книжката. Повторното нарушение вече носи и лишаване от право (ЗДвП чл. 183, ал. 6) — и тогава фиш е изключен.",
    },
  },
  PEDESTRIAN_NOT_YIELDED: {
    kind: "single",
    offenceBg: "неосигуряване на предимство при преминаване през пешеходна пътека",
    fine: fine(150, null, {
      actFile: "zdvp.json",
      unitRef: "чл. 183",
      citationBg: "ЗДвП чл. 183, ал. 5, т. 2",
      quoteBg: "Наказва се с глоба 150 лв. водач, който:",
    }),
    controlPoints: {
      status: "grounded",
      points: 10,
      source: {
        actFile: IZ2539,
        unitRef: "чл. 6",
        citationBg: `${IZ2539_BG}, чл. 6, ал. 1, т. 21`,
        quoteBg:
          "за неосигуряване на предимство при преминаване през пешеходна пътека (чл. 183, ал. 5, т. 2 от ЗДвП) - 10 контролни точки;",
      },
      noteBg: "Отнемат се от книжката, отделно от глобата и отделно от оценката на урока.",
    },
  },
  STOP_SIGN_NO_FULL_STOP: {
    kind: "single",
    offenceBg:
      "неспиране на пътен знак Б2 „Спри! Пропусни движещите се по пътя с предимство!“, без от това да е създадена непосредствена опасност",
    fine: fine(100, null, {
      actFile: "zdvp.json",
      unitRef: "чл. 183",
      citationBg: "ЗДвП чл. 183, ал. 4, т. 14",
      quoteBg: "Наказва се с глоба 100 лв. водач, който:",
    }),
    controlPoints: notListed(
      "Чл. 183, ал. 4, т. 14 не фигурира в изчерпателния списък по чл. 6, ал. 1 от Наредба № Iз-2539. Ако обаче от неспирането е създадена непосредствена опасност, деянието минава по друг състав и вече носи контролни точки.",
    ),
  },
};

/**
 * THE HONEST BLANK — the default, not the exception. Names the rules that
 * decide the instrument and the points, and NO figure, because none has been
 * retrieved for this offence.
 */
export const UNKNOWN_ROAD: RoadConsequence = {
  kind: "unknown",
  ruleBg:
    "Санкцията на пътя за това нарушение още не е извлечена дословно от закона, затова тук няма число — по-добре празно, отколкото сгрешено. Общото правило: глобата се налага с фиш, когато за нарушението не е предвидено лишаване от право (ЗДвП чл. 186, ал. 1); ако е установено и заснето с автоматизирано техническо средство — с електронен фиш (ЗДвП чл. 189, ал. 4); а контролни точки се отнемат само за нарушенията, изброени в чл. 6, ал. 1 от Наредба № Iз-2539.",
};

/**
 * Three tiers, most specific first: a structured entry (money in EUR, points,
 * instrument, all separately citable) → the catalogue's authored sentence →
 * the honest blank. The middle tier exists because a parallel lane authored
 * road prose into `catalog.ts` during the same wave; reading it here is what
 * keeps the product from having two answers to the same question.
 */
export function roadConsequenceFor(code: ViolationCode): RoadConsequence {
  const structured = ROAD_CONSEQUENCES[code];
  if (structured !== undefined) return structured;
  const authored = VIOLATIONS[code].realWorldBg;
  if (authored !== undefined && authored.trim().length > 0) {
    return { kind: "authored", textBg: authored, refsBg: VIOLATIONS[code].realWorldRefs ?? [] };
  }
  return UNKNOWN_ROAD;
}

/** Every quote in this file, for the test that re-cuts them from the acts. */
export function allLawQuotes(): LawQuote[] {
  const out: LawQuote[] = [
    INSTRUMENT_RULE_FISH,
    INSTRUMENT_RULE_EFISH,
    INSTRUMENT_RULE_FISH_CARRIES_POINTS,
    FISH_DISCOUNT,
    EFISH_DISCOUNT,
    CONTROL_POINTS_BUDGET.max,
    CONTROL_POINTS_BUDGET.newDriver,
    CP_LIST_HEADER,
    // The three-document tolerance chain. Every one of them is now in ACT_IDS,
    // which is why the card no longer withholds the number.
    TOLERANCE_DELEGATION,
    TOLERANCE_SUBTRACTION,
    TOLERANCE_SIZE,
  ];
  // ALL THREE LADDERS, not only the one ROAD_CONSEQUENCES serves. ал. 2 and
  // ал. 3 are reachable through `deriveSpeedingBand` and would otherwise be the
  // only figures in this file no test re-cuts.
  for (const ladder of Object.values(SPEEDING_LADDERS)) {
    for (const tier of ladder) out.push(tier.fine.source, tier.controlPoints.source);
  }
  for (const road of Object.values(ROAD_CONSEQUENCES)) {
    if (road === undefined) continue;
    if (road.kind === "single") {
      out.push(road.fine.source, road.controlPoints.source);
    } else if (road.kind === "ladder") {
      for (const tier of road.tiers) out.push(tier.fine.source, tier.controlPoints.source);
    }
  }
  return out;
}
