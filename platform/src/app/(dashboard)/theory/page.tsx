import type { Metadata } from "next";
import Link from "next/link";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { IconBolt } from "@/components/icons";
import { AuroraHeader } from "@/components/theory/AuroraHeader";
import { TopicSectionGroup } from "@/components/theory/TopicSectionGroup";
import { requireUser } from "@/modules/auth";
import { getSectionOverview, getTopicOverview } from "@/modules/learning";

export const metadata: Metadata = {
  title: "Теория · Книжка.AI",
  description:
    "16-те теми от изпита в десетки фокусирани раздела — адаптивна тренировка, преговор точно навреме.",
};

/**
 * Theory hub. Server component: pulls the per-topic and per-section overviews
 * from the learning module and renders the smart-training entry plus the 16
 * topics, each an expandable group of its finer sections.
 */
export default async function TheoryPage() {
  const user = await requireUser();
  const [topics, sections] = await Promise.all([
    getTopicOverview(user.id),
    getSectionOverview(user.id),
  ]);
  const totalDue = topics.reduce((sum, t) => sum + t.dueCount, 0);

  // Sections come back already grouped in topic order; bucket them by topic.
  const sectionsByTopic = new Map<string, typeof sections>();
  for (const section of sections) {
    const bucket = sectionsByTopic.get(section.topicId);
    if (bucket) bucket.push(section);
    else sectionsByTopic.set(section.topicId, [section]);
  }

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
          {topics.length} теми · {sections.length} раздела · {questionsLabel}{" "}
          въпроса от изпита. Отвори тема и тренирай по малки, фокусирани раздели
          — или остави двигателя да подбере какво да учиш.
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

      {/* Topics → sections. Each topic expands into its finer study chunks. */}
      <section aria-labelledby="topics-title">
        <h2 id="topics-title" className="visually-hidden">
          Теми и раздели
        </h2>
        <ul className="flex flex-col gap-3">
          {topics.map((topic) => (
            <li key={topic.topicId}>
              <TopicSectionGroup
                topic={topic}
                sections={sectionsByTopic.get(topic.topicId) ?? []}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
