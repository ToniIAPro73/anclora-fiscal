import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GoogleOAuthConfig } from './google-oauth-config.js';

const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';

const GOOGLE_LOGIN_SCOPE = 'openid email profile';

export interface GoogleOAuthTransaction {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

function createRandomBase64Url(): string {
  return randomBytes(32).toString('base64url');
}

export function createGoogleOAuthTransaction(): GoogleOAuthTransaction {
  const state = createRandomBase64Url();
  const codeVerifier = createRandomBase64Url();
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return {
    state,
    codeVerifier,
    codeChallenge,
  };
}

export function createGoogleAuthorizationUrl(
  config: GoogleOAuthConfig,
  transaction: GoogleOAuthTransaction,
): string {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);

  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_LOGIN_SCOPE);
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('code_challenge', transaction.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'select_account');

  return url.toString();
}

export function googleOAuthStatesMatch(
  expectedState: string,
  receivedState: string | undefined,
): boolean {
  if (!receivedState) {
    return false;
  }

  const expected = Buffer.from(expectedState, 'utf8');
  const received = Buffer.from(receivedState, 'utf8');

  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}
