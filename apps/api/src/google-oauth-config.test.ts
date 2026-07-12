import { describe, expect, it } from 'vitest';
import { readGoogleOAuthConfig } from './google-oauth-config.js';

describe('Google OAuth configuration', () => {
  it('devuelve null cuando Google OAuth no está configurado', () => {
    expect(readGoogleOAuthConfig({})).toBeNull();
  });

  it('devuelve la configuración cuando las tres variables son válidas', () => {
    expect(
      readGoogleOAuthConfig({
        GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'google-client-secret',
        GOOGLE_OAUTH_CALLBACK_URL:
          'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/google/callback',
      }),
    ).toEqual({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      callbackUrl:
        'https://anclora-fiscal-web.vercel.app/api/v1/auth/oauth/google/callback',
    });
  });

  it('rechaza una configuración parcial', () => {
    expect(() =>
      readGoogleOAuthConfig({
        GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
      }),
    ).toThrow();
  });

  it('rechaza una URL de callback no válida', () => {
    expect(() =>
      readGoogleOAuthConfig({
        GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'google-client-secret',
        GOOGLE_OAUTH_CALLBACK_URL: 'callback-invalido',
      }),
    ).toThrow();
  });
});
