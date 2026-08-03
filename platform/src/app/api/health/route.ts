/**
 * GET /api/health — the deploy health gate (audit 2026-07-24, finding H-17).
 *
 * Why it exists: `/opt/knijka/autodeploy.sh` used to `rm -rf .next` under the
 * live pm2 process and then declare success the moment `pm2 restart` returned.
 * The old server kept serving from the directory that had just been deleted —
 * `knijka-error.log` holds six `ENOENT … .next/required-server-files.json`,
 * and one such deploy left staging broken for ~11.5 hours because nothing ever
 * asked the new process whether it could actually serve. This route is that
 * question: `tools/deploy/deploy.sh` curls it in a retry loop after the restart
 * and rolls the build back if it never answers 200.
 *
 * TWO PROBES, because "can it serve?" and "can it serve *users*?" are different
 * failures with different remedies, and the deploy script must not confuse them:
 *
 *   /api/health                  readiness — process AND database.
 *                                A 503 here means real users see errors.
 *   /api/health?probe=liveness   liveness — process only, never touches the DB.
 *
 * The deploy gates on readiness, but when readiness fails it asks liveness
 * before deciding: a build that serves fine against a database that is down
 * must NOT be rolled back — the previous build faces the same database, so the
 * rollback would turn one incident into two and add a restart's worth of
 * downtime. Rollback is the answer to "this build cannot serve"; a red
 * `checks.db` under a green liveness is the answer "page a human".
 *
 * The DB probe is `SELECT 1` — reachability, nothing more. It deliberately does
 * not count rows or read a model: an unauthenticated endpoint polled every
 * second by a deploy must never become a lever for loading the database.
 *
 * `checks.migrations` IS THE SECOND GATING CHECK, and the one that separates
 * "the database answers" from "the schema this build needs actually exists".
 * A half-applied `prisma migrate deploy` leaves a row in `_prisma_migrations`
 * with `finished_at` NULL; until this probe existed, a deployment in that state
 * answered 200 while every request touching the new column 500ed. It DOES drag
 * readiness to 503 — unlike `checks.db` — because here a rollback is the right
 * answer: the previous build predates the migration and does not need it.
 * `probeMigrations` below carries the full reasoning and the cost argument.
 *
 * WHAT IS DELIBERATELY NOT HERE: the DISABLED_FEATURES kill switch state. It
 * would be convenient to verify the switch with one curl, but this endpoint is
 * public and its contract is "no configuration, ever" — so the switch is
 * echoed on /admin instead, behind the admin gate (src/lib/features.ts).
 *
 * It also reports the live commit, so the deploy can prove the swap took effect
 * instead of trusting that a restart restarted anything — exactly the check the
 * ENOENT window would have failed. `commit` is baked in at build time by the
 * deploy; "unknown" locally is expected, not an error.
 *
 * No PII, no session, no secrets (ADR-004) — safe to leave unauthenticated,
 * which it must be: the gate runs before anyone can log in, and `src/proxy.ts`
 * does not match `/api/*`.
 *
 * `checks.mail` REPORTS BUT DOES NOT GATE. It answers "can this deployment give
 * a locked-out student her account back?" — a question with no answer anywhere
 * before now: the mail module falls back to a console transport on five paths
 * and warns once per process, so a deployment with no MAIL_* variables looked
 * identical to a healthy one. It deliberately does NOT drag readiness to 503,
 * for the same reason the db/liveness split exists: a rollback cannot fix a
 * missing environment variable — the previous build faces the same environment
 * — so failing readiness on it would turn a configuration gap into a rollback
 * loop. Checkout is where it bites instead: `isStripeConfigured()` refuses to
 * take money while `checks.mail.ok` is false (modules/payments/stripe.ts).
 */

import { describeMailTransport } from "@/modules/mail";

// Must reflect THIS process's state on every call — never prerendered, never
// cached, or the gate would happily validate a stale answer.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A hung TCP connect to Postgres can sit for 30 s or more. The deploy's own
 * `curl --max-time` would eventually cut the request, but a cut connection
 * looks exactly like a dead process — the one confusion this endpoint exists
 * to prevent. Bounding the probe in-process means the route ALWAYS answers,
 * and the answer always names which half failed.
 */
const DB_PROBE_TIMEOUT_MS = 2_000;

type CheckResult = {
  ok: boolean;
  latencyMs: number;
  /** Coarse failure class — see `describeFailure`. Absent when ok. */
  error?: string;
};

/**
 * Prisma quotes the connection string in its errors, and that string carries
 * the database password. This endpoint is public, so no error *message* may
 * reach the response body — only the error's class name, which is genuinely
 * diagnostic (`PrismaClientInitializationError` = bad config or credentials,
 * a plain `Error` = the socket) and cannot carry a secret.
 */
function describeFailure(err: unknown): string {
  if (err instanceof Error) {
    return err.name === "Error" ? "unreachable" : err.name;
  }
  return "unknown";
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError()), ms);
      }),
    ]);
  } finally {
    // Without this the loser's timer keeps the event loop busy for the full
    // duration on every single call — and the deploy gate polls once a second.
    clearTimeout(timer);
  }
}

/** Named so `describeFailure` reports it without inspecting any message. */
class TimeoutError extends Error {
  override readonly name = "timeout";
}

async function probeDatabase(): Promise<CheckResult> {
  const started = Date.now();
  try {
    // Imported lazily rather than at module scope: `@/lib/db` throws when
    // DATABASE_URL is unset, and a health endpoint that cannot load is a
    // health endpoint that cannot tell you what is wrong. This way a
    // misconfigured deploy still answers — with ok:false and a reason.
    const { db } = await import("@/lib/db");
    await withTimeout(db.$queryRaw`SELECT 1`, DB_PROBE_TIMEOUT_MS);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: describeFailure(err),
    };
  }
}

/** One row of `_prisma_migrations` that never finished. */
interface UnfinishedMigration {
  migration_name: string;
}

/**
 * IS THE SCHEMA WHOLE? — the check that turns a silent 500 storm into a
 * rollback.
 *
 * `SELECT 1` proves Postgres answers. It says nothing about whether the schema
 * the new build was written against actually exists. That gap is a real,
 * cheap-to-hit outage: add a column, write code against it, forget the
 * migration — typecheck passes, tests pass, the build passes, CI is green, the
 * deploy declares itself healthy because the database answered, and every
 * request touching the column 500s. The CI job now applies migrations to a real
 * Postgres so that shape cannot merge; this is the same question asked of
 * PRODUCTION, where the failure looks different: `prisma migrate deploy` fell
 * over halfway and left a migration marked started and never finished.
 *
 * Prisma records exactly that. A row in `_prisma_migrations` with
 * `finished_at IS NULL` is a migration that began and did not complete — the
 * definition of a half-applied schema. `rolled_back_at` marks one an operator
 * has already resolved by hand, so those are excluded: an incident that has
 * been dealt with must not keep the deployment unhealthy forever.
 *
 * WHY IT GATES READINESS. Rolling the CODE back is the correct remedy here,
 * and it is available: the previous build predates the migration, so it does
 * not depend on the schema that failed to apply. That makes this the opposite
 * of `checks.db` — a rollback cannot fix a database that is down, but it fixes
 * a build that arrived ahead of its schema. deploy.sh reads the two apart and
 * only holds off rolling back for the db case (tools/deploy/deploy.sh).
 *
 * COST. Two statements against a catalogue lookup and a table that holds one
 * row per migration ever written — a dozen. The endpoint is polled once a
 * second by the deploy gate, and this is still nothing; it remains true that
 * this route must never become a lever for loading the database, which is why
 * it stays a bounded metadata read and not a count of anything real.
 *
 * A DATABASE WITH NO `_prisma_migrations` AT ALL is reported as `state:
 * "absent"` and does NOT fail readiness. That is a `db push` development box,
 * not a broken production deploy, and a health endpoint that goes red on every
 * developer's machine is a health endpoint everyone learns to ignore.
 */
async function probeMigrations(): Promise<CheckResult & { pending?: string[] }> {
  const started = Date.now();
  try {
    const { db } = await import("@/lib/db");

    // to_regclass returns NULL instead of raising when the table is absent, so
    // "no migrations table" is an answer rather than an exception to classify.
    // Unqualified on purpose: it resolves through the connection's search_path,
    // which is what `?schema=` in DATABASE_URL sets.
    const [present] = await withTimeout(
      db.$queryRaw<{ present: boolean }[]>`
        SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present
      `,
      DB_PROBE_TIMEOUT_MS,
    );
    if (!present?.present) {
      return { ok: true, latencyMs: Date.now() - started, error: "absent" };
    }

    const unfinished = await withTimeout(
      db.$queryRaw<UnfinishedMigration[]>`
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
        ORDER BY started_at ASC
        LIMIT 5
      `,
      DB_PROBE_TIMEOUT_MS,
    );

    if (unfinished.length === 0) {
      return { ok: true, latencyMs: Date.now() - started };
    }
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: "unfinished",
      // Migration names are ours, not anyone's data — safe to publish, and the
      // one thing the human reading the log at 3am actually needs.
      pending: unfinished.map((r) => r.migration_name),
    };
  } catch (err) {
    // Unreadable is not the same as broken: if the database is down, `db`
    // above already said so and readiness is red for that reason. Reporting
    // this one as ok:false too would make a single outage look like two.
    return { ok: true, latencyMs: Date.now() - started, error: describeFailure(err) };
  }
}

export async function GET(request: Request): Promise<Response> {
  // Anything other than the exact string "liveness" means readiness, so a typo
  // in a probe URL fails safe — it checks more, never less.
  const liveness =
    new URL(request.url).searchParams.get("probe") === "liveness";

  const identity = {
    // `||`, not `??`: a deploy that exports the variable from an empty
    // `git rev-parse` gives "" — which would report a blank commit as if it
    // were a real one.
    commit: process.env.NEXT_PUBLIC_COMMIT_SHA || "unknown",
    uptimeSec: Math.round(process.uptime()),
    at: new Date().toISOString(),
  };

  // A cached health check is not a health check.
  const headers = { "Cache-Control": "no-store" };

  if (liveness) {
    return Response.json(
      { ok: true, probe: "liveness", ...identity },
      { headers },
    );
  }

  const db = await probeDatabase();
  // Only asked once the connection is known good — otherwise a database that
  // is down would produce two failures for one cause.
  const migrations = db.ok
    ? await probeMigrations()
    : { ok: true, latencyMs: 0, error: "skipped" };
  // Env inspection only — no send, no network, no API key in the answer.
  const mail = describeMailTransport();

  const ok = db.ok && migrations.ok;
  return Response.json(
    {
      ok,
      probe: "readiness",
      ...identity,
      // `migrations` comes SECOND on purpose: deploy.sh matches the substring
      // `"migrations":{"ok":false` to tell "roll the code back" apart from
      // "the database is down, a rollback fixes nothing".
      checks: { db, migrations, mail },
    },
    // 503, not 500: "temporarily cannot serve" is what an uptime monitor, a
    // load balancer and the deploy gate all need to hear. `mail` is reported
    // but excluded from this decision — see the module header.
    { status: ok ? 200 : 503, headers },
  );
}
