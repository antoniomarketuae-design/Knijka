// -----------------------------------------------------------------------------
// user.mjs — the throwaway account the sweep signs in as.
//
// WHY THIS EXISTS. Almost every route worth measuring is behind
// src/proxy.ts, and /simulator is behind the €21.99 entitlement gate on top of
// that (src/app/(dashboard)/simulator/access.ts). A sweep that is not signed in
// measures the LOGIN PAGE six times and hands back a table of numbers that
// looks exactly like data. That has already happened once in this project.
// So: authenticate, and prove it by asserting the final URL is the route we
// asked for — see auth.mjs.
//
// SAFETY RAILS (ADR-004: the real users are minors)
//  - LOCAL DEV DATABASE ONLY. `assertLocalDatabase` refuses to run against
//    anything that is not localhost/127.0.0.1, so this can never touch
//    staging. Never type a password on staging.
//  - The account is created with a random password held only in this process
//    and written to the gitignored run directory, never committed.
//  - `dropHarnessUser` removes the row and everything that references it. The
//    CLI calls it on `--cleanup`, and the sweep can be told to clean up after
//    itself with `--ephemeral-user`.
//  - role=admin is deliberate and is the ONLY way to measure the simulator:
//    access.ts grants admins the entitlement, so the harness never has to
//    fabricate a payment.
// -----------------------------------------------------------------------------
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { PLATFORM } from "./server.mjs";

const require = createRequire(join(PLATFORM, "package.json"));

export const HARNESS_EMAIL =
  process.env.KNIJKA_MOBILE_EMAIL || "mobile-harness@test.local";

function loadEnv() {
  try {
    require("dotenv").config({ path: join(PLATFORM, ".env") });
  } catch {
    /* dotenv absent in CI — real env vars are expected there */
  }
}

export function assertLocalDatabase(connectionString) {
  const host = /@([^/:]+)/.exec(connectionString || "")?.[1] || "";
  if (!/^(localhost|127\.0\.0\.1|::1|postgres|db)$/i.test(host)) {
    throw new Error(
      `[mobile-harness] refusing to touch a non-local database (host "${host}"). ` +
        `This helper creates and deletes a user; it is for the LOCAL dev DB only.`,
    );
  }
}

/**
 * THE LOCAL DEV DB IS PGLITE AND IT ONLY HAS 10 CONNECTION SLOTS.
 * `npx prisma dev` runs a PGlite socket server whose log says, verbatim,
 * `[PGLiteSocketServer] constructor: max connections: 10`. Each parallel lane's
 * `next dev` holds a Prisma pool against it (the URL in .env asks for
 * connection_limit=10 on its own), so a new connection is regularly answered
 * with a reset rather than an error: `Connection terminated unexpectedly` /
 * `read ECONNRESET`. That is contention, not a broken database — retrying wins.
 * We also close every connection immediately, so the harness never holds a slot
 * while a browser sweep is running.
 */
async function connect(attempts = 20) {
  loadEnv();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("[mobile-harness] DATABASE_URL is not set");
  assertLocalDatabase(connectionString);
  const { Client } = require("pg");
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    const client = new Client({ connectionString });
    // A socket the server resets mid-handshake surfaces as an 'error' event on
    // an otherwise unreferenced client; without this it becomes an unhandled
    // rejection that kills the whole run.
    client.on("error", () => {});
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        /* already gone */
      }
      // Cap the backoff: the slots free up when another lane's request
      // finishes, which is seconds, not minutes.
      await new Promise((r) => setTimeout(r, Math.min(3000, 400 * (i + 1))));
    }
  }
  throw new Error(
    `[mobile-harness] could not reach the dev database after ${attempts} tries ` +
      `(${lastError?.message ?? lastError}). If every retry resets, the PGlite ` +
      `daemon is wedged: restart it with \`npx prisma dev\` from platform/.`,
  );
}

/**
 * Create (or reset the password of) the harness account and return its
 * credentials. Idempotent: safe to call before every sweep.
 */
export async function ensureHarnessUser({ email = HARNESS_EMAIL, password } = {}) {
  const { hash } = require("bcryptjs");
  const secret = password || process.env.KNIJKA_MOBILE_PASSWORD || randomBytes(18).toString("base64url");
  const client = await connect();
  try {
    const passwordHash = await hash(secret, 10);
    const existing = await client.query('SELECT id FROM "User" WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      await client.query(
        'UPDATE "User" SET "passwordHash" = $1, role = $2 WHERE email = $3',
        [passwordHash, "admin", email],
      );
      return { email, password: secret, id: existing.rows[0].id, created: false };
    }
    const id = `mobharness${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
    await client.query(
      `INSERT INTO "User" (id, email, name, "passwordHash", locale, role, "consentAt", "createdAt")
       VALUES ($1, $2, $3, $4, 'bg', 'admin', NOW(), NOW())`,
      [id, email, "Mobile harness", passwordHash],
    );
    return { email, password: secret, id, created: true };
  } finally {
    await client.end();
  }
}

/** Delete the harness account and its dependent rows. */
export async function dropHarnessUser({ email = HARNESS_EMAIL } = {}) {
  const client = await connect();
  try {
    const found = await client.query('SELECT id FROM "User" WHERE email = $1', [email]);
    if (found.rows.length === 0) return { deleted: false, email };
    const id = found.rows[0].id;
    // Child tables first — no ON DELETE CASCADE is assumed.
    for (const table of [
      "Entitlement",
      "ExamAttempt",
      "ExamOutcomeReport",
      "GamificationState",
      "Progress",
      "QuestionAttempt",
      "SimSession",
      "TutorThread",
    ]) {
      try {
        await client.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [id]);
      } catch {
        /* table may not reference userId in this schema version */
      }
    }
    await client.query('DELETE FROM "User" WHERE id = $1', [id]);
    return { deleted: true, email, id };
  } finally {
    await client.end();
  }
}
