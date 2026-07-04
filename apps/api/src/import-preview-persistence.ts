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
}

export interface FinancialEventsWriteRepositoryPort {
  createMany(tenantId: string, events: NonNullable<ImportPreviewResponse['financialEvents']>): Promise<PersistedFinancialEvent[]>;
  findByOrderReference?(tenantId: string, orderReference: string): Promise<unknown[]>;
}

export interface MatchingServicePort {
  runMatchingForOrder(tenantId: string, commercialOrderId: string): Promise<unknown>;
}

export interface ImportPreviewPersistencePort {
  persist(tenantId: string, filename: string, preview: ImportPreviewResponse): Promise<{ jobId: string; duplicate: boolean }>;
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
  'kdp-xlsx': 'kdp-xlsx@0.1.0',
};

export class ImportPreviewPersistenceService implements ImportPreviewPersistencePort {
  constructor(
    private readonly repository: ImportPreviewRepositoryPort,
    private readonly cipher: ImportMetadataCipher,
    private readonly royaltyRepository?: RoyaltyRepositoryPort,
    private readonly commercialOrdersRepository?: CommercialOrdersRepositoryPort,
    private readonly financialEventsRepository?: FinancialEventsWriteRepositoryPort,
    private readonly matchingService?: MatchingServicePort,
  ) {}

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

    if (result.duplicate) {
      return { jobId: result.jobId, duplicate: result.duplicate };
    }

    if (this.royaltyRepository && preview.royalty) {
      await this.royaltyRepository.persist({
        tenantId,
        importFileId: result.importFileId,
        statement: preview.royalty.statement,
        lines: preview.royalty.lines,
      });
    }

    if (this.commercialOrdersRepository && preview.commercialOrders) {
      const createdOrders = await this.commercialOrdersRepository.createMany(tenantId, preview.commercialOrders);
      await this.triggerMatchingForNewOrders(tenantId, createdOrders);
    }

    if (this.financialEventsRepository && preview.financialEvents) {
      const createdEvents = await this.financialEventsRepository.createMany(tenantId, preview.financialEvents);
      await this.triggerMatchingForNewEvents(tenantId, createdEvents);
    }

    return { jobId: result.jobId, duplicate: result.duplicate };
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
