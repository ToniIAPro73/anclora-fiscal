import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePagination } from './pagination.js';
import type { Paginated } from './pagination.js';

export interface FinancialEvent {
  id: string;
  tenantId: string;
  sourceChannel: string;
  externalEventId: string;
  eventType: string;
  orderReference: string | null;
  checkoutReference: string | null;
  amount: string;
  feeAmount: string;
  netAmount: string;
  currency: string;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export interface FinancialEventsRepositoryPort {
  list(input: { tenantId: string; page: number; pageSize: number; eventType?: string | undefined }): Promise<Paginated<FinancialEvent>>;
}

export function createFinancialEventsListHandler(dependencies: { repository?: FinancialEventsRepositoryPort | undefined }) {
  return async function financialEventsListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'FINANCIAL_EVENTS_REPOSITORY_UNAVAILABLE', message: 'El servicio de eventos financieros no está disponible' });

    const { page, pageSize } = parsePagination(request.query);
    const eventType = (request.query as { eventType?: string } | undefined)?.eventType;

    return dependencies.repository.list({ tenantId, page, pageSize, eventType });
  };
}
