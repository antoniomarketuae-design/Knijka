import "@/lib/content/loader";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import {
  EXAM_DURATION_SEC,
  EXAM_MAX_POINTS,
  EXAM_PASS_POINTS,
  EXAM_QUESTION_COUNT,
  getExamHistory,
  type ExamHistoryEntry,
} from "@/modules/exam";
import { formatClock } from "@/components/exam/types";
import { startExamAction } from "./actions";

export const metadata: Metadata = {
  title: "Пробни изпити · Книжка.AI",
  description:
    "Пробен изпит 1:1 с официалния формат: 45 въпроса, 97 точки, праг 87, 40 минути.",
};

const MESSAGES: Record<string, string> = {
  "not-found": "Опитът не беше намерен. Виж историята по-долу.",
  "already-submitted":
    "Този изпит вече е предаден. Резултатът е в историята по-долу.",
  "start-failed":
    "В момента не може да бъде съставен пробен изпит. Опитай отново по-късно.",
};

const dateFmt = new Intl.DateTimeFormat("bg-BG", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Hub: rules card + start button + attempt history. */
export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const [{ msg }, history] = await Promise.all([
    searchParams,
    getExamHistory(user.id),
  ]);
  const message = typeof msg === "string" ? MESSAGES[msg] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-black sm:text-3xl">Пробни изпити</h1>
        <p className="mt-1 text-sm text-muted">
          Същият формат, същата строгост — без изненади в изпитния ден.
        </p>
      </header>

      {message ? (
        <p
          role="status"
          className="card border-warning/50 px-4 py-3 text-sm font-semibold text-warning"
        >
          {message}
        </p>
      ) : null}

      {/* Rules card */}
      <section aria-labelledby="exam-rules-title" className="card p-5 sm:p-6">
        <h2 id="exam-rules-title" className="text-base font-extrabold">
          Официалният формат, едно към едно
        </h2>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RuleStat value={String(EXAM_QUESTION_COUNT)} label="въпроса" />
          <RuleStat value={String(EXAM_MAX_POINTS)} label="точки максимум" />
          <RuleStat value={`≥ ${EXAM_PASS_POINTS}`} label="точки за успех" />
          <RuleStat value={formatClock(EXAM_DURATION_SEC)} label="минути време" />
        </dl>

        <p className="mt-4 text-sm leading-relaxed text-muted">
          Пробният изпит повтаря официалния теоретичен изпит на ИААА (Наредба
          № 38): въпроси с тежест 1, 2 и 3 точки, включително въпроси с повече
          от един верен отговор. По време на изпита няма подсказки и обратна
          връзка — пълният преглед с обяснения идва след предаването.
        </p>

        <form action={startExamAction} className="mt-5">
          <button type="submit" className="btn-accent w-full sm:w-auto">
            Започни пробен изпит
          </button>
        </form>
      </section>

      {/* History */}
      <section aria-labelledby="exam-history-title" className="flex flex-col gap-3">
        <h2 id="exam-history-title" className="text-base font-extrabold">
          История на опитите
        </h2>

        {history.length === 0 ? (
          <p className="card p-5 text-sm text-muted">
            Още нямаш пробни изпити. Първият е най-важен — той показва откъде
            тръгваш.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((entry) => (
              <li key={entry.attemptId}>
                <HistoryRow entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RuleStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-surface-2 px-3 py-3 text-center">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="text-xl font-black tabular-nums text-accent">{value}</dd>
    </div>
  );
}

function HistoryRow({ entry }: { entry: ExamHistoryEntry }) {
  const inProgress = entry.status === "in-progress";
  return (
    <Link
      href={`/exams/${entry.attemptId}`}
      className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:border-border-strong hover:bg-surface-2 motion-reduce:transition-none"
    >
      <span className="min-w-36 text-sm font-semibold">
        {dateFmt.format(entry.startedAt)}
      </span>

      <span className="text-sm tabular-nums text-muted">
        {entry.score !== null ? (
          <>
            <strong className="font-bold text-foreground">{entry.score}</strong>/
            {entry.maxScore} точки
          </>
        ) : (
          "— точки"
        )}
      </span>

      <span className="ml-auto flex items-center gap-3">
        {inProgress ? (
          <>
            <StatusBadge kind="in-progress" />
            <span className="text-sm font-bold text-accent">Продължи →</span>
          </>
        ) : entry.passed ? (
          <StatusBadge kind="passed" />
        ) : (
          <StatusBadge kind="failed" />
        )}
      </span>
    </Link>
  );
}

function StatusBadge({ kind }: { kind: "passed" | "failed" | "in-progress" }) {
  if (kind === "passed") {
    return (
      <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">
        Издържан
      </span>
    );
  }
  if (kind === "failed") {
    return (
      <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs font-bold text-danger">
        Неиздържан
      </span>
    );
  }
  return (
    <span className="rounded-full border border-warning/50 px-2.5 py-0.5 text-xs font-bold text-warning">
      Незавършен
    </span>
  );
}
