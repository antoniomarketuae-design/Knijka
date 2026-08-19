"use client";

/**
 * THE FAULT CARD — one graded mistake, with the three systems kept apart.
 *
 * WHAT IT REPLACED, AND WHY. The session-end mistake row used to be a title, an
 * explanation, a law chip and — flush right — „−10 т.". The founder drove the
 * lesson, saw that, and read it as his LICENCE being docked. He is right to:
 * in Bulgarian, unqualified „точки" means КОНТРОЛНИ точки, the 39-point licence
 * budget, and nothing on the row said otherwise. The marking was never wrong —
 * 10 наказателни точки for exceeding the limit by more than 10 km/h is exactly
 * приложение № 5, т. 10, б. „в" — but the LABEL was, and the half the card
 * never showed at all is the half that changes behaviour after the test is
 * passed.
 *
 * So the card now says three separable things, in this order:
 *
 *   1. THE EXAM SHEET — „−10 изпитни т.", the class, and the clause of
 *      Наредба № 38 the number comes out of, with the pass rule (≤ 9) so the
 *      figure has a scale. Explicitly bounded to THIS LESSON.
 *   2. WHAT IT IS NOT — one sentence naming контролни точки and the licence
 *      budget, because that is the reading everyone makes.
 *   3. THE STREET — глоба in EUR, the instrument (фиш / електронен фиш /
 *      АУАН → наказателно постановление) and контролни точки where the offence
 *      carries them. This is the half a real instructor cares about most:
 *      „this fails your exam, and on the street a camera sends you a фиш."
 *
 * AND WHERE WE DO NOT KNOW, IT SHOWS THE RULE AND NO NUMBER. Most codes have no
 * retrieved road penalty yet, and those render the rule with the article and no
 * figure at all — the founder's standing ruling. An honest blank beats a guess;
 * two invented figures have already shipped in this product (a „50 метра" for
 * railway crossings that exists in no act, an e-scooter age tier чл. 80а, ал. 3
 * contradicts), and both were marked approved.
 *
 * EVERY FIGURE ON THIS CARD IS RETRIEVED (ADR-002). Nothing is composed here:
 * the component renders `rules/consequences.ts`, whose every quote is re-cut
 * from `content/law/acts/*.json` by `rules/__tests__/consequences.test.ts` on
 * every run.
 */

import {
  EXAM_TERMINATION_CITATION_BG,
  EXAM_VS_CONTROL_POINTS_BG,
  EXCESS_ROUNDING_NOTE_BG,
  controlPointsTightBg,
  deriveSpeedingBand,
  examMarkFor,
  formatEur,
  instrumentLabelBg,
  offenceCoveredBodyBg,
  offenceCoveredExamNoteBg,
  offenceCoveredHeadlineBg,
  offenceCoversNoteBg,
  parseSpeedMeasurement,
  minusPointsBg,
  pointsScaleLabelBg,
  pointsWordsBg,
  roadConsequenceFor,
  withEurBg,
  type ConditionalPenalty,
  type ControlPointsFigure,
  type FineFigure,
  type LawQuote,
  type OffenceBilling,
  type ViolationEvent,
} from "../rules";

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

const SEVERITY_TONE: Record<ViolationEvent["severityClass"], string> = {
  opasna: "var(--danger)",
  osnovna: "var(--warning)",
  vtorostepenna: "var(--accent-soft)",
};

function Cite({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted">
      {children}
    </span>
  );
}

/** „76,69 € (150 лв. по текста на закона)" — the euro is what he pays. */
function moneyBg(f: FineFigure): string {
  return `${formatEur(f.eurCents)} (${f.amountBgn} лв. по текста на закона)`;
}

/**
 * Контролни точки, said in a way that cannot be confused with the exam mark: a
 * grounded count, an explained 0, or — never reached from a grounded entry —
 * no number at all.
 */
function controlPointsBg(cp: ControlPointsFigure): string {
  if (cp.status === "grounded" && cp.points !== null) {
    return `${pointsWordsBg("control", cp.points)} от книжката`;
  }
  if (cp.status === "not-listed") return `${pointsWordsBg("control", 0)} — не е в списъка`;
  return "контролни точки: не е установено";
}

// ---------------------------------------------------------------------------
// The exam half, when the exam was already over
// ---------------------------------------------------------------------------

/**
 * WHAT THIS ROW COST WHEN THE SHEET WAS ALREADY CLOSED — the ledger's answer,
 * not the catalogue's.
 *
 * `event.points` is the CATALOGUE BASE: what a fault costs while the exam is
 * still running. Наредба № 38, чл. 48, ал. 3 ends a practical exam at the first
 * terminating опасна, and `rules/scoring.ts ledgerBilling` says PER ROW which
 * faults were actually charged — the debrief has folded it since 2026-08-18
 * (`lessons/debrief.ts:504`). This card did not, and `SessionEndScreen.tsx`
 * renders the card list (line 1211) and `debriefText` (line 1290) ON ONE
 * SCREEN, so the two halves of one screen quoted two different numbers for the
 * same fault.
 *
 * MEASURED · the sc-hz-accident-scene squeeze, the drive
 * `lessons/__tests__/debrief-collision-truth.test.ts` is built from: a wrecked
 * car struck at 13.13 s and a bystander at 13.43 s. The ledger charges 10 and
 * the debrief prints «Удар в пешеходец — опасна, без допълнителни точки —
 * изпитът вече беше прекратен»; the card beside it printed «−10 изпитни т.» on
 * that same row, so the screen carried 10 and 20 at once. The deployed build
 * doing it with the protocol table as well:
 * `.audit-frames/sweep161/sc-ac-aquaplane/pc-wrong/08-debrief.png` — «Опасни
 * грешки 2 · 20» over one closed exam.
 *
 * NOT A ZERO, and that is the whole shape of it. „0 изпитни т." beside «Удар в
 * пешеходец» reads as „this did not matter", which is the precise opposite of
 * the lesson — so the row says WHY it is free, in the debrief's own words
 * rather than a paraphrase of them. `__tests__/fault-card-ledger-close.test.tsx`
 * re-reads those words out of a real `buildDebrief` instead of trusting this
 * file: two surfaces on one screen that agree by accident stop agreeing the
 * first time either is edited.
 *
 * THE SCALE IS NAMED, which is where this parted company with the debrief's
 * wording on purpose. The debrief writes „без допълнителни точки" and gets away
 * with it: it is one plain-text paragraph and the previous row it sits under
 * has just said „наказателни т. по изпитния лист". This is a CARD, read on its
 * own beside three other point systems, and an unqualified „точки" here is the
 * founder's original misreading with the number removed —
 * `rules/__tests__/point-scales.test.ts` refuses it in this directory and is
 * right to. So the scale comes from the vocabulary rather than the keyboard,
 * and the two surfaces are pinned to each other on the clause they DO share
 * verbatim: «изпитът вече беше прекратен».
 */
const LEDGER_CLOSED_MARK_BG = `без допълнителни ${pointsScaleLabelBg("exam")}`;

/**
 * …and the reason, with the clause that closed the sheet. The last sentence is
 * there because „no points" is the answer for ONE of the three systems: чл. 48,
 * ал. 3 is a provision of the exam наредба and reaches the изпитен лист only.
 * The road block below this one is unchanged on a closed ledger, and a student
 * who reads the mark above and stops there has learned that crashing twice is
 * free.
 */
const LEDGER_CLOSED_NOTE_BG =
  "Изпитът вече беше прекратен, затова тази грешка се показва и се обяснява, " +
  `но не добавя наказателни точки към изпитния лист (${EXAM_TERMINATION_CITATION_BG}). ` +
  "Глобата и контролните точки са друга система — прекратяването на изпита " +
  "не ги отменя.";

// ---------------------------------------------------------------------------
// The road half
// ---------------------------------------------------------------------------

/**
 * THE ROW, NOT THE TABLE.
 *
 * The ladder used to be the whole answer: six rungs and „find yourself". The
 * reducer now carries the measured speed and the limit on the event
 * (`encodeSpeedMeasurement`), so the card can do what an instructor does after
 * he has shown you the table — point at your line. Everything here comes out of
 * `deriveSpeedingBand`; this component computes nothing.
 *
 * BOTH ALINEAS, because the engine genuinely does not know whether the lesson
 * is in a населено място and inventing that is inventing the penalty. ал. 1 is
 * shown as the primary (it is the ladder the card is already displaying) and
 * ал. 2 appears only when the same превишение costs something different there —
 * silence when they agree, a second line when they do not.
 */
function DerivedRung({ event }: { event: ViolationEvent }) {
  const measured = parseSpeedMeasurement(event.detail);
  if (measured === null) return null;
  const here = deriveSpeedingBand({ ...measured, scope: "urban" });
  const outside = deriveSpeedingBand({ ...measured, scope: "outsideUrban" });
  const outsideDiffers =
    outside.totalBgn !== here.totalBgn || outside.tier?.fine.banBg !== here.tier?.fine.banBg;

  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border-strong bg-surface-2 p-1.5">
      <p className="text-[10px] font-black uppercase tracking-wide">Твоят случай</p>
      <p className="text-[11px] leading-relaxed">{here.arithmeticBg}</p>
      <p className="text-[11px] font-semibold leading-relaxed">{here.verdictBg}</p>
      {here.escalation !== null ? (
        <p className="text-[11px] leading-relaxed">{here.escalation.noteBg}</p>
      ) : null}
      {outsideDiffers ? (
        <p className="text-[11px] leading-relaxed">
          <span className="font-bold">Ако беше извън населено място:</span> {outside.verdictBg}
        </p>
      ) : null}
      <p className="text-[10px] leading-relaxed text-muted">{here.toleranceBg}</p>
      <p className="text-[10px] leading-relaxed text-muted">{EXCESS_ROUNDING_NOTE_BG}</p>
    </div>
  );
}

/**
 * The rule broken, as opposed to the price of breaking it.
 *
 * The label is written ONCE and pluralised, because two rows carry two duties
 * and „Правилото:" twice in a column reads as a template stutter — measured on
 * the fog card, where чл. 70, ал. 1 (the binding duty) sits directly above
 * чл. 74, ал. 1 (the permission that is NOT one), and the pair is the point.
 */
function DutyLines({ duties }: { duties: readonly LawQuote[] }) {
  if (duties.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[11px] leading-relaxed text-muted">
        <span className="font-bold">{duties.length === 1 ? "Правилото:" : "Правилата:"}</span>{" "}
        „{duties[0].quoteBg}“ ({duties[0].citationBg})
      </p>
      {duties.slice(1).map((d) => (
        <p key={d.citationBg} className="text-[11px] leading-relaxed text-muted">
          „{d.quoteBg}“ ({d.citationBg})
        </p>
      ))}
    </div>
  );
}

/**
 * A penalty that exists and is GATED. The condition is rendered FIRST and in
 * the same sentence as the money, because the whole risk of this shape is a
 * student reading „300 €" and stopping there.
 */
function GatedLine({ step }: { step: ConditionalPenalty }) {
  return (
    <p className="text-xs leading-relaxed">
      <span className="font-bold">{step.conditionBg}</span> — {moneyBg(step.fine)},{" "}
      {controlPointsBg(step.controlPoints)}. Пристига като {instrumentLabelBg(step.fine.instruments)}.{" "}
      <Cite>{step.fine.source.citationBg}</Cite>
    </p>
  );
}

/**
 * THE SECOND SIGHTING OF ONE OFFENCE — the row that does NOT print a price.
 *
 * Moving off unbelted raises two faults by design (`procedures/machine.ts`), and
 * the consequences wave gave both of them the same 100 лв. and the same 10
 * контролни точки, so this card told a student one belt would cost him 200 лв.
 * and 20 контролни точки — most of a new licence. The exam marks are right and
 * stay; the price is one price and is printed once, on the first row of the act.
 *
 * NOT AN EMPTY SLOT AND NOT A DASH. The block that replaces the money says which
 * row carries it and why the two are one offence — a student who sees a gap
 * where the other card has a figure will assume the figure was forgotten, and
 * the whole finding here is that it was not.
 */
function OffenceCoveredBlock({ covered }: { covered: NonNullable<OffenceBilling["coveredBy"]> }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border-strong p-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-warning">
        {offenceCoveredHeadlineBg()}
      </p>
      <p className="text-xs leading-relaxed">{offenceCoveredBodyBg(covered)}</p>
      <p className="text-[11px] leading-relaxed text-muted">{offenceCoveredExamNoteBg(covered)}</p>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Cite>{covered.citationBg}</Cite>
      </div>
    </div>
  );
}

function RoadConsequenceBlock({
  event,
  alsoCovers = [],
}: {
  event: ViolationEvent;
  /** Other faults of the SAME act, whose price this block already includes. */
  alsoCovers?: OffenceBilling["alsoCovers"];
}) {
  const road = roadConsequenceFor(event.code);
  const coversNote = offenceCoversNoteBg(alsoCovers);
  const mine =
    road.kind === "ladder" ? parseSpeedMeasurement(event.detail) : null;
  const myTierRef =
    mine === null ? null : deriveSpeedingBand({ ...mine, scope: "urban" }).tier?.pointRefBg ?? null;

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border-strong p-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-warning">
        На пътя — отделно от оценката на урока
      </p>

      {road.kind === "unknown" ? (
        <p className="text-xs leading-relaxed text-muted">{road.ruleBg}</p>
      ) : road.kind === "authored" ? (
        <>
          {/* ONE CURRENCY ON THE SCREEN. The structured entries below render
              euro; these forty authored sentences were written in лв., so a
              student with two faults met both conventions on one card. Bulgaria
              is in the eurozone and the фиш he receives is in euro, so the euro
              is put beside every лв. figure here — except inside „…“, where the
              act's own words must stay exactly as the act wrote them. */}
          <p className="text-xs leading-relaxed">{withEurBg(road.textBg)}</p>
          {road.refsBg.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {road.refsBg.map((r) => (
                <Cite key={r}>{r}</Cite>
              ))}
            </div>
          ) : null}
        </>
      ) : road.kind === "exam-only" ? (
        /* THE ROW THAT COSTS NOTHING, SAID SO PLAINLY IT CANNOT BE MISREAD.
           No money block, no licence block, no empty „—": printing the same
           three labelled rows with dashes in them reads as missing data, and
           the whole finding here is that the data is not missing. */
        <>
          <p className="text-xs font-semibold leading-relaxed">{road.headlineBg}</p>
          <p className="text-[11px] leading-relaxed text-muted">{road.whyBg}</p>
          <DutyLines duties={road.duties} />
          <p className="text-[11px] leading-relaxed text-muted">
            <span className="font-bold">На изпита:</span> „{road.examSource.quoteBg}“
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Cite>{road.examSource.citationBg}</Cite>
          </div>
        </>
      ) : road.kind === "conditional" ? (
        <>
          <p className="text-xs font-semibold leading-relaxed">{road.headlineBg}</p>
          <DutyLines duties={road.duties} />
          {/* The licence answer comes BEFORE the gated money: it is the one
              figure here that is true unconditionally, and burying it under a
              condition turns „нула" into „нула, ако нищо не се случи". */}
          {road.controlPoints !== undefined ? (
            <>
              <p className="text-xs leading-relaxed">
                <span className="font-bold">Книжка:</span> {controlPointsBg(road.controlPoints)}
              </p>
              <p className="text-[11px] leading-relaxed text-muted">{road.controlPoints.noteBg}</p>
            </>
          ) : null}
          {road.branches.length > 0 ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-wide text-muted">
                Кога все пак се плаща
              </p>
              {road.branches.map((step) => (
                <GatedLine key={step.fine.source.citationBg + step.conditionBg} step={step} />
              ))}
            </>
          ) : null}
        </>
      ) : road.kind === "single" ? (
        <>
          <p className="text-xs leading-relaxed">
            <span className="font-bold">Глоба:</span> {moneyBg(road.fine)}
          </p>
          <p className="text-xs leading-relaxed">
            <span className="font-bold">Как пристига:</span> {instrumentLabelBg(road.fine.instruments)}
          </p>
          <p className="text-xs leading-relaxed">
            <span className="font-bold">Книжка:</span> {controlPointsBg(road.controlPoints)}
          </p>
          <p className="text-[11px] leading-relaxed text-muted">{road.controlPoints.noteBg}</p>
          {road.offenceQuote !== undefined ? (
            <p className="text-[11px] leading-relaxed text-muted">
              <span className="font-bold">Съставът:</span> „{road.offenceQuote.quoteBg}“
            </p>
          ) : null}
          <DutyLines duties={road.duties ?? []} />
          {road.noteBg !== undefined ? (
            <p className="text-[11px] leading-relaxed text-muted">{road.noteBg}</p>
          ) : null}
          {road.escalation !== undefined && road.escalation.length > 0 ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-wide text-muted">
                Ако от това излезе беля
              </p>
              {road.escalation.map((step) => (
                <GatedLine key={step.fine.source.citationBg + step.conditionBg} step={step} />
              ))}
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <Cite>{road.fine.source.citationBg}</Cite>
            <Cite>{road.controlPoints.source.citationBg}</Cite>
          </div>
        </>
      ) : (
        <>
        <DerivedRung event={event} />
        <details className="group">
          <summary className="cursor-pointer list-none text-xs leading-relaxed">
            <span className="font-bold">Глоба според превишението:</span>{" "}
            {formatEur(road.tiers[0].fine.eurCents)} – {formatEur(road.tiers[road.tiers.length - 1].fine.eurCents)}{" "}
            {road.scopeBg}
            <span className="ml-1 font-semibold text-accent underline">
              {"— виж стълбицата"}
            </span>
          </summary>
          {/* The act's own rungs. Wide content scrolls inside itself. */}
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full min-w-[19rem] text-left text-[11px]">
              <thead className="text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="py-1 font-bold">Превишение</th>
                  <th scope="col" className="py-1 text-right font-bold">Глоба</th>
                  <th scope="col" className="py-1 text-right font-bold">Книжка</th>
                </tr>
              </thead>
              <tbody>
                {road.tiers.map((tier) => (
                  <tr
                    key={tier.bandBg}
                    className={
                      tier.pointRefBg === myTierRef
                        ? "border-t border-border bg-surface-3 align-top font-bold"
                        : "border-t border-border align-top"
                    }
                  >
                    <td className="py-1 pr-2 font-semibold">
                      {tier.bandBg}
                      {tier.pointRefBg === myTierRef ? (
                        <span className="ml-1 font-black text-warning">← твоето</span>
                      ) : null}
                      {tier.fine.banBg !== null ? (
                        <span className="block font-semibold text-danger">и {tier.fine.banBg}</span>
                      ) : null}
                    </td>
                    {/* The euro is what he pays; the лв. is what the quoted
                        sentence of ЗДвП says, kept underneath so the row and
                        its citation cannot be read as disagreeing. */}
                    <td className="py-1 text-right tabular-nums">
                      {formatEur(tier.fine.eurCents)}
                      <span className="block text-[10px] font-normal text-muted">
                        ({tier.fine.amountBgn} лв. по закона)
                      </span>
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {/* The one abbreviated form in the product, legible only
                          under the „Книжка" header above it — and it goes
                          through the same vocabulary as everything else so
                          „контролни точки" is still written in exactly one
                          place (rules/scales.ts). */}
                      {tier.controlPoints.status === "grounded" && tier.controlPoints.points !== null
                        ? controlPointsTightBg(tier.controlPoints.points)
                        : tier.controlPoints.status === "not-listed"
                          ? controlPointsTightBg(0)
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] font-semibold leading-relaxed">{road.appliesBg}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            <span className="font-bold">Как пристига:</span> до „над 40 km/h“ —{" "}
            {instrumentLabelBg(road.tiers[0].fine.instruments)}. От там нагоре —{" "}
            {instrumentLabelBg(road.tiers[road.tiers.length - 1].fine.instruments)}.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{road.footnoteBg}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Cite>{road.tiers[0].fine.source.citationBg}</Cite>
            <Cite>{road.tiers[road.tiers.length - 1].controlPoints.source.citationBg}</Cite>
          </div>
        </details>
        </>
      )}

      {/* ONE ACT, ONE PRICE — said on the row that carries it, so the figure
          above cannot be read as „per fault". Last, because it is a statement
          ABOUT the numbers above it and reads as nonsense before them. */}
      {coversNote !== null ? (
        <p className="mt-0.5 rounded-md border border-border-strong bg-surface-2 p-1.5 text-[11px] font-semibold leading-relaxed">
          {coversNote}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export interface FaultCardProps {
  event: ViolationEvent;
  /** A15's authored corrective („какво трябваше да направя"), when known. */
  correctiveBg: string | null;
  /** Session clock, already formatted („1:07"). */
  atBg: string;
  /**
   * Which row of a multi-fault OFFENCE this is (`rules/offences.ts`). Omitted =
   * a standalone card — the live overlay, the dev rigs, the tests that render
   * one fault — and a standalone card is always the billed one, so leaving it
   * out can never suppress a price.
   */
  billing?: OffenceBilling;
  /**
   * Did the EXAM LEDGER charge this row — `rules/scoring.ts ledgerBilling()`
   * at this row's index, the same array `lessons/debrief.ts` folds.
   *
   * OMITTED = CHARGED, in the one direction that cannot manufacture a pass. A
   * standalone card (the live overlay, the dev rigs, a test that renders one
   * fault) has no session around it and is therefore the billed one, exactly
   * like `billing` above; and a caller that forgets to wire this OVERSTATES a
   * penalty rather than hiding one. Suppressing a charge that really happened
   * is how a fail turns into a green tick, so the default may never be `false`
   * — `__tests__/fault-card-ledger-close.test.tsx` pins both directions.
   */
  examBilled?: boolean;
}

export function FaultCard({
  event,
  correctiveBg,
  atBg,
  billing,
  examBilled = true,
}: FaultCardProps) {
  const mark = examMarkFor(event.code);
  const covered = billing?.billed === false ? billing.coveredBy : null;

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{event.titleBg}</span>
        {/* THE QUALIFIER. „−10 т." is what the founder misread; the unit is
            now on the number itself, not left to the reader. And on a row the
            ledger closed over there is no number to qualify — see
            LEDGER_CLOSED_MARK_BG. It wraps rather than forcing the title into a
            column: „без допълнителни изпитни точки" is 29 characters against
            13 for „−10 изпитни т.", and `whitespace-nowrap` on that would
            squeeze «Непропускане на пътно превозно средство с предимство» off
            the row on a phone. */}
        {examBilled ? (
          <span
            className="shrink-0 whitespace-nowrap text-xs font-black tabular-nums"
            style={{ color: SEVERITY_TONE[event.severityClass] }}
          >
            {minusPointsBg("exam", event.points)}
          </span>
        ) : (
          <span className="shrink-0 max-w-[11rem] text-right text-xs font-black text-muted">
            {LEDGER_CLOSED_MARK_BG}
          </span>
        )}
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {mark.classBg} грешка · наказателни точки по изпитния лист · {mark.citationBg}
      </p>

      {/* Directly under the mark it qualifies, because the two are one
          statement and a reader who meets them apart reconciles them himself —
          which is the reconciliation this lane exists to stop asking for. */}
      {!examBilled ? (
        <p className="rounded-md border border-border-strong bg-surface-2 p-1.5 text-[11px] font-semibold leading-relaxed">
          {LEDGER_CLOSED_NOTE_BG}
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-muted">{event.explanationBg}</p>

      {/* THE OTHER PROVISION. The mark above comes from приложение № 5, т. 10;
          ENDING an exam is чл. 48, ал. 3 and reaches only повторна намеса and
          допускане на ПТП. The row said neither — it printed a 10 and let the
          reader guess whether the drive was over. `terminatesExam` is the
          catalogue's own flag, so a class can never imply this again. */}
      {mark.terminatesExam ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 p-1.5 text-[11px] font-semibold leading-relaxed">
          Тази грешка спира самия изпит: „{mark.terminationQuoteBg}“ —{" "}
          {mark.terminationCitationBg}.
        </p>
      ) : null}

      {correctiveBg !== null ? (
        <p className="text-xs font-semibold leading-relaxed">
          <span className="text-success">✔ Правилното действие:</span> {correctiveBg}
        </p>
      ) : null}

      {covered !== null ? (
        <OffenceCoveredBlock covered={covered} />
      ) : (
        <RoadConsequenceBlock event={event} alsoCovers={billing?.alsoCovers ?? []} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Cite>{event.lawRef}</Cite>
        <span className="text-[10px] tabular-nums text-muted">в {atBg}</span>
      </div>
    </>
  );
}

/**
 * The section-level disambiguation, rendered once above the list rather than
 * on every row. This is the sentence the founder's misreading asked for.
 */
export function ThreeSystemsNote() {
  return (
    <p className="rounded-lg border border-border bg-surface-2 p-2 text-[11px] leading-relaxed text-muted">
      {EXAM_VS_CONTROL_POINTS_BG}
    </p>
  );
}
