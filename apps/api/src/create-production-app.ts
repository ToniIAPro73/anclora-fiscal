import { FilesystemStorage, VercelBlobStorage } from '@anclora/core/server';
import { createOfflineDatabase, createRemoteDatabase, DrizzleAuthAuditRepository, DrizzleCommercialOrdersRepository, DrizzleDashboardSummaryRepository, DrizzleFinancialEventsRepository, DrizzleFiscalConfigurationRepository, DrizzleFiscalDocumentsRepository, DrizzleImportPreviewRepository, DrizzleIssuesRepository, DrizzleLegalEntitiesRepository, DrizzleOperationsRepository, DrizzlePeriodClosesRepository, DrizzlePeriodReadinessRepository, DrizzleReconciliationRepository, DrizzleRoyaltyRepository, DrizzleShopifyEvidenceLinksRepository, DrizzleShopifyOrderPaymentEventsRepository, DrizzleShopifyPaymentsLedgerRepository, DrizzleShopifySalesRepository, DrizzleSifEventsRepository, DrizzleSystemAlertsRepository, DrizzleTaxDecisionsRepository, DrizzleVatDossiersRepository, DrizzleVerifactuSubmissionsRepository, ensureDevelopmentTenant, migrateOfflineDatabase } from '@anclora/db';
import { resolve } from 'node:path';
import { buildApp } from './build-app.js';
import { ImportMetadataCipher, ImportPreviewPersistenceService, type FiscalPersistencePort, type ImportPreviewPersistencePort } from './import-preview-persistence.js';
import { ConfirmedOrderFiscalCaseService } from './confirmed-order-fiscal-case-service.js';
import { TaxDecisionService } from './tax-decision-service.js';
import { InvoiceIssuanceService } from './invoice-issuance-service.js';
import type { OperationsRepositoryPort } from './operations-controller.js';
import type { FinancialEventsRepositoryPort } from './financial-events-controller.js';
import type { ReconciliationRepositoryPort } from './reconciliation-controller.js';
import type { IssuesRepositoryPort } from './issues-controller.js';
import type { FiscalDocumentsRepositoryPort } from './fiscal-documents-controller.js';
import type { PeriodClosesRepositoryPort } from './period-closes-controller.js';
import type { PeriodReadinessRepositoryPort } from './period-readiness-controller.js';
import type { VatDossiersRepositoryPort } from './vat-dossier-controller.js';
import type { SifEventsRepositoryPort } from './sif-events-controller.js';
import type { SystemAlertsRepositoryPort } from './system-alerts-controller.js';
import type { VerifactuSubmissionsRepositoryPort } from './verifactu-submissions-controller.js';
import type { DashboardSummaryRepositoryPort } from './dashboard-controller.js';
import type { ImportLifecycleRepositoryPort } from './import-lifecycle-controller.js';
import { AuthService, ConfiguredIdentityProvider } from './auth-service.js';
import type { CommercialOrdersDedupPort, FinancialEventsDedupPort, RoyaltyDedupPort } from './import-service.js';
import type { FiscalConfigurationRepositoryPort } from './fiscal-configuration-controller.js';
import type { CommercialOrdersRepositoryPort } from './commercial-orders-controller.js';
import type { ShopifyEvidenceLinksRepositoryPort } from './shopify-evidence-links-controller.js';
import type { ShopifySalesRepositoryPort } from './shopify-sales-controller.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createInternalVerifactuSubmissionExecutionService } from './verifactu-runtime.js';
import {
  processDueVerifactuSubmissions,
  type VerifactuDueRepositoryPort,
} from './verifactu-due-processor.js';

// Reads env vars and wires storage/repositories/auth for production or the
// local offline (PGlite) database, then builds the Fastify app. Shared by
// src/server.ts (local dev / classic Node.js server, calls .listen()) and
// src/vercel-handler.ts, bundled into api/_handler.mjs (calls .ready() +
// emits the request to the underlying Node HTTP server instead of listening
// on a port). Deliberately has no reference to .env.local or any other
// literal filesystem path outside process.env — that loading only happens
// in server.ts (never bundled into the Vercel function) since a literal path
// reference here would get traced and copied into the deployed artifact by
// static bundling analysis even though the runtime NODE_ENV guard would
// never actually read it there.
export async function createProductionApp() {
  const metadataSecret = process.env.IMPORT_METADATA_SECRET ?? 'development-only-import-metadata-secret';
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET debe contener al menos 32 caracteres');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.IMPORT_METADATA_SECRET) {
    throw new Error('IMPORT_METADATA_SECRET es obligatorio en producción');
  }
  // Vercel serverless functions have a read-only filesystem outside `/tmp`,
  // so FilesystemStorage only works for local/offline dev. A connected Blob
  // store auto-injects either BLOB_READ_WRITE_TOKEN (classic static-token
  // connection) or BLOB_STORE_ID (newer OIDC-based "Connect" flow, paired
  // with the auto-injected VERCEL_OIDC_TOKEN — the @vercel/blob SDK resolves
  // both automatically with no explicit token/storeId needed). Either var's
  // presence gates the switch, not NODE_ENV, since local dev never sets them.
  const blobStoreConnected = Boolean(process.env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_STORE_ID);
  const storage = blobStoreConnected
    ? new VercelBlobStorage()
    : new FilesystemStorage(process.env.STORAGE_ROOT ?? resolve(process.cwd(), 'storage'));

  let closeDatabase: () => Promise<unknown>;
  let importPreviewPersistence: ImportPreviewPersistencePort & FiscalPersistencePort;
  let operationsRepository: OperationsRepositoryPort;
  let commercialOrdersRepository: CommercialOrdersRepositoryPort;
  let financialEventsRepository: FinancialEventsRepositoryPort;
  let reconciliationRepository: ReconciliationRepositoryPort;
  let issuesRepository: IssuesRepositoryPort;
  let fiscalDocumentsRepository: FiscalDocumentsRepositoryPort;
  let periodClosesRepository: PeriodClosesRepositoryPort;
  let periodReadinessRepository: PeriodReadinessRepositoryPort;
  let vatDossiersRepository: VatDossiersRepositoryPort;
  let sifEventsRepository: SifEventsRepositoryPort;
  let systemAlertsRepository: SystemAlertsRepositoryPort & { open(input: { tenantId: string; severity: string; type: string; source: string; detail: Record<string, unknown>; deduplicationKey: string; eventType?: 'INTEGRITY_ERROR' | 'SUBMISSION_ERROR' | 'ANOMALY' }): Promise<unknown>; report(input: { tenantId: string; dossierId: string; period: string; expectedSha256: string; actualSha256: string }): Promise<void> };
  let recordOperationalSif: (input: { tenantId: string; eventType: 'ACCEPTED_WITH_ERRORS' | 'REJECTED' | 'RESTORE_RETRY' | 'SUBMISSION_ERROR'; actor: string; detail: Record<string, unknown> }) => Promise<unknown>;
  let recordStartup: (deploymentId: string) => Promise<number>;
  let verifactuSubmissionsRepository: VerifactuSubmissionsRepositoryPort;
  let verifactuDueRepository: VerifactuDueRepositoryPort;
  let dashboardSummaryRepository: DashboardSummaryRepositoryPort;
  let importLifecycleRepository: ImportLifecycleRepositoryPort;
  let authService: AuthService;
  let fiscalConfigurationRepository: FiscalConfigurationRepositoryPort;
  let shopifyEvidenceLinksRepository: ShopifyEvidenceLinksRepositoryPort;
  let shopifySalesRepository: ShopifySalesRepositoryPort;
  let importDedup: {
    commercialOrdersRepository: CommercialOrdersDedupPort;
    financialEventsRepository: FinancialEventsDedupPort;
    royaltyRepository: RoyaltyDedupPort;
  };

  if (process.env.DATABASE_URL) {
    const database = createRemoteDatabase(process.env.DATABASE_URL);
    const commercialOrdersRepositoryForMatching = new DrizzleCommercialOrdersRepository(database.db);
    const financialEventsRepositoryForMatching = new DrizzleFinancialEventsRepository(database.db);
    const legalEntitiesRepositoryForMatching = new DrizzleLegalEntitiesRepository(database.db);
    const royaltyRepositoryForPersistence = new DrizzleRoyaltyRepository(database.db);
    const fiscalConfigurationRepositoryForTax = new DrizzleFiscalConfigurationRepository(database.db);
    const shopifyOrderPaymentEventsRepositoryForPersistence = new DrizzleShopifyOrderPaymentEventsRepository(database.db);
    const shopifyPaymentsLedgerRepositoryForPersistence = new DrizzleShopifyPaymentsLedgerRepository(database.db);
    const shopifyEvidenceLinksRepositoryForPersistence = new DrizzleShopifyEvidenceLinksRepository(database.db);
    const taxDecisionService = new TaxDecisionService({
      legalEntitiesRepository: legalEntitiesRepositoryForMatching,
      taxDecisionsRepository: new DrizzleTaxDecisionsRepository(database.db),
      taxConfigurationRepository: fiscalConfigurationRepositoryForTax,
    });
    const fiscalDocumentsRepositoryForMatching = new DrizzleFiscalDocumentsRepository(database.db);
    const invoiceIssuanceService = new InvoiceIssuanceService({
      fiscalDocumentsRepository: fiscalDocumentsRepositoryForMatching,
      storage,
    });
    const confirmedOrderFiscalCaseService = new ConfirmedOrderFiscalCaseService({
      commercialOrdersRepository: commercialOrdersRepositoryForMatching,
      operationsRepository: new DrizzleOperationsRepository(database.db),
      legalEntitiesRepository: legalEntitiesRepositoryForMatching,
      shopifySalesRepository: new DrizzleShopifySalesRepository(database.db),
      taxDecisionService,
      invoiceIssuanceService,
    });
    const importPreviewRepository = new DrizzleImportPreviewRepository(database.db);
    importPreviewPersistence = new ImportPreviewPersistenceService(
      importPreviewRepository,
      new ImportMetadataCipher(metadataSecret),
      royaltyRepositoryForPersistence,
      commercialOrdersRepositoryForMatching,
      financialEventsRepositoryForMatching,
      confirmedOrderFiscalCaseService,
      shopifyOrderPaymentEventsRepositoryForPersistence,
      shopifyPaymentsLedgerRepositoryForPersistence,
      shopifyEvidenceLinksRepositoryForPersistence,
    );
    importLifecycleRepository = importPreviewRepository;
    importDedup = {
      commercialOrdersRepository: commercialOrdersRepositoryForMatching,
      financialEventsRepository: financialEventsRepositoryForMatching,
      royaltyRepository: royaltyRepositoryForPersistence,
    };
    operationsRepository = new DrizzleOperationsRepository(database.db);
    commercialOrdersRepository = commercialOrdersRepositoryForMatching;
    financialEventsRepository = new DrizzleFinancialEventsRepository(database.db);
    reconciliationRepository = new DrizzleReconciliationRepository(database.db);
    issuesRepository = new DrizzleIssuesRepository(database.db);
    fiscalDocumentsRepository = fiscalDocumentsRepositoryForMatching;
    periodClosesRepository = new DrizzlePeriodClosesRepository(database.db);
    periodReadinessRepository = new DrizzlePeriodReadinessRepository(database.db);
    vatDossiersRepository = new DrizzleVatDossiersRepository(database.db);
    const sifRepository = new DrizzleSifEventsRepository(database.db);
    sifEventsRepository = sifRepository;
    systemAlertsRepository = new DrizzleSystemAlertsRepository(database.db, sifRepository);
    recordOperationalSif = (input) => sifRepository.record(input);
    recordStartup = (deploymentId) => sifRepository.recordStartupForAll(deploymentId);
    const verifactuRepository = new DrizzleVerifactuSubmissionsRepository(database.db);
    verifactuSubmissionsRepository = verifactuRepository;
    verifactuDueRepository = verifactuRepository;
    dashboardSummaryRepository = new DrizzleDashboardSummaryRepository(database.db);
    authService = new AuthService(new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON), new DrizzleAuthAuditRepository(database.db));
    fiscalConfigurationRepository = fiscalConfigurationRepositoryForTax;
    shopifyEvidenceLinksRepository = shopifyEvidenceLinksRepositoryForPersistence;
    shopifySalesRepository = new DrizzleShopifySalesRepository(database.db);
    closeDatabase = database.close;
  } else {
    const database = createOfflineDatabase(process.env.OFFLINE_DATABASE_PATH ?? resolve(process.cwd(), '.data/anclora-fiscal'));
    await migrateOfflineDatabase(database.client);
    await ensureDevelopmentTenant(database.db);
    const commercialOrdersRepositoryForMatching = new DrizzleCommercialOrdersRepository(database.db);
    const financialEventsRepositoryForMatching = new DrizzleFinancialEventsRepository(database.db);
    const legalEntitiesRepositoryForMatching = new DrizzleLegalEntitiesRepository(database.db);
    const royaltyRepositoryForPersistence = new DrizzleRoyaltyRepository(database.db);
    const fiscalConfigurationRepositoryForTax = new DrizzleFiscalConfigurationRepository(database.db);
    const shopifyOrderPaymentEventsRepositoryForPersistence = new DrizzleShopifyOrderPaymentEventsRepository(database.db);
    const shopifyPaymentsLedgerRepositoryForPersistence = new DrizzleShopifyPaymentsLedgerRepository(database.db);
    const shopifyEvidenceLinksRepositoryForPersistence = new DrizzleShopifyEvidenceLinksRepository(database.db);
    const taxDecisionService = new TaxDecisionService({
      legalEntitiesRepository: legalEntitiesRepositoryForMatching,
      taxDecisionsRepository: new DrizzleTaxDecisionsRepository(database.db),
      taxConfigurationRepository: fiscalConfigurationRepositoryForTax,
    });
    const fiscalDocumentsRepositoryForMatching = new DrizzleFiscalDocumentsRepository(database.db);
    const invoiceIssuanceService = new InvoiceIssuanceService({
      fiscalDocumentsRepository: fiscalDocumentsRepositoryForMatching,
      storage,
    });
    const confirmedOrderFiscalCaseService = new ConfirmedOrderFiscalCaseService({
      commercialOrdersRepository: commercialOrdersRepositoryForMatching,
      operationsRepository: new DrizzleOperationsRepository(database.db),
      legalEntitiesRepository: legalEntitiesRepositoryForMatching,
      shopifySalesRepository: new DrizzleShopifySalesRepository(database.db),
      taxDecisionService,
      invoiceIssuanceService,
    });
    const importPreviewRepository = new DrizzleImportPreviewRepository(database.db);
    importPreviewPersistence = new ImportPreviewPersistenceService(
      importPreviewRepository,
      new ImportMetadataCipher(metadataSecret),
      royaltyRepositoryForPersistence,
      commercialOrdersRepositoryForMatching,
      financialEventsRepositoryForMatching,
      confirmedOrderFiscalCaseService,
      shopifyOrderPaymentEventsRepositoryForPersistence,
      shopifyPaymentsLedgerRepositoryForPersistence,
      shopifyEvidenceLinksRepositoryForPersistence,
    );
    importLifecycleRepository = importPreviewRepository;
    importDedup = {
      commercialOrdersRepository: commercialOrdersRepositoryForMatching,
      financialEventsRepository: financialEventsRepositoryForMatching,
      royaltyRepository: royaltyRepositoryForPersistence,
    };
    operationsRepository = new DrizzleOperationsRepository(database.db);
    commercialOrdersRepository = commercialOrdersRepositoryForMatching;
    financialEventsRepository = new DrizzleFinancialEventsRepository(database.db);
    reconciliationRepository = new DrizzleReconciliationRepository(database.db);
    issuesRepository = new DrizzleIssuesRepository(database.db);
    fiscalDocumentsRepository = fiscalDocumentsRepositoryForMatching;
    periodClosesRepository = new DrizzlePeriodClosesRepository(database.db);
    periodReadinessRepository = new DrizzlePeriodReadinessRepository(database.db);
    vatDossiersRepository = new DrizzleVatDossiersRepository(database.db);
    const sifRepository = new DrizzleSifEventsRepository(database.db);
    sifEventsRepository = sifRepository;
    systemAlertsRepository = new DrizzleSystemAlertsRepository(database.db, sifRepository);
    recordOperationalSif = (input) => sifRepository.record(input);
    recordStartup = (deploymentId) => sifRepository.recordStartupForAll(deploymentId);
    const verifactuRepository = new DrizzleVerifactuSubmissionsRepository(database.db);
    verifactuSubmissionsRepository = verifactuRepository;
    verifactuDueRepository = verifactuRepository;
    dashboardSummaryRepository = new DrizzleDashboardSummaryRepository(database.db);
    authService = new AuthService(new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON), new DrizzleAuthAuditRepository(database.db));
    fiscalConfigurationRepository = fiscalConfigurationRepositoryForTax;
    shopifyEvidenceLinksRepository = shopifyEvidenceLinksRepositoryForPersistence;
    shopifySalesRepository = new DrizzleShopifySalesRepository(database.db);
    closeDatabase = () => database.client.close();
  }

  const app = await buildApp({
    storage,
    importPreviewPersistence,
    fiscalPersistence: importPreviewPersistence,
    importDedup,
    importLifecycleRepository,
    operationsRepository,
    commercialOrdersRepository,
    financialEventsRepository,
    reconciliationRepository,
    issuesRepository,
    fiscalDocumentsRepository,
    periodClosesRepository,
    periodReadinessRepository,
    vatDossiersRepository,
    sifEventsRepository,
    systemAlertsRepository,
    dossierIntegrityIncidents: systemAlertsRepository,
    verifactuSubmissionsRepository,
    dashboardSummaryRepository,
    fiscalConfigurationRepository,
    shopifyEvidenceLinksRepository,
    shopifySalesRepository,
    authService,
  });
  await recordStartup(process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'local-development');
  const execution = createInternalVerifactuSubmissionExecutionService({
    repository: verifactuDueRepository,
    env: process.env,
  });
  const processDueHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = process.env.CRON_SECRET ?? process.env.VERIFACTU_INTERNAL_TOKEN;
    if (!secret || request.headers.authorization !== `Bearer ${secret}`) {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
    if (!execution.service || execution.runtimeConfig.mode !== 'test') {
      return reply.code(503).send({
        code: execution.reason ?? 'VERIFACTU_TEST_RUNTIME_REQUIRED',
      });
    }
    const now = new Date().toISOString();
    const summary = await processDueVerifactuSubmissions({
      repository: verifactuDueRepository,
      service: execution.service,
      now,
      workerId: `cron-${now}`,
      batchSize: Number(process.env.VERIFACTU_CRON_BATCH_SIZE ?? 10),
      leaseMs: Number(process.env.VERIFACTU_CRON_LEASE_MS ?? 300_000),
      onOutcome: async ({ tenantId, submissionId, status }) => {
        if (status === 'ACCEPTED_WITH_ERRORS' || status === 'REJECTED') {
          await recordOperationalSif({ tenantId, eventType: status, actor: 'verifactu-cron', detail: { submissionId } });
        } else if (status === 'RETRY_SCHEDULED') {
          await recordOperationalSif({ tenantId, eventType: 'RESTORE_RETRY', actor: 'verifactu-cron', detail: { submissionId } });
        }
        if (status === 'REJECTED') {
          await systemAlertsRepository.open({ tenantId, severity: 'CRITICAL', type: 'VERIFACTU_REJECTED', source: 'verifactu-cron', detail: { submissionId }, deduplicationKey: `verifactu-rejected:${submissionId}`, eventType: 'SUBMISSION_ERROR' });
        }
      },
    });
    return reply.send(summary);
  };
  if (typeof app.get === 'function' && typeof app.post === 'function') {
    app.get('/api/v1/internal/verifactu/process-due', processDueHandler);
    app.post('/api/v1/internal/verifactu/process-due', processDueHandler);
  }
  app.addHook('onClose', closeDatabase);
  return app;
}
