import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth";
import {
  BAND_MIN_SAMPLES,
  CALIBRATION_MIN_SAMPLES,
  EXAM_KIND_LABELS_BG,
  FRESH_REPORT_LAG_DAYS,
  getCalibrationOverview,
  type Calibration,
} from "@/modules/outcomes";

export const metadata: Metadata = {
  title: "Калибрация на готовността · Книжка.AI",
  description: "Вътрешен изглед: прогнозите ни срещу реалните резултати от ДАИ.",
  robots: { index: false, follow: false },
};

// Reads the outcome table live; a cached calibration is a misleading one.
export const dynamic = "force-dynamic";

/**
 * INTERNAL calibration view (audit M-4 / I-5) — /review/calibration.
 *
 * Unlike the rest of /review this must work in PRODUCTION, because that is
 * the only place the data exists, so it is gated on User.role === "admin"
 * rather than on NODE_ENV. The gate is notFound(), not a 403: an internal
 * tool should not confirm its own existence to a logged-in student.
 *
 * What it deliberately CANNOT do: name a student. The module's calibration
 * read returns rows with no id and no userId (modules/outcomes/store.ts), so
 * there is nothing here to leak even by accident.
 *
 * Expect it to read „твърде малко данни" for a long time. That is the honest
 * state of the north-star claim until the reports accrue — and showing the
 * distance to a usable sample is more useful than showing a pass rate off
 * four reports, which would read as evidence and is not.
 */
export default async function CalibrationPage() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();

  const calibrations = await getCalibrationOverview();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header>
        <span className="hud-label">Вътрешен изглед · само админ</span>
        <h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">
          Калибрация на готовността
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Когато приложението каже „почти си готов“ — оказва ли се вярно?
          Сравнява оценката за готовност, замразена в момента на съобщаването,
          с това, което студентът е съобщил за истинския изпит в ДАИ. Само
          агрегати: тази страница няма достъп до отделни ученици.
        </p>
      </header>

      {calibrations.map((c) => (
        <CalibrationCard key={c.kind} calibration={c} />
      ))}

      <p className="text-xs leading-relaxed text-muted">
        Методика: прогнозираната вероятност е готовност/100. „Отклонение“ =
        средна прогноза − реален дял успех; положително означава, че сме
        по-самоуверени от реалността (по-вредната посока). Brier =
        средно (прогноза − резултат)², по-ниско е по-добре — за разлика от
        отклонението, там уверено-грешно и плахо-вярно не се неутрализират.
        Изключваме съобщения, направени повече от {FRESH_REPORT_LAG_DAYS} дни
        след изпита: готовността затихва по дизайн, така че късното съобщение
        сдвоява потънала оценка със стар резултат.
      </p>
    </div>
  );
}

function CalibrationCard({ calibration: c }: { calibration: Calibration }) {
  const hasSignal = c.overallPassRate !== null;

  return (
    <section
      aria-labelledby={`calibration-${c.kind}`}
      className="hud-panel flex flex-col gap-4 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={`calibration-${c.kind}`}
          className="font-display text-lg font-extrabold"
        >
          {EXAM_KIND_LABELS_BG[c.kind]}
        </h2>
        <span className="hud-label">
          {c.usedReports} използвани · {c.totalReports} общо
          {c.staleExcluded > 0 ? ` · ${c.staleExcluded} закъснели` : ""}
        </span>
      </div>

      {c.kind === "practical" ? (
        // Stated once, where it can mislead: readiness is a THEORY estimate.
        <p className="text-xs leading-relaxed text-muted">
          Внимание: оценката за готовност мери теоретични знания. За кормуване
          сдвояването си струва да се събира, но е по-слабо твърдение.
        </p>
      ) : null}

      {hasSignal ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Реален успех" value={percent(c.overallPassRate)} />
          <Stat label="Средна прогноза" value={percent(c.meanPredicted)} />
          <Stat
            label="Отклонение"
            value={signedPercentagePoints(c.calibrationGap)}
            tone={
              c.calibrationGap !== null && c.calibrationGap > 0.05
                ? "danger"
                : "neutral"
            }
          />
          <Stat label="Brier" value={c.brierScore?.toFixed(3) ?? "—"} />
        </dl>
      ) : (
        <p className="rounded-lg border border-hair bg-surface-2/40 p-4 text-sm leading-relaxed text-muted">
          Твърде малко данни за извод. Нужни са поне {CALIBRATION_MIN_SAMPLES}{" "}
          навременни съобщения — остават{" "}
          <span className="font-mono font-bold tabular-nums text-foreground">
            {c.reportsUntilSignal}
          </span>
          . Дотогава твърдението „правим по-добри шофьори“ остава недоказано, а
          не опровергано.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            Реален дял успех по ленти на оценката за готовност
          </caption>
          <thead>
            <tr className="border-b border-hair text-left">
              <th scope="col" className="hud-label py-2">Лента</th>
              <th scope="col" className="hud-label py-2 text-right">Съобщения</th>
              <th scope="col" className="hud-label py-2 text-right">Взети</th>
              <th scope="col" className="hud-label py-2 text-right">Реален успех</th>
              <th scope="col" className="hud-label py-2 text-right">Прогноза</th>
            </tr>
          </thead>
          <tbody>
            {c.bands.map((b) => (
              <tr key={b.minScore} className="border-b border-hair/50">
                <th scope="row" className="py-2 text-left font-semibold">
                  {b.labelBg}{" "}
                  <span className="font-mono text-xs text-muted">
                    {b.minScore}–{b.maxScore}
                  </span>
                </th>
                <td className="py-2 text-right font-mono tabular-nums">{b.n}</td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {b.passedCount}
                </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {b.passRate !== null ? (
                    percent(b.passRate)
                  ) : (
                    <span className="text-muted" title={`Нужни са поне ${BAND_MIN_SAMPLES}`}>
                      —
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-muted">
                  {percent(b.meanPredicted)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {c.firstExamOn && c.lastExamOn ? (
        <p className="text-xs text-muted">
          Обхванати изпити: {DAY_FORMAT.format(c.firstExamOn)} —{" "}
          {DAY_FORMAT.format(c.lastExamOn)}
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="rounded-lg border border-hair bg-surface-2/40 p-3">
      <dt className="hud-label">{label}</dt>
      <dd
        className={`mt-1 font-mono text-lg font-bold tabular-nums ${
          tone === "danger" ? "text-danger" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

const DAY_FORMAT = new Intl.DateTimeFormat("bg-BG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * PERCENTAGE POINTS, NOT „ТОЧКИ". `calibrationGap` is the difference between
 * two probabilities, so ×100 makes it a spread in percentage points — and this
 * function rendered it as „+7 т.", the same abbreviation the simulator uses for
 * наказателни точки, on a card sitting between three plain percentages. It is
 * the fifth thing in this product that counted in „т." and the only one that
 * was never points at all. „п.п." is the standard Bulgarian abbreviation.
 */
function signedPercentagePoints(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? "+" : ""}${rounded} п.п.`;
}
