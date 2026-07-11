-- FASE 5 (VERI*FACTU hardening): ordered retries with a minimum cadence.
-- `next_attempt_at` is set whenever a submission moves to RETRY_SCHEDULED
-- (a technical error, see resolveVerifactuPersistedOutcome in verifactu.ts)
-- and is null for every other status. `last_error` records the last
-- technical-error or rejection message for operator visibility; it is not
-- cleared automatically on a later successful attempt.
ALTER TABLE "verifactu_submissions"
  ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_error" text;

CREATE INDEX IF NOT EXISTS "verifactu_submissions_next_attempt_idx"
  ON "verifactu_submissions" ("tenant_id", "status", "next_attempt_at");
