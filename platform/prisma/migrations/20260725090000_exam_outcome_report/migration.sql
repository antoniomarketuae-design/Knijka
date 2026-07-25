-- Transfer measurement (audit M-4 / I-5): the reported real ДАИ outcome paired
-- with the readiness score the product had predicted. Consent-based, minimal
-- by construction — outcome + day + our own prediction, no free text.
--
-- "examOn" is DATE (not TIMESTAMP): day precision cannot place a minor at a
-- location at a given hour, and the calibration does not need more.

-- CreateTable
CREATE TABLE "ExamOutcomeReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "examOn" DATE NOT NULL,
    "readinessScore" INTEGER NOT NULL,
    "mockAttempts" INTEGER NOT NULL,
    "bestMockScore" INTEGER,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamOutcomeReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamOutcomeReport_userId_examOn_idx" ON "ExamOutcomeReport"("userId", "examOn");

-- CreateIndex
CREATE INDEX "ExamOutcomeReport_kind_examOn_idx" ON "ExamOutcomeReport"("kind", "examOn");

-- CreateIndex: one report per sitting — a re-submit corrects, never duplicates.
CREATE UNIQUE INDEX "ExamOutcomeReport_userId_kind_examOn_key" ON "ExamOutcomeReport"("userId", "kind", "examOn");

-- AddForeignKey
ALTER TABLE "ExamOutcomeReport" ADD CONSTRAINT "ExamOutcomeReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
