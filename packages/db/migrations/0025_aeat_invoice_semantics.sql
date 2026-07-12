ALTER TABLE legal_entities
  ADD COLUMN IF NOT EXISTS simplified_invoice_general_limit numeric(12, 2) NOT NULL DEFAULT 400,
  ADD COLUMN IF NOT EXISTS simplified_invoice_special_limit numeric(12, 2) NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS simplified_invoice_special_regime_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS simplified_invoice_special_regime_evidence text;

COMMENT ON COLUMN legal_entities.simplified_invoice_special_regime_enabled IS
  'Requires explicit fiscal-advisor validation and supporting evidence before applying special limit.';
