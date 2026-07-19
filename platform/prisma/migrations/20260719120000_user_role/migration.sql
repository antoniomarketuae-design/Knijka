-- User.role: internal access flag (student | admin). Admins bypass the
-- progression gates (level star-locks, lesson order, freemium caps) —
-- founder/test accounts. Not PII: no GDPR surface added.
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'student';
