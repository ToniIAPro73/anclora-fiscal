import { and, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  auditEvents,
  evidenceDocuments,
  importErrors,
  importFiles,
  importJobs,
  tenants,
} from './schema.js';
import * as schema from './schema.js';

export interface ImportJobRecord {
  id: string;
  tenantId: string;
  status: string;
  connectorId: string | null;
  mappingVersion: string | null;
  summary: Record<string, unknown>;
}

export interface ImportJobWithFileRecord extends ImportJobRecord {
  importFileId: string;
  storageKey: string;
  sha256: string;
  mimeType: string;
}

export interface ImportIssueRecord {
  id: string;
  code: string;
  severity: string;
  blocking: boolean;
}

export interface PersistImportPreviewInput {
  tenantId: string;
  jobId: string;
  connectorId: string;
  importerVersion: string;
  originalNameEncrypted: string;
  evidence: {
    key: string;
    sha256: string;
    size: number;
    mimeType: string;
  };
  summary: Record<string, unknown>;
  issues: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
}

export interface PersistImportPreviewResult {
  jobId: string;
  importFileId: string;
  duplicate: boolean;
  issueIds: string[];
}

export class DrizzleImportPreviewRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async persist(input: PersistImportPreviewInput): Promise<PersistImportPreviewResult> {
    const [existing] = await this.db
      .select({ jobId: importFiles.importJobId, importFileId: importFiles.id })
      .from(importFiles)
      .where(and(eq(importFiles.tenantId, input.tenantId), eq(importFiles.sha256, input.evidence.sha256)))
      .limit(1);

    if (existing) {
      const existingIssues = await this.db.select({ id: importErrors.id }).from(importErrors).where(and(eq(importErrors.tenantId, input.tenantId), eq(importErrors.importJobId, existing.jobId)));
      return { jobId: existing.jobId, importFileId: existing.importFileId, duplicate: true, issueIds: existingIssues.map((issue) => issue.id) };
    }

    return this.db.transaction(async (transaction) => {
      await transaction.insert(importJobs).values({
        id: input.jobId,
        tenantId: input.tenantId,
        status: 'ANALYZED',
        connectorId: input.connectorId,
        mappingVersion: input.importerVersion,
        summary: input.summary,
      });
      const [file] = await transaction.insert(importFiles).values({
        tenantId: input.tenantId,
        importJobId: input.jobId,
        storageKey: input.evidence.key,
        originalNameEncrypted: input.originalNameEncrypted,
        mimeType: input.evidence.mimeType,
        byteSize: String(input.evidence.size),
        sha256: input.evidence.sha256,
        importerVersion: input.importerVersion,
      }).returning({ id: importFiles.id });

      if (!file) throw new Error('No se pudo persistir el archivo de importación');

      await transaction.insert(evidenceDocuments).values({
        tenantId: input.tenantId,
        importFileId: file.id,
        sourceChannel: input.connectorId.startsWith('kdp') ? 'AMAZON_KDP' : 'SHOPIFY',
        documentType: input.connectorId,
        storageKey: input.evidence.key,
        sha256: input.evidence.sha256,
      });
      let issueIds: string[] = [];
      if (input.issues.length > 0) {
        const createdIssues = await transaction.insert(importErrors).values(input.issues.map((issue) => ({
          tenantId: input.tenantId,
          importJobId: input.jobId,
          code: issue.code,
          severity: issue.severity,
          message: issue.message,
          blocking: issue.severity === 'BLOCKING',
        }))).returning({ id: importErrors.id });
        issueIds = createdIssues.map((issue) => issue.id);
      }
      await transaction.insert(auditEvents).values({
        tenantId: input.tenantId,
        action: 'IMPORT_PREVIEW_CREATED',
        entityType: 'ImportJob',
        entityId: input.jobId,
        metadata: { connectorId: input.connectorId, sha256: input.evidence.sha256 },
      });

      return { jobId: input.jobId, importFileId: file.id, duplicate: false, issueIds };
    });
  }

  async findJob(tenantId: string, jobId: string): Promise<ImportJobRecord | undefined> {
    const [job] = await this.db
      .select({ id: importJobs.id, tenantId: importJobs.tenantId, status: importJobs.status, connectorId: importJobs.connectorId, mappingVersion: importJobs.mappingVersion, summary: importJobs.summary })
      .from(importJobs)
      .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)))
      .limit(1);
    return job as ImportJobRecord | undefined;
  }

  async findJobWithFile(tenantId: string, jobId: string): Promise<ImportJobWithFileRecord | undefined> {
    const [row] = await this.db
      .select({
        id: importJobs.id,
        tenantId: importJobs.tenantId,
        status: importJobs.status,
        connectorId: importJobs.connectorId,
        mappingVersion: importJobs.mappingVersion,
        summary: importJobs.summary,
        importFileId: importFiles.id,
        storageKey: importFiles.storageKey,
        sha256: importFiles.sha256,
        mimeType: importFiles.mimeType,
      })
      .from(importJobs)
      .innerJoin(importFiles, eq(importFiles.importJobId, importJobs.id))
      .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)))
      .limit(1);
    return row as ImportJobWithFileRecord | undefined;
  }

  async listIssues(tenantId: string, jobId: string): Promise<ImportIssueRecord[]> {
    return this.db
      .select({ id: importErrors.id, code: importErrors.code, severity: importErrors.severity, blocking: importErrors.blocking })
      .from(importErrors)
      .where(and(eq(importErrors.tenantId, tenantId), eq(importErrors.importJobId, jobId)));
  }

  /**
   * FASE 03: pure status transition + audit write. The actual
   * commercial_orders/financial_events/royalty_lines records are created by
   * ImportPreviewPersistenceService.persistFiscalRecords, orchestrated by
   * confirmImportJob (apps/api/src/import-lifecycle-service.ts) before this
   * method is called -- never by this repository.
   */
  async confirm(tenantId: string, jobId: string, status: 'IMPORTED' | 'IMPORTED_WITH_ISSUES'): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction.update(importJobs).set({ status, updatedAt: new Date() }).where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)));
      await transaction.insert(auditEvents).values({ tenantId, action: 'IMPORT_JOB_CONFIRMED', entityType: 'ImportJob', entityId: jobId, metadata: { status } });
    });
  }

  async reject(tenantId: string, jobId: string, reason: string | undefined): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction.update(importJobs).set({ status: 'REJECTED', updatedAt: new Date() }).where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)));
      await transaction.insert(auditEvents).values({ tenantId, action: 'IMPORT_JOB_REJECTED', entityType: 'ImportJob', entityId: jobId, metadata: { reason: reason ?? null } });
    });
  }

  async recordRetry(input: {
    tenantId: string;
    jobId: string;
    actorId?: string | undefined;
    reason?: string | undefined;
    status: 'ANALYZED' | 'FAILED';
    summary: Record<string, unknown>;
    issues: Array<{ code: string; severity: string; message: string }>;
  }): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [existingJob] = await transaction
        .select({ summary: importJobs.summary })
        .from(importJobs)
        .where(and(eq(importJobs.tenantId, input.tenantId), eq(importJobs.id, input.jobId)))
        .limit(1);
      const retryHistory = Array.isArray((existingJob?.summary as { retryHistory?: unknown[] } | undefined)?.retryHistory)
        ? [...((existingJob!.summary as { retryHistory: unknown[] }).retryHistory)]
        : [];
      retryHistory.push({ retriedBy: input.actorId ?? null, retriedAt: new Date().toISOString(), reason: input.reason ?? null, resultStatus: input.status });

      await transaction
        .update(importJobs)
        .set({ status: input.status, summary: { ...input.summary, retryHistory }, updatedAt: new Date() })
        .where(and(eq(importJobs.tenantId, input.tenantId), eq(importJobs.id, input.jobId)));

      await transaction.delete(importErrors).where(and(eq(importErrors.tenantId, input.tenantId), eq(importErrors.importJobId, input.jobId)));
      if (input.issues.length > 0) {
        await transaction.insert(importErrors).values(input.issues.map((issue) => ({
          tenantId: input.tenantId,
          importJobId: input.jobId,
          code: issue.code,
          severity: issue.severity,
          message: issue.message,
          blocking: issue.severity === 'BLOCKING',
        })));
      }
      await transaction.insert(auditEvents).values({ tenantId: input.tenantId, action: 'IMPORT_JOB_RETRIED', entityType: 'ImportJob', entityId: input.jobId, metadata: { status: input.status, retriedBy: input.actorId ?? null, reason: input.reason ?? null } });
    });
  }
}

export async function ensureDevelopmentTenant<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult, typeof schema>,
  slug = 'demo-tenant',
): Promise<string> {
  const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (existing) return existing.id;

  const [created] = await db.insert(tenants).values({ name: 'Anclora Insights Demo', slug }).returning({ id: tenants.id });
  if (!created) throw new Error('No se pudo crear el tenant de desarrollo');
  return created.id;
}
