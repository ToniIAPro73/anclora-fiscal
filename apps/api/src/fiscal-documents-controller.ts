import type { StoragePort, VerifactuRuntimeConfig } from '@anclora/core/server';
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
  | {
      ok: true;
      document: FiscalDocument;
      alreadyIssued: boolean;
    }
  | {
      ok: false;
      reason:
        | 'OPERATION_NOT_FOUND'
        | 'TAX_DECISION_MISSING'
        | 'FISCAL_CONFIGURATION_INCOMPLETE'
        | 'DECISION_FISCAL_NO_EMITIBLE'
        | 'COBRO_SHOPIFY_NO_CONFIRMADO'
        | 'CONFIGURACION_FISCAL_INCOMPLETA'
        | 'IMPORTE_CERO_EN_REVISION';
    };

export type RectifyInvoiceResult =
  | {
      ok: true;
      document: FiscalDocument;
      alreadyRectified: boolean;
    }
  | {
      ok: false;
      reason: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE' | 'CONFIGURACION_FISCAL_INCOMPLETA';
    };

export interface IssueEligibleForPeriodResult {
  period: string;
  issued: Array<{ canonicalOperationId: string; documentId: string; documentNumber: string }>;
  skipped: Array<{ canonicalOperationId: string; reason: string }>;
  errors: Array<{ canonicalOperationId: string; message: string }>;
}

export interface FiscalDocumentsRepositoryPort {
  issue(input: {
    tenantId: string;
    actorId: string | null;
    canonicalOperationId: string;
    storage: StoragePort;
    verifactuConfig?: VerifactuRuntimeConfig | undefined;
  }): Promise<IssueInvoiceResult>;

  findById?(
    tenantId: string,
    fiscalDocumentId: string,
  ): Promise<FiscalDocument | null>;

  rectify?(input: {
    tenantId: string;
    actorId: string | null;
    fiscalDocumentId: string;
    storage: StoragePort;
    verifactuConfig?: VerifactuRuntimeConfig | undefined;
  }): Promise<RectifyInvoiceResult>;

  issueEligibleForPeriod?(input: {
    tenantId: string;
    actorId: string | null;
    period: string;
    storage: StoragePort;
    verifactuConfig?: VerifactuRuntimeConfig | undefined;
  }): Promise<IssueEligibleForPeriodResult>;
}

export function createInvoiceIssueHandler(dependencies: {
  repository?: FiscalDocumentsRepositoryPort | undefined;
  storage: StoragePort;
  verifactuConfig?: VerifactuRuntimeConfig | undefined;
}) {
  return async function invoiceIssueHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;

    if (!tenantId || !actorId) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Debe iniciar sesión',
      });
    }

    if (!dependencies.repository) {
      return reply.code(503).send({
        code: 'FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE',
        message: 'El servicio de facturación no está disponible',
      });
    }

    const { id } = request.params as { id: string };

    const result = await dependencies.repository.issue({
      tenantId,
      actorId,
      canonicalOperationId: id,
      storage: dependencies.storage,
      ...(dependencies.verifactuConfig
        ? { verifactuConfig: dependencies.verifactuConfig }
        : {}),
    });

    if (isIssueInvoiceError(result)) {
      if (result.reason === 'OPERATION_NOT_FOUND') {
        return reply.code(404).send({
          code: 'OPERATION_NOT_FOUND',
          message: 'La operación no existe',
        });
      }

      if (result.reason === 'TAX_DECISION_MISSING') {
        return reply.code(422).send({
          code: 'TAX_DECISION_MISSING',
          message: 'La operación no tiene una decisión fiscal registrada',
        });
      }

      if (result.reason === 'FISCAL_CONFIGURATION_INCOMPLETE') {
        return reply.code(422).send({
          code: 'FISCAL_CONFIGURATION_INCOMPLETE',
          message: 'Complete emisor, serie y perfil fiscal antes de emitir',
        });
      }

      if (result.reason === 'CONFIGURACION_FISCAL_INCOMPLETA') {
        return reply.code(422).send({
          code: 'CONFIGURACION_FISCAL_INCOMPLETA',
          message:
            'Complete emisor, NIF/NIE, domicilio, serie y perfil fiscal antes de emitir',
        });
      }

      if (result.reason === 'COBRO_SHOPIFY_NO_CONFIRMADO') {
        return reply.code(422).send({
          code: 'COBRO_SHOPIFY_NO_CONFIRMADO',
          message:
            'No existe un cobro Shopify confirmado para esta operación',
        });
      }

      if (result.reason === 'DECISION_FISCAL_NO_EMITIBLE') {
        return reply.code(422).send({
          code: 'DECISION_FISCAL_NO_EMITIBLE',
          message:
            'La decisión fiscal actual no permite emitir una factura',
        });
      }

      if (result.reason === 'IMPORTE_CERO_EN_REVISION') {
        return reply.code(422).send({
          code: 'IMPORTE_CERO_EN_REVISION',
          message:
            'Las operaciones con importe cero requieren revisión fiscal',
        });
      }

      return reply.code(500).send({
        code: 'INVOICE_ISSUE_FAILED',
        message: 'No se pudo emitir la factura',
      });
    }

    return reply
      .code(result.alreadyIssued ? 200 : 201)
      .send(result.document);
  };
}

function isIssueInvoiceError(
  result: IssueInvoiceResult,
): result is {
  ok: false;
  reason:
    | 'OPERATION_NOT_FOUND'
    | 'TAX_DECISION_MISSING'
    | 'FISCAL_CONFIGURATION_INCOMPLETE'
    | 'DECISION_FISCAL_NO_EMITIBLE'
    | 'COBRO_SHOPIFY_NO_CONFIRMADO'
    | 'CONFIGURACION_FISCAL_INCOMPLETA'
    | 'IMPORTE_CERO_EN_REVISION';
} {
  return !result.ok;
}

function isRectifyInvoiceError(
  result: RectifyInvoiceResult,
): result is {
  ok: false;
  reason: 'DOCUMENT_NOT_FOUND' | 'INVALID_DOCUMENT_STATE' | 'CONFIGURACION_FISCAL_INCOMPLETA';
} {
  return !result.ok;
}

export function createInvoiceRectifyHandler(dependencies: {
  repository?: FiscalDocumentsRepositoryPort | undefined;
  storage: StoragePort;
  verifactuConfig?: VerifactuRuntimeConfig | undefined;
}) {
  return async function invoiceRectifyHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;

    if (!tenantId || !actorId) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Debe iniciar sesión',
      });
    }

    if (!dependencies.repository?.rectify) {
      return reply.code(503).send({
        code: 'FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE',
        message: 'El servicio de facturación no está disponible',
      });
    }

    const { id } = request.params as { id: string };

    const result = await dependencies.repository.rectify({
      tenantId,
      actorId,
      fiscalDocumentId: id,
      storage: dependencies.storage,
      ...(dependencies.verifactuConfig
        ? { verifactuConfig: dependencies.verifactuConfig }
        : {}),
    });

    if (isRectifyInvoiceError(result)) {
      if (result.reason === 'DOCUMENT_NOT_FOUND') {
        return reply.code(404).send({
          code: 'DOCUMENT_NOT_FOUND',
          message: 'El documento fiscal no existe',
        });
      }

      if (result.reason === 'INVALID_DOCUMENT_STATE') {
        return reply.code(409).send({
          code: 'INVALID_DOCUMENT_STATE',
          message:
            'El documento no puede rectificarse en su estado actual',
        });
      }

      return reply.code(500).send({
        code: 'INVOICE_RECTIFY_FAILED',
        message: 'No se pudo rectificar la factura',
      });
    }

    return reply
      .code(result.alreadyRectified ? 200 : 201)
      .send(result.document);
  };
}

function invoiceFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
}

export function createInvoiceDownloadHandler(dependencies: {
  repository?: FiscalDocumentsRepositoryPort | undefined;
  storage: StoragePort;
}) {
  return async function invoiceDownloadHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const tenantId = request.authSession?.tenantId;

    if (!tenantId) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Debe iniciar sesión',
      });
    }

    if (!dependencies.repository?.findById) {
      return reply.code(503).send({
        code: 'FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE',
        message: 'El servicio de facturación no está disponible',
      });
    }

    const { id } = request.params as { id: string };

    const document = await dependencies.repository.findById(
      tenantId,
      id,
    );

    if (!document) {
      return reply.code(404).send({
        code: 'DOCUMENT_NOT_FOUND',
        message: 'El documento fiscal no existe',
      });
    }

    const bytes = await dependencies.storage.get(
      document.renderStorageKey,
    );

    return reply
      .header(
        'content-disposition',
        `attachment; filename="${invoiceFilename(document.number)}"`,
      )
      .type('application/pdf')
      .send(Buffer.from(bytes));
  };
}

const PERIOD_PATTERN = /^\d{4}-\d{2}$/;

export function createInvoiceBatchIssueHandler(dependencies: {
  repository?: FiscalDocumentsRepositoryPort | undefined;
  storage: StoragePort;
  verifactuConfig?: VerifactuRuntimeConfig | undefined;
}) {
  return async function invoiceBatchIssueHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;

    if (!tenantId || !actorId) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Debe iniciar sesión',
      });
    }

    if (!dependencies.repository?.issueEligibleForPeriod) {
      return reply.code(503).send({
        code: 'FISCAL_DOCUMENTS_REPOSITORY_UNAVAILABLE',
        message: 'El servicio de facturación no está disponible',
      });
    }

    const { period } = request.params as { period: string };

    if (!PERIOD_PATTERN.test(period)) {
      return reply.code(400).send({
        code: 'INVALID_PERIOD',
        message: 'El periodo debe tener el formato AAAA-MM',
      });
    }

    const result = await dependencies.repository.issueEligibleForPeriod({
      tenantId,
      actorId,
      period,
      storage: dependencies.storage,
      ...(dependencies.verifactuConfig
        ? { verifactuConfig: dependencies.verifactuConfig }
        : {}),
    });

    return reply.code(200).send(result);
  };
}