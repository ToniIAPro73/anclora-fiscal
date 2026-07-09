import { createHash } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  createVatDossier,
  type DossierIssue,
  type DossierVerifactuRecord,
  type StoragePort,
} from '@anclora/core/server';
import {
  auditEvents,
  canonicalOperations,
  fiscalDocuments,
  integrityChainRecords,
  issues,
  legalEntities,
  periodCloses,
  taxDecisions,
  vatDossiers,
  verifactuSubmissions,
} from './schema.js';
import * as schema from './schema.js';

type VatDossierRow = typeof vatDossiers.$inferSelect;
export type VatDossier = Omit<VatDossierRow, 'manifest'> & {
  manifest: Record<string, string>;
};

const SCHEMA_VERSION = 'anclora-vat-dossier-v1';
const CLOSED_PERIOD_STATUS = 'CLOSED';
const DOSSIER_STATUS = 'CLOSED';

function asDossierManifest(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('VAT_DOSSIER_MANIFEST_INVALID');
  }

  const manifest: Record<string, string> = {};

  for (const [key, hash] of Object.entries(value)) {
    if (typeof hash !== 'string') {
      throw new Error('VAT_DOSSIER_MANIFEST_INVALID');
    }

    manifest[key] = hash;
  }

  return manifest;
}

function toVatDossier(row: VatDossierRow): VatDossier {
  return {
    ...row,
    manifest: asDossierManifest(row.manifest),
  };
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export interface GenerateVatDossierInput {
  tenantId: string;
  period: string;
  actorId: string;
  storage: StoragePort;
  force?: boolean;
}

export type GenerateVatDossierResult =
  | { ok: true; dossier: VatDossier; alreadyGenerated: boolean }
  | { ok: false; reason: 'PERIOD_NOT_CLOSED' }
  | { ok: false; reason: 'BLOCKING_ISSUES_REQUIRE_APPROVAL' };

export type GetVatDossierResult =
  | { ok: true; dossier: VatDossier }
  | { ok: false; reason: 'NOT_FOUND' };

export class DrizzleVatDossiersRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Generates (or returns the existing) VAT dossier zip for a tenant/period.
   * Requires the period's `periodCloses` row to be `CLOSED` — `PERIOD_NOT_CLOSED`
   * otherwise. Gathers the closed period's `fiscalDocuments` (joined for
   * country/channel), tenant issues linked to operations in that period, and
   * `verifactuSubmissions` status counts, then delegates document generation to
   * `createVatDossier()`. If `createVatDossier()` throws
   * `BLOCKING_ISSUES_REQUIRE_APPROVAL` (unapproved blocking issues slipped past
   * the period close), that is mapped to a typed result rather than rethrown.
   * Idempotent: an already-generated dossier for the period is returned as-is
   * unless `force` is `true`, in which case the archive is regenerated and the
   * existing row is updated (role-gating for `force` happens in the
   * controller, not here).
   */
  async generate(input: GenerateVatDossierInput): Promise<GenerateVatDossierResult> {
    const [periodClose] = await this.db
      .select()
      .from(periodCloses)
      .where(and(eq(periodCloses.tenantId, input.tenantId), eq(periodCloses.period, input.period)))
      .limit(1);
    if (!periodClose || periodClose.status !== CLOSED_PERIOD_STATUS) {
      return { ok: false, reason: 'PERIOD_NOT_CLOSED' };
    }

    const [existing] = await this.db
      .select()
      .from(vatDossiers)
      .where(and(eq(vatDossiers.tenantId, input.tenantId), eq(vatDossiers.periodCloseId, periodClose.id)))
      .limit(1);
    if (existing && !input.force) return { ok: true, dossier: toVatDossier(existing), alreadyGenerated: true };

    const documentRows = await this.db
      .select({
        number: fiscalDocuments.number,
        issuedAt: fiscalDocuments.issuedAt,
        documentType: fiscalDocuments.documentType,
        taxBase: fiscalDocuments.taxBase,
        taxAmount: fiscalDocuments.taxAmount,
        totalAmount: fiscalDocuments.totalAmount,
        currency: fiscalDocuments.currency,
        renderSha256: fiscalDocuments.renderSha256,
        canonicalOperationId: fiscalDocuments.canonicalOperationId,
        sourceChannel: canonicalOperations.sourceChannel,
        countryCode: legalEntities.countryCode,
      })
      .from(fiscalDocuments)
      .innerJoin(canonicalOperations, eq(fiscalDocuments.canonicalOperationId, canonicalOperations.id))
      .innerJoin(legalEntities, eq(canonicalOperations.legalEntityId, legalEntities.id))
      .where(and(
        eq(fiscalDocuments.tenantId, input.tenantId),
        sql`to_char(${fiscalDocuments.issuedAt}, 'YYYY-MM') = ${input.period}`,
      ));

    const taxRateByOperation = new Map<string, number>();
    for (const row of documentRows) {
      if (taxRateByOperation.has(row.canonicalOperationId)) continue;
      const [decision] = await this.db
        .select({ taxRate: taxDecisions.taxRate })
        .from(taxDecisions)
        .where(and(
          eq(taxDecisions.tenantId, input.tenantId),
          eq(taxDecisions.canonicalOperationId, row.canonicalOperationId),
        ))
        .orderBy(desc(taxDecisions.decidedAt))
        .limit(1);
      taxRateByOperation.set(row.canonicalOperationId, Number(decision?.taxRate ?? 0));
    }

    const invoices = documentRows.map((row) => ({
      number: row.number,
      issuedAt: row.issuedAt.toISOString(),
      type: row.documentType as 'FULL_INVOICE' | 'RECTIFYING_INVOICE',
      country: row.countryCode,
      channel: row.sourceChannel,
      taxBase: Number(row.taxBase),
      taxRate: taxRateByOperation.get(row.canonicalOperationId) ?? 0,
      taxAmount: Number(row.taxAmount),
      totalAmount: Number(row.totalAmount),
      currency: row.currency,
      evidenceHash: row.renderSha256,
    }));

    const issueRows = await this.db
      .select({ code: issues.code, severity: issues.severity, status: issues.status })
      .from(issues)
      .innerJoin(canonicalOperations, eq(issues.canonicalOperationId, canonicalOperations.id))
      .where(and(
        eq(issues.tenantId, input.tenantId),
        sql`to_char(${canonicalOperations.createdAt}, 'YYYY-MM') = ${input.period}`,
      ));
    const dossierIssues: DossierIssue[] = issueRows.map((row) => ({
      code: row.code,
      severity: row.severity as DossierIssue['severity'],
      status: row.status as DossierIssue['status'],
    }));

    const verifactuRows = await this.db
      .select({
        invoiceNumber: fiscalDocuments.number,
        documentType: fiscalDocuments.documentType,
        issuedAt: fiscalDocuments.issuedAt,
        environment: verifactuSubmissions.environment,
        status: verifactuSubmissions.status,
        responseRedacted: verifactuSubmissions.responseRedacted,
        attemptCount: verifactuSubmissions.attemptCount,
        recordType: integrityChainRecords.recordType,
        chainHash: integrityChainRecords.hash,
        previousHash: integrityChainRecords.previousHash,
      })
      .from(verifactuSubmissions)
      .innerJoin(integrityChainRecords, eq(verifactuSubmissions.integrityRecordId, integrityChainRecords.id))
      .innerJoin(fiscalDocuments, eq(integrityChainRecords.fiscalDocumentId, fiscalDocuments.id))
      .where(and(
        eq(verifactuSubmissions.tenantId, input.tenantId),
        sql`to_char(${fiscalDocuments.issuedAt}, 'YYYY-MM') = ${input.period}`,
      ))
      .orderBy(
        asc(fiscalDocuments.issuedAt),
        asc(fiscalDocuments.number),
        asc(verifactuSubmissions.createdAt),
      );

    const verifactuStatuses: Record<string, number> = {};
    const verifactuRecords: DossierVerifactuRecord[] = [];

    for (const row of verifactuRows) {
      verifactuStatuses[row.status] = (verifactuStatuses[row.status] ?? 0) + 1;

      const response = asJsonObject(row.responseRedacted);

      verifactuRecords.push({
        invoiceNumber: row.invoiceNumber,
        documentType: row.documentType,
        issuedAt: row.issuedAt.toISOString(),
        environment: row.environment,
        status: row.status,
        recordType: row.recordType,
        attemptCount: Number(row.attemptCount),
        chainHash: row.chainHash,
        previousHash: row.previousHash,
        responseReference: stringOrNull(response?.reference),
        responseStatus: stringOrNull(response?.status),
        submittedAt: stringOrNull(response?.submittedAt),
      });
    }

    let generated;
    try {
      generated = await createVatDossier({
        period: input.period,
        invoices,
        issues: dossierIssues,
        verifactuStatuses,
        verifactuRecords,
        ...(periodClose.blockingApprovalId ? { blockingApprovalId: periodClose.blockingApprovalId } : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'BLOCKING_ISSUES_REQUIRE_APPROVAL') {
        return { ok: false, reason: 'BLOCKING_ISSUES_REQUIRE_APPROVAL' };
      }
      throw error;
    }

    const stored = await input.storage.put({
      tenantId: input.tenantId,
      bytes: generated.zipBytes,
      mimeType: 'application/zip',
    });
    const archiveSha256 = createHash('sha256').update(generated.zipBytes).digest('hex');

    return this.db.transaction(async (transaction) => {
      const dossier = existing
        ? (await transaction
            .update(vatDossiers)
            .set({
              schemaVersion: SCHEMA_VERSION,
              status: DOSSIER_STATUS,
              storageKey: stored.key,
              archiveSha256,
              manifest: generated.manifest,
              updatedAt: new Date(),
            })
            .where(eq(vatDossiers.id, existing.id))
            .returning())[0]
        : (await transaction
            .insert(vatDossiers)
            .values({
              tenantId: input.tenantId,
              periodCloseId: periodClose.id,
              schemaVersion: SCHEMA_VERSION,
              status: DOSSIER_STATUS,
              storageKey: stored.key,
              archiveSha256,
              manifest: generated.manifest,
            })
            .returning())[0];
      if (!dossier) throw new Error('No se pudo generar el expediente de IVA');

      await transaction.insert(auditEvents).values({
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'VAT_DOSSIER_GENERATED',
        entityType: 'VatDossier',
        entityId: dossier.id,
        metadata: { period: input.period, force: Boolean(input.force) },
      });

      return { ok: true, dossier: toVatDossier(dossier), alreadyGenerated: false };
    });
  }

  /** Returns the persisted VAT dossier metadata for a tenant/period, if any. */
  async get(tenantId: string, period: string): Promise<GetVatDossierResult> {
    const [periodClose] = await this.db
      .select()
      .from(periodCloses)
      .where(and(eq(periodCloses.tenantId, tenantId), eq(periodCloses.period, period)))
      .limit(1);
    if (!periodClose) return { ok: false, reason: 'NOT_FOUND' };

    const [dossier] = await this.db
      .select()
      .from(vatDossiers)
      .where(and(eq(vatDossiers.tenantId, tenantId), eq(vatDossiers.periodCloseId, periodClose.id)))
      .limit(1);
    if (!dossier) return { ok: false, reason: 'NOT_FOUND' };

    return { ok: true, dossier: toVatDossier(dossier) };
  }
}
