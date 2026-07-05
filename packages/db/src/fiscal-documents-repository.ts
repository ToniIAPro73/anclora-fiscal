import { and, desc, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import { createIntegrityRecord, InvoiceSequence, issueInvoice, rectifyInvoice, type StoragePort } from '@anclora/core/server';
import { auditEvents, canonicalOperations, fiscalDocuments, integrityChainRecords, invoiceSeries, taxDecisions } from './schema.js';
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
  | { ok: false; reason: 'OPERATION_NOT_FOUND' | 'TAX_DECISION_MISSING' };

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

const FULL_INVOICE_DOCUMENT_TYPE = 'FULL_INVOICE';
const RECTIFYING_INVOICE_DOCUMENT_TYPE = 'RECTIFYING_INVOICE';

export class DrizzleFiscalDocumentsRepository<TQueryResult extends PgQueryResultHKT> {
  constructor(
    private readonly db: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  /**
   * Issues a full invoice for a canonical operation, tenant-scoped end to
   * end. Idempotent: if a FULL_INVOICE fiscalDocuments row already exists
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

      const [existing] = await transaction
        .select()
        .from(fiscalDocuments)
        .where(and(
          eq(fiscalDocuments.tenantId, input.tenantId),
          eq(fiscalDocuments.canonicalOperationId, input.canonicalOperationId),
          eq(fiscalDocuments.documentType, FULL_INVOICE_DOCUMENT_TYPE),
        ))
        .limit(1);
      if (existing) return { ok: true, document: existing, alreadyIssued: true };

      const [decision] = await transaction
        .select()
        .from(taxDecisions)
        .where(and(eq(taxDecisions.tenantId, input.tenantId), eq(taxDecisions.canonicalOperationId, input.canonicalOperationId)))
        .orderBy(desc(taxDecisions.decidedAt))
        .limit(1);
      if (!decision) return { ok: false, reason: 'TAX_DECISION_MISSING' };

      const [existingSeries] = await transaction
        .select()
        .from(invoiceSeries)
        .where(and(
          eq(invoiceSeries.tenantId, input.tenantId),
          eq(invoiceSeries.legalEntityId, operation.legalEntityId),
          eq(invoiceSeries.documentType, FULL_INVOICE_DOCUMENT_TYPE),
        ))
        .limit(1);

      const seriesRow = existingSeries ?? (await transaction
        .insert(invoiceSeries)
        .values({
          tenantId: input.tenantId,
          legalEntityId: operation.legalEntityId,
          code: FULL_INVOICE_DOCUMENT_TYPE,
          documentType: FULL_INVOICE_DOCUMENT_TYPE,
          nextNumber: '1',
        })
        .returning())[0];
      if (!seriesRow) throw new Error('No se pudo inicializar la serie de facturación');

      const issuedAt = new Date();
      const sequence = new InvoiceSequence(seriesRow.code, Number(seriesRow.nextNumber));
      const invoice = await issueInvoice(sequence, {
        operationId: operation.id,
        customerLabel: operation.sourceOrderId ? `Operación ${operation.sourceOrderId}` : `Operación ${operation.id}`,
        ...(operation.customerAddress ? { customerAddress: operation.customerAddress } : {}),
        ...(operation.customerEmail ? { customerEmail: operation.customerEmail } : {}),
        description: `Operación ${operation.operationType}`,
        taxBase: Number(decision.taxBase ?? 0),
        taxRate: Number(decision.taxRate ?? 0),
        taxAmount: Number(decision.taxAmount ?? 0),
        totalAmount: Number(decision.totalAmount ?? 0),
        currency: 'EUR',
        issuedAt: issuedAt.toISOString(),
      });

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
          documentType: FULL_INVOICE_DOCUMENT_TYPE,
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
   * Rectifies a previously issued full invoice, tenant-scoped end to end.
   * The original document must belong to the tenant, be `status: 'ISSUED'`
   * and `documentType: 'FULL_INVOICE'` — anything else is
   * `INVALID_DOCUMENT_STATE`. Idempotent: if a RECTIFYING_INVOICE row
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
      if (original.status !== 'ISSUED' || original.documentType !== FULL_INVOICE_DOCUMENT_TYPE) {
        return { ok: false, reason: 'INVALID_DOCUMENT_STATE' };
      }

      const [existing] = await transaction
        .select()
        .from(fiscalDocuments)
        .where(and(
          eq(fiscalDocuments.tenantId, input.tenantId),
          eq(fiscalDocuments.originalDocumentId, original.id),
          eq(fiscalDocuments.documentType, RECTIFYING_INVOICE_DOCUMENT_TYPE),
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

      const [existingSeries] = await transaction
        .select()
        .from(invoiceSeries)
        .where(and(
          eq(invoiceSeries.tenantId, input.tenantId),
          eq(invoiceSeries.legalEntityId, operation.legalEntityId),
          eq(invoiceSeries.documentType, RECTIFYING_INVOICE_DOCUMENT_TYPE),
        ))
        .limit(1);

      const seriesRow = existingSeries ?? (await transaction
        .insert(invoiceSeries)
        .values({
          tenantId: input.tenantId,
          legalEntityId: operation.legalEntityId,
          code: RECTIFYING_INVOICE_DOCUMENT_TYPE,
          documentType: RECTIFYING_INVOICE_DOCUMENT_TYPE,
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
          type: FULL_INVOICE_DOCUMENT_TYPE,
          input: {
            operationId: operation.id,
            customerLabel: operation.sourceOrderId ? `Operación ${operation.sourceOrderId}` : `Operación ${operation.id}`,
            ...(operation.customerAddress ? { customerAddress: operation.customerAddress } : {}),
            ...(operation.customerEmail ? { customerEmail: operation.customerEmail } : {}),
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
          documentType: RECTIFYING_INVOICE_DOCUMENT_TYPE,
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
