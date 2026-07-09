import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePagination } from './pagination.js';
import type { Paginated } from './pagination.js';

export interface VerifactuSubmissionListItem {
  id: string;
  tenantId: string;
  integrityRecordId: string;
  environment: string;
  status: string;
  payloadRedacted: unknown;
  responseRedacted: unknown | null;
  attemptCount: string;
  createdAt: Date;
  updatedAt: Date;
  fiscalDocumentId: string;
  fiscalDocumentNumber: string;
  documentType: string;
  issuedAt: Date;
  recordType: string;
  chainHash: string;
  previousHash: string | null;
}

export interface VerifactuSubmissionsRepositoryPort {
  list(input: {
    tenantId: string;
    page: number;
    pageSize: number;
    status?: string | undefined;
    environment?: string | undefined;
  }): Promise<Paginated<VerifactuSubmissionListItem>>;
}

export function createVerifactuSubmissionsListHandler(dependencies: {
  repository?: VerifactuSubmissionsRepositoryPort | undefined;
}) {
  return async function verifactuSubmissionsListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) {
      return reply.code(401).send({
        code: 'UNAUTHENTICATED',
        message: 'Debe iniciar sesión',
      });
    }

    if (!dependencies.repository) {
      return reply.code(503).send({
        code: 'VERIFACTU_SUBMISSIONS_REPOSITORY_UNAVAILABLE',
        message: 'El servicio de estados VERI*FACTU no está disponible',
      });
    }

    const { page, pageSize } = parsePagination(request.query);
    const query = request.query as { status?: string; environment?: string } | undefined;

    return dependencies.repository.list({
      tenantId,
      page,
      pageSize,
      status: query?.status,
      environment: query?.environment,
    });
  };
}
