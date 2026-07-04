import type { FastifyReply, FastifyRequest } from 'fastify';

export interface DashboardSummary {
  openIssuesCount: number;
  importsThisMonthCount: number;
  reconciliationStatus: { matched: number; unmatched: number; total: number };
  documentsIssuedCount: number;
  royalties: { statementsCount: number; totalThisPeriod: string };
}

export interface DashboardSummaryRepositoryPort {
  getSummary(tenantId: string): Promise<DashboardSummary>;
}

export function createDashboardSummaryHandler(dependencies: { repository?: DashboardSummaryRepositoryPort | undefined }) {
  return async function dashboardSummaryHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'DASHBOARD_REPOSITORY_UNAVAILABLE', message: 'El servicio de resumen no está disponible' });

    return dependencies.repository.getSummary(tenantId);
  };
}
