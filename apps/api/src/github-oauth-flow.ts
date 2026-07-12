import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GitHubOAuthConfig } from './github-oauth-config.js';

const GITHUB_AUTHORIZATION_ENDPOINT =
  'https://github.com/login/oauth/authorize';

const GITHUB_LOGIN_SCOPE = 'read:user user:email';

export interface GitHubOAuthTransaction {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

function createRandomBase64Url(): string {
  return randomBytes(32).toString('base64url');
}

export function createGitHubOAuthTransaction(): GitHubOAuthTransaction {
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

export function createGitHubAuthorizationUrl(
  config: GitHubOAuthConfig,
  transaction: GitHubOAuthTransaction,
): string {
  const url = new URL(GITHUB_AUTHORIZATION_ENDPOINT);

  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('scope', GITHUB_LOGIN_SCOPE);
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('code_challenge', transaction.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

export function githubOAuthStatesMatch(
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
