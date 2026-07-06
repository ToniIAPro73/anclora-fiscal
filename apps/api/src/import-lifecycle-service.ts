import { previewImport } from './import-service.js';
import type { ImportPreviewResponse } from './import-service.js';
import type { FiscalPersistencePort } from './import-preview-persistence.js';

/**
 * FASE 03 — confirm/reject/retry lifecycle for an already-analyzed import
 * job. These are pure functions over narrow ports (same pattern as
 * import-preview-persistence.ts) so the transition logic — blocking-issue
 * gating, valid state checks — is testable without a database or HTTP layer.
 */

export interface ImportJobPort {
  findJob(tenantId: string, jobId: string): Promise<{ id: string; status: string } | undefined>;
}

export interface ImportIssuesPort {
  listIssues(tenantId: string, jobId: string): Promise<Array<{ id: string; blocking: boolean }>>;
}

export interface ImportConfirmRepositoryPort {
  /**
   * FASE 03: this is a pure status-transition + audit write now -- the actual
   * commercial_orders/financial_events/royalty_lines creation happens via
   * FiscalPersistencePort.persistFiscalRecords, orchestrated by
   * confirmImportJob below, not by this repository method.
   */
  confirm(tenantId: string, jobId: string, status: 'IMPORTED' | 'IMPORTED_WITH_ISSUES'): Promise<void>;
}

/**
 * Both retry and confirm need the custodied file's evidence descriptor to
 * re-run previewImport() against the same bytes (confirm additionally needs
 * importFileId to attribute the fiscal records it creates to the right
 * import_files row). Kept as one port -- DrizzleImportPreviewRepository's
 * findJobWithFile already returns importFileId for both callers.
 */
export interface ImportJobFilePort {
  findJobWithFile(tenantId: string, jobId: string): Promise<{ id: string; status: string; storageKey: string; sha256: string; mimeType: string; importFileId: string } | undefined>;
}

export interface ImportRejectRepositoryPort {
  reject(tenantId: string, jobId: string, reason: string | undefined): Promise<void>;
}

export interface ImportRetryRepositoryPort extends ImportJobFilePort {
  recordRetry(input: {
    tenantId: string;
    jobId: string;
    actorId?: string | undefined;
    reason?: string | undefined;
    status: 'ANALYZED' | 'FAILED';
    summary: Record<string, unknown>;
    issues: Array<{ code: string; severity: string; message: string }>;
  }): Promise<void>;
}

export interface ImportStorageReadPort {
  get(key: string): Promise<Uint8Array>;
}

const CONFIRMABLE_STATUSES = new Set(['ANALYZED', 'PENDING_CONFIRMATION']);
const ALREADY_CONFIRMED_STATUSES = new Set(['IMPORTED', 'IMPORTED_WITH_ISSUES']);

export type ConfirmImportJobResult =
  | { outcome: 'not_found' }
  | { outcome: 'conflict'; status: string }
  | { outcome: 'blocking_issues'; unacknowledgedIssueIds: string[] }
  | { outcome: 'confirmed'; status: 'IMPORTED' | 'IMPORTED_WITH_ISSUES'; createdRecordIds: Record<string, string[]> };

/**
 * Confirms an ANALYZED/PENDING_CONFIRMATION job. Any BLOCKING issue not
 * present in `acknowledgedIssueIds` stops the confirmation. If the job has
 * any issues at all (blocking-but-acknowledged, or non-blocking) the result
 * status is IMPORTED_WITH_ISSUES; otherwise IMPORTED.
 *
 * FASE 03: this is where the real commercial_orders/financial_events/
 * royalty_lines records get created -- never at preview time. Since the
 * repository only stored the normalized-but-unpersisted preview transiently
 * (nothing durable beyond import_jobs/import_files/import_errors), the
 * already-custodied file is re-read from storage and re-run through
 * previewImport() (byte-for-byte deterministic, same pattern retryImportJob
 * already uses) to reconstruct the exact commercialOrders/financialEvents/
 * royalty arrays the user saw during ANALYZED preview, and those are what
 * get persisted now via fiscalPersistence.persistFiscalRecords.
 */
export async function confirmImportJob(
  input: { tenantId: string; jobId: string; acknowledgedIssueIds: string[] },
  ports: {
    jobs: ImportJobPort;
    issues: ImportIssuesPort;
    confirm: ImportConfirmRepositoryPort;
    jobFile: ImportJobFilePort;
    storage: ImportStorageReadPort;
    fiscalPersistence: FiscalPersistencePort;
  },
): Promise<ConfirmImportJobResult> {
  const job = await ports.jobs.findJob(input.tenantId, input.jobId);
  if (!job) return { outcome: 'not_found' };
  if (!CONFIRMABLE_STATUSES.has(job.status)) return { outcome: 'conflict', status: job.status };

  const issues = await ports.issues.listIssues(input.tenantId, input.jobId);
  const acknowledged = new Set(input.acknowledgedIssueIds);
  const unacknowledgedBlocking = issues.filter((issue) => issue.blocking && !acknowledged.has(issue.id));
  if (unacknowledgedBlocking.length > 0) {
    return { outcome: 'blocking_issues', unacknowledgedIssueIds: unacknowledgedBlocking.map((issue) => issue.id) };
  }

  const finalStatus: 'IMPORTED' | 'IMPORTED_WITH_ISSUES' = issues.length > 0 ? 'IMPORTED_WITH_ISSUES' : 'IMPORTED';

  let createdRecordIds: Record<string, string[]> = {};
  const jobWithFile = await ports.jobFile.findJobWithFile(input.tenantId, input.jobId);
  if (jobWithFile) {
    const bytes = await ports.storage.get(jobWithFile.storageKey);
    const preview = await previewImport({
      tenantId: input.tenantId,
      filename: jobWithFile.storageKey,
      mimeType: jobWithFile.mimeType,
      bytes,
      storage: {
        put: async () => ({ key: jobWithFile.storageKey, sha256: jobWithFile.sha256, size: bytes.byteLength, mimeType: jobWithFile.mimeType }),
        get: async () => bytes,
      },
    });
    ({ createdRecordIds } = await ports.fiscalPersistence.persistFiscalRecords(input.tenantId, jobWithFile.importFileId, preview));
  }

  await ports.confirm.confirm(input.tenantId, input.jobId, finalStatus);
  return { outcome: 'confirmed', status: finalStatus, createdRecordIds };
}

export type RejectImportJobResult =
  | { outcome: 'not_found' }
  | { outcome: 'conflict'; status: string }
  | { outcome: 'rejected' };

/** Rejects a job that has not already been confirmed. Never deletes custody rows. */
export async function rejectImportJob(
  input: { tenantId: string; jobId: string; reason?: string | undefined },
  ports: { jobs: ImportJobPort; reject: ImportRejectRepositoryPort },
): Promise<RejectImportJobResult> {
  const job = await ports.jobs.findJob(input.tenantId, input.jobId);
  if (!job) return { outcome: 'not_found' };
  if (ALREADY_CONFIRMED_STATUSES.has(job.status)) return { outcome: 'conflict', status: job.status };

  await ports.reject.reject(input.tenantId, input.jobId, input.reason);
  return { outcome: 'rejected' };
}

export type RetryImportJobResult =
  | { outcome: 'not_found' }
  | { outcome: 'retried'; status: 'ANALYZED' | 'FAILED'; summary: Record<string, unknown>; issues: ImportPreviewResponse['issues']; preview?: ImportPreviewResponse };

/**
 * Idempotent re-analysis: reuses the already-custodied file (same sha256,
 * same storage key — no new evidence_documents row, no new import_files
 * row, no new import_jobs row) and re-runs the connector-detection +
 * analysis pipeline via previewImport(). The `storage.put` passed to
 * previewImport is a no-op shim that returns the already-known evidence
 * descriptor instead of writing new bytes — retry must never re-custody a
 * file that is already stored.
 */
export async function retryImportJob(
  input: { tenantId: string; jobId: string; actorId?: string | undefined; reason?: string | undefined },
  ports: { jobs: ImportRetryRepositoryPort; storage: ImportStorageReadPort },
): Promise<RetryImportJobResult> {
  const job = await ports.jobs.findJobWithFile(input.tenantId, input.jobId);
  if (!job) return { outcome: 'not_found' };

  let status: 'ANALYZED' | 'FAILED';
  let summary: Record<string, unknown>;
  let issues: ImportPreviewResponse['issues'];
  let successfulPreview: ImportPreviewResponse | undefined;
  try {
    const bytes = await ports.storage.get(job.storageKey);
    const preview = await previewImport({
      tenantId: input.tenantId,
      filename: job.storageKey,
      mimeType: job.mimeType,
      bytes,
      storage: {
        put: async () => ({ key: job.storageKey, sha256: job.sha256, size: bytes.byteLength, mimeType: job.mimeType }),
        get: async () => bytes,
      },
    });
    status = 'ANALYZED';
    summary = preview.summary as Record<string, unknown>;
    issues = preview.issues;
    successfulPreview = preview;
  } catch (error) {
    status = 'FAILED';
    summary = {};
    issues = [{ code: 'RETRY_ANALYSIS_FAILED', severity: 'BLOCKING', message: error instanceof Error ? error.message : 'No se pudo reanalizar el archivo' }];
  }

  await ports.jobs.recordRetry({ tenantId: input.tenantId, jobId: input.jobId, actorId: input.actorId, reason: input.reason, status, summary, issues });
  return { outcome: 'retried', status, summary, issues, ...(successfulPreview ? { preview: successfulPreview } : {}) };
}
