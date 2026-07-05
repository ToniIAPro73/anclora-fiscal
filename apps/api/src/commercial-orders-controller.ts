import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePagination, type Paginated } from './pagination.js';

export interface CommercialOrderListItem {
  id: string;
  externalOrderId: string;
  sourceChannel: string;
  commercialDate: Date | null;
  productNature?: string | null;
  totalAmount?: string | null;
  taxAmount?: string | null;
  [key: string]: unknown;
}

export interface CommercialOrdersRepositoryPort {
  listByTenant(input: { tenantId: string; page: number; pageSize: number }): Promise<Paginated<CommercialOrderListItem>>;
}

export function createCommercialOrdersListHandler(dependencies: { repository?: CommercialOrdersRepositoryPort | undefined }) {
  return async function commercialOrdersListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'COMMERCIAL_ORDERS_REPOSITORY_UNAVAILABLE', message: 'El servicio de pedidos no está disponible' });
    const { page, pageSize } = parsePagination(request.query);
    return dependencies.repository.listByTenant({ tenantId, page, pageSize });
  };
}
