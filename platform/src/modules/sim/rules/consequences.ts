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

import { N38_BASIS, N38_OPASNA_CASES, N38_OPASNA_HEADER, N38_OSNOVNA_DEF, N38_PASS_RULE, N38_TERMINATION_CITATION, N38_TERMINATION_RULE, N38_UNIT_REF, N38_VTOROSTEPENNA_DEF, type N38OpasnaCase } from "./n38";
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
 * A penalty that EXISTS in the act and does not fire on its own — the act
 * attaches a condition to it, and that condition is a fact about the drive
 * rather than about the manoeuvre.
 *
 * Three articles in this file are built this way and between them they cover
 * most of the driving faults a учебен час produces:
 *
 *   ЗДвП чл. 179, ал. 2      — 300 лв., but only „причини пътнотранспортно
 *                              произшествие… ако деянието не съставлява
 *                              престъпление"
 *   ЗДвП чл. 179, ал. 1, т. 5 — 200 лв., but only „ако от това е създадена
 *                              непосредствена опасност за движението"
 *   ЗДвП чл. 180, ал. 1, т. 1 — 100 лв., but only „когато в резултат на
 *                              нарушението е създадена непосредствена опасност
 *                              за движението"
 *
 * The simulator establishes none of those three facts at the moment it marks
 * the fault — if it had, the event would be a COLLISION or one of the codes
 * that grades an established conflict. So the figure is shown WITH ITS
 * CONDITION ATTACHED, in the act's own words, and never as the price of what
 * the student just did. „300 лв." printed bare under a following-distance
 * fault is a lie of exactly the kind this whole file exists to stop.
 */
export interface ConditionalPenalty {
  /** The condition, cut from the same sentence as the figure. */
  conditionBg: string;
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
      /**
       * The точка's OWN verbatim words. `fine.source` quotes the alinea's
       * header, because that is the sentence carrying „глоба 100 лв. водач,
       * който:" — the offences themselves live in the numbered points below it
       * and no single sentence holds both. Without this field the card can cite
       * the money and only PARAPHRASE the conduct, which is the half a student
       * needs to recognise himself in.
       */
      offenceQuote?: LawQuote;
      /**
       * The RULE broken, as opposed to the penalty for breaking it. Two
       * different articles, and a student who is shown only the second learns
       * the price without learning the duty.
       */
      duties?: readonly LawQuote[];
      fine: FineFigure;
      controlPoints: ControlPointsFigure;
      /**
       * The dearer article the same act climbs to once harm follows. Empty for
       * most rows; present where the ladder is the teaching (a close pass of a
       * cyclist is 50 лв. и 10 контролни точки until the cyclist swerves, and
       * then it is a different article).
       */
      escalation?: readonly ConditionalPenalty[];
      /** A caveat the row cannot be read correctly without. */
      noteBg?: string;
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
      /**
       * A ROAD RULE IS BROKEN AND THE MONEY IS GATED — the commonest honest
       * answer in the second half of the catalogue, and the one that had no
       * shape until now.
       *
       * Following too close in the rain breaks ЗДвП чл. 23, ал. 1. The act
       * charges nothing for it: чл. 179, ал. 2 wants a ПТП first. Both halves
       * are true and a card that prints only one of them misleads — the first
       * half alone reads as „free", the second alone reads as „300 лв.". So the
       * shape carries the duty, the plain headline, and every gated penalty
       * with the condition still attached to it.
       */
      kind: "conditional";
      offenceBg: string;
      /**
       * The duties the drive actually broke — verbatim. A LIST because two rows
       * need two: fog needs both the lights duty that IS binding and the fog-
       * lamp article that is only a permission, or the card reads as if чл. 74
       * required the lamps.
       */
      duties: readonly LawQuote[];
      /** One sentence, plainly: what this costs today, on the street. */
      headlineBg: string;
      /** The penalties that exist, each still holding its own condition. */
      branches: readonly ConditionalPenalty[];
      /**
       * THE LICENCE ANSWER FOR THE UNGATED CASE — the one figure on the card
       * that is not gated on anything, and the reason this field was added to a
       * shape that already carries `controlPoints` inside every branch.
       *
       * „Колко контролни точки ми падат за това?" has an answer even when the
       * глоба does not: чл. 6, ал. 1 of Наредба № Iз-2539 is an EXHAUSTIVE list
       * of offences, so an offence absent from it costs zero — today, with no
       * ПТП and no непосредствена опасност required to make that true. Leaving
       * it to the branches would print the licence answer only alongside the
       * condition that gates the money, which reads as „zero, so long as
       * nothing happens" and is the opposite of what the list says.
       *
       * Omitted where the branches genuinely are the whole answer.
       */
      controlPoints?: ControlPointsFigure;
    }
  | {
      /**
       * IT COSTS YOU ON THE EXAM AND NOTHING ON THE STREET — and that is a
       * finding, not a gap.
       *
       * A stalled engine, three seconds of hesitation on green, stopping a
       * metre too close in a queue, the pre-drive ritual in the wrong order:
       * these are marked by Наредба № 38 because an examiner is watching, and
       * by nobody else, because no article of ЗДвП requires a driver to move
       * off promptly, to hold a particular gap at a standstill, or to adjust
       * the seat before the mirrors. The instinct is to reach for the nearest
       * general duty and let the student assume a fine hides behind it. Saying
       * it plainly is both truer and more useful: it tells him which of his
       * mistakes are habits to fix and which are offences to fear.
       *
       * `duties` may still name a general ЗДвП article the fault brushes
       * against (чл. 20, ал. 1 — continuous control of the vehicle). Naming it
       * is not charging it, and `whyBg` says so.
       */
      kind: "exam-only";
      /** „Струва точки на изпита и нищо на пътя." Plain, no figure. */
      headlineBg: string;
      /** Наредба № 38's own clause — the exam half, cited as the brief asks. */
      examSource: LawQuote;
      /** The general duties it touches. Empty when it touches none. */
      duties: readonly LawQuote[];
      /** WHY there is no offence — the searched-and-found-nothing sentence. */
      whyBg: string;
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
 * THE SECOND WAS THAT THE SNAPSHOT WAS DAMAGED. Its чл. 6, т. 3 was a sentence
 * broken in half („…откаже да му" ⟨footer⟩ „бъде извършена проверка…") by
 * „Източник: Правно-информационни системи „Сиела" / 24/01/2025 г." — a PDF page
 * footer the extraction swallowed — and that footer sat inside 16 of its 40
 * units, presented as statute text. So the citation behind „0 контролни точки"
 * was pointing at a copy of the exhaustive list with a vendor watermark in the
 * middle of it. The FINDING was unchanged under the consolidation; the evidence
 * link was the broken part, and a claim is only as checkable as the copy it
 * points at.
 *
 * That footer is GONE as of 2026-08-09 — removed in the extraction
 * (`content/law/tools/page-furniture.mjs`), with the source PDFs re-fetched and
 * their sha256 re-checked against `sources.json`, and т. 3 rejoined into one
 * sentence that matches the consolidation word for word. IT CHANGES NOTHING
 * HERE. The move off the snapshot was never only about the footer: чл. 2, ал. 6
 * of it is still the repealed restoration rule, and its figures still predate
 * two 2026 ЗИД acts. A repaired photograph of a superseded text is still a
 * superseded text.
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
  /**
   * Does this fault END the practical exam, as distinct from failing it?
   *
   * Two different provisions, and the product used to print only the louder
   * one. The MARK comes from приложение № 5, т. 10; the ENDING comes from
   * чл. 48, ал. 3, which reaches повторна намеса на комисията and допускане на
   * ПТП and nothing else. So an опасна грешка that is neither — не спре при Б2,
   * червен сигнал — costs 10, and 10 > 9 makes the exam НЕИЗДЪРЖАН by т. 11,
   * but the drive is not stopped. Derived from the catalogue's own
   * `terminateSession` flag (today: COLLISION alone), never re-declared here.
   */
  terminatesExam: boolean;
  /** чл. 48, ал. 3 verbatim — null when this fault does not end the exam. */
  terminationQuoteBg: string | null;
  /** „Наредба № 38, чл. 48, ал. 3" — null when it does not end the exam. */
  terminationCitationBg: string | null;
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
  const terminatesExam = spec.terminateSession === true;
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
    terminatesExam,
    terminationQuoteBg: terminatesExam ? N38_TERMINATION_RULE : null,
    terminationCitationBg: terminatesExam ? N38_TERMINATION_CITATION : null,
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

// ---------------------------------------------------------------------------
// THE SENTENCES THE TWENTY COMMONEST FAULTS SHARE — cut once, quoted everywhere
// ---------------------------------------------------------------------------

/**
 * THE SHAPE OF ЧЛ. 183, AND WHY EVERY ROW UNDER IT NEEDS TWO QUOTES.
 *
 * The article prices by ALINEA and describes by ТОЧКА. „Наказва се с глоба 100
 * лв. водач, който:" is the whole of the money and none of the conduct;
 * „навлиза… в забранената посока на еднопосочен път;" is the whole of the
 * conduct and none of the money. A row that cites only the first has PROVED an
 * amount and merely ASSERTED which offence earns it — and that assertion is the
 * one thing worth checking, because it is where a wrong mapping hides.
 *
 * The founder's own measurement is what makes this structural rather than
 * fussy: чл. 182, ал. 1, т. 3 and ал. 2, т. 3 are word-identical, so a quote can
 * never say by itself which alinea it came from. Only the citation can, and a
 * citation is prose until something checks it. Hence `fine.source` (the header,
 * carrying the лв.) and `offenceQuote` (the точка, carrying the conduct) — both
 * re-cut from the act, both failing the suite on a single changed word.
 */
const F183 = (alineaBg: string, pointBg: string | null, amountBgn: number): LawQuote => ({
  actFile: "zdvp.json",
  unitRef: "чл. 183",
  citationBg: `ЗДвП чл. 183, ${alineaBg}${pointBg === null ? "" : `, ${pointBg}`}`,
  quoteBg: `Наказва се с глоба ${amountBgn} лв. водач, който:`,
});

/** A точка of чл. 183 — the conduct half, verbatim. */
const T183 = (alineaBg: string, pointBg: string, quoteBg: string): LawQuote => ({
  actFile: "zdvp.json",
  unitRef: "чл. 183",
  citationBg: `ЗДвП чл. 183, ${alineaBg}, ${pointBg}`,
  quoteBg,
});

/** ЗДвП чл. 179, ал. 1 — the 200 лв. header, шест точки under it. */
const F179_1 = (pointBg: string): LawQuote => ({
  actFile: "zdvp.json",
  unitRef: "чл. 179",
  citationBg: `ЗДвП чл. 179, ал. 1, ${pointBg}`,
  quoteBg: "Наказва се с глоба в размер 200 лв.:",
});

const T179_1 = (pointBg: string, quoteBg: string): LawQuote => ({
  actFile: "zdvp.json",
  unitRef: "чл. 179",
  citationBg: `ЗДвП чл. 179, ал. 1, ${pointBg}`,
  quoteBg,
});

/**
 * ЗДвП чл. 179, ал. 2 — the accident article, and the only sentence in this
 * file that carries its condition, its offence and its figure together. Note
 * the last clause: „ако деянието не съставлява престъпление". With an injured
 * person the case leaves ЗДвП entirely and becomes a matter for the НК.
 */
const CRASH_179_2: LawQuote = {
  actFile: "zdvp.json",
  unitRef: "чл. 179",
  citationBg: "ЗДвП чл. 179, ал. 2",
  quoteBg:
    "Който поради движение с несъобразена скорост, неспазване на дистанция, движение на заден ход или нарушение по ал. 1, както и при нарушение на чл. 20, ал. 1 причини пътнотранспортно произшествие, се наказва с глоба в размер 300 лв., ако деянието не съставлява престъпление.",
};

/** ЗДвП чл. 180, ал. 1 — the 100 лв. header. */
const F180_1 = (pointBg: string): LawQuote => ({
  actFile: "zdvp.json",
  unitRef: "чл. 180",
  citationBg: `ЗДвП чл. 180, ал. 1, ${pointBg}`,
  quoteBg: "Наказва се с глоба 100 лв. водач, който:",
});

const T180_1 = (pointBg: string, quoteBg: string): LawQuote => ({
  actFile: "zdvp.json",
  unitRef: "чл. 180",
  citationBg: `ЗДвП чл. 180, ал. 1, ${pointBg}`,
  quoteBg,
});

/** A duty — the rule broken, as opposed to the price of breaking it. */
const DUTY = (unitRef: string, citationBg: string, quoteBg: string): LawQuote => ({
  actFile: "zdvp.json",
  unitRef,
  citationBg,
  quoteBg,
});

/** A точка of the exhaustive контролни точки list, with its figure inside it. */
const CP = (pointBg: string, points: number, quoteBg: string, noteBg: string): ControlPointsFigure => ({
  status: "grounded",
  points,
  source: {
    actFile: IZ2539,
    unitRef: "чл. 6",
    citationBg: `${IZ2539_BG}, чл. 6, ал. 1, ${pointBg}`,
    quoteBg,
  },
  noteBg,
});

/**
 * THE COROBORATION FROM THE OTHER SIDE OF THE 2025 CHANGE.
 *
 * ДВ, бр. 64 от 2025 г. struck „или отнемане на контролни точки" out of ЗДвП
 * чл. 186, ал. 1 and чл. 189, ал. 4; ДВ, бр. 22 от 2026 г. rewrote the наредба
 * to match, and the consolidated чл. 2, ал. 6 now lists all three instruments
 * side by side. Both halves of the amendment say the same thing and the
 * textbooks still teach the old rule, so the card carries the наредба's own
 * sentence: точки fall by НП, by фиш AND by електронен фиш. What the instrument
 * still decides is whether a BAN is possible.
 */
const CP_TAKEN_BY_ANY_INSTRUMENT: LawQuote = {
  actFile: IZ2539,
  unitRef: "чл. 2",
  citationBg: `${IZ2539_BG}, чл. 2, ал. 6`,
  quoteBg:
    "От броя на контролните точки за отчет на извършените нарушения се отнемат точки въз основа на влезли в сила: 1. наказателно постановление, включително и в случаите по чл. 79б от Закона за административните нарушения и наказания; 2. фиш по чл. 186, ал. 1 от ЗДвП; 3. електронен фиш по чл. 189, ал. 4 от ЗДвП, включително и в случаите по чл. 189, ал. 10, т. 4 от ЗДвП.",
};

/**
 * The one exemption from the whole контролни точки system, and the one row
 * below that punches through it. A clean-record driver keeps his points —
 * EXCEPT where the offence carries лишаване от право, which is precisely the
 * emergency-lane row.
 */
const CP_CLEAN_RECORD_EXEMPTION: LawQuote = {
  actFile: IZ2539,
  unitRef: "чл. 6",
  citationBg: `${IZ2539_BG}, чл. 6, ал. 2`,
  quoteBg:
    'На водач със статут "Водач на МПС без наказания" не се отнемат контролни точки при налагане на наказание за нарушение, за което е предвидено отнемане на контролни точки, с изключение на нарушенията, за които е предвидено налагане на наказание лишаване от право да се управлява моторно превозно средство.',
};

/**
 * ЗДвП чл. 185 — the residual clause. NAMED in prose below and deliberately
 * NOT attached to any row as a figure.
 *
 * Applying it to a given fault means asserting that no other article in the act
 * prices that fault. That is a claim about a whole statute, and this file's
 * standing rule is that a negative is only as strong as the search behind it.
 * The searches are recorded at the rows that needed them (регулировчик: 13 hits
 * in ЗДвП, none of them a penalty on the driver side; дистанция: one hit in the
 * penalty chapter, чл. 179, ал. 2). What the rows do NOT do is turn either
 * search into a лв. figure, because „I could not find another" and „there is no
 * other" are different sentences and only one of them is a retrieval.
 */

// The точки of the exhaustive list this wave newly reaches. Each is quoted with
// its own figure inside it, so the number and the sentence cannot drift apart.
const CP_T6_EMERGENCY_LANE = CP(
  "т. 6",
  10,
  "за движение в лентата за принудително спиране по автомагистрала (чл. 178ж, ал. 1, предл. 1 от ЗДвП) - 10 контролни точки;",
  "Отнемат се от книжката. Тук изключението по чл. 6, ал. 2 не важи: нарушението носи лишаване от право, а точно такива нарушения са изключени от защитата на статута „Водач на МПС без наказания“.",
);

const CP_T8_EMERGENCY_LANE_REPEAT = CP(
  "т. 8",
  20,
  "когато нарушението по т. 6 и 7 е извършено повторно (чл. 178ж, ал. 2 от ЗДвП) - 20 контролни точки;",
  "Повторното нарушение взема двойно повече точки от първото — и то от книжка, която при първоначално издаване дори не е пълна.",
);

const CP_T9_OVERTAKE_DANGER = CP(
  "т. 9",
  13,
  "за неправилно изпреварване, ако от това е създадена непосредствена опасност за движението (чл. 179, ал. 1, т. 5, предл. 5 от ЗДвП) - 13 контролни точки;",
  "Списъкът стига до чл. 179, ал. 1, т. 5 само в две от предложенията ѝ — изпреварването тук и неспирането на знак „Спри!“ в т. 15. Създадената опасност вдига точките над тези за самото неправилно изпреварване.",
);

const CP_T11_RAIL = CP(
  "т. 11",
  10,
  "за нарушаване на правилата за преминаване през железопътен прелез (чл. 180, ал. 1, т. 3, предл. 2 от ЗДвП) - 10 контролни точки;",
  "Отнемат се от книжката. Предложение 2 на чл. 180, ал. 1, т. 3 е точно прелезът — предложение 1 е обособеното платно на релсовото превозно средство.",
);

/**
 * т. 16 — 10 контролни точки for an overtake that endangered NOBODY, and the
 * single most surprising figure in this wave.
 *
 * A 50 лв. фиш beside a tenth of the whole licence is not an error: the two
 * systems are set by different acts and neither reads the other. It is also the
 * one точка of the list whose ЗДвП address CHANGED under our feet — ДВ, бр. 22
 * от 2026 г. replaced „чл. 183, ал. 3, т. 6" with „чл. 183, ал. 2, т. 6",
 * because ДВ, бр. 64 от 2025 г. had repealed ал. 3 and renumbered the offence
 * into ал. 2. The 28.01.2025 snapshot in this repo still points at the repealed
 * alinea; the consolidation is what is quoted, and the marker inside the quoted
 * sentence is the act saying so itself.
 */
const CP_T16_OVERTAKE_NO_DANGER = CP(
  "т. 16",
  10,
  "за неправилно изпреварване, без да се създава опасност за движението (чл. 183, ал. 2, т. 6 от ЗДвП) - 10 контролни точки;",
  "Изненадата в целия списък: глобата е сред най-ниските, а книжката губи повече от една трета от точките, с които тръгва нов водач. Препратката сочи чл. 183, ал. 2, т. 6 след изменението от 2026 г. — по-старите разпечатки още сочат отменената ал. 3.",
);

const CP_T18_SEATBELT = CP(
  "т. 18",
  10,
  "за неизпълние на задължението за използване на предпазен колан или носене на каска (чл. 183, ал. 4, т. 7, предл. 1 от ЗДвП) - 10 контролни точки;",
  "Предложение 1 е собственият колан на водача; същата т. 7 наказва и возенето на непристегнат пътник. (Правописът „неизпълние“ е на самата наредба и е оставен непокътнат.)",
);

const CP_T20_SIGNAL = CP(
  "т. 20",
  10,
  "за преминаване при сигнал на светофара, който не разрешава преминаването (чл. 183, ал. 5, т. 1 от ЗДвП) - 10 контролни точки;",
  "Отнемат се от книжката, отделно от глобата и отделно от оценката на урока.",
);

const CP_T22_SIGNAL_REPEAT = CP(
  "т. 22",
  13,
  "когато нарушението по т. 20 или 21 е извършено повторно (чл. 183, ал. 6 от ЗДвП) - 13 контролни точки.",
  "При повторност точките растат заедно с глобата, а лишаването от право затваря пътя на фиша.",
);

/**
 * THE INSTRUMENT SENTENCE FOR THE REPEAT ROWS. Both чл. 183, ал. 6 and чл. 178ж
 * carry лишаване, so `instrumentsForBan` forecloses фиш and електронен фиш on
 * them automatically — the ban field is the only input, written once.
 */
const BAN_ONE_MONTH = "лишаване от право да управлява моторно превозно средство за срок един месец";
const BAN_THREE_MONTHS = "лишаване от право да управлява моторно превозно средство за срок от три месеца";
const BAN_SIX_MONTHS = "лишаване от право да управлява моторно превозно средство за срок от 6 месеца";

/** чл. 183, ал. 6 — повторно преминаване при забраняващ сигнал. */
const REPEAT_SIGNAL: LawQuote = {
  actFile: "zdvp.json",
  unitRef: "чл. 183",
  citationBg: "ЗДвП чл. 183, ал. 6",
  quoteBg:
    "Когато нарушението по ал. 5, т. 1 или 2 е повторно, водачът се наказва с глоба в размер 300 лв. и лишаване от право да управлява моторно превозно средство за срок един месец.",
};

/** The repeat row, written once and shared by the two signal codes. */
const SIGNAL_REPEAT_CASE: ConditionalPenalty = {
  conditionBg: "когато нарушението по ал. 5, т. 1 или 2 е повторно",
  fine: fine(300, BAN_ONE_MONTH, REPEAT_SIGNAL),
  controlPoints: CP_T22_SIGNAL_REPEAT,
};

/**
 * WHICH SIGNALS „НЕ РАЗРЕШАВАТ ПРЕМИНАВАНЕТО" — the premise under the amber and
 * the red-plus-amber rows, and the one thing on either card this repo cannot
 * check.
 *
 * ЗДвП чл. 183, ал. 5, т. 1 prices „преминава при сигнал на светофара, който не
 * разрешава преминаването" and never says which signals those are. ЗДвП чл. 12
 * gets as far as naming the three colours. The meanings live in ППЗДвП, an act
 * `content/law/acts` holds NOT ONE BYTE of (index-only, sha256 null). So the
 * article is named and the number is shown, and the sentence that says amber is
 * such a signal is named WITHOUT a number, which is the house rule for an act
 * we cannot open. The exam half is unaffected: Наредба № 38 marks the fault on
 * its own terms.
 */
const SIGNAL_MEANING_CAVEAT_BG =
  "Кои сигнали „не разрешават преминаването“ се определя от ППЗДвП — правилник, който този продукт не съдържа и затова не цитира с номер. ЗДвП чл. 12 стига дотам да изброи трите цвята. Глобата по-горе е за преминаване при забраняващ сигнал; че жълтото е такъв сигнал, го казва правилникът, не законът.";

/**
 * THE ONE RULE ABOUT НЕПОСРЕДСТВЕНА ОПАСНОСТ, WRITTEN ONCE.
 *
 * Six rows below climb to чл. 179, ал. 1, т. 5 or чл. 180, ал. 1, т. 1 „ако от
 * това е създадена непосредствена опасност". The rule engine does not establish
 * that fact — if it had, the event would have been a COLLISION — so the heavier
 * row is shown as a CONDITION and never as the price of the drive just marked.
 */
const DANGER_CONDITION_BG = "ако от нарушението е създадена непосредствена опасност за движението";
const CRASH_CONDITION_BG = "ако от нарушението настъпи пътнотранспортно произшествие";

/** чл. 179, ал. 1, т. 5 — the aggravated row six of the twenty share. */
const DANGER_179_1_5 = (noteBg: string): ConditionalPenalty => ({
  conditionBg: DANGER_CONDITION_BG,
  fine: fine(200, null, F179_1("т. 5")),
  controlPoints: notListed(noteBg),
});

/** The same row where the list DOES reach it — an overtake. */
const DANGER_179_1_5_OVERTAKE: ConditionalPenalty = {
  conditionBg: DANGER_CONDITION_BG,
  fine: fine(200, null, F179_1("т. 5")),
  controlPoints: CP_T9_OVERTAKE_DANGER,
};

/**
 * WRONG_WAY'S TWO ROADS, EACH PRICED AS ITS OWN OFFENCE — w12,
 * `sc-merge-accel-lane:93685d58`, 2026-08-27.
 *
 * WHAT WAS ON THE GLASS. In «Включване в магистрала през лентата за ускоряване»
 * — district `mw-entry-v1`, which contains no street at all — the card carried
 * the motorway TITLE the previous repair had landed, and underneath it the
 * one-way street's entire money apparatus: «Глоба: 51,13 € (100 лв.)»,
 * «Книжка: 0 контролни точки — не е в списъка», «Съставът: „…се движи в
 * забранената посока на еднопосочен път."». The real article — чл. 178ж, ал. 1,
 * 1000 лв., three months of лишаване, 15 контролни точки — was printed below
 * all of that, under `FaultCard`'s «Ако от това излезе беля» header, i.e. as
 * something that happens only IF harm follows. A seventeen-year-old was being
 * told that driving against the traffic on a motorway costs a hundred лева and
 * nothing at all off his licence.
 *
 * WHY THE FIGURES COULD NOT SIMPLY BE SWAPPED. `roadConsequenceFor` is keyed by
 * `ViolationCode` and by nothing else, and ONE code grades both acts: Наредба
 * № 38, прил. № 5, т. 10, б. „в" reads „пътен възел ИЛИ път с еднопосочно
 * движение", so one clause, one severity and one mark cover a street and a
 * motorway carriageway alike. The road the student is on travels on the event
 * as `detail` and reaches the TITLE (`catalog.ts WRONG_WAY_ROAD_COPY`), but the
 * two surfaces that print the PRICE call `roadConsequenceFor(event.code)` with
 * the code alone — `hud/FaultCard.tsx` and `lessons/debrief.ts`, neither of
 * them this module's file to edit.
 *
 * SO THE ROW STOPPED CLAIMING A PRICE IT DOES NOT HAVE. This file's standing
 * rule for a figure whose precondition the printing seam has not established is
 * to show the figure WITH ITS CONDITION ATTACHED (see the `ConditionalPenalty`
 * docblock). Here the condition is the ROAD. Both prices are therefore branches
 * of one `conditional` row — a shape BOTH live surfaces already render:
 * `FaultCard` prints branches under the neutral header «Кога все пак се плаща»,
 * which is the second half of this finding (чл. 178ж stops being filed under
 * harm), and `debrief.ts roadLines` prints them through `gatedLineBg`. Neither
 * surface can now name a лв. figure that is false for the road he was on.
 *
 * WHY NOT A SECOND `ViolationCode`. Because the exam half is genuinely one
 * fault: the clause, the class and the 10 изпитни точки are identical on both
 * roads, and splitting the code to make a lookup convenient would put a second
 * row in the Наредба № 38 taxonomy that the наредба does not have. What differs
 * is the ЗДвП offence, and that is what moved.
 *
 * WHAT REMAINS ROUTED, and it is smaller than what it replaces:
 *  · a surface that KNOWS the road could print ONE crisp figure instead of two
 *    conditioned ones. That needs `roadConsequenceFor(code, detail)` plus the
 *    two call sites above passing `event.detail`; the registry it would read is
 *    one literal beside this constant. Reported with the exact lines rather than
 *    landed half — an optional parameter no caller passes is not a repair, and
 *    the conditional row is CORRECT on both roads without it.
 *  · `fine.banBg` reaches the glass ONLY through the speeding ladder
 *    (`FaultCard` tier rows; `debrief` rung list). `moneyBg` and `gatedLineBg`
 *    both drop it, so a три-месечно лишаване attached to any `single` row or to
 *    any branch is invisible today. That is why the three months is ALSO said in
 *    words in `headlineBg` below — the same workaround the previous `noteBg`
 *    needed, kept because a disqualification is not a detail a student may be
 *    left to infer.
 */
const WRONG_WAY_MOTORWAY_CASE: ConditionalPenalty = {
  conditionBg:
    "когато обратната посока е платното за насрещно движение по автомагистрала или скоростен път",
  fine: fine(1000, BAN_THREE_MONTHS, {
    actFile: "zdvp.json",
    unitRef: "чл. 178ж",
    citationBg: "ЗДвП чл. 178ж, ал. 1",
    quoteBg:
      "Наказва се с лишаване от право да управлява моторно превозно средство за срок от три месеца и глоба 1000 лв. водач, който се движи в лентата за принудително спиране по автомагистрала, без да са налице изключенията по чл. 58, т. 3 или в платното за насрещно движение по автомагистрала и скоростен път.",
  }),
  controlPoints: CP(
    "т. 7",
    15,
    "за движение в платното за насрещно движение по автомагистрала и скоростен път (чл. 178ж, ал. 1, предл. 2 от ЗДвП) - 15 контролни точки;",
    "Тук изчерпателният списък по чл. 6, ал. 1 стига — и стига високо: 15 контролни точки наведнъж, от книжка, която при първоначално издаване не е и пълна. Забележи, че т. 7 е ВТОРОТО предложение на чл. 178ж, ал. 1: първото е аварийната лента, а това е насрещното платно.",
  ),
};

/**
 * THE OTHER ROAD, AND WHY IT IS A BRANCH AND NOT THE HEADLINE.
 *
 * „Глоба 100 лв." is a true sentence about a one-way street and a false one
 * about a motorway act, and one code bills both, so the street figure printed
 * flat is exactly the defect above with the roads exchanged. It keeps every
 * number, every citation and every word it had as the row's ungated price; all
 * that moved is that the road it is true of now stands in front of it.
 *
 * THE CONDITION CARRIES THE CONDUCT because `conditional` has no `offenceQuote`
 * slot, and the `Съставът:` line the shape drops was the third string this
 * finding names. It is deliberately NOT wrapped in „…": it paraphrases чл. 183,
 * ал. 4, т. 15 in the точка's own vocabulary, and this file does not put
 * quotation marks around a sentence it has not cut from an act.
 */
const WRONG_WAY_STREET_CASE: ConditionalPenalty = {
  conditionBg:
    "когато си навлязъл след знак, забраняващ влизането, или си се движил в забранената посока на еднопосочен път",
  fine: fine(100, null, F183("ал. 4", "т. 15", 100)),
  controlPoints: notListed(
    "Чл. 183, ал. 4, т. 15 не е сред двадесет и двете нарушения в чл. 6, ал. 1 — а списъкът е изчерпателен. Глоба има, книжката остава непокътната.",
  ),
};

/** чл. 179, ал. 2 — the crash row. Never in the exhaustive list. */
const CRASH_CASE: ConditionalPenalty = {
  conditionBg: CRASH_CONDITION_BG,
  fine: fine(300, null, CRASH_179_2),
  controlPoints: notListed(
    "Самото причиняване на произшествие по чл. 179, ал. 2 не е сред нарушенията в чл. 6, ал. 1 — точки падат за нарушението, довело до него, ако то е в списъка.",
  ),
};

// ---------------------------------------------------------------------------
// THE MANOEUVRE AND JUDGEMENT ROWS — where „nothing" is the retrieved answer
// ---------------------------------------------------------------------------

/**
 * TWENTY-EIGHT CODES THAT ARE NOT LIKE THE ONES ABOVE, AND THE DIFFERENCE IS
 * THE WHOLE WORK.
 *
 * The rows this file started with are road offences with a price tag: run a
 * red, miss a pedestrian crossing, drive 30 over. Most of the codes in THIS
 * block are not. A stalled engine, three seconds of hesitation on green, the
 * pre-drive checklist in the wrong order — Наредба № 38 marks them because an
 * examiner is watching, and no article of ЗДвП touches them at all, because no
 * such article exists.
 *
 * THE TEMPTATION HERE IS TO FILL THE COLUMN. Every row wants a number: the
 * card looks unfinished without one, and there is always some general duty
 * loose enough to hang a fine on. That is exactly how „50 метра" for railway
 * crossings shipped marked approved. So the rule for this block is the
 * founder's — retrieve first, and where the retrieval says nothing, SAY
 * NOTHING, out loud, as a finding, with the exam half cited so the student
 * still learns what the mistake costs him. Seven rows below say precisely
 * „това ти струва точки на изпита и нищо на пътя", and that is a complete
 * answer, not an unfinished one.
 *
 * WHAT THE RETRIEVAL FOUND FOR THE TWO ROWS THAT LOOK LIKE THEY MUST CARRY A
 * FINE, since the brief flagged both as the place where a guess would be most
 * tempting:
 *
 *   HIGH_BEAM_NOT_DIPPED breaks a real, explicit, named ban — ЗДвП чл. 70,
 *   ал. 2, т. 3 forbids long beams behind another vehicle in so many words.
 *
 *   FOG_LIGHTS_OFF_IN_FOG breaks NO ban at all. чл. 74, ал. 1 is a PERMISSION
 *   with a limit („може да се използват само при значително намалена
 *   видимост") and never a duty. Nothing in ЗДвП requires front fog lamps, so
 *   a fine sold under чл. 74 would be invented. What IS breakable is the other
 *   thing: driving in reduced visibility with no lights at all, чл. 70, ал. 1.
 *
 * Both then land on the same gate — чл. 180, ал. 1, т. 1 prices light-rule
 * breaches at 100 лв. only „когато в резултат на нарушението е създадена
 * непосредствена опасност за движението" — so both are `conditional` and the
 * figure never leaves its condition.
 *
 * AND ONE ROW THAT IS NOT A JUDGEMENT AT ALL. VULNERABLE_PASS_TOO_CLOSE has
 * real statutory weight and it is not in the money: чл. 183, ал. 2, т. 6 is
 * 50 лв., and Наредба № Iз-2539 чл. 6, ал. 1, т. 16 takes TEN контролни точки
 * for the same act — more than a third of the 26 a new licence starts with.
 * The catalogue's authored sentence for this code quoted the 50 лв. and stopped
 * there, which understates the real consequence by an order of magnitude.
 *
 * ЧЛ. 185 IS NAMED AND NEVER PRICED, following the ruling written above this
 * block: attaching the residual clause to a row asserts that no other article
 * in the act prices that fault, and „I could not find another" is not a
 * retrieval. Three rows here would otherwise have taken a 50 лв. figure from
 * it. They name the clause in prose, with no number, and stop.
 */

/**
 * THE CANONICAL BLANK, hoisted out of `UNKNOWN_ROAD` so a row with a NAMED
 * reason can open with the same words. Two surfaces assert on its first clause
 * (`hud/__tests__/fault-card.test.tsx`, `lessons/__tests__/debrief.test.ts`),
 * and beyond the tests an honest blank should read the same wherever it
 * appears — the extra sentence says which act is missing, not a different
 * apology.
 */
const UNKNOWN_ROAD_RULE_BG =
  "Санкцията на пътя за това нарушение още не е извлечена дословно от закона, затова тук няма число — по-добре празно, отколкото сгрешено. Общото правило: глобата се налага с фиш, когато за нарушението не е предвидено лишаване от право (ЗДвП чл. 186, ал. 1); ако е установено и заснето с автоматизирано техническо средство — с електронен фиш (ЗДвП чл. 189, ал. 4); а контролни точки се отнемат само за нарушенията, изброени в чл. 6, ал. 1 от Наредба № Iз-2539.";

// --- the duties these rows break, verbatim ---------------------------------

const D_MARKING_BINDS = DUTY(
  "чл. 6",
  "ЗДвП чл. 6, т. 1",
  "съобразяват своето поведение със сигналите на длъжностните лица, упълномощени да регулират или да контролират движението по пътищата, както и със светлинните сигнали, с пътните знаци и с пътната маркировка;",
);
const D_KEEP_RIGHT = DUTY(
  "чл. 15",
  "ЗДвП чл. 15, ал. 1",
  "На пътя водачът на пътно превозно средство се движи възможно най-вдясно по платното за движение, а когато пътните ленти са очертани с пътна маркировка, използва най-дясната свободна лента.",
);
const D_NO_ONCOMING_LANE = DUTY(
  "чл. 16",
  "ЗДвП чл. 16, ал. 1, т. 1",
  "когато платното за движение има две пътни ленти - да навлиза и да се движи в лентата за насрещно движение освен при изпреварване или заобикаляне;",
);
const D_CONTINUOUS_CONTROL = DUTY(
  "чл. 20",
  "ЗДвП чл. 20, ал. 1",
  "Водачите са длъжни да контролират непрекъснато пътните превозни средства, които управляват.",
);
const D_SPEED_FOR_CONDITIONS = DUTY(
  "чл. 20",
  "ЗДвП чл. 20, ал. 2",
  "Водачите на пътни превозни средства са длъжни при избиране скоростта на движението да се съобразяват с атмосферните условия, с релефа на местността, със състоянието на пътя и на превозното средство, с превозвания товар, с характера и интензивността на движението, с конкретните условия на видимост, за да бъдат в състояние да спрат пред всяко предвидимо препятствие.",
);
const D_NOT_TOO_SLOW = DUTY(
  "чл. 22",
  "ЗДвП чл. 22, ал. 1",
  "Водачът на пътно превозно средство не трябва да се движи без основателна причина с твърде ниска скорост, когато по този начин пречи на движението на другите пътни превозни средства.",
);
/**
 * The half of чл. 22 a student can actually DO something about, and the reason
 * DRIVING_TOO_SLOW_IN_TOWN is teachable rather than a scolding: the law never
 * orders him to drive faster than he can manage — it orders him to let the
 * queue he created go past. Same unit as `D_NOT_TOO_SLOW`, next alinea.
 */
const D_LET_QUEUE_PAST = DUTY(
  "чл. 22",
  "ЗДвП чл. 22, ал. 2",
  "Водач на пътно превозно средство, което се движи с ниска скорост и поради това причинява създаването на колона от пътни превозни средства, трябва да ги пропусне при първа възможност.",
);
/**
 * The duty behind STOPPED_WITHOUT_CAUSE, and the reason that row does NOT reuse
 * `D_NOT_TOO_SLOW`: чл. 22 speaks of a driver who „се движи", and the act this
 * prices is a car that has stopped. чл. 24, ал. 2 is the article about the
 * deceleration itself, and „затрудни излишно тяхното движение" is the wording a
 * учебен разбор can hand a student unchanged.
 */
const D_NO_NEEDLESS_HINDRANCE = DUTY(
  "чл. 24",
  "ЗДвП чл. 24, ал. 2",
  "Преди да намали значително скоростта на движение на управляваното от него пътно превозно средство, водачът е длъжен да се убеди, че няма да създаде опасност за останалите участници в движението и че няма да затрудни излишно тяхното движение.",
);
const D_FOLLOWING_DISTANCE = DUTY(
  "чл. 23",
  "ЗДвП чл. 23, ал. 1",
  "Водачът на пътно превозно средство е длъжен да се движи на такова разстояние от движещото се пред него друго превозно средство, че да може да спре зад него, когато то намали скоростта или спре рязко.",
);
const D_CHECK_BEFORE_MANOEUVRE = DUTY(
  "чл. 25",
  "ЗДвП чл. 25, ал. 1",
  "преди да започне маневрата, трябва да се убеди, че няма да създаде опасност за участниците в движението, които се движат след него, преди него или минават покрай него",
);
/** ЗДвП чл. 101, ал. 1 — the duty a lit RED telltale puts on the driver. */
const D_STOP_ON_FAULT = DUTY(
  "чл. 101",
  "ЗДвП чл. 101, ал. 1",
  "При възникване по време на движение на повреда или неизправност в пътно превозно средство, която застрашава безопасността на движението, водачът е длъжен да спре и да вземе мерки за нейното отстраняване.",
);
const D_SIGNAL = DUTY(
  "чл. 28",
  "ЗДвП чл. 28, ал. 1",
  "За предупреждаване на останалите участници в движението за намерението си да извърши маневра водачът на пътно превозно средство подава следните сигнали:",
);
const D_OVERTAKE_RETURN = DUTY(
  "чл. 42",
  "ЗДвП чл. 42, ал. 1, т. 2",
  "може да заеме място в пътната лента пред изпреварваното пътно превозно средство, без да го принуждава да намалява скоростта или да изменя посоката на движение.",
);
const D_OVERTAKE_SIDE_GAP = DUTY(
  "чл. 42",
  "ЗДвП чл. 42, ал. 2, т. 1",
  "по време на изпреварването да осигури достатъчно странично разстояние между своето и изпреварваното пътно превозно средство;",
);
const D_JUNCTION_APPROACH = DUTY(
  "чл. 47",
  "ЗДвП чл. 47",
  "Водач на пътно превозно средство, приближаващо се към кръстовище, трябва да се движи с такава скорост, че при необходимост да може да спре и да пропусне участниците в движението, които имат предимство.",
);
/**
 * NOT A MINIMUM SPEED, and this is the row where everybody assumes there is
 * one. The 70 km/h is a condition on the VEHICLE's construction, not on how
 * fast you may drive.
 */
const D_MOTORWAY_VEHICLE = DUTY(
  "чл. 55",
  "ЗДвП чл. 55, ал. 1",
  "е разрешено движението само на моторни превозни средства или състав от пътни превозни средства, чиято конструктивна максимална скорост надвишава 70 km/h.",
);
const D_LIGHTS_ON = DUTY(
  "чл. 70",
  "ЗДвП чл. 70, ал. 1",
  "При движение през нощта и при намалена видимост моторните превозни средства и трамваите трябва да бъдат с включени къси или дълги светлини, габаритни светлини и светлина за осветяване на задната табела с регистрационния номер.",
);
/**
 * THE BAN THAT REALLY IS A BAN. Note „по- малко" — a broken hyphenation the
 * Държавен вестник text carries and our copy therefore carries too. Repairing
 * it would make the sentence unfindable in the file it claims to come from,
 * and the re-cut test would say so.
 */
const D_DIP_HIGH_BEAM = DUTY(
  "чл. 70",
  "ЗДвП чл. 70, ал. 2, т. 3",
  "при движение зад друго моторно превозно средство на разстояние, по- малко от 50 метра.",
);
/** THE PERMISSION THAT IS NOT A DUTY — the trap, answered by reading it. */
const D_FOG_LAMPS_PERMITTED = DUTY(
  "чл. 74",
  "ЗДвП чл. 74, ал. 1",
  "Допълнителни светлини за мъгла може да се използват само при значително намалена видимост поради мъгла, снеговалеж, дъжд или други подобни условия. Тези светлини не може да се използват самостоятелно.",
);
const D_SEATBELT = DUTY(
  "чл. 137а",
  "ЗДвП чл. 137а, ал. 1",
  "Водачите и пътниците в моторни превозни средства от категории M1, M2, M3 и N1, N2 и N3, когато са в движение, използват обезопасителните колани, с които моторните превозни средства са оборудвани.",
);

// --- the offence points these rows are charged under ------------------------

const T_NO_SIGNAL = T183("ал. 2", "т. 7", "не подаде сигнал преди извършването на маневра.");
const T_PLACEMENT = T183(
  "ал. 2",
  "т. 2",
  "нарушава правилата за разположение на пътно превозно средство върху платното за движение;",
);
const T_BAD_OVERTAKE = T183("ал. 2", "т. 6", "при неправилно изпреварване не създава опасност за движението;");
const T_SEATBELT = T183(
  "ал. 4",
  "т. 7",
  "не изпълнява задължението за използване на предпазен колан или носене на каска",
);
/**
 * ЗДвП чл. 183, ал. 4, т. 14 — one точка, four offences, three of which this
 * block is charged under. Quoted from „неправилно се включва" onward: the
 * sentence opens with the Б2 sign in straight double quotes (that half belongs
 * to STOP_SIGN_NO_FULL_STOP, which already has its own row), and the fragment
 * below is the part these manoeuvre codes actually fall in.
 */
const T_MERGE_LANE_PRIORITY = T183(
  "ал. 4",
  "т. 14",
  "неправилно се включва в движението, неправилно се престроява или не спазва предимството на друг участник в движението;",
);
const T_LIGHTS_DANGER = T180_1(
  "т. 1",
  "наруши правилата за използване светлините на пътно превозно средство, за престой или за паркиране, за използване на пътното платно, когато в резултат на нарушението е създадена непосредствена опасност за движението;",
);

// --- why each 0 is a finding, worded per row --------------------------------

const CP_NOT_LISTED_SIGNAL = notListed(
  "Чл. 183, ал. 2, т. 7 (неподаден сигнал) не е сред нарушенията, изброени в чл. 6, ал. 1 — а списъкът е изчерпателен. Глоба има, контролни точки не падат.",
);
const CP_NOT_LISTED_PLACEMENT = notListed(
  "Чл. 183, ал. 2, т. 2 (разположение върху платното) не е сред нарушенията, изброени в чл. 6, ал. 1 — а списъкът е изчерпателен. Глоба има, контролни точки не падат.",
);
const CP_NOT_LISTED_T14 = notListed(
  "Чл. 183, ал. 4, т. 14 не фигурира в изчерпателния списък по чл. 6, ал. 1: нито едно от четирите деяния в тази точка не носи контролни точки. За сравнение съседната т. 7 от същата алинея — коланът — носи 10.",
);
const CP_NOT_LISTED_MARKING_DANGER =
  "От петте предложения на чл. 179, ал. 1, т. 5 наредбата взима само две: изпреварването (т. 9 — 13 к.т.) и неспирането на знак „Спри!“ (т. 15 — 10 к.т.). Неспазването на знак или маркировка извън тези два случая не е в списъка, затова тук точки не падат.";
const CP_NOT_LISTED_LIGHTS = notListed(
  "Чл. 180, ал. 1, т. 1 (правилата за светлините) не е сред нарушенията по чл. 6, ал. 1. От целия чл. 180 списъкът стига само до т. 3, предл. 2 — железопътния прелез.",
);

/**
 * THE UNGATED LICENCE ANSWER for a fault the exhaustive list never names.
 * Kept OUT of the branches on purpose: „0 контролни точки" is true today, with
 * no ПТП and no непосредствена опасност needed to make it true, and printing it
 * only beside a condition would read as „нула, докато нищо не се случи".
 */
const CP_NONE_NO_OFFENCE = notListed(
  "Тук няма какво да падне. Чл. 6, ал. 1 изброява нарушения, а за това деяние ЗДвП не предвижда състав — и нулата важи ДНЕС, не „ако нищо не се случи“.",
);
const CP_NONE_SPEED_DISTANCE = notListed(
  "Нито несъобразената скорост, нито неспазената дистанция са сред двадесет и двете нарушения по чл. 6, ал. 1 — списъкът е изчерпателен. Книжката не страда от самото каране; страда от това, което може да излезе от него.",
);

/** ЗДвП чл. 180, ал. 1, т. 1 — 100 лв., and only on непосредствена опасност. */
const LIGHTS_DANGER_CASE: ConditionalPenalty = {
  conditionBg: DANGER_CONDITION_BG,
  fine: fine(100, null, F180_1("т. 1")),
  controlPoints: CP_NOT_LISTED_LIGHTS,
};

/** ЗДвП чл. 183, ал. 4, т. 14 — 100 лв. when the missed look costs a priority. */
const PRIORITY_NOT_GIVEN_CASE: ConditionalPenalty = {
  conditionBg: "когато от непълното оглеждане водачът „не спазва предимството на друг участник в движението“",
  fine: fine(100, null, F183("ал. 4", "т. 14", 100)),
  controlPoints: CP_NOT_LISTED_T14,
};

// --- Наредба № 38, the exam half of an „exam-only" row ----------------------

/**
 * The clause a code is charged under, as a citable quote rather than a bare
 * string. DERIVED from `N38_BASIS`, so an exam-only row cannot claim a clause
 * the classification table does not give it, and an amendment that moves the
 * clause moves the citation with it.
 */
function n38ClauseSource(code: ViolationCode): LawQuote {
  const clause = N38_BASIS[code].clause;
  return {
    actFile: "naredba-38.json",
    unitRef: N38_UNIT_REF,
    citationBg: `Наредба № 38 приложение № 5, т. 10, б. „${clause}“`,
    quoteBg: N38_CLAUSE_QUOTE[clause],
  };
}

/** „Струва ти точки на изпита и нищо на пътя" — the whole shape in one call. */
function examOnly(
  code: ViolationCode,
  headlineBg: string,
  whyBg: string,
  duties: readonly LawQuote[] = [],
): RoadConsequence {
  return { kind: "exam-only", headlineBg, examSource: n38ClauseSource(code), duties, whyBg };
}

/**
 * THE TWENTY-EIGHT. Spread into `ROAD_CONSEQUENCES` below rather than written
 * inside it, because a second lane is filling the same map from the same brief
 * on the same afternoon, and two blocks merge where one object literal
 * collides. Everything above this point — `F183`, `T183`, `DUTY`, `CP`,
 * `DANGER_179_1_5`, `CRASH_CASE`, `CP_T16_OVERTAKE_NO_DANGER`,
 * `CP_T18_SEATBELT` — is that lane's work, reused rather than rebuilt.
 */
const MANOEUVRE_AND_JUDGEMENT_ROADS: Partial<Record<ViolationCode, RoadConsequence>> = {
  // === Signals — the cheapest offence in the act ============================
  TURN_WITHOUT_INDICATOR: {
    kind: "single",
    offenceBg: "неподаден сигнал преди маневра",
    offenceQuote: T_NO_SIGNAL,
    duties: [D_SIGNAL],
    fine: fine(50, null, F183("ал. 2", "т. 7", 50)),
    controlPoints: CP_NOT_LISTED_SIGNAL,
    noteBg:
      "Законът не различава мигача при завой от мигача при престрояване — една и съща точка, една и съща глоба. Евтино за грешка, която редовно завършва с удар отзад.",
  },
  LANE_CHANGE_WITHOUT_INDICATOR: {
    kind: "single",
    offenceBg: "неподаден сигнал преди престрояване",
    offenceQuote: T_NO_SIGNAL,
    duties: [D_SIGNAL],
    fine: fine(50, null, F183("ал. 2", "т. 7", 50)),
    controlPoints: CP_NOT_LISTED_SIGNAL,
    noteBg: "Същата точка и същата глоба както при завой без мигач: чл. 183, ал. 2, т. 7 говори за „маневра“ изобщо.",
  },

  // === Manoeuvres the act prices as престрояване / включване в движението ===
  LANE_CHANGE_WITHOUT_MIRROR_CHECK: {
    kind: "single",
    offenceBg: "неправилно престрояване",
    offenceQuote: T_MERGE_LANE_PRIORITY,
    duties: [D_CHECK_BEFORE_MANOEUVRE],
    fine: fine(100, null, F183("ал. 4", "т. 14", 100)),
    controlPoints: CP_NOT_LISTED_T14,
    escalation: [DANGER_179_1_5(CP_NOT_LISTED_MARKING_DANGER)],
    noteBg:
      "Двойно повече от мигача, и логиката е ясна: непогледнатото огледало Е маневрата, мигачът е само съобщението за нея.",
  },
  MOVE_OFF_WITHOUT_OBSERVATION: {
    kind: "single",
    offenceBg: "неправилно включване в движението",
    offenceQuote: T_MERGE_LANE_PRIORITY,
    duties: [D_CHECK_BEFORE_MANOEUVRE],
    fine: fine(100, null, F183("ал. 4", "т. 14", 100)),
    controlPoints: CP_NOT_LISTED_T14,
    escalation: [DANGER_179_1_5(CP_NOT_LISTED_MARKING_DANGER)],
    noteBg:
      "„Неправилно се включва в движението“ е точно потеглянето от място без оглеждане — чл. 25, ал. 1 изброява именно него сред маневрите, за които водачът е длъжен да се убеди.",
  },
  WRONG_LANE_FOR_DIRECTION: {
    kind: "single",
    offenceBg: "неправилно престрояване — завой от лента с друга стрелка",
    offenceQuote: T_MERGE_LANE_PRIORITY,
    duties: [D_MARKING_BINDS],
    fine: fine(100, null, F183("ал. 4", "т. 14", 100)),
    controlPoints: CP_NOT_LISTED_T14,
    escalation: [DANGER_179_1_5(CP_NOT_LISTED_MARKING_DANGER)],
    noteBg:
      "Пише се като неправилно престрояване: за да завиеш оттам, си застанал не в своята лента. Ако от неспазената стрелка е създадена непосредствена опасност, съставът е друг и двойно по-скъп.",
  },

  // === The mirror check with no priced offence behind it ====================
  TURN_WITHOUT_OBSERVATION: {
    kind: "conditional",
    offenceBg: "неизпълнено задължение да се убедиш преди маневра",
    duties: [D_CHECK_BEFORE_MANOEUVRE],
    headlineBg:
      "Задължението е истинско и изрично, но собствена глоба за него в ЗДвП няма. В наказателните разпоредби (чл. 174–189) думата „маневра“ се среща на едно-единствено място — чл. 183, ал. 2, т. 7 — и то за СИГНАЛА, не за огледалото. Остава общата остатъчна клауза на закона, чл. 185, която тук се назовава без число: прилагането ѝ значи да твърдиш, че никой друг член не наказва деянието, а това е твърдение за целия закон, не извлечена от него сума. Плаща се чак когато завоят засегне някого.",
    controlPoints: CP_NONE_NO_OFFENCE,
    branches: [PRIORITY_NOT_GIVEN_CASE, DANGER_179_1_5(CP_NOT_LISTED_MARKING_DANGER)],
  },

  // === Position on the roadway — the penalty is held, the rule is not =======
  POOR_LANE_KEEPING: {
    kind: "conditional",
    offenceBg: "неправилно разположение на превозното средство върху платното за движение",
    duties: [D_KEEP_RIGHT],
    headlineBg:
      "На изпита това е грешка при всяко трайно излизане от средата на лентата. На пътя глоба има само ако разположението наистина нарушава правилата за разположение — а самите тези правила, къде минава колелото спрямо маркировката, са в ППЗДвП, който този продукт още не съдържа дословно. Затова съставът е показан, а не обещан.",
    controlPoints: CP_NOT_LISTED_PLACEMENT,
    branches: [
      {
        conditionBg: "когато водачът „нарушава правилата за разположение на пътно превозно средство върху платното за движение“",
        fine: fine(50, null, F183("ал. 2", "т. 2", 50)),
        controlPoints: CP_NOT_LISTED_PLACEMENT,
      },
    ],
  },
  CENTER_LINE_TOUCHED: {
    kind: "conditional",
    offenceBg: "неправилно разположение на превозното средство върху платното за движение",
    duties: [D_NO_ONCOMING_LANE],
    headlineBg:
      "Настъпването на осевата е грешка на изпитния лист. ЗДвП забранява да НАВЛЕЗЕШ в насрещната лента (чл. 16, ал. 1, т. 1) — това вече е друга и по-тежка грешка. Самото стъпване върху линията е въпрос на маркировката, чиито правила са в ППЗДвП, който още не е в корпуса; съставът, под който биха го написали, е показан по-долу.",
    controlPoints: CP_NOT_LISTED_PLACEMENT,
    branches: [
      {
        conditionBg: "когато водачът „нарушава правилата за разположение на пътно превозно средство върху платното за движение“",
        fine: fine(50, null, F183("ал. 2", "т. 2", 50)),
        controlPoints: CP_NOT_LISTED_PLACEMENT,
      },
    ],
  },

  // === Speed and distance: no own fine until something happens ==============
  SPEED_TOO_FAST_FOR_CONDITIONS: {
    kind: "conditional",
    offenceBg: "движение с несъобразена скорост",
    duties: [D_SPEED_FOR_CONDITIONS],
    headlineBg:
      "Несъобразената скорост няма собствена глоба в ЗДвП. В рамките на ограничението контролният орган няма какво да ти напише — на изпита обаче се брои, защото изпитващият вижда това, което камерата не измерва.",
    controlPoints: CP_NONE_SPEED_DISTANCE,
    branches: [CRASH_CASE],
  },
  SPEED_TOO_FAST_FOR_CURVE: {
    kind: "conditional",
    offenceBg: "движение с несъобразена скорост в завой",
    duties: [D_SPEED_FOR_CONDITIONS],
    headlineBg:
      "Препоръчителната скорост под знака е препоръка, не ограничение: превишаването ѝ само по себе си не е нарушение и не се глобява. Затова табелата не се пази с глоба, а със завой — сметката идва, когато излетиш от него.",
    controlPoints: CP_NONE_SPEED_DISTANCE,
    branches: [CRASH_CASE],
  },
  CLOSING_ON_LEAD_TOO_FAST: {
    kind: "conditional",
    offenceBg: "неспазване на дистанция",
    duties: [D_FOLLOWING_DISTANCE, D_SPEED_FOR_CONDITIONS],
    headlineBg:
      "Топящата се дистанция няма собствена глоба: ЗДвП изисква разстоянието (чл. 23, ал. 1), но пари се плащат чак когато от него излезе удар.",
    controlPoints: CP_NONE_SPEED_DISTANCE,
    branches: [CRASH_CASE],
  },
  FOLLOWING_TOO_CLOSE_FOR_RAIN: {
    kind: "conditional",
    offenceBg: "неспазване на дистанция при намалено сцепление",
    duties: [D_FOLLOWING_DISTANCE, D_SPEED_FOR_CONDITIONS],
    headlineBg:
      "Законът не мери дистанцията в секунди и не глобява „две вместо три“. Изискването е функционално — да можеш да спреш зад него — и се превръща в пари едва след произшествие.",
    controlPoints: CP_NONE_SPEED_DISTANCE,
    branches: [CRASH_CASE],
  },
  HARSH_BRAKING_NO_CAUSE: {
    kind: "conditional",
    offenceBg: "нарушение на задължението за непрекъснат контрол върху превозното средство",
    duties: [D_CONTINUOUS_CONTROL],
    headlineBg:
      "Рязкото спиране без причина не е самостоятелно нарушение и няма собствена глоба. На изпитния лист се брои, защото изненадва движещия се зад теб.",
    // The one row where the link is the ACT'S OWN and not ours: чл. 179, ал. 2
    // names „нарушение на чл. 20, ал. 1" by number, which is the duty above.
    controlPoints: CP_NONE_NO_OFFENCE,
    branches: [CRASH_CASE],
  },

  // === Lights: one real ban, one permission mistaken for a ban ==============
  HEADLIGHTS_OFF_IN_RAIN: {
    kind: "conditional",
    offenceBg: "нарушени правила за използване на светлините",
    duties: [D_LIGHTS_ON],
    headlineBg:
      "Задължението е истинско и изрично: при намалена видимост колата се движи с включени светлини. Глобата обаче не е автоматична — чл. 180, ал. 1, т. 1 я връзва с условие.",
    controlPoints: CP_NOT_LISTED_LIGHTS,
    branches: [LIGHTS_DANGER_CASE],
  },
  FOG_LIGHTS_OFF_IN_FOG: {
    kind: "conditional",
    offenceBg: "нарушени правила за използване на светлините",
    duties: [D_LIGHTS_ON, D_FOG_LAMPS_PERMITTED],
    headlineBg:
      "Тук трябва да се каже направо: ЗДвП НЕ изисква фарове за мъгла. Чл. 74, ал. 1 е разрешение с граница („може да се използват само при значително намалена видимост“), не задължение — затова неползването им не е нарушение на чл. 74 и глоба по този член няма. Нарушимото е другото: при намалена видимост да се движиш без включени светлини изобщо (чл. 70, ал. 1).",
    controlPoints: CP_NOT_LISTED_LIGHTS,
    branches: [LIGHTS_DANGER_CASE],
  },
  HIGH_BEAM_NOT_DIPPED: {
    kind: "conditional",
    offenceBg: "нарушени правила за използване на светлините",
    duties: [D_DIP_HIGH_BEAM],
    headlineBg:
      "За разлика от фаровете за мъгла тук забраната е изрична и поименна: дългите светлини са забранени при движение зад друга кола. Глобата пак минава през условието на чл. 180, ал. 1, т. 1 — а заслепеният отпред е тъкмо такава опасност; преценява го контролният орган, не симулаторът.",
    controlPoints: CP_NOT_LISTED_LIGHTS,
    branches: [LIGHTS_DANGER_CASE],
  },

  // === The junction scan: looking is not the offence, yielding is ===========
  JUNCTION_SCAN_INCOMPLETE: {
    kind: "conditional",
    offenceBg: "непропускане на участник с предимство",
    duties: [D_JUNCTION_APPROACH],
    headlineBg:
      "Непълното оглеждане само по себе си не е нарушение — законът не може да провери накъде си гледал. Наказва се резултатът: предимството, което не си пропуснал, защото не си видял.",
    controlPoints: CP_NONE_NO_OFFENCE,
    branches: [PRIORITY_NOT_GIVEN_CASE, DANGER_179_1_5(CP_NOT_LISTED_MARKING_DANGER)],
  },

  // === Motorway: there is no minimum speed, and that surprises people =======
  DRIVING_TOO_SLOW_FOR_MOTORWAY: {
    kind: "conditional",
    offenceBg: "движение без основателна причина с твърде ниска скорост, с което се пречи на другите",
    duties: [D_NOT_TOO_SLOW, D_MOTORWAY_VEHICLE],
    headlineBg:
      "Обща задължителна минимална скорост в България НЯМА. 70 km/h в чл. 55, ал. 1 е изискване към КОНСТРУКЦИЯТА на автомобила, не към скоростта, с която караш. Забраненото е друго — „без основателна причина с твърде ниска скорост“, когато пречиш (чл. 22, ал. 1) — и за него законът не предвижда отделно наказание. Остава остатъчната клауза чл. 185, назована тук без число: тя се прилага само за нарушения, „за което не е предвидено друго наказание“, а това е твърдение за целия закон, не извлечена сума.",
    controlPoints: CP_NONE_NO_OFFENCE,
    branches: [],
  },
  DRIVING_TOO_SLOW_IN_TOWN: {
    // The town half of the same чл. 22 answer, and the same honest ending: the
    // duty is retrieved, and NO penalty article names it. The difference from
    // the motorway row is ал. 2 — on a street the queue behind you is the whole
    // mechanism, and the law states what to do about it in words a learner can
    // follow. Nothing is priced here because nothing in ЗДвП prices it.
    kind: "conditional",
    offenceBg: "движение без основателна причина с твърде ниска скорост, с което се пречи на другите",
    duties: [D_NOT_TOO_SLOW, D_LET_QUEUE_PAST],
    headlineBg:
      "Задължителна минимална скорост в България НЯМА и глоба точно за „караш бавно“ също няма. Забраненото е друго и е формулирано през последиците: движение „без основателна причина с твърде ниска скорост“, когато пречиш на останалите (чл. 22, ал. 1). Затова цената на това не се плаща на гише — плаща се от колоната зад теб, в изпреварването, което някой ще предприеме на неподходящо място. Задължението, което законът все пак ти вменява изрично, е по ал. 2: щом заради теб се е събрала колона, пропусни я при първа възможност.",
    controlPoints: CP_NONE_NO_OFFENCE,
    branches: [],
  },
  STOPPED_WITHOUT_CAUSE: {
    // The third row of the same honest family, and the same ending: the duty is
    // retrieved and NO penalty article names it. ЗДвП prices неправилно спиране
    // where a SIGN forbids it (В27 — that is ILLEGAL_STOP_IN_BAN_ZONE's row);
    // it prices nothing for stopping where stopping is merely pointless. So the
    // card says what the street actually charges — the car behind you — instead
    // of borrowing a figure from an article about a different act.
    kind: "conditional",
    offenceBg: "спиране в лентата за движение без причина, с което се затруднява движението на другите",
    duties: [D_NO_NEEDLESS_HINDRANCE],
    headlineBg:
      "Глоба точно за „спрях без причина“ в ЗДвП няма — санкция носи спирането там, където знак или маркировка го забраняват, а тук такъв няма. Задължението обаче е изрично и е формулирано през другите: преди да намалиш значително скоростта, трябва да се убедиш, че „няма да създадеш опасност за останалите участници в движението и че няма да затрудниш излишно тяхното движение“ (чл. 24, ал. 2). Затова цената на това се плаща не на гише, а от колата зад теб — и се плаща наведнъж, ако водачът ѝ е гледал напред една секунда по-късно от теб.",
    controlPoints: CP_NONE_NO_OFFENCE,
    branches: [],
  },

  // === Overtaking: the two rows that DO cost контролни точки ================
  OVERTAKE_RETURN_TOO_EARLY: {
    kind: "single",
    offenceBg: "неправилно изпреварване, без от това да е създадена опасност за движението",
    offenceQuote: T_BAD_OVERTAKE,
    duties: [D_OVERTAKE_RETURN],
    fine: fine(50, null, F183("ал. 2", "т. 6", 50)),
    controlPoints: CP_T16_OVERTAKE_NO_DANGER,
    escalation: [DANGER_179_1_5_OVERTAKE, CRASH_CASE],
    noteBg:
      "Глобата изглежда дребна и заблуждава: тежестта на това нарушение е в книжката, не в портфейла. Засичането на изпреварения е записано дословно в чл. 42, ал. 1, т. 2 — „без да го принуждава да намалява скоростта“.",
  },
  VULNERABLE_PASS_TOO_CLOSE: {
    kind: "single",
    offenceBg: "неправилно изпреварване, без от това да е създадена опасност за движението",
    offenceQuote: T_BAD_OVERTAKE,
    duties: [D_OVERTAKE_SIDE_GAP],
    fine: fine(50, null, F183("ал. 2", "т. 6", 50)),
    controlPoints: CP_T16_OVERTAKE_NO_DANGER,
    escalation: [DANGER_179_1_5_OVERTAKE, CRASH_CASE],
    noteBg:
      "Това не е преценка на изпитващия — тясното изпреварване на велосипедист има реална тежест в закона: 10 контролни точки от 39, а при нов водач от 26. Забележи и какво НЕ казва законът: числото 1,5 метра го няма в ЗДвП. Чл. 42, ал. 2, т. 1 изисква „достатъчно странично разстояние“, а метър и половина е това, което се учи и преподава като достатъчно.",
  },

  // === Pre-drive: the exam protocol, and the one part of it that is law =====
  PREDRIVE_SEATBELT_SKIPPED: {
    kind: "single",
    offenceBg: "неизпълнено задължение за използване на предпазен колан",
    offenceQuote: T_SEATBELT,
    duties: [D_SEATBELT],
    fine: fine(100, null, F183("ал. 4", "т. 7", 100)),
    controlPoints: CP_T18_SEATBELT,
    noteBg:
      "Единствената стъпка от подготовката преди потегляне, която е ЗАКОН, а не изпитен ритуал — и най-скъпата: глобата се знае, точките не. Същата точка наказва и возенето на непристегнат пътник.",
  },
  PREDRIVE_STEP_SKIPPED: examOnly(
    "PREDRIVE_STEP_SKIPPED",
    "Струва ти точка на изпита и нищо на пътя. Пропуснатата стъпка от подготовката не е нарушение: контролният орган не проверява реда, по който си се приготвил, а изпитващият проверява точно него.",
    "Наказателните разпоредби на ЗДвП (чл. 174–189) не съдържат състав за подготовката преди потегляне; думата „подготовка“ се среща в тях само за учебните форми за обучение на водачи. Приложение № 5 на Наредба № 38 също не изброява контролен списък — б. „б“ е едно изречение с определение. Изключението е коланът, който има свой състав и своя отделна карта.",
    [D_CONTINUOUS_CONTROL],
  ),
  PREDRIVE_WRONG_ORDER: examOnly(
    "PREDRIVE_WRONG_ORDER",
    "Струва ти точка на изпита и нищо на пътя. Няма закон, който да казва, че огледалата се нагласят след седалката — има логика, а логиката се проверява на изпита.",
    "Същото като при пропуснатата стъпка: нито ЗДвП, нито приложение № 5 на Наредба № 38 предписват ред на действията. Редът е методика на обучението, а изпитващият оценява методиката.",
    [D_CONTINUOUS_CONTROL],
  ),

  // === Pure examiner judgements — no article, because none exists ===========
  ENGINE_STALLED: examOnly(
    "ENGINE_STALLED",
    "Струва ти точка на изпита и нищо на пътя. Загасването не е нарушение — фиш за загасен двигател не съществува.",
    "В ЗДвП няма състав за загасване. Най-близкото задължение е общото — непрекъснат контрол върху превозното средство (чл. 20, ал. 1) — но то се превръща в наказание едва през чл. 179, ал. 2, тоест след причинено произшествие. Загасването на място не е такова.",
    [D_CONTINUOUS_CONTROL],
  ),
  HANDBRAKE_LEFT_ON: examOnly(
    "HANDBRAKE_LEFT_ON",
    "Струва ти точка на изпита и нищо на пътя. Движението с вдигната ръчна е грешка към колата, не към закона.",
    "В ЗДвП няма нито един член за ръчната спирачка. Съставът за технически неизправно превозно средство (чл. 179, ал. 6) съди СЪСТОЯНИЕТО на автомобила, а тук автомобилът е изправен — водачът не е свалил спирачката. Значи без глоба и без контролни точки, но с прегрели накладки.",
    [D_CONTINUOUS_CONTROL],
  ),
  HESITATION_AT_GREEN: examOnly(
    "HESITATION_AT_GREEN",
    "Струва ти точка на изпита и нищо на пътя. В България няма задължение да потеглиш на зелено — има задължение да не пречиш, докато СЕ ДВИЖИШ.",
    "Чл. 22, ал. 1 забранява движение „с твърде ниска скорост“, а спрялата кола не се движи; никой друг член не изисква тръгване. Затова колоната зад теб може да ти свири колкото иска — фиш за това няма. На изпита закъснелите действия са грешка, защото кръстовището пропуска по-малко коли за същото зелено.",
    [],
  ),
  STANDSTILL_GAP_TOO_CLOSE: examOnly(
    "STANDSTILL_GAP_TOO_CLOSE",
    "Струва ти точка на изпита и нищо на пътя. За разстоянието до спряла кола пред теб глоба не съществува.",
    "Дистанцията в чл. 23, ал. 1 е спрямо „движещото се пред него друго превозно средство“ — при спряла колона този член просто не важи, а друг за случая няма. Резервът от около два метра е техника: място за заобикаляне и застраховка срещу връщане назад по наклон.",
    [],
  ),

  // === The one honest blank in this block ===================================
  /**
   * NOT „we did not get to it" — a NAMED gap. The stop-line rule lives in
   * ППЗДвП, of which `content/law/acts` holds not one byte (index-only,
   * sha256 null), so there is nothing to quote and nothing to charge. The
   * canonical blank is reused verbatim underneath, because two surfaces test
   * for its opening words and because an honest blank should read the same
   * everywhere.
   */
  STOP_LINE_OVERSHOOT: {
    kind: "unknown",
    ruleBg:
      UNKNOWN_ROAD_RULE_BG +
      " Причината тук е конкретна и си струва да се знае: правилото за стоп-линията живее в ППЗДвП — правилника за прилагане, който е в указателя, но чийто пълен текст още не е в корпуса на този продукт. Докато не е, състав не се показва.",
  },
};

/**
 * THE GROUNDED SET — deliberately small, deliberately checkable.
 *
 * Each entry is a claim that THIS detector's act is THAT article's offence, and
 * a wrong mapping is exactly the failure mode ADR-002 exists to stop. Adding a
 * row means retrieving the article and pinning its words in the test; a code
 * with no row falls through to `UNKNOWN_ROAD`, which shows the rule and no
 * number at all.
 *
 * WHAT THE 2026-08-09 WAVE ADDED, AND THE FIGURE THAT SURPRISED EVERYONE. The
 * five original rows were the ones that happened to sit near the founder's own
 * ticket. Twenty more were retrieved for the faults a student actually meets,
 * and the licence column turned out to be the interesting one: чл. 6, ал. 1 of
 * Наредба № Iз-2539 is an EXHAUSTIVE list of twenty-two offences, and most of
 * the twenty are simply not on it. Failing to make way for an ambulance is 200
 * лв. and ZERO контролни точки. An overtake that endangered nobody is 50 лв.
 * and TEN. Those two facts next to each other are not a bug in the research —
 * they are what the two acts say, and a student who does not know it will
 * guess, badly, in exactly the direction the founder guessed.
 */
export const ROAD_CONSEQUENCES: Partial<Record<ViolationCode, RoadConsequence>> = {
  /**
   * N11 / VP-06 — 2026-09-02, with the code itself (sc-vp-telltale-red:c172d48b).
   *
   * `conditional` WITH EMPTY BRANCHES, the DRIVING_TOO_SLOW_IN_TOWN shape, and
   * the reason is a retrieval result rather than a preference: ЗДвП чл. 179,
   * ал. 6 DOES price this — but it writes its three figures IN WORDS
   * („петдесет лева“, „двеста лева“, „петстотин лева“), and this file's own
   * grounding rule is that a `fine` is honest only when its quoted sentence
   * states „N лв.". A ConditionalPenalty built on ал. 6 could not carry a
   * quote that proves its own number, so the scale is told as the act tells
   * it — in words, in the headline — instead of being re-typed as digits
   * nobody could cut back out of the act.
   *
   * THE LICENCE ANSWER IS GROUNDED, AND IT IS THE DEARER HALF: Наредба № Iz-2539
   * чл. 6, ал. 1, т. 10 lists this offence explicitly at ten points „при
   * констатирани опасни неизправности" — and a RED telltale is the dangerous
   * class by the law's own logic (чл. 101, ал. 3 withdraws even the „drive it
   * to a garage" permission of ал. 2 exactly there). The condition travels
   * inside the quoted точка, so the card cannot show the ten without it.
   */
  WARNING_LAMP_IGNORED: {
    kind: "conditional",
    offenceBg: "управление на технически неизправно пътно превозно средство",
    duties: [D_STOP_ON_FAULT],
    headlineBg:
      "Законът не оставя избор: при неизправност, която застрашава безопасността, водачът е ДЛЪЖЕН да спре (чл. 101, ал. 1) — карането нататък „до вкъщи“ вече е управление на технически неизправно ППС. ЗДвП чл. 179, ал. 6 го наказва с глоба, чийто размер се степенува от акта с думи — петдесет лева при незначителни, двеста при значителни и петстотин при опасни неизправности, — а самата класификация се прави по наредбата по чл. 147, ал. 1, не от водача на пътя. Червената лампа е точно опасната степен: затова чл. 101, ал. 3 отнема дори правото по ал. 2 да се придвижиш на собствен ход до сервиз.",
    controlPoints: CP(
      "т. 10",
      10,
      "за управление на технически неизправно пътно превозно средство при констатирани опасни неизправности (чл. 179, ал. 6, т. 3 от ЗДвП) - 10 контролни точки",
      "Десетте падат при ОПАСНИ неизправности — условието е в самата точка. При незначителна или значителна неизправност глоба има, а книжката остава непокътната.",
    ),
    branches: [],
  },
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
    // Added 2026-08-09 with the twenty: чл. 183 prices by alinea and describes
    // by точка, and until now this row proved „150 лв." while only ASSERTING
    // which conduct earns it. Same sentence the amber and red-plus-amber rows
    // stand on, which is exactly why it has to be quoted rather than trusted.
    offenceQuote: T183("ал. 5", "т. 1", "преминава при сигнал на светофара, който не разрешава преминаването;"),
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
    offenceQuote: T183("ал. 5", "т. 2", "не осигури предимство, когато преминава през пешеходна пътека."),
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
    // The точка that т. 14 actually is: FOUR offences in one sentence, of which
    // the Б2 sign is the first and „не спазва предимството" (FAILED_TO_YIELD)
    // the last. Quoting it is what stops two different codes from citing the
    // same address and meaning different halves of it without saying so.
    offenceQuote: T183(
      "ал. 4",
      "т. 14",
      'не спира на пътен знак "Спри! Пропусни движещите се по пътя с предимство!", неправилно се включва в движението, неправилно се престроява или не спазва предимството на друг участник в движението;',
    ),
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

  // -- 2026-08-09, consequences-priority wave: the twenty a student meets most
  //    where the statutory home is unambiguous. ------------------------------

  /**
   * ONE EXAM FAULT, TWO ЗДвП OFFENCES — so the price is conditioned on the
   * ROAD and never printed flat. The whole argument, the frame and what is
   * still routed are at `WRONG_WAY_MOTORWAY_CASE` above.
   */
  WRONG_WAY: {
    kind: "conditional",
    offenceBg:
      "движение в забранената посока — по еднопосочен път, след знак, забраняващ влизането, или срещу движението по автомагистрала",
    duties: [
      DUTY(
        "чл. 6",
        "ЗДвП чл. 6",
        "Участниците в движението:",
      ),
      DUTY(
        "чл. 6",
        "ЗДвП чл. 6, т. 1",
        "съобразяват своето поведение със сигналите на длъжностните лица, упълномощени да регулират или да контролират движението по пътищата, както и със светлинните сигнали, с пътните знаци и с пътната маркировка;",
      ),
      // The motorway half of the duty, so the card teaches the rule the heavy
      // branch below prices. Same two quotes the аварийна лента row stands on.
      DUTY(
        "чл. 58",
        "ЗДвП чл. 58",
        "При движение по автомагистрала на водача е забранено:",
      ),
      DUTY(
        "чл. 58",
        "ЗДвП чл. 58, т. 4",
        "да се движи в платното за насрещно движение или в лентата за принудително спиране.",
      ),
    ],
    headlineBg:
      "Колко струва това на пътя се решава от ПЪТЯ, а не от последиците — затова тук няма една сума, а две, и всяка е изписана долу с пътя си пред нея. По улица — еднопосочна или след знак „Влизането забранено“ — важи чл. 183, ал. 4, т. 15 и книжката остава непокътната. Срещу движението по автомагистрала или скоростен път е друг член и друг мащаб: ЗДвП чл. 178ж, ал. 1 — там падат и контролни точки, и самата книжка се отнема за срок от три месеца. Отделно и още по-тежко се наказва нарушението на ВРЕМЕННА забрана (ЗДвП чл. 183, ал. 7) — и там законът предвижда лишаване от право.",
    // The street first, because it is the road most students will be on; the
    // motorway SECOND and not last, because a branch after the harm row reads
    // as a sub-case of harm, which is the header this repair moved out of.
    branches: [
      WRONG_WAY_STREET_CASE,
      WRONG_WAY_MOTORWAY_CASE,
      DANGER_179_1_5(
        "И тежкият състав не е в списъка за този случай: чл. 6, ал. 1 стига до чл. 179, ал. 1, т. 5 само за изпреварване (т. 9) и за неспиране на знак „Спри!“ (т. 15). Забраненото влизане не е нито едното.",
      ),
    ],
    // `controlPoints` IS OMITTED, and that is the point of the row. The shape
    // offers this slot for „the one figure that is true unconditionally", and
    // zero контролни точки is true only on the street: printing it here would
    // put «0 контролни точки — не е в списъка» above a motorway act, which is
    // the exact sentence this finding was filed on. Each branch carries its own
    // licence answer instead — нула on the street, петнадесет on the motorway.
  },

  NOT_KEEPING_RIGHT: {
    kind: "single",
    offenceBg: "неспазване на правилата за разположение на превозното средство върху платното за движение",
    offenceQuote: T183(
      "ал. 2",
      "т. 2",
      "нарушава правилата за разположение на пътно превозно средство върху платното за движение;",
    ),
    duties: [
      DUTY(
        "чл. 15",
        "ЗДвП чл. 15, ал. 1",
        "На пътя водачът на пътно превозно средство се движи възможно най-вдясно по платното за движение, а когато пътните ленти са очертани с пътна маркировка, използва най-дясната свободна лента.",
      ),
    ],
    fine: fine(50, null, F183("ал. 2", "т. 2", 50)),
    controlPoints: notListed(
      "Не е в изчерпателния списък по чл. 6, ал. 1. Една от най-евтините глоби в закона — и въпреки това причината за голяма част от задръстванията и за изпреварванията отдясно.",
    ),
  },

  FAILED_TO_YIELD: {
    kind: "single",
    offenceBg: "неспазване на предимството на друг участник в движението",
    offenceQuote: T183(
      "ал. 4",
      "т. 14",
      'не спира на пътен знак "Спри! Пропусни движещите се по пътя с предимство!", неправилно се включва в движението, неправилно се престроява или не спазва предимството на друг участник в движението;',
    ),
    duties: [
      DUTY(
        "чл. 50",
        "ЗДвП чл. 50, ал. 1",
        "На кръстовище, на което единият от пътищата е сигнализиран като път с предимство, водачите на пътни превозни средства от другите пътища са длъжни да пропуснат пътните превозни средства, които се движат по пътя с предимство.",
      ),
    ],
    fine: fine(100, null, F183("ал. 4", "т. 14", 100)),
    controlPoints: notListed(
      "Непропускането само по себе си не е в изчерпателния списък по чл. 6, ал. 1. Списъкът стига до предимството само в един случай — неспирането на знак „Спри!“ със създадена опасност (т. 15) — и той се оценява от друга грешка.",
    ),
    escalation: [
      DANGER_179_1_5(
        "Тежкият състав също не носи точки тук: т. 15 от списъка е писана за знака „Спри!“, не за предимството изобщо.",
      ),
      CRASH_CASE,
    ],
  },

  EMERGENCY_NOT_YIELDED: {
    kind: "single",
    offenceBg:
      "неосигуряване на път за безпрепятствено преминаване на превозно средство със специален звуков и специален светлинен сигнал",
    offenceQuote: T179_1(
      "т. 6",
      "който не осигури път за безпрепятствено преминаване на превозно средство, сигнализиращо със специален звуков и специален светлинен сигнал, или на съпровожданите от него превозни средства.",
    ),
    duties: [
      DUTY(
        "чл. 104",
        "ЗДвП чл. 104, ал. 1",
        "При приближаване на моторно превозно средство със специален режим на движение водачите на останалите пътни превозни средства са длъжни да освободят достатъчно място на пътното платно, а при необходимост и да спрат, за да осигурят безпрепятствено преминаване както на сигнализиращото, така и на съпровожданите от него превозни средства.",
      ),
      DUTY(
        "чл. 91",
        "ЗДвП чл. 91, ал. 1",
        "Моторни превозни средства със специален режим на движение са автомобилите и мотоциклетите, които при движението си подават едновременно светлинен сигнал с проблясваща синя и/или червена светлина и специален звуков сигнал.",
      ),
    ],
    fine: fine(200, null, F179_1("т. 6")),
    controlPoints: notListed(
      "Най-неудобният ред в целия списък: това е опасна грешка на изпита и 200 лв. на пътя, но чл. 6, ал. 1 не го изброява — контролни точки НЕ падат. Цената тук не е в точки, а в минутите, които линейката губи.",
    ),
  },

  COLLISION: {
    kind: "single",
    offenceBg: "причиняване на пътнотранспортно произшествие",
    fine: fine(300, null, CRASH_179_2),
    duties: [
      DUTY(
        "чл. 20",
        "ЗДвП чл. 20, ал. 1",
        "Водачите са длъжни да контролират непрекъснато пътните превозни средства, които управляват.",
      ),
    ],
    controlPoints: notListed(
      "Самото произшествие не е в списъка по чл. 6, ал. 1. Точки падат за нарушението, което го е причинило — ако то е сред изброените.",
    ),
    noteBg:
      "Последните думи на текста са най-важните: „ако деянието не съставлява престъпление“. С пострадал човек случаят излиза от ЗДвП и минава в Наказателния кодекс, където мерките са от съвсем друг порядък.",
  },

  CONTROLLER_SIGNAL_VIOLATED: {
    kind: "conditional",
    offenceBg: "неизпълнение на разпореждане на лицето, упълномощено да регулира движението",
    duties: [
      DUTY(
        "чл. 6",
        "ЗДвП чл. 6",
        "Участниците в движението:",
      ),
      DUTY(
        "чл. 6",
        "ЗДвП чл. 6, т. 2",
        "изпълняват разпорежданията на лицата, упълномощени да регулират или да контролират движението по пътищата, независимо от светлинните сигнали, пътните знаци, маркировката на пътя и правилата за движение.",
      ),
      DUTY(
        "чл. 7",
        "ЗДвП чл. 7, ал. 1",
        "Когато има несъответствие между сигналите на регулировчика и светлинните сигнали или пътните знаци относно предимството, участниците в движението са длъжни да се съобразяват със сигналите на регулировчика.",
      ),
    ],
    headlineBg:
      "Тук няма число — и това е находка, а не пропуск. В ЗДвП няма наказателен състав, който да назовава регулировчика откъм ВОДАЧА: думата се среща в закона тринадесет пъти и единственият път, когато стои в санкция, тя наказва ПЕШЕХОДЕЦ (чл. 184). Чл. 179, ал. 1, т. 5 стига до знаците, маркировката и „другите средства за сигнализиране“ — а човек не е средство за сигнализиране. Остава общият остатъчен състав по чл. 185; да кажем, че се прилага той, значи да кажем, че нищо друго не се прилага, а това е преценка, не извличане.",
    branches: [],
    controlPoints: notListed(
      "Това обаче е сигурно: неизпълнението на разпореждане на регулировчик не е сред двадесет и двете нарушения в чл. 6, ал. 1, а списъкът е изчерпателен. Контролни точки не падат. На изпита обаче това е опасна грешка — най-скъпата разлика между двете системи в целия каталог.",
    ),
  },

  YELLOW_LIGHT_NOT_STOPPED: {
    kind: "single",
    offenceBg: "преминаване при сигнал на светофара, който не разрешава преминаването",
    offenceQuote: T183("ал. 5", "т. 1", "преминава при сигнал на светофара, който не разрешава преминаването;"),
    fine: fine(150, null, F183("ал. 5", "т. 1", 150)),
    controlPoints: CP_T20_SIGNAL,
    escalation: [SIGNAL_REPEAT_CASE],
    noteBg: SIGNAL_MEANING_CAVEAT_BG,
  },

  RED_YELLOW_CROSSED: {
    kind: "single",
    offenceBg: "преминаване при сигнал на светофара, който не разрешава преминаването",
    offenceQuote: T183("ал. 5", "т. 1", "преминава при сигнал на светофара, който не разрешава преминаването;"),
    fine: fine(150, null, F183("ал. 5", "т. 1", 150)),
    controlPoints: CP_T20_SIGNAL,
    escalation: [SIGNAL_REPEAT_CASE],
    noteBg: SIGNAL_MEANING_CAVEAT_BG,
  },

  OVERTAKING_AT_CROSSING: {
    kind: "single",
    offenceBg: "неправилно изпреварване, без от това да е създадена опасност за движението",
    offenceQuote: T183("ал. 2", "т. 6", "при неправилно изпреварване не създава опасност за движението;"),
    duties: [
      DUTY(
        "чл. 43",
        "ЗДвП чл. 43",
        "Изпреварването на моторни превозни средства, с изключение на мотопеди и мотоциклети без кош, е забранено:",
      ),
      DUTY(
        "чл. 43",
        "ЗДвП чл. 43, т. 6",
        "пред и върху сигнализирана пешеходна пътека.",
      ),
    ],
    fine: fine(50, null, F183("ал. 2", "т. 6", 50)),
    controlPoints: CP_T16_OVERTAKE_NO_DANGER,
    escalation: [DANGER_179_1_5_OVERTAKE],
    noteBg:
      "Прочети двете колони заедно: глобата е от най-ниските в закона, а книжката плаща толкова, колкото и за преминаване на червено. Двете системи се пишат от различни актове и нито един от тях не чете другия.",
  },

  OVERTAKING_IN_BAN_ZONE: {
    kind: "single",
    offenceBg: "неправилно изпреварване в зона със знак В24, без от това да е създадена опасност за движението",
    offenceQuote: T183("ал. 2", "т. 6", "при неправилно изпреварване не създава опасност за движението;"),
    duties: [
      DUTY(
        "чл. 6",
        "ЗДвП чл. 6",
        "Участниците в движението:",
      ),
      DUTY(
        "чл. 6",
        "ЗДвП чл. 6, т. 1",
        "съобразяват своето поведение със сигналите на длъжностните лица, упълномощени да регулират или да контролират движението по пътищата, както и със светлинните сигнали, с пътните знаци и с пътната маркировка;",
      ),
    ],
    fine: fine(50, null, F183("ал. 2", "т. 6", 50)),
    controlPoints: CP_T16_OVERTAKE_NO_DANGER,
    escalation: [DANGER_179_1_5_OVERTAKE],
    noteBg:
      "Знакът В24 стои точно там, където видимостта не стига — тоест там, където горният ред е далеч по-вероятен от долния.",
  },

  CROSSED_SOLID_LINE: {
    kind: "single",
    offenceBg: "неспазване на правилата за разположение върху платното — навлизане отвъд непрекъсната линия",
    offenceQuote: T183(
      "ал. 2",
      "т. 2",
      "нарушава правилата за разположение на пътно превозно средство върху платното за движение;",
    ),
    fine: fine(50, null, F183("ал. 2", "т. 2", 50)),
    controlPoints: notListed(
      "Самото пресичане на непрекъснатата линия не е в изчерпателния списък по чл. 6, ал. 1. Ако обаче то е било част от изпреварване, съставът вече е друг — и тогава книжката плаща.",
    ),
    escalation: [
      DANGER_179_1_5(
        "Тежкият състав по чл. 179, ал. 1, т. 5 обхваща и „пътната маркировка“, но списъкът по чл. 6, ал. 1 стига до тази точка само за изпреварване и за знака „Спри!“ — маркировката сама по себе си не носи точки.",
      ),
    ],
  },

  DRIVING_IN_BUS_LANE: {
    kind: "single",
    offenceBg: "движение по лента, сигнализирана само за превозните средства от редовните линии за обществен превоз",
    offenceQuote: T183(
      "ал. 4",
      "т. 12",
      "управлява моторно превозно средство по пътна лента, сигнализирана за движение само на пътни превозни средства от редовните линии за обществен превоз на пътници, без да има право на това;",
    ),
    duties: [
      DUTY(
        "чл. 15",
        "ЗДвП чл. 15, ал. 6",
        "Когато пътна лента е сигнализирана за движение само на превозни средства от редовните линии за обществен превоз на пътници, се забранява движението на други пътни превозни средства, с изключение на пътните превозни средства, извършващи случаен или специализиран превоз на деца и/или ученици.",
      ),
    ],
    fine: fine(100, null, F183("ал. 4", "т. 12", 100)),
    controlPoints: notListed(
      "Не е в изчерпателния списък по чл. 6, ал. 1 — глоба, но не и точки. Това е и едно от нарушенията, които камера хваща сама, така че глобата може да пристигне като електронен фиш по пощата (ЗДвП чл. 189, ал. 4).",
    ),
  },

  RAIL_CROSSING_VIOLATION: {
    kind: "single",
    offenceBg: "нарушаване на правилата за преминаване през железопътен прелез",
    offenceQuote: T180_1(
      "т. 3",
      "наруши правилата за движение по обособено платно за движение на релсово пътно превозно средство или правилата за преминаване през железопътен прелез.",
    ),
    duties: [
      DUTY(
        "чл. 51",
        "ЗДвП чл. 51, ал. 3",
        "Спирането на пътните превозни средства е задължително пред железопътен прелез, който няма бариери.",
      ),
      // THE RETRACTION, MADE USEFUL. A previous wave printed „50 метра" here and
      // shipped it marked approved; the act says 2 metres, and 1 metre from a
      // barrier. Quoting the sentence is a better fix than deleting the number:
      // the student now reads the real distances instead of nothing.
      DUTY(
        "чл. 51",
        "ЗДвП чл. 51, ал. 4",
        "Ако няма други указания, дадени с пътни знаци или с пътна маркировка, пред железопътния прелез пътните превозни средства спират на разстояние не по-малко от 2 метра преди първата релса, а когато има бариери - на 1 метър от тях.",
      ),
      DUTY(
        "чл. 52",
        "ЗДвП чл. 52",
        "На участниците в движението е забранено да преминават през железопътен прелез:",
      ),
      DUTY(
        "чл. 52",
        "ЗДвП чл. 52, т. 1",
        "при спуснати, започнали да се спускат или да се вдигат бариери, независимо дали от съответното за това устройство се подават светлинни или звукови сигнали, забраняващи навлизането в прелеза;",
      ),
      DUTY(
        "чл. 53",
        "ЗДвП чл. 53, ал. 2",
        "Водачът на пътно превозно средство не трябва да започва преминаването на железопътния прелез, ако не е предварително убеден, че няма да се наложи спиране върху релсите или на разстояние по-малко от 2 метра от тях, поради техническите особености на превозното средство, условията на движение или други предвидими причини.",
      ),
    ],
    fine: fine(100, null, F180_1("т. 3")),
    controlPoints: CP_T11_RAIL,
    noteBg:
      "Глобата е малка, цената на грешката не е: влакът не може нито да спре навреме, нито да те заобиколи. Разстоянията за спиране са в цитираните по-горе текстове — прочети ги там, а не по спомен.",
  },

  EMERGENCY_LANE_DRIVING: {
    kind: "single",
    offenceBg: "движение в лентата за принудително спиране по автомагистрала",
    duties: [
      DUTY(
        "чл. 58",
        "ЗДвП чл. 58",
        "При движение по автомагистрала на водача е забранено:",
      ),
      DUTY(
        "чл. 58",
        "ЗДвП чл. 58, т. 4",
        "да се движи в платното за насрещно движение или в лентата за принудително спиране.",
      ),
      DUTY(
        "чл. 58",
        "ЗДвП чл. 58, т. 3",
        "да спира в лентата за принудително спиране, освен при повреда на пътното превозно средство, както и при здравословни проблеми на водача или пътниците в превозното средство;",
      ),
    ],
    fine: fine(1000, BAN_THREE_MONTHS, {
      actFile: "zdvp.json",
      unitRef: "чл. 178ж",
      citationBg: "ЗДвП чл. 178ж, ал. 1",
      quoteBg:
        "Наказва се с лишаване от право да управлява моторно превозно средство за срок от три месеца и глоба 1000 лв. водач, който се движи в лентата за принудително спиране по автомагистрала, без да са налице изключенията по чл. 58, т. 3 или в платното за насрещно движение по автомагистрала и скоростен път.",
    }),
    controlPoints: CP_T6_EMERGENCY_LANE,
    escalation: [
      {
        conditionBg: "когато нарушението по ал. 1 е извършено повторно",
        fine: fine(4000, BAN_SIX_MONTHS, {
          actFile: "zdvp.json",
          unitRef: "чл. 178ж",
          citationBg: "ЗДвП чл. 178ж, ал. 2",
          quoteBg:
            "Когато нарушението по ал. 1 е извършено повторно, наказанието е лишаване от право да управлява моторно превозно средство за срок от 6 месеца и глоба 4000 лв.",
        }),
        controlPoints: CP_T8_EMERGENCY_LANE_REPEAT,
      },
    ],
    noteBg:
      "Най-скъпото нарушение в този каталог, и повечето шофьори не го знаят. Тук се събират и трите системи наведнъж: пари, точки и самата книжка. Забележи и разликата между т. 3 и т. 4 на чл. 58 — СПИРАНЕТО при повреда е разрешено, ДВИЖЕНИЕТО по лентата не е никога.",
  },

  OVERTAKE_INSUFFICIENT_GAP: {
    kind: "single",
    offenceBg: "неправилно изпреварване — навлизане в насрещната лента срещу насрещно движещо се превозно средство",
    offenceQuote: T183("ал. 2", "т. 6", "при неправилно изпреварване не създава опасност за движението;"),
    duties: [
      DUTY(
        "чл. 43",
        "ЗДвП чл. 43",
        "Изпреварването на моторни превозни средства, с изключение на мотопеди и мотоциклети без кош, е забранено:",
      ),
      DUTY(
        "чл. 43",
        "ЗДвП чл. 43, т. 4",
        "при използване на пътна лента за насрещно движение, когато изпреварващият не може да се върне безпрепятствено в напуснатата пътна лента;",
      ),
    ],
    fine: fine(50, null, F183("ал. 2", "т. 6", 50)),
    controlPoints: CP_T16_OVERTAKE_NO_DANGER,
    escalation: [DANGER_179_1_5_OVERTAKE, CRASH_CASE],
    noteBg:
      "Тази грешка се дава само когато вече си в насрещната лента срещу приближаващо превозно средство — тоест по описанието си тя сочи ВТОРИЯ ред, не първия. Симулаторът обаче не установява „непосредствена опасност“ като правен факт, затова законовите редове стоят с условията си, а не като цена на това конкретно каране.",
  },

  ILLEGAL_STOP_IN_BAN_ZONE: {
    kind: "single",
    offenceBg: "неправилен престой в зона със знак В27",
    offenceQuote: T183("ал. 2", "т. 1", "неправилно престоява или е паркирал неправилно;"),
    fine: fine(50, null, F183("ал. 2", "т. 1", 50)),
    controlPoints: notListed(
      "Не е в изчерпателния списък по чл. 6, ал. 1 — само пари. Забележи все пак чл. 186, ал. 3: фиш за неправилно паркиране може да се издаде и без да си там, като се закрепи уведомление на колата.",
    ),
    escalation: [
      {
        conditionBg: "когато в резултат на нарушението е създадена непосредствена опасност за движението",
        fine: fine(100, null, F180_1("т. 1")),
        controlPoints: notListed(
          "И тежкият състав не е в списъка: чл. 180, ал. 1 попада там само с т. 3 (прелезът), не с т. 1.",
        ),
      },
    ],
  },

  SEATBELT_OFF_WHILE_MOVING: {
    kind: "single",
    offenceBg: "неизпълнение на задължението за използване на предпазен колан",
    offenceQuote: T183(
      "ал. 4",
      "т. 7",
      "не изпълнява задължението за използване на предпазен колан или носене на каска или превозва пътник, който не изпълнява задължението за използване на предпазен колан или носене на каска;",
    ),
    duties: [
      DUTY(
        "чл. 137а",
        "ЗДвП чл. 137а, ал. 1",
        "Водачите и пътниците в моторни превозни средства от категории M1, M2, M3 и N1, N2 и N3, когато са в движение, използват обезопасителните колани, с които моторните превозни средства са оборудвани.",
      ),
    ],
    fine: fine(100, null, F183("ал. 4", "т. 7", 100)),
    controlPoints: CP_T18_SEATBELT,
    noteBg:
      "Едно от малкото нарушения, които камера установява сама — глобата може да дойде като електронен фиш (ЗДвП чл. 189, ал. 4). И точките падат с него: това е промяната от 2025 – 2026 г., която учебниците още не са догонили.",
  },

  HEADLIGHTS_OFF_AT_NIGHT: {
    kind: "conditional",
    offenceBg: "движение през нощта без включени светлини",
    duties: [
      DUTY(
        "чл. 70",
        "ЗДвП чл. 70, ал. 1",
        "При движение през нощта и при намалена видимост моторните превозни средства и трамваите трябва да бъдат с включени къси или дълги светлини, габаритни светлини и светлина за осветяване на задната табела с регистрационния номер.",
      ),
    ],
    headlineBg:
      "Задължението е безусловно, санкцията не е. Единственият състав в закона, който назовава светлините, е чл. 180, ал. 1, т. 1 — и той се задейства САМО когато от нарушението е създадена непосредствена опасност за движението. Без такава опасност законът, който този продукт съдържа, не поставя цена. Това не прави карането без светлини по-безопасно — прави го само по-евтино, докато нищо не се е случило.",
    branches: [
      {
        conditionBg: "когато в резултат на нарушението е създадена непосредствена опасност за движението",
        fine: fine(100, null, F180_1("т. 1")),
        controlPoints: notListed(
          "Чл. 180, ал. 1 присъства в списъка по чл. 6, ал. 1 само с т. 3 (железопътният прелез). Светлините не носят контролни точки.",
        ),
      },
    ],
    controlPoints: notListed(
      "Каквото и да се случи с глобата, книжката не участва: нарушението не е сред изброените в чл. 6, ал. 1.",
    ),
  },

  FOLLOWING_TOO_CLOSE: {
    kind: "conditional",
    offenceBg: "неспазване на дистанция",
    duties: [
      DUTY(
        "чл. 23",
        "ЗДвП чл. 23, ал. 1",
        "Водачът на пътно превозно средство е длъжен да се движи на такова разстояние от движещото се пред него друго превозно средство, че да може да спре зад него, когато то намали скоростта или спре рязко.",
      ),
    ],
    headlineBg:
      "Дистанцията няма собствен наказателен състав. Думата „дистанция“ се среща в наказателната част на ЗДвП точно веднъж — в чл. 179, ал. 2, и то след като вече има произшествие. Дотогава е безплатна; след това е скъпа. Това е и най-честата причина за верижни удари в градско движение.",
    branches: [CRASH_CASE],
    controlPoints: notListed(
      "Неспазването на дистанция не е сред двадесет и двете нарушения в чл. 6, ал. 1 — контролни точки не падат нито преди, нито след удара.",
    ),
  },

  PEDESTRIAN_CROSSING_TOO_FAST: {
    kind: "conditional",
    offenceBg: "твърде бързо приближаване към пешеходна пътека",
    duties: [
      DUTY(
        "чл. 119",
        "ЗДвП чл. 119, ал. 1",
        "При приближаване към пешеходна пътека водачът на нерелсово пътно превозно средство е длъжен да пропусне сигнализиращите, че ще пресичат платното за движение на пешеходната пътека съгласно чл. 32, ал. 1, стъпилите на пешеходната пътека или преминаващите по нея пешеходци, като намали скоростта или спре.",
      ),
      DUTY(
        "чл. 20",
        "ЗДвП чл. 20, ал. 2",
        "Водачите на пътни превозни средства са длъжни при избиране скоростта на движението да се съобразяват с атмосферните условия, с релефа на местността, със състоянието на пътя и на превозното средство, с превозвания товар, с характера и интензивността на движението, с конкретните условия на видимост, за да бъдат в състояние да спрат пред всяко предвидимо препятствие.",
      ),
      // The sentence that changes what a crash here COSTS, quoted because it is
      // the strongest argument for slowing down that the act contains.
      DUTY(
        "чл. 119",
        "ЗДвП чл. 119, ал. 5",
        "При пътнотранспортно произшествие с пешеходец на обозначена пътна маркировка \"пешеходна пътека\", когато водачът е превишил разрешената максимална скорост за движение или е нарушил друго правило от Закона за движението по пътищата, имащо отношение към произшествието, пешеходецът не се счита за съпричинител за настъпване на съответното произшествие.",
      ),
    ],
    headlineBg:
      "Самото приближаване с висока скорост няма цена в закона. Чл. 183, ал. 5, т. 2 наказва „не осигури предимство“ — а тази грешка се дава ПРЕДИ предимството да е нарушено, така че да я таксуваме по онзи текст значи да обвиним в нещо, което детекторът не е установил. Онова, което се променя обаче, е кой носи вината, ако все пак стане удар: по чл. 119, ал. 5 пешеходецът не се счита за съпричинител.",
    branches: [CRASH_CASE],
    controlPoints: notListed(
      "Няма състав, значи няма и контролни точки — приближаването не е сред изброените в чл. 6, ал. 1. Ако предимството бъде нарушено, вече говорим за друга грешка — и тогава книжката плаща.",
    ),
  },

  // The manoeuvre and judgement rows, spread in from their own block above.
  // Two lanes filled this map on the same afternoon; keeping the second set in
  // its own literal is what let both land without either overwriting the other.
  ...MANOEUVRE_AND_JUDGEMENT_ROADS,
};

/**
 * THE HONEST BLANK — the default, not the exception. Names the rules that
 * decide the instrument and the points, and NO figure, because none has been
 * retrieved for this offence.
 */
export const UNKNOWN_ROAD: RoadConsequence = {
  kind: "unknown",
  ruleBg: UNKNOWN_ROAD_RULE_BG,
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
    // The наредба's own half of the 2025 – 2026 instrument change, and the one
    // exemption that the emergency-lane row punches through. Both are quoted in
    // notes rather than attached to a figure, so nothing else would re-cut them.
    CP_TAKEN_BY_ANY_INSTRUMENT,
    CP_CLEAN_RECORD_EXEMPTION,
  ];
  // ALL THREE LADDERS, not only the one ROAD_CONSEQUENCES serves. ал. 2 and
  // ал. 3 are reachable through `deriveSpeedingBand` and would otherwise be the
  // only figures in this file no test re-cuts.
  for (const ladder of Object.values(SPEEDING_LADDERS)) {
    for (const tier of ladder) out.push(tier.fine.source, tier.controlPoints.source);
  }
  // TOTAL OVER THE UNION, not a branch per shape. `RoadConsequence` grew from
  // four shapes to six in one afternoon with two lanes writing into it, and a
  // collector that enumerates the shapes it happens to know silently stops
  // re-cutting the quotes on a shape added after it — the exact way a figure
  // gets to ship ungrounded. The switch below is exhaustive by construction:
  // `never` in the default arm makes a seventh shape a COMPILE error here.
  for (const road of Object.values(ROAD_CONSEQUENCES)) {
    if (road === undefined) continue;
    switch (road.kind) {
      case "single":
        out.push(road.fine.source, road.controlPoints.source);
        if (road.offenceQuote !== undefined) out.push(road.offenceQuote);
        out.push(...(road.duties ?? []));
        for (const step of road.escalation ?? []) out.push(step.fine.source, step.controlPoints.source);
        break;
      case "ladder":
        for (const tier of road.tiers) out.push(tier.fine.source, tier.controlPoints.source);
        break;
      case "conditional":
        out.push(...road.duties);
        for (const step of road.branches) out.push(step.fine.source, step.controlPoints.source);
        if (road.controlPoints !== undefined) out.push(road.controlPoints.source);
        break;
      case "exam-only":
        out.push(road.examSource, ...road.duties);
        break;
      case "authored":
      case "unknown":
        break;
      default: {
        const exhaustive: never = road;
        throw new Error(`allLawQuotes: unhandled RoadConsequence ${JSON.stringify(exhaustive)}`);
      }
    }
  }
  return out;
}
