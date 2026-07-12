-- FASE 15 (VERI*FACTU hardening): full-invoice-on-request flow. Links a
-- fiscal_documents row to the fiscal_counterparties buyer captured for it —
-- only populated for COMPLETA documents issued via the explicit
-- buyer-request path (never inferred from email/country/company).
ALTER TABLE "fiscal_documents"
  ADD COLUMN IF NOT EXISTS "counterparty_id" uuid REFERENCES "fiscal_counterparties"("id");
