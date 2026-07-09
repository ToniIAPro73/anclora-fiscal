CREATE UNIQUE INDEX IF NOT EXISTS "verifactu_submissions_integrity_record_uq"
  ON "verifactu_submissions" ("tenant_id", "integrity_record_id");
