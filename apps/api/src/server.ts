import { FilesystemStorage } from '@anclora/core/server';
import { createOfflineDatabase, createRemoteDatabase, DrizzleImportPreviewRepository, ensureDevelopmentTenant, migrateOfflineDatabase } from '@anclora/db';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { ImportMetadataCipher, ImportPreviewPersistenceService, type ImportPreviewPersistencePort } from './import-preview-persistence';

const metadataSecret = process.env.IMPORT_METADATA_SECRET ?? 'development-only-import-metadata-secret';
if (process.env.NODE_ENV === 'production' && !process.env.IMPORT_METADATA_SECRET) {
  throw new Error('IMPORT_METADATA_SECRET es obligatorio en producción');
}
const storage = new FilesystemStorage(process.env.STORAGE_ROOT ?? resolve(process.cwd(), 'storage'));

let closeDatabase: () => Promise<unknown>;
let tenantId: string;
let importPreviewPersistence: ImportPreviewPersistencePort;

if (process.env.DATABASE_URL) {
  const database = createRemoteDatabase(process.env.DATABASE_URL);
  tenantId = process.env.TENANT_ID ?? '';
  if (!tenantId) throw new Error('TENANT_ID es obligatorio cuando se usa DATABASE_URL');
  importPreviewPersistence = new ImportPreviewPersistenceService(
    new DrizzleImportPreviewRepository(database.db),
    tenantId,
    new ImportMetadataCipher(metadataSecret),
  );
  closeDatabase = database.close;
} else {
  const database = createOfflineDatabase(process.env.OFFLINE_DATABASE_PATH ?? resolve(process.cwd(), '.data/anclora-fiscal'));
  await migrateOfflineDatabase(database.client);
  tenantId = await ensureDevelopmentTenant(database.db);
  importPreviewPersistence = new ImportPreviewPersistenceService(
    new DrizzleImportPreviewRepository(database.db),
    tenantId,
    new ImportMetadataCipher(metadataSecret),
  );
  closeDatabase = () => database.client.close();
}

const app = await buildApp({ tenantId, storage, importPreviewPersistence });
app.addHook('onClose', closeDatabase);
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
