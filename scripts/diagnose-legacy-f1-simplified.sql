-- Diagnóstico no destructivo. No actualiza huellas, XML, documentos ni submissions.
SELECT
  fd.tenant_id,
  fd.id AS fiscal_document_id,
  fd.number,
  fd.issued_at,
  icr.id AS integrity_record_id,
  icr.aeat_tipo_factura,
  (fd.counterparty_id IS NULL) AS missing_real_counterparty
FROM fiscal_documents AS fd
JOIN integrity_chain_records AS icr
  ON icr.fiscal_document_id = fd.id
WHERE fd.document_type IN ('SIMPLIFICADA', 'SIMPLIFIED_INVOICE')
  AND icr.aeat_tipo_factura = 'F1'
  AND fd.counterparty_id IS NULL
ORDER BY fd.tenant_id, fd.issued_at, fd.id;
