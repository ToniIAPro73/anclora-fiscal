import { createHash } from 'node:crypto';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { z } from 'zod';
import { AuthService, type AuthSession } from './auth-service.js';
import {
  resolveGitHubOAuthIdentity,
  type GitHubFetch,
} from './github-oauth-client.js';
import type { GitHubOAuthConfig } from './github-oauth-config.js';
import {
  createGitHubAuthorizationUrl,
  createGitHubOAuthTransaction,
  githubOAuthStatesMatch,
} from './github-oauth-flow.js';

export const SESSION_COOKIE = 'anclora_session';

const GITHUB_OAUTH_TRANSACTION_COOKIE = 'anclora_github_oauth';
const GITHUB_OAUTH_TRANSACTION_TTL_SECONDS = 10 * 60;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
});

const githubOAuthCallbackSchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

const githubOAuthTransactionSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

interface AuthRoutesOptions {
  githubOAuthConfig?: GitHubOAuthConfig | null;
  githubFetch?: GitHubFetch;
}

declare module 'fastify' {
  interface FastifyRequest {
    authSession: AuthSession | null;
  }
}

function ipHash(request: FastifyRequest): string {
  return createHash('sha256').update(request.ip).digest('hex');
}

function productionCookieOptions() {
  return {
    secure: process.env.NODE_ENV === 'production',
    ...(process.env.SESSION_COOKIE_DOMAIN
      ? { domain: process.env.SESSION_COOKIE_DOMAIN }
      : {}),
  };
}

function setSessionCookie(
  reply: FastifyReply,
  auth: AuthService,
  session: AuthSession,
): void {
  reply.setCookie(SESSION_COOKIE, auth.encode(session), {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    signed: true,
    maxAge: session.expiresAt - Math.floor(Date.now() / 1000),
    ...productionCookieOptions(),
  });
}

function encodeGitHubOAuthTransaction(
  transaction: z.infer<typeof githubOAuthTransactionSchema>,
): string {
  return Buffer.from(JSON.stringify(transaction)).toString('base64url');
}

function decodeGitHubOAuthTransaction(
  request: FastifyRequest,
): z.infer<typeof githubOAuthTransactionSchema> | null {
  const signedCookie = request.cookies[GITHUB_OAUTH_TRANSACTION_COOKIE];

  if (!signedCookie) {
    return null;
  }

  const unsignedCookie = request.unsignCookie(signedCookie);

  if (!unsignedCookie.valid || !unsignedCookie.value) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(unsignedCookie.value, 'base64url').toString('utf8'),
    );

    const parsed = githubOAuthTransactionSchema.safeParse(decoded);

    if (
      !parsed.success ||
      parsed.data.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function setGitHubOAuthTransactionCookie(
  reply: FastifyReply,
  transaction: z.infer<typeof githubOAuthTransactionSchema>,
): void {
  reply.setCookie(
    GITHUB_OAUTH_TRANSACTION_COOKIE,
    encodeGitHubOAuthTransaction(transaction),
    {
      path: '/api/v1/auth/oauth/github',
      httpOnly: true,
      sameSite: 'lax',
      signed: true,
      maxAge: GITHUB_OAUTH_TRANSACTION_TTL_SECONDS,
      secure: process.env.NODE_ENV === 'production',
    },
  );
}

function clearGitHubOAuthTransactionCookie(reply: FastifyReply): void {
  reply.clearCookie(GITHUB_OAUTH_TRANSACTION_COOKIE, {
    path: '/api/v1/auth/oauth/github',
  });
}

function oauthFailureRedirect(
  reason:
    | 'github_cancelled'
    | 'github_invalid_state'
    | 'github_not_authorized'
    | 'github_error',
): string {
  return `/auth/login?oauth=${reason}`;
}

export function readSession(
  request: FastifyRequest,
  auth: AuthService,
): AuthSession | null {
  const signed = request.cookies[SESSION_COOKIE];

  if (!signed) {
    return null;
  }

  const unsigned = request.unsignCookie(signed);

  return unsigned.valid && unsigned.value
    ? auth.decode(unsigned.value)
    : null;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthService,
  options: AuthRoutesOptions = {},
): void {
  app.decorateRequest('authSession', null);

  app.addHook('preHandler', async (request) => {
    request.authSession = readSession(request, auth);
  });

  app.post(
    '/api/v1/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          code: 'INVALID_LOGIN_INPUT',
          message: 'Correo o contraseña no válidos',
        });
      }

      const session = await auth.login(
        parsed.data.email,
        parsed.data.password,
        ipHash(request),
      );

      if (!session) {
        return reply.code(401).send({
          code: 'INVALID_CREDENTIALS',
          message: 'Correo o contraseña no válidos',
        });
      }

      setSessionCookie(reply, auth, session);

      return {
        authenticated: true,
        actor: session,
      };
    },
  );

  app.get(
    '/api/v1/auth/oauth/github/start',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
        },
      },
    },
    async (_request, reply) => {
      const config = options.githubOAuthConfig;

      if (!config) {
        return reply.code(503).send({
          code: 'GITHUB_OAUTH_NOT_CONFIGURED',
          message: 'El acceso mediante GitHub no está disponible',
        });
      }

      const transaction = createGitHubOAuthTransaction();
      const expiresAt =
        Math.floor(Date.now() / 1000) +
        GITHUB_OAUTH_TRANSACTION_TTL_SECONDS;

      setGitHubOAuthTransactionCookie(reply, {
        state: transaction.state,
        codeVerifier: transaction.codeVerifier,
        expiresAt,
      });

      return reply.redirect(
        createGitHubAuthorizationUrl(config, transaction),
      );
    },
  );

  app.get(
    '/api/v1/auth/oauth/github/callback',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      clearGitHubOAuthTransactionCookie(reply);

      const config = options.githubOAuthConfig;

      if (!config) {
        return reply.redirect(oauthFailureRedirect('github_error'));
      }

      const callback = githubOAuthCallbackSchema.safeParse(request.query);

      if (!callback.success) {
        return reply.redirect(oauthFailureRedirect('github_error'));
      }

      if (callback.data.error) {
        return reply.redirect(oauthFailureRedirect('github_cancelled'));
      }

      const transaction = decodeGitHubOAuthTransaction(request);

      if (
        !transaction ||
        !callback.data.code ||
        !githubOAuthStatesMatch(
          transaction.state,
          callback.data.state,
        )
      ) {
        return reply.redirect(
          oauthFailureRedirect('github_invalid_state'),
        );
      }

      try {
        const identity = await resolveGitHubOAuthIdentity(
          config,
          {
            code: callback.data.code,
            codeVerifier: transaction.codeVerifier,
          },
          options.githubFetch,
        );

        const githubEmailHash = createHash('sha256')
          .update(identity.email.trim().toLowerCase())
          .digest('hex');

        request.log.info(
          { githubEmailHash },
          'GitHub OAuth identity resolved',
        );

        const session = await auth.loginWithExternalIdentity(
          {
            provider: identity.provider,
            providerAccountId: identity.providerAccountId,
            email: identity.email,
          },
          ipHash(request),
        );

        if (!session) {
          return reply.redirect(
            oauthFailureRedirect('github_not_authorized'),
          );
        }

        setSessionCookie(reply, auth, session);

        return reply.redirect('/');
      } catch (error) {
        request.log.warn(
          {
            error:
              error instanceof Error
                ? error.message
                : 'unknown GitHub OAuth error',
          },
          'GitHub OAuth callback failed',
        );

        return reply.redirect(oauthFailureRedirect('github_error'));
      }
    },
  );

  app.get('/api/v1/session', async (request) =>
    request.authSession
      ? {
          authenticated: true,
          actor: request.authSession,
        }
      : {
          authenticated: false,
        },
  );

  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (request.authSession) {
      try {
        await auth.logout(request.authSession, ipHash(request));
      } catch (error) {
        request.log.error(
          {
            error:
              error instanceof Error
                ? error.message
                : 'unknown',
          },
          'Logout audit failed',
        );
      }
    }

    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      ...(process.env.SESSION_COOKIE_DOMAIN
        ? { domain: process.env.SESSION_COOKIE_DOMAIN }
        : {}),
    });

    return reply.code(204).send();
  });
}

export function requireAuthentication(
  request: FastifyRequest,
  reply: FastifyReply,
): AuthSession | undefined {
  if (!request.authSession) {
    void reply.code(401).send({
      code: 'UNAUTHENTICATED',
      message: 'Debe iniciar sesión',
    });

    return undefined;
  }

  return request.authSession;
}
