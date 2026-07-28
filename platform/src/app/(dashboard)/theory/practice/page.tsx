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
import { checkPracticeQuota } from "@/modules/payments";

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
 * payload to <PracticeSession>. `?section=<id>` scopes to one section's
 * concepts, `?topic=<slug>` to a whole topic; without either the engine mixes
 * due reviews + weakest concepts ("Умна тренировка").
 */
export default async function PracticePage({ searchParams }: PracticePageProps) {
  const user = await requireUser();

  // Free tier is visible BEFORE it bites: the counter renders over the
  // session, and a spent quota shows an inline paywall card here instead of
  // the mid-session hard redirect from the submit action. Admins (server
  // session role) skip the quota entirely — no counter, no paywall.
  const quota = user.isAdmin ? null : await checkPracticeQuota(user.id);
  if (quota !== null && !quota.unlimited && quota.remainingToday === 0) {
    return <QuotaExhausted limit={quota.limit} />;
  }

  const params = await searchParams;
  const sectionParam =
    typeof params.section === "string" ? params.section : undefined;
  const topicParam = typeof params.topic === "string" ? params.topic : undefined;

  const repo = getContentRepo();

  const section =
    sectionParam === undefined ? undefined : repo.sectionById?.(sectionParam);
  if (sectionParam !== undefined && section === undefined) notFound();

  const topic = topicParam === undefined ? undefined : repo.topicBySlug(topicParam);
  if (topicParam !== undefined && topic === undefined) notFound();

  // A section scopes to its concepts; a topic to its slug. Section wins if both.
  const scopeTitleBg = section?.titleBg ?? topic?.titleBg ?? null;

  const session = await buildPracticeSession(user.id, {
    topicSlug: topic?.slug,
    conceptIds: section?.conceptIds,
    size: SESSION_SIZE,
    // Admin (server session role): every concept reachable regardless of
    // prerequisite mastery — the founder reviews the whole bank, not a
    // beginner's slice. Students keep the pedagogical gate.
    ignorePrerequisites: user.isAdmin,
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
        // THEO-1 media is safe to ship pre-answer: sign codes and scene data
        // describe the QUESTION, never the answer.
        media: question.media,
        // Deliberately drop `correct` — it must never reach the client early.
        options: question.options.map((o) => ({
          id: o.id,
          textBg: o.textBg,
          media: o.media ?? null,
        })),
        reason,
        conceptId,
        conceptTitleBg: concept?.titleBg ?? "",
        topicSlug: conceptTopic?.slug ?? null,
        topicTitleBg: conceptTopic?.titleBg ?? null,
      };
    },
  );

  const introBg = section
    ? "Тренировка по раздела — понятията в него, преговори и нов материал."
    : topic
      ? "Тренировка по темата — преговори, слаби места и нови понятия."
      : "Двигателят подбра преговорите на падеж и най-слабите ти места.";

  return (
    <div className="flex flex-col gap-4 sm:gap-8">
      {/* MOBILE HEADER (founder review, 390x844): the aurora band is 181px of
          title and blurb — 21% of a phone screen — repeated above all ten
          questions of a session, and it was the single biggest reason the
          answers started below the fold. Below `sm` it collapses to one line:
          the back link and the scope title, nothing else. The blurb is
          orientation for a first visit, not something a student re-reads on
          every question, so it is the right thing to drop on a phone.
          From `sm` up the full band is unchanged. */}
      <header className="flex items-baseline gap-3 sm:hidden">
        <Link href="/theory" className="shrink-0 text-xs font-bold text-accent">
          ← Теми
        </Link>
        <h1 className="min-w-0 truncate font-display text-lg font-black tracking-tight">
          {scopeTitleBg ?? "Умна тренировка"}
        </h1>
      </header>

      <div className="hidden sm:block">
        <AuroraHeader intensity="soft">
          <Link href="/theory" className="text-xs font-bold text-accent hover:underline">
            ← Всички теми
          </Link>
          <h1 className="mt-3 font-display text-2xl font-black tracking-tight sm:text-3xl">
            {scopeTitleBg ?? "Умна тренировка"}
          </h1>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted">
            {introBg}
          </p>
        </AuroraHeader>
      </div>

      {questions.length === 0 ? (
        <EmptySession topicTitleBg={scopeTitleBg} />
      ) : (
        /* Fresh key per server render: router.refresh() ("Нова тренировка")
           builds a new session and remounts the client flow from scratch. */
        <PracticeSession
          key={crypto.randomUUID()}
          questions={questions}
          quota={
            quota === null || quota.unlimited
              ? null
              : {
                  usedToday: quota.limit - quota.remainingToday,
                  limit: quota.limit,
                }
          }
        />
      )}
    </div>
  );
}

/** Spent daily quota: an honest inline invitation instead of a hard redirect. */
function QuotaExhausted({ limit }: { limit: number }) {
  return (
    <section
      aria-labelledby="quota-exhausted-title"
      className="card mx-auto mt-8 flex w-full max-w-xl flex-col items-center gap-4 p-8 text-center sm:p-12"
    >
      <span
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10 text-accent"
      >
        <IconLock className="h-7 w-7" />
      </span>
      <div>
        <h2 id="quota-exhausted-title" className="font-display text-lg font-extrabold">
          Дневната безплатна порция свърши
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Мина през всичките {limit} безплатни въпроса за днес — добра работа!
          Утре порцията се подновява. Ако искаш да продължиш още сега, пакетите
          махат лимита.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/pricing?status=quota" className="btn-accent">
          Виж пакетите
        </Link>
        <Link href="/theory" className="btn-ghost">
          Към темите
        </Link>
      </div>
    </section>
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
