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
  EXAM_VS_CONTROL_POINTS_BG,
  EXCESS_ROUNDING_NOTE_BG,
  controlPointsTightBg,
  deriveSpeedingBand,
  examMarkFor,
  formatEur,
  instrumentLabelBg,
  parseSpeedMeasurement,
  minusPointsBg,
  pointsWordsBg,
  roadConsequenceFor,
  withEurBg,
  type ControlPointsFigure,
  type FineFigure,
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

function RoadConsequenceBlock({ event }: { event: ViolationEvent }) {
  const road = roadConsequenceFor(event.code);
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
}

export function FaultCard({ event, correctiveBg, atBg }: FaultCardProps) {
  const mark = examMarkFor(event.code);

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{event.titleBg}</span>
        {/* THE QUALIFIER. „−10 т." is what the founder misread; the unit is
            now on the number itself, not left to the reader. */}
        <span
          className="shrink-0 whitespace-nowrap text-xs font-black tabular-nums"
          style={{ color: SEVERITY_TONE[event.severityClass] }}
        >
          {minusPointsBg("exam", event.points)}
        </span>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {mark.classBg} грешка · наказателни точки по изпитния лист · {mark.citationBg}
      </p>

      <p className="text-xs leading-relaxed text-muted">{event.explanationBg}</p>

      {correctiveBg !== null ? (
        <p className="text-xs font-semibold leading-relaxed">
          <span className="text-success">✔ Правилното действие:</span> {correctiveBg}
        </p>
      ) : null}

      <RoadConsequenceBlock event={event} />

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
