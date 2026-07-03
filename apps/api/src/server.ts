import { FilesystemStorage } from '@anclora/core/server';
import { createOfflineDatabase, createRemoteDatabase, DrizzleAuthAuditRepository, DrizzleFinancialEventsRepository, DrizzleFiscalDocumentsRepository, DrizzleImportPreviewRepository, DrizzleIssuesRepository, DrizzleOperationsRepository, DrizzlePeriodClosesRepository, DrizzleReconciliationRepository, ensureDevelopmentTenant, migrateOfflineDatabase } from '@anclora/db';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { ImportMetadataCipher, ImportPreviewPersistenceService, type ImportPreviewPersistencePort } from './import-preview-persistence';
import type { OperationsRepositoryPort } from './operations-controller';
import type { FinancialEventsRepositoryPort } from './financial-events-controller';
import type { ReconciliationRepositoryPort } from './reconciliation-controller';
import type { IssuesRepositoryPort } from './issues-controller';
import type { FiscalDocumentsRepositoryPort } from './fiscal-documents-controller';
import type { PeriodClosesRepositoryPort } from './period-closes-controller';
import { AuthService, ConfiguredIdentityProvider } from './auth-service';

const localEnvFile = fileURLToPath(new URL('../../../.env.local', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(localEnvFile)) loadEnvFile(localEnvFile);

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
let authService: AuthService;

if (process.env.DATABASE_URL) {
  const database = createRemoteDatabase(process.env.DATABASE_URL);
  importPreviewPersistence = new ImportPreviewPersistenceService(
    new DrizzleImportPreviewRepository(database.db),
    new ImportMetadataCipher(metadataSecret),
  );
  operationsRepository = new DrizzleOperationsRepository(database.db);
  financialEventsRepository = new DrizzleFinancialEventsRepository(database.db);
  reconciliationRepository = new DrizzleReconciliationRepository(database.db);
  issuesRepository = new DrizzleIssuesRepository(database.db);
  fiscalDocumentsRepository = new DrizzleFiscalDocumentsRepository(database.db);
  periodClosesRepository = new DrizzlePeriodClosesRepository(database.db);
  authService = new AuthService(new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON), new DrizzleAuthAuditRepository(database.db));
  closeDatabase = database.close;
} else {
  const database = createOfflineDatabase(process.env.OFFLINE_DATABASE_PATH ?? resolve(process.cwd(), '.data/anclora-fiscal'));
  await migrateOfflineDatabase(database.client);
  await ensureDevelopmentTenant(database.db);
  importPreviewPersistence = new ImportPreviewPersistenceService(
    new DrizzleImportPreviewRepository(database.db),
    new ImportMetadataCipher(metadataSecret),
  );
  operationsRepository = new DrizzleOperationsRepository(database.db);
  financialEventsRepository = new DrizzleFinancialEventsRepository(database.db);
  reconciliationRepository = new DrizzleReconciliationRepository(database.db);
  issuesRepository = new DrizzleIssuesRepository(database.db);
  fiscalDocumentsRepository = new DrizzleFiscalDocumentsRepository(database.db);
  periodClosesRepository = new DrizzlePeriodClosesRepository(database.db);
  authService = new AuthService(new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON), new DrizzleAuthAuditRepository(database.db));
  closeDatabase = () => database.client.close();
}

const app = await buildApp({ storage, importPreviewPersistence, operationsRepository, financialEventsRepository, reconciliationRepository, issuesRepository, fiscalDocumentsRepository, periodClosesRepository, authService });
app.addHook('onClose', closeDatabase);
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
