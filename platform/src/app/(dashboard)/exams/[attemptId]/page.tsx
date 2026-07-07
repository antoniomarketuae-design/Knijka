import "@/lib/content/loader";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import {
  EXAM_DURATION_SEC,
  EXAM_PASS_POINTS,
  ExamError,
  buildExam,
  getExamHistory,
  type ExamHistoryEntry,
} from "@/modules/exam";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { ScoreSummaryCard } from "@/components/exam/ExamResultView";
import { StoredReview } from "@/components/exam/StoredReview";
import { seedCookieName } from "@/components/exam/types";

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/exams" className="text-sm font-bold text-accent">
          ← Всички изпити
        </Link>
      </div>

      <ScoreSummaryCard
        score={entry.score ?? 0}
        maxScore={entry.maxScore}
        passPoints={EXAM_PASS_POINTS}
        passed={entry.passed === true}
        timeUsedSec={timeUsedSec}
      />

      <StoredReview attemptId={entry.attemptId} />
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
