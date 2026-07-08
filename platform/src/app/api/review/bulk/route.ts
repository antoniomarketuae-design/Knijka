/**
 * DEV-ONLY: POST /api/review/bulk { topicSlug } — approve every remaining
 * needs-review question in one topic after a spot-check. 404 in production,
 * auth required. Writes go through @/modules/content-admin (validate → atomic).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/modules/auth";
import { bulkApproveTopic } from "@/modules/content-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Невалиден JSON." }, { status: 400 });
  }

  const slug = (body as { topicSlug?: unknown })?.topicSlug;
  if (typeof slug !== "string" || slug.length === 0) {
    return NextResponse.json({ ok: false, error: "Липсва topicSlug." }, { status: 400 });
  }

  const outcome = await bulkApproveTopic(slug);
  if (!outcome.ok) return NextResponse.json(outcome, { status: 422 });

  return NextResponse.json(outcome);
}
