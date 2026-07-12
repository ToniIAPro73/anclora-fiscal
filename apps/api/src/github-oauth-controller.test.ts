import { describe, expect, it, vi } from 'vitest';
import {
  AuthService,
  ConfiguredIdentityProvider,
  hashPassword,
} from './auth-service.js';
import { buildApp } from './build-app.js';
import type { GitHubFetch } from './github-oauth-client.js';

const actorId = '01977d43-75de-7000-8000-000000000020';
const tenantId = '01977d43-75de-7000-8000-000000000010';

const githubOAuthConfig = {
  clientId: 'github-client-id',
  clientSecret: 'github-client-secret',
  callbackUrl:
    'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/github/callback',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function readSetCookieHeaders(
  value: string | string[] | undefined,
): string[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function extractCookie(
  setCookieHeader: string | string[] | undefined,
  name: string,
): string {
  const cookie = readSetCookieHeaders(setCookieHeader)
    .flatMap((header) => header.split(/,(?=[^;,]+=)/))
    .map((header) => header.trim())
    .find((header) => header.startsWith(`${name}=`));

  if (!cookie) {
    throw new Error(`Cookie ${name} not found`);
  }

  return cookie.split(';', 1)[0]!;
}

async function createAuthService() {
  const passwordHash = await hashPassword(
    'unused-password',
    Buffer.alloc(16, 1),
  );

  const identities = new ConfiguredIdentityProvider(
    JSON.stringify([
      {
        actorId,
        tenantId,
        email: 'toni@example.com',
        displayName: 'Toni',
        role: 'ADMIN',
        passwordHash,
      },
    ]),
  );

  return new AuthService(identities, {
    record: vi.fn().mockResolvedValue(undefined),
  });
}

describe('GitHub OAuth HTTP routes', () => {
  it('completa el flujo y crea una sesión de Anclora Fiscal', async () => {
    const githubFetch = vi.fn<GitHubFetch>();

    githubFetch
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'github-access-token',
          token_type: 'bearer',
          scope: 'read:user,user:email',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 123456,
          login: 'toniaipro73',
          name: 'Toni',
          email: null,
          avatar_url:
            'https://avatars.githubusercontent.com/u/123456',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            email: 'toni@example.com',
            primary: true,
            verified: true,
            visibility: 'private',
          },
        ]),
      );

    const app = await buildApp({
      authService: await createAuthService(),
      githubOAuthConfig,
      githubFetch,
    });

    const startResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/github/start',
    });

    expect(startResponse.statusCode).toBe(302);

    const authorizationUrl = new URL(
      startResponse.headers.location!,
    );

    expect(authorizationUrl.origin).toBe('https://github.com');

    const state = authorizationUrl.searchParams.get('state');

    expect(state).toBeTruthy();

    const transactionCookie = extractCookie(
      startResponse.headers['set-cookie'],
      'anclora_github_oauth',
    );

    const callbackResponse = await app.inject({
      method: 'GET',
      url:
        '/api/v1/auth/oauth/github/callback' +
        `?code=temporary-code&state=${encodeURIComponent(state!)}`,
      headers: {
        cookie: transactionCookie,
      },
    });

    expect(callbackResponse.statusCode).toBe(302);
    expect(callbackResponse.headers.location).toBe('/');

    const sessionCookie = extractCookie(
      callbackResponse.headers['set-cookie'],
      'anclora_session',
    );

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/session',
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()).toMatchObject({
      authenticated: true,
      actor: {
        actorId,
        tenantId,
        email: 'toni@example.com',
        role: 'ADMIN',
      },
    });

    expect(githubFetch).toHaveBeenCalledTimes(3);

    await app.close();
  });

  it('rechaza un callback cuyo state no coincide', async () => {
    const githubFetch = vi.fn<GitHubFetch>();

    const app = await buildApp({
      authService: await createAuthService(),
      githubOAuthConfig,
      githubFetch,
    });

    const startResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/oauth/github/start',
    });

    const transactionCookie = extractCookie(
      startResponse.headers['set-cookie'],
      'anclora_github_oauth',
    );

    const callbackResponse = await app.inject({
      method: 'GET',
      url:
        '/api/v1/auth/oauth/github/callback' +
        '?code=temporary-code&state=state-falsificado',
      headers: {
        cookie: transactionCookie,
      },
    });

    expect(callbackResponse.statusCode).toBe(302);
    expect(callbackResponse.headers.location).toBe(
      '/auth/login?oauth=github_invalid_state',
    );
    expect(githubFetch).not.toHaveBeenCalled();

    await app.close();
  });
});
