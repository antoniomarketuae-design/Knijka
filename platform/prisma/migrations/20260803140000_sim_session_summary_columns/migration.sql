-- Audit 2026-08-03 — /simulator stops reading every rule event a student has
-- ever generated.
--
-- THE BUG. modules/sim/lessons/store.ts listSessions() selected `events: true`
-- with no `take`, for every session the user had ever driven, on the /simulator
-- page load AND again inside every finishLessonAction. The events payload is
-- the full chronological rule-event log, and each ViolationEvent carries its
-- own titleBg + explanationBg — ~430 bytes of Bulgarian prose per event,
-- denormalised into the row even though the same strings already live in the
-- rule catalogue in code. A premium student at ~350 sessions therefore pulled
-- several megabytes out of TOAST, de-compressed it, JSON.parsed it in Node —
-- and used it to answer two questions: did this drive pass, and how many rubric
-- stars did it earn.
--
-- THE FIX. Those two answers become columns, and the list stops selecting the
-- blob. This is the same shape as SimAttemptTrace, which already keeps
-- durationSec and sampleCount beside the row precisely "so a list never inflates
-- a blob" and whose list() never selects `gz`.
--
-- `events` remains authoritative and is not touched. These columns are a
-- projection of it for the two callers that only need the summary; the history
-- screen and the debrief still read the real payload through
-- listRecentSessions().
--
-- EXPAND ONLY, like the migration before it: two nullable columns and a
-- backfill. Every currently-deployed build keeps working — it simply ignores
-- them — so a rollback that restores CODE without restoring SCHEMA is still a
-- working product.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------
-- Nullable, and not just because ADD COLUMN NOT NULL would need a default: a
-- SimSession row is written once, at finish, and `rubricStars` genuinely does
-- not exist for anything that is not a scenario drive. NULL means "this drive
-- has no such fact", which is the truth, and is what listSessions maps back to
-- passed=false / rubricStars=null.
ALTER TABLE "SimSession" ADD COLUMN "passed" BOOLEAN;
ALTER TABLE "SimSession" ADD COLUMN "rubricStars" INTEGER;

-- ---------------------------------------------------------------------------
-- 2. Backfill from the payload that has been carrying these facts until now
-- ---------------------------------------------------------------------------
-- Without this every historical drive would read back as "not passed, no
-- stars", which is not a cosmetic loss: the progression fold in
-- lessons/progress.ts unlocks the catalogue from `passed`, and
-- scenario/progress.ts unlocks levels from `rubricStars`. A student who had
-- earned their way through the catalogue would find it locked again.
--
-- Every predicate mirrors parseSimSessionEvents() exactly — same version gate,
-- same type checks, same strict 1|2|3 membership for the stars — so a payload
-- the code refuses to trust is not trusted here either, and lands as NULL. A
-- foreign or corrupt blob can never abort the migration: jsonb_typeof() is
-- total, and no cast runs on a value it has not already classified.
UPDATE "SimSession"
SET
  "passed" = CASE
    WHEN jsonb_typeof("events" -> 'passed') = 'boolean'
      THEN ("events" ->> 'passed')::boolean
  END,
  "rubricStars" = CASE
    WHEN jsonb_typeof("events" -> 'rubricStars') = 'number'
     AND ("events" ->> 'rubricStars') IN ('1', '2', '3')
      THEN ("events" ->> 'rubricStars')::integer
  END
WHERE "events" IS NOT NULL
  AND jsonb_typeof("events") = 'object'
  AND ("events" ->> 'version') = '1';
