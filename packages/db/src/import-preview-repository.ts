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

    if (existing) return { jobId: existing.jobId, importFileId: existing.importFileId, duplicate: true };

    return this.db.transaction(async (transaction) => {
      await transaction.insert(importJobs).values({
        id: input.jobId,
        tenantId: input.tenantId,
        status: 'PREVIEW_READY',
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
      await transaction.insert(auditEvents).values({
        tenantId: input.tenantId,
        action: 'IMPORT_PREVIEW_CREATED',
        entityType: 'ImportJob',
        entityId: input.jobId,
        metadata: { connectorId: input.connectorId, sha256: input.evidence.sha256 },
      });

      return { jobId: input.jobId, importFileId: file.id, duplicate: false };
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
