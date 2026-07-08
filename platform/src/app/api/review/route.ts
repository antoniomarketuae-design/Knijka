/**
 * DEV-ONLY route handler for the founder content-review tool.
 *
 *   GET  /api/review  → all needs-review questions + their topic/file grouping
 *   POST /api/review  → apply one decision { questionId, action, patch? }
 *
 * Both refuse to run in production (404) and require an authenticated session.
 * All file writes happen in @/modules/content-admin (validate → atomic write).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/modules/auth";
import { applyReviewDecision, listFlaggedQuestions, parseReviewRequest } from "@/modules/content-admin";

// Reads/writes the filesystem — never cache, always run at request time.
export const dynamic = "force-dynamic";

/** 404 in production so the tool is unreachable in the shipped app. */
function productionBlocked(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const blocked = productionBlocked();
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const data = await listFlaggedQuestions();
  return NextResponse.json(data);
}

export async function POST(request: Request): Promise<NextResponse> {
  const blocked = productionBlocked();
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Невалиден JSON." }, { status: 400 });
  }

  const parsed = parseReviewRequest(body);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "Невалидна заявка." }, { status: 400 });
  }

  const outcome = await applyReviewDecision(parsed.questionId, parsed.decision);
  if (!outcome.ok) {
    const status =
      outcome.code === "not_found" ? 404 : outcome.code === "not_needs_review" ? 409 : 422;
    return NextResponse.json(outcome, { status });
  }

  return NextResponse.json(outcome);
}
