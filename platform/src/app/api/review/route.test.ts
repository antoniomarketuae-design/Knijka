/**
 * The founder content-review routes — /api/review and /api/review/bulk (audit
 * 2026-07-24, H-13).
 *
 * These are the most dangerous handlers in the app: they WRITE to the
 * committed question bank. Two guards stand in front of them, both of them
 * one-liners that nothing executed until now:
 *
 *   1. `NODE_ENV === "production"` → 404, so the tool does not exist in the
 *      shipped app at all (not 401 — a 401 would advertise it).
 *   2. an authenticated session, checked server-side per request.
 *
 * Every test below asserts that the write never happens, not merely that a
 * status code came back: content-admin is mocked so any call to it is a
 * visible failure.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  getSessionUser: () => getSessionUser(),
}));

// Mocked wholesale: reaching ANY of these means a guard let the caller through.
const listFlaggedQuestions = vi.fn(async () => ({ questions: [], topics: [] }));
const applyReviewDecision = vi.fn(async (_questionId: string, _decision: unknown) => ({
  ok: true as const,
}));
const bulkApproveTopic = vi.fn(async (_topicSlug: string) => ({
  ok: true as const,
  approved: 3,
}));
const parseReviewRequest = vi.fn((body: unknown) => {
  const id = (body as { questionId?: unknown })?.questionId;
  return typeof id === "string" ? { questionId: id, decision: { action: "approve" } } : null;
});
vi.mock("@/modules/content-admin", () => ({
  listFlaggedQuestions: () => listFlaggedQuestions(),
  applyReviewDecision: (questionId: string, decision: unknown) =>
    applyReviewDecision(questionId, decision),
  bulkApproveTopic: (topicSlug: string) => bulkApproveTopic(topicSlug),
  parseReviewRequest: (body: unknown) => parseReviewRequest(body),
}));

const review = await import("./route");
const bulk = await import("./bulk/route");

/** Every content-admin entry point, so "nothing was written" is one assert. */
function writeAttempts(): number {
  return (
    listFlaggedQuestions.mock.calls.length +
    applyReviewDecision.mock.calls.length +
    bulkApproveTopic.mock.calls.length
  );
}

function jsonRequest(url: string, payload: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

beforeEach(() => {
  getSessionUser.mockResolvedValue({ id: "user-1", email: "founder@mail.bg" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("production is a hard 404 — the tool does not exist to students", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "production"));

  it("GET /api/review", async () => {
    const res = await review.GET();
    expect(res.status).toBe(404);
    expect(writeAttempts()).toBe(0);
  });

  it("POST /api/review", async () => {
    const res = await review.POST(
      jsonRequest("http://localhost/api/review", { questionId: "q-1", action: "approve" }),
    );
    expect(res.status).toBe(404);
    expect(writeAttempts()).toBe(0);
  });

  it("POST /api/review/bulk", async () => {
    const res = await bulk.POST(
      jsonRequest("http://localhost/api/review/bulk", { topicSlug: "patni-znatsi" }),
    );
    expect(res.status).toBe(404);
    expect(writeAttempts()).toBe(0);
  });

  it("404s BEFORE consulting the session — production is not an auth question", async () => {
    await review.GET();
    expect(getSessionUser).not.toHaveBeenCalled();
  });
});

describe("outside production, an anonymous caller gets 401 and writes nothing", () => {
  beforeEach(() => getSessionUser.mockResolvedValue(null));

  it("GET /api/review", async () => {
    expect((await review.GET()).status).toBe(401);
    expect(writeAttempts()).toBe(0);
  });

  it("POST /api/review", async () => {
    const res = await review.POST(
      jsonRequest("http://localhost/api/review", { questionId: "q-1", action: "approve" }),
    );
    expect(res.status).toBe(401);
    expect(writeAttempts()).toBe(0);
  });

  it("POST /api/review/bulk", async () => {
    const res = await bulk.POST(
      jsonRequest("http://localhost/api/review/bulk", { topicSlug: "patni-znatsi" }),
    );
    expect(res.status).toBe(401);
    expect(writeAttempts()).toBe(0);
  });
});

describe("an authenticated dev call reaches content-admin, once, with parsed input", () => {
  it("GET /api/review lists the flagged questions", async () => {
    expect((await review.GET()).status).toBe(200);
    expect(listFlaggedQuestions).toHaveBeenCalledTimes(1);
  });

  it("POST /api/review applies exactly one decision", async () => {
    const res = await review.POST(
      jsonRequest("http://localhost/api/review", { questionId: "q-1", action: "approve" }),
    );
    expect(res.status).toBe(200);
    expect(applyReviewDecision).toHaveBeenCalledTimes(1);
    expect(applyReviewDecision.mock.calls[0][0]).toBe("q-1");
  });

  it("POST /api/review rejects malformed JSON and an unparseable decision", async () => {
    expect((await review.POST(jsonRequest("http://localhost/api/review", "{{"))).status).toBe(400);
    expect((await review.POST(jsonRequest("http://localhost/api/review", { nope: 1 }))).status).toBe(400);
    expect(applyReviewDecision).not.toHaveBeenCalled();
  });

  it("POST /api/review/bulk demands a non-empty topicSlug", async () => {
    for (const topicSlug of [undefined, "", 42, ["patni-znatsi"]]) {
      const res = await bulk.POST(
        jsonRequest("http://localhost/api/review/bulk", { topicSlug }),
      );
      expect(res.status, JSON.stringify(topicSlug)).toBe(400);
    }
    expect(bulkApproveTopic).not.toHaveBeenCalled();
  });

  it("POST /api/review/bulk approves the named topic", async () => {
    const res = await bulk.POST(
      jsonRequest("http://localhost/api/review/bulk", { topicSlug: "patni-znatsi" }),
    );
    expect(res.status).toBe(200);
    expect(bulkApproveTopic).toHaveBeenCalledWith("patni-znatsi");
  });
});
