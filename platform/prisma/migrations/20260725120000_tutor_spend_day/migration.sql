-- TutorSpendDay: the global daily Anthropic ledger the tutor's kill-switch
-- reads before every model call (audit 2026-07-24, H-8 — "cost.ts tracks
-- spend but never enforces a ceiling").
--
-- One row per Europe/Sofia calendar day, incremented in the same code path
-- that books TutorThread usage. No userId and no foreign key on purpose: this
-- is an accounting total about the business, not personal data about a minor,
-- so an Art. 17 erasure never has to touch it and can never distort the bill.

-- CreateTable
CREATE TABLE "TutorSpendDay" (
    "day" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorSpendDay_pkey" PRIMARY KEY ("day")
);
