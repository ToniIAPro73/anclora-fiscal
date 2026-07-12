import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { FilesystemStorage, type StoragePort } from '@anclora/core/server';
import { resolveApiVerifactuRuntimeStatus } from './verifactu-runtime.js';
import { resolve } from 'node:path';
import { createImportPreviewHandler } from './import-controller.js';
import type { CommercialOrdersDedupPort, FinancialEventsDedupPort, RoyaltyDedupPort } from './import-service.js';
import type { FiscalPersistencePort, ImportPreviewPersistencePort } from './import-preview-persistence.js';
import { createImportConfirmHandler, createImportRejectHandler, createImportRetryHandler, type ImportLifecycleRepositoryPort } from './import-lifecycle-controller.js';
import { createOperationsListHandler, type OperationsRepositoryPort } from './operations-controller.js';
import { createFinancialEventsListHandler, type FinancialEventsRepositoryPort } from './financial-events-controller.js';
import { createReconciliationCandidatesListHandler, type ReconciliationRepositoryPort } from './reconciliation-controller.js';
import { parsePagination } from './pagination.js';
import type { Paginated } from './pagination.js';
import { createIssueResolveHandler, createIssuesListHandler, type IssuesRepositoryPort } from './issues-controller.js';
import { createFullInvoiceIssueHandler, createInvoiceBatchIssueHandler, createInvoiceDownloadHandler, createInvoiceIssueHandler, createInvoiceRectifyHandler, type FiscalDocumentsRepositoryPort } from './fiscal-documents-controller.js';
import { createShopifySaleDetailHandler, createShopifySaleInvoiceHandler, createShopifySalesExportHandler, createShopifySalesListHandler, type ShopifySalesRepositoryPort } from './shopify-sales-controller.js';
import { createPeriodCloseHandler, createPeriodReopenHandler, type PeriodClosesRepositoryPort } from './period-closes-controller.js';
import { createPeriodReadinessHandler, type PeriodReadinessRepositoryPort } from './period-readiness-controller.js';
import { createVatDossierArchiveHandler, createVatDossierGenerateHandler, createVatDossierGetHandler, type DossierIntegrityIncidentPort, type VatDossiersRepositoryPort } from './vat-dossier-controller.js';
import { createSifEventsListHandler, createSifEventsVerifyHandler, type SifEventsRepositoryPort } from './sif-events-controller.js';
import { createSystemAlertResolveHandler, createSystemAlertsListHandler, type SystemAlertsRepositoryPort } from './system-alerts-controller.js';
import {
  createVerifactuSubmissionAttemptsListHandler,
  createVerifactuRemediationHandler,
  createVerifactuSubmissionsListHandler,
} from './verifactu-submissions-controller.js';
import type { VerifactuSubmissionsRepositoryPort } from './verifactu-submissions-controller.js';
import { createDashboardSummaryHandler, type DashboardSummaryRepositoryPort } from './dashboard-controller.js';
import { requireRole } from './rbac-plugin.js';
import { registerAuthRoutes } from './auth-controller.js';
import { AuthService, ConfiguredIdentityProvider } from './auth-service.js';
import type { GitHubFetch } from './github-oauth-client.js';
import {
  readGitHubOAuthConfig,
  type GitHubOAuthConfig,
} from './github-oauth-config.js';
import { createFiscalConfigurationGetHandler, createFiscalConfigurationPutHandler, type FiscalConfigurationRepositoryPort } from './fiscal-configuration-controller.js';
import { createCommercialOrdersListHandler, type CommercialOrdersRepositoryPort } from './commercial-orders-controller.js';
import { createShopifyEvidenceLinkDecisionHandler, createShopifyEvidenceLinksListHandler, type ShopifyEvidenceLinksRepositoryPort } from './shopify-evidence-links-controller.js';
import { createExpenseCreateHandler, createExpenseDownloadHandler, createExpensesListHandler, type ExpensesRepositoryPort } from './expenses-controller.js';
import type { ImportMetadataCipher } from './import-preview-persistence.js';

export interface UnmatchedOrder {
  id: string;
  externalOrderId: string;
  sourceChannel: string;
  commercialDate: Date | null;
  [key: string]: unknown;
}

/**
 * Read-only port for Task 4.11 (Item 5 of the plan) — commercial orders that
 * never got a matching_candidates row at all, surfaced as a second, read-only
 * section on the reconciliation workbench. Kept as a separate, optional
 * interface (rather than extending ReconciliationRepositoryPort in
 * reconciliation-controller.ts) so existing callers passing only `list()`
 * still satisfy the type.
 */
export interface UnmatchedOrdersRepositoryPort {
  listUnmatchedOrders(input: { tenantId: string; page: number; pageSize: number }): Promise<Paginated<UnmatchedOrder>>;
}

function createUnmatchedOrdersListHandler(dependencies: { repository?: (ReconciliationRepositoryPort & Partial<UnmatchedOrdersRepositoryPort>) | undefined }) {
  return async function unmatchedOrdersListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository?.listUnmatchedOrders) return reply.code(503).send({ code: 'RECONCILIATION_REPOSITORY_UNAVAILABLE', message: 'El servicio de conciliación no está disponible' });

    const { page, pageSize } = parsePagination(request.query);
    return dependencies.repository.listUnmatchedOrders({ tenantId, page, pageSize });
  };
}

export async function buildApp(options: {
  storage?: StoragePort;
  importPreviewPersistence?: ImportPreviewPersistencePort;
  fiscalPersistence?: FiscalPersistencePort | undefined;
  importDedup?: {
    commercialOrdersRepository?: CommercialOrdersDedupPort | undefined;
    financialEventsRepository?: FinancialEventsDedupPort | undefined;
    royaltyRepository?: RoyaltyDedupPort | undefined;
  } | undefined;
  importLifecycleRepository?: ImportLifecycleRepositoryPort | undefined;
  operationsRepository?: OperationsRepositoryPort | undefined;
  commercialOrdersRepository?: CommercialOrdersRepositoryPort | undefined;
  financialEventsRepository?: FinancialEventsRepositoryPort | undefined;
  reconciliationRepository?: (ReconciliationRepositoryPort & Partial<UnmatchedOrdersRepositoryPort>) | undefined;
  issuesRepository?: IssuesRepositoryPort | undefined;
  shopifySalesRepository?: ShopifySalesRepositoryPort | undefined;
  fiscalDocumentsRepository?: FiscalDocumentsRepositoryPort | undefined;
  periodClosesRepository?: PeriodClosesRepositoryPort | undefined;
  periodReadinessRepository?: PeriodReadinessRepositoryPort | undefined;
  vatDossiersRepository?: VatDossiersRepositoryPort | undefined;
  dossierIntegrityIncidents?: DossierIntegrityIncidentPort | undefined;
  sifEventsRepository?: SifEventsRepositoryPort | undefined;
  systemAlertsRepository?: SystemAlertsRepositoryPort | undefined;
  verifactuSubmissionsRepository?: VerifactuSubmissionsRepositoryPort | undefined;
  dashboardSummaryRepository?: DashboardSummaryRepositoryPort | undefined;
  fiscalConfigurationRepository?: FiscalConfigurationRepositoryPort | undefined;
  shopifyEvidenceLinksRepository?: ShopifyEvidenceLinksRepositoryPort | undefined;
  expensesRepository?: ExpensesRepositoryPort | undefined;
  expenseCipher?: ImportMetadataCipher | undefined;
  authService?: AuthService;
  githubOAuthConfig?: GitHubOAuthConfig | null;
  githubFetch?: GitHubFetch;
} = {}) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error('SESSION_SECRET must contain at least 32 characters in production');
  }
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie', '*.email', '*.taxId', '*.address'] } });
  await app.register(helmet, { contentSecurityPolicy: true });
  await app.register(cookie, {
    secret: sessionSecret ?? 'development-only-secret-change-me',
    parseOptions: { sameSite: 'lax', httpOnly: true, path: '/' },
  });
  await app.register(cors, { origin: process.env.APP_ORIGIN ?? 'http://localhost:3000', methods: ['GET', 'POST', 'PUT', 'PATCH'], credentials: true });
  await app.register(multipart, { limits: { files: 10, fileSize: 15 * 1024 * 1024 } });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(swagger, { openapi: { info: { title: 'Anclora Fiscal API', version: '0.1.0' }, servers: [{ url: '/api/v1' }] } });
  await app.register(swaggerUi, { routePrefix: '/documentation' });

  const verifactuRuntimeStatus = resolveApiVerifactuRuntimeStatus();
  const verifactuRuntimeConfig = {
    mode: verifactuRuntimeStatus.mode,
    enabled: verifactuRuntimeStatus.enabled,
    canSubmit: verifactuRuntimeStatus.canSubmit,
    productionSafe: verifactuRuntimeStatus.productionSafe,
  };

  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              verifactuEnabled: { type: 'boolean' },
              verifactuMode: { type: 'string' },
              verifactuCanSubmit: { type: 'boolean' },
              verifactuProductionSafe: { type: 'boolean' },
              aeatPortalReadiness: { type: 'object', additionalProperties: true },
              aeatXmlPreflight: { type: 'object', additionalProperties: true },
              aeatSoapTransport: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
    async () => {
      const verifactu = verifactuRuntimeConfig;

      return {
        status: 'ok',
        verifactuEnabled: verifactu.enabled,
        verifactuMode: verifactu.mode,
        verifactuCanSubmit: verifactu.canSubmit,
        verifactuProductionSafe: verifactu.productionSafe,
        aeatPortalReadiness: verifactuRuntimeStatus.aeatPortalReadiness,
        aeatXmlPreflight: verifactuRuntimeStatus.aeatXmlPreflight,
        aeatSoapTransport: verifactuRuntimeStatus.aeatSoapTransport,
      };
    },
  );
  app.post('/api/v1/verifactu/submissions/:submissionId/remediation', { preHandler: requireRole(['documents:rectify']) }, createVerifactuRemediationHandler({ repository: options.verifactuSubmissionsRepository }));
  const authService = options.authService ?? new AuthService(
    new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON),
    { record: async () => undefined },
  );
  const githubOAuthConfig =
    options.githubOAuthConfig === undefined
      ? readGitHubOAuthConfig()
      : options.githubOAuthConfig;

  registerAuthRoutes(app, authService, {
    githubOAuthConfig,
    ...(options.githubFetch
      ? { githubFetch: options.githubFetch }
      : {}),
  });
  app.post(
    '/api/v1/imports/preview',
    { preHandler: requireRole(['imports:write']) },
    createImportPreviewHandler({
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
      persistence: options.importPreviewPersistence,
      commercialOrdersRepository: options.importDedup?.commercialOrdersRepository,
      financialEventsRepository: options.importDedup?.financialEventsRepository,
      royaltyRepository: options.importDedup?.royaltyRepository,
    }),
  );
  const importStorage = options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage'));
  app.post(
    '/api/v1/imports/:jobId/confirm',
    { preHandler: requireRole(['imports:write']) },
    createImportConfirmHandler({ repository: options.importLifecycleRepository, fiscalPersistence: options.fiscalPersistence, storage: importStorage }),
  );
  app.post(
    '/api/v1/imports/:jobId/reject',
    { preHandler: requireRole(['imports:write']) },
    createImportRejectHandler({ repository: options.importLifecycleRepository }),
  );
  app.post(
    '/api/v1/imports/:jobId/retry',
    { preHandler: requireRole(['imports:write']) },
    createImportRetryHandler({ repository: options.importLifecycleRepository, storage: importStorage }),
  );
  app.get(
    '/api/v1/shopify/sales',
    { preHandler: requireRole(['operations:read']) },
    createShopifySalesListHandler(options.shopifySalesRepository),
  );
  app.get(
    '/api/v1/shopify/sales/:orderId',
    { preHandler: requireRole(['operations:read']) },
    createShopifySaleDetailHandler(options.shopifySalesRepository),
  );
  app.get(
    '/api/v1/shopify/sales/export',
    { preHandler: requireRole(['operations:read']) },
    createShopifySalesExportHandler(options.shopifySalesRepository),
  );
  app.post(
    '/api/v1/shopify/sales/:orderId/invoice',
    { preHandler: requireRole(['documents:issue']) },
    createShopifySaleInvoiceHandler({
      repository: options.shopifySalesRepository,
      fiscalDocumentsRepository: options.fiscalDocumentsRepository,
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
      verifactuConfig: verifactuRuntimeConfig,
    }),
  );
  app.get(
    '/api/v1/commercial-orders',
    { preHandler: requireRole(['operations:read']) },
    createCommercialOrdersListHandler({ repository: options.commercialOrdersRepository }),
  );
  app.get(
    '/api/v1/operations',
    { preHandler: requireRole(['operations:read']) },
    createOperationsListHandler({ repository: options.operationsRepository }),
  );
  app.get(
    '/api/v1/financial-events',
    { preHandler: requireRole(['events:read']) },
    createFinancialEventsListHandler({ repository: options.financialEventsRepository }),
  );
  app.get(
    '/api/v1/reconciliation/candidates',
    { preHandler: requireRole(['reconciliation:read']) },
    createReconciliationCandidatesListHandler({ repository: options.reconciliationRepository }),
  );
  app.get(
    '/api/v1/reconciliation/unmatched-orders',
    { preHandler: requireRole(['reconciliation:read']) },
    createUnmatchedOrdersListHandler({ repository: options.reconciliationRepository }),
  );
  app.get(
    '/api/v1/shopify/evidence-links',
    { preHandler: requireRole(['reconciliation:read']) },
    createShopifyEvidenceLinksListHandler(options.shopifyEvidenceLinksRepository),
  );
  app.patch(
    '/api/v1/shopify/evidence-links/:id',
    { preHandler: requireRole(['reconciliation:write']) },
    createShopifyEvidenceLinkDecisionHandler(options.shopifyEvidenceLinksRepository),
  );
  app.get(
    '/api/v1/issues',
    { preHandler: requireRole(['issues:read']) },
    createIssuesListHandler({ repository: options.issuesRepository }),
  );
  app.patch(
    '/api/v1/issues/:id',
    { preHandler: requireRole(['issues:write']) },
    createIssueResolveHandler({ repository: options.issuesRepository }),
  );
  app.post(
    '/api/v1/operations/:id/invoices',
    { preHandler: requireRole(['documents:issue']) },
    createInvoiceIssueHandler({
      repository: options.fiscalDocumentsRepository,
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
      verifactuConfig: verifactuRuntimeConfig,
    }),
  );
  app.post(
    '/api/v1/fiscal-documents/:id/rectify',
    { preHandler: requireRole(['documents:rectify']) },
    createInvoiceRectifyHandler({
      repository: options.fiscalDocumentsRepository,
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
      verifactuConfig: verifactuRuntimeConfig,
    }),
  );
  app.post(
    '/api/v1/operations/:id/full-invoice',
    { preHandler: requireRole(['documents:issue']) },
    createFullInvoiceIssueHandler({
      repository: options.fiscalDocumentsRepository,
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
      verifactuConfig: verifactuRuntimeConfig,
    }),
  );
  app.get(
    '/api/v1/fiscal-documents/:id/download',
    { preHandler: requireRole(['documents:read']) },
    createInvoiceDownloadHandler({
      repository: options.fiscalDocumentsRepository,
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
    }),
  );
  app.post(
    '/api/v1/periods/:period/invoices/issue-eligible',
    { preHandler: requireRole(['documents:issue']) },
    createInvoiceBatchIssueHandler({
      repository: options.fiscalDocumentsRepository,
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
      verifactuConfig: verifactuRuntimeConfig,
    }),
  );
  app.post(
    '/api/v1/periods/:period/close',
    { preHandler: requireRole(['periods:close']) },
    createPeriodCloseHandler({ repository: options.periodClosesRepository }),
  );
  app.get('/api/v1/periods/:period/readiness', { preHandler: requireRole(['periods:read']) }, createPeriodReadinessHandler({ repository: options.periodReadinessRepository }));
  app.post(
    '/api/v1/periods/:period/reopen',
    { preHandler: requireRole(['periods:close']) },
    createPeriodReopenHandler({ repository: options.periodClosesRepository }),
  );
  app.post(
    '/api/v1/periods/:period/vat-dossier',
    { preHandler: requireRole(['dossier:write']) },
    createVatDossierGenerateHandler({
      repository: options.vatDossiersRepository,
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
    }),
  );
  app.get(
    '/api/v1/periods/:period/vat-dossier',
    { preHandler: requireRole(['dossier:read']) },
    createVatDossierGetHandler({ repository: options.vatDossiersRepository }),
  );
  app.get(
    '/api/v1/periods/:period/vat-dossier/archive',
    { preHandler: requireRole(['dossier:read']) },
    createVatDossierArchiveHandler({
      repository: options.vatDossiersRepository,
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
      integrityIncidents: options.dossierIntegrityIncidents,
    }),
  );
  app.get(
    '/api/v1/sif-events',
    { preHandler: requireRole(['dossier:read']) },
    createSifEventsListHandler({ repository: options.sifEventsRepository }),
  );
  app.get('/api/v1/system-alerts', { preHandler: requireRole(['alerts:read']) }, createSystemAlertsListHandler({ repository: options.systemAlertsRepository }));
  app.post('/api/v1/system-alerts/:id/resolve', { preHandler: requireRole(['alerts:resolve']) }, createSystemAlertResolveHandler({ repository: options.systemAlertsRepository }));
  app.get(
    '/api/v1/sif-events/verify',
    { preHandler: requireRole(['dossier:read']) },
    createSifEventsVerifyHandler({ repository: options.sifEventsRepository }),
  );
  app.get(
    '/api/v1/verifactu/submissions',
    { preHandler: requireRole(['documents:read']) },
    createVerifactuSubmissionsListHandler({ repository: options.verifactuSubmissionsRepository }),
  );
  app.get(
    '/api/v1/verifactu/submissions/:submissionId/attempts',
    { preHandler: requireRole(['documents:read']) },
    createVerifactuSubmissionAttemptsListHandler({ repository: options.verifactuSubmissionsRepository }),
  );
  app.get(
    '/api/v1/dashboard/summary',
    { preHandler: requireRole(['dashboard:read']) },
    createDashboardSummaryHandler({ repository: options.dashboardSummaryRepository }),
  );
  app.get('/api/v1/expenses', { preHandler: requireRole(['expenses:read']) }, createExpensesListHandler(options.expensesRepository));
  if (options.expenseCipher) app.post('/api/v1/expenses', { preHandler: requireRole(['expenses:write']) }, createExpenseCreateHandler({ repository: options.expensesRepository, storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')), cipher: options.expenseCipher }));
  app.get('/api/v1/expenses/:id/attachment', { preHandler: requireRole(['expenses:read']) }, createExpenseDownloadHandler({ repository: options.expensesRepository, storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')) }));
  app.get('/api/v1/fiscal-configuration', { preHandler: requireRole(['settings:read']) }, createFiscalConfigurationGetHandler(options.fiscalConfigurationRepository));
  app.put('/api/v1/fiscal-configuration', { preHandler: requireRole(['settings:write']) }, createFiscalConfigurationPutHandler(options.fiscalConfigurationRepository));
  return app;
}
