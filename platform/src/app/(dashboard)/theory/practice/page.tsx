import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/lib/content/loader";
import { IconLock } from "@/components/icons";
import { AuroraHeader } from "@/components/theory/AuroraHeader";
import { PracticeSession } from "@/components/theory/PracticeSession";
import type { PracticeQuestionDto } from "@/components/theory/types";
import { getContentRepo } from "@/lib/content/repo";
import { requireUser } from "@/modules/auth";
import { buildPracticeSession } from "@/modules/learning";

export const metadata: Metadata = {
  title: "Тренировка · Книжка.AI",
  description: "Адаптивна тренировка — преговори, слаби места и нов материал.",
};

const SESSION_SIZE = 10;

interface PracticePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Practice session bootstrap. Server component: builds the session via the
 * learning engine, strips the correct-answer flags and hands a client-safe
 * payload to <PracticeSession>. `?topic=<slug>` scopes to one topic; without
 * it the engine mixes due reviews + weakest concepts ("Умна тренировка").
 */
export default async function PracticePage({ searchParams }: PracticePageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const topicParam = typeof params.topic === "string" ? params.topic : undefined;

  const repo = getContentRepo();
  const topic = topicParam === undefined ? undefined : repo.topicBySlug(topicParam);
  if (topicParam !== undefined && topic === undefined) notFound();

  const session = await buildPracticeSession(user.id, {
    topicSlug: topic?.slug,
    size: SESSION_SIZE,
  });

  const topicsById = new Map(repo.topics().map((t) => [t.id, t]));
  const questions: PracticeQuestionDto[] = session.map(
    ({ question, conceptId, reason }) => {
      const concept = repo.conceptById(conceptId);
      const conceptTopic = concept ? topicsById.get(concept.topicId) : undefined;
      return {
        id: question.id,
        type: question.type,
        points: question.points,
        textBg: question.textBg,
        // Deliberately drop `correct` — it must never reach the client early.
        options: question.options.map((o) => ({ id: o.id, textBg: o.textBg })),
        reason,
        conceptId,
        conceptTitleBg: concept?.titleBg ?? "",
        topicSlug: conceptTopic?.slug ?? null,
        topicTitleBg: conceptTopic?.titleBg ?? null,
      };
    },
  );

  return (
    <div className="flex flex-col gap-8">
      <AuroraHeader intensity="soft">
        <Link href="/theory" className="text-xs font-bold text-accent hover:underline">
          ← Всички теми
        </Link>
        <h1 className="mt-3 font-display text-2xl font-black tracking-tight sm:text-3xl">
          {topic ? topic.titleBg : "Умна тренировка"}
        </h1>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted">
          {topic
            ? "Тренировка по темата — преговори, слаби места и нови понятия."
            : "Двигателят подбра преговорите на падеж и най-слабите ти места."}
        </p>
      </AuroraHeader>

      {questions.length === 0 ? (
        <EmptySession topicTitleBg={topic?.titleBg ?? null} />
      ) : (
        /* Fresh key per server render: router.refresh() ("Нова тренировка")
           builds a new session and remounts the client flow from scratch. */
        <PracticeSession key={crypto.randomUUID()} questions={questions} />
      )}
    </div>
  );
}

/** Friendly empty state: everything is gated or answered too recently. */
function EmptySession({ topicTitleBg }: { topicTitleBg: string | null }) {
  return (
    <section
      aria-labelledby="empty-session-title"
      className="card mx-auto flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center sm:p-12"
    >
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-hair bg-surface-2 text-muted"
      >
        <IconLock className="h-7 w-7" />
      </span>
      <div>
        <h2 id="empty-session-title" className="font-display text-lg font-extrabold">
          Засега няма подходящи въпроси
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          {topicTitleBg
            ? `Понятията в „${topicTitleBg}“ се отключват, когато основите им са усвоени. Потренирай предишните теми или пусни умна тренировка — тя винаги знае откъде да продължи.`
            : "Отговорил си вярно на всичко налично съвсем скоро — върни се по-късно за преговор или избери тема, която още не си покрил."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {topicTitleBg !== null ? (
          <Link href="/theory/practice" className="btn-accent">
            Умна тренировка
          </Link>
        ) : null}
        <Link href="/theory" className="btn-ghost">
          Към темите
        </Link>
      </div>
    </section>
  );
}
