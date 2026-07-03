import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePagination } from './pagination';
import type { Paginated } from './pagination';

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
  list(input: { tenantId: string; page: number; pageSize: number; status?: string | undefined }): Promise<Paginated<Operation>>;
}

export function createOperationsListHandler(dependencies: { repository?: OperationsRepositoryPort | undefined }) {
  return async function operationsListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'OPERATIONS_REPOSITORY_UNAVAILABLE', message: 'El servicio de operaciones no está disponible' });

    const { page, pageSize } = parsePagination(request.query);
    const status = (request.query as { status?: string } | undefined)?.status;

    return dependencies.repository.list({ tenantId, page, pageSize, status });
  };
}
