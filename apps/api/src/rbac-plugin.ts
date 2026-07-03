import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { can, roleSchema, type Role } from '@anclora/core';

/**
 * Stand-in role resolution.
 *
 * There is no real session/auth backing yet (see docs/known-limitations.md —
 * Phase 0 note). Until a real identity provider is wired, the caller's role
 * is read from the `x-anclora-role` request header. This is an explicit,
 * documented test-injectable mechanism, NOT a fabricated login system — it
 * exists purely so the already-implemented RBAC logic in `packages/core`
 * (`can()` / `roleSchema`) can be enforced at the API layer ahead of real
 * auth landing.
 */
const ROLE_HEADER = 'x-anclora-role';

function resolveRole(request: FastifyRequest): Role | null {
  // The header is a development/test stand-in only. Production must fail
  // closed until a verified session or identity provider supplies the role.
  if (process.env.NODE_ENV === 'production') return null;
  const header = request.headers[ROLE_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  const parsed = roleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Builds a Fastify preHandler that enforces the caller's role has at least
 * one of the given permissions, using the existing `can()` logic from
 * `packages/core` (see `packages/core/test/rbac.test.ts`). Responds 403 when
 * the role is missing, unrecognized, or lacks every required permission.
 *
 * Usage: attach directly as a route-level `preHandler`
 * (`{ preHandler: requireRole(['imports:write']) }`) rather than as a
 * Fastify instance decorator — `app.decorate()` only takes effect once the
 * encapsulated plugin has booted (after `app.ready()`), so a decorator
 * registered and consumed within the same `buildApp()` call is not
 * reliably available yet. A plain factory function sidesteps that
 * boot-ordering pitfall while still being reusable across routes.
 */
export function requireRole(permissions: readonly string[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const role = resolveRole(request);
    if (!role || !permissions.some((permission) => can(role, permission))) {
      return reply.code(403).send({ code: 'FORBIDDEN', message: 'No autorizado para esta acción' });
    }
  };
}
