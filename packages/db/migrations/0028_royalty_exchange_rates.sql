CREATE TABLE IF NOT EXISTS "royalty_exchange_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "source" text NOT NULL, "rate_date" date NOT NULL, "base_currency" text NOT NULL, "quote_currency" text NOT NULL DEFAULT 'EUR',
  "rate" numeric(20,10) NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "royalty_exchange_rates_scope_uq" ON "royalty_exchange_rates"("tenant_id","source","rate_date","base_currency","quote_currency");
