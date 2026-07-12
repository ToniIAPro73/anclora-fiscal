import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createGoogleAuthorizationUrl,
  createGoogleOAuthTransaction,
  googleOAuthStatesMatch,
} from './google-oauth-flow.js';

describe('Google OAuth flow', () => {
  it('genera state y PKCE criptográficamente válidos', () => {
    const transaction = createGoogleOAuthTransaction();

    expect(transaction.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(transaction.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(transaction.codeChallenge).toBe(
      createHash('sha256')
        .update(transaction.codeVerifier)
        .digest('base64url'),
    );
  });

  it('construye la URL de autorización de Google', () => {
    const authorizationUrl = createGoogleAuthorizationUrl(
      {
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
        callbackUrl:
          'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/google/callback',
      },
      {
        state: 'oauth-state',
        codeVerifier: 'oauth-code-verifier',
        codeChallenge: 'oauth-code-challenge',
      },
    );

    const parsedUrl = new URL(authorizationUrl);

    expect(parsedUrl.origin).toBe('https://accounts.google.com');
    expect(parsedUrl.pathname).toBe('/o/oauth2/v2/auth');
    expect(parsedUrl.searchParams.get('client_id')).toBe('google-client-id');
    expect(parsedUrl.searchParams.get('response_type')).toBe('code');
    expect(parsedUrl.searchParams.get('scope')).toBe('openid email profile');
    expect(parsedUrl.searchParams.get('state')).toBe('oauth-state');
    expect(parsedUrl.searchParams.get('code_challenge')).toBe(
      'oauth-code-challenge',
    );
    expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('compara el state sin aceptar valores diferentes o ausentes', () => {
    expect(googleOAuthStatesMatch('expected-state', 'expected-state')).toBe(
      true,
    );
    expect(googleOAuthStatesMatch('expected-state', 'different-state')).toBe(
      false,
    );
    expect(googleOAuthStatesMatch('expected-state', undefined)).toBe(false);
  });
});
