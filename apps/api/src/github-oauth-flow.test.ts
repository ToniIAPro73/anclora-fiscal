import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createGitHubAuthorizationUrl,
  createGitHubOAuthTransaction,
  githubOAuthStatesMatch,
} from './github-oauth-flow.js';

describe('GitHub OAuth flow', () => {
  it('genera state y PKCE criptográficamente válidos', () => {
    const transaction = createGitHubOAuthTransaction();

    expect(transaction.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(transaction.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const expectedChallenge = createHash('sha256')
      .update(transaction.codeVerifier)
      .digest('base64url');

    expect(transaction.codeChallenge).toBe(expectedChallenge);
  });

  it('construye la URL de autorización de GitHub', () => {
    const authorizationUrl = createGitHubAuthorizationUrl(
      {
        clientId: 'github-client-id',
        clientSecret: 'github-client-secret',
        callbackUrl:
          'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/github/callback',
      },
      {
        state: 'oauth-state',
        codeVerifier: 'oauth-code-verifier',
        codeChallenge: 'oauth-code-challenge',
      },
    );

    const parsedUrl = new URL(authorizationUrl);

    expect(parsedUrl.origin).toBe('https://github.com');
    expect(parsedUrl.pathname).toBe('/login/oauth/authorize');
    expect(parsedUrl.searchParams.get('client_id')).toBe(
      'github-client-id',
    );
    expect(parsedUrl.searchParams.get('redirect_uri')).toBe(
      'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/github/callback',
    );
    expect(parsedUrl.searchParams.get('scope')).toBe(
      'read:user user:email',
    );
    expect(parsedUrl.searchParams.get('state')).toBe('oauth-state');
    expect(parsedUrl.searchParams.get('code_challenge')).toBe(
      'oauth-code-challenge',
    );
    expect(parsedUrl.searchParams.get('code_challenge_method')).toBe(
      'S256',
    );
  });

  it('compara el state sin aceptar valores diferentes o ausentes', () => {
    expect(githubOAuthStatesMatch('expected-state', 'expected-state')).toBe(
      true,
    );
    expect(githubOAuthStatesMatch('expected-state', 'different-state')).toBe(
      false,
    );
    expect(githubOAuthStatesMatch('expected-state', undefined)).toBe(false);
  });
});
