import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/lib/content/loader";
import { LessonRunner } from "@/components/lesson/LessonRunner";
import { requireUser } from "@/modules/auth";
import { resolveBeat, resolveOutline } from "@/modules/lesson";

export const metadata: Metadata = {
  title: "Класна стая · Книжка.AI",
  description: "Урок с учител, дъска и въпроси — прекъсвай, когато нещо не е ясно.",
};

interface Props {
  params: Promise<{ lessonId: string }>;
}

/**
 * One lesson. The server ships the OUTLINE (a list of beat ids and kinds —
 * a few hundred bytes) plus the FIRST beat; every later beat is fetched by the
 * runner when the student reaches it, and nothing is prefetched. That is the
 * bandwidth promise, enforced by where the data is loaded rather than by a
 * convention someone has to remember.
 */
export default async function LessonPage({ params }: Props) {
  await requireUser();
  const { lessonId } = await params;

  const outline = resolveOutline(lessonId);
  if (outline === null) notFound();
  const firstBeat = resolveBeat(lessonId, outline.beats[0].id);
  if (firstBeat === null) notFound();

  return (
    <main id="main-content" className="px-4 py-5">
      <LessonRunner outline={outline} firstBeat={firstBeat} />
    </main>
  );
}
