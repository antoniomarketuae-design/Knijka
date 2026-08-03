/**
 * The three refusals in front of the founder seed.
 *
 * WHY THEY EXIST. seed-founder.mjs created founder@knijka.ai with role=admin
 * and, when SEED_FOUNDER_PASSWORD was unset, the password `"founder-dev"` — a
 * literal in a PUBLIC repository. Admin is not a convenience flag in this
 * product: it bypasses the simulator entitlement (the whole EUR 21.99 pack),
 * the mock-exam limit, the practice cap, the hazard gate and the tutor quota.
 * So the default was a published key to every paywall the product has.
 *
 * A default that is convenient in dev and catastrophic in prod is not a
 * trade-off, it is a bug with a comment on it. There is no default any more:
 * the variable is required, and two further refusals make it impossible to run
 * this script at all against anything that looks like a live database.
 *
 * PURE ON PURPOSE. `checkSeedEnvironment` decides and returns; the script
 * prints and exits. That is what lets the decisions be tested without spawning
 * a process or reaching a Postgres, and it is why the guard cannot quietly
 * regress into "well, it worked on my machine".
 */

/** Same floor as the product's own password policy (modules/auth/schemas.ts):
 *  a seed password nobody would accept at the register form is not a fix. */
export const MIN_SEED_PASSWORD_LENGTH = 8;

/**
 * Hosts a seed may write to. Loopback only — this script mints an admin.
 *
 * `host.docker.internal` is deliberately NOT here: it resolves to whatever the
 * container host is, which is exactly the ambiguity this guard exists to
 * remove.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

/**
 * Is this connection string pointed at a database on this machine?
 *
 * Anything unparseable counts as NOT local. A URL we cannot read is a URL we
 * cannot vouch for, and the failure mode of guessing wrong here is seeding an
 * admin account into production.
 */
export function isLocalDatabaseUrl(url) {
  if (typeof url !== "string" || url.trim() === "") return false;
  try {
    const { hostname } = new URL(url);
    return LOCAL_HOSTS.has(hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * May the seed run in this environment?
 *
 * @param {Record<string, string | undefined>} env — normally process.env
 * @returns {{ ok: true, password: string, databaseUrl: string }
 *          | { ok: false, reason: string, message: string }}
 */
export function checkSeedEnvironment(env) {
  // 1. NEVER in production. Even with a strong password, creating an admin from
  //    a script is an ops action with an audit trail, not a `npm run` away.
  if (env.NODE_ENV === "production") {
    return {
      ok: false,
      reason: "production",
      message:
        "seed-founder: refusing to run with NODE_ENV=production. This script creates an ADMIN account, and admin bypasses every paywall in the product. Grant admin on a live system deliberately, with SQL, and record who did it.",
    };
  }

  // 2. A database we can name, and can name as ours.
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      ok: false,
      reason: "no_database_url",
      message: "seed-founder: DATABASE_URL is not set (see .env.example)",
    };
  }
  if (!isLocalDatabaseUrl(databaseUrl)) {
    return {
      ok: false,
      reason: "remote_database",
      message:
        "seed-founder: refusing to seed a non-local database. DATABASE_URL must point at localhost — this script mints an admin, and an admin on a shared or live database is a free licence to the whole product.",
    };
  }

  // 3. A password we were GIVEN. The old fallback ("founder-dev") shipped in a
  //    public repo, so every reader of the source knew the founder's password.
  const password = env.SEED_FOUNDER_PASSWORD;
  if (!password) {
    return {
      ok: false,
      reason: "no_password",
      message:
        "seed-founder: SEED_FOUNDER_PASSWORD is required and has no default. The previous default was a literal in a public repository, on an account that bypasses the simulator entitlement, the exam limit, the practice cap, the hazard gate and the tutor quota. Set it in .env (see .env.example) and run again.",
    };
  }
  if (password.length < MIN_SEED_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: "weak_password",
      message: `seed-founder: SEED_FOUNDER_PASSWORD must be at least ${MIN_SEED_PASSWORD_LENGTH} characters — the same floor the register form enforces on students.`,
    };
  }

  return { ok: true, password, databaseUrl };
}
