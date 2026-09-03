import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import {
  CALIBRATION_BEYOND_SCALE_TITLE_BG,
  CALIBRATION_MIN_SAMPLES,
  CALIBRATION_TREND_BG,
  CALIBRATION_VERDICT_TITLE_BG,
  MAX_PREDICTED_POINTS,
  formatCalibrationError,
  summarizeCalibration,
  type CalibrationPoint,
  type CalibrationSummary,
} from "@/modules/learning";
// Deep import: the calibration STORE is the server half (Prisma) and stays off
// the learning barrel, which client-reachable code imports for the pure copy.
import { getCalibrationStore } from "@/modules/learning/calibrationStore";
import { lessonById, parseScenarioLessonId, scenarioById } from "@/modules/sim/lessons";
import { pointsBg } from "@/modules/sim/rules";

export const metadata: Metadata = {
  title: "Позна ли се? · Книжка.AI",
  description: "Колко точна е собствената ти преценка за собственото ти каране.",
  robots: { index: false, follow: false },
};

// Reads the student's own rows live; a cached calibration curve is a lie by
// one drive, and one drive is the whole sample early on.
export const dynamic = "force-dynamic";

/**
 * „Позна ли се?" — the student's own calibration trend (doc 82 §5.3 I1).
 *
 * Every finished drive asks the student to predict their official result
 * before the debrief unlocks. This page is the accumulated answer: how far off
 * they usually are, in which DIRECTION, and whether the gap is closing.
 *
 * The direction is the point. `error = predicted − actual`, so a negative
 * number means the student thought they drove better than the engine says —
 * the documented novice failure mode (Gregersen 1996; Mynttinen 2009 found
 * only 25–50% of licence candidates self-assess realistically), and the one
 * that transfers to the road as "I didn't see anything wrong with that".
 *
 * NOT to be confused with /review/calibration, which is the INTERNAL,
 * admin-only pairing of our readiness score against real ДАИ outcomes. This
 * one is the student's own mirror and is theirs alone: it reads only their
 * rows, and there is nothing here that could name anyone else.
 */
export default async function SelfCalibrationPage() {
  const user = await requireUser();
  const records = await getCalibrationStore()
    .list(user.id)
    .catch(() => []);
  const summary = summarizeCalibration(records);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <span className="hud-label">Симулатор · самооценка</span>
        <h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">Позна ли се?</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Преди всеки разбор те питаме колко наказателни точки мислиш, че си
          направил. Тук е разликата между твоя отговор и този на изпитната
          логика — не колко добре караш, а колко добре се ЧЕТЕШ, докато караш.
          Това е умението, което на истинския изпит решава дали ще се усетиш
          навреме.
        </p>
      </header>

      {summary.sampleCount === 0 ? (
        <p className="rounded-lg border border-hair bg-surface-2/40 p-4 text-sm leading-relaxed text-muted">
          Още нямаш нито една оценка. Изкарай едно каране в симулатора и отговори
          на въпроса „Позна ли се?“ преди резултата —{" "}
          <Link href="/simulator" className="font-semibold text-accent">
            към симулатора
          </Link>
          .
        </p>
      ) : (
        <>
          <SummaryCard summary={summary} />
          <TrendChart points={summary.points} />
          <HistoryTable points={summary.points} />
        </>
      )}
    </div>
  );
}

function SummaryCard({ summary }: { summary: CalibrationSummary }) {
  // Negative mean error = habitual optimism. It is the only direction that
  // gets the danger tone: being harsh on yourself costs hesitation, being
  // generous with yourself costs the thing you never noticed.
  const optimistic = summary.meanError !== null && summary.meanError < 0;

  return (
    <section aria-label="Обобщение" className="hud-panel flex flex-col gap-4 p-5 sm:p-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Оценени карания" value={String(summary.sampleCount)} />
        <Stat
          label="Средна разлика"
          value={summary.meanError === null ? "—" : formatCalibrationError(summary.meanError)}
          tone={optimistic ? "danger" : "neutral"}
        />
        <Stat
          label="Средна грешка"
          value={
            summary.meanAbsError === null
              ? "—"
              : `${summary.meanAbsError.toFixed(1)} изпитни т.`
          }
        />
        <Stat
          label="Позната присъда"
          value={
            summary.verdictAgreementRate === null
              ? "—"
              : `${Math.round(summary.verdictAgreementRate * 100)}%`
          }
        />
      </dl>

      <p className="text-sm leading-relaxed">
        {summary.trend !== null ? (
          CALIBRATION_TREND_BG[summary.trend]
        ) : (
          <>
            Още {summary.samplesUntilTrend}{" "}
            {summary.samplesUntilTrend === 1 ? "каране" : "карания"} до първата
            тенденция — под {CALIBRATION_MIN_SAMPLES} записа всяка линия тук би
            била шум, представен като извод.
          </>
        )}
      </p>

      {/* THE EXCLUSION SAYS ITSELF. `summarizeCalibration` keeps drives whose
          protocol went past the gate's ceiling out of the two means and the
          trend, and a silent exclusion is the same crime as a false verdict:
          the tiles would be computed over fewer records than the counter above
          them prints, with nothing on screen to say why. */}
      {summary.beyondScaleCount > 0 ? (
        <p className="text-xs leading-relaxed text-muted">
          {summary.beyondScaleCount === 1 ? "Едно каране е" : `${summary.beyondScaleCount} карания са`}{" "}
          извън скалата на въпроса — протоколът им мина над {MAX_PREDICTED_POINTS}{" "}
          наказателни точки, а полето приема най-много толкова, така че разликата там
          е таван, не преценка. Стоят в списъка, но не влизат в средните стойности
          и в тенденцията.
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-muted">
        Не позна ли се?{" "}
        <Link href="/review/my-drive" className="font-semibold text-accent">
          Изгледай самото каране отвън
        </Link>{" "}
        — грешките, които не си усетил, се виждат най-добре на забавен каданс.
      </p>

      <p className="text-xs leading-relaxed text-muted">
        Как се чете: разликата е „твоята прогноза минус реалния резултат“.
        Отрицателна значи, че си се оценил по-високо, отколкото е било —
        посоката, която боли на изпита. „Средна грешка“ не позволява на
        прекалено строгите и прекалено щедрите прогнози да се неутрализират
        взаимно.
      </p>
    </section>
  );
}

/**
 * The trend, as a bar per drive around a zero line: bars below the line are
 * drives the student flattered themselves on. Server-rendered SVG — no client
 * JS, no chart library, and it reads identically with images off because the
 * table below carries the same numbers.
 */
function TrendChart({ points }: { points: CalibrationPoint[] }) {
  const W = 640;
  const H = 180;
  const PAD = 18;
  // ── SCALED ON THE DRIVES THE CHART IS ABOUT ───────────────────────────────
  // A beyond-scale drive's `error` is the distance from the form's ceiling to
  // the protocol, not a judgement (`calibration.ts:isBeyondPredictableScale`),
  // and one of them at −364 flattens every honest bar in the series to a
  // hairline. Those drives keep their bar — they happened — but they are drawn
  // at full height in the muted tone and take no part in the scale.
  const maxAbs = Math.max(
    1,
    ...points.filter((p) => !p.beyondScale).map((p) => Math.abs(p.error)),
  );
  const midY = H / 2;
  const usable = midY - PAD;
  const slot = (W - 2 * PAD) / Math.max(points.length, 1);
  const barW = Math.max(3, Math.min(28, slot * 0.6));

  return (
    <section aria-label="Тенденция" className="hud-panel flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">Разлика по карания</h2>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Разлика между прогноза и резултат за последните ${points.length} карания`}
          className="w-full min-w-[420px]"
        >
          {/* Zero line = „познах се точно". */}
          <line
            x1={PAD}
            y1={midY}
            x2={W - PAD}
            y2={midY}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
          {points.map((p, i) => {
            const cx = PAD + slot * (i + 0.5);
            const h = p.beyondScale
              ? usable
              : Math.min((Math.abs(p.error) / maxAbs) * usable, usable);
            const optimistic = p.error < 0;
            return (
              <rect
                key={p.simSessionId}
                x={cx - barW / 2}
                y={optimistic ? midY : midY - h}
                width={barW}
                height={Math.max(h, 1)}
                rx={2}
                fill={
                  // Muted, not red: the student was not flattering himself, the
                  // question was smaller than the protocol.
                  p.beyondScale
                    ? "var(--border-strong)"
                    : p.verdict === "accurate"
                      ? "var(--success)"
                      : optimistic
                        ? "var(--danger)"
                        : "var(--warning)"
                }
              />
            );
          })}
        </svg>
      </div>
      <p className="text-[11px] font-semibold text-muted">
        Под линията = оценил си се по-високо от изпита · над линията = бил си
        по-строг · зелено = позна се
      </p>
    </section>
  );
}

function HistoryTable({ points }: { points: CalibrationPoint[] }) {
  // Newest first here (the chart runs oldest → newest; a list reads the other
  // way round).
  const rows = [...points].reverse();
  return (
    <section aria-label="Записи" className="hud-panel flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">Записи</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-hair text-left">
              <th scope="col" className="hud-label py-2">Каране</th>
              <th scope="col" className="hud-label py-2 text-right">Твоята прогноза</th>
              <th scope="col" className="hud-label py-2 text-right">Реално</th>
              <th scope="col" className="hud-label py-2 text-right">Разлика</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.simSessionId} className="border-b border-hair/50">
                <th scope="row" className="py-2 text-left font-semibold">
                  {lessonTitleFor(p.lessonId)}
                  <span className="ml-2 font-normal text-xs text-muted">
                    {DAY_FORMAT.format(p.recordedAt)}
                  </span>
                  {/* The verdict wording is withheld on a drive whose protocol
                      went past what the gate would let the student type — the
                      same branch the gate itself takes, from the same module,
                      so the two screens cannot say different things about one
                      record. */}
                  <span className="block text-xs font-normal text-muted">
                    {p.beyondScale
                      ? CALIBRATION_BEYOND_SCALE_TITLE_BG
                      : CALIBRATION_VERDICT_TITLE_BG[p.verdict]}
                    {p.verdictAgreed ? "" : " · сгреши и присъдата"}
                  </span>
                </th>
                {/* The same наказателни точки the gate asked him to predict —
                    named here too, because a trend page is where a student
                    stares at the number longest. */}
                <td className="py-2 text-right font-mono tabular-nums">
                  {pointsBg("exam", p.predictedPoints)}
                </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {pointsBg("exam", p.actualPoints)}
                </td>
                <td
                  className={`py-2 text-right font-mono font-bold tabular-nums ${
                    p.error < 0 ? "text-danger" : "text-foreground"
                  }`}
                >
                  {formatCalibrationError(p.error)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

/**
 * Stored lessonId → a human name. Scenario sessions are `<templateId>@L<n>`,
 * curriculum lessons are plain ids, and a row whose lesson has since been
 * renamed or retired falls back to the raw id rather than an empty cell — the
 * record is still evidence even when the lesson is gone.
 */
function lessonTitleFor(lessonId: string): string {
  const scenarioRef = parseScenarioLessonId(lessonId);
  if (scenarioRef !== null) {
    const spec = scenarioById(scenarioRef.templateId);
    if (spec !== undefined) return `${spec.titleBg} · ниво ${scenarioRef.level}`;
  }
  return lessonById(lessonId)?.titleBg ?? lessonId;
}

const DAY_FORMAT = new Intl.DateTimeFormat("bg-BG", {
  day: "numeric",
  month: "short",
});
