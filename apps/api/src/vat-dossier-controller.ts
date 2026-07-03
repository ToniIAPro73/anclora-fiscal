import type { StoragePort } from '@anclora/core/server';
import type { FastifyReply, FastifyRequest } from 'fastify';

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

    if (!result.ok && result.reason === 'PERIOD_NOT_CLOSED') {
      return reply.code(409).send({ code: 'PERIOD_NOT_CLOSED', message: 'El período no está cerrado y no puede generar un expediente de IVA' });
    }
    if (!result.ok && result.reason === 'BLOCKING_ISSUES_REQUIRE_APPROVAL') {
      return reply.code(409).send({ code: 'BLOCKING_ISSUES_REQUIRE_APPROVAL', message: 'Existen incidencias bloqueantes sin aprobación' });
    }
    if (!result.ok) return reply.code(500).send({ code: 'VAT_DOSSIER_GENERATE_FAILED', message: 'No se pudo generar el expediente de IVA' });

    return reply.code(result.alreadyGenerated ? 200 : 201).send(result.dossier);
  };
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

    // StoragePort has no signed-URL mechanism (see packages/core/src/storage.ts) —
    // return the raw storageKey rather than inventing one. See docs/security.md
    // for the retrieval gap this leaves.
    return reply.code(200).send(result.dossier);
  };
}
