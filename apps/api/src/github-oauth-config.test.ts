import { describe, expect, it } from 'vitest';
import { readGitHubOAuthConfig } from './github-oauth-config.js';

describe('GitHub OAuth configuration', () => {
  it('devuelve null cuando GitHub OAuth no está configurado', () => {
    expect(readGitHubOAuthConfig({})).toBeNull();
  });

  it('devuelve la configuración cuando las tres variables son válidas', () => {
    expect(
      readGitHubOAuthConfig({
        GITHUB_OAUTH_CLIENT_ID: 'github-client-id',
        GITHUB_OAUTH_CLIENT_SECRET: 'github-client-secret',
        GITHUB_OAUTH_CALLBACK_URL:
          'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/github/callback',
      }),
    ).toEqual({
      clientId: 'github-client-id',
      clientSecret: 'github-client-secret',
      callbackUrl:
        'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/github/callback',
    });
  });

  it('rechaza una configuración parcial', () => {
    expect(() =>
      readGitHubOAuthConfig({
        GITHUB_OAUTH_CLIENT_ID: 'github-client-id',
      }),
    ).toThrow();
  });

  it('rechaza una URL de callback no válida', () => {
    expect(() =>
      readGitHubOAuthConfig({
        GITHUB_OAUTH_CLIENT_ID: 'github-client-id',
        GITHUB_OAUTH_CLIENT_SECRET: 'github-client-secret',
        GITHUB_OAUTH_CALLBACK_URL: 'callback-invalido',
      }),
    ).toThrow();
  });
});
