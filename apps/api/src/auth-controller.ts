import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuthService, type AuthSession } from './auth-service';

export const SESSION_COOKIE = 'anclora_session';
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(256) });

declare module 'fastify' {
  interface FastifyRequest {
    authSession: AuthSession | null;
  }
}

function ipHash(request: FastifyRequest): string {
  return createHash('sha256').update(request.ip).digest('hex');
}

export function readSession(request: FastifyRequest, auth: AuthService): AuthSession | null {
  const signed = request.cookies[SESSION_COOKIE];
  if (!signed) return null;
  const unsigned = request.unsignCookie(signed);
  return unsigned.valid && unsigned.value ? auth.decode(unsigned.value) : null;
}

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService): void {
  app.decorateRequest('authSession', null);
  app.addHook('preHandler', async (request) => {
    request.authSession = readSession(request, auth);
  });

  app.post('/api/v1/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: 'INVALID_LOGIN_INPUT', message: 'Correo o contraseña no válidos' });
    const session = await auth.login(parsed.data.email, parsed.data.password, ipHash(request));
    if (!session) return reply.code(401).send({ code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña no válidos' });
    reply.setCookie(SESSION_COOKIE, auth.encode(session), {
      path: '/', httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', signed: true, maxAge: session.expiresAt - Math.floor(Date.now() / 1000),
      ...(process.env.SESSION_COOKIE_DOMAIN ? { domain: process.env.SESSION_COOKIE_DOMAIN } : {}),
    });
    return { authenticated: true, actor: session };
  });

  app.get('/api/v1/session', async (request) => request.authSession
    ? { authenticated: true, actor: request.authSession }
    : { authenticated: false });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (request.authSession) {
      try {
        await auth.logout(request.authSession, ipHash(request));
      } catch (error) {
        request.log.error({ error: error instanceof Error ? error.message : 'unknown' }, 'Logout audit failed');
      }
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/', ...(process.env.SESSION_COOKIE_DOMAIN ? { domain: process.env.SESSION_COOKIE_DOMAIN } : {}) });
    return reply.code(204).send();
  });
}

export function requireAuthentication(request: FastifyRequest, reply: FastifyReply): AuthSession | undefined {
  if (!request.authSession) {
    void reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Debe iniciar sesión' });
    return undefined;
  }
  return request.authSession;
}
