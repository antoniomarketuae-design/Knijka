import "@/lib/content/loader";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import {
  EXAM_DURATION_SEC,
  EXAM_PASS_POINTS,
  EXAM_QUESTION_COUNT,
  ExamError,
  buildExam,
  getExamHistory,
  type ExamHistoryEntry,
} from "@/modules/exam";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { StoredReview } from "@/components/exam/StoredReview";
import { formatClock, seedCookieName } from "@/components/exam/types";
import { Gauge } from "@/components/hud/Gauge";
import { Celebration } from "@/components/hud/Celebration";

export const metadata: Metadata = {
  title: "Пробен изпит · Книжка.AI",
};

/**
 * Attempt route: in-progress -> the runner (questions rebuilt
 * deterministically from the seed cookie, elapsed time from the server
 * clock); completed -> result summary + cached full review.
 */
export default async function ExamAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const user = await requireUser();

  const history = await getExamHistory(user.id);
  const entry = history.find((e) => e.attemptId === attemptId);
  if (!entry) redirect("/exams?msg=not-found");

  if (entry.status === "completed") {
    return <CompletedAttemptView entry={entry} />;
  }

  // In-progress: rebuild the exact same safe question set from the seed.
  const cookieStore = await cookies();
  const rawSeed = cookieStore.get(seedCookieName(attemptId))?.value;
  const seed = rawSeed === undefined ? Number.NaN : Number(rawSeed);
  if (!Number.isInteger(seed) || seed < 0) {
    return <CannotRestoreView />;
  }

  let questions;
  try {
    questions = buildExam(seed).questions;
  } catch (err) {
    // Content bank changed since the attempt started — cannot rebuild safely.
    if (err instanceof ExamError) return <CannotRestoreView />;
    throw err;
  }

  const initialElapsedSec = Math.max(
    0,
    Math.floor((Date.now() - entry.startedAt.getTime()) / 1000),
  );

  return (
    <ExamRunner
      attemptId={attemptId}
      questions={questions}
      durationSec={EXAM_DURATION_SEC}
      initialElapsedSec={initialElapsedSec}
    />
  );
}

function CompletedAttemptView({ entry }: { entry: ExamHistoryEntry }) {
  const timeUsedSec =
    entry.finishedAt !== null
      ? Math.max(
          0,
          Math.round(
            (entry.finishedAt.getTime() - entry.startedAt.getTime()) / 1000,
          ),
        )
      : undefined;

  const score = entry.score ?? 0;
  const maxScore = entry.maxScore;
  const passPoints = EXAM_PASS_POINTS;
  const passed = entry.passed === true;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/exams" className="text-sm font-bold text-accent">
          ← Всички изпити
        </Link>
      </div>

      <ScoreReadout
        score={score}
        maxScore={maxScore}
        passPoints={passPoints}
        passed={passed}
        timeUsedSec={timeUsedSec}
      />

      {passed ? (
        <Celebration
          show
          title="Взе изпита!"
          subtitle={`Издържа с ${score} от ${maxScore} точки — над прага ${passPoints}. Готов си за изпитния ден.`}
        />
      ) : null}

      <StoredReview attemptId={entry.attemptId} />
    </div>
  );
}

/**
 * The completed-attempt score, told as an instrument readout: the score sits
 * in the signature Gauge (mapped to the official 97-point scale), the verdict
 * and the ≥87 pass line are called out in HUD telemetry, and a threshold rail
 * shows exactly where the score landed against the pass mark.
 */
function ScoreReadout({
  score,
  maxScore,
  passPoints,
  passed,
  timeUsedSec,
}: {
  score: number;
  maxScore: number;
  passPoints: number;
  passed: boolean;
  timeUsedSec?: number;
}) {
  const fillPct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0;
  const threshPct = maxScore > 0 ? Math.min(100, (passPoints / maxScore) * 100) : 0;
  const verdictColor = passed ? "var(--success)" : "var(--danger)";
  const margin = passed ? score - passPoints : passPoints - score;
  const marginLabel = passed
    ? `+${margin} т. над прага`
    : `${margin} т. до прага`;

  return (
    <section
      aria-labelledby="exam-result-title"
      className="hud-panel relative overflow-hidden p-6 sm:p-8"
    >
      <div aria-hidden className="hud-grid absolute inset-0 opacity-[0.12]" />

      <div className="relative flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:gap-10">
        {/* Signature instrument: score on the official 97-point scale */}
        <Gauge
          value={score}
          max={maxScore}
          size={216}
          tone={passed ? "cyan" : "brand"}
          unit={`/ ${maxScore}`}
          format={(n) => String(n)}
          ariaLabel={`Резултат: ${score} от ${maxScore} точки. ${
            passed ? "Изпитът е издържан" : "Изпитът не е издържан"
          }. Праг за успех ${passPoints} точки.`}
        />

        {/* Telemetry column */}
        <div className="flex w-full flex-1 flex-col items-center gap-4 sm:items-start">
          <span className="hud-label">Пробен изпит · Резултат</span>

          <div className="flex flex-col items-center gap-3 sm:items-start">
            <h2
              id="exam-result-title"
              className="font-display text-3xl font-black leading-none sm:text-4xl"
              style={{ color: verdictColor }}
            >
              {passed ? "Изпитът е издържан" : "Изпитът не е издържан"}
            </h2>
            <span
              className="font-mono text-sm font-bold uppercase tracking-wide tabular-nums"
              style={{ color: verdictColor }}
            >
              {marginLabel}
            </span>
          </div>

          {/* Pass-threshold rail */}
          <div className="w-full max-w-sm">
            <div className="relative h-3 w-full">
              <div className="h-full w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${fillPct}%`,
                    background: verdictColor,
                    boxShadow: `0 0 12px ${verdictColor}`,
                  }}
                />
              </div>
              {/* 87-point pass marker */}
              <div
                aria-hidden
                className="absolute top-[-3px] h-[calc(100%+6px)] w-0.5 bg-accent shadow-glow-sm"
                style={{ left: `${threshPct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between hud-label">
              <span>0 т.</span>
              <span className="text-accent">праг {passPoints}</span>
              <span>{maxScore} т.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Format telemetry tiles */}
      <dl className="relative mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ReadoutTile label="Въпроси" value={String(EXAM_QUESTION_COUNT)} />
        <ReadoutTile label="Праг за успех" value={`≥ ${passPoints}`} accent />
        <ReadoutTile label="Загубени точки" value={String(Math.max(0, maxScore - score))} />
        <ReadoutTile
          label="Използвано време"
          value={timeUsedSec !== undefined ? formatClock(timeUsedSec) : "—"}
        />
      </dl>
    </section>
  );
}

function ReadoutTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-1 rounded-xl border border-hair bg-surface-2/60 px-3 py-3 text-center">
      <dt className="hud-label">{label}</dt>
      <dd
        className={`font-mono text-xl font-bold tabular-nums ${
          accent ? "text-accent-2" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function CannotRestoreView() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/exams" className="text-sm font-bold text-accent">
          ← Всички изпити
        </Link>
      </div>

      <section className="card flex flex-col items-start gap-3 p-6">
        <h1 className="text-lg font-extrabold">
          Този опит не може да бъде продължен
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Незавършен изпит може да се продължи само на устройството и в
          браузъра, в които е започнат. Опитът остава отбелязан като
          „незавършен“ в историята — започни нов пробен изпит, когато си
          готов.
        </p>
        <Link href="/exams" className="btn-accent">
          Към пробните изпити
        </Link>
      </section>
    </div>
  );
}
