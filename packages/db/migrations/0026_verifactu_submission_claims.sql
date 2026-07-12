ALTER TABLE verifactu_submissions
  ADD COLUMN IF NOT EXISTS processing_lock_token text,
  ADD COLUMN IF NOT EXISTS processing_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_lock_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS verifactu_submissions_claim_idx
  ON verifactu_submissions(status, processing_lock_expires_at, next_attempt_at);
