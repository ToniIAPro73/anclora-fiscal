import { and, desc, eq, inArray } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { createIntegrityRecord, InvoiceSequence, issueInvoice, rectifyInvoice, type StoragePort } from '@anclora/core/server';
import { auditEvents, canonicalOperations, fiscalDocuments, integrityChainRecords, invoiceSeries, legalEntities, productTaxProfiles, taxDecisions } from './schema.js';
import * as schema from './schema.js';

export type FiscalDocument = typeof fiscalDocuments.$inferSelect;

export interface IssueInvoiceInput {
  tenantId: string;
  /**
   * `null` for automatic, non-user-triggered issuance (Phase 5b's
   * InvoiceIssuanceService, chained from MatchingService). The authenticated
   * manual-issuance controller (fiscal-documents-controller.ts) always
   * passes a real `authSession.actorId` and is unaffected by this widening —
   * the schema's audit_events.actorId column has always been nullable.
   */
  actorId: string | null;
  canonicalOperationId: string;
  storage: StoragePort;
}

export type IssueInvoiceResult =
  | { ok: true; document: FiscalDocument; alreadyIssued: boolean }
  | { ok: false; reason: 'OPERATION_NOT_FOUND' | 'TAX_DECISION_MISSING' | 'FISCAL_CONFIGURATION_INCOMPLETE' };

export interface RectifyInvoiceInput {
  tenantId: string;
  /** See IssueInvoiceInput.actorId — `null` for automatic issuance. */
  actorId: string | null;
  fiscalDocumentId: string;
  storage: StoragePort;
}

export type RectifyInvoiceResult =
  | { ok: true; document: FiscalDocument; alreadyRectified: boolean }
  | { ok: false; reason: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE' };

const SIMPLIFIED_DOCUMENT_TYPE = 'SIMPLIFICADA';
const FULL_DOCUMENT_TYPE = 'COMPLETA';
const RECTIFYING_DOCUMENT_TYPE = 'RECTIFICATIVA';
const LEGACY_FULL_INVOICE_DOCUMENT_TYPE = 'FULL_INVOICE';
const LEGACY_RECTIFYING_INVOICE_DOCUMENT_TYPE = 'RECTIFYING_INVOICE';

function issuedDocumentType(decision: { documentType?: string | null }): typeof SIMPLIFIED_DOCUMENT_TYPE | typeof FULL_DOCUMENT_TYPE {
  if (decision.documentType === SIMPLIFIED_DOCUMENT_TYPE || decision.documentType === FULL_DOCUMENT_TYPE) return decision.documentType;
  if (decision.documentType === 'SIMPLIFIED_INVOICE') return SIMPLIFIED_DOCUMENT_TYPE;
  return FULL_DOCUMENT_TYPE;
}

function documentTypeSeriesCandidates(documentType: string): string[] {
  if (documentType === SIMPLIFIED_DOCUMENT_TYPE) return [SIMPLIFIED_DOCUMENT_TYPE, 'SIMPLIFIED_INVOICE'];
  if (documentType === RECTIFYING_DOCUMENT_TYPE) return [RECTIFYING_DOCUMENT_TYPE, LEGACY_RECTIFYING_INVOICE_DOCUMENT_TYPE];
  return [FULL_DOCUMENT_TYPE, LEGACY_FULL_INVOICE_DOCUMENT_TYPE];
}

function originalDocumentCanBeRectified(documentType: string) {
  return [SIMPLIFIED_DOCUMENT_TYPE, FULL_DOCUMENT_TYPE, LEGACY_FULL_INVOICE_DOCUMENT_TYPE].includes(documentType);
}

export class DrizzleFiscalDocumentsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async findById(tenantId: string, fiscalDocumentId: string): Promise<FiscalDocument | null> {
    const [document] = await this.db
      .select()
      .from(fiscalDocuments)
      .where(and(eq(fiscalDocuments.tenantId, tenantId), eq(fiscalDocuments.id, fiscalDocumentId)))
      .limit(1);
    return document ?? null;
  }

  /**
   * Issues the fiscal document decided for a canonical operation, tenant-scoped
   * end to end. Idempotent: if a document for the same decided type already exists
   * for (tenantId, canonicalOperationId), it is returned unchanged — no
   * second invoice number is burned, no second PDF is written to storage,
   * and no second integrityChainRecords row is inserted. The invoiceSeries
   * increment, fiscalDocuments insert, integrityChainRecords insert (with
   * previousHash chained from the tenant's most recent record) and
   * auditEvents insert all happen inside a single transaction.
   */
  async issue(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    return this.db.transaction(async (transaction) => {
      const [operation] = await transaction
        .select()
        .from(canonicalOperations)
        .where(and(eq(canonicalOperations.tenantId, input.tenantId), eq(canonicalOperations.id, input.canonicalOperationId)))
        .limit(1);
      if (!operation) return { ok: false, reason: 'OPERATION_NOT_FOUND' };

      const [decision] = await transaction
        .select()
        .from(taxDecisions)
        .where(and(eq(taxDecisions.tenantId, input.tenantId), eq(taxDecisions.canonicalOperationId, input.canonicalOperationId)))
        .orderBy(desc(taxDecisions.decidedAt))
        .limit(1);
      if (!decision) return { ok: false, reason: 'TAX_DECISION_MISSING' };
      const documentType = issuedDocumentType(decision);

      const [existing] = await transaction
        .select()
        .from(fiscalDocuments)
        .where(and(
          eq(fiscalDocuments.tenantId, input.tenantId),
          eq(fiscalDocuments.canonicalOperationId, input.canonicalOperationId),
          inArray(fiscalDocuments.documentType, documentTypeSeriesCandidates(documentType)),
        ))
        .limit(1);
      if (existing) return { ok: true, document: existing, alreadyIssued: true };

      const [issuer] = await transaction.select().from(legalEntities).where(and(
        eq(legalEntities.tenantId, input.tenantId),
        eq(legalEntities.id, operation.legalEntityId),
        eq(legalEntities.configurationStatus, 'READY'),
      )).limit(1);
      const [productProfile] = await transaction.select().from(productTaxProfiles).where(and(
        eq(productTaxProfiles.tenantId, input.tenantId),
        eq(productTaxProfiles.legalEntityId, operation.legalEntityId),
        eq(productTaxProfiles.active, true),
      )).limit(1);
      if (!issuer || !productProfile) return { ok: false, reason: 'FISCAL_CONFIGURATION_INCOMPLETE' };

      const [existingSeries] = await transaction
        .select()
        .from(invoiceSeries)
        .where(and(
          eq(invoiceSeries.tenantId, input.tenantId),
          eq(invoiceSeries.legalEntityId, operation.legalEntityId),
          inArray(invoiceSeries.documentType, documentTypeSeriesCandidates(documentType)),
        ))
        .limit(1);

      const seriesRow = existingSeries;
      if (!seriesRow) return { ok: false, reason: 'FISCAL_CONFIGURATION_INCOMPLETE' };

      const issuedAt = new Date();
      const sequence = new InvoiceSequence(seriesRow.code, Number(seriesRow.nextNumber));
      const invoice = await issueInvoice(sequence, {
        operationId: operation.id,
        customerLabel: operation.sourceOrderId ? `Operación ${operation.sourceOrderId}` : `Operación ${operation.id}`,
        ...(operation.customerAddress ? { customerAddress: operation.customerAddress } : {}),
        ...(operation.customerEmail ? { customerEmail: operation.customerEmail } : {}),
        issuerName: issuer.legalName,
        issuerAddress: issuer.address,
        description: productProfile.invoiceDescription,
        taxBase: Number(decision.taxBase ?? 0),
        taxRate: Number(decision.taxRate ?? 0),
        taxAmount: Number(decision.taxAmount ?? 0),
        totalAmount: Number(decision.totalAmount ?? 0),
        currency: 'EUR',
        issuedAt: issuedAt.toISOString(),
      }, documentType);

      await transaction
        .update(invoiceSeries)
        .set({ nextNumber: String(Number(seriesRow.nextNumber) + 1) })
        .where(eq(invoiceSeries.id, seriesRow.id));

      const stored = await input.storage.put({ tenantId: input.tenantId, bytes: invoice.pdfBytes, mimeType: 'application/pdf' });

      const [document] = await transaction
        .insert(fiscalDocuments)
        .values({
          tenantId: input.tenantId,
          canonicalOperationId: input.canonicalOperationId,
          number: invoice.number,
          documentType: invoice.type,
          status: 'ISSUED',
          issuedAt,
          taxBase: String(decision.taxBase ?? 0),
          taxAmount: String(decision.taxAmount ?? 0),
          totalAmount: String(decision.totalAmount ?? 0),
          currency: 'EUR',
          renderStorageKey: stored.key,
          renderSha256: invoice.sha256,
        })
        .returning();
      if (!document) throw new Error('No se pudo crear el documento fiscal');

      const [lastRecord] = await transaction
        .select()
        .from(integrityChainRecords)
        .where(eq(integrityChainRecords.tenantId, input.tenantId))
        .orderBy(desc(integrityChainRecords.createdAt))
        .limit(1);

      const integrityRecord = createIntegrityRecord(
        {
          documentId: document.id,
          documentNumber: invoice.number,
          recordType: 'ALTA',
          issuedAt: issuedAt.toISOString(),
          totalAmount: Number(decision.totalAmount ?? 0),
          taxAmount: Number(decision.taxAmount ?? 0),
          ...(lastRecord ? { previousHash: lastRecord.hash } : {}),
        },
        issuedAt.toISOString(),
      );

      await transaction.insert(integrityChainRecords).values({
        tenantId: input.tenantId,
        fiscalDocumentId: document.id,
        recordType: 'ALTA',
        canonicalPayload: integrityRecord.canonicalPayload,
        previousHash: integrityRecord.previousHash ?? null,
        hash: integrityRecord.hash,
        algorithm: integrityRecord.algorithm,
      });

      await transaction.insert(auditEvents).values({
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'INVOICE_ISSUED',
        entityType: 'FiscalDocument',
        entityId: document.id,
        metadata: {},
      });

      return { ok: true, document, alreadyIssued: false };
    });
  }

  /**
   * Rectifies a previously issued simplified/full invoice, tenant-scoped end to end.
   * The original document must belong to the tenant, be `status: 'ISSUED'`
   * and a rectifiable document type — anything else is
   * `INVALID_DOCUMENT_STATE`. Idempotent: if a rectifying document row
   * already exists for `originalDocumentId`, it is returned unchanged — no
   * second invoice number is burned, no second PDF is written to storage,
   * and no second integrityChainRecords row is inserted. The invoiceSeries
   * increment, fiscalDocuments insert, integrityChainRecords insert (with
   * previousHash chained from the tenant's most recent record) and
   * auditEvents insert all happen inside a single transaction.
   */
  async rectify(input: RectifyInvoiceInput): Promise<RectifyInvoiceResult> {
    return this.db.transaction(async (transaction) => {
      const [original] = await transaction
        .select()
        .from(fiscalDocuments)
        .where(and(eq(fiscalDocuments.tenantId, input.tenantId), eq(fiscalDocuments.id, input.fiscalDocumentId)))
        .limit(1);
      if (!original) return { ok: false, reason: 'DOCUMENT_NOT_FOUND' };
      if (original.status !== 'ISSUED' || !originalDocumentCanBeRectified(original.documentType)) {
        return { ok: false, reason: 'INVALID_DOCUMENT_STATE' };
      }

      const [existing] = await transaction
        .select()
        .from(fiscalDocuments)
        .where(and(
          eq(fiscalDocuments.tenantId, input.tenantId),
          eq(fiscalDocuments.originalDocumentId, original.id),
          inArray(fiscalDocuments.documentType, documentTypeSeriesCandidates(RECTIFYING_DOCUMENT_TYPE)),
        ))
        .limit(1);
      if (existing) return { ok: true, document: existing, alreadyRectified: true };

      const [operation] = await transaction
        .select()
        .from(canonicalOperations)
        .where(and(eq(canonicalOperations.tenantId, input.tenantId), eq(canonicalOperations.id, original.canonicalOperationId)))
        .limit(1);
      if (!operation) return { ok: false, reason: 'DOCUMENT_NOT_FOUND' };

      const [decision] = await transaction
        .select()
        .from(taxDecisions)
        .where(and(eq(taxDecisions.tenantId, input.tenantId), eq(taxDecisions.canonicalOperationId, original.canonicalOperationId)))
        .orderBy(desc(taxDecisions.decidedAt))
        .limit(1);
      const [issuer] = await transaction
        .select()
        .from(legalEntities)
        .where(and(eq(legalEntities.tenantId, input.tenantId), eq(legalEntities.id, operation.legalEntityId)))
        .limit(1);

      const [existingSeries] = await transaction
        .select()
        .from(invoiceSeries)
        .where(and(
          eq(invoiceSeries.tenantId, input.tenantId),
          eq(invoiceSeries.legalEntityId, operation.legalEntityId),
          inArray(invoiceSeries.documentType, documentTypeSeriesCandidates(RECTIFYING_DOCUMENT_TYPE)),
        ))
        .limit(1);

      const seriesRow = existingSeries ?? (await transaction
        .insert(invoiceSeries)
        .values({
          tenantId: input.tenantId,
          legalEntityId: operation.legalEntityId,
          code: 'FR',
          documentType: RECTIFYING_DOCUMENT_TYPE,
          nextNumber: '1',
        })
        .returning())[0];
      if (!seriesRow) throw new Error('No se pudo inicializar la serie de facturación rectificativa');

      const issuedAt = new Date();
      const sequence = new InvoiceSequence(seriesRow.code, Number(seriesRow.nextNumber));
      const rectification = await rectifyInvoice(
        sequence,
        {
          id: original.id,
          number: original.number,
          type: original.documentType as 'SIMPLIFICADA' | 'COMPLETA' | 'FULL_INVOICE',
          input: {
            operationId: operation.id,
            customerLabel: operation.sourceOrderId ? `Operación ${operation.sourceOrderId}` : `Operación ${operation.id}`,
            ...(operation.customerAddress ? { customerAddress: operation.customerAddress } : {}),
            ...(operation.customerEmail ? { customerEmail: operation.customerEmail } : {}),
            issuerName: issuer?.legalName ?? 'Emisor fiscal',
            ...(issuer?.address ? { issuerAddress: issuer.address } : {}),
            description: `Operación ${operation.operationType}`,
            taxBase: Number(original.taxBase),
            taxRate: Number(decision?.taxRate ?? 0),
            taxAmount: Number(original.taxAmount),
            totalAmount: Number(original.totalAmount),
            currency: 'EUR',
            issuedAt: original.issuedAt.toISOString(),
          },
          pdfBytes: new Uint8Array(0),
          sha256: original.renderSha256,
          status: 'ISSUED',
        },
        issuedAt.toISOString(),
      );

      await transaction
        .update(invoiceSeries)
        .set({ nextNumber: String(Number(seriesRow.nextNumber) + 1) })
        .where(eq(invoiceSeries.id, seriesRow.id));

      const stored = await input.storage.put({ tenantId: input.tenantId, bytes: rectification.pdfBytes, mimeType: 'application/pdf' });

      const [document] = await transaction
        .insert(fiscalDocuments)
        .values({
          tenantId: input.tenantId,
          canonicalOperationId: original.canonicalOperationId,
          number: rectification.number,
          documentType: rectification.type,
          status: 'ISSUED',
          originalDocumentId: original.id,
          issuedAt,
          taxBase: String(rectification.input.taxBase),
          taxAmount: String(rectification.input.taxAmount),
          totalAmount: String(rectification.input.totalAmount),
          currency: 'EUR',
          renderStorageKey: stored.key,
          renderSha256: rectification.sha256,
        })
        .returning();
      if (!document) throw new Error('No se pudo crear el documento fiscal rectificativo');

      const [lastRecord] = await transaction
        .select()
        .from(integrityChainRecords)
        .where(eq(integrityChainRecords.tenantId, input.tenantId))
        .orderBy(desc(integrityChainRecords.createdAt))
        .limit(1);

      const integrityRecord = createIntegrityRecord(
        {
          documentId: document.id,
          documentNumber: rectification.number,
          recordType: 'ANULACION',
          issuedAt: issuedAt.toISOString(),
          totalAmount: rectification.input.totalAmount,
          taxAmount: rectification.input.taxAmount,
          ...(lastRecord ? { previousHash: lastRecord.hash } : {}),
        },
        issuedAt.toISOString(),
      );

      await transaction.insert(integrityChainRecords).values({
        tenantId: input.tenantId,
        fiscalDocumentId: document.id,
        recordType: 'ANULACION',
        canonicalPayload: integrityRecord.canonicalPayload,
        previousHash: integrityRecord.previousHash ?? null,
        hash: integrityRecord.hash,
        algorithm: integrityRecord.algorithm,
      });

      await transaction.insert(auditEvents).values({
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: 'INVOICE_RECTIFIED',
        entityType: 'FiscalDocument',
        entityId: document.id,
        metadata: {},
      });

      return { ok: true, document, alreadyRectified: false };
    });
  }
}
