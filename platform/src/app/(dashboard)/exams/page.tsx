import "@/lib/content/loader";
import type { Metadata } from "next";
import Link from "next/link";
import { getContentRepo } from "@/lib/content/repo";
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
    "Пробен изпит 1:1 с официалния формат: 45 въпроса на опит от банка с над 1000 оригинални, 97 точки, праг 87, 40 минути.",
};

const MESSAGES: Record<string, string> = {
  "not-found": "Опитът не беше намерен. Виж историята по-долу.",
  "already-submitted":
    "Този изпит вече е предаден. Резултатът е в историята по-долу.",
  "start-failed":
    "В момента не може да бъде съставен пробен изпит. Опитай отново по-късно.",
  "too-many":
    "Твърде много започнати изпити подред. Изчакай малко и пробвай пак.",
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

  // Live bank size (landing-page honesty rule: floor to the nearest 100,
  // derived from the content repo so the claim grows with the bank).
  const questionCount = getContentRepo().questions().length;
  const bankRounded = Math.floor(questionCount / 100) * 100;
  const bankLabel = bankRounded >= 100 ? `над ${bankRounded}` : `${questionCount}`;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <span className="hud-label">Тренажор · изпитен режим</span>
        <h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">
          Пробни изпити
        </h1>
        <p className="mt-1 text-sm text-muted">
          Същият формат, същата строгост — без изненади в изпитния ден.
        </p>
        <div aria-hidden className="graticule mt-3 max-w-56" />
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
      <section
        aria-labelledby="exam-rules-title"
        className="hud-panel framed relative overflow-hidden p-5 [--panel-pad:1.25rem] sm:p-6 sm:[--panel-pad:1.5rem]"
      >
        <div aria-hidden className="hud-grid pointer-events-none absolute inset-0 opacity-[0.1]" />

        <div className="panel-head panel-head-bleed relative">
          <h2 id="exam-rules-title" className="font-display text-lg font-extrabold">
            Официалният формат, едно към едно
          </h2>
          <span className="hud-label">
            {EXAM_QUESTION_COUNT} · {EXAM_MAX_POINTS} · {EXAM_PASS_POINTS} ·{" "}
            {formatClock(EXAM_DURATION_SEC)}
          </span>
        </div>

        <dl className="relative grid grid-cols-2 gap-3 sm:grid-cols-5">
          <RuleStat value={String(EXAM_QUESTION_COUNT)} label="въпроса на изпит" />
          <RuleStat value={String(EXAM_MAX_POINTS)} label="точки максимум" />
          <RuleStat value={`≥ ${EXAM_PASS_POINTS}`} label="точки за успех" accent />
          <RuleStat value={formatClock(EXAM_DURATION_SEC)} label="минути време" />
          <RuleStat value={bankLabel} label="въпроса в банката" />
        </dl>

        <p className="mt-4 text-sm leading-relaxed text-muted">
          Пробният изпит повтаря официалния теоретичен изпит на ИААА (Наредба
          № 38): въпроси с тежест 1, 2 и 3 точки, включително въпроси с повече
          от един верен отговор. Всеки опит тегли нови {EXAM_QUESTION_COUNT}{" "}
          въпроса от банка с {bankLabel} оригинални — два еднакви изпита
          практически няма. По време на изпита няма подсказки и обратна
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
        <div className="panel-head mb-0">
          <h2 id="exam-history-title" className="font-display text-base font-extrabold">
            История на опитите
          </h2>
          <span className="hud-label">{history.length} опита</span>
        </div>

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

function RuleStat({
  value,
  label,
  accent = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  // A gauge face, not a tile: recessed into the panel (`.panel-inset` — the lit
  // edge moves to the BOTTOM lip because light still comes from above), the
  // figure in the tabular numeral voice, the caption dim beneath it. The ratio
  // between the two is what makes it read as an instrument (Readout.tsx §).
  return (
    <div className="panel-inset flex flex-col-reverse gap-1 px-3 py-4 text-center">
      <dt className="hud-label">{label}</dt>
      <dd
        className={`metric text-2xl ${accent ? "text-accent-2" : "text-accent"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function HistoryRow({ entry }: { entry: ExamHistoryEntry }) {
  const inProgress = entry.status === "in-progress";
  // Derived from startedAt by the exam module, not stored. „Продължи →" on a
  // row that can no longer be continued is a promise the next screen has to
  // break — and before the expiry check existed it broke it by auto-failing
  // the attempt at 0/97.
  const expired = entry.status === "expired";
  return (
    <Link
      href={`/exams/${entry.attemptId}`}
      className="card card-live flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-surface-2 motion-reduce:transition-none"
    >
      <span className="min-w-36 text-sm font-semibold">
        {dateFmt.format(entry.startedAt)}
      </span>

      <span className="metric text-sm font-normal text-muted">
        {entry.score !== null ? (
          <>
            <strong className="font-bold text-foreground">{entry.score}</strong>/
            {entry.maxScore} т.
          </>
        ) : (
          "— т."
        )}
      </span>

      <span className="ml-auto flex items-center gap-3">
        {inProgress ? (
          <>
            <StatusBadge kind="in-progress" />
            <span className="text-sm font-bold text-accent">Продължи →</span>
          </>
        ) : expired ? (
          <StatusBadge kind="expired" />
        ) : entry.passed ? (
          <StatusBadge kind="passed" />
        ) : (
          <StatusBadge kind="failed" />
        )}
      </span>
    </Link>
  );
}

function StatusBadge({
  kind,
}: {
  kind: "passed" | "failed" | "in-progress" | "expired";
}) {
  // Neutral, not red: an expired attempt is not a failed one, and painting it
  // in the „Неиздържан" colour would tell the student they lost an exam they
  // never sat — the same lie the auto-submit used to tell, in a smaller font.
  if (kind === "expired") {
    return (
      <span className="rounded-full border border-hair px-2.5 py-0.5 text-xs font-bold text-muted">
        Изтекъл
      </span>
    );
  }
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
