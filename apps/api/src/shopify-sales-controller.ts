import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { StoragePort, VerifactuRuntimeConfig } from '@anclora/core/server';
import type { FiscalDocumentsRepositoryPort } from './fiscal-documents-controller.js';
import {
  evaluarPuertaEmisionManual,
} from './invoice-issuance-service.js';
import { parsePagination, type Paginated } from './pagination.js';

const filtersSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  paymentStatus: z.string().optional(),
  refundStatus: z.string().optional(),
  fiscalStatus: z.string().optional(),
  settlementStatus: z.enum(['PENDING', 'SETTLED']).optional(),
  zeroAmount: z.enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

const paramsSchema = z.object({
  orderId: z.string().uuid(),
});

export interface ShopifyAdvisoryExportRow {
  commercialDate: Date | string | null;
  externalOrderId: string;
  customerCountry: string | null;
  channel: string;
  totalAmount: number;
  taxBase: number;
  taxAmount: number;
  taxRate: number;
  fiscalStatus: string;
  documentType: string | null;
  documentNumber: string | null;
  reconciliationStatus: string | null;
  verifactuStatus: string | null;
  settlementStatus: string | null;
}

export interface ShopifySalesRepositoryPort {
  list(input: {
    tenantId: string;
    page: number;
    pageSize: number;
    dateFrom?: Date;
    dateTo?: Date;
    paymentStatus?: string;
    refundStatus?: string;
    fiscalStatus?: string;
    settlementStatus?: 'PENDING' | 'SETTLED';
    zeroAmount?: boolean;
  }): Promise<Paginated<Record<string, unknown>> & {
    metrics: Record<string, unknown>;
  }>;

  getById(
    tenantId: string,
    orderId: string,
  ): Promise<Record<string, unknown> | null>;

  exportAdvisory?(input: {
    tenantId: string;
    dateFrom?: Date;
    dateTo?: Date;
    paymentStatus?: string;
    refundStatus?: string;
    fiscalStatus?: string;
    settlementStatus?: 'PENDING' | 'SETTLED';
    zeroAmount?: boolean;
  }): Promise<ShopifyAdvisoryExportRow[]>;
}

interface ShopifySaleEligibility {
  // Campos legacy: compatibilidad con consumidores y pruebas anteriores.
  hasFiscalConfiguration?: boolean;
  hasFiscalProfile?: boolean;
  hasOrderEvidence?: boolean;
  hasTransactionsEvidence?: boolean;
  hasTaxDecision?: boolean;

  // Contrato fiscal nuevo.
  configuracionFiscalLista?: boolean;
  perfilFiscalVigente?: boolean;
  existePedidoComercial?: boolean;
  existeTransaccionShopifyConfirmada?: boolean;
  estadoDecisionFiscal?: string | null;
  tipoDocumentoFiscal?: string | null;
}

const ADVISORY_EXPORT_CSV_HEADER = [
  'order_date',
  'shopify_order',
  'country',
  'channel',
  'total_amount',
  'tax_base',
  'tax_amount',
  'tax_rate',
  'fiscal_status',
  'document_type',
  'document_number',
  'reconciliation_status',
  'verifactu_status',
  'settlement_status',
] as const;

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function formatCsvDate(value: Date | string | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** Two decimals for amounts, four for the tax rate — same convention as `docs/asesoria-export-spec.md`. */
function buildAdvisoryExportCsv(rows: ShopifyAdvisoryExportRow[]): string {
  const lines = [ADVISORY_EXPORT_CSV_HEADER.join(',')];

  for (const row of rows) {
    lines.push([
      formatCsvDate(row.commercialDate),
      csvField(row.externalOrderId),
      row.customerCountry ?? '',
      row.channel,
      row.totalAmount.toFixed(2),
      row.taxBase.toFixed(2),
      row.taxAmount.toFixed(2),
      row.taxRate.toFixed(4),
      row.fiscalStatus,
      row.documentType ?? '',
      row.documentNumber ?? '',
      row.reconciliationStatus ?? '',
      row.verifactuStatus ?? '',
      row.settlementStatus ?? '',
    ].join(','));
  }

  return `${lines.join('\r\n')}\r\n`;
}

export function createShopifySalesExportHandler(
  repository?: ShopifySalesRepositoryPort,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;

    if (!tenantId) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Debe iniciar sesión',
      });
    }

    if (!repository?.exportAdvisory) {
      return reply.code(503).send({
        code: 'SHOPIFY_SALES_UNAVAILABLE',
        message: 'El servicio de exportación de ventas Shopify no está disponible',
      });
    }

    const parsed = filtersSchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.code(400).send({
        code: 'INVALID_SHOPIFY_SALES_FILTER',
        message: 'Filtros no válidos',
      });
    }

    const data = parsed.data;

    const rows = await repository.exportAdvisory({
      tenantId,
      ...(data.dateFrom ? { dateFrom: data.dateFrom } : {}),
      ...(data.dateTo ? { dateTo: data.dateTo } : {}),
      ...(data.paymentStatus ? { paymentStatus: data.paymentStatus } : {}),
      ...(data.refundStatus ? { refundStatus: data.refundStatus } : {}),
      ...(data.fiscalStatus ? { fiscalStatus: data.fiscalStatus } : {}),
      ...(data.settlementStatus ? { settlementStatus: data.settlementStatus } : {}),
      ...(data.zeroAmount !== undefined ? { zeroAmount: data.zeroAmount } : {}),
    });

    return reply
      .header('content-disposition', 'attachment; filename="ventas-shopify-asesoria.csv"')
      .type('text/csv; charset=utf-8')
      .send(buildAdvisoryExportCsv(rows));
  };
}

interface ShopifySaleDetail {
  order?: {
    fiscalStatus?: string | null;
    totalAmount?: string | null;
  };
  operation?: {
    id: string;
  } | null;
  eligibility?: ShopifySaleEligibility;
}

export function createShopifySalesListHandler(
  repository?: ShopifySalesRepositoryPort,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;

    if (!tenantId) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Debe iniciar sesión',
      });
    }

    if (!repository) {
      return reply.code(503).send({
        code: 'SHOPIFY_SALES_UNAVAILABLE',
        message: 'El servicio de ventas Shopify no está disponible',
      });
    }

    const parsed = filtersSchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.code(400).send({
        code: 'INVALID_SHOPIFY_SALES_FILTER',
        message: 'Filtros no válidos',
      });
    }

    const { page, pageSize } = parsePagination(request.query);
    const data = parsed.data;

    return repository.list({
      tenantId,
      page,
      pageSize,
      ...(data.dateFrom ? { dateFrom: data.dateFrom } : {}),
      ...(data.dateTo ? { dateTo: data.dateTo } : {}),
      ...(data.paymentStatus
        ? { paymentStatus: data.paymentStatus }
        : {}),
      ...(data.refundStatus
        ? { refundStatus: data.refundStatus }
        : {}),
      ...(data.fiscalStatus
        ? { fiscalStatus: data.fiscalStatus }
        : {}),
      ...(data.settlementStatus
        ? { settlementStatus: data.settlementStatus }
        : {}),
      ...(data.zeroAmount !== undefined
        ? { zeroAmount: data.zeroAmount }
        : {}),
    });
  };
}

export function createShopifySaleDetailHandler(
  repository?: ShopifySalesRepositoryPort,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;

    if (!tenantId) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Debe iniciar sesión',
      });
    }

    if (!repository) {
      return reply.code(503).send({
        code: 'SHOPIFY_SALES_UNAVAILABLE',
        message: 'El servicio de ventas Shopify no está disponible',
      });
    }

    const parsed = paramsSchema.safeParse(request.params);

    if (!parsed.success) {
      return reply.code(400).send({
        code: 'INVALID_ORDER_ID',
        message: 'Pedido no válido',
      });
    }

    const result = await repository.getById(
      tenantId,
      parsed.data.orderId,
    );

    if (!result) {
      return reply.code(404).send({
        code: 'SHOPIFY_ORDER_NOT_FOUND',
        message: 'Pedido no encontrado',
      });
    }

    return result;
  };
}

export function createShopifySaleInvoiceHandler(dependencies: {
  repository?: ShopifySalesRepositoryPort | undefined;
  fiscalDocumentsRepository?: FiscalDocumentsRepositoryPort | undefined;
  storage: StoragePort;
  verifactuConfig?: VerifactuRuntimeConfig | undefined;
}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.authSession;

    if (!session) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Debe iniciar sesión',
      });
    }

    if (
      !dependencies.repository
      || !dependencies.fiscalDocumentsRepository
    ) {
      return reply.code(503).send({
        code: 'SHOPIFY_INVOICE_UNAVAILABLE',
        message: 'El servicio de facturación no está disponible',
      });
    }

    const parsed = paramsSchema.safeParse(request.params);

    if (!parsed.success) {
      return reply.code(400).send({
        code: 'INVALID_ORDER_ID',
        message: 'Pedido no válido',
      });
    }

    const detail = await dependencies.repository.getById(
      session.tenantId,
      parsed.data.orderId,
    ) as ShopifySaleDetail | null;

    if (!detail) {
      return reply.code(404).send({
        code: 'SHOPIFY_ORDER_NOT_FOUND',
        message: 'Pedido no encontrado',
      });
    }

    if (!detail.operation) {
      return reply.code(422).send({
        code: 'FISCAL_CASE_MISSING',
        message: 'El pedido aún no tiene expediente fiscal',
      });
    }

    const eligibility = detail.eligibility ?? {};

    const estadoFiscal = Number(detail.order?.totalAmount ?? 0) === 0
      ? 'REVISION_IMPORTE_CERO'
      : detail.order?.fiscalStatus ?? 'PENDIENTE_REVISION_FISCAL';

    const puerta = evaluarPuertaEmisionManual(session.role, {
      idOperacion: detail.operation.id,
      estadoFiscal,

      // El pedido existe porque getById lo ha localizado.
      existePedidoComercial: eligibility.existePedidoComercial ?? true,

      // Debe proceder de sale/capture con estado success/succeeded.
      existeTransaccionShopifyConfirmada:
        eligibility.existeTransaccionShopifyConfirmada ?? false,

      configuracionFiscalLista: eligibility.configuracionFiscalLista ?? false,

      perfilFiscalVigente: eligibility.perfilFiscalVigente ?? false,

      estadoDecisionFiscal: eligibility.estadoDecisionFiscal ?? null,

      tipoDocumentoFiscal: eligibility.tipoDocumentoFiscal ?? null,
    });

    if (!puerta.permitida) {
      return reply.code(422).send({
        code: puerta.motivo,
        message: 'La política fiscal no permite emitir este pedido todavía',
      });
    }

    const result = await dependencies.fiscalDocumentsRepository.issue({
      tenantId: session.tenantId,
      actorId: session.actorId,
      canonicalOperationId: detail.operation.id,
      storage: dependencies.storage,
      ...(dependencies.verifactuConfig
        ? { verifactuConfig: dependencies.verifactuConfig }
        : {}),
    });

    if (!result.ok) {
      return reply.code(422).send({
        code: result.reason,
        message: 'No se pudo emitir la factura',
      });
    }

    return reply
      .code(result.alreadyIssued ? 200 : 201)
      .send(result.document);
  };
}