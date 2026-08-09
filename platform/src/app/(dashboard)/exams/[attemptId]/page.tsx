import "@/lib/content/loader";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  POINT_SCALES,
  THEORY_EXAM_SCORE_NOTE_BG,
  pointsBg,
  pointsOutOfBg,
  pointsScaleLabelBg,
  pointsWordsBg,
} from "@/lib/content/pointScales";
import { requireUser } from "@/modules/auth";
import {
  EXAM_DURATION_SEC,
  EXAM_PASS_POINTS,
  EXAM_QUESTION_COUNT,
  getExamAttemptView,
  getExamHistory,
  getExamReview,
  type ExamHistoryEntry,
  type ExamReview,
  type ExamTopicResult,
} from "@/modules/exam";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { ReviewList } from "@/components/exam/ExamResultView";
import { formatClock } from "@/components/exam/types";
import { Gauge } from "@/components/hud/Gauge";
import { Celebration } from "@/components/hud/Celebration";

export const metadata: Metadata = {
  title: "Пробен изпит · Книжка.AI",
};

/**
 * Attempt route: in-progress -> the runner (the exact questions dealt at start,
 * read back from the attempt row, elapsed time from the server clock);
 * completed -> score readout + per-topic breakdown + the full review, all
 * rebuilt server-side from the attempt row so they work on any device.
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
    // Rebuilt from the attempt row, not from this browser's localStorage: a
    // failed exam used to become a bare score on any other device (audit M-1),
    // which is the "verdict without a reason" THEO-4 forbids.
    const review = await getExamReview(user.id, attemptId);
    return <CompletedAttemptView entry={entry} review={review} />;
  }

  // In-progress: render EXACTLY what was dealt. Never re-derive the paper from
  // the seed — the builder reads the live bank, so one `needs-review →
  // approved` promotion mid-attempt deals a different paper while grading still
  // uses the stored ids, silently failing a perfect candidate (audit H-7).
  //
  // The VIEW, not the paper: the module now says WHY an attempt cannot be
  // shown, and the three reasons get three different screens. They used to
  // share one, which is how a stale attempt came to be told „един от въпросите
  // вече не е част от банката" — and, before that, to be auto-submitted and
  // failed at 0/97 without ever being rendered.
  const view = await getExamAttemptView(user.id, attemptId);

  if (view.status === "expired") {
    return <ExpiredAttemptView startedAt={view.startedAt} />;
  }
  if (view.status !== "in-progress") return <CannotRestoreView />;

  const initialElapsedSec = Math.max(
    0,
    Math.floor((Date.now() - view.exam.startedAt.getTime()) / 1000),
  );

  return (
    <ExamRunner
      attemptId={attemptId}
      questions={view.exam.questions}
      durationSec={EXAM_DURATION_SEC}
      initialElapsedSec={initialElapsedSec}
    />
  );
}

function CompletedAttemptView({
  entry,
  review,
}: {
  entry: ExamHistoryEntry;
  review: ExamReview | null;
}) {
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
          subtitle={`Издържа с ${pointsOutOfBg(
            "theory",
            score,
            maxScore,
          )} — над прага ${passPoints}. Готов си за изпитния ден.`}
        />
      ) : null}

      {review === null ? (
        <p className="card p-5 text-sm leading-relaxed text-muted">
          Пълният преглед на този опит не е достъпен. Резултатът остава в
          историята — започни нов пробен изпит, за да видиш подробния разбор.
        </p>
      ) : (
        <>
          <TopicBreakdown byTopic={review.byTopic} />

          <section
            aria-labelledby="exam-review-title"
            className="flex flex-col gap-3"
          >
            <h2 id="exam-review-title" className="text-base font-extrabold">
              Преглед на въпросите
            </h2>
            <ReviewList review={review.questions} />
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Per-topic breakdown — the part that turns 45 verdicts into a plan.
 *
 * A score tells a candidate they failed; this tells them which two topics cost
 * them the exam and takes them straight into practice for those (the same
 * „Тренирай темата" move the practice summary makes, PracticeSession.tsx).
 * Topics arrive in curriculum order from the exam module — no ranking logic
 * here, the view only decides what a row looks like.
 */
function TopicBreakdown({ byTopic }: { byTopic: ExamTopicResult[] }) {
  if (byTopic.length === 0) return null;
  const lostAnywhere = byTopic.some((t) => t.correct < t.questions);

  return (
    <section aria-labelledby="exam-topics-title" className="flex flex-col gap-3">
      <div>
        <h2 id="exam-topics-title" className="text-base font-extrabold">
          Резултат по теми
        </h2>
        <p className="mt-1 text-sm text-muted">
          {lostAnywhere
            ? `Оттук започва следващата тренировка — темите, в които изгуби ${pointsScaleLabelBg(
                "theory",
              )}.`
            : "Чисто по всички теми. Точно така изглежда готовността."}
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {byTopic.map((t) => (
          <li key={t.topicId}>
            <TopicRow topic={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TopicRow({ topic: t }: { topic: ExamTopicResult }) {
  const clean = t.correct === t.questions;
  const ratio = t.questions === 0 ? 1 : t.correct / t.questions;
  const tone = clean
    ? "text-success"
    : ratio >= 0.5
      ? "text-warning"
      : "text-danger";

  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={t.titleBg}>
          {t.titleBg}
        </p>
        {/* WAS „2 от 3 т." — a bare „т." on the row a failing candidate reads
            first, next to a „Тренирай темата" button. */}
        <p className="text-xs text-muted tabular-nums">
          {pointsOutOfBg("theory", t.points, t.maxPoints)}
        </p>
      </div>

      <span className={`font-mono text-sm font-bold tabular-nums ${tone}`}>
        {t.correct}/{t.questions}{" "}
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          верни
        </span>
      </span>

      {/* Only where there is something to fix — a "practise this" button on a
          topic the candidate aced is noise that devalues the ones that matter. */}
      {clean ? null : (
        <Link
          href={`/theory/practice?topic=${t.slug}`}
          className="btn-ghost shrink-0 px-4 py-2 text-xs"
        >
          Тренирай темата
        </Link>
      )}
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
  // WAS „+9 т. над прага" / „12 т. до прага". The single most-read line on the
  // screen after the verdict itself, and it named no scale at all.
  const marginLabel = passed
    ? `над прага с ${pointsBg("theory", margin)}`
    : `до прага остават ${pointsBg("theory", margin)}`;

  return (
    <section
      aria-labelledby="exam-result-title"
      className="hud-panel relative overflow-hidden p-6 sm:p-8"
    >
      <div aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-[0.12]" />

      <div className="relative flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:gap-10">
        {/* Signature instrument: score on the official 97-point scale */}
        {/*
          NB: Gauge is a Client Component — a Server Component may not pass it a
          function prop (Next throws "Functions cannot be passed directly to
          Client Components", 500ing every server-rendered completed attempt:
          history link, reload, direct nav). Gauge already renders the centre
          number as String(rounded value) by default, so we simply omit `format`.
        */}
        <Gauge
          value={score}
          max={maxScore}
          size={216}
          color={verdictColor}
          unit={`/ ${maxScore}`}
          /* Spoken, so the WORD form, not the abbreviation: a screen reader
             saying „т." says nothing, and „точки" alone says контролни точки. */
          ariaLabel={`Резултат: ${score} от ${pointsWordsBg(
            "theory",
            maxScore,
          )}. ${
            passed ? "Изпитът е издържан" : "Изпитът не е издържан"
          }. Праг за успех ${pointsWordsBg("theory", passPoints)}.`}
        />

        {/* Telemetry column */}
        <div className="flex w-full flex-1 flex-col items-center gap-4 sm:items-start">
          {/* The Gauge draws „74" over „/ 97" and can carry no unit of its own
              — so the scale is named in the label directly beside it, and again
              on the axis, the tiles and the note. */}
          <span className="hud-label">
            Пробен изпит · {POINT_SCALES.theory.nameBg}
          </span>

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
            {/* An axis, so the unit is written ONCE, at the end of it — „0 …
                праг 87 … 97 т. по теорията" — rather than „0 т. … 97 т." with
                neither one saying which т. this is. */}
            <div className="mt-2 flex justify-between hud-label">
              <span>0</span>
              <span className="text-accent">праг {passPoints}</span>
              <span>{pointsBg("theory", maxScore)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Format telemetry tiles */}
      <dl className="relative mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ReadoutTile label="Въпроси" value={String(EXAM_QUESTION_COUNT)} />
        <ReadoutTile
          label={`Праг — ${pointsScaleLabelBg("theory")}`}
          value={`≥ ${passPoints}`}
          accent
        />
        {/* WAS „Загубени точки" — the reading is „контролни точки". */}
        <ReadoutTile
          label={`Загубени ${pointsScaleLabelBg("theory")}`}
          value={String(Math.max(0, maxScore - score))}
        />
        <ReadoutTile
          label="Използвано време"
          value={timeUsedSec !== undefined ? formatClock(timeUsedSec) : "—"}
        />
      </dl>

      {/*
        THE SCALE, ON THE SCREEN THAT DELIVERS THE VERDICT.
        This is the theory half of B58. The sim's result screen carries
        `EXAM_VS_CONTROL_POINTS_BG`, which sets наказателни against контролни;
        this screen counts a THIRD system, and a student who has driven a lesson
        can now mistake it for either. The note names it, cites чл. 39, ал. 1
        and rules out both.
      */}
      <p className="relative mt-4 rounded-xl border border-hair bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">
        {THEORY_EXAM_SCORE_NOTE_BG}
      </p>
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

/**
 * „Този опит изтече" — an attempt reopened after the 40:00 + 30s window.
 *
 * THE SCREEN THIS REPLACES DID NOT EXIST. The route rendered the runner with
 * 00:00 on the clock, the runner auto-submitted an empty paper, and the
 * student read „Изпитът не е издържан — 0 от 97". A bare verdict, on an exam
 * they never sat, for the crime of losing signal on the tram. THEO-4 rules
 * that every verdict in this product comes with the reason attached; this one
 * had no reason because there was nothing to explain — the grade was an
 * artefact of our own clock arithmetic, not of anything the student did.
 *
 * So it says the true thing, names the cause, and gives back the next move.
 * The line about the free attempt is deliberate: a free student's ONE lifetime
 * mock exam is counted at start (payments/quota.ts — started attempts count),
 * so this failure can silently spend it. Rather than pretend otherwise, the
 * screen tells them it can be given back, and /admin has the button that does
 * it („нулирай безплатния опит").
 */
function ExpiredAttemptView({ startedAt }: { startedAt: Date }) {
  const startedLabel = new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Sofia",
  }).format(startedAt);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/exams" className="text-sm font-bold text-accent">
          ← Всички изпити
        </Link>
      </div>

      <section className="card flex flex-col items-start gap-3 p-6">
        <span className="hud-label">Пробен изпит · изтекъл опит</span>
        <h1 className="text-lg font-extrabold">Този опит изтече</h1>
        <p className="text-sm leading-relaxed text-muted">
          Започна го на {startedLabel}, а изпитът върви {EXAM_DURATION_SEC / 60}{" "}
          минути от момента на започването — затова листът вече е приключил и не
          може да бъде продължен.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Няма да те оценим по въпроси, които не си видял: този опит остава без
          резултат и не влиза в статистиката ти. Ако беше безплатният ти пробен
          изпит, пиши ни от{" "}
          <Link href="/contact" className="font-bold text-accent">
            страницата за контакт
          </Link>{" "}
          и ще ти го върнем.
        </p>
        <Link href="/exams" className="btn-accent">
          Започни нов пробен изпит
        </Link>
      </section>
    </div>
  );
}

/**
 * Shown only when the dealt paper genuinely cannot be reproduced — i.e. a
 * question from this attempt has been removed from банката since it started.
 * Continuing on another device or after clearing cookies is fine now that the
 * paper and its seed live on the attempt row (audit M-9).
 */
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
          Един от въпросите в този изпит вече не е част от банката, затова не
          можем да ти покажем същия лист. Няма да те оценим по въпроси, които
          не си виждал — опитът остава „незавършен“ в историята. Започни нов
          пробен изпит; ще получиш пълни 45 въпроса.
        </p>
        <Link href="/exams" className="btn-accent">
          Започни нов пробен изпит
        </Link>
      </section>
    </div>
  );
}
