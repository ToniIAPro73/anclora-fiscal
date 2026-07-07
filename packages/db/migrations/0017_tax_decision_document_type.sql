-- FASE 3: tipo documental decidido por el motor fiscal.
-- Aditiva y compatible: las decisiones antiguas se tratan como factura completa.

ALTER TABLE "tax_decisions" ADD COLUMN "document_type" text NOT NULL DEFAULT 'COMPLETA';
