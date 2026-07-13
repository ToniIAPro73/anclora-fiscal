-- Limpia TODOS los datos Shopify de un tenant desde Neon SQL: pedidos,
-- transacciones de pedido y movimientos/liquidaciones de Shopify Payments,
-- en un unico script (combina el alcance de cleanup-shopify-orders-import.sql,
-- cleanup-shopify-order-transactions-import.sql y
-- cleanup-shopify-payments-import.sql).
--
-- Uso:
-- 1. Cambia tenant_slug si necesitas otro tenant.
-- 2. Ejecuta el script completo en Neon SQL.
--
-- Alcance:
-- - Borra import_jobs/import_files/import_errors/import_rows de los 6
--   connector_id Shopify (pedidos, transacciones de pedido y payments, CSV y
--   alias legacy).
-- - Borra commercial_orders, order_lines, canonical_operations, tax_decisions,
--   issues y fiscal_documents derivados de esos pedidos.
-- - Borra la cadena VERI*FACTU de esos documentos: verifactu_submission_attempts,
--   verifactu_submissions e integrity_chain_records (migraciones 0004/0020/0021).
-- - Borra shopify_order_payment_events (transacciones de pedido) por completo.
-- - Borra shopify_payments_ledger_entries, payouts y payout_allocations
--   Shopify por completo, y financial_events legacy con source_channel='SHOPIFY'.
-- - Borra shopify_evidence_links y matching_candidates que referencien
--   cualquiera de las filas anteriores.
-- - A diferencia de los 3 scripts individuales (que se limitan a desenlazar
--   commercial_order_id cuando el pedido se borra pero las transacciones/pagos
--   quedan fuera de su alcance), este script SI borra las transacciones y los
--   pagos, porque los tres estan dentro de su alcance conjunto.
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
WHERE j.connector_id IN (
  'shopify-orders', 'shopify-orders-csv',
  'shopify-order-transactions', 'shopify-order-transactions-csv',
  'shopify-payments', 'shopify-csv'
);

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

-- VERI*FACTU chain hanging off the fiscal_documents we're about to delete
-- (integrity_chain_records.fiscal_document_id -> verifactu_submissions
-- .integrity_record_id -> verifactu_submission_attempts
-- .verifactu_submission_id; migrations 0004/0020). Deepest child first.
CREATE TEMP TABLE cleanup_integrity_records ON COMMIT DROP AS
SELECT icr.id
FROM integrity_chain_records icr
WHERE icr.fiscal_document_id IN (SELECT id FROM cleanup_documents);

CREATE TEMP TABLE cleanup_verifactu_submissions ON COMMIT DROP AS
SELECT vs.id
FROM verifactu_submissions vs
WHERE vs.integrity_record_id IN (SELECT id FROM cleanup_integrity_records);

CREATE TEMP TABLE cleanup_verifactu_attempts ON COMMIT DROP AS
SELECT vsa.id
FROM verifactu_submission_attempts vsa
WHERE vsa.verifactu_submission_id IN (SELECT id FROM cleanup_verifactu_submissions);

CREATE TEMP TABLE cleanup_order_transactions ON COMMIT DROP AS
SELECT pe.id
FROM shopify_order_payment_events pe
JOIN cleanup_tenant t ON t.tenant_id = pe.tenant_id
WHERE pe.import_file_id IN (SELECT id FROM cleanup_files)
   OR pe.commercial_order_id IN (SELECT id FROM cleanup_orders);

CREATE TEMP TABLE cleanup_ledger_entries ON COMMIT DROP AS
SELECT le.id, le.external_payout_id
FROM shopify_payments_ledger_entries le
JOIN cleanup_tenant t ON t.tenant_id = le.tenant_id
WHERE le.import_file_id IN (SELECT id FROM cleanup_files)
   OR le.commercial_order_id IN (SELECT id FROM cleanup_orders);

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

-- shopify_evidence_links has no FK (left/right_evidence_id are plain uuid
-- columns, see 0015), so this never blocks a delete -- collected up front so
-- every kind of evidence being deleted below (order, transaction, ledger
-- entry) also has its links cleaned instead of left dangling.
CREATE TEMP TABLE cleanup_evidence_links ON COMMIT DROP AS
SELECT l.id
FROM shopify_evidence_links l
JOIN cleanup_tenant t ON t.tenant_id = l.tenant_id
WHERE (l.left_evidence_type = 'COMMERCIAL_ORDER' AND l.left_evidence_id IN (SELECT id FROM cleanup_orders))
   OR (l.left_evidence_type = 'ORDER_TRANSACTION' AND l.left_evidence_id IN (SELECT id FROM cleanup_order_transactions))
   OR (l.right_evidence_type = 'ORDER_TRANSACTION' AND l.right_evidence_id IN (SELECT id FROM cleanup_order_transactions))
   OR (l.right_evidence_type = 'LEDGER_ENTRY' AND l.right_evidence_id IN (SELECT id FROM cleanup_ledger_entries));

CREATE TEMP TABLE cleanup_evidence_documents ON COMMIT DROP AS
SELECT ed.id
FROM evidence_documents ed
JOIN cleanup_files f ON f.id = ed.import_file_id;

-- Cross-period VERI*FACTU chain continuity: some OTHER (not-being-deleted)
-- integrity_chain_records row may point back at one of the fiscal_documents
-- we're deleting via previous_fiscal_document_id (migration 0021). Break
-- that link before deleting fiscal_documents so the FK doesn't block it.
UPDATE integrity_chain_records
SET previous_fiscal_document_id = NULL
WHERE previous_fiscal_document_id IN (SELECT id FROM cleanup_documents)
  AND id NOT IN (SELECT id FROM cleanup_integrity_records);

WITH deleted AS (
  DELETE FROM verifactu_submission_attempts
  WHERE id IN (SELECT id FROM cleanup_verifactu_attempts)
  RETURNING 1
)
SELECT 'verifactu_submission_attempts' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM verifactu_submissions
  WHERE id IN (SELECT id FROM cleanup_verifactu_submissions)
  RETURNING 1
)
SELECT 'verifactu_submissions' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM integrity_chain_records
  WHERE id IN (SELECT id FROM cleanup_integrity_records)
  RETURNING 1
)
SELECT 'integrity_chain_records' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM shopify_evidence_links
  WHERE id IN (SELECT id FROM cleanup_evidence_links)
  RETURNING 1
)
SELECT 'shopify_evidence_links' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM audit_events
  WHERE entity_id IN (
    SELECT id::text FROM cleanup_documents
    UNION SELECT id::text FROM cleanup_operations
    UNION SELECT id::text FROM cleanup_orders
    UNION SELECT id::text FROM cleanup_jobs
    UNION SELECT id::text FROM cleanup_files
    UNION SELECT id::text FROM cleanup_integrity_records
    UNION SELECT id::text FROM cleanup_verifactu_submissions
    UNION SELECT id::text FROM cleanup_verifactu_attempts
    UNION SELECT id::text FROM cleanup_evidence_links
    UNION SELECT id::text FROM cleanup_order_transactions
    UNION SELECT id::text FROM cleanup_ledger_entries
    UNION SELECT id::text FROM cleanup_payouts
    UNION SELECT id::text FROM cleanup_financial_events
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

WITH deleted AS (
  DELETE FROM matching_candidates
  WHERE commercial_order_id IN (SELECT id FROM cleanup_orders)
     OR financial_event_id IN (SELECT id FROM cleanup_financial_events)
  RETURNING 1
)
SELECT 'matching_candidates' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM shopify_order_payment_events
  WHERE id IN (SELECT id FROM cleanup_order_transactions)
  RETURNING 1
)
SELECT 'shopify_order_payment_events' AS target, count(*) AS rows_deleted FROM deleted;

WITH deleted AS (
  DELETE FROM payout_allocations
  WHERE payout_id IN (SELECT id FROM cleanup_payouts)
     OR commercial_order_id IN (SELECT id FROM cleanup_orders)
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
  DELETE FROM financial_events
  WHERE id IN (SELECT id FROM cleanup_financial_events)
  RETURNING 1
)
SELECT 'financial_events' AS target, count(*) AS rows_deleted FROM deleted;

-- order_lines cascades from commercial_orders (ON DELETE CASCADE, see 0011)
-- but is deleted explicitly first for an accurate rows_deleted count.
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
SELECT 'import_jobs_shopify' AS item, count(*) AS remaining
FROM import_jobs
WHERE connector_id IN (
  'shopify-orders', 'shopify-orders-csv',
  'shopify-order-transactions', 'shopify-order-transactions-csv',
  'shopify-payments', 'shopify-csv'
)
UNION ALL
SELECT 'commercial_orders_shopify', count(*)
FROM commercial_orders
WHERE source_channel = 'SHOPIFY'
UNION ALL
SELECT 'canonical_operations_shopify', count(*)
FROM canonical_operations
WHERE source_channel = 'SHOPIFY'
UNION ALL
SELECT 'shopify_order_payment_events', count(*)
FROM shopify_order_payment_events
UNION ALL
SELECT 'shopify_payments_ledger_entries', count(*)
FROM shopify_payments_ledger_entries
UNION ALL
SELECT 'payouts_shopify', count(*)
FROM payouts
WHERE channel = 'SHOPIFY'
UNION ALL
SELECT 'financial_events_shopify', count(*)
FROM financial_events
WHERE source_channel = 'SHOPIFY'
UNION ALL
SELECT 'verifactu_submissions_orphaned', count(*)
FROM verifactu_submissions vs
JOIN integrity_chain_records icr ON icr.id = vs.integrity_record_id
LEFT JOIN fiscal_documents fd ON fd.id = icr.fiscal_document_id
WHERE fd.id IS NULL;
