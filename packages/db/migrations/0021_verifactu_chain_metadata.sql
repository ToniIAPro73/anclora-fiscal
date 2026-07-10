-- FASE 2 (VERI*FACTU hardening): persist the official AEAT record chain
-- for real, instead of depending on .env or manual memory for chaining.
-- Aditiva y compatible: el encadenamiento interno existente
-- (previous_hash/hash en integrity_chain_records) no se toca y sigue
-- sirviendo como evidencia adicional. Estas columnas registran exactamente
-- lo que AEAT exige para encadenar (IDEmisorFactura, NumSerieFactura,
-- FechaExpedicionFactura, TipoFactura, Huella, FechaHoraHusoGenRegistro,
-- Huella del registro anterior, referencia al documento anterior, estado de
-- encadenamiento y CSV/referencia AEAT cuando exista).

ALTER TABLE "integrity_chain_records" ADD COLUMN "legal_entity_id" uuid REFERENCES "legal_entities"("id");
ALTER TABLE "integrity_chain_records" ADD COLUMN "software_installation_number" text;
ALTER TABLE "integrity_chain_records" ADD COLUMN "aeat_id_emisor_factura" text;
ALTER TABLE "integrity_chain_records" ADD COLUMN "aeat_num_serie_factura" text;
ALTER TABLE "integrity_chain_records" ADD COLUMN "aeat_fecha_expedicion_factura" date;
ALTER TABLE "integrity_chain_records" ADD COLUMN "aeat_tipo_factura" text;
ALTER TABLE "integrity_chain_records" ADD COLUMN "aeat_huella" text;
ALTER TABLE "integrity_chain_records" ADD COLUMN "aeat_huella_generated_at" timestamptz;
ALTER TABLE "integrity_chain_records" ADD COLUMN "aeat_previous_huella" text;
ALTER TABLE "integrity_chain_records" ADD COLUMN "previous_fiscal_document_id" uuid REFERENCES "fiscal_documents"("id");
ALTER TABLE "integrity_chain_records" ADD COLUMN "chain_status" text NOT NULL DEFAULT 'PENDING';
ALTER TABLE "integrity_chain_records" ADD COLUMN "aeat_csv" text;

-- Backfill legal_entity_id for pre-existing rows via canonical_operations,
-- the only place legal_entity_id currently lives in this chain
-- (fiscal_documents -> canonical_operations -> legal_entities). Guarded by
-- "IS NULL" so re-running the same migration file twice (the offline PGlite
-- test runner applies each migration inside its own transaction, tracked by
-- checksum in _anclora_migrations) is a no-op the second time.
UPDATE "integrity_chain_records" AS icr
SET "legal_entity_id" = co."legal_entity_id"
FROM "fiscal_documents" AS fd
JOIN "canonical_operations" AS co ON co."id" = fd."canonical_operation_id"
WHERE fd."id" = icr."fiscal_document_id"
  AND icr."legal_entity_id" IS NULL;

CREATE INDEX IF NOT EXISTS "integrity_chain_records_chain_scope_idx"
  ON "integrity_chain_records" ("tenant_id", "legal_entity_id", "software_installation_number");
