import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listFlaggedQuestions, parseQueue, type ReviewQueue } from "@/modules/content-admin";
import { requireUser } from "@/modules/auth";
import { ReviewClient } from "./ReviewClient";

// Reads the content files fresh on every request so the list reflects the
// writes made by /api/review — never prerender or cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Преглед на въпроси · Книжка.AI",
  description: "Вътрешен инструмент за одобрение на въпроси за теория.",
  robots: { index: false, follow: false },
};

/**
 * DEV-ONLY founder tool: the ONLY place a theory question can become
 * human-approved.
 *
 * Until the law audit (docs/education/90) "approved" was a string a generator
 * wrote — 1,005 rows carried it, including all nine that are literally
 * unanswerable. Now a review is a signature over the row's content hash, minted
 * here, one row at a time, from the founder's own session. This page therefore
 * has to earn its keep in seconds per row: it shows the question, what changed
 * since the last commit, and the VERBATIM text of every article the row cites,
 * retrieved from content/law — never restated from memory (ADR-002).
 *
 * The page (and the API it calls) write to the product's source-of-truth JSON,
 * so it 404s in production and is never linked from the app navigation.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string; page?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  await requireUser();

  const params = await searchParams;
  const queue: ReviewQueue = parseQueue(params.queue);
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const result = await listFlaggedQuestions({ queue, page });

  return <ReviewClient result={result} />;
}
