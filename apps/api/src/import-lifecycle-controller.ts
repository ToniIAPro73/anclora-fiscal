import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  confirmImportJob,
  rejectImportJob,
  retryImportJob,
  type ImportConfirmRepositoryPort,
  type ImportJobFilePort,
  type ImportJobPort,
  type ImportIssuesPort,
  type ImportRejectRepositoryPort,
  type ImportRetryRepositoryPort,
  type ImportStorageReadPort,
} from './import-lifecycle-service.js';
import type { FiscalPersistencePort } from './import-preview-persistence.js';
import { toSafeImportPreview } from './import-service.js';

/** Combined port so build-app.ts only needs one repository option, matching the pattern of other single-repository controllers (issues-controller.ts). */
export interface ImportLifecycleRepositoryPort extends ImportJobPort, ImportIssuesPort, ImportConfirmRepositoryPort, ImportRejectRepositoryPort, ImportRetryRepositoryPort, ImportJobFilePort {}

function requireTenant(request: FastifyRequest, reply: FastifyReply): string | undefined {
  const tenantId = request.authSession?.tenantId;
  if (!tenantId) {
    reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    return undefined;
  }
  return tenantId;
}

export function createImportConfirmHandler(dependencies: {
  repository?: ImportLifecycleRepositoryPort | undefined;
  fiscalPersistence?: FiscalPersistencePort | undefined;
  storage?: ImportStorageReadPort | undefined;
}) {
  return async function importConfirmHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = requireTenant(request, reply);
    if (!tenantId) return;
    if (!dependencies.repository || !dependencies.fiscalPersistence || !dependencies.storage) {
      return reply.code(503).send({ code: 'IMPORT_REPOSITORY_UNAVAILABLE', message: 'El servicio de importación no está disponible' });
    }

    const { jobId } = request.params as { jobId: string };
    const body = (request.body ?? {}) as { acknowledgedIssueIds?: unknown };
    const acknowledgedIssueIds = Array.isArray(body.acknowledgedIssueIds) ? body.acknowledgedIssueIds.filter((id): id is string => typeof id === 'string') : [];

    const result = await confirmImportJob(
      { tenantId, jobId, acknowledgedIssueIds },
      {
        jobs: dependencies.repository,
        issues: dependencies.repository,
        confirm: dependencies.repository,
        jobFile: dependencies.repository,
        storage: dependencies.storage,
        fiscalPersistence: dependencies.fiscalPersistence,
      },
    );

    if (result.outcome === 'not_found') return reply.code(404).send({ code: 'IMPORT_JOB_NOT_FOUND', message: 'La importación no existe' });
    if (result.outcome === 'conflict') return reply.code(409).send({ code: 'IMPORT_JOB_NOT_CONFIRMABLE', message: 'La importación no está en un estado confirmable', status: result.status });
    if (result.outcome === 'blocking_issues') {
      return reply.code(422).send({ code: 'IMPORT_JOB_BLOCKING_ISSUES', message: 'Existen incidencias bloqueantes sin reconocer', unacknowledgedIssueIds: result.unacknowledgedIssueIds });
    }
    return { jobId, status: result.status, createdRecordIds: result.createdRecordIds };
  };
}

export function createImportRejectHandler(dependencies: { repository?: ImportLifecycleRepositoryPort | undefined }) {
  return async function importRejectHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = requireTenant(request, reply);
    if (!tenantId) return;
    if (!dependencies.repository) return reply.code(503).send({ code: 'IMPORT_REPOSITORY_UNAVAILABLE', message: 'El servicio de importación no está disponible' });

    const { jobId } = request.params as { jobId: string };
    const body = (request.body ?? {}) as { reason?: unknown };
    const reason = typeof body.reason === 'string' ? body.reason : undefined;

    const result = await rejectImportJob({ tenantId, jobId, reason }, { jobs: dependencies.repository, reject: dependencies.repository });

    if (result.outcome === 'not_found') return reply.code(404).send({ code: 'IMPORT_JOB_NOT_FOUND', message: 'La importación no existe' });
    if (result.outcome === 'conflict') return reply.code(409).send({ code: 'IMPORT_JOB_ALREADY_CONFIRMED', message: 'La importación ya fue confirmada', status: result.status });
    return { jobId, status: 'REJECTED' };
  };
}

export function createImportRetryHandler(dependencies: { repository?: ImportLifecycleRepositoryPort | undefined; storage?: ImportStorageReadPort | undefined }) {
  return async function importRetryHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = requireTenant(request, reply);
    if (!tenantId) return;
    if (!dependencies.repository || !dependencies.storage) return reply.code(503).send({ code: 'IMPORT_REPOSITORY_UNAVAILABLE', message: 'El servicio de importación no está disponible' });

    const { jobId } = request.params as { jobId: string };
    const actorId = request.authSession?.actorId;
    const body = (request.body ?? {}) as { reason?: unknown };
    const reason = typeof body.reason === 'string' ? body.reason : undefined;

    const result = await retryImportJob({ tenantId, jobId, actorId, reason }, { jobs: dependencies.repository, storage: dependencies.storage });

    if (result.outcome === 'not_found') return reply.code(404).send({ code: 'IMPORT_JOB_NOT_FOUND', message: 'La importación o el archivo no existen' });
    if (result.preview) return { ...toSafeImportPreview(result.preview, result.status), jobId };
    return { jobId, status: result.status, summary: result.summary, issues: result.issues };
  };
}
