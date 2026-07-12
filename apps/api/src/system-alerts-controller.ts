import type { FastifyReply, FastifyRequest } from 'fastify';

export interface SystemAlertItem {
  id: string; tenantId: string; severity: string; type: string; source: string;
  detail: unknown; status: string; openedAt: Date; resolvedAt: Date | null; resolution: string | null;
}
export interface SystemAlertsRepositoryPort {
  list(input: { tenantId: string; status?: 'OPEN' | 'RESOLVED' }): Promise<SystemAlertItem[]>;
  resolve(input: { tenantId: string; alertId: string; actorId: string; resolution: string }): Promise<SystemAlertItem | null>;
}

export function createSystemAlertsListHandler(dependencies: { repository?: SystemAlertsRepositoryPort | undefined }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'SYSTEM_ALERTS_REPOSITORY_UNAVAILABLE' });
    const status = (request.query as { status?: string }).status;
    const items = await dependencies.repository.list({ tenantId, ...(status === 'OPEN' || status === 'RESOLVED' ? { status } : {}) });
    return { items };
  };
}

export function createSystemAlertResolveHandler(dependencies: { repository?: SystemAlertsRepositoryPort | undefined }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;
    if (!tenantId || !actorId) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'SYSTEM_ALERTS_REPOSITORY_UNAVAILABLE' });
    const resolution = (request.body as { resolution?: unknown })?.resolution;
    if (typeof resolution !== 'string' || !resolution.trim()) return reply.code(400).send({ code: 'RESOLUTION_REQUIRED' });
    const alert = await dependencies.repository.resolve({ tenantId, actorId, alertId: (request.params as { id: string }).id, resolution: resolution.trim() });
    if (!alert) return reply.code(404).send({ code: 'SYSTEM_ALERT_NOT_FOUND' });
    return alert;
  };
}
