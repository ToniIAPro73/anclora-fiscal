-- SHOPIFY-03: additive tables for payment-settlement evidence, persisted
-- confirm-time-only via FiscalPersistencePort.persistFiscalRecords (mirrors
-- the additive convention established in 0011/0012/0013 -- no backfill, no
-- rename, no destructive change; do not modify any prior migration file).
--
-- Linkage-field finding (re-verified from packages/connectors/src/
-- shopify-order-transactions-csv.ts and shopify-payments-ledger-csv.ts):
-- the order-transactions CSV carries a real numeric Shopify "Order" id
-- (e.g. 9000000000001) DISTINCT from "Name" (e.g. AI-1001). commercial_orders
-- .external_order_id (SHOPIFY-02) is backed exclusively by Name-style
-- values -- there is no internal numeric id anywhere in the Orders export
-- for the numeric Order id to join against. Therefore `shopify_order_name`
-- (the Name field) is the real join key on BOTH tables below;
-- `shopify_order_id` stores the raw numeric Order value verbatim for
-- evidentiary completeness only and carries no FK meaning.

CREATE TABLE IF NOT EXISTS "shopify_order_payment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "import_file_id" uuid NOT NULL REFERENCES "import_files"("id"),
  "external_event_key" text NOT NULL,
  "commercial_order_id" uuid REFERENCES "commercial_orders"("id"),
  "shopify_order_id" text NOT NULL,
  "shopify_order_name" text NOT NULL,
  "kind" text NOT NULL,
  "gateway" text NOT NULL,
  "status" text NOT NULL,
  "amount" numeric(20, 6) NOT NULL,
  "currency" text NOT NULL,
  "card_type" text,
  "payment_method" text,
  "occurred_at" timestamptz NOT NULL,
  "source_row_number" integer,
  "minimized_snapshot" jsonb NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS "shopify_order_payment_events_tenant_key_uq"
  ON "shopify_order_payment_events" ("tenant_id", "external_event_key");
CREATE INDEX IF NOT EXISTS "shopify_order_payment_events_tenant_order_name_idx"
  ON "shopify_order_payment_events" ("tenant_id", "shopify_order_name");
CREATE INDEX IF NOT EXISTS "shopify_order_payment_events_tenant_commercial_order_idx"
  ON "shopify_order_payment_events" ("tenant_id", "commercial_order_id");

CREATE TABLE IF NOT EXISTS "shopify_payments_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "import_file_id" uuid NOT NULL REFERENCES "import_files"("id"),
  "external_entry_key" text NOT NULL,
  "commercial_order_id" uuid REFERENCES "commercial_orders"("id"),
  "shopify_order_name" text NOT NULL,
  "checkout_reference" text,
  "entry_type" text NOT NULL,
  "amount" numeric(20, 6) NOT NULL,
  "fee_amount" numeric(20, 6) NOT NULL,
  "net_amount" numeric(20, 6) NOT NULL,
  "currency" text NOT NULL,
  "presentment_amount" numeric(20, 6),
  "presentment_currency" text,
  -- Stored as-is for evidence only -- MUST NOT be read by any fiscal-decision
  -- code path (there isn't one yet; this comment documents the constraint so
  -- a future feature doesn't accidentally wire it in).
  "platform_vat_amount" numeric(20, 6),
  "card_brand" text,
  "card_source" text,
  "payment_method" text,
  "payout_status" text NOT NULL,
  "payout_date" date,
  "available_on" date,
  "external_payout_id" text,
  "source_row_number" integer,
  "minimized_snapshot" jsonb NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS "shopify_payments_ledger_entries_tenant_key_uq"
  ON "shopify_payments_ledger_entries" ("tenant_id", "external_entry_key");
CREATE INDEX IF NOT EXISTS "shopify_payments_ledger_entries_tenant_order_name_idx"
  ON "shopify_payments_ledger_entries" ("tenant_id", "shopify_order_name");
CREATE INDEX IF NOT EXISTS "shopify_payments_ledger_entries_tenant_commercial_order_idx"
  ON "shopify_payments_ledger_entries" ("tenant_id", "commercial_order_id");
