import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePagination } from './pagination.js';
import type { Paginated } from './pagination.js';

export interface SifEventItem {
  id: string;
  tenantId: string;
  eventType: string;
  actor: string;
  detail: unknown;
  canonicalPayload: string;
  hash: string;
  previousHash: string | null;
  algorithm: string;
  occurredAt: Date;
  createdAt: Date;
}

export interface SifEventsRepositoryPort {
  list(input: { tenantId: string; page: number; pageSize: number }): Promise<Paginated<SifEventItem>>;
  verifyChain(tenantId: string): Promise<boolean>;
}

export function createSifEventsListHandler(dependencies: {
  repository?: SifEventsRepositoryPort | undefined;
}) {
  return async function sifEventsListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });

    if (!dependencies.repository) {
      return reply.code(503).send({
        code: 'SIF_EVENTS_REPOSITORY_UNAVAILABLE',
        message: 'El servicio de eventos SIF no está disponible',
      });
    }

    const { page, pageSize } = parsePagination(request.query);
    return dependencies.repository.list({ tenantId, page, pageSize });
  };
}

export function createSifEventsVerifyHandler(dependencies: {
  repository?: SifEventsRepositoryPort | undefined;
}) {
  return async function sifEventsVerifyHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });

    if (!dependencies.repository) {
      return reply.code(503).send({
        code: 'SIF_EVENTS_REPOSITORY_UNAVAILABLE',
        message: 'El servicio de eventos SIF no está disponible',
      });
    }

    const valid = await dependencies.repository.verifyChain(tenantId);
    return reply.code(200).send({ valid });
  };
}
