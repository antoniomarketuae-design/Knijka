/**
 * POST /api/register — the account-creation route (audit 2026-07-24, H-13).
 *
 * The route is a thin adapter over registerUser(), which
 * modules/auth/__tests__/service.test.ts covers in depth. What is tested HERE
 * is only what the adapter itself decides: the status-code mapping a browser
 * sees, and the rule that a failure must never leak server internals or reveal
 * whether an e-mail exists.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { InMemoryAuthStore, setAuthStore, type AuthUserRecord } from "@/modules/auth";

let users: AuthUserRecord[];

function body(over: Record<string, unknown> = {}) {
  return {
    email: "ivan@mail.bg",
    password: "parola1234",
    name: "Иван",
    birthYear: 2008,
    consent: true,
    ...over,
  };
}

function post(payload: unknown) {
  return POST(
    new Request("http://localhost/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
}

beforeEach(() => {
  users = [];
  setAuthStore(new InMemoryAuthStore(users));
});

afterEach(() => {
  setAuthStore(null);
  vi.restoreAllMocks();
});

describe("POST /api/register", () => {
  it("201s with the created user and no password anywhere in the response", async () => {
    const res = await post(body());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.user.email).toBe("ivan@mail.bg");
    expect(JSON.stringify(json)).not.toContain("parola1234");
    expect(JSON.stringify(json)).not.toContain(users[0].passwordHash);
  });

  it("400s on a body that is not JSON at all", async () => {
    const res = await post("not json {");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
    expect(users).toHaveLength(0);
  });

  it("400s with per-field errors on invalid input", async () => {
    const res = await post(body({ password: "kratka" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_input");
    expect(json.fieldErrors.password).toBeDefined();
    expect(users).toHaveLength(0);
  });

  // The only case here that registers TWICE, so the only one paying two
  // cost-12 bcrypt hashes (BCRYPT_ROUNDS in modules/auth/service.ts). Same
  // contention budget as the auth-service login test for the same reason:
  // under a full-suite worker wave this overruns vitest's 5 s default on
  // hashing alone. Nothing about the 409 mapping is relaxed by it.
  it("409s on a taken e-mail without creating a second account", { timeout: 30_000 }, async () => {
    await post(body());
    const res = await post(body({ name: "Друг" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("email_taken");
    expect(users).toHaveLength(1);
  });

  it("500s on an unexpected store failure and leaks nothing about it", async () => {
    setAuthStore({
      findUserByEmail: async () => null,
      createUser: async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
      },
      findRoleById: async () => null,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(body());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe(JSON.stringify({ error: "server_error" }));
    expect(text).not.toContain("ECONNREFUSED");
  });
});
