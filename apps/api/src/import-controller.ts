import type { StoragePort } from '@anclora/core/server';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { previewImport } from './import-service.js';
import type { ImportPreviewPersistencePort } from './import-preview-persistence.js';

const ALLOWED_IMPORT_MIME_TYPES = new Set([
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function createImportPreviewHandler(dependencies: {
  storage: StoragePort;
  persistence?: ImportPreviewPersistencePort | undefined;
}) {
  return async function importPreviewHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    const file = await request.file();
    if (!file) return reply.code(400).send({ code: 'FILE_REQUIRED', message: 'Debe adjuntar un archivo' });
    if (!ALLOWED_IMPORT_MIME_TYPES.has(file.mimetype)) {
      return reply.code(422).send({ code: 'UNSUPPORTED_MIME_TYPE', message: `Tipo de archivo no admitido: ${file.mimetype}` });
    }

    let preview;
    try {
      preview = await previewImport({
        tenantId,
        filename: file.filename,
        mimeType: file.mimetype,
        bytes: await file.toBuffer(),
        storage: dependencies.storage,
      });
    } catch (error) {
      request.log.warn({ error: error instanceof Error ? error.message : 'unknown' }, 'Import preview rejected');
      return reply.code(422).send({ code: 'INVALID_IMPORT', message: 'El archivo no coincide con un formato admitido' });
    }

    if (!dependencies.persistence) return preview;

    try {
      const persisted = await dependencies.persistence.persist(tenantId, file.filename, preview);
      return { ...preview, ...persisted };
    } catch (error) {
      request.log.error({ error: error instanceof Error ? error.message : 'unknown' }, 'Import preview persistence failed');
      return reply.code(503).send({ code: 'IMPORT_PERSISTENCE_FAILED', message: 'No se pudo guardar la previsualización' });
    }
  };
}
