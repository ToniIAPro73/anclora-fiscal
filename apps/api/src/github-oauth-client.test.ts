import { describe, expect, it, vi } from 'vitest';
import {
  resolveGitHubOAuthIdentity,
  type GitHubFetch,
} from './github-oauth-client.js';

const config = {
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

describe('GitHub OAuth client', () => {
  it('intercambia el código y devuelve una identidad verificada', async () => {
    const fetchMock = vi.fn<GitHubFetch>();

    fetchMock
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
          avatar_url: 'https://avatars.githubusercontent.com/u/123456',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            email: 'secondary@example.com',
            primary: false,
            verified: true,
            visibility: null,
          },
          {
            email: 'TONI@EXAMPLE.COM',
            primary: true,
            verified: true,
            visibility: 'private',
          },
        ]),
      );

    await expect(
      resolveGitHubOAuthIdentity(
        config,
        {
          code: 'temporary-code',
          codeVerifier: 'pkce-code-verifier',
        },
        fetchMock,
      ),
    ).resolves.toEqual({
      provider: 'github',
      providerAccountId: '123456',
      login: 'toniaipro73',
      email: 'toni@example.com',
      displayName: 'Toni',
      avatarUrl: 'https://avatars.githubusercontent.com/u/123456',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const tokenRequest = fetchMock.mock.calls[0];

    expect(tokenRequest?.[0]).toBe(
      'https://github.com/login/oauth/access_token',
    );

    expect(JSON.parse(String(tokenRequest?.[1]?.body))).toEqual({
      client_id: 'github-client-id',
      client_secret: 'github-client-secret',
      code: 'temporary-code',
      redirect_uri:
        'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/github/callback',
      code_verifier: 'pkce-code-verifier',
    });
  });

  it('rechaza una cuenta que no tenga ningún correo verificado', async () => {
    const fetchMock = vi.fn<GitHubFetch>();

    fetchMock
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
          login: 'sin-email',
          name: null,
          email: null,
          avatar_url: 'https://avatars.githubusercontent.com/u/123456',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            email: 'unverified@example.com',
            primary: true,
            verified: false,
            visibility: null,
          },
        ]),
      );

    await expect(
      resolveGitHubOAuthIdentity(
        config,
        {
          code: 'temporary-code',
          codeVerifier: 'pkce-code-verifier',
        },
        fetchMock,
      ),
    ).rejects.toThrow('GitHub account has no verified email');
  });

  it('no expone detalles sensibles cuando falla el intercambio', async () => {
    const fetchMock = vi.fn<GitHubFetch>().mockResolvedValue(
      jsonResponse(
        {
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired.',
        },
        400,
      ),
    );

    await expect(
      resolveGitHubOAuthIdentity(
        config,
        {
          code: 'invalid-code',
          codeVerifier: 'pkce-code-verifier',
        },
        fetchMock,
      ),
    ).rejects.toThrow('GitHub OAuth token exchange failed');
  });
});
