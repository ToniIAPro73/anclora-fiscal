import { describe, expect, it, vi } from 'vitest';
import {
  resolveGoogleOAuthIdentity,
  type GoogleFetch,
} from './google-oauth-client.js';

const config = {
  clientId: 'google-client-id',
  clientSecret: 'google-client-secret',
  callbackUrl:
    'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/google/callback',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

describe('Google OAuth client', () => {
  it('intercambia el código y devuelve una identidad verificada', async () => {
    const fetchMock = vi.fn<GoogleFetch>();

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'google-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid email profile',
          id_token: 'google-id-token',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          sub: 'google-account-id',
          email: 'TONI@EXAMPLE.COM',
          email_verified: true,
          name: 'Toni',
          picture: 'https://example.com/avatar.png',
        }),
      );

    await expect(
      resolveGoogleOAuthIdentity(
        config,
        {
          code: 'temporary-code',
          codeVerifier: 'pkce-code-verifier',
        },
        fetchMock,
      ),
    ).resolves.toEqual({
      provider: 'google',
      providerAccountId: 'google-account-id',
      email: 'toni@example.com',
      displayName: 'Toni',
      avatarUrl: 'https://example.com/avatar.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const tokenRequest = fetchMock.mock.calls[0];
    expect(tokenRequest?.[0]).toBe('https://oauth2.googleapis.com/token');
    expect(tokenRequest?.[1]?.body).toBeInstanceOf(URLSearchParams);

    const tokenBody = tokenRequest?.[1]?.body as URLSearchParams;
    expect(Object.fromEntries(tokenBody.entries())).toEqual({
      client_id: 'google-client-id',
      client_secret: 'google-client-secret',
      code: 'temporary-code',
      redirect_uri:
        'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/google/callback',
      grant_type: 'authorization_code',
      code_verifier: 'pkce-code-verifier',
    });
  });

  it('rechaza una cuenta cuyo correo no esté verificado', async () => {
    const fetchMock = vi.fn<GoogleFetch>();

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'google-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          sub: 'google-account-id',
          email: 'unverified@example.com',
          email_verified: false,
        }),
      );

    await expect(
      resolveGoogleOAuthIdentity(
        config,
        {
          code: 'temporary-code',
          codeVerifier: 'pkce-code-verifier',
        },
        fetchMock,
      ),
    ).rejects.toThrow('Google account email is not verified');
  });

  it('no expone detalles sensibles cuando falla el intercambio', async () => {
    const fetchMock = vi.fn<GoogleFetch>().mockResolvedValue(
      jsonResponse(
        {
          error: 'invalid_grant',
          error_description: 'The code is incorrect or expired.',
        },
        400,
      ),
    );

    await expect(
      resolveGoogleOAuthIdentity(
        config,
        {
          code: 'invalid-code',
          codeVerifier: 'pkce-code-verifier',
        },
        fetchMock,
      ),
    ).rejects.toThrow('Google OAuth token exchange failed');
  });
});
