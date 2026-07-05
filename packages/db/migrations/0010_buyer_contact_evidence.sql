-- Nullable buyer-contact evidence columns, parsed from real, standard
-- Shopify orders-export columns (Email, Billing/Shipping Address1/City/
-- Zip/Province) — not fabricated. commercial_orders captures the raw
-- evidence at ingestion time; canonical_operations carries it forward so
-- the invoice-issuance service doesn't need to re-join back to the source
-- order. Nullable by design — older/customized exports may not carry these
-- columns, same honest-missing-evidence philosophy as 0008/0009.
--
-- No buyer tax ID (NIF/CIF) column is added here — that is not a standard
-- Shopify export column and would require a custom checkout field this
-- connector has no way to read. Documented, disclosed limitation, not a
-- workaround-able gap (see packages/core/src/invoicing.ts render-site comment).
ALTER TABLE "commercial_orders" ADD COLUMN "customer_email" text;
ALTER TABLE "commercial_orders" ADD COLUMN "customer_address" text;

ALTER TABLE "canonical_operations" ADD COLUMN "customer_email" text;
ALTER TABLE "canonical_operations" ADD COLUMN "customer_address" text;
