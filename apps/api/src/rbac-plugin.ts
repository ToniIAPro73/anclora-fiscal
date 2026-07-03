import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { can } from '@anclora/core';

/**
 * Builds a Fastify preHandler that enforces the caller's role has at least
 * one of the given permissions, using the existing `can()` logic from
 * `packages/core` (see `packages/core/test/rbac.test.ts`). The role comes only
 * from the verified signed session. Missing sessions return 401 and
 * insufficient permissions return 403.
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
    const role = request.authSession?.role;
    if (!role || !permissions.some((permission) => can(role, permission))) {
      return reply.code(role ? 403 : 401).send({ code: role ? 'FORBIDDEN' : 'UNAUTHENTICATED', message: role ? 'No autorizado para esta acción' : 'Debe iniciar sesión' });
    }
  };
}
