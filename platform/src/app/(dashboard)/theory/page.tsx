import type { Metadata } from "next";
import Link from "next/link";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { IconBolt } from "@/components/icons";
import { AuroraHeader } from "@/components/theory/AuroraHeader";
import { TopicCard } from "@/components/theory/TopicCard";
import { requireUser } from "@/modules/auth";
import { getTopicOverview } from "@/modules/learning";

export const metadata: Metadata = {
  title: "Теория · Книжка.AI",
  description:
    "16-те теми от изпита — адаптивна тренировка, преговор точно навреме.",
};

/**
 * Theory hub. Server component: pulls the per-topic overview from the
 * learning module and renders the smart-training entry + 16 topic cards.
 */
export default async function TheoryPage() {
  const user = await requireUser();
  const topics = await getTopicOverview(user.id);
  const totalDue = topics.reduce((sum, t) => sum + t.dueCount, 0);
  const questionCount = getContentRepo().questions().length;
  const questionsRounded = Math.floor(questionCount / 100) * 100;
  const questionsLabel =
    questionsRounded >= 100 ? `над ${questionsRounded}` : `${questionCount}`;

  return (
    <div className="flex flex-col gap-8">
      <AuroraHeader>
        <p className="hud-label">Подготовка за изпита</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">
          Теория
        </h1>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted sm:text-[15px]">
          {topics.length} теми · {questionsLabel} въпроса от изпита. Избери тема
          — или остави двигателя да подбере какво да тренираш.
        </p>
      </AuroraHeader>

      {/* Smart training — the recommended entry point */}
      <section
        aria-labelledby="smart-training-title"
        className="hud-panel flex flex-col gap-4 p-5 shadow-glow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/25"
          >
            <IconBolt className="h-6 w-6" />
          </span>
          <div>
            <h2
              id="smart-training-title"
              className="font-display text-base font-extrabold sm:text-lg"
            >
              Умна тренировка
            </h2>
            <p className="mt-1 max-w-[54ch] text-sm leading-relaxed text-muted">
              {totalDue > 0
                ? `${totalDue} ${
                    totalDue === 1 ? "понятие чака" : "понятия чакат"
                  } преговор — започни оттук, за да не ги забравиш.`
                : "Няма чакащи преговори — ще подберем слабите ти места и нов материал."}
            </p>
          </div>
        </div>
        <Link href="/theory/practice" className="btn-accent shrink-0">
          Започни
        </Link>
      </section>

      {/* Topic grid */}
      <section aria-labelledby="topics-title">
        <h2 id="topics-title" className="visually-hidden">
          Теми
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          {topics.map((topic) => (
            <li key={topic.topicId}>
              <TopicCard topic={topic} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
