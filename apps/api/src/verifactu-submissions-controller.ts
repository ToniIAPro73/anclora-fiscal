import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePagination } from './pagination.js';
import type { Paginated } from './pagination.js';
import { diagnoseVerifactuFailure, type RemediationAction } from '@anclora/core/server';

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
  nextAttemptAt: string | null;
  lastError: string | null;
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
  recordRemediationAction?(input: { tenantId: string; submissionId: string; actorId: string; action: string; evidence: string }): Promise<boolean>;
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

    const result = await dependencies.repository.list({
      tenantId,
      page,
      pageSize,
      status: query?.status,
      environment: query?.environment,
    });
    return { ...result, items: result.items.map((item) => { const code = responseCode(item.responseRedacted); return { ...item, ...(['REJECTED','ACCEPTED_WITH_ERRORS','TECHNICAL_ERROR'].includes(item.status) ? { remediation: diagnoseVerifactuFailure({ status: item.status, ...(code ? { code } : {}), documentType: item.documentType }) } : {}) }; }) };
  };
}

function responseCode(value: unknown): string | undefined { if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined; const code = (value as Record<string, unknown>).code; return typeof code === 'string' ? code : undefined; }

const actions = new Set<RemediationAction>(['REVIEW_DATA','CREATE_RECTIFYING_R5','CREATE_REPLACEMENT_F3','RETRY_TECHNICAL','MANUAL_ADVISOR_REVIEW']);
export function createVerifactuRemediationHandler(dependencies: { repository?: VerifactuSubmissionsRepositoryPort | undefined }) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authSession?.tenantId; const actorId = request.authSession?.actorId;
    if (!tenantId || !actorId) return unauthenticated(reply);
    if (!dependencies.repository?.recordRemediationAction) return reply.code(503).send({ code: 'VERIFACTU_REMEDIATION_UNAVAILABLE' });
    const body = request.body as { action?: RemediationAction; evidence?: string };
    if (!body.action || !actions.has(body.action) || !body.evidence?.trim()) return reply.code(400).send({ code: 'INVALID_REMEDIATION_ACTION' });
    const recorded = await dependencies.repository.recordRemediationAction({ tenantId, actorId, submissionId: (request.params as { submissionId: string }).submissionId, action: body.action, evidence: body.evidence.trim() });
    if (!recorded) return reply.code(404).send({ code: 'SUBMISSION_NOT_REMEDIABLE' });
    return reply.code(202).send({ recorded: true, originalImmutable: true });
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
