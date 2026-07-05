-- FASE 02: additive fiscal configuration and data foundation.
-- Existing nullable rows remain valid; readiness is enforced by application logic.

ALTER TABLE "legal_entities" ADD COLUMN "trade_name" text;
ALTER TABLE "legal_entities" ADD COLUMN "address" text;
ALTER TABLE "legal_entities" ADD COLUMN "contact_email" text;
ALTER TABLE "legal_entities" ADD COLUMN "configuration_status" text NOT NULL DEFAULT 'INCOMPLETE';

ALTER TABLE "invoice_series" ADD COLUMN "fiscal_year" integer;
ALTER TABLE "invoice_series" ADD COLUMN "active" boolean NOT NULL DEFAULT true;
ALTER TABLE "invoice_series" ADD COLUMN "locked" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "invoice_series_tenant_year_type_uq"
  ON "invoice_series" ("tenant_id", "legal_entity_id", "fiscal_year", "document_type", "code");

ALTER TABLE "commercial_orders" ADD COLUMN "billing_country" text;
ALTER TABLE "commercial_orders" ADD COLUMN "shipping_country" text;
ALTER TABLE "commercial_orders" ADD COLUMN "reported_tax_label" text;
ALTER TABLE "commercial_orders" ADD COLUMN "reported_tax_rate" numeric(10,6);
ALTER TABLE "commercial_orders" ADD COLUMN "payment_status" text NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "commercial_orders" ADD COLUMN "refund_status" text NOT NULL DEFAULT 'NONE';
ALTER TABLE "commercial_orders" ADD COLUMN "fiscal_status" text NOT NULL DEFAULT 'PENDING';
ALTER TABLE "commercial_orders" ADD COLUMN "customer_type_evidence_status" text NOT NULL DEFAULT 'UNKNOWN';

ALTER TABLE "royalty_statements" ADD COLUMN "accounting_policy" text NOT NULL DEFAULT 'NET_ROYALTY_ONLY';
ALTER TABLE "royalty_statements" ADD COLUMN "embedded_cost_treatment" text NOT NULL DEFAULT 'INCLUDED_IN_NET';
ALTER TABLE "royalty_statements" ADD COLUMN "status" text NOT NULL DEFAULT 'IMPORTED';

CREATE TABLE "product_tax_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "legal_entity_id" uuid NOT NULL REFERENCES "legal_entities"("id"),
  "selector" text NOT NULL,
  "product_nature" text NOT NULL,
  "invoice_description" text NOT NULL,
  "domestic_tax_code" text NOT NULL,
  "domestic_tax_rate" numeric(10,6) NOT NULL,
  "oss_eligible" boolean NOT NULL DEFAULT false,
  "shipping_required" boolean NOT NULL DEFAULT false,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "active" boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "product_tax_profiles_selector_uq"
  ON "product_tax_profiles" ("tenant_id", "legal_entity_id", "selector", "effective_from");
CREATE INDEX "product_tax_profiles_active_idx"
  ON "product_tax_profiles" ("tenant_id", "active", "effective_from");

CREATE TABLE "channel_fiscal_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "channel" text NOT NULL,
  "version" text NOT NULL,
  "effective_from" date NOT NULL,
  "kdp_accounting_policy" text NOT NULL DEFAULT 'NET_ROYALTY_ONLY',
  "embedded_cost_treatment" text NOT NULL DEFAULT 'INCLUDED_IN_NET',
  "review_level" text NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "issuer_attributes" jsonb NOT NULL DEFAULT '{}',
  "active" boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "channel_fiscal_policies_version_uq"
  ON "channel_fiscal_policies" ("tenant_id", "channel", "version");

CREATE TABLE "fiscal_counterparties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "display_name" text NOT NULL,
  "legal_name" text,
  "company_name" text,
  "email_encrypted" text,
  "billing_address_encrypted" text,
  "shipping_address_encrypted" text,
  "customer_type" text NOT NULL DEFAULT 'UNKNOWN',
  "tax_identity_encrypted" text,
  "validation_status" text NOT NULL DEFAULT 'UNVALIDATED',
  "validated_at" timestamptz,
  "validation_source" text,
  "evidence_document_id" uuid REFERENCES "evidence_documents"("id")
);
CREATE INDEX "fiscal_counterparties_tenant_type_idx"
  ON "fiscal_counterparties" ("tenant_id", "customer_type");

CREATE TABLE "order_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "commercial_order_id" uuid NOT NULL REFERENCES "commercial_orders"("id") ON DELETE CASCADE,
  "external_line_id" text,
  "sku" text,
  "title" text NOT NULL,
  "quantity" numeric(12,0) NOT NULL,
  "unit_price" numeric(20,6) NOT NULL,
  "discount_amount" numeric(20,6) NOT NULL DEFAULT 0,
  "subtotal_amount" numeric(20,6) NOT NULL,
  "reported_tax_amount" numeric(20,6),
  "product_tax_profile_id" uuid REFERENCES "product_tax_profiles"("id"),
  "tax_profile_snapshot" jsonb NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX "order_lines_external_uq"
  ON "order_lines" ("tenant_id", "commercial_order_id", "external_line_id");
CREATE INDEX "order_lines_order_idx" ON "order_lines" ("commercial_order_id");

CREATE TABLE "tax_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "period_type" text NOT NULL,
  "label" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "closed_at" timestamptz,
  "reopened_at" timestamptz,
  CONSTRAINT "tax_periods_valid_range" CHECK ("end_date" >= "start_date")
);
CREATE UNIQUE INDEX "tax_periods_range_uq"
  ON "tax_periods" ("tenant_id", "period_type", "start_date", "end_date");

CREATE TABLE "payouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "channel" text NOT NULL,
  "external_payout_id" text NOT NULL,
  "period_start" date,
  "period_end" date,
  "currency" text NOT NULL,
  "gross_amount" numeric(20,6),
  "fee_amount" numeric(20,6),
  "net_amount" numeric(20,6) NOT NULL,
  "status" text NOT NULL DEFAULT 'IMPORTED'
);
CREATE UNIQUE INDEX "payouts_external_uq"
  ON "payouts" ("tenant_id", "channel", "external_payout_id");

CREATE TABLE "payout_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "payout_id" uuid NOT NULL REFERENCES "payouts"("id") ON DELETE CASCADE,
  "commercial_order_id" uuid REFERENCES "commercial_orders"("id"),
  "royalty_statement_id" uuid REFERENCES "royalty_statements"("id"),
  "allocated_amount" numeric(20,6) NOT NULL,
  "allocation_status" text NOT NULL DEFAULT 'PROPOSED'
);
CREATE INDEX "payout_allocations_payout_idx" ON "payout_allocations" ("tenant_id", "payout_id");
