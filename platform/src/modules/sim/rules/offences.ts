/**
 * ONE ACT, ONE ROAD PRICE — and still two marks on the exam sheet.
 *
 * ===========================================================================
 * THE DEFECT THIS FILE EXISTS FOR
 * ===========================================================================
 * Move off without the belt and the product emits TWO faults, by design:
 * `PREDRIVE_SEATBELT_SKIPPED` from the pre-drive machine at move-off, and
 * `SEATBELT_OFF_WHILE_MOVING` from the rule engine once the car is rolling.
 * `procedures/machine.ts` says so in its header and is right to — an examiner
 * logs the missed preparation step and the moving violation separately.
 *
 * Then the 2026-08-09 consequences wave gave BOTH rows the road half, and both
 * rows landed on the same figures: `fine(100, …, ЗДвП чл. 183, ал. 4, т. 7)`
 * and the same `CP_T18_SEATBELT` (10 контролни точки). `SessionEndScreen` maps
 * one `FaultCard` per mistake with no grouping, so the screen told a student who
 * forgot one belt that the street would cost him 200 лв. and 20 контролни точки
 * — two thirds of what a new driver's licence starts with, for one belt.
 *
 * TWO EXAM MARKS IS CORRECT. TWO ROAD PRICES IS NOT: there is one belt, one duty
 * (ЗДвП чл. 137а, ал. 1) and one точка pricing it. That distinction is the whole
 * of this module — the exam sheet counts FAULTS, the street counts OFFENCES, and
 * nothing here touches the score.
 *
 * ===========================================================================
 * WHAT IS DECLARED AND WHAT IS DERIVED
 * ===========================================================================
 * The one thing that cannot be measured out of the law is WHICH CODES ONE ACT
 * CAN PRODUCE — that is a fact about this engine, so it is declared below, one
 * group at a time, each with the place in the engine that proves it.
 *
 * Everything else is READ OFF THE RETRIEVED DATA and never retyped:
 *
 *  - the shared состав citation, the лв. figure and the контролни точки come out
 *    of `roadConsequenceFor` (i.e. out of `content/law/acts`);
 *  - a group only collapses while its members genuinely charge the IDENTICAL
 *    ungated price under the IDENTICAL citation. Amend an act so the two rows
 *    diverge and the group dissolves on its own — both cards go back to
 *    printing their own price, which is the safe direction — and
 *    `__tests__/offences.test.ts` goes red at the group that moved.
 *
 * ADR-002: no article, figure or quote is written here from memory. This file
 * contains no citation string of its own; every one it renders is a field of a
 * `LawQuote` that `consequences.test.ts` re-cuts from the acts on every run.
 *
 * ===========================================================================
 * WHAT IS NOT GROUPED, AND WHY THAT IS A FINDING
 * ===========================================================================
 * Several other codes share a penalty точка — most of чл. 183, ал. 4, т. 14 and
 * most of ал. 2, т. 2. Sharing a точка is NOT enough: т. 14 is four different
 * деяния in one sentence („не спира на знак Спри!“ … „не спазва предимството“),
 * and rolling a STOP line and then failing to give way are two of them. Whether
 * one контролен орган writes one акт or two for that is a legal question this
 * repo cannot answer by retrieval, so it is left alone and REPORTED rather than
 * silently decided. `__tests__/offences.test.ts` enumerates every code pair that
 * shares a citation + amount and forces each one to be either grouped here or
 * listed in `SEPARATE_ACTS` with a reason — so the next pair cannot land
 * unnoticed the way this one did.
 *
 * That enumeration had a hole for as long as it existed: it walked only the
 * `single` shape. `LADDER_SHARED_LADDERS` is the third census that closes it,
 * and the test now refuses to let ANY road-consequence shape be invisible to
 * every census at once — which is how the speeding pair sat here unseen while
 * two other censuses ran over it.
 */

import { roadConsequenceFor } from "./consequences";
import type { ViolationCode, ViolationEvent } from "./types";

// ---------------------------------------------------------------------------
// The charge a code makes, as data
// ---------------------------------------------------------------------------

/**
 * The UNGATED price a code puts on the screen — the only thing a group is
 * allowed to collapse.
 *
 * Deliberately `null` for a `conditional` row, which prints its money behind a
 * condition („ако от това настъпи ПТП…“), and for an `exam-only` row, which
 * prints no money at all: neither is a figure two rows could double, and
 * collapsing them would hide a difference rather than a duplicate.
 *
 * THE `ladder` SHAPE IS THE EXCEPTION, AND THIS DOCSTRING USED TO DENY IT. It
 * listed the ladder beside those two and said none of the three „is a figure two
 * rows could double" — so the census below never looked at a ladder row, and the
 * one shape that could still put two prices on one act was the one shape nothing
 * was watching. A ladder row does not merely name a range: `FaultCard`'s
 * `DerivedRung` prints „Твоят случай" — the arithmetic, the money verdict and
 * the контролни точки of the rung the student's own measured speed lands on. Two
 * ladder rows print two of those, exactly the way the belt printed two.
 *
 * MEASURED RATHER THAN REASONED. `.audit-frames/sweep161/sc-speed-creep/pc-wrong`
 * — a lesson literally called „Пълзящо превишаване на скоростта", whose whole
 * subject is ONE speed that creeps — closed with `MISTAKES (4)` holding both
 * „Превишаване с повече от 10 км/ч" (опасна) and „Превишена скорост"
 * (второстепенна). Seven drives in that sweep carry both titles. `ladderIdentityFor`
 * is what lets the census see them; why the pair is REPORTED and not merged is
 * written at `LADDER_SHARED_LADDERS`.
 */
export interface OffenceCharge {
  /** „ЗДвП чл. 183, ал. 4, т. 7“ — the penalty provision, as retrieved. */
  citationBg: string;
  amountBgn: number;
  /** The licence figure, flattened so two rows can be compared exactly. */
  controlPointsKey: string;
  /** The duty the row names first, when it names one — used for the copy. */
  dutyCitationBg: string | null;
}

export function ungatedChargeFor(code: ViolationCode): OffenceCharge | null {
  const road = roadConsequenceFor(code);
  if (road.kind !== "single") return null;
  const cp = road.controlPoints;
  return {
    citationBg: road.fine.source.citationBg,
    amountBgn: road.fine.amountBgn,
    controlPointsKey: `${cp.status}:${cp.points ?? "—"}:${cp.source.citationBg}`,
    dutyCitationBg: road.duties?.[0]?.citationBg ?? null,
  };
}

/** The charge shared by every member of a group — or null if they disagree. */
export function sharedChargeFor(codes: readonly ViolationCode[]): OffenceCharge | null {
  const first = ungatedChargeFor(codes[0]);
  if (first === null) return null;
  for (const code of codes.slice(1)) {
    const c = ungatedChargeFor(code);
    if (
      c === null ||
      c.citationBg !== first.citationBg ||
      c.amountBgn !== first.amountBgn ||
      c.controlPointsKey !== first.controlPointsKey
    ) {
      return null;
    }
  }
  return first;
}

// ---------------------------------------------------------------------------
// The groups
// ---------------------------------------------------------------------------

/**
 * HOW THE MEMBERS OF ONE ACT ARE RECOGNISED IN A TIME-ORDERED EVENT LIST.
 * Two shapes, both without a tunable window — a magic number here would be an
 * invention sitting underneath a legal figure, which is the one thing this
 * whole area is not allowed to do.
 *
 *  - "sameInstant" — the members are pushed by ONE `reduceTick` call and carry
 *    the identical `t`. Anything at a different `t` is a different act.
 *  - "consequent"  — the members are the same act observed by two detectors a
 *    detector-delay apart, so the partner is the FIRST of its code at or after
 *    the primary. A second occurrence of an already-seen code opens a new act.
 */
export type OffencePairing = "sameInstant" | "consequent";

export interface OffenceGroupSpec {
  /** Stable id — used as a React key and in the tests. */
  id: string;
  /**
   * The member codes, PRIMARY FIRST. The primary is the row that keeps the road
   * block; the others point at it. Order matters only for that.
   */
  codes: readonly [ViolationCode, ViolationCode, ...ViolationCode[]];
  pairing: OffencePairing;
  /**
   * WHY these are one offence, in one clause, with NO article number in it —
   * the citation is rendered separately, from the retrieved charge. Reads as the
   * tail of „…за един и същ пропуск: {reasonBg}".
   */
  reasonBg: string;
  /** Where in the engine the co-firing is provable. Not rendered. */
  evidence: string;
}

export const OFFENCE_GROUPS: readonly OffenceGroupSpec[] = [
  {
    id: "seatbelt",
    codes: ["PREDRIVE_SEATBELT_SKIPPED", "SEATBELT_OFF_WHILE_MOVING"],
    // The pre-drive skip is logged at move-off; the moving fault is the same
    // unbelted stretch seen a sustain-window later by the other detector.
    //
    // THE ONE CASE THIS UNDER-CHARGES, WRITTEN DOWN RATHER THAN PAPERED OVER: a
    // student who moves off unbelted, buckles inside the seatbelt sustain window
    // (so that stretch never raises a moving fault) and unbuckles again later
    // has committed two acts, and the second one is billed as if it were the
    // first. One price instead of two is the safe direction of that error, and
    // closing it would need either a tunable window or a „belt was fastened"
    // channel the event stream does not carry.
    pairing: "consequent",
    reasonBg:
      "един и същ непоставен колан — веднъж като пропусната стъпка от подготовката и веднъж като каране без него",
    evidence:
      "procedures/machine.ts finishProcedure — its module header says the co-firing is intentional — plus the seatbelt episode detector in rules/engine.ts",
  },
  {
    id: "overtake-zone",
    codes: ["OVERTAKING_AT_CROSSING", "OVERTAKING_IN_BAN_ZONE"],
    // Both are pushed from the SAME lane-change branch of one `reduceTick`, so
    // they carry the identical `t`. The engine's own comment on OV-06 says it
    // out loud: „Both codes CAN fire on one change when a crossing zone and a
    // ban zone overlap — two distinct laws, two distinct lessons." Two lessons,
    // yes. Two изпреварвания, no: чл. 183, ал. 2, т. 6 prices „неправилно
    // изпреварване", and there was one.
    pairing: "sameInstant",
    reasonBg:
      "едно и също изпреварване, което попада едновременно в зоната на пешеходната пътека и в зоната със забраната за изпреварване",
    evidence: "rules/engine.ts OV-07 and OV-06 push from one lane-change branch with the same t",
  },
];

/**
 * The pairs that share a penalty провизия and are NOT one act — the other half
 * of the report, kept as data so the test can prove the list is complete.
 *
 * Each entry is a decision, not an oversight. „Two rows cite the same точка" is
 * where the question STARTS; the answer is whether one деяние produced both.
 */
export interface SeparateActsSpec {
  /**
   * Codes that share a penalty провизия and are treated as separate acts
   * PAIRWISE — except for any pair an `OFFENCE_GROUPS` entry claims, which
   * wins. That is how a cluster can be mostly separate with one grouped pair
   * inside it (чл. 183, ал. 2, т. 6 is exactly that shape).
   */
  codes: readonly [ViolationCode, ViolationCode, ...ViolationCode[]];
  /** Why one act does not produce both — or why we cannot yet say it does. */
  reason: string;
}

export const SEPARATE_ACTS: readonly SeparateActsSpec[] = [
  {
    codes: [
      "STOP_SIGN_NO_FULL_STOP",
      "FAILED_TO_YIELD",
      "MOVE_OFF_WITHOUT_OBSERVATION",
      "LANE_CHANGE_WITHOUT_MIRROR_CHECK",
      "WRONG_LANE_FOR_DIRECTION",
    ],
    reason:
      "ЗДвП чл. 183, ал. 4 prices five different точки and т. 14 alone holds FOUR distinct деяния in one sentence. Two of them (not stopping at Б2, not giving way) can be produced by one junction, but they are different deeds under different предложения, and whether that is one акт or two is a legal question no act in content/law/acts answers. NOT grouped: an ungrounded merge would understate a real double penalty, which is the same class of error as the belt in the other direction. Needs the founder's ruling.",
  },
  {
    codes: ["NOT_KEEPING_RIGHT", "CROSSED_SOLID_LINE"],
    reason:
      "Both are чл. 183, ал. 2, т. 2 at 50 лв., but the engine already enforces one-act-one-code here: the solid-line excursion latch (rules/engine.ts `solidCrossExcursion`) stands the touch and lane-keep clocks down while a crossing is armed. Hogging the left lane and crossing the осева are separate sustained episodes with separate onsets.",
  },
  {
    codes: ["TURN_WITHOUT_INDICATOR", "LANE_CHANGE_WITHOUT_INDICATOR"],
    reason:
      "Same точка (чл. 183, ал. 2, т. 7, 50 лв.) and the catalogue says so in its own note, but the two detectors read different manoeuvres: the turn code grades a junction turn, the lane code a lane-id change. One act raises one of them.",
  },
  {
    codes: ["YELLOW_LIGHT_NOT_STOPPED", "RED_YELLOW_CROSSED", "RED_LIGHT_CROSSED"],
    reason:
      "All three are чл. 183, ал. 5, т. 1 at 150 лв., and the engine grades them in one if/else-if chain on `e.lightState` (rules/engine.ts junction sweep) — exactly one can fire per entry. Structurally impossible to double.",
  },
  {
    codes: [
      "OVERTAKE_RETURN_TOO_EARLY",
      "OVERTAKE_INSUFFICIENT_GAP",
      "VULNERABLE_PASS_TOO_CLOSE",
      "OVERTAKING_AT_CROSSING",
      "OVERTAKING_IN_BAN_ZONE",
    ],
    reason:
      "THE BIGGEST CLUSTER IN THE CATALOGUE AND THE ONE THAT IS ONLY HALF FIXED. All five are чл. 183, ал. 2, т. 6 at 50 лв. AND 10 контролни точки each — the dearest licence figure a 50 лв. fine carries anywhere in this file, so a doubled pair here costs 20 of a new driver's 26. The zone pair (OVERTAKING_AT_CROSSING + OVERTAKING_IN_BAN_ZONE) IS grouped above and that pair is exempt from this entry. The other three arrive as `prioritySituation` events from the world runtime's own adjudicators (overtake-oncoming / overtake-return / vulnerable-pass) rather than from the lane-change branch, and one изпреварване can in principle raise two of them — the head-on gamble on the way out and the cut-back on the way in. NOT grouped: unlike the zone pair they do not share a `t`, the runtime stamps them with no overtake id, and pairing them by proximity would need the tunable window this module refuses to invent. Reported; the cheapest real fix is an overtake id on the runtime event, which is a runtime change and not this lane's.",
  },
];

/**
 * THE OTHER CENSUS — the gated money, pinned rather than ruled on.
 *
 * `OffenceCharge` deliberately sees only the UNGATED price, because that is the
 * figure a card states as the cost of the drive. But three articles are shared
 * by whole blocks of the catalogue as CONDITIONAL branches („ако от това е
 * създадена непосредствена опасност", „ако причини ПТП"), and a drive that
 * raises four of those codes prints the same conditional 200 лв. four times.
 *
 * That is a weaker defect than the belt — every one of those lines is rendered
 * with its condition attached and none of them says „this is what you owe" — so
 * it is NOT collapsed here: merging a gated branch would hide which of the four
 * rules actually created the danger, and the danger is the lesson. What it is
 * instead is MEASURED and pinned. The list below is the census output, and
 * `__tests__/offences.test.ts` compares it against the real data on every run,
 * so a NEW shared conditional provision cannot arrive unnoticed.
 *
 * The one entry worth a second look is чл. 179, ал. 2: `COLLISION` charges it
 * UNGATED at 300 лв., and seven other codes carry the same 300 лв. as their
 * „ако настъпи ПТП" branch — so a crash caused by following too close prints the
 * figure twice, once as a fact and once as a hypothesis. Whether the second one
 * should stand down once `COLLISION` is on the same sheet is a UI ruling, not a
 * retrieval, and it is reported here rather than taken.
 */
export interface GatedSharedProvision {
  /** „ЗДвП чл. 179, ал. 1, т. 5" — as retrieved from the branch's own quote. */
  citationBg: string;
  amountBgn: number;
  /** How many codes carry it as a branch. Checked, not remembered. */
  codeCount: number;
  noteBg: string;
}

export const GATED_SHARED_PROVISIONS: readonly GatedSharedProvision[] = [
  {
    citationBg: "ЗДвП чл. 179, ал. 1, т. 5",
    amountBgn: 200,
    codeCount: 13,
    noteBg:
      "Условната надстройка на почти целия каталог: 200 лв., но само „ако от това е създадена непосредствена опасност“. Симулаторът не установява такава опасност, затова редът винаги стои с условието си.",
  },
  {
    citationBg: "ЗДвП чл. 179, ал. 2",
    amountBgn: 300,
    codeCount: 11,
    noteBg:
      "Ударът. COLLISION го носи БЕЗ условие; останалите го носят като „ако причини ПТП“. След реален удар една и съща сума се появява веднъж като факт и веднъж като хипотеза.",
  },
  {
    citationBg: "ЗДвП чл. 180, ал. 1, т. 1",
    amountBgn: 100,
    codeCount: 5,
    noteBg:
      "Светлините и разположението: единственият състав, който изобщо назовава фаровете, и той пак виси на непосредствената опасност.",
  },
  {
    citationBg: "ЗДвП чл. 183, ал. 2, т. 2",
    amountBgn: 50,
    codeCount: 2,
    noteBg:
      "Разположението върху платното, като условен ред на двете грешки за напускане на лентата. Двигателят вече пази „едно деяние, един код“ тук чрез ключалката на непрекъснатата линия.",
  },
  {
    citationBg: "ЗДвП чл. 183, ал. 4, т. 14",
    amountBgn: 100,
    codeCount: 2,
    noteBg:
      "Непропуснатото предимство като последица от непълно оглеждане — условен ред на двете грешки за непълния поглед преди маневра.",
  },
  {
    citationBg: "ЗДвП чл. 183, ал. 6",
    amountBgn: 300,
    codeCount: 2,
    noteBg:
      "Повторното преминаване при забраняващ сигнал. Двата кода, които го носят, се изключват взаимно в двигателя — не могат да се съберат на един екран от едно деяние.",
  },
];

/**
 * THE THIRD CENSUS — the ladder, and the pair the other two could not see.
 *
 * `ungatedChargeFor` answers `null` for a `ladder`, so a ladder row sat in no
 * cluster, in no group and in no `SEPARATE_ACTS` entry: invisible to every guard
 * in this file, including the one written to make invisibility impossible. That
 * blindness is the finding. The two codes it hid do not merely share a точка —
 * they share the WHOLE ladder, which is a tighter identity than the seatbelt
 * group has.
 *
 * The identity is READ OFF the retrieved consequence and never inferred: the
 * `offenceBg` the ladder prices, the `scopeBg` naming which alinea's ladder it is
 * as the data itself labels it, and the rung count — so two ladders cannot be
 * called one on prose alone.
 */
export interface LadderIdentity {
  /** The деяние the ladder prices, as retrieved. */
  offenceBg: string;
  /** Which alinea's ladder, in the retrieved row's own words. */
  scopeBg: string;
  /** Rung count — the structural half of the identity. */
  tierCount: number;
}

export function ladderIdentityFor(code: ViolationCode): LadderIdentity | null {
  const road = roadConsequenceFor(code);
  if (road.kind !== "ladder") return null;
  return {
    offenceBg: road.offenceBg,
    scopeBg: road.scopeBg,
    tierCount: road.tiers.length,
  };
}

export interface LadderSharedSpec {
  offenceBg: string;
  scopeBg: string;
  /** How many codes ride this exact ladder. Checked, not remembered. */
  codeCount: number;
  /** Why it is reported rather than merged. */
  reason: string;
}

/**
 * The census output, pinned — the same contract as `GATED_SHARED_PROVISIONS`:
 * `__tests__/offences.test.ts` re-measures it from the acts on every run, so a
 * THIRD code joining this ladder arrives as a red test.
 *
 * WHY THIS PAIR IS NOT GROUPED, EVEN THOUGH ITS IDENTITY IS THE STRONGEST HERE.
 * Grouping collapses the road half onto ONE row, and `billRoadConsequences`
 * picks that row by time — the earliest member of the act. A creeping overspeed
 * enters the второстепенна band first, so the surviving row would be the CHEAP
 * rung and the опасна row — the band the student actually reached — would be the
 * one that stopped printing a price. That is not the belt defect corrected; that
 * is the belt defect pointed the other way, and an under-charge is the same
 * crime as the double charge. Closing it needs three things this module cannot
 * take on its own: a ladder-aware `sharedChargeFor` (a ladder has no single
 * `citationBg`/`amountBgn` for `OffenceCharge` to compare or for the covered
 * row's copy to name), a primary chosen by DECLARED order rather than by time
 * (`OffenceGroupSpec.codes` already promises „PRIMARY FIRST" and the walker does
 * not honour it — latent today only because both shipped groups happen to fire in
 * declared order), and a founder ruling on whether one continuous stretch that
 * climbed from +8 to +25 is one нарушение priced at the top band or two.
 *
 * Reported, therefore, and guarded in the safe direction: the test below asserts
 * `sharedChargeFor` REFUSES this pair, so a future lane that declares the group
 * without doing the three things above gets no collapse rather than a cheap one.
 */
export const LADDER_SHARED_LADDERS: readonly LadderSharedSpec[] = [
  {
    offenceBg: "превишаване на разрешената максимална скорост",
    scopeBg: "в населено място (ЗДвП чл. 182, ал. 1)",
    codeCount: 2,
    reason:
      "Двата кода за скорост са ЕДИН състав на една и съща стълбица — различават се само по прага, на който симулаторът ги вдига, и затова Наредба № 38 ги брои като второстепенна и като опасна грешка поотделно. Пълзящо превишаване минава през долната лента и продължава в горната, така че едно непрекъснато деяние отпечатва двете стъпала: две суми и две пъти контролни точки за едно и също превишаване. Измерено в .audit-frames/sweep161/sc-speed-creep/pc-wrong (MISTAKES (4): „Превишаване с повече от 10 км/ч“ и „Превишена скорост“ в едно каране). НЕ Е ОБЕДИНЕНО: обединяването би оставило по-евтиното стъпало, а подценяването е същото престъпление като удвояването. На изпитния лист двете грешки при всички положения се броят поотделно — това не се пипа.",
  },
];

/** The declared group a code belongs to, or null. */
export function offenceGroupFor(code: ViolationCode): OffenceGroupSpec | null {
  return OFFENCE_GROUPS.find((g) => g.codes.includes(code)) ?? null;
}

// ---------------------------------------------------------------------------
// Billing a mistake list
// ---------------------------------------------------------------------------

export interface OffenceBilling {
  /**
   * True for every row that prints its own road block — which is every row that
   * is not the second sighting of an act already priced above it.
   */
  billed: boolean;
  /** The group this row belongs to, when it belongs to one. */
  groupId: string | null;
  /** The row carrying the price, when this row is not it. */
  coveredBy: {
    code: ViolationCode;
    titleBg: string;
    reasonBg: string;
    citationBg: string;
  } | null;
  /** When this row IS the billed one and the act produced others: their titles. */
  alsoCovers: readonly { code: ViolationCode; titleBg: string; reasonBg: string; citationBg: string }[];
}

const UNGROUPED: OffenceBilling = { billed: true, groupId: null, coveredBy: null, alsoCovers: [] };

/**
 * Walk a CHRONOLOGICAL mistake list (`SessionSummary.mistakes` already is one)
 * and decide which rows print the road half.
 *
 * Nothing about the exam mark is touched: every row keeps its own class, its own
 * наказателни точки and its own Наредба № 38 clause. The only thing that
 * collapses is the sentence about money and контролни точки.
 */
export function billRoadConsequences(
  mistakes: readonly ViolationEvent[],
): OffenceBilling[] {
  const out: OffenceBilling[] = mistakes.map(() => UNGROUPED);

  for (const group of OFFENCE_GROUPS) {
    const charge = sharedChargeFor(group.codes);
    // The members no longer agree on the figure (an amendment moved one of
    // them). Do not collapse a difference — leave both rows printing their own.
    if (charge === null) continue;

    const indices = mistakes
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => group.codes.includes(m.code));
    if (indices.length < 2) continue;

    let primary: { i: number; t: number } | null = null;
    let seen = new Set<ViolationCode>();

    for (const { m, i } of indices) {
      const joins =
        primary !== null &&
        !seen.has(m.code) &&
        (group.pairing === "sameInstant" ? m.t === primary.t : m.t >= primary.t);

      if (joins && primary !== null) {
        const head = mistakes[primary.i];
        out[i] = {
          billed: false,
          groupId: group.id,
          coveredBy: {
            code: head.code,
            titleBg: head.titleBg,
            reasonBg: group.reasonBg,
            citationBg: charge.citationBg,
          },
          alsoCovers: [],
        };
        out[primary.i] = {
          ...out[primary.i],
          groupId: group.id,
          alsoCovers: [
            ...out[primary.i].alsoCovers,
            { code: m.code, titleBg: m.titleBg, reasonBg: group.reasonBg, citationBg: charge.citationBg },
          ],
        };
        seen.add(m.code);
      } else {
        // A new act: this row bills, and the tally of codes starts over.
        primary = { i, t: m.t };
        seen = new Set([m.code]);
        out[i] = { billed: true, groupId: group.id, coveredBy: null, alsoCovers: [] };
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// The copy — said once, so both surfaces say it the same way
// ---------------------------------------------------------------------------

/**
 * The line printed UNDER the road block of the row that carries the price.
 *
 * THEO-4: it explains rather than asserts, and it says the thing a student would
 * otherwise have to work out for himself — that the two marks above are real and
 * the two prices are not.
 */
export function offenceCoversNoteBg(
  covers: OffenceBilling["alsoCovers"],
): string | null {
  if (covers.length === 0) return null;
  const titles = covers.map((c) => `„${c.titleBg}“`).join(", ");
  const { reasonBg, citationBg } = covers[0];
  return (
    `Едно нарушение, една цена. Сумата и контролните точки по-горе важат ЗАЕДНО за тази грешка и за ${titles} — ` +
    `и двете се пишат по един и същ състав (${citationBg}) и за един и същ пропуск: ${reasonBg}. ` +
    `На изпитния лист обаче двете се броят поотделно, всяка със своите наказателни точки: изпитващият оценява две различни неща, ` +
    `а контролният орган наказва едно.`
  );
}

/** The block printed INSTEAD of the road half, on the row that is covered. */
export function offenceCoveredHeadlineBg(): string {
  return "На пътя — платено веднъж, при другата грешка";
}

export function offenceCoveredBodyBg(covered: NonNullable<OffenceBilling["coveredBy"]>): string {
  return (
    `На пътя това не е второ нарушение: същият състав (${covered.citationBg}) стои и зад „${covered.titleBg}“, ` +
    `и то за един и същ пропуск — ${covered.reasonBg}. Затова глобата и контролните точки са показани веднъж, там, и не се удвояват тук.`
  );
}

/**
 * The same finding as one line of debrief prose.
 *
 * A separate string rather than the card's body with a prefix glued on: every
 * other road line in `lessons/debrief.ts` opens „На пътя (не влиза в оценката
 * на урока):", and the card's body already opens „На пътя това не е…", so
 * reusing it printed „На пътя … На пътя …". The two surfaces must agree on the
 * FINDING, not on the sentence.
 */
export function offenceCoveredLineBg(covered: NonNullable<OffenceBilling["coveredBy"]>): string {
  return (
    `На пътя (не влиза в оценката на урока): това не е второ нарушение. Същият състав (${covered.citationBg}) ` +
    `стои и зад „${covered.titleBg}“, за един и същ пропуск — ${covered.reasonBg}. Глобата и контролните точки ` +
    `са показани веднъж, при „${covered.titleBg}“, и не се удвояват. На изпитния лист двете грешки се броят поотделно.`
  );
}

export function offenceCoveredExamNoteBg(covered: NonNullable<OffenceBilling["coveredBy"]>): string {
  return (
    `На изпитния лист обаче тази грешка се пише отделно от „${covered.titleBg}“ и си носи собствените наказателни точки — ` +
    `изпитващият оценява две различни неща. Две оценки, едно нарушение.`
  );
}
