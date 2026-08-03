/**
 * `checks.migrations` — the probe that turns a silent 500 storm into a
 * rollback.
 *
 * THE FAILURE IT PINS DOWN. `SELECT 1` proves Postgres answers. It says
 * nothing about whether the schema the new build was written against exists.
 * So: add a column, write code against it, forget the migration — typecheck
 * passes, tests pass, the build passes, CI is green, the deploy declares
 * itself healthy because the database answered, and every request touching the
 * column 500s. CI now applies migrations to a real Postgres so that shape
 * cannot merge; this probe is the same question asked of PRODUCTION, where the
 * failure looks different — `prisma migrate deploy` fell over halfway and left
 * a migration marked started and never finished.
 *
 * A SEPARATE FILE from route.test.ts on purpose: that file's fake answers every
 * query identically, which is exactly right for the reachability tests it owns
 * and useless for these, which turn on WHICH query is being asked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Every statement the route issued, normalised — proof it stays bounded. */
const queries: string[] = [];

let migrationsTablePresent = true;
let unfinished: { migration_name: string }[] = [];
let dbThrows: Error | null = null;

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("?").replace(/\s+/g, " ").trim();
      queries.push(sql);
      if (dbThrows) throw dbThrows;
      if (sql.includes("to_regclass")) return [{ present: migrationsTablePresent }];
      if (sql.includes("_prisma_migrations")) return unfinished;
      return [{ "?column?": 1 }];
    },
  },
}));

// Pinned so a machine that happens to have MAIL_* set does not change what
// these assertions are about. checks.mail has its own tests next door.
vi.mock("@/modules/mail", () => ({
  describeMailTransport: () => ({ transport: "console", ok: true, gaps: [] }),
}));

const { GET } = await import("./route");

const readiness = () => GET(new Request("http://localhost:3100/api/health"));

beforeEach(() => {
  queries.length = 0;
  migrationsTablePresent = true;
  unfinished = [];
  dbThrows = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("a whole schema", () => {
  it("answers 200 when every migration finished", async () => {
    const res = await readiness();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.migrations.ok).toBe(true);
  });

  it("asks only about migrations that started and never finished", async () => {
    await readiness();
    const sql = queries.find((q) => q.includes('FROM "_prisma_migrations"'));
    expect(sql).toBeDefined();
    expect(sql).toContain("finished_at IS NULL");
    // An operator who has already resolved a failure by hand marks it rolled
    // back; keeping the deployment red forever afterwards helps nobody.
    expect(sql).toContain("rolled_back_at IS NULL");
    // Bounded: this endpoint is polled once a second by the deploy gate and
    // must never become a lever for loading the database.
    expect(sql).toContain("LIMIT 5");
  });
});

describe("a half-applied schema", () => {
  it("is 503, and NAMES the migration that did not finish", async () => {
    unfinished = [{ migration_name: "20260803150000_admin_action_audit" }];

    const res = await readiness();
    const body = await res.json();

    // Without this probe the identical state answers 200, the deploy records
    // a success, and the 500s start arriving from students instead.
    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    // The database itself is perfectly fine — which is the whole distinction.
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.migrations.ok).toBe(false);
    expect(body.checks.migrations.error).toBe("unfinished");
    expect(body.checks.migrations.pending).toEqual([
      "20260803150000_admin_action_audit",
    ]);
  });

  it('emits `"migrations":{"ok":false` — the substring deploy.sh matches on', async () => {
    // deploy.sh reads this to tell "the build arrived ahead of its schema"
    // (roll the code back — the previous build predates the migration) apart
    // from "the database is down" (a rollback fixes nothing and costs a
    // restart). It greps the body exactly as it greps for the commit, so the
    // key ORDER inside checks.migrations is load-bearing, not cosmetic.
    unfinished = [{ migration_name: "x" }];
    const text = await (await readiness()).text();
    expect(text).toContain('"migrations":{"ok":false');
  });
});

describe("boxes that are not production", () => {
  it("stays green on a database with no _prisma_migrations table", async () => {
    // A `db push` development box. A health endpoint that goes red on every
    // developer's machine is one everybody learns to ignore.
    migrationsTablePresent = false;
    const res = await readiness();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.checks.migrations).toMatchObject({ ok: true, error: "absent" });
    // And it did not go on to query a table it had just been told is absent.
    expect(queries.some((q) => q.includes('FROM "_prisma_migrations"'))).toBe(false);
  });
});

describe("one outage must not look like two", () => {
  it("skips the migration probe entirely when the database is unreachable", async () => {
    dbThrows = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    const res = await readiness();
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.checks.db.ok).toBe(false);
    // Marking migrations red as well would send deploy.sh down the roll-back
    // path when the only remedy is "fix Postgres".
    expect(body.checks.migrations).toMatchObject({ ok: true, error: "skipped" });
    expect(queries).toHaveLength(1);
  });
});
