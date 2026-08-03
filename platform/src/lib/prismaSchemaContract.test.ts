import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE SCHEMA CONTRACT — the invariants the 2026-08-03 audit bought, pinned so
 * that removing one is a failing test rather than a silent regression.
 *
 * WHY A TEXT TEST AND NOT AN INTEGRATION TEST. The suite has no database: every
 * store in the product is faked through its injection seam precisely so unit
 * tests never need Postgres. That is the right trade for behaviour — but it
 * means NOTHING in the gate had ever looked at schema.prisma or at a migration.
 * `prisma generate` builds the client from schema.prisma ALONE, so the whole
 * app typechecks happily against a column that no migration creates, and the
 * gate stays green over a database that cannot store what the code writes.
 * That is audit finding 26, and this file is the always-on half of the fence.
 *
 * The authoritative check remains
 *   npx prisma migrate diff --from-migrations prisma/migrations \
 *                           --to-schema prisma/schema.prisma --exit-code
 * which replays every migration onto a shadow database and compares the result
 * to schema.prisma. It needs a live Postgres, so it belongs in the deploy path,
 * not here. This file catches the same class of mistake with `fs.readFileSync`.
 */

const PRISMA_DIR = path.resolve(__dirname, "../../prisma");
const SCHEMA_PATH = path.join(PRISMA_DIR, "schema.prisma");
const MIGRATIONS_DIR = path.join(PRISMA_DIR, "migrations");

const schema = readFileSync(SCHEMA_PATH, "utf8");

/** Strip `//` comments so a rule can never be satisfied by a comment ABOUT it. */
function stripPrismaComments(src: string): string {
  return src.replace(/\/\/.*$/gm, "");
}

/** Strip `--` comments, for the same reason, before scanning SQL. */
function stripSqlComments(src: string): string {
  return src.replace(/--.*$/gm, "");
}

interface ParsedModel {
  name: string;
  body: string;
  /** Scalar columns only — relation fields are not columns. */
  columns: string[];
}

function parseModels(src: string): ParsedModel[] {
  const clean = stripPrismaComments(src);
  const blocks = [...clean.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  const modelNames = new Set(blocks.map((b) => b[1]));

  return blocks.map(([, name, body]) => {
    const columns: string[] = [];
    for (const raw of body.split("\n")) {
      const line = raw.trim();
      // Block attributes (@@index, @@unique, @@id, @@map) are not fields.
      if (!line || line.startsWith("@@")) continue;
      const m = /^(\w+)\s+(\w+)/.exec(line);
      if (!m) continue;
      const [, field, type] = m;
      // `user User @relation(...)` / `payments Payment[]` are relations, which
      // exist only in the Prisma client — there is no such column in Postgres.
      if (modelNames.has(type)) continue;
      columns.push(field);
    }
    return { name, body, columns };
  });
}

const models = parseModels(schema);
const modelByName = new Map(models.map((m) => [m.name, m]));

function requireModel(name: string): ParsedModel {
  const m = modelByName.get(name);
  expect(m, `model ${name} is missing from schema.prisma`).toBeDefined();
  return m as ParsedModel;
}

// ---------------------------------------------------------------------------
// 1. The models and columns the audit demanded
// ---------------------------------------------------------------------------

describe("schema contract: the product can account for its own money", () => {
  it("has a Payment table — an Entitlement is a grant, never a receipt", () => {
    // Entitlement (schema.prisma) records that access was GRANTED: no amount,
    // no currency, no PaymentIntent, no livemode. So "did this person pay, when,
    // how much, and was it real money" was answerable only from Stripe's
    // dashboard — not from our own database. Three further findings are built
    // on this table.
    const payment = requireModel("Payment");
    for (const column of [
      "stripeSessionId",
      "stripePaymentIntentId",
      "userId",
      "pack",
      "amountCents",
      "currency",
      "livemode",
      "status",
      "rawEventId",
      "createdAt",
    ]) {
      expect(
        payment.columns,
        `Payment.${column} is what makes this a receipt rather than a second grant table`,
      ).toContain(column);
    }
  });

  it("keys Payment on the Stripe session, uniquely", () => {
    // One Checkout Session is one purchase attempt. Both fulfilment paths key
    // off it, so it is the idempotency key of the whole money flow.
    expect(requireModel("Payment").body).toMatch(
      /stripeSessionId\s+String\s+@unique/,
    );
  });

  it("keeps the receipt when the buyer is erased, but scrubs the link", () => {
    // Art. 17 erasure must not destroy the books (Bulgarian accounting law) and
    // must not leave a live identifier behind. SET NULL does both in the same
    // DELETE; CASCADE here would shred the only record that money changed
    // hands, which is the exact hole this table was added to close.
    const payment = requireModel("Payment");
    expect(payment.body).toMatch(/userId\s+String\?/);
    expect(
      payment.body,
      "Payment.user must be ON DELETE SetNull — Cascade would delete the receipt with the account",
    ).toMatch(/onDelete:\s*SetNull/);
  });

  it("records every Stripe webhook — idempotency, audit trail and dead-letter queue", () => {
    // Without it, a fulfilment that fails past Stripe's ~3-day retry window
    // leaves ONE console.error in a pm2 log with no rotation configured: a
    // student who paid and got nothing, and no way for anyone to find out.
    const event = requireModel("StripeEvent");
    for (const column of [
      "stripeEventId",
      "type",
      "payload",
      "receivedAt",
      "processedAt",
      "lastError",
    ]) {
      expect(event.columns).toContain(column);
    }
    // Stripe retries carry the SAME evt_ id — that is what makes it the key.
    expect(event.body).toMatch(/stripeEventId\s+String\s+@unique/);
    // processedAt NULL is the queue; it has to be scannable.
    expect(event.body).toMatch(/@@index\(\[processedAt, receivedAt\]\)/);
  });
});

describe("schema contract: one payment buys one of everything", () => {
  it("makes a duplicate fulfilment of one Stripe session impossible", () => {
    // THE FINDING. The webhook and the /checkout/return page fulfil the same
    // session within milliseconds BY DESIGN (checkout.ts:6-11), and the
    // check-then-insert at checkout.ts:239-255 runs in no transaction — so both
    // can read "not fulfilled yet" and both can insert. quota.ts:361 then
    // computes the tutor budget as TUTOR_PACK_QUESTION_ALLOWANCE *
    // active.length, so the second row hands out 600 tutor questions on one
    // EUR 12.99 sale, on the most expensive resource the product owns.
    //
    // The code called the duplicate "no security issue, only cosmetic".
    expect(
      requireModel("Entitlement").body,
      "Entitlement needs @@unique([provider, providerRef]) or one payment buys two packs",
    ).toMatch(/@@unique\(\[provider, providerRef\]\)/);
  });

  it("declares it as a compound unique the client can upsert on", () => {
    // Not decoration: the compound @@unique is what makes Prisma generate the
    // `provider_providerRef` where-unique input, which is what lets fulfilment
    // become a single atomic upsert instead of a check-then-insert with a race
    // in the middle. Without it in schema.prisma the payments lane cannot write
    // the fix at all, whatever the database says.
    const generated = path.resolve(
      __dirname,
      "../generated/prisma/models/Entitlement.ts",
    );
    if (!existsSync(generated)) return; // client not generated in this tree
    // `provider_providerRef` is the where-unique selector Prisma derives from
    // the compound @@unique. Its presence is what makes upsert/connect on the
    // pair expressible at all.
    expect(readFileSync(generated, "utf8")).toContain("provider_providerRef");
  });
});

describe("schema contract: a shared password can be taken back", () => {
  it("gives User a session epoch", () => {
    // Sessions are JWTs — 30-day idle, refreshed on every visit, no Session
    // model — so resetting a password did NOT sign out the friend who already
    // knew it. Bumping this integer invalidates every issued token.
    //
    // It is free: getSessionUser() (auth/session.ts:13-19) already does a
    // React-cached per-request DB read for `role`, and the epoch rides along in
    // that same SELECT. That is why it is a counter on User and not a table.
    const user = requireModel("User");
    expect(user.columns).toContain("sessionEpoch");
    expect(user.body).toMatch(/sessionEpoch\s+Int\s+@default\(0\)/);
  });
});

describe("schema contract: onboarding answers follow the student, not the browser", () => {
  it("stores examDate, dailyGoalMin and onboardedAt on User", () => {
    // These lived in ONE BROWSER'S localStorage (lib/onboarding/storage.ts
    // :19-21). Register on a phone, open on a laptop, and the exam date — the
    // strongest retention signal the product collects — was simply gone.
    // storage.ts's own header specifies exactly this migration.
    const user = requireModel("User");
    for (const column of ["examDate", "dailyGoalMin", "onboardedAt"]) {
      expect(user.columns).toContain(column);
    }
  });

  it("keeps all three nullable, and examDate at DAY precision", () => {
    const user = requireModel("User");
    // Nullable is not laziness — see the three-state encoding in schema.prisma:
    // onboardedAt NULL = never asked; set with examDate NULL = answered „Още
    // нямам дата". Collapsing them would make the flow re-ask forever.
    expect(user.body).toMatch(/examDate\s+DateTime\?/);
    expect(user.body).toMatch(/dailyGoalMin\s+Int\?/);
    expect(user.body).toMatch(/onboardedAt\s+DateTime\?/);
    // @db.Date for the same reason as ExamOutcomeReport.examOn: a day cannot
    // place a minor anywhere at any hour (ADR-004).
    expect(user.body).toMatch(/examDate\s+DateTime\?\s+@db\.Date/);
  });
});

describe("schema contract: the diligent student is not the slowest", () => {
  it("indexes QuestionAttempt by (userId, answeredAt)", () => {
    // THREE hot queries filter this table by user AND a time window, and none
    // could use the existing (userId, questionId) index:
    //   payments/store.ts:130      { userId, context, answeredAt: {gte, lt} }
    //   learning/store.ts:146      { userId, correct: true, answeredAt: {gte} }
    //   gamification/store.ts:128  { userId, answeredAt: {gte} }
    // So the free-tier quota check walked a student's ENTIRE history before
    // every single answer — ~4,800 rows by month four.
    expect(requireModel("QuestionAttempt").body).toMatch(
      /@@index\(\[userId, answeredAt\]\)/,
    );
  });

  it("indexes SimSession by (userId, startedAt)", () => {
    // listSessions sorts by startedAt with no index — the history screen sorted
    // the whole per-user set in memory on every load.
    expect(requireModel("SimSession").body).toMatch(
      /@@index\(\[userId, startedAt\]\)/,
    );
  });

  it("keeps a drive's verdict and stars OUT of the event blob", () => {
    // listSessions selected `events: true` for every session a student had
    // ever driven, on /simulator page load and again at the end of every
    // drive, to read two facts out of it. Each ViolationEvent in that payload
    // carries titleBg + explanationBg — ~430 bytes of Bulgarian prose that
    // already lives in the rule catalogue in code — so a premium student at
    // ~350 sessions pulled megabytes out of TOAST and JSON.parsed it in Node.
    // Same fix SimAttemptTrace already models with durationSec/sampleCount.
    const sim = requireModel("SimSession");
    for (const column of ["passed", "rubricStars"]) {
      expect(sim.columns).toContain(column);
    }
  });

  it("backfills those two columns instead of resetting every student's progress", () => {
    // The columns are new; the drives are not. Without a backfill every
    // historical session reads back as passed=false / rubricStars=null, and
    // both catalogues (lessons/progress.ts on `passed`, scenario/progress.ts on
    // `rubricStars`) would lock behind a student who had already earned their
    // way through them.
    const sql = migrations.find((m) =>
      /ALTER\s+TABLE\s+"SimSession"\s+ADD\s+COLUMN\s+"rubricStars"/i.test(m.sql),
    );
    expect(sql, "no migration adds SimSession.rubricStars").toBeDefined();
    const clean = stripSqlComments((sql as Migration).sql);
    const addAt = clean.search(/ADD\s+COLUMN\s+"rubricStars"/i);
    const backfillAt = clean.search(/UPDATE\s+"SimSession"/i);
    expect(backfillAt, "the columns are added and left empty").toBeGreaterThan(-1);
    expect(addAt).toBeLessThan(backfillAt);
    // And it reads the payload exactly as parseSimSessionEvents does: version
    // gate first, then a type check before any cast, so a foreign or corrupt
    // blob lands as NULL rather than aborting the whole migration.
    expect(clean).toMatch(/"events"\s*->>\s*'version'\s*\)?\s*=\s*'1'/i);
    expect(clean).toMatch(/jsonb_typeof\("events"\s*->\s*'passed'\)\s*=\s*'boolean'/i);
    expect(clean).toMatch(/jsonb_typeof\("events"\s*->\s*'rubricStars'\)\s*=\s*'number'/i);
  });
});

describe("schema contract: lessons are measurable and resumable", () => {
  it("records where a student got to in a lesson", () => {
    // A closed tab restarted a 20-minute lesson at beat 1. Worse: doc 84's gate
    // U3 ("MEASURE COMPLETION PER LESSON") had no rows to evaluate, so it was
    // not failing — it was unanswerable.
    const progress = requireModel("LessonProgress");
    for (const column of [
      "userId",
      "lessonId",
      "beatIndex",
      "startedAt",
      "completedAt",
    ]) {
      expect(progress.columns).toContain(column);
    }
    // A retake moves the bookmark; it does not open a second one.
    expect(progress.body).toMatch(/@@unique\(\[userId, lessonId\]\)/);
  });
});

describe("schema contract: the lockout survives our own deploys", () => {
  it("persists failed-login state instead of holding it in process memory", () => {
    // The counters lived in a per-process Map (security/rateLimit.ts:59,147)
    // and tools/deploy/knijka.cron redeploys EVERY FIVE MINUTES — so our own
    // release cadence wiped the exponential backoff that makes online password
    // guessing pointless. A failed login already pays ~300 ms of bcrypt, so a
    // ~1 ms query beside it is free.
    const lockout = requireModel("LoginLockout");
    for (const column of [
      "identifierHash",
      "failures",
      "lockedUntil",
      "forgetAt",
    ]) {
      expect(lockout.columns).toContain(column);
    }
  });

  it("is keyed by a DIGEST and has no foreign key to User", () => {
    const lockout = requireModel("LoginLockout");
    // The lockout must work for addresses that were never registered — a FK
    // would turn the login endpoint into an account-enumeration oracle, and
    // storing the address itself would make this a second, unerasable list of
    // every email anyone ever typed at the form (ADR-004: users are minors).
    expect(lockout.columns).toContain("identifierHash");
    expect(lockout.columns).not.toContain("email");
    expect(
      lockout.body,
      "LoginLockout must NOT relate to User — a lockout is needed for addresses that do not exist",
    ).not.toMatch(/@relation/);
  });
});

// ---------------------------------------------------------------------------
// 2. Migration hygiene — the half that keeps the schema TRUE
// ---------------------------------------------------------------------------

interface Migration {
  dir: string;
  sql: string;
}

const migrations: Migration[] = readdirSync(MIGRATIONS_DIR)
  .filter((d) => existsSync(path.join(MIGRATIONS_DIR, d, "migration.sql")))
  .sort()
  .map((dir) => ({
    dir,
    sql: readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"),
  }));

/** All migration SQL, comments removed, for statement-level scanning. */
const allSql = stripSqlComments(migrations.map((m) => m.sql).join("\n"));

describe("migration hygiene", () => {
  it("has a migration_lock.toml", () => {
    // Prisma writes this the first time IT generates a migration. Every
    // migration here was hand-written, so it never existed — and without it
    // `prisma migrate diff --from-migrations` fails outright with "Could not
    // determine the connector from the migrations directory". That is not a
    // cosmetic gap: it is the one command that would have caught schema drift,
    // and it could not run. (The local dev database is the proof: it has no
    // _prisma_migrations table at all — it was built with `db push` — and was
    // missing five tables that migrations do create.)
    const lock = path.join(MIGRATIONS_DIR, "migration_lock.toml");
    expect(
      existsSync(lock),
      "prisma/migrations/migration_lock.toml is required or the migration set cannot be diffed or replayed",
    ).toBe(true);
    expect(readFileSync(lock, "utf8")).toMatch(/provider\s*=\s*"postgresql"/);
  });

  it("is EXPAND-ONLY: no drops, no renames, no SET NOT NULL", () => {
    // A rollback restores CODE and never SCHEMA, and /api/health only runs
    // SELECT 1 — so a rolled-back deploy on a contracted schema reports itself
    // green over a product that cannot write. Forward-only migrations are the
    // only rollback story Prisma actually has.
    //
    // Comments are stripped first, deliberately: the migration that introduced
    // this rule also DESCRIBES it, and a rule you can satisfy by writing about
    // it is not a rule.
    const forbidden = [
      /\bDROP\s+TABLE\b/i,
      /\bDROP\s+COLUMN\b/i,
      /\bDROP\s+CONSTRAINT\b/i,
      /\bRENAME\b/i,
      /\bSET\s+NOT\s+NULL\b/i,
    ];
    const offenders: string[] = [];
    for (const { dir, sql } of migrations) {
      const clean = stripSqlComments(sql);
      for (const pattern of forbidden) {
        const hit = pattern.exec(clean);
        if (hit) offenders.push(`${dir}: ${hit[0]}`);
      }
    }
    expect(
      offenders,
      "Expand/contract is the rule for this database: new tables, nullable columns and new indexes only.",
    ).toEqual([]);
  });

  it("creates every table and column that schema.prisma declares", () => {
    // AUDIT FINDING 26, mechanised. `prisma generate` builds the client from
    // schema.prisma ALONE, so `tsc --noEmit` will happily typecheck a write to
    // a column that no migration has ever created. The failure then shows up
    // for the first time as a runtime error on the deployed box — on the money
    // path, if that is where the column was added.
    const missingTables: string[] = [];
    const missingColumns: string[] = [];

    for (const model of models) {
      const created = new RegExp(
        `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"${model.name}"`,
        "i",
      ).test(allSql);
      if (!created) {
        missingTables.push(model.name);
        continue;
      }
      // Everything any migration says about this table: the CREATE TABLE body
      // plus every ALTER TABLE touching it (that is where ADD COLUMN lives).
      const statements = [
        ...allSql.matchAll(
          new RegExp(
            `(?:CREATE\\s+TABLE[^;]*?"${model.name}"[^;]*;|ALTER\\s+TABLE\\s+"${model.name}"[^;]*;)`,
            "gis",
          ),
        ),
      ]
        .map((m) => m[0])
        .join("\n");

      for (const column of model.columns) {
        if (!new RegExp(`"${column}"`).test(statements)) {
          missingColumns.push(`${model.name}.${column}`);
        }
      }
    }

    expect(
      missingTables,
      "These models exist in schema.prisma and no migration creates them. The client would typecheck; the database would 42P01.",
    ).toEqual([]);
    expect(
      missingColumns,
      "These columns exist in schema.prisma and no migration creates them. The client would typecheck; the database would 42703.",
    ).toEqual([]);
  });

  it("de-duplicates Entitlement BEFORE constraining it", () => {
    // Order is the whole correctness of that step: a unique index cannot be
    // built over rows that already violate it, so a migration that creates the
    // index first simply fails on any real database that has ever taken the
    // double-fulfilment path. On an empty database both orders look identical,
    // which is exactly why this is asserted rather than eyeballed.
    const sql = migrations.find((m) =>
      /Entitlement_provider_providerRef_key/.test(m.sql),
    );
    expect(sql, "no migration creates the Entitlement unique index").toBeDefined();
    const clean = stripSqlComments((sql as Migration).sql);
    const deleteAt = clean.search(/DELETE\s+FROM\s+"Entitlement"/i);
    const indexAt = clean.search(/CREATE\s+UNIQUE\s+INDEX\s+"Entitlement_provider_providerRef_key"/i);
    expect(deleteAt, "the de-duplication step is missing").toBeGreaterThan(-1);
    expect(indexAt).toBeGreaterThan(-1);
    expect(
      deleteAt,
      "de-duplicate first, then constrain — otherwise the migration dies on any database that has taken a payment",
    ).toBeLessThan(indexAt);
  });

  it("guards the de-duplication so it can never revoke paid access", () => {
    // Every duplicate of one Stripe session must, by construction, carry the
    // same user and the same pack — both writers read them from the same
    // session metadata. If that is ever untrue the rows are not duplicates of
    // one purchase, and collapsing them would delete access somebody paid for.
    // The migration aborts instead.
    const sql = migrations.find((m) =>
      /Entitlement_provider_providerRef_key/.test(m.sql),
    );
    const clean = stripSqlComments((sql as Migration).sql);
    expect(clean).toMatch(/RAISE\s+EXCEPTION/i);
    expect(clean).toMatch(/COUNT\(DISTINCT\s+"userId"\)\s*>\s*1/i);
    expect(clean).toMatch(/COUNT\(DISTINCT\s+"pack"\)\s*>\s*1/i);
  });

  it("makes the Entitlement unique index PARTIAL, so promo grants stay repeatable", () => {
    // `provider = 'promo'` rows carry no reference. Only a real provider
    // receipt id is claimed unique.
    const sql = migrations.find((m) =>
      /Entitlement_provider_providerRef_key/.test(m.sql),
    );
    expect(stripSqlComments((sql as Migration).sql)).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+"Entitlement_provider_providerRef_key"[\s\S]*?WHERE\s+"providerRef"\s+IS\s+NOT\s+NULL/i,
    );
  });
});
