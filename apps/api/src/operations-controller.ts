import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePagination } from './pagination.js';
import type { Paginated } from './pagination.js';

export interface Operation {
  id: string;
  tenantId: string;
  legalEntityId: string;
  sourceChannel: string;
  sourceOrderId: string | null;
  operationType: string;
  operationStatus: string;
  reviewStatus: string;
  reconciliationStatus: string;
  verifactuStatus: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export interface OperationsRepositoryPort {
  list(input: { tenantId: string; page: number; pageSize: number; status?: string | undefined; dateFrom?: Date | undefined; dateTo?: Date | undefined; productNature?: string | undefined; sourceChannel?: string | undefined }): Promise<Paginated<Operation>>;
}

function parseDateBoundary(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function createOperationsListHandler(dependencies: { repository?: OperationsRepositoryPort | undefined }) {
  return async function operationsListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'OPERATIONS_REPOSITORY_UNAVAILABLE', message: 'El servicio de operaciones no está disponible' });

    const { page, pageSize } = parsePagination(request.query);
    const query = request.query as { status?: string; dateFrom?: string; dateTo?: string; productNature?: string; sourceChannel?: string } | undefined;
    const status = query?.status;

    return dependencies.repository.list({
      tenantId,
      page,
      pageSize,
      status,
      dateFrom: parseDateBoundary(query?.dateFrom),
      dateTo: parseDateBoundary(query?.dateTo, true),
      productNature: query?.productNature,
      sourceChannel: query?.sourceChannel,
    });
  };
}
