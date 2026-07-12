import type { StoragePort } from '@anclora/core/server';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';

export interface VatDossier {
  id: string;
  tenantId: string;
  periodCloseId: string;
  schemaVersion: string;
  status: string;
  storageKey: string;
  archiveSha256: string;
  manifest: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}

export type GenerateVatDossierResult =
  | { ok: true; dossier: VatDossier; alreadyGenerated: boolean }
  | { ok: false; reason: 'PERIOD_NOT_CLOSED' }
  | { ok: false; reason: 'BLOCKING_ISSUES_REQUIRE_APPROVAL' };

export type GetVatDossierResult =
  | { ok: true; dossier: VatDossier }
  | { ok: false; reason: 'NOT_FOUND' };

export interface VatDossiersRepositoryPort {
  generate(input: {
    tenantId: string;
    period: string;
    actorId: string;
    storage: StoragePort;
    force?: boolean;
  }): Promise<GenerateVatDossierResult>;
  get(tenantId: string, period: string): Promise<GetVatDossierResult>;
}

// Roles allowed to force-regenerate an already-generated dossier. Checked
// here (not in the repository) per the task spec — the repository accepts
// `force` unconditionally, and role gating is purely a controller concern.
const FORCE_REGENERATE_ROLES = new Set(['ADMIN', 'REVIEWER']);

export function createVatDossierGenerateHandler(dependencies: {
  repository?: VatDossiersRepositoryPort | undefined;
  storage: StoragePort;
}) {
  return async function vatDossierGenerateHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    const actorId = request.authSession?.actorId;
    const role = request.authSession?.role;
    if (!tenantId || !actorId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'VAT_DOSSIERS_REPOSITORY_UNAVAILABLE', message: 'El servicio de expedientes de IVA no está disponible' });

    const { period } = request.params as { period: string };
    const { force } = request.query as { force?: string };
    const forceRequested = force === 'true' && !!role && FORCE_REGENERATE_ROLES.has(role);

    const result = await dependencies.repository.generate({
      tenantId,
      period,
      actorId,
      storage: dependencies.storage,
      force: forceRequested,
    });

    if (isGenerateVatDossierError(result)) {
      if (result.reason === 'PERIOD_NOT_CLOSED') {
        return reply.code(409).send({ code: 'PERIOD_NOT_CLOSED', message: 'El período no está cerrado y no puede generar un expediente de IVA' });
      }
      if (result.reason === 'BLOCKING_ISSUES_REQUIRE_APPROVAL') {
        return reply.code(409).send({ code: 'BLOCKING_ISSUES_REQUIRE_APPROVAL', message: 'Existen incidencias bloqueantes sin aprobación' });
      }
      return reply.code(500).send({ code: 'VAT_DOSSIER_GENERATE_FAILED', message: 'No se pudo generar el expediente de IVA' });
    }

    return reply.code(result.alreadyGenerated ? 200 : 201).send(result.dossier);
  };
}

function isGenerateVatDossierError(r: GenerateVatDossierResult): r is { ok: false; reason: 'PERIOD_NOT_CLOSED' | 'BLOCKING_ISSUES_REQUIRE_APPROVAL' } {
  return !r.ok;
}

export function createVatDossierGetHandler(dependencies: {
  repository?: VatDossiersRepositoryPort | undefined;
}) {
  return async function vatDossierGetHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'VAT_DOSSIERS_REPOSITORY_UNAVAILABLE', message: 'El servicio de expedientes de IVA no está disponible' });

    const { period } = request.params as { period: string };
    const result = await dependencies.repository.get(tenantId, period);

    if (!result.ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'No existe un expediente de IVA para este período' });

    const metadata = Object.fromEntries(
      Object.entries(result.dossier).filter(([key]) => key !== 'storageKey'),
    );
    return reply.code(200).send(metadata);
  };
}

function archiveFilename(period: string): string {
  return `expediente-iva-${period.replace(/[^A-Za-z0-9._-]+/g, '-')}.zip`;
}

export interface DossierIntegrityIncidentPort {
  report(input: { tenantId: string; dossierId: string; period: string; expectedSha256: string; actualSha256: string }): Promise<void>;
}

export function createVatDossierArchiveHandler(dependencies: {
  repository?: VatDossiersRepositoryPort | undefined;
  storage: StoragePort;
  integrityIncidents?: DossierIntegrityIncidentPort | undefined;
}) {
  return async function vatDossierArchiveHandler(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.authSession?.tenantId;
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    if (!dependencies.repository) return reply.code(503).send({ code: 'VAT_DOSSIERS_REPOSITORY_UNAVAILABLE', message: 'El servicio de expedientes de IVA no está disponible' });

    const { period } = request.params as { period: string };
    const result = await dependencies.repository.get(tenantId, period);
    if (!result.ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'No existe un expediente de IVA para este período' });

    const bytes = await dependencies.storage.get(result.dossier.storageKey);
    const actualSha256 = createHash('sha256').update(bytes).digest('hex');
    if (actualSha256 !== result.dossier.archiveSha256) {
      await dependencies.integrityIncidents?.report({
        tenantId,
        dossierId: result.dossier.id,
        period,
        expectedSha256: result.dossier.archiveSha256,
        actualSha256,
      });
      return reply.code(409).send({ code: 'DOSSIER_INTEGRITY_ERROR', message: 'La integridad del expediente no se puede verificar' });
    }

    return reply
      .header('content-disposition', `attachment; filename="${archiveFilename(period)}"`)
      .header('cache-control', 'private, no-store')
      .type('application/zip')
      .send(Buffer.from(bytes));
  };
}
