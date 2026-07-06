-- SHOPIFY-02: additive columns to support multi-line Shopify order grouping
-- and line-item traceability. No backfill, no rename, no destructive change
-- -- mirrors the additive convention established in 0011/0012 (do not
-- modify either of those files).
--
-- commercial_orders: raw reported/reconciliation fields distinct from the
-- already-existing canonical fields (totalAmount/taxAmount/paymentStatus
-- remain the reconciled/canonical columns; these are the raw as-reported
-- Shopify order attributes plus import-file traceability).
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "financial_status" text;
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "fulfillment_status" text;
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "paid_at" timestamptz;
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "fulfilled_at" timestamptz;
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz;
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "discount_code" text;
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(20, 6);
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "shipping_amount" numeric(20, 6);
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "reported_subtotal_amount" numeric(20, 6);
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "reported_total_amount" numeric(20, 6);
ALTER TABLE "commercial_orders" ADD COLUMN IF NOT EXISTS "source_import_file_id" uuid REFERENCES "import_files"("id");

-- order_lines: line-level traceability for rows whose Shopify export lacks a
-- real Lineitem ID (documented in shopify-orders-csv.ts -- the fingerprint is
-- NOT an official Shopify identifier), plus reported (pre-reconciliation)
-- tax fields mirroring reportedTaxLabel/reportedTaxRate on commercial_orders.
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "source_line_fingerprint" text;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "source_row_number" integer;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "requires_shipping" boolean;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "taxable" boolean;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "reported_tax_label" text;
ALTER TABLE "order_lines" ADD COLUMN IF NOT EXISTS "reported_tax_rate" numeric(10, 6);
