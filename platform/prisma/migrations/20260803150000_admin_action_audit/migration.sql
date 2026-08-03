-- The /admin support surface: an audit ledger and the free-exam grant counter.
--
-- EXPAND ONLY (tools/deploy/README.md, "Expand / contract"). Everything here
-- ADDS: one new table, one new column with a NOT NULL DEFAULT — which is a
-- catalogue-only change on Postgres 11+, so it does not rewrite the User table
-- and is safe at any row count. Nothing is dropped, nothing is narrowed, no
-- existing column is made NOT NULL. The build running when this applies keeps
-- working, which is what makes the deploy's rollback a real option rather than
-- a theory.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "freeExamGrants" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subjectId" TEXT,
    "targetRef" TEXT,
    "reason" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAction_subjectId_createdAt_idx" ON "AdminAction"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAction_actorId_createdAt_idx" ON "AdminAction"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
