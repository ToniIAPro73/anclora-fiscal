import { FilesystemStorage } from '@anclora/core/server';
import { createOfflineDatabase, createRemoteDatabase, DrizzleAuthAuditRepository, DrizzleImportPreviewRepository, ensureDevelopmentTenant, migrateOfflineDatabase } from '@anclora/db';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { ImportMetadataCipher, ImportPreviewPersistenceService, type ImportPreviewPersistencePort } from './import-preview-persistence';
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
let authService: AuthService;

if (process.env.DATABASE_URL) {
  const database = createRemoteDatabase(process.env.DATABASE_URL);
  importPreviewPersistence = new ImportPreviewPersistenceService(
    new DrizzleImportPreviewRepository(database.db),
    new ImportMetadataCipher(metadataSecret),
  );
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
  authService = new AuthService(new ConfiguredIdentityProvider(process.env.AUTH_IDENTITIES_JSON), new DrizzleAuthAuditRepository(database.db));
  closeDatabase = () => database.client.close();
}

const app = await buildApp({ storage, importPreviewPersistence, authService });
app.addHook('onClose', closeDatabase);
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
