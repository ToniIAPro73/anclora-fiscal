import type { PeriodReadiness } from '@anclora/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
export interface PeriodReadinessRepositoryPort { getPeriodReadiness(tenantId: string, period: string): Promise<PeriodReadiness> }
export function createPeriodReadinessHandler(dependencies: { repository?: PeriodReadinessRepositoryPort | undefined }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'PERIOD_READINESS_UNAVAILABLE' });
    return dependencies.repository.getPeriodReadiness(tenantId, (request.params as { period: string }).period);
  };
}
