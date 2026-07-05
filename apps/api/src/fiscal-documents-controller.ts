import type { StoragePort } from '@anclora/core/server';
import type { FastifyReply, FastifyRequest } from 'fastify';

export interface FiscalDocument {
  id: string;
  tenantId: string;
  canonicalOperationId: string;
  number: string;
  documentType: string;
  status: string;
  issuedAt: Date;
  taxBase: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  renderStorageKey: string;
  renderSha256: string;
  locked: boolean;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export type IssueInvoiceResult =
  | { ok: true; document: FiscalDocument; alreadyIssued: boolean }
  | { ok: false; reason: 'OPERATION_NOT_FOUND' | 'TAX_DECISION_MISSING' | 'FISCAL_CONFIGURATION_INCOMPLETE' };

export type RectifyInvoiceResult =
  | { ok: true; document: FiscalDocument; alreadyRectified: boolean }
  | { ok: false; reason: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE' };

export interface FiscalDocumentsRepositoryPort {
  issue(input: { tenantId: string; actorId: string; canonicalOperationId: string; storage: StoragePort }): Promise<IssueInvoiceResult>;
  rectify?(input: { tenantId: string; actorId: string; fiscalDocumentId: string; storage: StoragePort }): Promise<RectifyInvoiceResult>;
}

export function createInvoiceIssueHandler(dependencies: {
  repository?: FiscalDocumentsRepositoryPort | undefined;
  storage: StoragePort;
}) {
  return async function invoiceIssueHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;
    if (!tenantId || !actorId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE', message: 'El servicio de facturación no está disponible' });

    const { id } = request.params as { id: string };
    const result = await dependencies.repository.issue({
      tenantId,
      actorId,
      canonicalOperationId: id,
      storage: dependencies.storage,
    });

    if (isIssueInvoiceError(result)) {
      if (result.reason === 'OPERATION_NOT_FOUND') {
        return reply.code(404).send({ code: 'OPERATION_NOT_FOUND', message: 'La operación no existe' });
      }
      if (result.reason === 'TAX_DECISION_MISSING') {
        return reply.code(422).send({ code: 'TAX_DECISION_MISSING', message: 'La operación no tiene una decisión fiscal registrada' });
      }
      if (result.reason === 'FISCAL_CONFIGURATION_INCOMPLETE') {
        return reply.code(422).send({ code: 'FISCAL_CONFIGURATION_INCOMPLETE', message: 'Complete emisor, serie y perfil fiscal antes de emitir' });
      }
      return reply.code(500).send({ code: 'INVOICE_ISSUE_FAILED', message: 'No se pudo emitir la factura' });
    }

    return reply.code(result.alreadyIssued ? 200 : 201).send(result.document);
  };
}

function isIssueInvoiceError(r: IssueInvoiceResult): r is { ok: false; reason: 'OPERATION_NOT_FOUND' | 'TAX_DECISION_MISSING' | 'FISCAL_CONFIGURATION_INCOMPLETE' } {
  return !r.ok;
}

function isRectifyInvoiceError(r: RectifyInvoiceResult): r is { ok: false; reason: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE' } {
  return !r.ok;
}

export function createInvoiceRectifyHandler(dependencies: {
  repository?: FiscalDocumentsRepositoryPort | undefined;
  storage: StoragePort;
}) {
  return async function invoiceRectifyHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;
    if (!tenantId || !actorId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository?.rectify) return reply.code(503).send({ code: 'FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE', message: 'El servicio de facturación no está disponible' });

    const { id } = request.params as { id: string };
    const result = await dependencies.repository.rectify({
      tenantId,
      actorId,
      fiscalDocumentId: id,
      storage: dependencies.storage,
    });

    if (isRectifyInvoiceError(result)) {
      if (result.reason === 'DOCUMENT_NOT_FOUND') {
        return reply.code(404).send({ code: 'DOCUMENT_NOT_FOUND', message: 'El documento fiscal no existe' });
      }
      if (result.reason === 'INVALID_DOCUMENT_STATE') {
        return reply.code(409).send({ code: 'INVALID_DOCUMENT_STATE', message: 'El documento no puede rectificarse en su estado actual' });
      }
      return reply.code(500).send({ code: 'INVOICE_RECTIFY_FAILED', message: 'No se pudo rectificar la factura' });
    }

    return reply.code(result.alreadyRectified ? 200 : 201).send(result.document);
  };
}
