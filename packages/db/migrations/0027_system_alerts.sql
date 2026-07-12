ALTER TABLE "sif_events" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "sif_events_tenant_idempotency_uq"
  ON "sif_events" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "system_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "severity" text NOT NULL,
  "type" text NOT NULL,
  "source" text NOT NULL,
  "detail" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'OPEN',
  "deduplication_key" text NOT NULL,
  "opened_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid REFERENCES "users"("id"),
  "resolution" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "system_alerts_open_dedup_uq"
  ON "system_alerts" ("tenant_id", "deduplication_key") WHERE "status" = 'OPEN';
CREATE INDEX IF NOT EXISTS "system_alerts_tenant_status_idx"
  ON "system_alerts" ("tenant_id", "status", "severity", "opened_at");
