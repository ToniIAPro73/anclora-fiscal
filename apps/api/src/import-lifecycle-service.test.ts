import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { confirmImportJob, rejectImportJob, retryImportJob } from './import-lifecycle-service';

describe('confirmImportJob', () => {
  function baseConfirmPorts(overrides: {
    findJob?: ReturnType<typeof vi.fn>;
    listIssues?: ReturnType<typeof vi.fn>;
    confirm?: ReturnType<typeof vi.fn>;
    findJobWithFile?: ReturnType<typeof vi.fn>;
    storageGet?: ReturnType<typeof vi.fn>;
    persistFiscalRecords?: ReturnType<typeof vi.fn>;
  } = {}) {
    return {
      jobs: { findJob: overrides.findJob ?? vi.fn() },
      issues: { listIssues: overrides.listIssues ?? vi.fn() },
      confirm: { confirm: overrides.confirm ?? vi.fn().mockResolvedValue(undefined) },
      jobFile: { findJobWithFile: overrides.findJobWithFile ?? vi.fn().mockResolvedValue(undefined) },
      storage: { get: overrides.storageGet ?? vi.fn() },
      fiscalPersistence: { persistFiscalRecords: overrides.persistFiscalRecords ?? vi.fn() },
    };
  }

  it('devuelve not_found cuando el job no existe', async () => {
    const result = await confirmImportJob(
      { tenantId: 't1', jobId: 'missing', acknowledgedIssueIds: [] },
      baseConfirmPorts({ findJob: vi.fn().mockResolvedValue(undefined) }),
    );
    expect(result).toEqual({ outcome: 'not_found' });
  });

  it('devuelve conflict si el job no está en ANALYZED/PENDING_CONFIRMATION', async () => {
    const result = await confirmImportJob(
      { tenantId: 't1', jobId: 'job-1', acknowledgedIssueIds: [] },
      baseConfirmPorts({ findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'REJECTED' }) }),
    );
    expect(result).toEqual({ outcome: 'conflict', status: 'REJECTED' });
  });

  it('devuelve blocking_issues cuando quedan incidencias bloqueantes sin reconocer', async () => {
    const result = await confirmImportJob(
      { tenantId: 't1', jobId: 'job-1', acknowledgedIssueIds: ['issue-2'] },
      baseConfirmPorts({
        findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'ANALYZED' }),
        listIssues: vi.fn().mockResolvedValue([{ id: 'issue-1', blocking: true }, { id: 'issue-2', blocking: true }]),
      }),
    );
    expect(result).toEqual({ outcome: 'blocking_issues', unacknowledgedIssueIds: ['issue-1'] });
  });

  it('confirma con IMPORTED cuando no hay incidencias, regenera el preview y persiste los registros fiscales', async () => {
    const csv = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-ledger-charge-refund.csv'));
    const confirm = vi.fn().mockResolvedValue(undefined);
    const storageGet = vi.fn().mockResolvedValue(csv);
    const persistFiscalRecords = vi.fn().mockResolvedValue({ createdRecordIds: { commercialOrders: ['o1'] } });
    const findJobWithFile = vi.fn().mockResolvedValue({ id: 'job-1', status: 'ANALYZED', storageKey: 't1/evidence', sha256: 'x'.repeat(64), mimeType: 'text/csv', importFileId: 'file-1' });
    const result = await confirmImportJob(
      { tenantId: 't1', jobId: 'job-1', acknowledgedIssueIds: [] },
      baseConfirmPorts({
        findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'ANALYZED' }),
        listIssues: vi.fn().mockResolvedValue([]),
        confirm,
        findJobWithFile,
        storageGet,
        persistFiscalRecords,
      }),
    );
    expect(result).toEqual({ outcome: 'confirmed', status: 'IMPORTED', createdRecordIds: { commercialOrders: ['o1'] } });
    expect(storageGet).toHaveBeenCalledWith('t1/evidence');
    expect(persistFiscalRecords).toHaveBeenCalledWith('t1', 'file-1', expect.objectContaining({ connector: 'shopify-csv' }));
    expect(confirm).toHaveBeenCalledWith('t1', 'job-1', 'IMPORTED');
  });

  it('confirma con IMPORTED_WITH_ISSUES cuando quedan incidencias no bloqueantes o ya reconocidas', async () => {
    const csv = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-ledger-charge-refund.csv'));
    const confirm = vi.fn().mockResolvedValue(undefined);
    const result = await confirmImportJob(
      { tenantId: 't1', jobId: 'job-1', acknowledgedIssueIds: ['issue-1'] },
      baseConfirmPorts({
        findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'PENDING_CONFIRMATION' }),
        listIssues: vi.fn().mockResolvedValue([{ id: 'issue-1', blocking: true }, { id: 'issue-2', blocking: false }]),
        confirm,
        findJobWithFile: vi.fn().mockResolvedValue({ id: 'job-1', status: 'PENDING_CONFIRMATION', storageKey: 't1/evidence', sha256: 'x'.repeat(64), mimeType: 'text/csv', importFileId: 'file-1' }),
        storageGet: vi.fn().mockResolvedValue(csv),
        persistFiscalRecords: vi.fn().mockResolvedValue({ createdRecordIds: {} }),
      }),
    );
    expect(result).toMatchObject({ outcome: 'confirmed', status: 'IMPORTED_WITH_ISSUES' });
    expect(confirm).toHaveBeenCalledWith('t1', 'job-1', 'IMPORTED_WITH_ISSUES');
  });

  it('no persiste registros fiscales cuando no se encuentra el archivo custodiado', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    const persistFiscalRecords = vi.fn();
    const result = await confirmImportJob(
      { tenantId: 't1', jobId: 'job-1', acknowledgedIssueIds: [] },
      baseConfirmPorts({
        findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'ANALYZED' }),
        listIssues: vi.fn().mockResolvedValue([]),
        confirm,
        findJobWithFile: vi.fn().mockResolvedValue(undefined),
        persistFiscalRecords,
      }),
    );
    expect(result).toEqual({ outcome: 'confirmed', status: 'IMPORTED', createdRecordIds: {} });
    expect(persistFiscalRecords).not.toHaveBeenCalled();
  });
});

describe('rejectImportJob', () => {
  it('devuelve not_found cuando el job no existe', async () => {
    const result = await rejectImportJob({ tenantId: 't1', jobId: 'missing' }, { jobs: { findJob: vi.fn().mockResolvedValue(undefined) }, reject: { reject: vi.fn() } });
    expect(result).toEqual({ outcome: 'not_found' });
  });

  it('devuelve conflict si el job ya fue confirmado', async () => {
    const result = await rejectImportJob(
      { tenantId: 't1', jobId: 'job-1' },
      { jobs: { findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'IMPORTED' }) }, reject: { reject: vi.fn() } },
    );
    expect(result).toEqual({ outcome: 'conflict', status: 'IMPORTED' });
  });

  it('rechaza el job y delega el motivo al repositorio', async () => {
    const reject = vi.fn().mockResolvedValue(undefined);
    const result = await rejectImportJob(
      { tenantId: 't1', jobId: 'job-1', reason: 'Datos erróneos' },
      { jobs: { findJob: vi.fn().mockResolvedValue({ id: 'job-1', status: 'ANALYZED' }) }, reject: { reject } },
    );
    expect(result).toEqual({ outcome: 'rejected' });
    expect(reject).toHaveBeenCalledWith('t1', 'job-1', 'Datos erróneos');
  });
});

describe('retryImportJob', () => {
  it('devuelve not_found cuando el job/archivo no existe', async () => {
    const result = await retryImportJob(
      { tenantId: 't1', jobId: 'missing' },
      { jobs: { findJobWithFile: vi.fn().mockResolvedValue(undefined), recordRetry: vi.fn() }, storage: { get: vi.fn() } },
    );
    expect(result).toEqual({ outcome: 'not_found' });
  });

  it('reanaliza el archivo custodiado sin volver a subir evidencia y registra el reintento', async () => {
    const csv = await readFile(resolve(import.meta.dirname, '../../../packages/connectors/test/fixtures/shopify-ledger-charge-refund.csv'));
    const recordRetry = vi.fn().mockResolvedValue(undefined);
    const storageGet = vi.fn().mockResolvedValue(csv);
    const result = await retryImportJob(
      { tenantId: 't1', jobId: 'job-1', actorId: 'user-1', reason: 'Reintento tras corregir mapeo' },
      {
        jobs: {
          findJobWithFile: vi.fn().mockResolvedValue({ id: 'job-1', status: 'FAILED', storageKey: 't1/evidence', sha256: 'x'.repeat(64), mimeType: 'text/csv' }),
          recordRetry,
        },
        storage: { get: storageGet },
      },
    );
    expect(result.outcome).toBe('retried');
    if (result.outcome === 'retried') expect(result.status).toBe('ANALYZED');
    expect(storageGet).toHaveBeenCalledWith('t1/evidence');
    expect(recordRetry).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', jobId: 'job-1', actorId: 'user-1', reason: 'Reintento tras corregir mapeo', status: 'ANALYZED' }));
  });

  it('marca FAILED y registra el motivo cuando el reanálisis lanza', async () => {
    const recordRetry = vi.fn().mockResolvedValue(undefined);
    const result = await retryImportJob(
      { tenantId: 't1', jobId: 'job-1' },
      {
        jobs: {
          findJobWithFile: vi.fn().mockResolvedValue({ id: 'job-1', status: 'FAILED', storageKey: 't1/evidence', sha256: 'x'.repeat(64), mimeType: 'text/plain' }),
          recordRetry,
        },
        storage: { get: vi.fn().mockResolvedValue(Buffer.from('no soportado')) },
      },
    );
    expect(result).toMatchObject({ outcome: 'retried', status: 'FAILED' });
    expect(recordRetry).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
  });
});
