-- Limpia una importacion de pedidos Shopify desde Neon SQL.
--
-- Uso:
-- 1. Cambia tenant_slug si necesitas otro tenant.
-- 2. Ejecuta el script completo en Neon SQL.
--
-- Alcance:
-- - Borra import_jobs/import_files/import_errors/import_rows del conector de pedidos Shopify.
-- - Borra commercial_orders y order_lines Shopify creados por esa carga.
-- - Borra canonical_operations, tax_decisions, issues y fiscal_documents derivados de esos pedidos.
-- - Conserva transacciones y movimientos Shopify Payments, pero elimina su enlace al pedido borrado.
-- - No borra objetos Blob; Neon SQL solo limpia la base de datos.

BEGIN;

CREATE TEMP TABLE cleanup_params ON COMMIT DROP AS
SELECT 'anclora-insights'::text AS tenant_slug;

CREATE TEMP TABLE cleanup_tenant ON COMMIT DROP AS
SELECT t.id AS tenant_id
FROM tenants t
JOIN cleanup_params p ON p.tenant_slug = t.slug;

CREATE TEMP TABLE cleanup_jobs ON COMMIT DROP AS
SELECT j.id
FROM import_jobs j
JOIN cleanup_tenant t ON t.tenant_id = j.tenant_id
WHERE j.connector_id IN ('shopify-orders', 'shopify-orders-csv');

CREATE TEMP TABLE cleanup_files ON COMMIT DROP AS
SELECT f.id
FROM import_files f
JOIN cleanup_jobs j ON j.id = f.import_job_id;

-- Algunas versiones antiguas no rellenaban source_import_file_id en commercial_orders.
-- Por eso el fallback borra todos los pedidos Shopify del tenant cuando no tienen archivo origen.
CREATE TEMP TABLE cleanup_orders ON COMMIT DROP AS
SELECT co.id, co.external_order_id
FROM commercial_orders co
JOIN cleanup_tenant t ON t.tenant_id = co.tenant_id
WHERE co.source_channel = 'SHOPIFY'
  AND (
    co.source_import_file_id IN (SELECT id FROM cleanup_files)
    OR co.source_import_file_id IS NULL
  );

CREATE TEMP TABLE cleanup_operations ON COMMIT DROP AS
SELECT op.id
FROM canonical_operations op
JOIN cleanup_tenant t ON t.tenant_id = op.tenant_id
JOIN cleanup_orders co ON co.external_order_id = op.source_order_id
WHERE op.source_channel = 'SHOPIFY';

CREATE TEMP TABLE cleanup_documents ON COMMIT DROP AS
WITH RECURSIVE docs AS (
  SELECT fd.id
  FROM fiscal_documents fd
  JOIN cleanup_operations op ON op.id = fd.canonical_operation_id
  UNION
  SELECT child.id
  FROM fiscal_documents child
  JOIN docs parent ON parent.id = child.original_document_id
)
SELECT id FROM docs;

CREATE TEMP TABLE cleanup_evidence_documents ON COMMIT DROP AS
SELECT ed.id
FROM evidence_documents ed
JOIN cleanup_files f ON f.id = ed.import_file_id;

WITH deleted AS (
  DELETE FROM integrity_chain_records
  WHERE fiscal_document_id IN (SELECT id FROM cleanup_documents)
  RETURNING 1
)
SELECT 'integrity_chain_records' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM audit_events
  WHERE entity_id IN (
    SELECT id::text FROM cleanup_documents
    UNION SELECT id::text FROM cleanup_operations
    UNION SELECT id::text FROM cleanup_orders
    UNION SELECT id::text FROM cleanup_jobs
    UNION SELECT id::text FROM cleanup_files
  )
  RETURNING 1
)
SELECT 'audit_events' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM issues
  WHERE canonical_operation_id IN (SELECT id FROM cleanup_operations)
  RETURNING 1
)
SELECT 'issues' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM tax_decisions
  WHERE canonical_operation_id IN (SELECT id FROM cleanup_operations)
  RETURNING 1
)
SELECT 'tax_decisions' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM fiscal_documents
  WHERE id IN (SELECT id FROM cleanup_documents)
  RETURNING 1
)
SELECT 'fiscal_documents' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM canonical_operations
  WHERE id IN (SELECT id FROM cleanup_operations)
  RETURNING 1
)
SELECT 'canonical_operations' AS target, count(*) AS rows_deleted FROM deleted;

WITH updated AS (
  UPDATE shopify_order_payment_events
  SET commercial_order_id = NULL
  WHERE commercial_order_id IN (SELECT id FROM cleanup_orders)
  RETURNING 1
)
SELECT 'shopify_order_payment_events_unlinked' AS target, count(*) AS rows_updated FROM updated;

WITH updated AS (
  UPDATE shopify_payments_ledger_entries
  SET commercial_order_id = NULL
  WHERE commercial_order_id IN (SELECT id FROM cleanup_orders)
  RETURNING 1
)
SELECT 'shopify_payments_ledger_entries_unlinked' AS target, count(*) AS rows_updated FROM updated;

WITH updated AS (
  UPDATE payout_allocations
  SET commercial_order_id = NULL
  WHERE commercial_order_id IN (SELECT id FROM cleanup_orders)
  RETURNING 1
)
SELECT 'payout_allocations_unlinked' AS target, count(*) AS rows_updated FROM updated;

WITH deleted AS (
  DELETE FROM matching_candidates
  WHERE commercial_order_id IN (SELECT id FROM cleanup_orders)
  RETURNING 1
)
SELECT 'matching_candidates' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM order_lines
  WHERE commercial_order_id IN (SELECT id FROM cleanup_orders)
  RETURNING 1
)
SELECT 'order_lines' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM commercial_orders
  WHERE id IN (SELECT id FROM cleanup_orders)
  RETURNING 1
)
SELECT 'commercial_orders' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM evidence_documents
  WHERE id IN (SELECT id FROM cleanup_evidence_documents)
  RETURNING 1
)
SELECT 'evidence_documents' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM import_rows
  WHERE import_file_id IN (SELECT id FROM cleanup_files)
  RETURNING 1
)
SELECT 'import_rows' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM import_errors
  WHERE import_job_id IN (SELECT id FROM cleanup_jobs)
  RETURNING 1
)
SELECT 'import_errors' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM import_files
  WHERE id IN (SELECT id FROM cleanup_files)
  RETURNING 1
)
SELECT 'import_files' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM import_jobs
  WHERE id IN (SELECT id FROM cleanup_jobs)
  RETURNING 1
)
SELECT 'import_jobs' AS target, count(*) AS rows_deleted FROM deleted;

COMMIT;

-- Comprobacion posterior opcional:
SELECT 'import_jobs_shopify_orders' AS item, count(*) AS remaining
FROM import_jobs
WHERE connector_id IN ('shopify-orders', 'shopify-orders-csv')
UNION ALL
SELECT 'commercial_orders_shopify', count(*)
FROM commercial_orders
WHERE source_channel = 'SHOPIFY'
UNION ALL
SELECT 'canonical_operations_shopify', count(*)
FROM canonical_operations
WHERE source_channel = 'SHOPIFY';
