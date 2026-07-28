import type { Metadata } from "next";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { TheoryFocus } from "@/components/theory/TheoryFocus";
import { TopicDeck } from "@/components/theory/TopicDeck";
import { requireUser } from "@/modules/auth";
import {
  getSectionOverview,
  getTopicOverview,
  type SectionOverview,
} from "@/modules/learning";

export const metadata: Metadata = {
  title: "Теория · Книжка.AI",
  description:
    "16-те теми от изпита като инструментален борд — виждаш какво знаеш, какво чака преговор и къде да продължиш.",
};

/**
 * Theory hub — the instrument deck.
 *
 * Still a server component: it pulls the per-topic and per-section overviews
 * and hands them down as plain data. Only the board itself is interactive
 * (`TopicDeck`), because only the lens and the sheet need state.
 *
 * The topic DESCRIPTIONS are read here rather than added to `TopicOverview`.
 * They are presentation copy — the sheet uses them to tell a student what a
 * topic contains before asking them to practise it — and the learning module's
 * overview type is about progress, not about blurbs. This page already holds
 * the content repo for the question count, so taking one more field off it
 * costs nothing and leaves the module boundary where it is (docs/architecture/05).
 */
export default async function TheoryPage() {
  const user = await requireUser();
  const [topics, sections] = await Promise.all([
    getTopicOverview(user.id),
    getSectionOverview(user.id),
  ]);

  // Sections come back already grouped in topic order; bucket them by topic.
  const sectionsByTopic: Record<string, SectionOverview[]> = {};
  for (const section of sections) {
    (sectionsByTopic[section.topicId] ??= []).push(section);
  }

  const repo = getContentRepo();
  const descriptions: Record<string, string> = {};
  for (const topic of repo.topics()) descriptions[topic.id] = topic.descriptionBg;

  const questionCount = repo.questions().length;
  const questionsRounded = Math.floor(questionCount / 100) * 100;
  const questionsLabel =
    questionsRounded >= 100 ? `над ${questionsRounded}` : `${questionCount}`;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <TheoryFocus
        topics={topics}
        sectionCount={sections.length}
        questionsLabel={questionsLabel}
      />
      <TopicDeck
        topics={topics}
        sectionsByTopic={sectionsByTopic}
        descriptions={descriptions}
      />
    </div>
  );
}
