import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import type { ImportPreviewResponse } from './import-service.js';

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
  }): Promise<{ jobId: string; importFileId: string; duplicate: boolean }>;
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

export interface MatchingServicePort {
  runMatchingForOrder(tenantId: string, commercialOrderId: string): Promise<unknown>;
}

export interface PersistedShopifyOrderPaymentEvent { id: string; }
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

export interface ImportPreviewPersistencePort {
  persist(tenantId: string, filename: string, preview: ImportPreviewResponse): Promise<{ jobId: string; duplicate: boolean }>;
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
};

export class ImportPreviewPersistenceService implements ImportPreviewPersistencePort, FiscalPersistencePort {
  constructor(
    private readonly repository: ImportPreviewRepositoryPort,
    private readonly cipher: ImportMetadataCipher,
    private readonly royaltyRepository?: RoyaltyRepositoryPort,
    private readonly commercialOrdersRepository?: CommercialOrdersRepositoryPort,
    private readonly financialEventsRepository?: FinancialEventsWriteRepositoryPort,
    private readonly matchingService?: MatchingServicePort,
    private readonly shopifyOrderPaymentEventsRepository?: ShopifyOrderPaymentEventsRepositoryPort,
    private readonly shopifyPaymentsLedgerRepository?: ShopifyPaymentsLedgerRepositoryPort,
  ) {}

  /**
   * Analysis/bookkeeping only (FASE 03): creates/updates the import_jobs row
   * (status ANALYZED), the import_files + evidence_documents rows (evidence
   * custody, sha256, encrypted filename) and import_errors (the issue list).
   * Deliberately does NOT create commercial_orders/financial_events/
   * royalty_lines and does NOT run matching -- see persistFiscalRecords(),
   * which is called from confirm time only.
   */
  async persist(tenantId: string, filename: string, preview: ImportPreviewResponse): Promise<{ jobId: string; duplicate: boolean }> {
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

    return { jobId: result.jobId, duplicate: result.duplicate };
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
      await this.triggerMatchingForNewOrders(tenantId, result.orders);
    } else if (this.commercialOrdersRepository && preview.commercialOrders) {
      const createdOrders = await this.commercialOrdersRepository.createMany(tenantId, preview.commercialOrders);
      createdRecordIds.commercialOrders = createdOrders.map((order) => order.id);
      await this.triggerMatchingForNewOrders(tenantId, createdOrders);
    }

    if (this.financialEventsRepository && preview.financialEvents) {
      const createdEvents = await this.financialEventsRepository.createMany(tenantId, preview.financialEvents);
      createdRecordIds.financialEvents = createdEvents.map((event) => event.id);
      await this.triggerMatchingForNewEvents(tenantId, createdEvents);
    }

    if (this.shopifyOrderPaymentEventsRepository && preview.orderTransactions) {
      const rows = await this.resolveShopifyOrderName(tenantId, preview.orderTransactions);
      const created = await this.shopifyOrderPaymentEventsRepository.createMany(tenantId, importFileId, rows);
      createdRecordIds.shopifyOrderPaymentEvents = created.map((row) => row.id);
    }

    if (this.shopifyPaymentsLedgerRepository && preview.paymentsLedger) {
      const rows = await this.resolveShopifyOrderName(tenantId, preview.paymentsLedger);
      const { entries } = await this.shopifyPaymentsLedgerRepository.createMany(tenantId, importFileId, rows);
      createdRecordIds.shopifyPaymentsLedgerEntries = entries.map((row) => row.id);
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
   * Automatic-on-import trigger (orders-CSV imported first, or re-imported
   * after a prior payment-transactions import already landed): for each
   * newly-created commercial order, check whether a counterpart
   * financial_events row already exists for the tenant by orderReference —
   * if so, run matching now. Non-fatal: a matching failure must never break
   * the import commit itself.
   */
  private async triggerMatchingForNewOrders(tenantId: string, createdOrders: PersistedCommercialOrder[]): Promise<void> {
    if (!this.matchingService || !this.financialEventsRepository?.findByOrderReference) return;
    for (const order of createdOrders) {
      try {
        const counterparts = await this.financialEventsRepository.findByOrderReference(tenantId, order.externalOrderId);
        if (counterparts.length > 0) {
          await this.matchingService.runMatchingForOrder(tenantId, order.id);
        }
      } catch (error) {
        console.error(`[import-preview-persistence] Fallo al ejecutar el emparejamiento automático para el pedido ${order.id}`, error);
      }
    }
  }

  /**
   * Symmetric case: payment-transactions CSV imported first (or re-imported
   * after a prior orders-CSV import already landed) — for each newly-created
   * financial event with an orderReference, check whether a matching
   * commercial order already exists for the tenant, and run matching from
   * that direction too. Non-fatal, same as triggerMatchingForNewOrders.
   */
  private async triggerMatchingForNewEvents(tenantId: string, createdEvents: PersistedFinancialEvent[]): Promise<void> {
    if (!this.matchingService || !this.commercialOrdersRepository?.findByExternalOrderId) return;
    for (const event of createdEvents) {
      if (!event.orderReference) continue;
      try {
        const order = await this.commercialOrdersRepository.findByExternalOrderId(tenantId, event.orderReference);
        if (order) {
          await this.matchingService.runMatchingForOrder(tenantId, order.id);
        }
      } catch (error) {
        console.error(`[import-preview-persistence] Fallo al ejecutar el emparejamiento automático para el evento ${event.id}`, error);
      }
    }
  }
}
