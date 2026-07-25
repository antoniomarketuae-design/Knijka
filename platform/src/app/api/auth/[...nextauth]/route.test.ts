/**
 * The per-e-mail failed-login lockout (audit 2026-07-24, H-8: "credentials
 * login has no attempt counter or lockout").
 *
 * next-auth itself is mocked away — the property under test is the wrapper's
 * decision, not the library's. What matters is that a streak of REJECTED
 * attempts against one address eventually costs the caller a wait taken
 * before any password hashing happens, that a correct password clears it, and
 * that the block cannot be used to find out which addresses have accounts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const nextAuthPost = vi.fn<(req: NextRequest) => Promise<Response>>();
vi.mock("@/auth", () => ({
  handlers: { GET: vi.fn(), POST: (req: NextRequest) => nextAuthPost(req) },
}));

const { POST } = await import("./route");
const { LOGIN_LOCKOUT, resetRateLimitState } = await import(
  "@/modules/security"
);

const CALLBACK = "https://knijka.ai/api/auth/callback/credentials";

/** What next-auth answers a `signIn(..., { redirect: false })` call. */
function authResponse(query: string): Response {
  return Response.json({ url: `https://knijka.ai/login?${query}` });
}
const REJECTED = () => authResponse("error=CredentialsSignin&code=credentials");
const ACCEPTED = () => authResponse("callbackUrl=%2Fdashboard");

function signInRequest(email: string, url = CALLBACK): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password: "wrong-guess" }).toString(),
  });
}

beforeEach(() => {
  resetRateLimitState();
  nextAuthPost.mockResolvedValue(REJECTED());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/callback/credentials", () => {
  it("passes a normal attempt through to next-auth untouched", async () => {
    nextAuthPost.mockResolvedValue(ACCEPTED());

    const res = await POST(signInRequest("ivan@mail.bg"));
    expect(res.status).toBe(200);
    expect(nextAuthPost).toHaveBeenCalledTimes(1);
    // The body must still be readable by next-auth — we only cloned it.
    expect((await res.json()).url).toContain("callbackUrl");
  });

  it("locks the address out after a streak of wrong passwords", async () => {
    for (let i = 0; i < LOGIN_LOCKOUT.freeAttempts + 1; i++) {
      const res = await POST(signInRequest("ivan@mail.bg"));
      expect(res.status).toBe(200);
    }
    nextAuthPost.mockClear();

    const blocked = await POST(signInRequest("ivan@mail.bg"));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // The point of blocking here rather than in authorize(): bcrypt (cost 12,
    // ~250-320 ms of CPU) is never reached.
    expect(nextAuthPost).not.toHaveBeenCalled();
  });

  it("locks the ADDRESS, not the connection — a botnet gains nothing", async () => {
    for (let i = 0; i < LOGIN_LOCKOUT.freeAttempts + 1; i++) {
      await POST(signInRequest("target@mail.bg"));
    }

    // Same process, same everything except the account being guessed.
    expect((await POST(signInRequest("target@mail.bg"))).status).toBe(429);
    expect((await POST(signInRequest("someone.else@mail.bg"))).status).toBe(200);
  });

  it("treats the address case-insensitively, like the account store does", async () => {
    for (let i = 0; i < LOGIN_LOCKOUT.freeAttempts + 1; i++) {
      await POST(signInRequest("ivan@mail.bg"));
    }
    expect((await POST(signInRequest(" IVAN@Mail.BG "))).status).toBe(429);
  });

  it("clears the streak the moment the right password arrives", async () => {
    for (let i = 0; i < LOGIN_LOCKOUT.freeAttempts; i++) {
      await POST(signInRequest("ivan@mail.bg"));
    }

    nextAuthPost.mockResolvedValue(ACCEPTED());
    await POST(signInRequest("ivan@mail.bg"));

    // Back to a full allowance — the account is demonstrably not under attack.
    nextAuthPost.mockResolvedValue(REJECTED());
    for (let i = 0; i < LOGIN_LOCKOUT.freeAttempts; i++) {
      expect((await POST(signInRequest("ivan@mail.bg"))).status).toBe(200);
    }
  });

  it("says nothing an attacker could use to enumerate accounts", async () => {
    for (let i = 0; i < LOGIN_LOCKOUT.freeAttempts + 1; i++) {
      await POST(signInRequest("ivan@mail.bg"));
    }

    const body = await (await POST(signInRequest("ivan@mail.bg"))).json();
    // Generic rate-limit shape, identical to an IP-budget block: no "locked",
    // no "this account exists", no e-mail echoed back.
    expect(body.error).toBe("rate_limited");
    expect(JSON.stringify(body)).not.toContain("ivan@mail.bg");
  });

  it("counts a 302 rejection too (a plain form post, not the JSON client)", async () => {
    nextAuthPost.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://knijka.ai/login?error=CredentialsSignin" },
      }),
    );

    for (let i = 0; i < LOGIN_LOCKOUT.freeAttempts + 1; i++) {
      await POST(signInRequest("ivan@mail.bg"));
    }
    expect((await POST(signInRequest("ivan@mail.bg"))).status).toBe(429);
  });

  it("never counts a response it cannot classify as a failure", async () => {
    // Our own 500 must not lock real students out of their own accounts.
    nextAuthPost.mockResolvedValue(new Response("boom", { status: 500 }));

    for (let i = 0; i < LOGIN_LOCKOUT.freeAttempts + 5; i++) {
      expect((await POST(signInRequest("ivan@mail.bg"))).status).toBe(500);
    }
  });

  it("leaves the other next-auth endpoints alone", async () => {
    nextAuthPost.mockResolvedValue(ACCEPTED());
    const res = await POST(
      new NextRequest("https://knijka.ai/api/auth/signout", { method: "POST" }),
    );
    expect(res.status).toBe(200);
    expect(nextAuthPost).toHaveBeenCalledTimes(1);
  });
});
