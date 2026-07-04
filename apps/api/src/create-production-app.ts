import { FilesystemStorage } from '@anclora/core/server';
import { createOfflineDatabase, createRemoteDatabase, DrizzleAuthAuditRepository, DrizzleCommercialOrdersRepository, DrizzleDashboardSummaryRepository, DrizzleFinancialEventsRepository, DrizzleFiscalDocumentsRepository, DrizzleImportPreviewRepository, DrizzleIssuesRepository, DrizzleLegalEntitiesRepository, DrizzleOperationsRepository, DrizzlePeriodClosesRepository, DrizzleReconciliationRepository, DrizzleRoyaltyRepository, ensureDevelopmentTenant, migrateOfflineDatabase } from '@anclora/db';
import { resolve } from 'node:path';
import { buildApp } from './build-app.js';
import { ImportMetadataCipher, ImportPreviewPersistenceService, type ImportPreviewPersistencePort } from './import-preview-persistence.js';
import { MatchingService } from './matching-service.js';
import type { OperationsRepositoryPort } from './operations-controller.js';
import type { FinancialEventsRepositoryPort } from './financial-events-controller.js';
import type { ReconciliationRepositoryPort } from './reconciliation-controller.js';
import type { IssuesRepositoryPort } from './issues-controller.js';
import type { FiscalDocumentsRepositoryPort } from './fiscal-documents-controller.js';
import type { PeriodClosesRepositoryPort } from './period-closes-controller.js';
import type { DashboardSummaryRepositoryPort } from './dashboard-controller.js';
import { AuthService, ConfiguredIdentityProvider } from './auth-service.js';

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
  const storage = new FilesystemStorage(process.env.STORAGE_ROOT ?? resolve(process.cwd(), 'storage'));

  let closeDatabase: () => Promise<unknown>;
  let importPreviewPersistence: ImportPreviewPersistencePort;
  let operationsRepository: OperationsRepositoryPort;
  let financialEventsRepository: FinancialEventsRepositoryPort;
  let reconciliationRepository: ReconciliationRepositoryPort;
  let issuesRepository: IssuesRepositoryPort;
  let fiscalDocumentsRepository: FiscalDocumentsRepositoryPort;
  let periodClosesRepository: PeriodClosesRepositoryPort;
  let dashboardSummaryRepository: DashboardSummaryRepositoryPort;
  let authService: AuthService;

  if (process.env.DATABASE_URL) {
    const database = createRemoteDatabase(process.env.DATABASE_URL);
    const commercialOrdersRepositoryForMatching = new DrizzleCommercialOrdersRepository(database.db);
    const financialEventsRepositoryForMatching = new DrizzleFinancialEventsRepository(database.db);
    const matchingService = new MatchingService({
      commercialOrdersRepository: commercialOrdersRepositoryForMatching,
      financialEventsRepository: financialEventsRepositoryForMatching,
      operationsRepository: new DrizzleOperationsRepository(database.db),
      reconciliationRepository: new DrizzleReconciliationRepository(database.db),
      legalEntitiesRepository: new DrizzleLegalEntitiesRepository(database.db),
    });
    importPreviewPersistence = new ImportPreviewPersistenceService(
      new DrizzleImportPreviewRepository(database.db),
      new ImportMetadataCipher(metadataSecret),
      new DrizzleRoyaltyRepository(database.db),
      commercialOrdersRepositoryForMatching,
      financialEventsRepositoryForMatching,
      matchingService,
    );
    operationsRepository = new DrizzleOperationsRepository(database.db);
    financialEventsRepository = new DrizzleFinancialEventsRepository(database.db);
    reconciliationRepository = new DrizzleReconciliationRepository(database.db);
    issuesRepository = new DrizzleIssuesRepository(database.db);
    fiscalDocumentsRepository = new DrizzleFiscalDocumentsRepository(database.db);
    periodClosesRepository = new DrizzlePeriodClosesRepository(database.db);
    dashboardSummaryRepository = new DrizzleDashboardSummaryRepository(database.db);
    authService = new AuthService(new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON), new DrizzleAuthAuditRepository(database.db));
    closeDatabase = database.close;
  } else {
    const database = createOfflineDatabase(process.env.OFFLINE_DATABASE_PATH ?? resolve(process.cwd(), '.data/anclora-fiscal'));
    await migrateOfflineDatabase(database.client);
    await ensureDevelopmentTenant(database.db);
    const commercialOrdersRepositoryForMatching = new DrizzleCommercialOrdersRepository(database.db);
    const financialEventsRepositoryForMatching = new DrizzleFinancialEventsRepository(database.db);
    const matchingService = new MatchingService({
      commercialOrdersRepository: commercialOrdersRepositoryForMatching,
      financialEventsRepository: financialEventsRepositoryForMatching,
      operationsRepository: new DrizzleOperationsRepository(database.db),
      reconciliationRepository: new DrizzleReconciliationRepository(database.db),
      legalEntitiesRepository: new DrizzleLegalEntitiesRepository(database.db),
    });
    importPreviewPersistence = new ImportPreviewPersistenceService(
      new DrizzleImportPreviewRepository(database.db),
      new ImportMetadataCipher(metadataSecret),
      new DrizzleRoyaltyRepository(database.db),
      commercialOrdersRepositoryForMatching,
      financialEventsRepositoryForMatching,
      matchingService,
    );
    operationsRepository = new DrizzleOperationsRepository(database.db);
    financialEventsRepository = new DrizzleFinancialEventsRepository(database.db);
    reconciliationRepository = new DrizzleReconciliationRepository(database.db);
    issuesRepository = new DrizzleIssuesRepository(database.db);
    fiscalDocumentsRepository = new DrizzleFiscalDocumentsRepository(database.db);
    periodClosesRepository = new DrizzlePeriodClosesRepository(database.db);
    dashboardSummaryRepository = new DrizzleDashboardSummaryRepository(database.db);
    authService = new AuthService(new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON), new DrizzleAuthAuditRepository(database.db));
    closeDatabase = () => database.client.close();
  }

  const app = await buildApp({ storage, importPreviewPersistence, operationsRepository, financialEventsRepository, reconciliationRepository, issuesRepository, fiscalDocumentsRepository, periodClosesRepository, dashboardSummaryRepository, authService });
  app.addHook('onClose', closeDatabase);
  return app;
}
