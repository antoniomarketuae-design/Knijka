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
 * It also reports the live commit, so the deploy can prove the swap took effect
 * instead of trusting that a restart restarted anything — exactly the check the
 * ENOENT window would have failed. `commit` is baked in at build time by the
 * deploy; "unknown" locally is expected, not an error.
 *
 * No PII, no session, no secrets (ADR-004) — safe to leave unauthenticated,
 * which it must be: the gate runs before anyone can log in, and `src/proxy.ts`
 * does not match `/api/*`.
 */

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
  return Response.json(
    { ok: db.ok, probe: "readiness", ...identity, checks: { db } },
    // 503, not 500: "temporarily cannot serve" is what an uptime monitor, a
    // load balancer and the deploy gate all need to hear.
    { status: db.ok ? 200 : 503, headers },
  );
}
