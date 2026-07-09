CREATE TABLE IF NOT EXISTS "verifactu_submission_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "verifactu_submission_id" uuid NOT NULL REFERENCES "verifactu_submissions"("id"),
  "attempt_number" numeric(8, 0) NOT NULL,
  "status" text NOT NULL,
  "response_redacted" jsonb NOT NULL,
  "attempted_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "verifactu_submission_attempts_number_uq"
  ON "verifactu_submission_attempts" ("tenant_id", "verifactu_submission_id", "attempt_number");

CREATE INDEX IF NOT EXISTS "verifactu_submission_attempts_submission_idx"
  ON "verifactu_submission_attempts" ("tenant_id", "verifactu_submission_id");

CREATE INDEX IF NOT EXISTS "verifactu_submission_attempts_time_idx"
  ON "verifactu_submission_attempts" ("tenant_id", "attempted_at");
