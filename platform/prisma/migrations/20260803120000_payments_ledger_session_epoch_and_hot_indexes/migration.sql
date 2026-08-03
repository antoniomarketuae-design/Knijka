-- Audit 2026-08-03 — the schema half of the money/session/measurement wave.
--
-- NINE changes, one transaction. Prisma runs each migration in its own
-- transaction, so this either lands whole or not at all — which matters here
-- because step 2 repairs data and then constrains it, and those two must never
-- be separable.
--
-- EXPAND ONLY. New tables, nullable columns, new indexes. No DROP, no RENAME,
-- no SET NOT NULL on an existing column, so every currently-deployed build
-- keeps working against a database that has been migrated. The reason is not
-- taste: a rollback restores CODE and never SCHEMA, and /api/health only runs
-- SELECT 1 — so a rolled-back deploy on a contracted schema would report
-- itself green while the product could not write. Forward-only is the only
-- rollback story Prisma actually has.
--
-- The one destructive act in this file is the DELETE in step 2, and it is
-- guarded: it refuses to run rather than remove access anybody paid for.

-- ---------------------------------------------------------------------------
-- 1. User: session revocation + the onboarding answers that lived in a browser
-- ---------------------------------------------------------------------------
-- sessionEpoch: sessions are JWTs (no Session table, 30-day idle, refreshed on
-- every visit), so a shared password could not be taken back — resetting it
-- left the friend who knew it signed in for another month. Bumping this
-- integer invalidates every issued token. NOT NULL DEFAULT 0 is safe on an
-- existing table: Postgres 11+ stores the default in the catalogue, so this is
-- a metadata-only rewrite regardless of row count.
--
-- examDate / dailyGoalMin / onboardedAt: these were localStorage keys
-- (lib/onboarding/storage.ts:19-21), so registering on a phone and opening on
-- a laptop lost them — including the exam date, the strongest retention signal
-- the product collects. storage.ts's own header specifies this migration.
-- examDate is DATE, not a timestamp: day precision is all any feature needs
-- and it cannot place a minor anywhere at any hour (ADR-004).
ALTER TABLE "User" ADD COLUMN     "dailyGoalMin" INTEGER,
ADD COLUMN     "examDate" DATE,
ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "sessionEpoch" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. Entitlement: stop one payment from buying two of everything
-- ---------------------------------------------------------------------------
-- The webhook and the /checkout/return page fulfil the SAME Stripe session
-- within milliseconds, by design (checkout.ts:6-11), and the check-then-insert
-- at checkout.ts:239-255 runs in no transaction — so both can read "not
-- fulfilled yet" and both can insert. quota.ts:361 then computes the tutor
-- budget as ALLOWANCE * active.length, so the duplicate row hands out 600
-- tutor questions on one EUR 12.99 sale, on the most expensive resource the
-- product owns. The code called this "cosmetic".
--
-- A unique index cannot be created over rows that already violate it, so the
-- duplicates must go first — and deleting an Entitlement is deleting somebody's
-- access, which is why the delete is fenced.

-- 2a. THE FENCE. Every duplicate of one Stripe session must, by construction,
-- carry the same user and the same pack: both writers read them from the same
-- session metadata. If that is ever untrue, the rows are not duplicates of one
-- purchase and collapsing them would revoke access somebody paid for — so
-- abort the whole migration and let a human look. Costs one aggregate scan of
-- a table with one row per sale.
DO $$
DECLARE
  conflicting INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflicting FROM (
    SELECT "provider", "providerRef"
    FROM "Entitlement"
    WHERE "providerRef" IS NOT NULL
    GROUP BY "provider", "providerRef"
    HAVING COUNT(DISTINCT "userId") > 1 OR COUNT(DISTINCT "pack") > 1
  ) AS bad;

  IF conflicting > 0 THEN
    RAISE EXCEPTION
      'Refusing to de-duplicate Entitlement: % (provider, providerRef) group(s) span more than one user or pack. These are not duplicates of a single purchase — collapsing them would revoke paid access. Inspect them by hand before re-running this migration.',
      conflicting;
  END IF;
END $$;

-- 2b. Keep the OLDEST row of each pair and delete the rest. Oldest = the one
-- that actually granted the access the student has been using; `id` breaks the
-- tie when two racing inserts landed in the same millisecond, so the choice is
-- deterministic and a re-run is a no-op.
DELETE FROM "Entitlement" e
USING (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "provider", "providerRef"
           ORDER BY "purchasedAt" ASC, "id" ASC
         ) AS rn
  FROM "Entitlement"
  WHERE "providerRef" IS NOT NULL
) ranked
WHERE e."id" = ranked."id" AND ranked.rn > 1;

-- 2c. PARTIAL on purpose: `provider = 'promo'` grants carry no reference and
-- must stay freely repeatable, so only real provider receipt ids are claimed
-- unique. Postgres treats NULLs as distinct anyway, so this matches the
-- semantics of the plain @@unique in schema.prisma while not indexing the rows
-- it would never constrain. The name is the one Prisma derives from
-- @@unique([provider, providerRef]) — keep it, or the next `migrate dev` will
-- try to create a second index alongside this one.
CREATE UNIQUE INDEX "Entitlement_provider_providerRef_key"
  ON "Entitlement"("provider", "providerRef")
  WHERE "providerRef" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Payment — the product's first record of money
-- ---------------------------------------------------------------------------
-- An Entitlement is a grant, not a receipt: no amount, no currency, no
-- PaymentIntent, no livemode. "Did this person pay, when, how much, and was it
-- real money" was unanswerable from our own database.
--
-- userId is nullable with ON DELETE SET NULL: Art. 17 erasure must not destroy
-- the books (Bulgarian accounting law), but it must not leave a live
-- identifier behind either. SET NULL does both in the same DELETE.
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "userId" TEXT,
    "pack" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "rawEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 4. StripeEvent — idempotency key, audit trail and dead-letter queue at once
-- ---------------------------------------------------------------------------
-- Stripe retries carry the same evt_ id, which is what makes this the real
-- idempotency key (the session id cannot key refunds or disputes). processedAt
-- NULL + lastError set is a fulfilment that failed: before this table, one
-- that failed past Stripe's ~3-day retry window left a single console.error in
-- a pm2 log with no rotation configured, i.e. a student who paid and got
-- nothing that nobody could discover.
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 5. LessonProgress — the denominator gate U3 asks for
-- ---------------------------------------------------------------------------
-- Nothing recorded that a lesson was started, paused or finished, so a closed
-- tab restarted a 20-minute lesson at beat 1, and doc 84's own gate U3
-- ("MEASURE COMPLETION PER LESSON") had no rows to evaluate — it was not
-- failing, it was unanswerable. One row per (student, lesson), updated in
-- place: a bookmark, not a log.
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "beatIndex" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 6. LoginLockout — survive our own five-minute redeploys
-- ---------------------------------------------------------------------------
-- The failure counters live in a per-process Map (security/rateLimit.ts:59,147)
-- and tools/deploy/knijka.cron redeploys EVERY FIVE MINUTES, so the exponential
-- backoff that makes online guessing pointless was wiped by our own release
-- cadence. A failed login already pays ~300 ms of bcrypt, so a ~1 ms query
-- beside it is free; the per-IP budgets stay in the Map, where the round trip
-- would actually show.
--
-- Keyed by sha256(email) and deliberately WITHOUT a foreign key to "User": a
-- lockout must be creatable for an address that was never registered, or the
-- endpoint becomes an account-enumeration oracle. The digest also keeps this
-- from becoming an unerasable list of every address typed at the login form.
CREATE TABLE "LoginLockout" (
    "rule" TEXT NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "forgetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginLockout_pkey" PRIMARY KEY ("rule","identifierHash")
);

-- ---------------------------------------------------------------------------
-- 7. Indexes for the new tables
-- ---------------------------------------------------------------------------
-- stripeSessionId is the idempotency key of a purchase. stripePaymentIntentId
-- is indexed but NOT unique: `no_payment_required` and not-yet-paid sessions
-- legitimately have none, and refund/dispute webhooks arrive keyed by it.
CREATE UNIQUE INDEX "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");

CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

CREATE INDEX "Payment_stripePaymentIntentId_idx" ON "Payment"("stripePaymentIntentId");

CREATE UNIQUE INDEX "StripeEvent_stripeEventId_key" ON "StripeEvent"("stripeEventId");

-- The dead-letter scan: unprocessed, oldest first. Postgres orders NULLs last
-- ascending, so the unprocessed rows are the head of this index — exactly the
-- set the sweep wants.
CREATE INDEX "StripeEvent_processedAt_receivedAt_idx" ON "StripeEvent"("processedAt", "receivedAt");

-- „Продължи оттам" — the resume card.
CREATE INDEX "LessonProgress_userId_updatedAt_idx" ON "LessonProgress"("userId", "updatedAt");

-- A retake moves the bookmark; it does not open a second one.
CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");

-- Housekeeping sweep. Without it the table only grows, and it is an attacker
-- rotating addresses who fills it.
CREATE INDEX "LoginLockout_forgetAt_idx" ON "LoginLockout"("forgetAt");

-- ---------------------------------------------------------------------------
-- 8. QuestionAttempt — stop punishing the students who practise most
-- ---------------------------------------------------------------------------
-- Three hot queries filter by user AND a time window, and none could use the
-- existing (userId, questionId) index:
--   payments/store.ts:130      { userId, context, answeredAt: {gte, lt} }
--   learning/store.ts:146      { userId, correct: true, answeredAt: {gte} }
--   gamification/store.ts:128  { userId, answeredAt: {gte} }
-- So the free-tier quota check walked a student's ENTIRE history before every
-- single answer — ~4,800 rows by month four, and worst for the most diligent.
-- (userId, answeredAt) and not (userId, context, answeredAt): the three
-- disagree on the second predicate but all three agree on the range, so this
-- is the one composite that serves all of them.
CREATE INDEX "QuestionAttempt_userId_answeredAt_idx" ON "QuestionAttempt"("userId", "answeredAt");

-- ---------------------------------------------------------------------------
-- 9. SimSession — listSessions sorted by startedAt with no index
-- ---------------------------------------------------------------------------
-- Same shape as ExamAttempt's existing index, for the same screen on the other
-- half of the product.
CREATE INDEX "SimSession_userId_startedAt_idx" ON "SimSession"("userId", "startedAt");

-- ---------------------------------------------------------------------------
-- 10. Foreign keys
-- ---------------------------------------------------------------------------
-- SET NULL, not CASCADE: erasure pseudonymises the receipt, it does not shred
-- it. See the Payment table comment.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CASCADE, like every other per-student table: a bookmark has no meaning
-- without the student.
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
