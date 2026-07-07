-- FASE 1: configuración fiscal real del emisor.
-- Migración aditiva: evoluciona legal_entities sin duplicar la fuente
-- persistente del emisor fiscal.

ALTER TABLE "legal_entities" ADD COLUMN "issuer_type" text NOT NULL DEFAULT 'PERSONA_FISICA';
ALTER TABLE "legal_entities" ADD COLUMN "iae_code" text;
ALTER TABLE "legal_entities" ADD COLUMN "vat_regime" text NOT NULL DEFAULT 'REGIMEN_REDUCIDO_LIBROS_ES';
ALTER TABLE "legal_entities" ADD COLUMN "irpf_settings" jsonb NOT NULL DEFAULT '{}';
ALTER TABLE "legal_entities" ADD COLUMN "oss_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "legal_entities" ADD COLUMN "oss_effective_from" date;
ALTER TABLE "legal_entities" ADD COLUMN "fiscal_configuration_status" text NOT NULL DEFAULT 'INCOMPLETA';
ALTER TABLE "legal_entities" ADD COLUMN "tax_identity_configured" boolean NOT NULL DEFAULT false;
