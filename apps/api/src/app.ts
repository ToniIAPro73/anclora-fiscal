import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { FilesystemStorage, type StoragePort } from '@anclora/core/server';
import { resolve } from 'node:path';
import { createImportPreviewHandler } from './import-controller';
import type { ImportPreviewPersistencePort } from './import-preview-persistence';
import { createOperationsListHandler, type OperationsRepositoryPort } from './operations-controller';
import { createFinancialEventsListHandler, type FinancialEventsRepositoryPort } from './financial-events-controller';
import { createReconciliationCandidatesListHandler, type ReconciliationRepositoryPort } from './reconciliation-controller';
import { createIssueResolveHandler, createIssuesListHandler, type IssuesRepositoryPort } from './issues-controller';
import { createInvoiceIssueHandler, createInvoiceRectifyHandler, type FiscalDocumentsRepositoryPort } from './fiscal-documents-controller';
import { createPeriodCloseHandler, createPeriodReopenHandler, type PeriodClosesRepositoryPort } from './period-closes-controller';
import { createVatDossierGenerateHandler, createVatDossierGetHandler, type VatDossiersRepositoryPort } from './vat-dossier-controller';
import { requireRole } from './rbac-plugin';
import { registerAuthRoutes } from './auth-controller';
import { AuthService, ConfiguredIdentityProvider } from './auth-service';

export async function buildApp(options: {
  storage?: StoragePort;
  importPreviewPersistence?: ImportPreviewPersistencePort;
  operationsRepository?: OperationsRepositoryPort | undefined;
  financialEventsRepository?: FinancialEventsRepositoryPort | undefined;
  reconciliationRepository?: ReconciliationRepositoryPort | undefined;
  issuesRepository?: IssuesRepositoryPort | undefined;
  fiscalDocumentsRepository?: FiscalDocumentsRepositoryPort | undefined;
  periodClosesRepository?: PeriodClosesRepositoryPort | undefined;
  vatDossiersRepository?: VatDossiersRepositoryPort | undefined;
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
  await app.register(cors, { origin: process.env.APP_ORIGIN ?? 'http://localhost:3000', methods: ['GET', 'POST'], credentials: true });
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
  return app;
}
