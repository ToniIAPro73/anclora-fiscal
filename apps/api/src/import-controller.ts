import type { StoragePort } from '@anclora/core/server';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { previewImport, toSafeImportPreview } from './import-service.js';
import type { CommercialOrdersDedupPort, FinancialEventsDedupPort, RoyaltyDedupPort } from './import-service.js';
import type { ImportPreviewPersistencePort } from './import-preview-persistence.js';
import { isImportConnectorId } from '@anclora/db';

const EXPECTED_CONNECTOR_BY_CARD = {
  'shopify-orders': 'shopify-orders-csv',
  'shopify-order-transactions': 'shopify-order-transactions-csv',
  'shopify-payments': 'shopify-csv',
  'amazon-kdp-royalties': 'kdp-xlsx',
  'expenses-csv': 'expenses-csv',
} as const;

const ALLOWED_IMPORT_MIME_TYPES = new Set([
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export function createImportPreviewHandler(dependencies: {
  storage: StoragePort;
  persistence?: ImportPreviewPersistencePort | undefined;
  commercialOrdersRepository?: CommercialOrdersDedupPort | undefined;
  financialEventsRepository?: FinancialEventsDedupPort | undefined;
  royaltyRepository?: RoyaltyDedupPort | undefined;
}) {
  return async function importPreviewHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    const file = await request.file();
    if (!file) return reply.code(400).send({ code: 'FILE_REQUIRED', message: 'Debe adjuntar un archivo' });
    // FASE 03: the multipart form must declare which of the 3 known
    // connectors the upload is for. This is validated at the HTTP layer only
    // -- previewImport() still auto-detects the actual file format/connector
    // from file content, and the two are cross-checked below so a
    // mislabeled upload fails loudly instead of silently mis-routing.
    const connectorIdField = file.fields?.['connectorId'];
    const connectorIdPart = Array.isArray(connectorIdField) ? connectorIdField[0] : connectorIdField;
    const connectorId = connectorIdPart && 'value' in connectorIdPart && typeof connectorIdPart.value === 'string' ? connectorIdPart.value : undefined;
    if (!connectorId || !isImportConnectorId(connectorId)) {
      return reply.code(400).send({ code: 'CONNECTOR_ID_REQUIRED', message: 'Debe indicar un connectorId admitido' });
    }

    if (!ALLOWED_IMPORT_MIME_TYPES.has(file.mimetype)) {
      return reply.code(422).send({ code: 'UNSUPPORTED_MIME_TYPE', message: `Tipo de archivo no admitido: ${file.mimetype}` });
    }

    let preview;
    try {
      preview = await previewImport(
        {
          tenantId,
          filename: file.filename,
          mimeType: file.mimetype,
          bytes: await file.toBuffer(),
          storage: dependencies.storage,
        },
        {
          commercialOrdersRepository: dependencies.commercialOrdersRepository,
          financialEventsRepository: dependencies.financialEventsRepository,
          royaltyRepository: dependencies.royaltyRepository,
        },
      );
    } catch (error) {
      request.log.warn({ error: error instanceof Error ? error.message : 'unknown' }, 'Import preview rejected');
      return reply.code(422).send({ code: 'INVALID_IMPORT', message: 'El archivo no coincide con un formato admitido' });
    }

    if (preview.connector !== EXPECTED_CONNECTOR_BY_CARD[connectorId]) {
      return reply.code(422).send({ code: 'STREAM_MISMATCH', message: `El archivo detectado como ${preview.connector} no corresponde a ${connectorId}` });
    }

    // HTTP-layer rename only (FASE 03): new jobs are reported as ANALYZED,
    // not PREVIEW_READY. The internal previewImport()/persist() functions
    // keep using 'PREVIEW_READY' as their literal type -- only the response
    // body changes, so unit tests of those functions are unaffected.
    const response = toSafeImportPreview(preview, 'ANALYZED');

    if (!dependencies.persistence) return response;

    try {
      const persisted = await dependencies.persistence.persist(tenantId, file.filename, preview);
      return { ...toSafeImportPreview(preview, 'ANALYZED', persisted.issueIds), jobId: persisted.jobId, duplicate: persisted.duplicate };
    } catch (error) {
      // Drizzle wraps driver errors in a DrizzleQueryError whose own .message
      // is just "Failed query: <sql>\nparams: <params>" — the real reason
      // (timeout, constraint violation, connection drop) lives in .cause.
      // Log both so a persistence failure is actually diagnosable from prod logs.
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
      request.log.error({ error: error instanceof Error ? error.message : 'unknown', cause }, 'Import preview persistence failed');
      return reply.code(503).send({ code: 'IMPORT_PERSISTENCE_FAILED', message: 'No se pudo guardar la previsualización' });
    }
  };
}
