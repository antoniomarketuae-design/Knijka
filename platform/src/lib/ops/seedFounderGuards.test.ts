/**
 * THE ADMIN PASSWORD THAT WAS PUBLISHED IN A PUBLIC REPOSITORY.
 *
 * scripts/seed-founder.mjs read `process.env.SEED_FOUNDER_PASSWORD ??
 * "founder-dev"` and created founder@knijka.ai with role=admin. Admin is not a
 * convenience flag here — it bypasses the simulator entitlement (the EUR 21.99
 * pack), the mock-exam limit, the practice cap, the hazard gate and the tutor
 * quota. Anyone who read the repo held a key to every paywall in the product.
 *
 * Each test below is one way that door could be left open again: a default
 * password sneaking back, a seed pointed at the live database, or the script
 * being run on the production box "just this once".
 *
 * The guard is exercised as a pure function AND the real script is spawned
 * once, because a guard that exists but is never called is the same bug in a
 * different file.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkSeedEnvironment,
  isLocalDatabaseUrl,
  MIN_SEED_PASSWORD_LENGTH,
} from "../../../scripts/seed-founder-guards.mjs";

const LOCAL_DB = "postgres://postgres:postgres@localhost:51214/template1";
const GOOD_PASSWORD = "seed-parola-1234";

function env(over: Record<string, string | undefined> = {}) {
  return { DATABASE_URL: LOCAL_DB, SEED_FOUNDER_PASSWORD: GOOD_PASSWORD, ...over };
}

const SCRIPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts",
);

describe("checkSeedEnvironment", () => {
  it("allows a fully specified local seed", () => {
    expect(checkSeedEnvironment(env())).toEqual({
      ok: true,
      password: GOOD_PASSWORD,
      databaseUrl: LOCAL_DB,
    });
  });

  it("REFUSES when SEED_FOUNDER_PASSWORD is missing — there is no default", () => {
    const result = checkSeedEnvironment(env({ SEED_FOUNDER_PASSWORD: undefined }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_password");
    // And the refusal explains the stakes, because the next person to hit it
    // will be tempted to put the default back.
    expect(result.message).toContain("SEED_FOUNDER_PASSWORD");
  });

  it("REFUSES an empty password, which is how a default comes back", () => {
    const result = checkSeedEnvironment(env({ SEED_FOUNDER_PASSWORD: "" }));
    expect(result).toMatchObject({ ok: false, reason: "no_password" });
  });

  it("holds a seed password to the same floor as a student's", () => {
    const result = checkSeedEnvironment(env({ SEED_FOUNDER_PASSWORD: "kratka" }));
    expect(result).toMatchObject({ ok: false, reason: "weak_password" });
    expect("kratka".length).toBeLessThan(MIN_SEED_PASSWORD_LENGTH);
  });

  it("REFUSES to run in production, however good the password is", () => {
    const result = checkSeedEnvironment(env({ NODE_ENV: "production" }));
    expect(result).toMatchObject({ ok: false, reason: "production" });
  });

  it("REFUSES a database that is not on this machine", () => {
    const result = checkSeedEnvironment(
      env({ DATABASE_URL: "postgres://u:p@db.knijka.ai:5432/knijka" }),
    );
    expect(result).toMatchObject({ ok: false, reason: "remote_database" });
  });

  it("still reports a missing DATABASE_URL as its own problem", () => {
    const result = checkSeedEnvironment(env({ DATABASE_URL: undefined }));
    expect(result).toMatchObject({ ok: false, reason: "no_database_url" });
  });

  it("checks production FIRST — the strongest refusal wins", () => {
    // A production box with a perfectly local-looking DATABASE_URL (a socket
    // proxy, a tunnel) must not slip through on the strength of its host name.
    const result = checkSeedEnvironment(env({ NODE_ENV: "production" }));
    expect(result).toMatchObject({ ok: false, reason: "production" });
  });
});

describe("isLocalDatabaseUrl", () => {
  it("accepts loopback in every spelling", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]", "LOCALHOST"]) {
      expect(
        isLocalDatabaseUrl(`postgres://u:p@${host}:5432/db`),
        host,
      ).toBe(true);
    }
  });

  it("rejects anything else, including the ones that look friendly", () => {
    for (const url of [
      "postgres://u:p@db.knijka.ai:5432/knijka",
      "postgres://u:p@10.0.0.5:5432/knijka",
      "postgres://u:p@host.docker.internal:5432/knijka",
      "postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
    ]) {
      expect(isLocalDatabaseUrl(url), url).toBe(false);
    }
  });

  it("treats an unparseable URL as NOT local — never guess in this direction", () => {
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
    expect(isLocalDatabaseUrl("")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
  });
});

/**
 * The guard has to be WIRED, not merely written — and it has to fire before the
 * script opens a connection, or the operator sees a network timeout instead of
 * the reason. One spawn of the real file proves both.
 */
describe("scripts/seed-founder.mjs", () => {
  it("exits non-zero and explains itself when the password is missing", () => {
    let status = 0;
    let stderr = "";
    try {
      execFileSync(process.execPath, ["seed-founder.mjs"], {
        cwd: SCRIPTS_DIR,
        encoding: "utf8",
        env: {
          ...process.env,
          // A path that does not exist, so the repo's own .env cannot supply
          // the very variable this test is asserting is absent.
          DOTENV_CONFIG_PATH: path.join(SCRIPTS_DIR, "no-such.env"),
          DATABASE_URL: LOCAL_DB,
          SEED_FOUNDER_PASSWORD: "",
          NODE_ENV: "development",
        },
      });
    } catch (err) {
      const e = err as { status?: number; stderr?: string };
      status = e.status ?? -1;
      stderr = e.stderr ?? "";
    }

    expect(status).not.toBe(0);
    // The exact reason, not a connection error: proof the guard ran first.
    expect(stderr).toContain("SEED_FOUNDER_PASSWORD is required");
  }, 30_000);
});
