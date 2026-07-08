import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listFlaggedQuestions } from "@/modules/content-admin";
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
 * DEV-ONLY founder tool: clear the "needs-review" theory questions and promote
 * them to "approved" so they enter the mock exams. The page (and the API it
 * calls) write to the product's source-of-truth JSON, so it 404s in production
 * and is never linked from the app navigation.
 */
export default async function ReviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await requireUser();

  const { flagged } = await listFlaggedQuestions();

  return <ReviewClient flagged={flagged} />;
}
