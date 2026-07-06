import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

const stateSchema = z.enum(['PROPOSED', 'AUTO_LINKED', 'CONFIRMED', 'REJECTED']);
const decisionSchema = z.object({ state: z.enum(['CONFIRMED', 'REJECTED']) }).strict();
const paramsSchema = z.object({ id: z.string().uuid() });

export interface ShopifyEvidenceLinkRecord {
  id: string;
  state: string;
  [key: string]: unknown;
}

export interface ShopifyEvidenceLinksRepositoryPort {
  list(input: { tenantId: string; state?: 'PROPOSED' | 'AUTO_LINKED' | 'CONFIRMED' | 'REJECTED' }): Promise<ShopifyEvidenceLinkRecord[]>;
  decide(tenantId: string, linkId: string, actorId: string, state: 'CONFIRMED' | 'REJECTED'): Promise<ShopifyEvidenceLinkRecord | null>;
}

export function createShopifyEvidenceLinksListHandler(repository?: ShopifyEvidenceLinksRepositoryPort) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!repository) return reply.code(503).send({ code: 'EVIDENCE_LINKS_REPOSITORY_UNAVAILABLE', message: 'El servicio de enlaces no está disponible' });
    const parsed = z.object({ state: stateSchema.optional() }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ code: 'INVALID_EVIDENCE_LINK_FILTER', message: 'Estado de enlace no válido' });
    return repository.list({ tenantId, ...(parsed.data.state ? { state: parsed.data.state } : {}) });
  };
}

export function createShopifyEvidenceLinkDecisionHandler(repository?: ShopifyEvidenceLinksRepositoryPort) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.authSession;
    if (!session) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!repository) return reply.code(503).send({ code: 'EVIDENCE_LINKS_REPOSITORY_UNAVAILABLE', message: 'El servicio de enlaces no está disponible' });
    const params = paramsSchema.safeParse(request.params);
    const body = decisionSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: 'INVALID_EVIDENCE_LINK_DECISION', message: 'Decisión de enlace no válida' });
    const result = await repository.decide(session.tenantId, params.data.id, session.actorId, body.data.state);
    if (!result) return reply.code(404).send({ code: 'EVIDENCE_LINK_NOT_FOUND', message: 'Enlace no encontrado o no decidible' });
    return result;
  };
}
