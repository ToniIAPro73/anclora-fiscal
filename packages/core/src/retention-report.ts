export type FiscalEvidenceKind = 'INVOICE'|'INTEGRITY_HASH'|'SUBMISSION'|'ATTEMPT'|'SIF_EVENT'|'COUNTERPARTY_PII'|'IMPORT_FILE'|'PDF'|'XML_RESPONSE'|'LOG'|'PURCHASE';
export interface RetentionRecord { id: string; kind: FiscalEvidenceKind; createdAt: string; chainRequired?: boolean }
export interface RetentionCandidate { id: string; kind: FiscalEvidenceKind; disposition: 'RETAIN'|'REVIEW_ANONYMIZATION'; reason: string }
const NEVER_DELETE = new Set<FiscalEvidenceKind>(['INVOICE','INTEGRITY_HASH','SUBMISSION','ATTEMPT','SIF_EVENT','PDF','XML_RESPONSE','PURCHASE']);
export function getRetentionCandidates(records: RetentionRecord[], before: string): RetentionCandidate[] {
  const cutoff = new Date(before); if (Number.isNaN(cutoff.getTime())) throw new Error('RETENTION_CUTOFF_INVALID');
  return records.filter((record) => new Date(record.createdAt) < cutoff).map((record) => record.chainRequired || NEVER_DELETE.has(record.kind)
    ? { id: record.id, kind: record.kind, disposition: 'RETAIN', reason: 'Necesario para evidencia fiscal o reconstrucción de cadena' }
    : { id: record.id, kind: record.kind, disposition: 'REVIEW_ANONYMIZATION', reason: 'Solo candidato a revisión; requiere política aprobada, permiso y auditoría' });
}
