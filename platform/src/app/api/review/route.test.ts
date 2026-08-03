/**
 * The founder content-review route — /api/review (audit 2026-07-24, H-13).
 *
 * This is the most dangerous handler in the app: it WRITES to the committed
 * question bank AND mints the human signatures that decide what a student is
 * allowed to be examined on. Three guards stand in front of it:
 *
 *   1. `NODE_ENV === "production"` → 404, so the tool does not exist in the
 *      shipped app at all (not 401 — a 401 would advertise it).
 *   2. an authenticated session, checked server-side per request.
 *   3. the signer's identity is taken FROM THAT SESSION, never from the body —
 *      a signature the caller can name themselves is worth exactly as much as
 *      the `"status": "approved"` a generator wrote, which is nothing
 *      (docs/education/90 §1).
 *
 * Every test below asserts that the write never happens, not merely that a
 * status code came back: content-admin is mocked so any call to it is a
 * visible failure.
 *
 * `/api/review/bulk` used to live next door and was deleted with this change.
 * It approved a whole topic on one click, which is a machine approval wearing
 * a human's session.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionUser =
  vi.fn<() => Promise<{ id: string; email: string; name: string | null } | null>>();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  getSessionUser: () => getSessionUser(),
}));

// Mocked wholesale: reaching ANY of these means a guard let the caller through.
const listFlaggedQuestions = vi.fn(async (_options?: unknown) => ({ flagged: [], topics: [] }));
const applyReviewDecision = vi.fn(
  async (_questionId: string, _decision: unknown, _reviewer: string) => ({ ok: true as const }),
);
const parseReviewRequest = vi.fn((body: unknown) => {
  const id = (body as { questionId?: unknown })?.questionId;
  return typeof id === "string" ? { questionId: id, decision: { action: "approve" } } : null;
});
vi.mock("@/modules/content-admin", () => ({
  listFlaggedQuestions: (options?: unknown) => listFlaggedQuestions(options),
  applyReviewDecision: (questionId: string, decision: unknown, reviewer: string) =>
    applyReviewDecision(questionId, decision, reviewer),
  parseReviewRequest: (body: unknown) => parseReviewRequest(body),
}));

const review = await import("./route");

/** Every content-admin entry point, so "nothing was written" is one assert. */
function writeAttempts(): number {
  return listFlaggedQuestions.mock.calls.length + applyReviewDecision.mock.calls.length;
}

function getRequest(url = "http://localhost/api/review") {
  return new Request(url);
}

function jsonRequest(url: string, payload: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

beforeEach(() => {
  getSessionUser.mockResolvedValue({ id: "user-1", email: "founder@mail.bg", name: "Антонио" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("production is a hard 404 — the tool does not exist to students", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "production"));

  it("GET /api/review", async () => {
    const res = await review.GET(getRequest());
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

  it("404s BEFORE consulting the session — production is not an auth question", async () => {
    await review.GET(getRequest());
    expect(getSessionUser).not.toHaveBeenCalled();
  });
});

describe("outside production, an anonymous caller gets 401 and writes nothing", () => {
  beforeEach(() => getSessionUser.mockResolvedValue(null));

  it("GET /api/review", async () => {
    expect((await review.GET(getRequest())).status).toBe(401);
    expect(writeAttempts()).toBe(0);
  });

  it("POST /api/review", async () => {
    const res = await review.POST(
      jsonRequest("http://localhost/api/review", { questionId: "q-1", action: "approve" }),
    );
    expect(res.status).toBe(401);
    expect(writeAttempts()).toBe(0);
  });
});

describe("an authenticated dev call reaches content-admin, once, with parsed input", () => {
  it("GET /api/review lists one page of the default queue", async () => {
    expect((await review.GET(getRequest())).status).toBe(200);
    expect(listFlaggedQuestions).toHaveBeenCalledTimes(1);
    expect(listFlaggedQuestions.mock.calls[0][0]).toEqual({ queue: "needs-review", page: 1 });
  });

  it("GET /api/review passes through the queue and page", async () => {
    await review.GET(getRequest("http://localhost/api/review?queue=unsigned&page=4"));
    expect(listFlaggedQuestions.mock.calls[0][0]).toEqual({ queue: "unsigned", page: 4 });
  });

  it("GET /api/review falls back to page 1 on junk paging input", async () => {
    await review.GET(getRequest("http://localhost/api/review?queue=nope&page=-3"));
    expect(listFlaggedQuestions.mock.calls[0][0]).toEqual({ queue: "needs-review", page: 1 });
  });

  it("POST /api/review applies exactly one decision", async () => {
    const res = await review.POST(
      jsonRequest("http://localhost/api/review", { questionId: "q-1", action: "approve" }),
    );
    expect(res.status).toBe(200);
    expect(applyReviewDecision).toHaveBeenCalledTimes(1);
    expect(applyReviewDecision.mock.calls[0][0]).toBe("q-1");
  });

  it("signs with the SESSION identity, not anything the caller sent", async () => {
    await review.POST(
      jsonRequest("http://localhost/api/review", {
        questionId: "q-1",
        action: "approve",
        by: "somebody-else",
        reviewer: "somebody-else",
      }),
    );
    expect(applyReviewDecision.mock.calls[0][2]).toBe("Антонио");
  });

  it("falls back to the session email when the account has no name", async () => {
    getSessionUser.mockResolvedValue({ id: "user-1", email: "founder@mail.bg", name: null });
    await review.POST(
      jsonRequest("http://localhost/api/review", { questionId: "q-1", action: "approve" }),
    );
    expect(applyReviewDecision.mock.calls[0][2]).toBe("founder@mail.bg");
  });

  it("POST /api/review rejects malformed JSON and an unparseable decision", async () => {
    expect((await review.POST(jsonRequest("http://localhost/api/review", "{{"))).status).toBe(400);
    expect((await review.POST(jsonRequest("http://localhost/api/review", { nope: 1 }))).status).toBe(400);
    expect(applyReviewDecision).not.toHaveBeenCalled();
  });
});
