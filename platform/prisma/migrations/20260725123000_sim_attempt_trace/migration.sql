-- SimAttemptTrace: the student's own recorded drive, persisted (audit
-- 2026-07-24 — I-2 „Твоят дубъл": the reel renderer already accepts any
-- ScenarioTrace; what was missing was a trace that outlived the browser tab).
--
-- Its own table, not a column on SimSession: the session row is read on every
-- history screen and progression fold, and none of them want the kinematics in
-- the same tuple. It also lets retention prune the blob while the graded
-- record (score, event log, debrief) stays.
--
-- `gz` is gzip(JSON(ScenarioTrace)) of an already-reduced trace (10 Hz, cm
-- precision, <=1200 samples) — ~15 KB for a full drill.
--
-- ADR-004: kinematics of a fictional car are not PII, but they are keyed to a
-- user — so they die with the SESSION and with the USER (both ON DELETE
-- CASCADE), and only the newest few per user survive a write.

-- CreateTable
CREATE TABLE "SimAttemptTrace" (
    "simSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "gz" BYTEA NOT NULL,

    CONSTRAINT "SimAttemptTrace_pkey" PRIMARY KEY ("simSessionId")
);

-- CreateIndex
CREATE INDEX "SimAttemptTrace_userId_recordedAt_idx" ON "SimAttemptTrace"("userId", "recordedAt");

-- AddForeignKey
ALTER TABLE "SimAttemptTrace" ADD CONSTRAINT "SimAttemptTrace_simSessionId_fkey" FOREIGN KEY ("simSessionId") REFERENCES "SimSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimAttemptTrace" ADD CONSTRAINT "SimAttemptTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
