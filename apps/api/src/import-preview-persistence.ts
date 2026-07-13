  import { createCipheriv, createHash, randomBytes } from 'node:crypto';
  import type { ImportPreviewResponse } from './import-service.js';
import { esCobroShopifyConfirmado } from '@anclora/core';

export interface ImportPreviewRepositoryPort {
  persist(input: {
    tenantId: string;
    jobId: string;
    connectorId: string;
    importerVersion: string;
    originalNameEncrypted: string;
    evidence: ImportPreviewResponse['evidence'];
    summary: Record<string, unknown>;
    issues: ImportPreviewResponse['issues'];
  }): Promise<{ jobId: string; importFileId: string; duplicate: boolean; issueIds?: string[] }>;
}

export interface RoyaltyRepositoryPort {
  persist(input: {
    tenantId: string;
    importFileId: string;
    statement: NonNullable<ImportPreviewResponse['royalty']>['statement'];
    lines: NonNullable<ImportPreviewResponse['royalty']>['lines'];
  }): Promise<{ statementId: string; duplicate: boolean }>;
}

export interface PersistedCommercialOrder { id: string; externalOrderId: string; }
export interface PersistedFinancialEvent { id: string; orderReference: string | null; }

export interface CommercialOrdersRepositoryPort {
  createMany(tenantId: string, orders: NonNullable<ImportPreviewResponse['commercialOrders']>): Promise<PersistedCommercialOrder[]>;
  findByExternalOrderId?(tenantId: string, externalOrderId: string): Promise<{ id: string } | undefined>;
  /**
   * SHOPIFY-02: dual order+lines write, one transaction per grouped order,
   * idempotent on both `orders_external_uq` and `order_lines_external_uq` —
   * never overwrites an existing order/line on re-import. Optional so
   * existing test doubles that only implement createMany() keep compiling;
   * persistFiscalRecords() falls back to createMany() (order-only, no
   * lines) when this isn't provided.
   */
  createManyWithLines?(tenantId: string, groups: NonNullable<ImportPreviewResponse['commercialOrderGroups']>): Promise<{ orders: PersistedCommercialOrder[] }>;
}

export interface FinancialEventsWriteRepositoryPort {
  createMany(tenantId: string, events: NonNullable<ImportPreviewResponse['financialEvents']>): Promise<PersistedFinancialEvent[]>;
  findByOrderReference?(tenantId: string, orderReference: string): Promise<unknown[]>;
}

export interface ConfirmedOrderFiscalCasePort {
  createForConfirmedOrder(tenantId: string, commercialOrderId: string): Promise<unknown>;
}

export interface PersistedShopifyOrderPaymentEvent {
  id: string;
  commercialOrderId?: string | null;
  kind?: string;
  status?: string;
}
export interface PersistedShopifyPaymentsLedgerEntry { id: string; }

/**
 * SHOPIFY-03: order-level payment-transaction evidence writer. Rows already
 * carry `commercialOrderId` (nullable) -- persistFiscalRecords resolves it
 * per row via CommercialOrdersRepositoryPort.findByExternalOrderId
 * (shopifyOrderName as the join key) before calling this, attaching
 * ORDER_EVIDENCE_MISSING when unresolved rather than blocking the write.
 */
export interface ShopifyOrderPaymentEventsRepositoryPort {
  createMany(
    tenantId: string,
    importFileId: string,
    rows: Array<NonNullable<ImportPreviewResponse['orderTransactions']>[number] & { commercialOrderId: string | null }>,
  ): Promise<PersistedShopifyOrderPaymentEvent[]>;
}

/**
 * SHOPIFY-03: platform settlement-ledger evidence writer -- distinct from
 * FinancialEventsWriteRepositoryPort/financial_events (the existing matching
 * pipeline). A real `payouts` row is created by the repository layer only
 * when a row carries `externalPayoutId`.
 */
export interface ShopifyPaymentsLedgerRepositoryPort {
  createMany(
    tenantId: string,
    importFileId: string,
    rows: Array<NonNullable<ImportPreviewResponse['paymentsLedger']>[number] & { commercialOrderId: string | null }>,
  ): Promise<{ entries: PersistedShopifyPaymentsLedgerEntry[] }>;
}

export interface ShopifyEvidenceLinksRepositoryPort {
  linkTenantEvidence(tenantId: string, input: { windowDays: number }): Promise<void>;
}

export interface ImportPreviewPersistencePort {
  persist(tenantId: string, filename: string, preview: ImportPreviewResponse): Promise<{ jobId: string; duplicate: boolean; issueIds?: string[] }>;
}

/**
 * FASE 03: the fiscal-record-creation step (commercial_orders/financial_events/
 * royalty_lines + the matching trigger) is confirm-exclusive -- it must never
 * run at preview/analysis time. This port is what import-lifecycle-service.ts's
 * confirmImportJob calls once a job has passed blocking-issue gating.
 */
export interface FiscalPersistencePort {
  persistFiscalRecords(tenantId: string, importFileId: string, preview: ImportPreviewResponse): Promise<{ createdRecordIds: Record<string, string[]> }>;
}

export class ImportMetadataCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 32) throw new Error('IMPORT_METADATA_SECRET debe contener al menos 32 caracteres');
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
  }
}

const IMPORTER_VERSIONS: Record<ImportPreviewResponse['connector'], string> = {
  'shopify-csv': 'shopify-csv@0.1.0',
  'shopify-orders-csv': 'shopify-orders-csv@0.1.0',
  'shopify-order-transactions-csv': 'shopify-order-transactions-csv@0.1.0',
  'kdp-xlsx': 'kdp-xlsx@0.1.0',
  'expenses-csv': 'expenses-csv@0.1.0',
  'expenses-pdf': 'expenses-pdf@0.1.0',
};

export class ImportPreviewPersistenceService implements ImportPreviewPersistencePort, FiscalPersistencePort {
  constructor(
    private readonly repository: ImportPreviewRepositoryPort,
    private readonly cipher: ImportMetadataCipher,
    private readonly royaltyRepository?: RoyaltyRepositoryPort,
    private readonly commercialOrdersRepository?: CommercialOrdersRepositoryPort,
    private readonly financialEventsRepository?: FinancialEventsWriteRepositoryPort,
    private readonly confirmedOrderFiscalCaseService?: ConfirmedOrderFiscalCasePort,
    private readonly shopifyOrderPaymentEventsRepository?: ShopifyOrderPaymentEventsRepositoryPort,
    private readonly shopifyPaymentsLedgerRepository?: ShopifyPaymentsLedgerRepositoryPort,
    private readonly shopifyEvidenceLinksRepository?: ShopifyEvidenceLinksRepositoryPort,
    private readonly expensesRepository?: { createSupplier(input: { tenantId:string; taxIdEncrypted?:string; normalizedTaxIdHash?:string; legalName:string; countryCode:string; source:string }): Promise<{id:string}>; createPurchase(input: Record<string,unknown>): Promise<{document:{id?:string};duplicate:boolean}> },
  ) {}

  /**
   * Analysis/bookkeeping only (FASE 03): creates/updates the import_jobs row
   * (status ANALYZED), the import_files + evidence_documents rows (evidence
   * custody, sha256, encrypted filename) and import_errors (the issue list).
   * Deliberately does NOT create commercial_orders/financial_events/
   * royalty_lines and does NOT run matching -- see persistFiscalRecords(),
   * which is called from confirm time only.
   */
  async persist(tenantId: string, filename: string, preview: ImportPreviewResponse): Promise<{ jobId: string; duplicate: boolean; issueIds?: string[] }> {
    const result = await this.repository.persist({
      tenantId,
      jobId: preview.jobId,
      connectorId: preview.connector,
      importerVersion: IMPORTER_VERSIONS[preview.connector],
      originalNameEncrypted: this.cipher.encrypt(filename),
      evidence: preview.evidence,
      summary: preview.summary,
      issues: preview.issues,
    });

    return { jobId: result.jobId, duplicate: result.duplicate, ...(result.issueIds?.length ? { issueIds: result.issueIds } : {}) };
  }

  /**
   * Fiscal persistence (FASE 03, confirm-exclusive): creates the real
   * commercial_orders/financial_events/royalty_lines records for an already-
   * analyzed job and runs matching for the newly-created rows. Called by
   * confirmImportJob (import-lifecycle-service.ts) once blocking-issue
   * gating has passed -- never at preview time.
   */
  async persistFiscalRecords(tenantId: string, importFileId: string, preview: ImportPreviewResponse): Promise<{ createdRecordIds: Record<string, string[]> }> {
    const createdRecordIds: Record<string, string[]> = {};

    if (preview.expenses && this.expensesRepository) { const ids:string[]=[]; for (const row of preview.expenses.documents) { const taxId=row.supplierTaxId.replace(/\s/g,'').toUpperCase(); const supplier=await this.expensesRepository.createSupplier({tenantId,legalName:row.supplierName,countryCode:row.country,source:'CSV',...(taxId?{taxIdEncrypted:this.cipher.encrypt(taxId),normalizedTaxIdHash:createHash('sha256').update(taxId).digest('hex')}:{})}); const result=await this.expensesRepository.createPurchase({tenantId,supplierId:supplier.id,documentType:row.documentType,documentNumber:row.invoiceNumber,issueDate:row.issueDate,currency:row.currency,taxBase:String(row.taxBase),vatAmount:String(row.vatAmount),totalAmount:String(row.total),withholdingAmount:String(row.withholding),categoryCode:row.category,description:row.description,status:'REVIEW',storageKey:`import:${importFileId}`,sha256:preview.evidence.sha256,mimeType:preview.evidence.mimeType,importFileId}); if(!result.duplicate&&result.document.id)ids.push(result.document.id); } createdRecordIds.purchaseDocuments=ids; }

    if (this.royaltyRepository && preview.royalty) {
      const royaltyResult = await this.royaltyRepository.persist({
        tenantId,
        importFileId,
        statement: preview.royalty.statement,
        lines: preview.royalty.lines,
      });
      createdRecordIds.royaltyStatements = [royaltyResult.statementId];
    }

    if (this.commercialOrdersRepository && preview.commercialOrderGroups && this.commercialOrdersRepository.createManyWithLines) {
      // SHOPIFY-02: order + lines, one transaction per grouped order,
      // idempotent on both unique indexes — never overwrites existing rows.
      const result = await this.commercialOrdersRepository.createManyWithLines(tenantId, preview.commercialOrderGroups);
      createdRecordIds.commercialOrders = result.orders.map((order) => order.id);
    } else if (this.commercialOrdersRepository && preview.commercialOrders) {
      const createdOrders = await this.commercialOrdersRepository.createMany(tenantId, preview.commercialOrders);
      createdRecordIds.commercialOrders = createdOrders.map((order) => order.id);
    }

    if (this.financialEventsRepository && preview.financialEvents) {
      const createdEvents = await this.financialEventsRepository.createMany(tenantId, preview.financialEvents);
      createdRecordIds.financialEvents = createdEvents.map((event) => event.id);
    }

    if (this.shopifyOrderPaymentEventsRepository && preview.orderTransactions) {
      const rows = await this.resolveShopifyOrderName(tenantId, preview.orderTransactions);
      const created = await this.shopifyOrderPaymentEventsRepository.createMany(tenantId, importFileId, rows);
      createdRecordIds.shopifyOrderPaymentEvents = created.map((row) => row.id);
      await this.triggerFiscalOperationForConfirmedPaymentEvents(tenantId, created);
    }

    if (this.shopifyPaymentsLedgerRepository && preview.paymentsLedger) {
      const rows = await this.resolveShopifyOrderName(tenantId, preview.paymentsLedger);
      const { entries } = await this.shopifyPaymentsLedgerRepository.createMany(tenantId, importFileId, rows);
      createdRecordIds.shopifyPaymentsLedgerEntries = entries.map((row) => row.id);
    }

    if (preview.connector.startsWith('shopify-') && this.shopifyEvidenceLinksRepository) {
      await this.shopifyEvidenceLinksRepository.linkTenantEvidence(tenantId, { windowDays: 7 });
    }

    return { createdRecordIds };
  }

  /**
   * SHOPIFY-03: resolves `commercialOrderId` per row via
   * CommercialOrdersRepositoryPort.findByExternalOrderId, using
   * `shopifyOrderName` as the join key (never the raw numeric
   * `shopifyOrderId` -- see migration 0014's linkage-field note). A miss is
   * non-fatal: the row is still persisted, with `commercialOrderId: null` --
   * this is the ORDER_EVIDENCE_MISSING case, logged rather than blocking the
   * whole import, matching the non-fatal pattern used by
   * triggerMatchingForNewOrders/Events above.
   */
  private async resolveShopifyOrderName<T extends { shopifyOrderName: string }>(tenantId: string, rows: readonly T[]): Promise<Array<T & { commercialOrderId: string | null }>> {
    if (!this.commercialOrdersRepository?.findByExternalOrderId) {
      return rows.map((row) => ({ ...row, commercialOrderId: null }));
    }
    const findByExternalOrderId = this.commercialOrdersRepository.findByExternalOrderId;
    return Promise.all(rows.map(async (row) => {
      try {
        const order = await findByExternalOrderId(tenantId, row.shopifyOrderName);
        if (!order) {
          console.warn(`[import-preview-persistence] ORDER_EVIDENCE_MISSING: pedido ${row.shopifyOrderName} no encontrado en commercial_orders para el tenant ${tenantId}`);
        }
        return { ...row, commercialOrderId: order?.id ?? null };
      } catch (error) {
        console.error(`[import-preview-persistence] Fallo al resolver commercial_order_id para ${row.shopifyOrderName}`, error);
        return { ...row, commercialOrderId: null };
      }
    }));
  }

  /**
   * FASE 4: fiscal case creation and automatic issuance are triggered from a
   * persisted Shopify payment transaction that proves a successful charge
   * (`sale`/`capture` + success), never from the order CSV, ledger, payout or
   * bank reconciliation. Non-fatal per event: an issuance failure must not
   * roll back the confirmed evidence import.
   */
  private async triggerFiscalOperationForConfirmedPaymentEvents(
    tenantId: string,
    events: PersistedShopifyOrderPaymentEvent[],
  ): Promise<void> {
    if (!this.confirmedOrderFiscalCaseService) return;
    const processedOrderIds = new Set<string>();
    for (const event of events) {
      if (!event.commercialOrderId || processedOrderIds.has(event.commercialOrderId) || !isConfirmedPaymentEvent(event)) continue;
      processedOrderIds.add(event.commercialOrderId);
      try {
        await this.confirmedOrderFiscalCaseService.createForConfirmedOrder(tenantId, event.commercialOrderId);
      } catch (error) {
        console.error(`[import-preview-persistence] Fallo al crear la operación fiscal para el pago confirmado ${event.id}`, error);
      }
    }
  }
}

function isConfirmedPaymentEvent(
  event: PersistedShopifyOrderPaymentEvent,
): boolean {
  return esCobroShopifyConfirmado(event);
}
