-- FASE 14 (VERI*FACTU hardening): hash-chained SIF (Sistema Informático de
-- Facturación) event log, distinct from the plain `audit_events` table.
-- Each row is chained via previous_hash -> hash the same way
-- `integrity_chain_records` chains fiscal documents (see
-- packages/core/src/sif-events.ts), scoped per tenant.
CREATE TABLE IF NOT EXISTS "sif_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "event_type" text NOT NULL,
  "actor" text NOT NULL,
  "detail" jsonb NOT NULL DEFAULT '{}',
  "canonical_payload" text NOT NULL,
  "hash" text NOT NULL,
  "previous_hash" text,
  "algorithm" text NOT NULL DEFAULT 'SHA-256',
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sif_events_tenant_hash_uq"
  ON "sif_events" ("tenant_id", "hash");

CREATE INDEX IF NOT EXISTS "sif_events_tenant_time_idx"
  ON "sif_events" ("tenant_id", "occurred_at");
