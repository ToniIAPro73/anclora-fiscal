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

export interface VerifactuSubmissionAttemptItem {
  id: string;
  tenantId: string;
  verifactuSubmissionId: string;
  attemptNumber: string;
  status: string;
  responseRedacted: unknown;
  attemptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerifactuSubmissionsRepositoryPort {
  list(input: {
    tenantId: string;
    page: number;
    pageSize: number;
    status?: string | undefined;
    environment?: string | undefined;
  }): Promise<Paginated<VerifactuSubmissionListItem>>;

  listAttempts?(input: {
    tenantId: string;
    submissionId: string;
  }): Promise<VerifactuSubmissionAttemptItem[]>;
}

function unauthenticated(reply: FastifyReply) {
  return reply.code(401).send({
    code: 'UNAUTHENTICATED',
    message: 'Debe iniciar sesión',
  });
}

export function createVerifactuSubmissionsListHandler(dependencies: {
  repository?: VerifactuSubmissionsRepositoryPort | undefined;
}) {
  return async function verifactuSubmissionsListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return unauthenticated(reply);

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

export function createVerifactuSubmissionAttemptsListHandler(dependencies: {
  repository?: VerifactuSubmissionsRepositoryPort | undefined;
}) {
  return async function verifactuSubmissionAttemptsListHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return unauthenticated(reply);

    if (!dependencies.repository?.listAttempts) {
      return reply.code(503).send({
        code: 'VERIFACTU_SUBMISSION_ATTEMPTS_REPOSITORY_UNAVAILABLE',
        message: 'El historial de intentos VERI*FACTU no está disponible',
      });
    }

    const params = request.params as { submissionId?: string } | undefined;
    const submissionId = params?.submissionId?.trim();

    if (!submissionId) {
      return reply.code(400).send({
        code: 'VERIFACTU_SUBMISSION_ID_REQUIRED',
        message: 'Debe indicar el registro VERI*FACTU',
      });
    }

    const items = await dependencies.repository.listAttempts({
      tenantId,
      submissionId,
    });

    return { items };
  };
}
