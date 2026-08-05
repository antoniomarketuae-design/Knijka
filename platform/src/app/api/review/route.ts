/**
 * DEV-ONLY route handler for the founder content-review tool.
 *
 *   GET  /api/review?queue=…&page=…  → one page of the review queue + census
 *   POST /api/review                 → apply one decision { questionId, action, patch? }
 *
 * Both refuse to run in production (404) and require an authenticated session.
 * All file writes happen in @/modules/content-admin (validate → atomic write).
 *
 * There is no bulk endpoint any more, on purpose. `POST /api/review/bulk`
 * approved a whole topic on one click; a signature minted that way says a human
 * read thirty rows they never opened, which is the same lie as a generator
 * writing `"status": "approved"` — the defect the audit called more dangerous
 * than the 4% wrong-answer rate (docs/education/90 §1).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/modules/auth";
import {
  applyReviewDecision,
  listFlaggedQuestions,
  parseQueue,
  parseReviewRequest,
  type ReviewQueue,
} from "@/modules/content-admin";

// Reads/writes the filesystem — never cache, always run at request time.
export const dynamic = "force-dynamic";

/** 404 in production so the tool is unreachable in the shipped app. */
function productionBlocked(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const blocked = productionBlocked();
  if (blocked) return blocked;

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const queue: ReviewQueue = parseQueue(params.get("queue"));
  const pageParam = Number.parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const data = await listFlaggedQuestions({ queue, page });
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

  // WHO signed comes from the server session, never from the payload — a
  // signature the caller can name themselves proves nothing.
  const reviewer = user.name ?? user.email;
  const outcome = await applyReviewDecision(parsed.questionId, parsed.decision, reviewer);
  if (!outcome.ok) {
    const status =
      outcome.code === "not_found" ? 404 : outcome.code === "already_signed" ? 409 : 422;
    return NextResponse.json(outcome, { status });
  }

  return NextResponse.json(outcome);
}
