import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core/session';
import {
  createIntegrityRecord,
  decryptTaxIdentity,
  InvoiceSequence,
  issueInvoice,
  rectifyInvoice,
  type StoragePort,
} from '@anclora/core/server';
import {
  auditEvents,
  canonicalOperations,
  fiscalDocuments,
  integrityChainRecords,
  invoiceSeries,
  legalEntities,
  productTaxProfiles,
  shopifyOrderPaymentEvents,
  taxDecisions,
} from './schema.js';
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
  | {
      ok: true;
      document: FiscalDocument;
      alreadyIssued: boolean;
    }
  | {
      ok: false;
      reason:
        | 'OPERATION_NOT_FOUND'
        | 'TAX_DECISION_MISSING'
        | 'FISCAL_CONFIGURATION_INCOMPLETE'
        | 'DECISION_FISCAL_NO_EMITIBLE'
        | 'COBRO_SHOPIFY_NO_CONFIRMADO'
        | 'CONFIGURACION_FISCAL_INCOMPLETA'
        | 'IMPORTE_CERO_EN_REVISION';
    };

export interface RectifyInvoiceInput {
  tenantId: string;
  /** See IssueInvoiceInput.actorId — `null` for automatic issuance. */
  actorId: string | null;
  fiscalDocumentId: string;
  storage: StoragePort;
}

export type RectifyInvoiceResult =
  | { ok: true; document: FiscalDocument; alreadyRectified: boolean }
  | { ok: false; reason: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE' | 'CONFIGURACION_FISCAL_INCOMPLETA' };

const SIMPLIFIED_DOCUMENT_TYPE = 'SIMPLIFICADA';
const FULL_DOCUMENT_TYPE = 'COMPLETA';
const RECTIFYING_DOCUMENT_TYPE = 'RECTIFICATIVA';
const LEGACY_FULL_INVOICE_DOCUMENT_TYPE = 'FULL_INVOICE';
const LEGACY_RECTIFYING_INVOICE_DOCUMENT_TYPE = 'RECTIFYING_INVOICE';

type InvoiceNumberAllocator<TQueryResult extends PgQueryResultHKT> = Pick<
  PgDatabase<TQueryResult, typeof schema>,
  'update'
>;

function documentTypeSeriesCandidates(documentType: string): string[] {
  if (documentType === SIMPLIFIED_DOCUMENT_TYPE) return [SIMPLIFIED_DOCUMENT_TYPE, 'SIMPLIFIED_INVOICE'];
  if (documentType === RECTIFYING_DOCUMENT_TYPE) return [RECTIFYING_DOCUMENT_TYPE, LEGACY_RECTIFYING_INVOICE_DOCUMENT_TYPE];
  return [FULL_DOCUMENT_TYPE, LEGACY_FULL_INVOICE_DOCUMENT_TYPE];
}

function originalDocumentCanBeRectified(documentType: string) {
  return [SIMPLIFIED_DOCUMENT_TYPE, FULL_DOCUMENT_TYPE, LEGACY_FULL_INVOICE_DOCUMENT_TYPE].includes(documentType);
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };

  return candidate.code === '23505'
    || String(candidate.message ?? '').includes('duplicate key')
    || String(error).includes('duplicate key');
}

async function allocateInvoiceNumber<TQueryResult extends PgQueryResultHKT>(
  transaction: InvoiceNumberAllocator<TQueryResult>,
  seriesId: string,
): Promise<{ code: string; allocatedNumber: number }> {
  const [updatedSeries] = await transaction
    .update(invoiceSeries)
    .set({
      nextNumber: sql`${invoiceSeries.nextNumber} + 1`,
    })
    .where(eq(invoiceSeries.id, seriesId))
    .returning({
      code: invoiceSeries.code,
      nextNumber: invoiceSeries.nextNumber,
    });

  if (!updatedSeries) {
    throw new Error('No se pudo reservar número fiscal');
  }

  const nextNumberAfterReservation = Number(updatedSeries.nextNumber);
  const allocatedNumber = nextNumberAfterReservation - 1;

  if (!Number.isInteger(allocatedNumber) || allocatedNumber < 1) {
    throw new Error('Número fiscal reservado inválido');
  }

  return {
    code: updatedSeries.code,
    allocatedNumber,
  };
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
    try {
      return await this.db.transaction(async (transaction) => {
      const [operation] = await transaction
        .select()
        .from(canonicalOperations)
        .where(and(eq(canonicalOperations.tenantId, input.tenantId), eq(canonicalOperations.id, input.canonicalOperationId)))
        .limit(1);
      if (!operation) return { ok: false, reason: 'OPERATION_NOT_FOUND' };

      const [decision] = await transaction
  .select()
  .from(taxDecisions)
  .where(and(
    eq(taxDecisions.tenantId, input.tenantId),
    eq(
      taxDecisions.canonicalOperationId,
      input.canonicalOperationId,
    ),
  ))
  .orderBy(desc(taxDecisions.decidedAt))
  .limit(1);

if (!decision) {
  return { ok: false, reason: 'TAX_DECISION_MISSING' };
}

const importeTotalDecision = Number(
  decision.totalAmount ?? operation.grossAmount ?? 0,
);

if (!Number.isFinite(importeTotalDecision)) {
  return {
    ok: false,
    reason: 'DECISION_FISCAL_NO_EMITIBLE',
  };
}

if (importeTotalDecision === 0) {
  return {
    ok: false,
    reason: 'IMPORTE_CERO_EN_REVISION',
  };
}

if (importeTotalDecision < 0) {
  return {
    ok: false,
    reason: 'DECISION_FISCAL_NO_EMITIBLE',
  };
}

if (decision.status !== 'DETERMINADA') {
  return {
    ok: false,
    reason: 'DECISION_FISCAL_NO_EMITIBLE',
  };
}

// Se admite el valor histórico únicamente para leer decisiones antiguas.
// Los documentos nuevos se emiten siempre con el valor canónico español.
      const tipoDocumentoDecision =
        decision.documentType === 'SIMPLIFIED_INVOICE'
          ? SIMPLIFIED_DOCUMENT_TYPE
          : decision.documentType;

      if (tipoDocumentoDecision !== SIMPLIFIED_DOCUMENT_TYPE) {
        return {
          ok: false,
          reason: 'DECISION_FISCAL_NO_EMITIBLE',
        };
      }

      const documentType = SIMPLIFIED_DOCUMENT_TYPE;

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

      if (!operation.sourceOrderId) {
        return {
          ok: false,
          reason: 'COBRO_SHOPIFY_NO_CONFIRMADO',
        };
      }

      const [cobroShopifyConfirmado] = await transaction
        .select({
          id: shopifyOrderPaymentEvents.id,
        })
        .from(shopifyOrderPaymentEvents)
        .where(and(
          eq(shopifyOrderPaymentEvents.tenantId, input.tenantId),
          eq(
            shopifyOrderPaymentEvents.shopifyOrderName,
            operation.sourceOrderId,
          ),
          sql`lower(${shopifyOrderPaymentEvents.kind}) in ('sale', 'capture')`,
          sql`lower(${shopifyOrderPaymentEvents.status}) in ('success', 'succeeded')`,
        ))
        .limit(1);

      if (!cobroShopifyConfirmado) {
        return {
          ok: false,
          reason: 'COBRO_SHOPIFY_NO_CONFIRMADO',
        };
      }

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
      if (!issuer || !productProfile || !issuer.address) {
  return {
    ok: false,
    reason: 'FISCAL_CONFIGURATION_INCOMPLETE',
  };
}

if (!issuer.taxIdentityEncrypted) {
  return {
    ok: false,
    reason: 'CONFIGURACION_FISCAL_INCOMPLETA',
  };
}

let issuerTaxIdentity: string;

try {
  issuerTaxIdentity = decryptTaxIdentity(
    issuer.taxIdentityEncrypted,
  );
} catch {
  return {
    ok: false,
    reason: 'CONFIGURACION_FISCAL_INCOMPLETA',
  };
}

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
      const reserved = await allocateInvoiceNumber(transaction, seriesRow.id);
      const sequence = new InvoiceSequence(reserved.code, reserved.allocatedNumber);

      const invoice = await issueInvoice(sequence, {
        operationId: operation.id,
        issuerName: issuer.legalName,
        issuerTaxIdentity,
        issuerAddress: issuer.address,
        description: productProfile.invoiceDescription,
        taxBase: Number(decision.taxBase ?? 0),
        taxRate: Number(decision.taxRate ?? 0),
        taxAmount: Number(decision.taxAmount ?? 0),
        totalAmount: Number(decision.totalAmount ?? 0),
        currency: 'EUR',
        issuedAt: issuedAt.toISOString(),
      }, documentType);

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
    } catch (error) {
      if (isUniqueViolation(error)) {
        const [existing] = await this.db
          .select()
          .from(fiscalDocuments)
          .where(and(
            eq(fiscalDocuments.tenantId, input.tenantId),
            eq(fiscalDocuments.canonicalOperationId, input.canonicalOperationId),
            inArray(fiscalDocuments.documentType, documentTypeSeriesCandidates(SIMPLIFIED_DOCUMENT_TYPE)),
          ))
          .limit(1);

        if (existing) {
          return { ok: true, document: existing, alreadyIssued: true };
        }
      }

      throw error;
    }
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
    try {
      return await this.db.transaction(async (transaction) => {
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
        .where(and(
          eq(legalEntities.tenantId, input.tenantId),
          eq(legalEntities.id, operation.legalEntityId),
          eq(legalEntities.configurationStatus, 'READY'),
        ))
        .limit(1);

      if (!issuer || !issuer.address || !issuer.taxIdentityEncrypted) {
        return { ok: false, reason: 'CONFIGURACION_FISCAL_INCOMPLETA' };
      }

      let issuerTaxIdentity: string;
      try {
        issuerTaxIdentity = decryptTaxIdentity(issuer.taxIdentityEncrypted);
      } catch {
        return { ok: false, reason: 'CONFIGURACION_FISCAL_INCOMPLETA' };
      }

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
      const reserved = await allocateInvoiceNumber(transaction, seriesRow.id);
      const sequence = new InvoiceSequence(reserved.code, reserved.allocatedNumber);
      const rectification = await rectifyInvoice(
        sequence,
        {
          id: original.id,
          number: original.number,
          type: original.documentType as 'SIMPLIFICADA' | 'COMPLETA' | 'FULL_INVOICE',
          input: {
            operationId: operation.id,
            issuerName: issuer.legalName,
            issuerTaxIdentity,
            issuerAddress: issuer.address,
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
    } catch (error) {
      if (isUniqueViolation(error)) {
        const [existing] = await this.db
          .select()
          .from(fiscalDocuments)
          .where(and(
            eq(fiscalDocuments.tenantId, input.tenantId),
            eq(fiscalDocuments.originalDocumentId, input.fiscalDocumentId),
            inArray(fiscalDocuments.documentType, documentTypeSeriesCandidates(RECTIFYING_DOCUMENT_TYPE)),
          ))
          .limit(1);

        if (existing) {
          return { ok: true, document: existing, alreadyRectified: true };
        }
      }

      throw error;
    }
  }
}
