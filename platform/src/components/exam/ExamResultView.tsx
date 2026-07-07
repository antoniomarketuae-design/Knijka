/**
 * Presentational result screen: big score card + full per-question review.
 * Pure props, no state — renders in the server tree (completed attempts) and
 * inside the client runner right after submission.
 */

import {
  formatClock,
  type ResultSummary,
  type ReviewQuestion,
} from "./types";

// ---------------------------------------------------------------------------
// Score summary card
// ---------------------------------------------------------------------------

export function ScoreSummaryCard({
  score,
  maxScore,
  passPoints,
  passed,
  late,
  timeUsedSec,
}: {
  score: number;
  maxScore: number;
  passPoints: number;
  passed: boolean;
  /** Unknown for attempts loaded from history — omit to hide the note. */
  late?: boolean;
  timeUsedSec?: number;
}) {
  return (
    <section
      aria-labelledby="exam-result-title"
      className="card flex flex-col items-center gap-4 p-6 sm:p-8"
    >
      <h2 id="exam-result-title" className="text-base font-extrabold text-muted">
        Резултат от пробния изпит
      </h2>

      <p className="flex items-baseline gap-2">
        <span
          className={`text-6xl font-black tabular-nums ${
            passed ? "text-success" : "text-danger"
          }`}
        >
          {score}
        </span>
        <span className="text-xl font-bold text-muted">/ {maxScore} точки</span>
      </p>

      <p
        className={`rounded-full px-4 py-1.5 text-sm font-black uppercase tracking-wide ${
          passed ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
        }`}
      >
        {passed ? "Издържан" : "Неиздържан"}
      </p>

      {late ? (
        <p className="text-center text-sm font-semibold text-warning">
          Времето изтече — при просрочие изпитът се счита за неиздържан,
          но отговорите ти са оценени.
        </p>
      ) : null}

      <dl className="mt-2 grid w-full grid-cols-1 gap-2 text-center sm:grid-cols-3">
        <SummaryStat label="Праг за успех" value={`≥ ${passPoints} точки`} />
        <SummaryStat
          label="Загубени точки"
          value={String(Math.max(0, maxScore - score))}
        />
        <SummaryStat
          label="Използвано време"
          value={timeUsedSec !== undefined ? formatClock(timeUsedSec) : "—"}
        />
      </dl>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-surface-2 px-3 py-2.5">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="text-lg font-black tabular-nums">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full review list
// ---------------------------------------------------------------------------

export function ReviewList({ review }: { review: ReviewQuestion[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {review.map((q, i) => (
        <li key={q.questionId}>
          <ReviewCard question={q} number={i + 1} />
        </li>
      ))}
    </ol>
  );
}

function ReviewCard({
  question: q,
  number,
}: {
  question: ReviewQuestion;
  number: number;
}) {
  return (
    <article
      aria-label={`Въпрос ${number}: ${q.correct ? "верен" : "грешен"} отговор`}
      className="card flex flex-col gap-3 p-5"
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-muted">Въпрос {number}</span>
        {!q.answered ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-bold text-muted">
            Без отговор
          </span>
        ) : null}
        <span
          className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums ${
            q.correct
              ? "bg-success/15 text-success"
              : "bg-danger/15 text-danger"
          }`}
        >
          {q.pointsAwarded} от {q.maxPoints} т.
        </span>
      </header>

      <h3 className="text-base font-bold leading-snug">{q.textBg}</h3>

      <ul className="flex flex-col gap-2">
        {q.options.map((o) => (
          <ReviewOptionRow
            key={o.id}
            textBg={o.textBg}
            correct={o.correct}
            chosen={o.chosen}
          />
        ))}
      </ul>

      {q.explanationBg ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm leading-relaxed">
          <strong className="font-bold">Обяснение:</strong> {q.explanationBg}
        </p>
      ) : null}

      {q.lawRefs.length > 0 ? (
        <ul aria-label="Правни основания" className="flex flex-wrap gap-1.5">
          {q.lawRefs.map((l, i) => (
            <li
              key={`${l.act}-${l.ref}-${i}`}
              className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted"
            >
              {l.act} · {l.ref}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function ReviewOptionRow({
  textBg,
  correct,
  chosen,
}: {
  textBg: string;
  correct: boolean;
  chosen: boolean;
}) {
  let frame = "border-border text-muted";
  let tag: string | null = null;
  let tagClass = "";

  if (correct && chosen) {
    frame = "border-success/60 bg-success/10";
    tag = "Твоят отговор — верен";
    tagClass = "text-success";
  } else if (correct) {
    frame = "border-success/60";
    tag = "Верен отговор";
    tagClass = "text-success";
  } else if (chosen) {
    frame = "border-danger/60 bg-danger/10";
    tag = "Твоят отговор — грешен";
    tagClass = "text-danger";
  }

  return (
    <li
      className={`flex flex-col gap-1 rounded-xl border p-3 text-sm leading-relaxed sm:flex-row sm:items-start sm:justify-between sm:gap-3 ${frame}`}
    >
      <span className={correct || chosen ? "text-foreground" : undefined}>
        {textBg}
      </span>
      {tag ? (
        <span className={`shrink-0 text-xs font-bold ${tagClass}`}>{tag}</span>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Composition: summary + review
// ---------------------------------------------------------------------------

export function ExamResultView({
  summary,
  review,
}: {
  summary: ResultSummary;
  review: ReviewQuestion[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <ScoreSummaryCard
        score={summary.score}
        maxScore={summary.maxScore}
        passPoints={summary.passPoints}
        passed={summary.passed}
        late={summary.late}
        timeUsedSec={summary.timeUsedSec}
      />
      <section aria-labelledby="exam-review-title" className="flex flex-col gap-3">
        <h2 id="exam-review-title" className="text-base font-extrabold">
          Преглед на въпросите
        </h2>
        <ReviewList review={review} />
      </section>
    </div>
  );
}
