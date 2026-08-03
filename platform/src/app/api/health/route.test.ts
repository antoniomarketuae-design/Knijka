/**
 * GET /api/health — the endpoint the deploy's retry loop trusts (audit
 * 2026-07-24, H-17). If this ever answers 200 from a stale process, or from
 * cache, the rollback gate is decoration: that is exactly what the ~11.5 h
 * staging outage looked like from the outside — a process that was "up".
 *
 * The DB probe is mocked, never real. These tests must run in CI, where
 * DATABASE_URL points at nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, dynamic } from "./route";

/** Whatever the current test wants `db.$queryRaw` to do. */
let queryRaw: () => Promise<unknown>;

vi.mock("@/lib/db", () => ({
  db: { $queryRaw: () => queryRaw() },
}));

beforeEach(() => {
  queryRaw = async () => [{ "?column?": 1 }];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const readiness = () => GET(new Request("http://localhost:3100/api/health"));
const liveness = () =>
  GET(new Request("http://localhost:3100/api/health?probe=liveness"));

describe("GET /api/health — readiness", () => {
  it("answers 200 with ok:true when the process serves and the DB answers", async () => {
    const res = await readiness();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.probe).toBe("readiness");
    expect(body.checks.db.ok).toBe(true);
  });

  it("answers 503 when the database is unreachable — a build that cannot serve users is not healthy", async () => {
    queryRaw = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    };
    const res = await readiness();
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.db.ok).toBe(false);
    expect(body.checks.db.error).toBe("unreachable");
  });

  it("bounds a hanging DB rather than hanging itself — the gate must never read a slow socket as a dead process", async () => {
    vi.useFakeTimers();
    queryRaw = () => new Promise(() => {}); // never settles, like a black-holed connect
    const pending = readiness();
    await vi.advanceTimersByTimeAsync(2_100);
    const body = await (await pending).json();
    expect(body.checks.db.ok).toBe(false);
    expect(body.checks.db.error).toBe("timeout");
  });

  it("reports the failure class, never the message — Prisma errors quote the password-bearing DSN", async () => {
    class PrismaClientInitializationError extends Error {
      override name = "PrismaClientInitializationError";
    }
    queryRaw = async () => {
      throw new PrismaClientInitializationError(
        "the URL postgresql://knijka:hunter2@127.0.0.1:5432/knijka is invalid",
      );
    };
    const body = JSON.stringify(await (await readiness()).json());
    expect(body).not.toContain("hunter2");
    expect(body).toContain("PrismaClientInitializationError");
  });

  it("still answers when the DB module itself cannot load (DATABASE_URL unset) instead of 500-ing", async () => {
    queryRaw = () => {
      throw new Error("DATABASE_URL is not set (see .env.example)");
    };
    const res = await readiness();
    expect(res.status).toBe(503);
    expect((await res.json()).checks.db.ok).toBe(false);
  });
});

/**
 * `checks.mail` answers a question nothing in the product could answer before:
 * can this deployment give a locked-out student her account back? The mail
 * module falls back to a console transport on five paths and warns once per
 * process, so a box with no MAIL_* variables looked exactly like a healthy one.
 */
describe("GET /api/health — checks.mail", () => {
  const CREDENTIALS: Record<string, string> = {
    MAIL_TRANSPORT: "resend",
    MAIL_API_KEY: "re_super_secret_key",
    MAIL_FROM: "Книжка.AI <no-reply@knijka.ai>",
  };

  it("reports the console fallback as NOT ok — that is the live .env today", async () => {
    for (const key of Object.keys(CREDENTIALS)) vi.stubEnv(key, "");
    const body = await (await readiness()).json();
    expect(body.checks.mail.transport).toBe("console");
    expect(body.checks.mail.ok).toBe(false);
  });

  it("goes green the moment the credentials exist", async () => {
    for (const [k, v] of Object.entries(CREDENTIALS)) vi.stubEnv(k, v);
    const body = await (await readiness()).json();
    expect(body.checks.mail).toMatchObject({ transport: "resend", ok: true });
  });

  it("REPORTS BUT DOES NOT GATE: a missing MAIL_* must never trigger a rollback", async () => {
    // A rollback cannot fix a missing environment variable — the previous build
    // faces the same environment — so failing readiness on this would turn a
    // configuration gap into a rollback loop. Checkout is where it bites
    // instead (modules/payments/stripe.ts).
    for (const key of Object.keys(CREDENTIALS)) vi.stubEnv(key, "");
    const res = await readiness();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("never touches the mail provider and never prints the API key", async () => {
    for (const [k, v] of Object.entries(CREDENTIALS)) vi.stubEnv(k, v);
    const body = JSON.stringify(await (await readiness()).json());
    expect(body).not.toContain("re_super_secret_key");
  });

  it("stays off the liveness probe — it is a config fact, not a process fact", async () => {
    expect((await (await liveness()).json()).checks).toBeUndefined();
  });
});

describe("GET /api/health?probe=liveness", () => {
  it("answers 200 without touching the database — a DB outage must not trigger a code rollback", async () => {
    let touched = false;
    queryRaw = async () => {
      touched = true;
      return [];
    };
    const res = await liveness();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.probe).toBe("liveness");
    expect(body.checks).toBeUndefined();
    expect(touched).toBe(false);
  });

  it("fails safe on a typo'd probe: anything but 'liveness' still checks the DB", async () => {
    queryRaw = async () => {
      throw new Error("down");
    };
    const res = await GET(
      new Request("http://localhost:3100/api/health?probe=livenes"),
    );
    expect(res.status).toBe(503);
  });
});

describe("GET /api/health — deploy contract", () => {
  it("reports the LIVE commit, so a deploy can prove the swap took effect", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMMIT_SHA", "abc1234");
    expect((await (await readiness()).json()).commit).toBe("abc1234");
    expect((await (await liveness()).json()).commit).toBe("abc1234");
  });

  it("says 'unknown' rather than blank when the SHA was not baked in", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMMIT_SHA", "");
    expect((await (await readiness()).json()).commit).toBe("unknown");
  });

  it("is never cached — a cached health check is not a health check", async () => {
    expect((await readiness()).headers.get("Cache-Control")).toBe("no-store");
    expect((await liveness()).headers.get("Cache-Control")).toBe("no-store");
    expect(dynamic).toBe("force-dynamic");
  });

  it("ADR-004: leaks no session, no PII and no configuration", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://secret:hunter2@db/knijka");
    vi.stubEnv("AUTH_SECRET", "super-secret-value");
    const body = JSON.stringify(await (await readiness()).json());
    expect(body).not.toContain("hunter2");
    expect(body).not.toContain("super-secret-value");
    expect(Object.keys(JSON.parse(body)).sort()).toEqual([
      "at",
      "checks",
      "commit",
      "ok",
      "probe",
      "uptimeSec",
    ]);
  });
});
