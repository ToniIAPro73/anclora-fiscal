-- SHOPIFY-05: explicit, explainable relationships between Shopify evidence.
-- This table is deliberately separate from legacy matching_candidates: links
-- here never create canonical operations, tax decisions, invoices or bank
-- reconciliation as a side effect.

ALTER TABLE "shopify_payments_ledger_entries"
  ADD COLUMN IF NOT EXISTS "transaction_at" timestamptz;

CREATE TABLE IF NOT EXISTS "shopify_evidence_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "left_evidence_type" text NOT NULL,
  "left_evidence_id" uuid NOT NULL,
  "right_evidence_type" text NOT NULL,
  "right_evidence_id" uuid NOT NULL,
  "link_type" text NOT NULL,
  "confidence" numeric(5, 4) NOT NULL,
  "state" text NOT NULL,
  "explanation_json" jsonb NOT NULL DEFAULT '{}',
  "created_by" uuid REFERENCES "users"("id"),
  "decided_by" uuid REFERENCES "users"("id"),
  "decided_at" timestamptz,
  CONSTRAINT "shopify_evidence_links_confidence_check"
    CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "shopify_evidence_links_state_check"
    CHECK ("state" IN ('PROPOSED', 'AUTO_LINKED', 'CONFIRMED', 'REJECTED')),
  CONSTRAINT "shopify_evidence_links_type_check"
    CHECK (
      "left_evidence_type" IN ('COMMERCIAL_ORDER', 'ORDER_TRANSACTION')
      AND "right_evidence_type" IN ('ORDER_TRANSACTION', 'LEDGER_ENTRY')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "shopify_evidence_links_pair_uq"
  ON "shopify_evidence_links" (
    "tenant_id", "link_type", "left_evidence_type", "left_evidence_id",
    "right_evidence_type", "right_evidence_id"
  );
CREATE INDEX IF NOT EXISTS "shopify_evidence_links_tenant_state_idx"
  ON "shopify_evidence_links" ("tenant_id", "state", "created_at");
CREATE INDEX IF NOT EXISTS "shopify_evidence_links_left_idx"
  ON "shopify_evidence_links" ("tenant_id", "left_evidence_type", "left_evidence_id");
CREATE INDEX IF NOT EXISTS "shopify_evidence_links_right_idx"
  ON "shopify_evidence_links" ("tenant_id", "right_evidence_type", "right_evidence_id");

CREATE INDEX IF NOT EXISTS "shopify_payments_ledger_entries_tenant_transaction_idx"
  ON "shopify_payments_ledger_entries" ("tenant_id", "transaction_at");
