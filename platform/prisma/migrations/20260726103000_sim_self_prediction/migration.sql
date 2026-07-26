-- SimSelfPrediction: the „Позна ли се?" calibration gate (doc 82 §5.3 I1).
--
-- One row = one drive the student predicted the official result of BEFORE the
-- debrief unlocked, paired with what the rule engine actually scored. Novice
-- overestimation is a documented crash mechanism, and self-assessment
-- calibration is one of the only mechanics in driver education with a positive
-- evidence base (doc 82 §5.1).
--
-- Its own table, not two columns on SimSession: that row is read on every
-- history screen and progression fold and does not want the calibration, and
-- keeping it separate leaves the graded record untouched after grading.
--
-- The ACTUALS are copied in rather than joined, deliberately: a later detector
-- fix must not silently rewrite the belief a student was measured against
-- (same rule as ExamOutcomeReport.readinessScore).
--
-- ADR-004: integers and booleans about a fictional drive — no PII. Dies with
-- the SESSION and with the USER (both ON DELETE CASCADE).

-- CreateTable
CREATE TABLE "SimSelfPrediction" (
    "simSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "predictedPoints" INTEGER NOT NULL,
    "predictedPass" BOOLEAN NOT NULL,
    "actualPoints" INTEGER NOT NULL,
    "actualPass" BOOLEAN NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimSelfPrediction_pkey" PRIMARY KEY ("simSessionId")
);

-- CreateIndex
CREATE INDEX "SimSelfPrediction_userId_recordedAt_idx" ON "SimSelfPrediction"("userId", "recordedAt");

-- AddForeignKey
ALTER TABLE "SimSelfPrediction" ADD CONSTRAINT "SimSelfPrediction_simSessionId_fkey" FOREIGN KEY ("simSessionId") REFERENCES "SimSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimSelfPrediction" ADD CONSTRAINT "SimSelfPrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
