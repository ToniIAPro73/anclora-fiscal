import type { FastifyReply, FastifyRequest } from 'fastify';

export interface PeriodClose {
  id: string;
  tenantId: string;
  period: string;
  status: string;
  frozenAt: Date | null;
  approvedBy: string | null;
  blockingApprovalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export type ClosePeriodResult =
  | { ok: true; periodClose: PeriodClose; alreadyClosed: boolean }
  | { ok: false; reason: 'BLOCKING_ISSUES_OPEN'; issueIds: string[] };

export type ReopenPeriodResult =
  | { ok: true; periodClose: PeriodClose }
  | { ok: false; reason: 'PERIOD_NOT_CLOSED' };

export interface PeriodClosesRepositoryPort {
  close(tenantId: string, period: string, actorId: string): Promise<ClosePeriodResult>;
  reopen(tenantId: string, period: string, actorId: string): Promise<ReopenPeriodResult>;
}

export function createPeriodCloseHandler(dependencies: { repository?: PeriodClosesRepositoryPort | undefined }) {
  return async function periodCloseHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;
    if (!tenantId || !actorId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'PERIOD_CLOSES_REPOSITORY_UNAVAILABLE', message: 'El servicio de cierre de períodos no está disponible' });

    const { period } = request.params as { period: string };
    const result = await dependencies.repository.close(tenantId, period, actorId);

    if (isClosePeriodError(result)) {
      if (result.reason === 'BLOCKING_ISSUES_OPEN') {
        return reply.code(409).send({ code: 'BLOCKING_ISSUES_OPEN', message: 'Existen incidencias bloqueantes abiertas en el período', issueIds: result.issueIds });
      }
      return reply.code(500).send({ code: 'PERIOD_CLOSE_FAILED', message: 'No se pudo cerrar el período' });
    }

    return reply.code(result.alreadyClosed ? 200 : 201).send(result.periodClose);
  };
}

function isClosePeriodError(r: ClosePeriodResult): r is { ok: false; reason: 'BLOCKING_ISSUES_OPEN'; issueIds: string[] } {
  return !r.ok;
}

function isReopenPeriodError(r: ReopenPeriodResult): r is { ok: false; reason: 'PERIOD_NOT_CLOSED' } {
  return !r.ok;
}

export function createPeriodReopenHandler(dependencies: { repository?: PeriodClosesRepositoryPort | undefined }) {
  return async function periodReopenHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;
    if (!tenantId || !actorId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'PERIOD_CLOSES_REPOSITORY_UNAVAILABLE', message: 'El servicio de cierre de períodos no está disponible' });

    const { period } = request.params as { period: string };
    const result = await dependencies.repository.reopen(tenantId, period, actorId);

    if (isReopenPeriodError(result)) {
      if (result.reason === 'PERIOD_NOT_CLOSED') {
        return reply.code(409).send({ code: 'PERIOD_NOT_CLOSED', message: 'El período no está cerrado y no puede reabrirse' });
      }
      return reply.code(500).send({ code: 'PERIOD_REOPEN_FAILED', message: 'No se pudo reabrir el período' });
    }

    return reply.code(200).send(result.periodClose);
  };
}
