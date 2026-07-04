-- Nullable tax-decision evidence columns. commercial_orders captures the raw
-- evidence at ingestion time (parsed from the source export, may genuinely be
-- absent for older/customized exports); canonical_operations carries it
-- forward so the tax-decision service doesn't need to re-join back to the
-- source order. Nullable by design — missing evidence must surface as an
-- honest BLOCKED/MISSING_TAX_EVIDENCE tax decision, not a fabricated default.
ALTER TABLE "commercial_orders" ADD COLUMN "customer_country" text;
ALTER TABLE "commercial_orders" ADD COLUMN "customer_type" text;
ALTER TABLE "commercial_orders" ADD COLUMN "product_nature" text;

ALTER TABLE "canonical_operations" ADD COLUMN "customer_country" text;
ALTER TABLE "canonical_operations" ADD COLUMN "customer_type" text;
ALTER TABLE "canonical_operations" ADD COLUMN "product_nature" text;
