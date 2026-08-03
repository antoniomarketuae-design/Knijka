# 91 — Launch blockers: every finding, by name

**Written 2026-08-03 by the verification pass over seven parallel lanes.**
**Re-gated 2026-08-03 21:26–21:40 after the close wave, on the state that gets committed.**
Nothing here is a percentage. Every row is a named thing with a status you can check.

Five statuses, and only five:

| Status | Means |
| --- | --- |
| **FIXED** | The code is in the working tree, and a named test fails without it. |
| **FOUNDER-MUST-DO** | Software cannot do it. §4 has the exact command or the exact text to paste. |
| **FOUNDER-DECISION** | Engineering has been told not to build it. §4A records it anyway, because the data is accumulating while the decision is open. |
| **SEQUENCED** | Real, not done, and blocked behind a wave that owns the file. §5 says which. |
| **OPEN — BLOCKS COMMIT** | Found by this gate, reproduced, and not fixed. §0 is the whole list, and it has one row. |

---

## 0. The one thing that must be decided before this tree is committed

**X1 — `listSessions`' `take: 200` silently re-locks a catalogue the student already
earned.** Reproduced by this gate, not inherited from a report. Full detail and the
one-line fix are in §6/X1; the short version is in the table below, and it is here at
the top because it is the only finding on this page that is both **new** and **not
fixed**.

| | |
| --- | --- |
| **What** | `SESSION_HISTORY_WINDOW = 200` in `platform/src/modules/sim/lessons/store.ts:179`, applied at `:231` |
| **Measured** | Over 260 newest scenario drives + 8 older curriculum passes: **full history → 8 lessons unlocked, 8 passed, exam unlocked**. **Newest-200 → 1 lesson unlocked (`l0-free-drive` only), 0 passed, exam LOCKED.** |
| **Why no test caught it** | Nothing pins `computeProgression` against a windowed list. The six tests Lane D added assert the *statement shape*, which is correct. |
| **Fix** | One line: drop the `take`, keep the `select` narrowing. The megabytes were the `events` blob, not the row count — 200 narrow rows vs N narrow rows is a rounding error next to N TOAST reads. |
| **If the cap must stay** | The two unlock gates need their own bounded query that cannot lose a pass (`groupBy lessonId` with `_max` on `passed`/`rubricStars`). |

Either way it needs the probe below turned into a committed test.

---

## 1. The gate, with exact numbers

Run on this box, 2026-08-03 21:26–21:40, on the working tree as the close wave left it.
Every number below is from a run made for this document, not copied from a lane report.

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `cd platform && npx tsc --noEmit` | **exit 0**, zero output |
| Unit + integration | `npx vitest run --maxWorkers=4` | **701 files: 698 passed, 2 failed, 1 skipped** · **10,720 tests: 10,548 passed, 2 failed, 170 skipped** · 178.79 s · exit 1 |
| Tools (node:test) | `npm run test:tools` | **150 tests, 150 pass, 0 fail**, exit 0, 117.3 s |
| Content contract | `npm run validate:content` | **exit 0** — *"OK — all structural and referential checks passed"* |
| Production build | `KNIJKA_DIST_DIR=.next-leadgate npm run build` | **exit 0** — *"Compiled successfully in 15.3s"*, all routes emitted, 2 pre-existing NFT warnings |
| Sim harness | `node scripts/sim-harness.mjs` | **13 tests passed**, exit 0 |
| Migration safety | `node ../tools/deploy/check-migrations.mjs --all` | **11 migrations checked, all fine**, exit 0 |
| Migrations → real DB | `prisma migrate deploy`, PostgreSQL 17.9 on `:5432` | **exit 0**, 11 applied, no pending |
| Schema drift | `prisma migrate diff --from-config-datasource --to-schema --exit-code` | **exit 0 — "No difference detected"** |

No `Failed to start forks worker` appeared in any run (`grep -c` = 0), so none of this is
the 16 GB memory-pressure ghost.

**The typecheck number changed since the first pass and that matters.** The lead review
of the payments three-lane merge measured `tsc` at **exit 2** —
`receipt-and-race.test.ts:153` read `.entitlementId` off a union that had gained
`receipt-without-grant`. It is fixed: the narrowing is now positive
(`a.status === "created" || a.status === "already-fulfilled"`) rather than
`!== "skipped"`, so a future variant cannot slip through it either.

### The 2 failing tests — named, cause proven, deliberately left red

Both are the **same content shortage**, and `content/` has **zero working-tree
modifications** (`git status --porcelain -- content/` is empty), so this is committed
state, not an in-flight edit by anyone. Both were re-run **in isolation** to rule out a
cross-file or memory-pressure artefact; both fail identically alone.

1. `src/modules/exam/__tests__/content-bank.test.ts` → *"has no dark, threadbare or
   under-represented topic"*
   → `REVIEW_DEBT: ptp-i-parva-pomosht: only 31/64 (48%) approved`.
   The other **15 topics all pass** — the audit table prints every one.
2. `src/modules/lesson/__tests__/compose.test.ts` → *"gives every lesson at least one
   quiz beat — the classroom always checks"* → `[ 'l-accidents-first-aid' ]`, the **same
   topic** starved of approved questions.

Counted directly out of the JSON rather than trusted: `ptp-i-parva-pomosht.json` holds
**64 questions, 31 approved, 33 needs-review**, and of those 33, **29 are medical** —
`c-first-aid-priorities` 9, `c-cpr-basics` 6, `c-bleeding-control` 7,
`c-victim-handling` 7 — pending the founder's medical ruling. The remaining 4 are legal,
not medical (`c-hit-and-run` 2, `c-accident-definition` 1, `c-when-call-police` 1).

**These stay red.** The topic really has left the eligible pool, so the classroom really
cannot build a first-aid quiz beat; both tests are telling the truth. Lowering a
threshold, approving content or excluding the topic to make them green is the exact
failure this programme exists to stop. They go green when the medical ruling lands.

**The gate is therefore RED for one reason only, and it is a content-approval backlog
on first aid — not a defect in any of the rows below.**

### A third red was reported and is gone

The close wave's fourth lane reported `src/modules/lesson/__tests__/quiz.test.ts:128`
red — it pinned the client-safe option shape as exactly `["id","textBg"]` while another
lane was adding `media` to it. Re-run in isolation for this gate: **passes**. The lane
that widened the shape also updated the assertion and stated the intent directly
(`expect(option).not.toHaveProperty("correct")`), so the set cannot be widened again
silently. No third red exists on this tree.

### The 1 skipped FILE is the money test, and that is a gate finding

`src/modules/payments/__tests__/poison-pill.postgres.test.ts` — **5 tests, 5 skipped**,
with the reason printed loudly to stderr:

```
[poison-pill.postgres.test.ts] SKIPPED — neither PAYMENTS_TEST_DATABASE_URL
  nor DATABASE_URL is set.
```

The skip is correct behaviour and correctly loud, but the cause is worth naming: **vitest
does not load `platform/.env`** (Next does — the build log says `Environments: .env`).
So a developer running the documented `npx vitest run` locally never executes the only
tests that can reproduce the poison pill. CI does — it sets `DATABASE_URL` and the file
**throws** rather than skipping when the database is missing there. See §2.5 for what
happens when you actually run it.

### One thing the build does that must be undone every time

`npm run build` **rewrites `platform/tsconfig.json`**, adding
`.next-<dir>/types/**/*.ts` globs. Confirmed again on this run: the file's md5 went
`6c4e36a3…` → `657a775b…`, and `include` gained `.next-leadgate/types/**/*.ts` and
`.next-leadgate/dev/types/**/*.ts`. That is exactly the failure `AGENTS.md` warns about
(thirty-eight such globs once accumulated). Reverted with `git checkout --
platform/tsconfig.json` (md5 back to `6c4e36a3…`, `git diff` empty, 0 phantom globs,
`exclude` still contains `.next-*`), `.next-leadgate` deleted, and
`src/lib/tsconfigHygiene.test.ts` re-run green (4/4). Anyone who builds locally must do
the same.

---

## 2. The money path, traced end to end, with file:line

This is the part that matters, so it gets answered directly rather than summarised.
Everything in this section was proved against a **real PostgreSQL 17.9**, not a fake
store — I created an empty database, applied all 11 migrations, and drove the real
Prisma store through `fulfillCheckout`.

### 2.1 Can a payment be taken without a `Payment` row existing?

**One path, and it is loud rather than silent.**

The grant and the receipt are written in a single transaction —
`platform/src/modules/payments/store.ts:363-367`:

```ts
const entitlement = await db.$transaction(async (tx) => {
  const created = await tx.entitlement.create({ data: input.entitlement });
  await tx.payment.create({ data: input.payment });
  return created;
});
```

So a grant without a receipt is impossible by construction. The remaining gap is
*upstream* of that call: `platform/src/modules/payments/checkout.ts:306-311` returns
`{status:"skipped", reason:"missing-metadata"}` **before** `recordPurchase`, for a paid
session whose `metadata.userId` / `metadata.pack` is missing or corrupt. The card was
charged and no `Payment` row is written.

That case is no longer silent: `platform/src/app/api/stripe/webhook/route.ts:174-184`
answers **500**, so Stripe retries for ~3 days, and the full event payload is already
persisted in `StripeEvent` (written at `route.ts:114-129`, *before* any fulfilment
work). The evidence survives even though the receipt does not.

The other way to take money with no `Payment` row is for the webhook never to be
delivered at all — wrong secret, wrong mode, endpoint not subscribed. Every one of those
is now a hard gate before a buy button renders (§2.5), and
`npm run payments:reconcile` is the only tool that can see it after the fact.

**Real-DB proof:** `never leaves a grant without a receipt (and vice versa)` — after one
fulfilment, `Entitlement` and `Payment` both present, `amountCents=1299`,
`currency=eur`, `livemode=true`.

### 2.2 Can two concurrent fulfils of one session still produce two Entitlements?

**No. Proved on a real database, not on a fake.**

The unique index exists and is **partial**, so promo grants with a NULL `providerRef`
stay repeatable:

```
Entitlement_provider_providerRef_key
  UNIQUE ON "Entitlement" (provider, "providerRef") WHERE ("providerRef" IS NOT NULL)
```

Driving the **real Prisma store** against real Postgres:

| Case | Result |
| --- | --- |
| Two simultaneous `fulfillCheckout` of one session (`Promise.all`) | statuses `created, already-fulfilled` — **1 Entitlement, 1 Payment** |
| Five-way pile-up (Stripe retrying while the buyer reloads) | `created, already-fulfilled ×4` — **1 Entitlement, 1 Payment** |
| Two different sessions, same user, concurrently | both `created` — a repurchase is still allowed |
| Two promo grants, `providerRef` NULL, concurrently | both inserted — the partial index does its job |

`store.ts:369-382` catches `P2002`, reads back the winner and reports the loser as
already-fulfilled; a `P2002` with **no** entitlement to show for it is rethrown rather
than swallowed, so a caller answers 500 instead of reporting a phantom delivery.

### 2.3 Does a refund now revoke access?

**Yes.** `charge.refunded` and `charge.dispute.created` are handled at
`route.ts:206-247`. Refunds are keyed by PaymentIntent and entitlements by Checkout
Session, so the `Payment` row is the only thing that joins them —
`checkout.ts:362-378` resolves intent → receipt → `providerRef` → `expiresAt = now`.
Access is **ended, never deleted**. A **partial** refund deliberately leaves access
alone (`route.ts:210-216`) — it is a goodwill gesture, not an undo.

**Real-DB proof:** `REVOKE: {"status":"revoked","sessionId":"cs_refund_…","revoked":1}`,
and the entitlement's `expiresAt` moved from four months out to now.

### 2.4 Is Stripe still told 200 for work that did not happen?

Every remaining 200-with-no-work is deliberate and correct:

| Path | Code | Why 200 is right |
| --- | --- | --- |
| `not-paid` | `route.ts:186-192` | The money has not moved. `async_payment_succeeded` brings us back. |
| Partial refund | `route.ts:210-216` | Access is meant to survive a goodwill refund. |
| Refund for a PaymentIntent with no receipt | `route.ts:231-236` | Grant and receipt are written in one transaction, so no receipt ⇒ nothing was granted ⇒ nothing to take back. |
| Event types we do not handle | falls through to `route.ts:249-250` | Deliberately ignored. |

The one that used to lie — `missing-metadata` — is now a 500 (§2.1).
The mode mismatches are 400 (test event at a live deployment: retrying would redeliver
the same fake event forever) and 503 (live event at a deployment declared test: Stripe
retries a 503 for ~3 days, which is time to fix `STRIPE_MODE` and still land the sale).

### 2.5 The poison-pill replay — FIXED, and it was bigger than reported

**Status: FIXED. Found by the first pass, closed by the close wave, and the fix
independently re-proved by this gate against a real PostgreSQL 17.9.**

`Entitlement` is **deleted** by an admin revoke (`src/modules/admin/store.ts`,
`deleteMany`) and by GDPR erasure, while the `Payment` row deliberately survives
(`onDelete: SetNull`). If Stripe then replays that session — a webhook redelivery,
`async_payment_succeeded` after `completed`, or the buyer reloading `/checkout/return` —
`recordPurchase`'s transaction fails and rolls back, the catch finds no entitlement to
read back, **and it rethrew**. The webhook then 500s on every Stripe retry for ~3 days,
triggered by an ordinary support action.

#### The correction that matters: the two causes throw DIFFERENT codes

The fix proposed at the bottom of the first pass was *"look for the Payment by
`stripeSessionId` when no entitlement is found"* — inside the existing `P2002` branch.
**That would have closed only half the outage**, and this gate proved it rather than
taking the close wave's word for it. Both error strings below are copied out of a run
against real Postgres:

| Cause | What fails first | Prisma code | Verbatim |
| --- | --- | --- | --- |
| **1 — support revoked the access** | `tx.payment.create()` — the entitlement inserts fine, the receipt collides | **P2002** | `Unique constraint failed on the fields: ("stripeSessionId")` |
| **2 — Art. 17 erasure** | `tx.entitlement.create()` — the User row is gone, so the *first* INSERT dies and the payment INSERT is never reached | **P2003** | `Foreign key constraint violated on the constraint: Entitlement_userId_fkey` |

There is no `P2002` anywhere in the erasure path. A catch that matched only unique
violations would still have 500ed for three days after every erasure.

#### Proved three ways, on `postgres://…@localhost:5432/knijka_poison_pill` (PG 17.9)

| Code under test | Result |
| --- | --- |
| **The fix as committed** | `Test Files 1 passed` · **`Tests 5 passed`** |
| **Pre-fix catch restored** (`if (!duplicate) throw err;`, no receipt lookup) | **`3 failed \| 2 passed`** — *CAUSE 1*, *CAUSE 2*, and *"holds under FIVE SIMULTANEOUS replays"* |
| **The first pass's proposed half-fix** (receipt lookup, but `P2002` only) | **`1 failed \| 4 passed`** — *CAUSE 2* still throws |

`src/modules/payments/store.ts` was restored from a byte-exact backup afterwards
(md5 `48327d2aadafe4a2c868fbd29505ca15`, verified before and after).

#### What the code does now

`recordPurchase`'s catch matches **both** codes (`isUniqueViolation` **or**
`isMissingReferenceViolation`), and in both cases asks the **receipt** — the row
deliberately built to outlive the grant — whether this session's money is already on
file, by `stripeSessionId` rather than by `(provider, providerRef)`, because the grant is
what went missing. If the receipt exists it returns a new
`{ status: "receipt-without-grant", stripeSessionId, paymentId }`, which carries **no
`entitlementId`** — deliberately, so a caller that wants to claim access does not
compile. The webhook logs one line and answers **200**, so Stripe stops retrying and the
event leaves the dead-letter queue.

A purchase with **neither** grant nor receipt — a session whose metadata names an account
that never existed — still rethrows, still 500s, still keeps the event in the queue.
The fix bought a quiet retry storm, not silence about lost money.

#### The upstream root cause, which is NOT fixed and is not the payments lane's

`src/modules/admin/store.ts`'s `revokeEntitlement` **DELETEs** the Entitlement row, while
payments' own revoke path (`expireEntitlementsByProviderRef`) sets `expiresAt = now` and
documents why — *"the books must still show what happened"*. Two revoke paths, two
different semantics, and the DELETE is what splits grant from receipt in cause 1.
**Recommendation: admin should adopt `expiresAt`.** The erasure cascade in cause 2
genuinely deletes and is not optional, so the fix above is required either way.

---

## 3. The rows — every finding, by lane

**86 named rows across eight lanes** — A 15, B 15, C 5, D 7, E 9, F 11, G 9, H 15 — plus
**9 SEQUENCED** in §5 and **3 FOUNDER-DECISION** in §4A. 98 rows in total.

The wave was briefed as **39 findings**. The number went up, twice, and both increases
are honest rather than padding:

1. The seven lanes split several briefed findings into separate rows because they had
   separate fixes and separate tests (the schema lane alone reports ten) — 39 → 51.
2. The close wave then fixed things this document had itself recorded as OPEN or
   SEQUENCED, and found new ones underneath them — the poison pill turned out to have
   **two** causes with different error codes, the sign-media defect turned out to be the
   same one-line DTO mistake written twice, and the sim-evidence read turned out to need
   a `jsonb_typeof` guard as much as a projection — 51 → 86.

No row is omitted, none is merged to make the count tidy, and no row is marked FIXED
without a named test that was **observed failing** without it.

Status roll-up across all 98:

| Status | Count | Where |
| --- | --- | --- |
| **FIXED** | 86 | §3, all eight lanes. In §5, S2/S3/S4/S5/S8 are now closed and point at their H rows |
| **FOUNDER-MUST-DO** | 18 | §4.1 – §4.18. S1 was promoted here as §4.17 — it is a medical ruling, not a scheduling problem |
| **FOUNDER-DECISION** | 3 | §4A R1–R3. S6/S7/S9 are the same three, folded in |
| **SEQUENCED, still waiting on another wave** | 0 | every S row is now either closed, promoted to §4, or folded into §4A |
| **OPEN — BLOCKS COMMIT** | 1 | §0 / §6 X1 |

### Lane A — Schema and migrations (`platform/prisma/**`)

| # | Finding | Status | Test that fails without it |
| --- | --- | --- | --- |
| A1 | `Payment` table — the product's first record of money (`stripeSessionId @unique`, intent, amount, currency, livemode, `rawEventId`) | FIXED | `prismaSchemaContract.test.ts` — *"has a Payment table — an Entitlement is a grant, never a receipt"* |
| A2 | `Payment.userId` nullable + `onDelete: SetNull` — Art. 17 erasure pseudonymises the receipt, never shreds it | FIXED | *"keeps the receipt when the buyer is erased, but scrubs the link"*; real DB: after `DELETE FROM "User"`, `userId` NULL, `amountCents` 1299 intact |
| A3 | `@@unique([provider, providerRef])` on `Entitlement`, created **partial** (`WHERE providerRef IS NOT NULL`) | FIXED | *"makes a duplicate fulfilment of one Stripe session impossible"* + real-DB race proof (§2.2) |
| A4 | De-duplicate existing rows **before** constraining, oldest-per-pair, `id` breaking the same-ms tie | FIXED | *"de-duplicates Entitlement BEFORE constraining it"* |
| A5 | A `DO` block that RAISEs and rolls the migration back if any `(provider, providerRef)` group spans more than one user or pack | FIXED | *"guards the de-duplication so it can never revoke paid access"* (migration.sql:66-80) |
| A6 | `StripeEvent` table + `@@index([processedAt, receivedAt])` for the dead-letter scan | FIXED | *"records every Stripe webhook — idempotency, audit trail and dead-letter queue"* |
| A7 | `User.sessionEpoch Int @default(0)` — the revocation counter | FIXED | *"gives User a session epoch"*; real DB: `integer, NOT NULL, default 0` |
| A8 | `User.examDate @db.Date`, `dailyGoalMin`, `onboardedAt` — onboarding answers off one browser's localStorage | FIXED (schema only — see S5) | *"keeps all three nullable, and examDate at DAY precision"*; real DB: `examDate` is `date` |
| A9 | `@@index([userId, answeredAt])` on `QuestionAttempt` — the one index all three hot queries can use | FIXED | *"indexes QuestionAttempt by (userId, answeredAt)"* |
| A10 | `@@index([userId, startedAt])` on `SimSession` | FIXED | *"indexes SimSession by (userId, startedAt)"* |
| A11 | `LessonProgress` table (`@@unique([userId, lessonId])`, `@@index([userId, updatedAt])`) | FIXED | *"records where a student got to in a lesson"*; real DB: FK `delete_rule=CASCADE` |
| A12 | `LoginLockout` keyed by `sha256(email)`, compound `@@id([rule, identifierHash])`, **no FK to User** (a FK would make login an account-enumeration oracle) | FIXED | *"is keyed by a DIGEST and has no foreign key to User"* |
| A13 | `prisma/migrations/migration_lock.toml` had **never existed**, so `prisma migrate diff --from-migrations` could not run at all — which is why nobody noticed the local dev DB was a `db push` artifact | FIXED | *"has a migration_lock.toml"* |
| A14 | Mechanical fence: **EXPAND-ONLY** — no `DROP TABLE` / `DROP COLUMN` / `DROP CONSTRAINT` / `RENAME` / `SET NOT NULL` in any migration, with SQL comments stripped first | FIXED | *"is EXPAND-ONLY: no drops, no renames, no SET NOT NULL"* |
| A15 | Mechanical fence: every model and scalar column in `schema.prisma` must be created by some migration (audit finding 26) | FIXED | *"creates every table and column that schema.prisma declares"* — proved to catch its own failure mode by deleting the migration and watching it name the four missing tables |

**Independently re-proved this pass:** all 11 migrations applied to a genuinely empty
PostgreSQL 17.9 (exit 0, 20 tables), and `migrate diff --exit-code` against the applied
database reports **"No difference detected"**. The hand-written partial index does not
read as drift.

### Lane B — The money path (`platform/src/modules/payments/**`)

| # | Finding | Status | Test that fails without it |
| --- | --- | --- | --- |
| B1 | Write the receipt in the SAME transaction as the grant; record Stripe's `amount_total` / `currency` / `payment_intent` / `livemode` verbatim | FIXED | `receipt-and-race.test.ts` — *"records the money exactly as Stripe reported it"*, *"NEVER lets a grant exist without its receipt"* |
| B2 | A 100 %-promo session records **0**, not the catalogue price | FIXED | *"keeps a 100 %-promo session honest: amount 0, not the catalogue price"* |
| B3 | An expanded `payment_intent` object is normalised to its id | FIXED | *"accepts an EXPANDED payment_intent object, not only the id string"* |
| B4 | An unstated `livemode` is booked against the deployment's **declared** mode, never silently as test | FIXED | *"books an unstated livemode against the DECLARED mode"* |
| B5 | Idempotency is the database's job: the read-then-insert is gone, `P2002` is caught structurally, a `P2002` with no entitlement is rethrown | FIXED | *"recognises P2002 and nothing else"*, *"rethrows a non-unique failure — a dead database must not read as delivered"* |
| B6 | The false *"no security issue, only cosmetic"* comment that stopped anyone investigating is deleted and replaced with why it was wrong (`checkout.ts:19-41`) | FIXED | source comment; the behaviour it excused is covered by B5 |
| B7 | The CONCURRENT case is tested — `Promise.all`, not the sequential retry that passed while the race shipped | FIXED | *"two simultaneous deliveries grant exactly ONE entitlement"*, *"survives a five-way pile-up"*, *"the fake store is itself atomic — otherwise the tests above prove nothing"* — **and re-proved this pass on real Postgres** |
| B8 | Tutor allowance counts **distinct packs**, not entitlement rows (`quota.ts:388`) | FIXED | `tutor-allowance.test.ts` — *"counts DISTINCT PACKS, not rows"*; real DB: two rows / one pack → `limit: 300` |
| B9 | Stop acknowledging a failed fulfilment as delivered — `missing-metadata` is a 500, `not-paid` stays 200 | FIXED | `webhook/route.test.ts` — missing-metadata asserts 500, not-paid asserts 200 |
| B10 | Persist every signature-verified event to `StripeEvent` **before** fulfilment; 500 if even the recording fails | FIXED | `route.test.ts` — the row is written before fulfilment; a recording failure returns 500 and does not fulfil |
| B11 | Refunds and disputes take access back (§2.3) | FIXED | `refunds.test.ts` — full refund revokes, partial does not, dispute revokes, unknown intent reports `unknown-payment` |
| B12 | Reject test/live mode mismatch; `STRIPE_MODE` defaults to **test**; 400 vs 503 asymmetry | FIXED | `mode-and-config.test.ts`; `route.test.ts` asserts the asymmetry |
| B13 | `isStripeConfigured()` fails closed without `STRIPE_WEBHOOK_SECRET` — a secret key alone must not be enough to sell | FIXED | `mode-and-config.test.ts` — false with a key but no webhook secret |
| B14 | `customer_email` on BOTH session creators, so the receipt reaches the account that can log in | FIXED | `customer-email.test.ts` — present on hosted and embedded; a store throw still yields a sellable session |
| B15 | `npm run payments:reconcile` — the only thing that can say whether sales have ALREADY been lost. Read-only, silent when clean, exit 0/1/2 | FIXED | `src/lib/ops/paymentsReconcile.test.ts`; script + core verified present, `package.json:15` |

### Lane C — Checkout surface, mail, receipts

| # | Finding | Status | Test that fails without it |
| --- | --- | --- | --- |
| C1 | The blank 560 px card: `/api/checkout/embedded` no longer throws into a mute — 409 `CONSENT_REQUIRED`, 502 `CHECKOUT_UNAVAILABLE`, every exit carries a code, the client request cannot throw | FIXED | `embedded/route.test.ts` — *"409s CONSENT_REQUIRED when the tick aged out"*, *"502s with a renderable code when Stripe itself fails"*, *"labels EVERY failure with a code"* |
| C2 | A 409 puts the consent checkboxes back on screen and un-ticks them; `checkoutStep(state, consentExpired)` because expiry cannot be derived from `useActionState` | FIXED | `checkout-never-fails-mute.test.tsx` — *"shows the payment form only while the consent is BOTH recorded and unexpired"* |
| C3 | The product refuses to sell what it cannot give back: `mailDeliveryGaps()` gates `isStripeConfigured()` the same way `legalIdentityGaps()` does; `/api/health` reports `checks.mail` but deliberately does **not** fail readiness on it | FIXED | `no-money-without-a-way-back.test.ts` (7); `mail.test.ts` — *"CANNOT DRIFT from what the factory actually builds"* |
| C4 | `CONTACT_EMAIL` is a real `mailto:` on all five surfaces the moment it is set, and inert text (never a dead `mailto:[ИМЕЙЛ]`) while it is a placeholder | FIXED | `contact-email.test.tsx` — incl. *"has zero `{CONTACT_EMAIL}` interpolations left under src/app and src/components"* |
| C5 | „Моите покупки" in `/settings` — pack, date, amount, Stripe session reference, **including the receipt with no grant behind it**, because an empty page reads as „you never paid" | FIXED | `purchases.test.ts` (9) + `purchases-panel.render.test.tsx` (6) — the panel is actually rendered |

### Lane D — Connection pool and query count

| # | Finding | Status | Test that fails without it |
| --- | --- | --- | --- |
| D1 | The pool had **never been configured**: `pg` defaults are `max 10` and an acquire timeout of `0` = wait forever, which is why the page hung instead of erroring. Now `max 20`, `connectionTimeoutMillis 5000`, `statement_timeout 10000` | FIXED | `db.test.ts` (5) — asserts the config object handed to `pg.Pool`; all five fail against the old one-key `{connectionString}` |
| D2 | The `connection_limit` / `pool_timeout` in `DATABASE_URL` are **inert** — Rust-engine parameters with no Rust engine behind a driver adapter — and are documented as such in `db.ts:14-19` | FIXED (documented) | `db.test.ts` — *"does not leave the tuning to the URL's Prisma-engine parameters"* |
| D3 | One read per request instead of one per caller — `lib/requestScope.ts`, memoising the **promise** (callers arrive while the first query is still open) and degrading to **no** dedupe outside a request | FIXED | `requestScope.test.ts` (7) — incl. *"shares the IN-FLIGHT read"*, *"never shares across requests"*, *"does not dedupe at all outside a request"* |
| D4 | The dashboard's duplicated reads are wrapped: `getProgress` (4 callers → 1), sim evidence (2 → 1, window floored to the minute so two `new Date()`s agree), `getState` (3 → 1) with `saveState` evicting | FIXED | `queryBudget.test.ts` (7) — the same harness measures the before and after |
| D5 | `getContinueLesson` no longer recomputes the readiness snapshot, and returns `null` before touching readiness at all for a student who has started nothing | FIXED | `queryBudget.test.ts` — *"does not compute the readiness snapshot twice"*, *"does not fold readiness at all for a student who has started nothing"* |
| D6 | `SimSession.passed` / `rubricStars` are real columns, backfilled from the events payload with the same predicates `parseSimSessionEvents` uses | FIXED — **and the migration has now actually run** (it had only been proved by text) | `prismaSchemaContract.test.ts` — *"backfills those two columns instead of resetting every student's progress"* |
| D7 | `/simulator` stops reading every rule event a student ever generated: `listSessions` drops `events`, reads the two summary columns, takes 200 newest on the `(userId, startedAt)` index | FIXED — see **collision X1** | `prismaStoreQueries.test.ts` (6) — *"does not select the event log"*, *"bounds the read instead of fetching a lifetime of drives"* |

**The re-count, done independently.** I instrumented one dashboard render three ways
against a real Postgres seeded with rows in every table (Progress ×9 over three topics,
GamificationState, QuestionAttempt ×5, SimSession ×3 finished inside the 14-day window):
a proxy at `db.<model>.<op>`, Prisma's own `query` event (one per SQL statement, at the
wire), and separate isolated processes per phase so nothing could leak.

| Measurement | Result |
| --- | --- |
| Request-scoped render (production shape) | **2 SQL statements + 1 auth read = 3** |
| Same render, no scope | **3 SQL statements + 1 auth read = 4** |

So the claim "13 → under 6" is **conservative** — the ceiling is lower than promised and
far under the pool of 20. Two honest caveats. First, the auth read is counted as 1 by
assumption (it is `getSessionUser`'s React-`cache()`d `role`+`sessionEpoch` query, which
my harness mocks out). Second, in my instrument the `SimSession` evidence read is issued
by the store — I can see it enter and return — but emits no SQL during the composed
render while an identical direct call does; I could not account for that in the time I
had, and it can only make the real number **higher by one**, i.e. at most 4 scoped.
Either way the answer to "is it under 6" is yes, measured, not asserted.

### Lane E — Authentication, sessions, abuse

| # | Finding | Status | Test that fails without it |
| --- | --- | --- | --- |
| E1 | The answer-key oracle is closed: `issuePracticeTicket` was built, exported, tested and **called from nowhere**. Now wired page → client → action | FIXED | `theory/practice/actions.test.ts` — *"REFUSES an exam question scraped from another tab, and writes nothing"* |
| E2 | The enforcement switch defaults **safe**: unset now REQUIRES in production (it used to read `env === "1"`, i.e. off unless remembered) | FIXED | `practiceTicket.test.ts` — *"REQUIRES a ticket in production when the variable is not set at all"* |
| E3 | The repo-published admin password `?? "founder-dev"` is gone with no default; the seed refuses `NODE_ENV=production` and any non-loopback `DATABASE_URL` | FIXED | `seedFounderGuards.test.ts` — incl. a test that **spawns the real script** and asserts its stderr |
| E4 | Logout-everywhere is real: `sessionEpoch` stamped into the JWT at sign-in only (`auth.ts:69`), compared inside the DB read `getSessionUser()` already made — **zero new queries** | FIXED | `session.test.ts` — *"REVOKES a token minted before the epoch was bumped"*, *"does not sign anyone out on the deploy that lands the column"*, *"cannot be beaten by a token claiming a higher epoch"* |
| E5 | The authenticated change-password form + „Изход от всички устройства"; the stale `/settings` paragraph claiming password change „още не е готова" is deleted | FIXED | `passwordActions.test.ts` — incl. *"ignores an e-mail posted in the form — identity is the session"* and the copy guard |
| E6 | The failed-login lockout survives our own five-minute deploy cron: moved from a per-process `Map` to `LoginLockout`, keyed on `sha256(email)`, fails **open** on a DB error, sweeps its own rows | FIXED | `rateLimit.test.ts` — *"survives a restart — the streak is a row, not a Map entry"*, *"stores sha256 of the address, never the address"* |
| E7 | Four unmetered server actions are metered on the **server user id** (a Bulgarian classroom is one NAT), budgets taken before the expensive work | FIXED | `theory/practice/actions.test.ts` — *"does not put a whole classroom on one budget"*, *"takes the budget BEFORE any database work"* |
| E8 | `startExamAction` gained the missing in-flight check — a double-tap resumes the paper instead of abandoning a 40-minute exam | FIXED | `exams/actions.test.ts` — *"opens exactly ONE attempt for a double-tapped button"*, *"refuses BEFORE the attempt lookup — a guard must not be an amplifier"* |
| E9 | ADR-008 records the revocation decision `reset.ts` had flagged as owing one | FIXED | `docs/architecture/07_ARCHITECTURE_DECISION_RECORDS.md` |

### Lane F — Operations, admin, CI, backups

| # | Finding | Status | Test that fails without it |
| --- | --- | --- | --- |
| F1 | `/admin` — the support surface that replaces psql-over-SSH. Search by e-mail; entitlements, payments, attempts, tutor spend; grant / revoke / restore-free-exam / delete-stuck-attempt | FIXED | `admin/actions.test.ts` (9) — *"a logged-in student is not support"*; verified red: deleting the gate fails 5 of 9 |
| F2 | Every mutation writes an `AdminAction` row naming the admin **in the same transaction**, and the store's types make the audit input mandatory | FIXED | `admin/__tests__/service.test.ts` — *"every mutation writes a row naming the admin"*, *"refuses without a stated reason — and writes nothing"* |
| F3 | All four server actions repeat the `isAdmin` gate, because a server action is a public POST endpoint (verified: `requireAdminActor()` is the first statement of each of the four) | FIXED | `admin/actions.test.ts` — each action answers `notFound()` and leaves the store untouched |
| F4 | A stale exam attempt renders „Този опит изтече" instead of auto-submitting an empty paper and handing a student a bare 0/97 (which THEO-4 forbids) | FIXED | `exam/__tests__/expiry.test.ts` (11); verified red: stubbing the branch fails 3 |
| F5 | CI applies migrations to a **real** `postgres:17` and diffs the result with `--exit-code`, before the slow steps | FIXED | `tools/deploy/ci-workflow.test.mjs` (6) — asserts the service exists, migrations are APPLIED not merely generated from, and the gate precedes the build |
| F6 | `/api/health` went from `SELECT 1` to also failing readiness (503, naming the migration) on any `_prisma_migrations` row with `finished_at NULL` | FIXED | `api/health/migrations.test.ts` (6); verified red: stubbing the probe fails 4 |
| F7 | A CI guard refusing `DROP COLUMN` / `DROP TABLE` / `SET NOT NULL` / `DROP CONSTRAINT` / `DROP INDEX` without an in-file `-- knijka:allow-destructive` marker | FIXED | `tools/deploy/check-migrations.test.mjs` (16/16) |
| F8 | Expand/contract written into `tools/deploy/README.md` next to the rollback section, stating plainly that a rollback restores the CODE and **not** the schema, and naming the pre-deploy dump path | FIXED | `tools/deploy/ops-docs.test.mjs` (9/9) — incl. *"the documented override marker is the one the guard actually accepts"* |
| F9 | `pull-backups.sh` had **never executed once** (it assumed `rsync`, which Git Bash does not ship, and created the directory before any network call). Now scp-based, creates nothing until the VPS answers, sha256-verifies, and `--check` fails at 8 days | FIXED | `tools/deploy/pull-backups.test.mjs` (14/14) — runs the real script |
| F10 | Log rotation as an installable file (`logrotate.knijka`), with pm2's own descriptors covered by `pm2-logrotate` in the README | FIXED | `ops-docs.test.mjs` — *"the logrotate snippet is now an installable file, not prose"* |
| F11 | `DISABLED_FEATURES` kill switch checked in the ONE access function every page guard and every server action already shares, so a page guard alone cannot leave the POSTs live | FIXED | `killSwitch.test.ts` (7) — *"refuses at the gate every call site shares — page AND actions"*; `features.test.ts` (9) |

### Lane G — Classroom

| # | Finding | Status | Test that fails without it |
| --- | --- | --- | --- |
| G1 | The classroom money leak: `askTeacher` ran the AI tutor with **no trial check at all**. It now runs the same `getTutorAccess` decision `/tutor` runs — and closes only the MODEL path, so board commands and authored answers (both $0) still work | FIXED | `lesson/tutorGate.test.ts` (10) — *"does NOT reach the model for a free account whose lifetime trial is spent"*; patching the gate out: 4 failed / 6 passed |
| G2 | `btn-primary` was used at five call sites and **defined nowhere**. Added as a second SELECTOR on the existing `.btn-accent` rule (one declaration block, so it cannot drift) | FIXED | `buttonClasses.test.ts` (4) — *"has a definition for every btn- class the product renders"*, with CSS comments stripped first |
| G3 | `LessonProgress` wired end to end: store + the three pure decisions (a COMPLETED lesson opens at 0; the resume card offers the most recently **touched** unfinished lesson; completion is sticky) | FIXED | `modules/lesson/__tests__/progress.test.ts` (18) |
| G4 | The bookmark points at the NEXT sentence's engine beat — the only rule that neither replays a whole idea nor skips the rest of one | FIXED | `classroom/resume.test.ts` (11) — walked over every sentence of a real lesson |
| G5 | `saveLessonPosition` re-bounds the index against the lesson's own beat list, never the payload; a bookmark failure never interrupts a lesson | FIXED | `classroom/wiring.test.ts` (13) — *"re-bounds the index against the LESSON, not against the payload"* |
| G6 | One front door: `/lesson` and `/lesson/[lessonId]` `permanentRedirect` into the classroom, with the id resolved against the catalogue **before** it reaches a `Location` header | FIXED | `wiring.test.ts` — *"resolves the id against the catalogue before putting it in a Location"* |
| G7 | Teacher `quizzing` state + board freeze: `quiz-open` only from `speaking` (never overwrites a raised hand), raise-hand allowed **during** a quiz, board deliberately NOT dimmed while the question is being read | FIXED | `player.test.ts` — *"never overwrites a raised hand with a question"*, *"has a caption for EVERY state"*; `boardFreeze.test.ts` (11) is a chain of custody |
| G8 | The screen-reader line printed the raw enum (`Състояние на учителя: speaking`) — the one place the product spoke English at a 17-year-old, and the only place nobody could see it | FIXED | `player.test.ts` — *"has a caption of its own — the defect was the enum, not the copy"* |
| G9 | `checkControl.test.ts`'s JSX scanner treated an apostrophe inside a comment as a string opener and ran 11,404 characters past the end of its element, reporting the wrong tag for a correctly-written control | FIXED | `checkControl.test.ts` went 78 tests / 1 failed → 82 / 0 |

### Lane H — the close wave (the rows this page itself opened)

Everything here was written *after* the first verification pass and closes something this
document had recorded as OPEN or SEQUENCED. Each row was re-proved by the re-gate — the
"test that fails without it" column names a test that was **observed failing** with the
fix removed, not one that merely exists.

| # | Finding | Status | Test that fails without it |
| --- | --- | --- | --- |
| H1 | **The poison-pill replay** (§2.5) — `recordPurchase` rethrew when a replay's grant was gone but its receipt was not, 500ing the webhook for ~3 days after an ordinary support revoke. Now matches **both** `P2002` and `P2003`, asks the receipt, returns `receipt-without-grant` and grants nothing | FIXED | `payments/__tests__/poison-pill.postgres.test.ts` (**real Postgres**) — *"CAUSE 1 — a replay after SUPPORT REVOKED the access"*, *"CAUSE 2 — a replay after ART. 17 ERASURE"*, *"holds under FIVE SIMULTANEOUS replays of a revoked session"*. Re-proved this gate: pre-fix **3 failed / 2 passed**; P2002-only **1 failed / 4 passed** |
| H2 | The state is carried up the stack honestly instead of flattened into `already-fulfilled`: `FulfillResult` gains `receipt-without-grant` with **no `entitlementId`**, the webhook logs one line and answers **200** | FIXED | `webhook/route.test.ts` — *"200s a replay whose access was REVOKED — and resurrects nothing"* (200 + 0 entitlements + `processedAt` set, `lastError` null); `receipt-and-race.test.ts` — *"fulfillCheckout passes the state up instead of claiming an entitlement"* |
| H3 | `InMemoryPaymentsStore` teaches the fake the same verdict, so it cannot bless behaviour production cannot perform. It still cannot *reproduce* the defect — that needs two tables, one transaction and a rollback — which is exactly why H1's test talks to Postgres | FIXED | `receipt-and-race.test.ts` — *"agrees with the database about a receipt whose grant is gone"* |
| H4 | A real loss stays loud: a purchase with **no** grant and **no** receipt still rethrows → 500 → Stripe keeps knocking → the event stays in the dead-letter queue | FIXED (guard) | `poison-pill.postgres.test.ts` — *"still refuses a purchase it can neither grant nor account for"*; passes on **both** sides of the fix, by design |
| H5 | **The mini-quiz rendered sign questions blind** (was S2). `LessonQuizQuestion` gains `media` at question **and** option level; `toClientQuestion` populates both **spread-free**, so no future bank field can leak by accident; `ClassroomRoom` draws them through the same `SignFace` / `hasSignOptions` / `QuestionArtwork` the practice runner, the exam runner and the micro-quiz already mount — no second renderer | FIXED | `lesson/__tests__/quiz-media.test.ts` (11) — incl. *"survives the beat's option rotation"* (the face must travel with its option or option 1's picture lands on option 3) and *"still ships no answer — media is not a leak, `correct` is"*. 6 of the 11 go red when the DTO change is reverted |
| H6 | …and **it was looked at**, which caught two things no test would have: a landscape 2-column grid that pushed „Отговори" 34 px off the board, and an uncapped 106 px artwork block that pushed four sign questions 11–81 px under a fold they had cleared at exactly 0 px | FIXED | `quiz-media.test.ts` — *"gives the sideways phone one row of four, not two rows of two"*, *"caps the question's own artwork instead of pushing the answers away"*. Both pin **measured numbers**. Frames verified by this gate — see §1 note and the residual in §7 |
| H7 | `/dev/classroom-quiz` — the durable way to look next time, twin of `/dev/micro-quiz`. Mounts the **real** `ClassroomScene` on the quiz beat with the question dealt by the real `dealBeatQuiz`; `?list=1` prints every artwork question the lessons deal | FIXED | `lesson/one-front-door.test.ts` still returns exactly one lesson surface — the rig types its prop via `ComponentProps` rather than importing `@/modules/lesson/client`, so it cannot register as a second front door |
| H8 | **`getSimEvidenceSince` pulled the whole event payload for every drive in 14 days, unbounded** (was S3). Now a `$queryRaw` jsonb projection returning only `conceptId`/`kind`/`severityClass`/`finishedAt`, `ORDER BY startedAt DESC` on the index `SimSession` actually has, `LIMIT 500` | FIXED | `learning/prismaStoreQueries.test.ts` (7) — all red against HEAD's store (the mock's `findMany` throws on purpose, so the old implementation cannot pass the file) |
| H9 | …and the **guards** matter as much as the projection: `jsonb_array_elements()` **throws** on a scalar and `readiness.ts` swallows the rejection, so one corrupt row would have silently zeroed every student's sim evidence with nothing in the logs. Wrapped in `CASE WHEN jsonb_typeof(events->'ruleEvents') = 'array'`, plus the `version = '1'` envelope check the in-Node parse did | FIXED | same file — junk rows (NULL triples, severity `"made-up"`, empty `conceptId`) are dropped rather than fed to `SIM_SEVERITY_UNITS` |
| H10 | **`User.examDate` / `dailyGoalMin` / `onboardedAt` are finally written** (was S5). The flow touched only `localStorage`, so the exam date lived in one browser and never reached the server. New `lib/onboarding/{store,service}.ts` + a rate-limited server action taking identity from `getSessionUser()` only; `/onboarding` reads the row and redirects when `onboardedAt` is set, so "shown once" means once per **student**, not once per browser | FIXED | `lib/onboarding/**` (40 tests). Proved red by restoring the six pre-existing files from HEAD: **22 failures**. `wiring.test.ts` is the one that catches the actual defect — it asserts each of `submitExamDate`/`submitGoal`/`finish` reaches the row, and that the skip path stamps `onboardedAt` |
| H11 | The UTC day conversion lives in **one** place — `@db.Date` round-tripped through local getters is a real off-by-one-day for any negative offset — and a step writing only its own answer cannot blank the others | FIXED | `onboarding/service.test.ts` — the three-state encoding (never asked / answered „нямам дата" / has a date), calendar validation (`"2026-02-31"` silently becoming March 3rd), and a dead database returning `false` instead of blocking a student's first lesson |
| H12 | **A throttled student was told their drive failed to save.** The budget refusal returned `SAVE_FAILED` — false about their data, and actively harmful advice, because the natural response to "it failed" is to drive it again immediately, which is the one action that keeps the budget spent. `RATE_LIMITED` is now its own code with its own Bulgarian sentence naming the real number (20 / 10 min) and saying the on-screen grading still stands | FIXED (was S4) | `simulator/finish-rate-limit.test.ts` (9) — verified red by restoring `code: "SAVE_FAILED"`: **2 of 9 fail** (*"answers RATE_LIMITED, never SAVE_FAILED, once the budget is gone"*, *"refuses BEFORE grading"*). The limiter is un-mocked, so the boundary asserted is the one `policy.ts` sets |
| H13 | **The orphaned twin is deleted** (was S8). `components/lesson/LessonRunner.tsx`, 26 KB, mounted by no route since G6's redirects shipped. Its concrete cost is on the record: H5's sign-face fix landed in `ClassroomRoom.tsx` and **never reached the runner**, because the runner is not on screen | FIXED | `lesson/one-front-door.test.ts` (6) — verified red by restoring the file: **2 of 6 fail** (*"is mounted by ONE file in the whole tree"* returns 2). The guard walks the **whole tree**, which is how the second door was found |
| H14 | `tsc` was at **exit 2** on the payments three-lane merge — `receipt-and-race.test.ts:153` read `.entitlementId` off a union that had gained `receipt-without-grant`. Narrowed **positively** now, so a future variant cannot slip through the same hole | FIXED | `npx tsc --noEmit` — exit 0, zero output, re-run for this gate |
| H15 | Eight orphan scratch dist dirs (~1.15 GB) deleted, and the real-DB test convention established with both guard rails verified by hand: blank `PAYMENTS_TEST_DATABASE_URL` counts as unset (logical-OR, **not** `??` — with `??` the empty string `.env.example` ships would beat a perfectly good `DATABASE_URL`, so the file's own documentation would install the silent skip), and the skip prints via `process.stderr` because vitest swallows `console.warn` from a skipped file — so the warning that exists to stop a silent skip would itself have been silent | FIXED | `src/lib/tsconfigHygiene.test.ts` (4) — re-run green after this gate's own build rewrote `tsconfig.json` |

---

## 4. FOUNDER-MUST-DO — exact commands

Nothing here can be done by code. Ordered by what breaks if you skip it.

### 4.1 Rotate `founder@knijka.ai` — the old password is public

The published default is deleted from HEAD but every hash that already exists is
unchanged. On the VPS:

```bash
cd /opt/knijka/platform
read -s NEW_PW                      # typed, not echoed — keeps it out of shell history
HASH=$(NEW_PW="$NEW_PW" node -e 'console.log(require("bcryptjs").hashSync(process.env.NEW_PW,12))')
psql "$DATABASE_URL" -c "UPDATE \"User\" SET \"passwordHash\"='$HASH', \"sessionEpoch\"=\"sessionEpoch\"+1 WHERE email='founder@knijka.ai';"
unset NEW_PW HASH
```

The `sessionEpoch` bump is the new part and the part that matters: it kills any session
someone already opened with the published password, which until today would have
survived the rotation for another 30 days.

### 4.2 Audit the admin rows

Every admin row is a free licence to the simulator pack, unlimited mock exams, the
practice cap, the hazard gate and the tutor quota.

```bash
psql "$DATABASE_URL" -c 'SELECT email, role FROM "User" WHERE role='"'"'admin'"'"';'
psql "$DATABASE_URL" -c "UPDATE \"User\" SET role='student', \"sessionEpoch\"=\"sessionEpoch\"+1 WHERE role='admin' AND email <> 'founder@knijka.ai';"
```

### 4.3 Pull a backup today — not one dump has ever left the VPS

```bash
bash tools/deploy/pull-backups.sh          # expects ~/.ssh/id_ed25519_flokinet, or set KNIJKA_SSH_KEY
bash tools/deploy/pull-backups.sh --check  # should print an age in days; red at 8
```

It refuses with exit 2 and creates nothing if the key or the host is wrong, so a failed
first attempt is safe.

### 4.4 Do the restore drill once, now, not during an incident

```bash
createdb knijka_restore_test
pg_restore --no-owner --no-privileges -d knijka_restore_test <newest.dump>
psql -d knijka_restore_test -c 'SELECT count(*) FROM "User";  SELECT count(*) FROM "Payment";'
dropdb knijka_restore_test
```

`backup-db.sh` proves the file parses. Only this proves the rows come back. **Until a
dump has been restored, the recovery position is zero, not "backed up."** Twenty
minutes, one time.

### 4.5 Stripe: create the LIVE webhook endpoint and copy ITS secret

Dashboard → Developers → Webhooks → add `https://<your-domain>/api/stripe/webhook`,
subscribe it to exactly these four:

```
checkout.session.completed
checkout.session.async_payment_succeeded
charge.refunded
charge.dispute.created
```

Then copy **that endpoint's** `whsec_…` into `STRIPE_WEBHOOK_SECRET`. Copying the test
endpoint's secret is the exact failure mode B13 exists to catch — the two secrets come
from two different screens and only one changes visibly when you flip the mode toggle.

### 4.6 Stripe: the four environment variables

```
STRIPE_MODE="live"
STRIPE_SECRET_KEY="sk_live_…"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_…"
STRIPE_WEBHOOK_SECRET="whsec_…"   # from 4.5
```

`STRIPE_MODE` defaults to `test`, so a live deployment that forgets it **refuses to
sell** (buy buttons render „скоро", the webhook answers 503 which Stripe retries) rather
than taking money it is not ready to honour. That is the safe direction, but it does
mean nothing sells until you set it.

### 4.7 Mail — checkout stays disabled until this is real

Open a Resend or Postmark account (both free tiers cover a Bulgarian launch), verify the
sending domain with the SPF + DKIM DNS records, then set on the VPS:

```
MAIL_TRANSPORT="resend"      # or "postmark"
MAIL_API_KEY="…"
MAIL_FROM="no-reply@<your-domain>"
```

then `pm2 restart knijka --update-env`. Confirm with `curl /api/health` →
`checks.mail.{transport,ok}`. This is deliberate: the product now refuses to take
EUR 12.99 from a seventeen-year-old it has no way to send a password-reset link to.

### 4.8 Legal identity and contact address

`platform/src/lib/legal/identity.ts` — fill in `ENTITY_NAME`, `ENTITY_ADDRESS`,
`LAST_UPDATED` and `CONTACT_EMAIL` with your real registered details. The moment
`CONTACT_EMAIL` is set, all ten occurrences across `/terms`, `/privacy`, `/contact`, the
operator card and the checkout consent gate become live `mailto:` links with no further
edit. Both the identity and the mail gate block `isStripeConfigured()` — no euro can
move until they are real.

### 4.9 After the live keys exist: find out whether sales were already lost

```bash
npm run payments:reconcile -- --days 365
```

Point it at the LIVE Stripe key and the production `DATABASE_URL`. Every other fix stops
a NEW loss; this is the only thing that can see a purchase that already fell through,
because the write is the thing that failed — looking harder at our own tables cannot
find those students. **It prints nothing when clean.** It is read-only: if it lists
orphans you decide per row whether to grant access or refund, because no script should
make that call.

### 4.10 Postgres `max_connections` on the VPS

The pool now takes up to 20 connections per app process where it took 10, and staging
redeploys every five minutes. If the server is on the default 100 and other projects
share the instance, raise it — or lower `POOL_MAX` in `platform/src/lib/db.ts`. It is
the one number in this change that depends on a machine only you can look at.

### 4.11 Apply the three new migrations, migration-first

```bash
ssh <vps> 'cd /opt/knijka/platform && npx prisma migrate deploy'
```

Order matters: the new `/simulator` code SELECTs `SimSession.passed` and `rubricStars`,
so code-first would 42703 until the migration lands. Migration-first is safe in both
directions — the columns are nullable and the currently-deployed build ignores them.
`tools/deploy/deploy.sh:285` already runs this, and `deploy.sh` takes a database backup
first and refuses to migrate if the backup fails.

**One thing to know before it runs.** The payments migration contains a `DO` block that
deliberately RAISEs and rolls the whole migration back if any `(provider, providerRef)`
group spans more than one user or pack:

```
Refusing to de-duplicate Entitlement: N (provider, providerRef) group(s)
span more than one user or pack.
```

If that fires, nothing is on fire — the transaction rolled back and the old code keeps
running. It means two different students hold entitlements against one Stripe session
id, which cannot happen through the normal race, and a human must look at those rows.
It should never fire: the product has never taken a real payment.

### 4.12 Make the VPS deploy the `staging-green` tag

Add GitHub as a fetch remote on the box and change `/opt/knijka/autodeploy.sh` to
resolve `staging-green` instead of branch HEAD, refusing when the tag has not moved.
Until that one-line change the CI job that moves the tag is inert — it records the
verdict and nothing consumes it, so a red commit still reaches students on the
five-minute tick.

### 4.13 Branch protection

In GitHub settings: require `gate` as a status check, forbid direct pushes to
`scenario-engine` and `main`. This cannot be done from a workflow file.

### 4.14 Install log rotation on the VPS

```bash
install -m 644 tools/deploy/logrotate.knijka /etc/logrotate.d/knijka
logrotate -d /etc/logrotate.d/knijka        # dry run
pm2 install pm2-logrotate                   # plus the four `pm2 set` lines in the README
pm2 conf pm2-logrotate
```

Nothing rotates today, and the logs are the only forensics that exist. A full disk on
that box takes out the database and the on-box backups together.

### 4.15 Give yourself an admin session, or `/admin` does not exist for you

Set `SEED_FOUNDER_PASSWORD` in your own `.env` (never a committed file) and run
`npm run seed:founder`, or promote your existing account to `role=admin`. The page and
all four actions answer `notFound()` to everyone else, including a logged-in student who
guesses the URL. There is no nav entry — deliberately — so bookmark it.

### 4.16 Point an uptime monitor at `/api/health`

Readiness, no query string, on the tunnel URL. The health gate catches a bad deploy; it
cannot catch staging dying at 04:00 on its own, and that is the remaining path from
"down" to "somebody knows".

### 4.17 The first-aid ruling — the only reason the gate is red

This is the one FOUNDER-MUST-DO that is currently holding a test red, so it gets named
rows rather than a percentage.

**Four concepts have ZERO approved questions.** Not "few" — zero. That is why
`l-accidents-first-aid` cannot build a quiz beat at all: `compose.ts:276` only emits a
quiz when `eligible.length > 0`, and for these four sections it is 0.

| Concept | Approved | Awaiting your ruling |
| --- | --- | --- |
| `c-first-aid-priorities` | **0** | 9 |
| `c-cpr-basics` | **0** | 6 |
| `c-bleeding-control` | **0** | 7 |
| `c-victim-handling` | **0** | 7 |

**The 29 rows, by id.** Every one is medical, and every one is in
`content/questions/ptp-i-parva-pomosht.json`:

```
q-ptp-013  q-ptp-014  q-ptp-015  q-ptp-016  q-ptp-017  q-ptp-018  q-ptp-019
q-ptp-020  q-ptp-021  q-ptp-022  q-ptp-033  q-ptp-034  q-ptp-035  q-ptp-036
q-ptp-037  q-ptp-038  q-ptp-039  q-ptp-040  q-ptp-041  q-ptp-042  q-ptp-056
q-ptp-057  q-ptp-058  q-ptp-059  q-ptp-060  q-ptp-061  q-ptp-062  q-ptp-063
q-ptp-064
```

To read them with their options and explanations laid out for review:

```bash
cd platform && npm run dev          # then open /review, log in as the admin account (§4.15)
```

or, without the app, the same rows in Markdown:
`content/review/FLAGGED-FOR-REVIEW.md`.

Approving them writes to `content/review/approvals.json`.

**Four more rows in the same file are NOT medical** and do not need a clinical ruling —
they are legal, and a normal content review clears them:

```
q-ptp-009  (c-hit-and-run)           q-ptp-044  (c-accident-definition)
q-ptp-050  (c-when-call-police)      q-ptp-052  (c-hit-and-run)
```

> **Do not approve only those four.** It would take the topic from 31/64 (48 %) to
> 35/64 (55 %), clear `MIN_APPROVED_SHARE = 0.5` and turn
> `content-bank.test.ts` **green** — while every single first-aid question stays
> withheld and `compose.test.ts` stays red. That is making a true red green by moving
> past a threshold, which is the exact failure this whole programme exists to stop. The
> ruling is what unblocks first aid; the four legal rows are unrelated bookkeeping.

**One caveat on the ruling itself.** These are questions about CPR depth, tourniquets,
moving a spinal-injury casualty and when to pull someone from a burning car. They are
taught because the official exam asks them — but a wrong answer here is not a wrong
answer about right-of-way. Whatever you decide, decide it as the person whose name is on
the company, and consider having a clinician read the 29 before they are dealt to
seventeen-year-olds.

### 4.18 Decide about the git history

`git log -S 'founder-dev'` still finds the old password in this repository and always
will unless the history is rewritten (filter-repo + force-push, which breaks every
existing clone). Rotating the password (4.1) makes the exposure harmless, so this is a
reputation call rather than a security one — but it is yours to make.

---

## 4A. FOUNDER-DECISION — retention, recorded and deliberately not built

**The founder has taken GDPR off the engineering plate. Nothing in this section was
implemented and nothing in it should be, until he says otherwise.** It is written down
for one reason: all three findings are about data that is **accumulating right now**, and
the cost of each decision goes up with every row. A retention rule chosen before the
first live Stripe event is a config value. The same rule chosen in six months is a
migration over real buyers' data, with the question of what was already exported to
whom sitting on top of it.

Three rows. Each names the file and line, states what is actually true today, and stops.

| # | Finding | File:line | What is true today | What the decision is |
| --- | --- | --- | --- | --- |
| **R1** | `StripeEvent.payload` stores Stripe's event object **verbatim**, and that object routinely carries buyer contact details (`customer_details.email`, `customer_details.name`, `customer_details.address`, `billing_details`). The table has **no `userId` and no relation to `User`** — deliberately, so that a webhook arriving for an unknown or already-deleted account still records. The consequence is the part to decide about: **no Art. 17 erasure cascade can reach it.** Deleting a User leaves their e-mail sitting in this JSON. | Model: `platform/prisma/schema.prisma:515-529` (`payload Json // the signed event, verbatim` at **:519**; note the model has no `userId` field and no `@relation`). Written at `platform/src/app/api/stripe/webhook/route.ts:114-121`, before any fulfilment work. Erasure does not touch it: `platform/src/modules/privacy/store.ts:245-287`. | **Zero rows.** No live Stripe key exists yet (§4.5, §4.6), so nothing has been received. This is the last moment at which the answer is free. | How long a processed event keeps its payload. The natural boundary is Stripe's own dispute window (~120 days for a card chargeback); after that the row's audit value is `stripeEventId` + `type` + `processedAt`, none of which is personal data. A sweep that NULLs `payload` past that age is a cron and a `deleteMany`-shaped update — but it is a **retention policy**, and a retention policy is a founder's statement, not an engineer's default. |
| **R2** | `AdminAction.detail` snapshots the **whole** entitlement row on a revoke — pack, provider, `providerRef` (the Stripe session id), `purchasedAt` — so the grant can be reconstructed from the ledger alone. `subjectId` is `onDelete: SetNull`, so erasing the account unlinks the row; **the JSON snapshot is never scrubbed**, and `targetRef` keeps the entitlement id. `actorEmail` is denormalised on purpose and is an admin's address, kept forever by design. | Model: `platform/prisma/schema.prisma:119-140` (`detail Json?` at **:130**, `subjectId … onDelete: SetNull` at **:134**). The snapshot is assembled at `platform/src/modules/admin/service.ts:258-275` and persisted at `platform/src/modules/admin/store.ts:184-187` and `:401`. | **Zero rows in production** — `/admin` shipped this wave and nobody has used it. Locally, whatever the tests wrote. | Whether an audit row survives the erasure of its subject, and for how long. There is a real tension and it is the founder's to resolve, not engineering's: an audit log that can be erased by the person it audits is not an audit log, and Art. 17(3)(b)/(e) does permit retention for legal claims — but „forever, including their Stripe session id" is a choice nobody has made out loud. Decide the horizon (e.g. keep the row, drop `detail` after N months) **before** the ledger has real rows in it. |
| **R3** | `eraseUser` deletes **seven** child tables explicitly and builds the Art. 17 erasure receipt from exactly those seven counts. Five more tables hang off `User` and are **not** in the list: `ConsentEvent`, `PasswordResetToken`, `SimAttemptTrace`, `SimSelfPrediction`, `LessonProgress`. **Erasure is still CORRECT** — all five are `onDelete: Cascade` (verified in the schema: `:162`, `:194`, `:333`, `:370`, `:651`) and Postgres removes them with the parent. What is wrong is the **receipt**: it under-reports, and it does so silently. | `platform/src/modules/privacy/store.ts:245-287` — the seven `deleteMany`s at **:267-273**, `tx.user.delete` at **:276**, the receipt object built from those counts at **:278-286**. The rule it breaks is stated in that same file's own header, `platform/src/modules/privacy/store.ts:11-17`: the explicit deletes exist so that "a future relation added WITHOUT a cascade fails loudly in the test rather than silently orphaning rows". Five relations were added and none of them was. (The brief cited `:258-286`; measured on this tree the block is `:245-287`.) | Applies to every erasure that has ever run. The student is told what was deleted; five categories are missing from the answer. | Nothing here is a data-protection *hole* — the data is gone. It is a **truthfulness** problem in a document the regulation makes us produce. The fix is five `deleteMany`s and five receipt fields; it is being left undone only because this section is not to be built. When it is picked up, it is S6 in §5. |

**What is NOT claimed here.** No row above says the product is non-compliant. R3's data is
genuinely erased. R1 and R2 are tables whose retention nobody has yet stated a rule for,
which is a different and much earlier problem than a breach — and it is early enough to
be cheap. That is the entire reason this section exists rather than being left in a
lane report nobody reads again.

---

## 5. SEQUENCED — real, not done, blocked behind a wave that owns the file

| # | Item | Blocked behind | What to do when it unblocks |
| --- | --- | --- | --- |
| S1 | `content/questions/ptp-i-parva-pomosht.json` is 31/64 approved, which is the ONLY reason the gate is red (two tests, §1) | **the founder** — it is a medical ruling, not a scheduling problem. Promoted to **§4.17**, which names all 29 rows by id | Approve them in `content/review/approvals.json`; `l-accidents-first-aid` gets its quiz beat back at the same time. Four concepts are at **zero** approved, so nothing partial helps |
| S2 | ~~The mini-quiz in the classroom renders sign questions as „Знак 1 / Знак 2 / Знак 3 / Знак 4" with **nothing to look at**~~ | — | **DONE** (close wave) → **H5–H7**. And the blocking assumption was wrong: no new multi-sign media *kind* was needed. The content already carries a sign face per option — **the ordered set of signs IS the option list**. The defect was one line in the DTO mapper, `(o) => ({ id: o.id, textBg: o.textBg })` — the identical line that caused L1 in the simulator's micro-quiz, written a second time in a second module. |
| S3 | ~~`getSimEvidenceSince` still selects the whole `events` blob for every session in the last 14 days, with **no `take`**~~ | — | **DONE** (close wave) → **H8–H9**. Measured against a real Postgres with 67 sessions in-window: the old read shipped **279,079 bytes** of JSON to Node; the new one returns 495 rows / **50,989 bytes**, capped at 500. The point is not the ratio — it is that the number stops growing with how much the student drives. |
| S4 | ~~`finishLessonAction` returns the existing `SAVE_FAILED` code when its rate-limit budget is spent, rather than a distinct `RATE_LIMITED`~~ | — | **DONE** (close wave). `RATE_LIMITED` is its own code (`simulator/actions.ts:110`, `lesson-ui/types.ts:104`) with its own Bulgarian sentence in the shell footer, because the two codes want opposite behaviour from the reader: SAVE_FAILED is permanent and outside the student's control, RATE_LIMITED clears on its own and the same drive saves fine after a wait. Test: `simulator/finish-rate-limit.test.ts` (9) — *"answers RATE_LIMITED, never SAVE_FAILED, once the budget is gone"*; verified red by restoring the old code: 2 of 9 fail. |
| S5 | ~~`User.examDate` / `dailyGoalMin` / `onboardedAt` exist as columns and **nothing writes them**~~ | — | **DONE** (close wave) → **H10–H11**. `localStorage` is demoted to an offline mirror the server fills when a device is cold, so the laptop finally shows the countdown the phone answered. The fill happens in an effect and **not** in the page's data layer, deliberately, so the dashboard render stays at the six queries `queryBudget.test.ts` pins. |
| S6 | `privacy/store.ts:245-287` `eraseUser` deletes seven child tables explicitly and builds the Art. 17 receipt from those counts. It omits `ConsentEvent`, `PasswordResetToken`, `SimAttemptTrace`, `SimSelfPrediction` and now `LessonProgress`. Erasure is still **correct** (the DB cascade removes them) — the receipt under-reports | **the founder** — moved to **§4A R3**, GDPR is off the engineering plate | Add the five `deleteMany`s so the receipt matches reality, which is what that file's own header says the explicit deletes exist to prevent. **Not built. Recorded only.** |
| S7 | `StripeEvent.payload` stores Stripe's raw event JSON, which can contain buyer contact details, and the table deliberately has no `userId` — so **no Art. 17 cascade reaches it** | **the founder** — moved to **§4A R1** | A retention sweep that drops the payload once the event is processed and past dispute age. Required before this table sees live traffic. **Not built. Recorded only** — and the table still has zero rows, which is what makes now the cheap moment. |
| S8 | ~~`components/lesson/LessonRunner.tsx` (26 KB) is now mounted by no route — G6 kept the URLs alive but the plain runner is unreferenced~~ | — | **DONE** (close wave). Deleted, with its `CALL_SITES` row in `components/ui/checkControl.test.ts`. G6's redirects stay, so no bookmark 404s; the room is the one door. The twin's concrete cost is on the record: this wave's sign-option fix (S2, `SignFace`/`hasSignOptions`) landed in `ClassroomRoom.tsx` and never reached the runner, because the runner is not on screen. Test: `lesson/one-front-door.test.ts` (6) — *"is mounted by ONE file in the whole tree"*; verified red by restoring the file: 2 of 6 fail. |
| S9 | `AdminAction.detail` snapshots the whole revoked entitlement row and `targetRef` holds ids; `subjectId` is `SetNull` on erasure but the JSON is not scrubbed | **the founder** — moved to **§4A R2** | Same class as S7 — decide a retention rule before the ledger has real rows in it. **Not built. Recorded only.** |

---

## 6. Collisions with waves that own the files

The brief named five protected paths. Checked one by one against the working tree.

| Path | Touched? | By whom |
| --- | --- | --- |
| `content/questions/**` | **No** — zero working-tree changes | — |
| `content/SCHEMA.md` | **No** | — |
| `components/theory/QuestionMedia.tsx` | Yes, **comment only** (+21/-2) | The theory-vs-law wave itself — the new comment cites `content/SCHEMA.md` „the comparison shape" and `docs/education/90 §4.1`. Not one of the seven lanes. |
| `app/(dashboard)/review/**` | Yes, 4 files (+985/-175) and 2 new tests | The review/theory wave itself. Not one of the seven lanes. |
| `modules/sim/**` | Yes, ~40 files | Mostly the simulator wave's own scenario templates and rules. **Two files are not theirs — see X1.** |

### X1 — the one real collision

| File | Lane | What it did |
| --- | --- | --- |
| `platform/src/modules/sim/lessons/store.ts` | Lane D (pool / query count) | +38 / −13: dropped `events` from `listSessions`'s select, added `SESSION_HISTORY_WINDOW = 200` and `take`, and made `saveSession` write `passed` / `rubricStars` |
| `platform/src/modules/sim/lessons/__tests__/prismaStoreQueries.test.ts` | Lane D | New file (6 tests) inside the simulator wave's owned tree |

Lane D's own report is candid that this is outside its ownership list for the sibling
file (`modules/learning/store.ts`, S3) but does not flag it for `modules/sim`.

#### The `events` drop is safe — traced, not assumed

Every consumer was walked rather than trusted. There are **two** call sites, not three:
`simulator/page.tsx` (builds `attempts` from `lessonId`/`passed`/`score`, and
`scenarioRows` from `lessonId`/`rubricStars`) and `simulator/actions.ts`
(`priorBestScore`, `previouslyPassed`, and the scenario soft gate). The third file that
looks like a consumer, `review/my-drive/[simSessionId]/page.tsx`, calls
`listRecentSessions` — which **still selects `events`** and was not touched. `events` was
never a member of `SimSessionListRow` in the first place, so no consumer could have read
it. One correction to the handover: the consumers need `lessonId`, `score`, `rubricStars`
**and `passed`** — `passed` is load-bearing for both unlock gates and was omitted from
the list. The write side is clean trivially: `db.simSession.create` is the **only**
`SimSession` write in the entire repo.

#### The `take: 200` that rode along in the same change is NOT safe

**This gate reproduced it independently.** The justifying comment describes a lesson
catalogue that *"unlocks on 'has any attempt passed'"* — but the simulator wave's FR-06
had already changed `computeProgression` to unlock lesson N on whether lesson N−1 has any
**attempt present in the list** (`progression.ts:74-78`), and `isExamUnlocked` still
requires a **pass present in the list** (`progression.ts:109`). The list is
`orderBy startedAt desc, take 200`, so what falls out is the **oldest** drives — which
for any real student are the curriculum lessons, driven first, before they moved into the
154-template scenario library.

Driving the real folds over 260 newest scenario drives + 8 older curriculum passes:

| | Full history | Newest 200 |
| --- | --- | --- |
| Lessons unlocked | **8** (`l0`…`l7`) | **1** (`l0-free-drive` only) |
| Lessons shown passed | **8** | **0** |
| Exam card (`unlockAfterLessonId: l2-intersections`) | **unlocked** | **LOCKED** |

The same door re-locks the полигон card (`specs.ts:900`,
`unlockAfterLessonId: l1-preparation`). Lesser effects: `previouslyPassed` goes false
once the old pass ages out, so the first-pass XP bonus becomes re-awardable (farm 200
short drives, re-pass); `priorBestScore` coaches against a wrong personal best.

The change's own rationale cites *"a premium student at ~350 sessions"* — **that is
precisely the user the 200-row window robs**, of exactly the thing the same migration's
backfill section says in writing must never be taken: *"A student who had earned their
way through the catalogue would find it locked again."*

**Not fixed.** It is §0, and it is the lead's call. Fix and alternative are in §0; the
probe that demonstrates it (run outside the repo, then deleted) is the shape the
committed test needs.

### Near-misses worth naming (not on the protected list, but adjacent)

- Lane G edited `components/theory/MistakeReplay.tsx` and `MistakeMedia.tsx` (the board
  freeze). `components/theory/` is shared with the theory wave; only `QuestionMedia.tsx`
  was named as protected, so this is legal — but it is the same directory.
- Lanes A, B and C all edited `modules/payments/{stripe,store,index}.ts`. They merged
  cleanly and `tsc` is 0, but three lanes in three files is worth one hand-diff.

---

## 6A. What the sign faces actually look like — checked, not accepted

H5/H6 were re-verified by **opening the rendered frames**, not by reading the lane's
claim. What is on screen:

- **Portrait, 390×844, four-sign comparison** (`q-uyazvimi-072`, „Кой от показаните
  знаци поставя началото на жилищна зона…"): four numbered tiles in a 2×2 grid, each
  drawing a distinct, legible face — bus lane, residential zone, parking, end of
  residential zone — with „Отговори" visible below them. Before this wave all four were
  bare text labels.
- **Landscape, 844×390:** one row of four, „Отговори" on screen at y≈257 of 390. The fix
  H6 describes is doing what it says.
- **Question-level artwork, portrait:** the sign is drawn above the question with the
  expand affordance in its corner; tapping opens a full-screen viewer with „Затвори".
- **Landscape, question-level:** the 44 px „Виж пътния знак ⤢" strip stands in for the
  picture, as designed.
- **Desktop, 1280×800:** all four faces render; the tiles are very wide and the faces sit
  alone in a lot of empty space. Cosmetically loose, not a defect.

Two honest costs, both visible in the frames and neither hidden by the lane:

1. **Residual fold.** At 390×844 two of the four question-level sign questions still
   leave the board column scrolling — `q-signs-074` (Д17) by 65 px and `q-signs-087`
   (Е22) by 49 px. Those columns cleared the fold at exactly 0 px when there was no
   picture in them. The column is `overflow-y-auto` by the room's own design and the
   picture is one tap from full screen, so a student can still answer — but it is a real
   cost of putting the artwork back, and no cap closes it (the block would have to be
   ≤25 px, under `QuestionArtwork`'s own 44 px floor).
2. **The full-screen viewer is thin.** It draws the sign at 112 px on a 390 px screen
   (`QuestionMediaView`'s `h-28 w-28`, no cap). Pre-existing and **shared** with the
   practice and exam runners, so it was correctly not touched here — but „уголеми" giving
   you 112 px of a 390 px screen is not much of an enlargement, and it is now on one more
   surface.

**The count, since it was asked for:** 81 of 1,089 questions (7.4 %) carry visual media —
63 question-level (35 sign faces + 28 scene stills) + 18 option-level sign sets, no
overlap; 57 approved, 24 needs-review. **Zero** questions promise a picture in their text
without carrying one (21 Bulgarian picture-reference phrases scanned; 44 matched, all 44
have media). The content was never the defect.

### Still blind — 81 questions × 2 more surfaces, same DTO defect, not this wave's lane

| Surface | File | The shape |
| --- | --- | --- |
| **The founder's own approval console** — and the only place a question becomes human-approved | `src/app/(dashboard)/review/ReviewClient.tsx`, DTO at `src/modules/content-admin/types.ts:168` | `options: { id; textBg; correct }[]` — no option media, no question media. **All 81 are reviewed with nothing on screen, including the 24 still `needs-review`** — the exact rows a human is being asked to judge as answerable. This is the worst of the three. |
| Post-exam answer review | `src/components/exam/ExamResultView.tsx`, types at `src/components/exam/types.ts:16,30`, built at `exams/actions.ts:205` | The exam **runner** renders media fine (`ExamQuestion` carries it); only the review after submit drops it, so a candidate who got a sign question wrong reads the explanation with the sign gone. ~3.3 of every 45-question paper. |

---

## 7. Housekeeping this pass found

- **Two orphan scratch databases** are still on the local PostgreSQL: `knijka_verify`
  and `knijka_verify_shadow`. Lane A's report states it "dropped all three scratch
  databases afterwards"; two of them are still there. Harmless, but the claim was wrong.
  (The two I created for this verification — `knijka_lead_verify`, `knijka_lead_dash` —
  are dropped. `krx_bot` was never touched.)
- **A leftover verification harness** sat in `platform/src/__verify__/` (untracked, two
  files, timestamped 20:07 and 20:11 today) and it **broke `tsc`** with
  `TS2353: 'conceptId' does not exist in QuestionAttemptCreateInput`. Anyone who ran the
  typecheck before this pass got a red tree for a reason that had nothing to do with
  their work. Used, then deleted; the tree is clean.
- **The local dev database** at `localhost:51214` is a `db push` artifact with no
  `_prisma_migrations` table and five tables missing. It is also a **single-store shim**:
  it accepts `CREATE DATABASE` and registers the name, but every connection lands on the
  same store. An isolated test database cannot be made there. Use the real PostgreSQL
  17.9 on `:5432`. Someone should run `prisma migrate deploy` against `:51214` at a quiet
  moment.
- `src/generated/prisma` is gitignored, so anyone pulling this — including CI, if its
  build does not already do it — must run `npx prisma generate` in `platform/` or `tsc`
  fails on `SimSession.passed` / `rubricStars`.
- The inert `connection_limit=10&connect_timeout=0&pool_timeout=0` in `.env` should be
  stripped from `.env`, `.env.example` and the VPS environment at the same time as the
  deploy. They do nothing (D2) but they are actively misleading: the next person to tune
  the pool will edit them and nothing will happen.

### Added by the re-gate

- **Artefact scan: clean.** `git status --untracked-files=all` finds **zero** untracked
  `.png` / `.webm` / `.mp4` / `.jpg` / `.gif` / trace-frame files anywhere under the repo,
  and **zero** untracked files over 1 MB. All 106 untracked paths are source
  (74 `.ts`, 14 `.tsx`, 12 `.mjs`, 3 `.sql`, 1 `.toml`, 1 `.md`, 1 logrotate config).
  `git diff HEAD -- '*.png' '*.webm' '*.mp4' '*.jpg'` is empty, so this wave touched no
  binary at all. The frames behind §6A live in the scratchpad, not the tree.
- **But 154 MB of review artefacts are already committed under `tools/`** — 200 files of
  Blender previews and clip contact sheets (largest single file 3.4 MB,
  `tools/clips/headless/sheets/montage_A.png`). Plus 21 MB under `platform/` (legitimate:
  `public/sim/textures/*/normal.png` are product assets) and 1.4 MB in
  `.classroom-shots/`. Nothing to undo today — but this is the exact class of accident the
  626 MB incidents were, and it is worth deciding whether `tools/**/previews/` and
  `tools/clips/headless/sheets/` belong in git at all.
- **`platform/public/clips/` has only 2 tracked files** out of hundreds on disk. That
  gitignore discipline is holding and should not be relaxed.
- **`validate:content` passes, and prints something worth reading anyway:**
  `human-approved (signed, hash matches): 0 of 1089`. The exam pool is still keyed on the
  `"approved"` **string**, so all **799 unsigned rows are dealt to students today**
  (`modules/exam/builder.ts isExamEligible`). Signed supply for a mock exam is
  **0 of 135** slots. That is not a gate failure and not this wave's — it is the theory
  wave's ladder — but "approved" and "signed by a human" are two different tiers and only
  one of them is enforced.
- **Stranded dev servers from earlier waves are still running** and re-seed scratch dist
  dirs: `.next-rig`, `.next-t3rb`, `.next-t4gw`, `.next-t5b80` were on disk at gate time.
  They are gitignored and `exclude: [".next-*"]` keeps them out of `tsc` — verified: the
  typecheck is exit 0 with four of them present. They are disk, not correctness.
- **Caveat on one earlier deletion.** `.next-rig` is not a lane scratch dir:
  `platform/.gitignore:26-29` documents it as the **clip rig's** private build dir
  (`tools/clips/headless/clip-rig.mjs`), kept separate so it can never poison the shared
  Turbopack cache. A close-wave sweep deleted it as an orphan. Nothing is lost but time —
  the next clip render pays a cold rebuild instead of the documented ~20 s.
- **This file is still untracked** (`?? docs/development/91_LAUNCH_BLOCKERS.md`). It is
  the record of the whole programme; it needs to go in the commit.

---

## 8. What I would not ship without

Three things, in order.

1. **§0 / §6 X1, the `take: 200` window.** It is the only *new* and *unfixed* finding on
   this page, it is a one-line fix, and it silently takes a catalogue away from the
   highest-value student the product has. Everything else here is either fixed with a
   test behind it or a switch only the founder can throw.
2. **§4.4, the restore drill.** Everything else on this page is a defect that is now
   fixed or a switch that is now safe. That one is a capability the company does not yet
   have, and the day it is needed is the day it cannot be acquired.
3. **A database in the local test command.** §2.5's five tests — the only ones that can
   reproduce a defect that 500ed the fulfilment endpoint for three days — **skipped** in
   this gate's default run, because vitest does not read `platform/.env`. CI is fine. The
   developer typing `npx vitest run` is not, and that developer is the one who introduces
   the next one. Either give vitest the env, or say plainly in the README that the money
   tests need `PAYMENTS_TEST_DATABASE_URL` set by hand.

---

## 9. What this re-gate did NOT do

Stated so the next reader does not assume more coverage than exists.

- **Nothing was committed.** The tree is as the lanes left it, plus this document.
- **Two tests are red and were deliberately left red** (§1). No threshold was lowered,
  no content approved, no topic excluded.
- **X1 was reproduced, not repaired** (§0). The probe was run from a config outside
  `src/` and both it and the config were deleted; `git status` confirms no trace.
- **`store.ts` was temporarily reverted twice** to prove §2.5 red, and restored from a
  byte-exact backup both times (md5 `48327d2aadafe4a2c868fbd29505ca15`, checked after
  each restore, with the real-Postgres suite re-run green afterwards).
- **`tsconfig.json` was rewritten by the build and restored** — md5 back to
  `6c4e36a3ec7473153ae3dac8e4846ac3`, `git diff` empty, 0 phantom globs, `exclude` still
  containing `.next-*`; `.next-leadgate` was deleted.
- **The scratch database `knijka_poison_pill`** (PostgreSQL 17.9 on `:5432`, all 11
  migrations applied, no drift) was left in place — it is what makes §2.5's file runnable
  locally. Drop it with `drop database knijka_poison_pill` if you want the box clean.
- **`/checkout/return` still renders a `receipt-without-grant` replay as „pending"**
  („Обработваме плащането… достъпът ще се активира автоматично"). Not a false claim of
  active access, but a false promise. Reaching it needs a signed-in student re-opening a
  revoked session's return URL; fixing it needs new Bulgarian copy and a fourth UI state
  in another lane's file. Left untouched, deliberately, and named here rather than
  quietly.
