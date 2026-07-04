-- Nullable commercial-order evidence columns captured from Shopify's real
-- Total/Taxes/name export columns (genuine source data, not fabricated).
-- Nullable by design — older/customized exports may not carry these columns.
ALTER TABLE "commercial_orders" ADD COLUMN "customer_name" text;
ALTER TABLE "commercial_orders" ADD COLUMN "total_amount" numeric(20, 6);
ALTER TABLE "commercial_orders" ADD COLUMN "tax_amount" numeric(20, 6);
