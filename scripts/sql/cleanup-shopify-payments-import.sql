-- Limpia una importacion de Shopify Payments desde Neon SQL.
--
-- Uso:
-- 1. Cambia tenant_slug si necesitas otro tenant.
-- 2. Ejecuta el script completo en Neon SQL.
--
-- Alcance:
-- - Borra import_jobs/import_files/import_errors/import_rows del conector
--   Shopify Payments.
-- - Borra shopify_payments_ledger_entries creados por esa carga.
-- - Borra enlaces shopify_evidence_links que apunten a esos movimientos.
-- - Borra payouts/payout_allocations Shopify creados desde external_payout_id
--   de esos movimientos.
-- - Borra matching_candidates y financial_events Shopify del tenant.
--
-- Nota importante:
-- financial_events es una tabla legacy sin import_file_id. Para limpiar una
-- carga de Shopify Payments de forma completa, este script borra todos los
-- financial_events con source_channel = 'SHOPIFY' del tenant. No borra
-- commercial_orders ni order_lines.
--
-- No borra objetos Blob; Neon SQL solo limpia la base de datos.

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
WHERE j.connector_id IN ('shopify-payments', 'shopify-csv');

CREATE TEMP TABLE cleanup_files ON COMMIT DROP AS
SELECT f.id
FROM import_files f
JOIN cleanup_jobs j ON j.id = f.import_job_id;

CREATE TEMP TABLE cleanup_ledger_entries ON COMMIT DROP AS
SELECT le.id, le.external_payout_id
FROM shopify_payments_ledger_entries le
JOIN cleanup_files f ON f.id = le.import_file_id;

CREATE TEMP TABLE cleanup_payouts ON COMMIT DROP AS
SELECT p.id
FROM payouts p
JOIN cleanup_tenant t ON t.tenant_id = p.tenant_id
WHERE p.channel = 'SHOPIFY'
  AND p.external_payout_id IN (
    SELECT external_payout_id
    FROM cleanup_ledger_entries
    WHERE external_payout_id IS NOT NULL
  );

CREATE TEMP TABLE cleanup_financial_events ON COMMIT DROP AS
SELECT fe.id
FROM financial_events fe
JOIN cleanup_tenant t ON t.tenant_id = fe.tenant_id
WHERE fe.source_channel = 'SHOPIFY';

CREATE TEMP TABLE cleanup_evidence_links ON COMMIT DROP AS
SELECT l.id
FROM shopify_evidence_links l
JOIN cleanup_tenant t ON t.tenant_id = l.tenant_id
WHERE (
    l.left_evidence_type = 'LEDGER_ENTRY'
    AND l.left_evidence_id IN (SELECT id FROM cleanup_ledger_entries)
  )
  OR (
    l.right_evidence_type = 'LEDGER_ENTRY'
    AND l.right_evidence_id IN (SELECT id FROM cleanup_ledger_entries)
  );

CREATE TEMP TABLE cleanup_evidence_documents ON COMMIT DROP AS
SELECT ed.id
FROM evidence_documents ed
JOIN cleanup_files f ON f.id = ed.import_file_id;

WITH deleted AS (
  DELETE FROM audit_events
  WHERE entity_id IN (
    SELECT id::text FROM cleanup_evidence_links
    UNION SELECT id::text FROM cleanup_ledger_entries
    UNION SELECT id::text FROM cleanup_payouts
    UNION SELECT id::text FROM cleanup_financial_events
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
  DELETE FROM matching_candidates
  WHERE financial_event_id IN (SELECT id FROM cleanup_financial_events)
  RETURNING 1
)
SELECT 'matching_candidates' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM financial_events
  WHERE id IN (SELECT id FROM cleanup_financial_events)
  RETURNING 1
)
SELECT 'financial_events' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM payout_allocations
  WHERE payout_id IN (SELECT id FROM cleanup_payouts)
  RETURNING 1
)
SELECT 'payout_allocations' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM payouts
  WHERE id IN (SELECT id FROM cleanup_payouts)
  RETURNING 1
)
SELECT 'payouts' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM shopify_payments_ledger_entries
  WHERE id IN (SELECT id FROM cleanup_ledger_entries)
  RETURNING 1
)
SELECT 'shopify_payments_ledger_entries' AS target, count(*) AS rows_deleted FROM deleted;

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
SELECT 'import_jobs_shopify_payments' AS item, count(*) AS remaining
FROM import_jobs
WHERE connector_id IN ('shopify-payments', 'shopify-csv')
UNION ALL
SELECT 'shopify_payments_ledger_entries', count(*)
FROM shopify_payments_ledger_entries
UNION ALL
SELECT 'financial_events_shopify', count(*)
FROM financial_events
WHERE source_channel = 'SHOPIFY'
UNION ALL
SELECT 'payouts_shopify', count(*)
FROM payouts
WHERE channel = 'SHOPIFY';
