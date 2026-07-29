import "@/lib/content/loader";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContentRepo } from "@/lib/content/repo";
import type { Question } from "@/lib/content/types";
import type { ExamQuestion } from "@/modules/exam";
import type { PracticeQuestionDto } from "@/components/theory/types";
import { FoldRigClient } from "./fold-rig-client";

export const metadata: Metadata = {
  title: "Fold rig · вътрешно",
  robots: { index: false, follow: false },
};

/**
 * THE FOLD RIG — the practice and exam runners on the bank's WORST questions,
 * inside the REAL app chrome. DEV route (404s in production).
 *
 * WHY IT EXISTS. The acceptance for phase 5 is „the question AND EVERY answer
 * visible with zero scrolling", and the number that decides it is the WORST
 * case, not the average. Neither runner lets you choose a question: practice
 * deals adaptively from the learning engine and the exam deals a seeded random
 * paper, so reaching q-vehicle-032 (four options, 478 characters of answer
 * text) by hand is luck. A previous review measured sixteen questions, found
 * seven stragglers „which overhang by 12–26px", and shipped; the phone was
 * never shown the item that actually breaks.
 *
 * So this route ranks the whole 1 089-question bank by rendered ink and mounts
 * the top of that list, one question at a time, in both runners:
 *
 *   /dev/fold-rig?mode=practice&rank=0    the heaviest text question
 *   /dev/fold-rig?mode=exam&rank=3
 *   /dev/fold-rig?mode=practice&q=q-vehicle-032
 *   /dev/fold-rig?mode=practice&family=media   heaviest sign / scene items
 *
 * THE CHROME IS THE REAL CHROME. `DashboardShell` and the (dashboard) group's
 * own <main> class string are mounted here verbatim, because the fold is a
 * property of the WHOLE screen — the sticky topbar and the 24px of <main>
 * padding are 81 of the 852 px this has to fit inside. A rig that renders the
 * card alone measures a page no student ever sees.
 *
 * What it is NOT: a working session. There is no attempt row and no session
 * behind it, so submitting an answer fails. Everything before the submit —
 * which is the entire geometry this phase is about — is the real component
 * with the real content.
 */

/** Rendered weight of a question: question text + every option's text. */
function ink(q: Question): number {
  return q.textBg.length + q.options.reduce((n, o) => n + o.textBg.length, 0);
}

function hasArtwork(q: Question): boolean {
  return q.media !== null || q.options.some((o) => o.media != null);
}

function toPractice(q: Question, repo: ReturnType<typeof getContentRepo>): PracticeQuestionDto {
  const conceptId = q.conceptIds[0] ?? "";
  const concept = repo.conceptById(conceptId);
  const topic = concept
    ? repo.topics().find((t) => t.id === concept.topicId)
    : undefined;
  return {
    id: q.id,
    type: q.type,
    points: q.points,
    textBg: q.textBg,
    media: q.media,
    options: q.options.map((o) => ({
      id: o.id,
      textBg: o.textBg,
      media: o.media ?? null,
    })),
    reason: "new-concept",
    conceptId,
    conceptTitleBg: concept?.titleBg ?? "",
    topicSlug: topic?.slug ?? null,
    topicTitleBg: topic?.titleBg ?? null,
  };
}

function toExam(q: Question): ExamQuestion {
  return {
    id: q.id,
    type: q.type,
    points: q.points,
    textBg: q.textBg,
    media: q.media,
    options: q.options.map((o) => ({ id: o.id, textBg: o.textBg, media: o.media })),
  };
}

export default async function FoldRigPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = await searchParams;
  const read = (k: string): string | undefined =>
    typeof params[k] === "string" ? (params[k] as string) : undefined;

  const repo = getContentRepo();
  const all = repo.questions();

  // Three families, ranked independently, because there are three different
  // ways a question runs out of screen:
  //   text    the ORDINARY question the acceptance is written about, ranked by
  //           total rendered characters;
  //   media   the 81 items that carry a sign face or a top-down scene;
  //   rows    the 76 items with FIVE or SIX options — a fifth row is ~46px
  //           whatever it says, so the heaviest-ink ranking can miss them.
  const raw = read("family");
  const family = raw === "media" ? "media" : raw === "rows" ? "rows" : "text";
  const pool =
    family === "media"
      ? all.filter(hasArtwork).sort((a, b) => ink(b) - ink(a))
      : family === "rows"
        ? all
            .filter((q) => q.options.length >= 5)
            .sort((a, b) => b.options.length - a.options.length || ink(b) - ink(a))
        : all.filter((q) => !hasArtwork(q)).sort((a, b) => ink(b) - ink(a));

  const byId = read("q");
  const rank = Math.max(0, Math.min(pool.length - 1, Number(read("rank") ?? 0) || 0));
  const question = byId ? all.find((q) => q.id === byId) : pool[rank];
  if (!question) notFound();

  const mode = read("mode") === "exam" ? "exam" : "practice";
  const timeLow = read("timelow") === "1";

  return (
    <FoldRigClient
      mode={mode}
      timeLow={timeLow}
      practice={toPractice(question, repo)}
      exam={toExam(question)}
      meta={{
        id: question.id,
        family,
        rank: byId ? -1 : rank,
        poolSize: pool.length,
        ink: ink(question),
      }}
    />
  );
}
