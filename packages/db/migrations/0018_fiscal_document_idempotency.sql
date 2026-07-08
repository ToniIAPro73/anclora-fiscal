-- FASE 6: idempotencia documental fiscal por operación y tipo.
-- Aditiva y compatible: evita duplicar documentos para la misma operación y tipo documental.

CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_document_operation_type_uq"
ON "fiscal_documents" ("tenant_id", "canonical_operation_id", "document_type");
