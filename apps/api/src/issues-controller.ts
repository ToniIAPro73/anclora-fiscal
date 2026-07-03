import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePagination } from './pagination.js';
import type { Paginated } from './pagination.js';

export interface Issue {
  id: string;
  tenantId: string;
  canonicalOperationId: string | null;
  code: string;
  severity: string;
  status: string;
  title: string;
  explanation: string;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export interface IssuesRepositoryPort {
  list(input: { tenantId: string; page: number; pageSize: number; status?: string | undefined; severity?: string | undefined }): Promise<Paginated<Issue>>;
  resolve(tenantId: string, issueId: string, actorId: string): Promise<Issue | null>;
}

export function createIssuesListHandler(dependencies: { repository?: IssuesRepositoryPort | undefined }) {
  return async function issuesListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'ISSUES_REPOSITORY_UNAVAILABLE', message: 'El servicio de incidencias no está disponible' });

    const { page, pageSize } = parsePagination(request.query);
    const query = request.query as { status?: string; severity?: string } | undefined;

    return dependencies.repository.list({ tenantId, page, pageSize, status: query?.status, severity: query?.severity });
  };
}

export function createIssueResolveHandler(dependencies: { repository?: IssuesRepositoryPort | undefined }) {
  return async function issueResolveHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;
    if (!tenantId || !actorId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'ISSUES_REPOSITORY_UNAVAILABLE', message: 'El servicio de incidencias no está disponible' });

    const { id } = request.params as { id: string };
    const issue = await dependencies.repository.resolve(tenantId, id, actorId);
    if (!issue) return reply.code(404).send({ code: 'ISSUE_NOT_FOUND', message: 'La incidencia no existe' });

    return issue;
  };
}
