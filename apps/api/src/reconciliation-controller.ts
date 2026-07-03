import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePagination } from './pagination.js';
import type { Paginated } from './pagination.js';

export interface ReconciliationCandidate {
  id: string;
  tenantId: string;
  commercialOrderId: string;
  financialEventId: string;
  confidence: string;
  accepted: boolean;
  commercialOrderExternalId: string;
  financialEventExternalId: string;
  [key: string]: unknown;
}

export interface ReconciliationRepositoryPort {
  list(input: { tenantId: string; page: number; pageSize: number; accepted?: boolean | undefined }): Promise<Paginated<ReconciliationCandidate>>;
}

export function createReconciliationCandidatesListHandler(dependencies: { repository?: ReconciliationRepositoryPort | undefined }) {
  return async function reconciliationCandidatesListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'RECONCILIATION_REPOSITORY_UNAVAILABLE', message: 'El servicio de conciliación no está disponible' });

    const { page, pageSize } = parsePagination(request.query);
    const acceptedRaw = (request.query as { accepted?: string } | undefined)?.accepted;
    const accepted = acceptedRaw === undefined ? undefined : acceptedRaw === 'true';

    return dependencies.repository.list({ tenantId, page, pageSize, accepted });
  };
}
