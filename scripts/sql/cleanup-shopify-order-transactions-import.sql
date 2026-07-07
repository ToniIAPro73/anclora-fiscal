-- Limpia una importacion de transacciones de pedido Shopify desde Neon SQL.
--
-- Uso:
-- 1. Cambia tenant_slug si necesitas otro tenant.
-- 2. Ejecuta el script completo en Neon SQL.
--
-- Alcance:
-- - Borra import_jobs/import_files/import_errors/import_rows del conector de
--   transacciones de pedido Shopify.
-- - Borra shopify_order_payment_events creados por esa carga.
-- - Borra enlaces shopify_evidence_links que apunten a esas transacciones.
-- - Conserva commercial_orders y movimientos Shopify Payments.
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
WHERE j.connector_id IN ('shopify-order-transactions', 'shopify-order-transactions-csv');

CREATE TEMP TABLE cleanup_files ON COMMIT DROP AS
SELECT f.id
FROM import_files f
JOIN cleanup_jobs j ON j.id = f.import_job_id;

CREATE TEMP TABLE cleanup_order_transactions ON COMMIT DROP AS
SELECT pe.id
FROM shopify_order_payment_events pe
JOIN cleanup_files f ON f.id = pe.import_file_id;

CREATE TEMP TABLE cleanup_evidence_links ON COMMIT DROP AS
SELECT l.id
FROM shopify_evidence_links l
JOIN cleanup_tenant t ON t.tenant_id = l.tenant_id
WHERE (
    l.left_evidence_type = 'ORDER_TRANSACTION'
    AND l.left_evidence_id IN (SELECT id FROM cleanup_order_transactions)
  )
  OR (
    l.right_evidence_type = 'ORDER_TRANSACTION'
    AND l.right_evidence_id IN (SELECT id FROM cleanup_order_transactions)
  );

CREATE TEMP TABLE cleanup_evidence_documents ON COMMIT DROP AS
SELECT ed.id
FROM evidence_documents ed
JOIN cleanup_files f ON f.id = ed.import_file_id;

WITH deleted AS (
  DELETE FROM audit_events
  WHERE entity_id IN (
    SELECT id::text FROM cleanup_evidence_links
    UNION SELECT id::text FROM cleanup_order_transactions
    UNION SELECT id::text FROM cleanup_jobs
    UNION SELECT id::text FROM cleanup_files
  )
  RETURNING 1
)
SELECT 'audit_events' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM shopify_evidence_links
  WHERE id IN (SELECT id FROM cleanup_evidence_links)
  RETURNING 1
)
SELECT 'shopify_evidence_links' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM shopify_order_payment_events
  WHERE id IN (SELECT id FROM cleanup_order_transactions)
  RETURNING 1
)
SELECT 'shopify_order_payment_events' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM evidence_documents
  WHERE id IN (SELECT id FROM cleanup_evidence_documents)
  RETURNING 1
)
SELECT 'evidence_documents' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM import_errors
  WHERE import_job_id IN (SELECT id FROM cleanup_jobs)
     OR import_row_id IN (
       SELECT id
       FROM import_rows
       WHERE import_file_id IN (SELECT id FROM cleanup_files)
     )
  RETURNING 1
)
SELECT 'import_errors' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM import_rows
  WHERE import_file_id IN (SELECT id FROM cleanup_files)
  RETURNING 1
)
SELECT 'import_rows' AS target, count(*) AS rows_deleted FROM deleted;

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
SELECT 'import_jobs_shopify_order_transactions' AS item, count(*) AS remaining
FROM import_jobs
WHERE connector_id IN ('shopify-order-transactions', 'shopify-order-transactions-csv')
UNION ALL
SELECT 'shopify_order_payment_events', count(*)
FROM shopify_order_payment_events;
