import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { FilesystemStorage, type StoragePort } from '@anclora/core/server';
import { resolve } from 'node:path';
import { createImportPreviewHandler } from './import-controller.js';
import type { CommercialOrdersDedupPort, FinancialEventsDedupPort, RoyaltyDedupPort } from './import-service.js';
import type { ImportPreviewPersistencePort } from './import-preview-persistence.js';
import { createOperationsListHandler, type OperationsRepositoryPort } from './operations-controller.js';
import { createFinancialEventsListHandler, type FinancialEventsRepositoryPort } from './financial-events-controller.js';
import { createReconciliationCandidatesListHandler, type ReconciliationRepositoryPort } from './reconciliation-controller.js';
import { parsePagination } from './pagination.js';
import type { Paginated } from './pagination.js';
import { createIssueResolveHandler, createIssuesListHandler, type IssuesRepositoryPort } from './issues-controller.js';
import { createInvoiceIssueHandler, createInvoiceRectifyHandler, type FiscalDocumentsRepositoryPort } from './fiscal-documents-controller.js';
import { createPeriodCloseHandler, createPeriodReopenHandler, type PeriodClosesRepositoryPort } from './period-closes-controller.js';
import { createVatDossierGenerateHandler, createVatDossierGetHandler, type VatDossiersRepositoryPort } from './vat-dossier-controller.js';
import { createDashboardSummaryHandler, type DashboardSummaryRepositoryPort } from './dashboard-controller.js';
import { requireRole } from './rbac-plugin.js';
import { registerAuthRoutes } from './auth-controller.js';
import { AuthService, ConfiguredIdentityProvider } from './auth-service.js';
import { createFiscalConfigurationGetHandler, createFiscalConfigurationPutHandler, type FiscalConfigurationRepositoryPort } from './fiscal-configuration-controller.js';

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
  importDedup?: {
    commercialOrdersRepository?: CommercialOrdersDedupPort | undefined;
    financialEventsRepository?: FinancialEventsDedupPort | undefined;
    royaltyRepository?: RoyaltyDedupPort | undefined;
  } | undefined;
  operationsRepository?: OperationsRepositoryPort | undefined;
  financialEventsRepository?: FinancialEventsRepositoryPort | undefined;
  reconciliationRepository?: (ReconciliationRepositoryPort & Partial<UnmatchedOrdersRepositoryPort>) | undefined;
  issuesRepository?: IssuesRepositoryPort | undefined;
  fiscalDocumentsRepository?: FiscalDocumentsRepositoryPort | undefined;
  periodClosesRepository?: PeriodClosesRepositoryPort | undefined;
  vatDossiersRepository?: VatDossiersRepositoryPort | undefined;
  dashboardSummaryRepository?: DashboardSummaryRepositoryPort | undefined;
  fiscalConfigurationRepository?: FiscalConfigurationRepositoryPort | undefined;
  authService?: AuthService;
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

  app.get('/health', { schema: { response: { 200: { type: 'object', properties: { status: { type: 'string' }, verifactuEnabled: { type: 'boolean' } } } } } }, async () => ({ status: 'ok', verifactuEnabled: process.env.VERIFACTU_ENABLED === 'true' }));
  const authService = options.authService ?? new AuthService(
    new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON),
    { record: async () => undefined },
  );
  registerAuthRoutes(app, authService);
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
    }),
  );
  app.post(
    '/api/v1/fiscal-documents/:id/rectify',
    { preHandler: requireRole(['documents:rectify']) },
    createInvoiceRectifyHandler({
      repository: options.fiscalDocumentsRepository,
      storage: options.storage ?? new FilesystemStorage(resolve(process.cwd(), 'storage')),
    }),
  );
  app.post(
    '/api/v1/periods/:period/close',
    { preHandler: requireRole(['periods:close']) },
    createPeriodCloseHandler({ repository: options.periodClosesRepository }),
  );
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
    '/api/v1/dashboard/summary',
    { preHandler: requireRole(['dashboard:read']) },
    createDashboardSummaryHandler({ repository: options.dashboardSummaryRepository }),
  );
  app.get('/api/v1/fiscal-configuration', { preHandler: requireRole(['settings:read']) }, createFiscalConfigurationGetHandler(options.fiscalConfigurationRepository));
  app.put('/api/v1/fiscal-configuration', { preHandler: requireRole(['settings:write']) }, createFiscalConfigurationPutHandler(options.fiscalConfigurationRepository));
  return app;
}
