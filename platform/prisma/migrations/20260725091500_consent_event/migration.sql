-- ConsentEvent: append-only proof of every consent the product relies on
-- (audit 2026-07-24 — H-9 parental approval under ЗЛС + the ЗЗП withdrawal
-- waiver at checkout, M-24 consent versioning).
--
-- `User.consentAt` stays as it is: it is still the registration timestamp.
-- What it could never answer is WHICH wording was agreed to, which is exactly
-- what GDPR Art. 7(1) demands be demonstrable. Rows here are written once and
-- never updated; they die with the user row (ON DELETE CASCADE), so Art. 17
-- erasure keeps working without a second thought.

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "docVersion" TEXT NOT NULL,
    "textBg" TEXT NOT NULL,
    "subject" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentEvent_userId_context_recordedAt_idx" ON "ConsentEvent"("userId", "context", "recordedAt");

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
